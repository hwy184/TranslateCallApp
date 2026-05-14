DO $$
DECLARE
  transcript_room_fk_name TEXT;
BEGIN
  SELECT con.conname
  INTO transcript_room_fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_class frel ON frel.oid = con.confrelid
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'transcript_items'
    AND frel.relname = 'rooms'
    AND con.contype = 'f'
    AND pg_get_constraintdef(con.oid) LIKE '%(room_id)%';

  IF transcript_room_fk_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.transcript_items DROP CONSTRAINT %I',
      transcript_room_fk_name
    );
  END IF;
END $$;
