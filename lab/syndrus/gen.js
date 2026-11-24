/* SYNDRUS · the pattern makers: an empty pattern, and the random techno and psytrance generators.
   Shared by the SYNDRUS page (app.js) and the DRUS game «Surco», which composes its songs with them.
   SyndrusGen.seed(fn) swaps the random source (a seeded one gives the same song again; null = Math.random). */
(function () {
  'use strict';
  const X = window.SyndrusEngine;
  let rng = Math.random;
  const R = (a, b) => a + rng() * (b - a);
  const I = (a, b) => Math.floor(R(a, b + 1));
  const pick = a => a[Math.floor(rng() * a.length)];
  const chance = p => rng() < p;

  const drumTrack = (o = {}) => ({ steps: new Array(16).fill(0), level: 0.8, tune: 1, decay: 0.4, punch: 0, delay: 0, reverb: 0.05, prob: 1, mute: false, solo: false, ...o });
  const ring = (o = {}) => ({ steps: 16, pulses: 0, rot: 0, sound: 'bell', deg: 0, octave: 4, wander: false, tune: 1, decay: 0.5, level: 0.6, delay: 0.25, reverb: 0.5, mute: false, ...o });
  function blank() {
    return {
      v: 1, bpm: 128, swing: 0, root: 9, scale: 'minor',
      drums: X.DRUMS.map(() => drumTrack()),
      synth: { steps: Array.from({ length: 16 }, () => ({ on: false, deg: 0, acc: false, slide: false })), octave: 2, gate: 0.55,
        wave1: 'sawtooth', wave2: 'square', detune: 7, oct2: 0, mix1: 0.6, mix2: 0.25, sub: 0.35, noise: 0,
        cutoff: 520, res: 0.6, envAmt: 0.45, fdecay: 0.22, attack: 0.003, decay: 0.25, sustain: 0.3, release: 0.12, glide: 0.07,
        lfoRate: 0.2, lfoDepth: 0, level: 0.7, delay: 0.1, reverb: 0.05, mute: false, chord: 'off' },
      rings: [ring({ sound: 'rim', steps: 16, pulses: 0, level: 0.5, reverb: 0.1, delay: 0.2 }), ring({ steps: 12, deg: 2 }), ring({ steps: 7, deg: 4, octave: 5 }), ring({ sound: 'pluck', steps: 9, deg: 0, octave: 3 })],
      fx: { feedback: 0.42, delayTone: 1800, delayBeats: 0.75, space: 0.45, duck: 0, duckAll: false },   // duck: sidechain from the kick · drive, volume, EQ and the DJ filter live in the mixer (app.mix)
      // the arpeggiator: its own voice and channel; its chords live in the pattern (they play by themselves with ▶)
      arp: { on: false, mute: false, sound: 'pluck', mode: 'up', rate: 1, oct: 1, octave: 4, gate: 0.6, prob: 1, accent: 'off', hold: 1,
        chords: [{ deg: 0, kind: 'triad' }, { deg: 5, kind: 'triad' }, { deg: 2, kind: 'triad' }, { deg: 6, kind: 'triad' }],
        keys: 'synth', keyChord: 'triad', latch: false, tone: 0.55, decay: 0.35, level: 0.75, delay: 0.25, reverb: 0.3 },
    };
  }
  const pat = s => [...s].map(c => (c === 'x' ? 2 : c === 'o' ? 1 : 0));   // x accent, o hit, . rest
  function line(s, notes) { notes.forEach(([i, deg, acc, slide]) => { s.synth.steps[i] = { on: true, deg, acc: !!acc, slide: !!slide }; }); }

  /* ── psytrance: the kick on every beat and the bass on the 16ths between kicks — never on the kick's own step, that is
     the room it needs. Four families: full-on, progressive, dark (forest) and Goa ── */
  const PSY_STYLES = [['fullon', 'full-on'], ['prog', 'progresivo'], ['dark', 'oscuro'], ['goa', 'goa']];
  const beats = p => pat(p.repeat(4));
  // shape: 'roll' K B B B · 'gallop' K . B B · 'off' K . B .   degs: the notes of the three 16ths after the kick
  function psyGroove(s, o) {
    Object.assign(s.drums[0], { steps: beats('x...'), level: 0.9, tune: o.tune || 1.05, decay: o.kdecay, punch: o.punch, reverb: 0, delay: 0 });
    const on = { roll: [1, 2, 3], gallop: [2, 3], off: [2] }[o.shape] || [1, 2, 3], degs = o.degs || [0, 0, 0];
    for (let b = 0; b < 4; b++) on.forEach(k => { s.synth.steps[b * 4 + k] = { on: true, deg: degs[k - 1], acc: k === o.acc, slide: false }; });
    Object.assign(s.synth, { octave: s.root >= 4 ? 1 : 2,   // E1…B1 or C2…D#2: the fundamental stays between 41 and 78 Hz
      wave1: 'sawtooth', wave2: 'square', detune: 0, oct2: 0, mix1: 0.7, mix2: 0, sub: 0, noise: 0, cutoff: 300, res: 0.35, envAmt: 0.3, fdecay: 0.09,
      attack: 0.001, decay: 0.12, sustain: 0.4, release: 0.03, gate: 0.65, glide: 0.02, lfoDepth: 0, level: 1, delay: 0, reverb: 0, chord: 'off' }, o.bass);
  }
  // the lead: the arpeggiator walking a chord of the tonic (psy harmony barely moves: a slot can stay empty)
  function psyLead(s, o, chords) {
    Object.assign(s.arp, { on: true, mute: false, keys: 'synth', sound: 'acid', mode: 'up', rate: 1, oct: 2, octave: 4, gate: 0.55, prob: 1, accent: '3', hold: 2,
      tone: 0.6, decay: 0.35, level: 0.4, delay: 0.4, reverb: 0.15 }, o);
    s.arp.chords = [0, 1, 2, 3].map(i => (chords[i] ? { deg: chords[i][0], kind: chords[i][1] } : { deg: null, kind: 'triad' }));
  }
  function randomPsy(kind) {
    const k = PSY_STYLES.some(x => x[0] === kind) ? kind : pick(PSY_STYLES)[0];
    const s = blank(), d = s.drums; s.root = I(0, 11);
    const backbeat = (i, lv, rv) => Object.assign(d[i], { steps: pat('....o.......o...'), level: lv, reverb: rv });
    const hat = (p, lv, dec, prob = 1) => Object.assign(d[3], { steps: beats(p), level: lv, decay: dec, prob });
    const open = (p, lv, dec) => Object.assign(d[4], { steps: beats(p), level: lv, decay: dec });
    const kinds = ['seventh', 'seventh', 'add9', 'sus4', 'sus2', 'triad', 'power'];
    const lead = (o, progs) => psyLead(s, o, pick(progs).map(deg => (deg === null ? null : [deg, pick(kinds)])));
    if (k === 'fullon') {
      s.bpm = I(142, 148); s.scale = pick(['phrygian', 'hijaz', 'harmonic', 'minor']);
      psyGroove(s, { shape: chance(0.8) ? 'roll' : 'gallop', punch: R(0.65, 0.9), kdecay: R(0.02, 0.15), tune: R(1, 1.12), acc: pick([0, 2, 3]),
        bass: { cutoff: R(260, 380), res: R(0.3, 0.45), envAmt: R(0.25, 0.4), fdecay: R(0.07, 0.11) } });
      if (chance(0.6)) s.synth.steps[15].deg = pick([1, 6, 7]);
      if (chance(0.7)) backbeat(chance(0.6) ? 1 : 2, R(0.42, 0.55), R(0.08, 0.2));
      hat('oo.o', R(0.26, 0.36), R(0.05, 0.15)); open('..x.', R(0.36, 0.46), R(0.2, 0.35));
      if (chance(0.3)) Object.assign(d[7], { steps: beats('o...'), level: 0.16 });
      lead({ mode: pick(['up', 'updown', 'converge', 'random']), oct: pick([2, 2, 3]), octave: pick([3, 4, 4]), accent: pick(['3', '3', '4', 'rnd']), gate: R(0.45, 0.7), tone: R(0.45, 0.7), decay: R(0.2, 0.5),
        level: R(0.36, 0.42), delay: R(0.3, 0.5), reverb: R(0.1, 0.25), hold: pick([2, 4]), prob: pick([1, 1, 0.85]) }, [[0], [0, 0, 1, 0], [0, 1], [0, 0, 0, 6], [0, 5]]);
      s.rings[0] = ring({ sound: 'zap', steps: pick([16, 32]), pulses: I(1, 3), rot: I(0, 15), deg: pick([0, 2, 4]), octave: 5, wander: true, decay: R(0.2, 0.5), level: 0.3, delay: R(0.35, 0.5), reverb: 0.3 });
      if (chance(0.7)) s.rings[1] = ring({ sound: pick(['rim', 'tom', 'rim']), steps: 16, pulses: pick([3, 5, 7]), rot: I(0, 4), tune: R(0.9, 1.4), level: 0.3, delay: R(0.2, 0.4), reverb: 0.1 });
      s.fx = { ...s.fx, feedback: R(0.45, 0.6), delayBeats: 0.75, delayTone: R(1800, 3000), space: R(0.3, 0.5), duck: R(0.35, 0.55) };
    } else if (k === 'prog') {
      s.bpm = I(134, 140); s.scale = pick(['minor', 'dorian', 'phrygian', 'minor']);
      const off = chance(0.5);
      psyGroove(s, { shape: off ? 'off' : 'roll', punch: R(0.35, 0.6), kdecay: R(0.15, 0.35), tune: R(0.95, 1.05),
        bass: off ? { cutoff: R(200, 280), res: R(0.2, 0.3), envAmt: R(0.18, 0.26), fdecay: R(0.1, 0.16), decay: 0.2, sustain: 0.5, gate: R(0.8, 1), release: 0.05 }
          : { cutoff: R(200, 260), res: R(0.2, 0.32), envAmt: R(0.18, 0.26), fdecay: R(0.08, 0.12), gate: 0.7 } });
      if (chance(0.5)) s.synth.steps[15] = { on: true, deg: pick([-1, 2, 4]), acc: false, slide: false };
      if (chance(0.7)) backbeat(1, R(0.36, 0.45), R(0.15, 0.3));
      hat('oooo', R(0.16, 0.24), R(0.03, 0.08), R(0.75, 0.95)); open('..o.', R(0.32, 0.4), R(0.2, 0.4));
      lead({ sound: pick(['pluck', 'pluck', 'acid', 'glass']), mode: pick(['up', 'updown', 'up']), accent: pick(['off', 'off', '4']), gate: R(0.4, 0.6), tone: R(0.3, 0.5), decay: R(0.25, 0.45),
        level: R(0.34, 0.42), delay: R(0.4, 0.55), reverb: R(0.25, 0.45), hold: 4 }, [[0, 5], [0], [0, 2], [0, 0, 5, 3]]);
      s.rings[0] = ring({ sound: pick(['rim', 'tom']), steps: 16, pulses: pick([3, 5]), rot: I(0, 4), level: 0.3, delay: R(0.4, 0.55), reverb: 0.2 });
      if (chance(0.7)) s.rings[1] = ring({ sound: 'bell', steps: pick([24, 32]), pulses: I(2, 3), rot: I(0, 12), deg: pick([0, 2, 4]), octave: 5, wander: true, decay: R(0.4, 0.6), level: 0.28, delay: 0.5, reverb: R(0.55, 0.75) });
      s.fx = { ...s.fx, feedback: R(0.5, 0.65), delayBeats: 0.75, delayTone: R(1400, 2200), space: R(0.5, 0.75), duck: R(0.45, 0.65) };
    } else if (k === 'dark') {
      s.bpm = I(148, 158); s.scale = pick(['phrygian', 'hijaz', 'phrygian']);
      psyGroove(s, { shape: 'roll', punch: R(0.7, 1), kdecay: R(0, 0.1), tune: R(1.02, 1.15), acc: pick([0, 1, 3]),
        bass: { cutoff: R(180, 260), res: R(0.4, 0.55), envAmt: R(0.2, 0.3), fdecay: R(0.06, 0.09), lfoRate: R(0.05, 0.2), lfoDepth: R(0.03, 0.08) } });
      if (chance(0.5)) s.synth.steps[pick([11, 15])].deg = pick([1, 7]);
      hat('oooo', R(0.24, 0.32), R(0.04, 0.08), R(0.8, 1)); if (chance(0.6)) open('..o.', R(0.26, 0.34), R(0.12, 0.25));
      lead({ mode: pick(['random', 'random', 'converge', 'updown']), rate: pick([0.5, 0.5, 1]), oct: pick([2, 3]), accent: 'rnd', prob: R(0.6, 0.9), gate: R(0.4, 0.6), tone: R(0.5, 0.8), decay: R(0.1, 0.3),
        level: R(0.3, 0.36), delay: R(0.35, 0.55), reverb: R(0.2, 0.4), hold: 4 }, [[0], [0, null, 1], [0, 1], [0, 0, 0, 1]]);
      s.rings[0] = ring({ sound: 'zap', steps: pick([7, 9, 11, 13]), pulses: I(2, 4), rot: I(0, 6), deg: pick([0, 1, 4]), octave: pick([4, 5, 6]), wander: true, decay: R(0.15, 0.4), level: 0.3, delay: R(0.45, 0.6), reverb: 0.4 });
      s.rings[1] = ring({ sound: 'tom', steps: pick([5, 7, 12]), pulses: I(1, 3), rot: I(0, 4), tune: R(0.8, 1.6), level: 0.32, delay: 0.5, reverb: 0.3 });
      if (chance(0.6)) s.rings[2] = ring({ sound: pick(['zap', 'pluck']), steps: pick([9, 13, 15]), pulses: 2, rot: I(0, 8), deg: pick([2, 4, 6]), octave: pick([5, 6]), wander: true, decay: R(0.1, 0.3), level: 0.22, delay: 0.6, reverb: 0.5 });
      s.fx = { ...s.fx, feedback: R(0.55, 0.72), delayBeats: pick([0.75, 0.75, 0.5]), delayTone: R(1200, 2500), space: R(0.5, 0.8), duck: R(0.3, 0.5) };
    } else {   // goa: the bass jumps an octave, the lead is melodic and long, three against four
      s.bpm = I(138, 146); s.scale = pick(['hijaz', 'phrygian', 'harmonic', 'hijaz']);
      psyGroove(s, { shape: 'roll', degs: pick([[0, 0, 7], [0, 7, 0], [0, 7, 7], [0, 0, 0]]), punch: R(0.4, 0.7), kdecay: R(0.1, 0.25), tune: R(0.98, 1.1), acc: pick([0, 3]),
        bass: { cutoff: R(260, 380), res: R(0.45, 0.6), envAmt: R(0.35, 0.5), fdecay: R(0.08, 0.12) } });
      if (chance(0.7)) backbeat(chance(0.5) ? 2 : 1, R(0.4, 0.5), R(0.1, 0.2));
      hat('oo.o', R(0.24, 0.34), R(0.05, 0.15)); open('..x.', R(0.36, 0.44), R(0.2, 0.3));
      lead({ mode: pick(['up', 'updown', 'up', 'converge']), oct: pick([2, 3]), octave: pick([3, 4]), accent: '3', gate: R(0.55, 0.8), tone: R(0.5, 0.75), decay: R(0.3, 0.6),
        level: R(0.36, 0.42), delay: R(0.4, 0.55), reverb: R(0.2, 0.35), hold: 2 }, [[0, 0, 1, 0], [0, 0, 1, 6], [0, 5, 6, 0], [0, 1]]);
      s.rings[0] = ring({ sound: 'bell', steps: pick([9, 12, 16]), pulses: I(3, 5), rot: I(0, 5), deg: pick([0, 2, 4]), octave: 5, wander: true, decay: R(0.2, 0.4), level: 0.28, delay: 0.5, reverb: 0.5 });
      if (chance(0.7)) s.rings[1] = ring({ sound: pick(['pluck', 'zap']), steps: pick([7, 11, 12]), pulses: I(2, 3), rot: I(0, 5), deg: pick([0, 4]), octave: pick([4, 5]), wander: true, decay: R(0.3, 0.5), level: 0.3, delay: 0.55, reverb: 0.3 });
      s.fx = { ...s.fx, feedback: R(0.55, 0.68), delayBeats: 0.75, delayTone: R(2000, 3200), space: R(0.45, 0.7), duck: R(0.2, 0.4) };
    }
    return s;
  }

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
    if (chance(0.25)) randomArp(s, { sound: pick(['pluck', 'pluck', 'glass']), rate: pick([1, 1, 2, 0.5]), octave: pick([4, 5]), level: R(0.3, 0.45), hold: pick([1, 2]) });
    return s;
  }
  // an arpeggio over a progression of the scale (i, VI, III, VII… degrees that sound good together)
  function randomArp(s, o) {
    const prog = pick([[0, 5, 2, 6], [0, 3, 4, 0], [0, 5, 3, 4], [0, 2, 5, 4], [0, 6, 5, 6], [0, 3, 0, 4]]);
    Object.assign(s.arp, { on: true, mode: pick(['up', 'updown', 'up', 'random']), oct: pick([1, 2, 2]), gate: R(0.4, 0.9), accent: pick(['off', 'off', '4', '3']),
      tone: R(0.35, 0.75), decay: R(0.2, 0.6), delay: R(0.15, 0.45), reverb: R(0.2, 0.5) }, o);
    s.arp.chords = prog.map(deg => ({ deg, kind: pick(['triad', 'triad', 'seventh', 'sus2', 'add9']) }));
  }

  window.SyndrusGen = { drumTrack, ring, blank, pat, line, randomTechno, randomPsy, randomArp, PSY_STYLES, seed(fn) { rng = typeof fn === 'function' ? fn : Math.random; } };
})();
