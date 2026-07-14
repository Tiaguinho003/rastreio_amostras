# Auditoria de Navegacao por Papel de Usuario

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
é não-escopada (todos veem todos, só não-sensível); o "Ver contrato" abre a ADMIN + COMMERCIAL em qualquer contrato (escopo aberto, D140).
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
  (todos menos PROSPECTOR) — guard das paginas de amostras, camera e da **lista**
  de clientes (`/clients`).
- `CLIENT_MANAGEMENT_ROLES` = ADMIN, CADASTRO (helper `canManageClients`) — quem
  GERENCIA cadastro de cliente: guard do hub `/cadastros` e do **detalhe**
  `/clients/[id]`, mais o botao "Gerenciar cliente". Sem equivalente no backend
  (ver a nota da matriz). _(O card "Cadastros pendentes" do dashboard, antes gated
  por este helper, foi REMOVIDO em 2026-07-12 — DSB-D2.)_
- `INFORME_ROLES` = ADMIN, COMMERCIAL — guard da pagina "Relatorios"
  (`/informe`). CADASTRO saiu em 2026-06-28; REGISTRATION em 2026-07-10. Cobre
  exatamente os dois ramos da pagina: nao ha papel com acesso e sem conteudo.
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
- `isVisitReportViewer(role)` / `isVisitLinkCurator(role)` = ADMIN (visao de
  supervisao e curadoria em `/informe`; CADASTRO saiu em 2026-06-28).

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
> Cadastros, Contratos, Embarques, Usuarios), so nas **8 rotas principais**
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
`ADMIN_NAV_ITEM` (Usuarios), `MOBILE_NAV_ITEMS` (inclui Camera). A filtragem por
papel da sidenav (desktop) fica em `desktopNavItems` (`AppShell.tsx`), a da tabbar no
`<MobileTabbar items={...} />`, e a do menu do avatar no `HeaderAvatarMenu.tsx`.
Os icones (`renderNavIcon`) servem a tabbar mobile E a sidenav desktop (DSB-D15
devolveu os icones ao desktop; na top bar do DSB-D6 era so texto).

Split Clientes x Cadastros (2026-07-02): para **ADMIN e CADASTRO**, `desktopNavItems`
filtra o item "Clientes" fora da sidenav (eles acessam clientes pela aba "Clientes"
do hub `/cadastros`); e no mobile o 4o slot fixo da tabbar (`/clients`) e trocado
por "Cadastros". Os demais nao-prospectores (COMMERCIAL/CLASSIFIER/REGISTRATION)
mantem "Clientes" na sidenav e na tabbar e nao veem Cadastros.

## Referencia 3 — Universo de rotas

