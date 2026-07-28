# Contratos — Visão Geral

Status: Ativo (documento-mãe / verdade viva do funcionamento atual)
Escopo: o que as páginas `/contratos` e `/financeiro` fazem hoje — a casca (rotas + acesso por papel), o contrato de compra e venda ("Fechamento" → PDF), o Espelho de Corretagem, a carteira do **Financeiro**, a **aprovação** e o **embarque** (hoje dentro do contrato), a **máquina de estado** do contrato com seus portões, o modelo de dados e as rotas de API.
Última revisão: 2026-07-27 (**RC-F1 + RC-F4** — `/contratos` vira página única, `/financeiro` nasce página própria só ADMIN, `/embarques` e a sub-aba Aprovações são extintas; etiqueta e embarque migram pro detalhe do contrato. Anterior: 2026-07-15, ACESSO UNIFICADO por papel)
Documentos relacionados: `Contratos-Plano-de-Trabalho.md` (backlog, decisões e pendências), `Dashboard-Visao-Geral.md` (eventos/cards que apontam pra cá), `Auditoria-Navegacao-por-Papel.md`, `API-e-Contratos.md`, `Produto-e-Fluxos.md`

> ⚠️ **Ciclo RC em andamento (`Contratos-Plano-de-Trabalho.md` §5).** A **primeira fase saiu** (RC-F1 + RC-F4, §5.9): a casca de 2 páginas × 2 sub-abas acabou — `/contratos` é **página única**, `/financeiro` é **página própria só ADMIN**, `/embarques` **redireciona** e a sub-aba **Aprovações não existe mais**. **Falta a RC-F2:** o processo de venda ainda **não** é exibido fase a fase dentro do contrato (Emissão → Aprovação → Embarque → Faturamento → Pagamento) — as seções Aprovação e Embarque do detalhe já **agem** (gerar etiqueta / confirmar embarque, RC-D25), mas continuam sendo seções de informação, não uma trilha. Tudo abaixo descreve o **código de hoje**.

> **Como este documento se mantém vivo:** a cada implementação concluída e validada, esta Visão Geral é atualizada no mesmo passo. As **decisões, o histórico e o backlog** vivem no `Contratos-Plano-de-Trabalho.md`; aqui fica **só o estado atual**. Esta consolidação (2026-07-13, 4→2 docs) absorveu e removeu os antigos `Central-de-Contratos-`, `Aprovacoes-` e `Embarque-Plano-de-Trabalho.md` — o histórico completo de decisões (D/CC/AP/EMB) e de sessões está no Git e, condensado, no apêndice do `Contratos-Plano-de-Trabalho.md`.

---

## 1. Propósito e quem usa

O contrato de compra e venda de café é operado em **2 páginas sem sub-aba nenhuma** (RC-F1/RC-F4, 2026-07-27) — o eixo não é mais gestão × operação, é **o contrato × o dinheiro consolidado**:

- **`/contratos`** — **o contrato inteiro**, de ponta a ponta (todo não-PROSPECTOR): nasce, vira PDF, ágio, ciclo de vida completo (faturar **e** pagar no card), o **Espelho de Corretagem**, e — dentro do detalhe — **gerar a etiqueta de aprovação** e **confirmar o embarque** (RC-D25).
- **`/financeiro`** — **só ADMIN** (RC-D3): a carteira consolidada de corretagem a receber. É um **recorte gerencial**, não uma etapa do fluxo: o contrato não precisa passar por aqui para ser pago.

Um contrato não muda de página no ciclo: **tudo acontece em `/contratos`**. O `/financeiro` olha o conjunto de fora. Desde o **ACESSO UNIFICADO (2026-07-15)** todo não-PROSPECTOR abre `/contratos`; o PROSPECTOR não acessa nenhuma das duas, e os demais 4 papéis não abrem o `/financeiro`.

> **O que morreu aqui:** `/embarques` (redirect → `/contratos`) e as worklists de **Aprovações** e **Embarque** que viviam nela. As duas ações que só elas ofereciam mudaram de casa **no mesmo passo** — para o detalhe do contrato. O que ainda **não** existe é a fila proativa ("quais contratos precisam de etiqueta hoje?"): hoje ela vive só no **card de Avisos** do dashboard e nos **chips do calendário**. A RC-F3 decide o destino disso.

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

