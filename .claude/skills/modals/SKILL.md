---
name: modals
description: Use this skill whenever building, editing, or reviewing modals/dialogs in the PWA. Defines the canonical .app-modal pattern (header verde + body branco + actions padronizadas) usado em todos os modais centrais nao-bottom-sheet. Substitui qualquer documentacao previa de modais.
---

# Modais — Padrao .app-modal

Toda construcao ou edicao de modal central (nao bottom sheet) segue o padrao consolidado `.app-modal.is-themed`. Esta skill e a fonte canonica. Ao encontrar um modal que nao segue (modais de `users`, `cdm-modal`, etc), refatorar pra cá quando tocar.

> Bottom sheets (mobile, slide de baixo) seguem outro padrao — ver `design-system` §8 "Bottom Sheet". Detalhes-como-overlay (painel lateral desktop / sheet mobile dirigido por URL — detalhe do cliente em `/cadastros?cliente=`, detalhe do lote em `/samples?lote=`, detalhe do contrato em `/contratos?details=`) usam o `DetailOverlay` — ver `design-system` §8 "DetailOverlay". Forms de criacao/edicao viram painel lateral no desktop via classe `.side-sheet` — ver `design-system` §8 "Side-sheet". Esta skill cobre apenas modais centrais.

> **Regras de conteiner por TIPO (RD11, travadas pelo Flavio 2026-07-20 — ver `docs/Redesign-Plano-de-Trabalho.md`):**
>
> - **Detalhe de recurso** → `DetailOverlay` peek (✅ cliente/lote/contrato feitos)
> - **Form de criacao/edicao** (incl. view+edit e Documentos) e **informes** (visita/relatorio/informativo) → sheet com `.side-sheet` (painel lateral bloqueante no desktop; ✅ Novo lote/Novo cliente feitos)
> - **Filtros** (lotes/clientes/contratos) → painel lateral
> - **Operacoes** (venda/perda, envio/laudo, etiquetas, embarque, agio/washout/faturar/pagar) → **CONTINUAM centrais**
> - **Confirmacao/descarte/atencao/aviso/sucesso** (incl. inativar com motivo) → **CONTINUAM centrais**
> - **Visualizacao** (foto/PDF/lightbox), **pickers/choosers/menus** e **camera/classificacao** → intactos
> - Form lateral aberto DE DENTRO de um peek → desliza POR CIMA (push, `stacked`)
> - **Criacao de CONTRATO** (Etapa2 + LotPicker) → FORA — specs futuras do Flavio
>
> **A migracao acontece PAGINA A PAGINA, junto com o design** (mockups do Flavio, pixel-perfect; piloto `/cadastros`) — cada pagina e tocada UMA vez (conteiner + layout). **NAO converter conteiner isoladamente fora do ciclo da pagina.** Inventario por pagina com o alvo de cada superficie: §11-A.

> **Padrao de modal de ACAO (consolidado 2026-06):** o canonico de modais de **ACAO** (forms, listas, menus que o usuario opera) e o **BottomSheet** (header branco, titulo verde a esquerda, X quadrado claro, backdrop escuro sem blur, slide-up de baixo) — ver `design-system` §8. Os centrais `.app-modal.is-themed` (esta skill) ficam pra **AVISO/notice/confirm** (`.app-confirm-modal`: icone + mensagem + confirmar/cancelar) e casos especiais. Excecao: os 2 centrais de ACAO do dashboard — busca de lote (`.app-modal-lookup-result`) e senha (`.app-modal-password-decision`) — **continuam centrais** mas adotam o VISUAL de acao via overrides ESCOPADOS (header claro + titulo verde a esquerda + X claro + backdrop escuro), sem tocar no chrome `.is-themed` compartilhado pelos demais ~28 modais.

## 1. Quando usar

Use o padrao `.app-modal.is-themed` para:

- Confirmacoes destrutivas (ex: inativar cliente em cascata)
- Status changes com motivo (ex: inativar/reativar cliente)
- Avisos/notices e sucessos
- Operacoes (venda/perda, envio/laudo, etiquetas, embarque, agio/washout/faturar/pagar — regra RD11)

> **RD11 (2026-07-20):** formularios de **criacao/edicao** (incl. view+edit, ex.: nova filial, editar cliente) deixam de ser o caso central — o alvo deles e o **BottomSheet com `.side-sheet`** (painel lateral no desktop). Os que hoje sao centrais (listados no §11-A) migram no ciclo pagina-a-pagina da FV, cada um na vez da sua pagina — NAO antes. Ate la, seguem como estao.

NAO use para:

- **Bottom sheets** mobile (slide de baixo, drag handle) — outro padrao
- **Overlays full-screen** (zoom de foto) — `PhotoZoomViewer` style (a camera NAO e mais overlay: e o BottomSheet global `CameraSheet`)
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

| Modificador                    | Quando usar                                                                                                                                                                                     | Largura |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `.is-themed`                   | **Sempre** — define header verde brand + body branco + actions à direita                                                                                                                        | 38rem   |
| `.is-wide`                     | Formularios grandes (>5 campos, ou linhas com 2+ colunas)                                                                                                                                       | 46rem   |
| `.is-action`                   | Modal central que e FORM de acao (nao aviso/confirm): troca o header verde pelo visual de acao (header claro + titulo verde a esquerda + X claro + backdrop escuro sem blur). Additivo, opt-in. | —       |
| `.app-modal-submit.is-danger`  | Botao primario de acao destrutiva (inativacao, exclusao em cascata)                                                                                                                             | —       |
| `.app-modal-submit.is-warning` | Botao primario de "prosseguir com aviso" laranja (continuar apesar de divergencia de lote; confirmar reclassificacao)                                                                           | —       |

Combinar livremente: `.app-modal is-themed is-wide`.

