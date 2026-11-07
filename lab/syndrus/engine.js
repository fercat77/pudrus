/* SYNDRUS · sound engine (Web Audio). Everything is synthesized: no samples.
   buildEngine(ctx, out) works with a live AudioContext and with an OfflineAudioContext (WAV export),
   so what you export is exactly what you hear. */
(function () {
  'use strict';

  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    pentaMin: [0, 3, 5, 7, 10], major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], hijaz: [0, 1, 4, 5, 7, 8, 10],
  };
  const SCALE_NAMES = { minor: 'Menor', phrygian: 'Frigia', dorian: 'Dórica', pentaMin: 'Pentatónica', major: 'Mayor', lydian: 'Lidia', hijaz: 'Hijaz' };
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // a scale degree (can be negative or above 7) → MIDI note
  function degreeToMidi(root, scale, deg, octave) {
    const s = SCALES[scale] || SCALES.minor, n = s.length;
    const o = Math.floor(deg / n), i = ((deg % n) + n) % n;
    return 12 * (octave + 1) + root + s[i] + 12 * o;
  }
  const noteName = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
  // chords built from the scale (diatonic): degree offsets on top of the note
  const CHORDS = { triad: [0, 2, 4], seventh: [0, 2, 4, 6], sus2: [0, 1, 4], sus4: [0, 3, 4], add9: [0, 2, 4, 8] };
  const CHORD_NAMES = [['off', 'una nota'], ['triad', 'tríada'], ['seventh', 'séptima'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['add9', 'add9'], ['power', 'quinta'], ['oct', 'octava']];
  function chordNotes(root, scale, deg, octave, kind) {
    const base = degreeToMidi(root, scale, deg, octave);
    if (kind === 'power') return [base, base + 7, base + 12];
    if (kind === 'oct') return [base, base + 12];
    const d = CHORDS[kind];
    return d ? d.map(x => degreeToMidi(root, scale, deg + x, octave)) : [base];
  }
  // the scale degree of a MIDI note (the nearest one at or below it): to build chords from played notes
  function midiToDegree(root, scale, midi, octave) {
    let deg = Math.round((midi - degreeToMidi(root, scale, 0, octave)) * (SCALES[scale] || SCALES.minor).length / 12) + 2;
    while (deg > -60 && degreeToMidi(root, scale, deg, octave) > midi) deg--;
    return deg;
  }

  const DRUMS = [
    ['kick', 'Bombo'], ['clap', 'Clap'], ['snare', 'Redoblante'], ['ch', 'Hat cerrado'],
    ['oh', 'Hat abierto'], ['rim', 'Rim'], ['tom', 'Tom'], ['ride', 'Ride'],
  ];

  function buildEngine(ctx, out) {
    const E = { ctx };
    // white noise, made once
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    let seed = 12345; for (let i = 0; i < nd.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; nd[i] = seed / 0x3fffffff - 1; }
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; return s; };

    /* master: drive → DJ filter → volume → glue compressor → (analyser) → out */
    const masterIn = ctx.createGain();
    const drive = ctx.createWaveShaper(); drive.oversample = '2x';
    const vol = ctx.createGain(); vol.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2; comp.knee.value = 8;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.75;
    const masterHP = ctx.createBiquadFilter(); masterHP.type = 'highpass'; masterHP.frequency.value = 10; masterHP.Q.value = 1.4;
    const gate = ctx.createGain();
    masterIn.connect(masterHP); masterHP.connect(gate); gate.connect(drive); drive.connect(vol); vol.connect(comp); comp.connect(analyser); analyser.connect(out);
    E.analyser = analyser;
    // performance FX bus (risers, impacts): after the master filter, with its own long reverb
    const fxIn = ctx.createGain(), fxConv = ctx.createConvolver(), fxWet = ctx.createGain(); fxWet.gain.value = 0.6;
    fxIn.connect(vol); fxIn.connect(fxConv); fxConv.connect(fxWet); fxWet.connect(vol);
    { const len = Math.floor(ctx.sampleRate * 3.5), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let q = 4242 + ch; for (let i = 0; i < len; i++) { q = (q * 1103515245 + 12345) & 0x7fffffff; d[i] = (q / 0x3fffffff - 1) * Math.pow(1 - i / len, 2.2); } }
      fxConv.buffer = ir; }
    // cue (pre-listen): the decks send here before the crossfader
    const cueBus = ctx.createGain();
    E.cueBus = cueBus;
    function setDrive(k) {   // 0–1 soft saturation
      const n = 1024, c = new Float32Array(n), a = 1 + k * 20;
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(a * x) / Math.tanh(a); }
      drive.curve = c;
    }
    setDrive(0.1);
    /* ── drum voices: (strip input, time, params {tune, decay, vel}) ── */
    const env = (g, t, peak, dec, att = 0.001) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec); };
    const metal = (dest, t, tune, dur) => {   // a bank of square waves: the classic machine hats
      [205.3, 304.4, 369.6, 522.7, 540, 800].forEach(f => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * tune * 1.4; o.connect(dest); o.start(t); o.stop(t + dur + 0.05); });
    };
    const V = {
      kick(d, t, p) {
        const o = ctx.createOscillator(), g = ctx.createGain(), sh = ctx.createWaveShaper();
        const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 255 * 2 - 1; c[i] = Math.tanh(x * 2.2); } sh.curve = c;
        o.frequency.setValueAtTime(160 * p.tune, t); o.frequency.exponentialRampToValueAtTime(48 * p.tune, t + 0.09); o.frequency.exponentialRampToValueAtTime(40 * p.tune, t + 0.4);
        env(g, t, p.vel, 0.25 + p.decay * 0.9, 0.002);
        o.connect(sh); sh.connect(g); g.connect(d); o.start(t); o.stop(t + 1.5);
        const n = noise(), hp = ctx.createBiquadFilter(), ng = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 2500;
        env(ng, t, 0.25 * p.vel, 0.012); n.connect(hp); hp.connect(ng); ng.connect(d); n.start(t); n.stop(t + 0.05);
      },
      snare(d, t, p) {
        const n = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1900 * p.tune; bp.Q.value = 0.7;
        env(g, t, 0.7 * p.vel, 0.08 + p.decay * 0.3); n.connect(bp); bp.connect(g); g.connect(d); n.start(t); n.stop(t + 0.6);
        const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(240 * p.tune, t); o.frequency.exponentialRampToValueAtTime(170 * p.tune, t + 0.05);
        env(og, t, 0.6 * p.vel, 0.06 + p.decay * 0.1); o.connect(og); og.connect(d); o.start(t); o.stop(t + 0.4);
      },
      clap(d, t, p) {
        const n = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1200 * p.tune; bp.Q.value = 1.1;
        g.gain.setValueAtTime(0.0001, t);
        [0, 0.011, 0.022].forEach(k => { g.gain.setValueAtTime(0.9 * p.vel, t + k); g.gain.exponentialRampToValueAtTime(0.08, t + k + 0.009); });
        g.gain.setValueAtTime(0.7 * p.vel, t + 0.033); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.033 + 0.1 + p.decay * 0.4);
        n.connect(bp); bp.connect(g); g.connect(d); n.start(t); n.stop(t + 0.8);
      },
      ch(d, t, p) {
        const hp = ctx.createBiquadFilter(), g = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 7000;
        env(g, t, 0.35 * p.vel, 0.025 + p.decay * 0.08); hp.connect(g); g.connect(d); metal(hp, t, p.tune, 0.2);
      },
      oh(d, t, p) {
        const hp = ctx.createBiquadFilter(), g = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 6500;
        env(g, t, 0.32 * p.vel, 0.15 + p.decay * 0.6); hp.connect(g); g.connect(d); metal(hp, t, p.tune, 1);
      },
      rim(d, t, p) {
        const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 1650 * p.tune;
        bp.type = 'bandpass'; bp.frequency.value = 1700 * p.tune; bp.Q.value = 3; env(g, t, 0.8 * p.vel, 0.02 + p.decay * 0.05);
        o.connect(bp); bp.connect(g); g.connect(d); o.start(t); o.stop(t + 0.2);
      },
      tom(d, t, p) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(190 * p.tune, t); o.frequency.exponentialRampToValueAtTime(95 * p.tune, t + 0.25);
        env(g, t, 0.8 * p.vel, 0.12 + p.decay * 0.5); o.connect(g); g.connect(d); o.start(t); o.stop(t + 1);
      },
      ride(d, t, p) {
        const bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.8;
        env(g, t, 0.22 * p.vel, 0.4 + p.decay * 1.4); bp.connect(g); g.connect(d); metal(bp, t, p.tune * 1.1, 2.2);
      },
      // melodic one-shots for the rings
      bell(d, t, p) {   // FM bell, long and soft: ambient
        const f = mtof(p.note), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
        car.frequency.value = f; mod.frequency.value = f * 3.51;
        mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.6 + p.decay * 2);
        env(g, t, 0.28 * p.vel, 0.6 + p.decay * 3.5, 0.004);
        mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(d);
        car.start(t); mod.start(t); car.stop(t + 5); mod.stop(t + 5);
      },
      pluck(d, t, p) {
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(p.note);
        lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(4500, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.08 + p.decay * 0.4);
        env(g, t, 0.35 * p.vel, 0.12 + p.decay * 0.7); o.connect(lp); lp.connect(g); g.connect(d); o.start(t); o.stop(t + 1.5);
      },
    };
    E.hit = (kind, dest, t, p) => { if (V[kind]) V[kind](dest, t, p); };

    /* ── a deck: its own channels, synth voice, delay and reverb, then DJ filter, bass kill and crossfader ── */
    function buildDeck() {
    const D = { hit: (k, d, t, p) => E.hit(k, d, t, p) };
    const deckIn = ctx.createGain();
    const djLP = ctx.createBiquadFilter(); djLP.type = 'lowpass'; djLP.frequency.value = 20000; djLP.Q.value = 0.9;
    const djHP = ctx.createBiquadFilter(); djHP.type = 'highpass'; djHP.frequency.value = 10; djHP.Q.value = 0.9;
    const kill = ctx.createBiquadFilter(); kill.type = 'lowshelf'; kill.frequency.value = 220; kill.gain.value = 0;
    const xf = ctx.createGain(), lvl = ctx.createGain();
    const cue = ctx.createGain(); cue.gain.value = 0;
    deckIn.connect(djLP); djLP.connect(djHP); djHP.connect(kill); kill.connect(lvl); lvl.connect(xf); xf.connect(masterIn); lvl.connect(cue); cue.connect(cueBus);
    D.an = ctx.createAnalyser(); D.an.fftSize = 256; xf.connect(D.an);   // what this deck sends to the master (console meter)
    function setDJ(v) {   // -1 = low-pass closed … 0 open … +1 = high-pass
      const now = ctx.currentTime;
      const lp = v < 0 ? 20000 * Math.pow(60 / 20000, -v) : 20000, hp = v > 0 ? 10 * Math.pow(6000 / 10, v) : 10;
      djLP.frequency.setTargetAtTime(lp, now, 0.03); djHP.frequency.setTargetAtTime(hp, now, 0.03);
    }

    /* sends: tempo delay (with a filter in the feedback) and a generated reverb */
    const dIn = ctx.createGain(), delay = ctx.createDelay(4), fb = ctx.createGain(), dF = ctx.createBiquadFilter(), dOut = ctx.createGain();
    dF.type = 'bandpass'; dF.frequency.value = 1800; dF.Q.value = 0.6; fb.gain.value = 0.45; dOut.gain.value = 0.7;
    dIn.connect(delay); delay.connect(dF); dF.connect(fb); fb.connect(delay); dF.connect(dOut); dOut.connect(deckIn);
    const rIn = ctx.createGain(), conv = ctx.createConvolver(), rOut = ctx.createGain(); rOut.gain.value = 0.8;
    rIn.connect(conv); conv.connect(rOut); rOut.connect(deckIn);
    function setReverb(sizeSec) {
      const len = Math.floor(ctx.sampleRate * sizeSec), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let s = 777 + ch * 99; for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const x = i / len; d[i] = (s / 0x3fffffff - 1) * Math.pow(1 - x, 2.4) * (i < 80 ? i / 80 : 1); } }
      conv.buffer = ir;
    }
    setReverb(3.2);

    /* channel strips: level + two sends */
    function strip() {
      const input = ctx.createGain(), lv = ctx.createGain(), sd = ctx.createGain(), sr = ctx.createGain(), an = ctx.createAnalyser();
      sd.gain.value = 0; sr.gain.value = 0; an.fftSize = 256;
      input.connect(lv); lv.connect(deckIn); lv.connect(sd); lv.connect(sr); sd.connect(dIn); sr.connect(rIn); lv.connect(an);
      // smooth changes (no zipper clicks while a fader moves)
      const to = (prm, v) => { if (Math.abs(prm.value - v) > 1e-4) prm.setTargetAtTime(v, ctx.currentTime, 0.015); };
      return { input, lv, sd, sr, an, set(p) { to(lv.gain, p.level); to(sd.gain, p.delay); to(sr.gain, p.reverb); } };
    }
    D.drumStrips = DRUMS.map(() => strip());
    D.synthStrip = strip();
    D.ringStrips = [0, 1, 2, 3].map(() => strip());

    /* ── the synth: one mono voice that is always running (so slides glide, like a bassline box) ── */
    const S = {};
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator(), nz = noise();
    const g1 = ctx.createGain(), g2 = ctx.createGain(), gs = ctx.createGain(), gn = ctx.createGain();
    const filt = ctx.createBiquadFilter(), vca = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    sub.type = 'square'; filt.type = 'lowpass'; vca.gain.value = 0;
    o1.connect(g1); o2.connect(g2); sub.connect(gs); nz.connect(gn);
    [g1, g2, gs, gn].forEach(x => x.connect(filt)); filt.connect(vca); vca.connect(D.synthStrip.input);
    lfo.connect(lfoG); lfoG.connect(filt.frequency);
    [o1, o2, sub, lfo].forEach(o => o.start()); nz.start();
    let P = null, lastFreq = 110;
    // settings → nodes. Only what CHANGED is touched: re-applying the cutoff on every mixer move
    // used to drag the filter back to its base in the middle of a note (an audible sweep)
    let lastCut = null;
    S.set = p => {
      P = p;
      const now = ctx.currentTime, glide = (prm, v) => { if (Math.abs(prm.value - v) > 1e-4) prm.setTargetAtTime(v, now, 0.015); };
      if (o1.type !== p.wave1) o1.type = p.wave1;
      if (o2.type !== p.wave2) o2.type = p.wave2;
      glide(o2.detune, p.detune); glide(g1.gain, p.mix1); glide(g2.gain, p.mix2); glide(gs.gain, p.sub); glide(gn.gain, p.noise * 0.5);
      glide(filt.Q, 0.5 + p.res * 22); glide(lfo.frequency, p.lfoRate); glide(lfoG.gain, p.lfoDepth * 2500);
      if (lastCut !== p.cutoff) { lastCut = p.cutoff; filt.frequency.setTargetAtTime(p.cutoff, now, 0.02); }
    };
    function freqAt(t, f, glide) {
      for (const [o, k] of [[o1, 1], [o2, Math.pow(2, P.oct2)], [sub, 0.5]]) {
        o.frequency.cancelScheduledValues(t);
        if (glide) { o.frequency.setValueAtTime(lastFreq * k, t); o.frequency.exponentialRampToValueAtTime(f * k, t + Math.max(0.01, P.glide)); }
        else o.frequency.setValueAtTime(f * k, t);
      }
      lastFreq = f;
    }
    // gateOn: attack/decay to sustain (amp and filter); slide = no retrigger, glide the pitch
    S.noteOn = (t, midi, vel = 1, slide = false) => {
      const f = mtof(midi), acc = vel > 1;
      freqAt(t, f, slide);
      if (slide) return;
      const peak = 0.55 * (acc ? 1.35 : 1), cut = P.cutoff, top = Math.min(18000, cut + P.envAmt * 9000 * (acc ? 1.6 : 1));
      vca.gain.cancelScheduledValues(t); vca.gain.setTargetAtTime(peak, t, Math.max(0.001, P.attack / 4));
      vca.gain.setTargetAtTime(peak * P.sustain, t + P.attack, Math.max(0.005, P.decay / 4));
      filt.frequency.cancelScheduledValues(t); filt.frequency.setTargetAtTime(top, t, 0.002);
      filt.frequency.setTargetAtTime(cut + (top - cut) * P.sustain * 0.3, t + 0.004, Math.max(0.005, P.fdecay / 4));
    };
    S.noteOff = t => { vca.gain.cancelScheduledValues(t); vca.gain.setTargetAtTime(0, t, Math.max(0.005, P.release / 4)); filt.frequency.setTargetAtTime(P.cutoff, t, Math.max(0.01, P.release / 3)); };
    // a polyphonic voice with the same sound (waves, filter, envelopes): for chords
    S.polyOn = (t, midis, vel = 1) => {
      const p = P, voices = [], k = 1 / Math.sqrt(Math.max(1, midis.length)), acc = vel > 1;
      for (const m of midis) {
        const f = mtof(m), a = ctx.createOscillator(), b = ctx.createOscillator(), ga = ctx.createGain(), gb = ctx.createGain(), lp = ctx.createBiquadFilter(), env = ctx.createGain();
        a.type = p.wave1; b.type = p.wave2; b.detune.value = p.detune; a.frequency.value = f; b.frequency.value = f * Math.pow(2, p.oct2);
        ga.gain.value = p.mix1 * k; gb.gain.value = p.mix2 * k; lp.type = 'lowpass'; lp.Q.value = 0.5 + p.res * 8;
        const top = Math.min(16000, p.cutoff + p.envAmt * 6000 * (acc ? 1.5 : 1));
        lp.frequency.setValueAtTime(top, t); lp.frequency.setTargetAtTime(p.cutoff, t + 0.004, Math.max(0.01, p.fdecay / 3));
        const peak = 0.42 * (acc ? 1.3 : 1);
        env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(peak, t + Math.max(0.004, p.attack));
        env.gain.setTargetAtTime(peak * Math.max(0.05, p.sustain), t + Math.max(0.004, p.attack), Math.max(0.01, p.decay / 4));
        a.connect(ga); b.connect(gb); ga.connect(lp); gb.connect(lp); lp.connect(env); env.connect(D.synthStrip.input);
        a.start(t); b.start(t); voices.push({ a, b, env });
      }
      return voices;
    };
    S.polyOff = (voices, t) => {
      const rel = Math.max(0.02, P.release);
      voices.forEach(v => { v.env.gain.cancelScheduledValues(t); v.env.gain.setTargetAtTime(0.0001, t, rel / 4); v.a.stop(t + rel * 2 + 0.1); v.b.stop(t + rel * 2 + 0.1); });
    };
    S.poly = (t, midis, dur, vel) => S.polyOff(S.polyOn(t, midis, vel), t + dur);
    D.synth = S;

    D.setFx = fx => {
      fb.gain.value = fx.feedback; dF.frequency.value = fx.delayTone;
      const rk = Math.round(fx.space * 20); if (D._rev !== rk) { D._rev = rk; setReverb(0.6 + rk / 20 * 7); }   // rebuilt in 5 % steps
    };
    D.setDelayTime = sec => { delay.delayTime.setTargetAtTime(Math.min(3.9, sec), ctx.currentTime, 0.05); };
    // mixer: level, DJ filter (-1…1), bass kill, crossfader gain
    D.setMix = (m, gain) => {
      const now = ctx.currentTime;
      lvl.gain.setTargetAtTime(m.level, now, 0.02); xf.gain.setTargetAtTime(gain, now, 0.02);
      setDJ(m.dj); kill.gain.setTargetAtTime(m.kill ? -40 : 0, now, 0.03); cue.gain.setTargetAtTime(m.cue ? 1 : 0, now, 0.02);
    };
    return D;
    }
    E.decks = [buildDeck(), buildDeck()];
    E.setMaster = m => { setDrive(m.drive); vol.gain.setTargetAtTime(m.volume, ctx.currentTime, 0.02); };

    /* ── cue output ──
       'off'    · normal stereo master
       'split'  · one output: left = cue (mixed with some master), right = master — the classic split cue
       'device' · the cue goes to another output (headphones) through an <audio> element with setSinkId */
    let cueMode = 'off', cueEl = null;
    const cueSum = ctx.createGain(), cueMaster = ctx.createGain(), cueOwn = ctx.createGain();
    cueBus.connect(cueOwn); analyser.connect(cueMaster); cueOwn.connect(cueSum); cueMaster.connect(cueSum); cueMaster.gain.value = 0;
    const toMono = node => { const g = ctx.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; node.connect(g); return g; };
    const merger = ctx.createChannelMerger(2), monoCue = toMono(cueSum), monoMaster = toMono(analyser);
    monoCue.connect(merger, 0, 0);
    let streamDest = null;
    E.setCue = async (mode, blend, sinkId) => {
      cueOwn.gain.value = 1 - blend * 0.85; cueMaster.gain.value = blend;
      if (mode === cueMode && mode !== 'device') return true;
      try { analyser.disconnect(out); } catch (e) { /* not connected */ }
      try { monoMaster.disconnect(merger); } catch (e) { /* idem */ }
      try { merger.disconnect(out); } catch (e) { /* idem */ }
      if (cueEl) { cueEl.pause(); cueEl.srcObject = null; }
      cueMode = mode;
      if (mode === 'split') { monoMaster.connect(merger, 0, 1); merger.connect(out); return true; }
      analyser.connect(out);
      if (mode === 'device' && ctx.createMediaStreamDestination) {
        if (!streamDest) { streamDest = ctx.createMediaStreamDestination(); cueSum.connect(streamDest); }
        cueEl = cueEl || new Audio();
        cueEl.srcObject = streamDest.stream;
        try { if (sinkId && cueEl.setSinkId) await cueEl.setSinkId(sinkId); } catch (e) { return false; }
        cueEl.play().catch(() => {});
        return true;
      }
      return true;
    };

    // a short beep that goes ONLY to the cue: to check where the cue comes out
    E.cueTest = t => {
      [880, 1320].forEach((f, k) => { const o = ctx.createOscillator(), g = ctx.createGain(), s0 = t + k * 0.18; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s0); g.gain.exponentialRampToValueAtTime(0.4, s0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.16);
        o.connect(g); g.connect(cueBus); o.start(s0); o.stop(s0 + 0.2); });
    };

    /* ── performance FX, all scheduled on the audio clock ── */
    const nz = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; return s; };
    E.riser = (t, dur, peak = 0.32) => {   // white noise sweeping up
      const n = nz(), bp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.Q.value = 2.5; bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
      hp.type = 'highpass'; hp.frequency.value = 180;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.97); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
      n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(fxIn); n.start(t); n.stop(t + dur + 0.1);
    };
    E.downer = (t, dur, peak = 0.3) => {   // the sweep that comes down: leaving a drop
      const n = nz(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(9000, t); bp.frequency.exponentialRampToValueAtTime(180, t + dur);
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp); bp.connect(g); g.connect(fxIn); n.start(t); n.stop(t + dur + 0.1);
    };
    E.impact = t => {   // sub boom + a burst of noise into the long reverb
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g); g.connect(fxIn); o.start(t); o.stop(t + 2);
      const n = nz(), lp = ctx.createBiquadFilter(), ng = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(9000, t); lp.frequency.exponentialRampToValueAtTime(400, t + 1.2);
      ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      n.connect(lp); lp.connect(ng); ng.connect(fxIn); n.start(t); n.stop(t + 1.4);
    };
    // the automatic drop: the master filter climbs for `dur`, the last beat is silence, then everything slams back with an impact
    E.drop = (t, dur, beat) => {
      const f = masterHP.frequency, gg = gate.gain, cut = t + dur - beat;
      f.cancelScheduledValues(t); gg.cancelScheduledValues(t);
      f.setValueAtTime(10, t); f.exponentialRampToValueAtTime(950, cut);
      gg.setValueAtTime(1, t); gg.setValueAtTime(1, cut); gg.linearRampToValueAtTime(0.0001, cut + 0.015);
      gg.setValueAtTime(0.0001, t + dur - 0.004); gg.linearRampToValueAtTime(1, t + dur);
      f.setValueAtTime(950, t + dur - 0.004); f.setValueAtTime(10, t + dur);
      E.riser(t, dur - beat * 0.5, 0.36); E.impact(t + dur);
    };
    E.cancelFx = () => {
      const now = ctx.currentTime;
      masterHP.frequency.cancelScheduledValues(now); gate.gain.cancelScheduledValues(now);
      masterHP.frequency.setTargetAtTime(10, now, 0.02); gate.gain.setTargetAtTime(1, now, 0.01);
    };
    return E;
  }

  /* ── what plays on a 16th step (shared by the live clock and the WAV export) ── */
  function euclid(steps, pulses, rot) {
    // `pulses` hits spread as evenly as possible over `steps` (same result as Bjorklund), turned by `rot`
    const out = new Array(steps).fill(0); if (pulses <= 0) return out;
    for (let i = 0; i < steps; i++) if ((i * pulses) % steps < pulses) out[(i + rot) % steps] = 1;
    return out;
  }
  // one deck, one 16th step: drums, synth line and rings of pattern `st` (mute = groups silenced by the mixer)
  function playStep(D, st, n, t, rnd = Math.random, mute = {}) {
    const stepDur = 60 / st.bpm / 4;
    if (!mute.drums) st.drums.forEach((tr, i) => {
      if (tr.mute || (st.drums.some(x => x.solo) && !tr.solo)) return;
      const s = tr.steps[n % 16];
      if (!s || (tr.prob < 1 && rnd() > tr.prob)) return;
      D.hit(DRUMS[i][0], D.drumStrips[i].input, t, { tune: tr.tune, decay: tr.decay, vel: s === 2 ? 1 : 0.7 });
    });
    const sy = st.synth, cur = sy.steps[n % 16], prev = sy.steps[(n + 15) % 16];
    if (!mute.synth && !sy.mute && cur && cur.on && sy.chord && sy.chord !== 'off') {   // chord stabs (polyphonic)
      D.synth.poly(t, chordNotes(st.root, st.scale, cur.deg, sy.octave, sy.chord), stepDur * Math.max(0.2, sy.gate), cur.acc ? 1.3 : 1);
    } else if (!mute.synth && !sy.mute && cur && cur.on) {
      const midi = degreeToMidi(st.root, st.scale, cur.deg, sy.octave);
      const slide = !!(prev && prev.on && prev.slide);
      D.synth.noteOn(t, midi, cur.acc ? 1.3 : 1, slide);
      if (!cur.slide) D.synth.noteOff(t + stepDur * sy.gate);
    } else if (mute.synth && cur && cur.on) D.synth.noteOff(t);
    if (!mute.rings) st.rings.forEach((r, i) => {
      if (r.mute || !r.pulses) return;
      const pat = euclid(r.steps, r.pulses, r.rot), k = n % r.steps;
      if (!pat[k]) return;
      const deg = r.wander ? r.deg + Math.floor(rnd() * 5) - 1 : r.deg;
      D.hit(r.sound, D.ringStrips[i].input, t, { tune: r.tune, decay: r.decay, vel: 0.85, note: degreeToMidi(st.root, st.scale, deg, r.octave) });
    });
  }
  // a pattern's own sound settings into its deck (bpm = the shared tempo)
  function applyPattern(D, st, bpm) {
    st.drums.forEach((tr, i) => D.drumStrips[i].set(tr));
    D.synthStrip.set(st.synth); D.synth.set(st.synth);
    st.rings.forEach((r, i) => D.ringStrips[i].set(r));
    D.setFx(st.fx); D.setDelayTime(60 / bpm * st.fx.delayBeats);
  }
  // the mixer: equal-power crossfader, per-deck level / DJ filter / bass kill, master drive and volume
  const xfGains = x => [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];
  function applyMix(E, app) {
    const g = xfGains(app.mix.x);
    E.decks.forEach((D, i) => { applyPattern(D, app.decks[i], app.bpm); D.setMix(app.mix.decks[i], g[i]); });
    E.setMaster(app.mix);
  }

  /* ── WAV export: render N bars of the mix offline and fold the tail onto the start → a seamless loop ── */
  async function renderLoop(app, bars) {
    const sr = 44100, stepDur = 60 / app.bpm / 4, steps = bars * 16;
    const loopLen = steps * stepDur, tail = 4;
    const off = new OfflineAudioContext(2, Math.ceil((loopLen + tail) * sr), sr);
    const E = buildEngine(off, off.destination);
    applyMix(E, app);
    let s = 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const g = xfGains(app.mix.x);
    for (let n = 0; n < steps; n++) {
      const t = 0.0001 + n * stepDur + (n % 2 ? app.swing * stepDur * 0.5 : 0);
      app.decks.forEach((st, i) => { if (g[i] > 0.001) playStep(E.decks[i], { ...st, bpm: app.bpm }, n, t, rnd, app.mix.decks[i].mute); });
    }
    const buf = await off.startRendering();
    const L = Math.round(loopLen * sr), chs = [buf.getChannelData(0), buf.getChannelData(1)];
    const out = chs.map(c => { const o = c.slice(0, L); for (let i = L; i < c.length; i++) o[(i - L) % L] += c[i]; return o; });
    let peak = 0; out.forEach(c => { for (const v of c) peak = Math.max(peak, Math.abs(v)); });
    const gain = peak > 0.98 ? 0.98 / peak : 1;
    const bytes = new ArrayBuffer(44 + L * 4), dv = new DataView(bytes);
    const w = (o, str) => [...str].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); dv.setUint32(4, 36 + L * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, L * 4, true);
    for (let i = 0, o = 44; i < L; i++) for (let c = 0; c < 2; c++, o += 2) dv.setInt16(o, Math.max(-1, Math.min(1, out[c][i] * gain)) * 32767, true);
    return new Blob([bytes], { type: 'audio/wav' });
  }

  window.SyndrusEngine = { chordNotes, midiToDegree, CHORD_NAMES, buildEngine, playStep, applyPattern, applyMix, xfGains, renderLoop, euclid, degreeToMidi, noteName, mtof, SCALES, SCALE_NAMES, NOTE_NAMES, DRUMS };
})();
