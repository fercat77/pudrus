/* DRUS · Trazos — draw and guess, in a Duelo room (online). Everyone draws once, in turns: the one who draws picks one
   of three words and draws it; the others type what they think it is. The first to guess gets 10, then 8, 6, 5…, and
   the one drawing 3 for each who guesses; halfway and near the end a letter is shown. The room's host runs the game:
   every drawing and guess goes through it (and is checked there); the word only reaches whoever may see it. */
(function () {
  'use strict';
  const D = window.drusDuel, J = window.__juegos; if (!D || !D.api || !J) return;
  const A = D.api, el = J.el, tr = J.tr;
  const PICK_S = 15, DRAW_S = 80, SHOW_S = 5, MAXLEN = 40, MAXPTS = 6000;
  const COLORS = ['#111111', '#e53935', '#1e88e5', '#43a047', '#fdd835', '#fb8c00', '#8e24aa', '#6d4c41', '#ffffff'];
  const SIZES = [3, 8, 18];   // stroke widths in a 400-px-wide drawing
  const CW = 800, CH = 600;   // the drawing is 4:3 everywhere; points travel as 0–1
  // things you can draw (and say) — everyday, no brands
  const WORDS_ES = ('casa,árbol,sol,luna,estrella,nube,lluvia,arcoíris,montaña,río,playa,isla,volcán,flor,hoja,cactus,hongo,manzana,banana,pera,' +
    'uva,frutilla,sandía,limón,zanahoria,tomate,pizza,hamburguesa,helado,torta,pan,queso,huevo,mate,café,taza,cuchara,tenedor,botella,vaso,' +
    'perro,gato,pez,pájaro,vaca,caballo,chancho,oveja,conejo,ratón,elefante,jirafa,león,mono,serpiente,tortuga,araña,mariposa,abeja,caracol,' +
    'pulpo,ballena,tiburón,pingüino,búho,dinosaurio,dragón,robot,fantasma,sirena,auto,bicicleta,moto,avión,barco,tren,colectivo,cohete,' +
    'globo,paraguas,anteojos,sombrero,zapato,remera,pantalón,guante,reloj,llave,candado,puerta,ventana,escalera,silla,mesa,cama,lámpara,' +
    'televisor,teléfono,computadora,auriculares,guitarra,piano,tambor,trompeta,micrófono,cámara,libro,lápiz,tijera,regla,mochila,carta,' +
    'regalo,vela,corona,espada,escudo,castillo,puente,faro,carpa,fogata,mapa,brújula,ancla,pelota,arco,raqueta,patineta,trofeo,medalla,' +
    'corazón,ojo,nariz,boca,mano,pie,diente,cerebro,esqueleto,bebé,payaso,pirata,bruja,rey,astronauta,bombero,doctor,cocinero,nieve,' +
    'muñeco de nieve,tormenta,rayo,tornado,fuego,hielo,semáforo,ambulancia,hospital,escuela,iglesia,ciudad,granja,jardín,huerta,bosque,' +
    'desierto,cascada,pirámide,ovni,planeta,tierra,telescopio,imán,batería,foco,enchufe,martillo,clavo,serrucho,tornillo,escoba,balde,' +
    'jabón,ducha,inodoro,cepillo de dientes,peine,espejo,cartera,billetera,moneda,dado,cartas,ajedrez,rompecabezas,cometa,hamaca,tobogán,' +
    'calesita,nadar,correr,saltar,dormir,bailar,cantar,llorar,reír,pescar,cocinar,leer,volar').split(',').map(s => s.trim()).filter(Boolean);
  const WORDS_EN = ('house,tree,sun,moon,star,cloud,rain,rainbow,mountain,river,beach,island,volcano,flower,leaf,cactus,mushroom,apple,banana,pear,grapes,strawberry,watermelon,lemon,carrot,tomato,pizza,burger,ice cream,cake,bread,cheese,egg,coffee,cup,spoon,fork,bottle,glass,dog,cat,fish,bird,cow,horse,pig,sheep,rabbit,mouse,elephant,giraffe,lion,monkey,snake,turtle,spider,butterfly,bee,snail,octopus,whale,shark,penguin,owl,dinosaur,dragon,robot,ghost,mermaid,car,bicycle,motorbike,plane,boat,train,bus,rocket,balloon,umbrella,glasses,hat,shoe,shirt,trousers,glove,watch,key,padlock,door,window,ladder,chair,table,bed,lamp,television,phone,computer,headphones,guitar,piano,drum,trumpet,microphone,camera,book,pencil,scissors,ruler,backpack,letter,present,candle,crown,sword,shield,castle,bridge,lighthouse,tent,campfire,map,compass,anchor,ball,goal,racket,skateboard,trophy,medal,heart,eye,nose,mouth,hand,foot,tooth,brain,skeleton,baby,clown,pirate,witch,king,astronaut,firefighter,doctor,chef,snow,snowman,storm,lightning,tornado,fire,ice,traffic light,ambulance,hospital,school,church,city,farm,garden,forest,desert,waterfall,pyramid,ufo,planet,earth,telescope,magnet,battery,light bulb,plug,hammer,nail,saw,screw,broom,bucket,soap,shower,toilet,toothbrush,comb,mirror,handbag,wallet,coin,dice,cards,chess,puzzle,kite,hammock,slide,carousel,swim,run,jump,sleep,dance,sing,cry,laugh,fish,cook,read,fly').split(',').map(s => s.trim()).filter(Boolean);
  const WORDS = [...new Set(J.EN ? WORDS_EN : WORDS_ES)];   // the words of whoever created the room (guesses go in that language)
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  function lev(a, b) {   // edit distance (for «¡cerca!»)
    if (Math.abs(a.length - b.length) > 1) return 2;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  const maskOf = (w, shown) => [...w].map((ch, i) => (ch === ' ' ? ' ' : shown.has(i) ? ch : '_')).join('');
  const num = x => typeof x === 'number' && Number.isFinite(x);
  const S = () => A.S;
  const myId = () => (S() ? (S().mode === 'host' ? 'host' : S().me) : '');
  const isHost = () => !!S() && S().mode === 'host';

  /* ═════════ the host runs the game ═════════ */
  let H = null;
  // to: nothing = everyone (this screen too) · '!id' = everyone but them · 'id' = only them
  function out(m, to) {
    const st = S(); if (!st || st.mode !== 'host') return;
    if (to === undefined || to.startsWith('!')) {
      const ex = to ? to.slice(1) : null;
      st.conns.forEach((c, id) => { if (id !== ex) A.hostSend(id, m); });
      if (ex !== 'host') recv(m);
    } else if (to === 'host') recv(m);
    else A.hostSend(to, m);
  }
  const present = id => !!S() && S().players.some(p => p.id === id);
  const nameOf = id => { const p = S() && S().players.find(x => x.id === id); return p ? p.name : '?'; };
  function clearTimers() { if (!H) return; H.timers.forEach(clearTimeout); H.timers = []; }
  function start() {
    const st = S();
    H = { order: st.players.map(p => p.id), turn: -1, pts: {}, used: new Set(), timers: [], phase: '', chat: [] };
    H.order.forEach(id => { H.pts[id] = 0; });
    nextTurn();
  }
  function pick3() {
    let pool = WORDS.filter(w => !H.used.has(w));
    if (pool.length < 3) { H.used.clear(); pool = WORDS.slice(); }
    const a = []; while (a.length < 3) { const w = pool[Math.floor(Math.random() * pool.length)]; if (!a.includes(w)) a.push(w); }
    a.forEach(w => H.used.add(w));
    return a;
  }
  function nextTurn() {
    if (!H) return;
    clearTimers();
    do { H.turn++; } while (H.turn < H.order.length && !present(H.order[H.turn]));
    if (H.turn >= H.order.length || S().players.length < 2) { endGame(); return; }
    const drawer = H.drawer = H.order[H.turn];
    Object.assign(H, { word: '', phase: 'pick', guessed: new Set(), strokes: [], shown: new Set(), chat: [], opts: pick3(), until: Date.now() + PICK_S * 1000 });
    out({ t: 'tz-turn', n: H.turn + 1, total: H.order.length, drawer, dname: nameOf(drawer), left: PICK_S, pts: H.pts });
    out({ t: 'tz-words', opts: H.opts }, drawer);
    H.timers.push(setTimeout(() => choose(Math.floor(Math.random() * 3)), PICK_S * 1000));
  }
  function choose(i) {
    if (!H || H.phase !== 'pick') return;
    clearTimers();
    H.word = H.opts[Math.max(0, Math.min(2, i | 0))]; H.phase = 'draw'; H.until = Date.now() + DRAW_S * 1000;
    out({ t: 'tz-go', mask: maskOf(H.word, H.shown), left: DRAW_S }, '!' + H.drawer);
    out({ t: 'tz-go', mask: H.word, word: H.word, left: DRAW_S }, H.drawer);
    [0.5, 0.75].forEach(f => H.timers.push(setTimeout(hint, DRAW_S * 1000 * f)));
    H.timers.push(setTimeout(reveal, DRAW_S * 1000));
  }
  function hint() {   // one more letter (never the last one) for whoever hasn't guessed yet
    if (!H || H.phase !== 'draw') return;
    const hidden = [...H.word].map((c, i) => i).filter(i => H.word[i] !== ' ' && !H.shown.has(i));
    if (hidden.length <= 2) return;
    H.shown.add(hidden[Math.floor(Math.random() * hidden.length)]);
    const mask = maskOf(H.word, H.shown);
    S().players.forEach(p => { if (p.id !== H.drawer && !H.guessed.has(p.id)) out({ t: 'tz-hint', mask }, p.id); });
  }
  function reveal() {
    if (!H || (H.phase !== 'draw' && H.phase !== 'pick')) return;
    clearTimers(); H.phase = 'show';
    out({ t: 'tz-end', word: H.word || '', pts: H.pts, left: SHOW_S });
    H.timers.push(setTimeout(nextTurn, SHOW_S * 1000));
  }
  function endGame() {
    if (!H) return;
    clearTimers();
    const pts = H.pts; H = null;
    const rows = S().players.map(p => ({ id: p.id, name: p.name, score: pts[p.id] || 0, ms: 0 }));
    out({ t: 'tz-over' });
    A.finish(rows);
  }
  function allGuessed() { return S().players.filter(p => p.id !== H.drawer).every(p => H.guessed.has(p.id)); }
  function cleanSeg(m) {   // a piece of a stroke: checked before it is drawn or passed on
    if (!Number.isInteger(m.sid) || m.sid < 0 || m.sid > 1e6 || !COLORS.includes(m.c) || !Number.isInteger(m.w) || m.w < 0 || m.w >= SIZES.length || !Array.isArray(m.p) || m.p.length > 240 || m.p.length % 2) return null;
    const p = m.p.map(v => (num(v) ? Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000 : 0));
    return { t: 'tz-s', sid: m.sid, c: m.c, w: m.w, p };
  }
  function fromGuest(id, m) {
    if (!H || !m || typeof m !== 'object') return;
    if (m.t === 'tz-pick' && id === H.drawer && H.phase === 'pick') choose(m.i);
    else if (m.t === 'tz-s' && id === H.drawer && H.phase === 'draw') {
      const g = cleanSeg(m); if (!g) return;
      const total = H.strokes.reduce((n, s) => n + s.p.length, 0);
      if (total + g.p.length > MAXPTS * 2) return;
      const s = H.strokes.find(x => x.sid === g.sid);
      if (s) s.p.push(...g.p); else H.strokes.push({ sid: g.sid, c: g.c, w: g.w, p: g.p.slice() });
      out(g, '!' + id);
    } else if (m.t === 'tz-undo' && id === H.drawer && Number.isInteger(m.sid)) { H.strokes = H.strokes.filter(x => x.sid !== m.sid); out({ t: 'tz-undo', sid: m.sid }, '!' + id); }
    else if (m.t === 'tz-clear' && id === H.drawer) { H.strokes = []; out({ t: 'tz-clear' }, '!' + id); }
    else if (m.t === 'tz-guess' && id !== H.drawer && H.phase === 'draw' && !H.guessed.has(id) && present(id)) {
      const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAXLEN);
      if (!text) return;
      const g = norm(text), w = norm(H.word);
      if (g === w) {
        const add = [10, 8, 6, 5, 4][H.guessed.size] || 3;
        H.guessed.add(id);
        H.pts[id] = (H.pts[id] || 0) + add; H.pts[H.drawer] = (H.pts[H.drawer] || 0) + 3;
        const line = { t: 'tz-chat', kind: 'ok', id, name: nameOf(id), add, pts: H.pts };
        H.chat.push(line); out(line);
        out({ t: 'tz-word', word: H.word }, id);
        if (allGuessed()) H.timers.push(setTimeout(reveal, 700));
      } else if (w.length >= 4 && lev(g, w) === 1) out({ t: 'tz-chat', kind: 'near', name: '', text }, id);   // only them: the others must not read it
      else { const line = { t: 'tz-chat', kind: 'guess', id, name: nameOf(id), text }; H.chat.push(line); if (H.chat.length > 40) H.chat.shift(); out(line); }
    }
  }
  function joined(id) {   // someone came in during the game: they see the turn as it is (and guess from now on)
    if (!H) return;
    H.pts[id] = H.pts[id] || 0;
    out({ t: 'tz-sync', n: H.turn + 1, total: H.order.length, drawer: H.drawer, dname: nameOf(H.drawer), phase: H.phase, mask: H.phase === 'show' ? H.word : maskOf(H.word, H.shown),
      left: Math.max(0, Math.ceil((H.until - Date.now()) / 1000)), strokes: H.strokes, pts: H.pts, chat: H.chat.slice(-12) }, id);
  }
  function left(id) {
    if (!H) return;
    if (id === H.drawer && (H.phase === 'draw' || H.phase === 'pick')) reveal();
    else if (H.phase === 'draw' && S().players.length >= 2 && allGuessed()) reveal();
    if (S().players.length < 2) endGame();
  }

  /* ═════════ every screen (the host's too) ═════════ */
  let V = null;   // what this screen shows: turn, drawer, mask or word, time, strokes, chat, points
  function recv(m) {
    if (!m || typeof m !== 'object' || !S()) return;
    const T = s => Date.now() + Math.max(0, Math.min(120, num(s) ? s : 0)) * 1000;
    const strokesOf = a => (Array.isArray(a) ? a.slice(0, 600) : []).map(s => cleanSeg({ ...s, p: s && s.p })).filter(Boolean).map(s => ({ sid: s.sid, c: s.c, w: s.w, p: s.p }));
    const ptsOf = o => { const r = {}; if (o && typeof o === 'object') Object.keys(o).slice(0, 12).forEach(k => { if (num(o[k])) r[String(k)] = o[k]; }); return r; };
    switch (m.t) {
      case 'tz-turn':
        V = { n: m.n | 0, total: m.total | 0, drawer: String(m.drawer || ''), dname: A.cleanName(m.dname) || '?', phase: 'pick', mask: '', word: '', until: T(m.left), strokes: [], chat: [], pts: ptsOf(m.pts), opts: null, ok: new Set(), dom: V && V.dom };
        if (V.drawer === myId()) J.tone(660, 0.12, 'triangle');
        break;
      case 'tz-words': if (V && Array.isArray(m.opts)) V.opts = m.opts.slice(0, 3).map(w => String(w).slice(0, 30)); break;
      case 'tz-go': if (!V) return; V.phase = 'draw'; V.mask = String(m.mask || '').slice(0, 40); if (m.word) V.word = String(m.word).slice(0, 40); V.until = T(m.left); V.opts = null; break;
      case 'tz-word': if (V) { V.word = String(m.word || '').slice(0, 40); V.mask = V.word; } break;
      case 'tz-hint': if (V && !V.word) V.mask = String(m.mask || '').slice(0, 40); break;
      case 'tz-s': { if (!V) return; const g = cleanSeg(m); if (!g) return; addSeg(g); return; }
      case 'tz-undo': if (V) { V.strokes = V.strokes.filter(x => x.sid !== m.sid); paintAll(); } return;
      case 'tz-clear': if (V) { V.strokes = []; paintAll(); } return;
      case 'tz-chat':
        if (!V) return;
        V.chat.push({ kind: ['ok', 'near', 'guess'].includes(m.kind) ? m.kind : 'guess', name: A.cleanName(m.name), text: String(m.text || '').slice(0, 60), add: num(m.add) ? m.add : 0 });
        if (V.chat.length > 30) V.chat.shift();
        if (m.kind === 'ok') { V.ok.add(String(m.id || '')); if (m.pts) V.pts = ptsOf(m.pts); (String(m.id) === myId() ? J.okSound : () => J.tone(880, 0.07, 'triangle'))(); }
        break;
      case 'tz-end': if (!V) return; V.phase = 'show'; V.word = String(m.word || '').slice(0, 40); V.pts = ptsOf(m.pts); V.until = T(m.left); V.opts = null; break;
      case 'tz-sync':
        V = { n: m.n | 0, total: m.total | 0, drawer: String(m.drawer || ''), dname: A.cleanName(m.dname) || '?', phase: ['pick', 'draw', 'show'].includes(m.phase) ? m.phase : 'pick', mask: String(m.mask || '').slice(0, 40), word: m.phase === 'show' ? String(m.mask || '') : '',
          until: T(m.left), strokes: strokesOf(m.strokes), chat: (Array.isArray(m.chat) ? m.chat : []).slice(-12).map(c => ({ kind: c.kind === 'ok' ? 'ok' : 'guess', name: A.cleanName(c.name), text: String(c.text || '').slice(0, 60), add: num(c.add) ? c.add : 0 })), pts: ptsOf(m.pts), opts: null, ok: new Set(), dom: V && V.dom };
        break;
      case 'tz-over': V = null; return;
      default: return;
    }
    A.render();
  }
  // what I do: the host handles it here, a guest sends it to the host
  function act(m) { if (isHost()) fromGuest('host', m); else A.toGuestHost(m); }

  /* drawing */
  function ctx() { return V && V.dom ? V.dom.cv.getContext('2d') : null; }
  function strokeSeg(g, s, from) {   // draw the points of stroke s from index `from`
    const w = SIZES[s.w] * CW / 400;
    g.strokeStyle = g.fillStyle = s.c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    const P = s.p;
    if (P.length === 2) { g.beginPath(); g.arc(P[0] * CW, P[1] * CH, w / 2, 0, Math.PI * 2); g.fill(); return; }
    g.beginPath();
    const i0 = Math.max(0, from - 2);
    g.moveTo(P[i0] * CW, P[i0 + 1] * CH);
    for (let i = i0 + 2; i < P.length; i += 2) g.lineTo(P[i] * CW, P[i + 1] * CH);
    g.stroke();
  }
  function paintAll() {
    const g = ctx(); if (!g) return;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, CW, CH);
    V.strokes.forEach(s => strokeSeg(g, s, 0));
  }
  function addSeg(gs) {
    let s = V.strokes.find(x => x.sid === gs.sid), from = 0;
    if (s) { from = s.p.length; s.p.push(...gs.p); } else { s = { sid: gs.sid, c: gs.c, w: gs.w, p: gs.p.slice() }; V.strokes.push(s); }
    const g = ctx(); if (g) strokeSeg(g, s, from);
  }
  let pen = { c: COLORS[0], w: 1 }, sidN = 0, live = null, sendT = 0;
  function bindCanvas(cv) {
    const at = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    const flush = () => {
      clearTimeout(sendT); sendT = 0;
      if (!live || !live.buf.length) return;
      act({ t: 'tz-s', sid: live.s.sid, c: live.s.c, w: live.s.w, p: live.buf.map(v => Math.round(v * 1000) / 1000) });
      live.buf = [];
    };
    cv.addEventListener('pointerdown', e => {
      if (!V || V.phase !== 'draw' || V.drawer !== myId()) return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const [x, y] = at(e);
      const s = { sid: ++sidN, c: pen.c, w: pen.w, p: [x, y] };
      V.strokes.push(s); live = { s, buf: [x, y] };
      const g = ctx(); if (g) strokeSeg(g, s, 0);
      sendT = setTimeout(flush, 40);
    });
    cv.addEventListener('pointermove', e => {
      if (!live || !cv.hasPointerCapture(e.pointerId)) return;
      const [x, y] = at(e), P = live.s.p, lx = P[P.length - 2], ly = P[P.length - 1];
      if (Math.hypot(x - lx, y - ly) < 0.004) return;
      const from = P.length; P.push(x, y); live.buf.push(x, y);
      const g = ctx(); if (g) strokeSeg(g, live.s, from);
      if (live.buf.length >= 200) flush(); else if (!sendT) sendT = setTimeout(flush, 40);
    });
    const end = () => { if (live) { flush(); live = null; } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }

  /* the screen: built once per game, then only updated (the drawing must not be rebuilt) */
  function mount() {
    const b = A.frame('Trazos');
    const root = el('div', 'tz');
    const head = el('div', 'tz-head'), who = el('span', 'tz-who'), mask = el('div', 'tz-mask'), clock = el('span', 'tz-clock');
    head.append(who, mask, clock);
    const wrap = el('div', 'tz-wrap'), cv = el('canvas', 'tz-cv'); cv.width = CW; cv.height = CH;
    const over = el('div', 'tz-over'); wrap.append(cv, over);
    const tools = el('div', 'tz-tools');
    const sw = el('div', 'tz-sw');
    COLORS.forEach(c => { const x = el('button', 'tz-col' + (c === pen.c ? ' on' : '')); x.style.background = c; x.title = c === '#ffffff' ? tr('Goma', 'Eraser') : tr('Color', 'Colour'); if (c === '#ffffff') x.textContent = '⌫'; x.addEventListener('click', () => { pen.c = c; sw.querySelectorAll('.tz-col').forEach(y => y.classList.toggle('on', y === x)); }); sw.append(x); });
    const sz = el('div', 'tz-sz');
    SIZES.forEach((s, i) => { const x = el('button', 'tz-size' + (i === pen.w ? ' on' : '')); const dot = el('i'); dot.style.width = dot.style.height = Math.max(4, s * 0.9) + 'px'; x.append(dot); x.title = [tr('Fino', 'Thin'), tr('Medio', 'Medium'), tr('Grueso', 'Thick')][i]; x.addEventListener('click', () => { pen.w = i; sz.querySelectorAll('.tz-size').forEach(y => y.classList.toggle('on', y === x)); }); sz.append(x); });
    const undo = el('button', 'tz-tool', '↶'); undo.title = tr('Deshacer', 'Undo');
    undo.addEventListener('click', () => { const mine = V && V.strokes.length ? V.strokes[V.strokes.length - 1] : null; if (!mine) return; V.strokes.pop(); paintAll(); act({ t: 'tz-undo', sid: mine.sid }); });
    const clr = el('button', 'tz-tool', '🗑'); clr.title = tr('Borrar todo', 'Clear all');
    clr.addEventListener('click', () => { if (!V || !V.strokes.length) return; V.strokes = []; paintAll(); act({ t: 'tz-clear' }); });
    tools.append(sw, sz, undo, clr);
    const form = el('form', 'tz-guess'), inp = el('input', 'jg-dinput'); inp.maxLength = MAXLEN; inp.placeholder = tr('Escribí lo que creés que es…', 'Type what you think it is…'); inp.autocomplete = 'off'; inp.enterKeyHint = 'send';
    const send = el('button', 'jg-btn primary', tr('Enviar', 'Send')); send.type = 'submit';
    form.append(inp, send);
    form.addEventListener('submit', e => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; act({ t: 'tz-guess', text: t }); inp.value = ''; inp.focus(); });
    const chat = el('div', 'tz-chat'), scores = el('div', 'tz-scores');
    const leave = A.btn(tr('Salir de la sala', 'Leave the room'), 'jg-dleave', () => document.getElementById('dBack').click());   // asks, closes the connection, back to DRUS
    root.append(head, wrap, tools, form, chat, scores, leave);
    b.append(root);
    V.dom = { root, who, mask, clock, cv, over, tools, form, inp, chat, scores };
    bindCanvas(cv);
    paintAll();
  }
  let clockT = 0;
  function tickClock() {
    if (!V || !V.dom || !V.dom.root.isConnected) { clearInterval(clockT); clockT = 0; return; }
    const s = Math.max(0, Math.ceil((V.until - Date.now()) / 1000));
    V.dom.clock.textContent = V.phase === 'show' ? '' : `⏱ ${s}`;
    V.dom.clock.classList.toggle('low', V.phase === 'draw' && s <= 10);
  }
  function render() {
    if (!S()) return;
    if (!V) { const b = A.frame('Trazos'); b.append(el('p', 'jg-dwait', tr('Empezando Trazos…', 'Starting Trazos…'))); return; }
    if (!V.dom || !V.dom.root.isConnected) mount();
    const d = V.dom, me = myId(), drawing = V.drawer === me;
    document.querySelector('#dSub').textContent = tr(`Trazos · turno ${V.n} de ${V.total}`, `Trazos · turn ${V.n} of ${V.total}`);
    d.who.textContent = drawing ? tr('✏️ Dibujás vos', '✏️ You draw') : tr(`✏️ Dibuja ${V.dname}`, `✏️ ${V.dname} draws`);
    d.mask.textContent = V.phase === 'pick' ? '' : drawing || V.word ? (V.word || V.mask) : V.mask;
    d.mask.classList.toggle('known', !!V.word && V.phase !== 'show');
    d.mask.classList.toggle('show', V.phase === 'show');
    d.mask.title = drawing ? tr('Tu palabra (los demás ven las rayitas)', 'Your word (the others see the dashes)') : '';
    // the layer over the drawing: choosing a word, waiting, the answer
    d.over.textContent = ''; d.over.hidden = true;
    if (V.phase === 'pick') {
      d.over.hidden = false;
      if (drawing && V.opts) {
        d.over.append(el('b', '', tr('Elegí qué vas a dibujar', 'Pick what you will draw')));
        const row = el('div', 'tz-opts');
        V.opts.forEach((w, i) => { const x = el('button', 'jg-btn primary', w); x.addEventListener('click', () => { act({ t: 'tz-pick', i }); V.opts = null; d.over.textContent = tr('Un momento…', 'One moment…'); }); row.append(x); });
        d.over.append(row, el('small', '', tr('Si no elegís, va una al azar.', 'If you don’t pick, one goes at random.')));
      } else d.over.append(el('b', '', tr(`${V.dname} está eligiendo qué dibujar…`, `${V.dname} is choosing what to draw…`)));
    } else if (V.phase === 'show') {
      d.over.hidden = false;
      d.over.append(el('small', '', tr('Era', 'It was')), el('b', 'tz-answer', V.word || '—'));
    }
    d.tools.hidden = !(drawing && V.phase === 'draw');
    const canGuess = !drawing && V.phase === 'draw' && !V.word;
    d.form.hidden = drawing || V.phase === 'show' || V.phase === 'pick';
    d.inp.disabled = d.form.querySelector('button').disabled = !canGuess;
    d.inp.placeholder = V.word && !drawing ? tr('¡Adivinaste! Esperá a los demás', 'You got it! Wait for the others') : tr('Escribí lo que creés que es…', 'Type what you think it is…');
    // the last guesses
    d.chat.textContent = '';
    V.chat.slice(-6).forEach(c => {
      const line = el('div', 'tz-line ' + c.kind);
      if (c.kind === 'near') line.textContent = tr(`¡Cerca! «${c.text}» está muy cerca`, `Close! «${c.text}» is very close`);
      else { line.append(el('b', '', c.name + (c.kind === 'ok' ? ' ✓ ' : ': ')), document.createTextNode(c.kind === 'ok' ? tr(`adivinó · +${c.add}`, `guessed it · +${c.add}`) : c.text)); }
      d.chat.append(line);
    });
    d.chat.hidden = !V.chat.length;
    d.chat.scrollTop = d.chat.scrollHeight;
    // points
    d.scores.textContent = '';
    (isHost() ? S().players : (S().lobby ? S().lobby.players : [])).slice().sort((a, b) => (V.pts[b.id] || 0) - (V.pts[a.id] || 0)).forEach(p => {
      const c = el('span', 'tz-pt' + (p.id === V.drawer ? ' drawer' : '') + (V.ok.has(p.id) ? ' ok' : '') + (p.id === me ? ' me' : ''));
      c.append(el('b', '', (p.id === V.drawer ? '✏️ ' : V.ok.has(p.id) ? '✓ ' : '') + p.name), el('i', '', String(V.pts[p.id] || 0)));
      d.scores.append(c);
    });
    if (!clockT) clockT = setInterval(tickClock, 250);
    tickClock();
  }

  window.drusTrazos = { start, fromGuest, joined, left, recv, render, get view() { return V; }, get host() { return H; }, WORDS };
})();
