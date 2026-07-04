-- Remove o status EM_ABERTO da maquina de status do contrato de venda (D97):
-- o contrato nasce EMITIDO numa unica operacao atomica (a etapa 2 ja vem
-- resolvida na criacao), entao o rascunho EM_ABERTO deixa de existir.
-- Postgres nao permite dropar um valor de enum, entao recriamos o tipo.
-- Nao ha linhas EM_ABERTO em producao (a feature nao foi deployada); o
-- mapeamento EM_ABERTO -> EMITIDO e apenas defensivo.
-- A tabela e "sale_contract" (@@map); o tipo enum e "SaleContractStatus".

ALTER TABLE "sale_contract" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "SaleContractStatus_new" AS ENUM ('EMITIDO', 'FATURADO', 'PAGO', 'WASH_OUT');

ALTER TABLE "sale_contract"
  ALTER COLUMN "status" TYPE "SaleContractStatus_new"
  USING (
    CASE "status"::text
      WHEN 'EM_ABERTO' THEN 'EMITIDO'
      ELSE "status"::text
    END::"SaleContractStatus_new"
  );

ALTER TABLE "sale_contract" ALTER COLUMN "status" SET DEFAULT 'EMITIDO';

DROP TYPE "SaleContractStatus";

ALTER TYPE "SaleContractStatus_new" RENAME TO "SaleContractStatus";
