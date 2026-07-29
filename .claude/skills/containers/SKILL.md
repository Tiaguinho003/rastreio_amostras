---
name: containers
description: Use this skill whenever a new UI surface needs to open — detail view, create/edit form, filters, confirmation, quick edit. Defines WHICH container to use (DetailOverlay, side-sheet, fv-panel-sheet, filter sheet, central modal, inline dropdown), the BottomSheet primitive underneath all of them, the stacking/z-index tiers, and URL-as-state. Answers "isso abre em que?".
---

# Contêineres — em qual superfície isso abre

Toda superfície que se sobrepõe à página passa por aqui. A pergunta "isso abre em quê?" tem uma
resposta única por caso — não é preferência.

Para o **conteúdo** de dentro: `forms` (campos, submit, erro, sucesso). Para o **visual** do modal
central: `modals`. Para tokens e cards: `design-system`.

---

## §1 Árvore de decisão

| O que é                                            | Contêiner                                     | Largura desktop |
| -------------------------------------------------- | --------------------------------------------- | --------------- |
| Detalhe de um recurso (tem URL própria)            | `DetailOverlay`                               | 620px           |
| Criar / editar a partir da lista                   | `BottomSheet` + `.side-sheet`                 | 620px           |
| Form disparado de dentro de um detalhe             | `.side-sheet` + `.fv-panel-sheet` + `stacked` | 620px           |
| Filtros de uma lista                               | `.side-sheet` + `.fv-filter-sheet`            | 400px           |
| Confirmação destrutiva (fora de painel)            | `.app-modal.is-themed.app-confirm-modal`      | 380px           |
| Confirmação **sobre** um painel                    | idem + `.fv-panel-scrim` no backdrop          | 380px           |
| "Descartar?" de rascunho                           | idem + `.is-scrim-none.is-compact`            | 312px           |
| Editar 1–2 campos de um card                       | **dropdown inline no próprio card**           | —               |
| Ações de um item de LISTA no mobile                | `BottomSheet` + `.is-menu`                    | — (desktop: ⋯)  |
| Feedback transiente (salvo, copiado, erro de rede) | toast → `feedback-messages`                   | —               |

**Regra de corte do painel vs. dropdown inline:** 1–2 campos sem consequência de negócio (data,
observação) = dropdown inline no card. A partir de 3 campos, ou se o salvamento dispara evento de
domínio, é painel. Abrir um painel de 620px para editar uma data é caro em atenção e em cliques.

**Regra de corte do painel vs. modal central:** o painel é para **coletar** (o usuário escreve
algo). O modal central é para **decidir** (o usuário confirma ou desiste). Um "tem certeza?" nunca
vira painel; um formulário nunca vira modal central.

---

## §1-A Painel de vários passos

Quando um ato só tem **momentos** (preencher → conferir → emitir), eles são **passos do mesmo
painel**, não superfícies empilhadas. Sintoma de que você errou: um modal por cima de um painel que
continua montado atrás, apagado; ou dois sheets irmãos, um descendo enquanto o outro sobe.

### 🔴 Antes de criar o passo: ele responde mais de UMA pergunta?

**Um passo que responde UMA pergunta é um campo, não um passo** (RC-D69). Um passo se justifica
quando apresenta contexto que o anterior não tinha, ou quando a resposta muda o que vem depois de um
jeito que não caberia na mesma tela. Escolher um item de uma lista não faz nem uma coisa nem outra:
quem abriu o fluxo já sabe o que quer, e o efeito da escolha acontece **no passo seguinte**.

O tamanho do que morre denuncia o erro: a seleção de lote do contrato era **261 linhas de TSX + 26
regras de CSS** (cabeçalho sticky, grade de 4 colunas, scroll infinito por cursor) para uma pergunta
que virou um `<input>` com dropdown. Os quatro fatos que as colunas comparavam couberam em título +
linha de meta.

Sinais de que o "passo" é campo disfarçado:

- **não tem rodapé** — não há decisão a confirmar, só um item a tocar;
- **o que ele coleta preenche campos do passo seguinte** — então o lugar dele é lá;
- **precisa de chrome próprio parado** (busca fixa + lista rolando) para caber, quebrando o "cada
  passo rola sozinho" de baixo.

O contrário também vale: **conferir** um documento é passo legítimo, porque apresenta algo que o
formulário não tinha e a decisão ("emitir?") é outra.

**Como se monta.** Um `BottomSheet` só. O corpo vira a **trilha que recorta** e cada passo rola
sozinho — os dois na mesma célula de grid, o que saiu deslocado para fora:

