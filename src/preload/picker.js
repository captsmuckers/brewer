'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  onSources: (callback) => {
    ipcRenderer.on('picker:sources', (_event, payload) => callback(payload));
  },
  choose: (requestId, sourceId, withAudio) =>
    ipcRenderer.send('picker:choose', { requestId, sourceId, withAudio }),
  cancel: (requestId) => ipcRenderer.send('picker:cancel', { requestId })
});
