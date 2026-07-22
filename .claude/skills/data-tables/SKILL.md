---
name: data-tables
description: Use this skill whenever building or editing a desktop LIST page — table of records, KPI cards, toolbar with search/filters, row action menu, bulk selection bar, infinite scroll. Defines the FV listing kit (fv-page-head, fv-kpi, fv-toolbar, fv-table, fv-col-*, fv-row-menu, fv-bulkbar) and the desktop/mobile tree split. Canonical examples: /samples and /cadastros.
---

# Listagem — a página de lista no desktop

Toda página de lista do kit FV tem a mesma anatomia. O que muda entre `/samples` e `/cadastros` são
as colunas e os KPIs, não a estrutura.

Contêiner dos painéis (filtros, criação): `containers`. Campos de dentro deles: `forms`. Tokens e
cards: `design-system`.

**Tudo nesta skill é desktop (≥901px).** No mobile a lista é outra árvore de componentes — §9.

---

## §1 Anatomia

```
.fv-page-head          título + ações de criação
.fv-kpi-row            4 cartões de indicador
└ cartão da lista (.samples-page-v2-sheet / .clients-v2-sheet)
  ├ .fv-toolbar        busca · filtros · limpar · contador
  ├ .fv-bulkbar        só no modo seleção
  └ .fv-table-scroll
    └ table.fv-table
```

`.fv-page-head`, `.fv-kpi-row` e `.fv-toolbar` são `display: none` por padrão e só aparecem dentro
do `@media (min-width: 901px)`. Não precisam de condicional no JSX.

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

Grid **fixo de 4 colunas** (`repeat(4, minmax(0, 1fr))`). Menos de 4 cartões deixa buraco; mais de 4
não cabe. Se a página tem 3 indicadores bons, ache o quarto ou repense.

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

**`.fv-toolbar-count` tem `margin-left: auto`** — é ele que empurra tudo para a esquerda e se ancora
à direita. Sem o contador, a toolbar fica desalinhada; se precisar removê-lo, mova o `margin-left`
para o último elemento.

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

**Exceção:** o painel de filtros é o único bloco do kit FV que vive nos dois breakpoints (no mobile
vira bottom sheet, mesma marcação).

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
- [ ] Mobile por troca de árvore com `useIsDesktop()`, nunca por CSS

## §11 Fora do padrão hoje

Ao tocar nestes pontos, alinhe:

- **Tabela de corretores** (`/cadastros`, aba Corretor): sem `<colgroup>` — larguras instáveis.
- **Loading inicial do `/cadastros`**: ainda texto, não skeleton.
- **`.fv-table-lotes`**: classe aplicada no JSX de `/samples` sem regra CSS correspondente. Ou ganha
  regra, ou sai.
