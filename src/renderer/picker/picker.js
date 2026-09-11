'use strict';

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const shareButton = document.getElementById('share');
const cancelButton = document.getElementById('cancel');
const audioToggle = document.getElementById('audio-toggle');
const audioCheckbox = document.getElementById('audio-checkbox');
const audioNote = document.getElementById('audio-note');

let requestId = null;
let sources = [];
let kind = 'screen';
let selectedId = null;

window.picker.onSources((payload) => {
  requestId = payload.requestId;
  sources = payload.sources;

  // Loopback capture of desktop audio is Windows-only in Electron; elsewhere
  // the checkbox would be a lie, so it is disabled with an explanation.
  audioCheckbox.checked = payload.audio.enabled;
  audioCheckbox.disabled = !payload.audio.supported;
  audioToggle.classList.toggle('unsupported', !payload.audio.supported);
  audioNote.textContent = payload.audio.supported
    ? 'Includes sound from the shared screen or window.'
    : 'Not available on this platform — Electron only supports desktop audio capture on Windows.';

  // Default to whichever tab actually has something in it.
  if (!sources.some((s) => s.kind === 'screen')) setKind('window');
  else renderGrid();
});

function setKind(next) {
  kind = next;

  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.kind === next);
  }

  renderGrid();
}

function renderGrid() {
  grid.replaceChildren();

  const visible = sources.filter((s) => s.kind === kind);
  empty.hidden = visible.length > 0;

  for (const source of visible) {
    grid.appendChild(buildCard(source));
  }
}

function buildCard(source) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  if (source.id === selectedId) card.classList.add('selected');

  if (source.thumbnail) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = source.thumbnail;
    img.alt = '';
    card.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'thumb thumb-empty';
    placeholder.textContent = 'No preview';
    card.appendChild(placeholder);
  }

  const title = document.createElement('div');
  title.className = 'card-title';

  if (source.appIcon) {
    const icon = document.createElement('img');
    icon.src = source.appIcon;
    icon.alt = '';
    title.appendChild(icon);
  }

  const name = document.createElement('span');
  name.textContent = source.name;
  name.title = source.name;
  title.appendChild(name);

  card.appendChild(title);

  card.addEventListener('click', () => {
    selectedId = source.id;
    shareButton.disabled = false;
    renderGrid();
  });

  card.addEventListener('dblclick', share);

  return card;
}

function share() {
  if (!selectedId || requestId === null) return;

  shareButton.disabled = true;
  window.picker.choose(requestId, selectedId, audioCheckbox.checked && !audioCheckbox.disabled);
}

function cancel() {
  if (requestId !== null) window.picker.cancel(requestId);
  window.close();
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => setKind(tab.dataset.kind));
}

shareButton.addEventListener('click', share);
cancelButton.addEventListener('click', cancel);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') cancel();
  if (event.key === 'Enter') share();
});
