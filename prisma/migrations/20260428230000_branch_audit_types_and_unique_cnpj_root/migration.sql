-- =================================================================
-- F5.1: Audit events para branch + UNIQUE em cnpj_root
--
-- Pre-requisito operacional: scripts/migrations/f5-merge-wizard.mjs
-- ja foi executado em prod com --apply, consolidando duplicatas
-- por raiz de CNPJ. Sem isso, o CREATE UNIQUE INDEX falha.
--
-- Os ALTER TYPE ADD VALUE rodam fora de transacao (Prisma migrate
-- usa autocommit para tipos). Os novos valores so sao referenciados
-- pelo codigo que sobe junto com esta migration, evitando o erro
-- "unsafe use of new value of enum type" do Postgres.
-- =================================================================

-- 1. Novos audit events para o ciclo de vida da ClientBranch
ALTER TYPE "ClientAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_BRANCH_CREATED';
ALTER TYPE "ClientAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_BRANCH_UPDATED';
ALTER TYPE "ClientAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_BRANCH_INACTIVATED';
ALTER TYPE "ClientAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_BRANCH_REACTIVATED';

-- 2. Promover idx_client_cnpj_root para UNIQUE
DROP INDEX IF EXISTS "idx_client_cnpj_root";
CREATE UNIQUE INDEX "uq_client_cnpj_root"
  ON "client" ("cnpj_root")
  WHERE "cnpj_root" IS NOT NULL;

-- 3. Escape valve para o trigger append-only de client_audit_event.
--    O wizard de fusao precisa re-aim target_client_id para o representante
--    (caso contrario o DELETE do client absorvido falha por FK RESTRICT).
--    O wizard ativa explicitamente a flag `app.allow_audit_mutation`
--    via SET LOCAL dentro da transacao; nenhum outro caller faz isso, entao
--    o append-only continua valendo para o restante da aplicacao.
CREATE OR REPLACE FUNCTION reject_client_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_audit_mutation', true) = 'wizard_f51' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'client_audit_event is append-only';
END;
$$ LANGUAGE plpgsql;