> **Visual de ACAO compartilhado (`.is-action`, 2026-06-18):** modificador additivo/opt-in sobre `.is-themed` que troca o header verde pelo **visual de acao** — header branco, titulo verde a esquerda, X quadrado claro (`#eef1ee`) e **backdrop escuro sem blur** (`rgba(0,0,0,.55)` via lista `:has(.is-action)`); tambem recolore `.app-modal-description` e o back-arrow `.type-modal-back` pra escuro (senao sumiriam no header claro). Especificidade `.app-modal.is-themed.is-action` (0,4,0) vence o chrome base (0,3,0) e **nao** toca no verde dos modais de AVISO/confirm. Use em modais centrais que sao FORM/confirm que o usuario opera. Ja aplicado em todos os modais do **detalhe da amostra** (`/samples/[sampleId]`): cabecalho + container "Informacoes" — **editar informacoes** (`.sample-detail-reg-edit-modal`), **enviar amostra** (`.sample-detail-lookup-modal`), **imprimir etiqueta** (`.sample-detail-print-modal`), **invalidar** (`.sample-detail-invalidate-modal`), **reverter liga** (`.blend-revert-modal`); container "Classificacao" — **detalhe da classificacao** (`.cld-modal`), **confirmar salvar**, **gerar laudo** (`.sample-detail-lookup-modal`), **safra do laudo** (`.report-harvest-select-modal`) e **reclassificar** (`.sample-detail-reclassify-modal`); container "Resumo comercial" — **cancelar movimentacao** (`.sample-detail-compact-modal`) e **cancelar envio** (`.sample-detail-compact-modal`) _(o painel comercial do detalhe e SO LEITURA desde a migracao pra lista: **venda/perda/novo envio** e **atribuir dono a liga** rodam pelo card de `/samples`, nao pelo detalhe — as classes `.sample-detail-movement*` seguem vivas, mas abertas pela lista)_; **avisos reativos** — **propagacao de safra/proprietario** (`.blend-harvest-propagation-modal`) e **invalidacao bloqueada por liga** (`.sample-invalidate-blocked-modal`). Tambem aplicado no **fluxo de classificacao por foto (CameraSheet global)**: os 11 modais `Classification*` (erros/avisos `*Mismatch`/`*Failed`/`NotFound`/`StatusInvalid`/`ExtractionError`/`ManualConfirm`, os de acao `Type`/`Classifier` com **back-arrow**, e o `Success`); o `SampleLookupResultModal` (`.app-modal-lookup-result`) tambem e `.is-action` (era precursor manual; adotou a classe + ESC interno no ciclo CAM 2026-07-16). Tambem em `.is-action`: o modal de confirmacao **"Etiqueta enviada"** (`ApprovalLabelModal`, sucesso pos-impressao da etiqueta de aprovacao — desde a AP29 aberto pela **sub-aba Aprovacoes** (o [Gerar]) + o **portao do faturar** (AP18); o leque de `/samples` saiu) — mesmo visual de sucesso (check verde + auto-close) do `ClassificationSuccessModal`. **Com isso o detalhe da amostra E o fluxo `/camera` nao usam mais header verde em NENHUM modal.** O verde `.is-themed` segue como padrao de aviso/confirm nas telas ainda nao migradas (ex.: `/users` e o resto de `/clients`). **2026-06-19:** o detalhe do cliente (hoje `ClientDetailView` no overlay de `/cadastros` — F1 do redesign) migrou pro visual de acao — modais **status do cliente** (inativar/reativar) e **editar informacoes** (`.client-detail-edit-modal`, compacto ~30rem espelhando o `.sample-detail-reg-edit-modal`: inputs/labels menores, grids `minmax(0,1fr)` + `min-width:0` e `overflow-x:hidden` no form pra nao vazar/cortar), e os modais de **filial** `ClientUnitModal` (Nova filial) + `ClientUnitDetailModal` (ver+editar, `.cudm-modal`) — todos `.is-action`, ~30rem, acoes 50/50 invertidas e sem placeholders de formato; campos pendentes com borda laranja `.is-pending`. Os containers brancos (`.sdv-info-compact`) de **Informacoes**, **Filiais** e **Endereco fiscal** (PJ) acompanham (sem header verde — `.sdv-card-themed` aposentado). O restante de `/clients` (cascade, status de filial) segue verde. Excecoes no detalhe (NAO migram, nao sao dialog): os overlays de EFEITO — carimbo de venda/perda (`.sdv-stamp-overlay`) e X de invalidacao (`.sdv-x-effect`) — e o `PhotoZoomViewer` (foto full-screen). O precursor escopado `.samples-filter-modal` (filtros) pode adotar `.is-action` quando for tocado (o `.app-modal-lookup-result` ja adotou no ciclo CAM 2026-07-16). CSS em `globals.css`, secao "Modais CENTRAIS de ACAO".

> **Confirm SEM header (enxuto):** um `.app-confirm-modal` pode dispensar o `<header className="app-modal-header">` — o titulo vai no CORPO via `.app-confirm-modal-title` (entre o icone e a mensagem). O card `.is-themed` (`overflow: hidden` + branco + radius) fica redondo sem o header. Usado no "Descartar lote?" do `NewSampleModal` e no **excluir visita/relatorio** do `/informe` (este com backdrop escuro opt-in `.app-modal-backdrop.is-scrim-dark` — `rgba(0,0,0,.55)` SEM blur, igual ao scrim dos 2 centrais de acao). Continua via `createPortal(document.body)` (§ Portal) — sem portar, um confirm dentro de um sheet/modal **ja portalado** fica ATRAS dele no empilhamento.

> **Sheet SOBRE sheet (`<BottomSheet stacked>`):** desde 2026-06, um bottom-sheet pode abrir sobre outro — a prop `stacked` eleva backdrop+sheet pro tier `--z-modal-stacked` (600/610) e o scroll-lock/ESC/back viram ref-contados/gated-ao-topo no componente (ver `design-system` §8 "stacked"). Ex.: "Novo proprietário" (`ClientQuickCreateModal`) sobre "Novo lote" (`NewSampleModal`). **Pegadinha:** o confirm de "Descartar?" do sheet DE CIMA NAO deve ser um `.app-modal.is-stacked` portalado (colidiria no mesmo tier 600 do sheet de cima) — use um **overlay INTERNO** ao sheet (`position:absolute; inset:0`, como o overlay de sucesso).

