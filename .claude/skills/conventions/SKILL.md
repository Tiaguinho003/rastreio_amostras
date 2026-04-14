---
name: conventions
description: Use this skill when writing or reviewing any code in this project. Defines coding standards, commit conventions, file organization, and quality gates.
---

## Linguagem e runtime

- Node >= 22 (`.nvmrc`). TypeScript 5.9, compilado pelo Next.js.
- ESM (`"type": "module"` no package.json). Imports com extensao `.js` para arquivos em `src/`.
- Backend em JS puro (`.js`) com JSDoc types. Frontend em `.tsx`/`.ts`.

## Estrutura de pastas

- `app/` — telas e route handlers (Next.js App Router)
- `components/` — componentes React compartilhados
- `lib/` — tipos TS, schemas de formulario, cliente HTTP, utilitarios UI
- `src/api/` — API framework-agnostic (backend-api.js)
- `src/samples/` — dominio de amostras (command + query services)
- `src/users/`, `src/auth/` — usuarios, sessoes, roles, auditoria
- `src/events/` — event store append-only + validacao de contratos
- `src/contracts/` — event-validator, schema-loader
- `src/reports/` — laudos PDF (pdf-lib)
- `src/uploads/` — upload com magic bytes validation
- `src/email/` — email via SMTP ou outbox
- `src/clients/` — dominio de clientes
- `src/db/` — Prisma client singleton
- `tests/` — testes na raiz (nao em `__tests__/`)
- `prisma/` — schema + migrations + seed
- `scripts/runtime/` — wrappers operacionais (compose, migrate, seed, preflight, smoke)
- `scripts/gcp/` — deploy canary, build, preflight, smoke
- `docs/` — documentacao canonica
- `print-agent/` — agent de impressao (Node.js separado, roda no Windows do cliente)

## Padroes de codigo

- Indent: 2 espacos (`.editorconfig`)
- Prettier formata tudo (default 80 cols)
- ESLint 9 com flat config (ver `eslint.config.mjs` para regras e extensoes)
- Nomes de arquivo: kebab-case para `.js`/`.ts`, PascalCase para componentes React
- Nomes de variavel: camelCase. Enums Prisma: UPPER_SNAKE_CASE

## Commits

- Formato: `tipo(escopo): descricao curta` — ex: `fix(auth): handle expired session on login`
- Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `style`
- Commits atomicos tematicos. Nunca mega-commits que misturam temas.
- **NUNCA** `--amend` ou `--force-push` em `main`

## Quality gates (CI bloqueante)

Todos devem passar antes de qualquer push:

1. `npm run lint` — 0 errors, 0 warnings
2. `npm run format:check` — exit 0
3. `npm run typecheck` — exit 0
4. `npm run build` — exit 0
5. `npm run validate:schemas` — exit 0
6. `npm run test:contracts` — verde
7. `npm run test:unit` — verde
8. `npm run test:integration:db` — verde (requer PostgreSQL local via Docker)

## Padroes de seguranca

- Nunca hardcodar secrets em codigo. Usar env vars + Secret Manager.
- Uploads: sempre validar magic bytes (file-type), restringir a JPEG/PNG/WebP.
- Inputs: usar normalizers no service layer.
- SQL: sempre Prisma parameterized ou tagged templates (`$queryRaw`). Nunca string concat.
- Headers HTTP: configurados em `next.config.mjs`. Nao remover sem justificativa.
- Rate limiting: `src/auth/rate-limiter.js` (10 req/min por IP).
