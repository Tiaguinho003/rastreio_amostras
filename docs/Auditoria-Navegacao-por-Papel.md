# Auditoria de Navegacao por Papel de Usuario

Status: Em construcao (read-only — mapeamento do estado atual)
Escopo: para cada papel de usuario, QUAIS paginas tem acesso e ONDE estao na
navegacao, no desktop e no mobile.
Natureza: levantamento factual. Nao propoe mudancas; decisoes de ajuste ficam
para depois.
Inicio: 2026-06-28

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
  (todos menos PROSPECTOR) — guard das paginas de amostras, clientes e camera.
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

## Referencia 3 — Universo de rotas

| Rota                                                           | Pagina      | Guard de acesso                                 |
| -------------------------------------------------------------- | ----------- | ----------------------------------------------- |
| `/login`, `/forgot-password`, `/maintenance`, `/laudo/[token]` | publicas    | sem auth                                        |
| `/dashboard`                                                   | Inicio      | qualquer autenticado                            |
| `/profile`                                                     | Perfil      | qualquer autenticado                            |
| `/settings`                                                    | —           | redireciona para `/profile`                     |
| `/offline`                                                     | offline PWA | qualquer autenticado                            |
| `/samples`, `/samples/new`, `/samples/[id]`                    | Lotes       | `NON_PROSPECTOR_ROLES`                          |
| `/camera`                                                      | Camera      | `NON_PROSPECTOR_ROLES`                          |
| `/clients`, `/clients/[id]`                                    | Clientes    | `NON_PROSPECTOR_ROLES`                          |
| `/informe`                                                     | Relatorios  | `INFORME_ROLES` (conteudo adaptativo por papel) |
| `/resumo`                                                      | —           | redireciona para `/informe`                     |
| `/cadastros`                                                   | Cadastros   | ADMIN + CADASTRO                                |
| `/contratos`                                                   | Contratos   | ADMIN                                           |
| `/users`                                                       | Usuarios    | ADMIN                                           |

Middleware (`middleware.ts`): modo manutencao redireciona nao-ADMIN para
`/maintenance`; PROSPECTOR fora do seu app (`/dashboard`, `/profile`,
`/settings`, `/offline`) e redirecionado para `/dashboard`.

## Matriz de acesso por papel

Acesso a rota (✅ acessa / ❌ redireciona para `/dashboard`). A localizacao na UI
esta no detalhe de cada papel.

| Rota              | ADMIN     | CLASSIFIER | REGISTRATION | COMMERCIAL  | CADASTRO | PROSPECTOR    |
| ----------------- | --------- | ---------- | ------------ | ----------- | -------- | ------------- |
| `/dashboard`      | ✅        | ✅         | ✅           | ✅          | ✅       | ✅ (dedicado) |
| `/profile`        | ✅        | ✅         | ✅           | ✅          | ✅       | ✅            |
| `/samples` (+sub) | ✅        | ✅         | ✅           | ✅          | ✅       | ❌            |
| `/camera`         | ✅        | ✅         | ✅           | ✅          | ✅       | ❌            |
| `/clients` (+sub) | ✅        | ✅         | ✅           | ✅          | ✅       | ❌            |
| `/informe`        | ✅ viewer | ❌         | ✅ vazio     | ✅ proprios | ❌       | ❌            |
| `/cadastros`      | ✅        | ❌         | ❌           | ❌          | ✅       | ❌            |
| `/contratos`      | ✅        | ❌         | ❌           | ❌          | ❌       | ❌            |
| `/users`          | ✅        | ❌         | ❌           | ❌          | ❌       | ❌            |

`/informe` por papel: ADMIN = viewer (todos os informes + curadoria + cria, FAB);
COMMERCIAL = proprios (scope=mine + FAB); REGISTRATION = placeholder vazio;
CLASSIFIER / CADASTRO / PROSPECTOR = sem acesso. (`app/informe/page.tsx`.)

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

- `/samples/new`, `/samples/[id]` — criar/abrir lote (a partir de Lotes).
- `/clients/[id]` — detalhe do cliente (a partir de Clientes).
- `/camera` **no desktop** — a rota e liberada (`NON_PROSPECTOR_ROLES`), mas o
  unico botao de Camera esta na tabbar mobile; a sidebar nao tem essa entrada.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/cadastros`, `/contratos` (exigem ADMIN/CADASTRO).
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

(A detalhar em sessao propria.)

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

- `/samples/new`, `/samples/[id]` — criar/abrir lote (a partir de Lotes). E onde
  o classificador faz a classificacao da amostra.
- `/clients/[id]` — detalhe do cliente (a partir de Clientes).
- `/camera` **no desktop** — rota liberada (`NON_PROSPECTOR_ROLES`), mas o botao
  de Camera so existe na tabbar mobile.

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/informe` (Relatorios) — CLASSIFIER esta fora de `INFORME_ROLES`.
- `/cadastros`, `/contratos` (exigem ADMIN/CADASTRO).
- `/users` (exige ADMIN).

### Particularidades de conteudo

