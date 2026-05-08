-- Q.final (2026-05-08): drop dos enum values legacy + coluna print_job.print_action.
--
-- Pré-requisitos (ja deployados em prod, commit 2015f45):
--   * Q.print + Q.auto: code novo nao emite mais SAMPLE_RECEIVED, REGISTRATION_STARTED,
--     CLASSIFICATION_STARTED, CLASSIFICATION_SAVED_PARTIAL, QR_REPRINT_REQUESTED,
--     nem cria samples em status QR_PENDING_PRINT/QR_PRINTED/CLASSIFICATION_IN_PROGRESS.
--   * Migration phaseq (20260507201156): trigger fn_guard_sample_event_insert
--     ja exige REGISTRATION_CONFIRMED como primeiro evento.
--
-- Esta migration:
--   1. Backfill samples em status legacy -> REGISTRATION_CONFIRMED.
--   2. Renumera print_job.attempt_number cronologicamente (resolve colisao
--      da nova constraint UNIQUE(sample_id, attempt_number)).
--   3. Drop coluna print_job.print_action + constraint antiga + criar nova.
--   4. Drop indice legacy uq_sample_event_print_attempt (redundante com a
--      constraint em print_job apos Q.print).
--   5. Add EXPIRED ao PrintJobStatus enum.
--   6. Drop PrintAction enum.
--   7. SampleStatus: drop values legacy via convert-to-text + recreate enum.
--   8. SampleEventType: drop values legacy. DELETE de eventos com tipos
--      legacy e a UNICA excecao ao append-only do event store, justificada
--      por single-cleanup com triggers desabilitados temporariamente.
--   9. IdempotencyScope: drop QR_REPRINT.
--
-- ATENCAO: triggers append-only em sample_event sao desabilitados
-- temporariamente pra UPDATE/DELETE de cleanup. Re-habilitados ao final.

-- ============================================================
-- 1. Backfill samples
-- ============================================================

UPDATE "sample"
SET "status" = 'REGISTRATION_CONFIRMED'
WHERE "status"::text IN (
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS'
);

-- ============================================================
-- 2. Renumerar PrintJob attempt_number cronologicamente
-- ============================================================

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "sample_id"
      ORDER BY "created_at", id
    ) AS new_attempt
  FROM "print_job"
)
UPDATE "print_job" pj
SET "attempt_number" = numbered.new_attempt
FROM numbered
WHERE pj.id = numbered.id;

-- ============================================================
-- 3. PrintJob: drop coluna print_action + criar constraint nova
-- ============================================================

ALTER TABLE "print_job" DROP CONSTRAINT "uq_print_job_sample_action_attempt";
ALTER TABLE "print_job" DROP COLUMN "print_action";
ALTER TABLE "print_job"
  ADD CONSTRAINT "uq_print_job_sample_attempt" UNIQUE ("sample_id", "attempt_number");

-- ============================================================
-- 4. Drop indice legacy uq_sample_event_print_attempt
-- ============================================================
-- Esse indice unique mantinha 1 linha por (sample, printAction, attemptNumber)
-- em sample_event. Apos Q.print, print_job.uq_print_job_sample_attempt cobre
-- a invariante de "1 attempt por sample". Audit em sample_event continua
-- validado pelo append-only.

DROP INDEX IF EXISTS "uq_sample_event_print_attempt";

-- ============================================================
-- 5. PrintJobStatus: add EXPIRED
-- ============================================================

ALTER TYPE "PrintJobStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- ============================================================
-- 6. Drop PrintAction enum
-- ============================================================

DROP TYPE "PrintAction";

-- ============================================================
-- 7. SampleStatus: drop values legacy via convert-to-text
-- ============================================================

-- Disable append-only em sample_event pra UPDATE cleanup das colunas
-- from_status/to_status legacy.
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";

-- Convert pra text temporariamente
ALTER TABLE "sample" ALTER COLUMN "status" TYPE text USING "status"::text;
ALTER TABLE "sample_event" ALTER COLUMN "from_status" TYPE text USING "from_status"::text;
ALTER TABLE "sample_event" ALTER COLUMN "to_status" TYPE text USING "to_status"::text;

