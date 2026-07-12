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
ter **um item único "Contratos"** (top bar desktop + menu do avatar), gated **ADMIN +
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
item **"Embarques"** (`contractsHubTabs` / `contractsHubNavLabel` em `lib/roles.ts`).
O item aparece na **top bar desktop** e no **menu do avatar mobile** para os cinco
papéis. Resolve o débito anotado na nota F1 de 2026-07-09 (as seções por papel abaixo
descreviam o estado pré-CC F2). Sem mudança de guard no backend: a lista da Aprovação
é não-escopada (todos veem todos, só não-sensível); "Ver contrato" segue escopado (D110).

## Como ler este documento

A auditoria e feita **papel por papel**. Cada papel ganha uma secao em "Detalhe
por papel" descrevendo onde cada destino aparece (top bar / tabbar / menu do
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

| Superficie                  | Onde                                       | Plataforma | Componente                                         |
| --------------------------- | ------------------------------------------ | ---------- | -------------------------------------------------- |
| Top bar horizontal (branca) | topo (logo + nomes + perfil)               | Desktop    | `AppShell.tsx` `.topbar-nav` (`desktopNavItems`)   |
| Tabbar inferior             | rodape                                     | Mobile     | `components/MobileTabbar.tsx` (`MOBILE_NAV_ITEMS`) |
| Menu do avatar              | dropdown (desktop) / bottom sheet (mobile) | Ambos      | `AppShell.tsx` + `components/HeaderAvatarMenu.tsx` |

> **DSB-D6 (2026-07-12):** no desktop, a navegacao dos **5 papeis nao-PROSPECTOR**
> saiu da **sidebar vertical verde** (esquerda) e foi para uma **top bar horizontal
> branca** no topo: logo colorido a esquerda, **os itens so com NOME (sem icones)**
> centralizados, avatar de perfil a direita. O **botao "Sair" saiu da navegacao** —
> agora so pelo **menu do avatar** (dropdown do perfil). A **saudacao + nome** do
> dashboard desktop tambem foi removida. O **PROSPECTOR** mantem a **sidebar vertical**
> de antes (app restrito, so "Inicio" + "Sair"). Mobile inalterado (tabbar + hero).

Itens definidos em `AppShell.tsx`: `DESKTOP_NAV_ITEMS` (Inicio/Lotes/Clientes),
`INFORME_NAV_ITEM` (Relatorios), `CADASTROS_NAV_ITEM`, `CONTRATOS_NAV_ITEM`,
`ADMIN_NAV_ITEM` (Usuarios), `MOBILE_NAV_ITEMS` (inclui Camera). A filtragem por
papel da top bar (desktop) fica em `desktopNavItems` (`AppShell.tsx`), a da tabbar no
`<MobileTabbar items={...} />`, e a do menu do avatar no `HeaderAvatarMenu.tsx`.
Os icones (`renderNavIcon`) seguem so na tabbar mobile — a top bar desktop e so texto.

Split Clientes x Cadastros (2026-07-02): para **ADMIN e CADASTRO**, `desktopNavItems`
filtra o item "Clientes" fora da top bar (eles acessam clientes pela aba "Clientes"
do hub `/cadastros`); e no mobile o 4o slot fixo da tabbar (`/clients`) e trocado
por "Cadastros". Os demais nao-prospectores (COMMERCIAL/CLASSIFIER/REGISTRATION)
mantem "Clientes" na top bar e na tabbar e nao veem Cadastros.

## Referencia 3 — Universo de rotas

