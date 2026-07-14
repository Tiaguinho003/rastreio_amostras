-- D141: banco vira texto livre na conta bancária.
-- Backfill do nome a partir do lookup "bank" antes de dropar a FK e a tabela.
-- (Prod nunca rodou as migrations de bancos — o backfill cobre o dado demo local.)

ALTER TABLE "client_bank_account" ADD COLUMN "bank_name" TEXT;

UPDATE "client_bank_account"
SET "bank_name" = UPPER(b."name")
FROM "bank" b
WHERE b."id" = "client_bank_account"."bank_id";

-- "bank_id" era NOT NULL + FK, então o join acima preenche todas as linhas.
ALTER TABLE "client_bank_account" ALTER COLUMN "bank_name" SET NOT NULL;

ALTER TABLE "client_bank_account" DROP CONSTRAINT "client_bank_account_bank_id_fkey";
DROP INDEX "idx_client_bank_account_bank";
ALTER TABLE "client_bank_account" DROP COLUMN "bank_id";

DROP TABLE "bank";
