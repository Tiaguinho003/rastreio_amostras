-- Fase 1 R1.3: encerra a transicao N:N.
-- 1) Preflight: aborta se algum Client ACTIVE estiver sem entrada na join.
-- 2) Cria invariante via 2 triggers DEFERRABLE INITIALLY DEFERRED:
--    - em client_commercial_user: dispara em DELETE/UPDATE (cobre desvinculo)
--    - em client (status):       dispara em UPDATE OF status (cobre reativacao)
--    DEFERRED permite swap (delete old + insert new) na mesma tx sem falsa-falha.
-- 3) Remove FK, indice e coluna legados client.commercial_user_id.

-- 1) Preflight
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "client" c
  WHERE c."status" = 'ACTIVE'
    AND NOT EXISTS (
      SELECT 1 FROM "client_commercial_user" ccu WHERE ccu."client_id" = c."id"
    );
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'R1.3 preflight: % active clients without entries in client_commercial_user. Resolve via UI before proceeding.', orphan_count;
  END IF;
END $$;

-- 2) Funcao compartilhada: detecta qualquer Client ACTIVE sem entrada na join.
CREATE OR REPLACE FUNCTION "fn_assert_client_has_commercial_user"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "client" c
    WHERE c."status" = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM "client_commercial_user" ccu WHERE ccu."client_id" = c."id"
      )
  ) THEN
    RAISE EXCEPTION 'Active client cannot have zero commercial users';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

-- Trigger 1: dispara em mudancas na tabela join (cobre desvinculo de users).
CREATE CONSTRAINT TRIGGER "trg_assert_client_has_commercial_user_on_link"
  AFTER DELETE OR UPDATE ON "client_commercial_user"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "fn_assert_client_has_commercial_user"();

-- Trigger 2: dispara quando Client muda de status (cobre reativacao
-- INACTIVE -> ACTIVE sem users vinculados).
CREATE CONSTRAINT TRIGGER "trg_assert_client_has_commercial_user_on_status"
  AFTER UPDATE OF "status" ON "client"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'ACTIVE')
  EXECUTE FUNCTION "fn_assert_client_has_commercial_user"();

-- 3) Remove o campo legado.
ALTER TABLE "client" DROP CONSTRAINT "client_commercial_user_id_fkey";
DROP INDEX IF EXISTS "idx_client_commercial_user_id";
ALTER TABLE "client" DROP COLUMN "commercial_user_id";
