# Redesign — Plano de Trabalho

> **Status**: F1 e F3 **✅ validadas** (2026-07-20, Flavio no dev local); **F2 (lote) implementada 2026-07-20** — aguarda validação 🖥️📱 (junto com os gates RD10 pendentes dela)
> **Última atualização**: 2026-07-20
> **Prefixo de decisões**: RD
> **Par futuro**: quando o padrão consolidar, o funcionamento real será absorvido pelos docs canônicos e pelas skills (`modals`, `design-system`, `responsive`). A frente visual parte de `docs/Design-Language.md` (canônico dos tokens).

Documento centralizado do ciclo de redesign do app, com duas frentes:

1. **Navegação — detalhes-como-modais**: os detalhes de **lote**, **cliente** e **contrato** deixam de ser páginas e viram **overlays sobre as listas**. Não existe mais "página de detalhe"; existe lista + overlay endereçável por URL.
2. **Linguagem visual**: reforma geral de design e layout do sistema ("o app ficará bem diferente"). Depende de mockups do Flavio; estiliza o app **uma vez só, já na estrutura definitiva** (ver RD6).

---

## 1. Ledger de decisões (RD)

Todas travadas em **2026-07-20** (conversa de kickoff, com levantamento de código no §4).

- **RD1 — Detalhe é overlay, não página.** Vale para lote, cliente e contrato. Fora do escopo: o **laudo público** (`public-laudo/`, alvo do QR externo) continua página independente; `/users`, `/profile` e demais páginas não-entidade não mudam.
- **RD2 — Endereçamento por query param sobre a lista.** `/samples?lote=<id>` e `/cadastros?cliente=<id>` (nomes dos params a fechar no plan mode da F1). As rotas antigas `/samples/[sampleId]` e `/clients/[clientId]` **viram redirects** preservando query (`?focus=`, `?source=`) — QR físico, scanner e links salvos continuam funcionando sem tocar no backend. Back fecha o overlay; refresh reabre lista+overlay; link é compartilhável. **Intercepting/parallel routes do App Router foram avaliadas e descartadas**: complexidade real e conflito com o modelo manual de histórico já adotado (árbitro de popstate do `BottomSheet`).
  **Adendo (validação de 2026-07-20):** a superfície canônica da lista de clientes é **`/cadastros` (aba Clientes)** — desde a unificação de acesso, o item "Clientes" não existe na nav de nenhum papel (`CLIENT_MANAGEMENT_ROLES = NON_PROSPECTOR_ROLES` tornou o filtro do split sempre-verdadeiro) e a lista `/clients` está **órfã** (nenhum link de UI aponta para ela). O overlay do piloto mora em `/cadastros`; `/clients` (lista) e `/clients/[clientId]` viram redirects na F1, que também limpa os comentários defasados do split (`app/cadastros/page.tsx:23`, `components/AppShell.tsx:456,956`).
- **RD3 — Mobile: sheet de tela cheia.** Slide de baixo, header com fechar, back fecha via árbitro, `100lvh` + safe areas (regras da casa de iOS PWA). Conteúdo visualmente próximo da página atual; o ganho é a navegação (lista viva atrás, filtros/scroll preservados, voltar instantâneo).
- **RD4 — Desktop: painel lateral (peek).** Desliza da direita; a **lista continua visível e clicável** — clicar noutro card troca o item aberto no painel sem fechar/reabrir. Escolhido sobre o dialog central. O contêiner abstrai a apresentação, então reverter é barato se o mockup da frente visual pedir outra coisa.
- **RD5 — Contêiner único** (nome de trabalho: `DetailOverlay`). Decide a apresentação pelo dispositivo (RD3/RD4) e centraliza: integração com histórico (árbitro), focus trap (`lib/use-focus-trap`), scroll lock e **empilhamento** (modais internos e câmera abrem SOBRE o overlay de detalhe). Conteúdo idêntico nos dois mundos.
- **RD6 — Estrutura antes da pele.** F1–F3 **transplantam** o conteúdo atual para o overlay **sem redesenho visual** (nada de pixel-pushing em tela que vai mudar de cara). A frente visual (FV) vem depois, com mockups, estilizando no lugar definitivo.
- **RD7 — Piloto: cliente.** Menor (2.414 linhas), beneficia `/clients` e `/cadastros` de uma vez (`ClientsBrowser` compartilhado) e já tem semente: o modal-resumo `cdm-modal` do `ClientsBrowser` ("Gerenciar cliente" → página, gate ADMIN+CADASTRO). O overlay absorve resumo E gestão; o gate de papel vira **modo interno** (resumo para todos; gestão para ADMIN+CADASTRO). Detalhes do modo no plan mode da F1.
- **RD8 — Lote: quebrar antes de mover.** `app/samples/[sampleId]/page.tsx` (3.904 linhas) é decomposto em seções por **refactor mecânico sem mudança visual** (commits próprios), e só então transplantado. Sem isso a F2 vira big-bang.
- **RD9 — Contrato: realinhamento, não conversão.** O detalhe já é modal (`SaleContractDetailsModal` dentro do `ContratosPanel`, deep-link `?details`). Na F3 ele adota o padrão do contêiner (peek no desktop / sheet no mobile). Conecta com a pendência **P27** (design das páginas de Contrato).
- **RD10 — Kickoff gated.** F0 (este doc) feita já; **código só depois de validar no device as frentes pendentes que tocam as mesmas telas** (ver §5). Evita misturar regressões novas com validações em aberto.

