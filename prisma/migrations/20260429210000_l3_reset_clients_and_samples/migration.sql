-- L3: reset destrutivo de clientes + amostras + dependentes em prod,
-- e cleanup definitivo das tabelas/colunas deprecated da F5.2 (encerra
-- a "Phase 10" que estava prevista mas nunca executada).
--
-- Pre-requisitos:
--   * L2 ja gerou backup estruturado em tmp/ (samples-backup.{json,csv} +
--     gsutil-download-script.sh + samples-backup-attachments.csv).
--   * Usuario confirmou que validou o backup e baixou as 44 fotos.
--   * Schema F7/F8 preservado.
--
-- O QUE ESTA MIGRATION FAZ (em ordem):
--   1) DROP TABLE client_registration_deprecated_2026q2 (CASCADE quebra a FK
--      `client_registration_client_id_fkey` que referencia client.id —
--      necessario antes do DELETE em client).
--   2) DROP COLUMN das colunas *_deprecated_2026q2 remanescentes em sample,
--      sample_movement, client.
--   3) DISABLE triggers append-only de sample_event e client_audit_event.
--   4) DELETE em ordem (filhos antes de pais, FK Restrict): sample_movement,
--      print_job, sample_attachment, sample_event, sample, client_audit_event,
--      client_branch, client_commercial_user, client.
--   5) ENABLE triggers.
--
-- L3.5 (fase seguinte, fora desta migration): apaga as 44 fotos orfas no
-- Cloud Storage via `gsutil -m rm -r gs://safras-amostras-prod-runtime/uploads/samples/`.

-- 1. Cleanup das tabelas/colunas deprecated da F5.2 (encerra Phase 10).
--    Feito ANTES do DELETE em client porque
--    `client_registration_deprecated_2026q2.client_id` mantem FK para
--    `client.id` (nao foi dropada na F5.2 que apenas renomeou a tabela).
--    CASCADE remove a FK constraint junto com a tabela.
DROP TABLE IF EXISTS "client_registration_deprecated_2026q2" CASCADE;
ALTER TABLE "sample" DROP COLUMN IF EXISTS "owner_registration_id_deprecated_2026q2";
ALTER TABLE "sample_movement" DROP COLUMN IF EXISTS "buyer_registration_id_deprecated_2026q2";
ALTER TABLE "sample_movement" DROP COLUMN IF EXISTS "buyer_registration_snapshot_deprecated_2026q2";
ALTER TABLE "client" DROP COLUMN IF EXISTS "cnpj_deprecated_2026q2";
ALTER TABLE "client" DROP COLUMN IF EXISTS "document_canonical_deprecated_2026q2";

-- 2. Desabilita triggers append-only para permitir DELETE.
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";
ALTER TABLE "client_audit_event" DISABLE TRIGGER "trg_reject_client_audit_event_delete";
ALTER TABLE "client_audit_event" DISABLE TRIGGER "trg_reject_client_audit_event_update";

-- 3. Reset de dados (filhos antes de pais; FK Restrict).
DELETE FROM "sample_movement";
DELETE FROM "print_job";
DELETE FROM "sample_attachment";
DELETE FROM "sample_event";
DELETE FROM "sample";

DELETE FROM "client_audit_event";
DELETE FROM "client_branch";
DELETE FROM "client_commercial_user";
DELETE FROM "client";

-- 4. Reabilita triggers append-only.
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";
ALTER TABLE "client_audit_event" ENABLE TRIGGER "trg_reject_client_audit_event_delete";
ALTER TABLE "client_audit_event" ENABLE TRIGGER "trg_reject_client_audit_event_update";