> ⚠️ **Alívio de UI vs. segurança:** entre os cinco papéis não-PROSPECTOR, a **única** fronteira real é `/financeiro`. `/contratos` é **auth-only** para qualquer não-PROSPECTOR autenticado, e o **pagamento** (botão "Pago" no card, RC-D22) está aberto a todos eles — o ADMIN-only vale para a carteira, não para a transição.

---

## 3. Máquina de estado do contrato (dono único)

> Esta seção é a **casa única** da máquina de estado — inclusive dos "portões" que outras abas impõem. Código: `src/sale-contracts/sale-contract-service.js` (`emit`/`invoice`/`pay`/`washout`), `sale-contract-support.js`.

O contrato tem **4 status** (`SaleContract.status`):

```
        emitir (atômico)        faturar            pagar
  (venda) ───────────────▶ EMITIDO ───────▶ FATURADO ───────▶ PAGO
                              │                 │                │
                              └──────── washout (a qualquer momento) ──────▶ WASH_OUT
```

- **EMITIDO** — criado **atômico** a partir da venda + Etapa 2 (não há mais rascunho / `EM_ABERTO` / `CONFERIR` / `CONFIRMADO`; esses estados antigos foram descartados por D96/D97). Registra `SaleContractStatusLog`.
- **FATURADO** — `invoiceSaleContract` grava `invoicedAt` (dia **real** do faturamento).
- **PAGO** — `paySaleContract` grava `paidAt`.
- **WASH_OUT** — `washoutSaleContract` cancela/desfaz o negócio; **isento dos portões**. Não há "Desfazer" de status (D122). A corretagem de um washout só é **cobrável no FUTURO** (D145) — ver §5 (Espelho) e §6 (Financeiro).

**Portões (guards) na transição:**

| Transição             | Portão                   | Condição                                                                                                                | Erro                             |
| --------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| EMITIDO → FATURADO    | **Aprovação** (AP18)     | se `requiresApproval`, exige **≥1 etiqueta de aprovação enviada**                                                       | `422 CONTRACT_APPROVAL_REQUIRED` |
| FATURADO → PAGO       | **Embarque** (EMB28)     | se `requiresShipment`, exige **embarque confirmado** (o modal oferece "Confirmar embarque" e então segue pro pagamento) | `CONTRACT_SHIPMENT_REQUIRED`     |
| qualquer data de ação | **Dia útil** (DSB-D7)    | `invoiceDate` / `paymentDate` / `shippedAt` **rejeitam fim de semana**                                                  | `422 WEEKEND_DATE`               |
| pagar                 | **Data máx. hoje** (E30) | data de pagamento não pode ser futura                                                                                   | —                                |

Pagar **herda** o portão de aprovação (só se chega a FATURADO passando por ele). **Faturar e pagar** rejeitam data futura — a data real (`invoicedAt`/`paidAt`) não passa de hoje (BRT), erro `422 VALIDATION_ERROR` (a linha "Data máx. hoje" acima vale para os dois). Os flags `requiresApproval`/`requiresShipment` são definidos na emissão (ver §7 e §8).

As **datas planejadas** também têm regra (D142): a criação/edição rejeita `paymentDate` anterior a `invoiceDate` (`422 VALIDATION_ERROR` no campo, espelhado no form) — o cronograma planejado nunca nasce incoerente. Contratos já emitidos não são revalidados.

**"À definir" no FUTURO (D144):** em contratos `FUTURO`, cada data planejada pode — independentemente — ser **"À definir"** (`null` explícito no payload; `undefined` segue 422). À vista exige as duas sempre, inclusive no Editar. Com data "à definir": dia-útil e D142 só valem para data presente (D142 compara quando AMBAS existem); **faturar/pagar/embarcar direto é permitido** (as transições usam só a data real); o contrato **não gera evento no calendário** até a data ser definida. O Editar define a data depois — e pode voltar uma definida para "à definir".

---

## 4. `/contratos` — o contrato de compra e venda

> Código: `SaleContractCard`, `SaleContractEtapa2Modal`, `SaleContractDetailsModal`, `SaleContractLifecycleDialog`; `src/sale-contracts/sale-contract-service.js`, `sale-contract-pdf-service.js`, `issuer-config.js`. Mercados **à vista** e **futuro** funcionam ponta a ponta.

### 4.1 Da venda ao PDF (Etapa 1 → Etapa 2)