| Rota                                                                                          | Pagina                                                              | Guard de acesso                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`, `/forgot-password` (redirect → modal no `/login`), `/maintenance`, `/laudo/[token]` | publicas                                                            | sem auth                                                                                                                                              |
| `/dashboard`                                                                                  | Inicio                                                              | qualquer autenticado                                                                                                                                  |
| `/profile`                                                                                    | Perfil                                                              | qualquer autenticado                                                                                                                                  |
| `/settings`                                                                                   | —                                                                   | redireciona para `/profile`                                                                                                                           |
| `/offline`                                                                                    | offline PWA                                                         | qualquer autenticado                                                                                                                                  |
| `/samples`, `/samples/[id]`                                                                   | Lotes                                                               | `NON_PROSPECTOR_ROLES`                                                                                                                                |
| `/camera`                                                                                     | Camera                                                              | `NON_PROSPECTOR_ROLES`                                                                                                                                |
| `/clients`                                                                                    | Clientes (lista)                                                    | `NON_PROSPECTOR_ROLES`                                                                                                                                |
| `/clients/[id]`                                                                               | Detalhe do cliente                                                  | `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO)                                                                                                          |
| `/informe`                                                                                    | Relatorios                                                          | `INFORME_ROLES` (conteudo adaptativo por papel)                                                                                                       |
| `/resumo`                                                                                     | —                                                                   | redireciona para `/informe`                                                                                                                           |
| `/cadastros`                                                                                  | Cadastros                                                           | `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO)                                                                                                          |
| `/contratos`                                                                                  | Contratos (hub — sub-abas Contratos·Financeiro·Aprovações·Embarque) | `NON_PROSPECTOR_ROLES` (ADMIN/COMMERCIAL = 4 abas + nav "Contratos"; CLASSIFIER/REGISTRATION/CADASTRO = 2 abas Embarque·Aprovações + nav "Embarques") |
| `/financeiro`                                                                                 | → redirect para `/contratos?tab=financeiro`                         | (redirect server-side)                                                                                                                                |
| `/users`                                                                                      | Usuarios                                                            | ADMIN                                                                                                                                                 |

Middleware (`middleware.ts`): modo manutencao redireciona nao-ADMIN para
`/maintenance`; PROSPECTOR fora do seu app (`/dashboard`, `/profile`,
`/settings`, `/offline`) e redirecionado para `/dashboard`.

> **Nota (revisao DSH, 2026-07-07):** os endpoints do dashboard
> (`dashboard/pending`, `sales-availability`) exigem apenas autenticacao no
> backend (PROSPECTOR negado pela allowlist central) — **sem gate positivo de
> papel, por decisao** (DSH-D2): o dashboard e unico para os 5 papeis
> nao-PROSPECTOR, incluindo os dados comerciais do donut. O endpoint
> `commercial-timeseries` (card "Vendas e perdas") foi removido em 2026-07-07
> (DSH-D3).

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

| Rota               | ADMIN     | CLASSIFIER   | REGISTRATION | COMMERCIAL  | CADASTRO     | PROSPECTOR    |
| ------------------ | --------- | ------------ | ------------ | ----------- | ------------ | ------------- |
| `/dashboard`       | ✅        | ✅           | ✅           | ✅          | ✅           | ✅ (dedicado) |
| `/profile`         | ✅        | ✅           | ✅           | ✅          | ✅           | ✅            |
| `/samples` (+sub)  | ✅        | ✅           | ✅           | ✅          | ✅           | ❌            |
| `/camera`          | ✅        | ✅           | ✅           | ✅          | ✅           | ❌            |
| `/clients` (lista) | ✅        | ✅           | ✅           | ✅          | ✅           | ❌            |
| `/clients/[id]`    | ✅        | ❌           | ❌           | ❌          | ✅           | ❌            |
| `/informe`         | ✅ viewer | ❌           | ❌           | ✅ proprios | ❌           | ❌            |
| `/cadastros`       | ✅        | ❌           | ❌           | ❌          | ✅           | ❌            |
| `/contratos`       | ✅ 4 abas | ✅ Embarques | ✅ Embarques | ✅ 4 abas   | ✅ Embarques | ❌            |
| `/users`           | ✅        | ❌           | ❌           | ❌          | ❌           | ❌            |

`/informe` por papel: ADMIN = viewer (todos os informes + curadoria + cria, FAB);
COMMERCIAL = proprios (scope=mine + FAB); CLASSIFIER / REGISTRATION / CADASTRO /
PROSPECTOR = sem acesso. (`app/informe/page.tsx`.) O REGISTRATION saiu em
2026-07-10: tinha acesso a um placeholder vazio, e os dois gates do backend ja o
recusavam.

`/contratos` por papel (CC F2, 2026-07-12): o guard e `NON_PROSPECTOR_ROLES` — os
cinco papeis nao-PROSPECTOR ACESSAM o hub; o que muda e o CONTEUDO. ADMIN e
COMMERCIAL (`CONTRATOS_ROLES`) veem as **4 sub-abas** (Contratos · Financeiro ·
Aprovacoes · Embarque) e o item de nav se chama **"Contratos"**; CLASSIFIER,
REGISTRATION e CADASTRO veem so as **2 sub-abas de operacao** (Embarque ·
Aprovacoes) e o item se chama **"Embarques"** (`contractsHubTabs` /
`contractsHubNavLabel`, `lib/roles.ts`). A lista da Aprovacao nao e escopada por
corretor (todos veem todos, so nao-sensivel); "Ver contrato" segue escopado (D110).

**Acesso (guard) x visibilidade na nav (2026-07-02):** para a **lista** `/clients` o
guard segue `NON_PROSPECTOR_ROLES` (todos os 5 ✅ e a rota continua acessivel por
URL), mas o _item de nav_ "Clientes" nao aparece mais para ADMIN/CADASTRO — eles
chegam aos clientes pela aba "Clientes" do `/cadastros`. E `/cadastros` deixou de
ser so Bancos/Corretores: agora hospeda 3 abas (Clientes | Bancos | Corretores),
Clientes como default.

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
sem acesso de gestao (Cadastros/Contratos/Usuarios).

### Onde navega (por superficie)

| Destino    | Rota         | Desktop        | Mobile                    |
| ---------- | ------------ | -------------- | ------------------------- |
| Inicio     | `/dashboard` | Top bar        | Tabbar                    |
| Lotes      | `/samples`   | Top bar        | Tabbar                    |
| Clientes   | `/clients`   | Top bar        | Tabbar                    |
| Relatorios | `/informe`   | Top bar        | Tabbar                    |
| Contratos  | `/contratos` | Top bar        | Menu do avatar            |
| Camera     | `/camera`    | — (sem botao)  | Tabbar (destaque, centro) |
| Perfil     | `/profile`   | Menu do avatar | Menu do avatar            |
| Sair       | logout       | Menu do avatar | Menu do avatar            |

Contagem:

- **Top bar desktop: 5 itens** — Inicio, Lotes, Clientes, Relatorios, Contratos.
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Relatorios.
  (Contratos nao entra na tabbar; fica no menu do avatar.)
- **Menu do avatar:** desktop **2 itens** (Perfil, Sair) — Contratos esta na top bar;
  mobile **3 itens** (Perfil, Contratos, Sair) — sem top bar, o hub cai no avatar.

### Rotas acessiveis sem botao de navegacao

Alcancadas por fluxo interno ou URL direta (guard permite), mas sem item de menu
proprio:

- `/samples/[id]` — criar (modal do leque "+" em Lotes)/abrir lote. **Detalhe uniforme (LDT-D1, 2026-07-08):** os 5 papeis nao-PROSPECTOR veem e fazem exatamente o mesmo no detalhe (nenhuma granularidade por papel); PROSPECTOR e barrado nas 3 camadas (guard, middleware, e API 403 via allowlist — inclusive a leitura `getSampleDetail` e a foto `getSampleAttachmentDescriptor`, LDT-D4).
- `/camera` **no desktop** — a rota e liberada (`NON_PROSPECTOR_ROLES`), mas o
  unico botao de Camera esta na tabbar mobile; a top bar nao tem essa entrada.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/cadastros` (exige ADMIN/CADASTRO). **(`/contratos` NAO e bloqueado: o COMMERCIAL
  acessa o hub — top bar desktop + menu do avatar mobile. Estando em `CONTRATOS_ROLES`,
  ve as 4 sub-abas com o rotulo "Contratos".)**
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
| Inicio    | `/dashboard` | Top bar        | Tabbar                            |
| Lotes     | `/samples`   | Top bar        | Tabbar                            |
| Clientes  | `/clients`   | Top bar        | Tabbar                            |
| Embarques | `/contratos` | Top bar        | Menu do avatar                    |
| Camera    | `/camera`    | — (sem botao)  | Tabbar (destaque, centro)         |
| Perfil    | `/profile`   | Menu do avatar | Tabbar (5o slot) + menu do avatar |
| Sair      | logout       | Menu do avatar | Menu do avatar                    |

