import { NextResponse } from 'next/server';
import { isPortalAuthenticated } from '@/lib/auth';
import { listPublishedSites, StorageError } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isPortalAuthenticated()) return NextResponse.json({ error: '未登录' }, { status: 401 });
  try {
    return NextResponse.json({ sites: await listPublishedSites() });
  } catch (error) {
    if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Sites API error', error);
    return NextResponse.json({ error: '读取网页目录失败' }, { status: 500 });
  }
}
