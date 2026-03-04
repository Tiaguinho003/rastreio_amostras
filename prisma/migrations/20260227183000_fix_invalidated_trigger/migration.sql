CREATE OR REPLACE FUNCTION "fn_guard_sample_event_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_existing BOOLEAN;
  label_photos JSONB;
  current_sample_status "SampleStatus";
BEGIN
  SELECT s."status"
  INTO current_sample_status
  FROM "sample" s
  WHERE s."id" = NEW."sample_id";

  IF current_sample_status = 'INVALIDATED' AND NEW."event_type" <> 'SAMPLE_INVALIDATED' THEN
    RAISE EXCEPTION 'cannot append events to INVALIDATED sample %', NEW."sample_id";
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "sample_event" se
    WHERE se."sample_id" = NEW."sample_id"
  ) INTO has_existing;

  IF NOT has_existing AND NEW."event_type" <> 'SAMPLE_RECEIVED' THEN
    RAISE EXCEPTION 'first event for sample must be SAMPLE_RECEIVED';
  END IF;

  IF has_existing AND NEW."event_type" = 'SAMPLE_RECEIVED' THEN
    RAISE EXCEPTION 'SAMPLE_RECEIVED can only be the first event';
  END IF;

  IF NEW."event_type" = 'SAMPLE_RECEIVED' AND NEW."sequence_number" <> 1 THEN
    RAISE EXCEPTION 'SAMPLE_RECEIVED must have sequence_number=1';
  END IF;

  IF NEW."event_type" = 'REGISTRATION_CONFIRMED' THEN
    label_photos := NEW."payload"->'labelPhotos';

    IF label_photos IS NULL OR jsonb_typeof(label_photos) <> 'array' OR jsonb_array_length(label_photos) < 1 THEN
      RAISE EXCEPTION 'REGISTRATION_CONFIRMED requires at least one label photo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
