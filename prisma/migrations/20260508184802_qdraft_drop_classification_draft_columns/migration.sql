-- Q.draft (2026-05-08): drop das colunas classification_draft_* do Sample.
--
-- Pré-requisitos:
--   * Q.cls.1 ja cortou CLASSIFICATION_SAVED_PARTIAL e o botao "Salvar rascunho".
--   * Sem produtor desses dados desde entao — colunas sempre nulas pra samples
--     novas.
--
-- Esta migration:
--   1. Drop check constraint chk_sample_classification_draft_completion_percent_range.
--   2. Drop coluna classification_draft_completion_percent.
--   3. Drop coluna classification_draft_data.

ALTER TABLE "sample"
  DROP CONSTRAINT IF EXISTS "chk_sample_classification_draft_completion_percent_range";

ALTER TABLE "sample" DROP COLUMN IF EXISTS "classification_draft_completion_percent";
ALTER TABLE "sample" DROP COLUMN IF EXISTS "classification_draft_data";