> **Central SOBRE central — portao do embarque (EMB28) e do faturamento (AP18):** o `ShipmentConfirmationModal` (`components/contracts/ShipmentConfirmationModal.tsx` — confirmacao de embarque: resumo + **transporte "Pela empresa | Por terceiros" + responsavel via `UserSelect` quando "Pela empresa" (EMB30)** + data `shippedAt` (max-hoje, default no ultimo dia util, BRT; recusa fds; EMB34) + upload opcional 0..10 fotos com **recusa >12 MiB no cliente** (EMB34) + aviso terminal + "fotos ficam 15 dias" (EMB31); `.app-modal is-themed is-action sample-detail-compact-modal`, portal) e alcancado por 2 portas: a worklist da sub-aba Embarque E o **portao do pagamento** — no `SaleContractLifecycleDialog` (action='pay'), um 422 `CONTRACT_SHIPMENT_REQUIRED` (lido de `ApiError.details.code`) abre o modal de confirmacao. **⚠️ EMB33 (2026-07-16) reverteu o empilhamento:** o dialog principal **SAI DE CENA** enquanto o portao esta aberto — `{!needsShipment && !needsApproval ? createPortal(...) : null}` — **UM `.app-modal-backdrop` de cada vez, NAO dois portalados** (o backdrop duplo escurecia demais). O estado (`date`) vive no COMPONENTE, nao no portal, entao persiste no hand-off; ao confirmar, um **toast "Embarque confirmado"** + o submit re-chamado paga (o confirm NAO bumpa `version`). Read-only da galeria = seção "Embarque" do `SaleContractDetailsModal` + lightbox `.emb-lightbox` (portal, z acima do BottomSheet). **Mesma moldura no portao do faturamento (aprovacao AP18):** 422 `CONTRACT_APPROVAL_REQUIRED` (action='invoice') abre o `ApprovalLabelModal` (prop `onSent`) — **tambem com o dialog base fora de cena** (o gate `!needsShipment && !needsApproval` cobre os dois portoes); ao enviar, refatura no `onClose` (envio NAO bumpa `version` → mesma `expectedVersion`). O mesmo `ApprovalLabelModal` e a porta [Gerar] da sub-aba Aprovacoes (`AprovacoesPanel`, refetch no `onSent`).

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
- **Inputs `type="date"`:** no WebKit/iOS o input nativo **ignora `width`/`max-width`** (usa a largura intrinseca do valor — o pseudo `::-webkit-date-and-time-value` tem `min-width` proprio) e estoura o modal (campo gigante + scroll lateral). `min-width:0`/`max-width:100%` em `.app-modal-field`/`.app-modal-input` **nao bastam**. O fix de verdade (regra `.app-modal.is-themed .app-modal-input[type='date']`): `-webkit-appearance: none` (vira input de texto, respeita `width:100%`) **+** `::-webkit-date-and-time-value { min-width: 0; text-align: left }`. O icone de calendario volta via `background-image` (a `.is-themed` pinta o fundo branco, entao precisa de especificidade 0,3,1). Mesmo padrao de `.samples-filter-field-input[type='date']`. Nao remover.

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

### ClientLookupField num modal (dropdown que escapa)

Modal central que hospeda um `<ClientLookupField>` (ex.: envio fisico e gerar laudo no detalhe da amostra): o dropdown de resultados e `position: absolute` dentro do `.app-modal-content` (que tem `overflow: auto`), entao fica **recortado** pelas bordas. Pra ele "escapar" sem aumentar o modal, adicionar a classe **`.sample-detail-lookup-modal`** no `<section>` (junto de `.app-modal is-themed ...`):

- libera `overflow: visible` no modal e no `.app-modal-content` (o card continua arredondado pelo `border-radius` e o header tem radius proprio — so o dropdown, que e filho, passa pra fora);
- o dropdown ganha `max-height` pra ~4 itens + scroll **vertical** (`overflow-x: hidden`);
- capar resultados com a prop **`maxResults={10}`** no `ClientLookupField` (alem de 10, o usuario refina a digitacao);
- pra abrir com a busca ja preenchida (ex.: nome anotado no informe, modal de vinculo do viewer Relatórios), usar a prop **`initialSearch`** — so inicializa o estado no mount; o primeiro foco no campo ja dispara as sugestoes.

**Multi-select de clientes:** chips dentro do box `.samples-filter-multi .samples-filter-multi--lookup` + `ClientLookupField` com `clearOnSelect` (o pai mantem o array e renderiza os chips). Rotulo do chip capado em ~10 chars + `…` (nome completo no `title`), placeholder sai quando ha selecao. Ver `design-system` §"Campos de filtro multi-select".

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

### Largura total 50/50 (variante muito usada)

Vários modais do detalhe da amostra (e o de filtros em `/samples`) usam ações **50/50**: os dois botões dividem a largura do modal igualmente, em vez do `flex-end` canônico. **Ordem nessa variante: secundário à ESQUERDA, primário à DIREITA** (ex: Cancelar / Limpar / Voltar à esquerda; Registrar / Aplicar / Invalidar / Confirmar à direita) — ou seja, JSX `[Secondary, Submit]`, o inverso da ordem canônica.

Implementação: **regra compartilhada** em `globals.css` — NÃO criar uma nova por modal. Só adicione a classe da fileira de ações às duas listas de seletores existentes:

```css
.app-modal.is-themed .app-modal-actions.sample-detail-reclassify-actions,
.app-modal.is-themed .app-modal-actions.sample-detail-reg-edit-actions,
.app-modal.is-themed .app-modal-actions.sample-detail-movement-actions,
.app-modal.is-themed .app-modal-actions.sample-detail-invalidate-actions,
.app-modal.is-themed .app-modal-actions.blend-revert-actions,
.app-modal.is-themed .app-modal-actions.samples-filter-modal-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
/* + a mesma classe na lista `.<classe> > button { width: 100%; min-width: 0 }` */
```

No JSX, a fileira leva `className="app-modal-actions <classe-da-modal>"` e os botões na ordem `[Secondary, Submit]`. A `.sample-detail-compact-modal` já é 50/50 por conta própria (flex `> button { flex: 1 }`) — não precisa entrar na regra compartilhada.

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

`.app-modal-submit.is-warning`:

- Gradient laranja `#f59e0b → #e67e22`
- Usar em acoes de "prosseguir com aviso" — nao destrutivas, mas exigem atencao (continuar apesar de divergencia de lote; confirmar reclassificacao de amostra ja classificada)

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

**Sem excecoes vivas (F1 do redesign, 2026-07-20):** a antiga excecao — status modals inline em `app/clients/[clientId]/page.tsx` — morreu junto com a rota: o detalhe do cliente virou `ClientDetailView` dentro do `DetailOverlay` (um BottomSheet), e o `transform` permanente do `.bottom-sheet` viraria containing block do `position: fixed` do backdrop — os 4 modais inline (editar, documentos, status cliente, status filial) portalam pro body desde entao. Novo motivo pra regra: qualquer conteudo pode acabar montado dentro de um sheet/overlay no futuro.

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

### §11-A — Inventario por pagina × conteiner-alvo (RD11, 2026-07-20)

Levantamento completo (~70 superficies). **"Alvo"** = conteiner pela regra RD11 (preambulo). **Status**: ✅ = ja no alvo; **fica** = ja conforme (nao muda); **🔜 ciclo** = migra quando o ciclo pagina-a-pagina da FV chegar na pagina (com o mockup do Flavio — nada de conversao antecipada); **(confirmar)** = alvo presumido, fechar no plan mode da pagina.

