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

- Fundo quente: `linear-gradient(180deg, #fdf9ec 0%, #f4f0e7 100%)`
- `border-radius: 20px 20px 0 0` — bordas arredondadas no topo criando o efeito 3D sobre o verde
- `padding-bottom` respeita tabbar: `calc(var(--app-safe-area-bottom, env(safe-area-inset-bottom)) + var(--mobile-tabbar-clearance))` — usar a CSS var sincronizada (ver skill `responsive` §4), nunca `env()` direto. **Excecao**: list pages com sheet rolavel (`/samples`, `/clients`) movem o clearance pro container de scroll e deixam o conteudo rolar por tras da tabbar flutuante — ver skill `responsive` §5
- O sheet ocupa o restante da tela com `flex: 1`

### Paginas sem header verde

- Paginas como settings, detalhes de amostra podem usar header mais compacto
- Manter a cor de fundo quente `#fdf9ec` como base, nunca branco puro frio (#fff) como background de pagina
- Excecao: areas de formulario/cards internos podem usar `#ffffff`

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
- Transition: `0.35s cubic-bezier(0.16, 1, 0.3, 1)`
- Overlay: `rgba(0, 0, 0, 0.4)` com `backdrop-filter: blur(16px) saturate(1.05)`, fecha ao clicar (passa por `onDismissAttempt`)
- Drag handle: barra `clamp(2.4rem, 11vw, 3.2rem)` x `4px`, cor `var(--color-line)`
- Swipe down para fechar (threshold 60px); pausa se `dragDisabled=true` ou se target tem scroll
- Fundo: `var(--brand-cream-soft)`
- `border-radius` topo: `clamp(20px, 5vw, 28px)`
- `max-height: 98dvh` (fallback `calc(100vh - 2vh - env(safe-area-inset-top))` em iOS Safari < 15.4)
- Body flex com `min-height: 0` + `overflow-y: auto` (crítico pra teclado virtual)
- Footer sticky bottom (nao fixed) — acompanha scroll-into-view
- ESC dispara `onDismissAttempt`; back Android via `history.pushState` + `popstate` listener
- Focus trap via `useFocusTrap`; `role="dialog"` + `aria-modal="true"`
- `translate3d` permanente: GPU layer; previne scroll lock iOS standalone PWA
- **Conteudo congelado no close:** ao fechar (`open=false`), o sheet fica montado por `ANIMATION_MS` (350ms) pro slide-down e renderiza um **snapshot do ultimo estado aberto** (children/title/footer/className/ariaLabel). Se o consumidor recomputar os props pro proximo estado durante o close (ex: trocar `flowState`), o conteudo e a altura **nao** mudam no meio da saida — evita o sheet "crescer + trocar de body" enquanto desce. Durante o close o `.bottom-sheet` fica `pointer-events: none` (sem clique fantasma no footer congelado). Snapshot gravado via layout-effect; ao reabrir volta aos props ao vivo.
- **Variante `.is-menu` (altura por conteudo):** `className="is-menu"` troca a altura fixa alta por `height: auto` + `max-height: min(72dvh, 30rem)`, pro sheet encolher ao conteudo (poucas linhas em vez de ocupar quase a tela). Usada pelo menu da conta no header mobile (`components/HeaderAvatarMenu.tsx`): botao de avatar (`.header-avatar-trigger`, mobile-only, substituiu o antigo sino) que abre um launcher com resumo (nome+cargo) + linhas Perfil/Usuarios(adm)/Metricas(desab. "Em breve")/Sair — cada linha fecha o sheet e navega.

**Modais aninhados sobre o sheet:** classes `.is-stacked` no `.app-modal-backdrop` + `.app-modal` elevam pra `var(--z-modal-stacked: 600)` (ex: cliente quick-create dentro do form, modal "Descartar?").

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
