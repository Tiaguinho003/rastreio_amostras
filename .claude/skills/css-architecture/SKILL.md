---
name: css-architecture
description: Use this skill BEFORE writing or editing any rule in app/globals.css. A single 37k-line stylesheet shared by every page — this defines where a new rule goes (generic kit vs page scope vs component), which class prefixes are shared between pages, how to detect rules that are already dead, how to neutralize a legacy rule without a specificity war, and how to audit before touching.
---

# CSS — mexer em 37 mil linhas sem quebrar o vizinho

`app/globals.css` é **um arquivo só**, ~37 mil linhas, ~98 seções, compartilhado por todas as
páginas. Não há CSS Modules nem escopo por componente. Toda regra que você escreve pode alcançar
uma tela que você não abriu.

Esta skill é sobre **onde** escrever e **como não quebrar o vizinho**. O que escrever (tokens,
cards, tipografia) está em `design-system`.

---

## §1 O terreno

- **Mobile-first.** A regra base é mobile; o desktop entra em `@media (min-width: 901px)`.
  Escrever a regra desktop fora do media query é o erro mais comum e o mais silencioso — funciona
  na sua tela e quebra no celular do Flavio.
- Seções separadas por marcadores `/* ═══ TÍTULO ═══ */`. Regra nova vai **na seção do assunto**,
  não no fim do arquivo.
- **A ordem importa.** Várias decisões do kit dependem de uma regra vir depois de outra com a mesma
  especificidade (ex.: `.fv-filter-sheet` estreitando o `.side-sheet`). Mover blocos de lugar
  quebra coisas que a leitura do bloco isolado não revela.

---

## §2 Onde a regra vai

| Se a regra…                                     | Vai como                              |
| ----------------------------------------------- | ------------------------------------- |
| Serve a qualquer página do kit                  | `.fv-*` genérico, **sem** escopo      |
| É desta página e não faz sentido fora           | escopo de página (`.fv-lotes-page`)   |
| É deste componente e ele não é reusado          | classe própria (`.sample-loss-sheet`) |
| Reestiliza markup compartilhado só nesta página | escopo de contêiner (§3)              |

### Quando promover a genérico

Na **segunda** página que precisa da mesma coisa. Na primeira, escopo; na segunda, tire o escopo e
deixe o alias na origem com um comentário. Promover na primeira gera classe genérica com desenho
enviesado por um único caso.

O alias fica assim, e é assim que se lê um no arquivo:

```css
/* A versao `.fv-add-btn` e a GENERICA — use em pagina nova; `.fv-cd-add-btn`
   e o alias do cliente, mantido ate a consolidacao. */
.fv-add-btn,
.client-details-overlay .fv-cd-add-btn { … }
```

---

## §3 🔴 Os prefixos são compartilhados

**Um prefixo com nome de página não é escopo de página.** Quase todos foram reusados por outras
telas. Consumidores hoje:

| Prefixo   | Arquivos | Nasceu em           | Também serve                                              |
| --------- | -------- | ------------------- | --------------------------------------------------------- |
| `.sdv-*`  | 33       | detalhe da amostra  | detalhe do cliente, e outros                              |
| `.spv2-*` | 19       | lista de `/samples` | `/cadastros`, `/users`, `/profile`, contratos, financeiro |
| `.ctr-*`  | 13       | `/contratos`        | `/financeiro` (casca `.ctr-page`), espelho, ágio\*        |
| `.cv2-*`  | 8        | lista de clientes   | `/samples` e outras listas                                |
| `.rsm-*`  | 6        | `/relatorios`       | feed do dashboard do prospector                           |

> \* 🪦 **embarque saiu da lista.** Ele era o `ShipmentConfirmationModal` (nunca uma página —
> `/embarques` foi extinta na RC-F1, 2026-07-27), e o componente foi **deletado** na RC-D65
> (2026-07-28), quando o embarque foi apagado do produto. O bloco `.ctr-espelho-*`, em compensação,
> cresceu na RC-D106: além do toggle/resumo da conferência, ele carrega a **prateleira** dos espelhos
> guardados no detalhe do contrato (`.ctr-espelho-shelf*`).