| Pagina                  | Superficie                                                                          | Alvo (RD11)                    | Status               |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------ | -------------------- |
| Global                  | Senha inicial (aviso+form, no-dismiss)                                              | central (aviso)                | fica                 |
| Global                  | Menu do avatar (`HeaderAvatarMenu` `.is-menu`)                                      | intacto (menu)                 | fica                 |
| Global                  | `CameraSheet` + 10 modais de classificacao                                          | intacto (camera)               | fica                 |
| /login                  | Esqueci a senha (wizard `login-modal-*`)                                            | intacto (fora da app)          | fica                 |
| /samples lista          | Filtros (`samples-filter-modal`)                                                    | painel lateral                 | 🔜 ciclo             |
| /samples lista          | Novo lote (`NewSampleModal`)                                                        | side-sheet                     | ✅ `875c777`         |
| /samples lista          | Quick-create cliente (`ClientQuickCreateModal`, todos os contextos)                 | side-sheet                     | ✅ `7a2abbe`         |
| /samples lista          | Descartes/sucessos (confirms + overlays de check)                                   | central                        | fica                 |
| /samples lista          | Liga (`BlendConfirmationSheet` + sucesso + dropdown)                                | operacao — central/intacto     | fica                 |
| /samples lista          | Venda/perda (`SampleMovementModal` + atribuir dono)                                 | operacao — central             | fica                 |
| /samples lista          | Envio (chooser, laudo, fisico, safra do laudo)                                      | operacao — central             | fica                 |
| /samples ?lote=         | Detalhe do lote (`SampleDetailView`)                                                | DetailOverlay                  | ✅ F2                |
| /samples ?lote=         | Editar registro/data (`.sample-detail-reg-edit-modal`)                              | side-sheet (edicao)            | 🔜 ciclo             |
| /samples ?lote=         | Ver/editar classificacao (`.cld-modal`)                                             | side-sheet (view+edit)         | 🔜 ciclo (confirmar) |
| /samples ?lote=         | Confirms (salvar s/ reclassificar, reclassificar, cancelar mov./envio)              | central                        | fica                 |
| /samples ?lote=         | Invalidar (motivo) + bloqueado + reverter liga + propagacao                         | central (destrutivo/aviso)     | fica                 |
| /samples ?lote=         | Imprimir etiqueta; editar envio                                                     | operacao — central             | fica                 |
| /samples ?lote=         | `PhotoZoomViewer`; carimbo/X-effect                                                 | intacto (visualizacao/efeito)  | fica                 |
| /cadastros (PILOTO)     | Filtros (instancia do `samples-filter-modal`)                                       | painel lateral                 | 🔜 ciclo             |
| /cadastros              | Novo cliente (`ClientQuickCreateModal`)                                             | side-sheet                     | ✅ `7a2abbe`         |
| /cadastros ?cliente=    | Detalhe do cliente (`ClientDetailView`)                                             | DetailOverlay                  | ✅ F1                |
| /cadastros ?cliente=    | Editar informacoes (`.client-detail-edit-modal`)                                    | side-sheet (edicao)            | 🔜 ciclo             |
| /cadastros ?cliente=    | Documentos (abas Anexos/Contas + preview + conta nova/detalhe)                      | side-sheet                     | 🔜 ciclo             |
| /cadastros ?cliente=    | Filial nova (`ClientUnitModal`) / detalhe (`ClientUnitDetailModal`)                 | side-sheet (criacao/view+edit) | 🔜 ciclo             |
| /cadastros ?cliente=    | Status cliente/filial (motivo) + cascata (`ClientInactivateWithCascadeModal`)       | central                        | fica                 |
| /cadastros aba Corretor | Corretor (`BrokerFormModal`)                                                        | side-sheet (criacao/edicao)    | 🔜 ciclo             |
| /users                  | Detalhe/editar usuario (`cdm-modal`) + novo usuario                                 | side-sheet                     | 🔜 ciclo             |
| /users                  | Inativar (motivo) + confirms                                                        | central                        | fica                 |
| /profile                | Desativar push (confirm)                                                            | central                        | fica                 |
| /relatorios             | Leque FAB (`InformeCreateRadialFab`)                                                | intacto                        | fica                 |
| /relatorios             | 3 form-sheets (visita/semanal/informativo)                                          | side-sheet (informes)          | 🔜 ciclo             |
| /relatorios             | 3 descartes + aviso 409 + excluir item                                              | central                        | fica                 |
| /relatorios             | Vincular/remover vinculo (curadoria)                                                | central (operacao)             | fica (confirmar)     |
| /contratos              | Criacao (LotPicker + `SaleContractEtapa2Modal`)                                     | **FORA** — specs futuras       | aguarda specs        |
| /contratos ?details=    | Detalhe do contrato (`SaleContractDetailsModal`)                                    | DetailOverlay                  | ✅ F3                |
| /contratos              | Agio; washout/faturar/pagar (`SaleContractLifecycleDialog`); conferencia do espelho | operacao — central             | fica                 |
| /contratos              | Solicitar aprovacao (confirm); lightbox embarque; previa do espelho                 | central / intacto              | fica                 |
| /contratos              | Filtros                                                                             | painel lateral                 | 🔜 ciclo             |
| /embarques              | Confirmacao de embarque (`ShipmentConfirmationModal`)                               | operacao — central             | fica                 |
| /embarques              | Etiqueta de aprovacao (`ApprovalLabelModal` + sucesso)                              | operacao — central             | fica                 |
| Simulador               | Drawer de resultado (ja lateral); connect menu                                      | intacto                        | fica                 |

> As tabelas/notas abaixo (status `.is-themed`, portais, variantes) continuam validas — descrevem o estado ATUAL de cada modal. Este §11-A e a camada de PLANEJAMENTO por cima: pra onde cada superficie vai quando a vez da pagina chegar.

### ✅ Seguem o padrao .is-themed

#### Cliente

| Modal                               | Arquivo                                                   | Variantes                                                                                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ClientUnitModal (Nova filial)       | `components/clients/ClientUnitModal.tsx`                  | `is-themed is-action` (compacto ~30rem, 50/50 `client-unit-modal-actions`; form em grid c/ **acoes fixas** + body rolavel; sucesso via **efeito de check** `client-detail-success-check`) |
| ClientUnitDetailModal (view + edit) | `components/clients/ClientUnitDetailModal.tsx`            | `is-themed is-action` (compacto ~30rem, 50/50 `cudm-edit-actions`)                                                                                                                        |
| ClientInactivateWithCascadeModal    | `components/clients/ClientInactivateWithCascadeModal.tsx` | `is-themed` + `.is-danger`                                                                                                                                                                |
| Edit Client                         | `components/clients/ClientDetailView.tsx` (portal)        | `is-themed is-action` (compacto ~30rem, espelha o reg-edit do lote)                                                                                                                       |
| Documentos (Anexos + Contas banc.)  | `components/clients/ClientDetailView.tsx` (portal)        | `is-themed is-action client-documents-modal` (abas Anexos/Contas; abre pelo botao de folha no header do detalhe)                                                                          |
| Status modal cliente                | `components/clients/ClientDetailView.tsx` (portal)        | `is-themed is-action` (ações 50/50 `client-detail-status-actions`)                                                                                                                        |
| Status modal unit                   | `components/clients/ClientDetailView.tsx` (portal)        | `is-themed is-action` (ações 50/50 `client-detail-status-actions`)                                                                                                                        |

