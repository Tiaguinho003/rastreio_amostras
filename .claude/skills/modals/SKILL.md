---
name: modals
description: Use this skill whenever building, editing, or reviewing modals/dialogs in the PWA. Defines the canonical .app-modal pattern (header verde + body branco + actions padronizadas) usado em todos os modais centrais nao-bottom-sheet. Substitui qualquer documentacao previa de modais.
---

# Modais — Padrao .app-modal

Toda construcao ou edicao de modal central (nao bottom sheet) segue o padrao consolidado `.app-modal.is-themed`. Esta skill e a fonte canonica. Ao encontrar um modal que nao segue (modais de `users`, `cdm-modal`, etc), refatorar pra cá quando tocar.

> Bottom sheets (mobile, slide de baixo) seguem outro padrao — ver `design-system` §8 "Bottom Sheet". Esta skill cobre apenas modais centrais.

## 1. Quando usar

Use o padrao `.app-modal.is-themed` para:

- Formularios de criacao (ex: novo cliente, nova filial)
- Formularios de edicao (ex: editar cliente, editar filial)
- Confirmacoes destrutivas (ex: inativar cliente em cascata)
- View+edit hibrido (ex: detalhe de filial com modo edit inline)
- Status changes com motivo (ex: inativar/reativar cliente)

NAO use para:

- **Bottom sheets** mobile (slide de baixo, drag handle) — outro padrao
- **Overlays full-screen** (zoom de foto, camera) — `PhotoZoomViewer` style
- **Toasts** (feedback transiente nao-bloqueante) — ver `design-system` §13
- **Alertas inline** (estado persistente em area da pagina) — ver `design-system` §12
- **Tela de login / esqueci senha** (estilo proprio `login-modal-*`) — fora da app autenticada

## 2. Estrutura JSX canonica

Padrao copy-paste para um modal novo. Cada elemento tem responsabilidade documentada em §5–§9 abaixo.

```tsx
'use client';

import { type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';

type Props = {
  open: boolean;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (...) => Promise<void>;
};

export function MeuModal({ open, saving, errorMessage, onClose, onSubmit }: Props) {
  const focusTrapRef = useFocusTrap(open);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    await onSubmit(/* ... */);
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meu-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="meu-modal-title" className="app-modal-title">
              Titulo do modal
            </h3>
            <p className="app-modal-description">Subtitulo opcional</p>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {errorMessage ? <p className="sdv-modal-error">{errorMessage}</p> : null}

        <form className="app-modal-content" onSubmit={handleSubmit}>
          <label className="app-modal-field">
            <span className="app-modal-label">Nome (obrigatório)</span>
            <input
              className="app-modal-input"
              value={value}
              disabled={saving}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
            />
          </label>

          <div className="app-modal-actions">
            <button type="submit" className="app-modal-submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              className="app-modal-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
```

## 3. Variantes

| Modificador                   | Quando usar                                                              | Largura |
| ----------------------------- | ------------------------------------------------------------------------ | ------- |
| `.is-themed`                  | **Sempre** — define header verde brand + body branco + actions à direita | 38rem   |
| `.is-wide`                    | Formularios grandes (>5 campos, ou linhas com 2+ colunas)                | 46rem   |
| `.app-modal-submit.is-danger` | Botao primario de acao destrutiva (inativacao, exclusao em cascata)      | —       |

Combinar livremente: `.app-modal is-themed is-wide`.

> Existe um `.app-modal` "compacto" sem `.is-themed` (legacy: 430px max, fundo glass). NAO usar pra modais novos. Existe apenas pra `cdm-modal`, modais de users, cam-\* e similares — todos candidatos a refatoracao quando tocar.

## 4. Tokens visuais (referencia rapida)

Definicoes em `app/globals.css` linhas 1015–1405. NAO duplicar; usar as classes.

### Backdrop

- Fundo translucido `rgba(245, 245, 241, 0.18)` + `backdrop-filter: blur(20px)` (efeito glass)
- z-index: `var(--z-modal-backdrop)`
- Animacao de entrada: `app-modal-backdrop-in 0.3s ease`

### Modal `.app-modal.is-themed`

- Largura: `min(38rem, calc(100vw - 1.5rem))` (default) ou `min(46rem, ...)` (`.is-wide`)
- `border-radius: clamp(24px, 7vw, 32px)`
- `background: #ffffff` (puro, nao gradiente — `is-themed` zera o glass do `.app-modal` base)
- `overflow: hidden` + `display: flex; flex-direction: column`
- Animacao de entrada: `app-modal-card-in 0.35s cubic-bezier(0.22, 1, 0.36, 1)`