```css
.bottom-sheet.ctr-contract-sheet .bottom-sheet-body {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden; /* recorta o passo que sai pela esquerda */
  padding: 0; /* o padding desce para o passo */
}
.ctr-step {
  grid-area: 1 / 1; /* os dois na MESMA célula */
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  transition:
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 200ms ease,
    visibility 0s;
}
.ctr-step.is-past,
.ctr-step.is-next {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition-delay: 0s, 0s, 280ms; /* esconde DEPOIS de animar */
}
.ctr-step.is-past {
  transform: translateX(-100%);
}
.ctr-step.is-next {
  transform: translateX(100%);
}
```

🔴 **A rolagem tem que descer para o passo.** `overflow-x: hidden` com `overflow-y: visible` não
existe — declarar um força o outro a `auto`. Só dá para recortar o eixo horizontal se o corpo parar
de rolar. Efeito colateral **bom**: cada passo guarda a própria posição de scroll, então voltar
devolve o formulário exatamente onde estava.

🔴 **`visibility: hidden` com `transition-delay` igual à duração.** Sem isso o passo que saiu
continua no tab order; com `visibility` sem delay ele some antes de animar.

**Cabeçalho e rodapé não deslizam** — só o miolo. O rodapé é um só, do painel, e troca o rótulo do
botão (`key` no elemento para o React remontar e o crossfade acontecer). Se um passo ficaria **sem
rodapé nenhum** por não ter decisão a confirmar, releia o quadro no topo desta seção: ele é
provavelmente um campo.

**Voltar um passo, não fechar.** Seta ←, ESC e o back do Android voltam; quem responde é o
`BottomSheet` via `onDismissAttempt` → devolver `false` **com efeito colateral** (§3). O primeiro
passo mantém o comportamento normal de saída, com "Descartar?" se houver rascunho — e o
"Descartar?" fica **só** ali: recuar não perde nada, então perguntar seria mentira.

```tsx
const canExit = useCallback(() => {
  if (onDocumentStep) {
    backToForm();
    return false;
  }
  if (pendingExit) return false;
  // ...regra normal de saída do primeiro passo
}, [onDocumentStep, backToForm, pendingExit]);
```

**Quem é o sinal do passo.** Um estado que já existe (`confirmDoc != null`, `spotCreate != null`),
não uma máquina de estado nova. Se o passo N depende de um dado assíncrono, o dado **é** o passo.

🔴 **O passo anterior fica montado — então o que ele determina precisa MORRER na volta.** Essa é a
contrapartida de "voltar não perde nada": se o passo 1 escolhe um objeto e o passo 2 deriva campos
dele, trocar a escolha tem que zerar os derivados **antes** de re-hidratar. No fluxo do contrato o
vendedor é o dono do lote, e uma filial ou conta bancária do dono anterior sobreviveria calada até
virar um 422 no submit. Enquanto os passos eram superfícies separadas o problema não existia — o
conteúdo era destruído.

> 🔴 **E se a escolha virar campo, ela ganha um terceiro caso: LIMPAR.** O efeito de hidratação
> costuma ser chaveado pelo id do objeto e zerar os derivados **dentro** do `if (objeto)`. Com o id
> indo a `null` esse ramo não roda, e os derivados do objeto anterior sobrevivem a um campo vazio —
> a tela afirma um vendedor que não será gravado. O zeramento sobe para **antes** do `if`.

**Quem faz o trabalho de avançar é o PAINEL, não o passo.** O passo lista, mostra, coleta; a
chamada que produz o próximo passo mora no dono da superfície. É a mesma razão pela qual a
rasterização do documento virou um hook chamado pelo pai: o rodapé é dele.

**O que NÃO é do objeto escolhido não pode ser reescrito na troca.** Só zere (e só semeie) o que de
fato deriva dele. Com uma escolha que era passo isso passa despercebido — trocar era ato deliberado
de "voltar"; como campo, digitar reescreve calado o que o operador tinha decidido. No contrato a
**data** era semeada com hoje a cada troca de lote, e a data nunca veio do lote: virou
`setSaleDate((prev) => prev || hoje())`.

**Conteúdo que não cabe em 620px** (uma folha A4, por exemplo) não justifica alargar o painel nem
voltar ao modal: ganha um botão **"Ampliar"** — tela cheia sob demanda, portalada, com ESC em fase
de captura para fechar só a ampliação e não atravessar até o painel.

**A largura, se mudar, é do PAINEL — vale para todos os passos.** `/contratos` foi a 700px (RC-D61)
quando o formulário passou a ter linhas de 3 colunas; o documento herdou o respiro. É o oposto de
alargar por causa de um passo só: não há como um passo ser mais largo que o painel.
🔴 O seletor precisa citar `.side-sheet` — `.bottom-sheet.side-sheet` (620px, 0,2,0) mora **depois**
no `globals.css` e, com a mesma especificidade, venceria por ordem.

