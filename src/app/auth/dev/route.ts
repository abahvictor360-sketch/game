import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { assertSameOrigin } from '@/lib/server/api';
import { authProvider } from '@/lib/server/auth-provider';
import { ensureReady } from '@/lib/server/bootstrap';
import { setSessionCookie } from '@/lib/server/identity';
import { linkAccount } from '@/lib/server/players';
import { COOKIE_NAME, decodeSession } from '@/lib/server/session-cookie';

/** DEVELOPMENT SUBSTITUTE for Supabase Auth. Disabled whenever Supabase or production is configured. */
export async function POST(req: NextRequest) {
  if (authProvider() !== 'dev') return NextResponse.json({ error: 'Not available' }, { status: 404 });
  assertSameOrigin(req);
  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const name = String(form.get('name') ?? '').trim() || null;
  const nextParam = String(form.get('next') ?? '/');
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.redirect(new URL('/auth/signin?error=invalid_email', req.url), 303);
  // Deterministic pseudo auth id so the same email maps to the same account.
  const h = createHash('sha256').update('dev-auth:' + email).digest('hex');
  const authUserId = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  const jar = await cookies();
  const current = decodeSession(jar.get(COOKIE_NAME)?.value);
  const db = await ensureReady();
  const player = await db.tx((q) => linkAccount(q, { authUserId, email, currentPlayerId: current?.pid ?? null, suggestedName: name }));
  setSessionCookie(jar, player);
  return NextResponse.redirect(new URL(next, req.url), 303);
}
