import { MobileNav, SiteFooter, SiteHeader } from '@/components/site/SiteHeader';
import { ensureReady } from '@/lib/server/bootstrap';
import { getActiveConfig } from '@/lib/server/config';
import { currentPlayer } from '@/lib/server/identity';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [player, cfg] = await Promise.all([currentPlayer(), ensureReady().then(getActiveConfig)]);
  const versus = cfg.flags.multiplayer || cfg.flags.ghostOpponents;
  return (
    <>
      <SiteHeader player={player} versus={versus} />
      <main id="main" className="relative z-10 mx-auto max-w-5xl px-4 pb-8">
        {children}
      </main>
      <SiteFooter helpers={cfg.flags.askAudience} />
      <MobileNav />
    </>
  );
}
