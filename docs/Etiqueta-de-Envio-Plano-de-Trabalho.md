# Etiqueta de Envio — Plano de Trabalho

**Status**: Fases 1–6 **deployadas em prod** (2026-06-18, rev `00354-pid`). URL pública do QR resolvida via **Firebase Hosting** (`safras-negocios-laudo.web.app`, site criado + verificado, sessão 7). Falta: deploy do app (env `REPORT_PUBLIC_BASE_URL`) + atualizar o print agent no cliente + validar QR no print real. Adiado (não bloqueia): revogação manual UI + reimpressão.
**Escopo**: documento único de organização, análise, decisões e execução de um **novo tipo de etiqueta** — a **Etiqueta de Envio** — gerada quando uma amostra é enviada, contendo informações específicas do envio e um **QR code que abre publicamente o PDF do laudo do lote**, sem que o leitor precise de acesso ao sistema.

**Como ler este doc**: a seção **Decisões fechadas** é o que está acordado; **Pendências** é o que ainda não foi decidido; **Arquitetura proposta** é o desenho corrente (muda conforme as decisões); **Log de sessões** é o histórico de avanços por data.

**Princípio**: construído colaborativamente em formato pergunta → resposta → registro. Implementação só começa depois que as decisões de um bloco estiverem fechadas. Este doc **referencia** o código em vez de duplicar dados que mudam.

---

## Contexto

Hoje o sistema imprime dois tipos de etiqueta:

1. **Etiqueta de amostra** (`buildLabel` em `print-agent/label.js`) — com QR code cujo valor é o `internalLotNumber` (ou `id`). O QR serve para **busca interna** pela câmera do app (`app/camera/page.tsx`) e **exige login** para resolver. Ver `app/samples/[sampleId]/page.tsx` (`qrValue`).
2. **Etiqueta de Aprovação** (antiga "Etiqueta avulsa" — `buildCustomLabel` / `CustomLabelPrintCard.tsx`) — etiqueta livre com campos editáveis, sem QR, impressa pela fila desacoplada `CustomPrintJob`.

A nova demanda é uma terceira etiqueta, a **Etiqueta de Envio**: quando o operador envia fisicamente uma amostra a um cliente/comprador, imprime-se uma etiqueta com dados do envio e um QR que, ao ser escaneado pelo destinatário (que **não tem acesso ao sistema**), abre **apenas o PDF do laudo** daquele lote.

**Objetivo desta feature:**

1. **Enxertar** a Etiqueta de Envio no fluxo de envio físico **que já existe** (não é um novo tipo de _amostra_, nem um "enviar" construído do zero — ver "Estado atual do domínio").
2. Disponibilizar o laudo do lote via QR para um leitor externo, sem login, servindo somente o PDF.
3. Garantir segurança (link não-adivinhável, revogável, expirável) e auditoria, sem violar o event store append-only.

---

## Estado atual do domínio (resumo para ancorar decisões)

Síntese verificada no código em 2026-06-17. Detalhes nas referências.

### O fluxo de "Enviar amostra" **já existe** (achado da sessão 2)

A feature **não constrói** o envio — ele já está implementado e é event-sourced. A Etiqueta de Envio se **acopla** a ele:

- **Eventos**: `PHYSICAL_SAMPLE_SENT` / `PHYSICAL_SAMPLE_SEND_UPDATED` / `PHYSICAL_SAMPLE_SEND_CANCELLED` (`prisma/schema.prisma`), payload `{ recipientClientId, recipientClientSnapshot, sentDate }`.
- **UI**: modal "Enviar amostra" / "Editar envio de amostra" em `app/samples/[sampleId]/page.tsx` (form a partir de ~4088).
- **API**: `POST/PATCH/DELETE /api/v1/samples/{id}/physical-send` → `recordPhysicalSampleSent` etc. (`src/samples/sample-command-service.js:3597+`).
- **Gate de status**: `PHYSICAL_SEND_ALLOWED_STATUSES = ['REGISTRATION_CONFIRMED', 'CLASSIFIED']` (`sample-command-service.js:42`) — dá para enviar **antes** de classificar.
- **Multi-destinatário = N envios**: o modal coleta vários destinatários e o handler faz **um POST por cliente** num loop (`app/samples/[sampleId]/page.tsx:1197`). Cada destinatário já é um `PHYSICAL_SAMPLE_SENT` próprio → encaixa 1:1 com "uma etiqueta por destinatário" (D9).
- **Timeline**: `components/samples/SampleMovementsPanel.tsx` já mescla venda/perda/envio/laudo.

