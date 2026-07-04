-- Fase J (D123): auditoria dos MARCOS DE STATUS do contrato — 1 linha por
-- transicao Faturar/Pagar/Washout com ator + quando (+ motivo no washout).
-- Marcos anteriores a tabela seguem so com a data no proprio contrato.
-- Molde = sale_contract_agio_log (FKs inline, sem @relation no schema).
-- Migration MANUAL (skill prisma): aditiva, idempotente. NUNCA migrate dev.

-- CreateTable: sale_contract_status_log
CREATE TABLE IF NOT EXISTS "sale_contract_status_log" (
    "id" UUID NOT NULL,
    "sale_contract_id" UUID NOT NULL,
    "to_status" "SaleContractStatus" NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_contract_status_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_contract_status_log_sale_contract_id_fkey" FOREIGN KEY ("sale_contract_id") REFERENCES "sale_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_status_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_sale_contract_status_log_contract_created" ON "sale_contract_status_log"("sale_contract_id", "created_at");
