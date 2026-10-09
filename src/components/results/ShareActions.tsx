'use client';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { BRAND, WHATSAPP_GREEN } from '@/lib/shared/brand';

/**
 * Sharing: native share sheet where available, WhatsApp link, copy, and
 * images. The tall story image (with a QR code) is shared as a file where
 * the phone supports it, so it goes straight into TikTok, Instagram or
 * WhatsApp Status; otherwise it opens to save.
 */
export function ShareActions({ text, url, imageUrl, storyUrl, sessionId }: { text: string; url: string; imageUrl: string; storyUrl: string; sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const [imageState, setImageState] = useState<'idle' | 'loading' | 'error'>('idle');
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
  async function shareImage() {
    setImageState('loading');
    try {
      const res = await fetch(storyUrl);
      if (!res.ok) throw new Error('image');
      const file = new File([await res.blob()], `${BRAND.name.toLowerCase()}-result.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My ${BRAND.name} result`, text: `${text}\n${url}` }).catch(() => {});
        log('image_share');
      } else {
        window.open(storyUrl, '_blank', 'noopener');
        log('image');
      }
      setImageState('idle');
    } catch {
      setImageState('error');
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
      <button type="button" className="btn btn-ghost" onClick={shareImage} disabled={imageState === 'loading'}>
        <Icon name="qr" size={18} /> {imageState === 'loading' ? 'Preparing image…' : 'Share image'}
      </button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-100/70 sm:col-span-2">
        <span>The tall image has a QR code, made for TikTok, Instagram and WhatsApp Status.</span>
        <a className="inline-flex min-h-11 items-center font-bold text-gold-300 underline" href={storyUrl} download={`${BRAND.name.toLowerCase()}-story.png`} onClick={() => log('image')}>
          Save tall image
        </a>
        <a className="inline-flex min-h-11 items-center font-bold text-gold-300 underline" href={imageUrl} download={`${BRAND.name.toLowerCase()}-result.png`} onClick={() => log('image')}>
          Save wide image
        </a>
      </div>
      {imageState === 'error' ? (
        <p role="alert" className="text-sm text-coral-400 sm:col-span-2">
          We couldn’t prepare the image. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}