Contagem:

- **Top bar desktop: 4 itens** — Inicio, Lotes, Clientes, **Embarques**. (Sem
  Relatorios, como o CADASTRO e o REGISTRATION; o hub `/contratos` aparece como
  "Embarques" — 2 sub-abas Embarque · Aprovacoes, CC F2 2026-07-12.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Perfil. O 5o
  slot, que nos papeis de `INFORME_ROLES` e Relatorios, aqui e Perfil — para o
  Classifier ter 5 abas como os demais (2026-06-28). (Embarques nao entra na
  tabbar; fica no menu do avatar.)
- **Menu do avatar:** desktop **2 itens** (Perfil, Sair); mobile **3 itens**
  (Perfil, **Embarques**, Sair) — sem top bar, o hub cai no avatar. No mobile,
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

`/contratos` **nao** e bloqueado desde a CC F2 (2026-07-12): abre como "Embarques"
(2 sub-abas Embarque · Aprovacoes) — top bar desktop + menu do avatar mobile.

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

Duas diferencas: **Relatorios** e o **conteudo do hub de Contratos**. O Comercial
esta em `INFORME_ROLES` e ve Relatorios na top bar e na tabbar (+ feed proprio); o
Classifier nao ve em lugar nenhum e e redirecionado se tentar a URL. Ambos acessam
`/contratos`, mas o Comercial (em `CONTRATOS_ROLES`) ve as **4 sub-abas** com o
rotulo "Contratos", enquanto o Classifier ve so **2** (Embarque · Aprovacoes) com o
rotulo "Embarques". Para o Classifier ter 5 abas no mobile, o 5o slot da sua tabbar
e Perfil (no Comercial e Relatorios). Resultado: **top bar 4 vs 5 itens** (o
Comercial tem Relatorios a mais); tabbar 5 vs 5 (5o item: Perfil no Classifier,
Relatorios no Comercial); menu do avatar no mobile igual em contagem (3: Perfil,
hub, Sair — "Embarques" no Classifier, "Contratos" no Comercial), desktop 2 nos dois.

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
| Inicio    | `/dashboard` | Top bar                       | Tabbar                    |
| Lotes     | `/samples`   | Top bar                       | Tabbar                    |
| Clientes  | `/clients`   | Top bar                       | Tabbar                    |
| Embarques | `/contratos` | Top bar                       | Menu do avatar            |
| Camera    | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro) |
| Perfil    | `/profile`   | Menu do avatar ("Meu perfil") | Tabbar + menu do avatar   |
| Sair      | logout       | Menu do avatar                | Menu do avatar            |

Contagem:

- **Top bar desktop: 4 itens** — Inicio, Lotes, Clientes, **Embarques** (hub
  `/contratos` como "Embarques", 2 sub-abas — mesmo arranjo do Classifier).
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

`/contratos` **nao** e bloqueado desde a CC F2 (2026-07-12): abre como "Embarques"
(2 sub-abas) — igual ao Classifier.

### Particularidades de conteudo

- **Sem pagina ou secao exclusiva**: apesar do nome "Impressao", nao ha UI
  restrita ao REGISTRATION. A impressao de etiquetas acontece no fluxo de
  `/samples` (registro -> `REGISTRATION_CONFIRMED` -> classificacao/etiqueta),
  disponivel a todos os nao-prospectores. (`REGISTRATION_CONFIRMED` e um status
  de amostra, nao o papel.)
- **`/dashboard`**: dashboard padrao (com `salesData`), igual aos demais
  nao-prospectores.

### Diferenca para o COMMERCIAL

O Comercial esta em `INFORME_ROLES` e ve Relatorios na top bar e na tabbar (feed
dos PROPRIOS informes, `scope=mine`, + FAB de criacao); o REGISTRATION nao ve em
lugar nenhum desde 2026-07-10 e e redirecionado se tentar a URL. Ambos acessam
`/contratos`, mas o Comercial ve as **4 sub-abas** ("Contratos") e o REGISTRATION so
**2** ("Embarques"). Top bar **5 vs 4** itens (o Comercial tem Relatorios a mais);
tabbar 5 vs 5 (5o item: Relatorios no Comercial, Perfil no REGISTRATION); menu do
avatar no mobile 3 nos dois (o hub muda de rotulo). (Fora da navegacao: o Comercial
pode ser responsavel comercial de cliente via `isCommercialRole`; o REGISTRATION nao.)

## CADASTRO — "Cadastro"

Papel de cadastro / back-office. Acessa amostras e camera (como os demais
nao-prospectores) e tem o hub **Cadastros** — que desde 2026-07-02 concentra 3
abas: **Clientes** (default, gestao de clientes/armazens), **Bancos** e
**Corretores**. Por isso o item "Clientes" avulso saiu da nav do CADASTRO: ele
acessa os clientes pela aba Clientes do `/cadastros` (a rota `/clients` continua
liberada por URL). **Nao** acessa Relatorios nem Contratos (removidos em 2026-06-28;
hoje so o ADMIN) nem `/users` (exclusivo do ADMIN).

### Onde navega (por superficie)

| Destino   | Rota         | Desktop                       | Mobile                            |
| --------- | ------------ | ----------------------------- | --------------------------------- |
| Inicio    | `/dashboard` | Top bar                       | Tabbar                            |
| Lotes     | `/samples`   | Top bar                       | Tabbar                            |
| Camera    | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro)         |
| Cadastros | `/cadastros` | Top bar                       | Tabbar (4o slot) + menu do avatar |
| Embarques | `/contratos` | Top bar                       | Menu do avatar                    |
| Perfil    | `/profile`   | Menu do avatar ("Meu perfil") | Tabbar (5o slot) + menu do avatar |
| Sair      | logout       | Menu do avatar                | Menu do avatar                    |

Clientes (`/clients`) nao e mais item de nav proprio — e a **aba default do
`/cadastros`** (e segue acessivel por URL). Ver "Particularidades de conteudo".

Contagem:

- **Top bar desktop: 4 itens** — Inicio, Lotes, Cadastros, **Embarques**. (Perdeu
  Clientes em 2026-07-02 e a GESTAO de Contratos em 2026-06-28; a CC F2 de 2026-07-12
  reabriu `/contratos` como "Embarques" — 2 sub-abas Embarque · Aprovacoes.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, **Cadastros**, Perfil. O 4o
  slot fixo (que era Clientes) vira Cadastros para o CADASTRO (2026-07-02); o 5o
  slot e Perfil (fora de `INFORME_ROLES`, mesma logica do Classifier). (Embarques
  nao entra na tabbar; fica no menu do avatar.)
- **Menu do avatar:** assimetrico por plataforma. No **desktop** sao 2 itens (Meu
  perfil, Sair) — Cadastros e Embarques estao na top bar. No **mobile** sao 4 itens
  (Perfil, Cadastros, **Embarques**, Sair) — `HeaderAvatarMenu` carrega o hub de
  Contratos p/ todo nao-PROSPECTOR; Cadastros aparece TANTO no 4o slot da tabbar
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

`/contratos` foi bloqueado ao CADASTRO em 2026-06-28 (saiu da GESTAO de contratos),
mas a **CC F2 (2026-07-12) reabriu o hub** como "Embarques" (2 sub-abas Embarque ·
Aprovacoes) — top bar desktop + menu do avatar mobile. So a GESTAO (aba Contratos +
Financeiro) segue fora do CADASTRO.

### Particularidades de conteudo

- **`/cadastros`**: hub com **3 abas** (2026-07-02) — **Clientes** (default; reusa
  o `<ClientsBrowser>`, a mesma experiencia da pagina /clients: busca, filtro,
  scroll infinito, detalhe, criar), **Bancos** e **Corretores** (gestao do
  Fechamento Fase 0). O FAB "+" e contextual a aba (cria cliente/banco/corretor).
  E a unica pagina de "gestao" que sobra para o CADASTRO, e agora tambem o ponto
  de acesso a clientes. (`app/cadastros/page.tsx`.)
- **`/dashboard`**: dashboard padrao (com `salesData`), igual aos demais
  nao-prospectores.
- **Removido em 2026-06-28**: o CADASTRO era viewer + curador de Relatorios
  (`/informe`) e gestor de Contratos (`/contratos`); o acesso foi retirado em
  todas as camadas (nav, guards e autorizacao de API). _(A GESTAO de Contratos
  segue fora; mas a **CC F2 de 2026-07-12** reabriu o hub `/contratos` ao CADASTRO
  na forma operacional "Embarques" — Embarque + Aprovacoes, sem as abas de gestao.)_
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
Cadastros) e tem o hub Cadastros no lugar de Relatorios. Ambos acessam `/contratos`,
mas o Comercial (em `CONTRATOS_ROLES`) ve as **4 sub-abas** ("Contratos") e o CADASTRO
so **2** ("Embarques"). **Top bar 4 (CADASTRO: Inicio/Lotes/Cadastros/Embarques) vs 5
(Comercial: Inicio/Lotes/Clientes/Relatorios/Contratos)**; tabbar 5 vs 5 mas com 4o e
5o slots diferentes (CADASTRO: Cadastros/Perfil; Comercial: Clientes/Relatorios);
menu do avatar no mobile 4 vs 3 (CADASTRO tem Cadastros a mais — que no mobile tambem
esta na tabbar; os dois carregam o hub de Contratos).

## ADMIN — "Administracao"

Acesso total — superconjunto de todos os papeis. Unico que ve **Usuarios**
(`/users`) e o unico viewer + curador + **criador** em Relatorios. Nenhuma rota
bloqueada.

### Onde navega (por superficie)

| Destino    | Rota         | Desktop                       | Mobile                            |
| ---------- | ------------ | ----------------------------- | --------------------------------- |
| Inicio     | `/dashboard` | Top bar                       | Tabbar                            |
| Lotes      | `/samples`   | Top bar                       | Tabbar                            |
| Relatorios | `/informe`   | Top bar                       | Tabbar                            |
| Camera     | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro)         |
| Cadastros  | `/cadastros` | Top bar                       | Tabbar (4o slot) + menu do avatar |
| Contratos  | `/contratos` | Top bar                       | Menu do avatar                    |
| Usuarios   | `/users`     | Top bar                       | Menu do avatar                    |
| Perfil     | `/profile`   | Menu do avatar ("Meu perfil") | Menu do avatar                    |
| Sair       | logout       | Menu do avatar                | Menu do avatar                    |

Clientes (`/clients`) nao e mais item de nav proprio do ADMIN — e a **aba default
do `/cadastros`** (e segue acessivel por URL). Ver "Particularidades de conteudo".

Contagem:

- **Top bar desktop: 6 itens** — Inicio, Lotes, Relatorios, Cadastros, Contratos,
  Usuarios. (Perdeu Clientes avulso em 2026-07-02; segue a top bar mais cheia.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, **Cadastros**, Relatorios. O
  4o slot fixo (que era Clientes) vira Cadastros para o ADMIN (2026-07-02);
  Contratos/Usuarios continuam so no menu do avatar.
- **Menu do avatar:** assimetrico. No **desktop** sao 2 itens (Meu perfil, Sair) —
  a gestao esta na top bar. No **mobile** sao 5 itens (Perfil, Usuarios,
  Cadastros, Contratos, Sair) — sem top bar, o menu carrega toda a gestao;
  `HeaderAvatarMenu` nao mudou, entao Cadastros aparece TANTO no 4o slot da tabbar
  QUANTO no menu do avatar (redundancia introduzida em 2026-07-02).

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
- **`/cadastros`**: hub com 3 abas (2026-07-02) — Clientes (default; gestao de
  clientes/armazens, mesma experiencia da pagina /clients via `<ClientsBrowser>`),
  Bancos e Corretores. **`/contratos`**: gestao dos contratos de venda (Fechamento).
- **Modo manutencao**: o middleware redireciona **nao-ADMIN** para
  `/maintenance` — so o ADMIN usa o app durante a manutencao. (`middleware.ts`.)
- **`/dashboard`**: dashboard padrao (com `salesData`).

### Diferenca para o CADASTRO

ADMIN = CADASTRO **+ Relatorios + Usuarios**, e no hub `/contratos` ve as **4
sub-abas** (Contratos · Financeiro · Aprovacoes · Embarque) enquanto o CADASTRO ve so
as **2 de operacao** (Embarque · Aprovacoes, item "Embarques"). No Relatorios, alem
de ver/curar, o ADMIN tambem **cria**. Ambos perderam "Clientes" avulso e acessam
clientes pela aba Clientes do Cadastros. **Top bar 6 vs 4**; tabbar 5 vs 5 — 4o slot
igual (Cadastros nos dois), 5o slot diferente (ADMIN Relatorios, CADASTRO Perfil);
menu do avatar no mobile 5 vs 4.

---

## Notas factuais (estado atual)

Observacoes neutras do mapeamento, sem juizo de "certo/errado":

1. **Camera so tem botao no mobile.** A rota `/camera` e acessivel a todos os
   `NON_PROSPECTOR_ROLES`, mas a unica entrada de navegacao esta na tabbar; a
   top bar desktop nao lista Camera. No desktop, esses papeis nao alcancam a
   camera pela navegacao.
2. **"Relatorios" rotula o mesmo item para os dois papeis que o veem, com
   conteudo diferente.** O botao `/informe` aparece igual, mas a pagina e
   adaptativa por papel: viewer (ADMIN) ou proprios (COMMERCIAL).
3. **Redirects silenciosos.** `/settings` -> `/profile` e `/resumo` -> `/informe`.
4. **O menu do avatar muda de conteudo por plataforma.** No DESKTOP (dropdown do
   topbar, no `AppShell`) traz sempre so "Meu perfil" + "Sair" — a gestao
   (Cadastros/Contratos/Usuarios) fica na TOP BAR. No MOBILE (bottom sheet
   `HeaderAvatarMenu`) nao ha top bar, entao o menu do avatar TAMBEM carrega o que
   la ficaria: o hub de Contratos (todos os nao-PROSPECTOR — "Contratos" p/
   ADMIN/COMMERCIAL, "Embarques" p/ CLASSIFIER/REGISTRATION/CADASTRO, CC F2
   2026-07-12), Cadastros (ADMIN/CADASTRO) e Usuarios (ADMIN). Por isso, no mobile,
   ate os papeis sem gestao (Comercial, Classifier, Registration) tem 3 itens no
   avatar — Perfil + hub + Sair — contra 2 no desktop (Perfil + Sair). Desde
   2026-07-02, no mobile Cadastros tambem esta no 4o slot da tabbar (ADMIN/CADASTRO),
   entao aparece em DOIS lugares (tabbar + menu do avatar) — `HeaderAvatarMenu` nao
   foi alterado no split.
5. **Dois nao-prospectores ficam sem Relatorios: CLASSIFIER e CADASTRO.** Dos
   cinco papeis de `NON_PROSPECTOR_ROLES`, CLASSIFIER (nunca teve) e CADASTRO
   (removido em 2026-06-28) estao fora de `INFORME_ROLES`. No mobile, ambos
   recebem Perfil como 5o item da tabbar, no lugar de Relatorios.
6. **CLASSIFIER e REGISTRATION tem a MESMA navegacao.** Ambos estao em
   `NON_PROSPECTOR_ROLES` e fora de `INFORME_ROLES` (top bar 4 — com "Embarques" —,
   tabbar 5 com Perfil no 5o slot, avatar mobile 3). Ate 2026-07-10 o REGISTRATION
   acompanhava o COMMERCIAL, mas so pela moldura: caia num placeholder vazio em
   `/informe`.
7. **Split Clientes (operacao) x Cadastros (gestao) — 2026-07-02.** A capacidade de
   gerir clientes e a mesma para todos, mas o ponto de entrada muda por papel:
   COMMERCIAL/CLASSIFIER/REGISTRATION usam "Clientes" (`/clients`) direto na nav;
   ADMIN/CADASTRO acessam pela aba "Clientes" (default) do hub `/cadastros` (que
   ganhou 3 abas: Clientes | Bancos | Corretores). Implementacao: a lista de
   clientes virou o componente compartilhado `components/clients/ClientsBrowser.tsx`
   (mesma UI nas duas telas; snapshots isolados por `storageKey`). Guards de rota
   inalterados — `/clients` (`NON_PROSPECTOR_ROLES`) segue acessivel por URL a
   todos os nao-prospectores; `/cadastros` segue ADMIN+CADASTRO. Sem backend nem
   migration. So mudou a UI de navegacao (`AppShell.tsx`) e a composicao das duas
   paginas.
8. **O hub `/contratos` e a unica pagina de "operacao de contrato" aberta aos
   papeis operacionais (CC F2, 2026-07-12).** CLASSIFIER, REGISTRATION e CADASTRO
   acessam `/contratos` como **"Embarques"** — so as sub-abas Embarque e Aprovacoes
   (sem Contratos/Financeiro, que sao gestao — `contractsHubTabs`). A lista da
   Aprovacao nao e escopada por corretor (todos veem todos, so nao-sensivel); o "Ver
   contrato" segue escopado (D110). E a unica superficie de nav que os tres ganharam
   alem da base (Inicio/Lotes/Clientes) — Cadastros so o CADASTRO.

## Manutencao

Documento de suporte (read-only). Referencia o codigo (`lib/roles.ts`,
`components/AppShell.tsx`, `app/**`) em vez de duplicar listas que mudam. Ao
alterar navegacao ou guards, revisar este mapeamento. Listado no indice
`docs/README.md`.
