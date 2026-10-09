import { NextResponse } from 'next/server';
import { api } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { joinQueue, leaveQueue, pollQueue } from '@/lib/server/game/matches';
import { requireAccount, requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

export const POST = api(async (req, db) => {
  const player = req.nextUrl.searchParams.get('leave') ? await requirePlayer() : await requireAccount(db);
  if (req.nextUrl.searchParams.get('leave')) {
    await leaveQueue(db, player.id);
    return NextResponse.json({ status: 'idle' });
  }
  await rateLimit(db, `queue:${player.id}`, 60, 60);
  const state = await db.tx((q) => joinQueue(q, player.id));
  return NextResponse.json(state);
});

export const GET = api(async (_req, db) => {
  const player = await requirePlayer();
  await rateLimit(db, `queue:${player.id}`, 120, 60);
  const state = await db.tx((q) => pollQueue(q, player.id));
  if (state.status === 'matched') void track('matchmaking_outcome', player.id, { outcome: 'matched' });
  return NextResponse.json(state);
});

export const DELETE = api(async (_req, db) => {
  const player = await requirePlayer();
  await leaveQueue(db, player.id);
  return NextResponse.json({ status: 'idle' });
});
