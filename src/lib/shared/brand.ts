/**
 * Brand identity in one place. Replace these values (and the matching colour
 * tokens at the top of src/app/globals.css) when final branding is supplied.
 *
 * `colors` mirrors the CSS tokens for places that cannot read CSS variables:
 * generated images (Open Graph cards, app icons), the PWA manifest and the
 * browser theme colour.
 */
export const BRAND = {
  name: 'Fastora',
  fullName: 'Fastora African Quiz Game',
  tagline: 'How well do you know Africa?',
  /** Wordmark split into a plain and a highlighted (gold) part. */
  wordmark: ['FAST', 'ORA'] as const,
  /** Initial shown inside the logo mark. */
  monogram: 'F',
  colors: {
    stage950: '#04103a',
    stage900: '#0a1d5e',
    stage800: '#0d3a92',
    stage700: '#1253b8',
    stage600: '#1a6ad9',
    stage500: '#3d8bf2',
    rail: '#e6edff',
    bar: '#1e1b38',
    gold300: '#ffe08a',
    gold400: '#fcc81a',
    gold600: '#c98d00',
    correct: '#12b76a',
    wrong: '#f2603f',
  },
} as const;

/** WhatsApp's own brand green, used only on the "Share on WhatsApp" button. */
export const WHATSAPP_GREEN = '#1f9d55';
