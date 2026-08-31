# 栖屿 NAS / Qiyu NAS

一个自托管的个人 NAS 门户：文件管理、常见文档预览、个人影音库、影音采集和静态网页发布都在一套统一风格的界面中完成。它使用 **Caddy** 作为入口，使用 **Jellyfin** 作为影音扫描与流媒体引擎，并以私有的 **yt-dlp** 服务完成公开影音链接采集。

> 这是一个单机个人 NAS 项目，不是分布式存储或多节点集群。

## 功能

- 栖屿文件中心：上传、下载、重命名、移动、删除和新建目录
- 浏览器预览：图片、PDF、常见浏览器音视频、Markdown、Excel（`.xlsx`）、Word（`.docx`），以及 TXT/CSV/JSON/YAML/XML/配置和常见代码源码
- 栖屿影音前台：通过 Jellyfin 扫描媒体、读取元数据和流式播放，无需在门户中二次登录
- 栖屿影音采集：粘贴可解析的公开链接，后台队列通过 yt-dlp + ffmpeg 保存为视频或 MP3；服务没有宿主机端口，也不读取浏览器 Cookie
- 静态站点发布：把网页文件放入 `sites/<站点名>/`，通过 `/sites/<站点名>/` 访问
- 单个门户会话：文件和影音 API 都由栖屿会话保护
- Docker Compose 一键部署；数据与配置都落在宿主机目录中

## 架构

```text
浏览器
  │
  └─ Caddy :8080 ── 栖屿门户（Next.js） ── data/{files,media,sites}
                    │              │
                    │              └─ yt-dlp 采集器（仅 Docker 内网、单任务队列）
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

编辑 `.env`，至少替换以下两项：

```dotenv
NAS_PASSWORD=换成强密码
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

首次打开“影音”页时，门户会使用 `.env` 中的账号自动完成 Jellyfin 的首个管理员账户初始化，并建立默认的影片库 `/media/Movies` 与剧集库 `/media/Shows`，因此不需要第二次登录。随后打开 `http://<主机地址>:8080/jellyfin/` 仅用于高级维护。

将电影放入 `/media/Movies`，剧集放入 `/media/Shows` 即可。不要在 Jellyfin 网络设置中设置 Base URL；Caddy 会负责 `/jellyfin/` 的反向代理。

将媒体放入 `data/media/Movies` 或 `data/media/Shows`。Jellyfin 扫描完成后，会出现在栖屿的“影音”页面。

## 影音采集

在“采集”页粘贴一个你有权保存的**公开** HTTP/HTTPS 媒体链接，选择视频（默认最高 2K / 1440p）或 MP3 音频，再选择保存到：

- `media/Inbox`：默认收集箱，适合先在文件中心检查、整理。
- `media/Movies` / `media/Shows`：Jellyfin 会继续扫描；内容识别取决于文件命名和 Jellyfin 元数据匹配。

采集服务是仅在 Docker 网络内监听的单工作线程，不会开放端口给 Tailscale 或局域网，也不会使用浏览器 Cookie、账号或密码。它拒绝本机、局域网和保留地址，以免被链接利用来访问 NAS 内网。任务历史保存在 `CONFIG_ROOT/collector/jobs.json`，下载内容保存在 `NAS_ROOT/media/`。

网站规则会变化，请定期重建或更新 `collector` 镜像以取得新版 yt-dlp。请只保存你拥有版权、授权或合法可保存的内容，并遵守来源平台的条款；该功能不用于绕过访问控制或 DRM。

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
| `NPM_REGISTRY` | 构建门户镜像时使用的 npm registry；默认官方源。 |
| `COLLECTOR_MAX_FILESIZE` | 单个采集任务可写入的最大文件大小，默认 `10G`。 |
| `COLLECTOR_MAX_HEIGHT` | 视频采集高度上限，默认 `1440`（2K/QHD）；允许 `144` 到 `2160`。 |

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
