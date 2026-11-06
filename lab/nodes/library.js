/* NODRUS · 📚 Librería de shaders.
   Shaders from Shadertoy (with the "Enviar a NODRUS" bookmarklet) or pasted by hand, saved in this
   browser with their name, author, link, license and hashtags; tested on import (compiles? uses
   textures or several passes?) and shown with a thumbnail rendered by NODRUS itself. */
(function () {
  const N = window.PudrusNodes;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const E = () => window.__nodesEditor;
  const LICENSE_ST = 'CC BY-NC-SA 3.0 (Shadertoy, salvo que el autor diga otra cosa)';

  /* ── Storage (IndexedDB) ── */
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('nodrus-library', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('shaders', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = (mode, fn) => db().then(d => new Promise((res, rej) => {
    const tx = d.transaction('shaders', mode), q = fn(tx.objectStore('shaders'));
    tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error);
  }));
  const all = () => run('readonly', st => st.getAll()).then(a => (a || []).sort((x, y) => (y.added || 0) - (x.added || 0)));
  const put = e => run('readwrite', st => st.put(e));
  const del = id => run('readwrite', st => st.delete(id));

  /* ── Licenses: read what the author wrote in the code ──
     free = allows commercial use (CC0, MIT, BSD, Apache, Unlicense, CC BY / BY-SA)
     nc = non-commercial (CC BY-NC…, Shadertoy's default)   unknown = nothing clear (treat as restricted) */
  function detectLicense(text, fallback) {
    const t = String(text || '');
    if (/\bCC[- ]?BY[- ]?NC|non[- ]?commercial|no comercial/i.test(t)) return { kind: 'nc', name: (t.match(/CC[- ]?BY[- ]?NC[- A-Z]*\s*\d?(\.\d)?/i) || ['CC BY-NC'])[0].trim() };
    if (/\bCC0\b|creative commons zero|public domain|dominio p[uú]blico|\bunlicense\b/i.test(t)) return { kind: 'free', name: 'CC0 / dominio público' };
    if (/\bMIT\b(\s+license)?/i.test(t) && /licen[cs]e|\(c\)|copyright/i.test(t)) return { kind: 'free', name: 'MIT' };
    if (/\bBSD\b[- ]?(\d|license|licence)/i.test(t)) return { kind: 'free', name: 'BSD' };
    if (/apache license/i.test(t)) return { kind: 'free', name: 'Apache 2.0' };
    const by = t.match(/\bCC[- ]?BY(?:[- ]SA)?\s*\d(?:\.\d)?/i);
    if (by) return { kind: 'free', name: by[0].toUpperCase().replace(/\s+/g, ' ') };
    return fallback || { kind: 'unknown', name: 'sin licencia clara' };
  }
  const ST_DEFAULT = { kind: 'nc', name: 'CC BY-NC-SA 3.0 (Shadertoy por defecto)' };
  const licOf = e => e.lic || detectLicense(e.code, e.source === 'shadertoy' ? ST_DEFAULT : e.source === 'isf' ? { kind: 'free', name: 'MIT' } : undefined);

  /* ── Import ── */
  const cleanTags = a => [...new Set((Array.isArray(a) ? a : String(a || '').split(/[,#\s]+/)).map(t => String(t).toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 30)).filter(Boolean))].slice(0, 30);
  // what the bookmarklet copies (or a Shadertoy-API-like JSON) -> one library entry
  function normalize(d) {
    if (d && d.Shader) d = { id: d.Shader.info.id, name: d.Shader.info.name, author: d.Shader.info.username, description: d.Shader.info.description, tags: d.Shader.info.tags, url: `https://www.shadertoy.com/view/${d.Shader.info.id}`, passes: (d.Shader.renderpass || []).map(p => ({ type: p.type, name: p.name, code: p.code, inputs: (p.inputs || []).map(i => ({ type: i.type || i.ctype, channel: i.channel })) })) };
    const passes = (d.passes || []).filter(p => p && typeof p.code === 'string');
    const image = passes.find(p => /image/i.test(p.type || '')) || passes.find(p => /mainImage/.test(p.code));
    if (!image) throw new Error('no hay un pase «Image» con mainImage');
    const common = passes.filter(p => /common/i.test(p.type || '')).map(p => p.code).join('\n');
    const buffers = passes.filter(p => /buffer/i.test(p.type || ''));
    const notes = [];
    if (buffers.length) notes.push(`usa ${buffers.length} pase(s) extra (Buffer A–D): todavía no se pueden usar, se verá distinto`);
    const ins = (image.inputs || []).filter(i => i && !/buffer/i.test(i.type || ''));
    if (ins.length) notes.push(`usa ${ins.map(i => (i.type || 'textura') + (i.channel !== undefined ? ' en iChannel' + i.channel : '')).join(', ')}: NODRUS no los tiene (iChannel0 = feedback)`);
    const id = d.id ? 'st-' + String(d.id).replace(/[^\w-]/g, '') : 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    return {
      id, source: d.id ? 'shadertoy' : 'propio',
      name: String(d.name || 'Sin nombre').slice(0, 80), author: String(d.author || '').slice(0, 60),
      url: d.url || (d.id ? `https://www.shadertoy.com/view/${d.id}` : ''), description: String(d.description || '').slice(0, 600),
      tags: cleanTags(d.tags), mine: cleanTags(d.mine), license: d.license || (d.id || /shadertoy\.com/.test(d.url || '') ? LICENSE_ST : ''),
      lic: detectLicense((common ? common + '\n' : '') + image.code + '\n' + (d.description || ''), d.id || /shadertoy\.com/.test(d.url || '') ? ST_DEFAULT : undefined),
      code: (common ? common + '\n' : '') + image.code, notes, fav: false, added: Date.now(),
    };
  }
  // compile it inside NODRUS and render a thumbnail at t = 2 s
  let thumbs = null;
  function testAndThumb(entry) {
    const g = { nodes: [{ id: 1, type: 'glsl', v: {}, p: { code: entry.code } }, { id: 2, type: 'output', v: {}, p: {} }], links: [{ a: 1, ao: 'c', b: 2, bi: 'c' }] };
    let c = null;
    try {
      c = N.compile(g);
      thumbs = thumbs || N.createThumbs(240, 135);
      thumbs.render('lib-' + entry.id + Date.now(), c, g, 2.0, [0, 0, 0, 0]);
      entry.thumb = thumbs.canvas.toDataURL('image/jpeg', 0.75);
      thumbs.clear();
      entry.level = entry.notes.length ? 'warn' : 'ok';
      entry.params = N.glslParams(entry.code).map(q => q.name);
    } catch (e) {
      entry.level = 'error'; entry.thumb = '';
      let msg = String(e.message || e);
      if (c) {
        // point at the line of the imported code, not of the whole shader
        // (NODRUS puts one declaration per detected control before the code)
        const at = c.frag.indexOf('// GLSL #1\n');
        if (at >= 0) {
          const start = c.frag.slice(0, at).split('\n').length + 1 + N.glslParams(entry.code).length;
          msg = msg.replace(/ERROR:\s*\d+:(\d+):/g, (_, ln) => `línea ${Math.max(1, +ln - start + 1)}:`);
        }
      }
      entry.notes = [...entry.notes, 'no compila: ' + msg.split('\n').filter(Boolean).slice(0, 2).join(' · ')];
    }
    return entry;
  }
  async function importData(d, mineTags) {
    const entry = testAndThumb(normalize(d));
    if (mineTags) entry.mine = cleanTags(mineTags);
    const old = await run('readonly', st => st.get(entry.id));
    if (old) { entry.mine = [...new Set([...(old.mine || []), ...entry.mine])]; entry.fav = old.fav; entry.added = old.added; }
    await put(entry);
    E().toast(`📚 «${entry.name}» ${old ? 'actualizado' : 'guardado'}` + (entry.level === 'ok' ? ' · funciona' : entry.level === 'warn' ? ' · funciona con avisos' : ' · no compila: revisalo en la librería'), entry.level === 'error');
    paint();
    return entry;
  }

  /* ── ISF → NODRUS: the JSON header declares the controls (name, min, max, default) ── */
  const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const lit = x => { const n = Number(x); if (!Number.isFinite(n)) return '0.0'; const t = String(n); return /[.e]/.test(t) ? t : t + '.0'; };
  function isfHeader(text) {
    const m = /\/\*\s*(\{[\s\S]*?\})\s*\*\//.exec(text);
    if (!m) return null;
    let h; try { h = JSON.parse(m[1]); } catch (e) { try { h = JSON.parse(m[1].replace(/,\s*([}\]])/g, '$1')); } catch (e2) { return null; } }
    return { h, end: m.index + m[0].length };
  }
  function isfKind(h) {
    const ins = h.INPUTS || [], imgs = ins.filter(i => i.TYPE === 'image').length, cats = h.CATEGORIES || [];
    if (imgs >= 2 || cats.some(c => /^(Dissolve|Distortion|Wipe)$/.test(c))) return 'transicion';
    return imgs ? 'filtro' : 'generador';
  }
  function isfToEntry(text, file) {
    const hh = isfHeader(text); if (!hh) throw new Error('no tiene encabezado ISF');
    const h = hh.h, notes = [], head = [];
    for (const i of h.INPUTS || []) {
      const n = i.NAME; if (!/^[A-Za-z_]\w*$/.test(n || '')) continue;
      if (i.TYPE === 'float') head.push(`uniform float ${n}; // ${lit(i.DEFAULT ?? 0.5)} [${lit(i.MIN ?? 0)}, ${lit(i.MAX ?? 1)}]`);
      else if (i.TYPE === 'bool' || i.TYPE === 'event') { head.push(`uniform float ${n}_on; // ${i.DEFAULT ? '1.0' : '0.0'} [0.0, 1.0]`); head.push(`#define ${n} (${n}_on > 0.5)`); }
      else if (i.TYPE === 'long') {
        const v = (i.VALUES && i.VALUES.length ? i.VALUES : [0, 1]).map(Number);
        head.push(`uniform float ${n}_val; // ${lit(i.DEFAULT ?? v[0])} [${lit(Math.min(...v))}, ${lit(Math.max(...v))}]`);
        head.push(`#define ${n} int(floor(${n}_val + 0.5))`);
      } else if (i.TYPE === 'color') {
        const d = Array.isArray(i.DEFAULT) ? i.DEFAULT : [1, 1, 1, 1];
        head.push(`const vec3 ${n}_rgb = vec3(${lit(d[0])}, ${lit(d[1])}, ${lit(d[2])});`);
        head.push(`#define ${n} vec4(${n}_rgb, ${lit(d[3] ?? 1)})`);
      } else if (i.TYPE === 'point2D') {
        const d = Array.isArray(i.DEFAULT) ? i.DEFAULT : [0.5, 0.5], mn = Array.isArray(i.MIN) ? i.MIN : [0, 0];
        const mx = Array.isArray(i.MAX) ? i.MAX : [Math.max(1, d[0] * 3), Math.max(1, d[1] * 3)];
        head.push(`uniform float ${n}_x; // ${lit(d[0])} [${lit(mn[0])}, ${lit(mx[0])}]`);
        head.push(`uniform float ${n}_y; // ${lit(d[1])} [${lit(mn[1])}, ${lit(mx[1])}]`);
        head.push(`#define ${n} vec2(${n}_x, ${n}_y)`);
      } else if (/^(image|audio|audioFFT)$/.test(i.TYPE)) {
        head.push(`#define ${n} iChannel0`);
        notes.push(i.TYPE === 'image' ? `filtro: necesita una imagen («${n}»); por ahora usa el feedback` : `usa audio de ISF («${n}»): no conectado`);
      }
    }
    // images bundled with the ISF (IMPORTED) are not included
    const imported = Array.isArray(h.IMPORTED) ? h.IMPORTED.map(x => x && x.NAME) : Object.keys(h.IMPORTED || {});
    imported.filter(n => /^[A-Za-z_]\w*$/.test(n || '')).forEach(n => { head.push(`#define ${n} iChannel0`); notes.push(`usa una imagen propia («${n}») que no viene incluida`); });
    const passes = h.PASSES || [];
    if (passes.length > 1) notes.push(`usa ${passes.length} pases: todavía no, se verá distinto`);
    passes.forEach(ps => { if (ps && ps.TARGET && /^\w+$/.test(ps.TARGET)) head.push(`#define ${ps.TARGET} iChannel0`); });
    let body = text.slice(hh.end);
    if (/^\s*varying\b/m.test(body)) notes.push('usa un vertex shader propio (.vs): no es compatible');
    body = body.replace(/\bgl_FragColor\b/g, 'isf_Out').replace(/\bgl_FragCoord\b/g, 'isf_FragCoord')
      .replace(/\b(vv_FragNormCoord|isf_FragNormCoord)\b/g, 'isf_FragNormCoord').replace(/\bvoid\s+main\s*\(\s*(void)?\s*\)/, 'void isf_main()');
    const code = `// ${file} · ISF de VIDVOX convertido para NODRUS
#define TIME iTime
#define TIMEDELTA iTimeDelta
#define FRAMEINDEX iFrame
#define DATE vec4(0.0)
#define PASSINDEX 0
#define RENDERSIZE iResolution.xy
vec4 isf_FragCoord; vec2 isf_FragNormCoord; vec4 isf_Out;
#define IMG_PIXEL(i, c) texture(i, (c) / RENDERSIZE)
#define IMG_NORM_PIXEL(i, c) texture(i, c)
#define IMG_THIS_PIXEL(i) texture(i, isf_FragNormCoord)
#define IMG_THIS_NORM_PIXEL(i) texture(i, isf_FragNormCoord)
#define IMG_SIZE(i) RENDERSIZE
${head.join('\n')}
${body}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  isf_FragCoord = vec4(fragCoord, 0.0, 1.0); isf_FragNormCoord = fragCoord / RENDERSIZE; isf_Out = vec4(0.0);
  isf_main(); fragColor = isf_Out;
}`;
    const kind = isfKind(h), name = file.replace(/^.*\//, '').replace(/\.fs$/i, '');
    const credit = String(h.CREDIT || '').replace(/^\s*by\s+/i, '').trim();
    const fromST = /shadertoy/i.test(text);
    return {
      id: 'isf-' + slug(name), source: 'isf', name, author: credit.slice(0, 80) || 'VIDVOX',
      url: 'https://github.com/Vidvox/ISF-Files/blob/master/ISF/' + encodeURIComponent(file.replace(/^.*\//, '')),
      description: String(h.DESCRIPTION || '').slice(0, 600),
      tags: cleanTags(['isf', kind, ...(h.CATEGORIES || []).map(slug)]), mine: [],
      lic: detectLicense(text, fromST ? { kind: 'unknown', name: 'basado en Shadertoy: revisá el original' } : { kind: 'free', name: 'MIT (colección VIDVOX ISF-Files)' }),
      code, notes, fav: false, added: Date.now(), kind,
    };
  }
  // import a set of ISF files ({ path: text }); only generators unless `all`
  async function importISF(files, opts = {}) {
    const done = { ok: 0, warn: 0, error: 0, skipped: 0 };
    const list = Object.entries(files);
    for (let k = 0; k < list.length; k++) {
      const [path, text] = list[k];
      const hh = isfHeader(text || '');
      if (!hh || (!opts.all && isfKind(hh.h) !== 'generador')) { done.skipped++; continue; }
      let e; try { e = testAndThumb(isfToEntry(text, path)); } catch (er) { done.skipped++; continue; }
      const old = await run('readonly', st => st.get(e.id));
      if (old) { e.mine = old.mine || []; e.fav = old.fav; e.added = old.added; }
      await put(e);
      done[e.level || 'ok']++;
      if (opts.progress) opts.progress(k + 1, list.length, e.name);
      if (k % 4 === 3) await new Promise(r => setTimeout(r, 0));
    }
    paint();
    return done;
  }
  // the VIDVOX collection straight from GitHub (MIT): ~49 generators
  async function importVidvox() {
    const status = $('#libColState');
    const btn = $('#libColISF'); btn.disabled = true;
    try {
      status.textContent = 'Buscando la colección en GitHub…';
      const tree = await (await fetch('https://api.github.com/repos/Vidvox/ISF-Files/git/trees/master?recursive=1')).json();
      const paths = (tree.tree || []).map(t => t.path).filter(p => /^ISF\/[^/]+\.fs$/i.test(p));
      if (!paths.length) throw new Error(tree.message || 'no encontré archivos');
      const files = {}; let got = 0;
      const queue = paths.slice();
      const worker = async () => {
        while (queue.length) {
          const p = queue.shift();
          try { files[p] = await (await fetch('https://raw.githubusercontent.com/Vidvox/ISF-Files/master/' + p.split('/').map(encodeURIComponent).join('/'))).text(); } catch (e) { /* skip */ }
          status.textContent = `Descargando ${++got} de ${paths.length}…`;
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      const r = await importISF(files, { progress: (k, n, name) => { status.textContent = `Probando ${k}/${n}: ${name}`; } });
      status.textContent = `Listo: ${r.ok + r.warn + r.error} generadores (${r.ok} ✓, ${r.warn} ⚠, ${r.error} ✕). Los filtros llegan con «filtros de pantalla».`;
      E().toast(`📚 Colección ISF: ${r.ok + r.warn} generadores listos para usar`);
    } catch (e) { status.textContent = 'No se pudo descargar: ' + String(e.message || e).slice(0, 100); }
    btn.disabled = false;
  }

  /* ── Use a shader ── */
  function useEntry(e) {
    const src = { name: e.name, author: e.author, url: e.url, license: licOf(e).name, lib: e.id };   // the credit travels with the patch
    const target = E().selectedGlsl();
    if (target) { E().setGlsl(target, e.code, src); E().toast(`«${e.name}» en el nodo GLSL elegido`); }
    else {
      E().loadGraph({ nodes: [{ id: 1, type: 'glsl', x: 80, y: 80, v: {}, p: { code: e.code, src } }, { id: 2, type: 'output', x: 380, y: 80, v: {}, p: {} }], links: [{ a: 1, ao: 'c', b: 2, bi: 'c' }] },
        `«${e.name}» en un patch nuevo · Enter lo manda al aire`);
    }
    close();
  }

  /* ── Panel ── */
  const pop = $('#libPop');
  let filter = { q: '', tags: new Set(), onlyOk: false, fav: false, free: false };
  async function paint() {
    if (pop.hidden) return;
    const list = await all();
    // tag cloud: Shadertoy hashtags + yours, with counts
    const count = new Map();
    list.forEach(e => [...e.tags, ...(e.mine || [])].forEach(t => count.set(t, (count.get(t) || 0) + 1)));
    const cloud = $('#libTags'); cloud.textContent = '';
    [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 60).forEach(([t, n]) => {
      const b = el('button', 'lib-tag' + (filter.tags.has(t) ? ' on' : ''), '#' + t); b.append(el('small', '', ' ' + n));
      b.addEventListener('click', () => { filter.tags.has(t) ? filter.tags.delete(t) : filter.tags.add(t); paint(); });
      cloud.append(b);
    });
    if (!count.size) cloud.append(el('p', 'dim', 'Los hashtags aparecen al importar shaders.'));
    const q = filter.q.toLowerCase();
    const shown = list.filter(e => (!filter.onlyOk || e.level !== 'error') && (!filter.fav || e.fav) && (!filter.free || licOf(e).kind === 'free')
      && [...filter.tags].every(t => e.tags.includes(t) || (e.mine || []).includes(t))
      && (!q || (e.name + ' ' + e.author + ' ' + e.tags.join(' ') + ' ' + (e.mine || []).join(' ')).toLowerCase().includes(q)));
    $('#libCount').textContent = `${shown.length} de ${list.length}`;
    const grid = $('#libGrid'); grid.textContent = '';
    if (!list.length) grid.append(el('div', 'lib-empty', 'Tu librería está vacía. Instalá el botón «Enviar a NODRUS» (abajo) o importá un código a mano.'));
    for (const e of shown) {
      const card = el('div', 'lib-card lv-' + (e.level || 'ok'));
      const th = el('div', 'lib-th'); if (e.thumb) th.style.backgroundImage = `url(${e.thumb})`; else th.textContent = 'sin vista previa';
      th.title = 'Usar este shader'; th.addEventListener('click', () => useEntry(e));
      const badge = el('span', 'lib-badge', e.level === 'error' ? '✕' : e.level === 'warn' ? '⚠' : '✓');
      badge.title = e.notes && e.notes.length ? e.notes.join('\n') : 'Funciona en NODRUS';
      th.append(badge);
      const star = el('button', 'lib-star' + (e.fav ? ' on' : ''), e.fav ? '★' : '☆'); star.title = 'Favorito';
      star.addEventListener('click', async ev => { ev.stopPropagation(); e.fav = !e.fav; await put(e); paint(); });
      th.append(star);
      card.append(th);
      const info = el('div', 'lib-info');
      info.append(el('b', '', e.name));
      info.append(el('span', 'dim', (e.author ? 'de ' + e.author : 'propio') + (e.params && e.params.length ? ` · ${e.params.length} controles` : '')));
      const tags = el('div', 'lib-tags');
      [...e.tags.map(t => [t, '']), ...(e.mine || []).map(t => [t, ' mine'])].slice(0, 8).forEach(([t, cls]) => {
        const b = el('button', 'lib-chip' + cls, '#' + t); b.addEventListener('click', () => { filter.tags.add(t); paint(); }); tags.append(b);
      });
      info.append(tags);
      if (e.notes && e.notes.length) info.append(el('p', 'lib-note', e.notes.join(' · ')));
      const acts = el('div', 'lib-acts');
      const use = el('button', 'lab-mini lib-use', 'Usar'); use.addEventListener('click', () => useEntry(e));
      const tg = el('button', 'lab-mini', '#'); tg.title = 'Tus hashtags';
      tg.addEventListener('click', async () => { const v = prompt('Tus hashtags para este shader (separados por espacio o coma):', (e.mine || []).join(' ')); if (v === null) return; e.mine = cleanTags(v); await put(e); paint(); });
      acts.append(use, tg);
      if (e.url) { const a = el('a', 'lab-mini', '↗'); a.href = e.url; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Abrir en Shadertoy'; acts.append(a); }
      const x = el('button', 'lab-mini', '✕'); x.title = 'Borrar de la librería';
      x.addEventListener('click', async () => { if (!confirm(`¿Borrar «${e.name}» de la librería?`)) return; await del(e.id); paint(); });
      acts.append(x);
      info.append(acts);
      const L = licOf(e);
      const lb = el('p', 'lib-lic lic-' + L.kind); lb.textContent = (L.kind === 'free' ? '🟢 ' : L.kind === 'nc' ? '🟡 ' : '⚪ ') + L.name + ' · © ' + (e.author || '—');
      lb.title = L.kind === 'free' ? 'Licencia libre: se puede usar también en shows pagos, citando al autor' : L.kind === 'nc' ? 'No comercial: para usos pagos, pedile permiso al autor' : 'Sin licencia clara: tratalo como restringido';
      info.append(lb);
      card.append(info);
      grid.append(card);
    }
  }
  function open() { E().closePops(); pop.hidden = false; paint(); }
  function close() { pop.hidden = true; }

  /* ── Bookmarklet: runs on shadertoy.com, copies the shader you are looking at ── */
  const BOOKMARKLET = `(()=>{try{const g=window.gShaderToy,o={nodrus:'shadertoy',url:location.href.split('?')[0].split('#')[0],passes:[]};o.id=(location.pathname.match(/view\\/(\\w+)/)||[])[1];const t=s=>{const e=document.querySelector(s);return e?e.textContent.trim():''};const i=g&&(g.mInfo||g.mShaderInfo||(g.mEffect&&g.mEffect.mInfo));o.id=o.id||(i&&i.id);o.name=(i&&i.name)||t('#shaderTitle')||document.title.replace(/\\s*-\\s*Shadertoy.*$/i,'');o.author=(i&&(i.username||i.author))||t('#shaderAuthorName')||t('#shaderAuthor a');o.description=(i&&i.description)||t('#shaderDescription');o.tags=(i&&i.tags)||[...document.querySelectorAll('#shaderTags a')].map(a=>a.textContent.trim());const P=g&&g.mEffect&&g.mEffect.mPasses;if(P&&P.length)P.forEach(p=>p&&o.passes.push({type:p.mType||p.type||'',name:p.mName||'',code:p.mSource||p.mCode||'',inputs:(p.mInputs||[]).filter(Boolean).map(x=>({type:(x.mInfo&&(x.mInfo.mType||x.mInfo.type))||x.mType||'?',channel:x.mInfo&&x.mInfo.channel}))}));if(!o.passes.some(p=>p.code)){const c=document.querySelector('.CodeMirror');const v=c&&c.CodeMirror?c.CodeMirror.getValue():'';if(v)o.passes=[{type:'image',name:'Image',code:v,inputs:[]}]}if(!o.passes.some(p=>p.code)){alert('NODRUS: no encontré el código en esta página');return}const s=JSON.stringify(o);navigator.clipboard.writeText(s).then(()=>alert('NODRUS: «'+o.name+'» copiado. En NODRUS: 📚 Librería → Pegar de Shadertoy'),()=>prompt('NODRUS: copiá este texto y pegalo en la librería',s))}catch(e){alert('NODRUS: '+e.message)}})()`;
  $('#libBookmark').href = 'javascript:' + encodeURIComponent(BOOKMARKLET).replace(/%20/g, ' ');
  $('#libBookmark').addEventListener('click', e => { e.preventDefault(); E().toast('Arrastrá este botón a tu barra de marcadores (no hace falta hacer clic acá)'); });

  /* ── Wiring ── */
  async function pasteFromClipboard() {
    let txt = '';
    try { txt = await navigator.clipboard.readText(); } catch (e) { /* no permission: use the box */ }
    if (!txt) { showManual(); E().toast('Pegá el texto copiado en el cuadro (Ctrl+V)'); return; }
    await importText(txt);
  }
  async function importText(txt, extra) {
    txt = String(txt || '').trim();
    try {
      if (txt.startsWith('{')) { await importData(JSON.parse(txt), extra && extra.mine); return true; }
      if (/mainImage|vec3\s+effect\s*\(/.test(txt)) {
        await importData({ name: (extra && extra.name) || 'Mi shader', author: (extra && extra.author) || '', url: (extra && extra.url) || '', tags: extra && extra.tags, license: extra && extra.license,
          id: extra && extra.url && (extra.url.match(/shadertoy\.com\/view\/(\w+)/) || [])[1], passes: [{ type: 'image', code: txt, inputs: [] }] }, extra && extra.mine);
        return true;
      }
      E().toast('Eso no parece un shader: tiene que tener mainImage (Shadertoy) o effect()', true);
    } catch (e) { E().toast('No se pudo importar: ' + String(e.message || e).slice(0, 120), true); }
    return false;
  }
  function showManual() { $('#libManual').hidden = false; $('#libCode').focus(); }
  $('#btnLib').addEventListener('click', e => { e.stopPropagation(); pop.hidden ? open() : close(); });
  $('#libClose').addEventListener('click', close);
  $('#libSearch').addEventListener('input', e => { filter.q = e.target.value; paint(); });
  $('#libOnlyOk').addEventListener('change', e => { filter.onlyOk = e.target.checked; paint(); });
  $('#libFav').addEventListener('change', e => { filter.fav = e.target.checked; paint(); });
  $('#libFree').addEventListener('change', e => { filter.free = e.target.checked; paint(); });
  $('#libColISF').addEventListener('click', importVidvox);
  $('#libClear').addEventListener('click', () => { filter.tags.clear(); filter.q = ''; $('#libSearch').value = ''; paint(); });
  $('#libPaste').addEventListener('click', pasteFromClipboard);
  $('#libNew').addEventListener('click', showManual);
  $('#libManualCancel').addEventListener('click', () => { $('#libManual').hidden = true; });
  $('#libManualOk').addEventListener('click', async () => {
    const extra = { name: $('#libName').value.trim(), author: $('#libAuthor').value.trim(), url: $('#libUrl').value.trim(), tags: $('#libTagsIn').value, mine: $('#libMine').value };
    if (extra.url && /shadertoy\.com/.test(extra.url)) extra.license = LICENSE_ST;
    if (await importText($('#libCode').value, extra)) { $('#libManual').hidden = true; ['#libCode', '#libName', '#libAuthor', '#libUrl', '#libTagsIn', '#libMine'].forEach(s => { $(s).value = ''; }); }
  });
  // save the code of the GLSL node being edited
  $('#codeToLib').addEventListener('click', async () => {
    const code = $('#codeArea').value;
    const name = prompt('Nombre para la librería:', 'Mi shader'); if (name === null) return;
    const tags = prompt('Hashtags (separados por espacio):', '') || '';
    await importData({ name, author: '', passes: [{ type: 'image', code, inputs: [] }], tags: [] }, tags);
  });
  // export / import the whole library (to move it between the web and the desktop app)
  $('#libExport').addEventListener('click', async () => {
    const list = await all();
    const blob = new Blob([JSON.stringify({ nodrusLibrary: 1, shaders: list }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.download = `nodrus_libreria_${Date.now()}.json`; a.href = URL.createObjectURL(blob); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#libImportFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      const list = Array.isArray(d.shaders) ? d.shaders : [];
      for (const s of list) if (s && s.id && typeof s.code === 'string') await put({ ...s, tags: cleanTags(s.tags), mine: cleanTags(s.mine) });
      E().toast(`📚 ${list.length} shaders importados`); paint();
    } catch (er) { E().toast('Ese archivo no es una librería de NODRUS', true); }
  });
  $('#libImportBtn').addEventListener('click', () => $('#libImportFile').click());
  addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) close(); });

  window.NodrusLibrary = { open, close, importText, importData, all, paint, BOOKMARKLET, detectLicense, isfToEntry, importISF, licOf };
})();
