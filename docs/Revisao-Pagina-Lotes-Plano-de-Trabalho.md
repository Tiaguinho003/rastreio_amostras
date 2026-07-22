# Revisão da Página de Lotes (`/samples`, lista) — Plano de Trabalho

> **Escopo:** a **lista** de `/samples` (mobile + desktop). O **detalhe**
> (`/samples/[sampleId]`) está **fora** deste plano.
> **Origem:** revisão robusta por workflow multiagente com verificação
> adversarial (2026-06-24): **36 achados → 29 confirmados, 7 refutados**.
> **Objetivo:** deixar a página **sem bugs, inconsistências nem gargalos**.
> **Execução:** faseada — cada fase é aprovada no device e commitada
> separadamente. Push e deploy são do usuário.

> ## 🔴 Leia antes: o desktop deste plano não existe mais
>
> O **redesenho FV de `/samples`** (RD15, `docs/Redesign-Plano-de-Trabalho.md`
> §2.7, 2026-07-21) reescreveu a página inteira. Duas premissas deste plano
> caíram:
>
> 1. **A fronteira lista ↔ detalhe acabou.** `app/samples/[sampleId]/page.tsx`
>    é um **redirect** para `/samples?lote=<id>`; o detalhe é um drawer
>    renderizado pelo mesmo `app/samples/page.tsx` que este plano chama de
>    "a lista". Não há mais "fora deste plano" por arquivo.
> 2. **No desktop não há mais cards.** A lista virou `<table>`; `SampleCard`
>    (e com ele a expansão, o `content-visibility` da Fase 4, o `memo` da
>    Fase 2 e o leque do FAB da Fase 5) só renderiza **no mobile**.
>
> **Consequência prática:** os itens de validação em aberto valem **só para o
> mobile**. Quem for validar no desktop está conferindo uma tela que foi
> substituída — a conferência do desktop é a do §2.7 do doc de Redesign.
> As fases 1, 3 e 6 (fetch unificado, backend, CSS morto) não dependem de
> breakpoint e seguem válidas como estão.

## Status geral

