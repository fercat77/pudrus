/*
 * PUDRUS Nodes — core shared by the editor and the output window
 * ---------------------------------------------------------------
 * - NODES: node types. Each one is a small piece of GLSL.
 * - compile(graph): walks back from the Output node and builds one fragment shader.
 *   Unconnected number/color inputs become uniforms (u_<node>_<input>), so moving a
 *   value never recompiles; only connections and option menus do.
 * - createRenderer(canvas): WebGL1 renderer with feedback (previous frame) and a
 *   post pass (RGB split, scanlines, vignette, grain).
 *
 * Socket types: 'float' (number), 'vec2' (coordinates), 'color' (vec3).
 * Any type converts to any other when linked.
 */
(function () {
  const GLSL_TYPE = { float: 'float', vec2: 'vec2', color: 'vec3' };

  function convert(expr, from, to) {
    if (from === to) return expr;
    if (to === 'float') return from === 'color' ? `dot(${expr}, vec3(0.299, 0.587, 0.114))` : `(${expr}).x`;
    if (to === 'color') return from === 'float' ? `vec3(${expr})` : `vec3(${expr}, 0.5)`;
    return from === 'float' ? `vec2(${expr})` : `(${expr}).xy`;   // to vec2
  }

  /* ── GLSL helpers available to every node ───────────────── */
  const LIB = `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash22(vec2 p){ float n = hash21(p); return vec2(n, hash21(p + n)); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p, float oct){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++){ if (float(i) >= oct) break; v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v / max(0.5, 1.0 - pow(0.5, max(1.0, oct)));
}
vec2 voronoi(vec2 p){
  vec2 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 o = vec2(float(x), float(y)); vec2 r = o + hash22(g + o) - f; float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2));
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 hsv2rgb(vec3 c){ vec3 k = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return c.z * mix(vec3(1.0), k, c.y); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 cosPal(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b * cos(6.28318 * (c * t + d)); }
`;

  /* ── Node types ─────────────────────────────────────────── */
  // inputs: { k, t, label, v (default), min, max, step }   (float & color get widgets when unconnected)
  // params: { k, label, options: [[value, label]], v }       (option menus; changing them recompiles)
  // post:   { k, label, v, min, max }                        (Output node only: values for the post pass)
  // glsl(I, O, P, id) -> statements. I = input expressions, O = output variable names, P = params
  const F = (k, label, v, min, max, step) => ({ k, t: 'float', label, v, min, max, step });
  const UV = { k: 'uv', t: 'vec2', label: 'Coordenadas' };
  const COL = (k, label, v) => ({ k, t: 'color', label, v });

  // sample a picture (logo / text) centred on the coordinates, `size` = its height on screen
  const texGLSL = (I, O, P, id, tint) => {
    const q = `_q${id}`, t = `_t${id}`;
    return `vec2 ${q} = ${I.uv} / max(${I.size}, 1e-3); ${q}.x /= u_${id}_aspect; ${q} = ${q} * vec2(1.0, -1.0) + 0.5;` +
      (P.mirror === 'yes' ? ` ${q}.x = 1.0 - ${q}.x;` : '') +
      (P.repeat === 'yes' ? ` ${q} = fract(${q});` : '') +
      ` vec4 ${t} = texture2D(u_${id}_tex, ${q}) * step(0.0, ${q}.x) * step(${q}.x, 1.0) * step(0.0, ${q}.y) * step(${q}.y, 1.0);` +
      ` vec3 ${O.c} = ${tint ? `${tint} * ` : ''}${t}.rgb; float ${O.a} = ${t}.a * ${I.opacity};`;
  };

  // WebGL 2 when available: shaders compile as GLSL ES 3.00 (while loops, uint, texelFetch, inverse()…)
  const ES3 = (() => {
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2');
      if (!gl) return false;
      const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
      return true;
    } catch (e) { return false; }
  })();
  const glContext = (canvas, attrs) => (ES3 ? canvas.getContext('webgl2', attrs) : null) || canvas.getContext('webgl', attrs);

  /* ── Code node (GLSL / Shadertoy) ─────────────────────────── */
  const LIB_NAMES = ['hash21', 'hash22', 'vnoise', 'fbm', 'voronoi', 'rot', 'hsv2rgb', 'rgb2hsv', 'cosPal'];
  const REDEF_BUILTINS = ['round', 'roundEven', 'trunc', 'sign', 'inverse', 'transpose', 'determinant', 'isnan', 'isinf', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'outerProduct'];
  // Shadertoy names, the 4 knobs and iChannel0 = this patch's feedback buffer
  const TOY_HEAD = `#define iTime u_time
#define iResolution vec3(u_res, 1.0)
#define iMouse vec4(0.0)
#define iFrame int(u_time * 60.0)
#define iTimeDelta 0.0166
#define iDate vec4(0.0)
#define iChannel0 u_prev
${ES3 ? '' : '#define texture texture2D'}
float knob1; float knob2; float knob3; float knob4;
uniform sampler2D u_to;
#define iChannel1 u_to`;
  const GLSL_TEMPLATES = {
    effect: `// effect(...) devuelve un color para cada punto.
// uv: coordenadas (centro = 0, alto = 1) · col: color de la entrada
// k1..k4: perillas 0–1 (asignalas al celular o MIDI) · iTime: tiempo
vec3 effect(vec2 uv, vec3 col, float k1, float k2, float k3, float k4) {
  float r = length(uv), a = atan(uv.y, uv.x);
  float w = sin(r * (8.0 + k1 * 40.0) - iTime * (1.0 + k2 * 4.0) + a * floor(1.0 + k3 * 8.0));
  vec3 c = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + r + k4 + iTime * 0.05));
  return mix(col, c, smoothstep(-0.2, 0.2, w));
}`,
    toy: `// Pegá acá un shader de Shadertoy (con mainImage) tal cual.
// iTime, iResolution, iMouse y iFrame funcionan; iChannel0 es el feedback de este patch.
// knob1..knob4 son las perillas del nodo (0–1).
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx * (1.0 + knob1 * 6.0) + vec3(0.0, 2.0, 4.0));
  fragColor = vec4(col, 1.0);
}`,
    ray: `// Raymarching 3D a mano: una escena hecha con distancias (SDF).
float sdScene(vec3 p, float k1) {
  p.xz *= mat2(cos(iTime * 0.5), -sin(iTime * 0.5), sin(iTime * 0.5), cos(iTime * 0.5));
  vec3 q = abs(p) - vec3(0.6);
  float box = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  float ball = length(p) - (0.7 + k1 * 0.15);
  return max(box, -ball);   // cubo con una esfera restada (queda el armazón)
}
vec3 effect(vec2 uv, vec3 col, float k1, float k2, float k3, float k4) {
  vec3 ro = vec3(0.0, 0.0, 3.0), rd = normalize(vec3(uv, -1.5));
  float t = 0.0;
  for (int i = 0; i < 80; i++) { float h = sdScene(ro + rd * t, k1); if (h < 0.001 || t > 20.0) break; t += h; }
  if (t > 20.0) return col;
  vec3 p = ro + rd * t; vec2 e = vec2(0.001, 0.0);
  vec3 n = normalize(vec3(sdScene(p + e.xyy, k1) - sdScene(p - e.xyy, k1), sdScene(p + e.yxy, k1) - sdScene(p - e.yxy, k1), sdScene(p + e.yyx, k1) - sdScene(p - e.yyx, k1)));
  float dif = max(dot(n, normalize(vec3(0.6, 0.8, 0.5))), 0.0);
  return (0.5 + 0.5 * n) * (0.2 + 0.8 * dif) * (0.6 + k2);
}`,
  };
  /* Values in pasted code that become inputs of the node (sliders + sockets), so the shader can be
     played without touching the code:
       #define SPEED 0.5          const float zoom = 2.0;          uniform float amount; // 0.3 [0, 2]
       #define TINT vec3(1.0, 0.4, 0.2)      const vec3 tint = vec3(…);   (colors: components 0–1)
     Whole numbers (#define STEPS 64, usually loop limits) and PI-like constants are left alone. */
  const SKIP_PARAMS = /^(PI|TAU|TWO_?PI|PI_?2|HALF_?PI|E|EPS|EPSILON|SQRT2|PHI|INF|INFINITY)$/i;
  const NUM = '[-+]?(?:\\d+\\.\\d*|\\.\\d+|\\d+)(?:[eE][-+]?\\d+)?';
  const paramCache = new Map();
  function glslParams(code) {
    const c = String(code || '');
    if (paramCache.has(c)) return paramCache.get(c);
    const out = [], seen = new Set();
    const add = q => { if (seen.has(q.name) || SKIP_PARAMS.test(q.name) || out.length >= 16) return; seen.add(q.name); out.push(q); };
    const range = (v, note) => {
      const m = note && new RegExp(`\\[\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\]`).exec(note);
      if (m) return [+m[1], +m[2]];
      if (v === 0) return [-1, 1];
      if (v > 0) return [0, v <= 1 ? 1 : Math.round(v * 3 * 1000) / 1000];
      return [Math.min(-1, v * 3), Math.max(1, -v * 3)];
    };
    const color = txt => {
      const n = (txt.match(new RegExp(NUM, 'g')) || []).map(Number);
      const v = n.length === 1 ? [n[0], n[0], n[0]] : n;
      if (v.length !== 3 || v.some(x => !(x >= 0 && x <= 1))) return null;
      return '#' + v.map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
    };
    const isFloat = t => /[.eE]/.test(t);
    let m;
    const reDef = new RegExp(`^[ \\t]*#define[ \\t]+(\\w+)[ \\t]+\\(?[ \\t]*(${NUM})[ \\t]*\\)?[ \\t]*(//[^\\n]*)?$`, 'gm');
    while ((m = reDef.exec(c))) if (isFloat(m[2])) add({ name: m[1], t: 'float', v: +m[2], range: range(+m[2], m[3]), decl: m[0] });
    const reDefV = /^[ \t]*#define[ \t]+(\w+)[ \t]+vec3[ \t]*\(([^()\n]*)\)[ \t]*(\/\/[^\n]*)?$/gm;
    while ((m = reDefV.exec(c))) { const col = color(m[2]); if (col) add({ name: m[1], t: 'color', v: col, decl: m[0] }); }
    const reConst = new RegExp(`\\bconst[ \\t]+float[ \\t]+(\\w+)[ \\t]*=[ \\t]*(${NUM})[ \\t]*;([ \\t]*//[^\\n]*)?`, 'g');
    while ((m = reConst.exec(c))) add({ name: m[1], t: 'float', v: +m[2], range: range(+m[2], m[3]), decl: m[0] });
    const reConstV = /\bconst[ \t]+vec3[ \t]+(\w+)[ \t]*=[ \t]*vec3[ \t]*\(([^()\n]*)\)[ \t]*;/g;
    while ((m = reConstV.exec(c))) { const col = color(m[2]); if (col) add({ name: m[1], t: 'color', v: col, decl: m[0] }); }
    const reUni = new RegExp(`\\buniform[ \\t]+float[ \\t]+(\\w+)[ \\t]*;([ \\t]*//[^\\n]*)?`, 'g');
    while ((m = reUni.exec(c))) {
      const first = m[2] && new RegExp(`^[ \\t]*//[ \\t]*(${NUM})`).exec(m[2]);
      const v = first ? +first[1] : 0.5;
      add({ name: m[1], t: 'float', v, range: range(v, m[2] || ''), decl: m[0] });
    }
    if (paramCache.size > 50) paramCache.clear();
    paramCache.set(c, out);
    return out;
  }
  const glslInputs = code => glslParams(code).map(q => (q.t === 'color' ? COL('g_' + q.name, q.name, q.v) : F('g_' + q.name, q.name, q.v, q.range[0], q.range[1])));
  function glslGlobals(code, id) {
    let c = String(code || '');
    const params = glslParams(c);
    // each detected value becomes a global set from the node's input (a slider value or a cable)
    for (const q of params) {
      c = c.replace(q.decl, '');
      c = c.replace(new RegExp(`(^|[^.\\w])${q.name}\\b`, 'g'), `$1g${id}_${q.name}`);
    }
    const head = params.map(q => `${q.t === 'color' ? 'vec3' : 'float'} g${id}_${q.name};`).join('\n');
    // functions the user defines with the same name as ours, or as a GLSL built-in that older shaders
    // wrote by hand (round, sign… — GLSL ES 3 forbids redefining them), get a private name
    for (const nm of [...LIB_NAMES, ...REDEF_BUILTINS]) {
      if (new RegExp(`\\b(float|int|bool|vec[234]|ivec[234]|mat[234]|void)\\s+${nm}\\s*\\(`).test(c)) c = c.replace(new RegExp(`\\b${nm}\\b`, 'g'), `${nm}_n${id}`);
    }
    c = (head ? head + '\n' : '') + c;
    if (/\bmainImage\s*\(/.test(c)) return { mode: 'toy', params, src: c.replace(/\bmainImage\b/g, `n${id}_mainImage`) };
    return { mode: 'effect', params, src: c.replace(/\beffect\b/g, `n${id}_effect`) };
  }

  /* ── 3D scene (raymarching) ───────────────────────────────── */
  /* «Patrón»: graphic, crisp line patterns (wavy lines, op-art, topographic, truchet, weave, cubes…).
     Returns vec2(mask, variation 0–1 per band / cell). q = coordinates × density, aa = ~1.5 px. */
  const PATTERN_KINDS = {
    wavy: `float b = q.y + amt * 1.2 * sin(q.x * 0.7 + t); m = L(abs(fract(b) - 0.5), w * 0.5, aa * 1.6); cid = floor(b);`,
    zigzag: `float b = q.y + amt * 1.6 * abs(fract(q.x * 0.5 + t * 0.15) - 0.5) * 2.0; m = L(abs(fract(b) - 0.5), w * 0.5, aa * 1.8); cid = floor(b);`,
    op: `vec2 r = p * 2.0; float b = q.x + amt * sc * 0.12 * sin(r.y * 2.0 + t) * cos(r.x * 1.5 - t * 0.7); m = L(abs(fract(b) - 0.5), w * 0.5, aa * 2.5); cid = floor(b);`,
    rings: `float b = length(q) + amt * 0.4 * sin(atan(q.y, q.x) * 5.0 + t * 0.5) - t; m = L(abs(fract(b) - 0.5), w * 0.5, aa * 1.3); cid = floor(b);`,
    squares: `vec2 aq = abs(rot(t * 0.05 + amt * length(p)) * q); float b = max(aq.x, aq.y) * 2.0 - t; m = L(abs(fract(b) - 0.5), w * 0.5, aa * 2.0); cid = floor(b);`,
    contour: `float h = fbm(p * (0.8 + amt * 1.2) + vec2(seed * 1.7, t * 0.12), 3.0) * sc * 0.7; m = L(abs(fract(h) - 0.5), w * 0.5, 0.07); cid = floor(h);`,
    blobs: `float h = fbm(p * (0.9 + amt * 1.2) + vec2(seed * 1.3, -t * 0.08), 3.0) * (2.0 + sc * 0.45); m = L(abs(fract(h) - 0.5), w * 0.5, 0.035); cid = floor(h);`,
    truchet: `vec2 c = floor(q); vec2 f = fract(q) - 0.5; float r = hash21(c + seed + floor(t * 0.5 + hash21(c + 3.1) * 4.0) * 0.37); if (r > 0.5) f.x = -f.x; float d = min(abs(length(f - 0.5) - 0.5), abs(length(f + 0.5) - 0.5)); m = L(d, w * 0.25, aa); cid = c.x + c.y * 57.0;`,
    maze: `vec2 c = floor(q); vec2 f = fract(q); float r = hash21(c + seed + floor(t * 0.5 + hash21(c + 3.1) * 4.0) * 0.37); float d = (r > 0.5 ? abs(f.x - f.y) : abs(f.x + f.y - 1.0)) * 0.7071; m = L(d, w * 0.25, aa); cid = c.x + c.y * 57.0;`,
    weave: `vec2 qq = q + vec2(t * 0.2, 0.0); vec2 c = floor(qq); vec2 f = fract(qq) - 0.5; float hw = w * 0.5; float n = 1.0 + floor(amt * 2.5); float sx = 0.65 + 0.35 * step(0.5, fract((f.x / max(w, 0.02) + 0.5) * n)); float sy = 0.65 + 0.35 * step(0.5, fract((f.y / max(w, 0.02) + 0.5) * n)); float inH = L(abs(f.y), hw, aa) * sy, inV = L(abs(f.x), hw, aa) * sx; float top = mod(c.x + c.y, 2.0); float a1 = top < 0.5 ? inH : inV; float a2 = top < 0.5 ? inV : inH; m = max(a1, a2 * (1.0 - step(0.01, a1)) * 0.6); cid = top + 2.0 * step(0.01, a2);`,
    cubes: `vec2 qq = q + vec2(t * 0.25, 0.0); vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5; vec2 a = mod(qq, r) - h; vec2 b = mod(qq - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b; float face = floor(mod(atan(g.y, g.x) - 1.5707963 + 12.566371, 6.2831853) / 2.0943951); m = face < 0.5 ? 1.0 : (face < 1.5 ? 0.2 + amt * 0.3 : 0.55); vec2 cc = floor(qq - g + 0.5); cid = cc.x + cc.y * 57.0;`,
    dots: `vec2 qq = q; qq.x += mod(floor(qq.y), 2.0) * 0.5; vec2 c = floor(qq); vec2 f = fract(qq) - 0.5; float rr = w * 0.5 * (1.0 - amt * 0.5 + amt * 0.5 * sin(t * 2.0 + hash21(c + seed) * 6.283)); m = L(length(f), rr, aa); cid = c.x + c.y * 57.0;`,
    grid: `vec2 qq = q + vec2(t * 0.2, t * 0.1); vec2 f = fract(qq); vec2 d = min(f, 1.0 - f); m = max(L(d.x, w * 0.2, aa), L(d.y, w * 0.2, aa)); vec2 c = floor(qq); cid = c.x + c.y * 57.0; m = max(m, step(1.0 - amt * 0.3, hash21(c + seed)) * 0.5);`,
    cracks: `vec2 vv = voronoi(q * 0.5 + vec2(seed, t * 0.1)); m = L(vv.y - vv.x, w * 0.15, aa * 0.6); cid = floor(vv.x * 9.0 + seed);`,
  };
  function patternGlobals(P, id) {
    const body = (PATTERN_KINDS[P.kind] || PATTERN_KINDS.wavy).replace(/\bL\(/g, `n${id}_L(`);
    return `float n${id}_L(float d, float hw, float aa){ return 1.0 - smoothstep(hw - aa, hw + aa, d); }
vec2 n${id}_pat(vec2 p, float sc, float w, float amt, float sp, float seed){
  vec2 q = p * sc; float t = u_time * sp; float aa = sc * 1.5 / u_res.y; float m = 0.0; float cid = 0.0;
  ${body}
  return vec2(clamp(m, 0.0, 1.0), hash21(vec2(cid * 0.137 + 0.5, seed * 0.71 + 0.31)));
}`;
  }

  function scene3dGlobals(P, id) {
    const shape = {
      sphere: 'length(p) - size',
      box: '(length(max(abs(p) - vec3(size * 0.8), 0.0)) + min(max(abs(p).x - size * 0.8, max(abs(p).y - size * 0.8, abs(p).z - size * 0.8)), 0.0)) - size * 0.05',
      torus: 'length(vec2(length(p.xz) - size, p.y)) - size * 0.32',
      octa: '(abs(p.x) + abs(p.y) + abs(p.z) - size * 1.3) * 0.57735',
      blob: 'length(p) - size + 0.09 * size * sin(p.x * 7.0 / size + u_time * 2.0) * sin(p.y * 7.0 / size + u_time * 1.3) * sin(p.z * 7.0 / size)',
      gem: 'max(length(p) - size, (abs(p.x) + abs(p.y) + abs(p.z) - size * 1.15) * 0.57735)',
    }[P.shape] || 'length(p) - size';
    const layout = {
      single: '',
      grid: 'p = mod(p + sp * 0.5, sp) - sp * 0.5;',
      tunnel: 'p.z = mod(p.z + sp * 0.5, sp) - sp * 0.5; float aa = atan(p.y, p.x); float sec = 6.28318 / 8.0; aa = mod(aa + sec * 0.5, sec) - sec * 0.5; p.xy = vec2(cos(aa), sin(aa)) * length(p.xy); p.x -= sp * 0.8;',
      column: 'p.xz = mod(p.xz + sp * 0.5, sp) - sp * 0.5; p.y = mod(p.y + sp * 0.5, sp) - sp * 0.5;',
    }[P.layout] || '';
    const steps = parseInt(P.quality, 10) || 72;
    const cam = {
      orbit: 'vec3 ro = vec3(sin(tt) * 4.5, 1.6 + sin(tt * 0.7) * 0.8, cos(tt) * 4.5); vec3 ta = vec3(0.0);',
      fly: 'vec3 ro = vec3(sin(tt * 0.3) * 0.4, cos(tt * 0.23) * 0.3, tt * 3.0); vec3 ta = ro + vec3(sin(tt * 0.5) * 0.3, cos(tt * 0.4) * 0.2, 1.0);',
      still: 'vec3 ro = vec3(0.0, 0.0, 4.5); vec3 ta = vec3(0.0);',
    }[P.cam] || '';
    return `float n${id}_sd(vec3 p, float size, float twist, float sp) {
  ${layout}
  float tw = p.y * twist; p.xz = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * p.xz;
  return ${shape};
}
vec3 n${id}_march(vec2 uv, float size, float twist, float speed, float sp, out vec3 nrm) {
  float tt = u_time * speed;
  ${cam}
  vec3 f = normalize(ta - ro), r = normalize(cross(vec3(0.0, 1.0, 0.0), f)), u = cross(f, r);
  vec3 rd = normalize(uv.x * r + uv.y * u + 1.6 * f);
  float t = 0.0, hit = 0.0;
  for (int i = 0; i < ${steps}; i++) {
    float h = n${id}_sd(ro + rd * t, size, twist, sp);
    if (h < 0.001 * (1.0 + t)) { hit = 1.0; break; }
    t += h * 0.85;
    if (t > 40.0) break;
  }
  nrm = vec3(0.0);
  if (hit < 0.5) return vec3(0.0, 1.0, 0.0);
  vec3 pos = ro + rd * t; vec2 e = vec2(0.0015, -0.0015);
  nrm = normalize(e.xyy * n${id}_sd(pos + e.xyy, size, twist, sp) + e.yyx * n${id}_sd(pos + e.yyx, size, twist, sp) + e.yxy * n${id}_sd(pos + e.yxy, size, twist, sp) + e.xxx * n${id}_sd(pos + e.xxx, size, twist, sp));
  vec3 l = normalize(vec3(0.6, 0.9, -0.4));
  float dif = max(dot(nrm, l), 0.0);
  float spe = pow(max(dot(reflect(rd, nrm), l), 0.0), 24.0);
  float ao = clamp(n${id}_sd(pos + nrm * 0.2, size, twist, sp) / 0.2, 0.0, 1.0);
  float fog = exp(-t * 0.07);
  return vec3(clamp((0.12 + 0.8 * dif * (0.5 + 0.5 * ao) + spe * 0.6) * fog, 0.0, 1.0), clamp(t / 40.0, 0.0, 1.0), hit);
}`;
  }

  const NODES = {
    /* Entrada */
    time: { title: 'Tiempo', cat: 'Entrada',
      inputs: [F('speed', 'Velocidad', 1, 0, 5)],
      outputs: [['t', 'float', 'Tiempo'], ['wave', 'float', 'Onda'], ['ramp', 'float', 'Rampa'], ['pulse', 'float', 'Pulso (BPM)']],
      glsl: (I, O) => `float ${O.t} = u_time * ${I.speed}; float ${O.wave} = sin(${O.t}) * 0.5 + 0.5; float ${O.ramp} = fract(${O.t}); float ${O.pulse} = pow(1.0 - fract(u_beat), 3.0);` },
    coords: { title: 'Coordenadas', cat: 'Entrada',
      inputs: [],
      outputs: [['uv', 'vec2', 'Coordenadas'], ['x', 'float', 'X'], ['y', 'float', 'Y'], ['dist', 'float', 'Distancia'], ['angle', 'float', 'Ángulo']],
      glsl: (I, O) => `vec2 ${O.uv} = p; float ${O.x} = p.x; float ${O.y} = p.y; float ${O.dist} = length(p); float ${O.angle} = atan(p.y, p.x) / 6.28318 + 0.5;` },
    value: { title: 'Valor', cat: 'Entrada',
      inputs: [F('v', 'Valor', 0.5, -10, 10)],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O) => `float ${O.v} = ${I.v};` },
    color: { title: 'Color', cat: 'Entrada',
      inputs: [COL('c', 'Color', '#66ff33')],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O) => `vec3 ${O.c} = ${I.c};` },
    lfo: { title: 'LFO', cat: 'Entrada',
      inputs: [F('speed', 'Velocidad', 1, 0, 10), F('min', 'Mín', 0, -5, 5), F('max', 'Máx', 1, -5, 5)],
      params: [{ k: 'shape', label: 'Forma', v: 'sine', options: [['sine', 'Seno'], ['tri', 'Triángulo'], ['saw', 'Sierra'], ['square', 'Cuadrada'], ['random', 'Aleatoria']] },
               { k: 'sync', label: 'Ritmo', v: 'free', options: [['free', 'libre (Velocidad)'], ['1', '1 tiempo'], ['2', '2 tiempos'], ['4', '1 compás'], ['8', '2 compases'], ['16', '4 compases']] }],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O, P) => {
        // "Ritmo" follows the tap tempo (u_beat counts beats); "libre" uses Velocidad in cycles per second
        const ph = !P.sync || P.sync === 'free' ? `(u_time * ${I.speed})` : `(u_beat / ${P.sync}.0)`;
        const shape = { sine: `sin(${ph} * 6.28318) * 0.5 + 0.5`, tri: `abs(fract(${ph}) * 2.0 - 1.0)`, saw: `fract(${ph})`,
                        square: `step(0.5, fract(${ph}))`, random: `hash21(vec2(floor(${ph}), 7.0))` }[P.shape];
        return `float ${O.v} = mix(${I.min}, ${I.max}, ${shape});`;
      } },
    audio: { title: 'Audio', cat: 'Entrada',
      inputs: [F('gain', 'Ganancia', 1, 0, 4)],
      outputs: [['level', 'float', 'Nivel'], ['bass', 'float', 'Graves'], ['mid', 'float', 'Medios'], ['high', 'float', 'Agudos']],
      glsl: (I, O) => `vec4 _a${O.level} = clamp(u_audio * ${I.gain}, 0.0, 1.0); float ${O.level} = _a${O.level}.x; float ${O.bass} = _a${O.level}.y; float ${O.mid} = _a${O.level}.z; float ${O.high} = _a${O.level}.w;`,
      usesAudio: true },

    image: { title: 'Imagen', cat: 'Entrada', tex: true,
      inputs: [UV, F('size', 'Tamaño', 0.5, 0.02, 3), F('opacity', 'Opacidad', 1, 0, 1)],
      params: [{ k: 'img', label: 'Imagen', kind: 'image', v: '' },
               { k: 'repeat', label: 'Repetir', v: 'no', options: [['no', 'no'], ['yes', 'sí (mosaico)']] }],
      outputs: [['c', 'color', 'Color'], ['a', 'float', 'Alfa']],
      glsl: (I, O, P, id) => texGLSL(I, O, P, id) },
    text: { title: 'Texto', cat: 'Entrada', tex: true,
      inputs: [UV, COL('color', 'Color', '#ffffff'), F('size', 'Tamaño', 0.2, 0.02, 2), F('opacity', 'Opacidad', 1, 0, 1)],
      params: [{ k: 'text', label: 'Texto', kind: 'text', v: 'PUDRUS' },
               { k: 'font', label: 'Letra', v: 'sans', options: [['sans', 'sans negrita'], ['display', 'display'], ['serif', 'serif'], ['mono', 'mono'], ['hand', 'manuscrita']] },
               { k: 'repeat', label: 'Repetir', v: 'no', options: [['no', 'no'], ['yes', 'sí (mosaico)']] }],
      outputs: [['c', 'color', 'Color'], ['a', 'float', 'Alfa']],
      glsl: (I, O, P, id) => texGLSL(I, O, P, id, I.color) },

    camera: { title: 'Cámara', cat: 'Entrada', tex: true,
      inputs: [UV, F('size', 'Tamaño', 1, 0.05, 3), F('opacity', 'Opacidad', 1, 0, 1)],
      params: [{ k: 'mirror', label: 'Espejo', v: 'yes', options: [['yes', 'sí'], ['no', 'no']] },
               { k: 'repeat', label: 'Repetir', v: 'no', options: [['no', 'no'], ['yes', 'sí (mosaico)']] }],
      outputs: [['c', 'color', 'Color'], ['a', 'float', 'Alfa']],
      glsl: (I, O, P, id) => texGLSL(I, O, P, id) },
    video: { title: 'Video', cat: 'Entrada', tex: true,
      inputs: [UV, F('size', 'Tamaño', 1, 0.05, 3), F('opacity', 'Opacidad', 1, 0, 1)],
      params: [{ k: 'vid', label: 'Video', kind: 'video', v: '' },
               { k: 'speed', label: 'Velocidad', v: '1', options: [['0.25', '×0,25'], ['0.5', '×0,5'], ['1', '×1'], ['2', '×2']] },
               { k: 'repeat', label: 'Repetir', v: 'no', options: [['no', 'no'], ['yes', 'sí (mosaico)']] }],
      outputs: [['c', 'color', 'Color'], ['a', 'float', 'Alfa']],
      glsl: (I, O, P, id) => texGLSL(I, O, P, id) },

    glsl: { title: 'GLSL', cat: 'Código',
      inputs: [UV, COL('in', 'Color de entrada', '#000000'), F('k1', 'Perilla 1', 0.5, 0, 1), F('k2', 'Perilla 2', 0.5, 0, 1), F('k3', 'Perilla 3', 0.5, 0, 1), F('k4', 'Perilla 4', 0.5, 0, 1)],
      params: [{ k: 'code', label: 'Código', kind: 'code', v: GLSL_TEMPLATES.effect }],
      outputs: [['c', 'color', 'Color'], ['v', 'float', 'Brillo']],
      usesFeedback: true,
      dynInputs: n => glslInputs(n.p && n.p.code !== undefined ? n.p.code : GLSL_TEMPLATES.effect),
      globals: (P, id) => glslGlobals(P.code, id).src,
      glsl: (I, O, P, id) => {
        const g = glslGlobals(P.code, id);
        const knobs = `knob1 = ${I.k1}; knob2 = ${I.k2}; knob3 = ${I.k3}; knob4 = ${I.k4};` + g.params.map(q => ` g${id}_${q.name} = ${I['g_' + q.name]};`).join('');
        const call = g.mode === 'toy'
          ? `vec4 _o${id} = vec4(0.0); n${id}_mainImage(_o${id}, (${I.uv} / vec2(u_res.x / u_res.y, 1.0) + 0.5) * u_res); vec3 ${O.c} = _o${id}.rgb;`
          : `vec3 ${O.c} = n${id}_effect(${I.uv}, ${I.in}, ${I.k1}, ${I.k2}, ${I.k3}, ${I.k4});`;
        return `${knobs} ${call} float ${O.v} = dot(${O.c}, vec3(0.299, 0.587, 0.114));`;
      } },
    scene3d: { title: 'Escena 3D', cat: 'Código',
      inputs: [UV, F('size', 'Tamaño', 0.8, 0.1, 2), F('twist', 'Torsión', 0, -3, 3), F('speed', 'Cámara (vel.)', 0.4, 0, 3), F('spacing', 'Separación', 3, 1.2, 8)],
      params: [{ k: 'shape', label: 'Forma', v: 'torus', options: [['sphere', 'esfera'], ['box', 'cubo'], ['torus', 'toroide'], ['octa', 'octaedro'], ['gem', 'gema'], ['blob', 'gota viva']] },
               { k: 'layout', label: 'Disposición', v: 'single', options: [['single', 'una'], ['grid', 'grilla infinita'], ['tunnel', 'túnel'], ['column', 'columnas']] },
               { k: 'cam', label: 'Cámara', v: 'orbit', options: [['orbit', 'órbita'], ['fly', 'vuelo'], ['still', 'quieta']] },
               { k: 'quality', label: 'Calidad', v: '72', options: [['40', 'baja (rápida)'], ['72', 'media'], ['120', 'alta']] }],
      outputs: [['v', 'float', 'Luz'], ['depth', 'float', 'Profundidad'], ['c', 'color', 'Normales']],
      globals: (P, id) => scene3dGlobals(P, id),
      glsl: (I, O, P, id) => `vec3 _nr${id}; vec3 _m${id} = n${id}_march(${I.uv}, ${I.size}, ${I.twist}, ${I.speed}, ${I.spacing}, _nr${id}); float ${O.v} = _m${id}.x; float ${O.depth} = _m${id}.y; vec3 ${O.c} = (_nr${id} * 0.5 + 0.5) * _m${id}.x * _m${id}.z;` },

    /* Generar */
    pattern: { title: 'Patrón', cat: 'Generar',
      inputs: [UV, F('scale', 'Densidad', 8, 1, 60), F('width', 'Grosor', 0.4, 0.02, 0.98), F('amount', 'Forma', 0.6, 0, 2), F('speed', 'Velocidad', 0.2, -3, 3), F('seed', 'Semilla', 0, 0, 100)],
      params: [{ k: 'kind', label: 'Dibujo', v: 'wavy', options: [['wavy', 'Líneas onduladas'], ['zigzag', 'Zigzag'], ['op', 'Op-art'], ['rings', 'Círculos'], ['squares', 'Cuadrados'], ['contour', 'Topográfico'], ['blobs', 'Manchas líquidas'], ['truchet', 'Laberinto curvo'], ['maze', 'Diagonales'], ['weave', 'Tejido'], ['cubes', 'Cubos'], ['dots', 'Puntos'], ['grid', 'Cuadrícula'], ['cracks', 'Grietas']] }],
      outputs: [['v', 'float', 'Máscara'], ['id', 'float', 'Variación']],
      globals: (P, id) => patternGlobals(P, id),
      glsl: (I, O, P, id) => `vec2 _p${id} = n${id}_pat(${I.uv}, ${I.scale}, ${I.width}, ${I.amount}, ${I.speed}, ${I.seed}); float ${O.v} = _p${id}.x; float ${O.id} = _p${id}.y;` },
    noise: { title: 'Ruido', cat: 'Generar',
      inputs: [UV, F('scale', 'Escala', 3, 0.1, 30), F('speed', 'Velocidad', 0.2, 0, 3), F('detail', 'Detalle', 4, 1, 8, 1)],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O) => `float ${O.v} = fbm(${I.uv} * ${I.scale} + vec2(u_time * ${I.speed}, u_time * ${I.speed} * 0.7), ${I.detail});` },
    voronoi: { title: 'Celdas', cat: 'Generar',
      inputs: [UV, F('scale', 'Escala', 5, 0.5, 40), F('speed', 'Velocidad', 0.2, 0, 3)],
      outputs: [['dist', 'float', 'Distancia'], ['edge', 'float', 'Bordes']],
      glsl: (I, O) => `vec2 _v${O.dist} = voronoi(${I.uv} * ${I.scale} + vec2(sin(u_time * ${I.speed}), cos(u_time * ${I.speed} * 0.8)) * 2.0); float ${O.dist} = clamp(_v${O.dist}.x, 0.0, 1.0); float ${O.edge} = 1.0 - smoothstep(0.0, 0.08, _v${O.dist}.y - _v${O.dist}.x);` },
    gradient: { title: 'Degradé', cat: 'Generar',
      inputs: [UV, F('angle', 'Ángulo', 0, -180, 180)],
      params: [{ k: 'kind', label: 'Tipo', v: 'linear', options: [['linear', 'Lineal'], ['radial', 'Radial']] }],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O, P) => P.kind === 'radial'
        ? `float ${O.v} = clamp(length(${I.uv}) * 1.5, 0.0, 1.0);`
        : `float ${O.v} = clamp((rot(radians(${I.angle})) * ${I.uv}).x + 0.5, 0.0, 1.0);` },
    shape: { title: 'Forma', cat: 'Generar',
      inputs: [UV, F('size', 'Tamaño', 0.3, 0, 1.5), F('soft', 'Suavidad', 0.01, 0, 0.5), F('width', 'Grosor', 0.05, 0.001, 0.5)],
      params: [{ k: 'kind', label: 'Forma', v: 'circle', options: [['circle', 'Círculo'], ['square', 'Cuadrado'], ['ring', 'Anillo'], ['triangle', 'Triángulo'], ['cross', 'Cruz']] }],
      outputs: [['v', 'float', 'Máscara']],
      glsl: (I, O, P) => {
        const q = I.uv;
        const d = {
          circle: `length(${q}) - ${I.size}`,
          square: `max(abs(${q}).x, abs(${q}).y) - ${I.size}`,
          ring: `abs(length(${q}) - ${I.size}) - ${I.width}`,
          triangle: `max(abs(${q}).x * 0.866025 + ${q}.y * 0.5, -${q}.y) - ${I.size} * 0.5`,
          cross: `min(max(abs(${q}).x - ${I.width}, abs(${q}).y - ${I.size}), max(abs(${q}).y - ${I.width}, abs(${q}).x - ${I.size}))`,
        }[P.kind];
        return `float ${O.v} = 1.0 - smoothstep(-${I.soft} - 0.002, ${I.soft} + 0.002, ${d});`;
      } },
    stripes: { title: 'Rayas', cat: 'Generar',
      inputs: [UV, F('freq', 'Frecuencia', 10, 0, 100), F('angle', 'Ángulo', 0, -180, 180), F('sharp', 'Dureza', 0.5, 0, 1), F('speed', 'Velocidad', 0, -5, 5)],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O) => `float _s${O.v} = sin(((rot(radians(${I.angle})) * ${I.uv}).x * ${I.freq} - u_time * ${I.speed}) * 6.28318) * 0.5 + 0.5; float ${O.v} = mix(_s${O.v}, step(0.5, _s${O.v}), ${I.sharp});` },
    checker: { title: 'Damero', cat: 'Generar',
      inputs: [UV, F('scale', 'Escala', 8, 1, 60)],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O) => `vec2 _c${O.v} = floor(${I.uv} * ${I.scale}); float ${O.v} = mod(_c${O.v}.x + _c${O.v}.y, 2.0);` },
    waves: { title: 'Ondas', cat: 'Generar',
      inputs: [UV, F('freq', 'Frecuencia', 12, 0, 80), F('speed', 'Velocidad', 1, -10, 10)],
      params: [{ k: 'kind', label: 'Tipo', v: 'rings', options: [['rings', 'Anillos'], ['linear', 'Horizontales'], ['interference', 'Interferencia']] }],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O, P) => {
        const q = I.uv;
        const e = { rings: `length(${q})`, linear: `${q}.y`, interference: `(length(${q} - vec2(0.25, 0.0)) + length(${q} + vec2(0.25, 0.0))) * 0.5` }[P.kind];
        return `float ${O.v} = sin(${e} * ${I.freq} - u_time * ${I.speed}) * 0.5 + 0.5;`;
      } },

    /* Coordenadas */
    transform: { title: 'Transformar', cat: 'Coordenadas',
      inputs: [UV, F('x', 'Mover X', 0, -2, 2), F('y', 'Mover Y', 0, -2, 2), F('scale', 'Escala', 1, 0.01, 10), F('rotate', 'Rotar °', 0, -360, 360), F('spin', 'Girar (°/s)', 0, -360, 360)],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O) => `vec2 ${O.uv} = rot(radians(${I.rotate} + u_time * ${I.spin})) * ((${I.uv} - vec2(${I.x}, ${I.y})) / ${I.scale});` },
    kaleido: { title: 'Caleidoscopio', cat: 'Coordenadas',
      inputs: [UV, F('segments', 'Segmentos', 6, 1, 24, 1), F('rotate', 'Rotar °', 0, -360, 360)],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O) => `float _k${O.uv} = 6.28318 / max(1.0, ${I.segments}); float _a${O.uv} = atan(${I.uv}.y, ${I.uv}.x) + radians(${I.rotate}); _a${O.uv} = mod(_a${O.uv}, _k${O.uv}); _a${O.uv} = abs(_a${O.uv} - _k${O.uv} * 0.5); vec2 ${O.uv} = vec2(cos(_a${O.uv}), sin(_a${O.uv})) * length(${I.uv});` },
    mirror: { title: 'Espejo', cat: 'Coordenadas',
      inputs: [UV],
      params: [{ k: 'axis', label: 'Eje', v: 'x', options: [['x', 'Horizontal'], ['y', 'Vertical'], ['xy', 'Ambos']] }],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O, P) => `vec2 ${O.uv} = ${I.uv}; ${P.axis.includes('x') ? `${O.uv}.x = abs(${O.uv}.x);` : ''} ${P.axis.includes('y') ? `${O.uv}.y = abs(${O.uv}.y);` : ''}` },
    tile: { title: 'Repetir', cat: 'Coordenadas',
      inputs: [UV, F('count', 'Cantidad', 3, 1, 30)],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O) => `vec2 ${O.uv} = fract(${I.uv} * ${I.count} + 0.5) - 0.5;` },
    polar: { title: 'Polar', cat: 'Coordenadas',
      inputs: [UV],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O) => `vec2 ${O.uv} = vec2(atan(${I.uv}.y, ${I.uv}.x) / 6.28318, length(${I.uv}));` },
    warp: { title: 'Distorsión', cat: 'Coordenadas',
      inputs: [UV, F('amount', 'Cantidad', 0.2, 0, 2), F('scale', 'Escala', 3, 0.1, 20), F('speed', 'Velocidad', 0.3, 0, 3)],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O) => `vec2 ${O.uv} = ${I.uv} + (vec2(vnoise(${I.uv} * ${I.scale} + u_time * ${I.speed}), vnoise(${I.uv} * ${I.scale} - u_time * ${I.speed} + 31.7)) - 0.5) * ${I.amount};` },
    glitch: { title: 'Glitch', cat: 'Coordenadas',
      inputs: [UV, F('amount', 'Cantidad', 0.3, 0, 1), F('rate', 'Cambios/seg', 8, 0.5, 30), F('bands', 'Franjas', 20, 2, 80, 1)],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O, P, id) => `float _gt${id} = floor(u_time * ${I.rate}); float _gb${id} = floor((${I.uv}.y + 0.5) * ${I.bands}); float _gr${id} = hash21(vec2(_gb${id}, _gt${id})); vec2 ${O.uv} = ${I.uv} + vec2(step(1.0 - ${I.amount} * 0.7, _gr${id}) * (hash21(vec2(_gt${id}, _gb${id} + 1.7)) - 0.5) * ${I.amount}, 0.0);` },
    pixelate: { title: 'Pixelar', cat: 'Coordenadas',
      inputs: [UV, F('size', 'Tamaño', 0.02, 0.001, 0.3)],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O) => `vec2 ${O.uv} = (floor(${I.uv} / ${I.size}) + 0.5) * ${I.size};` },
    swirl: { title: 'Remolino', cat: 'Coordenadas',
      inputs: [UV, F('amount', 'Cantidad', 3, -20, 20), F('radius', 'Radio', 0.6, 0.01, 2)],
      outputs: [['uv', 'vec2', 'Coordenadas']],
      glsl: (I, O) => `float _w${O.uv} = max(0.0, 1.0 - length(${I.uv}) / ${I.radius}); vec2 ${O.uv} = rot(${I.amount} * _w${O.uv} * _w${O.uv}) * ${I.uv};` },

    /* Color */
    palette: { title: 'Paleta', cat: 'Color',
      inputs: [F('v', 'Valor', 0.5, 0, 1), F('shift', 'Desplazar', 0, -2, 2), F('speed', 'Ciclar', 0, -2, 2)],
      params: [{ k: 'pal', label: 'Paleta', v: 'neon', options: [['neon', 'Neón'], ['fire', 'Fuego'], ['ocean', 'Océano'], ['rainbow', 'Arcoíris'], ['vapor', 'Vapor'], ['mono', 'Mono'], ['pastel', 'Pastel'], ['retro', 'Retro']] }],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O, P) => {
        const pals = {
          neon: ['vec3(0.1, 0.5, 0.2)', 'vec3(0.1, 0.5, 0.2)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.0, 0.1, 0.2)'],
          fire: ['vec3(0.5, 0.2, 0.05)', 'vec3(0.5, 0.3, 0.1)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.0, 0.1, 0.2)'],
          ocean: ['vec3(0.1, 0.3, 0.5)', 'vec3(0.1, 0.3, 0.5)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.5, 0.4, 0.3)'],
          rainbow: ['vec3(0.5)', 'vec3(0.5)', 'vec3(1.0)', 'vec3(0.0, 0.33, 0.67)'],
          vapor: ['vec3(0.5, 0.3, 0.6)', 'vec3(0.5, 0.3, 0.4)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.8, 0.9, 0.3)'],
          mono: ['vec3(0.5)', 'vec3(0.5)', 'vec3(0.5)', 'vec3(0.0)'],
          pastel: ['vec3(0.72, 0.68, 0.7)', 'vec3(0.28, 0.3, 0.28)', 'vec3(1.0)', 'vec3(0.0, 0.33, 0.67)'],
          retro: ['vec3(0.62, 0.5, 0.38)', 'vec3(0.38, 0.38, 0.32)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.0, 0.25, 0.45)'],
        }[P.pal];
        return `vec3 ${O.c} = clamp(cosPal(${I.v} + ${I.shift} + u_time * ${I.speed}, ${pals.join(', ')}), 0.0, 1.0);`;
      } },
    ramp: { title: 'Degradé de color', cat: 'Color',
      inputs: [F('v', 'Valor', 0.5, 0, 1), COL('a', 'Color A', '#050508'), COL('b', 'Color B', '#66ff33')],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O) => `vec3 ${O.c} = mix(${I.a}, ${I.b}, clamp(${I.v}, 0.0, 1.0));` },
    mix: { title: 'Mezclar', cat: 'Color',
      inputs: [COL('a', 'A', '#000000'), COL('b', 'B', '#ffffff'), F('f', 'Mezcla', 0.5, 0, 1)],
      params: [{ k: 'mode', label: 'Modo', v: 'mix', options: [['mix', 'Mezclar'], ['add', 'Sumar'], ['multiply', 'Multiplicar'], ['screen', 'Pantalla'], ['difference', 'Diferencia']] }],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O, P) => {
        const m = { mix: `${I.b}`, add: `${I.a} + ${I.b}`, multiply: `${I.a} * ${I.b}`, screen: `1.0 - (1.0 - ${I.a}) * (1.0 - ${I.b})`, difference: `abs(${I.a} - ${I.b})` }[P.mode];
        return `vec3 ${O.c} = mix(${I.a}, ${m}, ${I.f});`;
      } },
    over: { title: 'Superponer', cat: 'Color',
      inputs: [COL('base', 'Fondo', '#000000'), COL('top', 'Encima', '#ffffff'), F('a', 'Alfa', 1, 0, 1), F('opacity', 'Opacidad', 1, 0, 1)],
      params: [{ k: 'mode', label: 'Modo', v: 'normal', options: [['normal', 'normal'], ['add', 'sumar'], ['screen', 'pantalla'], ['multiply', 'multiplicar'], ['difference', 'diferencia']] }],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O, P) => {
        const m = { normal: I.top, add: `${I.base} + ${I.top}`, screen: `1.0 - (1.0 - ${I.base}) * (1.0 - ${I.top})`, multiply: `${I.base} * ${I.top}`, difference: `abs(${I.base} - ${I.top})` }[P.mode];
        return `vec3 ${O.c} = mix(${I.base}, ${m}, clamp(${I.a} * ${I.opacity}, 0.0, 1.0));`;
      } },
    math: { title: 'Matemática', cat: 'Color',
      inputs: [F('a', 'A', 0.5, -10, 10), F('b', 'B', 0.5, -10, 10)],
      params: [{ k: 'op', label: 'Operación', v: 'mul', options: [['add', 'Sumar'], ['sub', 'Restar'], ['mul', 'Multiplicar'], ['div', 'Dividir'], ['pow', 'Potencia'], ['min', 'Mínimo'], ['max', 'Máximo'], ['sin', 'Seno (A)'], ['abs', 'Absoluto (A)'], ['fract', 'Fracción (A)'], ['step', 'Escalón (A < B)'], ['smooth', 'Suave (0..B)']] }],
      outputs: [['v', 'float', 'Resultado']],
      glsl: (I, O, P) => {
        const e = { add: `${I.a} + ${I.b}`, sub: `${I.a} - ${I.b}`, mul: `${I.a} * ${I.b}`, div: `${I.a} / max(abs(${I.b}), 1e-4) * sign(${I.b} + 1e-9)`,
                    pow: `pow(abs(${I.a}), ${I.b})`, min: `min(${I.a}, ${I.b})`, max: `max(${I.a}, ${I.b})`, sin: `sin(${I.a} * 6.28318) * 0.5 + 0.5`,
                    abs: `abs(${I.a})`, fract: `fract(${I.a})`, step: `step(${I.b}, ${I.a})`, smooth: `smoothstep(0.0, max(${I.b}, 1e-4), ${I.a})` }[P.op];
        return `float ${O.v} = ${e};`;
      } },
    range: { title: 'Rango', cat: 'Color',
      inputs: [F('v', 'Valor (0–1)', 0.5, 0, 1), F('min', 'Mín', 0, -10, 10), F('max', 'Máx', 1, -10, 10)],
      outputs: [['v', 'float', 'Resultado']],
      glsl: (I, O) => `float ${O.v} = mix(${I.min}, ${I.max}, ${I.v});` },
    adjust: { title: 'Ajustar color', cat: 'Color',
      inputs: [COL('c', 'Color', '#808080'), F('bright', 'Brillo', 0, -1, 1), F('contrast', 'Contraste', 1, 0, 3), F('sat', 'Saturación', 1, 0, 3), F('hue', 'Tono', 0, -1, 1)],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O) => `vec3 _h${O.c} = rgb2hsv(clamp(${I.c}, 0.0, 1.0)); _h${O.c}.x = fract(_h${O.c}.x + ${I.hue}); _h${O.c}.y *= ${I.sat}; vec3 ${O.c} = (hsv2rgb(_h${O.c}) - 0.5) * ${I.contrast} + 0.5 + ${I.bright};` },
    invert: { title: 'Invertir', cat: 'Color',
      inputs: [COL('c', 'Color', '#808080')],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O) => `vec3 ${O.c} = 1.0 - ${I.c};` },
    posterize: { title: 'Posterizar', cat: 'Color',
      inputs: [COL('c', 'Color', '#808080'), F('levels', 'Niveles', 4, 2, 32, 1)],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O) => `vec3 ${O.c} = floor(${I.c} * ${I.levels}) / max(1.0, ${I.levels} - 1.0);` },
    threshold: { title: 'Umbral', cat: 'Color',
      inputs: [F('v', 'Valor', 0.5, 0, 1), F('edge', 'Umbral', 0.5, 0, 1), F('soft', 'Suavidad', 0.02, 0, 0.5)],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O) => `float ${O.v} = smoothstep(${I.edge} - ${I.soft} - 1e-4, ${I.edge} + ${I.soft} + 1e-4, ${I.v});` },

    /* Efectos */
    feedback: { title: 'Feedback', cat: 'Efectos',
      inputs: [COL('c', 'Color', '#000000'), F('amount', 'Persistencia', 0.9, 0, 0.995), F('zoom', 'Zoom', 1.02, 0.8, 1.2), F('rotate', 'Rotar °', 0.5, -20, 20), F('drift', 'Deriva', 0, -0.05, 0.05)],
      params: [{ k: 'blend', label: 'Combinar', v: 'max', options: [['max', 'Máximo'], ['add', 'Sumar'], ['mix', 'Encima']] }],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O, P) => {
        const prev = `texture2D(u_prev, (rot(radians(${I.rotate})) * (p / ${I.zoom}) + vec2(${I.drift}, 0.0)) / vec2(u_res.x / u_res.y, 1.0) + 0.5).rgb * ${I.amount}`;
        const b = { max: `max(${I.c}, _f${O.c})`, add: `${I.c} + _f${O.c}`, mix: `mix(_f${O.c}, ${I.c}, step(0.02, dot(${I.c}, vec3(0.333))))` }[P.blend];
        return `vec3 _f${O.c} = ${prev}; vec3 ${O.c} = ${b};`;
      },
      usesFeedback: true },

    /* Salida */
    output: { title: 'Salida', cat: 'Salida', unique: true,
      inputs: [COL('c', 'Color', '#000000')],
      post: [
        { k: 'rgb', label: 'Separación RGB', v: 0, min: 0, max: 1 },
        { k: 'scan', label: 'Scanlines', v: 0, min: 0, max: 1 },
        { k: 'vignette', label: 'Viñeta', v: 0.3, min: 0, max: 1 },
        { k: 'grain', label: 'Grano', v: 0.05, min: 0, max: 1 },
        { k: 'bloom', label: 'Brillo (bloom)', v: 0, min: 0, max: 1 },
        { k: 'blur', label: 'Desenfoque', v: 0, min: 0, max: 1 },
        { k: 'glitch', label: 'Glitch', v: 0, min: 0, max: 1 },
        { k: 'flash', label: 'Flash al pulso', v: 0, min: 0, max: 1 },
      ],
      params: [{ k: 'react', label: 'Reacciona a', v: 'none', options: [['none', 'Nada'], ['level', 'Nivel de audio'], ['bass', 'Graves'], ['high', 'Agudos']] }],
      outputs: [],
      glsl: () => '' },
  };
  const inputsOf = n => { const d = NODES[n.type]; return d && d.dynInputs ? [...(d.inputs || []), ...d.dynInputs(n)] : ((d && d.inputs) || []); };
  const CATEGORIES = ['Entrada', 'Generar', 'Coordenadas', 'Color', 'Efectos', 'Código', 'Salida'];

  /* ── Graph helpers ──────────────────────────────────────── */
  function defaultsFor(type) {
    const d = NODES[type], v = {}, p = {};
    (d.inputs || []).forEach(i => { if (i.v !== undefined) v[i.k] = i.v; });
    (d.post || []).forEach(i => { v[i.k] = i.v; });
    (d.params || []).forEach(i => { p[i.k] = i.v; });
    return { v, p };
  }
  const uniformName = (id, k) => `u_${id}_${k}`;

  // Is `to` reachable upstream from `from`? (used to refuse links that would make a loop)
  function dependsOn(graph, nodeId, targetId, seen = new Set()) {
    if (nodeId === targetId) return true;
    if (seen.has(nodeId)) return false;
    seen.add(nodeId);
    return graph.links.filter(l => l.b === nodeId).some(l => dependsOn(graph, l.a, targetId, seen));
  }

  /* ── Compiler ───────────────────────────────────────────── */
  function compile(graph, target) {   // target = { id, out }: render that output instead of the Output node
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const out = graph.nodes.find(n => n.type === 'output');
    const uniforms = [];      // { name, type: 'float' | 'color', node, key }
    const textures = [];      // { node, kind, p, texName, aspName }  (Image / Text nodes)
    const globals = [];       // functions written by Code / 3D nodes (outside main)
    const lines = [];
    const done = new Set(), visiting = new Set();
    let usesAudio = false, usesFeedback = false;
    const outVar = (id, k) => `n${id}_${k}`;

    function emit(node) {
      if (done.has(node.id)) return;
      if (visiting.has(node.id)) throw new Error('Hay un ciclo en las conexiones');
      visiting.add(node.id);
      const def = NODES[node.type];
      if (!def) throw new Error('Nodo desconocido: ' + node.type);
      const I = {};
      for (const inp of inputsOf(node)) {
        const link = graph.links.find(l => l.b === node.id && l.bi === inp.k);
        const src = link && byId.get(link.a);
        if (src) {
          emit(src);
          const sdef = NODES[src.type];
          const o = (sdef.outputs || []).find(x => x[0] === link.ao);
          I[inp.k] = o ? convert(outVar(src.id, o[0]), o[1], inp.t) : '0.0';
        } else if (inp.t === 'vec2') {
          I[inp.k] = 'p';
        } else {
          const name = uniformName(node.id, inp.k);
          uniforms.push({ name, type: inp.t, node: node.id, key: inp.k });
          I[inp.k] = name;
        }
      }
      const O = {};
      (def.outputs || []).forEach(o => { O[o[0]] = outVar(node.id, o[0]); });
      const P = { ...defaultsFor(node.type).p, ...(node.p || {}) };
      if (def.globals) globals.push(`// ${def.title} #${node.id}\n` + def.globals(P, node.id));
      lines.push(`  // ${def.title} #${node.id}\n  ` + def.glsl(I, O, P, node.id));
      if (def.tex) textures.push({ node: node.id, kind: node.type, p: P, texName: `u_${node.id}_tex`, aspName: `u_${node.id}_aspect` });
      if (def.usesAudio) usesAudio = true;
      if (def.usesFeedback) usesFeedback = true;
      visiting.delete(node.id);
      done.add(node.id);
    }

    let finalExpr = 'vec3(0.0)';
    if (target) {
      const src = byId.get(target.id);
      const o = src && (NODES[src.type].outputs || []).find(x => x[0] === target.out);
      if (o) {
        emit(src);
        const v = outVar(src.id, o[0]);
        // coordinates are shown as a red/green field so you can see what they do
        finalExpr = o[1] === 'vec2' ? `vec3(fract(${v} + 0.5), 0.6)` : convert(v, o[1], 'color');
      }
    } else if (out) {
      const link = graph.links.find(l => l.b === out.id && l.bi === 'c');
      const src = link && byId.get(link.a);
      if (src) {
        emit(src);
        const o = (NODES[src.type].outputs || []).find(x => x[0] === link.ao);
        finalExpr = o ? convert(outVar(src.id, o[0]), o[1], 'color') : finalExpr;
      } else {
        uniforms.push({ name: uniformName(out.id, 'c'), type: 'color', node: out.id, key: 'c' });
        finalExpr = uniformName(out.id, 'c');
      }
    }
    const decl = uniforms.map(u => `uniform ${GLSL_TYPE[u.type]} ${u.name};`)
      .concat(textures.map(t => `uniform sampler2D ${t.texName};\nuniform float ${t.aspName};`)).join('\n');
    const head = ES3 ? `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 nodrusFragColor;
#define texture2D texture` : `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;`;
    const frag = `${head}
uniform vec2 u_res;
uniform float u_time;
uniform float u_beat;
uniform vec4 u_audio;
uniform sampler2D u_prev;
${decl}
${LIB}
${globals.length ? TOY_HEAD + '\n' + globals.join('\n') : ''}
void main(){
  vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
${lines.join('\n')}
  ${ES3 ? 'nodrusFragColor' : 'gl_FragColor'} = vec4(clamp(${finalExpr}, 0.0, 1.0), 1.0);
}`;
    return { frag, uniforms, textures, usesAudio, usesFeedback };
  }

  /* ── Renderer ───────────────────────────────────────────── */
  const VERT = `attribute vec2 a; varying vec2 v_uv; void main(){ v_uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
  const VERT3 = `#version 300 es