## 2. Fases

| Fase   | Escopo                                                                                                                                                                                                                                                     | Estado                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **F0** | Decisões RD1–RD10 + este doc + registro do ciclo                                                                                                                                                                                                           | ✅ 2026-07-20                                                                                |
| **F1** | Contêiner `DetailOverlay` (apresentação por dispositivo, histórico, foco, empilhamento) + piloto **cliente** em `/cadastros` (absorve `cdm-modal` + página de gestão) + redirects de `/clients` e `/clients/[clientId]` + limpeza dos comentários do split | ✅ validada 2026-07-20 (Flavio, dev local); skills sincronizadas                             |
| **F2** | **Lote** — F2a: quebra do page.tsx em seções (refactor mecânico); F2b: transplante para o overlay; F2c: cadeias (câmera, impressão, classificação, envio, liga) sobre o overlay + redirects                                                                | 🚧 implementada 2026-07-20 (5 commits `81e80fe`..; **🖥️📱 validar**, ver §2.3)               |
| **F3** | **Contrato** — realinhar `SaleContractDetailsModal` ao padrão (+ P27)                                                                                                                                                                                      | ✅ validada 2026-07-20 (Flavio, dev local; foi **antecipada** antes da F2). P27 segue aberta |
| **F4** | Limpeza: rotas antigas só-redirect (ou remoção), morte do snapshot de sessionStorage do `SampleCard`, sync final de skills/docs                                                                                                                            | ☐                                                                                            |
| **FV** | Frente visual: mockups → tokens (`Design-Language.md`) → reskin geral                                                                                                                                                                                      | ☐ aguarda mockups; pode iniciar após F1 validada                                             |

Cada fase abre em **plan mode** e só fecha com **validação no device** (🖥️ + 📱), como nos demais ciclos.

### 2.1 F1 — implementada e ✅ validada (2026-07-20)

Cinco commits atômicos, gates completos verdes (lint, format, typecheck, build, schemas, unit 535, contracts 20):

1. `5021e77` — `BottomSheet` aceita `manageHistory=false`: overlay dirigido por URL pula SÓ o árbitro de história; ESC, scroll-lock, tabbar-hide e empilhamento (`sheetStack`) continuam. (Não usar `stacked` pra isso: subiria o overlay pro tier z 600, ACIMA dos modais internos.)
2. `2510659` — extração mecânica de `components/clients/ClientDetailView.tsx` (ex-página de 2.414 linhas): saem AppShell, guard e loading global; entram props `{ session, clientId, dismissGuardRef }` e loading inline.
3. `47dccde` — `components/DetailOverlay.tsx` (wrapper `detail-overlay` + `manageHistory=false` + `dismissGuardRef` — ESC/X não fecham com modal interno aberto) + cola de URL no `/cadastros` (`?cliente=<id>`: **push** pra abrir → back fecha; **replace** pra trocar de cliente; fechar = back se fomos nós que demos push, senão replace limpando o param — molde do `/login ?modal`) + `ClientsBrowser` troca o `cdm-modal` por `onOpenClient(id)` (FAB de criação auto-abre o novo) + CSS: mobile tela cheia (`--bottom-sheet-top-gap: 0`), desktop painel 620px com backdrop transparente e `pointer-events: none` via `:has()` (lista viva) e coluna única no `sdv-content-inner`. Os 4 modais inline da view ganharam `createPortal(document.body)` — o `transform` do sheet viraria containing block do `position: fixed`.
4. `11df8b1` — `/clients` e `/clients/[clientId]` viram **redirects RSC** (preservando `?incomplete=true` e o id); AppShell perde o split morto (item de nav, branches, swap mobile, `canManageClients`); seletores `.cdm-*` órfãos removidos.
5. este commit — doc + memória. Skills só após validação no device (§7).

