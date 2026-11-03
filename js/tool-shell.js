/*
 * PUDRUS tool shell
 * -----------------
 * Shared UI + plumbing for image tools. A tool only declares its controls,
 * presets and a render() function; the shell handles:
 *   - loading (button, drag & drop, paste, image sent from another tool)
 *   - fast preview at reduced resolution, full resolution only on export
 *   - crop presets with drag-to-move on the image
 *   - hold-to-compare with the original
 *   - presets, randomize, reset (double-click a label resets one control)
 *   - save (native share sheet on phones, download on desktop)
 *   - "continue in Flyer Forge" handoff
 *
 * Usage:
 *   PudrusTool.create({
 *     id: 'glitch', i18n: 'glitch', icon: '▓',
 *     name: 'Glitch FX', desc: '...',
 *     controls: [{ key, label, type: 'range'|'toggle', min, max, step, value, unit, advanced, rand: [min,max] }],
 *     presets:  [{ label, values: { key: value } }],
 *     render({ src, out, W, H, p, seed }) { ... write pixels into out (ImageData) ... }
 *   });
 *
 * render() must be resolution independent (express sizes relative to W/H) so the
 * preview and the exported file look the same.
 */
(function () {
  const PREVIEW_MAX = window.matchMedia('(max-width: 768px)').matches ? 1100 : 1600;
  const FULL_MAX = 4096;       // cap for exports (protects phone memory)
  const HANDOFF_MAX = 2048;    // cap for images passed to another tool (sessionStorage limit)
  const WORKFLOW_KEY = 'pudrus_workflow_image';

  const CROPS = [
    { id: 'free', label: 'shell.cropFree', fb: 'Free' },
    { id: '1:1', label: 'shell.cropSquare', fb: '1:1' },
    { id: '4:5', label: 'shell.cropPortrait', fb: '4:5' },
    { id: '9:16', label: 'shell.cropStory', fb: '9:16' },
    { id: '16:9', label: 'shell.cropWide', fb: '16:9' },
  ];

  const t = (k, fb, vars) => (window.pudrusT ? window.pudrusT(k, fb, vars) : fb);

  // Small seeded PRNG (mulberry32) so random effects stay stable while you tweak sliders
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) e.append(c);
    return e;
  }

  function fitSize(w, h, max) {
    const s = Math.min(1, max / Math.max(w, h));
    return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
  }

  function create(cfg) {
    const ns = cfg.i18n || cfg.id;
    const defaults = Object.fromEntries(cfg.controls.map(c => [c.key, c.value]));
    const state = {
      p: { ...defaults },
      seed: (Math.random() * 1e9) | 0,
      full: null,        // HTMLCanvasElement with the source at (capped) full resolution
      src: null,         // ImageData of the source at preview resolution
      crop: 'free',
      cropCenter: { x: 0.5, y: 0.5 },
      comparing: false,
    };

    // ── DOM ──────────────────────────────────────────────
    document.body.classList.add('ts-page');
    const root = document.getElementById('tool') || document.body.appendChild(el('main', { id: 'tool' }));

    const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'ts-file', 'aria-hidden': 'true', tabindex: '-1' });
    const canvas = el('canvas', { class: 'ts-canvas' });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const statusEl = el('div', { class: 'ts-status', role: 'status', 'aria-live': 'polite' });
    const badge = el('div', { class: 'ts-badge', 'data-i18n': 'shell.original', text: 'Original' });
    const empty = el('button', { class: 'ts-empty', type: 'button', onclick: () => fileInput.click() }, [
      el('span', { class: 'ts-empty-icon', text: cfg.icon || '◈' }),
      el('span', { class: 'ts-empty-title', 'data-i18n': 'shell.emptyTitle', text: 'Load an image' }),
      el('span', { class: 'ts-empty-hint', 'data-i18n': 'shell.emptyHint', text: 'Tap to choose, drop a file or paste (Ctrl+V)' }),
    ]);
    const stage = el('section', { class: 'ts-stage' }, [empty, canvas, badge, statusEl]);

    // Controls
    const inputs = {};
    function controlRow(c) {
      const label = el('label', { for: 'ctl-' + c.key, 'data-i18n': c.label, text: c.fallback || c.key, title: t('shell.resetHint', 'Double-click to reset') });
      label.addEventListener('dblclick', () => setValue(c.key, defaults[c.key], true));
      if (c.type === 'toggle') {
        const input = el('input', { type: 'checkbox', id: 'ctl-' + c.key, class: 'ts-switch', role: 'switch' });
        input.checked = !!state.p[c.key];
        input.addEventListener('change', () => { state.p[c.key] = input.checked; schedule(); });
        inputs[c.key] = { c, input };
        return el('div', { class: 'ts-row ts-row-toggle' }, [label, input]);
      }
      const val = el('output', { class: 'ts-val', for: 'ctl-' + c.key });
      const input = el('input', { type: 'range', id: 'ctl-' + c.key, min: c.min, max: c.max, step: c.step || 1, value: state.p[c.key] });
      input.addEventListener('input', () => { state.p[c.key] = parseFloat(input.value); showVal(c.key); schedule(); });
      inputs[c.key] = { c, input, val };
      return el('div', { class: 'ts-row' }, [el('div', { class: 'ts-row-head' }, [label, val]), input]);
    }
    function showVal(key) {
      const { c, val } = inputs[key];
      if (val) val.textContent = (c.format ? c.format(state.p[key]) : state.p[key]) + (c.unit || '');
    }
    function setValue(key, v, render) {
      state.p[key] = v;
      const { input } = inputs[key];
      if (input.type === 'checkbox') input.checked = !!v; else { input.value = v; showVal(key); }
      if (render) schedule();
    }

    const presetBar = cfg.presets && cfg.presets.length
      ? el('div', { class: 'ts-presets' }, cfg.presets.map(pr =>
          el('button', { type: 'button', class: 'ts-chip', 'data-i18n': pr.label, text: pr.fallback || pr.label,
            onclick: () => { for (const k of Object.keys(defaults)) setValue(k, k in pr.values ? pr.values[k] : defaults[k]); state.seed = (Math.random() * 1e9) | 0; schedule(); } })))
      : null;

    const basicPanel = el('div', { class: 'ts-panel', 'data-panel': 'basic' },
      [presetBar, ...cfg.controls.filter(c => !c.advanced).map(controlRow)]);
    const advPanel = el('div', { class: 'ts-panel', 'data-panel': 'advanced', hidden: '' },
      cfg.controls.filter(c => c.advanced).map(controlRow));
    const cropChips = CROPS.map(cr => el('button', { type: 'button', class: 'ts-chip' + (cr.id === 'free' ? ' is-on' : ''), 'data-crop': cr.id, 'data-i18n': cr.label, text: cr.fb,
      onclick: () => setCrop(cr.id) }));
    const cropPanel = el('div', { class: 'ts-panel', 'data-panel': 'crop', hidden: '' }, [
      el('div', { class: 'ts-presets' }, cropChips),
      el('p', { class: 'ts-note', 'data-i18n': 'shell.cropHint', text: 'Drag on the image to move the crop.' }),
    ]);
    const extraPanel = el('div', { class: 'ts-more' }, [
      el('button', { type: 'button', class: 'ts-link', 'data-i18n': 'shell.reset', text: 'Reset', onclick: reset }),
      cfg.noFlyer ? null : el('button', { type: 'button', class: 'ts-link', 'data-i18n': 'shell.sendFlyer', text: '→ Continue in Flyer Forge', onclick: sendToFlyer }),
    ]);

    const tabs = [['basic', 'shell.tabBasic', 'Adjust'], ['advanced', 'shell.tabAdvanced', 'Advanced'], ['crop', 'shell.tabCrop', 'Crop']]
      .filter(([id]) => id !== 'advanced' || cfg.controls.some(c => c.advanced));
    const tabBar = el('div', { class: 'ts-tabs', role: 'tablist' }, tabs.map(([id, key, fb], i) =>
      el('button', { type: 'button', role: 'tab', class: 'ts-tab' + (i === 0 ? ' is-on' : ''), 'data-tab': id, 'data-i18n': key, text: fb,
        onclick: () => {
          tabBar.querySelectorAll('.ts-tab').forEach(b => b.classList.toggle('is-on', b.dataset.tab === id));
          [basicPanel, advPanel, cropPanel].forEach(p => { p.hidden = p.dataset.panel !== id; });
        } })));

    const btn = (icon, key, fb, opts = {}) => el('button', { type: 'button', class: 'ts-btn' + (opts.primary ? ' ts-btn-primary' : ''), ...opts.attrs }, [
      el('span', { class: 'ts-btn-icon', 'aria-hidden': 'true', text: icon }),
      el('span', { class: 'ts-btn-label', 'data-i18n': key, text: fb }),
    ]);
    const loadBtn = btn('⤒', 'shell.load', 'Load');
    const randBtn = btn('⚄', 'shell.random', 'Random');
    const cmpBtn = btn('◐', 'shell.compare', 'Compare', { attrs: { 'data-i18n-title': 'shell.compareHint' } });
    const saveBtn = btn('⤓', 'shell.save', 'Save', { primary: true });
    const bar = el('div', { class: 'ts-bar' }, [loadBtn, randBtn, cmpBtn, saveBtn]);

    const side = el('aside', { class: 'ts-side' }, [
      el('header', { class: 'ts-head' }, [
        el('a', { href: '../../index.html#tools', class: 'ts-back', 'data-i18n': 'shell.back', text: '← Tools' }),
        el('h1', { 'data-i18n': ns + '.name', text: cfg.name }),
        el('p', { class: 'ts-desc', 'data-i18n': ns + '.desc', text: cfg.desc || '' }),
      ]),
      tabBar,
      el('div', { class: 'ts-panels' }, [basicPanel, advPanel, cropPanel, extraPanel]),
      bar,
    ]);

    root.className = 'ts';
    root.append(stage, side, fileInput);
    Object.keys(inputs).forEach(k => inputs[k].val && showVal(k));
    setDisabled(true);

    // ── Loading ──────────────────────────────────────────
    loadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) load(fileInput.files[0]); fileInput.value = ''; });
    stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('is-drag'); });
    stage.addEventListener('dragleave', () => stage.classList.remove('is-drag'));
    stage.addEventListener('drop', e => {
      e.preventDefault(); stage.classList.remove('is-drag');
      const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
      if (f) load(f);
    });
    window.addEventListener('paste', e => {
      const item = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/'));
      if (item) load(item.getAsFile());
    });

    function load(source) {
      status(t('shell.loading', 'Loading…'));
      const img = new Image();
      const url = typeof source === 'string' ? source : URL.createObjectURL(source);
      img.onload = () => {
        if (typeof source !== 'string') URL.revokeObjectURL(url);
        const [fw, fh] = fitSize(img.naturalWidth, img.naturalHeight, FULL_MAX);
        const full = document.createElement('canvas');
        full.width = fw; full.height = fh;
        full.getContext('2d').drawImage(img, 0, 0, fw, fh);
        state.full = full;

        const [pw, ph] = fitSize(fw, fh, PREVIEW_MAX);
        canvas.width = pw; canvas.height = ph;
        ctx.drawImage(full, 0, 0, pw, ph);
        state.src = ctx.getImageData(0, 0, pw, ph);
        stage.classList.add('has-image');
        setDisabled(false);
        render();
        status(`${img.naturalWidth} × ${img.naturalHeight}px`);
      };
      img.onerror = () => status(t('shell.loadError', 'Could not open that image'));
      img.src = url;
    }

    function setDisabled(d) {
      [randBtn, cmpBtn, saveBtn].forEach(b => { b.disabled = d; });
    }

    // ── Rendering ────────────────────────────────────────
    let queued = false;
    function schedule() {
      if (queued || !state.src) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; render(); });
    }

    function runRender(srcData) {
      const W = srcData.width, H = srcData.height;
      const out = new ImageData(W, H);
      cfg.render({ src: srcData, out, W, H, p: state.p, seed: state.seed, rng: rng(state.seed) });
      return out;
    }

    function render() {
      if (!state.src) return;
      if (state.comparing) ctx.putImageData(state.src, 0, 0);
      else ctx.putImageData(runRender(state.src), 0, 0);
      drawCropOverlay(ctx, canvas, cropRect(canvas.width, canvas.height));
    }

    // ── Crop ─────────────────────────────────────────────
    function cropRect(W, H) {
      if (state.crop === 'free') return null;
      const [a, b] = state.crop.split(':').map(Number);
      const target = a / b;
      let w = W, h = H;
      if (W / H > target) w = H * target; else h = W / target;
      const x = Math.min(W - w, Math.max(0, state.cropCenter.x * W - w / 2));
      const y = Math.min(H - h, Math.max(0, state.cropCenter.y * H - h / 2));
      return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    }
    function setCrop(id) {
      state.crop = id;
      state.cropCenter = { x: 0.5, y: 0.5 };
      cropChips.forEach(c => c.classList.toggle('is-on', c.dataset.crop === id));
      stage.classList.toggle('is-cropping', id !== 'free');
      render();
    }
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      if (state.crop === 'free' || !state.src) return;
      drag = { x: e.clientX, y: e.clientY, c: { ...state.cropCenter } };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const r = canvas.getBoundingClientRect();
      state.cropCenter = {
        x: Math.min(1, Math.max(0, drag.c.x + (e.clientX - drag.x) / r.width)),
        y: Math.min(1, Math.max(0, drag.c.y + (e.clientY - drag.y) / r.height)),
      };
      schedule();
    });
    ['pointerup', 'pointercancel'].forEach(ev => canvas.addEventListener(ev, () => { drag = null; }));

    // ── Compare (hold) ───────────────────────────────────
    const startCmp = e => { if (!state.src) return; e.preventDefault(); state.comparing = true; stage.classList.add('is-comparing'); render(); };
    const endCmp = () => { if (!state.comparing) return; state.comparing = false; stage.classList.remove('is-comparing'); render(); };
    cmpBtn.addEventListener('pointerdown', startCmp);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => cmpBtn.addEventListener(ev, endCmp));
    cmpBtn.addEventListener('contextmenu', e => e.preventDefault());
    cmpBtn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') startCmp(e); });
    cmpBtn.addEventListener('keyup', endCmp);

    // ── Random / reset ───────────────────────────────────
    randBtn.addEventListener('click', () => {
      for (const c of cfg.controls) {
        if (c.rand === false) continue;
        if (c.type === 'toggle') { setValue(c.key, Math.random() < (c.randChance || 0.3)); continue; }
        const [lo, hi] = c.rand || [c.min, c.max];
        const step = c.step || 1;
        setValue(c.key, Math.round((lo + Math.random() * (hi - lo)) / step) * step);
      }
      state.seed = (Math.random() * 1e9) | 0;
      schedule();
    });
    function reset() {
      for (const k of Object.keys(defaults)) setValue(k, defaults[k]);
      setCrop('free');
    }

    // ── Export ───────────────────────────────────────────
    function renderFull() {
      const { full } = state;
      const data = full.getContext('2d').getImageData(0, 0, full.width, full.height);
      const out = document.createElement('canvas');
      out.width = full.width; out.height = full.height;
      out.getContext('2d').putImageData(runRender(data), 0, 0);
      const cr = cropRect(full.width, full.height);
      if (!cr) return out;
      const c = document.createElement('canvas');
      c.width = cr.w; c.height = cr.h;
      c.getContext('2d').drawImage(out, cr.x, cr.y, cr.w, cr.h, 0, 0, cr.w, cr.h);
      return c;
    }

    saveBtn.addEventListener('click', () => {
      if (!state.full) return;
      status(t('shell.exporting', 'Rendering full resolution…'));
      setDisabled(true);
      setTimeout(() => {   // let the status paint before the heavy work
        const out = renderFull();
        out.toBlob(async blob => {
          setDisabled(false);
          const name = `pudrus_${cfg.id}_${Date.now()}.png`;
          const file = new File([blob], name, { type: 'image/png' });
          const touch = window.matchMedia('(pointer: coarse)').matches;
          if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file] }); status(t('shell.saved', 'Saved')); return; }
            catch (err) { if (err.name === 'AbortError') { status(''); return; } }
          }
          const a = document.createElement('a');
          a.download = name;
          a.href = URL.createObjectURL(blob);
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);
          status(t('shell.savedSize', 'Saved {w} × {h}px', { w: out.width, h: out.height }));
        }, 'image/png');
      }, 30);
    });

    function sendToFlyer() {
      if (!state.full) { status(t('shell.needImage', 'Load an image first')); return; }
      const out = renderFull();
      const [w, h] = fitSize(out.width, out.height, HANDOFF_MAX);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(out, 0, 0, w, h);
      try { sessionStorage.setItem(WORKFLOW_KEY, c.toDataURL('image/png')); }
      catch (e) { sessionStorage.setItem(WORKFLOW_KEY, c.toDataURL('image/jpeg', 0.9)); }
      location.href = '../flyer-forge/index.html';
    }

    // ── Misc ─────────────────────────────────────────────
    let statusTimer;
    function status(msg) {
      statusEl.textContent = msg;
      statusEl.classList.toggle('is-on', !!msg);
      clearTimeout(statusTimer);
      if (msg) statusTimer = setTimeout(() => statusEl.classList.remove('is-on'), 3500);
    }
    // Labels created from JS need translating again after the language loads
    document.addEventListener('pudrus:i18n', () => {
      document.querySelectorAll('.ts-row label').forEach(l => l.title = t('shell.resetHint', 'Double-click to reset'));
    });

    // Image sent from another tool
    const incoming = typeof receiveImage === 'function' ? receiveImage() : null;
    if (incoming) load(incoming);

    return { state, render: schedule };
  }

  window.PudrusTool = { create };
})();
