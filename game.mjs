import {gameModes, modeCatalog} from './modes.mjs';
import {playerRank, playerRankBands, gradeBands, roundsPerRun, scoreGuess, trackPaths, validDate} from './scoring.mjs';
import {setupCitySearch} from './city-search.mjs';

const el = id => document.getElementById(id);
const archiveKey = 'tornado-identifier-guest-scores-v1';
const soundKey = 'tornado-guesser-score-sounds';
const seenPhotosKey = 'tornado-guesser-seen-photos';
const arcadeKey = 'tornado-guesser-local-arcade';
const dailyKey = 'tornado-guesser-daily';
const modeTitles = {...gameModes, daily: 'Daily Challenge'};
const startLabels = {all: 'Play game', iconic: 'Play iconic', recent: 'Play past year', daily: 'Play daily'};
const arcadeUrl = 'https://tornado-guesser-leaderboard.ahorne31.workers.dev/leaderboard';
const arcadeHosts = new Set(['tornadoguesser.app', 'www.tornadoguesser.app', 'ahorne31clt.github.io']);
const number = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1});
const dateFormat = new Intl.DateTimeFormat('en-US', {dateStyle: 'long', timeZone: 'UTC'});
const milesText = miles => miles > 0 && miles < 0.1 ? '<0.1 mi' : number.format(miles) + ' mi';
const makeId = () => [...crypto.getRandomValues(new Uint8Array(16))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const defaultView = [[38, -96], 4];
const scoreNotes = {
  A: [523.25, 659.25, 783.99],
  B: [440, 587.33],
  C: [392, 440],
  D: [392, 329.63],
  F: [261.63, 196],
};
let map, layers, deck = [], catalog = [], active, point, marker;
let currentMode = 'all';
let resetCitySearch;
const playableCatalog = () => currentMode === 'daily' ?
  daily.ids.map(id => catalog.find(event => event.id === id)) : modeCatalog(catalog, currentMode);
const onlineArcade = () => isStatic && arcadeHosts.has(location.hostname);
let daily;
let dailySaved = false;
let isSavingScore = false;
let isChoosingMode = false;
let archiveRequest, audioContext;
let soundEnabled = true;
let isStatic = false, isRevealed = false, isSubmitting = false, isPhotoReady = false;
let roundId, runId, lastId, deckPosition = 0;
let leaderboardRequest = 0;
let signedIn = {username: null, history: [], total: 0};
let guest = {history: [], total: 0};
let seenPhotos = new Set();
let arcadeRounds = [];
let arcadeAverage = null;

try {
  const saved = JSON.parse(localStorage.getItem(archiveKey));
  if (Array.isArray(saved?.history) && Number.isInteger(saved.total)) guest = saved;
  soundEnabled = localStorage.getItem(soundKey) !== 'off';
  const seen = JSON.parse(localStorage.getItem(seenPhotosKey));
  if (Array.isArray(seen)) seenPhotos = new Set(seen.filter(id => typeof id === 'string'));

} catch {
  // Guest play can continue if browser storage is unavailable.
}

async function api(path, input) {
  const response = await fetch('./api/' + path, input === undefined ? {} : {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    if (response.ok || response.status === 404) return null;
    throw new Error('The game server is unavailable. Try again.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'The request failed.');
  return data;
}

function showMessage(id, message = '') {
  el(id).textContent = message;
  el(id).hidden = !message;
}

function renderSoundToggle() {
  const toggle = el('sound-toggle');
  toggle.textContent = soundEnabled ? 'Sound on' : 'Sound off';
  toggle.setAttribute('aria-pressed', String(soundEnabled));
}

function prepareScoreSound() {
  if (!soundEnabled || !window.AudioContext) return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch {
    // Audio is optional and may be unavailable.
  }
}

function playScoreSound(grade) {
  if (!soundEnabled || audioContext?.state !== 'running') return;
  const start = audioContext.currentTime + 0.015;
  const notes = scoreNotes[grade] || scoreNotes.D;
  notes.forEach((pitch, index) => {
    const at = start + index * 0.13;
    const tone = audioContext.createOscillator();
    const volume = audioContext.createGain();
    tone.type = 'triangle';
    tone.frequency.value = pitch;
    volume.gain.setValueAtTime(0.0001, at);
    volume.gain.exponentialRampToValueAtTime(0.075, at + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
    tone.connect(volume).connect(audioContext.destination);
    tone.start(at);
    tone.stop(at + 0.2);
  });
}

function hintCount(event) {
  return event.hintCount ?? event.hints?.length ?? 0;
}

async function revealHint() {
  const list = el('revealed-hints');
  const button = el('hint-button');
  const index = list.children.length;
  if (!active || isRevealed || index >= hintCount(active)) return;
  const request = roundId;
  button.disabled = true;
  showMessage('hint-status');
  try {
    let hint = active.hints?.[index];
    if (!isStatic) {
      const query = new URLSearchParams({event: active.id, index});
      hint = (await api('hint?' + query))?.hint;
    }
    if (request !== roundId || isRevealed) return;
    if (!hint) throw new Error('This hint is unavailable.');
    const item = document.createElement('li');
    item.textContent = hint;
    list.hidden = false;
    list.append(item);
    button.textContent = list.children.length < hintCount(active) ? 'Reveal another hint' : 'All hints revealed';
  } catch (error) {
    if (request === roundId && !isRevealed) showMessage('hint-status', error.message);
  } finally {
    if (request === roundId) button.disabled = isRevealed || list.children.length >= hintCount(active);
  }
}

function buildMap() {
  const leaflet = window.L;
  if (!leaflet) throw new Error('The map could not load. Check your connection and reload.');
  map = leaflet.map('map', {
    minZoom: 2,
    fadeAnimation: false,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1,
    scrollWheelZoom: false,
  }).setView(...defaultView);
  leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, noWrap: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(map);
  map.attributionControl.setPrefix(false);
  layers = leaflet.layerGroup().addTo(map);
  map.on('click', event => setTarget(event.latlng));
  el('center-target').addEventListener('click', () => setTarget(map.getCenter()));
  resetCitySearch = setupCitySearch(map);
}

function addMarker(position, actual = false, label = 'Recorded location') {
  return window.L.marker(position, {
    icon: window.L.divIcon({className: actual ? 'target actual' : 'target', iconSize: [21, 21]}),
    keyboard: false,
    interactive: isRevealed,
    zIndexOffset: actual ? 10 : 0,
  }).addTo(layers).bindTooltip(actual ? label : 'Your guess');
}

function setTarget(position) {
  if (!active || isRevealed || isSubmitting) return;
  const selected = position.wrap();
  point = {lat: selected.lat, lng: selected.lng};
  if (marker) marker.setLatLng(selected);
  else marker = addMarker(selected);
  el('map-state').textContent = 'Target set · click to move';
  el('submit-guess').disabled = !isPhotoReady;
}

function updateDateMode() {
  el('date-field').hidden = isRevealed || !el('date-mode').checked;
}

function shuffle(entries) {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  if (shuffled.length > 1 && shuffled[0].id === lastId) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}

function selectRun() {
  const pool = playableCatalog();
  const length = roundsPerRun(pool.length);
  const unseen = shuffle(pool.filter(event => !seenPhotos.has(event.id))).slice(0, length);
  if (unseen.length === length) return unseen;
  const previouslySeen = shuffle(pool.filter(event => seenPhotos.has(event.id)));
  return unseen.concat(previouslySeen.slice(0, length - unseen.length));
}

function markPhotoSeen(id) {
  if (seenPhotos.size === catalog.length) seenPhotos.clear();
  seenPhotos.add(id);
  try {
    localStorage.setItem(seenPhotosKey, JSON.stringify([...seenPhotos]));
  } catch {
    // Keep repeat prevention for the current session when storage is unavailable.
  }
}

function loadRound(restoreDaily = false) {
  resetCitySearch();
  if (!deck.length) {
    const pool = playableCatalog();
    const progress = currentMode === 'daily' && restoreDaily ? readDailyProgress() : null;
    if (currentMode === 'daily') {
      arcadeRounds = progress?.rounds || [];
      dailySaved = Boolean(progress?.saved);
      deckPosition = Math.min(arcadeRounds.length, pool.length - 1);
      deck = pool.slice(deckPosition);
      runId = progress?.runId || makeId();
    } else {
      deck = selectRun();
      deckPosition = 0;
      runId = makeId();
      arcadeRounds = [];
    }
  }
  arcadeAverage = null;
  el('arcade-score-form').hidden = true;
  el('arcade-gamertag').disabled = false;
  el('arcade-score-form').querySelector('button').disabled = false;
  showMessage('arcade-message');
  active = deck.shift();
  lastId = active.id;
  roundId = makeId();
  deckPosition++;
  point = marker = null;
  isRevealed = isPhotoReady = false;
  layers.clearLayers();
  map.setView(...defaultView, {animate: false});
  el('map').parentElement.classList.remove('revealed');
  el('map-state').textContent = 'Click map to place target';
  el('round-count').textContent = 'Photo ' + deckPosition + ' of ' + roundsPerRun(playableCatalog().length);
  el('next-round').textContent = 'Next photo';
  el('submit-guess').hidden = false;
  el('submit-guess').disabled = true;
  el('center-target').hidden = false;
  el('center-target').disabled = true;
  el('zoom-track').hidden = true;
  el('next-round').hidden = true;
  el('guess-date').value = '';
  for (const id of ['answer', 'result']) el(id).hidden = true;
  el('photo-prompt').hidden = false;
  el('full-photo-button').disabled = true;
  el('revealed-hints').replaceChildren();
  el('revealed-hints').hidden = true;
  el('hint-button').hidden = hintCount(active) === 0;
  el('hint-button').disabled = true;
  el('hint-button').textContent = 'Reveal a hint';
  showMessage('hint-status');
  updateDateMode();
  showMessage('game-status');
  showMessage('photo-status', 'Loading photo…');
  const image = el('round-image');
  image.hidden = true;
  image.onload = () => {
    isPhotoReady = true;
    image.hidden = false;
    el('full-photo-button').disabled = false;
    el('hint-button').disabled = false;
    el('center-target').disabled = false;
    el('submit-guess').disabled = !point;
    showMessage('photo-status');
    if (currentMode === 'daily' && arcadeRounds.length === daily.ids.length) {
      const last = arcadeRounds.at(-1);
      renderResult({event: active, point: last.point, record: scoreGuess(active, last.point, last.date)});
      showArcadeResult();
    }
  };
  image.onerror = () => {
    showMessage('photo-status', currentMode === 'daily' ?
      'This photo could not load. Reload to resume the daily run.' : 'This photo could not load.');
    el('submit-guess').hidden = true;
    el('next-round').hidden = currentMode === 'daily';
  };
  image.src = './' + active.image;
}

function renderResult({event, record, point: guess}) {
  isRevealed = true;
  layers.clearLayers();
  const reference = record.reference || event;
  const actual = [reference.lat, reference.lng];
  const target = [guess.lat, guess.lng];
  const paths = trackPaths(event.track).map(path => path.map(([lng, lat]) => [lat, lng]));
  const hasTrack = Boolean(record.reference && paths.length);
  if (hasTrack) {
    const track = window.L.polyline(paths, {
      color: '#e5ba79', weight: 5, opacity: 0.95, interactive: false, className: 'survey-track',
    }).addTo(layers);
    el('zoom-track').hidden = false;
    el('zoom-track').onclick = () => map.fitBounds(track.getBounds(), {padding: [30, 30], maxZoom: 13});
  }
  el('center-target').hidden = true;
  window.L.polyline([target, actual], {color: '#f38b86', weight: 2, dashArray: '5 6', interactive: false}).addTo(layers);
  addMarker(target);
  addMarker(actual, true, hasTrack ? 'Nearest point on surveyed track' : 'Recorded location');
  const bounds = window.L.latLngBounds([target, actual]);
  if (hasTrack) paths.forEach(path => path.forEach(vertex => bounds.extend(vertex)));
  map.fitBounds(bounds, {padding: [35, 50], maxZoom: 11, animate: false});
  el('map').parentElement.classList.add('revealed');
  el('map-state').textContent = hasTrack ? 'Red guess · Gold track' : 'Red guess · Gold event';
  el('event-name').textContent = event.name;
  el('event-date').textContent = dateFormat.format(new Date(event.date));
  showMessage('event-rating', event.rating);
  el('event-source').href = event.source;
  el('track-source').hidden = !hasTrack;
  if (hasTrack) {
    el('track-source').href = 'https://apps.dat.noaa.gov/StormDamage/DamageViewer/';
  }
  el('photo-credit').hidden = !event.photoCredit;
  el('photo-source').textContent = event.photoCredit || '';
  el('photo-source').href = event.photoSource || '';
  el('photo-license').hidden = !event.photoLicense;
  el('photo-license').textContent = event.photoLicense || '';
  el('photo-license').href = event.photoLicenseUrl || '';
  showMessage('photo-edit', event.photoEdit);
  el('grade').textContent = record.grade;
  el('grade').dataset.grade = record.grade;
  el('distance-label').textContent = hasTrack ? 'Distance to track' : 'Distance to event';
  el('distance').textContent = milesText(record.miles);
  const days = record.dateError;
  showMessage('date-result', days === null ? '' : days === 0 ? 'You got the date exactly right.' :
    'Your date guess was ' + number.format(days) + (days === 1 ? ' day off.' : ' days off.'));
  for (const id of ['answer', 'result', 'next-round']) el(id).hidden = false;
  for (const id of ['photo-prompt', 'submit-guess']) el(id).hidden = true;
  updateDateMode();
  el('next-round').focus({preventScroll: true});
}

async function submit(event) {
  event.preventDefault();
  if (!point || !active || isRevealed || isSubmitting) return;
  const date = (el('date-mode').checked && el('guess-date').value) || null;
  if (date && !validDate(date)) {
    showMessage('game-status', 'Enter a valid calendar date.');
    return;
  }
  isSubmitting = true;
  prepareScoreSound();
  for (const id of ['submit-guess', 'center-target', 'account-button']) el(id).disabled = true;
  showMessage('game-status');
  try {
    let result;
    if (isStatic) {
      const record = {name: active.name, ...scoreGuess(active, point, date), playedAt: new Date().toISOString()};
      result = {event: active, point, record, profile: null};
    } else {
      result = await api('guess', {id: active.id, point, date, roundId, runId, mode: currentMode});
      if (!result) throw new Error('The game server is unavailable. Try again.');
    }
    if (result.profile) signedIn = result.profile;
    else {
      signedIn = {username: null, history: [], total: 0};
      guest = {history: [result.record, ...guest.history].slice(0, 50), total: guest.total + 1};
      try {
        localStorage.setItem(archiveKey, JSON.stringify(guest));
      } catch {
        showMessage('game-status', 'Your browser could not save the guest score.');
      }
    }
    markPhotoSeen(result.event.id);
    renderResult(result);
    recordArcadeRound(result);
    playScoreSound(result.record.grade);
    renderProfile();
  } catch (error) {
    showMessage('game-status', error.message);
  } finally {
    isSubmitting = false;
    el('account-button').disabled = false;
    el('submit-guess').disabled = isRevealed;
    el('center-target').disabled = isRevealed;
  }
}

function recordArcadeRound({event, point: guess, record}) {
  if (!isStatic) return;
  arcadeRounds.push({id: event.id, point: guess, miles: record.miles, date: record.dateGuess});
  if (currentMode === 'daily') writeDailyProgress();
  showArcadeResult();
}

function readDailyProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(dailyKey));
    if (saved?.day === daily.day && /^[a-f0-9]{32}$/.test(saved.runId) && Array.isArray(saved.rounds) &&
        saved.rounds.length <= daily.ids.length && saved.rounds.every((round, i) =>
          round.id === daily.ids[i] && Number.isFinite(round.miles) &&
          Number.isFinite(round.point?.lat) && Number.isFinite(round.point?.lng))) return saved;
  } catch {
    // A session can continue when browser storage is unavailable.
  }
  return null;
}

function writeDailyProgress() {
  try {
    localStorage.setItem(dailyKey, JSON.stringify({day: daily.day, runId, rounds: arcadeRounds, saved: dailySaved}));
  } catch {
    // A session can continue when browser storage is unavailable.
  }
}

function showArcadeResult() {
  if (arcadeRounds.length !== roundsPerRun(playableCatalog().length) || (onlineArcade() && arcadeRounds.length < 5)) return;
  const mean = arcadeRounds.reduce((sum, round) => sum + round.miles, 0) / arcadeRounds.length;
  arcadeAverage = Math.round(mean * 10) / 10;
  el('arcade-run-score').textContent = 'Run average · ' + milesText(arcadeAverage) + ' · Player rank ' + playerRank(arcadeAverage);
  el('arcade-score-form').hidden = false;
  if (currentMode === 'daily') {
    el('next-round').textContent = 'Back to modes';
    if (dailySaved) {
      el('arcade-gamertag').disabled = true;
      el('arcade-score-form').querySelector('button').disabled = true;
      arcadeAverage = null;
      showMessage('arcade-message', 'Your daily score has been saved.');
    }
  }
  el('arcade-run-score').focus({preventScroll: true});
}

async function arcadeApi(mode, input, dailyLineup = false) {
  const options = {signal: AbortSignal.timeout(10000)};
  if (input) {
    options.method = 'POST';
    options.headers = {'Content-Type': 'application/json'};
    options.body = JSON.stringify(input);
  }
  const url = new URL(dailyLineup ? './daily' : arcadeUrl, arcadeUrl);
  if (!dailyLineup && mode !== 'combined') url.searchParams.set('mode', mode);
  const response = await fetch(url, options);
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The online leaderboard is unavailable. Try again.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'The online leaderboard is unavailable. Try again.');
  return data;
}

async function saveArcadeScore(event) {
  event.preventDefault();
  if (arcadeAverage === null) return;
  const field = el('arcade-gamertag');
  const username = field.value.trim();
  if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(username)) {
    showMessage('arcade-message', 'Use 2–20 letters, numbers, spaces, hyphens or underscores.');
    return;
  }
  if (onlineArcade()) {
    const submitButton = event.currentTarget.querySelector('button');
    const nextButton = el('next-round');
    isSavingScore = true;
    field.disabled = submitButton.disabled = nextButton.disabled = true;
    showMessage('arcade-message', 'Saving score…');
    try {
      const guesses = arcadeRounds.map(({id, point}) => ({id, point}));
      const {averageMiles, bestMiles} = await arcadeApi(currentMode, {username, runId, guesses,
        ...(currentMode === 'daily' && {day: daily.day})});
      arcadeAverage = null;
      if (currentMode === 'daily') {
        dailySaved = true;
        writeDailyProgress();
      }
      showMessage('arcade-message', currentMode === 'daily' && averageMiles !== bestMiles ?
        'The first score for this gamertag still stands.' : averageMiles > bestMiles ?
          'Your previous best still stands.' : 'Saved to the ' + modeTitles[currentMode] + ' leaderboard.');
    } catch (error) {
      field.disabled = submitButton.disabled = false;
      showMessage('arcade-message', error instanceof TypeError || error.name === 'TimeoutError' ?
        'The online leaderboard is unavailable. Try saving again.' : error.message);
    } finally {
      isSavingScore = false;
      nextButton.disabled = false;
    }
    return;
  }
  const key = username.toLowerCase();
  let arcadeScores = localBoard(currentMode);
  const best = arcadeScores.find(score => score.username.toLowerCase() === key);
  if (!best || arcadeAverage < best.averageMiles) {
    arcadeScores = arcadeScores.filter(score => score.username.toLowerCase() !== key)
      .concat({username, averageMiles: arcadeAverage})
      .sort((a, b) => a.averageMiles - b.averageMiles || a.username.localeCompare(b.username))
      .slice(0, 25);
  }
  let status = best && arcadeAverage >= best.averageMiles ? 'Your previous best still stands.' :
    arcadeScores.some(score => score.username.toLowerCase() === key) ? 'Saved to the arcade leaderboard.' :
      'This score finished outside the top 25.';
  try {
    localStorage.setItem(arcadeKey + ':' + currentMode, JSON.stringify(arcadeScores));
  } catch {
    status = 'Scores are available for this session. Browser storage is unavailable.';
  }
  el('arcade-gamertag').disabled = true;
  event.currentTarget.querySelector('button').disabled = true;
  arcadeAverage = null;
  showMessage('arcade-message', status);
}

