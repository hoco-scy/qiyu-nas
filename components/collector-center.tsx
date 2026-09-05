'use client';

import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  FileAudio,
  Film,
  FolderArchive,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { QiyuAppShell } from '@/components/qiyu-app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  CollectorJob,
  CollectorInspection,
  CollectorInspectionCandidate,
  CollectorMode,
} from '@/lib/collector';

type CollectorPayload = {
  jobs?: CollectorJob[];
  job?: CollectorJob;
  inspection?: CollectorInspection;
  error?: string;
};

const destinationLabels = {
  videos: '视频',
  audio: '音频',
  movies: '旧影片库',
  shows: '旧剧集库',
  inbox: '旧收集箱',
} as const;

const statusStyle: Record<
  CollectorJob['status'],
  { label: string; className: string; icon: typeof Clock3 }
> = {
  queued: {
    label: '排队中',
    className: 'bg-amber-400/10 text-amber-500',
    icon: Clock3,
  },
  running: {
    label: '采集中',
    className: 'bg-primary/12 text-primary',
    icon: LoaderCircle,
  },
  completed: {
    label: '已完成',
    className: 'bg-emerald-400/10 text-emerald-600',
    icon: CheckCircle2,
  },
  failed: {
    label: '未完成',
    className: 'bg-destructive/10 text-destructive',
    icon: CircleAlert,
  },
  interrupted: {
    label: '已中断',
    className: 'bg-muted text-muted-foreground',
    icon: CircleAlert,
  },
};

