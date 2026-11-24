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
    const L = Math.ceil(S[N]) + SHOW + 80, Y = new Float32Array(L), Xc = new Float32Array(L), Em = new Float32Array(L), Hm = new Float32Array(L);
    { let n = 0; for (let m = 0; m < L; m++) { while (n < N - 1 && S[n + 1] <= m) n++; Em[m] = m < S[N] ? stepE[n] : 0.3; Hm[m] = secs[stepSec[Math.min(n, N - 1)]].hue; } }
    { // the slope follows the energy (smoothed so the hills are hills): low = climbing, high = diving
      let y = 0, x = 0, head = 0, sm = 0.3;
      for (let m = 0; m < L; m++) {
        sm += (Em[m] - sm) * 0.012; Y[m] = y; y += (0.5 - sm) * 0.2;
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
    const P = { lane: 1, x: 1, score: 0, combo: 0, maxCombo: 0, caught: 0, missed: 0, hitBlocks: 0, fx: [], glitch: 0, tilt: 0, done: false, frames: 0 };
    let paused = false, raf = 0, ended = false, lastSec = -1, bigT = 0, auto = false, prevNow = -1;
    const mult = () => Math.min(8, 1 + Math.floor(P.combo / 8));
    const songTime = () => ac.currentTime - T0 - (ac.outputLatency || ac.baseLatency || 0);
    function move(d) { if (paused || ended) return; P.lane = Math.max(0, Math.min(LANES - 1, P.lane + d)); hint.classList.add('off'); }
    function burst(x, y, s, c, nn) { for (let i = 0; i < nn; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 7; P.fx.push({ x, y: y + 0.3, s, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 + 3, vs: (Math.random() - 0.3) * 6, life: 0.5 + Math.random() * 0.4, c }); } }
    function catchNote(q) {
      q.st = 1; P.combo++; P.maxCombo = Math.max(P.maxCombo, P.combo); P.caught++;
      P.score += 100 * mult(); H[q.ly] = Math.min(1, H[q.ly] + 0.09);
      burst(at(Xc, q.s) + (q.lane - 1) * LW, at(Y, q.s) + 0.6, q.s, COL[q.ly], 14);
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
      const r = wrap.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (w !== cv.width || h !== cv.height) { cv.width = w; cv.height = h; }
      W = w; Hh = h;
    }
    const tick = setInterval(schedule, 25);
    let lastT = performance.now();
    function frame() {
      raf = requestAnimationFrame(frame);
      const tn = performance.now(), dt = Math.min(0.05, (tn - lastT) / 1000); lastT = tn;
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
      for (const q of notes) {
        if (q.st || q.t > now + 0.06) continue;
        if (lane === q.lane && Math.abs(P.x - q.lane) < 0.45) catchNote(q);
        else if (now > q.t + 0.09) missNote(q);
      }
      for (const b of blocks) { if (b.st || b.t > now + 0.05) continue; if (now > b.t + 0.06 && b.t < prevNow - 0.06) { b.st = 2; continue; } if (Math.abs(P.x - b.lane) < 0.5) hitBlock(b); else if (now > b.t + 0.06) b.st = 2; }
      prevNow = now; P.frames++;
      P.fx = P.fx.filter(f => { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 14 * dt; f.s += f.vs * dt; return f.life > 0; });
      P.glitch = Math.max(0, P.glitch - dt * 2.5);
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
    function draw(now) {
      const shipS = distAt(now), e = at(Em, shipS), hue = at(Hm, shipS);
      const kick = kicks.length ? Math.exp(-Math.max(0, now - (kicks.filter(k => k <= now).pop() ?? -9)) * 7) : 0;
      while (kicks.length > 8 && kicks[1] < now) kicks.shift();
      while (hats.length > 8 && hats[1] < now) hats.shift();
      const shipX = at(Xc, shipS) + (P.x - 1) * LW;
      cam.s = shipS - 6.8; cam.x = at(Xc, shipS) * 0.9 + shipX * 0.1; cam.y = at(Y, shipS) + 2.7; cam.F = Hh * 0.95; cam.hz = Hh * 0.36;
      // sky
      const sk = g.createLinearGradient(0, 0, 0, Hh);
      sk.addColorStop(0, `hsl(${hue + 20},60%,${4 + 4 * kick * e}%)`); sk.addColorStop(0.45, `hsl(${hue},70%,${9 + 8 * kick * e}%)`); sk.addColorStop(1, '#020206');
      g.fillStyle = sk; g.fillRect(0, 0, W, Hh);
      // a big soft ring on the horizon that breathes with the kick
      const rr = Hh * (0.16 + 0.03 * kick);
      g.strokeStyle = `hsla(${hue - 40},90%,65%,${0.25 + 0.35 * kick})`; g.lineWidth = 3 * dpr;
      g.beginPath(); g.arc(W / 2, cam.hz, rr, Math.PI, 0); g.stroke();
      g.strokeStyle = `hsla(${hue + 30},90%,65%,${0.12 + 0.2 * kick})`; g.beginPath(); g.arc(W / 2, cam.hz, rr * 1.5, Math.PI, 0); g.stroke();
      // the track, far to near
      const segs = []; const STEP = 2.6;
      for (let s = Math.ceil((cam.s + SHOW) / STEP) * STEP; s > cam.s + 0.8; s -= STEP) segs.push(s);
      let prev = null;
      const pts = segs.map(s => { const c = at(Xc, s), y = at(Y, s), half = LW * 1.5 + 0.35; return { s, l: proj(c - half, y, s), r: proj(c + half, y, s), lanes: [1, 2].map(k => proj(c - half + 0.35 + k * LW, y, s)), y, c }; });
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]; if (!p.l || !p.r) { prev = null; continue; }
        if (prev && prev.l && prev.r) {
          const far = (p.s - cam.s) / SHOW, beatRow = Math.floor(p.s / 9) % 2;
          g.fillStyle = `hsla(${hue},55%,${(beatRow ? 10 : 7.5) + 9 * e * (1 - far)}%,0.94)`;
          g.beginPath(); g.moveTo(prev.l[0], prev.l[1]); g.lineTo(prev.r[0], prev.r[1]); g.lineTo(p.r[0], p.r[1]); g.lineTo(p.l[0], p.l[1]); g.closePath(); g.fill();
          const a = 0.25 + 0.75 * (1 - far);
          g.strokeStyle = `hsla(${hue - 30},95%,${55 + 20 * kick}%,${a})`; g.lineWidth = Math.max(1, (2 + 3 * kick) * dpr * (1 - far));
          g.beginPath(); g.moveTo(prev.l[0], prev.l[1]); g.lineTo(p.l[0], p.l[1]); g.moveTo(prev.r[0], prev.r[1]); g.lineTo(p.r[0], p.r[1]); g.stroke();
          g.strokeStyle = `hsla(${hue + 40},85%,72%,${a * 0.65})`; g.lineWidth = Math.max(1, 1.6 * dpr * (1 - far));
          g.beginPath(); for (let k = 0; k < 2; k++) if (prev.lanes[k] && p.lanes[k]) { g.moveTo(prev.lanes[k][0], prev.lanes[k][1]); g.lineTo(p.lanes[k][0], p.lanes[k][1]); } g.stroke();
        }
        prev = p;
      }
      // the beats laid on the track: a line on every beat (thicker on each bar) that you ride over in time
      for (let n = Math.max(0, Math.floor(now / stepDur / 4) * 4); n < N; n += 4) {
        const s = S[n]; if (s < cam.s + 1) continue; if (s > cam.s + SHOW * 0.8) break;
        const c = at(Xc, s), y = at(Y, s), half = LW * 1.5 + 0.35, a = proj(c - half, y, s), b = proj(c + half, y, s); if (!a || !b) continue;
        const far = (s - cam.s) / SHOW, bar1 = n % 16 === 0;
        g.strokeStyle = `hsla(${hue + 20},90%,75%,${(bar1 ? 0.55 : 0.28) * (1 - far)})`; g.lineWidth = Math.max(1, (bar1 ? 3 : 1.5) * dpr * (1 - far));
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      // side posts that flash with the hats
      const hat = hats.length ? Math.exp(-Math.max(0, now - (hats.filter(k => k <= now).pop() ?? -9)) * 14) : 0;
      for (let s = Math.ceil((cam.s + 10) / 12) * 12; s < cam.s + SHOW * 0.7; s += 12) {
        const c = at(Xc, s), y = at(Y, s);
        for (const side of [-1, 1]) {
          const a = proj(c + side * (LW * 1.5 + 0.9), y, s), b = proj(c + side * (LW * 1.5 + 0.9), y + 1.6 + 1.2 * e, s); if (!a || !b) continue;
          g.strokeStyle = `hsla(${hue + 60},90%,70%,${0.15 + 0.6 * hat})`; g.lineWidth = Math.max(1, Math.min(3 * dpr, a[2] * 0.06));
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        }
      }
      // notes and blocks, far to near
      const objs = [];
      for (const q of notes) { if (q.st === 1 || q.s < cam.s + 0.8 || q.s > cam.s + SHOW) continue; objs.push(q); }
      for (const b of blocks) { if (b.st === 1 || b.s < cam.s + 0.8 || b.s > cam.s + SHOW) continue; objs.push(b); }
      objs.sort((a, b) => b.s - a.s);
      for (const o of objs) {
        const c = at(Xc, o.s) + (o.lane - 1) * LW, y = at(Y, o.s);
        if (o.ly === undefined) {
        if (o.st === 2 && o.s < cam.s + 7) continue;   // static: a box of noise
          const p0 = proj(c - 0.8, y, o.s), p1 = proj(c + 0.8, y + 1.4, o.s); if (!p0 || !p1) continue;
          const w = p1[0] - p0[0], h = p0[1] - p1[1];
          g.fillStyle = 'rgba(30,30,40,0.92)'; g.fillRect(p0[0], p1[1], w, h);
          const cells = 6; for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) { const v = Math.random(); if (v < 0.45) continue; g.fillStyle = `rgba(${200 + v * 55},${200 + v * 55},${210 + v * 45},${0.35 + 0.5 * v})`; g.fillRect(p0[0] + w * i / cells, p1[1] + h * j / cells, w / cells + 0.5, h / cells + 0.5); }
          g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(1, dpr); g.strokeRect(p0[0], p1[1], w, h);
          continue;
        }
        const p = proj(c, y + 0.65 + Math.sin(now * 6 + o.n) * 0.06, o.s); if (!p) continue;
        const r = Math.max(1.5, 0.5 * p[2]), col = COL[o.ly], dim = o.st === 2 ? 0.25 : 1;
        g.fillStyle = rgba(col, 0.18 * dim); shape(LAYERS[o.ly].shape, p[0], p[1], r * 1.9);
        g.fillStyle = rgba(col, 0.95 * dim); shape(LAYERS[o.ly].shape, p[0], p[1], r);
        g.fillStyle = `rgba(255,255,255,${0.75 * dim})`; shape(LAYERS[o.ly].shape, p[0], p[1], r * 0.4);
      }
      // the sparks of what you caught
      for (const f of P.fx) { const p = proj(f.x, f.y, f.s + 0.0); if (!p) continue; g.fillStyle = rgba(f.c, Math.min(1, f.life * 2)); const r = Math.max(1, 0.09 * p[2]); g.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); }
      // the ship: a neon arrowhead, leaning into the turns, with a trail
      const sy = at(Y, shipS) + 0.42, base = proj(shipX, sy, shipS), tip = proj(shipX, sy + 0.08, shipS + 1.6);
      if (base && tip) {
        const k = base[2], wv = 0.95 * k, lean = P.tilt;
        for (let i = 1; i <= 5; i++) { const tp = proj(shipX - 0, sy, shipS - i * 0.5 + 0.2); if (!tp) continue; g.fillStyle = `hsla(${hue - 40},95%,65%,${0.12 * (6 - i) / 5})`; g.fillRect(tp[0] - wv * 0.5, tp[1] - 2, wv, 4); }
        g.save(); g.translate(base[0], base[1]); g.rotate(lean * 0.25);
        g.fillStyle = `hsla(${hue - 40},95%,60%,0.25)`; g.beginPath(); g.moveTo(0, -(base[1] - tip[1]) - 0.5 * k); g.lineTo(wv * 0.75, 0.25 * k); g.lineTo(-wv * 0.75, 0.25 * k); g.closePath(); g.fill();
        g.fillStyle = '#e8fbff'; g.strokeStyle = `hsl(${hue - 40},95%,62%)`; g.lineWidth = 2 * dpr;
        g.beginPath(); g.moveTo(0, -(base[1] - tip[1])); g.lineTo(wv * 0.5, 0.12 * k); g.lineTo(0, -0.05 * k); g.lineTo(-wv * 0.5, 0.12 * k); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
      // a glitch when you crash into static
      if (P.glitch > 0) {
        for (let i = 0; i < 10; i++) { const y = Math.random() * Hh, h = (4 + Math.random() * 30) * dpr, dx = (Math.random() - 0.5) * 60 * dpr * P.glitch; try { g.drawImage(cv, 0, y, W, h, dx, y, W, h); } catch (e) { /* ignore */ } }
        g.fillStyle = `rgba(255,255,255,${0.12 * P.glitch})`; g.fillRect(0, 0, W, Hh);
      }
    }
    function shape(k, x, y, r) {
      g.beginPath();
      if (k === 'sq') g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
      else if (k === 'dia') { g.moveTo(x, y - r * 1.15); g.lineTo(x + r, y); g.lineTo(x, y + r * 1.15); g.lineTo(x - r, y); g.closePath(); }
      else g.arc(x, y, r, 0, 6.283);
      g.fill();
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
    Object.assign(ctx.test, { P, H, notes, blocks, secs, st, N, stepDur, songTime, finish, setPause, move, setAuto(v) { auto = !!v; } });   // (Object.assign would drop a setter)

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
