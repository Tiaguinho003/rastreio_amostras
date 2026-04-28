-- =================================================================
-- F5.0: Schema novo (ClientBranch) + backfill inicial
--
-- Mantem o legado intacto: client.cnpj, document_canonical,
-- client_registration, sample.owner_registration_id,
-- sample_movement.buyer_registration_id e buyer_registration_snapshot.
-- F5.1 fara o switch de leitura. F5.2 fara o drop.
--
-- Decisao: cnpj_root e indexado mas NAO UNIQUE em F5.0 porque
-- COOPERCITRUS (3 clients) e COFCO (2 clients) compartilham raiz hoje.
-- F5.1 funde via wizard e entao alteramos o indice para UNIQUE.
-- =================================================================

-- 1. Enum status da Branch
CREATE TYPE "ClientBranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- 2. Adicionar cnpj_root ao client (sem UNIQUE em F5.0)
ALTER TABLE "client" ADD COLUMN "cnpj_root" varchar(8);
CREATE INDEX "idx_client_cnpj_root"
  ON "client" ("cnpj_root")
  WHERE "cnpj_root" IS NOT NULL;

-- 3. Backfill cnpj_root para PJ existentes (a partir do document_canonical)
UPDATE "client"
  SET "cnpj_root" = LEFT("document_canonical", 8)
  WHERE "person_type" = 'PJ' AND "document_canonical" IS NOT NULL;

-- 4. Criar tabela client_branch
CREATE TABLE "client_branch" (
  "id"                            uuid PRIMARY KEY,
  "client_id"                     uuid NOT NULL,
  "name"                          text,
  "is_primary"                    boolean NOT NULL DEFAULT false,
  "code"                          integer NOT NULL,
  "cnpj"                          text,
  "cnpj_order"                    varchar(4),
  "legal_name"                    text,
  "trade_name"                    text,
  "phone"                         text,
  "address_line"                  text,
  "district"                      text,
  "city"                          text,
  "state"                         varchar(2),
  "postal_code"                   text,
  "complement"                    text,
  "registration_number"           text,
  "registration_number_canonical" text,
  "registration_type"             text,
  "status"                        "ClientBranchStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at"                    timestamptz(6) NOT NULL DEFAULT NOW(),
  "updated_at"                    timestamptz(6) NOT NULL DEFAULT NOW()
);

-- FK para Client
ALTER TABLE "client_branch"
  ADD CONSTRAINT "client_branch_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indices unicos da branch
CREATE UNIQUE INDEX "uq_client_branch_cnpj"
  ON "client_branch" ("cnpj") WHERE "cnpj" IS NOT NULL;

CREATE UNIQUE INDEX "uq_client_branch_registration_canonical"
  ON "client_branch" ("registration_number_canonical")
  WHERE "registration_number_canonical" IS NOT NULL;

CREATE UNIQUE INDEX "uq_client_branch_client_code"
  ON "client_branch" ("client_id", "code");

-- Apenas 1 matriz por Client
CREATE UNIQUE INDEX "uq_client_branch_primary_per_client"
  ON "client_branch" ("client_id")
  WHERE "is_primary" = true;

-- Indices de busca
CREATE INDEX "idx_client_branch_client_status_primary"
  ON "client_branch" ("client_id", "status", "is_primary");

CREATE INDEX "idx_client_branch_city_state"
  ON "client_branch" ("city", "state");

-- 5. Backfill: 1 branch por Client a partir das ClientRegistrations ATIVAS
INSERT INTO "client_branch" (
  "id", "client_id", "name", "is_primary", "code",
  "cnpj", "cnpj_order",
  "phone",
  "address_line", "district", "city", "state", "postal_code", "complement",
  "registration_number", "registration_number_canonical", "registration_type",
  "status", "created_at", "updated_at"
)
SELECT
  cr."id",
  cr."client_id",
  NULL,
  true,
  1,
  c."cnpj",
  CASE
    WHEN c."document_canonical" IS NOT NULL AND length(c."document_canonical") = 14
    THEN substring(c."document_canonical" from 9 for 4)
    ELSE NULL
  END,
  c."phone",
  cr."address_line", cr."district", cr."city", cr."state",
  cr."postal_code", cr."complement",
  cr."registration_number", cr."registration_number_canonical", cr."registration_type",
  'ACTIVE',
  cr."created_at",
  cr."updated_at"
