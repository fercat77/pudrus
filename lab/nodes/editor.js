/* PUDRUS Lab · Nodos — editor (Blender-style). Personal tool: Spanish UI only. */
(function () {
  const N = window.PudrusNodes, PRESETS = window.PudrusPresets;
  const DESK = window.nodrusDesktop || null;   // running inside the NODRUS desktop app (Spout, OSC, wifi phone)
  let deskInfo = null;
  const $ = s => document.querySelector(s);
  const work = $('#work'), world = $('#world'), svg = $('#links');
  const preview = $('#preview'), view = $('#view');
  const STORE = 'pudrus_nodes_graph_v1';
  const CAT_COLOR = { Entrada: 'var(--c-in)', Generar: 'var(--c-gen)', Coordenadas: 'var(--c-uv)', Color: 'var(--c-col)', Efectos: 'var(--c-fx)', 'Código': 'var(--c-code)', Salida: 'var(--c-out)' };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ── State ─────────────────────────────────────────────── */
  // a patch with no controls (and not emptied on purpose) gets the ones that make sense
  function ensureControls(g) {
    if (g && !g.ctlManual && !(Array.isArray(g.ctl) && g.ctl.length) && window.PudrusGenerate) {
      try { g.ctl = window.PudrusGenerate.suggest(g); } catch (e) { /* keep none */ }
    }
    return g;
  }
  let graph = ensureControls(load() || clone(PRESETS[0].graph));
  let fromPhone = false;
  if (location.hash.startsWith('#patch=')) {
    try {
      const b64 = location.hash.slice(7).replace(/-/g, '+').replace(/_/g, '/');
      const g = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (Array.isArray(g.nodes) && Array.isArray(g.links) && g.nodes.every(n => N.NODES[n.type])) { graph = ensureControls(g); fromPhone = true; }
    } catch (e) { /* not a valid sketch */ }
    history.replaceState(null, '', location.pathname + location.search);
  }
  let cam = { x: 30, y: 30, z: 0.85 };
  const selected = new Set();
  let compiled = null;
  let playing = true, time = 0;
  const els = new Map();     // node id -> { root, ins: {k: el}, outs: {k: el}, thumb }

  // Live settings (remembered): direct mode, fade time, node thumbnails
  const LIVE_STORE = 'pudrus_nodes_live_v1';
  const opts = Object.assign({ direct: false, fade: 1, thumbs: true }, (() => { try { return JSON.parse(localStorage.getItem(LIVE_STORE) || '{}'); } catch (e) { return {}; } })());
  const saveOpts = () => { try { localStorage.setItem(LIVE_STORE, JSON.stringify(opts)); } catch (e) { /* ignore */ } };

  function load() {
    try { const g = JSON.parse(localStorage.getItem(STORE) || 'null'); return g && Array.isArray(g.nodes) ? g : null; } catch (e) { return null; }
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(graph)); } catch (e) { /* full */ } }, 400);
  }
  const nextId = () => graph.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;

  /* ── Undo ──────────────────────────────────────────────── */
  let hist = [JSON.stringify(graph)], hi = 0, histTimer;
  function remember() {
    clearTimeout(histTimer);
    histTimer = setTimeout(() => {
      const s = JSON.stringify(graph);
      if (s === hist[hi]) return;
      hist = hist.slice(0, hi + 1); hist.push(s);
      if (hist.length > 80) hist.shift();
      hi = hist.length - 1;
    }, 250);
  }
  function restore(i) {
    hi = i; graph = JSON.parse(hist[hi]); selected.clear();
    rebuild(); recompile(); save();
  }
  const undo = () => { clearTimeout(histTimer); if (JSON.stringify(graph) !== hist[hi]) { remember(); return; } if (hi > 0) restore(hi - 1); };
  const redo = () => { if (hi < hist.length - 1) restore(hi + 1); };

  /* ── Toast ─────────────────────────────────────────────── */
  let toastTimer;
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('is-err', !!err); t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), err ? 6000 : 2500);
  }

  /* ── Compile ───────────────────────────────────────────── */
  const renderer = N.createRenderer(view);
  function structureKey() {
    return JSON.stringify({ n: graph.nodes.map(n => [n.id, n.type, n.p]), l: graph.links });
  }
  let lastKey = '';
  function recompile() {
    const key = structureKey();
    try {
      if (key !== lastKey) {
        compiled = N.compile(graph);
        renderer.setGraph(compiled);
        lastKey = key;
      }
      N.applyValues(renderer, graph, compiled);
      $('#toast').classList.remove('is-err');
    } catch (e) {
      console.error(e);
      toast('No se pudo compilar el shader:\n' + String(e.message || e).split('\n').slice(0, 4).join('\n'), true);
      return String(e.message || e);
    }
    if (opts.direct) sendDirect();
    markPending();
    if (typeof pushState === 'function') pushState();
  }

  /* ── Node DOM ──────────────────────────────────────────── */
  const isLinked = (id, k) => graph.links.some(l => l.b === id && l.bi === k);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

  function numWidget(label, value, spec, onChange) {
    const w = el('div', 'num'), fill = el('div', 'num-fill'), l = el('span', '', label), v = el('span', 'num-v');
    w.append(fill, l, v);
    const min = spec.min ?? 0, max = spec.max ?? 1, step = spec.step || 0;
    const fmt = x => (step >= 1 ? String(Math.round(x)) : Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2));
    let cur = value;
    const paint = () => { v.textContent = fmt(cur); fill.style.width = Math.max(0, Math.min(1, (cur - min) / (max - min || 1))) * 100 + '%'; };
    const set = x => { cur = step ? Math.round(x / step) * step : x; paint(); onChange(cur); };
    paint();
    w.setDisplay = x => { cur = x; paint(); };
    let drag = null;
    w.addEventListener('pointerdown', e => {
      if (e.button !== 0 || w.querySelector('input')) return;
      e.stopPropagation();
      drag = { x: e.clientX, v: cur, moved: false };
      w.setPointerCapture(e.pointerId);
    });
    w.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      if (!drag.moved) return;
      const range = (max - min) || 1;
      set(Math.min(max, Math.max(min, drag.v + dx / 220 * range * (e.shiftKey ? 0.1 : 1))));
    });
    w.addEventListener('pointerup', () => {
      if (drag && !drag.moved) {   // click: type a value (any value, also beyond the slider range)
        const inp = el('input'); inp.value = fmt(cur); w.append(inp); inp.focus(); inp.select();
        const done = ok => { if (ok) { const x = parseFloat(inp.value.replace(',', '.')); if (isFinite(x)) set(x); } inp.remove(); };
        inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
        inp.addEventListener('blur', () => done(true));
      }
      drag = null;
    });
    return w;
  }

  function buildNode(n) {
    const def = N.NODES[n.type];
    const root = el('div', 'nd');
    root.dataset.id = n.id;
    root.style.left = n.x + 'px'; root.style.top = n.y + 'px';
    const head = el('div', 'nd-head');
    head.style.setProperty('--cat', CAT_COLOR[def.cat] || '#444');
    head.append(el('span', '', def.title));
    const x = el('button', 'nd-x', '×'); x.title = 'Borrar (X)';
    x.addEventListener('pointerdown', e => e.stopPropagation());
    x.addEventListener('click', () => removeNodes([n.id]));
    head.append(x);
    const body = el('div', 'nd-body');
    const rec = { root, ins: {}, outs: {}, thumb: null, nums: {} };
    if (opts.thumbs && thumbs && !def.unique && (def.outputs || []).length) {
      const c = el('canvas', 'nd-thumb'); c.width = THUMB_W; c.height = THUMB_H;
      rec.thumb = { c, ctx: c.getContext('2d') };
      body.append(c);
    }
    // outputs first (Blender order)
    for (const [k, t, label] of def.outputs || []) {
      const row = el('div', 'nd-row out'); row.append(el('span', 'lbl', label));
      const s = el('i', 'sock t-' + t); s.dataset.out = k; s.dataset.type = t; row.append(s);
      rec.outs[k] = s; body.append(row);
    }
    for (const p of def.params || []) {
      const row = el('div', 'nd-row');
      if (p.kind === 'text') {
        const ta = el('textarea', 'nd-text'); ta.rows = 2; ta.value = (n.p && n.p[p.k] !== undefined) ? n.p[p.k] : p.v;
        ta.placeholder = p.label;
        ta.addEventListener('pointerdown', e => e.stopPropagation());
        let tt;
        ta.addEventListener('input', () => { clearTimeout(tt); tt = setTimeout(() => { n.p = { ...(n.p || {}), [p.k]: ta.value }; recompile(); save(); remember(); }, 200); });
        row.append(ta); body.append(row);
        continue;
      }
      if (p.kind === 'code') {
        const code = (n.p && n.p.code !== undefined) ? n.p.code : p.v;
        const toy = /\bmainImage\s*\(/.test(code);
        const b = el('button', 'nd-file nd-code', '✎ Editar código · ' + (toy ? 'Shadertoy' : 'effect()'));
        b.title = 'Escribí GLSL o pegá un shader de Shadertoy';
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', () => openCode(n));
        row.append(b); body.append(row);
        continue;
      }
      if (p.kind === 'video') {
        const b = el('button', 'nd-file', n.p && n.p.name ? '🎞 ' + n.p.name : '🎞 Elegir video…');
        b.title = 'MP4 o WebM (también podés soltar el archivo sobre el área de nodos). Se repite en loop, sin sonido.';
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', () => pickVideo(n));
        row.append(b); body.append(row);
        continue;
      }
      if (p.kind === 'image') {
        const b = el('button', 'nd-file', n.p && n.p.name ? '🖼 ' + n.p.name : '🖼 Elegir imagen…');
        b.title = 'PNG con transparencia, JPG o WebP (también podés soltar el archivo sobre el área de nodos)';
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', () => pickImage(n));
        row.append(b); body.append(row);
        continue;
      }
      const sel = el('select');
      p.options.forEach(([v, l]) => { const o = el('option', '', p.label + ': ' + l); o.value = v; sel.append(o); });
      sel.value = (n.p && n.p[p.k]) || p.v;
      sel.addEventListener('pointerdown', e => e.stopPropagation());
      sel.addEventListener('change', () => { n.p = { ...(n.p || {}), [p.k]: sel.value }; recompile(); save(); remember(); });
      row.append(sel); body.append(row);
    }
    for (const p of def.post || []) {
      const row = el('div', 'nd-row');
      row.append(numWidget(p.label, (n.v && n.v[p.k] !== undefined) ? n.v[p.k] : p.v, p, v => { n.v = { ...(n.v || {}), [p.k]: v }; if (opts.direct) sendDirect(); markPending(); save(); remember(); }));
      body.append(row);
    }
    for (const inp of def.inputs || []) {
      const row = el('div', 'nd-row in');
      const s = el('i', 'sock t-' + inp.t); s.dataset.in = inp.k; s.dataset.type = inp.t; row.append(s);
      rec.ins[inp.k] = s;
      const val = n.v && n.v[inp.k] !== undefined ? n.v[inp.k] : inp.v;
      if (inp.t === 'float' && !isLinked(n.id, inp.k)) {
        const w = numWidget(inp.label, val, inp, v => setValue(n, inp.k, v));
        rec.nums[inp.k] = w;
        if (ctlList(graph).some(c => hasCtl(c, n.id, inp.k))) w.classList.add('is-ctl');
        w.addEventListener('contextmenu', e => {
          e.preventDefault(); e.stopPropagation();
          valueTarget = { id: n.id, k: inp.k };
          const has = ctlList(graph).some(c => hasCtl(c, n.id, inp.k));
          $('#vpCtl').textContent = has ? '🎛 Quitar del control' : '🎛 Al control (celular / MIDI)';
          $('#vpMidiForget').hidden = !Object.values(midiMap).some(t => t.kind === 'value' && t.id === n.id && t.k === inp.k);
          openPop($('#valuePop'), e.clientX, e.clientY);
        });
        row.append(w);
      } else if (inp.t === 'color' && !isLinked(n.id, inp.k)) {
        const w = el('div', 'colorw'); w.append(el('span', 'lbl', inp.label));
        const c = el('input'); c.type = 'color'; c.value = val;
        c.addEventListener('pointerdown', e => e.stopPropagation());
        c.addEventListener('input', () => setValue(n, inp.k, c.value));
        w.append(c); row.append(w);
      } else {
        row.append(el('span', 'lbl', inp.label));
      }
      body.append(row);
    }
    root.append(head, body);
    head.addEventListener('pointerdown', e => startNodeDrag(e, n));
    root.addEventListener('pointerdown', e => { if (!e.shiftKey && !selected.has(n.id)) select([n.id]); });
    rec.root = root;
    return rec;
  }

  function setValue(n, k, v) {
    n.v = { ...(n.v || {}), [k]: v };
    renderer.setValue(N.uniformName(n.id, k), v);
    if (opts.direct) sendDirect();
    markPending();
    save(); remember();
  }

  function rebuild() {
    els.forEach(r => r.root.remove());
    els.clear();
    for (const n of graph.nodes) { const r = buildNode(n); els.set(n.id, r); world.append(r.root); }
    paintSelection();
    drawLinks();
  }

  /* ── Camera (pan / zoom) ───────────────────────────────── */
  function applyCam() {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    const g = 24 * cam.z;
    work.style.backgroundSize = `${g}px ${g}px`;
    work.style.backgroundPosition = `${cam.x}px ${cam.y}px`;
  }
  const toWorld = (cx, cy) => { const r = work.getBoundingClientRect(); return [(cx - r.left - cam.x) / cam.z, (cy - r.top - cam.y) / cam.z]; };
  function sockPos(s) {
    const r = s.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }
  work.addEventListener('wheel', e => {
    if (e.target.closest('.lab-preview, .lab-pop')) return;
    e.preventDefault();
    const r = work.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const z = Math.min(2.5, Math.max(0.25, cam.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    cam.x = px - (px - cam.x) * z / cam.z; cam.y = py - (py - cam.y) * z / cam.z; cam.z = z;
    applyCam();
  }, { passive: false });

  let pan = null;
  work.addEventListener('pointerdown', e => {
    if (e.target !== work && e.target !== world && e.target !== svg && !e.target.closest('.lab-work.backdrop.is-direct .lab-preview canvas, .lab-work.backdrop:not(.is-direct) .lab-live canvas')) return;
    if (e.button !== 0 && e.button !== 1) return;
    pan = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    work.setPointerCapture(e.pointerId);
    work.classList.add('is-panning');
  });
  work.addEventListener('pointermove', e => {
    lastPointer = [e.clientX, e.clientY];
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
    cam.x = pan.cx + dx; cam.y = pan.cy + dy; applyCam();
  });
  work.addEventListener('pointerup', () => {
    if (pan && !pan.moved) { select([]); closePops(); }
    pan = null; work.classList.remove('is-panning');
  });
  let lastPointer = [innerWidth / 2, innerHeight / 2];

  function frameAll() {
    if (!graph.nodes.length) return;
    const xs = graph.nodes.map(n => n.x), ys = graph.nodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + 210, minY = Math.min(...ys), maxY = Math.max(...ys) + 260;
    const r = work.getBoundingClientRect();
    const pw = Math.max(preview.getBoundingClientRect().width, opts.direct || work.classList.contains('backdrop') ? 0 : $('#live').getBoundingClientRect().width) + 20;
    const z = Math.min(1.2, Math.max(0.7, Math.min((r.width - pw - 60) / (maxX - minX), (r.height - 60) / (maxY - minY))));
    cam = { z, x: 30 - minX * z, y: 30 - minY * z };
    applyCam();
  }

  /* ── Selection & node drag ─────────────────────────────── */
  function select(ids, add) {
    if (!add) selected.clear();
    ids.forEach(id => selected.add(id));
    paintSelection();
  }
  function paintSelection() { els.forEach((r, id) => r.root.classList.toggle('is-sel', selected.has(id))); }
  function startNodeDrag(e, n) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) { selected.has(n.id) ? selected.delete(n.id) : selected.add(n.id); paintSelection(); }
    else if (!selected.has(n.id)) select([n.id]);
    const start = [e.clientX, e.clientY];
    const orig = [...selected].map(id => { const m = graph.nodes.find(x => x.id === id); return [m, m.x, m.y]; });
    const head = e.currentTarget;
    head.setPointerCapture(e.pointerId);
    const move = ev => {
      const dx = (ev.clientX - start[0]) / cam.z, dy = (ev.clientY - start[1]) / cam.z;
      for (const [m, ox, oy] of orig) { m.x = Math.round(ox + dx); m.y = Math.round(oy + dy); const r = els.get(m.id); r.root.style.left = m.x + 'px'; r.root.style.top = m.y + 'px'; }
      drawLinks();
    };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); save(); remember(); };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  }

  /* ── Links ─────────────────────────────────────────────── */
  const curve = (a, b) => {
    const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5);
    return `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`;
  };
  function drawLinks(temp) {
    let html = '';
    for (const l of graph.links) {
      const a = els.get(l.a), b = els.get(l.b);
      if (!a || !b || !a.outs[l.ao] || !b.ins[l.bi]) continue;
      html += `<path class="t-${a.outs[l.ao].dataset.type}" d="${curve(sockPos(a.outs[l.ao]), sockPos(b.ins[l.bi]))}"/>`;
    }
    if (temp) html += `<path class="temp" d="${curve(temp[0], temp[1])}"/>`;
    svg.innerHTML = html;
  }

  // Drag from an output socket (or from a connected input: picks the link up again)
  world.addEventListener('pointerdown', e => {
    const s = e.target.closest('.sock');
    if (!s || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const nodeEl = s.closest('.nd'); const id = +nodeEl.dataset.id;
    let from;
    if (s.dataset.out) from = { id, k: s.dataset.out, el: s };
    else {
      const l = graph.links.find(x => x.b === id && x.bi === s.dataset.in);
      if (!l) {   // start from an empty input: drag backwards to an output
        from = { id, k: s.dataset.in, el: s, reverse: true };
      } else {
        graph.links = graph.links.filter(x => x !== l);
        from = { id: l.a, k: l.ao, el: els.get(l.a).outs[l.ao] };
        rebuild(); from.el = els.get(l.a).outs[l.ao]; recompile();
      }
    }
    const move = ev => {
      const a = sockPos(from.el), b = toWorld(ev.clientX, ev.clientY);
      drawLinks(from.reverse ? [b, a] : [a, b]);
    };
    const up = ev => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const ts = target && target.closest && target.closest('.sock');
      if (ts) {
        const tid = +ts.closest('.nd').dataset.id;
        if (!from.reverse && ts.dataset.in) connect(from.id, from.k, tid, ts.dataset.in);
        else if (from.reverse && ts.dataset.out) connect(tid, ts.dataset.out, from.id, from.k);
      }
      drawLinks(); save(); remember();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });

  function connect(a, ao, b, bi) {
    if (a === b) return;
    if (N.dependsOn(graph, a, b)) { toast('Esa conexión formaría un ciclo', true); return; }
    graph.links = graph.links.filter(l => !(l.b === b && l.bi === bi));
    graph.links.push({ a, ao, b, bi });
    rebuild(); recompile();
  }

  /* ── Add / remove / duplicate ──────────────────────────── */
  function addNode(type, wx, wy) {
    const def = N.NODES[type];
    if (def.unique && graph.nodes.some(n => n.type === type)) { toast('Ya hay un nodo de Salida'); return; }
    const d = N.defaultsFor(type);
    const n = { id: nextId(), type, x: Math.round(wx), y: Math.round(wy), v: d.v, p: d.p };
    graph.nodes.push(n);
    // convenience: if exactly one node is selected, plug its first output into the new node
    const sel = [...selected];
    if (sel.length === 1) {
      const s = graph.nodes.find(m => m.id === sel[0]); const sd = N.NODES[s.type];
      const out = (sd.outputs || [])[0]; const inp = (def.inputs || []).find(i => i.t === (out && out[1])) || (def.inputs || [])[0];
      if (out && inp && !N.dependsOn(graph, s.id, n.id)) graph.links.push({ a: s.id, ao: out[0], b: n.id, bi: inp.k });
    }
    select([n.id]);
    rebuild(); recompile(); save(); remember();
  }
  function removeNodes(ids) {
    graph.nodes = graph.nodes.filter(n => !ids.includes(n.id));
    graph.links = graph.links.filter(l => !ids.includes(l.a) && !ids.includes(l.b));
    ids.forEach(id => selected.delete(id));
    rebuild(); recompile(); save(); remember();
  }
  function duplicate() {
    const ids = [...selected].filter(id => { const n = graph.nodes.find(m => m.id === id); return n && !N.NODES[n.type].unique; });
    if (!ids.length) return;
    let next = nextId(); const map = {};
    const copies = ids.map(id => { const n = clone(graph.nodes.find(m => m.id === id)); map[id] = next; n.id = next++; n.x += 40; n.y += 40; return n; });
    graph.nodes.push(...copies);
    graph.links.filter(l => map[l.a] && map[l.b]).forEach(l => graph.links.push({ ...l, a: map[l.a], b: map[l.b] }));
    select(copies.map(c => c.id));
    rebuild(); recompile(); save(); remember();
  }

  /* ── Popups: add menu, examples, audio, help ───────────── */
  function closePops() { document.querySelectorAll('.lab-pop').forEach(p => { p.hidden = true; }); }
  function openPop(pop, x, y) {
    closePops();
    pop.hidden = false;
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    pop.style.top = Math.min(Math.max(48, y), innerHeight - r.height - 8) + 'px';
  }
  const addPop = $('#addMenu'), addSearch = $('#addSearch'), addList = $('#addList');
  let addAt = [0, 0];
  function fillAdd(q) {
    addList.textContent = '';
    q = (q || '').toLowerCase();
    for (const cat of N.CATEGORIES) {
      const items = Object.entries(N.NODES).filter(([k, d]) => d.cat === cat && (!q || d.title.toLowerCase().includes(q) || k.includes(q)));
      if (!items.length) continue;
      addList.append(el('h4', '', cat));
      for (const [k, d] of items) {
        const b = el('button', 'item'); const dot = el('i'); dot.style.setProperty('--cat', CAT_COLOR[cat]);
        b.append(dot, document.createTextNode(d.title));
        b.addEventListener('click', () => { closePops(); addNode(k, addAt[0], addAt[1]); });
        addList.append(b);
      }
    }
  }
  function showAdd(cx, cy) {
    addAt = toWorld(cx, cy);
    fillAdd(''); addSearch.value = '';
    openPop(addPop, cx, cy);
    addSearch.focus();
  }
  addSearch.addEventListener('input', () => fillAdd(addSearch.value));
  addSearch.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const first = addList.querySelector('.item'); if (first) first.click(); }
    if (e.key === 'Escape') closePops();
  });
  work.addEventListener('contextmenu', e => { e.preventDefault(); showAdd(e.clientX, e.clientY); });
  $('#btnAdd').addEventListener('click', e => { const r = work.getBoundingClientRect(); showAdd(r.left + r.width * 0.35, r.top + 80); e.stopPropagation(); });

  const exPop = $('#examples');
  PRESETS.forEach((p, i) => {
    const b = el('button', 'item', p.name);
    b.addEventListener('click', () => { closePops(); graph = ensureControls(clone(p.graph)); selected.clear(); rebuild(); recompile(); save(); remember(); frameAll(); toast('Ejemplo: ' + p.name); });
    exPop.append(b);
  });
  $('#btnExamples').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); openPop(exPop, r.left, r.bottom + 4); e.stopPropagation(); });
  // Patch menu: new / open / save / random / vary
  const patchPop = $('#patchPop');
  $('#btnPatch').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); openPop(patchPop, r.left, r.bottom + 4); e.stopPropagation(); });
  patchPop.addEventListener('click', e => { if (e.target.closest('.item')) setTimeout(closePops, 0); });
  $('#pmRandom').addEventListener('click', () => randomPatch());
  $('#pmVary').addEventListener('click', () => varyPatch());
  // help: tabs by topic, remembers the last one
  const help = $('#help');
  function helpTab(t) {
    if (!help.querySelector(`[data-sec="${t}"]`)) t = 'start';
    help.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('is-on', b.dataset.tab === t));
    help.querySelectorAll('[data-sec]').forEach(sec => { sec.hidden = sec.dataset.sec !== t; });
    help.scrollTop = 0;
    try { localStorage.setItem('pudrus_nodes_help_tab', t); } catch (err) { /* ignore */ }
  }
  help.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => helpTab(b.dataset.tab)));
  function toggleHelp() {
    if (!help.hidden) { closePops(); return; }
    let t = 'start';
    try { t = localStorage.getItem('pudrus_nodes_help_tab') || 'start'; } catch (err) { /* ignore */ }
    helpTab(t);
    const r = $('#btnHelp').getBoundingClientRect();
    openPop(help, r.right - Math.min(640, innerWidth - 16), r.bottom + 4);
  }
  $('#btnHelp').addEventListener('click', e => { e.stopPropagation(); toggleHelp(); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.lab-pop, .lab-btn')) closePops(); });

  $('#btnNew').addEventListener('click', () => {
    if (!confirm('¿Empezar un patch nuevo? (el actual se pierde si no lo guardaste)')) return;
    graph = { nodes: [
      { id: 1, type: 'noise', x: 60, y: 60, v: N.defaultsFor('noise').v, p: {} },
      { id: 2, type: 'palette', x: 320, y: 60, v: N.defaultsFor('palette').v, p: N.defaultsFor('palette').p },
      { id: 3, type: 'output', x: 580, y: 60, v: N.defaultsFor('output').v, p: N.defaultsFor('output').p },
    ], links: [{ a: 1, ao: 'v', b: 2, bi: 'v' }, { a: 2, ao: 'c', b: 3, bi: 'c' }] };
    ensureControls(graph);
    selected.clear(); rebuild(); recompile(); save(); remember(); frameAll();
  });
  // Save / open patch files
  const blobToDataURL = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
  $('#btnSave').addEventListener('click', async () => {
    // images used by the patch travel inside the file
    const assets = {};
    for (const n of graph.nodes) {
      const id = n.p && n.p.img;
      if (n.type === 'image' && id && !assets[id]) { try { const b = await N.assets.get(id); const d = b && await blobToDataURL(b); if (d) assets[id] = d; } catch (e) { /* missing */ } }
    }
    const blob = new Blob([JSON.stringify({ pudrusNodes: 1, graph, assets }, null, 1)], { type: 'application/json' });
    if (graph.nodes.some(n => n.type === 'video' && n.p && n.p.vid)) toast('Ojo: los videos no viajan dentro del archivo (quedan sólo en este navegador)');
    const a = document.createElement('a'); a.download = `nodrus_patch_${Date.now()}.json`; a.href = URL.createObjectURL(blob); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#fileOpen').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const g = data.graph || data;
      if (!Array.isArray(g.nodes) || !Array.isArray(g.links) || g.nodes.some(n => !N.NODES[n.type])) throw new Error('formato');
      for (const [id, d] of Object.entries(data.assets || {})) {
        if (!/^img-[a-z0-9]+$/.test(id) || typeof d !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(d)) continue;
        await N.assets.put(id, await (await fetch(d)).blob());
      }
      graph = ensureControls(g); selected.clear(); rebuild(); recompile(); save(); remember(); frameAll();
      toast('Patch cargado');
    } catch (err) { toast('Ese archivo no es un patch válido', true); }
  });
  $('#btnOpen').addEventListener('click', () => $('#fileOpen').click());

  /* ── Right-click a value: animate it with an LFO or the audio ── */
  let valueTarget = null;
  function modulate(kind, band) {
    closePops();
    const t = valueTarget && graph.nodes.find(m => m.id === valueTarget.id);
    if (!t) return;
    const inp = N.NODES[t.type].inputs.find(i => i.k === valueTarget.k);
    const cur = t.v && t.v[inp.k] !== undefined ? t.v[inp.k] : inp.v;
    const range = ((inp.max ?? 1) - (inp.min ?? 0)) || 1;
    const span = Math.min(range * 0.15, Math.max(Math.abs(cur) * 0.5, range * 0.05));   // a musical amount around the current value
    const lo = Math.max(inp.min ?? -Infinity, cur - span), hi = Math.min(inp.max ?? Infinity, cur + span);
    const round = x => Math.round(x * 1000) / 1000;
    const y = t.y + 30 + N.NODES[t.type].inputs.indexOf(inp) * 18;
    let id = nextId();
    const added = [];
    if (kind === 'lfo') {
      const d = N.defaultsFor('lfo');
      const l = { id: id++, type: 'lfo', x: t.x - 240, y, v: { ...d.v, speed: 0.25, min: round(lo), max: round(hi) }, p: d.p };
      graph.nodes.push(l); added.push(l.id);
      graph.links = graph.links.filter(x => !(x.b === t.id && x.bi === inp.k));
      graph.links.push({ a: l.id, ao: 'v', b: t.id, bi: inp.k });
      toast('LFO conectado: ajustá Velocidad, Mín y Máx');
    } else {
      let a = graph.nodes.find(m => m.type === 'audio');
      if (!a) { a = { id: id++, type: 'audio', x: t.x - 480, y, v: N.defaultsFor('audio').v, p: {} }; graph.nodes.push(a); added.push(a.id); }
      const r = { id: id++, type: 'range', x: t.x - 240, y, v: { v: 0, min: round(cur), max: round(cur + span * 2 > (inp.max ?? Infinity) ? cur - span * 2 : cur + span * 2) }, p: {} };
      graph.nodes.push(r); added.push(r.id);
      graph.links = graph.links.filter(x => !(x.b === t.id && x.bi === inp.k));
      graph.links.push({ a: a.id, ao: band, b: r.id, bi: 'v' }, { a: r.id, ao: 'v', b: t.id, bi: inp.k });
      toast(audio.on ? 'Conectado al audio: el nodo Rango define cuánto se mueve' : 'Conectado al audio · activá «🎤 Audio» para que reaccione');
    }
    select(added);
    rebuild(); recompile(); save(); remember();
  }
  $('#vpLfo').addEventListener('click', () => modulate('lfo'));
  $('#vpCtl').addEventListener('click', () => { closePops(); if (valueTarget) toggleControl(valueTarget.id, valueTarget.k); });
  $('#vpMidi').addEventListener('click', () => { closePops(); if (!valueTarget) return; const n = graph.nodes.find(m => m.id === valueTarget.id); midiLearn({ kind: 'value', id: valueTarget.id, k: valueTarget.k, t: n && n.type }); });
  $('#vpMidiForget').addEventListener('click', () => { closePops(); if (valueTarget) midiForget(t => t.kind === 'value' && t.id === valueTarget.id && t.k === valueTarget.k); });
  document.querySelectorAll('#valuePop [data-band]').forEach(b => b.addEventListener('click', () => modulate('audio', b.dataset.band)));

  /* ── Images for the Image node ─────────────────────────── */
  const filePick = el('input'); filePick.type = 'file'; filePick.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'; filePick.hidden = true;
  document.body.append(filePick);
  let pickFor = null;
  function pickImage(n) { pickFor = n; filePick.click(); }
  filePick.addEventListener('change', () => { const f = filePick.files[0]; filePick.value = ''; if (f && pickFor) setImage(pickFor, f); });
  // keep at most 1024 px (plenty for a logo) and keep the transparency
  function storeImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1024 / Math.max(im.naturalWidth || 1024, im.naturalHeight || 1024));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round((im.naturalWidth || 1024) * k)); c.height = Math.max(1, Math.round((im.naturalHeight || 1024) * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => {
          if (!b) { rej(new Error('imagen')); return; }
          const id = 'img-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
          N.assets.put(id, b).then(() => res(id), rej);
        }, 'image/png');
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('imagen')); };
      im.src = url;
    });
  }
  async function setImage(n, file) {
    try {
      const id = await storeImage(file);
      n.p = { ...(n.p || {}), img: id, name: file.name.slice(0, 28) };
      rebuild(); recompile(); save(); remember();
      toast('Imagen cargada: ' + file.name);
    } catch (e) { toast('No se pudo leer esa imagen', true); }
  }
  const videoPick = el('input'); videoPick.type = 'file'; videoPick.accept = 'video/mp4,video/webm,video/quicktime,video/*'; videoPick.hidden = true;
  document.body.append(videoPick);
  function pickVideo(n) { pickFor = n; videoPick.click(); }
  videoPick.addEventListener('change', () => { const f = videoPick.files[0]; videoPick.value = ''; if (f && pickFor) setVideo(pickFor, f); });
  async function setVideo(n, file) {
    if (file.size > 400e6) { toast('Ese video es muy pesado (máx. 400 MB)', true); return; }
    try {
      const id = 'vid-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await N.assets.put(id, file);
      n.p = { ...(n.p || {}), vid: id, name: file.name.slice(0, 28) };
      rebuild(); recompile(); save(); remember();
      toast('Video cargado: ' + file.name);
    } catch (e) { toast('No se pudo guardar ese video', true); }
  }
  // drop image files on the workspace -> new Image node there
  work.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  work.addEventListener('drop', e => {
    const f = [...e.dataTransfer.files].find(x => /^(image|video)\//.test(x.type));
    if (!f) return;
    e.preventDefault();
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const kind = /^video\//.test(f.type) ? 'video' : 'image';
    selected.clear();
    addNode(kind, wx, wy);
    const n = graph.nodes[graph.nodes.length - 1];
    if (n && n.type === kind) (kind === 'video' ? setVideo : setImage)(n, f);
  });

  /* ── Code editor for the GLSL node ──────────────────────── */
  const codePop = $('#codePop'), codeArea = $('#codeArea'), codeErr = $('#codeErr');
  let codeNode = null;
  function openCode(n) {
    codeNode = n;
    codeArea.value = (n.p && n.p.code !== undefined) ? n.p.code : N.NODES.glsl.params[0].v;
    codeErr.textContent = ''; codeErr.classList.remove('is-err');
    $('#codeTitle').textContent = 'GLSL · nodo #' + n.id;
    closePops(); codePop.hidden = false;
    setTimeout(() => codeArea.focus(), 0);
  }
  function applyCode() {
    if (!codeNode || !graph.nodes.includes(codeNode)) { codePop.hidden = true; return; }
    codeNode.p = { ...(codeNode.p || {}), code: codeArea.value };
    const err = recompile();
    if (err) {
      // point at the line of *your* code, not of the whole shader
      let msg = String(err);
      try {
        const fr = N.compile(graph).frag, mark = `// GLSL #${codeNode.id}\n`, at = fr.indexOf(mark);
        if (at >= 0) {
          const start = fr.slice(0, at).split('\n').length + 1;
          msg = msg.replace(/ERROR:\s*\d+:(\d+):/g, (_, ln) => `línea ${Math.max(1, +ln - start + 1)}:`);
        }
      } catch (e) { /* keep raw */ }
      codeErr.textContent = msg.split('\n').filter(Boolean).slice(0, 6).join('\n');
      codeErr.classList.add('is-err');
      return;
    }
    codeErr.textContent = 'Compilado ✓' + (opts.direct ? '' : ' · Enter fuera del editor lo manda al aire');
    codeErr.classList.remove('is-err');
    rebuild(); save(); remember();
  }
  $('#codeApply').addEventListener('click', applyCode);
  $('#codeClose').addEventListener('click', () => { codePop.hidden = true; });
  $('#codeTpl').addEventListener('change', e => {
    const t = N.GLSL_TEMPLATES[e.target.value];
    if (t && (codeArea.value.trim() === '' || confirm('¿Reemplazar el código por la plantilla?'))) codeArea.value = t;
    e.target.value = '';
  });
  codeArea.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyCode(); }
    else if (e.key === 'Escape') { codePop.hidden = true; }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const a = codeArea.selectionStart, b = codeArea.selectionEnd;
      codeArea.value = codeArea.value.slice(0, a) + '  ' + codeArea.value.slice(b);
      codeArea.selectionStart = codeArea.selectionEnd = a + 2;
    }
  });

  /* ── Keyboard ──────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    // shortcuts are ignored only while typing (text fields, menus), not on sliders or checkboxes
    if (e.target && e.target.matches && e.target.matches('textarea, select, input:not([type=range]):not([type=checkbox]):not([type=color]):not([type=button])')) return;
    if (e.target && e.target.matches && e.target.matches('input[type=range], input[type=checkbox]') && e.key.startsWith('Arrow')) return;   // arrows still move the slider
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.shiftKey && k === 'a') { e.preventDefault(); showAdd(lastPointer[0], lastPointer[1]); }
    else if ((k === 'x' || k === 'delete' || k === 'backspace') && selected.size) { e.preventDefault(); removeNodes([...selected]); }
    else if ((mod || e.shiftKey) && k === 'd') { e.preventDefault(); duplicate(); }
    else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) { e.preventDefault(); redo(); }
    else if (mod && k === 's') { e.preventDefault(); $('#btnSave').click(); }
    else if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 'f') { e.preventDefault(); fullscreen(); }
    else if (k === 'home' || k === '.') { e.preventDefault(); frameAll(); }
    else if (k === 'b') { e.preventDefault(); setBackdrop(!work.classList.contains('backdrop')); }
    else if (k === 'escape') { closePops(); if (learning) { learning = null; toast('Aprendizaje MIDI cancelado'); } }
    else if (k === 'enter' && !mod) { e.preventDefault(); goLive(); }
    else if (k === 'p' && !mod) { e.preventDefault(); setThumbs(!opts.thumbs); }
    else if (k === 'n' && !mod) { e.preventDefault(); setBlack(!stage.black); }
    else if (k === 's' && !mod) { e.preventDefault(); if (!e.repeat) setStrobe(true); }
    else if (k === 't' && !mod) { e.preventDefault(); if (!e.repeat) tap(); }
    else if (/^Digit[1-8]$/.test(e.code) && !mod) {
      e.preventDefault();
      const i = scenePage * 8 + (+e.code.slice(5) - 1);
      if (e.shiftKey) storeScene(i); else fireScene(i);
    }
    else if (e.key === '?' || (k === 'h' && !mod)) { e.preventDefault(); toggleHelp(); }
    else if (k === 'o' && !mod) { e.preventDefault(); setOverlayOn(!ov.on); }
    else if (k === 'r' && !mod) { e.preventDefault(); if (e.shiftKey) varyPatch(); else randomPatch(); }
  });

  document.addEventListener('keyup', e => { if (e.key.toLowerCase() === 's') setStrobe(false); });
  addEventListener('blur', () => { if (stage.strobe) setStrobe(false); });

  /* ── Preview: panel sizes, backdrop, fullscreen ────────── */
  const SIZES = { s: [320, 180], m: [480, 270], l: [720, 405] };
  // Export format (aspect, resolution, fps…): the monitors take its shape, recordings and renders use its size
  const FORMATS = { '16:9': [16, 9, 'Horizontal'], '9:16': [9, 16, 'Vertical'], '4:5': [4, 5, 'Retrato'], '1:1': [1, 1, 'Cuadrado'] };
  const ex = opts.exp = Object.assign({ fmt: '16:9', res: 1080, fps: 60, q: 'alta', dur: 15, loop: true, guides: false }, opts.exp || {});
  if (!FORMATS[ex.fmt]) ex.fmt = '16:9';
  const AR = () => { const f = FORMATS[ex.fmt]; return f[0] / f[1]; };
  const even = x => Math.max(2, Math.round(x / 2) * 2);
  const sizeFor = short => (AR() >= 1 ? [even(short * AR()), short] : [short, even(short / AR())]);
  const baseSize = () => sizeFor(720);          // what the monitors render while you work
  const expSize = () => sizeFor(ex.res);        // what recordings, photos and renders use
  const presetW = L => (AR() >= 1 ? L : Math.round(L * AR()));   // S/M/L = the long side of the monitor
  let recSize = null;
  let size = opts.size && SIZES[opts.size] ? opts.size : 'm';
  // window layout chosen by each user: { pv: {x, y, w}, live: {x, y, w} } in px inside the workspace
  if (!opts.win || typeof opts.win !== 'object') opts.win = {};
  const winKey = el => (el === preview ? 'pv' : 'live');
  function placeWin(el, w, defTop) {
    const k = winKey(el), cfg = opts.win[k] || {}, r = work.getBoundingClientRect();
    w = Math.min(Math.max(120, w), Math.max(120, r.width - 24));
    let h = Math.round(w / AR());
    if (h > r.height - 24) { h = Math.max(120, r.height - 24); w = Math.round(h * AR()); }
    el.style.width = w + 'px'; el.style.height = h + 'px';
    if (Number.isFinite(cfg.x) && Number.isFinite(cfg.y)) {
      el.style.left = Math.min(Math.max(0, cfg.x), Math.max(0, r.width - w)) + 'px';
      el.style.top = Math.min(Math.max(0, cfg.y), Math.max(0, r.height - h)) + 'px';
      el.style.right = 'auto';
    } else { el.style.left = ''; el.style.right = ''; el.style.top = defTop + 'px'; }
    return h;
  }
  const winW = (el, def) => { const c = opts.win[winKey(el)]; return c && Number.isFinite(c.w) ? c.w : def; };
  function makeWindow(box) {
    const grip = el('div', 'win-grip'); grip.title = 'Arrastrá para mover · doble clic: volver a su lugar';
    const handle = el('div', 'win-size'); handle.title = 'Arrastrá para cambiar el tamaño';
    box.append(grip, handle);
    const can = () => !document.fullscreenElement && !(work.classList.contains('backdrop') && box === mainView());
    const start = (e, mode) => {
      if (e.button !== 0 || !can()) return;
      e.preventDefault(); e.stopPropagation();
      const t = e.currentTarget; t.setPointerCapture(e.pointerId);
      const r = box.getBoundingClientRect(), wr = work.getBoundingClientRect();
      const s0 = { x: e.clientX, y: e.clientY, l: r.left - wr.left, t: r.top - wr.top, w: r.width };
      box.classList.add('is-moving');
      const move = ev => {
        const k = winKey(box), cfg = opts.win[k] = { ...(opts.win[k] || {}) };
        if (mode === 'move') { cfg.x = Math.round(s0.l + ev.clientX - s0.x); cfg.y = Math.round(s0.t + ev.clientY - s0.y); cfg.w = cfg.w || Math.round(s0.w); }
        else { cfg.w = Math.round(Math.max(200, s0.w + ev.clientX - s0.x)); if (!Number.isFinite(cfg.x)) { cfg.x = Math.round(s0.l); cfg.y = Math.round(s0.t); } }
        layoutPreview();
      };
      const up = () => { t.removeEventListener('pointermove', move); t.removeEventListener('pointerup', up); box.classList.remove('is-moving'); saveOpts(); };
      t.addEventListener('pointermove', move); t.addEventListener('pointerup', up);
    };
    grip.addEventListener('pointerdown', e => start(e, 'move'));
    handle.addEventListener('pointerdown', e => start(e, 'size'));
    grip.addEventListener('dblclick', () => { delete opts.win[winKey(box)]; saveOpts(); layoutPreview(); });
  }
  // View controls (S/M/L, backdrop, fullscreen) act on what the audience sees:
  // the EN VIVO monitor, or the preview itself when working in Directo.
  const mainView = () => opts.direct ? preview : $('#live');
  function layoutPreview() {
    const live = $('#live'), main = mainView(), back = work.classList.contains('backdrop');
    const bar = document.querySelector('.lab-preview-bar');
    if (bar.parentNode !== main) main.append(bar);
    const mixEl = $('#mixer'); if (mixEl && mixEl.parentNode !== main) main.append(mixEl);
    const fsEl = document.fullscreenElement;
    let pvH = SIZES.s[1];
    const workSize = () => { const r = work.getBoundingClientRect(), s = Math.min(1, 1920 / r.width), d = Math.min(devicePixelRatio, 1.5) * s; return [r.width * d, r.height * d]; };
    const screenSize = () => [Math.min(2560, screen.width * devicePixelRatio), Math.min(1440, screen.height * devicePixelRatio)];
    // editor preview
    if (fsEl === preview) renderer.resize(...screenSize());
    else if (opts.direct && back) renderer.resize(...workSize());
    else {
      pvH = placeWin(preview, winW(preview, presetW((opts.direct ? SIZES[size] : SIZES.s)[0])), 12);
      renderer.resize(...baseSize());   // 720p-class inside, scaled down by CSS
    }
    if (opts.direct && back) { preview.style.left = preview.style.top = preview.style.right = ''; }
    // on-air monitor (keeps 720p while recording so the video size never changes)
    if (!opts.direct) {
      if (fsEl === live && !recSize) stage.resize(...screenSize());
      else if (back && !recSize) stage.resize(...workSize());
      else stage.resize(...(recSize || baseSize()));
      const pvBox = opts.win.pv && Number.isFinite(opts.win.pv.x) ? Math.round(presetW(SIZES.s[0]) / AR()) : pvH;   // a moved preview leaves the default spot free
      if (!back) placeWin(live, winW(live, presetW(SIZES[size][0])), 12 + pvBox + 12);
      else { live.style.width = live.style.height = live.style.top = live.style.left = live.style.right = ''; }
    } else stage.resize(...(recSize || baseSize()));
    paintGuides();
  }
  function setBackdrop(on) {
    work.classList.toggle('backdrop', on);
    $('#pvBack').classList.toggle('is-on', on);
    layoutPreview();
  }
  document.querySelectorAll('[data-size]').forEach(b => {
    b.classList.toggle('is-on', b.dataset.size === size);
    b.addEventListener('click', () => {
      size = opts.size = b.dataset.size;
      const k = winKey(mainView()); if (opts.win[k]) delete opts.win[k].w;
      saveOpts(); setBackdrop(false);
      document.querySelectorAll('[data-size]').forEach(x => x.classList.toggle('is-on', x === b));
    });
  });
  $('#pvBack').addEventListener('click', () => setBackdrop(!work.classList.contains('backdrop')));
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else mainView().requestFullscreen().catch(() => toast('El navegador no permitió pantalla completa', true));
  }
  $('#btnFull').addEventListener('click', fullscreen);
  $('#pvFull').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', layoutPreview);
  addEventListener('resize', () => { layoutPreview(); drawLinks(); });

  function togglePlay() {
    playing = !playing;
    $('#btnPlay').innerHTML = playing ? '❚❚<span class="t"> Pausa</span>' : '▶<span class="t"> Play</span>';
    broadcast({ type: 'play', playing });
  }
  $('#btnPlay').addEventListener('click', togglePlay);

  /* ── Audio ─────────────────────────────────────────────── */
  const audio = {
    on: false, bands: [0, 0, 0, 0], gain: 1, an: null, data: null, ctx: null, stream: null,
    async start(deviceId) {
      this.stop();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.55;
      src.connect(this.an);
      this.data = new Uint8Array(this.an.frequencyBinCount);
      this.on = true;
    },
    stop() {
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx) this.ctx.close().catch(() => {});
      this.on = false; this.stream = this.ctx = this.an = null; this.bands = [0, 0, 0, 0];
    },
    read() {
      if (!this.on) return this.bands;
      this.an.getByteFrequencyData(this.data);
      const hz = this.ctx.sampleRate / this.an.fftSize;
      const band = (lo, hi) => { let s = 0, n = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(this.data.length - 1, Math.ceil(hi / hz)); i++) { s += this.data[i]; n++; } return n ? s / n / 255 : 0; };
      const raw = [band(20, 12000), band(20, 150), band(150, 2000), band(2000, 12000)];
      this.bands = this.bands.map((b, i) => {
        const v = Math.min(1, Math.pow(raw[i] * this.gain * 1.8, 1.3));
        return v > b ? b + (v - b) * 0.6 : b + (v - b) * 0.12;   // fast attack, slower release
      });
      return this.bands;
    },
  };
  const audioPop = $('#audioPop'), devSel = $('#audioDevice');
  async function listDevices() {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
      devSel.textContent = '';
      devs.forEach((d, i) => { const o = el('option', '', d.label || 'Entrada ' + (i + 1)); o.value = d.deviceId; devSel.append(o); });
    } catch (e) { /* no devices */ }
  }
  $('#btnAudio').addEventListener('click', async e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    if (!audio.on) {
      try { await audio.start(devSel.value || undefined); await listDevices(); $('#btnAudio').classList.add('is-on'); toast('Audio activado'); }
      catch (err) { toast('No se pudo usar el micrófono / entrada de audio', true); return; }
    }
    openPop(audioPop, r.left, r.bottom + 4);
  });
  devSel.addEventListener('change', async () => { try { await audio.start(devSel.value); } catch (e) { toast('No se pudo usar esa entrada', true); } });
  $('#audioGain').addEventListener('input', e => { audio.gain = +e.target.value; $('#audioGainVal').textContent = (+e.target.value).toFixed(1) + '×'; });
  $('#audioOff').addEventListener('click', () => { audio.stop(); $('#btnAudio').classList.remove('is-on'); closePops(); toast('Audio apagado'); });
  const meters = [...document.querySelectorAll('#meter i')];

  /* ── Photo / record ────────────────────────────────────── */
  const fileTag = () => `nodrus_${ex.fmt.replace(':', 'x')}_${expSize().join('x')}_${Date.now()}`;
  function saveBlob(b, name, ms) { const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(b); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), ms || 10000); }
  function takePhoto() {
    // one frame at the full export size
    const keep = recSize;
    recSize = recSize || expSize(); stage.resize(...recSize);
    stage.render(time, audio.bands);
    stage.canvas.toBlob(b => { recSize = keep; layoutPreview(); if (b) { saveBlob(b, fileTag() + '.png', 5000); toast('Foto guardada · ' + expSize().join('×')); } }, 'image/png');
  }
  $('#btnPhoto').addEventListener('click', takePhoto);
  // bitrate by size, fps and quality (H.264, roughly what social networks like)
  const bitrateFor = ([w, h], fps) => Math.round(Math.min(80e6, Math.max(4e6, w * h * fps * ({ normal: 0.07, alta: 0.12, max: 0.2 }[ex.q] || 0.12))));
  let rec = null;
  $('#btnRec').addEventListener('click', () => {
    const b = $('#btnRec');
    if (rec) { rec.stop(); rec = null; recSize = null; layoutPreview(); b.classList.remove('is-rec'); b.innerHTML = '●<span class="t"> Grabar</span>'; paintExport(); return; }
    if (!stage.canvas.captureStream || typeof MediaRecorder === 'undefined') { toast('Este navegador no puede grabar video', true); return; }
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    recSize = expSize(); stage.resize(...recSize);   // record at the export size and fps
    const stream = stage.canvas.captureStream(ex.fps);
    if (audio.stream && $('#recAudio').checked) audio.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const chunks = [];
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrateFor(recSize, ex.fps) } : undefined);
    r.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    r.onstop = () => {
      const type = r.mimeType || 'video/webm';
      saveBlob(new Blob(chunks, { type }), `${fileTag()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
      toast('Video guardado');
    };
    r.start(); rec = r; b.classList.add('is-rec'); b.innerHTML = '■<span class="t"> Detener</span>'; paintExport();
    toast(`Grabando en vivo · ${recSize.join('×')} · ${ex.fps} fps`);
  });

  /* ── Output window (second screen / projector) ─────────── */
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('pudrus-nodes') : null;
  function broadcast(msg) { if (channel) channel.postMessage(msg); }
  if (channel) channel.onmessage = e => { if (e.data && e.data.type === 'hello') { liveByDeck[deckSel] = liveGraph; ['A', 'B'].forEach(d => broadcast({ type: 'live', graph: liveByDeck[d], fade: 0, deck: d })); broadcastMix(); broadcast({ type: 'play', playing }); broadcastMaster(0); broadcast({ type: 'overlay', ov }); } };
  $('#btnOut').addEventListener('click', () => {
    const w = window.open('output.html', 'pudrus-output', 'width=960,height=540');
    if (!w) toast('El navegador bloqueó la ventana: permití las ventanas emergentes', true);
    else toast('Arrastrá la ventana al proyector y hacé doble clic para pantalla completa');
  });

  /* ── Live: preview (editor) / on air (program) ──────────── */
  const liveBox = $('#live');
  const stage = N.createMixer(liveBox);   // two decks (A / B) + crossfader, overlay, black/strobe
  stage.resize(1280, 720);
  let liveGraph = clone(graph);
  const liveByDeck = { A: liveGraph, B: { nodes: [], links: [] } };
  let deckSel = 'A';
  const contentKey = g => JSON.stringify({ n: g.nodes.map(n => [n.id, n.type, n.v, n.p]), l: g.links });
  let liveKey = contentKey(liveGraph);
  try { stage.go(liveGraph, 0); } catch (e) { console.error(e); }

  function markPending() {
    const pending = !opts.direct && contentKey(graph) !== liveKey;
    $('#btnGo').classList.toggle('is-pending', pending);
  }
  function sendDirect() {
    liveGraph = liveByDeck[deckSel] = graph; liveKey = contentKey(graph);
    try { stage.direct(graph); } catch (e) { return; }
    broadcast({ type: 'direct', graph, deck: deckSel });
  }
  // Put a patch on air (cross-fade); by default the one in the editor
  function goLive(g, fade) {
    g = g || graph;
    const sec = fade === undefined ? opts.fade : fade;
    const next = ensureControls(opts.direct && g === graph ? graph : clone(g));
    try { stage.go(next, sec); } catch (e) { toast('Ese patch no compila; sigue al aire el anterior', true); return; }
    liveGraph = liveByDeck[deckSel] = next; liveKey = contentKey(next);
    broadcast({ type: 'live', graph: next, fade: sec, deck: deckSel });
    markPending();
    pushState(); paintControls();
    liveBox.classList.remove('is-flash'); void liveBox.offsetWidth; liveBox.classList.add('is-flash');
  }
  $('#btnGo').addEventListener('click', () => goLive());

  const fadeSel = $('#fadeSel');
  fadeSel.value = String(opts.fade);
  if (fadeSel.value !== String(opts.fade)) { opts.fade = 1; fadeSel.value = '1'; }
  fadeSel.addEventListener('change', () => { opts.fade = +fadeSel.value; saveOpts(); fadeSel.blur(); pushState(); });

  function setDirect(on) {
    opts.direct = on; saveOpts();
    $('#btnDirect').classList.toggle('is-on', on);
    work.classList.toggle('is-direct', on);
    if (on) { goLive(graph, 0); sendDirect(); }
    else { liveGraph = liveByDeck[deckSel] = clone(graph); stage.direct(liveGraph); liveKey = contentKey(liveGraph); }
    markPending();
    layoutPreview();
  }
  $('#btnDirect').addEventListener('click', () => { setDirect(!opts.direct); toast(opts.direct ? 'Directo: todo lo que tocás sale al aire' : 'Preview: preparás acá y mandás con «Al aire» (Enter)'); });

  /* ── Decks A / B and crossfader (like Resolume) ─────────── */
  function broadcastMix() { broadcast({ type: 'mix', x: stage.x, mode: stage.mode }); }
  function paintMixer() {
    document.querySelectorAll('#mixer [data-deck]').forEach(b => b.classList.toggle('is-on', b.dataset.deck === deckSel));
    const xf = $('#xfader'); if (document.activeElement !== xf) xf.value = stage.x;
    $('#xmode').value = stage.mode;
    $('#btnGo').innerHTML = '⏵ Al aire' + (stage.x > 0 || deckSel === 'B' ? ` <b class="deck-l">${deckSel}</b>` : '');
    const tag = $('#live .lab-tag'); if (tag) tag.textContent = '● EN VIVO' + (stage.x > 0 || deckSel === 'B' ? ` · editás ${deckSel}` : '');
  }
  function selectDeck(d) {
    d = d === 'B' ? 'B' : 'A';
    if (d === deckSel) return;
    liveByDeck[deckSel] = liveGraph;
    deckSel = d; stage.deck = d;
    liveGraph = liveByDeck[d]; liveKey = contentKey(liveGraph);
    markPending(); paintMixer(); paintControls(); pushState();
    toast(`Capa ${d}: «Al aire», escenas y controles van a la capa ${d}`);
  }
  function setXf(v, quiet) {
    stage.x = v; paintMixer();
    oscSend('/nodrus/xf', +stage.x.toFixed(3));
    broadcastMix();
    if (!quiet) pushState();
  }
  document.querySelectorAll('#mixer [data-deck]').forEach(b => {
    b.addEventListener('click', () => selectDeck(b.dataset.deck));
    b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); midiLearn({ kind: 'deck', d: b.dataset.deck }); });
  });
  $('#xfader').addEventListener('input', e => setXf(+e.target.value));
  $('#xfader').addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); midiLearn({ kind: 'xf' }); });
  $('#xmode').addEventListener('change', e => { stage.mode = e.target.value; broadcastMix(); pushState(); e.target.blur(); });
  ['pointerdown', 'wheel'].forEach(t => $('#mixer').addEventListener(t, e => e.stopPropagation()));

  /* ── Scenes: 8 slots, keys 1–8 put them on air ──────────── */
  const SCENES = 'pudrus_nodes_scenes_v1';
  let scenes = (() => { try { const a = JSON.parse(localStorage.getItem(SCENES) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } })();
  scenes.length = 16;
  let scenePage = 0;
  const saveScenes = () => { try { localStorage.setItem(SCENES, JSON.stringify(scenes)); } catch (e) { toast('No hay espacio para guardar la escena', true); } };
  const sceneBar = $('#scenes');
  let liveScene = -1, pendingShot = -1;
  const shotCanvas = document.createElement('canvas'); shotCanvas.width = 160; shotCanvas.height = 90;

  function paintScenes() {
    sceneBar.textContent = '';
    const pg = el('button', 'scene-page', scenePage ? '9–16' : '1–8');
    pg.title = 'Cambiar de página de escenas (las teclas 1–8 usan la página visible)';
    pg.addEventListener('click', () => { scenePage = 1 - scenePage; paintScenes(); });
    sceneBar.append(pg);
    for (let i = scenePage * 8; i < scenePage * 8 + 8; i++) {
      const sc = scenes[i];
      const b = el('div', 'scene' + (sc ? '' : ' is-empty') + (i === liveScene ? ' is-live' : ''));
      b.dataset.i = i;
      const key = i % 8 + 1;
      b.title = sc ? `Escena ${i + 1}: clic = abrir en el editor · ${key} = al aire · clic derecho = opciones` : `Vacía: clic o Shift+${key} guarda el patch del editor`;
      if (sc && sc.thumb) b.style.backgroundImage = `url(${sc.thumb})`;
      b.append(el('span', 'scene-n', String(i + 1)));
      if (sc) {
        const go = el('button', 'scene-go', '⏵'); go.title = 'Al aire';
        go.addEventListener('click', ev => { ev.stopPropagation(); fireScene(i); });
        b.append(go);
      }
      b.addEventListener('click', () => { if (scenes[i]) openScene(i); else storeScene(i); });
      b.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); scenePopAt = i; openPop(scenePop, ev.clientX, ev.clientY - 120); $('#scDel').hidden = $('#scGo').hidden = !scenes[i]; });
      sceneBar.append(b);
    }
    pushState();
  }
  function storeScene(i) {
    scenes[i] = { graph: clone(graph), thumb: (scenes[i] && scenes[i].thumb) || '' };
    pendingShot = i;   // the thumbnail is grabbed from the preview on the next frame
    saveScenes(); paintScenes();
    toast(`Escena ${i + 1} guardada`);
  }
  function openScene(i) {
    graph = ensureControls(clone(scenes[i].graph)); selected.clear();
    rebuild(); recompile(); save(); remember(); frameAll();
    toast(`Escena ${i + 1} en el editor` + (opts.direct ? '' : ' · Enter para mandarla al aire'));
  }
  function fireScene(i) {
    const sc = scenes[i];
    if (!sc) { toast(`La escena ${i + 1} está vacía (Shift+${i % 8 + 1} para guardar)`); return; }
    if (Math.floor(i / 8) !== scenePage) scenePage = Math.floor(i / 8);
    if (opts.direct) { graph = clone(sc.graph); selected.clear(); rebuild(); recompile(); save(); remember(); }
    goLive(opts.direct ? graph : sc.graph);
    liveScene = i; paintScenes();
    oscSend('/nodrus/scene', i + 1);
  }
  // next / previous filled scene (phone, MIDI)
  function stepScene(d) {
    for (let n = 1; n <= 16; n++) {
      const i = ((liveScene < 0 ? (d > 0 ? -1 : 0) : liveScene) + d * n + 32) % 16;
      if (scenes[i]) { fireScene(i); return; }
    }
  }
  const scenePop = $('#scenePop');
  let scenePopAt = 0;
  $('#scSave').addEventListener('click', () => { closePops(); storeScene(scenePopAt); });
  $('#scGo').addEventListener('click', () => { closePops(); fireScene(scenePopAt); });
  $('#scMidi').addEventListener('click', () => { closePops(); midiLearn({ kind: 'scene', i: scenePopAt }); });
  $('#scDel').addEventListener('click', () => { closePops(); scenes[scenePopAt] = null; if (liveScene === scenePopAt) liveScene = -1; saveScenes(); paintScenes(); });
  function grabShot() {
    if (pendingShot < 0) return;
    const i = pendingShot; pendingShot = -1;
    if (!scenes[i]) return;
    try {
      const c = shotCanvas.getContext('2d');
      c.drawImage(view, 0, 0, 160, 90);
      scenes[i].thumb = shotCanvas.toDataURL('image/jpeg', 0.7);
      saveScenes(); paintScenes();
    } catch (e) { /* no thumbnail */ }
  }

  /* ── Node thumbnails (like Blender's node previews) ─────── */
  const THUMB_W = 160, THUMB_H = 90;
  const thumbs = N.createThumbs(THUMB_W, THUMB_H);
  const thumbCompiled = new Map();
  let thumbKey = '', thumbLast = 0;
  function setThumbs(on) {
    opts.thumbs = on; saveOpts();
    $('#btnThumbs').classList.toggle('is-on', on);
    rebuild();
  }
  $('#btnThumbs').addEventListener('click', () => setThumbs(!opts.thumbs));
  function drawThumbs(now, a) {
    if (!opts.thumbs || !thumbs || now - thumbLast < 80) return;
    thumbLast = now;
    const key = N.structureKey(graph);
    if (key !== thumbKey) { thumbCompiled.clear(); thumbs.clear(); thumbKey = key; }
    const wr = work.getBoundingClientRect();
    els.forEach((r, id) => {
      if (!r.thumb) return;
      const br = r.thumb.c.getBoundingClientRect();
      if (br.right < wr.left || br.left > wr.right || br.bottom < wr.top || br.top > wr.bottom) return;   // off screen
      const n = graph.nodes.find(m => m.id === id);
      if (!n) return;
      let comp = thumbCompiled.get(id);
      if (comp === undefined) {
        const out = (N.NODES[n.type].outputs || [])[0];
        try { comp = N.compile(graph, { id, out: out[0] }); } catch (e) { comp = null; }
        thumbCompiled.set(id, comp);
      }
      if (!comp) return;
      try {
        thumbs.render(key + '|' + id, comp, graph, time, a);
        r.thumb.ctx.drawImage(thumbs.canvas, 0, 0);
      } catch (e) { thumbCompiled.set(id, null); }
    });
  }

  /* ── Master: black, strobe, tap tempo ───────────────────── */
  const pvOv = el('canvas', 'pv-ov');   // overlay layer over the preview when working in Directo
  preview.append(pvOv);
  const pvVeil = el('div', 'pv-veil');
  preview.append(pvVeil);
  function broadcastMaster(fade) { broadcast({ type: 'master', black: stage.black, strobe: stage.strobe, fade }); }
  function setBlack(on) {
    stage.setBlack(on, opts.fade || 0);
    broadcastMaster(opts.fade || 0);
    $('#btnBlack').classList.toggle('is-rec', on);
    pushState();
  }
  function setStrobe(on) {
    if (stage.strobe === !!on) return;
    stage.setStrobe(on);
    broadcastMaster(0);
    $('#btnStrobe').classList.toggle('is-on', !!on);
  }
  $('#btnBlack').addEventListener('click', () => setBlack(!stage.black));
  const sb = $('#btnStrobe');
  sb.addEventListener('pointerdown', e => { if (e.button === 0) { sb.setPointerCapture(e.pointerId); setStrobe(true); } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => sb.addEventListener(t, () => setStrobe(false)));

  let bpm = opts.bpm || 120, beatOrigin = 0, taps = [];
  const beatNow = () => (time - beatOrigin) * bpm / 60;
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now); if (taps.length > 8) taps.shift();
    if (taps.length >= 2) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      bpm = Math.round(Math.min(240, Math.max(40, 60000 / iv)) * 10) / 10;
      opts.bpm = bpm; saveOpts();
    }
    // keep the beat count continuous, but land exactly on a beat at the tap
    beatOrigin = time - Math.round(beatNow()) * 60 / bpm;
    $('#bpm').textContent = Math.round(bpm);
    pushState();
  }
  $('#btnTap').addEventListener('click', tap);
  $('#bpm').textContent = Math.round(bpm);

  /* ── Live controls: values you play from the phone or MIDI ── */
  const CTL_STORE = 'pudrus_nodes_ctl_v1', MIDI_STORE = 'pudrus_nodes_midi_v1';
  const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v || d; } catch (e) { return d; } };
  let midiMap = readJSON(MIDI_STORE, {});
  const saveMidi = () => { try { localStorage.setItem(MIDI_STORE, JSON.stringify(midiMap)); } catch (e) { /* ignore */ } };

  // Each patch carries its own controls (graph.ctl = [{ id, k, t: node type }]): they travel
  // with scenes and saved files, and the phone only shows the ones of the patch ON AIR.
  const ctlList = g => (g && Array.isArray(g.ctl) ? g.ctl : []);
  const linkedIn = (g, id, k) => g.links.some(l => l.b === id && l.bi === k);
  function findInput(g, id, k, type) {
    const n = g && g.nodes.find(m => m.id === id);
    if (!n || (type && n.type !== type)) return null;
    const inp = (N.NODES[n.type].inputs || []).find(i => i.k === k && i.t === 'float');
    return inp ? { n, inp } : null;
  }
  const second = c => ({ id: c.id2, k: c.k2, t: c.t2 });
  const free = (g, id, k, t) => !!findInput(g, id, k, t) && !linkedIn(g, id, k);
  const usable = (g, c) => free(g, c.id, c.k, c.t) && (c.kind !== 'xy' || free(g, c.id2, c.k2, c.t2));
  const liveControls = () => ctlList(liveGraph).filter(c => usable(liveGraph, c));
  function targetLabel(id, k, type, g) {
    const f = (g && findInput(g, id, k, type)) || findInput(graph, id, k, type) || findInput(liveGraph, id, k, type);
    return f ? `${N.NODES[f.n.type].title} · ${f.inp.label}` : '(nodo borrado)';
  }
  const ctlLabel = (c, g) => c.name || (c.kind === 'xy' ? `${targetLabel(c.id, c.k, c.t, g)} × ${targetLabel(c.id2, c.k2, c.t2, g)}` : targetLabel(c.id, c.k, c.t, g));
  // the range a control moves in (its own lo/hi, or the full slider range)
  function ctlRange(c, y) {
    const f = findInput(liveGraph, y ? c.id2 : c.id, y ? c.k2 : c.k, y ? c.t2 : c.t) || findInput(graph, y ? c.id2 : c.id, y ? c.k2 : c.k, y ? c.t2 : c.t);
    if (!f) return null;
    const lo = y ? c.lo2 : c.lo, hi = y ? c.hi2 : c.hi;
    return { f, lo: Number.isFinite(lo) ? lo : f.inp.min, hi: Number.isFinite(hi) ? hi : f.inp.max };
  }
  const curVal = f => (f.n.v && f.n.v[f.inp.k] !== undefined ? f.n.v[f.inp.k] : f.inp.v);
  function ctlNorm(c, y) {
    const r = ctlRange(c, y);
    return r ? Math.min(1, Math.max(0, (curVal(r.f) - r.lo) / ((r.hi - r.lo) || 1))) : 0;
  }
  function ctlSet(c, norm, y) {
    const r = ctlRange(c, y);
    if (!r) return;
    setAbs(y ? c.id2 : c.id, y ? c.k2 : c.k, y ? c.t2 : c.t, r.lo + Math.min(1, Math.max(0, +norm || 0)) * (r.hi - r.lo));
  }
  // momentary buttons: jump to a value while pressed, back on release
  const pressed = new Map();
  const ctlKey = c => `${c.id}.${c.k}`;
  function ctlPress(c, on) {
    const r = ctlRange(c);
    if (!r) return;
    const key = ctlKey(c);
    if (on && !pressed.has(key)) { pressed.set(key, curVal(r.f)); setAbs(c.id, c.k, c.t, Number.isFinite(c.to) ? c.to : r.hi); }
    else if (!on && pressed.has(key)) { setAbs(c.id, c.k, c.t, pressed.get(key)); pressed.delete(key); }
  }
  const ctlValue = c => c.kind === 'xy' ? [ctlNorm(c), ctlNorm(c, true)] : c.kind === 'button' ? (pressed.has(ctlKey(c)) ? 1 : 0) : ctlNorm(c);
  function normOf(id, k, type) {
    const f = findInput(liveGraph, id, k, type) || findInput(graph, id, k, type);
    if (!f) return 0;
    const v = f.n.v && f.n.v[k] !== undefined ? f.n.v[k] : f.inp.v;
    return Math.min(1, Math.max(0, (v - f.inp.min) / ((f.inp.max - f.inp.min) || 1)));
  }
  // older versions kept one global list: move it into the current patch once
  (() => {
    const old = readJSON(CTL_STORE, null);
    if (!Array.isArray(old)) return;
    for (const g of [graph, liveGraph]) {
      if (ctlList(g).length) continue;
      g.ctl = old.map(c => { const n = g.nodes.find(m => m.id === c.id); return n && { id: c.id, k: c.k, t: n.type }; }).filter(c => c && findInput(g, c.id, c.k, c.t)).slice(0, 8);
    }
    try { localStorage.removeItem(CTL_STORE); } catch (e) { /* ignore */ }
    save();
  })();
  // the patch on air is the one being edited (same nodes) -> keep its controls in sync
  const sameNodes = () => liveGraph !== graph && JSON.stringify(liveGraph.nodes.map(n => [n.id, n.type])) === JSON.stringify(graph.nodes.map(n => [n.id, n.type]));
  function ctlChanged() {
    graph.ctlManual = true;
    if (sameNodes()) { liveGraph.ctl = clone(ctlList(graph)); liveGraph.ctlManual = true; }
    save(); remember(); pushState();
  }
  const hasCtl = (c, id, k) => (c.id === id && c.k === k) || (c.kind === 'xy' && c.id2 === id && c.k2 === k);
  function toggleControl(id, k) {
    const n = graph.nodes.find(m => m.id === id);
    if (!n) return;
    const list = ctlList(graph).slice();
    const i = list.findIndex(c => hasCtl(c, id, k));
    if (i >= 0) list.splice(i, 1);
    else if (list.length >= 8) { toast('Este patch ya tiene 8 controles: quitá alguno primero', true); return; }
    else list.push({ id, k, t: n.type });
    graph.ctl = list; graph.ctlManual = true;
    // same node on air -> it shows up (or goes away) on the phone right now
    if (sameNodes()) liveGraph.ctl = clone(list);
    else if (liveGraph !== graph) {
      const lc = ctlList(liveGraph).filter(c => !hasCtl(c, id, k));
      if (i < 0 && findInput(liveGraph, id, k, n.type) && lc.length < 8) lc.push({ id, k, t: n.type });
      liveGraph.ctl = lc;
    }
    save(); remember(); rebuild(); paintControls(); pushState();
    toast(i >= 0 ? 'Quitado del control' : `Control ${list.length}: ${targetLabel(id, k, n.type)}`);
  }
  // Move a value from outside (phone fader, MIDI knob): 0–1 across the slider range.
  // Changes the editor AND what is on air, so it works live without pressing "Al aire".
  let liveDirty = false;
  function setAbs(id, k, type, v) {
    for (const g of liveGraph === graph ? [graph] : [graph, liveGraph]) {
      const f = findInput(g, id, k, type);
      if (!f) continue;
      let x = v;   // a control's own range may go beyond the slider
      if (f.inp.step) x = Math.round(x / f.inp.step) * f.inp.step;
      f.n.v = { ...(f.n.v || {}), [k]: x };
      if (g === graph) {
        renderer.setValue(N.uniformName(id, k), x);
        const r = els.get(id); if (r && r.nums[k]) r.nums[k].setDisplay(x);
        save();
      }
    }
    liveDirty = true;
  }
  function applyControl(id, k, norm, type) {
    const c = liveControls().find(x => x.id === id && x.k === k && (x.kind || 'fader') === 'fader');
    if (c) { ctlSet(c, norm); return; }
    const f = findInput(liveGraph, id, k, type) || findInput(graph, id, k, type);
    if (f) setAbs(id, k, type, f.inp.min + Math.min(1, Math.max(0, +norm || 0)) * (f.inp.max - f.inp.min));
  }
  function flushLive() {
    if (!liveDirty) return;
    liveDirty = false;
    try { stage.direct(liveGraph); } catch (e) { return; }
    broadcast({ type: 'direct', graph: liveGraph, deck: deckSel });
    liveKey = contentKey(liveGraph);
    markPending();
  }
  function paintControls() {
    const list = $('#ctlList');
    list.textContent = '';
    const ctl = ctlList(graph);
    if (!ctl.length) { list.append(el('p', 'dim', 'Este patch todavía no tiene controles: clic derecho sobre un valor → «Al control». Cada patch y cada escena guarda los suyos.')); return; }
    const numIn = (val, ph, on) => {
      const x = el('input', 'ctl-num'); x.type = 'number'; x.step = 'any'; x.placeholder = ph;
      if (Number.isFinite(val)) x.value = String(Math.round(val * 1000) / 1000);
      x.addEventListener('change', () => { const v = parseFloat(x.value); on(Number.isFinite(v) ? v : undefined); ctlChanged(); });
      return x;
    };
    ctl.forEach((c, i) => {
      const row = el('div', 'ctl-row');
      const off = !usable(liveGraph, c);
      if (off) row.classList.add('is-off');
      row.append(el('b', '', String(i + 1)));
      const name = el('input', 'ctl-name'); name.value = c.name || ''; name.placeholder = ctlLabel({ ...c, name: '' }, graph) + (off ? ' (no está al aire)' : '');
      name.title = name.placeholder;
      name.addEventListener('change', () => { c.name = name.value.trim().slice(0, 40) || undefined; ctlChanged(); });
      row.append(name);
      const kind = c.kind || 'fader';
      if (kind === 'xy') {
        const sp = el('button', 'lab-mini', 'Separar'); sp.title = 'Volver a dos faders';
        sp.addEventListener('click', () => {
          ctl.splice(i, 1, { id: c.id, k: c.k, t: c.t, lo: c.lo, hi: c.hi }, { id: c.id2, k: c.k2, t: c.t2, lo: c.lo2, hi: c.hi2 });
          graph.ctl = ctl; ctlChanged(); paintControls();
        });
        row.append(el('span', 'ctl-kind', 'pad XY'), sp);
      } else {
        const sel = el('select', 'ctl-kind');
        [['fader', 'fader'], ['button', 'botón']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; sel.append(o); });
        sel.value = kind;
        sel.addEventListener('change', () => { c.kind = sel.value === 'fader' ? undefined : sel.value; ctlChanged(); paintControls(); });
        row.append(sel);
        const r = ctlRange(c);
        if (kind === 'button') row.append(numIn(c.to, r ? 'al apretar: ' + r.hi : 'valor', v => { c.to = v; }));
        else row.append(numIn(c.lo, r ? 'mín ' + r.f.inp.min : 'mín', v => { c.lo = v; }), numIn(c.hi, r ? 'máx ' + r.f.inp.max : 'máx', v => { c.hi = v; }));
        const nx = ctl[i + 1];
        if (kind === 'fader' && nx && (nx.kind || 'fader') === 'fader') {
          const j = el('button', 'lab-mini', '⇄ XY'); j.title = 'Unir con el siguiente en un pad XY (X = este, Y = el siguiente)';
          j.addEventListener('click', () => {
            ctl.splice(i, 2, { kind: 'xy', id: c.id, k: c.k, t: c.t, lo: c.lo, hi: c.hi, id2: nx.id, k2: nx.k, t2: nx.t, lo2: nx.lo, hi2: nx.hi });
            graph.ctl = ctl; ctlChanged(); paintControls();
          });
          row.append(j);
        }
      }
      const x = el('button', 'ctl-x', '×'); x.title = 'Quitar';
      x.addEventListener('click', () => { ctl.splice(i, 1); graph.ctl = ctl; ctlChanged(); rebuild(); paintControls(); });
      row.append(x); list.append(row);
    });
  }

  /* ── MIDI (any controller; also phone apps through a virtual MIDI port) ── */
  let midi = null, learning = null;
  const ccLast = {};
  async function ensureMidi() {
    if (midi) return true;
    if (!navigator.requestMIDIAccess) { toast('Este navegador no tiene MIDI: usá Chrome o Edge', true); return false; }
    try { midi = await navigator.requestMIDIAccess(); } catch (e) { toast('No se pudo acceder al MIDI', true); return false; }
    const hook = () => midi.inputs.forEach(inp => { inp.onmidimessage = e => onMidi(e.data); });
    hook(); midi.onstatechange = hook;
    return true;
  }
  const describe = t => t.kind === 'value' ? targetLabel(t.id, t.k, t.t) : t.kind === 'scene' ? `Escena ${t.i + 1}` : t.kind === 'deck' ? `Capa ${t.d}` : { go: 'Al aire', black: 'Negro', strobe: 'Strobe', tap: 'Tap', xf: 'Crossfader' }[t.kind];
  async function midiLearn(t) {
    if (!(await ensureMidi())) return;
    learning = t;
    toast(`Mové una perilla o tocá un pad para «${describe(t)}» · Esc cancela`);
  }
  function midiForget(match) {
    Object.keys(midiMap).forEach(key => { if (match(midiMap[key])) delete midiMap[key]; });
    saveMidi(); toast('MIDI olvidado');
  }
  function onMidi(data) {
    const st = data[0] & 0xf0, ch = (data[0] & 0x0f) + 1, d1 = data[1], d2 = data[2] || 0;
    let key, v, isCC = false;
    if (st === 0xB0) { key = `cc:${ch}:${d1}`; v = d2 / 127; isCC = true; }
    else if (st === 0x90 && d2 > 0) { key = `note:${ch}:${d1}`; v = 1; }
    else if (st === 0x80 || st === 0x90) { key = `note:${ch}:${d1}`; v = 0; }
    else return;
    if (learning) {
      if (!v) return;   // learn on press / movement
      Object.keys(midiMap).forEach(k2 => { if (JSON.stringify(midiMap[k2]) === JSON.stringify(learning)) delete midiMap[k2]; });
      midiMap[key] = learning; saveMidi();
      toast(`MIDI ${isCC ? 'CC ' : 'nota '}${d1} (canal ${ch}) → ${describe(learning)}`);
      learning = null;
      return;
    }
    const t = midiMap[key];
    if (!t) return;
    // buttons react on press; a CC used as a button "presses" when it crosses the middle
    const was = ccLast[key] || 0; ccLast[key] = v;
    const pressed = isCC ? v >= 0.5 && was < 0.5 : v > 0;
    const released = isCC ? v < 0.5 && was >= 0.5 : v === 0;
    if (t.kind === 'value') applyControl(t.id, t.k, v, t.t);
    else if (t.kind === 'xf') setXf(v);
    else if (t.kind === 'strobe') { if (pressed) setStrobe(true); if (released) setStrobe(false); }
    else if (!pressed) return;
    else if (t.kind === 'scene') fireScene(t.i);
    else if (t.kind === 'go') goLive();
    else if (t.kind === 'black') setBlack(!stage.black);
    else if (t.kind === 'tap') tap();
    else if (t.kind === 'deck') selectDeck(t.d);
  }
  // right-click on Al aire / Negro / Strobe / Tap: learn MIDI for that button
  [['#btnGo', 'go'], ['#btnBlack', 'black'], ['#btnStrobe', 'strobe'], ['#btnTap', 'tap']].forEach(([sel, kind]) => {
    $(sel).addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); midiLearn({ kind }); });
  });
  if (Object.keys(midiMap).length) ensureMidi();

  /* ── Phone remote: WebRTC (PeerJS) — the QR opens /lab/nodes/control/ ── */
  const loadScript = src => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
  let peer = null, peerReady = false;
  const conns = new Set();
  if (!opts.room) { opts.room = 'pudrus-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join(''); saveOpts(); }
  const remoteUrl = () => (DESK && deskInfo ? deskInfo.lanUrl + '/lab/nodes/control/?ws' : new URL('control/#' + opts.room, document.baseURI).href);
  function remoteStatus(txt) { $('#rmStatus').textContent = txt; $('#btnRemote').classList.toggle('is-on', conns.size > 0); }
  async function startRemote() {
    if (peer) return;
    if (DESK) {
      // phones connect to the app over the wifi: no internet needed
      peer = { desktop: true }; peerReady = true;
      const byId = new Map();
      DESK.onRemote(m => {
        if (m.type === 'open') {
          const c = { id: m.id, desk: true, send: msg => DESK.sendRemote(m.id, msg) };
          byId.set(m.id, c); conns.add(c); c.send(fullState());
          remoteStatus(`${conns.size} celular(es) conectado(s) por wifi`); toast('📱 Celular conectado');
        } else if (m.type === 'msg') { const c = byId.get(m.id); if (c) remoteMsg(m.msg, c); }
        else if (m.type === 'close') { const c = byId.get(m.id); if (c) { conns.delete(c); byId.delete(m.id); } remoteStatus(conns.size ? `${conns.size} celular(es) conectado(s) por wifi` : 'Celular desconectado · esperando…'); }
      });
      remoteStatus('Listo: escaneá el código (mismo wifi que esta compu)');
      return;
    }
    try {
      if (!window.Peer) await loadScript('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js');
    } catch (e) { remoteStatus('No se pudo cargar la conexión (¿hay internet?)'); return; }
    remoteStatus('Conectando…');
    peer = new window.Peer(opts.room, { debug: 0 });
    peer.on('open', () => { peerReady = true; remoteStatus(conns.size ? `${conns.size} celular(es) conectado(s)` : 'Listo: escaneá el código con el celular'); });
    peer.on('disconnected', () => { peerReady = false; remoteStatus('Reconectando…'); setTimeout(() => { try { peer.reconnect(); } catch (e) { /* retry later */ } }, 1500); });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') remoteStatus('Este control ya está abierto en otra pestaña');
      else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') remoteStatus('Sin conexión con el servidor: hace falta internet para conectar');
      else if (err.type !== 'peer-unavailable') remoteStatus('Error de conexión: ' + err.type);
    });
    peer.on('connection', conn => {
      conn.on('open', () => { conns.add(conn); remoteStatus(`${conns.size} celular(es) conectado(s)`); conn.send(fullState()); toast('📱 Celular conectado'); });
      conn.on('data', m => remoteMsg(m, conn));
      const gone = () => { if (conn.mcall) { try { conn.mcall.close(); } catch (e) { /* closed */ } conn.mcall = null; } if (conns.delete(conn)) { remoteStatus(conns.size ? `${conns.size} celular(es) conectado(s)` : 'Celular desconectado · esperando…'); } };
      conn.on('close', gone); conn.on('error', gone);
    });
  }
  async function showQR() {
    const box = $('#rmQR');
    if (box.dataset.done) return;
    try {
      if (!window.qrcode) await loadScript(DESK ? '/vendor/qrcode.js' : 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js');
      const q = window.qrcode(0, 'M'); q.addData(remoteUrl()); q.make();
      box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      box.dataset.done = '1';
    } catch (e) { box.textContent = 'No se pudo generar el QR: abrí el enlace en el celular.'; }
  }
  $('#btnRemote').addEventListener('click', e => {
    e.stopPropagation();
    try {
      const r = e.currentTarget.getBoundingClientRect();
      $('#rmUrl').href = $('#rmUrl').textContent = remoteUrl();
      paintControls();
      openPop($('#remotePop'), r.left - 160, r.bottom + 4);
      showQR(); startRemote();
    } catch (err) { console.error(err); toast('No se pudo abrir el control: ' + (err.message || err), true); }
  });
  $('#ctlSuggest').addEventListener('click', () => {
    graph.ctl = window.PudrusGenerate.suggest(graph); graph.ctlManual = false;
    if (sameNodes()) liveGraph.ctl = clone(graph.ctl);
    save(); remember(); rebuild(); paintControls(); pushState();
    toast('Controles sugeridos: podés cambiarles nombre, rango o tipo');
  });
  $('#rmCopy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(remoteUrl()).then(() => toast('Enlace copiado'), () => {}); });

  function fullState() {
    return {
      t: 'state',
      controls: liveControls().map(c => ({ kind: c.kind || 'fader', label: ctlLabel(c, liveGraph), v: ctlValue(c) })),
      scenes: Array.from({ length: 16 }, (_, i) => { const sc = scenes[i]; return { filled: !!sc, thumb: sc ? sc.thumb || '' : '', live: i === liveScene }; }),
      black: stage.black, bpm: Math.round(bpm), fade: opts.fade, direct: opts.direct,
      overlay: ov.items.length ? ov.on : null,
      deck: deckSel, xf: Math.round(stage.x * 1000) / 1000, xmode: stage.mode,
    };
  }
  let pushTimer = 0;
  function pushState() {
    if (!conns.size) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { const st = fullState(); conns.forEach(c => { try { c.send(st); } catch (e) { /* closed */ } }); }, 60);
  }
  let lastVals = '', valsAt = 0;
  function pushValues(now) {
    if (!conns.size || now - valsAt < 200) return;
    valsAt = now;
    const r3 = x => Math.round(x * 1000) / 1000;
    const v = liveControls().map(c => { const x = ctlValue(c); return Array.isArray(x) ? x.map(r3) : r3(x); });
    const key = JSON.stringify(v);
    if (key === lastVals) return;
    lastVals = key;
    conns.forEach(c => { try { c.send({ t: 'vals', v }); } catch (e) { /* closed */ } });
  }
  // Messages from the phone (data only, validated)
  function remoteMsg(m, conn) {
    if (!m || typeof m !== 'object') return;
    const i = Number.isInteger(m.i) ? m.i : -1;
    const lc = liveControls(), c = lc[i];
    const num = x => typeof x === 'number' && Number.isFinite(x);
    if (m.t === 'ctl' && c && num(m.v)) ctlSet(c, m.v);
    else if (m.t === 'xy' && c && c.kind === 'xy' && num(m.x) && num(m.y)) { ctlSet(c, m.x); ctlSet(c, m.y, true); }
    else if (m.t === 'btn' && c && c.kind === 'button') ctlPress(c, !!m.on);
    else if (m.t === 'scene' && i >= 0 && i < 16) fireScene(i);
    else if (m.t === 'step' && (m.d === 1 || m.d === -1)) stepScene(m.d);
    else if (m.t === 'store' && i >= 0 && i < 16) storeScene(i);
    else if (m.t === 'go') goLive();
    else if (m.t === 'black') setBlack(!stage.black);
    else if (m.t === 'strobe') setStrobe(!!m.on);
    else if (m.t === 'tap') tap();
    else if (m.t === 'random') { randomPatch(); goLive(); }
    else if (m.t === 'overlay') setOverlayOn(!ov.on);
    else if (m.t === 'xf' && num(m.v)) setXf(m.v, true);
    else if (m.t === 'deck' && (m.d === 'A' || m.d === 'B')) selectDeck(m.d);
    else if (m.t === 'vary') { varyPatch(); goLive(); }
    else if (m.t === 'video' && conn) sendVideo(conn, !!m.on);
    else if (m.t === 'fade' && [0, 0.5, 1, 2, 4].includes(m.v)) { opts.fade = m.v; fadeSel.value = String(m.v); saveOpts(); pushState(); }
  }
  // a small live video of what is on air, for the phone
  function sendVideo(conn, on) {
    if (conn.desk) return;   // live video to the phone needs the web version's relay
    if (conn.mcall) { try { conn.mcall.close(); } catch (e) { /* closed */ } conn.mcall = null; }
    if (!on || !peer || !stage.canvas.captureStream) return;
    try { conn.mcall = peer.call(conn.peer, stage.canvas.captureStream(24)); } catch (e) { conn.mcall = null; }
  }

  /* ── Random patches ─────────────────────────────────────── */
  function randomPatch() {
    graph = window.PudrusGenerate.generate({ audio: audio.on, bpm: !!opts.bpm });
    selected.clear(); rebuild(); recompile(); save(); remember(); frameAll();
    toast('🎲 Patch aleatorio' + (opts.direct ? '' : ' · Enter lo manda al aire') + ' · R otro · Shift+R variar');
  }
  function varyPatch() {
    window.PudrusGenerate.vary(graph);
    rebuild(); recompile(); save(); remember();
    toast('✨ Valores variados');
  }
  const rb = $('#btnRandom');
  rb.addEventListener('click', e => { if (e.shiftKey) varyPatch(); else randomPatch(); });
  rb.addEventListener('contextmenu', e => { e.preventDefault(); varyPatch(); });

  /* ── Overlay layer: logos / texts on top of every patch and scene ── */
  const OV_STORE = 'pudrus_nodes_overlay_v1';
  let ov = readJSON(OV_STORE, null);
  if (!ov || !Array.isArray(ov.items)) ov = { on: true, items: [] };
  const saveOv = () => { try { localStorage.setItem(OV_STORE, JSON.stringify(ov)); } catch (e) { /* ignore */ } };
  let ovTimer = 0;
  function ovChanged(now) {
    stage.setOverlay(ov);
    const visible = ov.on && ov.items.some(i => i.on);
    $('#btnOverlay').classList.toggle('is-on', visible);
    $('#btnOverlay').title = (visible ? 'Capa superior visible' : ov.items.length ? 'Capa superior oculta' : 'Capa superior: logos y textos arriba de todo') + ' (tecla O)';
    const chk = $('#ovOn'); if (chk) chk.checked = ov.on;
    clearTimeout(ovTimer);
    const send = () => { broadcast({ type: 'overlay', ov }); saveOv(); pushState(); };
    if (now) send(); else ovTimer = setTimeout(send, 30);
  }
  function setOverlayOn(on) {
    ov.on = on; ovChanged(true); paintOverlayPanel();
    toast(!ov.items.length ? 'La capa superior está vacía: agregá un logo o un texto en ▤ Capa' : on ? 'Capa superior visible' : 'Capa superior oculta');
  }
  const OV_FX = [['none', 'sin efecto'], ['beat', 'late con el pulso'], ['bass', 'late con los graves'], ['spin', 'gira'], ['float', 'flota'], ['breathe', 'respira'], ['blink', 'parpadea al pulso'], ['glitch', 'glitch']];
  const OV_BLEND = [['source-over', 'normal'], ['lighter', 'sumar'], ['screen', 'pantalla'], ['multiply', 'multiplicar'], ['difference', 'diferencia']];
  const OV_FONTS = [['sans', 'sans negrita'], ['display', 'display'], ['serif', 'serif'], ['mono', 'mono'], ['hand', 'manuscrita']];
  const ovPick = el('input'); ovPick.type = 'file'; ovPick.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'; ovPick.hidden = true;
  document.body.append(ovPick);
  ovPick.addEventListener('change', async () => {
    const f = ovPick.files[0]; ovPick.value = '';
    if (!f) return;
    try {
      const id = await storeImage(f);
      ov.items.push({ on: true, kind: 'image', img: id, name: f.name.slice(0, 28), x: 0.88, y: 0.86, size: 0.16, rot: 0, opacity: 1, blend: 'source-over', fx: 'none', amount: 0.5 });
      ov.on = true; ovChanged(true); paintOverlayPanel();
    } catch (e) { toast('No se pudo leer esa imagen', true); }
  });
  function paintOverlayPanel() {
    const list = $('#ovList'); if (!list) return;
    $('#ovOn').checked = ov.on;
    list.textContent = '';
    if (!ov.items.length) list.append(el('p', 'dim', 'Agregá un logo (PNG con transparencia) o un texto: queda arriba de todo aunque cambies de patch o de escena.'));
    ov.items.forEach((it, i) => {
      const box = el('div', 'ov-item' + (it.on ? '' : ' is-off'));
      const head = el('div', 'ov-head');
      const chk = el('input'); chk.type = 'checkbox'; chk.checked = !!it.on; chk.title = 'Mostrar';
      chk.addEventListener('change', () => { it.on = chk.checked; box.classList.toggle('is-off', !it.on); ovChanged(); });
      head.append(chk);
      if (it.kind === 'text') {
        const t = el('input', 'ov-text'); t.value = it.text || ''; t.placeholder = 'Texto';
        t.addEventListener('input', () => { it.text = t.value; ovChanged(); });
        const c = el('input'); c.type = 'color'; c.value = it.color || '#ffffff';
        c.addEventListener('input', () => { it.color = c.value; ovChanged(); });
        const fo = el('select'); OV_FONTS.forEach(([v, l]) => { const o = el('option', '', l); o.value = v; fo.append(o); }); fo.value = it.font || 'sans';
        fo.addEventListener('change', () => { it.font = fo.value; ovChanged(); });
        head.append(t, c, fo);
      } else head.append(el('span', 'ov-name', '🖼 ' + (it.name || 'imagen')));
      const del = el('button', 'ctl-x', '×'); del.title = 'Quitar';
      del.addEventListener('click', () => { ov.items.splice(i, 1); ovChanged(); paintOverlayPanel(); });
      head.append(del);
      box.append(head);
      const grid = el('div', 'ov-grid');
      const slider = (label, key, min, max, step, def) => {
        const w = el('label', 'ov-sl'); w.append(el('span', '', label));
        const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = Number.isFinite(it[key]) ? it[key] : def;
        r.addEventListener('input', () => { it[key] = +r.value; ovChanged(); });
        w.append(r); grid.append(w);
      };
      slider('X', 'x', 0, 1, 0.005, 0.5); slider('Y', 'y', 0, 1, 0.005, 0.5);
      slider('Tamaño', 'size', 0.02, 1, 0.005, 0.15); slider('Giro °', 'rot', -180, 180, 1, 0);
      slider('Opacidad', 'opacity', 0, 1, 0.01, 1); slider('Intensidad', 'amount', 0, 1, 0.01, 0.5);
      const sel = (label, key, opts, def) => {
        const w = el('label', 'ov-sl'); w.append(el('span', '', label));
        const x = el('select'); opts.forEach(([v, l]) => { const o = el('option', '', l); o.value = v; x.append(o); }); x.value = it[key] || def;
        x.addEventListener('change', () => { it[key] = x.value; ovChanged(); });
        w.append(x); grid.append(w);
      };
      sel('Efecto', 'fx', OV_FX, 'none'); sel('Fusión', 'blend', OV_BLEND, 'source-over');
      box.append(grid);
      list.append(box);
    });
  }
  $('#ovOn').addEventListener('change', e => setOverlayOn(e.target.checked));
  $('#ovAddImg').addEventListener('click', () => ovPick.click());
  $('#ovAddText').addEventListener('click', () => {
    ov.items.push({ on: true, kind: 'text', text: 'PUDRUS', font: 'display', color: '#ffffff', x: 0.5, y: 0.88, size: 0.09, rot: 0, opacity: 0.9, blend: 'source-over', fx: 'none', amount: 0.5 });
    ov.on = true; ovChanged(true); paintOverlayPanel();
  });
  $('#btnOverlay').addEventListener('click', e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    paintOverlayPanel();
    openPop($('#overlayPop'), r.left - 200, r.bottom + 4);
  });
  ovChanged(true);

  /* ── Export panel: format, size, guides, live recording and frame-by-frame render ── */
  const guideEls = [preview, $('#live')].map(box => { const g = el('div', 'safe-guide'); box.append(g); return g; });
  function paintGuides() {
    guideEls.forEach(g => { g.className = 'safe-guide' + (ex.guides ? ' on fmt-' + ex.fmt.replace(':', 'x') : ''); });
  }
  function setExp(k, v) {
    ex[k] = v; saveOpts();
    if (k === 'fmt' || k === 'res') { layoutPreview(); frameAll(); }
    paintGuides(); paintExport();
  }
  function paintExport() {
    const pop = $('#exportPop'); if (!pop) return;
    pop.querySelectorAll('[data-exp]').forEach(b => b.classList.toggle('is-on', String(ex[b.dataset.exp]) === b.dataset.v));
    $('#expSize').textContent = `${expSize().join(' × ')} · ${ex.fps} fps · ~${Math.round(bitrateFor(expSize(), ex.fps) / 1e6)} Mbps`;
    $('#expGuides').checked = !!ex.guides; $('#expLoop').checked = !!ex.loop;
    $('#expDur').value = ex.dur;
    $('#expRec').textContent = rec ? '■ Detener grabación' : '● Grabar en vivo';
    $('#expRec').classList.toggle('is-rec', !!rec);
    $('#btnExport').classList.toggle('is-on', ex.fmt !== '16:9' || !!rendering);
  }
  $('#exportPop').querySelectorAll('[data-exp]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.exp, v = b.dataset.v;
    setExp(k, k === 'fmt' || k === 'q' ? v : +v);
  }));
  $('#expGuides').addEventListener('change', e => setExp('guides', e.target.checked));
  $('#expLoop').addEventListener('change', e => setExp('loop', e.target.checked));
  $('#expDur').addEventListener('change', e => { const v = Math.min(300, Math.max(1, Math.round(+e.target.value || 15))); setExp('dur', v); });
  $('#expRec').addEventListener('click', () => $('#btnRec').click());
  $('#expPhoto').addEventListener('click', takePhoto);
  $('#expRender').addEventListener('click', () => renderVideo());
  $('#expCancel').addEventListener('click', () => { if (rendering) rendering.cancel = true; });
  $('#btnExport').addEventListener('click', e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    paintExport();
    openPop($('#exportPop'), r.left - 220, r.bottom + 4);
  });

  // Frame-by-frame render to MP4 (WebCodecs): exact fps at any size, no dropped frames.
  // "Loop perfecto": a second copy of the patch starts again from the beginning and the last
  // second fades into it, so the end flows into the start when the video repeats.
  let rendering = null;
  const MP4MUX = DESK ? '/vendor/mp4-muxer.js' : 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.min.js';
  async function renderVideo() {
    if (rendering) return;
    if (!('VideoEncoder' in window) || !('VideoFrame' in window)) { toast('Este navegador no puede renderizar MP4: usá Chrome o Edge', true); return; }
    try { if (!window.Mp4Muxer) await loadScript(MP4MUX); } catch (e) { toast('No se pudo cargar el armador de MP4 (¿hay internet?)', true); return; }
    const [W, H] = expSize(), fps = ex.fps, D = ex.dur, F = ex.loop ? Math.min(1, D * 0.2) : 0;
    const total = Math.round(D * fps), warm = Math.round(F * fps), bitrate = bitrateFor([W, H], fps);
    let config = null;
    for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.4D0034', 'avc1.42E034', 'avc1.42001F']) {
      const c = { codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' } };
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch (e) { /* next */ }
    }
    if (!config) { toast(`Este equipo no puede codificar H.264 a ${W}×${H}: probá una resolución menor`, true); return; }
    liveByDeck[deckSel] = liveGraph;
    const snap = { A: clone(liveByDeck.A), B: clone(liveByDeck.B), x: stage.x, mode: stage.mode, ov: clone(ov), t0: time, bpm, origin: beatOrigin };
    const beatAt = t => (t - snap.origin) * snap.bpm / 60;
    const target = new window.Mp4Muxer.ArrayBufferTarget();
    const muxer = new window.Mp4Muxer.Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
    let encErr = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { encErr = e; } });
    enc.configure(config);
    const host = document.createElement('div');
    const mk = () => { const m = N.createMixer(host); m.resize(W, H); m.x = snap.x; m.mode = snap.mode; m.setOverlay(snap.ov); m.go(snap.A, 0, 'A'); m.go(snap.B, 0, 'B'); return m; };
    let m1 = null, m2 = null;
    const mixCanvas = document.createElement('canvas'); mixCanvas.width = W; mixCanvas.height = H;
    const mctx = mixCanvas.getContext('2d');
    const zero = [0, 0, 0, 0], tick = () => new Promise(r => setTimeout(r, 0));
    rendering = { cancel: false };
    const bar = $('#expBar'), lbl = $('#expProg');
    $('#expRenderBox').classList.add('is-busy'); paintExport();
    const started = performance.now();
    const progress = k => {
      bar.style.width = (k * 100).toFixed(1) + '%';
      const el2 = (performance.now() - started) / 1000, left = k > 0.02 ? el2 / k - el2 : 0;
      lbl.textContent = `Renderizando ${Math.round(k * 100)}%` + (left ? ` · faltan ~${Math.ceil(left)} s` : '');
    };
    try {
      m1 = mk(); if (warm) m2 = mk();
      // warm-up: the main copy plays the first second (its feedback builds up) without being recorded
      for (let i = 0; i < warm; i++) { const t = snap.t0 + i / fps; N.clock.beat = beatAt(t); m1.render(t, zero); if (i % 8 === 0) await tick(); }
      for (let i = 0; i < total; i++) {
        if (rendering.cancel) throw new Error('cancel');
        const t = snap.t0 + F + i / fps;
        N.clock.beat = beatAt(t); m1.render(t, zero);
        let src = m1.canvas;
        const tail = i - (total - warm);
        if (m2 && tail >= 0) {
          const t2 = snap.t0 + tail / fps; N.clock.beat = beatAt(t2); m2.render(t2, zero);
          mctx.globalAlpha = 1; mctx.drawImage(m1.canvas, 0, 0);
          mctx.globalAlpha = (tail + 1) / warm; mctx.drawImage(m2.canvas, 0, 0); mctx.globalAlpha = 1;
          src = mixCanvas;
        }
        const vf = new VideoFrame(src, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        enc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); vf.close();
        if (encErr) throw encErr;
        while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
        if (i % 2 === 0) { progress((i + 1) / total); await tick(); }
      }
      lbl.textContent = 'Terminando el archivo…';
      await enc.flush(); muxer.finalize();
      saveBlob(new Blob([target.buffer], { type: 'video/mp4' }), `${fileTag()}_${D}s${ex.loop ? '_loop' : ''}.mp4`, 30000);
      toast(`Video listo · ${W}×${H} · ${D} s · ${fps} fps` + (ex.loop ? ' · loop perfecto' : ''));
    } catch (e) {
      if (e && e.message === 'cancel') toast('Render cancelado');
      else { console.error(e); toast('No se pudo renderizar: ' + String((e && e.message) || e).slice(0, 120), true); }
    } finally {
      try { if (enc.state !== 'closed') enc.close(); } catch (e) { /* closed */ }
      if (m1) m1.destroy(); if (m2) m2.destroy();
      rendering = null; bar.style.width = '0%'; lbl.textContent = '';
      $('#expRenderBox').classList.remove('is-busy'); paintExport();
    }
  }

  /* ── Desktop app: Spout, OSC, output display ────────────── */
  let deskOscOn = false, oscLastBeat = -1, oscAt = 0;
  const oscSend = (addr, ...args) => { if (DESK && deskOscOn) DESK.osc.send(addr, args); };
  // what NODRUS tells other programs (TouchDesigner, Resolume…): audio bands, beat, bpm, scene, crossfader
  function oscTick(now) {
    if (now - oscAt > 33) { oscAt = now; const a = audio.bands; oscSend('/nodrus/audio', +a[0].toFixed(3), +a[1].toFixed(3), +a[2].toFixed(3), +a[3].toFixed(3)); }
    const b = Math.floor(N.clock.beat);
    if (b !== oscLastBeat) { oscLastBeat = b; oscSend('/nodrus/beat', b); }
  }
  // what other programs can tell NODRUS
  function oscIn({ addr, args }) {
    const a0 = args[0], num = typeof a0 === 'number' ? a0 : parseFloat(a0);
    const on = args.length ? (typeof a0 === 'string' ? !/^(0|off|false)$/i.test(a0) : num > 0.5) : null;
    const m = /^\/nodrus\/(.+)$/.exec(addr || ''); if (!m) return;
    const [cmd, sub] = m[1].split('/');
    if (cmd === 'go') goLive();
    else if (cmd === 'scene' && Number.isFinite(num)) fireScene(Math.round(num) - 1);
    else if (cmd === 'next') stepScene(1);
    else if (cmd === 'prev') stepScene(-1);
    else if (cmd === 'black') setBlack(on === null ? !stage.black : on);
    else if (cmd === 'strobe') setStrobe(on === null ? !stage.strobe : on);
    else if (cmd === 'tap') tap();
    else if (cmd === 'bpm' && num >= 40 && num <= 240) { bpm = num; opts.bpm = bpm; saveOpts(); $('#bpm').textContent = Math.round(bpm); pushState(); }
    else if (cmd === 'xf' && Number.isFinite(num)) setXf(num);
    else if (cmd === 'deck') selectDeck(/^(b|1)$/i.test(String(a0)) ? 'B' : 'A');
    else if (cmd === 'fade' && [0, 0.5, 1, 2, 4].includes(num)) { opts.fade = num; fadeSel.value = String(num); saveOpts(); }
    else if (cmd === 'random') { randomPatch(); goLive(); }
    else if (cmd === 'vary') { varyPatch(); goLive(); }
    else if (cmd === 'overlay') setOverlayOn(on === null ? !ov.on : on);
    else if (cmd === 'ctl' && sub) {
      const c = liveControls()[(+sub | 0) - 1]; if (!c) return;
      if (c.kind === 'xy') { if (Number.isFinite(num)) ctlSet(c, num); if (args.length > 1) ctlSet(c, +args[1], true); }
      else if (c.kind === 'button') ctlPress(c, !!on);
      else if (Number.isFinite(num)) ctlSet(c, num);
    }
  }
  async function paintDesk() {
    if (!DESK) return;
    deskInfo = await DESK.info();
    const sp = deskInfo.spout, sc = sp.cfg || {};
    $('#dkSpoutOn').checked = !!sp.on;
    $('#dkSpoutName').value = sc.name || 'NODRUS';
    $('#dkSpoutSize').value = `${sc.width || 1920}x${sc.height || 1080}`;
    $('#dkSpoutState').textContent = sp.on ? `Enviando «${sp.name}» ${sp.width}×${sp.height}` + (sp.error ? ' · error: ' + sp.error : '') : sp.available === false ? 'No disponible: ' + sp.error : 'Apagado';
    $('#dkOscOn').checked = !!deskInfo.osc.running;
    $('#dkOscIn').value = deskInfo.osc.inPort; $('#dkOscHost').value = deskInfo.osc.outHost; $('#dkOscOut').value = deskInfo.osc.outPort;
    const ds = $('#dkDisplay'); ds.textContent = '';
    [{ id: 'auto', label: 'Automático (la otra pantalla)' }, ...deskInfo.displays].forEach(d => { const o = el('option', '', d.label); o.value = d.id; ds.append(o); });
    ds.value = deskInfo.display;
    $('#btnDesk').classList.toggle('is-on', !!sp.on || !!deskInfo.osc.running);
  }
  async function spoutApply() {
    const [w, h] = $('#dkSpoutSize').value.split('x').map(Number);
    const r = $('#dkSpoutOn').checked ? await DESK.spout.start({ name: $('#dkSpoutName').value.trim() || 'NODRUS', width: w, height: h, fps: 60 }) : await DESK.spout.stop();
    if (r && r.ok === false) { toast('Spout: ' + r.error, true); $('#dkSpoutOn').checked = false; }
    else if ($('#dkSpoutOn').checked) toast(`Spout encendido: buscá «${$('#dkSpoutName').value.trim() || 'NODRUS'}» en Resolume o TouchDesigner`);
    paintDesk();
  }
  async function oscApply() {
    if ($('#dkOscOn').checked) {
      const r = await DESK.osc.start({ inPort: +$('#dkOscIn').value || 9000, outHost: $('#dkOscHost').value.trim() || '127.0.0.1', outPort: +$('#dkOscOut').value || 9001 });
      if (!r.ok) { toast('OSC: ' + r.error, true); $('#dkOscOn').checked = false; deskOscOn = false; }
      else { deskOscOn = true; toast(`OSC: escucha en ${r.inPort}, envía a ${r.outHost}:${r.outPort}`); }
    } else { await DESK.osc.stop(); deskOscOn = false; }
    paintDesk();
  }
  if (DESK) {
    document.documentElement.classList.add('is-desktop');
    $('#btnDesk').hidden = false; setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    DESK.osc.on(oscIn);
    DESK.osc.onError(msg => toast('OSC: ' + msg, true));
    $('#btnDesk').addEventListener('click', e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); paintDesk(); openPop($('#deskPop'), r.left - 260, r.bottom + 4); });
    $('#dkSpoutOn').addEventListener('change', spoutApply);
    $('#dkSpoutSize').addEventListener('change', () => { if ($('#dkSpoutOn').checked) spoutApply(); });
    $('#dkSpoutName').addEventListener('change', () => { if ($('#dkSpoutOn').checked) spoutApply(); });
    $('#dkOscOn').addEventListener('change', oscApply);
    ['#dkOscIn', '#dkOscHost', '#dkOscOut'].forEach(sel => $(sel).addEventListener('change', () => { if ($('#dkOscOn').checked) oscApply(); }));
    $('#dkDisplay').addEventListener('change', e => DESK.setDisplay(e.target.value));
    $('#dkOut').addEventListener('click', () => $('#btnOut').click());
    setInterval(async () => { if (!$('#deskPop').hidden) { const st = await DESK.spout.stats(); if (st.on) $('#dkSpoutState').textContent = `Enviando «${st.name}» ${st.width}×${st.height} · ${st.frames} cuadros` + (st.error ? ' · ' + st.error : ''); } }, 1000);
    paintDesk().then(() => { deskOscOn = !!(deskInfo && deskInfo.osc.running); startRemote(); });   // phones can join right away
  }

  /* ── Main loop ─────────────────────────────────────────── */
  let last = performance.now(), frameN = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) time += dt;
    N.clock.beat = beatNow();
    if (deskOscOn) oscTick(now);
    flushLive();
    pushValues(now);
    const a = audio.read();
    renderer.render(time, a, N.postValues(graph, a));
    grabShot();
    stage.render(time, a);   // on air (also what Foto/Grabar capture)
    // in Directo the preview IS what is on air: show black / strobe on it too
    if (opts.direct && ov.on && ov.items.length) {
      const pw = Math.round(preview.clientWidth * Math.min(2, devicePixelRatio)), ph = Math.round(preview.clientHeight * Math.min(2, devicePixelRatio));
      if (pvOv.width !== pw || pvOv.height !== ph) { pvOv.width = pw; pvOv.height = ph; }
      const c = pvOv.getContext('2d'); c.clearRect(0, 0, pw, ph);
      N.drawOverlay(c, pw, ph, ov, time, a); pvOv.style.display = 'block';
    } else if (pvOv.style.display !== 'none') pvOv.style.display = 'none';
    const vl = stage.veil, show = opts.direct && (vl.black > 0 || vl.flash);
    pvVeil.style.display = show ? 'block' : 'none';
    if (show) { pvVeil.style.background = vl.flash ? '#fff' : '#000'; pvVeil.style.opacity = vl.flash ? 1 : vl.black; }
    drawThumbs(now, a);
    if (audio.on && (frameN++ & 1) === 0) meters.forEach((m, i) => m.style.setProperty('--v', a[i]));
    broadcast({ type: 'frame', t: time, audio: a, beat: N.clock.beat });
  }

  /* ── Start ─────────────────────────────────────────────── */
  // the top bar compacts itself step by step until it fits (any window width, any extra button)
  const barEl = document.querySelector('.lab-bar');
  function fitBar() {
    const steps = ['fit-1', 'fit-2', 'fit-3', 'fit-4'];
    barEl.classList.remove(...steps);
    for (const c of steps) { if (barEl.scrollWidth <= barEl.clientWidth + 1) break; barEl.classList.add(c); }
  }
  addEventListener('resize', fitBar);
  if (document.fonts) document.fonts.ready.then(fitBar);
  setTimeout(fitBar, 300);
  makeWindow(preview); makeWindow($('#live'));
  paintMixer(); paintGuides(); paintExport();
  $('#btnDirect').classList.toggle('is-on', opts.direct);
  $('#btnThumbs').classList.toggle('is-on', opts.thumbs);
  work.classList.toggle('is-direct', opts.direct);
  paintScenes();
  rebuild();
  recompile();
  applyCam();
  if (fromPhone) setTimeout(() => toast('📱 Boceto del celular abierto: seguí armándolo acá'), 300);
  layoutPreview();
  requestAnimationFrame(() => { frameAll(); drawLinks(); });
  requestAnimationFrame(loop);
  // fonts change node sizes -> redraw links once they are in
  if (document.fonts) document.fonts.ready.then(() => drawLinks());
  window.__nodesEditor = { get graph() { return graph; }, get compiled() { return compiled; }, get liveGraph() { return liveGraph; }, stage, addNode, connect, removeNodes, undo, redo, goLive, modulate, set valueTarget(v) { valueTarget = v; }, setDirect, storeScene, fireScene, openScene, setThumbs, get scenes() { return scenes; }, get controls() { return ctlList(graph); }, fitBar, oscIn, get deskOscOn() { return deskOscOn; }, renderVideo, setExp, get ex() { return ex; }, get rendering() { return rendering; }, expSize, takePhoto, selectDeck, setXf, get deck() { return deckSel; }, openCode, applyCode, get opts() { return opts; }, layoutPreview, ensureControls, get ov() { return ov; }, setOverlayOn, paintOverlayPanel, liveControls, ctlValue, randomPatch, varyPatch, stepScene, paintControls, toggleControl, applyControl, onMidi, midiLearn, setLearning(t) { learning = t; }, get midiMap() { return midiMap; }, remoteMsg, fullState, tap, get bpm() { return bpm; }, setBlack, setStrobe };
})();
