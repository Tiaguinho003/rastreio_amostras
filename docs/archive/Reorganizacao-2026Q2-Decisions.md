# Decisoes da Reorganizacao Q2 2026

> **Arquivo historico.** Este documento registra as 14 decisoes tomadas durante a reorganizacao
> do projeto rastreio-interno-amostras (abril 2026, 9 passes). Serve como referencia para
> entender o porque de decisoes arquiteturais e de processo.
>
> Para o estado atual do projeto, consulte `docs/README.md`.

## ADR-001: Modelo de trabalho Cowork + Claude Code

O Cowork (humano) analisa o estado do repositorio, planeja a reorganizacao e escreve prompts estruturados. O Claude Code executa cada passe seguindo os prompts, com commits atomicos e validacoes entre cada bloco. Esse modelo garante rastreabilidade e permite revisao humana antes de cada push.

## ADR-002: Sanitizacao sem rotacao de segredos

Passes 1-2 sanitizaram o repositorio (remocao de dead code, features descontinuadas, docs obsoletos) sem rotacionar secrets. O historico git foi verificado: nenhum secret foi commitado (`.env*` e `.mcp.json` sempre estiveram no `.gitignore`). Rotacao nao necessaria.

## ADR-003: Modelo de negocio SaaS B2B

O sistema opera como SaaS B2B onde a Measy hospeda tudo (Cloud Run + Cloud SQL + Cloud Storage). O aparato on-premise (`internal-production`) foi eliminado. Nao ha instalacao local em clientes.

## ADR-004: Consolidacao de documentacao

23 documentos antigos foram removidos e seu conteudo consolidado em 6 documentos canonicos: Produto-e-Fluxos, Arquitetura-Tecnica, Operacao-e-Runtime, API-e-Contratos, Documentation-Inventory, e Homologacao-Google-Cloud. Inventario registrado em `docs/Documentation-Inventory.md`.

## ADR-005: Dead code — remocao moderada

Remove codigo comprovadamente morto (features deletadas, imports orfaos, componentes sem referencia). Codigo ambiguo (que pode ter uso futuro nao-obvio) e sinalizado mas nao removido, para evitar regressao.

## ADR-006: Warehouse legacy removido apos validacao empirica

Os campos `warehouseId` e `declaredWarehouse` do schema `registration-confirmed.payload.schema.json` foram removidos apos validacao empirica em hml e prod (cloud-sql-proxy + psql): 0 eventos usavam esses campos. O event-validator so valida no APPEND (nunca no READ), entao leitura de eventos antigos nao e afetada.

## ADR-007: ESLint legacy config, CI bloqueante

ESLint 8 com legacy config (`.eslintrc.json`, nao flat config). Prettier 3 integrado via `eslint-config-prettier`. CI bloqueante para lint e format em `.github/workflows/contracts.yml`. Decisao consciente de nao migrar para flat config neste momento.

## ADR-008: Commits atomicos em main

Cada passe produz commits atomicos tematicos diretamente em `main`. Sem feature branches para a reorganizacao (repositorio single-dev neste momento). Cada commit e auto-contido e validado (`npm test` entre commits).

## ADR-009: Prisma drift zero

Verificado no Passe 5A que nao ha drift entre o schema Prisma e os bancos de dev, hml e prod. `prisma migrate diff` retorna vazio nos tres ambientes. Baseline confirmado antes de qualquer mudanca de schema futura.

## ADR-010: Cobertura via node --test + c8

Framework de testes: `node --test` nativo (Node 22). Coverage via `c8` (devDependency). Sem meta numerica de cobertura — o foco e cobrir caminhos criticos (event sourcing, auth, roles), nao percentual. Nao migrar para vitest/jest.

## ADR-011: Testes de contrato com JSON Schema

Testes de contrato em `tests/event-contract.test.js` validam os JSON schemas em `docs/schemas/events/v1/` usando `EventValidator` (Ajv). Testes de integracao usam PostgreSQL real via Docker (`test:integration:db`). O CI roda tudo com servico Postgres 16 dedicado.

## ADR-012: 3 gaps de teste fechados no Passe 6B

Gap 1: teste de rejeicao de `warehouseId`/`declaredWarehouse` no schema (nao-regressao). Gap 2: teste de transicao ilegal de status (fromStatus incompativel = 409). Gap 3: testes diretos de `assertRoleAllowed` e `isKnownRole`. Todos fechados com commits atomicos.

## ADR-013: Security — LGPD debito, rate limit middleware, Dependabot

LGPD e debito documentado (tensao event-sourcing x direito de exclusao, 11 eventos em prod, risco baixissimo). Rate limiting implementado como middleware Next.js (Map + sliding window, 10 req/min por IP). Dependabot semanal para npm + GitHub Actions. Audit log via event store existente (13 event types de UserAuditEvent). Headers HTTP: HSTS, CSP, Permissions-Policy, poweredByHeader off. Upload: magic bytes via file-type. Password enforcement: 403 quando PENDING.

## ADR-014: Docs combinados e skills

Passe 7D e Passe 8 foram combinados num unico prompt (docs de seguranca + docs gerais). ADRs vivem apenas no Cowork (nao no repo como arquivos individuais). CLAUDE.md na raiz configura o Claude Code. Skills em `.claude/skills/` cobrem conventions, prisma, tests, deploy, design-system e responsive. Sem CHANGELOG retroativo (o git log e a fonte de verdade).
