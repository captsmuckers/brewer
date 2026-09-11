'use strict';

const { net } = require('electron');

const PROBE_TIMEOUT_MS = 8000;

// Sharkord serves an unauthenticated identity document at /info. It is the
// supported way to learn a server's name, logo and version -- the old trick of
// scraping `img[alt="Sharkord"]` out of the DOM only ever saw the generic logo
// on the pre-login connect screen.
async function fetchJson(url, signal) {
  const res = await net.fetch(url, {
    signal,
    cache: 'no-store',
    headers: { accept: 'application/json' }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  return { body: await res.json(), headers: res.headers };
}

/**
 * Turn whatever the user pasted into an origin plus an optional invite code.
 * Accepts bare hosts, full URLs, and invite links (`https://host/?invite=CODE`).
 */
function parseServerInput(raw) {
  let text = String(raw || '').trim();
  if (!text) throw new Error('Enter a server address');

  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('That does not look like a valid address');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https addresses are supported');
  }

  const invite = url.searchParams.get('invite') || undefined;

  return { origin: url.origin, invite };
}

function iconUrlFor(origin, info) {
  // A server with a custom logo exposes it as a public file; everything else
  // falls back to the PWA icon the server generates.
  if (info && info.logo && typeof info.logo.name === 'string') {
    return `${origin}/public/${encodeURIComponent(info.logo.name)}`;
  }
  return `${origin}/icon-192.png`;
}

/**
 * Ask a server who it is. Never throws -- callers get `{ ok: false, error }`
 * so an unreachable server still renders in the rail.
 */
async function probeServer(origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const { body, headers } = await fetchJson(`${origin}/info`, controller.signal);

    return {
      ok: true,
      origin,
      serverId: body.serverId,
      name: typeof body.name === 'string' && body.name ? body.name : hostLabel(origin),
      description: body.description || '',
      version: body.version || headers.get('x-sharkord-version') || undefined,
      allowNewUsers: !!body.allowNewUsers,
      oidcEnabled: !!body.oidcEnabled,
      oidcDisableLocalLogin: !!body.oidcDisableLocalLogin,
      iconUrl: iconUrlFor(origin, body)
    };
  } catch (err) {
    return {
      ok: false,
      origin,
      name: hostLabel(origin),
      iconUrl: `${origin}/icon-192.png`,
      error: err.name === 'AbortError' ? 'Timed out' : err.message
    };
  } finally {
    clearTimeout(timer);
  }
}

function hostLabel(origin) {
  try {
    return new URL(origin).hostname.replace(/^www\./, '');
  } catch {
    return origin;
  }
}

module.exports = { parseServerInput, probeServer, hostLabel };
