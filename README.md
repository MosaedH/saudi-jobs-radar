# 🛡️ Saudi Cyber Jobs Radar

A self-updating website that collects **cybersecurity jobs in Saudi Arabia** from
LinkedIn, Indeed, Glassdoor, Bayt, GulfTalent and more, scores them against your
profile, and shows them in a searchable dashboard. It refreshes **every hour**.

- **Sources:** Google for Jobs (via the JSearch API — indexes LinkedIn/Indeed/Glassdoor/Bayt/etc.) + Jooble. Careerjet optional.
- **Always-on & free:** runs on **GitHub Actions** (hourly cron) and is served by **GitHub Pages**. No server, no PC required.
- **Legal & robust:** uses official aggregator APIs, not scraping. It won't get IP-banned the way a LinkedIn scraper would.

> Why not scrape LinkedIn directly? LinkedIn blocks it and it violates their Terms.
> JSearch reads Google for Jobs, which already indexes LinkedIn postings — so you
> still get them, reliably and legally.

---

## How it works

```
config/profile.json   ← your keywords, locations, sources (edit this)
scripts/fetch-jobs.js ← runs hourly: fetch → score → de-dupe → save
        └ sources.js  ← JSearch / Jooble / Careerjet adapters
docs/                 ← the website (GitHub Pages serves this folder)
  ├ index.html / app.js / styles.css
  └ data/jobs.json    ← written by the fetcher, read by the dashboard
.github/workflows/fetch-jobs.yml ← the hourly schedule
```

Each run keeps a `firstSeen` date per job so the dashboard can flag **NEW**
postings, de-duplicates the same job seen on multiple platforms, and drops
anything older than 45 days.

---

## 1. Try it locally (5 minutes, no keys needed)

You already have Node 22 installed.

```bash
cd "saudi-jobs-radar"
npm run serve
```

Open <http://localhost:5173>. You'll see sample jobs so you can explore the UI.

To pull **real** jobs locally, add API keys (next section) to a `.env` file, then:

```bash
npm run fetch:env     # fetches real jobs into docs/data/jobs.json
npm run serve         # refresh the browser to see them
```

---

## 2. Get the free API keys

Copy `.env.example` to `.env` and fill in:

| Key | Where to get it | Notes |
|-----|-----------------|-------|
| `RAPIDAPI_KEY` | <https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch> → **Subscribe → Basic (Free)** | Covers LinkedIn/Indeed/Glassdoor/Bayt. Free tier ≈ 200 requests/month, so this source runs every **6 h** by default (see note below). |
| `JOOBLE_KEY` | <https://jooble.org/api/about> → request a key | Broad aggregator. Runs **hourly**. |
| `CAREERJET_AFFID` | *(optional)* <https://www.careerjet.com/partners/> | Leave blank to skip. |

> **About the "every hour" requirement:** Jooble refreshes hourly. JSearch's free
> tier is only ~200 calls/month, so calling it every hour (720/month) would exceed
> it. The fetcher therefore calls JSearch every 6 hours and Jooble every hour — so
> the site still updates hourly overall. Want JSearch hourly too? Upgrade your
> RapidAPI plan and set `minIntervalHours: 1` in `config/profile.json`.

---

## 3. Deploy to the cloud (always-on, free)

This makes it refresh hourly even when your PC is off.

1. **Create a GitHub repo** and push this folder:
   ```bash
   cd "saudi-jobs-radar"
   git init
   git add .
   git commit -m "Saudi Cyber Jobs Radar"
   git branch -M main
   git remote add origin https://github.com/<you>/saudi-jobs-radar.git
   git push -u origin main
   ```

2. **Add your keys as secrets:**
   Repo → **Settings → Secrets and variables → Actions → New repository secret**.
   Add `RAPIDAPI_KEY` and `JOOBLE_KEY` (and `CAREERJET_AFFID` if used).
   *(Secrets are never committed — your `.env` is git-ignored.)*

3. **Enable GitHub Pages:**
   Repo → **Settings → Pages → Source: Deploy from a branch → Branch: `main` → Folder: `/docs`** → Save.
   Your site appears at `https://<you>.github.io/saudi-jobs-radar/`.

4. **Turn on the hourly job:**
   Repo → **Actions** tab → enable workflows → open **“Fetch jobs (hourly)”** →
   **Run workflow** once to populate immediately. After that it runs every hour
   automatically and commits fresh data, which Pages serves.

> Note: GitHub disables scheduled workflows after **60 days** of no repo activity.
> Just push a small change or click **Run workflow** occasionally to keep it alive.

---

## 4. Customize what it tracks

Everything lives in **`config/profile.json`** — no code changes needed:

- `queries` — search phrases sent to the job APIs.
- `keywords.core` / `keywords.nice` — drive the relevance **score** (core hit in a title = +10).
- `exclude` — titles containing these are dropped (e.g. unrelated sales/driver roles).
- `minMatchScore` — raise it to show only stronger matches (default 8).
- `locations` — cities you care about (used for the dashboard filter).
- `sources.*.minIntervalHours` — how often each source runs.
- `retentionDays`, `maxJobs` — how much history to keep.

Want to track a **different field** (e.g. cloud, networking, GRC only)? Just swap
the `queries` and `keywords`. The rest of the system is field-agnostic.

---

## FAQ

**Does it really cover “every” job source?**
No tool can hit literally every board, but JSearch + Jooble together cover the major
ones used in Saudi Arabia (LinkedIn, Indeed, Glassdoor, Bayt, GulfTalent, company
career pages indexed by Google). You can add more adapters in `scripts/sources.js`.

**Is the data public on GitHub Pages?**
Yes — job postings are public anyway, and your API keys stay in Secrets, never in
the site. For a private dashboard you'd need GitHub Pro or a different host.

**Can I run it on my own PC instead of the cloud?**
Yes — use Windows Task Scheduler to run `node scripts/fetch-jobs.js` hourly, and
open `docs/index.html` (or `npm run serve`). The cloud route is recommended so it
keeps working when your PC is off.
