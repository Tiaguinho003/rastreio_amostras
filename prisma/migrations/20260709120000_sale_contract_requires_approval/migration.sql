-- Reforma da Aprovacao, Fase 1 (AP1/AP6): "o sinal" no contrato.
-- Duas colunas novas no sale_contract:
--   requires_approval          -> este contrato precisa de aprovacao? (obrigatorio
--                                 no form; existentes = false via DEFAULT, AP5).
--   approval_reminder_lead_days -> quando precisa, quantos dias antes do invoiceDate
--                                 lembrar de enviar (1..365, default 30 no app; null
--                                 quando nao precisa). Lidos so na Fase 2.
-- Migration MANUAL aditiva e idempotente (skill prisma): NUNCA migrate dev. O
-- DEFAULT false ja faz o backfill dos registros existentes (sem UPDATE separado).

ALTER TABLE "sale_contract" ADD COLUMN IF NOT EXISTS "requires_approval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sale_contract" ADD COLUMN IF NOT EXISTS "approval_reminder_lead_days" INTEGER;
