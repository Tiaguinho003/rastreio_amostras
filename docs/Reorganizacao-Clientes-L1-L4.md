# Reorganizacao Clientes — L1-L4 (TEMPORARIO)

Status: Temporario — **DELETAR ao concluir L4**
Escopo: planejamento e acompanhamento da reorganizacao da base de clientes
(auditoria + reset destrutivo + import via planilha) antes de continuar
registrando amostras.
Documentos relacionados: `docs/Clientes-e-Movimentacoes-Especificacao.md`,
`docs/API-e-Contratos.md`, `.claude/skills/prisma/SKILL.md`.

> **Aviso:** este documento existe apenas durante a execucao das fases L1–L4.
> Ao concluir L4 ele deve ser deletado no mesmo commit que finaliza a fase, junto
> com qualquer artefato em `tmp/` gerado pela execucao.

---

## 1. Contexto e motivacao

Apos as fases F7 (cliente↔filial) e F8 (remocao da feature legacy backfill),
o sistema esta funcionalmente solido mas a **base de dados de clientes em
prod tem inconsistencias historicas** (ex.: CNPJs sinteticos `33333333…`
detectados em F7, clientes incompletos, vinculos imprecisos).

O usuario tem uma **planilha mestre** (~600 linhas; sera filtrada para os
principais) com os clientes que devem existir. A decisao operacional foi:

1. **Auditar** a logica de clientes (read-only, sem mexer);
2. **Backup estruturado** das 58 amostras existentes (para o usuario
   re-cadastrar manualmente depois);
3. **Reset destrutivo** de clientes + amostras + dependentes;
4. **Wizard de import** que recria os clientes a partir da planilha.

Refactor de amostras (liga, tipos, subtipos) **nao faz parte deste plano** —
fica para depois que a base de clientes estiver consistente.

---

## 2. Estado pre-execucao em prod

Snapshot capturado antes do inicio (referencia para validacao pos-execucao):

| Tabela                 | Linhas                           |
| ---------------------- | -------------------------------- |
| `client`               | 36 (30 PJ + 6 PF)                |
| `client_branch` ATIVAS | 35                               |
| `sample`               | 58 (todas LIVE; A-5562 → A-5619) |
| `sample_event`         | 489                              |
| `sample_attachment`    | 44 (fotos de classificacao)      |
| `print_job`            | 85                               |
| `sample_movement`      | 0                                |
| `client_audit_event`   | varios (manter em backup mental) |

Ultima revisao em prod no momento do plano: `7880571`.

---

## 3. Regras nao-negociaveis

1. **Logica de amostras nao muda nesta janela.** Schema e service de
   `sample/sample_event/sample_attachment/print_job` ficam intactos.
2. **F7 (cliente↔filial) permanece valida.** PJ admite 1 branch ativa,
   PF admite 0..N. Trigger DB e validacoes service ficam.
3. **Auto modes do harness nao apagam dados sem confirmacao explicita
   do usuario** (regra do auto mode + memoria
   `feedback_no_deploy_without_commit` + politica de prod).
4. **Push e responsabilidade do usuario.** Eu posso comitar/buildar/deployar
   mas nao executo `git push` (memoria `feedback_push_is_user_only`).
5. **Quality gates obrigatorios** antes de qualquer commit/deploy:
   `lint`, `format:check`, `typecheck`, `build`, `validate:schemas`,
   `test:contracts`, `test:unit`, `test:integration:db`.

---

## 4. Fase L1 — Auditoria read-only de clientes

### Objetivo

Conferir, sem alterar nada, que a logica de clientes esta solida o suficiente
para ser preservada no reset. Caso contrario, ajustar antes de L3 para nao
herdar o mesmo problema apos a planilha entrar.

### Escopo

- **Schema Prisma:** modelo `Client`, `ClientBranch`,
  `ClientCommercialUser`, `ClientAuditEvent`, indices, constraints, triggers
  (`enforce_pj_single_active_branch`, `chk_client_person_type_fields`,
  invariante de `client_commercial_user`).
- **Service layer:** `src/clients/client-service.js`,
  `src/clients/client-support.js` — validacoes PJ_BRANCH_LIMIT, normalizadores
  (`normalizeCreateClientInput`, `normalizeCreateBranchInput`),
  `lookupClients`, `resolveOwnerBinding`, `resolveBuyerBinding`,
  `assertCpfAvailable`, `assertCnpjRootAvailable`,
  `assertBranchCnpjAvailable`.
