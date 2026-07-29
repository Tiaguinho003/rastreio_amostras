-- RC-D62/D65 (§6): o contrato deixa de ser maquina de status e vira agenda.
--
-- FATURADO, PAGO e o embarque inteiro sumiram do dominio: eram registros que so
-- existiam pra dizer que existiram (escrituracao pura), enquanto emitir, enviar
-- aprovacao, gerar espelho e dar washout sao SUBPRODUTOS de trabalho que ja se faz.
-- No lugar dos tres marcos entra UM: FINALIZADO, dado por quem conduziu o contrato,
-- reversivel (RC-D63) — e por ser reversivel nao ganha coluna propria: quem guarda
-- "quem e quando" e o sale_contract_status_log, que ja existe e ja alimenta o
-- historico.
--
-- DESTRUTIVA. Segura porque a maquina de status NUNCA foi deployada: a migration
-- 20260702120000 registra isso por escrito e producao parou em 25/06, enquanto todas
-- as migrations de status/embarque sao de 07/xx. O mapeamento abaixo e defensivo:
-- FATURADO -> EMITIDO (nao terminou) e PAGO -> FINALIZADO (terminou).

-- 1) Enum: Postgres nao dropa valor de enum, entao recria o tipo (3a vez neste
--    dominio — mesmo procedimento das 20260701130000 e 20260702120000).
ALTER TABLE "sale_contract" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "SaleContractStatus_new" AS ENUM ('EMITIDO', 'FINALIZADO', 'WASH_OUT');

ALTER TABLE "sale_contract"
  ALTER COLUMN "status" TYPE "SaleContractStatus_new"
  USING (
    CASE "status"::text
      WHEN 'FATURADO' THEN 'EMITIDO'
      WHEN 'PAGO' THEN 'FINALIZADO'
      ELSE "status"::text
    END::"SaleContractStatus_new"
  );

ALTER TABLE "sale_contract" ALTER COLUMN "status" SET DEFAULT 'EMITIDO';

-- O log de status guarda o mesmo enum; converte junto ou o DROP TYPE falha.
ALTER TABLE "sale_contract_status_log"
  ALTER COLUMN "to_status" TYPE "SaleContractStatus_new"
  USING (
    CASE "to_status"::text
      WHEN 'FATURADO' THEN 'EMITIDO'
      WHEN 'PAGO' THEN 'FINALIZADO'
      ELSE "to_status"::text
    END::"SaleContractStatus_new"
  );

DROP TYPE "SaleContractStatus";

ALTER TYPE "SaleContractStatus_new" RENAME TO "SaleContractStatus";

-- 2) Datas reais dos marcos mortos. invoice_date/payment_date FICAM: sao campos do
--    DOCUMENTO (impressos no PDF) e viraram a agenda do contrato.
DROP INDEX IF EXISTS "idx_sale_contract_status_paid_at";
DROP INDEX IF EXISTS "idx_sale_contract_status_invoiced_at";

ALTER TABLE "sale_contract"
  DROP COLUMN IF EXISTS "invoiced_at",
  DROP COLUMN IF EXISTS "paid_at";

-- 3) Embarque (RC-D65): o registro mais caro de todos — confirmacao + transporte +
--    responsavel + fotos — e o unico que travava outro (portao EMB28 no pagamento).
DROP INDEX IF EXISTS "idx_sale_contract_requires_shipment_status_invoice";
DROP INDEX IF EXISTS "idx_sale_contract_requires_shipment_shipped_at";

ALTER TABLE "sale_contract"
  DROP COLUMN IF EXISTS "shipped_at",
  DROP COLUMN IF EXISTS "requires_shipment",
  DROP COLUMN IF EXISTS "shipment_carrier",
  DROP COLUMN IF EXISTS "shipment_responsible_user_id",
  DROP COLUMN IF EXISTS "shipment_responsible_name";

DROP TABLE IF EXISTS "sale_contract_shipment_photo";

DROP TYPE IF EXISTS "ShipmentCarrier";

-- A modalidade carregava "esta modalidade embarca?" so pra o contrato herdar por
-- snapshot no emit (EMB21). Sem o snapshot, a coluna fica sem um unico leitor.
ALTER TABLE "contract_modality" DROP COLUMN IF EXISTS "requires_shipment";
