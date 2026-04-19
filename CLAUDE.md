# CLAUDE.md — amostras-safras

Este arquivo configura o Claude Code para trabalhar neste repositorio.

## Skills

O projeto possui skills em `.claude/skills/` que o Claude Code carrega automaticamente:

### Backend e operacao

- `conventions` — padroes de codigo, commits, quality gates, seguranca
- `prisma` — schema, migrations, seed, drift check, regras do event store
- `tests` — como rodar, como adicionar, estrutura e padroes de teste
- `deploy` — ambientes, deploy canary para producao, troubleshoot

### Frontend e UI

- `design-system` — linguagem visual da PWA (cores, cards, tipografia, botoes, modais, checklist)
- `responsive` — responsividade mobile-first (clamp, safe areas, checklist de validacao)

### Processo

- `skill-maintenance` — checklist pos-sessao para manter skills sincronizadas com o codigo

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

# Deploy (manual, canary em producao)
scripts/gcp/build-image.sh cloud-production
scripts/gcp/deploy-cloud.sh cloud-production --canary
```

## Regras obrigatorias

1. **Nunca** fazer `--amend` ou `--force-push` em `main`.
2. **Nunca** editar migrations existentes em `prisma/migrations/`.
3. **Nunca** hardcodar secrets em codigo.
4. **Nunca** fazer deploy sem commit (working tree deve estar limpo).
5. Uploads devem validar magic bytes (JPEG/PNG/WebP apenas).
6. O event store (SampleEvent) e append-only. Triggers no banco impedem UPDATE/DELETE (ver skill `prisma` para detalhes).
7. Commits atomicos tematicos. Mensagem: `tipo(escopo): descricao`.

## Manutencao de skills

As skills em `.claude/skills/` documentam padroes e convencoes do projeto. Elas devem se manter sincronizadas com o codigo.

### Regra de auto-atualizacao

Apos qualquer mudanca que altere algo documentado em uma skill, **atualizar a skill no mesmo commit ou no commit seguinte**. Exemplos de mudancas que disparam atualizacao:

- Migracao de ferramenta (ex: ESLint 8→9, Jest→Vitest)
- Mudanca de estrutura de pastas
- Novo padrao de teste ou nova categoria
- Mudanca em scripts npm
- Mudanca em configuracao de deploy
- Adicao/remocao de modelo no Prisma schema

### Como verificar

Antes de finalizar uma sessao que modificou codigo, rodar mentalmente:

1. "Alguma skill faz afirmacao sobre algo que eu mudei?"
2. Se sim: atualizar a skill
3. Se nao tem certeza: ler os SKILL.md das skills potencialmente afetadas

### Principio de referencia

Skills devem **referenciar** o codigo em vez de **duplicar** dados que mudam. Exemplo:

- **Sim**: "Event types definidos em `enum SampleEventType` no `prisma/schema.prisma`"
- **Nao**: "25 event types no SampleEventType"

## Documentacao

- `docs/README.md` — indice canonico de toda a documentacao
- `docs/SECURITY.md` — politica de seguranca e runbook de incidente
- `docs/Deploy-e-Cloud-Build.md` — guia completo de deploy
- `SECURITY.md` (raiz) — como reportar vulnerabilidades
