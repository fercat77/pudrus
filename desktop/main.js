/* NODRUS — desktop app (Electron).
   The web editor runs unchanged from a local server; the app adds what a browser can't:
   Spout output (GPU texture sharing), OSC in/out, the phone over the local wifi (no internet)
   and a real fullscreen output window on the projector. */
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { WebSocketServer } = require('ws');
const { Server: OscServer, Client: OscClient } = require('node-osc');

let bridge = null, bridgeError = '';
try { bridge = require('@napolab/texture-bridge-core'); } catch (e) { bridgeError = String(e.message || e); }

const TEST = process.argv.includes('--nodrus-test');
// remote screens get the video over the local wifi: offer the real LAN address, not an mDNS «.local» name
// (TVs and some tablets can't resolve those)
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
// laptops with two GPUs (Intel + NVIDIA/AMD): render on the powerful one, not the integrated one.
// The switch moves Chromium's drawing; the Windows per-app preference (the same as Settings → Display →
// Graphics → «High performance») also moves Spout's native side, so both share one GPU.
// It is only written when this exe has no preference yet: a choice made by hand in Windows wins.
app.commandLine.appendSwitch('force_high_performance_gpu');
let gpuPref = '';
if (process.platform === 'win32') {
  const KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
  const cp = require('child_process');
  try {
    const q = cp.execFileSync('reg', ['query', KEY, '/v', process.execPath], { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    gpuPref = (q.match(/GpuPreference=(\d)/) || [])[1] || '?';
  } catch (e) {
    try { cp.execFileSync('reg', ['add', KEY, '/v', process.execPath, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f'], { windowsHide: true, timeout: 3000, stdio: 'ignore' }); gpuPref = '2 (nueva)'; } catch (e2) { gpuPref = 'error'; }
  }
}
const WEB = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..');
const VENDOR = {
  '/vendor/qrcode.js': path.join(__dirname, 'node_modules', 'qrcode-generator', 'qrcode.js'),
  '/vendor/mp4-muxer.js': path.join(__dirname, 'node_modules', 'mp4-muxer', 'build', 'mp4-muxer.js'),
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

/* ── Settings (remembered between runs) ── */
const CFG_FILE = path.join(app.getPath('userData'), 'nodrus-config.json');
const cfg = Object.assign({ display: 'auto', spout: { on: false, name: 'NODRUS', width: 1920, height: 1080, fps: 60 }, osc: { on: false, inPort: 9000, outHost: '127.0.0.1', outPort: 9001 } },
  (() => { try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch (e) { return {}; } })());
const saveCfg = () => { if (TEST) return; try { fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 1)); } catch (e) { /* ignore */ } };

/* ── Local server: the editor for the app, the phone controller for the wifi ── */
let port = 47110, server = null, base = '';
function lanAddress() {
  const list = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal);
  const pref = list.find(i => /^192\.168\./.test(i.address)) || list.find(i => /^10\./.test(i.address)) || list.find(i => /^172\.(1[6-9]|2\d|3[01])\./.test(i.address)) || list[0];
  return pref ? pref.address : '127.0.0.1';
}
function serve(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (p === '/') { res.writeHead(302, { Location: '/lab/nodes/?pc' }); res.end(); return; }
  let file = VENDOR[p];
  if (!file) {
    if (!(p.startsWith('/lab/nodes/') || p.startsWith('/lab/syndrus/') || p === '/favicon.svg' || p === '/js/splash.js')) { res.writeHead(404); res.end('no'); return; }
    if (p.endsWith('/')) p += 'index.html';
    file = path.normalize(path.join(WEB, p));
    const root = path.normalize(path.join(WEB, 'lab', 'nodes')), syRoot = path.normalize(path.join(WEB, 'lab', 'syndrus'));
    if (!(file.startsWith(root + path.sep) || file.startsWith(syRoot + path.sep) || file === path.join(WEB, 'favicon.svg') || file === path.join(WEB, 'js', 'splash.js'))) { res.writeHead(403); res.end(); return; }
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}
function startServer() {
  return new Promise((resolve, reject) => {
    const host = TEST ? '127.0.0.1' : '0.0.0.0';   // the phone needs the wifi address; tests stay local
    const tryPort = n => {
      const s = http.createServer(serve);
      s.once('error', e => { if (e.code === 'EADDRINUSE' && n < port + 20) tryPort(n + 1); else reject(e); });
      s.listen(n, host, () => { port = n; server = s; base = `http://127.0.0.1:${n}`; resolve(); });
    };
    tryPort(port);
  });
}

/* ── Phones over the wifi (WebSocket instead of the internet relay) ── */
const phones = new Map();
let phoneSeq = 0, mainWin = null, syWin = null;
const roles = new Map();   // ws id → 'phone' | 'screen' | 'syndrus'
function startPhones() {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws, req) => {
    const id = ++phoneSeq;
    phones.set(id, ws);
    // phones (controller) and remote screens (output.html?ws on a TV / tablet / another computer)
    // …and phones that control SYNDRUS (control/?ws from the SYNDRUS QR): those go to the SYNDRUS window
    const role = /[?&]screen(=|&|$)/.test(req.url || '') ? 'screen' : /[?&]syndrus(=|&|$)/.test(req.url || '') ? 'syndrus' : 'phone';
    roles.set(id, role);
    const to = (ch, p) => (role === 'syndrus' ? toSyndrus(ch, p) : toEditor(ch, p));
    to('remote', { type: 'open', id, role });
    ws.on('message', data => {
      let msg; try { msg = JSON.parse(String(data)); } catch (e) { return; }
      if (msg && typeof msg === 'object') to('remote', { type: 'msg', id, msg });
    });
    ws.on('close', () => { phones.delete(id); roles.delete(id); to('remote', { type: 'close', id }); });
    ws.on('error', () => {});
  });
}
const toEditor = (ch, payload) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(ch, payload); };
const toSyndrus = (ch, payload) => { if (syWin && !syWin.isDestroyed()) syWin.webContents.send(ch, payload); };
ipcMain.on('remote-send', (e, id, msg) => {
  const ws = phones.get(id);
  if (!ws || ws.readyState !== 1) return;
  if (msg && msg.type === 'frame' && ws.bufferedAmount > 512e3) return;   // slow wifi: skip clock ticks instead of piling them up
  ws.send(JSON.stringify(msg));
});

/* ── Spout: an invisible, clean copy of the output window, shared on the GPU ── */
let spout = null;
function stopSpout() {
  if (!spout) return;
  try { spout.sender.stop(); } catch (e) { /* stopped */ }
  if (spout.win && !spout.win.isDestroyed()) spout.win.destroy();
  spout = null;
}
function startSpout(o = {}) {
  stopSpout();
  if (!bridge) return { ok: false, error: 'Spout no está disponible: ' + bridgeError };
  const name = String(o.name || 'NODRUS').slice(0, 60), width = Math.max(64, Math.min(4096, o.width | 0 || 1920)), height = Math.max(64, Math.min(4096, o.height | 0 || 1080)), fps = Math.max(10, Math.min(120, o.fps | 0 || 60));
  let sender;
  try { sender = new bridge.TextureSender(name, width, height); } catch (e) { return { ok: false, error: String(e.message || e) }; }
  const win = new BrowserWindow({ width, height, show: false, frame: false, useContentSize: true,
    webPreferences: { offscreen: { useSharedTexture: true, deviceScaleFactor: 1 }, backgroundThrottling: false } });
  spout = { sender, win, name, width, height, fps, frames: 0, defects: 0, error: '' };
  win.webContents.on('paint', (details, dirty, image, legacyTexture) => {
    const tex = (details && details.texture) || legacyTexture;
    if (!tex) return;
    try {
      const defect = bridge.sendTextureFromPaintEvent(sender, tex.textureInfo);
      if (defect) spout.defects++; else spout.frames++;
    } catch (e) { spout.error = String(e.message || e); }
    finally { try { tex.release(); } catch (e) { /* released */ } }
  });
  win.webContents.setFrameRate(fps);
  win.loadURL(`${base}/lab/nodes/output.html?clean=1`);
  return { ok: true, name, width, height, fps };
}
const spoutStats = () => (spout ? { on: true, name: spout.name, width: spout.width, height: spout.height, fps: spout.fps, frames: spout.frames, defects: spout.defects, error: spout.error } : { on: false, available: !!bridge, error: bridge ? '' : bridgeError });

/* ── OSC in / out ── */
let oscIn = null, oscOut = null;
function stopOsc() {
  try { if (oscIn) oscIn.close(); } catch (e) { /* closed */ }
  try { if (oscOut) oscOut.close(); } catch (e) { /* closed */ }
  oscIn = oscOut = null;
}
function startOsc(o = {}) {
  stopOsc();
  const inPort = o.inPort | 0 || 9000, outPort = o.outPort | 0 || 9001, outHost = String(o.outHost || '127.0.0.1');
  try {
    oscIn = new OscServer(inPort, '0.0.0.0');
    oscIn.on('message', msg => { if (Array.isArray(msg)) toEditor('osc', { addr: String(msg[0]), args: msg.slice(1) }); });
    oscIn.on('error', e => toEditor('osc-error', String(e.message || e)));
    oscOut = new OscClient(outHost, outPort);
  } catch (e) { stopOsc(); return { ok: false, error: String(e.message || e) }; }
  return { ok: true, inPort, outHost, outPort };
}
ipcMain.on('osc-send', (e, addr, args) => {
  if (!oscOut || typeof addr !== 'string') return;
  const a = (Array.isArray(args) ? args : []).filter(x => typeof x === 'number' || typeof x === 'string');
  oscOut.send(addr, ...a, () => {});
});

/* ── Windows ── */
function outputDisplay() {
  const all = screen.getAllDisplays(), prim = screen.getPrimaryDisplay();
  if (cfg.display !== 'auto') { const d = all.find(x => String(x.id) === String(cfg.display)); if (d) return d; }
  return all.find(d => d.id !== prim.id) || prim;
}
function createMain() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, show: !TEST, backgroundColor: '#0a0a10', title: 'NODRUS', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(base) && url.includes('/output.html')) {
      const d = outputDisplay();
      return { action: 'allow', overrideBrowserWindowOptions: { x: d.bounds.x + 40, y: d.bounds.y + 40, width: 960, height: 540, show: !TEST, backgroundColor: '#000000', autoHideMenuBar: true, title: 'NODRUS — Salida', webPreferences: { backgroundThrottling: false } } };
    }
    // SYNDRUS opens as a window of the app: same origin → it talks to NODRUS (BroadcastChannel); never throttled, it plays the clock
    if (url.startsWith(base) && url.includes('/lab/syndrus/')) return { action: 'allow', overrideBrowserWindowOptions: { width: 1366, height: 820, show: !TEST, backgroundColor: '#050508', autoHideMenuBar: true, title: 'SYNDRUS', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } } };
    if (/^https?:/.test(url) && !url.startsWith(base)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // the editor window (which has the desktop bridge) never leaves NODRUS: outside links open in the browser
  mainWin.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(base)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  mainWin.webContents.on('did-create-window', (win, details) => {
    if (details && /\/lab\/syndrus\//.test(details.url || '')) { syWin = win; win.on('closed', () => { syWin = null; }); return; }   // SYNDRUS: a normal window, it receives its phones
    // the output goes fullscreen on the projector when there is a second display
    const d = outputDisplay();
    if (d.id !== screen.getPrimaryDisplay().id && !TEST) win.once('ready-to-show', () => { win.setBounds(d.bounds); win.setFullScreen(true); });
  });
  mainWin.on('closed', () => { mainWin = null; app.quit(); });
  mainWin.loadURL(`${base}/lab/nodes/?pc`);
}

/* ── Bridge for the editor (preload) ── */
ipcMain.handle('info', () => ({
  version: app.getVersion(), port, lanUrl: `http://${lanAddress()}:${port}`, phones: phones.size,
  displays: screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: `${i + 1}: ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' (principal)' : ''}` })),
  display: String(cfg.display), spout: Object.assign(spoutStats(), { cfg: cfg.spout }), osc: Object.assign({ running: !!oscIn }, cfg.osc),
}));
ipcMain.handle('spout-start', (e, o) => { const r = startSpout(o); if (r.ok) { cfg.spout = { ...cfg.spout, ...o, on: true }; saveCfg(); } return r; });
ipcMain.handle('spout-stop', () => { stopSpout(); cfg.spout.on = false; saveCfg(); return { ok: true }; });
ipcMain.handle('spout-stats', () => spoutStats());
ipcMain.handle('osc-start', (e, o) => { const r = startOsc(o); if (r.ok) { cfg.osc = { ...cfg.osc, ...o, on: true }; saveCfg(); } return r; });
ipcMain.handle('osc-stop', () => { stopOsc(); cfg.osc.on = false; saveCfg(); return { ok: true }; });
// CPU (share of the whole machine) and memory of every NODRUS process, plus Spout state
ipcMain.handle('metrics', () => {
  const ms = app.getAppMetrics();
  const cores = require('os').cpus().length || 1;
  const cpu = ms.reduce((s, m) => s + (m.cpu ? m.cpu.percentCPUUsage : 0), 0) / cores;
  const mem = ms.reduce((s, m) => s + (m.memory ? m.memory.workingSetSize : 0), 0) / 1024;
  let spout = false; try { spout = !!spoutStats().on; } catch (e) { /* no spout */ }
  return { cpu, mem, spout };
});
ipcMain.handle('set-display', (e, id) => { cfg.display = id || 'auto'; saveCfg(); return { ok: true }; });

/* ── Start ── */
app.whenReady().then(async () => {
  await startServer();
  startPhones();
  createMain();
  if (!TEST) {
    if (cfg.spout.on) startSpout(cfg.spout);
    if (cfg.osc.on) startOsc(cfg.osc);
  } else require('./test.js')({ app, mainWin, base, port, startSpout, stopSpout, spoutStats, startOsc, stopOsc, bridge });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { stopSpout(); stopOsc(); });
