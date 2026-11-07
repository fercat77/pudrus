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
    recorrido: `<svg viewBox="0 0 120 64"><path d="M12 12h32v40h32V12h32v40" fill="none" stroke="${C.g}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/><g font-family="monospace" font-weight="700" font-size="12" text-anchor="middle"><circle cx="12" cy="12" r="10" fill="#050508" stroke="${C.g}" stroke-width="2.5"/><text x="12" y="16" fill="${C.g}">1</text><circle cx="76" cy="52" r="10" fill="#050508" stroke="${C.g}" stroke-width="2.5"/><text x="76" y="56" fill="${C.g}">2</text><circle cx="108" cy="52" r="10" fill="#050508" stroke="${C.c}" stroke-width="2.5"/><text x="108" y="56" fill="${C.c}">3</text></g></svg>`,
    sudoku: `<svg viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" fill="none" stroke="${C.g}" stroke-width="2.5"/><path d="M22 2v60M42 2v60M2 22h60M2 42h60" stroke="${C.g}" stroke-width="1.5" opacity="0.6"/><g font-family="monospace" font-weight="700" font-size="14" text-anchor="middle"><text x="12" y="17" fill="#fff">5</text><text x="52" y="17" fill="${C.g}">3</text><text x="32" y="37" fill="#fff">9</text><text x="12" y="57" fill="${C.c}">7</text><text x="52" y="57" fill="#fff">1</text></g></svg>`,
    destellos: `<svg viewBox="0 0 64 64"><g fill="#12121c" stroke="${C.dim}" stroke-width="1.5">${[0,1,2].map(r=>[0,1,2].map(c=>`<rect x="${4+c*20}" y="${4+r*20}" width="16" height="16" rx="3"/>`).join('')).join('')}</g><rect x="24" y="4" width="16" height="16" rx="3" fill="${C.g}"/><rect x="4" y="44" width="16" height="16" rx="3" fill="${C.g}"/><rect x="44" y="24" width="16" height="16" rx="3" fill="${C.g}"/></svg>`,
    intruso: `<svg viewBox="0 0 120 64"><g fill="${C.c}">${[0,1,2,3,4].map(i=>`<path d="M${8+i*22} 46 l8-28 l8 28 z"/>`).join('')}</g><path d="M96 46 l8-28 l8 28 z" fill="${C.c}" transform="rotate(25 104 34)" opacity="0.9"/><circle cx="104" cy="34" r="18" fill="none" stroke="${C.g}" stroke-width="2.5"/></svg>`,
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
      function size() { const st = ctx.stage, w = Math.min(st.clientWidth - 8 || 480, 520, (st.clientHeight || 560) - 52); S = Math.max(24, Math.floor(w / n)); const dpr = Math.min(2, devicePixelRatio || 1); cv.width = S * n * dpr; cv.height = S * n * dpr; cv.style.width = cv.style.height = S * n + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
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

  /* ── RECORRIDO: one line through every square, joining the numbers in order ──
     (a classic family of numbered-path puzzles; any path that follows the rules is a solution) */
  GAMES.push({ id: 'recorrido', title: 'Recorrido', tag: 'Lógica', desc: 'Una sola línea que pasa por todos los casilleros y une los números en orden.',
    how: 'Arrastrá desde el 1 y pasá por cada casillero una sola vez, tocando los números en orden (1, 2, 3…) hasta el último. Para corregir, volvé sobre la línea o tocá un casillero de la línea para cortarla ahí. Tres tableros; cuenta el tiempo total. Teclado: flechas para avanzar, Retroceso para deshacer.',
    better: 'low', fmt: s => mmss(s),
    start(ctx) {
      const SIZES = [5, 6, 7];
      let level = 0, n, N, nums, maxNum, sol, path = [], drawing = false, done = false, t0 = performance.now(), S = 0;
      const cv = el('canvas', 'jg-canvas'), g = cv.getContext('2d'), msg = el('p', 'jg-msg');
      cv.style.touchAction = 'none';
      ctx.stage.append(cv, msg);
      const nb = c => { const x = c % n, y = (c / n) | 0, o = []; if (x > 0) o.push(c - 1); if (x < n - 1) o.push(c + 1); if (y > 0) o.push(c - n); if (y < n - 1) o.push(c + n); return o; };
      const adj = (a, b) => nb(a).includes(b);
      function hamilton() {   // a path through every square (Warnsdorff: go where fewer ways remain)
        for (let tries = 0; tries < 300; tries++) {
          const seen = new Uint8Array(N); let cur = Math.floor(ctx.rnd() * N); const p = [cur]; seen[cur] = 1;
          while (p.length < N) {
            const opts = nb(cur).filter(j => !seen[j]); if (!opts.length) break;
            let best = [], bd = 9;
            for (const j of opts) { const d = nb(j).filter(k => !seen[k]).length; if (d < bd) { bd = d; best = [j]; } else if (d === bd) best.push(j); }
            cur = best[Math.floor(ctx.rnd() * best.length)]; seen[cur] = 1; p.push(cur);
          }
          if (p.length === N) return p;
        }
        return Array.from({ length: N }, (_, i) => { const y = (i / n) | 0, x = i % n; return y * n + (y % 2 ? n - 1 - x : x); });   // snake
      }
      function make() {
        n = SIZES[level]; N = n * n; sol = hamilton(); path = []; drawing = false;
        const K = n + 1, idx = new Set([0, N - 1]);
        for (let i = 1; i < K - 1; i++) { const base = i * (N - 1) / (K - 1), j = Math.round(base + (ctx.rnd() - 0.5) * (N / K) * 0.6); idx.add(Math.max(1, Math.min(N - 2, j))); }
        const order = [...idx].sort((a, b) => a - b);
        nums = new Map(order.map((i, k) => [sol[i], k + 1])); maxNum = order.length;
        size(); draw();
        msg.textContent = `Tablero ${level + 1} de ${SIZES.length} · ${n}×${n} · del 1 al ${maxNum}`;
      }
      const lastNum = () => path.reduce((m, c) => Math.max(m, nums.get(c) || 0), 0);
      function size() { const st = ctx.stage, w = Math.min(st.clientWidth - 8 || 480, 520, (st.clientHeight || 560) - 52); S = Math.max(24, Math.floor(w / n)); const dpr = Math.min(2, devicePixelRatio || 1); cv.width = S * n * dpr; cv.height = S * n * dpr; cv.style.width = cv.style.height = S * n + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
      const ctr = c => [(c % n + 0.5) * S, (((c / n) | 0) + 0.5) * S];
      function draw() {
        g.fillStyle = '#07070d'; g.fillRect(0, 0, S * n, S * n);
        const inPath = new Set(path);
        for (let c = 0; c < N; c++) { const x = (c % n) * S, y = ((c / n) | 0) * S; g.fillStyle = inPath.has(c) ? 'rgba(102,255,51,0.10)' : '#0b0b14'; g.fillRect(x + 1, y + 1, S - 2, S - 2); }
        if (path.length > 1) {
          const [ax, ay] = ctr(path[0]), [bx, by] = ctr(path[path.length - 1]);
          const grad = g.createLinearGradient(ax, ay, bx, by); grad.addColorStop(0, C.g); grad.addColorStop(1, C.c);
          g.save(); g.strokeStyle = grad; g.lineWidth = S * 0.38; g.lineCap = g.lineJoin = 'round'; g.shadowColor = C.g; g.shadowBlur = 14;
          g.beginPath(); path.forEach((c, i) => { const [x, y] = ctr(c); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.restore();
        }
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(S * 0.32)}px "IBM Plex Mono", monospace`;
        nums.forEach((k, c) => {
          const [x, y] = ctr(c), on = inPath.has(c);
          g.beginPath(); g.arc(x, y, S * 0.3, 0, 7); g.fillStyle = on ? C.g : '#050508'; g.fill();
          g.lineWidth = 2.5; g.strokeStyle = C.g; g.stroke();
          g.fillStyle = on ? '#050508' : C.g; g.fillText(String(k), x, y + 1);
        });
        if (path.length) { const [x, y] = ctr(path[path.length - 1]); g.beginPath(); g.arc(x, y, S * 0.1, 0, 7); g.fillStyle = '#fff'; g.fill(); }
      }
      function step(c) {   // try to extend (or back up) the line to square c
        const L = path.length, last = path[L - 1];
        if (c === last) return false;
        if (L >= 2 && c === path[L - 2]) { path.pop(); return true; }
        if (!adj(last, c) || path.includes(c)) return false;
        const k = nums.get(c);
        if (k && k !== lastNum() + 1) return false;
        path.push(c); return true;
      }
      function toward(c) {   // the pointer may skip squares: walk there one square at a time
        let guard = 0;
        while (path.length && path[path.length - 1] !== c && guard++ < 2 * n) {
          const last = path[path.length - 1], lx = last % n, ly = (last / n) | 0, tx = c % n, ty = (c / n) | 0;
          if (adj(last, c)) { if (!step(c)) break; continue; }
          const dx = Math.sign(tx - lx), dy = Math.sign(ty - ly);
          const next = Math.abs(tx - lx) >= Math.abs(ty - ly) ? last + dx : last + dy * n;
          if (!step(next)) break;
        }
      }
      function check() {
        if (done || path.length !== N || nums.get(path[N - 1]) !== maxNum) return;
        okSound(); done = true; level++;
        if (level >= SIZES.length) { const tot = Math.round((performance.now() - t0) / 1000); setTimeout(() => ctx.done({ score: tot, text: `Tres recorridos en ${mmss(tot)}`, better: 'low' }), 500); }
        else setTimeout(() => { done = false; make(); }, 500);
      }
      const cellAt = e => { const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / S), y = Math.floor((e.clientY - r.top) / S); return x >= 0 && y >= 0 && x < n && y < n ? y * n + x : -1; };
      cv.addEventListener('pointerdown', e => {
        if (done) return; const c = cellAt(e); if (c < 0) return;
        if (path.includes(c)) path.length = path.indexOf(c) + 1;
        else if (nums.get(c) === 1) path = [c];
        else if (path.length && adj(path[path.length - 1], c)) step(c);
        else { msg.textContent = 'Empezá desde el 1 (o seguí desde la punta de la línea)'; return; }
        drawing = true; cv.setPointerCapture(e.pointerId); tone(400, 0.04, 'triangle', 0.04); draw(); check();
      });
      cv.addEventListener('pointermove', e => { if (!drawing || done) return; const c = cellAt(e); if (c < 0) return; const before = path.length; toward(c); if (path.length !== before) { tone(300 + path.length * 12, 0.03, 'triangle', 0.03); draw(); check(); } });
      const up = () => { drawing = false; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      const key = e => {
        if (done) return;
        const k = e.key;
        if (k === 'Backspace') { e.preventDefault(); path.pop(); draw(); return; }
        if (!k.startsWith('Arrow')) return;
        e.preventDefault();
        if (!path.length) { for (const [c, v] of nums) if (v === 1) path = [c]; draw(); return; }
        const last = path[path.length - 1], x = last % n, y = (last / n) | 0;
        const nx = x + (k === 'ArrowRight') - (k === 'ArrowLeft'), ny = y + (k === 'ArrowDown') - (k === 'ArrowUp');
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) return;
        if (step(ny * n + nx)) { draw(); check(); }
      };
      addEventListener('keydown', key);
      ctx.test.solve = () => { if (done) return; path = sol.slice(); draw(); check(); };
      const tick = setInterval(() => ctx.hud(`Tiempo<b>${mmss((performance.now() - t0) / 1000)}</b> Casilleros<b>${path.length}/${N}</b>`), 250);
      const rs = () => { size(); draw(); }; addEventListener('resize', rs);
      make();
      return () => { clearInterval(tick); removeEventListener('keydown', key); removeEventListener('resize', rs); };
    } });

  /* ── SUDOKU: the classic, generated here with a single solution ── */
  function sdCount(g, limit) {   // how many solutions (stops at `limit`)
    const R = new Uint16Array(9), Cc = new Uint16Array(9), B = new Uint16Array(9);
    for (let i = 0; i < 81; i++) if (g[i]) { const r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0), m = 1 << g[i]; R[r] |= m; Cc[c] |= m; B[b] |= m; }
    let count = 0;
    (function rec() {
      let best = -1, bm = 0, bc = 10;
      for (let i = 0; i < 81; i++) if (!g[i]) {
        const r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0), m = ~(R[r] | Cc[c] | B[b]) & 0x3FE;
        let k = 0; for (let v = m; v; v &= v - 1) k++;
        if (k < bc) { bc = k; best = i; bm = m; if (!k) return; }
      }
      if (best < 0) { count++; return; }
      const r = (best / 9) | 0, c = best % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      for (let d = 1; d <= 9 && count < limit; d++) if (bm & (1 << d)) {
        g[best] = d; R[r] |= 1 << d; Cc[c] |= 1 << d; B[b] |= 1 << d;
        rec();
        g[best] = 0; R[r] &= ~(1 << d); Cc[c] &= ~(1 << d); B[b] &= ~(1 << d);
      }
    })();
    return count;
  }
  function sdMake(rnd, clues) {
    const g = new Array(81).fill(0);
    const ok = (i, d) => { const r = (i / 9) | 0, c = i % 9, br = r - r % 3, bc = c - c % 3; for (let k = 0; k < 9; k++) { if (g[r * 9 + k] === d || g[k * 9 + c] === d || g[(br + ((k / 3) | 0)) * 9 + bc + k % 3] === d) return false; } return true; };
    (function fill(i) {
      if (i === 81) return true;
      const ds = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rnd() - 0.5);
      for (const d of ds) if (ok(i, d)) { g[i] = d; if (fill(i + 1)) return true; g[i] = 0; }
      return false;
    })(0);
    const solution = g.slice(), puzzle = g.slice();
    const order = [...Array(81).keys()].sort(() => rnd() - 0.5);
    let left = 81;
    for (const i of order) {
      if (left <= clues) break;
      const keep = puzzle[i]; puzzle[i] = 0;
      if (sdCount(puzzle.slice(), 2) !== 1) puzzle[i] = keep; else left--;
    }
    return { puzzle, solution };
  }
  GAMES.push({ id: 'sudoku', title: 'Sudoku', tag: 'Lógica', desc: 'El clásico: completá la grilla para que cada fila, columna y caja tenga del 1 al 9.',
    how: 'Elegí un casillero y escribí un número (teclado o botones). Cada fila, columna y caja de 3×3 lleva del 1 al 9 sin repetir; los choques se marcan en rojo. «Notas» sirve para anotar candidatos chiquitos. Cada sudoku tiene una sola solución. Teclado: flechas, 1–9, Retroceso para borrar, N para notas.',
    better: 'low', fmt: s => mmss(s),
    options: [['facil', 'Fácil', 40], ['medio', 'Medio', 32], ['dificil', 'Difícil', 26]], dailyOption: 'medio',
    start(ctx) {
      const opt = (this.options.find(o => o[0] === ctx.option) || this.options[1]);
      const { puzzle, solution } = sdMake(ctx.rnd, opt[2]);
      const val = puzzle.slice(), notes = Array.from({ length: 81 }, () => new Set());
      let sel = puzzle.findIndex(v => !v), noteMode = false, over = false, t0 = performance.now();
      const grid = el('div', 'sd-grid'), padEl = el('div', 'sd-pad'), msg = el('p', 'jg-msg', `Nivel ${opt[1].toLowerCase()} · ${puzzle.filter(Boolean).length} pistas`);
      const cells = val.map((v, i) => {
        const b = el('button', 'sd-cell' + (puzzle[i] ? ' given' : ''));
        const r = (i / 9) | 0, c = i % 9;
        if (c % 3 === 0 && c) b.classList.add('bl'); if (r % 3 === 0 && r) b.classList.add('bt');
        b.addEventListener('click', () => { sel = i; paint(); });
        grid.append(b); return b;
      });
      for (let d = 1; d <= 9; d++) { const b = el('button', 'jg-btn sd-num', String(d)); b.addEventListener('click', () => put(d)); padEl.append(b); }
      const del = el('button', 'jg-btn', '⌫ Borrar'); del.addEventListener('click', () => put(0));
      const nb = el('button', 'jg-btn', '✎ Notas'); nb.addEventListener('click', () => { noteMode = !noteMode; nb.classList.toggle('on', noteMode); });
      padEl.append(del, nb);
      ctx.stage.append(grid, padEl, msg);
      const peers = i => { const r = (i / 9) | 0, c = i % 9, br = r - r % 3, bc = c - c % 3, s = new Set(); for (let k = 0; k < 9; k++) { s.add(r * 9 + k); s.add(k * 9 + c); s.add((br + ((k / 3) | 0)) * 9 + bc + k % 3); } s.delete(i); return s; };
      const PEERS = val.map((_, i) => peers(i));
      function paint() {
        const sv = sel >= 0 ? val[sel] : 0, sp = sel >= 0 ? PEERS[sel] : new Set();
        cells.forEach((b, i) => {
          const v = val[i], bad = v && [...PEERS[i]].some(j => val[j] === v);
          b.classList.toggle('sel', i === sel); b.classList.toggle('peer', sp.has(i)); b.classList.toggle('same', !!sv && v === sv && i !== sel); b.classList.toggle('bad', !!bad);
          if (v) b.textContent = v;
          else if (notes[i].size) { b.textContent = ''; const nt = el('span', 'sd-notes'); for (let d = 1; d <= 9; d++) nt.append(el('i', '', notes[i].has(d) ? String(d) : '')); b.append(nt); }
          else b.textContent = '';
        });
        // a digit already placed 9 times is done
        padEl.querySelectorAll('.sd-num').forEach((b, k) => { b.classList.toggle('full', val.filter(x => x === k + 1).length >= 9); });
      }
      function put(d) {
        if (over || sel < 0 || puzzle[sel]) return;
        if (noteMode && d) { notes[sel].has(d) ? notes[sel].delete(d) : notes[sel].add(d); val[sel] = 0; }
        else {
          val[sel] = d; notes[sel].clear();
          if (d) PEERS[sel].forEach(j => notes[j].delete(d));   // the number leaves the notes of its row, column and box
          tone(d ? 420 + d * 30 : 200, 0.05, 'triangle', 0.05);
        }
        paint();
        if (val.every(Boolean) && val.every((v, i) => ![...PEERS[i]].some(j => val[j] === v))) {
          over = true; okSound();
          const tot = Math.round((performance.now() - t0) / 1000);
          setTimeout(() => ctx.done({ score: tot, text: `Sudoku ${opt[1].toLowerCase()} en ${mmss(tot)}`, better: 'low' }), 400);
        }
      }
      const key = e => {
        if (over) return;
        const k = e.key;
        if (/^[1-9]$/.test(k)) { put(+k); return; }
        if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); put(0); return; }
        if (k === 'n' || k === 'N') { nb.click(); return; }
        if (k.startsWith('Arrow')) {
          e.preventDefault(); if (sel < 0) sel = 0;
          const r = (sel / 9) | 0, c = sel % 9;
          const nr = (r + (k === 'ArrowDown') - (k === 'ArrowUp') + 9) % 9, nc = (c + (k === 'ArrowRight') - (k === 'ArrowLeft') + 9) % 9;
          sel = nr * 9 + nc; paint();
        }
      };
      addEventListener('keydown', key);
      ctx.test.solve = () => { solution.forEach((v, i) => { if (!puzzle[i] && i !== sel) val[i] = v; }); if (!puzzle[sel]) { const d = solution[sel]; put(d); } else paint(); };
      ctx.test.solution = solution; ctx.test.puzzle = puzzle;
      const tick = setInterval(() => ctx.hud(`Tiempo<b>${mmss((performance.now() - t0) / 1000)}</b> Faltan<b>${val.filter(v => !v).length}</b>`), 250);
      paint();
      return () => { clearInterval(tick); removeEventListener('keydown', key); };
    } });

  /* ── DESTELLOS: some squares flash, tap the same ones (spatial memory) ── */
  GAMES.push({ id: 'destellos', title: 'Destellos', tag: 'Memoria', desc: 'Se encienden unas casillas un instante. Tocá las mismas. Cada ronda, una más.',
    how: 'Mirá qué casillas se encienden y, cuando se apagan, tocá esas mismas en cualquier orden. Cada ronda suma una casilla y la grilla crece. Tenés tres vidas: un error cuesta una y te muestra las que eran.',
    better: 'high', fmt: s => String(s),
    start(ctx) {
      let n = 4, k = 3, lives = 3, best = 0, targets = new Set(), found = new Set(), phase = 'show', over = false;
      const grid = el('div', 'ds-grid'), msg = el('p', 'jg-msg');
      ctx.stage.append(grid, msg);
      const timers = [];
      const later = (f, ms) => timers.push(setTimeout(f, ms));
      function hud() { ctx.hud(`Casillas<b>${k}</b> Vidas<b>${'●'.repeat(lives)}${'○'.repeat(3 - lives)}</b>`); }
      function build() {
        grid.innerHTML = ''; grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
        for (let i = 0; i < n * n; i++) { const b = el('button', 'ds-cell'); b.addEventListener('pointerdown', e => { e.preventDefault(); tap(i); }); grid.append(b); }
      }
      function round() {
        n = k <= 5 ? 4 : k <= 8 ? 5 : 6; build();
        targets = new Set(); found = new Set();
        while (targets.size < k) targets.add(Math.floor(ctx.rnd() * n * n));
        ctx.test.cells = [...targets];
        phase = 'show'; grid.classList.add('locked'); msg.textContent = 'Mirá…'; hud();
        later(() => { targets.forEach(i => grid.children[i].classList.add('lit')); tone(520, 0.08, 'triangle', 0.05); }, 350);
        later(() => { targets.forEach(i => grid.children[i].classList.remove('lit')); phase = 'play'; grid.classList.remove('locked'); msg.textContent = `Tocá las ${k} casillas`; }, 350 + 900 + k * 120);
      }
      function tap(i) {
        if (phase !== 'play' || over || found.has(i)) return;
        const c = grid.children[i];
        if (targets.has(i)) {
          found.add(i); c.classList.add('ok'); tone(600 + found.size * 40, 0.06, 'triangle', 0.05);
          if (found.size === targets.size) { phase = 'wait'; best = k; okSound(); msg.textContent = '¡Bien!'; k++; later(round, 700); }
          return;
        }
        lives--; c.classList.add('bad'); badSound(); hud();
        phase = 'wait'; targets.forEach(j => { if (!found.has(j)) grid.children[j].classList.add('miss'); });
        if (lives <= 0) { over = true; msg.textContent = 'Sin vidas'; later(() => ctx.done({ score: best, text: best ? `Recordaste hasta ${best} casillas` : 'Ninguna ronda completa: ¡otra!', better: 'high' }), 1100); }
        else { msg.textContent = 'Eran esas · otra vez'; later(round, 1300); }
      }
      ctx.test.tap = i => tap(i); ctx.test.phase = () => phase;
      round();
      return () => timers.forEach(clearTimeout);
    } });

  /* ── INTRUSO: all the figures are the same but one; find it fast ── */
  GAMES.push({ id: 'intruso', title: 'Intruso', tag: 'Atención', desc: 'Todas las figuras son iguales menos una. Encontrala rápido: la grilla crece y la diferencia se achica.',
    how: 'Tocá la figura distinta: puede estar girada, tener otro tono o ser un poco más chica. 45 segundos; cada acierto suma y agranda la grilla, cada error resta 3 segundos.',
    better: 'high', fmt: s => String(s),
    start(ctx) {
      let found = 0, left = 45, over = false, odd = -1;
      const grid = el('div', 'it-grid'), msg = el('p', 'jg-msg', 'Encontrá la distinta');
      ctx.stage.append(grid, msg);
      const SHAPES = [
        'M50 10 L80 60 L62 60 L62 90 L38 90 L38 60 L20 60 Z',             // arrow
        'M20 20 H55 V40 H40 V80 H20 Z',                                    // L
        'M50 12 L88 50 L50 88 L12 50 Z M50 34 L66 50 L50 66 L34 50 Z',      // diamond ring
        'M15 70 Q50 5 85 70 L70 70 Q50 35 30 70 Z',                         // arch
        'M30 15 H70 L85 50 L70 85 H30 L45 50 Z',                            // chevron
      ];
      const COLS = [[102, 255, 51], [0, 212, 255], [255, 63, 164], [255, 210, 63]];
      function round() {
        const level = found, n = Math.min(8, 3 + Math.floor(level / 2)), N = n * n;
        const shape = SHAPES[Math.floor(ctx.rnd() * SHAPES.length)], col = COLS[Math.floor(ctx.rnd() * COLS.length)], rot = Math.floor(ctx.rnd() * 4) * 90;
        // how different the intruder is: obvious at first, subtle later
        const k = Math.max(0.18, 1 - level * 0.07), kind = ['rot', 'tint', 'size', 'mirror'][Math.floor(ctx.rnd() * (level < 3 ? 3 : 4))];
        odd = Math.floor(ctx.rnd() * N); ctx.test.odd = odd;
        grid.innerHTML = ''; grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
        for (let i = 0; i < N; i++) {
          let r = rot, c = col, s = 1, flip = 1;
          if (i === odd) {
            if (kind === 'rot') r += (ctx.rnd() < 0.5 ? -1 : 1) * Math.max(10, 70 * k);
            else if (kind === 'tint') c = col.map(v => Math.round(v * (1 - 0.55 * k)));
            else if (kind === 'size') s = 1 - 0.4 * k;
            else flip = -1;
          }
          const b = el('button', 'it-cell');
          b.innerHTML = `<svg viewBox="0 0 100 100"><path d="${shape}" fill="rgb(${c.join(',')})" fill-rule="evenodd" transform="rotate(${r} 50 50) translate(50 50) scale(${s * flip} ${s}) translate(-50 -50)"/></svg>`;
          b.addEventListener('pointerdown', e => { e.preventDefault(); pick(i, b); });
          grid.append(b);
        }
      }
      function pick(i, b) {
        if (over) return;
        if (i === odd) { found++; okSound(); round(); }
        else { left -= 3; badSound(); b.classList.add('bad'); grid.classList.remove('flash-bad'); void grid.offsetWidth; grid.classList.add('flash-bad'); }
        ctx.hud(`Tiempo<b>${Math.max(0, Math.ceil(left))}</b> Encontradas<b>${found}</b>`);
      }
      ctx.test.pick = i => pick(i, grid.children[i]);
      round();
      const tick = setInterval(() => {
        left -= 0.1; ctx.hud(`Tiempo<b>${Math.max(0, Math.ceil(left))}</b> Encontradas<b>${found}</b>`);
        if (left <= 0 && !over) { over = true; clearInterval(tick); ctx.done({ score: found, text: `${found} intrusos encontrados`, better: 'high' }); }
      }, 100);
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
      let line;
      if (gm.options) {   // a record per level
        const got = gm.options.filter(([k]) => store.best[gm.id + ':' + k] !== undefined).map(([k, label]) => `${label} ${gm.fmt(store.best[gm.id + ':' + k])}`);
        line = got.length ? `<div class="best">Récords: ${got.join(' · ')}</div>` : '<div class="best none">Sin jugar todavía</div>';
      } else {
        const best = gm.better ? store.best[gm.id] : store.count[gm.id];
        line = `<div class="best${best === undefined ? ' none' : ''}">${best === undefined ? 'Sin jugar todavía' : (gm.better ? 'Récord: ' : '') + gm.fmt(best)}</div>`;
      }
      // .ci: the card's content, laid out by the card's OWN size (container queries) so nothing gets cut
      c.innerHTML = `<div class="ci"><div class="art">${ART[gm.id] || ''}</div><div class="tx"><div class="tag">${gm.tag}</div><h3>${gm.title}</h3><p>${gm.desc}</p>${line}</div></div>`;
      c.addEventListener('click', () => { location.hash = gm.id; });
      grid.append(c);
    });
  }
  $('#daily').addEventListener('click', () => { location.hash = dailyGame().id + '/hoy'; });

  let cleanup = null, current = null, isDaily = false, testHook = {}, option = null;
  const bestKey = gm => gm.id + (gm.options && option ? ':' + option : '');
  function open(id, daily) {
    const gm = byId(id); if (!gm) { showHub(); return; }
    close(); current = gm; isDaily = !!daily;
    hub.hidden = true; play.hidden = false; result.hidden = true; document.body.classList.remove('hubmode'); document.body.classList.add('playmode');
    $('#gTitle').textContent = gm.title + (isDaily ? ' · desafío del día' : '');
    $('#gTag').textContent = gm.tag;
    how.textContent = gm.how; how.hidden = true;
    hud.innerHTML = ''; stage.innerHTML = '';
    document.title = `${gm.title} — DRUS — PUDRUS.XYZ`;
    window.scrollTo(0, 0);
    // a start screen first: read the rules, then play
    const st = el('div', 'jg-start');
    st.append(el('div', 'big', '◈'), el('p', 'jg-rules', gm.how));
    option = isDaily ? gm.dailyOption : (store.opt && store.opt[gm.id]) || (gm.options ? gm.options[0][0] : null);
    if (gm.options && !isDaily) {
      const row = el('div', 'jg-btns');
      gm.options.forEach(([k, label]) => { const b = el('button', 'jg-btn' + (k === option ? ' on' : ''), label); b.addEventListener('click', () => { option = k; store.opt = store.opt || {}; store.opt[gm.id] = k; save(); row.querySelectorAll('.jg-btn').forEach(x => x.classList.toggle('on', x === b)); }); row.append(b); });
      st.append(row);
    }
    const goBtn = el('button', 'jg-btn primary', 'Empezar'); goBtn.addEventListener('click', go);
    st.append(goBtn); stage.append(st); goBtn.focus();
    function go() {
      stage.innerHTML = '';
      const rnd = isDaily ? mulberry(hashStr(dayKey() + ':' + gm.id)) : Math.random;
      testHook = {};
      cleanup = gm.start({ test: testHook, option, stage, rnd, daily: isDaily, hud: h => { hud.innerHTML = h; }, done: r => finish(gm, r) });
    }
  }
  function close() { if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; } }
  function showHub() { close(); current = null; play.hidden = true; result.hidden = true; hub.hidden = false; document.body.classList.remove('playmode'); document.body.classList.add('hubmode'); document.title = 'DRUS — PUDRUS.XYZ'; paintHub(); }
  function finish(gm, r) {
    close(); markPlayed();
    let rec = false, prev;
    if (gm.better && typeof r.score === 'number') {
      prev = store.best[bestKey(gm)];
      rec = prev === undefined || (gm.better === 'high' ? r.score > prev : r.score < prev);
      if (rec) store.best[bestKey(gm)] = r.score;
    }
    if (isDaily && typeof r.score === 'number') { const t = dayKey(), old = store.daily[t]; if (old === undefined || !gm.better || (gm.better === 'high' ? r.score > old : r.score < old)) store.daily[t] = r.score; }
    save();
    $('#rTag').textContent = isDaily ? '◈ Desafío del día' : '◈ ' + gm.title;
    const sc = $('#rScore'); sc.textContent = gm.better ? gm.fmt(r.score) : '✓'; sc.classList.remove('glitch'); void sc.offsetWidth; sc.classList.add('glitch');
    $('#rLabel').textContent = r.text || '';
    const b = $('#rBest');
    b.className = 'jg-best' + (rec && prev !== undefined ? ' rec' : '');
    b.textContent = !gm.better ? (r.detail || '') : rec ? (prev === undefined ? 'Primer récord' : `¡Nuevo récord! (antes ${gm.fmt(prev)})`) : `Récord: ${gm.fmt(store.best[bestKey(gm)])}`;
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
