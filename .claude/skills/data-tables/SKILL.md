---
name: data-tables
description: Use this skill whenever building or editing a LIST page — table or card list of records, KPI cards, toolbar with search/filters, row action menu, bulk selection bar, infinite scroll. Defines the FV listing kit (fv-page-head, fv-kpi, fv-toolbar, fv-table, fv-col-*, fv-row-menu, fv-bulkbar), which parts are desktop-only and which cross both breakpoints, and the desktop/mobile tree split. Canonical example: /samples (both breakpoints); /cadastros (desktop only, mobile pending).
---

# Listagem — a página de lista no desktop

Toda página de lista do kit FV tem a mesma anatomia. O que muda entre `/samples` e `/cadastros` são
as colunas e os KPIs, não a estrutura.

Contêiner dos painéis (filtros, criação): `containers`. Campos de dentro deles: `forms`. Tokens e
cards: `design-system`.

**A tabela é desktop (≥901px); o resto do kit não é mais.** No mobile a lista é outra árvore de
componentes (§9), mas ela usa a MESMA toolbar, os MESMOS cartões de KPI e a MESMA barra de seleção
— só a faixa muda de forma. Quem ainda é exclusivo do desktop: `.fv-page-head`, `.fv-table*` e
`.fv-row-menu`.

---

## §1 Anatomia

```
DESKTOP (≥901px)                     MOBILE (≤900px)

.fv-page-head   título + criação     (título na faixa verde do shell;
.fv-kpi-row     grid de 4 cartões     criar é o FAB em leque)
└ cartão da lista                    └ sheet da página
  ├ .fv-toolbar   1 linha              ├ .spv2-list-scroll       ← rola INTEIRO
  ├ .fv-bulkbar   sob a toolbar        │  ├ .fv-kpi-row  2 cartões
  └ .fv-table-scroll                   │  ├ .fv-toolbar  2 linhas
    └ table.fv-table                   │  └ SampleCard …
                                       └ .fv-bulkbar   na BASE (order: 1)
```

**O `display` é o portão, e ele é escopado.** Todas as peças nascem `display: none` na base. O
`@media (min-width: 901px)` acende para todas as listas; o `@media (max-width: 900px)` acende só
para `.fv-lotes-page`, a única lista que já passou pelo ciclo mobile. Ligar na base daria a
`/cadastros` e ao `ClientsBrowser` **duas chromes empilhadas** — eles ainda usam a
`.hero-search-wrap` antiga. Vira genérico quando a segunda lista migrar (critério do
`css-architecture`). Nenhuma delas precisa de condicional no JSX.

🔴 **No mobile NADA fica travado no topo.** A lista tem altura fixa (quem rola é o
`.spv2-list-scroll`, não a janela), então cada faixa presa acima dela custa altura **permanente** na
tela menor. KPIs e toolbar entram como itens da rolagem — aparecem no topo, somem ao descer. O custo
aceito é que a busca sai de vista com a lista rolada.

---

## §2 Cabeçalho da página

```tsx
<div className="fv-page-head">
  <h2 className="fv-page-title">Lotes</h2>
  <div className="fv-page-head-actions">
    <button type="button" className="fv-btn fv-btn-primary" onClick={enterBlendMode}>
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        …
      </svg>
      Criar liga
    </button>
    <button type="button" className="fv-btn fv-btn-primary" onClick={openCreate}>
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
      Novo lote
    </button>
  </div>
</div>
```

- **Sempre o wrapper `.fv-page-head-actions`**, mesmo com uma única ação — o `space-between` do head
  depende de dois filhos.
- Ações que **criam o mesmo tipo de coisa** são as duas primárias, mesmo que uma seja por composição
  ("Criar liga" e "Novo lote" criam lote). Cor diferente aqui sugere hierarquia que não existe.
- O título acompanha a sub-aba da sidenav quando a página tem sub-abas.
- **No modo seleção o bloco inteiro some** — quem manda é a `.fv-bulkbar`, e criar um registro no
  meio de uma seleção não faz sentido.

---

## §3 KPI row

