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

| Prefixo   | Arquivos | Nasceu em           | Também serve                                            |
| --------- | -------- | ------------------- | ------------------------------------------------------- |
| `.sdv-*`  | 33       | detalhe da amostra  | detalhe do cliente, e outros                            |
| `.spv2-*` | 19       | lista de `/samples` | `/cadastros`, `/users`, contratos, financeiro, embarque |
| `.ctr-*`  | 15       | `/contratos`        | embarque, aprovações, financeiro                        |
| `.cv2-*`  | 8        | lista de clientes   | `/samples` e outras listas                              |
| `.rsm-*`  | 7        | `/relatorios`       | cards de visita/informe                                 |
| `.cdm-*`  | 3        | `/users`            | `/profile`                                              |

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
  overflow-y: auto;
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

## §7 Antes de escrever: três checagens

```bash
# 1. Esta classe tem consumidor no JSX?
grep -rn "minha-classe" --include=*.tsx app components | head

# 2. Quem MAIS usa a classe que vou mexer?
grep -rln "sdv-card" --include=*.tsx app components

# 3. Onde ela ja e declarada no CSS (pode ser em varios blocos)?
grep -n "\.minha-classe" app/globals.css
```

A checagem 2 é a que evita o estrago: se a classe aparece em mais de um componente, a regra vai
escopada.

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
- [ ] Sem `!important` — se pareceu necessário, o problema é o §5
- [ ] Sem `nth-child` novo em lista que pode reordenar
- [ ] Regra que perdeu consumidor foi marcada `DORMENTE` com o motivo
- [ ] Classe nova de kit não duplica genérica existente (§8)
