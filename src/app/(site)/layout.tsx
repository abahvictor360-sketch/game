import { MobileNav, SiteFooter, SiteHeader } from '@/components/site/SiteHeader';
import { currentPlayer } from '@/lib/server/identity';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const player = await currentPlayer();
  return (
    <>
      <SiteHeader player={player} />
      <main id="main" className="relative z-10 mx-auto max-w-5xl px-4 pb-8">
        {children}
      </main>
      <SiteFooter />
      <MobileNav />
    </>
  );
}
