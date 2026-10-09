'use client';
import { useActionState } from 'react';
import { Avatar, AVATAR_LABELS } from '@/components/Avatar';
import { AFRICAN_COUNTRIES } from '@/lib/shared/countries';
import { saveProfile } from './actions';

type Props = {
  displayName: string;
  avatarKey: string;
  countryCode: string | null;
  allowGhostReplay: boolean;
  helpOthers: boolean;
  showHelp: boolean;
  showGhost: boolean;
};

export function ProfileForm(p: Props) {
  const [state, action, pending] = useActionState(saveProfile, { error: null, ok: false });
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-semibold">
        Display name
        <input name="displayName" defaultValue={p.displayName} required minLength={2} maxLength={24} className="field field-dark mt-1" />
        <span className="mt-1 block text-xs font-normal text-blue-100/60">Shown on leaderboards. 2–24 letters, numbers or spaces.</span>
      </label>
      <fieldset>
        <legend className="text-sm font-semibold">Avatar</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.keys(AVATAR_LABELS).map((k) => (
            <label key={k} className="cursor-pointer rounded-full p-1 ring-2 ring-transparent has-[:checked]:ring-gold-400 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-gold-400">
              <input type="radio" name="avatarKey" value={k} defaultChecked={p.avatarKey === k} className="sr-only" />
              <Avatar name={k} size={44} />
              <span className="sr-only">{AVATAR_LABELS[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold">
        Country (optional)
        <select name="countryCode" defaultValue={p.countryCode ?? ''} className="field field-dark mt-1">
          <option value="">Prefer not to say</option>
          {AFRICAN_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {p.showGhost ? (
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="allowGhostReplay" defaultChecked={p.allowGhostReplay} className="mt-1 h-5 w-5 accent-gold-500" />
          <span>
            Let others race against recordings of my lifeline-free Classic games
            <span className="block text-xs text-blue-100/60">Shown under a pseudonym and always labelled as a recorded player.</span>
          </span>
        </label>
      ) : p.allowGhostReplay ? (
        // Keep the saved choice while the feature is switched off.
        <input type="hidden" name="allowGhostReplay" value="on" />
      ) : null}
      {p.showHelp ? (
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="helpOthers" defaultChecked={p.helpOthers} className="mt-1 h-5 w-5 accent-gold-500" />
          <span>
            Help other players (Ask the Audience)
            <span className="block text-xs text-blue-100/60">
              While the{' '}
              <a href="/help" className="font-bold text-gold-300 underline">
                Be the audience
              </a>{' '}
              page is open and you’re not in a game, you may be invited to vote — at most once every two minutes.
            </span>
          </span>
        </label>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-coral-400">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm text-emerald-400">
          Saved.
        </p>
      ) : null}
      <button className="btn btn-gold" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
