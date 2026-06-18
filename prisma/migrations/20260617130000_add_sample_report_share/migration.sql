-- Etiqueta de Envio (3o tipo, 2026-06-17): link publico do laudo gerado no
-- envio de uma amostra CLASSIFIED. Cada PHYSICAL_SAMPLE_SENT (1 por
-- destinatario) gera 1 sample_report_share: o PDF do laudo e CONGELADO em
-- UPLOADS_DIR (storage_path) e o token aleatorio vai no QR da etiqueta. A
-- rota publica GET /laudo/[token] faz stream do PDF sem login.
--
-- Tabela MUTAVEL (revoked_at / expires_at / access_count) e DESACOPLADA do
-- event store: nao cria sample_event nem toca os triggers append-only. FKs
-- com ON DELETE RESTRICT (padrao do projeto). UNIQUE em token (lookup da rota
-- publica) e em send_event_id (1 share por envio — reimpressao reusa o token).
-- Ver docs/Etiqueta-de-Envio-Plano-de-Trabalho.md.

-- ============================================================
-- 1. Tabela sample_report_share
-- ============================================================

CREATE TABLE "sample_report_share" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "sample_id" UUID NOT NULL,
    "send_event_id" UUID NOT NULL,
    "recipient_client_id" UUID,
    "recipient_snapshot" JSONB,
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "reported_harvest" TEXT,
    "issued_by_user_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sample_report_share_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 2. Indices e uniques
-- ============================================================

-- Lookup da rota publica GET /laudo/[token].
CREATE UNIQUE INDEX "uq_sample_report_share_token" ON "sample_report_share"("token");

-- 1 share por evento de envio (idempotencia: reimpressao reusa, nao duplica).
CREATE UNIQUE INDEX "uq_sample_report_share_send_event" ON "sample_report_share"("send_event_id");

-- Lista de shares de uma amostra (revogacao manual / auditoria) + cobre o FK.
CREATE INDEX "idx_sample_report_share_sample_created" ON "sample_report_share"("sample_id", "created_at");

-- Cobrem os FKs de recipient_client_id e issued_by_user_id.
CREATE INDEX "idx_sample_report_share_recipient" ON "sample_report_share"("recipient_client_id");

CREATE INDEX "idx_sample_report_share_issued_by" ON "sample_report_share"("issued_by_user_id");

-- ============================================================
-- 3. FKs (ON DELETE RESTRICT — padrao do projeto)
-- ============================================================

ALTER TABLE "sample_report_share"
  ADD CONSTRAINT "sample_report_share_sample_id_fkey"
  FOREIGN KEY ("sample_id") REFERENCES "sample"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sample_report_share"
  ADD CONSTRAINT "sample_report_share_send_event_id_fkey"
  FOREIGN KEY ("send_event_id") REFERENCES "sample_event"("event_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sample_report_share"
  ADD CONSTRAINT "sample_report_share_recipient_client_id_fkey"
  FOREIGN KEY ("recipient_client_id") REFERENCES "client"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sample_report_share"
  ADD CONSTRAINT "sample_report_share_issued_by_user_id_fkey"
  FOREIGN KEY ("issued_by_user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
