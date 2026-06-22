---
name: design-system
description: Use this skill whenever building, adjusting, or reviewing any page, component, or visual element in this PWA. Ensures consistencia visual com a linguagem de design estabelecida no dashboard e login.
---

# Design System — Linguagem Visual do App

Este documento define a linguagem visual do app. Toda pagina e componente DEVE seguir estes padroes para garantir consistencia. Nao inventar estilos novos — usar os padroes documentados aqui.

## 1. Estrutura de Pagina

Toda pagina autenticada segue o padrao **Fundo Verde (app-shell) + Header Transparente + Sheet Bege**:

### Fundo Verde (app-shell)

- O verde vem do `app-shell-main.is-dashboard-route`: `linear-gradient(180deg, #1f5d43 0%, #14372a 100%)`
- O topo DEVE ser `#1f5d43` (mesma cor do `theme-color` e da status bar)
- Toda pagina que usa este padrao deve ser adicionada como `isLayeredRoute` no AppShell

### Header da Pagina

- **background: transparent** — NUNCA usar gradiente proprio no header. O header herda o verde do app-shell
- `align-items: flex-end` para posicionar conteudo na base da area verde, proximo ao sheet bege
- `padding-top` inclui `env(safe-area-inset-top)` + espacamento generoso para criar a area verde visivel
- Conteudo especifico da pagina (titulo, botao voltar, avatar, etc)

### Sheet de Conteudo (area bege)

- Fundo quente: `linear-gradient(180deg, #fdf9ec 0%, #f4f0e7 100%)`. **Excecoes aprovadas (fundo claro frio)**: (1) dashboard mobile do ADMIN — **BRANCO `#ffffff`** no sheet (2026-06-22, `.dashboard-mobile .dashboard-sheet`; era `#f4f6f5`); o PROSPECTOR segue em `#f4f6f5` (`.prospector-dashboard .dashboard-sheet`, divergiu do admin); (2) pagina de **Lotes `/samples`** — **BRANCO puro `#ffffff`** no sheet **e** nos cards (`.spv2-card-wrap`, sai o gradiente quente), com **sombra reforcada** pra definir as bordas sobre o branco e o recuo lateral redistribuido (pouco no sheet, mais no `.spv2-list-scroll`) pra a sombra nao ser decepada (2026-06-16, escopado `.samples-page-v2:not(.informe-commercial-page)` — NAO afeta o `InformeCommercialPage`/shell reusado); (3) pagina de **Clientes `/clients`** — **BRANCO puro `#ffffff`** no `.clients-v2-sheet` **e** nos cards (`.cv2-card`, sai o gradiente quente) com a mesma **sombra reforcada**, e o indicador alfabetico (`.cv2-section-divider`) — desde 2026-06-18 um **chip flutuante** branco (sem a linha, so a letra), ancorado a esquerda (`align-self:flex-start`), com sombra reforcada, cantos arredondados e `z-index:5` (acima da barra de status do card `.cv2-card::before`, que e `z-index:1`) pra a letra nao ser "furada" pela barra ao rolar por baixo; antes (2026-06-17, batch de alinhamento de /clients ao /samples) era faixa branca de largura total. (4) pagina de **Informe** comercial — **BRANCO puro `#ffffff`** no `.samples-page-v2-sheet` **e** nos cards (`.rsm-card`, sai o gradiente quente) com a mesma **sombra reforcada**, escopado `.informe-commercial-page` (2026-06-18, espelhando /samples). (5) pagina de **Resumo** (`/resumo`, informes de visita) — **BRANCO puro `#ffffff`** no sheet (`.sdv-content.informe-content.rsm-content`) **e** nos cards (`.rsm-card`) com a mesma **sombra reforcada** + recuo lateral redistribuido (pouco no sheet, mais no `.rsm-feed`), escopado `.rsm-content` (2026-06-18, mantem o shell `.sdv-page`). (6) pagina de **Perfil** (`/profile`) — **BRANCO puro `#ffffff`** no sheet (`.sdv-content.stg-content`) **e** nos cards (`.sdv-card.stg-card`, sai o gradiente quente) com a mesma **sombra reforcada**; os campos (`.stg-field-row`) saem do bege pra **cinza-frio claro `#f4f5f7`** (2026-06-19, escopado, mantem o shell `.sdv-page`). `/samples`, `/clients`, `/informe`, `/resumo`, `/profile` e o **dashboard** usam sheet branco. **2026-06-22: o FUNDO DE PAGINA (`--mobile-page-bg-base` + `html`) virou branco `#fff`** (era gradiente bege), desktop e mobile, a pedido do usuario — a regra "nunca `#fff` puro" foi superada. Sheets de paginas ainda nao migradas seguem no bege quente
- `border-radius: 20px 20px 0 0` — bordas arredondadas no topo criando o efeito 3D sobre o verde
- `padding-bottom` respeita tabbar: `calc(var(--app-safe-area-bottom, env(safe-area-inset-bottom)) + var(--mobile-tabbar-clearance))` — usar a CSS var sincronizada (ver skill `responsive` §4), nunca `env()` direto. **Excecao**: list pages com sheet rolavel (`/samples`, `/clients`) movem o clearance pro container de scroll e deixam o conteudo rolar por tras da tabbar flutuante — ver skill `responsive` §5
- O sheet ocupa o restante da tela com `flex: 1`

### Variante: dashboard mobile do ADMIN (redesign 2026-06, mockup)

Overrides escopados sob `.dashboard-mobile` em `app/globals.css` (bloco "Dashboard mobile (admin) — redesign 2026-06") — as classes base sao compartilhadas com o prospector — cujo **dashboard ESPELHA o do admin desde 2026-06-18** (overrides proprios sob `.prospector-dashboard` atualizados pros mesmos valores: sheet `#f4f6f5`, hero grande `clamp(2.3-3rem)` + avatar translucido, cards de contagem brancos flat + chip; ver bloco do prospector abaixo). So a **busca por cliente** e o **FAB** seguem especificos dele. Componentes: `DashboardMobile.tsx`, `SalesAvailabilityCard.tsx`, `RecentActivityListMobile.tsx` (os 2 ultimos exclusivos do admin mobile; estilos editados direto).

