# Design Language — Tokens

Status: Ativo (documento canônico dos **design tokens** da PWA)
Escopo: a **fonte-da-verdade legível** do sistema de tokens que vive em `app/globals.css` `:root` —
cor, tipografia, espaço, raio, sombra, motion, z-index, breakpoints. Este doc **espelha** o `:root`
(o CSS é autoritativo); ao mexer num token, atualizar os dois no mesmo passo.
Última revisão: 2026-07-12 (extraído do `:root` real no check-up do dashboard)
Documentos relacionados: skill `design-system` (guia **aplicado**: cards/componentes/anti-patterns),
`responsive`, `feedback-messages`, `button-press-effect`, `modals`.

> **Divisão de papéis:** este doc = **os tokens** (o vocabulário). A skill `design-system` = **como
> aplicá-los** em componentes reais (cards, listas, modais) + regras de acabamento. Antes de uma
> reforma de design, os tokens aqui são o ponto de partida; mudanças de token propagam por todo o app
> (17k+ linhas de CSS já os consomem via `var(--…)`).

---

## 1. Cor

### 1.1 Brand — paleta Safras (fonte única de verdes)

| Token                  | Valor        | Uso                                     |
| ---------------------- | ------------ | --------------------------------------- |
| `--brand-green`        | `#1f5d43`    | verde da marca (topbar start, theme)    |
| `--brand-green-deep`   | `#173c30`    | verde profundo (topbar end)             |
| `--brand-green-ink`    | `#24392f`    | tinta escura (texto primário)           |
| `--brand-green-soft`   | `#2f6b4a`    | accent médio                            |
| `--brand-green-strong` | `#24553a`    | accent escuro                           |
| `--brand-green-rgb`    | `31, 93, 67` | rgb do brand-green p/ tints `rgba(...)` |
| `--brand-cream`        | `#efebe4`    | fundo creme                             |
| `--brand-cream-soft`   | `#fefcf9`    | superfície                              |
| `--brand-cream-line`   | `#ddd7cc`    | linha/divisor                           |
| `--brand-muted`        | `#66756b`    | texto muted                             |

### 1.2 Semânticos (o que usar no dia a dia)

| Token                   | Aponta p/              | Uso                        |
| ----------------------- | ---------------------- | -------------------------- |
| `--color-bg`            | `--brand-cream`        | fundo de página            |
| `--color-surface`       | `--brand-cream-soft`   | superfície de card         |
| `--color-surface-muted` | `#f9f7f3`              | superfície rebaixada       |
| `--color-ink`           | `--brand-green-ink`    | **texto primário**         |
| `--color-muted`         | `--brand-muted`        | **texto secundário/muted** |
| `--color-line`          | `--brand-cream-line`   | borda/divisor              |
| `--color-accent`        | `--brand-green-soft`   | accent                     |
| `--color-accent-strong` | `--brand-green-strong` | accent forte               |

**Aliases legados** (mantidos p/ o CSS já escrito; apontam pros semânticos): `--bg`, `--surface`,
**`--ink`**, **`--muted`**, `--line`, `--accent`, `--accent-strong`, `--danger`. Preferir `--ink`/`--muted`
p/ texto (o check-up DSB-D12 tokenizou os cards `dd-*` com eles).

### 1.3 Status

| Token                | Valor         | Uso           |
| -------------------- | ------------- | ------------- |
| `--color-success`    | `#2f6b4a`     | sucesso       |
| `--color-warning`    | `#c57d0c`     | atenção       |
| `--color-info`       | `#1e5f8f`     | informação    |
| `--color-danger`     | `#b83232`     | erro/perigo   |
| `--color-danger-rgb` | `184, 50, 50` | tints de erro |

### 1.4 Estado (card de Eventos, DSB-D10) — **component-scoped**

Definidos em `.dd-events-card` (não no `:root`), pois são o código de **estado** do calendário: a **cor =
estado**, o nome do tipo diferencia o evento. Candidatos a promover pro `:root` na reforma se virarem
um padrão de status mais amplo.

| Token               | Valor     | Estado       |
| ------------------- | --------- | ------------ |
| `--state-previsto`  | `#2563eb` | 🔵 previsto  |
| `--state-atrasado`  | `#dc2626` | 🔴 atrasado  |
| `--state-realizado` | `#15803d` | 🟢 realizado |

