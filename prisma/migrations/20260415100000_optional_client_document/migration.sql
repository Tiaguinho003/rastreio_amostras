-- Torna CPF/CNPJ opcionais ao cadastrar cliente.
-- document_canonical passa a ser nullable e o UNIQUE vira indice parcial
-- (unicidade preservada apenas quando documento existe).

ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "chk_client_person_type_fields";
ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "chk_client_document_canonical_non_blank";
ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "uq_client_document_canonical";

ALTER TABLE "client" ALTER COLUMN "document_canonical" DROP NOT NULL;

CREATE UNIQUE INDEX "uq_client_document_canonical"
  ON "client" ("document_canonical")
  WHERE "document_canonical" IS NOT NULL;

ALTER TABLE "client" ADD CONSTRAINT "chk_client_document_canonical_non_blank" CHECK (
  "document_canonical" IS NULL OR btrim("document_canonical") <> ''
);

ALTER TABLE "client" ADD CONSTRAINT "chk_client_person_type_fields" CHECK (
  (
    "person_type" = 'PF'
    AND "full_name" IS NOT NULL
    AND btrim("full_name") <> ''
    AND "legal_name" IS NULL
    AND "trade_name" IS NULL
    AND "cnpj" IS NULL
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
    AND (
      "cnpj" IS NULL
      OR btrim("cnpj") <> ''
    )
  )
);