- **Hero**: saudacao grande em 2 linhas (label `clamp(1.25-1.5rem)` w400; nome `clamp(2.3-3rem)` **w700**) + papel com escudo `#7eccae`; verde liso vindo do shell (sem textura no proprio `.dashboard-hero`, continuo com a area da busca — sem emenda na borda de baixo do hero); avatar do menu (`.header-avatar-trigger .user-avatar`) translucido `rgba(255,255,255,0.18)` com iniciais brancas (`!important` por causa do backgroundColor inline do UserAvatar)
- **Busca**: pill branca solida radius 999px, input mais alto, inteira sobre a area verde. Lupa segue A DIREITA (diverge do mockup de proposito: o botao vira o CTA verde de submit no estado `.has-input` — move-lo quebraria a interacao). Estruturalmente ela NAO vive no hero: e um irmao no fluxo do `.dashboard-scroll`, entre o hero e o sheet (ver scroll abaixo)
- **Scroll simples da pagina** (so o admin mobile): hero (saudacao + avatar) e sheet vivem dentro do `.dashboard-scroll` (`flex: 1; min-height: 0; overflow-y: auto`, momentum + `overscroll-behavior: contain`) e **rolam juntos** — nada fica fixo no topo. O sheet fica no fluxo normal (`.dashboard-sheet` `overflow: visible; flex: 1 0 auto` pra preencher a tela quando o conteudo e curto). O `.dashboard-page` continua `overflow: hidden; height: 100%` (so o `.dashboard-scroll` rola). _(A **busca por lote** no hero do admin mobile foi REMOVIDA a pedido do usuario em 2026-06-16 — o `SampleSearchField` saiu do `DashboardMobile`; as classes `.dashboard-hero-search`/CSS seguem em uso pelo prospector (busca por cliente, ver abaixo). Antes disso ja se removera o efeito antigo "cobrir a busca" — busca sticky + sheet por cima + recorte arredondado — em 2026-06-15.)_
- **Cards de pendencias** (sem heading "Operacoes"): labels **"Lotes" / "Clientes"** (dados seguem sendo classificacao pendente e cadastros incompletos); card branco flat radius 18px; icon-wrap rounded-square `#e8f1ec` com glifo SOLIDO `#1f5d43` (fenda do grao em stroke claro `#e8f1ec` inline no markup); titulo `#1a1a1a` w700 + subtitulo `#8a8f8c` empilhados (sem divider/chevron). Numero em CHIP verde `#e8f1ec`/`#1f5d43` **flutuando no canto superior direito** (`position: absolute`, `top` negativo popando pra fora da borda de cima, anel branco 2px + sombra suave), ancorado no card (`.dashboard-operation-card` e `position: relative`) — sai do fluxo pra o titulo+subtitulo ocuparem a largura TODA do card sem cortar "Pendentes" (era CHIP inline estatico que comprimia o texto). Pulsacao (`badge-pulse-soft`, scale 1.13, 2s — keyframe proprio do mobile, perto do `badge-pulse` 1.15 do desktop; a regra mobile sobrescreve o `animation: none` antigo), some quando 0. Identidade verde uniforme nos 2 cards (decisao do usuario — sai o ambar semantico)
- **Lotes disponiveis** (`.sales-card`): card BRANCO radius 20px (sai o gradiente verde escuro); header = titulo escuro (sem icone-cubo — decisao do usuario) + botao decorativo trending-up (`.sales-card-chart-icon`, `#eef5f1` borda verde); donut com track `#edf0ee`, **fresta de 2 unidades entre segmentos** quando 2+ tem valor, total central `#14532d` (o tamanho do numero **encolhe conforme a qtd de digitos** — atributo `fontSize` no componente, nao no CSS — pra caber confortavel no furo do donut com 3-4 algarismos); legenda com labels `#4a5550`, counts `#1a1a1a` w700, dividers `rgba(0,0,0,0.08)`; botao "Ver disponíveis" **full-width** pill verde-escura com label centrada e chevron na borda direita. **Esse mesmo padrao (`.sales-card`/`.sales-chart-*` + donut SVG manual) e REUSADO no detalhe do cliente** (`components/clients/ClientCommercialSummaryCard.tsx`, secao "Resumo comercial") — donut das contagens comerciais (Em aberto/Vendido/Perdido/Comprado, "Comprado" so se comprador), SO apresentacao (sem botao/legenda clicavel)
- **Ultimas atividades**: header so com titulo `#1a1a1a` (sem icone e sem "Ver todas" — decisoes do usuario); icone COLORIDO por acao — glifo na cor da acao sobre circulo no mesmo tom clarinho, `color`/`bg` vindos inline de `EVENT_CONFIG[type]` em `lib/dashboard-activity.ts` (mesma fonte do rotulo do desktop). Cores canonicas: venda=verde `#27ae60`, perda=vermelho `#c0392b`, envio=ambar `#e5a100` (os 3 = paleta do grafico de "Lotes disponiveis"), registro=azul `#3a6ea3`, venda/perda cancelada=cinza `#6b7280`. **Envio cancelado (caminho A, 2026-06-18):** NÃO vira card cinza — o próprio card "Enviada" fica **esmaecido** via `.is-cancelled` (`opacity: 0.55`, desktop e mobile), marcado pelo campo `cancelled` que o `getDashboardRecentActivity` calcula por envio (existe `PHYSICAL_SAMPLE_SEND_CANCELLED` apontando pra aquele `sendEventId`). Além da opacidade, um **selo "Cancelado" ao lado do lote** (`.dd-activity-cancelled-tag` / `.recent-activity-mobile-cancelled-tag`, pill cinza neutro `#6b7280` sobre `rgba(107,114,128,0.16)`) torna o cancelamento explícito sem depender só do esmaecimento. Subtitulo cinza; altura fixa 400px + scroll interno

### Paginas sem header verde

- Paginas como settings, detalhes de amostra podem usar header mais compacto
- **2026-06-22: o fundo de pagina virou BRANCO `#fff`** (`--mobile-page-bg-base` + `html`), desktop e mobile, a pedido do usuario. Sheets ja migrados pro branco: `/samples`, `/clients`, `/informe`, `/resumo`, `/profile` e o **dashboard**; paginas nao migradas mantem o sheet bege quente `#fdf9ec` (ver §1, Sheet de Conteudo)
- Excecao: areas de formulario/cards internos podem usar `#ffffff`

### Variante: dashboard do PROSPECTOR (app restrito)

- `/dashboard` renderiza `components/dashboard/prospector/ProspectorDashboard.tsx` quando `isProspector(role)` — **layout unico responsivo** (sem par mobile/desktop): reusa `.dashboard-page/.dashboard-hero/.dashboard-sheet` do dashboard mobile; o bloco `@media (min-width: 901px)` replica hero/sheet sob `.prospector-dashboard` com cap de largura (46rem)
- Hero de saudacao com **busca por nome de cliente** no lugar da busca de lote (mesmas classes visuais `dashboard-hero-search`/`sample-search-field`; filtra ao digitar com debounce 250ms a partir da 2a letra — server-side, o total acompanha); 2 cards de contagem `dashboard-operation-card is-wide is-static` ("Visitas / Hoje" e "Clientes novos / Hoje", SEMPRE do usuario logado; nao clicaveis: `cursor: default`, sem `:active`, badge sempre visivel e sem pulse; desde 2026-06-18 **espelham o visual do admin** (`.dashboard-mobile`): card branco flat + sombra, icon-wrap flat verde-claro `#e8f1ec` (o icone segue stroke verde brand, sem modificador `.dashboard-op-*`) e badge = chip verde-claro flutuante no canto)
- Lista "Ultimos informes": mostra **apenas os informes do PROPRIO prospector** (escopo own-only no backend, `where.userId`), com contador `.prospector-list-meta`+`.spv2-list-count` no canto esquerdo acima dos cards (segue o filtro de busca) e cards `rsm-*` compartilhados (`components/visits/VisitReportCard.tsx`). **Scroll interno** so na area da lista (`.prospector-list-scroll`; hero/busca/cards de contagem sempre visiveis — o `.dashboard-sheet` do prospector vira `overflow: hidden` e o clearance do botao "+" migra pro fim da lista). O `.dashboard-sheet` do prospector usa o mesmo fundo frio `#f4f6f5` do admin (override proprio — sem ele herdava o gradiente bege legado da base `.dashboard-sheet`). Como a lista e own-only, a lixeira `.rsm-card-quick-delete` (prop `quickDelete`; confirm central via portal; exclusao por autor no backend) aparece em TODOS os cards do dashboard
- **SEM navbar**: o PROSPECTOR nao renderiza a MobileTabbar (`hideMobileTabbar` no AppShell). O botao `.prospector-fab` — gradiente do pill da camera (`#1a6b2e→#0d4a1a`), **quadrado arredondado** (`border-radius clamp(18-22px)`, `clamp(4.2-4.9rem)`), icone "+" — fica fixo no rodape **a direita, alinhado ao centro do avatar do hero** (right = padding do hero + meio avatar − meio botao); abre o formulario num bottom sheet `.is-informe`; some quando ha sheet/modal aberto. Em `/profile` o prospector ganha seta de voltar no canto esquerdo (`.stg-header .sdv-header-top` com `width: 100%` — sem isso o align-items:center do stg-header encolhe o header-top); o menu do avatar dele nao mostra "Metricas"
- Sheet `.is-informe`: corpo no fundo padrao do BottomSheet (quase branco) com `.inf-intro` escondida (o header do sheet ja titula "Novo informe")

### Barra de navegacao inferior (MobileTabbar)

Pill flutuante (`.mobile-tabbar-inner`) renderizada via Portal no `body` (`components/MobileTabbar.tsx`); so o ADMIN renderiza (5 itens: Inicio, Lotes, Camera=`is-primary`, Clientes, Informe — prospector nao tem). Estilos em `app/globals.css` (`.mobile-tabbar*`).