| Fase | Tema                                                               | Status                                                            |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1    | Bugs do Modo Liga (unificar o fetch) — B1–B5                       | ✅ **Código pronto + commit `57dc023`** — falta validar no device |
| 2    | Gargalos de render — G1, G2, G4 (G5 descartado)                    | ✅ **Código pronto** — falta validar no device                    |
| 3    | Camada de dados (backend) — D1, D2, D3                             | ✅ **EM PROD** (migration D3 aplicada no deploy da rev 00374)     |
| 4    | Render da lista longa — G3 (content-visibility, não react-virtual) | ✅ **Código pronto** — validar em device (iOS PWA)                |
| 5    | Inconsistências / acessibilidade — I2, I3, I4, I5, lacuna #6       | ✅ **Código pronto** — validar no device (visual + teclado/SR)    |
| 6    | Código morto (CSS) + docs — M1–M6, S1                              | ✅ concluída (M1 deferido RESOLVIDO no ciclo LOT, `6080815`)      |
| —    | Testes de regressão (lacuna #7)                                    | ✅ resolvida no ciclo LOT (`2917953`/`0fa7d38`)                   |

> ⚠️ As referências `arquivo:linha` abaixo são **âncoras por símbolo** — os
> números deslocam conforme os arquivos mudam (a Fase 1 já deslocou o
> `page.tsx`). **Sempre `grep` pelo símbolo antes de editar.**

> ℹ️ ~~**Mudanças vindas do ciclo do DASHBOARD** (fora deste plano): a página
> ganhou o card só-visualização **"Classificação pendente"** (DSB-D2,
> 2026-07-12, `.spv2-pending-stat`) e o card **"Amostras enviadas"** no topo
> do sheet, desktop-only (DSB-D14, 2026-07-14, `RecentSendsCard` + wrapper
> `.spv2-top-cards`; dado de `GET /samples/recent-sends`).~~ **Os dois cards
> saíram do JSX na F1 do redesenho** (`16167f4`): a contagem de pendentes
> virou o 4º **KPI clicável** da lista (servido por `GET /samples/stats`) e o
> feed de envios foi **removido do produto** por decisão do Flavio. Ficaram
> órfãos `ClassificationPendingCard`, `getSampleRecentSends`, a rota
> `/samples/recent-sends` e o CSS `.spv2-pending-stat`/`.spv2-top-cards` —
> anotados para a consolidação. O `RecentSendsCard` **não** é órfão: a aba
> Aprovações de `/embarques` continua usando.

---

## Decisões do usuário (travadas)

1. **Escopo:** cobrir **todos os 29** achados, em fases.
2. **Modo Liga:** **unificar o fetch** num único caminho (resolver a raiz, não
   remendar bug a bug).
3. **`PARTIALLY_SOLD`:** **manter "Em aberto"** no card (consistente com o
   detalhe) → o achado I1 **não entra** no plano.
4. **Lista:** **virtualizar agora** (`@tanstack/react-virtual`). _(SUPERADA
   na execução da Fase 4: implementou-se `content-visibility` no lugar —
   ver a linha da Fase 4 na tabela de status.)_

---

## Arquivos centrais

- `app/samples/page.tsx` — página (fetch, snapshot, modo Liga, filtros). _O
  reducer saiu para `lib/samples/samples-list-reducer.ts` (ver §Testes); o
  modal central de filtros virou **painel lateral** de 400px na F1 do
  redesenho; e o arquivo passou a hospedar também o drawer do detalhe._
- `components/samples/SampleCard.tsx` — card do lote. **Só mobile** desde a F1
  do redesenho — no desktop a lista é `<table className="fv-table
fv-table-lotes">`.
- `components/samples/BlendConfirmationSheet.tsx` — bottom sheet da liga.
- `components/samples/SampleCreateRadialFab.tsx` — FAB "+" (leque).
- `components/samples/ClassificationFilterField.tsx` — campo de filtro de classificação.
- `lib/api-client.ts` — `listSamples`, `listClassificationValues`, `createBlend`.
- `src/samples/sample-query-service.js` — `listSamples` no backend (Prisma).
- `app/globals.css` — estilos (**compartilhado com outro agente** — isolar hunks ao commitar).
- `docs/API-e-Contratos.md` — contrato do `GET /api/v1/samples`.

---

## Catálogo de achados

### ✅ Confirmados — Bugs do Modo Liga (Fase 1)

- **B1** — `runLoadMore` nunca passava `eligibleForBlend`: ao paginar dentro da
  Liga, os cards da 2ª página em diante voltavam "normais" (sem elegibilidade).
- **B2** — dois effects de fetch concorrendo: ao filtrar/buscar dentro da Liga,
  a elegibilidade sumia (o fetch normal vencia, sem `eligibleForBlend`).
- **B3** — o effect de blend ignorava o filtro de **Período** (`buildPeriodQuery`).
- **B4** — o snapshot persistia a lista enriquecida da Liga (eligibility/
  committedSacks); ao voltar do detalhe (sempre em modo normal) sobrava
  elegibilidade "fantasma".
- **B5** — load-more em andamento não era invalidado ao alternar de modo →
  resposta de página obsoleta podia ser concatenada.

### ✅ Confirmados — Gargalos de render (Fase 2)

- **G1** — `SampleCard` sem `React.memo`: toda a lista re-renderiza a cada
  tecla na busca / mudança de estado da página.
- **G2** — `animationDelay = index * 0.04s` sem teto: cards profundos (após
  vários load-more) demoram segundos para aparecer.
- **G5** — conteúdo do modal de filtros (`renderFilterFields` /
  `renderClientMultiFilter`) inline na página → re-render do modal acoplado ao
  da lista.
- **G4** — `listClassificationValues` chamado 4× sempre que monta; sem cache.

### ✅ Confirmado — Gargalo estrutural (Fase 4)

- **G3** — lista cresce sem teto no DOM; cada card monta 2 SVGs + painel
  expandido sempre presente. → virtualizar.

### ✅ Confirmados — Camada de dados (Fase 3)

- **D1** — `listSamples` faz `COUNT` em **toda** página (via `$transaction`),
  mesmo no load-more, onde o front ignora `total`.
- **D2** — projeção da lista traz PII do cliente (`cpf`, `cnpjRoot`, `phone`,
  `code`, `personType`) que o card não usa.
- **D3** _(opcional/baixo)_ — índice `idx_sample_lot_int_id` pode não casar com
  o `ORDER BY` do keyset (`DESC NULLS LAST, id ASC`).

### ✅ Confirmados — Inconsistências / a11y (Fase 5)

- **I2** — empty-state genérico mesmo no modo Liga (deveria distinguir).
  _Resolvido; os textos vigentes dizem **"lote"**: `Nenhum lote encontrado` /
  `Nenhum lote disponível para liga`._
- **I3** — skeleton de loading desalinhado do card v2 branco (estilo antigo).
- **I4** — leque do FAB sem gestão de foco (abrir/fechar/teclado).
- **I5** — card inelegível usa `aria-pressed` + `aria-disabled` juntos
  (semântica ambígua para leitor de tela).
- **lacuna #6** — a11y do `BlendConfirmationSheet` e do modal de filtros (foco
  ao abrir/fechar) + live region anunciando o load-more.

