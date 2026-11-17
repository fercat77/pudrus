/* PARTRUS — particle systems on the GPU (WebGL 2), own code.
   Shared by the PARTRUS editor (lab/partrus/) and NODRUS (node «Partículas»).

   A system is a small node graph, like a NODRUS patch:
     { v: 1, name, nodes: [{ id, type, x, y, v: {input: value}, p: {param: option} }], links: [{ a, ao, b, bi }] }
   The particles flow along a chain  Emisor → (fuerzas…) → Aspecto → Salida ; value nodes (LFO, audio, pulso)
   plug into any number input.

   The simulation lives in float textures (position + age, velocity + life), one texel per particle,
   updated by a fragment shader every frame (ping-pong). The particles are drawn as points into a
   half-float picture (with optional trails), then copied to ONE shared canvas per page — that canvas is
   what NODRUS uploads as a texture, like a video frame. One WebGL context for every system on the page. */
(function () {
  'use strict';
  const F = (k, label, v, min, max, extra) => Object.assign({ k, label, t: 'float', v, min, max }, extra || {});
  const COL = (k, label, v) => ({ k, label, t: 'color', v });
  const PIN = { k: 'in', label: 'Partículas', t: 'part' };
  const POUT = ['out', 'part', 'Partículas'];
  const TRIG = [['beat', 'cada tiempo'], ['2', 'cada 2 tiempos'], ['bar', 'cada compás'], ['bass', 'golpe de graves']];

  const CATS = {
    emit: { title: 'Emisor', color: '#b33b3b' },
    force: { title: 'Fuerzas', color: '#3b6ab3' },
    look: { title: 'Aspecto', color: '#a8862c' },
    val: { title: 'Valores', color: '#3b9a8a' },
    out: { title: 'Salida', color: '#4a4a55' },
  };

  const DIRS = [['out', 'hacia afuera'], ['up', 'hacia arriba'], ['down', 'hacia abajo'], ['left', 'a la izquierda'], ['right', 'a la derecha'], ['random', 'al azar'], ['spin', 'girando'], ['front', 'hacia la cámara'], ['back', 'hacia el fondo'], ['still', 'quietas']];
  const COUNTS = [['16384', '16 mil'], ['65536', '65 mil'], ['262144', '262 mil'], ['1048576', '1 millón']];
  const BURSTS = [['cont', 'continua'], ['beat', 'ráfaga cada tiempo'], ['2', 'ráfaga cada 2 tiempos'], ['bar', 'ráfaga cada compás'], ['bass', 'ráfaga con los graves']];
  const FONT_OPTS = [['sans', 'sans negrita'], ['display', 'display'], ['serif', 'serif'], ['mono', 'mono'], ['hand', 'manuscrita']];
  const DEFS = {
    emit: { title: 'Emisor', cat: 'emit', unique: true, outputs: [POUT],
      help: 'De dónde nacen las partículas, hacia dónde salen y cuánto viven',
      inputs: [F('x', 'Posición X', 0, -2, 2), F('y', 'Posición Y', 0, -1.5, 1.5), F('z', 'Profundidad', 0, -6, 1), F('size', 'Tamaño', 0.25, 0, 2), F('speed', 'Velocidad', 0.4, 0, 3),
               F('chaos', 'Azar', 0.5, 0, 1), F('life', 'Vida (s)', 3, 0.2, 15), F('lifeVar', 'Vida variable', 0.5, 0, 1)],
      params: [{ k: 'shape', label: 'Forma', v: 'point', options: [['point', 'punto'], ['ring', 'anillo'], ['disc', 'disco'], ['line', 'línea'], ['box', 'rectángulo'], ['screen', 'toda la pantalla'], ['sphere', 'esfera 3D']] },
               { k: 'dir', label: 'Salen', v: 'out', options: DIRS },
               { k: 'count', label: 'Cantidad', v: '65536', options: COUNTS },
               { k: 'burst', label: 'Emisión', v: 'cont', options: BURSTS }] },
    // particles born on a text, a picture or what the camera sees (params with `when` only show for that source)
    form: { title: 'Emisor de forma', cat: 'emit', unique: true, outputs: [POUT],
      help: 'Las partículas nacen sobre un texto, una imagen o lo que ve la cámara',
      inputs: [F('x', 'Posición X', 0, -2, 2), F('y', 'Posición Y', 0, -1.5, 1.5), F('z', 'Profundidad', 0, -6, 1), F('size', 'Tamaño', 1.2, 0.05, 3), F('speed', 'Velocidad', 0, 0, 3),
               F('chaos', 'Azar', 0.3, 0, 1), F('life', 'Vida (s)', 8, 0.2, 30), F('lifeVar', 'Vida variable', 0.3, 0, 1)],
      params: [{ k: 'src', label: 'Forma', v: 'text', options: [['text', 'texto'], ['image', 'imagen'], ['camera', 'cámara']] },
               { k: 'text', label: 'Texto', kind: 'text', v: 'PUDRUS', when: { src: 'text' } },
               { k: 'font', label: 'Letra', v: 'sans', options: FONT_OPTS, when: { src: 'text' } },
               { k: 'img', label: 'Imagen', kind: 'image', v: '', when: { src: 'image' } },
               { k: 'pick', label: 'Toma', v: 'auto', options: [['auto', 'lo que no es transparente'], ['bright', 'lo claro'], ['dark', 'lo oscuro']], when: { src: 'image' } },
               { k: 'cam', label: 'Toma', v: 'motion', options: [['motion', 'lo que se mueve'], ['bright', 'lo claro'], ['dark', 'lo oscuro']], when: { src: 'camera' } },
               { k: 'dir', label: 'Salen', v: 'still', options: DIRS },
               { k: 'count', label: 'Cantidad', v: '65536', options: COUNTS },
               { k: 'burst', label: 'Emisión', v: 'cont', options: BURSTS }] },

    gravity: { title: 'Gravedad', cat: 'force', inputs: [PIN, F('str', 'Fuerza', 0.6, -3, 3), F('angle', 'Ángulo', 0, -180, 180)], outputs: [POUT],
      help: 'Las tira hacia un lado (0° = abajo)' },
    turb: { title: 'Turbulencia', cat: 'force', inputs: [PIN, F('str', 'Fuerza', 0.8, 0, 4), F('scale', 'Escala', 1.5, 0.1, 10), F('speed', 'Evolución', 0.3, 0, 3)], outputs: [POUT],
      help: 'Remolinos de humo: un flujo que cambia con el tiempo' },
    attract: { title: 'Atractor', cat: 'force', inputs: [PIN, F('x', 'X', 0, -2, 2), F('y', 'Y', 0, -1.5, 1.5), F('str', 'Fuerza', 0.6, -3, 3)], outputs: [POUT],
      help: 'Las atrae a un punto (negativo: las espanta)' },
    vortex: { title: 'Remolino', cat: 'force', inputs: [PIN, F('x', 'X', 0, -2, 2), F('y', 'Y', 0, -1.5, 1.5), F('str', 'Giro', 1, -5, 5), F('pull', 'Atracción', 0.2, -2, 2)], outputs: [POUT],
      help: 'Las hace girar alrededor de un punto' },
    wave: { title: 'Ola', cat: 'force', inputs: [PIN, F('str', 'Fuerza', 0.6, 0, 4), F('freq', 'Frecuencia', 4, 0.2, 30), F('speed', 'Velocidad', 1, -5, 5)], outputs: [POUT],
      params: [{ k: 'dir', label: 'Ola', v: 'h', options: [['h', 'sube y baja'], ['v', 'de lado a lado'], ['r', 'en círculos']] }],
      help: 'Las mece con una onda' },
    explode: { title: 'Explosión', cat: 'force', inputs: [PIN, F('x', 'X', 0, -2, 2), F('y', 'Y', 0, -1.5, 1.5), F('str', 'Fuerza', 1.5, 0, 8)], outputs: [POUT],
      params: [{ k: 'trig', label: 'Golpe', v: 'beat', options: TRIG }],
      help: 'Un empujón desde un punto con el ritmo o los graves' },
    home: { title: 'Formar', cat: 'force', inputs: [PIN, F('str', 'Fuerza', 8, 0, 40), F('damp', 'Amortiguar', 3.5, 0, 15)], outputs: [POUT],
      help: 'Cada partícula vuelve a donde nació: el texto o la imagen se vuelve a armar' },
    cam: { title: 'Cámara', cat: 'force', inputs: [PIN, F('str', 'Fuerza', 2, -8, 8)], outputs: [POUT],
      params: [{ k: 'mode', label: 'Empuja', v: 'motion', options: [['motion', 'lo que se mueve'], ['bright', 'lo claro']] }],
      help: 'Lo que pasa frente a la cámara empuja las partículas (negativo: las atrae)' },
    drag: { title: 'Frenado', cat: 'force', inputs: [PIN, F('amt', 'Frenado', 1, 0, 8)], outputs: [POUT],
      help: 'Les quita velocidad (como el aire)' },
    bounds: { title: 'Bordes', cat: 'force', inputs: [PIN, F('bounce', 'Rebote', 0.7, 0, 1)], outputs: [POUT],
      params: [{ k: 'mode', label: 'En el borde', v: 'bounce', options: [['bounce', 'rebotan'], ['floor', 'rebotan en el piso'], ['wrap', 'salen por el otro lado'], ['kill', 'desaparecen']] }],
      help: 'Qué pasa cuando llegan al borde de la pantalla' },

    look: { title: 'Aspecto', cat: 'look', unique: true, inputs: [PIN, F('size', 'Tamaño', 3, 0.5, 40), F('opacity', 'Opacidad', 0.8, 0, 1), COL('a', 'Color A', '#66ff33'), COL('b', 'Color B', '#00d4ff')], outputs: [POUT],
      params: [{ k: 'shape', label: 'Forma', v: 'soft', options: [['soft', 'luz suave'], ['dot', 'punto'], ['ring', 'anillo'], ['star', 'destello'], ['square', 'cuadrado']] },
               { k: 'color', label: 'Color', v: 'age', options: [['a', 'color A'], ['age', 'A → B con la edad'], ['speed', 'A → B con la velocidad'], ['rand', 'mezcla de A y B'], ['rainbow', 'arcoíris'], ['angle', 'arcoíris en círculo'], ['image', 'colores de la imagen']] },
               { k: 'life', label: 'Vida', v: 'fade', options: [['fade', 'aparece y se va'], ['shrink', 'se achica'], ['grow', 'crece'], ['twinkle', 'titila'], ['const', 'constante']] }],
      help: 'Tamaño, forma y color de cada partícula' },

    out: { title: 'Salida', cat: 'out', unique: true, inputs: [PIN, F('trail', 'Estela', 0, 0, 0.99, { nl: true }), F('gain', 'Brillo', 1, 0, 4)], outputs: [],
      params: [{ k: 'blend', label: 'Mezcla', v: 'add', options: [['add', 'suman luz'], ['normal', 'normal (tapan)']] }],
      help: 'Lo que se ve (y lo que recibe NODRUS)' },

    lfo: { title: 'LFO', cat: 'val', inputs: [F('speed', 'Velocidad', 0.3, 0, 10), F('min', 'Mín', -1, -5, 5), F('max', 'Máx', 1, -5, 5)], outputs: [['v', 'float', 'Valor']],
      params: [{ k: 'shape', label: 'Forma', v: 'sine', options: [['sine', 'seno'], ['tri', 'triángulo'], ['saw', 'sierra'], ['square', 'cuadrada'], ['random', 'aleatoria']] },
               { k: 'sync', label: 'Ritmo', v: 'free', options: [['free', 'libre (Velocidad)'], ['1', '1 tiempo'], ['2', '2 tiempos'], ['4', '1 compás'], ['8', '2 compases'], ['16', '4 compases']] }],
      help: 'Un valor que va y viene solo' },
    audio: { title: 'Audio', cat: 'val', inputs: [F('gain', 'Ganancia', 1, 0, 4)], outputs: [['level', 'float', 'Nivel'], ['bass', 'float', 'Graves'], ['mid', 'float', 'Medios'], ['high', 'float', 'Agudos']],
      help: 'El sonido (micrófono o SYNDRUS), de 0 a 1' },
    pulse: { title: 'Pulso', cat: 'val', inputs: [F('decay', 'Caída', 5, 0.5, 20), F('min', 'Mín', 0, -5, 5), F('max', 'Máx', 1, -5, 5)], outputs: [['v', 'float', 'Valor']],
      params: [{ k: 'div', label: 'Cada', v: '1', options: [['1', '1 tiempo'], ['2', '2 tiempos'], ['4', '1 compás']] }],
      help: 'Salta en cada tiempo y cae despacio' },
  };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isChain = t => DEFS[t] && DEFS[t].cat !== 'val';
  const isEmitter = t => DEFS[t] && DEFS[t].cat === 'emit';

  /* ── sanitizer: every system from outside (storage, files, other windows) goes through here ── */
  const HEX = /^#[0-9a-f]{6}$/i;
  function sane(s) {
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return null; } }
    if (!s || typeof s !== 'object' || !Array.isArray(s.nodes) || !Array.isArray(s.links) || !s.nodes.length || s.nodes.length > 80) return null;
    const ids = new Set(), nodes = [], fin = x => (Number.isFinite(x) ? Math.max(-1e5, Math.min(1e5, x)) : 0);
    for (const n of s.nodes) {
      if (!n || typeof n !== 'object' || typeof n.type !== 'string' || !own(DEFS, n.type) || !Number.isInteger(n.id) || n.id < 1 || n.id > 1e6 || ids.has(n.id)) return null;
      ids.add(n.id);
      const d = DEFS[n.type], v = {}, p = {}, nv = n.v && typeof n.v === 'object' ? n.v : {}, np = n.p && typeof n.p === 'object' ? n.p : {};
      for (const i of d.inputs) {
        const x = nv[i.k];
        if (i.t === 'float' && Number.isFinite(x)) v[i.k] = Math.max(-1e4, Math.min(1e4, x));
        else if (i.t === 'color' && typeof x === 'string' && HEX.test(x)) v[i.k] = x.toLowerCase();
      }
      for (const q of d.params || []) {
        const x = np[q.k];
        if (q.kind === 'text') { if (typeof x === 'string') p[q.k] = x.slice(0, 300); }
        else if (q.kind === 'image') { if (typeof x === 'string' && x.length <= 900000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x)) p[q.k] = x; }
        else if (q.options.some(o => o[0] === x)) p[q.k] = x;
      }
      nodes.push({ id: n.id, type: n.type, x: fin(n.x), y: fin(n.y), v, p });
    }
    const byId = new Map(nodes.map(n => [n.id, n])), links = [], into = new Map();
    for (const l of s.links) {
      if (!l || typeof l !== 'object') continue;
      const a = byId.get(l.a), b = byId.get(l.b);
      if (!a || !b || a === b) continue;
      const o = DEFS[a.type].outputs.find(x => x[0] === l.ao), i = DEFS[b.type].inputs.find(x => x.k === l.bi);
      if (!o || !i || i.nl || o[1] !== i.t) continue;
      into.set(b.id + ':' + i.k, { a: a.id, ao: o[0], b: b.id, bi: i.k });   // one link per input (the last wins)
    }
    into.forEach(l => links.push(l));
    return { v: 1, name: typeof s.name === 'string' ? s.name.slice(0, 60) : '', nodes, links };
  }
  const valueOf = (n, k) => {
    const i = DEFS[n.type].inputs.find(x => x.k === k);
    return n.v && n.v[k] !== undefined ? n.v[k] : i ? i.v : 0;
  };
  const paramOf = (n, k) => {
    const q = (DEFS[n.type].params || []).find(x => x.k === k);
    return n.p && n.p[k] !== undefined ? n.p[k] : q ? q.v : '';
  };
  // what needs a recompile (types, options, links, count) — values only change uniforms
  // (a text or a picture only changes the points the particles are born on, not the shaders)
  const structP = n => { const o = {}; (DEFS[n.type].params || []).forEach(q => { if (!q.kind && n.p && n.p[q.k] !== undefined) o[q.k] = n.p[q.k]; }); return o; };
  const structureKey = s => JSON.stringify([s.nodes.map(n => [n.id, n.type, structP(n)]), s.links.map(l => [l.a, l.ao, l.b, l.bi])]);

  /* ── GLSL ── */
  const fl = x => { const s = String(+x); return /[.e]/.test(s) ? s : s + '.0'; };
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const LIB = `
uvec4 pcg4(uvec4 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}
vec4 rnd4(uint a, uint b, uint c) { return vec4(pcg4(uvec4(a, b, c, 0x2545F491u))) * (1.0 / 4294967295.0); }
float h3(ivec3 c) {
  uint n = uint(c.x) * 0x8da6b343u ^ uint(c.y) * 0xd8163841u ^ uint(c.z) * 0xcb1ab31fu;
  n = (n ^ (n >> 16)) * 0x7feb352du; n = (n ^ (n >> 15)) * 0x846ca68bu; n ^= n >> 16;
  return float(n) * (1.0 / 4294967295.0);
}
// value noise with its gradient: x = value, yzw = d/dp
vec4 vnoised(vec3 x) {
  ivec3 i = ivec3(floor(x)); vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h3(i), b = h3(i + ivec3(1, 0, 0)), c = h3(i + ivec3(0, 1, 0)), d = h3(i + ivec3(1, 1, 0));
  float e = h3(i + ivec3(0, 0, 1)), g = h3(i + ivec3(1, 0, 1)), h = h3(i + ivec3(0, 1, 1)), k = h3(i + ivec3(1, 1, 1));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + h, k6 = a - b - e + g, k7 = -a + b + c - d + e - g - h + k;
  float v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  vec3 dv = du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4(v, dv);
}
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
`;
  const VALUE_GLSL = {
    lfo: (I, P, id) => {
      const ph = P.sync === 'free' ? `(u_time * ${I.speed})` : `(u_beat / ${fl(P.sync)})`;
      const sh = { sine: `sin(${ph} * 6.2831853) * 0.5 + 0.5`, tri: `abs(fract(${ph}) * 2.0 - 1.0)`, saw: `fract(${ph})`, square: `step(0.5, fract(${ph}))`,
                   random: `float(pcg4(uvec4(uint(floor(${ph}) + 4096.0), ${id}u, 3u, 1u)).x) * (1.0 / 4294967295.0)` }[P.shape];
      return `float v${id}_v = mix(${I.min}, ${I.max}, ${sh});`;
    },
    audio: (I, P, id) => `vec4 a${id} = clamp(u_audio * ${I.gain}, 0.0, 1.0); float v${id}_level = a${id}.x, v${id}_bass = a${id}.y, v${id}_mid = a${id}.z, v${id}_high = a${id}.w;`,
    pulse: (I, P, id) => `float v${id}_v = mix(${I.min}, ${I.max}, exp(-fract(u_beat / ${fl(P.div)}) * ${fl(P.div)} * ${I.decay}));`,
  };

  function compile(sys) {
    const byId = new Map(sys.nodes.map(n => [n.id, n]));
    const linkInto = (id, k) => sys.links.find(l => l.b === id && l.bi === k);
    const out = sys.nodes.find(n => n.type === 'out');
    if (!out) throw new Error('Falta el nodo Salida');
    const chain = [], seen = new Set();
    let l = linkInto(out.id, 'in');
    while (l) {
      const n = byId.get(l.a);
      if (!n || seen.has(n.id) || !isChain(n.type)) break;
      seen.add(n.id); chain.unshift(n);
      if (isEmitter(n.type)) break;
      l = linkInto(n.id, 'in');
    }
    if (!chain.length || !isEmitter(chain[0].type)) throw new Error('Conectá un Emisor a la Salida (pasando por los nodos que quieras)');
    const emit = chain[0];
    const uniforms = [], vals = [], valState = new Map();
    function emitValue(n) {
      const st = valState.get(n.id);
      if (st === 2) return;
      if (st === 1) throw new Error('Hay un círculo entre los nodos de valores');
      valState.set(n.id, 1);
      const I = inputsOf(n), P = {};
      (DEFS[n.type].params || []).forEach(q => { P[q.k] = paramOf(n, q.k); });
      vals.push(VALUE_GLSL[n.type](I, P, n.id));
      valState.set(n.id, 2);
    }
    function inputsOf(n) {
      const I = {};
      for (const inp of DEFS[n.type].inputs) {
        if (inp.t === 'part') continue;
        const lk = linkInto(n.id, inp.k), src = lk && byId.get(lk.a);
        if (src && DEFS[src.type].cat === 'val' && inp.t === 'float') { emitValue(src); I[inp.k] = `v${src.id}_${lk.ao}`; continue; }
        const name = `u${n.id}_${inp.k}`;
        if (!uniforms.some(u => u.name === name)) uniforms.push({ name, t: inp.t, node: n.id, k: inp.k });
        I[inp.k] = name;
      }
      return I;
    }
    const P = n => { const o = {}; (DEFS[n.type].params || []).forEach(q => { o[q.k] = paramOf(n, q.k); }); return o; };

    // emitter
    const EI = inputsOf(emit), EP = P(emit);
    const shape = {
      point: 'pos = c + vec3((r.xy - 0.5) * 0.004, 0.0); o = vec3(cos(r.z * 6.2831853), sin(r.z * 6.2831853), 0.0);',
      ring: 'float ang = r.x * 6.2831853; o = vec3(cos(ang), sin(ang), 0.0); pos = c + o * S;',
      disc: 'float ang = r.x * 6.2831853; o = vec3(cos(ang), sin(ang), 0.0); pos = c + o * S * sqrt(r.y);',
      line: 'pos = c + vec3((r.x * 2.0 - 1.0) * S * 2.0, 0.0, 0.0); o = vec3(0.0, r.z < 0.5 ? -1.0 : 1.0, 0.0);',
      box: 'pos = c + vec3((r.x * 2.0 - 1.0) * S * A, (r.y * 2.0 - 1.0) * S, 0.0); o = normalize(pos - c + vec3(0.0, 0.0001, 0.0));',
      screen: 'pos = vec3((r.x * 2.0 - 1.0) * A * 1.02, (r.y * 2.0 - 1.0) * 1.02, 0.0); o = vec3(cos(r.z * 6.2831853), sin(r.z * 6.2831853), 0.0);',
      sphere: 'float z = r.y * 2.0 - 1.0, ang = r.x * 6.2831853, rr = sqrt(1.0 - z * z); o = vec3(rr * cos(ang), rr * sin(ang), z); pos = c + o * S;',
    }[EP.shape];
    const formShape = `
    int pidx = int(min(r.x * u_npts, max(u_npts - 1.0, 0.0)));
    vec4 pt = texelFetch(u_pts, ivec2(pidx % 256, pidx / 256), 0);
    vec2 puv = clamp(pt.xy + (r.yz - 0.5) * u_ptjit, 0.0, 1.0);
    o = vec3(puv.x - 0.5, 0.5 - puv.y, 0.0);
    pos = c + vec3(o.x * S * u_ptasp, o.y * S, 0.0);
    o = normalize(o + vec3(0.0, 0.0001, 0.0));
    hw = floor(puv.x * 4095.0) * 4096.0 + floor(puv.y * 4095.0);
    ok = u_npts > 0.5;`;
    const dir = { out: 'o', up: 'vec3(0.0, 1.0, 0.0)', down: 'vec3(0.0, -1.0, 0.0)', left: 'vec3(-1.0, 0.0, 0.0)', right: 'vec3(1.0, 0.0, 0.0)',
                  random: 'vec3(cos(r2.x * 6.2831853), sin(r2.x * 6.2831853), 0.0)', spin: 'vec3(-o.y, o.x, 0.0)', front: 'vec3(0.0, 0.0, 1.0)', back: 'vec3(0.0, 0.0, -1.0)', still: 'vec3(0.0)' }[EP.dir];
    const EMIT = `
    vec3 c = vec3(${EI.x}, ${EI.y}, ${EI.z}), o; float S = ${EI.size};
    ${emit.type === 'form' ? formShape : shape}
    vec3 d0 = ${dir};
    vel = d0 * ${EI.speed} * (1.0 + (r2.z - 0.5) * ${EI.chaos} * 1.5)
        + vec3(cos(r2.y * 6.2831853), sin(r2.y * 6.2831853), (r.w - 0.5) * 0.6) * ${EI.speed} * ${EI.chaos} * 0.6;
    life = max(0.05, ${EI.life} * (1.0 + (r2.w * 2.0 - 1.0) * ${EI.lifeVar} * 0.8));`;

    // forces (before moving) and edges (after)
    const pre = [], post = [], triggers = [];
    let usesCam = emit.type === 'form' && EP.src === 'camera';
    if (EP.burst !== 'cont') triggers.push({ u: 'u_burst', mode: EP.burst });
    let look = null;
    for (const n of chain.slice(1)) {
      const I = inputsOf(n), Q = P(n), id = n.id;
      if (n.type === 'gravity') pre.push(`{ float ga = radians(${I.angle}); vel.xy += vec2(sin(ga), -cos(ga)) * ${I.str} * dt; }`);
      else if (n.type === 'turb') pre.push(`{ vec3 q = pos * ${I.scale} + vec3(0.0, 0.0, u_time * ${I.speed}); vec4 n1 = vnoised(q), n2 = vnoised(q * 2.03 + vec3(19.1, 7.3, 3.7));
      vec3 g = n1.yzw + n2.yzw * 1.015; vel += vec3(g.y, -g.x, g.z * 0.25) * ${I.str} * dt; }`);
      else if (n.type === 'attract') pre.push(`{ vec3 d = vec3(${I.x}, ${I.y}, 0.0) - pos; vel += d * (${I.str} * 0.35 / (dot(d, d) + 0.06)) * dt; }`);
      else if (n.type === 'vortex') pre.push(`{ vec2 d = pos.xy - vec2(${I.x}, ${I.y}); float r2v = dot(d, d) + 0.05; vel.xy += (vec2(-d.y, d.x) * ${I.str} * 0.2 / r2v - d * ${I.pull}) * dt; }`);
      else if (n.type === 'wave') pre.push(Q.dir === 'v' ? `vel.x += sin(pos.y * ${I.freq} + u_time * ${I.speed}) * ${I.str} * dt;`
        : Q.dir === 'r' ? `{ float rl = length(pos.xy) + 1e-4; vel.xy += pos.xy / rl * sin(rl * ${I.freq} - u_time * ${I.speed}) * ${I.str} * dt; }`
        : `vel.y += sin(pos.x * ${I.freq} + u_time * ${I.speed}) * ${I.str} * dt;`);
      else if (n.type === 'explode') {
        const hu = `u${id}_hit`;
        uniforms.push({ name: hu, t: 'float', trig: true });
        triggers.push({ u: hu, mode: Q.trig });
        pre.push(`if (${hu} > 0.5) { vec3 d = pos - vec3(${I.x}, ${I.y}, 0.0); vel += normalize(d + vec3(1e-4, 0.0, 0.0)) * ${I.str} / (1.0 + length(d) * 1.5); }`);
      } else if (n.type === 'home') pre.push(`{ vec3 d = home.xyz - pos; vel += d * ${I.str} * dt; vel *= exp(-max(0.0, ${I.damp}) * dt); }`);
      else if (n.type === 'cam') {
        usesCam = true;
        const ch = Q.mode === 'bright' ? 'g' : 'r';
        pre.push(`{ vec2 cu = vec2(pos.x / (2.0 * A) + 0.5, 0.5 - pos.y * 0.5), ce = vec2(1.5 / 160.0, 1.5 / 90.0);
      float gx = textureLod(u_mot, cu + vec2(ce.x, 0.0), 0.0).${ch} - textureLod(u_mot, cu - vec2(ce.x, 0.0), 0.0).${ch};
      float gy = textureLod(u_mot, cu - vec2(0.0, ce.y), 0.0).${ch} - textureLod(u_mot, cu + vec2(0.0, ce.y), 0.0).${ch};
      vel.xy -= vec2(gx, gy) * ${I.str} * 8.0 * dt; }`);
      } else if (n.type === 'drag') pre.push(`vel *= exp(-max(0.0, ${I.amt}) * dt);`);
      else if (n.type === 'bounds') {
        const B = `clamp(${I.bounce}, 0.0, 1.0)`;
        post.push({
          bounce: `if (abs(pos.x) > A) { pos.x = sign(pos.x) * A; vel.x = -vel.x * ${B}; } if (abs(pos.y) > 1.0) { pos.y = sign(pos.y); vel.y = -vel.y * ${B}; }`,
          floor: `if (pos.y < -1.0) { pos.y = -1.0; vel.y = abs(vel.y) * ${B}; vel.x *= 0.9; }`,
          wrap: `if (abs(pos.x) > A) pos.x -= sign(pos.x) * 2.0 * A; if (abs(pos.y) > 1.0) pos.y -= sign(pos.y) * 2.0;`,
          kill: `if (abs(pos.x) > A + 0.05 || abs(pos.y) > 1.05) age = life + 1.0;`,
        }[Q.mode]);
      } else if (n.type === 'look') look = { I, P: Q };
    }
    const OI = inputsOf(out), OP = P(out);
    const burst = EP.burst !== 'cont';
    const head = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_pos, u_vel, u_home, u_pts, u_img, u_mot;
uniform float u_npts, u_ptasp;
uniform vec2 u_ptjit;
uniform float u_dt, u_time, u_beat, u_aspect, u_frame, u_burst, u_scale, u_maxpt;
uniform vec4 u_audio;
${uniforms.map(u => `uniform ${u.t === 'color' ? 'vec3' : 'float'} ${u.name};`).join('\n')}
${LIB}`;
    const VALUES = vals.join('\n  ');
    const sim = `${head}
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
layout(location = 2) out vec4 oHome;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(u_pos, ij, 0), V = texelFetch(u_vel, ij, 0), home = texelFetch(u_home, ij, 0);
  uint idu = uint(ij.y * textureSize(u_pos, 0).x + ij.x), fr = uint(u_frame);
  vec3 pos = P.xyz, vel = V.xyz; float age = P.w, life = V.w;
  float dt = u_dt, A = u_aspect;
  ${VALUES}
  float age0 = age; age += dt;
  bool spawn = ${burst ? 'u_burst > 0.5' : '(age0 < 0.0 && age >= 0.0) || age >= life'};
  if (spawn) {
    vec4 r = rnd4(idu, fr, 1u), r2 = rnd4(idu, fr, 2u); float hw = -1.0; bool ok = true;${EMIT}
    age = 0.0; home = vec4(pos, hw);
    if (!ok) { life = -1.0; pos = vec3(0.0, 0.0, -50.0); }   // nothing to be born on yet (empty text, camera starting): try again next frame
  } else if (age >= 0.0 && age < life) {
    ${pre.join('\n    ')}
    pos += vel * dt;
    ${post.join('\n    ')}
    pos.z = max(pos.z, -12.0);
    if (pos.z > 1.6) age = life + 1.0;   // went past the camera
  }
  if (!(abs(pos.x) < 1e4 && abs(pos.y) < 1e4 && abs(vel.x) < 1e4 && abs(vel.y) < 1e4)) { pos = vec3(0.0); vel = vec3(0.0); age = life + 1.0; }
  oPos = vec4(pos, age); oVel = vec4(vel, life); oHome = home;
}`;
    // drawing
    const LI = look ? look.I : { size: '3.0', opacity: '0.8', a: 'vec3(0.4, 1.0, 0.2)', b: 'vec3(0.0, 0.83, 1.0)' };
    const LP = look ? look.P : { shape: 'soft', color: 'age', life: 'fade' };
    const colExpr = {
      a: `${LI.a}`, age: `mix(${LI.a}, ${LI.b}, t)`, speed: `mix(${LI.a}, ${LI.b}, clamp(length(V.xyz) / 1.2, 0.0, 1.0))`, rand: `mix(${LI.a}, ${LI.b}, rs.x)`,
      rainbow: `hsv(fract(rs.x + u_time * 0.05), 0.75, 1.0)`, angle: `hsv(fract(atan(pos.y, pos.x) / 6.2831853 + u_time * 0.05), 0.75, 1.0)`,
      image: `(HH.w >= 0.0 ? textureLod(u_img, vec2(floor(HH.w / 4096.0), mod(HH.w, 4096.0)) / 4095.0, 0.0).rgb : ${LI.a})`,
    }[LP.color];
    const lifeCurve = {
      fade: 'al *= smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.65, 1.0, t));',
      shrink: 'sz *= 1.0 - t; al *= smoothstep(0.0, 0.04, t);',
      grow: 'sz *= 0.25 + t * 1.5; al *= smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.75, 1.0, t));',
      twinkle: 'al *= (0.25 + 0.75 * step(0.5, fract(rs.y * 7.0 + u_time * (1.5 + rs.z * 5.0)))) * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.7, 1.0, t));',
      const: 'al *= smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.97, 1.0, t));',
    }[LP.life];
    const drawVS = `${head}
