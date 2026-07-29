# Contratos — Visão Geral

Status: Ativo (documento-mãe / verdade viva do funcionamento atual)
Escopo: o que as páginas `/contratos` e `/financeiro` fazem hoje — a casca (rotas + acesso por papel), o contrato de compra e venda ("Fechamento" → PDF), o Espelho de Corretagem, a carteira do **Financeiro**, a **aprovação**, as **três situações** do contrato e a **agenda** derivada delas, o modelo de dados e as rotas de API.
Última revisão: 2026-07-29 (**RC-D69..D72** — a seleção de lote vira **campo obrigatório** da Identificação e a criação à vista cai para **dois passos**. Anterior: 2026-07-28, **RC-D62..D68** — o contrato deixa de ser máquina de status e vira **agenda**: três situações, "Finalizar" reversível, o **embarque morre inteiro**, a aprovação não trava nada e o `/financeiro` vira leitura; no mesmo dia, a lista no kit FV. Anterior: 2026-07-27, RC-F1 + RC-F4)
Documentos relacionados: `Contratos-Plano-de-Trabalho.md` (backlog, decisões e pendências), `Dashboard-Visao-Geral.md` (eventos/cards que apontam pra cá), `Auditoria-Navegacao-por-Papel.md`, `API-e-Contratos.md`, `Produto-e-Fluxos.md`

> ⚠️ **O contrato não é livro de status — é agenda** (RC-D62..D68, `Contratos-Plano-de-Trabalho.md` **§6**). Ele guarda só o que é **subproduto de trabalho já feito** (emitir o PDF, imprimir a etiqueta, gerar o espelho, aplicar ágio, cancelar por washout) e deixou de pedir **escrituração** — marcar faturado, marcar pago, confirmar embarque. Sobraram **três situações** (`EMITIDO` · `FINALIZADO` · `WASH_OUT`) e uma **agenda derivada** das datas que o documento já imprime. O **embarque foi apagado inteiro**. Tudo abaixo descreve o **código de hoje**.

> **Como este documento se mantém vivo:** a cada implementação concluída e validada, esta Visão Geral é atualizada no mesmo passo. As **decisões, o histórico e o backlog** vivem no `Contratos-Plano-de-Trabalho.md`; aqui fica **só o estado atual**. Esta consolidação (2026-07-13, 4→2 docs) absorveu e removeu os antigos `Central-de-Contratos-`, `Aprovacoes-` e `Embarque-Plano-de-Trabalho.md` — o histórico completo de decisões (D/CC/AP/EMB) e de sessões está no Git e, condensado, no apêndice do `Contratos-Plano-de-Trabalho.md`.

---

## 1. Propósito e quem usa

O contrato de compra e venda de café é operado em **2 páginas sem sub-aba nenhuma** (RC-F1/RC-F4, 2026-07-27) — o eixo não é mais gestão × operação, é **o contrato × o dinheiro consolidado**:

- **`/contratos`** — **o contrato inteiro**, de ponta a ponta (todo não-PROSPECTOR): nasce, vira PDF, ágio, **finalizar/reabrir**, washout, e — dentro do detalhe — o **Espelho de Corretagem** (RC-D42) e **gerar a etiqueta de aprovação** (RC-D25). Lista: **tabela** no desktop, **cards** no mobile (RC-D43); busca/filtros/paginação no servidor (RC-D45). A coluna principal é a **Situação** (RC-D68) — o próximo compromisso, não um rótulo de fase.
- **`/financeiro`** — **só ADMIN** (RC-D3): a carteira consolidada de corretagem a receber, **em leitura pura** (RC-D67). É um **recorte gerencial**, não uma etapa do fluxo: nenhuma ação mora aqui.

Um contrato não muda de página no ciclo: **tudo acontece em `/contratos`**. O `/financeiro` olha o conjunto de fora. Desde o **ACESSO UNIFICADO (2026-07-15)** todo não-PROSPECTOR abre `/contratos`; o PROSPECTOR não acessa nenhuma das duas, e os demais 4 papéis não abrem o `/financeiro`.

