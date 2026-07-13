-- CL9-CL12 (auditoria da classificacao 2026-07-13): dropa os 6 espelhos
-- tecnicos do sample. Nenhum era populado pelo fluxo atual (o bloco
-- `technical` do CLASSIFICATION_COMPLETED nunca e enviado pelo app desde
-- a ficha unificada Q.cls.2.7) e nenhum era exibido em superficie alguma:
--   - latest_color_aspect: NUNCA foi escrita pelo projetor (sempre NULL);
--   - latest_notes: duplicata de latestClassificationData.observacoes;
--   - latest_defects_count: dependia da chave flat `defeito` extinta;
--   - latest_type / latest_screen / latest_density: sem produtor.
-- Fonte unica da classificacao: latest_classification_data (JSONB) +
-- classification_type. O event store (append-only) preserva qualquer
-- `technical` historico nos payloads.
-- classified_at e latest_classification_version FICAM.

ALTER TABLE "sample"
  DROP COLUMN IF EXISTS "latest_type",
  DROP COLUMN IF EXISTS "latest_screen",
  DROP COLUMN IF EXISTS "latest_defects_count",
  DROP COLUMN IF EXISTS "latest_density",
  DROP COLUMN IF EXISTS "latest_color_aspect",
  DROP COLUMN IF EXISTS "latest_notes";
