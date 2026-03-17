# Runtime Canonico

Status: Ponteiro local  
Escopo: localizar os wrappers oficiais de runtime  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Operacao-e-Runtime.md`

## Wrappers oficiais

1. `scripts/runtime/compose.sh`
2. `scripts/runtime/migrate.sh`
3. `scripts/runtime/seed.sh`
4. `scripts/runtime/smoke.sh`
5. `scripts/runtime/preflight.sh`
6. `scripts/runtime/backup.sh`

## Regra

1. os wrappers devem ser usados apenas dentro do fluxo descrito em `docs/Operacao-e-Runtime.md`;
2. `development` usa `.env.development`;
3. `internal-production` usa `.env.internal-production` e pode carregar `.env.internal-production.ops`;
4. `cloud-homolog` nao usa esses wrappers; o fluxo canonico fica em `scripts/gcp/` e `docs/Homologacao-Google-Cloud.md`.
