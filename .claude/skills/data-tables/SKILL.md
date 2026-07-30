---
name: data-tables
description: Use this skill whenever building or editing a LIST page — table or card list of records, KPI cards, toolbar with search/filters, row action menu, bulk selection bar, infinite scroll. Defines the FV listing kit (fv-page-head, fv-kpi, fv-toolbar, fv-table, fv-col-*, fv-row-menu, fv-bulkbar), which parts are desktop-only and which cross both breakpoints, and the desktop/mobile tree split. Canonical example: /samples and /cadastros (both breakpoints).
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
`@media (min-width: 901px)` acende para todas as listas; o `@media (max-width: 900px)` acende por
**seletor multi-página** — `.fv-lotes-page X, .clients-page-v2 .spv2-list-scroll X, .relatorios-page .rsm-feed X` —
as listas que já passaram pelo ciclo mobile (`/samples` e as duas abas de `/cadastros`, RD16; mais o
feed de `/relatorios`, que não é tabela — feed + acordeão — mas reusa a chrome KPI+toolbar, escopada
ao seu container de rolagem `.rsm-feed`). `/contratos` (RC-F6) e `/financeiro` (RC-D93) entraram
depois e pegam o gate **de graça**, porque já são `.clients-page-v2` e movem a chrome para dentro do
`.spv2-list-scroll`. Cada nova lista entra somando seu escopo ao media-gate (critério do
`css-architecture`). Nenhuma precisa de condicional no JSX.

⚠️ **`/contratos` usa a chrome sem usar a tabela** (RC-D112, ver §"Tabela ou card" abaixo): ela tem
page-head, KPI row, toolbar, cartão da lista e scroll infinito do kit, e a lista dentro é de **cards
nos dois breakpoints**. Chrome do kit e `.fv-table` são peças separáveis.

🔴 **O qualificador da rolagem é o que impede chrome dupla.** Enquanto uma página ainda montava a
`.hero-search-wrap` legada, acender a `.fv-toolbar` na base lhe daria **duas buscas empilhadas** —
por isso o gate pede `.spv2-list-scroll`, que só existe depois que a página larga a busca antiga.
_(Desde 2026-07-29 **ninguém mais monta `.hero-search-wrap`**: o `FinanceiroPanel` era o último. As
~60 regras `.hero-search-*` seguem no `globals.css`, mortas por seletor, esperando uma varredura
própria.)_

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

