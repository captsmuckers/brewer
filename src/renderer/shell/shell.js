'use strict';

const api = window.brewer;

const railList = document.getElementById('server-list');
const viewsRoot = document.getElementById('views');
const welcome = document.getElementById('welcome');
const contextMenu = document.getElementById('context-menu');

/** @type {Array<object>} */
let servers = [];
/** @type {Map<string, {el: HTMLElement, webview: Electron.WebviewTag, unread: number, zoom: number, failed: boolean}>} */
const views = new Map();
let activeId = null;
let settings = {};
let appInfo = {};

/* ------------------------------------------------------------------ *
 * Sharkord integration
 * ------------------------------------------------------------------ */

/**
 * Sharkord appends its unread count to the document title:
 *   "My Server (7)" -> 7 unread
 * (getDocumentTitle in apps/client/src/components/routing/helpers.ts, which
 * only adds the suffix when the client is connected and has unreads.)
 *
 * The bare title is NOT a sign-in signal: applyServerBranding sets
 * `document.title = info.name` as soon as /info resolves, which happens on
 * the login screen, before any account exists.
 */
function parseUnread(title) {
  const match = String(title || '').trim().match(/\((\d+)\)$/);
  return match ? Number(match[1]) : 0;
}

const displayName = (server) => server.customName || server.name || server.url;

const initials = (server) =>
  displayName(server)
    .replace(/^https?:\/\//, '')
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || '?';

/* ------------------------------------------------------------------ *
 * Rail
 * ------------------------------------------------------------------ */

/**
 * Full rebuild of the rail. Only for structural changes -- adding, removing,
 * reordering or renaming. Unread counts arrive on every title change, so those
 * go through syncRail() instead; rebuilding here would re-create the <img> for
 * every server icon several times a minute and make the rail flicker.
 */
function renderRail() {
  railList.replaceChildren();
  welcome.style.display = servers.length === 0 ? 'flex' : 'none';

  for (const server of servers) {
    railList.appendChild(buildRailItem(server));
  }

  syncRail();
}

/** Patch the parts of the rail that change as views connect and go unread. */
function syncRail() {
  for (const item of railList.children) {
    const server = servers.find((s) => s.id === item.dataset.id);
    if (!server) continue;

    const state = views.get(server.id);
    const unread = state ? state.unread : 0;

    item.classList.toggle('active', server.id === activeId);
    item.classList.toggle('unread', unread > 0);

    const indicator = item.querySelector('.indicator');
    indicator.className = 'indicator';
    indicator.textContent = '';
    indicator.removeAttribute('title');

    if (unread > 0) {
      indicator.classList.add('badge');
      indicator.textContent = unread > 99 ? '99+' : String(unread);
    }
  }

  updateBadges();
}

function buildRailItem(server) {
  const item = document.createElement('div');
  item.className = 'rail-item';
  item.dataset.id = server.id;
  item.draggable = true;

  const button = document.createElement('button');
  button.className = 'server-btn';
  button.title = `${displayName(server)}\n${server.url}`;

  const label = document.createElement('span');
  label.textContent = initials(server);
  button.appendChild(label);

  if (server.iconUrl) {
    const img = document.createElement('img');
    img.src = server.iconUrl;
    img.alt = '';
    // Fall back to initials if the server has no logo configured.
    img.addEventListener('error', () => img.remove());
    img.addEventListener('load', () => label.remove());
    button.appendChild(img);
  }

  button.addEventListener('click', () => selectServer(server.id));
  item.appendChild(button);

  // One node that syncRail() turns into an unread badge when there is one.
  const indicator = document.createElement('span');
  indicator.className = 'indicator';
  item.appendChild(indicator);

  item.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openContextMenu(server, event.clientX, event.clientY);
  });

  attachDragHandlers(item);

  return item;
}

/* ------------------------------------------------------------------ *
 * Drag to reorder
 * ------------------------------------------------------------------ */