function renderProfile() {
  const {username} = signedIn;
  const {history, total} = username ? signedIn : guest;
  el('account-button').textContent = username || isStatic ? 'My scores' : 'Sign in';
  el('round-summary').textContent = total + (total === 1 ? ' round played' : ' rounds played');
  el('account-state').textContent = username ? 'Signed in as ' + username + '.' :
    isStatic ? 'Online sign-in coming soon. Guest scores are saved on this browser.' :
      'Guest scores stay on this browser. Sign in to save new rounds to your account.';
  el('account-form').hidden = Boolean(username) || isStatic;
  el('sign-out').hidden = !username;
  const container = el('history');
  container.replaceChildren();
  if (!history.length) {
    container.textContent = 'Your completed rounds will appear here.';
    return;
  }

  const best = history.reduce((closest, score) => Math.min(closest, score.miles), Infinity);
  const title = document.createElement('h3');
  title.textContent = 'Recent rounds · Best ' + milesText(best);
  const table = document.createElement('table');
  const labels = table.createTHead().insertRow();
  for (const label of ['Event', 'Grade', 'Distance']) {
    const header = document.createElement('th');
    header.scope = 'col';
    header.textContent = label;
    labels.append(header);
  }
  const body = table.createTBody();
  for (const score of history) {
    const row = body.insertRow();
    row.insertCell().textContent = score.name;
    const grade = row.insertCell();
    grade.textContent = score.grade;
    grade.dataset.grade = score.grade;
    row.insertCell().textContent = milesText(score.miles);
  }
  container.append(title, table);
}

