-- F1 (Eventos-Dashboard E24/D138): indices p/ o feed de "pagamentos de contrato"
-- do card de Eventos. A query filtra por JANELA de data: payment_date (agendado:
-- status EMITIDO/FATURADO) e paid_at (realizado: status PAGO). Compostos
-- [status, data] servem os 2 sub-tipos. Migration MANUAL (skill prisma): aditiva,
-- idempotente. NUNCA migrate dev.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_sale_contract_status_payment_date" ON "sale_contract"("status", "payment_date");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_status_paid_at" ON "sale_contract"("status", "paid_at");