### Header (`.app-modal-header` sob `.is-themed`)

- `background: linear-gradient(135deg, var(--brand-green), var(--brand-green-soft))`
- `color: #ffffff`
- `padding: clamp(0.95rem, 3vw, 1.15rem) clamp(1.1rem, 3.5vw, 1.4rem)`
- `align-items: center` (vertical)
- Top corners arredondados explicitamente (clamp 24-32px) por causa do stacking context do backdrop-filter

### Titulo (`.app-modal-title` sob `.is-themed`)

- `font-size: clamp(1.15rem, 3vw, 1.45rem)`
- `font-weight: 700`
- `color: #ffffff`
- `letter-spacing: -0.01em`, `line-height: 1.2`

### Subtitulo (`.app-modal-description`)

- Opcional (omitir o `<p>` se nao tiver)
- `color: rgba(255, 255, 255, 0.85)`, `font-size: 0.85rem`

### Close (`.app-modal-close` sob `.is-themed`)

- Quadrado `2.2rem × 2.2rem`, `border-radius: 9px`
- `background: rgba(255, 255, 255, 0.16)`
- Hover: `rgba(255, 255, 255, 0.28)`
- `:active` = `transform: scale(0.94)`
- Conteudo: `<span aria-hidden="true">&times;</span>`

### Body (`.app-modal-content` sob `.is-themed`)

- `padding: clamp(1rem, 3vw, 1.4rem)`
- `display: flex; flex-direction: column; gap: clamp(0.7rem, 2vw, 0.95rem)`
- `overflow-y: auto`, `flex: 1`
- Sob `.is-themed` o body costuma ser um `<form>` com submit handler

### Actions (`.app-modal-actions` sob `.is-themed`)

- `display: flex; gap: 0.6rem; justify-content: flex-end`
- Submit a esquerda do Cancelar (visualmente, devido ao `flex-end` + ordem do JSX)
- Border-top `1px solid rgba(0, 0, 0, 0.06)` separa do body

## 5. Campos (`.app-modal-field` + `.app-modal-input`)

### Estrutura

```tsx
<label className="app-modal-field">
  <span className="app-modal-label">Nome (obrigatório)</span>
  <input className="app-modal-input" value={...} onChange={...} />
</label>
```

### `.app-modal-input` sob `.is-themed`

- `border: 2px solid rgba(0, 0, 0, 0.16)` — espessura dobrada vs default; bordas precisam ser visiveis sem foco
- `background: #ffffff`
- `border-radius: 12px`
- `padding: 0.82rem 1.1rem`
- `font-size: 1rem`
- Focado: `border-color: rgba(22, 91, 42, 0.5)` + `box-shadow: 0 0 0 3px rgba(22, 91, 42, 0.1)` (glow verde)

### `.app-modal-label` sob `.is-themed`

- `color: rgba(0, 0, 0, 0.6)`
- `font-size: 0.78rem`
- `font-weight: 600`
- `letter-spacing: 0.02em`

### Textarea

Usar a mesma classe `app-modal-input` no `<textarea>`. Adicionar `rows={2-3}` e `maxLength` conforme caso.

```tsx
<label className="app-modal-field">
  <span className="app-modal-label">Motivo (obrigatório)</span>
  <textarea
    className="app-modal-input"
    value={...}
    rows={2}
    maxLength={300}
    onChange={...}
  />
</label>
```

### Layout multi-coluna

Para 2 campos lado a lado (ex: CPF | telefone), envolver com `<div className="sdv-edit-row">`:

```tsx
<div className="sdv-edit-row">
  <label className="app-modal-field">...</label>
  <label className="app-modal-field">...</label>
</div>
```

`.sdv-edit-row` = `display: grid; grid-template-columns: 1fr 1fr; gap: clamp(8px, 2.2vw, 10px)`.

Para proporcoes diferentes, usar `style={{ gridTemplateColumns: '1fr 2fr' }}` inline.

Para campo full-width dentro de grid de 2 colunas, usar modificador `.is-full` no `.app-modal-field` (depende do CSS scoping local — ver `cudm-info-grid > .app-modal-field.is-full` em `globals.css` como exemplo).