**No mobile, em geral são DOIS cartões, não quatro.** A tela estreita não comporta a mesma leitura
de gestão: ficam os dois que respondem a uma pergunta de quem está operando (em `/samples`, "Em
aberto" e pendências) e a faixa vira `grid-template-columns: repeat(2, minmax(0, 1fr))`. Quem corta é
a **página, filtrando o array** — troca de árvore, como o resto do split; esconder cartão por CSS
deixaria markup morto no DOM.

Dois cartões cabem lado a lado, então **não há carrossel**. Já houve: com scroll-x, metade da
informação ficava atrás de um gesto que ninguém sabia que existia.

🔴 **Mas o corte é sobre o que o cartão FAZ, não sobre quantos são.** O critério: **cartão que só
informa pode ser cortado; cartão que é a única porta de um estado, não.** Em `/financeiro` os quatro
cartões **são o filtro da página** (não há chips) — cortar dois tornaria "Recebida" e "Cancelado"
inalcançáveis no mobile. Lá a página passa os quatro, e o `repeat(2, …)` do gate os quebra em **2×2**
sem uma linha de CSS nova: o "KPI-2" sempre foi **quantos cartões a página passa**, nunca uma trava
do kit.

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

- Tons do ícone: `is-blue`, `is-green`, `is-amber`, `is-red`, `is-gray`.
- **O delta renderiza `' '` quando não existe** — não `null`. O espaço reserva a linha e impede que
  os cartões fiquem com alturas diferentes.
- Valor ausente é `'—'`, nunca `0` (0 é um dado; ausente é outra coisa).
- **Valor em dinheiro precisa de folga**: `"R$ 128.450,00"` tem o dobro dos caracteres de `"184"` e
  estoura o corpo de 1.7rem do kit. Reduza o `font-size` **no escopo da página** e ponha o corte por
  ellipsis (`/financeiro`, `.fin-kpi-value`) — não mexa no kit por causa de uma página.

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

#### Quando a KPI row É o filtro (sem chips)

`/financeiro`: os quatro cartões cobrem os quatro estados e **substituem** a fileira de chips.
Três coisas que isso exige:

- 🔴 **Os números têm que ser independentes do filtro ativo** (e do cursor), variando só com a
  **busca**. Se ligar "Vencido" recalculasse os outros três, os cartões mentiriam justo quando
  alguém olha para eles. No servidor: os agregados sob o `where` da busca, **não** sob o do filtro.
- 🔴 **Cartão e filtro leem a MESMA expressão.** Em `listBrokerReceivables` os `where` dos quatro
  estados são uma constante só, usada pelos grupos da paginação e pelos quatro `aggregate`. Duas
  expressões paralelas discordam no primeiro ajuste — e aí o cartão diz 3 e a lista mostra 2.
- **Clicar no cartão aceso desliga** (volta a "todos"), e um "Limpar" aparece na toolbar quando há
  filtro — a saída não pode depender de achar qual cartão está aceso.
- **O anel de "ligado" segue o tom do cartão** (`--fv-kpi-active`, padrão âmbar). Com quatro tons,
  marcar o "Vencido" de âmbar leria como outro estado.

**Um total que é a soma dos cartões não vira um 5º cartão nem sobrevive na resposta.** Número
derivável do que já está na tela é uma segunda fonte da verdade esperando para divergir.

### A rota de stats

Endpoint separado da listagem (`/api/v1/<recurso>/stats`), com `Cache-Control: private, max-age=30`.
O fetch é gated só por sessão. Desde o RD16 o KPI aparece nos DOIS breakpoints
(desktop = 4 cartões; mobile = 2 — Total + um clicável, ver §9), então **não** se
gateia por `!isDesktop` (senão os números do mobile ficariam `—`):

```ts
if (!session) return; // KPI vale nos dois breakpoints
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

| Página       | Elástica                            | Fixas                                                                        |
| ------------ | ----------------------------------- | ---------------------------------------------------------------------------- |
| `/samples`   | `fv-col-owner` (`min-width: 150px`) | lote 232px · sacas/safra/padrão/bebida/catação **112px cada** · ações 58px   |
| `/cadastros` | `fv-col-contact`                    | cliente 32% · status 120px · doc 170px · atualizado 120px · ações 58px       |
| `/users`     | `fv-col-contact`                    | usuário 32% · perfil 150px · status 120px · último acesso 120px · ações 58px |

⚠️ `.fv-col-contract` (148px) sobreviveu ao fim da tabela de `/contratos`: o `/financeiro` a usa, com
o mesmo dado. **Prefixo ≠ família** — ver `css-architecture` §3.

Características do mesmo tipo (as cinco de `/samples`) levam a **mesma largura**: mesmo vão entre
si, bloco visualmente coeso à direita. A identidade do registro fica à esquerda e ganha a sobra.
`fv-col-actions` é sempre 58px.

### 🔴 Tabela ou card no desktop?

**Tabela quando as linhas se COMPARAM pelo mesmo número. Card quando cada linha é uma HISTÓRIA.**

A tabela existe para alinhar: 30 lotes com sacas, safra, padrão e bebida na mesma coluna deixam o
olho varrer a coluna e achar o diferente. É o que `/samples`, `/cadastros`, `/users` e `/financeiro`
fazem — em todas, a pergunta é "qual deles?".

`/contratos` fazia isso e **deixou de fazer** (RC-D112, 2026-07-30 — revoga a RC-D43, de dois dias
antes): a pergunta ali não é "qual tem mais sacas", é "quanto falta neste, e em que pé ele está".
Prazo correndo, estado, próximo compromisso — três coisas que não se comparam entre linhas, e que
numa tabela viravam uma célula empilhando duas peças enquanto quatro colunas ao lado ficavam mudas.
É a **primeira lista card-no-desktop do projeto**.

O que isso custa e o que compra:

- **Perde** a varredura vertical: dois contratos não se comparam mais pelo campo.
- **Ganha** hierarquia dentro do item: identidade em cima, prazo com peso visual, campos secundários
  numa faixa abaixo do divisor. Numa tabela toda célula tem o mesmo peso, por construção.
- **Ganha um breakpoint só de árvore.** Sem tabela, desktop e mobile são o MESMO componente com
  densidade diferente (`isDesktop` escolhe 4 campos ou 2) — em vez de duas árvores paralelas que
  precisam ser mantidas em paridade. Foi a maior economia da mudança.

O resto do kit não muda: page-head, KPI row, toolbar, cartão da lista, `.fv-row-menu` e o scroll
infinito são os mesmos. **Trocar a tabela por cards não é sair do kit.**

### 🔴 Coluna (ou campo) DERIVADA: mostre o que vem, não o rótulo do estado

O campo mais importante do item de `/contratos` não carrega o `status` cru — carrega a **agenda**
(RC-D68): o **próximo compromisso**, derivado no servidor sem persistir nada. "Emitido" nunca foi
informação: todo contrato vivo está emitido. O que o operador precisa saber é o que ainda vai ser
pedido dele, e quando.

Três regras que a fazem funcionar:

- **O rótulo do estado só aparece nos terminais** ("Concluído", "Cancelado"). Para quem está em
  andamento, o campo é uma frase de prazo: "Fatura em 3 dias", "Venceu há 4 dias".
- **Uma precedência única e explícita**, testada como função pura (`deriveContractAgenda`), e a
  **mesma** função na lista e no detalhe — senão os dois divergem no primeiro caso de borda.
- **O servidor devolve `{ kind, dayKey }`, não a frase.** Formatar é do front, e é por isso que a
  MESMA agenda tem duas formas: contagem de dias na lista (`contractCountdownLabel` — a pergunta é
  "quanto falta") e data no detalhe (`contractAgendaLabel` — ali a data exata importa). Quando o
  consumidor é genérico (os chips do calendário, que só sabem `typeKey`), aí sim o `label` vem
  pronto de lá.

Vale para qualquer lista de registros com ciclo: o campo de status é o mais lido e o menos
informativo quando o estado dominante é um só.

#### 🔴 Barra de progresso: a pergunta não é "posso?", é "o que ela MEDE?"

Esta é a lição mais cara desta página, porque ela foi aprendida duas vezes em três dias.

**Primeiro:** uma linha de 5 pontos (emissão · aprovação · embarque · faturamento · pagamento) com
**trilhos neutros** — só os pontos mudando de estado. Motivo (RC-D82): no contrato em andamento nada
trava nada; dá para finalizar sem nunca ter enviado a aprovação, então `● ○ ● ● ○` (buraco no meio) é
estado legítimo, e trilho preenchido leria "cheguei até aqui", que seria mentira.

**Depois:** uma **barra cheia** foi aceita (RC-D114) — não porque a regra mudou, mas porque **o que a
barra mede mudou**. Ela deixou de medir fases e passou a medir **tempo** (`contractDate →
paymentDate`, cheia até hoje). Tempo é monotônico: o dia de hoje não volta atrás, e a distância entre
duas datas do documento é um fato. A barra não afirma que algo foi cumprido — afirma **quanto do prazo
passou**. A RC-D82 continua de pé; a linha de 5 fases foi apagada (RC-D116).

O critério que sobra:

> **Antes de desenhar progressão, pergunte o que o preenchimento AFIRMA.** Se afirma "os passos até
> aqui aconteceram", ela só vale quando o processo realmente impede o passo N+1 sem o N. Se afirma
> algo monotônico — tempo corrido, quantidade acumulada, dias restantes —, ela vale sempre, porque
> não há como voltar atrás.

Três consequências de desenho que vieram com a barra de tempo:

- **Sem dado, sem trilho.** Contrato com pagamento "À definir" (D144) mostra só a frase. Trilho vazio
  inventaria um prazo que o registro não tem — e um trilho vazio é indistinguível de "0% corrido".
- **O tom da barra pinta o resto do item.** Uma derivação (`contractTimeProgress`) devolve
  `{ pct, tone }`, e o `tone` colore o preenchimento, a **tarja** lateral e o **ponto** do status. É
  o que faz um registro atrasado ficar vermelho inteiro sem que "atrasado" exista como estado no
  banco. Dois mapas de cor paralelos divergiriam no primeiro ajuste.
- **Reserve o vermelho para uma coisa só.** Ali é o **atraso**; o cancelado, que antes era vermelho,
  virou laranja (RC-D115). Cancelado não pede ação hoje; vencido pede.

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

A `<tr>` inteira abre o detalhe; o identificador é `<button>` para o teclado. **Se o destino é outra
página** (e não um overlay ali mesmo), ele é um `<Link>` de verdade com `stopPropagation` — o
teclado ganha o alvo e o botão do meio abre em outra aba, coisas que um `<button>` com `router.push`
não dá (`/financeiro`). A célula de ações **isola o clique**:

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

🔴 **Página de leitura pura não tem ⋯.** Se a única saída da linha é abrir o registro, um menu de um
item só é ruído: a coluna some e **a linha inteira** navega (§5, "Linha clicável"). É o caso de
`/financeiro` (RC-D95) — sem ⋯, sem `.fv-col-actions`, 6 colunas cheias. O ⋯ existe para **escolher
entre ações**; com uma, ele é um clique a mais para chegar onde o clique na linha já chegava.

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
- 🔴 **Item bloqueado escreve o motivo na própria linha** (`.is-blocked` → duas linhas, rótulo +
  `.fv-row-menu-hint`). Item apagado e mudo é um beco: no toque não há tooltip para socorrer, e o
  operador não descobre o que fazer. A frase carrega a **saída**, não só o impedimento — "Defina a
  data de faturamento primeiro", não "Indisponível". Mesma regra do `fv-choice-hint` em `forms` §4.

### Ação travada por regra: esconder não é travar

O "Finalizar" de `/contratos` só existe a partir da data de faturamento (RC-D85). Três exigências
que andam juntas — falhar em qualquer uma delas deixa a regra pela metade:

1. **O servidor recusa.** Botão escondido não é trava: quem chama a API direto passa. A guarda vai no
   serviço, com **código próprio de erro** por motivo.
2. **A UI escreve o porquê**, em **todos** os lugares onde a ação aparece (aqui são dois: o menu ⋯ do
   card e o rodapé do detalhe — eram três até o card mobile perder a faixa de ações). Um deles sem a
   frase é o que o usuário vai encontrar.
3. **O toast desempata pelo código, não pelo status.** Se a trava devolve o mesmo 409 do conflito de
   concorrência, a mensagem genérica ("recarregue a página") mente sobre o que aconteceu.

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

O prefixo `spv2-` é **compartilhado** — `.spv2-card*` aparece em `SampleCard`,
`SampleCardActionsSheet`, `RelatedSampleRow` e no `ClientsBrowser`, e em peças soltas
(`.spv2-card-chevron` em `/users`, `.spv2-card-badge` no detalhe do contrato); `/users` usa os
ESTADOS (`.spv2-list-scroll`, `.spv2-empty`, `.spv2-error-banner`, `.spv2-skeleton-card`), não o
card. _(O picker de lote do contrato saiu da lista na RC-D49, virou `.lotpick-card` e **morreu inteiro** na
RC-D69, 2026-07-29 — o lote é um campo do formulário agora.)_ Mudança de visual do card de lote vai escopada em
`.samples-page-v2`; prefixo com nome de página não é escopo (`css-architecture`).

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
- **Card de `/financeiro`** (`FinanceiroCard`): a página entrou no kit (RC-D92/D93), mas o
  **conteúdo** do card mobile ficou nos tokens legados — `.fin-card`, não o `.cv2-card` do §"O card da
  lista". A moldura em volta (page-head, KPI row, toolbar, cartão da lista) é kit; o miolo do card
  não. _(O `.ctr-card` de `/contratos` foi reescrito na RC-D112 e segue em tokens `--brand-*`: ele
  virou a lista dos DOIS breakpoints, e a migração dele para os tokens `--fv-*` é o mesmo débito.)_
