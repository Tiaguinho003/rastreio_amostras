# Auditoria de Navegacao por Papel de Usuario

> ## 🔴 Errata estrutural (2026-07-22) — leia antes das tabelas
>
> O corpo deste doc e um levantamento de 2026-06-28, com emendas ate 2026-07-15. Tres
> mudancas posteriores invalidaram afirmacoes que aparecem **dezenas de vezes** nas
> tabelas por papel. As **regras de acesso** (guards, `NON_PROSPECTOR_ROLES`, ADMIN em
> `/users`) continuam corretas; o que envelheceu foi **onde as coisas ficam**.
>
> 1. **`/camera` NAO EXISTE.** A rota foi deletada no ciclo CAM (CAM-D3). A camera
>    virou um **bottom sheet global** (`CameraSheet`), aberto pelo icone no header —
>    ou seja, nao e uma pagina e nao tem linha de nav. Toda linha "Camera `/camera`"
>    e toda nota "a rota e liberada mas o botao so aparece no mobile" estao mortas.
> 2. **A tabbar mobile tem 4 itens, nao 5 com a Camera no centro:** Inicio · Lotes ·
>    Cadastros · e um 5o slot **mutuamente exclusivo** — Relatorios (`/relatorios`)
>    para quem esta em `INFORME_ROLES`, Perfil (`/profile`) para quem nao esta (hoje
>    so o CLASSIFIER). O slot central da camera saiu (CAM-P3).
> 3. **A sidenav desktop mudou com o RD13:** os itens sao Inicio · Lotes ·
>    Relatorios (condicional) · Cadastros · Contratos (`CONTRATOS_ROLES`) ·
>    **Embarques** (`NON_PROSPECTOR_ROLES`, ausente do corpo deste doc) · Usuários
>    (ADMIN). "Clientes" nao existe mais como item — foi absorvido por Cadastros. E
>    tres secoes ganharam **sub-itens expansiveis** (`NAV_SUB_ITEMS`): Lotes →
>    Lotes/**Simulador**, Cadastros → Clientes/Corretores, Contratos →
>    Contratos/Financeiro, Embarques → Embarque/Aprovacoes; deep-link por `?tab=`.
> 4. **`/samples/[id]` nao e pagina.** Redireciona para `/samples?lote=<id>`; o
>    detalhe e um drawer. Onde o doc o trata como destino de navegacao, leia
>    "overlay sobre a lista".
>
> Fonte de verdade do que esta acima: `components/AppShell.tsx`
> (`DESKTOP_NAV_ITEMS`, `MOBILE_NAV_ITEMS`, `NAV_SUB_ITEMS`).

Status: Ativo — referencia mantida para uso futuro (read-only; reflete o estado atual)
Escopo: para cada papel de usuario, QUAIS paginas tem acesso e ONDE estao na
navegacao, no desktop e no mobile.
Natureza: levantamento factual. Nao propoe mudancas; decisoes de ajuste ficam
para depois.
Inicio: 2026-06-28
Atualizado: 2026-07-02 — split Clientes (operacao) x Cadastros (gestao): "Clientes"
avulso saiu da nav de ADMIN/CADASTRO, que passam a acessar clientes pela aba
"Clientes" do hub `/cadastros` (agora com 3 abas). Guards de rota inalterados.
Atualizado: 2026-07-09 — **Central de Contratos (F1)**: `/contratos` virou um **hub
com 4 sub-abas** (Contratos · Financeiro · Aprovações · Embarque); a rota
`/financeiro` **redireciona** para `/contratos?tab=financeiro`; a navegação passou a
ter **um item único "Contratos"** (sidenav desktop + menu do avatar), gated **ADMIN +
COMMERCIAL** (`CONTRATOS_ROLES`) — o COMMERCIAL passa a ver "Contratos" também no
**menu do avatar** mobile (corrige o antigo gate `isAdmin`). A tabela de rotas e a
matriz abaixo já refletem isso. _(As **seções por papel** foram reconciliadas em
2026-07-12 — ver a nota daquela data; a CC F2 depois abriu o hub `/contratos` aos
papéis operacionais como "Embarques".)_
Atualizado: 2026-07-09 — **detalhe do cliente restrito**: `/clients/[id]` saiu de
`NON_PROSPECTOR_ROLES` e passou a `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO).
CLASSIFIER/COMMERCIAL/REGISTRATION ficam com a lista `/clients` + o modal de
consulta do card; o botão "Gerenciar cliente" some para eles. O card "Cadastros
pendentes" do dashboard virou ADMIN+CADASTRO e passou a levar a
`/cadastros?incomplete=true`. Ver a nota abaixo da matriz.
Atualizado: 2026-07-12 — **Central de Contratos F2 (Embarque) reconciliada**: o hub
`/contratos` está aberto a **TODOS os não-PROSPECTOR** (guard `NON_PROSPECTOR_ROLES`),
não só ADMIN + COMMERCIAL. ADMIN/COMMERCIAL veem as **4 sub-abas**
(Contratos · Financeiro · Aprovações · Embarque) sob o item de nav **"Contratos"**;
CLASSIFIER/REGISTRATION/CADASTRO veem **2 sub-abas** (Embarque · Aprovações) sob o
item **"Embarques"** (`contractsHubTabs` / `contractTabRoute` em `lib/roles.ts`).
O item aparece na **sidenav desktop** e no **menu do avatar mobile** para os cinco
papéis. Resolve o débito anotado na nota F1 de 2026-07-09 (as seções por papel abaixo
descreviam o estado pré-CC F2). Sem mudança de guard no backend: a lista da Aprovação
é não-escopada (todos veem todos, só não-sensível); o "Ver contrato" abre a ADMIN + COMMERCIAL em qualquer contrato (escopo aberto, D140 — **superado em 2026-07-15 pela unificação de acesso: hoje abre a todo não-PROSPECTOR, `CONTRATOS_ROLES = NON_PROSPECTOR_ROLES`**).
Atualizado: 2026-07-13 — **SPLIT do hub em 2 páginas**: `/contratos` (Contratos +
Financeiro, gated `CONTRATOS_ROLES`) e `/embarques` (Embarque + Aprovações, gated
`NON_PROSPECTOR_ROLES`, abre em Embarque). ADMIN/COMMERCIAL ganham 2 itens de nav
("Contratos" + "Embarques"); operacionais só "Embarques" (perdem o acesso a
`/contratos`). Deep-links antigos `/contratos?tab=embarque|aprovacoes` redirecionam.
A tabela de rotas e a matriz abaixo já refletem. Detalhe em `Contratos-Visao-Geral.md` §2.
Atualizado: 2026-07-14 — **aba Bancos removida do `/cadastros` (D141)**: o hub ficou
com **2 abas** (Clientes | Corretores) — banco virou **texto livre** na conta bancária
do cliente (a entidade `Bank`, a API `/banks` e o modal de banco saíram do sistema).
Menções a "3 abas / Bancos" em notas históricas abaixo leiam-se com essa redução.
Atualizado: 2026-07-14 — **corpo inteiro reconciliado com o split de 2026-07-13**:
as seções "Detalhe por papel" e as notas factuais passaram a descrever as 2 páginas
(`/contratos` gestão · `/embarques` operação), com tabelas e contagens de nav
refeitas (COMMERCIAL sidenav 6, ADMIN sidenav 7, operacionais 4; "Embarques" agora
é rota própria em todas as tabelas). O aviso anterior de "seções pré-split" saiu.
Atualizado: 2026-07-15 — **ACESSO UNIFICADO por papel**: todo papel **não-PROSPECTOR**
(ADMIN, CLASSIFIER, REGISTRATION, COMMERCIAL, CADASTRO) passa a **acessar e operar
todas as páginas** — `/contratos` (Contratos·Financeiro), `/embarques`, `/relatorios`
(Relatórios, como **viewer** `scope=all` + criação + curadoria), `/cadastros` e
`/clients/[id]`. **Única exceção: `/users` segue exclusivo do ADMIN** (front + back,
`assertAdminActor`). O PROSPECTOR continua 100% restrito e inalterado. As constantes de
acesso (`INFORME_ROLES`, `CONTRATOS_ROLES`, `FINANCEIRO_ROLES`, `CLIENT_MANAGEMENT_ROLES`)
e os helpers `isVisitReportViewer`/`isVisitLinkCurator` agora valem para todo
não-PROSPECTOR (`= NON_PROSPECTOR_ROLES` / `!isProspector`; `lib/roles.ts` +
`src/auth/roles.js`, este novo). Na navegação, o item "Clientes" avulso **sai da nav de
todos** (clientes pela aba Clientes do hub `/cadastros`) e o menu de cada não-PROSPECTOR
**espelha o do ADMIN menos "Usuários"**. A matriz e as seções por papel abaixo já refletem.
Atualizado: 2026-07-15 — **UNIFICAÇÃO DE RELATÓRIOS**: a rota `/informe` virou **`/relatorios`**
(`/informe` e `/resumo` agora **redirecionam**; `app/relatorios/page.tsx` é a página, `app/informe/page.tsx`
virou stub de redirect). A página tem **2 tipos**: **Visita** (funde o informe do prospector + a visita do
comercial; nasce vinculada; campos de domínio opcionais) e **Semanal** (só **ADMIN + COMMERCIAL** criam —
`isWeeklyReportAuthor`). Acabaram a curadoria de vínculo e o `scope=mine` (feed sempre `scope=all`); os
relatórios são **imutáveis** (**cancelar soft**, só o autor). O PROSPECTOR agora **cria visita vinculada**
(allowlist ganhou `lookupClients`/`createClient`/`lookupUsersForReference`) e vê **só as próprias** (não
"a equipe"); a fila **offline foi removida** (online-only). _(A coluna "Rota" das tabelas abaixo foi
corrigida para `/relatorios` na consolidação de 2026-07-27.)_
Atualizado: 2026-07-16 — **INFORMATIVOS**: o leque do FAB da `/relatorios` tem uma **3ª opção**,
**"Informativo"**, liberada a **todo não-PROSPECTOR** (mesma regra da página). Ela **não cria registro**:
gera imagens para o story e some (sem banco, sem rota de API), então **os "2 tipos" acima seguem
valendo para o FEED** — o Informativo não aparece nele e não tem gate de papel próprio para auditar.
Fica aqui porque é uma **ação de página** que um mapeamento por papel deixaria escapar. Doc:
`docs/Informativos-Plano-de-Trabalho.md`.
Atualizado: 2026-07-27 — **REDESENHO FV DA `/relatorios`** (Redesign §2.10, consolidado). Nada muda em
**quem acessa o quê** — as três portas de criação continuam com os mesmos gates. Muda só **onde elas
ficam**: no **desktop** (≥901px) criar mora em **3 botões na faixa do topo** (`+ Nova visita` ·
`Semanal`, só ADMIN+COMMERCIAL · `Informativo`); o **leque do FAB** virou **mobile-only**. As duas portas
compartilham a mesma fonte de estado (`useInformeCreateSheets`), então não há caminho de criação que
escape de um gate. Visão geral da página: `docs/Relatorios-Visao-Geral.md`.

> ⚠️ **Ressalva sobre a TABBAR nas tabelas abaixo** — elas listam **5 itens com "Câmera" no centro**.
> Isso está **desatualizado**: a CAM-P3 tirou o slot central (a câmera virou bottom sheet global, aberta
> pelo ícone do header) e a tabbar tem hoje **4 slots** — Início · Lotes · Cadastros · e um 5º
> mutuamente exclusivo (Relatórios para quem está em `INFORME_ROLES`, Perfil para quem não está), como
> já diz o resumo no topo deste doc. A correção linha a linha das seções por papel pertence ao ciclo
> **Shell & Navegação** (`docs/Shell-e-Navegacao-Plano-de-Trabalho.md` §5.1, inventário já verificado).

## Como ler este documento

A auditoria e feita **papel por papel**. Cada papel ganha uma secao em "Detalhe
por papel" descrevendo onde cada destino aparece (sidenav / tabbar / menu do
avatar; sidebar so no PROSPECTOR) no desktop e no mobile, alem das rotas acessiveis
sem botao de navegacao e das rotas bloqueadas.

A "Matriz de acesso por papel" e o panorama de rotas x papeis (estado atual,
derivado das constantes de papel). As secoes de detalhe aprofundam a matriz com
a localizacao de cada item na UI.

## Referencia 1 — Papeis

Definidos em `enum UserRole` (`prisma/schema.prisma`). Labels pt-BR em
`USER_ROLE_LABELS` (`lib/roles.ts`).

| Papel (enum)   | Label (pt-BR) |
| -------------- | ------------- |
| `ADMIN`        | Administracao |
| `CLASSIFIER`   | Classificacao |
| `REGISTRATION` | Impressao     |
| `COMMERCIAL`   | Comercial     |
| `PROSPECTOR`   | Prospeccao    |
| `CADASTRO`     | Cadastro      |

Constantes/helpers de agrupamento (`lib/roles.ts`):

- `NON_PROSPECTOR_ROLES` = ADMIN, CLASSIFIER, REGISTRATION, COMMERCIAL, CADASTRO
  (todos menos PROSPECTOR). Desde o **ACESSO UNIFICADO (2026-07-15)** é o guard de
  **praticamente todas as páginas** (amostras, camera, `/clients`, `/clients/[id]`,
  `/cadastros`, `/relatorios`, `/contratos`, `/embarques`) — as constantes específicas
  abaixo passaram a apontar para ele. Única página fora dele: `/users` (só ADMIN).
  Agora também canônico no **backend** (`NON_PROSPECTOR_ROLES` em `src/auth/roles.js`),
  espelhando os gates de contrato/financeiro/informe.
- `CLIENT_MANAGEMENT_ROLES` = **`NON_PROSPECTOR_ROLES`** (todos menos PROSPECTOR;
  ACESSO UNIFICADO 2026-07-15 — era ADMIN + CADASTRO). Helper `canManageClients` —
  quem GERENCIA cadastro de cliente: guard do hub `/cadastros` e do **detalhe**
  `/clients/[id]`, mais o botao "Gerenciar cliente"; hoje todo não-PROSPECTOR. Sem
  equivalente no backend (endpoints de cliente são auth-only — ver a nota da matriz).
  _(O card "Cadastros pendentes" do dashboard, antes gated por este helper, foi
  REMOVIDO em 2026-07-12 — DSB-D2.)_
- `INFORME_ROLES` = **`NON_PROSPECTOR_ROLES`** (todos menos PROSPECTOR; ACESSO
  UNIFICADO 2026-07-15 — era ADMIN + COMMERCIAL) — guard da pagina "Relatorios"
  (`/relatorios`). Todo não-PROSPECTOR entra como **viewer** (`scope=all`) e **cria**; o
  ramo "meus" do COMMERCIAL (`InformeCommercialPage`, `scope=mine`) foi removido.
  (Histórico: CADASTRO saíra em 2026-06-28 e REGISTRATION em 2026-07-10 — ambos
  reintegrados pelo acesso unificado.) `CONTRATOS_ROLES` e `FINANCEIRO_ROLES` seguem
  o mesmo caminho (= `NON_PROSPECTOR_ROLES`; ver §Contratos-Visao-Geral e a matriz).
- `isAdmin(role)` = somente ADMIN.
- `isCommercialRole(role)` = somente COMMERCIAL (prioridade na ordenacao do
  picker de usuarios; nao confundir com acesso de navegacao). O PROSPECTOR saiu
  em 2026-07-09 — ver `NON_ASSIGNABLE_ROLES` abaixo.
- `NON_ASSIGNABLE_ROLES` = PROSPECTOR (helper `isAssignableUserRole`) — papeis
  que nao podem ser referenciados em vinculo nenhum. Espelha o backend
  (`src/auth/roles.js`), onde mora o enforcement. No front serve so ao
  formulario de `/users`: nao se cria mais um PROSPECTOR, mas os que ja existem
  seguem editaveis.
- `isProspector(role)` = somente PROSPECTOR (app restrito).
- `isVisitReportViewer(role)` = **todo não-PROSPECTOR** (`!isProspector`; ACESSO
  UNIFICADO 2026-07-15 — era só ADMIN): visão de supervisão (`scope=all`). Espelha
  `VISIT_REPORT_VIEWER_ROLES` no backend (`src/visits/visit-report-service.js`).
  _(Hoje sem call-site: quem guarda a página é o `INFORME_ROLES`, que é o mesmo
  conjunto. Mantido por nomear um gate real do backend.)_
  _(A **curadoria do vínculo** informe→cliente **acabou** na unificação de 2026-07-15 —
  a Visita nasce vinculada. O helper `isVisitLinkCurator` foi **removido** em 2026-07-27
  e o `VISIT_REPORT_LINK_CURATOR_ROLES` do backend já não existia.)_

## Referencia 2 — Superficies de navegacao

Centralizadas em `components/AppShell.tsx`. Breakpoint: **900px** (`<= 900` =
mobile, `>= 901` = desktop).

| Superficie               | Onde                                               | Plataforma | Componente                                                  |
| ------------------------ | -------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| Sidenav lateral (branca) | esquerda, 2 colunas (trilho + painel icone+nome)   | Desktop    | `AppShell.tsx` `.app-sidenav` (`desktopNavItems`)           |
| Tabbar inferior          | rodape                                             | Mobile     | `components/MobileTabbar.tsx` (`MOBILE_NAV_ITEMS`)          |
| Menu do avatar           | dropup no trilho (desktop) / bottom sheet (mobile) | Ambos      | `AppShell.tsx` (`ProfileMenuCard`) + `HeaderAvatarMenu.tsx` |

> **DSB-D15 (2026-07-14):** no desktop, a navegacao dos **5 papeis nao-PROSPECTOR**
> saiu da top bar branca (DSB-D6) e virou uma **SIDENAV lateral esquerda em 2
> colunas** (referencia visual do Flavio): **trilho** fino a extrema esquerda
> (fundo `#f4f6f5`; logo quadrado `icon-safras.png` no topo → `/dashboard`; avatar
> no rodape, abrindo o menu de perfil em **dropup**) + **painel branco** com os
> itens de navegacao **pequenos, com icone + nome** (`renderNavIcon`), item ativo
> em **pilula suave verde** (`rgba(31,93,67,0.10)` + `--brand-green`). **A faixa
> branca do topo SOME no desktop** desses papeis (o conteudo ganha a altura toda);
> **"Sair" segue so no menu do avatar** (agora no trilho). Grid 2 colunas via
> `:has(.app-sidenav)` (`--app-sidenav-w`, 276px), sidenav **sticky + 100lvh**
> (nunca `position:fixed` — o PageTransition aplica transform). Sem busca na
> sidenav (pedido do Flavio). O **PROSPECTOR** mantem a **sidebar vertical verde**
> de antes + faixa branca com o avatar (app restrito, so "Inicio" + "Sair").
> Mobile inalterado (tabbar + hero; a topbar verde mobile nao mudou).

> **DSB-D16 (2026-07-14):** entrou a **TOP BAR GLOBAL** desktop (`.app-topbar`,
> nao-PROSPECTOR): faixa branca UNICA atravessando o viewport (row 1 do grid,
> colunas 1/-1, sticky, 56px = `--app-topbar-h`); a **sidenav comeca abaixo
> dela** (row 2, altura descontada) e o **logo quadrado saiu do trilho e foi
> pra barra** (esquerda). A direita, **2 icones INERTES** que ganharao funcao
> no futuro: **sino (Notificacoes) + ajuda "?"** (`.app-topbar-action`). O
> miolo da barra fica **VAZIO de proposito** (sem busca, sem titulo de pagina —
> decisao do Flavio; o titulo das paginas ficara "em outro lugar", a definir).
> Junto veio o **canvas verde-clarinho `#f4f6f5`** (o mesmo do trilho) como
> fundo de todas as paginas desktop nao-PROSPECTOR (`background` no
> `.app-shell-root:has(.app-sidenav)`; cards/sheets brancos saltam sobre ele).
> Mobile e PROSPECTOR seguem intactos (fundo branco; chrome proprio).

> **DSB-D17 (2026-07-14):** o **TITULO DA PAGINA** (o "outro lugar" prometido
> no DSB-D16) mora no **shell**: `<h1 class="app-page-title">` no topo do
> `.app-shell-main` (desktop nao-PROSPECTOR), **dentro da pagina** — texto = o
> **rotulo do item de nav ativo** (Inicio, Lotes, Clientes, Relatorios,
> Cadastros, Contratos, Embarques, Usuários), so nas **8 rotas principais**
> (match exato de pathname; detalhes e Perfil mantem headers proprios).
> **Alinhamento vertical exato com o botao "Inicio"** da sidenav via tokens
> compartilhados `--app-nav-row-top` (0.9rem) + `--app-nav-row-h` (34px),
> usados pelo painel/links da sidenav E pelo titulo. Os titulos proprios das
> paginas seguem escondidos no desktop (o "Relatorios" do informe
> comercial/viewer entrou na regra). Corrigido junto: o main de
> Lotes/Clientes descontava `4.5rem` (top bar do DSB-D6, morta) → agora
> `var(--app-topbar-h)`.

Itens definidos em `AppShell.tsx`: `DESKTOP_NAV_ITEMS` (Inicio/Lotes/Clientes),
`INFORME_NAV_ITEM` (Relatorios), `CADASTROS_NAV_ITEM`, `CONTRATOS_NAV_ITEM`,
`ADMIN_NAV_ITEM` (Usuários), `MOBILE_NAV_ITEMS` (inclui Camera). A filtragem por
papel da sidenav (desktop) fica em `desktopNavItems` (`AppShell.tsx`), a da tabbar no
`<MobileTabbar items={...} />`, e a do menu do avatar no `HeaderAvatarMenu.tsx`.
Os icones (`renderNavIcon`) servem a tabbar mobile E a sidenav desktop (DSB-D15
devolveu os icones ao desktop; na top bar do DSB-D6 era so texto).

Split Clientes x Cadastros — **ACESSO UNIFICADO (2026-07-15)**: como `canManageClients`
passou a valer para **todo não-PROSPECTOR** (`CLIENT_MANAGEMENT_ROLES = NON_PROSPECTOR_ROLES`),
`desktopNavItems` filtra o item "Clientes" fora da sidenav **de todos** (todos acessam
clientes pela aba "Clientes" do hub `/cadastros`), e no mobile o 4o slot fixo da tabbar
(`/clients`) é trocado por "Cadastros" **para todos**. O 5o slot da tabbar, antes Perfil
para os fora de `INFORME_ROLES`, vira **Relatórios** para todos (já que `INFORME_ROLES =
NON_PROSPECTOR_ROLES`). Resultado: a sidenav/tabbar/menu do avatar de todo não-PROSPECTOR
converge para a do ADMIN **menos "Usuários"**. _(Antes de 2026-07-15 só ADMIN e CADASTRO
tinham esse arranjo; COMMERCIAL/CLASSIFIER/REGISTRATION mantinham "Clientes" avulso e não
viam Cadastros.)_

## Referencia 3 — Universo de rotas

| Rota                                                                                          | Pagina                                              | Guard de acesso                                                                                 |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/login`, `/forgot-password` (redirect → modal no `/login`), `/maintenance`, `/laudo/[token]` | publicas                                            | sem auth                                                                                        |
| `/dashboard`                                                                                  | Inicio                                              | qualquer autenticado                                                                            |
| `/profile`                                                                                    | Perfil                                              | qualquer autenticado                                                                            |
| `/settings`                                                                                   | —                                                   | redireciona para `/profile`                                                                     |
| `/offline`                                                                                    | offline PWA                                         | qualquer autenticado                                                                            |
| `/samples`, `/samples/[id]`                                                                   | Lotes                                               | `NON_PROSPECTOR_ROLES`                                                                          |
| `/camera`                                                                                     | Camera                                              | `NON_PROSPECTOR_ROLES`                                                                          |
| `/clients`                                                                                    | Clientes (lista)                                    | `NON_PROSPECTOR_ROLES`                                                                          |
| `/clients/[id]`                                                                               | Detalhe do cliente                                  | `CLIENT_MANAGEMENT_ROLES` (todos menos PROSPECTOR)                                              |
| `/relatorios`                                                                                 | Relatorios (Visita unificada + Semanal)             | `INFORME_ROLES` (todos menos PROSPECTOR; viewer scope=all + criam; Semanal só ADMIN+COMMERCIAL) |
| `/informe`, `/resumo`                                                                         | → redirect para `/relatorios`                       | (redirect server-side)                                                                          |
| `/cadastros`                                                                                  | Cadastros                                           | `CLIENT_MANAGEMENT_ROLES` (todos menos PROSPECTOR)                                              |
| `/contratos`                                                                                  | Contratos (gestão — sub-abas Contratos·Financeiro)  | `CONTRATOS_ROLES` (todos menos PROSPECTOR). Nav "Contratos".                                    |
| `/embarques`                                                                                  | Embarques (operação — sub-abas Embarque·Aprovações) | `NON_PROSPECTOR_ROLES` (todos menos PROSPECTOR). Nav "Embarques". Abre em Embarque.             |
| `/financeiro`                                                                                 | → redirect para `/contratos?tab=financeiro`         | (redirect server-side)                                                                          |
| `/users`                                                                                      | Usuários                                            | ADMIN                                                                                           |

Middleware (`middleware.ts`): modo manutencao redireciona nao-ADMIN para
`/maintenance`; PROSPECTOR fora do seu app (`/dashboard`, `/profile`,
`/settings`, `/offline`) e redirecionado para `/dashboard`.

> **Nota (revisao DSH, 2026-07-07):** os endpoints do dashboard
> (`dashboard/pending`, feeds de eventos) exigem apenas autenticacao no
> backend (PROSPECTOR negado pela allowlist central) — **sem gate positivo de
> papel, por decisao** (DSH-D2): o dashboard e unico para os 5 papeis
> nao-PROSPECTOR. Os endpoints `commercial-timeseries` (card "Vendas e
> perdas", 2026-07-07 — DSH-D3), `sales-availability` (donut "Lotes
> disponiveis", 2026-07-14 — DSB-D14) e `recent-sends` (dividido/movido pra
> `/samples/recent-sends` + `/sale-contracts/approvals/recent-sends` —
> DSB-D14) foram removidos.

## PROSPECTOR nao e um papel atribuivel (2026-07-09)

O papel continua existindo — enum, login, app de campo, informe de visita. O que
mudou: **ele nao pode ser referenciado em vinculo nenhum**.

Havia tres portas, todas alimentadas pelo mesmo endpoint `GET /users/lookup`
(`lookupUsersForReference`), que devolvia todos os usuarios ativos sem filtro de
papel: responsavel comercial de cliente (detalhe do cliente, criacao rapida e
filtro da lista), classificador de amostra (`/camera`) e usuario vinculado a um
corretor. O filtro de `NON_ASSIGNABLE_ROLES` vive no endpoint e fecha as tres de
uma vez.

Ao contrario de `CLIENT_MANAGEMENT_ROLES`, **este nao e alivio de UI**: os
pontos de escrita respondem **422 `PROSPECTOR_NOT_ASSIGNABLE`**.

| Vinculo                  | Gate no backend                                                    |
| ------------------------ | ------------------------------------------------------------------ |
| Responsavel comercial    | `assertCommercialUserAssignable` (`src/clients/client-service.js`) |
| Classificador de amostra | `normalizeClassifiers` (`src/samples/sample-command-service.js`)   |
| Usuario de corretor      | `_assertUserExists` (`src/brokers/broker-service.js`)              |
| Criacao de usuario       | `createUser` (`src/users/user-service.js`)                         |

Excecoes deliberadas: `removeCommercialUserFromClient` nao valida (remover um
vinculo legado tem de continuar possivel) e `updateUser` tambem nao (senao os
PROSPECTOR existentes ficariam ineditaveis). No formulario de `/users`, o select
de criacao nao oferece o papel; o de edicao o inclui apenas para quem ja o tem.

## Matriz de acesso por papel

Acesso a rota (✅ acessa / ❌ redireciona para `/dashboard`). A localizacao na UI
esta no detalhe de cada papel.

| Rota               | ADMIN     | CLASSIFIER | REGISTRATION | COMMERCIAL | CADASTRO  | PROSPECTOR    |
| ------------------ | --------- | ---------- | ------------ | ---------- | --------- | ------------- |
| `/dashboard`       | ✅        | ✅         | ✅           | ✅         | ✅        | ✅ (dedicado) |
| `/profile`         | ✅        | ✅         | ✅           | ✅         | ✅        | ✅            |
| `/samples` (+sub)  | ✅        | ✅         | ✅           | ✅         | ✅        | ❌            |
| `/camera`          | ✅        | ✅         | ✅           | ✅         | ✅        | ❌            |
| `/clients` (lista) | ✅        | ✅         | ✅           | ✅         | ✅        | ❌            |
| `/clients/[id]`    | ✅        | ✅         | ✅           | ✅         | ✅        | ❌            |
| `/relatorios`      | ✅ viewer | ✅ viewer  | ✅ viewer    | ✅ viewer  | ✅ viewer | ❌            |
| `/cadastros`       | ✅        | ✅         | ✅           | ✅         | ✅        | ❌            |
| `/contratos`       | ✅        | ✅         | ✅           | ✅         | ✅        | ❌            |
| `/embarques`       | ✅        | ✅         | ✅           | ✅         | ✅        | ❌            |
| `/users`           | ✅        | ❌         | ❌           | ❌         | ❌        | ❌            |

`/relatorios` por papel (**ACESSO UNIFICADO, 2026-07-15**): **todo não-PROSPECTOR é
viewer** — vê TODOS os relatórios (`scope=all`) e **cria** (`canCreate` sempre; botões da
faixa no desktop, leque do FAB no mobile). O ramo "meus" do COMMERCIAL (`InformeCommercialPage`,
`scope=mine`) e a **curadoria de vínculo** foram **removidos**; o COMMERCIAL passou a ver todos.
PROSPECTOR não acessa (vê só os próprios no seu app). (`app/relatorios/page.tsx`.) _(Histórico: CLASSIFIER nunca
teve, CADASTRO saíra em 2026-06-28, REGISTRATION em 2026-07-10 — todos reintegrados pelo
acesso unificado.)_

`/contratos` + `/embarques` por papel (SPLIT 2026-07-13; **ACESSO UNIFICADO 2026-07-15**):
duas páginas no eixo gestão × operação, agora **ambas abertas a todo não-PROSPECTOR**.
**`/contratos`** (sub-abas Contratos · Financeiro) = gestão, guard **`CONTRATOS_ROLES`**
(= `NON_PROSPECTOR_ROLES` desde 2026-07-15 — era ADMIN + COMMERCIAL), nav **"Contratos"**.
**`/embarques`** (sub-abas Embarque · Aprovações) = operação, guard
**`NON_PROSPECTOR_ROLES`**, nav **"Embarques"**, abre em Embarque. Todo não-PROSPECTOR
tem os **2 itens de nav** e vê as 4 sub-abas (`contractsHubTabs` retorna as 4 para quem
está em `CONTRATOS_ROLES`, hoje todos; `contractTabRoute`, `lib/roles.ts`). A lista da
Aprovação não é escopada por corretor (todos veem todos, só não-sensível); o "Ver
contrato" abre o detalhe em `/contratos` a **qualquer não-PROSPECTOR** em qualquer
contrato (escopo aberto, D140). Detalhe da casca em `Contratos-Visao-Geral.md` §2.

**Acesso (guard) x visibilidade na nav (2026-07-02; ampliado no ACESSO UNIFICADO
2026-07-15):** para a **lista** `/clients` o guard segue `NON_PROSPECTOR_ROLES` (todos
os 5 ✅ e a rota continua acessível por URL), mas o _item de nav_ "Clientes" **não
aparece mais para nenhum não-PROSPECTOR** — todos chegam aos clientes pela aba
"Clientes" do `/cadastros` (era só ADMIN/CADASTRO até 2026-07-14). E `/cadastros`
deixou de ser só um hub de lookups: hospeda as abas Clientes (default) | Corretores
(a aba Bancos existiu de 2026-07-02 a 2026-07-14; saiu na D141).

**Detalhe do cliente — aberto a todo não-PROSPECTOR (ACESSO UNIFICADO 2026-07-15):**
`/clients/[id]` é uma tela de GESTÃO de cadastro (edição, filiais, contas bancárias,
anexos, inativação em cascata). O guard é `CLIENT_MANAGEMENT_ROLES` (`lib/roles.ts`),
que **passou a valer para todo não-PROSPECTOR** (= `NON_PROSPECTOR_ROLES`; era ADMIN +
CADASTRO de 2026-07-09 a 2026-07-14). O botão **"Gerenciar cliente"** do modal de
consulta do card — **única porta de navegação pro detalhe em todo o app**
(`components/clients/ClientsBrowser.tsx`) — aparece agora para todos. Por URL direta o
guard manda de volta pra `/clients` (`unauthorizedRedirectTo`) apenas no PROSPECTOR.
O "Voltar" do detalhe aponta pro hub `/cadastros`.

Consequencias: o FAB de **criar** cliente continua pra todos: criar e operacao,
completar o cadastro e gestao. O selo/filtro de "cadastro incompleto" na lista
tambem continua pra todos. _(O card **"Cadastros pendentes"** do dashboard — que
era gated por ADMIN + CADASTRO e levava a `/cadastros?incomplete=true` — foi
REMOVIDO em 2026-07-12, DSB-D2. O deep-link `?incomplete=true` segue tratado pelas
paginas de clientes por navegacao direta.)_

> ⚠️ Isto e **alivio de UI, nao fronteira de seguranca**. Nenhum endpoint
> `/clients/:id/*` tem gate de papel — todos exigem apenas autenticacao (o unico
> gate por papel no backend e a allowlist central do PROSPECTOR). Um usuario de
> classificacao ainda consegue ler auditoria, contas bancarias e anexos chamando a
> API direto. Um gate ingenuo por papel nesses metodos quebraria outras telas:
> `getClient`, `updateClient`, `createClientUnit` e `GET/POST /clients/:id/bank-accounts`
> sao compartilhados com Contratos (`SaleContractEtapa2Modal`,
> `ClientBankAccountSelectField`) e com o envio de amostra (`SampleSendFlow`).

---

# Detalhe por papel

> **ACESSO UNIFICADO (2026-07-15):** depois desta data os **cinco papéis
> não-PROSPECTOR compartilham a MESMA navegação** — a do ADMIN **menos "Usuários"**:
> sidenav desktop `Início · Lotes · Relatórios · Cadastros · Contratos · Embarques`;
> tabbar mobile (5) `Início · Lotes · Câmera · Cadastros · Relatórios`; menu do avatar
> desktop `Perfil · Sair`, mobile `Perfil · Cadastros · Contratos · Embarques · Sair`.
> Só o ADMIN acrescenta **"Usuários"** (sidenav 7; avatar mobile 6). O item "Clientes"
> avulso saiu da nav de todos; Câmera só tem botão na tabbar mobile. As seções abaixo
> mantêm por papel só as **particularidades de conteúdo** e o histórico; as tabelas de
> nav apenas reafirmam esse conjunto comum. (PROSPECTOR à parte — app restrito.)

## COMMERCIAL — "Comercial"

Papel comercial padrao (vendedor). Sem app restrito (diferente do PROSPECTOR).
Com o **ACESSO UNIFICADO (2026-07-15)** ganhou a gestão de cadastros (**Cadastros** /
`/clients/[id]`); a única rota que não acessa é **Usuários** (`/users`, só ADMIN). A
gestão de **Contratos** e o **Financeiro** já eram seus (`CONTRATOS_ROLES` /
`FINANCEIRO_ROLES`, escopo aberto — D140).

### Onde navega (por superficie)

| Destino    | Rota          | Desktop        | Mobile                            |
| ---------- | ------------- | -------------- | --------------------------------- |
| Inicio     | `/dashboard`  | Sidenav        | Tabbar                            |
| Lotes      | `/samples`    | Sidenav        | Tabbar                            |
| Relatorios | `/relatorios` | Sidenav        | Tabbar                            |
| Cadastros  | `/cadastros`  | Sidenav        | Tabbar (4o slot) + menu do avatar |
| Contratos  | `/contratos`  | Sidenav        | Menu do avatar                    |
| Embarques  | `/embarques`  | Sidenav        | Menu do avatar                    |
| Camera     | `/camera`     | — (sem botao)  | Tabbar (destaque, centro)         |
| Perfil     | `/profile`    | Menu do avatar | Menu do avatar                    |
| Sair       | logout        | Menu do avatar | Menu do avatar                    |

Contagem (ACESSO UNIFICADO 2026-07-15 = ADMIN menos "Usuários"):

- **Sidenav desktop: 6 itens** — Inicio, Lotes, Relatorios, Cadastros, Contratos,
  Embarques. (Trocou "Clientes" avulso por "Cadastros" em 2026-07-15.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Cadastros, Relatorios.
  (Contratos/Embarques nao entram na tabbar; ficam no menu do avatar.)
- **Menu do avatar:** desktop **2 itens** (Perfil, Sair); mobile **5 itens** (Perfil,
  Cadastros, Contratos, Embarques, Sair) — sem sidenav, a gestao cai no avatar.

### Rotas acessiveis sem botao de navegacao

Alcancadas por fluxo interno ou URL direta (guard permite), mas sem item de menu
proprio:

- `/samples/[id]` — criar (modal do leque "+" em Lotes)/abrir lote. **Detalhe uniforme (LDT-D1, 2026-07-08):** os 5 papeis nao-PROSPECTOR veem e fazem exatamente o mesmo no detalhe (nenhuma granularidade por papel); PROSPECTOR e barrado nas 3 camadas (guard, middleware, e API 403 via allowlist — inclusive a leitura `getSampleDetail` e a foto `getSampleAttachmentDescriptor`, LDT-D4).
- `/camera` **no desktop** — a rota e liberada (`NON_PROSPECTOR_ROLES`), mas o
  unico botao de Camera esta na tabbar mobile; a sidenav nao tem essa entrada.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/users` (exige ADMIN) — **única rota bloqueada** desde o ACESSO UNIFICADO
  (2026-07-15). `/cadastros`, `/clients/[id]`, `/contratos`, `/embarques` e `/relatorios`
  passaram todos a liberados.

### Particularidades de conteudo

- **`/relatorios` (Relatorios)**: desde o ACESSO UNIFICADO (2026-07-15) o Comercial é
  **viewer** como todos — vê TODOS os relatórios (`scope=all`) e cria (botões da faixa no
  desktop, leque do FAB no mobile). O antigo ramo "meus" (`InformeCommercialPage`,
  `scope=mine`) foi **removido**, assim como a curadoria de vínculo.
  O antigo `/resumo` redireciona para cá.
- **`/dashboard`**: usa o dashboard padrao (com dados de disponibilidade de
  venda), nao um dashboard dedicado como o do PROSPECTOR.

---

## PROSPECTOR — "Prospeccao"

App **restrito e distinto** dos demais: o middleware limita o PROSPECTOR a
`/dashboard`, `/profile`, `/settings` e `/offline` (qualquer outra rota
redireciona para `/dashboard`). Tem **dashboard dedicado** (`ProspectorDashboard`)
com o formulario de visita no proprio sheet; a sidebar fica so com Inicio e a
**tabbar e escondida** (`hideMobileTabbar`). Decisao 2026-06-28: mantido como
esta — mapeamento detalhado adiado.

## CLASSIFIER — "Classificacao"

Papel operacional de classificacao. Sem app restrito (acessa amostras/clientes/camera
como os demais nao-prospectores). Com o **ACESSO UNIFICADO (2026-07-15)** deixou de ser
o papel "sem Relatorios/sem gestao": passou a ver **Relatorios** (viewer), **Cadastros**,
**Contratos** e **Financeiro** — a nav ficou igual a do ADMIN **menos "Usuários"**.

### Onde navega (por superficie)

Nav = a do ADMIN **menos "Usuários"** (ACESSO UNIFICADO 2026-07-15 — ver a seção ADMIN):

| Destino    | Rota          | Desktop        | Mobile                            |
| ---------- | ------------- | -------------- | --------------------------------- |
| Inicio     | `/dashboard`  | Sidenav        | Tabbar                            |
| Lotes      | `/samples`    | Sidenav        | Tabbar                            |
| Relatorios | `/relatorios` | Sidenav        | Tabbar                            |
| Cadastros  | `/cadastros`  | Sidenav        | Tabbar (4o slot) + menu do avatar |
| Contratos  | `/contratos`  | Sidenav        | Menu do avatar                    |
| Embarques  | `/embarques`  | Sidenav        | Menu do avatar                    |
| Camera     | `/camera`     | — (sem botao)  | Tabbar (destaque, centro)         |
| Perfil     | `/profile`    | Menu do avatar | Menu do avatar                    |
| Sair       | logout        | Menu do avatar | Menu do avatar                    |

Contagem: **sidenav 6** (Inicio, Lotes, Relatorios, Cadastros, Contratos, Embarques),
**tabbar 5** (Inicio, Lotes, Camera, Cadastros, Relatorios), **menu do avatar** desktop
2 (Perfil, Sair) / mobile 5 (Perfil, Cadastros, Contratos, Embarques, Sair). Antes de
2026-07-15 eram 4 na sidenav (Inicio/Lotes/Clientes/Embarques), sem Relatorios/Cadastros.

### Rotas acessiveis sem botao de navegacao

- `/samples/[id]` — criar (modal do leque "+" em Lotes)/abrir lote. E onde
  o classificador faz a classificacao da amostra.
- `/camera` **no desktop** — rota liberada (`NON_PROSPECTOR_ROLES`), mas o botao
  de Camera so existe na tabbar mobile.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/users` (exige ADMIN) — **única rota bloqueada** desde o ACESSO UNIFICADO
  (2026-07-15). `/relatorios`, `/cadastros`, `/clients/[id]` e `/contratos` (antes
  bloqueadas ao CLASSIFIER) passaram a liberadas; `/embarques` já era.

### Particularidades de conteudo

- **Sem pagina ou secao exclusiva.** Nao ha rota nem area de UI restrita ao
  CLASSIFIER; o fluxo de classificar PARTE de `/samples` (criar/abrir lote →
  botao "Classificar"), mas RODA em **`/camera?sampleId=`** (nota da revisao
  LOT, 2026-07-07) — nas mesmas telas vistas pelos outros nao-prospectores.
- **`/dashboard`**: dashboard padrao, igual aos demais nao-prospectores (com
  `salesData`); apenas o PROSPECTOR tem dashboard dedicado.
- No backend, usuarios CLASSIFIER sao os que podem ser registrados como
  responsaveis de uma classificacao (validacao `CLASSIFIERS_*` em
  `src/samples/sample-command-service.js`) — selecao de pessoas, nao acesso de
  navegacao.

### Diferenca para o COMMERCIAL

Desde o **ACESSO UNIFICADO (2026-07-15)** a **navegacao e identica** (ambos = ADMIN
menos "Usuários"; sidenav 6, tabbar 5, avatar mobile 5). A diferenca e so de
**conteudo/atribuicao**, fora da navegacao: o Comercial pode ser **responsavel
comercial de cliente** (`isCommercialRole`); o Classifier pode ser registrado como
**responsavel de uma classificacao** (`CLASSIFIERS_*`). Ambos sao viewers em
Relatorios e gerenciam Contratos/Financeiro/Cadastros por igual.

## REGISTRATION — "Impressao"

Papel ligado a impressao/registro. **Na pratica existe para o agente de
impressao** (envio dos dados de etiqueta) — nao e um papel de uso humano no app,
o que explica a ausencia de UI propria. A navegacao segue **identica a do
Classifier** e, com o **ACESSO UNIFICADO (2026-07-15)**, igual a do ADMIN **menos
"Usuários"**.

_(Histórico: **saiu de `INFORME_ROLES` em 2026-07-10** — até então caía num placeholder
vazio em `/relatorios`; foi **reintegrado como viewer pleno pelo acesso unificado de
2026-07-15**, junto com Cadastros/Contratos/Financeiro.)_

### Onde navega (por superficie)

Nav = a do ADMIN **menos "Usuários"** (ACESSO UNIFICADO 2026-07-15; mesma do Classifier):

| Destino    | Rota          | Desktop                       | Mobile                            |
| ---------- | ------------- | ----------------------------- | --------------------------------- |
| Inicio     | `/dashboard`  | Sidenav                       | Tabbar                            |
| Lotes      | `/samples`    | Sidenav                       | Tabbar                            |
| Relatorios | `/relatorios` | Sidenav                       | Tabbar                            |
| Cadastros  | `/cadastros`  | Sidenav                       | Tabbar (4o slot) + menu do avatar |
| Contratos  | `/contratos`  | Sidenav                       | Menu do avatar                    |
| Embarques  | `/embarques`  | Sidenav                       | Menu do avatar                    |
| Camera     | `/camera`     | — (sem botao)                 | Tabbar (destaque, centro)         |
| Perfil     | `/profile`    | Menu do avatar ("Meu perfil") | Menu do avatar                    |
| Sair       | logout        | Menu do avatar                | Menu do avatar                    |

Contagem: **sidenav 6**, **tabbar 5** (Inicio, Lotes, Camera, Cadastros, Relatorios),
**menu do avatar** desktop 2 / mobile 5 — igual ao Classifier. Antes de 2026-07-15 eram
4 na sidenav (Inicio/Lotes/Clientes/Embarques), com Perfil no 5o slot da tabbar.

### Rotas acessiveis sem botao de navegacao

- `/samples/[id]` — a partir de Lotes (criação de lote = modal do leque "+").
- `/camera` **no desktop** — rota liberada, botao so na tabbar mobile.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/users` (exige ADMIN) — **única rota bloqueada** desde o ACESSO UNIFICADO
  (2026-07-15). `/relatorios`, `/cadastros`, `/clients/[id]` e `/contratos` passaram a
  liberadas (igual ao Classifier); `/embarques` já era.

### Particularidades de conteudo

- **Sem pagina ou secao exclusiva**: apesar do nome "Impressao", nao ha UI
  restrita ao REGISTRATION. A impressao de etiquetas acontece no fluxo de
  `/samples` (registro -> `REGISTRATION_CONFIRMED` -> classificacao/etiqueta),
  disponivel a todos os nao-prospectores. (`REGISTRATION_CONFIRMED` e um status
  de amostra, nao o papel.)
- **`/dashboard`**: dashboard padrao (com `salesData`), igual aos demais
  nao-prospectores.

### Diferenca para o COMMERCIAL

Desde o **ACESSO UNIFICADO (2026-07-15)** a **navegacao e identica** (ambos = ADMIN
menos "Usuários"). A unica diferenca vive **fora da navegacao**: o Comercial pode ser
**responsavel comercial de cliente** (`isCommercialRole`); o REGISTRATION nao. Ambos sao
viewers em Relatorios e gerenciam Contratos/Financeiro/Cadastros por igual.

## CADASTRO — "Cadastro"

Papel de cadastro / back-office. Acessa amostras e camera (como os demais
nao-prospectores) e tem o hub **Cadastros** — que concentra 2 abas:
**Clientes** (default, gestao de clientes/armazens) e **Corretores** (a aba
Bancos saiu na D141). O item "Clientes" avulso saiu da nav (ele acessa os clientes
pela aba Clientes do `/cadastros`; a rota `/clients` continua liberada por URL). Com
o **ACESSO UNIFICADO (2026-07-15)** ganhou **Relatorios** (viewer), a **gestao
`/contratos`** e o **Financeiro** — a nav ficou igual a do ADMIN **menos "Usuários"**
(`/users`, exclusivo do ADMIN, e a unica rota bloqueada).

### Onde navega (por superficie)

Nav = a do ADMIN **menos "Usuários"** (ACESSO UNIFICADO 2026-07-15):

| Destino    | Rota          | Desktop                       | Mobile                            |
| ---------- | ------------- | ----------------------------- | --------------------------------- |
| Inicio     | `/dashboard`  | Sidenav                       | Tabbar                            |
| Lotes      | `/samples`    | Sidenav                       | Tabbar                            |
| Relatorios | `/relatorios` | Sidenav                       | Tabbar                            |
| Cadastros  | `/cadastros`  | Sidenav                       | Tabbar (4o slot) + menu do avatar |
| Contratos  | `/contratos`  | Sidenav                       | Menu do avatar                    |
| Embarques  | `/embarques`  | Sidenav                       | Menu do avatar                    |
| Camera     | `/camera`     | — (sem botao)                 | Tabbar (destaque, centro)         |
| Perfil     | `/profile`    | Menu do avatar ("Meu perfil") | Menu do avatar                    |
| Sair       | logout        | Menu do avatar                | Menu do avatar                    |

Clientes (`/clients`) nao e mais item de nav proprio — e a **aba default do
`/cadastros`** (e segue acessivel por URL). Ver "Particularidades de conteudo".

Contagem: **sidenav 6** (Inicio, Lotes, Relatorios, Cadastros, Contratos, Embarques),
**tabbar 5** (Inicio, Lotes, Camera, Cadastros, Relatorios — o 4o slot fixo, que era
Clientes, vira Cadastros; o 5o slot passou de Perfil a **Relatorios** com o acesso
unificado), **menu do avatar** desktop 2 (Perfil, Sair) / mobile 5 (Perfil, Cadastros,
Contratos, Embarques, Sair). Antes de 2026-07-15 eram 4 na sidenav (sem Relatorios/Contratos).

### Rotas acessiveis sem botao de navegacao

- `/clients` — a lista de clientes, agora alcancada pela **aba Clientes do
  `/cadastros`** (ou por URL direta; guard `NON_PROSPECTOR_ROLES` inalterado).
- `/samples/[id]` — a partir de Lotes (criação de lote = modal do leque "+").
- `/clients/[id]` — detalhe do cliente, pelo "Gerenciar cliente" do modal do card
  (aba Clientes do `/cadastros`). Aberto a todo nao-PROSPECTOR desde 2026-07-15.
- `/camera` **no desktop** — rota liberada, botao so na tabbar mobile (igual aos
  demais nao-prospectores).

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/users` (exige ADMIN) — **única rota bloqueada** desde o ACESSO UNIFICADO
  (2026-07-15). `/relatorios` (viewer) e `/contratos` (gestao + Financeiro), antes
  bloqueadas ao CADASTRO, passaram a liberadas; `/embarques` já era.

### Particularidades de conteudo

- **`/cadastros`**: hub com **2 abas** (D141; eram 3 desde 2026-07-02) — **Clientes**
  (default; reusa o `<ClientsBrowser>`, a mesma experiencia da pagina /clients: busca,
  filtro, scroll infinito, detalhe, criar) e **Corretores** (gestao do
  Fechamento Fase 0). O FAB "+" e contextual a aba (cria cliente/corretor).
  E o ponto de acesso a clientes; desde o ACESSO UNIFICADO (2026-07-15) convive com
  as outras paginas de gestao que o CADASTRO passou a ter (`/contratos`, `/relatorios`).
  (`app/cadastros/page.tsx`.)
- **`/dashboard`**: dashboard padrao (com `salesData`), igual aos demais
  nao-prospectores.
- **Removido em 2026-06-28, reintegrado em 2026-07-15**: o CADASTRO era viewer +
  viewer de Relatorios (`/relatorios`, com a curadoria de então) e gestor de Contratos
  (`/contratos`); o acesso
  foi retirado em 2026-06-28 em todas as camadas (nav, guards e autorizacao de API).
  _(A **CC F2 de 2026-07-12** reabriu a operacao — `/embarques` desde o split de
  2026-07-13 — e o **ACESSO UNIFICADO de 2026-07-15** devolveu tambem a GESTAO:
  Relatorios como viewer + `/contratos` + Financeiro.)_
  As 2 notificacoes push de
  visita ("Nova visita promissora" / "Novo cliente encontrado") que apontam para
  `/relatorios` tambem sairam do CADASTRO. O lembrete semanal do COMMERCIAL e o deep
  link `/dashboard?informe=novo` do PROSPECTOR nao envolviam o CADASTRO.
- **Nota (2026-07-09)**: essas notificacoes push nao existem mais — o catalogo
  inteiro foi zerado (ver `docs/Notificacoes.md`). O paragrafo acima fica como
  registro historico da mudanca de audiencia; nenhuma notificacao e enviada hoje.

### Diferenca para o COMMERCIAL

Desde o **ACESSO UNIFICADO (2026-07-15)** a **navegacao e identica** (ambos = ADMIN
menos "Usuários"; sidenav 6 Inicio/Lotes/Relatorios/Cadastros/Contratos/Embarques,
tabbar 5, avatar mobile 5). Convergiram: o CADASTRO ganhou Relatorios/Contratos/
Financeiro e o Comercial ganhou Cadastros e perdeu o "Clientes" avulso. A unica
diferenca vive **fora da navegacao**: so o Comercial pode ser **responsavel comercial
de cliente** (`isCommercialRole`). _(Historico: ate 2026-07-01 eram quase espelhos;
o split de 2026-07-02 os afastou — CADASTRO com Cadastros, Comercial com Clientes
avulso + Relatorios — ate o acesso unificado reuni-los.)_

## ADMIN — "Administracao"

Acesso total — superconjunto de todos os papeis. **Unico que ve Usuários** (`/users`)
— a unica pagina que o distingue dos demais nao-PROSPECTOR desde o **ACESSO UNIFICADO
(2026-07-15)**. Em Relatorios e viewer + criador, capacidades que agora valem
para todo nao-PROSPECTOR. Nenhuma rota bloqueada.

### Onde navega (por superficie)

| Destino    | Rota          | Desktop                       | Mobile                            |
| ---------- | ------------- | ----------------------------- | --------------------------------- |
| Inicio     | `/dashboard`  | Sidenav                       | Tabbar                            |
| Lotes      | `/samples`    | Sidenav                       | Tabbar                            |
| Relatorios | `/relatorios` | Sidenav                       | Tabbar                            |
| Camera     | `/camera`     | — (sem botao)                 | Tabbar (destaque, centro)         |
| Cadastros  | `/cadastros`  | Sidenav                       | Tabbar (4o slot) + menu do avatar |
| Contratos  | `/contratos`  | Sidenav                       | Menu do avatar                    |
| Embarques  | `/embarques`  | Sidenav                       | Menu do avatar                    |
| Usuários   | `/users`      | Sidenav                       | Menu do avatar                    |
| Perfil     | `/profile`    | Menu do avatar ("Meu perfil") | Menu do avatar                    |
| Sair       | logout        | Menu do avatar                | Menu do avatar                    |

Clientes (`/clients`) nao e mais item de nav proprio do ADMIN — e a **aba default
do `/cadastros`** (e segue acessivel por URL). Ver "Particularidades de conteudo".

Contagem:

- **Sidenav desktop: 7 itens** — Inicio, Lotes, Relatorios, Cadastros, Contratos,
  Embarques, Usuários. (Perdeu Clientes avulso em 2026-07-02; ganhou Embarques no
  split de 2026-07-13; segue a sidenav mais cheia.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, **Cadastros**, Relatorios. O
  4o slot fixo (que era Clientes) vira Cadastros para o ADMIN (2026-07-02);
  Contratos/Embarques/Usuários continuam so no menu do avatar.
- **Menu do avatar:** assimetrico. No **desktop** sao 2 itens (Meu perfil, Sair) —
  a gestao esta na sidenav. No **mobile** sao 6 itens (Perfil, Usuários,
  Cadastros, Contratos, Embarques, Sair) — sem sidenav, o menu carrega toda a
  gestao; Cadastros aparece TANTO no 4o slot da tabbar QUANTO no menu do avatar
  (redundancia introduzida em 2026-07-02).

### Rotas acessiveis sem botao de navegacao

- `/clients` — a lista de clientes, agora alcancada pela **aba Clientes do
  `/cadastros`** (ou por URL direta; guard `NON_PROSPECTOR_ROLES` inalterado).
- `/samples/[id]`; `/camera` no desktop (criação de lote = modal do leque "+").
- `/clients/[id]` — detalhe do cliente, pelo "Gerenciar cliente" do modal do card
  (aba Clientes do `/cadastros`). Aberto a todo nao-PROSPECTOR desde 2026-07-15.

### Rotas bloqueadas

- Nenhuma — ADMIN acessa tudo.

### Particularidades de conteudo

- **`/relatorios` (Relatorios)**: ADMIN e **viewer** completo (RelatoriosViewer,
  `scope=all`) e **cria** — capacidades que, desde o **ACESSO UNIFICADO (2026-07-15)**,
  valem para todo nao-PROSPECTOR (`canCreate` deixou de ser `isAdmin`; o ramo "meus" do
  COMMERCIAL e a curadoria de vinculo sairam).
- **`/users`**: gestao de usuarios — **exclusiva do ADMIN** (nenhum outro papel
  acessa).
- **`/cadastros`**: hub com 2 abas (D141) — Clientes (default; gestao de
  clientes/armazens, mesma experiencia da pagina /clients via `<ClientsBrowser>`)
  e Corretores. **`/contratos`** (gestao dos contratos de venda + Financeiro) e
  **`/embarques`** (operacao, Embarque · Aprovacoes): desde 2026-07-15 **ambas
  compartilhadas com todo nao-PROSPECTOR**.
- **Modo manutencao**: o middleware redireciona **nao-ADMIN** para
  `/maintenance` — so o ADMIN usa o app durante a manutencao. (`middleware.ts`.)
- **`/dashboard`**: dashboard padrao (com `salesData`).

### Diferenca para o CADASTRO

Desde o **ACESSO UNIFICADO (2026-07-15)** ADMIN = CADASTRO **+ apenas Usuários**: a nav
e identica exceto pelo item **Usuários** (so ADMIN). Ambos sao viewers + criadores em Relatorios e gerenciam Cadastros/Contratos/Financeiro/Embarques por igual;
ambos acessam clientes pela aba Clientes do Cadastros. **Sidenav 7 vs 6** (so Usuários a
mais); tabbar 5 vs 5 iguais; menu do avatar no mobile 6 vs 5 (so Usuários a mais).

---

## Notas factuais (estado atual)

Observacoes neutras do mapeamento, sem juizo de "certo/errado":

1. **Camera so tem botao no mobile.** A rota `/camera` e acessivel a todos os
   `NON_PROSPECTOR_ROLES`, mas a unica entrada de navegacao esta na tabbar; a
   sidenav desktop nao lista Camera. No desktop, esses papeis nao alcancam a
   camera pela navegacao.
2. **"Relatorios" e igual para todo nao-PROSPECTOR (ACESSO UNIFICADO 2026-07-15).**
   O botao `/relatorios` aparece para os cinco papeis e todos entram como **viewer**
   (`scope=all`) + criam. Acabou a antiga divisao viewer (ADMIN) vs proprios
   (COMMERCIAL) — o ramo "meus" (`InformeCommercialPage`) foi removido.
3. **Redirects silenciosos.** `/settings` -> `/profile` e `/resumo` -> `/relatorios`.
4. **O menu do avatar muda de conteudo por plataforma.** No DESKTOP (dropdown do
   topbar, no `AppShell`) traz sempre so "Meu perfil" + "Sair" — a gestao
   (Cadastros/Contratos/Embarques/Usuários) fica na sidenav. No MOBILE (bottom sheet
   `HeaderAvatarMenu`) nao ha sidenav, entao o menu do avatar TAMBEM carrega o que la
   ficaria. Desde o **ACESSO UNIFICADO (2026-07-15)** esse conjunto e o mesmo para todo
   nao-PROSPECTOR: "Cadastros" (`/cadastros`) + "Contratos" (`/contratos`) + "Embarques"
   (`/embarques`); so o ADMIN acrescenta "Usuários". Assim, no mobile, todo nao-ADMIN tem
   **5 itens** no avatar (Perfil + Cadastros + Contratos + Embarques + Sair) e o ADMIN
   **6** (+ Usuários), contra 2 no desktop (Perfil + Sair). Cadastros aparece em DOIS
   lugares no mobile (4o slot da tabbar + menu do avatar).
5. **Todo nao-PROSPECTOR ve Relatorios (ACESSO UNIFICADO 2026-07-15).** Antes,
   CLASSIFIER (nunca teve) e CADASTRO (removido em 2026-06-28) ficavam fora de
   `INFORME_ROLES` e recebiam Perfil como 5o item da tabbar; agora `INFORME_ROLES =
NON_PROSPECTOR_ROLES`, os cinco papeis tem Relatorios e o 5o slot da tabbar e
   Relatorios para todos.
6. **CLASSIFIER e REGISTRATION tem a MESMA navegacao.** Ambos estao em
   `NON_PROSPECTOR_ROLES` e, desde o ACESSO UNIFICADO (2026-07-15), com a nav completa
   (sidenav 6, tabbar 5 com Relatorios no 5o slot, avatar mobile 5) — a do ADMIN menos
   "Usuários". _(Historico: ate 2026-07-15 ambos ficavam fora de `INFORME_ROLES`, com
   sidenav 4 e Perfil no 5o slot; ate 2026-07-10 o REGISTRATION caia num placeholder
   vazio em `/relatorios`.)_
7. **Split Clientes (operacao) x Cadastros (gestao) — 2026-07-02, universalizado em
   2026-07-15.** A capacidade de gerir clientes sempre foi a mesma para todos; o ponto
   de entrada, que ate 2026-07-14 variava por papel (COMMERCIAL/CLASSIFIER/REGISTRATION
   usavam "Clientes" avulso; ADMIN/CADASTRO a aba "Clientes" do `/cadastros`), passou a
   ser **a aba Clientes do `/cadastros` para todos** (o "Clientes" avulso saiu da nav de
   todos). O hub `/cadastros` (que ja teve 3 abas Clientes | Bancos | Corretores; Bancos
   saiu na D141 — hoje 2) passou de ADMIN+CADASTRO a `NON_PROSPECTOR_ROLES` (=
   `CLIENT_MANAGEMENT_ROLES`). Guard da lista `/clients` inalterado
   (`NON_PROSPECTOR_ROLES`, ainda acessivel por URL). Implementacao compartilhada:
   `components/clients/ClientsBrowser.tsx` (mesma UI nas duas telas; snapshots isolados
   por `storageKey`).
8. **Operacao E gestao de contrato abertas a todo nao-PROSPECTOR (ACESSO UNIFICADO
   2026-07-15).** Antes os operacionais (CLASSIFIER/REGISTRATION/CADASTRO) so tinham
   `/embarques` (Embarque · Aprovacoes; CC F2 2026-07-12, pagina propria no split
   2026-07-13); agora tambem `/contratos` (Contratos · Financeiro) e o resto da nav. A
   lista da Aprovacao nao e escopada por corretor (todos veem todos, so nao-sensivel);
   o "Ver contrato" abre o detalhe em `/contratos` a **qualquer nao-PROSPECTOR** em
   qualquer contrato (escopo aberto, D140).

## Manutencao

Documento de suporte (read-only). Referencia o codigo (`lib/roles.ts`,
`components/AppShell.tsx`, `app/**`) em vez de duplicar listas que mudam. Ao
alterar navegacao ou guards, revisar este mapeamento. Listado no indice
`docs/README.md`.
