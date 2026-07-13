# Classificação — Visão Geral

> **Status**: Ativo (documento-mãe)
> **Última atualização**: 2026-07-13 (pós-auditoria CL1–CL41 e correções F1–F4)
> **Par**: backlog, pendências e ledger vivem em `docs/Classificacao-Plano-de-Trabalho.md`.

Este é o documento canônico do funcionamento ATUAL da classificação. Afirmações sobre fluxo, contrato de dados, canonização e exibição vivem aqui; os demais docs referenciam este.

---

## 1. Fluxo

Três caminhos de escrita, todos convergindo no evento `CLASSIFICATION_COMPLETED` ou `CLASSIFICATION_UPDATED`:

1. **Câmera + IA** (principal): operador fotografa a ficha SAFRAS → `detect-form` → `extract-and-prepare` (extração gpt-4o pré-preenche a ficha) → revisão humana na ficha (`ClassificationReviewSheetBody`) → `POST /api/v1/classification/confirm` (`confirmClassificationFromCamera`).
2. **Câmera manual**: mesma ficha, sem extração (IA desligada ou ilegível); confirmação via `ClassificationManualConfirmModal`.
3. **Edição no detalhe**: modal `cld-modal` em `/samples/[id]` (amostra `CLASSIFIED`) → `POST /api/v1/samples/:id/classification/update` (`updateClassification`, evento `CLASSIFICATION_UPDATED` com `before/after/reasonCode/reasonText`).

**Reclassificação pela câmera** (amostra já `CLASSIFIED`): a ficha parte **vazia** e o payload emite todas as chaves — campos que a nova foto não preencher **substituem os anteriores por null**. Isso é deliberado ("substituição total consciente", decisão 2026-07-13) e o portão `ClassificationReclassifyModal` avisa explicitamente. A edição no detalhe, ao contrário, pré-preenche e faz patch.

**Portões**: foto de classificação é obrigatória (409 sem ela); `classifiers` mínimo 1 (validado pelo comando `normalizeClassifiers`); status `REGISTRATION_CONFIRMED` → `CLASSIFIED`. Classificar dispara auto-print (best-effort).

**Data da classificação**: `dataClassificacao` é SEMPRE carimbada pelo servidor com `buildBusinessDateStamp()` (fuso de negócio). O cliente não envia data (CL29).

## 2. Modelo de dados

### Eventos (`SampleEvent`, append-only)

| Evento                                            | Papel                                      | Muta status?     |
| ------------------------------------------------- | ------------------------------------------ | ---------------- |
| `CLASSIFICATION_COMPLETED`                        | classificação (nova ou re-COMPLETED)       | RC → CLASSIFIED  |
| `CLASSIFICATION_UPDATED`                          | edição com auditoria before/after + reason | não              |
| `CLASSIFICATION_EXTRACTION_COMPLETED` / `_FAILED` | auditoria da extração IA                   | não (audit-only) |

Schemas em `docs/schemas/events/v1/payloads/`. `npm run validate:schemas` apenas **compila** os schemas; a validação dos payloads acontece em runtime no `appendEvent`.

### Projeção no `Sample` (fonte única)

- `latestClassificationData` (JSONB) — o dado completo (ver §3).
- `classificationType` (`BICA/PREPARADO/BAIXO/ESCOLHA/CONILON`) — top-level, editável no modal do detalhe.
- `latestClassificationVersion` — incrementa a cada `CLASSIFICATION_COMPLETED` (o `UPDATED` não incrementa).
- `classifiedAt` — carimbo do primeiro `COMPLETED` (não reflete `UPDATED`); hoje só consumido por script de auditoria.

**Espelhos técnicos dropados (2026-07-13, migration `20260713120000`)**: `latest_type`, `latest_screen`, `latest_defects_count`, `latest_density`, `latest_color_aspect`, `latest_notes` foram removidos — nunca eram populados pelo fluxo atual nem exibidos (CL9–CL12). O bloco `technical` continua ACEITO pelo schema do evento (histórico append-only), mas não é projetado nem enviado por nenhum cliente. `SampleSnapshot.latestClassification` expõe só `{ version, data }`.

A projeção é **MERGE** (não replace): chaves ausentes do payload preservam o valor anterior; `fundos` é a exceção (replace do array inteiro). Reclassificação por câmera envia todas as chaves, então na prática substitui tudo (§1).

## 3. Contrato campo a campo (`latestClassificationData`)