### Laudo PDF e classificação

- **Geração** (`src/reports/sample-pdf-report-service.js`, `exportSamplePdf` → `renderSamplePdf`): server-side via `pdf-lib`.
- **Pré-requisitos**: `sample.status === 'CLASSIFIED'` **e** anexo `CLASSIFICATION_PHOTO`.
- **A foto é obrigatória para classificar**: `completeClassification` lança 409 sem ela (`sample-command-service.js:2159`). Logo **CLASSIFIED ⟹ laudo sempre possível** — não existe "classificada sem laudo". A regra do QR fica **binária** (ver D4).
- **Campos fixos**: o laudo usa `SAMPLE_EXPORT_FIELDS_FOR_REPORT` (`export-fields.js`) — o operador **nunca escolheu** quais campos entram. O único input além do destinatário é a **safra, e só quando a amostra é liga**.
- **Destinatário no PDF**: o laudo imprime o destinatário no cabeçalho (`sample-pdf-report-service.js:371`); quando `destination` é nulo, a linha é **omitida** nativamente. Por isso "1 PDF por destinatário" sai natural (cada PDF leva o nome daquele destinatário), e enviar sem destinatário também funciona.
- **Liga (safra múltipla)**: exige escolher **uma** safra (`reportedHarvest`) via `components/samples/ReportHarvestSelectModal.tsx`; o laudo nunca imprime a string concatenada de safras (anti-vazamento). Validação backend em `export-fields.js`.
- **O PDF NÃO é persistido hoje** — é gerado, transmitido (`app/api/v1/samples/[sampleId]/export/pdf/route.ts`, stream `attachment`) e descartado. Só o checksum sobrevive (evento `REPORT_EXPORTED`).
- **Regeneração** é livre (sem idempotência); cada export gera novo checksum.

### Infra

- **Autenticação** (`middleware.ts`): sessão é JWT no cookie `rastreio_session`; já existe `PUBLIC_PATH_PREFIXES` (login, auth, health, assets) — **padrão pronto** para adicionar `/laudo`.
- **Storage**: disco local via `UPLOADS_DIR` (`src/uploads/local-upload-service.js`). **Não há GCS.** As fotos de classificação já vivem aí — o PDF congelado usa o mesmo mecanismo, **sem infra nova**.
- **Precedente de tabela desacoplada**: `CustomPrintJob` (fila da Etiqueta de Aprovação) — padrão de tabela própria, fora do event store, com handlers inline em `src/api/v1/backend-api.js`.
- **QR atual**: codifica texto puro (`internalLotNumber`), uso interno, resolvido só com sessão. Não é reaproveitável para link público (seria enumerável). A Etiqueta de Envio precisa de um builder novo cujo QR carrega a **URL pública completa**.

---

## Decisões fechadas

