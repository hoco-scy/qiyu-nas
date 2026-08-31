import { readFile, readdir, stat, statfs } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { isPortalAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const storageRoot = process.env.STORAGE_ROOT || '/storage';
const videoExtensions = new Set(['.mp4', '.mkv', '.mov', '.m4v', '.avi', '.webm', '.ts', '.m2ts']);

type RecentEntry = { name: string; path: string; size: number; mtimeMs: number; updated: string };
type CpuSnapshot = { total: number; idle: number };

let previousCpu: CpuSnapshot | null = null;

function safeSystemMetric(read: () => number) {
  try {
    return read();
  } catch {
    return 0;
  }
}

async function inspectFiles() {
  let files = 0;
  let videos = 0;
  const recent: RecentEntry[] = [];
  const pending = [storageRoot];

  while (pending.length && files < 10000) {
    const directory = pending.pop()!;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      if (videoExtensions.has(path.extname(entry.name).toLowerCase())) videos += 1;
      try {
        const details = await stat(absolute);
        recent.push({
          name: entry.name,
          path: path.relative(storageRoot, absolute),
          size: details.size,
          mtimeMs: details.mtimeMs,
          updated: new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(details.mtime),
        });
        recent.sort((a, b) => b.mtimeMs - a.mtimeMs);
        recent.length = Math.min(recent.length, 5);
      } catch {
        // The file may have moved while the directory was being scanned.
      }
    }
  }

  return { files, videos, recent: recent.map(({ mtimeMs: _mtimeMs, ...entry }) => entry) };
}

function parseCpuSnapshot(statFile: string): CpuSnapshot | null {
  const line = statFile.split('\n').find((item) => item.startsWith('cpu '));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 4 || values.some(Number.isNaN)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return { total, idle: values[3] + (values[4] || 0) };
}

async function cpuUsage() {
  try {
    const snapshot = parseCpuSnapshot(await readFile('/proc/stat', 'utf8'));
    if (!snapshot) return 0;
    const earlier = previousCpu;
    if (!earlier) {
      await new Promise((resolve) => setTimeout(resolve, 160));
      const later = parseCpuSnapshot(await readFile('/proc/stat', 'utf8'));
      if (!later) return 0;
      previousCpu = later;
      return calculateCpuPercent(snapshot, later);
    }
    previousCpu = snapshot;
    return calculateCpuPercent(earlier, snapshot);
  } catch {
    return 0;
  }
}

function calculateCpuPercent(earlier: CpuSnapshot, later: CpuSnapshot) {
  const totalDelta = later.total - earlier.total;
  const idleDelta = later.idle - earlier.idle;
  return totalDelta > 0 ? Math.round(Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100))) : 0;
}

export async function GET() {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const [filesystem, content, cpuPercent] = await Promise.all([statfs(storageRoot), inspectFiles(), cpuUsage()]);
    const total = filesystem.blocks * filesystem.bsize;
    const available = filesystem.bavail * filesystem.bsize;
    const used = Math.max(0, total - filesystem.bfree * filesystem.bsize);
    const memoryTotal = safeSystemMetric(() => os.totalmem());
    const memoryAvailable = safeSystemMetric(() => os.freemem());
    const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);
    return NextResponse.json({
      hostname: process.env.NAS_HOSTNAME || os.hostname(),
      storage: {
        total,
        used,
        available,
        percent: total ? Math.round((used / total) * 100) : 0,
      },
      files: content.files,
      videos: content.videos,
      recent: content.recent,
      cpu: {
        percent: cpuPercent,
        cores: safeSystemMetric(() => os.cpus().length),
      },
      memory: {
        total: memoryTotal,
        used: memoryUsed,
        available: memoryAvailable,
        percent: memoryTotal ? Math.round((memoryUsed / memoryTotal) * 100) : 0,
      },
      uptime: safeSystemMetric(() => os.uptime()),
    });
  } catch (error) {
    console.error('Unable to read NAS status', error);
    return NextResponse.json({ error: 'status_unavailable' }, { status: 503 });
  }
}