## 6. Erros e validacao

### Erro generico do modal (topo)

Antes do `<form>`, mostrar mensagem geral em `.sdv-modal-error`:

```tsx
{
  errorMessage ? <p className="sdv-modal-error">{errorMessage}</p> : null;
}
```

`.sdv-modal-error` = fundo `rgba(192, 57, 43, 0.08)` + texto `#8a2727` + borda vermelha clara.

### Erro por campo

Aplicar `.has-error` no `.app-modal-input`:

```tsx
<input
  className={`app-modal-input${hasError ? ' has-error' : ''}`}
  ...
/>
{hasError ? <span className="cudm-edit-error">{errorMessage}</span> : null}
```

`.app-modal-input.has-error` = `border-color: rgba(196, 92, 92, 0.5)` (vermelho suave).

`.cudm-edit-error` = texto `#c45c5c` font-size `0.78rem` abaixo do input.

### Erros de validacao em fluxo de submit

Padrao do `ClientQuickCreateModal`:

1. State `submitted = false` inicialmente
2. Ao clicar Salvar: `setSubmitted(true)` antes de validar
3. Erros so aparecem se `submitted && !canSubmit` — evita marcar campo como vermelho antes do usuario interagir
4. Erro do campo entra como **placeholder vermelho** dentro do input (`placeholder={hasError ? hint : ''}`) + classe `.cqc-input-error::placeholder { color: #c45c5c }`

> Convencao de feedback do projeto: erro de validacao **dentro do input** (placeholder vermelho + borda vermelha suave), nunca abaixo nem com tooltip. Ver memoria `feedback_error_inside_field`.

## 7. Sucesso

Padrao 1: **success overlay com check verde** sobre o modal (modal continua visivel mas conteudo coberto pelo SVG por ~900ms antes de fechar).

```tsx
{
  showSuccess ? (
    <div className="client-detail-success-check">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    </div>
  ) : null;
}
```

CSS em `app/globals.css` (`.client-detail-success-check`, `.client-create-success-overlay`).

Padrao 2: **toast global** + fechamento imediato — usar para fluxos rapidos onde nao da pra parar pra contemplar a animacao. Ver `lib/toast/ToastProvider.tsx`.

> Modais novos: prefira toast (mais rapido). Use overlay so quando o usuario precisa visualmente confirmar a operacao antes de seguir.

## 8. Botoes (actions)

### Ordem

`<div className="app-modal-actions">` JSX **sempre** na ordem `[Submit, Secondary]`:

```tsx
<div className="app-modal-actions">
  <button type="submit" className="app-modal-submit">
    Salvar
  </button>
  <button type="button" className="app-modal-secondary" onClick={onClose}>
    Cancelar
  </button>
</div>
```

Sob `.is-themed`, `flex; justify-content: flex-end` faz Submit aparecer **a esquerda** do Cancelar visualmente. Mantem a ordem JSX `[Submit, Secondary]`.

### Submit

`.app-modal-submit`:

- Pill (`border-radius: 999px`)
- Gradient verde brand
- `min-height: 3.2rem`
- `font-weight: 700`
- Sombra verde difusa

`.app-modal-submit.is-danger`:

- Gradient vermelho `#c0392b → #b03224`
- Sombra vermelha
- Usar **somente** em acoes terminais (inativar com cascade, deletar)

### Secondary

`.app-modal-secondary`:

- Pill `border-radius: 999px`
- Fundo translucido branco
- `min-height: 3rem`
- Border `1px solid rgba(214, 214, 214, 0.5)`

### Estados disabled / saving

- `disabled={saving}` em **todos** os inputs e botoes durante submit
- `disabled={saving || !canSubmit}` em Submit pra bloquear submit invalido
- Submit shows `'Salvando...'` durante saving (ou texto contextual: `'Inativando...'`, `'Processando...'`)
- `:disabled` = `opacity: 0.84` (continua legivel) + `cursor: not-allowed`

## 9. UX comportamental obrigatoria

### Focus trap

Sempre usar `useFocusTrap(open)` (em `lib/use-focus-trap.ts`):

```tsx
const focusTrapRef = useFocusTrap(open);
// ...
<section ref={focusTrapRef} className="app-modal is-themed" ...>
```

Captura Tab/Shift+Tab dentro do modal. Sem isso, foco escapa pro fundo.

### Backdrop click

