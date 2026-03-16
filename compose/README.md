# Compose Canonico

Arquivos canonicos introduzidos na Fase 1:

1. `compose/development.yml`
2. `compose/internal-production.yml`

Convencoes desta fase:

1. Ambientes reais: `development` e `internal-production`.
2. Cada arquivo canonico usa `name:` proprio para isolar containers, redes e volumes.
3. `internal-production` usa `APP_PORT=3001` e `INTERNAL_PRODUCTION_DB_PORT=55433` como defaults canonicos para coexistir com `development` no mesmo host.
4. O banco de `internal-production` fica exposto apenas em `127.0.0.1` no modelo canonico para suportar operacao host-side sem exposicao na LAN.
5. Os arquivos legados da raiz (`docker-compose.yml` e `docker-compose.prod.yml`) continuam preservados por compatibilidade.

Limite desta fase:

1. Ainda existe duplicacao transitória entre os arquivos canonicos e os legados.
2. A consolidacao final do fluxo de Compose fica para a Fase 2.