- **Superficie BRANCA** (redesign 2026-06-15, mockup): `.mobile-tabbar-inner` `#ffffff`, hairline `rgba(20,50,25,0.08)` + sombra reforcada em camadas (`0 4px 12px /.14` + `0 14px 34px /.22`) pra destacar do fundo (era barra verde-escura `#0b4a04→#073603` com icones brancos)
- **Estados por item**: inativo cinza-esverdeado `#74837a` (icone via `currentColor` + label w500); **ativo verde `#1e8540`** (icone + label w600) com **indicador = traco verde curto arredondado ABAIXO do label** (`::before`, `bottom`, `border-radius: 999px`) — era traco branco no topo. `.is-primary` (camera) sem indicador de ativo (decisao do usuario)
- **Traco fino**: labels leves (w500/w600) e icones com `stroke-width: 0.9` — EXCETO o icone da camera (`.is-primary .mobile-tabbar-icon svg`), que mantem `stroke-width: 1.16` (nao afina junto — pedido do usuario)
- **Layout = grid de colunas iguais**: `.mobile-tabbar-inner` usa `grid-auto-flow: column; grid-auto-columns: minmax(0,1fr)` -> os 5 itens ficam exatamente equidistantes; cada link centra o conteudo na propria coluna. O circulo da camera (`.is-primary .mobile-tabbar-pill`) usa o **mesmo verde do cabecalho** (`linear-gradient(180deg, var(--brand-green), var(--brand-green-deep))`) e fica elevado via `margin-top` negativo. **Tamanho = `width: min(clamp(...), 100%)` + `aspect-ratio: 1`**: o `min(..., 100%)` impede o circulo de passar da largura da coluna (sem isso ele transbordava e, sendo filho flex com `justify-content:center`, escorregava pro lado no Safari iOS — botao fora do centro e vaos desiguais); o `aspect-ratio` mantem o circulo perfeito (altura segue a largura)
- **Altura -10%** (vs versao anterior): icone/label/paddings internos e o pill da camera escalados por 0.9 (clamps em `.mobile-tabbar-icon`, `-label`, `-link`, pill); `--mobile-tabbar-clearance` acompanha (8.9rem -> 8.3rem). Ao mexer na altura da barra, reavaliar a clearance pra nao sobrar/faltar respiro

## 2. Paleta de Cores

### Marca (verdes — paleta Safras)

Todos os verdes do app vivem na paleta Safras, expostos como tokens CSS no `:root` de `app/globals.css`. **Sempre preferir o token** ao hex literal.

| Uso                             | Token                                   | Hex                  |
| ------------------------------- | --------------------------------------- | -------------------- |
| Status bar / base               | `--brand-green`                         | `#1f5d43`            |
| Gradiente login inicio          | `--brand-green-deep`                    | `#173c30`            |
| Gradiente login meio            | `--brand-green-strong`, `--brand-green` | `#24553a`, `#1f5d43` |
| Gradiente login fim             | `--brand-green-soft`                    | `#2f6b4a`            |
| Acento interativo (foco, links) | `--brand-green-soft`                    | `#2f6b4a`            |
| Avatar fundo                    | —                                       | `#2a6b45`            |

### Superficies

| Uso                   | Cor                                                 |
| --------------------- | --------------------------------------------------- |
| Fundo pagina (quente) | `#fdf9ec` → `#f4f0e7`                               |
| Fundo card            | `linear-gradient(180deg, #ffffff 0%, #f9f7f2 100%)` |
| Fundo campo repouso   | `#f8f6f2`                                           |
| Fundo campo focado    | `#ffffff`                                           |
| Divider / separador   | `#d9d3be`                                           |
| Skeleton loading      | `#e8e3d5`, `#e0dbd0`                                |

### Texto

| Uso                     | Cor                                               |
| ----------------------- | ------------------------------------------------- |
| Primario                | `#1a1a1a`                                         |
| Secundario              | `#555`                                            |
| Terciario / muted       | `#999`                                            |
| Sobre verde (titulo)    | `#ffffff`                                         |
| Sobre verde (subtitulo) | `rgba(255,255,255,0.5)` a `rgba(255,255,255,0.7)` |
| Placeholder             | `rgba(0,0,0,0.18)`                                |

### Status (pendencias, alertas)

| Status                 | Cor       | Uso                                           |
| ---------------------- | --------- | --------------------------------------------- |
| Impressao pendente     | `#C0392B` | Cards, badges, alertas                        |
| Classificacao pendente | `#D4A017` | Cards, badges                                 |
| Em andamento           | `#2980B9` | Cards, badges                                 |
| Disponivel / sucesso   | `#27AE60` | Barras, indicadores                           |
| Alerta (> 15 dias)     | `#E67E22` | Barras de distribuicao                        |
| Erro em campo          | `#c45c5c` | Placeholder de erro (nunca vermelho saturado) |

## 3. Cards

### Estilo base de card

```
background: linear-gradient(180deg, #ffffff 0%, #f9f7f2 100%);
border-top: 1px solid rgba(255, 255, 255, 0.9);
border-radius: clamp(14px, 4vw, 16px);
box-shadow:
  0 2px 4px rgba(0, 0, 0, 0.06),
  0 6px 16px rgba(0, 0, 0, 0.08),
  0 12px 28px rgba(0, 0, 0, 0.05),
  inset 0 1px 0 rgba(255, 255, 255, 0.8);
```

### Linha lateral de status

Existem dois padroes em uso (ambos validos — usar conforme o contexto do card):

**Compacto** (cards de listagem leves, ex: filiais antigas, dots/markers internos):

- `::before` com `position: absolute`, `left: 0`, `top: 20%`, `bottom: 20%`
- `width: 3px`, `border-radius: 0 3px 3px 0`

**Padrao amostras / cards detalhados** (`sdv-unit-card-mini`, `cv2-card.is-incomplete`):

- `::before` = barra lateral CURTA, arredondada e centralizada (NAO encosta nas bordas): `left: clamp(6px, 1.8vw, 8px)`, `top: 50%` + `translateY(-50%)`, `width: 4px`, `height: clamp(~34-46px)`, `border-radius: 2px`
- Cor via `--card-status-color` (verde completo / amber `#d97706`/`#f59e0b` incompleto / cinza inativo)

### Interacao

> Pattern completo de tap feedback documentado na skill **`button-press-effect`** — esta secao e apenas resumo.

- `:active` usa `transform: scale(0.95-0.99)` + sombra reduzida
- Nunca mudar cor de fundo ao clicar (excecao: filter chips em listagens — ver §7)
- `-webkit-tap-highlight-color: transparent`

### Skeleton loading

- Formato identico ao card final (mesma altura, mesmo radius, mesma cor de fundo neutra)
- Pode usar **shimmer suave** (`background-size: 200% 100%` + `linear-gradient` em movimento, `~1.4s ease-in-out infinite`) combinado com fade-in `cubic-bezier(0.22, 1, 0.36, 1)` na entrada
- Exemplo em uso: skeleton dos cards de `/samples` (`.spv2-card` + `spv2-skeleton-shimmer`, ver `app/globals.css`)
- Skeleton e para **cards/secoes especificas** dentro de uma pagina ja carregada. Para a **pagina inteira** ainda nao pronta, usar o loader da marca (abaixo), nunca um texto "Carregando..."

### Loader de pagina lenta (branded)

- Quando **uma pagina inteira** demora (sessao/auth ou dados), aparece o visual da marca (logo + barra + bolinhas) — o mesmo do splash de boot — em vez de texto verde.
- Componente reusavel: `components/SplashVisual.tsx` (variante `pageLoader`); `SplashScreen` (boot) e o loader de pagina compartilham esse visual.
- Arquitetura: `LoadingProvider` (`app/layout.tsx`, em volta do `PageTransition`) conta fontes de carregamento e so mostra o overlay apos ~480ms (loads rapidos nao piscam), portado ao `body`, z-index 99998 (abaixo do splash de boot 99999, pra handoff sem glitch no startup).
- Registrar uma fase async lenta: hook `useGlobalLoading(active)` (`lib/loading/loading-context.ts`). Ja vem ligado no `useRequireAuth` (cobre auth de toda pagina autenticada); paginas de detalhe ligam tambem o load dos dados (`useGlobalLoading(loadingDetail)`).
- **Evitar o "shell vazio" no 1o load:** a pagina de detalhe deve dar `return null` enquanto os dados ainda nao chegaram (`if (loadingDetail && !detail) return null` / `if (loadingPage && !client) return null`), em vez de renderizar `AppShell`/`.sdv-page` sem conteudo — o loader da marca cobre a tela e a pagina aparece de uma vez. So no 1o load (dado ainda `null`); refetch mantem o dado e nao pisca. Aplicado em `/samples/[sampleId]` e `/clients/[clientId]`.

