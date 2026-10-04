// Soundboard audio engine.
//
// Every clip is fetched and decoded into an AudioBuffer up front, so a tap is
// just "start a buffer source" — no network, no <audio> element latency, and
// unlimited overlap. Signal chain:
//
//   voice gain ─┐
//   voice gain ─┼─> duck gain ─> master gain ─> limiter ─> speakers
//   bleep osc  ─┘ (bleep bypasses the duck so it cuts through)
//
// The limiter (a hard DynamicsCompressor) keeps stacked air horns from
// clipping into mush.

export type SoundMode = "shot" | "toggle";

export interface SoundDef {
  id: string;
  label: string;
  emoji: string;
  cat: string;
  mode: SoundMode;
  url: string;
  custom?: boolean;
}

type Listener = () => void;

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  duration: number;
}

class Engine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private duck!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<string, Voice>();
  private bleep: { osc: OscillatorNode; gain: GainNode } | null = null;
  private listeners = new Set<Listener>();
  private volume = 0.9;

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    // iOS: route Web Audio through the "playback" session so the ringer/silent
    // switch doesn't mute the soundboard (Safari 17+).
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        nav.audioSession.type = "playback";
      } catch {}
    }
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.duck = ctx.createGain();
    this.duck.connect(this.master).connect(this.limiter).connect(ctx.destination);
    this.ctx = ctx;
    return ctx;
  }

  /** Call from a user gesture. Resumes the context and primes iOS output. */
  unlock() {
    const ctx = this.ensure();
    if (ctx.state !== "running") void ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  isLoaded(id: string) {
    return this.buffers.has(id);
  }

  /** Fetch + decode. Decoding works on a suspended context, so this can run before any tap. */
  load(id: string, source: string | Blob): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) return Promise.resolve(have);
    const inflight = this.pending.get(id);
    if (inflight) return inflight;
    const ctx = this.ensure();
    const p = (async () => {
      try {
        const data = typeof source === "string" ? await (await fetch(source)).arrayBuffer() : await source.arrayBuffer();
        const buf = await ctx.decodeAudioData(data);
        this.buffers.set(id, buf);
        return buf;
      } catch (e) {
        console.warn("sound failed to load", id, e);
        return null;
      } finally {
        this.pending.delete(id);
      }
    })();
    this.pending.set(id, p);
    return p;
  }

  forget(id: string) {
    this.stop(id, 0.02);
    this.buffers.delete(id);
  }

  playing(id: string) {
    return this.voices.has(id);
  }

  /** 0..1 progress of a playing sound, or -1. */
  progress(id: string) {
    const v = this.voices.get(id);
    if (!v || !this.ctx) return -1;
    return Math.min(1, (this.ctx.currentTime - v.startedAt) / v.duration);
  }

  play(id: string, opts: { loop?: boolean } = {}) {
    const ctx = this.ensure();
    if (ctx.state !== "running") void ctx.resume();
    const buf = this.buffers.get(id);
    if (!buf) return false;
    // Retriggering a pad restarts it (with a micro-fade so it doesn't click).
    this.stop(id, 0.015);
    const gain = ctx.createGain();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    src.connect(gain).connect(this.duck);
    const voice: Voice = { src, gain, startedAt: ctx.currentTime, duration: buf.duration };
    src.onended = () => {
      if (this.voices.get(id) === voice) {
        this.voices.delete(id);
        this.emit();
      }
    };
    src.start();
    this.voices.set(id, voice);
    this.emit();
    return true;
  }

  stop(id: string, fade = 0.25) {
    const v = this.voices.get(id);
    if (!v || !this.ctx) return;
    this.voices.delete(id);
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + fade);
    try {
      v.src.stop(t + fade + 0.01);
    } catch {}
    this.emit();
  }

  stopAll() {
    [...this.voices.keys()].forEach((id) => this.stop(id, 0.12));
    this.bleepOff();
  }

  /** Classic 1 kHz censor tone. Ducks everything else while held. */
  bleepOn() {
    const ctx = this.ensure();
    if (ctx.state !== "running") void ctx.resume();
    if (this.bleep) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.008);
    osc.connect(gain).connect(this.master);
    osc.start();
    this.duck.gain.setTargetAtTime(0.08, t, 0.01);
    this.bleep = { osc, gain };
    this.emit();
  }

  bleepOff() {
    if (!this.bleep || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { osc, gain } = this.bleep;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.015);
    osc.stop(t + 0.03);
    this.duck.gain.setTargetAtTime(1, t, 0.05);
    this.bleep = null;
    this.emit();
  }

  get bleeping() {
    return !!this.bleep;
  }

  get anyPlaying() {
    return this.voices.size > 0 || !!this.bleep;
  }
}

export const engine = new Engine();

/** Trigger a sound respecting its mode. Returns true if it is now playing. */
export function trigger(s: Pick<SoundDef, "id" | "mode">) {
  if (s.mode === "toggle" && engine.playing(s.id)) {
    engine.stop(s.id, 0.6);
    return false;
  }
  return engine.play(s.id, { loop: s.mode === "toggle" });
}

export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
