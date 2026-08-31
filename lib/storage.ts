import { constants } from 'node:fs';
import { access, lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const storageRoot = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_ROOT || '/storage');

const rootFolders = [
  { name: 'files', label: '个人文件', description: '上传、整理与下载' },
  { name: 'media', label: '影音资源', description: 'Jellyfin 会扫描这里的影片和剧集' },
  { name: 'sites', label: '网页发布', description: '静态网页会发布到 /sites/' },
] as const;

export type StorageEntry = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size: number;
  modifiedAt: string;
  modifiedAtMs: number;
  extension: string;
};

export type StorageLocation = {
  path: string;
  label: string;
  description?: string;
  writable: boolean;
};

export class StorageError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function partsFor(input = '') {
  const normalized = input.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) return [];
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) {
    throw new StorageError('路径无效');
  }
  if (!rootFolders.some((root) => root.name === parts[0])) {
    throw new StorageError('只能访问栖屿数据目录', 403);
  }
  return parts;
}

function absolutePath(input = '') {
  const parts = partsFor(input);
  const target = path.resolve(storageRoot, ...parts);
  if (target !== storageRoot && !target.startsWith(`${storageRoot}${path.sep}`)) {
    throw new StorageError('路径无效');
  }
  return { parts, target };
}

async function assertSafePath(input: string, options: { allowMissingLeaf?: boolean } = {}) {
  const { parts, target } = absolutePath(input);
  let current = storageRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(/* turbopackIgnore: true */ current, parts[index]);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) throw new StorageError('不支持访问符号链接', 403);
    } catch (error) {
      if (options.allowMissingLeaf && index === parts.length - 1 && (error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

function entryPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

function assertName(name: unknown) {
  if (typeof name !== 'string') throw new StorageError('名称无效');
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..' || trimmed.startsWith('.') || trimmed.includes('\0') || /[\\/]/.test(trimmed)) {
    throw new StorageError('名称无效');
  }
  return trimmed;
}

async function toEntry(parent: string, name: string): Promise<StorageEntry | null> {
  const childPath = entryPath(parent, name);
  const absolute = await assertSafePath(childPath);
  const details = await lstat(absolute);
  if (details.isSymbolicLink()) return null;
  if (!details.isDirectory() && !details.isFile()) return null;
  return {
    name,
    path: childPath,
    type: details.isDirectory() ? 'directory' : 'file',
    size: details.size,
    modifiedAt: formatDate(details.mtime),
    modifiedAtMs: details.mtimeMs,
    extension: details.isDirectory() ? '' : path.extname(name).slice(1).toLowerCase(),
  };
}

export async function listDirectory(input = ''): Promise<{ location: StorageLocation; entries: StorageEntry[] }> {
  if (!input) {
    const entries = await Promise.all(rootFolders.map(async (root) => {
      const details = await stat(path.join(/* turbopackIgnore: true */ storageRoot, root.name));
      return {
        name: root.label,
        path: root.name,
        type: 'directory' as const,
        size: 0,
        modifiedAt: formatDate(details.mtime),
        modifiedAtMs: details.mtimeMs,
        extension: '',
      };
    }));
    return { location: { path: '', label: '栖屿空间', description: '文件、影音和网页发布目录', writable: false }, entries };
  }

  const target = await assertSafePath(input);
  const details = await lstat(target);
  if (!details.isDirectory()) throw new StorageError('目标不是文件夹');
  const children = await readdir(target, { withFileTypes: true });
  const entries = (await Promise.all(children.filter((entry) => !entry.name.startsWith('.')).map((entry) => toEntry(input, entry.name))))
    .filter((entry): entry is StorageEntry => entry !== null)
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'zh-CN') : a.type === 'directory' ? -1 : 1));
  const root = rootFolders.find((folder) => folder.name === input.split('/')[0]);
  return {
    location: {
      path: input,
      label: input.split('/').at(-1) || root?.label || '文件',
      description: input.split('/').length === 1 ? root?.description : undefined,
      writable: true,
    },
    entries,
  };
}

