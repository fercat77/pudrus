/* DRUS · NÚCLEO — a first-person action game inside a neon structure that is generated anew every run.
   Each level: find and destroy its cores (each one you take down blacks out its room), then reach the exit;
   every level is bigger, with more and stranger enemies. An original game: own WebGL2 renderer (glowing edges,
   dynamic lights, bloom), own level generator, own Web Audio synth. Desktop: mouse + keyboard; phones: touch sticks. */
(function () {
  'use strict';
  const J = window.__juegos; if (!J) return;
  const { tr, el } = J;

  /* ═══════════════ shaders ═══════════════ */
  const LEVEL_VS = `#version 300 es
layout(location=0) in vec3 a_p; layout(location=1) in vec3 a_n; layout(location=2) in vec2 a_uv; layout(location=3) in vec4 a_i;
uniform mat4 u_vp; uniform float u_time, u_warp; out vec3 vP; out vec3 vN; out vec2 vUV; out vec4 vI;
void main() {
  vec3 p = a_p;
  if (u_warp > 0.0) {   // deep levels: the structure breathes (one smooth field, so the faces never come apart)
    p += vec3(sin(a_p.z * 0.55 + u_time * 0.9) + 0.5 * sin(a_p.y * 1.3 + u_time * 1.7),
              0.4 * sin(a_p.x * 0.45 + a_p.z * 0.35 + u_time * 0.7),
              sin(a_p.x * 0.5 - u_time * 1.1) + 0.5 * sin(a_p.y * 1.1 - u_time * 1.3)) * u_warp;
  }
  vP = p; vN = a_n; vUV = a_uv; vI = a_i; gl_Position = u_vp * vec4(p, 1.0);
}`;
  // a_i = face height, kind (0 floor, 1 ceiling, 2 wall, 3 lintel), room (palette index), -
  const LEVEL_FS = `#version 300 es
precision highp float;
in vec3 vP; in vec3 vN; in vec2 vUV; in vec4 vI;
uniform vec3 u_eye; uniform float u_time, u_psy;
uniform vec4 u_lp[16]; uniform vec4 u_lc[16]; uniform int u_nl;
uniform vec4 u_rc[16];
uniform vec4 u_rp[16];   // each room's patterns: x = floor, y = walls (0 grid, 1 hexagons, 2 diamonds, 3 panels, 4 triangles)
out vec4 o;
const float CS = 2.0;
float line(float x, float w) { float d = abs(fract(x + 0.5) - 0.5); float fw = fwidth(x); return (1.0 - smoothstep(w, w + fw * 1.5, d)) * clamp(1.2 - fw * 3.0, 0.0, 1.0); }
float edge(float d, float w) { float fw = fwidth(d); return (1.0 - smoothstep(w, w + fw * 1.5, d)) * clamp(1.2 - fw * 3.0, 0.0, 1.0); }
float hexL(vec2 p, float w) {   // the edges of a honeycomb (one hexagon per unit)
  const vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h, b = mod(p - h, r) - h, g = dot(a, a) < dot(b, b) ? a : b, q = abs(g);
  return edge(0.5 - max(dot(q, vec2(0.5, 0.8660254)), q.x), w);
}
vec3 hueShift(vec3 c, float h) { const vec3 k = vec3(0.57735); float a = h * 6.2831853, ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
// every pattern (and the melting) repeats exactly once per cell and is mirror-symmetric, so it runs on unbroken
// from cell to cell, from one wall to the next and round the corners (p is in cells)
vec2 melt(vec2 p) { return p + u_psy * 0.06 * vec2(sin(p.y * 6.2831853 + u_time * 0.9), sin(p.x * 6.2831853 - u_time * 0.7)); }
vec2 hexq(vec2 p) { return vec2(p.x * 2.0, p.y * 1.7320508); }   // two hexagons across a cell, one row of the lattice down it
float pattern(int k, vec2 p, float w) {
  if (k == 5) { vec2 c = fract(p) - 0.5; return line(length(c) * 6.0 - u_time * 0.4, w * 1.5); }   // ripples
  if (k == 6) { vec2 c = abs(fract(p) - 0.5); return line(length(c) * 8.0 + atan(c.y, c.x) / 1.5707963 * 2.0 - u_time * 0.5, w * 1.6); }   // kaleidoscope swirls
  if (k == 7) return hexL(hexq(p) + 0.3 * vec2(sin(p.y * 6.2831853 + u_time), sin(p.x * 6.2831853 - u_time * 1.2)), w * 1.3);   // melting honeycomb
  if (k == 1) return hexL(hexq(p), w * 1.2);
  if (k == 2) { vec2 d = vec2(p.x + p.y, p.x - p.y) * 2.0; return max(line(d.x, w), line(d.y, w)); }
  if (k == 3) { vec2 f = abs(fract(p) - 0.5); float m = max(f.x, f.y); return max(max(line(p.x, w), line(p.y, w)), edge(abs(m - 0.36), w) * 0.7); }
  if (k == 4) { vec2 q = p * 2.0; return max(line(q.y, w), max(line((q.y - 2.0 * q.x) * 0.5, w), line((q.y + 2.0 * q.x) * 0.5, w))); }
  return max(line(p.x, w), line(p.y, w));
}
void main() {
  int slot = clamp(int(vI.z + 0.5), 0, 15);
  vec4 rc = u_rc[slot];
  int pf = int(u_rp[slot].x + 0.5), pw = int(u_rp[slot].y + 0.5);
  float kind = vI.y, dist = length(vP - u_eye), em = 0.0;
  if (kind < 0.5) {   // the floor: this room's pattern, a faint fine grid, and pulses of light running along the lines
    vec2 g = melt(vP.xz / CS);
    float L = pattern(pf, g, 0.018);
    em += L * (0.35 + 1.4 * pow(0.5 + 0.5 * sin((vP.x + vP.z) * 0.45 - u_time * 2.6), 12.0));
    if (pf == 0) em += max(line(g.x * 4.0, 0.025), line(g.y * 4.0, 0.025)) * 0.05;
  } else if (kind < 1.5) {
    em += pattern(pf, melt(vP.xz / CS), 0.012) * 0.1;
  } else {   // walls: a bright line where they meet the floor, another at the top, and this room's pattern
    float h = vI.x, v = vUV.y, fv = fwidth(v);
    em += (1.0 - smoothstep(0.0, 0.05 + fv * 1.5, v)) * (kind < 2.5 ? 2.2 : 1.2);
    em += (1.0 - smoothstep(0.0, 0.04 + fv * 1.5, h - v)) * 0.9;
    if (pw == 0) { em += line(vUV.x / CS, 0.01) * 0.5; em += line(v, 0.008) * 0.07; }
    else em += pattern(pw, melt(vec2(vUV.x, v) / CS), 0.014) * (0.32 + 0.5 * pow(0.5 + 0.5 * sin(v * 1.2 - u_time * 1.6 + vUV.x * 0.15), 10.0));   // with a slow glow climbing the walls
    if (kind > 3.5) em *= 0.3;   // a fold's far back wall: only a backdrop
  }
  vec3 N = normalize(vN), V = normalize(u_eye - vP), col = vec3(0.012, 0.014, 0.022);
  for (int i = 0; i < 16; i++) {
    if (i >= u_nl) break;
    vec3 L = u_lp[i].xyz - vP; float d2 = dot(L, L), r = u_lp[i].w;
    float att = max(0.0, 1.0 - d2 / (r * r)); att *= att;
    if (att <= 0.0) continue;
    vec3 Ld = L * inversesqrt(d2 + 1e-4);
    float diff = max(dot(N, Ld), 0.0);
    float spec = pow(max(dot(N, normalize(Ld + V)), 0.0), 40.0) * (kind < 0.5 ? 2.2 : 0.35);   // a glossy floor
    col += u_lc[i].rgb * att * (diff * 0.45 + spec);
    em += att * diff * 0.5;
  }
  vec3 neon = rc.rgb;
  if (u_psy > 0.0) neon = mix(neon, max(hueShift(neon, u_time * 0.07 + (vP.x + vP.z) * 0.03 + vP.y * 0.06), 0.0), u_psy);   // the colours drift into a rainbow
  col += neon * em * rc.a;
  float fog = exp(-dist * 0.04);
  vec3 fogc = vec3(0.006, 0.0, 0.014) + max(hueShift(vec3(0.05, 0.0, 0.08), u_time * 0.05), 0.0) * u_psy;
  o = vec4(col * fog + fogc * (1.0 - fog), 1.0);
}`;
  const ENT_VS = `#version 300 es
layout(location=0) in vec3 a_p; layout(location=1) in vec3 a_n; layout(location=2) in vec4 a_b;
uniform mat4 u_vp, u_m; uniform float u_wob, u_time; out vec3 vP; out vec3 vN; out vec4 vB;
void main() {
  vec3 p = a_p * (1.0 + u_wob * sin(a_p.y * 5.0 + a_p.x * 3.0 + u_time * 6.0));   // deep levels: the shapes melt
  vec4 w = u_m * vec4(p, 1.0); vP = w.xyz; vN = mat3(u_m) * a_n; vB = a_b; gl_Position = u_vp * w;
}`;
  const ENT_FS = `#version 300 es
precision highp float;
in vec3 vP; in vec3 vN; in vec4 vB;
uniform vec3 u_col, u_eye; uniform float u_flash, u_glow, u_fill, u_fog, u_hue;
out vec4 o;
vec3 hueShift(vec3 c, float h) { const vec3 k = vec3(0.57735); float a = h * 6.2831853, ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
void main() {
  float e = min(min(vB.x, vB.y), min(vB.z, vB.w)), fw = fwidth(e);
  float wire = 1.0 - smoothstep(0.04, 0.04 + fw * 1.5, e);
  vec3 V = normalize(u_eye - vP);
  float rim = pow(1.0 - abs(dot(normalize(vN), V)), 2.5);
  vec3 base = u_hue != 0.0 ? max(hueShift(u_col, u_hue + dot(vP, vec3(0.08))), 0.0) : u_col;
  vec3 c = base * (wire * 3.2 * u_glow + rim * 1.1 * u_glow + u_fill) + vec3(u_flash * 3.0);
  float fog = u_fog > 0.5 ? exp(-length(u_eye - vP) * 0.035) : 1.0;
  o = vec4(c * fog, 1.0);
}`;
  const PTS_VS = `#version 300 es
layout(location=0) in vec3 a_p; layout(location=1) in float a_s; layout(location=2) in vec4 a_c;
uniform mat4 u_vp; uniform float u_ph; out vec4 vC;
void main() { vec4 c = u_vp * vec4(a_p, 1.0); gl_Position = c; gl_PointSize = clamp(a_s * u_ph / max(c.w, 0.05), 1.0, 96.0); vC = a_c; }`;
  const PTS_FS = `#version 300 es
precision highp float; in vec4 vC; out vec4 o;
void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; o = vec4(vC.rgb * exp(-r * 3.5) * vC.a, 1.0); }`;
  const QUAD_VS = `#version 300 es
out vec2 uv; void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const BRIGHT_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D u_img; uniform vec2 u_px; out vec4 o;
void main() {
  vec3 c = (texture(u_img, uv + u_px * vec2(-1.0, -1.0)).rgb + texture(u_img, uv + u_px * vec2(1.0, -1.0)).rgb + texture(u_img, uv + u_px * vec2(-1.0, 1.0)).rgb + texture(u_img, uv + u_px).rgb) * 0.25;
  float m = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.35, 1.4, m), 1.0);
}`;
  const BLUR_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D u_img; uniform vec2 u_dir; out vec4 o;
void main() {
  vec3 c = texture(u_img, uv).rgb * 0.2270;
  c += (texture(u_img, uv + u_dir * 1.3846).rgb + texture(u_img, uv - u_dir * 1.3846).rgb) * 0.3162;
  c += (texture(u_img, uv + u_dir * 3.2308).rgb + texture(u_img, uv - u_dir * 3.2308).rgb) * 0.0703;
  o = vec4(c, 1.0);
}`;
  const ECHO_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D u_img, u_prev; uniform float u_k, u_rot, u_zoom, u_hue; out vec4 o;
vec3 hueShift(vec3 c, float h) { const vec3 k = vec3(0.57735); float a = h * 6.2831853, ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
void main() {
  vec2 c = uv - 0.5; float s = sin(u_rot), co = cos(u_rot);
  vec2 q = vec2(co * c.x - s * c.y, s * c.x + co * c.y) * u_zoom + 0.5;
  vec3 prev = max(hueShift(texture(u_prev, q).rgb, u_hue), 0.0) * u_k;
  o = vec4(max(texture(u_img, uv).rgb, prev), 1.0);
}`;
  const COMP_FS = `#version 300 es
precision highp float; in vec2 uv;
uniform sampler2D u_img, u_bloom; uniform float u_hurt, u_time, u_ab, u_bk, u_fade; uniform vec2 u_res;
out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 c = uv - 0.5; float r2 = dot(c, c), ab = u_ab * r2;
  vec3 col = vec3(texture(u_img, uv + c * ab).r, texture(u_img, uv).g, texture(u_img, uv - c * ab).b);
  col += texture(u_bloom, uv).rgb * u_bk;
  col *= 1.0 - 0.5 * smoothstep(0.08, 0.5, r2);
  col += vec3(0.9, 0.0, 0.12) * u_hurt * smoothstep(0.03, 0.45, r2) * 1.2;
  col = aces(col * 1.15);
  col += (fract(sin(dot(uv * u_res + u_time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.022;
  col *= 0.975 + 0.025 * sin(uv.y * u_res.y * 3.14159);
  o = vec4(col * u_fade, 1.0);
}`;

  /* ═══════════════ the strange ones: rare beings who talk (in riddles) ═══════════════ */
  const NAMES = [['La que cuenta pasillos', 'She who counts corridors'], ['El testigo del apagón', 'The witness of the blackout'], ['Eco sin origen', 'Echo with no source'],
    ['El jardinero de hexágonos', 'The hexagon gardener'], ['La voz entre dos píxeles', 'The voice between two pixels'], ['El que llegó mañana', 'The one who arrived tomorrow'],
    ['Guardiana del color perdido', 'Keeper of the lost colour'], ['El cartógrafo ciego', 'The blind cartographer'], ['Rumor de neón', 'Neon rumour'], ['La sombra que brilla', 'The shadow that glows']];
  const OPEN = [['¿Vos también escuchás el zumbido de las paredes? Están soñando que son paredes.', 'Do you hear the walls humming too? They are dreaming they are walls.'],
    ['Llegaste tarde, o yo llegué temprano. Acá adentro es lo mismo.', 'You are late, or I am early. In here it is the same thing.'],
    ['No dispares. Soy solo una idea que alguien dejó encendida.', 'Don’t shoot. I am just an idea someone left switched on.'],
    ['Te estaba esperando desde antes de que existiera este nivel.', 'I have been waiting for you since before this level existed.'],
    ['Shh. Si hablás muy fuerte, la grilla se acuerda de vos.', 'Shh. If you speak too loud, the grid remembers you.'],
    ['Hola, viajero de los ángulos rectos.', 'Hello, traveller of right angles.'],
    ['Cada vez que apagás un núcleo, alguien en otro nivel se despierta.', 'Every time you shut down a core, someone on another level wakes up.']];
  const MID = [['Los hexágonos son cuadrados que aprendieron a respirar.', 'Hexagons are squares that learned to breathe.'],
    ['El color que buscás está escondido detrás del último color que viste.', 'The colour you are looking for hides behind the last colour you saw.'],
    ['Esta estructura no se construyó: se recordó.', 'This structure was not built: it was remembered.'],
    ['Los rojos no te odian. Solo tienen demasiado apuro por volverse luz.', 'The red ones don’t hate you. They are just in too much of a hurry to become light.'],
    ['Contá tus pasos hasta la salida. Después contalos al revés. No da lo mismo.', 'Count your steps to the exit. Then count them backwards. It doesn’t add up.'],
    ['La salida es una puerta que se cansó de ser pared.', 'The exit is a door that got tired of being a wall.'],
    ['Si mirás el piso mucho tiempo, el piso empieza a mirarte con tus mismos ojos.', 'Stare at the floor long enough and it starts staring back with your eyes.'],
    ['Abajo de cada nivel hay otro nivel, y abajo de ese, una canción.', 'Under every level there is another level, and under that one, a song.'],
    ['El tiempo acá se mide en parpadeos de neón. Vos ya llevás tres mil.', 'Time here is measured in neon blinks. You are already at three thousand.'],
    ['Yo antes era un enemigo. Un día me olvidé de qué.', 'I used to be an enemy. One day I forgot of what.'],
    ['Las paredes se mueven solo cuando no las mirás. Por eso tiemblan cuando las mirás.', 'Walls only move when you are not looking. That is why they shiver when you are.'],
    ['Hay un núcleo que late adentro tuyo. No lo apagues todavía.', 'There is a core beating inside you. Don’t shut it down yet.'],
    ['Lo que llamás arriba es un abajo que se dio vuelta para verte.', 'What you call up is a down that turned around to see you.'],
    ['Los violetas atraviesan las paredes porque nadie les dijo que eran paredes.', 'The violet ones go through walls because nobody told them they were walls.']];
  const GIFTS = [['heal', 'Tomá un poco de luz. No me la devuelvas: ya no sé dónde guardarla.', 'Take some light. Don’t give it back: I no longer know where to keep it.', '+30 de energía', '+30 energy'],
    ['map', 'Te dibujo los núcleos en la memoria. Cuando parpadees, van a estar ahí.', 'I’ll draw the cores into your memory. When you blink, they will be there.', 'Los núcleos aparecen en tu mapa', 'The cores show up on your map'],
    ['calm', 'Voy a cantarles a los de afuera para que se olviden de vos un rato.', 'I’ll sing to the ones outside so they forget you for a while.', 'Los enemigos se duermen un rato', 'The enemies fall asleep for a while'],
    ['score', 'Esto es el recuerdo de alguien que ganó. Usalo como quieras.', 'This is the memory of someone who won. Use it however you like.', '+750 puntos', '+750 points']];
  function hsv(h, s, v) { const f = n => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; }

  /* ═══════════════ small math ═══════════════ */
  function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; }
  function mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function basis(yaw, pitch, roll) {
    const cp = Math.cos(pitch), f = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
    let r = [Math.cos(yaw), 0, Math.sin(yaw)];
    let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    if (roll) { const c = Math.cos(roll), s = Math.sin(roll), r2 = r.map((x, i) => x * c + u[i] * s); u = u.map((x, i) => x * c - r[i] * s); r = r2; }
    return { f, r, u };
  }
  function viewM(e, B) {
    const { f, r, u } = B, o = new Float32Array(16), d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    o[0] = r[0]; o[4] = r[1]; o[8] = r[2]; o[12] = -d(r, e);
    o[1] = u[0]; o[5] = u[1]; o[9] = u[2]; o[13] = -d(u, e);
    o[2] = -f[0]; o[6] = -f[1]; o[10] = -f[2]; o[14] = d(f, e); o[15] = 1;
    return o;
  }
  function modelM(x, y, z, s, a, b) {   // translate · rotate Y (a) · rotate X (b) · uniform scale
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), o = new Float32Array(16);
    o[0] = ca * s; o[2] = -sa * s; o[4] = sa * sb * s; o[5] = cb * s; o[6] = ca * sb * s; o[8] = sa * cb * s; o[9] = -sb * s; o[10] = ca * cb * s;
    o[12] = x; o[13] = y; o[14] = z; o[15] = 1; return o;
  }

  /* ═══════════════ shapes (flat faces; a_b tells how far from a face's edge, for the glowing edges) ═══════════════ */
  function shape() { const v = []; return {
    v, tri(a, b, c) { const n = norm(cross(sub(b, a), sub(c, a))); [[a, [1, 0, 0, 1]], [b, [0, 1, 0, 1]], [c, [0, 0, 1, 1]]].forEach(([p, w]) => v.push(...p, ...n, ...w)); },
    quad(a, b, c, d) {   // a b c d around the face
      const n = norm(cross(sub(b, a), sub(d, a)));
      const P = [[a, 0, 0], [b, 1, 0], [c, 1, 1], [a, 0, 0], [c, 1, 1], [d, 0, 1]];
      P.forEach(([p, u, w]) => v.push(...p, ...n, u, 1 - u, w, 1 - w));
    } }; }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function octa() { const s = shape(), P = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]].forEach(([a, b, c]) => s.tri(P[a], P[b], P[c])); return s.v; }
  function box(sx, sy, sz, ox = 0, oy = 0, oz = 0, s = shape()) {
    const p = (x, y, z) => [ox + x * sx, oy + y * sy, oz + z * sz];
    s.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)); s.quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1));
    s.quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)); s.quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1));
    s.quad(p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)); s.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1));
    return s;
  }
  function icosa() {
    const t = (1 + Math.sqrt(5)) / 2, s = shape();
    const P = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].forEach(([a, b, c]) => s.tri(P[a], P[b], P[c]));
    return s.v;
  }
  function ring(R, w, n) {   // a flat band standing up (the exit), facing ±z
    const s = shape();
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, c0 = [Math.cos(a0), Math.sin(a0)], c1 = [Math.cos(a1), Math.sin(a1)];
      const o0 = [c0[0] * R, c0[1] * R, 0], o1 = [c1[0] * R, c1[1] * R, 0], i0 = [c0[0] * (R - w), c0[1] * (R - w), 0], i1 = [c1[0] * (R - w), c1[1] * (R - w), 0];
      s.quad(i0, o0, o1, i1); s.quad(o0, i0, i1, o1);
    }
    return s.v;
  }
  const plus = () => box(0.12, 0.42, 0.12, 0, 0, 0, box(0.42, 0.12, 0.12)).v;
  const avatar = () => { const s = box(0.2, 0.32, 0.14, 0, 0.95, 0); box(0.15, 0.15, 0.15, 0, 1.5, 0, s); box(0.07, 0.3, 0.08, -0.1, 0.32, 0, s); box(0.07, 0.3, 0.08, 0.1, 0.32, 0, s); box(0.24, 0.05, 0.05, 0.28, 1.08, 0, s); return s.v; };
  const gun = () => { const s = box(0.045, 0.05, 0.26, 0, 0, -0.06); box(0.03, 0.03, 0.1, 0, 0.065, -0.2, s); box(0.035, 0.07, 0.04, 0, -0.08, 0.1, s); box(0.05, 0.012, 0.18, 0, 0.0, -0.06, s); return s.v; };

  /* ═══════════════ levels ═══════════════ */
  const CS = 2;   // a cell, in world units
  const PAL = [[0, 0.85, 1], [0.25, 0.45, 1], [0.66, 0.32, 1], [0.1, 1, 0.65], [1, 0.32, 0.85]];   // cyan, blue, violet, mint, pink
  const CORR = 15;   // the corridors' palette slot
  // the patterns appear level by level: grid → panels → hexagons → diamonds → triangles → ripples → spirals → melting honeycomb
  const UNLOCK = [0, 3, 1, 2, 4, 5, 6, 7];
  const pickOf = (pool, rnd) => pool[Math.floor(rnd() * pool.length)];
  let FP = [0], WP = [0];
  function generate(level, rnd) {
    const open = UNLOCK.slice(0, Math.min(UNLOCK.length, level)), newest = open[open.length - 1];
    FP = [...open, newest, newest];   // the newest one, more often (so you notice it arrived)
    WP = [...open, newest, newest, ...(level >= 3 ? [1] : [])];   // and hexagons, a favourite on walls
    const W = Math.min(60, 26 + level * 5), H = W;
    const grid = new Uint8Array(W * H).fill(1), ceil = new Float32Array(W * H), rid = new Int16Array(W * H).fill(-1), corr = new Uint8Array(W * H);
    const rooms = [], want = Math.min(14, 5 + Math.floor(level * 1.5));
    for (let t = 0; t < 800 && rooms.length < want; t++) {
      const w = 4 + Math.floor(rnd() * 6), h = 4 + Math.floor(rnd() * 6);
      const x = 1 + Math.floor(rnd() * (W - w - 2)), y = 1 + Math.floor(rnd() * (H - h - 2));
      if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      const big = w * h >= 42;
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), hgt: [4, 4, 6, 8][Math.floor(rnd() * (big ? 4 : 3))], hue: Math.floor(rnd() * PAL.length),
        pf: pickOf(FP, rnd), pw: pickOf(WP, rnd) });
    }
    rooms.forEach((r, k) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const i = y * W + x; grid[i] = 0; ceil[i] = r.hgt; rid[i] = k; } });
    // corridors: a spanning tree (every room reachable) plus a few loops (so it isn't a maze of dead ends)
    const n = rooms.length, inT = new Array(n).fill(false), edges = [], d2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
    inT[0] = true;
    for (let k = 1; k < n; k++) {
      let best = null;
      for (let a = 0; a < n; a++) if (inT[a]) for (let b = 0; b < n; b++) if (!inT[b]) { const d = d2(rooms[a], rooms[b]); if (!best || d < best[2]) best = [a, b, d]; }
      inT[best[1]] = true; edges.push([best[0], best[1]]);
    }
    for (let a = 0; a < n; a++) if (rnd() < 0.35) {
      let best = -1, bd = Infinity;
      for (let b = 0; b < n; b++) if (b !== a && !edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) { const d = d2(rooms[a], rooms[b]); if (d < bd) { bd = d; best = b; } }
      if (best >= 0 && bd < (W * 0.45) ** 2) edges.push([a, best]);
    }
    const carve = (x, y) => { if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return; const i = y * W + x; corr[i] = 1; if (grid[i] === 1) { grid[i] = 0; ceil[i] = 4; rid[i] = -1; } };
    const hline = (x0, x1, y) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 1; x++) { carve(x, y); carve(x, y + 1); } };
    const vline = (y0, y1, x) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + 1; y++) { carve(x, y); carve(x + 1, y); } };
    edges.forEach(([a, b]) => { const A = rooms[a], B = rooms[b]; if (rnd() < 0.5) { hline(A.cx, B.cx, A.cy); vline(A.cy, B.cy, B.cx); } else { vline(A.cy, B.cy, A.cx); hline(A.cx, B.cx, B.cy); } });
    // pillars in the big rooms (never next to a corridor, so nothing gets blocked)
    const nearCorr = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (corr[(y + j) * W + x + i]) return true; return false; };
    rooms.forEach(r => {
      if (r.w < 7 || r.h < 7) return;
      [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]].forEach(([x, y]) => { if (!nearCorr(x, y)) grid[y * W + x] = 1; });
    });
    // how far each room is from the first one (walking): the cores and the exit go to the far ones
    const dist = bfs(grid, W, H, rooms[0].cx, rooms[0].cy);
    const order = rooms.map((r, k) => k).slice(1).sort((a, b) => dist[rooms[b].cy * W + rooms[b].cx] - dist[rooms[a].cy * W + rooms[a].cx]);
    const exitRoom = order[0];
    const nCores = Math.max(1, Math.min(order.length - 1, 2 + Math.floor((level - 1) / 2), 5));
    const coreRooms = order.slice(1, 1 + nCores);
    if (!coreRooms.length) coreRooms.push(exitRoom);
    const free = r => { const c = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!grid[y * W + x] && (Math.abs(x - r.cx) > 1 || Math.abs(y - r.cy) > 1)) c.push([x, y]); return c; };
    const enemies = [], cap = 8 + level * 6;
    rooms.forEach((r, k) => {
      if (k === 0) return;
      const cells = free(r); let m = Math.round((r.w * r.h / 24) * (0.55 + level * 0.25) * (0.7 + rnd() * 0.6));
      while (m-- > 0 && cells.length && enemies.length < cap) {
        const [x, y] = cells.splice(Math.floor(rnd() * cells.length), 1)[0];
        const wts = [['drone', 1], ['shoot', level >= 2 ? 0.7 : 0.35], ['split', level >= 3 ? 0.45 : 0], ['phase', level >= 4 ? Math.min(0.8, 0.18 * (level - 3)) : 0]];
        let s = wts.reduce((a, b) => a + b[1], 0) * rnd(), type = 'drone';
        for (const [k, v] of wts) { if ((s -= v) <= 0) { type = k; break; } }
        enemies.push({ type, x: (x + 0.5) * CS, z: (y + 0.5) * CS });
      }
    });
    const pickups = [];
    for (let k = 0; k < 2 + Math.floor(level / 2); k++) { const r = rooms[1 + Math.floor(rnd() * (n - 1))]; const c = free(r); if (c.length) { const [x, y] = c[Math.floor(rnd() * c.length)]; pickups.push({ x: (x + 0.5) * CS, z: (y + 0.5) * CS }); } }
    // a «fold» (level 3 on): one core sits in a side-scrolling zone, reached through a portal on a wall of its room
    let portal = null;
    if (level >= 3 && rnd() < 0.8) {
      const k = coreRooms[Math.floor(rnd() * coreRooms.length)], r = rooms[k], cand = [];
      const side = (x, y, ox, oy, nx, nz) => { if (!grid[y * W + x] && grid[oy * W + ox] === 1 && !corr[oy * W + ox]) cand.push({ x, y, nx, nz }); };
      for (let x = r.x; x < r.x + r.w; x++) { side(x, r.y, x, r.y - 1, 0, 1); side(x, r.y + r.h - 1, x, r.y + r.h, 0, -1); }
      for (let y = r.y; y < r.y + r.h; y++) { side(r.x, y, r.x - 1, y, 1, 0); side(r.x + r.w - 1, y, r.x + r.w, y, -1, 0); }
      if (cand.length) {
        const c = cand[Math.floor(rnd() * cand.length)], fx = (c.x + 0.5) * CS, fz = (c.y + 0.5) * CS;
        portal = { room: k, fx, fz, x: fx - c.nx * (CS / 2 - 0.03), z: fz - c.nz * (CS / 2 - 0.03), nx: c.nx, nz: c.nz, pat: r.pw };
      }
    }
    // now and then (never on level 1) a strange one waits in a quiet room
    let npc = null;
    const quiet = rooms.map((r, k) => k).filter(k => k > 0 && !coreRooms.includes(k));
    if (level >= 2 && quiet.length && rnd() < 0.45) {
      const r = rooms[quiet[Math.floor(rnd() * quiet.length)]], c = free(r);
      if (c.length) {
        const [x, y] = c[Math.floor(rnd() * c.length)], pick = a => a[Math.floor(rnd() * a.length)];
        const mids = [pick(MID)]; if (rnd() < 0.6) { let m2 = pick(MID); if (m2 !== mids[0]) mids.push(m2); }
        npc = { x: (x + 0.5) * CS, z: (y + 0.5) * CS, name: pick(NAMES), lines: [pick(OPEN), ...mids], gift: pick(GIFTS), hue: rnd() };
      }
    }
    return { W, H, grid, ceil, rid, rooms, exitRoom, coreRooms, enemies, pickups, npc, portal, start: rooms[0], corrPat: [pickOf(FP, rnd), pickOf(WP, rnd)] };
  }
  // the fold's course: platforms laid out in the style of its room's pattern (hexagons: staggered; triangles: stairs; spirals: a tower…)
  function genFold(level, rnd, pat) {
    const style = ['flat', 'flat', 'diag', 'hex', 'steps', 'float', 'tower', 'hex'][pat] || 'flat';
    const P = [], en = [];
    const slab = (x0, x1, top, pillar) => P.push({ x0, x1, y0: pillar ? top - 16 : top - 0.9, y1: top });
    slab(-12, 6, 0, true);
    let x = 6, y = 0;
    const n = 7 + Math.min(9, level);
    for (let i = 0; i < n; i++) {
      let gap = 1.4 + rnd() * Math.min(3.2, 1.4 + level * 0.25), w = 2.5 + rnd() * 3.5, dy = (rnd() - 0.5) * 2;
      if (style === 'hex') { dy = i % 2 ? 1.4 : -1.2; w = 2.4; gap = 1.4 + rnd() * 1.6; }
      else if (style === 'diag') dy = i % 4 === 3 ? -2.6 : 1.3;
      else if (style === 'steps') { dy = rnd() < 0.7 ? 1.2 : -2; gap = 1 + rnd() * 1.5; w = 2 + rnd() * 1.5; }
      else if (style === 'float') { w = 1.6 + rnd() * 1.2; dy = (rnd() - 0.5) * 3.4; }
      else if (style === 'tower') { gap = 0.8 + rnd() * 0.8; w = 2; dy = 1.7 * (Math.floor(i / 4) % 2 ? -1 : 1); }
      dy = Math.max(-3, Math.min(1.8, dy)); if (dy > 0.8) gap = Math.min(gap, 3);   // always reachable (a jump, at most with the dash)
      y = Math.max(-2, Math.min(10, y + dy));
      x += gap; slab(x, x + w, y, style === 'flat' || style === 'steps' ? rnd() < 0.6 : rnd() < 0.2);
      if (i > 0 && rnd() < 0.35 + level * 0.03) {
        const type = rnd() < 0.4 ? 'shoot' : level >= 4 && rnd() < 0.35 ? 'phase' : 'drone';
        en.push({ type, x: x + w / 2, y: y + (type === 'shoot' ? 1.3 : 2.6) });
      }
      x += w;
    }
    x += 2; slab(x, x + 15, y, true);
    const core = { x: x + 10.5, y: y + 2.6 };
    en.push({ type: 'drone', x: x + 6, y: y + 3 }, { type: level >= 5 ? 'phase' : 'drone', x: x + 9, y: y + 4.5 });
    const ys = P.map(p => p.y1);
    return { P, en, core, end: x + 15, style, minY: Math.min(...ys), maxY: Math.max(...ys) };
  }
  function foldMesh(Fd, slot) {
    const v = [], push = (p, n, uv, inf) => v.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], inf[0], inf[1], inf[2], 0);
    const quad = (a, b, c, d, n, ua, ub, uc, ud, inf) => { push(a, n, ua, inf); push(b, n, ub, inf); push(c, n, uc, inf); push(a, n, ua, inf); push(c, n, uc, inf); push(d, n, ud, inf); };
    const Z0 = -1.4, Z1 = 1.4;
    for (const q of Fd.P) {
      const { x0, x1, y0, y1 } = q, h = y1 - y0;
      quad([x0, y1, Z0], [x0, y1, Z1], [x1, y1, Z1], [x1, y1, Z0], [0, 1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0, slot]);   // the top (the room's floor pattern)
      quad([x0, y0, Z1], [x1, y0, Z1], [x1, y1, Z1], [x0, y1, Z1], [0, 0, 1], [x0, 0], [x1, 0], [x1, h], [x0, h], [h, 2, slot]);   // the front (its wall pattern)
      quad([x0, y0, Z0], [x0, y0, Z1], [x0, y1, Z1], [x0, y1, Z0], [-1, 0, 0], [Z0, 0], [Z1, 0], [Z1, h], [Z0, h], [h, 2, slot]);
      quad([x1, y0, Z1], [x1, y0, Z0], [x1, y1, Z0], [x1, y1, Z1], [1, 0, 0], [Z1, 0], [Z0, 0], [Z0, h], [Z1, h], [h, 2, slot]);
      quad([x0, y0, Z0], [x1, y0, Z0], [x1, y0, Z1], [x0, y0, Z1], [0, -1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 1, slot]);
    }
    const X0 = -18, X1 = Fd.end + 14, Y0 = Fd.minY - 18, Y1 = Fd.maxY + 16, BZ = -6;   // far behind: one huge wall with the pattern
    quad([X0, Y0, BZ], [X1, Y0, BZ], [X1, Y1, BZ], [X0, Y1, BZ], [0, 0, 1], [X0, 0], [X1, 0], [X1, Y1 - Y0], [X0, Y1 - Y0], [Y1 - Y0, 4, slot]);
    return new Float32Array(v);
  }
  function bfs(grid, W, H, sx, sy) {
    const d = new Int32Array(W * H).fill(1e9), q = new Int32Array(W * H); let h = 0, t = 0;
    const s = sy * W + sx; if (grid[s]) return d;
    d[s] = 0; q[t++] = s;
    while (h < t) { const c = q[h++], x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const i = ny * W + nx; if (grid[i] || d[i] <= d[c] + 1) continue; d[i] = d[c] + 1; q[t++] = i; } }
    return d;
  }
  // the level → one mesh: floors, ceilings, walls up to each cell's ceiling, and «lintels» where a ceiling steps down
  function levelMesh(M) {
    const { W, H, grid, ceil, rid } = M, v = [];
    const slot = i => (rid[i] < 0 ? CORR : Math.min(14, rid[i]));
    const push = (p, n, uv, inf) => v.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], inf[0], inf[1], inf[2], 0);
    const quad = (a, b, c, d, n, ua, ub, uc, ud, inf) => { push(a, n, ua, inf); push(b, n, ub, inf); push(c, n, uc, inf); push(a, n, ua, inf); push(c, n, uc, inf); push(d, n, ud, inf); };
    const solidAt = (x, y) => x < 0 || y < 0 || x >= W || y >= H || grid[y * W + x] === 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (grid[i]) continue;
      const x0 = x * CS, x1 = x0 + CS, z0 = y * CS, z1 = z0 + CS, h = ceil[i], s = slot(i);
      quad([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [0, 1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0, s]);
      quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], [0, -1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 1, s]);
      // the four sides: [neighbour dx, dy, face corners from → to (looking from this cell), normal]
      const sides = [[0, -1, [x1, z0], [x0, z0], [0, 0, 1]], [0, 1, [x0, z1], [x1, z1], [0, 0, -1]], [-1, 0, [x0, z0], [x0, z1], [1, 0, 0]], [1, 0, [x1, z1], [x1, z0], [-1, 0, 0]]];
      for (const [dx, dy, A, B, n] of sides) {
        const along = dx === 0 ? [A[0], B[0]] : [A[1], B[1]];
        // counter-clockwise seen from inside this cell (the back faces are culled)
        if (solidAt(x + dx, y + dy)) {
          quad([A[0], 0, A[1]], [A[0], h, A[1]], [B[0], h, B[1]], [B[0], 0, B[1]], n, [along[0], 0], [along[0], h], [along[1], h], [along[1], 0], [h, 2, s]);
        } else {
          const hn = ceil[(y + dy) * W + x + dx];
          if (hn < h - 0.01) quad([A[0], hn, A[1]], [A[0], h, A[1]], [B[0], h, B[1]], [B[0], hn, B[1]], n, [along[0], 0], [along[0], h - hn], [along[1], h - hn], [along[1], 0], [h - hn, 3, s]);
        }
      }
    }
    return new Float32Array(v);
  }

  /* ═══════════════ the game ═══════════════ */
  const GAME = {
    id: 'nucleo', solo: true, title: tr('Núcleo', 'Core'), tag: tr('Acción', 'Action'),
    desc: tr('Una estructura de neón que se arma distinta cada vez. Apagá sus núcleos y escapá.', 'A neon structure built anew every time. Shut down its cores and get out.'),
    how: tr('Cada nivel tiene núcleos escondidos: destruilos todos (cada uno que cae deja su sala a oscuras) y llegá a la salida, que se abre al final. Cada nivel es más grande y con más enemigos. Compu: W A S D para moverte, mouse para mirar, clic para disparar, Shift o Espacio para el impulso, Esc para pausar, M para el sonido. Celular: palanca a la izquierda para moverte, arrastrá a la derecha para mirar, botones para disparar y para el impulso. Los rojos te persiguen, los naranjas disparan de lejos (esquivá sus esferas), los amarillos se parten en dos y los violetas atraviesan las paredes. Cuanto más hondo, más rara se pone la estructura. A veces aparece alguien que no ataca: acercate y apretá E para hablar. Desde el nivel 3, algún núcleo está dentro de un pliegue (un portal magenta en una pared): adentro el mundo se ve de costado, con plataformas; A D para moverte, W o Espacio para saltar (más alto si lo mantenés), Shift para el impulso (también en el aire) y el mouse para apuntar.',
      'Every level hides cores: destroy them all (each one that falls blacks out its room) and reach the exit, which opens at the end. Every level is bigger and has more enemies. Computer: W A S D to move, mouse to look, click to shoot, Shift or Space to dash, Esc to pause, M for sound. Phone: stick on the left to move, drag on the right to look, buttons to shoot and to dash. Red ones chase you, orange ones shoot from afar (dodge their orbs), yellow ones split in two and violet ones go through walls. The deeper you go, the stranger the structure gets. Now and then someone appears who doesn’t attack: go up to them and press E to talk. From level 3, a core may sit inside a fold (a magenta portal on a wall): inside, the world is seen from the side, with platforms; A D to move, W or Space to jump (higher if you hold it), Shift to dash (in the air too) and the mouse to aim.'),
    better: 'high', fmt: n => Number(n).toLocaleString(J.LOCALE),
    start: ctx => run(ctx),
  };
  J.GAMES.push(GAME);
  if (J.route && /^#nucleo/.test(location.hash)) J.route();   // the page was opened at #nucleo before this file loaded

  function run(ctx) {
    const stage = ctx.stage;
    stage.classList.add('nc-stage');
    const wrap = el('div', 'nc-wrap'), cv = el('canvas', 'nc-cv');
    wrap.append(cv); stage.append(wrap);
    const gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) { wrap.append(el('p', 'nc-msg', tr('Este navegador no tiene WebGL 2: Núcleo no puede correr acá.', 'This browser has no WebGL 2: Core can’t run here.'))); return () => stage.classList.remove('nc-stage'); }
    const hdr = !!gl.getExtension('EXT_color_buffer_float');
    const touch = /[?&]nctouch=1/.test(location.search) || (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);   // a laptop with a touch screen still has its mouse

    /* ── GL resources ── */
    function prog(vs, fs) {
      const p = gl.createProgram();
      [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([t, src]) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('Núcleo shader:', gl.getShaderInfoLog(s)); gl.attachShader(p, s); });
      gl.linkProgram(p);
      const L = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i), name = u.name.replace(/\[0\]$/, ''); L[name] = gl.getUniformLocation(p, u.name); }
      return { p, L };
    }
    const P = { level: prog(LEVEL_VS, LEVEL_FS), ent: prog(ENT_VS, ENT_FS), pts: prog(PTS_VS, PTS_FS), bright: prog(QUAD_VS, BRIGHT_FS), blur: prog(QUAD_VS, BLUR_FS), comp: prog(QUAD_VS, COMP_FS), echo: prog(QUAD_VS, ECHO_FS) };
    const emptyVao = gl.createVertexArray();
    function meshVao(data, layout) {   // layout: [[loc, size], …] (floats, interleaved)
      const vao = gl.createVertexArray(), buf = gl.createBuffer(), stride = layout.reduce((s, l) => s + l[1], 0) * 4;
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      let off = 0; layout.forEach(([loc, sz]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, stride, off); off += sz * 4; });
      gl.bindVertexArray(null);
      return { vao, buf, n: data.length / (stride / 4) };
    }
    const ENTL = [[0, 3], [1, 3], [2, 4]];
    const MESH = { octa: meshVao(new Float32Array(octa()), ENTL), cube: meshVao(new Float32Array(box(1, 1, 1).v), ENTL), ico: meshVao(new Float32Array(icosa()), ENTL),
      ring: meshVao(new Float32Array(ring(1, 0.12, 40)), ENTL), plus: meshVao(new Float32Array(plus()), ENTL), gun: meshVao(new Float32Array(gun()), ENTL),
      avatar: meshVao(new Float32Array(avatar()), ENTL) };
    let levelGL = null;
    // the particles (sparks, shots, orbs): one dynamic buffer
    const PMAX = 6000, pData = new Float32Array(PMAX * 8), pVao = gl.createVertexArray(), pBuf = gl.createBuffer();
    gl.bindVertexArray(pVao); gl.bindBuffer(gl.ARRAY_BUFFER, pBuf); gl.bufferData(gl.ARRAY_BUFFER, pData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    // render targets: the picture in HDR, and two small ones for the bloom
    const RT = { w: 0, h: 0 };
    function tex(w, h) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function fbo(t, depth) {
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (depth) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      return f;
    }
    function ensureRT(w, h) {
      if (RT.w === w && RT.h === h) return;
      if (RT.main) { [RT.main, RT.a, RT.b, ...RT.e].forEach(t => gl.deleteTexture(t)); [RT.fMain, RT.fa, RT.fb, ...RT.fe].forEach(f => gl.deleteFramebuffer(f)); gl.deleteRenderbuffer(RT.depth); }
      RT.w = w; RT.h = h; RT.qw = Math.max(2, w >> 2); RT.qh = Math.max(2, h >> 2);
      RT.depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, RT.depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      RT.main = tex(w, h); RT.fMain = fbo(RT.main, RT.depth);
      RT.a = tex(RT.qw, RT.qh); RT.fa = fbo(RT.a); RT.b = tex(RT.qw, RT.qh); RT.fb = fbo(RT.b);
      RT.e = [tex(w, h), tex(w, h)]; RT.fe = RT.e.map(t => fbo(t)); RT.ec = 0;   // the echo (deep levels): two pictures that take turns
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* ── sound: a tiny synth (effects) and a generated soundtrack that rises with the fight ── */
    const MUTE_KEY = 'pudrus_nucleo_mute';
    let muted = false; try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* private mode */ }
    let A = null, master = null, sfx = null, mus = null, noiseBuf = null;
    function audio() {
      if (A) return A;
      try {
        A = new (window.AudioContext || window.webkitAudioContext)();
        const comp = A.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(A.destination);
        master = A.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(comp);
        sfx = A.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
        mus = A.createGain(); mus.gain.value = 0.32; mus.connect(master);
        noiseBuf = A.createBuffer(1, A.sampleRate, A.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { A = null; }
      return A;
    }
    function osc(type, f0, f1, dur, vol, out = sfx, t = A.currentTime) {
      const o = A.createOscillator(), g = A.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol, type, f0, f1, out = sfx, t = A.currentTime, q = 0.8) {
      const s = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain();
      s.buffer = noiseBuf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    }
    const SND = {
      shot() { osc('square', 1400, 260, 0.08, 0.07); noise(0.05, 0.12, 'highpass', 3000, 3000); },
      hit() { osc('triangle', 520, 180, 0.07, 0.12); },
      boom(big) { noise(big ? 1.1 : 0.45, big ? 0.7 : 0.4, 'lowpass', big ? 1800 : 2400, 60); osc('sine', big ? 110 : 150, 30, big ? 0.9 : 0.35, big ? 0.6 : 0.35); },
      hurt() { osc('sawtooth', 220, 70, 0.25, 0.18); noise(0.15, 0.2, 'bandpass', 900, 300); },
      pickup() { osc('sine', 660, 660, 0.09, 0.15); setTimeout(() => A && osc('sine', 990, 990, 0.14, 0.15), 70); },
      dash() { noise(0.22, 0.25, 'bandpass', 400, 2400, sfx, A.currentTime, 2); },
      orb() { osc('sine', 300, 600, 0.18, 0.08); },
      fold() { osc('sine', 1400, 90, 0.7, 0.18); osc('triangle', 90, 900, 0.7, 0.1); noise(0.6, 0.18, 'bandpass', 300, 3000, sfx, A.currentTime, 2); },
      jump() { osc('square', 260, 520, 0.09, 0.05); },
      blink() { osc('sine', 1600, 180, 0.14, 0.09); noise(0.1, 0.08, 'bandpass', 2500, 600, sfx, A.currentTime, 3); },
      talk() { osc('triangle', 520 + Math.random() * 200, 520 + Math.random() * 200, 0.03, 0.025); },
      npc() { [0, 3, 7, 10, 14].forEach((s, i) => setTimeout(() => A && osc('sine', 330 * 2 ** (s / 12), 330 * 2 ** (s / 12), 0.5, 0.07), i * 120)); },
      core() { SND.boom(true); osc('sawtooth', 440, 40, 1.4, 0.2); },
      open() { [0, 4, 7, 12].forEach((s, i) => setTimeout(() => A && osc('triangle', 440 * 2 ** (s / 12), 440 * 2 ** (s / 12), 0.25, 0.14), i * 110)); },
      level() { [0, 7, 12, 19].forEach((s, i) => setTimeout(() => A && osc('square', 220 * 2 ** (s / 12), 220 * 2 ** (s / 12), 0.2, 0.08), i * 90)); },
    };
    const play = (k, ...a) => { if (A && !muted && A.state === 'running') try { SND[k](...a); } catch (e) { /* ignore */ } };
    // the soundtrack: 124 bpm; kick and bass always, hats and an arpeggio as the fight heats up
    const MU = { next: 0, step: 0, int: 0, roots: [0, -2, 3, -5] };
    function musicTick() {
      if (!A || A.state !== 'running' || muted) return;
      const t0 = A.currentTime, sp = 60 / 124 / 4;
      if (MU.next < t0) MU.next = t0 + 0.05;
      while (MU.next < t0 + 0.12) {
        const s = MU.step, st = s & 15, bar = s >> 4, t = MU.next, root = 55 * 2 ** (MU.roots[(bar >> 1) & 3] / 12), I = MU.int;
        if (st % 4 === 0) { osc('sine', 140, 42, 0.28, 0.55, mus, t); }
        if (st % 4 === 2) osc('sawtooth', root * (st === 14 ? 2 : 1), root * (st === 14 ? 2 : 1), 0.16, 0.16, mus, t);
        if (st % 2 === 1 && I > 0.15) osc('sawtooth', root * 2, root * 2, 0.09, 0.05 + 0.08 * I, mus, t);
        if (I > 0.3 && st % 2 === 0) noise(0.04, 0.05 * I, 'highpass', 7000, 7000, mus, t);
        if (I > 0.3 && st % 4 === 2) noise(0.14, 0.05 * I, 'highpass', 6000, 6000, mus, t);
        if (I > 0.6) { const ar = [0, 3, 7, 10, 12, 7, 3, 10][st & 7]; osc('square', root * 4 * 2 ** (ar / 12), root * 4 * 2 ** (ar / 12), 0.08, 0.035 * I, mus, t); }
        if (st === 0 && bar % 4 === 0) osc('triangle', root * 4, root * 4, 3.5, 0.03, mus, t);
        MU.next += sp; MU.step++;
      }
    }
    function setMute(m) { muted = m; try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* private mode */ } if (master) master.gain.value = m ? 0 : 0.7; muteBtn.textContent = m ? '🔇' : '🔊'; }

    /* ── HUD (DOM over the picture) ── */
    const hudEl = el('div', 'nc-hud');
    const cross = el('div', 'nc-cross'), hpBox = el('div', 'nc-hp'), hpFill = el('i'), hpNum = el('b'), dashBar = el('div', 'nc-dash'), dashFill = el('i');
    hpBox.append(el('span', null, tr('Energía', 'Energy')), el('div', 'bar'), hpNum); hpBox.querySelector('.bar').append(hpFill); dashBar.append(dashFill);
    const coresEl = el('div', 'nc-cores'), toastEl = el('div', 'nc-toast'), mapCv = el('canvas', 'nc-map'), bigEl = el('div', 'nc-big');
    const tools = el('div', 'nc-tools'), muteBtn = el('button', 'nc-tool', muted ? '🔇' : '🔊'), fsBtn = el('button', 'nc-tool', '⛶'), pauseBtn = el('button', 'nc-tool', 'Ⅱ');
    muteBtn.title = tr('Sonido (M)', 'Sound (M)'); fsBtn.title = tr('Pantalla completa', 'Full screen'); pauseBtn.title = tr('Pausa', 'Pause');
    tools.append(pauseBtn, muteBtn, fsBtn);
    mapCv.width = 150; mapCv.height = 150;
    const pauseEl = el('div', 'nc-pause'); pauseEl.hidden = true;
    const promptEl = el('button', 'nc-prompt'), talkEl = el('div', 'nc-talk'), talkName = el('b'), talkText = el('p'), talkHint = el('small');
    talkEl.append(talkName, talkText, talkHint); talkEl.hidden = true; promptEl.hidden = true;
    hudEl.append(cross, hpBox, dashBar, coresEl, toastEl, mapCv, bigEl, tools, promptEl, talkEl);
    wrap.append(hudEl, pauseEl);
    let toastT = 0;
    function toast(msg, s = 2.2) { toastEl.textContent = msg; toastEl.classList.add('on'); toastT = s; }
    function big(msg, sub) { bigEl.innerHTML = ''; bigEl.append(el('b', null, msg)); if (sub) bigEl.append(el('small', null, sub)); bigEl.classList.add('on'); }
    // touch controls
    const tc = touch ? el('div', 'nc-touch') : null;
    let stick = null, look = null; const fireBtn = el('button', 'nc-fire', '◉'), dashBtn = el('button', 'nc-dashbtn', '»'), jumpBtn = el('button', 'nc-jumpbtn', '▲'), stickEl = el('div', 'nc-stick'), knob = el('i');
    if (tc) { stickEl.append(knob); tc.append(stickEl, fireBtn, dashBtn, jumpBtn); wrap.append(tc); }
    jumpBtn.hidden = true;

    /* ── state ── */
    const seed = Math.floor(ctx.rnd() * 4294967296);
    const S = { level: 1, score: 0, kills: 0, hp: 100, t: 0, state: 'play', M: null, psy: 0, errat: 0, npc: null, canTalk: false, talk: null, mode: '3d', portal: null, fold: null, fx: 0, enemies: [], bolts: [], orbs: [], parts: [], flashes: [], pickups: [], cores: [], exit: null, seen: null, roomGlow: [], flow: null, flowCell: -1, endT: 0 };
    const pl = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, dashT: 0, dashCd: 0, hurtT: 0, shake: 0, fireCd: 0, recoil: 0, bob: 0, roll: 0, fov: 1.32 };
    const K = {}; let firing = false, mx = 0, my = 0;
    const EYE = 1.6;
    function isSolid(i, j) { const M = S.M; return i < 0 || j < 0 || i >= M.W || j >= M.H || M.grid[j * M.W + i] === 1; }
    const solidAt = (x, z) => isSolid(Math.floor(x / CS), Math.floor(z / CS));
    const ceilAt = (x, z) => { const M = S.M, i = Math.floor(x / CS), j = Math.floor(z / CS); return isSolid(i, j) ? 0 : M.ceil[j * M.W + i]; };
    function collide(o, r) {
      for (let it = 0; it < 2; it++) {
        const ci = Math.floor(o.x / CS), cj = Math.floor(o.z / CS);
        for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
          if (!isSolid(i, j)) continue;
          const x0 = i * CS, z0 = j * CS, nx = Math.max(x0, Math.min(o.x, x0 + CS)), nz = Math.max(z0, Math.min(o.z, z0 + CS));
          const dx = o.x - nx, dz = o.z - nz, d2 = dx * dx + dz * dz;
          if (d2 < r * r) { if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; o.x += dx * k; o.z += dz * k; } else { o.x += (o.x < x0 + CS / 2 ? -r : r); } }
        }
      }
    }
    function los(ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.hypot(dx, dz) / (CS * 0.25)); for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(ax + dx * t, az + dz * t)) return false; } return true; }

    const HP = { drone: 2, shoot: 4, split: 5, mini: 1, phase: 3 }, PTS = { drone: 100, shoot: 150, split: 200, mini: 50, phase: 180 };
    const COL = { drone: [1, 0.16, 0.24], shoot: [1, 0.55, 0.08], split: [1, 0.92, 0.2], mini: [1, 0.3, 0.3], phase: [0.8, 0.35, 1] };
    function spawnEnemy(type, x, z, awake) {
      const e = { type, x, z, y: type === 'shoot' ? 2.1 : 1.3, hp: HP[type] + Math.floor((S.level - 1) * (type === 'mini' ? 0 : 0.4)), r: type === 'mini' ? 0.3 : type === 'split' ? 0.55 : 0.45, awake: !!awake, cd: 1 + Math.random(), flash: 0, t: Math.random() * 10, vx: 0, vz: 0, seed: Math.random() * 100, calmT: 0 };
      S.enemies.push(e); return e;
    }
    function loadLevel() {
      const rnd = J.mulberry((seed + S.level * 7919) >>> 0), M = S.M = generate(S.level, rnd);
      if (levelGL) { gl.deleteBuffer(levelGL.buf); gl.deleteVertexArray(levelGL.vao); }
      levelGL = meshVao(levelMesh(M), [[0, 3], [1, 3], [2, 2], [3, 4]]);
      S.enemies = []; S.bolts = []; S.orbs = []; S.parts = []; S.flashes = [];
      M.enemies.forEach(e => spawnEnemy(e.type, e.x, e.z, false));
      S.pickups = M.pickups.map(p => ({ ...p, t: Math.random() * 6 }));
      S.cores = M.coreRooms.map(k => { const r = M.rooms[k]; return { x: (r.cx + 0.5) * CS, z: (r.cy + 0.5) * CS, y: Math.min(2.2, r.hgt - 1.3), room: k, hp: 22 + S.level * 6, max: 22 + S.level * 6, alive: true, flash: 0, t: 0, calls: 0 }; });
      const er = M.rooms[M.exitRoom]; S.exit = { x: (er.cx + 0.5) * CS, z: (er.cy + 0.5) * CS, open: false, t: 0, room: M.exitRoom };
      S.roomGlow = M.rooms.map(() => 1); S.roomTarget = M.rooms.map(() => 1);
      S.seen = new Uint8Array(M.W * M.H); S.flowCell = -1;
      // deeper = stranger: the psychedelia (level 4 → 10) and how erratic the enemies get (level 3 → 9)
      S.psy = Math.max(0, Math.min(1, (S.level - 3) / 7)); S.errat = Math.max(0, Math.min(1, (S.level - 2) / 7));
      S.npc = M.npc ? { ...M.npc, t: 0, gone: false, fade: 1 } : null; S.canTalk = false; S.talk = null;
      // the fold: its course is laid out now (its core is one of this level's cores), its mesh when you go in
      S.mode = '3d'; S.fold = null; S.portal = null;
      if (M.portal) {
        const Fd = genFold(S.level, J.mulberry((seed + S.level * 131) >>> 0), M.portal.pat);
        const c = S.cores.find(c => c.room === M.portal.room);
        if (c) { Object.assign(c, { fold: true, x: Fd.core.x, y: Fd.core.y, z: 0, hp: 12 + S.level * 3, max: 12 + S.level * 3 });   // a shorter fight: getting there is the challenge
         S.portal = { ...M.portal, F: Fd, done: false, t: 0 }; }
      }
      pl.x = (M.start.cx + 0.5) * CS; pl.z = (M.start.cy + 0.5) * CS; pl.vx = pl.vz = 0; pl.pitch = 0;
      // look along the first corridor out of the start room
      let best = 0, bl = -1; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, dx = Math.sin(a), dz = -Math.cos(a); let l = 0; while (l < 30 && !solidAt(pl.x + dx * l, pl.z + dz * l)) l += 0.5; if (l > bl) { bl = l; best = a; } } pl.yaw = best;
      revealRoom(0);
      paintCores(); paintHud();
    }
    function revealRoom(k) { const M = S.M, r = M.rooms[k]; for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (x >= 0 && y >= 0 && x < M.W && y < M.H) S.seen[y * M.W + x] = 1; }
    const coresLeft = () => S.cores.filter(c => c.alive).length;
    function paintCores() { const n = S.cores.length, left = coresLeft(); coresEl.innerHTML = ''; coresEl.append(el('span', null, left ? tr('Núcleos', 'Cores') : tr('Salida abierta', 'Exit open'))); S.cores.forEach(c => coresEl.append(el('i', (c.alive ? 'on' : '') + (c.fold ? ' fold' : '')))); coresEl.classList.toggle('open', !left); coresEl.title = `${n - left}/${n}`; }
    function paintHud() { ctx.hud(`${tr('Nivel', 'Level')}<b>${S.level}</b> ${tr('Puntos', 'Points')}<b>${S.score.toLocaleString(J.LOCALE)}</b>`); }

    /* ── effects ── */
    function burst(x, y, z, col, n, sp, life = 0.7, size = 0.12) {
      for (let i = 0; i < n && S.parts.length < PMAX - 200; i++) {
        const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), s = sp * (0.3 + Math.random() * 0.7);
        S.parts.push({ x, y, z, vx: Math.sin(b) * Math.cos(a) * s, vy: Math.cos(b) * s, vz: Math.sin(b) * Math.sin(a) * s, life, max: life, size: size * (0.5 + Math.random()), col, g: 4 });
      }
    }
    const flash = (x, y, z, col, r, life) => S.flashes.push({ x, y, z, col, r, life, max: life });

    /* ── input ── */
    const locked = () => document.pointerLockElement === cv;
    function lock() { if (!touch && cv.requestPointerLock && !locked()) { try { const p = cv.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { cv.requestPointerLock(); } catch (e) { /* ignore */ } }); } catch (e) { /* ignore */ } } }
    const onKey = e => {
      const down = e.type === 'keydown', k = e.code;
      if (k === 'Escape' && down && S.state === 'play') { pause(true); e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'].includes(k)) { K[k] = down; e.preventDefault(); }
      if (S.mode === 'fold') {   // in a fold: W / ↑ / Space jump, Shift dashes
        if (k === 'Space' || k === 'KeyW' || k === 'ArrowUp') { if (down && !e.repeat) f2.buf = 0.13; f2.held = down; }
        if (down && (k === 'ShiftLeft' || k === 'ShiftRight')) dash2();
      } else if (down && (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'Space')) dash();
      if (down && k === 'Escape' && S.state === 'talk') { endTalk(); e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (down && (k === 'KeyE' || k === 'KeyF' || (k === 'Space' && S.state === 'talk') || (k === 'Enter' && S.state === 'talk'))) { if (S.state === 'talk') advance(); else if (S.state === 'play' && S.canTalk) talk(); }
      if (down && k === 'KeyM') setMute(!muted);
      if (down && k === 'KeyP') pause(S.state === 'play');
    };
    addEventListener('keydown', onKey, true); addEventListener('keyup', onKey, true);
    const onMove = e => { if (!locked() || S.state !== 'play') return; mx += e.movementX; my += e.movementY; };
    document.addEventListener('mousemove', onMove);
    cv.addEventListener('mousedown', e => { if (touch) return; if (S.state === 'talk') { advance(); return; } if (S.state === 'pause') { pause(false); return; } if (!locked()) { lock(); return; } if (e.button === 0) firing = true; if (e.button === 2) { if (S.mode === 'fold') dash2(); else dash(); } });
    const onUp = e => { if (e.button === 0) firing = false; };
    document.addEventListener('mouseup', onUp);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    const onLock = () => { if (!locked() && S.state === 'play' && !touch) pause(true); };
    document.addEventListener('pointerlockchange', onLock);
    const onVis = () => { if (document.hidden && S.state === 'play') pause(true); };
    document.addEventListener('visibilitychange', onVis);
    pauseEl.addEventListener('click', () => { pause(false); });
    promptEl.addEventListener('click', e => { e.stopPropagation(); if (S.state === 'play' && S.canTalk) talk(); });
    talkEl.addEventListener('click', e => { e.stopPropagation(); advance(); });
    pauseBtn.addEventListener('click', e => { e.stopPropagation(); pause(S.state === 'play'); });
    muteBtn.addEventListener('click', e => { e.stopPropagation(); setMute(!muted); });
    fsBtn.addEventListener('click', e => { e.stopPropagation(); if (document.fullscreenElement) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().then(() => lock(), () => {}); });
    if (tc) {
      const pts = new Map();
      const rect = () => wrap.getBoundingClientRect();
      tc.addEventListener('pointerdown', e => {
        if (e.target === fireBtn || e.target === dashBtn || e.target === jumpBtn) return;
        const R = rect(), x = e.clientX - R.left, y = e.clientY - R.top;
        if (S.state === 'pause') { pause(false); return; }
        if (S.state === 'talk') { advance(); return; }
        if (x < R.width * 0.42 && !stick) { stick = { id: e.pointerId, x0: x, y0: y, dx: 0, dy: 0 }; stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px'; stickEl.classList.add('on'); }
        else if (!look) look = { id: e.pointerId, x, y };
        pts.set(e.pointerId, true); try { tc.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      });
      tc.addEventListener('pointermove', e => {
        const R = rect(), x = e.clientX - R.left, y = e.clientY - R.top;
        if (stick && e.pointerId === stick.id) { let dx = x - stick.x0, dy = y - stick.y0; const l = Math.hypot(dx, dy), m = 56; if (l > m) { dx *= m / l; dy *= m / l; } stick.dx = dx / m; stick.dy = dy / m; knob.style.transform = `translate(${dx}px, ${dy}px)`; }
        if (look && e.pointerId === look.id) { mx += (x - look.x) * 2.2; my += (y - look.y) * 2.2; look.x = x; look.y = y; }
      });
      const end = e => { if (stick && e.pointerId === stick.id) { stick = null; stickEl.classList.remove('on'); knob.style.transform = ''; } if (look && e.pointerId === look.id) look = null; pts.delete(e.pointerId); };
      tc.addEventListener('pointerup', end); tc.addEventListener('pointercancel', end);
      fireBtn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); firing = true; try { fireBtn.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
      ['pointerup', 'pointercancel'].forEach(t => fireBtn.addEventListener(t, () => { firing = false; }));
      // while the fire button is held, dragging it also aims
      let fl = null;
      fireBtn.addEventListener('pointermove', e => { if (!firing) { fl = null; return; } if (fl) { mx += (e.clientX - fl[0]) * 1.6; my += (e.clientY - fl[1]) * 1.6; } fl = [e.clientX, e.clientY]; });
      fireBtn.addEventListener('pointerup', () => { fl = null; });
      dashBtn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (S.mode === 'fold') dash2(); else dash(); });
      jumpBtn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); f2.buf = 0.13; f2.held = true; try { jumpBtn.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
      ['pointerup', 'pointercancel'].forEach(t => jumpBtn.addEventListener(t, () => { f2.held = false; }));
    }
    function pause(on) {
      if (S.state === 'dead' || S.state === 'over') return;
      if (on && S.state === 'play') {
        S.state = 'pause'; firing = false; Object.keys(K).forEach(k => { K[k] = false; });
        pauseEl.innerHTML = ''; pauseEl.append(el('b', null, tr('Pausa', 'Paused')), el('small', null, touch ? tr('Tocá para seguir', 'Tap to go on') : tr('Clic para seguir · Esc otra vez para salir', 'Click to go on · Esc again to leave')));
        pauseEl.hidden = false; if (A) A.suspend();
        if (locked()) document.exitPointerLock();
      } else if (!on && S.state === 'pause') {
        S.state = 'play'; pauseEl.hidden = true; if (A) A.resume(); lock(); last = performance.now();
      }
    }

    /* ── actions ── */
    function dash() {
      if (S.state !== 'play' || pl.dashCd > 0) return;
      let ix = 0, iz = 0; const f = [Math.sin(pl.yaw), -Math.cos(pl.yaw)], r = [Math.cos(pl.yaw), Math.sin(pl.yaw)];
      const fw = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - (stick ? stick.dy : 0), st = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) + (stick ? stick.dx : 0);
      ix = f[0] * fw + r[0] * st; iz = f[1] * fw + r[1] * st;
      if (Math.hypot(ix, iz) < 0.2) { ix = f[0]; iz = f[1]; }
      const l = Math.hypot(ix, iz); pl.vx = ix / l * 22; pl.vz = iz / l * 22;
      pl.dashT = 0.16; pl.dashCd = 0.9; play('dash');
      burst(pl.x, 0.3, pl.z, [0.3, 0.8, 1.6], 14, 2.5, 0.4, 0.08);
    }
    function fire() {
      const B = basis(pl.yaw, pl.pitch, 0), e = [pl.x, EYE, pl.z];
      const start = [e[0] + B.f[0] * 0.55 + B.r[0] * 0.16 - B.u[0] * 0.12, e[1] + B.f[1] * 0.55 + B.r[1] * 0.16 - B.u[1] * 0.12, e[2] + B.f[2] * 0.55 + B.r[2] * 0.16 - B.u[2] * 0.12];
      // aim where the crosshair points (the first wall along the view), so the shots converge on it
      let d = 0.5; while (d < 40) { const x = e[0] + B.f[0] * d, y = e[1] + B.f[1] * d, z = e[2] + B.f[2] * d; if (solidAt(x, z) || y < 0 || y > ceilAt(x, z)) break; d += 0.25; }
      const tgt = [e[0] + B.f[0] * d, e[1] + B.f[1] * d, e[2] + B.f[2] * d], dir = norm(sub(tgt, start));
      const spr = 0.012; dir[0] += (Math.random() - 0.5) * spr; dir[1] += (Math.random() - 0.5) * spr; dir[2] += (Math.random() - 0.5) * spr;
      S.bolts.push({ x: start[0], y: start[1], z: start[2], vx: dir[0] * 48, vy: dir[1] * 48, vz: dir[2] * 48, life: 1.2 });
      pl.fireCd = 0.125; pl.recoil = 1; pl.shake = Math.min(1, pl.shake + 0.08); pl.pitch += 0.004;
      flash(start[0], start[1], start[2], [0.4, 1.4, 2.4], 6, 0.06);
      play('shot');
    }
    function hurt(d, fx, fz) {
      if (S.state !== 'play') return;
      S.hp = Math.max(0, S.hp - d); pl.hurtT = 0.5; pl.shake = Math.min(1, pl.shake + 0.45); play('hurt');
      if (S.mode === 'fold') { if (fx !== undefined) { f2.vx += Math.sign(f2.x - fx || 1) * 7; f2.vy = Math.max(f2.vy, 5); } }
      else if (fx !== undefined) { const dx = pl.x - fx, dz = pl.z - fz, l = Math.hypot(dx, dz) || 1; pl.vx += dx / l * 6; pl.vz += dz / l * 6; }
      if (S.hp <= 0) die();
    }
    function die() {
      S.state = 'dead'; S.endT = 1.6; firing = false; big(tr('Sin energía', 'Out of energy'), tr(`Nivel ${S.level} · ${S.score.toLocaleString(J.LOCALE)} puntos`, `Level ${S.level} · ${S.score.toLocaleString(J.LOCALE)} points`));
      play('boom', true); burst(pl.x, 1.2, pl.z, [0.4, 1.2, 2], 60, 6, 1.2);
      if (locked()) document.exitPointerLock();
    }
    function killEnemy(e) {
      e.dead = true; S.kills++; S.score += PTS[e.type]; paintHud();
      const c = COL[e.type]; burst(e.x, e.y, e.z, [c[0] * 2.5, c[1] * 2.5, c[2] * 2.5], e.type === 'mini' ? 18 : 36, 6, 0.8); flash(e.x, e.y, e.z, [c[0] * 4, c[1] * 4, c[2] * 4], 9, 0.35);
      play('boom', false); pl.shake = Math.min(1, pl.shake + 0.12);
      if (e.type === 'split') for (let k = 0; k < 2; k++) { const m = spawnEnemy('mini', e.x + (k ? 0.5 : -0.5), e.z, true); m.vx = (k ? 1 : -1) * 5; m.y = e.y; m.vy = 0; }
      if (S.mode === '3d' && Math.random() < 0.12) S.pickups.push({ x: e.x, z: e.z, t: 0 });
    }
    function hitCore(c) {
      c.hp--; c.flash = 1; play('hit');
      const frac = c.hp / c.max;
      if (c.hp > 0 && frac < 0.75 - c.calls * 0.25) {   // it calls defenders as it weakens
        c.calls++; for (let k = 0; k < 1 + Math.min(2, Math.floor(S.level / 2)); k++) {
          const a = Math.random() * Math.PI * 2;
          if (c.fold) { const e = spawnEnemy('drone', c.x - 2 - k * 1.5, 0, true); e.y = c.y + 1 + k; e.z = 0; e.vy = 0; continue; }
          const e = spawnEnemy(S.level >= 3 && k === 0 ? 'split' : 'drone', c.x + Math.cos(a) * 1.6, c.z + Math.sin(a) * 1.6, true); collide(e, e.r);
        }
        toast(tr('El núcleo llama defensores', 'The core calls defenders'), 1.6);
      }
      if (c.hp <= 0) {
        c.alive = false; S.score += 500; paintHud(); play('core'); pl.shake = 1;
        burst(c.x, c.y, c.z, [2.6, 2.4, 1.6], 160, 10, 1.6, 0.16); flash(c.x, c.y, c.z, [8, 7, 5], 22, 1.2);
        S.roomTarget[c.room] = 0.1;   // «apagón»: its room goes dark
        if (c.fold && S.fold) { S.fold.outT = 1.8; }   // and the fold comes undone
        const left = coresLeft(); paintCores();
        if (!left) { S.exit.open = true; play('open'); toast(tr('Todos los núcleos apagados: ¡la salida se abrió!', 'All cores down: the exit is open!'), 3.5); }
        else toast(tr(`Núcleo apagado · quedan ${left}`, `Core down · ${left} left`));
      }
    }
    function nextLevel() {
      S.state = 'trans'; S.endT = 1.6; S.score += 1000 * S.level; paintHud(); play('level');
      big(tr(`Nivel ${S.level + 1}`, `Level ${S.level + 1}`), tr('La estructura se rearma…', 'The structure rebuilds itself…'));
    }

    /* ── folds: a side-scrolling zone (same world, one dimension less) ── */
    const f2 = { x: 0, y: 0, vx: 0, vy: 0, ground: false, coyote: 0, buf: 0, held: false, face: 1, ax: 4, ay: 0.5, dashT: 0, airDash: true, sx: 0, sy: 0, run: 0 };
    let foldGL = null;
    function enterFold() {
      const Pt = S.portal; if (!Pt || Pt.done) return;
      const slot = Math.min(14, Pt.room);
      if (foldGL) { gl.deleteBuffer(foldGL.buf); gl.deleteVertexArray(foldGL.vao); }
      foldGL = meshVao(foldMesh(Pt.F, slot), [[0, 3], [1, 3], [2, 2], [3, 4]]);
      S.fold = { F: Pt.F, saved: { enemies: S.enemies, bolts: S.bolts, orbs: S.orbs, parts: S.parts, flashes: S.flashes }, tr: 0, outT: 0, cam: [0, 1.5] };
      S.enemies = []; S.bolts = []; S.orbs = []; S.parts = []; S.flashes = [];
      Pt.F.en.forEach(q => { const e = spawnEnemy(q.type, q.x, 0, false); e.y = e.hy = q.y; e.hx = q.x; e.z = 0; e.vy = 0; });
      Object.assign(f2, { x: 0, y: 0, vx: 0, vy: 0, ground: true, coyote: 0, buf: 0, held: false, face: 1, ax: 4, ay: 0.5, dashT: 0, airDash: true, sx: 0, sy: 0 });
      S.fold.cam = [f2.x + 2, f2.y + 1.5];
      S.mode = 'fold'; firing = false; S.fx = 1; play('fold');
      S.canTalk = false; promptEl.hidden = true; jumpBtn.hidden = !touch; mapCv.style.visibility = 'hidden';
      toast(touch ? tr('Un pliegue: la estructura perdió una dimensión', 'A fold: the structure lost a dimension')
        : tr('Un pliegue · A D moverse · W o Espacio saltar · Shift impulso · mouse apuntar', 'A fold · A D move · W or Space jump · Shift dash · mouse aims'), 4);
    }
    function exitFold() {
      const Pt = S.portal, Fo = S.fold; if (!Fo) return;
      S.enemies = Fo.saved.enemies; S.bolts = Fo.saved.bolts; S.orbs = Fo.saved.orbs; S.parts = Fo.saved.parts; S.flashes = Fo.saved.flashes;
      S.mode = '3d'; S.fold = null; Pt.done = true; S.fx = 1; play('fold');
      pl.x = Pt.fx + Pt.nx * 0.6; pl.z = Pt.fz + Pt.nz * 0.6; pl.vx = pl.vz = 0; pl.yaw = Math.atan2(Pt.nx, -Pt.nz); pl.pitch = 0;
      jumpBtn.hidden = true; mapCv.style.visibility = ''; cross.style.left = cross.style.top = '';
      toast(coresLeft() ? tr('El pliegue se deshizo', 'The fold came undone') : tr('Todos los núcleos apagados: ¡la salida se abrió!', 'All cores down: the exit is open!'), 2.5);
    }
    function dash2() {
      if (S.state !== 'play' || S.mode !== 'fold' || pl.dashCd > 0 || (!f2.ground && !f2.airDash)) return;
      if (!f2.ground) f2.airDash = false;
      f2.dashT = 0.16; f2.vx = f2.face * 17; f2.vy = 0; pl.dashCd = 0.7; play('dash');
      burst(f2.x, f2.y + 0.8, 0, [0.3, 0.8, 1.6], 14, 2.5, 0.4, 0.08);
    }
    const inPlat = (x, y) => { const P = S.fold.F.P; for (let i = 0; i < P.length; i++) { const q = P[i]; if (x > q.x0 && x < q.x1 && y > q.y0 && y < q.y1) return true; } return false; };
    function fire2() {
      const ox = f2.x + f2.face * 0.35, oy = f2.y + 1.08;
      let dx = f2.ax, dy = f2.ay;
      if (touch) {   // on a phone it aims by itself at the nearest thing in front
        let best = null, bd = 16;
        for (const e of S.enemies) { if (e.dead || (e.type === 'phase' && Math.abs(e.z) > 0.8)) continue; const ex = e.x - ox, ey = e.y - oy, d = Math.hypot(ex, ey); if (d < bd && ex * f2.face > -0.5) { bd = d; best = [ex, ey]; } }
        S.cores.forEach(c => { if (c.fold && c.alive) { const ex = c.x - ox, ey = c.y - oy, d = Math.hypot(ex, ey); if (d < bd && ex * f2.face > 0) { bd = d; best = [ex, ey]; } } });
        [dx, dy] = best || [f2.face, 0];
      }
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; dy += (Math.random() - 0.5) * 0.02;
      S.bolts.push({ x: ox, y: oy, z: 0, vx: dx * 40, vy: dy * 40, vz: 0, life: 1 });
      pl.fireCd = 0.125; pl.shake = Math.min(1, pl.shake + 0.06);
      flash(ox, oy, 0.6, [0.4, 1.4, 2.4], 5, 0.06); play('shot');
    }
    function updateFold(dt) {
      const Fo = S.fold, Fd = Fo.F;
      Fo.tr = Math.min(1, Fo.tr + dt / 1.0);
      if (Fo.outT > 0) { Fo.outT -= dt; if (Fo.outT <= 0) { exitFold(); return; } }
      // aim: the mouse moves a sight around you
      if (!touch) { f2.ax += mx * 0.012; f2.ay -= my * 0.012; const l = Math.hypot(f2.ax, f2.ay); if (l > 5) { f2.ax *= 5 / l; f2.ay *= 5 / l; } }
      mx = my = 0;
      const ready = Fo.tr >= 1;
      let mv = ready ? (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) + (stick ? stick.dx : 0) : 0;
      mv = Math.max(-1, Math.min(1, mv));
      if (Math.abs(mv) > 0.2) f2.face = Math.sign(mv); else if (!touch && Math.abs(f2.ax) > 0.3) f2.face = Math.sign(f2.ax);
      pl.dashCd = Math.max(0, pl.dashCd - dt);
      if (f2.dashT > 0) { f2.dashT -= dt; }
      else {
        const acc = f2.ground ? 70 : 38; f2.vx += (mv * 8 - f2.vx) * Math.min(1, acc * dt / 8);
        f2.vy -= 30 * dt; if (!f2.held && f2.vy > 3) f2.vy -= 45 * dt;   // let go early: a shorter jump
        f2.vy = Math.max(f2.vy, -24);
      }
      f2.coyote = f2.ground ? 0.1 : Math.max(0, f2.coyote - dt); f2.buf = Math.max(0, f2.buf - dt);
      if (ready && f2.buf > 0 && (f2.ground || f2.coyote > 0)) { f2.vy = 11.5; f2.buf = 0; f2.coyote = 0; f2.ground = false; play('jump'); burst(f2.x, f2.y + 0.05, 0, [0.4, 1.2, 2], 8, 2, 0.3, 0.06); }
      // move and collide (the body: 0.6 wide, 1.7 tall), one axis at a time
      const P = Fd.P, hw = 0.3, hh = 1.7;
      f2.x += f2.vx * dt;
      for (const q of P) if (f2.x + hw > q.x0 && f2.x - hw < q.x1 && f2.y + hh > q.y0 && f2.y < q.y1) { if (f2.vx > 0) f2.x = q.x0 - hw; else if (f2.vx < 0) f2.x = q.x1 + hw; f2.vx = 0; }
      f2.y += f2.vy * dt; f2.ground = false;
      for (const q of P) if (f2.x + hw > q.x0 && f2.x - hw < q.x1 && f2.y + hh > q.y0 && f2.y < q.y1) {
        if (f2.vy <= 0 && f2.y - f2.vy * dt >= q.y1 - 0.05) { f2.y = q.y1; f2.ground = true; f2.airDash = true; f2.sx = Math.max(q.x0 + 0.6, Math.min(q.x1 - 0.6, f2.x)); f2.sy = q.y1; }
        else if (f2.vy > 0) f2.y = q.y0 - hh;
        f2.vy = 0;
      }
      f2.x = Math.max(-11, Math.min(Fd.end - 0.5, f2.x));
      if (f2.y < Fd.minY - 10) {   // into the void: it hurts, and you are back on the last platform
        hurt(12); f2.x = f2.sx; f2.y = f2.sy + 0.2; f2.vx = f2.vy = 0; S.fx = 0.6;
      }
      f2.run += Math.abs(f2.vx) * dt;
      pl.fireCd -= dt; if (firing && ready && pl.fireCd <= 0) fire2();
      pl.hurtT = Math.max(0, pl.hurtT - dt); pl.recoil = Math.max(0, pl.recoil - dt * 8);
      // the camera follows, a little ahead
      Fo.cam[0] += (f2.x + f2.face * 2.2 - Fo.cam[0]) * Math.min(1, dt * 4); Fo.cam[1] += (f2.y + 1.6 - Fo.cam[1]) * Math.min(1, dt * 3);
      // enemies, in the plane
      const er = S.errat; let near = 0;
      for (const e of S.enemies) {
        if (e.dead) continue;
        e.t += dt; e.flash = Math.max(0, e.flash - dt * 6); e.cd -= dt;
        const tx = f2.x, ty = f2.y + 1, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), ph = e.type === 'phase';
        if (!e.awake) { if (Math.abs(dx) < 15 && Math.abs(dy) < 10) e.awake = true; else continue; }
        near++;
        if (ph) e.z = Math.sin(e.t * 1.3 + e.seed) * 2.4;   // in and out of the plane
        const inPlane = !ph || Math.abs(e.z) < 0.8;
        if (e.type === 'shoot') {
          e.x = e.hx + Math.sin(e.t * 0.8 + e.seed) * 1.2 * (0.4 + er); e.y = e.hy + Math.sin(e.t * 2.1) * 0.3;
          if (e.cd <= 0 && d < 15) {
            e.cd = Math.max(0.9, 1.8 - S.level * 0.08);
            const a0 = Math.atan2(dy, dx); (er > 0.35 ? [-0.25, 0, 0.25] : [0]).forEach(a => S.orbs.push({ x: e.x, y: e.y, z: 0, vx: Math.cos(a0 + a) * 8, vy: Math.sin(a0 + a) * 8, vz: 0, life: 4, wob: 0 }));
            play('orb');
          }
        } else {
          let ang = Math.atan2(dy, dx);
          if (er > 0 || ph) ang += Math.max(er, ph ? 0.6 : 0) * (Math.sin(e.t * 1.7 + e.seed) * 0.9 + Math.sin(e.t * 4.3 + e.seed * 2) * 0.45);
          const sp = (e.type === 'mini' ? 6 : e.type === 'drone' ? 3.8 + S.level * 0.15 : 3.1) * (1 + er * 0.8 * Math.max(0, Math.sin(e.t * 2.1 + e.seed)));
          e.vx += (Math.cos(ang) * sp - e.vx) * Math.min(1, dt * 4); e.vy = (e.vy || 0) + (Math.sin(ang) * sp - (e.vy || 0)) * Math.min(1, dt * 4);
          for (const o of S.enemies) { if (o === e || o.dead) continue; const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy), m = e.r + o.r + 0.2; if (od < m && od > 1e-3) { e.vx += ox / od * (m - od) * 60 * dt; e.vy += oy / od * (m - od) * 60 * dt; } }
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (er > 0.15 && Math.random() < dt * 0.3 * er) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 2; const c = COL[e.type]; burst(e.x, e.y, e.z, [c[0] * 2, c[1] * 2, c[2] * 2], 12, 3, 0.4, 0.08); e.x += Math.cos(a) * r; e.y += Math.sin(a) * r; play('blink'); }
          if (inPlane && d < e.r + 0.75 && e.cd <= 0) { e.cd = 0.75; hurt(e.type === 'mini' ? 6 : 11, e.x); }
        }
      }
      S.enemies = S.enemies.filter(e => !e.dead);
      MU.int += (Math.min(1, near / 3) - MU.int) * Math.min(1, dt * 0.8);
      // shots and orbs in the plane
      for (const b of S.bolts) {
        for (let s = 0; s < 3 && b.life > 0; s++) {
          b.x += b.vx * dt / 3; b.y += b.vy * dt / 3;
          if (inPlat(b.x, b.y)) { b.life = 0; burst(b.x - b.vx * 0.004, b.y - b.vy * 0.004, 0, [0.5, 1.6, 2.6], 8, 3, 0.35, 0.07); flash(b.x, b.y, 0.5, [0.4, 1.2, 2], 4, 0.12); break; }
          for (const e of S.enemies) { if (e.dead || (e.type === 'phase' && Math.abs(e.z) > 0.8)) continue; if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (e.r + 0.2) ** 2) { b.life = 0; e.awake = true; e.flash = 1; e.hp--; play('hit'); burst(b.x, b.y, 0, [2, 2, 2], 6, 3, 0.25, 0.06); if (e.hp <= 0) killEnemy(e); hitMark(); break; } }
          if (b.life <= 0) break;
          for (const c of S.cores) { if (!c.fold || !c.alive) continue; if ((b.x - c.x) ** 2 + (b.y - c.y) ** 2 < 1.15 ** 2) { b.life = 0; hitCore(c); burst(b.x, b.y, 0, [2.4, 2.2, 1.4], 8, 3, 0.3, 0.07); hitMark(); break; } }
        }
        b.life -= dt;
      }
      S.bolts = S.bolts.filter(b => b.life > 0);
      for (const o of S.orbs) {
        o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
        if (inPlat(o.x, o.y)) { o.life = 0; burst(o.x, o.y, 0, [2.4, 0.9, 0.2], 10, 2.5, 0.4, 0.08); continue; }
        if (o.x > f2.x - 0.4 && o.x < f2.x + 0.4 && o.y > f2.y && o.y < f2.y + 1.7) { o.life = 0; hurt(9 + S.level, o.x); burst(o.x, o.y, 0, [2.4, 0.9, 0.2], 14, 3, 0.4, 0.08); }
      }
      S.orbs = S.orbs.filter(o => o.life > 0);
    }

    /* ── the strange ones: talk, the words come letter by letter, a gift at the end, and they dissolve ── */
    const L2 = x => tr(x[0], x[1]);
    function talk() {
      const n = S.npc; if (!n || n.gone) return;
      S.state = 'talk'; firing = false; Object.keys(K).forEach(k => { K[k] = false; });
      S.talk = { i: 0, shown: 0, lines: [...n.lines.map(L2), L2([n.gift[1], n.gift[2]])] };
      talkName.textContent = L2(n.name); talkHint.textContent = touch ? tr('Tocá para seguir', 'Tap to go on') : tr('E o clic para seguir', 'E or click to go on');
      talkEl.hidden = false; promptEl.hidden = true; play('npc');
    }
    function advance() {
      const T = S.talk; if (!T) return;
      const line = T.lines[T.i];
      if (T.shown < line.length) { T.shown = line.length; return; }
      T.i++; T.shown = 0;
      if (T.i >= T.lines.length) endTalk();
    }
    function endTalk() {
      const n = S.npc; if (!S.talk || !n) return;
      S.talk = null; talkEl.hidden = true; S.state = 'play'; last = performance.now();
      if (!n.gone) {
        n.gone = true; const g = n.gift[0];
        if (g === 'heal') S.hp = Math.min(100, S.hp + 30);
        else if (g === 'map') S.cores.forEach(c => { if (c.alive) revealRoom(c.room); });   // (a core in a fold: its portal's room)
        else if (g === 'calm') S.enemies.forEach(e => { e.awake = false; e.calmT = 9; });
        else if (g === 'score') { S.score += 750; paintHud(); }
        toast(L2([n.gift[3], n.gift[4]]), 3); play('pickup');
        const c = hsv(n.hue, 0.6, 1); burst(n.x, 1.7, n.z, [c[0] * 2.5, c[1] * 2.5, c[2] * 2.5], 90, 4, 1.4, 0.1); flash(n.x, 1.7, n.z, [c[0] * 4, c[1] * 4, c[2] * 4], 12, 1);
      }
    }
    function blink(e) {   // a jump to a few steps away (the violet ones may land inside a wall: they don't care)
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 3.5, nx = e.x + Math.cos(a) * d, nz = e.z + Math.sin(a) * d;
        if (e.type !== 'phase' && solidAt(nx, nz)) continue;
        const c = COL[e.type]; burst(e.x, e.y, e.z, [c[0] * 2, c[1] * 2, c[2] * 2], 14, 3, 0.4, 0.08);
        e.x = nx; e.z = nz; burst(e.x, e.y, e.z, [c[0] * 2, c[1] * 2, c[2] * 2], 14, 3, 0.4, 0.08); play('blink');
        return;
      }
    }

    /* ── the flow field: every floor cell knows its walking distance to you (the enemies follow it) ── */
    function updateFlow() {
      const M = S.M, c = Math.floor(pl.z / CS) * M.W + Math.floor(pl.x / CS);
      if (c === S.flowCell) return;
      S.flowCell = c; S.flow = bfs(M.grid, M.W, M.H, c % M.W, (c / M.W) | 0);
    }
    function steer(e) {   // towards the neighbouring cell closest to you
      const M = S.M, i = Math.floor(e.x / CS), j = Math.floor(e.z / CS), F = S.flow; let best = F[j * M.W + i], bx = 0, bz = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj;
        if (isSolid(ni, nj) || (di && dj && (isSolid(i + di, j) || isSolid(i, j + dj)))) continue;
        const v = F[nj * M.W + ni] + (di && dj ? 0.4 : 0); if (v < best) { best = v; bx = (ni + 0.5) * CS - e.x; bz = (nj + 0.5) * CS - e.z; }
      }
      const l = Math.hypot(bx, bz); return l > 1e-4 ? [bx / l, bz / l] : [0, 0];
    }

    /* ── one step of the world ── */
    function update(dt) {
      S.t += dt;
      const M = S.M;
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
      for (let k = 0; k < S.roomGlow.length; k++) S.roomGlow[k] += (S.roomTarget[k] - S.roomGlow[k]) * Math.min(1, dt * 1.5);
      if (S.state === 'talk' && S.talk) {
        const T = S.talk, line = T.lines[T.i] || '', before = Math.floor(T.shown);
        T.shown = Math.min(line.length, T.shown + dt * 38);
        if (Math.floor(T.shown) > before && Math.floor(T.shown) % 3 === 0) play('talk');
        talkText.textContent = line.slice(0, Math.floor(T.shown));
      }
      if (S.npc && !S.npc.gone) S.npc.t += dt; else if (S.npc) S.npc.fade = Math.max(0, S.npc.fade - dt * 1.5);
      if (S.state === 'dead' || S.state === 'trans') {
        S.endT -= dt;
        if (S.state === 'trans' && S.endT <= 0) { S.level++; S.hp = Math.min(100, S.hp + 30); loadLevel(); S.state = 'play'; bigEl.classList.remove('on'); toast(tr(`Nivel ${S.level}: ${S.cores.length} núcleos`, `Level ${S.level}: ${S.cores.length} cores`)); }
        if (S.state === 'dead' && S.endT <= 0) { S.state = 'over'; ctx.done({ score: S.score, text: tr(`Llegaste al nivel ${S.level}`, `You reached level ${S.level}`), detail: tr(`${S.kills} enemigos · ${S.level - 1} niveles completos`, `${S.kills} enemies · ${S.level - 1} levels cleared`), better: 'high' }); }
      }
      S.fx = Math.max(0, S.fx - dt * 2.2);
      if (S.portal) S.portal.t += dt;
      if (S.state === 'play' && S.mode === 'fold') updateFold(dt);
      if (S.state === 'play' && S.mode === '3d') {
        // looking
        const sens = touch ? 0.0042 : 0.0022;
        pl.yaw += mx * sens; pl.pitch = Math.max(-1.45, Math.min(1.45, pl.pitch - my * sens)); mx = my = 0;
        // moving: acceleration, friction, the dash
        const f = [Math.sin(pl.yaw), -Math.cos(pl.yaw)], r = [Math.cos(pl.yaw), Math.sin(pl.yaw)];
        let fw = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), st = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
        if (stick) { fw -= stick.dy; st += stick.dx; }
        let ix = f[0] * fw + r[0] * st, iz = f[1] * fw + r[1] * st; const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
        pl.dashT = Math.max(0, pl.dashT - dt); pl.dashCd = Math.max(0, pl.dashCd - dt);
        if (pl.dashT <= 0) {
          const MAXV = 7.5, acc = 70;
          pl.vx += ix * acc * dt; pl.vz += iz * acc * dt;
          const fr = Math.exp(-dt * (il > 0.05 ? 7 : 12)); pl.vx *= fr; pl.vz *= fr;
          const sp = Math.hypot(pl.vx, pl.vz); if (sp > MAXV && sp > 0) { const k = Math.max(MAXV / sp, Math.exp(-dt * 8)); pl.vx *= k; pl.vz *= k; }
        }
        pl.x += pl.vx * dt; pl.z += pl.vz * dt;
        collide(pl, 0.38);
        S.cores.forEach(c => { if (!c.alive || c.fold) return; const dx = pl.x - c.x, dz = pl.z - c.z, d = Math.hypot(dx, dz); if (d < 1.3 && d > 0) { pl.x = c.x + dx / d * 1.3; pl.z = c.z + dz / d * 1.3; } });
        const sp = Math.hypot(pl.vx, pl.vz);
        pl.bob += dt * sp * 1.6;
        pl.roll += ((-st * 0.035) - pl.roll) * Math.min(1, dt * 8);
        pl.fov += ((pl.dashT > 0 ? 1.5 : 1.32) - pl.fov) * Math.min(1, dt * 10);
        // shooting
        pl.fireCd -= dt; if (firing && pl.fireCd <= 0) fire();
        pl.recoil = Math.max(0, pl.recoil - dt * 8); pl.hurtT = Math.max(0, pl.hurtT - dt);
        // what you have seen (for the map): the rooms you walk into, and a few cells around you
        const ci = Math.floor(pl.x / CS), cj = Math.floor(pl.z / CS), here = M.rid[cj * M.W + ci];
        if (here >= 0) revealRoom(here);
        for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) if (i >= 0 && j >= 0 && i < M.W && j < M.H) S.seen[j * M.W + i] = 1;
        updateFlow();
        // pickups and the exit
        S.pickups = S.pickups.filter(p => { p.t += dt; if (Math.hypot(p.x - pl.x, p.z - pl.z) < 1.1 && S.hp < 100) { S.hp = Math.min(100, S.hp + 25); play('pickup'); toast(tr('+25 de energía', '+25 energy'), 1.2); burst(p.x, 1, p.z, [0.6, 2.4, 0.5], 24, 3, 0.6); return false; } return true; });
        if (S.exit.open && Math.hypot(S.exit.x - pl.x, S.exit.z - pl.z) < 1.4) nextLevel();
        if (S.portal && !S.portal.done && Math.hypot(S.portal.fx - pl.x, S.portal.fz - pl.z) < 1.0) { enterFold(); return; }
        // a strange one near you, in front of you: you can talk
        const n = S.npc; let can = false;
        if (n && !n.gone) { const dx = n.x - pl.x, dz = n.z - pl.z, d = Math.hypot(dx, dz); can = d < 2.9 && (dx * Math.sin(pl.yaw) - dz * Math.cos(pl.yaw)) / (d || 1) > 0.5; }
        if (can !== S.canTalk) { S.canTalk = can; promptEl.hidden = !can; if (can) promptEl.textContent = (touch ? '💬 ' : 'E · ') + tr('Hablar con ', 'Talk to ') + L2(n.name).toLowerCase(); }
      }
      pl.shake = Math.max(0, pl.shake - dt * 1.8);
      // enemies
      let near = 0;
      if (S.state === 'play' && S.mode === '3d') for (const e of S.enemies) {
        if (e.dead) continue;
        e.t += dt; e.flash = Math.max(0, e.flash - dt * 6); e.cd -= dt;
        const dx = pl.x - e.x, dz = pl.z - e.z, d = Math.hypot(dx, dz), ph = e.type === 'phase';
        if (e.calmT > 0) { e.calmT -= dt; continue; }   // asleep (a strange one sang to it)
        if (!e.awake) { if (d < (ph ? 12 : 15) && (ph || los(e.x, e.z, pl.x, pl.z))) e.awake = true; else continue; }
        if (d < 18) near++;
        const see = d < 22 && los(e.x, e.z, pl.x, pl.z), er = S.errat;
        let dir;
        if (ph || (see && d < 30)) dir = [dx / (d || 1), dz / (d || 1)]; else dir = steer(e);   // the violet ones go straight at you, walls or not
        let speed = e.type === 'mini' ? 6.2 : e.type === 'drone' ? 4.4 + S.level * 0.15 : e.type === 'split' ? 3.4 : ph ? 3.2 : 3.6;
        // deeper = more erratic: they swerve, surge and jump around
        if (er > 0 || ph) {
            const k = Math.max(er, ph ? 0.6 : 0), ang = k * (Math.sin(e.t * 1.7 + e.seed) * 0.9 + Math.sin(e.t * 4.3 + e.seed * 2) * 0.45), c = Math.cos(ang), s = Math.sin(ang);
            dir = [dir[0] * c - dir[1] * s, dir[0] * s + dir[1] * c];
            speed *= 1 + k * 0.9 * Math.max(0, Math.sin(e.t * 2.1 + e.seed));
            if (er > 0.15 && e.type !== 'shoot' && Math.random() < dt * 0.3 * er) blink(e);
        }
        if (e.type === 'shoot' && see) {   // keeps its distance and strafes
          if (d < 7) dir = [-dir[0], -dir[1]]; else if (d < 11) dir = [-dir[1] * Math.sin(e.t * 0.7), dir[0] * Math.sin(e.t * 0.7)];
          if (e.cd <= 0) {
            e.cd = Math.max(0.8, 1.7 - S.level * 0.08);
            const ty = EYE - 0.2, lead = d / 10, tx = pl.x + pl.vx * lead * 0.5, tz = pl.z + pl.vz * lead * 0.5, v = norm([tx - e.x, ty - e.y, tz - e.z]);
            const fan = S.errat > 0.35 ? [-0.28, 0, 0.28] : [0];   // deep levels: a fan of orbs that weave
            fan.forEach(a => { const c = Math.cos(a), s = Math.sin(a); S.orbs.push({ x: e.x, y: e.y, z: e.z, vx: (v[0] * c - v[2] * s) * 10, vy: v[1] * 10, vz: (v[0] * s + v[2] * c) * 10, life: 4, wob: S.errat, ph: Math.random() * 6 }); });
            play('orb');
          }
        }
        const tv = [dir[0] * speed, dir[1] * speed];
        e.vx += (tv[0] - e.vx) * Math.min(1, dt * 5); e.vz += (tv[1] - e.vz) * Math.min(1, dt * 5);
        // keep apart from each other
        for (const o of S.enemies) { if (o === e || o.dead) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), m = e.r + o.r + 0.2; if (od < m && od > 1e-3) { e.vx += ox / od * (m - od) * 12 * dt * 10; e.vz += oz / od * (m - od) * 12 * dt * 10; } }
        e.x += e.vx * dt; e.z += e.vz * dt;
        if (ph) { const M2 = S.M; e.x = Math.max(CS, Math.min((M2.W - 1) * CS, e.x)); e.z = Math.max(CS, Math.min((M2.H - 1) * CS, e.z)); } else collide(e, e.r);
        const top = ph ? Math.max(3, ceilAt(e.x, e.z) || 3.2) : ceilAt(e.x, e.z);
        // and they leave the floor: up and down through the whole room
        const swoop = S.errat * Math.sin(e.t * 1.1 + e.seed) * Math.max(0, top - 2.2) * 0.45;
        e.y = Math.max(0.6, Math.min(top - 0.6, (e.type === 'shoot' ? 2.2 : e.type === 'mini' ? 1.1 : 1.35) + Math.sin(e.t * 2.3) * 0.22 + swoop));
        if (e.type !== 'shoot' && d < e.r + 0.55 && e.cd <= 0) { e.cd = 0.75; hurt(e.type === 'mini' ? 6 : e.type === 'split' ? 15 : 11, e.x, e.z); }
      }
      if (S.mode === '3d') { S.enemies = S.enemies.filter(e => !e.dead); MU.int += (Math.min(1, near / 4) - MU.int) * Math.min(1, dt * 0.8); }
      // the shots
      if (S.state !== 'pause') {
        if (S.mode === '3d') {
        for (const b of S.bolts) {
          const n = 3;
          for (let s = 0; s < n && b.life > 0; s++) {
            b.x += b.vx * dt / n; b.y += b.vy * dt / n; b.z += b.vz * dt / n;
            if (solidAt(b.x, b.z) || b.y < 0.02 || b.y > ceilAt(b.x, b.z)) { b.life = 0; burst(b.x - b.vx * 0.004, b.y - b.vy * 0.004, b.z - b.vz * 0.004, [0.5, 1.6, 2.6], 8, 3, 0.35, 0.07); flash(b.x, b.y, b.z, [0.4, 1.2, 2], 4, 0.12); break; }
            for (const e of S.enemies) { if (e.dead) continue; const dx = b.x - e.x, dy = b.y - e.y, dz = b.z - e.z; if (dx * dx + dy * dy + dz * dz < (e.r + 0.18) ** 2) { b.life = 0; e.awake = true; e.flash = 1; e.hp--; play('hit'); burst(b.x, b.y, b.z, [2, 2, 2], 6, 3, 0.25, 0.06); if (e.hp <= 0) killEnemy(e); hitMark(); break; } }
            if (b.life <= 0) break;
            for (const c of S.cores) { if (!c.alive || c.fold) continue; const dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z; if (dx * dx + dy * dy + dz * dz < 1.05 ** 2) { b.life = 0; hitCore(c); burst(b.x, b.y, b.z, [2.4, 2.2, 1.4], 8, 3, 0.3, 0.07); hitMark(); break; } }
          }
          b.life -= dt;
        }
        S.bolts = S.bolts.filter(b => b.life > 0);
        for (const o of S.orbs) {
          o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.life -= dt;
          if (o.wob) { const l = Math.hypot(o.vx, o.vz) || 1, w = Math.sin(o.life * 7 + o.ph) * o.wob * 5 * dt; o.x += -o.vz / l * w; o.z += o.vx / l * w; o.y += Math.cos(o.life * 5 + o.ph) * o.wob * 1.5 * dt; }
          if (solidAt(o.x, o.z) || o.y < 0 || o.y > ceilAt(o.x, o.z)) { o.life = 0; burst(o.x, o.y, o.z, [2.4, 0.9, 0.2], 10, 2.5, 0.4, 0.08); continue; }
          const dx = o.x - pl.x, dy = o.y - (EYE - 0.3), dz = o.z - pl.z;
          if (S.state === 'play' && dx * dx + dy * dy + dz * dz < 0.55 ** 2) { o.life = 0; hurt(9 + S.level, o.x, o.z); burst(o.x, o.y, o.z, [2.4, 0.9, 0.2], 14, 3, 0.4, 0.08); }
        }
        S.orbs = S.orbs.filter(o => o.life > 0);
        }
        const floor = S.mode === '3d';
        for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= p.g * dt; const k = Math.exp(-dt * 2.5); p.vx *= k; p.vz *= k; if (floor && p.y < 0.02) { p.y = 0.02; p.vy = Math.abs(p.vy) * 0.4; } p.life -= dt; }
        S.parts = S.parts.filter(p => p.life > 0);
        S.flashes.forEach(f => { f.life -= dt; }); S.flashes = S.flashes.filter(f => f.life > 0);
        S.cores.forEach(c => { c.t += dt; c.flash = Math.max(0, c.flash - dt * 6); });
        S.exit.t += dt;
      }
    }
    let hitT = 0; function hitMark() { hitT = 0.12; cross.classList.add('hit'); }

    /* ── drawing ── */
    let scale = 1, slowT = 0, fastT = 0, lastLayout = '';
    function frame(dt) {
      const cw = wrap.clientWidth, ch = wrap.clientHeight; if (!cw || !ch) return;
      const dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.5) * scale;
      const W = Math.max(64, Math.round(cw * dpr)), H = Math.max(64, Math.round(ch * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      ensureRT(W, H);
      const M = S.M;
      // the camera (with bob, recoil, shake and the tilt while strafing)
      const sh = pl.shake * pl.shake, sp = Math.hypot(pl.vx, pl.vz);
      const yaw = pl.yaw + (Math.random() - 0.5) * sh * 0.05, pitch = pl.pitch + (Math.random() - 0.5) * sh * 0.05 + pl.recoil * 0.012;
      let B = basis(yaw, pitch, pl.roll), eye = [pl.x, EYE + Math.sin(pl.bob * 2) * 0.05 * Math.min(1, sp / 7), pl.z], fov = pl.fov;
      const FO = S.mode === 'fold' ? S.fold : null;
      if (FO) {   // a fold: seen from the side (going in, the camera turns from your eyes to there)
        const k = FO.tr * FO.tr * (3 - 2 * FO.tr), cx = FO.cam[0], cy = FO.cam[1], D = touch ? 10 : 13;
        const ey = [cx * k + (f2.x - 0.4) * (1 - k), (cy + 1.4) * k + (f2.y + 1.6) * (1 - k), D * k];
        const jit = (Math.random() - 0.5) * sh * 0.04;
        B = basis(Math.PI / 2 * (1 - k) + jit, Math.atan2(-1.4, D) * k + jit, (1 - k) * 0.5 * Math.sin(k * Math.PI));
        eye = ey; fov = 1.32 * (1 - k) + 0.95 * k;
      }
      const proj = persp(fov, W / H, 0.05, 160), vp = mul(proj, viewM(eye, B));
      // the lights: the 16 nearest of everything that glows
      const lights = [];
      S.flashes.forEach(f => lights.push([f.x, f.y, f.z, f.r * (0.5 + 0.5 * f.life / f.max), f.col[0] * f.life / f.max, f.col[1] * f.life / f.max, f.col[2] * f.life / f.max]));
      S.bolts.forEach(b => lights.push([b.x, b.y, b.z, 3.5, 0.2, 0.6, 1.1]));
      S.orbs.forEach(o => lights.push([o.x, o.y, o.z, 4, 1.6, 0.5, 0.1]));
      const here = c => c.alive && !!c.fold === !!FO;   // the cores of the world you are in
      S.cores.forEach(c => { if (here(c)) { const p = 1 + 0.35 * Math.sin(c.t * 3); lights.push([c.x, c.y, c.z, 9, 1.0 * p, 0.85 * p, 0.5 * p]); } });
      if (!FO && S.portal && !S.portal.done) { const q = S.portal, p = 1 + 0.3 * Math.sin(q.t * 3); lights.push([q.x + q.nx * 0.6, 1.7, q.z + q.nz * 0.6, 6, 1.4 * p, 0.4 * p, 1.6 * p]); }
      if (FO) lights.push([f2.x, f2.y + 1.2, 1.2, 4, 0.25, 0.6, 0.9]);
      if (!FO && S.exit.open) { const p = 1 + 0.4 * Math.sin(S.exit.t * 4); lights.push([S.exit.x, 1.6, S.exit.z, 12, 0.6 * p, 2.4 * p, 2.6 * p]); }
      S.enemies.forEach(e => { if (e.awake) { const c = COL[e.type]; lights.push([e.x, e.y, e.z, 3.5, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8]); } });
      if (!FO && S.npc && !S.npc.gone) { const c = hsv((S.npc.hue + S.npc.t * 0.08) % 1, 0.5, 1); lights.push([S.npc.x, 1.7, S.npc.z, 5, c[0] * 0.55, c[1] * 0.55, c[2] * 0.55]); }
      lights.forEach(l => { l.d = (l[0] - eye[0]) ** 2 + (l[2] - eye[2]) ** 2; });
      lights.sort((a, b) => a.d - b.d);
      const LP = new Float32Array(64), LC = new Float32Array(64), NL = Math.min(16, lights.length);
      for (let i = 0; i < NL; i++) { const l = lights[i]; LP.set([l[0], l[1], l[2], l[3]], i * 4); LC.set([l[4], l[5], l[6], 0], i * 4); }
      const RC = new Float32Array(64);
      for (let k = 0; k < 15; k++) { const r = M.rooms[k]; if (!r) break; const c = PAL[r.hue]; RC.set([c[0], c[1], c[2], S.roomGlow[k]], k * 4); }
      RC.set([0, 0.62, 0.95, 0.85], CORR * 4);
      const RP = new Float32Array(64);
      for (let k = 0; k < 15; k++) { const r = M.rooms[k]; if (!r) break; RP.set([r.pf, r.pw, 0, 0], k * 4); }
      RP.set([M.corrPat[0], M.corrPat[1], 0, 0], CORR * 4);
      // the scene, in HDR
      gl.bindFramebuffer(gl.FRAMEBUFFER, RT.fMain); gl.viewport(0, 0, W, H);
      gl.clearColor(0.004, 0, 0.01, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      let p = P.level; gl.useProgram(p.p);
      gl.uniformMatrix4fv(p.L.u_vp, false, vp); gl.uniform3fv(p.L.u_eye, eye); gl.uniform1f(p.L.u_time, S.t);
      gl.uniform4fv(p.L.u_lp, LP); gl.uniform4fv(p.L.u_lc, LC); gl.uniform1i(p.L.u_nl, NL); gl.uniform4fv(p.L.u_rc, RC); gl.uniform4fv(p.L.u_rp, RP);
      gl.uniform1f(p.L.u_psy, S.psy); gl.uniform1f(p.L.u_warp, Math.max(0, (S.level - 4) / 6) * 0.26 * Math.min(1, S.psy * 2));
      const geo = FO ? foldGL : levelGL;
      gl.bindVertexArray(geo.vao); gl.drawArrays(gl.TRIANGLES, 0, geo.n);
      // things
      gl.disable(gl.CULL_FACE);
      p = P.ent; gl.useProgram(p.p); gl.uniformMatrix4fv(p.L.u_vp, false, vp); gl.uniform3fv(p.L.u_eye, eye); gl.uniform1f(p.L.u_fog, 1); gl.uniform1f(p.L.u_time, S.t);
      const wob = (w, h) => { gl.uniform1f(p.L.u_wob, w); gl.uniform1f(p.L.u_hue, h); };
      wob(0, 0);
      const draw = (mesh, m, col, glow, fill, fl) => { gl.uniformMatrix4fv(p.L.u_m, false, m); gl.uniform3fv(p.L.u_col, col); gl.uniform1f(p.L.u_glow, glow); gl.uniform1f(p.L.u_fill, fill); gl.uniform1f(p.L.u_flash, fl); gl.bindVertexArray(mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, mesh.n); };
      const ER = S.errat, PS = S.psy;
      for (const e of S.enemies) {
        const c = COL[e.type], ph = e.type === 'phase';
        let k = e.awake && !(e.calmT > 0) ? 1 : 0.55;
        if (ph) k *= 0.55 + 0.45 * Math.abs(Math.sin(e.t * 9 + e.seed));   // the violet ones flicker
        wob(PS * 0.28 + (ph ? 0.18 : 0), PS > 0 ? (S.t * 0.25 + e.seed) * PS : 0);
        const sc = 1 + ER * 0.22 * Math.sin(e.t * 7 + e.seed), spin = 1 + ER * 1.5 * Math.sin(e.t * 0.9 + e.seed);
        // deep levels (and the violet ones): the shape keeps changing
        const mesh = (ph || PS > 0.55) && Math.floor(e.t * 0.8 + e.seed) % 3 !== 0 ? [MESH.octa, MESH.ico, MESH.cube][Math.floor(e.t * 0.8 + e.seed) % 3]
          : e.type === 'drone' || e.type === 'mini' ? MESH.octa : e.type === 'shoot' ? MESH.cube : MESH.ico;
        const sz = e.type === 'shoot' ? e.r * 0.85 : e.type === 'drone' || e.type === 'mini' ? e.r * 1.1 : e.r;
        draw(mesh, modelM(e.x, e.y, e.z, sz * sc, e.t * 2.0 * spin, e.t * 0.6 * spin + 0.3), c, k, 0.05, e.flash);
      }
      wob(PS * 0.12, PS > 0 ? S.t * 0.1 * PS : 0);
      for (const c of S.cores) {
        if (!here(c)) continue;
        const pu = 1 + 0.06 * Math.sin(c.t * 3);
        draw(MESH.octa, modelM(c.x, c.y, c.z, 0.85 * pu, c.t * 0.8, 0), [1, 0.86, 0.45], 1.2, 0.15, c.flash);
        draw(MESH.octa, modelM(c.x, c.y, c.z, 0.45, -c.t * 2.2, c.t), [1, 1, 1], 1.6, 0.6, c.flash);
        draw(MESH.ring, modelM(c.x, c.y, c.z, 1.25, c.t * 1.4, Math.PI / 2 + 0.3 * Math.sin(c.t)), [1, 0.86, 0.45], 0.8, 0.05, 0);
      }
      // you, in a fold
      if (FO) draw(MESH.avatar, modelM(f2.x, f2.y + (f2.ground ? Math.abs(Math.sin(f2.run * 2.2)) * 0.06 : 0), 0, 1, f2.face > 0 ? 0 : Math.PI, 0), [0.35, 0.9, 1], 1.1, 0.12, pl.hurtT > 0 ? pl.hurtT : 0);
      // a portal into a fold: two rings on the wall, magenta
      if (!FO && S.portal && !S.portal.done) {
        const q = S.portal, a = Math.atan2(q.nx, q.nz), pu = 1 + 0.05 * Math.sin(q.t * 4);
        draw(MESH.ring, modelM(q.x, 1.8, q.z, 1.2 * pu, a, 0), [1, 0.35, 0.95], 1.5, 0.05, 0);
        draw(MESH.ring, modelM(q.x + q.nx * 0.05, 1.8, q.z + q.nz * 0.05, 0.85, a, q.t * 1.5), [0.6, 0.9, 1], 1.1, 0.05, 0);
      }
      // a strange one: rings turning around a small light, iridescent
      if (!FO && S.npc && S.npc.fade > 0.01) {
        const n = S.npc, f = n.fade, c1 = hsv((n.hue + n.t * 0.08) % 1, 0.55, 1), c2 = hsv((n.hue + 0.33 + n.t * 0.08) % 1, 0.55, 1), y = 1.7 + Math.sin(n.t * 1.3) * 0.15;
        wob(0.06, 0);
        draw(MESH.ring, modelM(n.x, y, n.z, 0.95 * f, n.t * 0.7, 0.4), c1, 1.1 * f, 0.05, 0);
        draw(MESH.ring, modelM(n.x, y, n.z, 0.75 * f, -n.t * 1.1, 1.3), c2, 1.1 * f, 0.05, 0);
        draw(MESH.ring, modelM(n.x, y, n.z, 0.55 * f, n.t * 1.7, -0.7), c1, 1.1 * f, 0.05, 0);
        draw(MESH.ico, modelM(n.x, y, n.z, 0.22 * f, n.t * 2, n.t), [1, 1, 1], 1.4 * f, 0.6, 0);
        wob(PS * 0.12, PS > 0 ? S.t * 0.1 * PS : 0);
      }
      if (!FO) for (const q of S.pickups) draw(MESH.plus, modelM(q.x, 0.9 + Math.sin(q.t * 3) * 0.12, q.z, 0.9, q.t * 1.6, 0), [0.35, 1, 0.3], 1.2, 0.1, 0);
      if (!FO) { const X = S.exit, op = X.open, pu = op ? 1 + 0.05 * Math.sin(X.t * 4) : 1;
        draw(MESH.ring, modelM(X.x, 1.6, X.z, 1.35 * pu, X.t * (op ? 0.8 : 0.15), 0), op ? [0.4, 1, 1] : [0.25, 0.3, 0.4], op ? 1.6 : 0.35, 0.05, 0);
        draw(MESH.ring, modelM(X.x, 1.6, X.z, 1.0 * pu, -X.t * (op ? 1.3 : 0.2), 0), op ? [0.4, 1, 1] : [0.25, 0.3, 0.4], op ? 1.2 : 0.25, 0.05, 0); }
      // light: shots, orbs, sparks, the exit's glow
      let n = 0;
      const pt = (x, y, z, s, r, g, b, a) => { if (n >= PMAX) return; pData.set([x, y, z, s, r, g, b, a], n * 8); n++; };
      S.bolts.forEach(b => { for (let k = 0; k < 5; k++) pt(b.x - b.vx * 0.005 * k, b.y - b.vy * 0.005 * k, b.z - b.vz * 0.005 * k, 0.13 - k * 0.018, 0.7, 2.2, 3.4, 1 - k * 0.17); });
      S.orbs.forEach(o => { pt(o.x, o.y, o.z, 0.7, 3, 1.1, 0.25, 1); pt(o.x, o.y, o.z, 0.3, 3, 2.5, 2, 1); });
      S.parts.forEach(q => { const a = q.life / q.max; pt(q.x, q.y, q.z, q.size, q.col[0], q.col[1], q.col[2], a); });
      S.cores.forEach(c => { if (here(c)) pt(c.x, c.y, c.z, 1.7, 1.2, 1, 0.6, 0.28 + 0.1 * Math.sin(c.t * 3)); });
      if (!FO && S.portal && !S.portal.done) { const q = S.portal; for (let k = 0; k < 14; k++) { const a = q.t * 1.2 + k * 0.449, r = 0.3 + 0.8 * ((k * 0.37 + q.t * 0.25) % 1), px = Math.cos(a) * r, py = Math.sin(a) * r; pt(q.x + q.nx * 0.15 - q.nz * px, 1.8 + py, q.z + q.nz * 0.15 + q.nx * px, 0.1, 2.6, 0.7, 2.6, 0.9); } }
      if (FO) { pt(f2.x + f2.face * 0.5, f2.y + 1.08, 0, 0.12, 0.6, 1.6, 2.4, 0.6); }
      if (!FO && S.exit.open) pt(S.exit.x, 1.6, S.exit.z, 3.2, 0.3, 1.4, 1.6, 0.8 + 0.3 * Math.sin(S.exit.t * 4));
      if (!FO && S.npc && S.npc.fade > 0.01) { const n = S.npc; for (let k = 0; k < 10; k++) { const a = n.t * 0.9 + k * 0.628, c = hsv((n.hue + k * 0.1 + n.t * 0.1) % 1, 0.6, 1); pt(n.x + Math.cos(a) * 1.3, 1.7 + Math.sin(a * 2.3) * 0.6, n.z + Math.sin(a) * 1.3, 0.09, c[0] * 2.5, c[1] * 2.5, c[2] * 2.5, n.fade); } }
      if (n) {
        p = P.pts; gl.useProgram(p.p); gl.uniformMatrix4fv(p.L.u_vp, false, vp); gl.uniform1f(p.L.u_ph, H / (2 * Math.tan(fov / 2)));
        gl.bindBuffer(gl.ARRAY_BUFFER, pBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pData, 0, n * 8);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
        gl.bindVertexArray(pVao); gl.drawArrays(gl.POINTS, 0, n);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      // the weapon, in front of the camera
      if (!FO && (S.state === 'play' || S.state === 'pause' || S.state === 'talk')) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        p = P.ent; gl.useProgram(p.p);
        gl.uniformMatrix4fv(p.L.u_vp, false, persp(1.1, W / H, 0.01, 10)); gl.uniform3fv(p.L.u_eye, [0, 0, 0]); gl.uniform1f(p.L.u_fog, 0);
        const bx = Math.cos(pl.bob) * 0.012 * Math.min(1, sp / 7), by = Math.abs(Math.sin(pl.bob)) * 0.012 * Math.min(1, sp / 7);
        const gx = 0.22 * Math.min(1, W / H / 1.4);   // closer to the middle on a tall (portrait) screen
        const gm = modelM(gx + bx, -0.2 - by - pl.recoil * 0.01, -0.62 + pl.recoil * 0.05, 0.62, -0.08, pl.recoil * 0.08);
        draw(MESH.gun, gm, [0.3, 0.85, 1], 0.9 + pl.recoil * 0.8, 0.07, 0);
      }
      gl.disable(gl.DEPTH_TEST);
      // bloom: bright parts at a quarter size, blurred twice
      gl.bindVertexArray(emptyVao);
      const pass = (prg, fb, w, h, srcs, set) => { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); gl.useProgram(prg.p); srcs.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); }); set(prg.L); gl.drawArrays(gl.TRIANGLES, 0, 3); };
      let scene = RT.main;
      if (S.psy > 0.02) {   // deep levels: what glows leaves trails that turn and change colour
        const src = RT.e[RT.ec], dst = 1 - RT.ec, ps = S.psy;
        pass(P.echo, RT.fe[dst], W, H, [RT.main, src], L => { gl.uniform1i(L.u_img, 0); gl.uniform1i(L.u_prev, 1); gl.uniform1f(L.u_k, 0.3 + 0.38 * ps); gl.uniform1f(L.u_rot, 0.006 * ps * Math.sin(S.t * 0.3)); gl.uniform1f(L.u_zoom, 1 - 0.012 * ps); gl.uniform1f(L.u_hue, 0.015 * ps); });
        RT.ec = dst; scene = RT.e[dst];
      }
      pass(P.bright, RT.fa, RT.qw, RT.qh, [scene], L => { gl.uniform1i(L.u_img, 0); gl.uniform2f(L.u_px, 1 / W, 1 / H); });
      for (let k = 0; k < 2; k++) {
        pass(P.blur, RT.fb, RT.qw, RT.qh, [RT.a], L => { gl.uniform1i(L.u_img, 0); gl.uniform2f(L.u_dir, (1 + k) / RT.qw, 0); });
        pass(P.blur, RT.fa, RT.qw, RT.qh, [RT.b], L => { gl.uniform1i(L.u_img, 0); gl.uniform2f(L.u_dir, 0, (1 + k) / RT.qh); });
      }
      const fade = S.state === 'trans' ? Math.max(0, Math.min(1, Math.abs(S.endT - 0.8) / 0.8)) : S.state === 'dead' || S.state === 'over' ? Math.max(0.25, S.endT / 1.6) : 1;
      pass(P.comp, null, W, H, [scene, RT.a], L => {
        gl.uniform1i(L.u_img, 0); gl.uniform1i(L.u_bloom, 1); gl.uniform1f(L.u_hurt, Math.min(1, pl.hurtT * 2) + (S.state === 'dead' ? 0.6 : 0) + (S.hp < 30 && S.state === 'play' ? 0.18 + 0.12 * Math.sin(S.t * 6) : 0));
        gl.uniform1f(L.u_time, S.t % 100); gl.uniform1f(L.u_ab, S.fx * 0.12 + 0.012 + S.psy * 0.03 * (1 + Math.sin(S.t * 0.7)) + pl.hurtT * 0.05 + (pl.dashT > 0 ? 0.04 : 0)); gl.uniform1f(L.u_bk, 1.1); gl.uniform1f(L.u_fade, fade * (1 + S.fx * 1.4)); gl.uniform2f(L.u_res, W, H);
      });
      gl.activeTexture(gl.TEXTURE0);
      // the HUD
      hpFill.style.width = S.hp + '%'; hpNum.textContent = Math.ceil(S.hp); hpBox.classList.toggle('low', S.hp < 30);
      dashFill.style.width = (100 - pl.dashCd / 0.9 * 100) + '%';
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) cross.classList.remove('hit'); }
      if (FO) {   // the sight: where the shots go (on a phone, ahead of you)
        const ax = touch ? f2.face * 3 : f2.ax, ay = touch ? 0 : f2.ay, wx = f2.x + ax, wy = f2.y + 1.08 + ay;
        const c4 = [vp[0] * wx + vp[4] * wy + vp[12], vp[1] * wx + vp[5] * wy + vp[13], vp[3] * wx + vp[7] * wy + vp[15]];
        if (c4[2] > 0) { cross.style.left = ((c4[0] / c4[2]) * 0.5 + 0.5) * 100 + '%'; cross.style.top = (0.5 - (c4[1] / c4[2]) * 0.5) * 100 + '%'; }
      }
      const layout = touch ? 't' : 'd'; if (layout !== lastLayout) { wrap.classList.toggle('touch', touch); lastLayout = layout; }
      if (!FO && (S.mapT = (S.mapT || 0) - dt) <= 0) { S.mapT = 0.12; drawMap(); }
      // a heavier picture than the device can carry: draw it smaller (and back up when there is room)
      if (dt > 1 / 40) { slowT += dt; fastT = 0; if (slowT > 1.5 && scale > 0.5) { scale = Math.max(0.5, scale * 0.85); slowT = 0; } }
      else if (dt < 1 / 70) { fastT += dt; slowT = 0; if (fastT > 4 && scale < 1) { scale = Math.min(1, scale * 1.1); fastT = 0; } }
    }
    function drawMap() {
      const M = S.M, g = mapCv.getContext('2d'), Wm = mapCv.width, s = 4, cx = pl.x / CS, cz = pl.z / CS;
      g.clearRect(0, 0, Wm, Wm);
      g.save(); g.beginPath(); g.arc(Wm / 2, Wm / 2, Wm / 2 - 2, 0, Math.PI * 2); g.clip();
      g.fillStyle = 'rgba(4,6,14,0.72)'; g.fillRect(0, 0, Wm, Wm);
      const R = Math.ceil(Wm / 2 / s) + 1;
      for (let j = Math.floor(cz) - R; j <= cz + R; j++) for (let i = Math.floor(cx) - R; i <= cx + R; i++) {
        if (i < 0 || j < 0 || i >= M.W || j >= M.H) continue; const k = j * M.W + i;
        if (!S.seen[k] || M.grid[k]) continue;
        const r = M.rid[k], glow = r >= 0 ? S.roomGlow[r] : 1;
        g.fillStyle = r >= 0 ? `rgba(${PAL[M.rooms[r].hue].map(v => Math.round(v * 255)).join(',')},${0.12 + 0.3 * glow})` : 'rgba(0,160,240,0.28)';
        g.fillRect(Wm / 2 + (i - cx) * s, Wm / 2 + (j - cz) * s, s, s);
      }
      const dot = (x, z, col, r) => { const px = Wm / 2 + (x / CS - cx) * s, pz = Wm / 2 + (z / CS - cz) * s; g.fillStyle = col; g.beginPath(); g.arc(px, pz, r, 0, Math.PI * 2); g.fill(); return [px, pz]; };
      S.cores.forEach(c => { if (c.alive && !c.fold && S.seen[Math.floor(c.z / CS) * M.W + Math.floor(c.x / CS)]) dot(c.x, c.z, '#ffd23f', 3.5); });
      if (S.portal && !S.portal.done && S.seen[Math.floor(S.portal.fz / CS) * M.W + Math.floor(S.portal.fx / CS)]) dot(S.portal.x, S.portal.z, '#ff5af0', 4);
      if (S.npc && !S.npc.gone && S.seen[Math.floor(S.npc.z / CS) * M.W + Math.floor(S.npc.x / CS)]) dot(S.npc.x, S.npc.z, '#e9b8ff', 3);
      if (S.exit.open) {   // the exit always shows (on the rim when it is far)
        let ex = (S.exit.x / CS - cx) * s, ez = (S.exit.z / CS - cz) * s; const l = Math.hypot(ex, ez), m = Wm / 2 - 8; if (l > m) { ex *= m / l; ez *= m / l; }
        g.fillStyle = '#6ff'; g.beginPath(); g.arc(Wm / 2 + ex, Wm / 2 + ez, 4.5, 0, Math.PI * 2); g.fill();
      }
      g.translate(Wm / 2, Wm / 2); g.rotate(pl.yaw); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = 'rgba(0,212,255,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(Wm / 2, Wm / 2, Wm / 2 - 2, 0, Math.PI * 2); g.stroke();
    }

    /* ── the loop ── */
    let raf = 0, last = performance.now(), musT = 0;
    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      if (S.state !== 'pause') update(dt);
      if (S.state === 'over') return;   // the result screen is up (and this game already cleaned up)
      frame(dt);
      if ((musT -= dt) <= 0) { musT = 0.025; musicTick(); }
    }
    audio(); if (A && A.state === 'suspended') A.resume();
    loadLevel();
    toast(tr(`Nivel 1: encontrá y destruí ${S.cores.length} núcleos`, `Level 1: find and destroy ${S.cores.length} cores`), 3.5);
    lock();
    // on a phone: the whole screen, sideways (the Start tap allows it)
    if (touch && wrap.requestFullscreen && !/nctouch/.test(location.search)) wrap.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }, () => {});
    raf = requestAnimationFrame(loop);

    // test hooks (headless runs)
    Object.assign(ctx.test, {
      get S() { return S; }, get pl() { return pl; }, fire: on => { firing = !!on; }, keys: K, look: (dx, dy) => { mx += dx; my += dy; },
      killAll() { S.enemies.forEach(e => { if (!e.dead) killEnemy(e); }); S.enemies = S.enemies.filter(e => !e.dead); },
      coresDown() { S.cores.forEach(c => { while (c.alive) hitCore(c); }); },
      goto(x, z, yaw) { pl.x = x; pl.z = z; if (yaw !== undefined) pl.yaw = yaw; },
      aimAt(x, y, z) { const dx = x - pl.x, dy = y - EYE, dz = z - pl.z; pl.yaw = Math.atan2(dx, -dz); pl.pitch = Math.atan2(dy, Math.hypot(dx, dz)); },
      hurt, nextLevel, talk, advance, endTalk,
      setLevel(n) { S.level = n; loadLevel(); },
      get f2() { return f2; }, enterFold, exitFold, jump() { f2.buf = 0.13; f2.held = true; },
      setPat(f, w) { S.M.rooms.forEach(r => { r.pf = f; r.pw = w; }); S.M.corrPat = [f, w]; },
    });

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKey, true);
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
      document.removeEventListener('pointerlockchange', onLock); document.removeEventListener('visibilitychange', onVis);
      if (locked()) document.exitPointerLock();
      if (document.fullscreenElement === wrap) document.exitFullscreen().catch(() => {});
      if (A) { try { A.close(); } catch (e) { /* ignore */ } A = null; }
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      stage.classList.remove('nc-stage');
    };
  }
})();
