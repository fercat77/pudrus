/* What the editor page can ask the desktop app for (nothing else is exposed). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nodrusDesktop', {
  info: () => ipcRenderer.invoke('info'),
  // phones connected over the wifi
  onRemote: cb => { ipcRenderer.on('remote', (e, m) => cb(m)); },
  sendRemote: (id, msg) => ipcRenderer.send('remote-send', id, msg),
  spout: {
    start: o => ipcRenderer.invoke('spout-start', o),
    stop: slot => ipcRenderer.invoke('spout-stop', slot),
    config: o => ipcRenderer.invoke('spout-config', o),
    stats: () => ipcRenderer.invoke('spout-stats'),
  },
  osc: {
    start: o => ipcRenderer.invoke('osc-start', o),
    stop: () => ipcRenderer.invoke('osc-stop'),
    send: (addr, args) => ipcRenderer.send('osc-send', addr, args),
    on: cb => { ipcRenderer.on('osc', (e, m) => cb(m)); },
    onError: cb => { ipcRenderer.on('osc-error', (e, m) => cb(m)); },
  },
  setDisplay: id => ipcRenderer.invoke('set-display', id),
  metrics: () => ipcRenderer.invoke('metrics'),
});
