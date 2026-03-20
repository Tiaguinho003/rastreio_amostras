# Checklist Homologacao Cloud Run

Status: Ativo  
Escopo: checklist operacional de pre-push, deploy e aceite funcional para `cloud-homolog` no Cloud Run  
Ultima revisao: 2026-03-20  
Documentos relacionados: `docs/Homologacao-Google-Cloud.md`, `docs/Clientes-e-Movimentacoes-Especificacao.md`, `docs/Operacao-e-Runtime.md`, `scripts/gcp/README.md`, `cloudbuild.homolog.yaml`

## Objetivo

Este checklist existe para reduzir risco antes de publicar uma nova revisao de homologacao no Google Cloud.

O deploy so deve seguir quando os itens bloqueantes estiverem validados.

## Gate 1 - Codigo pronto para homologacao

1. revisar o estado do workspace:

```bash
git status --short
```

2. confirmar que toda mudanca de banco necessaria esta versionada em `prisma/migrations/`.
3. confirmar que mudancas de contrato ou fluxo relevantes foram refletidas na documentacao do projeto quando aplicavel.
4. gerar o client do Prisma:

```bash
npm run prisma:generate
```

5. executar a validacao unitaria:

```bash
npm run test:unit
```

6. executar a validacao de integracao com banco:

```bash
npm run test:integration:db
```

7. nao seguir para push se houver falha em teste, migration pendente ou diff acidental.

## Gate 2 - Contexto de homologacao pronto

1. garantir que os arquivos de ambiente estao presentes:

```bash
cp env/examples/cloud-homolog.env.example .env.cloud-homolog
cp env/examples/cloud-homolog.ops.env.example .env.cloud-homolog.ops
```

2. revisar os valores de `.env.cloud-homolog` e `.env.cloud-homolog.ops`.
3. confirmar que os segredos abaixo existem no `Secret Manager`:
   `DATABASE_URL`, `AUTH_SECRET`, `BOOTSTRAP_ADMIN_FULL_NAME`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`.
4. confirmar que os recursos abaixo existem e sao acessiveis:
   `Artifact Registry`, `Cloud SQL`, bucket do runtime, service account e jobs de homologacao.
5. validar o contexto do Google Cloud:

```bash
scripts/gcp/preflight.sh
```

6. nao seguir para deploy se o preflight falhar.

## Gate 3 - Caminho de deploy escolhido

Escolher apenas um caminho por publicacao.

### Caminho A - Scripts manuais oficiais

1. publicar a imagem:

```bash
scripts/gcp/build-image.sh
```

2. implantar servico e jobs:

```bash
scripts/gcp/deploy-cloud-homolog.sh
```

3. executar migrations:

```bash
scripts/gcp/execute-job.sh migrate
```

4. executar seed quando necessario:

```bash
scripts/gcp/execute-job.sh seed
```

Use `seed` no primeiro deploy do ambiente, quando o bootstrap admin precisar ser recriado ou quando a estrategia operacional pedir isso.

### Caminho B - Cloud Build com `cloudbuild.homolog.yaml`

1. disparar o pipeline completo sem seed:

```bash
gcloud builds submit . \
  --config cloudbuild.homolog.yaml \
  --substitutions=_RUN_SEED=false
```

2. disparar o pipeline com seed apenas quando realmente necessario:

```bash
gcloud builds submit . \
  --config cloudbuild.homolog.yaml \
  --substitutions=_RUN_SEED=true
```

3. nao executar novamente `build`, `deploy` e `migrate` por fora se este caminho ja foi usado para a mesma revisao.

## Gate 4 - Verificacao operacional imediata

1. validar o smoke test HTTP:

```bash
scripts/gcp/smoke.sh
```

2. confirmar `200` em `/api/health/live`.
3. confirmar `200` em `/api/health/ready`.
4. confirmar que `database`, `uploads` e `emailOutbox` aparecem como `ok` no readiness.
5. confirmar login com usuario de homologacao conhecido.
6. confirmar que a lista de amostras responde apos login.
7. nao seguir para aceite funcional se o smoke falhar.

## Gate 5 - Aceite funcional bloqueante

### Clientes

1. acessar `/clients`.
2. criar um cliente vendedor.
3. criar uma inscricao ativa para esse cliente.
4. localizar o cliente por nome, documento e codigo.
5. editar o cliente e confirmar que a lista e o detalhe refletem a alteracao.

### Relacao cliente-amostra

1. acessar `/samples/new`.
2. confirmar que a tela exige selecao de `Proprietario` por cliente.
3. confirmar que nao e possivel concluir a criacao sem `ownerClientId`.
4. criar uma amostra nova vinculada a um cliente vendedor.
5. criar uma segunda amostra vinculada a um cliente vendedor com inscricao selecionada.
6. confirmar no detalhe da amostra que `Proprietario` e `Inscricao do proprietario` aparecem corretamente.
7. editar o proprietario da amostra no detalhe, informando motivo, e confirmar persistencia.
8. validar que o filtro por proprietario em `/samples` encontra a amostra correta.

### Registro e arquivos

1. criar amostra com foto de chegada.
2. confirmar que a foto aparece no detalhe.
3. seguir o fluxo ate classificacao e substituir a foto de classificacao.
4. exportar PDF da amostra classificada.
5. confirmar que os arquivos continuam disponiveis apos novo deploy do servico.

## Gate 6 - Aceite funcional recomendado

1. criar um cliente comprador.
2. registrar uma venda parcial para amostra classificada.
3. confirmar que o comprador fica vinculado a movimentacao correta.
4. confirmar recalculo de `commercialStatus`, `soldSacks`, `lostSacks` e saldo disponivel.
5. registrar uma perda e confirmar novo recalculo comercial.
6. verificar a trilha de eventos da amostra depois das mudancas de proprietario e movimentacoes.

## Gate 7 - Evidencias minimas da homologacao

1. guardar a revisao publicada: branch, commit ou tag.
2. guardar a URL do servico publicada.
3. guardar o resultado do `scripts/gcp/smoke.sh`.
4. guardar o id da execucao do job de migration.
5. guardar pelo menos um `sampleId` homologado com cliente vinculado.
6. guardar pelo menos um `clientId` vendedor e um `clientId` comprador usados no teste.

## Go / No-Go

### Go

1. testes locais obrigatorios passaram.
2. preflight GCP passou.
3. deploy e migration concluirem sem erro.
4. smoke passou.
5. a relacao cliente-amostra foi validada manualmente no ambiente publicado.

### No-Go

1. amostra nova ainda puder ser criada sem cliente proprietario.
2. proprietario exibido na amostra divergir do cliente selecionado.
3. filtro por proprietario nao localizar a amostra homologada.
4. readiness falhar em `database`, `uploads` ou `emailOutbox`.
5. upload de foto, exportacao de PDF ou persistencia de arquivos falhar apos deploy.
