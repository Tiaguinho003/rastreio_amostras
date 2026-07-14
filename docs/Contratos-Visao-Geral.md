# Contratos — Visão Geral

Status: Ativo (documento-mãe / verdade viva do funcionamento atual)
Escopo: o que a página `/contratos` faz hoje — a casca (hub + sub-abas + acesso por papel), o contrato de compra e venda ("Fechamento" → PDF), o Espelho de Corretagem, as abas **Financeiro**, **Aprovações** e **Embarque**, a **máquina de estado** do contrato com seus portões, o modelo de dados e as rotas de API.
Última revisão: 2026-07-14 (D144 — datas planejadas "À definir" em contratos FUTUROS: form, worklists, calendário, PDF)
Documentos relacionados: `Contratos-Plano-de-Trabalho.md` (backlog, decisões e pendências), `Dashboard-Visao-Geral.md` (eventos/cards que apontam pra cá), `Auditoria-Navegacao-por-Papel.md`, `API-e-Contratos.md`, `Produto-e-Fluxos.md`

> **Como este documento se mantém vivo:** a cada implementação concluída e validada, esta Visão Geral é atualizada no mesmo passo. As **decisões, o histórico e o backlog** vivem no `Contratos-Plano-de-Trabalho.md`; aqui fica **só o estado atual**. Esta consolidação (2026-07-13, 4→2 docs) absorveu e removeu os antigos `Central-de-Contratos-`, `Aprovacoes-` e `Embarque-Plano-de-Trabalho.md` — o histórico completo de decisões (D/CC/AP/EMB) e de sessões está no Git e, condensado, no apêndice do `Contratos-Plano-de-Trabalho.md`.

---

## 1. Propósito e quem usa

O contrato de compra e venda de café é operado em **2 páginas** (split 2026-07-13), ao longo do eixo **gestão × operação** — cada uma com 2 sub-abas:

- **`/contratos`** — a **gestão** (ADMIN + COMMERCIAL): aba **Contratos** (o contrato nasce, vira PDF, ágio, ciclo de vida + o **Espelho de Corretagem**) + aba **Financeiro** (corretagem a receber / pagamento por fechamento).
- **`/embarques`** — a **operação** (todos os não-PROSPECTOR): aba **Embarque** (confirmação do café no caminhão) + aba **Aprovações** (o "portão" de aval antes de faturar).

Um contrato passa pelas duas páginas no ciclo: nasce e é gerido em `/contratos`; é aprovado e embarcado em `/embarques`; faturado/pago de volta em `/contratos` (Financeiro). **ADMIN/COMMERCIAL** abrem as 2 páginas; os **operacionais** (Classificação/Impressão/Cadastro) só a de **Embarques**.

---

## 2. A casca — hub, sub-abas e acesso

> Autoridade da casca (2 páginas irmãs). Código: `app/contratos/page.tsx`, `app/embarques/page.tsx`, `app/financeiro/page.tsx` (redirect), `lib/roles.ts`, `components/AppShell.tsx`, `components/HeaderAvatarMenu.tsx`.

### 2.1 Rotas e esquema de URL

- **`/contratos`** (Contratos + Financeiro) e **`/embarques`** (Embarque + Aprovações) — 2 páginas irmãs com a mesma casca. A antiga **`/financeiro`** redireciona para `/contratos?tab=financeiro`.
- Aba ativa pelo query **`?tab=`**: `/contratos` ∈ `contratos | financeiro` (default **`contratos`**); `/embarques` ∈ `embarque | aprovacoes` (default **`embarque`**).
- **Compat:** os deep-links antigos `/contratos?tab=embarque|aprovacoes` **redirecionam** para `/embarques?tab=…` (preservando `&highlight=`).
- Coexiste com **`?details=<id>`** (modal de detalhes do contrato, na aba Contratos) e **`?highlight=<id>`** (pisca/rola até o contrato — chips do card de Eventos, via `useContractHighlight`).
- Mecânica de abas reusa o `role="tablist"` do `/cadastros`; cada aba é um **painel** (`ContratosPanel`/`FinanceiroPanel` em /contratos; `EmbarquePanel`/`AprovacoesPanel` em /embarques).
- **Nav:** **2 itens** — "Contratos" (`/contratos`) e "Embarques" (`/embarques`) — na sidenav desktop (DSB-D15) + menu do avatar mobile.

### 2.2 Acesso por papel

