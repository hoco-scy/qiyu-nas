'use client';

import { ArrowLeft, ArrowUpDown, Download, File, FileArchive, FileAudio, FileCode2, FileImage, FileText, FileVideo, Folder, FolderPlus, Grid2X2, LayoutList, LoaderCircle, MoreHorizontal, MoveRight, Pencil, Search, Trash2, Upload, X } from 'lucide-react';
import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QiyuAppShell } from '@/components/qiyu-app-shell';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DocumentPreview } from '@/components/document-preview';

type Entry = { name: string; path: string; type: 'directory' | 'file'; size: number; modifiedAt: string; modifiedAtMs: number; extension: string };
type DirectoryPayload = { location: { path: string; label: string; description?: string; writable: boolean }; entries: Entry[] };
type SortKey = 'default' | 'name' | 'updated' | 'size';
type FileFilter = 'all' | 'video' | 'image' | 'audio' | 'document';

const roots = [
  { path: 'files', label: '个人文件', note: '日常资料与下载' },
  { path: 'media', label: '媒体文件', note: '视频、图片和音频' },
  { path: 'sites', label: '网页发布', note: 'HTML、CSS 和静态站点' },
];

const fileFilters: { value: FileFilter; label: string; icon: typeof File }[] = [
  { value: 'all', label: '全部', icon: File },
  { value: 'video', label: '视频', icon: FileVideo },
  { value: 'image', label: '图片', icon: FileImage },
  { value: 'audio', label: '音频', icon: FileAudio },
  { value: 'document', label: '文档', icon: FileText },
];

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico'];
const videoExtensions = ['mp4', 'm4v', 'mov', 'webm', 'ogv'];
const audioExtensions = ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'];
const documentExtensions = ['md', 'doc', 'docx', 'xls', 'xlsx'];
const textExtensions = ['txt', 'log', 'csv', 'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'properties', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'sql', 'sh', 'bash', 'zsh', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'php', 'rb', 'vue', 'svelte', 'svg'];

function canPreviewExtension(extension: string) {
  return imageExtensions.includes(extension) || videoExtensions.includes(extension) || audioExtensions.includes(extension) || extension === 'pdf' || documentExtensions.includes(extension) || textExtensions.includes(extension);
}

function formatBytes(value: number) {
  if (value === 0) return '0 B';
  if (!value) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

function contentUrl(path: string, download = false) {
  const search = new URLSearchParams({ path });
  if (download) search.set('download', '1');
  return `/api/files/content?${search}`;
}

function visualFor(entry: Entry) {
  if (entry.type === 'directory') return { icon: Folder, tone: 'bg-primary/10 text-primary' };
  if (imageExtensions.includes(entry.extension)) return { icon: FileImage, tone: 'bg-sky-300/10 text-sky-200' };
  if (videoExtensions.includes(entry.extension) || entry.extension === 'mkv') return { icon: FileVideo, tone: 'bg-violet-300/10 text-violet-200' };
  if (audioExtensions.includes(entry.extension)) return { icon: FileAudio, tone: 'bg-amber-200/10 text-amber-100' };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(entry.extension)) return { icon: FileArchive, tone: 'bg-orange-200/10 text-orange-100' };
  if (textExtensions.includes(entry.extension) || entry.extension === 'md') return { icon: FileCode2, tone: 'bg-cyan-200/10 text-cyan-100' };
  if (['pdf', 'txt', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(entry.extension)) return { icon: FileText, tone: 'bg-white/[0.07] text-muted-foreground' };
  return { icon: File, tone: 'bg-white/[0.05] text-muted-foreground' };
}

export function FileCenter() {
  const search = useSearchParams();
  const initialPath = search.get('path') || '';
  const incomingFilter = search.get('filter');
  const initialFilter: FileFilter = incomingFilter === 'video' || incomingFilter === 'image' || incomingFilter === 'audio' || incomingFilter === 'document' ? incomingFilter : 'all';
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [fileFilter, setFileFilter] = useState<FileFilter | null>(initialPath ? null : initialFilter);
  const [data, setData] = useState<DirectoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('default');
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [folderMode, setFolderMode] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Entry | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [destination, setDestination] = useState('files');
  const [renameTarget, setRenameTarget] = useState<Entry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load(pathname = currentPath, filter = fileFilter) {
    setLoading(true);
    try {
      const parameters = new URLSearchParams();
      if (!pathname && filter) parameters.set('filter', filter);
      else parameters.set('path', pathname);
      const response = await fetch(`/api/files?${parameters}`, { cache: 'no-store' });
      const payload = await response.json() as DirectoryPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || '目录读取失败');
      setData(payload);
      setSelected(new Set());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '目录读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(currentPath, fileFilter); }, [currentPath, fileFilter]);

  function go(pathname: string) {
    const target = pathname ? `/files?path=${encodeURIComponent(pathname)}` : '/files?filter=all';
    window.history.pushState({}, '', target);
    setCurrentPath(pathname);
    setFileFilter(pathname ? null : 'all');
    setQuery('');
  }

  function filterFiles(filter: FileFilter) {
    window.history.pushState({}, '', `/files?filter=${filter}`);
    setCurrentPath('');
    setFileFilter(filter);
    setQuery('');
  }

  function browseFolders() {
    window.history.pushState({}, '', '/files');
    setCurrentPath('');
    setFileFilter(null);
    setQuery('');
  }

  async function action(body: Record<string, unknown>) {
    const response = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || '文件操作失败');
    }
    await load();
  }

  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return;
    if (!currentPath) { setMessage('请先进入一个文件夹后再上传'); return; }
    let completed = 0;
    const pending = Array.from(files);
    setMessage(`正在上传 ${pending.length} 个文件…`);
    for (const file of pending) {
      try {
        const query = new URLSearchParams({ path: currentPath, name: file.name });
        const response = await fetch(`/api/files/upload?${query}`, { method: 'PUT', body: file });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(`${file.name}：${payload.error || '上传失败'}`);
        }
        completed += 1;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '上传失败');
        break;
      }
    }
    if (completed === pending.length) setMessage(`已上传 ${completed} 个文件`);
    if (fileInput.current) fileInput.current.value = '';
    await load();
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await action({ action: 'mkdir', path: currentPath, name: folderName });
      setFolderName('');
      setFolderMode(false);
      setMessage('已新建文件夹');
    } catch (error) { setMessage(error instanceof Error ? error.message : '新建失败'); }
  }

  function openRename(entry: Entry) {
    setRenameTarget(entry);
    setRenameName(entry.name);
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget || !renameName.trim() || renameName.trim() === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    try {
      await action({ action: 'rename', path: renameTarget.path, name: renameName });
      setRenameTarget(null);
      setMessage('已改名');
    } catch (error) { setMessage(error instanceof Error ? error.message : '改名失败'); }
  }

  function openDelete(paths: string[]) {
    if (paths.length) setDeleteTargets(paths);
  }

  async function deleteSelected() {
    try {
      for (const path of deleteTargets) await action({ action: 'delete', path });
      setMessage(`已删除 ${deleteTargets.length} 个项目`);
      setDeleteTargets([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : '删除失败'); }
  }

  async function moveSelected() {
    try {
      await action({ action: 'move', paths: Array.from(selected), destination });
      setMoveOpen(false);
      setMessage(`已移动 ${selected.size} 个项目`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '移动失败'); }
  }

  function toggle(path: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(path); else next.delete(path);
      return next;
    });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files);
  }

  const breadcrumbs = useMemo(() => currentPath ? currentPath.split('/') : [], [currentPath]);
  const parentPath = breadcrumbs.slice(0, -1).join('/');
  const entries = useMemo(() => {
    const filtered = (data?.entries || []).filter((entry) => entry.name.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN')));
    return [...filtered].sort((left, right) => {
      if (sort === 'default') return 0;
      if (sort === 'name') return left.name.localeCompare(right.name, 'zh-CN');
      if (sort === 'updated') return right.modifiedAtMs - left.modifiedAtMs;
      return right.size - left.size;
    });
  }, [data?.entries, query, sort]);
  const allSelected = entries.length > 0 && entries.every((entry) => selected.has(entry.path));
  const activeFilter = fileFilters.find((item) => item.value === fileFilter);
  const isFiltered = fileFilter !== null;

  return <QiyuAppShell active="files" eyebrow="栖屿文件" title="文件中心">
    <div className="space-y-5">
      <section className="flex flex-col gap-4 border-b border-white/7 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm text-primary">本地文件空间</p><h2 className="mt-1.5 text-3xl font-medium tracking-[-0.045em]">文件，放得清楚。</h2><p className="mt-2 text-sm text-muted-foreground">上传、预览、整理与移动，都在一个地方。</p></div><div className="flex flex-wrap gap-2"><input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => void upload(event.target.files)} /><Button variant="outline" onClick={() => setFolderMode((open) => !open)} className="rounded-lg border-white/8 bg-white/[0.025]" disabled={!currentPath}><FolderPlus className="size-4" />新建文件夹</Button><Button onClick={() => fileInput.current?.click()} className="rounded-lg" disabled={!currentPath}><Upload className="size-4" />上传</Button></div></section>

      <section className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3.5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium text-muted-foreground">从整个空间筛选</p><div className="mt-2 flex flex-wrap gap-1.5">{fileFilters.map((item) => { const Icon = item.icon; const selected = item.value === fileFilter; return <button key={item.value} onClick={() => filterFiles(item.value)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${selected ? 'border-primary/30 bg-primary/10 text-primary' : 'border-white/8 bg-black/10 text-muted-foreground hover:text-foreground'}`}><Icon className="size-3.5" />{item.label}</button>; })}</div></div><button onClick={browseFolders} className={`w-fit rounded-lg border px-3 py-2 text-xs transition ${isFiltered ? 'border-white/8 bg-black/10 text-muted-foreground hover:text-foreground' : 'border-primary/30 bg-primary/10 text-primary'}`}><Folder className="mr-1.5 inline size-3.5" />按文件夹浏览</button></section>

      <section onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`rounded-2xl border transition ${dragging ? 'border-primary/50 bg-primary/[0.08]' : 'border-white/8 bg-white/[0.025]'}`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/7 px-3 py-2.5 sm:px-5"><button disabled={!currentPath} onClick={() => go(parentPath)} className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-30" aria-label="上一级"><ArrowLeft className="size-4" /></button><div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">{isFiltered ? <span className="flex items-center gap-2 font-medium"><span className="text-muted-foreground">已筛选</span>{activeFilter?.label || '文件'}</span> : <><button onClick={() => go('')} className="shrink-0 text-muted-foreground hover:text-foreground">栖屿空间</button>{breadcrumbs.map((part, index) => { const crumb = breadcrumbs.slice(0, index + 1).join('/'); const label = index === 0 ? roots.find((root) => root.path === part)?.label || part : part; return <span key={crumb} className="flex shrink-0 items-center gap-1"><span className="text-muted-foreground/50">/</span><button onClick={() => go(crumb)} className={index === breadcrumbs.length - 1 ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}>{label}</button></span>; })}</>}</div><div className="relative w-full sm:w-52"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 border-white/8 bg-black/10 pl-8 text-xs" placeholder={isFiltered ? '在筛选结果中搜索' : '在当前目录搜索'} /></div><button onClick={() => setView((current) => current === 'grid' ? 'list' : 'grid')} className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground" aria-label="切换视图">{view === 'grid' ? <LayoutList className="size-4" /> : <Grid2X2 className="size-4" />}</button></div>

        {folderMode ? <form onSubmit={createFolder} className="flex items-center gap-2 border-b border-white/7 bg-primary/[0.035] px-4 py-3 sm:px-5"><FolderPlus className="size-4 text-primary" /><Input value={folderName} onChange={(event) => setFolderName(event.target.value)} autoFocus placeholder="新文件夹名称" className="h-8 border-white/8 bg-black/10 text-sm" /><Button size="sm" type="submit" className="rounded-lg">创建</Button><button type="button" onClick={() => setFolderMode(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5"><X className="size-4" /></button></form> : null}
        {message ? <div className="flex items-center justify-between border-b border-white/7 bg-white/[0.02] px-4 py-2.5 text-xs text-muted-foreground sm:px-5"><span>{message}</span><button onClick={() => setMessage('')} className="rounded p-1 hover:bg-white/5" aria-label="关闭提示"><X className="size-3" /></button></div> : null}
        {selected.size ? <div className="flex flex-wrap items-center gap-2 border-b border-primary/15 bg-primary/[0.055] px-4 py-2.5 text-xs sm:px-5"><span className="mr-1 text-primary">已选择 {selected.size} 项</span><Button size="sm" variant="outline" onClick={() => { setDestination(currentPath.split('/')[0] || 'files'); setMoveOpen(true); }} className="h-7 rounded-md border-primary/20 bg-transparent"><MoveRight className="size-3.5" />移动</Button><Button size="sm" variant="ghost" onClick={() => openDelete(Array.from(selected))} className="h-7 rounded-md text-red-200 hover:bg-red-300/10 hover:text-red-100"><Trash2 className="size-3.5" />删除</Button><button onClick={() => setSelected(new Set())} className="ml-auto text-muted-foreground hover:text-foreground">取消选择</button></div> : null}

        <div className="min-h-[390px] p-3 sm:p-5">{loading ? <div className="flex min-h-[330px] items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-primary" />正在读取文件</div> : !entries.length ? <EmptyState path={currentPath} filtered={Boolean(query)} isFiltered={isFiltered} onUpload={() => fileInput.current?.click()} /> : view === 'grid' ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{entries.map((entry) => <FileCard key={entry.path} entry={entry} selected={selected.has(entry.path)} onToggle={toggle} onOpen={() => entry.type === 'directory' ? go(entry.path) : setPreview(entry)} onRename={() => openRename(entry)} onDelete={() => openDelete([entry.path])} />)}</div> : <div><div className="grid grid-cols-[36px_minmax(0,1fr)_44px] items-center border-b border-white/7 px-2 pb-2 text-[11px] text-muted-foreground sm:grid-cols-[36px_minmax(240px,1fr)_130px_110px_44px]"><Checkbox checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? new Set(entries.map((entry) => entry.path)) : new Set())} /><span>名称</span><button onClick={() => setSort((current) => current === 'updated' ? 'default' : 'updated')} className="hidden items-center gap-1 text-left hover:text-foreground sm:flex">修改时间 <ArrowUpDown className="size-3" /></button><button onClick={() => setSort((current) => current === 'size' ? 'default' : 'size')} className="hidden items-center gap-1 text-left hover:text-foreground sm:flex">大小 <ArrowUpDown className="size-3" /></button></div>{entries.map((entry) => <FileRow key={entry.path} entry={entry} selected={selected.has(entry.path)} onToggle={toggle} onOpen={() => entry.type === 'directory' ? go(entry.path) : setPreview(entry)} onRename={() => openRename(entry)} onDelete={() => openDelete([entry.path])} />)}</div>}</div>
      </section>
    </div>
    <PreviewDialog entry={preview} onClose={() => setPreview(null)} />
    <RenameDialog entry={renameTarget} name={renameName} onName={setRenameName} onClose={() => setRenameTarget(null)} onSubmit={submitRename} />
    <DeleteDialog paths={deleteTargets} onClose={() => setDeleteTargets([])} onDelete={() => void deleteSelected()} />
    <MoveDialog open={moveOpen} destination={destination} onDestination={setDestination} onClose={() => setMoveOpen(false)} onMove={() => void moveSelected()} count={selected.size} />
  </QiyuAppShell>;
}

