# 栖屿 NAS / Qiyu NAS

一个自托管的个人 NAS 门户：文件管理、常见文档预览、个人影音库和静态网页发布都在一套统一风格的界面中完成。它使用 **Caddy** 作为入口，使用 **Jellyfin** 作为影音扫描与流媒体引擎。

> 这是一个单机个人 NAS 项目，不是分布式存储或多节点集群。

## 功能

- 栖屿文件中心：上传、下载、重命名、移动、删除和新建目录
- 浏览器预览：图片、PDF、常见浏览器音视频、Markdown、Excel（`.xlsx`）、Word（`.docx`），以及 TXT/CSV/JSON/YAML/XML/配置和常见代码源码
- 栖屿影音前台：通过 Jellyfin 扫描媒体、读取元数据和流式播放，无需在门户中二次登录
- 静态站点发布：把网页文件放入 `sites/<站点名>/`，通过 `/sites/<站点名>/` 访问
- 单个门户会话：文件和影音 API 都由栖屿会话保护
- Docker Compose 一键部署；数据与配置都落在宿主机目录中

## 架构

```text
浏览器
  │
  └─ Caddy :8080 ── 栖屿门户（Next.js） ── data/{files,media,sites}
                    │
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

首次打开“影音”页时，门户会使用 `.env` 中的账号自动完成 Jellyfin 的首个管理员账户初始化，因此不需要第二次登录。随后打开 `http://<主机地址>:8080/jellyfin/` 仅用于高级维护。

在 Jellyfin 中添加媒体库，电影目录设为 `/media/Movies`，剧集目录设为 `/media/Shows`。不要在 Jellyfin 网络设置中设置 Base URL；Caddy 会负责 `/jellyfin/` 的反向代理。

将媒体放入 `data/media/Movies` 或 `data/media/Shows`。Jellyfin 扫描完成后，会出现在栖屿的“影音”页面。

## 发布自己的网页

在 `data/sites/` 下创建站点目录并放入 `index.html`：

```text
data/sites/home/index.html
data/sites/my-tool/index.html
```

它们分别对应 `/sites/home/` 和 `/sites/my-tool/`。静态站点与门户共享同一个 Caddy 入口，但不会自动继承门户登录保护；只应发布可公开给该网络访问的内容。

## 常用配置

| 变量 | 作用 |
| --- | --- |
| `NAS_ROOT` | 文件、影音与静态站点数据位置；生产环境建议绝对路径。 |
| `CONFIG_ROOT` | Caddy 与 Jellyfin 配置位置；请一起纳入备份。 |
| `PUID` / `PGID` | 容器写入宿主机目录使用的 Linux UID/GID。 |
| `PORTAL_BIND_ADDRESS` / `PORTAL_PORT` | 对外监听地址与端口；可绑定到某个 Tailscale 地址。 |
| `PORTAL_COOKIE_SECURE` | 使用 HTTPS 入口时设为 `true`。 |
| `NPM_REGISTRY` | 构建门户镜像时使用的 npm registry；默认官方源。 |

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
- HTML 和 SVG 会以安全源码形式预览，不会在门户中执行。旧版 `.doc/.xls`、PPT/PPTX、压缩包和浏览器不支持解码的媒体文件会保留下载入口；它们适合后续接入独立转换服务，而不是伪装成可用预览。
- 请自行确认放入 NAS 的媒体、文档、图片和静态网页的授权与版权状态。

## 许可证

本项目采用 [MIT License](LICENSE)。Jellyfin、Caddy、Docker 和 npm 依赖各自遵循其上游许可证。
