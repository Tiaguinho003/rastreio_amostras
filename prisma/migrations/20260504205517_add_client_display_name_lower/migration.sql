-- 14.6.C: coluna gerada display_name_lower + index composto pra sort
-- alfabetico server-side via cursor.
--
-- COALESCE(NULLIF(trim(...),''), ...) trata strings vazias como NULL pra
-- pegar o proximo campo na cascata. Cobre PF (full_name), PJ que usa
-- nome fantasia (trade_name), e PJ que so tem razao social (legal_name).
-- Fallback final '' garante que cliente sem nenhum nome (defensive)
-- nao quebra ORDER BY.
--
-- STORED garante que o valor e materializado em disco — leituras
-- nao recalculam, e o index funciona normal.

ALTER TABLE "client"
  ADD COLUMN "display_name_lower" TEXT
  GENERATED ALWAYS AS (
    LOWER(COALESCE(
      NULLIF(trim("full_name"), ''),
      NULLIF(trim("trade_name"), ''),
      NULLIF(trim("legal_name"), ''),
      ''
    ))
  ) STORED;

CREATE INDEX "idx_client_display_name_lower_id"
  ON "client" ("display_name_lower" ASC, "id" ASC);