> **O que morreu aqui:** `/embarques` (redirect → `/contratos`) e as worklists de **Aprovações** e **Embarque** que viviam nela (RC-F4); e, na **RC-D65**, o **embarque inteiro** — confirmação, fotos, transporte, worklist e eventos. A fila proativa ("quais contratos precisam de etiqueta hoje?") vive no **card de Avisos** do dashboard, nos **chips do calendário** e agora na **coluna Situação** da própria lista.

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
- **WASH_OUT** — `washoutSaleContract` cancela/desfaz o negócio; **definitivo e sem desfazer** (D122, que segue valendo **aqui**). Ele **pergunta duas coisas**, ambas obrigatórias e ambas definitivas: o **motivo** e se **haverá cobrança de corretagem** (RC-D89/D90, `washoutBillable`). A resposta é o que decide se o contrato continua no Financeiro (§6) e se o Espelho sai (§5) — antes isso era derivado do `type` (D145, revogada). Sem resposta gravada, **não cobra** (`!== true`: o sistema não inventa cobrança). 🔴 **É a única porta do washout:** cancelar a venda pelo lote foi fechado (RC-D87) — a rota recusa com 409 `MOVEMENT_HAS_CONTRACT`, porque por ali ninguém teria como responder sobre corretagem.

**Não há portões.** `FATURADO` e `PAGO` saíram do enum; com eles saíram o portão de aprovação (AP18) e o de embarque (EMB28) — **RC-D65/RC-D66**. Finalizar exige só `EMITIDO` + `expectedVersion` (409 `SALE_CONTRACT_NOT_FINALIZABLE` / `SALE_CONTRACT_VERSION_CONFLICT`); reabrir, só `FINALIZADO` (409 `SALE_CONTRACT_NOT_REOPENABLE`). Nenhuma das duas pede confirmação: são reversíveis.

### A agenda (RC-D68)

O que a lista mostra na coluna **Situação** não é fase — é **o próximo compromisso**, derivado por `deriveContractAgenda(input, todayKey)` sem persistir nada:

| `kind`              | Quando                                                           | Frase (front)                 |
| ------------------- | ---------------------------------------------------------------- | ----------------------------- |
| `cancelado`         | `WASH_OUT`                                                       | "Cancelado"                   |
| `finalizado`        | `FINALIZADO`                                                     | "Finalizado"                  |
| `aprovacao`         | exige aval, sem etiqueta, dentro da janela do lead (ou sem data) | "Aprovação a enviar"          |
| `pagamento_vencido` | `paymentDate` < hoje                                             | "Pagamento venceu 02/08/2026" |
| `faturamento`       | `invoiceDate` ≥ hoje                                             | "Fatura em 12/08/2026"        |
| `pagamento`         | sobrou `paymentDate`                                             | "Pagamento em 20/08/2026"     |
| `nenhum`            | nada por vir                                                     | "—"                           |

A precedência é a ordem da tabela. **Atraso só existe no `paymentDate`** (RC-D64) — o `invoiceDate` é lembrete puro: passou o dia, o aviso se recolhe, nada fica vermelho. A derivação usa 5 ingredientes (`status`, `requiresApproval`, existência de etiqueta, `invoiceDate`, `paymentDate`) e é a **mesma função** na lista e no detalhe, para os dois não divergirem. O backend devolve `{ kind, dayKey }`; a frase em pt-BR é montada no front (`contractAgendaLabel`), que é quem formata data.

**Regras que sobreviveram nas datas planejadas:**

- **Dia útil (DSB-D7):** `invoiceDate` e `paymentDate` rejeitam fim de semana (`422 WEEKEND_DATE`).
- **Ordem (D142):** a criação/edição rejeita `paymentDate` anterior a `invoiceDate` (`422 VALIDATION_ERROR` no campo, espelhado no form). Contratos já emitidos não são revalidados.
- **"À definir" no FUTURO (D144):** em contratos `FUTURO`, cada data planejada pode — independentemente — ser **"À definir"** (`null` explícito no payload; `undefined` segue 422). À vista exige as duas sempre, inclusive no Editar. Com data "à definir" o contrato **não gera evento no calendário** e a agenda simplesmente não a considera; o Editar define depois — e pode voltar uma definida para "à definir".

---

## 4. `/contratos` — o contrato de compra e venda

> Código: `SaleContractCard`, `SaleContractEtapa2Modal`, `SaleContractDetailsModal`, `SaleContractLifecycleDialog`; `src/sale-contracts/sale-contract-service.js`, `sale-contract-pdf-service.js`, `issuer-config.js`. Mercados **à vista** e **futuro** funcionam ponta a ponta.

### 4.1 Da venda ao PDF (Etapa 1 → Etapa 2)

