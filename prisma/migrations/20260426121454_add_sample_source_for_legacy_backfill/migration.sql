-- Adiciona Sample.source (LIVE | LEGACY_BACKFILL) para distinguir amostras
-- importadas via backfill historico das amostras criadas no fluxo normal.
-- Tambem adiciona o IdempotencyScope LEGACY_SKELETON_CREATE usado pelo
-- endpoint admin que cria os esqueletos legacy.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'SampleSource'
  ) THEN
    CREATE TYPE "SampleSource" AS ENUM ('LIVE', 'LEGACY_BACKFILL');
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
      AND e.enumlabel = 'LEGACY_SKELETON_CREATE'
  ) THEN
    ALTER TYPE "IdempotencyScope" ADD VALUE 'LEGACY_SKELETON_CREATE';
  END IF;
END
$$;

ALTER TABLE "sample"
  ADD COLUMN IF NOT EXISTS "source" "SampleSource" NOT NULL DEFAULT 'LIVE';

CREATE INDEX IF NOT EXISTS "idx_sample_source" ON "sample"("source");
