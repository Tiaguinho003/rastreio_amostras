-- AlterTable: add classified_at column to sample
ALTER TABLE "sample" ADD COLUMN "classified_at" TIMESTAMPTZ(6);

-- Backfill: populate classified_at from the latest CLASSIFICATION_COMPLETED event
UPDATE "sample" s
SET "classified_at" = sub."occurred_at"
FROM (
  SELECT se."sample_id",
         MAX(se."occurred_at") AS "occurred_at"
  FROM "sample_event" se
  WHERE se."event_type" = 'CLASSIFICATION_COMPLETED'
  GROUP BY se."sample_id"
) sub
WHERE s."id" = sub."sample_id"
  AND s."status" = 'CLASSIFIED';

-- CreateIndex
CREATE INDEX "idx_sample_classified_availability" ON "sample"("status", "commercial_status", "classified_at");
