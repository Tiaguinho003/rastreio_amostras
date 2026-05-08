-- Q.types (2026-05-08): rename LOW_CAFF -> BAIXO + add ESCOLHA no enum ClassificationType.
--
-- Pré-requisitos (ja deployados em prod, commit 0220f1e):
--   * Q.print + Q.auto + Q.final completas. Frontend hoje mostra "BAIXO" no modal
--     mas envia 'LOW_CAFF' ao backend (gambiarra do commit 8dbe36f). ESCOLHA fica
--     disabled na UI.
--
-- Esta migration:
--   1. sample.classification_type: convert-to-text + backfill LOW_CAFF -> BAIXO.
--   2. sample_event.payload (JSONB): backfill em-place de classificationType
--      (raiz + before/after dos eventos CLASSIFICATION_UPDATED). Triggers
--      append-only desabilitados temporariamente — UNICA excecao justificada por
--      single-cleanup, mesmo padrao da Q.final.
--   3. Drop enum ClassificationType + recreate com 4 valores (BICA, PREPARADO,
--      BAIXO, ESCOLHA) + cast back.

-- ============================================================
-- 1. sample.classification_type: convert-to-text + backfill
-- ============================================================

ALTER TABLE "sample"
  ALTER COLUMN "classification_type" TYPE text USING "classification_type"::text;

UPDATE "sample"
SET "classification_type" = 'BAIXO'
WHERE "classification_type" = 'LOW_CAFF';

-- ============================================================
-- 2. sample_event.payload (JSONB): backfill em-place
-- ============================================================

ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";

-- Raiz (CLASSIFICATION_COMPLETED): payload.classificationType
UPDATE "sample_event"
SET "payload" = jsonb_set("payload", '{classificationType}', '"BAIXO"'::jsonb)
WHERE "payload"->>'classificationType' = 'LOW_CAFF';

-- CLASSIFICATION_UPDATED: payload.before.classificationType
UPDATE "sample_event"
SET "payload" = jsonb_set("payload", '{before,classificationType}', '"BAIXO"'::jsonb)
WHERE "payload"->'before'->>'classificationType' = 'LOW_CAFF';

-- CLASSIFICATION_UPDATED: payload.after.classificationType
UPDATE "sample_event"
SET "payload" = jsonb_set("payload", '{after,classificationType}', '"BAIXO"'::jsonb)
WHERE "payload"->'after'->>'classificationType' = 'LOW_CAFF';

ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";

-- ============================================================
-- 3. Drop enum + recreate com 4 valores + cast back
-- ============================================================

DROP TYPE "ClassificationType";

CREATE TYPE "ClassificationType" AS ENUM (
  'BICA',
  'PREPARADO',
  'BAIXO',
  'ESCOLHA'
);

ALTER TABLE "sample"
  ALTER COLUMN "classification_type" TYPE "ClassificationType"
  USING "classification_type"::"ClassificationType";
