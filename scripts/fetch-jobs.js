// Main entry point. Run hourly (GitHub Actions) or manually (npm run fetch:env).
//
// 1. Loads profile + env (.env locally, or real env vars on CI).
// 2. Runs each enabled source that is due (respects per-source minIntervalHours).
// 3. Scores, filters and de-dupes results into docs/data/jobs.json.
// 4. Writes a summary to docs/data/meta.json for the dashboard.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadDotEnv, scoreJob, mergeJobs, buildMeta, readJson, writeJson
} from './lib.js';
import { SOURCES } from './sources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'docs', 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const PROFILE_FILE = path.join(ROOT, 'config', 'profile.json');

loadDotEnv(path.join(ROOT, '.env'));

const nowISO = new Date().toISOString();
const now = Date.now();

function dueToRun(name, cfg, sourceState) {
  if (!cfg || !cfg.enabled) return false;
  const last = sourceState[name]?.lastRun;
  if (!last) return true;
  const hours = (now - Date.parse(last)) / 3600000;
  return hours >= (cfg.minIntervalHours || 1) - 0.05; // small slack for cron jitter
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const profile = readJson(PROFILE_FILE, null);
  if (!profile) { console.error('Missing config/profile.json'); process.exit(1); }

  const store = readJson(JOBS_FILE, []);
  const existing = Array.isArray(store) ? store : [];
  const meta = readJson(META_FILE, {});
  const sourceState = meta.sources || {};

  const anyKey = process.env.RAPIDAPI_KEY || process.env.JOOBLE_KEY || process.env.CAREERJET_AFFID;
  if (!anyKey) {
    console.log('No API keys configured yet (RAPIDAPI_KEY / JOOBLE_KEY / CAREERJET_AFFID).');
    console.log('Dashboard will keep showing existing/sample data. Add keys to start fetching.');
  }

  console.log(`Saudi Jobs Radar — run @ ${nowISO}`);
  console.log(`Profile: ${profile.label} | stored jobs: ${existing.length}`);

  let fetched = [];
  let realFetchHappened = false;

  for (const [name, cfg] of Object.entries(profile.sources || {})) {
    const fn = SOURCES[name];
    if (!fn) continue;
    if (!dueToRun(name, cfg, sourceState)) {
      console.log(`- ${name}: not due (every ${cfg.minIntervalHours}h)`);
      continue;
    }
    console.log(`- ${name}: fetching…`);
    const jobs = await fn(profile, process.env);
    sourceState[name] = { lastRun: nowISO, lastCount: jobs.length, ok: true };
    if (jobs.length) realFetchHappened = true;
    fetched = fetched.concat(jobs);
  }

  // Score + filter incoming.
  const kept = [];
  for (const j of fetched) {
    if (!j.title) continue;
    const { score, hits, excluded } = scoreJob(j, profile);
    if (excluded) continue;
    if (score < (profile.minMatchScore || 0)) continue;
    j.score = score; j.hits = hits;
    kept.push(j);
  }
  console.log(`Fetched ${fetched.length}, relevant ${kept.length}`);

  // Drop seed/sample rows once we have real data flowing.
  let base = existing;
  if (realFetchHappened) base = existing.filter((j) => j.source !== 'Sample');

  const { jobs, added } = mergeJobs(base, kept, profile, nowISO);
  const metaOut = buildMeta(jobs, profile, sourceState, nowISO);

  writeJson(JOBS_FILE, jobs);
  writeJson(META_FILE, metaOut);

  console.log(`Saved ${jobs.length} jobs (${added} new). New in 24h: ${metaOut.totals.new24h}.`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
