import { notFound } from 'next/navigation';
import { PageTitle, Panel, SignInRequired } from '@/components/ui';
import { currentAccount } from '@/lib/server/identity';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { VersusLobby } from './VersusLobby';

export const metadata = { title: 'Versus' };

export default async function VersusPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const db = await ensureReady();
  const { flags, rules } = await getActiveConfig(db);
  if (!flags.multiplayer && !flags.ghostOpponents) notFound();
  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Versus" subtitle="Same 15 questions, same clock. Correct answers earn a speed bonus. No lifelines." />
      {!(await currentAccount()) ? (
        <Panel>
          <SignInRequired next="/versus" />
        </Panel>
      ) : (
      <VersusLobby live={flags.multiplayer} ghosts={flags.ghostOpponents} fallbackMs={rules.versus.matchmakingFallbackMs} initialError={error ?? null} />
      )}
    </div>
  );
}
