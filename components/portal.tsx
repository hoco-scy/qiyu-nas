'use client';

import { Activity, ArrowUpRight, Film, FolderOpen, Gauge, HardDrive, Play, Plus, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { QiyuAppShell } from '@/components/qiyu-app-shell';
import { Button } from '@/components/ui/button';

type NasStatus = {
  hostname: string;
  storage: { total: number; used: number; available: number; percent: number };
  files: number;
  videos: number;
  load: number;
  uptime: number;
  recent: { name: string; path: string; size: number; updated: string }[];
};

const fallback: NasStatus = {
  hostname: '栖屿 NAS', storage: { total: 0, used: 0, available: 0, percent: 0 }, files: 0, videos: 0, load: 0, uptime: 0, recent: [],
};

export function Portal() {
  const [status, setStatus] = useState<NasStatus>(fallback);
  const [loading, setLoading] = useState(true);
  const date = useMemo(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()), []);

  async function refresh() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setStatus(await response.json() as NasStatus);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer); }, []);

  return <QiyuAppShell active="home" eyebrow="栖屿空间" title="总览">
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-white/7 pb-6 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm text-primary">{date}</p><h2 className="mt-1.5 text-3xl font-medium tracking-[-0.045em] sm:text-[2.1rem]">你的数字空间，状态良好。</h2><p className="mt-2 text-sm text-muted-foreground">文件、影音和网页都在同一个入口里。</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" className="rounded-lg border-white/8 bg-white/[0.025]" onClick={() => void refresh()}><RefreshCw className="size-4" />刷新状态</Button><a href="/files" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/85"><Upload className="size-4" />上传文件</a></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={HardDrive} label="可用空间" value={formatBytes(status.storage.available)} note={`已用 ${status.storage.percent}%`} />
        <Metric icon={FolderOpen} label="文件" value={status.files.toLocaleString('zh-CN')} note="栖屿数据目录" />
        <Metric icon={Film} label="影音条目" value={status.videos.toLocaleString('zh-CN')} note="等待 Jellyfin 识别" />
        <Metric icon={Gauge} label="系统负载" value={loading ? '—' : status.load.toFixed(2)} note={status.uptime ? `已运行 ${formatUptime(status.uptime)}` : '正在读取状态'} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">快速开始</p><h3 className="mt-2 text-xl font-medium tracking-[-0.025em]">现在想做什么？</h3></div><Activity className="size-5 text-primary" /></div><div className="mt-5 grid gap-2 sm:grid-cols-3"><QuickLink href="/files" icon={Plus} title="整理文件" note="上传、预览和移动" /><QuickLink href="/media" icon={Play} title="打开影音" note="浏览并直接播放" /><QuickLink href="/websites" icon={ArrowUpRight} title="发布网页" note="管理静态站点" /></div></div>
        <StorageCard status={status} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-2xl border border-white/8 bg-white/[0.025]"><div className="flex items-center justify-between border-b border-white/7 px-5 py-4 sm:px-6"><div><h3 className="text-sm font-medium">最近文件</h3><p className="mt-1 text-xs text-muted-foreground">最新写入栖屿目录的内容</p></div><a href="/files" className="text-xs text-primary hover:text-primary/80">打开文件中心</a></div>{status.recent.length ? <div className="divide-y divide-white/6 px-5 sm:px-6">{status.recent.map((entry) => <a key={entry.path} href={`/files?path=${encodeURIComponent(entry.path.split('/').slice(0, -1).join('/'))}`} className="flex items-center gap-3 py-3.5 transition hover:bg-white/[0.025]"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-primary"><FolderOpen className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm">{entry.name}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{entry.path || '栖屿空间'} · {entry.updated}</span></span><span className="text-xs text-muted-foreground">{formatBytes(entry.size)}</span></a>)}</div> : <div className="px-6 py-14 text-center text-sm text-muted-foreground">上传第一个文件后，它会显示在这里。</div>}</div>
        <div className="rounded-2xl border border-white/8 bg-[#101c1b] p-5 sm:p-6"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">服务状态</p><div className="mt-5 space-y-4"><StatusRow label="栖屿中心" value="在线" /><StatusRow label="文件服务" value="已接入" /><StatusRow label="影音引擎" value="Jellyfin" /></div><a href="/media" className="mt-7 flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.025] px-3.5 py-3 text-sm transition hover:border-primary/25 hover:bg-primary/[0.06]"><span>进入影音空间</span><ArrowUpRight className="size-4 text-primary" /></a></div>
      </section>
    </div>
  </QiyuAppShell>;
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof HardDrive; label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className="size-4 text-primary" /></div><p className="mt-4 text-2xl font-medium tracking-[-0.035em]">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>;
}

function QuickLink({ href, icon: Icon, title, note }: { href: string; icon: typeof Plus; title: string; note: string }) {
  return <a href={href} className="group rounded-xl border border-white/7 bg-black/10 p-4 transition hover:border-primary/25 hover:bg-primary/[0.055]"><Icon className="size-4 text-primary" /><p className="mt-5 text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></a>;
}

function StorageCard({ status }: { status: NasStatus }) {
  const percent = Math.min(100, Math.max(0, status.storage.percent));
  return <div className="rounded-2xl border border-white/8 bg-[#101c1b] p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-sm font-medium">系统盘</p><p className="mt-1 text-xs text-muted-foreground">{status.hostname}</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary">{percent}% 已用</span></div><div className="mt-7 h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(1, percent)}%` }} /></div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{formatBytes(status.storage.used)} 已用</span><span>{formatBytes(status.storage.total)}</span></div></div>;
}

function StatusRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center text-sm"><span className="mr-3 size-2 rounded-full bg-primary" /><span className="text-muted-foreground">{label}</span><span className="ml-auto">{value}</span></div>; }
function formatBytes(value: number) { if (!value) return '—'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`; }
function formatUptime(seconds: number) { const days = Math.floor(seconds / 86400); const hours = Math.floor(seconds % 86400 / 3600); return days ? `${days} 天 ${hours} 小时` : `${hours} 小时`; }
