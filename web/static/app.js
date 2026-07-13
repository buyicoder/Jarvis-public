const views = [...document.querySelectorAll('.view')];
const nav = [...document.querySelectorAll('[data-view]')];
const title = document.querySelector('#page-title');
const labels = { today: 'Today', 'war-room': 'Project War Room', retrieval: 'Knowledge search', settings: 'Privacy & adapters' };

function show(id) {
  views.forEach((view) => view.classList.toggle('active', view.id === id));
  nav.forEach((button) => button.classList.toggle('active', button.dataset.view === id));
  title.textContent = labels[id] || 'Jarvis';
  if (id === 'war-room') loadWarRoom();
}

async function loadStatus() {
  try {
    const status = await fetch('/api/status').then((response) => response.json());
    document.querySelector('#health').textContent = status.running ? 'Local workspace ready' : 'Local workspace paused';
  } catch { document.querySelector('#health').textContent = 'Restart local workspace'; }
}

function renderList(target, items, empty) {
  target.textContent = '';
  if (!items.length) { target.className = 'empty'; target.textContent = empty; return; }
  target.className = 'items';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'item';
    const itemTitle = document.createElement('strong');
    itemTitle.textContent = item.summary || item.type || 'Local item';
    const itemStatus = document.createElement('small');
    itemStatus.textContent = item.status || 'current';
    row.append(itemTitle, itemStatus);
    target.append(row);
  }
}

async function loadWarRoom() {
  try {
    const response = await fetch('/api/war-room', { headers: { 'x-jarvis-token': new URL(location.href).searchParams.get('token') || '' } });
    if (!response.ok) throw new Error(`War Room unavailable: HTTP ${response.status}`);
    const room = await response.json();
    renderList(document.querySelector('#current-list'), room.current || [], 'No current work yet. Add a synthetic project or reconcile a local manifest.');
    renderList(document.querySelector('#timeline-list'), room.timeline || [], 'Resolved and superseded work appears here.');
  } catch {
    renderList(document.querySelector('#current-list'), [], 'War Room is temporarily unavailable. Run the local control-plane doctor.');
  }
}

nav.forEach((button) => button.addEventListener('click', () => show(button.dataset.view)));
document.querySelector('#refresh-room').addEventListener('click', loadWarRoom);
loadStatus();
