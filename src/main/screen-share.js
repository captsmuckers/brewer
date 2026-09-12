'use strict';

const { BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');

// Electron can only mix system audio into a display-capture stream on Windows
// ("loopback"). Elsewhere the stream is video-only.
const SUPPORTS_LOOPBACK_AUDIO = process.platform === 'win32';

// On Wayland, desktopCapturer.getSources() is not a silent enumeration: it
// opens an xdg-desktop-portal session, which is the compositor's own "what do
// you want to share?" dialog. The portal is therefore the picker, and calling
// getSources() a second time starts a NEW session whose PipeWire node ids do
// not match the first one's.
const IS_WAYLAND =
  process.platform === 'linux' &&
  (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);

// Each in-flight getDisplayMedia() call gets its own entry, holding the source
// objects from its single getSources() call. Looking a selection back up in
// this array -- rather than re-enumerating -- is what keeps the Wayland
// session alive and avoids re-prompting.
const pending = new Map();
let nextRequestId = 1;

function serializeSources(sources) {
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.id.startsWith('screen') ? 'screen' : 'window',
    thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null,
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

// An empty stream set is how a display-media request is declined.
const cancel = (requestId) => resolve(requestId, {});

function buildStreams(source, withAudio) {
  const streams = { video: source };

  if (withAudio && SUPPORTS_LOOPBACK_AUDIO) {
    streams.audio = 'loopback';
    // Don't replay captured desktop audio through the local speakers.
    streams.enableLocalEcho = false;
  }

  return streams;
}

function openPicker(parentWindow, requestId, sources) {
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
      sources: serializeSources(sources),
      audio: {
        supported: SUPPORTS_LOOPBACK_AUDIO,
        enabled: store.getSettings().shareSystemAudio && SUPPORTS_LOOPBACK_AUDIO,
        platform: process.platform
      }
    });
  });

  // Closing the picker without choosing must decline, or the page's
  // getDisplayMedia() promise never settles.
  pickerWindow.on('closed', () => {
    const current = pending.get(requestId);
    if (current) { current.window = null; cancel(requestId); }
  });
}

async function handleRequest(requestId, parentWindow) {
  // The one and only enumeration for this request. On Wayland this is what
  // raises the portal dialog; on X11 and Windows it is silent.
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: IS_WAYLAND ? { width: 0, height: 0 } : { width: 480, height: 270 },
    fetchWindowIcons: !IS_WAYLAND
  });

  const entry = pending.get(requestId);
  if (!entry) return;

  entry.sources = sources;

  if (sources.length === 0) { cancel(requestId); return; }

  // The portal already asked the user what to share; showing our own picker
  // on top of that would be a second dialog for a decision already made.
  if (IS_WAYLAND && sources.length === 1) {
    const withAudio = store.getSettings().shareSystemAudio && SUPPORTS_LOOPBACK_AUDIO;
    resolve(requestId, buildStreams(sources[0], withAudio));
    return;
  }

  openPicker(parentWindow, requestId, sources);
}

function registerScreenShare(ses, getParentWindow) {
  const handler = (request, callback) => {
    const requestId = nextRequestId++;
    pending.set(requestId, { callback, window: null, sources: [] });

    handleRequest(requestId, getParentWindow()).catch((err) => {
      // A cancelled portal dialog lands here too, which is a decline.
      console.error('[brewer] could not start screen capture:', err.message);
      cancel(requestId);
    });
  };

  // useSystemPicker is macOS 15+ only; passing it elsewhere does nothing.
  if (process.platform === 'darwin') {
    ses.setDisplayMediaRequestHandler(handler, {
      useSystemPicker: !!store.getSettings().useSystemPicker
    });
  } else {
    ses.setDisplayMediaRequestHandler(handler);
  }
}

function registerScreenShareIpc() {
  ipcMain.on('picker:choose', (_event, { requestId, sourceId, withAudio }) => {
    const entry = pending.get(requestId);
    if (!entry) return;

    // Look the selection up in the sources this request already fetched.
    // Re-enumerating here was the bug: on Wayland it opened a second portal
    // session whose ids never matched, so every share attempt re-prompted and
    // then failed.
    const source = entry.sources.find((s) => s.id === sourceId);

    if (!source) { cancel(requestId); return; }

    store.setSettings({ shareSystemAudio: !!withAudio });
    resolve(requestId, buildStreams(source, withAudio));
  });

  ipcMain.on('picker:cancel', (_event, { requestId }) => cancel(requestId));
}

module.exports = {
  registerScreenShare,
  registerScreenShareIpc,
  SUPPORTS_LOOPBACK_AUDIO,
  IS_WAYLAND
};
