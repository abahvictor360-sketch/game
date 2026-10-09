'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { saveQuestion, type FormState } from '@/app/admin/actions';
import type { QuestionInput } from '@/lib/shared/question-input';
import { btnPrimary, btnQuiet } from './ui';

export function QuestionForm({ questionId, initial, categories, editsLive }: { questionId: string | null; initial: QuestionInput | null; categories: { id: string; name: string }[]; editsLive: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveQuestion.bind(null, questionId), { errors: {}, message: null });
  const [preview, setPreview] = useState<{ text: string; opts: string[]; correct: string } | null>(null);
  const err = (k: string) =>
    state.errors[k] ? (
      <span id={`${k}-err`} className="mt-1 block text-xs font-semibold text-coral-700">
        {state.errors[k]}
      </span>
    ) : null;
  const aria = (k: string) => (state.errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const v = initial;
  return (
    <form
      action={action}
      className="space-y-4"
      onChange={(e) => {
        const f = new FormData(e.currentTarget);
        setPreview({ text: String(f.get('text') ?? ''), opts: ['A', 'B', 'C', 'D'].map((l) => String(f.get(`option${l}`) ?? '')), correct: String(f.get('correct') ?? 'A') });
      }}
    >
      {editsLive ? <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">This question is live. Saving creates a new draft version; players keep seeing the current version until the new one is approved.</p> : null}
      {state.message ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
          {state.message}
        </p>
      ) : null}
      {state.duplicates?.length ? (
        <ul className="rounded-xl bg-amber-50 p-3 text-sm">
          {state.duplicates.map((d) => (
            <li key={d.question_id}>
              <Link className="underline" href={`/admin/questions/${d.question_id}`} target="_blank">
                {d.text}
              </Link>{' '}
              ({d.status})
            </li>
          ))}
          <li className="mt-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="allowDuplicate" /> Save anyway (not a duplicate)
            </label>
          </li>
        </ul>
      ) : null}
      <label className="block text-sm font-semibold">
        Question
        <textarea name="text" defaultValue={v?.text} required rows={2} maxLength={400} className="field mt-1" {...aria('text')} />
        {err('text')}
      </label>
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">Options (choose the correct one)</legend>
        {(['A', 'B', 'C', 'D'] as const).map((l) => (
          <div key={l} className="flex items-start gap-2">
            <label className="mt-3 flex items-center gap-1 text-sm font-bold">
              <input type="radio" name="correct" value={l} defaultChecked={(v?.correct ?? 'A') === l} required aria-label={`Option ${l} is correct`} />
              {l}
            </label>
            <div className="flex-1">
              <input name={`option${l}`} defaultValue={v?.options[l]} required maxLength={160} className="field" aria-label={`Option ${l}`} {...aria(`option${l}`)} />
              {err(`option${l}`)}
            </div>
          </div>
        ))}
      </fieldset>
      <label className="block text-sm font-semibold">
        Explanation (shown after answering)
        <textarea name="explanation" defaultValue={v?.explanation} required rows={3} maxLength={800} className="field mt-1" {...aria('explanation')} />
        {err('explanation')}
      </label>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-sm font-semibold">
          Category
          <select name="categoryId" defaultValue={v?.categoryId ?? ''} required className="field mt-1">
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {err('categoryId')}
        </label>
        <label className="text-sm font-semibold">
          Difficulty
          <select name="difficulty" defaultValue={v?.difficulty ?? 'medium'} className="field mt-1">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Age rating
          <select name="ageRating" defaultValue={v?.ageRating ?? 'all'} className="field mt-1">
            <option value="all">All ages</option>
            <option value="13+">13+</option>
            <option value="16+">16+</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Language
          <input name="language" defaultValue={v?.language ?? 'en'} className="field mt-1" maxLength={10} />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-semibold">
          Country / region scope
          <input name="countryScope" defaultValue={v?.countryScope.join('; ')} className="field mt-1" placeholder="NG; GH or WEST, AFRICA" {...aria('countryScope')} />
          {err('countryScope')}
        </label>
        <label className="text-sm font-semibold">
          Tags
          <input name="tags" defaultValue={v?.tags.join('; ')} className="field mt-1" placeholder="rivers; independence" />
        </label>
        <label className="text-sm font-semibold">
          Verified on
          <input type="date" name="verifiedAt" defaultValue={v?.verifiedAt ?? ''} className="field mt-1" {...aria('verifiedAt')} />
          {err('verifiedAt')}
        </label>
      </div>
      <label className="block text-sm font-semibold">
        Sources (one per line: Title | https://url)
        <textarea name="sources" defaultValue={v?.sources.map((s) => `${s.title} | ${s.url}`).join('\n')} rows={2} className="field mt-1" {...aria('sources')} />
        {err('sources')}
      </label>
      <label className="block text-sm font-semibold">
        Sponsor reference (optional)
        <input name="sponsorRef" defaultValue={v?.sponsorRef ?? ''} className="field mt-1" maxLength={100} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="submitForReview" /> Submit for review after saving
      </label>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <Link href={questionId ? `/admin/questions/${questionId}` : '/admin/questions'} className={btnQuiet}>
          Cancel
        </Link>
      </div>
      {preview?.text ? (
        <section aria-label="Preview" className="rounded-2xl bg-stage-900 p-4 text-white">
          <p className="text-xs uppercase tracking-widest text-gold-300">Player preview</p>
          <p className="mt-1 font-bold">{preview.text}</p>
          <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">
            {preview.opts.map((o, i) => (
              <li key={i} className={`rounded-full px-3 py-1 ring-1 ${'ABCD'[i] === preview.correct ? 'ring-emerald-400' : 'ring-white/30'}`}>
                <span className="font-bold text-gold-400">{'ABCD'[i]}:</span> {o}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
