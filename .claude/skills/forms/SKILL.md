---
name: forms
description: Use this skill whenever building or editing a form in the PWA — fields, labels, client lookup, multi-select chips, choice cards, submit button, validation errors, success feedback, discard-on-dirty. Defines the FV field kit (.fv-form-*, .fv-choice*), where the submit lives, error-inside-the-field, and the canonical success check.
---

# Formulários — o kit de campos FV

O contêiner onde o form mora está em `containers`. Aqui é o que vai **dentro** dele.

Todo form novo usa `.fv-form-*`. `.client-quick-create-*` e `.app-modal-field` são aliases legados —
não usar em código novo.

---

## §1 Molde canônico

```tsx
<BottomSheet
  open={open}
  onClose={onClose}
  onDismissAttempt={() => !saving && !success}
  ariaLabel="Registrar perda"
  stacked={stacked}
  closeVariant="edge-back"
  dragDisabled={saving}
  className="fv-panel-sheet side-sheet sample-loss-sheet"
  footer={
    <button type="submit" form="sample-loss-form" className="app-modal-submit" disabled={saving || submitDisabled}>
      {saving ? 'Registrando...' : 'Registrar perda'}
    </button>
  }
>
  <>
    <p className="fv-panel-lead">As sacas saem do saldo do lote e a perda entra na linha do tempo.</p>

    <form id="sample-loss-form" className="fv-form-body" onSubmit={handleSubmit}>
      <label className="fv-form-field">
        <span className="fv-form-label">Motivo da perda</span>
        <input value={reason} disabled={saving} onChange={…} placeholder="Descreva a origem da perda" />
      </label>

      <div className="fv-form-row fv-form-row-2col">
        <label className="fv-form-field">
          <span className="fv-form-label">Data</span>
          <input type="date" value={date} disabled={saving} onChange={…} />
        </label>
        <label className={`fv-form-field${overLimit ? ' is-field-error' : ''}`}>
          <span className="fv-form-label">Sacas</span>
          <input value={sacks} inputMode="numeric" disabled={saving} onChange={…} />
        </label>
      </div>
    </form>

    <SuccessCheckOverlay show={success} />
  </>
</BottomSheet>
```

Quatro coisas estruturais neste molde:

1. O `<form>` tem **`id`**; o botão fica no `footer` do sheet com `form={id}`.
2. `SuccessCheckOverlay` é **irmão do `<form>`, filho direto** do conteúdo do sheet.
3. `.fv-panel-lead` é a linha de apoio no topo (o que era a descrição no header do modal central —
   o header do painel só tem a seta).
4. Todo `disabled` acompanha `saving`.

---

## §2 O kit `.fv-form-*`

| Classe                 | O que faz                                                              |
| ---------------------- | ---------------------------------------------------------------------- |
| `.fv-form-body`        | grid do form, gap ~0.72rem (0.9rem no desktop)                         |
| `.fv-form-heading`     | micro-cabeçalho de seção: small-caps muted + hairline                  |
| `.fv-form-row`         | linha de 1 coluna                                                      |
| `.fv-form-row-2col`    | linha de 2 colunas, `align-items: end`                                 |
| `.fv-form-field`       | o campo (label + controle), `<label>` envolvendo tudo                  |
| `.fv-form-label`       | **marcador semântico — não tem CSS**; o estilo vem do `.fv-form-field` |
| `.fv-form-required`    | asterisco vermelho                                                     |
| `.fv-form-field-error` | mensagem de erro abaixo do campo                                       |
| `.fv-form-actions`     | rodapé de 2 ações lado a lado (form **fora** de painel)                |

Geometria do controle, herdada por `input`/`select`/`textarea` dentro de `.fv-form-field`:
`min-height: 2.62rem` · `border: 1px solid var(--fv-line-strong)` · `border-radius: var(--fv-radius)`
· foco `border-color: var(--fv-cta)` + `box-shadow: 0 0 0 3px rgba(23,60,48,.12)`.

**Não redeclarar essa geometria escopada.** Se um campo composto (markup próprio) precisa dela, o
caminho é uma regra pequena que aplica o mesmo desenho ao markup dele — não copiar o bloco.

O fix do `input[type='date']` (WebKit ignora `width` e estoura a coluna em linha de 2 colunas) já
está no kit. Não repetir por painel.

---

## §3 Campos compostos

### `ClientLookupField`

Busca de cliente com dropdown. Props que decidem o comportamento:

