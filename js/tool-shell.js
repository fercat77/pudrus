/*
 * PUDRUS tool shell
 * -----------------
 * Shared UI + plumbing for every tool. A tool declares its controls, presets and
 * one render function; the shell handles:
 *   - loading (button, drag & drop, paste, image sent from another tool)
 *   - fast preview at reduced resolution, full resolution only on export
 *   - crop presets with drag-to-move on the image
 *   - side-by-side compare with a draggable divider
 *   - undo / redo, settings remembered per tool (localStorage), keyboard shortcuts
 *   - presets, randomize (seeded, so effects stay put while you tweak), reset
 *   - save (native share sheet on phones, download on desktop)
 *   - "Send to…" any other tool (image handed over through sessionStorage)
 *   - generator mode (no input image, output format picker, optional animation)
 *
 * PudrusTool.create({
 *   id, i18n, icon, name, desc,
 *   controls: [
 *     { key, label, fallback, type: 'range' (default) | 'toggle' | 'select' | 'color' | 'text',
 *       min, max, step, value, unit, advanced, rand: [lo, hi] | false, randChance,
 *       options: [{ value, label, fallback }]   // select
 *       show: p => boolean                        // conditional visibility
 *     }
 *   ],
 *   presets: [{ label, fallback, values }],
 *
 *   // one of:
 *   render({ src, out, W, H, p, rng, k })        // pixel tools: write into out (ImageData)
 *   draw({ ctx, src, srcCanvas, W, H, p, rng, k, t }) // canvas tools: draw into ctx
 *
 *   generator: { formats: [{ value, label, fallback, w, h }] },  // no input image
 *   animated: true,                                 // generator only: play/pause + video export
 * });
 *
 * Renders must be resolution independent: k = max(W, H) / 1000, so "10 * k" means
 * "10px on a 1000px image". Preview and export then look the same.
 */
