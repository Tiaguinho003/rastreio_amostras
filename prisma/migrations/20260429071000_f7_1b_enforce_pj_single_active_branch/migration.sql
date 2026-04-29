-- F7.1B: invariante DDL que impede PJ de ter mais de 1 branch ATIVA.
--
-- Pre-requisito: a consolidacao destrutiva F7.2' ja deve ter rodado em
-- prod, deixando todos os PJ com no maximo 1 branch ATIVA. Aplicar este
-- trigger antes da consolidacao quebra UPDATEs em branches existentes.
--
-- Escape valve: `SET LOCAL app.allow_split_wizard = 'on'` dentro de uma
-- transacao libera a regra para essa tx. Reservada para manutencoes
-- excepcionais (re-execucao do wizard de consolidacao, scripts de
-- undo, fissoes manuais futuras se a politica mudar). Idempotente:
-- current_setting com segundo argumento `true` retorna NULL se a chave
-- nao foi setada, sem levantar erro.

CREATE OR REPLACE FUNCTION enforce_pj_single_active_branch() RETURNS trigger AS $$
DECLARE
  v_person_type TEXT;
  v_active_count INT;
BEGIN
  -- Escape valve para wizards/manutencao
  IF current_setting('app.allow_split_wizard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- So dispara em INSERT (criacao) ou em UPDATE que transiciona para
  -- ACTIVE (reativacao). UPDATE em branch ja ACTIVE — tipico do auto-
  -- promote em inactivate, que troca isPrimary mas mantem status — passa
  -- livre. Branches indo para INACTIVE ou ja inativas tambem passam.
  IF NEW.status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  -- PF pode ter N branches (fazendas) — regra F7 nao se aplica
  SELECT person_type::text INTO v_person_type
    FROM "client"
   WHERE id = NEW.client_id;

  IF v_person_type IS DISTINCT FROM 'PJ' THEN
    RETURN NEW;
  END IF;

  -- Conta outras branches ATIVAS deste client (exclui a propria)
  SELECT COUNT(*) INTO v_active_count
    FROM "client_branch"
   WHERE client_id = NEW.client_id
     AND status = 'ACTIVE'
     AND id <> NEW.id;

  IF v_active_count >= 1 THEN
    RAISE EXCEPTION 'PJ client % already has an active branch', NEW.client_id
      USING HINT = 'PJ admite no maximo 1 branch ATIVA (F7). Inative ou delete a existente antes de criar/reativar outra.',
            ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_pj_single_active_branch
  BEFORE INSERT OR UPDATE ON "client_branch"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_pj_single_active_branch();
