-- #5 (Q-02 + Q-25): tabela idempotency_record para suporte a header
-- Idempotency-Key em POST /clients e POST /clients/:id/units.
--
-- Decisoes ancoradas em docs/Reset-Refatoracao-e-Reimport-Clientes.md §10
-- e §11:
--   * A1 — body diferente com mesma key: ignora body, retorna cached.
--   * B1 — cache TUDO (sucessos e erros 4xx/5xx).
--   * C1 — header opcional. Sem header processa normal sem cache.
--   * D2 — cleanup de records expirados deferido (sem cron job nesta fase;
--     index em expires_at deixa pronto para deletes posteriores).
--   * E1 — escopo: POST /clients e POST /clients/:id/units.
--   * T8 — scope inclui actorUserId em runtime: 'POST /clients:user-<id>'.
--     Defesa em profundidade contra leak entre usuarios em caso de
--     colisao de chave (improvavel com UUID v4 mas isolamos por seguranca).

CREATE TABLE "idempotency_record" (
  "id"            uuid PRIMARY KEY,
  "scope"         text NOT NULL,
  "key"           text NOT NULL,
  "status_code"   integer NOT NULL,
  "response_body" jsonb NOT NULL,
  "created_at"    timestamptz(6) NOT NULL DEFAULT NOW(),
  "expires_at"    timestamptz(6) NOT NULL
);

-- UNIQUE (scope, key) — garante 1 cache por escopo/chave + protege race
-- condition (insert concorrente da mesma key vira P2002 e fallback le o
-- record ja gravado).
CREATE UNIQUE INDEX "uq_idempotency_scope_key"
  ON "idempotency_record" ("scope", "key");

-- Index em expires_at para suportar cleanup futuro (D2 — quando criar
-- o cron job, query sera DELETE FROM idempotency_record WHERE expires_at < NOW()).
CREATE INDEX "idx_idempotency_expires"
  ON "idempotency_record" ("expires_at");
