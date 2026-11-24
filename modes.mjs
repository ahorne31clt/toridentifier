export const gameModes = {
  all: 'Tornado Photo Challenge',
  iconic: 'Iconic EF4 / EF5',
  recent: 'Past Year',
  rating: 'Guess the EF Rating',
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

export function eventModes(event, now = new Date()) {
  const modes = ['all'];
  if (/^(?:EF|F)[0-5U]$/.test(event.rating || '')) modes.push('rating');
  if (iconicIds.has(event.id) && /^(?:EF|F)[45]$/.test(event.rating)) modes.push('iconic');
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
  const start = startDate.toISOString().slice(0, 10);
  if (event.date >= start && event.date <= end) modes.push('recent');
  return modes;
}

export function modeCatalog(catalog, mode, now = new Date()) {
  return catalog.filter(event => (event.modes || eventModes(event, now)).includes(mode));
}