- **Entrada:** o FAB radial da página (`ContractCreateRadialFab`) oferece os 2 mercados. **À vista:** escolher o lote com saldo (`SaleContractLotPickerModal`) → Etapa 2 em modo _spot_ — venda + contrato nascem **atômicos** (D97), já EMITIDO. **Futuro:** Etapa 2 direto, sem lote/venda; as datas planejadas de faturamento/pagamento podem nascer **"À definir"** (checkbox por campo — D144) e ser definidas (ou revertidas) no Editar. O futuro é **contrato de papel** (D147): nasce sem lote e **nunca ganha um** — o físico é rastreado à parte pelos lotes, e o embarque é um marco (`shippedAt`+fotos) **sem baixar estoque**.
- **Etapa 1 (Venda):** a venda origina os dados do contrato (partes, produto, quantidade em sacas, preço, modalidade, prazos). As partes entram como **snapshots** no contrato (não referência viva) para o PDF ser fiel ao momento.
- **Etapa 2 (Geração):** o modal de geração completa/valida os campos que faltam e **emite** o contrato (→ EMITIDO), gerando o **PDF** para impressão. Campos têm origem/obrigatoriedade/validação próprias (detalhe no código + os limites de data em §3).
- **Editar (re-emissão):** só age sobre `EMITIDO`. **Cascata contrato à vista → lote/venda (D146):** o que se edita no contrato e veio de lá volta pra lá — **vendedor** → dono do lote (`Sample.ownerClientId` + nome; D48). ⚠️ **RC-D36 (2026-07-28): essa troca NÃO propaga mais para liga alguma** — o dono deixou de derivar das origens em qualquer caso, fixado ou não (ver `Liga-Plano-de-Trabalho.md`, revisão de 2026-07-28). Quando o **próprio lote vendido é uma liga**, editar o vendedor segue **fixando** o dono dela ("dono fixado", `blendOwnerPinned`); **comprador / sacas / data** → a venda (`SampleMovement`; mexer nas sacas recalcula o saldo do lote; P20/D52/D66). **Banco do vendedor, filial e armazéns são seleção** — congelam no snapshot e **não** escrevem de volta no cadastro (por design); preço/corretagem/corretores só vivem no contrato. Esses syncs rodam **antes** da transação do contrato — passo **não-atômico por decisão** (D143): a janela de corrida é minúscula e, num 409 de concorrência, os syncs são idempotentes e **convergem no retry**.

### 4.2 Modelo financeiro (ágio + corretagem)

- **Total = `unitPrice × sacks ± ágio`.** O **ágio/deságio** é armazenado em **R$ por saca** e somado/subtraído no total (`computeContractMoneyWithAgio`). Os botões de **Ágio/Deságio** ficam no **modal de Detalhes** do contrato (D121).
- **Corretagem por lado = `Total × %`** (compra e venda têm percentuais próprios; `SaleContractBroker`).

### 4.3 PDF e Detalhes

- **PDF** gerado com `pdf-lib` a partir de um layout fixo (D111) e do `issuer-config` (dados da emitente).
- **Modal de Detalhes** (`SaleContractDetailsModal`): visão completa do contrato + **timeline** (`/sale-contracts/[id]/timeline`) + as ações que não cabem no card. A matriz card × modal é fixada por D121/D126 e revista pela **RC-D22/RC-D25**.

**Onde cada ação mora hoje:**

| Ação                      | Onde              | Condição                                             |
| ------------------------- | ----------------- | ---------------------------------------------------- |
| **Faturado** (→ FATURADO) | card da lista     | `status === 'EMITIDO'` + `canManage`                 |
| **Pago** (→ PAGO)         | card da lista     | `status === 'FATURADO'` + `canManage` (**RC-D22**)   |
| Editar · Washout          | card da lista     | conforme D121/D126                                   |
| Ágio / Deságio            | modal de Detalhes | D121                                                 |
| "Solicitar aprovação"     | modal de Detalhes | latch de mão única, só `EMITIDO` (AP32 — §7)         |
| **"Gerar etiqueta"**      | modal de Detalhes | seção Aprovação; `canManage` + status ≠ `WASH_OUT`   |
| **"Confirmar embarque"**  | modal de Detalhes | seção Embarque; sem `shippedAt` + `EMITIDO/FATURADO` |
| "Gerar espelho"           | modal de Detalhes | + leque "+" da lista (D134 — §5)                     |

