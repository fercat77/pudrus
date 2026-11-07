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
        lfoRate: 0.2, lfoDepth: 0, level: 0.7, delay: 0.1, reverb: 0.05, mute: false },
      rings: [ring({ sound: 'rim', steps: 16, pulses: 0, level: 0.5, reverb: 0.1, delay: 0.2 }), ring({ steps: 12, deg: 2 }), ring({ steps: 7, deg: 4, octave: 5 }), ring({ sound: 'pluck', steps: 9, deg: 0, octave: 3 })],
      fx: { drive: 0.12, feedback: 0.42, delayTone: 1800, delayBeats: 0.75, space: 0.45, volume: 0.8, dj: 0 },
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
      s.fx.space = 0.65; s.fx.drive = 0.3;
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
      s.fx.drive = 0.35;
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
      s.fx = { ...s.fx, space: 0.95, feedback: 0.55, delayTone: 2400, delayBeats: 1.5, drive: 0.02 };
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
    s.fx = { ...s.fx, drive: R(0.05, 0.4), feedback: R(0.3, 0.6), delayBeats: pick([0.75, 0.5, 0.375]), space: R(0.25, 0.7) };
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
    s.fx = { ...s.fx, drive: 0.02, space: R(0.8, 1), feedback: R(0.4, 0.65), delayTone: R(1500, 3500), delayBeats: pick([1, 1.5, 0.75]) };
    return s;
  }

  /* ── load / save / share ── */
  const KEY = 'syndrus_v2', OLD_KEY = 'syndrus_v1';
  const deckMix = () => ({ level: 0.9, dj: 0, kill: false, mute: { drums: false, synth: false, rings: false } });
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
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(app)); savedAt = Date.now(); } catch (e) { /* full / private */ } }, 300); };
  const toast = (m, ms = 2200) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms); };

  /* ── audio + clock ── */
  let ac = null, E = null, playing = false, nextTime = 0, step = 0, timer = 0;
  const queue = [];
  function ensureAudio() {
    if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); E = X.buildEngine(ac, ac.destination); X.applyMix(E, app); }
    if (ac.state === 'suspended') ac.resume();
  }
  const mix = () => { if (E) X.applyMix(E, app); save(); };
  const deck = () => E.decks[app.edit];
  const pending = [null, null];   // bank patterns waiting for the next bar, per deck
  function tick() {
    const stepDur = 60 / app.bpm / 4, g = X.xfGains(app.mix.x);
    while (nextTime < ac.currentTime + 0.12) {
      if (step % 16 === 0 && (pending[0] || pending[1])) applyPending();
      const t = nextTime + (step % 2 ? app.swing * stepDur * 0.5 : 0);
      app.decks.forEach((p, i) => { if (g[i] > 0.001) X.playStep(E.decks[i], { ...p, bpm: app.bpm }, step, t, Math.random, app.mix.decks[i].mute); });
      queue.push({ step, t });
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
    playing = on; $('#play').classList.toggle('on', on); $('#play').textContent = on ? '■' : '▶';
    clearInterval(timer);
    if (on) { step = 0; nextTime = ac.currentTime + 0.06; tick(); timer = setInterval(tick, 25); }
    else { E.decks.forEach(D => D.synth.noteOff(ac.currentTime)); queue.length = 0; paintNow(-1); if (pending[0] || pending[1]) applyPending(); }
  }
  $('#play').addEventListener('click', () => setPlay(!playing));

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
    w.addEventListener('pointerdown', e => { drag = { x: e.clientX, p: toPos(obj[key]) }; w.setPointerCapture(e.pointerId); });
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
    s.addEventListener('change', () => { obj[key] = isNaN(+s.value) || s.value === '' ? s.value : +s.value; (on || mix)(); });
    w.append(el('span', '', label), s); w.paint = () => { s.value = String(obj[key]); };
    return w;
  }

  /* ── layout: phone or desktop ── */
  const mq = matchMedia('(max-width: 760px)');
  const mobile = () => mq.matches;
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => { paintDrums(); paintRings(); });
  const TABS = ['drums', 'synth', 'rings', 'master'];
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
    app.edit = i; st = app.decks[i]; save();
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
    deck().synth.noteOn(t, X.degreeToMidi(st.root, st.scale, s.deg, st.synth.octave), s.acc ? 1.3 : 1, false); deck().synth.noteOff(t + 0.18);
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
  function press(i) {
    ensureAudio(); if (held.includes(i)) return;
    const legato = held.length > 0; held.push(i);
    deck().synth.noteOn(ac.currentTime + 0.005, keyMidi(i), 1, legato);
    const k = document.querySelector(`.sy-key[data-i="${i}"]`); if (k) k.classList.add('on');
  }
  function release(i) {
    const j = held.indexOf(i); if (j < 0) return; held.splice(j, 1);
    const k = document.querySelector(`.sy-key[data-i="${i}"]`); if (k) k.classList.remove('on');
    if (held.length) deck().synth.noteOn(ac.currentTime + 0.005, keyMidi(held[held.length - 1]), 1, true);
    else deck().synth.noteOff(ac.currentTime + 0.005);
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
        choice('Melodía', r, 'wander', [[false, 'fija'], [true, 'errante']], () => { r.wander = r.wander === 'true' || r.wander === true; save(); }),
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
      c.append(h, ps, kill, mutes); cols.append(c);
    });
    box.append(cols);
    const tools = el('div', 'sy-xfbtns');
    const cAB = el('button', 'sy-mini', 'A → B'), cBA = el('button', 'sy-mini', 'B → A'), sw = el('button', 'sy-mini', 'A ⇄ B'); sw.title = 'Intercambiar los decks';
    cAB.addEventListener('click', () => { app.decks[1] = clone(app.decks[0]); st = app.decks[app.edit]; paintAll(); mix(); toast('A copiado en B'); });
    cBA.addEventListener('click', () => { app.decks[0] = clone(app.decks[1]); st = app.decks[app.edit]; paintAll(); mix(); toast('B copiado en A'); });
    sw.addEventListener('click', () => { app.decks.reverse(); app.mix.decks.reverse(); st = app.decks[app.edit]; paintAll(); mix(); toast('Decks intercambiados'); });
    tools.append(cAB, cBA, sw); box.append(tools);
    // bank
    const bh = el('div', 'sy-subhead'), bs = el('button', 'sy-mini' + (bankSave ? ' on' : ''), bankSave ? '💾 tocá un lugar' : '💾 Guardar');
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
  function paintFx() {
    const p = $('#fxParams'); p.innerHTML = '';
    const fx = st.fx;
    $('#fxTitle').textContent = `EFECTOS · DECK ${ab(app.edit)}`;
    p.append(
      choice('Delay', fx, 'delayBeats', [[0.25, '1/16'], [0.375, '1/16 ·'], [0.5, '1/8'], [0.75, '1/8 ·'], [1, '1/4'], [1.5, '1/4 ·']]),
      param('Repeticiones', fx, 'feedback', 0, 0.92), param('Tono delay', fx, 'delayTone', 300, 6000, { curve: 2, fmt: x => Math.round(x) + ' Hz' }), param('Espacio', fx, 'space', 0, 1));
    const m = $('#masterParams'); m.innerHTML = '';
    m.append(param('Saturación', app.mix, 'drive', 0, 1), param('Volumen', app.mix, 'volume', 0, 1.2));
    paintMixer();
  }

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
    const share = { v: 2, bpm: app.bpm, swing: app.swing, decks: app.decks, mix: app.mix, edit: app.edit };   // the bank stays here
    const url = location.origin + location.pathname + '#s=' + btoa(unescape(encodeURIComponent(JSON.stringify(share))));
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Enlace copiado: quien lo abra escucha esta mezcla (los dos decks)'), () => { prompt('Copiá este enlace:', url); });
  });
  $('#help').addEventListener('click', () => { $('#helpPop').hidden = !$('#helpPop').hidden; });
  $('#helpClose').addEventListener('click', () => { $('#helpPop').hidden = true; });
  if (location.hash.startsWith('#s=')) history.replaceState(null, '', location.pathname);

  function paintAll() { paintTop(); paintDrums(); paintSynth(); paintRings(); paintFx(); }
  document.body.dataset.deck = ab(app.edit);
  paintAll();
  try { setTab(sessionStorage.getItem('syndrus_tab') || 'drums'); } catch (e) { setTab('drums'); }
  paintStatus();
  window.__syndrus = { get app() { return app; }, get state() { return st; }, setEdit, get pending() { return pending; }, get engine() { return E; }, get ctx() { return ac; }, setPlay, load, PRESETS, randomTechno, randomAmbient };
})();
