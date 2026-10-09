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
          <li>• {r.classic.endOnWrongAnswer ? 'A wrong answer ends your game.' : 'A wrong answer doesn’t end your game. Keep climbing!'}</li>
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
              • <strong>Ask the Audience</strong> shows how other players answered: live voters when enough are online (your timer pauses while they vote), otherwise previous players’ answers for this exact question. The audience can be wrong!
            </li>
          ) : null}
          <li>• Each lifeline works once per game, and only before you lock in an answer.</li>
        </ul>
      </Panel>
      <Panel>
        <h2 className="font-display text-lg font-black text-flame-400">Daily Challenge</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-blue-100/90">
          <li>• {r.daily.questionCount} questions, the same for everyone, {s(r.daily.timerMs)} each. No lifelines.</li>
          <li>
            • One attempt per day. A new challenge starts at midnight{' '}
            {r.daily.timezone === 'Africa/Lagos' ? 'West Africa Time (Lagos)' : `(${r.daily.timezone.replace(/_/g, ' ')} time)`}.
          </li>
          <li>• Refreshing the page resumes your attempt, and the clock keeps running on our server.</li>
        </ul>
      </Panel>
      {flags.multiplayer || flags.ghostOpponents ? (
        <Panel>
          <h2 className="font-display text-lg font-black text-gold-400">Versus</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-blue-100/90">
            <li>
              • Both players get the same {r.versus.questionCount} questions ({r.versus.distribution.easy} easy, {r.versus.distribution.medium} medium, {r.versus.distribution.hard} hard) on the same clock. No lifelines.
            </li>
            <li>
              • A correct answer scores its points plus a speed bonus of up to {Math.round(r.versus.speedBonusFactor * 100)}% for answering quickly: <span className="whitespace-nowrap">bonus = points × {r.versus.speedBonusFactor} × time left ÷ question time</span>, rounded down. Wrong answers and timeouts score zero.
            </li>
            {flags.multiplayer ? (
              <>
                <li>• After a short countdown, each round stays open until you both answer or time runs out. You’ll see when your opponent has answered, but never what they picked. Answers are revealed together.</li>
                <li>
                  • Lost your connection? You have {s(r.versus.reconnectWindowMs)} to come back; the clock doesn’t stop or restart. After that you forfeit, and your opponent finishes and wins.
                </li>
                <li>• Leaving the match counts as a forfeit. If both players drop out, the match is cancelled with no result.</li>
                <li>• Highest score wins; ties are broken by correct answers, then total answer time.</li>
              </>
            ) : null}
            {flags.ghostOpponents ? (
              <li>
                • {flags.multiplayer ? `If no one is found within about ${s(r.versus.matchmakingFallbackMs)}, you can` : 'You can'} race a recording of a real player’s lifeline-free game. It’s always labelled as a recorded player and never presented as someone online now.
              </li>
            ) : null}
          </ul>
        </Panel>
      ) : null}
      {flags.friendChallenges ? (
        <Panel>
          <h2 className="font-display text-lg font-black text-gold-400">Challenge a friend</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-blue-100/90">
            <li>• After a Classic game, create a link. Your friend plays the same questions under the same rules, with no lifelines, and you both see the scores.</li>
            <li>• Links expire after {r.friendChallenge.expiryDays} days, and each person can play a challenge once.</li>
            <li>• Friend challenges are just for fun and never count towards leaderboards.</li>
          </ul>
        </Panel>
      ) : null}
      {flags.askAudience ? (
        <Panel>
          <h2 className="font-display text-lg font-black text-gold-400">Be the audience</h2>
          <p className="mt-2 text-sm text-blue-100/90">
            Turn on “Help other players” in your profile and keep the{' '}
            <Link href="/help" className="font-bold text-gold-300 underline">
              Be the audience
            </Link>{' '}
            page open. When someone asks the audience you’ll get {s(r.audience.votingWindowMs)} to vote, anonymously and at most once every {Math.round(r.audience.helperCooldownMs / 60000)} minutes.
          </p>
        </Panel>
      ) : null}
      <Panel>
        <h2 className="font-display text-lg font-black text-gold-400">Leaderboards & fairness</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-blue-100/90">
          <li>• Only games played while signed in are ranked. Guests can play everything.</li>
          <li>• Ties are broken by number of correct answers, then by total answer time.</li>
          <li>• Timing and scoring happen on our servers, so a slow connection may cost a moment, so answer early when you can.</li>
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