- **Entrada:** o FAB radial da página (`ContractCreateRadialFab`) oferece os 2 mercados. **À vista:** um painel de **dois passos** (`SaleContractEtapa2Modal`) — formulário em modo _spot_ → conferência do documento (`ContractDocumentStep`) — venda + contrato nascem **atômicos** (D97), já EMITIDO. O **lote é o primeiro campo** do formulário (`ContractLotField`, RC-D69): busca com dropdown entre os lotes vendáveis, obrigatório, e escolher preenche na hora vendedor, filial, conta bancária, sacas e liga. Trocar ou limpar o lote zera exatamente o que veio dele; o resto do formulário fica. **Futuro:** Etapa 2 direto, sem lote/venda; as datas planejadas de faturamento/pagamento podem nascer **"À definir"** (checkbox por campo — D144) e ser definidas (ou revertidas) no Editar. O futuro é **contrato de papel** (D147): nasce sem lote e **nunca ganha um** — o físico é rastreado à parte pelos lotes.
- **Etapa 1 (Venda):** a venda origina os dados do contrato (partes, produto, quantidade em sacas, preço, modalidade, prazos). As partes entram como **snapshots** no contrato (não referência viva) para o PDF ser fiel ao momento.
- **Etapa 2 (Geração):** o modal de geração completa/valida os campos que faltam e **emite** o contrato (→ EMITIDO), gerando o **PDF** para impressão. Campos têm origem/obrigatoriedade/validação próprias (detalhe no código + os limites de data em §3).
- **Editar (re-emissão):** só age sobre `EMITIDO`. **O lote não muda** — aparece travado, com o número (RC-D72, `sampleLotNumber` no detalhe). **O vendedor NÃO é editável em contrato com lote** — ele **é** o dono do lote, derivado no servidor (RC-D37, 2026-07-28; revoga a D48). O campo aparece travado — e desde a **RC-D88** o do lote também: **um lote com contrato não troca mais de dono** (409 `SAMPLE_OWNER_LOCKED_BY_CONTRACT`), porque a troca chegaria ao contrato em silêncio, na próxima vez que ele fosse salvo. Trocar de vendedor num contrato emitido deixou de ter caminho. **Cascata contrato à vista → lote/venda (D146),** do que sobrou dela: **comprador / sacas / data** → a venda (`SampleMovement`; mexer nas sacas recalcula o saldo do lote; P20/D52/D66). **Banco do vendedor, filial e armazéns são seleção** — congelam no snapshot e **não** escrevem de volta no cadastro (por design); preço/corretagem/corretores só vivem no contrato. Esses syncs rodam **antes** da transação do contrato — passo **não-atômico por decisão** (D143): a janela de corrida é minúscula e, num 409 de concorrência, os syncs são idempotentes e **convergem no retry**.

### 4.2 Modelo financeiro (ágio + corretagem)

- **Total = `unitPrice × sacks ± ágio`.** O **ágio/deságio** é armazenado em **R$ por saca** e somado/subtraído no total (`computeContractMoneyWithAgio`). Os botões de **Ágio/Deságio** ficam no **modal de Detalhes** do contrato (D121).
- **Corretagem por lado = `Total × %`** (compra e venda têm percentuais próprios; `SaleContractBroker`).

### 4.3 PDF e Detalhes

- **PDF** gerado com `pdf-lib` a partir de um layout fixo (D111) e do `issuer-config` (dados da emitente).
- **Modal de Detalhes** (`SaleContractDetailsModal`): visão completa do contrato + **timeline** (`/sale-contracts/[id]/timeline`) + as ações que não cabem no card. A matriz card × modal é fixada por D121/D126 e revista pela **RC-D25/RC-D62**.

**Onde cada ação mora hoje:**

| Ação                  | Onde                                           | Condição                                           |
| --------------------- | ---------------------------------------------- | -------------------------------------------------- |
| **Finalizar**         | card (mobile) · ⋯ da linha · modal de Detalhes | `status === 'EMITIDO'` + `canManage` (**RC-D63**)  |
| **Reabrir**           | card (mobile) · ⋯ da linha · modal de Detalhes | `status === 'FINALIZADO'` + `canManage`            |
| Editar · Washout      | modal de Detalhes                              | conforme D121/D126                                 |
| Ágio / Deságio        | modal de Detalhes                              | D121                                               |
| "Solicitar aprovação" | modal de Detalhes                              | latch de mão única, só `EMITIDO` (AP32 — §7)       |
| **"Gerar etiqueta"**  | modal de Detalhes                              | seção Aprovação; `canManage` + status ≠ `WASH_OUT` |
| "Gerar espelho"       | modal de Detalhes                              | **só ali** (RC-D42 revogou a D76 — §5)             |

