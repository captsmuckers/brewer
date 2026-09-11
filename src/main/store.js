'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  minimizeToTray: false,
  closeToTray: false,
  startMinimized: false,
  shareSystemAudio: true,
  useSystemPicker: false,
  spellcheck: true,
  hardwareAcceleration: true
};

const EMPTY = { version: 1, servers: [], settings: { ...DEFAULT_SETTINGS }, window: null };

let statePath = null;
let state = null;
let writeTimer = null;

function getStatePath() {
  if (!statePath) statePath = path.join(app.getPath('userData'), 'brewer.json');
  return statePath;
}

function load() {
  if (state) return state;

  try {
    const raw = fs.readFileSync(getStatePath(), 'utf8');
    const parsed = JSON.parse(raw);

    state = {
      version: 1,
      servers: Array.isArray(parsed.servers) ? parsed.servers.filter(isServerish) : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      window: parsed.window || null
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[brewer] could not read state, starting fresh:', err.message);
      backupCorruptState();
    }
    state = JSON.parse(JSON.stringify(EMPTY));
  }

  return state;
}

// Keep a copy of anything we failed to parse so a bad write never silently
// destroys somebody's server list.
function backupCorruptState() {
  try {
    fs.copyFileSync(getStatePath(), `${getStatePath()}.corrupt-${Date.now()}`);
  } catch {
    // nothing useful to do here
  }
}

function isServerish(s) {
  return s && typeof s === 'object' && typeof s.url === 'string' && s.url.length > 0;
}

function persist() {
  const target = getStatePath();
  const tmp = `${target}.${process.pid}.tmp`;

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error('[brewer] failed to persist state:', err.message);
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

// Callers mutate state freely and call save(); batch the disk hit so that
// dragging a server around doesn't cause a write per frame.
function save({ immediate = false } = {}) {
  if (immediate) {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    persist();
    return;
  }

  if (writeTimer) return;
  writeTimer = setTimeout(() => { writeTimer = null; persist(); }, 250);
}

function flush() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  if (state) persist();
}

const getServers = () => load().servers;
const getSettings = () => load().settings;

function setSettings(patch) {
  const s = load();
  s.settings = { ...s.settings, ...patch };
  save();
  return s.settings;
}

function getWindowState() { return load().window; }

function setWindowState(win) {
  load().window = win;
  save();
}

function newId() { return crypto.randomUUID(); }

module.exports = {
  DEFAULT_SETTINGS,
  load, save, flush, newId,
  getServers, getSettings, setSettings,
  getWindowState, setWindowState
};
