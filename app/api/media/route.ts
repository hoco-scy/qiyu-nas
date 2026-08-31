import { NextResponse } from 'next/server';
import { mediaItem, mediaItems, mediaLibraries } from '@/lib/jellyfin';
import { isPortalAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  console.error('Jellyfin API error', error);
  const message = error instanceof Error && error.message.includes('credentials') ? '影音引擎尚未完成连接' : '影音引擎暂时不可用';
  return NextResponse.json({ error: message }, { status: 503 });
}

export async function GET(request: Request) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    const resource = query.get('resource') || 'home';
    if (resource === 'libraries') return NextResponse.json({ libraries: await mediaLibraries() });
    if (resource === 'items') return NextResponse.json({ items: await mediaItems(query.get('library') || undefined) });
    if (resource === 'item' && query.get('id')) return NextResponse.json({ item: await mediaItem(query.get('id')!) });
    const [libraries, items] = await Promise.all([mediaLibraries(), mediaItems(undefined, 24)]);
    return NextResponse.json({ libraries, items });
  } catch (error) {
    return failure(error);
  }
}
