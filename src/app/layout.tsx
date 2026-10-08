import type { Metadata, Viewport } from 'next';
import { BRAND } from '@/components/Brand';
import { PwaRegister } from '@/components/site/PwaRegister';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: BRAND.fullName, template: `%s · ${BRAND.name}` },
  description: 'A fast, fun quiz about Africa’s history, places, cultures, languages, arts, sport and ideas. Play Classic, take the Daily Challenge and challenge your friends.',
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: 'black-translucent' },
  openGraph: { siteName: BRAND.fullName, type: 'website' },
};

export const viewport: Viewport = {
  themeColor: '#0d3a92',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="stage-beams" aria-hidden="true" />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-gold-400 focus:px-4 focus:py-2 focus:font-bold focus:text-stage-950">
          Skip to content
        </a>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
