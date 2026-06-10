-- Informe de visita (2026-06-11): coluna general_notes.
--
-- Campo 5 do formulario: "Observacoes gerais" — discursivo e OPCIONAL,
-- livre para o prospector registrar qualquer observacao extra da visita
-- (fora das 4 perguntas estruturadas). Exibido no /resumo no card expandido.

ALTER TABLE "visit_report" ADD COLUMN "general_notes" TEXT;
