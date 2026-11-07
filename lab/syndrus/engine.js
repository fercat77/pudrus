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
    const djLP = ctx.createBiquadFilter(); djLP.type = 'lowpass'; djLP.frequency.value = 20000; djLP.Q.value = 0.9;
    const djHP = ctx.createBiquadFilter(); djHP.type = 'highpass'; djHP.frequency.value = 10; djHP.Q.value = 0.9;
    const vol = ctx.createGain(); vol.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2; comp.knee.value = 8;
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.75;
    masterIn.connect(drive); drive.connect(djLP); djLP.connect(djHP); djHP.connect(vol); vol.connect(comp); comp.connect(analyser); analyser.connect(out);
    E.analyser = analyser;
    function setDrive(k) {   // 0–1 soft saturation
      const n = 1024, c = new Float32Array(n), a = 1 + k * 20;
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(a * x) / Math.tanh(a); }
      drive.curve = c;
    }
    setDrive(0.1);
    function setDJ(v) {   // -1 = low-pass closed … 0 open … +1 = high-pass
      const now = ctx.currentTime;
      const lp = v < 0 ? 20000 * Math.pow(60 / 20000, -v) : 20000, hp = v > 0 ? 10 * Math.pow(6000 / 10, v) : 10;
      djLP.frequency.setTargetAtTime(lp, now, 0.03); djHP.frequency.setTargetAtTime(hp, now, 0.03);
    }

    /* sends: tempo delay (with a filter in the feedback) and a generated reverb */
    const dIn = ctx.createGain(), delay = ctx.createDelay(4), fb = ctx.createGain(), dF = ctx.createBiquadFilter(), dOut = ctx.createGain();
    dF.type = 'bandpass'; dF.frequency.value = 1800; dF.Q.value = 0.6; fb.gain.value = 0.45; dOut.gain.value = 0.7;
    dIn.connect(delay); delay.connect(dF); dF.connect(fb); fb.connect(delay); dF.connect(dOut); dOut.connect(masterIn);
    const rIn = ctx.createGain(), conv = ctx.createConvolver(), rOut = ctx.createGain(); rOut.gain.value = 0.8;
    rIn.connect(conv); conv.connect(rOut); rOut.connect(masterIn);
    function setReverb(sizeSec) {
      const len = Math.floor(ctx.sampleRate * sizeSec), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let s = 777 + ch * 99; for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const x = i / len; d[i] = (s / 0x3fffffff - 1) * Math.pow(1 - x, 2.4) * (i < 80 ? i / 80 : 1); } }
      conv.buffer = ir;
    }
    setReverb(3.2);

    /* channel strips: level + two sends */
    function strip() {
      const input = ctx.createGain(), lv = ctx.createGain(), sd = ctx.createGain(), sr = ctx.createGain();
      sd.gain.value = 0; sr.gain.value = 0;
      input.connect(lv); lv.connect(masterIn); lv.connect(sd); lv.connect(sr); sd.connect(dIn); sr.connect(rIn);
      return { input, lv, sd, sr, set(p) { lv.gain.value = p.level; sd.gain.value = p.delay; sr.gain.value = p.reverb; } };
    }
    E.drumStrips = DRUMS.map(() => strip());
    E.synthStrip = strip();
    E.ringStrips = [0, 1, 2, 3].map(() => strip());

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

    /* ── the synth: one mono voice that is always running (so slides glide, like a bassline box) ── */
    const S = {};
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator(), nz = noise();
    const g1 = ctx.createGain(), g2 = ctx.createGain(), gs = ctx.createGain(), gn = ctx.createGain();
    const filt = ctx.createBiquadFilter(), vca = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    sub.type = 'square'; filt.type = 'lowpass'; vca.gain.value = 0;
    o1.connect(g1); o2.connect(g2); sub.connect(gs); nz.connect(gn);
    [g1, g2, gs, gn].forEach(x => x.connect(filt)); filt.connect(vca); vca.connect(E.synthStrip.input);
    lfo.connect(lfoG); lfoG.connect(filt.frequency);
    [o1, o2, sub, lfo].forEach(o => o.start()); nz.start();
    let P = null, lastFreq = 110;
    S.set = p => {
      P = p;
      o1.type = p.wave1; o2.type = p.wave2; o2.detune.value = p.detune;
      g1.gain.value = p.mix1; g2.gain.value = p.mix2; gs.gain.value = p.sub; gn.gain.value = p.noise * 0.5;
      filt.Q.value = 0.5 + p.res * 22; lfo.frequency.value = p.lfoRate; lfoG.gain.value = p.lfoDepth * 2500;
      filt.frequency.setTargetAtTime(p.cutoff, ctx.currentTime, 0.02);
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
    E.synth = S;

    E.setFx = fx => {
      setDrive(fx.drive);
      fb.gain.value = fx.feedback; dF.frequency.value = fx.delayTone;
      const rk = Math.round(fx.space * 20); if (E._rev !== rk) { E._rev = rk; setReverb(0.6 + rk / 20 * 7); }   // rebuilt in 5 % steps, not on every pixel of a drag
      vol.gain.value = fx.volume;
      setDJ(fx.dj);
    };
    E.setDelayTime = sec => { delay.delayTime.setTargetAtTime(Math.min(3.9, sec), ctx.currentTime, 0.05); };
    return E;
  }

  /* ── what plays on a 16th step (shared by the live clock and the WAV export) ── */
  function euclid(steps, pulses, rot) {
    // `pulses` hits spread as evenly as possible over `steps` (same result as Bjorklund), turned by `rot`
    const out = new Array(steps).fill(0); if (pulses <= 0) return out;
    for (let i = 0; i < steps; i++) if ((i * pulses) % steps < pulses) out[(i + rot) % steps] = 1;
    return out;
  }
  function playStep(E, st, n, t, rnd = Math.random) {
    const stepDur = 60 / st.bpm / 4;
    // drums
    st.drums.forEach((tr, i) => {
      if (tr.mute || (st.drums.some(x => x.solo) && !tr.solo)) return;
      const s = tr.steps[n % 16];
      if (!s || (tr.prob < 1 && rnd() > tr.prob)) return;
      E.hit(DRUMS[i][0], E.drumStrips[i].input, t, { tune: tr.tune, decay: tr.decay, vel: s === 2 ? 1 : 0.7 });
    });
    // synth line
    const sy = st.synth, cur = sy.steps[n % 16], prev = sy.steps[(n + 15) % 16];
    if (!sy.mute && cur && cur.on) {
      const midi = degreeToMidi(st.root, st.scale, cur.deg, sy.octave);
      const slide = !!(prev && prev.on && prev.slide);
      E.synth.noteOn(t, midi, cur.acc ? 1.3 : 1, slide);
      if (!cur.slide) E.synth.noteOff(t + stepDur * sy.gate);
    }
    // rings
    st.rings.forEach((r, i) => {
      if (r.mute || !r.pulses) return;
      const pat = euclid(r.steps, r.pulses, r.rot), k = n % r.steps;
      if (!pat[k]) return;
      let note = degreeToMidi(st.root, st.scale, r.deg, r.octave);
      if (r.wander) note = degreeToMidi(st.root, st.scale, r.deg + Math.floor(rnd() * 5) - 1, r.octave);
      E.hit(r.sound, E.ringStrips[i].input, t, { tune: r.tune, decay: r.decay, vel: 0.85, note });
    });
  }
  function applyMix(E, st) {
    st.drums.forEach((tr, i) => E.drumStrips[i].set(tr));
    E.synthStrip.set(st.synth); E.synth.set(st.synth);
    st.rings.forEach((r, i) => E.ringStrips[i].set(r));
    E.setFx(st.fx); E.setDelayTime(60 / st.bpm * st.fx.delayBeats);
  }

  /* ── WAV export: render N bars offline and fold the tail onto the start → a seamless loop ── */
  async function renderLoop(st, bars) {
    const sr = 44100, stepDur = 60 / st.bpm / 4, steps = bars * 16, swing = st.swing;
    const loopLen = steps * stepDur, tail = 4;
    const off = new OfflineAudioContext(2, Math.ceil((loopLen + tail) * sr), sr);
    const E = buildEngine(off, off.destination);
    applyMix(E, st);
    let s = 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let n = 0; n < steps; n++) playStep(E, st, n, 0.0001 + n * stepDur + (n % 2 ? swing * stepDur * 0.5 : 0), rnd);
    const buf = await off.startRendering();
    const L = Math.round(loopLen * sr), chs = [buf.getChannelData(0), buf.getChannelData(1)];
    const out = chs.map(c => { const o = c.slice(0, L); for (let i = L; i < c.length; i++) o[(i - L) % L] += c[i]; return o; });
    let peak = 0; out.forEach(c => { for (const v of c) peak = Math.max(peak, Math.abs(v)); });
    const g = peak > 0.98 ? 0.98 / peak : 1;
    // 16-bit WAV
    const bytes = new ArrayBuffer(44 + L * 4), dv = new DataView(bytes);
    const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); dv.setUint32(4, 36 + L * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, L * 4, true);
    for (let i = 0, o = 44; i < L; i++) for (let c = 0; c < 2; c++, o += 2) dv.setInt16(o, Math.max(-1, Math.min(1, out[c][i] * g)) * 32767, true);
    return new Blob([bytes], { type: 'audio/wav' });
  }

  window.SyndrusEngine = { buildEngine, playStep, applyMix, renderLoop, euclid, degreeToMidi, noteName, mtof, SCALES, SCALE_NAMES, NOTE_NAMES, DRUMS };
})();