| #   | Decisão                                                                   | Detalhe                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | É um **novo tipo de etiqueta**, não de amostra                            | "Enviar" é uma **ação** sobre uma amostra existente; não muda o `model Sample`.                                                                                                                          |
| D2  | Laudo do QR **congelado no envio**                                        | No momento do envio gera-se o PDF e **persiste-se os bytes** (em `UPLOADS_DIR`). O destinatário sempre vê exatamente o que foi enviado.                                                                  |
| D3  | Link **revogável**, token no banco                                        | Token aleatório (32 bytes) em tabela própria `SampleReportShare`, com `revokedAt`. Permite revogar e auditar.                                                                                            |
| D4  | **A etiqueta sempre é gerada; o QR é condicional** _(revisa o D4 antigo)_ | Enviar **sempre** imprime a etiqueta (D5). O **QR só entra se a amostra está `CLASSIFIED`** (laudo possível). Sem classificação → etiqueta **sem QR**, evitando que o leitor escaneie e não acesse nada. |
| D5  | Impressão **automática** ao confirmar o envio                             | Confirmar o envio já enfileira a(s) etiqueta(s) no print agent; não é um passo separado. Reimpressão segue possível (token/PDF ficam salvos).                                                            |
| D6  | QR abre o **PDF direto**                                                  | A rota pública faz stream do PDF (`application/pdf`) no caminho feliz; sem landing intermediária.                                                                                                        |
| D7  | Link **expira em 30 dias**                                                | `expiresAt = issuedAt + 30 dias`. Combina com a revogação (D3/D8).                                                                                                                                       |
| D8  | Cancelar o envio **revoga o token**                                       | `PHYSICAL_SAMPLE_SEND_CANCELLED` seta `revokedAt` no share correspondente. Mantém envio e link em sincronia.                                                                                             |
| D9  | **Uma etiqueta/token/PDF por destinatário**                               | Cada `PHYSICAL_SAMPLE_SENT` (já é 1 por destinatário) gera 1 snapshot próprio. O PDF leva o nome **daquele** destinatário.                                                                               |
| D10 | Link inválido → **página HTML mínima**                                    | Expirado/revogado serve uma página simples com a marca ("Este laudo não está mais disponível"). Não é erro cru nem landing completa — só o caso de erro.                                                 |

---

## Arquitetura proposta (corrente)

### Fluxo ponta a ponta

```
[Operador]  Amostra em REGISTRATION_CONFIRMED ou CLASSIFIED → modal "Enviar amostra"
     │        (se liga + CLASSIFIED: escolhe a safra via ReportHarvestSelectModal)
     │        confirma envio com 1+ destinatários
     │
     │   Para CADA destinatário:
     │     ├─ registra PHYSICAL_SAMPLE_SENT  (fluxo que já existe)
     │     ├─ se a amostra está CLASSIFIED:
     │     │     ├─ gera o laudo PDF (reusa renderSamplePdf) com o nome do destinatário + safra escolhida
     │     │     ├─ SALVA os bytes em UPLOADS_DIR (+ checksumSha256)
     │     │     ├─ cria SampleReportShare (token 32B, expiresAt = +30d, vínculo ao sendEventId)
     │     │     └─ QR = https://<dominio>/laudo/<token>
     │     │   senão: etiqueta SEM QR
     │     └─ enfileira impressão da Etiqueta de Envio (print agent)
     │
[Destinatário]  Escaneia o QR
     │     GET /laudo/<token>  (rota PÚBLICA)
     │       token válido        → stream do PDF (application/pdf)
     │       revogado/expirado   → página HTML mínima "laudo indisponível" (D10)
     │
[Cancelamento]  Cancelar o envio (PHYSICAL_SAMPLE_SEND_CANCELLED)
           → seta revokedAt no share daquele envio (D8)
```

### Modelo de dados (1 tabela nova — desacoplada do event store)

`SampleReportShare`:

| campo                                         | papel                                                        |
| --------------------------------------------- | ------------------------------------------------------------ |
| `token` (único, indexado)                     | identificador não-adivinhável que vai no QR                  |
| `sampleId`                                    | amostra de origem                                            |
| `sendEventId`                                 | vínculo ao `PHYSICAL_SAMPLE_SENT` (1 share por destinatário) |
| `recipientClientId` + `recipientSnapshot`     | destinatário congelado no snapshot                           |
| `storagePath` + `checksumSha256` + `fileName` | o PDF congelado em `UPLOADS_DIR`                             |
| `reportedHarvest`                             | safra escolhida (quando liga)                                |
| `issuedByUserId` / `issuedAt`                 | auditoria de emissão                                         |
| `expiresAt` (= `issuedAt` + 30d)              | expiração (D7)                                               |
| `revokedAt` (nullable)                        | revogação (D3/D8)                                            |
| `accessCount` / `lastAccessedAt` (opcional)   | analytics de leitura                                         |

Não toca `SampleEvent` (append-only). A auditoria do snapshot vive no próprio share; se manter o `REPORT_EXPORTED` por share é detalhe de implementação (ver Pendências).

### Peças a construir

