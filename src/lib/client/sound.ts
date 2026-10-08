'use client';
import { useCallback, useEffect, useState } from 'react';

/** Optional, synthesised sound effects (no audio downloads). Muted state persists per device. */
const KEY = 'fastora:muted';
let ctx: AudioContext | null = null;

function tone(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.06, delay = 0) {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + delay / 1000;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch {
    // Audio unavailable — silently ignore.
  }
}

const SOUNDS = {
  select: () => tone(520, 90, 'triangle'),
  correct: () => {
    tone(660, 140, 'triangle', 0.07);
    tone(880, 200, 'triangle', 0.07, 120);
  },
  wrong: () => {
    tone(220, 220, 'sawtooth', 0.04);
    tone(165, 260, 'sawtooth', 0.04, 150);
  },
  tick: () => tone(1000, 40, 'square', 0.02),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 180, 'triangle', 0.06, i * 110)),
};

export type SoundName = keyof typeof SOUNDS;

export function useSound() {
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(KEY) === '1');
    } catch {
      setMuted(false);
    }
  }, []);
  const toggle = useCallback(() => {
    setMuted((m) => {
      try {
        localStorage.setItem(KEY, m ? '0' : '1');
      } catch {}
      return !m;
    });
  }, []);
  const play = useCallback((name: SoundName) => {
    if (!muted) SOUNDS[name]();
  }, [muted]);
  return { muted, toggle, play };
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
