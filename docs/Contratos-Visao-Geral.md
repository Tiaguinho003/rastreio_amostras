# Contratos — Visão Geral

Status: Ativo (documento-mãe / verdade viva do funcionamento atual)
Escopo: o que as páginas `/contratos` e `/financeiro` fazem hoje — a casca (rotas + acesso por papel), o contrato de compra e venda ("Fechamento" → PDF), o Espelho de Corretagem, a carteira do **Financeiro**, a **aprovação**, as **três situações** do contrato e a **agenda** derivada delas, o modelo de dados e as rotas de API.
Última revisão: 2026-07-30 (**RC-D121..D129** — o detalhe do contrato vira **4 abas** e as três superfícies que flutuavam sobre ele viram conteúdo. Seguida de uma **varredura de alinhamento** no mesmo dia: docs, skills e comentários de código conferidos contra o código.)
Documentos relacionados: `Contratos-Plano-de-Trabalho.md` (backlog, decisões e pendências), `Dashboard-Visao-Geral.md` (eventos/cards que apontam pra cá), `Auditoria-Navegacao-por-Papel.md`, `API-e-Contratos.md`, `Produto-e-Fluxos.md`

**As rodadas do ciclo RC** (o porquê de cada uma está na seção indicada do `Contratos-Plano-de-Trabalho.md`):

| Data       | Decisões      | §   | O que mudou                                                                               |
| ---------- | ------------- | --- | ----------------------------------------------------------------------------------------- |
| 2026-07-27 | RC-D1..D26    | 5   | `/contratos` e `/financeiro` viram páginas separadas; **`/embarques` extinta**            |
| 2026-07-28 | RC-D27..D61   | 5   | A criação repensada: painel de 2 passos, o **lote como 1º campo**, o documento como passo |
| 2026-07-28 | RC-D62..D68   | 6   | 🔴 **O contrato deixa de ser máquina de status e vira AGENDA**; o embarque é apagado      |
| 2026-07-29 | RC-D69..D73   | 7   | O lote vira campo; o campo travado ganha a 2ª forma                                       |
| 2026-07-29 | RC-D74..D83   | 8   | Status ≠ fase; a linha de 5 fases nasce (e morre na RC-D116)                              |
| 2026-07-29 | RC-D84..D86   | 9   | Finalizar significa que o contrato inteiro aconteceu                                      |
| 2026-07-29 | RC-D87..D91   | 10  | O washout **pergunta** se haverá cobrança; o lote vira leitura                            |
| 2026-07-29 | RC-D92..D95   | 11  | `/financeiro` no kit FV: tabela + KPI row que é o filtro                                  |
| 2026-07-29 | RC-D96..D102  | 12  | A etiqueta de aprovação **edita de volta** (Nº compra + lotes)                            |
| 2026-07-29 | RC-D103..D111 | 13  | O espelho entregue passa a ficar **guardado** (snapshot + retenção de 15 dias)            |
| 2026-07-30 | RC-D112..D120 | 14  | A lista vira **card nos dois breakpoints**, com barra de TEMPO e ordem por urgência       |
| 2026-07-30 | RC-D121..D129 | 15  | O detalhe vira **4 abas**; três modais viram conteúdo                                     |
| 2026-07-30 | —             | 16  | Varredura de alinhamento: docs, skills e comentários conferidos contra o código           |
| 2026-07-30 | RC-D130       | 17  | As 3 inconsistências corrigidas; o documento vira **página rasterizada**, não `<iframe>`  |
| 2026-07-30 | —             | 18  | O código morto sai: a worklist de aprovação, o upload de foto por HTTP e 2 blocos de CSS  |

> ⚠️ **O contrato não é livro de status — é agenda** (RC-D62..D68, `Contratos-Plano-de-Trabalho.md` **§6**). Ele guarda só o que é **subproduto de trabalho já feito** (emitir o PDF, imprimir a etiqueta, gerar o espelho, aplicar ágio, cancelar por washout) e deixou de pedir **escrituração** — marcar faturado, marcar pago, confirmar embarque. Sobraram **três situações** (`EMITIDO` · `FINALIZADO` · `WASH_OUT`) e uma **agenda derivada** das datas que o documento já imprime. O **embarque foi apagado inteiro**. Tudo abaixo descreve o **código de hoje**.

> **Como este documento se mantém vivo:** a cada implementação concluída e validada, esta Visão Geral é atualizada no mesmo passo. As **decisões, o histórico e o backlog** vivem no `Contratos-Plano-de-Trabalho.md`; aqui fica **só o estado atual**. Esta consolidação (2026-07-13, 4→2 docs) absorveu e removeu os antigos `Central-de-Contratos-`, `Aprovacoes-` e `Embarque-Plano-de-Trabalho.md` — o histórico completo de decisões (D/CC/AP/EMB) e de sessões está no Git e, condensado, no apêndice do `Contratos-Plano-de-Trabalho.md`.

---

## 1. Propósito e quem usa

O contrato de compra e venda de café é operado em **2 páginas sem sub-aba nenhuma** (RC-F1/RC-F4, 2026-07-27) — o eixo não é mais gestão × operação, é **o contrato × o dinheiro consolidado**:

- **`/contratos`** — **o contrato inteiro**, de ponta a ponta (todo não-PROSPECTOR): nasce, vira PDF, ágio, **finalizar/reabrir**, washout, e — dentro do detalhe — o **Espelho de Corretagem** (RC-D42) e **gerar a etiqueta de aprovação** (RC-D25). Lista: **cards nos dois breakpoints** (RC-D112 — revoga a tabela da RC-D43); busca/filtros/paginação no servidor (RC-D45), ordenada por **urgência** (RC-D117). O que o card destaca é o **prazo**: uma barra de tempo + o **próximo compromisso** em dias (RC-D68/D114), não um rótulo de fase — ver §4.0.
- **`/financeiro`** — **só ADMIN** (RC-D3): a carteira consolidada de corretagem a receber, **em leitura pura** (RC-D67). É um **recorte gerencial**, não uma etapa do fluxo: nenhuma ação mora aqui.

Um contrato não muda de página no ciclo: **tudo acontece em `/contratos`**. O `/financeiro` olha o conjunto de fora. Desde o **ACESSO UNIFICADO (2026-07-15)** todo não-PROSPECTOR abre `/contratos`; o PROSPECTOR não acessa nenhuma das duas, e os demais 4 papéis não abrem o `/financeiro`.

> **O que morreu aqui:** `/embarques` (redirect → `/contratos`) e as worklists de **Aprovações** e **Embarque** que viviam nela (RC-F4); e, na **RC-D65**, o **embarque inteiro** — confirmação, fotos, transporte, worklist e eventos. A fila proativa ("quais contratos precisam de etiqueta hoje?") vive no **card de Avisos** do dashboard, nos **chips do calendário** e na própria lista, que ordena por urgência e mostra o compromisso em cada card.

---

## 2. A casca — rotas e acesso

> Autoridade da casca (2 páginas independentes, **sem sub-abas** desde a RC-F1). Código: `app/contratos/page.tsx`, `app/financeiro/page.tsx`, `app/embarques/page.tsx` (redirect), `lib/roles.ts`, `components/AppShell.tsx`, `components/HeaderAvatarMenu.tsx`.

### 2.1 Rotas e esquema de URL

