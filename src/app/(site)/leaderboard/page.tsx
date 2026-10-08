import Link from 'next/link';
import { LeaderboardTable } from '@/components/site/LeaderboardTable';
import { PageTitle, Tabs } from '@/components/ui';
import { challengeDateFor, isValidDateString } from '@/lib/game/dates';
import { ensureReady } from '@/lib/server/bootstrap';
import { clock } from '@/lib/server/clock';
import { getActiveConfig } from '@/lib/server/config';
import { classicLeaderboard, dailyLeaderboard } from '@/lib/server/game/leaderboard';
import { currentPlayer } from '@/lib/server/identity';

export const metadata = { title: 'Leaderboards' };
const PAGE = 25;

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; page?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === 'daily' ? 'daily' : 'classic';
  const page = Math.max(1, Number(sp.page) || 1);
  const db = await ensureReady();
  const player = await currentPlayer();
  const cfg = await getActiveConfig(db);
  const today = challengeDateFor(clock.now(), cfg.rules.daily.timezone);
  const date = sp.date && isValidDateString(sp.date) ? sp.date : today;
  const opts = { limit: PAGE, offset: (page - 1) * PAGE, playerId: player?.id ?? null };
  const board = view === 'daily' ? await dailyLeaderboard(db, date, opts) : await classicLeaderboard(db, opts);
  const pages = Math.max(1, Math.ceil(board.total / PAGE));
  const href = (p: number) => `/leaderboard?view=${view}${view === 'daily' ? `&date=${date}` : ''}&page=${p}`;
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Leaderboards" subtitle={view === 'daily' ? `Daily Challenge · ${date}` : 'Classic · each player’s best completed game'} />
      <Tabs
        items={[
          { href: '/leaderboard?view=daily', label: 'Daily', active: view === 'daily' },
          { href: '/leaderboard', label: 'All-time', active: view === 'classic' },
        ]}
      />
      <LeaderboardTable board={board} empty={view === 'daily' ? 'No ranked results for this day yet.' : 'No ranked Classic games yet.'} />
      <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link className="btn btn-ghost btn-sm" href={href(page - 1)}>
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        <span className="text-blue-100/70">
          Page {page} of {pages} · {board.total} players
        </span>
        {page < pages ? (
          <Link className="btn btn-ghost btn-sm" href={href(page + 1)}>
            Next →
          </Link>
        ) : (
          <span />
        )}
      </nav>
      <p className="mt-6 text-center text-xs text-blue-100/60">
        Ranked by score, then correct answers, then total answer time. Only results played while signed in are ranked.
        {!player || player.kind === 'guest' ? (
          <>
            {' '}
            <Link href="/auth/signin" className="underline">
              Sign in to compete
            </Link>
            .
          </>
        ) : null}
      </p>
    </div>
  );
}
