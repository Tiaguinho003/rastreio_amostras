-- F8B: remove em definitivo a coluna sample.source, o tipo SampleSource
-- e o valor LEGACY_SKELETON_CREATE do enum IdempotencyScope (via cutover,
-- pois Postgres nao permite remover valor de enum existente).
--
-- Pre-requisitos:
--   * F8A ja foi aplicado em prod e zero rows com source='LEGACY_BACKFILL'
--     ou idempotency_scope='LEGACY_SKELETON_CREATE'.
--   * Prisma Client da revisao 3bf7a99 (PR F8A) tem o campo source com
--     @ignore — nao seleciona/insere a coluna. App em prod continua
--     funcionando depois do DROP COLUMN.

-- 1) Drop coluna sample.source e seu indice.
DROP INDEX IF EXISTS "idx_sample_source";
ALTER TABLE "sample" DROP COLUMN "source";

-- 2) Drop tipo SampleSource (so usado pela coluna que acabou de sair).
DROP TYPE "SampleSource";

-- 3) Cutover do enum IdempotencyScope para remover LEGACY_SKELETON_CREATE.
--    Postgres nao tem ALTER TYPE ... DROP VALUE, entao criamos um tipo
--    novo com os valores ativos, migramos a coluna, e dropamos o antigo.
CREATE TYPE "IdempotencyScope_new" AS ENUM (
  'REGISTRATION_CONFIRM',
  'QR_PRINT',
  'QR_REPRINT',
  'CLASSIFICATION_COMPLETE',
  'COMMERCIAL_STATUS_UPDATE',
  'INVALIDATE'
);

ALTER TABLE "sample_event"
  ALTER COLUMN "idempotency_scope" TYPE "IdempotencyScope_new"
  USING ("idempotency_scope"::text::"IdempotencyScope_new");

DROP TYPE "IdempotencyScope";
ALTER TYPE "IdempotencyScope_new" RENAME TO "IdempotencyScope";