### ✅ Confirmados — Código morto / docs (Fase 6)

- **M1** — bloco legado `.samples-page-*` (não-v2) + `.samples-page-search`.
- **M2** — CSS de paginação por botões (`.spv2-footer`, `.spv2-page-btn`,
  `.spv2-page-info`) — a lista usa cursor/scroll infinito.
- **M3** — `.spv2-sort-btn` (sem uso).
- **M4** — `.spv2-card-stat-{num,divider,total,unit,--primary}` (manter
  `-label`, `-value`, `-value--empty`, `--peneira`).
- **M5** — overrides `.samples-page-v2 .spv2-chips/.spv2-chip` (desktop).
- **M6** — `BlendConfirmationSheet` effect com dep dupla `[samplesKey, samples]`
  (basta `samplesKey`, ler `samples` via ref).
- **S1** — `docs/API-e-Contratos.md` descreve filtros incompletos do
  `GET /samples`.

### ❌ Refutados (falso-positivo — **não** investigar de novo)

1. `SAMPLE_PAGE_LIMIT = 20` não é "cap de 30 vs 20" — é intencional.
2. "Overcommit" da liga (selecionar mais sacas que o disponível) é
   **intencional** (validado no commit).
3. Índice de `contains`/trigram **já existe** (busca por texto).
   4–7. Outros 4 alarmes de concorrência/índice/cap revisados e descartados na
   verificação adversarial.

### Lacunas levantadas (tratadas dentro das fases)

- **#2** — reconciliação de seleção quando item selecionado some da lista →
  tratada na Fase 1 (deseleciona inelegível + toast; `createBlend` só recebe
  ids válidos).
- **#3** — granularidade da mensagem de erro do `createBlend` → revisar UX na
  Fase 1/5.
- **#5** — ao remover CSS morto, conferir `.records-*` / `.records-client-*`
  **separadamente** (só os `.samples-page-*` estão confirmados mortos).
- **#7** — a página **não tem cobertura de teste** hoje → adicionar regressão.
- **#8** — virtualização + bottom sheet historicamente problemáticos em **iOS
  PWA standalone** → validar no device real na Fase 4.

---

## Fase 1 — Bugs do Modo Liga (unificar o fetch) ✅

**Status:** código pronto, gates verdes, **commit `57dc023`**. Falta a
validação no device.

**O que foi feito** (`app/samples/page.tsx`, +96/−89):

- Criados `selectionModeRef` (espelha `selectionMode`) e `prevFetchInputsRef`
  (último `{appliedHiddenFilters, appliedSearch, newSampleRefetchKey,
selectionMode}`).
- `runLoadMore` lê `selectionModeRef.current` e inclui
  `eligibleForBlend` + `...buildPeriodQuery(...)` no payload → **B1/B3** no
  load-more.
- **Fetch inicial unificado** (um único `useEffect`, deps
  `[appliedHiddenFilters, appliedSearch, session, newSampleRefetchKey,
selectionMode]`): `eligibleForBlend = selectionMode === 'blend'`, mesmos
  filtros (inclui Período). Eliminado o effect de blend separado → **B2/B3**.
- **Entrar/sair da Liga é otimista:** `prevFetchInputsRef` distingue "só trocou
  de modo" (mantém a lista, sem `fetch-initial` nem scroll-top) de "filtro
  mudou" (recarrega do zero). Reconciliação de seleção preservada (deseleciona
  inelegível + `toast.info`); erro no modo Liga → `toast.error` + sai do modo.
