# Env Examples Canonicos

Status: Ponteiro local  
Escopo: localizar os env examples oficiais por ambiente  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Operacao-e-Runtime.md`

## Arquivos oficiais

1. `env/examples/development.env.example` -> copiar para `.env.development`
2. `env/examples/internal-production.env.example` -> copiar para `.env.internal-production`
3. `env/examples/internal-production.ops.env.example` -> copiar para `.env.internal-production.ops`
4. `env/examples/cloud-homolog.env.example` -> copiar para `.env.cloud-homolog`
5. `env/examples/cloud-homolog.ops.env.example` -> copiar para `.env.cloud-homolog.ops`

## Regra

1. esses arquivos suportam os ambientes `development`, `cloud-homolog` e `internal-production`;
2. `.env.example`, `.env.prod.example` e `.env.homolog.example` continuam apenas como compatibilidade legada.
