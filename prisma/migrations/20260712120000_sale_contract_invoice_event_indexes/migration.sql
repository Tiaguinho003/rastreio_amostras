-- Faturamento (DSB-D11): indices pro feed de "faturamento" do card de Eventos.
-- Agendado = status = 'EMITIDO' com janela por invoice_date; realizado = status IN
-- ('FATURADO','PAGO') com janela por invoiced_at. Espelham os indices de pagamento
-- (status + data). Migration MANUAL aditiva e idempotente (skill prisma): NUNCA
-- migrate dev.

CREATE INDEX IF NOT EXISTS "idx_sale_contract_status_invoice_date" ON "sale_contract"("status", "invoice_date");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_status_invoiced_at" ON "sale_contract"("status", "invoiced_at");