in vec2 a; out vec2 v_uv; void main(){ v_uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
  const POST = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_img;
uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_post;    // rgb split, scanlines, vignette, grain
uniform vec4 u_post2;   // bloom, blur, glitch, beat flash
uniform float u_beat;
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec2 uv = v_uv;
  float s = u_post.x * 0.012;
  // glitch: some horizontal bands jump sideways, ~12 times per second
  if (u_post2.z > 0.0) {
    float tt = floor(u_time * 12.0), band = floor(uv.y * 24.0);
    float on = step(1.0 - u_post2.z * 0.55, h(vec2(band, tt)));
    uv.x = fract(uv.x + on * (h(vec2(tt, band + 3.1)) - 0.5) * 0.3 * u_post2.z);
    s += on * u_post2.z * 0.03;
  }
  vec3 c = vec3(texture2D(u_img, uv + vec2(s, 0.0)).r, texture2D(u_img, uv).g, texture2D(u_img, uv - vec2(s, 0.0)).b);
  vec2 asp = vec2(u_res.y / u_res.x, 1.0);
  // blur: 12 samples on a disc
  if (u_post2.y > 0.0) {
    vec3 acc = c;
    for (int i = 0; i < 12; i++) {
      float fi = float(i), r = sqrt((fi + 0.5) / 12.0) * u_post2.y * 0.025;
      acc += texture2D(u_img, uv + vec2(cos(fi * 2.39996), sin(fi * 2.39996)) * r * asp).rgb;
    }
    c = acc / 13.0;
  }
  // bloom: the bright parts glow around
  if (u_post2.x > 0.0) {
    vec3 g = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float fi = float(i), r = sqrt((fi + 0.5) / 16.0) * 0.07;
      g += max(texture2D(u_img, uv + vec2(cos(fi * 2.39996), sin(fi * 2.39996)) * r * asp).rgb - 0.5, 0.0);
    }
    c += g / 16.0 * u_post2.x * 3.5;
  }
  c += u_post2.w * pow(1.0 - fract(u_beat), 4.0) * 0.6;
  c *= 1.0 - u_post.y * 0.5 * (0.5 + 0.5 * cos(uv.y * u_res.y * 2.0944));
  vec2 cc = uv - 0.5;
  c *= 1.0 - u_post.z * smoothstep(0.15, 0.75, dot(cc, cc) * 2.0);
  c += (h(uv * u_res + fract(u_time) * 100.0) - 0.5) * u_post.w * 0.35;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

  // shared clock: beats from the tap tempo (set by the editor / output window every frame)
  const clock = { beat: 0 };
  const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

  /* ── Pictures for Image / Text nodes ──────────────────────
     Images live in IndexedDB (same origin: the output window finds them too). */
  const assets = (() => {
    const mem = new Map();
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('pudrus-lab', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('assets');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const run = (mode, fn) => db().then(d => new Promise((res, rej) => {
      const tx = d.transaction('assets', mode), q = fn(tx.objectStore('assets'));
      tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error);
    }));
    function image(id) {
      let e = mem.get(id);
      if (!e) {
        e = { img: null, v: 0 };
        mem.set(id, e);
        run('readonly', st => st.get(id)).then(b => {
          if (!b) { setTimeout(() => { if (mem.get(id) === e) mem.delete(id); }, 1000); return; }   // not stored yet: retry
          const im = new Image();
          im.onload = () => { e.img = im; e.v++; };
          im.src = URL.createObjectURL(b);
        }).catch(() => setTimeout(() => mem.delete(id), 2000));
      }
      return e;
    }
    return {
      image,
      get: id => run('readonly', st => st.get(id)),
      put: (id, blob) => run('readwrite', st => st.put(blob, id)).then(() => { mem.delete(id); }),
    };
  })();

  const FONTS = {
    sans: '800 150px "Helvetica Neue", Arial, sans-serif',
    display: '900 150px Impact, "Arial Black", sans-serif',
    serif: '700 150px Georgia, "Times New Roman", serif',
    mono: '700 150px "IBM Plex Mono", Consolas, monospace',
    hand: '700 150px "Segoe Script", "Comic Sans MS", cursive',
  };
  const textCache = new Map();
  function textPicture(text, font, color) {
    const key = (font || 'sans') + '|' + (color || '#fff') + '|' + (text || '');
    let c = textCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const f = FONTS[font] || FONTS.sans, lines = String(text || '').split('\n');
    ctx.font = f;
    const lh = 170, pad = 20;
    const w = Math.max(1, ...lines.map(l => Math.ceil(ctx.measureText(l).width)));
    c.width = Math.min(4096, w + pad * 2); c.height = Math.min(4096, lines.length * lh + pad * 2);
    ctx.font = f; ctx.fillStyle = color || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, pad + lh * (i + 0.5)));
    c.key = key;
    if (textCache.size > 60) textCache.clear();
    textCache.set(key, c);
    return c;
  }
  const media = (() => {
    let cam = null;
    const vids = new Map();
    const mkVideo = () => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.loop = true;
      // attached (but invisible) so every browser keeps decoding frames
      v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      (document.body || document.documentElement).append(v);
      return v;
    };
    function camera() {
      if (!cam) {
        cam = { el: mkVideo(), ok: false, err: false };
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
            .then(st => { cam.el.srcObject = st; cam.el.play().catch(() => {}); cam.ok = true; })
            .catch(() => { cam.err = true; });
        } else cam.err = true;
      }
      return cam;
    }
    function video(id) {
      let v = vids.get(id);
      if (!v) {
        v = { el: mkVideo(), ok: false };
        vids.set(id, v);
        assets.get(id).then(b => {
          if (!b) { setTimeout(() => { if (vids.get(id) === v) { v.el.remove(); vids.delete(id); } }, 1000); return; }
          v.el.src = URL.createObjectURL(b); v.el.play().catch(() => {}); v.ok = true;
        }).catch(() => {});
      }
      return v;
    }
    return { camera, video, get cameraState() { return cam ? (cam.ok ? 'ok' : cam.err ? 'error' : 'waiting') : 'off'; } };
  })();
  function texSource(t) {
    if (t.kind === 'camera' || t.kind === 'video') {
      if (t.kind === 'video' && !t.p.vid) return null;
      const m = t.kind === 'camera' ? media.camera() : media.video(t.p.vid);
      const el = m.el;
      if (t.kind === 'video') { const r = +t.p.speed || 1; if (el.playbackRate !== r) el.playbackRate = r; if (el.paused && m.ok) el.play().catch(() => {}); }
      if (el.readyState < 2 || !el.videoWidth) return null;
      return { src: el, key: t.kind + (t.p.vid || '') + ':' + el.currentTime, aspect: el.videoWidth / el.videoHeight };
    }
    if (t.kind === 'image') {
      if (!t.p.img) return null;
      const e = assets.image(t.p.img);
      return e.img ? { src: e.img, key: 'i' + t.p.img + ':' + e.v, aspect: e.img.naturalWidth / e.img.naturalHeight } : null;
    }
    const c = textPicture(t.p.text, t.p.font);
    return { src: c, key: 't' + c.key, aspect: c.width / c.height };
  }
  // binds the pictures of a compiled graph to texture units 1, 2, … (unit 0 = feedback)
  function texBinder(gl) {
    const cache = new Map();
    let empty = null;
    return function bind(textures, loc) {
      textures.forEach((t, i) => {
        const s = texSource(t);
        let tex;
        if (!s) {
          if (!empty) {
            empty = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, empty);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
          }
          tex = empty;
        } else {
          let e = cache.get(t.node);
          if (!e) { e = { tex: gl.createTexture(), key: '' }; cache.set(t.node, e); }
          gl.activeTexture(gl.TEXTURE1 + i);
          gl.bindTexture(gl.TEXTURE_2D, e.tex);
          if (e.key !== s.key) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s.src);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            e.key = s.key;
          }
          tex = e.tex;
        }
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(loc[t.texName], 1 + i);
        gl.uniform1f(loc[t.aspName], s ? s.aspect : 1);
      });
      gl.activeTexture(gl.TEXTURE0);
    };
  }

  function makeProgram(gl, fragSrc) {
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(e); }
      return sh;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, fragSrc.startsWith('#version 300 es') ? VERT3 : VERT));
    gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    return pr;
  }
  const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

  function createRenderer(canvas) {
    const gl = glContext(canvas, { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('Este navegador no soporta WebGL');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const program = fragSrc => makeProgram(gl, fragSrc);
    const bindTextures = texBinder(gl);
    let textures = [];
    const post = program(POST);
    const postU = ['u_img', 'u_res', 'u_time', 'u_post', 'u_post2', 'u_beat'].reduce((o, n) => (o[n] = gl.getUniformLocation(post, n), o), {});

    // Two render targets: this frame and the previous one (feedback)
    let targets = [], cur = 0, w = 0, h = 0;
    function target() {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb };
    }
    function resize(nw, nh) {
      nw = Math.max(2, Math.round(nw)); nh = Math.max(2, Math.round(nh));
      if (nw === w && nh === h) return;
      targets.forEach(t => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); });
      w = canvas.width = nw; h = canvas.height = nh;
      targets = [target(), target()];
    }

    let prog = null, loc = {}, uniforms = [];
    const values = {};   // uniform name -> number | [r,g,b]
    function setGraph(compiled) {
      const pr = program(compiled.frag);   // throws on GLSL errors; keeps the previous program
      if (prog) gl.deleteProgram(prog);
      prog = pr;
      uniforms = compiled.uniforms;
      textures = compiled.textures || [];
      loc = {};
      ['u_res', 'u_time', 'u_beat', 'u_audio', 'u_prev'].concat(uniforms.map(u => u.name), textures.flatMap(t => [t.texName, t.aspName])).forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });
    }
    function setValue(name, v) { values[name] = typeof v === 'string' ? hexToRgb(v) : v; }

    function bindQuad(pr) {
      const a = gl.getAttribLocation(pr, 'a');
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    }
    function render(time, audio, postFx) {
      if (!prog || !w) return;
      const prev = targets[cur], next = targets[1 - cur];
      gl.bindFramebuffer(gl.FRAMEBUFFER, next.fb);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      bindQuad(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, prev.tex);
      gl.uniform1i(loc.u_prev, 0);
      gl.uniform2f(loc.u_res, w, h);
      gl.uniform1f(loc.u_time, time);
      gl.uniform1f(loc.u_beat, clock.beat);
      gl.uniform4f(loc.u_audio, audio[0], audio[1], audio[2], audio[3]);
      for (const u of uniforms) {
        const v = values[u.name];
        if (v === undefined) continue;
        if (u.type === 'color') gl.uniform3f(loc[u.name], v[0], v[1], v[2]); else gl.uniform1f(loc[u.name], v);
      }
      if (textures.length) bindTextures(textures, loc);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      // post pass to the screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(post);
      bindQuad(post);
      gl.bindTexture(gl.TEXTURE_2D, next.tex);
      gl.uniform1i(postU.u_img, 0);
      gl.uniform2f(postU.u_res, w, h);
      gl.uniform1f(postU.u_time, time);
      gl.uniform4f(postU.u_post, postFx[0], postFx[1], postFx[2], postFx[3]);
      gl.uniform4f(postU.u_post2, postFx[4] || 0, postFx[5] || 0, postFx[6] || 0, postFx[7] || 0);
      gl.uniform1f(postU.u_beat, clock.beat);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      cur = 1 - cur;
    }
    return { gl, resize, setGraph, setValue, render, get size() { return [w, h]; } };
  }

  // Post-pass values for the Output node, optionally driven by the audio
  function postValues(graph, audio) {
    const out = graph.nodes.find(n => n.type === 'output');
    if (!out) return [0, 0, 0, 0, 0, 0, 0, 0];
    const v = { ...defaultsFor('output').v, ...(out.v || {}) };
    const react = (out.p && out.p.react) || 'none';
    const a = react === 'level' ? audio[0] : react === 'bass' ? audio[1] : react === 'high' ? audio[3] : 0;
    const boost = react === 'none' ? 1 : 0.4 + a * 2.2;
    return [Math.min(1, v.rgb * boost), v.scan, v.vignette, Math.min(1, v.grain * boost),
            Math.min(1, (v.bloom || 0) * boost), v.blur || 0, Math.min(1, (v.glitch || 0) * boost), v.flash || 0];
  }

  // Push every widget value of the graph into the renderer
  function applyValues(renderer, graph, compiled) {
    for (const u of compiled.uniforms) {
      const node = graph.nodes.find(n => n.id === u.node);
      const inp = node && inputsOf(node).find(i => i.k === u.key);
      if (!inp) continue;
      const v = node.v && node.v[u.key] !== undefined ? node.v[u.key] : inp.v;
      renderer.setValue(u.name, v);
    }
  }

  // What changes the shader (node types, option menus, links); values are excluded
  function structureKey(graph) {
    return JSON.stringify({ n: graph.nodes.map(n => [n.id, n.type, n.p]), l: graph.links });
  }

  // name -> value (numbers, or [r,g,b] for colors) for every uniform of a compiled graph
  function uniformValues(graph, compiled) {
    const out = {};
    for (const u of compiled.uniforms) {
      const node = graph.nodes.find(n => n.id === u.node);
      if (!node) continue;
      const inp = inputsOf(node).find(i => i.k === u.key);
      if (!inp) continue;
      const v = node.v && node.v[u.key] !== undefined ? node.v[u.key] : inp.v;
      out[u.name] = typeof v === 'string' ? hexToRgb(v) : v;
    }
    return out;
  }

  /* ── Node thumbnails: one small GL canvas, programs cached per node ── */
  function createThumbs(w = 160, h = 90) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const gl = glContext(canvas, { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const black = gl.createTexture();   // feedback in a thumbnail starts from black
    gl.bindTexture(gl.TEXTURE_2D, black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const cache = new Map();
    const bindTextures = texBinder(gl);
    let inputTex = null, inputTex2 = null;
    const upload = (t, img) => {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    function render(key, compiled, graph, time, audio, input, input2) {
      let e = cache.get(key);
      if (!e) {
        const prog = makeProgram(gl, compiled.frag);
        const loc = {};
        ['u_res', 'u_time', 'u_beat', 'u_audio', 'u_prev', 'u_to'].concat(compiled.uniforms.map(u => u.name), (compiled.textures || []).flatMap(t => [t.texName, t.aspName])).forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });
        e = { prog, loc, compiled };
        cache.set(key, e);
      }
      gl.viewport(0, 0, w, h);
      gl.useProgram(e.prog);
      const a = gl.getAttribLocation(e.prog, 'a');
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      if (input) {   // a test image as the filter's input (iChannel0 / u_prev)
        if (!inputTex) inputTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, inputTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } else gl.bindTexture(gl.TEXTURE_2D, black);
      gl.uniform1i(e.loc.u_prev, 0);
      if (input2) { gl.activeTexture(gl.TEXTURE7); inputTex2 = inputTex2 || gl.createTexture(); upload(inputTex2, input2); gl.uniform1i(e.loc.u_to, 7); gl.activeTexture(gl.TEXTURE0); }
      gl.uniform2f(e.loc.u_res, w, h);
      gl.uniform1f(e.loc.u_time, time);
      gl.uniform1f(e.loc.u_beat, clock.beat);
      gl.uniform4f(e.loc.u_audio, audio[0], audio[1], audio[2], audio[3]);
      const vals = uniformValues(graph, e.compiled);
      for (const u of e.compiled.uniforms) {
        const v = vals[u.name];
        if (v === undefined) continue;
        if (u.type === 'color') gl.uniform3f(e.loc[u.name], v[0], v[1], v[2]); else gl.uniform1f(e.loc[u.name], v);
      }
      if (e.compiled.textures && e.compiled.textures.length) bindTextures(e.compiled.textures, e.loc);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    function clear() { cache.forEach(e => gl.deleteProgram(e.prog)); cache.clear(); }
    return { canvas, render, clear };
  }

  /* ── Overlay layer ───────────────────────────────────────
     ov = { on, items: [{ on, kind: 'image'|'text', img, text, font, color, x, y, size, rot,
            opacity, blend, fx, amount }] } — positions 0–1, size = height on screen */
  // «invertir»: a colour-inverted copy of the picture (alpha kept), cached per source
  const invCache = new WeakMap();
  function invertedPicture(src, sw, sh) {
    let e = invCache.get(src);
    if (e && e.w === sw && e.h === sh && e.ver === src.__ver) return e.c;
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0, sw, sh);
    try {
      const d = x.getImageData(0, 0, sw, sh), a = d.data;
      for (let i = 0; i < a.length; i += 4) { a[i] = 255 - a[i]; a[i + 1] = 255 - a[i + 1]; a[i + 2] = 255 - a[i + 2]; }
      x.putImageData(d, 0, 0);
    } catch (err) { x.globalCompositeOperation = 'difference'; x.fillStyle = '#fff'; x.fillRect(0, 0, sw, sh); x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0, sw, sh); }
    invCache.set(src, { c, w: sw, h: sh, ver: src.__ver });
    return c;
  }
  function drawOverlay(ctx, W, H, ov, time, audio) {
    if (!ov || !ov.on || !Array.isArray(ov.items)) return;
    const beat = clock.beat;
    for (const it of ov.items) {
      if (!it || !it.on) continue;
      let src;
      if (it.kind === 'image') { const e = it.img ? assets.image(it.img) : null; if (!e || !e.img) continue; src = e.img; }
      else src = textPicture(it.text || '', it.font, it.color);
      const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
      if (!sw || !sh) continue;
      const amt = Number.isFinite(it.amount) ? it.amount : 0.5;
      let size = it.size || 0.15, op = Number.isFinite(it.opacity) ? it.opacity : 1, rot = (it.rot || 0) * Math.PI / 180, x = it.x ?? 0.5, y = it.y ?? 0.5;
      const kick = Math.pow(1 - (beat % 1 + 1) % 1, 3);
      if (it.fx === 'bass') size *= 1 + audio[1] * amt * 0.8;
      else if (it.fx === 'beat') size *= 1 + kick * amt * 0.5;
      else if (it.fx === 'spin') rot += time * amt * 2;
      else if (it.fx === 'float') { x += Math.sin(time * 0.7) * 0.04 * amt; y += Math.cos(time * 0.93) * 0.04 * amt; rot += Math.sin(time * 0.5) * 0.15 * amt; }
      else if (it.fx === 'blink') op *= Math.floor(beat * 2) % 2 ? 1 - amt : 1;
      else if (it.fx === 'breathe') op *= 1 - amt * (0.5 + 0.5 * Math.sin(time * 1.6));
      const h = size * H, w = h * sw / sh;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, op));
      if (it.blend === 'invert') { src = invertedPicture(src, sw, sh); ctx.globalCompositeOperation = 'source-over'; }
      else ctx.globalCompositeOperation = it.blend || 'source-over';
      ctx.translate(x * W, y * H); ctx.rotate(rot);
      if (it.fx === 'glitch' && Math.random() < 0.15 + amt * 0.5) {
        // a few slices jump sideways
        let yy = 0;
        while (yy < sh) {
          const hh = Math.max(1, Math.round(sh * (0.05 + Math.random() * 0.2)));
          const dx = Math.random() < amt ? (Math.random() - 0.5) * w * 0.25 * amt : 0;
          ctx.drawImage(src, 0, yy, sw, Math.min(hh, sh - yy), -w / 2 + dx, -h / 2 + yy / sh * h, w, Math.min(hh, sh - yy) / sh * h);
          yy += hh;
        }
      } else ctx.drawImage(src, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  /* ── Live stage: two patches, cross-faded ──────────────────────
     composite: true -> both layers are drawn into one visible 2D canvas (recordable);
     false -> two stacked WebGL canvases faded with CSS (cheaper, for the projector). */
  function createStage(container, opts = {}) {
    const composite = !!opts.composite, bare = !!opts.bare;
    const mkLayer = () => {
      const c = document.createElement('canvas');
      if (!composite) { c.className = 'stage-layer'; container.append(c); }
      return { c, r: createRenderer(c), graph: null, key: '', comp: null };
    };
    const layers = [mkLayer(), mkLayer()];
    let out = null, octx = null;
    if (composite) { out = document.createElement('canvas'); out.className = 'stage-out'; container.append(out); octx = out.getContext('2d'); }
    let front = 0, fade = null, trans = null;
    // master: fade to black and strobe, applied over everything that is on air
    const master = { black: 0, target: 0, speed: 2, strobe: false, last: performance.now() };
    let veil = null, ovCanvas = null, ovCtx = null, overlay = null, ovDrawn = false;
    if (!composite) {
      ovCanvas = document.createElement('canvas'); ovCanvas.className = 'stage-overlay';
      ovCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none';
      container.append(ovCanvas); ovCtx = ovCanvas.getContext('2d');
      veil = document.createElement('div'); veil.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;background:#000'; container.append(veil);
    }
    function paintOverlay(time, audio) {
      if (composite) { drawOverlay(octx, out.width, out.height, overlay, time, audio); return; }
      const show = overlay && overlay.on && overlay.items && overlay.items.some(i => i && i.on);
      if (!show && !ovDrawn) return;
      ovCtx.clearRect(0, 0, ovCanvas.width, ovCanvas.height);
      ovDrawn = !!show;
      if (show) drawOverlay(ovCtx, ovCanvas.width, ovCanvas.height, overlay, time, audio);
    }
    function drawMaster() {
      const now = performance.now(), dt = Math.min(0.1, (now - master.last) / 1000); master.last = now;
      if (master.black !== master.target) {
        const d = master.speed * dt;
        master.black = master.target > master.black ? Math.min(master.target, master.black + d) : Math.max(master.target, master.black - d);
      }
      const flash = master.strobe && Math.floor(now / 45) % 2 === 0;
      master.flash = flash;
      if (composite) {
        if (master.black > 0) { octx.globalAlpha = master.black; octx.fillStyle = '#000'; octx.fillRect(0, 0, out.width, out.height); }
        if (flash) { octx.globalAlpha = 1; octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height); }
        octx.globalAlpha = 1;
      } else {
        veil.style.background = flash ? '#fff' : '#000';
        veil.style.opacity = flash ? 1 : master.black;
      }
    }
    function load(layer, graph) {
      const k = structureKey(graph);
      if (k !== layer.key) { const comp = compile(graph); layer.r.setGraph(comp); layer.comp = comp; layer.key = k; }
      applyValues(layer.r, graph, layer.comp);
      layer.graph = graph;
    }
    function paint() {
      if (composite) return;
      const f = layers[front], b = layers[1 - front];
      f.c.style.zIndex = 1; b.c.style.zIndex = 2;
      f.c.style.opacity = 1;
      b.c.style.opacity = fade ? fade.k : 0;
    }
    return {
      resize(w, h) {
        layers.forEach(l => l.r.resize(w, h));
        if (out) { out.width = Math.round(w); out.height = Math.round(h); }
        if (ovCanvas) { ovCanvas.width = Math.round(w); ovCanvas.height = Math.round(h); ovDrawn = true; }
      },
      setOverlay(ov) { overlay = ov; },
      get overlay() { return overlay; },
      setTransition(t) { trans = t && t.code ? t : null; },
      // free the GPU contexts (temporary stages, e.g. the video renderer)
      destroy() { layers.forEach(l => { const x = l.r.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }); },
      get canvas() { return out || layers[front].c; },
      get graph() { return layers[front].graph; },
      // replace what is live right now (no fade): used by "direct" mode
      direct(graph) { load(fade ? layers[1 - front] : layers[front], graph); },   // during a fade, edit the incoming patch
      // bring a new patch on air, cross-fading over `seconds`
      go(graph, seconds) {
        const back = layers[1 - front];
        load(back, graph);
        if (!seconds || !layers[front].graph) { front = 1 - front; fade = null; paint(); return; }
        fade = { start: performance.now(), dur: seconds * 1000, k: 0 };
      },
      render(time, audio) {
        const f = layers[front], b = layers[1 - front];
        if (fade) {
          fade.k = Math.min(1, (performance.now() - fade.start) / fade.dur);
          if (f.graph) f.r.render(time, audio, postValues(f.graph, audio));
          if (b.graph) b.r.render(time, audio, postValues(b.graph, audio));
          if (composite) {
            const tc = trans && f.graph && b.graph ? transEngine() : null;
            const img = tc && tc.run(f.c, b.c, trans, fade.k, time, audio);
            if (img) { octx.globalAlpha = 1; octx.drawImage(img, 0, 0, out.width, out.height); }
            else {
              octx.globalAlpha = 1; octx.drawImage(f.c, 0, 0, out.width, out.height);
              octx.globalAlpha = fade.k; octx.drawImage(b.c, 0, 0, out.width, out.height);
              octx.globalAlpha = 1;
            }
          }
          paint();
          if (fade.k >= 1) { front = 1 - front; fade = null; paint(); }
        } else {
          if (f.graph) {
            f.r.render(time, audio, postValues(f.graph, audio));
            if (composite) octx.drawImage(f.c, 0, 0, out.width, out.height);
          }
          paint();
        }
        if (!bare) { paintOverlay(time, audio); drawMaster(); }
      },
      get fading() { return !!fade; },
      // fade to / from black over `seconds` (0 = cut)
      setBlack(on, seconds) { master.target = on ? 1 : 0; master.speed = seconds > 0 ? 1 / seconds : 1e9; },
      get black() { return master.target === 1; },
      setStrobe(on) { master.strobe = !!on; },
      get strobe() { return master.strobe; },
      // current black amount and strobe flash, to mirror them on other monitors
      get veil() { return { black: master.black, flash: !!master.flash }; },
    };
  }

  /* ── Mixer: two decks like Resolume's A/B, crossfaded or blended ──
     Same API as a composite stage (go/direct/render/…) acting on the selected deck. */
  /* ── Screen filters: a chain of image effects (ISF filters, GLSL) applied to the final picture ──
     Each filter is a GLSL node whose iChannel0 / inputImage is the image coming in. */
  const FX_BLIT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv; uniform sampler2D u_a; uniform sampler2D u_b; uniform float u_k;
