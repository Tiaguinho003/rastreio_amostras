# Relatórios — Visão Geral

Documento-mãe da página **Relatórios** (rota `/relatorios`) e do domínio de registro de
campo/comercial que vive nela. É um **hub**: dá o mapa e aponta para os docs que já detalham
cada parte. Não repete o que já está documentado — quando um assunto tem doc próprio, a
seção aqui é um resumo de uma frase + o ponteiro. Se uma afirmação divergir do doc apontado,
**o doc apontado vence** (e corrija este).

> **Nomes**: "Relatórios" é o rótulo de produto/UI da página. No código e no banco os dois
> registros são `VisitReport` (**Visita**) e `WeeklyReport` (**Semanal**). O **Informativo**
> mora na mesma página mas **não é um registro** — é um gerador de imagem.

## 1. O que é

Uma página só, com **duas coisas que viram linha no banco** e **uma que não vira**:

| Peça            | O que é                                                                   | Persiste?         |
| --------------- | ------------------------------------------------------------------------- | ----------------- |
| **Visita**      | Registro de uma visita a cliente — **unificada** (prospector + comercial) | ✅ `VisitReport`  |
| **Semanal**     | Resumo da semana do autor (1 por usuário por semana)                      | ✅ `WeeklyReport` |
| **Informativo** | Peça de imagem 1080×1920 para story, gerada no browser                    | ❌ nada           |

O corpo da página é um **feed cronológico combinado** (Visita + Semanal de **todos** os
autores, mais recentes primeiro) com cards em acordeão: colapsado mostra autor · data ·
tipo · cliente; expandido revela só as respostas preenchidas.

## 2. Quem entra, quem cria

Fonte da verdade: `lib/roles.ts` (front) e `src/visits/visit-report-service.js` (back) — as
constantes espelham uma a outra e **não devem ser duplicadas** aqui como lista de papéis.

- **Ver a página e o feed** — `INFORME_ROLES` = `NON_PROSPECTOR_ROLES` (todo papel menos
  PROSPECTOR). No backend, o mesmo conjunto é `VISIT_REPORT_VIEWER_ROLES`. Todos veem
  **tudo** (feed `scope=all` fixo, sem parâmetro de escopo).
- **Criar Visita** — todos os que veem a página. O **PROSPECTOR não acessa a página**: cria a
  visita pelo sheet do dashboard dele, com o **mesmo componente** (`CommercialVisitFormSheet`).
- **Criar Semanal** — só `WEEKLY_REPORT_AUTHOR_ROLES` (ADMIN + COMMERCIAL); helper de UI
  `isWeeklyReportAuthor`.
- **Criar Informativo** — todos os que veem a página (não tem gate próprio: não cria registro).
- **Cancelar** — só o **próprio autor**, e é **soft** (`cancelledAt`/`cancelledByUserId`): o
  item fica no feed marcado como "Cancelado". Não existe editar nem excluir de verdade —
  errou, cancela e envia outro.

A auditoria por papel, rota a rota, está em `docs/Auditoria-Navegacao-por-Papel.md`.

## 3. Modelo de dados

Modelos em `prisma/schema.prisma` (a skill `prisma` descreve campo a campo):

- **`VisitReport`** — a visita unificada. Nasce **vinculada a um cliente real** (`clientId`)
  ou a um cliente novo anotado (`newClient*`); todos os campos de domínio (motivo, resultado,
  tamanho da fazenda, interesse, já comercializa, observações) são **opcionais** — a união
  dos dois formulários antigos, sem obrigar quem só quer registrar a passagem.
- **`WeeklyReport`** — resumo/dificuldades/plano. `UNIQUE (user_id, week_start)` é a fonte de
  verdade do "1 por semana" (violação → `409 WEEKLY_REPORT_ALREADY_EXISTS`); a semana
  (segunda 00:00 BRT) é computada **no servidor**.
- **`CommercialVisit`** — **modelo órfão**: absorvido pela Visita unificada em 2026-07-15. A
  tabela segue no banco (vazia em produção) até a **migration B (contração)** — ver
  `docs/Redesign-Plano-de-Trabalho.md` e o backlog de deploy.

Nenhum dos dois passa pelo event store (`SampleEvent` é do domínio Lote).

## 4. API

Serviço único: `src/visits/visit-report-service.js` (o antigo `commercial-forms-service.js`
foi absorvido). Rotas em `app/api/v1/`; o contrato oficial está em
`docs/API-e-Contratos.md` §"Rotas de Relatorios" — aqui só o mapa:

