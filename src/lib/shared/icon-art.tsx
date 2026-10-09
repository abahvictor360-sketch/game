import { BRAND } from './brand';

/** App icon artwork rendered by next/og (Satori-compatible markup). */
export function IconArt({ size, padded = false }: { size: number; padded?: boolean }) {
  const inner = padded ? size * 0.72 : size * 0.9;
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 30%, ${BRAND.colors.stage600}, ${BRAND.colors.stage950} 75%)` }}>
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: inner,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `radial-gradient(circle at 50% 35%, ${BRAND.colors.stage700}, ${BRAND.colors.stage900})`,
          border: `${Math.max(2, inner * 0.05)}px solid ${BRAND.colors.gold400}`,
          color: BRAND.colors.gold400,
          fontSize: inner * 0.58,
          fontWeight: 900,
          fontFamily: 'sans-serif',
        }}
      >
        {BRAND.monogram}
      </div>
    </div>
  );
}