As duas linhas em negrito são a **RC-D25**: elas vieram das worklists de `/embarques`, que morreram. Os modais (`ApprovalLabelModal`, `ShipmentConfirmationModal`) abrem **por cima** do detalhe, e enquanto um deles está de pé o overlay não fecha por ESC/backdrop (`dismissGuardRef`). Ao concluir, o detalhe **se recarrega** para refletir o novo estado. _(Isso é a semente da RC-F2: as seções já **agem**, mas ainda não são uma trilha de fases.)_

---

## 5. Espelho de Corretagem

> Segundo documento gerado a partir do contrato. Código: `EspelhoCorretagemModal`, `EspelhoConferenciaModal`; `SaleContractEspelhoLog`.

- **O que é:** o espelho da corretagem — mapeia campos do contrato para um PDF de 9 colunas (origem de cada campo documentada no código).
- **Elegibilidade (`assertEspelhoEligible`, fonte única que gateia o PDF _e_ o log):** `side` válido (`ESPELHO_INVALID_SIDE`); status ∈ `EMITIDO/FATURADO/PAGO/WASH_OUT` (`ESPELHO_NOT_ELIGIBLE`); **com corretagem no lado pedido** (`ESPELHO_NO_BROKERAGE`). **Exceção (D145):** um contrato **à vista** (`MERCADO_A_VISTA`) cancelado por washout **não gera cobrança** → bloqueado (`ESPELHO_WASHOUT_SPOT`); só o **FUTURO** em washout mantém o Espelho.
- **Como gerar:** pelo leque **"+"** (modo de seleção) **ou pelo botão "Gerar espelho" no Detalhes** do contrato — ambos abrem a **Conferência (D134)**, revisão _read-only_ dos campos (não grava nada; o "Preço" vem de `effectiveUnitPrice` da view, mesma fonte do PDF) antes de gerar a prévia.
- **Auditoria (D124/D127):** o `SaleContractEspelhoLog` (contrato + lado + ator) é gravado no **Exportar/Baixar**, **só na entrega concluída** (a prévia `?preview=1` não audita; cancelar o share não audita). É **best-effort** e a prévia entrega o PDF sem log — trilha de conferência, não controle rígido; o endpoint de log **valida a elegibilidade** (não grava export impossível).

---

## 6. `/financeiro` — a carteira (ADMIN-only)

> A corretagem a receber por fechamento. Código: `app/financeiro/page.tsx`, `FinanceiroPanel`/`FinanceiroCard`; `app/api/v1/financeiro`, `sale-contract-service.js`. Acesso: `FINANCEIRO_ROLES` **= `['ADMIN']`** (RC-D3, 2026-07-27 — era `NON_PROSPECTOR_ROLES`; escopo aberto dentro do ADMIN).

- **Estado de pagamento** por contrato (a receber / N vencidos / pago / **cancelado**), com os cálculos de corretagem e ágio de §4.2. Sem `paymentDate` ("À definir" no FUTURO, D144) o contrato é **sempre "a vencer"** (nunca vencido), no fim da fila, e o card exibe **"À definir"**.
- **Washout só paga corretagem no FUTURO (D145, revisa D105):** um washout aparece aqui (estado "cancelado") e conta no "Corretagem total" **apenas quando o contrato é FUTURO**. Um contrato **à vista** (`MERCADO_A_VISTA`) cancelado por washout **não aparece** no Financeiro — some da lista, de todos os filtros (inclusive "Cancelado") e do total (é filtrado no `where` por `type='FUTURO'`, nunca chega ao card). Segue visível só em `/contratos`, com o status Wash-out.
- **Escopo:** **só o ADMIN** abre a página (RC-D3); dentro dela, vê **tudo** (escopo aberto — D140 revogou o own-only, superando D135/D128). Os outros 4 papéis não-PROSPECTOR: sem item de nav, e `/financeiro` na barra de endereço cai no `/dashboard` pelo guard; o service devolve 403.
- **Sem rateio ÷N** (D136): o valor exibido é o do fechamento, não dividido.
- **Botão "Pago"** continua aqui, mas **não mora mais só aqui** — a **RC-D22 revogou a D137** e pôs o "Pago" também no **card da lista de `/contratos`** (`status === 'FATURADO'`), abrindo o mesmo `SaleContractLifecycleDialog` com `action="pay"`. Sem isso, apertar o Financeiro para ADMIN teria tirado o pagamento dos outros 4 papéis. Mesmo portão de embarque (§3/§8) nos dois pontos.
- **Ordenação/paginação:** keyset/cursor particionado (por estado de pagamento; vencidos primeiro).
- **Visual:** o painel entrou **intacto** na página nova (RC-D24) — só trocou de casca. O chrome FV vem na RC-F6, junto com `/contratos`.

