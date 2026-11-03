/*
 * PUDRUS gallery
 * --------------
 * Reads gallery/gallery.json and renders it. Everything stays hidden while the
 * gallery is empty and has no submission form, so nothing half-done is shown.
 *
 * gallery.json:
 * {
 *   "formUrl": "https://forms.gle/...",            // Google Form for submissions
 *   "toolField": "entry.123456",                    // optional: pre-fills the tool question
 *   "toolNames": { "glitch": "Glitch FX", ... },    // tool id -> option text in the form
 *   "items": [{ "file": "img/x.jpg", "thumb": "img/x-thumb.jpg", "author": "@name",
 *               "link": "https://instagram.com/name", "tool": "glitch", "date": "2026-11-03", "alt": "" }]
 * }
 *
 * Markup hooks:
 *   [data-gallery]            grid container (data-limit="8" shows the latest 8)
 *   [data-gallery-section]    hidden while there is nothing to show
 *   [data-gallery-send]       link to the form (hidden without formUrl)
 *   [data-gallery-more]       "see all" link (hidden if everything already fits)
 *   <script src=".../js/gallery.js" data-base="../">  path to the site root
 */
(function () {
  const script = document.currentScript;
  const base = (script && script.dataset.base) || '';
  const t = (k, fb) => (window.pudrusT ? window.pudrusT(k, fb) : fb);

  // tool id (as used in gallery.json) -> i18n key of its name
  const TOOL_KEYS = {
    glitch: 'tools.glitch.name', dithering: 'tools.dither.name', halftone: 'tools.halftone.name',
    triangulation: 'tools.triangulation.name', 'crt-bend': 'tools.crt.name', flyer: 'tools.flyer.name',
    'pixel-sort': 'tools.pixel.name', 'ascii-canvas': 'tools.ascii.name', constellation: 'tools.constellation.name',
    pattern: 'tools.pattern.name',
  };

  let dataPromise = null;
  function load() {
    if (!dataPromise) {
      dataPromise = fetch(base + 'gallery/gallery.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : {}))
        .catch(() => ({}))
        .then(d => {
          const items = Array.isArray(d.items) ? d.items.filter(i => i && typeof i.file === 'string') : [];
          items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
          return { formUrl: typeof d.formUrl === 'string' ? d.formUrl : '', toolField: d.toolField || '', toolNames: d.toolNames || {}, items };
        });
    }
    return dataPromise;
  }

  function formLink(data, tool) {
    if (!data.formUrl) return '';
    if (!tool || !data.toolField || !data.toolNames[tool]) return data.formUrl;
    try {
      const u = new URL(data.formUrl);
      u.searchParams.set('usp', 'pp_url');
      u.searchParams.set(data.toolField, data.toolNames[tool]);
      return u.toString();
    } catch (e) { return data.formUrl; }
  }

  const safeUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');
  const toolName = id => (TOOL_KEYS[id] ? t(TOOL_KEYS[id], id) : id || '');

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;   // user text is never parsed as HTML
    return e;
  }

  // ── Lightbox ───────────────────────────────────────
  let box, boxImg, boxCaption, boxList = [], boxIndex = 0;
  function ensureBox() {
    if (box) return;
    box = el('dialog', 'gallery-box');
    box.tabIndex = -1;   // focus the dialog itself, not the close button
    box.setAttribute('aria-label', t('gallery.title', 'Gallery'));
    const close = el('button', 'gallery-box-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('gallery.close', 'Close'));
    close.addEventListener('click', () => box.close());
    const prev = el('button', 'gallery-box-nav gallery-box-prev', '‹');
    const next = el('button', 'gallery-box-nav gallery-box-next', '›');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', t('gallery.prev', 'Previous'));
    next.setAttribute('aria-label', t('gallery.next', 'Next'));
    prev.addEventListener('click', () => show(boxIndex - 1));
    next.addEventListener('click', () => show(boxIndex + 1));
    boxImg = el('img', 'gallery-box-img');
    boxCaption = el('div', 'gallery-box-caption');
    const figure = el('figure', 'gallery-box-figure');
    figure.append(boxImg, boxCaption);
    box.append(close, prev, figure, next);
    box.addEventListener('click', e => { if (e.target === box) box.close(); });
    box.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') show(boxIndex - 1);
      if (e.key === 'ArrowRight') show(boxIndex + 1);
    });
    // swipe on phones
    let sx = null;
    box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(boxIndex + (dx < 0 ? 1 : -1));
      sx = null;
    });
    document.body.append(box);
  }
  function caption(target, item, linkAuthor) {
    target.textContent = '';
    if (item.author) {
      const by = el('span', 'gallery-by', t('gallery.by', 'by') + ' ');
      const href = safeUrl(item.link);
      let name;
      if (href && linkAuthor) {
        name = el('a', 'gallery-author', item.author);
        name.href = href; name.target = '_blank'; name.rel = 'noopener noreferrer nofollow ugc';
      } else name = el('span', 'gallery-author', item.author);
      by.append(name);
      target.append(by);
    }
    if (item.tool) target.append(el('span', 'gallery-tool', toolName(item.tool)));
  }
  function show(i) {
    if (!boxList.length) return;
    boxIndex = (i + boxList.length) % boxList.length;
    const item = boxList[boxIndex];
    boxImg.src = base + 'gallery/' + item.file;
    boxImg.alt = item.alt || (item.author ? t('gallery.by', 'by') + ' ' + item.author : '');
    caption(boxCaption, item, true);
    box.classList.toggle('is-single', boxList.length < 2);
  }
  function open(list, i) {
    ensureBox();
    boxList = list;
    show(i);
    if (!box.open) { box.showModal(); box.focus(); }
  }

  // ── Grid ───────────────────────────────────────────
  function render(container, data) {
    const limit = parseInt(container.dataset.limit, 10) || 0;
    const items = limit ? data.items.slice(0, limit) : data.items;
    container.textContent = '';
    if (!items.length) {
      container.append(el('p', 'gallery-empty', t('gallery.empty', 'No images yet. Yours could be the first!')));
      return;
    }
    items.forEach((item, i) => {
      const btn = el('button', 'gallery-item');
      btn.type = 'button';
      const img = el('img');
      img.src = base + 'gallery/' + (item.thumb || item.file);
      img.alt = item.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      const cap = el('span', 'gallery-caption');
      caption(cap, item, false);
      btn.append(img, cap);
      btn.addEventListener('click', () => open(data.items, data.items.indexOf(item)));
      container.append(btn);
    });
  }

  async function init() {
    const data = await load();
    const hasSomething = data.items.length > 0 || !!data.formUrl;
    document.querySelectorAll('[data-gallery-section]').forEach(s => { s.hidden = !hasSomething; });
    document.querySelectorAll('[data-gallery-send]').forEach(a => {
      const href = formLink(data, a.dataset.tool);
      a.hidden = !href;
      if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    });
    document.querySelectorAll('[data-gallery]').forEach(c => render(c, data));
    document.querySelectorAll('[data-gallery-more]').forEach(a => {
      const limit = parseInt(a.dataset.galleryMore, 10) || 0;
      a.hidden = !(limit && data.items.length > limit);
    });
  }

  // re-render captions when the language changes (tool names are translated)
  document.addEventListener('pudrus:i18n', () => { if (dataPromise) load().then(d => document.querySelectorAll('[data-gallery]').forEach(c => render(c, d))); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.PudrusGallery = { load, formLink };
})();
