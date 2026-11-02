/**
 * Retro Arcade Web Audio API Background Music Engine.
 * 100% self-contained zero-dependency chiptune & synthwave background music synthesizer:
 * 
 * - MENU / ATTRACT MODE: Hypnotic "Cyber Ambient Pulse" (82 BPM) with warm analog synth chords,
 *   deep sub-bass drone, and ethereal chiptune arpeggio shimmer.
 * - PLAYING MODE: High-energy driving "Skyward Ascent" (126 BPM) 80s synthwave chiptune with
 *   punchy 808/arcade drums, driving 16th-note octave bassline, and melodic lead arpeggios.
 * - PAUSED MODE: Smooth real-time 380Hz low-pass filter sweep (classic retro console "underwater" pause effect).
 * - LAVA URGENCY MODE: Dynamically adds high-tempo warning hi-hats & pulse when lava gap is under 3.5m!
 * - GAME OVER: Slow melancholic resolution chord fadeout.
 */

export type MusicMode = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

// Note frequencies in Hz (A4 = 440Hz)
const N = {
  // Octave 1 (Sub-bass)
  D1: 36.71, E1: 41.20, F1: 43.65, G1: 49.00, A1: 55.00, Bb1: 58.27, B1: 61.74, C2: 65.41,
  // Octave 2 (Bass)
  D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, Bb2: 116.54, C3: 130.81,
  // Octave 3 (Tenor / Chords)
  D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, Bb3: 233.08, C4: 261.63,
  // Octave 4 (Melody / Arp)
  D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, Bb4: 466.16, C5: 523.25,
  // Octave 5 (High Lead)
  D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, Bb5: 932.33, C6: 1046.50,
  D6: 1174.66,
};

class BackgroundMusicEngine {
  private ctx: AudioContext | null = null;
  private isMutedState: boolean = false;
  private masterGain: GainNode | null = null;
  private pauseFilter: BiquadFilterNode | null = null;

  private currentMode: MusicMode = 'MENU';
  private targetMode: MusicMode = 'MENU';
  private isUrgent: boolean = false;

  private timerId: number | null = null;
  private nextNoteTime: number = 0;
  private currentStep: number = 0;
  private isRunning: boolean = false;

