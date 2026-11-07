/* NODRUS · Hydra → nodes
   Reads Hydra live-coding code (hydra.ojack.xyz) and builds the same picture as a NODRUS patch:
   one node per function, numbers on sliders, () => … and [a, b, c] as «Expresión» nodes.
   The code is PARSED, never run: opening someone else's sketch can't execute anything. */
(function () {
  'use strict';
  const N = window.PudrusNodes;

  // Hydra functions: argument names (= node input keys) in order, and what kind of step they are
  const FN = {
    osc: ['src', 'h_osc', ['freq', 'sync', 'offset']],
    noise: ['src', 'h_noise', ['scale', 'offset']],
    voronoi: ['src', 'h_voronoi', ['scale', 'speed', 'blend']],
    shape: ['src', 'h_shape', ['sides', 'radius', 'smooth']],
    gradient: ['src', 'h_gradient', ['speed']],
    solid: ['src', 'h_solid', ['r', 'g', 'b', 'alpha']],
    src: ['src', 'h_src', []],
    rotate: ['coord', 'h_rotate', ['angle', 'speed']],
    scale: ['coord', 'h_scale', ['amount', 'xm', 'ym', 'ox', 'oy']],
    pixelate: ['coord', 'h_pixelate', ['px', 'py']],
    repeat: ['coord', 'h_repeat', ['rx', 'ry', 'ox', 'oy']],
    repeatX: ['coord', 'h_repeatX', ['reps', 'offset']],
    repeatY: ['coord', 'h_repeatY', ['reps', 'offset']],
    kaleid: ['coord', 'h_kaleid', ['n']],
    scroll: ['coord', 'h_scroll', ['sx', 'sy', 'vx', 'vy']],
    scrollX: ['coord', 'h_scrollX', ['sx', 'speed']],
    scrollY: ['coord', 'h_scrollY', ['sy', 'speed']],
    posterize: ['color', 'h_posterize', ['bins', 'gamma']],
    shift: ['color', 'h_shift', ['r', 'g', 'b']],
    invert: ['color', 'h_invert', ['amount']],
    contrast: ['color', 'h_contrast', ['amount']],
    brightness: ['color', 'h_brightness', ['amount']],
    luma: ['color', 'h_luma', ['th', 'tol']],
    thresh: ['color', 'h_thresh', ['th', 'tol']],
    color: ['color', 'h_color', ['r', 'g', 'b']],
    saturate: ['color', 'h_saturate', ['amount']],
    hue: ['color', 'h_hue', ['amount']],
    colorama: ['color', 'h_colorama', ['amount']],
    r: ['color', 'h_r', ['scale', 'offset']],
    g: ['color', 'h_g', ['scale', 'offset']],
    b: ['color', 'h_b', ['scale', 'offset']],
    add: ['blend', 'h_add', ['amount']],
    sub: ['blend', 'h_sub', ['amount']],
    mult: ['blend', 'h_mult', ['amount']],
    blend: ['blend', 'h_blend', ['amount']],
    diff: ['blend', 'h_diff', []],
    layer: ['blend', 'h_layer', []],
    mask: ['blend', 'h_mask', []],
    modulate: ['mod', 'h_modulate', ['amount']],
    modulateScale: ['mod', 'h_modulateScale', ['mult', 'offset']],
    modulateRotate: ['mod', 'h_modulateRotate', ['mult', 'offset']],
    modulatePixelate: ['mod', 'h_modulatePixelate', ['mult', 'offset']],
    modulateKaleid: ['mod', 'h_modulateKaleid', ['n']],
    modulateScrollX: ['mod', 'h_modulateScrollX', ['sx', 'speed']],
    modulateScrollY: ['mod', 'h_modulateScrollY', ['sy', 'speed']],
    modulateRepeat: ['mod', 'h_modulateRepeat', ['rx', 'ry', 'ox', 'oy']],
    modulateRepeatX: ['mod', 'h_modulateRepeatX', ['reps', 'offset']],
    modulateRepeatY: ['mod', 'h_modulateRepeatY', ['reps', 'offset']],
    modulateHue: ['mod', 'h_modulateHue', ['amount']],
  };
  const IGNORE = new Set(['hush', 'render', 'setResolution', 'setFunction', 'loadScript', 'update', 'await']);

  class HydraError extends Error { constructor(msg, line) { super(msg); this.line = line; } }

  /* ── Tokens ── */
  function tokenize(src) {
    const out = []; let i = 0, line = 1;
    const push = (t, v) => out.push({ t, v, line });
    while (i < src.length) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue; }
      const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i, i + 40));
      if (num) { push('num', parseFloat(num[0])); i += num[0].length; continue; }
      const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80));
      if (id) { push('id', id[0]); i += id[0].length; continue; }
      if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; } push('str', src.slice(i + 1, j)); i = j + 1; continue; }
      const op = ['===', '!==', '=>', '==', '!=', '<=', '>=', '&&', '||', '**'].find(o => src.startsWith(o, i));
      if (op) { push('op', op); i += op.length; continue; }
      if ('()[]{},.;:?+-*/%<>=!'.includes(c)) { push('op', c); i++; continue; }
      throw new HydraError(`No entiendo el carácter «${c}»`, line);
    }
    push('eof', null);
    return out;
  }

  /* ── Parser: a small JavaScript subset (what Hydra sketches use) ── */
  function parse(src) {
    const tk = tokenize(src); let k = 0;
    const peek = (o = 0) => tk[k + o], next = () => tk[k++];
    const is = (v, o = 0) => { const t = peek(o); return t.t === 'op' && t.v === v; };
    const expect = v => { const t = next(); if (!(t.t === 'op' && t.v === v)) throw new HydraError(`Esperaba «${v}» y encontré «${t.v === null ? 'el final' : t.v}»`, t.line); return t; };
    const stmts = [];
    function statement() {
      const t = peek();
      if (t.t === 'id' && ['const', 'let', 'var'].includes(t.v)) {
        next(); const name = next(); if (name.t !== 'id') throw new HydraError('Falta el nombre de la variable', name.line);
        expect('='); const value = expr(); return { k: 'let', name: name.v, value, line: t.line };
      }
      if (t.t === 'id' && is('=', 1) ) { next(); next(); return { k: 'set', name: t.v, value: expr(), line: t.line }; }
      if (t.t === 'id' && peek(1).t === 'op' && peek(1).v === '.' && peek(2).t === 'id' && is('=', 3)) {
        next(); next(); const prop = next(); next(); return { k: 'setp', obj: t.v, name: prop.v, value: expr(), line: t.line };
      }
      return { k: 'expr', value: expr(), line: t.line };
    }
    function expr() { return ternary(); }
    function ternary() {
      const c = binary(0);
      if (is('?')) { next(); const a = expr(); expect(':'); const b = expr(); return { k: 'tern', c, a, b }; }
      return c;
    }
    const PREC = [['||'], ['&&'], ['==', '===', '!=', '!=='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%'], ['**']];
    function binary(level) {
      if (level >= PREC.length) return unary();
      let a = binary(level + 1);
      while (peek().t === 'op' && PREC[level].includes(peek().v)) { const op = next().v; a = { k: 'bin', op, a, b: binary(level + 1) }; }
      return a;
    }
    function unary() {
      if (is('-') || is('+') || is('!')) { const op = next().v; return { k: 'un', op, a: unary() }; }
      return postfix(primary());
    }
    function args() { const list = []; expect('('); while (!is(')')) { list.push(expr()); if (!is(')')) expect(','); } expect(')'); return list; }
    function postfix(e) {
      for (;;) {
        if (is('.')) { next(); const p = next(); if (p.t !== 'id') throw new HydraError('Falta un nombre después del punto', p.line); e = { k: 'mem', obj: e, name: p.v, line: p.line }; }
        else if (is('(')) e = { k: 'call', fn: e, args: args(), line: peek().line };
        else if (is('[')) { next(); const i = expr(); expect(']'); e = { k: 'idx', obj: e, i }; }
        else return e;
      }
    }
    function arrowAhead() {   // ( ... ) =>   or   x =>
      if (peek().t === 'id' && is('=>', 1)) return true;
      if (!is('(')) return false;
      let d = 0, j = k;
      for (; j < tk.length; j++) { const t = tk[j]; if (t.t === 'op' && (t.v === '(' || t.v === '{' || t.v === '[')) d++; else if (t.t === 'op' && (t.v === ')' || t.v === '}' || t.v === ']')) { d--; if (d === 0) break; } }
      return tk[j + 1] && tk[j + 1].t === 'op' && tk[j + 1].v === '=>';
    }
    function arrow() {
      const params = [];
      if (peek().t === 'id') params.push(next().v);
      else {
        expect('(');
        while (!is(')')) {
          if (is('{')) { next(); while (!is('}')) { const t = next(); if (t.t === 'id') params.push(t.v); } next(); }
          else { const t = next(); if (t.t === 'id') params.push(t.v); }
          if (is(',')) next();
        }
        expect(')');
      }
      expect('=>');
      let body;
      if (is('{')) {   // () => { return expr }
        next(); body = null;
        while (!is('}')) { const t = peek(); if (t.t === 'eof') throw new HydraError('Falta «}»', t.line); if (t.t === 'id' && t.v === 'return') { next(); body = expr(); } else next(); if (is(';')) next(); }
        next();
        if (!body) throw new HydraError('La función no devuelve nada (falta return)', peek().line);
      } else body = expr();
      return { k: 'fn', params, body };
    }
    function primary() {
      const t = peek();
      if (arrowAhead()) return arrow();
      if (t.t === 'num') { next(); return { k: 'num', v: t.v }; }
      if (t.t === 'str') { next(); return { k: 'str', v: t.v }; }
      if (t.t === 'id') { next(); return { k: 'id', name: t.v, line: t.line }; }
      if (is('(')) { next(); const e = expr(); expect(')'); return e; }
      if (is('[')) { next(); const items = []; while (!is(']')) { items.push(expr()); if (!is(']')) expect(','); } next(); return { k: 'arr', items }; }
      throw new HydraError(`No esperaba «${t.v === null ? 'el final' : t.v}»`, t.line);
    }
    while (peek().t !== 'eof') {
      if (is(';')) { next(); continue; }
      stmts.push(statement());
    }
    return stmts;
  }

  /* ── Values while evaluating ──
     num · dyn (GLSL float expression) · chain · out (o0–o3) · ext (s0–s3) · arr · obj (Math, a, mouse…) */
  const glNum = v => { if (!Number.isFinite(v)) return '0.0'; const s = String(+v.toPrecision(7)); return /[.e]/.test(s) ? s : s + '.0'; };
  const asGL = v => v.k === 'num' ? glNum(v.v) : v.k === 'dyn' ? v.g : v.k === 'arr' ? arrGL(v) : (() => { throw new HydraError('Ese valor no es un número'); })();
  // Hydra steps arrays at its bpm (30 by default = one change every 2 s); here they follow the NODRUS tempo:
  // one value per bar (4 beats), .fast(n) faster, .offset(x), .smooth() glides
  function arrGL(a) {
    const vals = a.items.map(asGL), n = vals.length;
    if (!n) return '0.0';
    if (n === 1) return vals[0];
    const pos = `(u_beat * 0.25 * ${glNum(a.fast)} + ${glNum(a.offset * n)})`;
    const pick = i => vals.slice(0, -1).reduceRight((acc, v, j) => `(${i} < ${glNum(j + 0.5)} ? ${v} : ${acc})`, vals[n - 1]);
    const i0 = `mod(floor(${pos}), ${glNum(n)})`;
    if (!a.smooth) return pick(i0);
    const i1 = `mod(floor(${pos}) + 1.0, ${glNum(n)})`;
    return `mix(${pick(i0)}, ${pick(i1)}, smoothstep(0.0, 1.0, fract(${pos})))`;
  }
  const MATH1 = { sin: 'sin', cos: 'cos', tan: 'tan', abs: 'abs', floor: 'floor', ceil: 'ceil', sqrt: 'sqrt', exp: 'exp', log: 'log', sign: 'sign', round: 'floor', asin: 'asin', acos: 'acos', atan: 'atan', fract: 'fract' };
  const MATHC = { PI: Math.PI, E: Math.E, TAU: Math.PI * 2 };

  function translate(code) {
    const stmts = parse(code);
    const warn = new Set();
    const env = new Map();          // variables of the sketch
    const outs = {};                // o0..o3 → chain
    let shown = 'o0', usesCam = false, lastOut = null;
    const OUTS = ['o0', 'o1', 'o2', 'o3'], EXTS = ['s0', 's1', 's2', 's3'];

    function ev(e, fnScope) {
      switch (e.k) {
        case 'num': return { k: 'num', v: e.v };
        case 'str': return { k: 'str', v: e.v };
        case 'arr': return { k: 'arr', items: e.items.map(x => ev(x, fnScope)), fast: 1, offset: 0, smooth: false };
        case 'fn': return { k: 'dyn', g: asGL(ev(e.body, new Set(e.params))) };
        case 'tern': { const c = ev(e.c, fnScope), a = ev(e.a, fnScope), b = ev(e.b, fnScope); if (c.k === 'num') return c.v ? a : b; return { k: 'dyn', g: `(${asGL(c)} > 0.5 ? ${asGL(a)} : ${asGL(b)})` }; }
        case 'un': {
          const a = ev(e.a, fnScope);
          if (e.op === '+') return a;
          if (a.k === 'num') return { k: 'num', v: e.op === '-' ? -a.v : (a.v ? 0 : 1) };
          return { k: 'dyn', g: e.op === '-' ? `(-${asGL(a)})` : `(1.0 - step(0.5, ${asGL(a)}))` };
        }
        case 'bin': {
          const a = ev(e.a, fnScope), b = ev(e.b, fnScope);
          if (a.k === 'num' && b.k === 'num') {
            const x = a.v, y = b.v;
            const r = { '+': x + y, '-': x - y, '*': x * y, '/': x / y, '%': x % y, '**': x ** y, '<': +(x < y), '>': +(x > y), '<=': +(x <= y), '>=': +(x >= y), '==': +(x == y), '===': +(x === y), '!=': +(x != y), '!==': +(x !== y), '&&': x && y, '||': x || y }[e.op];
            return { k: 'num', v: r };
          }
          const A = asGL(a), B = asGL(b);
          const g = { '+': `(${A} + ${B})`, '-': `(${A} - ${B})`, '*': `(${A} * ${B})`, '/': `(${A} / ${B})`, '%': `mod(${A}, ${B})`, '**': `pow(${A}, ${B})`,
            '<': `step(${A}, ${B} - 1e-6)`, '>': `step(${B} + 1e-6, ${A})`, '<=': `step(${A}, ${B})`, '>=': `step(${B}, ${A})` }[e.op];
          if (!g) throw new HydraError(`El operador «${e.op}» no se puede animar`);
          return { k: 'dyn', g };
        }
        case 'id': {
          const n = e.name;
          if (fnScope && fnScope.has(n)) return n === 'time' || fnScope.size === 1 ? { k: 'dyn', g: 'u_time' } : { k: 'num', v: 0 };
          if (env.has(n)) return env.get(n);
          if (n === 'time') return { k: 'dyn', g: 'u_time' };
          if (OUTS.includes(n)) return { k: 'out', name: n };
          if (EXTS.includes(n)) return { k: 'ext', name: n };
          if (n === 'Math' || n === 'a' || n === 'mouse' || n === 'window') return { k: 'obj', name: n };
          if (n === 'width') return { k: 'dyn', g: 'u_res.x' };
          if (n === 'height') return { k: 'dyn', g: 'u_res.y' };
          if (n === 'bpm') return { k: 'num', v: 30 };
          if (n === 'speed') return { k: 'num', v: 1 };
          if (FN[n] || IGNORE.has(n)) return { k: 'fnref', name: n };
          throw new HydraError(`No conozco «${n}»`, e.line);
        }
        case 'mem': {
          const o = ev(e.obj, fnScope);
          if (o.k === 'obj' && o.name === 'Math') { if (e.name in MATHC) return { k: 'num', v: MATHC[e.name] }; return { k: 'mathfn', name: e.name }; }
          if (o.k === 'obj' && o.name === 'a' && e.name === 'fft') return { k: 'fft' };
          if (o.k === 'obj' && o.name === 'mouse') { warn.add('mouse: NODRUS no sigue el mouse; usé el centro'); return { k: 'num', v: e.name === 'x' ? 0.5 : 0.5 }; }
          if (o.k === 'obj' && o.name === 'window') return ev({ k: 'id', name: e.name, line: e.line }, fnScope);
          return { k: 'method', obj: o, name: e.name, line: e.line };
        }
        case 'idx': {
          const o = ev(e.obj, fnScope), i = ev(e.i, fnScope);
          if (o.k === 'fft') { const b = i.k === 'num' ? Math.max(0, Math.min(3, Math.floor(i.v))) : 0; return { k: 'dyn', g: ['u_audio.y', 'u_audio.z', 'u_audio.w', 'u_audio.w'][b] }; }
          if (o.k === 'arr' && i.k === 'num') return o.items[Math.floor(i.v)] || { k: 'num', v: 0 };
          throw new HydraError('No puedo leer esa posición');
        }
        case 'call': return call(e, fnScope);
      }
      throw new HydraError('No entiendo esa parte del código');
    }
    function call(e, fnScope) {
      const f = ev(e.fn, fnScope);
      const A = () => e.args.map(x => ev(x, fnScope));
      if (f.k === 'mathfn') {
        const a = A();
        if (a.every(x => x.k === 'num') && typeof Math[f.name] === 'function') return { k: 'num', v: Math[f.name](...a.map(x => x.v)) };
        if (MATH1[f.name]) return { k: 'dyn', g: `${MATH1[f.name]}(${asGL(a[0])})` };
        if (f.name === 'min' || f.name === 'max') return { k: 'dyn', g: a.map(asGL).reduce((x, y) => `${f.name}(${x}, ${y})`) };
        if (f.name === 'pow') return { k: 'dyn', g: `pow(${asGL(a[0])}, ${asGL(a[1])})` };
        if (f.name === 'atan2') return { k: 'dyn', g: `atan(${asGL(a[0])}, ${asGL(a[1])})` };
        if (f.name === 'random') { warn.add('Math.random: usé un valor que cambia con el pulso'); return { k: 'dyn', g: 'hash21(vec2(floor(u_beat), 7.13))' }; }
        throw new HydraError(`Math.${f.name} no se puede animar`, e.line);
      }
      if (f.k === 'fnref') {
        if (IGNORE.has(f.name)) { if (f.name === 'render') { const a = A(); if (a[0] && a[0].k === 'out') shown = a[0].name; else warn.add('render() muestra las 4 salidas a la vez: acá se ve sólo o0'); } return { k: 'none' }; }
        const def = FN[f.name];
        if (def[0] !== 'src') throw new HydraError(`«${f.name}» va después de una fuente, por ejemplo osc().${f.name}()`, e.line);
        return { k: 'chain', items: [{ fn: f.name, args: A(), line: e.line }] };
      }
      if (f.k === 'method') {
        const o = f.obj, name = f.name;
        if (o.k === 'chain') {
          if (name === 'out') { const a = A(); const target = a[0] && a[0].k === 'out' ? a[0].name : 'o0'; outs[target] = o; lastOut = target; return { k: 'none' }; }
          const def = FN[name];
          if (!def) throw new HydraError(`No conozco la función «.${name}()»`, f.line);
          if (def[0] === 'src') throw new HydraError(`«${name}» es una fuente: va al principio, no como .${name}()`, f.line);
          return { k: 'chain', items: [...o.items, { fn: name, args: A(), line: e.line }] };
        }
        if (o.k === 'arr') {
          const a = A(), x = a[0] && a[0].k === 'num' ? a[0].v : undefined;
          if (name === 'fast') return { ...o, fast: x === undefined ? 1 : x };
          if (name === 'offset') return { ...o, offset: x || 0 };
          if (name === 'smooth') return { ...o, smooth: x === undefined ? true : !!x };
          if (name === 'ease') return { ...o, smooth: true };
          if (name === 'fit') { const lo = a[0] ? a[0].v : 0, hi = a[1] ? a[1].v : 1; const ns = o.items.filter(v => v.k === 'num').map(v => v.v); const mn = Math.min(...ns), mx = Math.max(...ns); return { ...o, items: o.items.map(v => v.k === 'num' ? { k: 'num', v: lo + (v.v - mn) / ((mx - mn) || 1) * (hi - lo) } : v) }; }
          throw new HydraError(`Las listas no tienen .${name}()`, f.line);
        }
        if (o.k === 'ext') {
          if (name === 'initCam') { usesCam = true; return { k: 'none' }; }
          if (name.startsWith('init')) { warn.add(`${o.name}.${name}(): sólo la cámara funciona como fuente externa`); return { k: 'none' }; }
        }
        if (o.k === 'obj' && o.name === 'a') return { k: 'none' };   // a.show(), a.setBins()…
        if (o.k === 'out') return { k: 'none' };
        throw new HydraError(`No entiendo .${name}()`, f.line);
      }
      if (f.k === 'none') return f;
      throw new HydraError('Eso no se puede llamar como función', e.line);
    }
    for (const s of stmts) {
      try {
        if (s.k === 'let') env.set(s.name, ev(s.value));
        else if (s.k === 'set') {
          const v = ev(s.value);
          if (s.name === 'speed') { if (!(v.k === 'num' && v.v === 1)) warn.add('speed = …: el tiempo global no se cambia; usá el tempo de NODRUS'); }
          else if (s.name === 'bpm') warn.add('bpm = …: las listas siguen el tempo de NODRUS (T para marcarlo)');
          else env.set(s.name, v);
        } else if (s.k === 'setp') warn.add(`${s.obj}.${s.name} = … se ignora`);
        else ev(s.value);
      } catch (err) { if (err instanceof HydraError && !err.line) err.line = s.line; throw err; }
    }
    const chain = outs[shown] || (lastOut && outs[lastOut]);
    if (!chain) throw new HydraError('No hay ninguna salida: terminá la cadena con .out()');
    if (!outs[shown] && lastOut) shown = lastOut;
    return { graph: build(chain, shown), warnings: [...warn] };

    /* ── Chains → nodes ── */
    function build(top, shownOut) {
      const nodes = [], links = [];
      let nextId = 1;
      const add = (type, vals) => { const d = N.defaultsFor(type); const n = { id: nextId++, type, x: 0, y: 0, v: { ...d.v }, p: { ...d.p } }; nodes.push(n); return n; };
      const link = (from, to, key) => { if (from) links.push({ a: from[0], ao: from[1], b: to.id, bi: key }); };
      const exprCache = new Map();
      function setArgs(n, keys, args) {
        keys.forEach((k, i) => {
          const a = args[i];
          if (!a || a.k === 'none') return;
          if (a.k === 'num') { n.v[k] = a.v; return; }
          if (a.k === 'dyn' || a.k === 'arr') {
            const g = asGL(a);
            let e = exprCache.get(g);
            if (!e) { e = add('expr'); e.p.expr = g; exprCache.set(g, e); }
            link([e.id, 'v'], n, k); return;
          }
          if (a.k === 'str') return;
          throw new HydraError(`El valor ${i + 1} de «${n.type.slice(2)}» tiene que ser un número`);
        });
      }
      const building = new Set();
      // the picture of a texture argument (another chain, an output, the camera)
      function texture(v, uv, line) {
        if (!v || v.k === 'none') { const s = add('h_solid'); link(uv, s, 'uv'); return { c: [s.id, 'c'], a: [s.id, 'a'] }; }
        if (v.k === 'num') { const s = add('h_solid'); s.v.r = s.v.g = s.v.b = v.v; link(uv, s, 'uv'); return { c: [s.id, 'c'], a: [s.id, 'a'] }; }
        if (v.k === 'chain') return chainAt(v, v.items.length - 1, uv);
        if (v.k === 'out') {
          if (v.name === shownOut || building.has(v.name) || !outs[v.name]) {   // the frame before = feedback
            if (v.name !== shownOut && !outs[v.name]) warn.add(`${v.name} está vacía`);
            const s = add('h_src'); link(uv, s, 'uv'); return { c: [s.id, 'c'], a: [s.id, 'a'] };
          }
          building.add(v.name); const r = chainAt(outs[v.name], outs[v.name].items.length - 1, uv); building.delete(v.name); return r;
        }
        if (v.k === 'ext') {
          if (!usesCam) warn.add(`${v.name}: falta ${v.name}.initCam(); usé la cámara igual`);
          const c = add('camera'); c.v.size = 1; c.p.mirror = 'no';
          if (uv) link(uv, c, 'uv');
          return { c: [c.id, 'c'], a: [c.id, 'a'] };
        }
        throw new HydraError('Eso no es una imagen (esperaba una cadena como osc() o una salida como o0)', line);
      }
      // evaluate step k of a chain, seen from coordinates uv (Hydra applies coordinate steps in reverse)
      function chainAt(ch, k, uv) {
        const it = ch.items[k], [kind, type, keys] = FN[it.fn];
        if (kind === 'src') {
          if (it.fn === 'src') return texture(it.args[0] || { k: 'out', name: shownOut }, uv, it.line);
          const n = add(type); link(uv, n, 'uv'); setArgs(n, keys, it.args); return { c: [n.id, 'c'], a: [n.id, 'a'] };
        }
        if (kind === 'coord') { const n = add(type); link(uv, n, 'uv'); setArgs(n, keys, it.args); return chainAt(ch, k - 1, [n.id, 'uv']); }
        if (kind === 'color') { const prev = chainAt(ch, k - 1, uv); const n = add(type); link(prev.c, n, 'c'); link(prev.a, n, 'a'); setArgs(n, keys, it.args); return { c: [n.id, 'c'], a: [n.id, 'a'] }; }
        if (kind === 'blend') {
          const prev = chainAt(ch, k - 1, uv), other = texture(it.args[0], uv, it.line);
          const n = add(type); link(prev.c, n, 'c'); link(prev.a, n, 'a'); link(other.c, n, 'c2'); link(other.a, n, 'a2'); setArgs(n, keys, it.args.slice(1));
          return { c: [n.id, 'c'], a: [n.id, 'a'] };
        }
        // modulate: the other picture bends the coordinates of everything before it
        const other = texture(it.args[0], uv, it.line);
        const n = add(type); link(uv, n, 'uv'); link(other.c, n, 'm'); setArgs(n, keys, it.args.slice(1));
        return chainAt(ch, k - 1, [n.id, 'uv']);
      }
      building.add(shownOut);
      const res = chainAt(top, top.items.length - 1, null);
      const out = add('output');
      out.v.vignette = 0; out.v.grain = 0;   // Hydra has no post effects
      link(res.c, out, 'c');
      layout(nodes, links);
      return { nodes, links };
    }
  }

  // columns by distance to the Output node, rows stacked by node height
  function layout(nodes, links) {
    const depth = new Map(), out = nodes.find(n => n.type === 'output');
    const visit = (id, d) => { if ((depth.get(id) ?? -1) >= d) return; depth.set(id, d); links.filter(l => l.b === id).forEach(l => visit(l.a, d + 1)); };
    if (out) visit(out.id, 0);
    const maxD = Math.max(0, ...depth.values()), colY = [];
    const h = n => 40 + (N.inputsOf(n).length + (N.NODES[n.type].outputs || []).length) * 21;
    [...nodes].sort((a, b) => a.id - b.id).forEach(n => {
      const c = maxD - (depth.get(n.id) ?? maxD);
      n.x = 40 + c * 230; n.y = colY[c] || 40; colY[c] = n.y + h(n) + 24;
    });
  }

  // a few sketches to start from (written for NODRUS, in Hydra's language)
  const EXAMPLES = {
    'Rayas que respiran': `osc(20, 0.08, 1.2)\n  .kaleid(5)\n  .rotate(0, 0.1)\n  .modulate(noise(3, 0.2), 0.15)\n  .out()`,
    'Celdas líquidas': `voronoi(6, 0.4, 0.5)\n  .color(0.9, 0.3, 1)\n  .modulateScale(osc(4, 0.1), 0.5)\n  .add(osc(40, 0.05).thresh(0.6).color(0, 1, 1), 0.3)\n  .out()`,
    'Túnel de feedback': `src(o0)\n  .scale(1.01)\n  .rotate(0.01)\n  .blend(shape(4, 0.2, 0.01).color(1, 0.4, 0.8), 0.15)\n  .out()`,
    'Pulso de graves': `shape(() => 3 + a.fft[0] * 6, 0.35, 0.02)\n  .repeat(3, 3)\n  .modulateRotate(osc(6, 0.1), [0.5, 1, 2].smooth())\n  .mult(osc(10, 0.1, 2))\n  .out()`,
    'Pixeles en capas': `noise(4, 0.1)\n  .posterize(4, 0.6)\n  .pixelate(60, 40)\n  .diff(osc(30, 0.1, 2).rotate(0.6))\n  .out()`,
  };

  window.PudrusHydra = { translate, parse, EXAMPLES, HydraError };
})();