**Desvio do planejado (RD7)**: o `cdm-modal` morreu como _feature_ (JSX, estado e fetch no `ClientsBrowser`), mas parte do CSS `.cdm-*` **fica** — o modal de detalhe de usuário em `/users` reusa as classes. Só os seletores exclusivos do resumo de cliente saíram.

**Checklist de validação (🖥️ ≥901px, 📱 device):**

- Card abre o overlay (URL ganha `?cliente=`); back fecha; X/ESC fecham; refresh e deep-link reabrem lista+overlay; fechar após deep-link limpa o param sem sujar o histórico.
- 🖥️ Lista continua rolando e clicável com o painel aberto; clicar noutro card TROCA o cliente (back ainda fecha em 1 passo); coluna única sem overflow nos 620px.
- Modais internos (10) cobrem o viewport inteiro no peek (prova dos portais) e empilham sobre o sheet no mobile; ESC com modal aberto NÃO fecha o overlay; toasts acima de tudo.
- Criar cliente pelo FAB auto-abre o overlay do novo.
- 📱 Tabbar some com o overlay aberto e volta ao fechar; teclado iOS nos inputs de edição no fim do conteúdo (risco §6.3).
- `/clients` e `/clients/<id>` redirecionam (com `?incomplete` e id preservados); PROSPECTOR segue barrado; a nav mobile mostra "Cadastros" no 4º slot pra todo papel.

### 2.2 F3 — implementada e ✅ validada (2026-07-20, antecipada)

**Antecipação**: por decisão do Flavio (2026-07-20, logo após validar a F1), a F3 veio **antes da F2** — os gates de device da F2 (câmera Rodada 2, liga/safra, auditoria) seguem pendentes e não tocam `/contratos`. Atenção: as frentes **espelho**, **aprovação (AP31–AP33)** e **embarque** também aguardam validação em `/contratos` — a validação da F3 soma-se a elas na mesma sessão de device. **P27** (design das páginas de Contrato) segue aberta — a F3 é só o realinhamento estrutural (RD6/RD9).

Dois commits, gates verdes (typecheck, lint, format; build não rodou — dev server ativo — fica pro pré-push):

1. `55f750b` — `DetailOverlay` aceita `footer` (ações fixas no rodapé, repassa ao BottomSheet) e `className` extra ao lado de `.detail-overlay` (overrides escopados por conteúdo).
2. `abe3ff1` — o realinhamento: `SaleContractDetailsModal` troca o frame central (`.ctr-form-sheet .ctr-contract-sheet .ctr-details-sheet`) pelo `DetailOverlay` (`.ctr-details-overlay`) — peek 620px desktop / sheet tela cheia mobile, **coluna única sempre** (as regras 2-colunas do `.ctr-details-sheet` morreram). No `ContratosPanel`, `?details=<id>` vira **fonte de verdade** (molde do `?cliente=`): push abre, replace troca, fechar = back-se-nosso-push senão replace; param órfão (id fora da lista) é limpo pós-carga. Os **swaps** do rodapé (Editar/Ágio/Washout/Gerar espelho) e o vai-e-volta da conferência (D134) rodam **pós-fechamento** via `afterDetailsCloseRef` — abrir o próximo sheet no mesmo tick do `router.back()` faria o popstate atrasado engolir a entry do sheet novo (fecharia na hora). `dismissGuardRef` interno cobre o confirm de aprovação (AP32) e o lightbox de foto. Deep-links `?details=` (Eventos/Financeiro/Embarque/Aprovações) intactos — e fechar agora limpa o param (antes ficava zumbi).

