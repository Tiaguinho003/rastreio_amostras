-- Adiciona vinculo opcional entre Client e User (usuario responsavel / comercial).
-- Fase 1: campo opcional, sem constraint de role, sem backfill. Admin distribui
-- manualmente depois. Desvinculacao em massa acontece via aplicacao quando o
-- usuario e inativado (ver UserService.inactivateUser).

ALTER TABLE "client" ADD COLUMN "commercial_user_id" uuid;

ALTER TABLE "client"
  ADD CONSTRAINT "client_commercial_user_id_fkey"
  FOREIGN KEY ("commercial_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_client_commercial_user_id"
  ON "client" ("commercial_user_id", "code");
