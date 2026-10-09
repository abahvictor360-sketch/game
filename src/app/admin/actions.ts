'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { FlagsSchema, RulesSchema, validateRules } from '@/lib/game/rules';
import { QuestionInputSchema } from '@/lib/shared/question-input';
import { audit } from '@/lib/server/audit';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig, saveNewConfig } from '@/lib/server/config';
import {
  approveQuestion,
  archiveQuestion,
  createQuestion,
  findDuplicates,
  importQuestions,
  rejectQuestion,
  restoreQuestion,
  setDifficultyLock,
  submitForReview,
  updateQuestion,
} from '@/lib/server/content';
import { validateCsv, type ImportRow } from '@/lib/server/csv';
import { AppError } from '@/lib/server/errors';
import { rateLimit } from '@/lib/server/rate-limit';
import { requireStaff } from '@/lib/server/staff';

export type FormState = { errors: Record<string, string>; message: string | null; duplicates?: { question_id: string; text: string; status: string }[] };

function formToInput(form: FormData) {
  const list = (k: string) =>
    String(form.get(k) ?? '')
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  const sources = String(form.get('sources') ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [title, url] = l.split('|').map((x) => x.trim());
      return url ? { title, url } : { title: l, url: l };
    });
  return {
    text: String(form.get('text') ?? ''),
    options: { A: String(form.get('optionA') ?? ''), B: String(form.get('optionB') ?? ''), C: String(form.get('optionC') ?? ''), D: String(form.get('optionD') ?? '') },
    correct: String(form.get('correct') ?? ''),
    explanation: String(form.get('explanation') ?? ''),
    categoryId: String(form.get('categoryId') ?? ''),
    countryScope: list('countryScope'),
    difficulty: String(form.get('difficulty') ?? ''),
    ageRating: String(form.get('ageRating') ?? 'all'),
    tags: list('tags'),
    language: String(form.get('language') ?? 'en'),
    sources,
    verifiedAt: String(form.get('verifiedAt') ?? '') || null,
    sponsorRef: String(form.get('sponsorRef') ?? '') || null,
  };
}

function zodErrors(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path[0] === 'options' ? `option${String(i.path[1])}` : String(i.path[0]);
    out[k] ??= i.message;
  }
  return out;
}

export async function saveQuestion(questionId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = QuestionInputSchema.safeParse(formToInput(form));
  if (!parsed.success) return { errors: zodErrors(parsed.error), message: 'Please fix the highlighted fields.' };
  const db = await ensureReady();
  const dups = await findDuplicates(db, parsed.data.text, questionId ?? undefined);
  if (dups.length && form.get('allowDuplicate') !== 'on') {
    return { errors: { text: 'A question with the same wording already exists.' }, message: 'Possible duplicate. Review it, or tick “Save anyway”.', duplicates: dups };
  }
  let id = questionId;
  try {
    await db.tx(async (q) => {
      if (questionId) {
        await updateQuestion(q, questionId, parsed.data, staff.id);
      } else {
        id = (await createQuestion(q, parsed.data, staff.id, { initialState: 'draft' })).questionId;
      }
      if (form.get('submitForReview') === 'on') await submitForReview(q, id!, staff.id);
    });
  } catch (e) {
    if (e instanceof AppError) return { errors: {}, message: e.message };
    throw e;
  }
  revalidatePath('/admin/questions');
  redirect(`/admin/questions/${id}?saved=1`);
}

export async function questionAction(questionId: string, form: FormData) {
  const staff = await requireStaff();
  const action = String(form.get('action'));
  const note = String(form.get('note') ?? '').trim();
  const db = await ensureReady();
  const adminOnly = ['approve', 'archive', 'restore', 'lock', 'unlock'];
  if (adminOnly.includes(action) && staff.role !== 'admin') throw new AppError('forbidden', 'Only administrators can do that.');
  await db.tx(async (q) => {
    switch (action) {
      case 'submit':
        return submitForReview(q, questionId, staff.id);
      case 'approve':
        return approveQuestion(q, questionId, staff.id, note || undefined);
      case 'reject':
        return rejectQuestion(q, questionId, staff.id, note || 'Needs changes');
      case 'archive':
        return archiveQuestion(q, questionId, staff.id, note || undefined);
      case 'restore':
        return restoreQuestion(q, questionId, staff.id);
      case 'lock':
      case 'unlock':
        return setDifficultyLock(q, String(form.get('versionId')), action === 'lock', staff.id);
    }
  });
  revalidatePath(`/admin/questions/${questionId}`);
  revalidatePath('/admin/questions');
}

export type ImportState = {
  stage: 'idle' | 'preview' | 'done';
  fatal: string | null;
  rows: Pick<ImportRow, 'line' | 'errors' | 'text'>[];
  valid: number;
  csv: string;
  filename: string | null;
  created?: number;
};

