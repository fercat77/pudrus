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

  /* ── Use a shader ── */
  function useEntry(e) {
    const src = { name: e.name, author: e.author, url: e.url, license: e.license, lib: e.id };   // the credit travels with the patch
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
  let filter = { q: '', tags: new Set(), onlyOk: false, fav: false };
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
    const shown = list.filter(e => (!filter.onlyOk || e.level !== 'error') && (!filter.fav || e.fav)
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
      if (e.license) info.append(el('p', 'lib-lic', '© ' + (e.author || '—') + ' · ' + e.license));
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

  window.NodrusLibrary = { open, close, importText, importData, all, paint, BOOKMARKLET };
})();