### Variantes de card especificas

| Classe                      | Uso                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.sdv-card`                 | Card branco padrao (sombra 3D, radius 18px) — base para detalhe de cliente/amostra                                                                                                                                                                                                                                                                                                                                                                             |
| `.sdv-info-compact`         | Container branco padrao (SEM header verde): `.sdv-card-header` (titulo cinza + hairline full-bleed) + acao minimalista `.sdv-edit-btn` (lapis "Editar" ou "+" "Nova") + `.sdv-info-grid`. Containers Informacoes/Classificacao/Resumo do detalhe da amostra e **Informacoes + Filiais + Endereco fiscal** do detalhe do cliente. (O antigo `.sdv-card-themed` de header verde foi APOSENTADO 2026-06-19 — nenhum container do cliente usa mais; CSS removido.) |
| `.sdv-card-commercial-mini` | **REMOVIDO 2026-06-19** — era o mini-card-filtro (Em aberto/Vendido/Perdido/Comprado) + a lista (`.sdv-commercial-list*`) da seção comercial do detalhe do cliente; a seção virou um **gráfico donut** (`ClientCommercialSummaryCard`, ver §"Lotes disponiveis") sem filtros. Todo o CSS órfão foi removido do `globals.css`.                                                                                                                                  |
| `.sdv-unit-card-mini`       | Card minimalista de filial — barra lateral CURTA/arredondada/centralizada (não encosta nas bordas, padrão Lotes/Clientes): verde (completo) / amber (incompleto) / cinza (inativo). Incompleto tb mostra o badge `cv2-card-incomplete-badge` no canto sup. direito (card é `overflow:visible`).                                                                                                                                                                |
| `.cv2-card`                 | Card de cliente `/clients` — barra lateral CURTA estilo Lotes (`::before` centralizada, NAO mais faixa de altura cheia): VERDE (completo) / LARANJA (`.is-incomplete`). Avatar de iniciais VERDE por TIPO (PJ `#1f5d43` escuro / PF `#2f8a5e` claro, via `--avatar-color`). Nome com ellipsis no mobile (`display:block`).                                                                                                                                     |

## 4. Icones

### Padrao SVG

- Todos os icones sao SVG inline com `viewBox="0 0 24 24"`
- `fill: none`, `stroke: currentColor` (cor herdada do pai)
- `stroke-width: 1.6` a `1.8`, `stroke-linecap: round`, `stroke-linejoin: round`
- Tamanho controlado pelo container pai com `clamp()`

### Icones em caixas (icon-wrap)

- Container com `border-radius: clamp(10px, 3vw, 14px)`
- Fundo em gradiente sutil da cor do status: `linear-gradient(135deg, cor 15% opacidade, cor 8% opacidade)`
- Borda `1.5px solid` na cor do status com 25% opacidade
- Icone SVG na cor solida do status

## 5. Badges (contadores)

### Badge Pill

- Circulo com `border-radius: 50%`, tamanho `clamp(22px, 6.5vw, 26px)`
- Fundo na cor solida do status, texto branco `font-weight: 700`
- `border: 2px solid` na cor do background da superficie pai (para criar separacao visual)
- Position absolute no canto superior direito do icon-wrap: `top: clamp(-8px, -2vw, -6px)`, `right: clamp(-10px, -2.5vw, -8px)`
- So aparece se o valor for > 0
- Animacao de pulso: `scale(1) → scale(1.15) → scale(1)`, `2s ease-in-out infinite`

## 6. Campos de Input

### Estrutura

- Container flex com icone a esquerda + input + acao opcional a direita
- `border-radius: clamp(12px, 3.5vw, 14px)`
- `padding: clamp(12px, 3.5vw, 14px) clamp(14px, 4vw, 16px)`

### Estados

| Estado  | Fundo     | Borda                                 | Extras                                       |
| ------- | --------- | ------------------------------------- | -------------------------------------------- |
| Repouso | `#f8f6f2` | `1.5px solid rgba(0,0,0,0.06)`        | —                                            |
| Focado  | `#ffffff` | `1.5px solid var(--brand-green-soft)` | `box-shadow: 0 0 0 3px rgba(47,107,74,0.08)` |
| Erro    | `#f8f6f2` | `1.5px solid rgba(196,92,92,0.4)`     | Placeholder em `#c45c5c`                     |

### Transicao

- `transition: background 0.25s, border-color 0.25s, box-shadow 0.25s`

### Icone do campo

- Tamanho: `clamp(18px, 5vw, 20px)`
- `stroke: #888`, `stroke-width: 1.6`
- `margin-right: clamp(10px, 3vw, 12px)`

## 7. Botoes

### Botao Primario (acao principal)

```
background: linear-gradient(135deg, var(--brand-green), var(--brand-green-soft));
color: #ffffff;
border-radius: clamp(12px, 3.5vw, 14px);
padding: clamp(14px, 4vw, 16px);
font-weight: 600;
box-shadow: 0 4px 24px rgba(31, 93, 67, 0.3);
```

- Full-width quando e a acao principal da pagina
- Reforcar `background` em TODOS os estados (:hover, :focus, :focus-visible, :active, :disabled)
- `:active` = `scale(0.96)` + sombra reduzida
- `:disabled` = `opacity: 0.65`

### Botao Secundario (acoes menores)

- `background: transparent` ou `rgba(cor, 0.08)`
- Texto na cor da acao
- `:active` = `scale(0.95)` ou `opacity: 0.7`

### Filter chips e botoes de filtro em listagens

Excecao a regra "nunca verde ao clicar":

- Em listagens (`/clients`, `/users`), **filter chips/botoes em estado `.is-active`** podem usar verde solid (`linear-gradient(135deg, var(--brand-green), var(--brand-green-soft))` com SVG branco) para sinalizar acao em uso. Exemplo: `.hero-search-filter-btn` (base verde, hoje só em `/users`). **Exceção — `/samples` e `/clients`**: o `.hero-search-filter-btn` foi movido pra linha da busca (à direita; a busca encurta via flex) e vira **pílula BRANCA + ícone verde** (escopado a `.samples-page-v2`; `/clients` ganhou o equivalente escopado a `.clients-page-v2` — ver bullet abaixo), com **badge vermelho** sinalizando filtros ativos. A **lupa DENTRO** da busca de `/samples` é **puramente decorativa** (a busca filtra ao vivo ao digitar, sem submit): override em `.samples-page-v2` remove a afordância de botão herdada do `.hero-search-submit` compartilhado (`cursor:default`, sem `scale` no `:active`, caixa colapsa de 2rem pro tamanho do ícone) e **encolhe** o `.hero-search-icon-search` (0.95rem), centralizado pelo flex da barra — diferente de **`/users`** (único que mantém a lupa-**botão** com cross-fade pra seta de submit; `/clients` também adotou a lupa decorativa — ver bullet abaixo). O contador `.spv2-list-meta`/`.spv2-list-count` ficou alinhado à direita (modo liga volta a `space-between`). Quando há filtros aplicados, aparece à ESQUERDA do filtro um botão redondo de limpar `.hero-search-clear-btn` (X verde) num `.hero-search-clear-slot`: o slot colapsa a largura (+ margin-left negativa que cancela 1 `--search-row-gap`) e o botão desliza via `transform` pra TRÁS do filtro (que tem `z-index:1` + fundo opaco) — assim some/aparece junto com a busca encolhendo/crescendo. Default = colapsado; `.hero-search-wrap.has-applied-filters` = expandido. Limpa via `handleClearFiltersOnly` (refaz o fetch).
- **`/clients` adota o filtro de `/samples`** (batch de alinhamento de /clients ao design de Lotes, 2026-06-17): o `.hero-search-filter-btn` saiu do `.spv2-list-meta` e foi pro `.hero-search-wrap` (linha da busca, à direita; busca encurta via `flex:1`), virando **pílula branca + ícone verde + badge vermelho** (escopado `.clients-page-v2`). O painel deixou de ser **dropdown ancorado** (`.cv2-filters-*` removido) e virou **MODAL central** reusando `.app-modal.is-themed.samples-filter-modal` (CSS keyed por classe; mesmos campos de cliente — Responsável, Status, Tipo, Papel, Completude — em `<select>` simples; rascunho + Aplicar/Limpar). O contador `.spv2-list-count` alinha à **direita** no mobile (no desktop o `.spv2-list-meta` segue como header `space-between`). Estado de filtro mora em `app/clients/page.tsx`; o componente `ClientsFilterButton` foi **aposentado** (segue só exportando os tipos + `EMPTY_CLIENT_FILTERS`/`countActiveClientFilters`). A **lupa** virou **decorativa** (span `aria-hidden`, sem submit; Enter ainda busca via implicit submission do form) e a busca ganhou o botão **"X" de limpar** (reusa as classes globais `.hero-search-clear-*` + `has-applied-filters`, chamando `handleClearFiltersOnly`). Só **`/users`** mantém a lupa-botão + filtro base verde. A **busca da lista** também foi alinhada a /samples: casa por **PREFIXO de palavra** (backend `buildClientWhereFromSearch(search, { matchMode: 'prefix' })` em `src/clients/client-service.js` — começa-com OU contém `" "+termo`; CPF/CNPJ por prefixo) e dispara a partir de **2 caracteres** (`<2` desfiltra). O **lookup/typeahead** de cliente nos formulários segue por `contains` (`matchMode` default).
- A excecao se aplica **apenas ao estado persistente de "filtro ativo"** — nunca ao `:active` transitorio do clique.

