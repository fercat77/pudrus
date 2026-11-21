// PUDRUS · NoticIAs — reads the approved stories (scripts/noticias.gs published as a web app) and draws the front page.
// Everything that comes from the feeds is put on the page as text, never as HTML.
(function () {
  'use strict';
  const main = document.querySelector('.nx');
  if (!main) return;
  const $ = s => main.querySelector('[data-nx-' + s + ']');
  const t = (k, fb, v) => (window.pudrusT ? window.pudrusT('news.' + k, fb, v) : fb.replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? v[x] : m)));

  // same names and weights as scripts/noticias.gs
  const SIGNALS = [
    ['Hueco de curiosidad', 3, '«se supo qué…», «el dato que…»'],
    ['Verbo de catástrofe', 2, '«se desploma», «se hunde»'],
    ['Cita cargada como título', 2, 'una frase polémica entre comillas'],
    ['Cifra más impactante que la real', 2, 'el máximo del día, redondeo para arriba'],
    ['Novedad exagerada', 2, '«acaba de cambiar» algo ya previsto'],
    ['Omite el dato central', 2, 'no dice qué pasó, quién o cuánto'],
    ['Contraste dramático', 1, '«…pero no irá a la cárcel»'],
    ['Pregunta con respuesta conocida', 1, 'una pregunta que la nota ya contesta'],
  ];

  let data = null, filter = '';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const head = s => String(s || '').trim().replace(/\.$/, '').replace(/(\d)-(\d)/g, '$1‑$2');   // no full stop; a score like 1-0 never breaks at the hyphen   // headlines carry no full stop
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '#');
  const level = n => (n >= 6 ? 'h' : n >= 3 ? 'm' : '');

  function ago(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms)) return '';
    const min = Math.round(ms / 60000);
    if (min < 2) return t('now', 'recién');
    if (min < 60) return t('agoMin', 'hace {n} min', { n: min });
    const h = Math.round(min / 60);
    if (h < 48) return t('agoH', 'hace {n} h', { n: h });
    if (h < 24 * 14) return t('agoD', 'hace {n} días', { n: Math.round(h / 24) });
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }

  function led(score) {
    const box = el('span', 'nx-led');
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', t('scoreAria', 'Sensacionalismo: {n} de 10', { n: score }));
    for (let i = 0; i < 10; i++) {
      const on = i < score;
      box.append(el('i', on ? 'on ' + (i >= 6 ? 'h' : i >= 3 ? 'm' : '') : ''));
    }
    box.append(el('em', '', score + '/10'));
    return box;
  }

  function headlines(fuentes) {
    const ol = el('ol', 'nx-heads');
    fuentes.slice().sort((a, b) => (a.puntaje || 0) - (b.puntaje || 0)).forEach(f => {
      const li = el('li');
      const top = el('div', 'nx-src');
      const who = el('span'); who.append(el('b', '', f.medio));
      if (f.publicado) who.append(' · ' + ago(f.publicado));
      top.append(who, led(f.puntaje || 0));
      const a = el('a', 'nx-orig', f.titulo);
      a.href = safeUrl(f.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.append(top, a);
      if (f.senales && f.senales.length) {
        const tags = el('div', 'nx-tags');
        f.senales.forEach(s => { const w = (SIGNALS.find(x => x[0] === s) || [0, 1])[1]; tags.append(el('span', w >= 3 ? 'hot' : '', s + ' +' + w)); });
        li.append(tags);
      }
      ol.append(li);
    });
    return ol;
  }

  function kicker(h) {
    const k = el('div', 'nx-kicker');
    const medios = new Set((h.fuentes || []).map(f => f.medio)).size;
    k.append(el('b', '', h.seccion || ''), el('span', '', t('sources', '{n} medios', { n: medios })));
    const last = (h.fuentes || []).map(f => f.publicado).filter(Boolean).sort().pop();
    if (last) k.append(el('span', '', ago(last)));
    return k;
  }

  function lead(h) {
    const box = $('lead'); box.textContent = '';
    if (!h) return;
    const m = el('div', 'nx-lead-main');
    m.append(kicker(h), el('h2', '', head(h.titulo)), el('p', 'nx-sum', h.resumen));
    if (h.datos && h.datos.length) {
      const dl = el('dl', 'nx-data');
      h.datos.forEach(d => { const w = el('div'); w.append(el('dt', '', d.etiqueta), el('dd', '', d.texto)); dl.append(w); });
      m.append(dl);
    }
    if (h.contexto) m.append(el('p', 'nx-ctx', h.contexto));
    const side = el('aside', 'nx-lead-side');
    side.append(el('h3', 'nx-h3', t('howTitled', 'Cómo lo titularon')), headlines(h.fuentes || []));
    box.append(m, side);
  }

  function card(h) {
    const c = el('article', 'nx-card');
    c.append(kicker(h), el('h2', '', head(h.titulo)), el('p', 'nx-sum', h.resumen));
    if (h.contexto) c.append(el('p', 'nx-ctx', h.contexto));
    const d = el('details');
    const s = el('summary');
    const avg = Math.round(avgScore(h.fuentes || []));
    s.append(el('span', '', t('howTitled', 'Cómo lo titularon')), led(avg));
    s.lastChild.setAttribute('aria-label', t('avgAria', 'Promedio de sensacionalismo: {n} de 10', { n: avg }));
    d.append(s, headlines(h.fuentes || []));
    c.append(d);
    return c;
  }

  const avgScore = fs => (fs.length ? fs.reduce((s, f) => s + (f.puntaje || 0), 0) / fs.length : 0);

  function briefs(list, key = 'briefs') {
    const ol = $(key); ol.textContent = '';
    if (!list.length) { ol.append(el('li', '', t('noBriefs', 'No hay breves por ahora.'))); return; }
    list.forEach(b => {
      const li = el('li');
      const who = el('small', '', b.medio);
      if (key !== 'briefs' && b.publicado) who.append(el('span', 'nx-when', ago(b.publicado)));
      li.append(who);
      const a = el('a', '', head(b.titulo)); a.href = safeUrl(b.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
      if (b.original) a.title = b.original;   // the outlet's own headline
      const body = el('div'); body.append(a);
      if (b.idioma === 'en') body.append(el('span', 'nx-lang', t('inEnglish', 'en inglés')));
      if (b.resumen) body.append(el('p', 'nx-bsum', b.resumen));
      li.append(body); ol.append(li);
    });
  }

  function meter(hist) {
    const by = {};
    hist.forEach(h => (h.fuentes || []).forEach(f => { (by[f.medio] = by[f.medio] || []).push(f.puntaje || 0); }));
    const rows = Object.keys(by).map(m => ({ m, avg: by[m].reduce((a, b) => a + b, 0) / by[m].length, n: by[m].length })).sort((a, b) => a.avg - b.avg || b.n - a.n);
    const ol = $('meter'); ol.textContent = '';
    rows.forEach(r => {
      const li = el('li');
      const bar = el('div', 'nx-bar'); const fill = el('i', level(r.avg)); fill.style.width = Math.max(2, r.avg * 10) + '%'; bar.append(fill);
      bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', t('scoreAria', 'Sensacionalismo: {n} de 10', { n: r.avg.toFixed(1) }));
      const em = el('em', '', r.avg.toFixed(1)); em.append(el('b', '', ' · ' + t('titles', '{n} títulos', { n: r.n })));
      li.append(el('span', '', r.m), bar, em);
      ol.append(li);
    });
  }

  function filters(hist) {
    const box = $('filters'); box.textContent = '';
    const secs = [...new Set(hist.map(h => h.seccion).filter(Boolean))];
    if (secs.length < 2) return;
    ['', ...secs].forEach(s => {
      const b = el('button', 'nx-chip', s || t('all', 'Todas'));
      b.type = 'button'; b.setAttribute('aria-pressed', String(s === filter));
      b.addEventListener('click', () => { filter = s; render(); });
      box.append(b);
    });
  }

  function render() {
    const all = (data.historias || []).filter(h => h.titulo && (!h.estado || h.estado === 'aprobada'));
    const hist = all.filter(h => !filter || h.seccion === filter).sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0) || (b.relevancia || 0) - (a.relevancia || 0));
    const medios = new Set(); all.forEach(h => (h.fuentes || []).forEach(f => medios.add(f.medio)));
    $('meta').textContent = [data.generado ? t('updated', 'Actualizado {t}', { t: ago(data.generado) }) : '', t('stories', '{n} historias', { n: all.length }), t('sources', '{n} medios', { n: medios.size })].filter(Boolean).join(' · ');
    $('demo').hidden = !data.ejemplo;
    const empty = $('empty'); empty.hidden = all.length > 0; empty.textContent = t('empty', 'Todavía no hay noticias publicadas. Volvé en un rato.');
    filters(all);
    lead(hist[0]);
    const grid = $('grid'); grid.textContent = '';
    hist.slice(1).forEach(h => grid.append(card(h)));
    briefs(data.breves || []);
    const sci = data.ciencia || [];
    $('sci-box').hidden = !sci.length;
    if (sci.length) briefs(sci, 'sci');
    const int = data.interior || [];
    $('int-box').hidden = !int.length;
    if (int.length) briefs(int, 'int');
    meter(all);
  }

  function signals() {
    const ul = $('signals'); ul.textContent = '';
    SIGNALS.forEach(([name, w, ex]) => { const li = el('li'); const s = el('span', '', name); s.title = ex; li.append(s, el('b', '', '+' + w)); ul.append(li); });
  }

  async function load() {
    const src = main.dataset.src, example = main.dataset.example;
    const tryUrl = async u => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); };
    try {
      data = src ? await tryUrl(src) : await tryUrl(example);
    } catch (e) {
      data = { historias: [], breves: [] };
      $('empty').hidden = false;
      $('empty').textContent = t('error', 'No se pudieron cargar las noticias. Probá de nuevo en un rato.');
      $('meta').textContent = '';
      return;
    }
    render();
  }

  signals();
  load();
  // the language switch re-runs the static texts; the dynamic ones follow
  const sel = document.getElementById('langSelect');
  if (sel) sel.addEventListener('change', () => setTimeout(() => { if (data) render(); }, 150));
  setInterval(() => { if (data && main.dataset.src) load(); }, 30 * 60 * 1000);   // a page left open keeps up (the news changes 3 times a day)
})();
