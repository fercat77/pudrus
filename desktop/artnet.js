/* Art-Net output for NODRUS lights: ArtDmx frames to one node (unicast) or the network (broadcast),
   and ArtPoll to find the nodes on the network (e.g. a WiFi node like WIDMX). No dependencies. */
const dgram = require('dgram');
const os = require('os');

const PORT = 6454;
const ID = Buffer.from('Art-Net\0', 'latin1');
const OP_POLL = 0x2000, OP_POLLREPLY = 0x2100, OP_DMX = 0x5000;

function dmxPacket(seq, universe, data) {
  const n = Math.max(2, Math.min(512, data.length + (data.length & 1)));   // even length, 2…512
  const b = Buffer.alloc(18 + n);
  ID.copy(b, 0);
  b.writeUInt16LE(OP_DMX, 8);
  b.writeUInt16BE(14, 10);          // protocol version
  b[12] = seq & 0xff;               // sequence (1…255; 0 = off)
  b[13] = 0;                        // physical port
  b.writeUInt16LE(universe & 0x7fff, 14);   // SubUni + Net (15-bit port-address)
  b.writeUInt16BE(n, 16);
  for (let i = 0; i < Math.min(n, data.length); i++) b[18 + i] = data[i] & 0xff;
  return b;
}
function pollPacket() {
  const b = Buffer.alloc(14);
  ID.copy(b, 0); b.writeUInt16LE(OP_POLL, 8); b.writeUInt16BE(14, 10);
  b[12] = 0x02;   // send me ArtPollReply when things change
  b[13] = 0;
  return b;
}
function parsePacket(msg) {
  if (msg.length < 12 || !msg.subarray(0, 8).equals(ID)) return null;
  const op = msg.readUInt16LE(8);
  if (op === OP_POLLREPLY && msg.length >= 44) {
    const ip = `${msg[10]}.${msg[11]}.${msg[12]}.${msg[13]}`;
    const short = msg.subarray(26, 44).toString('latin1').replace(/\0.*$/s, '').trim();
    const long = msg.length >= 108 ? msg.subarray(44, 108).toString('latin1').replace(/\0.*$/s, '').trim() : '';
    const net = msg.length > 19 ? msg[18] & 0x7f : 0, sub = msg.length > 19 ? msg[19] & 0x0f : 0;
    const swOut = msg.length >= 194 ? msg[190] & 0x0f : 0;
    return { op: 'reply', ip, name: short, long, universe: (net << 8) | (sub << 4) | swOut };
  }
  if (op === OP_DMX && msg.length >= 18) {
    const uni = msg.readUInt16LE(14), n = msg.readUInt16BE(16);
    return { op: 'dmx', seq: msg[12], universe: uni, data: msg.subarray(18, 18 + n) };
  }
  return { op: 'other', code: op };
}
// every IPv4 broadcast address of this computer's networks (plus the global one)
function broadcasts() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' && a.family !== 4) continue;
    if (a.internal) continue;
    const ip = a.address.split('.').map(Number), m = a.netmask.split('.').map(Number);
    out.add(ip.map((x, i) => (x & m[i]) | (~m[i] & 255)).join('.'));
  }
  return [...out];
}

// one sender: send(data) whenever there is a new frame; it also repeats the last frame every second
// (nodes go dark if they stop hearing from you)
function createSender(onNodes, onError) {
  let sock = null, seq = 0, cfg = { host: '', universe: 0, port: PORT }, last = null, keep = null;
  const nodes = new Map();
  function open() {
    if (sock) return;
    sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('error', e => { if (onError) onError(String(e.message || e)); });
    sock.on('message', (msg, rinfo) => {
      const p = parsePacket(msg); if (!p || p.op !== 'reply') return;
      p.ip = p.ip === '0.0.0.0' ? rinfo.address : p.ip;
      nodes.set(p.ip, { ...p, seen: Date.now() });
      if (onNodes) onNodes([...nodes.values()]);
    });
    // listen on the Art-Net port to hear the replies; if another program has it, we can still send
    try { sock.bind(PORT, () => { try { sock.setBroadcast(true); } catch (e) { /* ignore */ } }); }
    catch (e) { try { sock.bind(0, () => sock.setBroadcast(true)); } catch (x) { /* ignore */ } }
    keep = setInterval(() => { if (last) send(last); }, 1000);
  }
  function targets() { if (cfg.host) return [cfg.host]; const b = broadcasts().filter(x => x !== '255.255.255.255'); return b.length ? b : ['255.255.255.255']; }
  function send(data) {
    if (!sock) open();
    last = data;
    seq = seq % 255 + 1;
    const pkt = dmxPacket(seq, cfg.universe, data);
    for (const h of targets()) sock.send(pkt, cfg.port || PORT, h, () => {});
  }
  function poll() {
    if (!sock) open();
    const p = pollPacket();
    for (const h of broadcasts()) sock.send(p, PORT, h, () => {});
  }
  function config(o) {
    cfg = { host: typeof o.host === 'string' ? o.host.trim() : '', universe: Number.isInteger(o.universe) ? Math.max(0, Math.min(32767, o.universe)) : 0, port: Number.isInteger(o.port) ? o.port : PORT };
    open();
  }
  function close() {
    clearInterval(keep); keep = null; last = null;
    try { if (sock) sock.close(); } catch (e) { /* closed */ }
    sock = null;
  }
  return { send, poll, config, close, get nodes() { return [...nodes.values()]; }, get open() { return !!sock; } };
}

module.exports = { createSender, dmxPacket, pollPacket, parsePacket, broadcasts, PORT };
