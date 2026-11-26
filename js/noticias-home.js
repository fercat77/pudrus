// PUDRUS · the NoticIAs card on the home page: the first headlines of the day, fetched when the section comes near.
// The text from the feeds goes in as text, never as HTML. Without data the card keeps its static text.
(function () {
  'use strict';
  const box = document.querySelector('[data-news-home]');
  if (!box || !box.dataset.src) return;
  const list = box.querySelector('[data-news-list]'), meta = box.querySelector('[data-news-meta]');
  const t = (k, fb, v) => (window.pudrusT ? window.pudrusT('news.' + k, fb, v) : fb.replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? v[x] : m)));

  function ago(iso) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (!isFinite(min)) return '';
    if (min < 2) return t('now', 'recién');
    if (min < 60) return t('agoMin', 'hace {n} min', { n: min });
    const h = Math.round(min / 60);
    return h < 48 ? t('agoH', 'hace {n} h', { n: h }) : t('agoD', 'hace {n} días', { n: Math.round(h / 24) });
  }

  let data = null;
  // the home shows the «Cultura digital» side (technology, games, science, art): its stories, then its latest loose notes
  const CULT = ['Tecnología', 'Videojuegos', 'Ciencia', 'Arte y cultura'];
  const isCult = h => (h.eje ? h.eje === 'cultura' : CULT.indexOf(h.seccion) >= 0);
  // the front page rotates: when the top story has had nothing new for a few hours, a fresher one among the top few leads,
  // or (if none is fresh) they take turns every 3 h — the same for everyone, so the lead doesn't sit there a whole day
  const rotateLead = list => {
    if (list.length < 2) return list;
    const H = 3600e3, now = Date.now(), newest = h => Math.max(0, ...(h.fuentes || []).map(f => Date.parse(f.publicado) || 0)), fresh = h => now - newest(h) < 4 * H;
    if (fresh(list[0])) return list;
    const pool = list.slice(0, 4); let k = pool.findIndex(fresh);
    if (k < 0) k = Math.floor(now / (3 * H)) % pool.length;
    return k ? [list[k], ...list.slice(0, k), ...list.slice(k + 1)] : list;
  };
  function paint() {
    if (!data) return;
    const hist = rotateLead((data.historias || []).filter(h => h.titulo && isCult(h)).sort((a, b) => (b.relevancia || 0) - (a.relevancia || 0)));
    const rows = hist.slice(0, 4).map(h => ({ sec: (h.seccion || '') + ' · ' + t('sources', '{n} medios', { n: new Set((h.fuentes || []).map(f => f.medio)).size }), title: h.titulo }));
    (data.cultura || []).forEach(b => { if (rows.length < 4 && b.titulo) rows.push({ sec: (b.seccion ? b.seccion + ' · ' : '') + b.medio, title: b.titulo }); });
    if (!rows.length) return;
    list.textContent = '';
    rows.forEach(r => {
      const li = document.createElement('li');
      const sec = document.createElement('small'); sec.textContent = r.sec;
      const p = document.createElement('span');
      p.textContent = String(r.title).replace(/\.$/, '').replace(/(\d)-(\d)/g, '$1‑$2');   // a score like 1-0 never breaks at the hyphen
      li.append(sec, p);
      list.append(li);
    });
    list.hidden = false;
    const n = hist.length + (data.cultura || []).length;
    meta.textContent = [t('tabCult', 'Cultura digital') + ' · ' + t('homeCount', '{n} notas', { n }), data.generado ? t('updated', 'Actualizado {t}', { t: ago(data.generado) }) : ''].filter(Boolean).join(' · ');
  }

  function load() {
    fetch(box.dataset.src).then(r => (r.ok ? r.json() : null)).then(d => { data = d; paint(); }).catch(() => { /* the static text stays */ });
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '600px 0px' });
    io.observe(box);
  } else load();
  const sel = document.getElementById('langSelect');
  if (sel) sel.addEventListener('change', () => setTimeout(paint, 150));
})();