**Checklist de validação (🖥️ ≥901px, 📱 device):**

- Card "Detalhes" abre o overlay (URL ganha `?details=` preservando `?tab=`); back fecha; X/ESC fecham; refresh e deep-link reabrem lista+overlay; fechar após deep-link limpa o param.
- 🖥️ Lista viva atrás do peek; "Detalhes" de outro card TROCA o contrato (back fecha em 1 passo); coluna única sem overflow nos 620px (PDF, tabelas de valores, galeria do embarque, timeline).
- Rodapé por status: EMITIDO = Editar·Ágio·Deságio·Washout (+ Gerar espelho quando elegível); FATURADO/PAGO = Washout; cada ação FECHA o overlay e abre o fluxo (swap sem sobreposição, sem flash de fechamento do sheet novo).
- Vai-e-volta do espelho: conferência → "Ver detalhes" → fechar (X, ESC ou **back**) reabre a conferência; Editar/Ágio/Washout encerram o vai-e-volta.
- Confirm "Solicitar aprovação" e lightbox de foto abrem SOBRE o overlay; ESC com eles abertos NÃO fecha o overlay.
- 📱 Sheet de tela cheia com respiro lateral correto (o conteúdo `.ctr-details-*` não tem padding próprio); tabbar some/volta; footer de ações acima da safe area.
- Deep-links: "Ver contrato" do card de Eventos, Financeiro, Embarque e Aprovações abrem o overlay na aba Contratos.

### 2.3 F2 — implementada 2026-07-20 (🖥️📱 validar)

**Contexto do destrave**: Flavio autorizou implementar mesmo com os gates de device da F2 (§5) pendentes — câmera Rodada 2 (📱), liga/safra (🖥️📱), auditoria de classificação (📱). A validação da F2 **soma-se a elas** na mesma sessão de device.

Cinco commits atômicos, gates verdes a cada um (typecheck, lint, format, unit 535, contracts 20; build não rodou — dev server ativo — fica pro pré-push):

1. `81e80fe` — extração mecânica de `components/samples/SampleDetailView.tsx` (ex-página de 3.904 linhas, RD8): saem AppShell, guard, loading global e a fileira de navegação do header (fica o `.sdv-header` com o identity card — badge, reverter liga, imprimir); entram props `{ session, sampleId, dismissGuardRef }`, loading inline e o efeito `detailBusy → dismissGuardRef` (11 flags de modal/ação). A rota vira casca fina transitória.
2. `1e2c14b` — os **7 modais inline** do detalhe (invalidar, imprimir, editar data, editar registro, `cld-modal`, confirmar salvar, reclassificar) + o call site do `PhotoZoomViewer` ganham `createPortal(document.body)` (LDT-P1 — o `transform` do sheet viraria containing block do `position: fixed`).
3. `bf707f5` — o transplante: `?lote=<id>` em `/samples` vira **fonte de verdade** (molde do `?cliente=`): push abre, replace troca, fechar = back-se-nosso-push senão replace; abrir/trocar limpa `focus`/`highlight`/`source` residuais e preserva `tab`/`displayStatus`; fechar dispara **refetch silencioso** da lista (`requestSilentRefetch`). No view: sai o marcador `--sample` (mata o desktop 2-colunas por seletor), classificação rende a variante mobile no peek, X vermelho fecha o overlay. Links detalhe→detalhe (composição, comprometida, inviável, cascata, modal de bloqueio) trocam via replace com `href=/samples?lote=` de deep-link. CSS `.lote-details-overlay` repõe fundo branco + sombra dos cards.
4. `763de81` — cadeias: watcher pós-câmera no view (`isOpen` true→false do `useCameraSheet` → `refreshDetail`); `CameraSheet.navigateToSample` (mesmo lote = no-op só-fecha, outro lote = replace, fora de /samples = push — lê `window.location` no clique); `NewSampleModal` default → `?lote=`; **`/samples/[sampleId]` vira redirect RSC preservando a query** (QR físico, scanner, busca global); AppShell perde `isSampleDetail` (tabbar some via `body.is-bottom-sheet-open`); `variant` removido (`onClose` obrigatório) e os ramos desktop do card de classificação ficam **dormentes** atrás de `effectiveDesktop=false` até a FV.
5. este commit — doc + memória. Skills só após validação no device (§7).