Fonte da verdade: `lib/roles.ts` (`NON_PROSPECTOR_ROLES`, `CONTRATOS_ROLES`, `contractsHubTabs`, `contractTabRoute`), espelhando `SALE_CONTRACT_ACCESS_ROLES`/`FINANCEIRO_ROLES` do backend.

| Papel        | `/contratos` (Contratos·Financeiro) | `/embarques` (Embarque·Aprovações) | Itens de nav          |
| ------------ | :---------------------------------: | :--------------------------------: | --------------------- |
| ADMIN        |                 ✅                  |                 ✅                 | Contratos + Embarques |
| COMMERCIAL   |             ✅ (todos)              |                 ✅                 | Contratos + Embarques |
| CLASSIFIER   |                  —                  |                 ✅                 | Embarques             |
| REGISTRATION |                  —                  |                 ✅                 | Embarques             |
| CADASTRO     |                  —                  |                 ✅                 | Embarques             |
| PROSPECTOR   |                  —                  |                 —                  | (nenhum)              |

Regras que geram a matriz (split 2026-07-13):

- **`/contratos` = `CONTRATOS_ROLES` (ADMIN + COMMERCIAL)** — a gestão. Operacionais são redirecionados pelo guard (→ /dashboard).
- **`/embarques` = `NON_PROSPECTOR_ROLES`** — a operação, a todos menos o PROSPECTOR (barrado pelo allowlist + guard).
- **Escopo aberto (2026-07-13, own-only revogado — D140):** ADMIN e COMMERCIAL veem/gerenciam **TODOS** os contratos e o Financeiro (não há mais recorte por `Broker.userId`). Na aba **Aprovações** a **lista** já era **não-escopada** (todos veem todos — só colunas não-sensíveis), e o **"Ver contrato"** das worklists (que abre o detalhe em `/contratos`) abre a **ADMIN + COMMERCIAL em qualquer contrato**.

> ⚠️ **Alívio de UI vs. segurança:** não há mais recorte por corretor — ADMIN e COMMERCIAL enxergam Contratos/Financeiro/pagamento por inteiro (escopo aberto — D140). A fronteira de papel **real** segue sendo o **allowlist do PROSPECTOR** somado ao guard `CONTRATOS_ROLES`: os papéis operacionais (Classificação/Impressão/Cadastro) **não acessam** Contratos/Financeiro. A página de operação (`/embarques`) é **auth-only** — qualquer não-PROSPECTOR autenticado enxerga as worklists (info não-sensível).

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
- **WASH_OUT** — `washoutSaleContract` cancela/desfaz o negócio; **isento dos portões**. Não há "Desfazer" de status (D122).

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

## 4. Aba Contratos — o contrato de compra e venda

> Código: `SaleContractCard`, `SaleContractEtapa2Modal`, `SaleContractDetailsModal`, `SaleContractLifecycleDialog`; `src/sale-contracts/sale-contract-service.js`, `sale-contract-pdf-service.js`, `issuer-config.js`. Mercados **à vista** e **futuro** funcionam ponta a ponta.

### 4.1 Da venda ao PDF (Etapa 1 → Etapa 2)

- **Entrada:** o FAB radial da aba (`ContractCreateRadialFab`) oferece os 2 mercados. **À vista:** escolher o lote com saldo (`SaleContractLotPickerModal`) → Etapa 2 em modo _spot_ — venda + contrato nascem **atômicos** (D97), já EMITIDO. **Futuro:** Etapa 2 direto, sem lote/venda; as datas planejadas de faturamento/pagamento podem nascer **"À definir"** (checkbox por campo — D144) e ser definidas (ou revertidas) no Editar.
- **Etapa 1 (Venda):** a venda origina os dados do contrato (partes, produto, quantidade em sacas, preço, modalidade, prazos). As partes entram como **snapshots** no contrato (não referência viva) para o PDF ser fiel ao momento.
- **Etapa 2 (Geração):** o modal de geração completa/valida os campos que faltam e **emite** o contrato (→ EMITIDO), gerando o **PDF** para impressão. Campos têm origem/obrigatoriedade/validação próprias (detalhe no código + os limites de data em §3).
- **Editar (re-emissão):** só age sobre `EMITIDO`. No contrato à vista, o Editar sincroniza dono da amostra e venda **antes** da transação do contrato — passo **não-atômico por decisão** (D143): a janela de corrida é minúscula e, num 409 de concorrência, os syncs são idempotentes e **convergem no retry**.

