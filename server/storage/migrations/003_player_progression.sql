CREATE TABLE player_progression (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  initial_coins_imported INTEGER NOT NULL DEFAULT 0 CHECK (initial_coins_imported IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE wallet_events (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL CHECK (length(event_id) = 36),
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'debit')),
  delta INTEGER NOT NULL CHECK (
    delta != 0
    AND abs(delta) <= 10000
    AND ((kind = 'credit' AND delta > 0) OR (kind = 'debit' AND delta < 0))
  ),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (player_id, event_id)
);
