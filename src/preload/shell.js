'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('brewer', {
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    add: (input) => ipcRenderer.invoke('servers:add', input),
    remove: (id) => ipcRenderer.invoke('servers:remove', id),
    update: (id, patch) => ipcRenderer.invoke('servers:update', id, patch),
    reorder: (ids) => ipcRenderer.invoke('servers:reorder', ids),
    refresh: () => ipcRenderer.invoke('servers:refresh'),
    startUrl: (id) => ipcRenderer.invoke('servers:start-url', id),
    probe: (origin) => ipcRenderer.invoke('servers:probe', origin),
    importLegacy: (legacy) => ipcRenderer.invoke('servers:import-legacy', legacy)
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },

  app: {
    info: () => ipcRenderer.invoke('app:info'),
    setBadge: (total, overlayDataUrl) =>
      ipcRenderer.send('app:badge', { total, overlayDataUrl }),
    openExternal: (url) => ipcRenderer.send('app:open-external', url),
    copy: (text) => ipcRenderer.send('app:copy', text),
    confirm: (options) => ipcRenderer.invoke('app:confirm', options)
  },

  // Menu accelerators are owned by the main process; it forwards the ones that
  // act on the active server view down here.
  onAddServer: on('shell:add-server'),
  onOpenSettings: on('shell:open-settings'),
  onRefreshServers: on('shell:refresh-servers'),
  onServersRefreshed: on('shell:servers-refreshed'),
  onReloadView: on('shell:reload-view'),
  onToggleDevTools: on('shell:toggle-devtools'),
  onZoom: on('shell:zoom'),
  onCycle: on('shell:cycle'),
  onSelectIndex: on('shell:select-index'),
  onViewCrashed: on('shell:view-crashed')
});
