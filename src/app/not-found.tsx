import Link from 'next/link';
import { BrandWordmark } from '@/components/Brand';

export default function NotFound() {
  return (
    <main id="main" className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <BrandWordmark />
      <h1 className="font-display mt-8 text-2xl font-black">We couldn’t find that page</h1>
      <p className="mt-2 text-blue-100/85">It may have moved, expired, or never existed.</p>
      <Link href="/" className="btn btn-gold mt-6">
        Back to home
      </Link>
    </main>
  );
}