1. **Tabela `SampleReportShare`** (migration nova) — desacoplada do event store, no padrão `CustomPrintJob`.
2. **Persistir o PDF no envio** → variante de `exportSamplePdf` que grava os bytes em `UPLOADS_DIR` e devolve `storagePath` (hoje só transmite e descarta).
3. **Orquestração no envio** (`recordPhysicalSampleSent` ou camada acima): para cada envio `CLASSIFIED`, gera PDF + cria share + monta QR; **enfileira a etiqueta sempre** (com ou sem QR).
4. **Rota pública** `GET /laudo/[token]` → valida token, checa `revokedAt`/`expiresAt`, faz stream do PDF; serve a página mínima (D10) se inválido. Adicionar `/laudo` ao `PUBLIC_PATH_PREFIXES` (`middleware.ts`).
5. **Builder `buildShippingLabel`** no print agent (`print-agent/label.js`) com os campos do envio + QR condicional (URL pública completa).
6. **Revogação** → `cancelPhysicalSampleSend` seta `revokedAt`; botão "Revogar laudo" na timeline de envios (P7), para os mesmos papéis que registram envio.
7. **Safra no envio** → reusar `ReportHarvestSelectModal` quando (liga + CLASSIFIED).

### Segurança

- Token aleatório de 32 bytes → enumeração/brute force inviável.
- Link público = **qualquer um com o QR vê o laudo** (sem controle por destinatário). Coerente com entregar o laudo ao comprador; `revokedAt` (D8) e `expiresAt` (D7) são as saídas.
- Rate-limit leve por IP na rota pública (defesa em profundidade) — **P5**.

---

## Pendências (restantes)

O grosso foi resolvido na sessão 2. Sobram detalhes de layout/implementação:

| #        | Pergunta em aberto                                                                        | Status / Notas                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Campos e **layout** da Etiqueta de Envio impressa.                                        | Proposta inicial: logo + lote interno + destinatário + data de envio + sacas + safra + QR (quando CLASSIFIED). Refinar com `scripts/preview-*.mjs`. |
| P5       | **Rate-limit** e logs de acesso na rota pública.                                          | Leve, por IP. A implementar.                                                                                                                        |
| P-impl-1 | Registrar (ou não) `REPORT_EXPORTED` por share no envio.                                  | Auditoria já fica no share. Decidir na implementação se mantém o evento (timeline) ou não, para não poluir.                                         |
| P-impl-2 | Editar destinatário de um envio com link ativo: **bloquear troca** ou regenerar snapshot. | Default proposto: snapshot é imutável; trocar destinatário = cancelar (revoga) + novo envio. Confirmar na implementação.                            |

**Resolvidas**: P2 (expira em 30d — D7), P3 (PDF direto — D6), P4 (ação = envio existente), P6 (safra via `ReportHarvestSelectModal`), P7 (revogação na timeline), P8 (reenvio = novo token/snapshot; reimpressão reusa), P9 (`SampleReportShare` / `/laudo/[token]` / `buildShippingLabel`).

---

## Para a Etiqueta de Envio + QR funcionarem em produção

As fases 1–6 **já estão deployadas em produção** (2026-06-18, rev `00354-pid` / SHA `a7e9466`, migrate job rodado). O fluxo do destinatário (`/laudo/<token>` → PDF) e a revogação automática (D8) já estão no ar. **Na feature em si não falta nada pré-deploy** — falta só rodar o deploy do app (com a env nova) e os passos físicos do print:

