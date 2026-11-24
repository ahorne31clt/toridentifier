# Tornado Guesser v1.6 — upload instructions

Use your EXISTING Worker and EXISTING D1 database. Do not create a new database.

## 1. Add the rating tables to the existing database

In Cloudflare, open **Workers & Pages → tornado-guesser-leaderboard → Settings → Bindings**. Note the existing D1 database bound as **DB**. Keep that binding unchanged.

Open **Storage & databases → D1 → that same database → Console**. Paste the entire contents of **cloudflare/rating-schema.sql** and run it. If the console requires one statement at a time, run each CREATE statement separately.

The SQL only creates `rating_sessions`, `rating_answers`, `rating_results`, and their indexes. It does not modify or delete `arcade_*`, `mode_*`, `daily_lineups`, or `daily_share_cards`. Running the SQL again is safe.

## 2. Replace the existing Worker code

Open **Workers & Pages → tornado-guesser-leaderboard → Edit code**. Replace the full contents of `worker.js` with **cloudflare/worker.js** from this package. Click **Deploy**.

This is the full Worker, not a snippet. It has no imports or additional dependencies. Keep the existing **DB** binding, Worker name, and workers.dev URL. Do not replace the Worker with `server.mjs`, `game.mjs`, or `pressure-field.mjs`.

The Worker keeps all current distance and Daily routes, and adds:

- POST `/rating/run`: assigns five photos and creates a 24-hour run.
- POST `/rating/guess`: records the first answer for each photo and computes points.
- GET/POST `/leaderboard?mode=rating`: shared points rankings / save completed run.

Your current distance and daily scores stay where they are. Rating points use separate tables in the SAME database and are never mixed with miles. Exact match earns 3, adjacent numeric rating earns 1, EF-U requires an exact match; historic events retain F ratings. Highest total wins; exact matches break point ties. Gamertags are labels, not authenticated accounts, matching the existing arcade model.

Quick check after Worker deployment: open
https://tornado-guesser-leaderboard.ahorne31.workers.dev/leaderboard?mode=rating
It should return `{"entries":[]}` before the first rating score, rather than an error. Also open `/daily` to confirm today's lineup still loads.

## 3. Upload the site to GitHub

Unzip **Tornado-Guesser-v1.6-GitHub-Upload.zip**. Upload its CONTENTS to the root of **ahorne31clt/toridentifier** on your normal GitHub Pages branch, replacing the matching files. `index.html` must remain at the repository root. Keep the included `CNAME` unchanged.

No build command, npm installation, new database, API key, or new Worker URL is needed for GitHub Pages. Deploy the Worker first, then the website, so the green mode's new routes are available.

The Cloudflare folder contains code and instructions only; it has no credentials. `preview-server.mjs`, tests, and Node server are developer tools and are not run by GitHub Pages.

## 4. After GitHub Pages finishes deploying

Hard-refresh tornadoguesser.app. Check:

1. Feedback, Leaderboard and My scores are still in the header.
2. Finish five EF Rating photos, view the rundown, save a gamertag, then select EF Rating in Leaderboard.
3. Finish Daily, save, open Share result, and use Find a daily score to retrieve it.
4. Open release notes and check v1.6. Check the game selection on your phone.

The package's automated checks pass. Live deployment and a real-device check still need to happen after you upload; no production changes were made by the coding agent.

## Local preview

With Node.js 24 or newer: `node preview-server.mjs`, then open http://127.0.0.1:8786 . This reads live Daily rankings but never forwards local score submissions to production. Local rating scores use browser storage. The production hostname automatically uses the shared Worker.

## Rollback

Redeploy the previous GitHub Pages commit and previous Worker version. Leave the additive rating tables in place; old code ignores them. Do not delete existing tables or the database.