| Chave                 | Tipo                                                                                  | Canonização                              | Observação                                           |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `dataClassificacao`   | string `YYYY-MM-DD`                                                                   | —                                        | carimbo do servidor (fuso de negócio)                |
| `padrao`              | string\|null                                                                          | `canonicalizePadrao` (`l4 p3`→`L4-P3`)   | filtrável                                            |
| `aspecto`             | string\|null                                                                          | `canonicalizeAspecto` (`g.c.`→`GC`)      | filtrável                                            |
| `certif`              | string\|null                                                                          | `canonicalizeCertif` (`r.a.`→`RA`)       | filtrável                                            |
| `catacao`             | string\|null (percentual em texto)                                                    | `canonicalizeCatacao` (`0.5`→`0,5`)      | filtrável                                            |
| `bebida`              | string\|null                                                                          | `canonicalizeBebida` (uppercase+colapso) | desde 2026-07-13 (CL6)                               |
| `observacoes`         | string\|null                                                                          | —                                        | maxLength 500 no form                                |
| `peneiras`            | obj\|null: `p18…p10, mk` number 0-100                                                 | —                                        | validação 0-100 no form + schema + parsers do update |
| `fundos`              | tupla de 2 `{peneira: string\|null, percentual: number\|null (0-100)}` \| null        | prefixo `P` removido na extração         | replace, não merge                                   |
| `defeitos`            | obj\|null: `imp, pva, broca, gpi, ap` (percentuais em texto), `defeito` (texto livre) | —                                        |                                                      |
| `consumoGramas`       | number\|null                                                                          | —                                        | de `consumptionGrams`                                |
| `versaoClassificacao` | int                                                                                   | —                                        | de `classificationVersion`                           |
| `classificadores`     | array de `{id, fullName, username}` (min 1)                                           | —                                        | canônico; legado `conferidoPor` só em dado antigo    |

## 4. Canonização

Funções únicas em `src/samples/classification-canonicalization.js`, aplicadas **simetricamente** (desde 2026-07-13) em três pontos:

