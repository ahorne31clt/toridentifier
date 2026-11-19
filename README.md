# Tornado Guesser

Select **Play game** from the mode menu, then click or tap the map to place a target where you think the photographed tornado occurred. Use **Full photo** to view the uncropped image, **Reveal a hint** for a geographic clue and era, and **Include a date guess** to enter an optional date. After each guess, the game reveals the recorded location, date, distance in miles, and a letter grade with a short sound. The sound toggle saves your preference on the current browser. For events with a verified NWS Damage Assessment Toolkit (DAT) match, the reveal draws the surveyed track and marks the nearest point to the guess. Date error is shown separately in days. Each run draws five different photos from the archive.

Use the city search above the map to zoom to a U.S. city or town. A state name or abbreviation helps distinguish cities with the same name. The search index uses representative coordinates from the [2025 U.S. Census Gazetteer places and states files](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html).

## Run the full game

Use Node.js 24 or newer. No npm installation is required.

```sh
node server.mjs
```

Open [http://127.0.0.1:8776](http://127.0.0.1:8776). The score history dialog supports username/password accounts. Accounts and their scores are stored in SQLite in the ignored `.data/` directory. Guest scores stay in the browser. The score history shows the latest 50 rounds and the all-time round count.

The leaderboard shows the top 25 players. To qualify, complete a five-photo run while signed in. Only your best run appears, ranked by average distance in miles rounded to one decimal place. Use the scoring rules menu to view the original point-scoring leaderboard. Personal history includes scores under both rules.

For hosting, set `TORNADO_HOST=0.0.0.0` if needed, provide a persistent directory via `TORNADO_DATA_DIR`, and serve the site behind HTTPS with `TORNADO_SECURE_COOKIE=1`. The port defaults to 8776 and can be set with `PORT`. Leaflet and OpenStreetMap tiles load over the internet.

A static host such as GitHub Pages can serve the repository as a guest-only game. Accounts require the Node server. Static hosting also makes the answer catalog public.

## Add a tornado

1. Add each photo to `images/` using a neutral filename.
2. Add one entry per tornado to `tornadoes.json`. Use a unique `id`, a relative `image` path, a display `name`, numeric `lat` and `lng`, and the event report URL under `source`. Set `date` to the local calendar date the tornado occurred in YYYY-MM-DD format. For example, June 16, 2014 is `"2014-06-16"`.
3. Restart the Node server to load the updated catalog.

For optional hints, add a `hints` array with short clues. A broad location clue followed by the era works for both location-only and date rounds. Revealing hints leaves the mileage grade unchanged.

The scoring coordinate represents a documented location along the tornado's track, such as a survey start point or an affected town. The catalog holds the original Union City coordinate, the NWS Storm Data start point for El Reno, a reported location near Mayfield, a Newcastle-area report for Moore, and the Census reference point for the village of Pilger.

For sourced photos, add `photoCredit` and `photoSource`. Add `photoLicense` and `photoLicenseUrl` when a license notice is required. The game displays these credits on the event reveal. The ten added historical photos were resized and encoded as WebP. The Doran photo was cropped to keep its camera date stamp from giving away the answer. The La Grange photo is by [John Oakland / CIMSS / VORTEX2](https://commons.wikimedia.org/wiki/File:Nssl0238_-_Flickr_-_NOAA_Photo_Library.jpg) under [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/).

## Add DAT tracks in batches

1. Add the photos and event metadata to `tornadoes.json`. Keep photo files compact for fast loading.
2. Run `node scripts/dat.mjs find` to list candidates for every unmatched event, or use `node scripts/dat.mjs find 001 013` to check specific events.
3. Confirm the candidates against the photo and the official event report. Copy the matching survey's `globalId` into `dat-matches.json` under the catalog event ID. An event can list multiple feature IDs when its surveyed track is split. An unmatched event can still be published.
4. Run `node scripts/dat.mjs sync` to download and validate the selected geometries, then run `node scripts/dat.mjs check` to verify the catalog, images, and saved tracks. Commit the updated match file and generated `dat-tracks.json` with the photos.

The game uses the checked-in track snapshot. Player requests do not depend on NOAA being online. The game draws photos as needed and keeps runs at five photos as the archive grows. The public DAT is a survey product and its tracks may be revised. [NWS DAT viewer](https://apps.dat.noaa.gov/StormDamage/DamageViewer/) · [DAT damage-line service](https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1)

## Grading

Distance is measured along Earth's surface to the nearest point on the surveyed track. Events without DAT geometry use their catalog coordinate.

| Grade | Distance (miles) |
| --- | --- |
| A | 0–25 |
| B | Over 25 through 75 |
| C | Over 75 through 150 |
| D | Over 150 through 300 |
| F | Over 300 |
