---
name: button-press-effect
description: Use this skill whenever building, editing, or reviewing ANY clickable element (button, a, [role="button"], Link, label clicavel). Defines the canonical tap/click feedback pattern: NO color change on tap, only depth (transform/scale). Eliminates the iOS Safari dark-overlay tap-flash and prevents hover sticky in touch devices.
---

# Button press effect — sem tap-flash, so profundidade

Todo elemento clicavel no app deve seguir este padrao. **Princípio**: feedback de tap é **apenas profundidade** (transform/scale + opcionalmente translateY). **NUNCA** muda cor (`background`, `color`, `border`, `box-shadow`) no `:active`.

## 1. Por que este padrao existe

### Sintoma reportado

"Quando toco um botao no app, ele fica bege/verde por um instante. Me incomoda."

### Causa raiz

1. **iOS Safari aplica overlay default `rgba(0, 0, 0, 0.4)` em qualquer elemento clicavel** se `-webkit-tap-highlight-color` nao for setado pra `transparent`. Esse overlay parece um "flash escuro" no tap. Dependendo do fundo do elemento, parece "ficar bege" (sobre fundo claro) ou "ficar verde" (sobre fundo branco com elemento verde).
2. **`:hover { background: ... }` aplicado fora de `@media (hover: hover)` dispara hover sticky em mobile** apos tap — o elemento "fica mudado de cor" ate o user tocar em outro lugar.

### Solucao

Tres regras combinadas (ver §3 receita canonica).

## 2. Quando usar

**SEMPRE** que criar ou editar qualquer destes elementos:

- `<button>` (incluindo type="submit", type="reset", type="button")
- `<a>` clicavel (`<Link>` do Next.js)
- Qualquer elemento com `[role="button"]` ou `onClick` que dispare acao
- `<label>` clicavel envolvendo input
- Itens de menu / tabbar / dropdown

NAO aplicar em:

- Elementos puramente decorativos (`aria-hidden="true"`, sem handler)
- Inputs nativos (`<input>`, `<select>`, `<textarea>`) — eles tem feedback nativo do browser apropriado pra texto/seleção
- `<a>` de navegação puramente visual (ex: footer link em prosa) — opcional, sem dano se aplicar

## 3. Receita canonica

```css
.meu-botao {
  /* (a) Zera o overlay default do iOS Safari no tap. */
  -webkit-tap-highlight-color: transparent;

  /* Cor/fundo/borda — estado IDLE. Mantem aqui sempre. */
  background: ...;
  color: ...;

  /* Transicao soh em propriedades de feedback (transform/box-shadow),
     nunca em background/color (evita flash perceptível). */
  transition: transform 0.15s ease;

  cursor: pointer; /* opcional pra desktop */
}

/* (b) :active aplica APENAS transform/scale — nada de cor. */
.meu-botao:active {
  transform: scale(0.96);
}

/* (c) Hover styles (cor/fundo/sombra) envolvidos em @media (hover: hover)
   — soh dispara em ponteiros precisos (mouse/trackpad). Em touch
   devices o seletor :hover nao casa, entao nao ha hover sticky. */
@media (hover: hover) {
  .meu-botao:hover {
    background: ...; /* OK aqui: so afeta mouse, nao tap mobile */
    box-shadow: ...;
  }
}

/* (d) :focus-visible pra acessibilidade keyboard — soh outline neutro,
   sem mudar fundo. */
.meu-botao:focus-visible {
  outline: 2px solid rgba(0, 0, 0, 0.15);
  outline-offset: 2px;
}
```

## 4. Variantes aceitas no `:active`

Combinacoes permitidas (so propriedades de **profundidade**, nunca cor):

| Tipo            | CSS                                     | Quando usar                                                              |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| Scale simples   | `transform: scale(0.96)`                | Botoes pequenos/medios (icone, CTA pill)                                 |
| Scale agressivo | `transform: scale(0.92)`                | Botoes que precisam de feedback mais marcado (close button, fab)         |
| Scale sutil     | `transform: scale(0.98)`                | Cards grandes clicaveis (.sales-card, .dashboard-operation-card)         |
| Scale + opacity | `transform: scale(0.96); opacity: 0.92` | Botoes coloridos pequenos onde opacity reforça o "press" sem mudar matiz |
| TranslateY      | `transform: translateY(1px)`            | "Botao afundando" — usado em fab buttons elevados (raro)                 |