- Token do load-more invalidado ao alternar de modo (`token += 1; inFlight =
false`) → **B5**.
- Guard `if (selectionModeRef.current === 'blend') return;` no
  `saveSnapshotBeforeLeave` e no effect de save contínuo (via **ref**, não dep,
  pra não re-rodar o save ao alternar de modo) → **B4**.

**Verificação pendente no device (mobile + desktop):**

1. Filtrar → entrar na Liga: inelegíveis acinzentados? (B2)
2. Na Liga, rolar (2ª/3ª página): novos cards respeitam elegibilidade? (B1)
3. Filtro de Período + Liga: respeita o período? (B3)
4. Entrar/sair da Liga: sem flash de loading nem pulo pro topo; seleção zera ao sair?
5. Entrar na Liga → abrir lote → voltar: volta normal, sem elegibilidade fantasma? (B4)
6. Seleção que vira inelegível após refetch é removida com toast?

---

## Fase 2 — Gargalos de render (quick wins, preparam a virtualização) ✅

**Status:** código pronto, gates verdes. Falta validar no device. **G5 foi
descartado** (decisão do usuário 2026-06-25 — ver abaixo).

**O que foi feito:**

- **G1 ✅** — `SampleCard` agora é `export const SampleCard = memo(SampleCardComponent)`
  (`components/samples/SampleCard.tsx`). Os 4 handlers passados ao card foram
  estabilizados em `page.tsx`: `toggleSampleSelection`, `toggleCardExpand`,
  `showIneligibleReason` viraram `useCallback` (updater funcional → deps `[]`,
  exceto `showIneligibleReason` com `[toast]`); e `saveSnapshotBeforeLeave`
  (= `onClickCapture`, que antes mudava a cada tecla na busca) virou `useCallback`
  `[]` lendo um `snapshotInputsRef` (padrão "latest ref", atualizado a cada
  render). Sem isso o `onClickCapture` instável quebraria o memo a cada keystroke.
  Referências dos itens são preservadas no `success-more` (`[...state.items, …]`),
  então paginar não re-renderiza cards já montados.
- **G2 ✅** — `animationDelay` capado: `Math.min(index, 12) * 0.04` em
  `SampleCard.tsx` (satura ~0.48s; sem o teto, cards profundos demorariam
  segundos pra aparecer).
- **G4 ✅** — `listClassificationValues` (4 chamadas) agora carrega **uma vez por
  montagem** via `classificationOptionsLoadedRef`: reabrir o modal de filtros não
  refaz as chamadas; em erro/abort o ref fica `false` e tenta de novo.
- **G5 ❌ DESCARTADO** — extrair o modal de filtros pra um componente memoizado.
  Motivo (confirmado com o usuário): o **G1 já entrega o objetivo declarado do
  G5** ("isolar o re-render do modal da lista" — a lista agora é memoizada e não
  re-renderiza com a digitação no filtro). Um componente memoizado do modal
  re-renderizaria mesmo assim, porque o que muda durante o uso do modal
  (`draftHiddenFilters`/`openClientFilter`/busca de cliente) é justamente o que
  ele receberia como prop; e o `ClientLookupField` já é isolado. Extrair ~400
  linhas (campos retráteis, foco, scroll-to-section, refs) seria a parte mais
  intrincada da página, com risco de regressão e ganho não-mensurável.

**Verificação:** React DevTools Profiler — digitar na busca **não** deve
re-renderizar os cards; reabrir o modal de filtros **não** refaz as 4 chamadas.
Smoke funcional: expandir card, selecionar na Liga, "Ver detalhes" (snapshot),
filtros — tudo continua funcionando.

---

## Fase 3 — Camada de dados (backend) ✅

**Status:** código pronto, gates verdes, **247 unit + 290 integração passando**
(integração rodada contra o DB com a migration D3 aplicada). Falta deploy
(migrate job) — push/deploy são do usuário.

**O que foi feito:**

- **D1 ✅** — `listSamples` (`src/samples/sample-query-service.js`) só faz `COUNT`
  na carga inicial (sem cursor); no load-more (keyset) pula o COUNT —
  `findManyArgs` único, `$transaction([findMany, count])` só no caminho inicial,
  senão `findMany` solto + `total = null`. `totalPages` vira null junto.
  **Mudança de contrato (registrada):** `ListSamplesResponse.page.total` e
  `.totalPages` agora são `number | null` (`lib/types.ts`); o front faz
  `?? 0` no `success-initial` (caminho sem cursor, sempre numérico) e ignora
  `total` no `success-more`. Teste de cursor (`backend-api-v1-missing`) atualizado
  pra esperar `total: null` nas páginas com cursor.