Por **default**, backdrop fecha o modal — adicionar `onClick={onClose}` no `.app-modal-backdrop`. **Excecoes**: modais de fluxo critico (cascade de inativacao, classificacao em andamento) **nao** devem fechar por backdrop. Usar `app-modal-backdrop-no-dismiss` quando aplicavel.

Sempre adicionar `onClick={(e) => e.stopPropagation()}` no `<section>` interno pra cliques dentro do modal nao fecharem.

### ESC

`useFocusTrap` so captura Tab. Para ESC fechar, adicionar effect no componente:

```tsx
useEffect(() => {
  if (!open) return;
  function handleEsc(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
  document.addEventListener('keydown', handleEsc);
  return () => document.removeEventListener('keydown', handleEsc);
}, [open, onClose]);
```

> Nem todos os modais existentes implementam isso. Padronizar nos modais novos.

### Portal (OBRIGATORIO)

Modal central **sempre** renderiza via `createPortal(..., document.body)`. Sem excecao. O JSX root vira:

```tsx
return createPortal(
  <div className="app-modal-backdrop" onClick={onClose}>
    <section className="app-modal is-themed" ...>
      ...
    </section>
  </div>,
  document.body,
);
```

**Por que e obrigatorio:** todas as rotas da app sao envolvidas por `<PageTransition>` (`components/PageTransition.tsx`), que aplica `transform: scale(...)` + `will-change: transform, opacity` no wrapper `.page-transition-content` durante navegacoes. Qualquer `transform != none` em ancestral cria stacking context que captura o `position: fixed` do `.app-modal-backdrop` — o modal acaba abaixo da topbar, do pseudo `mobile-edge-shell-auth::after` (z-index 9999) e de qualquer outro elemento com z-index alto em irmaos do wrapper. Sintoma classico: "modal abre atras da pagina".

Portal pra `document.body` escapa qualquer stacking context ancestral, agora e no futuro — robusto contra qualquer novo `transform`/`filter`/`backdrop-filter` em ancestral.

**SSR-safe:** o padrao do projeto e nao usar guard `mounted`. O `if (!open) return null` (ou render condicional do pai) garante que `createPortal` so e chamado client-side, quando `document.body` existe. Ver `ClientUnitModal`, `BlendRevertModal`, `SampleMovementModal`, `SampleInvalidateBlockedModal` como referencia.

**Excecao legitima:** status modals inline em `app/clients/[clientId]/page.tsx` que ja vivem direto sob `<AppShell>` em rotas SEM contexto de stacking problematico podem ficar inline — mas isso e legacy, novos modais sempre via portal.

### Aria

Sempre:

- `role="dialog"`
- `aria-modal="true"`
- `aria-labelledby="<id-do-titulo>"` (id no `<h3>` do header)
- `aria-describedby` opcional, no `<p className="app-modal-description">`

Botao close:

- `aria-label="Fechar"` (ou `"Fechar novo cliente"` se mais especifico ajudar)
- `<span aria-hidden="true">&times;</span>` no conteudo

### Animacao de entrada

Coberta pelos keyframes globais (`app-modal-backdrop-in`, `app-modal-card-in`). NAO inventar transicoes proprias. Modal aparece com fade + scale subtil em ~0.35s.

### Reset de form ao abrir

```tsx
useEffect(() => {
  if (!open) return;
  setForm(EMPTY_FORM);
  setError(null);
  setSubmitted(false);
  // ...
}, [open]);
```

Garantir que reabrir o modal sempre comece limpo.

## 10. Mensagens em pt-BR

Todos os textos do modal em pt-BR (titulo, label, placeholder, botao, mensagens de erro). Sem ingles em UI. Ver memoria `feedback_messages_portuguese`.

UPPERCASE em campos de nome/dados cadastrais (`event.target.value.toUpperCase()`) — convencao do projeto pra dados de cliente, fazenda, endereco.

## 11. Modais existentes — status

### ✅ Seguem o padrao .is-themed

#### Cliente

