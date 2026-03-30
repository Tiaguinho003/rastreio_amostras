-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WarehouseAuditEventType" AS ENUM ('WAREHOUSE_CREATED', 'WAREHOUSE_UPDATED', 'WAREHOUSE_INACTIVATED', 'WAREHOUSE_REACTIVATED');

-- CreateTable
CREATE TABLE "warehouse" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_canonical" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_audit_event" (
    "event_id" UUID NOT NULL,
    "target_warehouse_id" UUID,
    "actor_user_id" UUID,
    "event_type" "WarehouseAuditEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "reason_text" TEXT,
    "request_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "metadata_ip" TEXT,
    "metadata_user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_audit_event_pkey" PRIMARY KEY ("event_id")
);

-- AlterTable: Add warehouse columns to sample
ALTER TABLE "sample" ADD COLUMN "warehouse_id" UUID;
ALTER TABLE "sample" ADD COLUMN "declared_warehouse" TEXT;

-- CreateIndex: Warehouse
CREATE UNIQUE INDEX "uq_warehouse_name_canonical" ON "warehouse"("name_canonical");
CREATE INDEX "idx_warehouse_status_name" ON "warehouse"("status", "name_canonical");
CREATE INDEX "idx_warehouse_created_id" ON "warehouse"("created_at", "id");

-- CreateIndex: Warehouse audit
CREATE INDEX "idx_warehouse_audit_target_created" ON "warehouse_audit_event"("target_warehouse_id", "created_at");
CREATE INDEX "idx_warehouse_audit_event_type_created" ON "warehouse_audit_event"("event_type", "created_at");
CREATE INDEX "idx_warehouse_audit_created" ON "warehouse_audit_event"("created_at");

-- CreateIndex: Sample warehouse
CREATE INDEX "idx_sample_warehouse" ON "sample"("warehouse_id");

-- AddForeignKey: Sample -> Warehouse
ALTER TABLE "sample" ADD CONSTRAINT "sample_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WarehouseAuditEvent -> Warehouse
ALTER TABLE "warehouse_audit_event" ADD CONSTRAINT "warehouse_audit_event_target_warehouse_id_fkey" FOREIGN KEY ("target_warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: WarehouseAuditEvent -> User
ALTER TABLE "warehouse_audit_event" ADD CONSTRAINT "warehouse_audit_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
