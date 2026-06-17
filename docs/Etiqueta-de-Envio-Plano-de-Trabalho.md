# Etiqueta de Envio — Plano de Trabalho

**Status**: Em construção (iniciado em 2026-06-17, zero decisões herdadas).
**Escopo**: documento único de organização, análise, decisões e execução de um **novo tipo de etiqueta** — a **Etiqueta de Envio** — gerada quando uma amostra é enviada, contendo informações específicas do envio e um **QR code que abre publicamente o PDF do laudo do lote**, sem que o leitor precise de acesso ao sistema.

**Como ler este doc**: a seção **Decisões fechadas** é o que está acordado; **Pendências** é o que ainda não foi decidido; **Arquitetura proposta** é o desenho corrente (muda conforme as decisões); **Log de sessões** é o histórico de avanços por data.

**Princípio**: construído colaborativamente em formato pergunta → resposta → registro. Implementação só começa depois que as decisões de um bloco estiverem fechadas. Este doc **referencia** o código em vez de duplicar dados que mudam.

---

## Contexto

Hoje o sistema imprime dois tipos de etiqueta:

1. **Etiqueta de amostra** (`buildLabel` em `print-agent/label.js`) — com QR code cujo valor é o `internalLotNumber` (ou `id`). O QR serve para **busca interna** pela câmera do app (`app/camera/page.tsx`) e **exige login** para resolver. Ver `app/samples/[sampleId]/page.tsx:837` (`qrValue`).
2. **Etiqueta de Aprovação** (antiga "Etiqueta avulsa" — `buildCustomLabel` / `CustomLabelPrintCard.tsx`) — etiqueta livre com campos editáveis, sem QR, impressa pela fila desacoplada `CustomPrintJob`.

A nova demanda é uma terceira etiqueta, a **Etiqueta de Envio**: quando o operador envia fisicamente uma amostra a um cliente/comprador, imprime-se uma etiqueta com dados do envio e um QR que, ao ser escaneado pelo destinatário (que **não tem acesso ao sistema**), abre **apenas o PDF do laudo** daquele lote.

**Objetivo desta feature:**

1. Criar a Etiqueta de Envio como ação sobre uma amostra existente (não é um novo tipo de _amostra_, e sim de _etiqueta_).
2. Disponibilizar o laudo do lote via QR para um leitor externo, sem login, servindo somente o PDF.
3. Garantir segurança (link não-adivinhável, revogável) e auditoria, sem violar o event store append-only.

---

## Estado atual do domínio (resumo para ancorar decisões)

Síntese verificada no código em 2026-06-17. Detalhes nas referências.

**Geração do laudo PDF** (`src/reports/sample-pdf-report-service.js`, método `exportSamplePdf`):

- Gerado **server-side** via `pdf-lib` (`renderSamplePdf`).
- Exige `sample.status === 'CLASSIFIED'`.
- Exige anexo `CLASSIFICATION_PHOTO` presente no storage.
- Registra evento `REPORT_EXPORTED` no event store (com `checksumSha256`, `sizeBytes`, `destination`, `recipientClientId`, `reportedHarvest`).
- **O PDF NÃO é persistido hoje** — é gerado, transmitido (`app/api/v1/samples/[sampleId]/export/pdf/route.ts`, stream `attachment`) e descartado. Só o checksum sobrevive.
- **Liga (safra múltipla)**: exige escolher **uma** safra (`reportedHarvest`) — o laudo nunca imprime a string concatenada de safras (anti-vazamento). Em safra única fica `null`.

**QR code atual**: codifica texto puro (`internalLotNumber`), uso interno, resolvido só com sessão. Não é reaproveitável para link público (seria enumerável).

**Autenticação** (`middleware.ts`): sessão é JWT no cookie `rastreio_session`; as APIs se autodefendem (verificam assinatura). Já existe a lista `PUBLIC_PATH_PREFIXES` (login, auth, health, assets) — **padrão pronto** para adicionar uma rota pública nova.

**Storage de arquivos**: disco local via `UPLOADS_DIR` (`src/uploads/local-upload-service.js`, `uploadsBaseDir`). **Não há GCS.** As fotos de classificação já vivem nesse storage persistente — o PDF congelado pode usar o mesmo mecanismo, **sem infra nova**.

**Precedente de tabela desacoplada**: `CustomPrintJob` (fila da Etiqueta de Aprovação) mostra o padrão de tabela própria, fora do event store, com handlers inline em `src/api/v1/backend-api.js`.

**Não existe ainda**: nenhum conceito de token público / link compartilhável de laudo no código.

**Print agent** (`print-agent/label.js`): `buildLabel` (amostra, com `QRCODE`), `buildCustomLabel` (aprovação). A Etiqueta de Envio precisaria de um builder novo (ex.: `buildShippingLabel`) cujo QR carrega a **URL pública completa**.

---

## Decisões fechadas

| #   | Decisão                                        | Detalhe                                                                                                                                  |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | É um **novo tipo de etiqueta**, não de amostra | "Enviar" é uma **ação** sobre uma amostra existente; não muda o `model Sample`.                                                          |
| D2  | Laudo do QR é **congelado no envio**           | No momento do envio, gera-se o PDF e **persiste-se os bytes** (em `UPLOADS_DIR`). O destinatário sempre vê exatamente o que foi enviado. |
| D3  | Link **revogável**, token no banco             | Token aleatório guardado em tabela própria, com `revokedAt`. Permite revogar e auditar.                                                  |
| D4  | Envio só com **laudo pronto**                  | A ação "Enviar" só é habilitada para amostra `CLASSIFIED` (que é exatamente o pré-requisito do laudo).                                   |

