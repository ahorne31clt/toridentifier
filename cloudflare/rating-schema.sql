-- Run once against the EXISTING leaderboard D1 database bound as DB.
-- Additive only: no existing table, score, daily lineup or share card is changed.
CREATE TABLE IF NOT EXISTS rating_sessions (
  run_id TEXT PRIMARY KEY,
  event_ids TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rating_sessions_expiry ON rating_sessions(expires_at);
CREATE TABLE IF NOT EXISTS rating_answers (
  run_id TEXT NOT NULL REFERENCES rating_sessions(run_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  guess TEXT NOT NULL,
  points INTEGER NOT NULL CHECK(points IN (0,1,3)),
  PRIMARY KEY(run_id,event_id)
);
CREATE TABLE IF NOT EXISTS rating_results (
  run_id TEXT PRIMARY KEY,
  gamertag_key TEXT NOT NULL,
  gamertag TEXT NOT NULL,
  points INTEGER NOT NULL CHECK(points BETWEEN 0 AND 15),
  exact INTEGER NOT NULL CHECK(exact BETWEEN 0 AND 5),
  saved_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rating_results_player ON rating_results(gamertag_key,points DESC,exact DESC);