---

## 7. Aprovação ("o portão")

> Código: `ApprovalLabelModal` (aberto pela seção **Aprovação** do `SaleContractDetailsModal`); `setSaleContractApprovalFlag`, `sendApprovalLabel`, `getApprovalLabelPrefill`; tabelas `approval_label_log` + `CustomPrintJob`.
>
> ⚠️ **A sub-aba Aprovações não existe mais** (RC-F4, 2026-07-27). `AprovacoesPanel`/`AprovacaoCard` foram **apagados** junto com `/embarques`. O **modelo** abaixo (o portão) é o mesmo; mudou **onde se age**: dentro do contrato. O endpoint `listApprovalContracts` (`/sale-contracts/approvals`) segue vivo e coberto por teste, mas **sem consumidor de UI** — a RC-F3 decide o destino dele.

**O modelo ("o portão"):** aprovação não é um estado no contrato — é um **portão de faturamento**. O criador **sinaliza** se o contrato precisa de aval (`requiresApproval`); quando precisa, alguém **gera/envia a etiqueta de aprovação** (impressa, auditada em `approval_label_log`); e **faturar fica bloqueado até ≥1 etiqueta enviada** (§3, AP18). O portão audita o **envio** (enqueue no `CustomPrintJob` + linha no log), **não o sucesso da impressão** — decisão deliberada: exigir impressão concluída deixaria o faturamento refém do print agent local.

- **Estados derivados** (sem enum próprio): **não se aplica** / **a enviar** / **enviada** / **cancelado** (no washout — **só FUTURO**, AP33: alinha ao Financeiro/D145; à vista washout não aparecia na worklist). O **desfecho** (aprovado/recusado) fica **fora do sistema**; o **proxy** é o **nº de envios** (>1 envio antes de faturar ≈ provável recusa; "enviada · N×").
- **Sinalização (latch de mão única, AP32):** `requiresApproval` é marcado na **emissão** (form etapa 2) ou, depois, pelo botão **"Solicitar aprovação"** no modal de Detalhes (`setSaleContractApprovalFlag`, gated por `SALE_CONTRACT_ACCESS_ROLES` = todo não-PROSPECTOR), com confirmação (é definitivo). É **mão única**: uma vez "Sim", **nunca** volta a "Não" (`APPROVAL_FLAG_LOCKED`, mesmo antes do 1º envio — endurece a AP20); o **"Editar" não toca** o sinal (preserva o do banco — fecha o furo que zerava o portão AP18). Só muda enquanto `EMITIDO` (faturado/washout congelam — `APPROVAL_FLAG_NOT_EDITABLE`).
- **Gerar etiqueta exige `requiresApproval = true`** (`APPROVAL_CONTRACT_NOT_MARKED`, AP17); elegibilidade = **só `EMITIDO`** (`APPROVAL_ELIGIBLE_STATUSES`, AP21) — o backend é quem enforça, e a UI não antecipa a regra. **A geração mora no detalhe do contrato** (**RC-D25 revogou a AP29**, que a punha na sub-aba morta): botão "Gerar etiqueta" na seção Aprovação, sob `canManage` + status ≠ `WASH_OUT`; ele busca o prefill (`/approval-labels/contracts/[id]/prefill`) e abre o `ApprovalLabelModal`. Continua **sem** porta no `/samples` e **sem** etiqueta avulsa.
- **A etiqueta espelha a origem — read-only (2026-07-19):** os **lotes de origem** impressos vêm do lote/liga vinculado (`Sample.declaredOriginLot`), exibidos **read-only** no `ApprovalLabelModal` (não se editam mais os lotes na hora de imprimir — fonte única; corrigir = editar o **lote** (chips) ou a **liga** e reimprimir; futuro sem amostra = sem lotes). O `splitOriginLotForLabel` reparte por espaço/vírgula/`;` (**preserva hífen**, ex.: `PA-01`) e exibe no **máximo 8 + "+"** (o armazenamento guarda todos). Layout **em 2 colunas** (logo + Nº Fechamento + Nº Compra à esquerda; Produtor + Armazém + Sacas + Lotes à direita) no `print-agent/label.js` (`buildCustomLabelLayout`, com auto-ajuste de fonte). Ver `Liga-Plano` (log 2026-07-20) para a origem como chips + a origem derivada/pinável da liga.
- **Worklist (sem UI):** `listApprovalContracts` continua particionando por estado (a enviar / enviada) via `$queryRaw` (G0/G1/G2) com cursor `{g, key, seq}` — o estado depende de um agregado de contagem do log — e ordenando por `invoice_date ASC NULLS LAST`. O endpoint está de pé e testado; **nada na UI o chama** desde a RC-F4.

