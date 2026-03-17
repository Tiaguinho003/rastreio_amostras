# Rastreio Interno de Amostras

Sistema fullstack para rastreio interno de amostras, com fluxo operacional de recebimento, registro, QR, classificacao, laudo, autenticacao e administracao de usuarios.

## Visao geral

O projeto roda como um monolito modular em Next.js, com frontend e API no mesmo repositorio. O fluxo principal cobre:

1. recebimento da amostra;
2. registro manual com geracao de lote interno;
3. impressao ou reimpressao de QR;
4. classificacao com foto obrigatoria e rascunho parcial;
5. laudo PDF para amostras classificadas;
6. consulta, historico append-only e ajustes auditados;
7. autenticacao, recuperacao de senha e administracao de usuarios.

## Modulos principais

- `app/`: telas e route handlers do Next.js App Router.
- `src/samples/`: regras de negocio das amostras, estados e eventos.
- `src/users/` e `src/auth/`: usuarios, sessoes, auditoria e recuperacao de acesso.
- `src/reports/`: geracao de laudo PDF.
- `prisma/`: schema e migrations do PostgreSQL.
- `compose/`, `env/examples/`, `scripts/runtime/`, `scripts/gcp/`: runtime canonico por ambiente.

## Stack

- Next.js 15 + React 19 + TypeScript
- Prisma + PostgreSQL
- Route handlers internos em `app/api`
- JSON Schema + Ajv para contrato de eventos
- `pdf-lib` para laudos
- `nodemailer` com SMTP ou outbox local

## Comecando em development

1. Instale dependencias:

```bash
npm install
```

2. Copie o env canonico:

```bash
cp env/examples/development.env.example .env.development
```

3. Suba o banco:

```bash
scripts/runtime/compose.sh development up -d db
```

4. Aplique migrations e seed inicial:

```bash
scripts/runtime/migrate.sh development
scripts/runtime/seed.sh development
```

5. Suba a aplicacao:

```bash
npm run dev
```

6. Rode validacoes operacionais quando precisar:

```bash
scripts/runtime/preflight.sh development
scripts/runtime/smoke.sh development
```

## Documentacao oficial

1. [`docs/README.md`](docs/README.md): indice canonico e trilhas de leitura.
2. [`docs/Produto-e-Fluxos.md`](docs/Produto-e-Fluxos.md): escopo funcional, papeis, estados e regras.
3. [`docs/Arquitetura-Tecnica.md`](docs/Arquitetura-Tecnica.md): stack, servicos, dados e limites tecnicos.
4. [`docs/Operacao-e-Runtime.md`](docs/Operacao-e-Runtime.md): ambientes, envs, compose, scripts e operacao.
5. [`docs/Homologacao-Google-Cloud.md`](docs/Homologacao-Google-Cloud.md): runbook canonico da homologacao em Cloud Run.
6. [`docs/API-e-Contratos.md`](docs/API-e-Contratos.md): rotas, contratos, eventos e validacao.

## Observacoes importantes

- Os ambientes canonicos sao `development`, `cloud-homolog` e `internal-production`.
- O fluxo de registro atual e manual; OCR automatico permanece fora do escopo implementado.
- A trilha de auditoria das amostras e append-only por `SampleEvent`.
- O repositorio ainda preserva alguns artefatos legados de compatibilidade, mas a autoridade documental agora esta concentrada nos arquivos acima.
