import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { assertSameOrigin, redirect303 } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { authProvider } from '@/lib/server/auth-provider';
import { ensureReady } from '@/lib/server/bootstrap';
import { setSessionCookie } from '@/lib/server/identity';
import { captureException } from '@/lib/server/monitoring';
import { linkAccount } from '@/lib/server/players';
import { rateLimit } from '@/lib/server/rate-limit';
import { COOKIE_NAME, decodeSession } from '@/lib/server/session-cookie';
import { DEMO_AUTH_USER_ID, DEMO_NAME, demoEnabled, isDemoLogin } from '@/lib/server/demo';

/** Email + password sign-in: the built-in demo account, otherwise Supabase Auth accounts that have a password. */
export async function POST(req: NextRequest) {
  if (authProvider() !== 'supabase' && !demoEnabled()) return NextResponse.json({ error: 'Not available' }, { status: 404 });
  assertSameOrigin(req);
  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const nextParam = String(form.get('next') ?? '/');
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  const back = (error: string) => redirect303(req, `/auth/signin?error=${error}&next=${encodeURIComponent(next)}`);
  if (!email || !password) return back('password');
  const jar = await cookies();
  try {
    const db = await ensureReady();
    await rateLimit(db, `pw:${email}`, 10, 300);
    const current = decodeSession(jar.get(COOKIE_NAME)?.value);
    if (isDemoLogin(email, password)) {
      const player = await db.tx((q) => linkAccount(q, { authUserId: DEMO_AUTH_USER_ID, email: null, currentPlayerId: current?.pid ?? null, suggestedName: DEMO_NAME }));
      setSessionCookie(jar, player);
      void track('account_linked', player.id, { kind: 'demo' });
      return redirect303(req, next);
    }
    if (authProvider() !== 'supabase') return back('password');
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (all) => all.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return back('password');
    const user = data.user;
    const player = await db.tx((q) =>
      linkAccount(q, {
        authUserId: user.id,
        email: user.email_confirmed_at ? (user.email ?? null) : null,
        currentPlayerId: current?.pid ?? null,
        suggestedName: (user.user_metadata?.full_name as string | undefined) ?? null,
      }),
    );
    setSessionCookie(jar, player);
    void track('account_linked', player.id, { kind: 'password' });
    return redirect303(req, next);
  } catch (err) {
    if ((err as { code?: string }).code === 'rate_limited') return back('rate_limited');
    captureException(err, { where: 'auth.password' });
    return back('callback');
  }
}