export async function listPublishedSites() {
  const { entries } = await listDirectory('sites');
  const directories = entries.filter((entry) => entry.type === 'directory');
  const published = await Promise.all(directories.map(async (entry) => {
    try {
      await getFile(`${entry.path}/index.html`);
      return entry;
    } catch {
      return null;
    }
  }));
  return published.filter((entry): entry is StorageEntry => entry !== null);
}

export async function getFile(input: string) {
  const target = await assertSafePath(input);
  const details = await lstat(target);
  if (!details.isFile() || details.isSymbolicLink()) throw new StorageError('文件不存在', 404);
  return { target, details };
}

export async function createDirectory(parent: string, name: unknown) {
  const safeName = assertName(name);
  const parentPath = await assertSafePath(parent);
  const parentInfo = await lstat(parentPath);
  if (!parentInfo.isDirectory() || !parent) throw new StorageError('请先进入一个文件夹');
  const targetInput = entryPath(parent, safeName);
  const target = await assertSafePath(targetInput, { allowMissingLeaf: true });
  await mkdir(target);
  return toEntry(parent, safeName);
}

export async function renameEntry(input: string, name: unknown) {
  const safeName = assertName(name);
  const { parts } = absolutePath(input);
  if (parts.length < 2) throw new StorageError('顶层目录不能改名', 403);
  const source = await assertSafePath(input);
  const sourceInfo = await lstat(source);
  if (sourceInfo.isSymbolicLink()) throw new StorageError('不支持符号链接', 403);
  const parent = parts.slice(0, -1).join('/');
  const targetInput = entryPath(parent, safeName);
  const target = await assertSafePath(targetInput, { allowMissingLeaf: true });
  try {
    await access(target, constants.F_OK);
    throw new StorageError('同名文件已存在', 409);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await rename(source, target);
  return toEntry(parent, safeName);
}

export async function deleteEntry(input: string) {
  const { parts } = absolutePath(input);
  if (parts.length < 2) throw new StorageError('顶层目录不能删除', 403);
  const target = await assertSafePath(input);
  const details = await lstat(target);
  if (details.isSymbolicLink()) throw new StorageError('不支持符号链接', 403);
  await rm(target, { recursive: details.isDirectory(), force: false });
}

export async function moveEntries(inputs: unknown, destination: unknown) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.some((input) => typeof input !== 'string')) {
    throw new StorageError('请选择要移动的文件');
  }
  if (typeof destination !== 'string' || !destination) throw new StorageError('请选择目标文件夹');

  const destinationParts = partsFor(destination);
  if (!destinationParts.length) throw new StorageError('不能移动到栖屿根目录');
  const destinationPath = await assertSafePath(destination);
  const destinationInfo = await lstat(destinationPath);
  if (!destinationInfo.isDirectory()) throw new StorageError('目标不是文件夹');

  const planned = await Promise.all(inputs.map(async (input) => {
    const { parts } = absolutePath(input);
    if (parts.length < 2) throw new StorageError('顶层目录不能移动', 403);
    if (destination === input || destination.startsWith(`${input}/`)) throw new StorageError('不能移动到自身内部');
    const source = await assertSafePath(input);
    const sourceInfo = await lstat(source);
    if (sourceInfo.isSymbolicLink()) throw new StorageError('不支持符号链接', 403);
    const targetInput = entryPath(destination, parts.at(-1)!);
    const target = await assertSafePath(targetInput, { allowMissingLeaf: true });
    try {
      await access(target, constants.F_OK);
      throw new StorageError(`目标已存在同名项目：${parts.at(-1)}`, 409);
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return { source, target };
  }));

  await Promise.all(planned.map(({ source, target }) => rename(source, target)));
}

export async function prepareUpload(parent: string, name: unknown) {
  const safeName = assertName(name);
  if (!parent) throw new StorageError('请先进入一个文件夹');
  const parentPath = await assertSafePath(parent);
  const parentInfo = await lstat(parentPath);
  if (!parentInfo.isDirectory()) throw new StorageError('目标不是文件夹');
  const targetInput = entryPath(parent, safeName);
  const target = await assertSafePath(targetInput, { allowMissingLeaf: true });
  return { target, targetInput, name: safeName };
}
