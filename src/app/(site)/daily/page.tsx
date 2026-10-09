import Link from 'next/link';
import { DailyCountdown } from '@/components/site/DailyCountdown';
import { ErrorState, PageTitle, Panel, ResultGrid, SignInRequired } from '@/components/ui';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { getDailyStatus } from '@/lib/server/game/daily';
import { dailyLeaderboard } from '@/lib/server/game/leaderboard';
import { currentPlayer } from '@/lib/server/identity';
import { LeaderboardTable } from '@/components/site/LeaderboardTable';

export const metadata = { title: 'Daily Challenge' };

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const db = await ensureReady();
  const player = await currentPlayer();
  const [status, cfg] = await Promise.all([db.tx((q) => getDailyStatus(q, player?.id ?? null)), getActiveConfig(db)]);
  const board = status.available ? await dailyLeaderboard(db, status.date, { limit: 10, playerId: player?.id ?? null }) : null;
  const a = status.attempt;
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageTitle title="Daily Challenge" subtitle={`${status.date} · the same ${status.questionCount} questions for everyone, every day.`} />
      {error === 'daily_unavailable' || !status.available ? (
        <ErrorState title="Today’s challenge isn’t available yet">
          We couldn’t publish today’s questions. Our team has been alerted. Please check back soon — Classic is still open.
          <p className="mt-2">
            Next challenge in <DailyCountdown resetAt={status.resetAt} />
          </p>
        </ErrorState>
      ) : null}
      {error && error !== 'daily_unavailable' ? <ErrorState>We couldn’t start the challenge. Please try again.</ErrorState> : null}

      {status.available && !a ? (
        <Panel className="text-center">
          <ul className="mx-auto max-w-sm space-y-1 text-left text-sm text-blue-100/90">
            <li>
              • {status.questionCount} questions, {cfg.rules.daily.timerMs / 1000} seconds each, rising difficulty.
            </li>
            <li>• One attempt per day. No lifelines.</li>
            <li>• Refreshing resumes your attempt — it won’t reset the clock.</li>
          </ul>
          <p className="mt-4 text-sm text-blue-100/80">
            Today’s challenge closes in <DailyCountdown resetAt={status.resetAt} />
          </p>
          {player?.kind === 'account' ? (
            <form action="/api/play/daily" method="post" className="mt-4">
              <button className="btn btn-flame min-h-14 w-full text-lg">Start today’s challenge</button>
            </form>
          ) : (
            <div className="mt-5">
              <SignInRequired next="/daily" title="Sign in to take today’s challenge" />
            </div>
          )}
        </Panel>
      ) : null}

      {a && a.status === 'active' ? (
        <Panel className="text-center">
          <p>You’ve started today’s challenge.</p>
          <Link href={`/play/${a.sessionId}`} className="btn btn-flame mt-4 w-full">
            Resume
          </Link>
        </Panel>
      ) : null}

      {a && a.status === 'completed' ? (
        <Panel className="text-center">
          <p className="text-label font-bold uppercase text-blue-100/70">Your result</p>
          <p className="font-display text-5xl font-black text-gold-400">{a.score}</p>
          <p className="text-blue-100/85">
            {a.correctCount}/{status.questionCount} correct{a.rank ? ` · rank #${a.rank}` : a.eligible ? '' : ' · unranked (guest)'}
          </p>
          <div className="mt-4">
            <ResultGrid grid={a.grid} />
          </div>
          <p className="mt-4 text-sm">
            Next challenge in <DailyCountdown resetAt={status.resetAt} />
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href={`/results/${a.sessionId}`} className="btn btn-gold">
              Share & review
            </Link>
            <Link href="/" className="btn btn-ghost">
              Home
            </Link>
          </div>
        </Panel>
      ) : null}

      {board ? (
        <section>
          <h2 className="font-display mb-3 text-center text-lg font-black">Today’s ranking</h2>
          <LeaderboardTable board={board} empty="No ranked results yet today — be the first!" />
          <p className="mt-2 text-center text-sm">
            <Link href="/leaderboard?view=daily" className="font-bold text-gold-300 underline">
              Full daily leaderboard
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
