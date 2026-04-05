-- Remove OCR event types (never implemented, no data uses these values)

-- Drop indexes that reference the SampleEventType enum
DROP INDEX IF EXISTS "idx_sample_event_type_occurred";
DROP INDEX IF EXISTS "uq_sample_event_print_attempt";

-- Convert column to text, drop old enum, create new enum, convert back
ALTER TABLE "sample_event"
  ALTER COLUMN "event_type" TYPE text
  USING ("event_type"::text);

DROP TYPE "SampleEventType";
CREATE TYPE "SampleEventType" AS ENUM (
  'SAMPLE_RECEIVED',
  'REGISTRATION_STARTED',
  'PHOTO_ADDED',
  'REGISTRATION_CONFIRMED',
  'QR_PRINT_REQUESTED',
  'QR_PRINT_FAILED',
  'QR_PRINTED',
  'QR_REPRINT_REQUESTED',
  'CLASSIFICATION_STARTED',
  'CLASSIFICATION_SAVED_PARTIAL',
  'CLASSIFICATION_COMPLETED',
  'REGISTRATION_UPDATED',
  'CLASSIFICATION_UPDATED',
  'SALE_CREATED',
  'SALE_UPDATED',
  'SALE_CANCELLED',
  'LOSS_RECORDED',
  'LOSS_UPDATED',
  'LOSS_CANCELLED',
  'COMMERCIAL_STATUS_UPDATED',
  'SAMPLE_INVALIDATED',
  'REPORT_EXPORTED',
  'PHYSICAL_SAMPLE_SENT'
);

ALTER TABLE "sample_event"
  ALTER COLUMN "event_type" TYPE "SampleEventType"
  USING ("event_type"::"SampleEventType");

-- Recreate dropped indexes
CREATE INDEX "idx_sample_event_type_occurred" ON "sample_event"("event_type", "occurred_at");
CREATE UNIQUE INDEX "uq_sample_event_print_attempt" ON "sample_event" (
  "sample_id",
  (payload->>'printAction'),
  ((payload->>'attemptNumber')::integer)
) WHERE (
  event_type IN ('QR_PRINT_REQUESTED', 'QR_REPRINT_REQUESTED')
  AND payload ? 'printAction'
  AND payload ? 'attemptNumber'
);

-- Remove OCR module type
ALTER TABLE "sample_event"
  ALTER COLUMN "metadata_module" TYPE text
  USING ("metadata_module"::text);

DROP TYPE "ModuleType";
CREATE TYPE "ModuleType" AS ENUM (
  'registration',
  'classification',
  'print',
  'commercial'
);

ALTER TABLE "sample_event"
  ALTER COLUMN "metadata_module" TYPE "ModuleType"
  USING ("metadata_module"::"ModuleType");
