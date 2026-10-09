import { BRAND } from '@/lib/shared/brand';

/**
 * Working logo and wordmark. Names and colours come from src/lib/shared/brand.ts;
 * replace the SVG below when the final logo is supplied; every screen uses it.
 */
export { BRAND };
const C = BRAND.colors;

export function BrandMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <radialGradient id="bm-bg" cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor={C.stage700} />
          <stop offset="1" stopColor={C.stage950} />
        </radialGradient>
        <linearGradient id="bm-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.gold300} />
          <stop offset="1" stopColor={C.gold600} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#bm-bg)" stroke="url(#bm-gold)" strokeWidth="3" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#8fb3ff" strokeOpacity=".5" strokeDasharray="2 4" />
      {/* Eight-point geometric star: an original motif */}
      <path d="M32 12l4.5 10.5L47 18l-4.5 10.5L53 32l-10.5 4.5L47 46l-10.5-4.5L32 52l-4.5-10.5L17 46l4.5-10.5L11 32l10.5-4.5L17 18l10.5 4.5z" fill="url(#bm-gold)" opacity=".95" />
      <text x="32" y="38.5" textAnchor="middle" fontSize="17" fontWeight="900" fill={C.stage950} fontFamily="system-ui, sans-serif">{BRAND.monogram}</text>
    </svg>
  );
}

export function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark size={34} />
      <span className="font-display text-lg font-black tracking-wide">
        {BRAND.wordmark[0]}
        <span className="text-gold-400">{BRAND.wordmark[1]}</span>
      </span>
    </span>
  );
}
