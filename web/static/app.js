const views = [...document.querySelectorAll('.view')];
const nav = [...document.querySelectorAll('[data-view]')];
const title = document.querySelector('#page-title');
const labels = { today: 'Today', 'war-room': 'Project War Room', retrieval: 'Knowledge search', settings: 'Privacy & adapters' };
const token = new URL(location.href).searchParams.get('token') || '';

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
    const response = await fetch('/api/war-room', { headers: { 'x-jarvis-token': token } });
    if (!response.ok) throw new Error(`War Room unavailable: HTTP ${response.status}`);
    const room = await response.json();
    renderList(document.querySelector('#current-list'), room.current || [], 'No current work yet. Add a synthetic project or reconcile a local manifest.');
    renderList(document.querySelector('#timeline-list'), room.timeline || [], 'Resolved and superseded work appears here.');
  } catch {
    renderList(document.querySelector('#current-list'), [], 'War Room is temporarily unavailable. Run the local control-plane doctor.');
  }
}

async function initializeDemo() {
  const feedback = document.querySelector('#demo-feedback');
  const button = document.querySelector('#initialize-demo');
  button.disabled = true;
  feedback.textContent = 'Creating synthetic local data…';
  try {
    const response = await fetch('/api/demo/init', { method: 'POST', headers: { 'x-jarvis-token': token } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.guidance || 'The synthetic demo could not be created.');
    feedback.textContent = result.alreadyInitialized ? 'Synthetic demo is already ready.' : 'Synthetic demo created. Opening War Room…';
    show('war-room');
  } catch (error) {
    feedback.textContent = error.message;
  } finally { button.disabled = false; }
}

nav.forEach((button) => button.addEventListener('click', () => show(button.dataset.view)));
document.querySelector('#refresh-room').addEventListener('click', loadWarRoom);
document.querySelector('#initialize-demo').addEventListener('click', initializeDemo);
loadStatus();
