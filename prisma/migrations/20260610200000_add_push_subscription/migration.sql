-- Web Push (2026-06-10): tabela push_subscription.
--
-- Uma row por aparelho/navegador inscrito de cada usuario (multi-aparelho =
-- multi-row). endpoint e a URL unica emitida pelo push service do navegador
-- (Apple/Google/Mozilla); p256dh + auth sao as chaves de criptografia da
-- inscricao (RFC 8291). user_agent e so diagnostico.
--
-- Ciclo de vida:
--   * criar/ativar  — upsert por endpoint (outro usuario ativando no mesmo
--     aparelho TROCA o dono da inscricao; nao acumula);
--   * desativar     — delete escopado ao dono (Perfil > Notificacoes);
--   * expirar       — push service responde 404/410 no envio e o backend
--     remove a row (prune). Sem cron de limpeza.

CREATE TABLE "push_subscription" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- 1 inscricao por endpoint (o endpoint ja identifica aparelho+navegador).
CREATE UNIQUE INDEX "uq_push_subscription_endpoint" ON "push_subscription"("endpoint");

-- Envio: busca todas as inscricoes dos usuarios-alvo.
CREATE INDEX "idx_push_subscription_user" ON "push_subscription"("user_id");

ALTER TABLE "push_subscription"
  ADD CONSTRAINT "push_subscription_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