No desktop, grid **fixo de 4 colunas** (`repeat(4, minmax(0, 1fr))`). Menos de 4 cartões deixa
buraco; mais de 4 não cabe. Se a página tem 3 indicadores bons, ache o quarto ou repense.

**No mobile são DOIS cartões, não quatro.** A tela estreita não comporta a mesma leitura de
gestão: ficam os dois que respondem a uma pergunta de quem está operando (em `/samples`, "Em aberto"
e pendências) e a faixa vira `grid-template-columns: repeat(2, minmax(0, 1fr))`. Quem corta é a
**página, filtrando o array** — troca de árvore, como o resto do split; esconder cartão por CSS
deixaria markup morto no DOM.

Dois cartões cabem lado a lado, então **não há carrossel**. Já houve: com scroll-x, metade da
informação ficava atrás de um gesto que ninguém sabia que existia.

🔴 **A faixa entra DENTRO da rolagem** (§1), como primeiro item do `.spv2-list-scroll`, com a
toolbar logo abaixo.

**Cartão mais baixo: a métrica vai para o LADO do valor.** Valor e delta ganham o wrapper
`.fv-kpi-metric` — coluna no desktop (reproduzindo exatamente o espaço que o `gap` do cartão dava),
linha com `align-items: baseline` no mobile. É o que tira uma linha inteira da altura. Encolha o
`.fv-kpi-icon` junto: com o cartão em duas linhas ele vira a peça mais alta e dita de volta a altura
economizada. Rótulo longo trunca num cartão de meia largura — use um curto no mobile.

O markup é montado **uma vez** numa variável e posicionado pela bifurcação que a página já tem:

```tsx
const kpiRow = <div className="fv-kpi-row">{visibleCards.map(…)}</div>;
const mobileListChrome = isDesktop ? null : (<>{kpiRow}{toolbar}</>);
…
{isDesktop ? kpiRow : null}          {/* acima do cartão da lista */}
…
<div className="spv2-list-scroll">
  {mobileListChrome}                 {/* primeiros itens da rolagem */}
```

Renderizar duas vezes e esconder uma por CSS é exatamente o que o ciclo mobile veio desfazer.

🔴 **O chrome entra nos QUATRO ramos de rolagem** — lista, skeleton, erro e vazio. Fora do ramo da
lista, uma busca sem resultado tiraria da tela justamente o campo que precisa ser corrigido.

