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

  const NODES = {
    /* Entrada */
    time: { title: 'Tiempo', cat: 'Entrada',
      inputs: [F('speed', 'Velocidad', 1, 0, 5)],
      outputs: [['t', 'float', 'Tiempo'], ['wave', 'float', 'Onda'], ['ramp', 'float', 'Rampa']],
      glsl: (I, O) => `float ${O.t} = u_time * ${I.speed}; float ${O.wave} = sin(${O.t}) * 0.5 + 0.5; float ${O.ramp} = fract(${O.t});` },
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
      params: [{ k: 'shape', label: 'Forma', v: 'sine', options: [['sine', 'Seno'], ['tri', 'Triángulo'], ['saw', 'Sierra'], ['square', 'Cuadrada'], ['random', 'Aleatoria']] }],
      outputs: [['v', 'float', 'Valor']],
      glsl: (I, O, P) => {
        const ph = `(u_time * ${I.speed})`;
        const shape = { sine: `sin(${ph} * 6.28318) * 0.5 + 0.5`, tri: `abs(fract(${ph}) * 2.0 - 1.0)`, saw: `fract(${ph})`,
                        square: `step(0.5, fract(${ph}))`, random: `hash21(vec2(floor(${ph}), 7.0))` }[P.shape];
        return `float ${O.v} = mix(${I.min}, ${I.max}, ${shape});`;
      } },
    audio: { title: 'Audio', cat: 'Entrada',
      inputs: [F('gain', 'Ganancia', 1, 0, 4)],
      outputs: [['level', 'float', 'Nivel'], ['bass', 'float', 'Graves'], ['mid', 'float', 'Medios'], ['high', 'float', 'Agudos']],
      glsl: (I, O) => `vec4 _a${O.level} = clamp(u_audio * ${I.gain}, 0.0, 1.0); float ${O.level} = _a${O.level}.x; float ${O.bass} = _a${O.level}.y; float ${O.mid} = _a${O.level}.z; float ${O.high} = _a${O.level}.w;`,
      usesAudio: true },

    /* Generar */
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
      params: [{ k: 'pal', label: 'Paleta', v: 'neon', options: [['neon', 'Neón'], ['fire', 'Fuego'], ['ocean', 'Océano'], ['rainbow', 'Arcoíris'], ['vapor', 'Vapor'], ['mono', 'Mono']] }],
      outputs: [['c', 'color', 'Color']],
      glsl: (I, O, P) => {
        const pals = {
          neon: ['vec3(0.1, 0.5, 0.2)', 'vec3(0.1, 0.5, 0.2)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.0, 0.1, 0.2)'],
          fire: ['vec3(0.5, 0.2, 0.05)', 'vec3(0.5, 0.3, 0.1)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.0, 0.1, 0.2)'],
          ocean: ['vec3(0.1, 0.3, 0.5)', 'vec3(0.1, 0.3, 0.5)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.5, 0.4, 0.3)'],
          rainbow: ['vec3(0.5)', 'vec3(0.5)', 'vec3(1.0)', 'vec3(0.0, 0.33, 0.67)'],
          vapor: ['vec3(0.5, 0.3, 0.6)', 'vec3(0.5, 0.3, 0.4)', 'vec3(1.0, 1.0, 1.0)', 'vec3(0.8, 0.9, 0.3)'],
          mono: ['vec3(0.5)', 'vec3(0.5)', 'vec3(0.5)', 'vec3(0.0)'],
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
      ],
      params: [{ k: 'react', label: 'Reacciona a', v: 'none', options: [['none', 'Nada'], ['level', 'Nivel de audio'], ['bass', 'Graves'], ['high', 'Agudos']] }],
      outputs: [],
      glsl: () => '' },
  };
  const CATEGORIES = ['Entrada', 'Generar', 'Coordenadas', 'Color', 'Efectos', 'Salida'];

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
      for (const inp of def.inputs || []) {
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
      lines.push(`  // ${def.title} #${node.id}\n  ` + def.glsl(I, O, P, node.id));
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
    const decl = uniforms.map(u => `uniform ${GLSL_TYPE[u.type]} ${u.name};`).join('\n');
    const frag = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_audio;
uniform sampler2D u_prev;
${decl}
${LIB}
void main(){
  vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
${lines.join('\n')}
  gl_FragColor = vec4(clamp(${finalExpr}, 0.0, 1.0), 1.0);
}`;
    return { frag, uniforms, usesAudio, usesFeedback };
  }

  /* ── Renderer ───────────────────────────────────────────── */
  const VERT = `attribute vec2 a; varying vec2 v_uv; void main(){ v_uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
  const POST = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_img;
uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_post;   // rgb split, scanlines, vignette, grain
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec2 uv = v_uv;
  float s = u_post.x * 0.012;
  vec3 c = vec3(texture2D(u_img, uv + vec2(s, 0.0)).r, texture2D(u_img, uv).g, texture2D(u_img, uv - vec2(s, 0.0)).b);
  c *= 1.0 - u_post.y * 0.5 * (0.5 + 0.5 * cos(uv.y * u_res.y * 2.0944));
  vec2 cc = uv - 0.5;
  c *= 1.0 - u_post.z * smoothstep(0.15, 0.75, dot(cc, cc) * 2.0);
  c += (h(uv * u_res + fract(u_time) * 100.0) - 0.5) * u_post.w * 0.35;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

  const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

  function makeProgram(gl, fragSrc) {
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(e); }
      return sh;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    return pr;
  }
  const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('Este navegador no soporta WebGL');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const program = fragSrc => makeProgram(gl, fragSrc);
    const post = program(POST);
    const postU = ['u_img', 'u_res', 'u_time', 'u_post'].reduce((o, n) => (o[n] = gl.getUniformLocation(post, n), o), {});

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
      loc = {};
      ['u_res', 'u_time', 'u_audio', 'u_prev'].concat(uniforms.map(u => u.name)).forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });
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
      gl.uniform4f(loc.u_audio, audio[0], audio[1], audio[2], audio[3]);
      for (const u of uniforms) {
        const v = values[u.name];
        if (v === undefined) continue;
        if (u.type === 'color') gl.uniform3f(loc[u.name], v[0], v[1], v[2]); else gl.uniform1f(loc[u.name], v);
      }
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
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      cur = 1 - cur;
    }
    return { gl, resize, setGraph, setValue, render, get size() { return [w, h]; } };
  }

  // Post-pass values for the Output node, optionally driven by the audio
  function postValues(graph, audio) {
    const out = graph.nodes.find(n => n.type === 'output');
    if (!out) return [0, 0, 0, 0];
    const v = { ...defaultsFor('output').v, ...(out.v || {}) };
    const react = (out.p && out.p.react) || 'none';
    const a = react === 'level' ? audio[0] : react === 'bass' ? audio[1] : react === 'high' ? audio[3] : 0;
    const boost = react === 'none' ? 1 : 0.4 + a * 2.2;
    return [Math.min(1, v.rgb * boost), v.scan, v.vignette, Math.min(1, v.grain * boost)];
  }

  // Push every widget value of the graph into the renderer
  function applyValues(renderer, graph, compiled) {
    for (const u of compiled.uniforms) {
      const node = graph.nodes.find(n => n.id === u.node);
      const def = NODES[node.type];
      const inp = def.inputs.find(i => i.k === u.key);
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
      const inp = NODES[node.type].inputs.find(i => i.k === u.key);
      const v = node.v && node.v[u.key] !== undefined ? node.v[u.key] : inp.v;
      out[u.name] = typeof v === 'string' ? hexToRgb(v) : v;
    }
    return out;
  }

  /* ── Node thumbnails: one small GL canvas, programs cached per node ── */
  function createThumbs(w = 160, h = 90) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const black = gl.createTexture();   // feedback in a thumbnail starts from black
    gl.bindTexture(gl.TEXTURE_2D, black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const cache = new Map();
    function render(key, compiled, graph, time, audio) {
      let e = cache.get(key);
      if (!e) {
        const prog = makeProgram(gl, compiled.frag);
        const loc = {};
        ['u_res', 'u_time', 'u_audio', 'u_prev'].concat(compiled.uniforms.map(u => u.name)).forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });
        e = { prog, loc, compiled };
        cache.set(key, e);
      }
      gl.viewport(0, 0, w, h);
      gl.useProgram(e.prog);
      const a = gl.getAttribLocation(e.prog, 'a');
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, black);
      gl.uniform1i(e.loc.u_prev, 0);
      gl.uniform2f(e.loc.u_res, w, h);
      gl.uniform1f(e.loc.u_time, time);
      gl.uniform4f(e.loc.u_audio, audio[0], audio[1], audio[2], audio[3]);
      const vals = uniformValues(graph, e.compiled);
      for (const u of e.compiled.uniforms) {
        const v = vals[u.name];
        if (v === undefined) continue;
        if (u.type === 'color') gl.uniform3f(e.loc[u.name], v[0], v[1], v[2]); else gl.uniform1f(e.loc[u.name], v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    function clear() { cache.forEach(e => gl.deleteProgram(e.prog)); cache.clear(); }
    return { canvas, render, clear };
  }

  /* ── Live stage: two patches, cross-faded ──────────────────────
     composite: true -> both layers are drawn into one visible 2D canvas (recordable);
     false -> two stacked WebGL canvases faded with CSS (cheaper, for the projector). */
  function createStage(container, opts = {}) {
    const composite = !!opts.composite;
    const mkLayer = () => {
      const c = document.createElement('canvas');
      if (!composite) { c.className = 'stage-layer'; container.append(c); }
      return { c, r: createRenderer(c), graph: null, key: '', comp: null };
    };
    const layers = [mkLayer(), mkLayer()];
    let out = null, octx = null;
    if (composite) { out = document.createElement('canvas'); out.className = 'stage-out'; container.append(out); octx = out.getContext('2d'); }
    let front = 0, fade = null;
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
      },
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
            octx.globalAlpha = 1; octx.drawImage(f.c, 0, 0, out.width, out.height);
            octx.globalAlpha = fade.k; octx.drawImage(b.c, 0, 0, out.width, out.height);
            octx.globalAlpha = 1;
          }
          paint();
          if (fade.k >= 1) { front = 1 - front; fade = null; paint(); }
          return;
        }
        if (f.graph) {
          f.r.render(time, audio, postValues(f.graph, audio));
          if (composite) octx.drawImage(f.c, 0, 0, out.width, out.height);
        }
        paint();
      },
      get fading() { return !!fade; },
    };
  }

  window.PudrusNodes = { NODES, CATEGORIES, compile, createRenderer, createThumbs, createStage, structureKey, uniformValues, defaultsFor, dependsOn, uniformName, postValues, applyValues };
})();
