/**
 * Retro Arcade Web Audio API Sound Effects Engine.
 * 100% self-contained zero-dependency synthesizer for 80s arcade sound effects:
 * - Countdown beeps & "GO!" fanfare
 * - Rolling ball subtle mechanical hum
 * - Bumper & hole rim bounce thuds
 * - Gem / Star Portal warp chime
 * - Molten lava plunge, splash bubbles & sizzle
 * - Cybernetic hand lock-on chime
 * - Palm gesture pause & resume sweeps
 * - Stage sector promotion fanfare
 * - Game over descent
 */

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private rollingOsc: OscillatorNode | null = null;
  private rollingGain: GainNode | null = null;
  private rollingFilter: BiquadFilterNode | null = null;
  private isRollingInitialized: boolean = false;

  constructor() {
    // Restore mute preference if previously saved
    try {
      const saved = localStorage.getItem('arcade_sfx_muted');
      if (saved !== null) {
        this.muted = saved === 'true';
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }

  /**
   * Initializes or resumes the AudioContext on user interaction.
   */
  private getContext(): AudioContext | null {
    if (this.muted) return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx && this.ctx.state !== 'closed' ? this.ctx : null;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem('arcade_sfx_muted', String(muted));
    } catch {
      // ignore
    }
    if (muted && this.rollingGain && this.ctx) {
      this.rollingGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * 3, 2, 1 countdown beep or high triumphant "GO!" chirp.
   */
  public playCountdownBeep(isGo: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (!isGo) {
      // 3, 2, 1 short retro square beep (880Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } else {
      // "GO!" - Vibrant high chord (1046Hz + 1760Hz)
      [1046.5, 1760].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.3);
      });
    }
  }

  /**
   * Metallic ball bouncing off side bumpers or edges.
   */
  public playBounce(velocity: number = 200): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const intensity = Math.min(1, Math.max(0.15, Math.abs(velocity) / 400));

    osc.type = 'triangle';
    // Frequency drop for mechanical impact thud
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.07);

    gain.gain.setValueAtTime(0.2 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * Star / Portal Warp pickup: bright ascending 4-note arcade chime.
   */
  public playWarpPortal(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [1046.5, 1318.5, 1568.0, 2093.0]; // C6, E6, G6, C7
    const noteDuration = 0.045;

    notes.forEach((freq, idx) => {
      const noteTime = now + idx * noteDuration;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.16, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.14);
    });
  }

  /**
   * Molten lava impact & splash: boiling magma bubble plunge + thermal steam sizzle.
   */
  public playLavaSplash(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Heavy liquid bubble "bloop" sine sweep (180Hz -> 50Hz)
    const bubbleOsc = ctx.createOscillator();
    const bubbleGain = ctx.createGain();

    bubbleOsc.type = 'sine';
    bubbleOsc.frequency.setValueAtTime(210, now);
    bubbleOsc.frequency.exponentialRampToValueAtTime(45, now + 0.28);

    bubbleGain.gain.setValueAtTime(0.26, now);
    bubbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    bubbleOsc.connect(bubbleGain);
    bubbleGain.connect(ctx.destination);

    bubbleOsc.start(now);
    bubbleOsc.stop(now + 0.33);

    // 2. Boiling lava sizzle & hiss (Bandpass-filtered white noise burst)
    const bufferSize = Math.floor(ctx.sampleRate * 0.45);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.7;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.42);
    filter.Q.setValueAtTime(3.5, now);

    const sizzleGain = ctx.createGain();
    sizzleGain.gain.setValueAtTime(0.22, now);
    sizzleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

    noiseSource.connect(filter);
    filter.connect(sizzleGain);
    sizzleGain.connect(ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + 0.45);
  }

  /**
   * Free-fall whoosh / thermal warning tone when slipping off the bar into the abyss.
   */
  public playLavaFallHiss(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Cybernetic hand lock acquired: two-tone futuristic chirp.
   */
  public playHandLock(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [523.25, 1046.5].forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.09);
    });
  }

  /**
   * Open Palm Pause: electronic disengage sweep down.
   */
  public playPause(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Open Palm Resume: electronic engage sweep up.
   */
  public playResume(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.12);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Level Sector Promotion Fanfare.
   */
  public playSectorPromotion(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [392.0, 523.25, 659.25, 783.99, 1046.5]; // G4, C5, E5, G5, C6
    const dur = 0.05;

    notes.forEach((freq, i) => {
      const t = now + i * dur;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  /**
   * Classic retro arcade game over descent.
   */
  public playGameOver(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [311.13, 293.66, 261.63, 196.0, 130.81]; // Eb4 -> D4 -> C4 -> G3 -> C3
    const dur = 0.12;

    notes.forEach((freq, i) => {
      const t = now + i * dur;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + dur * 1.3);
    });
  }

  /**
   * Updates dynamic rolling hum based on ball velocity.
   */
  public updateRolling(speed: number, isRollingOnBar: boolean): void {
    const ctx = this.getContext();
    if (!ctx || this.muted) {
      if (this.rollingGain && ctx) {
        this.rollingGain.gain.setValueAtTime(0, ctx.currentTime);
      }
      return;
    }

    if (!this.isRollingInitialized) {
      try {
        this.rollingOsc = ctx.createOscillator();
        this.rollingFilter = ctx.createBiquadFilter();
        this.rollingGain = ctx.createGain();

        this.rollingOsc.type = 'triangle';
        this.rollingOsc.frequency.setValueAtTime(75, ctx.currentTime);

        this.rollingFilter.type = 'lowpass';
        this.rollingFilter.frequency.setValueAtTime(140, ctx.currentTime);

        this.rollingGain.gain.setValueAtTime(0, ctx.currentTime);

        this.rollingOsc.connect(this.rollingFilter);
        this.rollingFilter.connect(this.rollingGain);
        this.rollingGain.connect(ctx.destination);

        this.rollingOsc.start();
        this.isRollingInitialized = true;
      } catch {
        return;
      }
    }

    if (!this.rollingGain || !this.rollingOsc || !this.rollingFilter) return;

    const now = ctx.currentTime;

    if (!isRollingOnBar || speed < 15) {
      this.rollingGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const normSpeed = Math.min(1, speed / 550);
    const targetGain = 0.045 * normSpeed;
    const targetFreq = 75 + normSpeed * 95; // 75Hz to 170Hz rumble
    const targetCutoff = 140 + normSpeed * 180;

    this.rollingGain.gain.setTargetAtTime(targetGain, now, 0.04);
    this.rollingOsc.frequency.setTargetAtTime(targetFreq, now, 0.04);
    this.rollingFilter.frequency.setTargetAtTime(targetCutoff, now, 0.04);
  }

  /**
   * Stops rolling sound loop immediately.
   */
  public stopRolling(): void {
    if (this.rollingGain && this.ctx) {
      this.rollingGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }
}

export const soundEffects = new SoundEffectsEngine();