let dragId = null;

function attachDragHandlers(item) {
  item.addEventListener('dragstart', (event) => {
    dragId = item.dataset.id;
    item.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    // Firefox/Chromium require some payload for a drag to start at all.
    event.dataTransfer.setData('text/plain', dragId);
  });

  item.addEventListener('dragend', () => {
    dragId = null;
    item.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
  });

  item.addEventListener('dragover', (event) => {
    if (!dragId || dragId === item.dataset.id) return;
    event.preventDefault();
    item.classList.add('drop-target');
  });

  item.addEventListener('dragleave', () => item.classList.remove('drop-target'));

  item.addEventListener('drop', async (event) => {
    event.preventDefault();
    item.classList.remove('drop-target');

    if (!dragId || dragId === item.dataset.id) return;

    const ids = servers.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(item.dataset.id);
    if (from === -1 || to === -1) return;

    ids.splice(to, 0, ids.splice(from, 1)[0]);
    servers = await api.servers.reorder(ids);
    renderRail();
  });
}

/* ------------------------------------------------------------------ *
 * Server views
 * ------------------------------------------------------------------ */

async function ensureView(server) {
  const existing = views.get(server.id);
  if (existing) return existing;

  const container = document.createElement('div');
  container.className = 'view';
  container.dataset.id = server.id;
  // Attach it already visible when it is the one being switched to: a
  // <webview> that receives its src while inside a display:none subtree may
  // never start loading.
  if (server.id === activeId) container.classList.add('active');

  const originBar = document.createElement('div');
  originBar.className = 'origin-bar';
  const originText = document.createElement('span');
  originBar.appendChild(originText);
  const backButton = document.createElement('button');
  backButton.textContent = 'Back to server';
  originBar.appendChild(backButton);
  container.appendChild(originBar);

  const webview = document.createElement('webview');
  // No `partition`: server pages keep using the default persistent session,
  // so anyone upgrading from v0.2 stays signed in. Origins are isolated from
  // each other by the browser anyway.
  webview.setAttribute('allowpopups', 'true');
  container.appendChild(webview);

  const overlay = document.createElement('div');
  overlay.className = 'view-overlay';
  container.appendChild(overlay);

  viewsRoot.appendChild(container);

  const state = { el: container, webview, unread: 0, zoom: server.zoom || 0, failed: false };
  views.set(server.id, state);

  backButton.addEventListener('click', () => webview.loadURL(server.url));

  wireView(server, state, originText, overlay);

  // The start URL consumes any pending invite exactly once.
  const startUrl = await api.servers.startUrl(server.id);
  webview.src = startUrl || server.url;

  return state;
}

function wireView(server, state, originText, overlay) {
  const { webview, el } = state;

  webview.addEventListener('dom-ready', () => {
    if (state.zoom) webview.setZoomLevel(state.zoom);
  });

  webview.addEventListener('page-title-updated', (event) => {
    state.unread = parseUnread(event.title);
    syncRail();
  });

  webview.addEventListener('did-start-loading', () => {
    state.failed = false;
    el.classList.remove('failed');
    overlay.replaceChildren(Object.assign(document.createElement('div'), { className: 'spinner' }));
  });

  webview.addEventListener('did-stop-loading', () => {
    // did-fail-load lands just before this one, so clearing unconditionally
    // would wipe the error we just drew.
    if (!state.failed) overlay.replaceChildren();
  });

  webview.addEventListener('did-fail-load', (event) => {
    // Sub-resources and aborted navigations are noise; only top-level failures
    // should replace the whole view. -3 is ERR_ABORTED, which a redirect --
    // the OIDC hand-off, for one -- raises routinely.
    if (!event.isMainFrame || event.errorCode === -3) return;
    showLoadError(server, state, overlay, event);
  });

  // Sharkord signs in by redirecting the whole page to the identity provider
  // and back, so leaving the origin is expected -- flag it, don't block it.
  const checkOrigin = () => {
    let sameOrigin = true;
    try {
      sameOrigin = new URL(webview.getURL()).origin === server.url;
    } catch {
      sameOrigin = true;
    }

    el.classList.toggle('off-origin', !sameOrigin);
    if (!sameOrigin) {
      originText.innerHTML = '';
      originText.append('You are on ');
      const strong = document.createElement('strong');
      try { strong.textContent = new URL(webview.getURL()).host; } catch { strong.textContent = '?'; }
      originText.append(strong, ', not ', displayName(server), '.');
    }
  };

  webview.addEventListener('did-navigate', checkOrigin);
  webview.addEventListener('did-navigate-in-page', checkOrigin);

  webview.addEventListener('enter-html-full-screen', () => document.body.classList.add('fullscreen'));
  webview.addEventListener('leave-html-full-screen', () => document.body.classList.remove('fullscreen'));

  webview.addEventListener('destroyed', () => {
    views.delete(server.id);
    el.remove();
  });
}

