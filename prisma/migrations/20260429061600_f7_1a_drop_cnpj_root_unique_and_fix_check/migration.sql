-- F7.1A: prepara o schema para a fissao de PJ multi-filial (F7.2 wizard).
--
-- 1. cnpjRoot deixa de ser UNIQUE: sob a regra F7, Clients PJ distintos
--    podem compartilhar a mesma raiz (filiais distintas do mesmo grupo
--    empresarial sao Clients separados, nao mais filiais de um Client
--    unico). O wizard F7.2 cria N novos Clients com a mesma cnpj_root da
--    matriz original — UNIQUE bloqueia.
--
-- 2. chk_client_person_type_fields e recriado sem a referencia residual
--    a cnpj_deprecated_2026q2 (legado renomeado em F5.2 que vira drop
--    definitivo na Phase 10; nao deve participar de invariantes ativos).
--
-- O TRIGGER que enforca PJ <= 1 branch ATIVA fica para F7.1B, depois do
-- wizard F7.2 ter rodado em prod.

-- 1) Drop UNIQUE em cnpj_root, recria como INDEX simples (parcial).
DROP INDEX IF EXISTS "uq_client_cnpj_root";

CREATE INDEX IF NOT EXISTS "idx_client_cnpj_root"
  ON "client" ("cnpj_root")
  WHERE "cnpj_root" IS NOT NULL;

-- 2) Recria chk_client_person_type_fields sem a referencia ao legado
--    cnpj_deprecated_2026q2. Inclui IF EXISTS porque a recriacao
--    historica (F4.15) usa o mesmo nome de constraint.
ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "chk_client_person_type_fields";

ALTER TABLE "client" ADD CONSTRAINT "chk_client_person_type_fields" CHECK (
  (
    "person_type" = 'PF'
    AND "full_name" IS NOT NULL
    AND btrim("full_name") <> ''
    AND "legal_name" IS NULL
    AND "trade_name" IS NULL
    AND (
      "cpf" IS NULL
      OR btrim("cpf") <> ''
    )
  )
  OR
  (
    "person_type" = 'PJ'
    AND "legal_name" IS NOT NULL
    AND btrim("legal_name") <> ''
    AND "full_name" IS NULL
    AND "cpf" IS NULL
  )
);
