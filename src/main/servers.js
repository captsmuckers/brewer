'use strict';

const store = require('./store');
const { parseServerInput, probeServer, hostLabel } = require('./sharkord');

function list() {
  return store.getServers();
}

function find(id) {
  return store.getServers().find((s) => s.id === id);
}

/**
 * Add a server from raw user input. The invite code (if any) is stored
 * separately as a one-shot: it is consumed the first time the view loads so
 * relaunching the app doesn't keep replaying `?invite=CODE` forever.
 */
async function add(rawInput) {
  const { origin, invite } = parseServerInput(rawInput);
  const servers = store.getServers();
  const existing = servers.find((s) => s.url === origin);

  if (existing) {
    if (invite) {
      existing.pendingInvite = invite;
      store.save();
    }
    return { server: existing, duplicate: true };
  }

  const info = await probeServer(origin);
  const server = {
    id: store.newId(),
    url: origin,
    name: info.name || hostLabel(origin),
    customName: null,
    iconUrl: info.iconUrl,
    serverId: info.serverId,
    version: info.version,
    pendingInvite: invite || null,
    reachable: info.ok
  };

  servers.push(server);
  store.save({ immediate: true });

  return { server, duplicate: false };
}

function remove(id) {
  const servers = store.getServers();
  const index = servers.findIndex((s) => s.id === id);

  if (index === -1) return false;

  servers.splice(index, 1);
  store.save({ immediate: true });

  return true;
}

function update(id, patch) {
  const server = find(id);
  if (!server) return null;

  const allowed = ['customName', 'name', 'iconUrl', 'version', 'pendingInvite', 'reachable', 'serverId', 'zoom'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) server[key] = patch[key];
  }

  store.save();
  return server;
}

function reorder(orderedIds) {
  const servers = store.getServers();
  const byId = new Map(servers.map((s) => [s.id, s]));
  const next = [];

  for (const id of orderedIds) {
    const server = byId.get(id);
    if (server) { next.push(server); byId.delete(id); }
  }
  // anything the renderer didn't mention keeps its relative order at the end
  for (const server of byId.values()) next.push(server);

  store.load().servers = next;
  store.save({ immediate: true });

  return next;
}

/** Re-ask every server for its name/logo/version. */
async function refreshAll() {
  const servers = store.getServers();

  await Promise.all(
    servers.map(async (server) => {
      const info = await probeServer(server.url);

      server.reachable = info.ok;
      if (!info.ok) return;

      server.name = info.name;
      server.iconUrl = info.iconUrl;
      server.version = info.version;
      server.serverId = info.serverId;
    })
  );

  store.save({ immediate: true });
  return servers;
}

/** Consume the one-shot invite and hand back the URL the view should load. */
function takeStartUrl(id) {
  const server = find(id);
  if (!server) return null;

  if (server.pendingInvite) {
    const url = `${server.url}/?invite=${encodeURIComponent(server.pendingInvite)}`;
    server.pendingInvite = null;
    store.save({ immediate: true });
    return url;
  }

  return server.url;
}

/** One-time migration of the v0.2 `brewerServers` localStorage array. */
function importLegacy(legacy) {
  if (!Array.isArray(legacy) || legacy.length === 0) return { imported: 0 };

  const servers = store.getServers();
  let imported = 0;

  for (const old of legacy) {
    if (!old || typeof old.url !== 'string') continue;
    if (servers.some((s) => s.url === old.url)) continue;

    let invite = null;
    try {
      invite = new URL(old.startUrl || old.url).searchParams.get('invite');
    } catch { /* legacy rows were not validated, skip bad ones */ }

    servers.push({
      id: store.newId(),
      url: old.url,
      name: old.name || hostLabel(old.url),
      customName: null,
      iconUrl: null,
      serverId: null,
      version: null,
      pendingInvite: invite,
      reachable: null
    });
    imported += 1;
  }

  if (imported) store.save({ immediate: true });

  return { imported };
}

module.exports = { list, find, add, remove, update, reorder, refreshAll, takeStartUrl, importLegacy };
