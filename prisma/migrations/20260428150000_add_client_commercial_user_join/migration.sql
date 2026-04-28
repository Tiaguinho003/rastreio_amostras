-- Fase 1 R1.0: cria tabela join N:N entre Client e User comercial.
-- O campo legado "client.commercial_user_id" continua existindo durante R1.0-R1.2
-- (transicao dual-write). Sera removido em R1.3 junto com a constraint trigger
-- que garante "Client ACTIVE tem >=1 entrada na join".

CREATE TABLE "client_commercial_user" (
  "client_id"  uuid NOT NULL,
  "user_id"    uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("client_id", "user_id")
);

ALTER TABLE "client_commercial_user"
  ADD CONSTRAINT "client_commercial_user_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_commercial_user"
  ADD CONSTRAINT "client_commercial_user_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_ccu_client_created" ON "client_commercial_user" ("client_id", "created_at");
CREATE INDEX "idx_ccu_user_created"   ON "client_commercial_user" ("user_id", "created_at");

-- Backfill: copia o vinculo singular existente (client.commercial_user_id) para a join.
-- Idempotente: ON CONFLICT DO NOTHING evita duplicar caso a migration seja reaplicada.
INSERT INTO "client_commercial_user" ("client_id", "user_id", "created_at")
  SELECT "id", "commercial_user_id", "created_at"
  FROM "client"
  WHERE "commercial_user_id" IS NOT NULL
  ON CONFLICT ("client_id", "user_id") DO NOTHING;