- **`/contratos`** — página única: um `ContratosPanel` direto, sem `role="tablist"`, sem `?tab=`.
- **`/financeiro`** — página própria (RC-D1), guard **ADMIN**, um `FinanceiroPanel` direto.
- **`/embarques`** — **extinta** (RC-D2): `redirect('/contratos')` server-side. Vale para qualquer `?tab=` que viesse junto.
- **Compat de deep-link:** `/contratos?tab=financeiro` faz `router.replace('/financeiro')`; os demais valores de `?tab=` são **ignorados em silêncio** (a página não tem mais aba para ativar).
- **`?details=<id>`** (detalhe do contrato) e **`?highlight=<id>`** (pisca/rola até ele, via `useContractHighlight`) continuam iguais — e agora são o **único** esquema de URL de `/contratos`.
- **Nav:** **2 itens** — "Contratos" (`/contratos`, todo não-PROSPECTOR) e "Financeiro" (`/financeiro`, **só ADMIN**). Na **sidenav desktop** os dois aparecem, agora em 3º e 6º lugar (ordem de 2026-07-28: Início · Lotes · **Contratos** · Relatórios · Cadastros · Financeiro · Usuários). No **mobile** eles se separaram: **Contratos é a 3ª aba da tabbar** (2026-07-28) e Financeiro segue no **menu do avatar**, que não repete nenhuma aba da barra. O item "Embarques" saiu. Nenhum dos dois tem sub-itens (`NAV_SUB_ITEMS` perdeu as duas entradas; seção sem sub-itens vira link simples).

### 2.2 Acesso por papel

Fonte da verdade: `lib/roles.ts` (`NON_PROSPECTOR_ROLES`, `CONTRATOS_ROLES`, `FINANCEIRO_ROLES`, `PAYMENT_FEED_ROLES`), espelhando `SALE_CONTRACT_ACCESS_ROLES`/`FINANCEIRO_ROLES`/`PAYMENT_FEED_ROLES` do backend. `CONTRATOS_ROLES` **= `NON_PROSPECTOR_ROLES`** desde o **ACESSO UNIFICADO (2026-07-15)**; `FINANCEIRO_ROLES` **voltou a ser `['ADMIN']`** na **RC-D3** (2026-07-27).

| Papel        | `/contratos` | `/financeiro` | Itens de nav           |
| ------------ | :----------: | :-----------: | ---------------------- |
| ADMIN        |      ✅      |      ✅       | Contratos + Financeiro |
| COMMERCIAL   |      ✅      |       —       | Contratos              |
| CLASSIFIER   |      ✅      |       —       | Contratos              |
| REGISTRATION |      ✅      |       —       | Contratos              |
| CADASTRO     |      ✅      |       —       | Contratos              |
| PROSPECTOR   |      —       |       —       | (nenhum)               |

Regras que geram a matriz:

- **`/contratos` = `CONTRATOS_ROLES` (= `NON_PROSPECTOR_ROLES`)** — o contrato inteiro, aberto a **todo não-PROSPECTOR**. Só o PROSPECTOR é redirecionado pelo guard (→ /dashboard).
- **`/financeiro` = `FINANCEIRO_ROLES` (= `['ADMIN']`, RC-D3)** — a **primeira rota ADMIN-only** do domínio de contratos. Guard de página (`useRequireAuth`) + `assertRoleAllowed` no service (`listBrokerReceivables` → 403 para os outros 4).
- **O gate é de ROTA, não de campo (RC-D4):** dentro do contrato **todos** continuam vendo dinheiro — valores, ágio e corretagem no detalhe. O ADMIN-only protege a **carteira consolidada**, não o número.
- **O feed de pagamento do calendário NÃO acompanhou (RC-D5):** ele era gateado pela mesma constante; apertar sem partir em duas teria tirado o pagamento do calendário de 4 dos 5 papéis. Nasceu `PAYMENT_FEED_ROLES = NON_PROSPECTOR_ROLES` para ele.
- **Escopo aberto (own-only revogado — D140):** dentro do que cada papel acessa, **não há recorte por `Broker.userId`** — quem abre, vê todos os contratos.

> ⚠️ **Alívio de UI vs. segurança:** entre os cinco papéis não-PROSPECTOR, a **única** fronteira real é `/financeiro`. `/contratos` é **auth-only** para qualquer não-PROSPECTOR autenticado, e **Finalizar/Reabrir** estão abertos a todos eles — o ADMIN-only vale para a carteira, não para a situação do contrato.

---

## 3. As três situações e a agenda (dono único)

> Esta seção é a **casa única** do modelo de situação do contrato. Código: `src/sale-contracts/sale-contract-service.js` (`emit`/`finalize`/`reopen`/`washout`), `sale-contract-support.js` (`deriveContractAgenda`).

O contrato tem **3 situações** (`SaleContract.status`) — RC-D62:

```
        emitir (atômico)          Finalizar
  (venda) ───────────────▶ EMITIDO ⇄──────────▶ FINALIZADO
                              │      Reabrir
                              └──────── washout (a qualquer momento) ──────▶ WASH_OUT
```

- **EMITIDO** — "em andamento". Criado **atômico** a partir da venda + Etapa 2 (não há rascunho; D96/D97). Registra `SaleContractStatusLog`.
- **FINALIZADO** — o processo acabou. **Um toque, sem formulário de data, e reversível** (RC-D63): "Reabrir" volta para `EMITIDO`. Cada ida e volta grava uma linha no `SaleContractStatusLog` com ator e data — a reversão é **histórico, não apagamento**.
- **WASH_OUT** — `washoutSaleContract` cancela/desfaz o negócio; **definitivo e sem desfazer** (D122, que segue valendo **aqui**). Ele **pergunta duas coisas**, ambas obrigatórias e ambas definitivas: o **motivo** e se **haverá cobrança de corretagem** (RC-D89/D90, `washoutBillable`). A resposta é o que decide se o contrato continua no Financeiro (§6) e se o Espelho sai (§5) — antes isso era derivado do `type` (D145, revogada). Sem resposta gravada, **não cobra** (`!== true`: o sistema não inventa cobrança). 🔴 **É a única porta do washout:** desfazer a VENDA pelo lote foi fechado (RC-D87) — o serviço recusa com 409 `MOVEMENT_HAS_CONTRACT` quem chega sem a resposta, porque por ali ninguém teria como respondê-la. A **perda** segue cancelável pelo lote (ela não tem contrato).

**Não há portões.** `FATURADO` e `PAGO` saíram do enum; com eles saíram o portão de aprovação (AP18) e o de embarque (EMB28) — **RC-D65/RC-D66**. Finalizar exige só `EMITIDO` + `expectedVersion` (409 `SALE_CONTRACT_NOT_FINALIZABLE` / `SALE_CONTRACT_VERSION_CONFLICT`); reabrir, só `FINALIZADO` (409 `SALE_CONTRACT_NOT_REOPENABLE`). Nenhuma das duas pede confirmação: são reversíveis.

### A agenda (RC-D68)

O que o card mostra ao lado da barra de tempo não é fase — é **o próximo compromisso**, derivado por `deriveContractAgenda(input, todayKey)` sem persistir nada. A **mesma** agenda tem duas formas de frase, porque as duas telas fazem perguntas diferentes (RC-D114):

| `kind`              | Quando                                                           | Lista (contagem)     | Detalhes (data)               |
| ------------------- | ---------------------------------------------------------------- | -------------------- | ----------------------------- |
| `cancelado`         | `WASH_OUT`                                                       | "Cancelado"          | "Cancelado"                   |
| `finalizado`        | `FINALIZADO`                                                     | "Concluído"          | "Finalizado"                  |
| `aprovacao`         | exige aval, sem etiqueta, dentro da janela do lead (ou sem data) | "Aprovação a enviar" | "Aprovação a enviar"          |
| `pagamento_vencido` | `paymentDate` < hoje                                             | "Venceu há 4 dias"   | "Pagamento venceu 02/08/2026" |
| `faturamento`       | `invoiceDate` ≥ hoje                                             | "Fatura em 3 dias"   | "Fatura em 12/08/2026"        |
| `pagamento`         | sobrou `paymentDate`                                             | "Paga em 12 dias"    | "Pagamento em 20/08/2026"     |
| `nenhum`            | nada por vir                                                     | "Sem prazo definido" | "—"                           |