Finalizar e Reabrir **não pedem confirmação** — são reversíveis, e confirmar um toque reversível é ruído; o Washout continua pedindo motivo, porque continua definitivo (`SaleContractLifecycleDialog`, hoje **só washout**). O `ApprovalLabelModal` abre **por cima** do detalhe, e enquanto ele está de pé o overlay não fecha por ESC/backdrop (`dismissGuardRef`); ao concluir, o detalhe **se recarrega**.

---

## 5. Espelho de Corretagem

> Segundo documento gerado a partir do contrato. Código: `EspelhoCorretagemModal`, `EspelhoConferenciaModal`; `SaleContractEspelhoLog`.

- **O que é:** o espelho da corretagem — mapeia campos do contrato para um PDF de 9 colunas (origem de cada campo documentada no código).
- **Elegibilidade (`assertEspelhoEligible`, fonte única que gateia o PDF _e_ o log):** `side` válido (`ESPELHO_INVALID_SIDE`); status ∈ `EMITIDO/FINALIZADO/WASH_OUT`, ou seja **qualquer contrato** (`ESPELHO_NOT_ELIGIBLE`; a lista reusa `SALE_CONTRACT_STATUSES` — D147); **com corretagem no lado pedido** (`ESPELHO_NO_BROKERAGE`). **Exceção (RC-D91, revoga a D145):** o cancelado que respondeu **"não cobrar"** — ou que não respondeu — não emite espelho (`ESPELHO_WASHOUT_NOT_BILLABLE`, predicado `isWashoutNotBillable`). Quem respondeu "cobrar" emite, **inclusive à vista**: o Espelho é o documento com que se cobra, e negá-lo deixaria a cobrança sem papel.
- **Como gerar:** pelo botão **"Gerar espelho" no Detalhes** do contrato — e só por ali (**RC-D42** revogou a D76: o leque "+" da lista deixou de oferecê-lo, e com ele saiu o modo de seleção da página). Abre a **Conferência (D134)**, revisão _read-only_ dos campos (não grava nada; o "Preço" vem de `effectiveUnitPrice` da view, mesma fonte do PDF) antes de gerar a prévia. Quando o contrato não é elegível o botão **não aparece**.
- **Auditoria (D124/D127):** o `SaleContractEspelhoLog` (contrato + lado + ator) é gravado no **Exportar/Baixar**, **só na entrega concluída** (a prévia `?preview=1` não audita; cancelar o share não audita). É **best-effort** e a prévia entrega o PDF sem log — trilha de conferência, não controle rígido; o endpoint de log **valida a elegibilidade** (não grava export impossível).

---

## 6. `/financeiro` — a carteira (ADMIN-only)

> A corretagem a receber por fechamento, **em leitura pura** (RC-D67). Código: `app/financeiro/page.tsx`, `FinanceiroPanel`/`FinanceiroCard`; `app/api/v1/financeiro`, `sale-contract-service.js`. Acesso: `FINANCEIRO_ROLES` **= `['ADMIN']`** (RC-D3, 2026-07-27 — era `NON_PROSPECTOR_ROLES`; escopo aberto dentro do ADMIN).

