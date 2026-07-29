-- RC-D89/D91 (§10): a corretagem de um contrato cancelado deixa de ser derivada do
-- TIPO e passa a ser uma RESPOSTA dada por quem deu o washout.
--
-- Ate aqui valia a D145: washout a vista nunca cobrava (sumia do Financeiro e o
-- Espelho era bloqueado), washout de Futuro sempre cobrava. A regra acertava a
-- maioria dos casos e nao tinha saida para o resto — um a vista cancelado por culpa
-- do comprador nao tinha como cobrar, e um Futuro cancelado por acordo nao tinha
-- como isentar. Quem sabe a resposta e a pessoa, no momento em que cancela.
--
-- ADITIVA. NULL = o contrato nao esta em washout: a coluna so tem sentido no
-- terminal, entao nada de NOT NULL/DEFAULT (um default mentiria sobre os vivos).

ALTER TABLE "sale_contract" ADD COLUMN "washout_billable" BOOLEAN;

-- Backfill pela propria D145: todo washout que ja existe mantem EXATAMENTE o
-- comportamento que tinha no Financeiro e no Espelho. A troca de regra nao mexe
-- retroativamente em dinheiro ja apurado.
UPDATE "sale_contract"
   SET "washout_billable" = ("type" = 'FUTURO')
 WHERE "status" = 'WASH_OUT';
