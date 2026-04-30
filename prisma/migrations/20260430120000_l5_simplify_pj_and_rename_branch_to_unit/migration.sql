-- L5: simplificacao da estrutura PJ + rename ClientBranch -> ClientUnit
-- + ajustes Q-13 / Q-15 / Q-16 / Q-23 / D-A..D-E + cleanup F5.1/F7.2'.
--
-- Pre-requisitos:
--   * L3 ja zerou client/client_branch/sample/sample_event/etc.
--   * Maintenance mode (M1) ativo durante o deploy do L5.
--
-- Decisoes ancoradas (ver docs/Reset-Refatoracao-e-Reimport-Clientes.md §10/§12.5):
--   * Q-09: PJ exige cnpj NOT NULL (CHECK).
--   * Q-10a: novos campos `email` em Client e `car` em ClientUnit.
--   * Q-10e/f -> caminho A: dados de PJ no Client direto; ClientBranch (renomeado
--     para ClientUnit) so para fazendas PF.
--   * Q-12: Client PJ ganha 9 recomendados (sem registration_type).
--   * Q-13: ClientUnit obrigatorio name; recomendados; drop registration_type.
--   * Q-14: rename ClientBranch -> ClientUnit (DB + FKs em sample/sample_movement/
--     client_audit_event).
--   * Q-15: drop is_primary + UNIQUE parcial.
--   * Q-16: cutover enum ClientAuditEventType para 8 valores finais.
--   * Q-23: email NAO UNIQUE em Client.
--   * D-A: ClientUnit.cnpj UNIQUE GLOBAL parcial.
--   * D-B: ClientUnit (client_id, lower(name)) UNIQUE parcial WHERE status='ACTIVE'.
--   * D-C: drop cnpj_order em ClientUnit (semantica de "ordem" so faz sentido em PJ).
--   * D-E: drop escape valve `app.allow_audit_mutation='wizard_f51'` da funcao
--     reject_client_audit_event_mutation.
--   * D-H: confiar em CHECK; sem trigger fn_assert_pj_has_cnpj separado.
--   * D-I: enforce_pj_zero_units sem escape valve.

-- =============================================================================
-- BLOCO A — Client adds (L5 + Q-12) + CHECK ajustado pos-L5
-- =============================================================================

-- A.1 Novas colunas em client (todas NULLABLE; PJ usara, PF deixara NULL).
ALTER TABLE "client"
  ADD COLUMN "cnpj"                          text,
  ADD COLUMN "cnpj_order"                    varchar(4),
  ADD COLUMN "registration_number"           text,
  ADD COLUMN "registration_number_canonical" text,
  ADD COLUMN "address_line"                  text,
  ADD COLUMN "district"                      text,
  ADD COLUMN "city"                          text,
  ADD COLUMN "state"                         varchar(2),
  ADD COLUMN "postal_code"                   text,
  ADD COLUMN "complement"                    text,
  ADD COLUMN "email"                         text;

-- A.2 UNIQUE parciais novos para os campos de identidade fiscal de PJ.
CREATE UNIQUE INDEX "uq_client_cnpj"
  ON "client" ("cnpj")
  WHERE "cnpj" IS NOT NULL;

CREATE UNIQUE INDEX "uq_client_registration_canonical"
  ON "client" ("registration_number_canonical")
  WHERE "registration_number_canonical" IS NOT NULL;

-- A.3 chk_client_person_type_fields atualizado:
--     PF: legal_name/trade_name/cnpj/cnpj_order/IE/endereco TODOS NULL.
--     PJ: cnpj NOT NULL (Q-09); full_name/cpf NULL.
--     Email opcional em ambos (Q-10c/Q-12).
ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "chk_client_person_type_fields";

