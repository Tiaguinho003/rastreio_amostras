-- Informe de visita (2026-06-10): tabela visit_report + enums.
--
-- Primeiro formulario da pagina /informe (formulario de visitas). Cada envio
-- vira 1 row imutavel (sem update/delete via API): quem visitou (user_id) e
-- quando (created_at) sao carimbados no servidor. Listagem e exclusiva do
-- admin (pagina /resumo).
--
-- Identificacao do cliente visitado (client_kind):
--   * EXISTING — cliente do cadastro, vinculo real via client_id (FK).
--   * NEW — prospect fora do cadastro: new_client_name obrigatorio (regra na
--     camada de servico), new_client_city/new_client_phone opcionais. Campos
--     de prospect serao expandidos em fases futuras.
--
-- Respostas objetivas:
--   * farm_size — tamanho aproximado da fazenda (SMALL ate 20ha /
--     MEDIUM 20-100ha / LARGE acima de 100ha) + farm_size_notes opcional.
--   * interest_level — interesse/disposicao para comercializar
--     (NONE/LOW/MEDIUM/HIGH) + interest_notes opcional.
--   * sells_currently — ja comercializa? sells_to_whom (texto livre,
--     opcional) so faz sentido quando true; regra fica no service.

-- ============================================================
-- 1. Enums
-- ============================================================

CREATE TYPE "VisitClientKind" AS ENUM ('EXISTING', 'NEW');

CREATE TYPE "VisitFarmSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

CREATE TYPE "VisitInterestLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- ============================================================
-- 2. Tabela visit_report
-- ============================================================

CREATE TABLE "visit_report" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_kind" "VisitClientKind" NOT NULL,
    "client_id" UUID,
    "new_client_name" TEXT,
    "new_client_city" TEXT,
    "new_client_phone" TEXT,
    "farm_size" "VisitFarmSize" NOT NULL,
    "farm_size_notes" TEXT,
    "interest_level" "VisitInterestLevel" NOT NULL,
    "interest_notes" TEXT,
    "sells_currently" BOOLEAN NOT NULL,
    "sells_to_whom" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_report_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 3. Indices
-- ============================================================

-- Feed do /resumo: ordenado por created_at desc com tiebreak em id.
CREATE INDEX "idx_visit_report_created_id" ON "visit_report"("created_at", "id");

-- Visitas de um usuario em ordem cronologica (futuro "meus envios" +
-- cobre o FK de user_id).
CREATE INDEX "idx_visit_report_user_created" ON "visit_report"("user_id", "created_at");

-- Cobre o FK de client_id (futuro cruzamento visitas <-> cliente).
CREATE INDEX "idx_visit_report_client" ON "visit_report"("client_id");

-- ============================================================
-- 4. FKs
-- ============================================================

ALTER TABLE "visit_report"
  ADD CONSTRAINT "visit_report_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visit_report"
  ADD CONSTRAINT "visit_report_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
