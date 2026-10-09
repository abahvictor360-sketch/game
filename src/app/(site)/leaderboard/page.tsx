import Link from 'next/link';
import { LeaderboardTable } from '@/components/site/LeaderboardTable';
import { PageTitle, Tabs } from '@/components/ui';
import { addDays, challengeDateFor, isValidDateString } from '@/lib/game/dates';
import { ensureReady } from '@/lib/server/bootstrap';
import { clock } from '@/lib/server/clock';
import { getActiveConfig } from '@/lib/server/config';
import { classicLeaderboard, dailyLeaderboard } from '@/lib/server/game/leaderboard';
import { currentPlayer } from '@/lib/server/identity';
import { Icon } from '@/components/Icon';

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
  const date = sp.date && isValidDateString(sp.date) && sp.date <= today ? sp.date : today;
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
      {view === 'daily' ? (
        <nav aria-label="Challenge day" className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <Link className="btn btn-ghost btn-sm" href={`/leaderboard?view=daily&date=${addDays(date, -1)}`}>
            <Icon name="arrow-left" size={16} /> <span className="sr-only">Previous day,</span> {addDays(date, -1).slice(5)}
          </Link>
          <form action="/leaderboard" className="flex items-center gap-2">
            <input type="hidden" name="view" value="daily" />
            <label className="sr-only" htmlFor="lb-date">
              Challenge date
            </label>
            <input id="lb-date" type="date" name="date" defaultValue={date} max={today} className="field field-dark w-40" />
            <button className="btn btn-ghost btn-sm">Go</button>
          </form>
          {date < today ? (
            <Link className="btn btn-ghost btn-sm" href={`/leaderboard?view=daily&date=${addDays(date, 1)}`}>
              <span className="sr-only">Next day,</span> {addDays(date, 1).slice(5)} <Icon name="arrow-right" size={16} />
            </Link>
          ) : (
            <span className="w-20" aria-hidden="true" />
          )}
        </nav>
      ) : null}
      <LeaderboardTable board={board} empty={view === 'daily' ? 'No ranked results for this day yet.' : 'No ranked Classic games yet.'} />
      <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link className="btn btn-ghost btn-sm" href={href(page - 1)}>
            <Icon name="arrow-left" size={16} /> Previous
          </Link>
        ) : (
          <span />
        )}
        <span className="text-blue-100/70">
          Page {page} of {pages} · {board.total} players
        </span>
        {page < pages ? (
          <Link className="btn btn-ghost btn-sm" href={href(page + 1)}>
            Next <Icon name="arrow-right" size={16} />
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
