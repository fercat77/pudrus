/* PARTRUS — the editor: nodes on the left, the particles on the right. Spanish UI, like the other labs. */
(function () {
  'use strict';
  const PP = window.PudrusParticles, DEFS = PP.DEFS, CATS = PP.CATS;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const CUR = 'partrus_cur_v1', OPTS = 'partrus_opts_v1';
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full */ } } };
  const opts = Object.assign({ audio: 'off', size: 'm', aspect: '1.7778' }, store.get(OPTS) || {});
  const saveOpts = () => store.set(OPTS, opts);

  /* ── the system being edited ── */
  let sys, libId = null, dirty = false, touched = false;   // dirty = differs from the library; touched = edited since it was opened
  (function boot() {
    const q = new URLSearchParams(location.search);
    const lib = PP.library();
    if (q.has('edit')) {
      const e = lib.find(x => x.id === q.get('edit'));
      if (e) { sys = e.sys; libId = e.id; }
    }
    if (!sys && q.has('handoff')) {   // NODRUS sends the system of one of its nodes
      const h = store.get('partrus_handoff');
      const s = h && PP.sane(h.sys);
      if (s) { sys = s; libId = h.lib && lib.some(x => x.id === h.lib) ? h.lib : null; dirty = !libId; }
      try { localStorage.removeItem('partrus_handoff'); } catch (e) { /* ok */ }
    }
    if (!sys) {
      const c = store.get(CUR);
      const s = c && PP.sane(c.sys);
      if (s) { sys = s; libId = c.lib && lib.some(x => x.id === c.lib) ? c.lib : null; dirty = !!c.dirty; }
    }
    if (!sys) { sys = clone(PP.PRESETS[0].sys); dirty = true; }
    if (q.has('edit') || q.has('handoff')) history.replaceState(null, '', location.pathname);
  })();
  const byId = id => sys.nodes.find(n => n.id === id);
  const linkInto = (id, k) => sys.links.find(l => l.b === id && l.bi === k);

  /* ── the particles ── */
  const sim = PP.createSim();
  const frame = $('#frame');
  if (PP.ok) frame.append(PP.canvas);
  else { const m = el('div', 'pa-msg', '⚠ ' + PP.error + '. Probá con Chrome o Edge actualizados.'); $('#stage').append(m); }
  function applySim() {
    sim.setSpec(JSON.stringify(sys));   // a fresh string: the engine skips a spec it has already seen (same object)
    const e = $('#err');
    e.hidden = !sim.err; e.textContent = sim.err ? '⚠ ' + sim.err : '';
    const n = sim.count;
    $('#count').textContent = n ? `${{ 16384: '16 mil', 65536: '65 mil', 262144: '262 mil', 1048576: '1 millón' }[n] || n} partículas` : '';
  }

  /* ── saving, history, the live link to NODRUS ── */
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(PP.channel) : null;
  let saveT, bcT, histT;
  let hist = [JSON.stringify(sys)], hi = 0;
  function changed(kind) {
    if (kind !== 'view') { dirty = true; touched = true; paintDirty(); }
    if (kind !== 'pos' && kind !== 'view') applySim();
    clearTimeout(saveT); saveT = setTimeout(() => store.set(CUR, { sys, lib: libId, dirty }), 300);
    if (kind === 'view') return;
    clearTimeout(histT); histT = setTimeout(() => {
      const s = JSON.stringify(sys);
      if (s === hist[hi]) return;
      hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 100) hist.shift(); hi = hist.length - 1;
    }, 300);
    if (kind !== 'pos' && libId && bc) { clearTimeout(bcT); bcT = setTimeout(() => bc.postMessage({ type: 'sys', id: libId, name: sys.name, sys }), 90); }
  }
  function restore(i) {
    hi = i; sys = PP.sane(hist[hi]) || sys; selected = null;
    rebuild(); applySim(); dirty = true; paintDirty();
    store.set(CUR, { sys, lib: libId, dirty });
    if (libId && bc) bc.postMessage({ type: 'sys', id: libId, name: sys.name, sys });
  }
  const undo = () => { clearTimeout(histT); if (hi > 0) restore(hi - 1); };
  const redo = () => { if (hi < hist.length - 1) restore(hi + 1); };
  function setSystem(s, lib, isDirty) {
    sys = clone(s); libId = lib || null; dirty = !!isDirty; touched = false; selected = null;
    hist = [JSON.stringify(sys)]; hi = 0;
    $('#name').value = sys.name || '';
    rebuild(); fitView(); applySim(); sim.reset(); paintDirty();
    store.set(CUR, { sys, lib: libId, dirty });
  }
  function paintDirty() {
    $('#btnSave').classList.toggle('is-dirty', dirty);
    const e = libId && PP.library().find(x => x.id === libId);
    $('#stLib').innerHTML = '';
    $('#stLib').append(e ? (dirty ? '📚 en tu biblioteca · cambios sin guardar' : '📚 guardado en tu biblioteca') : '📚 sin guardar (guardalo para usarlo en NODRUS)');
  }
  function saveToLibrary() {
    const list = PP.library();
    sys.name = ($('#name').value || '').trim().slice(0, 60) || 'Sin nombre';
    $('#name').value = sys.name;
    let e = libId && list.find(x => x.id === libId);
    if (!e) { libId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); e = { id: libId }; list.unshift(e); }
    e.name = sys.name; e.sys = clone(sys); e.t = Date.now();
    if (!PP.saveLibrary(list)) { toast('No se pudo guardar: el navegador no tiene lugar', true); return; }
    dirty = false; touched = false; paintDirty(); store.set(CUR, { sys, lib: libId, dirty });
    if (bc) { bc.postMessage({ type: 'lib' }); bc.postMessage({ type: 'sys', id: libId, name: sys.name, sys }); }
    toast(`💾 «${sys.name}» guardado: ya lo podés elegir en NODRUS`);
  }

  /* ── the node editor ── */
  const graphEl = $('#graph'), nodesEl = $('#nodes'), wires = $('#wires');
  const view = Object.assign({ x: 30, y: 30, z: 1 }, store.get('partrus_view_v1') || {});
  let selected = null;
  const recs = new Map();   // node id → { root, ins: {k: sock}, outs: {k: sock}, nums: {k: paint} }
  function applyView() {
    nodesEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    graphEl.style.backgroundPosition = `${view.x}px ${view.y}px`;
    graphEl.style.backgroundSize = `${24 * view.z}px ${24 * view.z}px`;
    drawWires();
  }
  let viewT;
  const saveView = () => { clearTimeout(viewT); viewT = setTimeout(() => store.set('partrus_view_v1', view), 300); };
  function fitView() {
    if (!sys.nodes.length) return;
    const r = graphEl.getBoundingClientRect();
    const xs = sys.nodes.map(n => n.x), ys = sys.nodes.map(n => n.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 216, y0 = Math.min(...ys), y1 = Math.max(...ys) + 300;
    view.z = Math.max(0.55, Math.min(1, (r.width - 40) / (x1 - x0), (r.height - 70) / (y1 - y0)));
    view.x = 20 - x0 * view.z; view.y = 20 - y0 * view.z;
    applyView(); saveView();
  }
  const fmt = (v, inp) => {
    const span = Math.abs(inp.max - inp.min);
    return (Math.abs(v) >= 100 || span >= 100 ? v.toFixed(0) : span >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',');
  };
  function numWidget(n, inp) {
    const box = el('div', 'num'), fill = el('i', 'num-fill'), lab = el('span', '', inp.label), val = el('span', 'num-v');
    box.append(fill, lab, val);
    const get = () => (n.v[inp.k] !== undefined ? n.v[inp.k] : inp.v);
    const paint = () => {
      const v = get();
      val.textContent = fmt(v, inp);
      fill.style.width = (Math.max(0, Math.min(1, (v - inp.min) / (inp.max - inp.min))) * 100) + '%';
    };
    const set = v => { n.v[inp.k] = Math.round(v * 10000) / 10000; paint(); changed('value'); };
    let sx = 0, sv = 0, moved = false;
    box.addEventListener('pointerdown', e => {
      if (e.button !== 0 || box.querySelector('input')) return;
      e.stopPropagation(); box.setPointerCapture(e.pointerId);
      sx = e.clientX; sv = get(); moved = false;
    });
    box.addEventListener('pointermove', e => {
      if (!box.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - sx;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      const per = (inp.max - inp.min) / 180 * (e.shiftKey ? 0.1 : 1);
      set(Math.max(inp.min, Math.min(inp.max, sv + dx * per)));
    });
    box.addEventListener('pointerup', e => {
      if (!box.hasPointerCapture(e.pointerId)) return;
      box.releasePointerCapture(e.pointerId);
      if (moved) return;
      const f = el('input'); f.value = String(get()).replace('.', ',');
      box.append(f); f.focus(); f.select();
      const done = ok => {
        if (f.dataset.done) return;   // Enter already closed it (removing it fires a blur)
        f.dataset.done = '1';
        if (ok) { const x = parseFloat(f.value.replace(',', '.')); if (Number.isFinite(x)) set(Math.max(-1e4, Math.min(1e4, x))); }
        f.remove();
      };
      f.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
      f.addEventListener('blur', () => done(true));
    });
    box.addEventListener('dblclick', e => { e.stopPropagation(); delete n.v[inp.k]; paint(); changed('value'); });
    const isPub = () => (sys.pub || []).some(x => x.n === n.id && x.k === inp.k);
    box.classList.toggle('is-pub', isPub());
    box.title = isPub() ? 'Esta perilla aparece en el nodo Partículas de NODRUS (clic derecho para sacarla)' : 'Clic derecho: mostrar esta perilla en NODRUS';
    box.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      openPop(pp => {
        const on = isPub();
        pp.append(item(on ? '📌 Sacar de NODRUS' : '📌 Mostrar en NODRUS', () => {
          sys.pub = (sys.pub || []).filter(x => !(x.n === n.id && x.k === inp.k));
          if (!on) {
            if (sys.pub.length >= 16) { toast('Hasta 16 perillas en NODRUS', true); return; }
            sys.pub.push({ n: n.id, k: inp.k });
          }
          rebuildNode(n.id); changed('struct');
          toast(on ? 'Ya no aparece en NODRUS' : `📌 «${DEFS[n.type].title} · ${inp.label}» aparece en el nodo Partículas de NODRUS (guardá el sistema)`);
        }));
        pp.append(el('p', '', 'Así la movés desde NODRUS: a mano, con un LFO, el audio, el MIDI o el celular.'));
      }, e.clientX, e.clientY);
    });
    paint();
    return { box, paint };
  }
  function nodeEl(n) {
    const def = DEFS[n.type];
    const root = el('div', 'nd'); root.dataset.id = n.id;
    root.style.setProperty('--cat', CATS[def.cat].color);
    root.style.left = n.x + 'px'; root.style.top = n.y + 'px';
    const head = el('div', 'nd-head'); head.title = def.help || '';
    head.append(el('span', '', def.title));
    if (n.type !== 'out') {
      const x = el('button', 'nd-x', '×'); x.title = 'Borrar el nodo';
      x.addEventListener('pointerdown', e => e.stopPropagation());
      x.addEventListener('click', () => removeNode(n.id));
      head.append(x);
    }
    const body = el('div', 'nd-body');
    root.append(head, body);
    const rec = { root, ins: {}, outs: {}, nums: {} };
    for (const [k, t, label] of def.outputs) {
      const row = el('div', 'nd-row out'); row.append(el('span', 'lbl', label));
      const s = el('i', 'sock t-' + t); s.dataset.node = n.id; s.dataset.out = k; s.dataset.t = t;
      row.append(s); body.append(row); rec.outs[k] = s;
    }
    for (const q of def.params || []) {
      if (q.when && Object.entries(q.when).some(([k, v]) => PP.paramOf(n, k) !== v)) continue;   // only for that source
      if (q.kind === 'text') {
        const row = el('div', 'nd-row'), ta = el('textarea', 'nd-text');
        ta.rows = 2; ta.value = PP.paramOf(n, q.k); ta.placeholder = q.label; ta.maxLength = 300; ta.spellcheck = false;
        ta.addEventListener('pointerdown', e => e.stopPropagation());
        ta.addEventListener('keydown', e => e.stopPropagation());
        let tt;
        ta.addEventListener('input', () => { clearTimeout(tt); tt = setTimeout(() => { n.p[q.k] = ta.value; changed('value'); }, 150); });
        row.append(ta); body.append(row);
        continue;
      }
      if (q.kind === 'code') {
        const row = el('div', 'nd-row'), b = el('button', 'nd-file nd-code', '✎ Editar código GLSL');
        b.title = 'Escribí tu propio GLSL (Ctrl+Enter aplica)';
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', () => openCode(n, q));
        row.append(b); body.append(row);
        continue;
      }
      if (q.kind === 'image') {
        const row = el('div', 'nd-row'), b = el('button', 'nd-file', n.p[q.k] ? '🖼 Cambiar imagen…' : '🖼 Elegir imagen…');
        b.title = 'PNG con transparencia (un logo) o una foto: las partículas nacen sobre ella';
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', () => pickImage(n, q.k));
        row.append(b); body.append(row);
        continue;
      }
      const row = el('div', 'nd-row'), sel = el('select');
      q.options.forEach(([v, l]) => { const o = el('option', '', q.label + ': ' + l); o.value = v; sel.append(o); });
      sel.value = PP.paramOf(n, q.k);
      sel.addEventListener('pointerdown', e => e.stopPropagation());
      sel.addEventListener('change', () => {
        n.p[q.k] = sel.value;
        if ((def.params || []).some(x => x.when && x.when[q.k] !== undefined) || def.inputs.some(x => x.labels && x.labels.by === q.k)) rebuildNode(n.id);   // other rows depend on this one
        changed('struct');
        if (n.type === 'form' && q.k === 'src' && sel.value === 'camera') toast('📷 El navegador te va a pedir permiso para usar la cámara');
      });
      row.append(sel); body.append(row);
    }
    for (const inp0 of def.inputs) {
      const lbl = PP.labelOf(n, inp0);
      if (lbl === null) continue;   // this figure doesn't use that knob
      const inp = lbl === inp0.label ? inp0 : { ...inp0, label: lbl };
      const row = el('div', 'nd-row in');
      if (!inp.nl) {
        const s = el('i', 'sock t-' + inp.t); s.dataset.node = n.id; s.dataset.in = inp.k; s.dataset.t = inp.t;
        row.append(s); rec.ins[inp.k] = s;
      }
      const lk = linkInto(n.id, inp.k);
      if (inp.t === 'part') row.append(el('span', 'lbl', inp.label));
      else if (lk && inp.t === 'float') {
        const src = byId(lk.a), o = src && DEFS[src.type].outputs.find(x => x[0] === lk.ao);
        row.append(el('span', 'lbl', inp.label), el('span', 'linked', '← ' + (src ? DEFS[src.type].title + (DEFS[src.type].outputs.length > 1 && o ? ' · ' + o[2] : '') : '')));
      } else if (inp.t === 'color') {
        const w = el('label', 'colorw'), c = el('input'); c.type = 'color';
        c.value = n.v[inp.k] || inp.v;
        c.addEventListener('pointerdown', e => e.stopPropagation());
        c.addEventListener('input', () => { n.v[inp.k] = c.value; changed('value'); });
        w.append(el('span', 'lbl', inp.label), c); row.append(w);
      } else {
        const w = numWidget(n, inp); rec.nums[inp.k] = w.paint; row.append(w.box);
      }
      body.append(row);
    }
    head.addEventListener('pointerdown', e => startNodeDrag(e, n));
    root.addEventListener('pointerdown', e => { if (e.button === 0) select(n.id); });
    return rec;
  }
  function rebuild() {
    nodesEl.textContent = ''; recs.clear();
    for (const n of sys.nodes) { const r = nodeEl(n); recs.set(n.id, r); nodesEl.append(r.root); }
    paintSel(); requestAnimationFrame(drawWires);
  }
  function select(id) { selected = id; paintSel(); }
  function paintSel() { recs.forEach((r, id) => r.root.classList.toggle('is-sel', id === selected)); }
  function sockPos(s) {
    const g = graphEl.getBoundingClientRect(), r = s.getBoundingClientRect();
    return [r.left + r.width / 2 - g.left, r.top + r.height / 2 - g.top];
  }
  const curve = ([x1, y1], [x2, y2]) => { const d = Math.max(40, Math.abs(x2 - x1) * 0.5); return `M${x1},${y1} C${x1 + d},${y1} ${x2 - d},${y2} ${x2},${y2}`; };
  let dragWire = null;
  function drawWires() {
    let h = '';
    for (const l of sys.links) {
      const a = recs.get(l.a), b = recs.get(l.b);
      const sa = a && a.outs[l.ao], sb = b && b.ins[l.bi];
      if (!sa || !sb) continue;
      h += `<path class="t-${sa.dataset.t}" d="${curve(sockPos(sa), sockPos(sb))}"/>`;
    }
    if (dragWire) h += `<path class="t-${dragWire.t} drag" d="${curve(dragWire.from, dragWire.to)}"/>`;
    wires.innerHTML = h;
  }
  function startNodeDrag(e, n) {
    if (e.button !== 0) return;
    e.stopPropagation(); select(n.id);
    const r = recs.get(n.id), sx = e.clientX, sy = e.clientY, nx = n.x, ny = n.y;
    let moved = false;
    const mv = ev => {
      const dx = (ev.clientX - sx) / view.z, dy = (ev.clientY - sy) / view.z;
      if (!moved && Math.hypot(dx, dy) < 2) return;
      moved = true;
      n.x = Math.round(nx + dx); n.y = Math.round(ny + dy);
      r.root.style.left = n.x + 'px'; r.root.style.top = n.y + 'px';
      drawWires();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) changed('pos'); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  // does following the links from `from` reach `to`? (a new link to→…→from would close a circle)
  function reaches(from, to) {
    const seen = new Set(), st = [from];
    while (st.length) {
      const x = st.pop();
      if (x === to) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      sys.links.forEach(l => { if (l.a === x) st.push(l.b); });
    }
    return false;
  }
  function connect(a, ao, b, bi) {
    const A = byId(a), B = byId(b);
    if (!A || !B || a === b) return false;
    const o = DEFS[A.type].outputs.find(x => x[0] === ao), i = DEFS[B.type].inputs.find(x => x.k === bi);
    if (!o || !i || o[1] !== i.t || i.nl) return false;
    if (reaches(b, a)) { toast('Ese cable cerraría un círculo', true); return false; }
    sys.links = sys.links.filter(l => !(l.b === b && l.bi === bi));
    sys.links.push({ a, ao, b, bi });
    return true;
  }
  // wires: drag from an output; dragging from a connected input takes its wire
  graphEl.addEventListener('pointerdown', e => {
    const s = e.target.closest && e.target.closest('.sock');
    if (!s || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    let from;
    if (s.dataset.out) from = { a: +s.dataset.node, ao: s.dataset.out, t: s.dataset.t };
    else {
      const l = linkInto(+s.dataset.node, s.dataset.in);
      if (!l) return;
      sys.links = sys.links.filter(x => x !== l);
      from = { a: l.a, ao: l.ao, t: s.dataset.t, took: { b: l.b } };
      rebuildNode(l.b);
    }
    const sa = recs.get(from.a).outs[from.ao];
    dragWire = { t: from.t, from: sockPos(sa), to: sockPos(s) };
    let hot = null;
    const g = graphEl.getBoundingClientRect();
    const mv = ev => {
      dragWire.to = [ev.clientX - g.left, ev.clientY - g.top];
      const t = document.elementFromPoint(ev.clientX, ev.clientY), ts = t && t.closest && t.closest('.sock[data-in]');
      if (hot && hot !== ts) hot.classList.remove('hot');
      hot = ts && ts.dataset.t === from.t ? ts : null;
      if (hot) hot.classList.add('hot');
      drawWires();
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (hot) hot.classList.remove('hot');
      dragWire = null;
      if (hot && connect(from.a, from.ao, +hot.dataset.node, hot.dataset.in)) { rebuildNode(+hot.dataset.node); changed('struct'); }
      else if (from.took) changed('struct');
      drawWires();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }, true);
  function rebuildNode(id) {
    const n = byId(id), old = recs.get(id);
    if (!n || !old) return;
    const r = nodeEl(n); old.root.replaceWith(r.root); recs.set(id, r);
    r.root.classList.toggle('is-sel', id === selected);
  }
  // pan / zoom / double click on the background
  graphEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.nd') || e.target.closest('button') || (e.button !== 0 && e.button !== 1)) return;
    const sx = e.clientX, sy = e.clientY, vx = view.x, vy = view.y;
    let moved = false;
    graphEl.setPointerCapture(e.pointerId);
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      moved = true; graphEl.classList.add('panning');
      view.x = vx + ev.clientX - sx; view.y = vy + ev.clientY - sy; applyView();
    };
    const up = () => {
      graphEl.removeEventListener('pointermove', mv); graphEl.removeEventListener('pointerup', up);
      graphEl.classList.remove('panning');
      if (moved) saveView(); else select(null);
    };
    graphEl.addEventListener('pointermove', mv); graphEl.addEventListener('pointerup', up);
  });
  graphEl.addEventListener('wheel', e => {
    e.preventDefault();
    const g = graphEl.getBoundingClientRect(), px = e.clientX - g.left, py = e.clientY - g.top;
    const z = Math.max(0.3, Math.min(2, view.z * Math.exp(-e.deltaY * 0.0012)));
    view.x = px - (px - view.x) * z / view.z; view.y = py - (py - view.y) * z / view.z; view.z = z;
    applyView(); saveView();
  }, { passive: false });
  graphEl.addEventListener('dblclick', e => { if (!e.target.closest('.nd') && !e.target.closest('button')) addMenu(e.clientX, e.clientY, toGraph(e.clientX, e.clientY)); });
  function toGraph(cx, cy) { const g = graphEl.getBoundingClientRect(); return { x: Math.round((cx - g.left - view.x) / view.z), y: Math.round((cy - g.top - view.y) / view.z) }; }

  const imgIn = el('input'); imgIn.type = 'file'; imgIn.accept = 'image/png,image/jpeg,image/webp,image/gif'; imgIn.hidden = true;
  document.body.append(imgIn);
  let imgFor = null;
  function pickImage(n, k) { imgFor = [n, k]; imgIn.click(); }
  imgIn.addEventListener('change', () => {
    const f = imgIn.files[0]; imgIn.value = '';
    if (!f || !imgFor) return;
    const [n, k] = imgFor, url = URL.createObjectURL(f), im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const sc = Math.min(1, 256 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = el('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
      const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let clear = false; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { clear = true; break; }
      n.p[k] = clear ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
      rebuildNode(n.id); changed('value');
      toast('🖼 ' + f.name + (clear ? ': las partículas nacen sobre lo que no es transparente' : ': una foto sin transparencia — en «Toma» elegí lo claro o lo oscuro'));
    };
    im.onerror = () => { URL.revokeObjectURL(url); toast('No se pudo leer esa imagen', true); };
    im.src = url;
  });

  /* the GLSL editor (a dialog): the node's code, Ctrl+Enter applies, errors in your own line numbers */
  const codeDlg = el('div', 'pa-modal'); codeDlg.hidden = true;
  codeDlg.innerHTML = '<div class="pa-card pa-code"><h2 id="codeTitle">Código GLSL</h2><textarea id="codeArea" spellcheck="false"></textarea><p class="pa-codemsg" id="codeMsg"></p><div class="row"><button class="pa-btn" id="codeApply">Aplicar (Ctrl+Enter)</button><button class="pa-btn" id="codeReset">Volver al ejemplo</button><button class="pa-btn" id="codeClose">Cerrar</button></div></div>';
  document.body.append(codeDlg);
  let codeFor = null;
  function openCode(n, q) {
    codeFor = { n, q };
    $('#codeTitle').textContent = 'Código GLSL · ' + DEFS[n.type].title;
    $('#codeArea').value = PP.paramOf(n, q.k);
    $('#codeMsg').textContent = ''; $('#codeMsg').className = 'pa-codemsg';
    codeDlg.hidden = false; $('#codeArea').focus();
  }
  function applyCode() {
    if (!codeFor) return;
    codeFor.n.p[codeFor.q.k] = $('#codeArea').value;
    changed('struct');
    const m = $('#codeMsg');
    m.textContent = sim.err ? '⚠ ' + sim.err : '✓ Compila: ya se ve en la vista';
    m.className = 'pa-codemsg' + (sim.err ? ' bad' : ' ok');
  }
  $('#codeApply').addEventListener('click', applyCode);
  $('#codeClose').addEventListener('click', () => { codeDlg.hidden = true; });
  $('#codeReset').addEventListener('click', () => { if (codeFor) { $('#codeArea').value = codeFor.q.v; applyCode(); } });
  $('#codeArea').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyCode(); }
    if (e.key === 'Tab') { e.preventDefault(); const t = e.target, a = t.selectionStart; t.setRangeText('  ', a, t.selectionEnd, 'end'); }
    if (e.key === 'Escape') codeDlg.hidden = true;
  });

  /* adding and removing: forces and Aspecto slip into the chain on their own */
  const nextId = () => sys.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  function chainList() {
    const out = sys.nodes.find(n => n.type === 'out'), list = [];
    let l = out && linkInto(out.id, 'in');
    const seen = new Set();
    while (l && !seen.has(l.a)) { const n = byId(l.a); if (!n) break; seen.add(n.id); list.unshift(n); if (n.type === 'emit') break; l = linkInto(n.id, 'in'); }
    if (out) list.push(out);
    return list;
  }
  function addNode(type, at) {
    const def = DEFS[type];
    if (def.unique) { const ex = sys.nodes.find(n => n.type === type); if (ex) { select(ex.id); toast(`Ya hay un ${def.title}: puede haber uno solo`); return; } }
    const n = { id: nextId(), type, x: 0, y: 0, v: {}, p: {} };
    const chain = chainList();
    if (def.cat === 'emit' && chain[0] && PP.isEmitter(chain[0].type)) {
      const old = chain[0];
      n.x = old.x; n.y = old.y;
      sys.links = sys.links.map(l => (l.a === old.id ? { ...l, a: n.id } : l)).filter(l => l.b !== old.id);
      sys.nodes = sys.nodes.filter(x => x !== old);
      sys.nodes.push(n);
      selected = n.id;
      rebuild(); changed('struct');
      toast(`Cambié el ${DEFS[old.type].title} por el ${def.title} (Ctrl+Z lo vuelve atrás)`);
      return;
    }
    if (def.cat === 'force' || def.cat === 'look') {
      // before the Aspecto (forces) or the Salida; the nodes from there on move one place to the right
      let ti = chain.findIndex(c => (def.cat === 'force' && c.type === 'look') || c.type === 'out');
      if (ti < 0) ti = chain.length;
      const T = chain[ti];
      if (T) {
        const l = linkInto(T.id, 'in');
        n.x = T.x; n.y = T.y;
        chain.slice(ti).forEach(c => { c.x += 236; });
        sys.nodes.push(n);
        if (l) { sys.links = sys.links.filter(x => x !== l); sys.links.push({ a: l.a, ao: l.ao, b: n.id, bi: 'in' }); }
        sys.links.push({ a: n.id, ao: 'out', b: T.id, bi: 'in' });
      } else { Object.assign(n, at || { x: 0, y: 0 }); sys.nodes.push(n); }
    } else {
      const c = at || (() => { const g = graphEl.getBoundingClientRect(); return toGraph(g.left + g.width * 0.4, g.top + g.height * 0.65); })();
      n.x = c.x; n.y = c.y;
      sys.nodes.push(n);
      if (type === 'emit' && chain[0] && chain[0].type !== 'emit' && !linkInto(chain[0].id, 'in')) sys.links.push({ a: n.id, ao: 'out', b: chain[0].id, bi: 'in' });
    }
    selected = n.id;
    rebuild(); changed('struct');
    if (def.cat === 'val') toast(`Conectá la salida del ${def.title} a una perilla (arrastrá desde el enchufe de la derecha)`);
  }
  function removeNode(id) {
    const n = byId(id);
    if (!n || n.type === 'out') return;
    const into = linkInto(id, 'in'), outs = sys.links.filter(l => l.a === id && l.ao === 'out');
    sys.links = sys.links.filter(l => l.a !== id && l.b !== id);
    if (into) outs.forEach(o => sys.links.push({ a: into.a, ao: into.ao, b: o.b, bi: o.bi }));   // the chain closes again
    if (DEFS[n.type].cat === 'force' || DEFS[n.type].cat === 'look') {
      const chain = chainList(), at = chain.findIndex(c => c.x > n.x);
      if (at >= 0) chain.slice(at).forEach(c => { if (Math.abs(c.y - n.y) < 300) c.x -= 236; });
    }
    sys.nodes = sys.nodes.filter(x => x !== n);
    sys.pub = (sys.pub || []).filter(x => x.n !== id);
    if (selected === id) selected = null;
    rebuild(); changed('struct');
  }

  /* ── popovers ── */
  const pop = $('#pop');
  let popOwner = null;
  function openPop(build, x, y, owner) {
    if (!pop.hidden && popOwner === owner && owner) { closePop(); return; }
    pop.textContent = ''; build(pop); pop.hidden = false; popOwner = owner || null;
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, x)) + 'px';
    pop.style.top = Math.max(6, Math.min(innerHeight - r.height - 6, y)) + 'px';
  }
  function closePop() { pop.hidden = true; popOwner = null; }
  addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !(popOwner && popOwner.contains(e.target))) closePop(); });
  const item = (txt, fn, extra) => { const b = el('button', 'it'); b.append(txt); if (extra) b.append(extra); b.addEventListener('click', () => { closePop(); fn(); }); return b; };
  const below = btn => { const r = btn.getBoundingClientRect(); return [r.left, r.bottom + 4]; };
  function addMenu(x, y, at) {
    openPop(p => {
      for (const [cat, c] of Object.entries(CATS)) {
        const types = Object.keys(DEFS).filter(t => DEFS[t].cat === cat && t !== 'out');
        if (!types.length) continue;
        p.append(el('h4', '', c.title));
        types.forEach(t => {
          const dot = el('i'); dot.style.background = c.color;
          const b = item('', () => addNode(t, at), el('small', '', DEFS[t].help ? '' : ''));
          b.prepend(dot, DEFS[t].title); b.title = DEFS[t].help || '';
          p.append(b);
        });
      }
    }, x, y);
  }
  $('#btnAdd').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); addMenu(r.left, r.top - 420); });
  // only when you changed something since opening it (an example you just looked at goes away without asking)
  const askLeave = () => !(dirty && touched) || confirm(`Cambiaste «${sys.name || 'Sin nombre'}» y no lo guardaste. ¿Seguir igual? (💾 Guardar lo deja en tu biblioteca)`);
  $('#btnEx').addEventListener('click', e => openPop(p => {
    p.append(el('h4', '', 'Ejemplos'));
    PP.PRESETS.forEach(pr => p.append(item(pr.name, () => { if (askLeave()) { setSystem(pr.sys, null, true); toast(`✨ ${pr.name}: cambiá lo que quieras y guardalo con tu nombre`); } })));
    p.append(el('p', '', 'Los que usan graves o ráfagas se mueven con el sonido y el tempo (🎤 y BPM arriba).'));
  }, ...below(e.currentTarget), e.currentTarget));
  $('#btnNew').addEventListener('click', () => { if (askLeave()) { setSystem(PP.blank(), null, true); } });
  $('#btnSave').addEventListener('click', saveToLibrary);
  $('#btnLib').addEventListener('click', e => openPop(p => {
    const list = PP.library();
    p.append(el('h4', '', 'Tu biblioteca'));
    if (!list.length) p.append(el('div', 'empty', 'Todavía no guardaste ninguno (💾 Guardar).'));
    list.forEach(x => {
      const del = el('button', 'del', '×'); del.title = 'Borrar de la biblioteca';
      const b = item(x.name, () => { if (x.id === libId || askLeave()) setSystem(x.sys, x.id, false); }, del);
      if (x.id === libId) b.classList.add('is-on');
      del.addEventListener('click', ev => {
        ev.stopPropagation();
        if (!confirm(`¿Borrar «${x.name}» de la biblioteca? Los patches de NODRUS que lo usan lo siguen teniendo.`)) return;
        PP.saveLibrary(PP.library().filter(y => y.id !== x.id));
        if (libId === x.id) { libId = null; dirty = true; paintDirty(); store.set(CUR, { sys, lib: libId, dirty }); }
        if (bc) bc.postMessage({ type: 'lib' });
        b.remove();
      });
      p.append(b);
    });
  }, ...below(e.currentTarget), e.currentTarget));
  $('#btnFile').addEventListener('click', e => openPop(p => {
    p.append(item('⤓ Bajar como archivo (.json)', () => {
      const b = new Blob([JSON.stringify({ partrus: 1, sys }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.download = 'partrus_' + (sys.name || 'sistema').replace(/[^\w-]+/g, '_') + '.json';
      a.href = URL.createObjectURL(b); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }));
    p.append(item('⤒ Abrir un archivo…', () => { if (askLeave()) $('#fileIn').click(); }));
  }, ...below(e.currentTarget), e.currentTarget));
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()), s = PP.sane(j && j.sys ? j.sys : j);
      if (!s) throw new Error('bad');
      setSystem(s, null, true); toast(`⤒ «${s.name || f.name}» abierto: guardalo para usarlo en NODRUS`);
    } catch (err) { toast('Ese archivo no es un sistema de PARTRUS', true); }
  });
  $('#name').value = sys.name || '';
  $('#name').addEventListener('input', () => { sys.name = $('#name').value.slice(0, 60); changed('name'); });
  $('#name').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
  $('#btnNodrus').addEventListener('click', e => openPop(p => {
    p.append(el('h4', '', 'En NODRUS'));
    p.append(el('p', '', '1. Guardá este sistema (💾). 2. En NODRUS agregá el nodo Entrada → Partículas y elegilo. Sale como una imagen con transparencia: mezclalo con lo que quieras, va al aire, al proyector y a los videos que exportes.'));
    p.append(el('p', '', 'Con PARTRUS abierto, lo que cambies acá se ve al instante en NODRUS (también al aire).'));
    p.append(item('◈ Abrir NODRUS', () => {
      if (window.opener && !window.opener.closed) { try { window.opener.focus(); return; } catch (e) { /* another site */ } }
      const w = window.open(new URL('../nodes/?pc', location.href).href, 'nodrus'); if (!w && !/Electron\//.test(navigator.userAgent)) toast('El navegador bloqueó la ventana: permití las ventanas emergentes', true); }));
  }, ...below(e.currentTarget), e.currentTarget));

  /* ── sound: off · microphone · SYNDRUS ── */
  const audio = {
    bands: [0, 0, 0, 0], an: null, data: null, ctx: null, stream: null,
    async start() {
      this.stop();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.55;
      src.connect(this.an); this.data = new Uint8Array(this.an.frequencyBinCount);
    },
    stop() {
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx) this.ctx.close().catch(() => {});
      this.stream = this.ctx = this.an = null;
    },
    read() {
      let raw = [0, 0, 0, 0];
      if (opts.audio === 'syndrus' && syLive()) raw = SY.bands.map(v => Math.min(1, +v || 0));
      else if (opts.audio === 'mic' && this.an) {
        this.an.getByteFrequencyData(this.data);
        const hz = this.ctx.sampleRate / this.an.fftSize;
        const band = (lo, hi) => { let s = 0, n = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(this.data.length - 1, Math.ceil(hi / hz)); i++) { s += this.data[i]; n++; } return n ? s / n / 255 : 0; };
        raw = [band(20, 12000), band(20, 150), band(150, 2000), band(2000, 12000)].map(v => Math.min(1, Math.pow(v * 1.8, 1.3)));
      }
      this.bands = this.bands.map((b, i) => (raw[i] > b ? b + (raw[i] - b) * 0.6 : b + (raw[i] - b) * 0.12));
      return this.bands;
    },
  };
  const SY = { last: 0, bpm: 0, beat: 0, epoch: 0, playing: false, bands: [0, 0, 0, 0] };
  const syFresh = () => performance.now() - SY.last < 1500;
  const syLive = () => syFresh() && SY.playing;
  const syBeat = () => (SY.playing ? SY.beat + (performance.timeOrigin + performance.now() - SY.epoch) / 1000 * SY.bpm / 60 : SY.beat);
  if ('BroadcastChannel' in window) {
    const ch = new BroadcastChannel('pudrus-syndrus');
    ch.onmessage = e => {
      const m = e.data || {};
      if (m.type !== 'sync') return;
      const was = syLive();
      SY.last = performance.now(); SY.bpm = +m.bpm || 120; SY.beat = +m.beat || 0; SY.epoch = +m.epoch || 0; SY.playing = !!m.playing;
      if (Array.isArray(m.bands)) SY.bands = m.bands;
      if (!was && syLive() && opts.audio !== 'syndrus') toast('🎛 SYNDRUS está sonando: elegilo en 🎤 Sonido para que las partículas lo sigan');
    };
  }
  async function setAudio(src) {
    if (src === 'mic') {
      try { await audio.start(); } catch (e) { toast('No se pudo usar el micrófono', true); src = 'off'; }
    } else audio.stop();
    opts.audio = src; saveOpts(); paintAudio();
  }
  function paintAudio() {
    const s = opts.audio;
    $('#btnAudio').classList.toggle('is-on', (s === 'mic' && !!audio.an) || (s === 'syndrus' && syLive()));
    $('#stAudio').textContent = s === 'mic' ? (audio.an ? '🎤 micrófono' : '🎤 micrófono cerrado') : s === 'syndrus' ? (syLive() ? `🎛 SYNDRUS · ${Math.round(SY.bpm)} BPM` : '🎛 esperando a SYNDRUS') : 'sonido apagado';
  }
  $('#btnAudio').addEventListener('click', e => openPop(p => {
    p.append(el('h4', '', 'Sonido'));
    [['off', 'Apagado'], ['mic', '🎤 Micrófono / entrada de audio'], ['syndrus', '🎛 SYNDRUS (tempo y sonido)']].forEach(([k, l]) => {
      const b = item(l, () => setAudio(k)); if (opts.audio === k) b.classList.add('is-on'); p.append(b);
    });
    p.append(el('p', '', 'Mueve los nodos Audio, las explosiones y ráfagas con graves. Con SYNDRUS también sigue su tempo.'));
  }, ...below(e.currentTarget), e.currentTarget));
  if (opts.audio === 'mic') setAudio('mic'); else paintAudio();
  setInterval(paintAudio, 1000);

  /* tempo: tap (T) or SYNDRUS */
  let bpm = 120, beatOrigin = performance.now();
  const taps = [];
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now); if (taps.length > 6) taps.shift();
    if (taps.length >= 2) { bpm = Math.max(40, Math.min(240, 60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)))); }
    beatOrigin = now;
    $('#bpm').textContent = Math.round(bpm);
  }
  $('#btnTap').addEventListener('click', tap);
  const beatNow = () => (opts.audio === 'syndrus' && syLive() ? syBeat() : (performance.now() - beatOrigin) / 1000 * bpm / 60);

  /* ── the preview loop ── */
  let paused = false, simT = 0, lastNow = performance.now(), fpsN = 0, fpsT = performance.now(), lastBeatI = -1;
  const stage = $('#stage'), meter = [...document.querySelectorAll('#meter i')];
  const AR = () => +opts.aspect || 16 / 9;
  function fitFrame() {
    const r = stage.getBoundingClientRect(), a = AR();
    let w = r.width, h = w / a;
    if (h > r.height) { h = r.height; w = h * a; }
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    if (PP.ok) { PP.canvas.style.width = w + 'px'; PP.canvas.style.height = h + 'px'; }
    const dpr = Math.min(2, devicePixelRatio || 1), ph = Math.min(1080, Math.round(h * dpr));
    return [Math.max(2, Math.round(ph * a)), Math.max(2, ph)];
  }
  let size = [2, 2];
  new ResizeObserver(() => { size = fitFrame(); }).observe(stage);

  /* ── the preview window: S / M / L, moved and resized by hand, ▣ behind the nodes, fullscreen ── */
  const main = $('#main'), viewEl = $('#view'), viewbar = $('#viewbar');
  const SIZES = { s: 360, m: 520, l: 760 };   // the long side, in px
  if (!SIZES[opts.size]) opts.size = 'm';
  if (!opts.win || typeof opts.win !== 'object') opts.win = {};
  function layoutView() {
    const back = main.classList.contains('backdrop');
    if (back) { if (viewbar.parentNode !== main) main.append(viewbar); }
    else if (viewbar.parentNode !== viewEl) viewEl.insertBefore(viewbar, $('#wsize'));
    if (back || document.fullscreenElement === viewEl) { stage.style.width = stage.style.height = ''; viewEl.style.width = ''; return; }
    const r = main.getBoundingClientRect(), a = AR(), long = SIZES[opts.size];
    let w = Number.isFinite(opts.win.w) ? opts.win.w : (a >= 1 ? long : Math.round(long * a));
    w = Math.max(200, Math.min(w, r.width - 24));
    let h = Math.round(w / a);
    const room = r.height - 24 - (viewbar.offsetHeight || 34);
    if (h > room) { h = Math.max(110, room); w = Math.round(h * a); }
    viewEl.style.width = w + 'px'; stage.style.width = w + 'px'; stage.style.height = h + 'px';
    viewEl.classList.toggle('is-narrow', w < 470);
    if (Number.isFinite(opts.win.x) && Number.isFinite(opts.win.y)) {
      const vh = viewEl.offsetHeight;
      viewEl.style.left = Math.min(Math.max(0, opts.win.x), Math.max(0, r.width - w)) + 'px';
      viewEl.style.top = Math.min(Math.max(0, opts.win.y), Math.max(0, r.height - vh)) + 'px';
      viewEl.style.right = 'auto';
    } else { viewEl.style.left = ''; viewEl.style.top = ''; viewEl.style.right = ''; }
  }
  function paintSizes() {
    document.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('is-on', b.dataset.size === opts.size && !main.classList.contains('backdrop')));
    $('#btnBack').classList.toggle('is-on', main.classList.contains('backdrop'));
  }
  function setBackdrop(on) {
    main.classList.toggle('backdrop', on); opts.back = on; saveOpts();
    layoutView(); paintSizes();
  }
  document.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => {
    opts.size = b.dataset.size; delete opts.win.w; saveOpts();
    if (main.classList.contains('backdrop')) setBackdrop(false); else { layoutView(); paintSizes(); }
  }));
  $('#btnBack').addEventListener('click', () => setBackdrop(!main.classList.contains('backdrop')));
  // move (the strip on top) and resize (the corner at the bottom left: the window hangs from the right)
  function winDrag(e, mode) {
    if (e.button !== 0 || main.classList.contains('backdrop')) return;
    e.preventDefault(); e.stopPropagation();
    const t = e.currentTarget; t.setPointerCapture(e.pointerId);
    const r = viewEl.getBoundingClientRect(), mr = main.getBoundingClientRect();
    const s0 = { x: e.clientX, y: e.clientY, l: r.left - mr.left, t: r.top - mr.top, w: r.width, right: r.right - mr.left };
    viewEl.classList.add('is-moving');
    const mv = ev => {
      if (mode === 'move') { opts.win.x = Math.round(s0.l + ev.clientX - s0.x); opts.win.y = Math.round(s0.t + ev.clientY - s0.y); }
      else {
        const w = Math.round(Math.max(200, s0.w - (ev.clientX - s0.x)));
        opts.win.w = w; opts.win.x = Math.round(s0.right - w); opts.win.y = Math.round(s0.t);
      }
      layoutView();
    };
    const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); viewEl.classList.remove('is-moving'); saveOpts(); };
    t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up);
  }
  $('#grip').addEventListener('pointerdown', e => winDrag(e, 'move'));
  $('#wsize').addEventListener('pointerdown', e => winDrag(e, 'size'));
  $('#grip').addEventListener('dblclick', () => { opts.win = {}; saveOpts(); layoutView(); });
  addEventListener('resize', layoutView);
  document.addEventListener('fullscreenchange', layoutView);

  /* ── export: a photo (black or transparent) or a video, at the chosen format and resolution ── */
  if (!opts.exp || typeof opts.exp !== 'object') opts.exp = {};
  const ex = Object.assign({ res: 1080, fps: 30, q: 'alta', dur: 0 }, opts.exp);
  const even = x => Math.max(2, Math.round(x / 2) * 2);
  const expSize = () => { const a = AR(), s = ex.res; return a >= 1 ? [even(s * a), s] : [s, even(s / a)]; };
  const fmtName = () => ({ '1.7778': '16x9', '0.5625': '9x16', '0.8': '4x5', '1': '1x1', '1.3333': '4x3' }[opts.aspect] || 'vista');
  const fileTag = () => `partrus_${(sys.name || 'sistema').replace(/[^\w-]+/g, '_')}_${fmtName()}_${expSize().join('x')}_${Date.now()}`;
  function saveBlob(b, name) { const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(b); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 15000); }
  let rec = null;   // { r: MediaRecorder, c: canvas, g: 2d, t0, size, stopAt }
  function composite(c, g, transparent) {   // the particles over black (a video has no transparency)
    g.globalCompositeOperation = 'copy';
    if (transparent) g.clearRect(0, 0, c.width, c.height); else { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; }
    g.drawImage(PP.canvas, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
  }
  function takePhoto(transparent) {
    if (!PP.ok || sim.err) { toast('No hay nada para exportar', true); return; }
    const [w, h] = expSize();
    const cv = sim.frame(simT, audio.bands, beatNow(), w, h);   // one frame at the full export size (time does not move)
    if (!cv) return;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    composite(c, c.getContext('2d'), transparent);
    c.toBlob(b => { if (b) { saveBlob(b, fileTag() + (transparent ? '_transparente' : '') + '.png'); toast(`📷 Foto guardada · ${w}×${h}${transparent ? ' · fondo transparente' : ''}`); } }, 'image/png');
  }
  const bitrateFor = ([w, h], fps) => Math.round(Math.min(80e6, Math.max(4e6, w * h * fps * ({ normal: 0.07, alta: 0.12, max: 0.2 }[ex.q] || 0.12))));
  function startRec() {
    if (rec) return;
    if (!PP.ok || sim.err) { toast('No hay nada para grabar', true); return; }
    const c = document.createElement('canvas');
    if (!c.captureStream || typeof MediaRecorder === 'undefined') { toast('Este navegador no puede grabar video', true); return; }
    const sz = expSize(); c.width = sz[0]; c.height = sz[1];
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, sz[0], sz[1]);
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const stream = c.captureStream(ex.fps);
    if (opts.audio === 'mic' && audio.stream) audio.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const chunks = [];
    let r;
    try { r = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrateFor(sz, ex.fps) } : undefined); } catch (e) { toast('No se pudo empezar a grabar', true); return; }
    r.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    r.onstop = () => {
      const type = r.mimeType || 'video/webm';
      saveBlob(new Blob(chunks, { type }), `${fileTag()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
      toast('🎥 Video guardado');
    };
    r.start();   // no timeslice: some phones played only the first seconds of an MP4 recorded in slices
    rec = { r, c, g, size: sz, t0: performance.now(), stopAt: ex.dur ? performance.now() + ex.dur * 1000 : 0 };
    paintRec();
    toast(`● Grabando · ${sz.join('×')} · ${ex.fps} fps${ex.dur ? ' · ' + ex.dur + ' s' : ''}${opts.audio === 'mic' && audio.stream ? ' · con el micrófono' : ''}`);
  }
  function stopRec() {
    if (!rec) return;
    const r = rec.r; rec = null;
    try { r.stop(); } catch (e) { /* already stopped */ }
    paintRec(); size = fitFrame(); applySim();
  }
  function paintRec() {
    const b = $('#btnExport');
    b.classList.toggle('is-rec', !!rec);
    b.innerHTML = rec ? '■<span class="nl"> Detener</span>' : '⤓<span class="nl"> Exportar</span>';
    b.title = rec ? 'Detener la grabación y guardar el video' : 'Exportar: foto o video';
    $('#count').classList.toggle('rec', !!rec);
  }
  function exportPop(anchor) {
    openPop(p => {
      p.append(el('h4', '', 'Exportar'));
      const grid = el('div', 'pa-exp');
      const seg = (label, key, list, fmt) => {
        const s = el('div', 'pa-seg');
        list.forEach(v => {
          const b = el('button', ex[key] === v ? 'is-on' : '', fmt ? fmt(v) : String(v));
          b.addEventListener('click', () => { ex[key] = v; opts.exp = { ...ex }; saveOpts(); s.querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b)); paintSize(); });
          s.append(b);
        });
        grid.append(el('span', '', label), s);
      };
      const fmtSel = el('div', 'pa-seg');
      [['1.7778', '16:9'], ['0.5625', '9:16'], ['0.8', '4:5'], ['1', '1:1'], ['1.3333', '4:3']].forEach(([v, l]) => {
        const b = el('button', opts.aspect === v ? 'is-on' : '', l);
        b.addEventListener('click', () => { setAspect(v); fmtSel.querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b)); paintSize(); });
        fmtSel.append(b);
      });
      grid.append(el('span', '', 'Formato'), fmtSel);
      seg('Resolución', 'res', [720, 1080, 1440], v => v + 'p');
      seg('Cuadros', 'fps', [30, 60], v => v + ' fps');
      seg('Calidad', 'q', ['normal', 'alta', 'max'], v => ({ normal: 'normal', alta: 'alta', max: 'máxima' }[v]));
      seg('Duración', 'dur', [0, 5, 10, 15, 30, 60], v => (v ? v + ' s' : 'hasta que pare'));
      p.append(grid);
      const sizeLine = el('p', '');
      const paintSize = () => { sizeLine.textContent = `${expSize().join(' × ')} px · ${ex.fps} fps · MP4 (o WebM si el navegador no puede MP4)`; };
      paintSize(); p.append(sizeLine);
      p.append(item('📷 Foto (PNG, fondo negro)', () => { closePop(); takePhoto(false); }));
      p.append(item('📷 Foto con fondo transparente (PNG)', () => { closePop(); takePhoto(true); }));
      const rb = item('● Grabar video', () => { closePop(); startRec(); }); rb.classList.add('rec'); p.append(rb);
      p.append(el('p', '', 'El video se graba en vivo: lo que veas es lo que queda (con el sonido del micrófono si lo usás). Las partículas no tienen fondo: en NODRUS se mezclan con lo que quieras.'));
    }, ...below(anchor), anchor);
  }
  $('#btnExport').addEventListener('click', e => { if (rec) stopRec(); else exportPop(e.currentTarget); });
  function setAspect(v) { opts.aspect = v; $('#aspect').value = v; delete opts.win.w; saveOpts(); layoutView(); size = fitFrame(); }

  // the preview draws at most 60 times a second, 30 while you work in another window, and stops when it can't be seen:
  // in a show NODRUS and SYNDRUS need the computer more than this editor
  let lastDraw = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!rec) {
      if (document.hidden) return;
      const cap = document.hasFocus() ? 60 : 30;
      if (now - lastDraw < 1000 / cap - 2) return;
    }
    lastDraw = now;
    const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    if (!paused) simT += dt;
    const bands = audio.read(), beat = beatNow();
    if (opts.audio === 'syndrus' && syLive() && Math.abs(SY.bpm - bpm) > 0.01) { bpm = SY.bpm; $('#bpm').textContent = Math.round(bpm); }
    if (rec && rec.stopAt && now >= rec.stopAt) stopRec();
    const rsz = rec ? rec.size : size;   // while recording the particles are drawn at the video's size
    if (PP.ok && !sim.err) {
      const cv = sim.frame(simT, bands, beat, rsz[0], rsz[1], ptr ? { ptr } : undefined);
      if (rec && cv) composite(rec.c, rec.g, false);
    }
    if (rec) { const s = Math.floor((now - rec.t0) / 1000); $('#count').textContent = `● ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${rec.stopAt ? ' / ' + ex.dur + ' s' : ''}`; }
    meter.forEach((m, i) => { m.style.height = Math.max(1, Math.round(bands[i] * 12)) + 'px'; });
    const bi = Math.floor(beat);
    if (bi !== lastBeatI) { lastBeatI = bi; const t = $('#btnTap'); t.classList.add('beat'); setTimeout(() => t.classList.remove('beat'), 90); }
    fpsN++;
    if (now - fpsT > 1000) { $('#stFps').textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' fps · ' + size[0] + '×' + size[1]; fpsN = 0; fpsT = now; }
  }
  $('#btnRestart').addEventListener('click', () => sim.reset());
  $('#btnKick').addEventListener('click', () => sim.kick());
  const outNode = () => sys.nodes.find(n => n.type === 'out');
  function setCam(vals) {
    const o = outNode(); if (!o) return;
    Object.assign(o.v, vals);
    const r = recs.get(o.id); if (r) Object.keys(vals).forEach(k => { if (r.nums[k]) r.nums[k](); });
    changed('value');
  }
  $('#btnCam').addEventListener('click', () => { const o = outNode(); if (!o) return; ['yaw', 'pitch', 'dist', 'spin'].forEach(k => delete o.v[k]); setCam({}); toast('Cámara al frente'); });
  function orbitStart(e, on) {
    const o = outNode(); if (!o) return;
    const y0 = PP.valueOf(o, 'yaw'), p0 = PP.valueOf(o, 'pitch'), sx = e.clientX, sy = e.clientY;
    on.setPointerCapture(e.pointerId); on.classList.add('orbit');
    const mv = ev => {
      let yaw = y0 + (ev.clientX - sx) * 0.4;
      yaw = ((yaw + 180) % 360 + 360) % 360 - 180;
      setCam({ yaw: Math.round(yaw * 10) / 10, pitch: Math.round(Math.max(-89, Math.min(89, p0 + (ev.clientY - sy) * 0.3)) * 10) / 10 });
    };
    const up = () => { on.removeEventListener('pointermove', mv); on.removeEventListener('pointerup', up); on.classList.remove('orbit'); };
    on.addEventListener('pointermove', mv); on.addEventListener('pointerup', up);
  }
  // «Escudo»: the pointer over the drawing moves it — a mouse just by hovering, a finger by dragging (when the system has
  // a shield that follows it; otherwise dragging turns the camera as always)
  let ptr = null;
  const shieldFollows = () => sys.nodes.some(n => n.type === 'shield' && PP.paramOf(n, 'follow') !== 'fixed');
  function ptrAt(e) {
    const r = PP.canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const o = outNode(), d = o ? Math.max(0.3, PP.valueOf(o, 'dist')) : 1;
    return [(u * 2 - 1) * (r.width / r.height) * d, (1 - v * 2) * d, 1];
  }
  stage.addEventListener('pointermove', e => { ptr = ptrAt(e); });
  stage.addEventListener('pointerleave', () => { ptr = null; });
  stage.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') ptr = null; });
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !outNode()) return;
    if (e.pointerType !== 'mouse' && shieldFollows()) { ptr = ptrAt(e); stage.setPointerCapture(e.pointerId); return; }
    orbitStart(e, stage);
  });
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const o = outNode(); if (!o) return;
    setCam({ dist: Math.round(Math.max(0.3, Math.min(4, PP.valueOf(o, 'dist') * Math.exp(e.deltaY * 0.001))) * 100) / 100 });
  }, { passive: false });
  const setPause = v => { paused = v; $('#btnPause').textContent = paused ? '▶' : '❚❚'; };
  $('#btnPause').addEventListener('click', () => setPause(!paused));
  if (!['1.7778', '0.5625', '0.8', '1', '1.3333'].includes(opts.aspect)) opts.aspect = '1.7778';
  $('#aspect').value = opts.aspect;
  $('#aspect').addEventListener('change', e => setAspect(e.target.value));
  const full = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (viewEl.requestFullscreen) viewEl.requestFullscreen().catch(() => toast('El navegador no permitió pantalla completa', true)); };
  $('#btnFull').addEventListener('click', full);
  stage.addEventListener('dblclick', full);
  // ▣ behind the nodes: Alt + drag on the background turns the camera (a plain drag still moves the nodes)
  graphEl.addEventListener('pointerdown', e => {
    if (!main.classList.contains('backdrop') || !e.altKey || e.button !== 0 || e.target.closest('.nd') || e.target.closest('button')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    orbitStart(e, graphEl);
  }, true);

  /* keys */
  addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 's') { e.preventDefault(); saveToLibrary(); return; }
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod) return;
    if (e.key === 'Escape') { closePop(); $('#help').hidden = true; return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeNode(selected); return; }
    if (e.shiftKey && k === 'a') { e.preventDefault(); const g = graphEl.getBoundingClientRect(); addMenu(g.left + g.width / 2 - 110, g.top + 40); return; }
    if (k === 't') tap();
    else if (k === 'r') sim.reset();
    else if (k === 'e') sim.kick();
    else if (k === 'f') full();
    else if (k === 'b') setBackdrop(!main.classList.contains('backdrop'));
    else if (e.key === ' ') { e.preventDefault(); setPause(!paused); }
  });

  /* help + theme */
  const help = $('#help');
  $('#btnHelp').addEventListener('click', () => { help.hidden = false; paintTheme(); });
  $('#helpClose').addEventListener('click', () => { help.hidden = true; });
  help.addEventListener('click', e => { if (e.target === help) help.hidden = true; });
  function paintTheme() { const t = window.pudrusTheme ? window.pudrusTheme.get() : 'dark'; $('#themeBtn').textContent = t === 'light' ? '◐ Tema oscuro' : '◐ Tema claro'; }
  $('#themeBtn').addEventListener('click', () => { if (window.pudrusTheme) window.pudrusTheme.toggle(); paintTheme(); });
  addEventListener('pudrus:theme', paintTheme);

  /* toast */
  let toastT;
  function toast(m, bad) {
    const t = $('#toast'); t.textContent = m; t.classList.toggle('bad', !!bad); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }
  // another PARTRUS tab saved or deleted: the dot of «Guardar» stays honest
  if (bc) bc.onmessage = e => { if (e.data && e.data.type === 'lib') paintDirty(); };

  main.classList.toggle('backdrop', !!opts.back); paintSizes(); paintRec();
  rebuild(); applyView(); applySim(); paintDirty(); layoutView();
  addEventListener('resize', () => drawWires());
  if (!store.get('partrus_view_v1')) requestAnimationFrame(fitView);
  requestAnimationFrame(loop);

  window.__partrus = { get ptr() { return ptr; }, setCam: v => setCam(v), get sys() { return sys; }, get sim() { return sim; }, addNode, removeNode, connect, saveToLibrary, setSystem, undo, redo, get libId() { return libId; }, get dirty() { return dirty; }, chainList, fitView, setAudio, tap, get bpm() { return bpm; } };
})();
