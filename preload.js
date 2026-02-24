const { contextBridge, ipcRenderer } = require('electron');

// This creates a secure tunnel between our custom HTML menu and the background app
contextBridge.exposeInMainWorld('electronAPI', {
    onSources: (callback) => ipcRenderer.on('set-sources', (_event, sources) => callback(sources)),
    selectSource: (sourceId) => ipcRenderer.send('source-selected', sourceId)
});