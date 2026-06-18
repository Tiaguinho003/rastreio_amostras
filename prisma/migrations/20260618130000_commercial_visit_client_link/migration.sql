-- Vinculo curado de cliente na VISITA COMERCIAL (2026-06-18).
--
-- Espelha o trio de vinculo do visit_report (20260612120000): o ADM/CADASTRO
-- pode curar o vinculo da visita comercial no /resumo (linkCommercialVisitClient),
-- com auditoria do vinculo ATUAL:
--   * linked_by_user_id — quem curou o vinculo vigente (FK em app_user).
--   * linked_at         — quando.
-- Ambos NULL quando nao ha vinculo curado. So vale para clientKind=NEW
-- (cliente novo, sem vinculo): EXISTING e born-linked (client_id setado na
-- criacao pelo lookup do form comercial) e NAO e curavel.
-- Desvincular volta client_id/linked_* a NULL.

ALTER TABLE "commercial_visit"
  ADD COLUMN "linked_by_user_id" UUID,
  ADD COLUMN "linked_at" TIMESTAMPTZ(6);

-- Cobre o FK do curador (mesmo padrao dos demais indices da tabela).
CREATE INDEX "idx_commercial_visit_linked_by" ON "commercial_visit"("linked_by_user_id");

ALTER TABLE "commercial_visit"
  ADD CONSTRAINT "commercial_visit_linked_by_user_id_fkey"
  FOREIGN KEY ("linked_by_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