- **Estado de recebimento** por contrato (a vencer / vencido / **recebida** / **cancelado**), com os cálculos de corretagem e ágio de §4.2. **"Recebida" = contrato `FINALIZADO`** (RC-D67; era `PAGO`) — a corretagem sai da fila quando o contrato acaba. Sem `paymentDate` ("À definir" no FUTURO, D144) o contrato é **sempre "a vencer"** (nunca vencido), no fim da fila, e o card exibe **"À definir"**.
- **O washout cobra conforme a RESPOSTA (RC-D89, revoga a D145):** um washout aparece aqui (estado "cancelado") e conta no total **quando respondeu "cobrar"** — o tipo do contrato não pesa mais. Quem respondeu "não cobrar", e quem foi cancelado antes da coluna `washout_billable` existir sem ser backfillado, **não aparece**: some da lista, de todos os filtros (inclusive "Cancelado") e do total (filtrado no `where` por `washoutBillable: true`, nunca chega ao card). Segue visível só em `/contratos`, com o status Wash-out.
- **Escopo:** **só o ADMIN** abre a página (RC-D3); dentro dela, vê **tudo** (escopo aberto — D140 revogou o own-only, superando D135/D128). Os outros 4 papéis não-PROSPECTOR: sem item de nav, e `/financeiro` na barra de endereço cai no `/dashboard` pelo guard; o service devolve 403.
- **Sem rateio ÷N** (D136): o valor exibido é o do fechamento, não dividido.
- **Nenhuma ação** (RC-D67, revoga D137/RC-D6/RC-D22): o botão "Pago" morreu **nas duas casas**. O que tira a corretagem da fila é o **Finalizar**, em `/contratos`, aberto a todo não-PROSPECTOR — o efeito que a RC-D6 queria, por outro caminho. Sem botão, o painel também não precisa mais de toast nem de refetch.
- **Ordenação/paginação:** keyset/cursor particionado (por estado de recebimento; vencidos primeiro).
- **Visual:** o painel entrou **intacto** na página nova (RC-D24) — só trocou de casca. O chrome FV é a 2ª rodada da RC-F6.

---

## 7. Aprovação (o aviso)

> Código: `ApprovalLabelModal` (aberto pela seção **Aprovação** do `SaleContractDetailsModal`); `setSaleContractApprovalFlag`, `sendApprovalLabel`, `getApprovalLabelPrefill`; tabelas `approval_label_log` + `CustomPrintJob`.
>
> ⚠️ **A aprovação deixou de ser portão** (RC-D66, 2026-07-28). Ela **não bloqueia nada** — o AP18 foi revogado junto com o faturar que ele travava. E a **sub-aba Aprovações não existe** desde a RC-F4; o endpoint `listApprovalContracts` (`/sale-contracts/approvals`) segue vivo e testado, mas **sem consumidor de UI** — a RC-F3 decide o destino dele.

**O modelo (o aviso):** aprovação não é um estado no contrato — é um **lembrete que se resolve sozinho**. O criador **sinaliza** se o contrato precisa de aval (`requiresApproval`); enquanto não sai etiqueta, o contrato aparece com "Aprovação a enviar" na coluna Situação (§3) e no card de Avisos do dashboard; quando alguém **gera/envia a etiqueta** (impressa, auditada em `approval_label_log`), o aviso **some por si**. Ninguém marca nada, e nada trava. É o molde que a §6 do plano generalizou para o contrato inteiro. O log audita o **envio** (enqueue no `CustomPrintJob` + linha no log), **não o sucesso da impressão** — exigir impressão concluída deixaria o app refém do print agent local.