ALTER TABLE "client" ADD CONSTRAINT "chk_client_person_type_fields" CHECK (
  (
    "person_type" = 'PF'
    AND "full_name" IS NOT NULL
    AND btrim("full_name") <> ''
    AND "legal_name" IS NULL
    AND "trade_name" IS NULL
    AND "cnpj" IS NULL
    AND "cnpj_order" IS NULL
    AND "registration_number" IS NULL
    AND "registration_number_canonical" IS NULL
    AND "address_line" IS NULL
    AND "district" IS NULL
    AND "city" IS NULL
    AND "state" IS NULL
    AND "postal_code" IS NULL
    AND "complement" IS NULL
    AND ("cpf" IS NULL OR btrim("cpf") <> '')
    AND ("email" IS NULL OR btrim("email") <> '')
  )
  OR
  (
    "person_type" = 'PJ'
    AND "legal_name" IS NOT NULL
    AND btrim("legal_name") <> ''
    AND "full_name" IS NULL
    AND "cpf" IS NULL
    AND "cnpj" IS NOT NULL
    AND btrim("cnpj") <> ''
    AND ("email" IS NULL OR btrim("email") <> '')
  )
);

-- =============================================================================
-- BLOCO B — ClientBranch ajustes + rename para ClientUnit
-- =============================================================================

-- B.1 Drop trigger F7.1B (PJ <= 1 branch ATIVA) — substituido pelo novo
--     enforce_pj_zero_units no fim deste bloco.
DROP TRIGGER IF EXISTS "trg_enforce_pj_single_active_branch" ON "client_branch";
DROP FUNCTION IF EXISTS "enforce_pj_single_active_branch"();

-- B.2 Drop colunas removidas em L5/Q-15/Q-13/D-C.
--     Postgres auto-dropa indices/constraints que dependem dessas colunas:
--       * is_primary  -> uq_client_branch_primary_per_client (parcial),
--                        idx_client_branch_client_status_primary (3 cols)
--       * registration_type -> nada
--       * cnpj_order   -> nada
ALTER TABLE "client_branch"
  DROP COLUMN IF EXISTS "is_primary",
  DROP COLUMN IF EXISTS "registration_type",
  DROP COLUMN IF EXISTS "cnpj_order";

-- B.3 Adicionar coluna car (Q-10a, Q-13).
ALTER TABLE "client_branch" ADD COLUMN "car" text;

-- B.4 Forcar name obrigatorio (Q-13). DB esta vazio (L3) — sem backfill.
ALTER TABLE "client_branch" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "client_branch"
  ADD CONSTRAINT "chk_client_branch_name_nonempty"
  CHECK (btrim("name") <> '');

-- B.5 Recria idx (sem is_primary) ainda com nome antigo; sera renomeado em B.7.
CREATE INDEX "idx_client_branch_client_status"
  ON "client_branch" ("client_id", "status");

-- B.6 Rename: client_branch -> client_unit; enum ClientBranchStatus -> ClientUnitStatus.
ALTER TABLE "client_branch" RENAME TO "client_unit";
ALTER TYPE "ClientBranchStatus" RENAME TO "ClientUnitStatus";

-- B.7 Renomear constraints/indexes para o novo padrao client_unit_*.
ALTER TABLE "client_unit" RENAME CONSTRAINT "client_branch_client_id_fkey"
  TO "client_unit_client_id_fkey";

ALTER TABLE "client_unit" RENAME CONSTRAINT "chk_client_branch_name_nonempty"
  TO "chk_client_unit_name_nonempty";

ALTER INDEX "uq_client_branch_cnpj"
  RENAME TO "uq_client_unit_cnpj";

ALTER INDEX "uq_client_branch_registration_canonical"
  RENAME TO "uq_client_unit_registration_canonical";

ALTER INDEX "uq_client_branch_client_code"
  RENAME TO "uq_client_unit_client_code";

ALTER INDEX "idx_client_branch_client_status"
  RENAME TO "idx_client_unit_client_status";

ALTER INDEX "idx_client_branch_city_state"
  RENAME TO "idx_client_unit_city_state";

