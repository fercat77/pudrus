/* NODRUS táctil — the same node engine as the desktop editor, built as a chain of cards:
   Coordenadas → Generar → Color → (Segunda capa, mezclada) → Efectos de color → Efectos → Salida.
   Internally it is a normal node graph, so it opens in the full editor ("Abrir en la compu"). */
(function () {
  const N = window.PudrusNodes, G = window.PudrusGenerate;
  const $ = s => document.getElementById(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const rnd = Math.random, pick = a => a[Math.floor(rnd() * a.length)];
  try { localStorage.removeItem('nodrus_pc'); } catch (e) { /* ignore */ }

  /* ── What each slot can hold, and plain-words explanations (to learn the full editor) ── */
  const SLOTS = {
    coords: { label: 'Coordenadas', hint: 'deforman el espacio antes de dibujar', cat: 'var(--c-uv)', types: ['kaleido', 'polar', 'mirror', 'tile', 'warp', 'swirl', 'pixelate', 'glitch'] },
    gen: { label: 'Generar', hint: 'el dibujo base', cat: 'var(--c-gen)', types: ['pattern', 'noise', 'voronoi', 'stripes', 'waves', 'shape', 'checker', 'gradient', 'scene3d', 'text', 'camera'] },
    color: { label: 'Color', hint: 'convierte el dibujo en colores', cat: 'var(--c-col)', types: ['palette', 'ramp', 'none'] },
    layer: { label: 'Segunda capa', hint: 'otro dibujo, mezclado con el primero', cat: 'var(--c-gen)', types: ['pattern', 'noise', 'voronoi', 'stripes', 'waves', 'shape', 'checker', 'gradient', 'scene3d'] },
    lcolor: { label: 'Color de la segunda capa', hint: '', cat: 'var(--c-col)', types: ['palette', 'ramp', 'none'] },
    mix: { label: 'Mezcla', hint: '', cat: 'var(--c-col)', types: ['mix'] },
    cfx: { label: 'Efectos de color', hint: 'retocan los colores', cat: 'var(--c-col)', types: ['adjust', 'posterize', 'invert'] },
    fx: { label: 'Efectos', hint: 'estelas y memoria', cat: 'var(--c-fx)', types: ['feedback'] },
    out: { label: 'Salida', hint: 'el final: brillo, glitch, viñeta…', cat: 'var(--c-out)', types: ['output'] },
  };
  const DESC = {
    transform: 'Mueve, agranda y gira el dibujo. Acá lo manejás con los dedos sobre el visual: arrastrar, pellizcar y girar.',
    kaleido: 'Espejo en porciones, como un caleidoscopio. «Segmentos» = cuántas porciones.',
    polar: 'Enrolla el dibujo en círculos: lo recto se vuelve radial. Con Rayas hace túneles.',
    mirror: 'Refleja la imagen en espejo, izquierda contra derecha.',
    tile: 'Repite el dibujo en una grilla. «Cantidad» = cuántas veces.',
    warp: 'Ondula el espacio con ruido, como agua o humo.',
    swirl: 'Retuerce desde el centro, como un remolino.',
    pixelate: 'Agranda los píxeles: estética de videojuego viejo.',
    glitch: 'Corta en franjas que saltan de costado, como una señal rota.',
    noise: 'Nubes suaves y orgánicas (ruido fractal). «Detalle» suma capas finas.',
    voronoi: 'Celdas como burbujas o piel de reptil.',
    stripes: 'Rayas que se mueven. «Dureza» las vuelve nítidas.',
    waves: 'Ondas en anillos, líneas o interferencia.',
    shape: 'Una forma geométrica: círculo, anillo, triángulo, cruz…',
    checker: 'Un damero de cuadros.',
    pattern: 'Dibujos gráficos: líneas onduladas, zigzag, op-art, topográfico, laberinto, tejido, cubos, puntos… «Grosor» y «Forma» cambian el trazo.',
    gradient: 'Un degradé lineal o radial.',
    scene3d: 'Formas en 3D (raymarching): toroide, cubo, gota… sola, en grilla o en túnel, con la cámara en órbita o vuelo. Es pesada: usá calidad baja.',
    text: 'Un texto que podés deformar con todo lo demás.',
    camera: 'La cámara del celular como fuente. Con «Color: original» se ve tal cual; con una paleta se colorea.',
    palette: 'Convierte el dibujo (que es blanco y negro) en colores con paletas cíclicas. «Ciclar» las anima.',
    ramp: 'Degradé entre dos colores que elegís vos.',
    none: 'Deja los colores tal cual salen del dibujo (ideal con la cámara).',
    adjust: 'Brillo, contraste, saturación y tono.',
    posterize: 'Reduce la cantidad de colores, estilo afiche.',
    invert: 'Invierte los colores (negativo).',
    mix: 'Mezcla las dos capas: mezcla, sumar, multiplicar, pantalla o diferencia. «Mezcla» = cuánto se ve la segunda capa.',
    feedback: 'Mezcla cada cuadro con el anterior, agrandado o girado: estelas, túneles infinitos, rastros.',
    output: 'El final de la cadena: separación RGB, scanlines, viñeta, grano, brillo (bloom), desenfoque, glitch y flash. «Reacciona a» hace que el audio empuje los efectos.',
  };
  const titleOf = t => (t === 'none' ? 'Original' : t === 'transform' ? 'Mover y girar' : N.NODES[t].title);

  /* ── State: the chain ── */
  const STORE = 'nodrus_m_current', SKETCHES = 'nodrus_m_sketches';
  let nextId = 1;
  const mk = type => { const d = N.defaultsFor(type); const n = { id: nextId++, type, v: d.v, p: d.p }; if (type === 'scene3d') n.p.quality = '40'; if (type === 'camera') n.p.mirror = 'yes'; return n; };
  function defaultChain() {
    const c = { tr: mk('transform'), coords: [mk('kaleido')], gen: mk('stripes'), color: mk('palette'), cfx: [], fx: [mk('feedback')], out: mk('output') };
    c.coords.push(mk('polar')); c.gen.v.freq = 3; c.gen.v.sharp = 0.7; c.gen.v.speed = 0.6; c.color.v.speed = 0.08;
    Object.assign(c.fx[0].v, { amount: 0.9, zoom: 1.04, rotate: 3 });
    return c;
  }
  const layerNodes = L => (L && L.gen && L.mix ? [L.gen, ...(L.color ? [L.color] : []), L.mix] : []);
  const allNodes = c => [c.tr, ...c.coords, c.gen, ...(c.color ? [c.color] : []), ...layerNodes(c.layer), ...c.cfx, ...c.fx, c.out];
  function loadChain() {
    try {
      const c = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (c && c.tr && c.gen && c.out && Array.isArray(c.coords) && allNodes(c).every(n => N.NODES[n.type])) { nextId = Math.max(...allNodes(c).map(n => n.id)) + 1; return c; }
    } catch (e) { /* default */ }
    return defaultChain();
  }
  let chain = loadChain();
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(chain)); } catch (e) { /* full */ } }, 300); };

  // chain -> node graph (same format as the desktop editor)
  function genOut(n) {
    const outs = N.NODES[n.type].outputs;
    if (n.useOut) { const o = outs.find(x => x[0] === n.useOut); if (o) return o; }   // e.g. 3D: light, depth or normals
    if (N.NODES[n.type].tex) return outs.find(o => o[0] === 'c');   // camera / text: their color, not the alpha
    return (outs.find(o => o[1] === 'float') || outs[0]);
  }
  function buildGraph() {
    const nodes = [], links = [];
    let col = 0;
    const put = n => { n.x = 40 + col * 250; n.y = 60; col++; nodes.push(n); };
    put(chain.tr);
    let uv = chain.tr;
    for (const c of chain.coords) { put(c); links.push({ a: uv.id, ao: 'uv', b: c.id, bi: 'uv' }); uv = c; }
    put(chain.gen);
    if ((N.NODES[chain.gen.type].inputs || []).some(i => i.k === 'uv')) links.push({ a: uv.id, ao: 'uv', b: chain.gen.id, bi: 'uv' });
    let cur = { id: chain.gen.id, out: genOut(chain.gen)[0] };
    if (chain.color) { put(chain.color); links.push({ a: cur.id, ao: cur.out, b: chain.color.id, bi: 'v' }); cur = { id: chain.color.id, out: 'c' }; }
    // second layer: its own drawing and color, mixed with the first (on the deformed space, or the plain one)
    const L = chain.layer;
    if (L && L.gen && L.mix) {
      put(L.gen);
      if ((N.NODES[L.gen.type].inputs || []).some(i => i.k === 'uv')) links.push({ a: L.plain ? chain.tr.id : uv.id, ao: 'uv', b: L.gen.id, bi: 'uv' });
      let lc = { id: L.gen.id, out: genOut(L.gen)[0] };
      if (L.color) { put(L.color); links.push({ a: lc.id, ao: lc.out, b: L.color.id, bi: 'v' }); lc = { id: L.color.id, out: 'c' }; }
      put(L.mix);
      links.push({ a: cur.id, ao: cur.out, b: L.mix.id, bi: 'a' }, { a: lc.id, ao: lc.out, b: L.mix.id, bi: 'b' });
      cur = { id: L.mix.id, out: 'c' };
    }
    for (const f of [...chain.cfx, ...chain.fx]) { put(f); links.push({ a: cur.id, ao: cur.out, b: f.id, bi: 'c' }); cur = { id: f.id, out: 'c' }; }
    put(chain.out); links.push({ a: cur.id, ao: cur.out, b: chain.out.id, bi: 'c' });
    return { nodes, links, ctl: [] };
  }

  /* ── Rendering ── */
  const canvas = $('c'), view = $('view');
  const renderer = N.createRenderer(canvas);
  let graph = null, compiled = null, key = '';
  function recompile() {
    graph = buildGraph();
    const k = N.structureKey(graph);
    try {
      if (k !== key) { compiled = N.compile(graph); renderer.setGraph(compiled); key = k; }
      N.applyValues(renderer, graph, compiled);
    } catch (e) { console.error(e); toast('No se pudo armar ese visual'); }
  }
  let scale = Math.min(1.5, devicePixelRatio || 1), slowFrames = 0;
  function resize() {
    const r = view.getBoundingClientRect();
    renderer.resize(Math.max(64, Math.round(r.width * scale)), Math.max(64, Math.round(r.height * scale)));
  }
  addEventListener('resize', resize);

  let time = 0, last = performance.now();
  const audio = { on: false, bands: [0, 0, 0, 0], an: null, data: null, ctx: null, stream: null };
  function readAudio() {
    if (!audio.on) return audio.bands;
    audio.an.getByteFrequencyData(audio.data);
    const hz = audio.ctx.sampleRate / audio.an.fftSize;
    const band = (lo, hi) => { let s = 0, n = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(audio.data.length - 1, Math.ceil(hi / hz)); i++) { s += audio.data[i]; n++; } return n ? s / n / 255 : 0; };
    const raw = [band(20, 12000), band(20, 150), band(150, 2000), band(2000, 12000)];
    audio.bands = audio.bands.map((b, i) => { const v = Math.min(1, Math.pow(raw[i] * 1.8, 1.3)); return v > b ? b + (v - b) * 0.6 : b + (v - b) * 0.12; });
    return audio.bands;
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    time += dt;
    N.clock.beat = time * 2;   // 120 bpm
    const a = readAudio();
    renderer.render(time, a, N.postValues(graph, a));
    // phones vary a lot: lower the internal resolution if frames are slow
    if (dt > 0.034) { if (++slowFrames > 40 && scale > 0.6) { scale = Math.max(0.6, scale - 0.25); slowFrames = 0; resize(); } } else slowFrames = Math.max(0, slowFrames - 1);
  }

  /* ── Values ── */
  const sliders = new Map();   // "id.k" -> { input, label, fmt }
  function setVal(n, k, v, fromUI) {
    n.v = { ...(n.v || {}), [k]: v };
    renderer.setValue(N.uniformName(n.id, k), v);
    if (!fromUI) { const s = sliders.get(n.id + '.' + k); if (s) s.sync(v); }
    save();
  }

  /* ── Cards ── */
  const chainEl = $('chain');
  const COLL = 'nodrus_m_collapsed';
  let collapsed = (() => { try { const a = JSON.parse(localStorage.getItem(COLL) || 'null'); return new Set(Array.isArray(a) ? a : ['tr']); } catch (e) { return new Set(['tr']); } })();
  const collKey = n => (n === chain.tr ? 'tr' : String(n.id));
  const saveColl = () => { try { localStorage.setItem(COLL, JSON.stringify([...collapsed])); } catch (e) { /* ignore */ } };
  function summary(n) {
    const def = N.NODES[n.type], parts = [];
    for (const inp of [...(def.inputs || []), ...(def.post || [])]) {
      if (inp.t === 'vec2' || inp.t === 'color' || (inp.t && linked(n, inp.k))) continue;
      const v = n.v && n.v[inp.k] !== undefined ? n.v[inp.k] : inp.v;
      parts.push(`${inp.label} ${inp.step >= 1 ? Math.round(v) : (+v).toFixed(2)}`);
      if (parts.length === 2) break;
    }
    return parts.join(' · ');
  }
  // Touch sliders (same system as the site's tools): the native slider does not take touches,
  // so a vertical swipe scrolls and a tap changes nothing; only a clearly horizontal drag on the
  // row moves the value, relative to where it was. Double tap: back to the default value.
  function touchSlider(row, input, get, set, def) {
    let g = null, lastTap = 0;
    row.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, v: get(), drag: false, t: performance.now() };
    });
    row.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.drag) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }   // a scroll
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5) return;             // not sure yet
        g.drag = true; g.x = e.clientX;                                                 // no jump on grab
        try { row.setPointerCapture(e.pointerId); } catch (er) { /* keep dragging */ }
        row.classList.add('is-dragging');
        if (navigator.vibrate) navigator.vibrate(4);
        return;
      }
      const min = +input.min, max = +input.max, step = +input.step || 0;
      const w = input.getBoundingClientRect().width || 1;
      let v = g.v + (e.clientX - g.x) / w * (max - min);
      v = Math.min(max, Math.max(min, step ? Math.round((v - min) / step) * step + min : v));
      set(v);
    });
    const end = e => {
      if (!g || (e && e.pointerId !== g.id)) return;
      const tap = !g.drag && performance.now() - g.t < 250;
      g = null; row.classList.remove('is-dragging');
      if (tap) { const now = performance.now(); if (now - lastTap < 320) { set(def); lastTap = 0; if (navigator.vibrate) navigator.vibrate(10); } else lastTap = now; }
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    row.addEventListener('dblclick', () => set(def));   // mouse
  }
  const linked = (n, k) => graph.links.some(l => l.b === n.id && l.bi === k);
  function card(n, slot, opts = {}) {   // eslint-disable-line complexity
    const def = N.NODES[n.type], cat = SLOTS[slot] ? SLOTS[slot].cat : 'var(--c-uv)';
    const c = el('section', 'm-card'); c.style.setProperty('--cat', cat); c.dataset.slot = slot;
    const head = el('div', 'm-card-head');
    const ck = collKey(n), isColl = collapsed.has(ck);
    if (isColl) c.classList.add('is-coll');
    const t = el('button', 'm-card-title'); t.title = 'Tocá para contraer o expandir';
    t.append(el('i', 'm-caret', '▾'), document.createTextNode(titleOf(n.type)));
    const sum = el('em', 'm-sum', summary(n)); t.append(sum);
    t.addEventListener('click', () => {
      const now = !collapsed.has(ck);
      if (now) collapsed.add(ck); else collapsed.delete(ck);
      c.classList.toggle('is-coll', now); sum.textContent = summary(n); saveColl();
    });
    head.append(t);
    if (opts.swap) { const sw = el('button', 'm-ic', '⇄'); sw.title = 'Cambiar por otro nodo'; sw.addEventListener('click', () => openPicker(slot, n)); head.append(sw); }
    const info = el('button', 'm-ic', '?'); info.title = 'Qué hace'; info.addEventListener('click', () => openInfo(n.type));
    head.append(info);
    if (opts.reset) { const r = el('button', 'm-ic', '↺'); r.title = 'Volver al centro'; r.addEventListener('click', opts.reset); head.append(r); }
    if (opts.remove) { const x = el('button', 'm-ic', '✕'); x.title = 'Quitar'; x.addEventListener('click', opts.remove); head.append(x); }
    c.append(head);
    const body = el('div', 'm-card-body');
    if ((slot === 'gen' || slot === 'layer') && (def.outputs || []).length > 1 && !def.tex) {
      const row = el('div', 'm-row'); row.append(el('label', '', 'Usar'));
      const chips = el('div', 'm-chips'), curOut = genOut(n)[0];
      def.outputs.forEach(([k, , l]) => {
        const b = el('button', k === curOut ? 'on' : '', l.toLowerCase());
        b.addEventListener('click', () => { n.useOut = k; structure(); });
        chips.append(b);
      });
      row.append(chips); body.append(row);
    }
    for (const p of def.params || []) {
      if (!p.options) {
        if (p.kind !== 'text') continue;
        const row = el('div', 'm-row'); row.append(el('label', '', p.label));
        const inp = el('input'); inp.type = 'text'; inp.value = (n.p && n.p[p.k]) ?? p.v;
        inp.addEventListener('input', () => { n.p = { ...(n.p || {}), [p.k]: inp.value }; recompile(); save(); });
        row.append(inp); body.append(row); continue;
      }
      const row = el('div', 'm-row'); row.append(el('label', '', p.label));
      const cur = (n.p && n.p[p.k]) || p.v;
      if (p.options.length <= 6) {
        const chips = el('div', 'm-chips');
        p.options.forEach(([v, l]) => {
          const b = el('button', v === cur ? 'on' : '', l);
          b.addEventListener('click', () => { n.p = { ...(n.p || {}), [p.k]: v }; chips.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); recompile(); save(); });
          chips.append(b);
        });
        row.append(chips);
      } else {
        const sel = el('select'); p.options.forEach(([v, l]) => { const o = el('option', '', l); o.value = v; sel.append(o); }); sel.value = cur;
        sel.addEventListener('change', () => { n.p = { ...(n.p || {}), [p.k]: sel.value }; recompile(); save(); });
        row.append(sel);
      }
      body.append(row);
    }
    for (const inp of [...(def.inputs || []), ...(def.post || [])]) {
      if (inp.t === 'vec2' || (inp.t && linked(n, inp.k))) continue;
      const row = el('div', 'm-row');
      const val = n.v && n.v[inp.k] !== undefined ? n.v[inp.k] : inp.v;
      if (inp.t === 'color') {
        row.append(el('label', '', inp.label));
        const ci = el('input'); ci.type = 'color'; ci.value = val;
        ci.addEventListener('input', () => setVal(n, inp.k, ci.value, true));
        row.append(ci); body.append(row); continue;
      }
      const min = inp.min ?? 0, max = inp.max ?? 1, step = inp.step || (max - min) / 400;
      row.classList.add('m-sl');
      const lab = el('span', 'm-sl-l', inp.label), vb = el('b', 'm-sl-v');
      // speeds: the slider moves along a curve (fine near 0), so it works in positions 0–1
      const cv = !!inp.curve, pos = x => N.sliderPos(inp, x), valAt = p => N.sliderVal(inp, p);
      const r = el('input'); r.type = 'range';
      if (cv) { r.min = 0; r.max = 1; r.step = 0.0005; r.value = pos(val); } else { r.min = min; r.max = max; r.step = step; r.value = val; }
      const fmt = x => (step >= 1 && !cv ? String(Math.round(x)) : Math.abs(x) >= 100 ? (+x).toFixed(0) : x !== 0 && Math.abs(x) < 0.1 ? (+x).toFixed(3) : (+x).toFixed(2));
      const paint = x => { vb.textContent = fmt(x); r.style.setProperty('--p', (cv ? pos(x) : (x - min) / ((max - min) || 1)) * 100 + '%'); };
      paint(val);
      const apply = x => { r.value = cv ? pos(x) : x; paint(x); setVal(n, inp.k, x, true); };
      r.addEventListener('input', () => apply(cv ? valAt(+r.value) : +r.value));
      if (cv) touchSlider(row, r, () => +r.value, p => apply(valAt(p)), pos(inp.v));
      else touchSlider(row, r, () => +r.value, apply, inp.v);
      sliders.set(n.id + '.' + inp.k, { sync: x => { r.value = cv ? pos(x) : x; paint(x); } });
      row.append(lab, r, vb); body.append(row);
    }
    if (body.children.length) c.append(body);
    return c;
  }
  function section(slot, extra) {
    const s = el('div', 'm-sec'); s.style.setProperty('--cat', SLOTS[slot].cat);
    s.append(el('i'), document.createTextNode(SLOTS[slot].label + ' '), el('small', '', '· ' + SLOTS[slot].hint));
    chainEl.append(s);
    if (extra) chainEl.append(extra);
  }
  function addButton(slot, label) {
    const b = el('button', 'm-add', label);
    b.addEventListener('click', () => openPicker(slot, null));
    chainEl.append(b);
  }
  function renderCards() {
    sliders.clear();
    chainEl.textContent = '';
    section('coords');
    chainEl.append(card(chain.tr, 'coords', { reset: () => { ['x', 'y', 'rotate', 'spin'].forEach(k => setVal(chain.tr, k, 0)); setVal(chain.tr, 'scale', 1); } }));
    chain.coords.forEach((n, i) => chainEl.append(card(n, 'coords', { swap: true, remove: () => { chain.coords.splice(i, 1); structure(); } })));
    if (chain.coords.length < 4) addButton('coords', '＋ Deformación');
    section('gen'); chainEl.append(card(chain.gen, 'gen', { swap: true }));
    section('color');
    if (chain.color) chainEl.append(card(chain.color, 'color', { swap: true }));
    else chainEl.append(noneCard('color'));
    section('layer');
    if (chain.layer) {
      const L = chain.layer;
      chainEl.append(card(L.gen, 'layer', { swap: true, remove: () => { chain.layer = null; structure(); } }));
      chainEl.append(L.color ? card(L.color, 'lcolor', { swap: true }) : noneCard('lcolor'));
      chainEl.append(card(L.mix, 'mix'));
    } else addButton('layer', '＋ Segunda capa');
    chain.cfx.forEach((n, i) => chainEl.append(card(n, 'cfx', { swap: true, remove: () => { chain.cfx.splice(i, 1); structure(); } })));
    if (chain.cfx.length < 3) addButton('cfx', '＋ Efecto de color');
    section('fx');
    chain.fx.forEach((n, i) => chainEl.append(card(n, 'fx', { remove: () => { chain.fx.splice(i, 1); structure(); } })));
    if (!chain.fx.length) addButton('fx', '＋ Feedback (estelas)');
    section('out'); chainEl.append(card(chain.out, 'out'));
  }
  function noneCard(slot) {   // «Original»: the drawing keeps its own colors
    const n = { id: 0, type: 'none' }, c = el('section', 'm-card'); c.style.setProperty('--cat', SLOTS[slot].cat);
    const h = el('div', 'm-card-head'), t = el('button', 'm-card-title'); t.append('Original', el('em', '', 'cambiar ▾')); t.addEventListener('click', () => openPicker(slot, n));
    const i = el('button', 'm-ic', '?'); i.addEventListener('click', () => openInfo('none')); h.append(t, i); c.append(h);
    return c;
  }
  function structure() { recompile(); renderCards(); save(); }

  /* ── Bottom sheet: picker, info, menu, sketches ── */
  const sheet = $('sheet'), scrim = $('scrim');
  function openSheet(title, content) {
    $('sheetTitle').textContent = title;
    const b = $('sheetBody'); b.textContent = ''; b.append(content);
    sheet.hidden = scrim.hidden = false;
  }
  function closeSheet() { sheet.hidden = scrim.hidden = true; }
  $('sheetClose').addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);
  function openPicker(slot, current) {
    const box = el('div');
    for (const t of SLOTS[slot].types) {
      if (slot === 'coords' && current === null && chain.coords.some(c => c.type === t)) continue;
      const b = el('button', 'm-opt' + (current && current.type === t ? ' cur' : '')); b.style.setProperty('--cat', SLOTS[slot].cat);
      b.append(el('b', '', titleOf(t)), el('span', '', DESC[t] || ''));
      b.addEventListener('click', () => {
        closeSheet();
        if (slot === 'color') { chain.color = t === 'none' ? null : mk(t); }
        else if (slot === 'layer') { if (chain.layer) chain.layer.gen = mk(t); else chain.layer = newLayer(t); }
        else if (slot === 'lcolor') { if (chain.layer) chain.layer.color = t === 'none' ? null : mk(t); }
        else if (slot === 'gen') { chain.gen = mk(t); if (t === 'camera' && chain.color && chain.color.type === 'palette') toast('Tip: con «Color: Original» la cámara se ve tal cual'); }
        else if (current) { const list = chain[slot]; list[list.indexOf(current)] = mk(t); }
        else chain[slot].push(mk(t));
        structure();
        if (t === 'scene3d') toast('3D: si se traba, dejá la calidad en baja');
      });
      box.append(b);
    }
    openSheet((current ? 'Cambiar · ' : 'Agregar · ') + SLOTS[slot].label, box);
  }
  function openInfo(type) {
    const box = el('div', 'm-info');
    const p1 = el('p'); p1.textContent = DESC[type] || ''; box.append(p1);
    if (type !== 'none') {
      const d = N.NODES[type], pc = el('p', 'm-pc');
      pc.append('En la compu: categoría «', el('b', '', d.cat), '», nodo «', el('b', '', d.title), '». Ahí se conecta con cables; acá la cadena ya viene conectada en orden.');
      box.append(pc);
    }
    openSheet(titleOf(type), box);
  }

  /* ── Gestures on the visual: drag = move, pinch = zoom, two-finger turn = rotate ── */
  const gest = $('gest'), pts = new Map();
  let g0 = null, lastTap = 0;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  function gstart() {
    const p = [...pts.values()], tr = chain.tr.v;
    g0 = { p: p.map(q => ({ ...q })), x: tr.x || 0, y: tr.y || 0, s: tr.scale || 1, r: tr.rotate || 0 };
  }
  gest.addEventListener('pointerdown', e => {
    try { gest.setPointerCapture(e.pointerId); } catch (er) { /* not capturable: keep tracking anyway */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gstart(); $('hint').classList.add('off');
    const now = performance.now();
    if (pts.size === 1 && now - lastTap < 300) toggleFull();
    lastTap = now;
  });
  gest.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !g0) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.values()], h = view.getBoundingClientRect().height;
    if (p.length === 1 && g0.p.length === 1) {
      setVal(chain.tr, 'x', +(g0.x - (p[0].x - g0.p[0].x) / h * g0.s).toFixed(3));
      setVal(chain.tr, 'y', +(g0.y + (p[0].y - g0.p[0].y) / h * g0.s).toFixed(3));
    } else if (p.length >= 2 && g0.p.length >= 2) {
      const k = dist(p[0], p[1]) / Math.max(1, dist(g0.p[0], g0.p[1]));
      setVal(chain.tr, 'scale', +Math.min(10, Math.max(0.05, g0.s / k)).toFixed(3));
      setVal(chain.tr, 'rotate', +(g0.r - (ang(p[0], p[1]) - ang(g0.p[0], g0.p[1])) * 180 / Math.PI).toFixed(1));
    }
  });
  const gend = e => { pts.delete(e.pointerId); gstart(); };
  gest.addEventListener('pointerup', gend); gest.addEventListener('pointercancel', gend);

  function toggleFull() { document.body.classList.toggle('full'); setTimeout(resize, 50); }
  $('btnFull').addEventListener('click', toggleFull);

  /* ── Random / vary ── */
  const R = (G && G.RANGES) || {};
  function randomize(n) {
    const def = N.NODES[n.type];
    for (const inp of [...(def.inputs || []), ...(def.post || [])]) {
      if (inp.t && inp.t !== 'float') continue;
      const r = (R[n.type] || {})[inp.k];
      let v;
      if (r) v = r[0] + rnd() * (r[1] - r[0]);
      else if (n.type === 'output') v = inp.k === 'vignette' ? 0.2 + rnd() * 0.3 : rnd() < 0.5 ? 0 : rnd() * 0.3;
      else continue;
      if (inp.step) v = Math.round(v / inp.step) * inp.step;
      n.v[inp.k] = Math.round(v * 1000) / 1000;
    }
    for (const p of def.params || []) if (p.options && !(n.type === 'scene3d' && p.k === 'quality')) n.p[p.k] = pick(p.options)[0];
    if (n.type === 'output') n.p.react = audio.on ? pick(['bass', 'level']) : 'none';
    return n;
  }
  const chance = p => rnd() < p, between = (a, b) => +(a + rnd() * (b - a)).toFixed(3);
  const shuffle = a => a.slice().sort(() => rnd() - 0.5);
  const toHex = s => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = s; return c.fillStyle; };
  function randomColor() {
    if (chance(0.78)) return randomize(mk('palette'));
    const r = mk('ramp'), h = rnd() * 360;
    r.v.a = toHex(`hsl(${h},80%,6%)`); r.v.b = toHex(`hsl(${(h + pick([60, 120, 180])) % 360},90%,60%)`);
    return r;
  }
  function random3d() {   // a raymarched shape: light (lit), depth (fog) or normals (rainbow surfaces)
    const s = randomize(mk('scene3d'));
    s.p.quality = '40';
    s.p.layout = pick(['single', 'grid', 'grid', 'tunnel', 'tunnel', 'column']);   // grids and tunnels fill the screen
    s.useOut = pick(['v', 'v', 'v', 'depth', 'depth', 'c']);
    if (chance(0.5)) s.v.twist = 0;
    return s;
  }
  const randomGen = types => { const t = pick(types); return t === 'scene3d' ? random3d() : randomize(mk(t)); };
  const coordsFrom = (types, max, min = 0) => shuffle(types).slice(0, min + Math.floor(rnd() * (max - min + 1))).map(t => randomize(mk(t)));
  function newLayer(t, modes) {
    const gen = t === 'scene3d' ? random3d() : randomize(mk(t));
    const mix = mk('mix'); mix.p.mode = pick(modes || ['screen', 'add', 'multiply', 'difference']);
    mix.v.f = mix.p.mode === 'add' ? between(0.3, 0.6) : mix.p.mode === 'screen' ? between(0.4, 0.75) : between(0.5, 0.95);   // adding layers burns to white quickly
    return { gen, color: gen.useOut === 'c' ? null : randomColor(), mix, plain: chance(0.45) };
  }
  const GEN2D = ['pattern', 'pattern', 'noise', 'voronoi', 'stripes', 'waves', 'shape', 'checker'];
  // each style is a recipe: which deformations, drawings, layers and trails go together
  const STYLES = [
    ['gráfico', 3, () => ({ coords: coordsFrom(SLOTS.coords.types, 2), gen: randomGen(['pattern', 'pattern', 'pattern', 'stripes', 'checker', 'shape', 'waves']),
      layer: chance(0.25) ? newLayer(pick(['pattern', 'stripes', 'checker']), ['difference', 'multiply', 'screen']) : null, fxP: 0.3 })],
    ['3D', 3, () => ({ coords: chance(0.4) ? coordsFrom(['kaleido', 'mirror', 'swirl', 'warp'], 1, 1) : [], gen: random3d(),
      layer: chance(0.35) ? newLayer(pick(['noise', 'voronoi', 'pattern', 'stripes']), ['screen', 'add', 'multiply']) : null, fxP: 0.45, adjP: 0.5 })],
    ['capas', 2.5, () => { const g = randomGen(GEN2D.concat(chance(0.2) ? ['scene3d'] : [])); return { coords: coordsFrom(SLOTS.coords.types, 2, 1), gen: g,
      layer: newLayer(pick(GEN2D.filter(t => t !== g.type)), ['multiply', 'screen', 'difference', 'add', 'mix']), fxP: 0.4 }; }],
    ['túnel', 1.5, () => ({ coords: [randomize(mk('polar')), ...(chance(0.4) ? [randomize(mk('kaleido'))] : [])], gen: randomGen(['stripes', 'pattern', 'checker', 'waves', 'voronoi']),
      layer: chance(0.25) ? newLayer(pick(['noise', 'stripes']), ['screen', 'add']) : null, fxP: 1, tunnel: true })],
    ['psicodélico', 1.5, () => ({ coords: [randomize(mk(pick(['warp', 'swirl']))), ...(chance(0.5) ? [randomize(mk('kaleido'))] : [])], gen: randomGen(['noise', 'voronoi', 'pattern', 'waves']),
      layer: chance(0.4) ? newLayer(pick(['noise', 'voronoi', 'waves']), ['add', 'screen', 'difference']) : null, fxP: 0.8, fast: true, adjP: 0.7 })],
    ['cristal', 1, () => ({ coords: [randomize(mk('kaleido')), ...(chance(0.35) ? [randomize(mk('tile'))] : [])], gen: randomGen(['voronoi', 'shape', 'pattern', 'scene3d']),
      layer: chance(0.45) ? newLayer(pick(['voronoi', 'shape', 'stripes']), ['difference', 'screen', 'multiply']) : null, fxP: 0.3, postP: 0.4 })],
  ];
  function randomChain() {
    const tot = STYLES.reduce((s, x) => s + x[1], 0);
    let r = rnd() * tot, st = STYLES[0];
    for (const x of STYLES) { r -= x[1]; if (r <= 0) { st = x; break; } }
    const s = st[2]();
    const color = s.gen.useOut === 'c' ? null : randomColor();   // 3D normals already have their colors
    if (color && color.type === 'palette' && s.fast) color.v.speed = between(0.1, 0.25) * (chance(0.5) ? -1 : 1);
    const cfx = [];
    if (chance(s.adjP || 0.35)) cfx.push(randomize(mk('adjust')));
    if (chance(s.postP || 0.12)) cfx.push(randomize(mk('posterize')));
    const fx = chance(s.fxP) ? [randomize(mk('feedback'))] : [];
    if (fx[0]) {
      const lit = s.layer && ['add', 'screen'].includes(s.layer.mix.p.mode);
      fx[0].p.blend = lit ? pick(['max', 'mix']) : pick(s.fast ? ['add', 'max', 'mix'] : ['max', 'max', 'add', 'mix']);   // trails that add on top of an added layer burn out
      if (fx[0].p.blend === 'add') fx[0].v.amount = Math.min(fx[0].v.amount, between(0.72, 0.85));
      if (s.tunnel) { fx[0].p.blend = 'mix'; Object.assign(fx[0].v, { amount: between(0.78, 0.9), zoom: between(1.02, 1.05), rotate: between(-3, 3) }); }   // fading trails: «max» would fill the screen
      if (s.gen.type === 'scene3d') Object.assign(fx[0].v, { amount: between(0.7, 0.88), zoom: between(0.995, 1.015) });   // 3D: soft trails, the shape stays readable
    }
    chain = { tr: chain.tr, coords: s.coords, gen: s.gen, color, layer: s.layer || null, cfx, fx, out: randomize(mk('output')) };
    structure(); buzz();
    toast('🎲 ' + st[0] + (chain.layer && st[0] !== 'capas' ? ' · 2 capas' : '') + (st[0] !== '3D' && allNodes(chain).some(n => n.type === 'scene3d') ? ' · 3D' : ''));
  }
  function vary() { recompile(); G.vary(graph, 0.18); recompile(); renderCards(); save(); buzz(); }
  $('btnRandom').addEventListener('click', randomChain);
  $('btnVary').addEventListener('click', vary);

  /* ── Mic ── */
  $('btnMic').addEventListener('click', async () => {
    if (audio.on) {
      audio.stream.getTracks().forEach(t => t.stop()); audio.ctx.close().catch(() => {});
      audio.on = false; audio.bands = [0, 0, 0, 0]; $('btnMic').classList.remove('on'); toast('Audio apagado'); return;
    }
    try {
      audio.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      audio.an = audio.ctx.createAnalyser(); audio.an.fftSize = 2048; audio.an.smoothingTimeConstant = 0.55;
      audio.ctx.createMediaStreamSource(audio.stream).connect(audio.an);
      audio.data = new Uint8Array(audio.an.frequencyBinCount); audio.on = true;
      $('btnMic').classList.add('on');
      if (chain.out.p.react === 'none') { chain.out.p.react = 'bass'; structure(); }
      toast('Audio activado: la Salida reacciona a los graves');
    } catch (e) { toast('No se pudo usar el micrófono'); }
  });

  /* ── Tilt (gyroscope) and shake to vary ── */
  let tilt = false, lastShake = 0;
  function onOrient(e) {
    if (!tilt || e.gamma == null) return;
    setVal(chain.tr, 'spin', +(e.gamma * 2).toFixed(1));
    const fb = chain.fx.find(n => n.type === 'feedback');
    const k = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 45));
    if (fb) setVal(fb, 'zoom', +(1.01 + k * 0.05).toFixed(3));
  }
  function onMotion(e) {
    const a = e.accelerationIncludingGravity; if (!tilt || !a) return;
    const m = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    if (m > 24 && performance.now() - lastShake > 1500) { lastShake = performance.now(); vary(); toast('✨ ¡sacudida!'); }
  }
  $('btnTilt').addEventListener('click', async () => {
    if (!tilt) {
      try {
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
          if (await DeviceOrientationEvent.requestPermission() !== 'granted') { toast('Sin permiso para el giroscopio'); return; }
          if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission().catch(() => {});
        }
      } catch (e) { /* ask failed */ }
      addEventListener('deviceorientation', onOrient); addEventListener('devicemotion', onMotion);
      tilt = true; $('btnTilt').classList.add('on'); toast('Inclinar: gira y acerca el feedback · sacudir: variar');
    } else {
      tilt = false; $('btnTilt').classList.remove('on'); setVal(chain.tr, 'spin', 0);
      removeEventListener('deviceorientation', onOrient); removeEventListener('devicemotion', onMotion);
    }
  });

  /* ── Photo / video ── */
  const share = async (blob, name) => {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'NODRUS' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 15000);
  };
  $('btnPhoto').addEventListener('click', () => {
    renderer.render(time, audio.bands, N.postValues(graph, audio.bands));
    canvas.toBlob(b => { if (b) share(b, `nodrus_${Date.now()}.png`); }, 'image/png');
  });
  let rec = null;
  $('btnRec').addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') { toast('Este navegador no puede grabar video'); return; }
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const stream = canvas.captureStream(30);
    if (audio.on) audio.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const chunks = [];
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
    r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      rec = null; document.body.classList.remove('rec'); $('btnRec').classList.remove('rec'); $('btnRec').querySelector('span').textContent = 'Grabar';
      const type = r.mimeType || 'video/webm';
      share(new Blob(chunks, { type }), `nodrus_${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
    };
    r.start(); rec = r;
    document.body.classList.add('rec'); $('btnRec').classList.add('rec'); $('btnRec').querySelector('span').textContent = 'Detener';
    toast(document.body.classList.contains('full') ? 'Grabando' : 'Grabando · tip: en pantalla completa (⛶) sale vertical para historias');
  });

  /* ── Sketches and "open on the computer" ── */
  const readSk = () => { try { const a = JSON.parse(localStorage.getItem(SKETCHES) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  function saveSketch() {
    renderer.render(time, audio.bands, N.postValues(graph, audio.bands));
    const t = document.createElement('canvas'); t.width = 150; t.height = 200;
    const cw = canvas.width, ch = canvas.height, s = Math.max(150 / cw, 200 / ch);
    t.getContext('2d').drawImage(canvas, (150 - cw * s) / 2, (200 - ch * s) / 2, cw * s, ch * s);
    const list = readSk(); list.unshift({ chain: clone(chain), thumb: t.toDataURL('image/jpeg', 0.7), at: Date.now() });
    try { localStorage.setItem(SKETCHES, JSON.stringify(list.slice(0, 18))); toast('Boceto guardado'); } catch (e) { toast('No hay más espacio para bocetos'); }
  }
  function openSketches() {
    const list = readSk(), box = el('div');
    if (!list.length) box.append(el('p', 'm-empty', 'Todavía no guardaste bocetos. Usá «Guardar boceto» en el menú ⋯.'));
    const grid = el('div', 'm-sk');
    list.forEach((s, i) => {
      const d = el('div'); d.style.backgroundImage = `url(${s.thumb})`;
      d.addEventListener('click', () => { chain = clone(s.chain); nextId = Math.max(...allNodes(chain).map(n => n.id)) + 1; structure(); closeSheet(); toast('Boceto abierto'); });
      const x = el('button', '', '✕'); x.addEventListener('click', e => { e.stopPropagation(); list.splice(i, 1); try { localStorage.setItem(SKETCHES, JSON.stringify(list)); } catch (er) { /* ignore */ } openSketches(); });
      d.append(x); grid.append(d);
    });
    box.append(grid);
    openSheet('Bocetos', box);
  }
  function pcLink() {
    const g = buildGraph();
    const json = JSON.stringify({ nodes: g.nodes, links: g.links });
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return new URL('../?pc#patch=' + b64, document.baseURI).href;
  }
  async function openOnPC() {
    const url = pcLink();
    if (navigator.share) { try { await navigator.share({ title: 'Boceto NODRUS', text: 'Abrilo en la compu para seguir en el editor completo', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado: abrilo en la compu'); } catch (e) { prompt('Copiá este enlace y abrilo en la compu:', url); }
  }
  function saveFile() {
    const g = buildGraph();
    const blob = new Blob([JSON.stringify({ pudrusNodes: 1, graph: { nodes: g.nodes, links: g.links } }, null, 1)], { type: 'application/json' });
    share(blob, `nodrus_patch_${Date.now()}.json`);
  }
  $('btnMenu').addEventListener('click', () => {
    const box = el('div', 'm-menu');
    const item = (t, s, fn) => { const b = el('button'); b.append(t, el('small', '', s)); b.addEventListener('click', () => { closeSheet(); fn(); }); box.append(b); };
    item('💾 Guardar boceto', 'queda en este celular', saveSketch);
    item('🗂 Bocetos', 'abrir uno guardado', openSketches);
    item('💻 Abrir en la compu', 'te pasa un enlace: el boceto se abre en el editor completo con los mismos nodos', openOnPC);
    item('⤓ Guardar archivo de patch', 'para «Patch ▾ → Abrir…» en la compu', saveFile);
    item('▸ Contraer todas las tarjetas', 'para ver la cadena entera', () => { allNodes(chain).forEach(n => collapsed.add(collKey(n))); saveColl(); renderCards(); });
    item('▾ Expandir todas', 'ver todos los valores', () => { collapsed.clear(); saveColl(); renderCards(); });
    item('🧭 Recorrido guiado', 'cómo funciona la cadena de nodos', () => startTour());
    item('↺ Empezar de nuevo', 'vuelve al ejemplo inicial', () => { chain = defaultChain(); structure(); });
    item('🖥 Editor completo', 'la versión de compu, con nodos y cables', () => { try { localStorage.setItem('nodrus_pc', '1'); } catch (e) { /* ignore */ } location.href = '../?pc'; });
    openSheet('NODRUS', box);
  });

  /* ── Guided tour ── */
  const TOUR = [
    { el: () => view, text: 'Este es tu visual, en vivo. <b>Arrastrá</b> para moverlo, <b>pellizcá</b> para acercar y <b>girá con dos dedos</b>. Doble toque: pantalla completa.' },
    { el: () => chainEl.querySelector('[data-slot="gen"]'), text: '<b>Generar</b> es el dibujo base: nubes, rayas, celdas, formas 3D o tu cámara. <b>⇄</b> lo cambia por otro; tocando el nombre la tarjeta se contrae. Los valores se mueven arrastrando <b>de costado</b> (doble toque: valor original). En la compu es un nodo azul.' },
    { el: () => chainEl.querySelector('[data-slot="color"]'), text: '<b>Color</b> convierte ese dibujo (que es blanco y negro) en colores. Probá otras paletas o un degradé propio.' },
    { el: () => chainEl.querySelector('[data-slot="coords"]'), text: '<b>Coordenadas</b> deforman el espacio <b>antes</b> de dibujar: caleidoscopio, remolino, glitch… Son los nodos violetas de la compu.' },
    { el: () => chainEl.querySelector('[data-slot="fx"]') || chainEl.querySelector('[data-slot="out"]'), text: '<b>Feedback</b> mezcla cada cuadro con el anterior: estelas y túneles infinitos. Y la <b>Salida</b> suma brillo, glitch y viñeta.' },
    { el: () => $('bar'), text: '<b>🎲</b> arma algo nuevo, <b>✨</b> varía lo que tenés, <b>🎤</b> lo hace reaccionar al sonido y <b>📱</b> responde a cómo inclinás el celular. En <b>⋯</b> está «Abrir en la compu» para seguir en el editor completo.' },
  ];
  let tourI = 0;
  function showTour() {
    const step = TOUR[tourI], target = step.el();
    if (target && target.scrollIntoView && target !== view && target.id !== 'bar') target.scrollIntoView({ block: 'center' });
    setTimeout(() => {
      const r = (target || view).getBoundingClientRect(), box = $('tourBox'), bub = $('tourBubble');
      Object.assign(box.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      $('tourText').innerHTML = step.text;
      $('tourStep').textContent = `${tourI + 1} / ${TOUR.length}`;
      $('tourNext').textContent = tourI === TOUR.length - 1 ? 'Listo' : 'Siguiente';
      const below = r.bottom + 170 < innerHeight;
      bub.style.top = below ? r.bottom + 12 + 'px' : ''; bub.style.bottom = below ? '' : (innerHeight - r.top + 12) + 'px';
    }, 260);
  }
  function startTour() { tourI = 0; $('tour').hidden = false; showTour(); }
  function endTour() { $('tour').hidden = true; try { localStorage.setItem('nodrus_m_tour', '1'); } catch (e) { /* ignore */ } }
  $('tourNext').addEventListener('click', () => { if (++tourI >= TOUR.length) endTour(); else showTour(); });
  $('tourSkip').addEventListener('click', endTour);
  $('btnTour').addEventListener('click', startTour);

  /* ── Misc ── */
  let toastT;
  function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 2400); }
  function buzz() { if (navigator.vibrate) navigator.vibrate(12); }
  let wl = null;
  document.addEventListener('pointerdown', async () => { try { if (!wl && navigator.wakeLock) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } } catch (e) { /* not allowed */ } }, { passive: true });
  setTimeout(() => $('hint').classList.add('off'), 5000);

  /* ── Start ── */
  recompile(); renderCards(); resize();
  requestAnimationFrame(loop);
  let seen = false; try { seen = localStorage.getItem('nodrus_m_tour') === '1'; } catch (e) { /* ignore */ }
  if (!seen) setTimeout(startTour, 700);
  window.__nodrusM = { get chain() { return chain; }, get graph() { return graph; }, randomChain, vary, pcLink, structure, setVal, startTour, endTour };
})();
