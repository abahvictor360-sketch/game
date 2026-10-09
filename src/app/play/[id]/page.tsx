import { notFound, redirect } from 'next/navigation';
import { GameClient } from '@/components/game/GameClient';
import { ensureReady } from '@/lib/server/bootstrap';
import { AppError } from '@/lib/server/errors';
import { getSessionView } from '@/lib/server/game/sessions';
import { currentPlayer } from '@/lib/server/identity';

export const metadata = { title: 'Playing', robots: { index: false } };

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await currentPlayer();
  if (player?.kind !== 'account') redirect(`/auth/signin?next=${encodeURIComponent(`/play/${id}`)}`);
  const db = await ensureReady();
  let view;
  try {
    view = await db.tx((q) => getSessionView(q, player.id, id));
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_found') notFound();
    throw e;
  }
  if (view.status !== 'active') redirect(`/results/${id}`);
  return <GameClient initial={view} />;
}