-- B.8 UNIQUE parcial (D-B): client_id + lower(name) ATIVOS — bloqueia PF com
--     2 fazendas ATIVAS de mesmo nome.
CREATE UNIQUE INDEX "uq_client_unit_client_name_active"
  ON "client_unit" ("client_id", lower("name"))
  WHERE "status" = 'ACTIVE';

-- B.9 Renomear FK columns em sample / sample_movement / client_audit_event
--     (parte do rename Q-14).
ALTER TABLE "sample" RENAME COLUMN "owner_branch_id" TO "owner_unit_id";
ALTER TABLE "sample" RENAME CONSTRAINT "sample_owner_branch_id_fkey"
  TO "sample_owner_unit_id_fkey";
ALTER INDEX "idx_sample_owner_branch" RENAME TO "idx_sample_owner_unit";

ALTER TABLE "sample_movement" RENAME COLUMN "buyer_branch_id" TO "buyer_unit_id";
ALTER TABLE "sample_movement" RENAME COLUMN "buyer_branch_snapshot" TO "buyer_unit_snapshot";
ALTER TABLE "sample_movement" RENAME CONSTRAINT "sample_movement_buyer_branch_id_fkey"
  TO "sample_movement_buyer_unit_id_fkey";
ALTER INDEX "idx_sample_movement_buyer_branch" RENAME TO "idx_sample_movement_buyer_unit";

ALTER TABLE "client_audit_event" RENAME COLUMN "target_branch_id" TO "target_unit_id";
ALTER TABLE "client_audit_event" RENAME CONSTRAINT "client_audit_event_target_branch_id_fkey"
  TO "client_audit_event_target_unit_id_fkey";
ALTER INDEX "idx_client_audit_branch_created" RENAME TO "idx_client_audit_unit_created";

-- B.10 Trigger novo: PJ nao pode ter unidade (D-I, sem escape valve).
CREATE OR REPLACE FUNCTION enforce_pj_zero_units() RETURNS trigger AS $$
DECLARE
  v_person_type TEXT;
BEGIN
  SELECT person_type::text INTO v_person_type
    FROM "client"
   WHERE id = NEW.client_id;

  IF v_person_type = 'PJ' THEN
    RAISE EXCEPTION 'PJ client % cannot have units (post-L5)', NEW.client_id
      USING HINT = 'Sob L5 PJ guarda cnpj/endereco direto em Client. Apenas PF tem unidades.',
            ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_pj_zero_units
  BEFORE INSERT OR UPDATE ON "client_unit"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_pj_zero_units();

-- =============================================================================
-- BLOCO C — Cutover do enum ClientAuditEventType (Q-16)
-- =============================================================================
-- Estado final: 8 valores. L3 zerou client_audit_event entao a coluna esta
-- vazia — cast e no-op (sem risco de falhar em valores deprecated).

CREATE TYPE "ClientAuditEventType_new" AS ENUM (
  'CLIENT_CREATED',
  'CLIENT_UPDATED',
  'CLIENT_INACTIVATED',
  'CLIENT_REACTIVATED',
  'CLIENT_UNIT_CREATED',
  'CLIENT_UNIT_UPDATED',
  'CLIENT_UNIT_INACTIVATED',
  'CLIENT_UNIT_REACTIVATED'
);

ALTER TABLE "client_audit_event"
  ALTER COLUMN "event_type" TYPE "ClientAuditEventType_new"
  USING ("event_type"::text::"ClientAuditEventType_new");

DROP TYPE "ClientAuditEventType";
ALTER TYPE "ClientAuditEventType_new" RENAME TO "ClientAuditEventType";

-- =============================================================================
-- BLOCO D — Cleanup escape valve F5.1 do trigger append-only (D-E)
-- =============================================================================
-- O escape valve `app.allow_audit_mutation='wizard_f51'` foi adicionado em
-- 20260428230000 para o wizard de fusao F5.1. Pos-L5 o wizard sai junto;
-- o append-only fica sem porta dos fundos.

CREATE OR REPLACE FUNCTION reject_client_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'client_audit_event is append-only';
END;
$$ LANGUAGE plpgsql;
