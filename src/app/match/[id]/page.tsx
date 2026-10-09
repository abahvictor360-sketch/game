import { notFound, redirect } from 'next/navigation';
import { MatchClient } from '@/components/game/MatchClient';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { AppError } from '@/lib/server/errors';
import { getMatchView } from '@/lib/server/game/matches';
import { currentPlayer } from '@/lib/server/identity';

export const metadata = { title: 'Live match', robots: { index: false } };

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await currentPlayer();
  if (!player) redirect('/versus');
  const db = await ensureReady();
  if (!(await getActiveConfig(db)).flags.multiplayer) notFound();
  try {
    const view = await db.tx((q) => getMatchView(q, player.id, id));
    return <MatchClient initial={view} supabase={process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY } : null} />;
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_found') notFound();
    throw e;
  }
}
