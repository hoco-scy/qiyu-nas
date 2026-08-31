import { NextResponse } from 'next/server';
import { createDirectory, deleteEntry, listDirectory, moveEntries, renameEntry, StorageError } from '@/lib/storage';
import { isPortalAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status });
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return NextResponse.json({ error: '文件或目录不存在' }, { status: 404 });
  if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') return NextResponse.json({ error: '同名文件已存在' }, { status: 409 });
  console.error('File API error', error);
  return NextResponse.json({ error: '文件操作没有完成' }, { status: 500 });
}

export async function GET(request: Request) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const pathname = new URL(request.url).searchParams.get('path') || '';
    return NextResponse.json(await listDirectory(pathname));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const body = await request.json() as { action?: string; path?: string; paths?: string[]; name?: string; destination?: string };
    if (body.action === 'mkdir') {
      return NextResponse.json({ entry: await createDirectory(body.path || '', body.name) }, { status: 201 });
    }
    if (body.action === 'rename') {
      return NextResponse.json({ entry: await renameEntry(body.path || '', body.name) });
    }
    if (body.action === 'delete') {
      await deleteEntry(body.path || '');
      return new Response(null, { status: 204 });
    }
    if (body.action === 'move') {
      await moveEntries(body.paths || (body.path ? [body.path] : []), body.destination);
      return new Response(null, { status: 204 });
    }
    return NextResponse.json({ error: '不支持的操作' }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
