ALTER TABLE transcript_items
  ADD COLUMN IF NOT EXISTS conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS title_updated_at TIMESTAMPTZ;

UPDATE transcript_items
SET
  conversation_id = COALESCE(conversation_id, session_id),
  title = COALESCE(title, 'Conversation ' || RIGHT(session_id, 6)),
  title_updated_at = COALESCE(title_updated_at, created_at)
WHERE conversation_id IS NULL OR title IS NULL OR title_updated_at IS NULL;

ALTER TABLE transcript_items
  ALTER COLUMN conversation_id SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN title_updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transcript_items_conversation_id
  ON transcript_items(conversation_id);
