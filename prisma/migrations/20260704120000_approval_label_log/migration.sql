-- Aprovacao do contrato (Fase I, D107/D112-D119): auditoria de cada ENVIO da
-- Etiqueta de Aprovacao. sale_contract_id NULO = etiqueta avulsa (caminho
-- "Manual" do seletor); payload = { lines } exatamente como enfileiradas no
-- custom_print_job (pos-edicao); custom_print_job_id liga ao job (o desfecho
-- DONE/FAILED fica la — audita-se o ENVIO). Write-only na Fase I.
-- Molde = sale_contract_agio_log (migration 20260630120000).
-- Migration MANUAL (skill prisma): aditiva, idempotente. NUNCA migrate dev.

-- CreateTable: approval_label_log
CREATE TABLE IF NOT EXISTS "approval_label_log" (
    "id" UUID NOT NULL,
    "sale_contract_id" UUID,
    "actor_user_id" UUID,
    "custom_print_job_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_label_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_label_log_sale_contract_id_fkey" FOREIGN KEY ("sale_contract_id") REFERENCES "sale_contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_label_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "approval_label_log_custom_print_job_id_fkey" FOREIGN KEY ("custom_print_job_id") REFERENCES "custom_print_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_approval_label_log_contract_created" ON "approval_label_log"("sale_contract_id", "created_at");