> **F1 do redesign (2026-07-20):** o detalhe do cliente NAO e mais pagina (`/clients/[clientId]` = redirect) — e o `ClientDetailView` montado no `DetailOverlay` em `/cadastros?cliente=<id>` (ver `design-system` §8 "DetailOverlay"). Os 4 modais inline do antigo `page.tsx` (editar, documentos, status cliente, status filial) passaram a portalar pro body (§9 Portal) — dentro do sheet, o `transform` do `.bottom-sheet` capturaria o `position: fixed`. O overlay fica no tier BASE (400/410) justamente pra esses modais (tier 500) abrirem POR CIMA — nao usar `stacked` no overlay. Com modal interno aberto, o `dismissGuardRef` bloqueia ESC/X do overlay.

#### Dashboard

> O **OperationModal** ("Lotes pendentes") do dashboard foi **REMOVIDO em 2026-07-12 (DSB-D2)** junto com os cards de pendencia. Ele era um BottomSheet (`.is-operations`); o CSS (`.bottom-sheet.is-operations`, `.spv2-card-classify-arrow`) foi **mantido** para o rebuild do fluxo de classificar-a-partir-da-fila na pagina de Lotes. A classe `.app-modal-dashboard` ja havia sido removida antes. Ver `docs/Dashboard-Plano-de-Trabalho.md` (DSB-D2).

#### Formularios de informe (prospector + comercial)

| Modal                                        | Arquivo                                                             | Variantes                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excluir item (confirm, viewer Relatórios)    | `components/informe/RelatoriosViewer.tsx` (inline, titulo por tipo) | `is-themed app-confirm-modal` SEM header (titulo no corpo) + `.is-danger` + backdrop `.is-scrim-dark`                                                                                               |
| Excluir informe (dashboard do prospector)    | `components/dashboard/prospector/ProspectorDashboard.tsx`           | `is-themed app-confirm-modal` SEM header (titulo no corpo) + `.is-danger` + backdrop `.is-scrim-dark` (portal)                                                                                      |
| Descartar informe (sheet do prospector)      | `components/visits/VisitReportFormSheet.tsx`                        | `is-themed app-confirm-modal is-stacked` SEM header (titulo no corpo) + `.is-danger` + backdrop `.is-scrim-dark` (portal)                                                                           |
| Descartar visita (sheet do comercial)        | `components/informe/CommercialVisitFormSheet.tsx`                   | `is-themed app-confirm-modal is-stacked` + `.is-danger` (portal)                                                                                                                                    |
| Descartar relatorio (sheet do comercial)     | `components/informe/WeeklyReportFormSheet.tsx`                      | `is-themed app-confirm-modal is-stacked` + `.is-danger` (portal)                                                                                                                                    |
| Relatorio ja enviado (aviso 409, bloqueante) | `components/informe/WeeklyReportForm.tsx`                           | `is-themed app-confirm-modal is-stacked` (botao unico "Entendi", portal)                                                                                                                            |
| Excluir visita/relatorio (pagina comercial)  | `components/informe/InformeCommercialPage.tsx`                      | `app-confirm-modal` SEM header (titulo no corpo) + `.is-danger` + backdrop `.is-scrim-dark` (portal, titulo por tipo)                                                                               |
| Vincular cliente (curadoria do ADMIN)        | `components/informe/RelatoriosViewer.tsx` (inline JSX)              | `is-themed sample-detail-lookup-modal rsm-link-modal` (portal; lookup com `initialSearch` + contexto `.rsm-link-context`; estado vazio → ClientQuickCreateModal prefilled que vincula no onCreated) |
| Remover vinculo (curadoria do ADMIN)         | `components/informe/RelatoriosViewer.tsx` (inline JSX)              | `is-themed app-confirm-modal` + `.is-warning` (portal; re-vinculavel, nao e destrutivo)                                                                                                             |

> Os formularios abrem em BottomSheets (`.bottom-sheet.is-informe`, ver skill `design-system` §8). Confirms de descarte empilham sobre o sheet (`.is-stacked`, `dragDisabled` enquanto aberto) — mesmo padrao do "Descartar lote?" do NewSampleModal. TODOS os confirms acima renderizam via `createPortal(document.body)` (regra do §2) exceto o "Excluir item" do viewer Relatórios (`RelatoriosViewer`), inline historico (os modais de vinculo do mesmo viewer ja portam).

#### Extracao da classificacao (CameraSheet global — Q.cls.2)

Todos seguem `.app-modal.is-themed`. Ordem do fluxo: `idle → preview → handleSendPhoto → detecting → detected → extracting → ` (3a/3b se falha; senão) ` confirming (Review) → classification-meta (etapa Tipo+Classificadores, corpo do SHEET) → submitting (tambem no sheet) → success`. Mismatch/reclassify aparecem no caminho do save.

| Modal                              | Arquivo                                                     | Sub-caminho                         | Variantes                           |
| ---------------------------------- | ----------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| ClassificationExtractionErrorModal | `components/samples/ClassificationExtractionErrorModal.tsx` | Sub-caminhos 3a + 3b                | `is-themed`                         |
| ClassificationDetectFailedModal    | `components/samples/ClassificationDetectFailedModal.tsx`    | Ficha não detectada (detect-failed) | `is-themed`                         |
| ClassificationManualConfirmModal   | `components/samples/ClassificationManualConfirmModal.tsx`   | 2º modal de 3b                      | `is-themed`                         |
| ClassificationLotMismatchModal     | `components/samples/ClassificationLotMismatchModal.tsx`     | Sub-caminho 2 (lote diverge)        | `is-themed`                         |
| ClassificationDataMismatchModal    | `components/samples/ClassificationDataMismatchModal.tsx`    | Sub-caminho 4 (sacas/safra)         | `is-themed is-wide`                 |
| ClassificationReclassifyModal      | `components/samples/ClassificationReclassifyModal.tsx`      | Sub-caminho 5 (reclassificação)     | `is-themed` + `.is-warning`         |
| ClassificationNotFoundModal        | `components/samples/ClassificationNotFoundModal.tsx`        | Flow A legacy fallback              | `is-themed`                         |
| ClassificationStatusInvalidModal   | `components/samples/ClassificationStatusInvalidModal.tsx`   | Status inválido (no Avançar)        | `is-themed`                         |
| ClassificationSuccessModal         | `components/samples/ClassificationSuccessModal.tsx`         | Tela de sucesso pós-classificação   | `is-themed`                         |
| ClassificationDiscardConfirmModal  | `components/samples/ClassificationDiscardConfirmModal.tsx`  | CAM-D5 (descarte do review)         | `.app-confirm-modal` + `is-stacked` |

