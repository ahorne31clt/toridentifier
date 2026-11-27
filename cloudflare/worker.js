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

async function readArchive(mode=null,day=null) {
  const options = {cf: {cacheEverything: true, cacheTtlByStatus: {'200-299': 60, '400-599': 0}}};
  const [catalogResponse, trackResponse] = await Promise.all([
    fetch(site + '/tornadoes.json', options),
    fetch(site + '/dat-tracks.json?v=1.8.2', options),
  ]);
  if (!catalogResponse.ok || !trackResponse.ok) throw new Error('Archive unavailable');
  const [catalog, tracks] = await Promise.all([catalogResponse.json(), trackResponse.json()]);
  return new Map(catalog.filter(event => event.clueType === 'funnel')
    .map(event => [event.id, {...event, track: mode==='daily' && tracks[event.id]?.dailyEffectiveFrom && day<tracks[event.id].dailyEffectiveFrom ? undefined : tracks[event.id]}]));
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
  if (mode === 'daily') {
    // Snapshot only an accepted first run, atomically with its leaderboard score.
    // Never reconstruct guesses from averages, grades, or a retried request body.
    const rounds = guesses.map((guess, index) => {
      const event = archive.get(guess.id);
      const score = scoreGuess(event, guess.point, null);
      return {round: index + 1, id: event.id, name: event.name, date: event.date,
        rating: event.rating, image: event.image, point: {lat: guess.point.lat, lng: guess.point.lng},
        actual: {lat: event.lat, lng: event.lng},
        reference: score.reference || {lat: event.lat, lng: event.lng},
        miles: score.miles, grade: score.grade, paths: trackPaths(event.track)};
    });
    statements.splice(1, 0, db.prepare(`
      INSERT INTO daily_replays (board, gamertag_key, run_id, rounds, saved_at)
      SELECT board, gamertag_key, run_id, ?, ? FROM mode_runs
      WHERE run_id = ? AND board = ? AND gamertag_key = ?
        AND NOT EXISTS (SELECT 1 FROM mode_best WHERE board = ? AND gamertag_key = ?)
        AND NOT EXISTS (SELECT 1 FROM mode_runs AS earlier
          WHERE earlier.board = mode_runs.board AND earlier.gamertag_key = mode_runs.gamertag_key
            AND earlier.rowid < mode_runs.rowid)
      ON CONFLICT DO NOTHING
    `).bind(JSON.stringify(rounds), Date.now(), input.runId, board, key, board, key));
  }
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
  const archive = await readArchive(mode,day);
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
    if (!['/', '/leaderboard', '/daily', '/daily-score', '/daily-player', '/daily-replay', '/rating/run', '/rating/guess', '/account/profile', '/account/register', '/account/login', '/account/logout', '/account/recover'].includes(pathname)) return json({message: 'Not found.'}, 404);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      headers.set('Access-Control-Max-Age', '86400');
      return new Response(null, {status: 204, headers});
    }
    try {
      if(pathname.startsWith('/account/')) return await accountEndpoint(env.DB,request,env,json,pathname);
      if (mode !== null && !modeNames.has(mode)) return json({message: 'Unknown game mode.'}, 400);
      if (request.method === 'POST' && pathname === '/rating/run') return await startRating(env.DB, json);
      if (request.method === 'POST' && pathname === '/rating/guess') return await checkRating(env.DB, request, json);
      if (mode === 'rating' && ['/', '/leaderboard'].includes(pathname)) {
        if (request.method === 'GET') {
          const {results} = await env.DB.prepare(ratingTop).all();
          return json({entries:results.map((entry,index) => ({place:index+1,...entry}))});
        }
        if (request.method === 'POST' && pathname === '/leaderboard') return await accountScore(env.DB,request,env,'rating',day,json);
      }
      if (pathname === '/daily-replay') {
        if (request.method !== 'GET') return json({message: 'Method unavailable.'}, 405);
        return await dailyReplay(env.DB, request, searchParams, day, json);
      }
      if (pathname === '/daily-player') {
        if (request.method !== 'GET') return json({message:'Method unavailable.'},405);
        return await dailyPlayerStats(env.DB, searchParams, day, json);
      }
      if (request.method === 'GET' && pathname === '/daily-score') {
        return await findDailyScore(env.DB, searchParams.get('gamertag'), searchParams.get('day') ?? day, day, json);
      }
      if (request.method === 'GET' && pathname === '/daily') {
        return json({day, ids: await dailyLineup(env.DB, day)});
      }
      if (request.method === 'GET' && ['/', '/leaderboard'].includes(pathname)) {
        const board = mode === 'daily' ? 'daily:' + day : mode;
        const {results} = mode === 'daily' ? await env.DB.prepare(`
          SELECT score.gamertag AS username, score.score_tenths / 10.0 AS averageMiles, cards.grades
          FROM mode_best AS score
          LEFT JOIN daily_share_cards AS cards USING (board, gamertag_key)
          WHERE score.board = ? ORDER BY score.score_tenths, score.gamertag_key LIMIT 25
        `).bind(board).all() : mode ? await env.DB.prepare(`
          SELECT gamertag AS username, score_tenths / 10.0 AS averageMiles
          FROM mode_best WHERE board = ? ORDER BY score_tenths, gamertag_key LIMIT 25
        `).bind(board).all() : await env.DB.prepare(topScores).all();
        return json({...(mode === 'daily' && {day}), entries: results.map((entry,index) => ({place:index+1,...entry,
          ...(mode === 'daily' && {grades: typeof entry.grades === 'string' && /^[ABCDF]{5}$/.test(entry.grades) ? entry.grades.split('') : null})
        }))});
      }
      if (request.method === 'POST' && pathname === '/leaderboard') return await accountScore(env.DB, request, env, mode, day, json);
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
  if (actual === guess) return 5;
  if (actual.endsWith('U') || guess.endsWith('U') || actual.startsWith('EF') !== guess.startsWith('EF')) return 0;
  return [5,3,1][Math.abs(Number(actual.at(-1)) - Number(guess.at(-1)))] || 0;
}
const ratingTop = `
  WITH personal AS (
    SELECT gamertag AS username, points, exact, gamertag_key, saved_at,
      ROW_NUMBER() OVER (PARTITION BY gamertag_key ORDER BY points DESC, exact DESC, saved_at, run_id) AS personal_place
    FROM rating_results_v163
  )
  SELECT username, points, exact FROM personal WHERE personal_place = 1
  ORDER BY points DESC, exact DESC, gamertag_key LIMIT 25
`;
async function ratingSession(db, id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) return null;
  return await db.prepare('SELECT * FROM rating_sessions_v163 WHERE run_id = ? AND expires_at > ?')
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
    db.prepare('DELETE FROM rating_sessions_v163 WHERE expires_at <= ?').bind(Date.now()),
    db.prepare('INSERT INTO rating_sessions_v163(run_id,event_ids,expires_at) VALUES (?,?,?)')
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
  await db.prepare('INSERT INTO rating_answers_v163(run_id,event_id,guess,points) VALUES (?,?,?,?) ON CONFLICT(run_id,event_id) DO NOTHING')
    .bind(input.runId, input.id, guess, ratingPoints(event.rating,guess)).run();
  const saved = await db.prepare('SELECT guess,points FROM rating_answers_v163 WHERE run_id = ? AND event_id = ?').bind(input.runId,input.id).first();
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
    INSERT INTO rating_results_v163(run_id,gamertag_key,gamertag,points,exact,saved_at)
    SELECT ?,?,?,SUM(points),SUM(CASE WHEN points = 5 THEN 1 ELSE 0 END),?
    FROM rating_answers_v163 WHERE run_id = ? AND event_id IN (SELECT value FROM json_each(?))
    HAVING COUNT(*) = 5
    ON CONFLICT(run_id) DO NOTHING
  `).bind(input.runId,key,username,Date.now(),input.runId,JSON.stringify(ids)).run();
  const result = await db.prepare('SELECT gamertag_key,points,exact FROM rating_results_v163 WHERE run_id = ?').bind(input.runId).first();
  if (!result) return json({message:'Answer all five photos before saving.'},400);
  if (result.gamertag_key !== key) return json({message:'This run already has a saved gamertag.'},409);
  const best = await db.prepare('SELECT points,exact FROM rating_results_v163 WHERE gamertag_key = ? ORDER BY points DESC,exact DESC,saved_at,run_id LIMIT 1').bind(key).first();
  return json({username,points:result.points,exact:result.exact,bestPoints:best.points,bestExact:best.exact});
}

// PIN accounts share the existing DB. AUTH_PEPPER is a Worker secret, never a browser value.
const accountEncoder = new TextEncoder();
const randomHex = (size=32) => [...crypto.getRandomValues(new Uint8Array(size))].map(n=>n.toString(16).padStart(2,'0')).join('');
const hexDigest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',accountEncoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function pinHash(pin,salt,pepper) {
 const material=await crypto.subtle.importKey('raw',accountEncoder.encode(pin+':'+pepper),'PBKDF2',false,['deriveBits']);
 return [...new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:accountEncoder.encode(salt),iterations:100000},material,256))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function equalHash(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function accountUser(db,request){
 const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!token)return null;
 return db.prepare('SELECT a.id,a.username,a.username_key FROM player_accounts a JOIN player_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?').bind(await hexDigest(token),Date.now()).first();
}
async function accountProfile(db,user){
 if(!user)return {username:null,history:[],total:0};
 await db.batch([
 db.prepare(`INSERT OR IGNORE INTO player_run_history(account_id,run_id,mode,result,saved_at)
 SELECT ?,r.run_id,CASE WHEN r.board LIKE 'daily:%' THEN 'daily' ELSE r.board END,
 json_object('averageMiles',r.score_tenths/10.0,'day',CASE WHEN r.board LIKE 'daily:%' THEN substr(r.board,7) ELSE NULL END,'grades',c.grades,'imported',1),
 CASE WHEN r.board LIKE 'daily:%' THEN CAST(strftime('%s',substr(r.board,7)) AS INTEGER)*1000 ELSE 0 END
 FROM mode_runs r LEFT JOIN daily_share_cards c ON c.board=r.board AND c.gamertag_key=r.gamertag_key WHERE r.gamertag_key=?`).bind(user.id,user.username_key),
 db.prepare(`INSERT OR IGNORE INTO player_run_history(account_id,run_id,mode,result,saved_at) SELECT ?,run_id,'all',json_object('averageMiles',score_tenths/10.0,'imported',1),0 FROM arcade_runs WHERE gamertag_key=?`).bind(user.id,user.username_key),
 db.prepare(`INSERT OR IGNORE INTO player_run_history(account_id,run_id,mode,result,saved_at) SELECT ?,run_id,'rating',json_object('points',points,'exact',exact,'imported',1),saved_at FROM rating_results WHERE gamertag_key=?`).bind(user.id,user.username_key),
 db.prepare(`INSERT OR IGNORE INTO player_run_history(account_id,run_id,mode,result,saved_at) SELECT ?,run_id,'rating',json_object('points',points,'exact',exact,'imported',1,'scoringVersion',163),saved_at FROM rating_results_v163 WHERE gamertag_key=?`).bind(user.id,user.username_key),
 db.prepare(`INSERT OR IGNORE INTO player_run_history(account_id,run_id,mode,result,saved_at) SELECT ?,'legacy-best:'||board,CASE WHEN board LIKE 'daily:%' THEN 'daily' ELSE board END,json_object('averageMiles',score_tenths/10.0,'day',CASE WHEN board LIKE 'daily:%' THEN substr(board,7) ELSE NULL END,'imported',1),0 FROM mode_best b WHERE gamertag_key=? AND NOT EXISTS(SELECT 1 FROM mode_runs r WHERE r.board=b.board AND r.gamertag_key=b.gamertag_key)`).bind(user.id,user.username_key),
 db.prepare(`INSERT OR IGNORE INTO player_run_history(account_id,run_id,mode,result,saved_at) SELECT ?,'legacy-best:archive','all',json_object('averageMiles',score_tenths/10.0,'imported',1),0 FROM arcade_best b WHERE gamertag_key=? AND NOT EXISTS(SELECT 1 FROM arcade_runs r WHERE r.gamertag_key=b.gamertag_key)`).bind(user.id,user.username_key)
 ]);
 const {results}=await db.prepare('SELECT run_id,mode,result,saved_at FROM player_run_history WHERE account_id=? ORDER BY saved_at DESC,run_id LIMIT 50').bind(user.id).all();
 const count=await db.prepare('SELECT COUNT(*) AS total FROM player_run_history WHERE account_id=?').bind(user.id).first();
 return {username:user.username,total:count.total,history:results.map(r=>({runId:r.run_id,mode:r.mode,savedAt:r.saved_at,...JSON.parse(r.result)}))};
}
async function authLimit(db,request,key){
 const now=Date.now();
 // Both account and IP buckets are persisted, so retries cannot bypass an isolate restart.
 const ip=await hexDigest(request.headers.get('CF-Connecting-IP')||'local');
 for(const bucket of ['ip:'+ip,'name:'+key]){
 await db.prepare('INSERT INTO player_auth_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END').bind(bucket,now+15*60000,now,now).run();
 const row=await db.prepare('SELECT attempts FROM player_auth_limits WHERE key=?').bind(bucket).first();
 if(row.attempts>(bucket.startsWith('ip:')?30:8))return false;
 }
 return true;
}
async function accountEndpoint(db,request,env,json,path){
 if(!env.AUTH_PEPPER||env.AUTH_PEPPER.length<32)return json({message:'Account sign-in is not configured yet.'},503);
 const user=await accountUser(db,request);
 if(path==='/account/profile'&&request.method==='GET')return json(await accountProfile(db,user));
 if(request.method!=='POST')return json({message:'Method unavailable.'},405);
 if(path==='/account/logout'){
 const token=request.headers.get('Authorization')?.slice(7);
 if(token)await db.prepare('DELETE FROM player_sessions WHERE token_hash=?').bind(await hexDigest(token)).run();
 return json({username:null,history:[],total:0});
 }
 const input=await readRun(request);
 const username=typeof input?.username==='string'?input.username.trim():'';
 const key=username.toLowerCase();
 if(!/^[A-Za-z0-9_]{3,20}$/.test(username)||!/^\d{6}$/.test(input?.pin||''))return json({message:'Use a username of 3–20 letters, numbers or underscores and a six-digit PIN.'},400);
 if(!await authLimit(db,request,key))return json({message:'Too many attempts. Wait 15 minutes before trying again.'},429);
 let account=await db.prepare('SELECT * FROM player_accounts WHERE username_key=?').bind(key).first();
 let recoveryCode;
 if(path==='/account/register'){
 if(account)return json({message:'That username is unavailable.'},409);
 // Unregistered guest names may be claimed; existing account names remain unique.
 const id=randomHex(16),salt=randomHex(16);recoveryCode=randomHex(16);
 await db.prepare('INSERT INTO player_accounts(id,username,username_key,pin_salt,pin_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(username_key) DO NOTHING').bind(id,username,key,salt,await pinHash(input.pin,salt,env.AUTH_PEPPER),await hexDigest(recoveryCode+env.AUTH_PEPPER),Date.now()).run();
 account=await db.prepare('SELECT * FROM player_accounts WHERE id=?').bind(id).first();
 if(!account)return json({message:'That username is unavailable.'},409);
 }else if(path==='/account/login'){
 const actual=await pinHash(input.pin,account?.pin_salt||'missing-account-salt',env.AUTH_PEPPER);
 if(!account||!equalHash(actual,account.pin_hash))return json({message:'Username or PIN is incorrect.'},401);
 }else if(path==='/account/recover'){
 if(!account||typeof input.recoveryCode!=='string'||!equalHash(await hexDigest(input.recoveryCode.trim().toLowerCase()+env.AUTH_PEPPER),account.recovery_hash))return json({message:'Username or recovery code is incorrect.'},401);
 recoveryCode=randomHex(16);const salt=randomHex(16);
 await db.batch([db.prepare('UPDATE player_accounts SET pin_salt=?,pin_hash=?,recovery_hash=? WHERE id=?').bind(salt,await pinHash(input.pin,salt,env.AUTH_PEPPER),await hexDigest(recoveryCode+env.AUTH_PEPPER),account.id),db.prepare('DELETE FROM player_sessions WHERE account_id=?').bind(account.id)]);
 }else return json({message:'Not found.'},404);
 const token=randomHex();
 await db.batch([db.prepare('DELETE FROM player_sessions WHERE expires_at<=?').bind(Date.now()),db.prepare('DELETE FROM player_auth_limits WHERE expires_at<=?').bind(Date.now()),db.prepare('INSERT INTO player_sessions VALUES(?,?,?)').bind(await hexDigest(token),account.id,Date.now()+30*86400000)]);
 return json({...await accountProfile(db,account),token,...(recoveryCode&&{recoveryCode})});
}
async function accountScore(db,request,env,mode,day,json){
 const input=await readRun(request.clone());
 if(!input||typeof input!=='object'||Array.isArray(input))return json({message:'Enter a valid score.'},400);
 const user=await accountUser(db,request);
 if(request.headers.has('Authorization')&&!user)return json({message:'Your sign-in expired. Sign in again before saving.'},401);
 const supplied=typeof input?.username==='string'?input.username.trim().toLowerCase():'';
 const owner=await db.prepare('SELECT id FROM player_accounts WHERE username_key=?').bind(supplied).first();
 if(owner&&owner.id!==user?.id)return json({message:'Sign in to save scores under this registered username.'},403);
 if(user)input.username=user.username;
 const rewritten=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 let savedPayload;
 const capture=(body,status=200)=>{if(status===200)savedPayload=body;return json(body,status);};
 const response=mode==='rating'?await saveRating(db,rewritten,capture):await saveRun(db,rewritten,mode,day,capture);
 if(user&&savedPayload){
 // Derive history again from server-side scoring; clients cannot submit profile totals.
 let details;
 if(mode==='rating'){
 const {results}=await db.prepare('SELECT event_id,guess,points FROM rating_answers_v163 WHERE run_id=?').bind(input.runId).all();
 details={...savedPayload,scoringVersion:163,rounds:results};
 }else{
 const archive=await readArchive(mode,day);
 details={...savedPayload,day:mode==='daily'?day:null,rounds:input.guesses.map(g=>({name:archive.get(g.id).name,...scoreGuess(archive.get(g.id),g.point,null)}))};
 }
 await db.prepare('INSERT INTO player_run_history(account_id,run_id,mode,result,saved_at) VALUES(?,?,?,?,?) ON CONFLICT(account_id,run_id) DO NOTHING').bind(user.id,input.runId,mode||'all',JSON.stringify(details),Date.now()).run();
 }
 return response;
}

// Only this authenticated endpoint returns another player's guess coordinates.
async function dailyReplay(db, request, params, today, json) {
  const user = await accountUser(db, request);
  if (!user) return json({message: 'Sign in to view Daily Challenge replays.'}, 401);
  const day = params.get('day') || today;
  if (!validDate(day) || day > today) return json({message: 'Choose a valid challenge date.'}, 400);
  const board = 'daily:' + day;
  const completed = await db.prepare(`SELECT 1 AS completed FROM mode_best
    WHERE board = ? AND gamertag_key = ?`).bind(board, user.username_key).first();
  // Check access before checking a target or returning any lineup/replay details.
  if (!completed) return json({message: 'Complete and save all five rounds of this Daily Challenge to unlock replays.'}, 403);
  if (!params.has('gamertag')) {
    const {results} = await db.prepare(`SELECT r.gamertag_key, b.gamertag AS username, b.score_tenths / 10.0 AS averageMiles FROM daily_replays r JOIN mode_best b USING(board,gamertag_key) WHERE r.board = ? ORDER BY b.score_tenths, r.gamertag_key`).bind(board).all();
    return json({day, unlocked: true, available: results.map(row => row.gamertag_key), players: results.map(({username,averageMiles}) => ({username,averageMiles}))});
  }
  const username = params.get('gamertag').trim();
  if (!gamertagPattern.test(username)) return json({message: 'Choose a valid player.'}, 400);
  const replay = await db.prepare(`SELECT r.rounds, b.gamertag AS username,
      b.score_tenths / 10.0 AS averageMiles
    FROM daily_replays r JOIN mode_best b USING (board, gamertag_key)
    WHERE r.board = ? AND r.gamertag_key = ?`).bind(board, username.toLowerCase()).first();
  if (!replay) return json({message: 'Replay unavailable. This score was saved before round guesses were recorded.'}, 404);
  return json({day, username: replay.username, averageMiles: replay.averageMiles, rounds: JSON.parse(replay.rounds)});
}

// Read-only public Daily statistics. Uses existing first-saved per-day scores;
// never reads account credentials, private history, or replay coordinates.
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const dailyCTE = `WITH daily AS (
  SELECT board,gamertag_key,gamertag,score_tenths FROM mode_best
  WHERE board GLOB 'daily:????-??-??' AND substr(board,7) <= ?
    AND typeof(score_tenths) = 'integer' AND score_tenths >= 0
)`;
async function dailyPlayerStats(db, params, today, json) {
  const username = params.get('gamertag')?.trim();
  const before = params.get('before');
  if (!username || !/^[\p{L}\p{N} _-]{2,20}$/u.test(username) || (before !== null && (!validDay(before) || before > today))) {
    return json({message:'Choose a valid player and history date.'},400);
  }
  const key = username.toLowerCase();
  const summary = db.prepare(`${dailyCTE}, players AS (
    SELECT gamertag_key,COUNT(*) AS daysPlayed,AVG(score_tenths) AS averageTenths,
      MIN(score_tenths)/10.0 AS bestMiles,MAX(score_tenths)/10.0 AS worstMiles,
      MIN(substr(board,7)) AS firstDay,MAX(substr(board,7)) AS latestDay
    FROM daily GROUP BY gamertag_key
  ) SELECT target.*,
    (SELECT gamertag FROM daily WHERE gamertag_key=target.gamertag_key ORDER BY board DESC LIMIT 1) AS username,
    CASE WHEN target.daysPlayed>=2 THEN 1+(SELECT COUNT(*) FROM players p WHERE p.daysPlayed>=2 AND ROUND(p.averageTenths)<ROUND(target.averageTenths)) ELSE NULL END AS overallPlace,
    CASE WHEN target.daysPlayed>=2 THEN (SELECT COUNT(*) FROM players p WHERE p.daysPlayed>=2 AND ROUND(p.averageTenths)=ROUND(target.averageTenths)) ELSE 0 END AS tiedPlayers,
    (SELECT COUNT(*) FROM players WHERE daysPlayed>=2) AS totalPlayers,
    (SELECT COUNT(*) FROM players) AS totalPlayersWithScores,
    (SELECT AVG(p.averageTenths)/10.0 FROM players p WHERE p.daysPlayed>=2 AND p.gamertag_key<>target.gamertag_key) AS otherPlayersAverageMiles,
    (SELECT COUNT(*) FROM daily) AS totalSavedDailies
    FROM players target WHERE target.gamertag_key=?`).bind(today,key);
  const history = db.prepare(`${dailyCTE}
    SELECT substr(s.board,7) AS day,s.score_tenths/10.0 AS averageMiles,c.grades,
      1+(SELECT COUNT(*) FROM daily b WHERE b.board=s.board AND (b.score_tenths,b.gamertag_key)<(s.score_tenths,s.gamertag_key)) AS place,
      (SELECT COUNT(*) FROM daily b WHERE b.board=s.board) AS players,
      (SELECT AVG(b.score_tenths)/10.0 FROM daily b WHERE b.board=s.board) AS fieldAverageMiles
    FROM daily s LEFT JOIN daily_share_cards c ON c.board=s.board AND c.gamertag_key=s.gamertag_key
    WHERE s.gamertag_key=? AND (? IS NULL OR s.board < 'daily:'||?)
    ORDER BY s.board DESC LIMIT 51`).bind(today,key,before,before);
  const [a,b] = await db.batch([summary,history]);
  const row = a.results[0];
  if (!row) return json({message:'No saved Daily Challenge scores found for this player.'},404);
  const round = n => n === null ? null : Math.round(n*10)/10;
  const entries = b.results.slice(0,50).map(r=>({...r,fieldAverageMiles:round(r.fieldAverageMiles),grades:typeof r.grades==='string' && /^[ABCDF]{5}$/.test(r.grades)?r.grades.split(''):null}));
  return json({username:row.username,asOf:today,daysPlayed:row.daysPlayed,eligible:row.daysPlayed>=2,minimumDays:2,
    overallAverageMiles:row.daysPlayed>=2?round(row.averageTenths/10):null,bestMiles:row.bestMiles,worstMiles:row.worstMiles,
    firstDay:row.firstDay,latestDay:row.latestDay,overallPlace:row.overallPlace,tiedPlayers:row.tiedPlayers,
    totalPlayers:row.totalPlayers,totalPlayersWithScores:row.totalPlayersWithScores,otherPlayersAverageMiles:round(row.otherPlayersAverageMiles),totalSavedDailies:row.totalSavedDailies,
    comparison:'At least two saved Daily challenge days are required for a lifetime average, EF player rating and overall rank. Qualified players have equal weight; dates and days played vary. Lower miles is better. Overall ties share a rank at one decimal place.',
    history:entries,nextBefore:b.results.length>50?entries.at(-1).day:null});
}
