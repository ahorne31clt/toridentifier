# Tornado Guesser

Select **Play game** from the mode menu, then click or tap the map to place a target where you think the tornado occurred. Rounds use photos and video stills of active tornadoes with a visible funnel or wedge. Use **Full photo** to view the uncropped image, **Reveal a hint** for a geographic clue and era, and **Include a date guess** to enter an optional date. After each guess, the game reveals the recorded location, date, official F or EF rating, distance in miles, and a letter grade with a short sound. For events with a verified NWS Damage Assessment Toolkit (DAT) match, the reveal draws the surveyed track and marks the nearest point to the guess. Date error is shown separately in days. Runs take five photos from the archive and prioritize photos the current browser has yet to score.

Use the city search above the map to zoom to a U.S. city or town. A state name or abbreviation helps distinguish cities with the same name. The search index uses representative coordinates from the [2025 U.S. Census Gazetteer places and states files](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html).

## Run the full game

Use Node.js 24 or newer. No npm installation is required.

```sh
node server.mjs
```

Open [http://127.0.0.1:8776](http://127.0.0.1:8776). The score history dialog supports username/password accounts. Accounts and their scores are stored in SQLite in the ignored `.data/` directory. Guest scores stay in the browser. The score history shows the latest 50 rounds and the all-time round count.

The leaderboard shows the top 25 players. To qualify, complete a five-photo run while signed in. Only your best run appears, ranked by average distance in miles rounded to one decimal place. Use the scoring rules menu to view the original point-scoring leaderboard. Personal history includes scores under both rules.

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

The selection screen offers the full archive, a yellow Iconic EF4 / EF5 mode (including historic F4/F5 events), and a blue Past Year mode. The iconic selection is curated in `modes.mjs`; Past Year filters the archive to the rolling last 12 months, excluding future events. Each run uses up to five distinct photos from its mode. Returning to the same mode resumes it; switching modes starts a fresh run. Existing leaderboard standings combine all modes. Both static hosting and the Node server support mode selection.