**Um sheet a menos é um `stacked` a menos.** Se o passo novo veio de um sheet que ficava **embaixo**
do outro, o de cima provavelmente era `stacked` só por isso — e volta ao tier normal. Ganha-se de
brinde uma entrada de history em vez de duas (sheet `stacked` não injeta a sua), então o back do
Android passa a voltar um passo em vez de consumir a entry do sheet de baixo.

Exemplo vivo: `SaleContractEtapa2Modal` — formulário → documento (`ContractDocumentStep`),
RC-D53..D56. Ele já teve **três** passos: o lote vinha na frente (RC-D57) e virou campo na RC-D69,
que é de onde sai o quadro no topo desta seção.

---

## §2 O catálogo

### `DetailOverlay` — detalhe de recurso

Contêiner canônico de detalhe. Mobile = sheet de tela cheia; desktop = painel direito de 620px.
Quem abre e fecha é o **query param**, não o sheet.

🔴 **O backdrop bloqueia — não é mais "peek".** O desenho original tinha a lista viva e clicável
atrás (backdrop transparente e atravessável), e clicar noutra linha trocava o item aberto. As
páginas que entraram no ciclo FV abandonaram isso: `.client-details-overlay` e
`.lote-details-overlay` restauram o **scrim 0.55 + `pointer-events: auto`** (tap no scrim fecha, o
dismiss-guard segue valendo), por regra `:has()` sobre o backdrop. O peek atravessável sobrevive
só em `.detail-overlay` que ainda não passou pelo ciclo (contrato). **Página nova nasce
bloqueante** — adicione o seletor dela ao bloco `:has()` junto com os dois.

🔴 **Quem rola é o `.bottom-sheet-body`. O conteúdo não monta scroller próprio.** O
`SampleDetailView` montava (`.sdv-page` rígido + `.sdv-content` com `overflow-y: auto`), e no
mobile isso virava ~300px de hero congelado com uma janelinha embaixo pra ler o recurso inteiro. Na
RD16 M3 o corpo foi liberado — `.sdv-page { height: auto; min-height: 100%; overflow: visible }` e
`.sdv-content { flex: none; overflow: visible }` —, e as **abas** viram
`position: sticky; top: 0; z-index: 2` com fundo opaco, pra a navegação não ir embora junto com o
hero. Dois detalhes: (1) ao neutralizar regra legada, qualquer `overflow` que volte pro conteúdo
tira o scrollport de baixo do sticky; (2) o `.fv-more-menu` do ⋯ do hero é `z-index: 30` no mesmo
contexto de empilhamento, então continua passando por cima das abas.

```tsx
<DetailOverlay
  open={Boolean(loteId)}
  onClose={closeLote}
  dismissGuardRef={loteDismissGuardRef}
  ariaLabel="Detalhes do lote"
  className="lote-details-overlay"
  closeVariant="edge-back"
>
  <SampleDetailView … />
</DetailOverlay>
```

Os quatro props travados dentro do componente (`components/DetailOverlay.tsx`) — **não replicar à
mão com `BottomSheet` cru**: `manageHistory={false}` (a history é da URL), `dragToDismiss={false}`,
`onDismissAttempt={() => !dismissGuardRef?.current}`, `className="detail-overlay …"`.

Usos: `/samples` (lote, bloqueante), `/cadastros` (cliente, bloqueante), `/contratos` (contrato,
ainda peek).

### `.side-sheet` — criação e edição

Mesma geometria do detalhe e o **mesmo backdrop escurecido e bloqueante** (era a diferença entre os
dois; hoje só o detalhe de contrato ainda difere).

**Duas exceções**, ambas com regra `:has(> .bottom-sheet.X)` que devolve o backdrop pra transparente
e `pointer-events: none`: o peek `.detail-overlay` (RD4, "lista viva") e a ficha do Simulador
(`.pg-ficha-sheet`, PG52). O critério é o mesmo nos dois: **o que está atrás precisa continuar
clicável pra superfície fazer sentido** — na ficha, editar as sacas no canvas recalcula a estimativa
ao vivo. Painel que cria ou edita **não** entra aqui: tem estado sujo, e o bloqueio é a proteção.
`display: none` no backdrop não serve — o sheet é FILHO dele e sumiria junto. A history segue com o árbitro do `BottomSheet` (criar não é um
recurso endereçável — não ganha query param).

```tsx
<BottomSheet
  open={open}
  onClose={handleClose}
  onDismissAttempt={handleDismissAttempt}
  title={null}
  footer={footer}
  ariaLabel="Novo lote"
  className="fv-panel-sheet side-sheet new-sample-sheet"
  closeVariant="edge-back"
  dragDisabled={discardOpen}
>
```

### `.fv-panel-sheet` — o kit de painel

