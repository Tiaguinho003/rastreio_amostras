-- Liga Wave A1 (2026-05-18): schema para feature Liga.
--
-- Adiciona:
--   1. Enum SampleEventType: BLEND_CREATED + BLEND_REVERTED (Liga F1.D + F8).
--   2. Enum IdempotencyScope: BLEND_CREATE + BLEND_REVERT (escopos
--      de idempotencia para createBlend e revertBlend — Wave A2).
--   3. Coluna sample.is_blend (default false). Liga e uma Sample com
--      isBlend=true (Liga Q0.1). Sample normal nasce com false e nunca muda;
--      Liga nasce com true via createBlend (Wave A2).
--   4. Indice idx_sample_is_blend para filtros "so ligas" / "so amostras
--      unitarias" em listagens (D.2 — badge na lista, etc).
--   5. Tabela sample_blend_component: composicao da liga (origem + sacas).
--      Ver Liga F2.3 + T0.D. Append-only conceitualmente (so apagada via
--      reversao, e mesmo assim composicao e preservada — Liga F8.3).
--
-- Sem impacto em codigo existente. Sample normal segue com isBlend=false
-- e a tabela sample_blend_component fica vazia ate o primeiro createBlend.

-- ============================================================
-- 1. Enum SampleEventType: novos valores BLEND_*
-- ============================================================

ALTER TYPE "SampleEventType" ADD VALUE 'BLEND_CREATED';
ALTER TYPE "SampleEventType" ADD VALUE 'BLEND_REVERTED';

-- ============================================================
-- 2. Enum IdempotencyScope: novos escopos BLEND_*
-- ============================================================

ALTER TYPE "IdempotencyScope" ADD VALUE 'BLEND_CREATE';
ALTER TYPE "IdempotencyScope" ADD VALUE 'BLEND_REVERT';

-- ============================================================
-- 3. sample.is_blend (flag de liga)
-- ============================================================

ALTER TABLE "sample" ADD COLUMN "is_blend" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 4. Indice em sample.is_blend
-- ============================================================

CREATE INDEX "idx_sample_is_blend" ON "sample"("is_blend");

-- ============================================================
-- 5. sample_blend_component (composicao da liga)
-- ============================================================

CREATE TABLE "sample_blend_component" (
    "id" UUID NOT NULL,
    "sample_id" UUID NOT NULL,
    "origin_sample_id" UUID NOT NULL,
    "contributed_sacks" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_blend_component_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_blend_component_sample" ON "sample_blend_component"("sample_id");

CREATE INDEX "idx_blend_component_origin" ON "sample_blend_component"("origin_sample_id");

CREATE UNIQUE INDEX "uq_blend_component_blend_origin" ON "sample_blend_component"("sample_id", "origin_sample_id");

ALTER TABLE "sample_blend_component"
  ADD CONSTRAINT "sample_blend_component_sample_id_fkey"
  FOREIGN KEY ("sample_id") REFERENCES "sample"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sample_blend_component"
  ADD CONSTRAINT "sample_blend_component_origin_sample_id_fkey"
  FOREIGN KEY ("origin_sample_id") REFERENCES "sample"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
