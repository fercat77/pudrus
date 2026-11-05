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
      return;
    }
    if (opts.direct) sendDirect();
    markPending();
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
        if (controls.some(c => c.id === n.id && c.k === inp.k)) w.classList.add('is-ctl');
        w.addEventListener('contextmenu', e => {
          e.preventDefault(); e.stopPropagation();
          valueTarget = { id: n.id, k: inp.k };
          const has = controls.some(c => c.id === n.id && c.k === inp.k);
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
  $('#vpMidi').addEventListener('click', () => { closePops(); if (valueTarget) midiLearn({ kind: 'value', id: valueTarget.id, k: valueTarget.k }); });
  $('#vpMidiForget').addEventListener('click', () => { closePops(); if (valueTarget) midiForget(t => t.kind === 'value' && t.id === valueTarget.id && t.k === valueTarget.k); });
  document.querySelectorAll('#valuePop [data-band]').forEach(b => b.addEventListener('click', () => modulate('audio', b.dataset.band)));

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
    else if (k === 'escape') { closePops(); if (learning) { learning = null; toast('Aprendizaje MIDI cancelado'); } }
    else if (k === 'enter' && !mod) { e.preventDefault(); goLive(); }
    else if (k === 'p' && !mod) { e.preventDefault(); setThumbs(!opts.thumbs); }
    else if (k === 'n' && !mod) { e.preventDefault(); setBlack(!stage.black); }
    else if (k === 's' && !mod) { e.preventDefault(); if (!e.repeat) setStrobe(true); }
    else if (k === 't' && !mod) { e.preventDefault(); if (!e.repeat) tap(); }
    else if (/^Digit[1-8]$/.test(e.code) && !mod) {
      e.preventDefault();
      const i = +e.code.slice(5) - 1;
      if (e.shiftKey) storeScene(i); else fireScene(i);
    }
  });

  document.addEventListener('keyup', e => { if (e.key.toLowerCase() === 's') setStrobe(false); });
  addEventListener('blur', () => { if (stage.strobe) setStrobe(false); });

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
      renderer.resize(1280, 720);   // always 720p inside, scaled down by CSS
    }
    const live = $('#live');
    if (live) live.style.top = work.classList.contains('backdrop') ? '12px' : (12 + SIZES[size][1] + 12) + 'px';
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
    stage.canvas.toBlob(b => { const a = document.createElement('a'); a.download = `pudrus_nodes_${Date.now()}.png`; a.href = URL.createObjectURL(b); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, 'image/png');
  });
  let rec = null;
  $('#btnRec').addEventListener('click', () => {
    const b = $('#btnRec');
    if (rec) { rec.stop(); rec = null; b.classList.remove('is-rec'); b.textContent = '● Grabar'; return; }
    if (!stage.canvas.captureStream || typeof MediaRecorder === 'undefined') { toast('Este navegador no puede grabar video', true); return; }
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const stream = stage.canvas.captureStream(60);
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
  if (channel) channel.onmessage = e => { if (e.data && e.data.type === 'hello') { broadcast({ type: 'live', graph: liveGraph, fade: 0 }); broadcast({ type: 'play', playing }); broadcastMaster(0); } };
  $('#btnOut').addEventListener('click', () => {
    const w = window.open('output.html', 'pudrus-output', 'width=960,height=540');
    if (!w) toast('El navegador bloqueó la ventana: permití las ventanas emergentes', true);
    else toast('Arrastrá la ventana al proyector y hacé doble clic para pantalla completa');
  });

  /* ── Live: preview (editor) / on air (program) ──────────── */
  const liveBox = $('#live');
  const stage = N.createStage(liveBox, { composite: true });
  stage.resize(1280, 720);
  let liveGraph = clone(graph);
  const contentKey = g => JSON.stringify({ n: g.nodes.map(n => [n.id, n.type, n.v, n.p]), l: g.links });
  let liveKey = contentKey(liveGraph);
  try { stage.go(liveGraph, 0); } catch (e) { console.error(e); }

  function markPending() {
    const pending = !opts.direct && contentKey(graph) !== liveKey;
    $('#btnGo').classList.toggle('is-pending', pending);
  }
  function sendDirect() {
    liveGraph = graph; liveKey = contentKey(graph);
    try { stage.direct(graph); } catch (e) { return; }
    broadcast({ type: 'direct', graph });
  }
  // Put a patch on air (cross-fade); by default the one in the editor
  function goLive(g, fade) {
    g = g || graph;
    const sec = fade === undefined ? opts.fade : fade;
    const next = opts.direct && g === graph ? graph : clone(g);
    try { stage.go(next, sec); } catch (e) { toast('Ese patch no compila; sigue al aire el anterior', true); return; }
    liveGraph = next; liveKey = contentKey(next);
    broadcast({ type: 'live', graph: next, fade: sec });
    markPending();
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
    else { liveGraph = clone(graph); stage.direct(liveGraph); liveKey = contentKey(liveGraph); }
    markPending();
    layoutPreview();
  }
  $('#btnDirect').addEventListener('click', () => { setDirect(!opts.direct); toast(opts.direct ? 'Directo: todo lo que tocás sale al aire' : 'Preview: preparás acá y mandás con «Al aire» (Enter)'); });

  /* ── Scenes: 8 slots, keys 1–8 put them on air ──────────── */
  const SCENES = 'pudrus_nodes_scenes_v1';
  let scenes = (() => { try { const a = JSON.parse(localStorage.getItem(SCENES) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } })();
  scenes.length = 8;
  const saveScenes = () => { try { localStorage.setItem(SCENES, JSON.stringify(scenes)); } catch (e) { toast('No hay espacio para guardar la escena', true); } };
  const sceneBar = $('#scenes');
  let liveScene = -1, pendingShot = -1;
  const shotCanvas = document.createElement('canvas'); shotCanvas.width = 160; shotCanvas.height = 90;

  function paintScenes() {
    sceneBar.textContent = '';
    for (let i = 0; i < 8; i++) {
      const sc = scenes[i];
      const b = el('div', 'scene' + (sc ? '' : ' is-empty') + (i === liveScene ? ' is-live' : ''));
      b.dataset.i = i;
      b.title = sc ? `Escena ${i + 1}: clic = abrir en el editor · ${i + 1} = al aire · clic derecho = opciones` : `Vacía: clic o Shift+${i + 1} guarda el patch del editor`;
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
    graph = clone(scenes[i].graph); selected.clear();
    rebuild(); recompile(); save(); remember(); frameAll();
    toast(`Escena ${i + 1} en el editor` + (opts.direct ? '' : ' · Enter para mandarla al aire'));
  }
  function fireScene(i) {
    const sc = scenes[i];
    if (!sc) { toast(`La escena ${i + 1} está vacía (Shift+${i + 1} para guardar)`); return; }
    if (opts.direct) { graph = clone(sc.graph); selected.clear(); rebuild(); recompile(); save(); remember(); }
    goLive(opts.direct ? graph : sc.graph);
    liveScene = i; paintScenes();
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
  let controls = readJSON(CTL_STORE, []).filter(c => c && typeof c.id === 'number' && typeof c.k === 'string').slice(0, 8);
  let midiMap = readJSON(MIDI_STORE, {});
  const saveControls = () => { try { localStorage.setItem(CTL_STORE, JSON.stringify(controls)); } catch (e) { /* ignore */ } };
  const saveMidi = () => { try { localStorage.setItem(MIDI_STORE, JSON.stringify(midiMap)); } catch (e) { /* ignore */ } };

  function findInput(g, id, k) {
    const n = g.nodes.find(m => m.id === id);
    const inp = n && (N.NODES[n.type].inputs || []).find(i => i.k === k && i.t === 'float');
    return inp ? { n, inp } : null;
  }
  function targetLabel(id, k) {
    const f = findInput(graph, id, k) || findInput(liveGraph, id, k);
    return f ? `${N.NODES[f.n.type].title} · ${f.inp.label}` : '(nodo borrado)';
  }
  function normOf(id, k) {
    const f = findInput(liveGraph, id, k) || findInput(graph, id, k);
    if (!f) return 0;
    const v = f.n.v && f.n.v[k] !== undefined ? f.n.v[k] : f.inp.v;
    return Math.min(1, Math.max(0, (v - f.inp.min) / ((f.inp.max - f.inp.min) || 1)));
  }
  function toggleControl(id, k) {
    const i = controls.findIndex(c => c.id === id && c.k === k);
    if (i >= 0) controls.splice(i, 1);
    else if (controls.length >= 8) { toast('Ya hay 8 controles: quitá alguno primero', true); return; }
    else controls.push({ id, k });
    saveControls(); rebuild(); paintControls(); pushState();
    toast(i >= 0 ? 'Quitado del control' : `Control ${controls.length}: ${targetLabel(id, k)}`);
  }
  // Move a value from outside (phone fader, MIDI knob): 0–1 across the slider range.
  // Changes the editor AND what is on air, so it works live without pressing "Al aire".
  let liveDirty = false;
  function applyControl(id, k, norm) {
    norm = Math.min(1, Math.max(0, +norm || 0));
    for (const g of liveGraph === graph ? [graph] : [graph, liveGraph]) {
      const f = findInput(g, id, k);
      if (!f) continue;
      let v = f.inp.min + norm * (f.inp.max - f.inp.min);
      if (f.inp.step) v = Math.round(v / f.inp.step) * f.inp.step;
      f.n.v = { ...(f.n.v || {}), [k]: v };
      if (g === graph) {
        renderer.setValue(N.uniformName(id, k), v);
        const r = els.get(id); if (r && r.nums[k]) r.nums[k].setDisplay(v);
        save();
      }
    }
    liveDirty = true;
  }
  function flushLive() {
    if (!liveDirty) return;
    liveDirty = false;
    try { stage.direct(liveGraph); } catch (e) { return; }
    broadcast({ type: 'direct', graph: liveGraph });
    liveKey = contentKey(liveGraph);
    markPending();
  }
  function paintControls() {
    const list = $('#ctlList');
    list.textContent = '';
    if (!controls.length) { list.append(el('p', 'dim', 'Todavía no hay controles: clic derecho sobre un valor → «Al control».')); return; }
    controls.forEach((c, i) => {
      const row = el('div', 'ctl-row');
      row.append(el('b', '', String(i + 1)), el('span', '', targetLabel(c.id, c.k)));
      const x = el('button', '', '×'); x.title = 'Quitar';
      x.addEventListener('click', () => toggleControl(c.id, c.k));
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
  const describe = t => t.kind === 'value' ? targetLabel(t.id, t.k) : t.kind === 'scene' ? `Escena ${t.i + 1}` : { go: 'Al aire', black: 'Negro', strobe: 'Strobe', tap: 'Tap' }[t.kind];
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
    if (t.kind === 'value') applyControl(t.id, t.k, v);
    else if (t.kind === 'strobe') { if (pressed) setStrobe(true); if (released) setStrobe(false); }
    else if (!pressed) return;
    else if (t.kind === 'scene') fireScene(t.i);
    else if (t.kind === 'go') goLive();
    else if (t.kind === 'black') setBlack(!stage.black);
    else if (t.kind === 'tap') tap();
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
  const remoteUrl = () => new URL('control/#' + opts.room, document.baseURI).href;
  function remoteStatus(txt) { $('#rmStatus').textContent = txt; $('#btnRemote').classList.toggle('is-on', conns.size > 0); }
  async function startRemote() {
    if (peer) return;
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
      conn.on('data', remoteMsg);
      const gone = () => { if (conns.delete(conn)) { remoteStatus(conns.size ? `${conns.size} celular(es) conectado(s)` : 'Celular desconectado · esperando…'); } };
      conn.on('close', gone); conn.on('error', gone);
    });
  }
  async function showQR() {
    const box = $('#rmQR');
    if (box.dataset.done) return;
    try {
      if (!window.qrcode) await loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js');
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
  $('#rmCopy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(remoteUrl()).then(() => toast('Enlace copiado'), () => {}); });

  function fullState() {
    return {
      t: 'state',
      controls: controls.map(c => ({ label: targetLabel(c.id, c.k), v: normOf(c.id, c.k) })),
      scenes: Array.from({ length: 8 }, (_, i) => { const sc = scenes[i]; return { filled: !!sc, thumb: sc ? sc.thumb || '' : '', live: i === liveScene }; }),
      black: stage.black, bpm: Math.round(bpm), fade: opts.fade, direct: opts.direct,
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
    const v = controls.map(c => Math.round(normOf(c.id, c.k) * 1000) / 1000);
    const key = v.join(',');
    if (key === lastVals) return;
    lastVals = key;
    conns.forEach(c => { try { c.send({ t: 'vals', v }); } catch (e) { /* closed */ } });
  }
  // Messages from the phone (data only, validated)
  function remoteMsg(m) {
    if (!m || typeof m !== 'object') return;
    const i = Number.isInteger(m.i) ? m.i : -1;
    if (m.t === 'ctl' && controls[i] && typeof m.v === 'number') applyControl(controls[i].id, controls[i].k, m.v);
    else if (m.t === 'scene' && i >= 0 && i < 8) fireScene(i);
    else if (m.t === 'go') goLive();
    else if (m.t === 'black') setBlack(!stage.black);
    else if (m.t === 'strobe') setStrobe(!!m.on);
    else if (m.t === 'tap') tap();
    else if (m.t === 'fade' && [0, 0.5, 1, 2, 4].includes(m.v)) { opts.fade = m.v; fadeSel.value = String(m.v); saveOpts(); pushState(); }
  }

  /* ── Main loop ─────────────────────────────────────────── */
  let last = performance.now(), frameN = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) time += dt;
    N.clock.beat = beatNow();
    flushLive();
    pushValues(now);
    const a = audio.read();
    renderer.render(time, a, N.postValues(graph, a));
    grabShot();
    stage.render(time, a);   // on air (also what Foto/Grabar capture)
    // in Directo the preview IS what is on air: show black / strobe on it too
    const vl = stage.veil, show = opts.direct && (vl.black > 0 || vl.flash);
    pvVeil.style.display = show ? 'block' : 'none';
    if (show) { pvVeil.style.background = vl.flash ? '#fff' : '#000'; pvVeil.style.opacity = vl.flash ? 1 : vl.black; }
    drawThumbs(now, a);
    if (audio.on && (frameN++ & 1) === 0) meters.forEach((m, i) => m.style.setProperty('--v', a[i]));
    broadcast({ type: 'frame', t: time, audio: a, beat: N.clock.beat });
  }

  /* ── Start ─────────────────────────────────────────────── */
  $('#btnDirect').classList.toggle('is-on', opts.direct);
  $('#btnThumbs').classList.toggle('is-on', opts.thumbs);
  work.classList.toggle('is-direct', opts.direct);
  paintScenes();
  rebuild();
  recompile();
  applyCam();
  layoutPreview();
  requestAnimationFrame(() => { frameAll(); drawLinks(); });
  requestAnimationFrame(loop);
  // fonts change node sizes -> redraw links once they are in
  if (document.fonts) document.fonts.ready.then(() => drawLinks());
  window.__nodesEditor = { get graph() { return graph; }, get compiled() { return compiled; }, get liveGraph() { return liveGraph; }, stage, addNode, connect, removeNodes, undo, redo, goLive, modulate, set valueTarget(v) { valueTarget = v; }, setDirect, storeScene, fireScene, openScene, setThumbs, get scenes() { return scenes; }, get controls() { return controls; }, toggleControl, applyControl, onMidi, midiLearn, setLearning(t) { learning = t; }, get midiMap() { return midiMap; }, remoteMsg, fullState, tap, get bpm() { return bpm; }, setBlack, setStrobe };
})();