### Campos de filtro multi-select (chips dentro do campo)

- No modal de filtros de `/samples`, campos de selecao multipla usam o box `.samples-filter-multi`. Duas variantes:
  - **`--lookup` RETRÁTIL** (Proprietário/Comprador/Enviado para — `ClientLookupField`): é um **disclosure**. Colapsado mostra SÓ o gatilho (`.samples-filter-retract-trigger`: nome do campo numa caixa de **borda fina** + seta `.samples-filter-retract-chevron` + bolinha `.samples-filter-retract-count` com a contagem) — sem caixa de input à vista. Clicar abre a caixa de busca (animação `samples-filter-field-reveal`; a borda do gatilho some). Aberto: chips dos selecionados (`.samples-filter-chips-row`, fila horizontal **rolável**, `nowrap`, rótulo truncado `8ch`) na **MESMA linha** do typeahead inline → o campo **não cresce de altura**; placeholder some quando há seleção; sem outline preto no input (`input:focus { outline: none }`). Fecha ao clicar fora, em outro campo ou ao **rolar o modal** (JS em `app/samples/page.tsx`, fecha via `.samples-filter-field--retractable.is-open`).
  - **`--select`** (`ClassificationFilterField`): box clicavel. O **campo FECHADO** enfileira os selecionados como chips numa **ÚNICA linha** (`.samples-filter-multi-chips`, `nowrap` + `overflow:hidden`, tokens **label-only** sem "×"); o que não couber na largura colapsa num **`+N`** (`.samples-filter-multi-more`) — a contagem do overflow é medida em JS (`ResizeObserver` + mirror invisível `.samples-filter-multi-measure`, que renderiza todos os chips no tamanho natural pra evitar loop de remedição) — e a **bolinha `.samples-filter-retract-count`** (verde, reaproveitada do `--lookup`) mostra o **total** selecionado, à direita antes do chevron. Clicar abre `.samples-filter-multi-dropdown` com a checklist. A **busca** no dropdown só aparece com a prop **`searchable`** (hoje **só a Catação**, ainda gated por `> 8` opções); Padrão/Aspecto/Certificado têm checklist **seca**. Campos: **Padrão/Aspecto/Catação/Certificado** (opções de `GET /samples/classification-values?field=padrao|aspecto|catacao|certif`) + **Safra** (multi-seleção; opções dos presets `buildHarvestPresets`, **sem** endpoint — match por componente via `contains` OR no backend, param `harvests` CSV com fallback ao `harvest` legado).
