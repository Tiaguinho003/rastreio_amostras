-- Formularios do COMERCIAL (2026-06-11): tabelas commercial_visit e
-- weekly_report + enums. Primeira entrega do plano "um formulario por
-- papel" da pagina /informe (o visit_report ficou exclusivo do prospector).
--
-- commercial_visit — formulario "Visitas" do comercial. Identificacao do
-- cliente identica ao visit_report (reusa o tipo "VisitClientKind":
-- EXISTING via client_id FK / NEW via new_client_*). Respostas objetivas:
--   * reason  — motivo da visita (negociacao / entrega-coleta de amostra /
--               cobranca / relacionamento).
--   * outcome — resultado da negociacao (fechado / proposta em andamento /
--               sem avanco / sem interesse) + outcome_notes opcional.
-- Sem captured_at: o formulario do comercial nao tem fila offline.
-- new_client_name_normalized e coluna GERADA (LOWER + immutable_unaccent,
-- wrapper criado em 20260505111834) — paridade de busca com visit_report.
--
-- weekly_report — relatorio semanal do comercial. week_start e a SEGUNDA
-- da semana BRT (date-only), computada sempre pelo servidor; a UNIQUE
-- (user_id, week_start) garante no maximo 1 relatorio por usuario por
-- semana (violacao vira 409 no service).

-- ============================================================
-- 1. Enums
-- ============================================================

CREATE TYPE "CommercialVisitReason" AS ENUM (
  'NEGOTIATION',
  'SAMPLE_DELIVERY_OR_PICKUP',
  'COLLECTION',
  'RELATIONSHIP'
);

CREATE TYPE "CommercialVisitOutcome" AS ENUM (
  'DEAL_CLOSED',
  'PROPOSAL_IN_PROGRESS',
  'NO_PROGRESS',
  'NO_INTEREST'
);

-- ============================================================
-- 2. Tabela commercial_visit
-- ============================================================

CREATE TABLE "commercial_visit" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_kind" "VisitClientKind" NOT NULL,
    "client_id" UUID,
    "new_client_name" TEXT,
    "new_client_name_normalized" TEXT
      GENERATED ALWAYS AS (LOWER(public.immutable_unaccent("new_client_name"))) STORED,
    "new_client_city" TEXT,
    "new_client_phone" TEXT,
    "reason" "CommercialVisitReason" NOT NULL,
    "outcome" "CommercialVisitOutcome" NOT NULL,
    "outcome_notes" TEXT,
    "general_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_visit_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 3. Tabela weekly_report
-- ============================================================

CREATE TABLE "weekly_report" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "difficulties" TEXT,
    "next_week_plan" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_report_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_weekly_report_user_week" UNIQUE ("user_id", "week_start")
);

-- ============================================================
-- 4. Indices
-- ============================================================

-- Feed combinado (/informe do comercial + /resumo): created_at desc com
-- tiebreak em id.
CREATE INDEX "idx_commercial_visit_created_id" ON "commercial_visit"("created_at", "id");

-- Envios de um usuario em ordem cronologica (escopo "mine" + cobre FK).
CREATE INDEX "idx_commercial_visit_user_created" ON "commercial_visit"("user_id", "created_at");

-- Cobre o FK de client_id (futuro cruzamento visitas <-> cliente).
CREATE INDEX "idx_commercial_visit_client" ON "commercial_visit"("client_id");

CREATE INDEX "idx_weekly_report_created_id" ON "weekly_report"("created_at", "id");

CREATE INDEX "idx_weekly_report_user_created" ON "weekly_report"("user_id", "created_at");

-- ============================================================
-- 5. FKs
-- ============================================================

ALTER TABLE "commercial_visit"
  ADD CONSTRAINT "commercial_visit_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commercial_visit"
  ADD CONSTRAINT "commercial_visit_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "weekly_report"
  ADD CONSTRAINT "weekly_report_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
