-- Vinculo curado de cliente no informe de visita (2026-06-12).
--
-- O formulario do prospector deixou de enviar client_id: o client_kind virou
-- DECLARACAO do autor ("Ja e cliente" / "Cliente novo") e new_client_name
-- (texto livre) passa a ser preenchido nos DOIS kinds — identico online e
-- offline, sem lookup no banco pelo papel de campo.
--
-- O vinculo real informe -> cliente passa a ser CURADORIA feita depois, na
-- pagina /resumo, por ADMIN/CADASTRO (linkVisitReportClient): set/troca/
-- remocao de client_id com auditoria do vinculo ATUAL:
--   * linked_by_user_id — quem curou o vinculo vigente (FK em app_user).
--   * linked_at         — quando.
-- Ambos NULL quando nao ha vinculo curado: informe "aguardando vinculo"
-- (client_id NULL) ou "born-linked" (payload legado EXISTING+clientId da
-- fila offline de versoes antigas do app — client_id setado na criacao).
-- Desvincular volta client_id/linked_* a NULL.

ALTER TABLE "visit_report"
  ADD COLUMN "linked_by_user_id" UUID,
  ADD COLUMN "linked_at" TIMESTAMPTZ(6);

-- Cobre o FK do curador (mesmo padrao dos demais indices da tabela).
CREATE INDEX "idx_visit_report_linked_by" ON "visit_report"("linked_by_user_id");

ALTER TABLE "visit_report"
  ADD CONSTRAINT "visit_report_linked_by_user_id_fkey"
  FOREIGN KEY ("linked_by_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