function EmptyState({ path, filtered, isFiltered, onUpload }: { path: string; filtered: boolean; isFiltered: boolean; onUpload: () => void }) {
  return <div className="flex min-h-[330px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center"><Folder className="size-7 text-muted-foreground" /><p className="mt-4 text-sm font-medium">{filtered ? '没有匹配的文件' : isFiltered ? '还没有找到这类文件' : path ? '这个文件夹还是空的' : '选择一个文件夹开始管理'}</p><p className="mt-1.5 max-w-xs text-xs leading-5 text-muted-foreground">{filtered ? '换个关键词试试。' : isFiltered ? '文件会按类型从整个个人空间统一显示。' : path ? '可直接拖入文件，或使用上传按钮。' : '也可以切换到视频、图片、音频或文档筛选。'}</p>{path && !filtered ? <Button onClick={onUpload} variant="outline" className="mt-5 rounded-lg border-white/10 bg-white/[0.02]"><Upload className="size-4" />上传文件</Button> : null}</div>;
}

function EntryMenu({ downloadHref, onRename, onDelete }: { downloadHref?: string; onRename: () => void; onDelete: () => void }) {
  return <details className="relative z-20"><summary className="list-none rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 z-30 mt-1 w-28 rounded-lg border border-border bg-popover p-1 shadow-xl">{downloadHref ? <a href={downloadHref} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-muted"><Download className="size-3.5" />下载</a> : null}<button onClick={onRename} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-muted"><Pencil className="size-3.5" />改名</button><button onClick={onDelete} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" />删除</button></div></details>;
}

function FileCard({ entry, selected, onToggle, onOpen, onRename, onDelete }: { entry: Entry; selected: boolean; onToggle: (path: string, checked: boolean) => void; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  const visual = visualFor(entry); const Icon = visual.icon;
  return <div className={`group rounded-xl border p-3 transition ${selected ? 'border-primary/35 bg-primary/[0.06]' : 'border-white/7 bg-black/10 hover:border-white/14 hover:bg-white/[0.03]'}`}><div className="flex items-start justify-between"><Checkbox checked={selected} onCheckedChange={(checked) => onToggle(entry.path, checked)} /><div className="flex items-center gap-1"><EntryMenu onRename={onRename} onDelete={onDelete} /></div></div><button onClick={onOpen} className={`mt-7 flex size-10 items-center justify-center rounded-lg ${visual.tone}`}><Icon className="size-5" /></button><button onClick={onOpen} className="mt-4 block w-full truncate text-left text-sm font-medium">{entry.name}</button><div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground"><span>{entry.type === 'directory' ? '文件夹' : formatBytes(entry.size)}</span><span>{entry.modifiedAt}</span></div>{entry.type === 'file' ? <a href={contentUrl(entry.path, true)} className="mt-4 flex w-fit items-center gap-1 text-xs text-primary"><Download className="size-3" />下载</a> : null}</div>;
}

function FileRow({ entry, selected, onToggle, onOpen, onRename, onDelete }: { entry: Entry; selected: boolean; onToggle: (path: string, checked: boolean) => void; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  const visual = visualFor(entry); const Icon = visual.icon;
  return <div className={`grid grid-cols-[36px_minmax(0,1fr)_44px] items-center rounded-lg px-2 py-2 transition sm:grid-cols-[36px_minmax(240px,1fr)_130px_110px_44px] ${selected ? 'bg-primary/[0.06]' : 'hover:bg-white/[0.025]'}`}><Checkbox checked={selected} onCheckedChange={(checked) => onToggle(entry.path, checked)} /><button onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left"><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${visual.tone}`}><Icon className="size-4" /></span><span className="min-w-0"><span className="block truncate text-sm">{entry.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{entry.type === 'directory' ? '文件夹' : entry.extension.toUpperCase() || '文件'}</span></span></button><span className="hidden text-xs text-muted-foreground sm:block">{entry.modifiedAt}</span><span className="hidden text-xs text-muted-foreground sm:block">{entry.type === 'directory' ? '—' : formatBytes(entry.size)}</span><EntryMenu downloadHref={entry.type === 'file' ? contentUrl(entry.path, true) : undefined} onRename={onRename} onDelete={onDelete} /></div>;
}

function PreviewDialog({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const previewable = entry && canPreviewExtension(entry.extension);
  return <Dialog open={Boolean(entry)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden border-border bg-popover p-0 sm:max-w-6xl" showCloseButton><DialogHeader className="border-b border-border px-5 py-4 pr-12"><DialogTitle className="truncate">{entry?.name}</DialogTitle><DialogDescription>{entry ? `${entry.extension.toUpperCase() || '文件'} · ${formatBytes(entry.size)}` : ''}</DialogDescription></DialogHeader><div className="min-h-[280px] overflow-y-auto bg-muted/50 p-4 sm:p-6">{entry && previewable ? <PreviewContent entry={entry} /> : <div className="flex min-h-[260px] flex-col items-center justify-center text-center"><File className="size-8 text-muted-foreground" /><p className="mt-4 text-sm">此格式暂不支持原位预览</p><a href={entry ? contentUrl(entry.path, true) : '#'} className="mt-4 text-sm text-primary">下载文件</a></div>}</div><DialogFooter className="mx-0 mb-0 rounded-none border-border bg-muted/60"><Button variant="outline" onClick={onClose} className="rounded-lg border-border">关闭</Button>{entry ? <a href={contentUrl(entry.path, true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/85"><Download className="size-4" />下载</a> : null}</DialogFooter></DialogContent></Dialog>;
}

function PreviewContent({ entry }: { entry: Entry }) {
  const url = contentUrl(entry.path);
  if (imageExtensions.includes(entry.extension)) return <img src={url} alt={entry.name} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" />;
  if (videoExtensions.includes(entry.extension)) return <video src={url} controls className="mx-auto max-h-[65vh] w-full rounded-lg" />;
  if (audioExtensions.includes(entry.extension)) return <div className="flex min-h-[240px] items-center justify-center"><audio src={url} controls className="w-full max-w-lg" /></div>;
  if (documentExtensions.includes(entry.extension) || textExtensions.includes(entry.extension)) return <DocumentPreview key={entry.path} entry={entry} url={url} />;
  return <iframe title={entry.name} sandbox="" src={url} className="h-[65vh] w-full rounded-lg border border-white/10 bg-white" />;
}

function RenameDialog({ entry, name, onName, onClose, onSubmit }: { entry: Entry | null; name: string; onName: (value: string) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <Dialog open={Boolean(entry)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="border-border bg-popover"><form onSubmit={onSubmit}><DialogHeader><DialogTitle>重命名</DialogTitle><DialogDescription>为“{entry?.name}”输入新的名称。</DialogDescription></DialogHeader><Input value={name} onChange={(event) => onName(event.target.value)} autoFocus required className="mt-5 border-border bg-background/65" aria-label="新的名称" /><DialogFooter><Button type="button" variant="outline" onClick={onClose} className="rounded-lg border-border">取消</Button><Button type="submit" className="rounded-lg"><Pencil className="size-4" />保存名称</Button></DialogFooter></form></DialogContent></Dialog>;
}

function DeleteDialog({ paths, onClose, onDelete }: { paths: string[]; onClose: () => void; onDelete: () => void }) {
  return <Dialog open={paths.length > 0} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="border-border bg-popover"><DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>将永久删除 {paths.length} 个项目；文件夹内的内容也会一并删除。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={onClose} className="rounded-lg border-border">取消</Button><Button variant="destructive" onClick={onDelete} className="rounded-lg"><Trash2 className="size-4" />确认删除</Button></DialogFooter></DialogContent></Dialog>;
}

function MoveDialog({ open, destination, onDestination, onClose, onMove, count }: { open: boolean; destination: string; onDestination: (value: string) => void; onClose: () => void; onMove: () => void; count: number }) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}><DialogContent className="border-border bg-popover"><DialogHeader><DialogTitle>移动 {count} 个项目</DialogTitle><DialogDescription>选择一个栖屿空间作为目标。为避免覆盖，目标内不能已有同名项目。</DialogDescription></DialogHeader><div className="grid gap-2">{roots.map((root) => <button key={root.path} onClick={() => onDestination(root.path)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${destination === root.path ? 'border-primary/35 bg-primary/[0.08]' : 'border-border hover:bg-muted'}`}><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Folder className="size-4" /></span><span><span className="block text-sm font-medium">{root.label}</span><span className="block text-xs text-muted-foreground">{root.note}</span></span></button>)}</div><DialogFooter><Button variant="outline" onClick={onClose} className="rounded-lg border-border">取消</Button><Button onClick={onMove} className="rounded-lg"><MoveRight className="size-4" />移动到这里</Button></DialogFooter></DialogContent></Dialog>;
}
