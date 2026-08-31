import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextResponse } from 'next/server';
import { prepareUpload, StorageError } from '@/lib/storage';
import { isPortalAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status });
  if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') return NextResponse.json({ error: '同名文件已存在' }, { status: 409 });
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return NextResponse.json({ error: '目标文件夹不存在' }, { status: 404 });
  console.error('Upload API error', error);
  return NextResponse.json({ error: '上传没有完成' }, { status: 500 });
}

export async function PUT(request: Request) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  let temporary = '';
  try {
    const url = new URL(request.url);
    const parent = url.searchParams.get('path') || '';
    const fileName = url.searchParams.get('name') || '';
    if (!request.body) return NextResponse.json({ error: '上传内容为空' }, { status: 400 });
    const upload = await prepareUpload(parent, fileName);
    temporary = `${upload.target}.qiyu-upload-${crypto.randomUUID()}`;
    await pipeline(Readable.fromWeb(request.body as import('node:stream/web').ReadableStream), createWriteStream(temporary, { flags: 'wx' }));
    await rename(temporary, upload.target);
    return NextResponse.json({ path: upload.targetInput, name: upload.name }, { status: 201 });
  } catch (error) {
    if (temporary) await rm(temporary, { force: true }).catch(() => undefined);
    return failure(error);
  }
}
