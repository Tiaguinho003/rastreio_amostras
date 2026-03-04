ALTER TABLE "sample"
ADD COLUMN "latest_classification_data" JSONB,
ADD COLUMN "classification_draft_data" JSONB,
ADD COLUMN "classification_draft_completion_percent" INTEGER;

ALTER TABLE "sample"
ADD CONSTRAINT "chk_sample_classification_draft_completion_percent_range"
CHECK (
  "classification_draft_completion_percent" IS NULL
  OR (
    "classification_draft_completion_percent" >= 0
    AND "classification_draft_completion_percent" <= 100
  )
);