- **API routes:** `app/api/v1/clients/**` — endpoints, contratos, validacao
  de input.
- **Frontend:** `app/clients/[clientId]/page.tsx`,
  `components/clients/ClientLookupField.tsx`,
  `components/clients/ClientBranchModal.tsx`,
  `components/clients/ClientQuickCreateModal.tsx` — fluxo PF/PJ,
  terminologia contextualizada (Fazenda/Filial/Matriz), banner empty state.
- **Tests:** `tests/client-backend.integration.test.js`,
  `tests/client-support.test.js`, `tests/normalize-classifiers.test.js`
  (parte de clientes).
- **Estado em prod (read-only):** sanity de cada um dos 36 clients atuais
  (PFs sem branch, PJs com matriz, CNPJs com checksum, CPFs validos,
  duplicidades, audit events historicos).

### Entregaveis

Documento em prosa (~400-600 palavras, no chat) com:

- Pontos solidos confirmados.
- Inconsistencias reais detectadas (com gravidade: bloqueante / atencao /
  cosmetico).
- Recomendacao final: prosseguir para L2 ou ajustar logica antes.

### Criterio de done

Usuario confirma que pode prosseguir para L2 sem mudancas, ou autoriza um
PR de correcao antes.

---

## 5. Fase L2 — Backup estruturado das 58 amostras

### Objetivo

Antes de apagar amostras em L3, produzir artefato local que permita ao
usuario re-cadastrar manualmente as amostras com fidelidade aos dados
historicos. Inclui referencia das fotos no Cloud Storage para download
manual.

### Formato dos backups (em `tmp/`, gitignored)

1. **`tmp/samples-backup.json`** — array com cada amostra contendo:
   - identidade: `id`, `internalLotNumber` (A-XXXX), `originLot`, `status`
   - declarado: `declaredOwner`, `declaredHarvest`, `declaredSacks`,
     `declaredLocation`
   - datas: `receivedAt`, `classifiedAt`, `createdAt`, `updatedAt`
   - classificacao: `latestColorAspect`, `latestNotes`,
     `latestDensity`, demais campos persistidos em `sample`
   - vinculo cliente (snapshot textual): `ownerClientName`,
     `ownerClientPersonType`, `ownerBranchCnpj`, `ownerBranchCity`,
     `ownerBranchState`
   - midia: `attachments[]` com `id`, `kind`, `storagePath`, `originalName`,
     `sizeBytes`, `uploadedAt`
2. **`tmp/samples-backup.csv`** — versao planilha com as mesmas colunas
   (sem `attachments`); para abrir no Excel.
3. **`tmp/samples-backup-attachments.csv`** — uma linha por foto:
   `sampleId, internalLotNumber, attachmentId, kind, storagePath,
originalName`.
4. **`tmp/gsutil-download-script.sh`** — script pronto com `gsutil cp` por
   foto (referenciando o bucket de prod). Usuario executa local com
   credencial dele para baixar fotos para uma pasta `~/amostras-backup/`.

### Geracao do backup

Procedimento (read-only no banco de prod, via cloud-sql-proxy):

```bash
# 1. proxy ja deve estar up (porta 5434)
# 2. rodar script local que monta JSON/CSV agregado
node scripts/audits/samples-export.mjs > tmp/samples-backup.json
# (script auxiliar a ser criado nesta fase; nao toca em dados)
```

**Atencao a permissoes:** dump de dados de prod requer aprovacao explicita
do usuario; default do harness pode bloquear (visto em F8A). Quando
solicitar, o usuario aprova caso a caso.

### Criterio de done

- 3 arquivos em `tmp/` confirmados.
- Conteudo bate com snapshot da secao 2 (58 amostras, 44 attachments).
- Usuario confirma que conseguiu **abrir o JSON/CSV** e **baixar pelo
  menos 1 foto** via `gsutil` antes de prosseguir para L3.

---

## 6. Fase L3 — Reset destrutivo de clientes + amostras

### Objetivo

Apagar em prod todos os clientes, amostras e dependentes — preservando
schema, triggers, indices e a logica F7. Sistema fica com **DB vazio** mas
**funcional**.

