// Dashboard: loads data/jobs.json + data/meta.json, renders, filters, sorts,
// and tracks which jobs you've already seen (localStorage).
const SEEN_KEY = 'sjr.seen.v1';
const $ = (sel) => document.querySelector(sel);

let ALL = [];
let SEEN = loadSeen();

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveSeen() {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...SEEN].slice(-5000)));
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = Date.parse(iso);
  if (isNaN(d)) return '';
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function isNew(job) {
  if (SEEN.has(job.id)) return false;
  return true; // unseen by this browser
}

async function load() {
  const bust = `?t=${Date.now()}`;
  try {
    const [jobs, meta] = await Promise.all([
      fetch(`data/jobs.json${bust}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`data/meta.json${bust}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    ]);
    ALL = Array.isArray(jobs) ? jobs : [];
    applyMeta(meta);
  } catch (err) {
    ALL = [];
    console.error('Failed to load data', err);
  }
  buildFilterOptions();
  render();
}

function applyMeta(meta) {
  const total = (meta.totals && meta.totals.total) ?? ALL.length;
  $('#totalCount').textContent = total;
  $('#newCount').textContent = ALL.filter(isNew).length;
  $('#lastUpdated').textContent = meta.lastUpdated ? timeAgo(meta.lastUpdated) : '—';

  if (meta.totals && meta.totals.byPublisher) {
    const parts = Object.entries(meta.totals.byPublisher)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`);
    $('#sourceBreakdown').textContent = parts.length ? `By platform — ${parts.join('  ·  ')}` : '';
  }
}

function buildFilterOptions() {
  const sources = new Set();
  const cities = new Set();
  for (const j of ALL) {
    if (j.publisher) sources.add(j.publisher);
    if (j.city) cities.add(j.city);
  }
  fillSelect('#sourceFilter', sources, 'All sources');
  fillSelect('#cityFilter', cities, 'All locations');
}

function fillSelect(sel, values, allLabel) {
  const el = $(sel);
  const current = el.value;
  el.innerHTML = `<option value="">${allLabel}</option>`;
  [...values].sort().forEach((v) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  });
  if ([...values].includes(current)) el.value = current;
}

function currentFilters() {
  return {
    q: $('#search').value.trim().toLowerCase(),
    source: $('#sourceFilter').value,
    city: $('#cityFilter').value,
    days: Number($('#dateFilter').value),
    sort: $('#sortBy').value,
    newOnly: $('#newOnly').checked
  };
}

function matches(job, f) {
  if (f.source && job.publisher !== f.source) return false;
  if (f.city && job.city !== f.city) return false;
  if (f.newOnly && !isNew(job)) return false;
  if (f.days) {
    const ref = Date.parse(job.postedAt || job.firstSeen);
    if (isNaN(ref) || Date.now() - ref > f.days * 86400000) return false;
  }
  if (f.q) {
    const hay = `${job.title} ${job.company} ${job.city} ${job.description} ${(job.hits || []).join(' ')}`.toLowerCase();
    if (!hay.includes(f.q)) return false;
  }
  return true;
}

function render() {
  const f = currentFilters();
  let list = ALL.filter((j) => matches(j, f));

  list.sort((a, b) => {
    if (f.sort === 'score') return (b.score || 0) - (a.score || 0);
    return Date.parse(b.firstSeen || 0) - Date.parse(a.firstSeen || 0);
  });

  const root = $('#results');
  root.innerHTML = '';

  if (!list.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.innerHTML = ALL.length
      ? 'No jobs match these filters. Try clearing the search or date filter.'
      : 'No jobs loaded yet. Add your API keys and run the hourly fetch to populate this list.';
    root.appendChild(div);
    return;
  }

  const tpl = $('#cardTpl');
  for (const job of list) {
    const node = tpl.content.cloneNode(true);
    const titleEl = node.querySelector('.title');
    titleEl.textContent = job.title || 'Untitled role';
    titleEl.href = job.applyLink || '#';

    node.querySelector('.company').textContent = job.company || 'Unknown company';
    const cityText = [job.city, job.remote ? 'Remote' : ''].filter(Boolean).join(' · ') || job.country || 'Saudi Arabia';
    node.querySelector('.city').textContent = cityText;
    node.querySelector('.desc').textContent = job.description || '';

    const tags = node.querySelector('.tags');
    (job.hits || []).slice(0, 5).forEach((h) => {
      const s = document.createElement('span');
      s.className = 'tag'; s.textContent = h;
      tags.appendChild(s);
    });

    if (isNew(job)) node.querySelector('.new-badge').hidden = false;
    node.querySelector('.score').textContent = `★ ${job.score ?? 0}`;
    node.querySelector('.publisher').textContent = job.publisher || job.source || '';
    node.querySelector('.posted').textContent = timeAgo(job.postedAt || job.firstSeen);

    const apply = node.querySelector('.apply');
    if (job.applyLink) apply.href = job.applyLink; else apply.remove();

    root.appendChild(node);
  }
}

function markAllSeen() {
  ALL.forEach((j) => SEEN.add(j.id));
  saveSeen();
  $('#newCount').textContent = ALL.filter(isNew).length;
  render();
}

// Wire up controls.
['#search', '#sourceFilter', '#cityFilter', '#dateFilter', '#sortBy', '#newOnly'].forEach((sel) => {
  const el = $(sel);
  el.addEventListener(sel === '#search' ? 'input' : 'change', render);
});
$('#markSeen').addEventListener('click', markAllSeen);

load();
// Auto-refresh data every 10 minutes while the tab is open.
setInterval(load, 10 * 60 * 1000);
