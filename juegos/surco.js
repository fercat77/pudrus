/* DRUS · SURCO — a rhythm game whose song is composed by SYNDRUS (lab/syndrus/engine.js + gen.js) every time.
   The song has a shape (intro, build-ups, drops, a break, an outro) and the track follows it: it climbs while the
   music builds and dives in the drops. The notes of the song fall on three lanes, each one from an instrument
   (bass, arpeggio, percussion): catch them and that instrument plays loud and open; miss them and it fades and
   dulls — the song sounds as good as you play. Static blocks are to be dodged.
   An original game in the music-driven-track genre: own arrangement, own track, own drawing (canvas 2D). */
(function () {
  'use strict';
  const J = window.__juegos, X = window.SyndrusEngine, G = window.SyndrusGen;
  if (!J || !X || !G) return;
  const { tr, el } = J;

  const LANES = 3, LW = 2.1;           // lanes, lane width (m)
  const SHOW = 260;                    // how far ahead the track is drawn (m)
  const LAYERS = [
    { k: 'bass', name: tr('Bajo', 'Bass'), shape: 'sq' },
    { k: 'arp', name: tr('Arpegio', 'Arp'), shape: 'dia' },
    { k: 'perc', name: tr('Percusión', 'Percussion'), shape: 'dot' },
  ];
  const COLS = () => (J.CB && J.CB() ? [[230, 159, 0], [86, 180, 233], [240, 228, 66]] : [[255, 74, 106], [63, 240, 255], [255, 210, 63]]);   // (colour-blind: Okabe–Ito; the shapes differ too)

  /* ── the arrangement: sections in bars, what plays in each, and the energy that shapes the track ── */
  const PLAN = [
    { k: 'intro', bars: 8, name: tr('Intro', 'Intro'), on: { kick: 1, hats: 1, perc: 1 }, e: [0.25, 0.35], hue: 265 },
    { k: 'build', bars: 8, name: tr('Subida', 'Build-up'), on: { kick: 1, hats: 1, bass: 1, arp: 1 }, e: [0.4, 0.75], hue: 300, roll: true },
    { k: 'drop', bars: 16, name: tr('¡Drop!', 'Drop!'), on: { kick: 1, hats: 1, bass: 1, arp: 1, perc: 1, back: 1 }, e: [1, 1], hue: 320 },
    { k: 'break', bars: 8, name: tr('Corte', 'Break'), on: { arp: 1, perc: 1 }, e: [0.3, 0.3], hue: 215 },
    { k: 'build', bars: 8, name: tr('Subida', 'Build-up'), on: { kick: 1, hats: 1, bass: 1, arp: 1, perc: 1 }, e: [0.4, 0.8], hue: 300, roll: true, lateKick: true },
    { k: 'drop', bars: 16, name: tr('¡Drop final!', 'Final drop!'), on: { kick: 1, hats: 1, bass: 1, arp: 1, perc: 1, back: 1 }, e: [1, 1], hue: 190 },
    { k: 'outro', bars: 8, name: tr('Cierre', 'Outro'), on: { kick: 1, hats: 1, perc: 1 }, e: [0.55, 0.2], hue: 265 },
  ];
  const STYLES = { techno: tr('Techno', 'Techno'), psy: 'Psytrance' };
  const keyName = root => tr(['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'][root % 12], X.NOTE_NAMES[root % 12]);

  const clone = o => JSON.parse(JSON.stringify(o));
  // the song: a SYNDRUS pattern, with every note the game shows sure to sound (no probabilities, no swing)
  function compose(style, rnd) {
    G.seed(rnd);
    let st;
    try {
      st = style === 'psy' ? G.randomPsy() : G.randomTechno();
      if (!st.arp || !st.arp.on) G.randomArp(st, { sound: 'pluck', rate: 1, octave: 4, level: 0.4, hold: 2 });
      if (!st.rings.some(r => r.pulses > 0)) st.rings[0] = G.ring({ sound: 'rim', steps: 16, pulses: 5, rot: 2, level: 0.38, delay: 0.3, reverb: 0.15 });
    } finally { G.seed(null); }
    st.swing = 0;
    st.drums.forEach(d => { d.prob = 1; });
    st.arp.prob = 1; st.arp.mute = false;
    if (st.arp.rate < 1) st.arp.rate = 1;   // 32nds: too fast to catch
    return st;
  }
  // what one section plays: the same pattern with tracks muted
  function variant(st, sec, roll) {
    const v = clone(st), on = sec.on;
    v.drums.forEach((d, i) => { d.mute = !(i === 0 ? on.kick : i === 3 || i === 4 || i === 7 ? on.hats : on.back || on.perc); });
    v.synth.mute = !on.bass; v.arp.mute = !on.arp;
    v.rings.forEach(r => { r.mute = !on.perc; });
    if (roll) {   // the last bars of a build-up: a snare roll (8ths, then 16ths)
      const d = v.drums[2]; d.mute = false; d.level = 0.5 + 0.25 * roll; d.reverb = 0.2;
      d.steps = Array.from({ length: 16 }, (_, i) => (roll === 1 ? (i % 2 === 0 ? 1 : 0) : 1));
    }
    return v;
  }

  function start(ctx) {
    const stage = ctx.stage, rnd = ctx.option === 'hoy' ? J.mulberry(J.hashStr(J.dayKey() + ':surco')) : (ctx.rnd || Math.random);   // the song of the day: the same for everyone today
    const style = ctx.option === 'psy' ? 'psy' : ctx.option === 'hoy' ? (J.hashStr(J.dayKey()) % 2 ? 'psy' : 'techno') : 'techno';
    const st = compose(style, rnd), bpm = st.bpm, stepDur = 60 / bpm / 4;

    /* ── the song laid out: sections → steps; for each step its section, energy and the variant that plays ── */
    const secs = []; let bar = 0;
    PLAN.forEach(p => { secs.push({ ...p, b0: bar, v: variant(st, p, 0), rolls: p.roll ? [variant(st, p, 1), variant(st, p, 2)] : null }); bar += p.bars; });
    const N = bar * 16, stepSec = new Int16Array(N), stepE = new Float32Array(N);
    secs.forEach((s, i) => { for (let b = 0; b < s.bars; b++) for (let k = 0; k < 16; k++) { const n = (s.b0 + b) * 16 + k, f = (b * 16 + k) / (s.bars * 16); stepSec[n] = i; stepE[n] = s.e[0] + (s.e[1] - s.e[0]) * f; } });
    const varAt = n => {
      const s = secs[stepSec[n]], b = Math.floor(n / 16) - s.b0;
      if (s.lateKick && b < 4) { if (!s._noKick) { s._noKick = clone(s.v); s._noKick.drums[0].mute = true; } return s._noKick; }
      if (s.rolls && b === s.bars - 2) return s.rolls[0];
      if (s.rolls && b === s.bars - 1) return s.rolls[1];
      return s.v;
    };

    /* ── the track: distance per step (faster when the energy is high), then height and sideways bend per metre ── */
    const speed = e => 22 + 30 * e;
    const S = new Float64Array(N + 1);
    for (let n = 0; n < N; n++) S[n + 1] = S[n] + speed(stepE[n]) * stepDur;
    const L = Math.ceil(S[N]) + SHOW + 80, Y = new Float32Array(L), Yb = new Float32Array(L), Xc = new Float32Array(L), Em = new Float32Array(L), Hm = new Float32Array(L), Pm = new Float32Array(L);
    { let n = 0; for (let m = 0; m < L; m++) { while (n < N - 1 && S[n + 1] <= m) n++; Em[m] = m < S[N] ? stepE[n] : 0.3; Hm[m] = secs[stepSec[Math.min(n, N - 1)]].hue;
      Pm[m] = m < S[N] ? n + Math.max(0, Math.min(1, (m - S[n]) / (S[n + 1] - S[n]))) : N + (m - S[N]) / (speed(0.3) * stepDur); } }   // where in the song each metre is (in steps)
    const kickBeat = new Uint8Array(N / 4 + 1);
    for (let b = 0; b < N / 4; b++) { const v = varAt(b * 4); kickBeat[b] = !v.drums[0].mute && v.drums[0].steps[(b * 4) % 16] ? 1 : 0; }
    { // the slope follows the energy (smoothed so the hills are hills): low = climbing, high = diving;
      // on top, rolling hills every two bars, and while the kick plays a bounce per beat whose dip lands right on the kick
      let y = 0, x = 0, head = 0, sm = 0.3, amp = 0;
      for (let m = 0; m < L; m++) {
        sm += (Em[m] - sm) * 0.012; const p = Pm[m], beat = Math.floor(p / 4);
        amp += ((beat < N / 4 && kickBeat[beat] ? 0.25 + 0.5 * Em[m] : 0) - amp) * 0.08;
        Yb[m] = y + Math.sin(p / 32 * 6.2832) * (0.6 + 1.6 * sm);
        Y[m] = Yb[m] + amp * Math.sin(Math.PI * (p % 4) / 4);
        y += (0.5 - sm) * 0.2;
        const bend = (Math.sin(m / 83) * 0.6 + Math.sin(m / 29 + 1.3) * 0.4) * (0.0012 + 0.0045 * sm);
        head = Math.max(-0.4, Math.min(0.4, head + bend - head * 0.004)); Xc[m] = x; x += head;
      }
    }
    const at = (A, s) => { if (s <= 0) return A[0]; const i = Math.floor(s); if (i >= L - 1) return A[L - 1]; const f = s - i; return A[i] + (A[i + 1] - A[i]) * f; };
    const distAt = t => { if (t <= 0) return t * speed(0.25); const x = t / stepDur, i = Math.floor(x); if (i >= N) return S[N] + (t - N * stepDur) * speed(0.3); return S[i] + (S[i + 1] - S[i]) * (x - i); };

    /* ── the notes the player sees: taken from what will sound, thinned so they can be caught ── */
    const notes = [], blocks = [];
    {
      let last = -1, lastLane = 1; const count = [0, 0, 0];
      for (let n = 32; n < N - 16; n++) {   // (two quiet bars first, and the last bar empty)
        const v = varAt(n), e = stepE[n], t = n * stepDur, cand = [];
        if (n % (e >= 0.9 ? 1 : 2)) continue;   // on the 8ths (16ths only in the drops): they fall with the groove
        const sy = v.synth.steps[n % 16];
        if (!v.synth.mute && sy && sy.on) cand.push([0, ((sy.deg % 3) + 3) % 3]);
        const a = v.arp;
        if (!a.mute && a.on && n % (a.rate || 1) === 0) { const k = n / (a.rate || 1); cand.push([1, [0, 1, 2, 1][k % 4]]); }
        v.rings.forEach((r, i) => { if (!r.mute && r.pulses && X.euclid(r.steps, r.pulses, r.rot)[n % r.steps]) cand.push([2, i % 3]); });
        if (!v.drums[1].mute && v.drums[1].steps[n % 16]) cand.push([2, 1]);
        const gap = e >= 0.9 ? 0.17 : e >= 0.5 ? 0.24 : 0.36;
        if (cand.length && t - last >= gap) {
          cand.sort((p, q) => count[p[0]] - count[q[0]]);   // the layer with the fewest notes so far goes first
          let [ly, lane] = cand[0];
          if (Math.abs(lane - lastLane) === 2 && t - last < 0.32) lane = 1;   // a full jump needs time
          notes.push({ n, t, lane, ly, s: S[n], st: 0 }); count[ly]++; last = t; lastLane = lane;
        }
      }
      // static blocks: in the build-ups and drops, on free 16ths, never on the lane a nearby note asks for
      for (let n = 32; n < N - 16; n++) {
        const s = secs[stepSec[n]]; if (s.k !== 'drop' && s.k !== 'build') continue;
        if (n % 4 !== 2 || rnd() > (s.k === 'drop' ? 0.4 : 0.2)) continue;
        const t = n * stepDur, near = notes.filter(q => Math.abs(q.t - t) < 0.3), busy = new Set(near.map(q => q.lane));
        const free = [0, 1, 2].filter(l => !busy.has(l)); if (!free.length || near.some(q => Math.abs(q.t - t) < 0.09)) continue;
        if (free.length === 3) free.splice(1, 1);   // with nothing near: never the middle (there's always a way round)
        blocks.push({ n, t, lane: free[Math.floor(rnd() * free.length)], s: S[n], st: 0 });
      }
    }

    /* ── stage ── */
    stage.classList.add('sc-stage');
    const wrap = el('div', 'sc-wrap'), cv = el('canvas', 'sc-cv'), g = cv.getContext('2d');
    const hudL = el('div', 'sc-hud'), scoreEl = el('b', 'sc-score', '0'), comboEl = el('span', 'sc-combo', '');
    hudL.append(scoreEl, comboEl);
    const meters = el('div', 'sc-meters'), mEls = LAYERS.map((Lr, i) => { const m = el('div', 'sc-m'), bar2 = el('i'); m.append(el('span', null, Lr.name), bar2); m.dataset.l = i; meters.append(m); return bar2; });
    const prog = el('div', 'sc-prog'), progFill = el('i'), progLbl = el('span');
    prog.append(progFill, progLbl);
    const bigEl = el('div', 'sc-big'), pauseEl = el('div', 'sc-pause'), pauseBtn = el('button', 'sc-pbtn', 'II');
    pauseEl.append(el('b', null, tr('Pausa', 'Paused')), el('span', null, tr('Tocá para seguir', 'Tap to go on'))); pauseEl.hidden = true;
    pauseBtn.title = tr('Pausa (P)', 'Pause (P)');
    const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    const hint = el('div', 'sc-hint', touch ? tr('Tocá a la izquierda o a la derecha para cambiar de carril', 'Tap left or right to switch lanes') : tr('← → o A D para cambiar de carril · P pausa', '← → or A D to switch lanes · P pause'));
    wrap.append(cv, hudL, meters, prog, bigEl, hint, pauseBtn, pauseEl);
    stage.append(wrap);
    const COL = COLS(), rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    meters.querySelectorAll('.sc-m').forEach((m, i) => { m.style.setProperty('--c', `rgb(${COL[i].join(',')})`); });

    /* ── sound ── */
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC(); try { ac.resume(); } catch (e) { /* the click already counts as a gesture */ }
    const E = X.buildEngine(ac, ac.destination), D = E.decks[0];
    const deckMix = { level: 0.9, dj: 0, eqLo: 0, eqMid: 0, eqHi: 0, kill: false, cue: false };
    X.applyPattern(D, st, bpm); D.setMix(deckMix, 1); E.decks[1].setMix({ ...deckMix, level: 0 }, 0);
    E.setMaster({ drive: 0.12, comp: 0.5, volume: 0.8 });
    const T0 = ac.currentTime + 0.35;
    let next = 0;   // next step to schedule
    const kicks = [], hats = [];
    function schedule() {
      if (paused) return;
      const until = ac.currentTime + 0.14;
      while (next < N && T0 + next * stepDur < until) {
        const n = next, t = T0 + n * stepDur, v = varAt(n);
        X.playStep(D, { ...v, bpm }, n, t, Math.random);
        if (!v.drums[0].mute && v.drums[0].steps[n % 16]) kicks.push(t - T0);
        if (!v.drums[3].mute && v.drums[3].steps[n % 16]) hats.push(t - T0);
        // the arrangement's own sweeps: a riser over each build-up, an impact on each drop, a sweep down after it
        const s = secs[stepSec[n]], first = n === s.b0 * 16;
        if (first && s.k === 'build') E.riser(t, s.bars * 16 * stepDur - stepDur * 2, 0.3);
        if (first && s.k === 'drop') E.impact(t);
        if (first && (s.k === 'break' || s.k === 'outro')) E.downer(t, stepDur * 16, 0.25);
        next++;
      }
    }

    /* ── the layers' health → how they sound ── */
    const H = [0.5, 0.5, 0.5]; let lastMix = '';
    function mix(now) {
      const s = secs[stepSec[Math.max(0, Math.min(N - 1, Math.floor(now / stepDur)))]];
      let dj = 0;   // a build-up opens a high-pass that lets go on the drop
      if (s.k === 'build') { const f = (now / stepDur - s.b0 * 16) / (s.bars * 16); dj = Math.max(0, Math.min(1, f)) * 0.42; }
      const f = H.map(h => 0.1 + 0.9 * h), key = f.map(x => x.toFixed(2)).join() + dj.toFixed(2);
      if (key === lastMix) return; lastMix = key;
      D.synthStrip.set({ ...st.synth, level: st.synth.level * f[0] });
      D.synth.set({ ...st.synth, cutoff: st.synth.cutoff * (0.35 + 0.65 * H[0]) });
      D.arpStrip.set({ ...st.arp, level: st.arp.level * f[1] });
      st.rings.forEach((r, i) => D.ringStrips[i].set({ ...r, level: r.level * f[2] }));
      [1, 2, 5, 6].forEach(i => D.drumStrips[i].set({ ...st.drums[i], level: st.drums[i].level * (0.25 + 0.75 * f[2]) }));
      D.setMix({ ...deckMix, dj }, 1);
    }

    /* ── play state ── */
    const P = { lane: 1, x: 1, score: 0, combo: 0, maxCombo: 0, caught: 0, missed: 0, hitBlocks: 0, fx: [], rings: [], glitch: 0, tilt: 0, done: false, frames: 0 };
    let paused = false, raf = 0, ended = false, lastSec = -1, bigT = 0, auto = false, prevNow = -1;
    const mult = () => Math.min(8, 1 + Math.floor(P.combo / 8));
    const songTime = () => ac.currentTime - T0 - (ac.outputLatency || ac.baseLatency || 0);
    function move(d) { if (paused || ended) return; P.lane = Math.max(0, Math.min(LANES - 1, P.lane + d)); hint.classList.add('off'); }
    function burst(x, y, s, c, nn) { for (let i = 0; i < nn; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 7; P.fx.push({ x, y: y + 0.3, s, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 + 3, vs: (Math.random() - 0.3) * 6, life: 0.5 + Math.random() * 0.4, c }); } }
    function catchNote(q) {
      q.st = 1; P.combo++; P.maxCombo = Math.max(P.maxCombo, P.combo); P.caught++;
      P.score += 100 * mult(); H[q.ly] = Math.min(1, H[q.ly] + 0.09);
      burst(at(Xc, q.s) + (q.lane - 1) * LW, at(Y, q.s) + 0.75, q.s, COL[q.ly], 16); P.rings.push({ life: 0.45, c: COL[q.ly] });
    }
    function missNote(q) { q.st = 2; P.combo = 0; P.missed++; H[q.ly] = Math.max(0, H[q.ly] - 0.15); }
    function hitBlock(b) {
      b.st = 1; P.combo = 0; P.hitBlocks++; P.score = Math.max(0, P.score - 300); P.glitch = 1;
      for (let i = 0; i < 3; i++) H[i] = Math.max(0, H[i] - 0.08);
      try { E.hit('snare', D.drumStrips[2].input, ac.currentTime + 0.01, { tune: 0.5, decay: 0.3, vel: 1 }); } catch (e) { /* a sound less */ }
    }

    /* ── input ── */
    const onKey = e => {
      if (e.repeat) return;
      const k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') { move(-1); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'KeyD') { move(1); e.preventDefault(); }
      else if (k === 'KeyP' || k === 'Space') { setPause(!paused); e.preventDefault(); }
    };
    addEventListener('keydown', onKey);
    const onDown = e => {
      if (paused) { setPause(false); return; }
      const R = wrap.getBoundingClientRect(); move(e.clientX - R.left < R.width / 2 ? -1 : 1); e.preventDefault();
    };
    cv.addEventListener('pointerdown', onDown);
    pauseEl.addEventListener('click', () => setPause(false));
    pauseBtn.addEventListener('click', e => { e.stopPropagation(); setPause(!paused); });
    const onVis = () => { if (document.hidden && !paused && !ended) setPause(true); };
    document.addEventListener('visibilitychange', onVis);
    const pad = { l: false, r: false };
    function pollPad() {
      const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(x => x && x.connected) : null; if (!gp) return;
      const ax = gp.axes[0] || 0, l = ax < -0.5 || (gp.buttons[14] && gp.buttons[14].pressed), r = ax > 0.5 || (gp.buttons[15] && gp.buttons[15].pressed);
      if (l && !pad.l) move(-1); if (r && !pad.r) move(1); pad.l = l; pad.r = r;
      const sb = gp.buttons[9] && gp.buttons[9].pressed; if (sb && !pad.s) setPause(!paused); pad.s = sb;
    }
    function setPause(v) {
      if (ended || v === paused) return;
      paused = v; pauseEl.hidden = !v;
      try { if (v) ac.suspend(); else ac.resume(); } catch (e) { /* ignore */ }
    }

    /* ── the loop ── */
    let W = 0, Hh = 0, dpr = 1;
    function size() {
      const r = wrap.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2) * Q;
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (w !== cv.width || h !== cv.height) { cv.width = w; cv.height = h; }
      W = w; Hh = h;
    }
    const tick = setInterval(schedule, 25);
    let lastT = performance.now(), Q = 1, qSum = 0, qN = 0;   // Q: the resolution scale, lowered when the frames come slow
    function frame() {
      raf = requestAnimationFrame(frame);
      const tn = performance.now(), raw = (tn - lastT) / 1000, dt = Math.min(0.05, raw); lastT = tn;
      if (!paused && raw < 0.25) { qSum += raw; qN++; if (qN >= 90) { if (qSum / qN > 0.024 && Q > 0.6) Q = Math.round((Q - 0.2) * 10) / 10; qSum = 0; qN = 0; } }
      pollPad(); schedule();
      if (paused) return;
      size();
      const now = songTime();
      update(now, dt); draw(now);
      if (!ended && now > N * stepDur + 1.5) finish();
    }
    function update(now, dt) {
      if (auto) { const q = notes.find(q => !q.st && q.t > now - 0.02); if (q && q.t - now < 0.5) { P.lane = q.lane; P.x = q.lane; } }   // (tests)
      const px = P.x; P.x += (P.lane - P.x) * Math.min(1, dt * 16); P.tilt += ((P.x - px) / Math.max(dt, 1e-3) * 0.06 - P.tilt) * Math.min(1, dt * 10);
      const lane = Math.round(P.x);
      // every note that reached the ship since the last frame is judged (a slow phone that skips frames doesn't lose notes)
      // a note is caught on its own time (when it sounds); being in its lane a moment before counts too
      for (const q of notes) {
        if (q.st || q.t > now + 0.07) continue;
        if (lane === q.lane && Math.abs(P.x - q.lane) < 0.45) q.ok = true;
        if (q.ok && now >= q.t) catchNote(q);
        else if (now > q.t + 0.09) missNote(q);
      }
      for (const b of blocks) { if (b.st || b.t > now) continue; if (now > b.t + 0.06 && b.t < prevNow - 0.06) { b.st = 2; continue; } if (Math.abs(P.x - b.lane) < 0.5) hitBlock(b); else if (now > b.t + 0.06) b.st = 2; }
      prevNow = now; P.frames++;
      P.fx = P.fx.filter(f => { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 14 * dt; f.s += f.vs * dt; return f.life > 0; });
      P.glitch = Math.max(0, P.glitch - dt * 2.5);
      P.rings = P.rings.filter(x => (x.life -= dt) > 0);
      mix(now);
      // the HUD
      scoreEl.textContent = P.score.toLocaleString(J.LOCALE);
      comboEl.textContent = P.combo > 1 ? `×${mult()} · ${P.combo}` : '';
      H.forEach((h, i) => { mEls[i].style.width = Math.round(h * 100) + '%'; });
      const n = Math.max(0, Math.min(N - 1, Math.floor(now / stepDur))), si = stepSec[n];
      progFill.style.width = Math.max(0, Math.min(100, now / (N * stepDur) * 100)) + '%';
      if (si !== lastSec && now >= 0) { lastSec = si; progLbl.textContent = secs[si].name; if (si > 0) { bigEl.textContent = secs[si].name; bigEl.classList.remove('on'); void bigEl.offsetWidth; bigEl.classList.add('on'); bigT = 1.6; } }
      if (bigT > 0) { bigT -= dt; if (bigT <= 0) bigEl.classList.remove('on'); }
    }

    // project a point of the world (x sideways, y up, s along the track) with the camera behind the ship
    let cam = { s: 0, x: 0, y: 0, F: 1, hz: 0 };
    const proj = (x, y, s) => { const dz = s - cam.s; if (dz < 0.6) return null; const k = cam.F / dz; return [W / 2 + (x - cam.x) * k, cam.hz - (y - cam.y) * k, k]; };

    /* ── little 3D models, drawn as flat-shaded polygons (painter's order) ── */
    const SHIP_V = [[0, 0.12, 1.9], [0, 0.42, 0.3], [-0.3, 0.15, 0.2], [0.3, 0.15, 0.2], [0, 0.3, -0.75], [-0.28, 0.08, -0.8], [0.28, 0.08, -0.8],
      [-1.25, 0.02, -0.85], [1.25, 0.02, -0.85], [0, -0.06, -0.1], [-1.12, 0.36, -0.98], [1.12, 0.36, -0.98], [-0.42, 0.1, -0.05], [0.42, 0.1, -0.05], [0, 0.28, 0.95]];
    // faces: [vertices, kind] — g glass (the cockpit), b body, w wing, f fin, e engine, u under
    const SHIP_F = [[[0, 2, 14], 'b'], [[0, 14, 3], 'b'], [[14, 2, 1], 'g'], [[14, 1, 3], 'g'], [[1, 2, 4], 'b'], [[1, 4, 3], 'b'], [[2, 5, 4], 'b'], [[3, 4, 6], 'b'],
      [[2, 12, 7, 5], 'w'], [[3, 6, 8, 13], 'w'], [[0, 9, 2], 'u'], [[0, 3, 9], 'u'], [[2, 9, 5], 'u'], [[3, 6, 9], 'u'], [[9, 5, 6], 'u'],
      [[7, 10, 5], 'f'], [[8, 6, 11], 'f'], [[5, 6, 4], 'e']];
    const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const CUBE_F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]];
    const OCTA_V = [[0, 1.3, 0], [0, -1.3, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    const OCTA_F = [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]];
    const LX = 0.35, LY = 0.85, LZ = -0.4, LN = Math.hypot(LX, LY, LZ);
    function rot(v, roll, pitch, yaw) {
      let [x, y, z] = v, c = Math.cos(roll), s = Math.sin(roll);
      [x, y] = [x * c - y * s, x * s + y * c];
      c = Math.cos(pitch); s = Math.sin(pitch); [y, z] = [y * c + z * s, -y * s + z * c];
      c = Math.cos(yaw); s = Math.sin(yaw); [x, z] = [x * c + z * s, -x * s + z * c];
      return [x, y, z];
    }
    // V, F, where (x, y, s), rotation, size, colour of a face (kind, light 0…1) → [fill, edge|null]
    function mesh(V, F, ox, oy, os, roll, pitch, yaw, sc, paint) {
      const w = V.map(v => { const r = rot(v, roll, pitch, yaw); return [ox + r[0] * sc, oy + r[1] * sc, os + r[2] * sc]; });
      const p = w.map(q => proj(q[0], q[1], q[2])); if (p.some(x => !x)) return;
      const fs = F.map(f => {
        const ids = Array.isArray(f[0]) ? f[0] : f, a = w[ids[0]], b = w[ids[1]], c = w[ids[2]];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
        return { ids, kind: f[1], light: Math.abs(nx * LX + ny * LY + nz * LZ) / nl / LN, depth: ids.reduce((t, k) => t + w[k][2], 0) / ids.length };
      }).sort((a, b) => b.depth - a.depth);
      for (const f of fs) {
        const [fill, edge] = paint(f.kind, f.light);
        g.beginPath(); f.ids.forEach((k, i) => (i ? g.lineTo(p[k][0], p[k][1]) : g.moveTo(p[k][0], p[k][1]))); g.closePath();
        g.fillStyle = fill; g.fill(); if (edge) { g.strokeStyle = edge; g.stroke(); }
      }
    }

    /* ── the sky: stars, and a skyline that is the music's spectrum ── */
    const STARS = Array.from({ length: 170 }, () => [Math.random(), Math.random() * 0.62, 0.3 + Math.random() * 1.2, Math.random() * 6.28]);
    const spec = new Uint8Array(E.analyser ? E.analyser.frequencyBinCount : 1024), BARS = 40;
    const trail = [];   // the wingtips' last positions
    let camY0 = null;
    function draw(now) {
      const shipS = distAt(now), e = at(Em, shipS), hue = at(Hm, shipS);
      const kick = kicks.length ? Math.exp(-Math.max(0, now - (kicks.filter(k => k <= now).pop() ?? -9)) * 7) : 0;
      const hat = hats.length ? Math.exp(-Math.max(0, now - (hats.filter(k => k <= now).pop() ?? -9)) * 14) : 0;
      while (kicks.length > 8 && kicks[1] < now) kicks.shift();
      while (hats.length > 8 && hats[1] < now) hats.shift();
      const shipX = at(Xc, shipS) + (P.x - 1) * LW;
      const slope = Math.atan2(at(Yb, shipS + 3) - at(Yb, shipS - 3), 6), pitch = Math.atan2(at(Y, shipS + 1.5) - at(Y, shipS - 1.5), 3), bank = Math.max(-0.6, Math.min(0.6, -P.tilt * 0.55));
      cam.s = shipS - 7.6; cam.x = at(Xc, shipS) * 0.85 + shipX * 0.15; cam.y = at(Yb, shipS) + 3.1 + slope * 1.5; const wideV = W > Hh * 2; cam.F = Math.min(Hh * (wideV ? 1.25 : 0.95), W * 1.0); cam.hz = Hh * ((wideV ? 0.3 : 0.36) + slope * 0.5);   // (a phone on its side: closer, so the ship isn't tiny)
      for (const d of [1.4, 2.6, 4]) cam.y = Math.max(cam.y, at(Y, cam.s + d) + (Hh - cam.hz) * d / cam.F + 0.1);   // the nearest track always reaches below the screen (no cut edge in the descents)
      cam.y += ((camY0 ?? cam.y) - cam.y) * 0.5; camY0 = cam.y;   // (F: a phone held upright still fits the whole track across)
      // sky
      const sk = g.createLinearGradient(0, 0, 0, Hh);
      sk.addColorStop(0, `hsl(${hue + 20},60%,${3 + 3 * kick * e}%)`); sk.addColorStop(0.42, `hsl(${hue},70%,${8 + 8 * kick * e}%)`); sk.addColorStop(1, '#020206');
      g.fillStyle = sk; g.fillRect(0, 0, W, Hh);
      const px = (cam.x * 0.004) % 1;
      for (const s of STARS) { const x = ((s[0] - px + 1) % 1) * W, y = s[1] * cam.hz, a = 0.35 + 0.35 * Math.sin(now * s[2] + s[3]); g.fillStyle = `rgba(230,240,255,${a})`; g.fillRect(x, y, s[2] * dpr, s[2] * dpr); }
      // the ring on the horizon, breathing with the kick
      const rr = Hh * (0.17 + 0.03 * kick);
      g.lineWidth = 3 * dpr;
      g.strokeStyle = `hsla(${hue - 40},90%,65%,${0.25 + 0.35 * kick})`; g.beginPath(); g.arc(W / 2, cam.hz, rr, Math.PI, 0); g.stroke();
      g.strokeStyle = `hsla(${hue + 30},90%,65%,${0.12 + 0.2 * kick})`; g.beginPath(); g.arc(W / 2, cam.hz, rr * 1.5, Math.PI, 0); g.stroke();
      // the spectrum skyline (mirrored from the middle)
      if (E.analyser) {
        E.analyser.getByteFrequencyData(spec);
        const bw = W / 2 / BARS;
        for (let i = 0; i < BARS; i++) {
          const b0 = Math.floor(2 * Math.pow(spec.length / 6 / 2, i / BARS)), v = spec[Math.min(spec.length - 1, b0)] / 255, h = v * v * Hh * 0.22 + 2 * dpr;
          g.fillStyle = `hsla(${hue - 30 + i * 3},90%,${45 + 20 * v}%,${0.12 + 0.3 * v})`;
          g.fillRect(W / 2 + i * bw + 1, cam.hz - h, bw - 2, h); g.fillRect(W / 2 - (i + 1) * bw + 1, cam.hz - h, bw - 2, h);
        }
      }
      // in the drops: streaks rushing past from the vanishing point
      if (e > 0.85) {
        g.strokeStyle = `hsla(${hue + 40},90%,80%,${0.12 + 0.12 * kick})`; g.lineWidth = dpr;
        for (let i = 0; i < 26; i++) { const a = (i * 2.4 + Math.floor(now * 8) * 0.37) % 6.283, r0 = ((now * 2.6 + i * 0.137) % 1) * W * 0.7, r1 = r0 + W * 0.06; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * r0, cam.hz + Math.sin(a) * r0 * 0.6); g.lineTo(W / 2 + Math.cos(a) * r1, cam.hz + Math.sin(a) * r1 * 0.6); g.stroke(); }
      }

      // the world leans a little with the ship
      g.save(); g.translate(W / 2, cam.hz); g.rotate(bank * 0.12); g.translate(-W / 2, -cam.hz);
      // the track, far to near: pillars under it, its thickness, the surface (coloured by the intensity), lanes and glowing rails
      const STEP = 2.6, half = LW * 1.5 + 0.35, TH = 0.55, RAIL = 0.4;
      const segs = []; for (let s = Math.ceil((cam.s + SHOW) / STEP) * STEP; s > cam.s + 1.4; s -= STEP) segs.push(s);
      const pts = segs.map(s => { const c = at(Xc, s), y = at(Y, s); return { s, c, y, e: at(Em, s),
        l: proj(c - half, y, s), r: proj(c + half, y, s), lb: proj(c - half, y - TH, s), rb: proj(c + half, y - TH, s), lr: proj(c - half, y + RAIL, s), rr: proj(c + half, y + RAIL, s),
        lanes: [0, 1, 2, 3].map(k => proj(c - half + 0.35 + k * LW, y, s)) }; });
      const quad = (a, b, c, d) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); };
      let prev = null;
      for (const p of pts) {
        if (!p.l || !p.r || !p.lb || !p.lr) { prev = null; continue; }
        if (prev) {
          const far = (p.s - cam.s) / SHOW, near = 1 - far, th = 260 - 230 * p.e;   // intensity → colour: violet (calm) … red-orange (drop)
          if (Math.floor(prev.s / 40) !== Math.floor(p.s / 40)) {   // a pillar down into the void
            const top = proj(p.c, p.y - TH, p.s), bot = proj(p.c, p.y - 45, p.s);
            if (top && bot) { const gr = g.createLinearGradient(0, top[1], 0, bot[1]); gr.addColorStop(0, `hsla(${th},70%,45%,${0.5 * near})`); gr.addColorStop(1, `hsla(${th},70%,45%,0)`); g.strokeStyle = gr; g.lineWidth = Math.max(1, top[2] * 0.35); g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(bot[0], bot[1]); g.stroke(); }
          }
          g.fillStyle = `hsla(${th},60%,${6 + 5 * near}%,0.95)`;   // the sides of the slab
          quad(prev.l, p.l, p.lb, prev.lb); g.fill(); quad(prev.r, p.r, p.rb, prev.rb); g.fill();
          for (let k = 0; k < 3; k++) {   // the lanes, each its own shade, a darker band every few metres
            const band = Math.floor(p.s / 7.8) % 2, L0 = k === 0 ? prev.l : prev.lanes[k], L1 = k === 0 ? p.l : p.lanes[k], R0 = k === 2 ? prev.r : prev.lanes[k + 1], R1 = k === 2 ? p.r : p.lanes[k + 1];
            if (!L0 || !L1 || !R0 || !R1) continue;
            g.fillStyle = `hsla(${th + (k - 1) * 12},65%,${(band ? 11 : 8.5) + 10 * p.e * near + (k === 1 ? 1.5 : 0)}%,0.96)`;
            quad(L0, R0, R1, L1); g.fill();
          }
          g.strokeStyle = `hsla(${th + 40},90%,72%,${0.6 * near})`; g.lineWidth = Math.max(1, 1.6 * dpr * near);
          g.beginPath(); for (let k = 1; k < 3; k++) if (prev.lanes[k] && p.lanes[k]) { g.moveTo(prev.lanes[k][0], prev.lanes[k][1]); g.lineTo(p.lanes[k][0], p.lanes[k][1]); } g.stroke();
          g.fillStyle = `hsla(${th - 30},95%,60%,${0.12 + 0.12 * kick})`;   // the rails: glass walls with a bright top
          quad(prev.l, p.l, p.lr, prev.lr); g.fill(); quad(prev.r, p.r, p.rr, prev.rr); g.fill();
          g.strokeStyle = `hsla(${th - 30},95%,${60 + 20 * kick}%,${0.3 + 0.7 * near})`; g.lineWidth = Math.max(1, (2 + 3 * kick) * dpr * near);
          g.beginPath(); g.moveTo(prev.lr[0], prev.lr[1]); g.lineTo(p.lr[0], p.lr[1]); g.moveTo(prev.rr[0], prev.rr[1]); g.lineTo(p.rr[0], p.rr[1]); g.stroke();
        }
        prev = p;
      }
      // the beats laid on the track: a line on every beat (thicker on each bar) that you ride over in time
      for (let n = Math.max(0, Math.floor(now / stepDur / 4) * 4); n < N; n += 4) {
        const s = S[n]; if (s < cam.s + 1) continue; if (s > cam.s + SHOW * 0.8) break;
        const c = at(Xc, s), y = at(Y, s), a = proj(c - half, y + 0.01, s), b = proj(c + half, y + 0.01, s); if (!a || !b) continue;
        const far = (s - cam.s) / SHOW, bar1 = n % 16 === 0;
        g.strokeStyle = `hsla(${hue + 20},90%,78%,${(bar1 ? 0.6 : 0.3) * (1 - far)})`; g.lineWidth = Math.max(1, (bar1 ? 3 : 1.5) * dpr * (1 - far));
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      // posts along the rails that flash with the hats
      for (let s = Math.ceil((cam.s + 10) / 12) * 12; s < cam.s + SHOW * 0.7; s += 12) {
        const c = at(Xc, s), y = at(Y, s);
        for (const side of [-1, 1]) {
          const a = proj(c + side * (half + 0.15), y + RAIL, s), b = proj(c + side * (half + 0.15), y + RAIL + 1.3 + 1.2 * e, s); if (!a || !b) continue;
          g.strokeStyle = `hsla(${hue + 60},90%,72%,${0.15 + 0.6 * hat})`; g.lineWidth = Math.max(1, Math.min(3 * dpr, a[2] * 0.06));
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
          g.fillStyle = `hsla(${hue + 60},90%,80%,${0.3 + 0.7 * hat})`; const r = Math.max(1, Math.min(4 * dpr, a[2] * 0.08)); g.fillRect(b[0] - r, b[1] - r, r * 2, r * 2);
        }
      }
      // notes (little 3D pieces that spin) and static blocks, far to near
      const objs = [];
      for (const q of notes) { if (q.st === 1 || q.s < cam.s + 0.8 || q.s > cam.s + SHOW) continue; objs.push(q); }
      for (const b of blocks) { if (b.st === 1 || b.s < cam.s + 0.8 || b.s > cam.s + SHOW) continue; if (b.st === 2 && b.s < cam.s + 7) continue; objs.push(b); }
      objs.sort((a, b) => b.s - a.s);
      g.lineWidth = Math.max(1, dpr);
      for (const o of objs) {
        const c = at(Xc, o.s) + (o.lane - 1) * LW, y = at(Y, o.s);
        if (o.ly === undefined) {   // static: a dark box, its face a screen of noise
          mesh(CUBE_V, CUBE_F, c, y + 0.7, o.s, 0, 0, 0, 0.72, (k, l) => [`rgba(${40 + 50 * l},${40 + 50 * l},${52 + 50 * l},0.96)`, 'rgba(255,255,255,0.55)']);
          const p0 = proj(c - 0.66, y + 0.06, o.s - 0.72), p1 = proj(c + 0.66, y + 1.34, o.s - 0.72); if (!p0 || !p1) continue;
          const w2 = p1[0] - p0[0], h2 = p0[1] - p1[1], cells = 7;
          for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) { const v = Math.random(); if (v < 0.4) continue; g.fillStyle = `rgba(${200 + v * 55},${200 + v * 55},${215 + v * 40},${0.3 + 0.55 * v})`; g.fillRect(p0[0] + w2 * i / cells, p1[1] + h2 * j / cells, w2 / cells + 0.5, h2 / cells + 0.5); }
          continue;
        }
        const col = COL[o.ly], dim = o.st === 2 ? 0.3 : 1, yy = y + 0.75 + Math.sin(now * 5 + o.n) * 0.07, spin = now * 2.2 + o.n * 0.7;
        const halo = proj(c, yy, o.s); if (!halo) continue;
        g.fillStyle = rgba(col, 0.16 * dim); g.beginPath(); g.arc(halo[0], halo[1], Math.max(2, 0.95 * halo[2]), 0, 6.283); g.fill();
        const paint = (k, l) => [`rgba(${Math.round(col[0] * (0.45 + 0.6 * l))},${Math.round(col[1] * (0.45 + 0.6 * l))},${Math.round(col[2] * (0.45 + 0.6 * l))},${dim})`, `rgba(255,255,255,${0.55 * dim})`];
        if (o.ly === 0) mesh(CUBE_V, CUBE_F, c, yy, o.s, 0.5, spin * 0.5, spin, 0.36, paint);
        else if (o.ly === 1) mesh(OCTA_V, OCTA_F, c, yy, o.s, 0, 0, spin, 0.42, paint);
        else {   // percussion: a glowing orb with a ring around it
          const r = Math.max(1.5, 0.4 * halo[2]), gr = g.createRadialGradient(halo[0] - r * 0.3, halo[1] - r * 0.3, r * 0.1, halo[0], halo[1], r);
          gr.addColorStop(0, `rgba(255,255,255,${dim})`); gr.addColorStop(0.35, rgba(col, dim)); gr.addColorStop(1, rgba(col.map(v => v * 0.4), dim));
          g.fillStyle = gr; g.beginPath(); g.arc(halo[0], halo[1], r, 0, 6.283); g.fill();
          g.strokeStyle = rgba(col, 0.8 * dim); g.beginPath(); g.ellipse(halo[0], halo[1], r * 1.6, r * 0.45, Math.sin(spin) * 0.4, 0, 6.283); g.stroke();
        }
      }
      // the sparks of what you caught, and a ring that opens around the ship
      for (const f of P.fx) { const p = proj(f.x, f.y, f.s); if (!p || f.s - cam.s < 4) continue; g.fillStyle = rgba(f.c, Math.min(1, f.life * 2)); const r = Math.max(1, Math.min(5 * dpr, 0.07 * p[2])); g.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); }

      // the ship: a little low-poly craft hovering over the track, banking into each lane change and pitching with the slope
      const hov = 0.55 + Math.sin(now * 3.1) * 0.04 - kick * 0.08, sy = at(Y, shipS) + hov, ss = shipS;
      const sh = proj(shipX, at(Y, shipS) + 0.02, ss);   // its shadow on the track
      if (sh) {
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(sh[0], sh[1], 1.1 * sh[2], 0.28 * sh[2], 0, 0, 6.283); g.fill();
        if (kick > 0.05) { g.fillStyle = `hsla(${hue - 40},100%,65%,${0.45 * kick * e})`; g.beginPath(); g.ellipse(sh[0], sh[1], (1.2 + 1.4 * (1 - kick)) * sh[2], (0.3 + 0.3 * (1 - kick)) * sh[2], 0, 0, 6.283); g.fill(); }   // it lands on the kick
      }
      // the wingtips leave two ribbons of light
      const tipL = rot([-1.2, 0.2, -0.95], bank, pitch, 0), tipR = rot([1.2, 0.2, -0.95], bank, pitch, 0);
      trail.push([shipX + tipL[0] * 0.9, sy + tipL[1] * 0.9, ss + tipL[2] * 0.9, shipX + tipR[0] * 0.9, sy + tipR[1] * 0.9, ss + tipR[2] * 0.9]); if (trail.length > 22) trail.shift();
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i], al = i / trail.length;
        for (const o of [0, 3]) { const p0 = proj(a[o], a[o + 1], a[o + 2]), p1 = proj(b[o], b[o + 1], b[o + 2]); if (!p0 || !p1) continue; g.strokeStyle = `hsla(${hue - 40},95%,70%,${0.5 * al})`; g.lineWidth = Math.max(1, 2.5 * dpr * al); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
      }
      // the engines' flame behind it
      const eng = rot([0, 0.17, -0.9], bank, pitch, 0), ep = proj(shipX + eng[0] * 0.9, sy + eng[1] * 0.9, ss + eng[2] * 0.9);
      if (ep) { const r = (0.4 + 0.2 * kick + Math.random() * 0.08) * ep[2], gr = g.createRadialGradient(ep[0], ep[1], 0, ep[0], ep[1], r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, `hsla(${hue - 40},100%,65%,0.8)`); gr.addColorStop(1, `hsla(${hue - 40},100%,50%,0)`); g.fillStyle = gr; g.beginPath(); g.arc(ep[0], ep[1], r, 0, 6.283); g.fill(); }
      const tone = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
      g.lineWidth = Math.max(1, 1.2 * dpr);
      mesh(SHIP_V, SHIP_F, shipX, sy, ss, bank, pitch, 0, 1.0, (k, l) => {
        if (k === 'g') return [`hsla(190,90%,${30 + 45 * l}%,0.95)`, 'rgba(200,255,255,0.8)'];
        if (k === 'w') return [tone(hue - 40, 85, 25 + 40 * l), tone(hue - 40, 95, 72)];
        if (k === 'f') return [tone(hue - 10, 80, 30 + 40 * l), tone(hue - 10, 95, 75)];
        if (k === 'e') return ['rgba(255,255,255,0.95)', tone(hue - 40, 100, 70)];
        if (k === 'u') return [tone(hue, 30, 8 + 14 * l), null];
        return [tone(hue + 200, 12, 55 + 38 * l), 'rgba(255,255,255,0.35)'];
      });
      for (const r of P.rings) { const p = proj(shipX, sy, ss); if (!p) continue; const f = 1 - r.life / 0.45; g.strokeStyle = rgba(r.c, r.life * 2); g.lineWidth = Math.max(1, 3 * dpr * (1 - f)); g.beginPath(); g.ellipse(p[0], p[1], (0.8 + 1.6 * f) * p[2], (0.3 + 0.5 * f) * p[2], 0, 0, 6.283); g.stroke(); }
      g.restore();
      // a glitch when you crash into static
      if (P.glitch > 0) {
        for (let i = 0; i < 10; i++) { const y = Math.random() * Hh, h = (4 + Math.random() * 30) * dpr, dx = (Math.random() - 0.5) * 60 * dpr * P.glitch; try { g.drawImage(cv, 0, y, W, h, dx, y, W, h); } catch (e) { /* ignore */ } }
        g.fillStyle = `rgba(255,255,255,${0.12 * P.glitch})`; g.fillRect(0, 0, W, Hh);
      }
    }

    /* ── the end ── */
    function finish() {
      if (ended) return; ended = true;
      const total = notes.length, pct = total ? Math.round(P.caught / total * 100) : 0;
      const grade = pct >= 95 && !P.hitBlocks ? 'S' : pct >= 85 ? 'A' : pct >= 70 ? 'B' : pct >= 50 ? 'C' : 'D';
      const words = { S: tr('¡Perfecto!', 'Perfect!'), A: tr('¡Muy bien surfeado!', 'Nicely surfed!'), B: tr('Buen surco', 'A good groove'), C: tr('El tema sonó a medias', 'The song half played'), D: tr('El tema se apagó', 'The song faded out') };
      const box = el('div', 'sc-res');
      LAYERS.forEach((Lr, i) => { const t = notes.filter(q => q.ly === i), c = t.filter(q => q.st === 1).length; const r = el('div', 'sc-rrow'); r.style.setProperty('--c', `rgb(${COL[i].join(',')})`); r.append(el('span', null, Lr.name), el('b', null, t.length ? Math.round(c / t.length * 100) + '%' : '—')); box.append(r); });
      ctx.done({ score: P.score, text: `${grade} · ${words[grade]}`,
        detail: tr(`${P.caught} de ${total} notas (${pct} %) · combo máximo ${P.maxCombo} · ${STYLES[style]} en ${keyName(st.root)} a ${bpm} BPM`, `${P.caught} of ${total} notes (${pct}%) · best combo ${P.maxCombo} · ${STYLES[style]} in ${keyName(st.root)} at ${bpm} BPM`),
        better: 'high', extra: [box] });
    }

    raf = requestAnimationFrame(frame);
    ctx.hud(`<span class="jg-hud-i">${STYLES[style]} · ${bpm} BPM</span>`);
    Object.assign(ctx.test, { quality: () => Q, cam, P, H, notes, blocks, secs, st, N, stepDur, songTime, finish, setPause, move, setAuto(v) { auto = !!v; } });   // (Object.assign would drop a setter)

    return () => {
      clearInterval(tick); cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
      stage.classList.remove('sc-stage');
      try { ac.close(); } catch (e) { /* already closed */ }
    };
  }

  const ART = '<svg viewBox="0 0 120 64"><defs><linearGradient id="scg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff3fa4"/><stop offset="1" stop-color="#3ff0ff"/></linearGradient></defs>'
    + '<path d="M10 62 L52 18 L68 18 L110 62 Z" fill="#0d0a1c" stroke="url(#scg)" stroke-width="2.5"/><path d="M58 18 L50 62 M62 18 L70 62" stroke="#ff3fa4" stroke-width="1" opacity=".6"/>'
    + '<rect x="47" y="30" width="7" height="7" fill="#ff4a6a"/><path d="M66 38 l5 -5 l5 5 l-5 5 z" fill="#3ff0ff"/><circle cx="60" cy="48" r="4.5" fill="#ffd23f"/>'
    + '<path d="M60 52 l-7 9 l7 -3 l7 3 z" fill="#e8fbff"/><path d="M30 14 a30 30 0 0 1 60 0" fill="none" stroke="#ff3fa4" stroke-width="2" opacity=".7"/></svg>';

  J.GAMES.push({
    id: 'surco', wide: true, noDaily: true, title: tr('Surco', 'Groove'), tag: tr('Ritmo · nuevo', 'Rhythm · new'), art: ART,
    desc: tr('SYNDRUS compone un tema y vos lo surfeás: agarrá sus notas y el tema suena más lleno.', 'SYNDRUS composes a song and you surf it: catch its notes and the song sounds fuller.'),
    how: tr('SYNDRUS compone un tema nuevo cada vez, con intro, subidas, drops, un corte y un cierre, y la pista lo sigue: trepa mientras la música crece y cae a toda velocidad en los drops. Por los tres carriles vienen las notas del tema, cada una de un instrumento: cuadrados rojos el bajo, rombos celestes el arpegio, círculos amarillos la percusión. Si las agarrás, ese instrumento suena fuerte y abierto; si las perdés, se apaga y se opaca: el tema suena tan bien como juegues. Cada nota suma, y la racha multiplica (hasta ×8). Esquivá los bloques de estática: te cortan la racha y bajan todo. Compu: ← → o A D para cambiar de carril, P o Espacio para pausar. Celular: tocá a la izquierda o a la derecha. Joystick: palanca o cruz. Con auriculares se disfruta más.',
      'SYNDRUS composes a new song every time, with an intro, build-ups, drops, a break and an outro, and the track follows it: it climbs while the music builds and dives at full speed in the drops. The notes of the song come down the three lanes, each from an instrument: red squares the bass, cyan diamonds the arp, yellow circles the percussion. Catch them and that instrument plays loud and open; miss them and it fades and dulls: the song sounds as good as you play. Every note scores, and your streak multiplies it (up to ×8). Dodge the static blocks: they break your streak and pull everything down. Computer: ← → or A D to switch lanes, P or Space to pause. Phone: tap left or right. Gamepad: stick or d-pad. Best with headphones.'),
    get brief() {
      const t = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
      return tr('SYNDRUS compone un tema y la pista lo sigue. Agarrá las notas de cada instrumento para que suene completo y esquivá la estática. ' + (t ? 'Tocá a la izquierda o a la derecha para cambiar de carril.' : '← → o A D para cambiar de carril.') + ' Mejor con auriculares.',
        'SYNDRUS composes a song and the track follows it. Catch each instrument’s notes so it plays in full, and dodge the static. ' + (t ? 'Tap left or right to switch lanes.' : '← → or A D to switch lanes.') + ' Best with headphones.');
    },
    better: 'high', fmt: n => Number(n).toLocaleString(J.LOCALE),
    options: [['techno', 'Techno'], ['psy', 'Psytrance'], ['hoy', tr('Tema del día', 'Song of the day')]], dayOption: 'hoy',
    start,
  });
  if (J.route && /^#surco/.test(location.hash)) J.route();
  else if (J.repaintHub) J.repaintHub();   // the hub was drawn before this file loaded: now with its card
})();
