-- =================================================================
-- F5.1 (parte A): audit types da ClientBranch + escape valve do
-- trigger append-only de client_audit_event.
--
-- Esta migration NAO cria UNIQUE em cnpj_root: o wizard de fusao
-- (scripts/migrations/f5-merge-wizard.mjs) precisa rodar primeiro
-- para consolidar grupos COOPERCITRUS / COFCO. A UNIQUE entra em
-- uma migration B aplicada apos o wizard.
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

-- 2. Escape valve para o trigger append-only de client_audit_event.
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
