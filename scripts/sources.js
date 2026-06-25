// Source adapters. Each returns a Promise<Array<normalizedJob>> and fails soft
// (logs + returns []), so one broken source never breaks the whole run.
//
// Normalized job shape:
// { source, publisher, title, company, city, country, remote, postedAt,
//   applyLink, description, employmentType, logo }

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function clip(s, n = 600) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/* ----------------------------- JSearch (RapidAPI) ----------------------------- */
// Aggregates Google for Jobs: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Bayt...
export async function fetchJSearch(profile, env) {
  const key = env.RAPIDAPI_KEY;
  if (!key) { console.log('  [jsearch] no RAPIDAPI_KEY — skipped'); return []; }

  const cfg = profile.sources.jsearch || {};
  const query = cfg.query || `cyber security jobs in ${profile.label}`;
  const params = new URLSearchParams({
    query,
    page: '1',
    num_pages: '1',
    country: profile.country || 'sa',
    date_posted: cfg.datePosted || 'week'
  });
  const url = `https://jsearch.p.rapidapi.com/search?${params}`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      }
    });
    if (!res.ok) {
      console.log(`  [jsearch] HTTP ${res.status} — ${clip(await res.text(), 160)}`);
      return [];
    }
    const json = await res.json();
    const data = Array.isArray(json.data) ? json.data : [];
    const jobs = data.map((j) => ({
      source: 'JSearch',
      publisher: j.job_publisher || 'JSearch',
      title: j.job_title || '',
      company: j.employer_name || '',
      city: j.job_city || j.job_state || '',
      country: j.job_country || profile.country,
      remote: !!j.job_is_remote,
      postedAt: j.job_posted_at_datetime_utc || null,
      applyLink: j.job_apply_link || (j.apply_options && j.apply_options[0]?.apply_link) || '',
      description: clip(j.job_description),
      employmentType: j.job_employment_type || '',
      logo: j.employer_logo || ''
    }));
    console.log(`  [jsearch] ${jobs.length} jobs`);
    return jobs;
  } catch (err) {
    console.log(`  [jsearch] error: ${err.message}`);
    return [];
  }
}

/* --------------------------------- Jooble --------------------------------- */
export async function fetchJooble(profile, env) {
  const key = env.JOOBLE_KEY;
  if (!key) { console.log('  [jooble] no JOOBLE_KEY — skipped'); return []; }

  const cfg = profile.sources.jooble || {};
  const queries = (profile.queries || []).slice(0, cfg.maxQueries || 6);
  const out = [];

  for (const q of queries) {
    try {
      const res = await fetch(`https://jooble.org/api/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ keywords: q, location: 'Saudi Arabia' })
      });
      if (!res.ok) {
        console.log(`  [jooble] "${q}" HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const list = Array.isArray(json.jobs) ? json.jobs : [];
      for (const j of list) {
        out.push({
          source: 'Jooble',
          publisher: j.source || 'Jooble',
          title: j.title || '',
          company: j.company || '',
          city: (j.location || '').replace(/,?\s*Saudi Arabia/i, '').trim(),
          country: 'Saudi Arabia',
          remote: /remote/i.test(j.type || '') || /remote/i.test(j.location || ''),
          postedAt: j.updated || null,
          applyLink: j.link || '',
          description: clip(j.snippet),
          employmentType: j.type || '',
          logo: ''
        });
      }
      console.log(`  [jooble] "${q}" -> ${list.length}`);
      await new Promise((r) => setTimeout(r, 350)); // be polite between calls
    } catch (err) {
      console.log(`  [jooble] "${q}" error: ${err.message}`);
    }
  }
  return out;
}

/* ------------------------------- Careerjet -------------------------------- */
// Optional. Enabled only when CAREERJET_AFFID is set and source enabled.
export async function fetchCareerjet(profile, env) {
  const affid = env.CAREERJET_AFFID;
  if (!affid) { console.log('  [careerjet] no CAREERJET_AFFID — skipped'); return []; }

  const cfg = profile.sources.careerjet || {};
  const queries = (profile.queries || []).slice(0, cfg.maxQueries || 4);
  const out = [];

  for (const q of queries) {
    const params = new URLSearchParams({
      keywords: q,
      location: 'Saudi Arabia',
      locale_code: cfg.localeCode || 'en_SA',
      affid,
      pagesize: '20',
      page: '1',
      user_ip: '11.22.33.44',
      user_agent: UA,
      url: 'https://saudi-jobs-radar.local'
    });
    try {
      const res = await fetch(`http://public.api.careerjet.net/search?${params}`, {
        headers: { 'User-Agent': UA }
      });
      if (!res.ok) { console.log(`  [careerjet] "${q}" HTTP ${res.status}`); continue; }
      const json = await res.json();
      const list = Array.isArray(json.jobs) ? json.jobs : [];
      for (const j of list) {
        out.push({
          source: 'Careerjet',
          publisher: j.site || 'Careerjet',
          title: j.title || '',
          company: j.company || '',
          city: (j.locations || '').replace(/,?\s*Saudi Arabia/i, '').trim(),
          country: 'Saudi Arabia',
          remote: /remote/i.test(j.locations || ''),
          postedAt: j.date || null,
          applyLink: j.url || '',
          description: clip(j.description),
          employmentType: '',
          logo: ''
        });
      }
      console.log(`  [careerjet] "${q}" -> ${list.length}`);
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      console.log(`  [careerjet] "${q}" error: ${err.message}`);
    }
  }
  return out;
}

export const SOURCES = {
  jsearch: fetchJSearch,
  jooble: fetchJooble,
  careerjet: fetchCareerjet
};
