CREATE TABLE campaign_progress (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  opponent_id TEXT NOT NULL CHECK (opponent_id IN (
    'blaze-fang',
    'sky-gale',
    'abyss-tide',
    'forest-crown',
    'rift-drift',
    'dawn-verdict',
    'night-eclipse',
    'atlas-guardian'
  )),
  stars_mask INTEGER NOT NULL DEFAULT 0 CHECK (stars_mask BETWEEN 0 AND 7),
  defeated INTEGER NOT NULL DEFAULT 0 CHECK (defeated IN (0, 1)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  best_outcome_json TEXT CHECK (best_outcome_json IS NULL OR json_valid(best_outcome_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (player_id, opponent_id)
);

CREATE TABLE campaign_attempts (
  attempt_id TEXT PRIMARY KEY CHECK (length(attempt_id) = 36),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  opponent_id TEXT NOT NULL CHECK (opponent_id IN (
    'blaze-fang',
    'sky-gale',
    'abyss-tide',
    'forest-crown',
    'rift-drift',
    'dawn-verdict',
    'night-eclipse',
    'atlas-guardian'
  )),
  config_version TEXT NOT NULL CHECK (config_version = 'campaign-v1'),
  simulation_version INTEGER NOT NULL CHECK (simulation_version > 0),
  seed TEXT NOT NULL CHECK (length(seed) = 32 AND seed NOT GLOB '*[^0-9a-f]*'),
  loadout_index INTEGER NOT NULL CHECK (
    (opponent_id = 'atlas-guardian' AND loadout_index BETWEEN 0 AND 2)
    OR
    (opponent_id != 'atlas-guardian' AND loadout_index BETWEEN 0 AND 1)
  ),
  arena TEXT NOT NULL CHECK (arena IN ('classic_grid', 'neon_magma', 'absolute_zero')),
  ai_profile_id TEXT NOT NULL CHECK (ai_profile_id IN (
    'assault',
    'skirmisher',
    'control',
    'sustain',
    'ringout',
    'counter',
    'mixup',
    'fortress'
  )),
  player_loadout_json TEXT NOT NULL CHECK (json_valid(player_loadout_json)),
  player_upgrades_json TEXT NOT NULL CHECK (json_valid(player_upgrades_json)),
  enemy_loadout_json TEXT NOT NULL CHECK (json_valid(enemy_loadout_json)),
  enemy_upgrades_json TEXT NOT NULL CHECK (json_valid(enemy_upgrades_json)),
  player_max_integrity REAL NOT NULL CHECK (player_max_integrity > 0),
  start_request_id TEXT NOT NULL CHECK (length(start_request_id) = 36),
  result_request_id TEXT CHECK (result_request_id IS NULL OR length(result_request_id) = 36),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  settlement_json TEXT CHECK (settlement_json IS NULL OR json_valid(settlement_json)),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  UNIQUE (player_id, start_request_id),
  UNIQUE (player_id, result_request_id),
  CHECK (
    (result_request_id IS NULL AND result_json IS NULL AND settlement_json IS NULL AND completed_at IS NULL)
    OR
    (result_request_id IS NOT NULL AND result_json IS NOT NULL AND settlement_json IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX campaign_progress_player_updated_idx
  ON campaign_progress (player_id, updated_at DESC);

CREATE INDEX campaign_attempts_player_started_idx
  ON campaign_attempts (player_id, started_at DESC);

CREATE INDEX campaign_attempts_player_pending_idx
  ON campaign_attempts (player_id, completed_at)
  WHERE completed_at IS NULL;
