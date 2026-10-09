import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, body } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { currentPlayer } from '@/lib/server/identity';

const Schema = z.object({ sessionId: z.string().uuid(), channel: z.enum(['native', 'whatsapp', 'copy', 'image', 'image_share']) });

export const POST = api(async (req) => {
  const input = await body(req, Schema);
  const player = await currentPlayer();
  void track('result_shared', player?.id ?? 'anonymous', { channel: input.channel });
  return NextResponse.json({ ok: true });
});
