-- Vinculo do anexo de cliente a uma filial/fazenda (ClientUnit).
--
-- Anulavel: NULL = anexo do proprio cliente; preenchido = anexo da filial.
-- Migration ADITIVA e idempotente (mesmo estilo de 20260626120000).
--
-- ON DELETE RESTRICT: ClientUnit nunca e hard-deleted (inactivateUnit so faz
-- update status=INACTIVE), entao a restricao nunca dispara em runtime.

-- AlterTable: client_attachment
ALTER TABLE "client_attachment" ADD COLUMN IF NOT EXISTS "unit_id" UUID;

-- AddForeignKey: client_attachment.unit_id -> client_unit.id
DO $$ BEGIN
  ALTER TABLE "client_attachment"
    ADD CONSTRAINT "client_attachment_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "client_unit"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateIndex: client_attachment
CREATE INDEX IF NOT EXISTS "idx_client_attachment_unit" ON "client_attachment"("unit_id");
