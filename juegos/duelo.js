/* DRUS · Duelo — the same game for 2 to 6 players at once, and the same board for everyone (the same seed).
   Online: one creates a room, the others join with its 4-letter code, its link or its QR (PeerJS: phone to phone
   through a public broker, no accounts, nothing stored). Or on one device: turns, passing it around (no internet).
   Every message from another device is data: checked, and shown with textContent only. */
(function () {
  'use strict';
  const J = window.__juegos; if (!J) return;
  const $ = s => document.querySelector(s), el = J.el;
  // the games that can be compared: a board from the seed and a score (Garabato, Mil usos and Sudoku stay out)
  const DUEL_GAMES = ['intruso', 'interferencia', 'quesigue', 'destellos', 'eco', 'circuito', 'recorrido'];
  const gameOf = id => J.GAMES.find(g => g.id === id);
  const PEER_JS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  const QR_JS = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ', PREFIX = 'drus-duelo-', MAX = 6, POINTS = [3, 2, 1];
  const cleanName = s => String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const isCode = s => /^[A-Z]{4}$/.test(String(s || '').toUpperCase());
  const num = x => typeof x === 'number' && Number.isFinite(x);
  const dBody = () => $('#dBody');
  let S = null;   // the duel going on: { mode: 'host' | 'guest' | 'local', … }

  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) scripts[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete scripts[src]; rej(new Error('load')); }; document.head.append(s); });
    return scripts[src];
  }
  const myName = () => cleanName(J.store.duelName) || '';
  function setMyName(n) { J.store.duelName = cleanName(n); J.save(); }

  /* ── small pieces ── */
  let toastT;
  function toast(t) {
    let e = $('#dToast'); if (!e) { e = el('div', 'jg-dtoast'); e.id = 'dToast'; document.body.append(e); }
    e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 2600);
  }
  function btn(txt, cls, fn) { const b = el('button', 'jg-btn' + (cls ? ' ' + cls : ''), txt); b.addEventListener('click', fn); return b; }
  function gamePicker(sel, onPick) {
    const row = el('div', 'jg-dgames');
    [...DUEL_GAMES, 'random'].forEach(id => {
      const gm = gameOf(id), b = el('button', 'jg-dgame' + (id === sel ? ' on' : ''), id === 'random' ? '🎲 Al azar' : gm.title);
      if (gm) b.title = gm.desc;
      b.addEventListener('click', () => { row.querySelectorAll('.jg-dgame').forEach(x => x.classList.toggle('on', x === b)); onPick(id); });
      row.append(b);
    });
    return row;
  }
  const pickGame = g => (g === 'random' || !DUEL_GAMES.includes(g) ? DUEL_GAMES[Math.floor(Math.random() * DUEL_GAMES.length)] : g);
  // the best first (high or low score, as the game says); a tie goes to the faster one; who didn't finish, last
  function rankRows(gid, rows) {
    const gm = gameOf(gid), hi = !gm || gm.better !== 'low';
    const done = rows.filter(r => num(r.score)), not = rows.filter(r => !num(r.score));
    done.sort((a, b) => (a.score === b.score ? (a.ms || 0) - (b.ms || 0) : hi ? b.score - a.score : a.score - b.score));
    done.forEach((r, i) => { r.pos = i + 1; r.add = rows.length > 1 ? POINTS[i] || 0 : 0; });
    not.forEach(r => { r.pos = null; r.add = 0; });
    return done.concat(not);
  }
  function table(gid, rows, me) {
    const gm = gameOf(gid), t = el('div', 'jg-dtable');
    rows.forEach(r => {
      const row = el('div', 'jg-drow' + (r.pos === 1 ? ' win' : '') + (me && r.id === me ? ' me' : ''));
      row.append(el('span', 'pos', r.pos ? (r.pos === 1 ? '🏆' : r.pos + '°') : '—'), el('span', 'nm', String(r.name || '?')),
        el('span', 'sc', num(r.score) ? (gm ? gm.fmt(r.score) : String(r.score)) : r.wait ? 'jugando…' : 'no terminó'),
        el('span', 'pt', r.add ? '+' + r.add : ''));
      if (r.text && num(r.score)) row.title = String(r.text).slice(0, 80);
      t.append(row);
    });
    return t;
  }
  function totals(players, me) {
    const box = el('div', 'jg-dplayers');
    [...players].sort((a, b) => (b.pts || 0) - (a.pts || 0)).forEach(p => {
      const c = el('span', 'jg-dchip' + (me && p.id === me ? ' me' : ''));
      c.append(el('b', '', String(p.name || '?')), el('i', '', `${p.pts || 0} pts`));
      if (p.host) c.title = 'Creó la sala';
      box.append(c);
    });
    return box;
  }
  function frame(sub) {
    const b = dBody(); b.textContent = '';
    $('#dSub').textContent = sub || 'de 2 a 6 jugadores';
    return b;
  }
  // back to the duel screen (after a round, or from the hub)
  function enter() {
    $('#hub').hidden = true; $('#play').hidden = true; $('#result').hidden = true; $('#duel').hidden = false;
    document.body.classList.remove('hubmode', 'playmode'); document.body.classList.add('duelmode');
    window.scrollTo(0, 0);
  }
  // play this round's game; the result (or null if you left it) goes to done
  function playRound(gid, seed, label, done) {
    const ok = J.runDuel(gid, seed, label, (r, ms) => { done(r && num(r.score) ? { score: r.score, ms, text: String(r.text || '').slice(0, 80) } : null); },
      () => { done(null); });
    if (!ok) done(null);
  }

  /* ═════════ the menu ═════════ */
  function menu(code) {
    const b = frame();
    const nm = el('input', 'jg-dinput'); nm.maxLength = 16; nm.placeholder = 'Tu nombre'; nm.value = myName(); nm.autocomplete = 'nickname';
    nm.addEventListener('input', () => setMyName(nm.value));
    const lab = el('label', 'jg-dname'); lab.append(el('span', '', 'Tu nombre'), nm);
    b.append(lab);
    const opts = el('div', 'jg-dopts');
    const o1 = el('div', 'jg-dopt');
    o1.append(el('b', '', '📡 Crear una sala'), el('span', '', 'Cada uno en su celular o compu. Les pasás el código, el enlace o el QR.'), btn('Crear sala', 'primary', () => createRoom()));
    const o2 = el('div', 'jg-dopt');
    const ci = el('input', 'jg-dinput jg-dcode'); ci.maxLength = 4; ci.placeholder = 'CÓDIGO'; ci.autocapitalize = 'characters'; ci.value = code || '';
    ci.addEventListener('input', () => { ci.value = ci.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    const jb = btn('Entrar', 'primary', () => { if (!isCode(ci.value)) { toast('El código tiene 4 letras'); ci.focus(); return; } joinRoom(ci.value.toUpperCase()); });
    ci.addEventListener('keydown', e => { if (e.key === 'Enter') jb.click(); });
    const jr = el('div', 'jg-drow2'); jr.append(ci, jb);
    o2.append(el('b', '', '🔑 Unirme a una sala'), el('span', '', 'Escribí el código de 4 letras que te pasaron (o abrí su enlace o QR).'), jr);
    const o3 = el('div', 'jg-dopt');
    o3.append(el('b', '', '📱 Un solo aparato'), el('span', '', 'Se pasan el celular por turnos: el mismo tablero para todos. No hace falta internet.'), btn('Jugar por turnos', '', () => localSetup()));
    opts.append(o1, o2, o3);
    b.append(opts);
    b.append(el('p', 'jg-dnote', 'Juegos del duelo: Intruso, Interferencia, Qué sigue, Destellos, Eco, Circuito y Recorrido. Gana el mejor resultado de cada ronda (3, 2 y 1 puntos); si empatan, el más rápido.'));
    if (code) ci.focus(); else if (!nm.value) nm.focus();
  }
  function needName() {
    if (myName()) return true;
    toast('Poné tu nombre primero');
    const i = $('#dBody .jg-dname input'); if (i) i.focus();
    return false;
  }
  function busy(txt) { const b = frame(); b.append(el('div', 'jg-start', ''), el('p', 'jg-dnote center', txt)); b.firstChild.append(el('div', 'big', '◈')); }

  /* ═════════ online: the host keeps the room, everyone else talks only to the host ═════════ */
  async function createRoom(tries = 0) {
    if (!needName()) return;
    leave(true);
    busy('Creando la sala…');
    try { await loadScript(PEER_JS); } catch (e) { failed('No se pudo conectar (¿hay internet?). Probá «Un solo aparato».'); return; }
    const code = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
    const peer = new window.Peer(PREFIX + code, { debug: 0 });
    const st = S = { mode: 'host', code, peer, me: 'host', players: [{ id: 'host', name: myName(), pts: 0, host: true }], conns: new Map(), game: 'intruso', round: 0, phase: 'lobby', results: {}, roundIds: [], last: null, cur: '' };
    peer.on('open', () => { if (S === st) render(); });
    peer.on('error', e => {
      if (S !== st) return;
      if (e.type === 'unavailable-id' && tries < 4) { peer.destroy(); S = null; createRoom(tries + 1); return; }
      if (e.type === 'peer-unavailable') return;   // a guest that left
      if (st.phase === 'lobby' && st.players.length < 2) failed('No se pudo abrir la sala (' + e.type + '). Probá de nuevo o usá «Un solo aparato».');
      else toast('Problema de conexión: ' + e.type);
    });
    peer.on('disconnected', () => { if (S === st && !peer.destroyed) try { peer.reconnect(); } catch (er) { /* later */ } });
    peer.on('connection', c => {
      c.on('data', m => { if (S === st) hostMsg(c, m); });
      c.on('close', () => { if (S === st) drop(c.peer); });
      c.on('error', () => { if (S === st) drop(c.peer); });
    });
  }
  function hostSend(c, m) { try { if (c.open) c.send(m); } catch (e) { /* closed */ } }
  function hostAll(m) { S.conns.forEach(c => hostSend(c, m)); }
  const lobbyMsg = () => ({ t: 'lobby', code: S.code, phase: S.phase, round: S.round, game: S.game, cur: S.cur,
    players: S.players.map(p => ({ id: p.id, name: p.name, pts: p.pts, host: !!p.host })), last: S.last, wait: S.phase === 'playing' ? roundRows() : null });
  function hostMsg(c, m) {
    if (!m || typeof m !== 'object') return;
    const id = c.peer;
    if (m.t === 'hello') {
      if (S.conns.has(id)) return;
      if (S.players.length >= MAX) { hostSend(c, { t: 'full' }); setTimeout(() => c.close(), 300); return; }
      let name = cleanName(m.name) || 'Jugador';
      const taken = n => S.players.some(p => p.name.toLowerCase() === n.toLowerCase());
      for (let k = 2; taken(name); k++) name = (cleanName(m.name) || 'Jugador').slice(0, 13) + ' ' + k;
      S.conns.set(id, c);
      S.players.push({ id, name, pts: 0 });
      hostSend(c, { t: 'welcome', id, name });
      toast(`${name} entró a la sala`);
      update();
    } else if (m.t === 'res' && S.phase === 'playing' && m.round === S.round && S.roundIds.includes(id) && !S.results[id]) {
      S.results[id] = num(m.score) ? { score: m.score, ms: num(m.ms) ? Math.max(0, m.ms) : 0, text: String(m.text || '').slice(0, 80) } : { score: null };
      announce(id);
      checkEnd();
    } else if (m.t === 'bye') drop(id);
  }
  function drop(id) {
    if (!S || S.mode !== 'host' || !S.conns.has(id)) return;
    const p = S.players.find(x => x.id === id);
    S.conns.delete(id);
    S.players = S.players.filter(x => x.id !== id);
    S.roundIds = S.roundIds.filter(x => x !== id);
    if (p) toast(`${p.name} salió`);
    if (S.phase === 'playing') checkEnd(); else update();
  }
  function update() { hostAll(lobbyMsg()); if (!J.inDuelRound) render(); }
  function announce(id) {   // someone finished: everyone hears it (also while playing)
    const p = S.players.find(x => x.id === id), r = S.results[id], gm = gameOf(S.cur);
    const txt = p ? `${p.name} terminó${r && num(r.score) && gm ? ': ' + gm.fmt(r.score) : ''}` : '';
    hostAll({ t: 'got', text: txt });
    if (txt && id !== 'host') toast(txt);
    update();
  }
  function roundRows() { return S.roundIds.map(id => { const p = S.players.find(x => x.id === id), r = S.results[id]; return { id, name: p ? p.name : '?', score: r ? r.score : null, ms: r ? r.ms : 0, text: r ? r.text : '', wait: !r }; }); }
  function startRound() {
    if (S.players.length < 2) { toast('Esperá a que entre alguien más'); return; }
    S.round++; S.cur = pickGame(S.game); S.results = {}; S.roundIds = S.players.map(p => p.id); S.phase = 'playing';
    const seed = Math.floor(Math.random() * 4294967296);
    hostAll({ t: 'start', round: S.round, game: S.cur, seed });
    hostAll(lobbyMsg());
    const st = S, round = S.round;
    playRound(S.cur, seed, `Sala ${S.code}`, r => {
      if (S !== st || st.round !== round || st.phase !== 'playing') { enter(); render(); return; }
      st.results.host = r || { score: null };
      enter(); announce('host'); checkEnd();
    });
  }
  function checkEnd(force) {
    if (!S || S.mode !== 'host' || S.phase !== 'playing') return;
    if (!force && S.roundIds.some(id => !S.results[id])) { update(); return; }
    const rows = rankRows(S.cur, roundRows().map(r => ({ ...r, wait: false })));
    rows.forEach(r => { const p = S.players.find(x => x.id === r.id); if (p) p.pts += r.add; });
    S.last = { round: S.round, game: S.cur, rows };
    S.phase = 'results';
    // still playing (the round ended without them): they come back to the table
    update();
  }

  /* guests */
  async function joinRoom(code, tries = 0) {
    if (!myName()) setMyName('Jugador');
    leave(true);
    busy(`Entrando a la sala ${code}…`);
    try { await loadScript(PEER_JS); } catch (e) { failed('No se pudo conectar (¿hay internet?).'); return; }
    const peer = new window.Peer({ debug: 0 });
    const st = S = { mode: 'guest', code, peer, conn: null, me: '', lobby: null, round: 0 };
    peer.on('open', () => {
      if (S !== st) return;
      const c = st.conn = peer.connect(PREFIX + code, { reliable: true });
      c.on('open', () => { if (S === st) c.send({ t: 'hello', name: myName() }); });
      c.on('data', m => { if (S === st) guestMsg(m); });
      c.on('close', () => { if (S === st) { const was = st.lobby; S = null; try { peer.destroy(); } catch (e) { /* gone */ } if (J.inDuelRound) J.abortDuel(); enter(); failed(was ? 'La sala se cerró (el que la creó salió).' : `No pude entrar a la sala ${code}.`); } });
    });
    peer.on('error', e => {
      if (S !== st) return;
      if (e.type === 'peer-unavailable') { S = null; try { peer.destroy(); } catch (er) { /* gone */ } failed(`No encontré la sala ${code}: revisá el código (o pedile a quien la creó que la abra de nuevo).`); }
      else if (!st.lobby) { S = null; try { peer.destroy(); } catch (er) { /* gone */ } failed('No se pudo conectar (' + e.type + ').'); }
    });
  }
  function guestMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'welcome' && typeof m.id === 'string') { S.me = m.id; if (cleanName(m.name) && cleanName(m.name) !== myName()) toast(`En esta sala sos «${cleanName(m.name)}»`); }
    else if (m.t === 'full') toast('La sala está llena (6 jugadores)');
    else if (m.t === 'lobby' && Array.isArray(m.players)) { S.lobby = sanitizeLobby(m); if (!J.inDuelRound) render(); }
    else if (m.t === 'got' && typeof m.text === 'string' && m.text) toast(m.text.slice(0, 60));
    else if (m.t === 'start' && num(m.round) && num(m.seed) && DUEL_GAMES.includes(m.game)) {
      const st = S, round = m.round; S.round = round;
      playRound(m.game, m.seed, `Sala ${S.code}`, r => {
        if (S !== st) return;
        if (st.conn && st.conn.open) st.conn.send({ t: 'res', round, score: r ? r.score : null, ms: r ? r.ms : 0, text: r ? r.text : '' });
        enter(); render();
      });
    }
  }
  function sanitizeLobby(m) {
    const rows = a => (Array.isArray(a) ? a.slice(0, MAX) : []).map(r => ({ id: String(r.id || ''), name: cleanName(r.name) || '?', score: num(r.score) ? r.score : null, ms: num(r.ms) ? r.ms : 0, text: String(r.text || '').slice(0, 80), pos: num(r.pos) ? r.pos : null, add: num(r.add) ? r.add : 0, wait: !!r.wait }));
    return {
      phase: ['lobby', 'playing', 'results'].includes(m.phase) ? m.phase : 'lobby', round: num(m.round) ? m.round : 0,
      game: DUEL_GAMES.includes(m.game) || m.game === 'random' ? m.game : 'intruso', cur: DUEL_GAMES.includes(m.cur) ? m.cur : '',
      players: m.players.slice(0, MAX).map(p => ({ id: String(p.id || ''), name: cleanName(p.name) || '?', pts: num(p.pts) ? p.pts : 0, host: !!p.host })),
      last: m.last && DUEL_GAMES.includes(m.last.game) ? { round: num(m.last.round) ? m.last.round : 0, game: m.last.game, rows: rows(m.last.rows) } : null,
      wait: m.wait ? rows(m.wait) : null,
    };
  }

  /* the room screen (host and guests) */
  function roomUrl(code) { return location.origin + location.pathname + '#duelo/' + code; }
  async function paintQR(box, url) {
    try {
      await loadScript(QR_JS);
      const q = window.qrcode(0, 'M'); q.addData(url); q.make();
      const img = el('img'); img.alt = 'QR de la sala'; img.src = q.createDataURL(5, 2);
      box.textContent = ''; box.append(img);
    } catch (e) { box.textContent = ''; }
  }
  function render() {
    if (!S) { menu(''); return; }
    if (S.mode === 'local') { localRender(); return; }
    const host = S.mode === 'host';
    const L = host ? lobbyMsg() : S.lobby;
    if (!L) { busy(host ? 'Creando la sala…' : 'Conectando…'); return; }
    const b = frame(`Sala ${S.code} · ${L.players.length} jugador${L.players.length > 1 ? 'es' : ''}`);
    // the code, the link and the QR
    const inv = el('div', 'jg-dinvite');
    const left = el('div', 'jg-dinv-tx');
    left.append(el('small', '', 'Código de la sala'), el('div', 'jg-dcodebig', S.code));
    const url = roomUrl(S.code);
    const share = btn(navigator.share ? '📤 Invitar' : '🔗 Copiar enlace', '', () => {
      if (navigator.share) navigator.share({ title: 'DRUS · Duelo', text: `Sumate a mi duelo en DRUS: sala ${S.code}`, url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Enlace copiado'), () => {});
    });
    left.append(el('p', 'jg-dnote', 'Entran desde pudrus.xyz/juegos → Duelo → Unirme, o con el QR.'), share);
    const qr = el('div', 'jg-dqr');
    inv.append(left, qr);
    b.append(inv);
    paintQR(qr, url);
    b.append(el('h3', 'jg-dh', 'Jugadores'), totals(L.players, S.me));
    if (L.phase === 'playing' && L.wait) {
      const g = gameOf(L.cur);
      b.append(el('h3', 'jg-dh', `Ronda ${L.round}${g ? ' · ' + g.title : ''} · esperando…`), table(L.cur, L.wait, S.me));
      if (host) b.append(btn('Terminar la ronda ahora', '', () => { if (confirm('¿Terminar la ronda? Los que no terminaron quedan sin puntos.')) checkEnd(true); }));
    }
    if (L.last && L.phase !== 'playing') {
      const g = gameOf(L.last.game);
      b.append(el('h3', 'jg-dh', `Ronda ${L.last.round}${g ? ' · ' + g.title : ''}`), table(L.last.game, L.last.rows, S.me));
    }
    if (host && L.phase !== 'playing') {
      b.append(el('h3', 'jg-dh', 'Próximo juego'), gamePicker(S.game, g => { S.game = g; hostAll(lobbyMsg()); }));
      const go = btn(`▶ Jugar ronda ${S.round + 1}`, 'primary jg-dgo', startRound);
      if (L.players.length < 2) { go.disabled = true; b.append(go, el('p', 'jg-dnote', 'Esperando a que entre alguien más…')); } else b.append(go);
    } else if (!host && L.phase !== 'playing') {
      const g = L.game === 'random' ? null : gameOf(L.game), hn = (L.players.find(p => p.host) || {}).name || 'quien creó la sala';
      b.append(el('p', 'jg-dwait', `Esperando a que ${hn} empiece la ronda${g ? ` (${g.title})` : L.game === 'random' ? ' (juego al azar)' : ''}…`));
    }
    b.append(btn('Salir de la sala', 'jg-dleave', () => { leave(); location.hash = ''; }));
  }
  function failed(msg) {
    const b = frame();
    b.append(el('p', 'jg-dwait', msg));
    const row = el('div', 'jg-btns');
    row.append(btn('Volver al duelo', 'primary', () => { S = null; menu(''); }), btn('Un solo aparato', '', () => localSetup()));
    b.append(row);
  }
  function leave(quiet) {
    if (!S) return;
    const st = S; S = null;
    if (st.mode === 'guest' && st.conn) { try { if (st.conn.open) st.conn.send({ t: 'bye' }); } catch (e) { /* closed */ } }
    if (st.peer) setTimeout(() => { try { st.peer.destroy(); } catch (e) { /* gone */ } }, quiet ? 0 : 150);
  }

  /* ═════════ one device: turns ═════════ */
  function localSetup(prev) {
    leave(true);
    const names = prev ? prev.players.map(p => p.name) : [myName() || 'Jugador 1', 'Jugador 2'];
    const st = S = { mode: 'local', phase: 'setup', game: prev ? prev.game : 'intruso', names, players: [], round: 0 };
    localRender();
    return st;
  }
  function localRender() {
    const st = S;
    if (st.phase === 'setup') {
      const b = frame('Un solo aparato · por turnos');
      b.append(el('h3', 'jg-dh', 'Jugadores'));
      const list = el('div', 'jg-dnames');
      const paint = () => {
        list.textContent = '';
        st.names.forEach((n, i) => {
          const r = el('div', 'jg-drow2'), inp = el('input', 'jg-dinput'); inp.maxLength = 16; inp.value = n; inp.placeholder = `Jugador ${i + 1}`;
          inp.addEventListener('input', () => { st.names[i] = inp.value; });
          r.append(inp);
          if (st.names.length > 2) r.append(btn('×', 'jg-dx', () => { st.names.splice(i, 1); paint(); }));
          list.append(r);
        });
        if (st.names.length < MAX) list.append(btn('＋ Agregar jugador', '', () => { st.names.push(''); paint(); const i = list.querySelectorAll('input'); i[i.length - 1].focus(); }));
      };
      paint();
      b.append(list, el('h3', 'jg-dh', 'Juego'), gamePicker(st.game, g => { st.game = g; }));
      b.append(btn('▶ Empezar', 'primary jg-dgo', () => {
        st.players = st.names.map((n, i) => ({ id: 'p' + i, name: cleanName(n) || `Jugador ${i + 1}`, pts: 0 }));
        localRound();
      }));
      b.append(btn('Volver', 'jg-dleave', () => { S = null; menu(''); }));
    } else if (st.phase === 'turn') {
      const p = st.players[st.turn], g = gameOf(st.cur);
      const b = frame(`Ronda ${st.round} · ${g.title}`);
      const box = el('div', 'jg-start jg-dturn');
      box.append(el('small', '', `Turno ${st.turn + 1} de ${st.players.length}`), el('div', 'big', p.name), el('p', 'jg-rules', `Pasale el aparato a ${p.name}. Todos juegan el mismo tablero de ${g.title}.`));
      box.append(btn('▶ Estoy listo', 'primary', () => {
        playRound(st.cur, st.seed, `turno de ${p.name}`, r => {
          if (S !== st) return;
          st.results[p.id] = r || { score: null };
          st.turn++;
          if (st.turn >= st.players.length) localEnd(); else st.phase = 'turn';
          enter(); localRender();
        });
      }));
      b.append(box);
      if (st.turn > 0) b.append(table(st.cur, st.players.slice(0, st.turn).map(q => ({ id: q.id, name: q.name, score: st.results[q.id] ? st.results[q.id].score : null, ms: 0 })).map(r => ({ ...r, pos: null })), ''));
      b.append(btn('Cancelar la ronda', 'jg-dleave', () => { st.phase = 'results'; localRender(); }));
    } else {
      const b = frame(`Un solo aparato · ${st.players.length} jugadores`);
      b.append(el('h3', 'jg-dh', 'Puntos'), totals(st.players, ''));
      if (st.last) { const g = gameOf(st.last.game); b.append(el('h3', 'jg-dh', `Ronda ${st.last.round} · ${g.title}`), table(st.last.game, st.last.rows, '')); }
      b.append(el('h3', 'jg-dh', 'Próximo juego'), gamePicker(st.game, g => { st.game = g; }));
      const row = el('div', 'jg-btns');
      row.append(btn(`▶ Jugar ronda ${st.round + 1}`, 'primary jg-dgo', () => localRound()), btn('Cambiar jugadores', '', () => localSetup(st)));
      b.append(row, btn('Salir', 'jg-dleave', () => { S = null; location.hash = ''; }));
    }
  }
  function localRound() {
    const st = S;
    st.round++; st.cur = pickGame(st.game); st.seed = Math.floor(Math.random() * 4294967296); st.results = {}; st.turn = 0; st.phase = 'turn';
    localRender();
  }
  function localEnd() {
    const st = S;
    const rows = rankRows(st.cur, st.players.map(p => ({ id: p.id, name: p.name, ...(st.results[p.id] || { score: null }) })));
    rows.forEach(r => { const p = st.players.find(x => x.id === r.id); if (p) p.pts += r.add; });
    st.last = { round: st.round, game: st.cur, rows };
    st.phase = 'results';
  }

  /* ═════════ entry (from juegos.js: #duelo or #duelo/CODE) ═════════ */
  function show(flag) {
    enter();
    const code = String(flag || '').toUpperCase();
    if (S && (S.mode === 'local' || (isCode(code) ? S.code === code : true))) { render(); return; }
    if (isCode(code)) { if (myName()) joinRoom(code); else { menu(code); toast('Poné tu nombre y tocá «Entrar»'); } return; }
    menu('');
  }
  $('#dBack').addEventListener('click', () => {
    if (S && S.mode !== 'local' && !confirm('¿Salir del duelo?')) return;
    leave(); location.hash = '';
  });
  addEventListener('pagehide', () => leave(true));
  window.drusDuel = { show, get state() { return S; }, rankRows, DUEL_GAMES, _createRoom: createRoom, _joinRoom: joinRoom, _local: localSetup, _start: () => startRound() };
  if (window.__drusDuelPending !== undefined) { const f = window.__drusDuelPending; delete window.__drusDuelPending; show(f); }
})();
