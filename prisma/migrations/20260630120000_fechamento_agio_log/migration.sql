-- Auditoria de aplicacao de agio/desagio pos-CONFIRMADO (D90).
-- Uma linha por aplicacao via os botoes do card do contrato CONFIRMADO; registra
-- o valor aplicado, o que substituiu (previous_*) e o total antes->depois.
-- Molde = sale_contract_export (migration 20260626130000). O enum AgioDesagioType
-- ja existe no banco. Migration MANUAL (skill prisma): aditiva, idempotente.

-- CreateTable: sale_contract_agio_log
CREATE TABLE IF NOT EXISTS "sale_contract_agio_log" (
    "id" UUID NOT NULL,
    "sale_contract_id" UUID NOT NULL,
    "agio_desagio_type" "AgioDesagioType" NOT NULL,
    "agio_desagio_value" DECIMAL(12,2) NOT NULL,
    "previous_agio_type" "AgioDesagioType",
    "previous_agio_value" DECIMAL(12,2),
    "previous_total_value" DECIMAL(14,2) NOT NULL,
    "new_total_value" DECIMAL(14,2) NOT NULL,
    "applied_by_user_id" UUID,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_contract_agio_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_contract_agio_log_sale_contract_id_fkey" FOREIGN KEY ("sale_contract_id") REFERENCES "sale_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_contract_agio_log_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_sale_contract_agio_log_contract_applied" ON "sale_contract_agio_log"("sale_contract_id", "applied_at");
