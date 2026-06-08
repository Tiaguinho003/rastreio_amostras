-- O lote nao se vincula mais a uma fazenda/unit especifica (ownerUnitId): zera
-- os vinculos existentes no read-model e remove o indice. A coluna owner_unit_id
-- e a FK sao mantidas (reversivel); o projetor ja nao aplica ownerUnitId, entao
-- a coluna permanece NULL inclusive apos um rebuild do event store. O lado do
-- comprador (buyer_unit_id / buyer_unit_snapshot) NAO e tocado: o historico de
-- vendas e preservado.
UPDATE "sample" SET "owner_unit_id" = NULL;

DROP INDEX "idx_sample_owner_unit";
