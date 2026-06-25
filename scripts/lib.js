// Shared helpers: env loading, scoring, de-duplication and storage.
import fs from 'fs';

/** Minimal .env loader (no dependency). Only sets vars that aren't already set. */
export function loadDotEnv(file = '.env') {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* no .env present — fine, rely on real environment variables */
  }
}

/** Lowercase + strip punctuation for stable comparison/slugs. */
export function slug(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tiny stable string hash -> short base36 id (no crypto dependency needed). */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/** Stable id for a job, so the same posting from different sources de-dupes. */
export function jobId(job) {
  return hash(`${slug(job.title)}|${slug(job.company)}|${slug(job.city)}`);
}

/**
 * Relevance score for a job against the profile.
 * Core keyword in title = +10, in description = +3.
 * Nice-to-have keyword in title = +4, in description = +1.
 * Returns { score, hits, excluded }.
 */
export function scoreJob(job, profile) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  let score = 0;
  const hits = [];

  for (const kw of profile.keywords.core) {
    const k = kw.toLowerCase();
    if (title.includes(k)) { score += 10; hits.push(kw); }
    else if (desc.includes(k)) { score += 3; hits.push(kw); }
  }
  for (const kw of profile.keywords.nice) {
    const k = kw.toLowerCase();
    if (title.includes(k)) score += 4;
    else if (desc.includes(k)) score += 1;
  }

  let excluded = false;
  for (const ex of profile.exclude || []) {
    if (title.includes(ex.toLowerCase())) { excluded = true; break; }
  }

  return { score, hits: [...new Set(hits)].slice(0, 6), excluded };
}

/**
 * Merge freshly fetched jobs into the existing store.
 * Keeps firstSeen (for "NEW" detection), refreshes lastSeen, prunes by retention.
 */
export function mergeJobs(existing, incoming, profile, nowISO) {
  const now = Date.parse(nowISO);
  const map = new Map(existing.map((j) => [j.id, j]));
  let added = 0;

  for (const j of incoming) {
    j.id = jobId(j);
    const prev = map.get(j.id);
    if (prev) {
      prev.lastSeen = nowISO;
      if (!prev.applyLink && j.applyLink) prev.applyLink = j.applyLink;
      if (!prev.description && j.description) prev.description = j.description;
      if (!prev.logo && j.logo) prev.logo = j.logo;
      if ((j.score || 0) > (prev.score || 0)) { prev.score = j.score; prev.hits = j.hits; }
    } else {
      j.firstSeen = nowISO;
      j.lastSeen = nowISO;
      map.set(j.id, j);
      added++;
    }
  }

  let arr = [...map.values()];

  // Retention: drop anything not seen within retentionDays.
  const cutoff = now - (profile.retentionDays || 45) * 86400000;
  arr = arr.filter((j) => Date.parse(j.lastSeen || j.firstSeen) >= cutoff);

  // Newest first, then by relevance.
  arr.sort((a, b) => {
    const t = Date.parse(b.firstSeen) - Date.parse(a.firstSeen);
    return t !== 0 ? t : (b.score || 0) - (a.score || 0);
  });

  if (arr.length > (profile.maxJobs || 1500)) arr = arr.slice(0, profile.maxJobs);

  return { jobs: arr, added };
}

/** Build the meta/summary object the dashboard reads. */
export function buildMeta(jobs, profile, sourceState, nowISO) {
  const now = Date.parse(nowISO);
  const byPublisher = {};
  const bySource = {};
  let new24h = 0;
  for (const j of jobs) {
    byPublisher[j.publisher || j.source] = (byPublisher[j.publisher || j.source] || 0) + 1;
    bySource[j.source] = (bySource[j.source] || 0) + 1;
    if (now - Date.parse(j.firstSeen) <= 86400000) new24h++;
  }
  return {
    lastUpdated: nowISO,
    profileLabel: profile.label,
    totals: { total: jobs.length, new24h, byPublisher, bySource },
    queries: profile.queries,
    sources: sourceState
  };
}

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

export function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
