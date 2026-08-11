CREATE TABLE survival_runs (
  run_id TEXT PRIMARY KEY CHECK (length(run_id) = 36),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  config_version TEXT NOT NULL CHECK (config_version = 'survival-v1'),
  simulation_version INTEGER NOT NULL CHECK (simulation_version > 0),
  battle_rules_version INTEGER NOT NULL CHECK (battle_rules_version > 0),
  seed TEXT NOT NULL CHECK (length(seed) = 32 AND seed NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK (status IN ('wave_ready', 'reward_pending', 'completed')),
  player_loadout_json TEXT NOT NULL CHECK (json_valid(player_loadout_json)),
  player_max_integrity REAL NOT NULL CHECK (player_max_integrity > 0),
  current_wave INTEGER NOT NULL CHECK (current_wave >= 1),
  current_wave_json TEXT NOT NULL CHECK (json_valid(current_wave_json)),
  integrity REAL NOT NULL CHECK (integrity >= 0 AND integrity <= player_max_integrity),
  burst_risk REAL NOT NULL CHECK (burst_risk >= 0),
  persistent_debuffs_json TEXT NOT NULL CHECK (
    json_valid(persistent_debuffs_json) AND json_type(persistent_debuffs_json) = 'array'
  ),
  growth_levels_json TEXT NOT NULL CHECK (
    json_valid(growth_levels_json) AND json_type(growth_levels_json) = 'object'
  ),
  next_wave_effect TEXT CHECK (next_wave_effect IS NULL OR next_wave_effect IN (
    'temporary-overdrive',
    'temporary-bulwark',
    'temporary-endurance'
  )),
  risk_level INTEGER NOT NULL CHECK (risk_level BETWEEN 0 AND 3),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  flawless_streak INTEGER NOT NULL DEFAULT 0 CHECK (flawless_streak >= 0),
  bosses_defeated INTEGER NOT NULL DEFAULT 0 CHECK (bosses_defeated >= 0),
  start_request_id TEXT NOT NULL UNIQUE CHECK (length(start_request_id) = 36),
  abandon_request_id TEXT UNIQUE CHECK (abandon_request_id IS NULL OR length(abandon_request_id) = 36),
  final_summary_json TEXT CHECK (final_summary_json IS NULL OR json_valid(final_summary_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND final_summary_json IS NOT NULL)
    OR
    (status != 'completed' AND completed_at IS NULL AND final_summary_json IS NULL)
  )
);

CREATE TABLE survival_wave_results (
  run_id TEXT NOT NULL REFERENCES survival_runs(run_id) ON DELETE CASCADE,
  wave INTEGER NOT NULL CHECK (wave >= 1),
  result_request_id TEXT NOT NULL UNIQUE CHECK (length(result_request_id) = 36),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  score_json TEXT NOT NULL CHECK (json_valid(score_json)),
  score INTEGER NOT NULL CHECK (score >= 0),
  settlement_json TEXT NOT NULL CHECK (json_valid(settlement_json)),
  reward_options_json TEXT NOT NULL CHECK (
    json_valid(reward_options_json) AND json_type(reward_options_json) = 'array'
  ),
  reward_request_id TEXT UNIQUE CHECK (reward_request_id IS NULL OR length(reward_request_id) = 36),
  selected_reward_json TEXT CHECK (selected_reward_json IS NULL OR json_valid(selected_reward_json)),
  checkpoint_after_json TEXT CHECK (checkpoint_after_json IS NULL OR json_valid(checkpoint_after_json)),
  settled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  rewarded_at TEXT,
  PRIMARY KEY (run_id, wave),
  CHECK (
    (reward_request_id IS NULL AND selected_reward_json IS NULL AND checkpoint_after_json IS NULL AND rewarded_at IS NULL)
    OR
    (reward_request_id IS NOT NULL AND selected_reward_json IS NOT NULL AND checkpoint_after_json IS NOT NULL AND rewarded_at IS NOT NULL)
  )
);

CREATE TABLE survival_best_scores (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE REFERENCES survival_runs(run_id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0),
  highest_completed_wave INTEGER NOT NULL CHECK (highest_completed_wave >= 0),
  bosses_defeated INTEGER NOT NULL CHECK (bosses_defeated >= 0),
  final_integrity REAL NOT NULL CHECK (final_integrity >= 0),
  risk_level INTEGER NOT NULL CHECK (risk_level BETWEEN 0 AND 3),
  loadout_summary_json TEXT NOT NULL CHECK (json_valid(loadout_summary_json)),
  achieved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX survival_runs_player_active_idx
  ON survival_runs (player_id)
  WHERE status != 'completed';

CREATE INDEX survival_runs_player_updated_idx
  ON survival_runs (player_id, updated_at DESC);

CREATE INDEX survival_wave_results_run_wave_idx
  ON survival_wave_results (run_id, wave DESC);

CREATE INDEX survival_best_ranking_idx
  ON survival_best_scores (
    score DESC,
    highest_completed_wave DESC,
    bosses_defeated DESC,
    final_integrity DESC,
    achieved_at ASC
  );
