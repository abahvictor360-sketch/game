import Link from 'next/link';
import type { ReactNode } from 'react';

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel p-5 ${className}`}>{children}</section>;
}

/** Hexagonal bar (question/answer/heading shape). */
export function HexBar({ children, className = '', innerClassName = '', railed = false }: { children: ReactNode; className?: string; innerClassName?: string; railed?: boolean }) {
  return (
    <div className={`${railed ? 'railed' : ''} ${className}`}>
      <div className="hex">
        <div className={`hex-inner ${innerClassName}`}>{children}</div>
      </div>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 text-center">
      <HexBar railed className="mx-auto max-w-md" innerClassName="px-8 py-3">
        <h1 className="font-display text-xl font-black tracking-wide sm:text-2xl">{title}</h1>
      </HexBar>
      {subtitle ? <p className="mx-auto mt-3 max-w-prose text-sm text-blue-100/80">{subtitle}</p> : null}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel px-5 py-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-stage-700 text-gold-400" aria-hidden="true">
        ★
      </div>
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      {children ? <div className="mx-auto mt-2 max-w-prose text-sm text-blue-100/80">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="panel border-coral-400/60 px-5 py-8 text-center">
      <h2 className="font-display text-lg font-extrabold text-coral-400">{title}</h2>
      {children ? <div className="mx-auto mt-2 max-w-prose text-sm text-blue-100/85">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function Tabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label="Views" className="mx-auto mb-5 flex w-fit gap-1 rounded-full bg-stage-900/80 p-1 ring-1 ring-rail/40">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${t.active ? 'bg-gold-400 text-stage-950' : 'text-blue-100 hover:bg-stage-700'}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'gold' | 'green' | 'coral' | 'grey' }) {
  const tones = {
    blue: 'bg-stage-600/40 text-blue-100 ring-rail/50',
    gold: 'bg-gold-400/20 text-gold-300 ring-gold-400/50',
    green: 'bg-emerald-500/20 text-emerald-400 ring-emerald-400/50',
    coral: 'bg-coral-500/20 text-coral-400 ring-coral-400/50',
    grey: 'bg-white/10 text-blue-100/80 ring-white/20',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${tones[tone]}`}>{children}</span>;
}

export function ResultGrid({ grid, size = 'md' }: { grid: ('correct' | 'incorrect' | 'timeout' | null)[]; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'h-5 w-5' : 'h-8 w-8';
  return (
    <ol className="flex flex-wrap justify-center gap-1.5" aria-label="Answer results">
      {grid.map((g, i) => (
        <li
          key={i}
          className={`${s} rounded-md ring-1 ${g === 'correct' ? 'bg-emerald-500 ring-emerald-400' : g === 'incorrect' ? 'bg-coral-500 ring-coral-400' : g === 'timeout' ? 'bg-coral-700 ring-coral-400' : 'bg-white/10 ring-white/20'}`}
        >
          <span className="sr-only">
            Question {i + 1}: {g === 'correct' ? 'correct' : g === 'incorrect' ? 'incorrect' : g === 'timeout' ? 'time ran out' : 'not answered'}
          </span>
        </li>
      ))}
    </ol>
  );
}
