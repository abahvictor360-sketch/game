import { ImageResponse } from 'next/og';
import QRCode from 'qrcode';
import { type NextRequest } from 'next/server';
import { ensureReady } from '@/lib/server/bootstrap';
import { getResultSummary } from '@/lib/server/game/results';
import { BRAND } from '@/lib/shared/brand';
import { GridRows, KenteStripe, siteHost, STAGE_BG, Wordmark } from '@/lib/shared/share-art';

const W = 1080;
const H = 1920;
const C = BRAND.colors;

/**
 * Tall story image (1080x1920) for TikTok, Instagram and WhatsApp Status,
 * where links aren't clickable: a QR code opens the public result page.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await ensureReady();
  const r = await getResultSummary(db, id);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const target = r ? `${base.replace(/\/$/, '')}/s/${id}` : base;
  const qr = await QRCode.toDataURL(target, { margin: 1, width: 420, errorCorrectionLevel: 'M', color: { dark: C.stage950, light: '#ffffff' } });
  const label = r ? (r.mode === 'daily' ? `Daily Challenge · ${r.challengeDate}` : r.mode === 'classic' ? 'Classic' : 'African Quiz Game') : 'African Quiz Game';
  const image = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white', background: STAGE_BG, fontFamily: 'sans-serif' }}>
        <KenteStripe width={W} height={44} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'space-around', width: '100%', padding: '0 80px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Wordmark size={84} />
            <div style={{ display: 'flex', fontSize: 34, color: C.gold300, letterSpacing: 6, marginTop: 6 }}>AFRICAN QUIZ GAME</div>
          </div>
          {r ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', padding: '12px 40px', border: `4px solid ${C.rail}`, borderRadius: 60, background: C.bar, fontSize: 38, fontWeight: 800 }}>{label}</div>
              <div style={{ display: 'flex', fontSize: 44, marginTop: 40, color: '#dce6ff' }}>I scored</div>
              <div style={{ display: 'flex', fontSize: 300, fontWeight: 900, lineHeight: 1, color: C.gold400 }}>{r.score}</div>
              <div style={{ display: 'flex', fontSize: 46, marginTop: 10 }}>
                {r.correctCount}/{r.totalQuestions} correct · {r.accuracy}% accuracy
              </div>
              <div style={{ display: 'flex', marginTop: 50 }}>
                <GridRows grid={r.grid} cell={120} gap={18} perRow={5} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 900, textAlign: 'center' }}>{BRAND.tagline}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 40, background: '#ffffff', color: C.stage950, borderRadius: 36, padding: 28 }}>
            <img src={qr} width={260} height={260} alt="" />
            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 480 }}>
              <div style={{ display: 'flex', fontSize: 50, fontWeight: 900 }}>Can you beat me?</div>
              <div style={{ display: 'flex', fontSize: 34, marginTop: 10 }}>Scan to play {BRAND.name}</div>
              <div style={{ display: 'flex', fontSize: 28, marginTop: 14, color: C.stage700, fontWeight: 700 }}>{siteHost()}</div>
            </div>
          </div>
        </div>
        <KenteStripe width={W} height={44} />
      </div>
    ),
    { width: W, height: H },
  );
  image.headers.set('Content-Disposition', `inline; filename="${BRAND.name.toLowerCase()}-story.png"`);
  image.headers.set('Cache-Control', 'public, max-age=300');
  return image;
}
