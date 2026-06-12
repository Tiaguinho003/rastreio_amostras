-- Visita do comercial (2026-06-12): coluna reason_notes.
--
-- Observacao OPCIONAL da pergunta "Motivo da visita" (P2 do formulario do
-- comercial), espelhando outcome_notes (P3). Texto livre, exibido no
-- /resumo no card expandido sob o motivo. Nullable (nao retroage envios
-- existentes).

ALTER TABLE "commercial_visit" ADD COLUMN "reason_notes" TEXT;
