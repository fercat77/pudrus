/* PUDRUS · theme. The dark one is the default; the light one is chosen with the button this script adds to the nav
   and is remembered in this browser. Loaded in <head>, before the page paints, so a light page never flashes dark. */
(function () {
  'use strict';
  var KEY = 'pudrus_theme', root = document.documentElement, btn = null;
  function saved() { try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; } }
  function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function label() {
    if (!btn) return;
    var light = current() === 'light', t = window.pudrusT;
    var txt = light ? (t ? t('nav.themeDark', 'Cambiar al tema oscuro') : 'Cambiar al tema oscuro') : (t ? t('nav.themeLight', 'Cambiar al tema claro') : 'Cambiar al tema claro');
    btn.title = txt; btn.setAttribute('aria-label', txt); btn.setAttribute('aria-pressed', light ? 'true' : 'false');
  }
  function apply(theme) {
    if (theme === 'light') root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', theme === 'light' ? '#3c444d' : '#050508');   // the browser's own bar matches the nav
    label();
  }
  apply(saved());

  function addButton() {
    var nav = document.querySelector('nav'); if (!nav || btn) return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'nav-theme';
    btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg>';
    btn.addEventListener('click', function () {
      var next = current() === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: it lasts for this page only */ }
      apply(next);
    });
    var box = nav.querySelector('.nav-lang');
    if (box) box.insertBefore(btn, box.firstChild); else nav.appendChild(btn);
    label();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
  document.addEventListener('pudrus:i18n', label);   // the tooltip follows the language
  // another tab of the site changed it: follow
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(saved()); });
  // a page restored from the back/forward cache keeps the theme it had: bring it up to date
  window.addEventListener('pageshow', function (e) { if (e.persisted) apply(saved()); });
})();
