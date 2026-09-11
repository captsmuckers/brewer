'use strict';

const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const store = require('./store');
const servers = require('./servers');
const { registerPermissions } = require('./permissions');
const { registerScreenShare, registerScreenShareIpc } = require('./screen-share');
const { registerWebContents } = require('./web-contents');
const { registerIpc } = require('./ipc');
const { buildAppMenu } = require('./menu');
const { createTray, destroyTray } = require('./tray');
const { getStartupBounds, trackWindow } = require('./window-state');

let mainWindow = null;
const getMainWindow = () => mainWindow;

// Only one Brewer at a time: a second launch focuses the existing window
// instead of opening a rival copy that would fight over brewer.json.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  start();
}

function start() {
  // Must be decided before `ready`, which is why toggling it needs a restart.
  if (!safeGetSetting('hardwareAcceleration', true)) {
    app.disableHardwareAcceleration();
  }

  app.whenReady().then(onReady);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWindow) mainWindow.show();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    store.flush();
  });

  app.on('will-quit', destroyTray);
}

// store.load() touches app.getPath(), which is safe before ready, but guard
// anyway so a bad config file can never stop the app from starting.
function safeGetSetting(key, fallback) {
  try {
    return store.getSettings()[key];
  } catch {
    return fallback;
  }
}

function onReady() {
  const ses = session.defaultSession;

  registerPermissions(ses);
  registerScreenShare(ses, getMainWindow);
  registerScreenShareIpc();
  registerWebContents(getMainWindow);
  registerIpc(getMainWindow);

  createMainWindow();
}

function createMainWindow() {
  const { bounds, maximized } = getStartupBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    title: 'Brewer',
    icon: path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#1e1f22',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: safeGetSetting('spellcheck', true)
    }
  });

  if (maximized) mainWindow.maximize();

  buildAppMenu(mainWindow);
  trackWindow(mainWindow);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'shell', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!safeGetSetting('startMinimized', false)) mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    // Keep voice connections alive in the background when asked to.
    if (!app.isQuitting && safeGetSetting('closeToTray', false)) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('minimize', (event) => {
    if (safeGetSetting('minimizeToTray', false)) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  if (safeGetSetting('closeToTray', false) || safeGetSetting('minimizeToTray', false)) {
    createTray(mainWindow);
  }

  // Warm the server list so names, icons and versions are current on launch.
  // This has to wait for the renderer: anything sent before it finishes
  // loading arrives before the listener exists and is silently dropped.
  mainWindow.webContents.once('did-finish-load', () => {
    servers.refreshAll().then((list) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shell:servers-refreshed', list);
      }
    }).catch(() => { /* launching offline is fine */ });
  });
}
