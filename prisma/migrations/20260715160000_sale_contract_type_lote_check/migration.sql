-- D147: endurece o invariante a-vista/futuro <-> vinculo de lote.
-- A vista (MERCADO_A_VISTA) SEMPRE tem lote (sample_id + movement_id 1:1 com a
-- venda); futuro (FUTURO) NUNCA tem (nasce e permanece sem lote — contrato de
-- papel). Impede que `type` e o vinculo de lote divirjam: o washout ramifica
-- por `type` (isFutureContract), o Financeiro/Espelho tambem (isSpotWashout/
-- WASHOUT_BILLABLE) — a constraint garante que os dois criterios sempre casem.
-- Constraint MANUAL: nao e representada no schema.prisma (drift intencional,
-- como os indices GIN trigram, colunas GENERATED e CONSTRAINT TRIGGERs deste
-- repo — ver skill prisma). Segura: `sale_contract` nasceu vazia em prod
-- (feature nao deployada) e a criacao (createSpotSaleContract/
-- createFutureSaleContract) sempre respeitou a invariante.

ALTER TABLE "sale_contract"
  ADD CONSTRAINT "chk_sale_contract_type_lote"
  CHECK (
    ("type" = 'FUTURO' AND "sample_id" IS NULL AND "movement_id" IS NULL)
    OR ("type" = 'MERCADO_A_VISTA' AND "sample_id" IS NOT NULL AND "movement_id" IS NOT NULL)
  );
