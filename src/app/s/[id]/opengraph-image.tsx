import { ImageResponse } from 'next/og';
import { ensureReady } from '@/lib/server/bootstrap';
import { getResultSummary } from '@/lib/server/game/results';
import { BRAND } from '@/lib/shared/brand';
import { GridRows, KenteStripe, siteHost, STAGE_BG, Wordmark } from '@/lib/shared/share-art';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${BRAND.name} quiz result`;

/** Landscape card: link previews (WhatsApp, X, Facebook) and the "Download image" button. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await ensureReady();
  const r = await getResultSummary(db, id);
  const label = r ? (r.mode === 'daily' ? `Daily Challenge · ${r.challengeDate}` : r.mode === 'classic' ? 'Classic' : 'African Quiz Game') : 'African Quiz Game';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', color: 'white', background: STAGE_BG, fontFamily: 'sans-serif' }}>
        <KenteStripe width={1200} height={22} />
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: '0 80px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Wordmark size={44} />
            <div style={{ display: 'flex', marginTop: 18, padding: '8px 28px', border: `3px solid ${BRAND.colors.rail}`, borderRadius: 40, background: BRAND.colors.bar, fontSize: 26, fontWeight: 800, alignSelf: 'flex-start' }}>
              {label}
            </div>
            {r ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 170, fontWeight: 900, color: BRAND.colors.gold400, lineHeight: 1, marginTop: 18 }}>{r.score}</div>
                <div style={{ display: 'flex', fontSize: 32, marginTop: 8 }}>
                  {r.correctCount}/{r.totalQuestions} correct · {r.accuracy}% accuracy
                </div>
              </div>
            ) : null}
          </div>
          {r ? <GridRows grid={r.grid} cell={62} gap={12} perRow={5} /> : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 26, fontSize: 28, fontWeight: 700 }}>
          {BRAND.tagline} Play at {siteHost()}
        </div>
        <KenteStripe width={1200} height={22} />
      </div>
    ),
    size,
  );
}
