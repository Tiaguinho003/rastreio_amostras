-- ============================================
-- STEP 1: Limpar todos os dados de amostras
-- ============================================
-- Ordem respeita foreign keys:
--   PrintJob -> SampleEvent, Sample
--   SampleMovement -> Sample
--   SampleAttachment -> Sample
--   SampleEvent -> Sample
--   Sample (base)

-- Desabilitar triggers de protecao append-only para permitir DELETE
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";

DELETE FROM "print_job";
DELETE FROM "sample_movement";
DELETE FROM "sample_attachment";
DELETE FROM "sample_event";
DELETE FROM "sample";

-- Reabilitar triggers
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";

-- ============================================
-- STEP 2: Adicionar enum ClassificationType
-- ============================================
CREATE TYPE "ClassificationType" AS ENUM ('PREPARADO', 'LOW_CAFF', 'BICA');

-- ============================================
-- STEP 3: Adicionar coluna na tabela sample
-- ============================================
ALTER TABLE "sample" ADD COLUMN "classification_type" "ClassificationType";

-- ============================================
-- STEP 4: Remover coluna obsoleta
-- ============================================
-- Umidade migra para campo Observacoes (texto livre).
-- Nao ha mais fonte de dados para popular latestMoisture.
ALTER TABLE "sample" DROP COLUMN "latest_moisture";