> **Onde ficou o "quais contratos precisam de etiqueta hoje?".** O **lembrete de aprovação no calendário** foi removido no DSB-D9 (data imprecisa). O card **"Aprovações enviadas"** (top-40, `RecentSendsCard`, `GET /sale-contracts/approvals/recent-sends`) **morreu na RC-D26** — componente, rota e CSS apagados. Sobrou o **card de "Avisos"** do dashboard: aviso binário "aprovação a enviar", que aparece quando `invoice_date ≤ hoje + lead` (ou a data é "À definir") e **some quando a etiqueta é gerada**; desde a RC-D23 cada item abre **o próprio contrato** (`/contratos?details=<id>&highlight=<id>`), onde agora se gera a etiqueta. Ver `Dashboard-Visao-Geral.md` §7.4. O campo `approvalReminderLeadDays` é obrigatório no form quando `requiresApproval` (1–365, default 30), gravado na criação e editável no Editar quando "Sim"; o botão "Solicitar aprovação" (AP32) latcha com o default 30.

---

## 8. Embarque

> A confirmação do café no caminhão + o evento no dashboard. Código: `ShipmentConfirmationModal` (aberto pela seção **Embarque** do `SaleContractDetailsModal`); `SaleContractShipmentService`, `saveContractShipmentPhoto`, `listShipmentContracts`, `getDashboardShipmentEvents`; tabela `SaleContractShipmentPhoto`.
>
> ⚠️ **A sub-aba Embarque não existe mais** (RC-F4, 2026-07-27). `EmbarquePanel`/`EmbarqueCard` foram **apagados** junto com `/embarques`. A **confirmação** mudou de casa — botão **"Confirmar embarque"** na seção Embarque do detalhe do contrato (RC-D25), sob `canManage`, sem `shippedAt` e com status `EMITIDO`/`FATURADO` (os `SHIPPABLE_STATUSES` do service). `listShipmentContracts` (`/sale-contracts/shipments`) segue vivo e testado, **sem consumidor de UI** — destino na RC-F3.

- **Quem tem embarque ("Modelo X", EMB22):** não há campo de data próprio — o **dia previsto do embarque = `invoiceDate`** (mover um move o outro); **atrasado** = `invoiceDate` passou sem embarque. **Sem `invoiceDate`** ("À definir" no FUTURO — D144, revisa a EMB22): o contrato era "à definir" na fila — sempre `a_embarcar` (nunca atrasado), no fim do grupo em **ordem de emissão** (`contractSeq`), e **sem evento no calendário** até a data ser definida. _(A fila em si não tem mais tela; a regra continua valendo no endpoint e no calendário.)_
- **Flag `requiresShipment` (EMB21):** vem da **modalidade** (`ContractModality` tem um flag, semeado: Retirar/Posto = `true`, Disponível = `false`) e é **snapshotado** em `SaleContract.requiresShipment` na emissão — **congelado**: o Editar só re-deriva se a **modalidade do contrato mudar** ali (EMB32; um flip posterior da flag da modalidade não vaza pra contratos antigos).
- **Estados derivados** (no endpoint da worklist): **a embarcar** / **atrasado** / **embarcado** / **cancelado**.
- **Confirmação (EMB27):** **fotos opcionais 0–10** (JPEG/PNG/WebP, 12 MiB — valida magic bytes no servidor **e recusa >12 MiB no cliente**, EMB34) + seletor **`shippedAt`** (default no **último dia útil ≤ hoje**, **máx. hoje**, **rejeita fim de semana** → `WEEKEND_DATE`; data em BRT, EMB34). Local do embarque = armazém do vendedor (`sellerWarehouseSnapshot`, EMB29). A confirmação **não incrementa `version`** do contrato. **Transporte (EMB30):** obrigatório — **Pela empresa** (exige um **responsável**: usuário ativo não-PROSPECTOR, escolhido sem pré-seleção; o nome vira snapshot no contrato) ou **Por terceiros** (sem responsável). Transporte + responsável aparecem no Detalhes.
- **Retenção de fotos (EMB31):** as fotos do embarque **expiram em 15 dias** — somem da galeria **e** da URL direta (404), e uma **purga oportunista** (throttled, per-instância no Cloud Run) limpa o disco. No Detalhes, uma galeria vazia passados 15 dias do embarque mostra "não estão mais disponíveis (retenção de 15 dias)" em vez de "sem fotos".
- **Portão no pagamento (EMB28):** não paga um contrato que exige embarque e não embarcou — ver §3.
- **Evento no dashboard:** `contract_shipment` (previsto, azul) / `contract_shipment_done` (realizado) / atraso (vermelho) — **desktop-only**; apresentação em `Dashboard-Visao-Geral.md` §7.3.

