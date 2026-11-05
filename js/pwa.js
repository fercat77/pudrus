// PUDRUS as an app: service worker + "Install app" button
(function () {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }

  const t = (k, fb) => (window.pudrusT ? window.pudrusT(k, fb) : fb);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;

  function buttons() { return document.querySelectorAll('[data-install]'); }
  function show(on) { buttons().forEach(b => { b.hidden = !on; }); }

  // Chrome / Edge / Android: the browser offers its own install dialog
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    show(true);
  });
  window.addEventListener('appinstalled', () => { deferred = null; show(false); });

  function toast(text) {
    let el = document.querySelector('.pwa-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pwa-toast';
      el.setAttribute('role', 'status');
      el.addEventListener('click', () => el.classList.remove('is-on'));
      document.body.append(el);
    }
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-on'), 9000);
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-install]');
    if (!b) return;
    e.preventDefault();
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (err) { /* ignore */ }
      deferred = null;
      show(false);
    } else if (ios) {
      toast(t('pwa.iosHint', 'On iPhone: tap Share (the square with an arrow) and then "Add to Home Screen".'));
    }
  });

  // iPhone has no install dialog: show the button with instructions instead
  document.addEventListener('DOMContentLoaded', () => { if (ios && !standalone) show(true); });
})();