| Modal                               | Arquivo                                                   | Variantes                  |
| ----------------------------------- | --------------------------------------------------------- | -------------------------- |
| ClientUnitModal (Nova filial)       | `components/clients/ClientUnitModal.tsx`                  | `is-themed is-wide`        |
| ClientUnitDetailModal (view + edit) | `components/clients/ClientUnitDetailModal.tsx`            | `is-themed is-wide`        |
| ClientInactivateWithCascadeModal    | `components/clients/ClientInactivateWithCascadeModal.tsx` | `is-themed` + `.is-danger` |
| Edit Client (inline na detail page) | `app/clients/[clientId]/page.tsx` ~L1547                  | `is-themed is-wide`        |
| Status modal cliente (inline)       | `app/clients/[clientId]/page.tsx` ~L1991                  | `is-themed`                |
| Status modal unit (inline)          | `app/clients/[clientId]/page.tsx` ~L2092                  | `is-themed`                |

#### Dashboard

| Modal          | Arquivo                                   | Variantes                                                    |
| -------------- | ----------------------------------------- | ------------------------------------------------------------ |
| OperationModal | `components/dashboard/OperationModal.tsx` | `is-themed app-modal-dashboard` (largura 800/900px) + portal |

> `app-modal-dashboard` e classe scoped pra largura especifica (maior que o default 38rem do `.is-themed`). Selector de 3 classes `.app-modal.is-themed.app-modal-dashboard` sobrescreve sem `!important`. Cards internos usam `.app-modal-card*` (titulo do lote livre, linhas auxiliares truncadas em 50% pra nao colidir com CTA "Classificar").

#### Extracao da classificacao (`/camera` — Q.cls.2)

Todos seguem `.app-modal.is-themed`. Ordem do fluxo: `idle → preview → handleSendPhoto → detecting → detected → extracting → ` (3a/3b se falha; senão) ` confirming (Review) → selecting-type (Type) → selecting-classifier (Classifier) → submitting → success`. Mismatch/reclassify aparecem no caminho do save.

| Modal                              | Arquivo                                                     | Sub-caminho                         | Variantes                  |
| ---------------------------------- | ----------------------------------------------------------- | ----------------------------------- | -------------------------- |
| ClassificationReviewModal          | `components/samples/ClassificationReviewModal.tsx`          | Q.cls.2.3 (revisão pós-extração)    | `is-themed is-wide`        |
| ClassificationTypeModal            | `components/samples/ClassificationTypeModal.tsx`            | Q.cls.2.8 (seleção de tipo)         | `is-themed`                |
| ClassificationClassifierModal      | `components/samples/ClassificationClassifierModal.tsx`      | Q.cls.2.9 (seleção classificadores) | `is-themed`                |
| ClassificationExtractionErrorModal | `components/samples/ClassificationExtractionErrorModal.tsx` | Sub-caminhos 3a + 3b                | `is-themed`                |
| ClassificationDetectFailedModal    | `components/samples/ClassificationDetectFailedModal.tsx`    | Ficha não detectada (detect-failed) | `is-themed`                |
| ClassificationManualConfirmModal   | `components/samples/ClassificationManualConfirmModal.tsx`   | 2º modal de 3b                      | `is-themed`                |
| ClassificationLotMismatchModal     | `components/samples/ClassificationLotMismatchModal.tsx`     | Sub-caminho 2 (lote diverge)        | `is-themed`                |
| ClassificationDataMismatchModal    | `components/samples/ClassificationDataMismatchModal.tsx`    | Sub-caminho 4 (sacas/safra)         | `is-themed is-wide`        |
| ClassificationReclassifyModal      | `components/samples/ClassificationReclassifyModal.tsx`      | Sub-caminho 5 (reclassificação)     | `is-themed` + `.is-danger` |
| ClassificationNotFoundModal        | `components/samples/ClassificationNotFoundModal.tsx`        | Flow A legacy fallback              | `is-themed`                |
| ClassificationStatusInvalidModal   | `components/samples/ClassificationStatusInvalidModal.tsx`   | Status inválido (no Avançar)        | `is-themed`                |
| ClassificationSuccessModal         | `components/samples/ClassificationSuccessModal.tsx`         | Tela de sucesso pós-classificação   | `is-themed`                |

> Padrao da extracao: avisos de erro/mismatch usam `role="alertdialog"`; modal de tipo+classifier+revisao usam `role="dialog"`. Modais com seta de Voltar no header (Type, ManualConfirm, Classifier) reutilizam a classe `.type-modal-back` que aplica fundo branco translucido + ESC = onBack.

### ⚠ Visual igual mas implementacao com classes proprias (refatorar quando tocar)