A precedência é a ordem da tabela. **Atraso só existe no `paymentDate`** (RC-D64) — o `invoiceDate` é lembrete puro: passou o dia, o aviso se recolhe, nada fica vermelho. A derivação usa 5 ingredientes (`status`, `requiresApproval`, existência de etiqueta, `invoiceDate`, `paymentDate`) e é a **mesma função** na lista e no detalhe, para os dois não divergirem. O backend devolve `{ kind, dayKey }`; as frases em pt-BR são montadas no front — `contractCountdownLabel` (lista, `lib/contract-timeline.ts`) e `contractAgendaLabel` (Detalhes, `SaleContractCard.tsx`).

**Regras que sobreviveram nas datas planejadas:**

- **Dia útil (DSB-D7):** `invoiceDate` e `paymentDate` rejeitam fim de semana (`422 WEEKEND_DATE`).
- **Ordem (D142):** a criação/edição rejeita `paymentDate` anterior a `invoiceDate` (`422 VALIDATION_ERROR` no campo, espelhado no form). Contratos já emitidos não são revalidados.
- **"À definir" no FUTURO (D144):** em contratos `FUTURO`, cada data planejada pode — independentemente — ser **"À definir"** (`null` explícito no payload; `undefined` segue 422). À vista exige as duas sempre, inclusive no Editar. Com data "à definir" o contrato **não gera evento no calendário** e a agenda simplesmente não a considera; o Editar define depois — e pode voltar uma definida para "à definir".

---

## 4. `/contratos` — o contrato de compra e venda

> Código: `SaleContractCard`, `SaleContractEtapa2Modal`, `SaleContractDetailsModal`, `SaleContractLifecycleDialog`; `src/sale-contracts/sale-contract-service.js`, `sale-contract-pdf-service.js`, `issuer-config.js`. Mercados **à vista** e **futuro** funcionam ponta a ponta.

### 4.0 A lista (RC-D112..D120)

**Cards nos dois breakpoints** — a tabela de 5 colunas do desktop (RC-D43) saiu na **RC-D112**: cada contrato é uma _história_ (prazo correndo, estado, próximo compromisso), não um valor a comparar linha a linha com o vizinho. O card responde três coisas, nesta ordem:

1. **QUEM** — `nº — vendedor → comprador` numa linha, truncando por reticências.
2. **QUANTO TEMPO FALTA** — a **barra de tempo** (`contractDate → paymentDate`, cheia até hoje) + a frase do próximo compromisso em **contagem de dias**. 🔴 Ela mede **tempo**, não fases — é o que a distingue da barra que a RC-D82 recusou (§8 do Plano): tempo é monotônico, então o preenchimento não afirma que algo foi cumprido. Sem `paymentDate` ("À definir", D144) **não há trilho**, só a frase.
3. **EM QUE PÉ ESTÁ** — a faixa de campos: `Sacas · Tipo · Datas · Status` no desktop, **`Sacas · Status` no mobile** (RC-D119 — troca de árvore, não de CSS).

A **tarja** lateral, o preenchimento da barra e o **ponto** do status saem de **uma derivação só** (`contractTimeProgress`): azul correndo · **vermelho atrasado** · verde finalizado · laranja cancelado (RC-D115 — o vermelho é do atraso, e por isso o washout virou laranja). É o que faz um contrato emitido e vencido ficar vermelho inteiro sem que "atrasado" exista como status no banco.

**Dinheiro não está na lista** (RC-D113): total, preço/saca, ágio e data do contrato vivem no Detalhes e no `/financeiro`.

**Ordem = urgência** (RC-D117): atrasado → o que vence mais perto → finalizado → cancelado, com "À definir" no fim do grupo em aberto. **A KPI row é o filtro** (RC-D118): 4 cartões no desktop, 2 no mobile (Em aberto · Atraso); clicar num deles **escreve** no filtro do painel, e o destaque do cartão é derivado do filtro — desmarcar no painel apaga o destaque sozinho. Detalhes de API em §10.

**O card inteiro abre os Detalhes** (RC-D120): sem seta, sem "Ver detalhes" no menu, e sem acordeão. O ⋯ sobrou com Finalizar/Reabrir, e não aparece no cancelado (não há marco a mover).

### 4.1 Da venda ao PDF (Etapa 1 → Etapa 2)

- **Entrada:** o FAB radial da página (`ContractCreateRadialFab`) oferece os 2 mercados. **À vista:** um painel de **dois passos** (`SaleContractEtapa2Modal`) — formulário em modo _spot_ → conferência do documento (`ContractDocumentStep`) — venda + contrato nascem **atômicos** (D97), já EMITIDO. O **lote é o primeiro campo** do formulário (`ContractLotField`, RC-D69): busca com dropdown entre os lotes vendáveis, obrigatório, e escolher preenche na hora vendedor, filial, conta bancária, sacas e liga. Trocar ou limpar o lote zera exatamente o que veio dele; o resto do formulário fica. **Futuro:** Etapa 2 direto, sem lote/venda; as datas planejadas de faturamento/pagamento podem nascer **"À definir"** (checkbox por campo — D144) e ser definidas (ou revertidas) no Editar. O futuro é **contrato de papel** (D147): nasce sem lote e **nunca ganha um** — o físico é rastreado à parte pelos lotes.
- **Etapa 1 (Venda):** a venda origina os dados do contrato (partes, produto, quantidade em sacas, preço, modalidade, prazos). As partes entram como **snapshots** no contrato (não referência viva) para o PDF ser fiel ao momento.
- **Etapa 2 (Geração):** o modal de geração completa/valida os campos que faltam e **emite** o contrato (→ EMITIDO), gerando o **PDF** para impressão. Campos têm origem/obrigatoriedade/validação próprias (detalhe no código + os limites de data em §3).
- **Editar (re-emissão):** só age sobre `EMITIDO`. **O lote não muda** — aparece travado, com o número (RC-D72, `sampleLotNumber` no detalhe). **O vendedor NÃO é editável em contrato com lote** — ele **é** o dono do lote, derivado no servidor (RC-D37, 2026-07-28; revoga a D48). O campo aparece travado — e desde a **RC-D88** o do lote também: **um lote com contrato não troca mais de dono** (409 `SAMPLE_OWNER_LOCKED_BY_CONTRACT`), porque a troca chegaria ao contrato em silêncio, na próxima vez que ele fosse salvo. Trocar de vendedor num contrato emitido deixou de ter caminho. **Cascata contrato à vista → lote/venda (D146),** do que sobrou dela: **comprador / sacas / data** → a venda (`SampleMovement`; mexer nas sacas recalcula o saldo do lote; P20/D52/D66). **Banco do vendedor, filial e armazéns são seleção** — congelam no snapshot e **não** escrevem de volta no cadastro (por design); preço/corretagem/corretores só vivem no contrato. Esses syncs rodam **antes** da transação do contrato — passo **não-atômico por decisão** (D143): a janela de corrida é minúscula e, num 409 de concorrência, os syncs são idempotentes e **convergem no retry**.

### 4.2 Modelo financeiro (ágio + corretagem)

