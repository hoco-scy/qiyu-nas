import { NextResponse } from 'next/server';
import { jellyfinFetch } from '@/lib/jellyfin';
import { isPortalAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: RouteContext<'/api/media/image/[id]'>) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const { id } = await context.params;
    const type = new URL(request.url).searchParams.get('type') === 'Backdrop' ? 'Backdrop' : 'Primary';
    const response = await jellyfinFetch(`/Items/${encodeURIComponent(id)}/Images/${type}?maxWidth=${type === 'Backdrop' ? '1600' : '480'}&quality=88`);
    if (!response.ok || !response.body) return new Response(null, { status: response.status });
    return new Response(response.body, { headers: {
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('Jellyfin image proxy error', error);
    return NextResponse.json({ error: '图片无法读取' }, { status: 503 });
  }
}