- **D2 ✅** — projeção de lista enxuta `CLIENT_LIST_SELECT` + `SAMPLE_LIST_INCLUDE`
  (usados só no `findMany` da lista; detalhe/resolve seguem com `SAMPLE_INCLUDE`).
  Remove a PII **cpf, cnpjRoot, phone** do payload da lista. **Refino da nota do
  plano:** a nota dizia remover `code`/`personType` também, mas **ambos foram
  MANTIDOS** — `personType` é necessário pro `displayName` (`PF ? fullName :
legalName`) e `code` é não-nulável no tipo do front. Como `mapOwnerClient` faz
  `?? null`, o **shape** do retorno não muda (cpf/cnpj/phone saem `null`).
- **D3 ✅** — migration `20260625120000_sample_lot_int_id_nulls_last`: recria
  `idx_sample_lot_int_id` como `("internal_lot_number_int" DESC NULLS LAST,
"id" ASC)` pra casar com o keyset (antes era `DESC` = NULLS FIRST → mismatch →
  Sort). Aplicada com `migrate deploy` local sem erro; raw SQL (não no
  schema.prisma, consistente com o índice original). ⚠️ **Vai rodar no migrate
  job do próximo deploy.**

**Verificação:** ✅ `test:integration:db` (290) cobre `listSamples` filtros +
cursor; teste de cursor confirma `total: null` no load-more; nenhum teste lê
PII da lista. ⚠️ trunca o DB local — reseed feito (`db:seed`).

---

## Fase 4 — Gargalo de render da lista (G3) ✅

**Status:** código pronto, gates verdes (lint/format/typecheck/build). Falta
**validação em device real** (mobile + iOS PWA + desktop).

**Decisão (2026-06-25): NÃO usar `@tanstack/react-virtual` — usar
`content-visibility`.** A análise mostrou que o scroller difere por breakpoint
(mobile = janela; desktop = container `.spv2-list-scroll`), o que tornaria a
virtualização real arriscada (hooks `useWindowVirtualizer` vs `useVirtualizer`
não-condicionais → dois componentes ou unificar o scroller, mexendo no que o
iOS PWA já provou frágil) e complexa (remedir altura, reescrever load-more +
restauração de scroll, neutralizar re-animação no unmount). `content-visibility`
entrega o mesmo ganho de render com risco ~zero.

**O que foi feito:**

- **G3 ✅** — `content-visibility: auto` + `contain-intrinsic-size: auto <h>`
  (88px mobile / 108px desktop) nos itens da lista (`.spv2-card-wrap` idle +
  `.spv2-card.is-blend-selectable` liga) em `app/globals.css`. O browser pula
  render/layout/paint dos cards fora da tela (o gargalo real) **sem** tocar no
  scroller, load-more, observer nem na restauração de scroll. `auto` faz o
  browser lembrar a altura real após o 1º render. Degrada para render normal
  onde não há suporte (Safari < 18).
- **Animação de entrada:** removido o escalonamento por índice (o
  `animationDelay` inline + a prop `index` do `SampleCard`; supersede o cap do
  G2). Motivo: com `content-visibility`, um card revelado no scroll começaria a
  animação naquele momento e ficaria **invisível durante o delay** (`backwards`)
  → "branco→fade". O fade `spv2-cardIn` (0.35s) foi **mantido**, só sem stagger.

**Verificação (device real — iOS PWA é o ponto crítico):**

- Rolar lista longa (vários load-more): scroll suave, sem cards em branco.
- Animação de entrada: cards aparecem com fade (sem cascata), e revelados no
  scroll **não** piscam em branco.
- **Restauração de scroll** ao voltar do detalhe — ⚠️ ponto a observar: com
  `content-visibility`, cards acima do ponto restaurado usam a altura estimada
  até renderizar; se houver **cards expandidos** acima, pode haver leve deriva
  (o comum, tudo colapsado, casa com a estimativa). Conferir em scroll profundo.
