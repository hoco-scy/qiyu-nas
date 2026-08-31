import { NextResponse } from 'next/server';
import { isPortalAuthenticated } from '@/lib/auth';
import { collectorRequest } from '@/lib/collector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable(error: unknown) {
  console.error('Collector API error', error);
  return NextResponse.json({ error: '影音采集引擎暂时不可用，请确认 collector 服务已启动。' }, { status: 503 });
}

export async function GET() {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const { response, payload } = await collectorRequest('/jobs');
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    const body = await request.json();
    const { response, payload } = await collectorRequest('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return unavailable(error);
  }
}
