import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-ivory-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

export function H1({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-black text-ink-900">{children}</h1>
      {actions}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-ivory-200 text-ink-700',
  review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-gray-200 text-gray-600',
  superseded: 'bg-gray-100 text-gray-500',
  rejected: 'bg-red-100 text-red-800',
  open: 'bg-amber-100 text-amber-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  dismissed: 'bg-gray-200 text-gray-600',
};

export function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${STATUS_TONE[value] ?? 'bg-ivory-200'}`}>{value}</span>;
}

export const adminBtn = 'inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold transition disabled:opacity-50';
export const btnPrimary = `${adminBtn} bg-stage-700 text-white hover:bg-stage-600`;
export const btnGold = `${adminBtn} bg-gold-400 text-ink-900 hover:bg-gold-300`;
export const btnQuiet = `${adminBtn} border border-ink-500/30 text-ink-700 hover:bg-ivory-100`;
export const btnDanger = `${adminBtn} bg-coral-700 text-white hover:bg-coral-500`;
