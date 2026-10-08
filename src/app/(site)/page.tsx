import Link from 'next/link';
import { BRAND, BrandMark } from '@/components/Brand';
import { Avatar } from '@/components/Avatar';
import { HexBar, Panel, ResultGrid } from '@/components/ui';
import { DailyCountdown } from '@/components/site/DailyCountdown';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { getDailyStatus } from '@/lib/server/game/daily';
import { classicLeaderboard } from '@/lib/server/game/leaderboard';
import { currentPlayer } from '@/lib/server/identity';

export default async function HomePage() {
  const db = await ensureReady();
  const player = await currentPlayer();
  const [daily, board, cfg] = await Promise.all([
    db.tx((q) => getDailyStatus(q, player?.id ?? null)),
    classicLeaderboard(db, { limit: 5, playerId: player?.id ?? null }),
    getActiveConfig(db),
  ]);
  const versus = cfg.flags.multiplayer || cfg.flags.ghostOpponents;
  return (
    <div className="space-y-8 pt-2">
      <section className="text-center">
        <div className="emblem mx-auto grid h-36 w-36 place-items-center sm:h-44 sm:w-44">
          <BrandMark size={108} />
        </div>
        <h1 className="font-display mt-5 text-3xl font-black tracking-tight sm:text-4xl">{BRAND.tagline}</h1>
        <p className="mx-auto mt-2 max-w-md text-blue-100/85">Fifteen questions. Rising difficulty. Learn something new with every answer.</p>
        <form action="/api/play/classic" method="post" className="mt-6">
          <button className="btn btn-gold min-h-14 px-10 text-lg">▶ Play Classic</button>
        </form>
        <p className="mt-2 text-xs text-blue-100/70">No sign-up needed — start playing as a guest.</p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-black">Daily Challenge</h2>
            <span className="rounded-full bg-flame-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">{daily.date}</span>
          </div>
          {!daily.available ? (
            <p className="mt-3 text-sm text-blue-100/85">Today’s challenge isn’t ready yet. Our team has been alerted — please check back soon.</p>
          ) : daily.attempt?.status === 'completed' ? (
            <div className="mt-3 space-y-3 text-center">
              <p className="text-sm text-blue-100/85">
                You scored <strong className="text-gold-400">{daily.attempt.score}</strong>
                {daily.attempt.rank ? ` · rank #${daily.attempt.rank}` : ''}
              </p>
              <ResultGrid grid={daily.attempt.grid} size="sm" />
              <p className="text-xs text-blue-100/70">
                Next challenge in <DailyCountdown resetAt={daily.resetAt} />
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm text-blue-100/85">
                {daily.questionCount} questions, the same for everyone today. One attempt — no lifelines.
                {daily.participants ? ` ${daily.participants} players so far.` : ''}
              </p>
              <Link href="/daily" className="btn btn-flame mt-4 w-full">
                {daily.attempt ? 'Resume today’s challenge' : 'Take today’s challenge'}
              </Link>
            </>
          )}
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-black">Top players</h2>
            <Link href="/leaderboard" className="text-sm font-bold text-gold-300 underline">
              See all
            </Link>
          </div>
          {board.entries.length === 0 ? (
            <p className="mt-3 text-sm text-blue-100/85">No ranked games yet. Sign in and play Classic to be the first on the board!</p>
          ) : (
            <ol className="mt-3 space-y-1.5">
              {board.entries.map((e) => (
                <li key={e.playerId} className={`flex items-center gap-3 rounded-full px-3 py-1.5 ${e.isMe ? 'bg-gold-400/20 ring-1 ring-gold-400' : 'bg-white/5'}`}>
                  <span className="w-6 text-center font-display font-black text-gold-400">{e.rank}</span>
                  <Avatar name={e.avatarKey} size={28} />
                  <span className="flex-1 truncate font-semibold">{e.displayName}</span>
                  <span className="font-display font-black tabular-nums">{e.score}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {versus ? (
        <Panel className="text-center">
          <h2 className="font-display text-xl font-black">Versus</h2>
          <p className="mt-1 text-sm text-blue-100/85">Go head to head on the same 15 questions. Fastest correct answers earn bonus points.</p>
          <Link href="/versus" className="btn btn-blue mt-4">
            Find an opponent
          </Link>
        </Panel>
      ) : null}

      <section aria-labelledby="rules-title" className="text-center">
        <HexBar railed className="mx-auto max-w-sm" innerClassName="px-6 py-2">
          <h2 id="rules-title" className="font-display font-black">
            How it works
          </h2>
        </HexBar>
        <ul className="mx-auto mt-5 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
          {[
            ['15 questions', '5 easy, 5 medium, 5 hard. Points rise as you climb: 100, 200, then 300.'],
            ['Beat the clock', '20 seconds for easy, 18 for medium, 15 for hard questions.'],
            ['Two lifelines', 'Use 50:50 or swap a question — once each per game.'],
          ].map(([t, d]) => (
            <li key={t} className="panel p-4">
              <p className="font-display font-black text-gold-400">{t}</p>
              <p className="mt-1 text-sm text-blue-100/85">{d}</p>
            </li>
          ))}
        </ul>
        <Link href="/how-to-play" className="mt-4 inline-block text-sm font-bold text-gold-300 underline">
          Full rules
        </Link>
      </section>

      {!player || player.kind === 'guest' ? (
        <Panel className="text-center">
          <p className="font-semibold">Save your progress and get on the leaderboards.</p>
          <Link href="/auth/signin" className="btn btn-ghost mt-3">
            Create a free account
          </Link>
        </Panel>
      ) : null}
    </div>
  );
}
