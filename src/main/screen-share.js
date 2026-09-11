'use strict';

const { BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');

// Electron can only mix system audio into a display-capture stream on Windows
// ("loopback"). Elsewhere the stream is video-only and the user has to route
// desktop audio in as a microphone -- see README for the PipeWire recipe.
const SUPPORTS_LOOPBACK_AUDIO = process.platform === 'win32';

// Each in-flight getDisplayMedia() call gets its own entry. v0.2 kept a single
// module-level callback, so two servers asking to share at once clobbered
// each other and one of them hung forever.
const pending = new Map();
let nextRequestId = 1;

function buildSourceList(sources) {
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.id.startsWith('screen') ? 'screen' : 'window',
    thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
  }));
}

function resolve(requestId, streams) {
  const entry = pending.get(requestId);
  if (!entry) return;

  pending.delete(requestId);

  if (entry.window && !entry.window.isDestroyed()) {
    entry.window.removeAllListeners('closed');
    entry.window.close();
  }

  try {
    entry.callback(streams);
  } catch (err) {
    console.error('[brewer] display-media callback failed:', err.message);
  }
}

function cancel(requestId) {
  // An empty stream set is how a display-media request is declined.
  resolve(requestId, {});
}

async function openPicker(parentWindow, requestId) {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true
  });

  const pickerWindow = new BrowserWindow({
    width: 900,
    height: 640,
    parent: parentWindow || undefined,
    modal: !!parentWindow,
    show: false,
    title: 'Choose what to share',
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'picker.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const entry = pending.get(requestId);
  if (!entry) { pickerWindow.destroy(); return; }
  entry.window = pickerWindow;

  pickerWindow.loadFile(path.join(__dirname, '..', 'renderer', 'picker', 'index.html'));

  pickerWindow.once('ready-to-show', () => pickerWindow.show());

  pickerWindow.webContents.once('did-finish-load', () => {
    pickerWindow.webContents.send('picker:sources', {
      requestId,
      sources: buildSourceList(sources),
      audio: {
        supported: SUPPORTS_LOOPBACK_AUDIO,
        enabled: store.getSettings().shareSystemAudio && SUPPORTS_LOOPBACK_AUDIO,
        platform: process.platform
      }
    });
  });

  // Closing the picker with no choice must decline the request, otherwise the
  // page's getDisplayMedia() promise never settles.
  pickerWindow.on('closed', () => {
    const current = pending.get(requestId);
    if (current) { current.window = null; cancel(requestId); }
  });
}

function registerScreenShare(ses, getParentWindow) {
  const handler = (request, callback) => {
    const requestId = nextRequestId++;
    pending.set(requestId, { callback, window: null });

    openPicker(getParentWindow(), requestId).catch((err) => {
      console.error('[brewer] could not enumerate capture sources:', err.message);
      cancel(requestId);
    });
  };

  // `useSystemPicker` is ignored on platforms that lack one, and older builds
  // reject the options argument outright.
  try {
    ses.setDisplayMediaRequestHandler(handler, {
      useSystemPicker: !!store.getSettings().useSystemPicker
    });
  } catch {
    ses.setDisplayMediaRequestHandler(handler);
  }
}

function registerScreenShareIpc() {
  ipcMain.on('picker:choose', async (_event, { requestId, sourceId, withAudio }) => {
    if (!pending.has(requestId)) return;

    try {
      // Re-fetch so we hand Electron a live source handle rather than the
      // serialisable copy the picker was rendered from.
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = sources.find((s) => s.id === sourceId);

      if (!source) { cancel(requestId); return; }

      const streams = { video: source };

      if (withAudio && SUPPORTS_LOOPBACK_AUDIO) {
        streams.audio = 'loopback';
        // Don't replay the captured desktop audio back through the local
        // speakers; the sharer already hears it from the source application.
        streams.enableLocalEcho = false;
      }

      store.setSettings({ shareSystemAudio: !!withAudio });
      resolve(requestId, streams);
    } catch (err) {
      console.error('[brewer] failed to resolve capture source:', err.message);
      cancel(requestId);
    }
  });

  ipcMain.on('picker:cancel', (_event, { requestId }) => cancel(requestId));
}

module.exports = { registerScreenShare, registerScreenShareIpc, SUPPORTS_LOOPBACK_AUDIO };
