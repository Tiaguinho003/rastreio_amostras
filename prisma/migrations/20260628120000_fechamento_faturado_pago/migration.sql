-- Fechamento/Contratos -- Fase B: datas reais dos marcos FATURADO/PAGO.
--
-- ADITIVA. Adiciona 2 colunas nullable em sale_contract com as datas REAIS do
-- faturamento e do pagamento (podem diferir das planejadas invoice_date/
-- payment_date). Preenchidas ao marcar FATURADO/PAGO; limpas ao desfazer.
-- Idempotente (ADD COLUMN IF NOT EXISTS). Migration MANUAL (padrao do projeto;
-- ver skill prisma).

ALTER TABLE "sale_contract" ADD COLUMN IF NOT EXISTS "invoiced_at" DATE;
ALTER TABLE "sale_contract" ADD COLUMN IF NOT EXISTS "paid_at" DATE;