- **Total = `(unitPrice ± ágio) × sacks`.** O **ágio/deságio** é armazenado em **R$ por saca** e entra no **preço da saca** — o preço efetivo (`effectiveUnitPrice`) é o que multiplica as sacas (`computeContractMoneyWithAgio`). _(Não é "`unitPrice × sacks ± ágio`": o ágio não é uma parcela única do total, ele incide por saca.)_ Os botões de **Ágio/Deságio** ficam no **modal de Detalhes** do contrato (D121).
- **Corretagem por lado = `Total × %`** (compra e venda têm percentuais próprios; `SaleContractBroker`), arredondada a 2 casas em **half-up** (`round2` — RC-D108 corrigiu o meio-centavo, que caía para baixo).

### 4.3 PDF e Detalhes

- **PDF** gerado com `pdf-lib` a partir de um layout fixo (D111) e do `issuer-config` (dados da emitente).
- **Modal de Detalhes** (`SaleContractDetailsModal`): **quatro abas** (§4.4) — o documento, a aprovação, o espelho e a timeline (`/sale-contracts/[id]/timeline`) —, mais as ações que não cabem no card. A matriz card × modal é fixada por D121/D126 e revista pela **RC-D25/RC-D62/RC-D123**.

**Onde cada ação mora hoje:**

| Ação                  | Onde                              | Condição                                          |
| --------------------- | --------------------------------- | ------------------------------------------------- |
| **Finalizar**         | ⋯ do card · modal de Detalhes     | `status === 'EMITIDO'` + `canManage` (**RC-D63**) |
| **Reabrir**           | ⋯ do card · modal de Detalhes     | `status === 'FINALIZADO'` + `canManage`           |
| **Abrir os Detalhes** | o card INTEIRO (RC-D120)          | sempre — sem seta, sem item de menu               |
| Editar                | Detalhes › aba **Detalhes**       | acima do PDF, à direita; `EMITIDO` + `canManage`  |
| Baixar · Exportar     | Detalhes › aba **Detalhes**       | ao lado do Editar — são sobre o DOCUMENTO         |
| Ágio / Deságio        | Detalhes › rodapé da aba Detalhes | RC-D123                                           |
| Washout               | Detalhes › rodapé da aba Detalhes | pede motivo (`SaleContractLifecycleDialog`)       |
| "Solicitar aprovação" | Detalhes › aba **Aprovação**      | latch de mão única, só `EMITIDO` (AP32 — §7)      |
| **"Gerar etiqueta"**  | Detalhes › aba **Aprovação**      | `canManage` + status ≠ `WASH_OUT`                 |
| "Gerar espelho"       | Detalhes › aba **Espelho**        | um botão por LADO com corretagem (RC-D124 — §5)   |

**RC-D121/D123 (2026-07-30): o Detalhes tem 4 abas e o rodapé é DA ABA.** Só `Detalhes` tem ações — as
outras três não mudam a situação do contrato, e um rodapé igual nas quatro diria o contrário. As três
ações que abrem outra superfície (Editar, Ágio/Deságio, Washout) **fecham** o detalhe e só então abrem
o fluxo (o swap fica pendente até o `?details=` sair da URL). A aba **não** entra na URL (RC-D129): o
detalhe abre sempre em `Detalhes`.

Finalizar e Reabrir **não pedem confirmação** — são reversíveis, e confirmar um toque reversível é ruído; o Washout continua pedindo motivo, porque continua definitivo (`SaleContractLifecycleDialog`, hoje **só washout**). Desde a RC-D125/D127 a **única** superfície que ainda abre por cima do detalhe é a confirmação do "Solicitar aprovação" — e enquanto ela está de pé o overlay não fecha por ESC/backdrop (`dismissGuardRef`).

### 4.4 As quatro abas (RC-D121)

| aba           | o que responde                | o que tem dentro                                                                                                           |
| ------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Detalhes**  | como está o contrato no papel | a **faixa** + o PDF. As 8 seções de texto saíram: o PDF já as imprime                                                      |
| **Aprovação** | falta mandar aprovar?         | o latch, ou os campos da etiqueta **inline** + "Gerar etiqueta" (§7). Fora de `EMITIDO`, a frase de que a etiqueta não sai |
| **Espelho**   | a corretagem já foi cobrada?  | **um bloco por lado** com corretagem — PDF entregue, ou os campos a conferir (§5)                                          |
| **Histórico** | o que já aconteceu            | a timeline; e é o **único** lugar com o motivo do washout e os espelhos substituídos                                       |

**O documento é rasterizado, não um `<iframe>` (RC-D130).** As páginas vêm em `<img>` pelo `pdfjs-dist`, no `ContractDocumentView` — o mesmo componente da conferência da emissão. Com `<iframe>`, o navegador embrulhava o PDF no visualizador dele (barra escura com zoom/girar/imprimir, painel de miniaturas, fundo cinza em volta da folha), que não se tematiza e no iOS muitas vezes não renderiza. O zoom que aquela barra dava é o **"Ampliar"**; baixar e imprimir já eram botões da tela.

🔴 **A faixa da aba Detalhes (RC-D122) existe por um motivo medido:** o PDF do contrato **não imprime**
ágio/deságio, valor total, corretagem em R$ nem os corretores, e o `Vlr. Saca` dele é o preço **cru**
(`sale-contract-pdf-service.js:673-687`). Sem a faixa, aplicar um **Ágio** — botão que vive nessa aba —
não mudaria nada na tela. O critério do que entra nela é esse e só esse: **o que o papel não diz.** O
`Preço efetivo` aparece só quando há ágio/deságio; sem ele seria repetição do impresso.

**Custo de rede:** `getSaleContract` + `getSaleContractTimeline` ao abrir (o Espelho e o Histórico
comem os dois). O que é caro é **lazy por aba** — o PDF do contrato com a aba padrão, o prefill da
etiqueta e os PDFs do espelho só na primeira ativação —, e a aba fica **montada** depois disso, senão
voltar ao Espelho refaria cada download.

---

## 5. Espelho de Corretagem

> Segundo documento gerado a partir do contrato. Código: `ContractEspelhoTab` (a **aba** do Detalhes — RC-D125 apagou o `EspelhoCorretagemModal` e o `EspelhoConferenciaModal`), `lib/espelho.ts`; `SaleContractEspelhoLog`.