---

## 2. Tipografia (Poppins via `next/font`)

- **Família:** `--font-family-sans` = `var(--font-sans), 'Poppins', system-ui, …`.
- **Tamanhos** (`--font-size-*`): `xs 12px` · `sm 13px` · `base 14px` · `md 15px` · `lg 17px` ·
  `xl 20px` · `2xl 24px` · `3xl 30px` · `4xl 36px`.
- **Pesos** (`--font-weight-*`): `regular 400` · `medium 500` · `semibold 600` · `bold 700`.
- **Line-height** (`--line-height-*`): `tight 1.2` · `snug 1.35` · `normal 1.5` · `relaxed 1.65`.

> Nota: muitos componentes usam `clamp(...)` fluido em vez dos tokens de tamanho fixos (mobile-first —
> ver skill `responsive`). Os `--font-size-*` são a escala de referência.

---

## 3. Espaço — grid 8pt (`--space-*`)

`0` = 0 · `1` = 4px · `2` = 8px · `3` = 12px · `4` = 16px · `5` = 20px · `6` = 24px · `7` = 32px ·
`8` = 40px · `9` = 48px · `10` = 64px · `11` = 80px · `12` = 96px.

## 4. Raio (`--radius-*`)

`xs` = 4px · `sm` = 8px · `md` = 12px · `lg` = 16px · `xl` = 20px · `2xl` = 28px · `pill` = 999px.

## 5. Sombra — 5 níveis (base tinta `rgba(36,57,47,…)`)

`--shadow-xs` `0 1px 2px /.06` · `--shadow-sm` `0 2px 6px /.08` · `--shadow-md` `0 6px 16px /.10` ·
`--shadow-lg` `0 12px 32px /.14` · `--shadow-xl` `0 20px 48px /.18`.

## 6. Motion

- **Durações** (`--duration-*`): `instant 80ms` · `fast 140ms` · `base 200ms` · `slow 320ms` ·
  `slower 480ms`.
- **Easings:** `--ease-out` `cubic-bezier(.22,1,.36,1)` · `--ease-in-out` `cubic-bezier(.65,0,.35,1)` ·
  `--ease-spring` `cubic-bezier(.34,1.56,.64,1)`.
- **Sempre** cobrir animação com `@media (prefers-reduced-motion: reduce)` (ver skills).

## 7. Z-index (`--z-*`)

`dropdown 100` · `sticky 200` · `fixed 300` · `modal-backdrop 400` · `modal 410` · `popover 500` ·
`modal-stacked 600` · `toast 700` · `tooltip 800`.

## 8. Breakpoints (`--bp-*` — só documentação/JS)

`desktop 901px` (limite mobile/desktop — base do projeto) · `wide 1200px` · `large 1440px`.
⚠️ CSS **não** resolve `var()` em `@media` → as media queries usam o literal; manter em sincronia.

---

## 9. Regras de acabamento já firmadas (ver skills p/ o detalhe)

- **Fundo branco no dashboard e nas páginas migradas** (`/samples`, `/clients`, `/informe`, `/resumo`,
  `/profile`, dashboard) — exceção aprovada ao creme; o fundo de página virou branco em 2026-06-22.
- **Nunca mudar cor ao clicar** — feedback de toque é só **profundidade** (scale/afundar); sem verde no
  clique. Skill `button-press-effect`.
- **Erro de validação DENTRO do campo** (vermelho suave, some ao digitar). Skill `feedback-messages`.
- **Mensagens em pt-BR**, sempre.
- **Mobile-first** com `clamp()` + safe areas. Skill `responsive`.
- **Modais centrais** = `.app-modal.is-themed`. Skill `modals`.

## 10. Manutenção

1. O `:root` de `app/globals.css` é **autoritativo**; este doc é o espelho legível.
2. Ao **adicionar/alterar um token**, atualizar os dois no mesmo commit (regra de skill-maintenance).
3. Tokens novos preferem o `:root` (globais); só ficam component-scoped quando são de um domínio
   específico (ex.: `--state-*` do card de Eventos).
4. Este doc é o **ponto de partida da reforma de design**: qualquer nova linguagem visual evolui a
   partir daqui, não do zero.
