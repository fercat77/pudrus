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
    pattern: { scale: [5, 14], width: [0.25, 0.6], amount: [0.2, 1.2], speed: [-0.35, 0.35], seed: [0, 100] },
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
    scene3d: { size: [0.5, 1.2], twist: [-0.8, 0.8], speed: [0.15, 0.9], spacing: [2, 5] },
  };
  // the values worth playing live, per node (first ones are the best)
  const PLAYABLE = {
    pattern: ['scale', 'width', 'amount'], noise: ['scale', 'speed'], voronoi: ['scale', 'speed'], stripes: ['freq', 'speed'], checker: ['scale'], waves: ['freq', 'speed'],
    shape: ['size', 'width'], gradient: ['angle'], transform: ['scale', 'spin'], kaleido: ['segments', 'rotate'], tile: ['count'],
    warp: ['amount'], pixelate: ['size'], swirl: ['amount'], palette: ['shift', 'speed'], adjust: ['hue', 'contrast'],
    posterize: ['levels'], mix: ['f'], feedback: ['amount', 'zoom', 'rotate'], glitch: ['amount'],
    image: ['size', 'opacity'], text: ['size', 'opacity'], camera: ['size', 'opacity'], video: ['size', 'opacity'],
    over: ['opacity'], threshold: ['edge'], lfo: ['speed'],
  };
  // which nodes matter most when picking controls (the pattern first, then motion, then color)
  const IMPORTANCE = ['pattern', 'noise', 'voronoi', 'stripes', 'waves', 'shape', 'checker', 'gradient', 'image', 'text', 'camera', 'video',
    'kaleido', 'warp', 'swirl', 'glitch', 'transform', 'tile', 'pixelate', 'palette', 'mix', 'over', 'adjust', 'posterize', 'threshold', 'lfo', 'feedback'];
  Object.assign(RANGES, {
    glitch: { amount: [0, 0.8], rate: [2, 16] },
    image: { size: [0.1, 1], opacity: [0, 1] }, text: { size: [0.05, 0.6], opacity: [0, 1] },
    camera: { size: [0.5, 2], opacity: [0, 1] }, video: { size: [0.5, 2], opacity: [0, 1] },
    over: { opacity: [0, 1] }, threshold: { edge: [0.2, 0.8] },
  });
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

  // ── colors that work for graphic patterns ──
  const DUO = [['#000000', '#ffffff'], ['#f2ece0', '#111111'], ['#0b1a3a', '#f5f0e6'], ['#111111', '#ff3fbf'], ['#1a2bd6', '#ff4fd8'],
    ['#ffffff', '#1b1b1b'], ['#e8e2d0', '#d6402e'], ['#0d0d0d', '#66ff33'], ['#14213d', '#fca311'], ['#f4f1de', '#3d405b'],
    ['#000000', '#00e5ff'], ['#2b2b2b', '#e9e4d8'], ['#ffe14d', '#111111'], ['#ff5a36', '#fff4e0'], ['#0f3d2e', '#f2d7b6']];
  const LIGHT_BG = ['#f4efe4', '#fbf7ef', '#f2ece0', '#ffffff', '#efe6d6'], DARK_BG = ['#0b0b0f', '#101018', '#14141c'];
  // per drawing: densities that read well
  const KIND_SCALE = { wavy: [5, 14], zigzag: [5, 12], op: [10, 26], rings: [5, 14], squares: [4, 10], contour: [5, 12], blobs: [3, 10],
    truchet: [5, 12], maze: [6, 16], weave: [4, 9], cubes: [3, 7], dots: [6, 16], grid: [5, 12], cracks: [4, 10] };
  const KINDS = Object.keys(KIND_SCALE);
  const STYLES = [['grafico', 4], ['pop', 3], ['opart', 2], ['capas', 1.5], ['psico', 2]];
  const STYLE_NAME = { grafico: 'gráfico', pop: 'pop', opart: 'op-art', capas: 'capas / moiré', psico: 'psicodélico' };
  const weighted = list => { let r = rnd() * list.reduce((a, x) => a + x[1], 0); for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; } return list[0][0]; };
  const r3 = x => Math.round(x * 1000) / 1000;

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
    // a «Patrón» node with a drawing and values that suit it
    const pattern = (kind, lane = 0) => {
      const n = add('pattern', lane); n.p.kind = kind || pick(KINDS);
      const sc = KIND_SCALE[n.p.kind]; n.v.scale = r3(between(sc[0], sc[1]));
      n.v.speed = r3(chance(0.25) ? 0 : between(-0.3, 0.3));
      if (['cubes', 'weave'].includes(n.p.kind)) n.v.speed = r3(between(-0.15, 0.15));
      if (n.p.kind === 'dots') n.v.width = r3(between(0.3, 0.8));
      if (n.p.kind === 'blobs') n.v.width = r3(between(0.45, 0.85));
      if (['truchet', 'maze', 'grid'].includes(n.p.kind)) n.v.width = r3(between(0.15, 0.45));
      return n;
    };
    // straight or slightly turned, sometimes mirrored / warped (graphic styles stay clean)
    const cleanCoords = (warpChance = 0.25) => {
      let uv = null;
      const chain = t => { const n = add(t); if (uv) link(uv, 'uv', n, 'uv'); uv = n; return n; };
      if (chance(0.45)) { const t = chain('transform'); t.v.scale = 1; t.v.spin = r3(chance(0.6) ? 0 : between(-6, 6)); t.v.rotate = pick([0, 0, 45, -45, 90, 30, -30, r3(between(-180, 180))]); }
      if (chance(warpChance)) { const w = chain('warp'); w.v.amount = r3(between(0.03, 0.18)); w.v.speed = r3(between(0.05, 0.3)); }
      if (chance(0.15)) chain(pick(['mirror', 'kaleido']));
      return uv;
    };
    const tail = { fb: 0.1, post: 'clean' };
    let color;
    const style = opts.style || weighted(STYLES);

    if (style === 'grafico') {
      // one pattern in two colors (black & white, cream & ink, duotones)
      const uv = cleanCoords();
      const g = pattern();
      if (uv) link(uv, 'uv', g, 'uv');
      const [a, b] = pick(DUO).slice().sort(() => (chance(0.5) ? 1 : -1));
      color = add('ramp'); color.v.a = a; color.v.b = b;
      link(g, 'v', color, 'v');
    } else if (style === 'pop') {
      // flat colors per band / cell on a light (or dark) background
      const uv = cleanCoords(0.2);
      const g = pattern(pick(['wavy', 'wavy', 'zigzag', 'blobs', 'blobs', 'contour', 'truchet', 'dots', 'rings', 'cubes', 'weave', 'maze', 'squares']));
      if (['wavy', 'zigzag', 'rings', 'squares', 'truchet', 'maze', 'weave'].includes(g.p.kind)) g.v.width = r3(between(0.4, 0.7));
      if (uv) link(uv, 'uv', g, 'uv');
      const pal = add('palette'); pal.p.pal = pick(['pastel', 'pastel', 'retro', 'rainbow', 'vapor', 'neon']); pal.v.speed = r3(chance(0.6) ? 0 : between(-0.05, 0.05));
      link(g, 'id', pal, 'v');
      if (g.p.kind === 'cubes') { const m = add('mix'); m.p.mode = 'multiply'; m.v.f = 1; link(pal, 'c', m, 'a'); const sh = add('ramp'); sh.v.a = '#000000'; sh.v.b = '#ffffff'; link(g, 'v', sh, 'v'); link(sh, 'c', m, 'b'); color = m; }
      else {
        const o = add('over'); o.p.mode = 'normal'; o.v.base = pick(chance(0.75) ? LIGHT_BG : DARK_BG); o.v.opacity = 1;
        link(pal, 'c', o, 'top'); link(g, 'v', o, 'a'); color = o;
      }
      if (chance(0.3)) { const q = add('posterize'); q.v.levels = Math.round(between(4, 8)); link(color, 'c', q, 'c'); color = q; }
    } else if (style === 'opart') {
      // black & white stripes bent by the coordinates: optical illusions
      let uv = null;
      const chain = t => { const n = add(t); if (uv) link(uv, 'uv', n, 'uv'); uv = n; return n; };
      const bend = pick(['swirl', 'warp', 'polar', 'none', 'none']);
      if (bend === 'swirl') { const w = chain('swirl'); w.v.amount = r3(between(-5, 5)); w.v.radius = r3(between(0.5, 1.4)); }
      if (bend === 'warp') { const w = chain('warp'); w.v.amount = r3(between(0.1, 0.4)); w.v.scale = r3(between(0.8, 2.5)); }
      if (bend === 'polar') chain('polar');
      let g;
      if (chance(0.4)) { g = add('stripes'); g.v.sharp = 1; g.v.freq = r3(between(8, 30)); g.v.speed = r3(between(-0.6, 0.6)); g.v.angle = pick([0, 90, 45]); }
      else { g = pattern(pick(['op', 'op', 'wavy', 'rings', 'squares', 'zigzag'])); g.v.width = 0.5; g.v.amount = r3(between(0.6, 1.8)); }
      if (uv) link(uv, 'uv', g, 'uv');
      const [a, b] = chance(0.65) ? ['#000000', '#ffffff'] : pick(DUO);
      color = add('ramp'); color.v.a = a; color.v.b = b; link(g, 'v', color, 'v');
    } else if (style === 'capas') {
      // two patterns crossed: moiré and weaves
      const uv = cleanCoords(0.15);
      const k1 = pick(KINDS), g1 = pattern(k1);
      if (uv) link(uv, 'uv', g1, 'uv');
      const t2 = add('transform', 1); t2.v.scale = r3(between(0.9, 1.15)); t2.v.rotate = r3(pick([between(2, 12), 90, 45, between(-12, -2)])); t2.v.spin = r3(chance(0.5) ? between(-3, 3) : 0);
      if (uv) link(uv, 'uv', t2, 'uv');
      const g2 = pattern(chance(0.5) ? k1 : pick(KINDS), 1); g2.v.scale = g1.v.scale;
      link(t2, 'uv', g2, 'uv');
      const m = add('math'); m.p.op = pick(['abs', 'max', 'min', 'mul']);
      if (m.p.op === 'abs') { const d = add('math', 1); d.p.op = 'sub'; link(g1, 'v', d, 'a'); link(g2, 'v', d, 'b'); link(d, 'v', m, 'a'); }
      else { link(g1, 'v', m, 'a'); link(g2, 'v', m, 'b'); }
      const [a, b] = pick(DUO);
      color = add('ramp'); color.v.a = a; color.v.b = b; link(m, 'v', color, 'v');
    } else {
      // psicodélico: the original recipe (palettes, feedback trails, layers)
      tail.fb = 0; tail.post = 'any';
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

      // feedback trails
      if (chance(0.55)) { const f = add('feedback'); f.p.blend = pick(['max', 'max', 'add', 'mix']); link(color, 'c', f, 'c'); color = f; }

    }

    // graphic styles: rarely trails, quiet output (a little grain / vignette)
    if (tail.fb && chance(tail.fb)) { const f = add('feedback'); f.p.blend = 'mix'; f.v.amount = r3(between(0.7, 0.88)); f.v.zoom = r3(between(0.995, 1.015)); f.v.rotate = r3(between(-1, 1)); link(color, 'c', f, 'c'); color = f; }

    // output
    const out = add('output');
    link(color, 'c', out, 'c');
    if (tail.post === 'clean') { out.v.rgb = chance(0.15) ? r3(between(0.05, 0.2)) : 0; out.v.scan = 0; out.v.vignette = r3(between(0, 0.25)); out.v.grain = r3(between(0, 0.04)); }

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

    // live controls ready for the phone / MIDI
    return { nodes, links, ctl: suggest({ nodes, links }), style: STYLE_NAME[style] };
  }

  /* Pick the controls worth playing live for any patch:
     feedback zoom × turn as an XY pad, the main value of each important node (with good ranges),
     then second values, and a "long trail" hit button when there is room. Max 6. */
  function suggest(graph, max = 6) {
    const r3 = x => Math.round(x * 1000) / 1000;
    const ins = n => (N.inputsOf ? N.inputsOf(n) : def(n.type).inputs || []);
    const isFree = (n, k) => ins(n).some(i => i.k === k && i.t === 'float') && !graph.links.some(l => l.b === n.id && l.bi === k);
    const playable = n => (n.type === 'glsl' ? ins(n).filter(i => i.t === 'float' && i.k.startsWith('g_')).map(i => i.k) : PLAYABLE[n.type] || []);
    const range = (t, k) => { const r = (RANGES[t] || {})[k]; return r && r[0] !== r[1] ? { lo: r3(r[0]), hi: r3(r[1]) } : {}; };
    const out = [], used = new Set();
    const add = (n, k) => {
      const key = n.id + '.' + k;
      if (out.length >= max || used.has(key) || !isFree(n, k)) return false;
      used.add(key); out.push({ id: n.id, k, t: n.type, ...range(n.type, k) });
      return true;
    };
    const fb = graph.nodes.find(n => n.type === 'feedback');
    if (fb && isFree(fb, 'zoom') && isFree(fb, 'rotate')) {
      const a = range('feedback', 'zoom'), b = range('feedback', 'rotate');
      used.add(fb.id + '.zoom'); used.add(fb.id + '.rotate');
      out.push({ kind: 'xy', name: 'Feedback: zoom × giro', id: fb.id, k: 'zoom', t: 'feedback', lo: a.lo, hi: a.hi, id2: fb.id, k2: 'rotate', t2: 'feedback', lo2: b.lo, hi2: b.hi });
    }
    const ordered = ['glsl', ...IMPORTANCE].flatMap(t => graph.nodes.filter(n => n.type === t));
    for (const n of ordered) for (const k of playable(n)) if (add(n, k)) break;          // main value of each
    if (fb && out.length < max && isFree(fb, 'amount') && !used.has(fb.id + '.amount')) {
      used.add(fb.id + '.amount');
      out.push({ kind: 'button', name: 'Estela larga', id: fb.id, k: 'amount', t: 'feedback', to: 0.985 });
    }
    for (const n of ordered) playable(n).slice(1).forEach(k => add(n, k));            // then second values
    return out;
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

  window.PudrusGenerate = { generate, vary, suggest, RANGES, STYLES: STYLES.map(x => x[0]), STYLE_NAME };
})();
