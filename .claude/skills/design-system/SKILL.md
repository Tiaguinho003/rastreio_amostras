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
- `padding-bottom` respeita tabbar: `calc(env(safe-area-inset-bottom) + var(--mobile-tabbar-clearance))`
- O sheet ocupa o restante da tela com `flex: 1`

### Paginas sem header verde
- Paginas como settings, detalhes de amostra podem usar header mais compacto
- Manter a cor de fundo quente `#fdf9ec` como base, nunca branco puro frio (#fff) como background de pagina
- Excecao: areas de formulario/cards internos podem usar `#ffffff`

## 2. Paleta de Cores

### Marca (verdes)
| Uso | Cor | Onde |
|-----|-----|------|
| Status bar / base | `#1f5d43` | Topo de toda pagina, `theme-color` |
| Gradiente header inicio | `#1f5d43` | Primeiro ponto do gradiente |
| Gradiente header meio | `#1B5E20`, `#2E7D32` | Pontos intermediarios |
| Gradiente header fim | `#388E3C` | Ultimo ponto (mais claro) |
| Acento interativo | `#2E7D32` | Borda de campo focado, links |
| Avatar fundo | `#2a6b45` | Circulo de iniciais do usuario |

### Superficies
| Uso | Cor |
|-----|-----|
| Fundo pagina (quente) | `#fdf9ec` → `#f4f0e7` |
| Fundo card | `linear-gradient(180deg, #ffffff 0%, #f9f7f2 100%)` |
| Fundo campo repouso | `#f8f6f2` |
| Fundo campo focado | `#ffffff` |
| Divider / separador | `#d9d3be` |
| Skeleton loading | `#e8e3d5`, `#e0dbd0` |

### Texto
| Uso | Cor |
|-----|-----|
| Primario | `#1a1a1a` |
| Secundario | `#555` |
| Terciario / muted | `#999` |
| Sobre verde (titulo) | `#ffffff` |
| Sobre verde (subtitulo) | `rgba(255,255,255,0.5)` a `rgba(255,255,255,0.7)` |
| Placeholder | `rgba(0,0,0,0.18)` |

### Status (pendencias, alertas)
| Status | Cor | Uso |
|--------|-----|-----|
| Impressao pendente | `#C0392B` | Cards, badges, alertas |
| Classificacao pendente | `#D4A017` | Cards, badges |
| Em andamento | `#2980B9` | Cards, badges |
| Disponivel / sucesso | `#27AE60` | Barras, indicadores |
| Alerta (> 15 dias) | `#E67E22` | Barras de distribuicao |
| Erro em campo | `#c45c5c` | Placeholder de erro (nunca vermelho saturado) |

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
- Usar `::before` com `position: absolute`, `left: 0`, `top: 20%`, `bottom: 20%`
- `width: 3px`, `border-radius: 0 3px 3px 0`
- Cor corresponde ao status do item

### Interacao
- `:active` usa `transform: scale(0.95)` + sombra reduzida
- Nunca mudar cor de fundo ao clicar
- `-webkit-tap-highlight-color: transparent`

### Skeleton loading
- Formato identico ao card final, com blocos em `#e8e3d5` e `#e0dbd0`
- Sem animacao de shimmer (manter estatico)

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
| Estado | Fundo | Borda | Extras |
|--------|-------|-------|--------|
| Repouso | `#f8f6f2` | `1.5px solid rgba(0,0,0,0.06)` | — |
| Focado | `#ffffff` | `1.5px solid #2E7D32` | `box-shadow: 0 0 0 3px rgba(46,125,50,0.08)` |
| Erro | `#f8f6f2` | `1.5px solid rgba(196,92,92,0.4)` | Placeholder em `#c45c5c` |

### Transicao
- `transition: background 0.25s, border-color 0.25s, box-shadow 0.25s`

### Icone do campo
- Tamanho: `clamp(18px, 5vw, 20px)`
- `stroke: #888`, `stroke-width: 1.6`
- `margin-right: clamp(10px, 3vw, 12px)`

## 7. Botoes

### Botao Primario (acao principal)
```
background: linear-gradient(135deg, #1B5E20, #2E7D32);
color: #ffffff;
border-radius: clamp(12px, 3.5vw, 14px);
padding: clamp(14px, 4vw, 16px);
font-weight: 600;
box-shadow: 0 4px 24px rgba(27, 94, 32, 0.3);
```
- Full-width quando e a acao principal da pagina
- Reforcar `background` em TODOS os estados (:hover, :focus, :focus-visible, :active, :disabled)
- `:active` = `scale(0.96)` + sombra reduzida
- `:disabled` = `opacity: 0.65`

### Botao Secundario (acoes menores)
- `background: transparent` ou `rgba(cor, 0.08)`
- Texto na cor da acao
- `:active` = `scale(0.95)` ou `opacity: 0.7`

### Regras universais de botao
- NUNCA ficar verde ao clicar (ja definido na skill responsive)
- Sempre `-webkit-tap-highlight-color: transparent`
- Sempre `outline: none` ou outline neutro

## 8. Modais e Bottom Sheets

### Bottom Sheet (padrao mobile)
- Sobe de baixo com `transform: translateY(100%)` → `translateY(0)`
- `transition: 0.5s cubic-bezier(0.16, 1, 0.3, 1)`
- Overlay: `rgba(0,0,0,0.45)`, fecha ao clicar
- Drag handle no topo: barra `clamp(30px, 9vw, 36px)` x `4px`, `border-radius: 2px`, cor `rgba(0,0,0,0.08)` ou `#c5bfa8`
- Swipe down para fechar (threshold 60px)
- Fundo: `#fdf9ec` (creme quente, nao branco puro)
- `border-radius` arredondado no topo: `clamp(18px, 5vw, 24px)`
- `max-height: 85dvh`
- Escape fecha, scroll interno com `-webkit-overflow-scrolling: touch`

### Animacao de entrada
- Montar no DOM → esperar 2 frames (`requestAnimationFrame` duplo) → aplicar classe `is-open`
- Isso garante que o browser renderize o estado inicial antes de animar

## 9. Tipografia de Secao

### Hierarquia
| Elemento | Tamanho | Peso | Cor |
|----------|---------|------|-----|
| Titulo de pagina (sobre verde) | `clamp(1.8rem, 7.5vw, 2.5rem)` | 700 | `#ffffff` |
| Saudacao/label (sobre verde) | `clamp(1.1rem, 4.5vw, 1.35rem)` | 400 | `rgba(255,255,255,0.7)` |
| Cargo/meta (sobre verde) | `clamp(0.72rem, 3vw, 0.82rem)` | 400 | `rgba(255,255,255,0.5)` |
| Titulo de secao (sobre bege) | `clamp(18px, 5vw, 20px)` | 700 | `#1a1a1a` |
| Subtitulo | `clamp(12px, 3.2vw, 13px)` | 400 | `#999` |
| Label uppercase | `clamp(9px, 2.6vw, 10px)` | 600 | com opacidade, `letter-spacing: 0.8-1px`, `text-transform: uppercase` |
| Corpo de card | `clamp(11px, 3vw, 12px)` | 400-500 | `#555` |
| Valor numerico destaque | `clamp(36px, 11vw, 44px)` | 700 | cor do contexto |

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
