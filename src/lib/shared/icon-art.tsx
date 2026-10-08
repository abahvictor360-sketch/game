/** App icon artwork rendered by next/og (Satori-compatible markup). */
export function IconArt({ size, padded = false }: { size: number; padded?: boolean }) {
  const inner = padded ? size * 0.72 : size * 0.9;
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 30%, #1a6ad9, #04103a 75%)' }}>
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: inner,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 35%, #1253b8, #0a1d5e)',
          border: `${Math.max(2, inner * 0.05)}px solid #fcc81a`,
          color: '#fcc81a',
          fontSize: inner * 0.58,
          fontWeight: 900,
          fontFamily: 'sans-serif',
        }}
      >
        F
      </div>
    </div>
  );
}