| Rota                                                                                          | Pagina                                              | Guard de acesso                                                                     |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/login`, `/forgot-password` (redirect → modal no `/login`), `/maintenance`, `/laudo/[token]` | publicas                                            | sem auth                                                                            |
| `/dashboard`                                                                                  | Inicio                                              | qualquer autenticado                                                                |
| `/profile`                                                                                    | Perfil                                              | qualquer autenticado                                                                |
| `/settings`                                                                                   | —                                                   | redireciona para `/profile`                                                         |
| `/offline`                                                                                    | offline PWA                                         | qualquer autenticado                                                                |
| `/samples`, `/samples/[id]`                                                                   | Lotes                                               | `NON_PROSPECTOR_ROLES`                                                              |
| `/camera`                                                                                     | Camera                                              | `NON_PROSPECTOR_ROLES`                                                              |
| `/clients`                                                                                    | Clientes (lista)                                    | `NON_PROSPECTOR_ROLES`                                                              |
| `/clients/[id]`                                                                               | Detalhe do cliente                                  | `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO)                                        |
| `/informe`                                                                                    | Relatorios                                          | `INFORME_ROLES` (conteudo adaptativo por papel)                                     |
| `/resumo`                                                                                     | —                                                   | redireciona para `/informe`                                                         |
| `/cadastros`                                                                                  | Cadastros                                           | `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO)                                        |
| `/contratos`                                                                                  | Contratos (gestão — sub-abas Contratos·Financeiro)  | `CONTRATOS_ROLES` (ADMIN + COMMERCIAL; operacionais → /dashboard). Nav "Contratos". |
| `/embarques`                                                                                  | Embarques (operação — sub-abas Embarque·Aprovações) | `NON_PROSPECTOR_ROLES` (todos menos PROSPECTOR). Nav "Embarques". Abre em Embarque. |
| `/financeiro`                                                                                 | → redirect para `/contratos?tab=financeiro`         | (redirect server-side)                                                              |
| `/users`                                                                                      | Usuarios                                            | ADMIN                                                                               |

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

| Rota               | ADMIN     | CLASSIFIER | REGISTRATION | COMMERCIAL  | CADASTRO | PROSPECTOR    |
| ------------------ | --------- | ---------- | ------------ | ----------- | -------- | ------------- |
| `/dashboard`       | ✅        | ✅         | ✅           | ✅          | ✅       | ✅ (dedicado) |
| `/profile`         | ✅        | ✅         | ✅           | ✅          | ✅       | ✅            |
| `/samples` (+sub)  | ✅        | ✅         | ✅           | ✅          | ✅       | ❌            |
| `/camera`          | ✅        | ✅         | ✅           | ✅          | ✅       | ❌            |
| `/clients` (lista) | ✅        | ✅         | ✅           | ✅          | ✅       | ❌            |
| `/clients/[id]`    | ✅        | ❌         | ❌           | ❌          | ✅       | ❌            |
| `/informe`         | ✅ viewer | ❌         | ❌           | ✅ proprios | ❌       | ❌            |
| `/cadastros`       | ✅        | ❌         | ❌           | ❌          | ✅       | ❌            |
| `/contratos`       | ✅        | ❌         | ❌           | ✅          | ❌       | ❌            |
| `/embarques`       | ✅        | ✅         | ✅           | ✅          | ✅       | ❌            |
| `/users`           | ✅        | ❌         | ❌           | ❌          | ❌       | ❌            |

`/informe` por papel: ADMIN = viewer (todos os informes + curadoria + cria, FAB);
COMMERCIAL = proprios (scope=mine + FAB); CLASSIFIER / REGISTRATION / CADASTRO /
PROSPECTOR = sem acesso. (`app/informe/page.tsx`.) O REGISTRATION saiu em
2026-07-10: tinha acesso a um placeholder vazio, e os dois gates do backend ja o
recusavam.

`/contratos` + `/embarques` por papel (SPLIT 2026-07-13): o antigo hub `/contratos`
virou **2 paginas** no eixo gestao × operacao. **`/contratos`** (sub-abas Contratos ·
Financeiro) = gestao, guard **`CONTRATOS_ROLES`** (ADMIN + COMMERCIAL; operacionais
caem no redirect → /dashboard), nav **"Contratos"**. **`/embarques`** (sub-abas
Embarque · Aprovacoes) = operacao, guard **`NON_PROSPECTOR_ROLES`** (todos menos
PROSPECTOR), nav **"Embarques"**, abre em Embarque. ADMIN/COMMERCIAL tem os **2 itens
de nav**; operacionais so **"Embarques"** (`contractsHubTabs` / `contractTabRoute`,
`lib/roles.ts`). A lista da Aprovacao nao e escopada por corretor (todos veem todos, so
nao-sensivel); o "Ver contrato" abre o detalhe em `/contratos` a ADMIN + COMMERCIAL
em qualquer contrato (escopo aberto, D140). Detalhe da casca em `Contratos-Visao-Geral.md` §2.

**Acesso (guard) x visibilidade na nav (2026-07-02):** para a **lista** `/clients` o
guard segue `NON_PROSPECTOR_ROLES` (todos os 5 ✅ e a rota continua acessivel por
URL), mas o _item de nav_ "Clientes" nao aparece mais para ADMIN/CADASTRO — eles
chegam aos clientes pela aba "Clientes" do `/cadastros`. E `/cadastros` deixou de
ser so um hub de lookups: hospeda as abas Clientes (default) | Corretores
(a aba Bancos existiu de 2026-07-02 a 2026-07-14; saiu na D141).

**Detalhe do cliente restrito (2026-07-09):** `/clients/[id]` saiu de
`NON_PROSPECTOR_ROLES` e passou a `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO,
`lib/roles.ts`) — e uma tela de GESTAO de cadastro (edicao, filiais, contas
bancarias, anexos, inativacao em cascata). CLASSIFIER, COMMERCIAL e REGISTRATION
ficam com a lista `/clients` + o modal de consulta que abre ao tocar no card
(Documento/Telefone/Lotes em aberto/Papel); o botao **"Gerenciar cliente"** desse
modal — **unica porta de navegacao pro detalhe em todo o app**
(`components/clients/ClientsBrowser.tsx`) — some pra eles. Por URL direta o guard
manda de volta pra `/clients` (`unauthorizedRedirectTo`), nao pro `/dashboard`.
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

## COMMERCIAL — "Comercial"

Papel comercial padrao (vendedor). Sem app restrito (diferente do PROSPECTOR) e
sem acesso de gestao de cadastros/usuarios (Cadastros/Usuarios); a gestao de
**Contratos** ele TEM (`CONTRATOS_ROLES`, escopo aberto — D140).

