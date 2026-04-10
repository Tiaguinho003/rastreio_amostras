# CLAUDE.md — rastreio-interno-amostras

Este arquivo configura o Claude Code para trabalhar neste repositorio.

## Skills

O projeto possui skills em `.claude/skills/` que o Claude Code carrega automaticamente:

### Backend e operacao

- `conventions` — padroes de codigo, commits, quality gates, seguranca
- `prisma` — schema, migrations, seed, drift check, regras do event store
- `tests` — como rodar, como adicionar, estrutura e padroes de teste
- `deploy` — ambientes, Cloud Build, deploy hml/prod, troubleshoot

### Frontend e UI

- `design-system` — linguagem visual da PWA (cores, cards, tipografia, botoes, modais, checklist)
- `responsive` — responsividade mobile-first (clamp, safe areas, checklist de validacao)

## Comandos essenciais

```bash
# Dev
npm run dev                    # Next.js dev server
npm run db:up                  # PostgreSQL local via Docker
npm run prisma:migrate:deploy  # Aplicar migrations
npm run db:seed                # Seed inicial

# Quality gates (todos devem passar antes de push)
npm run lint                   # ESLint
npm run format:check           # Prettier
npm run typecheck              # TypeScript
npm run build                  # Next.js build
npm run validate:schemas       # JSON Schema validation
npm run test:contracts         # Testes de contrato
npm run test:unit              # Testes unitarios
npm run test:integration:db    # Testes de integracao (requer DB)

# Deploy
git push origin main           # Deploya hml automaticamente
```

## Regras obrigatorias

1. **Nunca** fazer `--amend` ou `--force-push` em `main`.
2. **Nunca** editar migrations existentes em `prisma/migrations/`.
3. **Nunca** hardcodar secrets em codigo.
4. **Nunca** fazer deploy sem commit (working tree deve estar limpo).
5. Uploads devem validar magic bytes (JPEG/PNG/WebP apenas).
6. O event store (SampleEvent) e append-only. O trigger `fn_prevent_sample_event_mutation` impede mutacao.
7. Commits atomicos tematicos. Mensagem: `tipo(escopo): descricao`.

## Documentacao

- `docs/README.md` — indice canonico de toda a documentacao
- `docs/SECURITY.md` — politica de seguranca e runbook de incidente
- `docs/Deploy-e-Cloud-Build.md` — guia completo de deploy
- `SECURITY.md` (raiz) — como reportar vulnerabilidades
