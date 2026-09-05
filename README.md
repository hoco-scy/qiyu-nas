# 栖屿 NAS / Qiyu NAS

一个自托管的个人 NAS 门户：文件管理、常见文档预览、个人影音库、影音采集和静态网页发布都在一套统一风格的界面中完成。它使用 **Caddy** 作为入口，使用 **Jellyfin** 作为影音扫描与流媒体引擎，并以私有的 **yt-dlp** 服务完成公开影音链接采集。

> 这是一个单机个人 NAS 项目，不是分布式存储或多节点集群。

## 功能

- 栖屿文件中心：上传、下载、重命名、移动、删除和新建目录
- 浏览器预览：图片、PDF、常见浏览器音视频、Markdown、Excel（`.xlsx`）、Word（`.docx`），以及 TXT/CSV/JSON/YAML/XML/配置和常见代码源码
- 栖屿影音前台：通过 Jellyfin 扫描媒体、读取元数据和流式播放，无需在门户中二次登录
- 栖屿影音采集：粘贴可解析的公开链接，后台队列通过 yt-dlp + ffmpeg 保存为视频或 MP3；可用临时无头浏览器或可选的 Chromium 扩展嗅探网页已加载的公开媒体请求；服务没有宿主机端口，也不读取浏览器 Cookie
- 静态站点发布：把网页文件放入 `sites/<站点名>/`，通过 `/sites/<站点名>/` 访问
- 单个门户会话：文件和影音 API 都由栖屿会话保护
- Docker Compose 一键部署；数据与配置都落在宿主机目录中

## 架构

```text
浏览器
  │
  └─ Caddy :8080 ── 栖屿门户（Next.js） ── data/{files,media,sites}
                    │              │
                    │              └─ yt-dlp + Chromium 采集器（仅 Docker 内网、单任务队列）
                    └─ Jellyfin（扫描、元数据、流媒体）
```

`Jellyfin` 不对宿主机暴露端口；正常使用栖屿的 `/media` 页面即可。`/jellyfin/` 仅保留给初始设置和高级维护。

## 快速开始

前提：Linux 主机、Docker Engine 和 Docker Compose v2。x86_64 与 ARM64 都可使用；默认不启用 GPU 转码。

```bash
git clone https://github.com/hoco-scy/qiyu-nas.git
cd qiyu-nas
cp .env.example .env
```

编辑 `.env`，至少替换门户登录密码、内部 Jellyfin 服务密码和会话密钥：

```dotenv
NAS_PASSWORD=换成强密码
JELLYFIN_PASSWORD=换成另一段强密码
PORTAL_SESSION_SECRET=换成 openssl rand -hex 32 的输出
```

让容器以当前 Linux 用户的 UID/GID 读写数据，再创建目录并启动：

```bash
sed -i "s/^PUID=.*/PUID=$(id -u)/; s/^PGID=.*/PGID=$(id -g)/" .env
./scripts/prepare-storage.sh
docker compose --env-file .env up -d --build
```

打开 `http://<主机地址>:8080`，使用 `.env` 中的 `NAS_USERNAME` / `NAS_PASSWORD` 登录。

### 首次配置 Jellyfin

首次打开“影音”页时，门户会使用 `.env` 中的 `JELLYFIN_USERNAME` / `JELLYFIN_PASSWORD` 自动完成 Jellyfin 的首个内部服务账户初始化，并建立默认的视频库 `/media/Videos`，因此不需要第二次登录。该服务账户只供栖屿后端调用；栖屿门户登录始终只使用 `NAS_USERNAME` / `NAS_PASSWORD`。随后打开 `http://<主机地址>:8080/jellyfin/` 仅用于高级维护。

对已有部署，先将当前可登录 Jellyfin 的账号填写到 `JELLYFIN_USERNAME` / `JELLYFIN_PASSWORD`，再更新门户。此后修改栖屿 `NAS_PASSWORD` 不会影响影音引擎；需要修改 Jellyfin 服务账户时则单独在 Jellyfin 与这两个变量中同步更新。

将视频放入 `/media/Videos` 即可；不需要先按电影或剧集分类。不要在 Jellyfin 网络设置中设置 Base URL；Caddy 会负责 `/jellyfin/` 的反向代理。

将视频放入 `data/media/Videos`，音频会收在 `data/media/Audio`。文件中心可以统一按视频、图片、音频或文档筛选；Jellyfin 扫描完成后，视频会出现在栖屿的“影音”页面。

## 影音采集

在“采集”页粘贴一个你有权保存的**公开** HTTP/HTTPS 媒体链接，选择视频（默认最高 2K / 1440p）或 MP3 音频：

- 视频自动保存到 `media/Videos`，Jellyfin 会继续扫描。
- 音频自动保存到 `media/Audio`。
- 旧版本留下的 `Inbox`、`Movies` 与 `Shows` 目录会保留，不会被删除。

采集服务是仅在 Docker 网络内监听的单工作线程，不会开放端口给 Tailscale 或局域网，也不会使用浏览器 Cookie、账号或密码。它拒绝本机、局域网和保留地址，以免被链接利用来访问 NAS 内网。任务历史保存在 `CONFIG_ROOT/collector/jobs.json`，下载内容保存在 `NAS_ROOT/media/`。

网站规则会变化，请定期重建或更新 `collector` 镜像以取得新版 yt-dlp。请只保存你拥有版权、授权或合法可保存的内容，并遵守来源平台的条款；该功能不用于绕过访问控制或 DRM。

### 资源嗅探

对于仅粘贴网页地址的情况，可先点击“嗅探网页资源”。采集器会启动一次性的 Chromium 空白用户目录，等待网页加载后，从已渲染 DOM 和网络响应中提取公开的直连视频、音频、HLS/DASH 候选链接。选择候选项后才会交给 yt-dlp 入队下载；嗅探本身不会自动保存文件。

