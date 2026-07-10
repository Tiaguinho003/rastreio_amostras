-- Embarque, Fase 1 (EMB21/EMB22): "o sinal" + a data real.
--
-- 1) contract_modality.requires_shipment: cada modalidade carrega "embarca?".
--    Semeado Retirar/Posto=true, Disponivel=false. O contrato herda por SNAPSHOT
--    no emit (nao segue a modalidade depois de emitido).
-- 2) sale_contract.requires_shipment: snapshot congelado na emissao (existentes =
--    false via DEFAULT).
-- 3) sale_contract.shipped_at: data REAL do embarque (par de invoiced_at/paid_at);
--    nulo = ainda nao embarcado. Preenchida na confirmacao (EMB27).
-- 4) Dois indices do feed/worklist (EMB23/EMB24), espelham o da aprovacao.
--
-- Migration MANUAL aditiva e idempotente (skill prisma): NUNCA migrate dev. Os
-- DEFAULT false ja fazem o backfill; o UPDATE marca as 2 modalidades que embarcam.

ALTER TABLE "contract_modality" ADD COLUMN IF NOT EXISTS "requires_shipment" BOOLEAN NOT NULL DEFAULT false;
UPDATE "contract_modality" SET "requires_shipment" = true WHERE "name" IN ('Retirar', 'Posto');

ALTER TABLE "sale_contract" ADD COLUMN IF NOT EXISTS "requires_shipment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sale_contract" ADD COLUMN IF NOT EXISTS "shipped_at" DATE;

CREATE INDEX IF NOT EXISTS "idx_sale_contract_requires_shipment_status_invoice"
  ON "sale_contract" ("requires_shipment", "status", "invoice_date");
CREATE INDEX IF NOT EXISTS "idx_sale_contract_requires_shipment_shipped_at"
  ON "sale_contract" ("requires_shipment", "shipped_at");
