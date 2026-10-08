import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, body } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { AppError } from '@/lib/server/errors';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

const Schema = z.object({
  issuedId: z.string().uuid(),
  reason: z.enum(['incorrect', 'outdated', 'offensive', 'unclear', 'typo', 'other']),
  details: z.string().max(1000).nullable(),
});

/** Players can report only questions that were issued to them. */
export const POST = api(async (req, db) => {
  const player = await requirePlayer();
  const input = await body(req, Schema);
  await rateLimit(db, `report:${player.id}`, 10, 3600);
  const [iq] = await db.query<{ version_id: string; question_id: string }>(
    `select iq.version_id, v.question_id from public.issued_questions iq
       join public.game_sessions s on s.id = iq.session_id join public.question_versions v on v.id = iq.version_id
      where iq.id = $1 and s.player_id = $2`,
    [input.issuedId, player.id],
  );
  if (!iq) throw new AppError('not_found', 'Question not found.');
  await db.query(
    `insert into public.question_reports(question_id, version_id, player_id, reason, details) values ($1, $2, $3, $4, $5)`,
    [iq.question_id, iq.version_id, player.id, input.reason, input.details?.trim() || null],
  );
  void track('question_reported', player.id, { reason: input.reason });
  return NextResponse.json({ ok: true });
});
