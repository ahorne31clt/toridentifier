function searchKey(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

async function loadPlaces() {
  const response = await fetch('./city-index.json');
  if (!response.ok) throw new Error('Could not load the city index.');
  const states = await response.json();
  return states.flatMap(([state, fullName, cities]) =>
    cities.map(([name, lat, lng]) => {
      const key = searchKey(name);
      return {name, state, lat, lng, key, shortKey: key + ' ' + state.toLowerCase(),
        fullKey: key + ' ' + searchKey(fullName)};
    })
  );
}

function matchRank(place, query) {
  const {key, shortKey, fullKey} = place;
  if (shortKey === query || fullKey === query) return 0;
  if (key === query) return 1;
  if (shortKey.startsWith(query) || fullKey.startsWith(query)) return 2;
  return -1;
}

export function setupCitySearch(map) {
  const form = document.getElementById('city-search');
  const field = document.getElementById('city-query');
  const panel = document.getElementById('city-search-panel');
  const status = document.getElementById('city-search-status');
  const list = document.getElementById('city-search-results');
  let placesPromise;
  let requestId = 0;

  function closeResults() {
    requestId++;
    panel.hidden = true;
    list.replaceChildren();
  }

  function selectPlace(place) {
    field.value = place.name + ', ' + place.state;
    closeResults();
    map.setView([place.lat, place.lng], 12, {animate: false});
    map.getContainer().focus({preventScroll: true});
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    closeResults();
    const currentRequest = requestId;
    const query = searchKey(field.value);
    panel.hidden = false;
    if (query.length < 2) {
      status.textContent = 'Enter at least two letters.';
      return;
    }
    status.textContent = 'Searching…';
    try {
      placesPromise ??= loadPlaces().catch(error => {
        placesPromise = null;
        throw error;
      });
      const places = await placesPromise;
      if (currentRequest !== requestId) return;
      const matches = places.map(place => ({place, rank: matchRank(place, query)}))
        .filter(match => match.rank >= 0)
        .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name)
          || a.place.state.localeCompare(b.place.state));
      if (matches.length === 1) {
        selectPlace(matches[0].place);
        return;
      }
      status.textContent = matches.length ? 'Choose a city to zoom in.' :
        'No cities found. Try a city name with its state.';
      for (const {place} of matches.slice(0, 12)) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = place.name + ', ' + place.state;
        button.addEventListener('click', () => selectPlace(place));
        item.append(button);
        list.append(item);
      }
    } catch {
      if (currentRequest === requestId) status.textContent = 'City search could not load. Try again.';
    }
  });

  field.addEventListener('input', closeResults);
  form.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.preventDefault();
    field.focus();
    closeResults();
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !form.contains(event.target)) closeResults();
  });
  field.disabled = false;
  form.querySelector('button[type=submit]').disabled = false;
  return () => {
    closeResults();
    field.value = '';
  };
}