Modificador **de conteúdo**, não de geometria: dá ao painel a geometria de campo do kit FV e o
chrome comum (§7). Sempre acompanhado de `.side-sheet`. Todo painel novo usa `.fv-panel-sheet`;
`.client-panel-sheet` é alias legado do drawer do cliente.

### `.fv-filter-sheet` — filtros

`.side-sheet` estreitado para `min(400px, 92vw)`. **Vence por ordem**, não por especificidade: a
regra mora depois da do `.side-sheet` no arquivo, com a mesma especificidade. Mover uma das duas de
lugar quebra a largura. Mesma armadilha em `.pg-ficha-sheet` (420px) — qualquer largura de painel
se escreve como `.bottom-sheet.<própria>` e depende de estar DEPOIS no arquivo.

### Modal central

Estrutura, variantes e tokens estão em `modals`. Aqui só o que decide **onde** ele aparece:

- Confirmação disparada da página → backdrop padrão.
- Confirmação disparada **de dentro de um painel** → `.fv-panel-scrim` no backdrop. No desktop o
  scrim cobre só a faixa direita de 620px (`right: 0; width: min(620px, 92vw)`), então o diálogo
  aparece **dentro** da área do painel, não no meio da tela.
  **Não há exceção.** Havia uma (RC-D27): a conferência do contrato antes de emitir usava backdrop
  cheio, porque o objeto da decisão é um documento A4 e ele não cabia em 620px. A **RC-D53**
  (2026-07-28) resolveu isso pela raiz — ver §1-A: ela deixou de ser um diálogo **sobre** o painel e
  virou um **passo dentro** dele. Se você chegar aqui com "meu conteúdo não cabe em 620px", a
  pergunta certa não é qual backdrop usar; é se aquilo é mesmo um diálogo.
- "Descartar?" de rascunho → `.is-scrim-none` (fundo não escurece nem borra) + `.is-compact`.

### `.is-menu` — menu de ações de um item de lista (mobile)

O equivalente mobile do `⋯` da linha da tabela. `BottomSheet` com `className="is-menu"` +
`dragToDismiss`, itens no molde `.fv-more-item` na variante `.is-sheet` (sem moldura de popover,
largura total), `is-danger` por último. Mesmo molde do menu da conta (`HeaderAvatarMenu`).

🔴 **Por que não é popover.** O card da lista tem `overflow: hidden` **e**
`content-visibility: auto` — um menu absoluto ancorado dentro dele seria recortado. E o
`.fv-row-menu` do desktop não tem uma linha de CSS fora do `@media (min-width: 901px)`.

**Um sheet para a lista inteira**, montado pela página com o alvo em state (`target | null`) — não
um por card. Toda ação **fecha antes de disparar**: as que abrem outra superfície empilhariam sheet
sobre sheet e o árbitro de history cobra caro por isso.

```tsx
const run = (action: (item: T) => void) => {
  if (!target) return;
  const item = target;
  onClose();
  action(item);
};
```

A lista de ações e os gates são os **mesmos** do `⋯` da tabela (item ausente quando não cabe, nunca
desabilitado) — se divergirem, uma ação existe num breakpoint e some no outro. Exemplo:
`components/samples/SampleCardActionsSheet.tsx`.

### Dropdown inline

Sem componente próprio: um bloco condicional dentro do card, com os campos e um botão de salvar. O
estado é só `qualId | null` (ou `boolean`), e o card fica em `detailBusy` enquanto está aberto.
Exemplos: edição de envio e edição da data de chegada em `SampleDetailView`.

---

## §3 `BottomSheet` é a primitiva

`DetailOverlay`, `.side-sheet`, `.fv-panel-sheet` e `.fv-filter-sheet` são todos o mesmo componente
com props diferentes. Ele resolve portal, animação, scroll-lock, ESC, back do Android, focus trap e
congelamento de conteúdo na saída.

**Props que mudam comportamento** (`components/BottomSheet.tsx`):

| Prop               | Efeito                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- |
| `onDismissAttempt` | Retorna `false` para **cancelar** o fechamento. É onde vai todo guard.                 |
| `stacked`          | Sobe para o tier `--z-modal-stacked` e **delega a history ao pai** (não injeta entry). |
| `manageHistory`    | `false` desliga o árbitro de popstate — para overlays dirigidos por URL.               |
| `dragDisabled`     | Pausa o drag-to-dismiss (usar enquanto um confirm aninhado está aberto).               |
| `closeVariant`     | `'edge-back'` troca o X pela seta ← na borda esquerda. Padrão dos painéis FV.          |
| `className`        | Modificadores (`side-sheet`, `fv-panel-sheet`, classe própria).                        |

