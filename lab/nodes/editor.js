/* PUDRUS Lab · Nodos — editor (Blender-style). Personal tool: Spanish UI only. */
(function () {
  const N = window.PudrusNodes, PRESETS = window.PudrusPresets;
  const $ = s => document.querySelector(s);
  const work = $('#work'), world = $('#world'), svg = $('#links');
  const preview = $('#preview'), view = $('#view');
  const STORE = 'pudrus_nodes_graph_v1';
  const CAT_COLOR = { Entrada: 'var(--c-in)', Generar: 'var(--c-gen)', Coordenadas: 'var(--c-uv)', Color: 'var(--c-col)', Efectos: 'var(--c-fx)', Salida: 'var(--c-out)' };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ── State ─────────────────────────────────────────────── */
  let graph = load() || clone(PRESETS[0].graph);
  let cam = { x: 30, y: 30, z: 0.85 };
  const selected = new Set();
  let compiled = null;
  let playing = true, time = 0;
  const els = new Map();     // node id -> { root, ins: {k: el}, outs: {k: el} }

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
    }
    broadcast({ type: 'graph', graph });
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
    const rec = { root, ins: {}, outs: {} };
    // outputs first (Blender order)
    for (const [k, t, label] of def.outputs || []) {
      const row = el('div', 'nd-row out'); row.append(el('span', 'lbl', label));
      const s = el('i', 'sock t-' + t); s.dataset.out = k; s.dataset.type = t; row.append(s);
      rec.outs[k] = s; body.append(row);
    }
    for (const p of def.params || []) {
      const row = el('div', 'nd-row');
      const sel = el('select');
      p.options.forEach(([v, l]) => { const o = el('option', '', p.label + ': ' + l); o.value = v; sel.append(o); });
      sel.value = (n.p && n.p[p.k]) || p.v;
      sel.addEventListener('pointerdown', e => e.stopPropagation());
      sel.addEventListener('change', () => { n.p = { ...(n.p || {}), [p.k]: sel.value }; recompile(); save(); remember(); });
      row.append(sel); body.append(row);
    }
    for (const p of def.post || []) {
      const row = el('div', 'nd-row');
      row.append(numWidget(p.label, (n.v && n.v[p.k] !== undefined) ? n.v[p.k] : p.v, p, v => { n.v = { ...(n.v || {}), [p.k]: v }; save(); remember(); }));
      body.append(row);
    }
    for (const inp of def.inputs || []) {
      const row = el('div', 'nd-row in');
      const s = el('i', 'sock t-' + inp.t); s.dataset.in = inp.k; s.dataset.type = inp.t; row.append(s);
      rec.ins[inp.k] = s;
      const val = n.v && n.v[inp.k] !== undefined ? n.v[inp.k] : inp.v;
      if (inp.t === 'float' && !isLinked(n.id, inp.k)) {
        row.append(numWidget(inp.label, val, inp, v => setValue(n, inp.k, v)));
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
    broadcast({ type: 'graph', graph });
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
    if (e.target !== work && e.target !== world && e.target !== svg && !e.target.closest('.lab-work.backdrop .lab-preview canvas')) return;
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
    const pw = work.classList.contains('backdrop') ? 0 : preview.getBoundingClientRect().width + 20;
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
    b.addEventListener('click', () => { closePops(); graph = clone(p.graph); selected.clear(); rebuild(); recompile(); save(); remember(); frameAll(); toast('Ejemplo: ' + p.name); });
    exPop.append(b);
  });
  $('#btnExamples').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); openPop(exPop, r.left, r.bottom + 4); e.stopPropagation(); });
  $('#btnHelp').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); openPop($('#help'), r.right - 330, r.bottom + 4); e.stopPropagation(); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.lab-pop, .lab-btn')) closePops(); });

  $('#btnNew').addEventListener('click', () => {
    if (!confirm('¿Empezar un patch nuevo? (el actual se pierde si no lo guardaste)')) return;
    graph = { nodes: [
      { id: 1, type: 'noise', x: 60, y: 60, v: N.defaultsFor('noise').v, p: {} },
      { id: 2, type: 'palette', x: 320, y: 60, v: N.defaultsFor('palette').v, p: N.defaultsFor('palette').p },
      { id: 3, type: 'output', x: 580, y: 60, v: N.defaultsFor('output').v, p: N.defaultsFor('output').p },
    ], links: [{ a: 1, ao: 'v', b: 2, bi: 'v' }, { a: 2, ao: 'c', b: 3, bi: 'c' }] };
    selected.clear(); rebuild(); recompile(); save(); remember(); frameAll();
  });
  // Save / open patch files
  $('#btnSave').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ pudrusNodes: 1, graph }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.download = `patch_${Date.now()}.pudrus.json`; a.href = URL.createObjectURL(blob); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#fileOpen').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const g = data.graph || data;
      if (!Array.isArray(g.nodes) || !Array.isArray(g.links) || g.nodes.some(n => !N.NODES[n.type])) throw new Error('formato');
      graph = g; selected.clear(); rebuild(); recompile(); save(); remember(); frameAll();
      toast('Patch cargado');
    } catch (err) { toast('Ese archivo no es un patch válido', true); }
  });
  $('#btnOpen').addEventListener('click', () => $('#fileOpen').click());

  /* ── Keyboard ──────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
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
    else if (k === 'escape') closePops();
  });

  /* ── Preview: panel sizes, backdrop, fullscreen ────────── */
  const SIZES = { s: [320, 180], m: [480, 270], l: [720, 405] };
  let size = 'm';
  function layoutPreview() {
    if (document.fullscreenElement === preview) { renderer.resize(Math.min(2560, screen.width * devicePixelRatio), Math.min(1440, screen.height * devicePixelRatio)); return; }
    if (work.classList.contains('backdrop')) {
      const r = work.getBoundingClientRect();
      const s = Math.min(1, 1920 / r.width);
      renderer.resize(r.width * Math.min(devicePixelRatio, 1.5) * s, r.height * Math.min(devicePixelRatio, 1.5) * s);
    } else {
      const [w, h] = SIZES[size];
      preview.style.width = w + 'px'; preview.style.height = h + 'px';
      renderer.resize(1280, 720);   // always 720p inside: good for recording, scaled down by CSS
    }
  }
  function setBackdrop(on) {
    work.classList.toggle('backdrop', on);
    $('#pvBack').classList.toggle('is-on', on);
    layoutPreview();
  }
  document.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => {
    size = b.dataset.size; setBackdrop(false);
    document.querySelectorAll('[data-size]').forEach(x => x.classList.toggle('is-on', x === b));
  }));
  $('#pvBack').addEventListener('click', () => setBackdrop(!work.classList.contains('backdrop')));
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else preview.requestFullscreen().catch(() => toast('El navegador no permitió pantalla completa', true));
  }
  $('#btnFull').addEventListener('click', fullscreen);
  $('#pvFull').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', layoutPreview);
  addEventListener('resize', () => { layoutPreview(); drawLinks(); });

  function togglePlay() {
    playing = !playing;
    $('#btnPlay').textContent = playing ? '❚❚ Pausa' : '▶ Play';
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
  $('#btnPhoto').addEventListener('click', () => {
    view.toBlob(b => { const a = document.createElement('a'); a.download = `pudrus_nodes_${Date.now()}.png`; a.href = URL.createObjectURL(b); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, 'image/png');
  });
  let rec = null;
  $('#btnRec').addEventListener('click', () => {
    const b = $('#btnRec');
    if (rec) { rec.stop(); rec = null; b.classList.remove('is-rec'); b.textContent = '● Grabar'; return; }
    if (!view.captureStream || typeof MediaRecorder === 'undefined') { toast('Este navegador no puede grabar video', true); return; }
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const stream = view.captureStream(60);
    if (audio.stream && $('#recAudio').checked) audio.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const chunks = [];
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : undefined);
    r.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    r.onstop = () => {
      const type = r.mimeType || 'video/webm';
      const a = document.createElement('a'); a.download = `pudrus_nodes_${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.href = URL.createObjectURL(new Blob(chunks, { type })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast('Video guardado');
    };
    r.start(); rec = r; b.classList.add('is-rec'); b.textContent = '■ Detener';
  });

  /* ── Output window (second screen / projector) ─────────── */
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('pudrus-nodes') : null;
  function broadcast(msg) { if (channel) channel.postMessage(msg); }
  if (channel) channel.onmessage = e => { if (e.data && e.data.type === 'hello') { broadcast({ type: 'graph', graph }); broadcast({ type: 'play', playing }); } };
  $('#btnOut').addEventListener('click', () => {
    const w = window.open('output.html', 'pudrus-output', 'width=960,height=540');
    if (!w) toast('El navegador bloqueó la ventana: permití las ventanas emergentes', true);
    else toast('Arrastrá la ventana al proyector y hacé doble clic para pantalla completa');
  });

  /* ── Main loop ─────────────────────────────────────────── */
  let last = performance.now(), frameN = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) time += dt;
    const a = audio.read();
    renderer.render(time, a, N.postValues(graph, a));
    if (audio.on && (frameN++ & 1) === 0) meters.forEach((m, i) => m.style.setProperty('--v', a[i]));
    broadcast({ type: 'frame', t: time, audio: a });
  }

  /* ── Start ─────────────────────────────────────────────── */
  rebuild();
  recompile();
  applyCam();
  layoutPreview();
  requestAnimationFrame(() => { frameAll(); drawLinks(); });
  requestAnimationFrame(loop);
  // fonts change node sizes -> redraw links once they are in
  if (document.fonts) document.fonts.ready.then(() => drawLinks());
  window.__nodesEditor = { get graph() { return graph; }, get compiled() { return compiled; }, addNode, connect, removeNodes, undo, redo };
})();
