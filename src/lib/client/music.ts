'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Original, generative background music played live with Web Audio: a
 * mbira (thumb piano) melody in a pentatonic scale over a shaker and a low
 * drum. Nothing is downloaded and no recording is used, so there is nothing
 * to license. Off by default; the choice is remembered per device.
 */
const KEY = 'fastora:music';
const BPM = 96;
const STEP = 60 / BPM / 2; // eighth notes

// A minor pentatonic (A C D E G) across two octaves, in Hz.
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
// Interlocking two-voice patterns (index into SCALE, -1 = rest), 16 steps per bar, 4 bars.
const LEAD = [
  [5, -1, 7, -1, 6, 5, -1, 3, 4, -1, 5, -1, 3, -1, 2, -1],
  [5, -1, 7, -1, 8, 7, -1, 5, 6, -1, 5, -1, 4, -1, 3, -1],
  [3, -1, 5, -1, 4, 3, -1, 2, 3, -1, 4, -1, 5, -1, 7, -1],
  [8, -1, 7, -1, 5, -1, 6, 5, 4, -1, 3, -1, 2, -1, -1, -1],
];
const BASS = [0, -1, -1, 2, -1, -1, 1, -1];

class Engine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noise: AudioBuffer | null = null;
  timer: ReturnType<typeof setInterval> | null = null;
  next = 0;
  step = 0;

  start() {
    if (this.timer) return;
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.25;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.5, t, 0.6); // fade in
    this.next = t + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stop() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.0001, t, 0.25); // fade out
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + 0.25) {
      const bar = Math.floor(this.step / 16) % LEAD.length;
      const i = this.step % 16;
      const note = LEAD[bar][i];
      // Tiny human timing so it doesn't sound machine-gridded.
      const swing = i % 2 ? STEP * 0.12 : 0;
      const at = this.next + swing;
      if (note >= 0) this.mbira(SCALE[note], at, 0.11);
      if (i % 2 === 0) {
        const b = BASS[(i / 2) % BASS.length];
        if (b >= 0) this.mbira(SCALE[b] / 2, at, 0.13);
      }
      this.shaker(at, i % 4 === 2 ? 0.05 : 0.025);
      if (i === 0 || i === 6 || i === 10) this.drum(at, i === 0 ? 0.32 : 0.2);
      this.next += STEP;
      this.step = (this.step + 1) % (16 * LEAD.length);
    }
  }

  /** Plucked metal tine: a sine with a bright, fast-decaying overtone. */
  private mbira(freq: number, at: number, gain: number) {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(gain, at + 0.005);
    out.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    out.connect(this.master!);
    for (const [mult, level, decay] of [
      [1, 1, 1.4],
      [5.4, 0.25, 0.12],
      [2.01, 0.15, 0.5],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(level, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + decay + 0.05);
    }
  }

  private shaker(at: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    src.connect(hp).connect(g).connect(this.master!);
    src.start(at);
    src.stop(at + 0.08);
  }

  /** Low hand drum: a sine sweeping down in pitch. */
  private drum(at: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, at);
    o.frequency.exponentialRampToValueAtTime(55, at + 0.18);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + 0.4);
  }
}

let engine: Engine | null = null;

/** Music on/off, remembered per device. Starting needs a tap (browser autoplay rules). */
export function useMusic() {
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  useEffect(() => {
    try {
      onRef.current = localStorage.getItem(KEY) === '1';
    } catch {}
    setOn(onRef.current);
    // If music was on last time, resume on the player's first tap.
    const resume = () => {
      if (!onRef.current || document.hidden) return;
      engine ??= new Engine();
      engine.start();
    };
    const vis = () => (document.hidden ? engine?.stop() : resume());
    window.addEventListener('pointerdown', resume, { once: true });
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pointerdown', resume);
      document.removeEventListener('visibilitychange', vis);
      engine?.stop();
    };
  }, []);
  const toggle = useCallback(() => {
    const nextOn = !onRef.current;
    onRef.current = nextOn;
    setOn(nextOn);
    try {
      localStorage.setItem(KEY, nextOn ? '1' : '0');
    } catch {}
    engine ??= new Engine();
    if (nextOn) engine.start();
    else engine.stop();
  }, []);
  return { on, toggle };
}