- 嗅探浏览器没有登录态、扩展或 Cookie，不读取你的桌面浏览器资料。
- 它会拦截并拒绝本机、局域网、保留地址、`file:`、FTP 和 WebSocket 请求；每次运行有请求数、候选数与时间上限。
- 仅适用于你有权保存的公开、非 DRM 内容。需要登录、Cookie、时效令牌或 DRM 的内容可能无法出现或无法下载，栖屿不会尝试绕过这些限制。

### Chromium 扩展嗅探（可选）

当某些网站只有在你实际点击播放器后才发起媒体请求时，可在 Chrome 或 Edge 加载仓库的 `extension/` 目录：打开扩展管理页，启用“开发人员模式”，选择“加载解压缩的扩展程序”，并选择该目录。

首次在扩展中点击“开始观察”时，浏览器会要求你授予站点访问权限。这是因为跨域播放器的请求必须同时获得页面与资源域名的访问权；该权限仅用于观察你主动开启的当前标签页。扩展不会修改网络请求、读取 Cookie/账号/页面正文，候选链接只保留在浏览器会话内存中。

在扩展中填写栖屿入口（例如 `http://[NAS 的 IPv6 地址]:8080`），在目标页实际操作播放器，然后选择“带回栖屿”。扩展会在已登录的栖屿 `/collect` 页面中预填候选；链接置于 URL 片段，不会发送到服务器或写进代理日志，且仍需你勾选授权并手动点击“开始采集”。

## 发布自己的网页

在 `data/sites/` 下创建站点目录并放入 `index.html`：

```text
data/sites/home/index.html
data/sites/my-tool/index.html
```

它们分别对应 `/sites/home/` 和 `/sites/my-tool/`。栖屿的“网页”页会自动列出这些目录，点击卡片即可进入站点；`/sites/` 本身会回到网页中心，不再显示 Caddy 的目录浏览页。静态站点与门户共享同一个 Caddy 入口，但不会自动继承门户登录保护；只应发布可公开给该网络访问的内容。

## 常用配置

| 变量 | 作用 |
| --- | --- |
| `NAS_ROOT` | 文件、影音与静态站点数据位置；生产环境建议绝对路径。 |
| `CONFIG_ROOT` | Caddy 与 Jellyfin 配置位置；请一起纳入备份。 |
| `PUID` / `PGID` | 容器写入宿主机目录使用的 Linux UID/GID。 |
| `PORTAL_BIND_ADDRESS` / `PORTAL_PORT` | 对外监听地址与端口；可绑定到某个 Tailscale 地址。 |
| `PORTAL_COOKIE_SECURE` | 使用 HTTPS 入口时设为 `true`。 |
| `JELLYFIN_USERNAME` / `JELLYFIN_PASSWORD` | 仅供门户服务端访问 Jellyfin 的内部服务凭据，不用于栖屿网页登录。 |
| `JELLYFIN_BASE_URL` | Jellyfin 的 Docker 内网地址，默认 `http://jellyfin:8096`；若 Jellyfin 设置了 Base URL，需追加该前缀。 |
| `NPM_REGISTRY` | 构建门户镜像时使用的 npm registry；默认官方源。 |
| `COLLECTOR_MAX_FILESIZE` | 单个采集任务可写入的最大文件大小，默认 `10G`。 |
| `COLLECTOR_MAX_HEIGHT` | 视频采集高度上限，默认 `1440`（2K/QHD）；允许 `144` 到 `2160`。 |
| `COLLECTOR_BASE` | 采集器构建基础镜像，默认 `alpine:3.22`；离线或受限网络可指定已加载的兼容镜像。 |
| `COLLECTOR_EXTRA_CA_CERTIFICATE_B64` | 可选的额外受信任根证书 Base64 值，仅在受管网络中构建采集器时使用。 |

项目默认直接以 HTTP 监听，适用于受信任的局域网或受访问控制的私有网络。若经公网、反向代理域名或不受信任网络访问，请为 Caddy 配置 HTTPS，并将 `PORTAL_COOKIE_SECURE=true`。

## 硬件转码（可选）

默认 Compose 不绑定任何显卡设备，以便在普通 Linux/ARM 主机上直接运行。需要 Intel/AMD GPU 转码时，请按主机的 `/dev/dri/renderD*` 设备与其所属组 GID，为 `jellyfin` 服务补充 `devices` 与 `group_add`；不同主机设备编号不同，仓库不强行假设一个值。

## 开发与检查

```bash
npm ci
npm run dev
npm run build
npm audit --omit=dev --audit-level=moderate
docker compose --env-file .env config
```

## 备份与边界

- 备份 `NAS_ROOT` 与 `CONFIG_ROOT`；其中前者保存用户文件，后者保存 Jellyfin 元数据与 Caddy 状态。
- 只支持单一管理账户，尚未实现多用户、权限隔离、分享链接、回收站或分布式存储。
- 文件操作限制在 `files`、`media` 和 `sites` 三个顶层目录，且会拒绝符号链接。
- HTML 和 SVG 会以安全源码形式预览，不会在门户中执行。旧版 `.doc/.xls`、PPT/PPTX、压缩包和浏览器不支持解码的媒体文件会保留下载入口；它们适合后续接入独立转换服务，而不是伪装成可用预览。0 字节、损坏或上传不完整的 Office 文件会明确提示，不会伪装成可预览内容。
- 请自行确认放入 NAS 的媒体、文档、图片和静态网页的授权与版权状态。

## 许可证

本项目采用 [MIT License](LICENSE)。Jellyfin、Caddy、Docker 和 npm 依赖各自遵循其上游许可证。
