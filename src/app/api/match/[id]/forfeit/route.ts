import { NextResponse } from 'next/server';
import { api } from '@/lib/server/api';
import { forfeitMatch } from '@/lib/server/game/matches';
import { requirePlayer } from '@/lib/server/identity';

export const POST = api<{ params: Promise<{ id: string }> }>(async (_req, db, ctx) => {
  const { id } = await ctx.params;
  const player = await requirePlayer();
  await db.tx((q) => forfeitMatch(q, player.id, id));
  return NextResponse.json({ ok: true });
});
