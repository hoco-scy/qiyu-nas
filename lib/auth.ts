import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const sessionCookieName = 'qiyu_session';
export const sessionMaxAge = 60 * 60 * 12;

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function signingSecret() {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret) throw new Error('PORTAL_SESSION_SECRET is not configured');
  return secret;
}

function sign(value: string) {
  return createHmac('sha256', signingSecret()).update(value).digest('base64url');
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function credentialsAreValid(username: unknown, password: unknown) {
  // Portal authentication is deliberately independent from the internal
  // Jellyfin service account. The latter is only used by server-side media
  // requests and must never decide which credentials unlock Qiyu itself.
  const expectedUsername = process.env.NAS_USERNAME;
  const expectedPassword = process.env.NAS_PASSWORD;
  if (!expectedUsername || !expectedPassword || typeof username !== 'string' || typeof password !== 'string') return false;
  return constantTimeEqual(username, expectedUsername) && constantTimeEqual(password, expectedPassword);
}

export function createSession(username: string) {
  const payload = Buffer.from(JSON.stringify({ username, expiresAt: Date.now() + sessionMaxAge * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function parseSession(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const [payload, signature, ...rest] = value.split('.');
  if (!payload || !signature || rest.length || !constantTimeEqual(signature, sign(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (typeof parsed.username !== 'string' || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) return null;
    return { username: parsed.username, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export async function currentSession() {
  const value = (await cookies()).get(sessionCookieName)?.value;
  return parseSession(value);
}

export async function isPortalAuthenticated() {
  return Boolean(await currentSession());
}

export async function requirePortalSession(returnTo = '/') {
  if (await isPortalAuthenticated()) return;
  redirect(`/login?next=${encodeURIComponent(returnTo)}`);
}

export const sessionCookie = {
  httpOnly: true,
  maxAge: sessionMaxAge,
  path: '/',
  sameSite: 'lax' as const,
  // Enable this behind an HTTPS Caddy hostname via PORTAL_COOKIE_SECURE=true.
  secure: process.env.PORTAL_COOKIE_SECURE === 'true',
};
