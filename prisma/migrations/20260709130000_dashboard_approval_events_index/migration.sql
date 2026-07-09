-- Reforma da Aprovacao, Fase 2 (AP6/AP14): indice pro feed do "lembrete de aprovacao"
-- do card de Eventos. A query filtra os PENDENTES: requires_approval = true +
-- status = 'EMITIDO', com janela por invoice_date (o lembrete conta X dias antes do
-- faturamento). requires_approval lidera (true e seletivo — a maioria e false).
-- Migration MANUAL aditiva e idempotente (skill prisma): NUNCA migrate dev.

CREATE INDEX IF NOT EXISTS "idx_sale_contract_requires_approval_status_invoice" ON "sale_contract"("requires_approval", "status", "invoice_date");
