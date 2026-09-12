'use strict';

const { ipcMain, app, dialog, clipboard } = require('electron');
const servers = require('./servers');
const store = require('./store');
const badge = require('./badge');
const tray = require('./tray');
const { parseServerInput, probeServer } = require('./sharkord');
const { IS_WAYLAND } = require('./screen-share');
const { openExternally } = require('./web-contents');

// The tray only exists while some setting actually needs it, so toggling
// either tray option in Settings has to create or tear it down immediately.
function syncTray(win, settings) {
  if (!win || win.isDestroyed()) return;

  if (settings.minimizeToTray || settings.closeToTray) tray.createTray(win);
  else tray.destroyTray();
}

function registerIpc(getMainWindow) {
  ipcMain.handle('servers:list', () => servers.list());

  ipcMain.handle('servers:add', async (_e, rawInput) => {
    try {
      const { server, duplicate } = await servers.add(rawInput);
      return { ok: true, server, duplicate };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('servers:remove', (_e, id) => servers.remove(id));
  ipcMain.handle('servers:update', (_e, id, patch) => servers.update(id, patch));
  ipcMain.handle('servers:reorder', (_e, ids) => servers.reorder(ids));
  ipcMain.handle('servers:refresh', () => servers.refreshAll());
  ipcMain.handle('servers:start-url', (_e, id) => servers.takeStartUrl(id));
  ipcMain.handle('servers:import-legacy', (_e, legacy) => servers.importLegacy(legacy));
  // Takes whatever the user has typed so far, so the add dialog can preview
  // the server before it is committed.
  ipcMain.handle('servers:probe', async (_e, rawInput) => {
    try {
      const { origin } = parseServerInput(rawInput);
      return await probeServer(origin);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = store.setSettings(patch);
    syncTray(getMainWindow(), next);
    return next;
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    wayland: IS_WAYLAND
  }));

  // The renderer owns unread state (it reads every view's title), so it tells
  // us the total and hands over a pre-rendered overlay for the Windows taskbar.
  ipcMain.on('app:badge', (_e, { total, overlayDataUrl }) => {
    badge.setBadge(getMainWindow(), total, overlayDataUrl);
    tray.updateTrayTooltip(total);
  });

  ipcMain.on('app:open-external', (_e, url) => openExternally(url));

  // navigator.clipboard is unreliable for a file:// document, so copying goes
  // through Electron's own clipboard instead.
  ipcMain.on('app:copy', (_e, text) => clipboard.writeText(String(text || '')));

  ipcMain.handle('app:confirm', async (_e, { title, message, detail, confirmLabel }) => {
    const win = getMainWindow();
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: [confirmLabel || 'Remove', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: title || 'Brewer',
      message: message || '',
      detail: detail || ''
    });

    return response === 0;
  });
}

module.exports = { registerIpc };