1. **Extração IA** (`normalizeClassificacao`): padrao/aspecto/certif/bebida (com `rejectIfLabel`) + catacao (CL7) + safra (`canonicalizeHarvest`).
2. **Projeção** (`CLASSIFICATION_FIELD_CANONICALIZERS` no projetor): padrao/aspecto/catacao/certif/**bebida** (CL6).
3. **Filtros de /samples** (`listClassificationValues` + aplicação de filtro): padrao/aspecto/catacao/certif.

Backfill idempotente da projeção: `scripts/migrations/backfill-classification-canonical.js` (agora inclui bebida — **rodar em prod na janela do próximo deploy**). Não há mapa de sinônimos/fuzzy — só transformações determinísticas; valor não-canônico passa limpo (uppercase/trim), nunca vira null por "não bater".

## 5. Matriz campo × superfície

Superfícies: **A** card lista `/samples` (expandido) · **B** detalhe resumo mobile · **C** detalhe ficha desktop · **D** modal de classificação · **E** laudo PDF/QR · **F** filtros · **G** etiqueta interna (print agent).

| Campo              | A            | B   | C         | D         | E            | F   | G   |
| ------------------ | ------------ | --- | --------- | --------- | ------------ | --- | --- |
| padrao             | ✅           | —   | ✅        | ✅        | ✅           | ✅  | ✅  |
| aspecto            | ✅           | ✅  | ✅        | ✅        | ✅           | ✅  | ✅  |
| catacao            | ✅           | ✅  | ✅        | ✅        | ✅           | ✅  | —   |
| certif             | —            | —   | ✅        | ✅        | ✅ (Resumo)  | ✅  | —   |
| bebida             | —            | —   | ✅        | ✅        | ✅           | —   | —   |
| observacoes        | —            | —   | ✅        | ✅        | ✅           | —   | —   |
| peneiras+mk        | ✅ (desktop) | —   | ✅        | ✅        | ✅           | —   | —   |
| fundos             | —            | —   | ✅        | ✅        | ✅           | —   | —   |
| defeitos.\*        | —            | —   | ✅        | ✅        | ✅           | —   | —   |
| dataClassificacao  | —            | —   | ✅ (Data) | —         | — (excluída) | —   | —   |
| classificadores    | —            | ✅  | ✅        | ✅        | — (excluído) | —   | —   |
| classificationType | —            | —   | —         | ✅ (Tipo) | —            | —   | —   |

Decisões deliberadas: **Tipo só no modal** (não sai no laudo — decisão 2026-07-13); laudo exclui proprietário/data/classificadores/lotes internos (`SAMPLE_EXPORT_FIELDS_EXCLUDED_FROM_REPORT`).

## 6. Convenções de exibição

- **Percentuais** (peneiras, catação, imp/pva/broca/gpi/ap, percentual de fundo): sufixo `%` em TODA superfície quando o valor tem dígito; texto livre passa sem `%`. Front: `formatPercentDisplay` (`lib/classification-format.ts`); laudo: `formatPercentValue` (`src/reports/export-fields.js`). `defeito` (total) nunca leva `%`.
- **Labels canônicos**: forma longa nas superfícies espaçosas (Catação, Certificado, Impureza, Defeito), curta nos forms compactos (Cat., Certif., Imp., Def.). `MK` sempre maiúsculo. Laudo usa "Peneira 18" (estilo documento); UI usa "P18".
- **Null**: `—` (em dash) em toda a UI; o laudo **omite** campos vazios (excludeEmpty) — divergência deliberada de formato de documento.
- **Separador de fundos**: `peneira = percentual%` (ex.: `13 = 4%`) em todas as superfícies.

## 7. API (rotas atuais)

| Rota                                                          | Backend                                                      | Uso                             |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| `POST /api/v1/classification/confirm`                         | `confirmClassificationFromCamera`                            | câmera (novo + reclassificação) |
| `POST /api/v1/samples/:id/classification/update`              | `updateClassification`                                       | edição no detalhe               |
| `POST /api/v1/samples/:id/classification/detect-form`         | detecção da ficha                                            | câmera                          |
| `POST /api/v1/samples/:id/classification/extract-and-prepare` | extração p/ revisão (não persiste evento)                    | câmera                          |
| `GET /api/v1/samples/classification-values?field=`            | DISTINCT canonizado p/ filtros                               | filtros /samples                |
| `POST /api/v1/samples/:id/photos`                             | `addLabelPhoto` → extração persistida (eventos de auditoria) | upload de foto                  |

`POST /classification/complete` foi **removida** (2026-07-13, CL13 — era DEPRECATED; o método `completeClassification` do command service permanece como harness de teste). Não existem `classification/start` nem `/partial` (cortados no Q.cls.1).

Validação server-side: caminho novo valida contra o schema do evento (Ajv, peneiras/fundos 0-100); caminho update valida nos parsers (0-100 desde CL5; whitelist de chaves; schema do `UPDATED` é propositalmente frouxo).

## 8. Extração por IA

- Modelo **pinado** `gpt-4o-2024-11-20` (`OPENAI_EXTRACTION_MODEL` sobrepõe), temperature 0.2, `response_format: json_schema` strict, timeout 25 s, retry 1x só em 429/5xx.
- Few-shot: 1 exemplo (imagem `src/samples/fixtures/extraction-example.jpg` + valores descritos no texto do prompt; o `.json` da fixture é referência humana).
- **Recall-first**: campos numéricos saem como STRING bruta (preserva `8-9`, `<1`); a coerção para number acontece no save (`parseNumberInput`) e é barrada pelo `validateClassificationForm` (0-100).
- Resultado **pré-preenche o form para revisão humana** — nunca grava direto. Cross-validação lote/sacas/safra contra o cadastro (`crossValidateExtraction`).
- Toggle: secret `OPENAI_API_KEY` ausente → extração desligada, fluxo manual segue.
- Telemetria estruturada em stderr (`classification.extraction`).

## 9. Regras e drifts documentados (decisões, não bugs)

- **Schema não exige `classifiers`** (`required` só tem `classificationPhotoId`): a obrigatoriedade min-1 vive no comando (`normalizeClassifiers`). Deliberado para não invalidar eventos históricos (CL25 — documentado, sem mudança).
- **Invalidação preserva a classificação**: `SAMPLE_INVALIDATED` não limpa `classificationType`/`classifiedAt`/JSON; não existe evento de "anular classificação" (CL27 — estacionamento).
- **Sem invariante de soma de peneiras** (decisão 2026-07-13): clamp 0-100 por campo apenas.
- **`parseNumberInput` troca só a 1ª vírgula**: entradas patológicas ("1,2,3") viram inválidas e são barradas pelo validador do form (CL30 — comportamento mantido).
- **`SAMPLE_EXPORT_FIELD_LABELS`** alimenta `entry.label` da API de export, mas o renderer do laudo usa labels próprios acentuados (CL15 — mantido; labels do mapa são ASCII).

## 10. Testes

- Unit: `tests/classification-form.test.js` (mapExtractionToForm + payload/validação), `tests/classification-canonicalization.test.js` (6 canonizadores), `tests/classification-extraction-service.test.js` (pipeline IA), `tests/normalize-classifiers.test.js`.
- Integração: `tests/sample-backend-sprint1.integration.test.js` (projeção ponta a ponta, canonização com valores não-invariantes, extração persistida com crossValidate real, 422 de faixa no update), `tests/sample-classification-filter.integration.test.js` (filtros), `tests/report-harvest.test.js` + `tests/physical-send-report-share.integration.test.js` (laudo/export).
- Regra da casa: mexeu em projetor/canonização → `npm run test:integration:db` local obrigatório (e `npm run db:seed` depois).
