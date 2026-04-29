-- F8A: deleta todos os dados gerados pela feature legacy backfill (deprecated).
--
-- Pre-requisitos:
--   * Aplicacao do PR F8A ja nao usa nenhuma rota/lógica legacy.
--   * Sample.source esta marcado como @ignore no Prisma Client (F8A schema)
--     — selects/inserts da app nova ja nao tocam a coluna.
--
-- Volume estimado (snapshot pre-migrate em 2026-04-29):
--   * 343 samples WHERE source='LEGACY_BACKFILL' (faixa A-4909..A-5561)
--   * 1124 sample_events vinculados
--   * 36 sample_attachments
--   * 53 print_jobs
--   * 0 sample_movements (nenhum legacy foi vendido)
--
-- A coluna sample.source, o tipo SampleSource e o valor LEGACY_SKELETON_CREATE
-- do enum IdempotencyScope serao dropados na migration seguinte (F8B), com
-- cutover do enum.

-- Desabilita os 2 triggers append-only para permitir DELETE em sample_event.
-- Padrao precedente: 20260407180000_classification_types_and_cleanup.
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";

-- Ordem respeita FKs (PrintJob/Attachment/SampleEvent -> Sample).
DELETE FROM "print_job"
 WHERE "sample_id" IN (SELECT "id" FROM "sample" WHERE "source" = 'LEGACY_BACKFILL');

DELETE FROM "sample_attachment"
 WHERE "sample_id" IN (SELECT "id" FROM "sample" WHERE "source" = 'LEGACY_BACKFILL');

DELETE FROM "sample_event"
 WHERE "sample_id" IN (SELECT "id" FROM "sample" WHERE "source" = 'LEGACY_BACKFILL');

DELETE FROM "sample" WHERE "source" = 'LEGACY_BACKFILL';

-- Reabilita triggers append-only.
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";
