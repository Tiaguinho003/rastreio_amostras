-- Responsavel do cliente vira OPCIONAL.
-- Remove o invariante "todo Client ACTIVE tem >=1 entrada em client_commercial_user"
-- criado na migration 20260428163500_drop_client_commercial_user_legacy.
-- A tabela client_commercial_user, suas FKs e indices PERMANECEM: a relacao
-- continua existindo e podendo ser usada, so deixa de ser exigida. Sem os drops
-- abaixo, editar/reativar um cliente sem responsavel dispararia o trigger e falharia.

DROP TRIGGER IF EXISTS "trg_assert_client_has_commercial_user_on_link" ON "client_commercial_user";
DROP TRIGGER IF EXISTS "trg_assert_client_has_commercial_user_on_status" ON "client";
DROP FUNCTION IF EXISTS "fn_assert_client_has_commercial_user"();