(function () {
  const PHONE = window.matchMedia('(max-width: 768px)').matches;
  const PREVIEW_MAX = PHONE ? 1100 : 1600;
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

  // Tools that accept an image ("Send to…"); folder name, i18n key, fallback name
  const TARGETS = [
    ['glitch', 'tools.glitch.name', 'Glitch FX'], ['dithering', 'tools.dither.name', 'Dithering'],
    ['halftone', 'tools.halftone.name', 'Halftone'], ['triangulation', 'tools.triangulation.name', 'Triangulation'],
    ['crt-bend', 'tools.crt.name', 'CRT Bend'], ['flyer-forge', 'tools.flyer.name', 'Flyer Forge'],
    ['pixel-sort', 'tools.pixel.name', 'Pixel Sorter'], ['ascii-canvas', 'tools.ascii.name', 'ASCII Canvas'],
    ['constellation', 'tools.constellation.name', 'Constellation'], ['camera-fx', 'tools.camera.name', 'Camera FX'],
  ];
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

  // Small seeded PRNG (mulberry32)
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
      if (v === null || v === undefined) continue;
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
    const gen = cfg.generator || null;
    const controls = cfg.controls.slice();
    if (gen) controls.unshift({ key: 'format', label: 'shell.format', fallback: 'Format', type: 'select', options: gen.formats, value: gen.formats[0].value, rand: false });
    const defaults = Object.fromEntries(controls.map(c => [c.key, c.value]));
    const state = {
      p: { ...defaults },
      seed: (Math.random() * 1e9) | 0,
      full: null,        // canvas with the source at (capped) full resolution
      src: null,         // ImageData of the source at preview resolution
      srcCanvas: null,   // canvas with the source at preview resolution
      crop: 'free',
      cropCenter: { x: 0.5, y: 0.5 },
      split: 0,          // 0 = off, otherwise divider position 0..1 (original on the left)
      playing: false,
      time: 0,
    };

    // ── Remembered settings (per tool, this browser only) ─
    const STORE = 'pudrus_tool_' + cfg.id;
    function validValue(c, v) {
      if (c.type === 'toggle') return typeof v === 'boolean';
      if (c.type === 'select') return c.options.some(o => String(o.value) === String(v));
      if (c.type === 'color') return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
      if (c.type === 'text') return typeof v === 'string' && v.length <= 300;
      return typeof v === 'number' && isFinite(v) && v >= +c.min && v <= +c.max;
    }
    let restored = false;
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && saved.p) for (const c of controls) {
        const v = saved.p[c.key];
        if (v === undefined || !validValue(c, v)) continue;
        if (v !== state.p[c.key]) restored = true;
        state.p[c.key] = c.type === 'select' ? c.options.find(o => String(o.value) === String(v)).value : v;
      }
    } catch (e) { /* storage unavailable */ }
    function persist() {
      try { localStorage.setItem(STORE, JSON.stringify({ p: state.p })); } catch (e) { /* private mode */ }
    }

    // ── DOM ──────────────────────────────────────────────
    document.body.classList.add('ts-page');
    const root = document.getElementById('tool') || document.body.appendChild(el('main', { id: 'tool' }));

    const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'ts-file', 'aria-hidden': 'true', tabindex: '-1' });
    const canvas = el('canvas', { class: 'ts-canvas' });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const statusEl = el('div', { class: 'ts-status', role: 'status', 'aria-live': 'polite' });
    const badge = el('div', { class: 'ts-badge', 'data-i18n': 'shell.original', text: 'Original' });
    // Sample photo: "Jellyfish" by Marat Gilyadzinov (Unsplash licence), assets/sample.jpg
    const empty = el('div', { class: 'ts-empty' }, [
      el('button', { class: 'ts-empty-pick', type: 'button', onclick: () => fileInput.click() }, [
        el('span', { class: 'ts-empty-icon', text: cfg.icon || '◈' }),
        el('span', { class: 'ts-empty-title', 'data-i18n': 'shell.emptyTitle', text: 'Load an image' }),
        el('span', { class: 'ts-empty-hint', 'data-i18n': 'shell.emptyHint', text: 'Tap to choose, drop a file or paste (Ctrl+V)' }),
      ]),
      el('button', { class: 'ts-empty-sample', type: 'button', 'data-i18n': 'shell.trySample', text: 'or try it with a sample image', onclick: () => load('../../assets/sample.jpg') }),
    ]);
    const undoBtn = el('button', { type: 'button', class: 'ts-hbtn', 'data-i18n-title': 'shell.undo', title: 'Undo', disabled: '', text: '↶' });
    const redoBtn = el('button', { type: 'button', class: 'ts-hbtn', 'data-i18n-title': 'shell.redo', title: 'Redo', disabled: '', text: '↷' });
    const history = el('div', { class: 'ts-history' }, [undoBtn, redoBtn]);
    const stage = el('section', { class: 'ts-stage' + (gen ? ' has-image' : '') }, [gen ? null : empty, canvas, badge, history, statusEl]);

    // Controls
    const inputs = {};
    let textTimer;
    function controlRow(c) {
      const id = 'ctl-' + c.key;
      const label = el('label', { for: id, 'data-i18n': c.label, text: c.fallback || c.key });
      if (c.type !== 'text') {
        label.title = t('shell.resetHint', 'Double-click to reset');
        label.addEventListener('dblclick', () => setValue(c.key, defaults[c.key], true));
      }
      let row, input, val;
      if (c.type === 'toggle') {
        input = el('input', { type: 'checkbox', id, class: 'ts-switch', role: 'switch' });
        input.checked = !!state.p[c.key];
        input.addEventListener('change', () => changed(c.key, input.checked));
        row = el('div', { class: 'ts-row ts-row-toggle' }, [label, input]);
      } else if (c.type === 'select') {
        input = el('select', { id, class: 'ts-select' }, c.options.map(o =>
          el('option', { value: o.value, 'data-i18n': o.label, text: o.fallback || o.value })));
        input.value = state.p[c.key];
        input.addEventListener('change', () => changed(c.key, input.value));
        row = el('div', { class: 'ts-row' }, [label, input]);
      } else if (c.type === 'color') {
        input = el('input', { type: 'color', id, class: 'ts-color', value: state.p[c.key] });
        input.addEventListener('input', () => changed(c.key, input.value));
        row = el('div', { class: 'ts-row ts-row-toggle' }, [label, input]);
      } else if (c.type === 'text') {
        input = el('input', { type: 'text', id, class: 'ts-text', value: state.p[c.key], 'data-i18n-placeholder': c.placeholder || null, autocomplete: 'off' });
        input.addEventListener('input', () => {
          state.p[c.key] = input.value;
          clearTimeout(textTimer);
          textTimer = setTimeout(schedule, 120);
          markChange();
        });
        row = el('div', { class: 'ts-row' }, [label, input]);
      } else {
        val = el('output', { class: 'ts-val', for: id });
        input = el('input', { type: 'range', id, min: c.min, max: c.max, step: c.step || 1, value: state.p[c.key] });
        input.addEventListener('input', () => { changed(c.key, parseFloat(input.value)); showVal(c.key); });
        row = el('div', { class: 'ts-row ts-row-range' }, [el('div', { class: 'ts-row-head' }, [label, val]), input]);
        touchSlider(row, input, c);
      }
      inputs[c.key] = { c, input, val, row };
      return row;
    }
    // Touch sliders: on phones the native range is not touchable (CSS), so a vertical
    // swipe scrolls the panel and a tap changes nothing. Only a clearly horizontal
    // drag anywhere on the row moves the value, relative to where it was.
    function touchSlider(row, input, c) {
      const min = +c.min, max = +c.max, step = +(c.step || 1);
      const dec = String(step).includes('.') ? String(step).split('.')[1].length : 0;
      let g = null;
      row.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch') return;
        g = { id: e.pointerId, x: e.clientX, y: e.clientY, v: +state.p[c.key], drag: false };
      });
      row.addEventListener('pointermove', e => {
        if (!g || e.pointerId !== g.id) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.drag) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }      // it's a scroll
          if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;               // not sure yet
          g.drag = true;
          g.x = e.clientX;                                                                   // no jump on grab
          try { row.setPointerCapture(e.pointerId); } catch (err) { /* keep dragging without capture */ }
          row.classList.add('is-dragging');
          if (navigator.vibrate) navigator.vibrate(4);
          return;
        }
        const w = input.getBoundingClientRect().width || 1;
        let v = g.v + (e.clientX - g.x) / w * (max - min);
        v = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
        v = +v.toFixed(dec);
        if (v !== state.p[c.key]) { input.value = v; changed(c.key, v); showVal(c.key); }
      });
      const end = e => {
        if (!g || (e && e.pointerId !== g.id)) return;
        g = null;
        row.classList.remove('is-dragging');
      };
      row.addEventListener('pointerup', end);
      row.addEventListener('pointercancel', end);
    }

    function changed(key, v) {
      state.p[key] = v;
      if (key === 'format') resizeGenerator();
      updateVisibility();
      schedule();
      markChange();
    }
    function showVal(key) {
      const { c, val } = inputs[key];
      if (!val) return;
      const v = state.p[key];
      const dec = String(c.step || 1).includes('.') ? String(c.step).split('.')[1].length : 0;
      val.textContent = (c.format ? c.format(v) : Number(v).toFixed(dec)) + (c.unit || '');
    }
    function setValue(key, v, render) {
      state.p[key] = v;
      const { input, c } = inputs[key];
      if (c.type === 'toggle') input.checked = !!v;
      else { input.value = v; showVal(key); }
      if (key === 'format') resizeGenerator();
      if (render) { updateVisibility(); schedule(); markChange(); }
    }
    function updateVisibility() {
      for (const { c, row } of Object.values(inputs)) if (c.show) row.hidden = !c.show(state.p);
    }

    const presetBar = cfg.presets && cfg.presets.length
      ? el('div', { class: 'ts-presets' }, cfg.presets.map(pr =>
          el('button', { type: 'button', class: 'ts-chip', 'data-i18n': pr.label, text: pr.fallback || pr.label,
            onclick: () => {
              for (const c of controls) {
                if (c.type === 'text' || c.key === 'format') continue;  // keep the user's text and format
                setValue(c.key, c.key in pr.values ? pr.values[c.key] : defaults[c.key]);
              }
              state.seed = (Math.random() * 1e9) | 0;
              updateVisibility(); schedule(); markChange();
            } })))
      : null;

    const basicPanel = el('div', { class: 'ts-panel', 'data-panel': 'basic' },
      [presetBar, ...controls.filter(c => !c.advanced).map(controlRow)]);
    const advPanel = el('div', { class: 'ts-panel', 'data-panel': 'advanced', hidden: '' },
      controls.filter(c => c.advanced).map(controlRow));
    const cropChips = CROPS.map(cr => el('button', { type: 'button', class: 'ts-chip' + (cr.id === 'free' ? ' is-on' : ''), 'data-crop': cr.id, 'data-i18n': cr.label, text: cr.fb,
      onclick: () => setCrop(cr.id) }));
    const cropPanel = el('div', { class: 'ts-panel', 'data-panel': 'crop', hidden: '' }, [
      el('div', { class: 'ts-presets' }, cropChips),
      el('p', { class: 'ts-note', 'data-i18n': 'shell.cropHint', text: 'Drag on the image to move the crop.' }),
    ]);
    const videoLink = cfg.animated ? el('button', { type: 'button', class: 'ts-link', 'data-i18n': 'shell.video', text: 'Save 5s video', onclick: recordVideo }) : null;
    const galleryLink = el('a', { class: 'ts-link', 'data-i18n': 'shell.sendGallery', text: '◈ Send to the gallery', hidden: '', target: '_blank', rel: 'noopener noreferrer' });
    const sendMenu = el('div', { class: 'ts-sendmenu', hidden: '' }, TARGETS.filter(([dir]) => !location.pathname.includes('/' + dir + '/')).map(([dir, key, fb]) =>
      el('button', { type: 'button', class: 'ts-chip', 'data-i18n': key, text: fb, onclick: () => sendTo(dir) })));
    const sendLink = el('button', { type: 'button', class: 'ts-link', 'aria-expanded': 'false', 'data-i18n': 'shell.sendTo', text: '→ Send to…',
      onclick: () => { sendMenu.hidden = !sendMenu.hidden; sendLink.setAttribute('aria-expanded', String(!sendMenu.hidden)); } });
    const extraPanel = el('div', { class: 'ts-more' }, [
      el('button', { type: 'button', class: 'ts-link', 'data-i18n': 'shell.reset', text: 'Reset', onclick: reset }),
      videoLink,
      sendLink,
      galleryLink,
      sendMenu,
    ]);
    // "Send to the gallery" shows up only once a submission form is configured in gallery/gallery.json
    fetch('../../gallery/gallery.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(g => {
      if (!g || typeof g.formUrl !== 'string' || !/^https:\/\//.test(g.formUrl)) return;
      galleryLink.href = g.formUrl;
      galleryLink.hidden = false;
    }).catch(() => {});

    const tabs = [['basic', 'shell.tabBasic', 'Adjust'], ['advanced', 'shell.tabAdvanced', 'Advanced'], ['crop', 'shell.tabCrop', 'Crop']]
      .filter(([id]) => (id !== 'advanced' || controls.some(c => c.advanced)) && (id !== 'crop' || !gen));
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
    const loadBtn = gen ? null : btn('⤒', 'shell.load', 'Load');
    const randBtn = btn('⚄', 'shell.random', 'Random');
    const cmpBtn = gen ? null : btn('◐', 'shell.compare', 'Compare', { attrs: { 'data-i18n-title': 'shell.compareHint', 'aria-pressed': 'false' } });
    const playBtn = cfg.animated ? btn('▶', 'shell.play', 'Play') : null;
    const seedBtn = gen && !cfg.animated ? btn('✦', 'shell.newSeed', 'New') : null;
    const saveBtn = btn('⤓', 'shell.save', 'Save', { primary: true });
    const barBtns = [loadBtn, randBtn, cmpBtn, playBtn, seedBtn, saveBtn].filter(Boolean);
    const bar = el('div', { class: 'ts-bar', style: `grid-template-columns: repeat(${barBtns.length}, 1fr)` }, barBtns);

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
    Object.keys(inputs).forEach(showVal);
    updateVisibility();

    // ── Loading ──────────────────────────────────────────
    if (loadBtn) loadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) load(fileInput.files[0]); fileInput.value = ''; });
    if (!gen) {
      stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('is-drag'); });
      stage.addEventListener('dragleave', () => stage.classList.remove('is-drag'));
      stage.addEventListener('drop', e => {
        e.preventDefault(); stage.classList.remove('is-drag');
        const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
        if (f) load(f);
      });
      window.addEventListener('paste', e => {
        if (e.target && e.target.matches && e.target.matches('input[type=text]')) return;
        const item = [...((e.clipboardData || {}).items || [])].find(i => i.type.startsWith('image/'));
        if (item) load(item.getAsFile());
      });
    }

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
        setPreviewSource(pw, ph, c => c.drawImage(full, 0, 0, pw, ph));
        stage.classList.add('has-image');
        setDisabled(false);
        render();
        status(`${img.naturalWidth} × ${img.naturalHeight}px`);
      };
      img.onerror = () => status(t('shell.loadError', 'Could not open that image'));
      img.src = url;
    }

    function setPreviewSource(w, h, paint) {
      const sc = document.createElement('canvas');
      sc.width = w; sc.height = h;
      const sctx = sc.getContext('2d', { willReadFrequently: true });
      paint(sctx);
      state.srcCanvas = sc;
      state.src = sctx.getImageData(0, 0, w, h);
      canvas.width = w; canvas.height = h;
    }

    // Generator: blank source of the chosen format
    function genSize() {
      const f = gen.formats.find(f => f.value === state.p.format) || gen.formats[0];
      return [f.w, f.h];
    }
    function resizeGenerator() {
      if (!gen) return;
      const [w, h] = fitSize(...genSize(), PREVIEW_MAX);
      setPreviewSource(w, h, () => {});
    }

    function setDisabled(d) {
      [randBtn, cmpBtn, saveBtn].forEach(b => { if (b) b.disabled = d; });
      stage.classList.toggle('has-history', !d);
    }

    // ── Rendering ────────────────────────────────────────
    let queued = false;
    function schedule() {
      if (queued || !state.src) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; render(); });
    }

    // Renders the tool at the size of srcData into a new canvas
    function runRender(srcData, srcCanvas) {
      const W = srcData.width, H = srcData.height;
      const args = { src: srcData, srcCanvas, W, H, p: state.p, seed: state.seed, rng: rng(state.seed), k: Math.max(W, H) / 1000, t: state.time };
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const octx = out.getContext('2d');
      if (cfg.draw) {
        cfg.draw({ ...args, ctx: octx });
      } else {
        const data = new ImageData(W, H);
        cfg.render({ ...args, out: data });
        octx.putImageData(data, 0, 0);
      }
      return out;
    }

    function render() {
      if (!state.src) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(runRender(state.src, state.srcCanvas), 0, 0);
      if (state.split) {
        // original on the left of the divider, effect on the right
        const x = Math.round(state.split * canvas.width);
        ctx.putImageData(state.src, 0, 0, 0, 0, x, canvas.height);
        const px = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);   // canvas px per screen px
        ctx.save();
        ctx.fillStyle = '#66ff33';
        ctx.fillRect(x - px, 0, 2 * px, canvas.height);
        const cy = canvas.height / 2, r = 16 * px;
        ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#050508';
        ctx.beginPath();
        ctx.moveTo(x - 9 * px, cy); ctx.lineTo(x - 3 * px, cy - 6 * px); ctx.lineTo(x - 3 * px, cy + 6 * px); ctx.closePath();
        ctx.moveTo(x + 9 * px, cy); ctx.lineTo(x + 3 * px, cy - 6 * px); ctx.lineTo(x + 3 * px, cy + 6 * px); ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
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
      if (!state.src) return;
      if (state.split) {
        drag = { split: true };
        moveSplit(e);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        return;
      }
      if (state.crop === 'free') return;
      drag = { x: e.clientX, y: e.clientY, c: { ...state.cropCenter } };
      canvas.setPointerCapture(e.pointerId);
    });
    function moveSplit(e) {
      const r = canvas.getBoundingClientRect();
      state.split = Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width));
      schedule();
    }
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      if (drag.split) { moveSplit(e); return; }
      const r = canvas.getBoundingClientRect();
      state.cropCenter = {
        x: Math.min(1, Math.max(0, drag.c.x + (e.clientX - drag.x) / r.width)),
        y: Math.min(1, Math.max(0, drag.c.y + (e.clientY - drag.y) / r.height)),
      };
      schedule();
    });
    ['pointerup', 'pointercancel'].forEach(ev => canvas.addEventListener(ev, () => { drag = null; }));

    // ── Compare: side-by-side split, drag on the image to move the divider ─
    function toggleSplit(on) {
      if (!state.src || !cmpBtn) return;
      state.split = on === undefined ? (state.split ? 0 : 0.5) : (on ? state.split || 0.5 : 0);
      cmpBtn.classList.toggle('is-on', !!state.split);
      cmpBtn.setAttribute('aria-pressed', String(!!state.split));
      stage.classList.toggle('is-split', !!state.split);
      if (state.split) status(t('shell.splitHint', 'Drag on the image to move the divider'));
      render();
    }
    if (cmpBtn) cmpBtn.addEventListener('click', () => toggleSplit());

    // ── Undo / redo ──────────────────────────────────────
    // One snapshot per pause in editing (a whole slider drag is a single step)
    const snap = () => ({ p: { ...state.p }, seed: state.seed });
    let hist = [snap()], hIndex = 0, hTimer = null;
    function commitHistory() {
      hTimer = null;
      const sn = snap();
      if (JSON.stringify(sn) === JSON.stringify(hist[hIndex])) return;
      hist = hist.slice(0, hIndex + 1);
      hist.push(sn);
      if (hist.length > 60) hist.shift();
      hIndex = hist.length - 1;
      updateHistoryUI();
    }
    function markChange() {
      clearTimeout(hTimer);
      hTimer = setTimeout(() => { commitHistory(); persist(); }, 450);
    }
    function applySnap(sn) {
      for (const c of controls) if (c.key in sn.p) setValue(c.key, sn.p[c.key]);
      state.seed = sn.seed;
      updateVisibility(); schedule(); persist();
    }
    function undo() {
      if (hTimer) { clearTimeout(hTimer); commitHistory(); }
      if (hIndex <= 0) return;
      hIndex--; applySnap(hist[hIndex]); updateHistoryUI();
    }
    function redo() {
      if (hIndex >= hist.length - 1) return;
      hIndex++; applySnap(hist[hIndex]); updateHistoryUI();
    }
    function updateHistoryUI() {
      undoBtn.disabled = hIndex <= 0;
      redoBtn.disabled = hIndex >= hist.length - 1;
    }
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // ── Animation (generators) ───────────────────────────
    let lastFrame = 0;
    function tick(now) {
      if (!state.playing) return;
      if (lastFrame) state.time += Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      render();
      requestAnimationFrame(tick);
    }
    function setPlaying(on) {
      state.playing = on;
      if (!playBtn) return;
      playBtn.querySelector('.ts-btn-icon').textContent = on ? '❚❚' : '▶';
      const lbl = playBtn.querySelector('.ts-btn-label');
      lbl.setAttribute('data-i18n', on ? 'shell.pause' : 'shell.play');
      lbl.textContent = on ? t('shell.pause', 'Pause') : t('shell.play', 'Play');
      if (on) { lastFrame = 0; requestAnimationFrame(tick); }
    }
    if (playBtn) playBtn.addEventListener('click', () => setPlaying(!state.playing));
    if (seedBtn) seedBtn.addEventListener('click', () => { state.seed = (Math.random() * 1e9) | 0; schedule(); });

    function recordVideo() {
      if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
        status(t('shell.videoUnsupported', 'Video export is not supported in this browser'));
        return;
      }
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
        .find(m => MediaRecorder.isTypeSupported(m)) || '';
      const rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
      const chunks = [];
      const wasPlaying = state.playing;
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (!wasPlaying) setPlaying(false);
        const type = rec.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type });
        deliver(blob, `pudrus_${cfg.id}_${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, t('shell.videoSaved', 'Video saved'));
      };
      status(t('shell.recording', 'Recording 5 seconds…'));
      if (!state.playing) setPlaying(true);
      rec.start();
      setTimeout(() => rec.stop(), 5000);
    }

    // ── Random / reset ───────────────────────────────────
    randBtn.addEventListener('click', () => {
      for (const c of controls) {
        if (c.rand === false || c.type === 'text' || (c.type === 'color' && !c.rand)) continue;
        if (c.type === 'toggle') { setValue(c.key, Math.random() < (c.randChance || 0.3)); continue; }
        if (c.type === 'select') { const o = c.options[Math.floor(Math.random() * c.options.length)]; setValue(c.key, o.value); continue; }
        if (c.type === 'color') { setValue(c.key, '#' + ((Math.random() * 0xffffff) | 0).toString(16).padStart(6, '0')); continue; }
        const [lo, hi] = c.rand || [c.min, c.max];
        const step = c.step || 1;
        setValue(c.key, +(Math.round((lo + Math.random() * (hi - lo)) / step) * step).toFixed(6));
      }
      state.seed = (Math.random() * 1e9) | 0;
      updateVisibility();
      schedule();
      markChange();
    });
    function reset() {
      for (const c of controls) if (c.type !== 'text') setValue(c.key, defaults[c.key]);
      updateVisibility();
      if (gen) { resizeGenerator(); render(); } else setCrop('free');
      markChange();
    }

    // ── Export ───────────────────────────────────────────
    function renderFull() {
      let data, srcCanvas;
      if (gen) {
        const [w, h] = fitSize(...genSize(), FULL_MAX);
        srcCanvas = document.createElement('canvas');
        srcCanvas.width = w; srcCanvas.height = h;
        data = new ImageData(w, h);
      } else {
        srcCanvas = state.full;
        data = state.full.getContext('2d').getImageData(0, 0, state.full.width, state.full.height);
      }
      const out = runRender(data, srcCanvas);
      const cr = cropRect(out.width, out.height);
      if (!cr) return out;
      const c = document.createElement('canvas');
      c.width = cr.w; c.height = cr.h;
      c.getContext('2d').drawImage(out, cr.x, cr.y, cr.w, cr.h, 0, 0, cr.w, cr.h);
      return c;
    }

    async function deliver(blob, name, okMsg) {
      const file = new File([blob], name, { type: blob.type });
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); status(okMsg); return; }
        catch (err) { if (err.name === 'AbortError') { status(''); return; } }
      }
      const a = document.createElement('a');
      a.download = name;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      status(okMsg);
    }

    saveBtn.addEventListener('click', () => {
      if (!state.src) return;
      status(t('shell.exporting', 'Rendering full resolution…'));
      setDisabled(true);
      setTimeout(() => {   // let the status paint before the heavy work
        let out;
        try { out = renderFull(); }
        catch (err) { console.error(err); setDisabled(false); status(t('shell.exportError', 'Could not render, try a smaller image')); return; }
        out.toBlob(blob => {
          setDisabled(false);
          deliver(blob, `pudrus_${cfg.id}_${Date.now()}.png`, t('shell.savedSize', 'Saved {w} × {h}px', { w: out.width, h: out.height }));
        }, 'image/png');
      }, 30);
    });

    function sendTo(dir) {
      if (!state.src) { status(t('shell.needImage', 'Load an image first')); return; }
      if (hTimer) { clearTimeout(hTimer); commitHistory(); persist(); }
      const out = renderFull();
      const [w, h] = fitSize(out.width, out.height, HANDOFF_MAX);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(out, 0, 0, w, h);
      try { sessionStorage.setItem(WORKFLOW_KEY, c.toDataURL('image/png')); }
      catch (e) { sessionStorage.setItem(WORKFLOW_KEY, c.toDataURL('image/jpeg', 0.9)); }
      location.href = '../' + dir + '/index.html';
    }

    // ── Misc ─────────────────────────────────────────────
    let statusTimer;
    function status(msg) {
      statusEl.textContent = msg;
      statusEl.classList.toggle('is-on', !!msg);
      clearTimeout(statusTimer);
      if (msg) statusTimer = setTimeout(() => statusEl.classList.remove('is-on'), 3500);
    }
    document.addEventListener('pudrus:i18n', () => {
      document.querySelectorAll('.ts-row label[title]').forEach(l => { l.title = t('shell.resetHint', 'Double-click to reset'); });
      if (playBtn) setPlaying(state.playing);
      shortcutTitles();
      if (cfg.onLanguage) { cfg.onLanguage(); schedule(); }
    });
    // ── Keyboard shortcuts (desktop) ─────────────────────
    document.addEventListener('keydown', e => {
      const typing = e.target && e.target.matches && e.target.matches('input[type=text], textarea, select');
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); if (!saveBtn.disabled) saveBtn.click(); return; }
      if (mod && k === 'o' && !gen) { e.preventDefault(); fileInput.click(); return; }
      if (typing) return;
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) { e.preventDefault(); redo(); return; }
      if (mod || e.altKey || (e.target && e.target.matches && e.target.matches('input, button'))) return;
      if (k === 'r' && !randBtn.disabled) randBtn.click();
      else if (k === 'c' && cmpBtn && !cmpBtn.disabled) toggleSplit();
    });
    function shortcutTitles() {
      saveBtn.title = t('shell.save', 'Save') + ' (' + MOD + '+S)';
      randBtn.title = t('shell.random', 'Random') + ' (R)';
      if (cmpBtn) cmpBtn.title = t('shell.compareHint', 'Compare side by side') + ' (C)';
      if (loadBtn) loadBtn.title = t('shell.load', 'Load') + ' (' + MOD + '+O)';
      undoBtn.title = t('shell.undo', 'Undo') + ' (' + MOD + '+Z)';
      redoBtn.title = t('shell.redo', 'Redo') + ' (' + MOD + '+Shift+Z)';
    }
    shortcutTitles();

    // Web fonts used by a tool may load after the first render
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

    if (gen) {
      resizeGenerator();
      setDisabled(false);
      render();
      if (cfg.autoplay) setPlaying(true);
    } else {
      setDisabled(true);
      const incoming = typeof receiveImage === 'function' ? receiveImage() : null;
      if (incoming) load(incoming);
    }
    if (restored) setTimeout(() => status(t('shell.restored', 'Your last settings were restored')), 600);

    return { state, render: schedule, setValue };
  }

  window.PudrusTool = { create };
})();
