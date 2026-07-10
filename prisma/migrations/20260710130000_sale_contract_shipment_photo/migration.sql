-- Embarque, Fase 4 (EMB27): fotos OPCIONAIS da confirmacao do embarque.
--
-- Modelo N-por-contrato (0..10), molde ClientAttachment MENOS unit_id. Storage
-- local (contracts/<id>/shipment/...), tipo real por magic bytes (JPEG/PNG/WebP).
-- Leitura por rota-proxy autenticada. Sem @relation no Prisma (FKs so no SQL,
-- padrao das sub-tabelas do contrato). Aditiva idempotente (skill prisma).

CREATE TABLE IF NOT EXISTS "sale_contract_shipment_photo" (
  "id"                  UUID          NOT NULL,
  "sale_contract_id"    UUID          NOT NULL,
  "storage_path"        TEXT          NOT NULL,
  "file_name"           TEXT,
  "mime_type"           TEXT,
  "size_bytes"          INTEGER,
  "checksum_sha256"     TEXT,
  "uploaded_by_user_id" UUID,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_contract_shipment_photo_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "sale_contract_shipment_photo"
    ADD CONSTRAINT "sale_contract_shipment_photo_sale_contract_id_fkey"
    FOREIGN KEY ("sale_contract_id") REFERENCES "sale_contract" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "sale_contract_shipment_photo"
    ADD CONSTRAINT "sale_contract_shipment_photo_uploaded_by_user_id_fkey"
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "app_user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "idx_sale_contract_shipment_photo_contract_created"
  ON "sale_contract_shipment_photo" ("sale_contract_id", "created_at");