---

## 9. Modelo de dados

> Schema em `prisma/schema.prisma`. O event store (`SampleEvent`) é append-only; os logs de contrato abaixo são de auditoria.

- **`SaleContract`** — o contrato: identificação, vínculos, **snapshots** das partes (comprador/vendedor), negócio-financeiro (preço, sacas, ágio), pagamento (`invoiceDate`/`invoicedAt`/`paymentDate`/`paidAt`), flags `requiresApproval`/`requiresShipment`, textos, `status`, `version`. **Invariante `type ⟺ vínculo de lote`** (D147, CHECK `chk_sale_contract_type_lote`): à vista tem `sampleId`+`movementId` (1:1 com a venda); futuro tem os dois **nulos** e nunca ganha lote. O washout ramifica por `type` (`isFutureContract`), alinhado ao Financeiro/Espelho.
- **`SaleContractBroker`** (corretagem por lado) · **`SaleContractExport`** (dados de exportação).
- **Lookups:** `ContractModality` (com o flag de embarque) · `PaymentForm` · `Packaging`.
- **Cadastro que o contrato exige (Fase 0):** `ClientBankAccount` (banco em **texto livre** `bankName` — entidade `Bank` e COMPE removidos na D141; snapshots de contratos emitidos preservam o código congelado) · `ClientAttachment` (anexos, JPEG/PNG/WebP+PDF) · `Broker` · `birthDate` no cliente.
- **Logs/filas:** `SaleContractStatusLog` (marcos de status) · `SaleContractAgioLog` (cada aplicação de ágio/deságio) · `SaleContractEspelhoLog` (espelho) · `approval_label_log`/`ApprovalLabelLog` (envios de aprovação) · `SaleContractShipmentPhoto` (fotos de embarque) · `CustomPrintJob` (fila da etiqueta de aprovação).
- **Enums:** status (`EMITIDO`/`FATURADO`/`PAGO`/`WASH_OUT`) e os demais do domínio.

_(O `Arquitetura-Tecnica.md` resume o domínio na seção "Modelo de dados" → "Domínio de contratos"; o detalhe funcional é este doc.)_

---

## 10. Rotas de API

> `GET`/`POST` sob `app/api/v1/`; handlers em `src/api/v1/backend-api.js`, implementação em `src/sale-contracts/sale-contract-service.js`. PROSPECTOR barrado pelo allowlist central.

