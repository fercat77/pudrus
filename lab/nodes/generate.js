/* PUDRUS Lab · Nodos — random patches that make sense.
   generate(opts) -> graph   ·   vary(graph) -> nudges the values of a patch */
(function () {
  const N = window.PudrusNodes;
  const rnd = Math.random;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const chance = p => rnd() < p;
  const between = (a, b) => a + rnd() * (b - a);

  // ranges that look good (a subset of each input's full range)
  const RANGES = {
    noise: { scale: [1.5, 6], speed: [0.05, 0.4], detail: [3, 6] },
    voronoi: { scale: [3, 12], speed: [0.1, 0.6] },
    gradient: { angle: [-180, 180] },
    shape: { size: [0.15, 0.55], soft: [0.005, 0.08], width: [0.01, 0.08] },
    stripes: { freq: [2, 14], angle: [-90, 90], sharp: [0.2, 0.9], speed: [-1.2, 1.2] },
    checker: { scale: [3, 14] },
    waves: { freq: [4, 22], speed: [-3, 3] },
    transform: { x: [0, 0], y: [0, 0], scale: [0.6, 1.8], rotate: [-180, 180], spin: [-25, 25] },
    kaleido: { segments: [3, 12], rotate: [0, 360] },
    tile: { count: [2, 6] },
    warp: { amount: [0.05, 0.45], scale: [1, 5], speed: [0.1, 0.6] },
    pixelate: { size: [0.006, 0.035] },
    swirl: { amount: [-6, 6], radius: [0.3, 1.2] },
    palette: { v: [0.5, 0.5], shift: [-1, 1], speed: [-0.12, 0.12] },
    adjust: { bright: [-0.08, 0.08], contrast: [0.95, 1.5], sat: [0.9, 1.6], hue: [-0.3, 0.3] },
    posterize: { levels: [3, 8] },
    mix: { f: [0.35, 0.65] },
    feedback: { amount: [0.8, 0.94], zoom: [0.985, 1.05], rotate: [-4, 4], drift: [-0.008, 0.008] },
    output: { rgb: [0, 0.3], scan: [0, 0.25], vignette: [0.2, 0.55], grain: [0, 0.07] },
    lfo: { speed: [0.05, 0.4] },
  };
  // the values worth playing live, per node (first ones are the best)
  const PLAYABLE = {
    noise: ['scale', 'speed'], voronoi: ['scale', 'speed'], stripes: ['freq', 'speed'], checker: ['scale'], waves: ['freq', 'speed'],
    shape: ['size', 'width'], gradient: ['angle'], transform: ['scale', 'spin'], kaleido: ['segments', 'rotate'], tile: ['count'],
    warp: ['amount'], pixelate: ['size'], swirl: ['amount'], palette: ['shift', 'speed'], adjust: ['hue', 'contrast'],
    posterize: ['levels'], mix: ['f'], feedback: ['amount', 'zoom', 'rotate'],
  };
  const GENERATORS = ['noise', 'voronoi', 'stripes', 'waves', 'shape', 'checker', 'gradient'];
  const COORDS = ['kaleido', 'polar', 'warp', 'swirl', 'tile', 'mirror', 'transform', 'pixelate'];

  const def = t => N.NODES[t];
  const inputSpec = (t, k) => (def(t).inputs || []).find(i => i.k === k);
  function valueFor(t, k) {
    const inp = inputSpec(t, k) || (def(t).post || []).find(i => i.k === k);
    const r = (RANGES[t] || {})[k];
    let v = r ? between(r[0], r[1]) : inp.v;
    if (inp.step) v = Math.round(v / inp.step) * inp.step;
    return Math.round(v * 1000) / 1000;
  }
  function randomColor(light) {
    const h = rnd(), s = between(0.6, 1), l = light ? between(0.5, 0.7) : between(0.02, 0.12);
    const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  function generate(opts = {}) {
    const nodes = [], links = [];
    let id = 1, col = 0;
    const add = (type, lane = 0) => {
      const d = N.defaultsFor(type), v = {}, p = {};
      for (const inp of def(type).inputs || []) if (inp.t === 'float') v[inp.k] = valueFor(type, inp.k); else if (inp.v !== undefined) v[inp.k] = inp.v;
      for (const inp of def(type).post || []) v[inp.k] = valueFor(type, inp.k);
      for (const pr of def(type).params || []) p[pr.k] = pr.options ? pick(pr.options)[0] : pr.v;
      const n = { id: id++, type, x: 40 + (lane ? col - 1 : col) * 250, y: 40 + lane * 380, v: { ...d.v, ...v }, p: { ...d.p, ...p } };
      if (!lane) col++;
      nodes.push(n);
      return n;
    };
    const link = (a, ao, b, bi) => links.push({ a: a.id, ao, b: b.id, bi });

    // 1) coordinates: 0–3 different effects, pixelate always last
    let uv = null;
    const coords = COORDS.slice().sort(() => rnd() - 0.5).slice(0, Math.floor(rnd() * 4));
    coords.sort((a, b) => (a === 'pixelate') - (b === 'pixelate'));
    for (const t of coords) { const n = add(t); if (uv) link(uv, 'uv', n, 'uv'); uv = n; }

    // 2) a pattern
    const g = add(pick(GENERATORS));
    if (g.type === 'feedback') g.p.blend = 'max';
    if (uv) link(uv, 'uv', g, 'uv');
    const gOut = pick(def(g.type).outputs.filter(o => o[1] === 'float'))[0];

    // 3) into color
    let color;
    if (chance(0.72)) { color = add('palette'); link(g, gOut, color, 'v'); }
    else { color = add('ramp'); color.v.a = randomColor(false); color.v.b = randomColor(true); link(g, gOut, color, 'v'); }

    // 4) sometimes a second layer mixed on top
    if (chance(0.3)) {
      const g2 = add(pick(GENERATORS.filter(t => t !== g.type)), 1);
      if (uv && chance(0.5)) link(uv, 'uv', g2, 'uv');
      const c2 = add('palette', 1);
      link(g2, def(g2.type).outputs[0][0], c2, 'v');
      const m = add('mix');
      m.p.mode = pick(['add', 'screen', 'difference', 'multiply']);
      link(color, 'c', m, 'a'); link(c2, 'c', m, 'b');
      color = m;
    }
    // 5) color effects
    if (chance(0.45)) { const a = add('adjust'); link(color, 'c', a, 'c'); color = a; }
    if (chance(0.2)) { const q = add('posterize'); link(color, 'c', q, 'c'); color = q; }
    if (chance(0.08)) { const iv = add('invert'); link(color, 'c', iv, 'c'); color = iv; }

    // 6) feedback trails
    if (chance(0.55)) { const f = add('feedback'); f.p.blend = pick(['max', 'max', 'add', 'mix']); link(color, 'c', f, 'c'); color = f; }

    // 7) output
    const out = add('output');
    link(color, 'c', out, 'c');

    // modulation: an LFO (and the audio when it is on) moves something
    const free = (n, k) => !links.some(l => l.b === n.id && l.bi === k);
    const candidates = nodes.flatMap(n => (PLAYABLE[n.type] || []).filter(k => free(n, k)).map(k => [n, k]));
    if (chance(0.5) && candidates.length) {
      const [n, k] = pick(candidates);
      const inp = inputSpec(n.type, k), r = (RANGES[n.type] || {})[k] || [inp.min, inp.max];
      const l = add('lfo', 1);
      l.v = { speed: valueFor('lfo', 'speed'), min: Math.round(r[0] * 1000) / 1000, max: Math.round(r[1] * 1000) / 1000 };
      l.p = { shape: pick(['sine', 'sine', 'tri', 'saw']), sync: opts.bpm ? pick(['4', '8', '16']) : 'free' };
      link(l, 'v', n, k);
    }
    if (opts.audio) {
      out.p.react = pick(['bass', 'level']);
      const rest = candidates.filter(([n, k]) => free(n, k));
      if (rest.length) {
        const [n, k] = pick(rest);
        const inp = inputSpec(n.type, k), r = (RANGES[n.type] || {})[k] || [inp.min, inp.max];
        const a = add('audio', 1), rg = add('range', 1);
        rg.v = { v: 0, min: Math.round(r[0] * 1000) / 1000, max: Math.round(r[1] * 1000) / 1000 };
        link(a, pick(['bass', 'level']), rg, 'v'); link(rg, 'v', n, k);
      }
    } else out.p.react = 'none';

    // live controls ready for the phone / MIDI: up to 4 interesting free values
    const ctl = [];
    const pool = nodes.flatMap(n => (PLAYABLE[n.type] || []).slice(0, 1).filter(k => free(n, k)).map(k => ({ id: n.id, k, t: n.type })));
    pool.sort(() => rnd() - 0.5).slice(0, 4).forEach(c => {
      const r = (RANGES[c.t] || {})[c.k];
      if (r && r[0] !== r[1]) { c.lo = Math.round(r[0] * 1000) / 1000; c.hi = Math.round(r[1] * 1000) / 1000; }
      ctl.push(c);
    });
    return { nodes, links, ctl };
  }

  // nudge every free value a little (±15% of its good range)
  function vary(graph, amount = 0.15) {
    for (const n of graph.nodes) {
      for (const inp of def(n.type).inputs || []) {
        if (inp.t !== 'float' || graph.links.some(l => l.b === n.id && l.bi === inp.k)) continue;
        if (['x', 'y'].includes(inp.k) && n.type === 'transform') continue;
        const r = (RANGES[n.type] || {})[inp.k] || [inp.min, inp.max];
        const cur = n.v && n.v[inp.k] !== undefined ? n.v[inp.k] : inp.v;
        let v = cur + (rnd() * 2 - 1) * amount * ((r[1] - r[0]) || (inp.max - inp.min) * 0.1);
        v = Math.min(inp.max, Math.max(inp.min, v));
        if (inp.step) v = Math.round(v / inp.step) * inp.step;
        n.v = { ...(n.v || {}), [inp.k]: Math.round(v * 1000) / 1000 };
      }
    }
    return graph;
  }

  window.PudrusGenerate = { generate, vary };
})();