function showLoadError(server, state, overlay, event) {
  state.failed = true;
  state.el.classList.add('failed');

  const heading = document.createElement('h2');
  heading.textContent = `Can't reach ${displayName(server)}`;

  const detail = document.createElement('p');
  detail.append(`${server.url} did not respond (`);
  const code = document.createElement('code');
  code.textContent = event.errorDescription || `error ${event.errorCode}`;
  detail.append(code, ').');

  const retry = document.createElement('button');
  retry.className = 'btn btn-primary';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => state.webview.reload());

  overlay.replaceChildren(heading, detail, retry);
}

async function selectServer(id) {
  const server = servers.find((s) => s.id === id);
  if (!server) return;

  activeId = id;
  welcome.style.display = 'none';

  // Hide the others first so the incoming view is the only visible one by the
  // time ensureView() attaches it.
  for (const [otherId, other] of views) {
    other.el.classList.toggle('active', otherId === id);
  }

  const state = await ensureView(server);

  // The user may have switched again while the view was being created.
  if (activeId !== id) return;

  state.el.classList.toggle('active', true);
  syncRail();
  state.webview.focus();
}

/* ------------------------------------------------------------------ *
 * Unread badge
 * ------------------------------------------------------------------ */

function makeOverlayIcon(total) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, Math.PI * 2);
  ctx.fill();

  const text = total > 99 ? '99+' : String(total);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${text.length > 2 ? 13 : 19}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 16, 17);

  return canvas.toDataURL('image/png');
}

let lastBadgeTotal = -1;

function updateBadges() {
  let total = 0;
  for (const state of views.values()) total += state.unread;

  if (total === lastBadgeTotal) return;
  lastBadgeTotal = total;

  api.app.setBadge(total, total > 0 ? makeOverlayIcon(total) : null);
}

/* ------------------------------------------------------------------ *
 * Context menu
 * ------------------------------------------------------------------ */

function openContextMenu(server, x, y) {
  contextMenu.replaceChildren();

  const label = document.createElement('div');
  label.className = 'menu-label';
  label.textContent = displayName(server);
  contextMenu.appendChild(label);

  const add = (text, handler, className) => {
    const button = document.createElement('button');
    button.textContent = text;
    if (className) button.className = className;
    button.addEventListener('click', () => {
      closeContextMenu();
      handler();
    });
    contextMenu.appendChild(button);
  };

  add('Reload', () => {
    const state = views.get(server.id);
    if (state) state.webview.reload();
  });

  add('Rename…', () => openRenameDialog(server));

  add('Copy server address', () => api.app.copy(server.url));

  add('Open in browser', () => api.app.openExternal(server.url));

  const separator = document.createElement('hr');
  contextMenu.appendChild(separator);

  add('Remove server', () => removeServer(server), 'danger');

  contextMenu.classList.add('shown');

  // Keep the menu inside the window.
  const rect = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  contextMenu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
}

