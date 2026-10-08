import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'fq_session';
const GUEST_MAX_AGE = 60 * 60 * 24 * 365; // one year: guests keep their progress on this device
const ACCOUNT_MAX_AGE = 60 * 60 * 24 * 30;

let warned = false;
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_DEV_SECRET !== 'true') {
    throw new Error('SESSION_SECRET (≥32 characters) must be set in production.');
  }
  if (!warned && process.env.NODE_ENV !== 'test') {
    console.warn('[fastora] SESSION_SECRET not set — using an insecure development secret.');
    warned = true;
  }
  return 'fastora-insecure-development-secret-change-me';
}

export type SessionClaims = { pid: string; kind: 'guest' | 'account'; iat: number };

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSession(claims: SessionClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined | null, nowMs = Date.now()): SessionClaims | null {
  if (!value) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims;
    const maxAge = claims.kind === 'account' ? ACCOUNT_MAX_AGE : GUEST_MAX_AGE;
    if (typeof claims.pid !== 'string' || typeof claims.iat !== 'number') return null;
    if (nowMs / 1000 - claims.iat > maxAge) return null;
    return claims;
  } catch {
    return null;
  }
}

export function cookieOptions(kind: 'guest' | 'account') {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: kind === 'account' ? ACCOUNT_MAX_AGE : GUEST_MAX_AGE,
  };
}
