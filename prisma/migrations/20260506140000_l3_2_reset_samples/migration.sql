-- L3.2: reset destrutivo SO das amostras + dependentes.
--
-- Contexto:
--   * Apos o L3 (commit 1b85620, 2026-04-30), 39 amostras foram criadas
--     em prod via UI nova (schema L5).
--   * Usuario decidiu re-cadastrar TODAS as amostras manualmente —
--     incluindo as 44 antigas pre-L3 (fotos preservadas em
--     ~/amostras-backup/) + as 39 atuais + o backlog fisico que
--     chegou desde entao.
--   * O sistema vai operar em modo "backfill historico" (M1 ainda
--     ativo) ate alcancar o presente, depois retoma fluxo normal e
--     M2 desativa.
--
-- Esta migration NAO toca clientes (preserva os 124 PJ + 1 PF).
-- Schema intacto — sem DROP TABLE/COLUMN. Apenas DELETE + reset
-- dos triggers append-only do event store.
--
-- Fora desta migration (executados manualmente apos aplicar):
--   * Apagar 39 fotos no Cloud Storage:
--     gsutil -m rm -r gs://safras-amostras-prod-runtime/uploads/samples/
--   * O sample_internal_lot_number nao usa sequence Postgres — e
--     gerado via SELECT MAX em sample_query_service.js#getNextInternalLotNumber.
--     Apos esta migration, fallback `initialSequence = 5561` faz a
--     proxima amostra criada virar `A-5562` (alinha com o backup).

-- 1. Desabilita triggers append-only do sample_event (mesmo padrao do L3).
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";

-- 2. DELETE em ordem (filhos antes de pais; FK Restrict).
DELETE FROM "sample_movement";
DELETE FROM "print_job";
DELETE FROM "sample_attachment";
DELETE FROM "sample_event";
DELETE FROM "sample";

-- 3. Reabilita triggers.
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";
