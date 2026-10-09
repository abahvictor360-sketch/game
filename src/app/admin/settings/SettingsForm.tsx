'use client';
import { useActionState } from 'react';
import { saveSettings, type SettingsState } from '@/app/admin/actions';
import { Card, btnPrimary } from '@/components/admin/ui';
import type { Flags, Rules } from '@/lib/game/rules';

function Num({ name, label, value, step = 1, min = 0 }: { name: string; label: string; value: number; step?: number; min?: number }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input type="number" name={name} defaultValue={value} step={step} min={min} required className="field mt-1" />
    </label>
  );
}

function Check({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) {
  return (
    <label className="flex min-h-11 items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 h-5 w-5" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-ink-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SettingsForm({ rules: r, flags, envFlags }: { rules: Rules; flags: Flags; envFlags: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, { message: null, errors: [] });
  return (
    <form action={action} className="space-y-4">
      <Card>
        <h2 className="font-bold">Timers & points</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Num name="timer_easy" label="Easy timer (s)" value={r.timersMs.easy / 1000} min={5} />
          <Num name="timer_medium" label="Medium timer (s)" value={r.timersMs.medium / 1000} min={5} />
          <Num name="timer_hard" label="Hard timer (s)" value={r.timersMs.hard / 1000} min={5} />
          <Num name="grace" label="Latency grace (s)" value={r.latencyGraceMs / 1000} step={0.1} />
          <Num name="points_easy" label="Easy points" value={r.points.easy} />
          <Num name="points_medium" label="Medium points" value={r.points.medium} />
          <Num name="points_hard" label="Hard points" value={r.points.hard} />
          <Num name="freshness_days" label="Freshness window (days)" value={r.freshness.recentWindowDays} />
        </div>
      </Card>
      <Card>
        <h2 className="font-bold">Classic</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Num name="classic_easy" label="Easy questions" value={r.classic.distribution.easy} />
          <Num name="classic_medium" label="Medium questions" value={r.classic.distribution.medium} />
          <Num name="classic_hard" label="Hard questions" value={r.classic.distribution.hard} />
        </div>
        <div className="mt-2 grid gap-1 md:grid-cols-2">
          <Check name="endOnWrongAnswer" label="Elimination: a wrong answer ends the game" checked={r.classic.endOnWrongAnswer} hint="Default off: players finish all questions." />
          <Check name="ll_fifty" label="50:50 lifeline" checked={r.classic.lifelines.fifty_fifty} />
          <Check name="ll_change" label="Change Question lifeline" checked={r.classic.lifelines.change_question} />
          <Check name="ll_audience" label="Ask the Audience lifeline" checked={r.classic.lifelines.ask_audience} hint="Also requires the Ask the Audience feature flag." />
        </div>
      </Card>
      <Card>
        <h2 className="font-bold">Daily Challenge</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Num name="daily_easy" label="Easy questions" value={r.daily.distribution.easy} />
          <Num name="daily_medium" label="Medium questions" value={r.daily.distribution.medium} />
          <Num name="daily_hard" label="Hard questions" value={r.daily.distribution.hard} />
          <Num name="daily_timer" label="Timer (s)" value={r.daily.timerMs / 1000} min={5} />
        </div>
        <Check name="dailyRequireAccount" label="Only signed-in players are ranked" checked={r.daily.requireAccountForLeaderboard} />
        <p className="text-xs text-ink-500">Reset time zone: {r.daily.timezone}. Changes apply from the next published challenge.</p>
      </Card>
      <Card>
        <h2 className="font-bold">Phase 2 feature flags</h2>
        <p className="text-xs text-ink-500">Disabled features are hidden from players entirely.{envFlags ? ` Forced on by environment: ${envFlags}.` : ''}</p>
        <div className="mt-2 grid gap-1 md:grid-cols-2">
          <Check name="flag_multiplayer" label="Live two-player matches" checked={flags.multiplayer} />
          <Check name="flag_ghost" label="Recorded (ghost) opponents" checked={flags.ghostOpponents} />
          <Check name="flag_friend" label="Challenge a Friend links" checked={flags.friendChallenges} />
          <Check name="flag_audience" label="Ask the Audience" checked={flags.askAudience} />
        </div>
      </Card>
      <Card>
        <label className="block text-sm font-semibold">
          Change note
          <input name="note" className="field mt-1" placeholder="Why are these settings changing?" maxLength={200} />
        </label>
        {state.errors.length ? (
          <ul role="alert" className="mt-3 list-disc pl-5 text-sm text-red-800">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {state.message ? (
          <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">
            {state.message}
          </p>
        ) : null}
        <button className={`${btnPrimary} mt-3`} disabled={pending}>
          {pending ? 'Saving…' : 'Save new ruleset version'}
        </button>
      </Card>
    </form>
  );
}