- **O que é:** o espelho da corretagem — mapeia campos do contrato para um PDF de 9 colunas (origem de cada campo documentada no código). A coluna da comissão imprime o **percentual no cabeçalho** ("Comissão (2,00%)") quando ele é > 0 (RC-D109).
- **Elegibilidade (`assertEspelhoEligible`, fonte única que gateia o PDF _e_ o log):** `side` válido (`ESPELHO_INVALID_SIDE`); status ∈ `EMITIDO/FINALIZADO/WASH_OUT`, ou seja **qualquer contrato** (`ESPELHO_NOT_ELIGIBLE`; a lista reusa `SALE_CONTRACT_STATUSES` — D147); **com corretagem no lado pedido** (`ESPELHO_NO_BROKERAGE`); e **com parte cadastrada nesse lado** (`ESPELHO_NO_PARTY`, RC-D110 — com comissão > 0 e o snapshot da parte vazio o papel saía com o total real e `CLIENTE: —`, uma cobrança sem destinatário). O front espelha os quatro gates, na mesma ordem, em `espelhoSideEligibility` (`lib/espelho.ts`), com teste de paridade. **Exceção (RC-D91, revoga a D145):** o cancelado que respondeu **"não cobrar"** — ou que não respondeu — não emite espelho (`ESPELHO_WASHOUT_NOT_BILLABLE`, predicado `isWashoutNotBillable`). Quem respondeu "cobrar" emite, **inclusive à vista**: o Espelho é o documento com que se cobra, e negá-lo deixaria a cobrança sem papel.
- **Como gerar (RC-D124/D125):** na **aba Espelho** do Detalhes — e só ali (**RC-D42** revogou a D76: o leque "+" da lista deixou de oferecê-lo, e com ele saiu o modo de seleção da página). A aba tem **um bloco por lado com corretagem**, rotulado `Vendedor`/`Comprador`; o bloco vazio É a antiga **Conferência (D134)**: os campos que vão sair impressos, _read-only_ (o "Preço" vem de `effectiveUnitPrice` da view, mesma fonte do PDF; a data é formatada em `America/Sao_Paulo`, o fuso que o PDF imprime) + `[Gerar espelho]`. Confirmar troca os campos pela **prévia** no mesmo bloco. **O toggle de lado morreu**: o bloco já diz de quem é. O **"Ver detalhes"** também — corrigir virou trocar de aba, e com ele saiu o vai-e-volta que o painel mantinha (`espelhoReturnRef`). Quando o **lado** não sai, o bloco escreve o motivo e desabilita o botão; contrato sem corretagem nenhuma mostra a frase no lugar dos blocos. O aviso de **dono do lote mudou** (RC-D110) continua no bloco do vendedor: avisa, não bloqueia.
- **Auditoria + o documento guardado (D124/D127 + RC-D103/D104/D107):** o `SaleContractEspelhoLog` (contrato + lado + ator) é gravado no **Exportar/Baixar**, **só na entrega concluída** (a prévia `?preview=1` não audita; cancelar o share não audita) — e a linha passou a guardar o **`snapshot`**: o documento congelado, tudo o que o papel imprimiu do contrato. **O renderizador lê SEMPRE de um snapshot** (`buildEspelhoSnapshot`), então gerar do contrato fresco e reabrir um guardado são **o mesmo caminho**; a data do papel é o `created_at` da própria linha. O guardado é **imutável** (RC-D104): corrigir é consertar o contrato e **gerar de novo** — o anterior fica no histórico marcado "substituído" (derivado da ordem, nunca gravado). O registro da entrega é **aguardado** (RC-D107), com `expectedVersion` opcional: contrato que mudou entre a prévia e a entrega responde **409 `SALE_CONTRACT_VERSION_CONFLICT`**; a falha aparece na tela, porque o papel já saiu. O endpoint de log **valida a elegibilidade** (não grava export impossível). _O emissor (nome/CNPJ/banco da corretora) **não** entra no snapshot: é dado da corretora, e um reenvio deve levar a conta atual._
- **Onde ver depois (RC-D106, reescrito pela RC-D124/D128):** a **aba Espelho** mostra o mais recente de **cada lado** — `latestEspelhoBySide` (`lib/espelho.ts`), três filtros sobre os itens `ESPELHO` da timeline: `available` (o snapshot existe e a retenção não venceu), `superseded` (há um mais novo do mesmo lado) e `logId`/`side` (marcos legados não têm como ser relidos). Reabrir e baixar **não** cria linha nova: é o mesmo documento. Os **substituídos** e os que a aba não lista continuam alcançáveis pelo **Histórico**, onde a linha "Espelho exportado — Vendedor" virou botão e abre o PDF ali mesmo. 🪦 A **prateleira** (a seção "Espelhos de corretagem", 11 regras de CSS) foi apagada: com a aba mostrando um por lado e o histórico abrindo o resto, ela era uma terceira lista das mesmas linhas.
- **Retenção (RC-D105):** o snapshot fica **15 dias depois do FIM do contrato**, e o fim é **derivado, nunca persistido** — `FINALIZADO` pela linha mais recente do `SaleContractStatusLog`, `WASH_OUT` por `washoutAt` (fallback no log, linhas legadas), `EMITIDO` por **nada**: contrato vivo não tem relógio, e **reabrir PARA** a contagem. Não há `finalizedAt` e isso é de propósito (RC-D63). O filtro vale em **todas** as leituras — na timeline **e** na rota do PDF, que responde **410 `ESPELHO_EXPIRED`** (retenção só na lista seria cosmética: a URL direta continuaria entregando). A limpeza é **oportunista** (fire-and-forget na leitura da timeline, throttle de 1h por instância; não há cron no projeto) e **anula a coluna** — a linha de auditoria **não** expira, o documento sim. Contrato `FINALIZADO` sem linha no status log **falha aberto**: guardar demais é melhor que apagar o que não se consegue datar.

---

## 6. `/financeiro` — a carteira (ADMIN-only)

> A corretagem a receber por fechamento, **em leitura pura** (RC-D67). Código: `app/financeiro/page.tsx`, `FinanceiroPanel`/`FinanceiroCard`; `app/api/v1/financeiro`, `sale-contract-service.js`. Acesso: `FINANCEIRO_ROLES` **= `['ADMIN']`** (RC-D3, 2026-07-27 — era `NON_PROSPECTOR_ROLES`; escopo aberto dentro do ADMIN).

- **Estado de recebimento** por contrato (a vencer / vencido / **recebida** / **cancelado**), com os cálculos de corretagem e ágio de §4.2. **"Recebida" = contrato `FINALIZADO`** (RC-D67; era `PAGO`) — a corretagem sai da fila quando o contrato acaba. Sem `paymentDate` ("À definir" no FUTURO, D144) o contrato é **sempre "a vencer"** (nunca vencido), no fim da fila, e o card exibe **"À definir"**.
- **O washout cobra conforme a RESPOSTA (RC-D89, revoga a D145):** um washout aparece aqui (estado "cancelado") e conta no total **quando respondeu "cobrar"** — o tipo do contrato não pesa mais. Quem respondeu "não cobrar", e quem foi cancelado antes da coluna `washout_billable` existir sem ser backfillado, **não aparece**: some da lista, de todos os filtros (inclusive "Cancelado") e do total (filtrado no `where` por `washoutBillable: true`, nunca chega ao card). Segue visível só em `/contratos`, com o status Wash-out.
- **Escopo:** **só o ADMIN** abre a página (RC-D3); dentro dela, vê **tudo** (escopo aberto — D140 revogou o own-only, superando D135/D128). Os outros 4 papéis não-PROSPECTOR: sem item de nav, e `/financeiro` na barra de endereço cai no `/dashboard` pelo guard; o service devolve 403.
- **Sem rateio ÷N** (D136): o valor exibido é o do fechamento, não dividido.
- **Nenhuma ação** (RC-D67, revoga D137/RC-D6/RC-D22): o botão "Pago" morreu **nas duas casas**. O que tira a corretagem da fila é o **Finalizar**, em `/contratos`, aberto a todo não-PROSPECTOR — o efeito que a RC-D6 queria, por outro caminho. Sem botão, o painel também não precisa mais de toast nem de refetch. **A única saída é abrir o contrato** — e quem faz isso é a **linha inteira** (desktop) ou o **card inteiro** (mobile), que navegam para `/contratos?details=<id>`; não há coluna ⋯ (RC-D95).
- **Ordenação/paginação:** keyset/cursor particionado (por estado de recebimento; vencidos primeiro).
- **Os quatro estados são a KPI row, e a KPI row é o filtro** (RC-D93): cada cartão traz a **corretagem somada** e a **contagem** do seu estado, e clicar nele filtra a lista (clicar de novo desliga). Os quatro números vêm do servidor (`kpis` na resposta), sempre no escopo da **busca** e **independentes do filtro ativo e do cursor** — ligar um cartão não mexe nos outros três. Eles **substituíram** a faixa "Corretagem total" (o total é a soma dos quatro: a partição é exata, então ele saiu da resposta em vez de virar uma segunda fonte da verdade), a faixa "N vencidos · R$ X" (virou o cartão "Vencido") e os cinco chips de filtro. No servidor, os `where` dos quatro estados e os dos grupos de paginação são **a mesma constante** — cartão e filtro não podem discordar sobre o que é "vencido".
- **Visual (RC-D92..D95, 2ª rodada da RC-F6):** kit FV. **Desktop = tabela** de 6 colunas (Contrato · Comprador · Valor total · Corretagem · Vencimento · Estado), com o split vendedor · comprador da corretagem na **sublinha** — o acordeão do card morreu, nos dois breakpoints. **Mobile** = os mesmos dados em card, com os **4 cartões de KPI em 2×2** (exceção deliberada ao KPI-2 do kit: aqui o cartão é a única porta do estado). Chip de estado = `.fv-chip` do kit; escopo CSS `.fv-fin-page`.