```tsx
<article className="fv-kpi">
  <div className="fv-kpi-top">
    <span className="fv-kpi-label">{card.label}</span>
    <span className={`fv-kpi-icon is-${card.tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">…</svg>
    </span>
  </div>
  <span className="fv-kpi-value">{card.value == null ? '—' : card.value.toLocaleString('pt-BR')}</span>
  <span className={`fv-kpi-delta${card.delta && card.delta.dir !== 'flat' ? ` is-${card.delta.dir}` : ''}`}>
    {card.delta?.dir === 'up' ? <svg …/> : card.delta?.dir === 'down' ? <svg …/> : null}
    {card.delta ? card.delta.text : ' '}
  </span>
</article>
```

- Tons do ícone: `is-blue`, `is-green`, `is-amber`.
- **O delta renderiza `' '` quando não existe** — não `null`. O espaço reserva a linha e impede que
  os cartões fiquem com alturas diferentes.
- Valor ausente é `'—'`, nunca `0` (0 é um dado; ausente é outra coisa).

### KPI como filtro

Um indicador de pendência é um convite a agir. Quando há o que fazer, o cartão vira botão que aplica
o filtro correspondente:

```tsx
if (card.key === 'pending' && (card.value ?? 0) > 0) {
  return (
    <button
      type="button"
      className={`fv-kpi is-clickable${pendingFilterActive ? ' is-active' : ''}`}
      aria-pressed={pendingFilterActive}
      onClick={togglePendingClassificationFilter}
    >
      {body}
    </button>
  );
}
return <article className="fv-kpi">{body}</article>;
```

**Zero pendências → volta a ser `<article>`.** Botão que não faz nada é ruído. O `aria-pressed`
comunica o estado ligado — sem ele o leitor de tela não sabe que o filtro está aplicado.

Antes de criar um filtro novo no backend para isso, **procure um que já exista**: o
`statusGroup=CLASSIFICATION_PENDING` de `/samples` já era aceito pela query e nunca tinha sido
exposto na UI.

### A rota de stats

Endpoint separado da listagem (`/api/v1/<recurso>/stats`), com `Cache-Control: private, max-age=30`.
O fetch é gated:

```ts
if (!session || !isDesktop) return; // KPI nao existe no mobile — nao gastar request
```

---

## §4 Toolbar

```tsx
<div className="fv-toolbar">
  <div className="fv-toolbar-search">
    <svg className="fv-toolbar-search-icon" …/>
    <input className="fv-input fv-toolbar-search-input" … />
    {query ? <button className="fv-toolbar-search-clear" …>✕</button> : null}
  </div>
  <button type="button" className="fv-btn fv-btn-secondary fv-toolbar-filter" onClick={openFilters}>
    <svg …/> Filtros
    {activeCount > 0 ? <span className="fv-btn-badge">{activeCount}</span> : null}
  </button>
  {hasFilters ? <button className="fv-toolbar-clear" onClick={clearAll}>Limpar</button> : null}
  <span className="fv-toolbar-count">{total} lotes</span>
</div>
```

**No desktop, `.fv-toolbar-count` tem `margin-left: auto`** — é ele que empurra tudo para a esquerda
e se ancora à direita. Sem o contador, a toolbar fica desalinhada; se precisar removê-lo, mova o
`margin-left` para o último elemento.

**No mobile a mesma toolbar quebra em duas linhas** (`flex-wrap` + `order`): busca + funil em cima,
"Limpar" e a contagem embaixo — a contagem colada na direita, pelo mesmo `margin-left: auto` do
desktop. A quebra é um `::after` de `flex-basis: 100%` — sem ele o funil iria para o fim da fila em
vez de ficar colado na busca. O rótulo "Filtros" vive num
`<span className="fv-toolbar-filter-label">` justamente para o mobile poder escondê-lo e deixar o
botão do tamanho do ícone; a linha da busca não cabe os dois.

🔴 **A busca precisa de `flex: 1 1 0`, não `1 1 auto`.** Um `<input>` tem largura intrínseca (~20
caracteres) e, com base `auto`, é ela que decide se alguém cabe ao lado — o funil ia parar na linha
de baixo mesmo sobrando espaço. Com base `0` a busca cede espaço e o funil fica sempre colado nela.

**Ela também desce para dentro da rolagem** (§1, §3), logo abaixo dos KPIs. Lá perde a borda
inferior (que marcava o fim da área travada) e o recuo lateral próprio — alinha com os cards pelo
padding do próprio `.spv2-list-scroll`. Como a KPI row, é montada uma vez e posicionada por
breakpoint.

O `.fv-btn-badge` só aparece com filtros ativos, e conta **filtros ocultos** (os que estão dentro do
painel), não a busca — a busca já se mostra sozinha.

---

## §5 A tabela

```tsx
<div ref={scrollRef} className="spv2-list-scroll fv-table-scroll" tabIndex={-1}>
  <table className="fv-table fv-table-lotes">
    <colgroup>
      <col className="fv-col-lot" />
      <col className="fv-col-owner" />
      <col className="fv-col-sacks" />
      …
      <col className="fv-col-actions" />
    </colgroup>
    <thead>
      <tr>
        <th scope="col">Lote</th>
        …
        <th scope="col" className="fv-table-th-actions" aria-label="Ações" />
      </tr>
    </thead>
    <tbody>…</tbody>
  </table>
</div>
```

### 🔴 `<colgroup>` é obrigatório

`.fv-table` é `table-layout: fixed`. Sem `<colgroup>`, as larguras viram divisão igual e o ellipsis
para de respeitar a coluna. **Uma classe `fv-col-*` por coluna, na ordem exata do `<thead>`.**

### Regra das larguras

**Larguras fixas agrupadas à direita, UMA coluna elástica que absorve a sobra.**

| Página       | Elástica                            | Fixas                                                                      |
| ------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| `/samples`   | `fv-col-owner` (`min-width: 150px`) | lote 232px · sacas/safra/padrão/bebida/catação **112px cada** · ações 58px |
| `/cadastros` | `fv-col-contact`                    | cliente 32% · status 120px · doc 170px · atualizado 120px · ações 58px     |

Características do mesmo tipo (as cinco de `/samples`) levam a **mesma largura**: mesmo vão entre
si, bloco visualmente coeso à direita. A identidade do registro fica à esquerda e ganha a sobra.
`fv-col-actions` é sempre 58px.

### Células compostas

Informação secundária mora **dentro** da célula do que ela qualifica, não em coluna própria:

```tsx
{/* status colado no numero do lote */}
<span className="fv-table-lot">
  <button type="button" className="fv-table-name-btn" onClick={…}>
    <span className="fv-table-name">{row.lot}</span>
  </button>
  {row.isBlend ? <BlendBadge /> : null}
  <StatusChip … />
</span>

{/* valor + subtexto */}
<span className="fv-table-cell-stack fv-table-num">
  <span className="fv-table-cell-main">{row.sacks}</span>
  {row.sacksSub ? <span className="fv-table-sub">{row.sacksSub}</span> : null}
</span>
```

`.fv-table-num` alinha números à direita. Valor vazio é `'—'`, nunca string vazia.

### Linha clicável

A `<tr>` inteira abre o detalhe; o identificador é `<button>` para o teclado. A célula de ações
**isola o clique**:

```tsx
<td className="fv-table-td-actions" onClick={(event) => event.stopPropagation()}>
```

No modo seleção o `stopPropagation` sai (o clique **precisa** subir para a linha) — por isso é
condicional, não fixo.

### Estados

| Estado          | O que renderizar                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Carregando (1º) | skeleton, nunca "Carregando…"                                                                          |
| Erro sem itens  | `.spv2-error-banner` com `role="status"` — **não** cair no vazio                                       |
| Vazio           | `.spv2-empty` com ícone + texto + sub ("Tente outro filtro…")                                          |
| Carregando mais | 3 `<tr className="fv-table-skel-row" aria-hidden>` com `<span className="fv-table-skel" />` por célula |
| Fim             | sentinel `<div ref={loadMoreRef} …>` só enquanto houver `nextCursor`                                   |

**O skeleton precisa do mesmo número de células que `<col>`.** Célula a menos desalinha a tabela
inteira enquanto carrega. `.fv-table-skel-row` não tem CSS próprio — é só gancho semântico; quem
pulsa é o `.fv-table-skel`.

O vazio do modo seleção tem texto próprio ("Nenhum lote disponível para liga"), não o genérico.

> ⚠️ As classes de estado (`.spv2-list-scroll`, `.spv2-empty`, `.spv2-error-banner`,
> `.spv2-skeleton-card`) são **compartilhadas por todas as listas do app** — reuse o markup, mas
> qualquer mudança de CSS nelas vai escopada na página (`css-architecture` §3).

---

## §6 Menu ⋯ da linha

```tsx
<div className="fv-row-menu-wrap" ref={rowMenuFor === id ? rowMenuRef : undefined}>
  <button
    type="button"
    className="fv-table-dots"
    aria-label={`Ações do lote ${row.lot}`}
    aria-haspopup="menu"
    aria-expanded={rowMenuFor === id}
    onClick={(event) => {
      rowMenuTriggerRef.current = event.currentTarget;
      setRowMenuFor((current) => (current === id ? null : id));
    }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
    </svg>
  </button>
  {rowMenuFor === id ? (
    <div className="fv-row-menu" role="menu" aria-label={`Ações do lote ${row.lot}`}>
      <button type="button" role="menuitem" className="fv-row-menu-item" onClick={…}>Ver detalhes</button>
      …
      <button type="button" role="menuitem" className="fv-row-menu-item is-danger" onClick={…}>Deletar</button>
    </div>
  ) : null}
</div>
```

Regras:

- **Um menu aberto por vez** — o estado é `rowMenuFor: string | null`, nunca um `Set`.
- Fecha por `mousedown` fora (via `rowMenuRef`) e por **ESC em fase de captura**:
  ```ts
  document.addEventListener('keydown', onDocumentKeyDown, true);
  ```
  A captura é necessária para o ESC **não vazar** para o overlay/página e fechar os dois de uma vez.
  O handler faz `preventDefault` + `stopPropagation` e devolve o foco ao trigger.
- `rowMenuTriggerRef` guarda o `event.currentTarget` para devolver o foco.
- Item destrutivo (`is-danger`) sempre por último.

### O que entra no menu

Ação que se resolve sozinha (imprimir etiqueta, registrar perda) abre o painel **direto da lista**,
sem montar o detalhe. Ação que precisa do contexto do registro vira **deep-link**: `?lote=<id>&acao=…`,
consumido uma vez pelo detalhe (ver `containers` §5).

Abrir o drawer inteiro para uma ação de um clique é desperdício — passe o snapshot que a linha já
tem para o painel.

---

## §7 Modo seleção

```tsx
{selectionMode === 'blend' ? (
  <div className="fv-bulkbar" role="group" aria-label="Seleção para liga">
    <span className="fv-bulkbar-count">
      {selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}
    </span>
    <div className="fv-bulkbar-review-wrap">
      <button className="fv-btn fv-btn-secondary" aria-haspopup="menu" aria-expanded={open} disabled={selected.size === 0}>
        Revisar <svg …/>
      </button>
      {open && selected.size > 0 ? <SelectedSamplesDropdown … /> : null}
    </div>
    <button className="fv-btn fv-btn-primary" disabled={selected.size < 2} onClick={confirm}>Criar liga</button>
    <button className="fv-bulkbar-exit" aria-label="Sair do modo liga" onClick={exit}><svg …/></button>
  </div>
) : null}
```

### A mesma barra, na base, no mobile

No mobile a `.fv-bulkbar` desce para o fim da tela, no lugar da tabbar (que já some sozinha em
`body.is-selection-mode`). Ela substitui **três peças** que o desenho antigo tinha: um header verde
dedicado no topo, um contador de selecionados na linha do sheet e o FAB virando seta "continuar".

🔴 **Ela desce por `order: 1`, NUNCA por `position: fixed`.** O `.samples-page-v2-sheet` roda
`animation … both` com transform no último keyframe, o que o torna **containing block permanente** —
um filho `fixed` ficaria preso dentro dele. Como o sheet já ocupa a tela toda, `order` põe a barra
no fim da coluna, que é o fim da tela. Isso também evita a briga de z-index com a `isolation:
isolate` do `.mobile-edge-shell`.

Dois ajustes acompanham: o sheet devolve o `padding-bottom` da safe area para a barra (que passa a
somá-la ao próprio padding) e o clearance do fim da lista encolhe — sem tabbar e sem FAB, e com a
barra ocupando espaço real de layout, o vão antigo vira buraco.

O popover de "Revisar" abre **para cima** (`bottom: calc(100% + 8px)` + `transform-origin: bottom
right` + keyframe espelhado): ancorado na base, para baixo sairia do viewport.

### 🔴 O checkbox mora na célula do ⋯

A mesma coluna leva o ⋯ fora do modo e a caixa de seleção dentro dele. **Entrar no modo seleção não
desloca nenhuma informação da linha** — nada pula de lugar, o olho não perde a referência. Adicionar
uma primeira coluna de checkbox empurra a tabela inteira.

O checkbox é `readOnly` + `tabIndex={-1}`:

```tsx
<input
  type="checkbox"
  className="fv-table-select"
  checked={isSelected && !isIneligible}
  disabled={isIneligible}
  readOnly
  tabIndex={-1}
  aria-label={`Selecionar lote ${row.lot} pra liga`}
/>
```

**Quem alterna é o `onClick` da `<tr>`.** Se o checkbox também tivesse handler, um clique nele
alternaria duas vezes e nada aconteceria.

Linha inelegível fica apagada (`.is-ineligible`) e o clique **explica o motivo** em vez de ignorar.

---

## §8 Painel de filtros

Contêiner: `.side-sheet` + `.fv-filter-sheet` (400px) — `containers` §2. O ciclo é sempre
**draft → apply**:

1. Abrir copia o estado aplicado para um rascunho.
2. Os campos editam só o rascunho.
3. "Aplicar" (submit no footer, via `form={id}`) grava e fecha.
4. **Fechar sem aplicar descarta** — não persiste rascunho.

Acima de ~6 campos, agrupe por assunto com `.fv-form-heading`. As opções de campos de seleção
carregam **uma vez por montagem da página**, não a cada abertura do painel.

---

## §9 Mobile

**A tabela não é responsiva.** Desktop e mobile são árvores de componentes diferentes:

```tsx
const isDesktop = useIsDesktop(); // lib/use-desktop.ts — 901px, SSR = false

{isDesktop ? <table className="fv-table">…</table> : items.map((s) => <SampleCard … />)}
```

Dados, ordem, scroll infinito e snapshot são os **mesmos** — muda só a apresentação. O hook devolve
`false` no SSR e no primeiro paint (mobile-first), então o consumidor tem que tolerar o flip
pós-hidratação.

Não usar `matchMedia` inline: `useIsDesktop()` é o gate canônico.

**O que NÃO troca de árvore:** toolbar, KPI row, barra de seleção e painel de filtros. Os quatro são
o mesmo markup nos dois breakpoints — o CSS muda a forma, e a página só decide **onde** montar
(§3). A exceção é o CONTEÚDO: quantos cartões de KPI entram e que rótulo eles usam é decisão de
dados, e sai de um filtro no array — não de um `display: none`. Trocar a árvore aqui traria de volta a
duplicação que o ciclo mobile eliminou (dois `<input>` no mesmo state, dois contadores, dois
popovers de revisão montados ao mesmo tempo).

### O card da lista

`components/samples/SampleCard.tsx` é o equivalente mobile da `<tr>`, e se comporta como ela:

- **Tap no card abre o registro** (`onOpenDetails` → `?lote=`), igual ao clique na linha. Card de
  lista não expande: o painel embutido custava um toque a mais para chegar ao detalhe e escondia
  campos que o CSS nunca mostrava.
- **Chrome do kit**: `var(--fv-surface)` + `1px solid var(--fv-line)` + `var(--fv-radius-lg)` +
  `box-shadow: 0 1px 2px rgba(0,0,0,.04)`. Sem gradiente, sem sombra empilhada.
- **Tipografia da LINHA**: título em `0.86rem` / `600` / `var(--ink)` com `tabular-nums`, secundário
  em `0.78rem` / `var(--muted)`. A mesma escala das células (§5) — nada de escala própria de card.
- **Status é o `.fv-chip` na variante `.is-sm`** (a mesma pastilha, um ponto menor), alimentado pela
  mesma fonte da linha da tabela e do detalhe (`sampleStatusDisplay` em `lib/sample-display.ts`).
  Fica **colado no título**, com o badge de liga entre os dois — a mesma ordem da célula da tabela.
  Encostá-lo na borda direita com `margin-left: auto` afasta o status do dado que ele qualifica, e
  a direita é do `⋯`.
- 🔴 **Status é lido num lugar só.** O card tinha também uma barra de cor lateral, numa paleta
  paralela à do chip. Duas codificações do mesmo dado é o que faz uma delas envelhecer sozinha —
  some com a redundante, fica o chip.
- **Sem ícone decorativo na linha de dados.** Ícone só onde ele desambigua (§5, `.fv-cell-ic`); no
  card, o que separa os dados é um ponto médio discreto.
- **`⋯` é IRMÃO do botão do card**, nunca filho — botão dentro de botão é HTML inválido. O wrap vira
  `flex-direction: row` e o `⋯` é um alvo redondo de 38px na direita, **centrado verticalmente**.
  Irmão no flex e não `absolute`: assim ele **reserva a própria largura** e o texto trunca antes de
  encostar nele — nada de contar caractere nem de sobrepor. Sem filete separando: a divisória soma
  uma terceira linha vertical ao card e pesa mais que a ação que abre.
- 🔴 **Quem cede largura é o card, nunca o botão.** O botão do card precisa de
  `flex: 1 1 auto; width: auto; min-width: 0` — o `.spv2-card` do legado combina `flex-shrink: 0`
  com `width: 100%`, e nessa combinação ele toma a linha inteira e **empurra o irmão para fora** do
  `overflow: hidden` do wrap. O `⋯` fica no DOM, com zero pixel visível: nada no console, nada no
  DevTools óbvio, só um botão que "não existe". Custou duas rodadas de conferência.

### 🔴 O `⋯` do card abre um SHEET, não um popover

O `.fv-row-menu` da tabela não serve no mobile por dois motivos independentes:

1. Ele não tem **uma linha** de CSS fora do `@media (min-width: 901px)`.
2. O `.spv2-card-wrap` tem `overflow: hidden` **e** `content-visibility: auto` — um menu absoluto
   ancorado dentro do card seria recortado.

O molde é o `BottomSheet` com `className="is-menu"` (o mesmo do menu da conta) e itens
`.fv-more-item` na variante `.is-sheet`, que tira a moldura de popover e vira lista de largura
total. Um único sheet para a lista inteira, montado pela página, com o alvo em state — um por card
custaria caro numa lista longa e brigaria com o `content-visibility` dos cards fora de tela.

**A lista de ações e os gates são os MESMOS do `⋯` da tabela** (item ausente quando não cabe, nunca
desabilitado). Se as duas divergirem, uma ação existe num breakpoint e some no outro.

### Escopo do CSS

O prefixo `spv2-` é **compartilhado** — `.spv2-card*` aparece em `RelatedSampleRow`, no
`SaleContractLotPickerModal`, no `ClientsBrowser` e em `/users`. Mudança de visual do card de lote
vai escopada em `.samples-page-v2`; prefixo com nome de página não é escopo (`css-architecture`).

---

## §10 Checklist

- [ ] `<colgroup>` com uma `fv-col-*` por coluna, na ordem do `<thead>`
- [ ] Uma única coluna elástica; as fixas agrupadas à direita; ações 58px
- [ ] KPI row com exatamente 4 cartões; delta com `' '` quando ausente; ausente = `'—'`
- [ ] KPI clicável só quando há o que fazer, com `aria-pressed`
- [ ] `.fv-page-head-actions` presente mesmo com uma ação
- [ ] `.fv-toolbar-count` por último (é ele que carrega o `margin-left: auto`)
- [ ] Célula de ações com `stopPropagation` **condicional** ao modo seleção
- [ ] Skeleton com o mesmo número de células que `<col>`
- [ ] Erro sem itens mostra banner, não o vazio
- [ ] Menu ⋯: um por vez, ESC em captura, foco devolvido, `is-danger` por último
- [ ] Modo seleção reusa a coluna do ⋯; checkbox `readOnly tabIndex={-1}`
- [ ] Tabela ↔ cards por troca de árvore com `useIsDesktop()`, nunca por CSS
- [ ] Toolbar, KPI, bulkbar e filtros com markup ÚNICO — a forma muda no CSS
- [ ] Regra nova do kit no mobile nasce escopada na página; genérica só na 2ª lista
- [ ] `⋯` do card e `⋯` da linha com a MESMA lista de ações e os mesmos gates
- [ ] Nada de `position: fixed` dentro do sheet da página (containing block)
- [ ] Mobile sem faixa travada: KPI e toolbar dentro da rolagem, nos QUATRO ramos
- [ ] Busca com `flex: 1 1 0` — com base `auto` o funil cai de linha

## §11 Fora do padrão hoje

Ao tocar nestes pontos, alinhe:

- **Tabela de corretores** (`/cadastros`, aba Corretor): sem `<colgroup>` — larguras instáveis.
- **Loading inicial do `/cadastros`**: ainda texto, não skeleton.
- **`.fv-table-lotes`**: classe aplicada no JSX de `/samples` sem regra CSS correspondente. Ou ganha
  regra, ou sai.
