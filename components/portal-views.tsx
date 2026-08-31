'use client';

import {
  Code2,
  Download,
  ExternalLink,
  FileImage,
  Gauge,
  LayoutGrid,
  List,
  Play,
  Plus,
  Search,
  Settings2,
  Upload,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fileVisual, type FileEntry } from '@/components/portal-data';

export function FilesView({
  files,
  query,
  view,
  onQuery,
  onView,
  onUpload,
  onNewFolder,
  notify,
}: {
  files: FileEntry[];
  query: string;
  view: 'grid' | 'list';
  onQuery: (value: string) => void;
  onView: (value: 'grid' | 'list') => void;
  onUpload: () => void;
  onNewFolder: () => void;
  notify: (message: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm text-primary">根目录 / 我的文件</p>
          <h2 className="mt-2 text-3xl font-medium tracking-tight">文件中心</h2>
          <p className="mt-2 text-sm text-muted-foreground">浏览、整理和传输你保存在 NAS 中的内容。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl border-white/10 bg-white/[0.02]" onClick={onNewFolder}><Plus className="size-4" />新建文件夹</Button>
          <Button className="rounded-xl" onClick={onUpload}><Upload className="size-4" />上传文件</Button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索当前目录" className="h-11 rounded-xl border-white/8 bg-black/10 pl-10" />
          </div>
          <div className="flex rounded-xl border border-white/8 bg-black/10 p-1">
            <button aria-label="网格视图" onClick={() => onView('grid')} className={`rounded-lg p-2 ${view === 'grid' ? 'bg-white/8 text-primary' : 'text-muted-foreground'}`}><LayoutGrid className="size-4" /></button>
            <button aria-label="列表视图" onClick={() => onView('list')} className={`rounded-lg p-2 ${view === 'list' ? 'bg-white/8 text-primary' : 'text-muted-foreground'}`}><List className="size-4" /></button>
          </div>
        </div>

        {files.length ? (
          <div className={view === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4' : 'divide-y divide-white/6'}>
            {files.map((file) => <FileCard key={file.id} file={file} list={view === 'list'} notify={notify} />)}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center text-center"><Search className="size-7 text-muted-foreground" /><p className="mt-4 text-sm">没有找到相关文件</p><p className="mt-1 text-xs text-muted-foreground">换一个关键词试试</p></div>
        )}
      </section>
    </div>
  );
}

function FileCard({ file, list, notify }: { file: FileEntry; list: boolean; notify: (message: string) => void }) {
  const visual = fileVisual(file.kind);
  const Icon = visual.icon;
  if (list) {
    return (
      <div className="flex items-center gap-3 py-3">
        <button onClick={() => notify(`已打开“${file.name}”`)} className={`flex size-10 items-center justify-center rounded-xl ${visual.color}`}><Icon className="size-5" /></button>
        <button onClick={() => notify(`已打开“${file.name}”`)} className="min-w-0 text-left"><p className="truncate text-sm">{file.name}</p><p className="text-[11px] text-muted-foreground">{file.updated}</p></button>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">{file.size}</span>
        <button aria-label={`下载 ${file.name}`} onClick={() => notify(`“${file.name}”已加入下载队列`)} className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"><Download className="size-4" /></button>
      </div>
    );
  }
  return (
    <button onClick={() => notify(`已打开“${file.name}”`)} className="group rounded-2xl border border-white/7 bg-black/10 p-4 text-left transition hover:-translate-y-0.5 hover:border-white/14 hover:bg-white/[0.035]">
      <div className={`flex size-11 items-center justify-center rounded-xl ${visual.color}`}><Icon className="size-5" /></div>
      <p className="mt-5 truncate text-sm font-medium">{file.name}</p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>{file.size}</span><span>{file.updated}</span></div>
    </button>
  );
}

const videos = [
  { title: '宇宙时刻', detail: 'S01 E04 · 48 分钟', progress: 62, color: 'from-[#172b32] via-[#39666c] to-[#d58c54]' },
  { title: '岛屿来信', detail: '2025 · 1 小时 46 分', progress: 18, color: 'from-[#26312d] via-[#6d7255] to-[#d3a77c]' },
  { title: '夜行列车', detail: 'S02 E07 · 52 分钟', progress: 0, color: 'from-[#151c29] via-[#3d4563] to-[#a65c49]' },
  { title: '山海之间', detail: '2026 · 38 分钟', progress: 0, color: 'from-[#193134] via-[#39776c] to-[#d7b476]' },
];

export function VideoView({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="space-y-7">
      <section>
        <p className="text-sm text-primary">Jellyfin 适配预览</p>
        <h2 className="mt-2 text-3xl font-medium tracking-tight">影音空间</h2>
        <p className="mt-2 text-sm text-muted-foreground">让旧笔记本变成随时可看的私人流媒体中心。</p>
      </section>

      <section className="group relative min-h-[430px] overflow-hidden rounded-3xl border border-white/8 bg-[#172624]">
        {/* oxlint-disable-next-line next/no-img-element */}
        <img src="/qiyu-media-hero.png" alt="私人影音资料库的抽象主视觉" className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-[1.015]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#10201f] via-[#10201f]/65 to-transparent" />
        <div className="relative flex min-h-[430px] max-w-xl flex-col justify-end p-6 sm:p-10">
          <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/70">4K · HDR · 本地媒体</span>
          <h3 className="mt-5 text-4xl font-medium tracking-tight sm:text-5xl">宇宙时刻</h3>
          <p className="mt-4 text-sm leading-6 text-white/65">穿过可见宇宙的边界，寻找构成时间与空间的微小线索。<br />第一季 · 第四集</p>
          <div className="mt-7 flex gap-3"><Button onClick={() => notify('播放器已准备：从 28:14 继续')} className="rounded-xl"><Play className="size-4 fill-current" />继续播放</Button><Button onClick={() => notify('已加入“稍后观看”')} variant="outline" className="rounded-xl border-white/15 bg-black/15"><Plus className="size-4" />稍后观看</Button></div>
          <div className="mt-7 h-1.5 max-w-sm overflow-hidden rounded-full bg-white/12"><div className="h-full w-[62%] rounded-full bg-primary" /></div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between"><div><h3 className="font-medium">继续观看</h3><p className="mt-1 text-xs text-muted-foreground">从上次离开的地方开始</p></div><button onClick={() => notify('已显示全部影音条目')} className="text-xs text-primary">查看全部</button></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {videos.map((video, index) => (
            <button key={video.title} onClick={() => notify(`正在打开“${video.title}”`)} className="group text-left">
              <div className={`relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br ${video.color}`}>
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(120deg,transparent_25%,rgba(255,255,255,.18)_50%,transparent_75%)]" />
                <div className="absolute inset-0 flex items-center justify-center"><span className="flex size-12 items-center justify-center rounded-full border border-white/20 bg-black/20 text-white/80 backdrop-blur-md transition group-hover:scale-105"><Play className="ml-0.5 size-5 fill-current" /></span></div>
                <span className="absolute bottom-3 right-3 rounded-md bg-black/45 px-2 py-1 text-[10px] text-white/80">{index % 2 ? '1080p' : '4K'}</span>
                {video.progress ? <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15"><div className="h-full bg-primary" style={{ width: `${video.progress}%` }} /></div> : null}
              </div>
              <p className="mt-3 text-sm font-medium">{video.title}</p><p className="mt-1 text-xs text-muted-foreground">{video.detail}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SitesView({ onAdd, notify }: { onAdd: () => void; notify: (message: string) => void }) {
  const sites = [
    { title: '个人首页', url: 'home.nas.local', desc: '随手记录、链接与个人作品', icon: Code2, color: 'text-primary bg-primary/10', status: '运行中' },
    { title: '家庭相册', url: 'album.nas.local', desc: '按年份整理的家庭照片墙', icon: FileImage, color: 'text-amber-200 bg-amber-300/10', status: '运行中' },
    { title: '服务监控', url: 'status.nas.local', desc: '查看设备温度、负载与服务状态', icon: Gauge, color: 'text-sky-200 bg-sky-300/10', status: '仅本地' },
  ];
  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="text-sm text-primary">自建网页入口</p><h2 className="mt-2 text-3xl font-medium tracking-tight">我的网页</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">把自己写的 HTML、相册或小工具挂在同一个门户下，后续可由反向代理和统一登录接管访问。</p></div>
        <Button onClick={onAdd} className="w-fit rounded-xl"><Plus className="size-4" />添加网页</Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {sites.map((site) => (
          <div key={site.title} className="rounded-3xl border border-white/8 bg-white/[0.025] p-6">
            <div className="flex items-start justify-between"><div className={`flex size-11 items-center justify-center rounded-2xl ${site.color}`}><site.icon className="size-5" /></div><span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className={`size-1.5 rounded-full ${site.status === '运行中' ? 'bg-primary' : 'bg-amber-300'}`} />{site.status}</span></div>
            <h3 className="mt-8 text-lg font-medium">{site.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{site.desc}</p>
            <div className="mt-7 flex items-center justify-between border-t border-white/7 pt-4"><code className="text-[11px] text-primary/80">{site.url}</code><button aria-label={`打开 ${site.title}`} onClick={() => notify(`正在打开 ${site.url}`)} className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"><ExternalLink className="size-4" /></button></div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-6">
          <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Zap className="size-5" /></div><div><h3 className="font-medium">快速发布静态网页</h3><p className="mt-1 text-xs text-muted-foreground">面向纯 HTML / CSS / JS 项目</p></div></div>
          <div className="mt-6 rounded-2xl border border-white/7 bg-black/15 p-4 font-mono text-xs leading-6 text-white/60"><span className="text-primary">$</span> 将网页文件放入 /srv/sites/my-page<br /><span className="text-primary">$</span> 在门户中登记本地端口<br /><span className="text-primary">$</span> 由 Caddy 添加统一入口</div>
          <Button variant="outline" onClick={() => notify('部署向导会在接入 Linux 主机后启用')} className="mt-5 rounded-xl border-white/10 bg-white/[0.02]"><Code2 className="size-4" />打开部署向导</Button>
        </div>

        <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-6">
          <div className="flex items-center justify-between"><div><h3 className="font-medium">统一访问链路</h3><p className="mt-1 text-xs text-muted-foreground">未来接入 Linux 时的建议结构</p></div><Settings2 className="size-5 text-muted-foreground" /></div>
          <div className="mt-6 space-y-3">
            {[
              ['入口', 'Caddy / Nginx Proxy Manager'],
              ['登录', 'Authentik OIDC'],
              ['服务', '栖屿文件中心 · Jellyfin · 自建站点'],
            ].map(([label, value], index) => <div key={label} className="relative flex gap-4 rounded-xl border border-white/7 bg-black/10 p-4"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] text-primary">{index + 1}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm">{value}</p></div></div>)}
          </div>
        </div>
      </section>
    </div>
  );
}
