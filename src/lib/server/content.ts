import 'server-only';
import { createHash } from 'node:crypto';
import { DEFAULT_CATEGORIES } from '@/lib/shared/categories';
import { OPTION_LABELS, normaliseForHash, type QuestionInput } from '@/lib/shared/question-input';
import { audit } from './audit';
import { pgArray, pgJson, type Queryable } from './db';
import { AppError, notFound } from './errors';

export type QuestionStatus = 'draft' | 'review' | 'approved' | 'archived';
export type VersionState = 'draft' | 'review' | 'approved' | 'superseded' | 'rejected';

export function contentHash(text: string): string {
  return createHash('sha256').update(normaliseForHash(text)).digest('hex');
}

export async function ensureCategories(q: Queryable) {
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await q.query(
      `insert into public.categories(id, name, description, sort_order) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [c.id, c.name, c.description, i],
    );
  }
}

async function assertCategory(q: Queryable, id: string) {
  const rows = await q.query('select 1 from public.categories where id = $1', [id]);
  if (!rows.length) throw new AppError('bad_request', `Unknown category "${id}".`);
}

/** Existing questions whose normalised text matches (duplicate detection). */
export async function findDuplicates(q: Queryable, text: string, excludeQuestionId?: string) {
  return q.query<{ question_id: string; text: string; status: string }>(
    `select distinct on (q.id) q.id as question_id, v.text, q.status
       from public.question_versions v join public.questions q on q.id = v.question_id
      where v.content_hash = $1 and ($2::uuid is null or q.id <> $2::uuid)
      order by q.id, v.version desc limit 5`,
    [contentHash(text), excludeQuestionId ?? null],
  );
}

async function insertVersion(
  q: Queryable,
  questionId: string,
  version: number,
  input: QuestionInput,
  state: VersionState,
  actorId: string | null,
): Promise<string> {
  const [v] = await q.query<{ id: string }>(
    `insert into public.question_versions
       (question_id, version, state, text, explanation, category_id, country_scope, difficulty, age_rating,
        tags, language, sources, verified_at, sponsor_ref, content_hash, author_id)
     values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10::text[], $11, $12::jsonb, $13::date, $14, $15, $16)
     returning id`,
    [
      questionId,
      version,
      state,
      input.text,
      input.explanation,
      input.categoryId,
      pgArray(input.countryScope),
      input.difficulty,
      input.ageRating,
      pgArray(input.tags),
      input.language,
      pgJson(input.sources),
      input.verifiedAt,
      input.sponsorRef,
      contentHash(input.text),
      actorId,
    ],
  );
  let correctId = '';
  for (const label of OPTION_LABELS) {
    const [o] = await q.query<{ id: string }>(
      'insert into public.question_options(version_id, label, text) values ($1, $2, $3) returning id',
      [v.id, label, input.options[label]],
    );
    if (label === input.correct) correctId = o.id;
  }
  await q.query('insert into private.answer_keys(version_id, correct_option_id) values ($1, $2)', [v.id, correctId]);
  await q.query('insert into public.question_stats(version_id) values ($1) on conflict do nothing', [v.id]);
  return v.id;
}

export async function createQuestion(
  q: Queryable,
  input: QuestionInput,
  actorId: string | null,
  opts: { initialState?: 'draft' | 'review' | 'approved'; isFixture?: boolean } = {},
): Promise<{ questionId: string; versionId: string }> {
  await assertCategory(q, input.categoryId);
  const state = opts.initialState ?? 'draft';
  const [qq] = await q.query<{ id: string }>(
    `insert into public.questions(status, is_fixture, created_by) values ($1, $2, $3) returning id`,
    [state, opts.isFixture ?? false, actorId],
  );
  const versionId = await insertVersion(q, qq.id, 1, input, state, actorId);
  if (state === 'approved') {
    await q.query(
      `update public.question_versions set published_at = now(), reviewer_id = $2 where id = $1`,
      [versionId, actorId],
    );
  }
  await q.query(
    `update public.questions set latest_version_id = $2, live_version_id = case when $3 then $2::uuid else null end where id = $1`,
    [qq.id, versionId, state === 'approved'],
  );
  await audit(q, actorId, 'question.create', 'question', qq.id, { versionId, state, fixture: !!opts.isFixture });
  return { questionId: qq.id, versionId };
}

type QuestionRow = {
  id: string;
  status: QuestionStatus;
  live_version_id: string | null;
  latest_version_id: string;
};

async function lockQuestion(q: Queryable, id: string): Promise<QuestionRow & { latest_state: VersionState; latest_version: number }> {
  const [row] = await q.query<QuestionRow & { latest_state: VersionState; latest_version: number }>(
    `select q.id, q.status, q.live_version_id, q.latest_version_id, v.state as latest_state, v.version as latest_version
       from public.questions q join public.question_versions v on v.id = q.latest_version_id
      where q.id = $1 for update of q`,
    [id],
  );
  if (!row) throw notFound('Question');
  return row;
}

/**
 * Edit a question. Unpublished drafts are edited in place; editing the live
 * (approved) version creates a new draft version, so games, Daily Challenges,
 * friend challenges and recordings keep the version they used.
 */
export async function updateQuestion(q: Queryable, questionId: string, input: QuestionInput, actorId: string) {
  await assertCategory(q, input.categoryId);
  const row = await lockQuestion(q, questionId);
  if (row.status === 'archived') throw new AppError('conflict', 'Restore this question before editing it.');
  const editableInPlace = row.latest_state !== 'approved' && row.latest_state !== 'superseded';
  if (editableInPlace) {
    // A draft has never been served to players, so it can be replaced wholesale.
    await q.query('delete from private.answer_keys where version_id = $1', [row.latest_version_id]);
    await q.query('delete from public.question_options where version_id = $1', [row.latest_version_id]);
    await q.query('delete from public.question_stats where version_id = $1', [row.latest_version_id]);
    await q.query('delete from public.question_versions where id = $1', [row.latest_version_id]);
    const versionId = await insertVersion(q, questionId, row.latest_version, input, 'draft', actorId);
    await q.query(
      `update public.questions set latest_version_id = $2, updated_at = now(),
              status = case when live_version_id is null then 'draft' else status end
        where id = $1`,
      [questionId, versionId],
    );
    await audit(q, actorId, 'question.edit_draft', 'question', questionId, { versionId });
    return { versionId, newVersion: false };
  }
  const versionId = await insertVersion(q, questionId, row.latest_version + 1, input, 'draft', actorId);
  await q.query('update public.questions set latest_version_id = $2, updated_at = now() where id = $1', [questionId, versionId]);
  await audit(q, actorId, 'question.new_version', 'question', questionId, { versionId, version: row.latest_version + 1 });
  return { versionId, newVersion: true };
}

export async function submitForReview(q: Queryable, questionId: string, actorId: string) {
  const row = await lockQuestion(q, questionId);
  if (!['draft', 'rejected'].includes(row.latest_state)) throw new AppError('conflict', 'Only drafts can be submitted for review.');
  await q.query(`update public.question_versions set state = 'review', updated_at = now() where id = $1`, [row.latest_version_id]);
  await q.query(
    `update public.questions set status = case when live_version_id is null then 'review' else status end, updated_at = now() where id = $1`,
    [questionId],
  );
  await audit(q, actorId, 'question.submit', 'question', questionId, { versionId: row.latest_version_id });
}

export async function approveQuestion(q: Queryable, questionId: string, actorId: string, note?: string) {
  const row = await lockQuestion(q, questionId);
  if (row.status === 'archived') throw new AppError('conflict', 'Restore this question before approving it.');
  if (!['draft', 'review'].includes(row.latest_state)) throw new AppError('conflict', 'This version is already published.');
  if (row.live_version_id) {
    await q.query(`update public.question_versions set state = 'superseded', updated_at = now() where id = $1`, [row.live_version_id]);
  }
  await q.query(
    `update public.question_versions set state = 'approved', reviewer_id = $2, review_note = $3, published_at = now(), updated_at = now()
      where id = $1`,
    [row.latest_version_id, actorId, note ?? null],
  );
  await q.query(
    `update public.questions set status = 'approved', live_version_id = latest_version_id, updated_at = now() where id = $1`,
    [questionId],
  );
  await audit(q, actorId, 'question.approve', 'question', questionId, {
    versionId: row.latest_version_id,
    supersedes: row.live_version_id,
  });
}

export async function rejectQuestion(q: Queryable, questionId: string, actorId: string, note: string) {
  const row = await lockQuestion(q, questionId);
  if (row.latest_state !== 'review') throw new AppError('conflict', 'Only versions in review can be sent back.');
  await q.query(
    `update public.question_versions set state = 'rejected', reviewer_id = $2, review_note = $3, updated_at = now() where id = $1`,
    [row.latest_version_id, actorId, note],
  );
  await q.query(
    `update public.questions set status = case when live_version_id is null then 'draft' else status end, updated_at = now() where id = $1`,
    [questionId],
  );
  await audit(q, actorId, 'question.reject', 'question', questionId, { versionId: row.latest_version_id, note });
}

export async function archiveQuestion(q: Queryable, questionId: string, actorId: string, reason?: string) {
  const row = await lockQuestion(q, questionId);
  if (row.status === 'archived') return;
  await q.query(`update public.questions set status = 'archived', archived_at = now(), updated_at = now() where id = $1`, [questionId]);
  await audit(q, actorId, 'question.archive', 'question', questionId, { reason: reason ?? null });
}

export async function restoreQuestion(q: Queryable, questionId: string, actorId: string) {
  const row = await lockQuestion(q, questionId);
  if (row.status !== 'archived') return;
  await q.query(
    `update public.questions set status = case when live_version_id is not null then 'approved'
              when $2 = 'review' then 'review' else 'draft' end, archived_at = null, updated_at = now() where id = $1`,
    [questionId, row.latest_state],
  );
  await audit(q, actorId, 'question.restore', 'question', questionId);
}

export type QuestionDetail = {
  id: string;
  status: QuestionStatus;
  isFixture: boolean;
  liveVersionId: string | null;
  latestVersionId: string;
  versions: {
    id: string;
    version: number;
    state: VersionState;
    text: string;
    explanation: string;
    categoryId: string;
    countryScope: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    ageRating: 'all' | '13+' | '16+';
    tags: string[];
    language: string;
    sources: { title: string; url: string }[];
    verifiedAt: string | null;
    sponsorRef: string | null;
    authorName: string | null;
    reviewerName: string | null;
    reviewNote: string | null;
    createdAt: Date;
    publishedAt: Date | null;
    options: { id: string; label: string; text: string }[];
    correctLabel: string;
    stats: { attempts: number; correct: number; locked: boolean };
  }[];
};

/** Full editorial view (admin only — includes the answer key). */
export async function getQuestionDetail(q: Queryable, questionId: string): Promise<QuestionDetail | null> {
  const [qq] = await q.query<{ id: string; status: QuestionStatus; is_fixture: boolean; live_version_id: string | null; latest_version_id: string }>(
    'select id, status, is_fixture, live_version_id, latest_version_id from public.questions where id = $1',
    [questionId],
  );
  if (!qq) return null;
  const versions = await q.query<Record<string, unknown>>(
    `select v.*, to_char(v.verified_at, 'YYYY-MM-DD') as verified_str, a.display_name as author_name, r.display_name as reviewer_name,
            coalesce(s.unassisted_attempts, 0)::int as attempts, coalesce(s.unassisted_correct, 0)::int as correct_n,
            coalesce(s.difficulty_locked, false) as locked
       from public.question_versions v
       left join public.players a on a.id = v.author_id
       left join public.players r on r.id = v.reviewer_id
       left join public.question_stats s on s.version_id = v.id
      where v.question_id = $1 order by v.version desc`,
    [questionId],
  );
  const ids = versions.map((v) => v.id as string);
  const options = ids.length
    ? await q.query<{ id: string; version_id: string; label: string; text: string }>(
        'select id, version_id, label, text from public.question_options where version_id = any($1::uuid[]) order by label',
        [pgArray(ids)],
      )
    : [];
  const keys = ids.length
    ? await q.query<{ version_id: string; correct_option_id: string }>(
        'select version_id, correct_option_id from private.answer_keys where version_id = any($1::uuid[])',
        [pgArray(ids)],
      )
    : [];
  return {
    id: qq.id,
    status: qq.status,
    isFixture: qq.is_fixture,
    liveVersionId: qq.live_version_id,
    latestVersionId: qq.latest_version_id,
    versions: versions.map((v) => {
      const opts = options.filter((o) => o.version_id === v.id);
      const key = keys.find((k) => k.version_id === v.id);
      return {
        id: v.id as string,
        version: v.version as number,
        state: v.state as VersionState,
        text: v.text as string,
        explanation: v.explanation as string,
        categoryId: v.category_id as string,
        countryScope: (v.country_scope as string[]) ?? [],
        difficulty: v.difficulty as 'easy' | 'medium' | 'hard',
        ageRating: v.age_rating as 'all' | '13+' | '16+',
        tags: (v.tags as string[]) ?? [],
        language: v.language as string,
        sources: (v.sources as { title: string; url: string }[]) ?? [],
        verifiedAt: (v.verified_str as string | null) ?? null,
        sponsorRef: (v.sponsor_ref as string | null) ?? null,
        authorName: (v.author_name as string | null) ?? null,
        reviewerName: (v.reviewer_name as string | null) ?? null,
        reviewNote: (v.review_note as string | null) ?? null,
        createdAt: v.created_at as Date,
        publishedAt: (v.published_at as Date | null) ?? null,
        options: opts.map((o) => ({ id: o.id, label: o.label, text: o.text })),
        correctLabel: opts.find((o) => o.id === key?.correct_option_id)?.label ?? '?',
        stats: { attempts: v.attempts as number, correct: v.correct_n as number, locked: v.locked as boolean },
      };
    }),
  };
}

export function detailToInput(v: QuestionDetail['versions'][number]): QuestionInput {
  const byLabel = Object.fromEntries(v.options.map((o) => [o.label, o.text])) as Record<'A' | 'B' | 'C' | 'D', string>;
  return {
    text: v.text,
    options: { A: byLabel.A, B: byLabel.B, C: byLabel.C, D: byLabel.D },
    correct: v.correctLabel as 'A',
    explanation: v.explanation,
    categoryId: v.categoryId,
    countryScope: v.countryScope,
    difficulty: v.difficulty,
    ageRating: v.ageRating,
    tags: v.tags,
    language: v.language,
    sources: v.sources,
    verifiedAt: v.verifiedAt,
    sponsorRef: v.sponsorRef,
  };
}

export async function setDifficultyLock(q: Queryable, versionId: string, locked: boolean, actorId: string) {
  await q.query(
    `insert into public.question_stats(version_id, difficulty_locked) values ($1, $2)
     on conflict (version_id) do update set difficulty_locked = excluded.difficulty_locked, updated_at = now()`,
    [versionId, locked],
  );
  await audit(q, actorId, locked ? 'question.lock_difficulty' : 'question.unlock_difficulty', 'question_version', versionId);
}
