/* DRUS · SURCO — a rhythm game whose song is composed by SYNDRUS (lab/syndrus/engine.js + gen.js) every time.
   The song has a shape (intro, build-ups, drops, a break, an outro) and the track follows it: it climbs while the
   music builds and dives in the drops. The notes of the song fall on three lanes, each one from an instrument
   (bass, arpeggio, percussion): strike each one as it crosses the hit line (its lane's key, or a tap on that third
   of the screen) and that instrument plays on; miss one and it cuts out until you hit it again. Timing is judged
   (perfect / good / early-late), the delay of each player's sound is calibrated once, and static blocks are dodged.
   An original game in the music-driven-track genre: own arrangement, own track, own drawing (canvas 2D). */
(function () {
  'use strict';
  const J = window.__juegos, X = window.SyndrusEngine, G = window.SyndrusGen;
  if (!J || !X || !G) return;
  const { tr, el } = J;

  const LANES = 3, LW = 2.1;           // lanes, lane width (m)
  const AHEAD = 4;                     // the hit line is this far ahead of the ship: it shoots the notes there (m)
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

  const DIFFS = [['facil', tr('Fácil', 'Easy')], ['normal', 'Normal'], ['dificil', tr('Difícil', 'Hard')]];
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const getDiff = () => { const d = LS.get('surco_diff', 'normal'); return DIFFS.some(x => x[0] === d) ? d : 'normal'; };
  const getOff = () => { const v = +LS.get('surco_off', '0'); return isFinite(v) ? Math.max(-0.4, Math.min(0.4, v)) : 0; };   // s: how late this device's sound (and touch) arrives
  const fmtMs = v => (v > 0 ? '+' : '') + Math.round(v * 1000) + ' ms';
  const WIN = { perfect: 0.045, good: 0.09, ok: 0.14 };   // s either side of the note
  const isTouch = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;

  /* ── calibration: a click on the beat, the player taps along; the median gap is this device's delay ── */
  function calibrate(onDone) {
    const ov = el('div', 'sc-cal'), box = el('div', 'sc-cal-box');
    const close = el('button', 'sc-cal-x', '✕'); close.title = tr('Cerrar', 'Close');
    const txt = el('p', null, tr('Vas a escuchar un click a ritmo. Tocá el círculo (o cualquier tecla) justo cuando suena. Usá los mismos auriculares o parlante con los que vas a jugar.',
      'You will hear a click on the beat. Tap the circle (or any key) right as it sounds. Use the same headphones or speaker you will play with.'));
    const padB = el('button', 'sc-cal-pad', tr('Empezar', 'Start'));
    const dots = el('div', 'sc-cal-dots'), res = el('p', 'sc-cal-res', tr('Ahora: ', 'Now: ') + fmtMs(getOff()));
    const row = el('div', 'jg-btns'), minus = el('button', 'jg-btn', '−10 ms'), plus = el('button', 'jg-btn', '+10 ms'), zero = el('button', 'jg-btn', tr('A cero', 'Reset')), ok = el('button', 'jg-btn primary', tr('Listo', 'Done'));
    row.append(minus, plus, zero, ok);
    box.append(close, el('b', 'sc-cal-t', tr('Calibrar el sonido', 'Calibrate the audio')), txt, padB, dots, res, row); ov.append(box); document.body.append(ov);
    const TAPS = 16, LEAD = 4, BEAT = 0.5;
    for (let i = 0; i < TAPS; i++) dots.append(el('i'));
    let val = getOff(), ac = null, t0 = 0, errs = [], running = false, timer = 0;
    const show = () => { res.textContent = tr('Demora: ', 'Delay: ') + fmtMs(val); };
    const setV = v => { val = Math.max(-0.4, Math.min(0.4, v)); show(); };
    minus.onclick = () => setV(val - 0.01); plus.onclick = () => setV(val + 0.01); zero.onclick = () => setV(0);
    const end = save => { clearTimeout(timer); removeEventListener('keydown', onKey, true); try { if (ac) ac.close(); } catch (e) { /* closed */ } if (save) LS.set('surco_off', String(val)); ov.remove(); if (onDone) onDone(); };
    ok.onclick = () => end(true); close.onclick = () => end(false);
    function begin() {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { ac = new AC(isTouch() ? { latencyHint: 'playback' } : undefined); } catch (e) { ac = new AC(); }   // (the same buffers as the game)
      try { ac.resume(); } catch (e) { /* the tap is the gesture */ }
      errs = []; dots.querySelectorAll('i').forEach(d => { d.className = ''; }); running = true; padB.textContent = tr('Tocá al ritmo', 'Tap to the beat'); padB.classList.add('live');
      t0 = ac.currentTime + 0.4;
      for (let i = 0; i < LEAD + TAPS; i++) {
        const t = t0 + i * BEAT, o = ac.createOscillator(), gn = ac.createGain();
        o.type = 'square'; o.frequency.value = i % 4 === 0 ? 1760 : 1320; gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(0.25, t + 0.002); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + 0.07);
      }
      timer = setTimeout(finishCal, ((LEAD + TAPS) * BEAT + 0.9) * 1000);
    }
    function tap(e) {
      if (!running || !ac) return;
      const lag = e && e.timeStamp ? Math.max(0, Math.min(0.1, (performance.now() - e.timeStamp) / 1000)) : 0;
      const t = ac.currentTime - (ac.outputLatency || ac.baseLatency || 0) - lag, i = Math.round((t - t0) / BEAT), d = t - (t0 + i * BEAT);
      padB.classList.remove('hit'); void padB.offsetWidth; padB.classList.add('hit');
      if (i < LEAD - 1 || i >= LEAD + TAPS || Math.abs(d) > 0.24) return;
      errs.push(d); const dd = dots.children[Math.min(TAPS - 1, errs.length - 1)]; if (dd) dd.className = 'on';
    }
    function finishCal() {
      running = false; padB.classList.remove('live'); padB.textContent = tr('Repetir', 'Again');
      if (errs.length < 8) { res.textContent = tr('Faltaron toques: probá de nuevo.', 'Not enough taps: try again.'); return; }
      const so = errs.slice().sort((a, b) => a - b); setV(so[Math.floor(so.length / 2)]);
    }
    padB.addEventListener('pointerdown', e => { e.preventDefault(); if (running) tap(e); else begin(); });
    const onKey = e => { if (e.code === 'Escape') { end(false); return; } if (running && !e.repeat) { e.preventDefault(); tap(e); } };
    addEventListener('keydown', onKey, true);
  }

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
    const diff = getDiff(), OFF = getOff();

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
      let y = 0, x = 0, head = 0, sm = 0.3, amp = 0; const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28, ph3 = rnd() * 6.28;   // (the curves: different in every song)
      for (let m = 0; m < L; m++) {
        sm += (Em[m] - sm) * 0.012; const p = Pm[m], beat = Math.floor(p / 4);
        amp += ((beat < N / 4 && kickBeat[beat] ? 0.25 + 0.5 * Em[m] : 0) - amp) * 0.08;
        Yb[m] = y + Math.sin(p / 32 * 6.2832) * (0.6 + 1.6 * sm);
        Y[m] = Yb[m] + amp * Math.sin(Math.PI * (p % 4) / 4);
        y += (0.5 - sm) * 0.2;
        const bend = (Math.sin(m / 71 + ph1) * 0.5 + Math.sin(m / 31 + ph2) * 0.32 + Math.sin(m / 14 + ph3) * 0.18) * (0.0035 + 0.0085 * sm);
        head = Math.max(-0.6, Math.min(0.6, head + bend - head * 0.007)); Xc[m] = x; x += head;
      }
    }
    const CS = new Float32Array(L), SN = new Float32Array(L);
    for (let m = 0; m < L; m++) { const h = (Xc[Math.min(L - 1, m + 2)] - Xc[Math.max(0, m - 2)]) / (Math.min(L - 1, m + 2) - Math.max(0, m - 2)), a = Math.atan(h); CS[m] = Math.cos(a); SN[m] = Math.sin(a); }
    const at = (A, s) => { if (s <= 0) return A[0]; const i = Math.floor(s); if (i >= L - 1) return A[L - 1]; const f = s - i; return A[i] + (A[i + 1] - A[i]) * f; };
    const side = (s, u) => [at(Xc, s) + u * at(CS, s), s - u * at(SN, s)];   // a point u metres to the side of the road at s (square to it): [x, s]
    const distAt = t => { if (t <= 0) return t * speed(0.25); const x = t / stepDur, i = Math.floor(x); if (i >= N) return S[N] + (t - N * stepDur) * speed(0.3); return S[i] + (S[i + 1] - S[i]) * (x - i); };

    /* ── the notes the player sees: a chart that follows the groove, so it can be played with the fingers.
       The middle lane is the beat (the kick; the arp where there's no kick), the side lanes what falls between
       (the bass off-beat, left or right as its pitch goes down or up). Easy: the beats · normal: beat and off-beat
       («tun-ts tun-ts») · hard: plus the pick-up 16th before each beat in the drops. The bars repeat, so does the chart. */
    const notes = [], blocks = [];
    {
      const has = (v, n) => { const p = n % 16, sy = v.synth.steps[p], a = v.arp;
        return { kick: !v.drums[0].mute && !!v.drums[0].steps[p], bass: !v.synth.mute && sy && sy.on ? sy : null, arp: !a.mute && a.on && n % (a.rate || 1) === 0,
          ring: v.rings.some(r => !r.mute && r.pulses && X.euclid(r.steps, r.pulses, r.rot)[n % r.steps]) || (!v.drums[1].mute && !!v.drums[1].steps[p]) }; };
      let side = 0, lastDeg = null, alt = 0;
      const sideFor = deg => { if (lastDeg !== null && deg !== lastDeg) side = deg > lastDeg ? 2 : 0; lastDeg = deg; return side; };
      for (let n = 32; n < N - 16; n++) {   // (two quiet bars first, and the last bar empty)
        const v = varAt(n), e = stepE[n], p = n % 16, h = has(v, n), t = n * stepDur;
        let ly = -1, lane = 1;
        if (p % 4 === 0) {   // the beat: the middle lane (easy: beats 2 and 4 go to the side the bass is heading, so you move)
          if (h.kick) ly = 2; else if (h.arp) ly = 1; else if (h.ring) ly = 2;
          if (ly >= 0 && diff === 'facil' && (p === 4 || p === 12)) { let b = null; for (let k = 0; k < 4 && !b; k++) b = has(varAt(n + k), n + k).bass; if (b) lane = sideFor(b.deg); else { lane = (alt++ % 2) * 2; side = lane; } }
        } else if (diff === 'facil') continue;
        else if (p % 4 === 2) {   // the off-beat: a side lane
          if (h.bass) { ly = 0; lane = sideFor(h.bass.deg); }
          else if (h.arp) { ly = 1; lane = (alt++ % 2) * 2; side = lane; }
          else if (h.ring) { ly = 2; lane = (alt++ % 2) * 2; side = lane; }
        } else if (diff === 'dificil' && e >= 0.9 && p % 4 === 3) {   // hard, in the drops: the pick-up before the beat, on the other side
          if (h.arp || h.ring || h.bass) { ly = h.arp ? 1 : h.ring ? 2 : 0; lane = side === 0 ? 2 : 0; }
        }
        if (ly >= 0) notes.push({ n, t, lane, ly, s: S[n], st: 0 });
      }
      // held notes, where something really holds: the snare roll at the end of each build-up (held into the drop) and, in the break,
      // one per two-bar phrase of the arp. Easy and normal: nothing else to play meanwhile (one finger); hard: the beats go on in the middle (two fingers)
      const holds = []; let hb = 0;
      secs.forEach(sc => {
        if (sc.k === 'build' && sc.bars >= 4) holds.push({ n0: (sc.b0 + sc.bars - 2) * 16, n1: (sc.b0 + sc.bars) * 16, ly: 2, lane: diff === 'dificil' ? (hb++ % 2 ? 0 : 2) : 1 });
        if (sc.k === 'break') for (let b = 0; b + 1 < sc.bars; b += 2) { const n0 = (sc.b0 + b) * 16; holds.push({ n0, n1: n0 + 12, ly: 1, lane: (b / 2) % 2 ? 2 : 0 }); }
      });
      for (const hd of holds) {
        if (hd.n0 < 32 || hd.n1 > N - 16) continue;
        const t0 = hd.n0 * stepDur, t1 = hd.n1 * stepDur;
        for (let i = notes.length - 1; i >= 0; i--) { const q = notes[i]; if (q.t < t0 - 1e-6 || q.t >= t1 - 1e-6) continue; if (diff !== 'dificil' || q.lane !== 1 || q.t < t0 + 1e-6) notes.splice(i, 1); }   // (hard: the middle goes on from the next beat)
        notes.push({ n: hd.n0, t: t0, lane: hd.lane, ly: hd.ly, s: S[hd.n0], st: 0, dur: t1 - t0, sEnd: S[hd.n1], hold: 0 });   // hold: 1 holding, 2 held to the end, 3 let go
      }
      notes.sort((a, b) => a.t - b.t);
      // static blocks: in the build-ups and drops, on free odd 16ths, never on the lane a nearby note asks for (nor while a note is held)
      for (let n = 32; n < N - 16; n++) {
        const s = secs[stepSec[n]]; if (s.k !== 'drop' && s.k !== 'build') continue;
        if (n % 2 !== 1 || rnd() > (s.k === 'drop' ? 0.05 : 0.025) * (diff === 'facil' ? 0.5 : 1)) continue;   // (on the odd 16ths: between the notes)
        const t = n * stepDur, nw = diff === 'dificil' ? 0.17 : 0.3, near = notes.filter(q => Math.abs(q.t - t) < nw), busy = new Set(near.map(q => q.lane));
        const free = [0, 1, 2].filter(l => !busy.has(l)); if (!free.length || near.some(q => Math.abs(q.t - t) < 0.09) || notes.some(q => q.dur && t > q.t - 0.3 && t < q.t + q.dur + 0.2)) continue;
        if (free.length === 3) free.splice(1, 1);   // with nothing near: never the middle (there's always a way round)
        blocks.push({ n, t, lane: free[Math.floor(rnd() * free.length)], s: S[n] - AHEAD, st: 0 });   // (they meet the ship, behind the line)
      }
    }

    /* ── stage ── */
    stage.classList.add('sc-stage');
    const wrap = el('div', 'sc-wrap'), cv = el('canvas', 'sc-cv'), g = cv.getContext('2d', { alpha: false });
    const hudL = el('div', 'sc-hud'), scoreEl = el('b', 'sc-score', '0'), comboEl = el('span', 'sc-combo', '');
    hudL.append(scoreEl, comboEl);
    const meters = el('div', 'sc-meters'), mEls = LAYERS.map((Lr, i) => { const m = el('div', 'sc-m'), bar2 = el('i'); m.append(el('span', null, Lr.name), bar2); m.dataset.l = i; meters.append(m); return bar2; });
    const prog = el('div', 'sc-prog'), progFill = el('i'), progLbl = el('span');
    prog.append(progFill, progLbl);
    const bigEl = el('div', 'sc-big'), pauseEl = el('div', 'sc-pause'), pauseBtn = el('button', 'sc-pbtn', 'II');
    pauseEl.append(el('b', null, tr('Pausa', 'Paused')), el('span', null, tr('Tocá para seguir', 'Tap to go on'))); pauseEl.hidden = true;
    pauseBtn.title = tr('Pausa (P)', 'Pause (P)');
    const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    const hint = el('div', 'sc-hint', touch ? tr('Tocá el carril (izquierda, centro, derecha) cuando la nota cruza la línea', 'Tap the lane (left, middle, right) as the note crosses the line') : tr('A S D (o J K L) tocan cada carril cuando la nota cruza la línea · P pausa', 'A S D (or J K L) strike each lane as the note crosses the line · P pause'));
    const judgeEl = el('div', 'sc-judge');
    const fsBtn = el('button', 'sc-pbtn sc-fs', '⛶'); fsBtn.title = tr('Pantalla completa', 'Full screen');
    const fsOK = !!(wrap.requestFullscreen || wrap.webkitRequestFullscreen);
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    const fsOn = () => { try { const p = (wrap.requestFullscreen || wrap.webkitRequestFullscreen).call(wrap, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed */ } };
    const fsOff = () => { try { if (fsEl()) { const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* ignore */ } };
    fsBtn.addEventListener('click', e => { e.stopPropagation(); if (fsEl()) fsOff(); else fsOn(); });
    if (!fsOK) fsBtn.hidden = true;
    wrap.append(cv, hudL, meters, prog, bigEl, judgeEl, hint, pauseBtn, fsBtn, pauseEl);
    stage.append(wrap);
    if (touch && fsOK) fsOn();   // on a phone: the whole screen (the start tap is the gesture it needs)
    const COL = COLS(), WHITE = [255, 255, 255], RGC = new WeakMap(), rgba = (c, a) => {   // rgba(), cached per colour (alpha rounded to 0.02)
      const k = Math.round(Math.max(0, Math.min(1, +a)) * 50); let m = RGC.get(c); if (!m) { m = []; RGC.set(c, m); }
      return m[k] || (m[k] = `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${k / 50})`);
    };
    meters.querySelectorAll('.sc-m').forEach((m, i) => { m.style.setProperty('--c', `rgb(${COL[i].join(',')})`); });

    /* ── sound ── */
    const AC = window.AudioContext || window.webkitAudioContext;
    let ac; try { ac = new AC(touch ? { latencyHint: 'playback' } : undefined); } catch (e) { ac = new AC(); }   // (a phone: bigger buffers, so the sound doesn't crackle while the screen works)
    try { ac.resume(); } catch (e) { /* the click already counts as a gesture */ }
    let outNode = ac.destination;
    if (touch) {   // a phone speaker: no deep sub (it only distorts there) and some headroom
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; hp.Q.value = 0.7;
      const tr2 = ac.createGain(); tr2.gain.value = 0.8; hp.connect(tr2); tr2.connect(ac.destination); outNode = hp;
    }
    const E = X.buildEngine(ac, outNode), D = E.decks[0];
    const deckMix = { level: 0.9, dj: 0, eqLo: 0, eqMid: 0, eqHi: 0, kill: false, cue: false };
    X.applyPattern(D, st, bpm); D.setMix(deckMix, 1); E.decks[1].setMix({ ...deckMix, level: 0 }, 0);
    E.setMaster(touch ? { drive: 0, comp: 0.35, volume: 0.6 } : { drive: 0.12, comp: 0.5, volume: 0.8 });
    const T0 = ac.currentTime + 0.35;
    let next = 0;   // next step to schedule
    const kicks = [], hats = [];
    function schedule() {
      if (paused) return;
      const until = ac.currentTime + (touch ? 0.3 : 0.14);
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
    const H = [0.5, 0.5, 0.5], cut = [0, 0, 0]; let lastMix = '';
    function mix(now) {
      const s = secs[stepSec[Math.max(0, Math.min(N - 1, Math.floor(now / stepDur)))]];
      let dj = 0;   // a build-up opens a high-pass that lets go on the drop
      if (s.k === 'build') { const f = (now / stepDur - s.b0 * 16) / (s.bars * 16); dj = Math.max(0, Math.min(1, f)) * 0.42; }
      cut.forEach((c, i) => { if (c && now > c) cut[i] = 0; });   // a cut lasts a bar at most: never a song gone silent (in the break, with no drums, a few misses left nothing)
      const f = H.map((h, i) => (cut[i] ? 0.3 : 0.35 + 0.65 * h)), lift = s.k === 'break' ? 3 : 1, key = f.map(x => x.toFixed(2)).join() + dj.toFixed(2) + lift;   // lift: the break is only arp and percussion, some 13 dB under the rest — on a phone speaker that was silence   // (a cut instrument: clearly dimmer, at once, but still there)
      if (key === lastMix) return; lastMix = key;
      D.synthStrip.set({ ...st.synth, level: st.synth.level * f[0] });
      D.synth.set({ ...st.synth, cutoff: st.synth.cutoff * (0.35 + 0.65 * H[0]) });
      D.arpStrip.set({ ...st.arp, level: st.arp.level * f[1] * lift });
      st.rings.forEach((r, i) => D.ringStrips[i].set({ ...r, level: r.level * f[2] * lift }));
      [1, 2, 5, 6].forEach(i => D.drumStrips[i].set({ ...st.drums[i], level: st.drums[i].level * (0.25 + 0.75 * f[2]) * lift }));
      D.setMix({ ...deckMix, dj }, 1);
    }

    /* ── play state ── */
    const P = { lane: 1, x: 1, score: 0, combo: 0, maxCombo: 0, caught: 0, missed: 0, hitBlocks: 0, fx: [], rings: [], glitch: 0, tilt: 0, done: false, frames: 0, pads: [0, 0, 0], jc: [0, 0, 0], errSum: 0, ghost: 0, beams: [], act: [null, null, null], holdN: notes.filter(q => q.dur).length, holdOk: 0 };
    let ni = 0;   // the first note not judged yet
    let hudKey = '', paused = false, raf = 0, ended = false, lastSec = -1, bigT = 0, auto = false, prevNow = -1;
    const mult = () => Math.min(8, 1 + Math.floor(P.combo / 8));
    const songTime = () => ac.currentTime - T0 - (ac.outputLatency || ac.baseLatency || 0);
    const songNow = () => songTime() - OFF;   // what the player hears (and sees) now, with this device's calibrated delay
    const evTime = e => songNow() - (e && e.timeStamp ? Math.max(0, Math.min(0.1, (performance.now() - e.timeStamp) / 1000)) : 0);   // when the key or tap really happened
    let jAlt = false; function judge(txt, cls) { judgeEl.textContent = txt; jAlt = !jAlt; judgeEl.className = 'sc-judge ' + cls + (jAlt ? ' on' : ' on2'); }   // (two twin animations, alternated: each restarts it without a forced layout)
    // a strike on a lane: the ship goes there, and the closest note of that lane inside the window is hit
    function strike(lane, t) {
      if (paused || ended) return;
      P.lane = lane; P.pads[lane] = 1; hint.classList.add('off');
      let best = null, bd = 9;
      for (let i = ni; i < notes.length; i++) { const q = notes[i]; if (q.t - t > WIN.ok) break; if (q.st || q.lane !== lane) continue; const d = t - q.t; if (Math.abs(d) <= WIN.ok && Math.abs(d) < Math.abs(bd)) { best = q; bd = d; } }
      if (best) hitNote(best, bd); else P.ghost++;
      P.beams.push({ lane, hit: !!best, c: best ? COL[best.ly] : [210, 230, 255], life: 0.16 });   // the shot (instant: the judging is when you struck)
    }
    // what's held down right now (keys, fingers, pad buttons) — a held note lasts while its lane is held
    const KH = {}, PH = new Map(), GH = {};
    const laneHeld = l => auto || Object.values(KH).includes(l) || [...PH.values()].includes(l) || Object.values(GH).includes(l);
    function release(lane) {
      const q = P.act[lane]; if (!q || laneHeld(lane)) return;
      P.act[lane] = null; if (songNow() < q.t + q.dur - 0.1) { q.hold = 3; judge(tr('Soltaste', 'Let go'), 'j2'); }   // (no streak lost: only the tail)
    }
    function move(d) { if (paused || ended) return; P.lane = Math.max(0, Math.min(LANES - 1, P.lane + d)); hint.classList.add('off'); }
    function burst(x, y, s, c, nn) { for (let i = 0; i < nn; i++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 7; P.fx.push({ x, y: y + 0.3, s, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 + 3, vs: (Math.random() - 0.3) * 6, life: 0.5 + Math.random() * 0.4, c }); } }
    function hitNote(q, d) {
      const a = Math.abs(d), j = a <= WIN.perfect ? 0 : a <= WIN.good ? 1 : 2;
      q.st = 1; q.j = j; q.err = d; P.combo++; P.maxCombo = Math.max(P.maxCombo, P.combo); P.caught++; P.jc[j]++; P.errSum += d;
      P.score += [300, 200, 100][j] * mult(); H[q.ly] = Math.min(1, H[q.ly] + 0.09); cut[q.ly] = 0;
      judge(j === 0 ? tr('¡Perfecto!', 'Perfect!') : j === 1 ? tr('Bien', 'Good') : d < 0 ? tr('Temprano', 'Early') : tr('Tarde', 'Late'), 'j' + j);
      { const [bx, bs] = side(q.s, (q.lane - 1) * LW); burst(bx, at(Y, q.s) + 0.45, bs, COL[q.ly], j === 0 ? 22 : 12); } P.rings.push({ life: 0.45, c: COL[q.ly] });
      if (q.dur) { q.hold = 1; q.tick = q.t; P.act[q.lane] = q; }
    }
    function missNote(q) { q.st = 2; P.combo = 0; P.missed++; H[q.ly] = Math.max(0, H[q.ly] - 0.15); cut[q.ly] = songNow() + 16 * stepDur; judge(tr('Fallaste', 'Missed'), 'miss'); }
    function hitBlock(b) {
      b.st = 1; P.combo = 0; P.hitBlocks++; P.score = Math.max(0, P.score - 300); P.glitch = 1;
      for (let i = 0; i < 3; i++) H[i] = Math.max(0, H[i] - 0.08);
      try { E.hit('snare', D.drumStrips[2].input, ac.currentTime + 0.01, { tune: 0.5, decay: 0.3, vel: 1 }); } catch (e) { /* a sound less */ }
    }

    /* ── input ── */
    const LANE_KEYS = { KeyA: 0, KeyS: 1, KeyD: 2, KeyJ: 0, KeyK: 1, KeyL: 2, Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
    const onKey = e => {
      if (e.repeat || document.querySelector('.sc-cal')) return;
      const k = e.code;
      if (k in LANE_KEYS) { KH[k] = LANE_KEYS[k]; strike(LANE_KEYS[k], evTime(e)); e.preventDefault(); }
      else if (k === 'ArrowLeft') { move(-1); e.preventDefault(); }
      else if (k === 'ArrowRight') { move(1); e.preventDefault(); }
      else if (k === 'Space' || k === 'ArrowUp') { KH[k] = P.lane; strike(P.lane, evTime(e)); e.preventDefault(); }
      else if (k === 'KeyP' || k === 'Escape') { setPause(!paused); e.preventDefault(); }
    };
    addEventListener('keydown', onKey);
    const onKeyUp = e => { if (e.code in KH) { const l = KH[e.code]; delete KH[e.code]; release(l); } };
    const onBlur = () => { for (const k in KH) delete KH[k]; PH.clear(); for (let l = 0; l < 3; l++) release(l); };
    addEventListener('keyup', onKeyUp); addEventListener('blur', onBlur);
    const onDown = e => {
      if (paused) { setPause(false); return; }
      const R = wrap.getBoundingClientRect(), l = Math.max(0, Math.min(2, Math.floor((e.clientX - R.left) / R.width * 3)));   // each third of the screen is a lane
      PH.set(e.pointerId, l); strike(l, evTime(e)); e.preventDefault();
    };
    const onUp = e => { if (!PH.has(e.pointerId)) return; const l = PH.get(e.pointerId); PH.delete(e.pointerId); release(l); };
    cv.addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
    pauseEl.addEventListener('click', () => setPause(false));
    pauseBtn.addEventListener('click', e => { e.stopPropagation(); setPause(!paused); });
    const onVis = () => { if (document.hidden && !paused && !ended) setPause(true); };
    document.addEventListener('visibilitychange', onVis);
    const pad = { l: false, r: false };
    function pollPad() {
      const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(x => x && x.connected) : null; if (!gp) return;
      const ax = gp.axes[0] || 0, l = ax < -0.5 || (gp.buttons[14] && gp.buttons[14].pressed), r = ax > 0.5 || (gp.buttons[15] && gp.buttons[15].pressed);
      if (l && !pad.l) move(-1); if (r && !pad.r) move(1); pad.l = l; pad.r = r;
      [[2, 0], [3, 1], [1, 2], [0, -1]].forEach(([bi, ln]) => { const on = !!(gp.buttons[bi] && gp.buttons[bi].pressed); if (on && !pad['b' + bi]) { const l = ln < 0 ? P.lane : ln; GH[bi] = l; strike(l, songNow()); } else if (!on && pad['b' + bi] && bi in GH) { const l = GH[bi]; delete GH[bi]; release(l); } pad['b' + bi] = on; });   // X Y B: the lanes · A: this lane
      const sb = gp.buttons[9] && gp.buttons[9].pressed; if (sb && !pad.s) setPause(!paused); pad.s = sb;
    }
    function setPause(v) {
      if (ended || v === paused) return;
      paused = v; pauseEl.hidden = !v;
      try { if (v) ac.suspend(); else ac.resume(); } catch (e) { /* ignore */ }
    }
    ac.onstatechange = () => { if (ac.state !== 'running' && ac.state !== 'closed' && !paused && !ended && ac.currentTime > T0) setPause(true); };   // the phone took the sound away (a call, a notification, another app): pause, and the tap that resumes brings it back

    /* ── the loop ── */
    let W = 0, Hh = 0, dpr = 1;
    let box = null; const ro = window.ResizeObserver ? new ResizeObserver(en => { const c = en[0].contentRect; box = { width: c.width, height: c.height }; }) : null; if (ro) ro.observe(wrap);
    function size() {
      const r = box || wrap.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 2) * Q;
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (w !== cv.width || h !== cv.height) { cv.width = w; cv.height = h; }
      W = w; Hh = h;
    }
    const tick = setInterval(schedule, 25);
    let lastT = performance.now(), Q = 1, qSum = 0, qN = 0, qLock = false;   // Q: the resolution scale, lowered when the frames come slow
    function frame() {
      raf = requestAnimationFrame(frame);
      const tn = performance.now(), raw = (tn - lastT) / 1000, dt = Math.min(0.05, raw); lastT = tn;
      if (!paused && raw < 0.25) { qSum += raw; qN++; if (qN >= (touch ? 45 : 90)) { if (qSum / qN > (touch ? 0.019 : 0.024) && Q > 0.6 && !qLock) Q = Math.round((Q - (touch ? 0.15 : 0.2)) * 100) / 100; qSum = 0; qN = 0; } }
      pollPad(); schedule();
      if (paused) return;
      size();
      const now = songNow();
      update(now, dt); draw(now);
      if (!ended && now > N * stepDur + 1.5) finish();
    }
    function update(now, dt) {
      if (auto) for (let i = ni; i < notes.length; i++) { const q = notes[i]; if (q.t > now) break; if (!q.st) strike(q.lane, q.t); }   // (tests: every note struck right on time)
      const px = P.x; P.x += (P.lane - P.x) * Math.min(1, dt * 28); P.tilt += ((P.x - px) / Math.max(dt, 1e-3) * 0.06 - P.tilt) * Math.min(1, dt * 10);
      const lane = Math.round(P.x);
      // a note nobody struck inside its window is missed (whatever frames a slow phone skipped)
      for (let i = ni; i < notes.length; i++) { const q = notes[i]; if (q.t > now) break; if (!q.st && now > q.t + WIN.ok) missNote(q); }
      while (ni < notes.length && notes[ni].st) ni++;
      for (let l = 0; l < 3; l++) {   // held notes: points every 16th while held, the instrument comes up, a bonus at the end
        const q = P.act[l]; if (!q) continue;
        if (!laneHeld(l)) { release(l); continue; }
        P.pads[l] = 1;
        while (q.tick + stepDur <= Math.min(now, q.t + q.dur)) { q.tick += stepDur; P.score += 25 * mult(); }
        H[q.ly] = Math.min(1, H[q.ly] + dt * 0.4);
        if (now >= q.t + q.dur - 0.1) {
          q.hold = 2; P.act[l] = null; P.holdOk++; P.score += 500 * mult(); judge(tr('¡Sostenido!', 'Held!'), 'j0');
          const sl = distAt(now), [bx, bs] = side(sl, (l - 1) * LW); burst(bx, at(Y, sl) + 0.45, bs, COL[q.ly], 26); P.rings.push({ life: 0.45, c: COL[q.ly] });
        }
      }
      P.beams = P.beams.filter(b => (b.life -= dt) > 0);
      P.pads = P.pads.map(v => Math.max(0, v - dt * 5));
      void lane;
      for (const b of blocks) { if (b.st || b.t > now) continue; if (now > b.t + 0.06 && b.t < prevNow - 0.06) { b.st = 2; continue; } if (Math.abs(P.x - b.lane) < 0.5) hitBlock(b); else if (now > b.t + 0.06) b.st = 2; }
      prevNow = now; P.frames++;
      P.fx = P.fx.filter(f => { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 14 * dt; f.s += f.vs * dt; return f.life > 0; });
      P.glitch = Math.max(0, P.glitch - dt * 2.5);
      P.rings = P.rings.filter(x => (x.life -= dt) > 0);
      mix(now);
      // the HUD
      const hk = P.score + '|' + P.combo + '|' + H.map(h => Math.round(h * 20)).join() + cut.join();
      if (hk !== hudKey) {   // the HUD: the DOM only when something changed
        hudKey = hk; scoreEl.textContent = P.score.toLocaleString(J.LOCALE);
        comboEl.textContent = P.combo > 1 ? `×${mult()} · ${P.combo}` : '';
        H.forEach((h, i) => { mEls[i].style.transform = `scaleX(${Math.round(h * 20) / 20})`; mEls[i].parentNode.classList.toggle('cut', !!cut[i]); });
      }
      const n = Math.max(0, Math.min(N - 1, Math.floor(now / stepDur))), si = stepSec[n];
      const pw = `scaleX(${Math.round(Math.max(0, Math.min(1, now / (N * stepDur))) * 200) / 200})`; if (pw !== progFill.style.transform) progFill.style.transform = pw;
      if (si !== lastSec && now >= 0) { lastSec = si; progLbl.textContent = secs[si].name; if (si > 0) { bigEl.textContent = secs[si].name; bigEl.classList.remove('on'); void bigEl.offsetWidth; bigEl.classList.add('on'); bigT = 1.6; } }
      if (bigT > 0) { bigT -= dt; if (bigT <= 0) bigEl.classList.remove('on'); }
    }

    // project a point of the world (x sideways, y up, s along the track) with the camera behind the ship
    let cam = { s: 0, x: 0, y: 0, F: 1, hz: 0, yaw: 0, cy: 1, sy: 0 };
    const proj = (x, y, s) => { const dx0 = x - cam.x, dz0 = s - cam.s, dz = dz0 * cam.cy + dx0 * cam.sy; if (dz < 0.6) return null; const k = cam.F / dz; return [W / 2 + (dx0 * cam.cy - dz0 * cam.sy) * k, cam.hz - (y - cam.y) * k, k]; };   // (turned by the camera's yaw)

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
    function mesh(V, F, ox, oy, os, roll, pitch, yaw, sc, paint, cull) {   // (cull: a convex piece — the faces turned away aren't drawn)
      const w = V.map(v => { const r = rot(v, roll, pitch, yaw); return [ox + r[0] * sc, oy + r[1] * sc, os + r[2] * sc]; });
      const p = w.map(q => proj(q[0], q[1], q[2])); if (p.some(x => !x)) return;
      const fs = [];
      for (const f of F) {
        const ids = Array.isArray(f[0]) ? f[0] : f, a = w[ids[0]], b = w[ids[1]], c = w[ids[2]];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
        let mx = 0, my = 0, mz = 0; for (const k of ids) { mx += w[k][0]; my += w[k][1]; mz += w[k][2]; } mx /= ids.length; my /= ids.length; mz /= ids.length;
        if (cull) { const out = nx * (mx - ox) + ny * (my - oy) + nz * (mz - os), see = nx * (cam.x - mx) + ny * (cam.y - my) + nz * (cam.s - mz); if (out * see <= 0) continue; }
        fs.push({ ids, kind: f[1], light: Math.round(Math.abs(nx * LX + ny * LY + nz * LZ) / nl / LN * 12) / 12, depth: mz });
      }
      fs.sort((a, b) => b.depth - a.depth);
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
    const HSC = new Map();
    const HS = (h, sa, l, a) => {   // hsla(), rounded (hue 2°, lightness 1 %, alpha 0.04) and cached
      h = ((Math.round(h / 2) * 2) % 360 + 360) % 360; l = Math.round(l); a = Math.round(Math.max(0, Math.min(1, a)) * 25);
      const k = ((h * 101 + sa) * 101 + l) * 26 + a; let v = HSC.get(k);
      if (!v) { v = `hsla(${h},${sa}%,${l}%,${a / 25})`; if (HSC.size > 4000) HSC.clear(); HSC.set(k, v); }
      return v;
    };
    const PNT = new Map(), BLK = [];
    const notePaint = (ly, dim) => { const k = ly * 10 + (dim < 1 ? 1 : 0); let f = PNT.get(k); if (!f) { const col = COL[ly], m = []; f = (kd, l) => { const i = Math.round(l * 12); return m[i] || (m[i] = [`rgba(${Math.round(col[0] * (0.45 + 0.6 * l))},${Math.round(col[1] * (0.45 + 0.6 * l))},${Math.round(col[2] * (0.45 + 0.6 * l))},${dim})`, `rgba(255,255,255,${0.55 * dim})`]); }; PNT.set(k, f); } return f; };
    const blockPaint = (k, l) => { const i = Math.round(l * 12); return BLK[i] || (BLK[i] = [`rgba(${Math.round(40 + 50 * l)},${Math.round(40 + 50 * l)},${Math.round(52 + 50 * l)},0.96)`, 'rgba(255,255,255,0.55)']); };
    let specGrad = null, specKey = '', camE = 0.3, psyA = 0, lastDraw = 0, camBank = 0, camLift = 0;
    let camY0 = null;
    function draw(now) {
      const lineS = distAt(now), shipS = lineS - AHEAD, e = at(Em, lineS), hue = at(Hm, lineS);   // the hit line is where the music is; the ship, a little behind
      const kick = kicks.length ? Math.exp(-Math.max(0, now - (kicks.filter(k => k <= now).pop() ?? -9)) * 7) : 0;
      const hat = hats.length ? Math.exp(-Math.max(0, now - (hats.filter(k => k <= now).pop() ?? -9)) * 14) : 0;
      while (kicks.length > 8 && kicks[1] < now) kicks.shift();
      while (hats.length > 8 && hats[1] < now) hats.shift();
      const [shipX, shipSS] = side(shipS, (P.x - 1) * LW), roadYaw = Math.atan2(at(SN, shipS + 3), at(CS, shipS + 3));
      const slope = Math.atan2(at(Yb, shipS + 3) - at(Yb, shipS - 3), 6), pitch = Math.atan2(at(Y, shipS + 1.5) - at(Y, shipS - 1.5), 3), bank = Math.max(-0.6, Math.min(0.6, -P.tilt * 0.55));
      const fdt = Math.max(0, Math.min(0.1, now - lastDraw)); lastDraw = now;
      camE += (e - camE) * Math.min(1, fdt * 1.6);   // the camera's own intensity (eased, so a drop swoops in)
      const barPh = now / (stepDur * 16) * 6.2832;
      const cz = W < Hh ? 0.45 : 1;   // (a phone held upright: the swoop closer is milder, or the ship sinks under the HUD)
      cam.yaw += (roadYaw - cam.yaw) * Math.min(1, fdt * 5); cam.cy = Math.cos(cam.yaw); cam.sy = Math.sin(cam.yaw);   // it looks along the road, from right behind the ship
      const camD = cz < 1 ? 8.6 - 0.6 * camE : 7.6 - 1.7 * camE, follow = cz < 1 ? 0 : 1;   // (upright phone: further back and centred, so the three lanes sit under the three thirds you tap)
      cam.s = shipS - camD * cam.cy; cam.x = at(Xc, shipS) - camD * cam.sy + ((P.x - 1) * LW * 0.15 * cam.cy + Math.sin(now * 0.6) * 0.6 * camE) * follow;
      const shipYaw = Math.atan2(at(SN, shipS), at(CS, shipS));   // (the ship points along the road too)
      cam.y = at(Yb, shipS) + 3.1 - 1.0 * camE * cz + slope * 1.5;
      const wideV = W > Hh * 2; cam.F = Math.min(Hh * (wideV ? 1.25 : 0.95), W * 1.0) * (1 - 0.24 * camE) * (1 - 0.02 * kick * camE);   // (a phone on its side: closer, so the ship isn't tiny)
      cam.hz = Hh * ((wideV ? 0.3 : 0.36) + slope * 0.5 + 0.02 * camE * Math.sin(barPh * 0.5));
      const curv = ((at(Xc, shipS + 18) - at(Xc, shipS)) - (at(Xc, shipS) - at(Xc, shipS - 6)) / 6 * 18) / 18;   // how hard the road turns here
      camBank += (Math.max(-0.28, Math.min(0.28, -curv * 9)) - camBank) * Math.min(1, fdt * 3);
      const roll = bank * 0.3 + camBank + 0.07 * camE * Math.sin(barPh);   // the world leans with the ship, into the curves, and sways with the bar
      let roll2 = roll;
      if (touch) {   // a phone: the camera is locked to the ship — the hit line and the near track stay put on the screen (no sway, bank, zoom or bounce)
        cam.yaw = Math.atan2(at(SN, shipS), at(CS, shipS)); cam.cy = Math.cos(cam.yaw); cam.sy = Math.sin(cam.yaw);
        const d0 = cz < 1 ? 8.6 : 7.6; cam.s = shipS - d0 * cam.cy; cam.x = at(Xc, shipS) - d0 * cam.sy;
        cam.F = Math.min(Hh * (wideV ? 1.25 : 0.95), W * 1.0); cam.hz = Hh * (wideV ? 0.3 : 0.36); roll2 = 0;
        let need = 0; for (const d of [1.4, 2.6, 4]) need = Math.max(need, at(Yb, cam.s + d) + (Hh - cam.hz) * d / cam.F + 0.1 - (at(Yb, shipS) + 3.1));   // (lifted only as much as a descent needs, slowly)
        camLift += (Math.max(0, need) - camLift) * Math.min(1, fdt * 2.5);
        cam.y = at(Y, shipS) + 3.1 + camLift;   // (it rides the kick's bounce with the ship)
      } else {
        for (const d of [1.4, 2.6, 4]) cam.y = Math.max(cam.y, at(Y, cam.s + d) + (Hh - cam.hz) * d / cam.F + 0.1);   // the nearest track always reaches below the screen (no cut edge in the descents)
        cam.y += ((camY0 ?? cam.y) - cam.y) * 0.5; camY0 = cam.y;   // (F: a phone held upright still fits the whole track across)
      }
      // sky — after the first drop (the break and the build-up that follows) it turns psychedelic: laser mandalas instead of the bars
      const siNow = stepSec[Math.max(0, Math.min(N - 1, Math.floor(now / stepDur)))], secNow = secs[siNow];
      const psyOn = now > 0 && (secNow.k === 'break' || (siNow > 0 && secs[siNow - 1].k === 'break'));
      psyA += ((psyOn ? 1 : 0) - psyA) * Math.min(1, fdt * 1.2);
      const skyH = hue + psyA * now * 45;
      const sk = g.createLinearGradient(0, 0, 0, Hh);
      sk.addColorStop(0, `hsl(${skyH + 20},${60 + 30 * psyA}%,${3 + 3 * kick * e + 2 * psyA}%)`); sk.addColorStop(0.42, `hsl(${skyH + 90 * psyA},70%,${8 + 8 * kick * e + 3 * psyA}%)`); sk.addColorStop(1, '#020206');
      g.fillStyle = sk; g.fillRect(0, 0, W, Hh);
      const px = (cam.x * 0.004) % 1;
      { const st0 = new Path2D(), st1 = new Path2D();   // stars: the twinkling ones and the dim ones, each batch one fill
        for (const s of STARS) { const x = ((s[0] - px + 1) % 1) * W, y = s[1] * cam.hz; (Math.sin(now * s[2] + s[3]) > 0 ? st1 : st0).rect(x, y, s[2] * dpr, s[2] * dpr); }
        g.fillStyle = 'rgba(230,240,255,0.3)'; g.fill(st0); g.fillStyle = 'rgba(230,240,255,0.68)'; g.fill(st1);
      }
      // the ring on the horizon, breathing with the kick
      const rr = Hh * (0.17 + 0.03 * kick);
      g.lineWidth = 3 * dpr;
      g.strokeStyle = HS(hue - 40, 90, 65, 0.25 + 0.35 * kick); g.beginPath(); g.arc(W / 2, cam.hz, rr, Math.PI, 0); g.stroke();
      g.strokeStyle = HS(hue + 30, 90, 65, 0.12 + 0.2 * kick); g.beginPath(); g.arc(W / 2, cam.hz, rr * 1.5, Math.PI, 0); g.stroke();
      // the spectrum skyline (mirrored from the middle)
      let lvl = 0;
      if (E.analyser) { E.analyser.getByteFrequencyData(spec); for (let i = 2; i < 40; i++) lvl += spec[i]; lvl /= 38 * 255; }
      if (psyA > 0.02) {   // the laser mandala: huge, at the end of the road (centred on the vanishing point), barely turning — the whole sky
        const cx = W / 2, cy = cam.hz, RM = Math.hypot(W / 2, Math.max(cam.hz, Hh - cam.hz)) * 1.08, t = now;
        const br = 1 + 0.02 * Math.sin(t * 0.7) + 0.035 * lvl, rot = t * 0.035, baseH = hue + t * 12;
        const RF = [0.07, 0.13, 0.21, 0.31, 0.43, 0.57, 0.74, 0.93, 1.15];
        g.save(); g.globalAlpha = psyA; g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
        // spokes: from the first ring out past the edges
        g.lineWidth = dpr; g.strokeStyle = HS(baseH + 200, 100, 65, 0.22); g.beginPath();
        for (let i = 0; i < 36; i++) { const a = i / 36 * 6.2832 + rot * 0.5; g.moveTo(cx + Math.cos(a) * RM * RF[1] * br, cy + Math.sin(a) * RM * RF[1] * br); g.lineTo(cx + Math.cos(a) * RM * 1.2, cy + Math.sin(a) * RM * 1.2); }
        g.stroke();
        for (let j = 0; j < RF.length - 1; j++) {
          const r0 = RM * RF[j] * br, r1 = RM * RF[j + 1] * br, dir = j % 2 ? -1 : 1, ph = rot * dir * (1 + j * 0.15);
          g.lineWidth = (1.1 + j * 0.15) * dpr; g.strokeStyle = HS(baseH + j * 57, 100, 58 + (j % 3) * 6, 0.7 - j * 0.05); g.beginPath();
          if (j % 3 === 0) {   // a star polygon between the two radii
            const n = 8 + j * 2, m = j ? 3 : 3;   // (short chords: points on the ring, not lines across the screen)
            for (let i = 0; i <= n; i++) { const a = (i * m % n) / n * 6.2832 + ph, x = cx + Math.cos(a) * r1, y = cy + Math.sin(a) * r1; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
          } else if (j % 3 === 1) {   // petals: out to the next ring and back
            const K = 8 + j * 4;
            for (let i = 0; i < K; i++) { const a = i / K * 6.2832 + ph, h2 = Math.PI / K; g.moveTo(cx + Math.cos(a - h2) * r0, cy + Math.sin(a - h2) * r0); g.quadraticCurveTo(cx + Math.cos(a) * r1 * 1.08, cy + Math.sin(a) * r1 * 1.08, cx + Math.cos(a + h2) * r0, cy + Math.sin(a + h2) * r0); }
          } else {   // a ring of arches with a circle under them
            const K = 12 + j * 3; g.moveTo(cx + r0, cy); g.arc(cx, cy, r0, 0, 6.2832);
            for (let i = 0; i < K; i++) { const a = i / K * 6.2832 + ph, x = cx + Math.cos(a) * (r0 + r1) / 2, y = cy + Math.sin(a) * (r0 + r1) / 2, rr = (r1 - r0) * 0.45; g.moveTo(x + rr, y); g.arc(x, y, rr, 0, 6.2832); }
          }
          g.stroke();
        }
        g.fillStyle = HS(baseH + 120, 100, 85, 0.85); g.beginPath();   // sparks on the rings
        for (let j = 1; j < RF.length; j += 2) { const K = 12 + j * 4, r = RM * RF[j] * br; for (let i = 0; i < K; i++) { const a = i / K * 6.2832 - rot * (1 + j * 0.1); g.rect(cx + Math.cos(a) * r - dpr, cy + Math.sin(a) * r - dpr, 2 * dpr, 2 * dpr); } }
        g.fill();
        g.restore();
      }
      if (E.analyser && psyA < 0.98) {
        g.globalAlpha = 1 - psyA;
        const bw = W / 2 / BARS, sk2 = Math.round(hue / 4) + ':' + W;
        if (sk2 !== specKey) { specKey = sk2; specGrad = g.createLinearGradient(0, 0, W, 0); for (let i = 0; i <= 4; i++) specGrad.addColorStop(i / 4, HS(hue - 30 + Math.abs(i - 2) * 60, 90, 55, 0.34)); }
        g.beginPath();
        for (let i = 0; i < BARS; i++) {
          const b0 = Math.floor(2 * Math.pow(spec.length / 6 / 2, i / BARS)), v = spec[Math.min(spec.length - 1, b0)] / 255, h = v * v * Hh * 0.22 + 2 * dpr;
          g.rect(W / 2 + i * bw + 1, cam.hz - h, bw - 2, h); g.rect(W / 2 - (i + 1) * bw + 1, cam.hz - h, bw - 2, h);
        }
        g.fillStyle = specGrad; g.fill();
        g.globalAlpha = 1;
      }
      // in the drops: streaks rushing past from the vanishing point
      if (e > 0.85) {
        g.strokeStyle = HS(hue + 40, 90, 80, 0.12 + 0.12 * kick); g.lineWidth = dpr; g.beginPath();
        for (let i = 0; i < 26; i++) { const a = (i * 2.4 + Math.floor(now * 8) * 0.37) % 6.283, r0 = ((now * 2.6 + i * 0.137) % 1) * W * 0.7, r1 = r0 + W * 0.06; g.moveTo(W / 2 + Math.cos(a) * r0, cam.hz + Math.sin(a) * r0 * 0.6); g.lineTo(W / 2 + Math.cos(a) * r1, cam.hz + Math.sin(a) * r1 * 0.6); }
        g.stroke();
      }

      // the world leans a little with the ship
      g.save(); g.translate(W / 2, cam.hz); g.rotate(roll2); g.translate(-W / 2, -cam.hz);
      // the track, far to near: pillars under it, its thickness, the surface (coloured by the intensity), lanes and glowing rails
      const STEP = 2.6, half = LW * 1.5 + 0.35, TH = 0.55, RAIL = 0.4;
      // segments: 2.6 m near, 5.2 / 10.4 / 20.8 m further on (each on its own grid, so they don't swim) — ~40 instead of ~100
      const segs = [], BANDS = [[40, STEP], [100, STEP * 2], [180, STEP * 4], [SHOW + 21, STEP * 8]];
      { let s = cam.s + 1.4; segs.push(s); let bi = 0;
        while (s < cam.s + SHOW) { while (bi < BANDS.length - 1 && s - cam.s >= BANDS[bi][0]) bi++; const st2 = BANDS[bi][1]; s = (Math.floor(s / st2 + 1e-6) + 1) * st2; segs.push(s); }
        segs.reverse(); }
      const pts = segs.map(s => { const c = at(Xc, s), y = at(Y, s), cs = at(CS, s), sn = at(SN, s), Lp = (u, h) => proj(c + u * cs, y + h, s - u * sn); return { s, c, y, e: at(Em, s),
        l: Lp(-half, 0), r: Lp(half, 0), lb: Lp(-half, -TH), rb: Lp(half, -TH), lr: Lp(-half, RAIL), rr: Lp(half, RAIL),
        lanes: [0, 1, 2, 3].map(k => Lp(-half + 0.35 + k * LW, 0)) }; });
      // drawn in runs: the segments of one 10.4 m stripe make a single strip per lane (one fill each, not one per segment)
      const okP = p => p.l && p.r && p.lb && p.rb && p.lr && p.rr && p.lanes[0] && p.lanes[1] && p.lanes[2] && p.lanes[3];
      const strip = (run, A, B) => { let v = A(run[0]); g.moveTo(v[0], v[1]); for (let i = 1; i < run.length; i++) { v = A(run[i]); g.lineTo(v[0], v[1]); } for (let i = run.length - 1; i >= 0; i--) { v = B(run[i]); g.lineTo(v[0], v[1]); } g.closePath(); };
      const line = (run, A) => { let v = A(run[0]); g.moveTo(v[0], v[1]); for (let i = 1; i < run.length; i++) { v = A(run[i]); g.lineTo(v[0], v[1]); } };
      const LANE_L = [p => p.l, p => p.lanes[1], p => p.lanes[2]], LANE_R = [p => p.lanes[1], p => p.lanes[2], p => p.r];
      for (let i = 0; i < pts.length - 1;) {
        if (!okP(pts[i]) || !okP(pts[i + 1])) { i++; continue; }
        const sid = Math.floor(pts[i + 1].s / 10.4 + 1e-6), run = [pts[i], pts[i + 1]]; let j = i + 2;
        while (j < pts.length && okP(pts[j]) && Math.floor(pts[j].s / 10.4 + 1e-6) === sid) run.push(pts[j++]);
        i = j - 1;
        for (let m = 1; m < run.length; m++) {   // a pillar down into the void every 40 m
          const a = run[m - 1], p = run[m]; if (Math.floor(a.s / 40) === Math.floor(p.s / 40)) continue;
          const nr = 1 - (p.s - cam.s) / SHOW, tp = 260 - 230 * p.e, top = proj(p.c, p.y - TH, p.s), bot = proj(p.c, p.y - 45, p.s);
          if (top && bot) { const gr = g.createLinearGradient(0, top[1], 0, bot[1]); gr.addColorStop(0, HS(tp, 70, 45, 0.5 * nr)); gr.addColorStop(1, HS(tp, 70, 45, 0)); g.strokeStyle = gr; g.lineWidth = Math.max(1, top[2] * 0.35); g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(bot[0], bot[1]); g.stroke(); }
        }
        const q = run[run.length >> 1], near = 1 - (q.s - cam.s) / SHOW, th = 260 - 230 * q.e, band = sid % 2;   // intensity → colour: violet (calm) … red-orange (drop)
        g.fillStyle = HS(th, 60, 6 + 5 * near, 1);   // the sides of the slab
        g.beginPath(); strip(run, p => p.l, p => p.lb); strip(run, p => p.r, p => p.rb); g.fill();
        for (let k = 0; k < 3; k++) {   // the lanes, each its own shade, a darker band every few metres (opaque: no blending)
          g.fillStyle = HS(th + (k - 1) * 12, 65, (band ? 11 : 8.5) + 10 * q.e * near + (k === 1 ? 1.5 : 0), 1);
          g.beginPath(); strip(run, LANE_L[k], LANE_R[k]); g.fill();
        }
        g.strokeStyle = HS(th + 40, 90, 72, 0.6 * near); g.lineWidth = Math.max(1, 1.6 * dpr * near);
        g.beginPath(); line(run, LANE_R[0]); line(run, LANE_R[1]); g.stroke();
        g.fillStyle = HS(th - 30, 95, 60, 0.12 + 0.12 * kick);   // the rails: glass walls with a bright top
        g.beginPath(); strip(run, p => p.l, p => p.lr); strip(run, p => p.r, p => p.rr); g.fill();
        g.strokeStyle = HS(th - 30, 95, 60 + 20 * kick, 0.3 + 0.7 * near); g.lineWidth = Math.max(1, (2 + 3 * kick) * dpr * near);
        g.beginPath(); line(run, p => p.lr); line(run, p => p.rr); g.stroke();
      }
      // the beats laid on the track: a line on every beat (thicker on each bar) that you ride over in time
      for (let n = Math.max(0, Math.floor(now / stepDur / 4) * 4); n < N; n += 4) {
        const s = S[n]; if (s < cam.s + 1) continue; if (s > cam.s + SHOW * 0.8) break;
        const y = at(Y, s), [ax, as] = side(s, -half), [bx, bs] = side(s, half), a = proj(ax, y + 0.01, as), b = proj(bx, y + 0.01, bs); if (!a || !b) continue;
        const far = (s - cam.s) / SHOW, bar1 = n % 16 === 0;
        g.strokeStyle = HS(hue + 20, 90, 78, (bar1 ? 0.6 : 0.3) * (1 - far)); g.lineWidth = Math.max(1, (bar1 ? 3 : 1.5) * dpr * (1 - far));
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      // the build-ups: a tunnel of light arches, one on every beat, brighter as the riser climbs; each one flashes as you pass under it
      for (let n = Math.max(0, Math.floor(shipS > 0 ? now / stepDur / 4 : 0) * 4 - 4); n < N; n += 4) {
        const sA = S[n]; if (sA < cam.s + 2) continue; if (sA > cam.s + SHOW * 0.75) break;
        const sc = secs[stepSec[n]]; if (sc.k !== 'build') continue;
        const prog = (n / 16 - sc.b0) / sc.bars, far = (sA - cam.s) / (SHOW * 0.75), pass = Math.exp(-Math.abs(sA - shipS) * 0.25);
        const c = at(Xc, sA), y = at(Y, sA), Ra = half + 0.7 + (n % 16 === 0 ? 0.35 : 0), hd = Math.atan((at(Xc, sA + 1) - at(Xc, sA - 1)) / 2), ch = Math.cos(hd), sh2 = Math.sin(hd);
        const pts2 = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI, q = proj(c + Math.cos(a) * Ra * ch, y + RAIL + Math.sin(a) * Ra * 0.85, sA - Math.cos(a) * Ra * sh2); if (!q) { pts2.length = 0; break; } pts2.push(q); }
        if (!pts2.length) continue;
        g.beginPath(); pts2.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
        const gone = sA < shipS ? Math.max(0, 1 - (shipS - sA) / 3) : 1;   // behind the ship it fades out at once
        g.strokeStyle = HS(hue + 40 + prog * 120, 100, 60 + 30 * pass, ((0.15 + 0.7 * prog) * (1 - far * 0.7) + 0.5 * pass) * gone);
        g.lineWidth = Math.max(1, Math.min(5 * dpr, pts2[5][2] * (0.06 + 0.06 * pass))); g.stroke();
      }
      // posts along the rails that flash with the hats
      for (let s = Math.ceil((cam.s + 10) / 12) * 12; s < cam.s + SHOW * 0.7; s += 12) {
        const y = at(Y, s);
        for (const sd of [-1, 1]) {
          const [px2, ps2] = side(s, sd * (half + 0.15)), a = proj(px2, y + RAIL, ps2), b = proj(px2, y + RAIL + 1.3 + 1.2 * e, ps2); if (!a || !b) continue;
          g.strokeStyle = HS(hue + 60, 90, 72, 0.15 + 0.6 * hat); g.lineWidth = Math.max(1, Math.min(3 * dpr, a[2] * 0.06));
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
          g.fillStyle = HS(hue + 60, 90, 80, 0.3 + 0.7 * hat); const r = Math.max(1, Math.min(4 * dpr, a[2] * 0.08)); g.fillRect(b[0] - r, b[1] - r, r * 2, r * 2);
        }
      }
      // the hit line: a bar of light across the lanes at the ship, a pad on each lane (lit when you strike it),
      // and on each lane a ring in the colour of its next note, closing in on the pad: it meets it right on the note's time
      { const sL = lineS, yL = at(Y, sL) + 0.04, LP = u => { const [x2, s2] = side(sL, u); return proj(x2, yL, s2); }, a = LP(-half), b = LP(half);
        if (a && b) {
          g.strokeStyle = HS(hue - 40, 100, 78, 0.9); g.lineWidth = Math.max(2, 3 * dpr); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
          const nq = [null, null, null]; for (let i = ni; i < notes.length; i++) { const q = notes[i]; if (q.t > now + 0.8) break; if (!q.st && !nq[q.lane]) nq[q.lane] = q; }
          for (let k = 0; k < 3; k++) {
            const p = LP((k - 1) * LW); if (!p) continue;
            const rx = 0.8 * p[2], ry = 0.26 * p[2], fl = P.pads[k];
            g.lineWidth = Math.max(1.5, 2 * dpr); g.strokeStyle = HS(hue - 40, 100, 82, 0.45 + 0.55 * fl);
            g.beginPath(); g.ellipse(p[0], p[1], rx, ry, 0, 0, 6.2832); g.stroke();
            if (fl > 0.02) { g.fillStyle = HS(hue - 40, 100, 75, 0.5 * fl); g.fill(); }
            const q = nq[k]; if (q) { const f = Math.max(0, (q.t - now) / 0.8); g.strokeStyle = rgba(COL[q.ly], (0.95 - f * 0.6).toFixed(2)); g.lineWidth = Math.max(1, 2.5 * dpr); g.beginPath(); g.ellipse(p[0], p[1], rx * (1 + f * 2.2), ry * (1 + f * 2.2), 0, 0, 6.2832); g.stroke(); }
          }
        }
      }
      // held notes: a ribbon down the lane to where the hold ends; while you hold it, it runs from the line, bright and flickering
      for (const q of notes) {
        if (!q.dur || q.hold === 2 || q.sEnd < cam.s + 1.2 || q.s > cam.s + SHOW) continue;
        const holding = q.hold === 1, s0 = Math.max(q.st === 1 ? lineS : q.s, cam.s + 1.2), s1 = Math.min(q.sEnd, cam.s + SHOW); if (s1 <= s0) continue;
        const dim = q.st === 2 || q.hold === 3 ? 0.25 : 1, u = (q.lane - 1) * LW, wv = LW * (holding ? 0.2 : 0.15), Lq = [], Rq = [];
        for (let s2 = s0, k = 0; k < 80; k++) {
          const y = at(Y, s2) + 0.05, [lx, ls] = side(s2, u - wv), [rx, rs] = side(s2, u + wv), a = proj(lx, y, ls), b = proj(rx, y, rs); if (a && b) { Lq.push(a); Rq.push(b); }
          if (s2 >= s1) break; s2 = Math.min(s1, s2 + (s2 - cam.s < 40 ? 2.6 : 6));
        }
        if (Lq.length < 2) continue;
        g.beginPath(); g.moveTo(Lq[0][0], Lq[0][1]); for (let i = 1; i < Lq.length; i++) g.lineTo(Lq[i][0], Lq[i][1]); for (let i = Rq.length - 1; i >= 0; i--) g.lineTo(Rq[i][0], Rq[i][1]); g.closePath();
        g.fillStyle = rgba(COL[q.ly], (holding ? 0.6 + 0.25 * Math.sin(now * 30) : 0.38) * dim); g.fill();
        g.strokeStyle = rgba(COL[q.ly], 0.9 * dim); g.lineWidth = Math.max(1, 1.5 * dpr); g.stroke();
      }
      // notes (little 3D pieces that spin) and static blocks, far to near
      const objs = [];
      for (const q of notes) { if (q.st === 1 || q.s < cam.s + 0.8 || q.s > cam.s + SHOW) continue; objs.push(q); }
      for (const b of blocks) { if (b.st === 1 || b.s < cam.s + 0.8 || b.s > cam.s + SHOW) continue; if (b.st === 2 && b.s < cam.s + 7) continue; objs.push(b); }
      objs.sort((a, b) => b.s - a.s);
      g.lineWidth = Math.max(1, dpr);
      for (const o of objs) {
        const [c, os] = side(o.s, (o.lane - 1) * LW), y = at(Y, o.s);
        if (o.ly === undefined) {   // static: a dark box, its face a screen of noise
          mesh(CUBE_V, CUBE_F, c, y + 0.7, os, 0, 0, Math.atan2(at(SN, o.s), at(CS, o.s)), 0.72, blockPaint, true);
          const p0 = proj(c - 0.66, y + 0.06, os - 0.72), p1 = proj(c + 0.66, y + 1.34, os - 0.72); if (!p0 || !p1) continue;
          const w2 = p1[0] - p0[0], h2 = p0[1] - p1[1], cells = 7;
          for (const lv of [0, 1]) { g.beginPath(); for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) { const v = Math.random(); if (v < 0.4 || (v > 0.72) !== !!lv) continue; g.rect(p0[0] + w2 * i / cells, p1[1] + h2 * j / cells, w2 / cells + 0.5, h2 / cells + 0.5); } g.fillStyle = lv ? 'rgba(250,250,255,0.82)' : 'rgba(215,215,230,0.5)'; g.fill(); }
          continue;
        }
        const col = COL[o.ly], dim = o.st === 2 ? 0.3 : 1, yy = y + 0.45, spin = now * 2.2 + o.n * 0.7;
        if (o.s - cam.s < 140) { const w2 = LW * 0.36, cs = at(CS, o.s), sn = at(SN, o.s), Q2 = (u, v) => proj(c + u * cs + v * sn, y + 0.03, os - u * sn + v * cs), a1 = Q2(-w2, -0.5), a2 = Q2(w2, -0.5), a3 = Q2(w2, 0.5), a4 = Q2(-w2, 0.5);
          if (a1 && a2 && a3 && a4) { g.fillStyle = rgba(col, 0.35 * dim); g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.lineTo(a3[0], a3[1]); g.lineTo(a4[0], a4[1]); g.closePath(); g.fill(); } }   // its plate on the track: it crosses the line on time
        const halo = proj(c, yy, os); if (!halo) continue;
        g.fillStyle = rgba(col, 0.16 * dim); g.beginPath(); g.arc(halo[0], halo[1], Math.max(2, 0.95 * halo[2]), 0, 6.283); g.fill();
        if (o.s - cam.s > 95) { g.fillStyle = rgba(col, 0.9 * dim); g.beginPath(); g.arc(halo[0], halo[1], Math.max(1.2, 0.4 * halo[2]), 0, 6.283); g.fill(); continue; }   // far: a dot
        const paint = notePaint(o.ly, dim);
        if (o.ly === 0) mesh(CUBE_V, CUBE_F, c, yy, os, 0.5, spin * 0.5, spin, 0.36, paint, true);
        else if (o.ly === 1) mesh(OCTA_V, OCTA_F, c, yy, os, 0, 0, spin, 0.42, paint, true);
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
      const hov = 0.55 + Math.sin(now * 3.1) * 0.04 - kick * 0.08, sy = at(Y, shipS) + hov, ss = shipSS;
      const sh = proj(shipX, at(Y, shipS) + 0.02, ss);   // its shadow on the track
      if (sh) {
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(sh[0], sh[1], 1.1 * sh[2], 0.28 * sh[2], 0, 0, 6.283); g.fill();
        if (kick > 0.05) { g.fillStyle = HS(hue - 40, 100, 65, 0.45 * kick * e); g.beginPath(); g.ellipse(sh[0], sh[1], (1.2 + 1.4 * (1 - kick)) * sh[2], (0.3 + 0.3 * (1 - kick)) * sh[2], 0, 0, 6.283); g.fill(); }   // it lands on the kick
      }
      // the wingtips leave two ribbons of light
      const tipL = rot([-1.2, 0.2, -0.95], bank, pitch, shipYaw), tipR = rot([1.2, 0.2, -0.95], bank, pitch, shipYaw);
      trail.push([shipX + tipL[0] * 0.9, sy + tipL[1] * 0.9, ss + tipL[2] * 0.9, shipX + tipR[0] * 0.9, sy + tipR[1] * 0.9, ss + tipR[2] * 0.9]); if (trail.length > 22) trail.shift();
      { const tp = trail.map(a => [proj(a[0], a[1], a[2]), proj(a[3], a[4], a[5])]), CH = 4;   // (in a few pieces, each one stroke, fading out behind)
        for (let i0 = 0; i0 < tp.length - 1; i0 += CH) {
          const al = Math.min(tp.length - 1, i0 + CH) / tp.length; g.strokeStyle = HS(hue - 40, 95, 70, 0.5 * al); g.lineWidth = Math.max(1, 2.5 * dpr * al); g.beginPath();
          for (const o of [0, 1]) for (let i = i0 + 1; i <= Math.min(tp.length - 1, i0 + CH); i++) { const p0 = tp[i - 1][o], p1 = tp[i][o]; if (!p0 || !p1) continue; g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); }
          g.stroke();
        }
      }
      // the engines' flame behind it
      const eng = rot([0, 0.17, -0.9], bank, pitch, shipYaw), ep = proj(shipX + eng[0] * 0.9, sy + eng[1] * 0.9, ss + eng[2] * 0.9);
      if (ep) { const r = (0.4 + 0.2 * kick + Math.random() * 0.08) * ep[2], gr = g.createRadialGradient(ep[0], ep[1], 0, ep[0], ep[1], r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, `hsla(${hue - 40},100%,65%,0.8)`); gr.addColorStop(1, `hsla(${hue - 40},100%,50%,0)`); g.fillStyle = gr; g.beginPath(); g.arc(ep[0], ep[1], r, 0, 6.283); g.fill(); }
      // the shots: a laser from the nose to the lane on the hit line (a miss flies on into the distance); a held note keeps it on
      { const nose = rot([0, 0.12, 1.9], bank, pitch, shipYaw), np = proj(shipX + nose[0], sy + nose[1], ss + nose[2]);
        const shot = (lane, c, al, far, wd) => {
          const sT = lineS + (far ? 26 : 0), [tx, ts] = side(sT, (lane - 1) * LW), tp = proj(tx, at(Y, sT) + 0.45, ts); if (!np || !tp) return;
          g.lineCap = 'round'; g.strokeStyle = rgba(c, 0.35 * al); g.lineWidth = Math.max(2, wd * 3 * dpr); g.beginPath(); g.moveTo(np[0], np[1]); g.lineTo(tp[0], tp[1]); g.stroke();
          g.strokeStyle = rgba(WHITE, 0.9 * al); g.lineWidth = Math.max(1, wd * dpr); g.stroke(); g.lineCap = 'butt';
        };
        for (const b of P.beams) shot(b.lane, b.c, b.life / 0.16, !b.hit, 2);
        for (let l = 0; l < 3; l++) if (P.act[l]) shot(l, COL[P.act[l].ly], 0.7 + 0.3 * Math.sin(now * 40), false, 1.5);
      }
      const tone = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
      g.lineWidth = Math.max(1, 1.2 * dpr);
      mesh(SHIP_V, SHIP_F, shipX, sy, ss, bank, pitch, shipYaw, 1.0, (k, l) => {
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
      if (ended) return; ended = true; fsOff();
      const total = notes.length, pct = total ? Math.round(P.caught / total * 100) : 0;
      const acc = total ? (3 * P.jc[0] + 2 * P.jc[1] + P.jc[2]) / (3 * total) : 0;   // precision: a perfect counts 3, a good 2, early/late 1
      const grade = acc >= 0.9 && pct >= 95 && !P.hitBlocks ? 'S' : acc >= 0.78 ? 'A' : acc >= 0.62 ? 'B' : acc >= 0.42 ? 'C' : 'D';
      const mean = P.caught ? P.errSum / P.caught : 0;
      const words = { S: tr('¡Perfecto!', 'Perfect!'), A: tr('¡Muy bien surfeado!', 'Nicely surfed!'), B: tr('Buen surco', 'A good groove'), C: tr('El tema sonó a medias', 'The song half played'), D: tr('El tema se apagó', 'The song faded out') };
      const box = el('div', 'sc-res');
      LAYERS.forEach((Lr, i) => { const t = notes.filter(q => q.ly === i), c = t.filter(q => q.st === 1).length; const r = el('div', 'sc-rrow'); r.style.setProperty('--c', `rgb(${COL[i].join(',')})`); r.append(el('span', null, Lr.name), el('b', null, t.length ? Math.round(c / t.length * 100) + '%' : '—')); box.append(r); });
      if (P.holdN) { const hr = el('div', 'sc-rrow'); hr.style.setProperty('--c', '#fff'); hr.append(el('span', null, tr('Sostenidas', 'Held notes')), el('b', null, `${P.holdOk}/${P.holdN}`)); box.append(hr); }
      const jr = el('div', 'sc-rrow sc-rj'); jr.append(el('span', null, tr(`Perfectos ${P.jc[0]} · Bien ${P.jc[1]} · Justos ${P.jc[2]} · Fallados ${P.missed}`, `Perfect ${P.jc[0]} · Good ${P.jc[1]} · Close ${P.jc[2]} · Missed ${P.missed}`))); box.append(jr);
      if (P.caught >= 12 && Math.abs(mean) > 0.025) box.append(el('p', 'sc-rtip', tr(`En promedio tocaste ${Math.round(Math.abs(mean) * 1000)} ms ${mean > 0 ? 'tarde' : 'temprano'}: si te pasa siempre, probá «Calibrar sonido».`, `On average you struck ${Math.round(Math.abs(mean) * 1000)} ms ${mean > 0 ? 'late' : 'early'}: if it always happens, try «Calibrate audio».`)));
      ctx.done({ score: P.score, text: `${grade} · ${words[grade]}`,
        detail: tr(`${P.caught} de ${total} notas (${pct} %) · precisión ${Math.round(acc * 100)} % · combo máximo ${P.maxCombo} · ${DIFFS.find(x => x[0] === diff)[1]} · ${STYLES[style]} en ${keyName(st.root)} a ${bpm} BPM`, `${P.caught} of ${total} notes (${pct}%) · accuracy ${Math.round(acc * 100)}% · best combo ${P.maxCombo} · ${DIFFS.find(x => x[0] === diff)[1]} · ${STYLES[style]} in ${keyName(st.root)} at ${bpm} BPM`),
        better: 'high', extra: [box] });
    }

    raf = requestAnimationFrame(frame);
    ctx.hud(`<span class="jg-hud-i">${STYLES[style]} · ${bpm} BPM</span>`);
    Object.assign(ctx.test, { quality: () => Q, lockQ(v) { Q = v; qLock = true; }, diff, OFF, strike, songNow, cam, P, H, notes, blocks, secs, st, N, stepDur, songTime, finish, setPause, move, setAuto(v) { auto = !!v; }, press(l) { KH['T' + l] = l; strike(l, songNow()); }, lift(l) { delete KH['T' + l]; release(l); } });   // (Object.assign would drop a setter)

    return () => {
      clearInterval(tick); cancelAnimationFrame(raf); if (ro) ro.disconnect();
      removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); document.removeEventListener('visibilitychange', onVis);
      stage.classList.remove('sc-stage'); fsOff();
      try { ac.close(); } catch (e) { /* already closed */ }
    };
  }

  const ART = '<svg viewBox="0 0 120 64"><defs><linearGradient id="scg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff3fa4"/><stop offset="1" stop-color="#3ff0ff"/></linearGradient></defs>'
    + '<path d="M10 62 L52 18 L68 18 L110 62 Z" fill="#0d0a1c" stroke="url(#scg)" stroke-width="2.5"/><path d="M58 18 L50 62 M62 18 L70 62" stroke="#ff3fa4" stroke-width="1" opacity=".6"/>'
    + '<rect x="47" y="30" width="7" height="7" fill="#ff4a6a"/><path d="M66 38 l5 -5 l5 5 l-5 5 z" fill="#3ff0ff"/><circle cx="60" cy="48" r="4.5" fill="#ffd23f"/>'
    + '<path d="M60 52 l-7 9 l7 -3 l7 3 z" fill="#e8fbff"/><path d="M30 14 a30 30 0 0 1 60 0" fill="none" stroke="#ff3fa4" stroke-width="2" opacity=".7"/></svg>';

  J.GAMES.push({
    id: 'surco', wide: true, noDaily: true, title: tr('Surco', 'Groove'), tag: tr('Ritmo · nuevo', 'Rhythm · new'), art: ART,
    desc: tr('SYNDRUS compone un tema y vos lo tocás: pegale a cada nota en su momento y el tema suena completo.', 'SYNDRUS composes a song and you play it: strike each note on time and the song plays in full.'),
    how: tr('SYNDRUS compone un tema nuevo cada vez, con intro, subidas, drops, un corte y un cierre, y la pista lo sigue. Por los tres carriles vienen las notas del tema, cada una de un instrumento: cubos rojos el bajo, rombos celestes el arpegio, esferas amarillas la percusión. Las notas siguen el groove: el carril del centro marca el tiempo (el bombo) y los de los costados lo que cae entre medio (el bajo, a la izquierda si baja y a la derecha si sube; en Fácil, una por tiempo: el 1 y el 3 al centro, el 2 y el 4 a un costado). La nave les dispara: tocá cada nota justo cuando cruza la línea de luz, delante de la nave: un anillo de su color se cierra sobre el carril y la toca en el momento exacto. Según tu precisión: ¡Perfecto!, Bien, o Temprano/Tarde. Si fallás una, ese instrumento se corta hasta que vuelvas a acertarle. Las notas con cola son sostenidas: tocalas a tiempo y mantené apretado hasta el final de la cola (el láser queda prendido); vienen en el redoble antes de cada drop y en las frases del corte. En Difícil, mientras sostenés, los tiempos siguen en el centro: otro dedo. La racha multiplica (hasta ×8). Esquivá los bloques de estática. Compu: A S D (o J K L) tocan cada carril; ← → mueven sin tocar, Espacio toca el carril donde estás, P pausa. Celular: tocá el tercio de la pantalla de cada carril. Joystick: X Y B tocan cada carril, A el actual. Antes de jugar, «Calibrar sonido» mide la demora de tu parlante o auriculares (los Bluetooth tardan bastante): con eso la nota suena justo cuando le pegás. Con auriculares se disfruta más.',
      'SYNDRUS composes a new song every time, with an intro, build-ups, drops, a break and an outro, and the track follows it. The notes of the song come down the three lanes, each from an instrument: red cubes the bass, cyan diamonds the arp, yellow orbs the percussion. The notes follow the groove: the middle lane is the beat (the kick) and the side lanes what falls in between (the bass, left when it goes down, right when it goes up; on Easy, one per beat: 1 and 3 in the middle, 2 and 4 to a side). The ship shoots them: strike each note right as it crosses the line of light ahead of the ship: a ring in its colour closes in on the lane and meets it at the exact moment. By your timing: Perfect!, Good, or Early/Late. Miss one and that instrument cuts out until you hit it again. Notes with a tail are held: strike them on time and keep holding to the end of the tail (the laser stays on); they come in the snare roll before each drop and in the break\'s phrases. On Hard, while you hold, the beats go on in the middle: another finger. Your streak multiplies (up to ×8). Dodge the static blocks. Computer: A S D (or J K L) strike each lane; ← → move without striking, Space strikes your lane, P pauses. Phone: tap each lane\'s third of the screen. Gamepad: X Y B strike each lane, A the current one. Before playing, «Calibrate audio» measures your speaker\'s or headphones\' delay (Bluetooth lags a lot): then the note sounds right when you strike it. Best with headphones.'),
    get brief() {
      const t = isTouch();
      return tr('SYNDRUS compone un tema y vos lo tocás: la nave le dispara a cada nota cuando cruza la línea de luz. ' + (t ? 'tocá el tercio de la pantalla de su carril.' : 'A S D (o J K L) para cada carril.') + ' El centro marca el tiempo; los costados, el contratiempo. Las notas con cola se mantienen apretadas. Si fallás, ese instrumento se corta. Calibrá el sonido una vez, sobre todo con auriculares Bluetooth.',
        'SYNDRUS composes a song and you play it: the ship shoots each note as it crosses the line of light. ' + (t ? 'tap its lane\'s third of the screen.' : 'A S D (or J K L) for each lane.') + ' The middle is the beat; the sides, the off-beat. Notes with a tail are held down. Miss and that instrument cuts out. Calibrate the audio once, especially with Bluetooth headphones.');
    },
    startNote() {   // the difficulty, and the device's sound delay
      const box = el('div', 'sc-setup'), row = el('div', 'jg-btns sc-diff');
      DIFFS.forEach(([k, label]) => { const b = el('button', 'jg-btn' + (k === getDiff() ? ' on' : ''), label); b.addEventListener('click', () => { LS.set('surco_diff', k); row.querySelectorAll('.jg-btn').forEach(x => x.classList.toggle('on', x === b)); }); row.append(b); });
      const cal = el('button', 'jg-cb sc-calb'), paint = () => { cal.textContent = '🎧 ' + tr('Calibrar sonido', 'Calibrate audio') + ' · ' + fmtMs(getOff()); };
      paint(); cal.addEventListener('click', () => calibrate(paint));
      box.append(row, cal); return { el: box };
    },
    better: 'high', fmt: n => Number(n).toLocaleString(J.LOCALE),
    options: [['techno', 'Techno'], ['psy', 'Psytrance'], ['hoy', tr('Tema del día', 'Song of the day')]], dayOption: 'hoy',
    start,
  });
  if (J.route && /^#surco/.test(location.hash)) J.route();
  else if (J.repaintHub) J.repaintHub();   // the hub was drawn before this file loaded: now with its card
})();