### Onde navega (por superficie)

| Destino    | Rota         | Desktop        | Mobile                    |
| ---------- | ------------ | -------------- | ------------------------- |
| Inicio     | `/dashboard` | Sidenav        | Tabbar                    |
| Lotes      | `/samples`   | Sidenav        | Tabbar                    |
| Clientes   | `/clients`   | Sidenav        | Tabbar                    |
| Relatorios | `/informe`   | Sidenav        | Tabbar                    |
| Contratos  | `/contratos` | Sidenav        | Menu do avatar            |
| Embarques  | `/embarques` | Sidenav        | Menu do avatar            |
| Camera     | `/camera`    | — (sem botao)  | Tabbar (destaque, centro) |
| Perfil     | `/profile`   | Menu do avatar | Menu do avatar            |
| Sair       | logout       | Menu do avatar | Menu do avatar            |

Contagem (pos-split 2026-07-13):

- **Sidenav desktop: 6 itens** — Inicio, Lotes, Clientes, Relatorios, Contratos,
  Embarques.
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Relatorios.
  (Contratos/Embarques nao entram na tabbar; ficam no menu do avatar.)
- **Menu do avatar:** desktop **2 itens** (Perfil, Sair) — as 2 paginas de contrato
  estao na sidenav; mobile **4 itens** (Perfil, Contratos, Embarques, Sair) — sem
  sidenav, as 2 paginas caem no avatar.

### Rotas acessiveis sem botao de navegacao

Alcancadas por fluxo interno ou URL direta (guard permite), mas sem item de menu
proprio:

- `/samples/[id]` — criar (modal do leque "+" em Lotes)/abrir lote. **Detalhe uniforme (LDT-D1, 2026-07-08):** os 5 papeis nao-PROSPECTOR veem e fazem exatamente o mesmo no detalhe (nenhuma granularidade por papel); PROSPECTOR e barrado nas 3 camadas (guard, middleware, e API 403 via allowlist — inclusive a leitura `getSampleDetail` e a foto `getSampleAttachmentDescriptor`, LDT-D4).
- `/camera` **no desktop** — a rota e liberada (`NON_PROSPECTOR_ROLES`), mas o
  unico botao de Camera esta na tabbar mobile; a sidenav nao tem essa entrada.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/cadastros` (exige ADMIN/CADASTRO). **(`/contratos` e `/embarques` NAO sao
  bloqueados: o COMMERCIAL esta em `CONTRATOS_ROLES` e acessa as 2 paginas —
  `/contratos` com Contratos · Financeiro e `/embarques` com Embarque · Aprovacoes.)**
- `/clients/[id]` (detalhe do cliente — `CLIENT_MANAGEMENT_ROLES`, so ADMIN/CADASTRO;
  a lista `/clients` continua liberada).
- `/users` (exige ADMIN).

### Particularidades de conteudo

- **`/informe` (Relatorios)**: para o Comercial renderiza `InformeCommercialPage`
  — feed dos PROPRIOS informes (`scope=mine`) + FAB de criacao. (Nao e a visao de
  supervisao do viewer, hoje so o ADMIN.) O antigo `/resumo` redireciona para ca;
  o Comercial saiu dos viewers em 2026-06-18.
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

Papel operacional de classificacao. E o unico papel nao-prospector fora de
`INFORME_ROLES`: nao ve "Relatorios" em superficie nenhuma. Sem app restrito
(acessa amostras/clientes/camera como os demais nao-prospectores) e sem acesso
de gestao.

### Onde navega (por superficie)

| Destino   | Rota         | Desktop        | Mobile                            |
| --------- | ------------ | -------------- | --------------------------------- |
| Inicio    | `/dashboard` | Sidenav        | Tabbar                            |
| Lotes     | `/samples`   | Sidenav        | Tabbar                            |
| Clientes  | `/clients`   | Sidenav        | Tabbar                            |
| Embarques | `/embarques` | Sidenav        | Menu do avatar                    |
| Camera    | `/camera`    | — (sem botao)  | Tabbar (destaque, centro)         |
| Perfil    | `/profile`   | Menu do avatar | Tabbar (5o slot) + menu do avatar |
| Sair      | logout       | Menu do avatar | Menu do avatar                    |

Contagem:

- **Sidenav desktop: 4 itens** — Inicio, Lotes, Clientes, **Embarques**. (Sem
  Relatorios, como o CADASTRO e o REGISTRATION; "Embarques" e a pagina `/embarques`
  — sub-abas Embarque · Aprovacoes, split 2026-07-13.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Perfil. O 5o
  slot, que nos papeis de `INFORME_ROLES` e Relatorios, aqui e Perfil — para o
  Classifier ter 5 abas como os demais (2026-06-28). (Embarques nao entra na
  tabbar; fica no menu do avatar.)
- **Menu do avatar:** desktop **2 itens** (Perfil, Sair); mobile **3 itens**
  (Perfil, **Embarques**, Sair) — sem sidenav, o hub cai no avatar. No mobile,
  Perfil tambem aparece na tabbar.

### Rotas acessiveis sem botao de navegacao

- `/samples/[id]` — criar (modal do leque "+" em Lotes)/abrir lote. E onde
  o classificador faz a classificacao da amostra.
- `/camera` **no desktop** — rota liberada (`NON_PROSPECTOR_ROLES`), mas o botao
  de Camera so existe na tabbar mobile.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/informe` (Relatorios) — CLASSIFIER esta fora de `INFORME_ROLES`.