| Rota                         | Para quê                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| `GET /informe-feed`          | O feed combinado da página (`scope=all` fixo) + filtros opcionais  |
| `GET /relatorios/stats`      | Os cards do topo (semana atual/anterior + tendência de 13 semanas) |
| `POST /visit-reports`        | Criar visita · `GET` lista as próprias (dashboard do prospector)   |
| `DELETE /visit-reports/:id`  | Cancelar (soft) a própria visita                                   |
| `GET /visit-reports/stats`   | Contadores do dia do dashboard do prospector                       |
| `POST /weekly-reports`       | Criar o semanal (ADMIN + COMMERCIAL)                               |
| `DELETE /weekly-reports/:id` | Cancelar (soft) o próprio semanal                                  |

O feed usa a estratégia **top-K de listas ordenadas**: busca `offset+limit` de cada tabela já
filtrada e ordenada, funde, ordena e fatia — o topo global cabe dentro do topo de cada perna.

## 5. Superfícies (UI)

O desenho institucional atual, com os commits, está no **Redesign** (`docs/Redesign-Plano-de-Trabalho.md`
§2.10) — não repetir aqui. O mapa dos componentes:

- `app/relatorios/page.tsx` — casca (guard `INFORME_ROLES` + `AppShell`). `app/informe/page.tsx`
  é **redirect** server-side (bookmarks, links antigos, precache do SW); `/resumo` idem.
- `components/informe/RelatoriosViewer.tsx` — a página: faixa do topo (cards + os 3 botões de
  criar, desktop), toolbar de busca, chips de tipo, feed, "Carregar mais", confirm de cancelar.
- Cards: `components/visits/VisitReportCard.tsx` e `components/informe/WeeklyReportCard.tsx`
  (prefixo CSS `.rsm-*`) — **compartilhados com o dashboard do prospector**.
- Criação: `useInformeCreateSheets` é a **fonte única de estado** dos 3 sheets, servindo as
  duas portas — os botões da faixa (desktop) e o FAB "leque" (mobile-only). Os formulários são
  painéis laterais: `CommercialVisitFormSheet`, `WeeklyReportFormSheet`, `InformativoFormSheet`.
- Gráfico: `components/informe/VisitsTrendChart.tsx` (13 semanas BRT).

> **Onde a regra de CSS vai**: `.rsm-*` é compartilhado com o dashboard do prospector. Restyle
> que só vale na página **escopa em `.rsm-content`** (o contêiner do feed em `/relatorios`) —
> foi assim que a linha colunar dos cards entrou sem tocar o dashboard. Ver skill
> `css-architecture`.

## 6. Sub-domínio com doc próprio

- **Informativos** — conceito, princípios (nada é salvo), especificação visual das duas peças
  (Mercado e Meteorológico), a avaliação que descartou a API de meteorologia e o ledger INF:
  `docs/Informativos-Plano-de-Trabalho.md`. A previsão do tempo entra como **print colado**
  pelo usuário, não por API.

## 7. Testes

Em `tests/`: `visit-report.integration.test.js` (feed, filtros, stats, gates de papel),
`visit-stats-window.test.js` (janelas BRT de dia/semana/tendência),
`weekly-report-window.test.js` (semana de referência do Semanal) e
`informativo-*.test.{js,ts}` (rascunho + layout das peças). Rodar: skill `tests`.

## 8. Dívidas e decisões abertas

- **Filtro por AUTOR** — decidido adiar (R-D9): a busca já casa por nome de autor, e um
  seletor exigiria um endpoint de autores distintos acessível a **todo** viewer (o `/users` é
  ADMIN-only). **Pendente de decisão do Flavio**: endpoint dedicado vs. seguir só na busca.
- **Parâmetros do feed sem consumidor de UI** — `status`, `from`, `to` e `authorId` seguem
  aceitos e testados no backend, mas **nenhuma tela os envia** desde que os filtros viraram
  chips de tipo (R13). Mantidos de propósito (superfície pequena, testada, e o filtro de autor
  ainda pode voltar); se a decisão acima for "não volta", eles saem juntos.
- **`CommercialVisit`** — tabela órfã aguardando a migration B (contração).
- **Validação no device** 📱 — a página foi conferida no desktop a cada rodada; falta a passada
  no aparelho (feed colunar no mobile, card único com o número no cabeçalho, leque de criação).