### 4.2 Modelo financeiro (ágio + corretagem)

- **Total = `unitPrice × sacks ± ágio`.** O **ágio/deságio** é armazenado em **R$ por saca** e somado/subtraído no total (`computeContractMoneyWithAgio`). Os botões de **Ágio/Deságio** ficam no **modal de Detalhes** do contrato (D121).
- **Corretagem por lado = `Total × %`** (compra e venda têm percentuais próprios; `SaleContractBroker`).

### 4.3 PDF e Detalhes

- **PDF** gerado com `pdf-lib` a partir de um layout fixo (D111) e do `issuer-config` (dados da emitente).
- **Modal de Detalhes** (`SaleContractDetailsModal`): visão completa do contrato + **timeline** (`/sale-contracts/[id]/timeline`) + ações (ágio, toggle de aprovação — §7). A matriz de qual ação aparece no **card** vs no **modal** é fixada por D121/D126/D137.

---

## 5. Espelho de Corretagem

> Segundo documento gerado a partir do contrato. Código: `EspelhoCorretagemModal`, `EspelhoConferenciaModal`; `SaleContractEspelhoLog`.

- **O que é:** o espelho da corretagem — mapeia campos do contrato para um PDF de 9 colunas (origem de cada campo documentada no código).
- **Elegibilidade:** contratos em `EMITIDO/FATURADO/PAGO/WASH_OUT` **com corretagem no lado**; sem corretagem → bloqueado (`ESPELHO_NO_BROKERAGE`).
- **Conferência (D134):** fluxo de conferência antes de imprimir (registra em `SaleContractEspelhoLog`).

---

## 6. Aba Financeiro

> A corretagem a receber por fechamento. Código: `FinanceiroPanel`/`FinanceiroCard`; `app/api/v1/financeiro`, `sale-contract-service.js`. Acesso: `FINANCEIRO_ROLES` (ADMIN + COMMERCIAL, escopo aberto).

- **Estado de pagamento** por contrato (a receber / N vencidos / pago), com os cálculos de corretagem e ágio de §4.2. Sem `paymentDate` ("À definir" no FUTURO, D144) o contrato é **sempre "a vencer"** (nunca vencido), no fim da fila, e o card exibe **"À definir"**.
- **Escopo:** ADMIN e COMMERCIAL veem **tudo** (escopo aberto — D140 revogou o own-only, superando D135/D128).
- **Sem rateio ÷N** (D136): o valor exibido é o do fechamento, não dividido.
- **Botão "Pago"** mora **aqui** (D137) — é o ponto de disparo da transição → PAGO (com o portão de embarque de §3/§8).
- **Ordenação/paginação:** keyset/cursor particionado (por estado de pagamento; vencidos primeiro).

---

## 7. Aba Aprovações ("o portão")

> A worklist do aval de aprovação. Código: `AprovacoesPanel`/`AprovacaoCard`, `ApprovalLabelModal`; `listApprovalContracts`, `setSaleContractApprovalFlag`, `sendApprovalLabel`; tabelas `approval_label_log` + `CustomPrintJob`.

**O modelo ("o portão"):** aprovação não é um estado no contrato — é um **portão de faturamento**. O criador **sinaliza** se o contrato precisa de aval (`requiresApproval`); quando precisa, alguém **gera/envia a etiqueta de aprovação** (impressa, auditada em `approval_label_log`); e **faturar fica bloqueado até ≥1 etiqueta enviada** (§3, AP18). O portão audita o **envio** (enqueue no `CustomPrintJob` + linha no log), **não o sucesso da impressão** — decisão deliberada: exigir impressão concluída deixaria o faturamento refém do print agent local.

- **Estados derivados** (sem enum próprio): **não se aplica** / **a enviar** / **enviada** / **cancelado** (no washout). O **desfecho** (aprovado/recusado) fica **fora do sistema**; o **proxy** é o **nº de envios** (>1 envio antes de faturar ≈ provável recusa; "enviada · N×").
- **Sinalização:** `requiresApproval` marcado na emissão ou por **toggle** no modal de Detalhes (`setSaleContractApprovalFlag`, ADMIN/COMMERCIAL). **Desmarcar** só em `EMITIDO` sem envio; depois **trava** em "Sim" (`APPROVAL_FLAG_LOCKED`) — AP20.
- **Gerar etiqueta exige `requiresApproval = true`** (`APPROVAL_CONTRACT_NOT_MARKED`, AP17); elegibilidade = **só `EMITIDO`** (`APPROVAL_ELIGIBLE_STATUSES`, AP21). **A geração mora só nesta sub-aba** (AP29 — não há mais porta no `/samples` nem etiqueta avulsa).
- **Worklist:** particionada por estado (a enviar / enviada), via `$queryRaw` (G0/G1/G2) com cursor `{g, key, seq}` porque o estado depende de um agregado de contagem do log. Colunas não-sensíveis; abre em "a enviar". Ordena por `invoice_date ASC NULLS LAST` — faturamento "à definir" (D144) vai pro fim da fila e o card mostra **"À definir"** (sem o `~` de previsão).

