import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { getFile, StorageError } from '@/lib/storage';
import { canPreview, mimeTypeFor } from '@/lib/mime';
import { isPortalAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseRange(value: string | null, size: number) {
  if (!value || !value.startsWith('bytes=')) return null;
  const [startValue, endValue] = value.slice(6).split('-', 2);
  const start = startValue ? Number.parseInt(startValue, 10) : 0;
  const end = endValue ? Number.parseInt(endValue, 10) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return 'invalid' as const;
  return { start, end: Math.min(end, size - 1) };
}

function contentDisposition(fileName: string, download: boolean) {
  // HTTP headers are ByteStrings. Keep the legacy filename fallback ASCII-only
  // while filename* below preserves the original UTF-8 Chinese name.
  const fallback = fileName.normalize('NFKD').replaceAll(/[^\x20-\x7E]|[\\"\r\n]/g, '_') || 'download';
  const mode = download || !canPreview(fileName) ? 'attachment' : 'inline';
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function failure(error: unknown) {
  if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status });
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return NextResponse.json({ error: '文件不存在' }, { status: 404 });
  console.error('Content API error', error);
  return NextResponse.json({ error: '文件无法读取' }, { status: 500 });
}

export async function GET(request: Request) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const requestedPath = url.searchParams.get('path') || '';
    const { target, details } = await getFile(requestedPath);
    const range = parseRange(request.headers.get('range'), details.size);
    if (range === 'invalid') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${details.size}` } });
    const fileName = path.basename(target);
    const start = range?.start || 0;
    const end = range?.end ?? details.size - 1;
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Type': mimeTypeFor(fileName),
      'Content-Disposition': contentDisposition(fileName, url.searchParams.get('download') === '1'),
      'Content-Length': String(end - start + 1),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${details.size}`);
    const stream = createReadStream(target, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
  } catch (error) {
    return failure(error);
  }
}

export async function HEAD(request: Request) {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
