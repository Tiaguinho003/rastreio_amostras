-- Fechamento/Contratos -- Fase 0 (cadastro): extensoes do cadastro de Cliente.
--
-- Adiciona as entidades-base que o Contrato (Grupo C, futuro) vai exigir, TODAS
-- ADITIVAS -- nenhuma toca dados existentes:
--   * enum LookupStatus   -- ACTIVE/INACTIVE compartilhado pelas tabelas de cadastro
--   * client.birth_date   -- data de nascimento PF (D36), coluna anulavel
--   * bank                -- lookup de bancos (nome + codigo COMPE 3 digitos)
--   * broker              -- corretores (vinculo opcional a app_user p/ metrica)
--   * client_bank_account -- conta bancaria por cliente (D28)
--   * client_attachment   -- anexos do cliente (PDF/imagem; independente do contrato, D27)
--
-- Migration MANUAL (padrao do projeto): o schema.prisma nao representa os
-- indices trigram/colunas GENERATED ja existentes no banco, entao um
-- `migrate dev` automatico geraria DROPs espurios. Aqui escrevemos so o SQL
-- aditivo. Guards (IF NOT EXISTS / DO-block) tornam a migration idempotente.

-- CreateEnum (idempotente)
DO $$ BEGIN
  CREATE TYPE "LookupStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable: data de nascimento PF (anulavel; linhas existentes ficam NULL)
ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "birth_date" DATE;

-- CreateTable: bank
CREATE TABLE IF NOT EXISTS "bank" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "compe_code" VARCHAR(3) NOT NULL,
    "status" "LookupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable: broker
CREATE TABLE IF NOT EXISTS "broker" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" UUID,
    "cpf" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "LookupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "broker_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "broker_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: client_bank_account
CREATE TABLE IF NOT EXISTS "client_bank_account" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "bank_id" UUID NOT NULL,
    "agency" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "holder_tax_id" TEXT NOT NULL,
    "pix_key" TEXT,
    "status" "LookupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "client_bank_account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_bank_account_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_bank_account_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: client_attachment
CREATE TABLE IF NOT EXISTS "client_attachment" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "checksum_sha256" TEXT,
    "description" TEXT,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_attachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_attachment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "client_attachment_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: bank
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bank_compe_code" ON "bank"("compe_code");
CREATE INDEX IF NOT EXISTS "idx_bank_status_name" ON "bank"("status", "name");

-- CreateIndex: broker (user_id e cpf unicos -- multiplos NULL permitidos no PG)
CREATE INDEX IF NOT EXISTS "idx_broker_status_name" ON "broker"("status", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_broker_user" ON "broker"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_broker_cpf" ON "broker"("cpf");

-- CreateIndex: client_bank_account
CREATE INDEX IF NOT EXISTS "idx_client_bank_account_client_status" ON "client_bank_account"("client_id", "status");
CREATE INDEX IF NOT EXISTS "idx_client_bank_account_bank" ON "client_bank_account"("bank_id");

-- CreateIndex: client_attachment
CREATE INDEX IF NOT EXISTS "idx_client_attachment_client_created" ON "client_attachment"("client_id", "created_at");