function renderLeaderboardRows(entries) {
  const table = el('leaderboard-table');
  const body = table.tBodies[0];
  for (const entry of entries) {
    const row = body.insertRow();
    if (entry.username === signedIn.username) row.classList.add('current-player');
    for (const value of [entry.place, entry.username]) {
      row.insertCell().textContent = value;
    }
    const badge = document.createElement('span');
    badge.className = 'player-rank';
    badge.textContent = playerRank(entry.averageMiles);
    badge.dataset.rank = badge.textContent;
    row.insertCell().append(badge);
    row.insertCell().textContent = milesText(entry.averageMiles);
  }
  table.hidden = !entries.length;
}

function localBoard(mode) {
  try {
    const key = mode === 'combined' ? arcadeKey : arcadeKey + ':' + mode;
    const scores = JSON.parse(localStorage.getItem(key));
    return Array.isArray(scores) ? scores.filter(score => typeof score?.username === 'string' &&
      Number.isFinite(score.averageMiles) && score.averageMiles >= 0).slice(0, 25) : [];
  } catch {
    return [];
  }
}

async function loadLeaderboard() {
  const request = ++leaderboardRequest;
  const table = el('leaderboard-table');
  const body = table.tBodies[0];
  const mode = el('leaderboard-game-mode').value;
  const legacy = mode === 'combined' && el('leaderboard-ruleset').value === 'point';
  el('leaderboard-mode').hidden = isStatic || mode !== 'combined';
  const combinedText = 'Scores from before mode-specific rankings.';
  el('leaderboard-title').textContent = isStatic ? 'Arcade leaderboard' : 'Leaderboard';
  table.hidden = true;
  el('leaderboard-rules').hidden = true;
  body.replaceChildren();
  if (onlineArcade()) {
    showMessage('leaderboard-rules', mode === 'combined' ? combinedText :
      'Finish five photos and enter a gamertag. The lowest average distance wins.');
    showMessage('leaderboard-status', 'Loading rankings…');
    try {
      const {entries, day} = await arcadeApi(mode);
      if (request !== leaderboardRequest) return;
      if (day) showMessage('leaderboard-rules', dateFormat.format(new Date(day + 'T00:00:00Z')) +
        ' · First score per gamertag · Lowest average distance wins');
      showMessage('leaderboard-status', entries.length ? '' : 'No arcade scores yet.');
      renderLeaderboardRows(entries);
    } catch {
      if (request === leaderboardRequest) {
        showMessage('leaderboard-status', 'The online leaderboard is unavailable. Reopen it to try again.');
      }
    }
    return;
  }
  if (isStatic) {
    const arcadeScores = localBoard(mode);
    showMessage('leaderboard-rules', mode === 'combined' ? combinedText :
      'Finish a run and enter a gamertag to save your best average distance on this browser.');
    showMessage('leaderboard-status', arcadeScores.length ? '' : 'No arcade scores yet.');
    renderLeaderboardRows(arcadeScores.map((entry, index) => ({...entry, place: index + 1})));
    return;
  }
  showMessage('leaderboard-status', 'Loading rankings…');
  try {
    const {rounds, entries} = await api(mode === 'combined' ? (legacy ? 'leaderboard?rules=point' : 'leaderboard') : 'leaderboard?mode=' + mode);
    if (request !== leaderboardRequest) return;
    showMessage('leaderboard-rules', legacy ? 'Scores from before DAT track scoring was introduced.' :
      'Play all ' + rounds + ' photos while signed in to qualify. The lowest average distance wins. ' +
      'Where available, surveyed tracks are used to measure distance.');
    showMessage('leaderboard-status', entries.length ? '' : 'No ranked runs yet.');
    renderLeaderboardRows(entries);
  } catch {
    if (request === leaderboardRequest) {
      showMessage('leaderboard-status', 'The leaderboard could not load. Reopen it to try again.');
    }
  }
}

