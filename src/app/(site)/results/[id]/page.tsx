import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShareActions } from '@/components/results/ShareActions';
import { FriendChallengeButton } from '@/components/results/FriendChallengeButton';
import { Badge, Confetti, HexBar, Panel, ResultGrid } from '@/components/ui';
import { DailyCountdown } from '@/components/site/DailyCountdown';
import { CountUp } from '@/components/motion/CountUp';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { getDailyStatus } from '@/lib/server/game/daily';
import { getOwnerReview, getResultSummary, rankFor, shareText } from '@/lib/server/game/results';
import { currentPlayer } from '@/lib/server/identity';
import { proverbFor } from '@/lib/shared/proverbs';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Results', robots: { index: false } };

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await ensureReady();
  const player = await currentPlayer();
  const summary = await getResultSummary(db, id);
  if (!summary) notFound();
  const review = player ? await getOwnerReview(db, id, player.id) : null;
  if (!review) notFound(); // results pages are private; the shareable page is /s/[id]
  const [rank, cfg, daily] = await Promise.all([
    rankFor(db, summary),
    getActiveConfig(db),
    summary.mode === 'daily' ? db.tx((q) => getDailyStatus(q, player!.id)) : Promise.resolve(null),
  ]);
  const extra = await db.query<{ ghost_score: number | null; ghost_alias: string | null; friend_name: string | null; friend_score: number | null }>(
    `select g.final_score as ghost_score, g.display_alias as ghost_alias, fp.display_name as friend_name, src.score as friend_score
       from public.game_sessions s
       left join public.ghost_recordings g on g.id = s.ghost_recording_id
       left join public.friend_challenges fc on fc.id = s.friend_challenge_id
       left join public.game_sessions src on src.id = fc.source_session_id
       left join public.players fp on fp.id = fc.creator_id
      where s.id = $1`,
    [id],
  );
  const vs = extra[0];
  const shareUrl = `${siteUrl()}/s/${id}`;
  const perfect = summary.correctCount === summary.totalQuestions;
  const headline = perfect ? 'Perfect game!' : summary.accuracy >= 70 ? 'Brilliant!' : summary.accuracy >= 40 ? 'Well played!' : 'Good effort!';

  // Performance summary: accuracy per difficulty, plus strongest/weakest category.
  const byDifficulty = (['easy', 'medium', 'hard'] as const)
    .map((d) => ({ d, items: review.filter((r) => r.difficulty === d) }))
    .filter((x) => x.items.length > 0)
    .map(({ d, items }) => ({ d, correct: items.filter((r) => r.outcome === 'correct').length, total: items.length }));
  const cats = new Map<string, { correct: number; total: number }>();
  for (const r of review) {
    const c = cats.get(r.category) ?? { correct: 0, total: 0 };
    c.total++;
    if (r.outcome === 'correct') c.correct++;
    cats.set(r.category, c);
  }
  const catList = [...cats.entries()].map(([name, c]) => ({ name, ...c, rate: c.correct / c.total })).sort((a, b) => b.rate - a.rate || b.total - a.total);
  const best = catList.find((c) => c.correct > 0);
  const worst = [...catList].reverse().find((c) => c.rate < 1 && c !== best);
  const timeouts = review.filter((r) => r.outcome === 'timeout').length;

  let versus: { label: string; theirs: number } | null = null;
  if (summary.mode === 'friend' && vs.friend_name) versus = { label: vs.friend_name, theirs: vs.friend_score ?? 0 };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {summary.accuracy >= 70 || (versus && summary.score > versus.theirs) || (summary.mode === 'ghost' && (vs.ghost_score ?? Infinity) < summary.score) ? <Confetti /> : null}
      <section className="text-center anim-pop">
        <p className="text-eyebrow font-bold uppercase text-blue-100/80">
          {summary.mode === 'daily' ? `Daily Challenge · ${summary.challengeDate}` : summary.mode === 'friend' ? 'Friend Challenge' : summary.mode === 'ghost' ? 'Versus' : 'Classic'}
        </p>
        <HexBar railed className="mx-auto mt-3 max-w-sm" innerClassName="px-8 py-3">
          <h1 className="font-display text-2xl font-black">{headline}</h1>
        </HexBar>
        <div className="emblem mx-auto mt-6 grid h-40 w-40 place-items-center">
          <div>
            <p className="font-display text-5xl font-black tabular-nums text-gold-400">
              <CountUp value={summary.score} from={0} durationMs={1200} />
            </p>
            <p className="text-label font-bold uppercase text-blue-100/80">points</p>
          </div>
        </div>
        <p className="mt-4 text-blue-100/90">
          {summary.correctCount} of {summary.totalQuestions} correct · {summary.accuracy}% accuracy
          {summary.lifelinesUsed ? ` · ${summary.lifelinesUsed} lifeline${summary.lifelinesUsed > 1 ? 's' : ''}` : ''}
        </p>
        <div className="mt-4">
          <ResultGrid grid={summary.grid} />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {rank ? <Badge tone="gold">Rank #{rank}</Badge> : null}
          {!summary.leaderboardEligible && (summary.mode === 'classic' || summary.mode === 'daily') ? <Badge tone="grey">Unranked: played as a guest</Badge> : null}
        </div>
      </section>

      <figure className="glyph-frame mx-auto max-w-md text-center">
        <blockquote className="font-display text-lg font-bold text-gold-300 [text-wrap:balance]">“{proverbFor(id)}”</blockquote>
        <figcaption className="mt-1 text-label font-bold uppercase text-blue-100/75">African proverb</figcaption>
      </figure>

      {summary.mode === 'ghost' && vs.ghost_alias ? (
        <Panel className="text-center">
          <p className="text-sm text-blue-100/80">Against {vs.ghost_alias} (a recorded player)</p>
          <p className="font-display mt-1 text-2xl font-black">{outcomeLabel(summary.score, vs.ghost_score ?? 0)}</p>
          <p className="text-sm text-blue-100/80">
            You {summary.score} · {vs.ghost_alias} {vs.ghost_score}
          </p>
        </Panel>
      ) : null}
      {versus ? (
        <Panel className="text-center">
          <p className="text-sm text-blue-100/80">Challenge from {versus.label}</p>
          <p className="font-display mt-1 text-2xl font-black">{outcomeLabel(summary.score, versus.theirs)}</p>
          <p className="text-sm text-blue-100/80">
            You {summary.score} · {versus.label} {versus.theirs}
          </p>
          <p className="mt-2 text-xs text-blue-100/75">Friend challenges are just for fun and don’t count towards leaderboards.</p>
        </Panel>
      ) : null}

      {review.length ? (
        <Panel>
          <h2 className="font-display mb-3 text-lg font-black">How you did</h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {byDifficulty.map((x) => (
              <div key={x.d} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                <dt className="text-label font-bold uppercase text-blue-100/80">{x.d}</dt>
                <dd className="font-display text-2xl font-black tabular-nums">
                  {x.correct}
                  <span className="text-base text-blue-100/75">/{x.total}</span>
                </dd>
              </div>
            ))}
          </dl>
          <ul className="mt-3 space-y-1 text-sm text-blue-100/90">
            {best ? (
              <li>
                Strongest: <strong className="text-emerald-400">{best.name}</strong> ({best.correct}/{best.total})
              </li>
            ) : null}
            {worst ? (
              <li>
                Room to grow: <strong className="text-coral-400">{worst.name}</strong> ({worst.correct}/{worst.total}). Read the explanations below.
              </li>
            ) : null}
            {timeouts ? <li>{timeouts === 1 ? 'One question' : `${timeouts} questions`} ran out of time. Answering a little earlier pays off.</li> : null}
          </ul>
        </Panel>
      ) : null}

      {daily ? (
        <Panel className="text-center">
          <p className="text-sm text-blue-100/85">
            Next Daily Challenge in <DailyCountdown resetAt={daily.resetAt} />
          </p>
        </Panel>
      ) : null}

      <Panel>
        <h2 className="font-display mb-3 text-lg font-black">Share your result</h2>
        <ShareActions text={shareText(summary)} url={shareUrl} imageUrl={`/s/${id}/opengraph-image`} storyUrl={`/s/${id}/story`} sessionId={id} />
      </Panel>

      {player?.kind === 'guest' ? (
        <Panel className="text-center">
          <p className="font-semibold">Create a free account to keep your history and join the leaderboards.</p>
          <p className="mt-1 text-xs text-blue-100/80">Games you’ve played as a guest stay in your history; new games count for rankings.</p>
          <Link href="/auth/signin" className="btn btn-gold mt-3">
            Save my progress
          </Link>
        </Panel>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        {summary.mode !== 'daily' ? (
          <form action={summary.mode === 'ghost' ? '/api/play/ghost' : '/api/play/classic'} method="post">
            <button className="btn btn-gold w-full">Play again</button>
          </form>
        ) : (
          <Link href="/leaderboard?view=daily" className="btn btn-gold">
            Daily ranking
          </Link>
        )}
        {cfg.flags.friendChallenges && (summary.mode === 'classic' || summary.mode === 'friend') ? <FriendChallengeButton sessionId={id} /> : null}
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
      </div>

      <section aria-labelledby="review-title">
        <h2 id="review-title" className="font-display mb-3 text-lg font-black">
          Your answers
        </h2>
        <ol className="space-y-3">
          {review.map((r) => (
            <li key={r.position} className="ivory rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 text-label font-bold uppercase text-ink-500">
                <span>
                  Q{r.position + 1} · {r.category} · {r.difficulty}
                </span>
                <span className={r.outcome === 'correct' ? 'text-emerald-700' : 'text-coral-700'}>
                  {r.outcome === 'correct' ? `+${r.points}` : r.outcome === 'timeout' ? (r.points < 0 ? `Time up −${-r.points}` : 'Time up') : 'Wrong'}
                </span>
              </div>
              <p className="mt-1 font-semibold">{r.text}</p>
              <p className="mt-1 text-sm">
                <span className="font-semibold text-emerald-700">Answer: {r.correct}</span>
                {r.outcome === 'incorrect' && r.selected ? <span className="text-coral-700"> · You said: {r.selected}</span> : null}
              </p>
              <p className="mt-1 text-sm text-ink-700">{r.explanation}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function outcomeLabel(mine: number, theirs: number) {
  return mine > theirs ? (
    <span className="inline-flex items-center gap-2">
      You won! <Icon name="trophy" size={26} className="text-gold-400" />
    </span>
  ) : mine < theirs ? 'They won this time' : 'It’s a draw';
}