**Os 5 caminhos de fechamento** convergem em `requestDismiss()`: clique no backdrop · botão de
fechar · ESC · back do Android/gesto · drag-to-dismiss acima do threshold. Todos passam pelo
`onDismissAttempt`. Não existe caminho que escape do guard — por isso ele não pode morar em outro
lugar.

### 🔴 Regra de ouro: o guard vai no `onDismissAttempt`, NUNCA no `onClose`

```tsx
// ✅ CORRETO
onDismissAttempt={() => {
  if (saving || success) return false;
  if (dirty) { setDiscardOpen(true); return false; }
  return true;
}}
onClose={() => setOpen(false)}

// ❌ ERRADO — quebra o back do navegador
onClose={() => { if (saving) return; setOpen(false); }}
```

O `requestDismiss` devolve `true` quando o `onDismissAttempt` autoriza, e é esse `true` que diz ao
sheet para **consumir** a entry de history. Negando dentro do `onClose`, o sheet acha que fechou,
consome a entry, e o **próximo back sai da página** em vez de fechar o painel. O sintoma aparece
longe da causa.

### `sheetStack`

Pilha module-level de sheets visíveis. Resolve dois problemas de graça, sem nada a fazer no
consumidor: o **scroll-lock é ref-contado** (fechar o de cima não destrava o de baixo) e **ESC/back
só chegam ao topmost** (não fecham os dois de uma vez).

### Variantes de altura (mobile)

O sheet base ocupa quase a tela. Três modificadores encolhem:

| Classe            | Efeito                                              | Para quê                                                        |
| ----------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `.is-menu`        | `height: auto` + `max-height: min(72dvh, 30rem)`    | menus curtos (conta, ações de item)                             |
| `.is-fit-content` | `height: auto`, **mantém** o teto alto do base      | sheets curtos (form/leitura) que podem crescer                  |
| `.is-informe`     | **legado/morto** — achatava cards + padding no form | nada (visita/semanal/informativo migraram p/ `.fv-panel-sheet`) |

No desktop com `.side-sheet` a altura é sempre total — as variantes só valem no mobile.

> **`.is-fit-content` × dropdown inline:** só use `.is-fit-content` se o conteúdo não tiver dropdown
> absoluto inline. O lookup de cliente (`.client-lookup-dropdown`) é `position: absolute` com até
> 22rem de altura própria; num sheet que abraça o conteúdo, o `overflow` do body recorta o dropdown.
> Sheets com esse lookup ficam de altura cheia (ex.: painel de envio, meta-step da câmera). Formulário
> longo com o lookup perto do topo tolera (sobra espaço abaixo) — ex.: `NewSampleModal`.

### Conteúdo congelado na saída

Ao fechar, o sheet fica montado por `ANIMATION_MS` (460ms) para o slide e renderiza um **snapshot
do último estado aberto**. Se o consumidor recomputar os props durante a saída (trocar de step, por
exemplo), o conteúdo e a altura não mudam no meio do caminho. Durante a saída o sheet fica
`pointer-events: none` — sem clique fantasma no footer congelado.

### 🔴 Dois gotchas de navegação

**Navegar a partir de uma ação do sheet.** O sheet injeta uma entry de history e, no cleanup, chama
`history.back()` para desfazê-la. Como o `router.push` do App Router é assíncrono, esse `back()`
corre contra a navegação e a **desfaz** — a ação simplesmente "não navega". Limpe o marcador antes:

```ts
window.history.replaceState({ ...window.history.state, bottomSheet: false }, '');
router.push('/destino');
```

**Trocar de superfície a partir de uma ação do overlay.** Abrir o próximo sheet no mesmo tick do
`router.back()` faz o popstate atrasado engolir a entry que o sheet novo injeta — ele fecha sozinho
logo depois de abrir. Rode o swap **pós-fechamento**: um ref com o callback pendente + um effect que
observa o param sair da URL.

O árbitro de `popstate` do `BottomSheet` (contador `pendingInternalBacks`) é a peça mais delicada do
componente. **Sintoma quando quebra: o modal "não abre" em dev e funciona em prod** — Strict Mode só
duplica efeitos em dev. Se for mexer, leia os comentários no arquivo primeiro.

---

## §4 Empilhamento

### Tiers

| Camada                                | z-index                    |
| ------------------------------------- | -------------------------- |
| Backdrop base (sheet e modal central) | `--z-modal-backdrop` = 400 |
| Card base                             | `--z-modal` = 410          |
| Backdrop `.is-stacked`                | `--z-modal-stacked` = 600  |
| Card `.is-stacked`                    | 610                        |
| `.fv-panel-scrim` e `.is-scrim-none`  | 620                        |

Tokens em `app/globals.css` (`:root`). **Nunca escrever z-index numérico** em regra nova de
overlay — usar o token ou `calc()` sobre ele.

### Quando `stacked` é obrigatório

