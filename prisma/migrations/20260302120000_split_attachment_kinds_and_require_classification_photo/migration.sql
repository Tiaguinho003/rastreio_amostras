-- Keep at most one legacy label photo per sample before introducing unique by phase.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY sample_id ORDER BY created_at DESC, id DESC) AS rn
  FROM sample_attachment
  WHERE kind::text = 'LABEL_PHOTO'
)
DELETE FROM sample_attachment sa
USING ranked r
WHERE sa.id = r.id
  AND r.rn > 1;

ALTER TYPE "AttachmentKind" RENAME TO "AttachmentKind_old";

CREATE TYPE "AttachmentKind" AS ENUM (
  'ARRIVAL_PHOTO',
  'CLASSIFICATION_PHOTO'
);

ALTER TABLE "sample_attachment"
ALTER COLUMN "kind" TYPE "AttachmentKind"
USING (
  CASE "kind"::text
    WHEN 'LABEL_PHOTO' THEN 'ARRIVAL_PHOTO'::"AttachmentKind"
    ELSE NULL
  END
);

DROP TYPE "AttachmentKind_old";

CREATE UNIQUE INDEX "uq_sample_attachment_sample_kind"
ON "sample_attachment"("sample_id", "kind");

CREATE OR REPLACE FUNCTION "fn_guard_sample_event_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_existing BOOLEAN;
  current_sample_status "SampleStatus";
  classification_photo_id TEXT;
  has_classification_photo BOOLEAN;
BEGIN
  SELECT s."status"
  INTO current_sample_status
  FROM "sample" s
  WHERE s."id" = NEW."sample_id";

  IF current_sample_status = 'INVALIDATED' AND NEW."event_type" <> 'SAMPLE_INVALIDATED' THEN
    RAISE EXCEPTION 'cannot append events to INVALIDATED sample %', NEW."sample_id";
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "sample_event" se
    WHERE se."sample_id" = NEW."sample_id"
  ) INTO has_existing;

  IF NOT has_existing AND NEW."event_type" <> 'SAMPLE_RECEIVED' THEN
    RAISE EXCEPTION 'first event for sample must be SAMPLE_RECEIVED';
  END IF;

  IF has_existing AND NEW."event_type" = 'SAMPLE_RECEIVED' THEN
    RAISE EXCEPTION 'SAMPLE_RECEIVED can only be the first event';
  END IF;

  IF NEW."event_type" = 'SAMPLE_RECEIVED' AND NEW."sequence_number" <> 1 THEN
    RAISE EXCEPTION 'SAMPLE_RECEIVED must have sequence_number=1';
  END IF;

  IF NEW."event_type" = 'CLASSIFICATION_COMPLETED' THEN
    classification_photo_id := NEW."payload"->>'classificationPhotoId';

    IF classification_photo_id IS NULL OR btrim(classification_photo_id) = '' THEN
      RAISE EXCEPTION 'CLASSIFICATION_COMPLETED requires classificationPhotoId';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM "sample_attachment" sa
      WHERE sa."sample_id" = NEW."sample_id"
        AND sa."kind" = 'CLASSIFICATION_PHOTO'
        AND sa."id"::text = classification_photo_id
    ) INTO has_classification_photo;

    IF NOT has_classification_photo THEN
      RAISE EXCEPTION 'CLASSIFICATION_COMPLETED requires an existing CLASSIFICATION_PHOTO attachment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
