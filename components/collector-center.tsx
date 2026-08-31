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
  ShieldCheck,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { QiyuAppShell } from '@/components/qiyu-app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  CollectorDestination,
  CollectorJob,
  CollectorMode,
} from '@/lib/collector';

type CollectorPayload = {
  jobs?: CollectorJob[];
  job?: CollectorJob;
  error?: string;
};

const destinations: {
  value: CollectorDestination;
  label: string;
  note: string;
}[] = [
  { value: 'inbox', label: '影音收集箱', note: 'media/Inbox，整理后再归档' },
  { value: 'movies', label: '影片库', note: 'media/Movies，供 Jellyfin 扫描' },
  { value: 'shows', label: '剧集库', note: 'media/Shows，供 Jellyfin 扫描' },
];

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
  const [destination, setDestination] = useState<CollectorDestination>('inbox');
  const [acknowledged, setAcknowledged] = useState(false);
  const [jobs, setJobs] = useState<CollectorJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
          destination,
          acknowledged,
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
      setAcknowledged(false);
      setMessage('已加入采集队列。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '没有创建采集任务');
    } finally {
      setSubmitting(false);
    }
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
              粘贴公开链接，选择格式和位置；其余交给栖屿处理。
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
                  支持 yt-dlp 可识别的公开链接，不需要额外登录。
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
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/video"
                autoComplete="url"
                className="mt-2 h-10 border-border bg-background/65"
              />
            </div>
            <div className="mt-5">
              <p className="text-sm font-medium">保存形式</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ModeButton
                  active={mode === 'video'}
                  onClick={() => setMode('video')}
                  icon={Film}
                  title="视频"
                  note="最高 1080p · 自动合并"
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
            <div className="mt-5">
              <p className="text-sm font-medium">保存到</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {destinations.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    onClick={() => setDestination(item.value)}
                    className={`rounded-xl border p-3 text-left transition ${destination === item.value ? 'border-primary/35 bg-primary/[0.08]' : 'border-border bg-background/40 hover:bg-muted'}`}
                  >
                    <FolderArchive className="size-4 text-primary" />
                    <span className="mt-3 block text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                      {item.note}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 size-3.5 accent-[var(--primary)]"
              />
              <span>
                我确认有权保存这项公开内容。
              </span>
            </label>
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
                依次执行，默认每项不超过 5 GB。
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
              <li>不读取浏览器账号、Cookie 或私有链接。</li>
              <li>完成后可继续在文件中心整理和播放。</li>
            </ul>
            <a
              href="/files?path=media"
              className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80"
            >
              <FolderArchive className="size-4" />
              打开媒体文件夹
            </a>
          </aside>
        </section>

        {message ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <span>{message}</span>
            <button
              onClick={() => setMessage('')}
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="关闭提示"
            >
              ×
            </button>
          </div>
        ) : null}

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
  const target =
    destinations.find((item) => item.value === job.destination)?.label ||
    '媒体目录';
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
              {job.mode === 'audio' ? '音频 MP3' : '视频 ≤ 1080p'} · {target}
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
