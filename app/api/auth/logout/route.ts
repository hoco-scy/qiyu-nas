import { NextResponse } from 'next/server';
import { sessionCookie, sessionCookieName } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, '', { ...sessionCookie, maxAge: 0 });
  return response;
}
