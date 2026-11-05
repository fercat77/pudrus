/* PUDRUS Nodes — example patches.
   node(id, type, x, y, values, params) / link(fromId, output, toId, input) */
(function () {
  const node = (id, type, x, y, v = {}, p = {}) => ({ id, type, x, y, v, p });
  const link = (a, ao, b, bi) => ({ a, ao, b, bi });

  const PRESETS = [
    {
      name: 'Túnel neón',
      graph: {
        nodes: [
          node(1, 'kaleido', 40, 60, { segments: 8, rotate: 0 }),
          node(2, 'polar', 300, 60),
          node(3, 'stripes', 540, 40, { freq: 3, angle: 0, sharp: 0.7, speed: 0.6 }),
          node(4, 'palette', 800, 60, { shift: 0, speed: 0.08 }, { pal: 'neon' }),
          node(5, 'feedback', 1060, 40, { amount: 0.9, zoom: 1.045, rotate: 3, drift: 0 }, { blend: 'max' }),
          node(6, 'output', 1320, 60, { rgb: 0.15, scan: 0, vignette: 0.45, grain: 0.05 }, { react: 'none' }),
        ],
        links: [link(1, 'uv', 2, 'uv'), link(2, 'uv', 3, 'uv'), link(3, 'v', 4, 'v'), link(4, 'c', 5, 'c'), link(5, 'c', 6, 'c')],
      },
    },
    {
      name: 'Nubes ácidas',
      graph: {
        nodes: [
          node(1, 'warp', 40, 60, { amount: 0.6, scale: 2, speed: 0.15 }),
          node(2, 'noise', 300, 60, { scale: 2.5, speed: 0.08, detail: 5 }),
          node(3, 'palette', 560, 60, { shift: 0.2, speed: 0.05 }, { pal: 'vapor' }),
          node(4, 'adjust', 820, 40, { bright: 0, contrast: 1.3, sat: 1.4, hue: 0 }),
          node(5, 'output', 1080, 60, { rgb: 0, scan: 0, vignette: 0.35, grain: 0.06 }, { react: 'none' }),
        ],
        links: [link(1, 'uv', 2, 'uv'), link(2, 'v', 3, 'v'), link(3, 'c', 4, 'c'), link(4, 'c', 5, 'c')],
      },
    },
    {
      name: 'Caleidoscopio de audio',
      graph: {
        nodes: [
          node(1, 'audio', 40, 320, { gain: 1.6 }),
          node(2, 'kaleido', 40, 40, { segments: 6, rotate: 0 }),
          node(3, 'transform', 300, 40, { x: 0, y: 0, scale: 1, rotate: 0, spin: 12 }),
          node(4, 'voronoi', 560, 40, { scale: 6, speed: 0.3 }),
          node(5, 'palette', 820, 60, { shift: 0, speed: 0.04 }, { pal: 'rainbow' }),
          node(6, 'output', 1080, 60, { rgb: 0.35, scan: 0.15, vignette: 0.4, grain: 0.05 }, { react: 'bass' }),
        ],
        links: [link(2, 'uv', 3, 'uv'), link(3, 'uv', 4, 'uv'), link(4, 'dist', 5, 'v'), link(1, 'bass', 5, 'shift'), link(5, 'c', 6, 'c')],
      },
    },
    {
      name: 'Pulso de graves',
      graph: {
        nodes: [
          node(1, 'audio', 40, 60, { gain: 1.5 }),
          node(2, 'math', 300, 60, { a: 0.5, b: 0.5 }, { op: 'mul' }),
          node(3, 'shape', 560, 40, { size: 0.3, soft: 0.01, width: 0.012 }, { kind: 'ring' }),
          node(4, 'ramp', 820, 60, { a: '#050508', b: '#66ff33' }),
          node(5, 'feedback', 1080, 40, { amount: 0.93, zoom: 1.035, rotate: 2, drift: 0 }, { blend: 'max' }),
          node(6, 'output', 1340, 60, { rgb: 0.2, scan: 0.3, vignette: 0.4, grain: 0.04 }, { react: 'level' }),
        ],
        links: [link(1, 'bass', 2, 'a'), link(2, 'v', 3, 'size'), link(3, 'v', 4, 'v'), link(4, 'c', 5, 'c'), link(5, 'c', 6, 'c')],
      },
    },
  ];

  window.PudrusPresets = PRESETS;
})();