1. **URL pública do QR — RESOLVIDA** (commits `782a492` + `e62c202`, sessão 7). O QR codifica `${REPORT_PUBLIC_BASE_URL}/laudo/<token>` (env nova; fallback `APP_BASE_URL`). O domínio é um site **dedicado** do Firebase Hosting (`safras-negocios-laudo.web.app`) que faz rewrite só de `/laudo/**` pro Cloud Run — detalhes/manutenção na seção **"Hospedagem da URL pública do laudo"** abaixo. **Site criado e rewrite verificado**; falta só o **deploy do app** (canary) pra a env entrar no Cloud Run e os novos envios usarem o domínio. (Sem o deploy o QR cai no fallback `APP_BASE_URL` = URL do Cloud Run, que também funciona.)
2. **Atualizar o print agent no PC do cliente** (Windows) — **DEPOIS** do deploy do backend (GOTCHA). Copiar **`print-agent/poller.js`** (consome `shipping-print`: `pollShippingCycle`) + **`print-agent/label.js`** (`buildShippingLabel`) **juntos** + restart. **NÃO** precisa copiar logo (a etiqueta usa o logo grande `logo-data.js`, já presente desde a etiqueta de amostra), **NEM** `npm install` (o QR é TSPL `QRCODE`, não o pacote `qrcode`), **NEM** mudar config/`.env` do agente. Sem isso a etiqueta de envio **não imprime** (a fila enche, ninguém consome). `buildShippingLabel` é **síncrono** — sem a pegadinha async/await da avulsa, mas copie os 2 juntos porque o `poller.js` importa `buildShippingLabel` do `label.js`.
3. **Validar no print real** (Elgin L42 Pro): (a) layout aprovado e (b) o **QR em byte mode** (`QRCODE ...,B,...`) escaneia num celular e abre o laudo. Só o print real confirma na firmware (fallback: modo `A`/auto).

### Features adiadas (não bloqueiam o QR — gestão pós-MVP)

- **Revogação manual** (P7): a revogação automática no cancelamento do envio já existe (D8). Falta o botão "Revogar laudo" na timeline para revogar **sem** cancelar o envio.
- **Reimpressão** da etiqueta: re-enfileirar um `ShippingPrintJob` com o MESMO token/share (sem gerar novo PDF), via botão na timeline.
- Ambas exigem **expor o share na timeline**: incluir `reportShares` no `getSampleDetail` + cruzar por `sendEventId` em `projectSendHistoryItems` (`page.tsx`) + botões no `SampleMovementsPanel` + os endpoints de revogar/reimprimir.

## Hospedagem da URL pública do laudo (Firebase Hosting)

**Por que existe:** o QR precisa de uma URL HTTPS que abra **só o PDF** do laudo, sem expor o app interno e sem custo. Em vez de domínio próprio (pago), usamos um site **dedicado** do Firebase Hosting que faz _proxy_ (rewrite) só de `/laudo/**` pro Cloud Run.

**Arquitetura (como foi feito):**

- Domínio: `https://safras-negocios-laudo.web.app` (subdomínio grátis, SSL automático, free tier).
- Site Firebase Hosting `safras-negocios-laudo`, **no mesmo projeto GCP do Cloud Run** (`safras-amostras-prod`). ⚠️ O rewrite Firebase→Cloud Run é **same-project** — por isso rodamos `firebase projects:addfirebase safras-amostras-prod` (habilitar Firebase no projeto GCP que já existia). **Não** dá pra usar o projeto `site-safras` (site institucional, projeto separado).
- Config no repo: **`firebase.json`** (target `laudo`; rewrite `/laudo/**` → `run: { serviceId: rastreio-prod-app, region: southamerica-east1 }`; header `Cache-Control: no-store`; **sem catch-all** → todo resto cai no 404 estático); **`.firebaserc`** (target `laudo` → site); **`public-laudo/404.html`** (404 da marca; dir DEDICADO, **não** o `public/` do Next, pra não expor assets do app no domínio).
- QR: `buildLaudoReportUrl` (`src/api/v1/backend-api.js`) usa `REPORT_PUBLIC_BASE_URL` (fallback `APP_BASE_URL`). A env vem de `.env.cloud-production` (gitignored) e **precisa** estar no `runtime_env_vars_csv` (`scripts/gcp/_lib.sh`) — o deploy usa `--set-env-vars` (substitui o conjunto inteiro), senão a env some a cada deploy.
- **Isolamento:** o app (login/dashboard/APIs) **não** é alcançável pelo domínio web.app — só `/laudo/**`. O app segue na URL do Cloud Run (`APP_BASE_URL`, auto-setada no deploy).

**Por que `no-store` é crítico:** o laudo é **revogável** (D8). Se o CDN do Firebase cacheasse o PDF, um laudo cancelado continuaria abrindo. A rota já manda `Cache-Control: no-store` (`route.ts`) e o `firebase.json` reforça. **Teste de regressão:** enviar → escanear (200) → cancelar envio → escanear → tem que dar **410** (não PDF cacheado).

