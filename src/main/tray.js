'use strict';

const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');

let tray = null;

const iconPath = () =>
  path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'tray.png');

function buildMenu(win) {
  return Menu.buildFromTemplate([
    {
      label: 'Show Brewer',
      click: () => {
        win.show();
        win.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function createTray(win) {
  if (tray) return tray;

  const image = nativeImage.createFromPath(iconPath());
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);

  tray.setToolTip('Brewer');
  tray.setContextMenu(buildMenu(win));

  // Left-clicking a tray icon does nothing on most Linux desktops, but it is
  // the expected show/hide toggle on Windows.
  tray.on('click', () => {
    if (win.isVisible() && !win.isMinimized()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  return tray;
}

function destroyTray() {
  if (tray) { tray.destroy(); tray = null; }
}

function updateTrayTooltip(unread) {
  if (!tray) return;
  tray.setToolTip(unread > 0 ? `Brewer — ${unread} unread` : 'Brewer');
}

module.exports = { createTray, destroyTray, updateTrayTooltip };
