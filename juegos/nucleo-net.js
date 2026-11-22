/* DRUS · Núcleo en red — the room for playing Núcleo together (2 to 4 players), online through PeerJS like the Duel.
   Two ways: «Cooperativo» (the same structure, the same cores and bosses, together) and «Versus» (an arena, everyone against everyone).
   Whoever creates the room keeps the world (the enemies, the cores, the bosses); each player moves their own body and says what their shots hit.
   Every message from another device is data: checked, and shown with textContent only. */
(function () {
  'use strict';
  const J = window.__juegos; if (!J) return;
  const el = J.el, tr = J.tr;
  const PEER_JS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  const QR_JS = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ', PREFIX = 'drus-nucleo-', MAX = 4;
  // the players' colours (cyan, pink, lime, amber): far apart for every kind of colour blindness, and each one also has a name tag
  const COLS = [[0.35, 0.9, 1], [1, 0.4, 0.85], [0.55, 1, 0.35], [1, 0.75, 0.25]];
  const cleanName = s => String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const isCode = s => /^[A-Z]{4}$/.test(String(s || '').toUpperCase());
  const myName = () => cleanName(J.store.duelName) || '';
  const setMyName = n => { J.store.duelName = cleanName(n); J.save(); };
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) scripts[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete scripts[src]; rej(new Error('load')); }; document.head.append(s); });
    return scripts[src];
  }
  const btn = (txt, cls, fn) => { const b = el('button', 'jg-btn' + (cls ? ' ' + cls : ''), txt); b.addEventListener('click', fn); return b; };
  const MODES = { coop: [tr('Cooperativo', 'Co-op'), tr('Juntos contra la estructura: los mismos núcleos, los mismos jefes. Si caés, volvés al rato junto a alguien de tu equipo; si caen todos, se termina.', 'Together against the structure: the same cores, the same bosses. If you fall, you come back a little later next to a teammate; if everyone falls, it’s over.')],
    vs: [tr('Versus', 'Versus'), tr('Una arena sin enemigos, todos contra todos. Las armas están tiradas por ahí. Gana quien llegue primero a 10 bajas (o quien tenga más a los 5 minutos).', 'An arena with no enemies, everyone against everyone. The weapons lie around. First to 10 takedowns wins (or whoever has most after 5 minutes).')] };

  /* the room: lobby → game. Returns the cleanup for juegos.js */
  function lobby(ctx, startGame) {
    const stage = ctx.stage;
    const box = el('div', 'nc-lobby'); stage.append(box);
    let R = null, gameCleanup = null, dead = false, net = null;
    const flagCode = (/^m([A-Za-z]{4})$/.exec(ctx.flag || '') || [])[1];

    function frame(title) { box.textContent = ''; box.append(el('h3', 'nc-lh', title || tr('Núcleo en red', 'Core online'))); return box; }
    function busy(txt) { const b = frame(); b.append(el('p', 'jg-dwait', txt)); }
    function failed(msg) {
      const b = frame(); b.append(el('p', 'jg-dwait', msg));
      b.append(btn(tr('Volver', 'Back'), 'primary', () => { close(); menu(''); }));
    }
    function menu(code) {
      const b = frame();
      const nm = el('input', 'jg-dinput'); nm.maxLength = 16; nm.placeholder = tr('Tu nombre', 'Your name'); nm.value = myName(); nm.autocomplete = 'nickname';
      nm.addEventListener('input', () => setMyName(nm.value));
      const lab = el('label', 'jg-dname'); lab.append(el('span', '', tr('Tu nombre', 'Your name')), nm); b.append(lab);
      const opts = el('div', 'jg-dopts nc-lopts');
      const o1 = el('div', 'jg-dopt');
      o1.append(el('b', '', tr('📡 Crear una sala', '📡 Create a room')), el('span', '', tr('Les pasás el código, el enlace o el QR. Hasta 4 jugadores, cada uno en su compu o celular.', 'Send them the code, the link or the QR. Up to 4 players, each on their own computer or phone.')));
      const mrow = el('div', 'jg-btns nc-lmodes');
      Object.keys(MODES).forEach(k => mrow.append(btn(MODES[k][0], '', () => { if (!need(nm)) return; createRoom(k); })));
      o1.append(mrow);
      const o2 = el('div', 'jg-dopt');
      const ci = el('input', 'jg-dinput jg-dcode'); ci.maxLength = 4; ci.placeholder = tr('CÓDIGO', 'CODE'); ci.autocapitalize = 'characters'; ci.value = code || '';
      ci.addEventListener('input', () => { ci.value = ci.value.toUpperCase().replace(/[^A-Z]/g, ''); });
      const jb = btn(tr('Entrar', 'Join'), 'primary', () => { if (!isCode(ci.value)) { ci.focus(); return; } if (!need(nm)) return; joinRoom(ci.value.toUpperCase()); });
      ci.addEventListener('keydown', e => { if (e.key === 'Enter') jb.click(); });
      const jr = el('div', 'jg-drow2'); jr.append(ci, jb);
      o2.append(el('b', '', tr('🔑 Unirme a una sala', '🔑 Join a room')), el('span', '', tr('El código de 4 letras que te pasaron.', 'The 4-letter code you were given.')), jr);
      opts.append(o1, o2); b.append(opts);
      b.append(el('p', 'jg-dnote', `${MODES.coop[0]}: ${MODES.coop[1]}`), el('p', 'jg-dnote', `${MODES.vs[0]}: ${MODES.vs[1]}`));
      b.append(el('p', 'jg-dnote', tr('En red no hay pliegues ni pausa: el mundo sigue aunque abras el menú. Conviene que quien crea la sala tenga la mejor conexión y no cambie de pestaña (si no, todo se congela).', 'Online there are no folds and no pause: the world goes on even with the menu open. Whoever creates the room should have the best connection and not switch tabs (or everything freezes).')));
      if (code) ci.focus(); else if (!nm.value) nm.focus();
    }
    function need(nm) { if (myName()) return true; nm.focus(); nm.classList.add('nc-need'); setTimeout(() => nm.classList.remove('nc-need'), 900); return false; }
    function close() {
      const st = R; R = null; if (!st) return;
      if (st.peer) setTimeout(() => { try { st.peer.destroy(); } catch (e) { /* gone */ } }, 150);
    }

    /* ── the host: keeps the room and relays ── */
    async function createRoom(mode, tries = 0) {
      close(); busy(tr('Creando la sala…', 'Creating the room…'));
      try { await loadScript(PEER_JS); } catch (e) { failed(tr('No se pudo conectar (¿hay internet?).', 'Could not connect (is there internet?).')); return; }
      if (dead) return;
      const code = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
      const peer = new window.Peer(PREFIX + code, { debug: 0 });
      const st = R = { role: 'host', mode, code, peer, players: [{ id: 'h', name: myName(), col: 0 }], conns: new Map(), started: false, n: 0 };
      peer.on('open', () => { if (R === st) render(); });
      peer.on('error', e => {
        if (R !== st) return;
        if (e.type === 'unavailable-id' && tries < 4) { try { peer.destroy(); } catch (er) { /* gone */ } R = null; createRoom(mode, tries + 1); return; }
        if (e.type === 'peer-unavailable') return;
        if (!st.started) failed(tr('No se pudo abrir la sala (', 'Could not open the room (') + e.type + ').');
      });
      peer.on('disconnected', () => { if (R === st && !peer.destroyed) try { peer.reconnect(); } catch (er) { /* later */ } });
      peer.on('connection', c => {
        c.on('data', m => { if (R === st) hostData(c, m); });
        c.on('close', () => { if (R === st) drop(c.peer); });
        c.on('error', () => { if (R === st) drop(c.peer); });
      });
    }
    function conn(id, fast) { const g = R.conns.get(id); return g ? (fast && g.u && g.u.open ? g.u : g.r) : null; }
    function send(c, m) { try { if (c && c.open) c.send(m); } catch (e) { /* closed */ } }
    function hostData(c, m) {
      if (!m || typeof m !== 'object') return;
      const st = R;
      let g = [...st.conns.values()].find(x => x.peer === c.peer);
      if (m.t === 'hello') {
        if (c.label === 'u') { if (g) g.u = c; else st.conns.set('?' + c.peer, { peer: c.peer, u: c, pending: true }); return; }
        if (st.started) { send(c, { t: 'started' }); return; }
        if (st.players.length >= MAX) { send(c, { t: 'full' }); return; }
        const pre = st.conns.get('?' + c.peer); if (pre) st.conns.delete('?' + c.peer);
        const id = 'p' + (++st.n), used = st.players.map(p => p.col), col = [0, 1, 2, 3].find(k => !used.includes(k));
        let name = cleanName(m.name) || tr('Jugador', 'Player'); while (st.players.some(p => p.name === name)) name = name.slice(0, 14) + '·';
        st.conns.set(id, { peer: c.peer, r: c, u: pre ? pre.u : null });
        st.players.push({ id, name, col });
        send(c, { t: 'welcome', id, name });
        lobbyAll(); render(); return;
      }
      if (!g) { if (c.label === 'u') { const p = [...st.conns.entries()].find(([, x]) => x.peer === c.peer); if (p) p[1].u = c; } return; }
      const id = [...st.conns.entries()].find(([, x]) => x === g)[0];
      if (m.t === 'bye') { drop(c.peer); return; }
      if (st.started && net && net.onmsg) net.onmsg(id, m);
    }
    function drop(peerId) {
      const st = R; if (!st) return;
      const e = [...st.conns.entries()].find(([, x]) => x.peer === peerId); if (!e) return;
      st.conns.delete(e[0]); st.players = st.players.filter(p => p.id !== e[0]);
      if (st.started) { if (net && net.onleave) net.onleave(e[0]); }
      else { lobbyAll(); render(); }
    }
    const lobbyMsg = () => ({ t: 'lobby', code: R.code, mode: R.mode, players: R.players });
    function lobbyAll() { R.conns.forEach(g => send(g.r, lobbyMsg())); }

    /* ── a guest: two channels to the host (one reliable for events, one fast for positions) ── */
    async function joinRoom(code, tries = 0) {
      close(); busy(tr(`Entrando a la sala ${code}…`, `Joining room ${code}…`));
      try { await loadScript(PEER_JS); } catch (e) { failed(tr('No se pudo conectar (¿hay internet?).', 'Could not connect (is there internet?).')); return; }
      if (dead) return;
      const peer = new window.Peer({ debug: 0 });
      const st = R = { role: 'guest', code, peer, r: null, u: null, id: '', lobby: null, started: false };
      peer.on('open', () => {
        if (R !== st) return;
        const r = st.r = peer.connect(PREFIX + code, { reliable: true, label: 'r' });
        r.on('open', () => {
          if (R !== st) return; send(r, { t: 'hello', name: myName() });
          const u = st.u = peer.connect(PREFIX + code, { reliable: false, label: 'u' });
          u.on('open', () => send(u, { t: 'hello' })); u.on('data', m => { if (R === st) guestData(m); });
        });
        r.on('data', m => { if (R === st) guestData(m); });
        r.on('close', () => {
          if (R !== st) return; R = null; try { peer.destroy(); } catch (e) { /* gone */ }
          if (st.started) { if (net && net.onclose) net.onclose(); } else failed(st.lobby ? tr('La sala se cerró (quien la creó salió).', 'The room closed (whoever created it left).') : tr(`No pude entrar a la sala ${code}.`, `Could not join room ${code}.`));
        });
      });
      peer.on('error', e => {
        if (R !== st) return;
        if (e.type === 'peer-unavailable') { R = null; try { peer.destroy(); } catch (er) { /* gone */ } failed(tr(`No encontré la sala ${code}: revisá el código.`, `Room ${code} not found: check the code.`)); }
        else if (!st.lobby) { R = null; try { peer.destroy(); } catch (er) { /* gone */ } failed(tr('No se pudo conectar (', 'Could not connect (') + e.type + ').'); }
      });
    }
    function guestData(m) {
      if (!m || typeof m !== 'object') return;
      const st = R;
      if (st.started) { if (net && net.onmsg) net.onmsg('h', m); return; }
      if (m.t === 'welcome' && typeof m.id === 'string') st.id = m.id;
      else if (m.t === 'full') failed(tr('La sala está llena (4 jugadores).', 'The room is full (4 players).'));
      else if (m.t === 'started') failed(tr('Esa partida ya empezó: pedile a quien la creó que arme otra sala.', 'That game already started: ask whoever created it to make another room.'));
      else if (m.t === 'lobby' && Array.isArray(m.players)) { st.lobby = { mode: m.mode === 'vs' ? 'vs' : 'coop', players: cleanPlayers(m.players) }; render(); }
      else if (m.t === 'go' && Number.isFinite(m.seed)) { st.lobby = { mode: m.mode === 'vs' ? 'vs' : 'coop', players: cleanPlayers(m.players) }; begin(m.seed >>> 0); }
    }
    const cleanPlayers = a => a.slice(0, MAX).map(p => ({ id: String(p.id || '').slice(0, 8), name: cleanName(p.name) || '?', col: Math.max(0, Math.min(3, p.col | 0)) }));

    /* ── the room screen ── */
    async function paintQR(q, url) {
      try { await loadScript(QR_JS); const g = window.qrcode(0, 'M'); g.addData(url); g.make(); const img = el('img'); img.alt = 'QR'; img.src = g.createDataURL(5, 2); q.textContent = ''; q.append(img); } catch (e) { q.textContent = ''; }
    }
    function render() {
      if (!R || dead) return;
      const host = R.role === 'host', L = host ? { mode: R.mode, players: R.players } : R.lobby;
      if (!L) { busy(tr('Conectando…', 'Connecting…')); return; }
      const b = frame(`${tr('Núcleo en red', 'Core online')} · ${MODES[L.mode][0]}`);
      const inv = el('div', 'jg-dinvite'), left = el('div', 'jg-dinv-tx'), url = location.origin + location.pathname + '#nucleo/m' + R.code;
      left.append(el('small', '', tr('Código de la sala', 'Room code')), el('div', 'jg-dcodebig', R.code));
      left.append(btn(navigator.share ? tr('📤 Invitar', '📤 Invite') : tr('🔗 Copiar enlace', '🔗 Copy link'), '', () => {
        if (navigator.share) navigator.share({ title: 'DRUS · Núcleo', text: tr(`Jugá Núcleo conmigo: sala ${R.code}`, `Play Core with me: room ${R.code}`), url }).catch(() => {});
        else if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
      }));
      const q = el('div', 'jg-dqr'); inv.append(left, q); b.append(inv); paintQR(q, url);
      b.append(el('h3', 'jg-dh', tr(`Jugadores (${L.players.length}/${MAX})`, `Players (${L.players.length}/${MAX})`)));
      const list = el('div', 'nc-lplayers');
      L.players.forEach(p => { const r = el('div', 'nc-lp'); const dot = el('i'); dot.style.background = `rgb(${COLS[p.col].map(v => Math.round(v * 255)).join(',')})`; r.append(dot, el('span', '', p.name + (p.id === 'h' ? tr(' · creó la sala', ' · room creator') : '') + (p.id === (host ? 'h' : R.id) ? tr(' (vos)', ' (you)') : ''))); list.append(r); });
      b.append(list, el('p', 'jg-dnote', MODES[L.mode][1]));
      if (host) {
        const go = btn(tr('▶ Empezar', '▶ Start'), 'primary', () => { const seed = Math.floor(Math.random() * 4294967296); R.conns.forEach(g => send(g.r, { t: 'go', seed, mode: R.mode, players: R.players })); begin(seed); });
        if (L.players.length < 2) { go.disabled = true; b.append(go, el('p', 'jg-dnote', tr('Esperando a que entre alguien más…', 'Waiting for someone else to join…'))); } else b.append(go);
      } else b.append(el('p', 'jg-dwait', tr('Esperando a que empiece quien creó la sala…', 'Waiting for the room’s creator to start…')));
      b.append(btn(tr('Salir de la sala', 'Leave the room'), '', () => { if (R && R.role === 'guest') send(R.r, { t: 'bye' }); close(); menu(''); }));
    }

    /* ── the game starts: the same seed for everyone; from here on the messages go to nucleo.js ── */
    function begin(seed) {
      const st = R; st.started = true;
      const host = st.role === 'host', L = host ? { mode: st.mode, players: st.players } : st.lobby;
      net = {
        role: st.role, mode: L.mode, seed, code: st.code, me: host ? 'h' : st.id, COLS,
        players: L.players.map(p => ({ ...p })),
        onmsg: null, onleave: null, onclose: null,
        // a guest sends to the host; the host sends to everyone (or to everyone but one)
        send(m, fast, except) {
          if (R !== st) return;
          if (host) st.conns.forEach((g, id) => { if (id !== except && !g.pending) send(fast && g.u && g.u.open ? g.u : g.r, m); });
          else send(fast && st.u && st.u.open ? st.u : st.r, m);
        },
        to(id, m, fast) { if (R === st && host) send(conn(id, fast), m); },
        close() { if (R === st) { if (!host) send(st.r, { t: 'bye' }); close(); } },
      };
      box.remove();
      gameCleanup = startGame(net);
    }

    if (flagCode && isCode(flagCode.toUpperCase())) { if (myName()) joinRoom(flagCode.toUpperCase()); else menu(flagCode.toUpperCase()); }
    else menu('');
    return () => { dead = true; if (gameCleanup) { try { gameCleanup(); } catch (e) { /* gone */ } } if (net) net.close(); else { if (R && R.role === 'guest') send(R.r, { t: 'bye' }); close(); } box.remove(); };
  }
  addEventListener('pagehide', () => { /* the peers close with the page */ });
  window.NucleoNet = { lobby, COLS, cleanName };
})();
