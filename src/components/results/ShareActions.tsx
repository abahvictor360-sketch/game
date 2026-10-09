'use client';
import { useState } from 'react';
import { BRAND, WHATSAPP_GREEN } from '@/lib/shared/brand';

/**
 * Sharing: native share sheet where available, WhatsApp link, copy, and a
 * downloadable image (for Instagram/TikTok, which don't accept direct posts
 * from the web).
 */
export function ShareActions({ text, url, imageUrl, sessionId }: { text: string; url: string; imageUrl: string; sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${text}\n${url}`;
  const log = (channel: string) => {
    void fetch('/api/share-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, channel }) }).catch(() => {});
  };
  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `My ${BRAND.name} result`, text, url });
        log('native');
        return;
      }
    } catch {
      return;
    }
    await copy();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      log('copy');
    } catch {
      window.prompt('Copy your result:', full);
    }
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button type="button" className="btn btn-gold" onClick={nativeShare}>
        Share result
      </button>
      <a className="btn text-white" style={{ background: WHATSAPP_GREEN }} href={`https://wa.me/?text=${encodeURIComponent(full)}`} target="_blank" rel="noopener noreferrer" onClick={() => log('whatsapp')}>
        Share on WhatsApp
      </a>
      <button type="button" className="btn btn-ghost" onClick={copy} aria-live="polite">
        {copied ? 'Copied!' : 'Copy text'}
      </button>
      <a className="btn btn-ghost" href={imageUrl} download={`fastora-result.png`} onClick={() => log('image')}>
        Download image
      </a>
      <p className="text-xs text-blue-100/70 sm:col-span-2">For Instagram or TikTok, download the image and add it to your story or post.</p>
    </div>
  );
}
