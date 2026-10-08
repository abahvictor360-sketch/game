import Link from 'next/link';
import { PageTitle, Panel } from '@/components/ui';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';

export const metadata = { title: 'How to play' };

export default async function HowToPlay() {
  const db = await ensureReady();
  const { rules: r, flags } = await getActiveConfig(db);
  const s = (ms: number) => `${ms / 1000} seconds`;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle title="How to play" subtitle="Quick to learn, fun to master." />
      <Panel>
        <h2 className="font-display text-lg font-black text-gold-400">Classic</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-blue-100/90">
          <li>• {r.classic.questionCount} questions: {r.classic.distribution.easy} easy, {r.classic.distribution.medium} medium, then {r.classic.distribution.hard} hard.</li>
          <li>• Each question has four options and one correct answer.</li>
          <li>• Correct answers score {r.points.easy} (easy), {r.points.medium} (medium) or {r.points.hard} (hard) points. Wrong answers and timeouts score zero.</li>
          <li>• You have {s(r.timersMs.easy)} for easy, {s(r.timersMs.medium)} for medium and {s(r.timersMs.hard)} for hard questions.</li>
          <li>• {r.classic.endOnWrongAnswer ? 'A wrong answer ends your game.' : 'A wrong answer doesn’t end your game — keep climbing!'}</li>
          <li>• After each answer you’ll see the correct answer and a short explanation.</li>
        </ul>
      </Panel>
      <Panel>
        <h2 className="font-display text-lg font-black text-gold-400">Lifelines (Classic only)</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-blue-100/90">
          <li>
            • <strong>50:50</strong> removes two wrong answers. Your timer keeps running.
          </li>
          <li>
            • <strong>Change Question</strong> swaps the question for another of the same difficulty, with a fresh timer. If no replacement is available, you keep the lifeline.
          </li>
          {flags.askAudience ? (
            <li>
              • <strong>Ask the Audience</strong> shows how other players answered — live voters when enough are online (your timer pauses while they vote), otherwise previous players’ answers for this exact question. The audience can be wrong!
            </li>
          ) : null}
          <li>• Each lifeline works once per game, and only before you lock in an answer.</li>
        </ul>
      </Panel>
      <Panel>
        <h2 className="font-display text-lg font-black text-flame-400">Daily Challenge</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-blue-100/90">
          <li>• {r.daily.questionCount} questions, the same for everyone, {s(r.daily.timerMs)} each. No lifelines.</li>
          <li>• One attempt per day. A new challenge starts at midnight West Africa Time (Lagos).</li>
          <li>• Refreshing the page resumes your attempt — the clock keeps running on our server.</li>
        </ul>
      </Panel>
      <Panel>
        <h2 className="font-display text-lg font-black text-gold-400">Leaderboards & fairness</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-blue-100/90">
          <li>• Only games played while signed in are ranked. Guests can play everything.</li>
          <li>• Ties are broken by number of correct answers, then by total answer time.</li>
          <li>• Timing and scoring happen on our servers, so a slow connection may cost a moment — answer early when you can.</li>
          {flags.friendChallenges ? <li>• Friend challenges are just for fun and never count towards leaderboards.</li> : null}
          {flags.ghostOpponents ? <li>• If no one is available for a live match, you may race a recording of a real player’s game. It’s always labelled as a recording.</li> : null}
        </ul>
      </Panel>
      <div className="text-center">
        <Link href="/play/classic" className="btn btn-gold">
          Play Classic
        </Link>
      </div>
    </div>
  );
}
