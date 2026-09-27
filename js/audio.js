const TRACK_FILES = {
  forest: "assets/audio/forest.mp3",
  ocean: "assets/audio/ocean.mp3",
  rain: "assets/audio/rain.mp3",
  fire: "assets/audio/fire.mp3",
  calm: "assets/audio/calm.mp3",
};

export const TRACKS = [
  { id: "forest", name: "숲의 소리", emoji: "🌿", group: "nature" },
  { id: "ocean", name: "바닷소리", emoji: "🌊", group: "nature" },
  { id: "rain", name: "빗소리", emoji: "🌧", group: "nature" },
  { id: "fire", name: "모닥불", emoji: "🔥", group: "nature" },
  { id: "calm", name: "잔잔한 명상 음악", emoji: "🎵", group: "music" },
  { id: "none", name: "음악 없음", emoji: "🔇", group: "session" },
];

export const SESSION_TRACK_IDS = ["forest", "ocean", "rain", "calm", "none"];

export function trackById(id) {
  return TRACKS.find((track) => track.id === id) || null;
}

export class Ambient {
  constructor() {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.current = null;
    this.mode = null;
    this.volume = 0.7;
    this.ctx = null;
    this.master = null;
    this.nodes = [];
    this.timers = [];
    this.token = 0;
    this.fadeTimer = null;
    this.available = {};
    this.onChange = null;
    this.userPaused = false;
  }

  async prepare() {
    const entries = await Promise.all(
      Object.entries(TRACK_FILES).map(async ([id, url]) => {
        try {
          const response = await fetch(url, { method: "HEAD" });
          return [id, response.ok];
        } catch {
          return [id, false];
        }
      }),
    );
    this.available = Object.fromEntries(entries);
  }

  isPlaying() {
    if (!this.current || this.current === "none" || this.userPaused) return false;
    if (this.mode === "file") return !this.audio.paused;
    if (this.mode === "gen") return Boolean(this.ctx);
    return false;
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.audio.volume = this.volume;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume * 0.85, this.ctx.currentTime, 0.05);
    }
  }

  play(id, volume = this.volume) {
    this.setVolume(volume);
    if (!id || id === "none") {
      this.stop();
      this.current = "none";
      this.userPaused = false;
      this.emit();
      return;
    }
    this.userPaused = false;
    if (this.current === id && this.isPlaying()) return;
    this.hardStop();
    this.current = id;
    const token = ++this.token;
    if (this.available[id]) {
      this.audio.src = TRACK_FILES[id];
      this.audio.volume = this.volume;
      this.audio
        .play()
        .then(() => {
          if (token !== this.token) return;
          this.mode = "file";
          this.emit();
        })
        .catch((error) => {
          if (token !== this.token) return;
          if (error?.name === "NotAllowedError") {
            this.mode = "blocked";
            this.emit();
            return;
          }
          this.startGenerator(id);
          this.emit();
        });
      return;
    }
    const started = this.startGenerator(id);
    this.mode = started ? "gen" : "blocked";
    this.emit();
  }

  pause() {
    this.userPaused = true;
    if (this.mode === "file") this.audio.pause();
    if (this.mode === "gen" && this.ctx?.state === "running") this.ctx.suspend();
    this.emit();
  }

  resume() {
    if (!this.current || this.current === "none") return;
    this.userPaused = false;
    if (this.mode === "file") {
      this.audio.play().catch(() => {
        this.mode = "blocked";
        this.emit();
      });
      return;
    }
    if (this.mode === "gen" && this.ctx) {
      this.ctx.resume();
      this.emit();
      return;
    }
    this.play(this.current, this.volume);
  }

  stop() {
    const token = this.token;
    if (this.mode === "file" && !this.audio.paused && this.audio.volume > 0.02) {
      const start = this.audio.volume;
      let step = 0;
      clearInterval(this.fadeTimer);
      this.fadeTimer = setInterval(() => {
        if (token !== this.token) {
          clearInterval(this.fadeTimer);
          return;
        }
        step += 1;
        this.audio.volume = Math.max(0, start * (1 - step / 8));
        if (step >= 8) {
          clearInterval(this.fadeTimer);
          this.hardStop();
          this.current = null;
          this.emit();
        }
      }, 40);
      return;
    }
    this.hardStop();
    this.current = null;
    this.userPaused = false;
    this.emit();
  }

  hardStop() {
    clearInterval(this.fadeTimer);
    this.token += 1;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.timers.forEach((id) => clearInterval(id));
    this.timers = [];
    this.nodes.forEach((node) => {
      try {
        node.stop?.();
        node.disconnect?.();
      } catch {
        /* already stopped */
      }
    });
    this.nodes = [];
    if (this.ctx?.state === "running") this.ctx.suspend();
    this.mode = null;
  }

  emit() {
    this.onChange?.();
  }

  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.85;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => this.emit());
    }
    return this.ctx;
  }

  noise(ctx, color) {
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (color === "white") data[i] = white;
      else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.4;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    this.nodes.push(source);
    return source;
  }

  startGenerator(id) {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    this.master.gain.setTargetAtTime(this.volume * 0.85, ctx.currentTime, 0.05);
    if (id === "rain") this.layerRain(ctx);
    else if (id === "ocean") this.layerOcean(ctx);
    else if (id === "forest") this.layerForest(ctx);
    else if (id === "fire") this.layerFire(ctx);
    else this.layerCalm(ctx);
    this.mode = "gen";
    return true;
  }

  layerRain(ctx) {
    const air = this.noise(ctx, "white");
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 700;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    air.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.master);
    air.start();

    const body = this.noise(ctx, "brown");
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = "lowpass";
    bodyFilter.frequency.value = 380;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.08;
    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(this.master);
    body.start();
  }

  layerOcean(ctx) {
    const source = this.noise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    this.nodes.push(lfo);
  }

  layerForest(ctx) {
    const bed = this.noise(ctx, "brown");
    const bedFilter = ctx.createBiquadFilter();
    bedFilter.type = "lowpass";
    bedFilter.frequency.value = 500;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.07;
    bed.connect(bedFilter);
    bedFilter.connect(bedGain);
    bedGain.connect(this.master);
    bed.start();

    const air = this.noise(ctx, "white");
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "bandpass";
    airFilter.frequency.value = 2400;
    airFilter.Q.value = 0.45;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.015;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(this.master);
    air.start();

    const chirp = () => {
      if (this.mode !== "gen" || this.current !== "forest" || !this.ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1700 + Math.random() * 1600;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.012, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.4);
    };
    this.timers.push(setInterval(chirp, 2800 + Math.random() * 2200));
  }

  layerFire(ctx) {
    const source = this.noise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 280;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();

    const crackle = () => {
      if (!this.ctx || this.current !== "fire") return;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.05 + Math.random() * 0.18, now, 0.03);
    };
    this.timers.push(setInterval(crackle, 140));
  }

  layerCalm(ctx) {
    const notes = [220, 261.63, 329.63, 392, 440];
    const padGain = ctx.createGain();
    padGain.gain.value = 0.045;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    padGain.connect(filter);
    filter.connect(this.master);

    notes.slice(0, 3).forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = index * 4;
      osc.connect(padGain);
      osc.start();
      this.nodes.push(osc);
    });

    let step = 0;
    const playNote = () => {
      if (!this.ctx || this.current !== "calm") return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = notes[step % notes.length];
      step += 1;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.03, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 3.4);
    };
    playNote();
    this.timers.push(setInterval(playNote, 2400));
  }
}