-- NULLIFY from_status/to_status com valores legacy
UPDATE "sample_event"
SET "from_status" = NULL
WHERE "from_status" IN (
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS'
);

UPDATE "sample_event"
SET "to_status" = NULL
WHERE "to_status" IN (
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS'
);

-- Drop tipo antigo + criar novo
DROP TYPE "SampleStatus";

CREATE TYPE "SampleStatus" AS ENUM (
  'REGISTRATION_CONFIRMED',
  'CLASSIFIED',
  'INVALIDATED'
);

-- Cast colunas pro tipo novo
ALTER TABLE "sample"
  ALTER COLUMN "status" TYPE "SampleStatus" USING "status"::"SampleStatus";

ALTER TABLE "sample_event"
  ALTER COLUMN "from_status" TYPE "SampleStatus" USING "from_status"::"SampleStatus",
  ALTER COLUMN "to_status" TYPE "SampleStatus" USING "to_status"::"SampleStatus";

ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";

-- ============================================================
-- 8. SampleEventType: drop values legacy
-- ============================================================
-- DELETE de eventos com tipos legacy. UNICA excecao ao append-only,
-- justificada por single cleanup migration com triggers desabilitados.

ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_delete";

DELETE FROM "sample_event"
WHERE "event_type"::text IN (
  'SAMPLE_RECEIVED',
  'REGISTRATION_STARTED',
  'QR_REPRINT_REQUESTED',
  'CLASSIFICATION_STARTED',
  'CLASSIFICATION_SAVED_PARTIAL'
);

ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_delete";

-- Convert pra text temporariamente
DROP INDEX IF EXISTS "idx_sample_event_type_occurred";

ALTER TABLE "sample_event" ALTER COLUMN "event_type" TYPE text USING "event_type"::text;

DROP TYPE "SampleEventType";

CREATE TYPE "SampleEventType" AS ENUM (
  'PHOTO_ADDED',
  'REGISTRATION_CONFIRMED',
  'QR_PRINT_REQUESTED',
  'QR_PRINT_FAILED',
  'QR_PRINTED',
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
  'PHYSICAL_SAMPLE_SENT',
  'PHYSICAL_SAMPLE_SEND_UPDATED',
  'PHYSICAL_SAMPLE_SEND_CANCELLED',
  'CLASSIFICATION_EXTRACTION_COMPLETED',
  'CLASSIFICATION_EXTRACTION_FAILED'
);

ALTER TABLE "sample_event"
  ALTER COLUMN "event_type" TYPE "SampleEventType" USING "event_type"::"SampleEventType";

CREATE INDEX "idx_sample_event_type_occurred" ON "sample_event"("event_type", "occurred_at");

-- ============================================================
-- 9. IdempotencyScope: drop QR_REPRINT
-- ============================================================

ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";

-- NULLIFY rows com idempotency_scope='QR_REPRINT'
UPDATE "sample_event"
SET "idempotency_scope" = NULL, "idempotency_key" = NULL
WHERE "idempotency_scope"::text = 'QR_REPRINT';

ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";

-- Drop indices que referenciam idempotency_scope
DROP INDEX IF EXISTS "idx_sample_event_idempotency_lookup";

ALTER TABLE "sample_event"
  ALTER COLUMN "idempotency_scope" TYPE text USING "idempotency_scope"::text;

DROP TYPE "IdempotencyScope";

CREATE TYPE "IdempotencyScope" AS ENUM (
  'REGISTRATION_CONFIRM',
  'QR_PRINT',
  'CLASSIFICATION_COMPLETE',
  'COMMERCIAL_STATUS_UPDATE',
  'INVALIDATE'
);

ALTER TABLE "sample_event"
  ALTER COLUMN "idempotency_scope" TYPE "IdempotencyScope"
  USING "idempotency_scope"::"IdempotencyScope";

CREATE INDEX "idx_sample_event_idempotency_lookup"
  ON "sample_event"("sample_id", "idempotency_scope", "idempotency_key");