- `/cadastros` e `/clients/[id]` (exigem ADMIN/CADASTRO — `CLIENT_MANAGEMENT_ROLES`).
- `/users` (exige ADMIN).
- `/contratos` (gestao) — bloqueado desde o **split de 2026-07-13** (`CONTRATOS_ROLES`);
  a operacao do CLASSIFIER vive em **`/embarques`** (Embarque · Aprovacoes) — sidenav
  desktop + menu do avatar mobile.

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

Duas diferencas: **Relatorios** e a **pagina de gestao `/contratos`**. O Comercial
esta em `INFORME_ROLES` e ve Relatorios na sidenav e na tabbar (+ feed proprio); o
Classifier nao ve em lugar nenhum e e redirecionado se tentar a URL. Ambos acessam
**`/embarques`** (Embarque · Aprovacoes), mas so o Comercial (em `CONTRATOS_ROLES`)
tem tambem **`/contratos`** (Contratos · Financeiro). Para o Classifier ter 5 abas no
mobile, o 5o slot da sua tabbar e Perfil (no Comercial e Relatorios). Resultado:
**sidenav 4 vs 6 itens** (o Comercial tem Relatorios e Contratos a mais); tabbar 5
vs 5 (5o item: Perfil no Classifier, Relatorios no Comercial); menu do avatar no
mobile 3 vs 4 (Classifier: Perfil, Embarques, Sair; Comercial: + Contratos),
desktop 2 nos dois.

## REGISTRATION — "Impressao"

Papel ligado a impressao/registro. **Na pratica existe para o agente de
impressao** (envio dos dados de etiqueta) — nao e um papel de uso humano no app,
o que explica a ausencia de UI propria. A navegacao e **identica a do
Classifier**: `NON_PROSPECTOR_ROLES` sem `INFORME_ROLES`.

**Saiu de `INFORME_ROLES` em 2026-07-10.** Ate entao tinha acesso a Relatorios e
caia num placeholder vazio: nao e viewer (so ADMIN) nem autor (so COMMERCIAL), e
os dois gates do backend ja o recusavam. O acesso nao lhe dava nada alem da
propria moldura, e ocupava um slot da tabbar.

### Onde navega (por superficie)

| Destino   | Rota         | Desktop                       | Mobile                    |
| --------- | ------------ | ----------------------------- | ------------------------- |
| Inicio    | `/dashboard` | Sidenav                       | Tabbar                    |
| Lotes     | `/samples`   | Sidenav                       | Tabbar                    |
| Clientes  | `/clients`   | Sidenav                       | Tabbar                    |
| Embarques | `/embarques` | Sidenav                       | Menu do avatar            |
| Camera    | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro) |
| Perfil    | `/profile`   | Menu do avatar ("Meu perfil") | Tabbar + menu do avatar   |
| Sair      | logout       | Menu do avatar                | Menu do avatar            |

Contagem:

- **Sidenav desktop: 4 itens** — Inicio, Lotes, Clientes, **Embarques** (a pagina
  `/embarques`, sub-abas Embarque · Aprovacoes — mesmo arranjo do Classifier).
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Perfil. O 5o
  slot, que nos papeis de `INFORME_ROLES` e Relatorios, aqui e Perfil — mesmo
  arranjo do Classifier.
- **Menu do avatar:** desktop **2 itens** (Perfil, Sair); mobile **3 itens**
  (Perfil, **Embarques**, Sair) — igual ao Classifier.

### Rotas acessiveis sem botao de navegacao