| Modal                  | Arquivo                                         | Pendencia                                                                                                                                  |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ClientQuickCreateModal | `components/clients/ClientQuickCreateModal.tsx` | Usa `client-quick-create-*` no lugar de `.is-themed` + `.app-modal-header/-field/-input/-actions`. Resultado visual igual mas duplica CSS. |

### ⚠ Compactos sem `.is-themed` (legados, refatorar quando tocar)

Estes usam `.app-modal` simples (430px max, fundo glass) ou variante `cdm-modal` em vez de `.is-themed`:

- `cdm-modal` (Client Detail Modal em `/clients`, `/users`, `/samples`)
- `cld-modal` (Classification Detail Modal em `/samples/[sampleId]/page.tsx`) — usa `cld-*` (cld-header/section/field/grid). Q.cls.2 audit do tipo (commit `15a5a07`) adicionou seção "Tipo" seguindo o padrão interno (cld-section + cld-field-input + chevron SVG no select), mas o modal pai segue legacy.
- `SampleMovementModal` — ja usa portal.
- `samples-filter-modal` em `/samples`
- `InactivateUserModal`, `CancelInactivationDialog`, `InactivateConfirmDialog` em `/users`
- `SampleLookupResultModal` — usa `.app-modal-lookup-result` legacy mas **ja renderiza via portal pra body** (fix pra bug de stacking sob `<PageTransition>` no dashboard).

> Refatorar pra `.is-themed` somente quando tiver outro motivo pra mexer no modal — nao e prioridade visual hoje.

### 🚫 Excecoes legitimas (NAO refatorar)

| Modal               | Por que e excecao                                                  |
| ------------------- | ------------------------------------------------------------------ |
| ForgotPasswordModal | Estilo da tela de login (`login-modal-*`), fora da app autenticada |
| PhotoZoomViewer     | Overlay full-screen pra zoom de foto — nao e modal de form         |

### Mapa visual do fluxo da extracao

```
        scanner (idle)
           │
           ▼ tira foto
        preview ──── Tirar outra ──── (resetClassificationFlow)
           │ "Enviar"
           ▼
       detecting ─── Foto sem ficha visivel ──► detect-failed (modal) ─── "Continuar" ───────────┐
           │ ficha detectada                                                                       │
           ▼                                                                                        │
       detected (success-icon, 800ms)                                                               │
           │                                                                                        │
           ▼                                                                                        │
       extracting ◄────────────────────────────────────────────────────────────────────────────────┘
           │
           ├── lote=null (hasContext) ──► extraction-error-illegible ─── "Tirar outra" ─── reset
           │                                                          ─── "Cancelar"     ─── router.back()
           │
           ├── catch (timeout/offline) ──► extraction-error-technical ─ "Tirar outra"     ─ reset
           │                                                            "Continuar manual"─►  manual-confirm ─ "Confirmar" ─► startManualMode → confirming (Review com lote/sacas/safra editaveis)
           │                                                            "Cancelar"        ─ router.back()
           │
           ▼ extracao OK
       confirming (ReviewModal) ─── "Cancelar" ─── reset
           │
           ▼ "Avançar" (≥1 campo) → handleReviewAdvance — valida ANTES do tipo:
           │     ├── Flow A: resolve lote → nao encontrado ─► not-found (NotFoundModal) ─ "Sair"/"Cadastrar nova"
           │     ├── status ∉ {RC, CLASSIFIED} ───────────► status-invalid (StatusInvalidModal) ─ "Cancelar"/"Ver detalhes"
           │     └── ok ─► selecting-type
           ▼
       selecting-type (TypeModal) ─── ← Voltar (seta) ─── confirming
           │ click num tipo
           ▼
       selecting-classifier (ClassifierModal) ─── ← Voltar (seta) ─── selecting-type
           │ "Confirmar"
           ▼
       handleConfirmClassification (status/resolve ja feitos no Avancar)
           ├── lote(editavel) ≠ contextSampleLot ──► lot-mismatch (LotMismatchModal) ─ "Tirar outra" ─ reset
           │                                                                          "Cancelar"    ─ router.back()
           ├── divergencias sacas/safra ───────────► data-mismatch (DataMismatchModal) ─ ESCOLHA campo a campo ─► "Aplicar e salvar"
           ├── sample CLASSIFIED ──────────────────► overwrite-confirm (ReclassifyModal com reason) ─► "Confirmar" ─► save
           └── tudo OK ─────────────────────────────► saveClassification → submitting → success
```

## 12. Checklist de revisao

