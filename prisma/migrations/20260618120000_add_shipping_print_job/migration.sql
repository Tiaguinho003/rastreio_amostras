-- Fila da Etiqueta de Envio (3o tipo, 2026-06-18). Desacoplada de Sample /
-- event store / PrintJob (mesmo padrao do custom_print_job): o print agent
-- busca os PENDING via /api/v1/shipping-print/pending, imprime e marca
-- DONE/FAILED. payload (jsonb) guarda os campos da etiqueta + token/qrUrl
-- (presentes so quando a amostra estava CLASSIFIED — etiqueta com QR).
-- Ver docs/Etiqueta-de-Envio-Plano-de-Trabalho.md.

CREATE TABLE "shipping_print_job" (
    "id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "printer_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipping_print_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_shipping_print_job_status_created" ON "shipping_print_job"("status", "created_at");