async function updateAccount(path, input) {
  const buttons = el('account-dialog').querySelectorAll('#account-form button, #sign-out');
  for (const button of buttons) button.disabled = true;
  showMessage('account-message');
  try {
    const profile = await api(path, input);
    if (!profile) throw new Error('The game server is unavailable. Try again.');
    signedIn = profile;
    el('account-form').reset();
    renderProfile();
  } catch (error) {
    showMessage('account-message', error.message);
  } finally {
    for (const button of buttons) button.disabled = false;
  }
}

el('account-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = Object.fromEntries(new FormData(event.currentTarget));
  updateAccount(event.submitter?.value || 'login', input);
});
el('sign-out').addEventListener('click', () => updateAccount('logout', {}));
el('leaderboard-button').addEventListener('click', () => {
  el('leaderboard-game-mode').value = currentMode;
  el('leaderboard-dialog').showModal();
  loadLeaderboard();
});
el('leaderboard-ruleset').addEventListener('change', loadLeaderboard);
el('leaderboard-game-mode').addEventListener('change', loadLeaderboard);
el('account-button').addEventListener('click', () => {
  showMessage('account-message');
  renderProfile();
  el('account-dialog').showModal();
});
el('grade-guide').textContent = gradeBands.map(([grade, limit], index) =>
  grade + (Number.isFinite(limit) ? ' ≤ ' + limit + ' mi' : ' > ' + gradeBands[index - 1][1] + ' mi')).join(' · ');
