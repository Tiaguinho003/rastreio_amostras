DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'SampleEventType'
      AND e.enumlabel = 'PHYSICAL_SAMPLE_SEND_UPDATED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'PHYSICAL_SAMPLE_SEND_UPDATED';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'SampleEventType'
      AND e.enumlabel = 'PHYSICAL_SAMPLE_SEND_CANCELLED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'PHYSICAL_SAMPLE_SEND_CANCELLED';
  END IF;
END
$$;
