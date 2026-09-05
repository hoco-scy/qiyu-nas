"""Private, single-worker media collection service for Qiyu NAS.

It intentionally has no public port.  The Qiyu portal is the only client on
the Docker network, and is responsible for authenticating each request.
"""

from __future__ import annotations

import base64
import html
import http.client
import ipaddress
import json
import os
import queue
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.parse
import uuid
from datetime import UTC, datetime
from html.parser import HTMLParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


STORAGE_ROOT = Path(os.environ.get("STORAGE_ROOT", "/storage"))
CONFIG_ROOT = Path(os.environ.get("CONFIG_ROOT", "/config"))
STATE_PATH = CONFIG_ROOT / "jobs.json"
MAX_FILESIZE = os.environ.get("COLLECTOR_MAX_FILESIZE", "10G")
try:
    MAX_VIDEO_HEIGHT = min(2160, max(144, int(os.environ.get("COLLECTOR_MAX_HEIGHT", "1440"))))
except ValueError:
    MAX_VIDEO_HEIGHT = 1440
MAX_HISTORY = 40
DESTINATIONS = {
    "videos": STORAGE_ROOT / "media" / "Videos",
    "audio": STORAGE_ROOT / "media" / "Audio",
    # Retain these locations for historical task records. New jobs no longer
    # ask people to decide whether a download is a film or a television show.
    "movies": STORAGE_ROOT / "media" / "Movies",
    "shows": STORAGE_ROOT / "media" / "Shows",
    "inbox": STORAGE_ROOT / "media" / "Inbox",
}
PROGRESS = re.compile(r"\[download\]\s+([0-9]+(?:\.[0-9]+)?)%")
OUTPUT_FILE = re.compile(r"^FILE=(.+)$")
MAX_INSPECT_CANDIDATES = 16
MAX_INSPECT_SECONDS = 14
MIN_INSPECT_SETTLE_SECONDS = 7
MAX_INSPECT_REQUESTS = 96
MAX_INSPECT_HTML = 1_000_000
MEDIA_EXTENSIONS = {
    ".3gp": "video", ".aac": "audio", ".flac": "audio", ".m3u8": "video",
    ".m4a": "audio", ".m4v": "video", ".mkv": "video", ".mov": "video",
    ".mp3": "audio", ".mp4": "video", ".mpeg": "video", ".mpg": "video",
    ".oga": "audio", ".ogg": "audio", ".opus": "audio", ".ts": "video",
    ".wav": "audio", ".webm": "video",
}
MEDIA_URL_PATTERN = re.compile(
    r"(?:(?:https?:)?//|/|\./|\.\./)[^\"'<>\s]{0,2048}?\.(?:3gp|aac|flac|m3u8|m4a|m4v|mkv|mov|mp3|mp4|mpeg|mpg|oga|ogg|opus|ts|wav|webm)(?:\?[^\"'<>\s]*)?",
    re.IGNORECASE,
)
MEDIA_META_KEYS = {
    "og:audio", "og:audio:secure_url", "og:video", "og:video:secure_url",
    "og:video:url", "twitter:player:stream", "twitter:player:stream:url",
}

jobs: dict[str, dict[str, Any]] = {}
pending: queue.Queue[str] = queue.Queue()
lock = threading.RLock()


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def save_jobs() -> None:
    """Write state atomically so a power interruption never leaves invalid JSON."""
    CONFIG_ROOT.mkdir(parents=True, exist_ok=True)
    payload = {"jobs": list(jobs.values())}
    temporary = STATE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(STATE_PATH)


def load_jobs() -> None:
    if not STATE_PATH.exists():
        return
    try:
        recovered = False
        saved = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        entries = saved.get("jobs", []) if isinstance(saved, dict) else []
        if not isinstance(entries, list):
            return
        for item in entries:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                continue
            if item.get("status") in {"queued", "running"}:
                item["status"] = "interrupted"
                item["message"] = "采集服务已重启，未完成任务请重新提交。"
                item["updatedAt"] = now()
                recovered = True
            jobs[item["id"]] = item
        if recovered:
            save_jobs()
    except (OSError, ValueError, TypeError):
        # A missing or manually removed history is not a reason to prevent the
        # media collector from starting.
        return


