"""Private, single-worker media collection service for Qiyu NAS.

It intentionally has no public port.  The Qiyu portal is the only client on
the Docker network, and is responsible for authenticating each request.
"""

from __future__ import annotations

import ipaddress
import json
import os
import queue
import re
import socket
import subprocess
import threading
import urllib.parse
import uuid
from datetime import UTC, datetime
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


def selection(value: Any, available: dict[str, Path], label: str) -> str:
    if value not in available:
        raise ValueError(f"无效的{label}")
    return value


def create_job(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("acknowledged") is not True:
        raise ValueError("请确认你拥有保存该公开内容的权利")
    source = public_url(payload.get("url"))
    mode = selection(payload.get("mode", "video"), {"video": Path(), "audio": Path()}, "采集类型")
    # The file type, not an assumed movie/series classification, decides the
    # physical destination. Ignore any legacy client value sent by an older UI.
    destination = "audio" if mode == "audio" else "videos"
    record = {
        "id": uuid.uuid4().hex,
        "url": source,
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
        if self.path != "/jobs":
            self.respond(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 16_384:
                raise ValueError("请求内容无效")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("请求内容无效")
            self.respond(HTTPStatus.CREATED, {"job": create_job(payload)})
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
