CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_client_full_name_trgm"
ON "client"
USING GIN ("full_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_client_legal_name_trgm"
ON "client"
USING GIN ("legal_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_client_trade_name_trgm"
ON "client"
USING GIN ("trade_name" gin_trgm_ops);