el('date-mode').addEventListener('change', updateDateMode);
el('hint-button').addEventListener('click', revealHint);
el('full-photo-button').addEventListener('click', () => {
  el('full-photo-image').src = el('round-image').currentSrc;
  el('photo-dialog').showModal();
});
el('sound-toggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  renderSoundToggle();
  try {
    localStorage.setItem(soundKey, soundEnabled ? 'on' : 'off');
  } catch {
    // The current session still uses the selected setting.
  }
});
el('guess-form').addEventListener('submit', submit);
el('arcade-score-form').addEventListener('submit', saveArcadeScore);
el('next-round').addEventListener('click', () => {
  if (currentMode === 'daily' && arcadeRounds.length === daily.ids.length) {
    showHome();
    return;
  }
  loadRound();
  el('photo-heading').focus();
});

async function loadArchive() {
  el('account-button').disabled = true;
  try {
    catalog = await api('catalog');
    if (!catalog) {
      isStatic = true;
      const [response, trackResponse] = await Promise.all([
        fetch('./tornadoes.json'), fetch('./dat-tracks.json'),
      ]);
      if (!response.ok) throw new Error('The archive could not load. Reload to try again.');
      if (!trackResponse.ok) throw new Error('The survey tracks could not load. Reload to try again.');
      const tracks = await trackResponse.json();
      catalog = (await response.json()).filter(event => event.clueType === 'funnel')
        .map(event => tracks[event.id] ? {...event, track: tracks[event.id]} : event);
    } else {
      signedIn = await api('profile') || signedIn;
    }
    if (!Array.isArray(catalog) || !catalog.length) throw new Error('The archive has no playable photos.');
    el('daily-card').hidden = !onlineArcade();
    el('leaderboard-game-mode').querySelector('[value="daily"]').hidden = !onlineArcade();
    const ids = new Set(catalog.map(event => event.id));
    seenPhotos = new Set([...seenPhotos].filter(id => ids.has(id)));
    lastId = [...seenPhotos].at(-1);
    for (const mode of Object.keys(gameModes)) {
      const count = modeCatalog(catalog, mode).length;
      showMessage(mode === 'all' ? 'archive-size' : mode + '-size',
        number.format(count) + ' events · ' + roundsPerRun(count) + ' photos per run');
      document.querySelector('[data-play-mode="' + mode + '"]').disabled = !count;
    }
  } finally {
    renderProfile();
    el('account-button').disabled = false;
    el('leaderboard-button').disabled = false;
  }
}

