/* PARTRUS · the WebGPU engine. The same particle systems as particles.js (the same node graphs, knobs, NODRUS
   macros, «Explotar», triggers…), simulated with a compute shader over a storage buffer and drawn as instanced
   quads: on the RTX-class machines it measured faster, and it is not capped at a million particles.
   particles.js picks it by itself when the browser has WebGPU and the system only uses what is translated here
   (otherwise the WebGL2 engine runs it, as before). The picture ends on one shared WebGPU canvas, which WebGL2
   (NODRUS, the output window, Spout) and 2D canvases copy as they did the WebGL one. */
(function () {
  'use strict';
  const PP = window.PudrusParticles; if (!PP) return;
  const { DEFS, sane, valueOf, paramOf, isEmitter } = PP;
  const SUPPORTED = new Set(['emit', 'geo', 'form', 'gravity', 'turb', 'attract', 'vortex', 'wave', 'explode', 'strange', 'home', 'drag', 'bounds', 'shield', 'fluid', 'cam', 'look', 'studio', 'sym', 'out', 'lfo', 'audio', 'pulse']);
  const MAX_SLOTS = 120;
  const fl = x => { const s = String(+x); return /[.e]/.test(s) ? s : s + '.0'; };
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const G = { ready: false, err: '', version: 0, device: null, canvas: null, ctx: null, format: '', maxCount: 0 };

  /* ── which systems this engine runs ── */
  function supports(sys) {
    if (!G.ready || !sys) return false;
    for (const n of sys.nodes) {
      if (!SUPPORTED.has(n.type)) return false;
      if (n.type === 'geo' && paramOf(n, 'kind') === 'glsl') return false;   // written in GLSL by hand: only the WebGL2 engine
    }
    const em = sys.nodes.find(n => isEmitter(n.type));
    return !!em && +paramOf(em, 'count') <= G.maxCount;
  }

  /* ── WGSL pieces shared by every system ── */
  const LIB = `
const TAU = 6.2831853;
fn pcg4(v0: vec4u) -> vec4u {
  var v = v0 * 1664525u + vec4u(1013904223u);
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v = v ^ (v >> vec4u(16u));
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}
fn rnd4(a: u32, b: u32, c: u32) -> vec4f { return vec4f(pcg4(vec4u(a, b, c, 0x2545F491u))) * (1.0 / 4294967295.0); }
fn h3(c: vec3i) -> f32 {
  var n = (u32(c.x) * 0x8da6b343u) ^ (u32(c.y) * 0xd8163841u) ^ (u32(c.z) * 0xcb1ab31fu);
  n = (n ^ (n >> 16u)) * 0x7feb352du; n = (n ^ (n >> 15u)) * 0x846ca68bu; n = n ^ (n >> 16u);
  return f32(n) * (1.0 / 4294967295.0);
}
fn vnoised(x: vec3f) -> vec4f {
  let i = vec3i(floor(x)); let f = fract(x);
  let u = f * f * (3.0 - 2.0 * f); let du = 6.0 * f * (1.0 - f);
  let a = h3(i); let b = h3(i + vec3i(1, 0, 0)); let c = h3(i + vec3i(0, 1, 0)); let d = h3(i + vec3i(1, 1, 0));
  let e = h3(i + vec3i(0, 0, 1)); let g = h3(i + vec3i(1, 0, 1)); let h = h3(i + vec3i(0, 1, 1)); let k = h3(i + vec3i(1, 1, 1));
  let k1 = b - a; let k2 = c - a; let k3 = e - a; let k4 = a - b - c + d; let k5 = a - c - e + h; let k6 = a - b - e + g; let k7 = -a + b + c - d + e - g - h + k;
  let v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  let dv = du * vec3f(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4f(v, dv);
}
fn hueShift(c: vec3f, h: f32) -> vec3f { let k = vec3f(0.57735); let a = h * TAU; let ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
fn hsv(h: f32, s: f32, v: f32) -> vec3f { let k = clamp(abs(fract(h + vec3f(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0)); return v * mix(vec3f(1.0), k, s); }
fn rot2(a: f32) -> mat2x2f { return mat2x2f(cos(a), sin(a), -sin(a), cos(a)); }
struct P { pos: vec4f, vel: vec4f, home: vec4f };
struct U { g0: vec4f, g1: vec4f, g2: vec4f, g3: vec4f, cam: vec4f, audio: vec4f, ptr: vec4f, fl: vec4f, fs: vec4f, v: array<vec4f, ${MAX_SLOTS}> };
@group(0) @binding(1) var<uniform> U_: U;
`;
  // g0 = dt, time, beat, aspect · g1 = frame, burst, kick, msize · g2 = hue, mgain, rtime, scale · g3 = maxpt, life (init), count, -
  // fl = fluid W, H, picture w, h · fs = a form emitter's points: how many, their aspect, jitter x, y
  // bindings: 0 particles · 1 uniforms · 2 fluid · 3 form points · 4 camera motion · 5 sampler · 6 the form's picture
  const HDR = 9;
  const GLOB = `
  let u_dt = U_.g0.x; let u_time = U_.g0.y; let u_beat = U_.g0.z; let u_aspect = U_.g0.w;
  let u_burst = U_.g1.y; let u_kick = U_.g1.z; let u_msize = U_.g1.w;
  let u_hue = U_.g2.x; let u_mgain = U_.g2.y; let u_rtime = U_.g2.z; let u_scale = U_.g2.w;
  let u_maxpt = U_.g3.x; let u_cam = U_.cam; let u_audio = U_.audio; let u_ptr = U_.ptr.xyz;`;

  /* ── a system → WGSL (the same structure as particles.js compile()) ── */
  function compile(sys) {
    const byId = new Map(sys.nodes.map(n => [n.id, n]));
    const linkInto = (id, k) => sys.links.find(l => l.b === id && l.bi === k);
    const out = sys.nodes.find(n => n.type === 'out');
    if (!out) throw new Error('Falta el nodo Salida');
    const chain = [], seen = new Set();
    let l = linkInto(out.id, 'in');
    while (l) {
      const n = byId.get(l.a);
      if (!n || seen.has(n.id) || !DEFS[n.type] || DEFS[n.type].cat === 'val') break;
      seen.add(n.id); chain.unshift(n);
      if (isEmitter(n.type)) break;
      l = linkInto(n.id, 'in');
    }
    if (!chain.length || !isEmitter(chain[0].type)) throw new Error('Conectá un Emisor a la Salida');
    const emit = chain[0];
    const slots = [], vals = [], valState = new Map();
    const slot = (name, t, extra) => { let s = slots.find(x => x.name === name); if (!s) { s = { name, t, i: slots.length, ...extra }; slots.push(s); } if (slots.length > MAX_SLOTS) throw new Error('Demasiadas perillas'); return name; };
    const VALUE = {
      lfo: (I, P, id) => {
        const ph = P.sync === 'free' ? `(u_time * ${I.speed})` : `(u_beat / ${fl(P.sync)})`;
        const sh = { sine: `sin(${ph} * TAU) * 0.5 + 0.5`, tri: `abs(fract(${ph}) * 2.0 - 1.0)`, saw: `fract(${ph})`, square: `step(0.5, fract(${ph}))`,
                     random: `f32(pcg4(vec4u(u32(floor(${ph}) + 4096.0), ${id}u, 3u, 1u)).x) * (1.0 / 4294967295.0)` }[P.shape];
        return `let v${id}_v = mix(${I.min}, ${I.max}, ${sh});`;
      },
      audio: (I, P, id) => `let a${id} = clamp(u_audio * ${I.gain}, vec4f(0.0), vec4f(1.0)); let v${id}_level = a${id}.x; let v${id}_bass = a${id}.y; let v${id}_mid = a${id}.z; let v${id}_high = a${id}.w;`,
      pulse: (I, P, id) => `let v${id}_v = mix(${I.min}, ${I.max}, exp(-fract(u_beat / ${fl(P.div)}) * ${fl(P.div)} * ${I.decay}));`,
    };
    function emitValue(n) {
      const st = valState.get(n.id);
      if (st === 2) return;
      if (st === 1) throw new Error('Hay un círculo entre los nodos de valores');
      valState.set(n.id, 1);
      const I = inputsOf(n), P = {};
      (DEFS[n.type].params || []).forEach(q => { P[q.k] = paramOf(n, q.k); });
      vals.push(VALUE[n.type](I, P, n.id));
      valState.set(n.id, 2);
    }
    function inputsOf(n) {
      const I = {};
      for (const inp of DEFS[n.type].inputs) {
        if (inp.t === 'part') continue;
        const lk = linkInto(n.id, inp.k), src = lk && byId.get(lk.a);
        if (src && DEFS[src.type].cat === 'val' && inp.t === 'float') { emitValue(src); I[inp.k] = `v${src.id}_${lk.ao}`; continue; }
        I[inp.k] = slot(`u${n.id}_${inp.k}`, inp.t, { node: n.id, k: inp.k });
      }
      return I;
    }
    const P = n => { const o = {}; (DEFS[n.type].params || []).forEach(q => { o[q.k] = paramOf(n, q.k); }); return o; };

    // emitter
    const EI = inputsOf(emit), EP = P(emit);
    const shape = {
      point: 'pos = c + vec3f((r.xy - 0.5) * 0.004, 0.0); o = vec3f(cos(r.z * TAU), sin(r.z * TAU), 0.0);',
      ring: 'let ang = r.x * TAU; o = vec3f(cos(ang), sin(ang), 0.0); pos = c + o * S;',
      disc: 'let ang = r.x * TAU; o = vec3f(cos(ang), sin(ang), 0.0); pos = c + o * S * sqrt(r.y);',
      line: 'pos = c + vec3f((r.x * 2.0 - 1.0) * S * 2.0, 0.0, 0.0); o = vec3f(0.0, select(1.0, -1.0, r.z < 0.5), 0.0);',
      box: 'pos = c + vec3f((r.x * 2.0 - 1.0) * S * A, (r.y * 2.0 - 1.0) * S, 0.0); o = normalize(pos - c + vec3f(0.0, 0.0001, 0.0));',
      screen: 'pos = vec3f((r.x * 2.0 - 1.0) * A * 1.02, (r.y * 2.0 - 1.0) * 1.02, 0.0); o = vec3f(cos(r.z * TAU), sin(r.z * TAU), 0.0);',
      sphere: 'let zz = r.y * 2.0 - 1.0; let ang = r.x * TAU; let rr = sqrt(1.0 - zz * zz); o = vec3f(rr * cos(ang), rr * sin(ang), zz); pos = c + o * S;',
    }[EP.shape];
    // «Emisor de forma»: born on one of the points of a text, a picture or the camera (uploaded by the engine)
    const formShape = `let np = U_.fs.x;
    let pidx = u32(min(r.x * np, max(np - 1.0, 0.0)));
    let puv = clamp(PTS[pidx] + (r.yz - 0.5) * U_.fs.zw, vec2f(0.0), vec2f(1.0));
    o = vec3f(puv.x - 0.5, 0.5 - puv.y, 0.0);
    pos = c + vec3f(o.x * S * U_.fs.y, o.y * S, 0.0);
    o = normalize(o + vec3f(0.0, 0.0001, 0.0));
    hw = floor(puv.x * 4095.0) * 4096.0 + floor(puv.y * 4095.0);
    ok = np > 0.5;`;
    const it = (n, body) => `for (var i = 0u; i < ${n}u; i++) { let h = rnd4(idu, fr, 40u + i).x; ${body} }`;
    const GEO = {
      polygon: `let N = floor(3.0 + GA * 9.0); let k = floor(r.x * N); let a0 = TAU * k / N + 1.5707963; let a1 = a0 + TAU / N;
    var q = mix(vec2f(cos(a0), sin(a0)), vec2f(cos(a1), sin(a1)), r.y); if (r.z < GB) { q *= sqrt(r.w); } g = vec3f(q, 0.0);`,
      star: `let N = floor(3.0 + GA * 9.0); let k = floor(r.x * N * 2.0); let a0 = 3.14159265 * k / N + 1.5707963; let a1 = a0 + 3.14159265 / N; let ri = 0.2 + GB * 0.6;
    let ev = (k % 2.0) < 0.5; let rA = select(ri, 1.0, ev); let rB = select(1.0, ri, ev); g = vec3f(mix(vec2f(cos(a0), sin(a0)) * rA, vec2f(cos(a1), sin(a1)) * rB, r.y), 0.0);`,
      spiral: `let arms = floor(1.0 + GB * 5.0); let turns = 1.0 + GA * 6.0; let ang = r.x * turns * TAU + floor(r.y * arms) * TAU / arms; g = vec3f(vec2f(cos(ang), sin(ang)) * r.x, 0.0);`,
      rose: `let kn = 1.0 + floor(GA * 8.0); let kd = 1.0 + floor(GB * 4.0); let th = r.x * TAU * kd; g = vec3f(vec2f(cos(th), sin(th)) * cos(kn / kd * th), 0.0);`,
      lissa: `let fa = 1.0 + floor(GA * 6.0); var fb = 1.0 + floor(GB * 6.0); if (fb == fa) { fb += 1.0; } let th = r.x * TAU; g = vec3f(sin(fa * th + 0.7853982), sin(fb * th), 0.0);`,
      grid: `let N = floor(2.0 + GA * 30.0); var q = r.xy;
    if (r.z < GB) { if (r.w < 0.5) { q.x = (floor(q.x * N) + 0.5) / N; } else { q.y = (floor(q.y * N) + 0.5) / N; } } else { q = (floor(q * N) + 0.5) / N; } g = vec3f(q * 2.0 - 1.0, 0.0);`,
      knot: `let kp = 2.0 + floor(GA * 4.0); var kq = 3.0 + floor(GB * 4.0); if ((kq % kp) < 0.5) { kq += 1.0; } let th = r.x * TAU; let rr = 2.0 + cos(kq * th);
    g = vec3f(rr * cos(kp * th), rr * sin(kp * th), -sin(kq * th)) * 0.33 + (r.yzw - 0.5) * 0.04;`,
      fibs: `let Np = floor(40.0 + GA * 1960.0); let k = floor(r.x * Np); let zz = 1.0 - (2.0 * k + 1.0) / Np; let rr = sqrt(max(0.0, 1.0 - zz * zz)); let ang = k * 2.39996323;
    g = vec3f(rr * cos(ang), zz, rr * sin(ang)) * (1.0 + (r.y - 0.5) * GB * 0.06);`,
      cube: `let e = floor(r.x * 12.0); let t0 = r.y * 2.0 - 1.0; let ax = floor(e / 4.0); let s1 = select(1.0, -1.0, (e % 2.0) < 0.5); let s2 = select(1.0, -1.0, (floor(e / 2.0) % 2.0) < 0.5);
    if (ax < 0.5) { g = vec3f(t0, s1, s2); } else if (ax < 1.5) { g = vec3f(s1, t0, s2); } else { g = vec3f(s1, s2, t0); } g *= 0.6;`,
      sierp: `var q = r.xyz * 2.0 - 1.0; let tet = GA > 0.5;
    ${it(18, `var v = vec3f(0.0, 1.0, 0.0);
      if (tet) { if (h >= 0.25 && h < 0.5) { v = vec3f(-0.943, -0.333, 0.0); } else if (h >= 0.5 && h < 0.75) { v = vec3f(0.471, -0.333, 0.816); } else if (h >= 0.75) { v = vec3f(0.471, -0.333, -0.816); } }
      else { if (h >= 0.3333 && h < 0.6667) { v = vec3f(-0.866, -0.5, 0.0); } else if (h >= 0.6667) { v = vec3f(0.866, -0.5, 0.0); } }
      q = (q + v) * 0.5;`)}
    g = select(vec3f(q.xy, 0.0), q, tet);`,
      carpet: `var q = r.xy * 2.0 - 1.0;
    ${it(10, `var cc = floor(h * 8.0); if (cc > 3.5) { cc += 1.0; } q = q / 3.0 + vec2f((cc % 3.0) - 1.0, floor(cc / 3.0) - 1.0) * (2.0 / 3.0);`)}
    g = vec3f(q, 0.0);`,
      fern: `var q = vec2f(0.0); let bend = 0.04 + (GA - 0.5) * 0.12;
    ${it(26, `if (h < 0.01) { q = vec2f(0.0, 0.16 * q.y); } else if (h < 0.86) { q = vec2f(0.85 * q.x + bend * q.y, -bend * q.x + 0.85 * q.y + 1.6); } else if (h < 0.93) { q = vec2f(0.2 * q.x - 0.26 * q.y, 0.23 * q.x + 0.22 * q.y + 1.6); } else { q = vec2f(-0.15 * q.x + 0.28 * q.y, 0.26 * q.x + 0.24 * q.y + 0.44); }`)}
    g = vec3f(q.x * 0.19, q.y * 0.19 - 0.95, 0.0);`,
      dragon: `var q = r.xy;
    ${it(24, `if (h < 0.5) { q = mat2x2f(0.5, 0.5, -0.5, 0.5) * q; } else { q = mat2x2f(-0.5, 0.5, -0.5, -0.5) * q + vec2f(1.0, 0.0); }`)}
    g = vec3f((q - vec2f(0.33, 0.1)) * 1.45, 0.0);`,
      tree: `var q = r.xy; let th = 0.25 + GA * 0.7; let rl = mat2x2f(cos(th), sin(th), -sin(th), cos(th)); let rr2 = mat2x2f(cos(th), -sin(th), sin(th), cos(th));
    ${it(24, `if (h < 0.16) { q = vec2f(0.02 * q.x, 0.4 * q.y); } else if (h < 0.58) { q = rl * (q * 0.62) + vec2f(0.0, 1.0); } else { q = rr2 * (q * 0.62) + vec2f(0.0, 1.0); }`)}
    g = vec3f(q.x * 0.5, q.y * 0.5 - 0.95, 0.0);`,
      clifford: `var q = r.xy * 2.0 - 1.0; let ca = -1.4 + (GA - 0.5) * 3.0; let cb = 1.6 + (GB - 0.5) * 3.0;
    for (var i = 0; i < 40; i++) { q = vec2f(sin(ca * q.y) + cos(ca * q.x), sin(cb * q.x) + 0.7 * cos(cb * q.y)); }
    g = vec3f(q / 2.0, 0.0);`,
      dejong: `var q = r.xy * 2.0 - 1.0; let da = 1.4 + (GA - 0.5) * 3.0; let db = -2.3 + (GB - 0.5) * 3.0;
    for (var i = 0; i < 40; i++) { q = vec2f(sin(da * q.y) - cos(db * q.x), sin(2.4 * q.x) - cos(-2.1 * q.y)); }
    g = vec3f(q / 2.1, 0.0);`,
    };
    let geoShape = '';
    if (emit.type === 'geo') {
      const GA = `clamp(${EI.a}, 0.0, 1.0)`, GB = `clamp(${EI.b}, 0.0, 1.0)`;
      const body = (GEO[EP.kind] || GEO.rose).replace(/\bGA\b/g, GA).replace(/\bGB\b/g, GB);
      geoShape = `var g = vec3f(0.0);
    { ${body} }
    let ra = radians(${EI.rot} + ${EI.turn} * u_time); g = vec3f(rot2(ra) * g.xy, g.z);
    o = normalize(g + vec3f(0.0001, 0.0, 0.0)); pos = c + g * S;`;
    }
    const dir = { out: 'o', up: 'vec3f(0.0, 1.0, 0.0)', down: 'vec3f(0.0, -1.0, 0.0)', left: 'vec3f(-1.0, 0.0, 0.0)', right: 'vec3f(1.0, 0.0, 0.0)',
                  random: 'normalize(vec3f(cos(r2.x * TAU), sin(r2.x * TAU), (r3.z * 2.0 - 1.0) * D3 * 1.6))', spin: 'vec3f(-o.y, o.x, 0.0)', front: 'vec3f(0.0, 0.0, 1.0)', back: 'vec3f(0.0, 0.0, -1.0)', still: 'vec3f(0.0)' }[EP.dir];
    const depthSpread = emit.type === 'emit' && EP.shape === 'screen' ? '1.0' : emit.type === 'emit' && EP.shape === 'point' ? '0.0' : 'max(S, 0.2) * 0.8';
    const EMIT = `
    let c = vec3f(${EI.x}, ${EI.y}, ${EI.z}); var o = vec3f(0.0); let S = ${EI.size};
    let r3 = rnd4(idu, fr, 3u); let D3 = clamp(${EI.depth}, 0.0, 1.0);
    { ${emit.type === 'form' ? formShape : emit.type === 'geo' ? geoShape : shape} }
    if (D3 > 0.0) {
      pos.z += (r3.x * 2.0 - 1.0) * D3 * ${depthSpread};
      o = normalize(o + vec3f(0.0, 0.0, (r3.y * 2.0 - 1.0) * D3 * 1.6) + vec3f(1e-5, 0.0, 0.0));
    }
    let d0 = ${dir};
    vel = d0 * ${EI.speed} * (1.0 + (r2.z - 0.5) * ${EI.chaos} * 1.5)
        + vec3f(cos(r2.y * TAU), sin(r2.y * TAU), (r.w - 0.5) * (0.6 + D3 * 1.4)) * ${EI.speed} * ${EI.chaos} * 0.6;
    life = max(0.05, ${EI.life} * (1.0 + (r2.w * 2.0 - 1.0) * ${EI.lifeVar} * 0.8));`;

    // forces
    const pre = [], post = [], triggers = [];
    let look = null, sym = null, fluid = null, studio = null;
    let usesCam = emit.type === 'form' && EP.src === 'camera', camForce = false;   // the camera runs for both; only the force reads its motion map
    if (EP.burst !== 'cont') triggers.push({ u: 'u_burst', mode: EP.burst });
    for (const n of chain.slice(1)) {
      const I = inputsOf(n), Q = P(n), id = n.id;
      if (n.type === 'gravity') pre.push(`{ let ga = radians(${I.angle}); vel += vec3f(vec2f(sin(ga), -cos(ga)) * ${I.str} * pw * dt, 0.0); }`);
      else if (n.type === 'turb') pre.push(`{ let q = pos * ${I.scale} + vec3f(0.0, 0.0, u_time * ${I.speed}); let n1 = vnoised(q); let n2 = vnoised(q * 2.03 + vec3f(19.1, 7.3, 3.7));
      let g = n1.yzw + n2.yzw * 1.015; vel += vec3f(g.y, -g.x, g.z * 0.25) * ${I.str} * dt / pw;
      if (${I.z3} > 0.0) { let n3 = vnoised(q * 1.31 + vec3f(5.2, 1.3, 8.7)); let n4 = vnoised(q * 1.31 + vec3f(2.9, 9.1, 4.4));
        vel += vec3f(-n4.w, n3.w, n4.y - n3.z) * 1.6 * ${I.z3} * ${I.str} * dt / pw; } }`);
      else if (n.type === 'attract') pre.push(`{ let d = vec3f(${I.x}, ${I.y}, 0.0) - pos; vel += d * (${I.str} * 0.35 / (dot(d, d) + 0.06)) * dt; }`);
      else if (n.type === 'vortex') pre.push(`{ let d = pos.xy - vec2f(${I.x}, ${I.y}); let r2v = dot(d, d) + 0.05; vel += vec3f((vec2f(-d.y, d.x) * ${I.str} * 0.2 / r2v - d * ${I.pull}) * dt, 0.0); }`);
      else if (n.type === 'wave') pre.push(Q.dir === 'z' ? `{ let rl = length(pos.xy); vel.z += sin(rl * ${I.freq} - u_time * ${I.speed} + pos.x * 1.3) * ${I.str} * dt; }`
        : Q.dir === 'v' ? `vel.x += sin(pos.y * ${I.freq} + u_time * ${I.speed}) * ${I.str} * dt;`
        : Q.dir === 'r' ? `{ let rl = length(pos.xy) + 1e-4; vel += vec3f(pos.xy / rl * sin(rl * ${I.freq} - u_time * ${I.speed}) * ${I.str} * dt, 0.0); }`
        : `vel.y += sin(pos.x * ${I.freq} + u_time * ${I.speed}) * ${I.str} * dt;`);
      else if (n.type === 'explode') {
        const hu = slot(`u${id}_hit`, 'float', { trig: true });
        triggers.push({ u: hu, mode: Q.trig });
        pre.push(`if (${hu} > 0.5) { let d = pos - vec3f(${I.x}, ${I.y}, 0.0); vel += normalize(d + vec3f(1e-4, 0.0, 0.0)) * ${I.str} / (1.0 + length(d) * 1.5); }`);
      } else if (n.type === 'strange') {
        const A2 = {
          lorenz: { K: '25.0', O: 'vec3f(0.0, 0.0, 24.6)', TS: '0.12', f: 'vec3f(10.0 * (a.y - a.x), a.x * (28.0 - a.z) - a.y, a.x * a.y - 2.6666667 * a.z)' },
          aizawa: { K: '1.5', O: 'vec3f(0.0, 0.0, 0.7)', TS: '0.6', f: 'vec3f((a.z - 0.7) * a.x - 3.5 * a.y, 3.5 * a.x + (a.z - 0.7) * a.y, 0.6 + 0.95 * a.z - a.z * a.z * a.z / 3.0 - (a.x * a.x + a.y * a.y) * (1.0 + 0.25 * a.z) + 0.1 * a.z * a.x * a.x * a.x)' },
          thomas: { K: '4.0', O: 'vec3f(0.0)', TS: '3.0', f: 'vec3f(sin(a.y) - 0.208186 * a.x, sin(a.z) - 0.208186 * a.y, sin(a.x) - 0.208186 * a.z)' },
          halvorsen: { K: '11.0', O: 'vec3f(-2.9)', TS: '0.25', f: 'vec3f(-1.89 * a.x - 4.0 * a.y - 4.0 * a.z - a.y * a.y, -1.89 * a.y - 4.0 * a.z - 4.0 * a.x - a.z * a.z, -1.89 * a.z - 4.0 * a.x - 4.0 * a.y - a.x * a.x)' },
        }[Q.kind];
        if (A2) pre.push(`{ let sS = max(${I.size}, 0.01); let w = (pos - vec3f(${I.x}, ${I.y}, 0.0)) / sS; let a = vec3f(w.x, w.z, w.y) * ${A2.K} + ${A2.O};
      let d = ${A2.f}; var tv = vec3f(d.x, d.z, d.y) / ${A2.K} * sS * ${I.speed} * ${A2.TS} * 2.0;
      let tl = length(tv); if (tl > 4.0 * sS) { tv *= 4.0 * sS / tl; }
      vel += (tv - vel) * clamp(${I.str} * dt * 60.0, 0.0, 1.0); }`);
      } else if (n.type === 'home') pre.push(`{ let d = home.xyz - pos; vel += d * ${I.str} * dt; vel *= exp(-max(0.0, ${I.damp}) * dt); }`);
      else if (n.type === 'drag') pre.push(`vel *= exp(-max(0.0, ${I.amt}) * dt / pw);`);
      else if (n.type === 'shield') pre.push(`{ let sc = ${Q.follow === 'fixed' ? `vec3f(${I.x}, ${I.y}, ${I.z})` : `select(vec3f(${I.x}, ${I.y}, ${I.z}), vec3f(u_ptr.xy, ${I.z}), u_ptr.z > 0.5)`};
      let d = pos - sc; let rr = length(d) + 1e-4; let R = max(${I.radius}, 0.02); let s0 = R * (1.0 - clamp(${I.soft}, 0.0, 1.0) * 0.85);
      vel += d / rr * (1.0 - smoothstep(s0, R * 1.15, rr)) * ${I.str} * 4.0 * dt / pw;
      if (rr < s0 * 0.7) { pos = sc + d / rr * s0 * 0.7; } }`);
      else if (n.type === 'fluid') {
        // «Fluido»: the particles ride a simulated fluid (its own grid, stirred by the pointer, the beat, the bass and a soft swirl)
        fluid = { I, P: Q, id };
        pre.push(`{ let fv = fluidVel(pos.xy, A); vel += (vec3f(fv, 0.0) * ${I.speed} - vel) * clamp(${I.str} * dt * 60.0 / pw, 0.0, 1.0); }`);   // «Arrastre» high: they ride the current like ink
      } else if (n.type === 'bounds') {
        const B = `clamp(${I.bounce}, 0.0, 1.0)`;
        post.push({
          bounce: `if (abs(pos.x) > A) { pos.x = sign(pos.x) * A; vel.x = -vel.x * ${B}; } if (abs(pos.y) > 1.0) { pos.y = sign(pos.y); vel.y = -vel.y * ${B}; }`,
          floor: `if (pos.y < -1.0) { pos.y = -1.0; vel.y = abs(vel.y) * ${B}; vel.x *= 0.9; }`,
          wrap: `if (abs(pos.x) > A) { pos.x -= sign(pos.x) * 2.0 * A; } if (abs(pos.y) > 1.0) { pos.y -= sign(pos.y) * 2.0; }`,
          kill: `if (abs(pos.x) > A + 0.05 || abs(pos.y) > 1.05) { age = life + 1.0; }`,
        }[Q.mode]);
      } else if (n.type === 'cam') {
        // «Cámara»: pushed away from what moves (or from the light) in the camera's small motion map
        usesCam = true; camForce = true;
        const ch = Q.mode === 'bright' ? 'g' : 'r';
        pre.push(`{ let cu = vec2f(pos.x / (2.0 * A) + 0.5, 0.5 - pos.y * 0.5); let ce = vec2f(1.5 / 160.0, 1.5 / 90.0);
      let gx = textureSampleLevel(MOT, SMP, cu + vec2f(ce.x, 0.0), 0.0).${ch} - textureSampleLevel(MOT, SMP, cu - vec2f(ce.x, 0.0), 0.0).${ch};
      let gy = textureSampleLevel(MOT, SMP, cu - vec2f(0.0, ce.y), 0.0).${ch} - textureSampleLevel(MOT, SMP, cu + vec2f(0.0, ce.y), 0.0).${ch};
      vel = vec3f(vel.xy - vec2f(gx, gy) * ${I.str} * 8.0 * dt, vel.z); }`);
      } else if (n.type === 'studio') studio = { I, P: Q, id };
      else if (n.type === 'look') look = { I, P: Q };
      else if (n.type === 'sym') sym = { I, P: Q };
    }
    const OI = inputsOf(out), OP = P(out);
    const burst = EP.burst !== 'cont';
    const form = emit.type === 'form', imgColor = !!(look && look.P.color === 'image');
    const head = (sl) => `${LIB}${form ? `@group(0) @binding(3) var<storage, read> PTS: array<vec2f>;
` : ''}${camForce || imgColor ? `@group(0) @binding(5) var SMP: sampler;
` : ''}${camForce ? `@group(0) @binding(4) var MOT: texture_2d<f32>;
` : ''}${imgColor ? `@group(0) @binding(6) var IMG: texture_2d<f32>;
` : ''}${fluid ? `@group(0) @binding(2) var<storage, read> FV: array<vec2f>;
fn fluidAt(x: i32, y: i32) -> vec2f { let W = i32(U_.fl.x); let H = i32(U_.fl.y); return FV[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)]; }
fn fluidVel(p: vec2f, A: f32) -> vec2f {   // the fluid's velocity under a point (bilinear)
  let W = U_.fl.x; let H = U_.fl.y;
  let g = vec2f((p.x / (A * 1.08) * 0.5 + 0.5) * W - 0.5, (p.y / 1.08 * 0.5 + 0.5) * H - 0.5);   // the grid reaches 8 % past the screen (its walls stay off-screen)
  let i = vec2i(floor(g)); let f = fract(g);
  return mix(mix(fluidAt(i.x, i.y), fluidAt(i.x + 1, i.y), f.x), mix(fluidAt(i.x, i.y + 1), fluidAt(i.x + 1, i.y + 1), f.x), f.y);
}` : ''}`;
    const uniLets = slots.map(s => `let ${s.name} = U_.v[${s.i}]${s.t === 'color' ? '.xyz' : '.x'};`).join(' ');
    const VALUES = vals.join('\n  ');

    const sim = `${head()}
@group(0) @binding(0) var<storage, read_write> PS: array<P>;
@compute @workgroup_size(256) fn init(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= u32(U_.g3.z)) { return; }
  let r = rnd4(i, 77u, 5u); let lf = U_.g3.y;
  ${burst ? 'PS[i] = P(vec4f(0.0, 0.0, 0.0, 1e6), vec4f(0.0, 0.0, 0.0, 1.0), vec4f(0.0, 0.0, 0.0, -1.0));' : 'PS[i] = P(vec4f(0.0, 0.0, 0.0, -r.x * lf), vec4f(0.0, 0.0, 0.0, lf), vec4f(0.0, 0.0, 0.0, -1.0));'}
}
@compute @workgroup_size(256) fn sim(@builtin(global_invocation_id) gid: vec3u) {
  let idu = gid.x; if (idu >= u32(U_.g3.z)) { return; }
  ${GLOB}
  let fr = u32(U_.g1.x);
  ${uniLets}
  var p = PS[idu]; var pos = p.pos.xyz; var vel = p.vel.xyz; var age = p.pos.w; var life = p.vel.w; var home = p.home;
  let dt = u_dt; let A = u_aspect;
  ${VALUES}
  let age0 = age; age += dt;
  let spawn = ${burst ? 'u_burst > 0.5' : '(age0 < 0.0 && age >= 0.0) || age >= life'};
  if (spawn) {
    let r = rnd4(idu, fr, 1u); let r2 = rnd4(idu, fr, 2u); var hw = -1.0; var ok = true;
    ${EMIT}
    age = 0.0; home = vec4f(pos, hw);
    if (!ok) { life = -1.0; pos = vec3f(0.0, 0.0, -50.0); }   // nothing to be born on yet (empty text, camera starting): again next frame
  } else if (age >= 0.0 && age < life) {
    if (u_kick > 0.5) { vel += normalize(pos + vec3f(1e-4, 0.0, 0.0)) * 1.8 / (1.0 + length(pos)); }
    let pw = 1.0 + (rnd4(idu, 0u, 7u).x - 0.5) * 1.6 * clamp(${EI.weightVar}, 0.0, 1.0);
    ${pre.join('\n    ')}
    pos += vel * dt;
    ${post.join('\n    ')}
    pos.z = max(pos.z, -12.0);
    if (pos.z > 1.6) { age = life + 1.0; }
  }
  if (!(abs(pos.x) < 1e4 && abs(pos.y) < 1e4 && abs(vel.x) < 1e4 && abs(vel.y) < 1e4)) { pos = vec3f(0.0); vel = vec3f(0.0); age = life + 1.0; }
  PS[idu] = P(vec4f(pos, age), vec4f(vel, life), home);
}`;
    // drawing
    const LI = look ? look.I : { size: '3.0', opacity: '0.8', a: 'vec3f(0.4, 1.0, 0.2)', b: 'vec3f(0.0, 0.83, 1.0)' };
    const LP = look ? look.P : { shape: 'soft', color: 'age', life: 'fade' };
    const colExpr = {
      a: `${LI.a}`, age: `mix(${LI.a}, ${LI.b}, t)`, speed: `mix(${LI.a}, ${LI.b}, clamp(length(V.xyz) / 1.2, 0.0, 1.0))`, rand: `mix(${LI.a}, ${LI.b}, rs.x)`,
      rainbow: `hsv(fract(rs.x + u_time * 0.05), 0.75, 1.0)`, angle: `hsv(fract(atan2(pos.y, pos.x) / TAU + u_time * 0.05), 0.75, 1.0)`,
      image: `select(${LI.a}, textureSampleLevel(IMG, SMP, vec2f(floor(Pp.home.w / 4096.0), Pp.home.w % 4096.0) / 4095.0, 0.0).rgb, Pp.home.w >= 0.0)`,
    }[LP.color] || `${LI.a}`;
    const lifeCurve = {
      fade: 'al *= smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.65, 1.0, t));',
      shrink: 'sz *= 1.0 - t; al *= smoothstep(0.0, 0.04, t);',
      grow: 'sz *= 0.25 + t * 1.5; al *= smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.75, 1.0, t));',
      twinkle: 'al *= (0.25 + 0.75 * step(0.5, fract(rs.y * 7.0 + u_time * (1.5 + rs.z * 5.0)))) * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.7, 1.0, t));',
      const: 'al *= smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.97, 1.0, t));',
    }[LP.life];
    const cop = sym ? (+sym.P.n || 6) * (sym.P.mirror === 'no' ? 1 : 2) : 1;
    const symW = !sym ? '' : `
  { let cp = ii % ${cop}u; let mir = ${sym.P.mirror === 'no' ? 'false' : 'cp % 2u == 1u'}; let kk = f32(${sym.P.mirror === 'no' ? 'cp' : 'cp / 2u'});
    var q = pos.xy; if (mir) { q.x = -q.x; }
    let an = kk * TAU / ${fl(+sym.P.n || 6)} + radians(${sym.I.rot} + ${sym.I.turn} * u_rtime);
    let q2 = rot2(an) * q; pos = vec3f(q2, pos.z); }`;
    const shapeExpr = {
      soft: 'exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r))',
      dot: '1.0 - smoothstep(0.75, 1.0, r)',
      ring: 'smoothstep(0.5, 0.68, r) * (1.0 - smoothstep(0.82, 1.0, r))',
      star: 'clamp(exp(-r * r * 9.0) + (1.0 - smoothstep(0.0, 0.14, abs(q.x))) * (1.0 - abs(q.y)) * 0.8 + (1.0 - smoothstep(0.0, 0.14, abs(q.y))) * (1.0 - abs(q.x)) * 0.8, 0.0, 1.0)',
      square: '1.0',
    }[LP.shape];
    const draw = `${head()}
@group(0) @binding(0) var<storage, read> RS: array<P>;
struct VO { @builtin(position) cpos: vec4f, @location(0) q: vec2f, @location(1) col: vec4f, @location(2) bk: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let cn = corners[vi]; o.q = cn; o.bk = 0.0; o.col = vec4f(0.0);
  let i = ii${cop > 1 ? ` / ${cop}u` : ''};
  let Pp = RS[i]; let V = Pp.vel;
  let age = Pp.pos.w; let life = V.w;
  if (age < 0.0 || age >= life) { o.cpos = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  ${GLOB}
  ${uniLets}
  let t = age / life; var pos = Pp.pos.xyz;${symW}
  let rs = rnd4(i, 0u, 9u);
  ${VALUES}
  let sw = max(${OI.sway}, 0.0);
  let yaw = radians(${OI.yaw} + u_cam.x + (${OI.spin} + u_cam.w) * u_rtime + sw * sin(u_rtime * 0.37));
  let pitch = radians(clamp(${OI.pitch} + u_cam.y + sw * 0.45 * sin(u_rtime * 0.23 + 1.0), -89.0, 89.0));
  let cy = cos(yaw); let sy = sin(yaw); let cp = cos(pitch); let sp = sin(pitch);
  var cq = vec3f(cy * pos.x + sy * pos.z, pos.y, -sy * pos.x + cy * pos.z);
  cq = vec3f(cq.x, cp * cq.y - sp * cq.z, sp * cq.y + cp * cq.z);
  let dz = 2.5 * max(0.1, ${OI.dist} * u_cam.z) - cq.z;
  if (dz < 0.25) { o.cpos = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let persp = 2.5 / dz;
  var sz = max(0.0, ${LI.size}) * persp * u_msize; var al = clamp(${LI.opacity}, 0.0, 1.0);
  al *= clamp(exp(clamp(${OI.fog}, 0.0, 1.0) * cq.z * 0.9), 0.0, ${OP.blend === 'normal' ? '1.0' : '1.6'});
  ${lifeCurve}
  var px = sz * u_scale;
  let cocp = abs(cq.z - (${OI.focus})) * clamp(${OI.aperture}, 0.0, 1.0) * 30.0 * persp * u_scale;
  if (cocp > 0.5) { let p2 = min(px + cocp, u_maxpt); al *= max(0.025, pow(max(px, 1.0) / p2, 1.6)); o.bk = clamp(cocp / p2 * 1.4, 0.0, 1.0); px = p2; }
  if (px < 1.0) { al *= max(px, 0.0); px = 1.0; }
  px = min(px, u_maxpt);
  var col = ${colExpr};${studio ? `
  { let Ld = vec3f(${studio.I.lx}, ${studio.I.ly}, ${studio.I.lz}) - pos; let lit = ${studio.I.power} / (1.0 + 0.7 * dot(Ld, Ld));   // «Estudio»: near the light, brighter and warmer
    col *= mix(vec3f(1.0), vec3f(0.35) + ${studio.I.lcol} * lit * 1.4, clamp(${studio.I.litp}, 0.0, 1.0)); }` : ''}
  if (u_hue != 0.0) { col = max(hueShift(col, u_hue), vec3f(0.0)); }
  o.col = vec4f(col * max(0.0, ${OI.gain}) * u_mgain, al);
  let res = U_.fl.zw;   // the picture's size in pixels
  o.cpos = vec4f(cq.x * persp / u_aspect + cn.x * px / res.x, cq.y * persp + cn.y * px / res.y, 0.0, 1.0);
  return o;
}
@fragment fn fs(v: VO) -> @location(0) vec4f {
  let q = v.q; let r = length(q);
  var m = ${shapeExpr};
  if (v.bk > 0.0) { m = mix(m, (1.0 - smoothstep(0.86, 1.0, r)) * (0.78 + 0.35 * smoothstep(0.55, 0.95, r)), v.bk); }
  let a = v.col.a * m;
  if (a < 0.002) { discard; }
  return vec4f(v.col.rgb * a, a);
}${studio ? `
// «Estudio»: each particle's shadow on the floor or the wall (the light → the particle → where that ray lands), soft splats
struct SO { @builtin(position) cpos: vec4f, @location(0) q: vec2f, @location(1) a: f32 };
@vertex fn svs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> SO {
  var o: SO;
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let cn = corners[vi]; o.q = cn; o.a = 0.0; o.cpos = vec4f(2.0, 2.0, 2.0, 1.0);
  let i = ii${cop > 1 ? ` / ${cop}u` : ''};
  let Pp = RS[i]; let V = Pp.vel;
  let age = Pp.pos.w; let life = V.w;
  if (age < 0.0 || age >= life) { return o; }
  ${GLOB}
  ${uniLets}
  let t = age / life; var pos = Pp.pos.xyz;${symW}
  ${VALUES}
  let Lp = vec3f(${studio.I.lx}, ${studio.I.ly}, ${studio.I.lz}); let d = pos - Lp;
  let FY = ${studio.I.floor}; let WZ = ${studio.I.wall}; var best = 1e9;
  if (d.y < -1e-4) { let k = (FY - Lp.y) / d.y; let q = Lp + d * k; if (k > 1.0 && q.z > WZ) { best = k; } }
  if (d.z < -1e-4) { let k = (WZ - Lp.z) / d.z; let q = Lp + d * k; if (k > 1.0 && k < best && q.y > FY) { best = k; } }
  if (best > 1e8) { return o; }
  let hp = Lp + d * best;
  let gap = length(d) * (best - 1.0);
  let sw = max(${OI.sway}, 0.0);
  let yaw = radians(${OI.yaw} + u_cam.x + (${OI.spin} + u_cam.w) * u_rtime + sw * sin(u_rtime * 0.37));
  let pitch = radians(clamp(${OI.pitch} + u_cam.y + sw * 0.45 * sin(u_rtime * 0.23 + 1.0), -89.0, 89.0));
  let cy = cos(yaw); let sy = sin(yaw); let cp = cos(pitch); let sp = sin(pitch);
  var cq = vec3f(cy * hp.x + sy * hp.z, hp.y, -sy * hp.x + cy * hp.z);
  cq = vec3f(cq.x, cp * cq.y - sp * cq.z, sp * cq.y + cp * cq.z);
  let dz = 2.5 * max(0.1, ${OI.dist} * u_cam.z) - cq.z;
  if (dz < 0.25) { return o; }
  let persp = 2.5 / dz;
  let core = max(1.5, max(0.0, ${LI.size}) * u_msize * persp * u_scale);
  let px = clamp(core + gap / max(length(d), 0.15) * (4.0 + 46.0 * clamp(${studio.I.soft}, 0.0, 1.0)) * persp * u_scale * 6.0, 1.0, u_maxpt);
  let fade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.8, 1.0, t));
  o.a = clamp(${LI.opacity}, 0.0, 1.0) * clamp(${studio.I.shadow}, 0.0, 1.0) * fade * min(1.0, 2.2 * core * core / (px * px));
  let res = U_.fl.zw;
  o.cpos = vec4f(cq.x * persp / u_aspect + cn.x * px / res.x, cq.y * persp + cn.y * px / res.y, 0.0, 1.0);
  return o;
}
@fragment fn sfs(v: SO) -> @location(0) vec4f { let r = dot(v.q, v.q); if (r > 1.0) { discard; } let k = 1.0 - r; return vec4f(v.a * k * k); }` : ''}`;
    return { sim, draw, slots, triggers, burst, count: +EP.count, copies: cop, blend: OP.blend, outId: out.id, emitId: emit.id, fluid,
      form, usesCam, camForce, imgColor, studioId: studio ? studio.id : 0 };
  }

  /* ── the fixed passes: trails, bloom, lens, grain, the canvas; and the fluid ── */
  const FULL = `struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn fvs(@builtin(vertex_index) i: u32) -> VO { var o: VO; let x = f32((i << 1u) & 2u); let y = f32(i & 2u); o.p = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0); o.uv = vec2f(x, y); return o; }`;
  const POST = `${FULL}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var img: texture_2d<f32>;
@group(0) @binding(2) var bloomT: texture_2d<f32>;
struct PU { a: vec4f, b: vec4f };   // a = bloom, grain, lens, seed · b = px.x, px.y (down) or dir.x, dir.y (blur), res.x, res.y
@group(0) @binding(3) var<uniform> pu: PU;
@fragment fn zero(v: VO) -> @location(0) vec4f { return vec4f(0.0); }
@fragment fn blit(v: VO) -> @location(0) vec4f { let c = textureSampleLevel(img, smp, v.uv, 0.0); let rgb = clamp(c.rgb, vec3f(0.0), vec3f(1.0)); return vec4f(rgb, max(clamp(c.a, 0.0, 1.0), max(rgb.r, max(rgb.g, rgb.b)))); }
@fragment fn down(v: VO) -> @location(0) vec4f {
  var c = vec3f(0.0);
  for (var i = 0; i < 4; i++) { let d = vec2f(select(1.0, -1.0, i % 2 == 0), select(1.0, -1.0, i < 2)) * pu.b.xy; c += textureSampleLevel(img, smp, v.uv + d, 0.0).rgb; }
  c *= 0.25; let m = max(c.r, max(c.g, c.b));
  return vec4f(c * (0.3 + 0.7 * smoothstep(0.12, 0.9, m)), 1.0);
}
@fragment fn blur(v: VO) -> @location(0) vec4f {
  let d = pu.b.xy;
  var c = textureSampleLevel(img, smp, v.uv, 0.0).rgb * 0.227;
  c += (textureSampleLevel(img, smp, v.uv + d * 1.385, 0.0).rgb + textureSampleLevel(img, smp, v.uv - d * 1.385, 0.0).rgb) * 0.316;
  c += (textureSampleLevel(img, smp, v.uv + d * 3.231, 0.0).rgb + textureSampleLevel(img, smp, v.uv - d * 3.231, 0.0).rgb) * 0.07;
  return vec4f(c, 1.0);
}
fn hash(p0: vec2f) -> f32 { var p = fract(p0 * vec2f(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
@fragment fn post(v: VO) -> @location(0) vec4f {
  let c = v.uv - 0.5; let r2 = dot(c, c); let lens = pu.a.z;
  let base = 0.5 + c * (1.0 - lens * 0.07 * r2); let ca = lens * 0.012 * r2;
  let g = textureSampleLevel(img, smp, base, 0.0);
  var col = vec3f(textureSampleLevel(img, smp, base + c * ca, 0.0).r, g.g, textureSampleLevel(img, smp, base - c * ca, 0.0).b);
  let bl = textureSampleLevel(bloomT, smp, base, 0.0).rgb * pu.a.x;
  col += bl;
  col *= 1.0 - lens * 0.4 * smoothstep(0.12, 0.55, r2);
  let lit = clamp(g.a + max(bl.r, max(bl.g, bl.b)), 0.0, 1.0);
  col += (hash(v.uv * pu.b.zw + pu.a.w) - 0.5) * pu.a.y * 0.22 * lit;
  let rgb = clamp(col, vec3f(0.0), vec3f(1.0));
  return vec4f(rgb, max(clamp(g.a, 0.0, 1.0), max(rgb.r, max(rgb.g, rgb.b))));
}`;
  // «Estudio»: the backdrop (floor, wall and the curve between them), the light with the particles' shadows, haze and the beam,
  // then the particles on top (the same as particles.js STUDIO_FS; here uv.y grows downwards)
  const STUDIO = `
struct SU { cam: vec4f, L: vec4f, lcol: vec4f, bg: vec4f, e: vec4f };   // cam = yaw, pitch, dist, aspect · L = light, power · lcol = colour, haze · bg = colour, beam · e = shadow, floor, wall, normal
@group(0) @binding(4) var shadowT: texture_2d<f32>;
@group(0) @binding(5) var<uniform> su: SU;
fn unrot(q: vec3f, cy: f32, sy: f32, cp: f32, sp: f32) -> vec3f { let v = vec3f(q.x, cp * q.y + sp * q.z, -sp * q.y + cp * q.z); return vec3f(cy * v.x - sy * v.z, v.y, sy * v.x + cy * v.z); }
@fragment fn studio(v: VO) -> @location(0) vec4f {
  let c = v.uv - 0.5; let r2 = dot(c, c); let lens = pu.a.z;
  let base = 0.5 + c * (1.0 - lens * 0.07 * r2); let ca = lens * 0.012 * r2;
  let nd = vec2f(base.x * 2.0 - 1.0, 1.0 - base.y * 2.0);
  let cy = cos(su.cam.x); let sy = sin(su.cam.x); let cp = cos(su.cam.y); let sp = sin(su.cam.y);
  let ro = unrot(vec3f(0.0, 0.0, su.cam.z), cy, sy, cp, sp); let rd = normalize(unrot(vec3f(nd.x * su.cam.w / 2.5, nd.y / 2.5, -1.0), cy, sy, cp, sp));
  let R = 0.9; let FY = su.e.y; let WZ = su.e.z; var th = 1e9; var n = vec3f(0.0);
  if (rd.y < 0.0) { let t = (FY - ro.y) / rd.y; let p = ro + rd * t; if (t > 0.0 && p.z >= WZ + R) { th = t; n = vec3f(0.0, 1.0, 0.0); } }
  if (rd.z < 0.0) { let t = (WZ - ro.z) / rd.z; let p = ro + rd * t; if (t > 0.0 && t < th && p.y >= FY + R) { th = t; n = vec3f(0.0, 0.0, 1.0); } }
  if (th > 1e8) {
    let o2 = vec2f(ro.y - (FY + R), ro.z - (WZ + R)); let d2 = rd.yz; let a = dot(d2, d2); let b = dot(o2, d2); let cc = dot(o2, o2) - R * R; let disc = b * b - a * cc;
    if (disc > 0.0 && a > 1e-6) { let t = (-b + sqrt(disc)) / a; let p = ro + rd * t; if (t > 0.0 && p.y <= FY + R + 1e-3 && p.z <= WZ + R + 1e-3) { th = t; n = normalize(vec3f(0.0, FY + R - p.y, WZ + R - p.z)); } }
  }
  let Lc = su.L.xyz; let power = su.L.w; let lcol = su.lcol.rgb; let haze = su.lcol.w; let bg = su.bg.rgb; let beam = su.bg.w;
  var scene = bg * 0.18;
  let sh = exp(-textureSampleLevel(shadowT, smp, base, 0.0).r * 2.5 * su.e.x);
  if (th < 1e8) {
    let p = ro + rd * th; let Lv = Lc - p; let dl = length(Lv);
    let lit = power * max(dot(n, Lv / dl), 0.0) / (1.0 + 0.35 * dl * dl);
    let spot = smoothstep(0.8, 0.95, -normalize(p - Lc).y) * beam;   // where the beam lands
    scene = bg * (0.22 + lit * lcol * 1.6 * sh) + lcol * spot * power * 0.3 * sh / (1.0 + 0.3 * dl * dl);
  } else { th = 30.0; }
  let vv = Lc - ro; let tc = dot(vv, rd); let hh = length(vv - rd * tc) + 0.06;
  let ins = (atan((th - tc) / hh) - atan(-tc / hh)) / hh;
  scene += lcol * ins * haze * power * 0.07;
  let dc = ro + rd * clamp(tc, 0.0, th) - Lc;
  let cone = smoothstep(0.8, 0.93, -normalize(dc).y);
  scene += lcol * ins * cone * exp(-max(0.0, -dc.y) * 0.45) * beam * power * 0.16;
  let g = textureSampleLevel(img, smp, base, 0.0);
  let pr = vec3f(textureSampleLevel(img, smp, base + c * ca, 0.0).r, g.g, textureSampleLevel(img, smp, base - c * ca, 0.0).b);
  var col = select(scene + pr, scene * (1.0 - clamp(g.a, 0.0, 1.0)) + pr, su.e.w > 0.5);
  col += textureSampleLevel(bloomT, smp, base, 0.0).rgb * pu.a.x;
  col *= 1.0 - lens * 0.4 * smoothstep(0.12, 0.55, r2);
  col += (hash(v.uv * pu.b.zw + pu.a.w) - 0.5) * pu.a.y * 0.12;
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}`;
  // «Fluido»: stable fluids on a grid of square cells with solid walls (velocity in screen units per second, a cell = 2 / H).
  // Each step: advect + stirring → vorticity (the curl) → vorticity confinement (keeps the eddies curling) → divergence →
  // pressure (Jacobi, warm-started) → projection (no divergence, walls closed)
  const FLUID = `
struct FU { a: vec4f, b: vec4f, c: vec4f, d: vec4f };   // a = W, H, dt, time · b = swirl, fade, stir, beatHit · c = ptr.x, ptr.y, ptr.vx, ptr.vy · d = ptrOn, bass, aspect, beat seed
@group(0) @binding(0) var<uniform> fu: FU;
@group(0) @binding(1) var<storage, read> vin: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> vout: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> div: array<f32>;
@group(0) @binding(4) var<storage, read> pin: array<f32>;
@group(0) @binding(5) var<storage, read_write> pout: array<f32>;
fn W() -> i32 { return i32(fu.a.x); }
fn H() -> i32 { return i32(fu.a.y); }
fn ix(x: i32, y: i32) -> i32 { return clamp(y, 0, H() - 1) * W() + clamp(x, 0, W() - 1); }
fn at(x: i32, y: i32) -> vec2f { return vin[ix(x, y)]; }
fn pat(x: i32, y: i32) -> f32 { return pin[ix(x, y)]; }
fn cat(x: i32, y: i32) -> f32 { return div[ix(x, y)]; }
fn wall(x: i32, y: i32) -> bool { return x <= 0 || y <= 0 || x >= W() - 1 || y >= H() - 1; }
fn sampleV(g: vec2f) -> vec2f { let i = vec2i(floor(g)); let f = fract(g); return mix(mix(at(i.x, i.y), at(i.x + 1, i.y), f.x), mix(at(i.x, i.y + 1), at(i.x + 1, i.y + 1), f.x), f.y); }
fn h2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn blob(p: vec2f, c: vec2f, r: f32) -> f32 { let d = p - c; return exp(-dot(d, d) / (r * r)); }
@compute @workgroup_size(8, 8) fn advect(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y); if (x >= W() || y >= H()) { return; }
  if (wall(x, y)) { vout[ix(x, y)] = vec2f(0.0); return; }
  let dt = fu.a.z; let fh = fu.a.y; let A = fu.d.z; let t = fu.a.w;
  // semi-Lagrangian: where was this water a moment ago (a cell is 2 / H screen units on both axes)
  var v = sampleV(vec2f(f32(x), f32(y)) - at(x, y) * dt * fh * 0.5 / 1.08);
  let p = vec2f(((f32(x) + 0.5) / fu.a.x * 2.0 - 1.0) * A, (f32(y) + 0.5) / fh * 2.0 - 1.0) * 1.08;
  // three slow «spoons» wander through the water and drag it along: wakes and pairs of eddies
  let sw = fu.b.x;
  for (var i = 0; i < 3; i++) {
    let fi = f32(i); let w1 = 0.11 + fi * 0.045; let w2 = 0.083 + fi * 0.037;
    let c = vec2f(A * 0.62 * sin(t * w1 + fi * 2.1), 0.62 * sin(t * w2 + fi * 4.3));
    let cv = vec2f(A * 0.62 * w1 * cos(t * w1 + fi * 2.1), 0.62 * w2 * cos(t * w2 + fi * 4.3));
    v = mix(v, cv * 9.0 * sw, clamp(dt * 6.0, 0.0, 1.0) * blob(p, c, 0.13) * min(sw, 1.0));
  }
  // the pointer drags the water like a finger
  if (fu.d.x > 0.5) { let pv = clamp(fu.c.zw, vec2f(-6.0), vec2f(6.0)); v = mix(v, pv, clamp(dt * 25.0, 0.0, 1.0) * blob(p, fu.c.xy, 0.09) * min(fu.b.z, 1.0)); }
  // each beat: a puff from a random spot (it rolls into two eddies)
  if (fu.b.w > 0.5) { let s = fu.d.w; let c = vec2f((h2(vec2f(s, 1.3)) * 1.4 - 0.7) * A, h2(vec2f(s, 7.1)) * 1.4 - 0.7); let an = h2(vec2f(s, 3.7)) * 6.2831853;
    v += vec2f(cos(an), sin(an)) * fu.b.z * 1.1 * blob(p, c, 0.1); }
  // the bass: a jet rising from the bottom (a plume, like smoke or warm water)
  v += vec2f(0.0, 1.0) * fu.d.y * fu.b.z * 6.0 * dt * blob(p, vec2f(sin(t * 0.21) * A * 0.4, -0.88), 0.12);
  vout[ix(x, y)] = v * exp(-fu.b.y * dt * 0.5);
}
@compute @workgroup_size(8, 8) fn vort(@builtin(global_invocation_id) id: vec3u) {   // the curl, in div (free until the divergence)
  let x = i32(id.x); let y = i32(id.y); if (x >= W() || y >= H()) { return; }
  div[ix(x, y)] = 0.5 * ((at(x + 1, y).y - at(x - 1, y).y) - (at(x, y + 1).x - at(x, y - 1).x));
}
@compute @workgroup_size(8, 8) fn confine(@builtin(global_invocation_id) id: vec3u) {   // pushes each eddy to keep spinning
  let x = i32(id.x); let y = i32(id.y); if (x >= W() || y >= H() || wall(x, y)) { return; }
  let w = cat(x, y);
  let g = vec2f(abs(cat(x + 1, y)) - abs(cat(x - 1, y)), abs(cat(x, y + 1)) - abs(cat(x, y - 1))) * 0.5;
  let n = g / (length(g) + 1e-5);
  vout[ix(x, y)] = vout[ix(x, y)] + vec2f(n.y, -n.x) * w * fu.b.x * 4.0 * fu.a.z;
}
@compute @workgroup_size(8, 8) fn divergence(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y); if (x >= W() || y >= H()) { return; }
  div[ix(x, y)] = 0.5 * ((at(x + 1, y).x - at(x - 1, y).x) + (at(x, y + 1).y - at(x, y - 1).y));
}
@compute @workgroup_size(8, 8) fn jacobi(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y); if (x >= W() || y >= H()) { return; }
  pout[ix(x, y)] = (pat(x - 1, y) + pat(x + 1, y) + pat(x, y - 1) + pat(x, y + 1) - div[ix(x, y)]) * 0.25;
}
@compute @workgroup_size(8, 8) fn project(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x); let y = i32(id.y); if (x >= W() || y >= H()) { return; }
  if (wall(x, y)) { vout[ix(x, y)] = vec2f(0.0); return; }
  vout[ix(x, y)] = at(x, y) - 0.5 * vec2f(pat(x + 1, y) - pat(x - 1, y), pat(x, y + 1) - pat(x, y - 1));
}`;

  /* ── start WebGPU (once per page) ── */
  async function init() {
    try {
      if (!navigator.gpu) { G.err = 'sin WebGPU'; return; }
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) { G.err = 'WebGPU sin placa'; return; }
      const want = 8388608 * 48;
      const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, want), maxBufferSize: Math.min(adapter.limits.maxBufferSize, want) } });
      G.maxCount = Math.floor(Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize) / 48);
      const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
      const ctx = canvas.getContext('webgpu'), format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: 'premultiplied' });
      const postMod = device.createShaderModule({ code: POST + STUDIO });
      const ci = await postMod.getCompilationInfo();
      if (ci.messages.some(m => m.type === 'error')) throw new Error('POST: ' + ci.messages.map(m => m.lineNum + ': ' + m.message).join(' · '));
      const fp = (entry, fmt, blend) => device.createRenderPipeline({ layout: 'auto', vertex: { module: postMod, entryPoint: 'fvs' }, fragment: { module: postMod, entryPoint: entry, targets: [{ format: fmt, ...(blend ? { blend } : {}) }] }, primitive: { topology: 'triangle-list' } });
      const fade = { color: { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' }, alpha: { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' } };
      Object.assign(G, {
        device, canvas, ctx, format, sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
        pFade: fp('zero', 'rgba16float', fade), pDown: fp('down', 'rgba16float'), pBlur: fp('blur', 'rgba16float'), pPost: fp('post', format), pBlit: fp('blit', format), pStudio: fp('studio', format),
        fluidMod: device.createShaderModule({ code: FLUID }), progs: new Map(),
        black: device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING }),
        white: device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }),
      });
      device.queue.writeTexture({ texture: G.white }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
      device.addEventListener('uncapturederror', e => { const m = String(e.error && e.error.message || e.error); if (!G.gpuErr || !/previous error/.test(m)) { if (m !== G.gpuErr) console.warn('PARTRUS WebGPU:', m); G.gpuErr = m; } });   // validation errors do not throw
      device.lost.then(i => { G.ready = false; G.err = 'se perdió la placa: ' + (i.message || ''); G.version++; });
      G.ready = true; G.version++;
    } catch (e) { G.err = String(e && e.message || e); G.ready = false; }
  }

  async function programsFor(code) {   // cached per WGSL source (the same system twice shares them)
    let e = G.progs.get(code.key);
    if (e) return e;
    const dev = G.device;
    const simMod = dev.createShaderModule({ code: code.sim }), drawMod = dev.createShaderModule({ code: code.draw });
    const errs = [];
    for (const [m, name] of [[simMod, 'sim'], [drawMod, 'draw']]) { const ci = await m.getCompilationInfo(); ci.messages.filter(x => x.type === 'error').forEach(x => errs.push(`${name} ${x.lineNum}: ${x.message}`)); }
    if (errs.length) throw new Error(errs.slice(0, 3).join(' · '));
    const target = code.blend === 'normal'
      ? { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } }
      : { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
    e = {
      init: dev.createComputePipeline({ layout: 'auto', compute: { module: simMod, entryPoint: 'init' } }),
      sim: dev.createComputePipeline({ layout: 'auto', compute: { module: simMod, entryPoint: 'sim' } }),
      draw: dev.createRenderPipeline({ layout: 'auto', vertex: { module: drawMod, entryPoint: 'vs' }, fragment: { module: drawMod, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: target }] }, primitive: { topology: 'triangle-list' } }),
      shadow: !code.studioId ? null : dev.createRenderPipeline({ layout: 'auto', vertex: { module: drawMod, entryPoint: 'svs' }, fragment: { module: drawMod, entryPoint: 'sfs',
        targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] }, primitive: { topology: 'triangle-list' } }),
    };
    G.progs.set(code.key, e);
    if (G.progs.size > 24) G.progs.delete(G.progs.keys().next().value);
    return e;
  }

  /* ── one system ── */
  function createSim() {
    const S = { err: '', comp: null, progs: null, key: '', json: null, obj: undefined, values: {}, cur: {}, np: 0, side: 0, state: null, last: null, clock: 0, rclock: 0,
      fno: 0, trig: {}, used: 0, uploaded: 0, mods: null, color: null, post: null, ownKey: null, pending: null, life: 3, trail0: 0, fluid: null,
      shape: {}, pts: null, img: null, mot: null, motVer: -1, shadow: null };
    const dev = () => G.device;
    function freeAll() {
      if (S.state) { S.state.destroy(); S.state = null; }
      if (S.color) { S.color.tex.destroy(); S.color = null; }
      if (S.post) { S.post.a.destroy(); S.post.b.destroy(); S.post = null; }
      if (S.fluid) { Object.values(S.fluid.bufs).forEach(b => b.destroy()); S.fluid = null; }
      if (S.pts) { S.pts.destroy(); S.pts = null; }
      if (S.img) { S.img.destroy(); S.img = null; }
      if (S.mot) { S.mot.destroy(); S.mot = null; }
      if (S.shadow) { S.shadow.tex.destroy(); S.shadow = null; }
      S.shape = {}; S.motVer = -1;
    }
    // uniforms: one buffer per system (the frame's globals and every knob)
    const UB = new Float32Array(HDR * 4 + MAX_SLOTS * 4), UBS = new Float32Array(UB.length);
    function setSpec(spec) {
      if (!G.ready) { S.err = 'WebGPU no está listo'; return false; }
      if (spec === S.obj) return !S.err;
      S.obj = spec;
      const json = typeof spec === 'string' ? spec : JSON.stringify(spec);
      if (json === S.json) return !S.err;
      const sys = sane(spec);
      S.json = json;
      if (!sys) { S.err = 'Sistema de partículas inválido'; return false; }
      S.spec = sys;
      const key = PP.structureKey(sys);
      if (key !== S.key) {
        try {
          const comp = compile(sys);
          comp.key = comp.sim + '\n/*draw*/\n' + comp.draw;
          S.comp = comp; S.key = key; S.err = ''; S.progs = null; S.shape = {}; S.binds = null;
          S.pending = programsFor(comp).then(p => { if (S.comp === comp) { S.progs = p; S.binds = null; } }, e => { if (S.comp === comp) S.err = String(e && e.message || e); });
          if (!S.state || S.np !== comp.count || (S.burst !== comp.burst)) {
            if (S.state) S.state.destroy();
            S.state = dev().createBuffer({ size: comp.count * 48, usage: GPUBufferUsage.STORAGE });
            S.np = comp.count; S.burst = comp.burst; S.last = null; S.binds = null;
          }
          if (!comp.fluid && S.fluid) { Object.values(S.fluid.bufs).forEach(b => b.destroy()); S.fluid = null; S.binds = null; }
        } catch (e) { S.err = String(e && e.message || e); S.key = key; return false; }
      }
      const v = {};
      for (const s of S.comp.slots) {
        if (s.trig) continue;
        const n = sys.nodes.find(x => x.id === s.node); if (!n) continue;
        const x = valueOf(n, s.k);
        v[s.name] = s.t === 'color' ? hexRgb(x) : +x;
      }
      S.values = v; S.cur = v;
      const out = sys.nodes.find(x => x.id === S.comp.outId);
      S.trail0 = out ? Math.max(0, Math.min(0.995, +valueOf(out, 'trail') || 0)) : 0;
      const em = sys.nodes.find(x => x.id === S.comp.emitId);
      S.life = em ? Math.max(0.2, Math.min(30, +valueOf(em, 'life') || 3)) : 3;
      const ek = em ? JSON.stringify([S.comp.slots.filter(s => s.node === em.id && !s.trig).map(s => v[s.name]), S.life]) : '';
      if (S.emKey !== undefined && ek !== S.emKey && S.last !== null && !S.comp.burst) S.wantInit = true;
      S.emKey = ek;
      return !S.err;
    }
    function fire(mode, beat, bass, now) {
      const t = S.trig[mode] || (S.trig[mode] = { k: null, bass: 0, at: -1 });
      let hit = false;
      if (mode === 'bass') { hit = bass > 0.5 && t.bass <= 0.5 && now - t.at > 0.12; t.bass = bass; if (hit) t.at = now; }
      else { const k = Math.floor(beat / (mode === 'bar' ? 4 : mode === '2' ? 2 : 1)); hit = t.k !== null && k !== t.k; t.k = k; }
      return hit;
    }
    function writeUniforms(dt, time, beat, aspect, trigs, w, h, init) {
      const M = S.mods || {};
      const num = (x, d) => (Number.isFinite(+x) && x !== undefined && x !== null ? +x : d);
      UB.fill(0);
      UB.set([dt, time, beat, aspect], 0);
      UB.set([S.fno, trigs.u_burst ? 1 : 0, trigs.u_kick ? 1 : 0, Math.max(0, num(M.size, 1))], 4);
      UB.set([num(M.hue, 0), Math.max(0, num(M.glow, 1)), S.rclock || 0, h / 720], 8);
      UB.set([S.maxpt || 256, init ? S.life : 0, S.np, 0], 12);
      UB.set([num(M.yaw, 0), num(M.pitch, 0), Math.max(0.1, num(M.zoom, 1)), num(M.spin, 0)], 16);
      const a = S.audio || [0, 0, 0, 0]; UB.set([a[0] || 0, a[1] || 0, a[2] || 0, a[3] || 0], 20);
      const pt = M.ptr; UB.set([pt ? +pt[0] || 0 : 0, pt ? +pt[1] || 0 : 0, pt && pt[2] ? 1 : 0, 0], 24);
      UB.set([S.fluid ? S.fluid.W : 1, S.fluid ? S.fluid.H : 1, w, h], 28);
      const sh = S.shape; UB.set([sh.n || 0, sh.asp || 1, sh.jit ? sh.jit[0] : 0, sh.jit ? sh.jit[1] : 0], 32);
      for (const s of S.comp.slots) {
        const o = HDR * 4 + s.i * 4;
        if (s.trig) { UB[o] = trigs[s.name] ? 1 : 0; continue; }
        const x = S.cur[s.name];
        if (Array.isArray(x)) UB.set(x, o); else UB[o] = +x || 0;
      }
    }
    function binds() {
      if (S.binds) return S.binds;
      const d = dev(), p = S.progs;
      if (!S.ubuf) S.ubuf = d.createBuffer({ size: UB.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const c = S.comp, extra = [], dextra = [];   // 'auto' layouts: exactly what each entry point uses
      if (S.fluid) extra.push({ binding: 2, resource: { buffer: S.fluid.bufs.v0 } });
      if (c.form) extra.push({ binding: 3, resource: { buffer: S.pts } });
      if (c.camForce) extra.push({ binding: 4, resource: S.mot.createView() }, { binding: 5, resource: G.sampler });
      if (c.imgColor) dextra.push({ binding: 5, resource: G.sampler }, { binding: 6, resource: (S.img || G.white).createView() });
      const base = ub => [{ binding: 0, resource: { buffer: S.state } }, { binding: 1, resource: { buffer: ub } }];
      if (p.shadow && !S.ubufS) S.ubufS = d.createBuffer({ size: UB.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      S.binds = {
        init: d.createBindGroup({ layout: p.init.getBindGroupLayout(0), entries: base(S.ubuf) }),
        sim: d.createBindGroup({ layout: p.sim.getBindGroupLayout(0), entries: [...base(S.ubuf), ...extra] }),
        draw: d.createBindGroup({ layout: p.draw.getBindGroupLayout(0), entries: [...base(S.ubuf), ...dextra] }),
        shadow: p.shadow ? d.createBindGroup({ layout: p.shadow.getBindGroupLayout(0), entries: base(S.ubufS) }) : null,
      };
      return S.binds;
    }
    /* a «form» emitter's points (a storage buffer), the picture its colours come from, the camera's motion map */
    const SH = PP._shape;
    function ensurePts() { if (!S.pts) { S.pts = dev().createBuffer({ size: SH.MAXP * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); S.binds = null; } }
    function putPts(shp) { const n = Math.min(SH.MAXP, shp.n || 0); if (n) dev().queue.writeBuffer(S.pts, 0, shp.uv, 0, n * 2); }
    function putImg(cv) {
      let src = cv; const mx = Math.min(4096, dev().limits.maxTextureDimension2D);
      if (cv.width > mx || cv.height > mx) {   // a huge picture: only its colours are needed, smaller is fine
        const k = mx / Math.max(cv.width, cv.height); src = document.createElement('canvas');
        src.width = Math.max(1, Math.round(cv.width * k)); src.height = Math.max(1, Math.round(cv.height * k));
        src.getContext('2d').drawImage(cv, 0, 0, src.width, src.height);
      }
      if (!S.img || S.img.width !== src.width || S.img.height !== src.height) {
        if (S.img) S.img.destroy();
        S.img = dev().createTexture({ size: [src.width, src.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        S.binds = null;
      }
      dev().queue.copyExternalImageToTexture({ source: src }, { texture: S.img }, [src.width, src.height]);
    }
    function prepShape() {
      const c = S.comp;
      if (c.usesCam) {
        if (!S.mot) { S.mot = dev().createTexture({ size: [SH.CAM_W, SH.CAM_H], format: 'rg8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }); S.binds = null; }
        SH.camTick();
        const C = SH.cam;
        if (C && C.st === 'ok' && C.ver !== S.motVer && !SH.camData.first) {
          dev().queue.writeTexture({ texture: S.mot }, SH.camData.rg, { bytesPerRow: SH.CAM_W * 2 }, [SH.CAM_W, SH.CAM_H]);
          S.motVer = C.ver;
        }
      }
      if (!c.form) { S.shape = {}; return; }
      ensurePts();
      const em = S.spec.nodes.find(x => x.id === c.emitId), src = paramOf(em, 'src');
      if (src === 'camera') {
        const C = SH.cam, mode = paramOf(em, 'cam'), ver = C ? C.ver : 0;
        if (S.shape.kind !== 'cam' || S.shape.mode !== mode || S.shape.ver !== ver) {
          const pts = C ? SH.camPoints(mode) : { n: 0 };
          putPts(pts);
          S.shape = { kind: 'cam', mode, ver, n: pts.n, asp: 16 / 9, jit: [1 / SH.CAM_W, 1 / SH.CAM_H] };
          if (c.imgColor && SH.camData.cv) putImg(SH.camData.cv);
        }
        return;
      }
      // NODRUS can put its own text or picture on a system (the node's text field / a dropped PNG)
      const M = S.mods || {}, txt = typeof M.text === 'string' && M.text.trim() ? M.text : paramOf(em, 'text'), img = M.img || paramOf(em, 'img');
      const key = src === 'image' ? 'i' + paramOf(em, 'pick') + img : 't' + paramOf(em, 'font') + '|' + txt;
      if (S.shape.key === key && S.shape.ready) return;
      const shp = src === 'image' ? SH.imageShape(img, paramOf(em, 'pick')) : SH.textShape(txt, paramOf(em, 'font'));
      S.shape = { kind: 'pic', key, ready: shp.ready, n: shp.ready ? shp.n || 0 : 0, asp: shp.asp || 1, jit: shp.jit || [0, 0] };
      if (shp.ready && shp.canvas) { putPts(shp); if (c.imgColor) putImg(shp.canvas); }
    }
    function ensureFluid(aspect) {
      const W = Math.round(Math.min(256, Math.max(64, 128 * aspect))), H = 128;
      if (S.fluid && S.fluid.W === W) return;
      if (S.fluid) Object.values(S.fluid.bufs).forEach(b => b.destroy());
      const d = dev(), n = W * H, mk = sz => d.createBuffer({ size: sz, usage: GPUBufferUsage.STORAGE });
      const bufs = { v0: mk(n * 8), v1: mk(n * 8), div: mk(n * 4), p0: mk(n * 4), p1: mk(n * 4), u: d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }) };
      const pl = e => G['f_' + e] || (G['f_' + e] = d.createComputePipeline({ layout: 'auto', compute: { module: G.fluidMod, entryPoint: e } }));
      const bg = (e, vin, vout, pin, pout) => {
        const p = pl(e), L = p.getBindGroupLayout(0), all = [{ binding: 0, resource: { buffer: bufs.u } }, { binding: 1, resource: { buffer: vin } }, { binding: 2, resource: { buffer: vout } }, { binding: 3, resource: { buffer: bufs.div } }, { binding: 4, resource: { buffer: pin } }, { binding: 5, resource: { buffer: pout } }];
        // 'auto' layouts only keep what the entry point uses
        const used = { advect: [0, 1, 2], vort: [0, 1, 3], confine: [0, 2, 3], divergence: [0, 1, 3], jacobi: [0, 3, 4, 5], project: [0, 1, 2, 4] }[e];
        return { p, g: d.createBindGroup({ layout: L, entries: all.filter(x => used.includes(x.binding)) }) };
      };
      S.fluid = { W, H, bufs, steps: {
        // v0 → advect → v1 → curl, confinement (in place) → divergence → pressure (p0, kept from the last step) → project → v0
        advect: bg('advect', bufs.v0, bufs.v1, bufs.p0, bufs.p1),
        vort: bg('vort', bufs.v1, bufs.v0, bufs.p0, bufs.p1),
        confine: bg('confine', bufs.v0, bufs.v1, bufs.p0, bufs.p1),
        divergence: bg('divergence', bufs.v1, bufs.v0, bufs.p0, bufs.p1),
        jacobiA: bg('jacobi', bufs.v1, bufs.v0, bufs.p0, bufs.p1), jacobiB: bg('jacobi', bufs.v1, bufs.v0, bufs.p1, bufs.p0),
        project: bg('project', bufs.v1, bufs.v0, bufs.p0, bufs.p1),
      }, last: null };
      S.binds = null;
    }
    function fluidStep(enc, dt, time, beat, aspect, trigs) {
      const F = S.fluid, I = S.comp.fluid.I, M = S.mods || {};
      const k = n => { const v = typeof n === 'string' && n.startsWith('u') ? S.cur[n] : NaN; return Number.isFinite(+v) ? +v : 0; };
      const pt = M.ptr && M.ptr[2] ? M.ptr : null, lp = F.last;
      const pvx = pt && lp ? (pt[0] - lp[0]) / Math.max(dt, 1e-3) : 0, pvy = pt && lp ? (pt[1] - lp[1]) / Math.max(dt, 1e-3) : 0;
      F.last = pt ? [pt[0], pt[1]] : null;
      const a = S.audio || [0, 0, 0, 0];
      const beatHit = (S.comp.fluid.P.with === 'beat' || S.comp.fluid.P.with === 'all') && trigs.__fluidBeat ? 1 : 0;
      const bass = (S.comp.fluid.P.with === 'bass' || S.comp.fluid.P.with === 'all') ? (a[1] || 0) : 0;
      if (beatHit) F.seed = ((F.seed || 0) + 1) % 4096;
      const u = new Float32Array([F.W, F.H, dt, time, k(I.swirl), k(I.fade), k(I.stir), beatHit, pt ? pt[0] : 0, pt ? pt[1] : 0, pvx, pvy, pt ? 1 : 0, bass, aspect, (F.seed || 0) + 0.5]);
      dev().queue.writeBuffer(F.bufs.u, 0, u);
      const wg = [Math.ceil(F.W / 8), Math.ceil(F.H / 8)];
      const run = (st) => { const cp = enc.beginComputePass(); cp.setPipeline(st.p); cp.setBindGroup(0, st.g); cp.dispatchWorkgroups(wg[0], wg[1]); cp.end(); };
      run(F.steps.advect); run(F.steps.vort); run(F.steps.confine); run(F.steps.divergence);
      for (let i = 0; i < 60; i++) run(i % 2 ? F.steps.jacobiB : F.steps.jacobiA);   // an even count: the pressure ends in p0
      run(F.steps.project);
    }
    function ensureColor(w, h) {
      if (S.color && S.color.w === w && S.color.h === h) return;
      if (S.color) S.color.tex.destroy();
      const tex = dev().createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      S.color = { w, h, tex, view: tex.createView(), fresh: true };
      if (S.post) { S.post.a.destroy(); S.post.b.destroy(); S.post = null; }
    }
    function outKnob(k) { const v = S.cur && S.cur[`u${S.comp.outId}_${k}`]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
    const PUB = new Float32Array(8);
    function postBind(pipe, img, bloom, ub) {
      return dev().createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: G.sampler }, { binding: 1, resource: img }, { binding: 2, resource: bloom }, { binding: 3, resource: { buffer: ub } }]
        .filter(e => !(pipe === G.pBlit && e.binding > 1) && !((pipe === G.pDown || pipe === G.pBlur) && e.binding === 2)) });
    }
    function frame(time, audio, beat, w, h, mods) {
      S.used = performance.now();
      if (!G.ready || !S.comp || !S.state) return null;
      if (!S.progs) return S.shownOnce ? G.canvas : null;   // the shaders are being compiled (a moment): keep the last picture
      // the board is still on the last frame: don't pile up more work (with millions of big particles that froze the computer
      // and Windows reset the video driver: the screen flashed like a strobe); the last picture stays (same «uploaded»)
      if (S.busy && performance.now() - S.busyAt < 2000) return S.shownOnce ? G.canvas : null;
      const d = dev();
      S.audio = audio || [0, 0, 0, 0]; beat = beat || 0;
      const M = (S.mods = mods || {});
      h = Math.max(2, Math.min(2560, Math.round(h))); w = Math.max(2, Math.min(2560, Math.round(w)));
      const aspect = w / h;
      if (M.pub) { let cur = null; for (const k in M.pub) if (k in S.values && Number.isFinite(M.pub[k])) { cur = cur || Object.assign({}, S.values); cur[k] = M.pub[k]; } S.cur = cur || S.values; } else S.cur = S.values;
      if (S.comp.fluid) ensureFluid(aspect);
      prepShape();
      if (S.wantInit && S.last !== null) { const now = performance.now(); if (!(now - (S.initAt || 0) < 120)) { S.wantInit = false; S.initAt = now; S.last = null; S.quick = true; } }
      const B = binds();
      // how big a particle may get, in pixels: less with millions of them, and less again while the board can't keep up
      S.fill = S.fill || 1;
      S.maxpt = Math.max(6, 256 * Math.min(1, Math.sqrt(1048576 / Math.max(1, S.np))) * S.fill);
      const submitSim = (dt, t, trigs) => {
        S.fno = (S.fno + 1) % 16777216;
        writeUniforms(dt, t, beat, aspect, trigs, w, h, false);
        d.queue.writeBuffer(S.ubuf, 0, UB);
        const enc = d.createCommandEncoder();
        if (S.fluid) fluidStep(enc, dt, t, beat, aspect, trigs);
        const cp = enc.beginComputePass(); cp.setPipeline(S.progs.sim); cp.setBindGroup(0, B.sim); cp.dispatchWorkgroups(Math.ceil(S.np / 256)); cp.end();
        d.queue.submit([enc.finish()]);
      };
      let dt;
      if (S.last === null) {   // start: everyone born at different moments, then a warm-up so it starts full
        writeUniforms(0, S.clock, beat, aspect, {}, w, h, true); d.queue.writeBuffer(S.ubuf, 0, UB);
        const enc = d.createCommandEncoder(); const cp = enc.beginComputePass(); cp.setPipeline(S.progs.init); cp.setBindGroup(0, B.init); cp.dispatchWorkgroups(Math.ceil(S.np / 256)); cp.end(); d.queue.submit([enc.finish()]);
        if (!S.comp.burst) {
          const steps = Math.max(1, Math.min(S.quick ? 24 : S.comp.fluid ? 40 : 250, Math.round(S.life * 30), Math.floor((S.quick ? 6e6 : 4e7) / S.np)));   // the fluid costs ~66 passes a step: a shorter warm-up
          const sdt = Math.min(0.1, (S.life * 1.05) / steps);
          for (let i = 0; i < steps; i++) submitSim(sdt, S.clock - (steps - i) * sdt, {});
        }
        S.quick = false;
        if (S.color) S.color.fresh = true;
        dt = 1 / 60;
      } else dt = time - S.last;
      if (dt < 0 || dt > 1) dt = 1 / 60;
      S.last = time;
      ensureColor(w, h);
      if (dt > 0) {
        S.rclock = (S.rclock || 0) + dt;
        const sp = Math.max(0, Math.min(8, Number.isFinite(+M.speed) && M.speed !== undefined ? +M.speed : 1)), sdt = dt * sp;
        const trigs = {};
        S.comp.triggers.forEach(tr => { if (fire(tr.mode, beat, S.audio[1] || 0, time)) trigs[tr.u] = true; });
        if (S.comp.fluid && fire('beat_f', beat, 0, time)) trigs.__fluidBeat = true;
        const kicks = PP._kicks || new Map();
        const kn = kicks.get(S.ownKey) || 0, ka = kicks.get('*') || 0, boom = +M.boom || 0;
        if (S.kn === undefined) { S.kn = kn; S.ka = ka; }
        if (kn !== S.kn || ka !== S.ka || S.kreq || (boom >= 0.5 && !(S.boom >= 0.5))) { trigs.u_kick = true; if (S.comp.burst) trigs.u_burst = true; }
        S.kn = kn; S.ka = ka; S.kreq = 0; S.boom = boom;
        if (sdt > 0) {
          const n = sdt > 1 / 25 ? Math.min(4, Math.ceil(sdt * 30)) : 1;
          for (let i = 0; i < n; i++) submitSim(sdt / n, S.clock + (i + 1) * sdt / n, i === 0 ? trigs : {});
          S.clock += sdt;
        }
      }
      // draw: fade the trails (or clear), then the particles
      writeUniforms(dt, S.clock, beat, aspect, {}, w, h, false); d.queue.writeBuffer(S.ubuf, 0, UB);
      const trail = 1 - (1 - S.trail0) * (1 - Math.max(0, Math.min(0.98, +M.trail || 0)));
      const enc = d.createCommandEncoder();
      const clear = S.color.fresh || !(trail > 0);
      if (!clear) {
        const fp = enc.beginRenderPass({ colorAttachments: [{ view: S.color.view, loadOp: 'load', storeOp: 'store' }] });
        fp.setPipeline(G.pFade); const k = dt > 0 ? Math.pow(trail, dt * 60) : 1; fp.setBlendConstant([k, k, k, k]); fp.draw(3); fp.end();
      }
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: S.color.view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      // at most ~16 million quads a frame (4 million particles × 24 «Simetría» copies would be 100 million): past that, a subset
      const inst = Math.min(S.np * S.comp.copies, Math.floor(16777216 / S.comp.copies) * S.comp.copies);
      rp.setPipeline(S.progs.draw); rp.setBindGroup(0, B.draw); rp.draw(6, inst); rp.end();
      S.color.fresh = false;
      // «Estudio»: the shadows, at half size (they are soft anyway), fresh every frame
      if (S.progs.shadow) {
        const w2 = Math.max(2, Math.round(w / 2)), h2 = Math.max(2, Math.round(h / 2));
        if (!S.shadow || S.shadow.w !== w2 || S.shadow.h !== h2) {
          if (S.shadow) S.shadow.tex.destroy();
          const tex = d.createTexture({ size: [w2, h2], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          S.shadow = { w: w2, h: h2, tex, view: tex.createView() };
        }
        UBS.set(UB); UBS[11] = h2 / 720; UBS[30] = w2; UBS[31] = h2;   // the same uniforms at half size
        d.queue.writeBuffer(S.ubufS, 0, UBS);
        const sp = enc.beginRenderPass({ colorAttachments: [{ view: S.shadow.view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
        sp.setPipeline(S.progs.shadow); sp.setBindGroup(0, B.shadow); sp.draw(6, inst); sp.end();
      }
      // to the shared canvas (with bloom, lens and grain when the Salida asks)
      if (G.canvas.width !== w || G.canvas.height !== h) { G.canvas.width = w; G.canvas.height = h; }
      const view = G.ctx.getCurrentTexture().createView();
      const bk = Math.max(0, Math.min(2, outKnob('bloom'))), grain = Math.max(0, Math.min(1, outKnob('grain'))), lens = Math.max(0, Math.min(1, outKnob('lens')));
      if (!S.pub) S.pub = { b0: d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), b1: d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), b2: d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), b3: d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }) };
      const fullPass = (pipe, target, bindG) => { const p = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] }); p.setPipeline(pipe); p.setBindGroup(0, bindG); p.draw(3); p.end(); };
      const studio = !!(S.comp.studioId && S.progs.shadow && S.shadow);
      if (studio || bk > 0.001 || grain > 0.001 || lens > 0.001) {
        let bloomView = G.black.createView();
        if (bk > 0.001) {
          const qw = Math.max(2, Math.round(w / 4)), qh = Math.max(2, Math.round(h / 4));
          if (!S.post || S.post.w !== qw || S.post.h !== qh) {
            if (S.post) { S.post.a.destroy(); S.post.b.destroy(); }
            const mk = () => d.createTexture({ size: [qw, qh], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
            const a = mk(), b = mk(); S.post = { w: qw, h: qh, a, b, av: a.createView(), bv: b.createView() };
          }
          const Q = S.post;
          d.queue.writeBuffer(S.pub.b0, 0, new Float32Array([0, 0, 0, 0, 1.5 / w, 1.5 / h, w, h]));
          fullPass(G.pDown, Q.av, postBind(G.pDown, S.color.view, null, S.pub.b0));
          // two rounds of blur, each with its own direction buffer (the writes land before the commands run)
          d.queue.writeBuffer(S.pub.b1, 0, new Float32Array([0, 0, 0, 0, 1 / qw, 0, w, h]));
          d.queue.writeBuffer(S.pub.b2, 0, new Float32Array([0, 0, 0, 0, 0, 1 / qh, w, h]));
          fullPass(G.pBlur, Q.bv, postBind(G.pBlur, Q.av, null, S.pub.b1));
          fullPass(G.pBlur, Q.av, postBind(G.pBlur, Q.bv, null, S.pub.b2));
          bloomView = Q.av;
        }
        d.queue.writeBuffer(S.pub.b3, 0, new Float32Array([bk * (studio ? 1.0 : 1.6), grain, lens, (S.fno % 997) * 1.37, 0, 0, w, h]));
        if (studio) {   // the same camera as the particles (knobs, NODRUS macros, «gira sola», «vaivén»)
          const nm = (x, df) => (Number.isFinite(+x) && x !== undefined && x !== null ? +x : df);
          const kv = (id, k, df) => { const v = S.cur && S.cur[`u${id}_${k}`]; return v !== undefined ? v : df; };
          const o = k => +kv(S.comp.outId, k, 0) || 0, rt = S.rclock || 0, sw = Math.max(0, o('sway'));
          const yaw = (o('yaw') + nm(M.yaw, 0) + (o('spin') + nm(M.spin, 0)) * rt + sw * Math.sin(rt * 0.37)) * Math.PI / 180;
          const pitch = Math.max(-89, Math.min(89, o('pitch') + nm(M.pitch, 0) + sw * 0.45 * Math.sin(rt * 0.23 + 1))) * Math.PI / 180;
          const dist = 2.5 * Math.max(0.1, (+kv(S.comp.outId, 'dist', 1) || 1) * Math.max(0.1, nm(M.zoom, 1)));
          const st = k => +kv(S.comp.studioId, k, 0) || 0, col = (k, df) => { const v = kv(S.comp.studioId, k, df); return Array.isArray(v) ? v : df; };
          const lc = col('lcol', [1, 0.82, 0.6]), bg = col('bg', [0.23, 0.23, 0.26]);
          if (!S.sub) S.sub = d.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
          d.queue.writeBuffer(S.sub, 0, new Float32Array([yaw, pitch, dist, w / h, st('lx'), st('ly'), st('lz'), Math.max(0, st('power')),
            lc[0], lc[1], lc[2], Math.max(0, st('haze')), bg[0], bg[1], bg[2], Math.max(0, st('beam')),
            Math.max(0, st('shadow')), st('floor'), st('wall'), S.comp.blend === 'normal' ? 1 : 0]));
          const g = d.createBindGroup({ layout: G.pStudio.getBindGroupLayout(0), entries: [{ binding: 0, resource: G.sampler }, { binding: 1, resource: S.color.view }, { binding: 2, resource: bloomView },
            { binding: 3, resource: { buffer: S.pub.b3 } }, { binding: 4, resource: S.shadow.view }, { binding: 5, resource: { buffer: S.sub } }] });
          fullPass(G.pStudio, view, g);
        } else fullPass(G.pPost, view, postBind(G.pPost, S.color.view, bloomView, S.pub.b3));
      } else fullPass(G.pBlit, view, postBind(G.pBlit, S.color.view, null, S.pub.b3));
      d.queue.submit([enc.finish()]);
      S.uploaded++; S.shownOnce = true;
      const t0 = performance.now(); S.busy = true; S.busyAt = t0;
      d.queue.onSubmittedWorkDone().then(() => {
        S.busy = false; const ms = performance.now() - t0; S.gpuMs = ms;
        if (ms > 45) S.fill = Math.max(0.05, S.fill * 0.8); else if (ms < 20) S.fill = Math.min(1, S.fill * 1.03);
      }, () => { S.busy = false; });
      return G.canvas;
    }
    Object.assign(S, { setSpec, frame, reset() { S.last = null; S.trig = {}; }, kick() { S.kreq = 1; }, free() { freeAll(); if (S.ubuf) S.ubuf.destroy(); if (S.ubufS) S.ubufS.destroy(); if (S.sub) S.sub.destroy(); }, engine: 'webgpu' });
    Object.defineProperty(S, 'count', { get: () => (S.comp ? S.comp.count : 0) });   // S.np: the buffer's particles
    return S;
  }

  window.PudrusParticlesGPU = { get ready() { return G.ready; }, get version() { return G.version; }, get err() { return G.err; }, get canvas() { return G.canvas; }, get maxCount() { return G.maxCount; }, get gpuErr() { return G.gpuErr || ''; }, supports, createSim, compile, init: () => G.initP };
  G.initP = init();
})();