- **Estados derivados** (sem enum próprio): **não se aplica** / **a enviar** / **enviada** / **cancelado** (no washout que respondeu **"cobrar"** — AP33 alinha a worklist ao Financeiro; o predicado virou `washout_billable IS TRUE` na RC-D89). O **desfecho** (aprovado/recusado) fica **fora do sistema**; o **proxy** é o **nº de envios** ("enviada · N×").
- **Sinalização (latch de mão única, AP32):** `requiresApproval` é marcado na **emissão** (form etapa 2) ou, depois, pelo botão **"Solicitar aprovação"** no modal de Detalhes (`setSaleContractApprovalFlag`, gated por `SALE_CONTRACT_ACCESS_ROLES` = todo não-PROSPECTOR), com confirmação (é definitivo). É **mão única**: uma vez "Sim", **nunca** volta a "Não" (`APPROVAL_FLAG_LOCKED`, mesmo antes do 1º envio — endurece a AP20); o **"Editar" não toca** o sinal (preserva o do banco). ⚠️ **O latch é o que sustenta o aviso** agora que não há portão: sem ele, um Editar zeraria o sinal e o lembrete sumiria sem que a aprovação tivesse sido enviada. Só muda enquanto `EMITIDO` (finalizado/washout congelam — `APPROVAL_FLAG_NOT_EDITABLE`).
- **Gerar etiqueta exige `requiresApproval = true`** (`APPROVAL_CONTRACT_NOT_MARKED`, AP17); elegibilidade = **só `EMITIDO`** (`APPROVAL_ELIGIBLE_STATUSES`, AP21) — o backend é quem enforça, e a UI não antecipa a regra. **A geração mora no detalhe do contrato** (**RC-D25 revogou a AP29**, que a punha na sub-aba morta): botão "Gerar etiqueta" na seção Aprovação, sob `canManage` + status ≠ `WASH_OUT`; ele busca o prefill (`/approval-labels/contracts/[id]/prefill`) e abre o `ApprovalLabelModal`. Continua **sem** porta no `/samples` e **sem** etiqueta avulsa.
- **A etiqueta espelha a origem — read-only (2026-07-19):** os **lotes de origem** impressos vêm do lote/liga vinculado (`Sample.declaredOriginLot`), exibidos **read-only** no `ApprovalLabelModal` (não se editam mais os lotes na hora de imprimir — fonte única; corrigir = editar o **lote** (chips) ou a **liga** e reimprimir; futuro sem amostra = sem lotes). O `splitOriginLotForLabel` reparte por espaço/vírgula/`;` (**preserva hífen**, ex.: `PA-01`) e exibe no **máximo 8 + "+"** (o armazenamento guarda todos). Layout **em 2 colunas** (logo + Nº Fechamento + Nº Compra à esquerda; Produtor + Armazém + Sacas + Lotes à direita) no `print-agent/label.js` (`buildCustomLabelLayout`, com auto-ajuste de fonte). Ver `Liga-Plano` (log 2026-07-20) para a origem como chips + a origem derivada/pinável da liga.
- **Worklist (sem UI):** `listApprovalContracts` continua particionando por estado (a enviar / enviada) via `$queryRaw` (G0/G1/G2) com cursor `{g, key, seq}` — o estado depende de um agregado de contagem do log — e ordenando por `invoice_date ASC NULLS LAST`. O endpoint está de pé e testado; **nada na UI o chama** desde a RC-F4.

> **Onde ficou o "quais contratos precisam de etiqueta hoje?".** Em **três** lugares, todos derivados: a **coluna Situação** de `/contratos` (RC-D68), o **card de "Avisos"** do dashboard (aviso binário "aprovação a enviar", que aparece quando `invoice_date ≤ hoje + lead` — ou a data é "À definir" — e **some quando a etiqueta é gerada**; ver `Dashboard-Visao-Geral.md` §7.4) e o filtro por situação da lista. O **lembrete de aprovação no calendário** foi removido no DSB-D9 (data imprecisa) e o card **"Aprovações enviadas"** morreu na RC-D26 (componente, rota e CSS apagados). Desde a RC-D23 cada item de Avisos abre **o próprio contrato** (`/contratos?details=<id>&highlight=<id>`), onde se gera a etiqueta. O campo `approvalReminderLeadDays` é obrigatório no form quando `requiresApproval` (1–365, default 30), gravado na criação e editável no Editar quando "Sim"; o botão "Solicitar aprovação" (AP32) latcha com o default 30.

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
- **Logs/filas:** `SaleContractStatusLog` (marcos de situação — **é ele quem responde "quem finalizou e quando"**, inclusive nas reaberturas; por isso a RC-D63 não precisou de coluna nova) · `SaleContractAgioLog` (cada aplicação de ágio/deságio) · `SaleContractEspelhoLog` (espelho) · `approval_label_log`/`ApprovalLabelLog` (envios de aprovação) · `CustomPrintJob` (fila da etiqueta de aprovação). _(`SaleContractShipmentPhoto` foi apagada na RC-D65.)_
- **Enums:** status (`EMITIDO`/`FINALIZADO`/`WASH_OUT`) e os demais do domínio. _(`ShipmentCarrier` apagado.)_

_(O `Arquitetura-Tecnica.md` resume o domínio na seção "Modelo de dados" → "Domínio de contratos"; o detalhe funcional é este doc.)_

---

## 10. Rotas de API

> `GET`/`POST` sob `app/api/v1/`; handlers em `src/api/v1/backend-api.js`, implementação em `src/sale-contracts/sale-contract-service.js`. PROSPECTOR barrado pelo allowlist central.

