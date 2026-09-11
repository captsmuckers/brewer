'use strict';

const servers = require('./servers');

// What a Sharkord tab legitimately needs. v0.2 allowed only media and
// display-capture, which is why desktop notifications never appeared and the
// fullscreen button on video tiles did nothing.
const GRANTED = new Set([
  'media',
  'audioCapture',
  'videoCapture',
  'display-capture',
  'notifications',
  'fullscreen',
  'clipboard-read',
  'clipboard-sanitized-write',
  'pointerLock'
]);

function isKnownServerOrigin(url) {
  if (!url) return false;

  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }

  return servers.list().some((s) => s.url === origin);
}

/**
 * Only pages served by a server the user actually added get hardware access.
 * Without this, any page a webview wandered onto -- an OIDC provider, a link
 * followed in-place -- inherited camera and microphone rights.
 */
function registerPermissions(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    // Which field carries the origin depends on the permission being asked for.
    const origin =
      (details && (details.requestingUrl || details.securityOrigin)) ||
      (webContents && webContents.getURL());
    const allowed = GRANTED.has(permission) && isKnownServerOrigin(origin);

    if (!allowed) {
      console.log(`[brewer] denied "${permission}" for ${origin || 'unknown origin'}`);
    }

    callback(allowed);
  });

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return GRANTED.has(permission) && isKnownServerOrigin(requestingOrigin);
  });
}

module.exports = { registerPermissions, isKnownServerOrigin };