function closeContextMenu() {
  contextMenu.classList.remove('shown');
}

window.addEventListener('click', closeContextMenu);
window.addEventListener('blur', closeContextMenu);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeContextMenu();
});

async function removeServer(server) {
  const confirmed = await api.app.confirm({
    title: 'Remove server',
    message: `Remove ${displayName(server)}?`,
    detail: `${server.url}\n\nBrewer forgets the server. Your account on it is untouched.`,
    confirmLabel: 'Remove'
  });

  if (!confirmed) return;

  const state = views.get(server.id);
  if (state) {
    state.el.remove();
    views.delete(server.id);
  }

  await api.servers.remove(server.id);
  servers = await api.servers.list();

  if (activeId === server.id) {
    activeId = null;
    const next = servers[0];
    if (next) await selectServer(next.id);
  }

  renderRail();
}

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

const addDialog = document.getElementById('add-dialog');
const serverInput = document.getElementById('server-input');
const addSubmit = document.getElementById('add-submit');
const preview = document.getElementById('add-preview');
const previewIcon = document.getElementById('preview-icon');
const previewName = document.getElementById('preview-name');
const previewDetail = document.getElementById('preview-detail');

let probeTimer = null;
let probeToken = 0;

function openAddDialog() {
  serverInput.value = '';
  preview.className = 'preview';
  addSubmit.disabled = false;
  addDialog.showModal();
  serverInput.focus();
}

// Probe as the user types so they can see which server they are about to add
// before committing to it.
serverInput.addEventListener('input', () => {
  if (probeTimer) clearTimeout(probeTimer);

  const value = serverInput.value.trim();
  if (!value) {
    preview.className = 'preview';
    return;
  }

  probeTimer = setTimeout(async () => {
    const token = ++probeToken;
    const info = await api.servers.probe(value);

    if (token !== probeToken) return;

    preview.className = info.ok ? 'preview shown' : 'preview shown error';
    previewIcon.src = info.iconUrl || '';
    previewName.textContent = info.ok ? info.name : 'Could not reach server';
    previewDetail.textContent = info.ok
      ? [info.origin, info.version && `Sharkord ${info.version}`].filter(Boolean).join(' · ')
      : info.error || '';
  }, 400);
});

async function submitAddDialog() {
  const value = serverInput.value.trim();
  if (!value) return;

  addSubmit.disabled = true;

  const result = await api.servers.add(value);

  if (!result.ok) {
    preview.className = 'preview shown error';
    previewName.textContent = result.error;
    previewDetail.textContent = '';
    addSubmit.disabled = false;
    return;
  }

  addDialog.close();
  servers = await api.servers.list();
  renderRail();

  if (result.duplicate) {
    // Re-adding with an invite link should follow that invite in the open view.
    const state = views.get(result.server.id);
    const startUrl = await api.servers.startUrl(result.server.id);
    if (state && startUrl) state.webview.loadURL(startUrl);
  }

  await selectServer(result.server.id);
}

addSubmit.addEventListener('click', submitAddDialog);
document.getElementById('add-cancel').addEventListener('click', () => addDialog.close());

serverInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitAddDialog();
  }
});

/* --- rename --- */

const renameDialog = document.getElementById('rename-dialog');
const renameInput = document.getElementById('rename-input');
let renameTarget = null;

function openRenameDialog(server) {
  renameTarget = server;
  renameInput.value = displayName(server);
  renameDialog.showModal();
  renameInput.select();
}

async function saveRename(customName) {
  if (!renameTarget) return;

  await api.servers.update(renameTarget.id, { customName });
  servers = await api.servers.list();
  renameDialog.close();
  renameTarget = null;
  renderRail();
}

document.getElementById('rename-save')
  .addEventListener('click', () => saveRename(renameInput.value.trim() || null));
document.getElementById('rename-reset')
  .addEventListener('click', () => saveRename(null));
renameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveRename(renameInput.value.trim() || null);
  }
});

