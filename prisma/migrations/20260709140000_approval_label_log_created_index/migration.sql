-- AP16 (envios de aprovacao no card "Ultimos envios" do dashboard): o feed busca os
-- envios de aprovacao recentes ordenando por created_at desc (global, sem filtro por
-- contrato). O indice composto [sale_contract_id, created_at] nao serve a esse sort.
-- Migration MANUAL aditiva e idempotente (skill prisma): NUNCA migrate dev.

CREATE INDEX IF NOT EXISTS "idx_approval_label_log_created" ON "approval_label_log"("created_at");
