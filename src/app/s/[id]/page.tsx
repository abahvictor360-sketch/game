import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { BrandWordmark } from '@/components/Brand';
import { HexBar, ResultGrid } from '@/components/ui';
import { ensureReady } from '@/lib/server/bootstrap';
import { getResultSummary } from '@/lib/server/game/results';

// Public share page: score and grid only — never questions or answers.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const db = await ensureReady();
  const r = await getResultSummary(db, id);
  if (!r) return { title: 'Result not found' };
  const title = `${r.playerName} scored ${r.score} on Fastora`;
  return {
    title,
    description: `${r.correctCount}/${r.totalQuestions} correct. How well do you know Africa? Play free.`,
    openGraph: { title, description: 'How well do you know Africa? Play free.' },
    twitter: { card: 'summary_large_image', title },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await ensureReady();
  const r = await getResultSummary(db, id);
  if (!r) notFound();
  return (
    <main id="main" className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <BrandWordmark />
      <HexBar railed className="mt-8 w-full" innerClassName="px-8 py-3">
        <p className="font-display text-lg font-black">{r.mode === 'daily' ? `Daily Challenge · ${r.challengeDate}` : 'Fastora Classic'}</p>
      </HexBar>
      <div className="mt-6 flex items-center gap-3">
        <Avatar name={r.avatarKey} size={44} />
        <p className="text-lg font-bold">{r.playerName}</p>
      </div>
      <p className="font-display mt-4 text-6xl font-black text-gold-400">{r.score}</p>
      <p className="text-blue-100/85">
        {r.correctCount}/{r.totalQuestions} correct · {r.accuracy}%
      </p>
      <div className="mt-5">
        <ResultGrid grid={r.grid} />
      </div>
      <p className="mt-8 font-semibold">How well do you know Africa?</p>
      <Link href={r.mode === 'daily' ? '/daily' : '/play/classic'} className="btn btn-gold mt-3 min-h-14 px-10 text-lg">
        Play now — it’s free
      </Link>
    </main>
  );
}
