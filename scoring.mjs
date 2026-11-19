export const gradeBands = [
  ['A', 25], ['B', 75], ['C', 150], ['D', 300], ['E', 600], ['F', Infinity],
];

export const roundsPerRun = archiveSize => Math.min(5, archiveSize);

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

export function nearestTrackPoint(point, paths) {
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

export function trackPaths(track) {
  return track?.features.flatMap(feature => feature.paths) || [];
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validPoint(point) {
  return Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}

export function scoreGuess(tornado, point, date) {
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