**Comandos (quem tem auth Google Owner no projeto; na raiz do repo):**

```bash
firebase projects:addfirebase safras-amostras-prod                          # 1x: habilita Firebase no projeto GCP
firebase hosting:sites:create safras-negocios-laudo --project safras-amostras-prod
firebase target:apply hosting laudo safras-negocios-laudo --project safras-amostras-prod
firebase deploy --only hosting:laudo --project safras-amostras-prod         # re-rodar a cada mudança no firebase.json/404
```

Verificação: `curl -s …/laudo/zzz` → "Laudo não encontrado" (veio do Cloud Run); `curl -s …/dashboard` → "Página não encontrada" (404 estático = app não exposto); header `cache-control: no-store`.

**Como AJUSTAR no futuro:**

- **Trocar pra domínio próprio** (`laudo.suamarca.com.br`): mapear o domínio no Firebase (Console → Hosting → Add custom domain + TXT de verificação) e mudar `REPORT_PUBLIC_BASE_URL` pra ele (env **runtime, sem rebuild**) + redeploy do app pra a env valer. O `firebase.json` não muda.
- **Mudar o que o site expõe / headers**: editar `firebase.json` + `firebase deploy --only hosting:laudo` (não precisa deploy do app).
- **Trocar o subdomínio web.app**: `hosting:sites:create` (novo) + `target:apply` + atualizar `.firebaserc` + `REPORT_PUBLIC_BASE_URL` + redeploy do app.
- `.firebase/` (cache local do CLI) é gitignored.

## Log de sessões

### 2026-06-17 — Sessão 1 (inicial)

- Levantamento do estado atual (laudo PDF, QR atual, auth, storage, precedentes). Confirmado: PDF não é persistido hoje; storage é disco local via `UPLOADS_DIR`; não existe conceito de link público.
- Fechadas as decisões D1–D4 (versão inicial).
- Desenhada a arquitetura proposta inicial e aberto o backlog P1–P9.

### 2026-06-17 — Sessão 2

- **Achado central**: o fluxo de envio físico (`PHYSICAL_SAMPLE_SENT`) **já existe** e é event-sourced (modal, API POST/PATCH/DELETE, timeline). A feature **enxerta** etiqueta + laudo congelado + token nesse fluxo; não constrói "enviar" do zero. A peça 3 do plano foi reescrita nesse sentido.
- **Foto obrigatória para classificar** (`completeClassification:2159`) ⟹ `CLASSIFIED` sempre tem laudo ⟹ regra do QR vira binária. **Revisou o D4**: a etiqueta sempre imprime; o QR é condicional ao `CLASSIFIED` (resposta do usuário à P de gate).
- **Multi-destinatário já é 1 envio por cliente** (loop em `page.tsx:1197`) ⟹ **D9** (1 share/token/PDF por destinatário, com o nome no PDF).
- **Laudo tem campos fixos** e só pede safra quando liga ⟹ gerar no envio não adiciona telas, exceto o `ReportHarvestSelectModal` para ligas (P6).
- Fechadas **D5** (impressão automática), **D6** (PDF direto), **D7** (expira em 30 dias), **D8** (cancelar revoga), **D9** (1 por destinatário), **D10** (página mínima de indisponível).
- Defaults aceitos: revogação manual na timeline; reenvio = novo token; edição não regenera; rate-limit leve; nomes `SampleReportShare` / `/laudo/[token]` / `buildShippingLabel`.
- Próximo passo: protótipo — começar pela **base** (migration `SampleReportShare` + variante de `exportSamplePdf` que persiste os bytes), depois rota pública e builder.

### 2026-06-18 — Sessão 3 (passos 1-2 + fase 3)

