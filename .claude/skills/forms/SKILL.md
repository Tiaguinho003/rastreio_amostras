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
| `.fv-form-row-3col`    | 3 campos curtos, `auto-fit` de `minmax(8.5rem, 1fr)` — degrada sozinho |
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

🔴 **É por DESCENDÊNCIA, não filho direto** — `.fv-form-field input` (0,1,1). Isso é o que faz um
composto como o `ClientLookupField` (cujo `<input>` não tem classe) ganhar a geometria de graça. E é
o que **quebra** o input interno de um composto que **não** deve parecer campo: a caixa de chips tem
o próprio `.bms-control` desenhado, e o `.bms-input` lá dentro precisa ficar sem borda. Uma classe
só (0,1,0) **perde** para o kit. Conserto no componente, não no escopo da página:

```css
.bms-control .bms-input {
  /* 0,2,0 — ganha do kit e vale em qualquer form que hospede a caixa */
  min-height: 0;
  border: 0;
  background: transparent;
}
```

Ao pôr um composto dentro de um `.fv-form-field` pela primeira vez, conferir **todo `<input>`
aninhado**: o que deve virar campo, e o que é peça interna de outro controle.

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

### Busca com dropdown para um recurso que não é cliente

`ClientLookupField` resolve clientes. Para outro recurso, **copie o molde, não as classes** — um
prefixo próprio (`.ctr-lotfield-*` para o lote do contrato), porque o kit do cliente é dele. O que
se copia: debounce → busca → dropdown absoluto, sincronizar o texto quando a seleção muda por fora,
fechar no `mousedown` de fora, limpar (×), e `invalid` pintando a borda.

O que **não** se copia:

- **A geometria do input.** Dentro de um `.fv-form-field` ela vem do kit por descendência (§2). O
  bloco novo traz só a caixa flutuante e a linha de opção.
- **O piso de caracteres.** `lookupClients` responde 422 abaixo de 2 chars, por isso o campo de
  cliente espera. `listSamples` aceita busca vazia — então abrir o campo **já mostra** a primeira
  página, sem obrigar a digitar. Confira o backend antes de replicar a espera.
