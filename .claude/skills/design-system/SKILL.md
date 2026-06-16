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

- Fundo quente: `linear-gradient(180deg, #fdf9ec 0%, #f4f0e7 100%)`. **Excecoes aprovadas (fundo claro frio)**: (1) dashboard mobile do ADMIN — `#f4f6f5` no sheet (2026-06-12, `.dashboard-mobile .dashboard-sheet`); (2) pagina de **Lotes `/samples`** — **BRANCO puro `#ffffff`** no sheet **e** nos cards (`.spv2-card-wrap`, sai o gradiente quente), com **sombra reforcada** pra definir as bordas sobre o branco e o recuo lateral redistribuido (pouco no sheet, mais no `.spv2-list-scroll`) pra a sombra nao ser decepada (2026-06-16, escopado `.samples-page-v2:not(.informe-commercial-page)` — NAO afeta o `InformeCommercialPage`/shell reusado nem a `/clients`). O `/samples` e a **UNICA excecao** ao "nunca `#fff` puro" abaixo (a pedido do usuario). As demais paginas (Clientes, Informe, etc.) seguem no bege
- `border-radius: 20px 20px 0 0` — bordas arredondadas no topo criando o efeito 3D sobre o verde
- `padding-bottom` respeita tabbar: `calc(var(--app-safe-area-bottom, env(safe-area-inset-bottom)) + var(--mobile-tabbar-clearance))` — usar a CSS var sincronizada (ver skill `responsive` §4), nunca `env()` direto. **Excecao**: list pages com sheet rolavel (`/samples`, `/clients`) movem o clearance pro container de scroll e deixam o conteudo rolar por tras da tabbar flutuante — ver skill `responsive` §5
- O sheet ocupa o restante da tela com `flex: 1`

### Variante: dashboard mobile do ADMIN (redesign 2026-06, mockup)

Overrides escopados sob `.dashboard-mobile` em `app/globals.css` (bloco "Dashboard mobile (admin) — redesign 2026-06") — as classes base sao compartilhadas com o prospector, que MANTEM o design anterior. Componentes: `DashboardMobile.tsx`, `SalesAvailabilityCard.tsx`, `RecentActivityListMobile.tsx` (os 2 ultimos exclusivos do admin mobile; estilos editados direto).

