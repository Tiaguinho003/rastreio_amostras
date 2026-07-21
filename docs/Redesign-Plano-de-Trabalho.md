# Redesign — Plano de Trabalho

> **Status**: F1 e F3 **✅ validadas** (2026-07-20, Flavio no dev local); **F2 (lote) implementada 2026-07-20** — aguarda validação 🖥️📱 (junto com os gates RD10 pendentes dela). **FV piloto `/cadastros`: E1 conferida ✔ + rodadas de ajuste 1–4 aplicadas (§2.6)** — rodada 2 unificou o detalhe (edição interna, documentos/contas inline); **rodada 3 (2026-07-21) o transformou em DRAWER DE PERFIL** (620px, hero com avatar/chips/ações redondas, 3 abas Visão geral·Documentos·Filiais, gráfico de linhas 6 meses no lugar do donut); **rodada 4 (2026-07-21) tornou os painéis MODAIS de verdade** (página bloqueada atrás; peek swap de cliente morreu) + seta ← na borda no lugar do X, cards de filial/conta institucionais, botões "+ Adicionar" nomeados verdes; /cadastros = EXEMPLO das outras páginas; mais rodadas possíveis antes do plan mode da E2 restante (modais internos do detalhe — comportamento a discutir —, re-skin dos restantes, mobile — mobile entra na E2 de cada página)
> **Última atualização**: 2026-07-21
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
- **RD11 — Regras de contêiner por TIPO de modal (2026-07-20, após inventário completo de ~70 superfícies).** Travadas pelo Flavio: **detalhe** de recurso → `DetailOverlay` peek; form de **criação/edição** (incl. view+edit e Documentos) e **informes** → `.side-sheet` (painel lateral bloqueante no desktop); **filtros** → painel lateral; **operações** (venda/perda, envio/laudo, etiquetas, embarque, ágio/washout/faturar/pagar) → **continuam centrais**; **confirmação/descarte/aviso/sucesso** (incl. inativar com motivo) → **continuam centrais**; visualização/pickers/menus/câmera → intactos; form lateral aberto de dentro de um peek → desliza POR CIMA (push, `stacked`); **criação de contrato** (Etapa2 + LotPicker) → FORA (specs futuras). A migração acontece **página a página, junto com o design** (ver §2.5) — nenhuma conversão mecânica antecipada. Inventário por página com o alvo de cada superfície: skill `modals` §11-A.
- **RD12 — Direção visual: "institucional" (2026-07-20, questionário aprovado na íntegra).** Motivação do Flavio: o app atual está "infantil/amador"; quer o aspecto **institucional** de uma referência única (print de SaaS imobiliário desktop). A linguagem travada: **neutralidade** — fundo branco/cinza-claríssimo, cards brancos definidos por **hairline + sombra mínima**, radius **~10–12px** (sai a escala 14–20px "fofa"); cor só **semântica** e em doses pequenas; **o verde-escuro da marca (`#173c30`/`#14372a`) assume o papel do "preto institucional" nos CTAs** (identidade preservada; o verde some como fundo decorativo no desktop — o topo verde do MOBILE é decidido na etapa mobile do piloto); **chips de status pastel** (fundo suave + texto colorido: Ativo/Inativo/Incompleto) viram o padrão de status; **Inter substitui Poppins** na UI (troca global via `next/font`; as peças de informativo mantêm Poppins — gotcha do canvas); **dark mode FORA de escopo**.
- **RD13 — Chrome global institucional (desktop ≥901px, não-PROSPECTOR).** **Sidebar ÚNICA** substitui o trilho+painel (DSB-D15): logo + "Safras" no topo, label "Menu", itens ícone+texto, ativo = **fundo neutro suave** (sai a pílula verde), **sub-itens expandíveis** — Cadastros→Clientes/Corretores; Contratos→Contratos/Financeiro; Embarques→Embarque/Aprovações (deep-link via `?tab=`) —, footer **Perfil + Ajuda** (inerte); **SEM colapso na v1**. **Topbar**: título da seção à esquerda (o `.app-page-title` de DSB-D17 migra pra cá) + sino + **perfil nome+papel+chevron** (avatar sai do trilho; menu = `ProfileMenuCard`); **SEM busca global** (ciclo futuro próprio) e sem mail. **Efeito colateral aceito**: o chrome novo vale para TODAS as páginas desktop imediatamente (o conteúdo de cada página só muda na vez dela). PROSPECTOR (app restrito) fora; mobile intacto na E1.
- **RD14 — Piloto `/cadastros` institucional (E1 desktop → conferência → E2 detalhe+modais+mobile).** Página: **título grande + botão rotulado "+ Novo cliente"** (o FAB redondo morre no desktop; mobile decide na E2); **KPI row com 4 cards** (endpoint leve novo; rodada 1 SUPEROU o "sem delta": ganharam mini-métricas + ícones coloridos, ordem Total → Novos → Incompletos → Ativos); a lista de cards vira **TABELA** (rodada 1 enxugou pra 6 colunas: Cliente avatar+nome+#código · Status ÚNICO Completo/Incompleto/Cancelado · Documento · Contato com ícones · Atualizado relativo · menu ⋯ — Cidade/UF e Responsável saíram); **linha clicável abre o peek `?cliente=`** (RD1/RD2 intactos); **⋯ = ações profundas via URL** (abre o peek já com Editar/Documentos/Status — reusa os modais do detalhe, zero duplicação); **scroll infinito e ordenação alfabética mantidos**; SEM seleção múltipla/bulk na v1; **filtros: modal central → painel lateral** (alvo RD11, nesta passada); **Corretores: tabela enxuta** na mesma linguagem (as abas internas morrem — viram sub-itens RD13). Modais centrais tocados no ciclo perdem o header verde (**novo padrão neutro**; a skill `modals` redefine o canônico na consolidação do piloto).

## 2. Fases

| Fase   | Escopo                                                                                                                                                                                                                                                     | Estado                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **F0** | Decisões RD1–RD10 + este doc + registro do ciclo                                                                                                                                                                                                           | ✅ 2026-07-20                                                                                                    |
| **F1** | Contêiner `DetailOverlay` (apresentação por dispositivo, histórico, foco, empilhamento) + piloto **cliente** em `/cadastros` (absorve `cdm-modal` + página de gestão) + redirects de `/clients` e `/clients/[clientId]` + limpeza dos comentários do split | ✅ validada 2026-07-20 (Flavio, dev local); skills sincronizadas                                                 |
| **F2** | **Lote** — F2a: quebra do page.tsx em seções (refactor mecânico); F2b: transplante para o overlay; F2c: cadeias (câmera, impressão, classificação, envio, liga) sobre o overlay + redirects                                                                | 🚧 implementada 2026-07-20 (5 commits `81e80fe`..; **🖥️📱 validar**, ver §2.3)                                   |
| **F3** | **Contrato** — realinhar `SaleContractDetailsModal` ao padrão (+ P27)                                                                                                                                                                                      | ✅ validada 2026-07-20 (Flavio, dev local; foi **antecipada** antes da F2). P27 segue aberta                     |
| **F4** | Limpeza: rotas antigas só-redirect (ou remoção), morte do snapshot de sessionStorage do `SampleCard`, sync final de skills/docs                                                                                                                            | ☐                                                                                                                |
| **FV** | Frente visual **redefinida (RD11, §2.5)**: ciclo **página-a-página** — contêiner dos modais + design/layout juntos, a partir da referência aprovada (RD12–RD14); piloto `/cadastros`                                                                       | 🚧 E1 conferida ✔ + rodadas 1–4 (§2.6; detalhe = drawer de perfil, painéis modais) — mais rodadas → plan mode E2 |

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

Na sequência da F2, os formulários de **criação** também viram painel lateral no desktop (commits `875c777` + `7a2abbe`): classe `.side-sheet` com a geometria do peek de detalhe (620px, slide da direita), mas com **backdrop escurecido/bloqueante padrão** — criação tem estado sujo, a lista atrás NÃO fica clicável (diferença deliberada pro `.detail-overlay`). Não é dirigido por URL (criar não é recurso endereçável; história segue com o árbitro do BottomSheet). Mobile intacto (sheet como sempre).

- **Novo lote** (`NewSampleModal`, FAB de `/samples`): `className` ganha `side-sheet`.
- **Novo cliente** (`ClientQuickCreateModal`): side-sheet é o **padrão do componente em todos os contextos** (`7a2abbe` matou a prop `sideSheet` do primeiro corte) — FAB de `/cadastros`, "Novo proprietário" do Novo lote, comprador da venda/perda, informe de visita e os quick-creates do contrato. Sobre outro painel lateral, o de cima desliza cobrindo o de baixo (push de navegação; o tier `stacked` z 600 dá a ordem).
- **Criação de contrato**: fora desta extensão — terá especificações próprias do Flavio (falar antes de mexer).

**Validar junto com a F2 (🖥️)**: FAB → painel lateral desliza da direita com backdrop escuro; lista atrás NÃO clicável; footer (Cancelar/Continuar·Cadastrar) ancorado embaixo; "Novo proprietário" desliza SOBRE o painel do Novo lote e fechar revela o form de baixo intacto; "Descartar?" cobre o painel (cliente) / centraliza sobre tudo (lote); 📱 mobile sem mudança visual.

### 2.5 FV redefinida — ciclo página-a-página (RD11, 2026-07-20)

A FV deixou de ser "reskin geral de uma vez" e virou um **ciclo por página**: cada página passa por um **redesenho COMPLETO** — design e layout da página inteira (estrutura, header, cards, listas, filtros, tipografia; "o app ficará bem diferente", frente 2 deste doc) — e, na mesma passada, os modais dela realinham ao contêiner da regra RD11. O contêiner é **parte do pacote, não o escopo**: a página é tocada **uma vez só**, sem retrabalho. Nenhuma conversão mecânica antecipada: superfície fora da vez da sua página **não muda**, mesmo quando a conversão seria barata. (Confirmado pelo Flavio em 2026-07-20: "não mudaremos apenas os modais, mas todo o design e layout das páginas".)

**Processo por página** (emendado 2026-07-20 — o mockup do Flavio **saiu do rito**; supersede o mecanismo descrito em RD11, a regra "página inteira, uma vez só" permanece):

1. **Referência + questionário**: Flavio manda referência(s) visuais (prints de apps que admira) e responde o questionário comparativo que o Claude levanta a partir do estado atual da página; as respostas viram **decisões RD no ledger ANTES de codar**. No piloto, a referência também **calibra o kit visual dos contêineres** (side-sheet, central de confirm, painel de filtros) que as demais páginas replicam.
2. **Plan mode** da página: decisões RD + modais da página × regras RD11.
3. Implementação **direta no código** (sem mockup HTML intermediário), em **2 etapas**: **E1** = chrome/página desktop → **conferência do Flavio no dev local** → **E2** = detalhe/modais/side-sheets + mobile. Commits atômicos (gates: typecheck, lint, format, unit, contracts; build só com dev parado).
4. **Validação no device** (🖥️📱).
5. **Consolidação**: skills (`modals`, `design-system`, `responsive`) + este doc + memória.

**Ordem proposta** (ajustável a cada passo): `/cadastros` (piloto) → `/samples` → `/relatorios` → `/users` + `/profile` → `/contratos` + `/embarques` (sem a criação de contrato — specs futuras) → globais (senha/menu/login). Câmera fica fora (já conforme às regras).

**Inventário de referência**: skill `modals` §11-A (tabela por página com o contêiner-alvo e o status de cada superfície).

### 2.6 FV E1 — implementada e conferida 2026-07-20 (ajustes em rodadas)

Nove commits atômicos (gates por commit: typecheck, lint, format, unit 535, contracts 20; `db34920` também rodou schemas + o arquivo de integração de clientes 61/61 com reseed):

1. `65b182d` **fonts** — Inter na UI inteira (`--font-sans`); Poppins segue SÓ nas peças de informativo via `--font-family-story` (lida pelo canvas em `story-draw.ts`).
2. `5e86ca6` **chrome (RD13)** — sidebar única (logo+"Safras", "Menu", seções expansíveis com sub-itens `?tab=`, ativo neutro, footer Perfil+Ajuda inerte) + topbar (título da seção, sino inerte, perfil nome+papel+chevron → `ProfileMenuCard`). Cascas `.app-topbar`/`.app-sidenav` e tokens preservados; PROSPECTOR e mobile intactos. `AppShellProps.activeSubTab` (AppShell não pode usar `useSearchParams`).
3. `db34920` **GET `/api/v1/clients/stats`** — 4 contagens (`total`/`active`/`incomplete` sobre ativos/`newThisMonth` em BRT −03 fixo); auth-only, PROSPECTOR 403 via allowlist; `Cache-Control: private, max-age=30`.
4. `c02859a` **casca de `/cadastros` (RD14)** — `?tab=` na URL (padrão dos hubs; sub-itens da sidenav deep-linkam), `.fv-page-head` (título + "+ Novo cliente"/"+ Novo corretor"; FAB morre no desktop), `.fv-kpi-row` desktop-only com refetch ao abrir/fechar o overlay; `lib/use-desktop.ts` extraído.
5. `3204753` **tabela de clientes** — `.fv-table` 8 colunas (avatar+nome+#código · chips pastel · documento · contato · cidade/UF · responsável +N · atualizado relativo · ⋯); header sticky, linha clicável (nome é `<button>`), skeleton/sentinel/ordem idênticos aos cards; sheet vira cartão flat hairline. Sem divisores alfabéticos na tabela (decisão RD14).
6. `22c886e` **toolbar + filtros laterais** — `.fv-toolbar` (busca mesma lógica, funil com badge, limpar, contador); filtros saem do modal central pro `BottomSheet` `side-sheet` (400px; ESC/back/foco/lock do próprio sheet). `.samples-filter-modal*` intocado (segue em /samples e /contratos).
7. `df08362` **menu ⋯ + ações profundas** — popover (Ver detalhes/Editar/Documentos/Inativar·Reativar) → `?cliente=<id>&acao=editar|documentos|status`; `ClientDetailView.initialAction` abre o modal UMA vez pós-load e `onInitialActionConsumed` limpa o `?acao=` via replace (back segue fechando em 1 passo; ação repetida no mesmo cliente montado funciona — ref reseta quando a prop limpa).
8. `a241852` **Corretores em tabela** — Nome · Contato · Usuário vinculado · Status · lápis Editar; toolbar com busca + "mostrar inativos"; linha abre o `BrokerFormModal` atual (re-skin na E2).
9. (este commit) **docs + memória**.

**Exceções deliberadas ao "mobile intacto" da E1** (anotar na conferência): (a) **Inter** vale no mobile também (RD12 é global de UI); (b) **filtros de clientes no mobile viram bottom sheet** (eram modal central — efeito do side-sheet, padrão da casa); (c) a aba de /cadastros agora lê/escreve a URL (invisível ao usuário).

**Pendências desta etapa**: `npm run build` + passe de integração completo ficam pro pré-push (dev do Flavio rodando); skills (`design-system`/`modals`) só mudam na consolidação pós-device (§7). Ramos desktop dos cards de cliente ficam DORMENTES atrás do `isDesktop` (não deletar até a FV fechar).

**Checklist de conferência (Flavio, dev local ≥901px)**:

1. Fonte Inter no app todo; gerar uma peça de informativo → continua Poppins.
2. Sidebar única (logo "Safras", Menu, ativo neutro, Cadastros/Contratos/Embarques expandem e navegam por sub-item; footer Perfil + Ajuda) e topbar (título da seção, sino, perfil nome+papel abre Meu perfil/Sair).
3. As 8 páginas desktop funcionais com o chrome novo (conteúdo antigo, sem quebra); PROSPECTOR desktop intacto; mobile intacto (fora as exceções acima).
4. `/cadastros`: título + "+ Novo cliente" (side-sheet §2.4 funciona e auto-abre o overlay do criado); KPI com números certos; tabela (8 colunas, chips, hover, linha abre o peek); ⋯ abre Editar/Documentos/Inativar·Reativar direto no peek; scroll infinito; busca; funil → painel lateral aplica/limpa; `?incomplete=true` pré-filtra; `?cliente=` deep-link ok; aba Corretores em tabela; `?tab=corretores` deep-link ok.
5. Ajustes de degustação esperados (mudo na hora): texto do logo, tons de chips/hairlines, densidade da tabela, largura da sidebar.

#### Rodada de ajustes 1 (2026-07-20, pós-conferência — aprovada com "ficou muito bom")

Flavio aprovou a base e pediu a primeira rodada de ajustes (virão mais; /cadastros vira o EXEMPLO das outras páginas). Seis commits (gates por commit; integração de clientes 61/61 + reseed no commit de stats):

1. `0bf6c15` **logo** — sidenav troca ícone+span "Safras" pelo logo COMPLETO (`logo-safras-color.png`, árvore+wordmark) centralizado, 40px.
2. `af485f8` **stats** — `getClientStats` devolve `newLastMonth` (criados no mês ANTERIOR em BRT, janela `[iníc. mês anterior, iníc. mês corrente)`); teste trocou o cenário "40 dias atrás" (ambíguo) por dia 15 do mês anterior, determinístico.
3. `0d7710d` **KPI** — ordem nova (total → novos → incompletos → ativos); ícone com traços E borda na cor do card (azul `--fv-blue`/verde/âmbar; preenchimento branco); mini-métrica sob o valor: total `+% este mês` (novos/base), novos `% vs mês anterior` (base zero → `+N` absoluto), incompletos `% dos ativos`, ativos `% do total`; setas verde/vermelha só com direção.
4. `b68dc1f` **tabela** — Cidade/UF e Responsável SAÍRAM (6 colunas; `table-layout: fixed` + colgroup); **status ÚNICO**: `Completo`/`Incompleto`/`Cancelado` (inativo = linha apagada + chip vermelho — ativo/inativo é estado do CARD, não segundo chip); contato com ícones minimalistas tel/e-mail (`.fv-cell-ic`).
5. `54f6826` **modais (GLOBAL, mobile incluso — decisão do Flavio)** — `.app-modal` sai o vidro bege translúcido → branco sólido; `.bottom-sheet`+footer: branco vira o PADRÃO (era `--brand-cream-soft`; overrides brancos locais removidos); `.app-modal-submit`/`.app-modal-secondary`: pílula 999px → 10px.
6. (este commit) **docs + memória**.

Pergunta do mobile respondida: mobile entra **na E2 de cada página** (não agora, nem no fim de todos os desktops) — página fecha UMA vez, componentes não acumulam ramos velho/novo.

#### Rodada de ajustes 2 (2026-07-20 — detalhe UNIFICADO + quick-create + tabela)

Pedido do Flavio: melhor disposição na tabela; dropdowns do quick-create PARA BAIXO + campos mais bonitos; detalhe profissional SEM ícones infantis, **tudo em um modal só** (fim dos modais de edição/documentos/detalhes separados), ações rápidas só ver detalhes + inativar, área maior, mínimo de scroll; pesquisa por referências institucionais (padrões usados: painel lateral largo com 2 colunas internas, seções agrupando campos afins, DL label|valor). Sete commits (gates por commit):

1. `0c41067` **tabela** — Documento = valor + rótulo CNPJ/CPF (cadência 2 linhas); avatar PJ quadrado arredondado vs PF círculo; respiro nas bordas; tooltip de data absoluta no Atualizado.
2. `0f369bb` **quick-create** — `ChipMultiSelectField` ganha `forceDropDown` (Responsável e Papel abrem PARA BAIXO; o corpo do sheet rola); campos institucionais (hairline 1px, raio 10, anel de foco da marca — sai a borda 2px do 14.7.C); micro-cabeçalhos `Identificação` / `Contato e comercial` (`.cqc-group-heading`).
3. `1711afa` **painel parte 1** — modal "Documentos" MORREU (Anexos/Contas = cards sempre visíveis; a ordem mobile já os previa); overlay ganha escopo **`.client-details-overlay`** (940px desktop, grid `'info side'/'resumo side'/'footer footer'`, side-col vira flex real); header de identidade FLAT (sai o gradiente verde; chip pastel; ação = Editar); Informações vira **definition list** (label | valor). **Nada vaza pro detalhe da amostra** (mesmas classes `sdv-*`; tudo escopado pelo overlay).
4. `52a6dad` **painel parte 2** — modal central de edição MORREU: **Editar = sub-painel em fluxo** (`.fv-cd-editor`; `.sdv-page.is-editing` some; header "Cliente"+X ficam; dismiss-guard segura ESC/X); **form ÚNICO** informações+papéis+endereço fiscal (PJ)+motivo, um Salvar (payload conjunto; validação única); lápis por card removidos; `?acao=editar` abre o modo.
5. `834f90a` **pendências** — banner discreto no header ("Cadastro incompleto. Faltam: … · N filiais com pendências", via `labelForMissing`); triângulo pulsante das filiais → ponto âmbar estático.
6. `50b36e4` **menu ⋯** — só Ver detalhes + Inativar/Reativar (Editar/Documentos moram no painel; deep-links `?acao=` antigos seguem aceitos — `documentos` só consome e abre).
7. (este commit) **docs + memória**.

Exceções/efeitos globais: cards de Anexos/Contas agora aparecem TAMBÉM no mobile do detalhe (o modal morreu para os dois mundos); editor de cliente idem (sub-painel nos dois). Dívida deliberada: regras CSS do modal morto (`.client-detail-edit-modal`) ficam dormentes até a consolidação.

#### Rodada de ajustes 3 (2026-07-21 — detalhe vira DRAWER DE PERFIL com abas)

Pedido do Flavio com **referência visual** (painel "Staff details" de SaaS de agendamento): excluir o donut mas **manter gráfico — de LINHAS, 6 meses**; diminuir a área do modal; header de perfil FIXO como na imagem (avatar, nome, tipo, e-mail/telefone) com **botões em bolinha**; **3 abas** — Visão geral (cards + gráfico), Documentos (dados bancários + anexos), Filiais. Decisões fechadas em plan mode (AskUserQuestion): **drawer direito ~620px** (tabela visível atrás); chips sob o nome = **papéis comerciais**; dados cadastrais (CPF/CNPJ, razão/fantasia, IE, endereço fiscal PJ) na **aba Documentos**; **PJ fica com 2 abas** (Filiais é só PF); gráfico = **sacas vendidas E compradas por mês** (compras só p/ comprador); cards numéricos = Em aberto + Vendido + Comprado (**Perdido sai da UI**; `lostCount` segue na API). Três commits de código (gates por commit; o C4 planejado — ações do hero — nasceu absorvido no 3º):

1. `df95269` **backend** — `getClientCommercialSummary` ganha `monthlySales` (6 entradas `{month:'YYYY-MM', soldSacks, boughtSacks}`, mês corrente em BRT + 5 anteriores; vendas = movimentos SALE ativos de amostras do cliente com os filtros dos counts, compras = buyer; **bucketing em JS** sobre `movementDate` DATE puro — sem SQL raw). `ClientMonthlySalesPoint` em `lib/types.ts`; cenário de integração determinístico (dia 15 do mês corrente/anterior; gotcha: movimento CANCELLED exige `cancelledAt` pelo CHECK `chk_sample_movement_cancelled_state`). Integração 62/62 + reseed.
2. `45d5308` **gráfico de linhas** — `ClientCommercialSummaryCard` reescrito: SVG manual (curva suave via bezier de controles horizontais, área sob Vendas, 3 gridlines tracejadas com teto divisível por 4, labels de mês pt-BR, estado vazio textual, sem tooltip) + grade `.fv-cd-stats` (label + número grande, estilo dos minicards da referência). **Bloco CSS do donut `.sales-*`/`.ccs-*` (~275 linhas) DELETADO** — consumidor único era o cliente (DSB-D14 já tinha removido o do dashboard).
3. `52cf111` **drawer + hero + abas** — override 940px e grid 2-col morrem (**herda os 620px do `.detail-overlay` base**); hero centrado: avatar de iniciais (círculo PF / quadrado arredondado PJ) com **ponto de status** verde/vermelho, nome, `Cod. N · tipo`, chips de papéis (+ `Cancelado` vermelho se inativo), e-mail/telefone **copiáveis**, 4 bolinhas — **mailto / copiar telefone / editar (modo interno) / ⋯** com Inativar-Reativar (**o rodapé de status morreu**; ESC do menu em capture pra não fechar o drawer junto); banner de pendências segue no hero; abas `.fv-cd-tabs` (molde ARIA do `.cad-tabs`, underline `--fv-cta`); `?acao=documentos` **volta a ter efeito** (abre na aba); wrapper `.sdv-client-side-col` **saiu do DOM**.
4. (este commit) **docs + memória**.

Notas técnicas (armadilhas de CSS): com a side-col fora do DOM, tudo que dependia de `:has(> .sdv-client-side-col)` (grid nu do redesign 2026-07-02, grid escopado da rodada 2, `order` mobile, fundo branco mobile) **morre sozinho** — mas as regras desktop NUAS que casam por classe continuavam vivas e precisaram de **neutralizadores escopados** (base, `.client-details-overlay`, vencem por ordem/specificity): `.sdv-general` (grid 5fr/3fr + `--card-row-height` fixa), `.sdv-info-split-row` (altura fixa), `.sdv-card-info` (overflow hidden) e `.sdv-content` (fundo bege do detalhe da amostra). Exceção/efeito global: **hero + abas valem também no mobile** do detalhe (estrutura única; polimento mobile fica pra E2). Dívidas dormentes p/ consolidação: regras `.sdv-identity-*`, `.fv-cd-edit`, `.sdv-client-status-*`, hooks `.sales-card` (animação `dashboard-card-in` e lista reduced-motion), grids `:has()` mortos e `.client-detail-edit-modal`.

Checklist de conferência (desktop): abrir cliente → **drawer estreito à direita com a tabela atrás**; hero completo (avatar/nome/chips/contato/4 bolinhas); trocar as abas (sem scroll no caso típico); gráfico com cliente que tem vendas/compras E com cliente sem movimentação; PJ com 2 abas / PF com Filiais; `?acao=documentos` abre na aba; Editar interno funciona (ESC/X seguram); ⋯ inativa/reativa; mailto abre o app; telefone copia com toast; ESC com menu ⋯ aberto fecha SÓ o menu; mobile continua funcional (mesma estrutura).

#### Rodada de ajustes 4 (2026-07-21 — drawer vira modal de verdade + polish institucional)

Pedido do Flavio (5 pontos; os modais internos do detalhe ficam para **depois**, comportamento a discutir):

1. **Página bloqueada com os painéis abertos** — com o detalhe do cliente OU o criar cliente abertos, não pode ser possível clicar na página; fechar primeiro. O criar cliente (side-sheet) **já bloqueava** (backdrop padrão); o furo era o detalhe: o peek "lista viva" do RD4 deixava o backdrop transparente e atravessável. Novo: `.bottom-sheet-backdrop.is-open:has(> .client-details-overlay)` restaura o **scrim 0.55 + pointer-events auto** (tap no scrim fecha; dismiss-guard segue). **Efeito deliberado: o "peek swap" clicando outra linha morre para clientes** (a pendência de E2 "swap entre clientes" fica superada); os demais `detail-overlay` (contratos) mantêm a lista viva.
2. **X → seta na borda** — o botão de fechar dos DOIS painéis do cliente virou **seta ←** em círculo branco hairline no canto ESQUERDO, **metade pra dentro e metade pra fora** da borda (como a referência). Implementação: prop `closeVariant: 'x' | 'edge-back'` no `BottomSheet` (repassada pelo `DetailOverlay`); a classe `.has-edge-close` no sheet libera `overflow: visible` no desktop (seguro: raio 0, scroll é do body interno) e o header vira `position: static` pra seta ancorar **no sheet** e não na caixa interna do header (que tem padding). **Mobile**: a seta fica no fluxo do header, ANTES do título (padrão de voltar) — meia-fora é impossível em sheet de tela cheia.
3. **Cards de filial/conta institucionais** — `.sdv-unit-card-mini` (usado nas abas Filiais e Documentos) escopado em `.client-details-overlay`: branco flat + hairline + radius 10; morrem gradiente cremoso, sombra tripla e barra lateral de status; badge "Inativa" vira chip pastel vermelho; seta/tipografia nos tons fv. O molde antigo segue **intacto no detalhe da amostra**.
4. **Botões de adicionar nomeados** — "Nova"/"Adicionar" viram **"+ Adicionar filial" / "+ Adicionar conta" / "+ Adicionar anexo"** (`.fv-cd-add-btn`): CTA **verde preenchido, texto branco, radius 10** (molde dos botões das rodadas 1–2); press só scale.
5. **Sublinhado da aba reto** — a linha ativa das `.fv-cd-tabs` tinha **pontas curvas** porque o reset global de `button` aplica `border-radius: 10px` (o `border-bottom` acompanha o raio). Fix: `border-radius: 0` no `.fv-cd-tab`. (O mesmo efeito existe no `.cad-tab` mobile — fora do escopo desta rodada.)
6. **Scroll sem deslocamento** (pedido durante a rodada) — trocar de aba fazia o conteúdo **pular pra esquerda** quando a barra de scroll aparecia (aba longa) e sumia (aba curta). Fix: `scrollbar-gutter: stable` no `.bottom-sheet-body` do drawer (espaço da barra sempre reservado) + barra fina neutra (`scrollbar-width: thin` / `scrollbar-color` hairline). Touch usa barra overlay — sem efeito no mobile.
7. **Linhas do gráfico mais finas** (pedido durante a rodada) — stroke das linhas Vendas/Compras de 2 → **1.4** (a viewBox de 320px escala ~1.8× no drawer; rende ~2,5px na tela).

Commits: `53bb96d` (style: prettier no doc, escapou da rodada 3) · `393a5c4` (bloqueio + seta) · `3f7cc8c` (cards + botões + linha reta) · `bd6d7c8` (docs) · `+1` (gutter estável do scroll, com este ajuste no doc). Gates verdes por commit (typecheck, lint, format, unit 535, contracts 20; sem mudança de backend).

Checklist de conferência (desktop): abrir o detalhe → página escurece e **nada atrás é clicável** (tap fora fecha; com edição aberta, não fecha); criar cliente idem; seta ← meio pra fora fecha os dois painéis; cards de filial E de conta brancos hairline; "+ Adicionar filial/conta/anexo" verdes preenchidos; linha da aba ativa reta; trocar de aba **não desloca o conteúdo** (gutter estável); no mobile a seta aparece à esquerda do título.

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
- **RD11 (fase 0 do ciclo página-a-página)** — ✅ feito em 2026-07-20: `design-system` §8 ganhou a seção **Side-sheet** (geometria, diferenças pro DetailOverlay, quando usar); `modals` ganhou as regras de contêiner no preâmbulo + o inventário §11-A (por página × alvo × status).
- **FV consolida POR PÁGINA** (§2.5): ao fechar cada página do ciclo (validada no device), atualizar `modals` (§11-A: 🔜 → ✅), `design-system` e `responsive` no que a página mudou. A reescrita maior de `design-system` (+ revisão de `feedback-messages` e `button-press-effect`, com `Design-Language.md` como fonte dos tokens) acontece quando o kit visual estabilizar — a partir do piloto `/cadastros`.
- `skill-maintenance` roda ao fim de **cada** fase, como sempre.