out vec4 vCol;
void main() {
  int i = gl_VertexID, side = textureSize(u_pos, 0).x;
  ivec2 ij = ivec2(i % side, i / side);
  vec4 P = texelFetch(u_pos, ij, 0), V = texelFetch(u_vel, ij, 0);
  float age = P.w, life = V.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
  float t = age / life; vec3 pos = P.xyz;
  vec4 rs = rnd4(uint(i), 0u, 9u);${LP.color === 'image' ? '\n  vec4 HH = texelFetch(u_home, ij, 0);' : ''}
  ${VALUES}
  float persp = 2.5 / max(0.6, 2.5 - pos.z);
  gl_Position = vec4(pos.x * persp / u_aspect, pos.y * persp, 0.0, 1.0);
  float sz = max(0.0, ${LI.size}) * persp, al = clamp(${LI.opacity}, 0.0, 1.0);
  ${lifeCurve}
  float px = sz * u_scale;
  if (px < 1.0) { al *= max(px, 0.0); px = 1.0; }
  gl_PointSize = min(px, u_maxpt);
  vCol = vec4(${colExpr} * max(0.0, ${OI.gain}), al);
}`;
    const shapeExpr = {
      soft: 'exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r))',
      dot: '1.0 - smoothstep(0.75, 1.0, r)',
      ring: 'smoothstep(0.5, 0.68, r) * (1.0 - smoothstep(0.82, 1.0, r))',
      star: 'clamp(exp(-r * r * 9.0) + (1.0 - smoothstep(0.0, 0.14, abs(q.x))) * (1.0 - abs(q.y)) * 0.8 + (1.0 - smoothstep(0.0, 0.14, abs(q.y))) * (1.0 - abs(q.x)) * 0.8, 0.0, 1.0)',
      square: '1.0',
    }[LP.shape];
    const drawFS = `#version 300 es