---

## 7. Aprovação (o aviso)

> Código: `ApprovalLabelForm` (o conteúdo da **aba Aprovação** do `SaleContractDetailsModal` — RC-D127 apagou o `ApprovalLabelModal`); `setSaleContractApprovalFlag`, `sendApprovalLabel`, `getApprovalLabelPrefill`; tabelas `approval_label_log` + `CustomPrintJob`.
>
> ⚠️ **A aprovação deixou de ser portão** (RC-D66, 2026-07-28). Ela **não bloqueia nada** — o AP18 foi revogado junto com o faturar que ele travava. E a **sub-aba Aprovações não existe** desde a RC-F4; o endpoint `listApprovalContracts` (`/sale-contracts/approvals`) segue vivo e testado, mas **sem consumidor de UI** — a RC-F3 decide o destino dele.

**O modelo (o aviso):** aprovação não é um estado no contrato — é um **lembrete que se resolve sozinho**. O criador **sinaliza** se o contrato precisa de aval (`requiresApproval`); enquanto não sai etiqueta, o contrato aparece com "Aprovação a enviar" no card da lista (§3/§4.0) e no card de Avisos do dashboard; quando alguém **gera/envia a etiqueta** (impressa, auditada em `approval_label_log`), o aviso **some por si**. Ninguém marca nada, e nada trava. É o molde que a §6 do plano generalizou para o contrato inteiro. O log audita o **envio** (enqueue no `CustomPrintJob` + linha no log), **não o sucesso da impressão** — exigir impressão concluída deixaria o app refém do print agent local.

- **Estados derivados** (sem enum próprio): **não se aplica** / **a enviar** / **enviada** / **cancelado** (no washout que respondeu **"cobrar"** — AP33 alinha a worklist ao Financeiro; o predicado virou `washout_billable IS TRUE` na RC-D89). O **desfecho** (aprovado/recusado) fica **fora do sistema**; o **proxy** é o **nº de envios** ("enviada · N×").
- **Sinalização (latch de mão única, AP32):** `requiresApproval` é marcado na **emissão** (form etapa 2) ou, depois, pelo botão **"Solicitar aprovação"** no modal de Detalhes (`setSaleContractApprovalFlag`, gated por `SALE_CONTRACT_ACCESS_ROLES` = todo não-PROSPECTOR), com confirmação (é definitivo). É **mão única**: uma vez "Sim", **nunca** volta a "Não" (`APPROVAL_FLAG_LOCKED`, mesmo antes do 1º envio — endurece a AP20); o **"Editar" não toca** o sinal (preserva o do banco). ⚠️ **O latch é o que sustenta o aviso** agora que não há portão: sem ele, um Editar zeraria o sinal e o lembrete sumiria sem que a aprovação tivesse sido enviada. Só muda enquanto `EMITIDO` (finalizado/washout congelam — `APPROVAL_FLAG_NOT_EDITABLE`).
- **Gerar etiqueta exige `requiresApproval = true`** (`APPROVAL_CONTRACT_NOT_MARKED`, AP17); elegibilidade = **só `EMITIDO`** (`APPROVAL_ELIGIBLE_STATUSES`, AP21) — o backend é quem enforça, e a UI não antecipa a regra. **A geração mora no detalhe do contrato** (**RC-D25 revogou a AP29**, que a punha na sub-aba morta) e, desde a **RC-D126/D127**, ela **é** a aba Aprovação: os campos ficam à vista (`ApprovalLabelForm`), sem modal, e o único botão — "Gerar etiqueta" — grava e imprime. O prefill (`/approval-labels/contracts/[id]/prefill`) é buscado na **ativação da aba** e só quando `requiresApproval` (o endpoint responde 409 quando não). O sucesso é um **toast**: numa aba não há sheet a descer nem tela a auto-fechar, então o check central do antigo modal morreu — e com ele o último consumidor do bloco `.sample-created-*`. Sem aprovação pedida a aba mostra o latch "Solicitar aprovação" (AP32); em `WASH_OUT`, a frase de que a etiqueta não sai mais. Continua **sem** porta no `/samples` e **sem** etiqueta avulsa.
- **A etiqueta EDITA de volta — dois campos, com cascata (RC-D96..D102, 2026-07-29):** ela deixou de ser write-only. Dos seis campos, só **"Nº compra"** e **"Lotes de origem"** são editáveis; os outros quatro (fechamento, produtor, armazém, sacas) exibem **valor**, não input, com uma nota dizendo que vêm do contrato. Os dois editáveis **gravam antes de imprimir**:
  - **Nº compra → contrato**, por `setSaleContractPurchaseNumber` (`POST /sale-contracts/:id/purchase-number`): `updateMany` de uma coluna + `expectedVersion`, idempotente, congelado fora de `EMITIDO`. **Não** passa pelo "Editar" — este re-snapshotaria partes/banco/armazém e deixaria uma linha "EDIÇÃO" na timeline.
  - **Lotes de origem → cadastro do lote**, por `updateRegistration` (o mesmo caminho do detalhe do lote, com o `OriginLotChips`). **Travado** em quatro casos, com o motivo escrito no campo: **liga** (editar fixaria a derivação dela para sempre — `blendOriginLotPinned`), **componente de liga** (propagaria para as ancestrais, e o serviço exige confirmação explícita), **contrato Futuro** (não há lote) e **status fora** de `REGISTRATION_CONFIRMED`/`CLASSIFIED`.
  - 🔴 **O campo edita o texto CRU (`originLotText`), nunca os chips do papel.** O `splitOriginLotForLabel` reparte por espaço/vírgula/`;` (**preserva hífen**, ex.: `PA-01`), corta cada código em 16 chars e exibe no **máximo 8 (7 + "+")** — o `+` é sentinela de desenho. Salvar de volta a partir dele apagaria os lotes que ele representa. Desde a RC-D100 esse recorte também roda **no envio** (`normalizeCustomLabelLines` chama a mesma função), o que fechou a **AP-P3** — os dois lot-splitters viraram um.
  - **Lote vazio some do papel** (RC-D96): antes o rótulo "LOTES" saía órfão sobre a área em branco.
  - Layout **em 2 colunas** (logo + Nº Fechamento + Nº Compra à esquerda; Produtor + Armazém + Sacas + Lotes à direita) no `print-agent/label.js` (`buildCustomLabelLayout`, com auto-ajuste de fonte). Ver `Liga-Plano` (log 2026-07-20) para a origem derivada/pinável da liga.
- **Worklist (sem UI):** `listApprovalContracts` continua particionando por estado (a enviar / enviada) via `$queryRaw` (G0/G1/G2) com cursor `{g, key, seq}` — o estado depende de um agregado de contagem do log — e ordenando por `invoice_date ASC NULLS LAST`. O endpoint está de pé e testado; **nada na UI o chama** desde a RC-F4. 🔴 É o **maior bloco de código sem chamador** do domínio — ~165 linhas de serviço + os 3 helpers de cursor (`normalizeApprovalWlFilter`/`encode`/`decodeApprovalWlCursor`) + a rota + o handler + `ApprovalReceivable`/`ApprovalListResponse` + `listApprovals` no `api-client` + **6 testes de integração**. A varredura de 2026-07-30 confirmou que nada o alcança e deixou a decisão de apagar **em aberto**, porque a RC-F3 pode querer o recorte de volta.