**Checklist de validação (🖥️ ≥901px, 📱 device):**

- "Detalhes" do card abre o overlay (URL ganha `?lote=` preservando `?tab=`); back/X/ESC fecham; refresh e deep-link reabrem lista+overlay; fechar limpa o param e a lista **refetcha silenciosa** (invalidar/vender/enviar refletem nos cards).
- 🖥️ Lista viva atrás do peek; "Detalhes" de outro card TROCA o lote (back fecha em 1 passo); coluna única sem overflow nos 620px (identity card, classificação variante mobile, composição da liga, movimentações).
- Modais (7 portais + externos + PhotoZoomViewer) cobrem o viewport inteiro no peek; ESC com modal aberto NÃO fecha o overlay.
- 📱 Câmera abre SOBRE o overlay; back fecha a câmera primeiro; ao fechar a câmera o detalhe atualiza (watcher). "Ver detalhes" do sucesso com o MESMO lote atrás = só fecha o sheet.
- Invalidar/reverter → X vermelho → overlay fecha → lista reflete.
- QR físico, bipador e busca global redirecionam com query preservada (`?focus=classification&source=qr` etc.); `?focus=movimentacoes|informacoes` rola DENTRO do sheet; `?highlight=print` pulsa o botão.
- 📱 Tabbar some com o overlay aberto e volta ao fechar; modo liga com peek aberto não quebra; teclado iOS nos inputs de edição no fim do sheet (risco §6.3).
- Novo lote criado fora da lista (dashboard) abre o overlay do recém-criado.

### 2.4 Extensão — CRIAÇÃO como painel lateral (2026-07-20, pedido do Flavio)

Na sequência da F2, os formulários de **criação** também viram painel lateral no desktop (commit `875c777`): classe `.side-sheet` com a geometria do peek de detalhe (620px, slide da direita), mas com **backdrop escurecido/bloqueante padrão** — criação tem estado sujo, a lista atrás NÃO fica clicável (diferença deliberada pro `.detail-overlay`). Não é dirigido por URL (criar não é recurso endereçável; história segue com o árbitro do BottomSheet). Mobile intacto (sheet como sempre).

- **Novo lote** (`NewSampleModal`, FAB de `/samples`): `className` ganha `side-sheet`.
- **Novo cliente** (`ClientQuickCreateModal` via prop nova `sideSheet`, passada só pelo FAB de `/cadastros`). Os quick-creates **aninhados** (novo proprietário dentro do Novo lote etc.) continuam centrais — lateral sobre lateral esconderia o form de baixo.

**Validar junto com a F2 (🖥️)**: FAB → painel lateral desliza da direita com backdrop escuro; lista atrás NÃO clicável; footer (Cancelar/Continuar·Cadastrar) ancorado embaixo; "Descartar?" cobre o painel (cliente) / centraliza sobre tudo (lote); quick-create de proprietário aninhado abre CENTRAL sobre o painel do Novo lote; 📱 mobile sem mudança visual.

## 3. O que NÃO muda

- **Backend**: nenhuma rota de API muda. RD2 é só front + redirects de rota.
- **Modelo de dados dos detalhes**: ambos já são client components buscando via `lib/api-client.ts`; o overlay usa as mesmas chamadas.
- **Laudo público** (QR externo) e fluxo do print agent.

## 4. Inventário técnico (levantamento de 2026-07-20)