### Migration nova (sem tocar schema)

`prisma/migrations/<TS>_l3_reset_clients_and_samples/migration.sql`:

```sql
-- L3: reset destrutivo de clientes + amostras + dependentes em prod.
-- Pre-requisitos:
--   * L2 ja gerou backup estruturado em tmp/.
--   * Usuario confirmou backup (samples-backup.json, csv, fotos baixadas).
--   * Schema F7/F8 preservado.

-- Desabilita triggers append-only para permitir DELETE em
-- sample_event e client_audit_event.
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" DISABLE TRIGGER "trg_sample_event_prevent_update";
ALTER TABLE "client_audit_event" DISABLE TRIGGER "trg_reject_client_audit_event_delete";
ALTER TABLE "client_audit_event" DISABLE TRIGGER "trg_reject_client_audit_event_update";

-- Ordem respeita FKs (filhos antes de pais).
DELETE FROM "sample_movement";
DELETE FROM "print_job";
DELETE FROM "sample_attachment";
DELETE FROM "sample_event";
DELETE FROM "sample";

DELETE FROM "client_audit_event";
DELETE FROM "client_branch";
DELETE FROM "client_commercial_user";
DELETE FROM "client";

-- Reabilita triggers.
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_delete";
ALTER TABLE "sample_event" ENABLE TRIGGER "trg_sample_event_prevent_update";
ALTER TABLE "client_audit_event" ENABLE TRIGGER "trg_reject_client_audit_event_delete";
ALTER TABLE "client_audit_event" ENABLE TRIGGER "trg_reject_client_audit_event_update";

-- (Opcional) Reset das sequences code para comecar do 1 apos o reimport.
-- Decisao a confirmar com o usuario antes de incluir.
```

### Sequencia de deploy (canary padrao)

1. CI verde apos commit.
2. `scripts/gcp/build-image.sh cloud-production`.
3. `scripts/gcp/deploy-cloud.sh cloud-production --canary` (no traffic).
4. **Pausa para confirmacao explicita do usuario** antes do migrate.
5. `scripts/gcp/execute-job.sh migrate cloud-production` — aplica DELETE.
6. Validacao: `SELECT COUNT(*) FROM client; FROM sample; …` — todos zero.
7. Smoke do canary.
8. **Pausa para confirmacao** explicita pre-promote.
9. `gcloud run services update-traffic … --to-latest`.

### Estado pos-L3 (apenas DB)

- 0 clients, 0 branches, 0 samples, 0 events, 0 attachments, 0 print_jobs,
  0 client_audit_events.
- Schema 100% intacto (todos os models, enums, triggers, indices).
- Logica F7 + F8 preservada.
- Fotos no Cloud Storage **continuam intactas** apos L3 (storage e separado
  do banco). Limpeza fica para L3.5.

### Criterio de done

Counts em prod todos zero, app responde HTTP 200, fluxo de cadastro novo
funciona via UI (smoke manual: criar 1 cliente PJ + 1 PF).

---

## 6.4. Fase M1 — Modo manutencao (entre L3 e L3.5)

### Objetivo

Apos L3 deixar o DB sem clientes/amostras e antes do reimport L4 fechar
a base, todos os usuarios nao-ADMIN devem ver uma **pagina de manutencao**
amigavel ao tentar acessar o app, com **bloqueio total de interacao** por
touch/clique. ADMIN continua acessando normalmente para operar o reimport.

### Implementacao

1. **Pagina** `app/maintenance/page.tsx`: tela estatica com tema do design
   system (gradient verde de fundo, card creme central, logo Measy/Tubaiba),
   mensagem amigavel "Estamos atualizando o sistema. Voltaremos em breve.",
   sem botoes ou links — apenas conteudo informativo. CSS especifico bloqueia
   touch/scroll/seleccao via `touch-action: none`, `user-select: none`,
   `overflow: hidden` no body.
