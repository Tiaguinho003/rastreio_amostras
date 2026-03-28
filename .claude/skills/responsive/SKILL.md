---
name: responsive
description: Use this skill whenever building, adjusting, or reviewing any page, component, or layout in this PWA. Ensures full responsiveness across all mobile devices.
---

# Responsividade Total para PWA Mobile

Este projeto e uma PWA mobile-first. Toda pagina, componente ou ajuste de layout DEVE se adaptar proporcionalmente a qualquer tamanho de tela. O usuario pode estar em um iPhone SE (320px), iPhone 14 (390px), iPhone 17 Pro (430px), ou qualquer outro dispositivo. As proporcoes visuais devem ser identicas em todos.

## Regras obrigatorias

### 1. Nunca usar valores fixos em px para dimensoes de layout

Valores fixos em px quebram a proporcionalidade entre telas diferentes. Use sempre unidades relativas:

- **Fontes**: `clamp(min, preferred, max)` com `vw` como valor preferido
  - Exemplo: `font-size: clamp(0.85rem, 3.5vw, 1.1rem)`
- **Espacamentos (padding, margin, gap)**: `clamp()` ou `dvh`/`vw`
  - Exemplo: `padding: clamp(0.8rem, 3vw, 1.4rem)`
  - Exemplo: `gap: 2dvh`
- **Larguras**: `%`, `vw`, `min()`, `clamp()` - nunca `width: 350px`
  - Exemplo: `width: min(90vw, 24rem)`
- **Alturas de containers**: `dvh`, `%`, `min()` - nunca `height: 600px`
  - Exemplo: `height: 100dvh`, `min-height: 45dvh`
- **Border-radius**: `clamp()` para raios grandes
  - Exemplo: `border-radius: clamp(14px, 4vw, 20px)`

**Excecoes permitidas para px**: `border-width`, `outline`, `box-shadow`, valores muito pequenos (1-3px) que nao afetam proporcionalidade.

### 2. Unidades recomendadas por contexto

| Contexto | Unidades | Exemplo |
|----------|----------|---------|
| Font size | `clamp(rem, vw, rem)` | `clamp(0.9rem, 3.5vw, 1.2rem)` |
| Padding/margin horizontal | `clamp(rem, vw, rem)` | `clamp(0.8rem, 4vw, 1.5rem)` |
| Padding/margin vertical | `clamp(rem, dvh, rem)` ou `dvh` | `clamp(1rem, 3dvh, 1.8rem)` |
| Gap | `clamp()` ou `vw`/`dvh` | `gap: clamp(0.6rem, 2.5vw, 1rem)` |
| Largura de componentes | `min()`, `%`, `vw` | `width: min(100%, 28rem)` |
| Altura de secoes | `dvh`, `%` | `min-height: 35dvh` |
| Icones e imagens | `clamp()` | `width: clamp(1.2rem, 5vw, 1.8rem)` |

### 3. Layout com Flexbox e Grid

- Use `flex: 1` e `min-height: 0` para que containers flexiveis ocupem o espaco disponivel sem estourar
- Use `overflow: hidden` em containers pai quando o conteudo nao deve ultrapassar limites
- Nunca defina `height` fixo em px para containers que devem crescer/encolher

### 4. Safe Area (iOS)

Toda pagina deve respeitar as safe areas do dispositivo:

- **Topo (status bar/notch)**: `env(safe-area-inset-top)`
- **Base (home indicator)**: `env(safe-area-inset-bottom)`
- Sempre somar com o padding do conteudo: `padding-top: calc(env(safe-area-inset-top) + 1rem)`

### 5. Tabbar e conteudo

- O conteudo NUNCA deve ficar atras da tabbar de navegacao
- Usar `var(--mobile-tabbar-clearance)` para garantir espaco
- Exemplo: `padding-bottom: calc(env(safe-area-inset-bottom) + var(--mobile-tabbar-clearance))`

### 6. Status bar integrada

- A regiao do status bar do iOS deve ter a mesma cor do topo da pagina
- Classe `.mobile-edge-shell-auth` ja possui `::after` cobrindo `env(safe-area-inset-top)` com `#1f5d43`
- Qualquer nova pagina autenticada deve usar `mobile-edge-shell-auth` para herdar esse comportamento
- O `themeColor` do app e `#1f5d43` - todas as superficies verdes do topo devem usar essa cor

### 7. Textos e conteudo

- Textos longos: `word-break: break-word` quando necessario
- Truncamento: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` para textos em cards
- Nunca permitir que texto empurre containers para fora da tela

### 8. Mensagens de erro dentro do campo

- Por padrao, mensagens de erro devem aparecer **dentro** do proprio campo de input, nao abaixo dele
- O erro fica posicionado com `position: absolute` dentro do container do campo
- O erro NUNCA sobrepoe texto digitado — ao exibir o erro, o valor do input e limpo primeiro
- O placeholder fica transparente enquanto o erro esta visivel (`.has-error input::placeholder`)
- Cor do erro: vermelho suave (ex: `#c45c5c`), nunca vermelho forte/saturado
- O erro nao deve causar deslocamento de layout — ele ocupa o mesmo espaco do input
- **Regras de dismissal do erro:**
  - Auto-dismiss apos **8 segundos** se nenhuma acao acontecer
  - Some ao clicar em qualquer elemento interativo (botao, link, input, select)
  - Some ao focar/clicar no proprio campo
  - NAO some ao clicar em area vazia da tela
- Em casos especiais (indicados explicitamente), o erro pode aparecer fora do campo

### 9. Testes mentais obrigatorios

Antes de finalizar qualquer CSS, validar mentalmente em 3 larguras:

1. **320px** (iPhone SE / iPhone 5) - tela minima
2. **390px** (iPhone 14 / iPhone 15) - tela media
3. **430px** (iPhone 15 Pro Max) - tela grande

Perguntar: "Se eu trocar de 320 para 430, as proporcoes visuais se mantem? Os textos, espacamentos e icones escalam juntos?"

### 10. Variaveis CSS do projeto

Sempre usar as variaveis ja definidas:

- `--mobile-tabbar-clearance` - espaco reservado para a tabbar
- `--mobile-shell-top-offset` - offset do topo do shell
- `--mobile-edge-fill` - cor/gradiente da borda (verde)
- `--mobile-page-bg` - background da pagina
- `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` - safe areas do dispositivo

## Checklist rapido

Ao escrever ou revisar CSS mobile, confirmar:

- [ ] Nenhum valor fixo em px para dimensoes de layout
- [ ] `clamp()` usado em fontes e espacamentos
- [ ] Safe areas respeitadas (top e bottom)
- [ ] Conteudo nao fica atras da tabbar
- [ ] Status bar integrada com a cor do topo
- [ ] Mensagens de feedback nao movimentam o layout
- [ ] Proporcoes se mantem de 320px a 430px+
