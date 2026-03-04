DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'SampleEventType'
      AND e.enumlabel = 'REPORT_EXPORTED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'REPORT_EXPORTED';
  END IF;
END
$$;
