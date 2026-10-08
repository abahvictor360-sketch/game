import 'server-only';
import { cookies } from 'next/headers';
import { ensureReady } from './bootstrap';
import type { Queryable } from './db';
import { AppError } from './errors';
import { createGuest, getPlayer, type Player } from './players';
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

/** Current player, creating a guest identity when needed (route handlers / actions). */
export async function ensurePlayer(q?: Queryable): Promise<Player> {
  const jar = await cookies();
  const claims = decodeSession(jar.get(COOKIE_NAME)?.value);
  const db = q ?? (await ensureReady());
  if (claims) {
    const p = await getPlayer(db, claims.pid);
    if (p) {
      if (p.id !== claims.pid || p.kind !== claims.kind) setSessionCookie(jar, p);
      return p;
    }
  }
  const guest = await createGuest(db);
  setSessionCookie(jar, guest);
  return guest;
}

export async function requirePlayer(): Promise<Player> {
  const p = await currentPlayer();
  if (!p) throw new AppError('unauthorized', 'Start a game first.');
  return p;
}

export function setSessionCookie(jar: Awaited<ReturnType<typeof cookies>>, p: Pick<Player, 'id' | 'kind'>) {
  jar.set(COOKIE_NAME, encodeSession({ pid: p.id, kind: p.kind, iat: Math.floor(Date.now() / 1000) }), cookieOptions(p.kind));
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
