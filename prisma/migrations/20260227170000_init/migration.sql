-- Enums
CREATE TYPE "SampleStatus" AS ENUM (
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
  'REGISTRATION_CONFIRMED',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED',
  'INVALIDATED'
);

CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

CREATE TYPE "SourceType" AS ENUM ('web', 'api', 'worker');

CREATE TYPE "ModuleType" AS ENUM ('registration', 'classification', 'print', 'ocr');

CREATE TYPE "IdempotencyScope" AS ENUM (
  'REGISTRATION_CONFIRM',
  'QR_PRINT',
  'QR_REPRINT',
  'CLASSIFICATION_COMPLETE',
  'INVALIDATE'
);

CREATE TYPE "SampleEventType" AS ENUM (
  'SAMPLE_RECEIVED',
  'REGISTRATION_STARTED',
  'PHOTO_ADDED',
  'OCR_EXTRACTED',
  'OCR_FAILED',
  'OCR_CONFIRMED',
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
  'SAMPLE_INVALIDATED'
);

CREATE TYPE "AttachmentKind" AS ENUM ('LABEL_PHOTO');

CREATE TYPE "PrintAction" AS ENUM ('PRINT', 'REPRINT');

CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- Tables
CREATE TABLE "sample" (
  "id" UUID PRIMARY KEY,
  "internal_lot_number" TEXT,
  "status" "SampleStatus" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "last_event_sequence" INTEGER NOT NULL DEFAULT 0,
  "declared_owner" TEXT,
  "declared_sacks" INTEGER,
  "declared_harvest" TEXT,
  "declared_origin_lot" TEXT,
  "label_photo_count" INTEGER NOT NULL DEFAULT 0,
  "latest_classification_version" INTEGER,
  "latest_type" TEXT,
  "latest_screen" TEXT,
  "latest_defects_count" INTEGER,
  "latest_moisture" NUMERIC(5,2),
  "latest_density" NUMERIC(6,2),
  "latest_color_aspect" TEXT,
  "latest_notes" TEXT,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "uq_sample_internal_lot" UNIQUE ("internal_lot_number"),
  CONSTRAINT "chk_sample_declared_sacks_non_negative" CHECK ("declared_sacks" IS NULL OR "declared_sacks" >= 0),
  CONSTRAINT "chk_sample_label_photo_count_non_negative" CHECK ("label_photo_count" >= 0)
);

CREATE TABLE "sample_event" (
  "event_id" UUID PRIMARY KEY,
  "sample_id" UUID NOT NULL,
  "sequence_number" INTEGER NOT NULL,
  "event_type" "SampleEventType" NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "actor_type" "ActorType" NOT NULL,
  "actor_user_id" UUID,
  "source" "SourceType" NOT NULL,
  "payload" JSONB NOT NULL,
  "request_id" TEXT NOT NULL,
  "correlation_id" TEXT,
  "causation_id" UUID,
  "idempotency_scope" "IdempotencyScope",
  "idempotency_key" TEXT,
  "from_status" "SampleStatus",
  "to_status" "SampleStatus",
  "metadata_module" "ModuleType" NOT NULL,
  "metadata_ip" TEXT,
  "metadata_user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_sample_event_sample" FOREIGN KEY ("sample_id") REFERENCES "sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "uq_sample_event_sequence" UNIQUE ("sample_id", "sequence_number"),
  CONSTRAINT "chk_sample_event_actor" CHECK (
    ("actor_type" = 'USER' AND "actor_user_id" IS NOT NULL)
    OR
    ("actor_type" = 'SYSTEM' AND "actor_user_id" IS NULL)
  ),
  CONSTRAINT "chk_sample_event_idempotency_pair" CHECK (
    ("idempotency_scope" IS NULL AND "idempotency_key" IS NULL)
    OR
    ("idempotency_scope" IS NOT NULL AND "idempotency_key" IS NOT NULL)
  )
);

CREATE TABLE "sample_attachment" (
  "id" UUID PRIMARY KEY,
  "sample_id" UUID NOT NULL,
  "kind" "AttachmentKind" NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "checksum_sha256" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_sample_attachment_sample" FOREIGN KEY ("sample_id") REFERENCES "sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "chk_sample_attachment_size_non_negative" CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0)
);

CREATE TABLE "print_job" (
  "id" UUID PRIMARY KEY,
  "sample_id" UUID NOT NULL,
  "print_action" "PrintAction" NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "PrintJobStatus" NOT NULL,
  "printer_id" TEXT,
  "error" TEXT,
  "requested_event_id" UUID NOT NULL,
  "result_event_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "fk_print_job_sample" FOREIGN KEY ("sample_id") REFERENCES "sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_print_job_requested_event" FOREIGN KEY ("requested_event_id") REFERENCES "sample_event"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_print_job_result_event" FOREIGN KEY ("result_event_id") REFERENCES "sample_event"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "uq_print_job_sample_action_attempt" UNIQUE ("sample_id", "print_action", "attempt_number"),
  CONSTRAINT "chk_print_job_attempt_positive" CHECK ("attempt_number" >= 1)
);

