import { NextResponse } from 'next/server';
import { isPortalAuthenticated } from '@/lib/auth';
import { collectorRequest } from '@/lib/collector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const body = await request.json();
    const { response, payload } = await collectorRequest('/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 25_000);
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Collector inspection API error', error);
    return NextResponse.json({ error: '资源嗅探器暂时不可用，请稍后重试。' }, { status: 503 });
  }
}