Sempre que a superfície abre **por cima** de outra que já está aberta. Sem `stacked`, o novo sheet
entra no mesmo tier 400/410 e o backdrop dele fica **atrás** do painel de baixo — o painel novo
aparece, mas clicável por fora e com o escurecimento no lugar errado.

```tsx
// Painel disparado de dentro do drawer do lote:
stacked={Boolean(loteId)}
```

O mesmo vale para modal central sobre painel: `.app-modal.is-stacked` + `.app-modal-backdrop.is-stacked`.

### Scrim não-somativo

Cada camada trazia o próprio escurecimento e eles se multiplicavam (drawer a 55% + painel = ~80% de
preto, com blur sobre blur). A regra em `globals.css` desliga o `background` e o `backdrop-filter`
dos scrims de baixo quando existe um empilhado no ar:

```css
body:has(.bottom-sheet-backdrop.is-stacked.is-open)
  :is(.bottom-sheet-backdrop.is-open, .app-modal-backdrop):not(.is-stacked) { … }
```

Três coisas a saber:

1. Só `background` e `backdrop-filter` caem. **Bloqueio de clique, scroll-lock e ordem de foco
   continuam** — ninguém sai do DOM.
2. O gatilho é só o scrim empilhado que de fato **escurece**. `.is-scrim-none` fica de fora de
   propósito: se ele disparasse a regra, nada escureceria.
3. `:has()` no `body` porque todo backdrop é portalado para lá. A especificidade (0,6,1) foi
   escolhida para vencer as regras de scrim próprio dos drawers (0,4,0) — **mexer no seletor
   provavelmente quebra isso**.

---

## §5 URL como estado

Detalhe de recurso é endereçável; criação e filtros não são.

```tsx
const loteId = searchParams.get('lote');
const openedLoteByPushRef = useRef(false);

const openLote = useCallback(
  (id: string, action?: SampleDetailInitialAction) => {
    const params = new URLSearchParams(searchParams.toString());
    const alreadyOpen = params.has('lote');
    params.delete('focus');
    params.delete('highlight');
    params.delete('source'); // residuais
    params.set('lote', id);
    if (action) params.set('acao', action);
    else params.delete('acao');
    const url = `/samples?${params.toString()}`;
    if (alreadyOpen) {
      router.replace(url, { scroll: false }); // troca de recurso: UMA entry só
    } else {
      router.push(url, { scroll: false });
      openedLoteByPushRef.current = true;
    }
  },
  [router, searchParams]
);

const closeLote = useCallback(() => {
  if (openedLoteByPushRef.current) {
    openedLoteByPushRef.current = false;
    router.back(); // consome a entry que criamos
    return;
  }
  const params = new URLSearchParams(searchParams.toString());
  ['lote', 'focus', 'highlight', 'source', 'acao'].forEach((k) => params.delete(k));
  const qs = params.toString();
  router.replace(qs ? `/samples?${qs}` : '/samples', { scroll: false });
}, [router, searchParams]);
```

**O ref não é opcional.** Deep-link e refresh chegam com o param na URL **sem** push nosso — chamar
`router.back()` nesse caso sai do app (ou volta para o site anterior). Sem o ref, o fechamento
funciona no fluxo normal e quebra exatamente no fluxo que veio de fora (QR code, link colado).

**Push, replace ou nada:**

| Param     | Como muda         | Por quê                                                         |
| --------- | ----------------- | --------------------------------------------------------------- |
| `?lote=`  | push ao abrir     | back tem que fechar o drawer                                    |
| `?lote=`  | replace ao trocar | detalhe→detalhe mantém UMA entry; back fecha em um passo        |
| `?acao=`  | replace           | consumido **uma vez** e limpo, para repetir a ação sem remontar |
| `?tab=`   | replace           | trocar de aba não é passo de navegação                          |
| `?focus=` | só leitura        | deep-link de entrada; limpo junto com o `?lote=`                |

Ação profunda do menu ⋯ (`?lote=<id>&acao=imprimir`): o host passa `initialAction` ao detalhe e um
`onInitialActionConsumed` que faz o replace limpando o param.

### 🔴 Quem é o dono do histórico: o overlay OU a URL, nunca os dois

O molde acima (push ao abrir) pressupõe que **a URL é a dona**. Vale para o `DetailOverlay`, que
passa `manageHistory={false}` ao sheet justamente por isso. Mas o `BottomSheet` **cru injeta entry
própria** — com push você teria duas, e o back precisaria de dois toques.

Antes de copiar o molde, decida quem manda:

| Contêiner                                           | Dono do histórico | Como a URL muda              |
| --------------------------------------------------- | ----------------- | ---------------------------- |
| `DetailOverlay` (`/samples`, `/cadastros`)          | a URL             | push ao abrir, back fecha    |
| `BottomSheet` cru como painel de detalhe (`/users`) | o sheet           | **replace sempre** (espelho) |

