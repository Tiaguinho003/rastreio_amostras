-- =================================================================
-- F5.1 (parte B): promove cnpj_root para UNIQUE
--
-- Pre-requisito operacional: scripts/migrations/f5-merge-wizard.mjs
-- ja foi executado em prod via --apply, consolidando os grupos
-- COOPERCITRUS (raiz 45236791) e COFCO (raiz 08963419). Sem essa
-- consolidacao, CREATE UNIQUE INDEX falha.
--
-- A migration A (20260428230000) ja deixou:
--   - escape valve no trigger reject_client_audit_event_mutation
--   - audit types CLIENT_BRANCH_*
-- =================================================================

DROP INDEX IF EXISTS "idx_client_cnpj_root";

CREATE UNIQUE INDEX "uq_client_cnpj_root"
  ON "client" ("cnpj_root")
  WHERE "cnpj_root" IS NOT NULL;
