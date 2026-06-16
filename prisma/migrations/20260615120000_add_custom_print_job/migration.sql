-- TEMPORARIO: fila de etiquetas avulsas (card do dashboard admin).
--
-- Desacoplada de Sample / event store / PrintJob: o print agent busca os
-- PENDING via /api/v1/custom-print/pending, imprime e marca DONE/FAILED.
-- payload (jsonb) guarda { lines: [{ label, value }], copies }.
-- Removivel com um DROP TABLE quando o card temporario sair.

CREATE TABLE "custom_print_job" (
    "id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "printer_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_print_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_custom_print_job_status_created" ON "custom_print_job"("status", "created_at");