| Prop                                | Uso                                                     |
| ----------------------------------- | ------------------------------------------------------- |
| `selectedClient` / `onSelectClient` | par controlado                                          |
| `kind`                              | escopo da busca                                         |
| `onRequestCreate` + `createLabel`   | CTA de "não achei, cadastrar" no estado vazio           |
| `createButtonStyle`                 | `'inline-cta'` dentro de painel; `'secondary'` fora     |
| `clearOnSelect`                     | multi-select: o pai guarda o array e renderiza os chips |
| `initialSearch`                     | sugestões já no primeiro foco                           |
| `invalid` / `invalidText`           | erro dentro do campo                                    |
| `compact`                           | geometria reduzida                                      |

**Quick-create a partir do lookup:** o `ClientQuickCreateModal` abre como painel `stacked` por cima.
Ele é intocável — usar como está, com `onCreated` religando a seleção.

### Multi-select de chips

`.samples-filter-multi` com as variantes `--lookup` (busca), `--select` (lista fixa) e
`--retractable` (disclosure, para filtros pouco usados). Rótulo do chip capado em ~10 chars + `…`,
nome completo no `title`.

Existem **dois kits paralelos** de multi-select (`.samples-filter-multi*` e `.chip-select-*`). O
primeiro é o canônico; ao tocar num consumidor do segundo, migre.

### Opção única

`<select>` nativo dentro de `.fv-form-field`. Não construir dropdown próprio para escolher um valor
de uma lista — o nativo é acessível, funciona no mobile e já tem a geometria do kit.

---

## §4 `.fv-choice*` — escolher entre poucas opções

```tsx
<div className="fv-choice-group" role="radiogroup" aria-label="Tipo de envio">
  {options.map((option) => (
    <button
      key={option.value}
      type="button"
      role="radio"
      aria-checked={method === option.value}
      className={`fv-choice${method === option.value ? ' is-selected' : ''}`}
      disabled={!option.allowed || saving}
      onClick={() => selectMethod(option.value)}
    >
      <span className="fv-choice-label">{option.label}</span>
      <span className="fv-choice-hint">{option.allowed ? option.hint : option.disabledHint}</span>
    </button>
  ))}
</div>
```

Grid de 2 colunas, cartões com rótulo + uma linha de apoio. Selecionado = hairline da marca + anel +
lavagem discreta. O toque **afunda** (`scale(0.985)`), sem trocar de cor.

### 🔴 A regra que originou o componente

**Um seletor de 2–4 opções que só decide para onde ir não merece uma superfície própria — ele vira
um campo do destino.** Escolher "físico ou descrição" num modal central e depois abrir um painel
para preencher os destinatários é um passo a mais sem informação nova: o usuário já sabia o que
queria antes de clicar. Tipo e destinatário na mesma etapa, com o rótulo do submit mudando conforme
a escolha ("Gerar laudo" / "Enviar").

**Opção bloqueada escreve o motivo** no `fv-choice-hint` (`disabledHint`). Cartão apagado sem
explicação vira um beco.

---

## §5 Submit

- Botão **no `footer` do sheet**, ligado ao form por `form={id}`. Classe `.app-modal-submit`.
- **Sem "Cancelar" textual** — a seta ← da borda cancela. O único "Cancelar" legítimo é o interno de
  um modo edição de view↔edit, que volta para o view sem fechar o painel.
- Duas ações reais no footer (nunca "Cancelar" + "Salvar") → `.fv-panel-footer-row` (2 colunas
  iguais). Fora de painel, `.fv-form-actions`.
- Rótulo de saving no gerúndio, com reticências: `{saving ? 'Registrando...' : 'Registrar perda'}`.
  Se o submit bifurca, o rótulo bifurca junto.
- `disabled={saving || submitDisabled}` — validação de forma no `submitDisabled`, nunca deixar o
  usuário clicar para descobrir.

### 🔴 Botão DENTRO do `.fv-form-body` (form inline, sem painel)

O molde acima assume o botão no footer do sheet. Quando o formulário é **inline** — sem painel, sem
footer, como o acordeão de `/profile` —, o `.fv-btn` vira **filho direto do `.fv-form-body`**, que é
um `display: grid`. Grid estica os filhos por padrão, e o `.fv-btn` **não centraliza o conteúdo**
(não tem `justify-content`). Resultado: o botão vira uma barra da largura do cartão com o rótulo
colado à esquerda.

```css
/* escopo da página, não do kit */
.<escopo > .fv-form-body > .fv-btn {
  justify-self: start;
}
```

CTA compacto é o padrão institucional — o mesmo do `+ Novo usuário` na `.fv-page-head`. Se forem
**dois** botões lado a lado num flex, o par também precisa de `flex: 0 0 auto`, senão estica igual.

---

## §6 Erro dentro do campo

Preferência firme do projeto: **o erro aparece no campo, não acima do form.**