> 🔴 **O caso `.fv-col-*` (RC-D112, 2026-07-30) é o exemplo mais limpo do "prefixo ≠ família".** Quando
> a tabela de `/contratos` virou lista de cards, cinco classes de coluna pareciam "de contratos" e
> estavam num bloco só, com comentário dizendo isso. Apagar o bloco inteiro teria levado
> `.fv-col-contract` (que o `/financeiro` usa, mesmo dado) e `.fv-col-sacks` (que o `/samples` usa)
> junto — duas tabelas vivas quebrando por causa de uma que morreu. Morreram só
> `.fv-col-parties/-dates/-situacao`. **Antes de apagar um bloco de classes com nome de página,
> `grep` cada seletor no JSX inteiro, não no do consumidor que você está mexendo.**
>
> Na mesma rodada morreram por perda de consumidor: `.ctr-situacao-cell` e as **13 regras
> `.ctr-phase*`** (a linha de 5 fases, RC-D116), `.ctr-card-blocked` e todo o acordeão do card
> (`.ctr-card-head-btn`, `-chevron`, `-expanded*`, `-essential`, `-stat*`, `-washout`, `-actions`).

> **`.cdm-*` não existe mais.** Nasceu no modal de cliente, sobreviveu servindo o modal de `/users`
> (§2.11 U6) e depois só pelo botão salvar de `/profile`; as últimas 9 regras saíram na §2.12 P3.
> Fica registrado porque o nome ainda aparece em docs e comentários antigos — **não recriar**.

### O caso mais afiado: `.sdv-*`

173 classes no CSS; 68 usadas pelo `SampleDetailView` e 37 pelo `ClientDetailView`, com **14 no
núcleo comum**: `sdv-page` · `sdv-content` · `sdv-content-inner` · `sdv-general` · `sdv-card` ·
`sdv-card-header` · `sdv-card-title` · `sdv-informacoes` · `sdv-info-compact` · `sdv-info-grid` ·
`sdv-info-item` · `sdv-info-label` · `sdv-info-value` · `sdv-edit-row`

Mexer numa dessas 14 sem escopo muda **os dois detalhes**. Sempre escope no contêiner:

```css
.lote-details-overlay .sdv-card { … }      /* só o drawer do lote   */
.client-details-overlay .sdv-card { … }    /* só o drawer do cliente */
```

### O mais fácil de subestimar: `.spv2-*`

Os estados de lista (`.spv2-list-scroll`, `.spv2-empty`, `.spv2-error-banner`,
`.spv2-skeleton-card`) são reusados por **todas** as listas do app, inclusive páginas que ainda não
entraram no ciclo de redesenho. Restilizar o "vazio" de uma lista mexe no vazio de todas.

**Regra:** antes de editar qualquer regra de prefixo de página, rode a checagem do §7. Se voltar
mais de um arquivo, a regra vai escopada no contêiner da página.

---

### Um molde por trabalho, não um por consumidor

`.ctr-details-doc-frame` e `.ctr-doc-frame` eram a **mesma coisa** — `<iframe>` de PDF com hairline e
raio — em dois lugares da mesma tela, só porque nasceram em componentes diferentes (o detalhe e o
modal do espelho). Quando a RC-D125 juntou os dois na mesma superfície, a duplicação virou óbvia: uma
sobrou.

E aí a unificação mostrou o que a duplicação escondia. Com **um** molde de documento, ficou visível
que existia um **terceiro** — `.ctr-doc-pages`/`.ctr-doc-page`, do passo da emissão, que não era
`<iframe>` nenhum: era o PDF **rasterizado** em `<img>`. Os dois desenhos mostravam o mesmo documento
e não se pareciam, porque o `<iframe>` traz o **visualizador do navegador** junto (barra escura,
miniaturas, fundo cinza) e o rasterizado é só a folha. A RC-D130 matou o `<iframe>`: hoje há **um**
molde e um componente (`ContractDocumentView`).

Duas perguntas, nesta ordem, antes de escrever a regra nova:

1. **Já existe uma classe que faz este desenho nesta tela?** Se existe e o nome só não bate, o
   problema é o nome, não a regra.
2. **E existe uma que faz esta MESMA COISA de outro jeito?** Duas regras que resolvem o mesmo
   problema com desenhos diferentes não são duplicação — são uma decisão que ninguém tomou. Ao juntar
   as duas primeiras, olhe as vizinhas.

---

## §4 🔴 Morto por seletor

Regra que **existe, está bem escrita, e não aplica em lugar nenhum** porque o seletor referencia
uma classe que saiu do JSX. Caso vivo hoje:

```
.sdv-page--sample   →   70 ocorrências no CSS, ZERO no TSX
```

São 70 regras que parecem governar o detalhe do lote e não governam nada. O risco não é o peso do
arquivo — é **você editar uma delas para consertar um bug e concluir que "o CSS não faz efeito"**,
partindo para `!important` ou para uma regra nova mais específica que briga com a que de fato
manda.