FROM "client" c
JOIN "client_registration" cr
  ON cr."client_id" = c."id"
  AND cr."status" = 'ACTIVE';

-- 6. Backfill: 1 branch para Clients SEM ClientRegistration ativa
INSERT INTO "client_branch" (
  "id", "client_id", "name", "is_primary", "code",
  "cnpj", "cnpj_order", "phone",
  "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  c."id",
  NULL,
  true,
  1,
  c."cnpj",
  CASE
    WHEN c."document_canonical" IS NOT NULL AND length(c."document_canonical") = 14
    THEN substring(c."document_canonical" from 9 for 4)
    ELSE NULL
  END,
  c."phone",
  'ACTIVE',
  c."created_at",
  c."updated_at"
FROM "client" c
WHERE NOT EXISTS (
  SELECT 1 FROM "client_registration" cr
  WHERE cr."client_id" = c."id" AND cr."status" = 'ACTIVE'
);

-- 7. Adicionar owner_branch_id em sample
ALTER TABLE "sample" ADD COLUMN "owner_branch_id" uuid;
ALTER TABLE "sample"
  ADD CONSTRAINT "sample_owner_branch_id_fkey"
  FOREIGN KEY ("owner_branch_id") REFERENCES "client_branch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "idx_sample_owner_branch" ON "sample" ("owner_branch_id");

-- 8. Backfill owner_branch_id nas samples
-- 8a. Sample com owner_registration_id -> branch que veio dela (mesmo ID)
UPDATE "sample"
  SET "owner_branch_id" = "owner_registration_id"
  WHERE "owner_registration_id" IS NOT NULL;

-- 8b. Sample com owner_client_id mas SEM owner_registration_id -> branch isPrimary
UPDATE "sample" s
  SET "owner_branch_id" = (
    SELECT cb."id" FROM "client_branch" cb
    WHERE cb."client_id" = s."owner_client_id" AND cb."is_primary" = true
    LIMIT 1
  )
  WHERE s."owner_client_id" IS NOT NULL
    AND s."owner_registration_id" IS NULL;

-- 9. Adicionar buyer_branch_id e buyer_branch_snapshot em sample_movement
ALTER TABLE "sample_movement" ADD COLUMN "buyer_branch_id" uuid;
ALTER TABLE "sample_movement" ADD COLUMN "buyer_branch_snapshot" jsonb;
ALTER TABLE "sample_movement"
  ADD CONSTRAINT "sample_movement_buyer_branch_id_fkey"
  FOREIGN KEY ("buyer_branch_id") REFERENCES "client_branch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "idx_sample_movement_buyer_branch" ON "sample_movement" ("buyer_branch_id");

-- 10. Backfill buyer_branch_id e snapshot nas movements
-- 10a. Buyer com registration -> branch correspondente (mesmo ID)
UPDATE "sample_movement"
  SET "buyer_branch_id" = "buyer_registration_id",
      "buyer_branch_snapshot" = "buyer_registration_snapshot"
  WHERE "buyer_registration_id" IS NOT NULL;

-- 10b. Buyer com client mas sem registration -> isPrimary branch
UPDATE "sample_movement" sm
  SET "buyer_branch_id" = (
    SELECT cb."id" FROM "client_branch" cb
    WHERE cb."client_id" = sm."buyer_client_id" AND cb."is_primary" = true
    LIMIT 1
  )
  WHERE sm."buyer_client_id" IS NOT NULL
    AND sm."buyer_registration_id" IS NULL;
