import { NextResponse } from 'next/server';
import { api } from '@/lib/server/api';
import { getActiveConfig } from '@/lib/server/config';
import { AppError } from '@/lib/server/errors';
import { helperHeartbeat } from '@/lib/server/game/phase2';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

export const POST = api(async (_req, db) => {
  const cfg = await getActiveConfig(db);
  if (!cfg.flags.askAudience) throw new AppError('feature_disabled', 'Not available.');
  const player = await requirePlayer();
  if (!player.settings.helpOthers) return NextResponse.json({ invitation: null, optedIn: false });
  await rateLimit(db, `helper:${player.id}`, 60, 60);
  return NextResponse.json({ ...(await db.tx((q) => helperHeartbeat(q, player.id))), optedIn: true });
});
