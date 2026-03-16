# Runtime Canonico

Wrappers canonicos introduzidos na Fase 1:

1. `scripts/runtime/compose.sh`
2. `scripts/runtime/migrate.sh`
3. `scripts/runtime/seed.sh`
4. `scripts/runtime/smoke.sh`
5. `scripts/runtime/preflight.sh`
6. `scripts/runtime/backup.sh`

Padrao de uso:

```bash
scripts/runtime/compose.sh development up -d db
scripts/runtime/migrate.sh development
scripts/runtime/seed.sh development

scripts/runtime/compose.sh internal-production up -d --build
scripts/runtime/migrate.sh internal-production
scripts/runtime/seed.sh internal-production
scripts/runtime/smoke.sh internal-production
scripts/runtime/preflight.sh internal-production
scripts/runtime/backup.sh internal-production
```

Observacoes:

1. Estes wrappers priorizam os arquivos canonicos introduzidos na Fase 1.
2. `development` usa `.env.development` como caminho canonico e ainda aceita `.env` como fallback legado.
3. `internal-production` usa `.env.internal-production` e pode receber um overlay `.env.internal-production.ops`.
4. `smoke` e `preflight` agora derivam `API_BASE_URL`, `UPLOADS_DIR` e `DATABASE_URL` do contexto canonico quando isso ja for possivel.
5. `backup.sh` e o caminho canonico para backup operacional por ambiente.
6. Em `internal-production`, o backup de banco usa o servico `db` do Compose por padrao, sem depender de `pg_dump` instalado no host.
