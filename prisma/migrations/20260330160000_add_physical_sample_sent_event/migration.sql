DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'SampleEventType'
      AND e.enumlabel = 'PHYSICAL_SAMPLE_SENT'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'PHYSICAL_SAMPLE_SENT';
  END IF;
END
$$;
