import type { SoundId } from '../ui/context';

interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

/** A, C, D, E, G minor-pentatonic-ish palette for the ambient score (Hz). */
const CHORDS: number[][] = [
  [110, 164.81, 220, 261.63],
  [87.31, 130.81, 174.61, 220],
  [98, 146.83, 196, 246.94],
  [82.41, 123.47, 164.81, 207.65],
  [110, 146.83, 220, 293.66],
  [73.42, 110, 146.83, 220],
];
const BELLS = [440, 493.88, 523.25, 587.33, 659.25, 783.99, 880];

/**
 * Fully procedural audio: sound effects are synthesised with WebAudio nodes and the ambient
 * score is generated on the fly, so the game ships without audio files.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private volumes: Volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  private musicTimer: number | null = null;
  private chordIndex = 0;
  private lastPlayed = new Map<SoundId, number>();
  private musicWanted = false;

  constructor() {
    const unlock = (): void => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Lazily creates the audio graph after the first user gesture (browser autoplay rules). */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 4;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(ctx.destination);

    // Generated impulse response for a large hall reverb.
    const length = ctx.sampleRate * 3.5;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet);
    wet.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this.applyVolumes();
    if (this.musicWanted) this.startMusic();
    return ctx;
  }

  setVolumes(v: Volumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.2);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * 0.7, t, 0.05);
  }

  // ------------------------------------------------------------ primitives

  private tone(opts: { freq: number; to?: number; type?: OscillatorType; dur: number; gain: number; attack?: number; delay?: number; reverb?: number; bus?: GainNode | null }): void {
    const ctx = this.ctx;
    const bus = opts.bus ?? this.sfxBus;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    g.connect(bus);
    if (opts.reverb && this.reverb) {
      const send = ctx.createGain();
      send.gain.value = opts.reverb;
      g.connect(send);
      send.connect(this.reverb);
    }
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  private noiseBurst(opts: { dur: number; gain: number; freq: number; to?: number; q?: number; type?: BiquadFilterType; delay?: number; attack?: number; reverb?: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noise) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.Q.value = opts.q ?? 1;
    filter.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    if (opts.reverb && this.reverb) {
      const send = ctx.createGain();
      send.gain.value = opts.reverb;
      g.connect(send);
      send.connect(this.reverb);
    }
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + opts.dur + 0.05);
  }

  // ------------------------------------------------------------ effects

  play(id: SoundId): void {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    // Throttle identical sounds so bursts of events do not stack up.
    const now = performance.now();
    if (now - (this.lastPlayed.get(id) ?? 0) < 70) return;
    this.lastPlayed.set(id, now);
    switch (id) {
      case 'click':
        this.tone({ freq: 1250, to: 700, type: 'sine', dur: 0.07, gain: 0.18 });
        break;
      case 'build':
        this.noiseBurst({ dur: 0.35, gain: 0.5, freq: 900, to: 160, q: 2, reverb: 0.3 });
        this.tone({ freq: 120, to: 55, type: 'triangle', dur: 0.4, gain: 0.45 });
        break;
      case 'construct':
        for (let i = 0; i < 3; i++) this.tone({ freq: 1800 + i * 300, type: 'square', dur: 0.05, gain: 0.05, delay: i * 0.11 });
        this.noiseBurst({ dur: 0.25, gain: 0.25, freq: 3000, q: 4, delay: 0.05 });
        break;
      case 'complete':
        this.tone({ freq: 523.25, type: 'triangle', dur: 0.5, gain: 0.25, reverb: 0.5 });
        this.tone({ freq: 783.99, type: 'triangle', dur: 0.7, gain: 0.22, delay: 0.12, reverb: 0.5 });
        this.tone({ freq: 1046.5, type: 'sine', dur: 0.9, gain: 0.15, delay: 0.24, reverb: 0.6 });
        break;
      case 'docking':
        this.noiseBurst({ dur: 0.9, gain: 0.35, freq: 5000, to: 900, type: 'highpass', attack: 0.02, reverb: 0.3 });
        this.tone({ freq: 90, to: 45, type: 'sine', dur: 0.5, gain: 0.6, delay: 0.6 });
        this.noiseBurst({ dur: 0.2, gain: 0.4, freq: 400, q: 3, delay: 0.62 });
        break;
      case 'engine':
        this.noiseBurst({ dur: 2.2, gain: 0.22, freq: 180, to: 520, type: 'lowpass', attack: 0.6, reverb: 0.4 });
        this.tone({ freq: 55, to: 80, type: 'sawtooth', dur: 2, gain: 0.05, attack: 0.5 });
        break;
      case 'warning':
        for (let i = 0; i < 3; i++) {
          this.tone({ freq: 880, type: 'square', dur: 0.14, gain: 0.08, delay: i * 0.32 });
          this.tone({ freq: 660, type: 'square', dur: 0.14, gain: 0.08, delay: i * 0.32 + 0.16 });
        }
        break;
      case 'notify':
        this.tone({ freq: 987.77, type: 'sine', dur: 0.35, gain: 0.12, reverb: 0.4 });
        this.tone({ freq: 1318.5, type: 'sine', dur: 0.45, gain: 0.1, delay: 0.09, reverb: 0.4 });
        break;
      case 'research':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.6, gain: 0.14, delay: i * 0.09, reverb: 0.6 }));
        break;
      case 'trade':
        this.tone({ freq: 1567.98, type: 'square', dur: 0.06, gain: 0.05 });
        this.tone({ freq: 2093, type: 'square', dur: 0.09, gain: 0.05, delay: 0.07 });
        this.tone({ freq: 2637, type: 'sine', dur: 0.25, gain: 0.08, delay: 0.14, reverb: 0.3 });
        break;
      case 'error':
        this.tone({ freq: 160, type: 'sawtooth', dur: 0.18, gain: 0.12 });
        this.tone({ freq: 120, type: 'sawtooth', dur: 0.22, gain: 0.1, delay: 0.1 });
        break;
    }
  }

  // ------------------------------------------------------------ music

  startMusic(): void {
    this.musicWanted = true;
    if (!this.ctx || this.musicTimer !== null) return;
    const playChord = (): void => {
      const ctx = this.ctx;
      if (!ctx || !this.musicBus) return;
      const chord = CHORDS[this.chordIndex % CHORDS.length] as number[];
      this.chordIndex += Math.random() < 0.7 ? 1 : 2;
      const dur = 11;
      for (const f of chord) {
        for (const detune of [-6, 6]) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = f;
          osc.detune.value = detune + (Math.random() - 0.5) * 4;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(380, ctx.currentTime);
          filter.frequency.linearRampToValueAtTime(900, ctx.currentTime + dur * 0.5);
          filter.frequency.linearRampToValueAtTime(420, ctx.currentTime + dur);
          const g = ctx.createGain();
          const t0 = ctx.currentTime;
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.028, t0 + 3.5);
          g.gain.setValueAtTime(0.028, t0 + dur - 3.5);
          g.gain.linearRampToValueAtTime(0, t0 + dur + 1);
          osc.connect(filter);
          filter.connect(g);
          g.connect(this.musicBus);
          if (this.reverb) {
            const send = ctx.createGain();
            send.gain.value = 0.6;
            g.connect(send);
            send.connect(this.reverb);
          }
          osc.start(t0);
          osc.stop(t0 + dur + 1.2);
        }
      }
      // Sub drone.
      this.tone({ freq: (chord[0] ?? 110) / 2, type: 'sine', dur: dur, gain: 0.05, attack: 3, bus: this.musicBus });
      // Sparse bell melody.
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) {
        const f = BELLS[Math.floor(Math.random() * BELLS.length)] as number;
        this.tone({ freq: f, type: 'sine', dur: 2.6, gain: 0.035, attack: 0.01, delay: 1.5 + i * (1.6 + Math.random() * 1.4), reverb: 0.9, bus: this.musicBus });
      }
    };
    playChord();
    this.musicTimer = window.setInterval(playChord, 9500);
  }

  stopMusic(): void {
    this.musicWanted = false;
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