2. **Middleware Next.js** (`middleware.ts` na raiz): intercepta todas as
   requisicoes. Quando `process.env.MAINTENANCE_MODE === 'true'`:
   - Permite passar livre: `/maintenance`, `/login`, `/api/auth/*`,
     `/api/health/*`, assets `/_next/*`, `/icon-*`, `/favicon.ico`,
     `/manifest.json`, `/sw.js`, `/workbox-*`.
   - Decodifica o JWT do cookie `rastreio_session` (base64url puro, sem
     verificacao — apenas para checar role; verificacao real fica nas
     APIs server-side). Se `payload.role === 'ADMIN'` → segue normal.
   - Senao → 307 redirect para `/maintenance`.
   - Cookie ausente / decode falha → tratar como nao-ADMIN.
3. **CSS** em `app/globals.css`: classes `.maintenance-page`, `.maintenance-card`,
   `.maintenance-icon`, `.maintenance-title`, `.maintenance-message`,
   `.maintenance-footer` reaproveitando tokens do tema (gradient
   `--brand-green-*`, surface `--brand-cream-soft`, ink `--brand-green-ink`).

### Como ativar / desativar

- **Ativar**: `gcloud run services update rastreio-prod-app --update-env-vars=MAINTENANCE_MODE=true --project=safras-amostras-prod --region=southamerica-east1` (~30s, sem rebuild de imagem).
- **Desativar**: `gcloud run services update rastreio-prod-app --remove-env-vars=MAINTENANCE_MODE --project=safras-amostras-prod --region=southamerica-east1`.

### Sequencia operacional

1. Implementar M1 (commit + push + CI verde + build + deploy canary +
   migrate no-op + smoke + promote — modo manutencao **ainda OFF**).
2. **Ativar manutencao** via `gcloud run services update --update-env-vars`.
3. Confirmar com smoke: usuario nao-ADMIN ve `/maintenance`; ADMIN navega
   normal.
4. **Prosseguir com L3.5 (GCS cleanup) e L4 (import wizard)** com o app
   protegido.
5. Apos L4 finalizar, **desativar manutencao** via
   `gcloud run services update --remove-env-vars`.

### Criterio de done (ativacao)

- Login como ADMIN: app navega normal, todas as paginas renderizam.
- Login como CLASSIFIER (ou outro role): qualquer URL redireciona para
  `/maintenance` com bloqueio de touch/click/scroll.
- Login deslogado: tenta acessar / → redireciona para `/maintenance`
  (nem chega na `/login`). **Ajuste**: mantemos `/login` na whitelist
  para que o ADMIN consiga logar; ja deslogado.

### Riscos

- **Edge runtime do middleware** nao suporta libs Node-native; decode
  JWT precisa ser puro (base64url manual + JSON.parse). OK para
  esse uso (verificacao real fica nas APIs).
- **Falsa sensacao de seguranca**: o middleware so protege a UI, nao a
  API. Nao-ADMIN ainda pode chamar a API direto se tiver sessao valida.
  Aceitavel para manutencao temporaria; nao substitui autorizacao.

## 6.5. Fase L3.5 — Limpeza das fotos orfas no GCS

### Objetivo

Apos L3 deletar registros do banco, as 44 fotos no Cloud Storage ficam
**orfas** (bucket `gs://safras-amostras-prod-runtime/uploads/samples/`).
Apagar todas para fechar a limpeza ponta-a-ponta.

### Pre-requisito

Usuario confirmou que **baixou as 44 fotos via `bash tmp/gsutil-download-script.sh`**
e tem copia local em `~/amostras-backup/`.

### Comando

```bash
gsutil -m rm -r gs://safras-amostras-prod-runtime/uploads/samples/
```

Apaga toda a pasta `samples/` recursivamente. **Idempotente**: re-rodar
em pasta ja vazia retorna no-op (apenas warning).

### Alternativa mais conservadora

Se preferir manter cache temporario:

```bash
gsutil -m rm gs://safras-amostras-prod-runtime/uploads/samples/**
```

Apaga arquivos mas mantem hierarquia de pastas (sem `-r`).

### Criterio de done

- `gsutil ls gs://safras-amostras-prod-runtime/uploads/samples/` retorna vazio.
- Bucket continua acessivel (apenas `_temp/` e raiz `uploads/` preservadas).

### Riscos

- **Irreversivel sem backup local**: se usuario nao baixou as fotos antes,
  perda total. Por isso L3.5 so executa com confirmacao explicita.
- **Operacao destrutiva no GCP**: requer autorizacao via auto mode regra 5.

## 7. Fase L4 — Wizard de import via planilha

### Objetivo

