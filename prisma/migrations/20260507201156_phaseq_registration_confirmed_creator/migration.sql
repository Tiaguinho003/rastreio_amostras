-- Fase Q (2026-05-07): registro de amostra emite 1 evento único.
-- Antes: SAMPLE_RECEIVED era obrigatório como primeiro evento (3 passos
-- sequenciais até REGISTRATION_CONFIRMED). Após a Fase Q, REGISTRATION_CONFIRMED
-- vira o evento criador único (`fromStatus: null` → `toStatus: REGISTRATION_CONFIRMED`).
--
-- Este migration apenas atualiza a função do trigger `fn_guard_sample_event_insert`
-- pra refletir o novo evento criador. Os enums `SampleEventType` (SAMPLE_RECEIVED,
-- REGISTRATION_STARTED) e `SampleStatus` (PHYSICAL_RECEIVED, REGISTRATION_IN_PROGRESS)
-- continuam existindo neste momento — drop de valores fica pra migration final
-- da Fase Q quando classificação e impressão também tiverem migrado.

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

  IF NOT has_existing AND NEW."event_type" <> 'REGISTRATION_CONFIRMED' THEN
    RAISE EXCEPTION 'first event for sample must be REGISTRATION_CONFIRMED';
  END IF;

  IF has_existing
     AND NEW."event_type" = 'REGISTRATION_CONFIRMED'
     AND NEW."from_status" IS NULL
  THEN
    RAISE EXCEPTION 'REGISTRATION_CONFIRMED with from_status=NULL can only be the first event';
  END IF;

  IF NEW."event_type" = 'REGISTRATION_CONFIRMED'
     AND NEW."from_status" IS NULL
     AND NEW."sequence_number" <> 1
  THEN
    RAISE EXCEPTION 'REGISTRATION_CONFIRMED creator must have sequence_number=1';
  END IF;

  RETURN NEW;
END;
$$;
