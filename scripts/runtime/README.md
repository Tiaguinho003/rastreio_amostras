# Runtime Canonico

Status: Ponteiro local  
Escopo: localizar os wrappers oficiais de runtime para `development`  
Ultima revisao: 2026-04-09  
Documentos relacionados: `docs/Operacao-e-Runtime.md`

## Wrappers oficiais

1. `scripts/runtime/compose.sh`
2. `scripts/runtime/migrate.sh`
3. `scripts/runtime/seed.sh`
4. `scripts/runtime/smoke.sh`
5. `scripts/runtime/preflight.sh`

## Regra

1. os wrappers devem ser usados apenas dentro do fluxo descrito em `docs/Operacao-e-Runtime.md`;
2. `development` usa `.env.development`;
3. `cloud-production` nao usa esses wrappers; o fluxo canonico fica em `scripts/gcp/` e `docs/Deploy-e-Cloud-Build.md`.
