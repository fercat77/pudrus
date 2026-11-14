/* NODRUS · Luces (DMX): PARs, barras, strobos y cabezales beam que siguen a la visual y a la música.
   The panel, the simulator and the DMX frame live here; the editor only calls frame / strobe / scene / drop.
   Output: Art-Net through the desktop app (a node such as WIDMX). In the browser: the simulator only.
   Nothing runs while the lights are off and the panel is closed. */
(function () {
  const STORE = 'pudrus_nodes_dmx_v1';
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── channel types and the generic profiles (editable: every light's manual has its own table) ── */
  const CH = {
    dim: 'Dimmer (intensidad)', r: 'Rojo', g: 'Verde', b: 'Azul', w: 'Blanco', a: 'Ámbar', uv: 'UV',
    strobe: 'Strobo / obturador', pan: 'Pan', panF: 'Pan fino', tilt: 'Tilt', tiltF: 'Tilt fino',
    wheel: 'Rueda de color', gobo: 'Gobo', prism: 'Prisma', speed: 'Velocidad de movimiento (fijo)', focus: 'Foco (fijo)', fix: 'Valor fijo',
  };
  const FIXED = ['speed', 'focus', 'fix'];   // channels that just hold the value you write
  const WHEEL7 = [[0, '#ffffff'], [10, '#ff1a1a'], [20, '#ff8c00'], [30, '#ffe600'], [40, '#1aff3c'], [50, '#00c8ff'], [60, '#1a3cff'], [70, '#ff2adf']];
  const PROFILES = {
    par3: { name: 'PAR RGB (3 canales)', kind: 'par', ch: [{ t: 'r' }, { t: 'g' }, { t: 'b' }] },
    par4: { name: 'PAR RGBW (4 canales)', kind: 'par', ch: [{ t: 'r' }, { t: 'g' }, { t: 'b' }, { t: 'w' }] },
    par7: { name: 'PAR RGB (7 canales)', kind: 'par', ch: [{ t: 'dim' }, { t: 'r' }, { t: 'g' }, { t: 'b' }, { t: 'strobe' }, { t: 'fix', v: 0 }, { t: 'fix', v: 0 }], strobe: { off: 0, min: 10, max: 255 } },
    par8: { name: 'PAR RGBW (8 canales)', kind: 'par', ch: [{ t: 'dim' }, { t: 'r' }, { t: 'g' }, { t: 'b' }, { t: 'w' }, { t: 'strobe' }, { t: 'fix', v: 0 }, { t: 'fix', v: 0 }], strobe: { off: 0, min: 10, max: 255 } },
    bar3: { name: 'Barra LED RGB (3 canales)', kind: 'par', ch: [{ t: 'r' }, { t: 'g' }, { t: 'b' }] },
    dim1: { name: 'Dimmer / lámpara (1 canal)', kind: 'par', ch: [{ t: 'dim' }], mono: true },
    strobe2: { name: 'Strobo (2 canales)', kind: 'strobe', ch: [{ t: 'dim' }, { t: 'strobe' }], strobe: { off: 0, min: 10, max: 255 } },
    beam16: {
      name: 'Beam 7R genérico (16 canales)', kind: 'head',
      ch: [{ t: 'wheel' }, { t: 'strobe' }, { t: 'dim' }, { t: 'gobo' }, { t: 'prism' }, { t: 'fix', v: 0 }, { t: 'fix', v: 0 }, { t: 'focus', v: 128 },
        { t: 'pan' }, { t: 'panF' }, { t: 'tilt' }, { t: 'tiltF' }, { t: 'speed', v: 0 }, { t: 'fix', v: 0 }, { t: 'fix', v: 0 }, { t: 'fix', v: 0 }],
      wheel: WHEEL7.map(([v, c]) => ({ v, c })), gobos: [0, 8, 16, 24, 32, 40, 48, 56], prism: { off: 0, on: 128 }, strobe: { off: 5, min: 10, max: 200 }, panDeg: 540, tiltDeg: 270,
    },
    head8: {
      name: 'Cabezal simple (8 canales)', kind: 'head',
      ch: [{ t: 'pan' }, { t: 'tilt' }, { t: 'speed', v: 0 }, { t: 'wheel' }, { t: 'gobo' }, { t: 'strobe' }, { t: 'dim' }, { t: 'fix', v: 0 }],
      wheel: WHEEL7.map(([v, c]) => ({ v, c })), gobos: [0, 8, 16, 24, 32, 40, 48, 56], strobe: { off: 0, min: 10, max: 255 }, panDeg: 540, tiltDeg: 270,
    },
  };
  const DEF_LOOK = {
    color: 'visual', fixed: '#ff2adf', cycle: 4,          // the color: from the visual (each light its zone of the screen), fixed, or a palette on the beat
    dim: 'pulse', base: 0.15, react: 0.6, rate: 1,      // intensity: pattern, floor, how much the bass moves it, beats per step
    move: 'circle', beats: 8, size: 0.5, spread: 0.5, mirror: true, cx: 0.5, cy: 0.35,   // the heads
    gobo: 0, prism: 'drop', headColor: 'visual',
  };
  const DEF = {
    v: 1, on: false, open: false, tab: 'stage', master: 1,
    net: { host: '', universe: 0 },
    profiles: {}, fixtures: [], look: clone(DEF_LOOK), looks: {},
    safe: { strobeHz: 8, tiltMin: 0.15, tiltMax: 0.6, follow: true, drops: true },
    win: null,
  };
  const PALETTE = ['#ff1a5e', '#00d4ff', '#66ff33', '#ffd23f', '#ff2adf', '#1a3cff'];

  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { s = null; }
    s = s && typeof s === 'object' ? s : {};
    const out = { ...clone(DEF), ...s };
    out.net = { ...DEF.net, ...(s.net || {}) }; out.safe = { ...DEF.safe, ...(s.safe || {}) };
    out.look = { ...DEF_LOOK, ...(s.look || {}) };
    out.looks = s.looks && typeof s.looks === 'object' ? s.looks : {};
    out.fixtures = Array.isArray(s.fixtures) ? s.fixtures.filter(f => f && typeof f === 'object') : [];
    out.profiles = { ...clone(PROFILES), ...(s.profiles || {}) };
    if (!out.fixtures.length && !s.v) out.fixtures = demoRig();
    return out;
  }
  function demoRig() {   // what you'd start with: 4 PARs and 2 beams (the simulator shows them; change them in Patch)
    return [
      { id: 1, name: 'PAR 1', p: 'par7', addr: 1, x: 0.12 }, { id: 2, name: 'Beam 1', p: 'beam16', addr: 29, x: 0.3 },
      { id: 3, name: 'PAR 2', p: 'par7', addr: 8, x: 0.42 }, { id: 4, name: 'PAR 3', p: 'par7', addr: 15, x: 0.58 },
      { id: 5, name: 'Beam 2', p: 'beam16', addr: 45, x: 0.7 }, { id: 6, name: 'PAR 4', p: 'par7', addr: 22, x: 0.88 },
    ];
  }

  window.NodrusDMX = function (api) {
    const DESK = api.desk && api.desk.dmx ? api.desk : null;
    const S = load();
    let saveT = 0;
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* full */ } }, 250); };
    const prof = f => S.profiles[f.p] || PROFILES.par3;
    const span = f => prof(f).ch.length;

    /* ── live state ── */
    const buf = new Uint8Array(512);
    const live = new Map();   // fixture id → { r,g,b, i, pan, tilt, wheel, gobo, prism, strobe }
    let strobeOn = false, strobeT0 = 0, blackout = false;
    let drop = null;          // { t0, cut, dur } in performance.now() ms
    let wheelBeat = -1;
    let sentAt = 0, sent = 0, sentRate = 0, rateT = performance.now(), nodes = [], netErr = '';
    const zones = document.createElement('canvas'); zones.width = 32; zones.height = 18;
    const zctx = zones.getContext('2d', { willReadFrequently: true });
    let zdata = null, zoneAt = 0;

    /* ── the look of each light this frame ── */
    function hexRgb(h) { const n = parseInt(String(h).replace('#', ''), 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
    function zoneColor(x) {   // the visual under this light (its column of the screen), saturated a bit
      if (!zdata) return null;
      const W = zones.width, H = zones.height, cx = Math.round(clamp(x) * (W - 1));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < H; y++) for (let dx = -2; dx <= 2; dx++) {
        const xx = cx + dx; if (xx < 0 || xx >= W) continue;
        const k = (y * W + xx) * 4; r += zdata[k]; g += zdata[k + 1]; b += zdata[k + 2]; n++;
      }
      r /= n * 255; g /= n * 255; b /= n * 255;
      const m = Math.max(r, g, b); if (m < 0.03) return null;
      let c = [r / m, g / m, b / m];
      const gray = (c[0] + c[1] + c[2]) / 3;
      c = c.map(v => clamp(gray + (v - gray) * 1.5));
      return c;
    }
    const hash = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
    function compute(now, beat, bands) {
      const L = S.look, list = S.fixtures, n = list.length || 1;
      const bass = clamp((bands[1] || 0) * 1.35);
      const step = beat / Math.max(0.25, L.rate);
      // the drop of SYNDRUS: the build gets faster and brighter, the cut is black, the one is a white hit
      let dropK = 0, dropCut = false, dropHit = 0;
      if (drop && S.safe.drops) {
        const t = now - drop.t0;
        if (t < drop.cut) dropK = clamp(t / drop.cut);
        else if (t < drop.dur) dropCut = true;
        else if (t < drop.dur + 220) dropHit = 1;
        else if (t > drop.dur + 60000 / Math.max(40, api.bpm()) * 8) drop = null;
      }
      const prismNow = L.prism === 'on' || (L.prism === 'drop' && drop && now - drop.t0 > drop.dur && now - drop.t0 < drop.dur + 60000 / Math.max(40, api.bpm()) * 8);
      // strobe: never faster than the safety limit, in software (the same for every light)
      const hz = clamp(S.safe.strobeHz, 1, 15), per = 1000 / hz;
      const strobing = strobeOn;
      const flashOn = strobing && ((now - strobeT0) % per) < per * 0.4;
      const veil = api.veil(), black = S.safe.follow ? clamp(veil.black) : 0;
      // the heads change wheel color on the beat only (a wheel spinning all the time looks broken)
      const newBeat = Math.floor(beat) !== wheelBeat; if (newBeat) wheelBeat = Math.floor(beat);
      list.forEach((f, i) => {
        const P = prof(f), st = live.get(f.id) || {}; live.set(f.id, st);
        // color
        let c;
        if (L.color === 'fixed') c = hexRgb(L.fixed);
        else if (L.color === 'cycle') c = hexRgb(PALETTE[(Math.floor(beat / Math.max(1, L.cycle)) ) % PALETTE.length]);
        else c = zoneColor(f.x) || st.c || [1, 1, 1];
        st.c = c;
        // intensity pattern 0…1
        let p = 1;
        const fr = step - Math.floor(step), s0 = Math.floor(step);
        if (L.dim === 'pulse') p = Math.exp(-fr * 4);
        else if (L.dim === 'chase') p = (s0 % n) === i ? 1 : 0;
        else if (L.dim === 'alt') p = ((s0 + i) % 2) ? 1 : 0;
        else if (L.dim === 'wave') p = 0.5 + 0.5 * Math.cos(2 * Math.PI * (step / Math.max(2, n) - i / n));
        else if (L.dim === 'random') p = hash(i, s0) > 0.5 ? Math.exp(-fr * 3) : 0;
        if (dropK) { p = Math.max(p, dropK * 0.8); }
        let I = L.base + (1 - L.base) * p * (1 - L.react + L.react * bass);
        if (P.kind === 'strobe') I = 0;                       // a strobe only fires on flashes
        if (strobing) { I = flashOn ? 1 : 0; c = [1, 1, 1]; }
        if (dropHit) { I = 1; c = [1, 1, 1]; }                 // the one after the drop: one white hit
        if (dropCut || blackout) I = 0;
        I *= (1 - black) * clamp(S.master);
        if (solo) { if (now > solo.until) solo = null; else if (solo.id === f.id) { I = 1; c = [1, 1, 1]; } else I = 0; }
        st.i = clamp(I); st.rgb = c;
        // heads: movement, wheel, gobo, prism
        if (P.kind === 'head') {
          const ph = 2 * Math.PI * (beat / Math.max(1, L.beats) + L.spread * i / n);
          const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0, mir = L.mirror && (i % 2) ? -1 : 1, s = L.size;
          let x = 0, y = 0;
          if (L.move === 'circle') { x = Math.cos(ph) * 0.12; y = Math.sin(ph) * 0.12; }
          else if (L.move === 'eight') { x = Math.sin(ph) * 0.14; y = Math.sin(ph * 2) * 0.07; }
          else if (L.move === 'sweep') { x = Math.sin(ph) * 0.16; }
          else if (L.move === 'nod') { y = Math.sin(ph) * 0.14; }
          else if (L.move === 'fan') { x = u * 0.12 * (0.5 + 0.5 * Math.sin(ph)); }
          else if (L.move === 'ballyhoo') { x = (Math.sin(ph * 1.3 + i * 2.1) + Math.sin(ph * 0.7 + i)) * 0.08; y = (Math.sin(ph * 1.7 + i * 1.3) + Math.cos(ph * 0.9 + i * 0.4)) * 0.07; }
          else if (L.move === 'still') { x = u * 0.06 * s; }
          st.pan = clamp(L.cx + x * s * 2 * mir);
          st.tilt = clamp(L.cy + y * s * 2, S.safe.tiltMin, S.safe.tiltMax);
          if (P.wheel && P.wheel.length && (newBeat || st.wheel == null || strobing || dropHit)) {
            const want = strobing || dropHit ? [1, 1, 1] : (L.headColor === 'white' ? [1, 1, 1] : c);
            let best = 0, bd = 1e9;
            P.wheel.forEach((w, k) => { const wc = hexRgb(w.c); const d = (wc[0] - want[0]) ** 2 + (wc[1] - want[1]) ** 2 + (wc[2] - want[2]) ** 2; if (d < bd) { bd = d; best = k; } });
            st.wheel = best;
          }
          const gobos = P.gobos || [];
          st.gobo = L.gobo === 'cycle' ? (gobos.length > 1 ? 1 + Math.floor(beat / 4) % (gobos.length - 1) : 0) : clamp(L.gobo | 0, 0, Math.max(0, gobos.length - 1));
          st.prism = !!prismNow;
        }
      });
    }
    // the 512 channels from the live state
    function fill() {
      buf.fill(0);
      S.fixtures.forEach(f => {
        const P = prof(f), st = live.get(f.id); if (!st) return;
        const a0 = (f.addr | 0) - 1; if (a0 < 0) return;
        const hasDim = P.ch.some(c => c.t === 'dim');
        const [r, g, b] = st.rgb || [1, 1, 1];
        const w = Math.min(r, g, b), hasW = P.ch.some(c => c.t === 'w');
        const k = hasDim ? 1 : st.i;   // without a dimmer channel the color carries the intensity
        const pan16 = Math.round((f.invPan ? 1 - (st.pan ?? 0.5) : (st.pan ?? 0.5)) * 65535), tilt16 = Math.round((f.invTilt ? 1 - (st.tilt ?? 0.5) : (st.tilt ?? 0.5)) * 65535);
        P.ch.forEach((c, j) => {
          const ad = a0 + j; if (ad > 511) return;
          let v = 0;
          switch (c.t) {
            case 'dim': v = P.kind === 'strobe' ? (strobeOn ? 255 : 0) : st.i * 255; if (P.mono) v = st.i * 255; break;
            case 'r': v = (hasW ? r - w : r) * k * 255; break;
            case 'g': v = (hasW ? g - w : g) * k * 255; break;
            case 'b': v = (hasW ? b - w : b) * k * 255; break;
            case 'w': v = w * k * 255; break;
            case 'a': v = Math.min(r, g) * 0.5 * k * 255; break;
            case 'uv': v = 0; break;
            case 'strobe': {
              const sp = P.strobe || { off: 0, min: 10, max: 255 };
              if (P.kind === 'strobe' && strobeOn) v = sp.min + (sp.max - sp.min) * clamp((S.safe.strobeHz - 1) / 24); else v = sp.off;
              break;
            }
            case 'pan': v = pan16 >> 8; break;
            case 'panF': v = pan16 & 255; break;
            case 'tilt': v = tilt16 >> 8; break;
            case 'tiltF': v = tilt16 & 255; break;
            case 'wheel': v = P.wheel && P.wheel[st.wheel | 0] ? P.wheel[st.wheel | 0].v : 0; break;
            case 'gobo': v = (P.gobos || [0])[st.gobo | 0] || 0; break;
            case 'prism': v = st.prism ? (P.prism || { on: 128 }).on : (P.prism || { off: 0 }).off; break;
            default: v = Number.isFinite(c.v) ? c.v : 0;
          }
          buf[ad] = clamp(Math.round(v), 0, 255);
        });
      });
    }

    /* ── every frame (from the editor's loop, right after the stage rendered) ── */
    let lastFrame = 0, lastBands = [0, 0, 0, 0];
    function frame(now, bands) {
      const active = S.on || (panel && !panel.hidden);
      if (!active || !S.fixtures.length) return;
      lastFrame = performance.now(); if (bands) lastBands = bands;
      if (S.look.color === 'visual' && now - zoneAt > 33) {   // the screen, small, ~30 times a second
        zoneAt = now;
        try { const cv = api.canvas(); if (cv && cv.width) { zctx.drawImage(cv, 0, 0, zones.width, zones.height); zdata = zctx.getImageData(0, 0, zones.width, zones.height).data; } } catch (e) { zdata = null; }
      }
      compute(now, api.beat(), bands || [0, 0, 0, 0]);
      fill();
      if (S.on && DESK && now - sentAt >= 24) { sentAt = now; DESK.dmx.send(buf.slice(0, maxAddr())); sent++; }
      if (now - rateT > 1000) { sentRate = sent * 1000 / (now - rateT); sent = 0; rateT = now; if (panel && !panel.hidden) paintStatus(); }
      if (panel && !panel.hidden && S.tab === 'stage') drawSim(now);
    }
    // the window minimized or hidden (no frames to draw): the lights keep going on their own clock, without the screen colors
    setInterval(() => {
      const now = performance.now();
      if (!S.on || !DESK || !S.fixtures.length || now - lastFrame < 100) return;
      compute(now, api.beat(), lastBands); fill();
      if (now - sentAt >= 24) { sentAt = now; DESK.dmx.send(buf.slice(0, maxAddr())); sent++; }
      if (now - rateT > 1000) { sentRate = sent * 1000 / (now - rateT); sent = 0; rateT = now; if (panel && !panel.hidden) paintStatus(); }
    }, 25);
    const maxAddr = () => { let m = 2; S.fixtures.forEach(f => { m = Math.max(m, (f.addr | 0) - 1 + span(f)); }); return Math.min(512, m + (m & 1)); };

    /* ── what the editor tells us ── */
    function strobe(on) { if (on && !strobeOn) strobeT0 = performance.now(); strobeOn = !!on; }
    function scene(i) { const lk = S.looks[i]; if (lk) { S.look = { ...DEF_LOOK, ...clone(lk) }; save(); if (panel && !panel.hidden) paintTab(); } }
    function dropFx(at, cut, dur) { const t0 = performance.now() + Math.max(0, at || 0); drop = { t0, cut: Math.max(1, cut || 0), dur: Math.max(cut || 0, dur || 0) }; }
    function dropCancel() { drop = null; }

    /* ── output ── */
    async function setOn(on) {
      S.on = !!on; save();
      if (!DESK) { if (on) api.toast('Las luces salen sólo desde la app de escritorio (exe). Acá podés armar todo y verlo en el simulador'); paintAll(); return; }
      if (on) {
        const r = await DESK.dmx.config({ host: S.net.host, universe: S.net.universe | 0, ...(Number.isInteger(S.net.port) ? { port: S.net.port } : {}) });
        if (!r || !r.ok) { netErr = (r && r.error) || 'no se pudo abrir la red'; S.on = false; api.toast('Luces: ' + netErr, true); }
        else { netErr = ''; api.toast(`💡 Luces encendidas · Art-Net universo ${S.net.universe | 0} → ${S.net.host || 'toda la red'}`); }
      } else { buf.fill(0); try { DESK.dmx.send(new Uint8Array(maxAddr())); } catch (e) { /* closed */ } setTimeout(() => DESK.dmx.stop(), 120); }
      paintAll();
    }
    if (DESK) {
      DESK.dmx.onNodes(n => { nodes = n; if (panel && S.tab === 'out') paintTab(); });
      DESK.dmx.onError(e => { netErr = e; if (panel) paintStatus(); });
      if (S.on) setTimeout(() => setOn(true), 500);
    }

    /* ── the panel ── */
    let panel = null, simCv = null, statusEl = null, body = null;
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
    function build() {
      panel = h('div', 'dmx-panel'); panel.hidden = true;
      panel.innerHTML = `
        <div class="dmx-head"><b>💡 LUCES</b><span class="dmx-status"></span><span class="dmx-sp"></span>
          <button class="dmx-b dmx-onb" data-a="on" title="Mandar las luces a la interfaz (Art-Net)">Salida</button>
          <button class="dmx-b dmx-blk" data-a="blackout" title="Apagón: todas las luces a 0 (otra vez: vuelven)">⏻ Apagón</button>
          <button class="dmx-b dmx-str" data-a="strobe" title="Strobo de las luces mientras lo mantenés apretado (también el ✦ Strobe de NODRUS)">✦ Strobo</button>
          <label class="dmx-master" title="Intensidad general de todas las luces">Master <input type="range" min="0" max="1" step="0.01" data-k="master"></label>
          <button class="dmx-b dmx-x" data-a="close" title="Cerrar (L)">✕</button></div>
        <div class="dmx-tabs"><button data-tab="stage">Escenario</button><button data-tab="look">Look</button><button data-tab="patch">Patch</button><button data-tab="out">Salida y seguridad</button></div>
        <div class="dmx-body"></div>`;
      document.body.append(panel);
      statusEl = panel.querySelector('.dmx-status'); body = panel.querySelector('.dmx-body');
      panel.addEventListener('click', e => {
        const a = e.target.closest('[data-a]'), t = e.target.closest('[data-tab]');
        if (t) { S.tab = t.dataset.tab; save(); paintAll(); return; }
        if (!a) return;
        const k = a.dataset.a;
        if (k === 'close') toggle(false);
        else if (k === 'on') setOn(!S.on);
        else if (k === 'blackout') { blackout = !blackout; paintAll(); }
        else act(k, a);
      });
      const sb = panel.querySelector('.dmx-str');
      sb.addEventListener('pointerdown', e => { sb.setPointerCapture(e.pointerId); strobe(true); sb.classList.add('on'); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => sb.addEventListener(t, () => { strobe(false); sb.classList.remove('on'); }));
      panel.addEventListener('input', onInput); panel.addEventListener('change', onInput);
      panel.addEventListener('keydown', e => e.stopPropagation());
      // drag by the head
      const head = panel.querySelector('.dmx-head');
      head.addEventListener('pointerdown', e => {
        if (e.target.closest('button,input,label')) return;
        const r = panel.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top;
        head.setPointerCapture(e.pointerId);
        const mv = ev => { S.win = { x: clamp(ev.clientX - x0, 0, innerWidth - 120), y: clamp(ev.clientY - y0, 0, innerHeight - 60) }; place(); };
        const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); save(); };
        head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
      });
      head.addEventListener('dblclick', () => { S.win = null; place(); save(); });
    }
    function place() {
      if (!panel) return;
      if (S.win) { panel.style.left = clamp(S.win.x, 0, innerWidth - 120) + 'px'; panel.style.top = clamp(S.win.y, 0, innerHeight - 60) + 'px'; panel.style.right = 'auto'; }
      else { panel.style.left = ''; panel.style.top = ''; panel.style.right = ''; }
    }
    function toggle(on) {
      if (!panel) build();
      panel.hidden = on === undefined ? !panel.hidden : !on;
      S.open = !panel.hidden; save();
      if (!panel.hidden) { place(); paintAll(); }
      api.onToggle && api.onToggle(!panel.hidden);
    }
    function paintStatus() {
      if (!statusEl) return;
      const ob = panel.querySelector('.dmx-onb');
      ob.classList.toggle('on', !!S.on); ob.textContent = S.on ? '● Salida' : '○ Salida';
      panel.querySelector('.dmx-blk').classList.toggle('on', blackout);
      statusEl.textContent = !DESK ? 'simulador (la salida es en el exe)'
        : !S.on ? 'salida apagada'
        : netErr ? '⚠ ' + netErr
        : `Art-Net U${S.net.universe | 0} → ${S.net.host || 'toda la red'} · ${Math.round(sentRate)} cuadros/s`;
      statusEl.className = 'dmx-status' + (S.on && DESK && !netErr ? ' ok' : netErr ? ' err' : '');
      const m = panel.querySelector('[data-k="master"]'); if (m && document.activeElement !== m) m.value = S.master;
    }
    function paintAll() {
      if (!panel || panel.hidden) return;
      panel.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
      paintStatus(); paintTab();
    }

    const seg = (key, opts, cur) => `<div class="dmx-seg" data-seg="${key}">${opts.map(([v, l, t]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}"${t ? ` title="${esc(t)}"` : ''}>${l}</button>`).join('')}</div>`;
    const rng = (key, min, max, step, val, label, title) => `<label class="dmx-rng"${title ? ` title="${esc(title)}"` : ''}><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-k="${key}" value="${val}"><i>${fmt(key, val)}</i></label>`;
    function fmt(k, v) {
      if (k === 'look.beats') return `${v} tiempos`;
      if (k === 'look.rate') return v >= 1 ? `cada ${v}` : `${Math.round(1 / v)} por tiempo`;
      if (k === 'safe.strobeHz') return `${v} por segundo`;
      return Math.round(v * 100) + '%';
    }
    const LOOK_COLOR = [['visual', '🎨 De la visual', 'Cada luz toma el color de la parte de la pantalla que tiene arriba (según su lugar en el escenario)'], ['cycle', '🌈 Paleta al ritmo', 'Cambia de color cada tantos tiempos'], ['fixed', '■ Fijo', 'Un solo color']];
    const LOOK_DIM = [['all', 'Parejo', 'Todas a la vez, siguiendo los graves'], ['pulse', 'Pulso', 'Golpe en cada tiempo que se apaga de a poco'], ['chase', 'Persecución', 'De a una, en orden'], ['alt', 'Alternado', 'Pares e impares'], ['wave', 'Ola', 'Una ola que recorre el escenario'], ['random', 'Al azar', 'Algunas, al azar, en cada tiempo']];
    const LOOK_MOVE = [['still', 'Quietos'], ['circle', 'Círculo'], ['eight', 'Ocho'], ['sweep', 'Barrido'], ['nod', 'Arriba-abajo'], ['fan', 'Abanico'], ['ballyhoo', 'Ballyhoo']];
    function paintTab() {
      if (!body) return;
      const L = S.look;
      if (S.tab === 'stage') {
        body.innerHTML = `<canvas class="dmx-sim"></canvas>
          <div class="dmx-quick">
            <div><span>Color</span>${seg('look.color', LOOK_COLOR, L.color)}</div>
            <div><span>Intensidad</span>${seg('look.dim', LOOK_DIM, L.dim)}</div>
            <div><span>Cabezales</span>${seg('look.move', LOOK_MOVE, L.move)}</div>
          </div>
          <p class="dmx-note">${S.fixtures.length ? 'Así se verían tus luces. Cada luz toma el color de la pantalla en su lugar; ✦ Strobe, ■ Negro, las escenas y los drops de SYNDRUS también las mueven.' : 'No hay luces: agregalas en <b>Patch</b>.'}</p>`;
        simCv = body.querySelector('.dmx-sim');
      } else if (S.tab === 'look') {
        const sc = api.scenes();
        body.innerHTML = `
          <div class="dmx-grid">
            <section><h5>Color</h5>${seg('look.color', LOOK_COLOR, L.color)}
              <label class="dmx-row"><span>Color fijo</span><input type="color" data-k="look.fixed" value="${esc(L.fixed)}"></label>
              ${rng('look.cycle', 1, 16, 1, L.cycle, 'Paleta: cambia cada', 'Tiempos entre cada color de la paleta').replace(/<i>.*<\/i>/, `<i>${L.cycle} tiempos</i>`)}
              <h5>Intensidad</h5>${seg('look.dim', LOOK_DIM, L.dim)}
              ${rng('look.base', 0, 1, 0.01, L.base, 'Mínimo', 'Lo más bajo que bajan las luces')}
              ${rng('look.react', 0, 1, 0.01, L.react, 'Sigue los graves', 'Cuánto mueven los graves la intensidad')}
              <div class="dmx-row"><span>Velocidad</span>${seg('look.rate', [[0.25, '¼'], [0.5, '½'], [1, '1'], [2, '2'], [4, '4']], L.rate)}<em>tiempos por paso</em></div>
            </section>
            <section><h5>Cabezales (beams)</h5>${seg('look.move', LOOK_MOVE, L.move)}
              <div class="dmx-row"><span>Una vuelta</span>${seg('look.beats', [[2, '2'], [4, '4'], [8, '8'], [16, '16'], [32, '32']], L.beats)}<em>tiempos</em></div>
              ${rng('look.size', 0, 1, 0.01, L.size, 'Tamaño', 'Qué tan amplio es el movimiento')}
              ${rng('look.spread', 0, 1, 0.01, L.spread, 'Desfase', '0 = todos juntos · 1 = cada uno en otro momento')}
              ${rng('look.cx', 0, 1, 0.01, L.cx, 'Centro pan', 'Hacia dónde apuntan (izquierda-derecha)')}
              ${rng('look.cy', 0, 1, 0.01, L.cy, 'Centro tilt', 'Hacia dónde apuntan (arriba-abajo). Los límites de seguridad mandan')}
              <label class="dmx-chk"><input type="checkbox" data-k="look.mirror"${L.mirror ? ' checked' : ''}> Espejo (uno sí, uno no al revés)</label>
              <div class="dmx-row"><span>Color</span>${seg('look.headColor', [['visual', 'Como el resto'], ['white', 'Blanco']], L.headColor)}</div>
              <div class="dmx-row"><span>Gobo</span>${seg('look.gobo', [[0, 'Abierto'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], ['cycle', 'Cambia']], L.gobo)}</div>
              <div class="dmx-row"><span>Prisma</span>${seg('look.prism', [['off', 'No'], ['drop', 'En el drop'], ['on', 'Siempre']], L.prism)}</div>
            </section>
          </div>
          <h5>Look por escena</h5>
          <p class="dmx-note">Guardá este look en una escena de NODRUS: cuando la escena sale al aire (a mano, por MIDI o desde SETRUS), las luces cambian con ella. Las escenas sin look dejan las luces como están.</p>
          <div class="dmx-scenes">${Array.from({ length: 16 }, (_, i) => `<button data-a="look:${i}" class="${S.looks[i] ? 'has' : ''}${sc[i] ? '' : ' empty'}" title="${sc[i] ? `Escena ${i + 1}: clic = guardar este look · clic derecho = quitarlo` : `Escena ${i + 1} vacía`}" style="${sc[i] && sc[i].thumb ? `background-image:url(${sc[i].thumb})` : ''}"><span>${i + 1}</span>${S.looks[i] ? '<i>💡</i>' : ''}</button>`).join('')}</div>
          <div class="dmx-actions"><button class="dmx-b" data-a="lookReset">Look inicial</button></div>`;
        body.querySelectorAll('.dmx-scenes button').forEach(b => b.addEventListener('contextmenu', e => {
          e.preventDefault(); const i = +b.dataset.a.split(':')[1]; if (S.looks[i]) { delete S.looks[i]; save(); paintTab(); api.toast(`Escena ${i + 1}: sin look de luces`); }
        }));
      } else if (S.tab === 'patch') {
        const used = new Map(); const clash = new Set();
        S.fixtures.forEach(f => { for (let k = 0; k < span(f); k++) { const a = (f.addr | 0) + k; if (used.has(a)) { clash.add(f.id); clash.add(used.get(a)); } used.set(a, f.id); } });
        const popts = cur => Object.entries(S.profiles).map(([k, p]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(p.name)} · ${p.ch.length}</option>`).join('');
        body.innerHTML = `
          <p class="dmx-note">Una fila por luz. La <b>dirección</b> es la que pusiste en el menú de la luz (d001, A001…), y el <b>tipo</b> tiene que coincidir con el modo de canales elegido ahí. El <b>lugar</b> dice dónde está en el escenario: de ahí toma su color de la pantalla.</p>
          <div class="dmx-fix dmx-fixh"><span>Nombre</span><span>Tipo</span><span>Dirección</span><span>Lugar</span><span></span></div>
          ${S.fixtures.map(f => `<div class="dmx-fix${clash.has(f.id) ? ' clash' : ''}" data-id="${f.id}">
            <input class="dmx-in" data-f="name" value="${esc(f.name)}" maxlength="20">
            <select class="dmx-in" data-f="p">${popts(f.p)}</select>
            <span class="dmx-addr"><input class="dmx-in num" type="number" min="1" max="512" data-f="addr" value="${f.addr | 0}"><em>–${(f.addr | 0) + span(f) - 1}</em></span>
            <input type="range" min="0" max="1" step="0.01" data-f="x" value="${f.x}">
            <span class="dmx-fbtn">${prof(f).kind === 'head' ? `<label title="Invertir pan"><input type="checkbox" data-f="invPan"${f.invPan ? ' checked' : ''}>↔</label><label title="Invertir tilt"><input type="checkbox" data-f="invTilt"${f.invTilt ? ' checked' : ''}>↕</label>` : ''}<button class="dmx-b" data-a="test:${f.id}" title="Prender sólo esta luz en blanco 2 segundos (para encontrarla)">◎</button><button class="dmx-b dmx-del" data-a="del:${f.id}" title="Quitar">✕</button></span>
          </div>`).join('')}
          ${clash.size ? '<p class="dmx-note warn">⚠ Hay luces que se pisan las direcciones (en rojo). Tocá «Ordenar direcciones» o corregilas.</p>' : ''}
          <div class="dmx-actions">
            <select class="dmx-in" id="dmxAddP">${popts('par7')}</select><button class="dmx-b" data-a="add">＋ Agregar luz</button>
            <button class="dmx-b" data-a="autoaddr" title="Una después de la otra desde la 1">Ordenar direcciones</button>
            <button class="dmx-b" data-a="editp">✎ Editar tipos de luz</button>
          </div>
          <div class="dmx-pedit" hidden></div>`;
      } else if (S.tab === 'out') {
        body.innerHTML = `
          <div class="dmx-grid">
            <section><h5>Interfaz Art-Net (WiFi o cable)</h5>
              ${DESK ? '' : '<p class="dmx-note warn">La salida a las luces funciona en la <b>app de escritorio</b> (el exe): el navegador no puede hablar Art-Net. Acá armás todo y lo ves en el simulador.</p>'}
              <label class="dmx-row"><span>IP de la interfaz</span><input class="dmx-in" data-k="net.host" value="${esc(S.net.host)}" placeholder="vacío = toda la red"></label>
              <label class="dmx-row"><span>Universo</span><input class="dmx-in num" type="number" min="0" max="32767" data-k="net.universe" value="${S.net.universe | 0}"></label>
              <div class="dmx-actions"><button class="dmx-b" data-a="poll"${DESK ? '' : ' disabled'}>🔍 Buscar interfaces</button><button class="dmx-b" data-a="on">${S.on ? 'Apagar salida' : 'Encender salida'}</button></div>
              <div class="dmx-nodes">${nodes.map(nd => `<button class="dmx-b" data-a="use:${esc(nd.ip)}:${nd.universe | 0}">${esc(nd.name || 'Interfaz')} · ${esc(nd.ip)} · U${nd.universe | 0} — usar</button>`).join('')}</div>
              <p class="dmx-note">Con una interfaz WiFi (como WIDMX): conectá la compu a su red WiFi —o, mejor, configurala para que entre a tu router o al hotspot del celular, así la compu y los celulares de 📱 Control quedan en la misma red—. Después «Buscar interfaces» y «usar». Mandarle a su IP es más estable que a toda la red. El universo tiene que ser el mismo que configuraste en la interfaz (casi siempre 0).</p>
            </section>
            <section><h5>Seguridad</h5>
              ${rng('safe.strobeHz', 1, 15, 1, S.safe.strobeHz, 'Strobo máximo', 'Destellos por segundo como máximo (entre 3 y 30 por segundo pueden afectar a personas fotosensibles: usalo con cuidado y avisá en el lugar)')}
              ${rng('safe.tiltMin', 0, 1, 0.01, S.safe.tiltMin, 'Tilt mínimo', 'Los cabezales nunca bajan de acá')}
              ${rng('safe.tiltMax', 0, 1, 0.01, S.safe.tiltMax, 'Tilt máximo', 'Los cabezales nunca suben de acá')}
              <p class="dmx-note">Probá los límites con los cabezales colgados: que <b>nunca apunten a los ojos del público</b>. Los beams son muy intensos.</p>
              <label class="dmx-chk"><input type="checkbox" data-k="safe.follow"${S.safe.follow ? ' checked' : ''}> Las luces siguen el ■ Negro de la pantalla</label>
              <label class="dmx-chk"><input type="checkbox" data-k="safe.drops"${S.safe.drops ? ' checked' : ''}> El drop de SYNDRUS mueve las luces (subida, corte, golpe)</label>
            </section>
          </div>
          <h5>Canales</h5><div class="dmx-chan"></div>`;
        paintChan();
      }
    }
    function paintChan() {
      const c = body && body.querySelector('.dmx-chan'); if (!c) return;
      const n = maxAddr();
      c.innerHTML = Array.from({ length: n }, (_, i) => `<i title="${i + 1}: ${buf[i]}" style="--v:${buf[i] / 255}"></i>`).join('');
    }
    setInterval(() => { if (panel && !panel.hidden && S.tab === 'out') paintChan(); }, 250);

    function setPath(path, v) {
      const [a, b] = path.split('.');
      if (b === undefined) S[a] = v; else S[a][b] = v;
      save();
    }
    function onInput(e) {
      const t = e.target;
      if (t.dataset.k) {
        let v = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' ? +t.value : t.value;
        if (t.dataset.k === 'net.universe') v = clamp(v | 0, 0, 32767);
        if (t.dataset.k === 'safe.tiltMin') v = Math.min(v, S.safe.tiltMax);
        if (t.dataset.k === 'safe.tiltMax') v = Math.max(v, S.safe.tiltMin);
        setPath(t.dataset.k, v);
        const i = t.parentElement && t.parentElement.querySelector('i'); if (i && t.type === 'range') i.textContent = t.dataset.k === 'look.cycle' ? `${v} tiempos` : fmt(t.dataset.k, v);
        if ((t.dataset.k === 'net.host' || t.dataset.k === 'net.universe') && e.type === 'change' && S.on && DESK) setOn(true);
        if (t.dataset.k === 'master') paintStatus();
        return;
      }
      const row = t.closest('.dmx-fix');
      if (row && t.dataset.f) {
        const f = S.fixtures.find(x => x.id === +row.dataset.id); if (!f) return;
        const k = t.dataset.f;
        f[k] = t.type === 'checkbox' ? t.checked : k === 'addr' ? clamp(+t.value | 0, 1, 512) : k === 'x' ? +t.value : t.value;
        save();
        if (e.type === 'change' && (k === 'p' || k === 'addr')) paintTab();
        return;
      }
      if (t.closest('.dmx-pedit')) profInput(t, e);
    }
    // segmented buttons
    function onSeg(e) {
      const b = e.target.closest('.dmx-seg button'); if (!b) return;
      const key = b.parentElement.dataset.seg, raw = b.dataset.v;
      const v = raw === 'cycle' || isNaN(+raw) ? raw : +raw;
      setPath(key, v);
      b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }
    document.addEventListener('click', e => { if (panel && panel.contains(e.target)) onSeg(e); });

    let nextId = () => S.fixtures.reduce((m, f) => Math.max(m, f.id | 0), 0) + 1;
    function act(k, btn) {
      if (k.startsWith('look:')) {
        const i = +k.split(':')[1]; if (!api.scenes()[i]) { api.toast(`La escena ${i + 1} está vacía: guardala primero en NODRUS`); return; }
        S.looks[i] = clone(S.look); save(); paintTab(); api.toast(`💡 Look guardado en la escena ${i + 1}`);
      } else if (k === 'lookReset') { S.look = clone(DEF_LOOK); save(); paintTab(); }
      else if (k === 'add') {
        const p = body.querySelector('#dmxAddP').value, P = S.profiles[p]; if (!P) return;
        const next = S.fixtures.reduce((m, f) => Math.max(m, (f.addr | 0) + span(f)), 1);
        const same = S.fixtures.filter(f => prof(f).kind === P.kind).length + 1;
        S.fixtures.push({ id: nextId(), name: (P.kind === 'head' ? 'Beam ' : P.kind === 'strobe' ? 'Strobo ' : 'PAR ') + same, p, addr: Math.min(512 - P.ch.length + 1, next), x: S.fixtures.length ? clamp(Math.max(...S.fixtures.map(f => f.x)) + 0.12) : 0.5 });
        save(); paintTab();
      } else if (k.startsWith('del:')) { const id = +k.split(':')[1]; S.fixtures = S.fixtures.filter(f => f.id !== id); live.delete(id); save(); paintTab(); }
      else if (k === 'autoaddr') { let a = 1; [...S.fixtures].sort((x, y) => x.x - y.x).forEach(f => { f.addr = a; a += span(f); }); save(); paintTab(); api.toast('Direcciones ordenadas de izquierda a derecha: ponelas igual en el menú de cada luz'); }
      else if (k.startsWith('test:')) { testFixture(+k.split(':')[1]); }
      else if (k === 'editp') { const pe = body.querySelector('.dmx-pedit'); pe.hidden = !pe.hidden; if (!pe.hidden) paintProfEdit(Object.keys(S.profiles)[0]); }
      else if (k === 'poll') { if (!DESK) return; btn.textContent = '🔍 Buscando…'; DESK.dmx.poll().then(n => { nodes = n || []; paintTab(); if (!nodes.length) api.toast('No encontré interfaces: revisá que la compu esté en la misma red WiFi que la interfaz', true); }); }
      else if (k.startsWith('use:')) { const [, ip, u] = k.split(':'); S.net.host = ip; S.net.universe = +u | 0; save(); setOn(true); paintTab(); }
      else if (k.startsWith('pe:')) profAct(k.slice(3));
    }
    let solo = null;   // { id, until }: only this light, white, still (to find it on the rig)
    function testFixture(id) {
      const f = S.fixtures.find(x => x.id === id); if (!f) return;
      solo = { id, until: performance.now() + 2000 };
      api.toast(`◎ ${f.name}: blanco 2 segundos (canales ${f.addr}–${f.addr + span(f) - 1})`);
    }

    /* ── profile editor: the channel table from the light's manual ── */
    let peKey = null;
    function paintProfEdit(key) {
      peKey = key; const pe = body.querySelector('.dmx-pedit'); if (!pe) return;
      const P = S.profiles[key];
      const tsel = cur => Object.entries(CH).map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${l}</option>`).join('');
      pe.innerHTML = `
        <div class="dmx-row"><span>Tipo</span><select class="dmx-in" data-pe="key">${Object.entries(S.profiles).map(([k, p]) => `<option value="${esc(k)}"${k === key ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <button class="dmx-b" data-a="pe:dup">⧉ Copiar como nuevo</button>${PROFILES[key] ? '' : '<button class="dmx-b dmx-del" data-a="pe:del">✕ Borrar</button>'}</div>
        <div class="dmx-row"><span>Nombre</span><input class="dmx-in" data-pe="name" value="${esc(P.name)}" maxlength="40"></div>
        <div class="dmx-row"><span>Es un</span><select class="dmx-in" data-pe="kind"><option value="par"${P.kind === 'par' ? ' selected' : ''}>PAR / barra / lámpara</option><option value="head"${P.kind === 'head' ? ' selected' : ''}>Cabezal móvil (beam, spot)</option><option value="strobe"${P.kind === 'strobe' ? ' selected' : ''}>Strobo</option></select></div>
        <p class="dmx-note">Copiá la tabla de canales del manual de tu luz, en orden. «Valor fijo» sirve para los canales que no usamos (modo, programas): poné el valor que deja la luz en modo DMX manual, casi siempre 0.</p>
        <div class="dmx-chs">${P.ch.map((c, j) => `<div class="dmx-chr" data-j="${j}"><b>${j + 1}</b><select class="dmx-in" data-pe="t">${tsel(c.t)}</select>${FIXED.includes(c.t) ? `<input class="dmx-in num" type="number" min="0" max="255" data-pe="v" value="${c.v | 0}">` : '<span></span>'}<button class="dmx-b dmx-del" data-a="pe:rm:${j}">✕</button></div>`).join('')}</div>
        <div class="dmx-actions"><button class="dmx-b" data-a="pe:addch">＋ Canal</button></div>
        ${P.ch.some(c => c.t === 'strobe') ? `<div class="dmx-row"><span>Strobo / obturador</span><label>abierto <input class="dmx-in num" type="number" min="0" max="255" data-pe="strobe.off" value="${(P.strobe || {}).off | 0}"></label><label>lento <input class="dmx-in num" type="number" min="0" max="255" data-pe="strobe.min" value="${(P.strobe || {}).min | 0}"></label><label>rápido <input class="dmx-in num" type="number" min="0" max="255" data-pe="strobe.max" value="${(P.strobe || {}).max | 0}"></label></div>` : ''}
        ${P.ch.some(c => c.t === 'prism') ? `<div class="dmx-row"><span>Prisma</span><label>sin <input class="dmx-in num" type="number" min="0" max="255" data-pe="prism.off" value="${(P.prism || {}).off | 0}"></label><label>con <input class="dmx-in num" type="number" min="0" max="255" data-pe="prism.on" value="${(P.prism || {}).on | 0}"></label></div>` : ''}
        ${P.ch.some(c => c.t === 'gobo') ? `<div class="dmx-row"><span>Gobos (valores)</span><input class="dmx-in" data-pe="gobos" value="${(P.gobos || []).join(', ')}" title="El primero es «abierto». Separados por coma"></div>` : ''}
        ${P.ch.some(c => c.t === 'wheel') ? `<div class="dmx-row dmx-wheel"><span>Rueda de color</span><div>${(P.wheel || []).map((w, k) => `<label class="dmx-wh" data-k="${k}"><input type="color" data-pe="wc" value="${esc(w.c)}"><input class="dmx-in num" type="number" min="0" max="255" data-pe="wv" value="${w.v | 0}"></label>`).join('')}<button class="dmx-b" data-a="pe:addw">＋</button><button class="dmx-b" data-a="pe:rmw">−</button></div></div>` : ''}`;
    }
    const ownProfile = () => S.profiles[peKey];   // your copy (saved with the rest); the built-in stays in PROFILES
    function profInput(t, e) {
      const key = t.dataset.pe; if (!key) return;
      if (key === 'key') { if (e.type === 'change') paintProfEdit(t.value); return; }
      const P = ownProfile(); if (!P) return;
      const num = clamp(+t.value | 0, 0, 255);
      if (key === 'name') P.name = t.value || 'Luz';
      else if (key === 'kind') P.kind = t.value;
      else if (key === 't') { P.ch[+t.closest('.dmx-chr').dataset.j].t = t.value; if (e.type === 'change') paintProfEdit(peKey); }
      else if (key === 'v') P.ch[+t.closest('.dmx-chr').dataset.j].v = num;
      else if (key.startsWith('strobe.')) { P.strobe = { off: 0, min: 10, max: 255, ...(P.strobe || {}) }; P.strobe[key.slice(7)] = num; }
      else if (key.startsWith('prism.')) { P.prism = { off: 0, on: 128, ...(P.prism || {}) }; P.prism[key.slice(6)] = num; }
      else if (key === 'gobos') P.gobos = t.value.split(/[,\s]+/).filter(Boolean).map(x => clamp(+x | 0, 0, 255));
      else if (key === 'wc' || key === 'wv') { const k = +t.closest('.dmx-wh').dataset.k; if (key === 'wc') P.wheel[k].c = t.value; else P.wheel[k].v = num; }
      save();
      if (e.type === 'change' && ['kind', 'name'].includes(key)) { const pe = body.querySelector('.dmx-pedit'); paintTabKeep(pe); }
    }
    function paintTabKeep() { paintTab(); const pe = body.querySelector('.dmx-pedit'); if (pe) { pe.hidden = false; paintProfEdit(peKey); } }
    function profAct(k) {
      const P = S.profiles[peKey]; if (!P) return;
      if (k === 'dup') { const nk = 'u' + Date.now().toString(36); S.profiles[nk] = { ...clone(P), name: P.name + ' (mío)' }; peKey = nk; }
      else if (k === 'del') { if (S.fixtures.some(f => f.p === peKey)) { api.toast('Hay luces de este tipo en el patch: cambiales el tipo primero', true); return; } delete S.profiles[peKey]; peKey = Object.keys(S.profiles)[0]; }
      else if (k === 'addch') { if (P.ch.length < 40) P.ch.push({ t: 'fix', v: 0 }); }
      else if (k.startsWith('rm:')) { if (P.ch.length > 1) P.ch.splice(+k.slice(3), 1); }
      else if (k === 'addw') { P.wheel = P.wheel || []; P.wheel.push({ v: Math.min(255, ((P.wheel[P.wheel.length - 1] || { v: 0 }).v | 0) + 10), c: '#ffffff' }); }
      else if (k === 'rmw') { if (P.wheel && P.wheel.length > 1) P.wheel.pop(); }
      save(); paintTabKeep();
    }

    /* ── the simulator: the rig seen from the front, beams to the floor ── */
    function drawSim(now) {
      const cv = simCv; if (!cv || !cv.isConnected) return;
      const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
      if (!W || !H) return;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const c = cv.getContext('2d');
      c.fillStyle = '#040407'; c.fillRect(0, 0, W, H);
      const truss = H * 0.12, floor = H * 0.9;
      // floor glow first, then the cones / beams (additive)
      c.globalCompositeOperation = 'lighter';
      S.fixtures.forEach(f => {
        const st = live.get(f.id); if (!st) return;
        const P = prof(f), x = f.x * W, [r, g, b] = st.rgb || [1, 1, 1], I = st.i || 0;
        if (I < 0.01) return;
        const col = a => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
        if (P.kind === 'head') {
          const want = P.wheel && P.wheel[st.wheel | 0] ? hexRgb(P.wheel[st.wheel | 0].c) : [r, g, b];
          const hc = a => `rgba(${Math.round(want[0] * 255)},${Math.round(want[1] * 255)},${Math.round(want[2] * 255)},${a})`;
          const pd = (P.panDeg || 540) * Math.PI / 180, td = (P.tiltDeg || 270) * Math.PI / 180;
          const pa = ((f.invPan ? 1 - st.pan : st.pan) - 0.5) * pd, ta = ((f.invTilt ? 1 - st.tilt : st.tilt) - 0.5) * td;
          const beams = st.prism ? [-0.12, 0, 0.12] : [0];
          beams.forEach(o => {
            const dx = Math.sin(ta + o) * Math.cos(pa), dy = Math.cos(ta + o), dz = Math.sin(ta + o) * Math.sin(pa);
            const len = dy > 0.05 ? (floor - truss) / dy : H * 1.5;
            const ex = x + dx * len, ey = truss + dy * Math.min(len, H * 2);
            const gr = c.createLinearGradient(x, truss, ex, ey); gr.addColorStop(0, hc(0.95 * I)); gr.addColorStop(1, hc(0.12 * I));
            c.strokeStyle = gr; c.lineWidth = (2.2 + Math.abs(dz) * 2) * dpr;
            c.setLineDash(st.gobo ? [10 * dpr, 6 * dpr] : []);
            c.beginPath(); c.moveTo(x, truss); c.lineTo(ex, ey); c.stroke();
            c.setLineDash([]);
            if (dy > 0.05 && ex > -50 && ex < W + 50) { const sp = c.createRadialGradient(ex, floor, 0, ex, floor, 26 * dpr); sp.addColorStop(0, hc(0.7 * I)); sp.addColorStop(1, hc(0)); c.fillStyle = sp; c.fillRect(ex - 30 * dpr, floor - 30 * dpr, 60 * dpr, 60 * dpr); }
          });
        } else {
          const spread = P.kind === 'strobe' ? 0.5 : 0.17;
          const gr = c.createLinearGradient(0, truss, 0, floor); gr.addColorStop(0, col(0.55 * I)); gr.addColorStop(1, col(0.06 * I));
          c.fillStyle = gr; c.beginPath(); c.moveTo(x - 6 * dpr, truss); c.lineTo(x + 6 * dpr, truss); c.lineTo(x + (floor - truss) * spread, floor); c.lineTo(x - (floor - truss) * spread, floor); c.closePath(); c.fill();
          const sp = c.createRadialGradient(x, floor, 0, x, floor, (floor - truss) * spread * 1.2); sp.addColorStop(0, col(0.45 * I)); sp.addColorStop(1, col(0));
          c.fillStyle = sp; c.fillRect(x - (floor - truss) * spread * 1.3, floor - 40 * dpr, (floor - truss) * spread * 2.6, 80 * dpr);
        }
      });
      c.globalCompositeOperation = 'source-over';
      // the truss and the bodies
      c.fillStyle = '#1b1b26'; c.fillRect(0, truss - 7 * dpr, W, 5 * dpr);
      c.fillStyle = '#2a2a38'; c.fillRect(0, floor, W, H - floor);
      c.font = `${10 * dpr}px "IBM Plex Mono", monospace`; c.textAlign = 'center';
      S.fixtures.forEach(f => {
        const st = live.get(f.id) || {}, P = prof(f), x = f.x * W, [r, g, b] = st.rgb || [1, 1, 1], I = st.i || 0;
        c.fillStyle = '#333344';
        if (P.kind === 'head') { c.fillRect(x - 9 * dpr, truss - 3 * dpr, 18 * dpr, 12 * dpr); }
        else c.fillRect(x - 8 * dpr, truss - 3 * dpr, 16 * dpr, 9 * dpr);
        c.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${0.25 + 0.75 * I})`;
        c.beginPath(); c.arc(x, truss + 5 * dpr, 4 * dpr, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(208,239,255,0.55)'; c.fillText(f.name, x, H - 6 * dpr);
      });
      if (blackout) { c.fillStyle = '#ff3355'; c.textAlign = 'left'; c.fillText('APAGÓN', 8 * dpr, 16 * dpr); }
    }

    addEventListener('resize', () => { if (panel && !panel.hidden) place(); });
    if (S.open) setTimeout(() => toggle(true), 0);

    const ctl = { frame, strobe, scene, drop: dropFx, dropCancel, toggle, get open() { return !!panel && !panel.hidden; } };
    window.__dmx = { S, buf, live, ctl, act, setOn, PROFILES, get rate() { return sentRate; } };
    return ctl;
  };
})();