- `/samples/[id]` — a partir de Lotes (criação de lote = modal do leque "+").
- `/camera` **no desktop** — rota liberada, botao so na tabbar mobile.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/informe` (Relatorios) — fora de `INFORME_ROLES` desde 2026-07-10.
- `/cadastros` e `/clients/[id]` (ADMIN/CADASTRO); `/users` (ADMIN).
- `/contratos` (gestao) — bloqueado desde o split de 2026-07-13; a operacao vive em
  **`/embarques`** — igual ao Classifier.

### Particularidades de conteudo

- **Sem pagina ou secao exclusiva**: apesar do nome "Impressao", nao ha UI
  restrita ao REGISTRATION. A impressao de etiquetas acontece no fluxo de
  `/samples` (registro -> `REGISTRATION_CONFIRMED` -> classificacao/etiqueta),
  disponivel a todos os nao-prospectores. (`REGISTRATION_CONFIRMED` e um status
  de amostra, nao o papel.)
- **`/dashboard`**: dashboard padrao (com `salesData`), igual aos demais
  nao-prospectores.

### Diferenca para o COMMERCIAL

O Comercial esta em `INFORME_ROLES` e ve Relatorios na sidenav e na tabbar (feed
dos PROPRIOS informes, `scope=mine`, + FAB de criacao); o REGISTRATION nao ve em
lugar nenhum desde 2026-07-10 e e redirecionado se tentar a URL. Ambos acessam
**`/embarques`**, mas so o Comercial tem tambem **`/contratos`** (gestao). Sidenav
**6 vs 4** itens (o Comercial tem Relatorios e Contratos a mais); tabbar 5 vs 5 (5o
item: Relatorios no Comercial, Perfil no REGISTRATION); menu do avatar no mobile 4
vs 3 (o Comercial tem Contratos a mais). (Fora da navegacao: o Comercial
pode ser responsavel comercial de cliente via `isCommercialRole`; o REGISTRATION nao.)

## CADASTRO — "Cadastro"

Papel de cadastro / back-office. Acessa amostras e camera (como os demais
nao-prospectores) e tem o hub **Cadastros** — que concentra 2 abas:
**Clientes** (default, gestao de clientes/armazens) e **Corretores** (a aba
Bancos saiu na D141). Por isso o item "Clientes" avulso saiu da nav do CADASTRO: ele
acessa os clientes pela aba Clientes do `/cadastros` (a rota `/clients` continua
liberada por URL). **Nao** acessa Relatorios (removido em 2026-06-28; hoje
ADMIN/COMMERCIAL) nem a gestao `/contratos` (hoje ADMIN + COMMERCIAL) nem `/users`
(exclusivo do ADMIN); a operacao de contrato dele vive em `/embarques`.

### Onde navega (por superficie)

| Destino   | Rota         | Desktop                       | Mobile                            |
| --------- | ------------ | ----------------------------- | --------------------------------- |
| Inicio    | `/dashboard` | Sidenav                       | Tabbar                            |
| Lotes     | `/samples`   | Sidenav                       | Tabbar                            |
| Camera    | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro)         |
| Cadastros | `/cadastros` | Sidenav                       | Tabbar (4o slot) + menu do avatar |
| Embarques | `/embarques` | Sidenav                       | Menu do avatar                    |
| Perfil    | `/profile`   | Menu do avatar ("Meu perfil") | Tabbar (5o slot) + menu do avatar |
| Sair      | logout       | Menu do avatar                | Menu do avatar                    |

Clientes (`/clients`) nao e mais item de nav proprio — e a **aba default do
`/cadastros`** (e segue acessivel por URL). Ver "Particularidades de conteudo".

Contagem:

- **Sidenav desktop: 4 itens** — Inicio, Lotes, Cadastros, **Embarques**. (Perdeu
  Clientes em 2026-07-02 e a GESTAO de Contratos em 2026-06-28; a operacao voltou
  pela CC F2 e, desde o split de 2026-07-13, e a pagina propria `/embarques` —
  sub-abas Embarque · Aprovacoes.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, **Cadastros**, Perfil. O 4o
  slot fixo (que era Clientes) vira Cadastros para o CADASTRO (2026-07-02); o 5o
  slot e Perfil (fora de `INFORME_ROLES`, mesma logica do Classifier). (Embarques
  nao entra na tabbar; fica no menu do avatar.)
- **Menu do avatar:** assimetrico por plataforma. No **desktop** sao 2 itens (Meu
  perfil, Sair) — Cadastros e Embarques estao na sidenav. No **mobile** sao 4 itens
  (Perfil, Cadastros, **Embarques**, Sair) — `HeaderAvatarMenu` carrega `/embarques`
  p/ todo nao-PROSPECTOR; Cadastros aparece TANTO no 4o slot da tabbar
  QUANTO no menu do avatar (redundancia de 2026-07-02).

### Rotas acessiveis sem botao de navegacao

- `/clients` — a lista de clientes, agora alcancada pela **aba Clientes do
  `/cadastros`** (ou por URL direta; guard `NON_PROSPECTOR_ROLES` inalterado).
- `/samples/[id]` — a partir de Lotes (criação de lote = modal do leque "+").
- `/clients/[id]` — detalhe do cliente, pelo "Gerenciar cliente" do modal do card
  (aba Clientes do `/cadastros`). Restrito a ADMIN + CADASTRO.
- `/camera` **no desktop** — rota liberada, botao so na tabbar mobile (igual aos
  demais nao-prospectores).

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/informe` (Relatorios) — removido do CADASTRO em 2026-06-28 (so ADMIN/COMMERCIAL);
  CADASTRO saiu de `INFORME_ROLES`.