> O **lembrete de aprovação no dashboard** (data "a enviar") foi **removido** (DSB-D9) — a data não era exata. O card **"Aprovações enviadas"** saiu do dashboard e mora **no topo desta sub-aba** desde **DSB-D14 (2026-07-14)**: visão rápida dos últimos envios (top-40, desktop-only, `RecentSendsCard`; dado de `GET /sale-contracts/approvals/recent-sends`; refetch após gerar etiqueta aqui). A worklist (filtro "Enviadas") segue sendo a lista completa. O campo `approvalReminderLeadDays` segue **vivo como input**: é obrigatório no form quando `requiresApproval` (1–365, default 30) e gravado na criação/edição e no toggle (AP23) — o que foi removido (DSB-D9) é só o **consumidor do lembrete** que usava o valor.

---

## 8. Aba Embarque

> A confirmação do café no caminhão + o evento no dashboard. Código: `EmbarquePanel`/`EmbarqueCard`, `ShipmentConfirmationModal`; `SaleContractShipmentService`, `saveContractShipmentPhoto`, `listShipmentContracts`, `getDashboardShipmentEvents`; tabela `SaleContractShipmentPhoto`.

- **Quem tem embarque ("Modelo X", EMB22):** não há campo de data próprio — o **dia previsto do embarque = `invoiceDate`** (mover um move o outro); **atrasado** = `invoiceDate` passou sem embarque. **Sem `invoiceDate`** ("À definir" no FUTURO — D144, revisa a EMB22): o contrato **entra na fila** como "à definir" — sempre `a_embarcar` (nunca atrasado, não conta no contador de atrasados), no fim do grupo em **ordem de emissão** (`contractSeq`), e **sem evento no calendário** até a data ser definida.
- **Flag `requiresShipment` (EMB21):** vem da **modalidade** (`ContractModality` tem um flag, semeado: Retirar/Posto = `true`, Disponível = `false`) e é **snapshotado** em `SaleContract.requiresShipment` na emissão.
- **Estados da worklist** (derivados): **a embarcar** / **atrasado** / **embarcado** / **cancelado**.
- **Confirmação (EMB27):** **fotos opcionais 0–10** (JPEG/PNG/WebP, 12 MiB — valida magic bytes) + seletor **`shippedAt`** (default hoje, **máx. hoje**, **rejeita fim de semana** → `WEEKEND_DATE`). Local do embarque = armazém do vendedor (`sellerWarehouseSnapshot`, EMB29). A confirmação **não incrementa `version`** do contrato.
- **Portão no pagamento (EMB28):** não paga um contrato que exige embarque e não embarcou — ver §3.
- **Evento no dashboard:** `contract_shipment` (previsto, azul) / `contract_shipment_done` (realizado) / atraso (vermelho) — **desktop-only**; apresentação em `Dashboard-Visao-Geral.md` §7.3.

---

## 9. Modelo de dados

> Schema em `prisma/schema.prisma`. O event store (`SampleEvent`) é append-only; os logs de contrato abaixo são de auditoria.

- **`SaleContract`** — o contrato: identificação, vínculos, **snapshots** das partes (comprador/vendedor), negócio-financeiro (preço, sacas, ágio), pagamento (`invoiceDate`/`invoicedAt`/`paymentDate`/`paidAt`), flags `requiresApproval`/`requiresShipment`, textos, `status`, `version`.
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
- **Embarque:** `/sale-contracts/shipments` (worklist), `/sale-contracts/[id]/{shipment-context, shipment-confirmation}` e `/sale-contracts/[id]/shipment-photos[/[photoId]]` (galeria + binário autenticado).
- **Aprovação:** `/sale-contracts/approvals` (worklist), `/sale-contracts/approvals/recent-sends` (card do topo) e `/approval-labels` (gerar/enviar etiqueta; `/approval-labels/contracts*` é o resquício do picker aposentado pela AP29 — dormente).
- **Lookups:** `/contract-lookups` (modalidade/forma de pagamento/embalagem).
- **Financeiro:** `/financeiro` (lista de todos os fechamentos; o pagar é `/sale-contracts/[id]/pay`).
- **Anexos do cliente (Fase 0):** rotas de `ClientAttachment` (D27/D139).
- **Eventos no dashboard** (leitura): `/dashboard/{payment,shipment,invoice}-events` — detalhados no `Dashboard-Visao-Geral.md` §8.