precision highp float;
in vec4 vCol;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q);
  float m = ${shapeExpr};
  float a = vCol.a * m;
  if (a < 0.002) discard;
  o = vec4(vCol.rgb * a, a);
}`;
    return {
      sim, drawVS, drawFS, uniforms, triggers, burst,
      count: +EP.count, side: Math.round(Math.sqrt(+EP.count)),
      blend: OP.blend, outId: out.id, emitId: emit.id, form: emit.type === 'form', usesCam, imgColor: LP.color === 'image',
    };
  }

  /* ── the GPU side: one context per page ── */
  const QUAD_VS = `#version 300 es
in vec2 a; out vec2 uv; void main() { uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
  const FADE_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D u_img; uniform float u_k; out vec4 o; void main() { o = texture(u_img, uv) * u_k; }`;
  const BLIT_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D u_img; out vec4 o;
// premultiplied picture → canvas; the colour may pass the alpha (bright additive light), so the alpha grows to hold it
void main() { vec4 c = texture(u_img, uv); vec3 rgb = clamp(c.rgb, 0.0, 1.0); o = vec4(rgb, max(clamp(c.a, 0.0, 1.0), max(rgb.r, max(rgb.g, rgb.b)))); }`;
  const INIT_FS = `#version 300 es
precision highp float; precision highp int;
uniform float u_life, u_burst; uniform sampler2D u_dummy;
layout(location = 0) out vec4 oPos; layout(location = 1) out vec4 oVel; layout(location = 2) out vec4 oHome;
${LIB}
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 r = rnd4(uint(ij.x), uint(ij.y), 5u);
  oHome = vec4(0.0, 0.0, 0.0, -1.0);
  if (u_burst > 0.5) { oPos = vec4(0.0, 0.0, 0.0, 1e6); oVel = vec4(0.0, 0.0, 0.0, 1.0); }
  else { oPos = vec4(0.0, 0.0, 0.0, -r.x * u_life); oVel = vec4(0.0, 0.0, 0.0, u_life); }
}`;
  let pool = null;
  function getPool() {
    if (pool) return pool;
    pool = { ok: false, err: '' };
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 2; canvas.height = 2;
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
      if (!gl) { pool.err = 'Este navegador no tiene WebGL 2'; return pool; }
      if (!gl.getExtension('EXT_color_buffer_float')) { pool.err = 'Esta placa de video no puede guardar partículas (falta EXT_color_buffer_float)'; return pool; }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const vao = gl.createVertexArray(), empty = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      Object.assign(pool, { ok: true, canvas, gl, vao, empty, progs: new Map(), sims: new Set(), shown: null, lost: false,
        maxPt: Math.min(256, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64) });
      const tiny = (fmt, type, data, ifmt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, 1, 1, 0, fmt, type, data); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
      pool.white = tiny(gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]), gl.RGBA);
      pool.black = tiny(gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]), gl.RGBA);
      pool.blank32 = tiny(gl.RGBA, gl.FLOAT, new Float32Array(4), gl.RGBA32F);
      pool.cam = { st: 'off', ver: 0, t: 0, mot: null, img: null };
      pool.fade = program(QUAD_VS, FADE_FS); pool.blit = program(QUAD_VS, BLIT_FS); pool.init = program(QUAD_VS, INIT_FS);
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pool.lost = true; });
    } catch (e) { pool = { ok: false, err: String(e && e.message || e) }; }
    return pool;
  }
  function program(vs, fs) {
    const gl = pool.gl;
    const mk = (type, src) => {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(e); }
      return sh;
    };
    const pr = gl.createProgram();
    const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(pr, v); gl.attachShader(pr, f);
    gl.bindAttribLocation(pr, 0, 'a');
    gl.linkProgram(pr);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const loc = {}, n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(pr, i); loc[u.name] = gl.getUniformLocation(pr, u.name); }
    return { pr, loc };
  }
  function programsFor(comp, key) {
    let e = pool.progs.get(key);
    if (!e) {
      e = { sim: program(QUAD_VS, comp.sim), draw: program(comp.drawVS, comp.drawFS), users: 0 };
      pool.progs.set(key, e);
    }
    return e;
  }
  function floatTex(w, h, filter) {
    const gl = pool.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, filter ? gl.RGBA16F : gl.RGBA32F, w, h);
    const f = filter ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function fbo(texs) {
    const gl = pool.gl, fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(texs.map((t, i) => gl.COLOR_ATTACHMENT0 + i));
    return fb;
  }
  function setUniforms(gl, loc, comp, values) {
    for (const u of comp.uniforms) {
      const l = loc[u.name]; if (!l) continue;
      const v = values[u.name];
      if (u.t === 'color') gl.uniform3fv(l, v || [1, 1, 1]); else gl.uniform1f(l, v || 0);
    }
  }

  /* ── where a «form» emitter's particles are born ── */
  const FONTS = {
    sans: '800 160px "Helvetica Neue", Arial, sans-serif', display: '900 160px Impact, "Arial Black", sans-serif',
    serif: '700 160px Georgia, "Times New Roman", serif', mono: '700 160px "IBM Plex Mono", Consolas, monospace', hand: '700 160px "Segoe Script", "Comic Sans MS", cursive',
  };
  const MAXP = 65536;
  // the pixels that count → uv pairs (pixel centres), at most 65536 (a random even sample)
  function pointsOf(cv, test) {
    const w = cv.width, h = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let idx = [];
    for (let i = 0, p = 0; p < w * h; p++, i += 4) if (test(d[i], d[i + 1], d[i + 2], d[i + 3])) idx.push(p);
    if (idx.length > MAXP) { for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; } idx = idx.slice(0, MAXP); }
    const uv = new Float32Array(idx.length * 2);
    idx.forEach((p, k) => { uv[k * 2] = ((p % w) + 0.5) / w; uv[k * 2 + 1] = (Math.floor(p / w) + 0.5) / h; });
    return { uv, n: idx.length, asp: w / h, jit: [1 / w, 1 / h], canvas: cv, ready: true };
  }
  const shapeCache = new Map();
  const remember = (k, v) => { if (shapeCache.size > 24) shapeCache.clear(); shapeCache.set(k, v); return v; };
  function textShape(text, font) {
    text = String(text || '').trim() || ' ';
    const k = 't' + font + '|' + text;
    if (shapeCache.has(k)) return shapeCache.get(k);
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    const f = FONTS[font] || FONTS.sans, lines = text.split('\n').slice(0, 6);
    g.font = f;
    const lh = 176, pad = 12;
    cv.width = Math.min(2400, Math.max(8, ...lines.map(l => Math.ceil(g.measureText(l).width))) + pad * 2); cv.height = lines.length * lh + pad * 2;
    g.font = f; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, cv.width / 2, pad + lh * (i + 0.5)));
    return remember(k, pointsOf(cv, (r, gg, b, a) => a > 128));
  }
  function imageShape(url, pick) {
    if (!url) return { ready: true, n: 0, asp: 1, jit: [0, 0], uv: new Float32Array(0), canvas: null };
    const k = 'i' + pick + url.length + url.slice(-64);
    const hit = shapeCache.get(k);
    if (hit) return hit;
    const pending = { ready: false, n: 0, asp: 1, jit: [0, 0] };
    remember(k, pending);
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, im.naturalWidth); cv.height = Math.max(1, im.naturalHeight);
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let clear = false; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { clear = true; break; }
      const lum = (r, gg, b) => 0.299 * r + 0.587 * gg + 0.114 * b;
      const test = pick === 'bright' || (pick === 'auto' && !clear) ? (r, gg, b, a) => a > 128 && lum(r, gg, b) > 110
        : pick === 'dark' ? (r, gg, b, a) => a > 128 && lum(r, gg, b) < 90 : (r, gg, b, a) => a > 128;
      Object.assign(pending, pointsOf(cv, test));
    };
    im.onerror = () => { Object.assign(pending, { ready: true, uv: new Float32Array(0), canvas: null }); };
    im.src = url;
    return pending;
  }
  function uploadPts(tex, shp) {
    const gl = pool.gl, n = Math.min(MAXP, shp.n || 0);
    if (!n) return;
    const rows = Math.ceil(n / 256), data = new Float32Array(rows * 256 * 4);
    for (let k = 0; k < n; k++) { data[k * 4] = shp.uv[k * 2]; data[k * 4 + 1] = shp.uv[k * 2 + 1]; }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, rows, gl.RGBA, gl.FLOAT, data);
  }
  /* the camera (one per page): a small mirrored picture, its brightness and how much each spot moves */
  const CAM_W = 160, CAM_H = 90;
  const camData = { el: null, cv: null, g: null, lum: new Float32Array(CAM_W * CAM_H), mot: new Float32Array(CAM_W * CAM_H), rg: new Uint8Array(CAM_W * CAM_H * 2), first: true };
  function camTick() {
    const P = pool, C = P.cam, now = performance.now();
    if (C.st === 'off') {
      C.st = 'wait';
      const v = document.createElement('video'); v.muted = true; v.playsInline = true;
      v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      (document.body || document.documentElement).append(v);
      camData.el = v;
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 } }, audio: false })
          .then(st => { v.srcObject = st; v.play().catch(() => {}); C.st = 'ok'; }).catch(() => { C.st = 'error'; });
      } else C.st = 'error';
      return;
    }
    if (C.st !== 'ok' || now - C.t < 30 || camData.el.readyState < 2 || !camData.el.videoWidth) return;
    C.t = now;
    if (!camData.cv) { camData.cv = document.createElement('canvas'); camData.cv.width = CAM_W; camData.cv.height = CAM_H; camData.g = camData.cv.getContext('2d', { willReadFrequently: true }); }
    const v = camData.el, g = camData.g, vw = v.videoWidth, vh = v.videoHeight, a = CAM_W / CAM_H;
    let sw = vw, sh = vw / a; if (sh > vh) { sh = vh; sw = vh * a; }   // cover, mirrored like a mirror
    g.save(); g.translate(CAM_W, 0); g.scale(-1, 1); g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, CAM_W, CAM_H); g.restore();
    const d = g.getImageData(0, 0, CAM_W, CAM_H).data, L = camData.lum, M = camData.mot, RG = camData.rg;
    for (let p = 0, i = 0; p < CAM_W * CAM_H; p++, i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const m = camData.first ? 0 : Math.min(255, Math.abs(l - L[p]) * 4);
      M[p] = Math.max(m, M[p] * 0.82); L[p] = l;
      RG[p * 2] = M[p]; RG[p * 2 + 1] = l;
    }
    camData.first = false;
    const gl = P.gl;
    if (!C.mot) {
      C.mot = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, C.mot); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG8, CAM_W, CAM_H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      C.img = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, C.img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, C.mot); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CAM_W, CAM_H, gl.RG, gl.UNSIGNED_BYTE, RG);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.bindTexture(gl.TEXTURE_2D, C.img); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, camData.cv);
    C.ver++;
  }
  function camPoints(mode) {
    const L = camData.lum, M = camData.mot, idx = [];
    if (pool.cam.st === 'ok' && !camData.first) for (let p = 0; p < CAM_W * CAM_H; p++) {
      if (mode === 'motion' ? M[p] > 60 : mode === 'bright' ? L[p] > 160 : L[p] < 60) idx.push(p);
    }
    const uv = new Float32Array(idx.length * 2);
    idx.forEach((p, k) => { uv[k * 2] = ((p % CAM_W) + 0.5) / CAM_W; uv[k * 2 + 1] = (Math.floor(p / CAM_W) + 0.5) / CAM_H; });
    return { uv, n: idx.length };
  }

  /* one running system */
  function createSim() {
    const P = getPool();
    const S = { spec: null, json: null, comp: null, key: '', progs: null, err: '', state: null, color: null, last: null, fno: 0,
      trig: {}, values: {}, used: 0, w: 0, h: 0, uploaded: 0 };
    function freeState() {
      const gl = P.gl;
      if (S.state) { S.state.tex.forEach(t => gl.deleteTexture(t)); S.state.fb.forEach(f => gl.deleteFramebuffer(f)); S.state = null; }
    }
    function freeColor() {
      const gl = P.gl;
      if (S.color) { S.color.tex.forEach(t => gl.deleteTexture(t)); S.color.fb.forEach(f => gl.deleteFramebuffer(f)); S.color = null; }
    }
    function alloc(side) {
      freeState();
      const tex = [0, 1, 2, 3, 4, 5].map(() => floatTex(side, side));   // pos vel home · pos vel home
      S.state = { side, tex, fb: [fbo(tex.slice(0, 3)), fbo(tex.slice(3, 6))], cur: 0 };
      S.last = null;   // → init + warm-up on the next frame
    }
    function setSpec(spec) {
      if (!P.ok) { S.err = P.err; return false; }
      if (spec === S.obj) return !S.err;   // the same object or string as last frame
      S.obj = spec;
      const json = typeof spec === 'string' ? spec : JSON.stringify(spec);
      if (json === S.json) return !S.err;
      const sys = sane(spec);
      S.json = json;
      if (!sys) { S.err = 'Sistema de partículas inválido'; return false; }
      S.spec = sys;
      const key = structureKey(sys);
      if (key !== S.key) {
        try {
          const comp = compile(sys);
          const progs = programsFor(comp, key);
          if (!S.state || S.state.side !== comp.side || (S.comp && S.comp.burst !== comp.burst)) { S.comp = comp; alloc(comp.side); }
          S.comp = comp; S.progs = progs; S.key = key; S.err = '';
        } catch (e) { S.err = String(e && e.message || e); S.key = key; return false; }
      }
      // uniform values
      const v = {};
      for (const u of S.comp.uniforms) {
        if (u.trig) continue;
        const n = sys.nodes.find(x => x.id === u.node);
        if (!n) continue;
        const x = valueOf(n, u.k);
        v[u.name] = u.t === 'color' ? hexRgb(x) : +x;
      }
      S.values = v;
      const out = sys.nodes.find(x => x.id === S.comp.outId);
      S.trail = out ? Math.max(0, Math.min(0.995, +valueOf(out, 'trail') || 0)) : 0;
      const em = sys.nodes.find(x => x.id === S.comp.emitId);
      S.life = em ? Math.max(0.2, Math.min(30, +valueOf(em, 'life') || 3)) : 3;
      return true;
    }
    function fire(mode, beat, bass, now) {
      const t = S.trig[mode] || (S.trig[mode] = { k: null, bass: 0, at: -1 });
      let hit = false;
      if (mode === 'bass') { hit = bass > 0.5 && t.bass <= 0.5 && now - t.at > 0.12; t.bass = bass; if (hit) t.at = now; }
      else {
        const k = Math.floor(beat / (mode === 'bar' ? 4 : mode === '2' ? 2 : 1));
        hit = t.k !== null && k !== t.k; t.k = k;
      }
      return hit;
    }
    function bindState(L, k) {
      const gl = P.gl, st = S.state;
      [['u_pos', 0], ['u_vel', 1], ['u_home', 2]].forEach(([n, i]) => {
        gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, st.tex[k * 3 + i]);
        if (L[n]) gl.uniform1i(L[n], i);
      });
    }
    /* the points a «form» emitter is born on, the picture its colours come from, the camera's motion map */
    function bindShape(L) {
      const gl = P.gl, sh = S.shape;
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, sh ? sh.pts : P.blank32);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, sh && sh.img ? sh.img : P.white);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, P.cam.mot || P.black);
      if (L.u_pts) gl.uniform1i(L.u_pts, 3);
      if (L.u_img) gl.uniform1i(L.u_img, 4);
      if (L.u_mot) gl.uniform1i(L.u_mot, 5);
      if (L.u_npts) gl.uniform1f(L.u_npts, sh ? sh.n : 0);
      if (L.u_ptasp) gl.uniform1f(L.u_ptasp, sh ? sh.asp : 1);
      if (L.u_ptjit) gl.uniform2f(L.u_ptjit, sh ? sh.jit[0] : 0, sh ? sh.jit[1] : 0);
      gl.activeTexture(gl.TEXTURE0);
    }
    function prepShape() {
      const comp = S.comp;
      if (comp.usesCam) camTick();
      if (!comp.form) { if (S.shape) freeShape(); return; }
      const em = S.spec.nodes.find(x => x.id === comp.emitId);
      const src = paramOf(em, 'src');
      if (src === 'camera') {
        const mode = paramOf(em, 'cam');
        if (!S.shape || S.shape.kind !== 'cam' || S.shape.mode !== mode || S.shape.ver !== P.cam.ver) {
          const pts = camPoints(mode);
          ensureOwnShape('cam');
          Object.assign(S.shape, { mode, ver: P.cam.ver, n: pts.n, asp: 16 / 9, jit: [1 / CAM_W, 1 / CAM_H], img: P.cam.img || null });
          uploadPts(S.shape.pts, pts);
        }
        return;
      }
      const key = src === 'image' ? 'i' + paramOf(em, 'pick') + paramOf(em, 'img') : 't' + paramOf(em, 'font') + '|' + paramOf(em, 'text');
      if (S.shape && S.shape.key === key && S.shape.ready) return;
      const shp = src === 'image' ? imageShape(paramOf(em, 'img'), paramOf(em, 'pick')) : textShape(paramOf(em, 'text'), paramOf(em, 'font'));
      ensureOwnShape('pic');
      Object.assign(S.shape, { key, ready: shp.ready, n: shp.n, asp: shp.asp, jit: shp.jit });
      if (shp.ready && shp.canvas) {
        uploadPts(S.shape.pts, shp);
        const gl = P.gl;
        if (!S.shape.img) S.shape.img = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, S.shape.img);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shp.canvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
    }
    function ensureOwnShape(kind) {
      if (S.shape && S.shape.kind === kind) return;
      freeShape();
      S.shape = { kind, pts: floatTex(256, 256), img: null, n: 0, asp: 1, jit: [0, 0] };
    }
    function freeShape() {
      const gl = P.gl;
      if (S.shape) { gl.deleteTexture(S.shape.pts); if (S.shape.img && S.shape.kind !== 'cam') gl.deleteTexture(S.shape.img); }
      S.shape = null;
    }
    function step(dt, time, audio, beat, aspect, trigs) {
      const gl = P.gl, st = S.state, pr = S.progs.sim;
      const src = st.cur, dst = 1 - src;
      gl.bindFramebuffer(gl.FRAMEBUFFER, st.fb[dst]);
      gl.viewport(0, 0, st.side, st.side);
      gl.disable(gl.BLEND);
      gl.useProgram(pr.pr);
      const L = pr.loc;
      bindState(L, src);
      bindShape(L);
      if (L.u_dt) gl.uniform1f(L.u_dt, dt);
      if (L.u_time) gl.uniform1f(L.u_time, time);
      if (L.u_beat) gl.uniform1f(L.u_beat, beat);
      if (L.u_aspect) gl.uniform1f(L.u_aspect, aspect);
      if (L.u_frame) gl.uniform1f(L.u_frame, (S.fno = (S.fno + 1) % 16777216));
      if (L.u_audio) gl.uniform4f(L.u_audio, audio[0] || 0, audio[1] || 0, audio[2] || 0, audio[3] || 0);
      if (L.u_burst) gl.uniform1f(L.u_burst, trigs.u_burst ? 1 : 0);
      setUniforms(gl, L, S.comp, S.values);
      S.comp.uniforms.forEach(u => { if (u.trig && L[u.name]) gl.uniform1f(L[u.name], trigs[u.name] ? 1 : 0); });
      gl.bindVertexArray(P.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      st.cur = dst;
    }
    function init(time, audio, beat, aspect) {
      const gl = P.gl, st = S.state;
      prepShape();
      [0, 1].forEach(i => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, st.fb[i]);
        gl.viewport(0, 0, st.side, st.side);
        gl.disable(gl.BLEND);
        gl.useProgram(P.init.pr);
        gl.uniform1f(P.init.loc.u_life, S.life);
        gl.uniform1f(P.init.loc.u_burst, S.comp.burst ? 1 : 0);
        gl.bindVertexArray(P.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      });
      st.cur = 0;
      if (!S.comp.burst) {   // warm-up: the system starts full, as if it had been running
        const steps = Math.max(1, Math.min(250, Math.round(S.life * 30), Math.floor(4e7 / S.comp.count)));
        const dt = Math.min(0.1, (S.life * 1.05) / steps);
        for (let i = 0; i < steps; i++) step(dt, time - (steps - i) * dt, audio, beat, aspect, {});
      }
      freeColor();
    }
    function draw(w, h, aspect, time, audio, beat, dt) {
      const gl = P.gl, st = S.state;
      if (!S.color || S.color.w !== w || S.color.h !== h) {
        freeColor();
        const tex = [floatTex(w, h, true), floatTex(w, h, true)];
        S.color = { w, h, tex, fb: [fbo([tex[0]]), fbo([tex[1]])], cur: 0 };
        S.color.fb.forEach(f => { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
      }
      const C = S.color, src = C.cur, dst = 1 - src;
      gl.bindFramebuffer(gl.FRAMEBUFFER, C.fb[dst]);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      if (S.trail > 0) {
        gl.useProgram(P.fade.pr);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, C.tex[src]);
        gl.uniform1i(P.fade.loc.u_img, 0);
        gl.uniform1f(P.fade.loc.u_k, dt > 0 ? Math.pow(S.trail, dt * 60) : 1);
        gl.bindVertexArray(P.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      const pr = S.progs.draw, L = pr.loc;
      gl.useProgram(pr.pr);
      bindState(L, st.cur);
      bindShape(L);
      if (L.u_time) gl.uniform1f(L.u_time, time);
      if (L.u_beat) gl.uniform1f(L.u_beat, beat);
      if (L.u_aspect) gl.uniform1f(L.u_aspect, aspect);
      if (L.u_scale) gl.uniform1f(L.u_scale, h / 720);
      if (L.u_maxpt) gl.uniform1f(L.u_maxpt, P.maxPt);
      if (L.u_audio) gl.uniform4f(L.u_audio, audio[0] || 0, audio[1] || 0, audio[2] || 0, audio[3] || 0);
      setUniforms(gl, L, S.comp, S.values);
      gl.enable(gl.BLEND);
      if (S.comp.blend === 'normal') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(P.empty);
      gl.drawArrays(gl.POINTS, 0, S.comp.count);
      gl.disable(gl.BLEND);
      C.cur = dst;
    }
    function show() {   // copies this system's picture to the shared canvas
      const gl = P.gl, C = S.color;
      if (P.canvas.width !== C.w || P.canvas.height !== C.h) { P.canvas.width = C.w; P.canvas.height = C.h; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, C.w, C.h);
      gl.disable(gl.BLEND);
      gl.useProgram(P.blit.pr);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, C.tex[C.cur]);
      gl.uniform1i(P.blit.loc.u_img, 0);
      gl.bindVertexArray(P.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      P.shown = S; S.uploaded++;
    }
    /* advance to `time` and draw at w×h; returns the shared canvas (valid until another system draws) */
    function frame(time, audio, beat, w, h) {
      S.used = performance.now();
      if (!P.ok || P.lost || !S.comp || !S.state) return null;
      audio = audio || [0, 0, 0, 0]; beat = beat || 0;
      h = Math.max(2, Math.min(1440, Math.round(h))); w = Math.max(2, Math.min(2560, Math.round(w)));
      const aspect = w / h;
      let dt;
      if (S.last === null) { init(time, audio, beat, aspect); dt = 1 / 60; }
      else dt = time - S.last;
      if (dt < 0 || dt > 1) dt = 1 / 60;
      S.last = time;
      if (dt > 0) {
        prepShape();
        const trigs = {};
        S.comp.triggers.forEach(tr => { if (fire(tr.mode, beat, audio[1] || 0, time)) trigs[tr.u] = true; });
        const n = dt > 1 / 25 ? Math.min(4, Math.ceil(dt * 30)) : 1;
        for (let i = 0; i < n; i++) step(dt / n, time - dt + (i + 1) * dt / n, audio, beat, aspect, i === 0 ? trigs : {});
        draw(w, h, aspect, time, audio, beat, dt);
      } else if (!S.color || S.color.w !== w || S.color.h !== h) draw(w, h, aspect, time, audio, beat, 0);
      if (P.shown !== S || dt > 0) show();
      return P.canvas;
    }
    function reset() { S.last = null; S.trig = {}; }
    function free() { freeState(); freeColor(); freeShape(); P.sims.delete(S); if (P.shown === S) P.shown = null; S.comp = null; }
    if (P.ok) P.sims.add(S);
    Object.assign(S, { setSpec, frame, reset, free });
    Object.defineProperty(S, 'count', { get: () => (S.comp ? S.comp.count : 0) });   // a live getter (Object.assign would copy its value once)
    return S;
  }

  /* ── NODRUS: one system per (renderer, node); systems nobody draws for a few seconds are freed ── */
  const owners = new WeakMap();
  let lastSweep = 0;
  function sweep(now) {
    if (now - lastSweep < 2000 || !pool || !pool.ok) return;
    lastSweep = now;
    pool.sims.forEach(s => { if (s.owned && now - s.used > 4000) { s.owned.delete(s.ownKey); s.free(); } });
  }
  function source(owner, key, spec, time, audio, beat, w, h) {
    const P = getPool();
    if (!P.ok) return null;
    let m = owners.get(owner);
    if (!m) owners.set(owner, (m = new Map()));
    let s = m.get(key);
    if (!s) { s = createSim(); s.owned = m; s.ownKey = key; m.set(key, s); }
    s.setSpec(spec || PRESETS[0].sys);
    sweep(performance.now());
    if (s.err) return null;
    const c = s.frame(time, audio, beat, w, h);
    return c ? { canvas: c, aspect: c.width / c.height, n: s.uploaded } : null;
  }

  /* ── examples ── */
  function build(name, chain, vals) {
    const nodes = [], links = [];
    chain.forEach(([type, v, p], i) => {
      nodes.push({ id: i + 1, type, x: 40 + i * 236, y: type === 'out' ? 120 : 60 + (i % 2) * 40, v: v || {}, p: p || {} });
      if (i) links.push({ a: i, ao: 'out', b: i + 1, bi: 'in' });
    });
    (vals || []).forEach(([type, v, p, ao, to, k], j) => {
      const id = chain.length + j + 1, tgt = nodes[to];
      nodes.push({ id, type, x: Math.max(40, tgt.x - 120) + j * 236, y: 400, v: v || {}, p: p || {} });
      links.push({ a: id, ao, b: tgt.id, bi: k });
    });
    return sane({ v: 1, name, nodes, links });
  }
  const PRESETS = [
    { name: 'Galaxia', sys: build('Galaxia', [
      ['emit', { size: 0.95, speed: 0.22, chaos: 0.25, life: 9, lifeVar: 0.6 }, { shape: 'disc', dir: 'spin', count: '262144' }],
      ['vortex', { str: 0.5, pull: 0.12 }],
      ['turb', { str: 0.22, scale: 2.2, speed: 0.12 }],
      ['drag', { amt: 0.35 }],
      ['look', { size: 2.2, opacity: 0.5, a: '#3a7bff', b: '#ff3fa4' }, { shape: 'soft', color: 'age', life: 'fade' }],
      ['out', { trail: 0.55, gain: 1 }, { blend: 'add' }]]) },
    { name: 'Fuegos artificiales', sys: build('Fuegos artificiales', [
      ['emit', { size: 0.02, speed: 1.5, chaos: 0.55, life: 1.8, lifeVar: 0.5 }, { shape: 'point', dir: 'out', count: '16384', burst: 'beat' }],
      ['gravity', { str: 0.9 }],
      ['drag', { amt: 1.3 }],
      ['look', { size: 2.8, opacity: 0.75, a: '#ffd23f', b: '#ff3fa4' }, { shape: 'soft', color: 'rand', life: 'shrink' }],
      ['out', { trail: 0.8, gain: 1.2 }, { blend: 'add' }]],
      [['lfo', { speed: 1, min: -1, max: 1 }, { shape: 'random', sync: '1' }, 'v', 0, 'x'],
       ['lfo', { speed: 1, min: -0.1, max: 0.6 }, { shape: 'random', sync: '1' }, 'v', 0, 'y']]) },
    { name: 'Humo', sys: build('Humo', [
      ['emit', { y: -1.08, size: 1.1, speed: 0.22, chaos: 0.3, life: 7, lifeVar: 0.5 }, { shape: 'line', dir: 'up', count: '65536' }],
      ['turb', { str: 1.1, scale: 1.2, speed: 0.22 }],
      ['drag', { amt: 0.9 }],
      ['look', { size: 22, opacity: 0.05, a: '#a7b4c6', b: '#2b3a55' }, { shape: 'soft', color: 'age', life: 'grow' }],
      ['out', { trail: 0, gain: 1 }, { blend: 'normal' }]]) },
    { name: 'Lluvia de luz', sys: build('Lluvia de luz', [
      ['emit', { y: 1.06, size: 1, speed: 0.25, chaos: 0.15, life: 4, lifeVar: 0.4 }, { shape: 'line', dir: 'down', count: '65536' }],
      ['gravity', { str: 0.7 }],
      ['bounds', { bounce: 0.45 }, { mode: 'floor' }],
      ['drag', { amt: 0.25 }],
      ['look', { size: 2, opacity: 0.8, a: '#00d4ff', b: '#ffffff' }, { shape: 'dot', color: 'speed', life: 'fade' }],
      ['out', { trail: 0.5, gain: 1 }, { blend: 'add' }]]) },
    { name: 'Enjambre', sys: build('Enjambre', [
      ['emit', { speed: 0.1, chaos: 1, life: 10, lifeVar: 0.5 }, { shape: 'screen', dir: 'random', count: '262144' }],
      ['turb', { str: 1.4, scale: 1, speed: 0.4 }],
      ['attract', { str: 0.6 }],
      ['drag', { amt: 1.5 }],
      ['look', { size: 1.6, opacity: 0.6 }, { shape: 'soft', color: 'angle', life: 'fade' }],
      ['out', { trail: 0.4, gain: 1 }, { blend: 'add' }]],
      [['lfo', { speed: 0.13, min: -1.1, max: 1.1 }, { shape: 'sine' }, 'v', 2, 'x'],
       ['lfo', { speed: 0.21, min: -0.6, max: 0.6 }, { shape: 'sine' }, 'v', 2, 'y']]) },
    { name: 'Pulso de graves', sys: build('Pulso de graves', [
      ['emit', { size: 0.35, speed: 0.12, chaos: 0.35, life: 3, lifeVar: 0.4 }, { shape: 'ring', dir: 'out', count: '65536' }],
      ['explode', { str: 2 }, { trig: 'bass' }],
      ['explode', { str: 1.2 }, { trig: 'beat' }],
      ['drag', { amt: 1.6 }],
      ['bounds', {}, { mode: 'wrap' }],
      ['look', { size: 2.4, opacity: 0.6 }, { shape: 'soft', color: 'angle', life: 'fade' }],
      ['out', { trail: 0.7, gain: 1 }, { blend: 'add' }]]) },
    { name: 'Túnel 3D', sys: build('Túnel 3D', [
      ['emit', { z: -6, size: 0.7, speed: 1.6, chaos: 0.05, life: 5, lifeVar: 0.2 }, { shape: 'ring', dir: 'front', count: '65536' }],
      ['vortex', { str: 0.25, pull: 0 }],
      ['look', { size: 2.2, opacity: 0.8, a: '#00d4ff', b: '#66ff33' }, { shape: 'soft', color: 'age', life: 'const' }],
      ['out', { trail: 0.75, gain: 1 }, { blend: 'add' }]],
      [['pulse', { decay: 4, min: 0.55, max: 1.1 }, { div: '1' }, 'v', 0, 'size']]) },
    { name: 'Logo que estalla', sys: build('Logo que estalla', [
      ['form', { size: 0.9, speed: 0, chaos: 0, life: 30, lifeVar: 0 }, { src: 'text', text: 'PUDRUS', font: 'display', dir: 'still', count: '65536' }],
      ['home', { str: 9, damp: 3.5 }],
      ['explode', { str: 2.6 }, { trig: 'bar' }],
      ['explode', { str: 2 }, { trig: 'bass' }],
      ['look', { size: 1.8, opacity: 0.85, a: '#ff3fa4', b: '#00d4ff' }, { shape: 'soft', color: 'speed', life: 'const' }],
      ['out', { trail: 0.55, gain: 1 }, { blend: 'add' }]]) },
    { name: 'Texto de humo', sys: build('Texto de humo', [
      ['form', { size: 0.8, speed: 0.12, chaos: 0.4, life: 3, lifeVar: 0.5 }, { src: 'text', text: 'PUDRUS', font: 'sans', dir: 'up', count: '262144' }],
      ['turb', { str: 0.7, scale: 2.2, speed: 0.3 }],
      ['drag', { amt: 0.6 }],
      ['look', { size: 2.2, opacity: 0.25, a: '#ffffff', b: '#3a7bff' }, { shape: 'soft', color: 'age', life: 'fade' }],
      ['out', { trail: 0.3, gain: 1 }, { blend: 'add' }]]) },
    { name: 'Silueta (cámara)', sys: build('Silueta (cámara)', [
      ['form', { size: 2, speed: 0.25, chaos: 0.5, life: 2, lifeVar: 0.5 }, { src: 'camera', cam: 'motion', dir: 'up', count: '65536' }],
      ['turb', { str: 0.6, scale: 2, speed: 0.4 }],
      ['drag', { amt: 0.8 }],
      ['look', { size: 2.4, opacity: 0.8, a: '#66ff33', b: '#00d4ff' }, { shape: 'soft', color: 'image', life: 'fade' }],
      ['out', { trail: 0.6, gain: 1.2 }, { blend: 'add' }]]) },
    { name: 'Tocar con el cuerpo (cámara)', sys: build('Tocar con el cuerpo (cámara)', [
      ['emit', { speed: 0, chaos: 0, life: 30, lifeVar: 0 }, { shape: 'screen', dir: 'still', count: '65536' }],
      ['cam', { str: 3 }, { mode: 'motion' }],
      ['home', { str: 2.5, damp: 2 }],
      ['look', { size: 2, opacity: 0.7 }, { shape: 'soft', color: 'angle', life: 'const' }],
      ['out', { trail: 0.35, gain: 1 }, { blend: 'add' }]]) },
  ];
  const blank = () => build('Nuevo sistema', [
    ['emit', {}, { shape: 'point', dir: 'out', count: '65536' }],
    ['look', {}, {}],
    ['out', {}, {}]]);

  /* ── the library (PARTRUS saves here; NODRUS lists it) ── */
  const LIB_KEY = 'partrus_lib_v1';
  function library() {
    try {
      const a = JSON.parse(localStorage.getItem(LIB_KEY) || '[]');
      return Array.isArray(a) ? a.filter(e => e && typeof e.id === 'string' && sane(e.sys)).map(e => ({ id: e.id, name: String(e.name || 'Sin nombre').slice(0, 60), sys: sane(e.sys), t: +e.t || 0 })) : [];
    } catch (e) { return []; }
  }
  function saveLibrary(list) { try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }

  /* what a NODRUS node shows: the system it is linked to (as PARTRUS is editing it right now, or as saved in the
     library) — or its own copy, saved with the patch (another device, or a system deleted from the library) */
  const live = new Map();
  let libCache = null;
  const libMap = () => { if (!libCache) { libCache = new Map(); library().forEach(e => libCache.set(e.id, e.sys)); } return libCache; };
  if ('BroadcastChannel' in window) {
    const ch = new BroadcastChannel('pudrus-partrus');
    ch.addEventListener('message', e => {
      const m = e.data || {};
      if (m.type === 'sys' && typeof m.id === 'string') { const s = sane(m.sys); if (s) live.set(m.id, s); }
      else if (m.type === 'lib') libCache = null;
    });
  }
  addEventListener('storage', e => { if (e.key === LIB_KEY) libCache = null; });
  function resolve(p) {
    if (!p) return null;
    if (p.lib) { const l = live.get(p.lib) || libMap().get(p.lib); if (l) return l; }
    return p.sys || null;
  }

  window.PudrusParticles = {
    DEFS, CATS, PRESETS, blank, sane, isEmitter, FONTS, get cameraState() { return pool && pool.cam ? pool.cam.st : 'off'; }, compile, structureKey, valueOf, paramOf, isChain,
    createSim, source, resolve, library, saveLibrary, LIB_KEY,
    get ok() { return getPool().ok; }, get error() { return getPool().err; }, get canvas() { return getPool().canvas; },
    channel: 'pudrus-partrus',
  };
})();