Em `/users` (RD16 §2.11 U-D9) a URL é **espelho**: `router.replace` ao abrir, ao trocar de usuário
e ao fechar. Dá tudo o que a §5 pede — deep-link, F5 e link compartilhável — sem disputar o
histórico com o sheet.

**Por que não `manageHistory={false}` lá também:** o mesmo sheet hospeda ver/editar **e criar**, e
criar não é endereçável. Virar a prop de `true` para `false` com o painel ABERTO dispara o cleanup
do efeito de histórico do sheet, que chama `history.back()` — fecharia o painel no meio da
transição criar→ver. A prop precisa ser constante durante a vida do sheet.

---

## §6 Foco e ARIA

O `BottomSheet` já põe `role="dialog"`, `aria-modal="true"` e `aria-label={ariaLabel}` — **sempre
passar o `ariaLabel`**, principalmente quando o painel não tem título visível (o padrão FV é
`title={null}` + seta ←).

`useFocusTrap` **cicla o Tab mas não devolve o foco** ao fechar. Quem abriu devolve:

```tsx
useEffect(() => {
  if (labelModalOpen) return;
  // setTimeout: o sheet ainda anima a saida com o focus-trap ativo;
  // focar no mesmo tick seria roubado de volta.
  const timer = window.setTimeout(() => lastQuickPrintButtonRef.current?.focus(), 0);
  return () => window.clearTimeout(timer);
}, [labelModalOpen]);
```

O `setTimeout(0)` não é superstição — sem ele o foco volta para dentro do sheet que está saindo.

`dismissGuardRef` (do `DetailOverlay`) é um ref, não estado: espelhar por effect quando o valor vem
de estado, para o guard não ler um valor velho.

---

## §7 Chrome comum dos painéis

Wash verde do topo cobrindo o painel inteiro (inclusive a faixa do cabeçalho, sem emenda de bordas
brancas), cantos arredondados só à esquerda (`14px 0 0 14px` — o painel encosta na borda direita da
tela) e cabeçalho **sem título**, com a seta ← mais baixa (`top: 30px`).

Hoje a regra lista nominalmente `.fv-panel-sheet`, `.new-sample-sheet` e `.samples-filter-sheet` —
escopo deliberado, só os painéis já migrados. **Painel novo de página já migrada: usar
`.fv-panel-sheet` e o chrome vem junto.** Quando o padrão for promovido, isto vira uma regra em
`.side-sheet`/`.detail-overlay` e os três nomes saem da lista.

---

## §8 Inventário por página × contêiner-alvo

**Alvo** = o contêiner pela árvore do §1. **Status**: ✅ já está lá · **fica** já conforme (não
muda) · **🔜 ciclo** migra quando o redesenho chegar na página — nada de conversão antecipada ·
**(confirmar)** alvo presumido, fechar no plan mode da página.