- **O scroll infinito.** Dropdown de campo mostra os primeiros N e **diz que capou** ("Mostrando os
  primeiros 8. Refine a busca para ver outros."). Um corte silencioso lê como "só existem 8".

🔴 **A borda vermelha do erro precisa de uma regra.** `.fv-form-field.is-field-error` pinta `input` e
`select` **diretos**; um controle composto fica de fora. O painel do contrato mantém uma lista
escopada com todos eles (`.client-lookup-shell input`, `.ctr-lotfield-shell input`, `.bms-control`,
`.ctr-approval-btn`) — campo composto novo entra ali.

### Campo travado — o valor existe, a edição não

Três casos: o valor **pertence a outro registro** (Vendedor = dono do lote, RC-D37), o valor **é do
sistema** (Nº do contrato, gerado na emissão; Tipo, decidido pelo botão que abriu o painel — RC-D70),
ou o valor **só se decide uma vez** (o Lote, escolhido na criação e imutável no Editar — RC-D72).

Em nenhum deles o campo é `<input disabled>` — o navegador o desbota e ele continua parecendo um
controle. **Duas apresentações, e quem escolhe é a VIZINHANÇA da linha** (RC-D73):

| A linha é...                                  | Apresentação                       | Classe              |
| --------------------------------------------- | ---------------------------------- | ------------------- |
| **toda travada** (Nº do contrato + Tipo)      | valor solto, sem caixa             | `.ctr-locked-value` |
| **mista** — divide com um controle de verdade | a caixa do kit, superfície recuada | `.ctr-locked-field` |

```tsx
{
  /* linha toda travada: valor solto */
}
<div className="fv-form-field">
  <span className="fv-form-label">Nº do contrato</span>
  <p className="ctr-locked-value">{displayContractNumber}</p>
  <span className="ctr-locked-hint">Gerado na emissão.</span>
</div>;

{
  /* linha mista: o Vendedor divide com a filial, que é um select de verdade */
}
<div className={fieldClass('seller')}>
  <span className="fv-form-label">Vendedor</span>
  <p className="ctr-locked-field" aria-disabled="true">
    {seller?.displayName ?? 'Sem produtor'}
  </p>
</div>;
```

**Por que a vizinhança decide.** Valor solto ao lado de uma caixa lê como **campo faltando**, não
como campo resolvido — o olho procura o controle que sumiu. Numa linha inteiramente travada não há
com o que comparar, e a caixa vira moldura vazia. A regra é a mesma dos dois lados: **parecer o que
é**.

`.ctr-locked-value` tem o peso do texto do formulário (0.92rem/600, `--ink`). `.ctr-locked-field`
copia a geometria de `.fv-form-field input` — um `<p>` não é alcançado por aquele seletor, então ela
**não vem por herança** — e troca só o fundo para `--fv-canvas`; sem `:focus`, com `cursor: default`
e `aria-disabled`, que é o "não clicável" que o desenho sozinho não diz.

`.ctr-locked-hint` é a instrução (0.74rem, `--muted`) e é **opcional**: só existe quando há o que
fazer em outro lugar ou algo a saber. Some quando a resposta é óbvia — "À vista" não precisa explicar
por que não se edita, e o Vendedor perdeu a dele a pedido do Flavio.

🔴 **Travado não é a mesma coisa que fora do formulário.** Já houve a tentativa oposta: juntar tudo o
que não se edita num **cartão** no topo (RC-D59, morto na RC-D70). O que aquilo consertava era o
_pseudo-campo_ — rótulo + caixa de input desabilitada, que convida ao clique e não faz nada — e isso
o campo travado já resolve, sem tirar o dado da sequência do formulário. Cartão só se justifica se os
fatos não pertencerem a nenhum campo; se pertencem, o dono é o campo.

Quatro armadilhas, nesta ordem:

- **O que a tela mostra é o que o servidor vai gravar**, não o que está salvo. Se os dois podem
  divergir, a leitura tem que trazer o valor de origem (ali, `getSaleContract` devolve `sampleOwner`).
  E se o contrato guarda só o **id** do outro registro, a leitura precisa trazer o rótulo também —
  senão o campo diz "Lote" e não diz qual (`sampleLotNumber`, RC-D72).
- **Campos que dependiam do valor antigo precisam ser zerados** na hidratação, senão o submit estoura
  um 422 de FK numa edição que nem tocou no campo travado (ali, filial + conta bancária).
- 🔴 **E o zeramento precisa se explicar.** Campo esvaziado em silêncio vira "campo obrigatório" no
  submit — um erro que o operador não causou. Banner no topo do form (`.ctr-form-notice`, tom
  neutro: nada falhou), que **some quando o campo é reescolhido**, não por tempo. É estado
  persistente, não aviso efêmero — skill `feedback-messages` §1.
- **O campo travado sai do payload.** Se o servidor não lê, mandá-lo é erro do chamador, não dado a
  descartar: o backend recusa (RC-D40, 422 `SELLER_DERIVED_FROM_SAMPLE`) e o front omite. Um campo
  aceito-e-ignorado mente sobre o que faz.

#### Terceira apresentação: travado que MANTÉM a forma do editor

As duas da tabela acima assumem que o valor é um texto. Quando o campo tem um **editor próprio**
(chips, multi-select), a versão travada é o **mesmo componente em `disabled`**, não um `<p>` — o
`OriginLotChips` já traz chip sem o ×, sem input e um `—` no vazio (RC-D100, `ApprovalLabelModal`).
Trocar chips por uma string separada por vírgula faria o operador ler outra coisa que não o dado.

**E travado por MOTIVO escreve o motivo.** Quando o mesmo campo às vezes edita e às vezes não, o
`lockReason` vem do servidor e vira uma frase (`.alm-field-hint`):

| lockReason        | Frase                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `BLEND`           | "É uma liga: a origem vem dos lotes que a compõem."               |
| `BLEND_COMPONENT` | "Este lote compõe uma liga — editar aqui alteraria a liga junto." |
| `NO_SAMPLE`       | "Contrato futuro — não há lote vinculado."                        |

É o mesmo princípio do `disabledHint` do `.fv-choice` (§4): opção apagada sem explicação vira beco.
E o **alvo da escrita vem nulo quando travado** — `sampleId`/`sampleVersion` só chegam se
`editable` — para que um bug de UI não consiga montar a chamada a partir de um campo que não edita.

#### Campo que grava em OUTRO registro (cascata)

Um campo pode escrever fora do formulário em que está — o Lote de origem da etiqueta grava no
cadastro do lote, o Nº compra grava no contrato (RC-D99/D100). Quatro regras, e a primeira é a que
não é óbvia:

- 🔴 **Edite o DADO, nunca a representação recortada dele.** Os chips que o modal mostrava vinham de
  uma função que corta em 16 chars e troca tudo acima de 8 por um `"+"` de desenho. Salvar de volta o
  que estava na tela apagaria os lotes que o `"+"` representa — **sem ninguém editar nada**. O estado
  passou a ser o texto cru; o recorte virou só o que vai ao papel. Onde um campo exibe uma forma
  **derivada** do valor, a edição tem que ser sobre o valor.
- **Grave antes do efeito colateral.** O modal grava e só então imprime: se a escrita falha, o papel
  não sai com um dado que não entrou no sistema. E se o efeito falha **depois** da escrita, a
  mensagem diz isso ("as alterações foram salvas, mas…") — o event store não desfaz, e calar leva o
  operador a repetir achando que nada mudou.
- **Só chame quando MUDOU.** O `updateRegistration` faz o diff e responde 409 "No registration
  changes detected" para um patch sem mudança.
- **Um "Limpar" em bloco deixa de ser inócuo.** Ele fazia sentido quando o form era rascunho; com
  campos que cascateiam, o mesmo botão apaga dado de outro registro num clique (RC-D101 tirou o
  da etiqueta).

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

**A regra não para em 4 opções.** Com **N** itens vindos do servidor a superfície própria vira
lista com busca — e continua sendo campo do destino, só que com dropdown em vez de cartões
(`ContractLotField`, RC-D69). A forma muda com o tamanho; o critério não. `containers` §1-A tem os
sinais de "isso é passo ou campo?".

**Opção bloqueada escreve o motivo** no `fv-choice-hint` (`disabledHint`). Cartão apagado sem
explicação vira um beco.

### Escolha obrigatória SEM pré-marcação

O padrão do kit é ter um valor inicial. A exceção: **quando a escolha decide algo que só a pessoa
sabe, não ter padrão é a decisão certa** — um default seria o sistema respondendo no lugar dela.
Molde em `SaleContractLifecycleDialog` (RC-D89, "Haverá cobrança de corretagem?" no washout):

```tsx
const [billable, setBillable] = useState<boolean | null>(null); // null = não respondeu
const canSubmit = !saving && reason.trim() !== '' && billable !== null;
```

Três exigências que andam juntas:

- **`null` como estado inicial**, não `false`. O que trava o submit é a **ausência** de resposta;
  "não" é uma resposta como qualquer outra.
- **O submit fica travado até responder** (`forms` §5: validação de forma no `submitDisabled`) — não
  se descobre que faltava clicando.
- 🔴 **A dica diz a CONSEQUÊNCIA, não repete o rótulo.** "Sim, cobrar" / _"Continua no Financeiro e
  emite espelho."_ — é o que a pessoa precisa para escolher. Dica que parafraseia o rótulo ocupa
  espaço e não decide nada.
- **O servidor exige o mesmo**, e com código próprio (`..._REQUIRED`, 422): botão travado não é
  trava. E ele aceita **só booleano de verdade** — um `undefined` que virasse `false` seria um "não"
  que ninguém escolheu.

Vale para o `radiogroup` acima e para o `<select>` nativo (aí o placeholder é uma `<option disabled>`
sem valor). Se a escolha é **definitiva**, ela merece a mesma superfície do resto do que não se
desfaz — no molde, o diálogo do washout, junto do motivo.

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

### 🔴 A exceção: form cheio de campo composto NÃO usa `<form onSubmit>`

O `<form id>` + `form={id}` do §1 vale por padrão, mas ele liga o **Enter** de qualquer input ao
submit. Num formulário onde a maioria dos campos é composta com busca interna — `ClientLookupField`,
`InlineSelectField`, chips —, Enter significa "**escolher este**", não "emitir". O molde do
`SaleContractEtapa2Modal` (11 compostos, RC-D58): o corpo é uma `<div className="fv-form-body">` e o
botão do rodapé chama o handler direto, sem `form=`.

Regra de bolso: se um Enter distraído dentro de um campo puder disparar um ato **irreversível**
(emitir, enviar, faturar), o submit é do botão.

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

**Form longo (20+ campos) com validação em cascata** — molde do `SaleContractEtapa2Modal` (RC-D35),
que tem 25 validações e 19 campos apontáveis:

- **uma chave fechada** por campo (`type FormFieldKey = 'seller' | 'saleSacks' | ...`), não `string`:
  chave sem markup vira erro de typecheck, e não campo sem marca vermelha;
- **um erro por vez** (o 1º pendente) — o helper `failField(key, msg)` no lugar de `setError`;
- **rola até o campo** (`document.querySelector('.is-field-error')?.scrollIntoView`) — sem isso,
  apertar o botão com um pendente acima da dobra não muda nada visível. Consultar o DOM é preferível
  a manter 25 refs: só existe um `.is-field-error` por vez;
- o que **não tem campo** (falha do servidor, pré-condição de outro objeto) fica na linha geral —
  marcar um campo que o usuário não pode corrigir é pior que não marcar;
- campo com **aviso ao vivo** (fim de semana, ordem de datas) tem prioridade sobre a mensagem do
  submit: entram no mesmo slot, com o do submit como último caso.

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

⚠️ **Form que nasce preenchido** (auto-preenchimento, ou edição hidratada de um objeto existente):
`dirty` **não** pode ser inferido de "tem campo com conteúdo" — dispararia sempre, o que é pior que
não ter guard. Use um `touched` explícito, ligado pelo handler de mudança de campo. Molde:
`SaleContractEtapa2Modal` (RC-D34), onde o handler compartilhado `onFieldChange()` marca o toque e
limpa o erro de campo de uma vez — os dois sempre acontecem juntos.

**Saída lateral só perde o rascunho se o passo anterior for outra SUPERFÍCIE.** Quando "Voltar" é um
passo do **mesmo painel** (`containers` §1-A), o form continua montado ao lado com o que foi digitado
e a rolagem onde estava — não há o que confirmar, e perguntar seria ruído. O guard fica **só para
sair do painel**, e o estado de confirmação volta a ser booleano.

Molde no `SaleContractEtapa2Modal` (RC-D57): o `canExit()` trata a volta antes de olhar o rascunho.

```tsx
function canExit(): boolean {
  if (saving) return false;
  if (onDocumentStep) {
    backToForm();
    return false;
  } // volta um passo…
  if (spotFlow && spotCreate != null) {
    backToLot();
    return false;
  } // …e nada se perde
  if (touched) {
    setPendingExit(true);
    return false;
  } // aí sim, "Descartar?"
  return true;
}
```

🔴 **Mas o que o passo anterior DETERMINA tem que morrer na troca.** Voltar ao picker e escolher
outro lote troca o vendedor: filial e conta bancária do dono anterior sobreviveriam caladas e virariam
um 422 no submit. Zerar na hidratação do passo novo. Antes o problema não existia porque o formulário
era destruído — manter o estado é a feature, e é também a armadilha.

---

## §9 Checklist

- [ ] `.fv-form-*` (não `.app-modal-field`, não `.client-quick-create-*`)
- [ ] `<form id>` + submit no footer com `form={id}` — **exceto** form cheio de campo composto com busca (§5)
- [ ] Composto novo dentro de `.fv-form-field`: conferir todo `<input>` aninhado (§2)
- [ ] Sem "Cancelar" textual
- [ ] Rótulo de saving no gerúndio, bifurcando se o submit bifurca
- [ ] `disabled` de todo campo acompanha `saving`
- [ ] Erro dentro do campo, limpando ao digitar; erro geral no fim do `<form>`
- [ ] `SuccessCheckOverlay` como filho direto do conteúdo do sheet
- [ ] `dirty` → confirm `.is-scrim-none.is-compact` + `dragDisabled` (form que nasce preenchido: `touched` explícito, não conteúdo)
- [ ] Guard no `onDismissAttempt`, nunca no `onClose` (`containers` §3)
- [ ] Escolha de 2–4 opções é campo do form, não superfície própria; bloqueada explica o motivo
- [ ] Escolha que só a pessoa sabe: sem pré-marcação, `null` inicial, submit travado, 422 no servidor
- [ ] Opção única = `<select>` nativo
- [ ] Campo travado: valor solto / caixa recuada / **o próprio editor em `disabled`** (§3) — nunca `<input disabled>`
- [ ] Campo que cascateia: edita o **dado**, não a forma recortada dele; grava antes do efeito; só chama se mudou (§3)
- [ ] Textos em pt-BR
