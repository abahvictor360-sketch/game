import { NextResponse } from 'next/server';
import { api } from '@/lib/server/api';
import { getSessionView } from '@/lib/server/game/sessions';
import { requirePlayer } from '@/lib/server/identity';

export const GET = api<{ params: Promise<{ id: string }> }>(async (_req, db, ctx) => {
  const { id } = await ctx.params;
  const player = await requirePlayer();
  const view = await db.tx((q) => getSessionView(q, player.id, id));
  return NextResponse.json(view);
});
