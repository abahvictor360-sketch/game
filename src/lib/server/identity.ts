import 'server-only';
import { cookies } from 'next/headers';
import { ensureReady } from './bootstrap';
import type { Queryable } from './db';
import { AppError } from './errors';
import { getPlayer, type Player } from './players';
import { COOKIE_NAME, cookieOptions, decodeSession, encodeSession } from './session-cookie';

/** Current player from the signed session cookie (read-only; for pages). */
export async function currentPlayer(): Promise<Player | null> {
  const jar = await cookies();
  const claims = decodeSession(jar.get(COOKIE_NAME)?.value);
  if (!claims) return null;
  const db = await ensureReady();
  return getPlayer(db, claims.pid);
}

export async function currentPlayerId(): Promise<string | null> {
  return (await currentPlayer())?.id ?? null;
}

/** Current signed-in account, or null (guests no longer count: an account is required to play). */
export async function currentAccount(): Promise<Player | null> {
  const p = await currentPlayer();
  return p?.kind === 'account' ? p : null;
}

export const SIGN_IN_REQUIRED = 'sign_in_required';

/** Signed-in account for route handlers / actions; refreshes a stale cookie. Throws when signed out. */
export async function requireAccount(q?: Queryable): Promise<Player> {
  const jar = await cookies();
  const claims = decodeSession(jar.get(COOKIE_NAME)?.value);
  const db = q ?? (await ensureReady());
  const p = claims ? await getPlayer(db, claims.pid) : null;
  if (!p || p.kind !== 'account') throw new AppError('unauthorized', 'Sign in or create an account to play.', SIGN_IN_REQUIRED);
  if (p.id !== claims!.pid || p.kind !== claims!.kind) setSessionCookie(jar, p);
  return p;
}

/** Same as requireAccount, for handlers that only act on existing games. */
export async function requirePlayer(): Promise<Player> {
  return requireAccount();
}

export function setSessionCookie(jar: Awaited<ReturnType<typeof cookies>>, p: Pick<Player, 'id' | 'kind'>) {
  jar.set(COOKIE_NAME, encodeSession({ pid: p.id, kind: p.kind, iat: Math.floor(Date.now() / 1000) }), cookieOptions(p.kind));
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