---

## Arquitetura proposta (corrente)

> Esta seção evolui conforme as pendências são resolvidas.

### Fluxo ponta a ponta

```
[Operador]  Amostra CLASSIFIED → ação "Enviar amostra"
     │
     ├─ 1. Gera o laudo PDF (reusa a lógica de exportSamplePdf) e SALVA os bytes em UPLOADS_DIR
     ├─ 2. Cria registro de link público com TOKEN aleatório (32 bytes)
     ├─ 3. Monta a Etiqueta de Envio (campos específicos + QR)
     │        QR = https://<dominio>/laudo/<token>
     └─ 4. Enfileira impressão (print agent, igual às outras etiquetas)

[Destinatário]  Escaneia o QR com a câmera do celular
     │
     └─ Navegador abre /laudo/<token> → rota PÚBLICA valida o token
              → devolve só o PDF (sem login, sem acesso ao sistema)
```

### Modelo de dados (1 tabela nova — desacoplada do event store)

Tabela tipo `SampleReportShare` (nome a confirmar):

| campo                                         | papel                                       |
| --------------------------------------------- | ------------------------------------------- |
| `token` (único, indexado)                     | identificador não-adivinhável que vai no QR |
| `sampleId`                                    | amostra de origem                           |
| `storagePath` + `checksumSha256` + `fileName` | o PDF congelado em `UPLOADS_DIR`            |
| `reportedHarvest`                             | safra escolhida (quando liga)               |
| `issuedByUserId` / `issuedAt`                 | auditoria de emissão                        |
| `revokedAt` (nullable)                        | revogação (D3)                              |
| `expiresAt` (nullable)                        | expiração — **pendente P2**                 |
| `accessCount` / `lastAccessedAt` (opcional)   | analytics de leitura                        |

Não toca `SampleEvent` (append-only). Continua registrando `REPORT_EXPORTED` na geração.

### Peças a construir

1. **Rota pública** `GET /laudo/[token]` → valida token, checa `revokedAt`/`expiresAt`, faz stream do PDF (`Content-Type: application/pdf`). Adicionar `/laudo` ao `PUBLIC_PATH_PREFIXES` (`middleware.ts`).
2. **Persistir o PDF no envio** → variante de `exportSamplePdf` que grava os bytes em `UPLOADS_DIR` e devolve `storagePath` (hoje só transmite e descarta).
3. **Ação "Enviar amostra"** (UI + endpoint) que orquestra os 4 passos. Gate: só para `CLASSIFIED` (D4).
4. **Builder da Etiqueta de Envio** no print agent (`print-agent/label.js`, ex.: `buildShippingLabel`) com os campos do envio + QR apontando para a URL pública (o QR atual só leva o número do lote — não reaproveita).

### Segurança

- Token aleatório de 32 bytes → enumeração/brute force inviável.
- Link público = **qualquer um com o QR vê o laudo** (sem controle por destinatário). Coerente com o laudo ser feito para entregar ao comprador; `revokedAt` é a saída em caso de erro.
- Rate-limit leve na rota pública (defesa em profundidade) — **pendente P5**.

---

## Pendências (a resolver aos poucos)

| #   | Pergunta em aberto                                                                 | Notas                                                                                       |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| P1  | Quais **campos específicos** entram na Etiqueta de Envio?                          | Ex.: destinatário/cliente, lote, sacas, data de envio, transportadora? Definir layout.      |
| P2  | O link **expira**? Em quanto tempo?                                                | D3 já prevê `expiresAt`; falta decidir se usamos e qual prazo.                              |
| P3  | QR abre **PDF direto** ou uma **página pública** (landing) que mostra/baixa o PDF? | Direto = mais simples ("apenas o pdf"). Landing = branding + mensagem de revogado/expirado. |
| P4  | Onde fica a ação **"Enviar"** na UI?                                               | Detalhe da amostra? Lista? Quem pode (papéis)?                                              |
| P5  | **Rate-limit** e logs de acesso na rota pública.                                   | Defesa em profundidade.                                                                     |
| P6  | Fluxo de **liga**: como o operador escolhe a safra (`reportedHarvest`) ao enviar.  | Mesmo constraint anti-vazamento do laudo atual.                                             |
| P7  | **Revogação** na UI: onde e quem revoga; o que o leitor vê após revogar.           | Depende de P3.                                                                              |
| P8  | **Reenvio**: gerar nova etiqueta cria novo token/snapshot ou reusa?                | Definir idempotência.                                                                       |
| P9  | Nome final da tabela, rota e builder.                                              | `SampleReportShare`? `/laudo/`? `buildShippingLabel`?                                       |

---

## Log de sessões

### 2026-06-17 — Sessão inicial

- Levantamento do estado atual (laudo PDF, QR atual, auth, storage, precedentes). Confirmado: PDF não é persistido hoje; storage é disco local via `UPLOADS_DIR`; não existe conceito de link público.
- Fechadas as decisões D1–D4 (novo tipo de etiqueta como ação; PDF congelado; token revogável no banco; envio só com laudo pronto).
- Desenhada a arquitetura proposta inicial (fluxo, tabela `SampleReportShare`, 4 peças, segurança).
- Aberto o backlog de pendências P1–P9.
- Próximo passo sugerido: resolver **P1** (campos da etiqueta) e **P3** (PDF direto vs landing), que destravam o protótipo do builder e da rota pública.
