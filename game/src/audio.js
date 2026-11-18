// Tiny WebAudio synth: no audio files, every sound is a few oscillators. The context is
// created lazily on the first user gesture (browsers block audio before one) and every call
// is guarded, so a headless browser without audio just plays silently.
export class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  /** Create the context. Call from a click or key handler. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.sirenGain) this.sirenGain.gain.value = 0;
    return this.muted;
  }

  /** A short tone with a pitch slide and a quick fade. */
  blip(freq, endFreq, duration, volume, type) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  /** A burst of filtered noise: gunshots, crashes, punches. */
  noise(duration, volume, filterFreq) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      source.connect(filter).connect(gain).connect(this.ctx.destination);
      source.start(t);
    } catch {
      // Silent is fine.
    }
  }

  shot() {
    this.noise(0.14, 0.5, 1800);
    this.blip(220, 60, 0.1, 0.25, 'square');
  }

  punch() {
    this.noise(0.08, 0.3, 500);
  }

  crash(strength) {
    this.noise(0.2, Math.min(0.6, 0.15 + strength * 0.02), 700);
  }

  pickup() {
    this.blip(660, 990, 0.12, 0.2, 'sine');
    setTimeout(() => this.blip(990, 1320, 0.14, 0.2, 'sine'), 90);
  }

  missionDone() {
    this.blip(523, 523, 0.12, 0.22, 'triangle');
    setTimeout(() => this.blip(659, 659, 0.12, 0.22, 'triangle'), 110);
    setTimeout(() => this.blip(784, 784, 0.22, 0.25, 'triangle'), 220);
  }

  click() {
    this.blip(880, 660, 0.06, 0.12, 'sine');
  }

  /** Start the engine hum; call every frame with the car's speed (0 when not driving). */
  engine(speed, driving) {
    if (!this.ctx || this.muted) return;
    try {
      if (!driving) {
        if (this.engineGain) this.engineGain.gain.value = 0;
        return;
      }
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        this.engineOsc.connect(filter).connect(this.engineGain).connect(this.ctx.destination);
        this.engineOsc.start();
      }
      this.engineOsc.frequency.value = 55 + speed * 2.2;
      this.engineGain.gain.value = 0.045;
    } catch {
      // Silent is fine.
    }
  }

  /** Two-tone siren while the police are after the player. Call every frame. */
  siren(active, dt) {
    if (!this.ctx || this.muted) {
      if (this.sirenGain) this.sirenGain.gain.value = 0;
      return;
    }
    try {
      if (!active) {
        if (this.sirenGain) this.sirenGain.gain.value = 0;
        return;
      }
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
        this.sirenOsc.start();
      }
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.45) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.value = this.sirenHigh ? 920 : 700;
      }
      this.sirenGain.gain.value = 0.03;
    } catch {
      // Silent is fine.
    }
  }
}
