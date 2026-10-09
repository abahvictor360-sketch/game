import Link from 'next/link';
import { ErrorState, PageTitle, Panel, SignInRequired } from '@/components/ui';
import { currentAccount } from '@/lib/server/identity';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { modeRules } from '@/lib/game/rules';

export const metadata = { title: 'Classic' };

const ERRORS: Record<string, string> = {
  content_unavailable: 'Classic is temporarily unavailable while we add more questions. Please try again soon.',
  rate_limited: 'You’re starting games very quickly. Please wait a moment and try again.',
  internal: 'We couldn’t start your game. Please try again.',
};

export default async function ClassicSetup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const db = await ensureReady();
  const [cfg, account] = await Promise.all([getActiveConfig(db), currentAccount()]);
  const mr = modeRules('classic', cfg.rules, cfg.flags);
  const r = cfg.rules;
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Classic" subtitle="Climb the ladder from easy to hard. Learn something after every answer." />
      {error ? <ErrorState title="Couldn’t start the game">{ERRORS[error] ?? ERRORS.internal}</ErrorState> : null}
      <Panel className="mt-4">
        <dl className="grid grid-cols-3 gap-3 text-center">
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <div key={d} className="rounded-xl bg-white/5 p-3">
              <dt className="text-label font-bold uppercase text-blue-100/70">{d}</dt>
              <dd className="font-display text-2xl font-black text-gold-400">{r.points[d]}</dd>
              <dd className="text-xs text-blue-100/80">
                {r.classic.distribution[d]} questions · {r.timersMs[d] / 1000}s
              </dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 space-y-1 text-sm text-blue-100/85">
          <li>• {mr.questionCount} questions, four options each, one correct answer.</li>
          <li>• {r.classic.endOnWrongAnswer ? 'A wrong answer ends the game.' : 'A wrong answer or timeout scores zero, but you keep playing.'}</li>
          <li>• Lifelines (once each): {[mr.lifelines.fifty_fifty && '50:50', mr.lifelines.change_question && 'Change Question', mr.lifelines.ask_audience && 'Ask the Audience'].filter(Boolean).join(', ')}.</li>
        </ul>
        {account ? (
          <form action="/api/play/classic" method="post" className="mt-6">
            <button className="btn btn-gold w-full min-h-14 text-lg">Start game</button>
          </form>
        ) : (
          <div className="mt-6">
            <SignInRequired next="/play/classic" />
          </div>
        )}
        <p className="mt-3 text-center text-xs text-blue-100/70">
          <Link href="/how-to-play" className="underline">
            Read the full rules
          </Link>
        </p>
      </Panel>
    </div>
  );
}