/* --- settings --- */

const settingsDialog = document.getElementById('settings-dialog');

function openSettingsDialog() {
  for (const input of settingsDialog.querySelectorAll('[data-setting]')) {
    input.checked = !!settings[input.dataset.setting];
  }
  settingsDialog.showModal();
}

settingsDialog.addEventListener('change', async (event) => {
  const input = event.target;
  if (!input.dataset || !input.dataset.setting) return;

  settings = await api.settings.set({ [input.dataset.setting]: input.checked });
});

document.getElementById('settings-close').addEventListener('click', () => settingsDialog.close());

/* ------------------------------------------------------------------ *
 * Menu commands from the main process
 * ------------------------------------------------------------------ */

function activeState() {
  return activeId ? views.get(activeId) : null;
}

api.onAddServer(openAddDialog);
api.onOpenSettings(openSettingsDialog);

api.onReloadView((payload) => {
  const state = activeState();
  if (!state) return;
  if (payload && payload.ignoreCache) state.webview.reloadIgnoringCache();
  else state.webview.reload();
});

api.onToggleDevTools(() => {
  const state = activeState();
  if (!state) return;
  if (state.webview.isDevToolsOpened()) state.webview.closeDevTools();
  else state.webview.openDevTools();
});

api.onZoom(async (direction) => {
  const state = activeState();
  if (!state) return;

  const next = direction === 0 ? 0 : Math.max(-3, Math.min(3, state.zoom + direction * 0.5));

  state.zoom = next;
  state.webview.setZoomLevel(next);
  await api.servers.update(activeId, { zoom: next });
});

api.onCycle((direction) => {
  if (servers.length === 0) return;

  const index = servers.findIndex((s) => s.id === activeId);
  const next = (index + direction + servers.length) % servers.length;

  selectServer(servers[next].id);
});

api.onSelectIndex((index) => {
  if (servers[index]) selectServer(servers[index].id);
});

api.onRefreshServers(async () => {
  servers = await api.servers.refresh();
  renderRail();
});

api.onServersRefreshed((updated) => {
  servers = updated;
  renderRail();
});

api.onViewCrashed(() => {
  const state = activeState();
  if (state) state.webview.reload();
});

document.getElementById('add-server').addEventListener('click', openAddDialog);
document.getElementById('open-settings').addEventListener('click', openSettingsDialog);

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

// v0.2 kept the server list in localStorage under `brewerServers`. Move it into
// the on-disk store once, then drop it so we never import twice.
async function migrateLegacyServers() {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem('brewerServers') || 'null');
  } catch {
    legacy = null;
  }

  if (!Array.isArray(legacy) || legacy.length === 0) return;

  const { imported } = await api.servers.importLegacy(legacy);
  localStorage.removeItem('brewerServers');

  if (imported) console.log(`[brewer] imported ${imported} server(s) from v0.2 storage`);
}

async function init() {
  settings = await api.settings.get();
  appInfo = await api.app.info();

  document.getElementById('about-line').textContent =
    `Brewer ${appInfo.version} · Electron ${appInfo.electron} · Chromium ${appInfo.chrome}`;

  document.getElementById('audio-support-note').textContent =
    appInfo.platform === 'win32'
      ? 'Captures desktop audio alongside the shared screen.'
      : 'Electron can only capture desktop audio on Windows. See the README for a PipeWire workaround.';

  // The system picker option is macOS 15+ only; everywhere else the checkbox
  // would be inert.
  const pickerRow = document.getElementById('system-picker-row');
  if (appInfo.platform !== 'darwin') pickerRow.hidden = true;

  document.getElementById('picker-note').textContent = appInfo.wayland
    ? 'On Wayland your desktop shows its own share dialog, so Brewer does not add a second one.'
    : '';

  await migrateLegacyServers();

  servers = await api.servers.list();
  renderRail();

  if (servers.length > 0) await selectServer(servers[0].id);
}

init();
