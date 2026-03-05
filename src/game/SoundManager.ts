/**
 * Procedural Web Audio API sound effects.
 * No external audio files needed.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  init() {
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.35;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      /* Web Audio not supported */
    }
  }

  ensureResumed() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  /** Short pop when picking up a goo ball */
  playPickup() {
    this.tone(320, 0.06, 'sine', 0.4);
    this.tone(480, 0.04, 'sine', 0.2, 0.02);
  }

  /** Snap/stick sound when placing a goo ball */
  playPlace() {
    this.tone(220, 0.08, 'triangle', 0.5);
    this.tone(330, 0.06, 'sine', 0.3, 0.03);
    this.noise(0.04, 0.15, 0.02);
  }

  /** Slurp when pipe sucks in a goo ball */
  playSlurp() {
    this.slideTone(400, 120, 0.2, 'sine', 0.4);
    this.noise(0.1, 0.1, 0.05);
  }

  /** Soft drop when goo ball is released without connecting */
  playDrop() {
    this.slideTone(300, 180, 0.1, 'sine', 0.2);
  }

  /** Level complete fanfare */
  playWin() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.3, 'sine', 0.3, i * 0.12));
  }

  /** Button hover tick */
  playTick() {
    this.tone(600, 0.02, 'sine', 0.15);
  }

  /* ── internals ── */

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  private slideTone(startF: number, endF: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endF, 1), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  private noise(dur: number, vol: number, delay = 0) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime + delay;
    const bufSize = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    src.connect(filter).connect(gain).connect(this.masterGain);
    src.start(now);
  }
}

export const soundManager = new SoundManager();