Re-criar os clientes principais da planilha do usuario, validados (CPF/CNPJ
com checksum), respeitando F7 (PJ com 1 matriz / PF com 0..N fazendas),
idempotente (rerun = no-op).

### Formato esperado da planilha (CSV)

Usuario filtra a planilha mestre (~600 linhas) para os principais e exporta
um CSV. Colunas minimas:

| Coluna                     | Tipo                             | Obrigatoria                          | Observacao                          |
| -------------------------- | -------------------------------- | ------------------------------------ | ----------------------------------- |
| `personType`               | `PF` ou `PJ`                     | sim                                  | ditado pela presenca de CPF vs CNPJ |
| `fullName`                 | string                           | so PF                                |                                     |
| `legalName`                | string                           | so PJ                                |                                     |
| `tradeName`                | string                           | nao                                  |                                     |
| `cpf`                      | XXX.XXX.XXX-XX ou 11 digitos     | so PF (opcional na regra atual)      |                                     |
| `cnpj`                     | XX.XXX.XXX/XXXX-XX ou 14 digitos | so PJ (vai pra `client_branch.cnpj`) |                                     |
| `phone`                    | string                           | sim                                  | 10 ou 11 digitos                    |
| `isBuyer`                  | bool                             | sim                                  |                                     |
| `isSeller`                 | bool                             | sim                                  |                                     |
| `branchAddressLine`        | string                           | nao                                  |                                     |
| `branchDistrict`           | string                           | nao                                  |                                     |
| `branchCity`               | string                           | nao                                  |                                     |
| `branchState`              | UF                               | nao                                  |                                     |
| `branchPostalCode`         | CEP                              | nao                                  |                                     |
| `branchRegistrationNumber` | IE                               | nao                                  |                                     |

A definicao final do schema do CSV sera fechada com o usuario antes de
codar o wizard (a planilha mestre pode ter campos extras).

### Wizard (`scripts/migrations/l4-import-clients-wizard.mjs`)

- Le CSV via `node:fs` + parser (papaparse ou csv-parse).
- Para cada linha:
  - Valida CPF/CNPJ com checksum (reaproveita `lib/document-validation.ts`
    via export tambem em backend).
  - Para PJ: cria Client com `branches: [{ isPrimary: true, cnpj, ... }]`.
  - Para PF: cria Client com `branches: []` (fazendas viraao depois pela UI).
  - Idempotencia: `cpf` (PF) ou `cnpj` da matriz (PJ) ja existente => skip.
- Flags: `--dry-run` (default) e `--apply`. Sem prompts interativos por
  cliente (volume alto).
- Relatorio em `tmp/l4-import-report-<ts>.json`: created, skipped,
  validation_errors, skipped_reasons.

### Criterio de done

- Counts em prod batem com a planilha filtrada.
- Smoke: lookup de cliente por CNPJ/nome funciona, criacao manual via UI
  funciona, fluxo de "criar amostra com cliente existente" responde.

---

## 8. Riscos e mitigacoes

| Risco                            | Quando | Mitigacao                                                                        |
| -------------------------------- | ------ | -------------------------------------------------------------------------------- |
| Auditoria L1 detecta bug critico | L1     | Pausa o plano, abre PR de correcao antes de L3                                   |
| Backup L2 nao cobre tudo         | L2     | Pre-validacao do JSON/CSV pelo usuario antes de L3                               |
| Permissao bloqueia dump em L2    | L2     | Usuario aprova caso a caso (precedente F8A)                                      |
| DELETE em L3 erra ordem          | L3     | Migration testada local com DB de dev; backup do `_prisma_migrations` antes      |
| Wizard L4 cria duplicatas        | L4     | Idempotencia por CPF/CNPJ; dry-run obrigatorio antes de `--apply`                |
| Fotos nao sao baixadas           | L2     | Verificar com usuario que `gsutil cp` funcionou em pelo menos 1 foto antes de L3 |
| Sequences ficam altas pos-DELETE | L3     | Decidir explicitamente se reseta com `RESTART`                                   |

### Plano de rollback

- **L1**: read-only, nao precisa.
- **L2**: read-only, nao precisa.
- **L3**: irreversivel sem backup completo do banco. **Mitigacao**:
  pre-migrate, capturar `pg_dump --schema=public --no-owner --no-acl` em
  bucket privado da empresa (decisao a confirmar; nao incluido no plano
  default por ser dump de dados sensiveis).