- **Sem pagina ou secao exclusiva.** Nao ha rota nem area de UI restrita ao
  CLASSIFIER; classificar acontece dentro de `/samples` (criar/abrir lote ->
  classificar), nas mesmas telas vistas pelos outros nao-prospectores.
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

(A detalhar em sessao propria.)

## CADASTRO — "Cadastro"

Papel de cadastro / back-office. Acessa amostras, clientes e camera (como os
demais nao-prospectores) e tem a pagina **Cadastros** (gestao de Bancos e
Corretores). **Nao** acessa Relatorios nem Contratos (removidos em 2026-06-28;
hoje so o ADMIN) nem `/users` (exclusivo do ADMIN).

### Onde navega (por superficie)

| Destino   | Rota         | Desktop                       | Mobile                            |
| --------- | ------------ | ----------------------------- | --------------------------------- |
| Inicio    | `/dashboard` | Sidebar                       | Tabbar                            |
| Lotes     | `/samples`   | Sidebar                       | Tabbar                            |
| Clientes  | `/clients`   | Sidebar                       | Tabbar                            |
| Camera    | `/camera`    | — (sem botao)                 | Tabbar (destaque, centro)         |
| Cadastros | `/cadastros` | Sidebar                       | Menu do avatar                    |
| Perfil    | `/profile`   | Menu do avatar ("Meu perfil") | Tabbar (5o slot) + menu do avatar |
| Sair      | logout       | Menu do avatar                | Menu do avatar                    |

Contagem:

- **Sidebar desktop: 4 itens** — Inicio, Lotes, Clientes, Cadastros. (Perdeu
  Relatorios e Contratos em 2026-06-28.)
- **Tabbar mobile: 5 itens** — Inicio, Lotes, Camera, Clientes, Perfil. Sem
  Relatorios; o 5o slot vira Perfil (mesma logica do Classifier, fora de
  `INFORME_ROLES`). Cadastros nao cabe na tabbar — vai para o menu do avatar.
- **Menu do avatar:** assimetrico por plataforma. No **desktop** sao 2 itens (Meu
  perfil, Sair) — Cadastros esta na sidebar. No **mobile** sao 3 itens (Perfil,
  Cadastros, Sair) — sem sidebar, o menu carrega Cadastros.

### Rotas acessiveis sem botao de navegacao

- `/samples/new`, `/samples/[id]`; `/clients/[id]` — a partir de Lotes/Clientes.
- `/camera` **no desktop** — rota liberada, botao so na tabbar mobile (igual aos
  demais nao-prospectores).

### Rotas bloqueadas (redirecionam para `/dashboard`)

- `/informe` (Relatorios) e `/contratos` — removidos do CADASTRO em 2026-06-28
  (so ADMIN). CADASTRO saiu de `INFORME_ROLES` e de `SALE_CONTRACT_MANAGE_ROLES`.
- `/users` — exclusivo do ADMIN.

### Particularidades de conteudo

- **`/cadastros`**: gestao de Bancos e Corretores (Fechamento Fase 0). E a unica
  pagina de "gestao" que sobra para o CADASTRO.
- **`/dashboard`**: dashboard padrao (com `salesData`), igual aos demais
  nao-prospectores.
- **Removido em 2026-06-28**: o CADASTRO era viewer + curador de Relatorios
  (`/informe`) e gestor de Contratos (`/contratos`); o acesso foi retirado em
  todas as camadas (nav, guards e autorizacao de API). Detalhe pendente: ainda
  recebe as notificacoes push "Nova visita" que apontam para `/informe`
  (audiencia hardcoded `['ADMIN','CADASTRO']` em `_notifyVisitReportCreated`,
  fora desta mudanca).

### Diferenca para o COMMERCIAL

CADASTRO e Comercial sao quase espelhos, trocando **Relatorios por Cadastros**: o
Comercial tem Relatorios (proprios + FAB) e nenhuma gestao; o CADASTRO tem
Cadastros (Bancos/Corretores) e nao tem Relatorios. Sidebar 4 vs 4 (Cadastros no
lugar de Relatorios); tabbar 5 vs 5 (CADASTRO termina em Perfil, Comercial em
Relatorios); menu do avatar no mobile 3 vs 2 (CADASTRO tem Cadastros a mais).

## ADMIN — "Administracao"

(A detalhar em sessao propria.)

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
5. **Dois nao-prospectores ficam sem Relatorios: CLASSIFIER e CADASTRO.** Dos
   cinco papeis de `NON_PROSPECTOR_ROLES`, CLASSIFIER (nunca teve) e CADASTRO
   (removido em 2026-06-28) estao fora de `INFORME_ROLES`. No mobile, ambos
   recebem Perfil como 5o item da tabbar, no lugar de Relatorios.

## Manutencao

Documento de suporte (read-only). Referencia o codigo (`lib/roles.ts`,
`components/AppShell.tsx`, `app/**`) em vez de duplicar listas que mudam. Ao
alterar navegacao ou guards, revisar este mapeamento. Listado no indice
`docs/README.md`.
