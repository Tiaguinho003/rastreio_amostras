-- Lote editavel: numero informado manualmente (fora de sequencia) + ordenacao
-- numerica da pagina de Lotes.
--
-- internal_lot_number_int: espelho numerico de internal_lot_number, usado pra
--   orderBy/cursor por numero do lote (a coluna de texto ordena lexicografico).
-- lot_number_manual: marca lotes cujo numero foi informado manualmente. O
--   gerador automatico (getNextInternalLotNumber) ignora esses no calculo do
--   proximo numero, pra que um numero manual nunca avance o ponteiro da sequencia.

ALTER TABLE "sample" ADD COLUMN IF NOT EXISTS "internal_lot_number_int" INTEGER;
ALTER TABLE "sample" ADD COLUMN IF NOT EXISTS "lot_number_manual" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: todos os lotes existentes vieram da sequencia automatica (auto), entao
-- lot_number_manual permanece false. So numeros puros com ate 7 digitos cabem no
-- INTEGER e viram chave de ordenacao; o resto (nulo/nao-numerico) fica null.
UPDATE "sample"
   SET "internal_lot_number_int" = CAST("internal_lot_number" AS INTEGER)
 WHERE "internal_lot_number" ~ '^[0-9]{1,7}$'
   AND "internal_lot_number_int" IS NULL;

-- Indice pra ordenacao desc + desempate estavel por id (paginacao keyset).
CREATE INDEX IF NOT EXISTS "idx_sample_lot_int_id"
   ON "sample" ("internal_lot_number_int" DESC, "id");