export async function previewImport(_prev: ImportState, form: FormData): Promise<ImportState> {
  const staff = await requireStaff();
  const db = await ensureReady();
  await rateLimit(db, `import:${staff.id}`, 30, 3600);
  const file = form.get('file');
  const csv = file instanceof File ? await file.text() : String(form.get('csv') ?? '');
  const filename = file instanceof File ? file.name : (String(form.get('filename') ?? '') || null);
  const { rows, fatal } = await validateCsv(db, csv);
  return { stage: 'preview', fatal, rows: rows.map((r) => ({ line: r.line, errors: r.errors, text: r.text })), valid: rows.filter((r) => r.input).length, csv, filename };
}

export async function commitImport(_prev: ImportState, form: FormData): Promise<ImportState> {
  const staff = await requireStaff();
  const db = await ensureReady();
  await rateLimit(db, `import:${staff.id}`, 30, 3600);
  const csv = String(form.get('csv') ?? '');
  const filename = String(form.get('filename') ?? '') || null;
  const state = form.get('state') === 'review' ? 'review' : 'draft';
  // Re-validate on the server: the preview is never trusted.
  const { rows, fatal } = await validateCsv(db, csv);
  if (fatal) return { stage: 'preview', fatal, rows: [], valid: 0, csv, filename };
  const valid = rows.filter((r) => r.input) as (ImportRow & { input: NonNullable<ImportRow['input']> })[];
  const { created } = await db.tx((q) => importQuestions(q, valid, staff.id, state, { filename, totalRows: rows.length, skipped: rows.length - valid.length }));
  revalidatePath('/admin/questions');
  return { stage: 'done', fatal: null, rows: rows.filter((r) => !r.input).map((r) => ({ line: r.line, errors: r.errors, text: r.text })), valid: valid.length, csv: '', filename, created };
}

export async function resolveReport(reportId: string, form: FormData) {
  const staff = await requireStaff();
  const status = form.get('status') === 'dismissed' ? 'dismissed' : 'resolved';
  const note = String(form.get('note') ?? '').trim() || null;
  const db = await ensureReady();
  await db.tx(async (q) => {
    await q.query(
      `update public.question_reports set status = $2, resolution_note = $3, resolved_by = $4, resolved_at = now() where id = $1 and status = 'open'`,
      [reportId, status, note, staff.id],
    );
    await audit(q, staff.id, `report.${status}`, 'report', reportId, { note });
  });
  revalidatePath('/admin/reports');
}

export type SettingsState = { message: string | null; errors: string[] };

export async function saveSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await requireStaff('admin');
  const db = await ensureReady();
  const current = await getActiveConfig(db);
  const num = (k: string) => Number(form.get(k));
  const sec = (k: string) => Math.round(num(k) * 1000);
  const draft = structuredClone(current.rules);
  draft.timersMs = { easy: sec('timer_easy'), medium: sec('timer_medium'), hard: sec('timer_hard') };
  draft.points = { easy: num('points_easy'), medium: num('points_medium'), hard: num('points_hard') };
  draft.latencyGraceMs = sec('grace');
  draft.classic.distribution = { easy: num('classic_easy'), medium: num('classic_medium'), hard: num('classic_hard') };
  draft.classic.questionCount = draft.classic.distribution.easy + draft.classic.distribution.medium + draft.classic.distribution.hard;
  draft.classic.endOnWrongAnswer = form.get('endOnWrongAnswer') === 'on';
  draft.classic.lifelines = { fifty_fifty: form.get('ll_fifty') === 'on', change_question: form.get('ll_change') === 'on', ask_audience: form.get('ll_audience') === 'on' };
  draft.daily.distribution = { easy: num('daily_easy'), medium: num('daily_medium'), hard: num('daily_hard') };
  draft.daily.questionCount = draft.daily.distribution.easy + draft.daily.distribution.medium + draft.daily.distribution.hard;
  draft.daily.timerMs = sec('daily_timer');
  draft.daily.requireAccountForLeaderboard = form.get('dailyRequireAccount') === 'on';
  draft.freshness.recentWindowDays = num('freshness_days');
  const flags = {
    multiplayer: form.get('flag_multiplayer') === 'on',
    ghostOpponents: form.get('flag_ghost') === 'on',
    friendChallenges: form.get('flag_friend') === 'on',
    askAudience: form.get('flag_audience') === 'on',
  };
  const rules = RulesSchema.safeParse(draft);
  const f = FlagsSchema.safeParse(flags);
  const errors = [...(rules.success ? validateRules(rules.data) : rules.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)), ...(f.success ? [] : ['Invalid flags'])];
  if (errors.length || !rules.success || !f.success) return { message: null, errors };
  const version = await db.tx(async (q) => {
    const v = await saveNewConfig(q, { rules: rules.data, flags: f.data, note: String(form.get('note') ?? '') || null, actorId: staff.id });
    await audit(q, staff.id, 'config.update', 'game_config', String(v), { from: current.version });
    return v;
  });
  revalidatePath('/', 'layout');
  return { message: `Saved as ruleset version ${version}. Games already in progress keep their original rules.`, errors: [] };
}