---

## 11. Fronteiras — o que vive fora deste doc

- **Dashboard** (`Dashboard-Visao-Geral.md`): o card de **Eventos** (único card do dashboard desde DSB-D14) e seus chips que deep-linkam `/contratos?tab=…` (pagamento/faturamento) e `/embarques?tab=embarque` (embarque), com `&highlight=` (§7.3), e os feeds `payment/shipment/invoice-events` (§8). _(O card "Aprovações enviadas" saiu do dashboard e mora na sub-aba Aprovações — ver §7 deste doc.)_ Qualquer mudança em rota, nome de aba, valores de `?tab=` ou no enum de status **obriga a atualizar lá** (`contractTabRoute` mapeia aba→rota).
- **Navegação por papel** (`Auditoria-Navegacao-por-Papel.md`): o mapa read-only de quem acessa o hub — **aponta para este doc** como dono da matriz de acesso.
- **API** (`API-e-Contratos.md`): a referência canônica de rotas/contratos de request-response de **amostras, clientes, usuários e informes** — as rotas de contrato vivem em **§10 deste doc** (lista única, sem duplicação fadada a derivar).
- **Cadastro de cliente** (`Clientes-e-Movimentacoes-Especificacao.md`): contas bancárias/anexos que o contrato consome.

---

## 12. Mapa de arquivos

**Frontend**

- `app/contratos/page.tsx` — página de **gestão** (abas Contratos + Financeiro, `?tab=`, guard `CONTRATOS_ROLES`, redirect de compat → /embarques)
- `app/embarques/page.tsx` — página de **operação** (abas Embarque + Aprovações, guard `NON_PROSPECTOR_ROLES`, abre em Embarque)
- `app/financeiro/page.tsx` — redirect → `/contratos?tab=financeiro`
- `components/contracts/*` — `ContratosPanel`, `AprovacoesPanel`, `EmbarquePanel` + os cards (`SaleContractCard`, `AprovacaoCard`, `EmbarqueCard`); `components/financeiro/*` — `FinanceiroPanel`, `FinanceiroCard`
- Modais: `SaleContractEtapa2Modal`, `SaleContractDetailsModal`, `SaleContractLifecycleDialog`, `EspelhoCorretagemModal`, `EspelhoConferenciaModal`, `ApprovalLabelModal`, `ShipmentConfirmationModal`
- `components/AppShell.tsx` / `components/HeaderAvatarMenu.tsx` — os 2 itens de nav (Contratos + Embarques)
- `lib/roles.ts` — `NON_PROSPECTOR_ROLES`, `CONTRATOS_ROLES`, `FINANCEIRO_ROLES`, `contractsHubTabs`, `contractTabRoute`
- `lib/currency.ts`, `lib/types.ts`

**Backend**

- `src/sale-contracts/sale-contract-service.js` — emit/invoice/pay/washout + Financeiro + worklists (aprovação/embarque) + feeds de evento
- `src/sale-contracts/sale-contract-support.js` — normalizações, selects, builders de evento
- `src/sale-contracts/sale-contract-pdf-service.js` + `issuer-config.js` — PDF do contrato/espelho
- `src/sale-contracts/SaleContractShipmentService` — embarque (fotos, confirmação)
- `prisma/schema.prisma` — modelos e enums de §9

---

## 13. Estado de validação

Contrato à vista + futuro, as **2 páginas** (`/contratos` gestão + `/embarques` operação — split 2026-07-13), a reforma de Aprovações ("o portão", AP1–AP30) e o Embarque (EMB1–EMB29) foram **implementados ponta a ponta**, com gates verdes (lint/format/typecheck/unit/build) — mas **em `main`, não pushados**, e **aguardando validação no device** (ver `Contratos-Plano-de-Trabalho.md`). Este documento descreve o comportamento **do código**; divergências observadas no device viram achados no plano de trabalho.
