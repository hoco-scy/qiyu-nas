'use client';

import { Clapperboard, Download, Film, FolderOpen, LoaderCircle, Play, Plus, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { QiyuAppShell } from '@/components/qiyu-app-shell';
import { Input } from '@/components/ui/input';

type MediaItem = { id: string; name: string; type: string; overview: string; year: number | null; runtimeMinutes: number | null; image: string | null; backdrop: string | null; progress: number | null };
function descriptionFor(item: MediaItem) {
  const details = [item.year, item.runtimeMinutes ? `${item.runtimeMinutes} 分钟` : null].filter(Boolean).join(' · ');
  return details || (item.type === 'Series' ? '剧集' : '本地影音');
}

export function MediaFront() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const itemsResponse = await fetch('/api/media?resource=items', { cache: 'no-store' });
      const list = await itemsResponse.json() as { items?: MediaItem[]; error?: string };
      if (!itemsResponse.ok) throw new Error(list.error || '影音引擎没有响应');
      setItems(list.items || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '影音引擎没有响应'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const filteredItems = useMemo(() => items.filter((item) => `${item.name} ${item.overview}`.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN'))), [items, query]);
  const hero = useMemo(() => filteredItems.find((item) => item.backdrop) || filteredItems[0] || null, [filteredItems]);

  return <QiyuAppShell active="media" eyebrow="栖屿影音" title="影音">
    <div className="space-y-7">
      {playing ? <Player item={playing} onClose={() => setPlaying(null)} /> : null}
      <section className="flex flex-col justify-between gap-4 border-b border-white/7 pb-6 md:flex-row md:items-end"><div><p className="text-sm text-primary">本地影音资料库</p><h2 className="mt-1.5 text-3xl font-medium tracking-[-0.045em]">随时开始，也随时继续。</h2><p className="mt-2 text-sm text-muted-foreground">不必先区分电影和剧集；把视频放进空间，栖屿会统一整理。</p></div><div className="flex flex-wrap gap-2"><Button onClick={() => void load()} variant="outline" className="rounded-lg border-white/10 bg-white/[0.02]"><RefreshCw className="size-4" />刷新</Button><a href="/collect" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15"><Download className="size-4" />采集影音</a><a href="/files?filter=video" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"><Plus className="size-4" />查看视频</a></div></section>
      <section className="flex justify-end"><div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 border-white/8 bg-black/10 pl-8 text-xs" placeholder="搜索影音库" /></div></section>
      {loading ? <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-white/8 bg-white/[0.025] text-sm text-muted-foreground"><LoaderCircle className="mr-3 size-5 animate-spin text-primary" />正在连接影音引擎</section> : error ? <EngineError error={error} onRetry={() => void load()} /> : !items.length ? <EmptyMedia /> : <>
        {hero ? <section className="media-hero group relative min-h-[270px] overflow-hidden rounded-2xl border border-white/8">{hero.backdrop ? <img src={hero.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" /> : null}<div className="media-hero-overlay absolute inset-0" /><div className="relative flex min-h-[270px] max-w-2xl flex-col justify-end p-6 sm:p-8"><span className="mb-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/15 px-3 py-1 text-[11px] text-white/70"><Sparkles className="size-3 text-primary" />继续观看</span><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">私人影音资料库</p><h3 className="mt-3 text-3xl font-medium tracking-tight">{hero.name}</h3><p className="mt-3 max-w-xl text-sm leading-6 text-white/65">{hero.overview || '从自己的 NAS 直接开始播放；媒体信息与播放进度会由影音引擎自动整理。'}</p><div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => setPlaying(hero)} className="rounded-lg"><Play className="size-4 fill-current" />开始播放</Button><a href="/files?filter=video" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-black/15 px-3 text-sm font-medium text-white hover:bg-white/10"><FolderOpen className="size-4" />查看视频文件</a></div></div></section> : null}
        <section><div className="mb-4 flex items-end justify-between"><div><h3 className="font-medium">最近入库</h3><p className="mt-1 text-xs text-muted-foreground">{filteredItems.length} / {items.length} 个可播放条目 · 由影音引擎统一整理</p></div><span className="flex items-center gap-1.5 text-xs text-primary"><span className="size-1.5 rounded-full bg-primary" />影音引擎在线</span></div>{filteredItems.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{filteredItems.map((item) => <MediaCard key={item.id} item={item} onPlay={() => setPlaying(item)} />)}</div> : <div className="rounded-xl border border-dashed border-white/10 py-14 text-center text-sm text-muted-foreground">没有找到匹配的影音条目。</div>}</section>
      </>}
    </div>
  </QiyuAppShell>;
}

function MediaCard({ item, onPlay }: { item: MediaItem; onPlay: () => void }) {
  return <button onClick={onPlay} className="group text-left"><div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-[#17332f] via-[#36544d] to-[#8c694f]">{item.image ? <img src={item.image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="absolute inset-0 flex items-center justify-center"><Film className="size-9 text-white/35" /></div>}<div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" /><span className="absolute inset-0 flex items-center justify-center"><span className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/90 opacity-0 backdrop-blur-md transition group-hover:opacity-100"><Play className="ml-0.5 size-4 fill-current" /></span></span>{item.progress ? <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full bg-primary" style={{ width: `${item.progress}%` }} /></div> : null}</div><p className="mt-3 truncate text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{descriptionFor(item)}</p></button>;
}

function EmptyMedia() {
  return <section className="flex min-h-[360px] flex-col justify-center rounded-3xl border border-white/8 bg-white/[0.025] p-8"><div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Clapperboard className="size-6" /></div><p className="mt-7 text-sm text-primary">影音库已经就绪</p><h3 className="mt-2 text-3xl font-medium tracking-tight">放入第一段视频吧</h3><p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">将视频放进 <code className="text-primary">media/Videos</code>，无需先判断电影或剧集。Jellyfin 扫描后，封面和条目会自动出现在这里。</p><a href="/files?filter=video" className="mt-7 inline-flex h-8 w-fit items-center gap-1.5 rounded-xl bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"><FolderOpen className="size-4" />查看视频</a></section>;
}

function EngineError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <section className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-amber-200/15 bg-amber-200/[0.03] p-8 text-center"><Clapperboard className="size-8 text-amber-200" /><h3 className="mt-5 text-xl font-medium">影音引擎暂时没有连上</h3><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button onClick={onRetry} variant="outline" className="mt-6 rounded-xl border-white/10 bg-white/[0.02]"><RefreshCw className="size-4" />重新连接</Button></section>;
}

function Player({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#07100f]/90 p-4 backdrop-blur-xl"><section className="w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[#101c1a] shadow-2xl"><div className="flex items-center justify-between border-b border-white/8 px-4 py-3 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">栖屿播放器 · Jellyfin 流媒体引擎</p></div><button onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground" aria-label="关闭播放器"><X className="size-5" /></button></div><div className="bg-black"><video autoPlay controls playsInline className="aspect-video w-full" src={`/api/media/stream/${encodeURIComponent(item.id)}`}><track kind="captions" /></video></div><div className="p-4 text-xs text-muted-foreground"><p>播放、媒体资料与引擎通信均由栖屿中心代管，无需再次登录 Jellyfin。</p></div></section></div>;
}
