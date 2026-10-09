'use client';
import { useEffect, useRef, useState } from 'react';
import { BRAND } from '@/lib/shared/brand';

/** Registers the service worker and offers a reload when an update is ready. */
export function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const updateRequested = useRef(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    });
    // Reload only after the player chose to update. The first install also
    // fires controllerchange (clients.claim); reloading then would interrupt
    // whatever the player is doing, e.g. submitting a form.
    const onChange = () => {
      if (!updateRequested.current) return;
      updateRequested.current = false;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);
  if (!waiting) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-stage-900 px-4 py-3 text-sm text-white shadow-xl ring-1 ring-rail">
      A new version of {BRAND.name} is ready.
      <button type="button" className="btn btn-gold btn-sm" onClick={() => {
          updateRequested.current = true;
          waiting.postMessage({ type: 'SKIP_WAITING' });
        }}>
        Update
      </button>
    </div>
  );
}
