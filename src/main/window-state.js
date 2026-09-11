'use strict';

const { screen } = require('electron');
const store = require('./store');

const DEFAULTS = { width: 1400, height: 900 };

/** Restore the previous geometry, but never off-screen or larger than the display. */
function getStartupBounds() {
  const saved = store.getWindowState();
  const area = screen.getPrimaryDisplay().workAreaSize;

  const width = Math.min(saved?.width || DEFAULTS.width, area.width);
  const height = Math.min(saved?.height || DEFAULTS.height, area.height);

  const bounds = { width, height };

  if (Number.isInteger(saved?.x) && Number.isInteger(saved?.y)) {
    const visible = screen.getAllDisplays().some((display) => {
      const { x, y, width: w, height: h } = display.workArea;
      return saved.x >= x && saved.y >= y && saved.x < x + w && saved.y < y + h;
    });

    if (visible) { bounds.x = saved.x; bounds.y = saved.y; }
  }

  return { bounds, maximized: !!saved?.maximized };
}

function trackWindow(win) {
  const record = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;

    const maximized = win.isMaximized();
    // A maximized window reports the maximized rect; keep the restore size.
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();

    store.setWindowState({ ...bounds, maximized });
  };

  let timer = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(record, 400);
  };

  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', record);
  win.on('unmaximize', record);
  win.on('close', () => { if (timer) clearTimeout(timer); record(); });
}

module.exports = { getStartupBounds, trackWindow };
