/* SYNDRUS · interface, presets and the clock. Sound lives in engine.js. */
(function () {
  'use strict';
  const X = window.SyndrusEngine;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const R = (a, b) => a + Math.random() * (b - a);
  const I = (a, b) => Math.floor(R(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const chance = p => Math.random() < p;

  /* ── state ── */
  const drumTrack = (o = {}) => ({ steps: new Array(16).fill(0), level: 0.8, tune: 1, decay: 0.4, delay: 0, reverb: 0.05, prob: 1, mute: false, solo: false, ...o });
  const ring = (o = {}) => ({ steps: 16, pulses: 0, rot: 0, sound: 'bell', deg: 0, octave: 4, wander: false, tune: 1, decay: 0.5, level: 0.6, delay: 0.25, reverb: 0.5, mute: false, ...o });
  function blank() {
    return {
      v: 1, bpm: 128, swing: 0, root: 9, scale: 'minor',
      drums: X.DRUMS.map(() => drumTrack()),
      synth: { steps: Array.from({ length: 16 }, () => ({ on: false, deg: 0, acc: false, slide: false })), octave: 2, gate: 0.55,
        wave1: 'sawtooth', wave2: 'square', detune: 7, oct2: 0, mix1: 0.6, mix2: 0.25, sub: 0.35, noise: 0,
        cutoff: 520, res: 0.6, envAmt: 0.45, fdecay: 0.22, attack: 0.003, decay: 0.25, sustain: 0.3, release: 0.12, glide: 0.07,
        lfoRate: 0.2, lfoDepth: 0, level: 0.7, delay: 0.1, reverb: 0.05, mute: false, chord: 'off', arp: 'off', arpRate: 1, arpOct: 1, latch: false },
      rings: [ring({ sound: 'rim', steps: 16, pulses: 0, level: 0.5, reverb: 0.1, delay: 0.2 }), ring({ steps: 12, deg: 2 }), ring({ steps: 7, deg: 4, octave: 5 }), ring({ sound: 'pluck', steps: 9, deg: 0, octave: 3 })],
      fx: { feedback: 0.42, delayTone: 1800, delayBeats: 0.75, space: 0.45 },   // drive, volume and the DJ filter live in the mixer (app.mix)
    };
  }
  const pat = s => [...s].map(c => (c === 'x' ? 2 : c === 'o' ? 1 : 0));   // x accent, o hit, . rest
  const PRESETS = {
    'Techno 4×4': () => {
      const s = blank(); s.bpm = 130;
      const d = s.drums;
      d[0].steps = pat('x...x...x...x...'); d[0].decay = 0.45;
      d[1].steps = pat('....o.......o...'); d[1].reverb = 0.18;
      d[3].steps = pat('..o...o...o...o.'); d[3].level = 0.6;
      d[4].steps = pat('..............o.'); d[4].level = 0.45;
      d[5].steps = pat('...o..o.....o..o'); d[5].level = 0.45; d[5].delay = 0.3;
      d[7].steps = pat('o.o.o.o.o.o.o.o.'); d[7].level = 0.25; d[7].prob = 0.8;
      line(s, [[0, 0, 1], [2, 0], [3, 0, 0, 1], [4, 7], [6, 0, 1], [7, 0], [10, 3, 0, 1], [11, 2], [14, 0, 1], [15, -2]]);
      s.synth.cutoff = 420; s.synth.res = 0.68; s.synth.envAmt = 0.5;
      s.rings[0] = ring({ sound: 'tom', steps: 16, pulses: 3, rot: 2, tune: 1.3, level: 0.4, delay: 0.35, reverb: 0.15 });
      return s;
    },
    'Rumble hipnótico': () => {
      const s = blank(); s.bpm = 134; s.scale = 'phrygian'; s.root = 2;
      const d = s.drums;
      d[0].steps = pat('x...x...x...x...'); d[0].decay = 0.75; d[0].reverb = 0.35; d[0].tune = 0.92;
      d[3].steps = pat('ooxooxooooxooxoo'); d[3].level = 0.42; d[3].prob = 0.85; d[3].decay = 0.15;
      d[4].steps = pat('..o...o...o...o.'); d[4].level = 0.35;
      d[7].steps = pat('o...o...o...o...'); d[7].level = 0.2;
      line(s, [[1, 0], [2, 0], [3, 0], [5, 0], [6, 0], [7, 0], [9, 0], [10, 0], [11, 1], [13, 0], [14, 0], [15, 0]]);
      Object.assign(s.synth, { wave1: 'sine', wave2: 'triangle', mix1: 0.8, mix2: 0.2, sub: 0.6, cutoff: 220, res: 0.2, envAmt: 0.2, octave: 1, gate: 0.8, reverb: 0.4, delay: 0 });
      s.fx.space = 0.65;
      s.rings[0] = ring({ sound: 'rim', steps: 16, pulses: 5, rot: 1, level: 0.35, delay: 0.45, reverb: 0.3 });
      return s;
    },
    'Ácido': () => {
      const s = blank(); s.bpm = 128; s.root = 4; s.scale = 'minor';
      const d = s.drums;
      d[0].steps = pat('x...x...x...x...'); d[1].steps = pat('....o.......o...');
      d[3].steps = pat('o.o.o.o.o.o.o.o.'); d[3].level = 0.5; d[4].steps = pat('..o...o...o...o.'); d[4].level = 0.4;
      line(s, [[0, 0, 1], [1, 7, 0, 1], [2, 7], [3, 0], [4, 3, 1], [6, 0, 0, 1], [7, 2], [8, 7, 1], [9, 5], [10, 3, 0, 1], [11, 2], [12, 0, 1], [14, -3, 0, 1], [15, 0]]);
      Object.assign(s.synth, { wave1: 'sawtooth', mix2: 0, sub: 0.15, cutoff: 300, res: 0.86, envAmt: 0.7, fdecay: 0.18, lfoRate: 0.07, lfoDepth: 0.12, delay: 0.25 });
      return s;
    },
    'Dub techno': () => {
      const s = blank(); s.bpm = 122; s.scale = 'minor'; s.root = 5;
      const d = s.drums;
      d[0].steps = pat('x...x...x...x...'); d[0].decay = 0.5;
      d[3].steps = pat('..o...o...o...o.'); d[3].level = 0.5; d[3].delay = 0.2;
      d[5].steps = pat('....o.......o...'); d[5].delay = 0.6; d[5].reverb = 0.4; d[5].level = 0.4;
      line(s, [[2, 0], [6, 0], [10, 2], [14, 0]]);
      Object.assign(s.synth, { wave1: 'sawtooth', wave2: 'sawtooth', detune: 12, mix2: 0.5, sub: 0, octave: 3, cutoff: 900, res: 0.35, envAmt: 0.25, fdecay: 0.15, attack: 0.002, decay: 0.15, sustain: 0.1, release: 0.25, gate: 0.25, delay: 0.7, reverb: 0.55, level: 0.55 });
      s.fx = { ...s.fx, feedback: 0.68, delayTone: 900, delayBeats: 0.75, space: 0.8 };
      s.rings[0] = ring({ sound: 'ride', steps: 16, pulses: 7, rot: 0, level: 0.18, reverb: 0.3 });
      return s;
    },
    'Ambient deriva': () => {
      const s = blank(); s.bpm = 84; s.scale = 'lydian'; s.root = 7;
      line(s, [[0, 0], [8, 4]]);
      Object.assign(s.synth, { wave1: 'triangle', wave2: 'sine', mix1: 0.5, mix2: 0.4, sub: 0, octave: 3, cutoff: 1400, res: 0.15, envAmt: 0.1, attack: 0.9, decay: 1, sustain: 0.8, release: 2.5, gate: 6, glide: 0.4, lfoRate: 0.1, lfoDepth: 0.15, level: 0.4, reverb: 0.85, delay: 0.3 });
      s.synth.steps[0].slide = true;
      s.rings = [ring({ sound: 'bell', steps: 7, pulses: 3, deg: 0, octave: 5, wander: true, decay: 0.8, level: 0.5, reverb: 0.8, delay: 0.35 }),
        ring({ sound: 'bell', steps: 12, pulses: 5, rot: 2, deg: 4, octave: 4, wander: true, decay: 0.6, level: 0.45, reverb: 0.75, delay: 0.3 }),
        ring({ sound: 'pluck', steps: 9, pulses: 2, deg: 2, octave: 3, decay: 0.7, level: 0.35, reverb: 0.7, delay: 0.5 }),
        ring({ sound: 'bell', steps: 16, pulses: 1, deg: -3, octave: 3, decay: 1, level: 0.4, reverb: 0.9 })];
      s.drums[7].steps = pat('o.......o.......'); s.drums[7].level = 0.12; s.drums[7].reverb = 0.6;
      s.fx = { ...s.fx, space: 0.95, feedback: 0.55, delayTone: 2400, delayBeats: 1.5 };
      return s;
    },
  };
  // a melody as [step, degree, accent, slide]
  function line(s, notes) { notes.forEach(([i, deg, acc, slide]) => { s.synth.steps[i] = { on: true, deg, acc: !!acc, slide: !!slide }; }); }

  /* ── the random generators ── */
  function randomTechno() {
    const s = blank(); s.bpm = I(124, 136); s.root = I(0, 11); s.scale = pick(['minor', 'phrygian', 'dorian', 'minor']);
    s.swing = chance(0.3) ? R(0.05, 0.2) : 0;
    const d = s.drums;
    d[0].steps = pat('x...x...x...x...'); if (chance(0.25)) d[0].steps[14] = 1; d[0].decay = R(0.3, 0.8); d[0].tune = R(0.9, 1.1); d[0].reverb = chance(0.4) ? R(0.15, 0.4) : 0.03;
    if (chance(0.7)) d[1].steps = pat('....o.......o...'); else d[2].steps = pat('....o.......o...');
    d[3].steps = chance(0.5) ? pat('..o...o...o...o.') : Array.from({ length: 16 }, (_, i) => (i % 4 === 2 ? 2 : chance(0.6) ? 1 : 0));
    d[3].level = R(0.4, 0.65); d[3].decay = R(0.1, 0.5);
    if (chance(0.7)) { d[4].steps = Array.from({ length: 16 }, (_, i) => (i % 4 === 2 && chance(0.5) ? 1 : 0)); d[4].level = 0.4; }
    if (chance(0.7)) { const e = X.euclid(16, pick([3, 5, 7]), I(0, 3)); d[5].steps = e.map(v => v); d[5].level = 0.4; d[5].delay = R(0.1, 0.5); }
    if (chance(0.4)) { d[7].steps = pat('o.o.o.o.o.o.o.o.'); d[7].level = 0.2; d[7].prob = R(0.6, 1); }
    // bassline: offbeat rolls in the scale, a few accents and slides
    const degs = [0, 0, 0, 0, 2, -2, 4, 7, 3];
    for (let i = 0; i < 16; i++) {
      const on = i % 4 === 0 ? chance(0.25) : chance(0.75);
      s.synth.steps[i] = { on, deg: chance(0.6) ? 0 : pick(degs), acc: chance(0.25), slide: chance(0.15) };
    }
    Object.assign(s.synth, { wave1: pick(['sawtooth', 'sawtooth', 'square']), mix2: chance(0.5) ? 0 : R(0.1, 0.4), cutoff: R(220, 900), res: R(0.3, 0.88), envAmt: R(0.2, 0.75), fdecay: R(0.1, 0.35), sub: R(0, 0.5), lfoDepth: chance(0.3) ? R(0.05, 0.2) : 0, delay: chance(0.4) ? R(0.1, 0.4) : 0 });
    if (chance(0.6)) s.rings[0] = ring({ sound: pick(['rim', 'tom', 'clap', 'pluck']), steps: pick([16, 12, 7, 5]), pulses: I(2, 5), rot: I(0, 4), level: 0.35, delay: R(0.2, 0.6), reverb: R(0.1, 0.4), deg: I(0, 4), octave: 4 });
    s.fx = { ...s.fx, feedback: R(0.3, 0.6), delayBeats: pick([0.75, 0.5, 0.375]), space: R(0.25, 0.7) };
    return s;
  }
  function randomAmbient() {
    const s = blank(); s.bpm = I(68, 96); s.root = I(0, 11); s.scale = pick(['lydian', 'major', 'dorian', 'pentaMin', 'minor']);
    const steps = [5, 7, 9, 11, 12, 13, 16];
    s.rings = [0, 1, 2, 3].map(k => ring({ sound: k === 3 ? pick(['pluck', 'bell']) : 'bell', steps: pick(steps), pulses: I(1, 4), rot: I(0, 5), deg: pick([0, 2, 4, 6, -3]), octave: k === 0 ? 5 : k === 3 ? 3 : 4, wander: chance(0.6), decay: R(0.5, 1), level: R(0.3, 0.5), reverb: R(0.6, 0.95), delay: R(0.15, 0.5), mute: k > 1 && chance(0.3) }));
    const a = I(0, 7); line(s, [[0, a], [8, a + pick([2, 4, -1])]]);
    Object.assign(s.synth, { wave1: pick(['triangle', 'sine', 'sawtooth']), wave2: 'sine', mix1: 0.5, mix2: 0.4, sub: 0, octave: 3, cutoff: R(700, 2200), res: R(0.05, 0.3), envAmt: 0.1, attack: R(0.4, 1.5), decay: 1, sustain: 0.8, release: R(1.5, 3.5), gate: R(4, 7.5), glide: R(0.2, 0.8), lfoRate: R(0.05, 0.3), lfoDepth: R(0.05, 0.2), level: 0.35, reverb: R(0.7, 0.95), delay: R(0.1, 0.4), mute: chance(0.2) });
    if (chance(0.5)) { s.drums[7].steps = X.euclid(16, I(1, 3), 0); s.drums[7].level = 0.1; s.drums[7].reverb = 0.6; }
    if (chance(0.35)) { s.drums[0].steps = pat('x...............'); s.drums[0].decay = 1; s.drums[0].level = 0.45; s.drums[0].reverb = 0.5; }
    s.fx = { ...s.fx, space: R(0.8, 1), feedback: R(0.4, 0.65), delayTone: R(1500, 3500), delayBeats: pick([1, 1.5, 0.75]) };
    return s;
  }

  /* ── load / save / share ── */
  const KEY = 'syndrus_v2', OLD_KEY = 'syndrus_v1';
  const deckMix = () => ({ level: 0.9, dj: 0, kill: false, cue: false, mute: { drums: false, synth: false, rings: false } });
  function sane(s) {   // a pattern: fill anything missing from an old or shared one
    const b = blank();
    if (!s || typeof s !== 'object') return b;
    const out = { ...b, ...s, fx: { ...b.fx, ...(s.fx || {}) }, synth: { ...b.synth, ...(s.synth || {}) } };
    out.drums = b.drums.map((t, i) => ({ ...t, ...((s.drums || [])[i] || {}) }));
    out.rings = b.rings.map((r, i) => ({ ...r, ...((s.rings || [])[i] || {}) }));
    out.synth.steps = b.synth.steps.map((x, i) => ({ ...x, ...((s.synth && s.synth.steps || [])[i] || {}) }));
    return out;
  }
  // the whole session: shared tempo, locks, the two decks (A, B), the mixer and a bank of 8 patterns
  function saneApp(a) {
    if (a && !a.decks) {   // an old single pattern (v1) or a shared pattern: it goes to deck A, a copy to B
      const p = sane(a); a = { bpm: p.bpm, swing: p.swing, decks: [p, clone(p)], mix: { drive: (a.fx || {}).drive, volume: (a.fx || {}).volume } };
    }
    a = a && typeof a === 'object' ? a : {};
    const decks = [0, 1].map(i => sane((a.decks || [])[i] || (i ? clone((a.decks || [])[0] || PRESETS['Techno 4×4']()) : PRESETS['Techno 4×4']())));
    const m = a.mix || {};
    return {
      v: 2, bpm: a.bpm || decks[0].bpm || 128, swing: a.swing || 0, lockBpm: !!a.lockBpm, lockKey: !!a.lockKey, edit: a.edit === 1 ? 1 : 0, decks,
      mix: { x: Number.isFinite(m.x) ? m.x : 0, drive: Number.isFinite(m.drive) ? m.drive : 0.12, volume: Number.isFinite(m.volume) ? m.volume : 0.8,
        cueMode: ['off', 'split', 'device'].includes(m.cueMode) ? m.cueMode : 'off', cueBlend: Number.isFinite(m.cueBlend) ? m.cueBlend : 0.25, cueSink: typeof m.cueSink === 'string' ? m.cueSink : '',
        decks: [0, 1].map(i => ({ ...deckMix(), ...((m.decks || [])[i] || {}), mute: { ...deckMix().mute, ...(((m.decks || [])[i] || {}).mute || {}) } })) },
      bank: Array.from({ length: 8 }, (_, i) => ((a.bank || [])[i] ? { name: String(a.bank[i].name || 'Patrón').slice(0, 24), p: sane(a.bank[i].p) } : null)),
    };
  }
  let app;
  try {
    const h = location.hash.match(/^#s=(.+)$/);
    if (h) app = saneApp(JSON.parse(decodeURIComponent(escape(atob(h[1])))));
  } catch (e) { app = null; }
  if (!app) {
    try { const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); app = saneApp(raw ? JSON.parse(raw) : null); }
    catch (e) { app = saneApp(null); }
  }
  let st = app.decks[app.edit];   // the pattern being edited (deck A or B)
  const ab = i => (i ? 'B' : 'A');
  let saveT = 0;
  const save = () => { if (typeof rmPush === 'function') rmPush(); clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(app)); savedAt = Date.now(); } catch (e) { /* full / private */ } }, 300); };
  const toast = (m, ms = 2200) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms); };

  /* ── audio + clock ── */
  let ac = null, E = null, playing = false, nextTime = 0, step = 0, timer = 0;
  const queue = [];
  function ensureAudio() {
    if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); E = X.buildEngine(ac, ac.destination); X.applyMix(E, app); applyCue(); }
    if (ac.state === 'suspended') ac.resume();
  }
  const mix = () => { if (E) X.applyMix(E, app); save(); };
  const deck = () => E.decks[app.edit];
  const pending = [null, null];   // bank patterns waiting for the next bar, per deck
  let roll = null;                 // { start, len } while a Roll button is held
  function tick() {
    const stepDur = 60 / app.bpm / 4, g = X.xfGains(app.mix.x);
    while (nextTime < ac.currentTime + 0.12) {
      if (step % 16 === 0 && (pending[0] || pending[1])) applyPending();
      const t = nextTime + (step % 2 ? app.swing * stepDur * 0.5 : 0);
      const n = roll ? roll.start + ((step - roll.start) % roll.len) : step;   // Roll: repeat a slice of the bar
      app.decks.forEach((p, i) => { if (g[i] > 0.001 || app.mix.decks[i].cue) X.playStep(E.decks[i], { ...p, bpm: app.bpm }, n, t, Math.random, app.mix.decks[i].mute); });
      queue.push({ step: n, t });
      arpTick(step, t, stepDur); clockOut(nextTime, stepDur);
      anchor = { beat: step / 4, time: nextTime, bpm: app.bpm };
      // what NODRUS should feel: kicks, claps/snares and hats of the decks you hear (scaled by the crossfader)
      app.decks.forEach((p, i) => {
        if (g[i] < 0.05 || app.mix.decks[i].mute.drums) return;
        const solo = p.drums.some(x => x.solo);
        p.drums.forEach((tr, k) => {
          const v = tr.steps[n % 16]; if (!v || tr.mute || (solo && !tr.solo)) return;
          const cls = k === 0 ? 0 : (k === 1 || k === 2) ? 1 : (k === 3 || k === 4 || k === 7) ? 2 : -1;
          if (cls >= 0) hits.push({ cls, t, v: g[i] * (v === 2 ? 1 : 0.75) * tr.level });
        });
      });
      nextTime += stepDur; step++;
    }
  }
  function applyPending() {
    [0, 1].forEach(i => {
      if (!pending[i]) return;
      app.decks[i] = sane(clone(pending[i].p)); pending[i] = null;
      if (i === app.edit) { st = app.decks[i]; setTimeout(() => { paintAll(); }, 0); }
    });
    mix(); setTimeout(paintMixer, 0);
  }
  function setPlay(on) {
    ensureAudio();
    playing = on; $('#play').classList.toggle('on', on); $('#play').textContent = on ? '■' : '▶'; rmPush();
    clearInterval(timer);
    if (on) { step = 0; nextTime = ac.currentTime + 0.06; if (midiO.clockOut) midiSend([0xFA], performance.now() + (nextTime - ac.currentTime + latency()) * 1000); tick(); timer = setInterval(tick, 25); }
    else {
      if (midiO.clockOut) midiSend([0xFC]); E.decks.forEach(D => D.synth.noteOff(ac.currentTime)); queue.length = 0; paintNow(-1); if (pending[0] || pending[1]) applyPending(); }
  }
  $('#play').addEventListener('click', () => setPlay(!playing));

  /* ── link to NODRUS: tempo, beat position, audio bands and drops, ~25 times a second.
     Runs on a timer (not on the screen refresh) so it keeps going when this window is behind NODRUS:
     a tab that plays audio is not throttled. ── */
  const linkCh = 'BroadcastChannel' in window ? new BroadcastChannel('pudrus-syndrus') : null;
  let anchor = { beat: 0, time: 0, bpm: 128 }, nodrusSeen = 0, nodrusLink = true, bandBuf = null;
  const hits = [];   // { cls: 0 kick · 1 clap/snare · 2 hats, t (audio time), v }
  const latency = () => (ac ? (ac.outputLatency || ac.baseLatency || 0) : 0);
  function beatAt(T) { return anchor.beat + (T - anchor.time) * anchor.bpm / 60; }
  function linkBands() {
    if (!E) return [0, 0, 0, 0];
    const an = E.analyser; bandBuf = bandBuf || new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bandBuf);
    const hz = ac.sampleRate / an.fftSize;
    const band = (lo, hi) => { let s = 0, n = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(bandBuf.length - 1, Math.ceil(hi / hz)); i++) { s += bandBuf[i]; n++; } return n ? s / n / 255 : 0; };
    return [band(20, 12000), band(20, 150), band(150, 2000), band(2000, 12000)];   // same bands as NODRUS' microphone
  }
  function sendSync() {
    if (!linkCh) return;
    const msg = { type: 'sync', bpm: app.bpm, playing };
    if (ac && playing) { const T = ac.currentTime - latency(); msg.beat = beatAt(T); }
    else msg.beat = 0;
    msg.epoch = performance.timeOrigin + performance.now();
    if (playing && ac) {
      const T = ac.currentTime - latency(), env = [0, 0, 0], DEC = [0.16, 0.12, 0.07];
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        if (T - h.t > 1.2) { hits.splice(i, 1); continue; }
        if (T >= h.t) env[h.cls] = Math.max(env[h.cls], h.v * Math.exp(-(T - h.t) / DEC[h.cls]));
      }
      const b = linkBands();   // the real spectrum fills in what the drums don't say (bass lines, pads)
      msg.bands = [b[0] * 0.7, Math.max(env[0], b[1] * 0.3), Math.max(env[1], b[2] * 0.45), Math.max(env[2], b[3] * 0.5)].map(v => +Math.min(1, v).toFixed(3));
    } else msg.bands = [0, 0, 0, 0];
    linkCh.postMessage(msg);
  }
  if (linkCh) {
    linkCh.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'nodrus') { const was = performance.now() - nodrusSeen < 4000; nodrusSeen = performance.now(); nodrusLink = m.link !== false; if (!was) toast('◈ NODRUS conectado: las visuales siguen esta música'); }
      else if (m.type === 'hello-nodrus') { nodrusSeen = performance.now(); sendSync(); }
    };
    linkCh.postMessage({ type: 'hello-syndrus' });
    setInterval(sendSync, 40);
  }
  function linkFx(kind, t, dur, cut) {   // times on the audio clock → milliseconds from now, as heard
    if (!linkCh || !ac) return;
    linkCh.postMessage({ type: 'fx', kind, delay: Math.max(0, (t - ac.currentTime + latency()) * 1000), dur: (dur || 0) * 1000, cut: (cut || 0) * 1000 });
  }

  /* ── drag parameter widget (like NODRUS) ── */
  function param(label, obj, key, min, max, opts = {}) {
    const w = el('div', 'sy-param' + (opts.wide ? ' wide' : '')), fill = el('div', 'fill'), l = el('span', 'l', label), v = el('span', 'v');
    w.append(fill, l, v);
    const curve = opts.curve || 1, step = opts.step || 0, def = obj[key];
    const toPos = x => Math.pow(Math.max(0, Math.min(1, (x - min) / (max - min))), 1 / curve), toVal = p => min + Math.pow(Math.max(0, Math.min(1, p)), curve) * (max - min);
    const fmt = opts.fmt || (x => (step >= 1 ? String(Math.round(x)) : Math.abs(x) >= 100 ? Math.round(x) : x.toFixed(2)));
    const paint = () => { v.textContent = fmt(obj[key]); fill.style.width = toPos(obj[key]) * 100 + '%'; };
    const set = x => { x = Math.max(min, Math.min(max, x)); if (step) x = Math.round(x / step) * step; obj[key] = x; paint(); (opts.on || mix)(); };
    let drag = null;
    w.addEventListener('pointerdown', e => { if (learnMode) { e.stopPropagation(); armLearn(obj, key, min, max, curve, step, label); w.classList.add('sy-armed'); return; } drag = { x: e.clientX, p: toPos(obj[key]) }; w.setPointerCapture(e.pointerId); });
    w.addEventListener('pointermove', e => { if (!drag) return; set(toVal(drag.p + (e.clientX - drag.x) / 180 * (e.shiftKey ? 0.15 : 1))); });
    w.addEventListener('pointerup', () => { drag = null; });
    w.addEventListener('dblclick', () => set(def));
    w.addEventListener('wheel', e => { e.preventDefault(); set(toVal(toPos(obj[key]) - Math.sign(e.deltaY) * 0.02)); }, { passive: false });
    w.title = 'Arrastrá a los costados · Shift: fino · doble clic: valor inicial · rueda: ajuste';
    w.paint = paint; paint();
    return w;
  }
  function choice(label, obj, key, options, on) {
    const w = el('label', 'sy-sel'), s = el('select');
    options.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; s.append(o); });
    s.value = String(obj[key]);
    s.addEventListener('change', () => { const v = s.value; obj[key] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) || v === '' ? v : +v; (on || mix)(); });
    w.append(el('span', '', label), s); w.paint = () => { s.value = String(obj[key]); };
    return w;
  }

  /* ── layout: phone or desktop ── */
  const mq = matchMedia('(max-width: 760px)');
  const mobile = () => mq.matches;
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => { paintDrums(); paintRings(); });
  const TABS = ['drums', 'synth', 'rings', 'master', 'fx'];
  function setTab(t) {
    if (!TABS.includes(t)) t = 'drums';
    document.body.dataset.tab = t;
    try { sessionStorage.setItem('syndrus_tab', t); } catch (e) { /* ignore */ }
    if (t === 'rings') st.rings.forEach((_, i) => drawRing(i, playing ? curStep : -1));
  }
  document.querySelectorAll('#tabbar [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  // phone: the «⋯» menu holds swing, key, presets, random, export, share
  $('#moreBtn').addEventListener('click', e => { e.stopPropagation(); $('#more').classList.toggle('open'); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#more, #moreBtn')) $('#more').classList.remove('open'); });

  /* ── top bar ── */
  function lockBtn(key, title) {
    const b = el('button', 'sy-lock' + (app[key] ? ' on' : ''), app[key] ? '🔒' : '🔓'); b.title = title;
    b.addEventListener('click', () => { app[key] = !app[key]; b.classList.toggle('on', app[key]); b.textContent = app[key] ? '🔒' : '🔓'; save(); toast(app[key] ? title.replace('Bloquear', 'Bloqueado:') : title.replace('Bloquear', 'Libre:')); });
    return b;
  }
  function paintTop() {
    $('#tempo').innerHTML = ''; $('#swingBox').innerHTML = '';
    const dk = el('div', 'sy-deck'); [0, 1].forEach(i => { const b = el('button', i === app.edit ? 'on' : '', ab(i)); b.title = `Editar el deck ${ab(i)}`; b.addEventListener('click', () => setEdit(i)); dk.append(b); });
    $('#tempo').append(dk, param('BPM', app, 'bpm', 60, 180, { step: 1, on: () => { mix(); } }), lockBtn('lockBpm', 'Bloquear el tempo (los aleatorios y presets no lo cambian)'));
    $('#swingBox').append(param('Swing', app, 'swing', 0, 0.6, { fmt: x => Math.round(x * 100) + '%' }), lockBtn('lockKey', 'Bloquear la tonalidad (los aleatorios y presets la respetan)'));
    $('#root').value = st.root; $('#scale').value = st.scale;
  }
  function setEdit(i) {
    if (i !== app.edit) allNotesOff();
    app.edit = i; st = app.decks[i]; save(); rmPush();
    document.body.dataset.deck = ab(i);
    paintAll(); toast(`Editando el deck ${ab(i)}`, 1200);
  }
  X.NOTE_NAMES.forEach((n, i) => { const o = el('option', '', n); o.value = i; $('#root').append(o); });
  Object.entries(X.SCALE_NAMES).forEach(([k, n]) => { const o = el('option', '', n); o.value = k; $('#scale').append(o); });
  $('#root').addEventListener('change', e => { st.root = +e.target.value; paintSynth(); save(); });
  $('#scale').addEventListener('change', e => { st.scale = e.target.value; paintSynth(); save(); });
  Object.keys(PRESETS).forEach(k => { const o = el('option', '', k); o.value = k; $('#preset').append(o); });
  $('#preset').addEventListener('change', e => { if (PRESETS[e.target.value]) load(PRESETS[e.target.value](), e.target.value); e.target.value = ''; $('#more').classList.remove('open'); });
  $('#rndTechno').addEventListener('click', () => { load(randomTechno(), '🎲 Techno al azar'); $('#more').classList.remove('open'); });
  $('#rndAmbient').addEventListener('click', () => { load(randomAmbient(), '🎲 Ambient al azar'); $('#more').classList.remove('open'); });
  // a preset / random pattern into the deck being edited; the locks keep the tempo and the key
  function load(s, msg) {
    const p = sane(s);
    if (app.lockKey) { p.root = st.root; p.scale = st.scale; }
    if (!app.lockBpm) { app.bpm = p.bpm; app.swing = p.swing; }
    allNotesOff();
    app.decks[app.edit] = p; st = p;
    paintAll(); mix();
    if (msg) toast(`${msg} → deck ${ab(app.edit)} · ${app.bpm} BPM${app.lockBpm ? ' 🔒' : ''} · ${X.NOTE_NAMES[st.root]} ${X.SCALE_NAMES[st.scale].toLowerCase()}${app.lockKey ? ' 🔒' : ''}`);
  }

  /* ── drums: a grid on the desktop, instrument chips + 4×4 pads on the phone ── */
  let selTrack = 0;
  let stepEls = [];
  function hitTrack(i) { const tr = st.drums[i]; ensureAudio(); deck().hit(X.DRUMS[i][0], deck().drumStrips[i].input, ac.currentTime + 0.01, { tune: tr.tune, decay: tr.decay, vel: 0.9 }); }
  function stepButton(tr, k, extra) {
    const b = el('button', 'sy-step' + (Math.floor(k / 4) % 2 ? ' q' : '') + (extra || ''));
    const paint = () => { b.classList.toggle('on', tr.steps[k] === 1); b.classList.toggle('acc', tr.steps[k] === 2); };
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (e.button === 2 || e.shiftKey) tr.steps[k] = tr.steps[k] === 2 ? 1 : 2;
      else tr.steps[k] = tr.steps[k] ? 0 : 1;
      paint(); save(); if (mobile()) paintChips();
    });
    b.addEventListener('contextmenu', e => e.preventDefault());
    paint(); return b;
  }
  function paintChips() {
    const c = $('#drumChips'); c.innerHTML = '';
    X.DRUMS.forEach(([, name], i) => {
      const b = el('button', (i === selTrack ? 'sel' : '') + (st.drums[i].steps.some(Boolean) ? ' has' : ''), name);
      b.addEventListener('click', () => { selTrack = i; hitTrack(i); paintDrums(); });
      c.append(b);
    });
  }
  function paintDrums() {
    const g = $('#drumGrid'); g.innerHTML = ''; stepEls = X.DRUMS.map(() => []);
    if (mobile()) {
      g.className = 'sy-grid pads'; paintChips();
      const tr = st.drums[selTrack];
      for (let k = 0; k < 16; k++) { const b = stepButton(tr, k); g.append(b); stepEls[selTrack].push(b); }
      const bar = el('div', 'sy-padbar'), play = el('button', '', '▶ Oír'), m = el('button', 'm' + (tr.mute ? ' on' : ''), 'Silenciar'), s = el('button', 's' + (tr.solo ? ' on' : ''), 'Solo'), acc = el('button', '', 'Acentos');
      play.addEventListener('click', () => hitTrack(selTrack));
      m.addEventListener('click', () => { tr.mute = !tr.mute; m.classList.toggle('on', tr.mute); save(); });
      s.addEventListener('click', () => { tr.solo = !tr.solo; s.classList.toggle('on', tr.solo); save(); });
      // on a phone there is no Shift: this turns every hit into an accent and back
      acc.addEventListener('click', () => { const any = tr.steps.some(v => v === 2); tr.steps = tr.steps.map(v => (v ? (any ? 1 : 2) : 0)); paintDrums(); save(); });
      bar.append(play, m, s, acc); g.append(bar);
    } else {
      g.className = 'sy-grid';
      X.DRUMS.forEach(([, name], i) => {
        const tr = st.drums[i];
        const nb = el('button', 'sy-name' + (i === selTrack ? ' sel' : ''), name);
        nb.addEventListener('click', () => { selTrack = i; hitTrack(i); paintDrums(); });
        const mb = el('button', 'sy-ms m' + (tr.mute ? ' on' : ''), 'M'); mb.title = 'Silenciar';
        mb.addEventListener('click', () => { tr.mute = !tr.mute; mb.classList.toggle('on', tr.mute); save(); });
        const sb = el('button', 'sy-ms s' + (tr.solo ? ' on' : ''), 'S'); sb.title = 'Solo';
        sb.addEventListener('click', () => { tr.solo = !tr.solo; sb.classList.toggle('on', tr.solo); save(); });
        g.append(nb, mb, sb);
        for (let k = 0; k < 16; k++) { const b = stepButton(tr, k); g.append(b); stepEls[i].push(b); }
      });
    }
    const p = $('#drumParams'); p.innerHTML = '';
    const tr = st.drums[selTrack], head = el('div', 'sy-sel');
    head.append(el('span', '', 'Pista'), el('b', '', X.DRUMS[selTrack][1]));
    p.append(head, param('Volumen', tr, 'level', 0, 1.2), param('Afinación', tr, 'tune', 0.5, 2, { fmt: x => '×' + x.toFixed(2) }), param('Caída', tr, 'decay', 0, 1),
      param('Probab.', tr, 'prob', 0, 1, { fmt: x => Math.round(x * 100) + '%' }), param('→ Delay', tr, 'delay', 0, 1), param('→ Reverb', tr, 'reverb', 0, 1));
  }
  $('#clearDrums').addEventListener('click', () => { st.drums.forEach(t => t.steps.fill(0)); paintDrums(); save(); });

  /* ── synth: sequencer, parameters in tabs, keyboard ── */
  const noteEls = [];
  let synthTab = 'osc';
  function paintSynth() {
    const sq = $('#synthSeq'); sq.innerHTML = ''; noteEls.length = 0;
    const sy = st.synth;
    sy.steps.forEach((s, k) => {
      const col = el('div', 'sy-col'), n = el('div', 'sy-note'), bar = el('div', 'bar'), nm = el('span', 'nm');
      n.append(bar, nm);
      const ab = el('div', 'ab'), a = el('button', 'a', 'A'), sl = el('button', '', 'S');
      const paint = () => {
        n.classList.toggle('on', s.on);
        nm.textContent = s.on ? X.noteName(X.degreeToMidi(st.root, st.scale, s.deg, sy.octave)) : '·';
        bar.style.height = Math.max(4, Math.min(100, 40 + s.deg * 5)) + '%';
        a.classList.toggle('on', s.acc); sl.classList.toggle('on', s.slide);
      };
      let drag = null;
      n.addEventListener('pointerdown', e => { drag = { y: e.clientY, deg: s.deg, moved: false }; n.setPointerCapture(e.pointerId); });
      n.addEventListener('pointermove', e => {
        if (!drag) return; const dy = drag.y - e.clientY;
        if (Math.abs(dy) > 5) drag.moved = true;
        if (!drag.moved) return;
        const d = Math.max(-7, Math.min(14, drag.deg + Math.round(dy / (mobile() ? 12 : 8))));
        if (d !== s.deg) { s.deg = d; s.on = true; paint(); preview(s); save(); }
      });
      n.addEventListener('pointerup', () => { if (drag && !drag.moved) { s.on = !s.on; paint(); if (s.on) preview(s); save(); } drag = null; });
      n.addEventListener('wheel', e => { e.preventDefault(); s.deg = Math.max(-7, Math.min(14, s.deg - Math.sign(e.deltaY))); s.on = true; paint(); preview(s); save(); }, { passive: false });
      a.title = 'Acento'; sl.title = 'Slide (se liga con la nota siguiente)';
      a.addEventListener('click', () => { s.acc = !s.acc; paint(); save(); });
      sl.addEventListener('click', () => { s.slide = !s.slide; paint(); save(); });
      ab.append(a, sl); col.append(n, ab); sq.append(col); noteEls.push(n); paint();
    });
    $('#mSynth').classList.toggle('on', sy.mute);
    const W = [['sawtooth', 'Sierra'], ['square', 'Cuadrada'], ['triangle', 'Triángulo'], ['sine', 'Seno']];
    const GROUPS = {
      osc: ['Osciladores', () => [choice('Onda 1', sy, 'wave1', W), choice('Onda 2', sy, 'wave2', W), param('Osc 1', sy, 'mix1', 0, 1), param('Osc 2', sy, 'mix2', 0, 1),
        param('Desafinar', sy, 'detune', 0, 50, { fmt: x => Math.round(x) + ' ct' }), choice('Octava 2', sy, 'oct2', [[-1, '−1'], [0, '0'], [1, '+1']]), param('Sub', sy, 'sub', 0, 1), param('Ruido', sy, 'noise', 0, 1)]],
      filter: ['Filtro', () => [param('Corte', sy, 'cutoff', 60, 12000, { curve: 3, fmt: x => (x >= 1000 ? (x / 1000).toFixed(1) + 'k' : Math.round(x) + '') }), param('Resonancia', sy, 'res', 0, 1),
        param('Env filtro', sy, 'envAmt', 0, 1), param('Caída filtro', sy, 'fdecay', 0.02, 1.5, { curve: 2 }), param('LFO vel.', sy, 'lfoRate', 0.02, 12, { curve: 3, fmt: x => x.toFixed(2) + ' Hz' }), param('LFO → corte', sy, 'lfoDepth', 0, 1)]],
      env: ['Envolvente', () => [param('Ataque', sy, 'attack', 0.001, 2, { curve: 3 }), param('Caída', sy, 'decay', 0.02, 2, { curve: 2 }), param('Sostén', sy, 'sustain', 0, 1),
        param('Suelta', sy, 'release', 0.01, 4, { curve: 2 }), param('Glide', sy, 'glide', 0.005, 1, { curve: 2 }), param('Largo nota', sy, 'gate', 0.1, 8, { curve: 2, fmt: x => x.toFixed(2) + ' p' })]],
      arp: ['Acordes · arpegio', () => [
        choice('Acorde', sy, 'chord', X.CHORD_NAMES, () => { save(); }),
        choice('Arpegio', sy, 'arp', [['off', 'apagado'], ['up', 'arriba'], ['down', 'abajo'], ['updown', 'ida y vuelta'], ['random', 'al azar'], ['played', 'como se toca']], () => { arpSet = heldN.slice(); arpIdx = -1; save(); }),
        choice('Velocidad', sy, 'arpRate', [[4, '1/4'], [2, '1/8'], [1, '1/16'], [0.5, '1/32']], () => save()),
        choice('Octavas', sy, 'arpOct', [[1, '1'], [2, '2'], [3, '3']], () => save()),
        choice('Mantener', sy, 'latch', [[false, 'no'], [true, 'sí (latch)']], () => { if (!sy.latch) arpSet = heldN.slice(); save(); })]],
      mix: ['Mezcla', () => [choice('Octava', sy, 'octave', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], () => { paintSynth(); save(); }),
        param('Volumen', sy, 'level', 0, 1.2), param('→ Delay', sy, 'delay', 0, 1), param('→ Reverb', sy, 'reverb', 0, 1)]],
    };
    const tabs = $('#synthTabs'); tabs.innerHTML = '';
    Object.entries(GROUPS).forEach(([k, [label]]) => { const b = el('button', k === synthTab ? 'on' : '', label); b.addEventListener('click', () => { synthTab = k; paintSynth(); }); tabs.append(b); });
    const p = $('#synthParams'); p.innerHTML = ''; GROUPS[synthTab][1]().forEach(x => p.append(x));
    paintKeys();
  }
  function preview(s) {
    if (playing) return;
    ensureAudio(); const t = ac.currentTime + 0.01;
    const sy = st.synth, vel = s.acc ? 1.3 : 1;
    if (sy.chord && sy.chord !== 'off') { deck().synth.poly(t, X.chordNotes(st.root, st.scale, s.deg, sy.octave, sy.chord), 0.25, vel); return; }
    deck().synth.noteOn(t, X.degreeToMidi(st.root, st.scale, s.deg, sy.octave), vel, false); deck().synth.noteOff(t + 0.18);
  }
  $('#mSynth').addEventListener('click', () => { st.synth.mute = !st.synth.mute; $('#mSynth').classList.toggle('on', st.synth.mute); save(); });
  $('#clearSynth').addEventListener('click', () => { st.synth.steps.forEach(s => { s.on = false; s.acc = false; s.slide = false; }); paintSynth(); save(); });

  // on-screen and computer keyboard
  const KEYMAP = 'awsedftgyhujkolp';
  let kbOct = 0; const held = [];
  function paintKeys() {
    const k = $('#keys'); k.innerHTML = '';
    const sc = X.SCALES[st.scale], n = mobile() ? 13 : 25;
    for (let i = 0; i < n; i++) {
      const pc = (st.root + i) % 12, b = el('div', 'sy-key' + ([1, 3, 6, 8, 10].includes(pc) ? ' blk' : '') + (sc.includes(i % 12) ? ' scale' : '') + (i % 12 === 0 ? ' root' : ''));
      b.dataset.i = i;
      b.addEventListener('pointerdown', e => { e.preventDefault(); press(i); b.setPointerCapture(e.pointerId); });
      b.addEventListener('pointerup', () => release(i)); b.addEventListener('pointercancel', () => release(i));
      k.append(b);
    }
  }
  const keyMidi = i => 12 * (st.synth.octave + 1 + kbOct) + st.root + i;
  const keyBase = () => 12 * (st.synth.octave + 1 + kbOct) + st.root;
  const keyNote = new Map();   // key → the MIDI note it started
  function press(i) { if (keyNote.has(i)) return; const m = keyMidi(i); keyNote.set(i, m); noteDown(m, 0.8); const k = document.querySelector(`.sy-key[data-i="${i}"]`); if (k) k.classList.add('on'); }
  function release(i) { if (!keyNote.has(i)) return; noteUp(keyNote.get(i)); keyNote.delete(i); const k = document.querySelector(`.sy-key[data-i="${i}"]`); if (k) k.classList.remove('on'); }

  /* ── playing notes (computer keys, the screen keyboard, MIDI): mono line, chords, or the arpeggiator ── */
  const heldN = [];            // MIDI notes held now, in the order they were played
  let arpSet = [], arpIdx = 0, arpDir = 1, chordVoices = new Map(), arpWarned = false;
  const arpOn = () => st.synth.arp && st.synth.arp !== 'off';
  // a played note → its chord in the scale (or just the note)
  const chordOf = m => (st.synth.chord && st.synth.chord !== 'off'
    ? X.chordNotes(st.root, st.scale, X.midiToDegree(st.root, st.scale, m, st.synth.octave), st.synth.octave, st.synth.chord)
    : [m]);
  function noteDown(m, vel = 0.8) {
    ensureAudio(); if (heldN.includes(m)) return;
    const first = heldN.length === 0; heldN.push(m);
    const D = deck(), now = ac.currentTime + 0.005, acc = vel > 0.85 ? 1.3 : 1;
    if (arpOn()) {
      if (st.synth.latch && first) arpSet = [];   // latch: a new chord replaces the held one
      if (!arpSet.length) { arpIdx = -1; arpDir = 1; }   // a fresh arpeggio starts from its first note
      if (!arpSet.includes(m)) arpSet.push(m);
      if (!playing) { if (!arpWarned) { toast('El arpegiador sigue el tempo: dale ▶ (Espacio)'); arpWarned = true; } D.synth.noteOn(now, m, acc, false); D.synth.noteOff(now + 0.25); }
      return;
    }
    if (st.synth.chord && st.synth.chord !== 'off') { chordVoices.set(m, { D, v: D.synth.polyOn(now, chordOf(m), acc) }); return; }
    D.synth.noteOn(now, m, acc, !first);
  }
  function noteUp(m) {
    const j = heldN.indexOf(m); if (j < 0) return; heldN.splice(j, 1);
    const D = E && deck(); if (!D) return;
    const now = ac.currentTime + 0.005;
    if (arpOn()) { if (!st.synth.latch) arpSet = arpSet.filter(x => x !== m); return; }
    if (chordVoices.has(m)) { const c = chordVoices.get(m); c.D.synth.polyOff(c.v, now); chordVoices.delete(m); return; }
    if (heldN.length) D.synth.noteOn(now, heldN[heldN.length - 1], 1, true);
    else D.synth.noteOff(now);
  }
  function allNotesOff() {
    heldN.length = 0; arpSet = []; arpIdx = -1; arpDir = 1; keyNote.clear();
    document.querySelectorAll('.sy-key.on').forEach(k => k.classList.remove('on'));
    if (!E) { chordVoices.clear(); return; }
    const now = ac.currentTime + 0.005;
    chordVoices.forEach(c => c.D.synth.polyOff(c.v, now)); chordVoices.clear();
    E.decks.forEach(D => D.synth.noteOff(now));
  }
  // the arpeggiator plays on the clock (tick): which note comes next
  function arpNext() {
    const sy = st.synth;
    let notes = [];
    arpSet.forEach(m => chordOf(m).forEach(x => { for (let o = 0; o < (sy.arpOct || 1); o++) notes.push(x + 12 * o); }));
    if (!notes.length) return null;
    if (sy.arp !== 'played') notes = [...new Set(notes)].sort((a, b) => a - b);
    const n = notes.length;
    if (sy.arp === 'random') return notes[Math.floor(Math.random() * n)];
    if (sy.arp === 'down') { arpIdx = (arpIdx + 1) % n; return notes[n - 1 - arpIdx]; }
    if (sy.arp === 'updown') {
      if (n === 1) return notes[0];
      arpIdx += arpDir; if (arpIdx >= n - 1) { arpIdx = n - 1; arpDir = -1; } else if (arpIdx <= 0) { arpIdx = 0; arpDir = 1; }
      return notes[arpIdx];
    }
    arpIdx = (arpIdx + 1) % n; return notes[arpIdx];   // up / played
  }
  function arpTick(n, t, stepDur) {
    if (!arpOn() || !arpSet.length) return;
    const r = st.synth.arpRate || 1, D = deck();
    const play = tt => { const m = arpNext(); if (m == null) return; D.synth.noteOn(tt, m, 1, false); D.synth.noteOff(tt + stepDur * r * 0.75); };
    if (r < 1) { play(t); play(t + stepDur / 2); }
    else if (n % r === 0) play(t);
  }

  /* ── rings: canvas + parameters in tabs (Ritmo · Tono · Mezcla); one at a time on the phone ── */
  const ringCanvases = [], ringTab = ['ritmo', 'ritmo', 'ritmo', 'ritmo'];
  let curRing = 0;
  function paintRingChips() {
    const c = $('#ringChips'); c.innerHTML = '';
    st.rings.forEach((r, i) => { const b = el('button', 'sy-mini' + (i === curRing ? ' cur' : ''), String(i + 1)); b.addEventListener('click', () => { curRing = i; paintRings(); }); c.append(b); });
  }
  function paintRings() {
    const box = $('#rings'); box.innerHTML = ''; ringCanvases.length = 0;
    paintRingChips();
    st.rings.forEach((r, i) => {
      const w = el('div', 'sy-ring' + (i === curRing ? ' cur' : '')), top = el('div', 'top'), cvb = el('div', 'cvbox'), cv = el('canvas');
      cv.width = cv.height = 440; cvb.append(cv);
      const mute = el('button', 'sy-mini' + (r.mute ? ' on' : ''), 'M'); mute.title = 'Silenciar';
      mute.addEventListener('click', () => { r.mute = !r.mute; mute.classList.toggle('on', r.mute); drawRing(i, -1); save(); });
      const tabs = el('div', 'tabs');
      [['ritmo', 'Ritmo'], ['tono', 'Tono'], ['mezcla', 'Mezcla']].forEach(([k, l]) => { const b = el('button', ringTab[i] === k ? 'on' : '', l); b.addEventListener('click', () => { ringTab[i] = k; paintRings(); }); tabs.append(b); });
      top.append(el('b', '', '◎ ' + (i + 1)), tabs, el('span', 'sy-sp'), mute);
      const ps = el('div', 'sy-params'), redraw = () => drawRing(i, -1);
      const SOUNDS = [['bell', 'Campana'], ['pluck', 'Pluck'], ...X.DRUMS.map(([k, n]) => [k, n])];
      const T = ringTab[i];
      if (T === 'ritmo') ps.append(
        param('Pasos', r, 'steps', 2, 32, { step: 1, on: () => { r.pulses = Math.min(r.pulses, r.steps); r.rot %= r.steps; redraw(); save(); } }),
        param('Golpes', r, 'pulses', 0, 32, { step: 1, on: () => { r.pulses = Math.min(r.pulses, r.steps); redraw(); save(); } }),
        param('Giro', r, 'rot', 0, 31, { step: 1, on: () => { r.rot %= r.steps; redraw(); save(); } }));
      else if (T === 'tono') ps.append(
        choice('Sonido', r, 'sound', SOUNDS, () => { redraw(); save(); }),
        param('Nota', r, 'deg', -7, 14, { step: 1, fmt: x => X.noteName(X.degreeToMidi(st.root, st.scale, Math.round(x), r.octave)), on: save }),
        choice('Octava', r, 'octave', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], save),
        choice('Melodía', r, 'wander', [[false, 'fija'], [true, 'errante']], save),
        param('Caída', r, 'decay', 0, 1), param('Afinación', r, 'tune', 0.5, 2, { fmt: x => '×' + x.toFixed(2) }));
      else ps.append(param('Volumen', r, 'level', 0, 1.2), param('→ Delay', r, 'delay', 0, 1), param('→ Reverb', r, 'reverb', 0, 1));
      w.append(top, cvb, ps); box.append(w); ringCanvases.push(cv);
      drawRing(i, -1);
    });
  }
  function drawRing(i, n) {
    const cv = ringCanvases[i]; if (!cv) return;
    const r = st.rings[i], g = cv.getContext('2d'), S = cv.width, c = S / 2, rad = S * 0.4;
    const pat = X.euclid(r.steps, Math.min(r.pulses, r.steps), r.rot), cur = n >= 0 ? n % r.steps : -1;
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,212,255,0.18)'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, rad, 0, 7); g.stroke();
    const pts = pat.map((v, k) => (v ? [c + rad * Math.cos(k / r.steps * 6.2832 - 1.5708), c + rad * Math.sin(k / r.steps * 6.2832 - 1.5708)] : null)).filter(Boolean);
    if (pts.length > 1) { g.strokeStyle = 'rgba(102,255,51,0.35)'; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke(); }
    pat.forEach((v, k) => {
      const a = k / r.steps * 6.2832 - 1.5708, x = c + rad * Math.cos(a), y = c + rad * Math.sin(a), now = k === cur;
      g.beginPath(); g.arc(x, y, v ? S * 0.045 : S * 0.02, 0, 7);
      g.fillStyle = now ? '#ffffff' : v ? (r.mute ? '#2b5a37' : '#66ff33') : '#1d2a3a';
      if (now && v && !r.mute) { g.shadowColor = '#66ff33'; g.shadowBlur = 30; }
      g.fill(); g.shadowBlur = 0;
    });
    if (cur >= 0) { const a = cur / r.steps * 6.2832 - 1.5708; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(c, c); g.lineTo(c + rad * 0.82 * Math.cos(a), c + rad * 0.82 * Math.sin(a)); g.stroke(); }
    g.fillStyle = 'rgba(208,239,255,0.6)'; g.font = `600 ${S * 0.08}px "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${Math.min(r.pulses, r.steps)}/${r.steps}`, c, c);
  }

  /* ── mixer: crossfader, the two decks, the bank, the edited deck's effects, master ── */
  let bankSave = false;
  function paintMixer() {
    const box = $('#mixer'); if (!box) return;
    box.innerHTML = '';
    const M = app.mix;
    const xfp = param('Crossfader', M, 'x', 0, 1, { wide: true, fmt: x => (x < 0.02 ? 'A' : x > 0.98 ? 'B' : `A ${Math.round((1 - x) * 100)} · ${Math.round(x * 100)} B`) });
    xfp.classList.add('sy-xf');
    const cut = el('div', 'sy-xfbtns');
    [['A', 0], ['½', 0.5], ['B', 1]].forEach(([l, v]) => { const b = el('button', 'sy-mini', l); b.addEventListener('click', () => { M.x = v; xfp.paint(); mix(); }); cut.append(b); });
    box.append(xfp, cut);
    const cols = el('div', 'sy-decks');
    [0, 1].forEach(i => {
      const d = M.decks[i], c = el('div', 'sy-deckcol' + (i === app.edit ? ' edit' : ''));
      const h = el('div', 'sy-deckhead'), name = el('b', '', ab(i)), info = el('span', 'sy-dim', `${X.NOTE_NAMES[app.decks[i].root]} ${X.SCALE_NAMES[app.decks[i].scale].toLowerCase()}`);
      const edit = el('button', 'sy-mini' + (i === app.edit ? ' cur' : ''), i === app.edit ? 'editando' : 'editar'); edit.addEventListener('click', () => setEdit(i));
      h.append(name, info, el('span', 'sy-sp'), edit);
      const kill = el('button', 'sy-mini' + (d.kill ? ' on' : ''), 'Graves ✕'); kill.title = 'Cortar los graves de este deck (para cambiar de bajo sin que choquen)';
      kill.addEventListener('click', () => { d.kill = !d.kill; kill.classList.toggle('on', d.kill); mix(); });
      const mutes = el('div', 'sy-mutes');
      [['drums', 'Ritmo'], ['synth', 'Synth'], ['rings', 'Anillos']].forEach(([k, l]) => { const b = el('button', 'sy-mini' + (d.mute[k] ? ' on' : ''), l); b.title = 'Silenciar este grupo en el deck ' + ab(i); b.addEventListener('click', () => { d.mute[k] = !d.mute[k]; b.classList.toggle('on', d.mute[k]); save(); }); mutes.append(b); });
      const ps = el('div', 'sy-params');
      ps.append(param('Volumen', d, 'level', 0, 1.2), param('Filtro', d, 'dj', -1, 1, { fmt: x => (Math.abs(x) < 0.02 ? 'abierto' : x < 0 ? 'LP ' + Math.round(-x * 100) + '%' : 'HP ' + Math.round(x * 100) + '%') }));
      const cueB = el('button', 'sy-mini sy-cuebtn' + (d.cue ? ' on' : ''), '🎧 Cue'); cueB.title = 'Escuchar este deck en los auriculares (antes del crossfader)';
      cueB.addEventListener('click', () => {
        d.cue = !d.cue; cueB.classList.toggle('on', d.cue);
        if (d.cue && app.mix.cueMode === 'off') { app.mix.cueMode = 'split'; applyCue(); paintMixer(); toast('Cue en «mitad y mitad»: auricular izquierdo = cue, derecho = master. Si tenés otra salida, elegila en «Cue»', 5000); }
        mix();
      });
      const row2 = el('div', 'sy-mutes'); row2.append(kill, cueB);
      c.append(h, ps, row2, mutes); cols.append(c);
    });
    box.append(cols);
    // where the cue goes
    const cueRow = el('div', 'sy-cue'), cs = el('label', 'sy-sel'), sel = el('select');
    [['off', 'apagado'], ['split', 'auriculares: izq cue · der master']].concat(outDevices.map(dv => ['dev:' + dv.deviceId, '🎧 ' + (dv.label || 'salida')]), canSink() ? [['pick', '🎧 Elegir otra salida…']] : []).forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sel.append(o); });
    sel.value = M.cueMode === 'device' && outDevices.some(d => d.deviceId === M.cueSink) ? 'dev:' + M.cueSink : M.cueMode === 'device' ? 'off' : M.cueMode;
    sel.addEventListener('change', async () => {
      const v = sel.value;
      if (v === 'pick') {
        toast('El navegador va a pedir permiso de micrófono sólo para mostrar el nombre de tus salidas (no se usa)', 5000);
        const ok = await listOutputs(true);
        if (!ok) toast('No encontré otra salida de audio: conectá los auriculares o la placa y volvé a probar', 5000);
        paintMixer(); return;
      }
      if (v.startsWith('dev:')) { M.cueMode = 'device'; M.cueSink = v.slice(4); } else { M.cueMode = v; M.cueSink = ''; }
      await applyCue(); save();
      const dv = outDevices.find(d => d.deviceId === M.cueSink);
      toast(M.cueMode === 'device' ? '🎧 Cue → ' + (dv ? dv.label : 'otra salida') + ' · el master sigue por la salida normal' : M.cueMode === 'split' ? '🎧 Auriculares en la salida normal: izquierda = cue, derecha = master' : 'Cue apagado', 4000);
    });
    cs.append(el('span', '', 'Cue'), sel);
    const test = el('button', 'sy-mini', '🔊 Probar'); test.title = 'Un pitido sólo por el cue: así sabés por dónde sale';
    test.addEventListener('click', () => { ensureAudio(); if (app.mix.cueMode === 'off') { toast('Elegí primero dónde sale el cue'); return; } E.cueTest(ac.currentTime + 0.05); });
    cueRow.append(cs, test, param('Mezcla cue', M, 'cueBlend', 0, 1, { fmt: x => (x < 0.05 ? 'solo cue' : Math.round(x * 100) + '% master'), on: () => { applyCue(); save(); } }));
    box.append(cueRow);
    const tools = el('div', 'sy-xfbtns');
    const cAB = el('button', 'sy-mini', 'A → B'), cBA = el('button', 'sy-mini', 'B → A'), sw = el('button', 'sy-mini', 'A ⇄ B'); sw.title = 'Intercambiar los decks';
    cAB.addEventListener('click', () => { app.decks[1] = clone(app.decks[0]); st = app.decks[app.edit]; paintAll(); mix(); toast('A copiado en B'); });
    cBA.addEventListener('click', () => { app.decks[0] = clone(app.decks[1]); st = app.decks[app.edit]; paintAll(); mix(); toast('B copiado en A'); });
    sw.addEventListener('click', () => { allNotesOff(); app.decks.reverse(); app.mix.decks.reverse(); pending.reverse(); st = app.decks[app.edit]; paintAll(); mix(); toast('Decks intercambiados'); });
    tools.append(cAB, cBA, sw); box.append(tools);
    // bank
    const bh = el('div', 'sy-subhead'), bs = el('button', 'sy-mini' + (bankSave ? ' on' : ''), bankSave ? 'Elegí un lugar' : 'Guardar');
    bs.title = 'Guardar el deck que editás en un lugar del banco'; bs.addEventListener('click', () => { bankSave = !bankSave; paintMixer(); });
    bh.append(el('b', '', 'BANCO'), el('span', 'sy-dim', playing ? `entra en el próximo compás · deck ${ab(app.edit)}` : `se carga en el deck ${ab(app.edit)}`), el('span', 'sy-sp'), bs);
    const bank = el('div', 'sy-bank');
    app.bank.forEach((slot, k) => {
      const q = pending.some(x => x && x.k === k);
      const b = el('button', 'sy-slot' + (slot ? ' full' : '') + (q ? ' queued' : ''), slot ? slot.name : String(k + 1));
      b.title = slot ? `${slot.name} · clic: cargar en el deck ${ab(app.edit)} · doble clic: borrar` : 'Vacío';
      b.addEventListener('click', () => {
        if (bankSave) {
          const nm = `${k + 1} · ${X.NOTE_NAMES[st.root]} ${st.drums[0].steps.some(Boolean) ? 'beat' : 'amb'}`;
          app.bank[k] = { name: nm, p: clone(st) }; bankSave = false; save(); paintMixer(); toast(`Deck ${ab(app.edit)} guardado en el lugar ${k + 1}`); return;
        }
        if (!slot) return;
        if (playing) { pending[app.edit] = { k, p: slot.p }; toast(`«${slot.name}» entra en el deck ${ab(app.edit)} en el próximo compás`); paintMixer(); }
        else { pending[app.edit] = { k, p: slot.p }; applyPending(); toast(`«${slot.name}» cargado en el deck ${ab(app.edit)}`); }
      });
      b.addEventListener('dblclick', () => { if (slot && !bankSave && confirm(`¿Borrar «${slot.name}» del banco?`)) { app.bank[k] = null; save(); paintMixer(); } });
      bank.append(b);
    });
    box.append(bh, bank);
  }
  // headphones on another output: Chrome / Edge can send audio to a chosen device
  let outDevices = [];
  // Chrome only names the outputs (and gives their real ids) once the page has audio permission:
  // «Elegir otra salida…» asks for it once (the microphone itself is not used) and lists the real devices
  const canSink = () => !!(navigator.mediaDevices && HTMLMediaElement.prototype.setSinkId);
  async function listOutputs(ask) {
    if (!canSink()) return false;
    try {
      let ds = await navigator.mediaDevices.enumerateDevices();
      const named = () => ds.some(d => d.kind === 'audiooutput' && d.deviceId && d.label);
      if (!named() && ask) {
        const sm = await navigator.mediaDevices.getUserMedia({ audio: true });
        sm.getTracks().forEach(t => t.stop());
        ds = await navigator.mediaDevices.enumerateDevices();
      }
      outDevices = ds.filter(d => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
      return outDevices.length > 0;
    } catch (e) { return false; }
  }
  async function applyCue() {
    if (!E) return;
    const M = app.mix, ok = await E.setCue(M.cueMode, M.cueBlend, M.cueSink);
    if (!ok) toast('No se pudo usar esa salida para el cue: probá «mitad y mitad»', 4000);
  }

  /* ── FX panel: performance (risers, drop, impact, roll), the edited deck's effects, master ── */
  let fxTab = 'perf', fxBars = 4;
  const armed = new Set();
  function nextBarTime() {   // when the next bar starts on the audio clock (now if stopped)
    if (!playing) return ac.currentTime + 0.03;
    const stepDur = 60 / app.bpm / 4, k = Math.ceil(step / 16) * 16;
    return nextTime + (k - step) * stepDur;
  }
  function perform(kind, btn) {
    ensureAudio();
    const t = nextBarTime(), bar = 60 / app.bpm * 4, beat = 60 / app.bpm, dur = fxBars * bar;
    if (kind === 'drop' && !playing) { toast('Dale play primero: el drop sigue al compás'); return; }
    if (kind === 'up') E.riser(t, dur);
    else if (kind === 'down') E.downer(t, Math.min(dur, bar * 2));
    else if (kind === 'impact') E.impact(t);
    else if (kind === 'drop') E.drop(t, dur, beat);
    linkFx(kind, t, kind === 'down' ? Math.min(dur, bar * 2) : dur, dur - beat);
    // the button blinks until it starts, then glows while it lasts
    const wait = Math.max(0, (t - ac.currentTime) * 1000), len = kind === 'impact' ? 400 : kind === 'down' ? Math.min(dur, bar * 2) * 1000 : dur * 1000;
    btn.classList.add('armed'); armed.add(kind);
    setTimeout(() => { btn.classList.remove('armed'); btn.classList.add('live'); }, wait);
    setTimeout(() => { btn.classList.remove('live'); armed.delete(kind); }, wait + len);
    if (playing && wait > 60) toast(`${btn.textContent.replace(/\n/g, ' ')} entra en el próximo compás${kind === 'drop' ? ` · ${fxBars} compás${fxBars > 1 ? 'es' : ''} de subida y corte` : ''}`, 1600);
  }
  function paintFx() {
    const tabs = $('#fxTabs'); tabs.innerHTML = '';
    [['perf', 'Actuación'], ['deck', 'Deck ' + ab(app.edit)], ['master', 'Master']].forEach(([k, l]) => { const b = el('button', k === fxTab ? 'on' : '', l); b.addEventListener('click', () => { fxTab = k; paintFx(); }); tabs.append(b); });
    const body = $('#fxBody'); body.innerHTML = '';
    if (fxTab === 'perf') {
      const seg = el('div', 'sy-seg'); seg.append(el('span', '', 'Largo'));
      [1, 2, 4, 8].forEach(n => { const b = el('button', n === fxBars ? 'on' : '', n + (n === 1 ? ' compás' : ' c')); b.addEventListener('click', () => { fxBars = n; paintFx(); }); seg.append(b); });
      const perf = el('div', 'sy-perf');
      [['up', '↗\nSubida', 'Barrido de ruido que sube (para preparar un drop)'], ['down', '↘\nBajada', 'Barrido que baja (para salir de un drop)'], ['impact', '💥\nImpacto', 'Golpe de sub con explosión'], ['drop', '⤓\nDROP', 'Drop automático: el filtro sube, el último tiempo corta y en el uno vuelve todo con un impacto']].forEach(([k, l, tt]) => {
        const b = el('button', k === 'drop' ? 'drop' : ''); b.title = tt; b.dataset.k = k; b.style.whiteSpace = 'pre-line'; b.textContent = l.replace('\\n', '\n');
        if (armed.has(k)) b.classList.add('armed');
        b.addEventListener('click', () => perform(k, b)); perf.append(b);
      });
      const rolls = el('div', 'sy-rolls'); rolls.append(el('span', '', 'Roll'));
      [['1/4', 4], ['1/8', 2], ['1/16', 1]].forEach(([l, len]) => {
        const b = el('button', '', l); b.title = 'Mantené apretado: repite ese pedazo del compás';
        const on = e => { e.preventDefault(); if (!playing) return; roll = { start: step, len }; b.classList.add('on'); b.setPointerCapture && e.pointerId !== undefined && b.setPointerCapture(e.pointerId); };
        const off = () => { roll = null; b.classList.remove('on'); };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
        rolls.append(b);
      });
      const cancel = el('button', 'sy-mini', '✕'); cancel.title = 'Cancelar el drop y abrir el filtro';
      cancel.addEventListener('click', () => { if (E) { E.cancelFx(); linkFx('cancel', ac.currentTime); } });
      rolls.append(cancel);
      body.append(seg, perf, rolls);
    } else if (fxTab === 'deck') {
      const fx = st.fx, p = el('div', 'sy-params');
      p.append(choice('Delay', fx, 'delayBeats', [[0.25, '1/16'], [0.375, '1/16 ·'], [0.5, '1/8'], [0.75, '1/8 ·'], [1, '1/4'], [1.5, '1/4 ·']]),
        param('Repeticiones', fx, 'feedback', 0, 0.92), param('Tono delay', fx, 'delayTone', 300, 6000, { curve: 2, fmt: x => Math.round(x) + ' Hz' }), param('Espacio', fx, 'space', 0, 1));
      body.append(p);
    } else {
      const p = el('div', 'sy-params');
      p.append(param('Saturación', app.mix, 'drive', 0, 1), param('Volumen', app.mix, 'volume', 0, 1.2));
      body.append(p);
    }
    paintMixer();
  }

  /* ── console: every fader of the edited deck as vertical strips, with live meters; decks + master on the right ── */
  const conEl = $('#console');
  let conMeters = [];   // [{ an, el }]
  function vfader(obj, key, min, max, cls, onSet, fmtV, learnLabel) {
    const w = el('div', 'sy-vf' + (cls ? ' ' + cls : '')), th = el('div', 'thumb'); w.append(th);
    const def = obj[key], val = el('div', 'val');
    const paint = () => { const p = (obj[key] - min) / (max - min); th.style.top = (8 + (1 - p) * (w.clientHeight - 16)) + 'px'; val.textContent = fmtV ? fmtV(obj[key]) : (obj[key] <= 0.001 ? '−∞' : (20 * Math.log10(obj[key])).toFixed(1) + ' dB'); };
    const set = y => { const r = w.getBoundingClientRect(), p = 1 - (y - r.top - 8) / Math.max(1, r.height - 16); obj[key] = Math.round(Math.max(min, Math.min(max, min + p * (max - min))) * 1000) / 1000; paint(); (onSet || mix)(); };
    let drag = false;
    w.addEventListener('pointerdown', e => { if (learnMode) { armLearn(obj, key, min, max, 1, 0, learnLabel || (key === 'volume' ? 'Volumen master' : 'Fader')); w.classList.add('sy-armed'); return; } drag = true; try { w.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } set(e.clientY); });
    w.addEventListener('pointermove', e => { if (drag) set(e.clientY); });
    w.addEventListener('pointerup', () => { drag = false; });
    w.addEventListener('dblclick', () => { obj[key] = def; paint(); (onSet || mix)(); });
    w.addEventListener('wheel', e => { e.preventDefault(); obj[key] = Math.max(min, Math.min(max, obj[key] - Math.sign(e.deltaY) * (max - min) / 50)); paint(); (onSet || mix)(); }, { passive: false });
    w.paint = paint; w.val = val;
    requestAnimationFrame(paint);
    return w;
  }
  function knob(label, obj, key, min, max, fmt, learnLabel) {
    const w = el('div', 'sy-knob'), f = el('div', 'fill'), l = el('span', 'l', label), v = el('span', 'v');
    w.append(f, l, v);
    const paint = () => { f.style.width = ((obj[key] - min) / (max - min)) * 100 + '%'; v.textContent = fmt ? fmt(obj[key]) : Math.round(obj[key] * 100) + '%'; };
    let drag = null;
    w.addEventListener('pointerdown', e => { if (learnMode) { armLearn(obj, key, min, max, 1, 0, learnLabel || label); w.classList.add('sy-armed'); return; } drag = { x: e.clientX, v: obj[key] }; try { w.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } });
    w.addEventListener('pointermove', e => { if (!drag) return; obj[key] = Math.max(min, Math.min(max, drag.v + (e.clientX - drag.x) / 120 * (max - min))); paint(); mix(); });
    w.addEventListener('pointerup', () => { drag = null; });
    paint(); return w;
  }
  function strip(name, grp, ch, an, cls, solo) {
    const s = el('div', 'sy-strip' + (cls ? ' ' + cls : ''));
    const fw = el('div', 'sy-faderwrap'), mt = el('div', 'sy-meter'), mi = el('i'); mt.append(mi);
    const vf = vfader(ch, 'level', 0, 1.2, '', null, null, name + ' · volumen');
    fw.append(vf, mt);
    const btns = el('div', 'btns'), m = el('button', 'm' + (ch.mute ? ' on' : ''), 'M');
    m.addEventListener('click', () => { ch.mute = !ch.mute; m.classList.toggle('on', ch.mute); save(); paintDrums(); paintSynth(); paintRings(); });
    btns.append(m);
    if (solo) { const sb = el('button', 's' + (ch.solo ? ' on' : ''), 'S'); sb.addEventListener('click', () => { ch.solo = !ch.solo; sb.classList.toggle('on', ch.solo); save(); paintDrums(); }); btns.append(sb); }
    s.append(el('div', 'grp', grp), el('div', 'nm', name), knob('Dly', ch, 'delay', 0, 1, null, name + ' → delay'), knob('Rev', ch, 'reverb', 0, 1, null, name + ' → reverb'), fw, vf.val, btns);
    conMeters.push({ an: () => an(), el: mi });
    return s;
  }
  function paintConsole() {
    if (conEl.hidden) return;
    conMeters = [];
    const dk = $('#conDeck'); dk.innerHTML = '';
    [0, 1].forEach(i => { const b = el('button', i === app.edit ? 'on' : '', ab(i)); b.addEventListener('click', () => { setEdit(i); paintConsole(); }); dk.append(b); });
    const box = $('#strips'); box.innerHTML = '';
    const D = () => (E ? E.decks[app.edit] : null);
    X.DRUMS.forEach(([, name], i) => box.append(strip(name, 'ritmo', st.drums[i], () => D() && D().drumStrips[i].an, '', true)));
    box.append(strip('Synth', 'synth', st.synth, () => D() && D().synthStrip.an, 'grp-synth sep'));
    st.rings.forEach((r, i) => box.append(strip('Anillo ' + (i + 1), 'anillo', r, () => D() && D().ringStrips[i].an, 'grp-rings' + (i ? '' : ' sep'))));
    // decks + crossfader + master
    const mb = $('#conMaster'); mb.innerHTML = '';
    [0, 1].forEach(i => {
      const d = app.mix.decks[i], s = el('div', 'sy-strip'), fw = el('div', 'sy-faderwrap'), mt = el('div', 'sy-meter'), mi = el('i'); mt.append(mi);
      const vf = vfader(d, 'level', 0, 1.2, 'deck' + ab(i), null, null, 'Deck ' + ab(i) + ' · volumen'); fw.append(vf, mt);
      const kill = el('button', d.kill ? 'on m' : 'm', 'Graves ✕'); kill.title = 'Cortar los graves del deck'; kill.addEventListener('click', () => { d.kill = !d.kill; kill.classList.toggle('on', d.kill); mix(); paintMixer(); });
      const cue = el('button', d.cue ? 'on s' : 's', '🎧'); cue.title = 'Cue'; cue.addEventListener('click', () => { d.cue = !d.cue; cue.classList.toggle('on', d.cue); if (d.cue && app.mix.cueMode === 'off') { app.mix.cueMode = 'split'; applyCue(); } mix(); paintMixer(); });
      const btns = el('div', 'btns'); btns.append(kill, cue);
      s.append(el('div', 'grp', 'deck'), el('div', 'nm', ab(i)), knob('Filtro', d, 'dj', -1, 1, x => (Math.abs(x) < 0.02 ? '—' : x < 0 ? 'LP' : 'HP'), 'Deck ' + ab(i) + ' · filtro'), fw, vf.val, btns);
      conMeters.push({ an: () => E && E.decks[i].an, el: mi });
      mb.append(s);
    });
    const xw = el('div', 'sy-xfwrap'), lbls = el('div', 'lbls'), xf = el('div', 'sy-xfh'), th = el('div', 'thumb'); xf.append(th);
    lbls.append(el('b', '', 'A'), el('span', 'sy-dim', 'crossfader'), el('b', '', 'B'));
    const paintX = () => { th.style.left = (8 + app.mix.x * (xf.clientWidth - 16)) + 'px'; };
    let dx = false; const setX = cx => { const r = xf.getBoundingClientRect(); app.mix.x = Math.max(0, Math.min(1, (cx - r.left - 8) / Math.max(1, r.width - 16))); paintX(); mix(); };
    xf.addEventListener('pointerdown', e => { if (learnMode) { armLearn(app.mix, 'x', 0, 1, 1, 0, 'Crossfader'); xf.classList.add('sy-armed'); return; } dx = true; try { xf.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } setX(e.clientX); });
    xf.addEventListener('pointermove', e => { if (dx) setX(e.clientX); }); xf.addEventListener('pointerup', () => { dx = false; });
    const qb = el('div', 'sy-xfbtns'); [['A', 0], ['½', 0.5], ['B', 1]].forEach(([l, v]) => { const b = el('button', 'sy-mini', l); b.addEventListener('click', () => { app.mix.x = v; paintX(); mix(); }); qb.append(b); });
    xw.append(lbls, xf, qb); requestAnimationFrame(paintX);
    const ms = el('div', 'sy-strip'), fw = el('div', 'sy-faderwrap'), mt = el('div', 'sy-meter'), mi = el('i'); mt.append(mi);
    const mv = vfader(app.mix, 'volume', 0, 1.2, 'master'); fw.append(mv, mt);
    ms.append(el('div', 'grp', 'master'), el('div', 'nm', 'Salida'), knob('Satur.', app.mix, 'drive', 0, 1, null, 'Saturación master'), fw, mv.val);
    conMeters.push({ an: () => E && E.analyser, el: mi, big: true });
    mb.append(xw, ms);
  }
  const meterBuf = new Float32Array(256);
  function paintMeters() {
    if (conEl.hidden || !E) return;
    for (const m of conMeters) {
      const an = m.an(); if (!an) continue;
      const buf = an.fftSize === 256 ? meterBuf : (m.buf || (m.buf = new Float32Array(an.fftSize)));
      an.getFloatTimeDomainData(buf);
      let pk = 0; for (let i = 0; i < buf.length; i += 2) pk = Math.max(pk, Math.abs(buf[i]));
      const db = pk > 0 ? 20 * Math.log10(pk) : -60, h = Math.max(0, Math.min(1, (db + 48) / 48));
      m.lv = Math.max(h, (m.lv || 0) * 0.86); m.el.style.height = (m.lv * 100) + '%';
    }
  }
  function setConsole(on) {
    conEl.hidden = !on; $('#consoleBtn').classList.toggle('on', on);
    if (on) { ensureAudio(); paintConsole(); }
  }
  $('#consoleBtn').addEventListener('click', () => { setConsole(conEl.hidden); $('#more').classList.remove('open'); });
  $('#conClose').addEventListener('click', () => setConsole(false));
  addEventListener('resize', () => { if (!conEl.hidden) paintConsole(); });

  /* ── phone remote: the console, the mixer and the FX from a phone (like NODRUS' control).
     Web: PeerJS (internet only to connect) · desktop app: WebSocket over the wifi ── */
  const DESK = window.nodrusDesktop || null;
  const rmPhones = new Set();
  let rmPeer = null, deskInfo = null;
  let rmRoom = (() => { try { return localStorage.getItem('syndrus_room') || ''; } catch (e) { return ''; } })();
  if (!/^syndrus-[a-z0-9]{8,32}$/.test(rmRoom)) { rmRoom = 'syndrus-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join(''); try { localStorage.setItem('syndrus_room', rmRoom); } catch (e) { /* ignore */ } }
  const rmUrl = () => (DESK && deskInfo ? deskInfo.lanUrl + '/lab/syndrus/control/?ws' : new URL('control/#' + rmRoom, location.href).href);
  const loadScript = src => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
  function rmStatus(t) { const e = $('#rmStatus'); if (e) e.textContent = t; $('#remoteBtn').classList.toggle('on', rmPhones.size > 0); }
  const chList = () => [...st.drums.map((d, i) => ({ c: d, n: X.DRUMS[i][1], g: 'ritmo', solo: true })), { c: st.synth, n: 'Synth', g: 'synth' }, ...st.rings.map((r, i) => ({ c: r, n: 'Anillo ' + (i + 1), g: 'anillo' }))];
  function rmState() {
    return { t: 'state', playing, bpm: app.bpm, edit: app.edit, fxBars,
      keys: app.decks.map(p => `${X.NOTE_NAMES[p.root]} ${X.SCALE_NAMES[p.scale].toLowerCase()}`),
      ch: chList().map(({ c, n, g, solo }) => ({ n, g, level: c.level, mute: !!c.mute, solo: solo ? !!c.solo : null, delay: c.delay, reverb: c.reverb })),
      mix: { x: app.mix.x, volume: app.mix.volume, decks: app.mix.decks.map(d => ({ level: d.level, dj: d.dj, kill: !!d.kill, cue: !!d.cue })) } };
  }
  let rmT = 0;
  var rmReady = false;   // var: readable (false) even before this block runs
  function rmPush() {
    if (!rmReady || !rmPhones.size) return;
    clearTimeout(rmT); rmT = setTimeout(() => { const s = rmState(); rmPhones.forEach(p => { try { p.send(s); } catch (e) { /* closed */ } }); }, 80);
  }
  // meters for the phone: the 13 channels of the edited deck, deck A, deck B, master
  const rmBuf = new Float32Array(2048);
  const peakOf = an => { if (!an) return 0; const b = an.fftSize === 2048 ? rmBuf : new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let p = 0; for (let i = 0; i < b.length; i += 2) p = Math.max(p, Math.abs(b[i])); return p > 0 ? Math.max(0, Math.min(1, (20 * Math.log10(p) + 48) / 48)) : 0; };
  setInterval(() => {
    if (!rmPhones.size || !E) return;
    const D = E.decks[app.edit];
    const v = [...D.drumStrips.map(s => s.an), D.synthStrip.an, ...D.ringStrips.map(s => s.an), E.decks[0].an, E.decks[1].an, E.analyser].map(an => +peakOf(an).toFixed(2));
    rmPhones.forEach(p => { try { p.send({ t: 'meters', v }); } catch (e) { /* closed */ } });
  }, 90);
  let rmPaintT = 0;
  const rmRepaint = () => { clearTimeout(rmPaintT); rmPaintT = setTimeout(() => { paintAll(); }, 250); };
  function rmMsg(m) {
    if (!m || typeof m !== 'object') return;
    const num = x => typeof x === 'number' && Number.isFinite(x), clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const list = chList();
    if (m.t === 'hello') { rmPush(); return; }
    if (m.t === 'ch' && list[m.i] && ['level', 'delay', 'reverb'].includes(m.k) && num(m.v)) { list[m.i].c[m.k] = clamp(m.v, 0, m.k === 'level' ? 1.2 : 1); mix(); rmRepaint(); }
    else if (m.t === 'mute' && list[m.i]) { list[m.i].c.mute = !list[m.i].c.mute; save(); rmRepaint(); }
    else if (m.t === 'solo' && list[m.i] && list[m.i].solo) { list[m.i].c.solo = !list[m.i].c.solo; save(); rmRepaint(); }
    else if (m.t === 'deck' && app.mix.decks[m.i]) {
      const d = app.mix.decks[m.i];
      if (m.k === 'level' && num(m.v)) d.level = clamp(m.v, 0, 1.2);
      else if (m.k === 'dj' && num(m.v)) d.dj = clamp(m.v, -1, 1);
      else if (m.k === 'kill') d.kill = !d.kill;
      else if (m.k === 'cue') { d.cue = !d.cue; if (d.cue && app.mix.cueMode === 'off') { app.mix.cueMode = 'split'; applyCue(); } }
      mix(); rmRepaint();
    }
    else if (m.t === 'mix' && ['x', 'volume'].includes(m.k) && num(m.v)) { app.mix[m.k] = clamp(m.v, 0, m.k === 'x' ? 1 : 1.2); mix(); rmRepaint(); }
    else if (m.t === 'play') setPlay(!playing);
    else if (m.t === 'edit' && (m.i === 0 || m.i === 1)) setEdit(m.i);
    else if (m.t === 'fx' && ['up', 'down', 'impact', 'drop'].includes(m.k)) perform(m.k, document.querySelector(`.sy-perf button[data-k="${m.k}"]`) || document.createElement('button'));
    else if (m.t === 'cancel') { if (E) { E.cancelFx(); linkFx('cancel', ac.currentTime); } }
    else if (m.t === 'bars' && [1, 2, 4, 8].includes(m.n)) { fxBars = m.n; paintFx(); }
    else if (m.t === 'roll') roll = playing && [1, 2, 4].includes(m.len) ? { start: step, len: m.len } : null;
    rmPush();
  }
  async function startRemote() {
    if (rmPeer) return;
    if (DESK) {
      rmPeer = { desktop: true };
      try { deskInfo = await DESK.info(); } catch (e) { deskInfo = null; }
      const byId = new Map();
      DESK.onRemote(m => {
        if (m.type === 'open') { const c = { send: msg => DESK.sendRemote(m.id, msg) }; byId.set(m.id, c); rmPhones.add(c); c.send(rmState()); rmStatus(`${rmPhones.size} celular(es) conectado(s) por wifi`); toast('📱 Celular conectado'); }
        else if (m.type === 'msg') rmMsg(m.msg);
        else if (m.type === 'close') { const c = byId.get(m.id); if (c) { rmPhones.delete(c); byId.delete(m.id); } rmStatus(rmPhones.size ? `${rmPhones.size} celular(es) conectado(s)` : 'Celular desconectado · esperando…'); }
      });
      rmStatus('Listo: escaneá el código (mismo wifi que esta compu)');
      return;
    }
    try { if (!window.Peer) await loadScript('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'); }
    catch (e) { rmStatus('No se pudo cargar la conexión (¿hay internet?)'); return; }
    rmStatus('Conectando…');
    rmPeer = new window.Peer(rmRoom, { debug: 0 });
    rmPeer.on('open', () => rmStatus(rmPhones.size ? `${rmPhones.size} celular(es) conectado(s)` : 'Listo: escaneá el código con el celular'));
    rmPeer.on('disconnected', () => { rmStatus('Reconectando…'); setTimeout(() => { try { rmPeer.reconnect(); } catch (e) { /* later */ } }, 1500); });
    rmPeer.on('error', err => { if (err.type !== 'peer-unavailable') rmStatus(err.type === 'unavailable-id' ? 'Este control ya está abierto en otra pestaña' : 'Error de conexión: ' + err.type); });
    rmPeer.on('connection', conn => {
      const c = { send: msg => { if (conn.open) conn.send(msg); } };
      conn.on('open', () => { rmPhones.add(c); c.send(rmState()); rmStatus(`${rmPhones.size} celular(es) conectado(s)`); toast('📱 Celular conectado'); });
      conn.on('data', rmMsg);
      const gone = () => { if (rmPhones.delete(c)) rmStatus(rmPhones.size ? `${rmPhones.size} celular(es) conectado(s)` : 'Celular desconectado · esperando…'); };
      conn.on('close', gone); conn.on('error', gone);
    });
  }
  async function openRemote() {
    $('#remotePop').hidden = false; $('#more').classList.remove('open');
    await startRemote();
    const url = rmUrl();
    $('#rmUrl').href = $('#rmUrl').textContent = url;
    const box = $('#rmQR');
    if (box.dataset.url !== url) {
      try {
        if (!window.qrcode) await loadScript(DESK ? '/vendor/qrcode.js' : 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js');
        const q = window.qrcode(0, 'M'); q.addData(url); q.make();
        box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); box.dataset.url = url;
      } catch (e) { box.textContent = 'No se pudo generar el QR: abrí el enlace en el celular.'; }
    }
  }
  $('#remoteBtn').addEventListener('click', () => { if ($('#remotePop').hidden) openRemote(); else $('#remotePop').hidden = true; });
  $('#rmClose').addEventListener('click', () => { $('#remotePop').hidden = true; });
  rmReady = true;
  if (app.mix.cueMode === 'device') listOutputs(false).then(() => { paintMixer(); applyCue(); });   // restore a saved headphone output
  if (DESK) startRemote();   // desktop app: phones on the wifi can join at any moment
  $('#rmCopy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText($('#rmUrl').href).then(() => toast('Enlace copiado'), () => {}); });

  /* ── MIDI: notes play the synth, «Aprender» maps knobs/faders of your controller to any control, and the clock
     (follow your DAW's tempo and play/stop, or send SYNDRUS' clock) ── */
  const MIDI_KEY = 'syndrus_midi';
  const midiO = (() => { try { return Object.assign({ notes: true, clockIn: false, clockOut: false, out: '', map: {} }, JSON.parse(localStorage.getItem(MIDI_KEY) || '{}')); } catch (e) { return { notes: true, clockIn: false, clockOut: false, out: '', map: {} }; } })();
  const saveMidi = () => { try { localStorage.setItem(MIDI_KEY, JSON.stringify(midiO)); } catch (e) { /* ignore */ } };
  let midiAcc = null, learnMode = false, learnArmed = null;
  const clockTimes = [];
  // a control → a description that survives deck changes and reloads, and back
  function describe(obj, key, min, max, curve, stepV) {
    const base = { key, min, max, curve: curve || 1, step: stepV || 0 };
    if (obj === app) return { k: 'app', ...base };
    if (obj === app.mix) return { k: 'mix', ...base };
    let i = app.mix.decks.indexOf(obj); if (i >= 0) return { k: 'dmix', i, ...base };
    if (obj === st.synth) return { k: 'synth', ...base };
    if (obj === st.fx) return { k: 'fx', ...base };
    i = st.drums.indexOf(obj); if (i >= 0) return { k: 'drum', i, ...base };
    i = st.rings.indexOf(obj); if (i >= 0) return { k: 'ring', i, ...base };
    return null;
  }
  function resolve(d) {
    return d.k === 'app' ? app : d.k === 'mix' ? app.mix : d.k === 'dmix' ? app.mix.decks[d.i] : d.k === 'synth' ? st.synth : d.k === 'fx' ? st.fx : d.k === 'drum' ? st.drums[d.i] : d.k === 'ring' ? st.rings[d.i] : null;
  }
  function armLearn(obj, key, min, max, curve, stepV, label) {
    const d = describe(obj, key, min, max, curve, stepV);
    if (!d) { toast('Ese control no se puede asignar'); return; }
    learnArmed = { ...d, label: label || key };
    document.querySelectorAll('.sy-armed').forEach(x => x.classList.remove('sy-armed'));
    toast(`🎹 «${learnArmed.label}» · ahora mové una perilla o fader de tu controlador`, 4000);
  }
  let ccPaint = 0;
  function applyCC(d, v01) {
    const obj = resolve(d); if (!obj) return;
    let v = d.min + (d.max - d.min) * Math.pow(v01, d.curve || 1);
    if (d.step) v = Math.round(v / d.step) * d.step;
    obj[d.key] = v; mix();
    clearTimeout(ccPaint); ccPaint = setTimeout(paintAll, 160);
  }
  function midiOuts() { return midiAcc ? [...midiAcc.outputs.values()].filter(o => !midiO.out || o.id === midiO.out) : []; }
  function midiSend(bytes, ts) { midiOuts().forEach(o => { try { o.send(bytes, ts); } catch (e) { /* port gone */ } }); }
  function onMidi(e) {
    const [s0, d1, d2] = e.data, type = s0 & 0xF0, ch = s0 & 0x0F;
    if (s0 === 0xF8) { if (midiO.clockIn) clockTick(e.timeStamp); return; }
    if (s0 === 0xFA || s0 === 0xFB) { if (midiO.clockIn && !playing) setPlay(true); return; }
    if (s0 === 0xFC) { if (midiO.clockIn && playing) setPlay(false); return; }
    if (type === 0x90 && d2 > 0) { if (midiO.notes) noteDown(d1, d2 / 127); flashMidi(); }
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) { if (midiO.notes) noteUp(d1); }
    else if (type === 0xB0) {
      const key = `cc:${ch}:${d1}`;
      if (learnArmed) { midiO.map[key] = learnArmed; toast(`🎹 CC ${d1} (canal ${ch + 1}) → «${learnArmed.label}»`); learnArmed = null; saveMidi(); paintMidi(); return; }
      const d = midiO.map[key]; if (d) applyCC(d, d2 / 127);
      flashMidi();
    }
  }
  function clockTick(ts) {   // 24 pulses per beat → tempo
    clockTimes.push(ts); if (clockTimes.length > 49) clockTimes.shift();
    if (clockTimes.length < 25) return;
    const iv = (clockTimes[clockTimes.length - 1] - clockTimes[0]) / (clockTimes.length - 1), bpm = Math.round(60000 / (iv * 24) * 10) / 10;
    if (bpm >= 40 && bpm <= 240 && Math.abs(bpm - app.bpm) > 0.25) { app.bpm = bpm; mix(); clearTimeout(ccPaint); ccPaint = setTimeout(paintAll, 300); }
  }
  // the clock out rides on the scheduler: 6 pulses per 16th, stamped on the audio time
  function clockOut(t, stepDur) {
    if (!midiO.clockOut || !midiAcc) return;
    const base = performance.now() + (t - ac.currentTime + latency()) * 1000;
    for (let k = 0; k < 6; k++) midiSend([0xF8], base + k * stepDur * 1000 / 6);
  }
  let flashT = 0;
  function flashMidi() { const b = $('#midiBtn'); b.classList.add('rx'); clearTimeout(flashT); flashT = setTimeout(() => b.classList.remove('rx'), 120); }
  async function midiInit() {
    if (midiAcc) return true;
    if (!navigator.requestMIDIAccess) { toast('Este navegador no tiene MIDI: probá con Chrome o Edge (o la app de escritorio)', 5000); return false; }
    try { midiAcc = await navigator.requestMIDIAccess({ sysex: false }); }
    catch (e) { toast('No se pudo usar MIDI (permiso denegado)'); return false; }
    const hook = () => { midiAcc.inputs.forEach(i => { i.onmidimessage = onMidi; }); paintMidi(); };
    midiAcc.onstatechange = hook; hook();
    try { localStorage.setItem('syndrus_midi_on', '1'); } catch (e) { /* ignore */ }
    return true;
  }
  function paintMidi() {
    const box = $('#midiBody'); if (!box) return;
    box.innerHTML = '';
    if (!midiAcc) { const b = el('button', 'sy-btn', '🎹 Activar MIDI'); b.addEventListener('click', async () => { await midiInit(); paintMidi(); }); box.append(el('p', 'sy-dim', 'Conectá tu teclado o controlador por USB y activalo. El navegador puede pedir permiso.'), b); return; }
    const ins = [...midiAcc.inputs.values()], outs = [...midiAcc.outputs.values()];
    box.append(el('p', ins.length ? 'ok' : 'sy-dim', ins.length ? '🎹 Entradas: ' + ins.map(i => i.name).join(', ') : 'No hay dispositivos MIDI conectados'));
    const chk = (label, key, tip) => { const l = el('label', 'sy-chk'), c = el('input'); c.type = 'checkbox'; c.checked = !!midiO[key]; c.addEventListener('change', () => { midiO[key] = c.checked; saveMidi(); if (key === 'clockOut' && playing) midiSend([c.checked ? 0xFA : 0xFC]); }); l.title = tip || ''; l.append(c, document.createTextNode(' ' + label)); return l; };
    box.append(chk('Las notas tocan el synth (con acordes y arpegiador)', 'notes'), chk('Seguir el reloj de afuera (tempo y play/stop de tu DAW)', 'clockIn'), chk('Mandar el reloj de SYNDRUS (para que tu DAW o tus máquinas sigan)', 'clockOut'));
    const os = el('select'); [['', 'todas las salidas'], ...outs.map(o => [o.id, o.name])].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; os.append(o); });
    os.value = midiO.out; os.addEventListener('change', () => { midiO.out = os.value; saveMidi(); });
    const orow = el('label', 'sy-sel'); orow.append(el('span', '', 'Salida del reloj'), os); box.append(orow);
    const n = Object.keys(midiO.map).length;
    const lb = el('button', 'sy-btn' + (learnMode ? ' on' : ''), learnMode ? '✓ Aprendiendo: tocá un control y mové una perilla' : '🎹 Aprender MIDI');
    lb.addEventListener('click', () => { learnMode = !learnMode; learnArmed = null; document.body.classList.toggle('sy-learning', learnMode); paintMidi(); if (learnMode) toast('Tocá cualquier control (fader, perilla, crossfader) y después mové una perilla de tu controlador', 5000); });
    const clr = el('button', 'sy-btn', `Borrar asignaciones (${n})`); clr.disabled = !n;
    clr.addEventListener('click', () => { if (confirm('¿Borrar todas las asignaciones MIDI?')) { midiO.map = {}; saveMidi(); paintMidi(); } });
    const row = el('div', 'sy-group'); row.append(lb, clr); box.append(row);
    if (n) box.append(el('p', 'sy-dim', Object.entries(midiO.map).map(([k, d]) => `CC ${k.split(':')[2]} → ${d.label}`).join(' · ')));
  }
  $('#midiBtn').addEventListener('click', () => { const p = $('#midiPop'); p.hidden = !p.hidden; $('#more').classList.remove('open'); if (!p.hidden) paintMidi(); });
  $('#midiClose').addEventListener('click', () => { $('#midiPop').hidden = true; });
  try { if (localStorage.getItem('syndrus_midi_on')) midiInit(); } catch (e) { /* ignore */ }   // permission already given: reconnect

  /* ── status bar ── */
  const gcd = (a, b) => (b ? gcd(b, a % b) : a), lcm = (a, b) => a / gcd(a, b) * b;
  let peakHold = 0, clipAt = -1e9, savedAt = 0;
  function paintStatus() {
    const pos = curStep >= 0 && playing ? `${Math.floor(curStep / 16) + 1}.${Math.floor(curStep % 16 / 4) + 1}.${curStep % 4 + 1}` : '—';
    const active = st.rings.filter(r => !r.mute && r.pulses > 0).map(r => r.steps);
    const cyc = active.reduce(lcm, 16), cycTxt = active.length ? `${cyc} pasos (${+(cyc / 16).toFixed(2)} compás${cyc > 16 ? 'es' : ''})` : '—';
    const db = peakHold > 0 ? 20 * Math.log10(peakHold) : -Infinity, clip = performance.now() - clipAt < 1500;
    const lat = ac ? Math.round(((ac.baseLatency || 0) + (ac.outputLatency || 0)) * 1000) : 0;
    const out = [
      `<span class="${playing ? 'ok' : ''}">${playing ? '▶ sonando' : '■ parado'}</span>`,
      `pos <b>${pos}</b>`,
      `<b>${app.bpm}</b> BPM${app.lockBpm ? ' 🔒' : ''}${app.swing > 0.01 ? ' · swing ' + Math.round(app.swing * 100) + '%' : ''}`,
      `editás <b>${ab(app.edit)}</b> · mezcla ${app.mix.x < 0.02 ? 'A' : app.mix.x > 0.98 ? 'B' : `A${Math.round((1 - app.mix.x) * 100)}/B${Math.round(app.mix.x * 100)}`}${pending.some(Boolean) ? ' · <span class="warn">cambio en espera</span>' : ''}`,
      `<span class="lo">${X.NOTE_NAMES[st.root]} ${X.SCALE_NAMES[st.scale].toLowerCase()}</span>`,
      `<span class="lo">ciclo de los anillos <b>${cycTxt}</b></span>`,
      `<span class="meter" title="Pico de salida"><i style="width:${Math.max(0, Math.min(1, (db + 48) / 48)) * 100}%"></i></span> ${isFinite(db) ? db.toFixed(1) + ' dB' : '−∞'}${clip ? ' <span class="clip">CLIP</span>' : ''}`,
      performance.now() - nodrusSeen < 4000 ? `<span class="ok">◈ NODRUS ${nodrusLink ? 'sigue esta música' : 'conectado (sin seguir)'}</span>` : '<span class="lo">◈ NODRUS sin abrir</span>',
      `<span class="lo">${ac ? `${(ac.sampleRate / 1000).toFixed(1)} kHz · latencia ${lat} ms` : 'audio apagado (tocá ▶)'}</span>`,
      `<span class="lo ${Date.now() - savedAt < 2500 ? 'ok' : ''}">${Date.now() - savedAt < 2500 ? 'guardado ✓' : 'guardado en este navegador'}</span>`,
    ];
    // each item carries its own separator, so hidden ones (phone) leave no stray dots
    $('#status').innerHTML = out.map(x => (x.startsWith('<span class="lo') ? x.replace('<span class="lo', '<span class="it lo') : `<span class="it">${x}</span>`)).join('');
    peakHold *= 0.6;
  }
  setInterval(paintStatus, 250);

  /* ── what plays now (the clock schedules ahead; the screen follows the audio time) ── */
  let curStep = -1;
  function paintNow(n) {
    const k = n < 0 ? -1 : n % 16;
    stepEls.forEach(row => row.forEach((b, j) => b.classList.toggle('now', j === k)));
    noteEls.forEach((b, j) => b.classList.toggle('now', j === k));
    st.rings.forEach((_, i) => drawRing(i, n));
  }
  const scope = $('#scope'), sg = scope.getContext('2d');
  let wave = null, spec = null;
  function frame() {
    requestAnimationFrame(frame);
    paintMeters();
    if (ac && playing) {
      while (queue.length && queue[0].t <= ac.currentTime) { curStep = queue.shift().step; paintNow(curStep); }
    }
    // scope: spectrum bars + waveform
    const Wd = scope.width, Hd = scope.height;
    sg.fillStyle = 'rgba(3,3,6,0.55)'; sg.fillRect(0, 0, Wd, Hd);
    if (!E) return;
    const an = E.analyser;
    if (!wave) { wave = new Float32Array(an.fftSize); spec = new Uint8Array(an.frequencyBinCount); }
    an.getByteFrequencyData(spec);
    const bars = 64;
    for (let b = 0; b < bars; b++) {
      const i0 = Math.floor(Math.pow(b / bars, 2) * spec.length * 0.7), i1 = Math.max(i0 + 1, Math.floor(Math.pow((b + 1) / bars, 2) * spec.length * 0.7));
      let v = 0; for (let i = i0; i < i1; i++) v = Math.max(v, spec[i]);
      const h = v / 255 * Hd * 0.9, x = b * Wd / bars;
      sg.fillStyle = b < bars * 0.2 ? 'rgba(102,255,51,0.55)' : b < bars * 0.6 ? 'rgba(0,212,255,0.45)' : 'rgba(255,63,164,0.45)';
      sg.fillRect(x + 1, Hd - h, Wd / bars - 2, h);
    }
    an.getFloatTimeDomainData(wave);
    { let mx = 0; for (let i = 0; i < wave.length; i += 2) mx = Math.max(mx, Math.abs(wave[i])); peakHold = Math.max(peakHold, mx); if (mx >= 0.99) clipAt = performance.now(); }
    sg.strokeStyle = '#66ff33'; sg.lineWidth = 2; sg.shadowColor = '#66ff33'; sg.shadowBlur = 8; sg.beginPath();
    for (let i = 0; i < 512; i++) { const x = i / 511 * Wd, y = Hd / 2 - wave[i * 2] * Hd * 0.42; i ? sg.lineTo(x, y) : sg.moveTo(x, y); }
    sg.stroke(); sg.shadowBlur = 0;
  }
  requestAnimationFrame(frame);

  /* ── keyboard ── */
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); setPlay(!playing); return; }
    if (e.key === 'Escape' && !conEl.hidden) { setConsole(false); return; }
    if (e.key.toLowerCase() === 'c' && !e.repeat) { setConsole(conEl.hidden); return; }
    const k = e.key.toLowerCase();
    if (k === 'z') { kbOct = Math.max(-2, kbOct - 1); toast('Octava del teclado ' + (st.synth.octave + kbOct)); return; }
    if (k === 'x') { kbOct = Math.min(3, kbOct + 1); toast('Octava del teclado ' + (st.synth.octave + kbOct)); return; }
    const i = KEYMAP.indexOf(k);
    if (i >= 0 && !e.repeat) press(i);
  });
  addEventListener('keyup', e => { const i = KEYMAP.indexOf(e.key.toLowerCase()); if (i >= 0) release(i); });

  /* ── export / share / help ── */
  $('#export').addEventListener('click', async () => {
    const bars = +$('#bars').value, b = $('#export');
    b.disabled = true; b.textContent = '⤓ …';
    try {
      const blob = await X.renderLoop(app, bars);
      const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `syndrus_${app.bpm}bpm_${X.NOTE_NAMES[st.root]}_${bars}c.wav`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`WAV listo · la mezcla A/B · ${bars} compás${bars > 1 ? 'es' : ''} · ${app.bpm} BPM · se repite sin cortes`);
    } catch (err) { toast('No se pudo exportar: ' + (err.message || err)); }
    b.disabled = false; b.textContent = '⤓ WAV';
  });
  $('#share').addEventListener('click', () => {
    const share = { v: 2, bpm: app.bpm, swing: app.swing, decks: app.decks, mix: { ...app.mix, cueMode: 'off', cueSink: '', decks: app.mix.decks.map(d => ({ ...d, cue: false })) }, edit: app.edit };   // the bank stays here
    const url = location.origin + location.pathname + '#s=' + btoa(unescape(encodeURIComponent(JSON.stringify(share))));
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Enlace copiado: quien lo abra escucha esta mezcla (los dos decks)'), () => { prompt('Copiá este enlace:', url); });
  });
  $('#help').addEventListener('click', () => { $('#helpPop').hidden = !$('#helpPop').hidden; });
  $('#nodrus').addEventListener('click', () => {
    const local = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(location.href);
    const w = window.open(local && location.pathname.startsWith('/lab/') ? '/lab/nodes/' : new URL('../nodes/', location.href).href, 'nodrus');
    if (!w) toast('El navegador bloqueó la ventana: permití las ventanas emergentes');
  });
  $('#helpClose').addEventListener('click', () => { $('#helpPop').hidden = true; });
  if (location.hash.startsWith('#s=')) history.replaceState(null, '', location.pathname);

  function paintAll() { paintTop(); paintDrums(); paintSynth(); paintRings(); paintFx(); paintConsole(); }
  document.body.dataset.deck = ab(app.edit);
  paintAll();
  try { setTab(sessionStorage.getItem('syndrus_tab') || 'drums'); } catch (e) { setTab('drums'); }
  paintStatus();
  window.__syndrus = { midiTest: { onMidi, setLearn: v => { learnMode = v; learnArmed = null; }, get map() { return midiO.map; }, opts: midiO, noteDown, noteUp, get arpSet() { return arpSet; } }, perform, get roll() { return roll; }, set roll(v) { roll = v; }, get app() { return app; }, get state() { return st; }, setEdit, get pending() { return pending; }, get engine() { return E; }, get ctx() { return ac; }, setPlay, load, PRESETS, randomTechno, randomAmbient };
})();