-- Indexes
CREATE INDEX "idx_sample_status" ON "sample"("status");

CREATE INDEX "idx_sample_event_sample_occurred" ON "sample_event"("sample_id", "occurred_at");
CREATE INDEX "idx_sample_event_type_occurred" ON "sample_event"("event_type", "occurred_at");
CREATE INDEX "idx_sample_event_idempotency_lookup" ON "sample_event"("sample_id", "idempotency_scope", "idempotency_key");
CREATE UNIQUE INDEX "uq_sample_event_idempotency"
  ON "sample_event"("sample_id", "idempotency_scope", "idempotency_key")
  WHERE "idempotency_scope" IS NOT NULL AND "idempotency_key" IS NOT NULL;

CREATE UNIQUE INDEX "uq_sample_event_print_attempt"
  ON "sample_event"(
    "sample_id",
    (("payload"->>'printAction')),
    ((("payload"->>'attemptNumber')::INTEGER))
  )
  WHERE "event_type" IN ('QR_PRINT_REQUESTED', 'QR_REPRINT_REQUESTED')
    AND "payload" ? 'printAction'
    AND "payload" ? 'attemptNumber';

CREATE INDEX "idx_attachment_sample_created" ON "sample_attachment"("sample_id", "created_at");
CREATE INDEX "idx_print_job_status_created" ON "print_job"("status", "created_at");

-- Trigger functions
CREATE OR REPLACE FUNCTION "fn_prevent_sample_event_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'sample_event is append-only; % is not allowed', TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION "fn_guard_sample_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'INVALIDATED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'sample status INVALIDATED is terminal and cannot transition';
  END IF;

  IF OLD.internal_lot_number IS NOT NULL AND NEW.internal_lot_number IS DISTINCT FROM OLD.internal_lot_number THEN
    RAISE EXCEPTION 'internal_lot_number is immutable once defined';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "fn_guard_sample_event_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_existing BOOLEAN;
  label_photos JSONB;
  current_sample_status "SampleStatus";
BEGIN
  SELECT s."status"
  INTO current_sample_status
  FROM "sample" s
  WHERE s."id" = NEW."sample_id";

  IF current_sample_status = 'INVALIDATED' THEN
    RAISE EXCEPTION 'cannot append events to INVALIDATED sample %', NEW."sample_id";
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "sample_event" se
    WHERE se."sample_id" = NEW."sample_id"
  ) INTO has_existing;

  IF NOT has_existing AND NEW."event_type" <> 'SAMPLE_RECEIVED' THEN
    RAISE EXCEPTION 'first event for sample must be SAMPLE_RECEIVED';
  END IF;

  IF has_existing AND NEW."event_type" = 'SAMPLE_RECEIVED' THEN
    RAISE EXCEPTION 'SAMPLE_RECEIVED can only be the first event';
  END IF;

  IF NEW."event_type" = 'SAMPLE_RECEIVED' AND NEW."sequence_number" <> 1 THEN
    RAISE EXCEPTION 'SAMPLE_RECEIVED must have sequence_number=1';
  END IF;

  IF NEW."event_type" = 'REGISTRATION_CONFIRMED' THEN
    label_photos := NEW."payload"->'labelPhotos';

    IF label_photos IS NULL OR jsonb_typeof(label_photos) <> 'array' OR jsonb_array_length(label_photos) < 1 THEN
      RAISE EXCEPTION 'REGISTRATION_CONFIRMED requires at least one label photo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Triggers
CREATE TRIGGER "trg_sample_event_prevent_update"
BEFORE UPDATE ON "sample_event"
FOR EACH ROW
EXECUTE FUNCTION "fn_prevent_sample_event_mutation"();

CREATE TRIGGER "trg_sample_event_prevent_delete"
BEFORE DELETE ON "sample_event"
FOR EACH ROW
EXECUTE FUNCTION "fn_prevent_sample_event_mutation"();

CREATE TRIGGER "trg_sample_guard_update"
BEFORE UPDATE ON "sample"
FOR EACH ROW
EXECUTE FUNCTION "fn_guard_sample_update"();

CREATE TRIGGER "trg_sample_event_guard_insert"
BEFORE INSERT ON "sample_event"
FOR EACH ROW
EXECUTE FUNCTION "fn_guard_sample_event_insert"();