- **Hero**: saudacao grande em 2 linhas (label `clamp(1.25-1.5rem)` w400; nome `clamp(2.3-3rem)` **w700**) + papel com escudo `#7eccae`; verde liso vindo do shell (sem textura no proprio `.dashboard-hero`, continuo com a area da busca — sem emenda na borda de baixo do hero); avatar do menu (`.header-avatar-trigger .user-avatar`) translucido `rgba(255,255,255,0.18)` com iniciais brancas (`!important` por causa do backgroundColor inline do UserAvatar)
- **Busca**: pill branca solida radius 999px, input mais alto, inteira sobre a area verde. Lupa segue A DIREITA (diverge do mockup de proposito: o botao vira o CTA verde de submit no estado `.has-input` — move-lo quebraria a interacao). Estruturalmente ela NAO vive no hero: e um irmao no fluxo do `.dashboard-scroll`, entre o hero e o sheet (ver scroll abaixo)
- **Scroll simples da pagina** (so o admin mobile): hero (saudacao + avatar) e sheet vivem dentro do `.dashboard-scroll` (`flex: 1; min-height: 0; overflow-y: auto`, momentum + `overscroll-behavior: contain`) e **rolam juntos** — nada fica fixo no topo. O sheet fica no fluxo normal (`.dashboard-sheet` `overflow: visible; flex: 1 0 auto` pra preencher a tela quando o conteudo e curto). O `.dashboard-page` continua `overflow: hidden; height: 100%` (so o `.dashboard-scroll` rola). _(A **busca por lote** no hero do admin mobile foi REMOVIDA a pedido do usuario em 2026-06-16 — o `SampleSearchField` saiu do `DashboardMobile`; as classes `.dashboard-hero-search`/CSS seguem em uso pelo prospector (busca por cliente, ver abaixo). Antes disso ja se removera o efeito antigo "cobrir a busca" — busca sticky + sheet por cima + recorte arredondado — em 2026-06-15.)_
- **Cards de pendencias** (sem heading "Operacoes"): labels **"Lotes" / "Clientes"** (dados seguem sendo classificacao pendente e cadastros incompletos); card branco flat radius 18px; icon-wrap rounded-square `#e8f1ec` com glifo SOLIDO `#1f5d43` (fenda do grao em stroke claro `#e8f1ec` inline no markup); titulo `#1a1a1a` w700 + subtitulo `#8a8f8c` empilhados (sem divider/chevron). Numero em CHIP verde `#e8f1ec`/`#1f5d43` **flutuando no canto superior direito** (`position: absolute`, `top` negativo popando pra fora da borda de cima, anel branco 2px + sombra suave), ancorado no card (`.dashboard-operation-card` e `position: relative`) — sai do fluxo pra o titulo+subtitulo ocuparem a largura TODA do card sem cortar "Pendentes" (era CHIP inline estatico que comprimia o texto). Pulsacao (`badge-pulse-soft`, scale 1.13, 2s — keyframe proprio do mobile, perto do `badge-pulse` 1.15 do desktop; a regra mobile sobrescreve o `animation: none` antigo), some quando 0. Identidade verde uniforme nos 2 cards (decisao do usuario — sai o ambar semantico)
- **Lotes disponiveis** (`.sales-card`): card BRANCO radius 20px (sai o gradiente verde escuro); header = titulo escuro (sem icone-cubo — decisao do usuario) + botao decorativo trending-up (`.sales-card-chart-icon`, `#eef5f1` borda verde); donut com track `#edf0ee`, **fresta de 2 unidades entre segmentos** quando 2+ tem valor, total central `#14532d` (o tamanho do numero **encolhe conforme a qtd de digitos** — atributo `fontSize` no componente, nao no CSS — pra caber confortavel no furo do donut com 3-4 algarismos); legenda com labels `#4a5550`, counts `#1a1a1a` w700, dividers `rgba(0,0,0,0.08)`; botao "Ver disponíveis" **full-width** pill verde-escura com label centrada e chevron na borda direita
- **Ultimas atividades**: header so com titulo `#1a1a1a` (sem icone e sem "Ver todas" — decisoes do usuario); icone COLORIDO por acao — glifo na cor da acao sobre circulo no mesmo tom clarinho, `color`/`bg` vindos inline de `EVENT_CONFIG[type]` em `lib/dashboard-activity.ts` (mesma fonte do rotulo do desktop). Cores canonicas: venda=verde `#27ae60`, perda=vermelho `#c0392b`, envio=ambar `#e5a100` (os 3 = paleta do grafico de "Lotes disponiveis"), registro=azul `#3a6ea3`, venda/perda cancelada=cinza `#6b7280`. Subtitulo cinza; altura fixa 400px + scroll interno

### Paginas sem header verde