> **Onde ficou o "quais contratos precisam de etiqueta hoje?".** Em **três** lugares, todos derivados: a **frase do card** de `/contratos` (RC-D68/D114 — e ela puxa esses contratos para o topo da lista, RC-D117), o **card de "Avisos"** do dashboard (aviso binário "aprovação a enviar", que aparece quando `invoice_date ≤ hoje + lead` — ou a data é "À definir" — e **some quando a etiqueta é gerada**; ver `Dashboard-Visao-Geral.md` §7.4) e o filtro por situação da lista. O **lembrete de aprovação no calendário** foi removido no DSB-D9 (data imprecisa) e o card **"Aprovações enviadas"** morreu na RC-D26 (componente, rota e CSS apagados). Desde a RC-D23 cada item de Avisos abre **o próprio contrato** (`/contratos?details=<id>&highlight=<id>`), onde se gera a etiqueta. O campo `approvalReminderLeadDays` é obrigatório no form quando `requiresApproval` (1–365, default 30), gravado na criação e editável no Editar quando "Sim"; o botão "Solicitar aprovação" (AP32) latcha com o default 30.

---

## 8. Embarque — ⚠️ NÃO EXISTE MAIS

> **Apagado inteiro pela RC-D65** (2026-07-28, migration `20260728120000`). Registrar embarque era **escrituração pura**: ninguém precisava do registro para fazer o próprio trabalho, então não ia ser feito — e um registro que às vezes falta é pior que nenhum, porque o portão travava o pagamento em cima dele. O raciocínio completo está no `Contratos-Plano-de-Trabalho.md` **§6.1**; o ledger EMB1–EMB34 ficou no apêndice **A.4** de lá, marcado como revogado.

Saíram do código, sem substituto: a **confirmação** (`ShipmentConfirmationModal`, `SaleContractShipmentService`) · as **fotos** (`SaleContractShipmentPhoto`, upload, galeria, lightbox, retenção de 15 dias) · **transporte e responsável** (EMB30/EMB31, enum `ShipmentCarrier`) · o flag **`requiresShipment`** (no contrato **e** em `ContractModality`) e a coluna `shippedAt` · o **portão EMB28** · a **worklist** `/sale-contracts/shipments` · as 5 rotas de embarque · os **3 eventos** de calendário (`contract_shipment*`) e o feed `/dashboard/shipment-events` · o CSS `.emb-*`.

O físico continua rastreado pelos **lotes e amostras** — que é onde ele sempre esteve de verdade (D147).

---

## 9. Modelo de dados

> Schema em `prisma/schema.prisma`. O event store (`SampleEvent`) é append-only; os logs de contrato abaixo são de auditoria.

- **`SaleContract`** — o contrato: identificação, vínculos, **snapshots** das partes (comprador/vendedor), negócio-financeiro (preço, sacas, ágio), datas planejadas (`invoiceDate`/`paymentDate` — campos **do documento**, que hoje alimentam a agenda), flag `requiresApproval`, textos, `status`, `version`. **Invariante `type ⟺ vínculo de lote`** (D147, CHECK `chk_sale_contract_type_lote`): à vista tem `sampleId`+`movementId` (1:1 com a venda); futuro tem os dois **nulos** e nunca ganha lote. O washout **ramifica** por `type` (`isFutureContract`) — Futuro grava direto, à vista cancela a venda por baixo. Já a **cobrança** do cancelado não olha mais o `type`: vem de `washoutBillable` (RC-D89). _(A RC-D65 removeu `invoicedAt`, `paidAt`, `shippedAt`, `requiresShipment`, `shipmentCarrier` e os dois campos de responsável.)_
- **`SaleContractBroker`** (corretagem por lado) · **`SaleContractExport`** (dados de exportação).
- **Lookups:** `ContractModality` · `PaymentForm` · `Packaging`. _(O `requiresShipment` da modalidade saiu na RC-D65 — tinha um único leitor, o snapshot do emit.)_
- **Cadastro que o contrato exige (Fase 0):** `ClientBankAccount` (banco em **texto livre** `bankName` — entidade `Bank` e COMPE removidos na D141; snapshots de contratos emitidos preservam o código congelado) · `ClientAttachment` (anexos, JPEG/PNG/WebP+PDF) · `Broker` · `birthDate` no cliente.
- **Logs/filas:** `SaleContractStatusLog` (marcos de situação — **é ele quem responde "quem finalizou e quando"**, inclusive nas reaberturas; por isso a RC-D63 não precisou de coluna nova) · `SaleContractAgioLog` (cada aplicação de ágio/deságio) · `SaleContractEspelhoLog` (espelho **+ o documento guardado** — a coluna `snapshot`, nulável porque a nulabilidade **é** a retenção da RC-D105) · `approval_label_log`/`ApprovalLabelLog` (envios de aprovação) · `CustomPrintJob` (fila da etiqueta de aprovação). _(`SaleContractShipmentPhoto` foi apagada na RC-D65.)_
- **Enums:** status (`EMITIDO`/`FINALIZADO`/`WASH_OUT`) e os demais do domínio. _(`ShipmentCarrier` apagado.)_

_(O `Arquitetura-Tecnica.md` resume o domínio na seção "Modelo de dados" → "Domínio de contratos"; o detalhe funcional é este doc.)_

---

## 10. Rotas de API

> `GET`/`POST` sob `app/api/v1/`; handlers em `src/api/v1/backend-api.js`, implementação em `src/sale-contracts/sale-contract-service.js`. PROSPECTOR barrado pelo allowlist central.

- **Lista de contratos** (`GET /sale-contracts`) — **RC-D117/D118.** Ordem por **urgência** em 4 grupos de estado (atraso → aberto → finalizado → cancelado), paginada por cursor **opaco** (`{g, pd, seq}` em base64url — os mesmos helpers do `/financeiro`, generalizados). Filtros: `search`, `type`, `buyerClientId`, `sellerClientId`, `periodBase/From/To` e **`state`** (csv ou lista de `atraso|aberto|finalizado|cancelado`; valor inválido → 422 no campo `state`). 🔴 **`status` não é aceito aqui:** o eixo da situação é o ESTADO derivado (4), não o enum do banco (3) — é o que faz a KPI row e o painel de filtros escolherem a mesma coisa. A resposta traz `items` + `nextCursor` + `total` (do filtro inteiro) + **`counts`** (os 4 estados; independentes da `state` ativa, porque são o filtro).
- **Contrato (CRUD/ciclo):** `/sale-contracts` (criação), `/sale-contracts/next-number` (preview do número), `/sale-contracts/[id]` (detalhe) e `/sale-contracts/[id]/{emit, finalize, reopen, washout, apply-agio, approval-flag, purchase-number, timeline}` — as mutações de §3. A `purchase-number` (RC-D99) é a cascata da etiqueta: escrita **estreita**, sem re-snapshot da etapa 2 e sem linha "EDIÇÃO" na timeline. `finalize` e `reopen` (RC-D62) pedem só `expectedVersion`: **sem corpo de data**. No create/emit, `invoiceDate`/`paymentDate` aceitam `null` explícito ("À definir") **só quando o contrato é FUTURO** (D144; à vista → 422). _(`invoice` e `pay` foram **apagadas** na RC-D62.)_
- **Documentos:** `/sale-contracts/[id]/pdf` (contrato) e `/sale-contracts/[id]/espelho/{pdf, log}` (espelho + auditoria de export).
- **Aprovação:** `/sale-contracts/approvals` (worklist — **sem consumidor de UI** desde a RC-F4) e `/approval-labels` (gerar/enviar etiqueta; o sub-route `/approval-labels/contracts/[id]/prefill` monta a etiqueta a partir do contrato). _(O picker `/approval-labels/contracts` foi removido na AP32; a rota `/sale-contracts/approvals/recent-sends` foi **apagada** na RC-D26, com o card que a consumia.)_
- **Lookups:** `/contract-lookups` (modalidade/forma de pagamento/embalagem). Criar valores das listas de apoio é gated por `CONTRACT_LOOKUP_MANAGE_ROLES` (= `NON_PROSPECTOR_ROLES` desde 2026-07-15 — antes ADMIN-only).
- **Financeiro:** `/financeiro` (lista de todos os fechamentos). **Leitura pura** — não há rota de mutação associada (RC-D67). A resposta traz `items` + `nextCursor` + **`kpis`** (os quatro estados, cada um com `count` e `value`; RC-D93 — substituíram `totalCommission`/`overdueCount`/`overdueCommission`).
- **Anexos do cliente (Fase 0):** rotas de `ClientAttachment` (D27/D139).
- **Eventos no dashboard** (leitura): `/dashboard/{payment,invoice}-events` — detalhados no `Dashboard-Visao-Geral.md` §8. _(`/dashboard/shipment-events` e as 5 rotas de embarque foram **apagadas** na RC-D65.)_

