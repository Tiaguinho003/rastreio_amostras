-- Simplifica a maquina de status do contrato de venda:
--   * remove o status CONFERIR (o "Emitir" ja faz todo o trabalho, o "Confirmar" era so um flip)
--   * renomeia CONFIRMADO -> EMITIDO
-- Postgres nao permite dropar um valor de enum, entao recriamos o tipo,
-- migrando as linhas existentes (CONFERIR e CONFIRMADO viram EMITIDO).
-- A tabela e "sale_contract" (@@map); o tipo enum e "SaleContractStatus".

ALTER TABLE "sale_contract" ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "SaleContractStatus_new" AS ENUM ('EM_ABERTO', 'EMITIDO', 'FATURADO', 'PAGO', 'WASH_OUT');

ALTER TABLE "sale_contract"
  ALTER COLUMN "status" TYPE "SaleContractStatus_new"
  USING (
    CASE "status"::text
      WHEN 'CONFERIR' THEN 'EMITIDO'
      WHEN 'CONFIRMADO' THEN 'EMITIDO'
      ELSE "status"::text
    END::"SaleContractStatus_new"
  );

ALTER TABLE "sale_contract" ALTER COLUMN "status" SET DEFAULT 'EM_ABERTO';

DROP TYPE "SaleContractStatus";

ALTER TYPE "SaleContractStatus_new" RENAME TO "SaleContractStatus";
