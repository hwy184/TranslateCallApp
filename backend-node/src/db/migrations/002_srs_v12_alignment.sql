ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_salt TEXT;

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

WITH generated AS (
  SELECT room_id, LPAD(((ABS(hashtext(room_id)) % 1000000))::text, 6, '0') AS code
  FROM rooms
  WHERE room_code IS NULL
)
UPDATE rooms r
SET room_code = g.code
FROM generated g
WHERE r.room_id = g.room_id;

ALTER TABLE rooms
  ALTER COLUMN room_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_status_check_v2'
  ) THEN
    ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
    ALTER TABLE rooms ADD CONSTRAINT rooms_status_check_v2 CHECK (status IN ('waiting', 'active', 'closed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_room_code_unique ON rooms(room_code);