```tsx
<label className={`fv-form-field${overLimit ? ' is-field-error' : ''}`}>
  <span className="fv-form-label">Sacas</span>
  <input
    value={sacks}
    onChange={(e) => {
      setSacks(clean(e.target.value));
      setError(null);
    }}
  />
  {overLimit ? <p className="fv-form-field-error">Acima do disponível</p> : null}
</label>
```

- `is-field-error` no **wrapper** pinta a borda de vermelho suave.
- `.fv-form-input-error` no **input** pinta o placeholder.
- **O erro limpa ao digitar**, não no próximo submit.
- Vermelho é `#c45c5c` (suave, não alarme).

Erro geral do form (falha de rede, 409 do servidor) vai numa linha no **fim** do `<form>`, não no
topo — o usuário está olhando para o botão quando o erro chega.

Copywriting, toasts e banners: `feedback-messages`.

---

## §7 Sucesso

`components/SuccessCheckOverlay.tsx` — overlay TERMINAL único, véu branco cobrindo o painel inteiro
(header e footer, mesmo com o corpo rolado). Três variantes pelo caráter da ação (a posição e a
entrada são as mesmas; só o desenho central muda):

```tsx
<SuccessCheckOverlay show={success} />                                {/* check verde: criação/edição */}
<SuccessCheckOverlay show={cancelSuccess} variant="x" label="Envio cancelado" />   {/* reversão no sheet */}
<SuccessCheckOverlay show={lossSuccess} variant="stamp-loss" label="Perda registrada" /> {/* carimbo */}
```

**Filho DIRETO do conteúdo do sheet.** O `position: absolute` ancora no sheet (que é `fixed`); se
ficar dentro do `<form>` ou de um wrapper com `overflow`, cobre só um pedaço. Para cobrir a TELA
(overlay portalado no `body`, sem sheet posicionado por baixo — ex.: sucesso da classificação na
câmera), passar **`fixed`** (`position: fixed`).

Tempo ÚNICO: `SUCCESS_CHECK_MS = 900`, **exportado do próprio componente** (era 800/900/1000
espalhados). Importar dele, não redigitar o número:

```tsx
import { SuccessCheckOverlay, SUCCESS_CHECK_MS } from '../SuccessCheckOverlay';
window.setTimeout(() => {
  setSuccess(false);
  onClose();
}, SUCCESS_CHECK_MS);
```

Três coreografias (todas no mesmo tempo): **check e fecha** (ação terminou), **check e abre outra
coisa** (criação → detalhe do que criou), **flash sem fechar** (salvou um trecho, o painel segue).

**Frases "... com sucesso" não existem mais nesses fluxos.** Durante o efeito o dismiss fica
bloqueado (`onDismissAttempt` retorna `false`) e o footer some (`success ? null : ...`) — o painel
já está a caminho do próximo passo.

---

## §8 Descartar rascunho

```tsx
async function handleDismissAttempt(): Promise<boolean> {
  if (state.status === 'submitting') return false;
  if (state.step === 'created') return false; // check na tela
  if (state.dirty) {
    setConfirmDiscardOpen(true);
    return false; // abre o confirm em vez de fechar
  }
  return true;
}
```

O confirm é central, portalado para o `body`, com `.is-scrim-none` (fundo **não** escurece nem
borra — a tela atrás fica como estava) + `.is-compact`, `role="alertdialog"` e `autoFocus` no
"Continuar" (a saída segura). Enquanto ele está aberto: `dragDisabled` no sheet, senão um drag
past-threshold com dismiss negado deixa o painel deslocado.

O `dirty` é do form, não do sheet: qualquer campo tocado liga a flag e ela não desliga.

---

## §9 Checklist

- [ ] `.fv-form-*` (não `.app-modal-field`, não `.client-quick-create-*`)
- [ ] `<form id>` + submit no footer com `form={id}`
- [ ] Sem "Cancelar" textual
- [ ] Rótulo de saving no gerúndio, bifurcando se o submit bifurca
- [ ] `disabled` de todo campo acompanha `saving`
- [ ] Erro dentro do campo, limpando ao digitar; erro geral no fim do `<form>`
- [ ] `SuccessCheckOverlay` como filho direto do conteúdo do sheet
- [ ] `dirty` → confirm `.is-scrim-none.is-compact` + `dragDisabled`
- [ ] Guard no `onDismissAttempt`, nunca no `onClose` (`containers` §3)
- [ ] Escolha de 2–4 opções é campo do form, não superfície própria; bloqueada explica o motivo
- [ ] Opção única = `<select>` nativo
- [ ] Textos em pt-BR
