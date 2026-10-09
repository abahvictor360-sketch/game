import { BRAND } from './brand';

/**
 * Building blocks for generated share images (next/og / Satori markup:
 * every container needs display:flex; no CSS classes).
 */
const C = BRAND.colors;

/** Kente-inspired woven stripe in the Fastora palette. */
export function KenteStripe({ height, width }: { height: number; width: number }) {
  const pattern = [C.gold400, C.stage950, C.correct, C.gold400, C.wrong, C.stage950, C.gold300, C.stage700];
  const block = Math.ceil(width / 24);
  return (
    <div style={{ display: 'flex', width, height, flexShrink: 0 }}>
      {Array.from({ length: 24 }, (_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', width: block, height }}>
          <div style={{ display: 'flex', flex: 1, background: pattern[i % pattern.length] }} />
          <div style={{ display: 'flex', height: Math.round(height * 0.22), background: i % 2 ? C.gold400 : C.stage950 }} />
          <div style={{ display: 'flex', flex: 1, background: pattern[(i + 3) % pattern.length] }} />
        </div>
      ))}
    </div>
  );
}

export function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', fontSize: size, fontWeight: 900, letterSpacing: size * 0.06 }}>
      <span style={{ marginRight: -size * 0.06 }}>{BRAND.wordmark[0]}</span>
      <span style={{ color: C.gold400, marginLeft: size * 0.02 }}>{BRAND.wordmark[1]}</span>
    </div>
  );
}

export type Cell = 'correct' | 'incorrect' | 'timeout' | null;

/** Result squares in rows (`perRow` per line). */
export function GridRows({ grid, cell, gap, perRow }: { grid: Cell[]; cell: number; gap: number; perRow: number }) {
  const rows: Cell[][] = [];
  for (let i = 0; i < grid.length; i += perRow) rows.push(grid.slice(i, i + perRow));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'flex', gap }}>
          {row.map((g, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                width: cell,
                height: cell,
                borderRadius: cell * 0.18,
                background: g === 'correct' ? C.correct : g ? C.wrong : 'rgba(255,255,255,0.2)',
                border: '3px solid rgba(255,255,255,0.35)',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export const STAGE_BG = `radial-gradient(ellipse at 50% 18%, ${C.stage500} 0%, ${C.stage700} 32%, ${C.stage950} 78%)`;

export function siteHost() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fastora.africa').replace(/^https?:\/\//, '').replace(/\/$/, '');
}
