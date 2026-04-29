-- =================================================================
-- F5.2: Switch escrita branch + rename legado.
--
-- ClientBranch e a unica fonte agora. ClientRegistration (tabela e
-- colunas relacionadas) sao renomeadas com sufixo _deprecated_2026q2
-- para manter os dados como backup; DROP definitivo sera em Phase 10.
--
-- Operacoes:
--   1. Re-aim FK target_registration_id -> target_branch_id (mesmo UUID)
--   2. Drop FK + idx + check constraints que referenciam registration
--   3. Drop UNIQUE document_canonical (cnpj_root cobre PJ; cpf vira UNIQUE)
--   4. Add UNIQUE em client.cpf (parcial, PF only)
--   5. Add CHECK invariants para owner_branch / buyer_branch
--   6. Rename colunas legacy
--   7. Rename tabela legacy
-- =================================================================

-- 1. Re-aim FK de audit events: target_registration_id -> target_branch_id.
--    Funciona porque branch.id == registration.id por design F5.0.
ALTER TABLE "client_audit_event"
  DROP CONSTRAINT IF EXISTS "client_audit_event_target_registration_id_fkey";

ALTER TABLE "client_audit_event"
  RENAME COLUMN "target_registration_id" TO "target_branch_id";

ALTER TABLE "client_audit_event"
  ADD CONSTRAINT "client_audit_event_target_branch_id_fkey"
  FOREIGN KEY ("target_branch_id")
  REFERENCES "client_branch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Renomeia o indice tambem para refletir o novo nome de coluna
ALTER INDEX IF EXISTS "idx_client_audit_registration_created"
  RENAME TO "idx_client_audit_branch_created";

-- 2a. Drop FK + idx + check em sample.owner_registration_id
ALTER TABLE "sample" DROP CONSTRAINT IF EXISTS "fk_sample_owner_registration";
ALTER TABLE "sample" DROP CONSTRAINT IF EXISTS "sample_owner_registration_id_fkey";
ALTER TABLE "sample" DROP CONSTRAINT IF EXISTS "chk_sample_owner_registration_requires_client";
DROP INDEX IF EXISTS "idx_sample_owner_registration";

-- 2b. Drop FK + idx + check em sample_movement.buyer_registration_id
ALTER TABLE "sample_movement" DROP CONSTRAINT IF EXISTS "fk_sample_movement_buyer_registration";
ALTER TABLE "sample_movement" DROP CONSTRAINT IF EXISTS "sample_movement_buyer_registration_id_fkey";
ALTER TABLE "sample_movement" DROP CONSTRAINT IF EXISTS "chk_sample_movement_buyer_registration_requires_client";
DROP INDEX IF EXISTS "idx_sample_movement_buyer_registration";

-- 3. Drop UNIQUE document_canonical e check non-blank.
--    PJ uniqueness garantida por uq_client_cnpj_root (F5.1B).
--    PF uniqueness vira CONSTRAINT separada em cpf abaixo.
DROP INDEX IF EXISTS "uq_client_document_canonical";
ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "chk_client_document_canonical_non_blank";

-- 4. UNIQUE parcial em client.cpf (so PF preenche essa coluna)
CREATE UNIQUE INDEX "uq_client_cpf"
  ON "client" ("cpf")
  WHERE "cpf" IS NOT NULL;

-- 5a. CHECK invariant para sample.owner_branch_id requires owner_client_id.
--     Espelha o invariante antigo do registration; alinhado com C2 (ambos req
--     em writes novos, mas DB tolera nulls em legacy).
ALTER TABLE "sample"
  ADD CONSTRAINT "chk_sample_owner_branch_requires_client"
  CHECK ("owner_branch_id" IS NULL OR "owner_client_id" IS NOT NULL);

-- 5b. CHECK invariant para sample_movement.buyer_branch_id requires buyer_client_id.
ALTER TABLE "sample_movement"
  ADD CONSTRAINT "chk_sample_movement_buyer_branch_requires_client"
  CHECK ("buyer_branch_id" IS NULL OR "buyer_client_id" IS NOT NULL);

-- 6a. Rename colunas legacy em client (cnpj/document_canonical).
--     Mantidas para auditoria pos-deploy; drop definitivo em Phase 10.
ALTER TABLE "client" RENAME COLUMN "cnpj" TO "cnpj_deprecated_2026q2";
ALTER TABLE "client" RENAME COLUMN "document_canonical" TO "document_canonical_deprecated_2026q2";

-- 6b. Rename coluna legacy em sample.
ALTER TABLE "sample" RENAME COLUMN "owner_registration_id" TO "owner_registration_id_deprecated_2026q2";

-- 6c. Rename colunas legacy em sample_movement.
ALTER TABLE "sample_movement" RENAME COLUMN "buyer_registration_id" TO "buyer_registration_id_deprecated_2026q2";
ALTER TABLE "sample_movement" RENAME COLUMN "buyer_registration_snapshot" TO "buyer_registration_snapshot_deprecated_2026q2";

-- 7. Rename tabela legacy.
--    Indexes e constraints internos da tabela permanecem com nomes antigos
--    (Postgres mantem ao renomear tabela); nao sao mais visiveis pelo Prisma.
ALTER TABLE "client_registration" RENAME TO "client_registration_deprecated_2026q2";
