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
-- O QUE ESTA MIGRATION FAZ:
--   1) Desabilita triggers append-only de sample_event e client_audit_event
--      para permitir DELETE.
--   2) Apaga TODAS as linhas das tabelas: sample_movement, print_job,
--      sample_attachment, sample_event, sample, client_audit_event,
--      client_branch, client_commercial_user, client. Ordem respeita FKs
--      (filhos antes de pais).
--   3) Reabilita triggers append-only.
--   4) Remove colunas e tabelas deprecated remanescentes da F5.2:
--        - sample.owner_registration_id_deprecated_2026q2
--        - sample_movement.buyer_registration_id_deprecated_2026q2
--        - sample_movement.buyer_registration_snapshot_deprecated_2026q2
--        - client.cnpj_deprecated_2026q2
--        - client.document_canonical_deprecated_2026q2
--        - DROP TABLE client_registration_deprecated_2026q2
--
-- L3.5 (fase seguinte, fora desta migration): apaga as 44 fotos orfas no
-- Cloud Storage via `gsutil -m rm -r gs://safras-amostras-prod-runtime/uploads/samples/`.

-- 1. Desabilita triggers append-only.
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";
ALTER TABLE "client_audit_event" DISABLE TRIGGER "trg_reject_client_audit_event_delete";
ALTER TABLE "client_audit_event" DISABLE TRIGGER "trg_reject_client_audit_event_update";

-- 2. Reset de dados (filhos antes de pais; FK Restrict).
DELETE FROM "sample_movement";
DELETE FROM "print_job";
DELETE FROM "sample_attachment";
DELETE FROM "sample_event";
DELETE FROM "sample";

DELETE FROM "client_audit_event";
DELETE FROM "client_branch";
DELETE FROM "client_commercial_user";
DELETE FROM "client";

-- 3. Reabilita triggers append-only.
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";
ALTER TABLE "client_audit_event" ENABLE TRIGGER "trg_reject_client_audit_event_delete";
ALTER TABLE "client_audit_event" ENABLE TRIGGER "trg_reject_client_audit_event_update";

-- 4. Cleanup das tabelas/colunas deprecated da F5.2 (encerra Phase 10).
ALTER TABLE "sample" DROP COLUMN IF EXISTS "owner_registration_id_deprecated_2026q2";
ALTER TABLE "sample_movement" DROP COLUMN IF EXISTS "buyer_registration_id_deprecated_2026q2";
ALTER TABLE "sample_movement" DROP COLUMN IF EXISTS "buyer_registration_snapshot_deprecated_2026q2";
ALTER TABLE "client" DROP COLUMN IF EXISTS "cnpj_deprecated_2026q2";
ALTER TABLE "client" DROP COLUMN IF EXISTS "document_canonical_deprecated_2026q2";
DROP TABLE IF EXISTS "client_registration_deprecated_2026q2";
