-- Terceiro papel de cliente: Armazem (is_warehouse).
--
-- Paralelo a is_buyer (Comprador) e is_seller (Vendedor). Papel independente:
-- um cliente pode ser SO armazem. Por isso o constraint chk_client_role_flags
-- passa a aceitar tambem is_warehouse (>=1 papel continua obrigatorio).
-- Coluna NOT NULL DEFAULT FALSE; o constraint novo e mais fraco que o anterior
-- (apenas adiciona um termo no OR), entao nenhuma linha existente viola.

ALTER TABLE "client" ADD COLUMN "is_warehouse" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "client" DROP CONSTRAINT "chk_client_role_flags";

ALTER TABLE "client" ADD CONSTRAINT "chk_client_role_flags"
    CHECK ("is_buyer" OR "is_seller" OR "is_warehouse");