  // Sound generator buffers
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    try {
      const saved = localStorage.getItem('arcade_bgm_muted');
      if (saved !== null) {
        this.isMutedState = saved === 'true';
      }
    } catch {
      // Ignore storage errors in restricted iframe environments
    }
  }

  private initContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (this.ctx && !this.masterGain) {
      // Master Gain Node with volume setting
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMutedState ? 0 : 0.28, this.ctx.currentTime);

      // Master Muffle Filter for dynamic "Underwater" pause effect
      this.pauseFilter = this.ctx.createBiquadFilter();
      this.pauseFilter.type = 'lowpass';
      this.pauseFilter.frequency.setValueAtTime(14000, this.ctx.currentTime);
      this.pauseFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

      this.pauseFilter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Create 1-second white noise buffer for drums
      const bufferSize = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    }

    return this.ctx;
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public getMode(): MusicMode {
    return this.currentMode;
  }

  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    try {
      localStorage.setItem('arcade_bgm_muted', String(muted));
    } catch {}

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.28, now, 0.08);
    }

    if (!muted && !this.isRunning) {
      this.start();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMutedState);
    return this.isMutedState;
  }

  public start(): void {
    const ctx = this.initContext();
    if (!ctx) return;

    if (this.isRunning) return;
    this.isRunning = true;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.currentStep = 0;

    // Accurate lookahead scheduler runs every 25ms
    this.timerId = window.setInterval(() => this.scheduler(), 25);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public setMode(mode: MusicMode): void {
    this.targetMode = mode;
    this.initContext();

    if (!this.isRunning && !this.isMutedState) {
      this.start();
    }

    if (!this.ctx || !this.pauseFilter || !this.masterGain) return;
    const now = this.ctx.currentTime;

    if (mode === 'PAUSED') {
      // Smoothly sweep down to muffled 420Hz filter (retro paused vibe)
      this.pauseFilter.frequency.cancelScheduledValues(now);
      this.pauseFilter.frequency.setTargetAtTime(420, now, 0.12);
      this.masterGain.gain.setTargetAtTime(this.isMutedState ? 0 : 0.18, now, 0.15);
    } else {
      // Unmuffle smoothly back to full crystal-clear spectrum
      this.pauseFilter.frequency.cancelScheduledValues(now);
      this.pauseFilter.frequency.setTargetAtTime(14000, now, 0.18);
      this.masterGain.gain.setTargetAtTime(this.isMutedState ? 0 : 0.28, now, 0.12);
      this.currentMode = mode;
    }
  }

  public setLavaUrgency(urgent: boolean): void {
    this.isUrgent = urgent;
  }

  /**
   * Lookahead Scheduler: examines audio clock and schedules musical notes
   * up to 100ms in advance for rock-solid timing independent of UI frame drops.
   */
  private scheduler(): void {
    if (!this.ctx || !this.pauseFilter || !this.isRunning) return;

    // If context was suspended, try to resume
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
      return;
    }

    const scheduleAheadTime = 0.12; // 120ms lookahead
    while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advanceStep();
    }
  }

  private advanceStep(): void {
    // 16th note step durations based on mode tempo:
    // PLAYING: 126 BPM -> 1 beat = 60/126 = 0.476s -> 16th note = 0.119s
    // MENU / ATTRACT: 82 BPM -> 1 beat = 60/82 = 0.731s -> 16th note = 0.182s
    const isPlaying = this.targetMode === 'PLAYING' || this.targetMode === 'PAUSED';
    const bpm = isPlaying ? (this.isUrgent ? 132 : 126) : 82;
    const secondsPer16th = 60.0 / bpm / 4.0;

    this.nextNoteTime += secondsPer16th;
    this.currentStep = (this.currentStep + 1) % 64; // 4-bar loop (64 sixteenth notes)
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.pauseFilter) return;

    const isPlaying = this.targetMode === 'PLAYING' || this.targetMode === 'PAUSED';

    if (isPlaying) {
      this.playGameStep(step, time);
    } else if (this.targetMode === 'MENU') {
      this.playMenuStep(step, time);
    } else if (this.targetMode === 'GAME_OVER') {
      this.playGameOverStep(step, time);
    }
  }

  /* =========================================================================
     1. GAMEPLAY SYNTHWAVE TRACK ("Skyward Ascent" - 126 BPM)
     Driving retro-synth with 16th bassline, punchy chiptune drums, and lead arp
     ========================================================================= */
  private playGameStep(step: number, time: number): void {
    const bar = Math.floor(step / 16); // 0 to 3
    const stepInBar = step % 16;       // 0 to 15

    // A. 808 / Arcade Drum Machine
    // Kick on beats 0, 4, 8, 12 (or offbeat kick when urgent)
    if (stepInBar === 0 || stepInBar === 8 || (stepInBar === 4 && this.isUrgent) || (stepInBar === 12 && this.isUrgent)) {
      this.triggerKick(time);
    } else if (stepInBar === 14 && bar % 2 === 1) {
      // Syncopated ghost kick
      this.triggerKick(time, 0.5);
    }

    // Snare on beats 4 and 12 (standard 2 & 4 backbeat)
    if (stepInBar === 4 || stepInBar === 12) {
      this.triggerSnare(time);
    }

    // Hi-Hats: 16th-note closed chiptune hat with accented offbeats
    const isHatStep = true;
    if (isHatStep) {
      const isOffbeat = stepInBar % 2 === 1;
      const isUrgentExtra = this.isUrgent && stepInBar % 4 === 2;
      const volume = isOffbeat ? 0.35 : isUrgentExtra ? 0.3 : 0.16;
      this.triggerHiHat(time, volume);
    }

    // B. Driving 16th-Note Retro Bassline
    // 4-Bar Chord Progression: Dm -> Bb -> C -> Am (or Dm -> F -> C -> A)
    const bassNotesByBar = [
      [N.D2, N.D2, N.D3, N.D2, N.D2, N.D3, N.D2, N.D2, N.D2, N.D3, N.D2, N.D2, N.F2, N.D2, N.C2, N.D2],
      [N.Bb1, N.Bb1, N.Bb2, N.Bb1, N.Bb1, N.Bb2, N.Bb1, N.Bb1, N.Bb1, N.Bb2, N.Bb1, N.Bb1, N.D2, N.Bb1, N.A1, N.Bb1],
      [N.C2, N.C2, N.C3, N.C2, N.C2, N.C3, N.C2, N.C2, N.C2, N.C3, N.C2, N.C2, N.E2, N.C2, N.B1, N.C2],
      [N.A1, N.A1, N.A2, N.A1, N.A1, N.A2, N.A1, N.A1, N.G1, N.G1, N.A1, N.A1, N.Bb1, N.A1, N.C2, N.E2],
    ];

    const currentBarNotes = bassNotesByBar[bar];
    const bassFreq = currentBarNotes[stepInBar];
    if (bassFreq) {
      this.triggerBass(bassFreq, time, 0.10);
    }

    // C. Chiptune Lead Arpeggios & Heroic Ascent Theme
    // Melodic arpeggio patterns weaving across the octaves
    const leadPatterns = [
      // Bar 0: Dm (D4, F4, A4, D5)
      [N.D4, 0, N.F4, N.A4, N.D5, N.A4, N.F4, N.A4, N.D4, N.E4, N.F4, N.A4, N.D5, N.F5, N.E5, N.D5],
      // Bar 1: Bb (Bb3, D4, F4, Bb4)
      [N.Bb3, 0, N.D4, N.F4, N.Bb4, N.F4, N.D4, N.F4, N.Bb4, N.C5, N.D5, N.F5, N.D5, N.C5, N.Bb4, N.A4],
      // Bar 2: C (C4, E4, G4, C5)
      [N.C4, 0, N.E4, N.G4, N.C5, N.G4, N.E4, N.G4, N.C5, N.D5, N.E5, N.G5, N.E5, N.D5, N.C5, N.E5],
      // Bar 3: A / Turnaround (A3, C#4/C4, E4, A4)
      [N.A3, 0, N.C4, N.E4, N.A4, N.E4, N.C4, N.E4, N.G4, N.F4, N.E4, N.D4, N.C4, N.D4, N.E4, N.F4],
    ];

    const leadFreq = leadPatterns[bar][stepInBar];
    if (leadFreq > 0) {
      this.triggerLead(leadFreq, time, 0.11);
    }

    // D. Occasional Lava Urgency Warning Pulses
    if (this.isUrgent && stepInBar % 8 === 0) {
      this.triggerUrgentWarning(time);
    }
  }

  /* =========================================================================
     2. MENU / ATTRACT MODE ("Cyber Ambient Pulse" - 82 BPM)
     Hypnotic warm synth chords, sub-bass pulse, and dreamy chiptune shimmer
     ========================================================================= */
  private playMenuStep(step: number, time: number): void {
    const bar = Math.floor(step / 16); // 0 to 3
    const stepInBar = step % 16;

    // Warm Analog Chord Pads on the downbeat of each bar
    if (stepInBar === 0) {
      const chords = [
        [N.D3, N.F3, N.A3, N.C4],   // Dm7
        [N.Bb2, N.F3, N.Bb3, N.D4], // Bbmaj7
        [N.G2, N.D3, N.G3, N.Bb3],  // Gm7
        [N.A2, N.E3, N.A3, N.C4],   // Am7
      ];
      this.triggerPadChord(chords[bar], time, 2.8);

      // Deep Sub-Bass Drone on bar start
      const subNotes = [N.D1, N.Bb1, N.G1, N.A1];
      this.triggerSubDrone(subNotes[bar], time, 2.7);
    }

    // Gentle Chiptune Shimmer Bell Arpeggios (spaced out, hypnotic)
    if (stepInBar % 2 === 0) {
      const shimmerArps = [
        [N.A4, N.D5, N.F5, N.A5, N.C6, N.A5, N.F5, N.D5],
        [N.F4, N.Bb4, N.D5, N.F5, N.Bb5, N.F5, N.D5, N.Bb4],
        [N.G4, N.Bb4, N.D5, N.G5, N.Bb5, N.G5, N.D5, N.Bb4],
        [N.E4, N.A4, N.C5, N.E5, N.A5, N.E5, N.C5, N.A4],
      ];
      const noteIdx = Math.floor(stepInBar / 2) % 8;
      const freq = shimmerArps[bar][noteIdx];
      this.triggerChiptuneBell(freq, time, 0.22);
    }

    // Soft Ambient Pulse Kick on beats 0 & 8
    if (stepInBar === 0 || stepInBar === 8) {
      this.triggerKick(time, 0.45);
    }
  }

  /* =========================================================================
     3. GAME OVER RESOLUTION (Gentle Descending Synth Fade)
     ========================================================================= */
  private playGameOverStep(step: number, time: number): void {
    if (step === 0) {
      // Warm Minor 9th chord fading out softly
      this.triggerPadChord([N.D3, N.F3, N.A3, N.C4, N.E4], time, 3.5);
      this.triggerSubDrone(N.D1, time, 3.5);
    }
  }

  /* =========================================================================
     SYNTHESIZER INSTRUMENT VOICES
     ========================================================================= */

  /**
   * Punchy 808 Arcade Kick: Fast pitch envelope downward sweep (130Hz -> 38Hz).
   */
  private triggerKick(time: number, volumeScale: number = 1.0): void {
    if (!this.ctx || !this.pauseFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.08);

    gain.gain.setValueAtTime(0.45 * volumeScale, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.pauseFilter);

    osc.start(time);
    osc.stop(time + 0.17);
  }

  /**
   * Crisp Arcade Snare: Bandpassed white noise burst + tone body.
   */
  private triggerSnare(time: number): void {
    if (!this.ctx || !this.pauseFilter || !this.noiseBuffer) return;

    // 1. Noise Snap
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.Q.setValueAtTime(1.8, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.26, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.pauseFilter);

    noise.start(time);
    noise.stop(time + 0.13);

    // 2. Tonal Pop
    const osc = this.ctx.createOscillator();
    const tonGain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.07);

    tonGain.gain.setValueAtTime(0.20, time);
    tonGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.connect(tonGain);
    tonGain.connect(this.pauseFilter);

    osc.start(time);
    osc.stop(time + 0.09);
  }

  /**
   * Chiptune Hi-Hat: Highpassed noise tick.
   */
  private triggerHiHat(time: number, volume: number = 0.25): void {
    if (!this.ctx || !this.pauseFilter || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6800, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.038);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.pauseFilter);

    noise.start(time);
    noise.stop(time + 0.04);
  }

  /**
   * Rhythmic Synthwave Bass: Filtered saw/square with snappy decay.
   */
  private triggerBass(freq: number, time: number, duration: number): void {
    if (!this.ctx || !this.pauseFilter) return;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    // Filter envelope for snappy attack
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + duration);
    filter.Q.setValueAtTime(3.0, time);

    gain.gain.setValueAtTime(0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration + 0.02);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.pauseFilter);

    osc.start(time);
    osc.stop(time + duration + 0.03);
  }

  /**
   * Nostalgic Chiptune Lead: Square wave with 80s arcade vibrancy.
   */
  private triggerLead(freq: number, time: number, duration: number): void {
    if (!this.ctx || !this.pauseFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.pauseFilter);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  /**
   * Dreamy Chiptune Bell Shimmer (Menu Mode).
   */
  private triggerChiptuneBell(freq: number, time: number, duration: number): void {
    if (!this.ctx || !this.pauseFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.14, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.pauseFilter);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  /**
   * Warm Analog Pad Chords (Menu & Game Over).
   */
  private triggerPadChord(chordNotes: number[], time: number, duration: number): void {
    if (!this.ctx || !this.pauseFilter) return;

    chordNotes.forEach((freq, idx) => {
      if (!this.ctx || !this.pauseFilter) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      // Slight detune for lush analog chorus effect
      const detuneCents = (idx % 2 === 0 ? 5 : -5);
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(detuneCents, time);

      // Soft swelling attack and gentle release
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.055, time + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(gain);
      gain.connect(this.pauseFilter);

      osc.start(time);
      osc.stop(time + duration + 0.05);
    });
  }

  /**
   * Sub-Bass Drone: Deep resonant foundation.
   */
  private triggerSubDrone(freq: number, time: number, duration: number): void {
    if (!this.ctx || !this.pauseFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.24, time + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.pauseFilter);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  /**
   * Urgent high-pitch blip when lava is dangerously close.
   */
  private triggerUrgentWarning(time: number): void {
    if (!this.ctx || !this.pauseFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(N.A5, time);

    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    osc.connect(gain);
    gain.connect(this.pauseFilter);

    osc.start(time);
    osc.stop(time + 0.05);
  }
}

export const backgroundMusic = new BackgroundMusicEngine();
