ALTER TABLE transcript_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS transcript_item_owners (
  transcript_item_id BIGINT NOT NULL REFERENCES transcript_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transcript_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_transcript_item_owners_user
  ON transcript_item_owners(user_id);

CREATE INDEX IF NOT EXISTS idx_transcript_items_deleted_at
  ON transcript_items(deleted_at);
