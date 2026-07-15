-- Unificacao dos relatorios de visita (2026-07-15) — FASE EXPAND (backward-compatible).
--
-- Funde o informe do prospector (visit_report) + a visita do comercial (commercial_visit)
-- num unico "visit_report". Esta migration SO EXPANDE (segura no canary — o codigo velho
-- roda contra este schema):
--   1. visit_report ganha os campos da visita comercial (reason/outcome + notes).
--   2. visit_report + weekly_report ganham cancelamento SOFT (cancelled_at/by).
--   3. os campos do prospector (farm_size/interest_level/sells_currently) viram OPCIONAIS
--      (DROP NOT NULL — afrouxa, backward-compatible).
--
-- Os DROPs (tabela commercial_visit, weekly_report_reminder, colunas linked_*/captured_at)
-- ficam para a migration de CONTRACAO posterior (pos-promote). commercial_visit esta VAZIA
-- em prod (feature nunca usada) — nenhum dado a migrar aqui.

-- 1. visit_report: campos herdados da visita comercial (os enums ja existem no banco)
ALTER TABLE "visit_report" ADD COLUMN IF NOT EXISTS "reason" "CommercialVisitReason";
ALTER TABLE "visit_report" ADD COLUMN IF NOT EXISTS "reason_notes" TEXT;
ALTER TABLE "visit_report" ADD COLUMN IF NOT EXISTS "outcome" "CommercialVisitOutcome";
ALTER TABLE "visit_report" ADD COLUMN IF NOT EXISTS "outcome_notes" TEXT;

-- 2. visit_report: cancelamento soft (FK inline; sem @relation no schema)
ALTER TABLE "visit_report" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(6);
ALTER TABLE "visit_report" ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" UUID;
DO $$ BEGIN
  ALTER TABLE "visit_report"
    ADD CONSTRAINT "visit_report_cancelled_by_user_id_fkey"
    FOREIGN KEY ("cancelled_by_user_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "idx_visit_report_cancelled_by" ON "visit_report" ("cancelled_by_user_id");

-- 3. visit_report: campos do prospector viram opcionais (form unificado nao forca)
ALTER TABLE "visit_report" ALTER COLUMN "farm_size" DROP NOT NULL;
ALTER TABLE "visit_report" ALTER COLUMN "interest_level" DROP NOT NULL;
ALTER TABLE "visit_report" ALTER COLUMN "sells_currently" DROP NOT NULL;

-- 4. weekly_report: cancelamento soft
ALTER TABLE "weekly_report" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(6);
ALTER TABLE "weekly_report" ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" UUID;
DO $$ BEGIN
  ALTER TABLE "weekly_report"
    ADD CONSTRAINT "weekly_report_cancelled_by_user_id_fkey"
    FOREIGN KEY ("cancelled_by_user_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "idx_weekly_report_cancelled_by" ON "weekly_report" ("cancelled_by_user_id");
