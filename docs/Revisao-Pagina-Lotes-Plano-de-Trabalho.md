# Revisão da Página de Lotes (`/samples`, lista) — Plano de Trabalho

> **Escopo:** a **lista** de `/samples` (mobile + desktop). O **detalhe**
> (`/samples/[sampleId]`) está **fora** deste plano.
> **Origem:** revisão robusta por workflow multiagente com verificação
> adversarial (2026-06-24): **36 achados → 29 confirmados, 7 refutados**.
> **Objetivo:** deixar a página **sem bugs, inconsistências nem gargalos**.
> **Execução:** faseada — cada fase é aprovada no device e commitada
> separadamente. Push e deploy são do usuário.

## Status geral

| Fase | Tema                                                         | Status                                                            |
| ---- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1    | Bugs do Modo Liga (unificar o fetch) — B1–B5                 | ✅ **Código pronto + commit `57dc023`** — falta validar no device |
| 2    | Gargalos de render — G1, G2, G5, G4                          | ⏳ pendente                                                       |
| 3    | Camada de dados (backend) — D1, D2, D3                       | ⏳ pendente                                                       |
| 4    | Virtualização da lista — G3                                  | ⏳ pendente (maior risco — por último)                            |
| 5    | Inconsistências / acessibilidade — I2, I3, I4, I5, lacuna #6 | ⏳ pendente                                                       |
| 6    | Código morto (CSS) + docs — M1–M6, S1                        | ⏳ pendente                                                       |
| —    | Testes de regressão (lacuna #7)                              | ⏳ pendente (junto das fases de lógica/dados)                     |

> ⚠️ As referências `arquivo:linha` abaixo são **âncoras por símbolo** — os
> números deslocam conforme os arquivos mudam (a Fase 1 já deslocou o
> `page.tsx`). **Sempre `grep` pelo símbolo antes de editar.**

---

## Decisões do usuário (travadas)

1. **Escopo:** cobrir **todos os 29** achados, em fases.
2. **Modo Liga:** **unificar o fetch** num único caminho (resolver a raiz, não
   remendar bug a bug).
3. **`PARTIALLY_SOLD`:** **manter "Em aberto"** no card (consistente com o
   detalhe) → o achado I1 **não entra** no plano.
4. **Lista:** **virtualizar agora** (`@tanstack/react-virtual`).

---

## Arquivos centrais

- `app/samples/page.tsx` — página (fetch, reducer, snapshot, modo Liga, modal de filtros).
- `components/samples/SampleCard.tsx` — card do lote.
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

- **I2** — empty-state genérico ("Nenhuma amostra encontrada") mesmo no modo
  Liga (deveria ser "Nenhuma amostra disponível para liga").
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

## Fase 2 — Gargalos de render (quick wins, preparam a virtualização)

- **G1** — `React.memo` no `SampleCard` (`components/samples/SampleCard.tsx:119`
  — `export function SampleCard`) + estabilizar handlers em `page.tsx` com
  `useCallback`: `toggleSampleSelection` (`:1330`), `toggleCardExpand` (`:1340`),
  `showIneligibleReason` (`:1349`) já usam updater funcional → deps vazias.
- **G2** — cap no `animationDelay` (`SampleCard.tsx:132`):
  `Math.min(index, 12) * 0.04` (ou zerar nos itens de load-more).
- **G5** — extrair `renderFilterFields` (`page.tsx:1603`) e
  `renderClientMultiFilter` (`page.tsx:1470`) para um componente **memoizado**
  que recebe `draftHiddenFilters` + setters, isolando o re-render do modal da
  lista.
- **G4** — cachear `listClassificationValues` (4 chamadas em `page.tsx:804-807`):
  refetch só se vazio/invalidado, **ou** `Cache-Control` no endpoint +
  `cachePolicy: 'default'` na chamada (padrão do `getDashboard` em
  `lib/api-client.ts`).

**Verificação:** React DevTools Profiler — digitar na busca **não** deve
re-renderizar os cards; reabrir o modal de filtros **não** refaz as 4 chamadas.

---

## Fase 3 — Camada de dados (backend)

- **D1** — em `src/samples/sample-query-service.js` (`listSamples`, ~`:1438`),
  contar só sem cursor: `const total = cursor ? null : await
prisma.sample.count(...)`. Mantém o `$transaction` apenas no caminho inicial.
  O front já ignora `total` no `success-more`.
- **D2** — projeção de **lista** enxuta, separada da de detalhe. Hoje
  `SAMPLE_INCLUDE` usa `CLIENT_INCLUDE_SELECT` (`:106`) com
  `code, personType, cpf, cnpjRoot, phone, legalName, tradeName, …`. Para a
  lista, criar um select menor: **manter** `id`, `status`, e o que alimenta o
  `displayName` em `mapOwnerClient` (`:764`) — `fullName`/`legalName`/
  `tradeName` (o `displayName` derivado é usado como fallback do nome em
  `BlendConfirmationSheet.tsx:353`). **Remover** `cpf`, `cnpjRoot`, `phone`,
  `code`, `personType` da projeção da lista.
- **D3** _(opcional/baixo)_ — nova migration recriando `idx_sample_lot_int_id`
  como `("internal_lot_number_int" DESC NULLS LAST, "id" ASC)` pra casar com o
  keyset; OU validar via `EXPLAIN ANALYZE` que não há `Sort` (tabela pequena
  hoje). **Nunca editar a migration existente** — criar nova.

**Verificação:** `test:integration:db` (cobre `listSamples`) — ⚠️ trunca o DB
local, reseed depois. Conferir payload da lista sem PII; `EXPLAIN` da query;
smoke da paginação por cursor.

---

## Fase 4 — Virtualização da lista (G3) [maior esforço/risco — por último]

Introduzir `@tanstack/react-virtual`. Pontos de design (pode virar sub-plano):

- **Scroller difere por breakpoint:** mobile = scroll da **janela**; desktop =
  container `.spv2-list-scroll`. Resolver com `useWindowVirtualizer` (mobile)
  vs `useVirtualizer` + `getScrollElement` (desktop), ou unificar num container.
- **Altura variável:** card colapsado vs expandido, mobile vs desktop → usar
  `measureElement` (medição dinâmica) + remedir ao expandir.
- **Load-more:** disparar pelo range do virtualizer (último item virtual perto
  do fim) no lugar do/junto ao `IntersectionObserver` (`loadMoreRef`).
- **Restauração de scroll** (`readListScrollTop`/snapshot) → vira offset do
  virtualizer.
- **Modo Liga:** lidar com as duas formas de DOM do card (`.spv2-card-wrap` vs
  `.spv2-card`).
- Render condicional do `.spv2-card-expanded-inner` só quando expandido.

**Verificação:** device **real** — **iOS PWA standalone** (lacuna #8) + Android

- desktop. Conferir scroll suave, restauração ao voltar do detalhe, load-more,
  e a foto/peneiras do card expandido.

---

## Fase 5 — Inconsistências / Acessibilidade

- **I2** — copy de empty-state no modo Liga (`page.tsx:2122` —
  "Nenhuma amostra encontrada"): "Nenhuma amostra disponível para liga" quando
  `selectionMode === 'blend'`.
- **I3** — alinhar o skeleton (`.spv2-skeleton-card`, `page.tsx:2145` +
  `app/globals.css`) ao card v2 branco (fundo branco/claro, raio
  `clamp(14px,4vw,16px)`, sombra suave em vez de borda verde tracejada,
  min-height ~ card real).
- **I4** — `SampleCreateRadialFab` (`components/samples/SampleCreateRadialFab.tsx:53`):
  focar a 1ª `.fab-fan-option` ao abrir + restaurar foco ao FAB ao fechar
  (+ setas, opcional).
- **I5** — card inelegível (`SampleCard.tsx:170-171`): omitir `aria-pressed`
  (manter só `aria-disabled`).
- **lacuna #6** — a11y do `BlendConfirmationSheet` e do modal de filtros (foco
  ao abrir/fechar) + live region anunciando o load-more.

**Verificação:** navegação por teclado + leitor de tela no leque, card
inelegível e nos sheets.

---

## Fase 6 — Código morto (CSS) + docs [arquivo compartilhado]

> **Remover só após `grep` confirmar 0 usos no JSX.** `app/globals.css` é
> editado por outro agente → isolar hunks (`git add -p` / `git apply --cached`)
> e commitar só o meu escopo. Linhas abaixo são aproximadas — confirmar por
> seletor.

- **M1** — `.samples-page-*` (não-v2) + `.samples-page-search`. ⚠️ checar
  `.records-*` / `.records-client-*` intercaladas **separadamente** (lacuna #5)
  — só os `.samples-page-*` estão confirmados mortos.
- **M2** — `.spv2-footer` / `.spv2-page-btn` / `.spv2-page-info` (base +
  overrides desktop). Confirmar que ProspectorDashboard/users **não** usam footer.
- **M3** — `.spv2-sort-btn`.
- **M4** — `.spv2-card-stat-{num,divider,total,unit,--primary}` (manter
  `-label`, `-value`, `-value--empty`, `--peneira`).
- **M5** — overrides `.samples-page-v2 .spv2-chips/.spv2-chip` (desktop).
- **M6** — `BlendConfirmationSheet.tsx:182-185` — simplificar a dep dupla
  `[samplesKey, samples]` (manter só `samplesKey`, ler `samples` via ref).
- **S1** — atualizar `docs/API-e-Contratos.md` (item "1. `GET /api/v1/samples`",
  ~`:79-81`) listando os filtros **reais**: busca por texto, `displayStatus`,
  safra multi (`harvests`), proprietário/comprador/enviado-para (`clientIds`),
  classificação (padrão/aspecto/catação/certificado), faixa de sacas
  (`sacksMin`/`sacksMax`), período, `isBlend`; opcional `eligibleForBlend`.

---

## Testes (lacuna #7 — a página não tem cobertura hoje)

Stack de teste do repo: **`node:test`** (`node --test`, JS puro). **Não há**
harness de teste de componente React. O runner lista cada arquivo
explicitamente no script `test:unit` do `package.json` → ao adicionar um teste,
**incluir o arquivo nessa lista**.

- **Reducer** (`samplesListReducer`, hoje **privado** em `page.tsx:454`):
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
