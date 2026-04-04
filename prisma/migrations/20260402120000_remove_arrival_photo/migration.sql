-- Remove ARRIVAL_PHOTO from AttachmentKind enum
-- Delete any existing ARRIVAL_PHOTO attachments first
DELETE FROM "sample_attachment" WHERE "kind" = 'ARRIVAL_PHOTO';

-- Recreate enum without ARRIVAL_PHOTO
BEGIN;
CREATE TYPE "AttachmentKind_new" AS ENUM ('CLASSIFICATION_PHOTO');
ALTER TABLE "sample_attachment" ALTER COLUMN "kind" TYPE "AttachmentKind_new" USING ("kind"::text::"AttachmentKind_new");
ALTER TYPE "AttachmentKind" RENAME TO "AttachmentKind_old";
ALTER TYPE "AttachmentKind_new" RENAME TO "AttachmentKind";
DROP TYPE "public"."AttachmentKind_old";
COMMIT;

-- Remove label_photo_count column from sample table
ALTER TABLE "sample" DROP COLUMN "label_photo_count";
