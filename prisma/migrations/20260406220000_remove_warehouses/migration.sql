-- Remove warehouse feature entirely

ALTER TABLE "sample" DROP CONSTRAINT IF EXISTS "sample_warehouse_id_fkey";
DROP INDEX IF EXISTS "idx_sample_warehouse";
ALTER TABLE "sample" DROP COLUMN IF EXISTS "warehouse_id";
ALTER TABLE "sample" DROP COLUMN IF EXISTS "declared_warehouse";
DROP TABLE IF EXISTS "warehouse_audit_event";
DROP TABLE IF EXISTS "warehouse";
DROP TYPE IF EXISTS "WarehouseAuditEventType";
DROP TYPE IF EXISTS "WarehouseStatus";
