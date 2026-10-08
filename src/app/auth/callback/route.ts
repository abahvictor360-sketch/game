import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { track } from '@/lib/server/analytics';
import { ensureReady } from '@/lib/server/bootstrap';
import { setSessionCookie } from '@/lib/server/identity';
import { captureException } from '@/lib/server/monitoring';
import { linkAccount } from '@/lib/server/players';
import { COOKIE_NAME, decodeSession } from '@/lib/server/session-cookie';

/** Supabase Auth callback (OAuth + email link, PKCE): verify, then link to our player. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  if (!code) return NextResponse.redirect(new URL('/auth/signin?error=callback', req.url));
  const jar = await cookies();
  try {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (all) => all.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) throw error ?? new Error('No user');
    const user = data.user;
    // Only a confirmed email is trusted (used for the admin bootstrap list).
    const verifiedEmail = user.email && (user.email_confirmed_at || user.app_metadata?.provider === 'google') ? user.email : null;
    const current = decodeSession(jar.get(COOKIE_NAME)?.value);
    const db = await ensureReady();
    const player = await db.tx((q) =>
      linkAccount(q, {
        authUserId: user.id,
        email: verifiedEmail,
        currentPlayerId: current?.pid ?? null,
        suggestedName: (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? null,
      }),
    );
    setSessionCookie(jar, player);
    void track('account_linked', player.id, { kind: user.app_metadata?.provider ?? 'email' });
    return NextResponse.redirect(new URL(next, req.url));
  } catch (err) {
    captureException(err, { where: 'auth.callback' });
    return NextResponse.redirect(new URL('/auth/signin?error=callback', req.url));
  }
}
