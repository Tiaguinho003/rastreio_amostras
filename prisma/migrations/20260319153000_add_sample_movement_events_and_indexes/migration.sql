DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'SampleEventType'
      AND e.enumlabel = 'SALE_CREATED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'SALE_CREATED';
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
      AND e.enumlabel = 'SALE_UPDATED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'SALE_UPDATED';
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
      AND e.enumlabel = 'SALE_CANCELLED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'SALE_CANCELLED';
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
      AND e.enumlabel = 'LOSS_RECORDED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'LOSS_RECORDED';
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
      AND e.enumlabel = 'LOSS_UPDATED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'LOSS_UPDATED';
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
      AND e.enumlabel = 'LOSS_CANCELLED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'LOSS_CANCELLED';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "idx_sample_movement_sample_status_created_id"
ON "sample_movement"("sample_id", "status", "created_at", "id");

CREATE INDEX IF NOT EXISTS "idx_sample_movement_sample_type_status_created_id"
ON "sample_movement"("sample_id", "movement_type", "status", "created_at", "id");

CREATE INDEX IF NOT EXISTS "idx_sample_movement_buyer_type_status_created_id"
ON "sample_movement"("buyer_client_id", "movement_type", "status", "created_at", "id");
