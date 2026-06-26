-- Fechamento/Contratos -- Fase B parte 1: tabelas do contrato (Grupo C) + listas (Grupo B).
--
-- ADITIVA. Cria: enums (SaleContractType, SaleContractStatus, AgioDesagioType);
-- 3 listas cadastraveis (contract_payment_form/modality/packaging) + SEED
-- idempotente dos valores iniciais; sale_contract (CRUD, NAO event-sourced) +
-- sale_contract_broker + sale_contract_export (auditoria de emissao, D56).
-- Referencias = colunas escalares; FKs de integridade inline (ON DELETE
-- RESTRICT). Migration MANUAL (padrao do projeto; ver skill prisma -- o
-- schema.prisma nao modela essas FKs como @relation, so como coluna escalar).

-- CreateEnum (idempotente)
DO $$ BEGIN
  CREATE TYPE "SaleContractType" AS ENUM ('MERCADO_A_VISTA', 'FUTURO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "SaleContractStatus" AS ENUM ('EM_ABERTO', 'CONFERIR', 'CONFIRMADO', 'FATURADO', 'PAGO', 'WASH_OUT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "AgioDesagioType" AS ENUM ('AGIO', 'DESAGIO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable: listas cadastraveis (Grupo B, D20/D53)
CREATE TABLE IF NOT EXISTS "contract_payment_form" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "LookupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "contract_payment_form_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "contract_modality" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "LookupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "contract_modality_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "contract_packaging" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "LookupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "contract_packaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sale_contract (Grupo C central). FKs inline (ON DELETE RESTRICT).
CREATE TABLE IF NOT EXISTS "sale_contract" (
    "id" UUID NOT NULL,
    "type" "SaleContractType" NOT NULL,
    "contract_seq" INTEGER NOT NULL,
    "contract_number" TEXT NOT NULL,
    "status" "SaleContractStatus" NOT NULL DEFAULT 'EM_ABERTO',
    "washout_reason" TEXT,
    "washout_at" TIMESTAMPTZ(6),
    "contract_date" DATE NOT NULL,
    "purchase_number" TEXT,
    "sample_id" UUID,
    "movement_id" UUID,
    "seller_client_id" UUID,
    "seller_unit_id" UUID,
    "seller_snapshot" JSONB,
    "buyer_client_id" UUID,
    "buyer_unit_id" UUID,
    "buyer_snapshot" JSONB,
    "buyer_warehouse_client_id" UUID,
    "buyer_warehouse_snapshot" JSONB,
    "seller_warehouse_client_id" UUID,
    "seller_warehouse_snapshot" JSONB,
    "seller_bank_account_id" UUID,
    "seller_bank_snapshot" JSONB,
    "quantity_sacks" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "agio_desagio_type" "AgioDesagioType",
    "agio_desagio_value" DECIMAL(12,2),
    "total_value" DECIMAL(14,2) NOT NULL,
    "weight_kg" DECIMAL(10,2),
    "seller_brokerage_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "seller_brokerage_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "buyer_brokerage_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "buyer_brokerage_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_condition" TEXT,
    "payment_form_id" UUID,
    "payment_form_text" TEXT,
    "modality_id" UUID,
    "modality_text" TEXT,
    "packaging_id" UUID,
    "packaging_text" TEXT,
    "invoice_date" DATE,
    "payment_date" DATE,
    "observations" TEXT,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "sale_contract_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_contract_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "sample_movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_seller_client_id_fkey" FOREIGN KEY ("seller_client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_seller_unit_id_fkey" FOREIGN KEY ("seller_unit_id") REFERENCES "client_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_buyer_client_id_fkey" FOREIGN KEY ("buyer_client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_buyer_unit_id_fkey" FOREIGN KEY ("buyer_unit_id") REFERENCES "client_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_buyer_warehouse_client_id_fkey" FOREIGN KEY ("buyer_warehouse_client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_seller_warehouse_client_id_fkey" FOREIGN KEY ("seller_warehouse_client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_seller_bank_account_id_fkey" FOREIGN KEY ("seller_bank_account_id") REFERENCES "client_bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_payment_form_id_fkey" FOREIGN KEY ("payment_form_id") REFERENCES "contract_payment_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "contract_modality"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_packaging_id_fkey" FOREIGN KEY ("packaging_id") REFERENCES "contract_packaging"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: sale_contract_broker (N corretores, D34)
CREATE TABLE IF NOT EXISTS "sale_contract_broker" (
    "id" UUID NOT NULL,
    "sale_contract_id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "broker_name_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_contract_broker_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_contract_broker_sale_contract_id_fkey" FOREIGN KEY ("sale_contract_id") REFERENCES "sale_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_broker_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: sale_contract_export (auditoria de emissao, D56)
CREATE TABLE IF NOT EXISTS "sale_contract_export" (
    "id" UUID NOT NULL,
    "sale_contract_id" UUID NOT NULL,
    "contract_type" "SaleContractType" NOT NULL,
    "generated_by_user_id" UUID,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_contract_export_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_contract_export_sale_contract_id_fkey" FOREIGN KEY ("sale_contract_id") REFERENCES "sale_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_export_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex: listas
CREATE UNIQUE INDEX IF NOT EXISTS "uq_contract_payment_form_name" ON "contract_payment_form"("name");
CREATE INDEX IF NOT EXISTS "idx_contract_payment_form_status_order" ON "contract_payment_form"("status", "sort_order");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_contract_modality_name" ON "contract_modality"("name");
CREATE INDEX IF NOT EXISTS "idx_contract_modality_status_order" ON "contract_modality"("status", "sort_order");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_contract_packaging_name" ON "contract_packaging"("name");
CREATE INDEX IF NOT EXISTS "idx_contract_packaging_status_order" ON "contract_packaging"("status", "sort_order");

-- CreateIndex: sale_contract
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sale_contract_seq" ON "sale_contract"("contract_seq");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sale_contract_number" ON "sale_contract"("contract_number");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sale_contract_movement" ON "sale_contract"("movement_id");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_type_status_created_id" ON "sale_contract"("type", "status", "created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_seller_status" ON "sale_contract"("seller_client_id", "status");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_buyer_status" ON "sale_contract"("buyer_client_id", "status");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_sample" ON "sale_contract"("sample_id");

-- CreateIndex: filhas
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sale_contract_broker" ON "sale_contract_broker"("sale_contract_id", "broker_id");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_broker_broker" ON "sale_contract_broker"("broker_id");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_export_contract_generated" ON "sale_contract_export"("sale_contract_id", "generated_at");

-- Seed idempotente das 3 listas (valores iniciais, D20/D53). gen_random_uuid()
-- e core no PG13+; ON CONFLICT (name) torna re-execucao no-op.
INSERT INTO "contract_payment_form" ("id", "name", "sort_order", "status", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'Faturado', 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Livre', 2, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "contract_modality" ("id", "name", "sort_order", "status", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'Retirar', 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Posto', 2, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Disponível', 3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "contract_packaging" ("id", "name", "sort_order", "status", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'Sacaria', 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Bags', 2, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'A granel', 3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
