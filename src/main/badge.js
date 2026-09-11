'use strict';

const { app, nativeImage } = require('electron');

let current = 0;

/**
 * Show the total unread count on the launcher.
 *
 * `app.setBadgeCount` covers macOS and Linux desktops that implement the Unity
 * launcher API; Windows has no equivalent, so the renderer draws a small badge
 * on a canvas and we stamp it onto the taskbar button as an overlay icon.
 */
function setBadge(win, count, overlayDataUrl) {
  const total = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  if (total === current) return;
  current = total;

  try {
    app.setBadgeCount(total);
  } catch {
    // unsupported desktop environment; the overlay below may still work
  }

  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;

  if (!total || !overlayDataUrl) {
    win.setOverlayIcon(null, '');
    return;
  }

  const image = nativeImage.createFromDataURL(overlayDataUrl);
  if (!image.isEmpty()) {
    win.setOverlayIcon(image, `${total} unread`);
  }
}

module.exports = { setBadge };
