-- D3 (revisao da pagina de /samples): alinhar o indice do keyset ao ORDER BY.
--
-- A lista pagina por keyset com ORDER BY
--   (internal_lot_number_int DESC NULLS LAST, id ASC).
-- O indice antigo idx_sample_lot_int_id era (internal_lot_number_int DESC, id),
-- e no Postgres "DESC" implica NULLS FIRST -- que NAO casa com o NULLS LAST do
-- ORDER BY. Com o mismatch, o planner tende a um Sort em vez de index scan.
--
-- Recriamos o indice com a MESMA ordenacao da query (NULLS LAST + id ASC) pra
-- permitir index scan ordenado. Tabela pequena hoje, entao a recriacao e
-- instantanea; mantemos o nome idx_sample_lot_int_id.
DROP INDEX IF EXISTS "idx_sample_lot_int_id";

CREATE INDEX IF NOT EXISTS "idx_sample_lot_int_id"
   ON "sample" ("internal_lot_number_int" DESC NULLS LAST, "id" ASC);
