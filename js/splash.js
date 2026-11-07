/* PUDRUS · splash screens — a short animation before a page, once per visit.
   <script src="/js/splash.js" data-splash="home|juegos|nodrus"></script> as the FIRST thing in <body>.
   Skipped: inside iframes, on a second visit in the same session, with ?nosplash. Click / key / touch skips it.
   prefers-reduced-motion: a calm fade of the name instead of the animation. */
(function () {
  'use strict';
  const me = document.currentScript, mode = (me && me.dataset.splash) || 'home';
  const KEY = 'pudrus_splash_' + mode;
  try {
    if (window.top !== window.self) return;
    if (/[?&]nosplash\b/.test(location.search)) return;
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
  } catch (e) { /* storage blocked: show it anyway */ }

  const G = '#66ff33', CY = '#00d4ff', MG = '#ff3fa4', BG = '#050508';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = { home: 2100, juegos: 2300, nodrus: 2500 }[mode] || 2100;

  // overlay
  const ov = document.createElement('div');
  ov.setAttribute('aria-hidden', 'true');
  ov.style.cssText = `position:fixed;inset:0;z-index:2147483000;background:${BG};cursor:pointer;transition:opacity .35s ease;`;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  const hint = document.createElement('div');
  hint.textContent = 'tocá para saltar';
  hint.style.cssText = `position:absolute;left:0;right:0;bottom:22px;text-align:center;font:11px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;color:rgba(102,255,51,.35);opacity:0;transition:opacity .6s .5s;`;
  ov.append(cv, hint);
  (document.body || document.documentElement).appendChild(ov);
  const html = document.documentElement, prevOverflow = html.style.overflow;
  html.style.overflow = 'hidden';
  requestAnimationFrame(() => { hint.style.opacity = '1'; });

  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function size() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); addEventListener('resize', size);

  let t0 = performance.now(), raf = 0, ended = false;
  function end() {
    if (ended) return; ended = true;
    cancelAnimationFrame(raf);
    ov.style.opacity = '0'; ov.style.pointerEvents = 'none';
    setTimeout(() => { ov.remove(); html.style.overflow = prevOverflow; removeEventListener('resize', size); }, 380);
    removeEventListener('keydown', end, true);
  }
  ov.addEventListener('pointerdown', end);
  addEventListener('keydown', end, true);
  setTimeout(end, DUR + 2500);   // safety net: never stays

  const ease = x => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
  const seg = (t, a, b) => ease((t - a) / (b - a));
  const FONT = w => `700 ${w}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`;

  /* ── calm version ── */
  if (reduce) {
    const name = { home: 'PUDRUS', juegos: 'JUEGOS', nodrus: 'NODRUS' }[mode];
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.font = FONT(Math.min(W / 7, 90)); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = G;
    g.fillText(name, W / 2, H / 2);
    setTimeout(end, 700);
    return;
  }

  /* ── HOME · «Sintonía»: static tunes in, the name dithers out of the noise, glitch, the screen tears away ── */
  function home() {
    const cols = 200, rows = Math.max(60, Math.round(200 * H / W));
    const lo = document.createElement('canvas'); lo.width = cols; lo.height = rows;
    const lg = lo.getContext('2d'), img = lg.createImageData(cols, rows), px = img.data;
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
    let mask = null;
    function makeMask() {   // the name drawn small: where it is, the noise turns into letters
      const m = document.createElement('canvas'); m.width = cols; m.height = rows; const mg = m.getContext('2d');
      const fs = Math.min(cols / 4.6, rows * 0.42);
      mg.fillStyle = '#fff'; mg.font = FONT(fs); mg.textAlign = 'center'; mg.textBaseline = 'middle';
      mg.fillText('PUDRUS', cols / 2, rows / 2 - fs * 0.08);
      mg.font = FONT(fs * 0.28); mg.fillText('.XYZ', cols / 2 + fs * 1.62, rows / 2 + fs * 0.52);
      const d = mg.getImageData(0, 0, cols, rows).data; mask = new Float32Array(cols * rows);
      for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4] / 255;
    }
    return t => {
      if (!mask && t > 250) makeMask();
      const tune = seg(t, 300, 1250);            // 0 = pure static, 1 = clean name
      const fade = 1 - seg(t, 1850, 2100);
      const tear = Math.floor(rows * (0.5 + 0.5 * Math.sin(t * 0.013)));
      for (let y = 0; y < rows; y++) {
        const roll = (y === tear || y === (tear + 7) % rows) ? 0.6 : 0;
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x, o = i * 4, n = Math.random();
          const m = mask ? mask[i] : 0, b = BAYER[(y & 3) * 4 + (x & 3)];
          // static loses strength as the signal tunes in; the letters dither in (ordered dither)
          const noise = n * (1 - tune * 0.92) * (0.55 + roll);
          const sig = m * tune > b ? 1 : 0;
          let r, gg, bb;
          if (sig) { r = 102; gg = 255; bb = 51; }
          else { const v = noise * 160; r = v * 0.3; gg = v; bb = v * 0.75 + (n > 0.985 ? 120 : 0); }
          px[o] = r * fade; px[o + 1] = gg * fade; px[o + 2] = bb * fade; px[o + 3] = 255;
        }
      }
      lg.putImageData(img, 0, 0);
      g.fillStyle = BG; g.fillRect(0, 0, W, H);
      g.imageSmoothingEnabled = false;
      const glitch = t > 1250 && t < 1650;
      if (glitch) {   // RGB split slices
        const bands = 9;
        for (let k = 0; k < bands; k++) {
          const sy = (k / bands) * rows, sh = rows / bands, dx = (Math.random() - 0.5) * 40 * (Math.random() < 0.4 ? 1 : 0.1);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.9; g.drawImage(lo, 0, sy, cols, sh, dx, sy / rows * H, W, sh / rows * H);
          g.globalAlpha = 0.5; g.filter = 'none';
          g.drawImage(lo, 0, sy, cols, sh, dx + 6, sy / rows * H, W, sh / rows * H);
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        }
        g.fillStyle = 'rgba(255,63,164,0.08)'; g.fillRect(0, 0, W, H);
      } else g.drawImage(lo, 0, 0, W, H);
      // scanlines and a bright sweep
      g.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      const sweep = ((t * 0.0009) % 1.3) * H;
      const gr = g.createLinearGradient(0, sweep - 60, 0, sweep); gr.addColorStop(0, 'rgba(102,255,51,0)'); gr.addColorStop(1, 'rgba(102,255,51,0.10)');
      g.fillStyle = gr; g.fillRect(0, sweep - 60, W, 60);
      // the screen tears away in horizontal bands
      if (t > 1700) {
        const k = seg(t, 1700, 2100), bands = 14;
        for (let b = 0; b < bands; b++) {
          const y = b * H / bands, dir = b % 2 ? 1 : -1, off = Math.pow(k, 2 + (b % 3)) * W * 1.2 * dir;
          g.clearRect(off > 0 ? 0 : W + off, y, Math.abs(off), H / bands + 1);
        }
      }
    };
  }

  /* ── JUEGOS · «Circuito»: the letters are pipes that turn into place while the current lights them ── */
  function juegos() {
    const F = {   // 5×7 pixel letters
      J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
      U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
      E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
      G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
      O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
      S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    };
    const word = 'JUEGOS', gw = word.length * 6 - 1, gh = 7;
    const S = Math.floor(Math.min(W * 0.84 / gw, H * 0.5 / gh)), ox = Math.round((W - gw * S) / 2), oy = Math.round((H - gh * S) / 2);
    const on = new Set();
    [...word].forEach((ch, li) => F[ch].forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') on.add(`${li * 6 + x},${y}`); })));
    const tiles = [];
    // letter tiles: pipes towards the neighbouring letter pixels; around them, dim random pieces
    const bx0 = Math.floor(-ox / S) - 1, by0 = Math.floor(-oy / S) - 1, bx1 = Math.ceil((W - ox) / S), by1 = Math.ceil((H - oy) / S);
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const isOn = on.has(`${x},${y}`);
      let m = 0;
      if (isOn) { if (on.has(`${x},${y - 1}`)) m |= 1; if (on.has(`${x + 1},${y}`)) m |= 2; if (on.has(`${x},${y + 1}`)) m |= 4; if (on.has(`${x - 1},${y}`)) m |= 8; if (!m) m = 2; }
      else { if (Math.random() < 0.55) continue; m = [3, 5, 6, 10, 9, 12, 7, 1][Math.floor(Math.random() * 8)]; }
      tiles.push({ x, y, m, on: isOn, turns: 1 + Math.floor(Math.random() * 3), delay: isOn ? 150 + (x - 0) / gw * 900 + Math.random() * 120 : Math.random() * 1400, spin: Math.random() < 0.5 ? 1 : -1 });
    }
    return t => {
      g.fillStyle = BG; g.fillRect(0, 0, W, H);
      const out = seg(t, 1850, 2300);
      for (const p of tiles) {
        const cx = ox + (p.x + 0.5) * S, cy = oy + (p.y + 0.5) * S;
        const k = seg(t, p.delay, p.delay + 380);
        const ang = p.on ? (1 - k) * p.turns * Math.PI / 2 * p.spin : Math.sin(t * 0.002 + p.x) * 0.2 + p.turns * Math.PI / 2;
        const lit = p.on && k >= 1;
        g.save(); g.translate(cx, cy + (p.on ? 0 : out * (p.y - by0) * 4)); g.rotate(ang);
        const sc = p.on ? 1 - out * 0.15 : 1; g.scale(sc, sc);
        g.globalAlpha = p.on ? 1 - out : (0.5 - out * 0.5) * (0.3 + 0.7 * seg(t, 0, 300));
        g.fillStyle = p.on ? '#0b0b14' : '#08080f'; g.fillRect(-S / 2 + 1, -S / 2 + 1, S - 2, S - 2);
        g.strokeStyle = lit ? G : p.on ? '#2b5a37' : '#16261c'; g.lineWidth = S * (p.on ? 0.26 : 0.16); g.lineCap = 'round';
        if (lit) { g.shadowColor = G; g.shadowBlur = 16; }
        g.beginPath();
        [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]].forEach(([dx, dy, bit]) => { if (p.m & bit) { g.moveTo(0, 0); g.lineTo(dx * S / 2, dy * S / 2); } });
        g.stroke(); g.restore();
      }
      // the current: a bright spark running over the word
      const run = seg(t, 150, 1250);
      if (run > 0 && run < 1) {
        const sx = ox + run * gw * S, gr = g.createRadialGradient(sx, H / 2, 0, sx, H / 2, S * 3);
        gr.addColorStop(0, 'rgba(102,255,51,0.35)'); gr.addColorStop(1, 'rgba(102,255,51,0)');
        g.fillStyle = gr; g.fillRect(sx - S * 3, H / 2 - S * 3, S * 6, S * 6);
      }
      // tagline
      const ta = seg(t, 1250, 1500) * (1 - out);
      if (ta > 0) {
        g.globalAlpha = ta; g.fillStyle = CY; g.font = FONT(Math.max(11, S * 0.42)); g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText('ENTRENÁ LA CABEZA', W / 2, oy + gh * S + S * 0.9); g.globalAlpha = 1;
      }
      if (t > 1250 && t < 1400) { g.fillStyle = `rgba(102,255,51,${0.12 * (1 - seg(t, 1250, 1400))})`; g.fillRect(0, 0, W, H); }
    };
  }

  /* ── NODRUS · «Arranque»: nodes appear, cables connect, the signal reaches Output and floods the screen ── */
  function nodrus() {
    const CAT = ['#b33b3b', '#3b6ab3', '#6a3bb3', '#b3973b', '#3b9a8a', '#c0457a'];
    const NAMES = [['Tiempo', 'Audio', 'Coordenadas'], ['Ruido', 'Ondas', 'Celdas'], ['Caleidoscopio', 'Distorsión'], ['Paleta', 'Feedback']];
    const cols = NAMES.length + 1, nw = Math.min(150, W / (cols + 1.2)), nh = nw * 0.46;
    const nodes = [];
    NAMES.forEach((list, c) => list.forEach((name, r) => {
      const x = (W - nw) * (0.06 + c * 0.84 / (cols - 1)), y = H / 2 + (r - (list.length - 1) / 2) * nh * 1.9 + (Math.random() - 0.5) * nh * 0.4;
      nodes.push({ name, x, y, col: CAT[(c * 2 + r) % CAT.length], c, at: 120 + c * 230 + r * 70 });
    }));
    const outNode = { name: 'Salida', x: (W - nw) * 0.9, y: H / 2 - nh / 2, col: '#4a4a55', c: cols - 1, at: 120 + (cols - 1) * 230, out: true };
    nodes.push(outNode);
    const links = [];
    for (const n of nodes) {
      if (n.c === 0) continue;
      const prev = nodes.filter(m => m.c === n.c - 1);
      const pick = prev.sort(() => Math.random() - 0.5).slice(0, n.out ? 2 : 1 + (Math.random() < 0.5));
      pick.forEach(p => links.push({ a: p, b: n, at: Math.max(p.at, n.at) + 120 }));
    }
    const pt = (a, b, k) => {   // point on the cable (cubic bezier)
      const x0 = a.x + nw, y0 = a.y + nh * 0.62, x3 = b.x, y3 = b.y + nh * 0.62, dx = Math.max(40, (x3 - x0) * 0.5);
      const u = 1 - k; return [u * u * u * x0 + 3 * u * u * k * (x0 + dx) + 3 * u * k * k * (x3 - dx) + k * k * k * x3, u * u * u * y0 + 3 * u * u * k * y0 + 3 * u * k * k * y3 + k * k * k * y3];
    };
    const FLOOD = 1750;
    return t => {
      g.fillStyle = BG; g.fillRect(0, 0, W, H);
      // a faint grid, like the editor
      g.strokeStyle = 'rgba(0,212,255,0.05)'; g.lineWidth = 1; g.beginPath();
      for (let x = (t * 0.01) % 32; x < W; x += 32) { g.moveTo(x, 0); g.lineTo(x, H); }
      for (let y = 0; y < H; y += 32) { g.moveTo(0, y); g.lineTo(W, y); }
      g.stroke();
      // cables grow, then pulses travel along them
      for (const l of links) {
        const k = seg(t, l.at, l.at + 260); if (k <= 0) continue;
        g.strokeStyle = 'rgba(102,255,51,0.55)'; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i <= 24; i++) { const [x, y] = pt(l.a, l.b, k * i / 24); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
        if (k >= 1) for (let j = 0; j < 2; j++) {
          const ph = ((t - l.at) * 0.0012 + j * 0.5) % 1, [x, y] = pt(l.a, l.b, ph);
          g.fillStyle = j ? CY : G; g.shadowColor = g.fillStyle; g.shadowBlur = 10; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.shadowBlur = 0;
        }
      }
      // nodes pop in
      for (const n of nodes) {
        const k = seg(t, n.at, n.at + 220); if (k <= 0) continue;
        const s = 0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.08;
        g.save(); g.translate(n.x + nw / 2, n.y + nh / 2); g.scale(s, s); g.globalAlpha = k;
        g.fillStyle = '#12121c'; g.strokeStyle = n.out && t > FLOOD - 300 ? G : 'rgba(0,212,255,0.25)'; g.lineWidth = n.out && t > FLOOD - 300 ? 2 : 1;
        rr(-nw / 2, -nh / 2, nw, nh, 7); g.fill(); g.stroke();
        g.fillStyle = n.col; rr(-nw / 2, -nh / 2, nw, nh * 0.36, 7, true); g.fill();
        g.fillStyle = '#fff'; g.font = FONT(Math.max(9, nh * 0.2)); g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(n.name, -nw / 2 + 8, -nh / 2 + nh * 0.18);
        g.fillStyle = 'rgba(208,239,255,0.25)'; g.fillRect(-nw / 2 + 8, nh * 0.08, nw * 0.6, 3); g.fillRect(-nw / 2 + 8, nh * 0.24, nw * 0.4, 3);
        g.fillStyle = G; g.beginPath(); g.arc(nw / 2, nh * 0.12, 3.5, 0, 7); g.fill();
        g.restore();
      }
      // title types itself
      const typed = 'NODRUS'.slice(0, Math.floor(seg(t, 200, 900) * 6.99));
      g.globalAlpha = 1 - seg(t, FLOOD, FLOOD + 300);
      g.fillStyle = G; g.font = FONT(Math.min(W / 10, 64)); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = G; g.shadowBlur = 18;
      g.fillText(typed + (Math.floor(t / 260) % 2 ? '▌' : ' '), W / 2, H * 0.16);
      g.shadowBlur = 0; g.globalAlpha = 1;
      // the output floods the screen with a plasma, then the editor appears behind
      if (t > FLOOD) {
        const k = seg(t, FLOOD, DUR), cx = outNode.x + nw / 2, cy = outNode.y + nh / 2, R = Math.hypot(W, H) * k;
        g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
        const step = 26;
        for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
          const v = Math.sin(x * 0.012 + t * 0.004) + Math.sin(y * 0.017 - t * 0.003) + Math.sin((x + y) * 0.008 + t * 0.002);
          const h = (v + 3) / 6;
          g.fillStyle = `hsl(${(110 + h * 220) % 360}, 90%, ${18 + h * 40}%)`; g.fillRect(x, y, step + 1, step + 1);
        }
        g.restore();
      }
    };
    function rr(x, y, w, h, r, topOnly) {
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      if (topOnly) { g.lineTo(x + w, y + h); g.lineTo(x, y + h); } else { g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); }
      g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }
  }

  const frame = ({ home, juegos, nodrus }[mode] || home)();
  (function loop(now) {
    const t = now - t0;
    try { frame(t); } catch (e) { window.__splashError = String(e && e.stack || e); end(); return; }
    if (t >= DUR) { end(); return; }
    raf = requestAnimationFrame(loop);
  })(performance.now());
  // if the tab starts hidden, rAF does not run: don't keep the page covered
  setTimeout(() => { if (performance.now() - t0 > DUR + 400) end(); }, DUR + 500);
})();
