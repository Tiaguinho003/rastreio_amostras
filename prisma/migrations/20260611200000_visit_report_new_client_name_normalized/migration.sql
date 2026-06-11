-- Busca acento-insensitive por nome de cliente NOVO no informe de visita.
-- Espelha a search_normalized do Client: coluna gerada com
-- public.immutable_unaccent (wrapper IMMUTABLE criado em
-- 20260505111834_add_client_search_normalized_columns) + LOWER.
-- new_client_name NULL (informe de cliente cadastrado) gera NULL.
ALTER TABLE "visit_report"
  ADD COLUMN "new_client_name_normalized" TEXT
  GENERATED ALWAYS AS (LOWER(public.immutable_unaccent("new_client_name"))) STORED;
