'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" role="alert" className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl font-black text-coral-400">Something went wrong</h1>
      <p className="mt-2 text-blue-100/85">Your progress is saved on our server. Please try again.</p>
      <div className="mt-6 flex gap-2">
        <button type="button" className="btn btn-gold" onClick={reset}>
          Try again
        </button>
        <a href="/" className="btn btn-ghost">
          Home
        </a>
      </div>
    </main>
  );
}
