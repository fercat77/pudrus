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
  function paint() {
    if (!data) return;
    const hist = (data.historias || []).filter(h => h.titulo).slice(0, 4);
    if (!hist.length) return;
    list.textContent = '';
    hist.forEach(h => {
      const li = document.createElement('li');
      const sec = document.createElement('small');
      const medios = new Set((h.fuentes || []).map(f => f.medio)).size;
      sec.textContent = (h.seccion || '') + ' · ' + t('sources', '{n} medios', { n: medios });
      const p = document.createElement('span');
      p.textContent = String(h.titulo).replace(/\.$/, '').replace(/(\d)-(\d)/g, '$1‑$2');   // a score like 1-0 never breaks at the hyphen
      li.append(sec, p);
      list.append(li);
    });
    list.hidden = false;
    const medios = new Set(); (data.historias || []).forEach(h => (h.fuentes || []).forEach(f => medios.add(f.medio)));
    meta.textContent = [t('stories', '{n} historias', { n: (data.historias || []).length }), t('sources', '{n} medios', { n: medios.size }), data.generado ? t('updated', 'Actualizado {t}', { t: ago(data.generado) }) : ''].filter(Boolean).join(' · ');
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