- **`ChipMultiSelectField`** (`components/ChipMultiSelectField.tsx`): versão GENÉRICA e **id-based** do mesmo padrão `--select` (chips numa ÚNICA linha + `+N` medido com mirror invisível + `ResizeObserver` + dropdown checklist com busca opcional), com classes próprias `.chip-select-*` que casam com os inputs do modal (altura FIXA 2.5rem, borda 2px, raio 10px — o campo **nunca** cresce). Abre pra cima perto do rodapé (`.chip-select-wrap.is-drop-up`). **Erro inline DENTRO do campo**: `errorMessage` vira o **placeholder vermelho** (`.chip-select-placeholder.is-error`) + borda vermelha (`.is-field-error`), NÃO uma mensagem abaixo — o campo não muda de posição (alinhado a `feedback_error_inside_field`). Usado no **modal de novo cliente** (`ClientQuickCreateModal`) em **Responsável** (`searchable`, options = usuários comerciais, obrigatório) e **Papel** (Vendedor/Comprador/Armazém → `isSeller`/`isBuyer`/`isWarehouse`, multi, obrigatório, vem vazio); e no **modal de editar do detalhe** (`/clients/[id]`) em **Papel** (mesmo mapeamento, ao lado do Telefone). O `UserMultiSelect` (input-de-busca com **chips em scroll horizontal**, altura fixa — não cresce) segue em `/clients/[id]` no **Responsável** (linha própria, largura toda). _(O resumo de validação do submit é um **toast** de erro, não inline (ver §13): "Preencha os campos obrigatórios destacados" quando falta campo; mas se o bloqueio é CPF/telefone **preenchido com a contagem de dígitos errada**, o toast traz a dica específica — ex. "CPF deve ter 11 dígitos (tem X)" / "Telefone deve ter 10 ou 11 dígitos" — porque o placeholder-dica do campo some quando há valor. (CPF/CNPJ **não** checa mais dígito verificador desde 2026-06-19, só comprimento — front e back.)_

### Regras universais de botao

> Pattern canonico completo (tap-highlight, `:active`, `:hover` em `@media (hover: hover)`, anti-patterns) na skill **`button-press-effect`** — esta secao mantem so os pontos especificos do design system.

- Nunca virar verde no `:active` transitorio (regra mantida — verde solido e exclusivo do estado persistente `.is-active` em filter chips, conforme acima)
- Sempre `-webkit-tap-highlight-color: transparent`
- Sempre `outline: none` ou outline neutro

## 8. Modais e Bottom Sheets

### Bottom Sheet (padrao mobile)

> Componente reusavel: `components/BottomSheet.tsx`. Usar este wrapper ao construir qualquer bottom sheet novo — nao replicar o CSS na mao. Em desktop (>900px) o mesmo componente transforma-se em modal centralizado via CSS responsivo.

**API:** `{ open, onClose, onDismissAttempt?, title?, footer?, children, dragToDismiss?, dragDisabled?, ariaLabel?, className? }` (controlled, declarativo). `onDismissAttempt` async permite cancelar fechamento (ex: modal de confirmacao "Descartar?").

**Caracteristicas do CSS base (`bottom-sheet*` em globals.css):**

- Mobile: `position: fixed`, `transform: translate3d(0, 100%, 0)` → `translate3d(0, 0, 0)` ao abrir
- Transition: `0.46s cubic-bezier(0.22, 1, 0.36, 1)` (abertura de baixo pra cima mais lenta/natural; DEVE casar com `ANIMATION_MS` no `BottomSheet.tsx`)
- Overlay (**padrao de ACAO**): `rgba(0, 0, 0, 0.55)` **SEM blur** — a pagina de tras fica VISIVEL, so escurecida; fecha ao clicar (passa por `onDismissAttempt`). _(Inclui o `.camera-preview-sheet` desde 2026-06-18: herda este scrim escuro sem blur — antes forcava `rgba(0,0,0,0.4)` + `blur(16px)` via `:has()`.)_
- **Chrome = padrao de ACAO** (canonico desde 2026-06; antes scoped em `.is-operations`, agora e o BASE de TODOS os bottom sheets): **header BRANCO** (`background: transparent` = fundo do sheet, sem faixa verde, `justify-content: space-between`, colado no topo); **titulo VERDE** `var(--brand-green)` alinhado a **esquerda**; **X quadrado-arredondado claro** (`#eef1ee` / glifo `#4a5751`) NO FLUXO do header (`position: static`) — saiu o circulo translucido `absolute`; **drag handle transparente** e compacto com **barra cinza** `rgba(20, 50, 25, 0.18)`. _(O `.camera-preview-sheet` adota este chrome desde 2026-06-18 — header CLARO + titulo VERDE — mas numa variante: faixa branca edge-to-edge (`background:#fff` + borda inferior clara) com titulo CENTRADO e X/drag ocultos, porque o corpo e a area escura da foto. Antes era header verde edge-to-edge + titulo creme.)_
- Swipe down para fechar (threshold 60px); pausa se `dragDisabled=true` ou se target tem scroll
- Fundo: `var(--brand-cream-soft)`
- `border-radius` topo: `clamp(20px, 5vw, 28px)`
- `max-height: 98dvh` (fallback `calc(100vh - 2vh - env(safe-area-inset-top))` em iOS Safari < 15.4)
- Body flex com `min-height: 0` + `overflow-y: auto` (crítico pra teclado virtual)
- Footer sticky bottom (nao fixed) — acompanha scroll-into-view
- ESC dispara `onDismissAttempt`; back Android via `history.pushState` + `popstate` listener
- **GOTCHA — navegar a partir de uma acao do sheet:** o sheet injeta uma entry de history (`state.bottomSheet`) e, no cleanup do close/unmount, chama `history.back()` pra desfaze-la. Como `router.push` (App Router) e assincrono, esse `back()` corre contra a navegacao e a DESFAZ (a acao "nao navega"). Antes do `router.push`, limpe o marcador: `history.replaceState({ ...history.state, bottomSheet: false }, '')`. Ver `useOperationModal.classifySample` (seta de classificar dos "Lotes pendentes") e `HeaderAvatarMenu.go` (linhas do menu da conta).
- Focus trap via `useFocusTrap`; `role="dialog"` + `aria-modal="true"`
- `translate3d` permanente: GPU layer; previne scroll lock iOS standalone PWA
- **Renderiza via `createPortal(document.body)`** (igual ao MobileTabbar): o sheet `position: fixed` escapa do contexto de empilhamento de onde o componente esta montado. Por isso pode ser montado em qualquer lugar (ex: dentro do header de uma pagina, como o `HeaderAvatarMenu`) sem ficar atras do conteudo.
- **`stacked` (sheet SOBRE outro sheet/modal):** a prop `stacked` eleva backdrop+sheet pro tier `--z-modal-stacked` (600/610, via `.bottom-sheet(-backdrop).is-stacked`) — acima do `--z-modal` do overlay de baixo — e **delega a history ao overlay-pai** (nao injeta entry propria). O **scroll-lock do body** + a classe **is-bottom-sheet-open** sao **ref-contados** (module-level `sheetStack`/`openIntentCount`: travam no 0→1 e restauram no 1→0), entao fechar o sheet de cima NAO destrava o scroll nem reexibe a tabbar enquanto o de baixo segue aberto. **ESC e back** so atuam no sheet do **TOPO** (gating por `sheetStack`). Sheet sozinho → comportamento identico ao anterior (stack chega no maximo a 1). No overlay-pai, use `dragDisabled={filhoAberto}` pra pausar o arraste dele enquanto o de cima esta aberto. Ex.: `ClientQuickCreateModal` ("novo cliente") sobre o `NewSampleModal` ("Nova amostra"). Confirm de descarte do sheet de cima vai como **overlay INTERNO** (`position:absolute; inset:0`, como o overlay de sucesso) — evita um 3º tier de z-index.
- **Conteudo congelado no close:** ao fechar (`open=false`), o sheet fica montado por `ANIMATION_MS` (460ms) pro slide-down e renderiza um **snapshot do ultimo estado aberto** (children/title/footer/className/ariaLabel). Se o consumidor recomputar os props pro proximo estado durante o close (ex: trocar `flowState`), o conteudo e a altura **nao** mudam no meio da saida — evita o sheet "crescer + trocar de body" enquanto desce. Durante o close o `.bottom-sheet` fica `pointer-events: none` (sem clique fantasma no footer congelado). Snapshot gravado via layout-effect; ao reabrir volta aos props ao vivo.
- **Variante `.is-menu` (altura por conteudo):** `className="is-menu"` troca a altura fixa alta por `height: auto` + `max-height: min(72dvh, 30rem)`, pro sheet encolher ao conteudo (poucas linhas em vez de ocupar quase a tela). Usada pelo menu da conta no header mobile (`components/HeaderAvatarMenu.tsx`): botao de avatar (`.header-avatar-trigger`, mobile-only, substituiu o antigo sino) que abre um launcher com resumo (`UserAvatar` md a esquerda + coluna nome/cargo, classe `.header-avatar-menu-summary-text`) + linhas Perfil/Usuarios(adm)/Resumo(adm+comercial+cadastro via isVisitReportViewer, feed dos informes de visita)/Metricas(desab. "Em breve")/Sair — cada linha fecha o sheet e navega. **Excecao ao chrome do BASE:** sem titulo verde visivel (`title=""`) — o resumo ja encabeca o menu; o `<h3>` fica vazio mas presente, entao o X segue a direita (header `space-between`) e a altura nao muda; nome acessivel do dialog via `ariaLabel`.
- **Variante `.is-fit-content` (altura por conteudo, teto do BASE):** `className="is-fit-content"` so faz `height: auto` (NAO reduz o `max-height`, que segue o do BASE — ~tela cheia menos 8rem). Diferente da `.is-menu`/`.is-operations` (que apertam o `max-height` pra menus curtos), e pra FORMULARIOS curtos que precisam do teto alto quando crescem: o sheet encolhe ao conteudo (footer logo abaixo do ultimo campo, sem o vao do `flex:1` num form curto) mas rola ate quase a tela se preciso. Usada pelo `NewSampleModal` (Nova Amostra).
- **Variante `.is-operations` (lista de pendencias do dashboard):** compartilha a altura-por-conteudo da `.is-menu`. Usada pelo `OperationModal` ("**Lotes pendentes**", `components/dashboard/OperationModal.tsx`). O chrome (header claro etc.) e o do BASE — aqui sobra so o conteudo: lista (`.app-modal-list` com `max-height`/`overflow` neutralizados pro scroll ficar so no `.bottom-sheet-body`) e **cards no visual do card de Lotes (`.spv2-card*`)** colapsados/inertes, com **botao-seta quadrado de classificar** (`.spv2-card-classify-arrow`) no lugar do chevron. **Recuo lateral no body, nao no sheet:** diferente do BASE (recuo horizontal no `.bottom-sheet`, que NAO recorta), o `.is-operations` zera o padding lateral do sheet e move pra `.bottom-sheet-header` + `.bottom-sheet-body` (var `--ops-inset-x`). Como o body tem `overflow-x: hidden`, encostar os cards na borda dele decepava a `box-shadow` rente ao card (divisao dura card/borda); com o recuo no body, a sombra dissipa DENTRO do padding antes do corte. Mesma largura de card de antes — so muda onde o corte acontece.

**Modais aninhados sobre o sheet:** classes `.is-stacked` no `.app-modal-backdrop` + `.app-modal` elevam pra `var(--z-modal-stacked: 600)` (ex: o confirm "Descartar?" sobre um sheet). _(Sheet SOBRE sheet usa `.bottom-sheet.is-stacked` — ver bullet "stacked" acima. Ex.: `ClientQuickCreateModal` "novo cliente" sobre o `NewSampleModal`, com o "Descartar?" como overlay INTERNO.)_

- **Variante `.is-informe` (formularios de visita/relatorio):** torna o formulario NATIVO do sheet — as secoes `.inf-card` sao achatadas (sem fundo/sombra/borda de card; divisorias suaves entre secoes) e o `.inf-form` ganha padding lateral proprio (o `.bottom-sheet-body` nao tem padding horizontal; sem isso os cards batiam na borda do modal). Usada pelos sheets do prospector (`components/visits/VisitReportFormSheet`) e do comercial (`components/informe/CommercialVisitFormSheet` + `WeeklyReportFormSheet`). Confirm de descarte `.is-stacked` quando ha dados preenchidos (mesmo padrao do NewSampleModal).

**FAB de criar da /samples = LEQUE (speed-dial)** (`SampleCreateRadialFab`, modo `idle`): tap no "+" abre 3 opcoes circulares em ARCO de quarto de circulo — **Lote** (grao de cafe — **mesma silhueta do icone da aba "Lotes"**, `renderNavIcon('samples')` em `AppShell`: elipse inclinada 28° + fenda em S; o traco verde mais grosso vem do `.fab-fan-option-icon`) ACIMA do FAB, **Liga** no DIAGONAL a 45° e **Aprovacao** (prancheta-check, abre o `ApprovalLabelModal`) A ESQUERDA — que emergem dele (classes `.fab-fan-*` + `.is-lote`/`.is-liga`/`.is-aprovacao`; `scale 0.2→1` com `transform-origin` no lado do FAB + stagger varrendo do topo pra esquerda). Cada opcao tem o **rotulo centralizado ABAIXO do icone** (`.fab-fan-option-label` `position: absolute`, fora do fluxo — o botao tem o tamanho do circulo, entao a ancoragem por `right`/`bottom` mira o circulo e o arco fica uniforme independente do comprimento do texto). A pagina escurece com scrim no **tier de modal** (`.fab-fan-backdrop`, `rgba(0,0,0,0.55)` sem blur, `z: var(--z-modal-backdrop)` — ACIMA da tabbar z-70, bloqueia cliques; tap-fora fecha) e o FAB **encolhe + vira circular** com "×" (`.cv2-fab.is-expanded`, `z: var(--z-modal)`). Opcoes ancoradas nas vars `--fab-*`/`--fan-*`/`--fan-radius` de `.samples-page-v2:not(.informe-commercial-page)` (alinham com o FAB sozinhas; Liga usa `--fan-radius * 0.7071` no diagonal). Renomeado "Amostra"→"Lote". O **MESMO leque** (`.fab-fan-*`) e usado pelo `InformeCreateRadialFab` (2 opcoes + icone lapis, ver §"/informe"); o drawer antigo `.fab-menu-*` foi REMOVIDO. Tap-feedback so scale; guard de `prefers-reduced-motion` (so fade).

### Pagina /informe do COMERCIAL (formularios por papel)

- `role === 'COMMERCIAL' || isAdmin` → `components/informe/InformeCommercialPage.tsx` com o shell da `/samples` (`.samples-page-v2` + header + `.hero-search-wrap.is-informe` SEM barra de busca — vira so um respiro verde — + `.samples-page-v2-sheet` com `.spv2-list-meta`/`.spv2-list-scroll`); REGISTRATION segue no placeholder `.informe-placeholder`. **CLASSIFIER/CADASTRO NAO acessam o /informe** (guard `INFORME_ROLES` = ADMIN/COMMERCIAL/REGISTRATION) — eles veem **Métricas** na NAVBAR no lugar do Informe (`isMetricsNavRole`; rota `/metrics`, placeholder "Em construcao" com icone de grao de cafe), e a Metricas SAI do menu do avatar deles (teaser removido)
- **FAB radial de LAPIS** (`InformeCreateRadialFab`): usa o MESMO **leque** (`.fab-fan-*`) da /samples, com 2 opcoes — **Visitas** (prancheta-check) na posicao `is-lote` (acima do FAB) e **Relatório** (calendario) na `is-aprovacao` (esquerda). Diferenca vs /samples: a variante `.cv2-fab.is-informe-fab` mantem o **icone LAPIS** (DOIS svgs empilhados lapis ↔ × em **crossfade**, neutraliza o rotate 45° do "+"). Escurece a tabbar via `body.is-fab-fan-*` (igual /samples). Vars `--fab-*`/`--fan-*` em `.samples-page-v2.informe-commercial-page` (`--fab-right` = right real do FAB do informe, que NAO e reposicionado como o do Lotes). O drawer antigo `.fab-menu-*` foi removido.
- Feed proprio (scope=mine): cards `rsm-*` seguem o **visual do `.spv2-card`** (gradiente branco→`#faf8f4` + sombra leve de 3 camadas do Lotes, tap `scale(0.98)`, SEM hover de cor, SEM barra lateral; chevron verde ao expandir) — por tipo com **badge `.rsm-type-badge`** (`.is-visit` verde / `.is-weekly` azul / `.is-prospect` ambar — pill uppercase no canto direito do `.rsm-card-head`; convive com a lixeira via margin-right em `.has-quick-delete`); lixeira + confirm central; "Carregar mais" (mecanica rsm — o espelhamento da /samples e o shell visual, nao o cursor/sentinel)
- Relatorio semanal: campo read-only `.informe-week-label` ("Semana de DD/MM a DD/MM", espelho client-side `lib/weekly-report.ts`); 409 do servidor abre modal central de aviso `.is-stacked` ("Relatório já enviado", botao unico "Entendi") — regra bloqueante → modal, conforme skill feedback-messages
- `/resumo` consome o mesmo feed (scope=all) e renderiza os 3 tipos: `VisitReportCard typeBadge="Prospecção"`, `CommercialVisitCard` (twin do `VisitReportCard` — mesmo card + curadoria, ver abaixo), `WeeklyReportCard`
- **Curadoria do vinculo (cards de Prospecção E visita comercial no /resumo)**: o formulario do prospector e DECLARACAO sem lookup ("Já é cliente" pede so o nome; "Cliente novo" tambem cidade/telefone, texto livre), entao o card mostra o **nome anotado** ate alguem vincular. Badge `.rsm-client-tag.is-pending-link` ("Aguardando vínculo", paleta ambar do `.is-prospect`) pra todos os viewers via prop `showLinkStatus`; ADM/Cadastro (`isVisitLinkCurator`) ganham acoes `.rsm-link-actions`/`.rsm-link-btn` no detalhe expandido (Vincular cliente; vinculado → Alterar/Remover vínculo `.is-remove` ambar). Cadastrar cliente novo nao e botao do card — vem do estado vazio do lookup no modal (ver abaixo). Modal de vinculo `.app-modal.is-themed.sample-detail-lookup-modal.rsm-link-modal` (portal) com bloco de contexto `.rsm-link-context` (anotado pelo prospector) + `ClientLookupField initialSearch` (sugestoes no primeiro foco) + estado vazio com CTA "Cadastrar e vincular" → `ClientQuickCreateModal` prefilled (PF/vendedor/`initialPhone`) que vincula no `onCreated`. Card vinculado mostra o nome canonico do cadastro + "Anotado na visita"/"Vinculado por" no detalhe. Dashboard do prospector NAO recebe nada disso (props default false). **Visita comercial (2026-06-18):** o `CommercialVisitCard` virou TWIN do `VisitReportCard` (mesmo client-block — cidade/telefone no detalhe expandido, "Aguardando vínculo" abaixo do nome via `.rsm-client-pending`) e adota a MESMA curadoria — PORÉM so quando `clientKind=NEW` (cliente novo, sem vínculo): EXISTING e born-linked pelo lookup do form comercial e NAO e curável (mostra so "Código X", sem ação). Backend espelhado: `linkCommercialVisitClient` (rota `PATCH /commercial-visits/[visitId]/client`; trio `linked_by_user_id`/`linked_at` no `commercial_visit`; rejeita EXISTING com `COMMERCIAL_VISIT_NOT_CURATABLE`). O /resumo generaliza o fluxo de vínculo (tipo `LinkableVisit`) despachando por `item.type`. O card novo (cidade/telefone no expandido) vale tambem no `/informe` do proprio comercial — sem vincular ali (só o visual)

### Modal central (`.app-modal.is-themed`)

> Padrao canonico documentado em detalhe na skill `modals` (`.claude/skills/modals/SKILL.md`). Esta secao e apenas resumo — sempre consultar a skill `modals` ao construir/editar modal.

**Resumo**: backdrop glass + container 38rem (`.is-themed`) ou 46rem (`.is-wide`), header verde brand, body branco, fields `.app-modal-field/.app-modal-input`, actions `[.app-modal-submit, .app-modal-secondary]` na ordem JSX (Submit primeiro). Variante destrutiva `.app-modal-submit.is-danger`. Variante de ACAO `.is-action` (header claro + titulo verde a esquerda + X claro + backdrop escuro sem blur) pra modais centrais que sao form que o usuario opera — ver `modals` §3.

```jsx
<div className="app-modal-backdrop">
  <section className="app-modal is-themed [is-wide]">
    <header className="app-modal-header">
      <div className="app-modal-title-wrap">
        <h3 className="app-modal-title">Titulo</h3>
      </div>
      <button className="app-modal-close" aria-label="Fechar">
        <span aria-hidden="true">×</span>
      </button>
    </header>
    <form className="app-modal-content" onSubmit={...}>
      <label className="app-modal-field">
        <span className="app-modal-label">Campo</span>
        <input className="app-modal-input" />
      </label>
      <div className="app-modal-actions">
        <button type="submit" className="app-modal-submit">Salvar</button>
        <button type="button" className="app-modal-secondary">Cancelar</button>
      </div>
    </form>
  </section>
</div>
```

Animacao de entrada coberta pelos keyframes `app-modal-backdrop-in` (0.3s) e `app-modal-card-in` (0.35s, fade + scale subtil) — nao inventar transicoes proprias.

## 9. Tipografia de Secao

### Hierarquia

| Elemento                       | Tamanho                         | Peso    | Cor                                                                   |
| ------------------------------ | ------------------------------- | ------- | --------------------------------------------------------------------- |
| Titulo de pagina (sobre verde) | `clamp(1.8rem, 7.5vw, 2.5rem)`  | 700     | `#ffffff`                                                             |
| Saudacao/label (sobre verde)   | `clamp(1.1rem, 4.5vw, 1.35rem)` | 400     | `rgba(255,255,255,0.7)`                                               |
| Cargo/meta (sobre verde)       | `clamp(0.72rem, 3vw, 0.82rem)`  | 400     | `rgba(255,255,255,0.5)`                                               |
| Titulo de secao (sobre bege)   | `clamp(18px, 5vw, 20px)`        | 700     | `#1a1a1a`                                                             |
| Subtitulo                      | `clamp(12px, 3.2vw, 13px)`      | 400     | `#999`                                                                |
| Label uppercase                | `clamp(9px, 2.6vw, 10px)`       | 600     | com opacidade, `letter-spacing: 0.8-1px`, `text-transform: uppercase` |
| Corpo de card                  | `clamp(11px, 3vw, 12px)`        | 400-500 | `#555`                                                                |
| Valor numerico destaque        | `clamp(36px, 11vw, 44px)`       | 700     | cor do contexto                                                       |

## 10. Elementos Decorativos

### Graos de cafe (SVG)

- Usados como textura sutil em headers verdes
- Elipse com fenda curva central (sulco do grao):
  ```svg
  <svg viewBox="0 0 20 28">
    <ellipse cx="10" cy="14" rx="8.5" ry="12.5" fill="currentColor" />
    <path d="M10 2.5c-1.8 4-2.2 8-0.5 11.5s1.8 7.5 0.5 11.5" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1.4" stroke-linecap="round" />
  </svg>
  ```
- Cor branca (`color: #ffffff`) com opacidade muito baixa (0.04 a 0.08)
- Distribuicao organica: varios tamanhos e rotacoes, `position: absolute`, `pointer-events: none`
- Quantidade: 6-10 por header, nunca exagerado

### Indicadores de legenda (dots)

- `width/height: clamp(8px, 2.5vw, 10px)`, `border-radius: 50%`
- Animacao pulse: `scale(1) → scale(1.2) opacity(0.7) → scale(1)`, `2s ease-in-out infinite`

## 11. Stacked Bar (barra de distribuicao)

- `height: clamp(8px, 2.5vw, 10px)`, `border-radius: 5px`
- Segmentos proporcionais separados por `gap: clamp(1px, 0.5vw, 2px)`
- Cada segmento tem cor do status e `border-radius: 5px`
- `min-width: clamp(4px, 1.5vw, 6px)` para segmentos pequenos nao sumirem
- Estado vazio: barra unica em `#e8e3d5`

## 12. Alertas Inline

- Fundo: `rgba(cor, 0.03)` (quase transparente)
- `border-top: 1px solid rgba(0,0,0,0.04)`
- Icone de atencao SVG + texto em `font-weight: 600`
- Cor do texto e icone na cor do status (ex: `#C0392B` para alertas criticos)

## 13. Toasts (feedback transiente global)

Para feedback nao-bloqueante vindo de acoes globais (bipador, API, navegacao), usar o sistema de toast em `lib/toast/ToastProvider.tsx`. Nao inventar componentes proprios de notificacao.

### Quando usar toast vs outras opcoes

- **Toast** — acao concluida ou falhou, feedback transiente que nao exige acao do usuario. Ex: "Amostra L-12345 encontrada", "QR nao reconhecido", "Sessao expirada".
- **Alerta inline** (secao 12) — estado persistente de uma area da pagina. Ex: aviso de que uma amostra esta invalidada.
- **Erro dentro do campo** — erro de validacao de formulario. Ex: "Obrigatorio" no input de sacas.
- **Modal de confirmacao** (ver `app-confirm-modal` em globals.css) — acao destrutiva ou navegacao que descarta trabalho nao-salvo.

### API

```tsx
import { useToast } from '@/lib/toast/ToastProvider';

const toast = useToast();
toast.success({ title: 'Amostra criada', description: 'Lote L-12345' });
toast.error({ title: 'Falha ao salvar', description: err.message });
toast.info({ title: 'Amostra ja aberta' });
```

### Posicao

- **Mobile** (< 901px): centro inferior, respeitando `safe-area-inset-bottom`
- **Desktop** (>= 901px): canto inferior direito

### Variantes

- `success` — verde (`--color-success`), icone de check
- `error` — vermelho (`--color-danger`), icone de alerta
- `info` — azul (`--color-info`), icone de info
- Barra lateral de 4px na cor da variante, fundo cream translucido

### Duracao padrao

- 4s auto-dismiss. Para toasts que levam o usuario a outra tela (ex: "abrindo..."), usar `durationMs: 2600`.
- Maximo de 3 visiveis simultaneamente — os mais antigos sao descartados.

### Dirty state e modal de confirmacao

Telas com estado nao-salvo devem se registrar via `useRegisterDirtyState('chave', isDirty, 'motivo')` em `lib/dirty-state/DirtyStateProvider.tsx`. Acoes globais (bipador, navegacao futura) consultam esse registro e mostram `app-confirm-modal` antes de descartar alteracoes.

## Checklist de Design

Ao construir ou revisar qualquer pagina:

- [ ] Fundo verde vem do app-shell (`is-dashboard-route`), header com `background: transparent`
- [ ] Header com `align-items: flex-end` (conteudo na base, proximo ao sheet)
- [ ] Sheet bege com `border-radius: 20px 20px 0 0` criando efeito 3D sobre o verde
- [ ] Cards com sombra 3D (3 camadas + inset)
- [ ] Linha lateral colorida em cards com status
- [ ] Campos com icone, fundo `#f8f6f2`, borda verde ao focar
- [ ] Erros como placeholder dentro do campo
- [ ] Botao primario com gradiente verde, nao muda cor ao clicar
- [ ] Modais como bottom sheet (nunca dropdown no mobile)
- [ ] Cores da paleta documentada (nunca cores inventadas)
- [ ] Skeleton loading no formato do componente final
- [ ] Tipografia seguindo a hierarquia definida