- **Contrato (CRUD/ciclo):** `/sale-contracts` (lista + criação), `/sale-contracts/next-number` (preview do número), `/sale-contracts/[id]` (detalhe) e `/sale-contracts/[id]/{emit, invoice, pay, washout, apply-agio, approval-flag, timeline}` — as mutações do ciclo de §3. No create/emit, `invoiceDate`/`paymentDate` aceitam `null` explícito ("À definir") **só quando o contrato é FUTURO** (D144; à vista → 422).
- **Documentos:** `/sale-contracts/[id]/pdf` (contrato) e `/sale-contracts/[id]/espelho/{pdf, log}` (espelho + auditoria de export).
- **Embarque:** `/sale-contracts/shipments` (worklist — **sem consumidor de UI** desde a RC-F4), `/sale-contracts/[id]/{shipment-context, shipment-confirmation}` e `/sale-contracts/[id]/shipment-photos[/[photoId]]` (galeria + binário autenticado).
- **Aprovação:** `/sale-contracts/approvals` (worklist — **sem consumidor de UI** desde a RC-F4) e `/approval-labels` (gerar/enviar etiqueta; o sub-route `/approval-labels/contracts/[id]/prefill` monta a etiqueta a partir do contrato). _(O picker `/approval-labels/contracts` foi removido na AP32; a rota `/sale-contracts/approvals/recent-sends` foi **apagada** na RC-D26, com o card que a consumia.)_
- **Lookups:** `/contract-lookups` (modalidade/forma de pagamento/embalagem). Criar valores das listas de apoio é gated por `CONTRACT_LOOKUP_MANAGE_ROLES` (= `NON_PROSPECTOR_ROLES` desde 2026-07-15 — antes ADMIN-only).
- **Financeiro:** `/financeiro` (lista de todos os fechamentos; o pagar é `/sale-contracts/[id]/pay`).
- **Anexos do cliente (Fase 0):** rotas de `ClientAttachment` (D27/D139).
- **Eventos no dashboard** (leitura): `/dashboard/{payment,shipment,invoice}-events` — detalhados no `Dashboard-Visao-Geral.md` §8.

---

## 11. Fronteiras — o que vive fora deste doc

- **Dashboard** (`Dashboard-Visao-Geral.md`): o card de **Eventos** e o card de **Avisos** (os 2 cards do dashboard). Desde a **RC-D23**, **todo** chip do calendário e **todo** item de Avisos deep-linka `/contratos?details=<id>&highlight=<id>` — não há mais mapa aba→rota (`contractsHubTabs`/`contractTabRoute` foram apagados) nem chip inerte por papel (a DSB-D11 perdeu o objeto). Os feeds `payment/shipment/invoice-events` estão no §8 de lá; o de **pagamento** é gateado por `PAYMENT_FEED_ROLES`, não pelo `FINANCEIRO_ROLES` (RC-D5). Qualquer mudança de rota ou no enum de status **obriga a atualizar lá**.
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
- Modais: `SaleContractEtapa2Modal`, `SaleContractDetailsModal`, `SaleContractLifecycleDialog`, `EspelhoCorretagemModal`, `EspelhoConferenciaModal`, `ApprovalLabelModal`, `ShipmentConfirmationModal` — os **2 últimos abrem de dentro do Detalhes** (RC-D25)
- `components/AppShell.tsx` — os 2 itens de nav (Contratos + Financeiro) na sidenav desktop, sem sub-itens, e **Contratos na tabbar mobile** (`MOBILE_NAV_ITEMS`) / `components/HeaderAvatarMenu.tsx` — só Financeiro (Contratos saiu do menu quando virou aba)
- `lib/roles.ts` — `NON_PROSPECTOR_ROLES`, `CONTRATOS_ROLES`, `FINANCEIRO_ROLES` (= ADMIN), `PAYMENT_FEED_ROLES`
- `lib/currency.ts`, `lib/types.ts`

**Backend**

- `src/sale-contracts/sale-contract-service.js` — emit/invoice/pay/washout + Financeiro + worklists (aprovação/embarque) + feeds de evento
- `src/sale-contracts/sale-contract-support.js` — normalizações, selects, builders de evento
- `src/sale-contracts/sale-contract-pdf-service.js` + `issuer-config.js` — PDF do contrato/espelho
- `src/sale-contracts/SaleContractShipmentService` — embarque (fotos, confirmação)
- `prisma/schema.prisma` — modelos e enums de §9

---

## 13. Estado de validação

Contrato à vista + futuro, a reforma de Aprovações ("o portão", AP1–AP30), o Embarque (EMB1–EMB34) e agora a **RC-F1 + RC-F4** (`/contratos` página única + `/financeiro` ADMIN-only + `/embarques` extinta, RC-D21..D26) foram **implementados ponta a ponta**, com gates verdes (lint/format/typecheck/unit/contracts) — mas **em `main`, não pushados**, e **aguardando conferência no dev local e validação no device** (ver `Contratos-Plano-de-Trabalho.md` §5.9). Este documento descreve o comportamento **do código**; divergências observadas no device viram achados no plano de trabalho.