- `/users` — exclusivo do ADMIN.

`/contratos` (gestao) segue **bloqueado** ao CADASTRO (desde 2026-06-28; pos-split o
guard e `CONTRATOS_ROLES`). A operacao que a CC F2 (2026-07-12) reabriu vive hoje na
pagina propria **`/embarques`** (Embarque · Aprovacoes, split 2026-07-13) — sidenav
desktop + menu do avatar mobile.

### Particularidades de conteudo

- **`/cadastros`**: hub com **2 abas** (D141; eram 3 desde 2026-07-02) — **Clientes**
  (default; reusa o `<ClientsBrowser>`, a mesma experiencia da pagina /clients: busca,
  filtro, scroll infinito, detalhe, criar) e **Corretores** (gestao do
  Fechamento Fase 0). O FAB "+" e contextual a aba (cria cliente/corretor).
  E a unica pagina de "gestao" que sobra para o CADASTRO, e agora tambem o ponto
  de acesso a clientes. (`app/cadastros/page.tsx`.)
- **`/dashboard`**: dashboard padrao (com `salesData`), igual aos demais
  nao-prospectores.
- **Removido em 2026-06-28**: o CADASTRO era viewer + curador de Relatorios
  (`/informe`) e gestor de Contratos (`/contratos`); o acesso foi retirado em
  todas as camadas (nav, guards e autorizacao de API). _(A GESTAO de Contratos
  segue fora; a **CC F2 de 2026-07-12** reabriu a operacao ao CADASTRO — que desde o
  split de 2026-07-13 e a pagina propria `/embarques` (Embarque + Aprovacoes), sem
  as abas de gestao.)_
  As 2 notificacoes push de
  visita ("Nova visita promissora" / "Novo cliente encontrado") que apontam para
  `/informe` tambem sairam do CADASTRO. O lembrete semanal do COMMERCIAL e o deep
  link `/dashboard?informe=novo` do PROSPECTOR nao envolviam o CADASTRO.
- **Nota (2026-07-09)**: essas notificacoes push nao existem mais — o catalogo
  inteiro foi zerado (ver `docs/Notificacoes.md`). O paragrafo acima fica como
  registro historico da mudanca de audiencia; nenhuma notificacao e enviada hoje.

### Diferenca para o COMMERCIAL

Ate 2026-07-01 eram quase espelhos (trocando Relatorios por Cadastros). Com o
split de 2026-07-02 divergiram mais: o Comercial ve "Clientes" avulso na nav e nao
ve Cadastros; o CADASTRO nao tem "Clientes" avulso (acessa pela aba Clientes do
Cadastros) e tem o hub Cadastros no lugar de Relatorios. Ambos acessam `/embarques`,
mas so o Comercial (em `CONTRATOS_ROLES`) tem tambem a gestao `/contratos`.
**Sidenav 4 (CADASTRO: Inicio/Lotes/Cadastros/Embarques) vs 6 (Comercial:
Inicio/Lotes/Clientes/Relatorios/Contratos/Embarques)**; tabbar 5 vs 5 mas com 4o e
5o slots diferentes (CADASTRO: Cadastros/Perfil; Comercial: Clientes/Relatorios);
menu do avatar no mobile 4 vs 4 (CADASTRO: Perfil/Cadastros/Embarques/Sair;
Comercial: Perfil/Contratos/Embarques/Sair).

## ADMIN — "Administracao"

Acesso total — superconjunto de todos os papeis. Unico que ve **Usuarios**
(`/users`) e o unico viewer + curador + **criador** em Relatorios. Nenhuma rota
bloqueada.

### Onde navega (por superficie)

