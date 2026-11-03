// Phone menu (☰) for pages with .nav-toggle
(function () {
  const nav = document.getElementById('nav');
  const btn = nav && nav.querySelector('.nav-toggle');
  if (!btn) return;
  const setOpen = open => { nav.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', open); };
  btn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', e => { if (!nav.contains(e.target)) setOpen(false); });
})();
