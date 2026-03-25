-- AlterTable: relax CHECK constraint to allow NULL reason_text for LOSS movements
ALTER TABLE "sample_movement" DROP CONSTRAINT "chk_sample_movement_type_fields";
ALTER TABLE "sample_movement" ADD CONSTRAINT "chk_sample_movement_type_fields" CHECK (
  (
    "movement_type" = 'SALE'
    AND "buyer_client_id" IS NOT NULL
  )
  OR
  (
    "movement_type" = 'LOSS'
    AND "buyer_client_id" IS NULL
  )
);
