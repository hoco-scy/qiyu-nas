import {
  File as FileIcon,
  FileArchive,
  FileImage,
  Film,
  Folder,
  Music2,
  type LucideIcon,
} from 'lucide-react';

export type Section = 'home' | 'files' | 'video' | 'sites';
export type FileKind = 'folder' | 'video' | 'image' | 'archive' | 'audio' | 'document';
export type FileEntry = { id: number; name: string; kind: FileKind; size: string; updated: string };

export const initialFiles: FileEntry[] = [
  { id: 1, name: '家庭影像', kind: 'folder', size: '128 项', updated: '刚刚' },
  { id: 2, name: '旅行照片', kind: 'folder', size: '846 项', updated: '昨天' },
  { id: 3, name: '纪录片收藏', kind: 'folder', size: '42 项', updated: '8 月 26 日' },
  { id: 4, name: '青海湖日落.mp4', kind: 'video', size: '2.8 GB', updated: '18 分钟前' },
  { id: 5, name: '扫描件_2026.zip', kind: 'archive', size: '864 MB', updated: '昨天' },
  { id: 6, name: '封面选片.jpg', kind: 'image', size: '12.4 MB', updated: '8 月 28 日' },
  { id: 7, name: '深夜歌单.flac', kind: 'audio', size: '126 MB', updated: '8 月 24 日' },
  { id: 8, name: '设备清单.pdf', kind: 'document', size: '1.6 MB', updated: '8 月 21 日' },
];

export function fileVisual(kind: FileKind): { icon: LucideIcon; color: string } {
  return {
    folder: { icon: Folder, color: 'bg-amber-300/10 text-amber-200' },
    video: { icon: Film, color: 'bg-emerald-300/10 text-emerald-200' },
    image: { icon: FileImage, color: 'bg-sky-300/10 text-sky-200' },
    archive: { icon: FileArchive, color: 'bg-orange-300/10 text-orange-200' },
    audio: { icon: Music2, color: 'bg-violet-300/10 text-violet-200' },
    document: { icon: FileIcon, color: 'bg-slate-300/10 text-slate-200' },
  }[kind];
}