> Padrao da extracao: avisos de erro/mismatch usam `role="alertdialog"`. Modais com seta de Voltar no header (ManualConfirm) reutilizam a classe `.type-modal-back` que aplica fundo branco translucido + ESC = onBack. **2026-06-18:** todo o fluxo da camera adotou `.is-action` (visual de acao) — header claro + titulo verde + backdrop escuro sem blur; sob `.is-action` o `.type-modal-back` e a `.app-modal-description` viram escuros (regras em `globals.css`). O `ClassificationReviewModal` central foi **REMOVIDO** (codigo morto, 2026-06-18) — a revisao e um BottomSheet (`ClassificationReviewSheetBody` no `.camera-preview-sheet`). A classe `.review-modal` (container) saiu do `globals.css`; as demais `.review-*` (form/section/field/grid/fundos/warning) seguem, usadas pelo SheetBody. **2026-07-16 (ciclo CAM):** todos os modais da tabela adotaram `createPortal(document.body)` (§ Portal — antes renderizavam inline) e o fluxo ganhou o `ClassificationDiscardConfirmModal` (confirmacao de descarte do review, CAM-D5): `.app-confirm-modal` sem header, portal + `.is-stacked` SOBRE o `.camera-preview-sheet` — o sheet da camera e tier regular (400/410), entao a pegadinha do "confirm sobre sheet `stacked`" NAO se aplica aqui. O ESC de cada modal e o unico dono do dismiss: o handler global de ESC da antiga pagina foi removido (CAM-B2), e o dismiss do sheet (ESC/back/backdrop) decide por estado via `onDismissAttempt` (scanner/preview livres, processamento bloqueado, review pergunta). **CAM-P3 (2026-07-16): a pagina `/camera` MORREU** — o fluxo inteiro vive no `CameraSheet` (`components/camera/CameraSheet.tsx`), um BottomSheet global parcial (molde `NewSampleModal`) montado no AppShell via `CameraSheetProvider` e aberto pelo icone de camera do header (`HeaderAvatarMenu`) ou pelos botoes do detalhe do lote (`open({sampleId})`); o `camera-preview-sheet` ganhou o estado `is-scanner` (viewfinder no `.camera-sheet-stage`). Os modais da tabela continuam identicos — abrem por cima com o sheet recolhido entre estados, como antes. **Rodada 2 (2026-07-20, ledger FIN):** o `ClassificationTypeModal` e o
> `ClassificationClassifierModal` foram REMOVIDOS — tipo e classificadores viram
> UMA etapa dentro do proprio sheet (`components/camera/ClassificationMetaStepBody.tsx`),
> com dois campos de altura fixa que abrem lista flutuante ao toque (casca
> `.chip-select-*`; chips removiveis em fila rolavel `.samples-filter-chips-row` +
> `.samples-filter-token*`). O estado `submitting` tambem passou a viver no sheet
> — antes o modal desmontava e NENHUMA superficie ficava na tela durante o save.
> A tabela abaixo tem 10 modais (eram 12). As classes `.type-modal-*` continuam
> vivas: quem usa hoje e o `SendMethodChooserModal` e o `SampleSendFlow`.

**Rodada 1 do ciclo da extracao (2026-07-19, ledger EXT no Classificacao-Plano):** o ExtractionErrorModal kind=technical ganhou a acao primaria "Tentar novamente" (prop `onRetry` — re-extrai com a MESMA foto; "Tirar outra" vira secundaria quando presente); IA indisponivel (`extractionAvailable: false`) pula o aviso de ilegivel e vai direto pro ManualConfirmModal; Flow A com extracao 100% vazia cai no ExtractionErrorModal kind=illegible.

### ⚠ Visual igual mas implementacao com classes proprias (refatorar quando tocar)

| Modal                  | Arquivo                                         | Pendencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ClientQuickCreateModal | `components/clients/ClientQuickCreateModal.tsx` | **MIGRADO pra BottomSheet** (2026-06: slide de baixo + `stacked`) — NAO e mais modal central. Ainda usa classes `client-quick-create-*` pros campos (coabitam com o chrome do sheet); "Descartar cadastro?" e overlay INTERNO (`.client-quick-create-discard-overlay`, scrim escuro `position:absolute`) que envolve o card canonico `.app-modal.is-themed.app-confirm-modal` (mesmo visual do "Descartar lote?" do NewSampleModal, sem portar — ver pegadinha "Sheet sobre sheet" no §3). **Aberto por:** NewSampleModal, SampleMovementModal, SaleContractEtapa2Modal, RelatoriosViewer (curadoria) e CommercialVisitForm (opcao "Cliente novo"). **Pegadinha:** ele tem `<form>` proprio; se o chamador tambem for um `<form>`, renderize o modal FORA dele — o BottomSheet usa portal, mas eventos de portal sobem pela arvore React e o submit do modal dispararia o `onSubmit` do chamador. |

### ⚠ Compactos sem `.is-themed` (legados, refatorar quando tocar)

Estes usam `.app-modal` simples (430px max, fundo glass) ou variante `cdm-modal` em vez de `.is-themed`:

- `cdm-modal` (Client Detail Modal em `/clients`, `/users`, `/samples`)
- `InactivateUserModal`, `CancelInactivationDialog`, `InactivateConfirmDialog` em `/users`
- `SampleLookupResultModal` — usa `.app-modal-lookup-result` legacy mas **ja renderiza via portal pra body** (fix pra bug de stacking sob `<PageTransition>` no dashboard).

> Refatorar pra `.is-themed` somente quando tiver outro motivo pra mexer no modal — nao e prioridade visual hoje.

