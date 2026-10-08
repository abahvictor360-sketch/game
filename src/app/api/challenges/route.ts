import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, body } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { createFriendChallenge } from '@/lib/server/game/phase2';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

const Schema = z.object({ sessionId: z.string().uuid() });

export const POST = api(async (req, db) => {
  const player = await requirePlayer();
  const { sessionId } = await body(req, Schema);
  await rateLimit(db, `challenge:${player.id}`, 20, 3600);
  const { token, expiresAt } = await db.tx((q) => createFriendChallenge(q, player.id, sessionId));
  void track('friend_challenge_created', player.id);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return NextResponse.json({ url: `${origin}/challenge/${token}`, expiresAt: expiresAt.toISOString() });
});