def public_url(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("请填写媒体链接")
    candidate = value.strip()
    if not candidate or len(candidate) > 2048:
        raise ValueError("链接为空或过长")
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("仅支持 HTTP 或 HTTPS 的公开链接")
    if parsed.username or parsed.password:
        raise ValueError("链接不能包含账号或密码")

    hostname = parsed.hostname.rstrip(".").lower()
    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".local"):
        raise ValueError("不允许访问本机或局域网地址")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)}
    except socket.gaierror as error:
        raise ValueError("无法解析这个链接的域名") from error
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("不允许访问本机、局域网或保留地址")
    return candidate


def media_kind(value: str, mime_type: str = "") -> str | None:
    parsed = urllib.parse.urlparse(value)
    extension = Path(parsed.path).suffix.lower()
    if extension in MEDIA_EXTENSIONS:
        return MEDIA_EXTENSIONS[extension]
    mime = mime_type.lower().split(";", 1)[0].strip()
    if mime.startswith("audio/"):
        return "audio"
    if mime.startswith("video/") or mime in {
        "application/dash+xml", "application/vnd.apple.mpegurl", "application/x-mpegurl",
    }:
        return "video"
    return None


class MediaMarkupParser(HTMLParser):
    """Extract explicit media declarations from the post-render document."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.values: list[tuple[str, str]] = []
        self.json_ld: list[str] = []
        self.in_json_ld = False

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        attrs = {key.lower(): value for key, value in attributes if value}
        if tag in {"video", "audio", "source"}:
            for key in ("src", "data-src"):
                if attrs.get(key):
                    self.values.append((attrs[key] or "", "页面媒体标签"))
        if tag == "meta":
            key = (attrs.get("property") or attrs.get("name") or attrs.get("itemprop") or "").lower()
            if key in MEDIA_META_KEYS and attrs.get("content"):
                self.values.append((attrs["content"] or "", "页面媒体元数据"))
        if tag == "script" and (attrs.get("type") or "").lower() == "application/ld+json":
            self.in_json_ld = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.in_json_ld = False

    def handle_data(self, data: str) -> None:
        if self.in_json_ld:
            self.json_ld.append(data)


def json_ld_media_values(value: Any) -> list[str]:
    values: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in {"contenturl", "embedurl", "encoding", "associatedmedia"} and isinstance(item, str):
                values.append(item)
            values.extend(json_ld_media_values(item))
    elif isinstance(value, list):
        for item in value:
            values.extend(json_ld_media_values(item))
    return values


class DevToolsSocket:
    """Small CDP client kept dependency-free for the isolated collector image."""

    def __init__(self, endpoint: str) -> None:
        parsed = urllib.parse.urlparse(endpoint)
        if parsed.scheme != "ws" or not parsed.hostname or not parsed.port:
            raise RuntimeError("浏览器调试接口无效")
        self.connection = socket.create_connection((parsed.hostname, parsed.port), timeout=3)
        self.connection.settimeout(1)
        self._buffer = bytearray()
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        path = (parsed.path or "/") + (f"?{parsed.query}" if parsed.query else "")
        request = (
            f"GET {path} HTTP/1.1\r\nHost: {parsed.hostname}:{parsed.port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        ).encode("ascii")
        self.connection.sendall(request)
        response = self._read_headers()
        if b" 101 " not in response.split(b"\r\n", 1)[0]:
            raise RuntimeError("无法连接无头浏览器")
        self.next_id = 1

    def _read_headers(self) -> bytes:
        response = bytearray()
        while b"\r\n\r\n" not in response:
            chunk = self.connection.recv(1024)
            if not chunk:
                raise RuntimeError("无头浏览器提前关闭")
            response.extend(chunk)
            if len(response) > 32_768:
                raise RuntimeError("无头浏览器响应无效")
        header_end = response.index(b"\r\n\r\n") + 4
        self._buffer.extend(response[header_end:])
        return bytes(response[:header_end])

    def _read_exact(self, size: int) -> bytes:
        payload = bytearray()
        if self._buffer:
            consumed = min(size, len(self._buffer))
            payload.extend(self._buffer[:consumed])
            del self._buffer[:consumed]
        while len(payload) < size:
            chunk = self.connection.recv(size - len(payload))
            if not chunk:
                raise RuntimeError("无头浏览器连接中断")
            payload.extend(chunk)
        return bytes(payload)

    def _write_frame(self, opcode: int, payload: bytes) -> None:
        length = len(payload)
        header = bytearray([0x80 | opcode])
        if length < 126:
            header.append(0x80 | length)
        elif length < 65_536:
            header.extend([0x80 | 126])
            header.extend(length.to_bytes(2, "big"))
        else:
            header.extend([0x80 | 127])
            header.extend(length.to_bytes(8, "big"))
        mask = os.urandom(4)
        header.extend(mask)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.connection.sendall(bytes(header) + masked)

    def send(self, method: str, params: dict[str, Any] | None = None) -> int:
        command_id = self.next_id
        self.next_id += 1
        payload = {"id": command_id, "method": method}
        if params:
            payload["params"] = params
        self._write_frame(0x1, json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        return command_id

    def receive(self) -> dict[str, Any]:
        first, second = self._read_exact(2)
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = int.from_bytes(self._read_exact(2), "big")
        elif length == 127:
            length = int.from_bytes(self._read_exact(8), "big")
        if length > 4_000_000:
            raise RuntimeError("浏览器调试消息过大")
        mask = self._read_exact(4) if masked else b""
        payload = self._read_exact(length)
        if masked:
            payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        if opcode == 0x8:
            raise RuntimeError("无头浏览器连接已关闭")
        if opcode == 0x9:
            self._write_frame(0xA, payload)
            return self.receive()
        if opcode != 0x1:
            return self.receive()
        return json.loads(payload.decode("utf-8"))

    def call(self, method: str, params: dict[str, Any] | None = None, handler: Any = None, timeout: float = 4) -> dict[str, Any]:
        command_id = self.send(method, params)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                message = self.receive()
            except socket.timeout:
                continue
            if message.get("id") == command_id:
                if "error" in message:
                    raise RuntimeError(message["error"].get("message", "浏览器命令失败"))
                return message.get("result", {})
            if handler:
                handler(message)
        raise RuntimeError("无头浏览器响应超时")

    def close(self) -> None:
        try:
            self._write_frame(0x8, b"")
        except OSError:
            pass
        self.connection.close()


def browser_endpoint(port: int, process: subprocess.Popen[str]) -> str:
    deadline = time.monotonic() + 6
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("无头浏览器未能启动")
        try:
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            connection.request("GET", "/json/list")
            response = connection.getresponse()
            targets = json.loads(response.read())
            connection.close()
            for target in targets:
                if target.get("type") == "page" and target.get("webSocketDebuggerUrl"):
                    return str(target["webSocketDebuggerUrl"])
        except (OSError, ValueError, http.client.HTTPException):
            pass
        time.sleep(0.15)
    raise RuntimeError("无头浏览器启动超时")


def chrome_binary() -> str:
    for name in ("chromium-browser", "chromium"):
        if path := shutil.which(name):
            return path
    raise ValueError("资源嗅探器尚未安装 Chromium")


def browser_environment(profile_root: Path) -> tuple[Path, dict[str, str]]:
    """Create an empty Chromium home and trust only the image's extra CA.

    Chromium needs a writable HOME for Crashpad even though its profile is
    temporary. It uses NSS for user-added trust roots, so import the optional
    build-time CA there rather than weakening TLS with an ignore-errors flag.
    """
    browser_home = profile_root / "home"
    config_home = browser_home / "config"
    cache_home = browser_home / "cache"
    nss_db = browser_home / ".pki" / "nssdb"
    for directory in (browser_home, config_home, cache_home, nss_db):
        directory.mkdir(parents=True, exist_ok=True)

    certificate = Path("/usr/local/share/ca-certificates/qiyu-build-extra-root.crt")
    certutil = shutil.which("certutil")
    if certificate.is_file() and certutil:
        database = f"sql:{nss_db}"
        subprocess.run(
            [certutil, "-N", "--empty-password", "-d", database],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        subprocess.run(
            [certutil, "-A", "-d", database, "-n", "qiyu-network-root", "-t", "C,,", "-i", str(certificate)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    environment = {
        **os.environ,
        "HOME": str(browser_home),
        "XDG_CONFIG_HOME": str(config_home),
        "XDG_CACHE_HOME": str(cache_home),
    }
    return profile_root / "chrome", environment


def inspect_page(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("acknowledged") is not True:
        raise ValueError("请确认你拥有查看和保存该公开内容的权利")
    source = public_url(payload.get("url"))
    candidates: list[dict[str, str]] = []
    seen: set[str] = set()

    def add_candidate(value: Any, label: str, mime_type: str = "", require_media_shape: bool = False) -> None:
        if len(candidates) >= MAX_INSPECT_CANDIDATES or not isinstance(value, str):
            return
        candidate = urllib.parse.urljoin(source, html.unescape(value.strip()))
        kind = media_kind(candidate, mime_type)
        if not kind or (require_media_shape and not media_kind(candidate)):
            return
        try:
            candidate = public_url(candidate)
        except ValueError:
            return
        if candidate in seen:
            return
        seen.add(candidate)
        candidates.append({"url": candidate, "kind": kind, "label": label})

    port_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    port_socket.bind(("127.0.0.1", 0))
    port = port_socket.getsockname()[1]
    port_socket.close()

    with tempfile.TemporaryDirectory(prefix="qiyu-sniff-") as temporary_root:
        profile, environment = browser_environment(Path(temporary_root))
        process = subprocess.Popen(
            [
                chrome_binary(), "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-crash-reporter",
                "--disable-extensions", "--disable-background-networking", "--disable-component-update",
                "--disable-sync", "--disable-default-apps", "--no-first-run", "--no-default-browser-check",
                "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--remote-debugging-address=127.0.0.1",
                f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
            env=environment,
        )
        client: DevToolsSocket | None = None
        try:
            client = DevToolsSocket(browser_endpoint(port, process))
            inspected_requests = 0
            loaded_at: float | None = None

            def handle(message: dict[str, Any]) -> None:
                nonlocal inspected_requests, loaded_at
                method = message.get("method")
                params = message.get("params", {})
                if method == "Fetch.requestPaused":
                    request_id = params.get("requestId")
                    request = params.get("request", {})
                    url = request.get("url")
                    inspected_requests += 1
                    blocked = inspected_requests > MAX_INSPECT_REQUESTS
                    try:
                        public_url(url)
                    except ValueError:
                        blocked = True
                    resource_type = params.get("resourceType")
                    if isinstance(url, str) and (resource_type == "Media" or media_kind(url)):
                        add_candidate(url, "浏览器媒体请求")
                        blocked = True
                    if request_id:
                        if blocked:
                            client.send("Fetch.failRequest", {"requestId": request_id, "errorReason": "BlockedByClient"})
                        else:
                            client.send("Fetch.continueRequest", {"requestId": request_id})
                elif method == "Network.responseReceived":
                    response = params.get("response", {})
                    if isinstance(response.get("url"), str):
                        add_candidate(response["url"], "浏览器网络响应", str(response.get("mimeType") or ""))
                elif method == "Page.loadEventFired":
                    loaded_at = time.monotonic()

            client.call("Network.enable")
            client.call("Page.enable", {"enableLifecycleEvents": True})
            client.call("Fetch.enable", {"patterns": [{"urlPattern": "*", "requestStage": "Request"}]})
            client.call("Network.setBlockedURLs", {"urls": ["file://*", "ftp://*", "ws://*", "wss://*"]})
            client.send("Page.navigate", {"url": source})
            navigation_started = time.monotonic()
            deadline = time.monotonic() + MAX_INSPECT_SECONDS
            while time.monotonic() < deadline:
                if loaded_at and time.monotonic() - navigation_started >= MIN_INSPECT_SETTLE_SECONDS:
                    break
                try:
                    handle(client.receive())
                except socket.timeout:
                    continue
            result = client.call(
                "Runtime.evaluate",
                {"expression": f"document.documentElement ? document.documentElement.outerHTML.slice(0, {MAX_INSPECT_HTML}) : ''", "returnByValue": True},
                handler=handle,
            )
            document = result.get("result", {}).get("value", "")
            if isinstance(document, str):
                parser = MediaMarkupParser()
                try:
                    parser.feed(document)
                except (ValueError, RuntimeError):
                    pass
                for value, label in parser.values:
                    add_candidate(value, label, require_media_shape=True)
                for value in MEDIA_URL_PATTERN.findall(document):
                    add_candidate(value, "页面源码链接", require_media_shape=True)
                for script in parser.json_ld:
                    try:
                        for value in json_ld_media_values(json.loads(script)):
                            add_candidate(value, "页面结构化数据", require_media_shape=True)
                    except (TypeError, ValueError, json.JSONDecodeError):
                        continue
        finally:
            if client:
                client.close()
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)

    message = (
        f"已发现 {len(candidates)} 个可直接下载的公开媒体候选。选择一个后再加入采集队列。"
        if candidates else "该网页没有向受限浏览器公开可直接下载的媒体地址。常见原因包括播放器接口、登录态、Cookie、短时令牌或 DRM；栖屿不会尝试绕过这些限制。"
    )
    return {"source": source, "candidates": candidates, "message": message}


def selection(value: Any, available: dict[str, Path], label: str) -> str:
    if value not in available:
        raise ValueError(f"无效的{label}")
    return value


def create_job(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("acknowledged") is not True:
        raise ValueError("请确认你拥有保存该公开内容的权利")
    source = public_url(payload.get("url"))
    referer = payload.get("referer")
    if referer is not None:
        referer = public_url(referer)
    mode = selection(payload.get("mode", "video"), {"video": Path(), "audio": Path()}, "采集类型")
    # The file type, not an assumed movie/series classification, decides the
    # physical destination. Ignore any legacy client value sent by an older UI.
    destination = "audio" if mode == "audio" else "videos"
    record = {
        "id": uuid.uuid4().hex,
        "url": source,
        "referer": referer,
        "mode": mode,
        "destination": destination,
        "status": "queued",
        "progress": 0,
        "message": "已加入队列，等待开始。",
        "createdAt": now(),
        "updatedAt": now(),
        "files": [],
    }
    with lock:
        jobs[record["id"]] = record
        trim_history()
        save_jobs()
    pending.put(record["id"])
    return public_job(record)


def trim_history() -> None:
    finished = sorted(
        (job for job in jobs.values() if job.get("status") in {"completed", "failed", "interrupted"}),
        key=lambda job: job.get("updatedAt", ""),
        reverse=True,
    )
    for item in finished[MAX_HISTORY:]:
        jobs.pop(item["id"], None)


def public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {
        key: job.get(key)
        for key in ("id", "url", "mode", "destination", "status", "progress", "message", "createdAt", "updatedAt", "files")
    }


def job_list() -> list[dict[str, Any]]:
    with lock:
        ordered = sorted(jobs.values(), key=lambda job: job.get("createdAt", ""), reverse=True)
        return [public_job(job) for job in ordered]


def update_job(job_id: str, **changes: Any) -> None:
    with lock:
        job = jobs.get(job_id)
        if not job:
            return
        job.update(changes)
        job["updatedAt"] = now()
        save_jobs()


def command_for(job: dict[str, Any]) -> list[str]:
    target = DESTINATIONS[job["destination"]]
    target.mkdir(parents=True, exist_ok=True)
    command = [
        "yt-dlp",
        "--ignore-config",
        "--no-playlist",
        "--no-overwrites",
        "--restrict-filenames",
        "--socket-timeout", "30",
        "--retries", "3",
        "--fragment-retries", "3",
        "--max-filesize", MAX_FILESIZE,
        "--newline",
        "--paths", str(target),
        "--output", "%(title).160B [%(id)s].%(ext)s",
        "--write-info-json",
        "--write-thumbnail",
        "--embed-metadata",
        "--print", "after_move:FILE=%(filepath)s",
    ]
    if job["mode"] == "audio":
        command.extend(["--extract-audio", "--audio-format", "mp3", "--audio-quality", "0"])
    else:
        format_selector = f"bv*[height<={MAX_VIDEO_HEIGHT}]+ba/b[height<={MAX_VIDEO_HEIGHT}]/best[height<={MAX_VIDEO_HEIGHT}]"
        command.extend(["--format", format_selector, "--merge-output-format", "mp4"])
    if job.get("referer"):
        command.extend(["--add-header", f"Referer:{job['referer']}"])
    command.append(job["url"])
    return command


def run_job(job_id: str) -> None:
    with lock:
        job = jobs.get(job_id)
        if not job or job.get("status") != "queued":
            return
        job["status"] = "running"
        job["message"] = "正在解析媒体链接…"
        job["progress"] = 0
        job["updatedAt"] = now()
        save_jobs()

    files: list[str] = []
    last_message = "正在下载…"
    try:
        process = subprocess.Popen(
            command_for(job),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env={"HOME": "/tmp", "PATH": os.environ.get("PATH", "")},
        )
        assert process.stdout is not None
        for output in process.stdout:
            line = output.strip()
            if not line:
                continue
            percentage = PROGRESS.search(line)
            matched_file = OUTPUT_FILE.match(line)
            if matched_file:
                files.append(matched_file.group(1))
                last_message = "正在整理文件…"
            elif percentage:
                last_message = "正在下载…"
            elif line.startswith("ERROR:"):
                last_message = line.removeprefix("ERROR:").strip()
            if percentage or matched_file or line.startswith("ERROR:"):
                update_job(job_id, progress=round(float(percentage.group(1))) if percentage else jobs[job_id].get("progress", 0), message=last_message, files=files)

        if process.wait() == 0:
            update_job(job_id, status="completed", progress=100, message="已保存到栖屿媒体目录。", files=files)
        else:
            update_job(job_id, status="failed", message=last_message or "下载没有完成。")
    except Exception as error:  # Keep the worker alive even if yt-dlp cannot start.
        update_job(job_id, status="failed", message=f"采集服务出错：{error}")


def worker() -> None:
    while True:
        run_job(pending.get())
        pending.task_done()


class CollectorHandler(BaseHTTPRequestHandler):
    server_version = "QiyuCollector/1.0"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        return

    def respond(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self.respond(HTTPStatus.OK, {"status": "ok"})
            return
        if self.path == "/jobs":
            self.respond(HTTPStatus.OK, {"jobs": job_list()})
            return
        self.respond(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in {"/jobs", "/inspect"}:
            self.respond(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 16_384:
                raise ValueError("请求内容无效")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("请求内容无效")
            if self.path == "/jobs":
                self.respond(HTTPStatus.CREATED, {"job": create_job(payload)})
            else:
                self.respond(HTTPStatus.OK, {"inspection": inspect_page(payload)})
        except (ValueError, json.JSONDecodeError) as error:
            self.respond(HTTPStatus.BAD_REQUEST, {"error": str(error)})


def main() -> None:
    for destination in (DESTINATIONS["videos"], DESTINATIONS["audio"]):
        destination.mkdir(parents=True, exist_ok=True)
    load_jobs()
    threading.Thread(target=worker, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", 9090), CollectorHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
