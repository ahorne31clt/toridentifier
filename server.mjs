import {ratingPoints} from './rating-game.mjs';
import {eventModes, gameModes, modeCatalog} from './modes.mjs';
import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes, createHash, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {roundsPerRun, scoreGuess, validDate, validPoint} from './scoring.mjs';

const deriveKey = promisify(scrypt);
const tracks = JSON.parse(readFileSync(new URL('./dat-tracks.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('./tornadoes.json', import.meta.url), 'utf8'))
  .filter(event => event.clueType === 'funnel')
  .map(event => tracks[event.id] ? {...event, track: tracks[event.id]} : event);
const events = new Map(catalog.map(event => [event.id, event]));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/logo.png', ['logo.png', 'image/png']],
  ['/favicon-lockup.png', ['favicon-lockup.png', 'image/png']],
  ['/logo-lockup.jpg', ['logo-lockup.jpg', 'image/jpeg']],
  ['/pressure-field.mjs', ['pressure-field.mjs', 'text/javascript; charset=utf-8']],
  ['/pressure-contours.svg', ['pressure-contours.svg', 'image/svg+xml']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/modes.mjs', ['modes.mjs', 'text/javascript; charset=utf-8']],
  ['/run-summary.mjs', ['run-summary.mjs', 'text/javascript; charset=utf-8']],
  ['/rating-game.mjs', ['rating-game.mjs', 'text/javascript; charset=utf-8']],
  ['/feedback.html', ['feedback.html', 'text/html; charset=utf-8']],
  ['/feedback-dashboard.html', ['feedback-dashboard.html', 'text/html; charset=utf-8']],
  ['/game.mjs', ['game.mjs', 'text/javascript; charset=utf-8']],
  ['/city-search.mjs', ['city-search.mjs', 'text/javascript; charset=utf-8']],
  ['/city-index.json', ['city-index.json', 'application/json; charset=utf-8']],
  ['/share-card.mjs', ['share-card.mjs', 'text/javascript; charset=utf-8']],
  ['/share-images.mjs', ['share-images.mjs', 'text/javascript; charset=utf-8']],
  ['/run-share.mjs', ['run-share.mjs', 'text/javascript; charset=utf-8']],
  ['/run-share.css', ['run-share.css', 'text/css; charset=utf-8']],
  ['/scoring.mjs', ['scoring.mjs', 'text/javascript; charset=utf-8']],
]);
for (const event of catalog) {
  if (!/^images\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(event.image) || !validPoint(event) || !validDate(event.date)) {
    throw new Error('Invalid tornado catalog entry ' + event.id);
  }
  const extension = event.image.split('.').at(-1).toLowerCase();
  const type = extension === 'jpg' ? 'jpeg' : extension;
  assets.set('/' + event.image, [event.image, 'image/' + type]);
}
if (!catalog.length || events.size !== catalog.length) throw new Error('Expected a non-empty catalog with unique IDs.');
const runLength = roundsPerRun(catalog.length);

const dataDir = resolve(process.env.TORNADO_DATA_DIR || fileURLToPath(new URL('./.data/', import.meta.url)));
mkdirSync(dataDir, {recursive: true});
const database = new DatabaseSync(resolve(dataDir, 'game.sqlite'));
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scores (
    user_id INTEGER NOT NULL REFERENCES users(id),
    round_id TEXT NOT NULL,
    played_at TEXT NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (user_id, round_id)
  );
  CREATE TABLE IF NOT EXISTS ranked_rounds (
    archive TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    run_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    round_id TEXT NOT NULL,
    miles REAL NOT NULL,
    PRIMARY KEY (archive, user_id, run_id, event_id),
    FOREIGN KEY (user_id, round_id) REFERENCES scores(user_id, round_id)
  );
`);

const archive = 'dat-v1:' + createHash('sha256').update(JSON.stringify(catalog
  .map(({id, image, lat, lng, track}) => ({
    id, image, lat, lng,
    paths: track?.features.flatMap(feature => feature.paths),
  }))
  .sort((a, b) => a.id.localeCompare(b.id)))).digest('hex');
const sessionAge = 60 * 60 * 24 * 30;
const secureCookie = process.env.TORNADO_SECURE_COOKIE === '1' ? '; Secure' : '';
const hashToken = token => createHash('sha256').update(token).digest('hex');
const getUser = database.prepare(`
  SELECT users.id, users.username FROM sessions
  JOIN users ON sessions.user_id = users.id
  WHERE token_hash = ? AND expires > ?
`);
const insertScore = database.prepare('INSERT OR IGNORE INTO scores VALUES (?, ?, ?, ?)');
const roundScore = database.prepare('SELECT result FROM scores WHERE user_id = ? AND round_id = ?');
const usersByName = database.prepare('SELECT * FROM users WHERE username = ?');
const insertRankedRound = database.prepare('INSERT OR IGNORE INTO ranked_rounds VALUES (?, ?, ?, ?, ?, ?)');
const leaderboard = database.prepare(`
  WITH complete_runs AS (
    SELECT user_id, AVG(miles) AS average_miles
    FROM ranked_rounds WHERE CASE WHEN ? IS NULL THEN archive NOT GLOB 'dat-v*:*' ELSE archive GLOB ? END
    GROUP BY archive, user_id, run_id HAVING COUNT(*) = ?
  ), player_bests AS (
    SELECT user_id, MIN(ROUND(average_miles, 1)) AS average_miles
    FROM complete_runs GROUP BY user_id
  )
  SELECT RANK() OVER (ORDER BY average_miles) AS place, users.username, average_miles AS averageMiles
  FROM player_bests JOIN users ON users.id = player_bests.user_id
  ORDER BY place, users.username COLLATE NOCASE LIMIT 25
`);

function sessionToken(request) {
  return /(?:^|;\s*)tornado_session=([0-9a-f]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
}

function sessionCookie(token, age) {
  return 'tornado_session=' + token + '; Max-Age=' + age + '; Path=/; HttpOnly; SameSite=Strict' + secureCookie;
}

function profile(user) {
  if (!user) return {username: null, history: [], total: 0};
  const {total} = database.prepare('SELECT count(*) AS total FROM scores WHERE user_id = ?').get(user.id);
  const history = database.prepare(`
    SELECT result FROM scores WHERE user_id = ? ORDER BY played_at DESC, rowid DESC LIMIT 50
  `).all(user.id).map(row => JSON.parse(row.result).record);
  return {username: user.username, history, total};
}

function json(response, status, payload) {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(payload));
}

function fail(status, message) {
  throw Object.assign(new Error(message), {status});
}

async function readBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) fail(415, 'Expected JSON.');
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 4096) fail(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks));
    if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  } catch {
    // Return the same error for invalid JSON and invalid body shape.
  }
  fail(400, 'Invalid request.');
}

const authAttempts = new Map();
function limitAuth(request) {
  const now = Date.now();
  for (const [address, limit] of authAttempts) {
    if (limit.end <= now) authAttempts.delete(address);
  }
  const address = request.socket.remoteAddress;
  const limit = authAttempts.get(address) || {end: now + 60000, count: 0};
  if (++limit.count > 12 || authAttempts.size >= 10000) fail(429, 'Too many attempts. Try again in a minute.');
  authAttempts.set(address, limit);
}

async function authenticate(request, response, route, token, input) {
  limitAuth(request);
  const register = route === '/api/register';
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const password = input.password;
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username) || typeof password !== 'string' ||
      !password.length || password.length > 128 || (register && password.length < 10)) {
    fail(400, 'Use a valid username and password.');
  }
  let user = usersByName.get(username);
  if (register) {
    const salt = randomBytes(16).toString('hex');
    const key = await deriveKey(password, salt, 64);
    const result = database.prepare('INSERT OR IGNORE INTO users (username, salt, password_hash) VALUES (?, ?, ?)')
      .run(username, salt, key.toString('hex'));
    if (!result.changes) fail(409, 'That username is already taken.');
    user = {id: result.lastInsertRowid, username};
  } else {
    const key = await deriveKey(password, user?.salt || 'tornado-identifier', 64);
    if (!user || !timingSafeEqual(key, Buffer.from(user.password_hash, 'hex'))) fail(401, 'Username or password is incorrect.');
  }
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  database.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
  const nextToken = randomBytes(32).toString('hex');
  database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hashToken(nextToken), user.id, Date.now() + sessionAge * 1000);
  response.setHeader('Set-Cookie', sessionCookie(nextToken, sessionAge));
  json(response, 200, profile(user));
}

function submitGuess(response, user, input) {
  const {id, point, date, roundId, runId, mode} = input;
  const event = events.get(id);
  if (!event || !validPoint(point) || (date !== null && !validDate(date)) ||
      typeof roundId !== 'string' || !/^[a-f0-9]{32}$/.test(roundId)) {
    fail(400, 'Enter a valid location and date.');
  }
  if (runId !== undefined && (typeof runId !== 'string' || !/^[a-f0-9]{32}$/.test(runId))) {
    fail(400, 'Invalid run. Reload to start a new run.');
  }
  if (mode === 'rating') fail(400, 'Use the rating challenge endpoint.');
  if (mode !== undefined && (!Object.hasOwn(gameModes, mode) || !eventModes(event).includes(mode))) {
    fail(400, 'This photo is unavailable in the selected mode.');
  }
  const rankedArchive = mode === undefined ? archive : `dat-v2:${mode}:${archive.slice(7)}`;
  const score = scoreGuess(event, point, date);
  const record = {name: event.name, ...score, playedAt: new Date().toISOString()};
  let result = {event, record, point};
  if (user) {
    database.exec('BEGIN');
    try {
      const inserted = insertScore.run(user.id, roundId, record.playedAt, JSON.stringify(result));
      if (inserted.changes && runId) {
        insertRankedRound.run(rankedArchive, user.id, runId, event.id, roundId, record.miles);
      } else if (!inserted.changes) {
        result = JSON.parse(roundScore.get(user.id, roundId).result);
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
  json(response, 200, {...result, profile: user ? profile(user) : null});
}

const prompts = () => catalog.map(event => ({id: event.id, image: event.image,
  hintCount: event.hints?.length || 0, modes: eventModes(event)}));
const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  try {
    const {pathname: route, searchParams} = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && assets.has(route)) {
      const [file, contentType] = assets.get(route);
      const body = readFileSync(new URL('./' + file, import.meta.url));
      response.writeHead(200, {'Content-Type': contentType});
      response.end(body);
      return;
    }
    if (request.method === 'GET' && route === '/api/rating/catalog') {
      return json(response, 200, catalog.filter(event => /^(?:EF|F)[0-5U]$/.test(event.rating)).map(({id, image, rating}) => ({id, image, ratingScale: rating.startsWith('EF') ? 'EF' : 'F'})));
    }
    if (request.method === 'POST' && route === '/api/rating/guess') {
      const input = await readBody(request);
      const event = events.get(input.id);
      if (!event || typeof input.guess !== 'string' || !/^(?:EF[0-5U]|F[0-5])$/.test(input.guess) || event.rating.startsWith('EF') !== input.guess.startsWith('EF')) fail(400, 'Choose a valid rating for this event’s scale.');
      return json(response, 200, {event, points: ratingPoints(event.rating, input.guess)});
    }
    if (request.method === 'GET' && route === '/api/catalog') return json(response, 200, prompts());
    if (request.method === 'GET' && route === '/api/hint') {
      const index = searchParams.get('index');
      const event = events.get(searchParams.get('event'));
      const hint = index !== null && /^\d+$/.test(index) && event?.hints?.[Number(index)];
      if (!hint) return json(response, 404, {message: 'This hint is unavailable.'});
      return json(response, 200, {hint});
    }
    if (request.method === 'GET' && route === '/api/leaderboard') {
      const mode = searchParams.get('mode');
      if (mode !== null && !Object.hasOwn(gameModes, mode)) fail(400, 'Unknown game mode.');
      const legacy = !mode && searchParams.get('rules') === 'point';
      const scope = mode ? `dat-v2:${mode}:*` : legacy ? null : 'dat-v1:*';
      const rounds = mode ? roundsPerRun(modeCatalog(catalog, mode).length) : runLength;
      return json(response, 200, {rounds, entries: leaderboard.all(scope, scope, rounds)});
    }
    const token = sessionToken(request);
    const user = token ? getUser.get(hashToken(token), Date.now()) : null;
    if (request.method === 'GET' && route === '/api/profile') return json(response, 200, profile(user));
    if (request.method !== 'POST' || !['/api/register', '/api/login', '/api/logout', '/api/guess'].includes(route)) {
      return json(response, 404, {message: 'Not found.'});
    }
    const input = await readBody(request);
    if (route === '/api/guess') return submitGuess(response, user, input);
    if (route !== '/api/logout') return await authenticate(request, response, route, token, input);
    if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    response.setHeader('Set-Cookie', sessionCookie('', 0));
    json(response, 200, profile(null));
  } catch (error) {
    if (!error.status) console.error(error);
    if (!response.headersSent) json(response, error.status || 500, {message: error.status ? error.message : 'The game server hit a problem.'});
  }
});

const port = Number(process.env.PORT || 8776);
server.listen(port, process.env.TORNADO_HOST || '127.0.0.1', () => {
  const {address, port: boundPort} = server.address();
  console.log('Tornado Guesser listening at http://' + address + ':' + boundPort);
});