- **Passos 1-2 commitados**: tabela `SampleReportShare` (migration manual, por causa do drift preexistente) + `SamplePdfReportService.persistSampleReportPdf` (núcleo `_buildReportArtifacts` extraído; `exportSamplePdf` com comportamento inalterado).
- **Fase 3 implementada** (orquestração do envio com laudo congelado):
  - `recordPhysicalSampleSentWithReport` no command service: evento `PHYSICAL_SAMPLE_SENT` + `SampleReportShare` **atômicos** via `appendEventBatch` + `beforeCommit` (helper novo `PrismaEventStoreTx.createReportShare`). Token 32B, expiração 30d. **Não** registra `REPORT_EXPORTED` — resolve **P-impl-1** (a auditoria vive no share).
  - Handler `recordPhysicalSampleSent` (`backend-api.js`) bifurca por status: `CLASSIFIED` gera o PDF (fora da tx) + share + enfileira etiqueta **com** QR; `REGISTRATION_CONFIRMED` só registra + etiqueta **sem** QR. Falha de geração do PDF = 409 atômico (nada gravado).
  - **Fila incluída na fase 3** (decisão do usuário): tabela `ShippingPrintJob` (migration manual) + enqueue best-effort + endpoints `GET /shipping-print/pending` + `POST /shipping-print/result`. O print agent que consome + o builder TSPL `buildShippingLabel` ficam na **fase 5**.
  - **Fase 7 dobrada**: modal de envio reusa `ReportHarvestSelectModal` quando a amostra é liga (>1 safra) + `CLASSIFIED`; `recordPhysicalSampleSent` (api-client) passou a enviar `reportedHarvest`.
  - Teste `tests/physical-send-report-share.integration.test.js` (4 casos: CLASSIFIED com share+PDF+job, REGISTRATION_CONFIRMED sem share, multi-destinatário, foto sumida 409 atômico). Suite de integração completa verde (278) + todos os gates.
- Restam: **fase 4** (rota pública `/laudo/[token]` + página mínima de indisponível), **fase 5** (builder TSPL + consumo no print agent), **fase 6** (revogação na timeline). Pendências menores: **P1** (layout da etiqueta), **P5** (rate-limit). ⚠️ `APP_BASE_URL` em produção precisa ser o domínio real (hoje `placeholder.invalid`) para o QR funcionar.

### 2026-06-18 — Sessão 4 (fase 4: rota pública do laudo)

- **Fase 4 implementada** (rota pública `GET /laudo/[token]`, sem login):
  - Handler `servePublicReportShare` (`backend-api.js`): valida o token (64 hex), checa `revokedAt` → 410 (D8) / `expiresAt` → 410 (D7), devolve os bytes do PDF congelado (via `reportService.readPersistedReport`, método novo) e incrementa `accessCount`/`lastAccessedAt` (best-effort). Rate-limit leve por IP (`publicReportRateLimiter`, 60/min — resolve **P5**).
  - Rota Next `app/laudo/[token]/route.ts`: token válido → PDF **inline** (D6: abre no navegador); inválido → página HTML mínima de indisponível (D10), com a marca, distinguindo 404 (não encontrado) / 410 (revogado/expirado) / 429 (rate-limit).
  - `/laudo` adicionado ao `PUBLIC_PATH_PREFIXES` (`middleware.ts`) — escapa do gate de manutenção (o middleware não força login fora disso).
  - Teste de integração (4 casos novos): serve o PDF por token válido (checksum bate + `accessCount`), 404 (inexistente/malformado), 410 (revogado), 410 (expirado). Todos os gates verdes; os 8 testes da feature passam.
- **Marco**: com a fase 4, o QR já abre o laudo ponta a ponta (caminho do destinatário). Restam **fase 5** (builder TSPL `buildShippingLabel` + consumo da fila no print agent) e **fase 6** (revogação).

### 2026-06-18 — Sessão 5 (fase 5: etiqueta física no print agent)

