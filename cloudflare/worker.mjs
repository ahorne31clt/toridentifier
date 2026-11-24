// Player ranks use the same one-decimal average displayed on the leaderboard.
const playerRankBands = [
  ['EF-5', 10], ['EF-4', 25], ['EF-3', 75], ['EF-2', 150],
  ['EF-1', 300], ['EF-0', 600], ['EF-U', Infinity],
];

function playerRank(averageMiles) {
  if (!Number.isFinite(averageMiles) || averageMiles < 0) return '—';
  const displayedMiles = Math.round(averageMiles * 10) / 10;
  return playerRankBands.find(([, limit]) => displayedMiles <= limit)[0];
}

const gradeBands = [
  ['A', 25], ['B', 75], ['C', 150], ['D', 300], ['F', Infinity],
];

const roundsPerRun = archiveSize => Math.min(5, archiveSize);

const radians = degrees => degrees * Math.PI / 180;
const degrees = radians => radians * 180 / Math.PI;
const earthMiles = 3958.76;
const dot = ([ax, ay, az], [bx, by, bz]) => ax * bx + ay * by + az * bz;
const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
const angle = (a, b) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

function toUnitVector(lng, lat) {
  const phi = radians(lat);
  const lambda = radians(lng);
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

function nearestTrackPoint(point, paths) {
  const guess = toUnitVector(point.lng, point.lat);
  let nearest;
  let nearestAngle = Infinity;

  function consider(candidate) {
    const separation = angle(guess, candidate);
    if (separation < nearestAngle) {
      nearestAngle = separation;
      nearest = candidate;
    }
  }

  for (const path of paths) {
    let start;
    for (const [lng, lat] of path) {
      const end = toUnitVector(lng, lat);
      consider(end);
      if (start) {
        // Project onto the segment's great circle, then check that the projection lies on the segment.
        const normal = cross(start, end);
        const normalSquared = dot(normal, normal);
        if (normalSquared > 1e-24) {
          const offset = dot(guess, normal) / normalSquared;
          const projected = guess.map((value, index) => value - offset * normal[index]);
          if (dot(projected, projected) > 1e-24 &&
              dot(cross(start, projected), normal) >= 0 && dot(cross(projected, end), normal) >= 0) {
            consider(projected);
          }
        }
      }
      start = end;
    }
  }
  if (!nearest) return null;
  const [x, y, z] = nearest;
  return {
    miles: nearestAngle * earthMiles,
    reference: {lat: degrees(Math.atan2(z, Math.hypot(x, y))), lng: degrees(Math.atan2(y, x))},
  };
}

function trackPaths(track) {
  return track?.features.flatMap(feature => feature.paths) || [];
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validPoint(point) {
  return Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

function scoreGuess(tornado, point, date) {
  const latArc = radians(tornado.lat - point.lat);
  const lngArc = radians(tornado.lng - point.lng);
  const a = Math.sin(latArc / 2) ** 2 +
    Math.cos(radians(point.lat)) * Math.cos(radians(tornado.lat)) * Math.sin(lngArc / 2) ** 2;
  const trackScore = nearestTrackPoint(point, trackPaths(tornado.track));
  const miles = trackScore?.miles ?? earthMiles * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  const [grade] = gradeBands.find(([, limit]) => miles <= limit);
  const dateError = date ? Math.abs(Date.parse(tornado.date) - Date.parse(date)) / 86400000 : null;
  return {miles, grade, dateError, dateGuess: date || null, ...(trackScore && {reference: trackScore.reference})};
}
const gameModes = {
  all: 'Tornado Photo Challenge',
  iconic: 'Iconic EF4 / EF5',
  recent: 'Past Year',
};

// A curated selection, including historic F-scale counterparts.
const iconicIds = new Set([
  'funnel-65eacd44c4f5', 'funnel-e1ea9c64523b', 'funnel-18b0a62a9989', 'funnel-5d8e773d2a41', 'funnel-7babe5bf0c81', 'funnel-83fa8c2ec4d2',
  '003', '004', '005', '014', 'funnel-e0da045344f1', 'funnel-0e4a22c1d761',
  'funnel-06e9736df8f3', 'funnel-6752051853bc', 'funnel-c992d654a672',
  'funnel-591dcff5bf1d', 'funnel-d4f410ce70be', 'funnel-5831d5e1d2e2',
  'funnel-90e2c90ac678', 'funnel-08c6e68d616c', 'funnel-98a90070397c',
  'funnel-025fd52d4cc3', 'funnel-32e21e0f5726', 'funnel-4f086d6bd1cc',
  'funnel-aca2965f7b46',
]);

function eventModes(event, now = new Date()) {
  const modes = ['all'];
  if (iconicIds.has(event.id) && /^(?:EF|F)[45]$/.test(event.rating)) modes.push('iconic');
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
  const start = startDate.toISOString().slice(0, 10);
  if (event.date >= start && event.date <= end) modes.push('recent');
  return modes;
}

function modeCatalog(catalog, mode, now = new Date()) {
  return catalog.filter(event => (event.modes || eventModes(event, now)).includes(mode));
}

const site = 'https://tornadoguesser.app';
const allowedOrigins = new Set([site, 'https://www.tornadoguesser.app', 'https://ahorne31clt.github.io']);
const gamertagPattern = /^[\p{L}\p{N} _-]{2,20}$/u;
const runLength = 5;
const topScores = `
  SELECT gamertag AS username, score_tenths / 10.0 AS averageMiles
  FROM arcade_best
  ORDER BY score_tenths, gamertag_key
  LIMIT 25
`;

async function readRun(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, {stream: true});
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function readArchive() {
  const options = {cf: {cacheEverything: true, cacheTtlByStatus: {'200-299': 60, '400-599': 0}}};
  const [catalogResponse, trackResponse] = await Promise.all([
    fetch(site + '/tornadoes.json', options),
    fetch(site + '/dat-tracks.json', options),
  ]);
  if (!catalogResponse.ok || !trackResponse.ok) throw new Error('Archive unavailable');
  const [catalog, tracks] = await Promise.all([catalogResponse.json(), trackResponse.json()]);
  return new Map(catalog.filter(event => event.clueType === 'funnel')
    .map(event => [event.id, {...event, track: tracks[event.id]}]));
}

const modeNames = new Set(['all', 'iconic', 'recent', 'daily', 'rating']);
const dayFormat = new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit'});

async function dailyLineup(db, day) {
  const list = () => db.prepare('SELECT event_id AS id FROM daily_lineups WHERE day = ? ORDER BY slot').bind(day).all();
  let {results} = await list();
  if (!results.length) {
    const archive = await readArchive();
    if (archive.size < runLength) throw new Error('Too few photos for the daily challenge');
    await db.prepare(`
      WITH eligible AS (
        SELECT value AS id, MAX(history.day) AS last_day, RANDOM() AS tie
        FROM json_each(?) LEFT JOIN daily_lineups AS history ON history.event_id = value
        GROUP BY value
        ORDER BY last_day, tie LIMIT 5
      )
      INSERT INTO daily_lineups (day, slot, event_id)
      SELECT ?, ROW_NUMBER() OVER (ORDER BY last_day, tie), id FROM eligible
      WHERE NOT EXISTS (SELECT 1 FROM daily_lineups WHERE day = ?)
    `).bind(JSON.stringify([...archive.keys()]), day, day).run();
    ({results} = await list());
  }
  if (results.length !== runLength) throw new Error('Incomplete daily lineup');
  return results.map(row => row.id);
}

async function saveModeRun(db, mode, day, input, archive, username, key, scoreTenths, grades, json) {
  const guesses = input.guesses;
  const board = mode === 'daily' ? 'daily:' + day : mode;
  if (mode === 'daily') {
    if (input.day !== day) return json({message: 'This daily challenge has ended. Open today’s lineup.'}, 409);
    const ids = await dailyLineup(db, day);
    if (ids.some((id, index) => id !== guesses[index].id)) {
      return json({message: 'Complete today’s five photos in order before saving.'}, 400);
    }
  } else if (guesses.some(guess => !eventModes(archive.get(guess.id)).includes(mode))) {
    return json({message: 'These photos do not belong to this mode. Start a fresh run.'}, 400);
  }
  const statements = [
    db.prepare(`
      INSERT INTO mode_runs (run_id, board, gamertag_key, gamertag, score_tenths)
      SELECT ?, ?, ?, ?, ?
      WHERE ? <> 'daily' OR NOT EXISTS (
        SELECT 1 FROM mode_best WHERE board = ? AND gamertag_key = ?
      )
      ON CONFLICT (run_id) DO NOTHING
    `).bind(input.runId, board, key, username, scoreTenths, mode, board, key),
  ];
  if (mode === 'daily') {
    statements.push(db.prepare(`
      INSERT INTO daily_share_cards (board, gamertag_key, grades)
      SELECT board, gamertag_key, ? FROM mode_runs
      WHERE run_id = ? AND board = ? AND gamertag_key = ?
        AND NOT EXISTS (SELECT 1 FROM mode_best WHERE board = ? AND gamertag_key = ?)
      ON CONFLICT (board, gamertag_key) DO NOTHING
    `).bind(grades, input.runId, board, key, board, key));
  }
  statements.push(
    db.prepare(`
      INSERT INTO mode_best (board, gamertag_key, gamertag, score_tenths)
      SELECT board, gamertag_key, gamertag, score_tenths FROM mode_runs
      WHERE run_id = ? AND board = ? AND gamertag_key = ?
      ON CONFLICT (board, gamertag_key) DO UPDATE SET
        gamertag = excluded.gamertag, score_tenths = excluded.score_tenths
      WHERE ? <> 'daily' AND excluded.score_tenths < mode_best.score_tenths
    `).bind(input.runId, board, key, mode),
    db.prepare(`
      SELECT runs.gamertag_key AS gamertagKey, runs.gamertag AS username, runs.board,
        runs.score_tenths / 10.0 AS averageMiles, best.score_tenths / 10.0 AS bestMiles
      FROM mode_runs AS runs JOIN mode_best AS best USING (board, gamertag_key)
      WHERE runs.run_id = ? AND (? <> 'daily' OR NOT EXISTS (
        SELECT 1 FROM mode_runs AS earlier
        WHERE earlier.board = runs.board AND earlier.gamertag_key = runs.gamertag_key AND earlier.rowid < runs.rowid
      ))
    `).bind(input.runId, mode),
  );
  const saved = await db.batch(statements);
  const result = saved.at(-1).results[0];
  if (result?.gamertagKey !== key || result.board !== board) {
    return json({message: mode === 'daily' ?
      'This gamertag already saved a score for today’s Daily Challenge.' :
      'This run has already been saved.'}, 409);
  }
  return json({username: result.username, averageMiles: result.averageMiles, bestMiles: result.bestMiles});
}

async function saveRun(db, request, mode, day, json) {
  const input = await readRun(request);
  const username = typeof input?.username === 'string' ? input.username.trim() : '';
  const guesses = input?.guesses;
  if (!gamertagPattern.test(username) || typeof input.runId !== 'string' ||
      !/^[a-f0-9]{32}$/.test(input.runId) || !Array.isArray(guesses) || guesses.length !== runLength ||
      !guesses.every(guess => typeof guess?.id === 'string' && validPoint(guess.point)) ||
      new Set(guesses.map(guess => guess.id)).size !== runLength) {
    return json({message: 'Enter a valid gamertag and complete five different photos.'}, 400);
  }

  const key = username.toLowerCase();
  const archive = await readArchive();
  if (guesses.some(guess => !archive.has(guess.id))) {
    return json({message: 'The photo archive changed. Refresh the game to start a new run.'}, 409);
  }
  const scores = guesses.map(guess => scoreGuess(archive.get(guess.id), guess.point, null));
  const total = scores.reduce((sum, score) => sum + score.miles, 0);
  const scoreTenths = Math.round(total * 10 / runLength);
  if (mode) {
    const grades = scores.map(score => score.grade).join('');
    return saveModeRun(db, mode, day, input, archive, username, key, scoreTenths, grades, json);
  }

  const [, , saved] = await db.batch([
    db.prepare(`
      INSERT INTO arcade_runs (run_id, gamertag_key, gamertag, score_tenths)
      VALUES (?, ?, ?, ?) ON CONFLICT (run_id) DO NOTHING
    `).bind(input.runId, key, username, scoreTenths),
    db.prepare(`
      INSERT INTO arcade_best (gamertag_key, gamertag, score_tenths)
      SELECT gamertag_key, gamertag, score_tenths FROM arcade_runs
      WHERE run_id = ? AND gamertag_key = ?
      ON CONFLICT (gamertag_key) DO UPDATE SET
        gamertag = excluded.gamertag,
        score_tenths = excluded.score_tenths
      WHERE excluded.score_tenths < arcade_best.score_tenths
    `).bind(input.runId, key),
    db.prepare(`
      SELECT runs.gamertag_key AS gamertagKey, runs.score_tenths / 10.0 AS averageMiles,
        best.score_tenths / 10.0 AS bestMiles
      FROM arcade_runs AS runs JOIN arcade_best AS best USING (gamertag_key)
      WHERE runs.run_id = ?
    `).bind(input.runId),
  ]);
  const result = saved.results[0];
  if (result?.gamertagKey !== key) return json({message: 'This run already has a saved gamertag.'}, 409);
  return json({averageMiles: result.averageMiles, bestMiles: result.bestMiles});
}

async function findDailyScore(db, gamertag, day, today, json) {
  const key = gamertag?.trim();
  if (!key || !gamertagPattern.test(key) || !validDate(day) || day > today) {
    return json({message: 'Enter a valid gamertag and challenge date.'}, 400);
  }
  const {results} = await db.prepare(`
    SELECT score.gamertag AS username, score.score_tenths / 10.0 AS averageMiles, cards.grades,
      1 + (SELECT COUNT(*) FROM mode_best AS better
           WHERE better.board = score.board AND (better.score_tenths, better.gamertag_key) <
             (score.score_tenths, score.gamertag_key)) AS place
    FROM mode_best AS score
    LEFT JOIN daily_share_cards AS cards USING (board, gamertag_key)
    WHERE score.board = ? AND score.gamertag_key = ?
  `).bind('daily:' + day, key.toLowerCase()).all();
  const score = results[0];
  if (!score) return json({message: 'No daily score found for that gamertag on this date.'}, 404);
  return json({day, ...score, grades: score.grades?.split('') || null});
}

export default {
  async fetch(request, env) {
    const {pathname, searchParams} = new URL(request.url);
    const mode = searchParams.get('mode');
    const day = dayFormat.format(new Date());
    const origin = request.headers.get('Origin');
    const headers = new Headers({'Cache-Control': 'no-store', Vary: 'Origin'});
    const json = (body, status = 200) => Response.json(body, {status, headers});
    if (origin && !allowedOrigins.has(origin)) return json({message: 'Origin unavailable.'}, 403);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    if (!['/', '/leaderboard', '/daily', '/daily-score', '/rating/run', '/rating/guess'].includes(pathname)) return json({message: 'Not found.'}, 404);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Max-Age', '86400');
      return new Response(null, {status: 204, headers});
    }
    try {
      if (mode !== null && !modeNames.has(mode)) return json({message: 'Unknown game mode.'}, 400);
      if (request.method === 'POST' && pathname === '/rating/run') return await startRating(env.DB, json);
      if (request.method === 'POST' && pathname === '/rating/guess') return await checkRating(env.DB, request, json);
      if (mode === 'rating' && ['/', '/leaderboard'].includes(pathname)) {
        if (request.method === 'GET') {
          const {results} = await env.DB.prepare(ratingTop).all();
          return json({entries:results.map((entry,index) => ({place:index+1,...entry}))});
        }
        if (request.method === 'POST' && pathname === '/leaderboard') return await saveRating(env.DB,request,json);
      }
      if (request.method === 'GET' && pathname === '/daily-score') {
        return await findDailyScore(env.DB, searchParams.get('gamertag'), searchParams.get('day') ?? day, day, json);
      }
      if (request.method === 'GET' && pathname === '/daily') {
        return json({day, ids: await dailyLineup(env.DB, day)});
      }
      if (request.method === 'GET' && ['/', '/leaderboard'].includes(pathname)) {
        const board = mode === 'daily' ? 'daily:' + day : mode;
        const {results} = mode ? await env.DB.prepare(`
          SELECT gamertag AS username, score_tenths / 10.0 AS averageMiles
          FROM mode_best WHERE board = ? ORDER BY score_tenths, gamertag_key LIMIT 25
        `).bind(board).all() : await env.DB.prepare(topScores).all();
        return json({...(mode === 'daily' && {day}), entries: results.map((entry, index) => ({place: index + 1, ...entry}))});
      }
      if (request.method === 'POST' && pathname === '/leaderboard') return await saveRun(env.DB, request, mode, day, json);
      return json({message: 'Method unavailable.'}, 405);
    } catch (error) {
      console.error('Arcade leaderboard', error);
      return json({message: 'The online leaderboard is temporarily unavailable. Try again.'}, 503);
    }
  },
};

// v1.6: EF Rating runs use separate tables in the SAME env.DB database.
const ratingValue = value => value === 'EF-U' ? 'EFU' : value;
function ratingPoints(actual, guess) {
  actual = ratingValue(actual); guess = ratingValue(guess);
  if (actual === guess) return 3;
  if (actual.endsWith('U') || guess.endsWith('U') || actual.startsWith('EF') !== guess.startsWith('EF')) return 0;
  return Math.abs(Number(actual.at(-1)) - Number(guess.at(-1))) === 1 ? 1 : 0;
}
const ratingTop = `
  WITH personal AS (
    SELECT gamertag AS username, points, exact, gamertag_key, saved_at,
      ROW_NUMBER() OVER (PARTITION BY gamertag_key ORDER BY points DESC, exact DESC, saved_at, run_id) AS personal_place
    FROM rating_results
  )
  SELECT username, points, exact FROM personal WHERE personal_place = 1
  ORDER BY points DESC, exact DESC, gamertag_key LIMIT 25
`;
async function ratingSession(db, id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) return null;
  return await db.prepare('SELECT * FROM rating_sessions WHERE run_id = ? AND expires_at > ?')
    .bind(id, Date.now()).first();
}
async function startRating(db, json) {
  const archive = await readArchive();
  const pool = [...archive.values()].filter(event => /^(?:EF[0-5U]|F[0-5])$/.test(ratingValue(event.rating || '')));
  if (pool.length < 5) throw new Error('Not enough rated photos');
  // Unbiased Fisher-Yates selection using the Worker runtime's secure RNG.
  const random = new Uint32Array(pool.length);
  crypto.getRandomValues(random);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random[i] / 4294967296 * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const selected = pool.slice(0,5), runId = crypto.randomUUID().replaceAll('-', '');
  await db.batch([
    db.prepare('DELETE FROM rating_sessions WHERE expires_at <= ?').bind(Date.now()),
    db.prepare('INSERT INTO rating_sessions(run_id,event_ids,expires_at) VALUES (?,?,?)')
      .bind(runId, JSON.stringify(selected.map(event => event.id)), Date.now() + 24 * 60 * 60 * 1000),
  ]);
  return json({runId, photos: selected.map(({id,image,rating}) => ({id,image,ratingScale: rating.startsWith('EF') ? 'EF' : 'F'}))});
}
async function checkRating(db, request, json) {
  const input = await readRun(request);
  const session = await ratingSession(db, input?.runId);
  if (!session) return json({message:'This rating run expired. Start a new run.'},409);
  if (!JSON.parse(session.event_ids).includes(input?.id)) return json({message:'This photo is not in your rating run.'},400);
  const archive = await readArchive(), event = archive.get(input.id);
  const guess = ratingValue(input.guess);
  if (!event || typeof guess !== 'string' || !/^(?:EF[0-5U]|F[0-5])$/.test(guess) ||
      event.rating.startsWith('EF') !== guess.startsWith('EF')) return json({message:'Choose a rating from the event’s original scale.'},400);
  // First answer stands. A network retry returns the same answer and points.
  await db.prepare('INSERT INTO rating_answers(run_id,event_id,guess,points) VALUES (?,?,?,?) ON CONFLICT(run_id,event_id) DO NOTHING')
    .bind(input.runId, input.id, guess, ratingPoints(event.rating,guess)).run();
  const saved = await db.prepare('SELECT guess,points FROM rating_answers WHERE run_id = ? AND event_id = ?').bind(input.runId,input.id).first();
  const {track, ...reveal} = event;
  return json({event:reveal, ...saved});
}
async function saveRating(db, request, json) {
  const input = await readRun(request), username = typeof input?.username === 'string' ? input.username.trim() : '';
  if (!gamertagPattern.test(username)) return json({message:'Use 2–20 letters, numbers, spaces, hyphens or underscores.'},400);
  const session = await ratingSession(db,input?.runId);
  if (!session) return json({message:'This rating run expired. Start a new run.'},409);
  const ids = JSON.parse(session.event_ids), key = username.toLowerCase();
  // Recompute totals from the answers saved by the Worker, never from client points.
  await db.prepare(`
    INSERT INTO rating_results(run_id,gamertag_key,gamertag,points,exact,saved_at)
    SELECT ?,?,?,SUM(points),SUM(CASE WHEN points = 3 THEN 1 ELSE 0 END),?
    FROM rating_answers WHERE run_id = ? AND event_id IN (SELECT value FROM json_each(?))
    HAVING COUNT(*) = 5
    ON CONFLICT(run_id) DO NOTHING
  `).bind(input.runId,key,username,Date.now(),input.runId,JSON.stringify(ids)).run();
  const result = await db.prepare('SELECT gamertag_key,points,exact FROM rating_results WHERE run_id = ?').bind(input.runId).first();
  if (!result) return json({message:'Answer all five photos before saving.'},400);
  if (result.gamertag_key !== key) return json({message:'This run already has a saved gamertag.'},409);
  const best = await db.prepare('SELECT points,exact FROM rating_results WHERE gamertag_key = ? ORDER BY points DESC,exact DESC,saved_at,run_id LIMIT 1').bind(key).first();
  return json({username,points:result.points,exact:result.exact,bestPoints:best.points,bestExact:best.exact});
}
