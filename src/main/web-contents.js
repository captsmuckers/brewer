'use strict';

const { app, shell, Menu, clipboard } = require('electron');
const path = require('path');
const store = require('./store');

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function openExternally(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  // Never hand arbitrary protocol handlers (file:, custom schemes) to the OS.
  if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) return;

  shell.openExternal(url);
}

function buildContextMenu(contents, params) {
  const items = [];

  if (params.linkURL) {
    items.push(
      { label: 'Open Link in Browser', click: () => openExternally(params.linkURL) },
      { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
      { type: 'separator' }
    );
  }

  if (params.mediaType === 'image' && params.srcURL) {
    items.push(
      { label: 'Open Image in Browser', click: () => openExternally(params.srcURL) },
      { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
      { type: 'separator' }
    );
  }

  // Spelling suggestions come from Chromium's dictionary for the active language.
  if (params.misspelledWord && params.dictionarySuggestions.length) {
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
    }
    items.push({ type: 'separator' });
  }

  if (params.isEditable) {
    items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' });
  }

  items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' });

  if (params.isEditable) items.push({ role: 'selectAll' });

  items.push(
    { type: 'separator' },
    { label: 'Reload', click: () => contents.reload() },
    { label: 'Inspect Element', click: () => contents.inspectElement(params.x, params.y) }
  );

  return Menu.buildFromTemplate(items);
}

/**
 * Ctrl+1..9 has to work while focus is inside a server view, and a guest
 * webContents never bubbles its keys up to the shell renderer -- so the jump
 * shortcuts are intercepted here and forwarded.
 *
 * Ctrl+Tab is deliberately left to the application menu, which already fires
 * app-wide; handling it here too would cycle twice per press.
 */
function forwardJumpShortcuts(contents, getMainWindow) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt || input.shift) return;

    const modifier = process.platform === 'darwin' ? input.meta : input.control;
    if (!modifier) return;
    if (!/^[1-9]$/.test(input.key)) return;

    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    win.webContents.send('shell:select-index', Number(input.key) - 1);
    event.preventDefault();
  });
}

function registerWebContents(getMainWindow) {
  app.on('web-contents-created', (_event, contents) => {
    const type = contents.getType();

    // Lock down what a <webview> is allowed to be created with, regardless of
    // the attributes present on the element in the renderer.
    contents.on('will-attach-webview', (_e, webPreferences, params) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.webSecurity = true;
      webPreferences.allowRunningInsecureContent = false;
      params.allowpopups = 'true';
    });

    // `target="_blank"` links -- posted in chat, or the docs links in the UI --
    // belong in the user's real browser, not in a chrome-less Electron window.
    contents.setWindowOpenHandler(({ url }) => {
      openExternally(url);
      return { action: 'deny' };
    });

    if (type === 'webview') {
      // Sharkord signs in through a full-page redirect to the identity
      // provider and back (helpers/oidc.ts sets window.location.href), so
      // in-place navigation to another origin must be allowed to proceed.
      contents.on('context-menu', (_e, params) => {
        buildContextMenu(contents, params).popup();
      });

      contents.on('render-process-gone', (_e, details) => {
        console.error('[brewer] server view crashed:', details.reason);
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('shell:view-crashed', { reason: details.reason });
        }
      });

      forwardJumpShortcuts(contents, getMainWindow);

      if (store.getSettings().spellcheck) {
        contents.session.setSpellCheckerEnabled(true);
      }
    }
  });
}

module.exports = { registerWebContents, openExternally };
