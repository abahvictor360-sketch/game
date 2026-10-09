'use client';
import { useCallback, useEffect, useState } from 'react';

/** Optional, synthesised sound effects (no audio downloads). Off until the player turns it on; the choice persists per device. */
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
    // Audio unavailable: silently ignore.
  }
}

/** Plucked thumb-piano (mbira) note: sine plus a bright, fast-fading overtone. */
function mbira(freq: number, delay = 0, gain = 0.08) {
  tone(freq, 900, 'sine', gain, delay);
  tone(freq * 5.4, 110, 'sine', gain * 0.3, delay);
}

/** Low talking-drum thud with a downward pitch bend. */
function drum(gain = 0.12, delay = 0) {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + delay / 1000;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.22);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.45);
  } catch {
    // Audio unavailable: silently ignore.
  }
}

/** Shaker tick: a very short burst of filtered noise. */
function shaker(gain = 0.05) {
  try {
    ctx ??= new AudioContext();
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(hp).connect(g).connect(ctx.destination);
    src.start();
  } catch {
    // Audio unavailable: silently ignore.
  }
}

const SOUNDS = {
  select: () => mbira(587.33, 0, 0.06),
  correct: () => [440, 523.25, 659.25].forEach((f, i) => mbira(f, i * 90)),
  wrong: () => {
    drum(0.14);
    drum(0.1, 160);
  },
  tick: () => shaker(),
  win: () => [440, 523.25, 587.33, 659.25, 783.99, 880].forEach((f, i) => mbira(f, i * 110, 0.07)),
};

export type SoundName = keyof typeof SOUNDS;

export function useSound() {
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(KEY) !== '0');
    } catch {
      setMuted(true);
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
