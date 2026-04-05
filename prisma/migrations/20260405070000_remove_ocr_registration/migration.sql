-- Remove OCR event types (never implemented)
ALTER TYPE "SampleEventType" RENAME TO "SampleEventType_old";

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
  USING ("event_type"::text::"SampleEventType");

DROP TYPE "SampleEventType_old";

-- Remove OCR module type (never used)
ALTER TYPE "ModuleType" RENAME TO "ModuleType_old";

CREATE TYPE "ModuleType" AS ENUM (
  'registration',
  'classification',
  'print',
  'commercial'
);

ALTER TABLE "sample_event"
  ALTER COLUMN "metadata_module" TYPE "ModuleType"
  USING ("metadata_module"::text::"ModuleType");

DROP TYPE "ModuleType_old";