function prepareArchive() {
  archiveRequest ??= loadArchive().then(() => true, error => {
    archiveRequest = null;
    showMessage('home-status', error.message);
    return false;
  });
  return archiveRequest;
}

function showPlayScreen(playing) {
  el('home-screen').hidden = playing;
  for (const id of ['play-screen', 'grade-details', 'round-summary']) el(id).hidden = !playing;
}

for (const button of document.querySelectorAll('[data-play-mode]')) {
  button.addEventListener('click', async () => {
    if (isSubmitting || isSavingScore || isChoosingMode) return;
    isChoosingMode = true;
    button.disabled = true;
    showMessage('home-status', 'Loading the photo archive…');
    try {
      if (!await prepareArchive()) return;
      const mode = button.dataset.playMode;
      const previousDay = daily?.day;
      if (mode === 'daily') {
        const lineup = await arcadeApi(mode, undefined, true);
        if (!Array.isArray(lineup.ids) || lineup.ids.length !== 5 ||
            lineup.ids.some(id => !catalog.some(event => event.id === id))) {
          throw new Error('Today’s photos could not load. Refresh and try again.');
        }
        daily = lineup;
        showMessage('daily-size', dateFormat.format(new Date(daily.day + 'T00:00:00Z')));
      } else if (!modeCatalog(catalog, mode).length) {
        throw new Error('No photos are available in this mode yet.');
      }
      const startNew = !active || currentMode !== mode || (mode === 'daily' && daily.day !== previousDay);
      currentMode = mode;
      document.body.dataset.gameMode = mode;
      el('active-mode-title').textContent = modeTitles[mode];
      showPlayScreen(true);
      if (map) map.invalidateSize({pan: false});
      else buildMap();
      if (startNew) {
        deck = [];
        loadRound(mode === 'daily');
      }
      for (const choice of document.querySelectorAll('[data-play-mode]')) {
        choice.textContent = choice.dataset.playMode === mode ? 'Resume game' : startLabels[choice.dataset.playMode];
      }
      showMessage('home-status');
      el('title').focus();
    } catch (error) {
      showPlayScreen(false);
      showMessage('home-status', error.message);
    } finally {
      button.disabled = false;
      isChoosingMode = false;
      if (!el('home-screen').hidden) button.focus();
    }
  });
}

function showHome() {
  showPlayScreen(false);
  el('home-title').focus();
}

el('modes-button').addEventListener('click', showHome);
el('home-link').addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  showHome();
});

renderSoundToggle();
prepareArchive();

const rankLegend = el('player-rank-bands');
for (const [index, [rank, limit]] of playerRankBands.entries()) {
  const item = document.createElement('li');
  const lower = playerRankBands[index - 1]?.[1];
  item.textContent = rank + ': ' + (index === 0 ? '0–' + limit :
    Number.isFinite(limit) ? 'over ' + lower + '–' + limit : 'over ' + lower) + ' mi';
  rankLegend.append(item);
}