- Expandir card, rolar pra longe e voltar: mantém a altura expandida.
- Modo Liga: cards seguem selecionáveis/acinzentados; entrada OK.
- Desktop: scroll do container suave.

---

## Fase 5 — Inconsistências / Acessibilidade ✅

**Status:** código pronto, gates verdes (lint/format/typecheck/build). Falta
validação no device (visual + teclado/leitor de tela).

**O que foi feito:**

- **I2 ✅** — empty-state da lista agora é condicional ao `selectionMode`: em
  modo Liga mostra "Nenhum lote disponível para liga" / "Ajuste os filtros
  ou saia do modo liga" (`app/samples/page.tsx`).
- **I3 ✅** — `.spv2-skeleton-card` (`app/globals.css`) realinhado ao card v2
  branco: raio `clamp(14px,4vw,16px)`, sombra suave (sai a borda verde
  tracejada), base cinza-clara neutra (shimmer segue visível), min-height 80px.
- **I4 ✅** — `SampleCreateRadialFab`: foca a 1ª opção (`Lote`) ao abrir o leque
  e devolve o foco ao FAB ao fechar SEM ação (Escape/tap-fora/toggle) — guard
  por `actionFiredRef` pra numa seleção o foco ir pro modal/tela aberta. Refs
  `firstOptionRef`/`fabButtonRef` + effect no `open`. (Setas = não feito, era
  opcional.)
- **I5 ✅** — card inelegível (`SampleCard.tsx`): `aria-pressed` omitido quando
  inelegível (`isIneligible ? undefined : isSelected`), mantém só `aria-disabled`.