void main(){ gl_FragColor = vec4(mix(texture2D(u_a, v_uv).rgb, texture2D(u_b, v_uv).rgb, u_k), 1.0); }`;
  const fxGraph = f => ({ nodes: [{ id: 1, type: 'glsl', v: f.v || {}, p: { code: f.code } }, { id: 2, type: 'output', v: {}, p: {} }], links: [{ a: 1, ao: 'c', b: 2, bi: 'c' }] });
  function createFxChain() {
    const canvas = document.createElement('canvas');
    const gl = glContext(canvas, { preserveDrawingBuffer: false, antialias: false, alpha: false });
    if (!gl) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const blit = makeProgram(gl, FX_BLIT);
    const bl = { a: gl.getUniformLocation(blit, 'u_a'), b: gl.getUniformLocation(blit, 'u_b'), k: gl.getUniformLocation(blit, 'u_k') };
    const tex = () => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const src = tex();
    let w = 0, h = 0, fbs = [];
    function size(nw, nh) {
      if (nw === w && nh === h) return;
      w = nw; h = nh; canvas.width = w; canvas.height = h;
      fbs.forEach(f => { gl.deleteTexture(f.t); gl.deleteFramebuffer(f.fb); });
      fbs = [0, 1, 2].map(() => {
        const t = tex(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return { t, fb };
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const cache = new Map();   // code -> program (or the error)
    function prog(f) {
      let e = cache.get(f.code);
      if (!e) {
        try {
          const c = compile(fxGraph(f)), pr = makeProgram(gl, c.frag), loc = {};
          ['u_res', 'u_time', 'u_beat', 'u_audio', 'u_prev'].concat(c.uniforms.map(u => u.name)).forEach(n => { loc[n] = gl.getUniformLocation(pr, n); });
          e = { pr, loc, c };
        } catch (er) { e = { error: String(er.message || er) }; }
        if (cache.size > 40) { cache.forEach(x => x.pr && gl.deleteProgram(x.pr)); cache.clear(); }
        cache.set(f.code, e);
      }
      return e;
    }
    const quad = pr => { const a = gl.getAttribLocation(pr, 'a'); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); };
    // source: a canvas with the picture · list: [{ code, v, mix, on }] · returns this canvas, filtered
    function run(source, list, time, audio) {
      size(source.width, source.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      let cur = src, used = 0;
      const pick = (...busy) => fbs.find(f => !busy.includes(f.t));
      for (const f of list) {
        const e = prog(f);
        if (!e.pr) continue;
        const out = pick(cur);
        gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, w, h);
        gl.useProgram(e.pr); quad(e.pr);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur); gl.uniform1i(e.loc.u_prev, 0);
        gl.uniform2f(e.loc.u_res, w, h); gl.uniform1f(e.loc.u_time, time); gl.uniform1f(e.loc.u_beat, clock.beat);
        gl.uniform4f(e.loc.u_audio, audio[0], audio[1], audio[2], audio[3]);
        const vals = uniformValues(fxGraph(f), e.c);
        for (const u of e.c.uniforms) { const v = vals[u.name]; if (v === undefined) continue; if (u.type === 'color') gl.uniform3f(e.loc[u.name], v[0], v[1], v[2]); else gl.uniform1f(e.loc[u.name], v); }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        let res = out.t;
        const k = Number.isFinite(f.mix) ? Math.max(0, Math.min(1, f.mix)) : 1;
        if (k < 0.999) {   // blend the effect with what came in
          const m = pick(cur, out.t);
          gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb); gl.useProgram(blit); quad(blit);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur); gl.uniform1i(bl.a, 0);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, out.t); gl.uniform1i(bl.b, 1);
          gl.uniform1f(bl.k, k); gl.drawArrays(gl.TRIANGLES, 0, 6);
          gl.activeTexture(gl.TEXTURE0);
          res = m.t;
        }
        cur = res; used++;
      }
      if (!used) return null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      gl.useProgram(blit); quad(blit);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur); gl.uniform1i(bl.a, 0); gl.uniform1i(bl.b, 0); gl.uniform1f(bl.k, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return canvas;
    }
    const errorOf = f => (prog(f).error || '');
    const destroy = () => { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); };
    return { run, errorOf, destroy, canvas };
  }

  /* ── Transitions: a shader that goes from one picture to another as `progress` goes 0 → 1
     (ISF transitions: iChannel0 = from, iChannel1 = to). t = { code, v, param } */
  function createTransition() {
    const canvas = document.createElement('canvas');
    const gl = glContext(canvas, { preserveDrawingBuffer: false, antialias: false, alpha: false });
    if (!gl) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const tex = () => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const ta = tex(), tb = tex();
    const up = (t, img) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); };
    const cache = new Map();
    function prog(t) {
      let e = cache.get(t.code);
      if (!e) {
        try {
          const c = compile(fxGraph(t)), pr = makeProgram(gl, c.frag), loc = {};
          ['u_res', 'u_time', 'u_beat', 'u_audio', 'u_prev', 'u_to'].concat(c.uniforms.map(u => u.name)).forEach(n => { loc[n] = gl.getUniformLocation(pr, n); });
          e = { pr, loc, c };
        } catch (er) { e = { error: String(er.message || er) }; }
        if (cache.size > 30) { cache.forEach(x => x.pr && gl.deleteProgram(x.pr)); cache.clear(); }
        cache.set(t.code, e);
      }
      return e;
    }
    // draws the transition between two canvases at progress k; returns this canvas (or null if it can't)
    function run(from, to, t, k, time, audio) {
      const e = prog(t);
      if (!e.pr) return null;
      const w = from.width, h = from.height;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.activeTexture(gl.TEXTURE0); up(ta, from);
      gl.activeTexture(gl.TEXTURE1); up(tb, to);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      gl.useProgram(e.pr);
      const a = gl.getAttribLocation(e.pr, 'a'); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ta); gl.uniform1i(e.loc.u_prev, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tb); gl.uniform1i(e.loc.u_to, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(e.loc.u_res, w, h); gl.uniform1f(e.loc.u_time, time); gl.uniform1f(e.loc.u_beat, clock.beat);
      gl.uniform4f(e.loc.u_audio, audio[0], audio[1], audio[2], audio[3]);
      const vals = uniformValues(fxGraph({ code: t.code, v: { ...(t.v || {}), [t.param || 'g_progress']: k } }), e.c);
      for (const u of e.c.uniforms) { const v = vals[u.name]; if (v === undefined) continue; if (u.type === 'color') gl.uniform3f(e.loc[u.name], v[0], v[1], v[2]); else gl.uniform1f(e.loc[u.name], v); }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return canvas;
    }
    return { run, errorOf: t => prog(t).error || '', canvas };
  }
  let sharedTrans = null;
  const transEngine = () => sharedTrans || (sharedTrans = createTransition());

  function createMixer(container) {
    const scratch = document.createElement('div');
    const decks = { A: createStage(scratch, { composite: true, bare: true }), B: createStage(scratch, { composite: true, bare: true }) };
    const out = document.createElement('canvas'); out.className = 'stage-out'; container.append(out);
    const ctx = out.getContext('2d');
    let deck = 'A', x = 0, mode = 'mix', overlay = null, fx = null, fxChain = null, trans = null;
    const master = { black: 0, target: 0, speed: 2, strobe: false, flash: false, last: performance.now() };
    const empty = { nodes: [], links: [] };
    decks.B.go(empty, 0);
    function drawMaster() {
      const now = performance.now(), dt = Math.min(0.1, (now - master.last) / 1000); master.last = now;
      if (master.black !== master.target) {
        const d = master.speed * dt;
        master.black = master.target > master.black ? Math.min(master.target, master.black + d) : Math.max(master.target, master.black - d);
      }
      master.flash = master.strobe && Math.floor(now / 45) % 2 === 0;
      if (master.black > 0) { ctx.globalAlpha = master.black; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, out.width, out.height); }
      if (master.flash) { ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height); }
      ctx.globalAlpha = 1;
    }
    const D = d => decks[d === 'B' ? 'B' : d === 'A' ? 'A' : deck];
    return {
      resize(w, h) { decks.A.resize(w, h); decks.B.resize(w, h); out.width = Math.round(w); out.height = Math.round(h); },
      get canvas() { return out; },
      get graph() { return D().graph; },
      graphOf(d) { return D(d).graph; },
      get deck() { return deck; }, set deck(d) { deck = d === 'B' ? 'B' : 'A'; },
      get x() { return x; }, set x(v) { x = Math.min(1, Math.max(0, +v || 0)); },
      get mode() { return mode; }, set mode(m) { mode = ['mix', 'trans', 'lighter', 'screen', 'multiply', 'difference'].includes(m) ? m : 'mix'; },
      go(graph, seconds, d) { D(d).go(graph, seconds); },
      direct(graph, d) { D(d).direct(graph); },
      get fading() { return D().fading; },
      render(time, audio) {
        const tmode = mode === 'trans' && trans;
        const needA = !((mode === 'mix' || tmode) && x >= 1), needB = x > 0;
        if (needA) decks.A.render(time, audio);
        if (needB) decks.B.render(time, audio);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        // crossfader through a transition (A → B)
        const img = tmode && needA && needB ? transEngine() && transEngine().run(decks.A.canvas, decks.B.canvas, trans, x, time, audio) : null;
        if (img) ctx.drawImage(img, 0, 0, out.width, out.height);
        else if (needA) ctx.drawImage(decks.A.canvas, 0, 0, out.width, out.height); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, out.width, out.height); }
        if (needB && !img) {
          ctx.globalAlpha = x;
          if (mode !== 'mix' && mode !== 'trans') ctx.globalCompositeOperation = mode;
          ctx.drawImage(decks.B.canvas, 0, 0, out.width, out.height);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
        // screen filters on the mix, under the logo layer and black/strobe
        const active = fx && fx.on && Array.isArray(fx.list) ? fx.list.filter(f => f && f.on && f.code) : [];
        if (active.length) {
          fxChain = fxChain || createFxChain();
          const c = fxChain && fxChain.run(out, active, time, audio);
          if (c) ctx.drawImage(c, 0, 0, out.width, out.height);
        }
        drawOverlay(ctx, out.width, out.height, overlay, time, audio);
        drawMaster();
      },
      setOverlay(ov) { overlay = ov; },
      get overlay() { return overlay; },
      setBlack(on, seconds) { master.target = on ? 1 : 0; master.speed = seconds > 0 ? 1 / seconds : 1e9; },
      get black() { return master.target === 1; },
      setStrobe(on) { master.strobe = !!on; },
      get strobe() { return master.strobe; },
      get veil() { return { black: master.black, flash: master.flash }; },
      setFx(f) { fx = f; },
      setTransition(t) { trans = t && t.code ? t : null; decks.A.setTransition(trans); decks.B.setTransition(trans); },
      get transition() { return trans; },
      transError: t => { const e = transEngine(); return e ? e.errorOf(t) : 'sin WebGL'; },
      get fx() { return fx; },
      fxError: f => (fxChain ? fxChain.errorOf(f) : ''),
      destroy() { decks.A.destroy(); decks.B.destroy(); if (fxChain) fxChain.destroy(); out.remove(); },
    };
  }

  window.PudrusNodes = { createTransition, createFxChain, ES3, inputsOf, glslParams, clock, assets, media, drawOverlay, textPicture, createMixer, GLSL_TEMPLATES, NODES, CATEGORIES, compile, createRenderer, createThumbs, createStage, structureKey, uniformValues, defaultsFor, dependsOn, uniformName, postValues, applyValues };
})();
