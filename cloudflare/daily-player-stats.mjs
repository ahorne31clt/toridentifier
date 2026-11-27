// Read-only public Daily statistics. Uses existing first-saved per-day scores;
// never reads account credentials, private history, or replay coordinates.
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const dailyCTE = `WITH daily AS (
  SELECT board,gamertag_key,gamertag,score_tenths FROM mode_best
  WHERE board GLOB 'daily:????-??-??' AND substr(board,7) <= ?
    AND typeof(score_tenths) = 'integer' AND score_tenths >= 0
)`;
export async function dailyPlayerStats(db, params, today, json) {
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
