/* Automatic check of the desktop features (run: npm test). Everything runs hidden and exits. */
const { Server: OscServer, Client: OscClient } = require('node-osc');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

module.exports = async function run({ app, mainWin, base, port, startSpout, stopSpout, spoutStats, startOsc, stopOsc, bridge }) {
  const out = { port };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const js = code => mainWin.webContents.executeJavaScript(code, true);
  const finish = code => {
    const txt = JSON.stringify(out, null, 1);
    console.log('NODRUS_TEST_RESULT ' + txt);
    for (const dir of [__dirname, app.getPath('temp')]) { try { fs.writeFileSync(path.join(dir, 'nodrus-test-result.json'), txt); break; } catch (e) { /* inside the package: use temp */ } }
    stopSpout(); stopOsc();
    setTimeout(() => app.exit(code), 200);
  };
  try {
    await new Promise(r => { if (mainWin.webContents.isLoading()) mainWin.webContents.once('did-finish-load', r); else r(); });
    await wait(2500);
    out.editor = await js('({ editor: !!window.__nodesEditor, desktop: !!window.nodrusDesktop, deskBtn: !document.getElementById("btnDesk").hidden, title: document.title })');

    // 1) Spout: start, count frames, receive them back with a Spout receiver
    out.spoutStart = startSpout({ name: 'NODRUS-TEST', width: 640, height: 360, fps: 30 });
    await wait(4000);
    out.spoutStats = spoutStats();
    if (bridge) {
      const r = new bridge.TextureReceiver('NODRUS-TEST');
      let frame = null;
      for (let i = 0; i < 80 && !frame; i++) { await wait(50); if (r.hasNewFrame()) frame = r.receiveFrame(); }
      if (frame) {
        let sum = 0, n = 0; for (let i = 0; i < frame.data.length; i += 4 * 97) { sum += frame.data[i] + frame.data[i + 1] + frame.data[i + 2]; n++; }
        out.spoutReceived = { width: frame.width, height: frame.height, avg: Math.round(sum / n / 3) };
      } else out.spoutReceived = { none: true, connected: r.isConnected() };
      try { r.stop(); } catch (e) { /* stopped */ }
      out.senders = bridge.listSenders().map(s => s.name || s);
    }

    // 2) OSC: listen to what NODRUS sends, then send commands to it
    const got = [];
    const listen = new OscServer(9201, '127.0.0.1');
    listen.on('message', m => got.push(m[0]));
    // turn OSC on from the panel, like a user would
    await js('document.getElementById("dkOscIn").value = 9200; document.getElementById("dkOscHost").value = "127.0.0.1"; document.getElementById("dkOscOut").value = 9201; document.getElementById("dkOscOn").checked = true; document.getElementById("dkOscOn").dispatchEvent(new Event("change"))');
    await wait(1200);
    const cli = new OscClient('127.0.0.1', 9200);
    await cli.send('/nodrus/deck', 'B'); await cli.send('/nodrus/xf', 0.5); await cli.send('/nodrus/bpm', 128);
    await wait(800);
    out.oscIn = await js('({ deck: __nodesEditor.deck, xf: __nodesEditor.stage.x, bpm: __nodesEditor.bpm })');
    out.oscOut = { count: got.length, addresses: [...new Set(got)].slice(0, 6) };
    await cli.close(); listen.close();

    // 3) a phone over the wifi (WebSocket)
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const msgs = [];
    ws.on('message', d => { try { msgs.push(JSON.parse(String(d))); } catch (e) { /* ignore */ } });
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    await wait(800);
    const st = msgs.find(m => m.t === 'state');
    out.phoneState = st ? { controls: st.controls.length, scenes: st.scenes.length, deck: st.deck } : null;
    ws.send(JSON.stringify({ t: 'xf', v: 0.2 }));
    await wait(500);
    out.phoneXf = await js('__nodesEditor.stage.x');
    ws.close();

    // 4) the phone page and libraries are served locally
    const get = p => new Promise(res => require('http').get(base + p, r => { let n = 0; r.on('data', c => { n += c.length; }); r.on('end', () => res({ status: r.statusCode, bytes: n })); }).on('error', e => res({ error: e.message })));
    out.served = { control: await get('/lab/nodes/control/?ws'), qrcode: await get('/vendor/qrcode.js'), mp4: await get('/vendor/mp4-muxer.js'), outside: await get('/../../desktop/main.js'), secret: await get('/desktop/main.js') };
    out.remoteUrl = await js('document.getElementById("rmUrl") ? (window.__nodesEditor && "ok") : "?"');
    out.errorsInEditor = await js('window.__deskErrors || []');
    finish(0);
  } catch (e) {
    out.fail = String(e.stack || e);
    finish(1);
  }
};
