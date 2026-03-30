-- Reconcile schema drift: Prisma-managed FK names, index recreation, updatedAt defaults.
-- Trigram indexes (raw SQL, not managed by Prisma) are dropped by Prisma but re-created at the end.

-- DropForeignKey (will be re-added with Prisma standard names)
ALTER TABLE "client_audit_event" DROP CONSTRAINT "fk_client_audit_target_registration";
ALTER TABLE "sample" DROP CONSTRAINT "fk_sample_owner_registration";
ALTER TABLE "sample_movement" DROP CONSTRAINT "fk_sample_movement_buyer_registration";

-- DropIndex (Prisma recreates these with same name but expects to own them)
DROP INDEX "idx_user_created_id";
DROP INDEX "idx_user_role_created_id";
DROP INDEX "idx_user_status_created_id";
DROP INDEX "idx_email_change_new_email_created";
DROP INDEX "idx_email_change_user_created";
DROP INDEX "idx_password_reset_email_created";
DROP INDEX "idx_password_reset_user_created";
DROP INDEX "idx_sample_status_created_id";
DROP INDEX "idx_user_audit_actor_created";
DROP INDEX "idx_user_audit_created";
DROP INDEX "idx_user_audit_event_type_created";
DROP INDEX "idx_user_audit_target_created";
DROP INDEX "idx_user_session_user_created";

-- Drop trigram indexes (Prisma does not manage them, will recreate at end)
DROP INDEX IF EXISTS "idx_client_full_name_trgm";
DROP INDEX IF EXISTS "idx_client_legal_name_trgm";
DROP INDEX IF EXISTS "idx_client_trade_name_trgm";
DROP INDEX IF EXISTS "idx_sample_declared_owner_trgm";
DROP INDEX IF EXISTS "idx_sample_internal_lot_trgm";

-- AlterTable: Drop updatedAt defaults (Prisma @updatedAt handles this in app layer)
ALTER TABLE "app_user" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "client" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "client_registration" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "print_job" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "sample" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "sample_movement" ALTER COLUMN "updated_at" DROP DEFAULT;

-- Recreate indexes with Prisma-managed names
CREATE INDEX "idx_user_status_created_id" ON "app_user"("status", "created_at", "id");
CREATE INDEX "idx_user_role_created_id" ON "app_user"("role", "created_at", "id");
CREATE INDEX "idx_user_created_id" ON "app_user"("created_at", "id");
CREATE INDEX "idx_email_change_user_created" ON "email_change_request"("user_id", "created_at");
CREATE INDEX "idx_email_change_new_email_created" ON "email_change_request"("new_email_canonical", "created_at");
CREATE INDEX "idx_password_reset_user_created" ON "password_reset_request"("user_id", "created_at");
CREATE INDEX "idx_password_reset_email_created" ON "password_reset_request"("email_canonical", "created_at");
CREATE INDEX "idx_sample_status_created_id" ON "sample"("status", "created_at", "id");
CREATE INDEX "idx_user_audit_target_created" ON "user_audit_event"("target_user_id", "created_at");
CREATE INDEX "idx_user_audit_actor_created" ON "user_audit_event"("actor_user_id", "created_at");
CREATE INDEX "idx_user_audit_event_type_created" ON "user_audit_event"("event_type", "created_at");
CREATE INDEX "idx_user_audit_created" ON "user_audit_event"("created_at");
CREATE INDEX "idx_user_session_user_created" ON "user_session"("user_id", "created_at");

-- RenameForeignKey: Standardize to Prisma naming convention
ALTER TABLE "client_audit_event" RENAME CONSTRAINT "fk_client_audit_actor_user" TO "client_audit_event_actor_user_id_fkey";
ALTER TABLE "client_audit_event" RENAME CONSTRAINT "fk_client_audit_target_client" TO "client_audit_event_target_client_id_fkey";
ALTER TABLE "client_registration" RENAME CONSTRAINT "fk_client_registration_client" TO "client_registration_client_id_fkey";
ALTER TABLE "print_job" RENAME CONSTRAINT "fk_print_job_requested_event" TO "print_job_requested_event_id_fkey";
ALTER TABLE "print_job" RENAME CONSTRAINT "fk_print_job_result_event" TO "print_job_result_event_id_fkey";
ALTER TABLE "print_job" RENAME CONSTRAINT "fk_print_job_sample" TO "print_job_sample_id_fkey";
ALTER TABLE "sample" RENAME CONSTRAINT "fk_sample_owner_client" TO "sample_owner_client_id_fkey";
ALTER TABLE "sample_attachment" RENAME CONSTRAINT "fk_sample_attachment_sample" TO "sample_attachment_sample_id_fkey";
ALTER TABLE "sample_event" RENAME CONSTRAINT "fk_sample_event_sample" TO "sample_event_sample_id_fkey";
ALTER TABLE "sample_movement" RENAME CONSTRAINT "fk_sample_movement_buyer_client" TO "sample_movement_buyer_client_id_fkey";
ALTER TABLE "sample_movement" RENAME CONSTRAINT "fk_sample_movement_sample" TO "sample_movement_sample_id_fkey";

-- AddForeignKey: Re-add dropped FKs with Prisma standard names
ALTER TABLE "sample" ADD CONSTRAINT "sample_owner_registration_id_fkey" FOREIGN KEY ("owner_registration_id") REFERENCES "client_registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_audit_event" ADD CONSTRAINT "client_audit_event_target_registration_id_fkey" FOREIGN KEY ("target_registration_id") REFERENCES "client_registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sample_movement" ADD CONSTRAINT "sample_movement_buyer_registration_id_fkey" FOREIGN KEY ("buyer_registration_id") REFERENCES "client_registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restore trigram indexes (raw SQL, not managed by Prisma schema)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_sample_internal_lot_trgm"
ON "sample"
USING GIN ("internal_lot_number" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_sample_declared_owner_trgm"
ON "sample"
USING GIN ("declared_owner" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_client_full_name_trgm"
ON "client"
USING GIN ("full_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_client_legal_name_trgm"
ON "client"
USING GIN ("legal_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_client_trade_name_trgm"
ON "client"
USING GIN ("trade_name" gin_trgm_ops);