**Antes de editar uma regra que parece não funcionar, confirme que ela aplica:**

```bash
grep -rn "minha-classe" --include=*.tsx app components | head
```

Zero resultados = a regra está morta. Não conserte: apague, ou aponte o seletor para a classe que o
JSX realmente usa.

### 🔴 Ao APAGAR em lote: prefixo não é família

Na varredura o instinto é "essa família inteira morreu, some com `.xyz-*`". **Prefixo comum não
quer dizer destino comum.** A remoção tem que ser token a token, com casamento de **token
completo** — `\.token(?![A-Za-z0-9_-])` —, nunca por `startsWith`.

Caso real (RD17 §2.12 P3): o plano dizia "a família `.sdv-edit-*` fica órfã quando `/profile`
migrar". Metade ficou. Morreram `-fields`, `-field`, `-label`, `-input`, `-actions` e `-btn`;
**continuam vivos** `-row`, `-sep`, `-hint`, `-label-hint` e `-btn-small`, em seis componentes de
cliente e de lote. Apagar por prefixo teria levado os cinco junto — e `-btn-small` não herda nada de
`-btn`, então o estrago seria visível na hora, em página fora da vez.

Duas verificações que fecham o buraco:

1. **O uso se mede dentro de `className`, com os comentários do fonte removidos antes de casar** —
   senão um comentário citando a classe a "ressuscita" (o caso do `.sdv-header-top`, vivo por uma
   menção em comentário no `AppShell`).
2. **Depois de casar em `className`, procure o token cru em TODAS as formas textuais** — é o único
   jeito de pegar classe montada em runtime (`` `sdv-edit-btn${small ? '-small' : ''}` ``), que
   nenhuma varredura de `className` literal enxerga.

E confirme o resultado por **diferença de conjuntos de seletores** antes/depois (`postcss.parse`),
não pelo diff: o número que importa é "saiu algo que não continha token morto?".

> 🔴 **O lado do CSS tem a armadilha simétrica — e ela é nossa.** Extrair os candidatos com um
> `/\.([a-z0-9-]+)/g` cru sobre o `globals.css` colhe classe **de dentro dos comentários**, e este
> projeto deixa 🪦 lápides justamente com o nome do que morreu. A varredura então acusa como morto o
> que já foi apagado, e você vai procurar uma regra que não existe. `postcss.parse` + `rule.selectors`
> não tem esse problema; um regex sobre o texto inteiro tem. Mesma raiz: **`--token-x` e `.token-x`
> são nomes diferentes** — os `--pg-node-*` sobreviveram à morte das regras `.pg-node-lote/-mistura/-resultado`
> porque quem os consome (`.pg-accent-*`) vive em outra tela.

### 🔴 Regra agrupada: remover o SELETOR, não a regra

O script de poda encontra a classe morta dentro de uma regra que tem **vários seletores** — e
apagar a regra inteira leva junto os vivos. Aconteceu na RC-F6: uma passada removeu
`.sample-detail-reclassify-actions` e o dropdown do `client-lookup` dentro do
`.samples-filter-sheet`, os dois em produção, porque dividiam a chave `{ }` com um seletor morto.

```js
const alive = rule.selectors.filter((s) => !DEAD.test(s));
if (alive.length === 0) rule.remove();
else if (alive.length !== rule.selectors.length) rule.selectors = alive;
```

Duas consequências práticas: a poda relata **dois** números (regras removidas **e** regras
_aparadas_), e o `git checkout` que conserta um estrago desses leva junto qualquer adição feita no
mesmo arquivo na mesma sessão — reaplique-as depois de reverter.

---

## §5 Neutralizar uma regra legada

Quando uma regra antiga alcança o markup novo e está errada ali, a saída **não** é `!important` nem
inventar especificidade maior.

### Repetir o `:has()` para empatar e vencer pela ordem

```css
/* Os seletores repetem o `:has` pra empatar em especificidade e vencer pela ordem. */
.lote-details-overlay .sdv-content,
.lote-details-overlay .sdv-content:has(.sample-detail-commercial-pane) {
  display: block;
  overflow: visible;
}
```

A primeira linha cobre o caso geral; a segunda **empata** com a regra legada
(`… :has(.sample-detail-commercial-pane)`) e ganha por estar depois no arquivo. Uma regra escopada
sem o `:has()` repetido perde para a legada, mesmo tendo o escopo a mais.

