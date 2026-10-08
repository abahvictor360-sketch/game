import 'server-only';
import { notFound } from 'next/navigation';
import { currentPlayer } from './identity';
import { canEditContent, isAdmin, type Player } from './players';

/**
 * Staff authorisation, always checked on the server against staff_roles.
 * Non-staff get a 404 so the admin area is not discoverable.
 */
export async function requireStaff(level: 'editor' | 'admin' = 'editor'): Promise<Player> {
  const p = await currentPlayer();
  if (level === 'admin' ? !isAdmin(p) : !canEditContent(p)) notFound();
  return p!;
}
