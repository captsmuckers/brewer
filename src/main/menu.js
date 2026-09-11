'use strict';

const { Menu, shell, app } = require('electron');

const REPO_URL = 'https://github.com/captsmuckers/brewer';

// Menu items that act on the active server view are forwarded to the shell
// renderer, which owns the <webview> elements.
const toShell = (win, channel, payload) => () => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

function buildAppMenu(win) {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Add Server…',
          accelerator: 'CommandOrControl+N',
          click: toShell(win, 'shell:add-server')
        },
        {
          label: 'Refresh Server Info',
          click: toShell(win, 'shell:refresh-servers')
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CommandOrControl+,',
          click: toShell(win, 'shell:open-settings')
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // Without an Edit menu the standard clipboard accelerators are not bound,
    // so Ctrl+C / Ctrl+V would silently do nothing inside a webview.
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Server',
          accelerator: 'CommandOrControl+R',
          click: toShell(win, 'shell:reload-view')
        },
        {
          label: 'Force Reload Server',
          accelerator: 'CommandOrControl+Shift+R',
          click: toShell(win, 'shell:reload-view', { ignoreCache: true })
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CommandOrControl+Plus',
          click: toShell(win, 'shell:zoom', 1)
        },
        {
          label: 'Zoom Out',
          accelerator: 'CommandOrControl+-',
          click: toShell(win, 'shell:zoom', -1)
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CommandOrControl+0',
          click: toShell(win, 'shell:zoom', 0)
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Toggle Server DevTools',
          accelerator: 'CommandOrControl+Shift+I',
          click: toShell(win, 'shell:toggle-devtools')
        },
        {
          label: 'Toggle Brewer DevTools',
          accelerator: 'CommandOrControl+Shift+Alt+I',
          click: () => win.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Server',
      submenu: [
        {
          label: 'Next Server',
          accelerator: 'Control+Tab',
          click: toShell(win, 'shell:cycle', 1)
        },
        {
          label: 'Previous Server',
          accelerator: 'Control+Shift+Tab',
          click: toShell(win, 'shell:cycle', -1)
        },
        { type: 'separator' },
        { label: 'Jump to a server with Ctrl+1 to Ctrl+9', enabled: false }
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: `Brewer ${app.getVersion()}`, enabled: false },
        { type: 'separator' },
        { label: 'Brewer on GitHub', click: () => shell.openExternal(REPO_URL) },
        { label: 'Sharkord Documentation', click: () => shell.openExternal('https://sharkord.com/docs') }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildAppMenu };
