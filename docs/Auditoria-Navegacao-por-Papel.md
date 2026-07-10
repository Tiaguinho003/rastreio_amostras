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
ter **um item único "Contratos"** (sidebar + menu do avatar), gated **ADMIN +
COMMERCIAL** (`CONTRATOS_ROLES`) — o COMMERCIAL passa a ver "Contratos" também no
**menu do avatar** mobile (corrige o antigo gate `isAdmin`). A tabela de rotas e a
matriz abaixo já refletem isso; as **seções por papel** (contagens de itens) ainda
descrevem o estado pré-D110/Financeiro e serão reconciliadas num passe próprio —
para Contratos/Financeiro, vale esta nota.
Atualizado: 2026-07-09 — **detalhe do cliente restrito**: `/clients/[id]` saiu de
`NON_PROSPECTOR_ROLES` e passou a `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO).
CLASSIFIER/COMMERCIAL/REGISTRATION ficam com a lista `/clients` + o modal de
consulta do card; o botão "Gerenciar cliente" some para eles. O card "Cadastros
pendentes" do dashboard virou ADMIN+CADASTRO e passou a levar a
`/cadastros?incomplete=true`. Ver a nota abaixo da matriz.

## Como ler este documento

A auditoria e feita **papel por papel**. Cada papel ganha uma secao em "Detalhe
por papel" descrevendo onde cada destino aparece (sidebar / tabbar / menu do
avatar) no desktop e no mobile, alem das rotas acessiveis sem botao de navegacao
e das rotas bloqueadas.

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
  `/clients/[id]`, mais o botao "Gerenciar cliente" e o card "Cadastros pendentes"
  do dashboard. Sem equivalente no backend (ver a nota da matriz).
- `INFORME_ROLES` = ADMIN, COMMERCIAL, REGISTRATION — guard da pagina
  "Relatorios" (`/informe`). CADASTRO saiu em 2026-06-28.
- `isAdmin(role)` = somente ADMIN.
- `isCommercialRole(role)` = COMMERCIAL ou PROSPECTOR (quem pode ser responsavel
  comercial de cliente; nao confundir com acesso de navegacao).
- `isProspector(role)` = somente PROSPECTOR (app restrito).
- `isVisitReportViewer(role)` / `isVisitLinkCurator(role)` = ADMIN (visao de
  supervisao e curadoria em `/informe`; CADASTRO saiu em 2026-06-28).

## Referencia 2 — Superficies de navegacao

Centralizadas em `components/AppShell.tsx`. Breakpoint: **900px** (`<= 900` =
mobile, `>= 901` = desktop).

| Superficie               | Onde                                       | Plataforma | Componente                                         |
| ------------------------ | ------------------------------------------ | ---------- | -------------------------------------------------- |
| Sidebar vertical (verde) | lateral esquerda                           | Desktop    | `AppShell.tsx` (`desktopNavItems`)                 |
| Tabbar inferior          | rodape                                     | Mobile     | `components/MobileTabbar.tsx` (`MOBILE_NAV_ITEMS`) |
| Menu do avatar           | dropdown (desktop) / bottom sheet (mobile) | Ambos      | `AppShell.tsx` + `components/HeaderAvatarMenu.tsx` |

Itens definidos em `AppShell.tsx`: `DESKTOP_NAV_ITEMS` (Inicio/Lotes/Clientes),
`INFORME_NAV_ITEM` (Relatorios), `CADASTROS_NAV_ITEM`, `CONTRATOS_NAV_ITEM`,
`ADMIN_NAV_ITEM` (Usuarios), `MOBILE_NAV_ITEMS` (inclui Camera). A filtragem por
papel da sidebar fica em `desktopNavItems` (`AppShell.tsx`), a da tabbar no
`<MobileTabbar items={...} />`, e a do menu do avatar no `HeaderAvatarMenu.tsx`.

Split Clientes x Cadastros (2026-07-02): para **ADMIN e CADASTRO**, `desktopNavItems`
filtra o item "Clientes" fora da sidebar (eles acessam clientes pela aba "Clientes"
do hub `/cadastros`); e no mobile o 4o slot fixo da tabbar (`/clients`) e trocado
por "Cadastros". Os demais nao-prospectores (COMMERCIAL/CLASSIFIER/REGISTRATION)
mantem "Clientes" na sidebar e na tabbar e nao veem Cadastros.

## Referencia 3 — Universo de rotas

| Rota                                                                                          | Pagina                                                              | Guard de acesso                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| `/login`, `/forgot-password` (redirect → modal no `/login`), `/maintenance`, `/laudo/[token]` | publicas                                                            | sem auth                                        |
| `/dashboard`                                                                                  | Inicio                                                              | qualquer autenticado                            |
| `/profile`                                                                                    | Perfil                                                              | qualquer autenticado                            |
| `/settings`                                                                                   | —                                                                   | redireciona para `/profile`                     |
| `/offline`                                                                                    | offline PWA                                                         | qualquer autenticado                            |
| `/samples`, `/samples/[id]`                                                                   | Lotes                                                               | `NON_PROSPECTOR_ROLES`                          |
| `/camera`                                                                                     | Camera                                                              | `NON_PROSPECTOR_ROLES`                          |
| `/clients`                                                                                    | Clientes (lista)                                                    | `NON_PROSPECTOR_ROLES`                          |
| `/clients/[id]`                                                                               | Detalhe do cliente                                                  | `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO)    |
| `/informe`                                                                                    | Relatorios                                                          | `INFORME_ROLES` (conteudo adaptativo por papel) |
| `/resumo`                                                                                     | —                                                                   | redireciona para `/informe`                     |
| `/cadastros`                                                                                  | Cadastros                                                           | `CLIENT_MANAGEMENT_ROLES` (ADMIN + CADASTRO)    |
| `/contratos`                                                                                  | Contratos (hub — sub-abas Contratos·Financeiro·Aprovações·Embarque) | ADMIN + COMMERCIAL                              |
| `/financeiro`                                                                                 | → redirect para `/contratos?tab=financeiro`                         | (redirect server-side)                          |
| `/users`                                                                                      | Usuarios                                                            | ADMIN                                           |

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
| `/informe`         | ✅ viewer | ❌         | ✅ vazio     | ✅ proprios | ❌       | ❌            |
| `/cadastros`       | ✅        | ❌         | ❌           | ❌          | ✅       | ❌            |
| `/contratos`       | ✅        | ❌         | ❌           | ✅          | ❌       | ❌            |
| `/users`           | ✅        | ❌         | ❌           | ❌          | ❌       | ❌            |

`/informe` por papel: ADMIN = viewer (todos os informes + curadoria + cria, FAB);
COMMERCIAL = proprios (scope=mine + FAB); REGISTRATION = placeholder vazio;
CLASSIFIER / CADASTRO / PROSPECTOR = sem acesso. (`app/informe/page.tsx`.)

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

Consequencias: o card **"Cadastros pendentes"** do dashboard passou a aparecer so
pra ADMIN + CADASTRO (pros demais listava incompletos sem dar como corrigir) e
leva a `/cadastros?incomplete=true` em vez de `/clients?incomplete=true`. O FAB de
**criar** cliente continua pra todos: criar e operacao, completar o cadastro e
gestao. O selo/filtro de "cadastro incompleto" na lista tambem continua pra todos.

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
| Inicio     | `/dashboard` | Sidebar        | Tabbar                    |
| Lotes      | `/samples`   | Sidebar        | Tabbar                    |
| Clientes   | `/clients`   | Sidebar        | Tabbar                    |
| Relatorios | `/informe`   | Sidebar        | Tabbar                    |
| Camera     | `/camera`    | — (sem botao)  | Tabbar (destaque, centro) |
| Perfil     | `/profile`   | Menu do avatar | Menu do avatar            |
| Sair       | logout       | Menu do avatar | Menu do avatar            |

Contagem:

- **Sidebar desktop: 4 itens** — Inicio, Lotes, Clientes, Relatorios.
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Relatorios.
- **Menu do avatar: 2 itens** — Perfil, Sair (igual no desktop e no mobile).

### Rotas acessiveis sem botao de navegacao

Alcancadas por fluxo interno ou URL direta (guard permite), mas sem item de menu
proprio:

- `/samples/[id]` — criar (modal do leque "+" em Lotes)/abrir lote. **Detalhe uniforme (LDT-D1, 2026-07-08):** os 5 papeis nao-PROSPECTOR veem e fazem exatamente o mesmo no detalhe (nenhuma granularidade por papel); PROSPECTOR e barrado nas 3 camadas (guard, middleware, e API 403 via allowlist — inclusive a leitura `getSampleDetail` e a foto `getSampleAttachmentDescriptor`, LDT-D4).
- `/camera` **no desktop** — a rota e liberada (`NON_PROSPECTOR_ROLES`), mas o
  unico botao de Camera esta na tabbar mobile; a sidebar nao tem essa entrada.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/cadastros` (exige ADMIN/CADASTRO). **(2026-07-09: `/contratos` saiu daqui — o
  COMMERCIAL acessa o hub de Contratos via `CONTRATOS_ROLES`, sidebar + menu do
  avatar.)**
- `/users` (exige ADMIN).

### Particularidades de conteudo

- **`/informe` (Relatorios)**: para o Comercial renderiza `InformeCommercialPage`
  — feed dos PROPRIOS informes (`scope=mine`) + FAB de criacao. (Nao e a visao de
  supervisao dos viewers ADMIN/CADASTRO.) O antigo `/resumo` redireciona para ca;
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

| Destino  | Rota         | Desktop        | Mobile                            |
| -------- | ------------ | -------------- | --------------------------------- |
| Inicio   | `/dashboard` | Sidebar        | Tabbar                            |
| Lotes    | `/samples`   | Sidebar        | Tabbar                            |
| Clientes | `/clients`   | Sidebar        | Tabbar                            |
| Camera   | `/camera`    | — (sem botao)  | Tabbar (destaque, centro)         |
| Perfil   | `/profile`   | Menu do avatar | Tabbar (5o slot) + menu do avatar |
| Sair     | logout       | Menu do avatar | Menu do avatar                    |

Contagem:

- **Sidebar desktop: 3 itens** — Inicio, Lotes, Clientes. (Sem Relatorios — e o
  unico nao-prospector que nao o ve.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Perfil. O 5o
  slot, que nos papeis de `INFORME_ROLES` e Relatorios, aqui e Perfil — para o
  Classifier ter 5 abas como os demais (2026-06-28).
- **Menu do avatar: 2 itens** — Perfil, Sair (igual no desktop e no mobile). No
  mobile, Perfil tambem aparece na tabbar.

### Rotas acessiveis sem botao de navegacao

- `/samples/[id]` — criar (modal do leque "+" em Lotes)/abrir lote. E onde
  o classificador faz a classificacao da amostra.
- `/camera` **no desktop** — rota liberada (`NON_PROSPECTOR_ROLES`), mas o botao
  de Camera so existe na tabbar mobile.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/informe` (Relatorios) — CLASSIFIER esta fora de `INFORME_ROLES`.
- `/cadastros`, `/contratos` (exigem ADMIN/CADASTRO).
- `/users` (exige ADMIN).

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

Identico ao Comercial, **menos Relatorios** (`/informe`): o Comercial esta em
`INFORME_ROLES` e ve Relatorios na sidebar e na tabbar (+ feed proprio); o
Classifier nao ve em lugar nenhum e e redirecionado se tentar a URL. Para o
Classifier ter 5 abas no mobile, o 5o slot da sua tabbar e Perfil (no Comercial
e Relatorios). Resultado: sidebar 3 vs 4 itens; tabbar 5 vs 5 (5o item: Perfil
no Classifier, Relatorios no Comercial); menu do avatar igual (Perfil, Sair).

## REGISTRATION — "Impressao"

Papel ligado a impressao/registro. **Na pratica existe para o agente de
impressao** (envio dos dados de etiqueta) — nao e um papel de uso humano no app,
o que explica a ausencia de UI propria. A navegacao e **identica a do Comercial**
(esta em `NON_PROSPECTOR_ROLES` e em `INFORME_ROLES`); a unica diferenca real e o
**conteudo** de Relatorios, onde cai no placeholder vazio. Decisao 2026-06-28:
mantido como esta por enquanto (mudancas futuras planejadas).

### Onde navega (por superficie)

| Destino    | Rota         | Desktop                       | Mobile                    |
| ---------- | ------------ | ----------------------------- | ------------------------- |
| Inicio     | `/dashboard` | Sidebar                       | Tabbar                    |
| Lotes      | `/samples`   | Sidebar                       | Tabbar                    |
| Clientes   | `/clients`   | Sidebar                       | Tabbar                    |
| Relatorios | `/informe`   | Sidebar                       | Tabbar                    |
| Camera     | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro) |
| Perfil     | `/profile`   | Menu do avatar ("Meu perfil") | Menu do avatar            |
| Sair       | logout       | Menu do avatar                | Menu do avatar            |

Contagem:

- **Sidebar desktop: 4 itens** — Inicio, Lotes, Clientes, Relatorios.
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Relatorios.
- **Menu do avatar: 2 itens** — Perfil, Sair (igual no desktop e no mobile).

### Rotas acessiveis sem botao de navegacao

- `/samples/[id]` — a partir de Lotes (criação de lote = modal do leque "+").
- `/camera` **no desktop** — rota liberada, botao so na tabbar mobile.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/cadastros`, `/contratos` (ADMIN/CADASTRO) e `/users` (ADMIN).

### Particularidades de conteudo

- **`/informe` (Relatorios)**: placeholder vazio ("Nenhum formulario
  disponivel"). O REGISTRATION nao e viewer (so ADMIN) nem autor (so COMMERCIAL),
  entao o botao Relatorios aparece mas a pagina nao traz feed nem FAB.
  (`app/informe/page.tsx`.)
- **Sem pagina ou secao exclusiva**: apesar do nome "Impressao", nao ha UI
  restrita ao REGISTRATION. A impressao de etiquetas acontece no fluxo de
  `/samples` (registro -> `REGISTRATION_CONFIRMED` -> classificacao/etiqueta),
  disponivel a todos os nao-prospectores. (`REGISTRATION_CONFIRMED` e um status
  de amostra, nao o papel.)
- **`/dashboard`**: dashboard padrao (com `salesData`), igual aos demais
  nao-prospectores.

### Diferenca para o COMMERCIAL

Navegacao exatamente igual (sidebar 4, tabbar 5, avatar 2). A unica diferenca e o
conteudo de Relatorios: o Comercial ve os PROPRIOS informes (`scope=mine`) + FAB
de criacao; o REGISTRATION ve o placeholder vazio. (Fora da navegacao: o Comercial
pode ser responsavel comercial de cliente via `isCommercialRole`; o REGISTRATION
nao.)

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
| Inicio    | `/dashboard` | Sidebar                       | Tabbar                            |
| Lotes     | `/samples`   | Sidebar                       | Tabbar                            |
| Camera    | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro)         |
| Cadastros | `/cadastros` | Sidebar                       | Tabbar (4o slot) + menu do avatar |
| Perfil    | `/profile`   | Menu do avatar ("Meu perfil") | Tabbar (5o slot) + menu do avatar |
| Sair      | logout       | Menu do avatar                | Menu do avatar                    |

Clientes (`/clients`) nao e mais item de nav proprio — e a **aba default do
`/cadastros`** (e segue acessivel por URL). Ver "Particularidades de conteudo".

Contagem:

- **Sidebar desktop: 3 itens** — Inicio, Lotes, Cadastros. (Perdeu Clientes em
  2026-07-02; ja tinha perdido Relatorios e Contratos em 2026-06-28.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, **Cadastros**, Perfil. O 4o
  slot fixo (que era Clientes) vira Cadastros para o CADASTRO (2026-07-02); o 5o
  slot e Perfil (fora de `INFORME_ROLES`, mesma logica do Classifier).
- **Menu do avatar:** assimetrico por plataforma. No **desktop** sao 2 itens (Meu
  perfil, Sair) — Cadastros esta na sidebar. No **mobile** sao 3 itens (Perfil,
  Cadastros, Sair) — `HeaderAvatarMenu` nao mudou, entao Cadastros aparece TANTO no
  4o slot da tabbar QUANTO no menu do avatar (redundancia introduzida em 2026-07-02).

### Rotas acessiveis sem botao de navegacao

- `/clients` — a lista de clientes, agora alcancada pela **aba Clientes do
  `/cadastros`** (ou por URL direta; guard `NON_PROSPECTOR_ROLES` inalterado).
- `/samples/[id]` — a partir de Lotes (criação de lote = modal do leque "+").
- `/clients/[id]` — detalhe do cliente, pelo "Gerenciar cliente" do modal do card
  (aba Clientes do `/cadastros`). Restrito a ADMIN + CADASTRO.
- `/camera` **no desktop** — rota liberada, botao so na tabbar mobile (igual aos
  demais nao-prospectores).

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/informe` (Relatorios) e `/contratos` — removidos do CADASTRO em 2026-06-28
  (so ADMIN). CADASTRO saiu de `INFORME_ROLES` e de `SALE_CONTRACT_MANAGE_ROLES`.
- `/users` — exclusivo do ADMIN.

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
  todas as camadas (nav, guards e autorizacao de API). As 2 notificacoes push de
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
Cadastros) e tem o hub Cadastros no lugar de Relatorios. **Sidebar 3 (CADASTRO:
Inicio/Lotes/Cadastros) vs 4 (Comercial: Inicio/Lotes/Clientes/Relatorios)**;
tabbar 5 vs 5 mas com 4o e 5o slots diferentes (CADASTRO: Cadastros/Perfil;
Comercial: Clientes/Relatorios); menu do avatar no mobile 3 vs 2 (CADASTRO tem
Cadastros a mais — que no mobile tambem esta na tabbar).

## ADMIN — "Administracao"

Acesso total — superconjunto de todos os papeis. Unico que ve **Usuarios**
(`/users`) e o unico viewer + curador + **criador** em Relatorios. Nenhuma rota
bloqueada.

### Onde navega (por superficie)

| Destino    | Rota         | Desktop                       | Mobile                            |
| ---------- | ------------ | ----------------------------- | --------------------------------- |
| Inicio     | `/dashboard` | Sidebar                       | Tabbar                            |
| Lotes      | `/samples`   | Sidebar                       | Tabbar                            |
| Relatorios | `/informe`   | Sidebar                       | Tabbar                            |
| Camera     | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro)         |
| Cadastros  | `/cadastros` | Sidebar                       | Tabbar (4o slot) + menu do avatar |
| Contratos  | `/contratos` | Sidebar                       | Menu do avatar                    |
| Usuarios   | `/users`     | Sidebar                       | Menu do avatar                    |
| Perfil     | `/profile`   | Menu do avatar ("Meu perfil") | Menu do avatar                    |
| Sair       | logout       | Menu do avatar                | Menu do avatar                    |

Clientes (`/clients`) nao e mais item de nav proprio do ADMIN — e a **aba default
do `/cadastros`** (e segue acessivel por URL). Ver "Particularidades de conteudo".

Contagem:

- **Sidebar desktop: 6 itens** — Inicio, Lotes, Relatorios, Cadastros, Contratos,
  Usuarios. (Perdeu Clientes avulso em 2026-07-02; segue a sidebar mais cheia.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, **Cadastros**, Relatorios. O
  4o slot fixo (que era Clientes) vira Cadastros para o ADMIN (2026-07-02);
  Contratos/Usuarios continuam so no menu do avatar.
- **Menu do avatar:** assimetrico. No **desktop** sao 2 itens (Meu perfil, Sair) —
  a gestao esta na sidebar. No **mobile** sao 5 itens (Perfil, Usuarios,
  Cadastros, Contratos, Sair) — sem sidebar, o menu carrega toda a gestao;
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

ADMIN = CADASTRO **+ Relatorios + Contratos + Usuarios** (e, no Relatorios, alem
de ver/curar, tambem **cria**). Ambos perderam "Clientes" avulso e acessam clientes
pela aba Clientes do Cadastros. Sidebar 6 vs 3; tabbar 5 vs 5 — 4o slot igual
(Cadastros nos dois), 5o slot diferente (ADMIN Relatorios, CADASTRO Perfil); menu
do avatar no mobile 5 vs 3.

---

## Notas factuais (estado atual)

Observacoes neutras do mapeamento, sem juizo de "certo/errado":

1. **Camera so tem botao no mobile.** A rota `/camera` e acessivel a todos os
   `NON_PROSPECTOR_ROLES`, mas a unica entrada de navegacao esta na tabbar; a
   sidebar desktop nao lista Camera. No desktop, esses papeis nao alcancam a
   camera pela navegacao.
2. **"Relatorios" rotula o mesmo item para todos, com conteudo diferente.** O
   botao `/informe` aparece igual, mas a pagina e adaptativa por papel (viewer /
   proprios / placeholder vazio).
3. **Redirects silenciosos.** `/settings` -> `/profile` e `/resumo` -> `/informe`.
4. **O menu do avatar muda de conteudo por plataforma.** No DESKTOP (dropdown do
   topbar, no `AppShell`) traz sempre so "Meu perfil" + "Sair" — a gestao
   (Cadastros/Contratos/Usuarios) fica na SIDEBAR. No MOBILE (bottom sheet
   `HeaderAvatarMenu`) nao ha sidebar, entao o menu do avatar TAMBEM carrega
   Cadastros (ADMIN/CADASTRO) e Contratos + Usuarios (ADMIN) — por isso esses
   papeis tem mais itens no menu do avatar no mobile que no desktop. (Para papeis
   sem gestao, como Comercial e Classifier, o menu fica Perfil + Sair nos dois.)
   Desde 2026-07-02, no mobile Cadastros tambem esta no 4o slot da tabbar
   (ADMIN/CADASTRO), entao aparece em DOIS lugares (tabbar + menu do avatar) —
   `HeaderAvatarMenu` nao foi alterado no split.
5. **Dois nao-prospectores ficam sem Relatorios: CLASSIFIER e CADASTRO.** Dos
   cinco papeis de `NON_PROSPECTOR_ROLES`, CLASSIFIER (nunca teve) e CADASTRO
   (removido em 2026-06-28) estao fora de `INFORME_ROLES`. No mobile, ambos
   recebem Perfil como 5o item da tabbar, no lugar de Relatorios.
6. **COMMERCIAL e REGISTRATION tem a MESMA navegacao.** Ambos estao em
   `NON_PROSPECTOR_ROLES` e `INFORME_ROLES` (sidebar 4, tabbar 5, avatar 2); a
   unica diferenca e o conteudo de `/informe` — proprios + FAB (COMMERCIAL) vs
   placeholder vazio (REGISTRATION).
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

## Manutencao

Documento de suporte (read-only). Referencia o codigo (`lib/roles.ts`,
`components/AppShell.tsx`, `app/**`) em vez de duplicar listas que mudam. Ao
alterar navegacao ou guards, revisar este mapeamento. Listado no indice
`docs/README.md`.