- **L4**: rodar com `--dry-run` antes; se errar, `DELETE FROM client` no
  proprio wizard e re-rodar `--apply`.

---

## 9. Skill maintenance

Skills atualmente nao mencionam contagens nem dados especificos de cliente
(verificado pos-F8 com varredura `grep`). Apos L4, validar:

- `prisma/SKILL.md`: descricao do model `Client` e `ClientBranch` continua
  correta (a logica F7 nao muda).
- `tests/SKILL.md`: nenhuma menção a fixtures de cliente especificas;
  manter.
- `conventions/SKILL.md`: estrutura de pastas continua valida (nao deletamos
  pastas).

Caso L1 detecte algo a corrigir e o ajuste mude pontos de uma skill,
atualizar no mesmo commit do ajuste.

---

## 10. Critério de "feito" geral

A reorganizacao esta concluida quando:

1. L1 aprovado pelo usuario.
2. L2 backup validado (JSON aberto, CSV aberto, 1 foto baixada).
3. L3 aplicado em prod, todos os counts zero, schema preservado, app
   respondendo HTTP 200.
4. L4 import idempotente em prod, counts batem com a planilha filtrada,
   smoke de criacao de amostra com cliente existente passa.
5. Skills validadas pos-execucao.
6. **Este documento e os artefatos `tmp/` deletados** no commit final.

---

## 11. Limpeza pos-execucao (CRITICO)

Ao concluir L4, fazer no mesmo commit:

```bash
git rm docs/Reorganizacao-Clientes-L1-L4.md
rm -rf tmp/samples-backup.json tmp/samples-backup.csv
rm -rf tmp/samples-backup-attachments.csv tmp/gsutil-download-script.sh
rm -rf tmp/l4-import-report-*.json
# (tmp/ ja eh gitignored, entao 'git rm' so para o documento docs/)
```

E atualizar o `docs/README.md` apenas se este documento tiver sido
adicionado ao indice (nao foi — documento temporario nao entra no indice).

---

## 12. Tracking (atualizar conforme avancarmos)

| Fase                      | Status       | Commit/Deploy                              |
| ------------------------- | ------------ | ------------------------------------------ |
| L1 — Auditoria            | ✅ concluida | sem commit (read-only)                     |
| L2 — Backup               | ✅ concluida | sem commit (artefatos em tmp/, gitignored) |
| L3 — Reset                | ✅ concluida | `1b85620` em prod                          |
| M1 — Manutencao           | em andamento | —                                          |
| L3.5 — GCS cleanup        | pendente     | —                                          |
| L4 — Import               | pendente     | —                                          |
| M2 — Desativar manutencao | pendente     | —                                          |
| Limpeza                   | pendente     | —                                          |

## 13. Decisoes fechadas pos-L1

A auditoria L1 nao detectou bloqueantes. Confirmados pelo usuario para
inclusao no PR do L3:

1. **Bloquear troca de personType em `updateClient`** (item amarelo #1 da
   auditoria). Service rejeita 422 com mensagem em pt-BR quando o request
   tenta alterar `personType` de cliente existente. Workaround documentado:
   inativar cliente e criar novo do tipo correto. Custo: ~5 linhas service
   - 1 teste integration.
2. **Dropar tabelas/colunas `*_deprecated_2026q2`** na mesma migration L3
   (encerra a Phase 10 do plano F5.2). Inclui:
   - `DROP TABLE client_registration_deprecated_2026q2`
   - `ALTER TABLE client DROP COLUMN cnpj_deprecated_2026q2`
   - `ALTER TABLE client DROP COLUMN document_canonical_deprecated_2026q2`
   - `ALTER TABLE sample DROP COLUMN owner_registration_id_deprecated_2026q2`
   - `ALTER TABLE sample_movement DROP COLUMN buyer_registration_id_deprecated_2026q2`
   - `ALTER TABLE sample_movement DROP COLUMN buyer_registration_snapshot_deprecated_2026q2`

Recusados/postpostos:

- ❌ Modal guiado para conversao PF↔PJ (custo alto, frequencia baixa,
  workaround simples ja existe). Pode virar feature futura `M_x` se uso real
  justificar.
