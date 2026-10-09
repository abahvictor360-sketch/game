'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSound } from '@/lib/client/sound';

export type ToastTone = 'error' | 'info' | 'success';
export type ToastMessage = { text: string; tone: ToastTone };

/** Short-lived message with an auto-dismiss timer. */
export function useToast(durationMs = 4500) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), durationMs);
    return () => clearTimeout(t);
  }, [toast, durationMs]);
  const show = useCallback((text: string, tone: ToastTone = 'info') => setToast({ text, tone }), []);
  return { toast, show, clear: () => setToast(null) };
}

const TOAST_TONES: Record<ToastTone, string> = {
  error: 'bg-coral-700 text-white',
  info: 'bg-stage-900 text-white ring-1 ring-rail',
  success: 'bg-emerald-700 text-white',
};

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss?: () => void }) {
  if (!toast) return null;
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`anim-rise fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-xl sm:bottom-4 ${TOAST_TONES[toast.tone]}`}
    >
      <span>{toast.text}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="-my-2 -mr-2 grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-white/10" aria-label="Dismiss">
          ✕
        </button>
      ) : null}
    </div>
  );
}

/** Accessible confirmation dialog built on the native <dialog> element. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-title"
      className="ivory m-auto w-[min(92vw,26rem)] rounded-2xl p-5 shadow-2xl backdrop:bg-stage-950/70"
    >
      <h2 id="confirm-title" className="font-display text-lg font-black">
        {title}
      </h2>
      {children ? <div className="mt-2 text-sm text-ink-700">{children}</div> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-light btn-sm" onClick={onCancel} autoFocus>
          {cancelLabel}
        </button>
        <button type="button" className={`btn btn-sm ${tone === 'danger' ? 'btn-coral' : 'btn-gold'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

/** Visible sound toggle shared by every screen that plays sounds. */
export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="btn btn-ghost btn-sm" aria-pressed={!muted} aria-label={muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off'}>
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
    </button>
  );
}

/** Sound hook re-exported so screens import feedback helpers from one place. */
export { useSound };

/** Track the browser's connectivity (navigator.onLine plus online/offline events). */
export function useOnline(onReconnect?: () => void) {
  const [online, setOnline] = useState(true);
  const cb = useRef(onReconnect);
  cb.current = onReconnect;
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      cb.current?.();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
