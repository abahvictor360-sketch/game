import Link from 'next/link';
import { Avatar } from '../Avatar';
import { BrandWordmark } from '../Brand';
import type { Player } from '@/lib/server/players';
import { BRAND } from '@/lib/shared/brand';

export function SiteHeader({ player, versus = false }: { player: Player | null; versus?: boolean }) {
  return (
    <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
      <Link href="/" aria-label={`${BRAND.name} home`} className="rounded-lg">
        <BrandWordmark />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1 text-sm font-bold">
        <Link href="/daily" className="hidden min-h-11 items-center rounded-full px-3 hover:bg-white/10 sm:inline-flex">
          Daily
        </Link>
        {versus ? (
          <Link href="/versus" className="hidden min-h-11 items-center rounded-full px-3 hover:bg-white/10 sm:inline-flex">
            Versus
          </Link>
        ) : null}
        <Link href="/leaderboard" className="hidden min-h-11 items-center rounded-full px-3 hover:bg-white/10 sm:inline-flex">
          Leaderboards
        </Link>
        <Link href="/how-to-play" className="hidden min-h-11 items-center rounded-full px-3 hover:bg-white/10 md:inline-flex">
          How to play
        </Link>
        {player?.role ? (
          <Link href="/admin" className="hidden min-h-11 items-center rounded-full px-3 text-gold-300 hover:bg-white/10 md:inline-flex">
            Admin
          </Link>
        ) : null}
        {player && player.kind === 'account' ? (
          <Link href="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full pl-1 pr-3 hover:bg-white/10" aria-label={`Your profile, ${player.displayName}`}>
            <Avatar name={player.avatarKey} size={32} />
            <span className="hidden max-w-28 truncate sm:inline">{player.displayName}</span>
          </Link>
        ) : (
          <Link href="/auth/signin" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

export function MobileNav() {
  const items = [
    ['/', 'Home', 'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z'],
    ['/daily', 'Daily', 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z'],
    ['/leaderboard', 'Ranks', 'M8 21V11M16 21V7M12 21V3M4 21h16'],
    ['/profile', 'Me', 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0'],
  ] as const;
  return (
    <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-20 bg-stage-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="glyph-band-sm h-[14px] bg-[length:66px_14px]" aria-hidden="true" />
      <ul className="mx-auto flex max-w-md justify-around">
        {items.map(([href, label, d]) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-blue-100">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={d} />
              </svg>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter({ helpers = false }: { helpers?: boolean }) {
  return (
    <footer className="relative z-10 mx-auto max-w-5xl px-4 pb-24 pt-10 text-center text-xs text-blue-100/60 sm:pb-8">
      <p>{BRAND.fullName} · Made with care for players across Africa and the diaspora.</p>
      <p className="mt-1">
        <a href="/how-to-play" className="inline-flex min-h-11 items-center px-1 underline">How to play</a>
        {helpers ? (
          <>
            {' '}· <a href="/help" className="inline-flex min-h-11 items-center px-1 underline">Be the audience</a>
          </>
        ) : null}{' '}
        · <a href="/privacy" className="inline-flex min-h-11 items-center px-1 underline">Privacy</a>
      </p>
    </footer>
  );
}
