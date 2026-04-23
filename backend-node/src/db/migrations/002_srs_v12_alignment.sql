ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_salt TEXT;

DO $$
BEGIN
  -- Drop legacy room status constraint first so data can be migrated safely.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_status_check'
  ) THEN
    ALTER TABLE rooms DROP CONSTRAINT rooms_status_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'username'
  ) THEN
    UPDATE users
    SET email = username
    WHERE email IS NULL AND username IS NOT NULL;
  END IF;
END $$;

UPDATE rooms SET status = 'waiting' WHERE status = 'waiting_guest';
UPDATE rooms SET status = 'closed' WHERE status = 'ended';

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS room_code TEXT;

DO $$
DECLARE
  total_rooms BIGINT;
BEGIN
  SELECT COUNT(*) INTO total_rooms FROM rooms;
  IF total_rooms > 1000000 THEN
    RAISE EXCEPTION 'rooms_count_exceeds_6_digit_code_space: %', total_rooms;
  END IF;
END $$;

-- Recompute deterministic unique 6-digit room codes for existing rows.
WITH ordered AS (
  SELECT
    room_id,
    LPAD((ROW_NUMBER() OVER (ORDER BY created_at, room_id) - 1)::text, 6, '0') AS code
  FROM rooms
)
UPDATE rooms r
SET room_code = o.code
FROM ordered o
WHERE r.room_id = o.room_id;

ALTER TABLE rooms
  ALTER COLUMN room_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_status_check_v2'
  ) THEN
    ALTER TABLE rooms ADD CONSTRAINT rooms_status_check_v2 CHECK (status IN ('waiting', 'active', 'closed'));
  END IF;
END $$;

DROP INDEX IF EXISTS idx_rooms_room_code_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_room_code_unique ON rooms(room_code);
