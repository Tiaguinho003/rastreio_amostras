-- Lembrete do relatorio semanal do comercial (2026-06-11): marcador de
-- envio por (usuario, semana). O job push-digest (kind weekly-reminder)
-- dispara o push "Lembre-se do seu relatório." quando:
--   R1 — o ultimo relatorio do usuario tem mais de 6 dias e 12 horas; ou
--   R2 — e sexta-feira >= 17:00 BRT e o relatorio da semana nao foi enviado.
-- A UNIQUE (user_id, week_start) garante NO MAXIMO 1 lembrete por usuario
-- por semana, independente de qual regra disparou (insercao antes do envio,
-- race-safe entre execucoes concorrentes do job).

CREATE TABLE "weekly_report_reminder" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_report_reminder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_weekly_report_reminder_user_week" UNIQUE ("user_id", "week_start")
);

ALTER TABLE "weekly_report_reminder"
  ADD CONSTRAINT "weekly_report_reminder_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
