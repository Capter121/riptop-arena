CREATE TABLE challenge_offers (
  id TEXT PRIMARY KEY,
  creator_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  parent_challenge_id TEXT REFERENCES challenges(id) ON DELETE RESTRICT,
  creation_request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'claimed', 'revoked', 'expired')),
  offer_json TEXT NOT NULL CHECK (json_valid(offer_json)),
  expires_at TEXT NOT NULL,
  claimed_challenge_id TEXT REFERENCES challenges(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (creator_player_id, creation_request_id),
  UNIQUE (parent_challenge_id),
  UNIQUE (claimed_challenge_id)
);

ALTER TABLE challenges
  ADD COLUMN offer_id TEXT REFERENCES challenge_offers(id) ON DELETE RESTRICT;

ALTER TABLE challenges
  ADD COLUMN parent_challenge_id TEXT REFERENCES challenges(id) ON DELETE RESTRICT;

ALTER TABLE challenges
  ADD COLUMN result_submission_id TEXT;

CREATE UNIQUE INDEX challenges_offer_id_unique_idx
  ON challenges(offer_id) WHERE offer_id IS NOT NULL;

CREATE UNIQUE INDEX challenges_result_submission_id_unique_idx
  ON challenges(result_submission_id) WHERE result_submission_id IS NOT NULL;

CREATE INDEX challenge_offers_target_status_updated_idx
  ON challenge_offers(target_player_id, status, updated_at, id);

CREATE INDEX challenge_offers_creator_status_updated_idx
  ON challenge_offers(creator_player_id, status, updated_at, id);

CREATE INDEX challenges_recipient_status_updated_idx
  ON challenges(recipient_player_id, status, updated_at, id);

CREATE INDEX challenges_creator_status_updated_idx
  ON challenges(creator_player_id, status, updated_at, id);

CREATE INDEX challenges_parent_id_idx ON challenges(parent_challenge_id);
