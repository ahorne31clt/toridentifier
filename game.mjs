import {gradeBands, roundsPerRun, scoreGuess, trackPaths, validDate} from './scoring.mjs';
import {setupCitySearch} from './city-search.mjs';

const el = id => document.getElementById(id);
const archiveKey = 'tornado-identifier-guest-scores-v1';
const number = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1});
const dateFormat = new Intl.DateTimeFormat('en-US', {dateStyle: 'long', timeZone: 'UTC'});
const milesText = miles => miles > 0 && miles < 0.1 ? '<0.1 mi' : number.format(miles) + ' mi';
const makeId = () => [...crypto.getRandomValues(new Uint8Array(16))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const defaultView = [[38, -96], 4];
let map, layers, deck = [], catalog = [], active, point, marker;
let resetCitySearch;
let isStatic = false, isRevealed = false, isSubmitting = false, isPhotoReady = false;
let roundId, runId, lastId, deckPosition = 0;
let leaderboardRequest = 0;
let signedIn = {username: null, history: [], total: 0};
let guest = {history: [], total: 0};

try {
  const saved = JSON.parse(localStorage.getItem(archiveKey));
  if (Array.isArray(saved?.history) && Number.isInteger(saved.total)) guest = saved;
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

function loadRound() {
  resetCitySearch();
  if (!deck.length) {
    deck = shuffle(catalog).slice(0, roundsPerRun(catalog.length));
    deckPosition = 0;
    runId = makeId();
  }
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
  el('round-count').textContent = 'Photo ' + deckPosition + ' of ' + roundsPerRun(catalog.length);
  el('submit-guess').hidden = false;
  el('submit-guess').disabled = true;
  el('center-target').hidden = false;
  el('center-target').disabled = true;
  el('zoom-track').hidden = true;
  el('next-round').hidden = true;
  el('next-round').textContent = 'Next photo';
  el('guess-date').value = '';
  for (const id of ['answer', 'result']) el(id).hidden = true;
  el('photo-prompt').hidden = false;
  updateDateMode();
  showMessage('game-status');
  showMessage('photo-status', 'Loading photo…');
  const image = el('round-image');
  image.hidden = true;
  image.onload = () => {
    isPhotoReady = true;
    image.hidden = false;
    el('center-target').disabled = false;
    el('submit-guess').disabled = !point;
    showMessage('photo-status');
  };
  image.onerror = () => {
    showMessage('photo-status', 'This photo could not load.');
    el('submit-guess').hidden = true;
    el('next-round').hidden = false;
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
  el('grade').textContent = record.grade;
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
  for (const id of ['submit-guess', 'center-target', 'account-button']) el(id).disabled = true;
  showMessage('game-status');
  try {
    let result;
    if (isStatic) {
      const record = {name: active.name, ...scoreGuess(active, point, date), playedAt: new Date().toISOString()};
      result = {event: active, point, record, profile: null};
    } else {
      result = await api('guess', {id: active.id, point, date, roundId, runId});
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
    renderResult(result);
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

function renderProfile() {
  const {username} = signedIn;
  const {history, total} = username ? signedIn : guest;
  el('account-button').textContent = username ? 'Scores · ' + username : isStatic ? 'Score history' : 'Scores / Sign in';
  el('round-summary').textContent = total + (total === 1 ? ' round played' : ' rounds played');
  el('account-state').textContent = username ? 'Signed in as ' + username + '.' :
    isStatic ? 'Guest scores are saved on this browser. Sign-in requires the game server.' :
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
    for (const value of [score.name, score.grade, milesText(score.miles)]) row.insertCell().textContent = value;
  }
  container.append(title, table);
}

async function loadLeaderboard() {
  const request = ++leaderboardRequest;
  const table = el('leaderboard-table');
  const body = table.tBodies[0];
  const legacy = el('leaderboard-ruleset').value === 'point';
  el('leaderboard-mode').hidden = isStatic;
  table.hidden = true;
  el('leaderboard-rules').hidden = true;
  body.replaceChildren();
  showMessage('leaderboard-status', isStatic ? 'The shared leaderboard requires the game server.' : 'Loading rankings…');
  if (isStatic) return;
  try {
    const {rounds, entries} = await api(legacy ? 'leaderboard?rules=point' : 'leaderboard');
    if (request !== leaderboardRequest) return;
    showMessage('leaderboard-rules', legacy ? 'Scores from before DAT track scoring was introduced.' :
      'Play all ' + rounds + ' photos while signed in to qualify. The lowest average distance wins. ' +
      'Where available, surveyed tracks are used to measure distance.');
    showMessage('leaderboard-status', entries.length ? '' : 'No ranked runs yet.');
    for (const entry of entries) {
      const row = body.insertRow();
      if (entry.username === signedIn.username) row.classList.add('current-player');
      for (const value of [entry.place, entry.username, milesText(entry.averageMiles)]) {
        row.insertCell().textContent = value;
      }
    }
    table.hidden = !entries.length;
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
  el('leaderboard-dialog').showModal();
  loadLeaderboard();
});
el('leaderboard-ruleset').addEventListener('change', loadLeaderboard);
el('account-button').addEventListener('click', () => {
  showMessage('account-message');
  renderProfile();
  el('account-dialog').showModal();
});
el('grade-guide').textContent = gradeBands.map(([grade, limit]) =>
  grade + (Number.isFinite(limit) ? ' ≤ ' + limit + ' mi' : ' > 600 mi')).join(' · ');
el('date-mode').addEventListener('change', updateDateMode);
el('guess-form').addEventListener('submit', submit);
el('next-round').addEventListener('click', () => {
  loadRound();
  el('photo-heading').focus();
});

async function init() {
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
      catalog = (await response.json()).map(event => tracks[event.id] ? {...event, track: tracks[event.id]} : event);
    } else {
      signedIn = await api('profile') || signedIn;
    }
    if (!Array.isArray(catalog) || !catalog.length) throw new Error('The archive has no playable photos.');
    buildMap();
    loadRound();
  } catch (error) {
    el('round-count').textContent = 'Unavailable';
    showMessage('photo-status', error.message);
  } finally {
    renderProfile();
    el('account-button').disabled = false;
    el('leaderboard-button').disabled = false;
  }
}

init();