> **`samples-filter-modal`** (`/samples` e, desde 2026-06-17, **`/clients`** — que reusa o mesmo CSS, keyed por classe, com `<select>` simples no lugar dos campos retráteis) usa `.app-modal.is-themed` mas adota o **VISUAL DE AÇÃO** (form que o usuário opera): overrides escopados a `.samples-filter-modal` dão **header CLARO (`#fff`) + título verde à esquerda + X claro (`#eef1ee`) + backdrop ESCURO sem blur** — igual ao `.app-modal-lookup-result` e aos bottom sheets; o header verde do `.is-themed` fica reservado pra AVISO/confirm. Estrutura **custom**: body rolavel (`.samples-filter-modal-content` = `overflow-y: auto; overflow-x: hidden`) + **actions fixas** fora do scroll (`.samples-filter-modal-form { flex: 1; grid-template-rows: minmax(0,1fr) auto }`). Largura 26rem via `.app-modal.is-themed.samples-filter-modal` (3 classes). Os 3 campos de cliente (Proprietário/Comprador/Enviado para) são **RETRÁTEIS** (disclosure — ver `design-system` §"Campos de filtro multi-select"). **Portalado em 2026-07-07 (ciclo LOT, LOT-L2):** o de `/samples` renderiza via `createPortal(document.body)` com guarda de SSR; o `SendMethodChooserModal` idem. _(A instância do `/clients` que reusa o CSS segue inline — conferir no ciclo CLI.)_

> **Modal de venda/perda** (`SampleMovementModal`, `.sample-detail-movement-modal`) migrou pra `.is-themed` (header + content + `app-modal-field/-input/-actions`). Largura 30rem escopada; `position: relative` pra ancorar o overlay do carimbo. Campos **empilhados** (cada um em linha própria full-width: Comprador/Motivo → Sacas → Data → Observações); o botão "Todas" fica inline com o input de sacas via `.sdv-mov-qty-inline` (mesma altura). Ações **50/50** (`.sample-detail-movement-actions` — regra compartilhada com reclassify/reg-edit) na ordem **Cancelar (esq) / Registrar (dir)**. O sub-modal "Atribuir dono" (ligas) também é `.is-themed` e renderiza via `createPortal` pra body (o pai tem `overflow: hidden`). **Sucesso = carimbo**: overlay `.sdv-stamp-overlay.is-sale/.is-loss` com `.sdv-stamp` na diagonal ("Vendido" dourado / "Perdido" vermelho, anel duplo + `mix-blend-mode: multiply`), animação de _slam_ (`sdv-stamp-slam`) e tremor do modal (`.is-stamping` → `sdv-stamp-shake`), com guarda `prefers-reduced-motion`. O carimbo aparece antes de fechar (o `SampleMovementsPanel` segura o modal ~1.5s via `stampType`). O **modal de cancelar movimentação** (no `SampleMovementsPanel`) também migrou pra `.is-themed` (`.sample-detail-compact-modal`, 28rem, ações 50/50 com `.app-modal-submit.is-danger` + secundário "Voltar"). Os cards de venda/perda **não têm mais editar** — só excluir (cancelar) — e a lista `.sdv-com-movements` tem scroll interno com teto de ~4 cards no mobile (`max-height`; no desktop o pane preenche, `max-height: none`). **2026-06-18:** venda/perda, atribuir dono e cancelar movimentação carregam `.is-action` (header claro + backdrop escuro sem blur — ver §3); os overlays de carimbo seguem como efeito, sem chrome de modal. O **cancelar envio** (confirm no timeline de Movimentações, antes `cdm-modal` legacy inline em `page.tsx`) foi refatorado pra `.app-modal is-themed is-action sample-detail-compact-modal` (header/content/actions canônicos, X com `&times;`).

> **Modais de invalidar amostra** (`.sample-detail-invalidate-modal`, inline em `/samples/[sampleId]`) e **reverter liga** (`BlendRevertModal`) migraram pra `.is-themed`, ações **50/50** (`.sample-detail-invalidate-actions` / `.blend-revert-actions`) com `.app-modal-submit.is-danger`. Avisos em **vermelho** via `.sdv-warn-box` (ícone de triângulo) dentro do `.app-modal-content`. **Sucesso = efeito de X vermelho** (`.sdv-x-effect`, overlay full-screen via `createPortal`): "Movimentações canceladas" (fica na página) ou "Amostra invalidada" / "Liga revertida" (depois volta pra `/samples` via `router.push`) — substitui as mensagens verdes (`generalNotice`) que apareciam no container. Estado `xEffect: string | null` + helper `showXEffect(label, redirectToList)`. **2026-06-18:** ambos passaram a carregar `.is-action` (header claro + backdrop escuro sem blur — ver §3); o vermelho de destrutivo segue vindo do botao `.is-danger` e do `.sdv-warn-box`, nao do header.

> **Modal de edicao de registro** (`/samples/[sampleId]`, `.sample-detail-reg-edit-modal`) migrou pra `.is-themed` com a mesma estrutura custom de body rolavel + actions fixas (grid `.sample-detail-reg-edit-form { flex: 1; grid-template-rows: minmax(0,1fr) auto }`, body em `.sample-detail-reg-edit-body`). Largura 30rem escopada (3 classes), inputs mais compactos e `notice-slot` colapsado quando vazio. Botoes **50/50** (largura toda, grid `1fr 1fr` via `.sample-detail-reg-edit-actions` — regra compartilhada com o modal de reclassificacao `.sample-detail-reclassify-actions`) na ordem **Cancelar (esq) / Salvar (dir)** — divergencia intencional do canonico `[Submit, Secondary]` em flex-end. Erros de validacao **por campo** (placeholder vermelho + `.app-modal-input.has-error`, limpa ao focar; o submit NAO bloqueia por campo invalido — deixa a validacao rodar e marcar o campo) e sucesso via **efeito de check** (`.client-create-success-overlay`, sem mensagem). Ainda inline (sob AppShell). **2026-06-18:** carrega `.is-action` (header claro + backdrop escuro sem blur — ver §3), junto de "enviar amostra" e "imprimir etiqueta" do mesmo container.

> **Modal de confirmacao de propagacao (safra/proprietario)** (`BlendHarvestPropagationModal`, `.blend-harvest-propagation-modal`) segue `.is-themed` + `createPortal`, acoes **50/50** (`.blend-harvest-propagation-actions` — regra compartilhada) na ordem **Cancelar (esq) / `Aplicar e propagar` (dir, `.app-modal-submit.is-warning`)**. Disparado pelo 409 `BLEND_HARVEST_PROPAGATION_REQUIRED` ao salvar a edicao de SAFRA ou PROPRIETARIO de um lote que e origem de ligas ativas (avisar-e-confirmar): lista as ligas afetadas com a transicao de safra e/ou proprietario (`.bhp-*`, com rotulo `.bhp-change-label` por linha) e destaca as comercializadas/classificadas (`.sdv-warn-box` + chips `.bhp-chip`). Ao confirmar, re-submete o update com `confirmHarvestPropagation: true`. **2026-06-18:** carrega `.is-action` (header claro + backdrop escuro sem blur — ver §3), junto do `SampleInvalidateBlockedModal` (`.sample-invalidate-blocked-modal`, aviso reativo de invalidacao bloqueada por liga) — esses 2 avisos reativos fecham o detalhe da amostra 100% no visual de acao.

