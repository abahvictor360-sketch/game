import { BrandWordmark } from '@/components/Brand';
import { BRAND } from '@/lib/shared/brand';

export const dynamic = 'force-static';
export const metadata = { title: 'Offline' };

export default function Offline() {
  return (
    <main id="main" className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <BrandWordmark />
      <h1 className="font-display mt-8 text-2xl font-black">You’re offline</h1>
      <p className="mt-2 text-blue-100/85">{BRAND.name} needs a connection to play, because answers and timers are checked on our servers. Any game in progress is saved. Reconnect to continue.</p>
      <a href="/" className="btn btn-gold mt-6">
        Try again
      </a>
    </main>
  );
}
