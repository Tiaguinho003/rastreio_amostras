CREATE OR REPLACE FUNCTION "fn_guard_sample_event_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_existing BOOLEAN;
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

  RETURN NEW;
END;
$$;
