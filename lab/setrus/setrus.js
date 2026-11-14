/* SETRUS — the show in a timeline. Sections (intro, build, drop…) say what plays in SYNDRUS (bank patterns,
   crossfader, riser / drop at the end) and what is seen in NODRUS (scene, fade, flash, black), and how many bars.
   SYNDRUS is the clock: SETRUS sends every cue ahead of time with the bar it belongs to, and SYNDRUS runs it on its
   audio clock (exact to the step); NODRUS times its look on the beat it hears. Same channel the two already share
   ('pudrus-syndrus'); without SETRUS neither of them changes. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt !== undefined) e.textContent = txt; return e; };
  const KEY = 'setrus_v1';
  const COLORS = ['#66ff33', '#00d4ff', '#ff3fa4', '#ffd23f', '#b06bff', '#ff8a3d'];
  const XF = { A: 0, mid: 0.5, B: 1 };
  const END = { none: '', up: '↗ subida', drop: '⤓ drop', down: '↘ bajada' };
  const uid = () => Math.random().toString(36).slice(2, 9);

  /* ── the show ── */
  const SEC = (o = {}) => Object.assign({ id: uid(), name: 'Sección', color: 0, bars: 16, hold: false, a: -1, b: -1, xf: 'keep', xfBars: 0, end: 'none', endBars: 4, scene: -1, fade: 1, flash: false, black: 'keep' }, o);
  const example = () => ({ v: 1, name: 'Mi show', next: 'phrase', end: 'hold', sections: [
    SEC({ name: 'Intro', color: 1, bars: 8, a: 0, xf: 'A', scene: 0, fade: 2, black: 'off' }),
    SEC({ name: 'Subida', color: 3, bars: 8, b: 1, end: 'drop', endBars: 4, scene: 1 }),
    SEC({ name: 'Drop', color: 0, bars: 16, xf: 'B', scene: 2, fade: 0, flash: true }),
    SEC({ name: 'Respiro', color: 4, bars: 8, hold: true, xf: 'A', xfBars: 4, scene: 3, fade: 2, end: 'up', endBars: 4 }),
    SEC({ name: 'Final', color: 2, bars: 16, xf: 'B', scene: 'random', fade: 0, flash: true, end: 'down', endBars: 2 }),
  ] });
  const int = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  function saneSec(s) {
    s = s && typeof s === 'object' ? s : {};
    return SEC({
      id: typeof s.id === 'string' ? s.id.slice(0, 12) : uid(), name: String(s.name || 'Sección').slice(0, 24), color: int(s.color, 0, COLORS.length - 1, 0),
      bars: int(s.bars, 1, 256, 16), hold: !!s.hold, a: int(s.a, -1, 7, -1), b: int(s.b, -1, 7, -1),
      xf: s.xf in XF || s.xf === 'keep' ? s.xf : 'keep', xfBars: [0, 1, 2, 4, 8].includes(s.xfBars) ? s.xfBars : 0,
      end: s.end in END ? s.end : 'none', endBars: [1, 2, 4, 8].includes(s.endBars) ? s.endBars : 4,
      scene: s.scene === 'random' ? 'random' : int(s.scene, -1, 15, -1), fade: [0, 0.5, 1, 2, 4].includes(s.fade) ? s.fade : 1,
      flash: !!s.flash, black: ['keep', 'on', 'off'].includes(s.black) ? s.black : 'keep',
    });
  }
  function sane(o) {
    o = o && typeof o === 'object' ? o : {};
    const secs = Array.isArray(o.sections) ? o.sections.slice(0, 64).map(saneSec) : [];
    return { v: 1, name: String(o.name || 'Mi show').slice(0, 40), next: o.next === 'bar' ? 'bar' : 'phrase', end: ['hold', 'loop', 'stop'].includes(o.end) ? o.end : 'hold', sections: secs.length ? secs : [SEC({ name: 'Intro' })] };
  }
  let show;
  try { const raw = localStorage.getItem(KEY); show = raw ? sane(JSON.parse(raw)) : example(); } catch (e) { show = example(); }
  let sel = 0, saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(show)); } catch (e) { /* full / private */ } }, 250); };

  /* ── what SYNDRUS and NODRUS have: bank names and scene thumbnails (same origin → their saved data) ── */
  let bank = [], scenes = [];
  function readBank() {
    if (SY.bank) { bank = SY.bank; return; }
    try { const a = JSON.parse(localStorage.getItem('syndrus_v2') || 'null'); bank = a && Array.isArray(a.bank) ? a.bank.map(b => (b ? b.name : null)) : []; } catch (e) { bank = []; }
  }
  function readScenes() {
    try { const a = JSON.parse(localStorage.getItem('pudrus_nodes_scenes_v1') || '[]'); scenes = Array.from({ length: 16 }, (_, i) => (a[i] ? { thumb: a[i].thumb || '' } : null)); } catch (e) { scenes = []; }
  }
  addEventListener('storage', e => { if (e.key === 'pudrus_nodes_scenes_v1') { readScenes(); paint(); } else if (e.key === 'syndrus_v2' && !SY.bank) { readBank(); paint(); } });

  /* ── link ── */
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('pudrus-syndrus') : null;
  const SY = { last: -1e9, bpm: 120, beat: 0, epoch: 0, playing: false, bank: null, audio: 'none', infoAt: 0 };
  let nodSeen = -1e9;
  const epochNow = () => performance.timeOrigin + performance.now();
  const syAlive = () => performance.now() - SY.last < 1500;
  const noAlive = () => performance.now() - nodSeen < 5000;
  const beatNow = () => (SY.playing ? SY.beat + (epochNow() - SY.epoch) / 1000 * SY.bpm / 60 : SY.beat);
  const send = m => { if (ch) ch.postMessage(m); };
  if (ch) {
    ch.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'sync') { SY.last = performance.now(); if (run.on && m.epoch < run.since) return; SY.bpm = m.bpm; SY.beat = m.beat; SY.epoch = m.epoch; SY.playing = !!m.playing; }
      else if (m.type === 'show-syndrus') {
        SY.last = performance.now(); SY.infoAt = performance.now(); SY.audio = m.audio; SY.vol = Number.isFinite(m.vol) ? m.vol : 1;
        const nb = JSON.stringify(m.bank); if (nb !== JSON.stringify(SY.bank)) { SY.bank = m.bank; readBank(); paint(); }
      } else if (m.type === 'nodrus') nodSeen = performance.now();
    };
    send({ type: 'show-hello' });
    setInterval(() => send({ type: 'show-hello' }), 2500);
  }
  const wins = {};
  function openWin(which) {
    const url = new URL(which === 'sy' ? '../syndrus/' : '../nodes/' + (/Mobi|Android/i.test(navigator.userAgent) ? '' : '?pc'), location.href).href;
    const w = window.open(url, which === 'sy' ? 'syndrus' : 'nodrus');
    if (w) wins[which] = w;
    if (!w) toast('El navegador bloqueó la ventana: permití las ventanas emergentes', true);
  }
  $('#lnkSy').addEventListener('click', () => openWin('sy'));
  $('#lnkNo').addEventListener('click', () => openWin('no'));

  /* ── the conductor ── */
  // plan: [{ i, start }] — section i starts at bar `start` (bars counted from play); i = 'stop' ends the show
  const run = { on: false, plan: [], startedAt: 0, queued: -1, since: 0 };
  function buildPlan(i, S) {
    const out = [];
    for (let guard = 0; guard < 64; guard++) {
      out.push({ i, start: S });
      const sec = show.sections[i];
      if (!sec || sec.hold) break;
      S += sec.bars;
      let n = i + 1;
      if (n >= show.sections.length) {
        if (show.end === 'loop') n = 0;
        else { if (show.end === 'stop') out.push({ i: 'stop', start: S }); break; }
      }
      i = n;
    }
    return out;
  }
  const musicCmd = sec => {
    const c = {}, load = [[0, sec.a], [1, sec.b]].filter(x => x[1] >= 0);
    if (load.length) c.load = load;
    if (sec.xf !== 'keep') c.xf = { to: XF[sec.xf], bars: sec.xfBars };
    return c;
  };
  const lookOf = sec => {
    const l = { fade: sec.fade };
    if (sec.scene === 'random' || sec.scene >= 0) l.scene = sec.scene;
    if (sec.flash) l.flash = true;
    if (sec.black !== 'keep') { l.black = sec.black === 'on'; l.blackFade = sec.fade; }
    return l;
  };
  // send every cue of the plan that falls on bar ≥ fromBar (the first entry is the section already playing)
  function sendPlan(plan, fromBar) {
    plan.forEach((ent, k) => {
      if (k > 0 && ent.start >= fromBar) {
        if (ent.i === 'stop') { send({ type: 'show-cue', bar: ent.start, cmd: { stop: true } }); send({ type: 'show-look', beat: ent.start * 4, since: run.since, black: true, blackFade: 1 }); }
        else { const sec = show.sections[ent.i]; send({ type: 'show-cue', bar: ent.start, cmd: musicCmd(sec) }); send({ type: 'show-look', beat: ent.start * 4, since: run.since, ...lookOf(sec) }); }
      }
      const nx = plan[k + 1], sec = typeof ent.i === 'number' ? show.sections[ent.i] : null;
      if (nx && sec && sec.end !== 'none') {   // the end of this section: riser / drop / downer so that the next one lands on its one
        const bars = Math.max(1, Math.min(sec.endBars, nx.start - ent.start)), at = nx.start - bars;
        if (at >= fromBar) send({ type: 'show-cue', bar: at, cmd: { fx: { kind: sec.end, bars } } });
      }
    });
  }
  const barNow = () => beatNow() / 4;
  function curEntry() {
    const b = Math.floor(barNow() + 1e-6); let cur = run.plan[0];
    for (const e of run.plan) if (e.start <= b) cur = e;
    return cur;
  }
  // the earliest bar a change can still land on (a cue right at the end of a bar could miss SYNDRUS' look-ahead)
  const minBar = () => { const b = barNow(); return Math.floor(b) + (b % 1 > 0.85 ? 2 : 1); };
  function play(i) {
    if (!ch) { toast('Este navegador no puede conectar las ventanas', true); return; }
    if (!syAlive()) { toast('Abrí SYNDRUS primero (botón 🎛 de arriba): es el reloj del show', true); return; }
    const sec = show.sections[i]; if (!sec) return;
    send({ type: 'show-clear', ramp: true });
    run.on = true; run.startedAt = performance.now(); run.queued = -1; run.since = epochNow();
    run.plan = buildPlan(i, 0);
    send({ type: 'show-play', cmd: musicCmd(sec) });
    send({ type: 'show-look', ...lookOf(sec) });   // now
    sendPlan(run.plan, 1);
    SY.beat = 0; SY.epoch = epochNow(); SY.playing = true;   // until the first sync arrives
    if (!noAlive()) toast('▶ Show en marcha · NODRUS no está abierto: sólo suena la música');
    setTimeout(() => {
      if (run.on && SY.vol <= 0.02) { toast('SYNDRUS tiene el volumen master en 0: subí el fader «master» en su Mezcla', true); return; }
      if (!run.on || SY.audio !== 'suspended') return;
      toast('SYNDRUS no suena todavía: andá a su ventana y hacé un clic en cualquier lado (el navegador lo pide una vez)', true);
      try { if (wins.sy && !wins.sy.closed) wins.sy.focus(); } catch (e) { /* other window */ }
    }, 1200);
    paint();
  }
  function stop() {
    run.on = false; run.queued = -1;
    send({ type: 'show-stop' }); send({ type: 'show-clear', ramp: true });
    paint();
  }
  // jump to section k: the current one ends on the next bar or phrase (leaving room for its riser / drop)
  function jump(k) {
    if (!run.on) { sel = k; play(k); return; }
    if (k !== 'stop') k = ((k % show.sections.length) + show.sections.length) % show.sections.length;
    const cur = curEntry(); if (!cur || typeof cur.i !== 'number') return;
    const sec = show.sections[cur.i], mb = minBar();
    let E = mb + (sec.end !== 'none' ? sec.endBars : 0);
    if (show.next === 'phrase') E = cur.start + Math.ceil((E - cur.start) / 4) * 4;
    send({ type: 'show-clear' });
    run.plan = [{ i: cur.i, start: cur.start }, ...(k === 'stop' ? [{ i: 'stop', start: E }] : buildPlan(k, E))];
    run.queued = k === 'stop' ? -1 : k;
    sendPlan(run.plan, mb);
    const wait = E - Math.floor(barNow());
    toast(`${k === 'stop' ? 'El final' : `«${show.sections[k].name}»`} entra en ${wait} compás${wait === 1 ? '' : 'es'}` + (sec.end !== 'none' ? ` · con ${END[sec.end]}` : ''));
    paint();
  }
  function next() {
    if (!run.on) return;
    const cur = curEntry(); if (!cur || typeof cur.i !== 'number') return;
    let n = cur.i + 1;
    if (n >= show.sections.length) { if (show.end === 'loop') n = 0; else if (show.end === 'stop') n = 'stop'; else { toast('Es la última sección'); return; } }
    jump(n);
  }
  // an edit while playing: the sections after the current one are planned again (the current keeps its start)
  let replanT = 0;
  function replan() {
    if (!run.on) return;
    clearTimeout(replanT);
    replanT = setTimeout(() => {
      const cur = curEntry(); if (!cur || typeof cur.i !== 'number') return;
      const idx = run.plan.indexOf(cur), nx = run.plan[idx + 1], sec = show.sections[cur.i];
      if (!sec) return;
      let plan;
      if (nx && run.queued >= 0) plan = [cur, ...buildPlan(nx.i === 'stop' ? cur.i : nx.i, nx.start)];   // a jump the user asked for stays
      else plan = buildPlan(cur.i, cur.start);
      send({ type: 'show-clear' });
      run.plan = plan; sendPlan(run.plan, minBar());
    }, 300);
  }
  // keeps going: SYNDRUS stopped by hand, the plan running out on a loop, the queued jump landing
  function conduct() {
    if (!run.on) return;
    if (performance.now() - run.startedAt > 1500 && (!syAlive() || !SY.playing)) { run.on = false; toast('SYNDRUS se detuvo: show en pausa'); paint(); return; }
    const cur = curEntry(); if (!cur) return;
    if (cur.i === 'stop') { run.on = false; paint(); return; }
    const idx = run.plan.indexOf(cur);
    if (run.queued >= 0 && cur.i === run.queued && idx > 0) run.queued = -1;
    if (idx >= run.plan.length - 2 && show.end === 'loop' && !show.sections[run.plan[run.plan.length - 1].i]?.hold) {
      const last = run.plan[run.plan.length - 1];
      if (typeof last.i === 'number') { const more = buildPlan(last.i, last.start).slice(1); run.plan.push(...more); sendPlan([last, ...more], minBar()); }
    }
  }
  setInterval(conduct, 100);

  /* ── painting ── */
  const fmtBars = n => `${n} c`;
  const bankName = k => (k < 0 ? '' : bank[k] || `banco ${k + 1} (vacío)`);
  function secLines(sec) {
    const mus = [];
    if (sec.a >= 0) mus.push(`A: ${bankName(sec.a)}`);
    if (sec.b >= 0) mus.push(`B: ${bankName(sec.b)}`);
    const xf = sec.xf === 'keep' ? '' : `⇄ ${sec.xf === 'mid' ? 'A+B' : sec.xf}${sec.xfBars ? ' en ' + sec.xfBars + ' c' : ''}`;
    const vis = sec.scene === 'random' ? '🎲 aleatorio' : sec.scene >= 0 ? `escena ${sec.scene + 1}` : '';
    return { mus: mus.join(' · ') || 'sigue lo mismo', xf, vis: [vis, sec.fade ? `fundido ${String(sec.fade).replace('.', ',')} s` : (vis ? 'corte' : ''), sec.flash ? 'flash' : '', sec.black === 'on' ? 'a negro' : ''].filter(Boolean).join(' · ') || 'sigue lo mismo' };
  }
  function paintTrack() {
    const tr = $('#track'); tr.textContent = '';
    const cur = run.on ? curEntry() : null;
    show.sections.forEach((sec, i) => {
      const b = el('button', 'se-sec' + (i === sel ? ' sel' : '') + (cur && cur.i === i ? ' cur' : '') + (run.queued === i ? ' queued' : ''));
      b.style.setProperty('--col', COLORS[sec.color]);
      b.style.width = Math.max(120, Math.min(420, 60 + sec.bars * 9)) + 'px';
      b.dataset.i = i;
      const th = el('div', 'se-thumb');
      const sc = sec.scene >= 0 ? scenes[sec.scene] : null;
      if (sc && sc.thumb) th.style.backgroundImage = `url(${sc.thumb})`;
      else th.textContent = sec.scene === 'random' ? '🎲' : sec.scene >= 0 ? `escena ${sec.scene + 1}` : '·';
      const L = secLines(sec), bd = el('div', 'bd');
      const nm = el('div', 'nm'); nm.append(el('i', '', String(i + 1)), sec.name); bd.append(nm);
      const l1 = el('div', 'ln'); l1.append(el('b', '', fmtBars(sec.bars)), ' · ' + L.mus); l1.title = L.mus; bd.append(l1);
      if (L.xf) bd.append(el('div', 'ln', L.xf));
      const l3 = el('div', 'ln', L.vis); l3.title = L.vis; bd.append(l3);
      b.append(th, bd, el('div', 'prog'), el('div', 'ph'));
      if (sec.hold) b.append(el('span', 'hold', '⏸ espera'));
      if (sec.end !== 'none') { const e = el('div', 'end'); e.style.width = Math.min(100, sec.endBars / sec.bars * 100) + '%'; b.append(e, el('span', 'endl', `${END[sec.end]} ${sec.endBars}`)); }
      b.title = `${sec.name} · ${sec.bars} compases${sec.hold ? ' · se repite hasta «Siguiente»' : ''}\nClic: elegir${run.on ? ' y saltar ahí' : ''} · Doble clic: ▶ desde acá`;
      b.addEventListener('click', () => { sel = i; if (run.on && (!cur || cur.i !== i)) jump(i); paint(); });
      b.addEventListener('dblclick', () => { sel = i; play(i); });
      tr.append(b);
    });
    const total = show.sections.reduce((s, x) => s + x.bars, 0), secs = total * 4 * 60 / (SY.bpm || 120);
    $('#showLen').textContent = `${show.sections.length} secciones · ${total} compases · ~${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')} a ${Math.round(SY.bpm || 120)} BPM` + (show.sections.some(s => s.hold) ? ' (más las esperas)' : '');
  }
  const seg = (opts, val, set) => {
    const s = el('div', 'se-seg');
    opts.forEach(([v, l, t]) => { const b = el('button', String(v) === String(val) ? 'on' : '', l); if (t) b.title = t; b.addEventListener('click', () => set(v)); s.append(b); });
    return s;
  };
  const row = (label, node, title) => { const r = el('div', 'se-row'); const sp = el('span', '', label); if (title) sp.title = title; r.append(sp, node); return r; };
  function edit(fn) { fn(show.sections[sel]); save(); paint(); replan(); }
  function paintEdit() {
    const box = $('#edit'); box.textContent = '';
    const sec = show.sections[sel]; if (!sec) return;
    // general
    const g = el('div', 'se-card'); g.append(el('h4', '', `Sección ${sel + 1}`));
    const nm = el('input', 'se-in'); nm.value = sec.name; nm.maxLength = 24; nm.spellcheck = false;
    nm.addEventListener('input', () => { sec.name = nm.value.slice(0, 24) || 'Sección'; save(); paintTrack(); });
    g.append(row('Nombre', nm));
    const bars = el('div', 'se-seg');
    bars.append(seg([[4, '4'], [8, '8'], [16, '16'], [32, '32']], sec.bars, v => edit(s => { s.bars = v; })));
    const bn = el('input', 'se-in num'); bn.type = 'number'; bn.min = 1; bn.max = 256; bn.value = sec.bars; bn.title = 'Otra cantidad de compases';
    bn.addEventListener('change', () => edit(s => { s.bars = int(bn.value, 1, 256, s.bars); }));
    bars.append(bn);
    g.append(row('Compases', bars));
    g.append(row('Avance', seg([[false, '▶ sigue solo', 'Al terminar pasa a la siguiente'], [true, '⏸ espera', 'Se repite hasta que tocás «Siguiente»']], sec.hold, v => edit(s => { s.hold = v; })),
      'Seguir el plan o esperar a que vos decidas'));
    const cols = el('div', 'se-colors');
    COLORS.forEach((c, k) => { const b = el('button', k === sec.color ? 'on' : ''); b.style.background = c; b.title = 'Color'; b.addEventListener('click', () => edit(s => { s.color = k; })); cols.append(b); });
    g.append(row('Color', cols));
    const act = el('div', 'se-actions');
    const pb = el('button', 'se-mini', '▶ Ensayar desde acá'); pb.addEventListener('click', () => play(sel));
    act.append(pb); g.append(act);

    // music
    const m = el('div', 'se-card'); m.append(el('h4', '', '🎛 Música · SYNDRUS'));
    const slotSel = (val, set) => {
      const s = el('select', 'se-in'); s.append(new Option('sin cambio', '-1'));
      for (let k = 0; k < 8; k++) s.append(new Option(`${k + 1} · ${bank[k] || '(vacío)'}`, String(k)));
      s.value = String(val); s.addEventListener('change', () => edit(x => set(x, +s.value)));
      return s;
    };
    m.append(row('Deck A', slotSel(sec.a, (x, v) => { x.a = v; }), 'Patrón del banco que entra en el deck A al empezar'));
    m.append(row('Deck B', slotSel(sec.b, (x, v) => { x.b = v; }), 'Patrón del banco que entra en el deck B al empezar'));
    m.append(row('Crossfader', seg([['keep', 'igual'], ['A', 'A'], ['mid', 'A+B'], ['B', 'B']], sec.xf, v => edit(s => { s.xf = v; }))));
    if (sec.xf !== 'keep') m.append(row('…en', seg([[0, 'de golpe'], [1, '1 c'], [2, '2 c'], [4, '4 c'], [8, '8 c']], sec.xfBars, v => edit(s => { s.xfBars = v; }))));
    m.append(row('Final', seg([['none', 'nada'], ['up', '↗ subida'], ['drop', '⤓ drop'], ['down', '↘ bajada']], sec.end, v => edit(s => { s.end = v; })), 'Lo que pasa en los últimos compases: el drop corta en el último tiempo y la sección siguiente entra en el uno'));
    if (sec.end !== 'none') m.append(row('…últimos', seg([[1, '1 c'], [2, '2 c'], [4, '4 c'], [8, '8 c']], sec.endBars, v => edit(s => { s.endBars = v; }))));
    if (!bank.some(Boolean)) m.append(el('p', 'se-note warn', 'El banco de SYNDRUS está vacío: guardá patrones ahí (Mezcla → Guardar → un lugar) y aparecen acá por nombre.'));
    else if ((sec.a >= 0 && !bank[sec.a]) || (sec.b >= 0 && !bank[sec.b])) m.append(el('p', 'se-note warn', 'Ese lugar del banco está vacío: en el show no cambia nada.'));

    // visuals
    const v = el('div', 'se-card'); v.append(el('h4', '', '◈ Visuales · NODRUS'));
    const opt = el('div', 'se-sceneopts');
    [[-1, '= igual', 'Sigue lo que está al aire'], ['random', '🎲 aleatorio', 'Un patch nuevo al azar']].forEach(([val, l, t]) => {
      const b = el('button', 'se-scene alt' + (sec.scene === val ? ' on' : ''), l); b.title = t; b.addEventListener('click', () => edit(s => { s.scene = val; })); opt.append(b);
    });
    v.append(opt);
    const grid = el('div', 'se-scenes');
    for (let k = 0; k < 16; k++) {
      const sc = scenes[k], b = el('button', 'se-scene' + (sc ? '' : ' empty') + (sec.scene === k ? ' on' : ''));
      b.append(el('span', '', String(k + 1)));
      if (sc && sc.thumb) b.style.backgroundImage = `url(${sc.thumb})`;
      b.title = sc ? `Escena ${k + 1}` : `Escena ${k + 1} vacía: guardala en NODRUS (Shift+${k % 8 + 1})`;
      if (sc) b.addEventListener('click', () => edit(s => { s.scene = k; }));
      grid.append(b);
    }
    v.append(grid);
    v.append(row('Fundido', seg([[0, 'corte'], [0.5, '0,5 s'], [1, '1 s'], [2, '2 s'], [4, '4 s']], sec.fade, x => edit(s => { s.fade = x; }))));
    v.append(row('Negro', seg([['keep', 'igual'], ['off', 'sacar'], ['on', 'a negro']], sec.black, x => edit(s => { s.black = x; }))));
    const fl = el('label', 'se-chk'); const fc = el('input'); fc.type = 'checkbox'; fc.checked = sec.flash; fc.addEventListener('change', () => edit(s => { s.flash = fc.checked; }));
    fl.append(fc, '⚡ Flash en el uno');
    v.append(fl);
    if (!scenes.some(Boolean)) v.append(el('p', 'se-note warn', 'No hay escenas guardadas en NODRUS: guardalas con Shift+1…8 (o clic en un lugar vacío) y aparecen acá.'));
    box.append(g, m, v);
  }
  function paintBar() {
    $('#play').classList.toggle('on', run.on); $('#play').textContent = run.on ? '■' : '▶';
    const sy = $('#lnkSy'), no = $('#lnkNo');
    const syMute = SY.audio === 'suspended' || SY.vol <= 0.02;
    sy.className = 'se-link' + (syAlive() ? (syMute ? ' warn' : ' ok') : '');
    sy.title = syAlive() ? `SYNDRUS conectado · ${Math.round(SY.bpm)} BPM` + (SY.vol <= 0.02 ? ' · volumen master en 0' : SY.audio === 'suspended' ? ' · necesita un clic en su ventana para sonar' : '') : 'SYNDRUS no está abierto (clic: abrir). Es el reloj del show.';
    no.className = 'se-link' + (noAlive() ? ' ok' : '');
    no.title = noAlive() ? 'NODRUS conectado' : 'NODRUS no está abierto (clic: abrir)';
  }
  function paint() {
    readBank(); paintBar(); paintTrack(); paintEdit();
    $('#nextAt').value = show.next; $('#endMode').value = show.end;
    if (document.activeElement !== $('#showName')) $('#showName').value = show.name;
  }

  // every frame: playhead, position, the current section (no rebuild unless it changes)
  let lastCur = null;
  function frame() {
    paintBar();
    const pos = $('#pos');
    if (run.on) {
      const cur = curEntry(), b = barNow();
      if (cur !== lastCur) { lastCur = cur; paintTrack(); }
      if (cur && typeof cur.i === 'number') {
        const sec = show.sections[cur.i], idx = run.plan.indexOf(cur), nx = run.plan[idx + 1];
        const inSec = b - cur.start, len = nx ? nx.start - cur.start : sec.bars;
        const shown = sec.hold && !nx ? inSec % sec.bars : Math.min(inSec, len);
        const p = Math.max(0, Math.min(1, shown / (nx ? len : sec.bars)));
        const node = document.querySelector(`.se-sec[data-i="${cur.i}"]`);
        if (node) { node.querySelector('.ph').style.left = `calc(${(p * 100).toFixed(2)}% - 1px)`; node.querySelector('.prog').style.width = (p * 100).toFixed(2) + '%'; }
        const left = nx ? Math.max(0, Math.ceil(nx.start - b)) : 0;
        pos.innerHTML = '';
        pos.append(el('b', '', `${cur.i + 1} · ${sec.name}`), ` · compás ${Math.floor(inSec) + 1}/${nx ? len : sec.bars}`);
        if (nx && typeof nx.i === 'number') pos.append(el('span', run.queued >= 0 ? 'w' : '', ` → ${show.sections[nx.i].name} en ${left}`));
        else if (nx) pos.append(el('span', 'w', ` → fin en ${left}`));
        else if (sec.hold) pos.append(el('span', 'w', ' · ⏸ esperando «Siguiente»'));
        $('#next').classList.toggle('armed', !!(sec.hold && !nx));
      }
    } else {
      if (lastCur) { lastCur = null; paintTrack(); }
      $('#next').classList.remove('armed');
      pos.textContent = syAlive() ? `Listo · ${Math.round(SY.bpm)} BPM · ▶ arranca desde «${(show.sections[sel] || {}).name || ''}»` : 'Abrí SYNDRUS (🎛) para empezar';
    }
    requestAnimationFrame(frame);
  }

  /* ── controls ── */
  $('#play').addEventListener('click', () => (run.on ? stop() : play(sel)));
  $('#next').addEventListener('click', next);
  $('#nextAt').addEventListener('change', e => { show.next = e.target.value; save(); });
  $('#endMode').addEventListener('change', e => { show.end = e.target.value; save(); replan(); paintTrack(); });
  $('#showName').addEventListener('input', e => { show.name = e.target.value.slice(0, 40) || 'Mi show'; save(); });
  $('#addSec').addEventListener('click', () => { show.sections.splice(sel + 1, 0, SEC({ name: 'Sección ' + (show.sections.length + 1), color: (show.sections[sel] ? show.sections[sel].color + 1 : 0) % COLORS.length })); sel++; save(); paint(); replan(); });
  $('#dupSec').addEventListener('click', () => { const s = show.sections[sel]; if (!s) return; show.sections.splice(sel + 1, 0, { ...s, id: uid() }); sel++; save(); paint(); replan(); });
  $('#delSec').addEventListener('click', () => {
    if (show.sections.length <= 1) { toast('El show necesita al menos una sección'); return; }
    if (run.on) { toast('Pará el show para borrar secciones'); return; }
    const s = show.sections[sel]; if (!confirm(`¿Borrar «${s.name}»?`)) return;
    show.sections.splice(sel, 1); sel = Math.min(sel, show.sections.length - 1); save(); paint();
  });
  const move = d => {
    if (run.on) { toast('Pará el show para reordenar'); return; }
    const j = sel + d; if (j < 0 || j >= show.sections.length) return;
    [show.sections[sel], show.sections[j]] = [show.sections[j], show.sections[sel]]; sel = j; save(); paint();
  };
  $('#leftSec').addEventListener('click', () => move(-1));
  $('#rightSec').addEventListener('click', () => move(1));

  // file + help pops
  const pops = ['#filePop', '#helpPop'];
  const closePops = () => pops.forEach(p => { $(p).hidden = true; });
  function openPop(p, btn) {
    const was = !$(p).hidden; closePops(); if (was) return;
    const pop = $(p), r = btn.getBoundingClientRect(); pop.hidden = false;
    pop.style.top = (r.bottom + 6) + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
  }
  $('#fileBtn').addEventListener('click', e => { e.stopPropagation(); openPop('#filePop', e.currentTarget); });
  $('#helpBtn').addEventListener('click', e => { e.stopPropagation(); openPop('#helpPop', e.currentTarget); });
  document.addEventListener('click', e => { if (!e.target.closest('.se-pop')) closePops(); });
  $('#fileSave').addEventListener('click', () => {
    const a = document.createElement('a'); a.download = (show.name || 'show').replace(/[^\w\-áéíóúñ ]+/gi, '').trim().replace(/\s+/g, '_') + '.setrus.json';
    a.href = URL.createObjectURL(new Blob([JSON.stringify(show, null, 1)], { type: 'application/json' })); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000); closePops();
  });
  $('#fileOpen').addEventListener('click', () => $('#fileIn').click());
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const o = JSON.parse(await f.text()); if (run.on) stop(); show = sane(o); sel = 0; save(); paint(); toast(`Show «${show.name}» abierto`); } catch (err) { toast('Ese archivo no es un show de SETRUS', true); }
    closePops();
  });
  $('#fileNew').addEventListener('click', () => { if (!confirm('¿Reemplazar este show por el de ejemplo?')) return; if (run.on) stop(); show = example(); sel = 0; save(); paint(); closePops(); });

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); if (run.on) stop(); else play(sel); }
    else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') { e.preventDefault(); next(); }
    else if (/^[1-9]$/.test(e.key) && +e.key <= show.sections.length) { const k = +e.key - 1; sel = k; if (run.on) jump(k); else paint(); }
    else if (e.key === 'Escape') closePops();
  });

  let toastT = 0;
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'se-toast on' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'se-toast'; }, 3200); }

  readScenes(); readBank(); paint(); requestAnimationFrame(frame);
  window.__setrus = { get show() { return show; }, get run() { return run; }, play, stop, jump, next, buildPlan, get SY() { return SY; }, setSel: i => { sel = i; paint(); } };
})();
