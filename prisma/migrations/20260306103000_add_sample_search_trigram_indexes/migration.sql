CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_sample_internal_lot_trgm"
ON "sample"
USING GIN ("internal_lot_number" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_sample_declared_owner_trgm"
ON "sample"
USING GIN ("declared_owner" gin_trgm_ops);