| Destino    | Rota         | Desktop                       | Mobile                            |
| ---------- | ------------ | ----------------------------- | --------------------------------- |
| Inicio     | `/dashboard` | Sidenav                       | Tabbar                            |
| Lotes      | `/samples`   | Sidenav                       | Tabbar                            |
| Relatorios | `/informe`   | Sidenav                       | Tabbar                            |
| Camera     | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro)         |
| Cadastros  | `/cadastros` | Sidenav                       | Tabbar (4o slot) + menu do avatar |
| Contratos  | `/contratos` | Sidenav                       | Menu do avatar                    |
| Embarques  | `/embarques` | Sidenav                       | Menu do avatar                    |
| Usuarios   | `/users`     | Sidenav                       | Menu do avatar                    |
| Perfil     | `/profile`   | Menu do avatar ("Meu perfil") | Menu do avatar                    |
| Sair       | logout       | Menu do avatar                | Menu do avatar                    |

Clientes (`/clients`) nao e mais item de nav proprio do ADMIN — e a **aba default
do `/cadastros`** (e segue acessivel por URL). Ver "Particularidades de conteudo".

Contagem:

- **Sidenav desktop: 7 itens** — Inicio, Lotes, Relatorios, Cadastros, Contratos,
  Embarques, Usuarios. (Perdeu Clientes avulso em 2026-07-02; ganhou Embarques no
  split de 2026-07-13; segue a sidenav mais cheia.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, **Cadastros**, Relatorios. O
  4o slot fixo (que era Clientes) vira Cadastros para o ADMIN (2026-07-02);
  Contratos/Embarques/Usuarios continuam so no menu do avatar.
- **Menu do avatar:** assimetrico. No **desktop** sao 2 itens (Meu perfil, Sair) —
  a gestao esta na sidenav. No **mobile** sao 6 itens (Perfil, Usuarios,
  Cadastros, Contratos, Embarques, Sair) — sem sidenav, o menu carrega toda a
  gestao; Cadastros aparece TANTO no 4o slot da tabbar QUANTO no menu do avatar
  (redundancia introduzida em 2026-07-02).

### Rotas acessiveis sem botao de navegacao

- `/clients` — a lista de clientes, agora alcancada pela **aba Clientes do
  `/cadastros`** (ou por URL direta; guard `NON_PROSPECTOR_ROLES` inalterado).
- `/samples/[id]`; `/camera` no desktop (criação de lote = modal do leque "+").
- `/clients/[id]` — detalhe do cliente, pelo "Gerenciar cliente" do modal do card
  (aba Clientes do `/cadastros`). Restrito a ADMIN + CADASTRO.

### Rotas bloqueadas

- Nenhuma — ADMIN acessa tudo.

### Particularidades de conteudo

- **`/informe` (Relatorios)**: ADMIN e o **viewer** completo (RelatoriosViewer,
  `scope=all`), **cura** vinculos (`isVisitLinkCurator`) e e o unico que **cria**
  (FAB, `canCreate={isAdmin}`).
- **`/users`**: gestao de usuarios — **exclusiva do ADMIN** (nenhum outro papel
  acessa).
- **`/cadastros`**: hub com 2 abas (D141) — Clientes (default; gestao de
  clientes/armazens, mesma experiencia da pagina /clients via `<ClientsBrowser>`)
  e Corretores. **`/contratos`**: gestao dos contratos de venda (Fechamento).
  **`/embarques`**: a operacao (Embarque · Aprovacoes), compartilhada com os
  operacionais.
- **Modo manutencao**: o middleware redireciona **nao-ADMIN** para
  `/maintenance` — so o ADMIN usa o app durante a manutencao. (`middleware.ts`.)
- **`/dashboard`**: dashboard padrao (com `salesData`).

### Diferenca para o CADASTRO

ADMIN = CADASTRO **+ Relatorios + Contratos (gestao) + Usuarios**: os dois acessam
`/embarques` (operacao), mas so o ADMIN tem tambem `/contratos` (Contratos ·
Financeiro). No Relatorios, alem de ver/curar, o ADMIN tambem **cria**. Ambos
perderam "Clientes" avulso e acessam clientes pela aba Clientes do Cadastros.
**Sidenav 7 vs 4**; tabbar 5 vs 5 — 4o slot igual (Cadastros nos dois), 5o slot
diferente (ADMIN Relatorios, CADASTRO Perfil); menu do avatar no mobile 6 vs 4.

---

## Notas factuais (estado atual)

Observacoes neutras do mapeamento, sem juizo de "certo/errado":

1. **Camera so tem botao no mobile.** A rota `/camera` e acessivel a todos os
   `NON_PROSPECTOR_ROLES`, mas a unica entrada de navegacao esta na tabbar; a
   sidenav desktop nao lista Camera. No desktop, esses papeis nao alcancam a
   camera pela navegacao.
2. **"Relatorios" rotula o mesmo item para os dois papeis que o veem, com
   conteudo diferente.** O botao `/informe` aparece igual, mas a pagina e
   adaptativa por papel: viewer (ADMIN) ou proprios (COMMERCIAL).
3. **Redirects silenciosos.** `/settings` -> `/profile` e `/resumo` -> `/informe`.
4. **O menu do avatar muda de conteudo por plataforma.** No DESKTOP (dropdown do
   topbar, no `AppShell`) traz sempre so "Meu perfil" + "Sair" — a gestao
   (Cadastros/Contratos/Embarques/Usuarios) fica na sidenav. No MOBILE (bottom sheet
   `HeaderAvatarMenu`) nao ha sidenav, entao o menu do avatar TAMBEM carrega o que
   la ficaria: "Contratos" (`/contratos`, ADMIN/COMMERCIAL), "Embarques"
   (`/embarques`, todos os nao-PROSPECTOR — split 2026-07-13), Cadastros
   (ADMIN/CADASTRO) e Usuarios (ADMIN). Por isso, no mobile, ate os papeis sem
   gestao (Classifier, Registration) tem 3 itens no avatar — Perfil + Embarques +
   Sair — contra 2 no desktop (Perfil + Sair); o Comercial tem 4 (+ Contratos).
   Desde 2026-07-02, no mobile Cadastros tambem esta no 4o slot da tabbar
   (ADMIN/CADASTRO), entao aparece em DOIS lugares (tabbar + menu do avatar).
5. **Dois nao-prospectores ficam sem Relatorios: CLASSIFIER e CADASTRO.** Dos
   cinco papeis de `NON_PROSPECTOR_ROLES`, CLASSIFIER (nunca teve) e CADASTRO
   (removido em 2026-06-28) estao fora de `INFORME_ROLES`. No mobile, ambos
   recebem Perfil como 5o item da tabbar, no lugar de Relatorios.
6. **CLASSIFIER e REGISTRATION tem a MESMA navegacao.** Ambos estao em
   `NON_PROSPECTOR_ROLES` e fora de `INFORME_ROLES` (sidenav 4 — com "Embarques" —,
   tabbar 5 com Perfil no 5o slot, avatar mobile 3). Ate 2026-07-10 o REGISTRATION
   acompanhava o COMMERCIAL, mas so pela moldura: caia num placeholder vazio em
   `/informe`.
7. **Split Clientes (operacao) x Cadastros (gestao) — 2026-07-02.** A capacidade de
   gerir clientes e a mesma para todos, mas o ponto de entrada muda por papel:
   COMMERCIAL/CLASSIFIER/REGISTRATION usam "Clientes" (`/clients`) direto na nav;
   ADMIN/CADASTRO acessam pela aba "Clientes" (default) do hub `/cadastros` (que
   ganhou 3 abas: Clientes | Bancos | Corretores; a aba Bancos saiu depois, na
   D141 — hoje sao 2). Implementacao: a lista de
   clientes virou o componente compartilhado `components/clients/ClientsBrowser.tsx`
   (mesma UI nas duas telas; snapshots isolados por `storageKey`). Guards de rota
   inalterados — `/clients` (`NON_PROSPECTOR_ROLES`) segue acessivel por URL a
   todos os nao-prospectores; `/cadastros` segue ADMIN+CADASTRO. Sem backend nem
   migration. So mudou a UI de navegacao (`AppShell.tsx`) e a composicao das duas
   paginas.
8. **`/embarques` e a unica pagina de "operacao de contrato" aberta aos papeis
   operacionais (CC F2 2026-07-12; pagina propria desde o split 2026-07-13).**
   CLASSIFIER, REGISTRATION e CADASTRO acessam **`/embarques`** — sub-abas Embarque
   e Aprovacoes (a gestao Contratos/Financeiro vive em `/contratos`,
   `CONTRATOS_ROLES`). A lista da Aprovacao nao e escopada por corretor (todos veem
   todos, so nao-sensivel); o "Ver contrato" abre o detalhe em `/contratos` a
   ADMIN + COMMERCIAL em qualquer contrato (escopo aberto, D140). E a unica
   superficie de nav que os tres ganharam alem da base (Inicio/Lotes/Clientes) —
   Cadastros so o CADASTRO.

## Manutencao

Documento de suporte (read-only). Referencia o codigo (`lib/roles.ts`,
`components/AppShell.tsx`, `app/**`) em vez de duplicar listas que mudam. Ao
alterar navegacao ou guards, revisar este mapeamento. Listado no indice
`docs/README.md`.