---

## 11. Fronteiras — o que vive fora deste doc

- **Dashboard** (`Dashboard-Visao-Geral.md`): o card de **Eventos** e o card de **Avisos** (os 2 cards do dashboard). Desde a **RC-D23**, **todo** chip do calendário e **todo** item de Avisos deep-linka `/contratos?details=<id>&highlight=<id>` — não há mais mapa aba→rota (`contractsHubTabs`/`contractTabRoute` foram apagados) nem chip inerte por papel (a DSB-D11 perdeu o objeto). Sobraram **2 feeds** (`payment/invoice-events`, §8 de lá), carregando **só contrato `EMITIDO`** — finalizado e cancelado não têm o que lembrar; e só o de **pagamento** tem atraso (RC-D64). O de pagamento é gateado por `PAYMENT_FEED_ROLES`, não pelo `FINANCEIRO_ROLES` (RC-D5). Qualquer mudança de rota ou no enum de status **obriga a atualizar lá**.
- **Navegação por papel** (`Auditoria-Navegacao-por-Papel.md`): o mapa read-only de quem acessa o hub — **aponta para este doc** como dono da matriz de acesso.
- **API** (`API-e-Contratos.md`): a referência canônica de rotas/contratos de request-response de **amostras, clientes, usuários e informes** — as rotas de contrato vivem em **§10 deste doc** (lista única, sem duplicação fadada a derivar).
- **Cadastro de cliente** (`Clientes-e-Movimentacoes-Especificacao.md`): contas bancárias/anexos que o contrato consome.

---

## 12. Mapa de arquivos

**Frontend**

- `app/contratos/page.tsx` — **página única** (guard `CONTRATOS_ROLES`, sem abas; `?tab=financeiro` → `router.replace('/financeiro')`)
- `app/financeiro/page.tsx` — **página própria** (guard `FINANCEIRO_ROLES` = ADMIN, `FinanceiroPanel` direto)
- `app/embarques/page.tsx` — `redirect('/contratos')` server-side
- `components/contracts/*` — `ContratosPanel` + `SaleContractCard` (**a lista dos dois breakpoints** desde a RC-D112); `components/financeiro/*` — `FinanceiroPanel`, `FinanceiroCard`. _(Apagados na RC-F4: `AprovacoesPanel`, `EmbarquePanel`, `AprovacaoCard`, `EmbarqueCard`; na RC-D26: `RecentSendsCard`; na RC-D116: `ContractPhaseLine`.)_
- Superfícies: `SaleContractEtapa2Modal` (criar/editar), `SaleContractDetailsModal` (o detalhe de **4 abas**, RC-D121), `SaleContractAgioDialog`, `SaleContractLifecycleDialog` (**só washout** desde a RC-D62). Conteúdo de aba, não superfície: `ContractEspelhoTab` + `StoredEspelhoFrame`, `ApprovalLabelForm`. _(Apagados: `ShipmentConfirmationModal` na RC-D65; `EspelhoCorretagemModal`, `EspelhoConferenciaModal` e `ApprovalLabelModal` na RC-D125/D127 — ~990 linhas de modal que viraram seções.)_
- `components/AppShell.tsx` — os 2 itens de nav (Contratos + Financeiro) na sidenav desktop, sem sub-itens, e **Contratos na tabbar mobile** (`MOBILE_NAV_ITEMS`) / `components/HeaderAvatarMenu.tsx` — só Financeiro (Contratos saiu do menu quando virou aba)
- `lib/roles.ts` — `NON_PROSPECTOR_ROLES`, `CONTRATOS_ROLES`, `FINANCEIRO_ROLES` (= ADMIN), `PAYMENT_FEED_ROLES`
- `lib/contract-timeline.ts` — as duas funções puras da barra de tempo do card: `contractTimeProgress` (fração + tom) e `contractCountdownLabel` (a frase em dias) — RC-D114
- `lib/currency.ts`, `lib/types.ts`

**Backend**

- `src/sale-contracts/sale-contract-service.js` — emit/finalize/reopen/washout + Financeiro + worklist de aprovação + feeds de evento + a agenda da lista/detalhe (`_withAgenda`/`_agendaFor`) + a página e as contagens da lista (`_contractPage`/`_contractStateCounts`)
- `src/sale-contracts/sale-contract-support.js` — normalizações, selects, builders de evento, **`deriveContractAgenda`** (§3) e os 4 estados da lista (`contractStateWhere`/`contractListGroups`, RC-D117 — lidos também pelo `/financeiro`)
- `src/sale-contracts/sale-contract-pdf-service.js` + `issuer-config.js` — PDF do contrato/espelho
- `prisma/schema.prisma` — modelos e enums de §9

---

## 13. Estado de validação

Tudo o que este documento descreve está **implementado ponta a ponta**, com gates verdes (lint/format/typecheck/schemas/unit/contracts/integração/build): a **RC-F1 + RC-F4** (`/contratos` página única + `/financeiro` ADMIN-only + `/embarques` extinta), a **RC-F5** (a criação repensada, §4.1), a **RC-D62..D68** (as três situações + a agenda + a morte do embarque), a **RC-D69..D73** (o lote como campo), a **RC-D84..D91** (finalizar/reabrir + o washout que pergunta), a **RC-D92..D95** (o Financeiro no kit FV, §6), a **RC-D96..D102** (a etiqueta que edita de volta, §7), a **RC-D103..D111** (o espelho guardado, §5), a **RC-D112..D120** (a lista em card, §4.0) e a **RC-D121..D129** (as quatro abas, §4.4).

⚠️ **Nada disso foi pushado, e nada foi conferido no device.** Está tudo em `main` local. Este documento descreve o comportamento **do código**; divergências observadas no aparelho viram achados no `Contratos-Plano-de-Trabalho.md`.

🔴 **A migration `20260728120000` é destrutiva.** Antes de aplicá-la em **produção**, conferir no banco que `sale_contract` não tem linha alguma com `status IN ('FATURADO','PAGO')` nem `shipped_at` não-nulo. A afirmação de que este domínio nunca foi deployado é de doc; apagar coluna merece a checagem no banco.
