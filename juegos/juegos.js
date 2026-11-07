/* PUDRUS · Juegos — quick games for logic, memory, attention and creativity (all original designs).
   One page: a hub of cards, and #<game> opens a game; #<game>/hoy plays the daily challenge (same seed for everyone). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const pad2 = n => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const mmss = s => `${Math.floor(s / 60)}:${pad2(Math.floor(s % 60))}`;
  const C = { g: '#66ff33', c: '#00d4ff', m: '#ff3fa4', y: '#ffd23f', r: '#ff3355', b: '#3d7bff', dim: '#1d3a28' };

  /* ── seeded random (the daily challenge is the same for everyone) ── */
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ── what this browser remembers ── */
  const KEY = 'pudrus_juegos_v1';
  const store = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } })();
  store.best = store.best || {}; store.days = store.days || []; store.daily = store.daily || {}; store.count = store.count || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } };
  function markPlayed() {
    const t = dayKey();
    if (!store.days.includes(t)) { store.days.push(t); store.days = store.days.slice(-400); }
    save();
  }
  function streak() {
    const set = new Set(store.days); let n = 0; const d = new Date();
    if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);   // today not played yet: count up to yesterday
    while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ── sound (tiny synth, no files) ── */
  let ac = null;
  function tone(freq, dur = 0.16, type = 'sine', vol = 0.12) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* no audio */ }
  }
  const okSound = () => { tone(660, 0.09, 'triangle'); setTimeout(() => tone(990, 0.12, 'triangle'), 70); };
  const badSound = () => tone(140, 0.25, 'sawtooth', 0.08);

  /* ── icons for the cards (inline SVG, drawn in the site's neon) ── */
  const ART = {
    circuito: `<svg viewBox="0 0 120 64"><g stroke="${C.g}" stroke-width="7" fill="none" stroke-linecap="round"><path d="M8 32h32v-20h32M72 12v40h40"/><path d="M40 32v20" stroke="${C.dim}"/></g><circle cx="8" cy="32" r="7" fill="${C.g}"/><rect x="104" y="44" width="14" height="14" fill="${C.g}"/></svg>`,
    quesigue: `<svg viewBox="0 0 150 64"><g fill="none" stroke-width="3"><polygon points="20,12 34,48 6,48" stroke="${C.g}"/><rect x="46" y="16" width="30" height="30" stroke="${C.c}" transform="rotate(20 61 31)"/><polygon points="102,10 120,24 113,46 91,46 84,24" stroke="${C.m}"/></g><text x="132" y="44" fill="${C.g}" font-size="34" font-family="monospace">?</text></svg>`,
    eco: `<svg viewBox="0 0 64 64"><rect x="4" y="4" width="26" height="26" rx="6" fill="${C.g}"/><rect x="34" y="4" width="26" height="26" rx="6" fill="none" stroke="${C.c}" stroke-width="3"/><rect x="4" y="34" width="26" height="26" rx="6" fill="none" stroke="${C.m}" stroke-width="3"/><rect x="34" y="34" width="26" height="26" rx="6" fill="none" stroke="${C.y}" stroke-width="3"/></svg>`,
    interferencia: `<svg viewBox="0 0 150 64"><text x="4" y="44" font-family="monospace" font-weight="700" font-size="34" fill="${C.c}">ROJO</text><rect x="100" y="16" width="44" height="30" rx="5" fill="${C.c}"/></svg>`,
    garabato: `<svg viewBox="0 0 120 64"><path d="M8 50 C 20 0, 40 70, 56 26 S 90 6, 112 40" fill="none" stroke="${C.g}" stroke-width="4" stroke-linecap="round"/><path d="M60 30 q 8 -14 18 0 q -9 12 -18 0" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="70" cy="28" r="2.5" fill="#fff"/></svg>`,
    milusos: `<svg viewBox="0 0 120 64"><rect x="6" y="18" width="40" height="28" rx="3" fill="none" stroke="${C.g}" stroke-width="3"/><g fill="${C.g}"><circle cx="66" cy="20" r="3"/><circle cx="66" cy="32" r="3"/><circle cx="66" cy="44" r="3"/></g><g stroke="${C.c}" stroke-width="3" stroke-linecap="round"><path d="M76 20h36M76 32h28M76 44h32"/></g></svg>`,
  };

  /* ═══════════════════ the games ═══════════════════
     start(ctx) builds the game inside ctx.stage and returns a cleanup function.
     ctx: { stage, hud(html), rnd(), daily, done({ score, text, detail, better: 'high'|'low'|null, share, extra }) } */
  const GAMES = [];

  /* ── CIRCUITO: rotate the tiles until the current reaches every one ── */
  GAMES.push({ id: 'circuito', title: 'Circuito', tag: 'Lógica', desc: 'Girá las piezas hasta que la corriente verde llegue a todas, sin cables sueltos.',
    how: 'Tocá una pieza para girarla. La corriente sale del círculo del centro: el circuito está completo cuando todo se ilumina y no queda ninguna punta suelta. Tres tableros cada vez más grandes; cuenta el tiempo total. Teclado: flechas para moverte, Espacio para girar.',
    better: 'low', fmt: s => mmss(s),
    start(ctx) {
      const SIZES = [4, 5, 6];
      let orig = null, level = 0, n, cells, src, moves = 0, total = 0, t0 = performance.now(), cursor = -1, anim = new Map(), raf = 0, done = false;
      const cv = el('canvas', 'jg-canvas'), g = cv.getContext('2d');
      const msg = el('p', 'jg-msg');
      ctx.stage.append(cv, msg);
      const DIRS = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];   // dx, dy, bit, opposite
      const rot = m => ((m << 1) | (m >> 3)) & 15;
      function make() {
        n = SIZES[level]; cells = new Array(n * n).fill(0); src = Math.floor(n / 2) * n + Math.floor(n / 2);
        const seen = new Set([src]), active = [src];
        while (active.length) {   // growing tree: a random spanning tree, so every tile belongs to the circuit
          const i = Math.floor(ctx.rnd() * active.length), cur = active[i], x = cur % n, y = (cur / n) | 0;
          const free = DIRS.filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen.has(ny * n + nx); });
          if (!free.length) { active.splice(i, 1); continue; }
          const [dx, dy, bit, opp] = free[Math.floor(ctx.rnd() * free.length)], nxt = (y + dy) * n + (x + dx);
          cells[cur] |= bit; cells[nxt] |= opp; seen.add(nxt); active.push(nxt);
        }
        orig = cells.slice();
        do { cells = orig.map(m => { let k = Math.floor(ctx.rnd() * 4); while (k--) m = rot(m); return m; }); } while (solved());
        moves = 0; size(); draw();
        msg.textContent = `Tablero ${level + 1} de ${SIZES.length} · ${n}×${n}`;
      }
      function powered() {
        const on = new Set([src]), q = [src];
        while (q.length) {
          const c = q.shift(), x = c % n, y = (c / n) | 0;
          for (const [dx, dy, bit, opp] of DIRS) {
            const nx = x + dx, ny = y + dy, j = ny * n + nx;
            if (nx < 0 || ny < 0 || nx >= n || ny >= n || on.has(j)) continue;
            if ((cells[c] & bit) && (cells[j] & opp)) { on.add(j); q.push(j); }
          }
        }
        return on;
      }
      function loose() {   // ends pointing at the border or at a tile that doesn't answer
        let k = 0;
        cells.forEach((m, c) => { const x = c % n, y = (c / n) | 0; for (const [dx, dy, bit, opp] of DIRS) { if (!(m & bit)) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n || !(cells[ny * n + nx] & opp)) k++; } });
        return k;
      }
      const solved = () => powered().size === n * n && loose() === 0;
      let S = 0;
      function size() { const w = Math.min(ctx.stage.clientWidth || 480, 520); S = Math.floor(w / n); const dpr = Math.min(2, devicePixelRatio || 1); cv.width = S * n * dpr; cv.height = S * n * dpr; cv.style.width = cv.style.height = S * n + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
      function draw() {
        const on = powered(), now = performance.now();
        g.fillStyle = '#07070d'; g.fillRect(0, 0, S * n, S * n);
        let busy = false;
        cells.forEach((m, c) => {
          const x = (c % n) * S, y = ((c / n) | 0) * S, lit = on.has(c);
          g.fillStyle = c === cursor ? '#14241a' : '#0b0b14'; g.fillRect(x + 1, y + 1, S - 2, S - 2);
          let a = 0; const an = anim.get(c);
          if (an) { const k = Math.min(1, (now - an) / 130); a = (1 - k) * -Math.PI / 2; if (k < 1) busy = true; else anim.delete(c); }
          g.save(); g.translate(x + S / 2, y + S / 2); g.rotate(a);
          g.strokeStyle = lit ? C.g : C.dim; g.lineWidth = S * 0.2; g.lineCap = 'round';
          if (lit) { g.shadowColor = C.g; g.shadowBlur = 12; }
          g.beginPath();
          [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]].forEach(([dx, dy, bit]) => { if (m & bit) { g.moveTo(0, 0); g.lineTo(dx * S / 2, dy * S / 2); } });
          g.stroke();
          const ends = [1, 2, 4, 8].filter(b => m & b).length;
          if (c === src) { g.fillStyle = C.g; g.beginPath(); g.arc(0, 0, S * 0.2, 0, 7); g.fill(); }
          else if (ends === 1) { g.fillStyle = lit ? C.g : '#24402e'; g.fillRect(-S * 0.15, -S * 0.15, S * 0.3, S * 0.3); }
          g.restore();
        });
        if (busy) raf = requestAnimationFrame(draw);
      }
      function turn(c) {
        if (done || c < 0) return;
        cells[c] = rot(cells[c]); moves++; anim.set(c, performance.now()); tone(320 + (c % 7) * 40, 0.05, 'square', 0.04);
        cancelAnimationFrame(raf); draw();
        checkWin();
      }
      function checkWin() {
        if (!solved()) return;
        okSound(); level++;
        if (level >= SIZES.length) { done = true; total = Math.round((performance.now() - t0) / 1000); setTimeout(() => ctx.done({ score: total, text: `Tres circuitos en ${mmss(total)}`, better: 'low' }), 500); }
        else { done = true; setTimeout(() => { done = false; make(); }, 450); }
      }
      ctx.test.solve = () => { if (done) return; cells = orig.slice(); draw(); checkWin(); };
      cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / S), y = Math.floor((e.clientY - r.top) / S); if (x >= 0 && y >= 0 && x < n && y < n) { cursor = -1; turn(y * n + x); } });
      const key = e => {
        if (done) return;
        const k = e.key;
        if (k.startsWith('Arrow')) { e.preventDefault(); if (cursor < 0) cursor = src; const x = cursor % n, y = (cursor / n) | 0; const nx = Math.max(0, Math.min(n - 1, x + (k === 'ArrowRight') - (k === 'ArrowLeft'))), ny = Math.max(0, Math.min(n - 1, y + (k === 'ArrowDown') - (k === 'ArrowUp'))); cursor = ny * n + nx; draw(); }
        else if ((k === ' ' || k === 'Enter') && cursor >= 0) { e.preventDefault(); turn(cursor); }
      };
      addEventListener('keydown', key);
      const tick = setInterval(() => ctx.hud(`Tiempo<b>${mmss((performance.now() - t0) / 1000)}</b> Movidas<b>${moves}</b>`), 250);
      const rs = () => { size(); draw(); }; addEventListener('resize', rs);
      make();
      return () => { clearInterval(tick); cancelAnimationFrame(raf); removeEventListener('keydown', key); removeEventListener('resize', rs); };
    } });

  /* ── QUÉ SIGUE: find the hidden rule of the series ── */
  GAMES.push({ id: 'quesigue', title: 'Qué sigue', tag: 'Lógica', desc: 'Una serie de figuras con una regla oculta. Elegí la que sigue antes de que se acabe el tiempo.',
    how: 'Mirá cómo cambian las figuras de una a otra (lados, giro, puntos, relleno, color…) y elegí la quinta. Diez rondas: las primeras cambian una sola cosa, las últimas hasta tres a la vez. Responder rápido suma más. Teclado: 1 a 4.',
    better: 'high', fmt: s => String(s),
    start(ctx) {
      const COLS = [C.g, C.c, C.m, C.y];
      const PROPS = {
        sides: { lo: 3, hi: 8, steps: [1, -1] }, rot: { steps: [45, -45, 30, -30] }, dots: { lo: 0, hi: 6, steps: [1, -1] },
        fill: { mod: 3, steps: [1] }, color: { mod: 4, steps: [1, -1] },
      };
      let round = 0, score = 0, timer = 0, left = 0, locked = false;
      const ROUNDS = 10, TIME = 20;
      const row = el('div', 'qs-row'), opts = el('div', 'qs-row qs-opts'), bar = el('div', 'qs-bar'), fillBar = el('i'), msg = el('p', 'jg-msg');
      bar.append(fillBar); ctx.stage.append(row, bar, opts, msg);
      const R = (a, b) => a + Math.floor(ctx.rnd() * (b - a + 1));
      const pick = a => a[Math.floor(ctx.rnd() * a.length)];
      function shapeSVG(t) {
        const s = 70, cx = 35, cy = 31, r = 21, col = COLS[t.color];
        const pts = Array.from({ length: t.sides }, (_, i) => { const a = (t.rot - 90) * Math.PI / 180 + i * 2 * Math.PI / t.sides; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
        const id = 'h' + Math.random().toString(36).slice(2, 8);
        const fill = t.fill === 2 ? col : t.fill === 1 ? `url(#${id})` : 'none';
        const dots = Array.from({ length: t.dots }, (_, i) => `<circle cx="${(cx - (t.dots - 1) * 4.5 + i * 9).toFixed(1)}" cy="62" r="3" fill="${col}"/>`).join('');
        return `<svg width="${s}" height="${s}" viewBox="0 0 70 70"><defs><pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="${col}"/></pattern></defs><polygon points="${pts}" fill="${fill}" stroke="${col}" stroke-width="3" stroke-linejoin="round"/>${dots}</svg>`;
      }
      // what you SEE: a square turned 90° looks the same, so rotation counts modulo the figure's symmetry
      const keyOf = t => { const sym = 360 / t.sides; return [t.sides, Math.round((((t.rot % sym) + sym) % sym) * 10), t.dots, t.fill, t.color].join('|'); };
      function series() {
        const nChange = round < 4 ? 1 : round < 8 ? 2 : 3;
        const names = Object.keys(PROPS).sort(() => ctx.rnd() - 0.5).slice(0, nChange);
        const step = {}; names.forEach(k => { step[k] = pick(PROPS[k].steps); });
        const base = { sides: R(3, 8), rot: pick([0, 15, 30, 45]), dots: R(0, 4), fill: R(0, 2), color: R(0, 3) };
        // keep 5 terms inside the ranges
        if (step.sides) base.sides = step.sides > 0 ? R(3, 4) : R(7, 8);
        if (step.dots) base.dots = step.dots > 0 ? R(0, 2) : R(4, 6);
        // a turn must be visible on that figure (45° on an octagon looks like nothing)
        if (step.rot && !step.sides) { let g = 0; while ((Math.abs(step.rot) % (360 / base.sides)) < 1e-6 && g++ < 20) step.rot = pick([30, -30, 45, -45, 20]); }
        const term = i => { const t = { ...base }; for (const k of names) { const p = PROPS[k]; t[k] = p.mod ? ((base[k] + step[k] * i) % p.mod + p.mod) % p.mod : base[k] + step[k] * i; } return t; };
        const seq = [0, 1, 2, 3].map(term), ans = term(4);
        // wrong options: the answer with one property off
        const opts = [ans], seen = new Set([keyOf(ans)]);
        let guard = 0;
        while (opts.length < 4 && guard++ < 200) {
          const k = pick(guard < 60 ? names : Object.keys(PROPS)), t = { ...ans }, p = PROPS[k];
          const d = pick(p.steps.concat([-p.steps[0]]));
          t[k] = p.mod ? ((t[k] + d) % p.mod + p.mod) % p.mod : t[k] + d;
          if (k === 'sides' && (t.sides < 3 || t.sides > 9)) continue;
          if (k === 'dots' && (t.dots < 0 || t.dots > 7)) continue;
          if (!seen.has(keyOf(t))) { seen.add(keyOf(t)); opts.push(t); }
        }
        return { seq, ans, opts: opts.sort(() => ctx.rnd() - 0.5) };
      }
      function next() {
        if (round >= ROUNDS) { clearInterval(timer); ctx.done({ score, text: `${score} puntos en ${ROUNDS} rondas`, better: 'high' }); return; }
        const q = series(); locked = false;
        row.innerHTML = ''; opts.innerHTML = '';
        q.seq.forEach(t => { const c = el('div', 'qs-cell'); c.innerHTML = shapeSVG(t); row.append(c); });
        row.append(el('div', 'qs-cell q', '?'));
        q.opts.forEach((t, i) => {
          const c = el('button', 'qs-cell'); c.innerHTML = shapeSVG(t); c.title = `Opción ${i + 1}`;
          c.addEventListener('click', () => answer(c, t === q.ans, q));
          opts.append(c);
        });
        ctx.test.answer = q.opts.indexOf(q.ans);
        left = TIME; msg.textContent = `Ronda ${round + 1} de ${ROUNDS}`;
        clearInterval(timer);
        timer = setInterval(() => { left -= 0.1; fillBar.style.width = Math.max(0, left / TIME * 100) + '%'; if (left <= 0) answer(null, false, q); }, 100);
        ctx.hud(`Puntos<b>${score}</b>`);
      }
      function answer(btn, ok, q) {
        if (locked) return; locked = true; clearInterval(timer);
        const gain = ok ? 100 + Math.round(Math.max(0, left) / TIME * 100) : 0;
        score += gain;
        [...opts.children].forEach((c, i) => { if (q.opts[i] === q.ans) c.classList.add('right'); else if (c === btn) c.classList.add('wrong'); });
        if (ok) okSound(); else badSound();
        msg.textContent = ok ? `¡Bien! +${gain}` : (btn ? 'No era esa' : 'Se acabó el tiempo');
        ctx.hud(`Puntos<b>${score}</b>`);
        round++; setTimeout(next, ok ? 650 : 1200);
      }
      const key = e => { const i = +e.key - 1; if (i >= 0 && i < 4 && opts.children[i]) opts.children[i].click(); };
      addEventListener('keydown', key);
      next();
      return () => { clearInterval(timer); removeEventListener('keydown', key); };
    } });

  /* ── ECO: repeat the sequence of lights and sounds ── */
  GAMES.push({ id: 'eco', title: 'Eco', tag: 'Memoria', desc: 'Una secuencia de luces y sonidos que crece una nota por vez. ¿Hasta dónde llegás?',
    how: 'Mirá y escuchá la secuencia, después repetila tocando los cuadros en el mismo orden. Cada ronda suma una nota y va un poco más rápido. Un error termina la partida. Teclado: 1, 2, 3, 4.',
    better: 'high', fmt: s => String(s),
    start(ctx) {
      const PADS = [[C.g, 262], [C.c, 330], [C.m, 392], [C.y, 523]];
      const wrap = el('div', 'eco-pads locked'), msg = el('p', 'jg-msg', 'Mirá…');
      const pads = PADS.map(([col, f], i) => { const b = el('button', 'eco-pad', String(i + 1)); b.style.setProperty('--pc', col); wrap.append(b); return b; });
      ctx.stage.append(wrap, msg);
      const seq = [], timers = [];
      ctx.test.seq = seq; ctx.test.press = i => press(i); ctx.test.listening = () => listening;
      let pos = 0, listening = false, over = false;
      const later = (f, ms) => timers.push(setTimeout(f, ms));
      function light(i, ms) { pads[i].classList.add('lit'); tone(PADS[i][1], ms / 1000 + 0.05, 'triangle', 0.14); later(() => pads[i].classList.remove('lit'), ms); }
      function play() {
        listening = false; wrap.classList.add('locked'); msg.textContent = 'Mirá…';
        seq.push(Math.floor(ctx.rnd() * 4));
        const gap = Math.max(260, 560 - seq.length * 18);
        seq.forEach((p, k) => later(() => light(p, gap * 0.7), 500 + k * gap));
        later(() => { listening = true; pos = 0; wrap.classList.remove('locked'); msg.textContent = 'Tu turno'; }, 500 + seq.length * gap);
        ctx.hud(`Nivel<b>${seq.length}</b>`);
      }
      function press(i) {
        if (!listening || over) return;
        light(i, 220);
        if (i !== seq[pos]) {
          over = true; listening = false; badSound(); wrap.classList.add('flash-bad');
          const score = seq.length - 1;
          msg.textContent = 'Uy, era otro';
          later(() => ctx.done({ score, text: score ? `Repetiste ${score} nota${score > 1 ? 's' : ''} seguidas` : 'Ni una: ¡a practicar!', better: 'high' }), 900);
          return;
        }
        pos++;
        if (pos === seq.length) { listening = false; msg.textContent = '¡Bien!'; later(play, 700); }
      }
      pads.forEach((b, i) => b.addEventListener('pointerdown', e => { e.preventDefault(); press(i); }));
      const key = e => { const i = +e.key - 1; if (i >= 0 && i < 4) press(i); };
      addEventListener('keydown', key);
      later(play, 300);
      return () => { timers.forEach(clearTimeout); removeEventListener('keydown', key); };
    } });

  /* ── INTERFERENCIA: answer the ink, not the word (and sometimes the other way round) ── */
  GAMES.push({ id: 'interferencia', title: 'Interferencia', tag: 'Atención', desc: 'La palabra dice un color y está pintada de otro. Respondé rápido lo que pide la consigna.',
    how: 'Con la consigna TINTA, tocá el color con el que está pintada la palabra. Con PALABRA, el color que la palabra dice. La consigna cambia sin aviso. 40 segundos: cada acierto suma, cada error resta. Teclado: 1 a 4.',
    better: 'high', fmt: s => String(s),
    start(ctx) {
      const COLS = [['ROJO', C.r], ['VERDE', C.g], ['AZUL', C.b], ['AMARILLO', C.y]];
      const rule = el('div', 'st-rule ink', 'TINTA'), word = el('div', 'st-word'), opts = el('div', 'st-opts'), msg = el('p', 'jg-msg');
      COLS.forEach(([name, col], i) => { const b = el('button', 'st-opt', `${i + 1}`); b.style.background = col; b.title = name.toLowerCase(); b.addEventListener('click', () => answer(i)); opts.append(b); });
      ctx.stage.append(rule, word, opts, msg);
      let ok = 0, bad = 0, cur = null, mode = 'ink', sinceSwitch = 0, t0 = 0, rts = [], left = 40, over = false;
      function next() {
        sinceSwitch++;
        if (sinceSwitch > 4 && ctx.rnd() < 0.3) { mode = mode === 'ink' ? 'word' : 'ink'; sinceSwitch = 0; rule.textContent = mode === 'ink' ? 'TINTA' : 'PALABRA'; rule.className = 'st-rule ' + mode; }
        const w = Math.floor(ctx.rnd() * 4); let ink = Math.floor(ctx.rnd() * 4);
        if (ctx.rnd() < 0.75) while (ink === w) ink = Math.floor(ctx.rnd() * 4);
        cur = { w, ink }; ctx.test.right = () => (mode === 'ink' ? cur.ink : cur.w); word.textContent = COLS[w][0]; word.style.color = COLS[ink][1]; t0 = performance.now();
      }
      function answer(i) {
        if (over || !cur) return;
        const right = mode === 'ink' ? cur.ink : cur.w;
        if (i === right) { ok++; rts.push(performance.now() - t0); tone(700, 0.05, 'triangle', 0.06); }
        else { bad++; badSound(); word.classList.remove('flash-bad'); void word.offsetWidth; word.classList.add('flash-bad'); }
        ctx.hud(`Tiempo<b>${Math.ceil(left)}</b> Aciertos<b>${ok}</b> Errores<b>${bad}</b>`);
        next();
      }
      const key = e => { const i = +e.key - 1; if (i >= 0 && i < 4) answer(i); };
      addEventListener('keydown', key);
      next();
      const tick = setInterval(() => {
        left -= 0.1;
        ctx.hud(`Tiempo<b>${Math.ceil(Math.max(0, left))}</b> Aciertos<b>${ok}</b> Errores<b>${bad}</b>`);
        if (left <= 0 && !over) {
          over = true; clearInterval(tick);
          const score = Math.max(0, ok - bad), avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
          ctx.done({ score, text: `${ok} aciertos · ${bad} errores`, detail: avg ? `Tiempo de reacción promedio: ${avg} ms` : '', better: 'high' });
        }
      }, 100);
      return () => { clearInterval(tick); removeEventListener('keydown', key); };
    } });

  /* ── GARABATO: turn a random scribble into a drawing ── */
  const PROMPTS = ['un animal', 'una cara', 'un objeto de la cocina', 'algo que vuela', 'un personaje', 'un lugar', 'algo del mar', 'una máquina', 'una planta', 'algo que da miedo', 'un instrumento', 'un vehículo', 'algo de otro planeta', 'lo primero que veas'];
  GAMES.push({ id: 'garabato', title: 'Garabato', tag: 'Creatividad', desc: 'Te doy un trazo al azar. En 90 segundos convertilo en un dibujo y guardalo.',
    how: 'El trazo verde es el punto de partida: dibujá encima para transformarlo en otra cosa (si querés, seguí la pista). No hay respuesta correcta: lo que vale es animarse. Al terminar podés guardar la imagen.',
    better: null, fmt: s => `${s} dibujo${s === 1 ? '' : 's'}`,
    start(ctx) {
      const W = 1200, H = 800;
      const prompt = el('p', 'gb-prompt'), wrap = el('div', 'gb-wrap'), cv = el('canvas', 'jg-canvas'), g = cv.getContext('2d');
      cv.width = W; cv.height = H; wrap.append(cv);
      const tools = el('div', 'gb-tools');
      const COLS = ['#ffffff', C.c, C.m, C.y, C.g];
      let col = COLS[0], width = 6, strokes = [], cur = null, left = 90, over = false;
      COLS.forEach(c => { const b = el('button', 'gb-col' + (c === col ? ' on' : '')); b.style.background = c; b.title = 'Color'; b.addEventListener('click', () => { col = c; tools.querySelectorAll('.gb-col').forEach(x => x.classList.toggle('on', x === b)); }); tools.append(b); });
      [['fino', 3], ['medio', 6], ['grueso', 14]].forEach(([t, w]) => { const b = el('button', 'jg-btn' + (w === width ? ' on' : ''), t); b.addEventListener('click', () => { width = w; tools.querySelectorAll('.jg-btn[data-w]').forEach(x => x.classList.toggle('on', x === b)); }); b.dataset.w = w; tools.append(b); });
      const undo = el('button', 'jg-btn', '↶ Deshacer'); undo.addEventListener('click', () => { strokes.pop(); draw(); });
      const finish = el('button', 'jg-btn primary', 'Listo');
      tools.append(undo, finish);
      ctx.stage.append(prompt, wrap, tools);
      prompt.innerHTML = `Pista (opcional): convertilo en <b>${PROMPTS[Math.floor(ctx.rnd() * PROMPTS.length)]}</b>`;
      // the scribble: a smooth random curve, sometimes closed
      const pts = [], k = 4 + Math.floor(ctx.rnd() * 4), closed = ctx.rnd() < 0.4;
      for (let i = 0; i < k; i++) pts.push([W * (0.2 + ctx.rnd() * 0.6), H * (0.2 + ctx.rnd() * 0.6)]);
      function scribble() {
        g.save(); g.strokeStyle = C.g; g.lineWidth = 9; g.lineCap = g.lineJoin = 'round'; g.shadowColor = C.g; g.shadowBlur = 16;
        g.beginPath(); const P = closed ? pts.concat([pts[0], pts[1]]) : pts;
        g.moveTo((P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2);
        for (let i = 1; i < P.length - 1; i++) g.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
        g.stroke(); g.restore();
      }
      function draw() {
        g.fillStyle = '#07070d'; g.fillRect(0, 0, W, H); scribble();
        for (const s of strokes) {
          g.strokeStyle = s.col; g.lineWidth = s.w; g.lineCap = g.lineJoin = 'round'; g.beginPath();
          s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]); g.stroke();
        }
      }
      const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
      cv.addEventListener('pointerdown', e => { if (over) return; cv.setPointerCapture(e.pointerId); cur = { col, w: width * (W / Math.max(300, cv.clientWidth)), pts: [pos(e)] }; strokes.push(cur); draw(); });
      cv.addEventListener('pointermove', e => { if (!cur) return; cur.pts.push(pos(e)); draw(); });
      const up = () => { cur = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      function end() {
        if (over) return; over = true; clearInterval(tick);
        g.fillStyle = 'rgba(102,255,51,0.85)'; g.font = '600 22px "IBM Plex Mono", monospace'; g.textAlign = 'right';
        g.fillText(`PUDRUS · garabato · ${dayKey()}`, W - 20, H - 20);
        const url = cv.toDataURL('image/png');
        store.count.garabato = (store.count.garabato || 0) + 1; save();
        const box = el('div', 'gb-result'); const img = el('img'); img.src = url; img.alt = 'Tu garabato';
        const dl = el('a', 'btn btn-primary', 'Guardar imagen'); dl.href = url; dl.download = `pudrus_garabato_${Date.now()}.png`;
        box.append(img);
        ctx.done({ score: store.count.garabato, text: strokes.length ? '¡Listo! Ya es otra cosa.' : 'Lo dejaste como estaba: también vale.', detail: `Llevás ${store.count.garabato} garabato${store.count.garabato > 1 ? 's' : ''}`, better: null, extra: [box, dl] });
      }
      finish.addEventListener('click', end);
      draw();
      const tick = setInterval(() => { left -= 1; ctx.hud(`Tiempo<b>${Math.max(0, left)}</b>`); if (left <= 0) end(); }, 1000);
      ctx.hud(`Tiempo<b>${left}</b>`);
      return () => clearInterval(tick);
    } });

  /* ── MIL USOS: as many different uses for an everyday object as you can ── */
  const OBJECTS = ['un ladrillo', 'un clip', 'una cuchara', 'una media', 'una botella vacía', 'un paraguas', 'un cubito de hielo', 'una rueda', 'un globo', 'un lápiz', 'una caja de cartón', 'un cordón', 'un peine', 'una tapita', 'un diario viejo', 'una escalera', 'una almohada', 'un balde', 'una linterna', 'un imán', 'una sartén', 'un espejo', 'una vela', 'un frasco', 'un CD', 'un tenedor', 'una bolsa de papel', 'un broche', 'una toalla', 'una cinta adhesiva', 'un botón', 'una maceta', 'una regla', 'un sombrero', 'una piedra', 'una hoja de árbol', 'una taza', 'un dado', 'una llave', 'un cubo de goma espuma'];
  GAMES.push({ id: 'milusos', title: 'Mil usos', tag: 'Creatividad', desc: 'Un objeto común y 90 segundos: escribí todos los usos distintos que se te ocurran.',
    how: 'Escribí un uso y apretá Enter; seguí con el próximo. Valen los raros, los absurdos y los geniales. Suma cada idea, y suma más si empiezan distinto (variedad). Sin juez: confiamos en vos.',
    better: 'high', fmt: s => String(s),
    start(ctx) {
      const obj = OBJECTS[Math.floor(ctx.rnd() * OBJECTS.length)];
      const title = el('div', 'mu-obj'); title.innerHTML = `¿Para qué sirve <span>${obj}</span>?`;
      const form = el('form', 'mu-form'), inp = el('input'), add = el('button', 'jg-btn primary', 'Sumar');
      inp.placeholder = 'Escribí un uso y Enter'; inp.maxLength = 80; inp.autocomplete = 'off';
      form.append(inp, add);
      const list = el('div', 'mu-list'), msg = el('p', 'jg-msg', 'Arrancá cuando quieras: el tiempo corre desde la primera idea');
      const finish = el('button', 'jg-btn', 'Terminar');
      ctx.stage.append(title, form, list, msg, finish);
      const ideas = []; let left = 90, started = false, over = false, tick = 0;
      const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, '').trim();
      const first = s => (norm(s).split(/\s+/).find(w => w.length > 2 && !['para', 'como', 'una', 'uno', 'los', 'las', 'con', 'que', 'del'].includes(w)) || norm(s));
      const scoreNow = () => { const flex = new Set(ideas.map(first)).size; return { n: ideas.length, flex, score: ideas.length * 10 + flex * 5 }; };
      form.addEventListener('submit', e => {
        e.preventDefault(); if (over) return;
        const v = inp.value.trim(); inp.value = '';
        if (v.length < 3) { msg.textContent = 'Un poquito más largo'; return; }
        if (ideas.some(x => norm(x) === norm(v))) { msg.textContent = 'Esa ya está'; return; }
        if (!started) { started = true; tick = setInterval(step, 1000); }
        ideas.push(v); tone(500 + ideas.length * 25, 0.07, 'triangle', 0.06);
        list.querySelectorAll('.new').forEach(x => x.classList.remove('new'));
        list.prepend(el('span', 'new', v));
        const s = scoreNow(); msg.textContent = `${s.n} idea${s.n > 1 ? 's' : ''} · variedad ${s.flex}`;
        ctx.hud(`Tiempo<b>${left}</b> Ideas<b>${s.n}</b>`);
      });
      function step() { left--; ctx.hud(`Tiempo<b>${Math.max(0, left)}</b> Ideas<b>${ideas.length}</b>`); if (left <= 0) end(); }
      function end() {
        if (over) return; over = true; clearInterval(tick);
        const s = scoreNow();
        const box = el('div', 'mu-list'); ideas.forEach(v => box.append(el('span', '', v)));
        ctx.done({ score: s.score, text: `${s.n} usos para ${obj}`, detail: `Variedad: ${s.flex} ideas que arrancan distinto`, better: 'high', extra: [box], share: ideas.length ? `Usos para ${obj}:\n- ${ideas.join('\n- ')}` : '' });
      }
      finish.addEventListener('click', end);
      ctx.hud(`Tiempo<b>${left}</b> Ideas<b>0</b>`);
      setTimeout(() => inp.focus(), 50);
      return () => clearInterval(tick);
    } });

  /* ═══════════════════ the page ═══════════════════ */
  const hub = $('#hub'), play = $('#play'), stage = $('#stage'), hud = $('#hud'), how = $('#how'), result = $('#result');
  const byId = id => GAMES.find(g => g.id === id);
  const dailyGame = () => GAMES[hashStr(dayKey()) % GAMES.length];
  function paintHub() {
    const n = streak();
    $('#streak').innerHTML = n ? `<b>${n}</b> día${n > 1 ? 's' : ''} seguido${n > 1 ? 's' : ''}` : 'Jugá hoy para empezar una racha';
    const dg = dailyGame(), dd = store.daily[dayKey()];
    const d = $('#daily'); d.classList.toggle('done', !!dd);
    d.innerHTML = `<span class="ic">◈</span><span class="tx"><small>Desafío del día · ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long' })}</small><b>${dg.title}</b> — el mismo para todos hoy${dd ? ` · tu resultado: ${dg.fmt(dd)}` : ''}</span><span class="go">${dd ? 'Otra vez →' : 'Jugar →'}</span>`;
    const grid = $('#grid'); grid.innerHTML = '';
    GAMES.forEach(gm => {
      const c = el('button', 'jg-card'); c.dataset.id = gm.id;
      const best = gm.better ? store.best[gm.id] : store.count[gm.id];
      c.innerHTML = `<div class="art">${ART[gm.id] || ''}</div><div class="tag">${gm.tag}</div><h3>${gm.title}</h3><p>${gm.desc}</p><div class="best${best === undefined ? ' none' : ''}">${best === undefined ? 'Sin jugar todavía' : (gm.better ? 'Récord: ' : '') + gm.fmt(best)}</div>`;
      c.addEventListener('click', () => { location.hash = gm.id; });
      grid.append(c);
    });
  }
  $('#daily').addEventListener('click', () => { location.hash = dailyGame().id + '/hoy'; });

  let cleanup = null, current = null, isDaily = false, testHook = {};
  function open(id, daily) {
    const gm = byId(id); if (!gm) { showHub(); return; }
    close(); current = gm; isDaily = !!daily;
    hub.hidden = true; play.hidden = false; result.hidden = true;
    $('#gTitle').textContent = gm.title + (isDaily ? ' · desafío del día' : '');
    $('#gTag').textContent = gm.tag;
    how.textContent = gm.how; how.hidden = false;
    hud.innerHTML = ''; stage.innerHTML = '';
    document.title = `${gm.title} — Juegos — PUDRUS.XYZ`;
    window.scrollTo(0, 0);
    // a start screen first: read the rules, then play
    const st = el('div', 'jg-start');
    st.append(el('div', 'big', '◈'), el('button', 'jg-btn primary', 'Empezar'));
    st.lastChild.addEventListener('click', go);
    stage.append(st); st.lastChild.focus();
    function go() {
      stage.innerHTML = '';
      const rnd = isDaily ? mulberry(hashStr(dayKey() + ':' + gm.id)) : Math.random;
      testHook = {};
      cleanup = gm.start({ test: testHook, stage, rnd, daily: isDaily, hud: h => { hud.innerHTML = h; }, done: r => finish(gm, r) });
    }
  }
  function close() { if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; } }
  function showHub() { close(); current = null; play.hidden = true; result.hidden = true; hub.hidden = false; document.title = 'Juegos — PUDRUS.XYZ'; paintHub(); }
  function finish(gm, r) {
    close(); markPlayed();
    let rec = false, prev;
    if (gm.better && typeof r.score === 'number') {
      prev = store.best[gm.id];
      rec = prev === undefined || (gm.better === 'high' ? r.score > prev : r.score < prev);
      if (rec) store.best[gm.id] = r.score;
    }
    if (isDaily && typeof r.score === 'number') { const t = dayKey(), old = store.daily[t]; if (old === undefined || !gm.better || (gm.better === 'high' ? r.score > old : r.score < old)) store.daily[t] = r.score; }
    save();
    $('#rTag').textContent = isDaily ? '◈ Desafío del día' : '◈ ' + gm.title;
    const sc = $('#rScore'); sc.textContent = gm.better ? gm.fmt(r.score) : '✓'; sc.classList.remove('glitch'); void sc.offsetWidth; sc.classList.add('glitch');
    $('#rLabel').textContent = r.text || '';
    const b = $('#rBest');
    b.className = 'jg-best' + (rec && prev !== undefined ? ' rec' : '');
    b.textContent = !gm.better ? (r.detail || '') : rec ? (prev === undefined ? 'Primer récord' : `¡Nuevo récord! (antes ${gm.fmt(prev)})`) : `Récord: ${gm.fmt(store.best[gm.id])}`;
    const ex = $('#rExtra'); ex.innerHTML = '';
    if (gm.better && r.detail) ex.append(el('p', 'jg-best', r.detail));
    (r.extra || []).forEach(x => ex.append(x));
    const shareTxt = r.share || (isDaily && gm.better ? `PUDRUS · Juegos · desafío del ${new Date().toLocaleDateString('es')}: ${gm.title} ${gm.fmt(r.score)} ◈` : '');
    const sh = $('#rShare'); sh.hidden = !shareTxt; sh.textContent = 'Copiar resultado';
    sh.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(shareTxt + (r.share ? '' : '\npudrus.xyz')).then(() => { sh.textContent = 'Copiado ✓'; }, () => {}); };
    result.hidden = false; $('#rAgain').focus();
  }
  $('#rAgain').addEventListener('click', () => { result.hidden = true; if (current) open(current.id, isDaily); });
  $('#rHub').addEventListener('click', () => { location.hash = ''; });
  $('#back').addEventListener('click', () => { location.hash = ''; });
  $('#helpBtn').addEventListener('click', () => { how.hidden = !how.hidden; });
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (!result.hidden) result.hidden = true; else if (!play.hidden) location.hash = ''; } });
  function route() {
    const h = decodeURIComponent(location.hash.slice(1)), [id, flag] = h.split('/');
    if (id && byId(id)) open(id, flag === 'hoy'); else showHub();
  }
  addEventListener('hashchange', route);
  route();
  window.__juegos = { GAMES, store, open, mulberry, hashStr, get test() { return testHook; } };
})();
