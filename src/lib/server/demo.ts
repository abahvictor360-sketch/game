import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Shared demo account. It is enabled only when DEMO_ACCOUNT_PASSWORD is set
 * (at least 8 characters). It signs in with the email below and that password
 * through the normal password form. It is not a Supabase user and never gets
 * staff rights: no email is stored, so the admin bootstrap list can't match it.
 */
export const DEMO_EMAIL = (process.env.DEMO_ACCOUNT_EMAIL ?? 'demo@fastora.africa').toLowerCase();
export const DEMO_NAME = 'Demo Player';

export function demoEnabled(): boolean {
  return (process.env.DEMO_ACCOUNT_PASSWORD ?? '').length >= 8;
}

/** Stable pseudo auth id so the demo always maps to the same player. */
export const DEMO_AUTH_USER_ID = (() => {
  const h = createHash('sha256').update('demo-account:' + DEMO_EMAIL).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
})();

export function isDemoLogin(email: string, password: string): boolean {
  if (!demoEnabled() || email.trim().toLowerCase() !== DEMO_EMAIL) return false;
  const a = createHash('sha256').update(password).digest();
  const b = createHash('sha256').update(process.env.DEMO_ACCOUNT_PASSWORD!).digest();
  return timingSafeEqual(a, b);
}
