CREATE UNIQUE INDEX IF NOT EXISTS idx_transcript_items_session_utterance_event_unique
  ON transcript_items(session_id, utterance_id, event_type);
