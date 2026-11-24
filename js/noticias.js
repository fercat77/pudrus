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

  // the two sides of the page (same sections as scripts/noticias.gs)
  const SEC_CULTURA = ['Tecnología', 'Videojuegos', 'Ciencia', 'Arte y cultura'];
  const ejeOf = h => h.eje || (SEC_CULTURA.indexOf(h.seccion) >= 0 ? 'cultura' : 'mundo');
  const TABS = ['cultura', 'mundo'];
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  let tab = TABS.indexOf(location.hash.slice(1)) >= 0 ? location.hash.slice(1) : (TABS.indexOf(store.get('nx_tab')) >= 0 ? store.get('nx_tab') : 'cultura');

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

  function kicker(h, noSec) {
    const k = el('div', 'nx-kicker');
    const medios = new Set((h.fuentes || []).map(f => f.medio)).size;
    if (!noSec) k.append(el('b', '', h.seccion || ''));
    k.append(el('span', '', t('sources', '{n} medios', { n: medios })));
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
    if (h.aca) m.append(aca(h.aca));
    const side = el('aside', 'nx-lead-side');
    if (phone()) {   // on a phone it folds up, like the cards
      const d = el('details'), sm = el('summary'), avg = Math.round(avgScore(h.fuentes || []));
      sm.append(el('h3', 'nx-h3', t('howTitled', 'Cómo lo titularon')), led(avg)); d.append(sm, headlines(h.fuentes || [])); side.append(d);
    } else side.append(el('h3', 'nx-h3', t('howTitled', 'Cómo lo titularon')), headlines(h.fuentes || []));
    box.append(m, side);
  }

  function card(h, noSec) {
    const c = el('article', 'nx-card');
    c.append(kicker(h, noSec), el('h2', '', head(h.titulo)), el('p', 'nx-sum', h.resumen));
    if (h.contexto) c.append(el('p', 'nx-ctx', h.contexto));
    if (h.aca) c.append(aca(h.aca));
    const d = el('details');
    const s = el('summary');
    const avg = Math.round(avgScore(h.fuentes || []));
    s.append(el('span', '', t('howTitled', 'Cómo lo titularon')), led(avg));
    s.lastChild.setAttribute('aria-label', t('avgAria', 'Promedio de sensacionalismo: {n} de 10', { n: avg }));
    d.append(s, headlines(h.fuentes || []));
    c.append(d);
    return c;
  }

  function aca(txt) {   // how a world story may hit Argentina: an AI analysis, and it says so
    const box = el('div', 'nx-aca'), hd = el('div', 'nx-aca-h');
    hd.append(el('b', '', t('aca', 'Cómo pega acá')), el('span', '', t('acaNote', 'análisis de la IA')));
    box.append(hd, el('p', '', txt));
    return box;
  }

  const avgScore = fs => (fs.length ? fs.reduce((s, f) => s + (f.puntaje || 0), 0) / fs.length : 0);

  function briefs(list, withSec) {
    const ol = $('list'); ol.textContent = '';
    if (!list.length) { ol.append(el('li', '', t('noItems', 'No hay notas por ahora.'))); return; }
    list.forEach(b => {
      const li = el('li');
      const who = el('small');
      if (withSec && b.seccion) who.append(el('b', 'nx-isec', b.seccion));
      who.append(document.createTextNode(b.medio));
      if (b.publicado) who.append(el('span', 'nx-when', ago(b.publicado)));
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

  // views: one side (cultura / mundo) at a time; inside it, '' = everything or a section name
  let query = '';
  const fold = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const phone = () => matchMedia('(max-width: 720px)').matches;
  const storyText = h => fold([h.titulo, h.resumen, h.contexto, h.aca, h.seccion, ...(h.datos || []).map(d => d.etiqueta + ' ' + d.texto), ...(h.fuentes || []).map(f => f.medio + ' ' + f.titulo)].join(' '));
  const itemText = b => fold([b.titulo, b.original, b.resumen, b.medio, b.seccion].join(' '));
  const matches = (txt, q) => fold(q).split(/\s+/).filter(Boolean).every(w => txt.includes(w));

  function filters(all, items) {
    const box = $('filters'); box.textContent = '';
    const count = {}; all.concat(items).forEach(h => { if (h.seccion) count[h.seccion] = (count[h.seccion] || 0) + 1; });
    const secs = Object.keys(count).sort((a, b) => count[b] - count[a]);
    const chips = [['', t('all', 'Todas'), all.length + items.length], ...secs.map(x => [x, x, count[x]])];
    chips.forEach(([v, label, n]) => {
      const b = el('button', 'nx-chip', label); b.append(el('b', '', String(n)));
      b.type = 'button'; b.setAttribute('aria-pressed', String(v === filter && !query));
      b.addEventListener('click', () => {
        filter = v; query = ''; $('q').value = ''; render();
        const y = main.querySelector('.nx-head').getBoundingClientRect().bottom + scrollY - 56;   // back to the top of the list
        if (scrollY > y) scrollTo({ top: y, behavior: 'smooth' });
        const nb = [...$('filters').children].find(c => c.getAttribute('aria-pressed') === 'true');
        if (nb) nb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      });
      box.append(b);
    });
  }

  // on a phone a long summary shows four lines and a «seguir leyendo»
  function cutLong(root) {
    if (!root || !phone()) return;
    root.querySelectorAll('.nx-card .nx-sum').forEach(p => {
      const c = p.closest('.nx-card'), ctx = c.querySelector('.nx-ctx');
      p.classList.add('cut');
      if (p.scrollHeight <= p.clientHeight + 4 && !ctx) { p.classList.remove('cut'); return; }
      const b = el('button', 'nx-more', t('more', 'Seguir leyendo') + ' ▾'); b.type = 'button';
      b.addEventListener('click', () => { const open = c.classList.toggle('open'); p.classList.toggle('cut', !open); b.textContent = open ? t('less', 'Ver menos') + ' ▴' : t('more', 'Seguir leyendo') + ' ▾'; });
      p.after(b);
    });
  }

  function tabs(stories) {
    main.querySelectorAll('.nx-tab').forEach(b => {
      const k = b.dataset.tab, on = k === tab;
      b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on);
      const n = stories.filter(h => ejeOf(h) === k).length + (data[k] || []).length;
      b.querySelector('em').textContent = n ? String(n) : '';
    });
  }
  function setTab(k) {
    if (k === tab || TABS.indexOf(k) < 0) return;
    tab = k; filter = ''; query = ''; $('q').value = ''; store.set('nx_tab', k);
    try { history.replaceState(null, '', '#' + k); } catch (e) { /* file:// */ }
    if (data) render();
    const y = main.querySelector('.nx-tabs').getBoundingClientRect().top + scrollY - 70;
    if (scrollY > y) scrollTo({ top: y, behavior: 'smooth' });
  }

  function render() {
    const stories = (data.historias || []).filter(h => h.titulo && (!h.estado || h.estado === 'aprobada'));
    const all = stories.filter(h => ejeOf(h) === tab)
      .sort((a, b) => (b.relevancia || 0) - (a.relevancia || 0));
    const items = (data[tab] || []).filter(b => b.titulo);
    const medios = new Set(); stories.forEach(h => (h.fuentes || []).forEach(f => medios.add(f.medio))); TABS.forEach(k => (data[k] || []).forEach(b => medios.add(b.medio)));
    $('meta').textContent = [data.generado ? t('updated', 'Actualizado {t}', { t: ago(data.generado) }) : '', t('stories', '{n} historias', { n: stories.length }), t('sources', '{n} medios', { n: medios.size })].filter(Boolean).join(' · ');
    $('demo').hidden = !data.ejemplo;
    tabs(stories);
    const empty = $('empty'); empty.hidden = all.length + items.length > 0; empty.textContent = t('emptyTab', 'Todavía no hay noticias en esta parte. Volvé en un rato.');
    filters(all, items);

    const q = query.trim();
    let list = items, stories2;
    if (q) {
      stories2 = all.filter(h => matches(storyText(h), q));
      list = items.filter(b => matches(itemText(b), q));
      const n = stories2.length + list.length;
      const r = $('results'); r.hidden = false;
      r.textContent = n ? (n === 1 ? t('result1', '1 resultado para «{q}»', { q }) : t('results', '{n} resultados para «{q}»', { n, q })) : t('noResults', 'No hay nada sobre «{q}» en esta portada.', { q });
    } else {
      $('results').hidden = true;
      stories2 = all.filter(h => !filter || h.seccion === filter);
      list = items.filter(b => !filter || b.seccion === filter);
    }

    // the lead (not while searching), then the rest grouped by section when everything is shown
    const leadStory = !q && stories2.length ? stories2[0] : null;
    lead(leadStory);
    const grid = $('grid'); grid.textContent = '';
    const rest = leadStory ? stories2.slice(1) : stories2;
    if (!q && !filter && rest.length > 4) {
      const groups = new Map(); rest.forEach(h => { const k = h.seccion || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); });
      const few = phone() ? 3 : Infinity;
      groups.forEach((hs, k) => {
        const hd = el('h2', 'nx-sec', k); hd.append(el('small', '', String(hs.length))); grid.append(hd);
        hs.slice(0, few).forEach(h => grid.append(card(h, true)));
        if (hs.length > few) {   // the rest of the section is one tap away
          const b = el('button', 'nx-all', t('seeAll', 'Ver las {n} de {s}', { n: hs.length, s: k }) + ' →'); b.type = 'button';
          b.addEventListener('click', () => { const chip = [...$('filters').children].find(c => c.firstChild && c.firstChild.textContent === k); if (chip) chip.click(); });
          grid.append(b);
        }
      });
    } else rest.forEach(h => grid.append(card(h)));
    if (q) highlight(grid, q);

    $('list-box').hidden = !list.length && (q || !items.length); if (!$('list-box').hidden) briefs(list, !filter);
    $('meter-box').hidden = !!q || !!filter || !all.length; if (!$('meter-box').hidden) meter(all);
    $('about').hidden = !!q || !!filter;
    if (q) highlight($('list'), q);
    cutLong(main.querySelector('.nx-lead')); cutLong(grid);
  }

  // marks the searched words inside the titles (text nodes only: the page never takes HTML from the feeds)
  function highlight(root, q) {
    const words = fold(q).split(/\s+/).filter(w => w.length > 1); if (!root || !words.length) return;
    root.querySelectorAll('h2:not(.nx-sec), .nx-briefs a, .nx-orig').forEach(node => {
      const tx = node.textContent, f = fold(tx), marks = [];
      if (f.length !== tx.length) return;   // the folded text must line up with the original
      words.forEach(w => { let i = f.indexOf(w); while (i >= 0) { marks.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } });
      if (!marks.length) return;
      marks.sort((a, b) => a[0] - b[0]); const out = []; let at = 0;
      marks.forEach(([a, b]) => { if (a < at) return; out.push(document.createTextNode(tx.slice(at, a))); out.push(el('mark', 'nx-hl', tx.slice(a, b))); at = b; });
      out.push(document.createTextNode(tx.slice(at))); node.textContent = ''; node.append(...out);
    });
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
      data = { historias: [], cultura: [], mundo: [] };
      $('empty').hidden = false;
      $('empty').textContent = t('error', 'No se pudieron cargar las noticias. Probá de nuevo en un rato.');
      $('meta').textContent = '';
      return;
    }
    render();
  }

  signals();
  main.querySelectorAll('.nx-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  addEventListener('hashchange', () => { const k = location.hash.slice(1); if (TABS.indexOf(k) >= 0) setTab(k); });
  load();
  // search as you type
  let qT = 0;
  $('q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { query = e.target.value; if (data) render(); }, 160); });
  $('q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; query = ''; if (data) render(); } if (e.key === 'Enter') e.target.blur(); });
  // a phone: a button to go back up
  const up = el('button', 'nx-top', '↑'); up.type = 'button'; up.title = t('toTop', 'Volver arriba'); up.setAttribute('aria-label', up.title);
  up.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' })); document.body.append(up);
  addEventListener('scroll', () => up.classList.toggle('on', scrollY > 1400), { passive: true });
  let wasPhone = phone(); addEventListener('resize', () => { if (phone() !== wasPhone) { wasPhone = phone(); if (data) render(); } });
  // the language switch re-runs the static texts; the dynamic ones follow
  const sel = document.getElementById('langSelect');
  if (sel) sel.addEventListener('change', () => setTimeout(() => { if (data) render(); }, 150));
  setInterval(() => { if (data && main.dataset.src) load(); }, 30 * 60 * 1000);   // a page left open keeps up (the news changes 3 times a day)
})();