**Combinacoes proibidas no `:active`:**

- `background-color`, `background`, `background-image` — mudanca de cor
- `color` — mudanca de cor do texto
- `border-color`, `border` — mudanca de cor do contorno
- `box-shadow` (mudanca de cor) — sombra colorida diferente
- `filter` — mudanca de cor via hue/brightness/saturate (raro mas evitar)

## 5. Anti-patterns

### ❌ `:active` mudando cor

```css
/* NUNCA fazer */
.botao:active {
  background: rgba(255, 255, 255, 0.48); /* flash visivel */
}

.botao:active {
  background: linear-gradient(...); /* gradient diferente */
}
```

### ❌ `:hover` sem media query

```css
/* NUNCA fazer */
.botao:hover {
  background: rgba(255, 255, 255, 0.48); /* sticky em mobile pos-tap */
}

/* CERTO: */
@media (hover: hover) {
  .botao:hover {
    background: rgba(255, 255, 255, 0.48);
  }
}
```

### ❌ `-webkit-tap-highlight-color` omitido

```css
/* INCOMPLETO — tap-flash do iOS continua */
.botao {
  background: green;
  /* falta: -webkit-tap-highlight-color: transparent; */
}
```

### ❌ Transicao em `background`

```css
/* Cria flash perceptivel mesmo sem mudanca explicita */
.botao {
  transition:
    background 0.2s ease,
    transform 0.15s ease;
  /* CERTO: transition: transform 0.15s ease; */
}
```

## 6. Padroes pre-aprovados no projeto

Lista de seletores que ja seguem o pattern corretamente — podem ser usados como referencia:

| Selector                       | Arquivo:linha      | Variante                             |
| ------------------------------ | ------------------ | ------------------------------------ |
| `.dashboard-operation-card`    | globals.css ~3776  | scale(0.95) + focus outline          |
| `.sales-card`                  | globals.css ~19183 | scale(0.98) — card grande clicavel   |
| `.sales-aging-card`            | globals.css ~19336 | scale(0.97) — Link em modal          |
| `.app-modal-card-classify-cta` | globals.css ~1601  | scale(0.96) + opacity(0.92)          |
| `.dashboard-hero-avatar`       | globals.css ~15250 | scale(0.92) — botao pequeno circular |
| `.app-modal-close` (themed)    | globals.css ~1189  | scale(0.94) — close button           |

## 7. Como auditar um elemento existente

Sequencia rapida:

1. Grep o CSS por `:active` do seletor — verificar que so muda transform.
2. Grep por `:hover` do seletor — verificar que esta dentro de `@media (hover: hover)`.
3. Grep por `-webkit-tap-highlight-color` no seletor (ou ancestral) — confirmar `transparent`.
4. Grep por `transition` — confirmar que NAO inclui `background`, `color`, `border-color`.

Se algum desses falhar: aplicar a receita §3.

## 8. Checklist pra novo elemento clicavel

- [ ] `-webkit-tap-highlight-color: transparent`
- [ ] `:active` aplica APENAS `transform` (scale e/ou translateY)
- [ ] Todo `:hover { background/color/box-shadow }` esta dentro de `@media (hover: hover)`
- [ ] `transition` lista apenas `transform`, `box-shadow` (cores nao), opacity se aplicavel
- [ ] `:focus-visible` aplica apenas outline neutro (se aplicar) — sem mudar fundo
- [ ] Em mobile: ao tocar, ZERO flash de cor — apenas o "scale down" momentaneo
- [ ] Em desktop com mouse: hover muda visual normalmente

## 9. Excecoes legitimas

### Toggles de estado (checkbox, switch)

Toggles MUDAM cor para refletir estado ON/OFF — isso e o proprio significado da interacao, nao feedback de tap. OK.

### Botoes "selected" persistentes (tabs, segmented control)

Botao "ativo" pode ter background diferente — e estado persistente, nao feedback de tap. OK.

### Estado de loading

`.botao.is-loading { opacity: 0.6 }` durante request OK — estado, nao tap feedback.

**Em todos os 3 casos acima**: feedback de TAP (o `:active`) ainda deve ser so transform.

## 10. Referencias

- iOS Safari tap-highlight: https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-tap-highlight-color
- `@media (hover: hover)`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover
- WCAG 2.4.7 Focus Visible: https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html
