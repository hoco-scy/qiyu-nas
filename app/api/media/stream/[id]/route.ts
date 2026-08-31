import { NextResponse } from 'next/server';
import { jellyfinFetch } from '@/lib/jellyfin';
import { isPortalAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function forwardedHeaders(request: Request) {
  const headers: Record<string, string> = {};
  const range = request.headers.get('range');
  if (range) headers.Range = range;
  return headers;
}

export async function GET(request: Request, context: RouteContext<'/api/media/stream/[id]'>) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const { id } = await context.params;
    const response = await jellyfinFetch(`/Videos/${encodeURIComponent(id)}/stream?static=true`, { headers: forwardedHeaders(request) });
    if (!response.ok || !response.body) return new Response(null, { status: response.status });
    const headers = new Headers({
      'Accept-Ranges': response.headers.get('accept-ranges') || 'bytes',
      'Content-Type': response.headers.get('content-type') || 'video/mp4',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of ['content-length', 'content-range']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error('Jellyfin stream proxy error', error);
    return NextResponse.json({ error: '播放流无法建立' }, { status: 503 });
  }
}
