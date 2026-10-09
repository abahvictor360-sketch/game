import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageTitle, Panel, SignInRequired } from '@/components/ui';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { currentPlayer } from '@/lib/server/identity';
import { HelperClient } from './HelperClient';

export const metadata = { title: 'Help other players' };

export default async function HelpPage() {
  const db = await ensureReady();
  const cfg = await getActiveConfig(db);
  if (!cfg.flags.askAudience) notFound();
  const player = await currentPlayer();
  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Be the audience" subtitle="Keep this page open to help players who ask the audience. Your vote is anonymous." />
      {player?.kind !== 'account' ? (
        <Panel>
          <SignInRequired next="/help" title="Sign in to help other players" />
        </Panel>
      ) : !player.settings.helpOthers ? (
        <Panel className="text-center">
          <p>Turn on “Help other players” in your profile to receive questions.</p>
          <Link className="btn btn-gold mt-4" href="/profile">
            Open settings
          </Link>
        </Panel>
      ) : (
        <HelperClient />
      )}
    </div>
  );
}