> **Modal de selecao de safra do laudo** (`ReportHarvestSelectModal`, `.report-harvest-select-modal`) segue `.is-themed` + `createPortal`, acoes **50/50** (`.report-harvest-select-actions`) na ordem **Voltar (esq) / Confirmar (dir)** — Confirmar so habilita apos escolher uma safra. Aberto ao confirmar o destinatario do laudo quando a amostra tem mais de uma safra (liga): lista as safras como radio cards (`.rhs-option` + `.rhs-option-mark`, `role="radiogroup"`, selecao unica) pra o operador escolher qual sai no laudo — o PDF nunca imprime a safra concatenada (anti-vazamento de liga). "Voltar" reabre o modal de destinatario; "x" cancela.

> **Container de Classificacao do detalhe (`/samples/[sampleId]`) — visual de ACAO (2026-06-18):** todos os modais do container de classificacao adotaram `.is-action` (ver §3). O **detalhe da classificacao** (`.cld-modal`) ja era `.app-modal is-themed is-wide` (mantem os `cld-*` — cld-header/section/field/grid — pro layout interno, incl. a secao "Tipo" do audit Q.cls.2) e ganhou `is-action`. Tambem em `.is-action`: **confirmar salvar** (`.sample-detail-compact-modal`), **gerar laudo** (`.sample-detail-lookup-modal`, export), **safra do laudo** (`.report-harvest-select-modal`, componente via portal) e **reclassificar** (`.sample-detail-reclassify-modal`). O `PhotoZoomViewer` (foto ampliada) **NAO** migra — overlay full-screen, excecao legitima. Sem CSS novo: tudo vem do modificador compartilhado `.is-action`. _(O modal legado **"confirmar motivo da edicao"** foi REMOVIDO no ciclo LDT (2026-07-08) — era codigo morto inatingivel; a edicao de classificacao coleta o motivo dentro do proprio `.cld-modal`.)_

> **Pendencia LDT-P1 (2026-07-08):** os ~8 modais proprios do detalhe do lote renderizam **inline** (`<div className="app-modal-backdrop">` na arvore da `.sdv-page`), sem `createPortal` — divergem do §2, mas **sem bug ativo** (nao ha sheet-pai portalado no detalhe). Portar fica pra um passe dedicado (risco visual > ganho). Os satelites (`SampleSendFlow`, `BlendRevertModal`, etc.) ja portam.

> **Botao "Enviar" unificado via CHOOSER (2026-06-18):** o botao "Enviar" do detalhe (`/samples/[sampleId]`, card Informacoes) abre PRIMEIRO um modal chooser **`SendMethodChooserModal`** (`components/samples/SendMethodChooserModal.tsx`, `.app-modal.is-themed.is-action.type-modal`) com 2 escolhas: **"Descricao"** (→ gerar laudo/export; `.is-disabled` + `.type-modal-choice-hint` "Disponivel apos classificar" quando a amostra NAO e CLASSIFIED) e **"Fisico"** (→ enviar amostra). Roteia pros fluxos que ja existiam (handlers reaproveitados; backend inalterado). O antigo botao **"Laudo" saiu** do card Classificacao (→ "Classificar" ocupa a largura toda, `flex:1`). Os modais de destino — **"Gerar laudo"** (`.sample-detail-lookup-modal`) e **"Enviar amostra"** — ganharam **seta de voltar** (`.type-modal-back`) que reabre o chooser; no "Enviar amostra" a seta so aparece em envio NOVO (na EDICAO via timeline nao ha chooser/seta). O header agrupa seta+titulo com a classe nova `.sdv-send-head-left` (o resto reusa `type-modal*`). Estado `sendChooserModalOpen` no `page.tsx` (+ cleanup por sampleId).

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
       confirming (Review no sheet) ─── "Cancelar" ─── reset
           │
           ▼ "Avançar" — sheet valida lote obrigatorio (inline) + ≥1 campo + numerico → handleReviewAdvance valida status/existencia ANTES do tipo:
           │     ├── Flow A: resolve lote → nao encontrado ─► not-found (NotFoundModal) ─ "Voltar"/"Cancelar"
           │     ├── status ∉ {RC, CLASSIFIED} ───────────► status-invalid (StatusInvalidModal) ─ "Cancelar"/"Ver detalhes"
           │     └── ok ─► classification-meta
           ▼
       classification-meta — ETAPA DO SHEET (nao e modal): campo Tipo (dropdown,
           │                 obrigatorio) + campo Classificadores (chips com x,
           │                 fila rolavel). Footer: "Voltar" ─► confirming
           │ "Confirmar"
           ▼
       handleConfirmClassification (status/resolve ja feitos no Avancar)
           ├── lote(editavel) ≠ contextSampleLot ──► lot-mismatch (LotMismatchModal):
           │         ├ "Voltar"    ─ re-captura (reset)
           │         ├ "Continuar" ─ ACEITA o lote da amostra (o da ficha e sobrescrito)
           │         └ "x"         ─ sai do fluxo
           ├── divergencias sacas/safra ───────────► data-mismatch (DataMismatchModal) ─ ESCOLHA campo a campo ─► "Aplicar" ─► save (ou overwrite-confirm se CLASSIFIED)
           │                                          "Cancelar" ─ pergunta antes de descartar (CAM-D5)
           ├── sample CLASSIFIED ──────────────────► overwrite-confirm (ReclassifyModal com reason):
           │         ├ "Confirmar recl." (laranja/is-warning, direita) ─► save
           │         ├ "Voltar" (esquerda) ─ classification-meta (etapa anterior)
           │         └ "x" ─ cancela processo (hasContext ? fecha o sheet : reset)
           └── tudo OK ─────────────────────────────► saveClassification → submitting (NO SHEET) → success
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
- [ ] Submit: `.app-modal-submit` (verde), `.app-modal-submit.is-danger` (vermelho, terminal) ou `.app-modal-submit.is-warning` (laranja, prosseguir-com-aviso)
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

Exemplo de referencia do canonico central: `ClientUnitModal`. _(O `ClientQuickCreateModal`, antes citado aqui como modal central divergente, virou **BottomSheet** em 2026-06 — ver §1 e a secao de Bottom Sheet no `design-system` §8.)_

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
