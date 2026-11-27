import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {nearestTrackPoint, validDate, validPoint} from '../scoring.mjs';

const root = new URL('../', import.meta.url);
const layer = 'https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1';
const fields = 'objectid,globalid,event_id,wfo,efscale,stormdate,starttime,length';
const tracksFile = new URL('dat-tracks.json', root);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const events = read('tornadoes.json');
const matches = read('dat-matches.json');
const eventById = new Map(events.map(event => [event.id, event]));
const [command, ...ids] = process.argv.slice(2);
const guid = /^\{[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}\}$/i;

function nextDate(date, days) {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

function validateCatalog() {
  if (!events.length || events.length !== eventById.size) throw new Error('Catalog must contain unique event IDs.');
  const images = new Set();
  for (const event of events) {
    if (!/^[\w-]+$/.test(event.id) || !event.name || !validDate(event.date) || !validPoint(event)) {
      throw new Error('Invalid catalog metadata for event ' + event.id);
    }
    if (event.hints !== undefined && (!Array.isArray(event.hints) ||
        event.hints.some(hint => typeof hint !== 'string' || !hint.trim()))) {
      throw new Error('Use an array of non-empty hint strings for event ' + event.id);
    }
    if (event.clueType !== 'funnel' || !/^(?:EF|F)[0-5U]$/.test(event.rating || '')) {
      throw new Error('Supply a verified funnel photo and official rating for event ' + event.id);
    }
    if (!/^images\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(event.image) ||
        !existsSync(new URL(event.image, root)) || images.has(event.image)) {
      throw new Error('Use an existing, unique image for event ' + event.id);
    }
    images.add(event.image);
  }
  const used = new Set();
  for (const [id, features] of Object.entries(matches)) {
    if (!eventById.has(id) || !Array.isArray(features) || !features.length) {
      throw new Error('Invalid DAT match for event ' + id);
    }
    for (const feature of features) {
      if (typeof feature !== 'string' || !guid.test(feature) || used.has(feature.toUpperCase())) {
        throw new Error('Invalid or reused DAT GlobalID for event ' + id);
      }
      used.add(feature.toUpperCase());
    }
  }
}

async function query(parameters) {
  const search = new URLSearchParams({f: 'geojson', outSR: '4326', outFields: fields, ...parameters});
  const response = await fetch(layer + '/query?' + search, {signal: AbortSignal.timeout(25_000)});
  if (!response.ok) throw new Error('DAT request failed with HTTP ' + response.status);
  const data = await response.json();
  if (data.error) throw new Error('DAT rejected the query: ' + data.error.message);
  if (!Array.isArray(data.features)) throw new Error('Unexpected DAT response.');
  return data.features;
}

function parseTrack(feature) {
  const {geometry, properties} = feature;
  if (!['LineString', 'MultiLineString'].includes(geometry?.type)) return null;
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const paths = lines.filter(line => line.length > 1).map(line =>
    line.map(([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))])
  );
  if (!paths.length) return null;
  return {
    globalId: properties.globalid.toUpperCase(),
    objectId: properties.objectid,
    label: properties.event_id || '',
    office: properties.wfo || '',
    rating: properties.efscale || '',
    dateUtc: new Date(properties.starttime || properties.stormdate).toISOString(),
    length: properties.length,
    paths,
  };
}

async function find() {
  const requested = ids.length ? ids.map(id => {
    const event = eventById.get(id);
    if (!event) throw new Error('Unknown event ID ' + id);
    return event;
  }) : events.filter(event => !matches[event.id]);
  for (const event of requested) {
    const [lng, lat] = [event.lng, event.lat];
    const data = await query({
      where: `stormdate >= timestamp '${event.date} 00:00:00' AND stormdate < timestamp '${nextDate(event.date, 2)} 00:00:00'`,
      inSR: '4326',
      geometryType: 'esriGeometryEnvelope',
      geometry: [lng - 0.85, lat - 0.65, lng + 0.85, lat + 0.65].join(','),
    });
    const candidates = data.map(parseTrack).filter(Boolean).map(({paths, ...metadata}) => ({
      ...metadata,
      milesFromCatalogPoint: Number(nearestTrackPoint(event, paths).miles.toFixed(1)),
    })).sort((a, b) => a.milesFromCatalogPoint - b.milesFromCatalogPoint);
    console.log(JSON.stringify({id: event.id, name: event.name, date: event.date, candidates}));
  }
}

function checkTracks(tracks) {
  if (Object.keys(tracks).length !== Object.keys(matches).length) {
    throw new Error('DAT track snapshot is out of sync. Run node scripts/dat.mjs sync.');
  }
  for (const [id, ids] of Object.entries(matches)) {
    if (tracks[id]?.dailyEffectiveFrom && !validDate(tracks[id].dailyEffectiveFrom)) throw new Error('Invalid Daily activation date for '+id);
    const features = tracks[id]?.features;
    if (features?.length !== ids.length || !features.every((feature, index) =>
      feature.globalId === ids[index].toUpperCase() && Number.isInteger(feature.objectId) &&
      feature.paths?.length && feature.paths.every(path => path.length > 1 &&
        path.every(([lng, lat]) => validPoint({lng, lat}))) &&
      [eventById.get(id).date, nextDate(eventById.get(id).date, 1)].includes(feature.dateUtc?.slice(0, 10)) &&
      nearestTrackPoint(eventById.get(id), feature.paths).miles <= 75
    )) throw new Error('Check DAT track IDs, dates, and location for event ' + id);
  }
}

async function sync() {
  const previous = read('dat-tracks.json');
  const ids = Object.values(matches).flat().map(id => id.toUpperCase());
  const features = new Map();
  for (let start = 0; start < ids.length; start += 25) {
    const batch = ids.slice(start, start + 25);
    const data = await query({where: 'globalid IN (' + batch.map(id => "'" + id + "'").join(',') + ')'});
    for (const item of data) {
      const feature = parseTrack(item);
      if (feature) features.set(feature.globalId, feature);
    }
  }
  const tracks = Object.fromEntries(Object.entries(matches).map(([event, trackIds]) => [
    event, {features: trackIds.map(id => {
      const feature = features.get(id.toUpperCase());
      if (!feature) throw new Error('DAT did not return geometry for ' + event + ' / ' + id);
      return feature;
    }), ...(previous[event]?.dailyEffectiveFrom && {dailyEffectiveFrom:previous[event].dailyEffectiveFrom})},
  ]));
  checkTracks(tracks);
  const temp = new URL('dat-tracks.json.tmp', root);
  const lines = Object.entries(tracks).map(([id, track]) => '  ' + JSON.stringify(id) + ': ' + JSON.stringify(track));
  writeFileSync(temp, '{\n' + lines.join(',\n') + '\n}\n');
  renameSync(temp, tracksFile);
  console.log('Saved ' + features.size + ' DAT features for ' + Object.keys(tracks).length + ' events.');
}

validateCatalog();
if (command === 'find') await find();
else if (command === 'sync') await sync();
else if (command === 'check') {
  const tracks = read('dat-tracks.json');
  checkTracks(tracks);
  console.log('Verified ' + events.length + ' photos and ' + Object.keys(tracks).length + ' DAT matches.');
} else {
  console.error('Usage: node scripts/dat.mjs find [event IDs…] | sync | check');
  process.exitCode = 1;
}