| Página                  | Superfície                                                                                                                 | Alvo                                           | Status                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Global                  | Senha inicial (aviso + form, no-dismiss)                                                                                   | central (aviso)                                | fica                                                      |
| Global                  | Menu do avatar; `CameraSheet` + 10 modais de classificação                                                                 | intacto                                        | fica                                                      |
| /login                  | Esqueci a senha (`login-modal-*`)                                                                                          | intacto (fora da app)                          | fica                                                      |
| /samples lista          | Filtros; Novo lote; quick-create de cliente; confirmação de liga                                                           | painel lateral                                 | ✅                                                        |
| /samples lista          | Perda; envio (tipo + destinatários no MESMO painel)                                                                        | painel lateral                                 | ✅                                                        |
| /samples lista + ?lote= | Imprimir etiqueta (painel próprio, sem abrir o drawer)                                                                     | painel lateral                                 | ✅                                                        |
| /samples ?lote=         | Detalhe do lote                                                                                                            | `DetailOverlay`                                | ✅                                                        |
| /samples ?lote=         | Editar registro; editar/reclassificar; deletar lote; reverter liga                                                         | painel lateral                                 | ✅                                                        |
| /samples ?lote=         | Classificação: ficha INLINE na aba + painel só de edição                                                                   | inline + painel                                | ✅                                                        |
| /samples ?lote=         | Editar envio; editar data de chegada                                                                                       | dropdown inline                                | ✅                                                        |
| /samples ?lote=         | Confirms; propagação de safra; descartes                                                                                   | central                                        | fica                                                      |
| /samples ?lote=         | `PhotoZoomViewer`; X-effect                                                                                                | intacto                                        | fica                                                      |
| /cadastros              | Filtros; novo cliente                                                                                                      | painel lateral                                 | ✅                                                        |
| /cadastros ?cliente=    | Detalhe do cliente (drawer de perfil)                                                                                      | `DetailOverlay`                                | ✅                                                        |
| /cadastros ?cliente=    | Editar cliente; filial nova/detalhe; conta nova/detalhe; anexo novo/preview                                                | painel lateral                                 | ✅                                                        |
| /cadastros ?cliente=    | Status cliente/filial (motivo) + cascata                                                                                   | central + `.fv-panel-scrim`                    | fica                                                      |
| /cadastros aba Corretor | Corretor (`BrokerFormModal`)                                                                                               | painel lateral                                 | ✅                                                        |
| /users                  | Detalhe + editar + **criar** — UM `BottomSheet` para os três modos (o `cdm-modal` morreu)                                  | painel lateral                                 | ✅ (RD16 §2.11 U3)                                        |
| /users                  | Redefinir senha — **seção dentro** do painel (era `window.prompt`)                                                         | inline no painel                               | ✅ (RD16 §2.11 U3)                                        |
| /users                  | Descartar rascunho (`.is-scrim-none` + `.is-compact`)                                                                      | central                                        | fica                                                      |
| /users, /profile        | Inativar (motivo); confirms; desativar push                                                                                | central                                        | fica                                                      |
| /relatorios             | Visita + Semanal (form-sheets)                                                                                             | painel lateral                                 | ✅ (RD16 §2.10 R3/R4; vale tb no dashboard do prospector) |
| /relatorios             | Informativo (2 colunas + preview ao vivo — gera imagem, sem persistência)                                                  | painel lateral                                 | ✅ (RD16 §2.10 R10)                                       |
| /relatorios             | Descarte de rascunho (`.is-scrim-none` + `.is-compact`); cancelar item; aviso 409 (sobre painel, `.fv-panel-scrim`)        | central                                        | fica                                                      |
| /relatorios             | Criar: 3 **botões na faixa** (desktop) · **leque do FAB** (mobile-only) — mesma fonte de estado (`useInformeCreateSheets`) | —                                              | ✅ (§2.10 R8/R13)                                         |
| /relatorios             | Filtro de tipo: **chips fixos no topo do feed**, aplicam imediato (não há painel de filtros)                               | inline                                         | ✅ (§2.10 R13/R14)                                        |
| /contratos              | Criação à vista: formulário (lote é campo) → documento (`.ctr-form-sheet.ctr-contract-sheet`, **700px**)                   | painel de **dois passos** (§1-A)               | ✅ (RC-D53/D58..D61/D69)                                  |
| /contratos ?details=    | Detalhe do contrato                                                                                                        | `DetailOverlay`                                | ✅                                                        |
| /contratos              | Filtros                                                                                                                    | painel lateral (`.side-sheet.fv-filter-sheet`) | ✅ (RC-D47)                                               |
| /contratos              | Ágio; washout; conferência do espelho; solicitar aprovação                                                                 | central                                        | fica                                                      |
| /contratos              | **Finalizar / Reabrir: SEM superfície** — ação direta no menu ⋯ e no rodapé do detalhe (RC-D63)                            | —                                              | ✅                                                        |
| /contratos ?details=    | Etiqueta de aprovação — **abre de dentro do `DetailOverlay`** (RC-D25)                                                     | central **stacked**                            | fica                                                      |
| /financeiro             | **Nenhuma** — a página é leitura pura (RC-D67)                                                                             | —                                              | ✅                                                        |
| Simulador               | Ficha de resultado (`.pg-ficha-sheet`, backdrop atravessável); connect menu                                                | painel lateral                                 | ✅ (PG52)                                                 |

**A migração acontece PÁGINA A PÁGINA**, dentro do redesenho completo de cada página: os
contêineres dela realinham na mesma passada, junto com estrutura, cards e tipografia. Cada página é
tocada uma vez. **Não converter contêiner isoladamente fora do ciclo** — ver `page-redesign-cycle`.

---

## §9 Checklist

- [ ] O contêiner saiu da árvore do §1, não de preferência
- [ ] Painel FV = `className="fv-panel-sheet side-sheet <própria>"` + `closeVariant="edge-back"` + `title={null}` + `ariaLabel`
- [ ] `stacked` quando abre sobre outra superfície aberta (painel **e** modal central)
- [ ] Todo guard de fechamento no `onDismissAttempt`, nenhum no `onClose`
- [ ] `dragDisabled` enquanto um confirm aninhado está aberto
- [ ] Detalhe dirigido por URL: push ao abrir, replace ao trocar, `openedByPushRef` no fechar
- [ ] Foco devolvido ao trigger em `setTimeout(0)`
- [ ] Nenhum z-index numérico novo — só tokens `--z-*`
- [ ] Submit no footer, sem "Cancelar" textual → `forms`
