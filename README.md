# Tornado Guesser

Select **Play game** from the mode menu, then click or tap the map to place a target where you think the tornado occurred. Rounds use photos and video stills of active tornadoes with a visible funnel or wedge. Use **Full photo** to view the uncropped image, **Reveal a hint** for a geographic clue and era, and **Include a date guess** to enter an optional date. After each guess, the game reveals the recorded location, date, official F or EF rating, distance in miles, and a letter grade with a short sound. For events with a verified NWS Damage Assessment Toolkit (DAT) match, the reveal draws the surveyed track and marks the nearest point to the guess. Date error is shown separately in days. Runs take five photos from the archive and prioritize photos the current browser has yet to score.

Use the city search above the map to zoom to a U.S. city or town. A state name or abbreviation helps distinguish cities with the same name. The search index uses representative coordinates from the [2025 U.S. Census Gazetteer places and states files](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html).

## Run the full game

Use Node.js 24 or newer. No npm installation is required.

```sh
node server.mjs
```

Open [http://127.0.0.1:8776](http://127.0.0.1:8776). The score history dialog supports username/password accounts. Accounts and their scores are stored in SQLite in the ignored `.data/` directory. Guest scores stay in the browser. The score history shows the latest 50 rounds and the all-time round count.

The leaderboard shows the top 25 players. To qualify, complete a five-photo run while signed in. Only your best run appears, ranked by average distance in miles rounded to one decimal place. Personal history includes scores under both rules. The previous combined leaderboard selector has been removed; mode-specific boards remain.

For hosting, set `TORNADO_HOST=0.0.0.0` if needed, provide a persistent directory via `TORNADO_DATA_DIR`, and serve the site behind HTTPS with `TORNADO_SECURE_COOKIE=1`. The port defaults to 8776 and can be set with `PORT`. Leaflet and OpenStreetMap tiles load over the internet.

A static host such as GitHub Pages supports guest play and an arcade leaderboard. Finish a five-photo run and enter a gamertag to save its average distance. The arcade leaderboard shows personal bests for up to 25 gamertags saved on that browser. Shared rankings and accounts require a deployment of the Node server. Static hosting makes the answer catalog public.

## Add a tornado

1. Choose a photo or video still with a visible funnel or wedge. Verify the date, exact tornado and reuse license, then add the image to `images/` using a neutral filename. Crop embedded dates or place labels when the license permits.
2. Add one entry per tornado to `tornadoes.json`. Use a unique `id`, a relative `image` path, a display `name`, numeric `lat` and `lng`, and the event report or archive URL under `source`. Set `clueType` to `"funnel"` and `rating` to the official rating, such as `"EF4"` or `"F5"`. Set `date` to the local calendar date the tornado occurred in YYYY-MM-DD format. For example, June 16, 2014 is `"2014-06-16"`.
3. Restart the Node server to load the updated catalog.

For optional hints, add a `hints` array with short clues. A broad location clue followed by the era works for both location-only and date rounds. Revealing hints leaves the mileage grade unchanged.

The scoring coordinate represents a documented location along the tornado's track, such as a survey start point or an affected town. The catalog holds the original Union City coordinate, the NWS Storm Data start point for El Reno, a reported location near Mayfield, a Newcastle-area report for Moore, and the Census reference point for the village of Pilger.

For sourced photos, add `photoCredit` and `photoSource`. Add `photoLicense` and `photoLicenseUrl` when a license notice is required. The game displays these credits on the event reveal. Use `photoEdit` to identify changes such as cropping and converting to WebP.

## Add DAT tracks in batches

1. Add the photos and event metadata to `tornadoes.json`. Keep photo files compact for fast loading.
2. Run `node scripts/dat.mjs find` to list candidates for every unmatched event, or use `node scripts/dat.mjs find 001 013` to check specific events.
3. Confirm the candidates against the photo and the official event report. Copy the matching survey's `globalId` into `dat-matches.json` under the catalog event ID. An event can list multiple feature IDs when its surveyed track is split. An unmatched event can still be published.
4. Run `node scripts/dat.mjs sync` to download and validate the selected geometries, then run `node scripts/dat.mjs check` to verify the catalog, images, and saved tracks. Commit the updated match file and generated `dat-tracks.json` with the photos.

The game uses the checked-in track snapshot. Player requests do not depend on NOAA being online. The game draws photos as needed and keeps runs at five photos as the archive grows. The public DAT is a survey product and its tracks may be revised. [NWS DAT viewer](https://apps.dat.noaa.gov/StormDamage/DamageViewer/) · [DAT damage-line service](https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1)

The archive includes all ten U.S. EF5 tornadoes recorded through November 2026, plus selected F4 and EF4 tornadoes from 2000 onward and historic events. The catalog sources include the [NOAA SPC tornado archive](https://www.spc.noaa.gov/wcm/#data) and local NWS event reports. The game uses DAT surveys to grade guesses and display the tornado track after a guess.

## Grading

Distance is measured along Earth's surface to the nearest point on the surveyed track. Events without DAT geometry use their catalog coordinate.

| Grade | Distance (miles) |
| --- | --- |
| A | 0–25 |
| B | Over 25 through 75 |
| C | Over 75 through 150 |
| D | Over 150 through 300 |
| F | Over 300 |

## Player ranks

Leaderboard entries show a player rank based on the best run's average miles, rounded to one decimal place: EF-5 at 0–10, EF-4 over 10–25, EF-3 over 25–75, EF-2 over 75–150, EF-1 over 150–300, EF-0 over 300–600, and EF-U over 600. These game ranks are separate from tornado intensity ratings. The arcade run summary also shows the rank earned for that run. Thresholds are defined in `playerRankBands` in `scoring.mjs`.

## Game modes

The selection screen offers the full archive, a yellow Iconic EF4 / EF5 mode (including historic F4/F5 events), and a blue Past Year mode. The iconic selection is curated in `modes.mjs`; Past Year filters the archive to the rolling last 12 months, excluding future events. Each run uses up to five distinct photos from its mode. Returning to the same mode resumes it; switching modes starts a fresh run. Each mode has its own leaderboard. Both static hosting and the Node server support mode selection.

## November 2026 archive expansion

Added 15 distinct tornado events, bringing the full archive to 112 events. As of November 19, 2026, Iconic EF4 / EF5 contains 25 events and Past Year contains 15. Past Year membership continues to roll with the calendar.

Nine new recent events: Appleton–Menasha, Ringle, Ottawa, Lena–Orangeville, Beggs, Hebron–Kouts, west of Fairview, Rowe–Dwight, and Dix. All nine have verified NWS DAT survey geometry saved locally. Their dates and official ratings were checked against NWS event reports and the matching survey records.

Six new iconic events: Topeka (1966), Xenia (1974), Fargo (1957), Niles–Wheatland (1985), Dunlap–Midway (1965), and Russiaville–Kokomo (1965). These use documented affected-town reference coordinates when no verified DAT geometry is available. Historic ratings remain F4/F5, rather than being relabeled as EF ratings.

Images were visually reviewed for a visible tornado, optimized as WebP, and assigned neutral filenames. Ringle and Fairview camera timestamps and Fargo's archive caption were cropped out. Author credits, source links, reuse licenses, and edit notices are stored per event in `tornadoes.json` and appear after the answer is revealed. Source contrast adjustments for Ringle and Ottawa are disclosed. No tornado imagery was generated. The larger tornado is the scored event in the Hebron–Kouts twin-tornado image.

### Shared leaderboard deployment

The online arcade leaderboard is a Cloudflare Worker; this release includes the updated code in `cloudflare/worker.js`. If that Worker uses its own event catalog or track snapshot, update those with the new events before accepting their ranked submissions. Static gameplay and the included Node server have been checked with the expanded catalog; new-event submissions to the separate production Worker have not been verified.

## Clear Lake–Gary addition (November 23, 2026)

Added the June 28, 2025 Clear Lake–Gary, South Dakota EF3 tornado using the supplied original JPEG. The catalog uses the local date, June 28; the live DAT record starts at June 29, 2025 01:10 UTC and ends at 01:49 UTC. The matching ABR survey GlobalID is `{A31C423D-F86B-4308-8F20-2DAAE93E9D51}`. The CSV export's displayed time differs by one hour from UTC; the live DAT epoch timestamps and NWS narrative confirm the stored UTC/local dates.

The 55-point DAT path is saved for scoring and display. Survey metadata records EF3, 165 mph, 9.7811 miles, 100 yards, two injuries and no fatalities. The supplied image is included unchanged; its photographer and reuse license have not been supplied, so no license is asserted. Replace the temporary user-supplied credit when the author and original source are available.

The event belongs to Full Archive. It is excluded from Iconic EF4 / EF5 because it is EF3, and from Past Year as of November 23, 2026 because June 28, 2025 is outside the rolling last 12 months. The archive now contains 113 events; the current iconic and recent pools remain 25 and 15.

## v1.8.2 — November 27, 2026

Added 28 verified NWS DAT track matches, expanding coverage from 36 to 64 of 114 archive tornadoes. The 36 existing track records are unchanged. Dates, official numeric ratings, geography, office and survey labels/narratives were reviewed; original F-scale catalog ratings were retained for historic events despite EF-prefixed retroloaded DAT metadata. Bennington's DAT EF3+ metadata does not relabel the official EF3 event. The explicitly named MEG Craighead–Obion track is used for Monette–Samburg, not the closer Mayfield track start.

`dat-audit-2026-11-27.json` lists all new GlobalIDs, original event ratings, source URLs and the 50 unmatched events. Unmatched events keep point scoring. No paths were traced from images or replaced with invented start-to-end lines.

New paths are available in regular photo modes immediately. Their `dailyEffectiveFrom` date is November 28, preserving November 27 Daily scoring on client and Worker. Existing stored scores, grades and replay snapshots are not recalculated. DAT synchronization preserves this activation metadata. `tests/dat-tracks.test.mjs` verifies coverage, unique IDs, rating preservation and Daily activation behavior.

## v1.8.1 — November 27, 2026

At least two saved Daily challenge days are required for a lifetime average, EF player rating, and overall rank. One-day players remain provisional and are excluded from the peer comparison population. Daily individual results and today’s crown remain available.

The history panel includes an EF player rating based on lifetime Daily average. A small gold crown marks the first-place Daily gamertag, and overall number-one players receive a crown in their history header; tied overall leaders share the crown.

Player Daily history opens from gamertags on today’s chase board and the Daily leaderboard. A read-only `/daily-player` endpoint uses existing `mode_best` Daily scores, including legacy records, without a migration or resubmission. It returns lifetime Daily average, days played, best day average, competition rank, peer comparison, and paginated history with daily placement. It does not expose private account data or replay guesses.

Each player has equal weight in the comparison to other players’ lifetime averages. Players may have played different dates and numbers of challenges; the panel states this. Overall ranks tie at one-decimal displayed precision. Per-day placement follows the existing score-then-gamertag order. Scores are never recomputed after DAT changes. Unsaved attempts cannot be reconstructed.

Recent fixes and improvements are consolidated in What’s New: wheel zoom on guessing maps, the web-only TestFlight flag, and the iOS browser invitation on every visit. The published Worker’s accounts, recovery, sharing and replay code is preserved in the checked-in Worker copies. No DAT changes are part of this release.

Validation: `node --test tests/daily-player.test.mjs` covers legacy results, ranking and ties, player weighting, missing grades, pagination, validation, GET-only access, and unchanged stored data.

## v1.8 — November 27, 2026

Tornado Guesser v1.8 is available on iOS through TestFlight for testing. The full App Store launch is coming soon; TestFlight availability is not the public App Store release.

This version carries forward the current web changes: player accounts, Daily replays, run sharing, updated branding, and the 5/3/1 EF scoring system. The website version labels and asset cache keys now use 1.8. The native iOS repository and build settings are unchanged.

## v1.6 — November 24, 2026

This release is based on the current GitHub repository, preserving Feedback, account controls, metadata, release notes, daily lookup, daily sharing, existing distance leaderboards, and the original isobar background. Daily Challenge has a purple featured row with a live read-only ranking panel. The average shown is calculated from the returned ranked players, not all daily attempts. Ranking failures display an unavailable state, never fabricated scores.

Every location mode now offers **View run rundown** after the final scored photo. The results screen shows average distance, closest guess, player rank, all round distances and grades, and optional date error. Existing arcade save and daily share controls are moved into the rundown without replacing their handlers. Completed daily runs restore their rundown from the existing daily progress record.

The green **Guess the EF Rating** mode uses the existing photo archive. Exact answers earn 3 points, adjacent numeric ratings earn 1, and EF-U requires an exact match. Historic events use their original F-scale ratings. Source links, photo credits, and licenses appear on the reveal. Five-round results use points rather than distance. EF Rating has a shared points leaderboard on the production site. The updated Cloudflare Worker and additive SQL migration are included in `cloudflare/`. Both use the existing D1 binding named `DB`. On a plain local static preview, rating scores remain browser-local. The included Node server checks rating answers server-side through `/api/rating/catalog` and `/api/rating/guess`.

The local review server in `preview-server.mjs` serves this actual build at 127.0.0.1:8786. It proxies only GET requests to the public daily/leaderboard/lookup endpoints so daily can be reviewed locally, and it never forwards score submissions. On a production static hostname, the existing Worker URLs and submission behavior are unchanged. Daily on the included account-based Node deployment remains unavailable, matching the existing release.

Run locally: `node preview-server.mjs`, then open http://127.0.0.1:8786 . This is a local review of the application update, not a separate replacement game. No production deployment is performed by the preview server.

## Uploading v1.6

Follow [DEPLOYMENT.md](./DEPLOYMENT.md). Deploy the additive SQL and updated Worker before uploading the site. No new database is needed. The background is an illustrative animated weather pattern, not live weather data; it respects reduced-motion preferences and pauses when the page is hidden.

Validation: `node --test tests/*.test.mjs`, `node scripts/dat.mjs check`, and a Wrangler Worker dry-run build. Cloudflare tests use an isolated in-memory SQLite fixture; they do not write to production.