export function CollectorCenter() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<CollectorMode>('video');
  const [acknowledged, setAcknowledged] = useState(false);
  const [inspection, setInspection] = useState<CollectorInspection | null>(null);
  const [referer, setReferer] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CollectorJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [message, setMessage] = useState('');

  async function load(showError = false) {
    try {
      const response = await fetch('/api/collector', { cache: 'no-store' });
      const payload = (await response.json()) as CollectorPayload;
      if (!response.ok) throw new Error(payload.error || '采集任务读取失败');
      setJobs(payload.jobs || []);
      if (showError) setMessage('任务列表已刷新。');
    } catch (error) {
      if (showError || !jobs.length)
        setMessage(error instanceof Error ? error.message : '采集任务读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get('qiyu-capture');
    if (!fragment) return;
    try {
      const base64 = fragment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
      const value = JSON.parse(new TextDecoder().decode(bytes)) as { url?: unknown; referer?: unknown; mode?: unknown };
      const media = new URL(typeof value.url === 'string' ? value.url : '');
      if (!['http:', 'https:'].includes(media.protocol)) throw new Error('媒体链接无效');
      const page = typeof value.referer === 'string' ? new URL(value.referer) : null;
      if (page && !['http:', 'https:'].includes(page.protocol)) throw new Error('来源页面无效');
      setUrl(media.toString());
      setReferer(page?.toString() || null);
      setMode(value.mode === 'audio' ? 'audio' : 'video');
      setInspection(null);
      setAcknowledged(false);
      setMessage('已从浏览器嗅探扩展带入公开候选。请确认授权后，再手动开始采集。');
    } catch {
      setMessage('浏览器嗅探扩展传入的候选无效，未加入采集队列。');
    } finally {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      setMessage('请先粘贴一个公开媒体链接。');
      return;
    }
    if (!acknowledged) {
      setMessage('请先确认你拥有保存该内容的权利。');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/collector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          mode,
          acknowledged,
          referer: referer || undefined,
        }),
      });
      const payload = (await response.json()) as CollectorPayload;
      if (!response.ok) throw new Error(payload.error || '没有创建采集任务');
      setJobs((current) =>
        payload.job
          ? [
              payload.job,
              ...current.filter((item) => item.id !== payload.job?.id),
            ]
          : current,
      );
      setUrl('');
      setInspection(null);
      setReferer(null);
      setAcknowledged(false);
      setMessage('已加入采集队列。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '没有创建采集任务');
    } finally {
      setSubmitting(false);
    }
  }

  async function inspect() {
    if (!url.trim()) {
      setMessage('请先粘贴一个公开网页链接。');
      return;
    }
    if (!acknowledged) {
      setMessage('请先确认你拥有查看和保存该公开内容的权利。');
      return;
    }
    setInspecting(true);
    setMessage('');
    try {
      const response = await fetch('/api/collector/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), acknowledged }),
      });
      const payload = (await response.json()) as CollectorPayload;
      if (!response.ok || !payload.inspection) throw new Error(payload.error || '资源嗅探没有返回结果');
      setInspection(payload.inspection);
      setMessage(payload.inspection.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '资源嗅探没有完成');
    } finally {
      setInspecting(false);
    }
  }

  function useCandidate(candidate: CollectorInspectionCandidate) {
    setUrl(candidate.url);
    setMode(candidate.kind);
    setReferer(inspection?.source || null);
    setMessage(`已选用${candidate.kind === 'audio' ? '音频' : '视频'}资源；确认后即可加入采集队列。`);
  }

  const activeJobs = useMemo(
    () =>
      jobs.filter((job) => job.status === 'queued' || job.status === 'running'),
    [jobs],
  );

  return (
    <QiyuAppShell active="collect" eyebrow="栖屿采集" title="影音采集">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 border-b border-white/7 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-primary">私人影音采集</p>
            <h2 className="mt-1.5 text-3xl font-medium tracking-[-0.045em]">
              收集影音，直接保存到 NAS。
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              粘贴公开链接，选择视频或音频；其余交给栖屿处理。
            </p>
          </div>
          <Button
            onClick={() => void load(true)}
            variant="outline"
            className="w-fit rounded-lg border-border bg-card/65"
          >
            <RefreshCw className="size-4" />
            刷新任务
          </Button>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <form
            onSubmit={submit}
            className="rounded-2xl border border-border bg-card/60 p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Link2 className="size-5" />
              </span>
              <div>
                <h3 className="text-base font-medium">添加链接</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  可直接采集 yt-dlp 支持的公开链接，也可先嗅探网页中的公开媒体请求。
                </p>
              </div>
            </div>
            <div className="mt-6">
              <label htmlFor="collector-url" className="text-sm font-medium">
                媒体链接
              </label>
              <Input
                id="collector-url"
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setInspection(null);
                  setReferer(null);
                }}
                placeholder="https://example.com/video"
                autoComplete="url"
                className="mt-2 h-10 border-border bg-background/65"
              />
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 size-3.5 accent-[var(--primary)]"
                />
                <span>我确认有权查看和保存这项公开内容。</span>
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void inspect()}
                  disabled={inspecting || submitting}
                  className="rounded-lg border-border bg-card/65"
                >
                  {inspecting ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
                  {inspecting ? '正在嗅探…' : '嗅探网页资源'}
                </Button>
                <span className="text-xs text-muted-foreground">无头浏览器只使用临时空白配置，不读取 Cookie，也不会自动下载。</span>
              </div>
              {message ? (
                <p role="status" className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {message}
                </p>
              ) : null}
              {inspection ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/45 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">发现公开媒体资源</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">选择一个候选资源后，再点击“开始采集”。短时链接可能会过期。</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">{inspection.candidates.length} 个候选</span>
                  </div>
                  {inspection.candidates.length ? (
                    <div className="mt-3 grid gap-2">
                      {inspection.candidates.map((candidate) => <button key={candidate.url} type="button" onClick={() => useCandidate(candidate)} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background/55 px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/[0.06]">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{candidate.kind === 'audio' ? '音频资源' : '视频资源'} <span className="font-normal text-muted-foreground">· {candidate.label}</span></span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hostFor(candidate.url)}</span>
                        </span>
                        <span className="shrink-0 text-xs text-primary">选用</span>
                      </button>)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-5">
              <p className="text-sm font-medium">保存形式</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ModeButton
                  active={mode === 'video'}
                  onClick={() => setMode('video')}
                  icon={Film}
                  title="视频"
                  note="最高 2K（1440p）· 自动合并"
                />
                <ModeButton
                  active={mode === 'audio'}
                  onClick={() => setMode('audio')}
                  icon={FileAudio}
                  title="音频"
                  note="转换为 MP3"
                />
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-border bg-muted/45 p-3.5 text-sm">
              <p className="font-medium">按类型自动归档</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">视频保存到 <code>media/Videos</code>，音频保存到 <code>media/Audio</code>。之后可在文件中心按视频、图片、音频筛选。</p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                className="rounded-lg"
                disabled={submitting}
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {submitting ? '正在加入…' : '开始采集'}
              </Button>
              <span className="text-xs text-muted-foreground">
                依次执行，默认每项不超过 10 GB。
              </span>
            </div>
          </form>

          <aside className="rounded-2xl border border-border bg-muted/45 p-5 sm:p-6">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <h3 className="mt-5 text-base font-medium">只在你的空间里运行</h3>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>采集服务不对外开放，只能从已登录的栖屿使用。</li>
              <li>嗅探器使用临时浏览器，不读取账号、Cookie 或私有链接。</li>
              <li>仅捕获公开、非 DRM 的直接媒体请求；不会绕过访问控制。</li>
              <li>完成后可继续在文件中心整理和播放。</li>
            </ul>
            <a
              href="/files?filter=all"
              className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80"
            >
              <FolderArchive className="size-4" />
              查看媒体文件
            </a>
          </aside>
        </section>

        <section className="rounded-2xl border border-border bg-card/60">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h3 className="text-sm font-medium">采集任务</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeJobs.length
                  ? `${activeJobs.length} 个任务进行中，列表每 5 秒更新。`
                  : '最近任务会保留在这里，随时可以查看进度。'}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] ${activeJobs.length ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
            >
              {activeJobs.length ? '队列工作中' : '队列空闲'}
            </span>
          </div>
          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin text-primary" />
              正在读取任务
            </div>
          ) : jobs.length ? (
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
              <Download className="size-7 text-primary/70" />
              <p className="mt-4 text-sm font-medium">还没有采集任务</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                粘贴一个链接后，进度会显示在这里。
              </p>
            </div>
          )}
        </section>
      </div>
    </QiyuAppShell>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  title,
  note,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Film;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-primary/35 bg-primary/[0.08]' : 'border-border bg-background/40 hover:bg-muted'}`}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {note}
        </span>
      </span>
    </button>
  );
}

