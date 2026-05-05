-- 14.7: busca de cliente acento-insensivel + ignora espacamento
-- decorativo entre letras. Implementacao B1 (recomendada): 2 colunas
-- geradas que materializam as variantes normalizadas, comparadas via
-- ILIKE com input do usuario tambem normalizado em JS.
--
-- search_normalized: acentos removidos + minusculas + concatenacao das
--   3 fontes de nome (full_name | trade_name | legal_name) com espaco
--   entre. Espacos PRESERVADOS — preserva precisao em busca por frase.
-- search_compact: search_normalized SEM espacos. Usado quando o input
--   do usuario nao tem espacos (ex: "GAS" casa "G A S COMERCIO ...").
--
-- unaccent NAO e IMMUTABLE por padrao em PG (depende de dictionary que
-- pode ser alterado). Generated columns exigem expressao IMMUTABLE.
-- Solucao: wrapper SQL function marcada IMMUTABLE.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  PARALLEL SAFE
  AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$;

ALTER TABLE "client"
  ADD COLUMN "search_normalized" TEXT
  GENERATED ALWAYS AS (
    LOWER(public.immutable_unaccent(
      COALESCE(NULLIF(trim("full_name"), ''), '')
      || ' ' ||
      COALESCE(NULLIF(trim("trade_name"), ''), '')
      || ' ' ||
      COALESCE(NULLIF(trim("legal_name"), ''), '')
    ))
  ) STORED;

ALTER TABLE "client"
  ADD COLUMN "search_compact" TEXT
  GENERATED ALWAYS AS (
    regexp_replace(
      LOWER(public.immutable_unaccent(
        COALESCE(NULLIF(trim("full_name"), ''), '')
        || ' ' ||
        COALESCE(NULLIF(trim("trade_name"), ''), '')
        || ' ' ||
        COALESCE(NULLIF(trim("legal_name"), ''), '')
      )),
      '\s+', '', 'g'
    )
  ) STORED;
