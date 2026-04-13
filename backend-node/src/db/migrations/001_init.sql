CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  user_type TEXT NOT NULL CHECK (user_type IN ('guest', 'registered')),
  display_name TEXT NOT NULL,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  access_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  host_participant_id TEXT NOT NULL,
  guest_participant_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('waiting_guest', 'active', 'ended')),
  provider_profile TEXT NOT NULL,
  supported_languages JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS participants (
  participant_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(room_id),
  identity TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'guest')),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  settings JSONB NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_room_role_unique ON participants(room_id, role);

CREATE TABLE IF NOT EXISTS worker_events (
  id BIGSERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voice_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(user_id),
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transcript_items (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(room_id),
  session_id TEXT NOT NULL,
  utterance_id TEXT NOT NULL,
  speaker_identity TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_text TEXT,
  translated_text TEXT,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcript_items_room_id ON transcript_items(room_id);
