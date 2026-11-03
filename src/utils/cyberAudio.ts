/**
 * JARVIS 2.0 - Futuristic Cyber Audio Synthesizer
 * Native Web Audio API implementation - Zero external assets or network calls required.
 */

class CyberAudioController {
  private audioCtx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('jarvis_sfx_muted') === 'true';
    } catch {
      this.muted = false;
    }
  }

  private initContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('jarvis_sfx_muted', String(this.muted));
    } catch {}
    return this.muted;
  }

  /**
   * Tactile keyboard click
   */
  public playKeyClick(freq = 1400) {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.035);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {}
  }

  /**
   * Ultron intrusion alarm - Dissonant cyber alarm
   */
  public playUltronAlert() {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Two pulses of dissonant buzz
      [0, 0.22, 0.44].forEach((delay) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'square';

        osc1.frequency.setValueAtTime(240, now + delay);
        osc1.frequency.linearRampToValueAtTime(140, now + delay + 0.16);

        osc2.frequency.setValueAtTime(260, now + delay);
        osc2.frequency.linearRampToValueAtTime(155, now + delay + 0.16);

        gain.gain.setValueAtTime(0.08, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now + delay);
        osc1.stop(now + delay + 0.18);
        osc2.start(now + delay);
        osc2.stop(now + delay + 0.18);
      });
    } catch {}
  }

  /**
   * Jarvis identity confirmed - Triumphant harmonic power-up chord
   */
  public playAccessGranted() {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const notes = [
        { f: 440, t: 0.0 },    // A4
        { f: 554.37, t: 0.08 }, // C#5
        { f: 659.25, t: 0.16 }, // E5
        { f: 880, t: 0.24 },   // A5
        { f: 1108.73, t: 0.34 } // C#6
      ];

      const now = ctx.currentTime;

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, now + note.t);

        gain.gain.setValueAtTime(0.09, now + note.t);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.t);
        osc.stop(now + note.t + 0.75);
      });

      // Ambient low sub-thud
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(120, now);
      sub.frequency.exponentialRampToValueAtTime(40, now + 0.6);
      subGain.gain.setValueAtTime(0.12, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.65);
    } catch {}
  }
}

export const cyberAudio = new CyberAudioController();
