-- RC-D103/D105: o Espelho de Corretagem entregue passa a ser CONGELADO. A linha de
-- auditoria (que ate aqui guardava so contrato/lado/ator/quando) ganha o `snapshot`
-- com tudo que o papel imprimiu do contrato — porque o espelho era regerado ao vivo
-- e, depois de um "Editar"/agio, saia diferente do que foi entregue ao cliente.
--
-- A coluna e NULAVEL de proposito, e nao por compatibilidade: e o `snapshot` que
-- EXPIRA (15 dias depois do fim do contrato — RC-D105), nao a linha. Anular a coluna
-- apaga o documento e preserva o fato auditado. Linhas anteriores a esta migration
-- ficam com snapshot NULL: o export aconteceu, o documento nao e recuperavel.
--
-- Migration MANUAL (skill prisma): aditiva, idempotente. NUNCA migrate dev.

-- AlterTable: sale_contract_espelho_log.snapshot
ALTER TABLE "sale_contract_espelho_log" ADD COLUMN IF NOT EXISTS "snapshot" JSONB;

-- Sem indice novo de proposito: a purga varre `snapshot IS NOT NULL`, e um indice
-- parcial nao e expressavel no schema.prisma (viraria drift permanente). A tabela e
-- de baixo volume — 1 linha por espelho ENTREGUE — e o indice
-- (sale_contract_id, created_at) que ja existe serve a leitura, que e por contrato.

-- RC-D111: `side` nunca teve constraint. O unico escritor valida ('seller'|'buyer'),
-- mas o tipo era TEXT livre e o front renderiza qualquer valor inesperado — inclusive
-- undefined — como "Comprador". A CHECK fecha isso no banco.
--
-- 🔴 EM PRODUCAO, conferir ANTES:
--   SELECT DISTINCT side FROM sale_contract_espelho_log;
-- Se houver valor fora do par, esta migration FALHA (e e o comportamento certo: nao
-- se corrige dado de auditoria em silencio).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_contract_espelho_log_side'
    ) THEN
        ALTER TABLE "sale_contract_espelho_log"
            ADD CONSTRAINT "chk_sale_contract_espelho_log_side"
            CHECK ("side" IN ('seller', 'buyer'));
    END IF;
END $$;
