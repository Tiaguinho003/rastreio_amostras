DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'ModuleType'
      AND e.enumlabel = 'COMMERCIAL'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'ModuleType'
      AND e.enumlabel = 'commercial'
  ) THEN
    ALTER TYPE "ModuleType" RENAME VALUE 'COMMERCIAL' TO 'commercial';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'ModuleType'
      AND e.enumlabel = 'commercial'
  ) THEN
    ALTER TYPE "ModuleType" ADD VALUE 'commercial';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'IdempotencyScope'
      AND e.enumlabel = 'COMMERCIAL_STATUS_UPDATE'
  ) THEN
    ALTER TYPE "IdempotencyScope" ADD VALUE 'COMMERCIAL_STATUS_UPDATE';
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
      AND e.enumlabel = 'COMMERCIAL_STATUS_UPDATED'
  ) THEN
    ALTER TYPE "SampleEventType" ADD VALUE 'COMMERCIAL_STATUS_UPDATED';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'CommercialStatus'
  ) THEN
    CREATE TYPE "CommercialStatus" AS ENUM (
      'OPEN',
      'SOLD',
      'LOST'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_name = 'sample'
      AND c.column_name = 'commercial_status'
  ) THEN
    ALTER TABLE "sample"
      ADD COLUMN "commercial_status" "CommercialStatus" NOT NULL DEFAULT 'OPEN';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "idx_sample_commercial_status" ON "sample"("commercial_status");
CREATE INDEX IF NOT EXISTS "idx_sample_commercial_updated_id" ON "sample"("commercial_status", "updated_at", "id");