Ao construir ou revisar um modal:

- [ ] `<div className="app-modal-backdrop">` + `<section className="app-modal is-themed">` (com `is-wide` se >5 campos ou linhas multi-coluna)
- [ ] `<header className="app-modal-header">` com `.app-modal-title-wrap` (titulo + descricao opcional) e `.app-modal-close`
- [ ] `<form className="app-modal-content">` com submit handler
- [ ] Campos como `<label className="app-modal-field"><span className="app-modal-label">...</span><input className="app-modal-input">...</label>`
- [ ] Multi-coluna usando `.sdv-edit-row` (1fr 1fr) ou `style={{ gridTemplateColumns }}` inline
- [ ] Erro generico do topo em `<p className="sdv-modal-error">`
- [ ] Erro por campo via `.app-modal-input.has-error` + `<span className="cudm-edit-error">`
- [ ] `<div className="app-modal-actions">` na ordem `[Submit, Secondary]`
- [ ] Submit: `.app-modal-submit` (verde) ou `.app-modal-submit.is-danger` (vermelho)
- [ ] Secondary: `.app-modal-secondary`
- [ ] `disabled={saving}` em **todos** os inputs e botoes
- [ ] Submit muda texto durante saving (`'Salvando...'`, `'Inativando...'`, etc)
- [ ] `useFocusTrap(open)` no `<section>`
- [ ] `role="dialog"`, `aria-modal="true"`, `aria-labelledby` no `<section>`
- [ ] Close button com `aria-label="Fechar"` e `<span aria-hidden>×</span>`
- [ ] Reset de form em `useEffect(() => { if (open) setForm(EMPTY); }, [open])`
- [ ] Backdrop fecha por click (default) — `onClick={onClose}` no backdrop, `onClick={stopPropagation}` no section
- [ ] `createPortal(..., document.body)` no return — **obrigatorio** pra todo modal central (escapa stacking context do `<PageTransition>` que envolve todas as rotas)
- [ ] Textos em pt-BR (titulo, labels, botoes, mensagens)
- [ ] Sem cores inventadas — apenas tokens da paleta (`design-system` §2)
- [ ] Sem botao verde no `:active` transitorio (apenas `.app-modal-submit` que ja e verde por design) — ver skill `button-press-effect` pra receita completa de tap feedback

## 13. Como editar um modal divergente

Quando encontrar um modal listado em "⚠ Compactos sem `.is-themed`" que precisa de mudanca:

1. **Migrar pra `.is-themed`**: trocar wrappers proprios por `.app-modal-header/-content/-field/-input/-actions`
2. **Manter classe scoped** pra customizacoes especificas (ex: `cudm-info-grid`, `client-quick-create-flags`) — coabitam bem com `.app-modal-*`
3. **Largura**: testar se `38rem` (default) basta; senao adicionar `.is-wide` (46rem)
4. **Remover CSS duplicado** (header verde, close button, botoes) que era replicado localmente
5. **Smoke test visual**: abrir o modal antes/depois e comparar — efeito final deve ser identico

Exemplo de referencia: comparar `ClientQuickCreateModal` (legacy, divergente) com `ClientUnitModal` (canonico) — mesmo resultado visual final, codigo bem mais enxuto no canonico.

## 14. Quando criar classes scoped

Use classes proprias (`<algo>-modal`, `<algo>-header`, etc) **somente** para:

- Layouts especificos do conteudo do modal (ex: `cudm-info-grid` 2 colunas pra dados de filial, `sdv-cascade-list` lista de amostras vinculadas)
- Customizacoes pontuais que nao cabem nos tokens globais (ex: eyebrow do header `cudm-header-eyebrow`)
- Estados especificos do dominio (ex: `cudm-header-inactive` badge "Inativa")

NAO criar classe propria pra:

- Backdrop (sempre `.app-modal-backdrop`)
- Modal container, header, body, actions (sempre `.app-modal*`)
- Botoes (sempre `.app-modal-submit/-secondary`)
- Campos (sempre `.app-modal-field/-input/-label`)
- Header verde (sempre `.is-themed`)

Se precisar customizar um desses, **adicionar classe extra** ao lado da canonica em vez de substituir:

```tsx
<section className="app-modal is-themed is-wide cudm-modal">
```

E definir overrides no CSS pelo seletor combinado:

```css
.cudm-modal .app-modal-header {
  /* override pontual */
}
```