### `nth-child` é armadilha

`.sdv-general > .sdv-card:nth-child(2)` foi escrito para uma ordem de cards que já mudou. Prefira
`.sdv-general > .sdv-card.classe-nomeada`. Ao encontrar `nth-child` numa regra que vai tocar,
confira no JSX qual card é aquele **hoje**.

---

## §6 CSS dormente

Regra que ficou sem consumidor por uma mudança de produto, mas que talvez volte. O protocolo é
**anotar no lugar**, não apagar de imediato e não deixar em silêncio:

```css
/* DORMENTE (FV /samples, ajuste pos-F3): o "Novo lote" era o unico consumidor
   e migrou pro kit `.fv-form-*`. */
```

Na consolidação de fim de ciclo, todo bloco marcado é reavaliado: voltou a ter consumidor, fica;
não voltou, sai. Sem a marcação, ninguém sabe se aquilo é dívida ou peça viva.

**Diferença que importa:** _dormente_ = sem consumidor, seletor válido. _Morto por seletor_ (§4) =
tem consumidor aparente, mas o seletor não casa. O segundo é perigoso; o primeiro é só peso.

---

## §7 Antes de escrever: quatro checagens

```bash
# 1. Esta classe tem consumidor no JSX?
grep -rn "minha-classe" --include=*.tsx app components | head

# 2. Quem MAIS usa a classe que vou mexer?
grep -rln "sdv-card" --include=*.tsx app components

# 3. Onde ela ja e declarada no CSS (pode ser em varios blocos)?
grep -n "\.minha-classe" app/globals.css

# 4. O kit JA TEM esta peca? Procure pelo PREFIXO que voce ja esta usando,
#    nao pelo nome que voce ia inventar:
grep -n "\.sdv-info" app/globals.css
```

A checagem 2 é a que evita o estrago: se a classe aparece em mais de um componente, a regra vai
escopada.

### 🔴 A checagem 4 é a que se esquece

Peça nova nasce com o nome que **você** ia dar, e por esse nome o grep não acha nada — então parece
que não existe. Procure pelo **prefixo do markup em que a peça vai morar**: se o JSX já é
`.sdv-info-grid` / `.sdv-info-label` / `.sdv-info-value`, a peça mora ao lado, no mesmo bloco.

Caso real (RD16 §2.11 U3, corrigido em `258ac62`): o painel de `/users` precisava de "valor + botão
de copiar na mesma linha" e ganhou `.usr-panel-value-row` + `.usr-panel-copy` montado sobre
`.fv-iconbtn`. O kit já tinha **`.sdv-info-value-row` + `.sdv-info-copy`** — escritas para essas
mesmas linhas, três regras abaixo de `.sdv-info-value` no `globals.css`, e vivas no detalhe do
cliente com o mesmo SVG. A duplicata custou dois commits de ajuste de cor num botão que nunca era
o certo.

---

## §8 Aliases a eliminar

Pares genérico ↔ alias vivos hoje. **O genérico é o canônico**; o alias fica até a consolidação
final. Nenhum código muda por causa desta lista — ela existe para que página nova nasça no genérico:

| Canônico                        | Alias legado             |
| ------------------------------- | ------------------------ |
| `.fv-add-btn`                   | `.fv-cd-add-btn`         |
| `.fv-iconbtn`                   | `.fv-cd-*` equivalentes  |
| `.fv-tabs`                      | `.fv-cd-tabs`            |
| `.fv-more-*`                    | `.fv-cd-more-*`          |
| `.fv-panel-sheet`               | `.client-panel-sheet`    |
| `.fv-form-*`                    | `.client-quick-create-*` |
| `.samples-filter-multi--select` | `.chip-select-*`         |

---

## §9 Checklist

- [ ] A regra desktop está dentro de `@media (min-width: 901px)`
- [ ] Foi para a seção do assunto, não para o fim do arquivo
- [ ] Se toca `.sdv-*` ou outro prefixo compartilhado: escopada no contêiner
- [ ] Verificado que a classe tem consumidor no JSX (§4)
- [ ] Verificado quem mais usa a classe (§7)
- [ ] Peça NOVA: procurado no kit pelo prefixo do markup antes de escrever (§7, checagem 4)
- [ ] Sem `!important` — se pareceu necessário, o problema é o §5
- [ ] Sem `nth-child` novo em lista que pode reordenar
- [ ] Regra que perdeu consumidor foi marcada `DORMENTE` com o motivo
- [ ] Classe nova de kit não duplica genérica existente (§8)