- Paginas como settings, detalhes de amostra podem usar header mais compacto
- Manter a cor de fundo quente `#fdf9ec` como base, nunca branco puro frio (#fff) como background de pagina (**excecao unica: `/samples`** — ver §1, Sheet de Conteudo)
- Excecao: areas de formulario/cards internos podem usar `#ffffff`

### Variante: dashboard do PROSPECTOR (app restrito)

- `/dashboard` renderiza `components/dashboard/prospector/ProspectorDashboard.tsx` quando `isProspector(role)` — **layout unico responsivo** (sem par mobile/desktop): reusa `.dashboard-page/.dashboard-hero/.dashboard-sheet` do dashboard mobile; o bloco `@media (min-width: 901px)` replica hero/sheet sob `.prospector-dashboard` com cap de largura (46rem)
- Hero de saudacao com **busca por nome de cliente** no lugar da busca de lote (mesmas classes visuais `dashboard-hero-search`/`sample-search-field`; filtra ao digitar com debounce 250ms a partir da 2a letra — server-side, o total acompanha); 2 cards de contagem `dashboard-operation-card is-wide is-static` ("Visitas / Hoje" e "Clientes novos / Hoje", SEMPRE do usuario logado; nao clicaveis: `cursor: default`, sem `:active`, badge sempre visivel e sem pulse; identidade verde brand via `.prospector-dashboard .dashboard-operation-icon-wrap` — sem modificador `.dashboard-op-*` o icone fica sem stroke)
- Lista "Ultimos informes": mostra os informes de **todos os prospectores** (comparacao da equipe; escopo no backend), com contador `.prospector-list-meta`+`.spv2-list-count` no canto esquerdo acima dos cards (segue o filtro de busca) e cards `rsm-*` compartilhados (`components/visits/VisitReportCard.tsx`). **Scroll interno** so na area da lista (`.prospector-list-scroll`; hero/busca/cards de contagem sempre visiveis — o `.dashboard-sheet` do prospector vira `overflow: hidden` e o clearance do botao "+" migra pro fim da lista). Lixeira `.rsm-card-quick-delete` so nos informes do PROPRIO usuario (prop `quickDelete` do card; confirm central via portal; exclusao por autor no backend)
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

**Padrao amostras / cards detalhados** (`sdv-commercial-list-row`, `sdv-unit-card-mini`, `cv2-card.is-incomplete`):

- `::before` com `position: absolute`, `left: 0`, `top: 0`, `bottom: 0` (cobre toda a borda)
- `width: clamp(6px, 0.7vw, 8px)`, sem `border-radius` (corner segue o do card via `overflow: hidden`)
- Cor via `--card-status-color` ou gradient (`linear-gradient(180deg, ...)`)

### Interacao

> Pattern completo de tap feedback documentado na skill **`button-press-effect`** — esta secao e apenas resumo.

- `:active` usa `transform: scale(0.95-0.99)` + sombra reduzida
- Nunca mudar cor de fundo ao clicar (excecao: filter chips em listagens — ver §7)
- `-webkit-tap-highlight-color: transparent`

### Skeleton loading

- Formato identico ao card final (mesma altura, mesmo radius, mesma cor de fundo neutra)
- Pode usar **shimmer suave** (`background-size: 200% 100%` + `linear-gradient` em movimento, `~1.4s ease-in-out infinite`) combinado com fade-in `cubic-bezier(0.22, 1, 0.36, 1)` na entrada
- Exemplo em uso: `.sdv-commercial-skeleton-row` (ver `app/globals.css`)
- Skeleton e para **cards/secoes especificas** dentro de uma pagina ja carregada. Para a **pagina inteira** ainda nao pronta, usar o loader da marca (abaixo), nunca um texto "Carregando..."

### Loader de pagina lenta (branded)

- Quando **uma pagina inteira** demora (sessao/auth ou dados), aparece o visual da marca (logo + barra + bolinhas) — o mesmo do splash de boot — em vez de texto verde.
- Componente reusavel: `components/SplashVisual.tsx` (variante `pageLoader`); `SplashScreen` (boot) e o loader de pagina compartilham esse visual.
- Arquitetura: `LoadingProvider` (`app/layout.tsx`, em volta do `PageTransition`) conta fontes de carregamento e so mostra o overlay apos ~480ms (loads rapidos nao piscam), portado ao `body`, z-index 99998 (abaixo do splash de boot 99999, pra handoff sem glitch no startup).
- Registrar uma fase async lenta: hook `useGlobalLoading(active)` (`lib/loading/loading-context.ts`). Ja vem ligado no `useRequireAuth` (cobre auth de toda pagina autenticada); paginas de detalhe ligam tambem o load dos dados (`useGlobalLoading(loadingDetail)`).

### Variantes de card especificas

| Classe                      | Uso                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.sdv-card`                 | Card branco padrao (sombra 3D, radius 18px) — base para detalhe de cliente/amostra                              |
| `.sdv-card-themed`          | Card com header verde (gradient `--brand-green`) + body branco — Informacoes / Endereco / Filiais               |
| `.sdv-card-commercial-mini` | Mini-card-filtro (Em aberto/Vendido/Perdido/Comprado), modificadores `is-open\|sold\|lost\|bought\|active\|dim` |
| `.sdv-commercial-list-row`  | Linha de lista detalhada com barra lateral colorida via `--card-status-color`                                   |
| `.sdv-unit-card-mini`       | Card minimalista de filial — barra lateral verde (completo) / amber (incompleto) / cinza (inativo)              |
| `.cv2-card`                 | Card de cliente na listagem `/clients` — barra lateral amber via `::before` quando `.is-incomplete`             |

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

- Em listagens (`/clients`, `/samples`, `/users`), **filter chips/botoes em estado `.is-active`** podem usar verde solid (`linear-gradient(135deg, var(--brand-green), var(--brand-green-soft))` com SVG branco) para sinalizar acao em uso. Exemplo: `.sdv-card-commercial-mini.is-active`, `.hero-search-filter-btn` em `/samples`.
- A excecao se aplica **apenas ao estado persistente de "filtro ativo"** — nunca ao `:active` transitorio do clique.

### Campos de filtro multi-select (chips dentro do campo)

- No modal de filtros de `/samples`, campos de selecao multipla usam o box `.samples-filter-multi`: os itens selecionados viram chips (`.samples-filter-token`) **dentro** do box, nunca abaixo do campo. Duas variantes: `--lookup` (typeahead `ClientLookupField` borderless ocupando a linha abaixo dos chips — Proprietario/Comprador/Enviado para) e `--select` (box clicavel + chevron que abre `.samples-filter-multi-dropdown` com checklist — campos de classificacao via `ClassificationFilterField`: Padrao/Aspecto/Catacao/Certificado). As opcoes de classificacao vem de valores distintos canonicos do backend (`GET /samples/classification-values?field=padrao|aspecto|catacao|certif`).

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
- Overlay (**padrao de ACAO**): `rgba(0, 0, 0, 0.55)` **SEM blur** — a pagina de tras fica VISIVEL, so escurecida; fecha ao clicar (passa por `onDismissAttempt`). _(Excecao: `.camera-preview-sheet` nao e modal de acao e restaura o blur antigo `rgba(0,0,0,0.4)` + `blur(16px)` via `:has()`.)_
- **Chrome = padrao de ACAO** (canonico desde 2026-06; antes scoped em `.is-operations`, agora e o BASE de TODOS os bottom sheets): **header BRANCO** (`background: transparent` = fundo do sheet, sem faixa verde, `justify-content: space-between`, colado no topo); **titulo VERDE** `var(--brand-green)` alinhado a **esquerda**; **X quadrado-arredondado claro** (`#eef1ee` / glifo `#4a5751`) NO FLUXO do header (`position: static`) — saiu o circulo translucido `absolute`; **drag handle transparente** e compacto com **barra cinza** `rgba(20, 50, 25, 0.18)`. _(Excecao: `.camera-preview-sheet` restaura header verde edge-to-edge + titulo claro centrado.)_
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
- **Conteudo congelado no close:** ao fechar (`open=false`), o sheet fica montado por `ANIMATION_MS` (460ms) pro slide-down e renderiza um **snapshot do ultimo estado aberto** (children/title/footer/className/ariaLabel). Se o consumidor recomputar os props pro proximo estado durante o close (ex: trocar `flowState`), o conteudo e a altura **nao** mudam no meio da saida — evita o sheet "crescer + trocar de body" enquanto desce. Durante o close o `.bottom-sheet` fica `pointer-events: none` (sem clique fantasma no footer congelado). Snapshot gravado via layout-effect; ao reabrir volta aos props ao vivo.
- **Variante `.is-menu` (altura por conteudo):** `className="is-menu"` troca a altura fixa alta por `height: auto` + `max-height: min(72dvh, 30rem)`, pro sheet encolher ao conteudo (poucas linhas em vez de ocupar quase a tela). Usada pelo menu da conta no header mobile (`components/HeaderAvatarMenu.tsx`): botao de avatar (`.header-avatar-trigger`, mobile-only, substituiu o antigo sino) que abre um launcher com resumo (`UserAvatar` md a esquerda + coluna nome/cargo, classe `.header-avatar-menu-summary-text`) + linhas Perfil/Usuarios(adm)/Resumo(adm+comercial+cadastro via isVisitReportViewer, feed dos informes de visita)/Metricas(desab. "Em breve")/Sair — cada linha fecha o sheet e navega. **Excecao ao chrome do BASE:** sem titulo verde visivel (`title=""`) — o resumo ja encabeca o menu; o `<h3>` fica vazio mas presente, entao o X segue a direita (header `space-between`) e a altura nao muda; nome acessivel do dialog via `ariaLabel`.
- **Variante `.is-operations` (lista de pendencias do dashboard):** compartilha a altura-por-conteudo da `.is-menu`. Usada pelo `OperationModal` ("**Lotes pendentes**", `components/dashboard/OperationModal.tsx`). O chrome (header claro etc.) e o do BASE — aqui sobra so o conteudo: lista (`.app-modal-list` com `max-height`/`overflow` neutralizados pro scroll ficar so no `.bottom-sheet-body`) e **cards no visual do card de Lotes (`.spv2-card*`)** colapsados/inertes, com **botao-seta quadrado de classificar** (`.spv2-card-classify-arrow`) no lugar do chevron. **Recuo lateral no body, nao no sheet:** diferente do BASE (recuo horizontal no `.bottom-sheet`, que NAO recorta), o `.is-operations` zera o padding lateral do sheet e move pra `.bottom-sheet-header` + `.bottom-sheet-body` (var `--ops-inset-x`). Como o body tem `overflow-x: hidden`, encostar os cards na borda dele decepava a `box-shadow` rente ao card (divisao dura card/borda); com o recuo no body, a sombra dissipa DENTRO do padding antes do corte. Mesma largura de card de antes — so muda onde o corte acontece.

**Modais aninhados sobre o sheet:** classes `.is-stacked` no `.app-modal-backdrop` + `.app-modal` elevam pra `var(--z-modal-stacked: 600)` (ex: cliente quick-create dentro do form, modal "Descartar?").

- **Variante `.is-informe` (formularios de visita/relatorio):** torna o formulario NATIVO do sheet — as secoes `.inf-card` sao achatadas (sem fundo/sombra/borda de card; divisorias suaves entre secoes) e o `.inf-form` ganha padding lateral proprio (o `.bottom-sheet-body` nao tem padding horizontal; sem isso os cards batiam na borda do modal). Usada pelos sheets do prospector (`components/visits/VisitReportFormSheet`) e do comercial (`components/informe/CommercialVisitFormSheet` + `WeeklyReportFormSheet`). Confirm de descarte `.is-stacked` quando ha dados preenchidos (mesmo padrao do NewSampleModal).

### Pagina /informe do COMERCIAL (formularios por papel)

- `role === 'COMMERCIAL' || isAdmin` → `components/informe/InformeCommercialPage.tsx` com o shell da `/samples` (`.samples-page-v2` + header + `.hero-search-wrap.is-informe` SEM barra de busca — vira so um respiro verde — + `.samples-page-v2-sheet` com `.spv2-list-meta`/`.spv2-list-scroll`); demais papeis nao-comerciais seguem no placeholder `.informe-placeholder`
- **FAB radial de LAPIS** (`InformeCreateRadialFab`, copy-adapt do SampleCreateRadialFab — comentario cruzado): variante `.cv2-fab.is-informe-fab` com DOIS svgs empilhados (lapis ↔ ×) em **crossfade** (grid-area 1/1; neutraliza o rotate 45° herdado do `.is-expanded`); opcoes do drawer "Visitas" (prancheta-check) e "Relatório" (calendario) nas classes `fab-menu-*`
- Feed proprio (scope=mine): cards `rsm-*` por tipo com **badge `.rsm-type-badge`** (`.is-visit` verde / `.is-weekly` azul / `.is-prospect` ambar — pill uppercase no canto direito do `.rsm-card-head`; convive com a lixeira via margin-right em `.has-quick-delete`); lixeira + confirm central; "Carregar mais" (mecanica rsm — o espelhamento da /samples e o shell visual, nao o cursor/sentinel)
- Relatorio semanal: campo read-only `.informe-week-label` ("Semana de DD/MM a DD/MM", espelho client-side `lib/weekly-report.ts`); 409 do servidor abre modal central de aviso `.is-stacked` ("Relatório já enviado", botao unico "Entendi") — regra bloqueante → modal, conforme skill feedback-messages
- `/resumo` consome o mesmo feed (scope=all) e renderiza os 3 tipos: `VisitReportCard typeBadge="Prospecção"`, `CommercialVisitCard`, `WeeklyReportCard`
- **Curadoria do vinculo (so cards de Prospecção no /resumo)**: o formulario do prospector e DECLARACAO sem lookup ("Já é cliente" pede so o nome; "Cliente novo" tambem cidade/telefone, texto livre), entao o card mostra o **nome anotado** ate alguem vincular. Badge `.rsm-client-tag.is-pending-link` ("Aguardando vínculo", paleta ambar do `.is-prospect`) pra todos os viewers via prop `showLinkStatus`; ADM/Cadastro (`isVisitLinkCurator`) ganham acoes `.rsm-link-actions`/`.rsm-link-btn` no detalhe expandido (Vincular cliente; vinculado → Alterar/Remover vínculo `.is-remove` ambar). Cadastrar cliente novo nao e botao do card — vem do estado vazio do lookup no modal (ver abaixo). Modal de vinculo `.app-modal.is-themed.sample-detail-lookup-modal.rsm-link-modal` (portal) com bloco de contexto `.rsm-link-context` (anotado pelo prospector) + `ClientLookupField initialSearch` (sugestoes no primeiro foco) + estado vazio com CTA "Cadastrar e vincular" → `ClientQuickCreateModal` prefilled (PF/vendedor/`initialPhone`) que vincula no `onCreated`. Card vinculado mostra o nome canonico do cadastro + "Anotado na visita"/"Vinculado por" no detalhe. Dashboard do prospector NAO recebe nada disso (props default false)

### Modal central (`.app-modal.is-themed`)

> Padrao canonico documentado em detalhe na skill `modals` (`.claude/skills/modals/SKILL.md`). Esta secao e apenas resumo — sempre consultar a skill `modals` ao construir/editar modal.

**Resumo**: backdrop glass + container 38rem (`.is-themed`) ou 46rem (`.is-wide`), header verde brand, body branco, fields `.app-modal-field/.app-modal-input`, actions `[.app-modal-submit, .app-modal-secondary]` na ordem JSX (Submit primeiro). Variante destrutiva `.app-modal-submit.is-danger`.

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
