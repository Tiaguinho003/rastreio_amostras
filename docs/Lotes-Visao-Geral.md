# Lote (amostra) — Visão Geral

Documento-mãe do domínio **Lote** — a entidade central do app (o modelo `Sample`).
É um **hub**: dá o mapa do domínio e aponta para os docs que já detalham cada parte.
Não repete o que já está documentado — quando um assunto tem doc próprio, a seção
aqui é um resumo de uma frase + o ponteiro. Se uma afirmação divergir do doc apontado,
**o doc apontado vence** (e corrija este).

> **Nomes**: "Lote" é o rótulo de produto/UI; `Sample` é o modelo no código e no banco.
> São a mesma coisa. Uma **Liga** (blend) é um `Sample` com `isBlend=true`, composto de
> outros `Sample` via `SampleBlendComponent`.

## 1. O que é

Um `Sample` é uma amostra de café rastreada de ponta a ponta: cadastro → classificação →
vida comercial (venda/perda) e envio físico/laudo. O modelo é **event-sourced**: o estado
atual do `Sample` é uma **projeção** de um log append-only de eventos (`SampleEvent`), não
uma linha editada em lugar. Regras de negócio, quem usa e as decisões de escopo vivem em
`docs/Produto-e-Fluxos.md`; o modelo de dados e a stack, em `docs/Arquitetura-Tecnica.md`.

## 2. Ciclo de vida e estados

Dois eixos independentes de estado (enums canônicos em `prisma/schema.prisma`):

- **`SampleStatus`** — o eixo do cadastro/classificação: `REGISTRATION_CONFIRMED` →
  `CLASSIFIED`, com `INVALIDATED` como terminal (o lote é invalidado, não deletado do log).
- **`CommercialStatus`** (`@default(OPEN)`) — o eixo comercial: `OPEN` · `PARTIALLY_SOLD` ·
  `SOLD` · `LOST`.

A leitura de UI ("Em aberto", "Vendido", "Classificado/Pendente", chips) deriva desses
dois eixos. As **regras operacionais** (quando cada transição vale, o que cada estado
libera/trava, deletar-lote que libera o número) estão em `docs/Produto-e-Fluxos.md`.

## 3. Event store

`SampleEvent` é **append-only** — triggers no banco impedem UPDATE/DELETE (detalhe na skill
`prisma`). Cada mutação do domínio grava um evento; a projeção reconstrói o `Sample`.

- Tipos de evento: `enum SampleEventType` em `prisma/schema.prisma` (fonte única — não
  duplicar a lista aqui).
- Contrato dos eventos (payloads, idempotência, validação): `docs/API-e-Contratos.md` e os
  JSON Schemas em `docs/schemas/events/v1/` (`event.schema.json` + `events/` + `payloads/`).

## 4. Projeção no `Sample`

O `Sample` é a **fonte única de leitura** (projeção materializada dos eventos). Os detalhes
da projeção de classificação — `latestClassificationData`, canonização, matriz campo ×
superfície — estão em `docs/Classificacao-Visao-Geral.md` §3–§6. O modelo de dados completo
(colunas, índices, relações) está em `docs/Arquitetura-Tecnica.md`.

## 5. Superfícies (UI)

A página é `/samples` (lista) + o detalhe do lote como **drawer da própria lista**
(`?lote=<id>` é fonte de verdade). O desenho institucional atual e os commits estão no
**Redesign** — não repetir aqui:

- **Desktop** (lista = tabela `.fv-table-lotes`; detalhe = drawer com hero + 3 abas + ficha
  inline): `docs/Redesign-Plano-de-Trabalho.md` §2.7 (RD15, F1–F3).
- **Mobile** (chrome, card, drawer, sizing dos sheets): §2.8 (RD16, M1–M4).
- Componentes-chave: `app/samples/page.tsx` (lista), `components/samples/SampleDetailView.tsx`
  (detalhe/drawer), `SampleCard.tsx` (card mobile), `SampleMovementsPanel.tsx`,
  `SampleSendFlow.tsx`, `SampleLossSheet.tsx`, `SampleLabelPrintSheet.tsx`. Estatísticas da
  lista: `GET /api/v1/samples/stats` (KPIs).

## 6. Sub-domínios (docs próprios)

- **Classificação** (extração por IA, projeção, laudo): `docs/Classificacao-Visao-Geral.md`
  (visão) + `docs/Classificacao-Plano-de-Trabalho.md` (plano). A câmera é um bottom sheet
  global (`CameraSheet`), não uma rota.
- **Liga / blend** (composição, cascata de movimentos, safra/proprietário reativos,
  viabilidade da venda): `docs/Liga-Plano-de-Trabalho.md`. No modelo: `isBlend`,
  `SampleBlendComponent`, flags `blendOwnerPinned`/`blendOriginLotPinned`.
- **Simulador** (sub-aba "Simulador" de `/samples`, canvas de nodes): `docs/Playground-Plano-de-Trabalho.md`.

## 7. API

Rotas sob `app/api/v1/samples/*` (+ `clients/[clientId]/samples`). A referência oficial de
contratos, idempotência e validação é `docs/API-e-Contratos.md`. Rotas notáveis do domínio:
`/samples` (lista/criação), `/samples/[sampleId]` (detalhe/mutação), `/samples/stats` (KPIs),
`/samples/blends`, `/samples/[sampleId]/revert-blend`, `/samples/[sampleId]/blend-feasibility`,
`/samples/classification-values`.

## 8. Testes

Cobertura em `tests/` — projeção/canonização/extração de classificação
(`classification-*`, `sample-backend-sprint1.integration.test.js`), liga
(`blend-*.test.*`), stats da lista e filtros. Rodar: skill `tests`.

## 9. Dívidas e decisões abertas

- **`.informe-commercial-page`** — classe CSS com **zero ocorrências no TSX**, morta desde que
  a unificação de 2026-07-15 apagou o `InformeCommercialPage`. _(A hipótese do M4 de que estivesse
  "reservada à unificação de Relatórios" caiu: Relatórios passou pelo ciclo e não a usa.)_ Na
  consolidação de 2026-07-27 saíram as **5 regras que exigiam a classe**; sobraram **7
  `:not(.informe-commercial-page)`** qualificando regras **vivas** de `/samples`
  (`.samples-page-v2`, `-sheet`, `.spv2-list-scroll`, `.cv2-fab` ×2, `.spv2-card-wrap` ×2).
  Removê-los é semanticamente inócuo mas **baixa a especificidade de (0,2,0) para (0,1,0)** — pode
  virar a cascata numa página que não está na vez do ciclo. **Sai na próxima passada de `/samples`,
  com conferência visual.** Ver Redesign §2.8 (M4) e §2.10 (consolidação).
- **Cadeia órfã de backend** — `getDashboardPending`, `getSampleRecentSends`,
  `updateSampleMovement` (+ testes de integração) ficaram órfãos de UI após o redesenho
  (o feed "Amostras enviadas" saiu do produto; a KPI "Aguardando classificação" substituiu
  o card de pendência). Rota/tipo/teste seguem vivos — varredura de backend é follow-up
  separado, fora do escopo de CSS.
- **Resíduo de skill** — o §147 de `.claude/skills/modals/SKILL.md` ainda nomeia
  `.sample-detail-*-modal` (reg-edit/invalidate/print/lookup) como classes-wrapper; o M4
  as consolidou (só os `-actions` sobrevivem). Imprecisão de nome, não afirmação falsa.
