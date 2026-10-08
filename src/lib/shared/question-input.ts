import { z } from 'zod';
import { REGION_SCOPES } from './categories';

export const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;
export type OptionLabel = (typeof OPTION_LABELS)[number];

const scope = z
  .string()
  .trim()
  .toUpperCase()
  .refine((s) => /^[A-Z]{2}$/.test(s) || (REGION_SCOPES as readonly string[]).includes(s), {
    message: 'Use an ISO country code (e.g. NG) or a region (AFRICA, WEST, EAST, …)',
  });

export const SourceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'Source URL must start with http(s)://'),
});

/** Editorial input for a question version (admin form + CSV import). */
export const QuestionInputSchema = z
  .object({
    text: z.string().trim().min(10, 'Question text is too short').max(400),
    options: z.object({
      A: z.string().trim().min(1).max(160),
      B: z.string().trim().min(1).max(160),
      C: z.string().trim().min(1).max(160),
      D: z.string().trim().min(1).max(160),
    }),
    correct: z.enum(OPTION_LABELS),
    explanation: z.string().trim().min(10, 'Explanation is too short').max(800),
    categoryId: z.string().trim().min(1),
    countryScope: z.array(scope).max(20).default([]),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    ageRating: z.enum(['all', '13+', '16+']).default('all'),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
    language: z.string().trim().min(2).max(10).default('en'),
    sources: z.array(SourceSchema).max(10).default([]),
    verifiedAt: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .nullable()
      .default(null),
    sponsorRef: z.string().trim().max(100).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    const seen = new Map<string, string>();
    for (const l of OPTION_LABELS) {
      const key = v.options[l].toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['options', l], message: `Option ${l} duplicates option ${seen.get(key)}` });
      }
      seen.set(key, l);
    }
  });

export type QuestionInput = z.infer<typeof QuestionInputSchema>;

/** Normalised text used for duplicate detection. */
export function normaliseForHash(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
