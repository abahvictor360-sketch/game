import { ImageResponse } from 'next/og';
import { ensureReady } from '@/lib/server/bootstrap';
import { getResultSummary } from '@/lib/server/game/results';
import { BRAND } from '@/lib/shared/brand';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${BRAND.name} quiz result`;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await ensureReady();
  const r = await getResultSummary(db, id);
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'fastora.africa').replace(/^https?:\/\//, '');
  const grid = r?.grid ?? [];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          background: `radial-gradient(ellipse at 50% 15%, ${BRAND.colors.stage500} 0%, ${BRAND.colors.stage700} 35%, ${BRAND.colors.stage950} 80%)`,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, letterSpacing: 4 }}>
          {BRAND.wordmark[0]}<span style={{ color: BRAND.colors.gold400 }}>{BRAND.wordmark[1]}</span>
        </div>
        <div style={{ display: 'flex', marginTop: 16, padding: '10px 40px', border: `3px solid ${BRAND.colors.rail}`, borderRadius: 40, background: BRAND.colors.bar, fontSize: 30, fontWeight: 800 }}>
          {r ? (r.mode === 'daily' ? `Daily Challenge · ${r.challengeDate}` : 'Classic') : 'African Quiz Game'}
        </div>
        {r ? (
          <>
            <div style={{ display: 'flex', fontSize: 150, fontWeight: 900, color: BRAND.colors.gold400, marginTop: 10 }}>{r.score}</div>
            <div style={{ display: 'flex', fontSize: 34 }}>
              {r.correctCount}/{r.totalQuestions} correct · {r.accuracy}% accuracy
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              {grid.map((g, i) => (
                <div key={i} style={{ width: 44, height: 44, borderRadius: 8, background: g === 'correct' ? BRAND.colors.correct : g ? BRAND.colors.wrong : '#ffffff33' }} />
              ))}
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', marginTop: 34, fontSize: 30, fontWeight: 700 }}>How well do you know Africa? Play at {site}</div>
      </div>
    ),
    size,
  );
}