function JobRow({ job }: { job: CollectorJob }) {
  const state = statusStyle[job.status];
  const Icon = state.icon;
  const target = destinationLabels[job.destination] || '媒体目录';
  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="flex gap-3">
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${state.className}`}
        >
          <Icon
            className={`size-4 ${job.status === 'running' ? 'animate-spin' : ''}`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-medium">{hostFor(job.url)}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${state.className}`}
            >
              {state.label}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {job.mode === 'audio' ? '音频 MP3' : '视频 ≤ 2K'} · {target}
            </span>
          </div>
          <p
            className="mt-1 truncate text-xs text-muted-foreground"
            title={job.url}
          >
            {job.url}
          </p>
          <p
            className={`mt-2 text-xs ${job.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {job.message}
          </p>
          {job.status === 'running' || job.status === 'completed' ? (
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.max(job.status === 'completed' ? 100 : 2, Math.min(100, job.progress || 0))}%`,
                  }}
                />
              </div>
              <span className="w-9 text-right text-[11px] text-muted-foreground">
                {job.status === 'completed'
                  ? '完成'
                  : `${Math.max(0, Math.min(100, job.progress || 0))}%`}
              </span>
            </div>
          ) : null}
          {job.files?.length ? (
            <p className="mt-2 truncate text-[11px] text-muted-foreground">
              已保存：{job.files.map(fileName).join('、')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function hostFor(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return '媒体链接';
  }
}

function fileName(value: string) {
  return value.split('/').filter(Boolean).at(-1) || value;
}
