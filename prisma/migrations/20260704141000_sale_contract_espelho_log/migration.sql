-- Fase J (D124, resolve a D71): auditoria da geracao do Espelho de
-- Corretagem — 1 linha por PDF gerado, com o lado (comprador/vendedor),
-- ator e quando. Molde = sale_contract_agio_log (FKs inline).
-- Migration MANUAL (skill prisma): aditiva, idempotente. NUNCA migrate dev.

-- CreateTable: sale_contract_espelho_log
CREATE TABLE IF NOT EXISTS "sale_contract_espelho_log" (
    "id" UUID NOT NULL,
    "sale_contract_id" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_contract_espelho_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_contract_espelho_log_sale_contract_id_fkey" FOREIGN KEY ("sale_contract_id") REFERENCES "sale_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_espelho_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_sale_contract_espelho_log_contract_created" ON "sale_contract_espelho_log"("sale_contract_id", "created_at");
