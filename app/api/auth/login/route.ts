import { NextResponse } from 'next/server';
import { createSession, credentialsAreValid, sessionCookie, sessionCookieName } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let credentials: { username?: unknown; password?: unknown };
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 });
  }

  if (!credentialsAreValid(credentials.username, credentials.password)) {
    return NextResponse.json({ error: '账号或密码不正确' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, username: credentials.username });
  response.cookies.set(sessionCookieName, createSession(credentials.username as string), sessionCookie);
  return response;
}