- **lacuna #6 — parcialmente já pronto + live region ✅:** o foco de
  abrir/fechar do **`BlendConfirmationSheet`** já vem do `BottomSheet`
  compartilhado (`role="dialog"` + `aria-modal` + `useFocusTrap` + Escape) e o
  **modal de filtros** já tem trap + restauração + Escape próprios — nada a
  mudar. _(O modal de filtros virou `BottomSheet` na F1 do redesenho, então
  hoje ele **não tem mecanismo próprio**: foco, Escape e scroll-lock vêm do
  sheet compartilhado, como no `BlendConfirmationSheet`. A conclusão "nada a
  mudar" continua valendo, por outro motivo.)_ Adicionado o que faltava:
  **live region** `role="status" aria-live="polite"` (classe
  `login-visually-hidden`) que anuncia "Carregando mais lotes" no load-more
  (rolagem infinita não entra mais em silêncio).

**Verificação:** visual (empty-state da Liga, skeleton no load-more) +
teclado/leitor de tela (foco do leque: abrir→1ª opção, Escape→FAB; card
inelegível sem "pressed"; anúncio do load-more).

---

## Fase 6 — Código morto (CSS) + docs [arquivo compartilhado] ✅

**Status:** código pronto, gates verdes (lint/format/typecheck/build). Todos os
seletores removidos foram confirmados com **0 usos no JSX** antes de apagar.

**O que foi feito (CSS morto /samples-scoped, removido cirurgicamente):**

- **M3 ✅** — bloco `.spv2-sort-btn` (isolado).
- **M4 ✅** — `.spv2-card-stat-{num,divider,total,unit}` + `--primary` (variantes
  do design antigo de stats), **mantendo** `-label`/`-value`/`-value--empty`/
  `--peneira` (vivos, intercalados — removido item a item).
- **M2 ✅** — bloco base `.spv2-footer`/`.spv2-page-btn`/`.spv2-page-info`
  (paginação por botão; a lista usa cursor) + os overrides desktop
  `.samples-page-v2 .spv2-footer/.spv2-page-btn` (2 `@media`).
- **M5 ✅** — overrides desktop `.samples-page-v2 .spv2-chips/.spv2-chip`
  (2 `@media`), mantendo a base/`.clients-page-v2`.
- **M1 (parcial) ✅** — `.samples-page-search` (regra isolada) removida.

**M6 ✅ (mecanismo corrigido):** a "dep dupla" `[samplesKey, samples]` do effect
de sync do `BlendConfirmationSheet` é **intencional** (o comentário explica: re-
sincroniza `availableSacks` quando o refetch muda o array sem mudar os ids). O
fix do plano ("ler via ref") **quebraria** essa re-sync. A raiz era a prop
`samples` recriada a cada render (`.filter()` inline no `page.tsx`) → agora
memoizada (`useMemo` `selectedSamplesForSheet`, deps `[items, selectedIds]`):
o effect só re-dispara quando o conteúdo muda. `BlendConfirmationSheet` intacto.

**S1 ✅** — `docs/API-e-Contratos.md` (`GET /api/v1/samples`) reescrito com os
filtros reais (busca/displayStatus/harvests/clientIds/classificação/sacas/
período/isBlend, `eligibleForBlend` opcional) + nota do `total: null` no load-more.

**✅ RESOLVIDO (ciclo LOT da Revisão Geral, 2026-07-07, commit `6080815`) —
bloco legado `.samples-page-*` (não-v2):** os 84 blocos foram removidos por
parser de seletor (bloco a bloco, nunca por faixa), com verificação prévia
token a token (0 usos, incluindo concatenação/template) e contagem
pós-remoção das famílias vizinhas intactas (`.records-client-*` 27,
`.records-mode-switch` 6, `.samples-filter-modal` 41, `.spv2-*` 239).
−594 linhas. **Nota pro ciclo CLI:** `.records-client-*` e
`.records-mode-switch` também aparentam 0 usos no código (o /clients foi
refatorado desde a análise original) — conferir e limpar lá, junto dos
satélites `.clients-page-v2 .spv2-footer/chip` (esses seguem deferidos).

---

## Testes (lacuna #7 — ✅ resolvida no ciclo LOT da Revisão Geral, 2026-07-07)

> **Resolvido:** reducer extraído pra `lib/samples/samples-list-reducer.ts`
>
> - 6 testes unit (`tests/samples-list-reducer.test.ts`, no `test:unit` via
>   `--experimental-strip-types`, commit `2917953`); filtros de classificação
> - `listClassificationValues` + `isBlend` + `eligibleForBlend` cobertos em
>   `tests/sample-classification-filter.integration.test.js` (`0fa7d38`). O
>   fetch unificado do Modo Liga segue validado no device (sem harness de
>   componente — inalterado). Texto original abaixo, como histórico:

Stack de teste do repo: **`node:test`** (`node --test`, JS puro). **Não há**
harness de teste de componente React. O runner lista cada arquivo
explicitamente no script `test:unit` do `package.json` → ao adicionar um teste,
**incluir o arquivo nessa lista**.

- **Reducer** (`samplesListReducer`, **extraído** para `lib/samples/samples-list-reducer.ts`):
  para testar, **extrair** para um módulo próprio sem deps de React (ex.
  `lib/samples/samples-list-reducer.ts`), importar no `page.tsx`, e cobrir
  `success-initial`/`success-more`/reset/token em `tests/`. Essa extração é um
  passo dedicado (deve ser verificada por si).
- **Fetch unificado do Modo Liga** (effect com refs/otimista): difícil em
  `node:test` puro — validar no device por enquanto; reavaliar se vale um
  harness de componente.
- **`test:integration:db`** já cobre `listSamples` — estender para o cursor
  sem `COUNT` (D1) e a projeção enxuta (D2) na Fase 3.

---

## Protocolo de verificação (cada fase)

1. Gates: `npm run lint && npm run format:check && npm run typecheck && npm run build`.
   - ⚠️ **Nunca** `build` com `next dev` ativo (quebra o `.next`).
2. `npm run test:unit` (e `test:integration:db` nas fases de dados/backend —
   ⚠️ trunca o DB local; reseed com `npm run db:seed` depois).
3. Manual mobile + desktop (o usuário valida no device; a virtualização exige
   **iOS PWA real**).
4. **Commit por fase**, gates verdes, hunks isolados no `globals.css`.
   **Sem push/deploy** (é do usuário).

---

## Regras operacionais (lembrar a cada fase)

- **Agente paralelo:** commitar **só** o próprio escopo (`git add` seletivo /
  `git add -p`), nunca `git add -A`. O `globals.css` é compartilhado.
- **Migrations:** nunca editar existentes; criar novas.
- **Push é do usuário.** Eu commito; não faço push nem deploy.
- **Mensagens de UI sempre em pt-BR.**
- **Skill-maintenance:** após mexer em código, conferir se alguma skill em
  `.claude/skills/` precisa atualizar.
