import 'server-only';
import Papa from 'papaparse';
import { QuestionInputSchema, normaliseForHash, type QuestionInput } from '@/lib/shared/question-input';
import { contentHash } from './content';
import { pgArray, type Queryable } from './db';

export const CSV_COLUMNS = [
  'question',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct',
  'explanation',
  'category',
  'difficulty',
  'country_scope',
  'age_rating',
  'tags',
  'language',
  'sources',
  'verified_at',
  'sponsor_ref',
] as const;

export const MAX_ROWS = 2000;
export const MAX_BYTES = 2 * 1024 * 1024;

export function csvTemplate(): string {
  const example = [
    'Which river flows through both Niger and Nigeria before reaching the Atlantic?',
    'The Niger',
    'The Congo',
    'The Orange',
    'The Limpopo',
    'A',
    'The Niger River rises in Guinea and flows through Mali, Niger and Nigeria to the Gulf of Guinea.',
    'geography',
    'medium',
    'NG;NE;ML',
    'all',
    'rivers;west-africa',
    'en',
    'Encyclopaedia entry|https://example.org/niger-river',
    '2026-01-15',
    '',
  ];
  return Papa.unparse({ fields: [...CSV_COLUMNS], data: [example] });
}

export type ImportRow = {
  line: number;
  input: QuestionInput | null;
  errors: string[];
  duplicateOf: string | null;
  text: string;
};

const split = (v: string | undefined) =>
  (v ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

function parseSources(v: string | undefined) {
  return split(v).map((s) => {
    const [a, b] = s.split('|').map((x) => x.trim());
    return b ? { title: a, url: b } : { title: a, url: a };
  });
}

/** Parse and validate a CSV upload. Nothing is written. */
export async function validateCsv(q: Queryable, text: string): Promise<{ rows: ImportRow[]; fatal: string | null }> {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) return { rows: [], fatal: 'The file is larger than 2 MB. Split it into smaller files.' };
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim().toLowerCase() });
  const missing = CSV_COLUMNS.filter((c) => !['country_scope', 'age_rating', 'tags', 'language', 'sources', 'verified_at', 'sponsor_ref'].includes(c) && !parsed.meta.fields?.includes(c));
  if (missing.length) return { rows: [], fatal: `Missing required columns: ${missing.join(', ')}. Download the template for the expected format.` };
  if (parsed.data.length === 0) return { rows: [], fatal: 'The file has no question rows.' };
  if (parsed.data.length > MAX_ROWS) return { rows: [], fatal: `Too many rows (${parsed.data.length}). The limit is ${MAX_ROWS} per file.` };
  const categories = new Set((await q.query<{ id: string }>('select id from public.categories')).map((r) => r.id));
  const seenInFile = new Map<string, number>();
  const rows: ImportRow[] = [];
  for (const [i, raw] of parsed.data.entries()) {
    const line = i + 2; // header is line 1
    const errors: string[] = [];
    const candidate = {
      text: raw.question ?? '',
      options: { A: raw.option_a ?? '', B: raw.option_b ?? '', C: raw.option_c ?? '', D: raw.option_d ?? '' },
      correct: (raw.correct ?? '').trim().toUpperCase(),
      explanation: raw.explanation ?? '',
      categoryId: (raw.category ?? '').trim().toLowerCase(),
      countryScope: split(raw.country_scope),
      difficulty: (raw.difficulty ?? '').trim().toLowerCase(),
      ageRating: (raw.age_rating ?? '').trim() || 'all',
      tags: split(raw.tags),
      language: (raw.language ?? '').trim() || 'en',
      sources: parseSources(raw.sources),
      verifiedAt: (raw.verified_at ?? '').trim() || null,
      sponsorRef: (raw.sponsor_ref ?? '').trim() || null,
    };
    const res = QuestionInputSchema.safeParse(candidate);
    if (!res.success) {
      for (const issue of res.error.issues) errors.push(`${fieldName(issue.path)}: ${issue.message}`);
    }
    if (candidate.categoryId && !categories.has(candidate.categoryId)) errors.push(`category: unknown category "${candidate.categoryId}"`);
    const norm = normaliseForHash(candidate.text);
    if (norm) {
      const prev = seenInFile.get(norm);
      if (prev) errors.push(`question: duplicates line ${prev} in this file`);
      else seenInFile.set(norm, line);
    }
    rows.push({ line, input: res.success && errors.length === 0 ? res.data : null, errors, duplicateOf: null, text: candidate.text.slice(0, 140) });
  }
  // Duplicates against the existing bank (exact normalised match).
  const hashes = rows.filter((r) => r.text).map((r) => contentHash(parsed.data[r.line - 2].question ?? ''));
  if (hashes.length) {
    const existing = await q.query<{ content_hash: string; question_id: string }>(
      'select distinct on (content_hash) content_hash, question_id from public.question_versions where content_hash = any($1::text[])',
      [pgArray(hashes)],
    );
    const byHash = new Map(existing.map((e) => [e.content_hash, e.question_id]));
    for (const r of rows) {
      const h = contentHash(parsed.data[r.line - 2].question ?? '');
      const dup = byHash.get(h);
      if (dup) {
        r.duplicateOf = dup;
        r.errors.push('question: already exists in the question bank');
        r.input = null;
      }
    }
  }
  return { rows, fatal: null };
}

function fieldName(path: (string | number)[]) {
  const map: Record<string, string> = { text: 'question', categoryId: 'category', countryScope: 'country_scope', ageRating: 'age_rating', verifiedAt: 'verified_at', sponsorRef: 'sponsor_ref' };
  if (path[0] === 'options') return `option_${String(path[1]).toLowerCase()}`;
  if (path[0] === 'sources') return 'sources';
  return map[String(path[0])] ?? String(path[0]);
}
