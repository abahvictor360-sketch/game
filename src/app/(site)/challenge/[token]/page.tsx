import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ErrorState, PageTitle, Panel, SignInRequired } from '@/components/ui';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { previewFriendChallenge } from '@/lib/server/game/phase2';
import { currentPlayer } from '@/lib/server/identity';

const START_ERRORS: Record<string, string> = {
  expired: 'This challenge has expired.',
  own_challenge: 'You can’t accept your own challenge — share the link with a friend!',
  unavailable: 'Some questions in this challenge have been withdrawn, so it can no longer be played.',
  feature_disabled: 'Friend challenges aren’t available right now.',
  rate_limited: 'Too many attempts — please wait a minute and try again.',
};

export const metadata = { title: 'Friend challenge', robots: { index: false } };

export default async function ChallengePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const db = await ensureReady();
  const cfg = await getActiveConfig(db);
  if (!cfg.flags.friendChallenges) notFound();
  const player = await currentPlayer();
  const p = await previewFriendChallenge(db, token, player?.id ?? null);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="You’ve been challenged!" subtitle={`${p.creatorName} wants to see if you can beat their score.`} />
      {error ? <ErrorState title="Couldn’t start">{START_ERRORS[error] ?? 'Please try again.'}</ErrorState> : null}
      <Panel className="text-center">
        {p.state === 'open' ? (
          <>
            <p className="text-sm text-blue-100/85">
              Play the same {p.questionCount} questions under the same rules. No lifelines. You’ll see both scores at the end. Friend challenges are just for fun and don’t affect leaderboards.
            </p>
            {player?.kind === 'account' ? (
              <form action={`/api/challenges/${token}/start`} method="post" className="mt-5">
                <button className="btn btn-gold min-h-14 w-full text-lg">Accept challenge</button>
              </form>
            ) : (
              <div className="mt-5">
                <SignInRequired next={`/challenge/${token}`} title="Sign in to accept" />
              </div>
            )}
          </>
        ) : p.state === 'played' ? (
          <>
            <p>You’ve already played this challenge.</p>
            <Link href={`/results/${p.sessionId}`} className="btn btn-gold mt-4">
              See the result
            </Link>
          </>
        ) : p.state === 'own' ? (
          <p>This is your own challenge — share the link with a friend!</p>
        ) : p.state === 'expired' ? (
          <p>This challenge expired on {p.expiresAt.slice(0, 10)}. Ask your friend for a new link, or play Classic.</p>
        ) : (
          <p>Some questions in this challenge have been withdrawn by our editors, so it can’t be played any more.</p>
        )}
        <Link href="/play/classic" className="mt-4 inline-block text-sm font-bold text-gold-300 underline">
          Play Classic instead
        </Link>
      </Panel>
    </div>
  );
}