- **Contrato (CRUD/ciclo):** `/sale-contracts` (lista + criação), `/sale-contracts/next-number` (preview do número), `/sale-contracts/[id]` (detalhe) e `/sale-contracts/[id]/{emit, finalize, reopen, washout, apply-agio, approval-flag, timeline}` — as mutações de §3. `finalize` e `reopen` (RC-D62) pedem só `expectedVersion`: **sem corpo de data**. No create/emit, `invoiceDate`/`paymentDate` aceitam `null` explícito ("À definir") **só quando o contrato é FUTURO** (D144; à vista → 422). _(`invoice` e `pay` foram **apagadas** na RC-D62.)_
- **Documentos:** `/sale-contracts/[id]/pdf` (contrato) e `/sale-contracts/[id]/espelho/{pdf, log}` (espelho + auditoria de export).
- **Aprovação:** `/sale-contracts/approvals` (worklist — **sem consumidor de UI** desde a RC-F4) e `/approval-labels` (gerar/enviar etiqueta; o sub-route `/approval-labels/contracts/[id]/prefill` monta a etiqueta a partir do contrato). _(O picker `/approval-labels/contracts` foi removido na AP32; a rota `/sale-contracts/approvals/recent-sends` foi **apagada** na RC-D26, com o card que a consumia.)_
- **Lookups:** `/contract-lookups` (modalidade/forma de pagamento/embalagem). Criar valores das listas de apoio é gated por `CONTRACT_LOOKUP_MANAGE_ROLES` (= `NON_PROSPECTOR_ROLES` desde 2026-07-15 — antes ADMIN-only).
- **Financeiro:** `/financeiro` (lista de todos os fechamentos). **Leitura pura** — não há rota de mutação associada (RC-D67).
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
- `components/contracts/*` — `ContratosPanel` + `SaleContractCard`; `components/financeiro/*` — `FinanceiroPanel`, `FinanceiroCard`. _(Apagados na RC-F4: `AprovacoesPanel`, `EmbarquePanel`, `AprovacaoCard`, `EmbarqueCard`; na RC-D26: `RecentSendsCard`.)_
- Modais: `SaleContractEtapa2Modal`, `SaleContractDetailsModal`, `SaleContractLifecycleDialog` (**só washout** desde a RC-D62), `EspelhoCorretagemModal`, `EspelhoConferenciaModal`, `ApprovalLabelModal` (abre **de dentro do Detalhes**, RC-D25). _(`ShipmentConfirmationModal` apagado na RC-D65.)_
- `components/AppShell.tsx` — os 2 itens de nav (Contratos + Financeiro) na sidenav desktop, sem sub-itens, e **Contratos na tabbar mobile** (`MOBILE_NAV_ITEMS`) / `components/HeaderAvatarMenu.tsx` — só Financeiro (Contratos saiu do menu quando virou aba)
- `lib/roles.ts` — `NON_PROSPECTOR_ROLES`, `CONTRATOS_ROLES`, `FINANCEIRO_ROLES` (= ADMIN), `PAYMENT_FEED_ROLES`
- `lib/currency.ts`, `lib/types.ts`

**Backend**

- `src/sale-contracts/sale-contract-service.js` — emit/finalize/reopen/washout + Financeiro + worklist de aprovação + feeds de evento + a agenda da lista/detalhe (`_withAgenda`/`_agendaFor`)
- `src/sale-contracts/sale-contract-support.js` — normalizações, selects, builders de evento e **`deriveContractAgenda`** (§3)
- `src/sale-contracts/sale-contract-pdf-service.js` + `issuer-config.js` — PDF do contrato/espelho
- `prisma/schema.prisma` — modelos e enums de §9

---

## 13. Estado de validação

Contrato à vista + futuro, a aprovação, a **RC-F1 + RC-F4** (`/contratos` página única + `/financeiro` ADMIN-only + `/embarques` extinta), a **RC-F5** (a criação repensada), a **RC-D62..D68** (as três situações + a agenda + a morte do embarque) e a **RC-D69..D72** (o lote como campo, criação em 2 passos) foram **implementados ponta a ponta**, com gates verdes (lint/format/typecheck/schemas/unit/contracts/integração/build) — mas **em `main`, não pushados**, e **aguardando conferência no dev local e validação no device** (ver `Contratos-Plano-de-Trabalho.md` §5, §6 e §7). Este documento descreve o comportamento **do código**; divergências observadas no device viram achados no plano de trabalho.

🔴 **A migration `20260728120000` é destrutiva.** Antes de aplicá-la em **produção**, conferir no banco que `sale_contract` não tem linha alguma com `status IN ('FATURADO','PAGO')` nem `shipped_at` não-nulo. A afirmação de que este domínio nunca foi deployado é de doc; apagar coluna merece a checagem no banco.
