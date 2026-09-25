// WebAudio synthesized sound effects and chiptune music (no audio files).
(function () {
  'use strict';
  const BM = window.BM;

  const NOTE_INDEX = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  function noteFreq(name) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(name);
    if (!m) return 0;
    let n = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    n += (parseInt(m[3], 10) - 4) * 12;
    return 440 * Math.pow(2, n / 12);
  }

  // Parse "E5:2 G5:2 .:4" into a step-indexed array of { freq, steps }.
  function compile(str) {
    const events = [];
    let step = 0;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, len] = tok.split(':');
      const steps = parseInt(len || '1', 10);
      if (n !== '.') events[step] = { freq: noteFreq(n), steps };
      step += steps;
    }
    events.length = step;
    return { events, len: step };
  }

  // ---- Original compositions -------------------------------------------------
  const SONGS = {
    title: {
      bpm: 118,
      lead: 'G5:4 E5:2 G5:2 C6:8 B5:4 G5:2 B5:2 D6:8 C6:4 A5:2 C6:2 E6:4 D6:4 C6:4 A5:4 G5:8',
      bass: 'C3:8 G3:8 G2:8 D3:8 A2:8 E3:8 F2:8 C3:8',
      drums: 'k.......s.......k.......s.......',
    },
    story: {
      bpm: 150,
      lead:
        'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4 ' +
        'A5:2 C6:2 E6:4 D6:2 C6:2 A5:4 ' +
        'F5:2 A5:2 C6:2 A5:2 G5:4 F5:4 ' +
        'G5:2 B5:2 D6:2 B5:2 G5:4 .:4 ' +
        'C6:2 .:2 C6:2 E6:2 D6:2 C6:2 G5:4 ' +
        'A5:2 .:2 A5:2 C6:2 B5:2 A5:2 E5:4 ' +
        'F5:2 G5:2 A5:2 C6:2 D6:2 C6:2 A5:2 F5:2 ' +
        'G5:4 B5:4 D6:4 .:4',
      bass:
        'C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 ' +
        'A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 ' +
        'F2:2 F3:2 F2:2 F3:2 F2:2 F3:2 F2:2 F3:2 ' +
        'G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 G2:2 G3:2',
      drums: 'k.h.s.h.k.h.s.h.',
    },
    battle: {
      bpm: 168,
      lead:
        'A5:2 C6:2 E6:2 C6:2 A5:2 E5:2 A5:4 ' +
        'F5:2 A5:2 C6:2 A5:2 F5:2 C5:2 F5:4 ' +
        'G5:2 B5:2 D6:2 B5:2 G5:2 D5:2 G5:4 ' +
        'E5:2 G#5:2 B5:2 E6:2 D6:2 B5:2 G#5:4 ' +
        'E6:4 D6:2 C6:2 B5:2 C6:2 A5:4 ' +
        'C6:4 B5:2 A5:2 G5:2 A5:2 F5:4 ' +
        'D6:2 .:2 D6:2 E6:2 D6:2 B5:2 G5:4 ' +
        'E6:2 D6:2 B5:2 G#5:2 E5:8',
      bass:
        'A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 ' +
        'F2:2 F3:2 F2:2 F3:2 F2:2 F3:2 F2:2 F3:2 ' +
        'G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 ' +
        'E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 E2:2 E3:2',
      drums: 'k.h.s.hkk.h.s.hs',
    },
  };
  for (const k in SONGS) {
    const s = SONGS[k];
    s.leadC = compile(s.lead);
    s.bassC = compile(s.bass);
  }

  const Sound = {
    ctx: null,
    master: null,
    sfxBus: null,
    musicBus: null,
    noiseBuf: null,
    pulse: null,
    soundOn: BM.store.get('sound', true),
    musicOn: BM.store.get('music', true),
    song: null,
    songName: null,
    step: 0,
    nextTime: 0,
    timer: null,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.soundOn ? 0.9 : 0;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
      this.musicBus.connect(this.master);

      // White noise buffer for explosions and drums.
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // 25% duty pulse wave for the NES-like lead.
      const N = 32, real = new Float32Array(N), imag = new Float32Array(N);
      const d = 0.25;
      for (let n = 1; n < N; n++) {
        real[n] = Math.sin(2 * Math.PI * n * d) / (n * Math.PI);
        imag[n] = (1 - Math.cos(2 * Math.PI * n * d)) / (n * Math.PI);
      }
      this.pulse = ctx.createPeriodicWave(real, imag);
    },

    unlock() {
      const fresh = !this.ctx;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      if (fresh && this.pending) {
        const p = this.pending;
        this.pending = null;
        this.music(p);
      }
    },

    setSound(on) {
      this.soundOn = on;
      BM.store.set('sound', on);
      if (this.sfxBus) this.sfxBus.gain.value = on ? 0.9 : 0;
    },

    setMusic(on) {
      this.musicOn = on;
      BM.store.set('music', on);
      if (this.musicBus) this.musicBus.gain.value = on ? 0.32 : 0;
    },

    // ---- primitives ---------------------------------------------------------
    tone(freq, dur, o = {}) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      if (o.type === 'pulse') osc.setPeriodicWave(this.pulse);
      else osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
      const vol = o.vol == null ? 0.25 : o.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(o.dest || this.sfxBus);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    noise(dur, o = {}) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = (o.at != null ? o.at : ctx.currentTime) + (o.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.freq || 3000, t);
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
      const g = ctx.createGain();
      const vol = o.vol == null ? 0.4 : o.vol;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(o.dest || this.sfxBus);
      src.start(t);
      src.stop(t + dur + 0.02);
    },

    seq(notes, stepDur, o = {}) {
      notes.forEach((n, i) => {
        if (n) this.tone(noteFreq(n), (o.len || stepDur) * 0.95, { ...o, delay: (o.delay || 0) + i * stepDur });
      });
    },

    // ---- sound effects ------------------------------------------------------
    play(name) {
      if (!this.ctx || !this.soundOn) return;
      switch (name) {
        case 'bomb':
          this.tone(220, 0.08, { type: 'square', slide: 110, vol: 0.18 });
          break;
        case 'explode':
          this.noise(0.7, { freq: 2200, freqEnd: 120, vol: 0.55 });
          this.tone(90, 0.35, { type: 'triangle', slide: 35, vol: 0.5 });
          break;
        case 'brick':
          this.noise(0.15, { freq: 1200, freqEnd: 300, vol: 0.12, filter: 'bandpass' });
          break;
        case 'powerup':
          this.seq(['C6', 'E6', 'G6', 'C7'], 0.055, { type: 'pulse', vol: 0.18 });
          break;
        case 'oneup':
          this.seq(['E6', 'G6', 'E7', 'C7', 'D7', 'G7'], 0.07, { type: 'pulse', vol: 0.18 });
          break;
        case 'burn':
          this.noise(0.3, { freq: 800, freqEnd: 100, vol: 0.2 });
          break;
        case 'die':
          this.tone(880, 0.25, { type: 'square', slide: 440, vol: 0.2 });
          this.tone(660, 0.6, { type: 'square', slide: 80, vol: 0.2, delay: 0.25 });
          break;
        case 'enemyDie':
          this.tone(700, 0.18, { type: 'square', slide: 180, vol: 0.14 });
          break;
        case 'door':
          this.seq(['G5', 'C6', 'E6', 'G6', 'E6', 'G6'], 0.07, { type: 'triangle', vol: 0.35 });
          break;
        case 'kick':
          this.tone(320, 0.07, { type: 'triangle', slide: 140, vol: 0.35 });
          this.noise(0.05, { freq: 2000, vol: 0.15 });
          break;
        case 'select':
          this.tone(988, 0.05, { type: 'pulse', vol: 0.15 });
          this.tone(1319, 0.08, { type: 'pulse', vol: 0.15, delay: 0.05 });
          break;
        case 'move':
          this.tone(740, 0.035, { type: 'pulse', vol: 0.1 });
          break;
        case 'back':
          this.tone(520, 0.08, { type: 'pulse', slide: 330, vol: 0.13 });
          break;
        case 'pause':
          this.seq(['E6', 'C6', 'E6', 'C6'], 0.06, { type: 'pulse', vol: 0.14 });
          break;
        case 'step':
          this.tone(140, 0.025, { type: 'triangle', vol: 0.05 });
          break;
        case 'hurry':
          this.seq(['A6', null, 'A6', null, 'A6', null, 'A6'], 0.08, { type: 'square', vol: 0.12 });
          break;
        case 'crush':
          this.noise(0.25, { freq: 700, freqEnd: 80, vol: 0.35 });
          this.tone(70, 0.2, { type: 'triangle', slide: 40, vol: 0.4 });
          break;
        case 'start':
          this.seq(['C5', 'E5', 'G5', 'C6', null, 'G5', 'C6'], 0.09, { type: 'pulse', vol: 0.18 });
          this.seq(['C3', null, 'G3', null, 'C4'], 0.12, { type: 'triangle', vol: 0.35 });
          break;
        case 'clear':
          this.seq(['C6', 'D6', 'E6', 'G6', null, 'E6', 'G6', null, 'C7'], 0.1, { type: 'pulse', vol: 0.2 });
          this.seq(['C4', null, 'G3', null, 'C4', null, 'G3', null, 'C3'], 0.1, { type: 'triangle', vol: 0.35 });
          break;
        case 'win':
          this.seq(['G5', 'G5', 'G5', 'E6', null, 'D6', 'E6', null, 'G6'], 0.1, { type: 'pulse', vol: 0.2 });
          this.seq(['C3', null, 'E3', null, 'G3', null, 'C4', null, 'C3'], 0.1, { type: 'triangle', vol: 0.35 });
          break;
        case 'gameover':
          this.seq(['G5', 'F#5', 'F5', 'E5', null, 'C5', null, 'G4'], 0.16, { type: 'pulse', vol: 0.2 });
          this.seq(['C3', null, 'B2', null, 'Bb2', null, 'A2', 'G2'], 0.16, { type: 'triangle', vol: 0.35 });
          break;
        case 'time':
          this.seq(['A6', 'E6', 'A6', 'E6', 'A6', 'E6'], 0.08, { type: 'square', vol: 0.14 });
          break;
      }
    },

    // ---- music sequencer ----------------------------------------------------
    music(name) {
      name = name || null;
      if (!this.ctx) {
        this.pending = name; // started on first user gesture (unlock)
        return;
      }
      if (name === this.songName) return;
      this.stopMusic();
      if (!name) return;
      this.songName = name;
      this.song = SONGS[name];
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.08;
      this.timer = setInterval(() => this._schedule(), 25);
    },

    stopMusic() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.song = null;
      this.songName = null;
    },

    _schedule() {
      const ctx = this.ctx, s = this.song;
      if (!ctx || !s) return;
      const stepDur = 60 / s.bpm / 4;
      // Avoid a burst of notes after the tab was in the background.
      if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
      while (this.nextTime < ctx.currentTime + 0.12) {
        const t = this.nextTime - ctx.currentTime;
        const le = s.leadC.events[this.step % s.leadC.len];
        if (le) this.tone(le.freq, le.steps * stepDur * 0.9, { type: 'pulse', vol: 0.16, delay: t, dest: this.musicBus });
        const be = s.bassC.events[this.step % s.bassC.len];
        if (be) this.tone(be.freq, be.steps * stepDur * 0.85, { type: 'triangle', vol: 0.4, delay: t, dest: this.musicBus });
        const dr = s.drums[this.step % s.drums.length];
        if (dr === 'k') this.tone(120, 0.12, { type: 'sine', slide: 45, vol: 0.55, delay: t, dest: this.musicBus });
        else if (dr === 's') this.noise(0.12, { freq: 1800, filter: 'bandpass', vol: 0.35, at: this.nextTime, dest: this.musicBus });
        else if (dr === 'h') this.noise(0.04, { freq: 7000, filter: 'highpass', vol: 0.12, at: this.nextTime, dest: this.musicBus });
        this.step++;
        this.nextTime += stepDur;
      }
    },
  };

  BM.Sound = Sound;
})();
