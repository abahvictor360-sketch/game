import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { Badge, EmptyState, PageTitle, Panel } from '@/components/ui';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { currentPlayer } from '@/lib/server/identity';
import { ProfileForm } from './ProfileForm';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const player = await currentPlayer();
  if (!player || player.kind !== 'account') {
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle title="Your profile" />
        <EmptyState title="Sign in to get started" action={<Link href="/auth/signin?next=/profile" className="btn btn-gold">Sign in or create an account</Link>}>
          A free account is needed to play. It keeps your scores and history and puts you on the leaderboards.
        </EmptyState>
      </div>
    );
  }
  const db = await ensureReady();
  const cfg = await getActiveConfig(db);
  const [stats] = await db.query<{ games: number; best: number | null; correct: number; answered: number; dailies: number }>(
    `select count(*)::int as games, max(score) filter (where mode = 'classic')::int as best,
            coalesce(sum(correct_count), 0)::int as correct, coalesce(sum(answered_count), 0)::int as answered,
            count(*) filter (where mode = 'daily')::int as dailies
       from public.game_sessions where player_id = $1 and status = 'completed'`,
    [player.id],
  );
  const history = await db.query<{ id: string; mode: string; score: number; correct_count: number; total_questions: number; completed_at: Date; leaderboard_eligible: boolean }>(
    `select id, mode, score, correct_count, total_questions, completed_at, leaderboard_eligible from public.game_sessions
      where player_id = $1 and status = 'completed' order by completed_at desc limit 20`,
    [player.id],
  );
  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle title="Your profile" />
      <Panel className="flex items-center gap-4">
        <Avatar name={player.avatarKey} size={64} />
        <div className="flex-1">
          <p className="font-display text-xl font-black">{player.displayName}</p>
          <p className="text-sm text-blue-100/70">{player.kind === 'account' ? 'Account' : 'Guest on this device'}</p>
        </div>
        {player.kind === 'account' ? (
          <form action="/auth/signout" method="post">
            <button className="btn btn-ghost btn-sm">Sign out</button>
          </form>
        ) : (
          <Link href="/auth/signin?next=/profile" className="btn btn-gold btn-sm">
            Create account
          </Link>
        )}
      </Panel>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Games', stats.games],
          ['Best Classic', stats.best ?? '-'],
          ['Accuracy', `${accuracy}%`],
          ['Dailies', stats.dailies],
        ].map(([k, v]) => (
          <div key={k} className="panel p-3 text-center">
            <dt className="text-label font-bold uppercase text-blue-100/60">{k}</dt>
            <dd className="font-display text-2xl font-black text-gold-400">{v}</dd>
          </div>
        ))}
      </dl>

      <Panel>
        <h2 className="font-display mb-3 text-lg font-black">Settings</h2>
        <ProfileForm
          displayName={player.displayName}
          avatarKey={player.avatarKey}
          countryCode={player.countryCode}
          allowGhostReplay={player.settings.allowGhostReplay !== false}
          helpOthers={!!player.settings.helpOthers}
          showHelp={cfg.flags.askAudience}
          showGhost={cfg.flags.ghostOpponents}
        />
      </Panel>

      <section>
        <h2 className="font-display mb-3 text-lg font-black">Recent games</h2>
        {history.length === 0 ? (
          <EmptyState title="No games yet" action={<Link href="/play/classic" className="btn btn-gold">Play Classic</Link>} />
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id}>
                <Link href={`/results/${h.id}`} className="panel flex items-center justify-between gap-3 p-3 hover:ring-1 hover:ring-gold-400">
                  <span>
                    <span className="font-semibold capitalize">{h.mode === 'ghost' ? 'Versus' : h.mode}</span>
                    <span className="block text-xs text-blue-100/60">{h.completed_at.toISOString().slice(0, 10)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {!h.leaderboard_eligible && (h.mode === 'classic' || h.mode === 'daily') ? <Badge tone="grey">unranked</Badge> : null}
                    <span className="text-sm text-blue-100/80">
                      {h.correct_count}/{h.total_questions}
                    </span>
                    <span className="font-display font-black text-gold-400">{h.score}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
