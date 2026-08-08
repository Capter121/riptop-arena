CREATE TABLE builds (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  catalog_sha256 TEXT NOT NULL CHECK (length(catalog_sha256) = 64),
  battle_rules_version INTEGER NOT NULL CHECK (battle_rules_version > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX builds_player_id_idx ON builds(player_id);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  creator_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE INDEX challenges_recipient_status_idx ON challenges(recipient_player_id, status);
CREATE INDEX challenges_creator_id_idx ON challenges(creator_player_id);
