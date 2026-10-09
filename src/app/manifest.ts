import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/shared/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.fullName,
    short_name: BRAND.name,
    description: 'How well do you know Africa? A fast, fun quiz with a Daily Challenge.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BRAND.colors.stage950,
    theme_color: BRAND.colors.stage800,
    categories: ['games', 'education', 'trivia'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
