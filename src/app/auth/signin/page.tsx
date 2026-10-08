import Link from 'next/link';
import { BrandWordmark } from '@/components/Brand';
import { HexBar, Panel } from '@/components/ui';
import { authProvider } from '@/lib/server/auth-provider';
import { currentPlayer } from '@/lib/server/identity';
import { SupabaseSignIn } from './SupabaseSignIn';

export const metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  callback: 'We couldn’t complete sign-in. The link may have expired — please request a new one.',
  invalid_email: 'Please enter a valid email address.',
  unavailable: 'Sign-in isn’t configured on this server yet.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const provider = authProvider();
  const player = await currentPlayer();
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return (
    <main id="main" className="relative z-10 mx-auto max-w-md px-4 py-10">
      <div className="text-center">
        <Link href="/" aria-label="Fastora home">
          <BrandWordmark />
        </Link>
      </div>
      <HexBar railed className="mt-8" innerClassName="px-8 py-3 text-center">
        <h1 className="font-display text-xl font-black">{player?.kind === 'account' ? 'You’re signed in' : 'Sign in or create an account'}</h1>
      </HexBar>
      <Panel className="mt-6">
        {player?.kind === 'account' ? (
          <div className="text-center">
            <p>
              Signed in as <strong>{player.displayName}</strong>.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/profile" className="btn btn-gold">
                Your profile
              </Link>
              <form action="/auth/signout" method="post">
                <button className="btn btn-ghost">Sign out</button>
              </form>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-blue-100/85">
              Accounts keep your history across devices and put you on the leaderboards.
              {player?.kind === 'guest' ? ' Your guest games come with you.' : ''}
            </p>
            {error ? (
              <p role="alert" className="mt-3 rounded-lg bg-coral-500/20 px-3 py-2 text-sm text-coral-400">
                {ERRORS[error] ?? ERRORS.callback}
              </p>
            ) : null}
            {provider === 'supabase' ? (
              <SupabaseSignIn url={process.env.NEXT_PUBLIC_SUPABASE_URL!} anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!} next={safeNext} />
            ) : provider === 'dev' ? (
              <form action="/auth/dev" method="post" className="mt-5 space-y-3">
                <p className="rounded-lg bg-flame-500/20 px-3 py-2 text-xs font-semibold text-flame-400">
                  Development sign-in: no email is sent and nothing is verified. Configure Supabase Auth for real accounts.
                </p>
                <input type="hidden" name="next" value={safeNext} />
                <label className="block text-sm font-semibold">
                  Email
                  <input name="email" type="email" required autoComplete="email" className="field field-dark mt-1" />
                </label>
                <label className="block text-sm font-semibold">
                  Display name (optional)
                  <input name="name" maxLength={24} className="field field-dark mt-1" />
                </label>
                <button className="btn btn-gold w-full">Continue</button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-coral-400">{ERRORS.unavailable}</p>
            )}
          </>
        )}
      </Panel>
      <p className="mt-6 text-center text-xs text-blue-100/60">
        We only show your display name and avatar publicly. See our <Link href="/privacy" className="underline">privacy notice</Link>.
      </p>
    </main>
  );
}