- **Tamanhos**: detalhe do lote `app/samples/[sampleId]/page.tsx` = 3.904 linhas (câmera, impressão, classificação, envio físico, liga, movimentos, invalidação embutidos); detalhe do cliente `app/clients/[clientId]/page.tsx` = 2.414 linhas (filiais, contas bancárias, anexos, cascata); hub `/contratos` = casca de 128 linhas sobre `ContratosPanel` (799).
- **Infra existente reaproveitável**: `components/BottomSheet.tsx` (padrão canônico de ação + árbitro de popstate), `lib/use-focus-trap`, `lib/navigation/route-history.ts`, query param como fonte de verdade já praticado (`?tab=`/`?details` no /contratos; `?focus=classification&source=qr` vindo do QR; `?source=scanner`).
- **Sementes**: `cdm-modal` (resumo do cliente no `ClientsBrowser`); `SaleContractDetailsModal` (contrato já-modal).
- **Pontos de entrada do detalhe do lote** (9 mapeados; todos realinhados na F2c): `SampleCard` (com snapshot de sessionStorage a remover na F4), `CameraSheet` ×3 (`navigateToSample`, ex-`navigateFromSheet`), `NewSampleModal`, `SampleInvalidateBlockedModal`, `SampleMovementsPanel` (origem de cascata), `ScannerBridge`, e o **backend** `src/api/v1/backend-api.js` (redirect do QR com `?focus=classification&source=qr` — não mudou; o redirect RSC da rota antiga resolve). Dois são **externos por URL** (QR e scanner) — por isso RD2 exige detalhe endereçável.
- **Entrada do detalhe do cliente**: só o link "Gerenciar cliente" do `cdm-modal` (as duas superfícies passam pelo `ClientsBrowser`).

## 5. Pré-requisitos para destravar código (RD10)

- **F1 (cliente)** — ✅ **cumprido em 2026-07-20.** Validação executada no estado integrado atual: suítes completas verdes (**unit 535 + contracts 20 + integração FULL 492/492**, cobrindo D142/D144/D145/D146/D147 e a unificação de acesso) + conferência de código das superfícies (chips "À definir" no `SaleContractEtapa2Modal`; banco texto livre no `ClientBankAccountModal`; `isSpotWashout` filtrando o Financeiro; propagação auto-confirmada em `sale-contract-service.js`; `/users` ADMIN-only no front e `assertAdminActor` no back; nav sem "Clientes" para todos). O **passe visual** ficou com o Flavio (checklist entregue na conversa de 2026-07-20); achado visual entra como fix antes/junto da F1.
- **F2 (lote)**: validar as frentes que vivem dentro do detalhe do lote — Rodada 2 da câmera/classificação (📱), liga/safra reativa (🖥️📱), auditoria de classificação (📱). **Flavio destravou a implementação em 2026-07-20 mesmo com esses gates pendentes** — a validação da F2 (§2.3) soma-se a eles na mesma sessão de device.

## 6. Riscos mapeados (endereçar nos plan modes)

1. **Empilhamento de overlays**: os ~28 modais internos + câmera passam a abrir sobre o overlay de detalhe (z-index, scroll lock e foco em camadas).
2. **Popstate em cadeia**: detalhe → câmera → preview; o árbitro precisa fechar a camada certa a cada back (histórico recente mostra a sensibilidade: b2c4c49, b2e75b2).
3. **Teclado iOS dentro de sheet de tela cheia** (inputs de edição no fim do conteúdo).
4. **Perf/memória**: lista + detalhe montados simultaneamente no mobile.
5. **Gate de papel do cliente** virando modo interno — não pode vazar gestão para quem não pode (hoje o alívio é só de UI; backend sem gate).

## 7. Skills e docs — quando atualizar o quê

Regra do ciclo: **skill segue consolidação; ledger segue decisão.** Durante experimentação, nada de editar skill.

- **Fechou F1 (validada)** — ✅ feito em 2026-07-20 (`8fe8580`): `design-system` §8 ganhou a seção **DetailOverlay** (molde de URL, peek, gotcha de z-index); `modals` aponta pra ela na árvore de decisão (ação = BottomSheet; aviso = central; **detalhe = DetailOverlay**), atualizou a tabela do cliente (4 modais portalados) e aposentou a exceção inline do §9; `responsive` sem `/clients/[id]`.
- **Fechou F4**: varredura geral (`skill-maintenance`) + este doc aponta para os canônicos.
- **FV consolidada**: reescrita maior de `design-system` (+ revisão de `feedback-messages` e `button-press-effect`), com `Design-Language.md` como fonte dos tokens.
- `skill-maintenance` roda ao fim de **cada** fase, como sempre.