- **Print agent organizado**: removidos 13 previews PNG/SVG órfãos (etiqueta de Aprovação); só código/config sobrou.
- **Token base64url** (32B → 43 chars, em vez de 64 hex): encurta a URL do QR → QR v4 mais robusto. Ajuste em `recordPhysicalSampleSentWithReport` + na validação de `servePublicReportShare` (`^[A-Za-z0-9_-]{43}$`) + teste.
- **Builder `buildShippingLabel`** (`print-agent/label.js`): arquitetura limpa (`buildShippingLabelLayout` calcula + serializa), espelhando `buildCustomLabel`. Layout aprovado pelo usuário: logo topo-esquerda + LOTE em destaque + ENVIO/SAFRA/SACAS em 3 colunas + QR à direita com "LAUDO" (só quando CLASSIFIED; senão sem QR). **SEM destinatário** (decisão do usuário). QR em **byte mode** (`B`) para as minúsculas da URL; `formatYmd` corrige o fuso da data date-only.
- **Preview** `scripts/preview-shipping-label.mjs` (+ `qrcode` devDep): gera PNGs com o QR real (3 variantes), gitignorados.
- **Consumo no print agent** (`print-agent/poller.js`): `pollShippingCycle` + `processShippingJob` + `reportShippingResult` + `fetchPendingShippingJobs`, espelhando a fila avulsa; chamado em `pollCycle`; reusa dedup/retry.
- Gates verdes (os testes da feature passam; 2 falhas alheias na suite são do outro agente). Smoke test do builder: QR em byte mode, sem QR quando ausente.
- **Marco**: a etiqueta de envio agora imprime ponta a ponta. ⚠️ `APP_BASE_URL` em prod precisa do domínio real antes do QR funcionar.

### 2026-06-18 — Sessão 6 (fase 6: revogação automática)

- **Revogação automática (D8)**: `cancelPhysicalSampleSend` agora revoga o `SampleReportShare` do envio **atomicamente** (via `appendEventBatch` + `beforeCommit` + helper `PrismaEventStoreTx.revokeReportShareBySendEvent`). Cancelar o envio → o destinatário deixa de acessar o laudo (a rota pública passa a 410). Teste de integração novo cobre o fluxo (envio → 200 → cancela → 410). Sem share (envio não-CLASSIFIED) é no-op.
- Revogação **manual** (P7) e **reimpressão** ficaram como pendências (ver "Para funcionar em produção") — exigem UI na timeline + expor o share, e o foco aqui foi fechar o D8 sem conflitar com o outro agente na `page.tsx`.
- Registrado o **checklist de produção** (APP_BASE_URL real, deploy, atualizar o print agent no cliente, validar o QR no print real).

### 2026-06-18 — Sessão 7 (URL pública do laudo via Firebase Hosting)

- **Decisão de hospedagem** (pesquisa de opções grátis→barato): escolhido **Firebase Hosting** com subdomínio grátis `*.web.app` (SSL grátis, infra Google, free tier). Descartados: Freenom/TLDs grátis (mortos desde 2024, ligados a phishing), Load Balancer do Cloud Run (~US$18/mês), e o domain mapping nativo do Cloud Run (preview, não-recomendado). Domínio próprio fica adiável (trocar = só mudar `REPORT_PUBLIC_BASE_URL` + mapear no Firebase).
- **Implementado** (commits `782a492` feat + `e62c202` docs-skill + `2b9bfa6`/`47edcc8` chores): env dedicada **`REPORT_PUBLIC_BASE_URL`** pro QR (fallback `APP_BASE_URL`; adicionada ao `runtime_env_vars_csv` do `_lib.sh` senão o `--set-env-vars` a dropa); `firebase.json` + `.firebaserc` + `public-laudo/404.html`. Detalhes na seção "Hospedagem da URL pública do laudo".
- **Site criado**: `firebase projects:addfirebase safras-amostras-prod` (rewrite é same-project → não dava pra usar `site-safras`) → `hosting:sites:create safras-negocios-laudo` → `target:apply` → `deploy --only hosting:laudo`. Conta `measyia@gmail.com` é Owner do projeto.
- **Verificado** via curl: `/laudo/zzz` → "Laudo não encontrado" (Cloud Run, rewrite OK); `/dashboard` → "Página não encontrada" (404 estático, **app não exposto**); header `cache-control: no-store` (revogação-safe).
- **Análise de risco**: `APP_BASE_URL` só é usado no QR + `metadataBase` (cosmético); e-mail não usa links. `next.config.mjs` (CSP `frame-ancestors 'none'` + `X-Frame-Options`) é inofensivo pra PDF em navegação top-level (só afeta iframe) — **não mudou**. Rate-limit lê `x-forwarded-for` → funciona atrás do proxy.
- **Falta**: deploy do app (canary) pra `REPORT_PUBLIC_BASE_URL` entrar em prod e os QRs usarem o domínio; depois, atualizar o print agent (`poller.js`+`label.js`) no cliente; depois, validar o QR no print real.
