import 'server-only';

/**
 * Authentication adapter.
 *  - 'supabase': Google OAuth and email (magic link / one-time code) through
 *    Supabase Auth. Requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *  - 'dev': DEVELOPMENT SUBSTITUTE: sign in by typing an email, no message is
 *    sent and nothing is verified. Refused in production deployments.
 */
export type AuthProvider = 'supabase' | 'dev' | 'none';

export function authProvider(): AuthProvider {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return 'supabase';
  if (process.env.VERCEL_ENV === 'production') return 'none';
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_AUTH !== 'true') return 'none';
  return 'dev';
}
