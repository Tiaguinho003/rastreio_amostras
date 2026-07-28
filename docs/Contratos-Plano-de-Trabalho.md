# Contratos — Plano de Trabalho

Status: Em andamento (backlog + decisões + pendências da página `/contratos`)
Escopo: o backlog, as pendências e o **ledger de decisões** da feature de Contratos (hub `/contratos`: contrato/PDF, Espelho de Corretagem, Financeiro, Aprovações, Embarque). O **estado atual** do que existe vive em `Contratos-Visao-Geral.md`; aqui ficam as decisões (o porquê), as pendências abertas e o histórico condensado.
Última revisão: 2026-07-27 (**§5.9 — RC-F1+F4 IMPLEMENTADAS**: `/financeiro` é página própria ADMIN, `/contratos` é página única, `/embarques` foi extinta. Antes, no mesmo dia: §5 ledger RC e §5.8 fluxo de criação. Anterior: 2026-07-14, D146 — cascata contrato-à-vista → lote/venda)
Documentos relacionados: `Contratos-Visao-Geral.md` (documento-mãe / estado atual), `Dashboard-Visao-Geral.md`, `API-e-Contratos.md`, `Auditoria-Navegacao-por-Papel.md`

> **Divisão de papéis:** a `Contratos-Visao-Geral.md` é a **verdade viva** (o que existe hoje). Este plano guarda **decisões (por quê), pendências (o que falta) e o backlog**. O histórico completo de sessões (S1–S91 etc.) e a prosa superada foram para o **Git** (docs antigos removidos em 2026-07-13); o ledger no apêndice condensa cada decisão à resolução final.

---

## 1. Estado geral

Contrato à vista + futuro, o hub com 4 sub-abas (Central F1/F2), a reforma de Aprovações ("o portão", AP1–AP30) e o Embarque (EMB1–EMB34, incluindo a **FASE 2 EMB30/EMB31** — transporte/responsável + retenção de fotos 15d, migration `20260716120000`) estão **implementados ponta a ponta** — gates verdes (lint/format/typecheck/unit/integração) — em `main`, **não pushados**, **aguardando validação no device**.

> **Split 2026-07-13 + ACESSO UNIFICADO 2026-07-15:** o hub `/contratos` virou **2 páginas** — `/contratos` (Contratos + Financeiro, gestão) e `/embarques` (Embarque + Aprovações, operação). Desde 2026-07-15 **ambas abertas a todo não-PROSPECTOR** (`CONTRATOS_ROLES`/`FINANCEIRO_ROLES` = `NON_PROSPECTOR_ROLES`; a gestão era ADMIN+COMMERCIAL). O ledger histórico abaixo (D110/D135/D140, CC6, AP9/AP27, EMB26) descreve os gates **da época** — a fonte do estado atual é `Contratos-Visao-Geral.md` §2.

> ⚠️ **A §5 (RC, 2026-07-27) reorganizou esta casca.** A **primeira parte já está no código** (§5.9: `/financeiro` é página própria ADMIN, `/contratos` é página única sem sub-abas, `/embarques` é redirect e os painéis dela foram apagados). O que **ainda não** está: as fases desenhadas dentro do contrato (RC-F2), a lista virando worklist (RC-F3), a criação repensada (RC-F5) e o ciclo FV (RC-F6). O parágrafo acima descreve a casca **anterior** — a atual está na §5.9.

## 2. Pendências abertas

- **P27 — Layout e design das páginas de Contrato** (Fase G): **ENDEREÇADA pela §5 (RC)** desde 2026-07-27. A parte de _disposição das páginas_ virou o ledger RC-D1..D12; a parte de _layout e design_ é a **RC-F6** (ciclo FV), que só começa depois de as páginas estarem organizadas — ordem pedida pelo Flavio.
- **P28 — Gestão das 3 listas cadastráveis** (Modalidade / Forma de pagamento / Embalagem): renomear / inativar / reordenar (`sortOrder`) — adiada (D95; hoje só existe "+ Adicionar").
- **AP-P2 — Estado "atrasado" na Aprovação**: adiado como feature futura (sem data-limite exata; fácil no Embarque via `invoiceDate`, delicado na Aprovação). Por ora só "pendente".
- **Validação no device:** todo o fluxo acima (à vista/futuro, hub, portão de aprovação, embarque) precisa do ✅ no aparelho.
- **Build:** `next dev` ativo → o build fica para a validação no device.

## 3. Dívidas / fora do escopo desta consolidação

- ~~**`Arquitetura-Tecnica.md`** não documenta o domínio `SaleContract` na seção "Modelo de dados"~~ — **resolvida 2026-07-14**: seção "Domínio de contratos (Fechamento)" adicionada (o detalhe funcional segue em `Contratos-Visao-Geral.md` §9).

## 4. Consolidação da documentação (2026-07-13)

**4 docs → 2**, espelhando o dashboard (DSB-D1). A `Contratos-Visao-Geral.md` (mãe) absorveu o estado atual; este plano guarda o backlog + o ledger. Removidos (histórico no Git):

- `Central-de-Contratos-Plano-de-Trabalho.md` (casca → mãe §2; ledger **CC** abaixo)
- `Aprovacoes-Plano-de-Trabalho.md` (→ mãe §7; ledger **AP** abaixo)
- `Embarque-Plano-de-Trabalho.md` (→ mãe §8; ledger **EMB** abaixo)

Orla ajustada no mesmo passo: `README.md` (par mãe+plano no índice), `Auditoria-Navegacao-por-Papel.md` (ponteiro), skill `prisma` e os comentários em `app/contratos/page.tsx` / `app/financeiro/page.tsx`.

---

## 5. Reorganização por fases (RC) — 2026-07-27

> **Frente ATIVA.** Endereça a **P27** e destrava o ciclo `Shell-e-Navegacao-Plano-de-Trabalho.md` (§5.1, cujas linhas `/contratos` e `/embarques` estavam "a decidir"). Nada implementado ainda — este bloco é o ledger da decisão, escrito antes do código, no rito de sempre.

### 5.1 O problema

Quatro superfícies operam o contrato hoje, em 2 páginas × 2 sub-abas: `/contratos` (Contratos · Financeiro) e `/embarques` (Embarque · Aprovações). O alvo do Flavio: **menos páginas** e **o processo de venda visível fase a fase dentro do próprio contrato**.

Três fatos reenquadram o trabalho:

1. **O split de 2026-07-13 já não separa nada.** Ele nasceu no eixo gestão × operação para separar _quem via o quê_ (gestão = ADMIN+COMMERCIAL, operação = todos — CC6/CC15). O **acesso unificado de 2026-07-15** abriu as quatro abas aos cinco papéis não-PROSPECTOR e igualou os gates. A forma sobreviveu à função.
2. **Nada disso existe em produção.** Contratos, Financeiro, Aprovações e Embarque nunca tocaram dado real (ver `project_deploy_backlog_2026_07`). Sem migração de dados, sem hábito de usuário, sem deep-link externo salvo — o custo de reorganizar é só código.
3. **A informação já é derivável.** Aprovação e embarque **nunca foram estados** do contrato: são portões (AP18, EMB28) sobre campos que o contrato já carrega. Mostrar fase a fase não pede modelo novo.

### 5.2 Decisões (ledger RC)

| #         | Decisão                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D1** | `/contratos` perde as sub-abas e vira **página única**; **`/financeiro` vira página própria** (hoje é redirect). Derruba a casca inteira do hub: **CC3** (redirect), **CC10** (item de nav único — o `FINANCEIRO_NAV_ITEM` volta), **CC4** (o `?tab=` de `/contratos`), **CC8/CC9** (ordem e default das abas) e o resto da **CC15**. **CC1** permanece: `/contratos` segue sendo a rota do contrato. |
| **RC-D2** | **`/embarques` morre** — a rota vira redirect → `/contratos`, no padrão que o repo já usa em `/financeiro`, `/samples/[id]` e `/clients/[id]`.                                                                                                                                                                                                                                                        |
| **RC-D3** | Acesso: **Contratos = os 5 não-PROSPECTOR** (inalterado); **Financeiro = ADMIN**. Seria a **primeira** rota ADMIN-only do domínio — hoje nenhuma é.                                                                                                                                                                                                                                                   |
| **RC-D4** | **Dinheiro continua visível a todos dentro do contrato.** O gate é de **rota, não de campo**: o backend segue devolvendo os valores; o ADMIN-only protege só a carteira.                                                                                                                                                                                                                              |
| **RC-D5** | **`FINANCEIRO_ROLES` se parte em dois**: carteira (ADMIN) × feeds de calendário (não-PROSPECTOR). Sem isso, 4 dos 5 papéis perderiam o pagamento no calendário do dashboard.                                                                                                                                                                                                                          |
| **RC-D6** | **"Pagar" migra** do card do Financeiro para a fase Pagamento do contrato — **revoga a D137**. Sem isso, só o ADMIN fecharia o ciclo do dinheiro.                                                                                                                                                                                                                                                     |
| **RC-D7** | Ordem visual das fases = **operacional**: Emissão → Aprovação → **Embarque** → Faturamento → Pagamento. Contraria a ordem dos portões (embarque trava o PAGO), que segue valendo no backend — o café sobe no caminhão antes de faturar, e a tela conta o que acontece.                                                                                                                                |
| **RC-D8** | A fase é **derivada**, nunca persistida — sem coluna, sem migration, sem trigger. Coerente com a D77 ("o Financeiro é view derivada, sem schema próprio").                                                                                                                                                                                                                                            |
| **RC-D9** | **A lista de contratos absorve as duas worklists**: filtro por fase calculado no servidor, com keyset e contadores estáveis.                                                                                                                                                                                                                                                                          |
| RC-D10    | Decorrência de RC-D1: a **geração da etiqueta de aprovação** passa a morar no contrato — **revoga AP29/CC7** ("a sub-aba é a única porta"). A recuperação inline no portão do faturar (AP18) permanece.                                                                                                                                                                                               |
| RC-D11    | Decorrência de RC-D1: a **confirmação de embarque** passa a morar no contrato — **revoga EMB20/EMB26/CC7** ("a casa do embarque é a sub-aba"). O portão do pagar (EMB28/EMB33) permanece.                                                                                                                                                                                                             |
| RC-D12    | **A criação do contrato entra no escopo** (Etapa 2 + LotPicker) — **reabre a RD11**, que a deixara de fora aguardando specs do Flavio.                                                                                                                                                                                                                                                                |

### 5.3 Em aberto — travam a fase que depende delas

- **RC-A1 — a superfície do contrato.** Painel lateral de 620px (hoje; realinhamento validado em 2026-07-20, RD9/F3), página própria `/contratos/[id]`, ou híbrido. **Trava a RC-F2.** Peso da escolha: o ciclo FV **matou** as páginas de detalhe de lote e cliente em favor do overlay — uma página de contrato seria a exceção, justificada por ser o único detalhe que concentra 5 fases com ação.
- ~~**RC-A2 — o card "Aprovações enviadas"**~~ — **FECHADA em 2026-07-27 pela RC-D26**: morre, e leva o `RecentSendsCard` junto (era o último consumidor vivo dele). Ver §5.9.
- **RC-A3 — o embarque não deixa rastro no histórico.** Nenhuma das 5 tabelas de auditoria registra a confirmação e `buildContractTimeline` não trata o caso — virando fase de primeira classe, o histórico dela fica mudo. Achado desta análise. Opções: linha derivada de `shippedAt` (molde dos marcos legados, D123) ou log próprio.

### 5.4 O modelo de fases

Toda fase é derivada de campos existentes (RC-D8):

| Fase            | Não se aplica       | Pendente              | Concluída    | Derivada de                                 |
| --------------- | ------------------- | --------------------- | ------------ | ------------------------------------------- |
| **Emissão**     | —                   | —                     | sempre       | nasce `EMITIDO` (D97); `SaleContractExport` |
| **Aprovação**   | `!requiresApproval` | a enviar              | enviada (N×) | `count(ApprovalLabelLog)`                   |
| **Embarque**    | `!requiresShipment` | a embarcar / atrasado | embarcado    | `shippedAt`, `invoiceDate` (EMB22)          |
| **Faturamento** | —                   | a faturar / atrasado  | `FATURADO`   | `invoiceDate` / `invoicedAt`                |
| **Pagamento**   | —                   | a pagar / vencido     | `PAGO`       | `paymentDate` / `paidAt`                    |
| **Washout**     | —                   | —                     | `WASH_OUT`   | `washoutAt`, `washoutReason`                |

Os **portões não mudam** (RC-D7 muda só a ordem visual): aprovação segue travando `FATURADO` (422 `CONTRACT_APPROVAL_REQUIRED`, AP18) e embarque segue travando `PAGO` (422 `CONTRACT_SHIPMENT_REQUIRED`, EMB28).

A derivação nasce **função pura compartilhada** front/back, no molde de `deriveApprovalState` / `deriveShipmentState` / `deriveReceivablePaymentState` — que hoje vivem separadas em `sale-contract-support.js` e não se conhecem.

### 5.5 Destino de cada capacidade

| Hoje                                            | Vai para                                                       |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Worklist Embarque (lista, filtros, N atrasados) | lista de `/contratos` com filtro de fase (RC-D9)               |
| Worklist Aprovações (idem, + N a enviar)        | idem                                                           |
| Botão **Confirmar embarque**                    | fase Embarque do contrato (segue também no portão do pagar)    |
| Botão **Gerar etiqueta**                        | fase Aprovação do contrato (segue também no portão do faturar) |
| Botão **Pago**                                  | fase Pagamento do contrato (RC-D6)                             |
| Botão **Faturado**                              | fase Faturamento (já existe no card e no Detalhes)             |
| **Solicitar aprovação** (latch AP32)            | fase Aprovação — já está lá                                    |
| Carteira de corretagem                          | `/financeiro`, ADMIN                                           |
| Card "Aprovações enviadas"                      | **morreu** (RC-D26) — com o `RecentSendsCard` junto ✅         |
| `AvisosCard` → `/embarques?tab=aprovacoes`      | → `/contratos?details=<id>&highlight=<id>` ✅                  |
| Chips do calendário (`contractTabRoute`)        | → `/contratos?details=<id>` p/ TODOS os tipos (RC-D23) ✅      |

### 5.6 Roteiro

**RC-F1 — o Financeiro sai.** ✅ **IMPLEMENTADA em 2026-07-27** (ver §5.9).
Escopo original: `app/financeiro/page.tsx` deixa de ser redirect e vira a página; `FINANCEIRO_ROLES` se parte em dois nos dois lados (`lib/roles.ts:90`, `sale-contract-service.js:73`; **3 consumidores**: `service:152` carteira, `service:647` feed de pagamento, `DashboardDesktop.tsx:49` `canPay`); "Pagar" migra para o contrato; a nav ganha o item — o ícone `'financeiro'` do `NavIcon` (`AppShell.tsx:262`) já existe e está **órfão** desde o split. `/contratos` perde a barra de abas. Sem tocar embarque nem aprovação.

**RC-F2 — as fases entram no contrato.** Depende de **RC-A1**. As duas ações que faltam (`ApprovalLabelModal`, `ShipmentConfirmationModal`) passam a ser alcançáveis do contrato, além dos portões reativos que já as abrem (`SaleContractLifecycleDialog.tsx:284,299`). A derivação de fase nasce como função pura com teste unitário **antes** de qualquer UI.

**RC-F3 — a lista vira worklist.** O maior pedaço de backend. `listSaleContracts` (`service:104`) é reescrito com fase no SQL e keyset particionado, no molde dos três `$queryRaw` que já existem (`listApprovalContracts:472`, `listShipmentContracts:342`, `listBrokerReceivables:150`).

**RC-F4 — `/embarques` morre.** ✅ **IMPLEMENTADA em 2026-07-27, ANTECIPADA** — o roteiro a punha depois da RC-F2, e o Flavio escolheu juntá-la à F1 (RC-D21). Viável porque as duas ações que só a worklist oferecia mudaram de casa no mesmo passo (RC-D25). Ver §5.9. Dependia da RC-A2, fechada pela RC-D26.
Escopo original: Rota vira redirect; `EmbarquePanel`, `AprovacoesPanel`, `EmbarqueCard`, `AprovacaoCard` apagados; deep-links re-apontados (`AvisosCard.tsx:23`, `EventsCalendarCard.tsx:58`, `HeaderAvatarMenu.tsx:168`, `AppShell.tsx:99-126`); `contractsHubTabs`/`contractTabRoute` removidos de `lib/roles.ts`; CSS morto varrido. ⚠️ **No mesmo passo, `Dashboard-Visao-Geral.md`** — a Visão Geral de contratos (§11) obriga a atualizá-la a cada mudança de rota, nome de aba ou valor de `?tab=`, e a RC muda os três.

**RC-F5 — a criação repensada** (RC-D12). 🟡 **1ª rodada IMPLEMENTADA em 2026-07-28** (RC-D27..D36, §5.10): seleção do lote, auto-preenchimento, erro no campo e a conferência pelo documento. **Falta** a RC-D18 (ordem dos campos espelhando o documento + bloco de controle interno) e o redesenho FV do corpo do formulário, que ainda é markup `.app-modal-*`.

**RC-F6 — o ciclo FV.** Layout e design, no molde das 5 páginas já migradas (`Redesign-Plano-de-Trabalho.md`).

### 5.7 Gargalos e riscos (achados do levantamento)

- **A fase corrente é expressão de 7 campos** (`status`, `requiresApproval`, `count(ApprovalLabelLog)`, `requiresShipment`, `shippedAt`, `invoiceDate`, `paymentDate`). Filtrar e paginar por ela exige `CASE` + anti-join em SQL, não `findMany`. Os índices necessários **já existem** (`prisma/schema.prisma:900-919`).
- **Hoje a lista de contratos não pagina** — carrega até 500 e filtra no navegador (`ContratosPanel.tsx:164`). É o gargalo que a RC-F3 resolve; sem ela, os contadores de fase mentiriam ao passar do teto.
- **`SALE_CONTRACT_VIEW_SELECT` é allow-list do Prisma** — campo novo que não entre nela volta `undefined`, e isso só aparece no teste de integração.
- **`confirmShipment` não incrementa `version` de propósito** (`sale-contract-shipment-service.js:218-221`), para o portão do pagar seguir com a mesma `expectedVersion`. Invariante frágil, coberta por teste (`sale-contract.integration.test.js:498`) — não quebrar ao mudar de superfície.
- **As rotas de embarque e aprovação são auth-only**, sem gate de papel algum; os handlers de etiqueta têm exceção deliberada de posse com selects mínimos (`backend-api.js:1258-1264`) — **nunca reusar a view completa** ali (vazaria financeiro + PII).
- **CSS**: `.ctr-*` (87 classes) e `.cc-tabs` são exclusivos do escopo; `.emb-*` (25) sobrevive parcialmente (a galeria de fotos do Detalhes usa); `.fin-*` (37) é o kit de worklist dos quatro painéis e sobrevive no Financeiro.
- **118 testes de integração** cobrem o domínio; os dois portões estão em `:1038` e `:1073`. A suíte **trunca o banco local** — `db:seed` depois, sempre.
- **Nenhum JSON Schema cobre contratos** — reorganizar não quebra nada validado em CI.

### 5.8 Fluxo 1 — criação do contrato à vista (RC-D13..D20)

> ⚠️ **Ledger histórico.** As decisões de desenho desta seção (RC-D13..D16) foram **revogadas ou superadas** pela análise do fluxo de 2026-07-28 — ver **§5.10**, que é o estado atual. Os achados e a tabela do documento (RC-D18) seguem valendo.

> **Método (combinado 2026-07-27):** as decisões saem da **análise do fluxo, na ordem das ações do usuário** — um fluxo por vez, com layout e superfícies decididos junto. Este é o **primeiro**: do "+" até a emissão. Os status e ações seguintes (aprovação, embarque, faturamento, pagamento) vêm em sequência, depois.

#### O fluxo hoje (medido no código)

`ContractCreateRadialFab` (leque de 3: À vista · Espelho · Futuro) → `SaleContractLotPickerModal` (BottomSheet; lotes `displayStatus=OPEN`, busca com debounce de 300 ms, scroll infinito de 30) → hidrata o lote (`getSampleDetail`) → `SaleContractEtapa2Modal` **empilhado por cima** do picker (`stacked`), 7 blocos e 20+ campos em 2 colunas → **[Emitir]** → `createSpotSaleContract` (venda + contrato EMITIDO na mesma transação, D97) → toast + volta à lista.

Três achados que motivaram as decisões abaixo:

1. **25 validações, uma única mensagem.** Todas caem num `<p className="sdv-modal-error">` no topo do sheet (`SaleContractEtapa2Modal.tsx:387-513`, `:781`). Nada aponta o campo — com 20+ campos em 2 colunas, "Selecione a filial do comprador" vira caça ao tesouro. **Contraria a regra vigente do projeto** (erro dentro do campo, vermelho suave, limpa ao digitar) → **corrigido por regra, sem decisão**.
2. **Nenhuma prévia de número.** Preço/saca, sacas, ágio e as duas corretagens em % são digitados sem que total, preço efetivo ou corretagem em R$ apareçam em lugar nenhum.
3. **Um clique cria tudo.** "Emitir" registra a venda no lote, consome o número da sequência, nasce EMITIDO e gera o PDF — sem revisão, e o único desfazer é o Washout (D104/D122). O **Espelho**, documento bem menos grave, tem uma tela de Conferência inteira (D134).

_(Conferido e **não** é bug: a filial aparece só para **PF** — é a D38; para produtor pessoa física a "filial" é a propriedade. `paymentCondition` está **hardcoded `null`** no payload e não tem campo no form — resquício da D20, a remover.)_

#### Decisões

| #              | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**RC-D13**~~ | ⚠️ **SUPERADA pela RC-D28 (§5.10)** — a intenção (fidelidade por construção) sobreviveu; o desenho saiu do navegador para o servidor. Original: **O contrato aparece sendo montado ao lado do formulário, em tempo real — e é o PDF DE VERDADE, gerado no NAVEGADOR.** O mesmo `renderContractPdf` que produz o arquivo final redesenha a cada pausa da digitação. Fidelidade **por construção**, não por disciplina.           |
| ~~**RC-D14**~~ | ⚠️ **REVOGADA pela RC-D28 (§5.10).** Original: Desktop: **metade a metade** — formulário de um lado, documento do outro, a prévia _sticky_. (Um A4 de fonte 8 só é legível a partir de ~700px; na coluna de 340px do Informativo o texto renderizaria a ~6px.)                                                                                                                                                                  |
| ~~**RC-D15**~~ | ⚠️ **REVOGADA pela RC-D28 (§5.10)** — a conferência funciona em qualquer aparelho. Original: **Sem prévia no celular, e sem substituto** — mesmo formulário, emite direto. Consequência aceita e registrada: no telefone não há documento à vista, nem total calculado, nem confirmação antes de um ato irreversível.                                                                                                           |
| ~~**RC-D16**~~ | ⚠️ **REVOGADA pela RC-D27 (§5.10)** — a dependência explícita que ela própria registrava se cumpriu: a prévia ao vivo caiu, e a confirmação voltou. Original: Como a prévia **é** a conferência: **não entra resumo de números** nem tela/modal de confirmação; "Emitir" segue emitindo direto. ⚠️ **Dependência explícita:** estas duas ausências se justificam pela RC-D13 — se a prévia ao vivo cair, as duas voltam à mesa. |
| **RC-D17**     | ✅ **CUMPRIDA pela RC-D27** (§5.10). A conferência vale nos **três modos** do componente: criar à vista, criar futuro e **editar** (onde ganha peso extra — reemitir muda um contrato que já existe, e hoje não se vê o efeito antes de gravar).                                                                                                                                                                                |
| **RC-D18**     | ⏳ **próxima rodada** (§5.10). **A ordem dos campos espelha a ordem do documento** — o olho vai do campo ao trecho sem procurar. Ver a tabela abaixo.                                                                                                                                                                                                                                                                           |
| **RC-D19**     | ✅ **CUMPRIDA** (§5.10). **O lote continua um passo antes** (picker), como hoje: ele determina o vendedor e o teto de sacas, então o formulário nasce coerente.                                                                                                                                                                                                                                                                 |
| **RC-D20**     | ✅ **IMPLEMENTADA em 2026-07-28** (§5.10), nos três modos. Ao emitir, **fecha o formulário e abre o contrato recém-criado** (o detalhe com as fases) — no lugar do toast + volta à lista. A pessoa cai onde vai acompanhar aprovação, embarque e faturamento.                                                                                                                                                                   |

#### A ordem do documento (extraída de `sale-contract-pdf-service.js:240-760`)

Cabeçalho (logo + emissor) · Título · **Identificação** (Nº Contrato · Nº Compra · Lote · Mês · Ano) · **Comprador | Armazém do comprador** · **Vendedor | Armazém do vendedor** · **Forma · Modalidade · Embalagem · Faturamento · Pagamento** · **Quantidades e valores** (corretagem em %) · **Banco do vendedor** · **Observação / Descrição** · Local + data + 3 assinaturas.

Formulário espelhando (RC-D18):

| #   | Bloco do formulário       | Campos                                                                               | Trecho do documento         |
| --- | ------------------------- | ------------------------------------------------------------------------------------ | --------------------------- |
| 1   | **Identificação**         | Nº de compra (opcional), Data do contrato                                            | linha de identificação      |
| 2   | **Comprador**             | Comprador, Filial (só PF), Armazém do comprador                                      | cards do comprador          |
| 3   | **Vendedor**              | Vendedor, Filial (só PF), Armazém do vendedor                                        | cards do vendedor           |
| 4   | **Pagamento e logística** | Forma, Modalidade, Embalagem, Faturamento, Pagamento                                 | fila de caixas              |
| 5   | **Quantidades e valores** | Sacas, Preço/saca, Ágio/Deságio, Peso, Corretagem vendedor %, Corretagem comprador % | faixa de valores            |
| 6   | **Banco do vendedor**     | conta bancária do vendedor                                                           | caixa do banco              |
| 7   | **Textos**                | Observações, Descrição                                                               | caixa de rótulo vertical    |
| 8   | **Controle interno**      | **Corretores**, **Precisa de aprovação?**, lembrete em dias                          | **nenhum — não é impresso** |

Duas consequências da ordem nova:

- **O comprador passa a vir ANTES do vendedor** (hoje é o contrário) — porque é assim que o documento os imprime.
- **Dois campos não têm contraparte no PDF:** os **corretores** (só a corretagem em **%** é impressa; os nomes não saem — a linha de assinatura diz só "Corretor") e a **aprovação** inteira, que é controle interno. Ambos ganham um bloco final **visualmente separado**, fora do espelho — o que também tira a decisão irreversível da aprovação do meio do formulário, onde está hoje.

#### Riscos técnicos da RC-D13 (❌ não se aplicam mais — a RC-D28 tirou o renderizador do navegador)

- **`sale-contract-pdf-service.js` importa `node:fs`, `node:path` e `node:crypto`** — não roda no navegador como está. O `fs` serve só para ler o PNG do logo (`tryReadPng`) e o `createHash` só para o checksum do download; nenhum dos dois pertence ao desenho. Extrair para a borda deixa o renderizador isomórfico.
- **`pdf-lib` já é dependência** (`^1.17.1`) e é isomórfico. Carregar sob demanda ao abrir o formulário, para não pesar o _bundle_ de quem não emite contrato.
- **Re-render a cada pausa**: debounce, revogar os blob URLs antigos e evitar que o quadro perca a posição de rolagem a cada redesenho.
- A prévia usa o payload **ainda não salvo** — o renderizador hoje recebe o contrato persistido. Precisa aceitar a mesma forma montada em memória.

---

### 5.9 RC-F1 + RC-F4 — implementadas (RC-D21..D26)

**7 commits, 2026-07-27** (`c878652`, `8f37842`, `25d4201`, `8bbe780`, `86fa2cb`, `1127fc2` + este).
Primeira implementação do ciclo: o Flavio pediu para parar de decidir no abstrato e ver o
resultado rodando. Alvo = **reorganização das páginas**, não redesenho (que é a RC-F6, por último).

| #          | Decisão                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D21** | Escopo da 1ª fase = **RC-F1 + RC-F4 juntas**, antecipando a F4. Consequência aceita e resolvida pela RC-D25.                                                                                      |
| **RC-D22** | **"Pagar" vai para o card da lista**, ao lado de Faturado — e **continua** no Financeiro para o ADMIN. Executa a RC-D6; **revoga a D137**.                                                        |
| **RC-D23** | **Todo chip do calendário aponta para o contrato** (`/contratos?details=<id>&highlight=<id>`), para os 5 papéis. `contractsHubTabs`, `contractTabRoute` e `ContractsHubTab` removidos.            |
| **RC-D24** | A página Financeiro nasce com o **painel intacto**, só trocando de casca. O chrome FV vem na RC-F6, junto com `/contratos`.                                                                       |
| **RC-D25** | **"Gerar etiqueta" e "Confirmar embarque" vão para as seções Aprovação e Embarque do detalhe** — que eram read-only. Executa RC-D10/RC-D11 (revoga AP29, EMB20, EMB26). É a **semente da RC-F2**. |
| **RC-D26** | O card **"Aprovações enviadas" morre**, e leva o `RecentSendsCard` junto. **Fecha a RC-A2.**                                                                                                      |

**O que mudou de fato**

- `app/financeiro/page.tsx` deixou de ser redirect e virou página real, gated `['ADMIN']`.
  `app/contratos/page.tsx` perdeu `HUB_TABS`, `parseTab`, a barra `.cad-tabs.cc-tabs` e o
  `activeSubTab`; `?tab=financeiro` redireciona, os demais `?tab=` são ignorados.
  `app/embarques/page.tsx` virou `redirect('/contratos')`.
- **`FINANCEIRO_ROLES` partiu em dois** (RC-D5), nos dois lados: `FINANCEIRO_ROLES = ['ADMIN']`
  (carteira) e **`PAYMENT_FEED_ROLES = NON_PROSPECTOR_ROLES`** (feed de pagamento do calendário).
  `DashboardDesktop`: `canPay` → `canSeePaymentEvents`.
- **Apagados:** `EmbarquePanel`, `AprovacoesPanel`, `EmbarqueCard`, `AprovacaoCard`,
  `RecentSendsCard`, a rota `GET /sale-contracts/approvals/recent-sends` e o helper
  `getApprovalRecentSends`. CSS varrido de `globals.css` (~330 linhas): `.emb-card*` + `.emb-fig*`,
  `.sends-*`, `.cc-tabs`, `.cc-placeholder-hint`.
- **Sobreviveram de propósito:** `listShipments`/`listApprovals` (api-client + endpoints) e o método
  de service `getRecentApprovalSends`, todos **sem consumidor de UI** e marcados como tal — a RC-F3
  reescreve a lista com filtro de fase e vai reusar esses recortes. `use-recent-sends-feed.ts`
  também fica: o card de Avisos usa o mesmo hook com outro feed.

**Verificação**

Gates verdes em cada commit (`typecheck`, `lint`, `format:check`, **556** unit, **20** contrato);
`globals.css` validado com `postcss.parse` (o `format:check` não cobre `.css`). Integração rodada
no commit do gate de service (`npm run test:integration:db` + `db:seed`): **123/124** na suíte de
contratos — a única falha é **pré-existente e de calendário**, não da RC: o teste
`Eventos (D138): ADMIN vê agendado no paymentDate` (`sale-contract.integration.test.js:2497`) fixa
`paymentDate 2026-07-20` e, passada a data, o evento deriva corretamente como
`contract_payment_overdue` em vez de `contract_payment_due`. É uma **bomba-relógio de fixture**, que
falha para qualquer um a partir de 2026-07-21; consertar exige decidir entre datas relativas e
absolutas nos fixtures — fora do escopo desta fase.

**Ajustes de teste que a RC-D3 exigiu.** Quatro pontos da integração liam a carteira com
`COMMERCIAL` para provar **escopo aberto** (vê fechamentos de qualquer corretor); passaram a
`adminActor` — o escopo dentro da carteira segue aberto, só quem entra mudou. O teste "acesso
unificado" virou **"só ADMIN acessa; demais não-PROSPECTOR → 403"**, com o loop dos 5 papéis.

**O que a RC-F2 herda pronto.** As seções Aprovação e Embarque do detalhe já **agem**, com
`dismissGuardRef` e um `reloadNonce` que refaz contrato + timeline + fotos ao concluir. Quando a
trilha de fases chegar, o botão não muda de tela — só de moldura.

> ⚠️ **`/embarques` morreu antes das fases existirem.** Até a RC-F2, o contrato mostra as duas ações
> soltas nas seções, sem a trilha que dá sentido a elas — e as duas worklists ("o que está a
> embarcar", "o que está a enviar") **não existem em lugar nenhum** até a RC-F3. O que sobrou de
> visão agregada: o card de **Avisos** do dashboard (o que falta etiquetar) e os **chips do
> calendário** (embarque/faturamento/pagamento por data). Consequência conhecida e aceita.

---

### 5.10 Fluxo 1 — implementado (RC-D27..D36), 2026-07-28

**6 commits**: `e7834ac` (RC-D36) · `6cc1f54` (RC-D30) · `a1bfae4` (RC-D29 picker) ·
`c794253` (RC-D29/D31/D32 formulário) · `f299212` (RC-D35) · `c07a948` (RC-D33/D34) ·
`bbd903b` (RC-D27/D28/D20).

A análise do fluxo do lote encontrou **oito inconsistências**, **quatro campos obrigatórios cuja
resposta o sistema já tinha** e **uma emissão irreversível sem nenhuma conferência**. As decisões
abaixo resolvem os três, e **revogam a base da RC-D13..D16**: a prévia ao vivo no navegador saiu do
desenho.

| #              | Decisão                                                                                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D27**     | **Emitir vira duas fases.** O botão do painel monta o documento e abre a **conferência**; quem emite é o **Confirmar**. **Voltar** devolve o formulário intacto. Vale nos **três modos** (à vista, futuro, editar).                                                                       |
| **RC-D28**     | O documento da conferência é o **PDF de verdade, montado no SERVIDOR**. **Revoga a RC-D14** (meio a meio), a **RC-D15** (sem prévia no celular) e a **RC-D16** (sem conferência). A **RC-D13 sobrevive na intenção** — fidelidade por construção — mas o desenho saiu do navegador.       |
| **RC-D29**     | Toda superfície do fluxo é **painel lateral** do kit FV (`.fv-panel-sheet.side-sheet`, 620px): picker e formulário. Mobile = sheet de tela cheia, como todo painel do kit.                                                                                                                |
| **RC-D30**     | O picker lista **só lote vendável**: saldo > 0 **e** liga viável. Lote sem quantidade declarada e liga inviável somem da lista em vez de virarem beco sem saída no submit.                                                                                                                |
| **RC-D31**     | O lote passa a preencher **data do contrato (hoje)**, **sacas (saldo)**, **filial do vendedor** e **conta bancária** quando a resposta é única. Todos seguem editáveis.                                                                                                                   |
| **RC-D32**     | O formulário ganha **faixa de identidade do lote** no topo (número · produtor · safra · saldo) — era uma linha cinza com o número e nada mais.                                                                                                                                            |
| ~~**RC-D33**~~ | ⚠️ **REVOGADA pela RC-D37 (§5.11)** — o efeito não ficou visível, ficou **impossível**: o vendedor virou o dono do lote e o campo travou, então não há troca a avisar. Original: vendedor ≠ dono do lote passa a **avisar no campo**; o `_syncSampleOwner` deixa de ser efeito invisível. |
| **RC-D34**     | Fechar **ou voltar** com o formulário mexido pede confirmação (`.is-scrim-none` + `.is-compact`, molde de `/users` e `/relatorios`).                                                                                                                                                      |
| **RC-D35**     | As 25 validações passam a **apontar o campo** (regra vigente do projeto), no lugar da mensagem única no topo do sheet.                                                                                                                                                                    |
| **RC-D36**     | **A propagação origem→liga do DONO acaba.** Editar o dono de um lote nunca mexe no dono de liga ancestral — fixada ou não. Só safra e lote de origem seguem derivando. Alinha o código ao que o `Liga-Plano` afirma desde 2026-07-15.                                                     |

#### Como a conferência funciona (RC-D27/D28)

`POST /sale-contracts/preview/pdf` → `previewSaleContract` reusa o **`_resolveEmitData`** (a mesma
função que a emissão usa para montar o contrato **antes** da transação) e entrega ao **mesmo
`renderContractPdf`** do PDF definitivo. Fidelidade por construção, não por réplica.

- **Nada é gravado.** O endpoint **não aloca número** — a alocação vive na transação sob
  `pg_advisory_xact_lock`. Na criação o documento sai com número **provisório** e diz isso; no
  "Editar" o número já é o do contrato. Header `X-Provisional-Number`.
- **Os 25 campos que o renderizador lê:** 18 vêm do `_resolveEmitData`, 6 da fase 1
  (`quantitySacks`, `unitPrice`, as duas corretagens em %, `contractDate`) e o `contractNumber`; o
  `effectiveUnitPrice` tem fallback próprio no PDF.
- ⚠️ **Desvio registrado.** O Flavio escolheu "servidor manda imagem". O servidor gera o **PDF**
  (reuso exato do renderizador, risco zero) e **o cliente rasteriza**, com `pdfjs-dist` em import
  dinâmico pintando em `<canvas>` e exibindo `<img>` por página. Rasterizar no servidor exigiria
  Ghostscript ou binding nativo no contêiner. O resultado para o usuário é o mesmo — imagem que
  aparece em qualquer aparelho, inclusive onde o `<iframe>` de PDF não renderiza. **`pdfjs-dist` é a
  única dependência nova**; o build confirma chunk lazy (`/contratos` segue em 214 kB de first load)
  e o worker emitido como asset próprio.
- O modal usa **backdrop cheio**, não `.fv-panel-scrim` — exceção deliberada à regra de "confirmação
  sobre painel" (skill `containers` §2), porque o documento precisa da tela inteira e é ele o objeto
  da decisão. **Segunda exceção registrada na skill** (a primeira foi a PG52).

#### Os oito achados e o que foi feito

| Achado                                                                                                                | Resolução                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Lote com `declaredSacks` nulo entrava no picker (o `commercialStatus` nasce `'OPEN'` de propósito) e morria no submit | `sellableOnly` no `listSamples` (RC-D30)                                                                           |
| Liga inviável (cascata) idem                                                                                          | pós-filtro de `getBlendFeasibility` na página, **depois** do `nextCursor` — senão o scroll infinito pularia linhas |
| Chip "Em aberto" era literal no JSX                                                                                   | `sampleStatusDisplay`, a fonte única de lista e detalhe                                                            |
| Data, sacas, filial e banco obrigatórios com resposta única já conhecida                                              | auto-preenchimento (RC-D31)                                                                                        |
| Só o número do lote no formulário                                                                                     | faixa de identidade (RC-D32)                                                                                       |
| 25 validações numa mensagem única no topo                                                                             | erro dentro do campo + rolagem até ele (RC-D35)                                                                    |
| 409 dizia "Este contrato foi modificado. Recarregue a página" e prendia a versão velha no estado                      | re-hidrata versão e saldo **preservando o formulário**, ajusta as sacas e diz o que mudou                          |
| Troca de dono do lote sem nenhum sinal na tela                                                                        | aviso âmbar no campo Vendedor (RC-D33) — **superado pela RC-D37**: a troca deixou de existir                       |

#### Detalhes de implementação que importam

- **`sellableOnly` no `listSamples`, não em query nova.** O plano previa um `listSellableSamples` em
  `$queryRaw`; `commercialStatus IN ('OPEN','PARTIALLY_SOLD') AND declaredSacks > 0` já implica saldo
  > 0, então a condição coube no Prisma. A viabilidade da liga é pós-filtro **da página**, com um
  > teste dedicado provando que o cursor sai da última linha **buscada**, não da última exibida.
- **A mensagem de erro usa `.app-modal-field-error`**, não o `.fv-form-field-error` do kit: é a peça
  que este formulário já usa nos avisos de fim de semana e de ordem das datas. Duas classes de erro
  no mesmo campo dariam dois vermelhos. O `.ctr-form-sheet` retinta ambas no tom do kit.
- **O sinal de rascunho sujo é um `touched` explícito**, não "campo preenchido": à vista o formulário
  já nasce preenchido (RC-D31) e no Editar nasce com o contrato inteiro — inferir dispararia o guard
  sempre.
- **A hidratação passou a depender do ID do lote**, não da identidade do objeto `spotCreate` — senão
  a própria re-hidratação do 409 reescreveria o formulário que ela existe para salvar.
- **RC-D36 no código:** `_buildBlendPropagation` perdeu `ownerChanged`; o gatilho virou
  `harvestChanged || originLotChanged`. O auto-pin **fica** (é o que distingue "carteira da
  corretora" de "sem dono"). Três testes de integração foram **invertidos** para afirmar o
  comportamento novo. ⚠️ Duas frases desta entrada caducaram no mesmo dia, pela **§5.11**: o
  `deriveBlendOwner` saiu do `createBlend` (RC-D38 — o dono vem escolhido, a unanimidade virou
  pré-preenchimento da tela) e o `_syncSampleOwner` foi apagado (RC-D37), levando junto a nota sobre
  o `confirmHarvestPropagation`.

#### O que ficou de fora, por decisão

**RC-D18** (ordem dos campos espelhando o documento — comprador antes do vendedor) e o **bloco final
de controle interno** (corretores + aprovação) ficam para a próxima rodada, junto com o resto do
redesenho FV do corpo do formulário (que ainda é markup `.app-modal-*`). A conferência pelo documento
que esta rodada entrega é o que torna essa próxima rodada segura de fazer.

**Verificação.** `typecheck`, `lint`, `format:check`, `build`, **556** unit, **20** contrato,
`validate:schemas`; `globals.css` com `postcss.parse`. Integração rodada ao fim.
📱🖥️ **pendente a conferência do Flavio.**

**Rescaldo (mesma rodada, 5 commits depois do ledger acima):** `5fa0cc7` (testes da prévia + ESC não
fecha o painel por baixo do documento) · `a619153` (Confirmar exige ter VISTO o documento) ·
`85b84a4` (a conferência abria ATRÁS do painel na criação à vista — `is-stacked` no backdrop + regra
escopada acima do tier do sheet) · `79ef6a0` (os dois escurecimentos empilhados somavam ~80% de
preto; a regra "scrim não se soma" não cobria dois `is-stacked`) · `888c3f7` (o teste de cursor do
`sellableOnly` sorteava a ordem das linhas — o helper não preenchia `internal_lot_number_int`).

### 5.11 O lote manda no vendedor (RC-D37..D39), 2026-07-28

A revisão do que cruza a fronteira **lote → contrato** achou **um campo andando para o lado errado**:
o Vendedor era livre e, ao emitir, **transferia a posse do lote** (`_syncSampleOwner`) — na criação
com aviso âmbar, e no "Editar" **sem aviso nenhum**. Era um atalho que gravava no lote com motivo
fixo, pulando a escolha de motivo que a porta canônica (Editar cadastro, no detalhe do lote) exige.

| #          | Decisão                                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D37** | **O vendedor de um contrato com lote É o dono do lote**, derivado no SERVIDOR — o `sellerClientId` do payload deixa de ser lido, nos três caminhos (criar à vista, Editar, **prévia**). Na tela o campo vira texto travado com a instrução. **Revoga a D48 e a RC-D33.** FUTURO (sem lote) segue livre. |
| **RC-D38** | **A liga nasce com dono.** A opção "Carteira da corretora (sem dono)" sai da criação e o `createBlend` devolve **422** sem `ownerClientId`. Origens unânimes seguem pré-preenchendo o campo — mas quem deriva agora é a TELA; o backend só grava o que recebeu, e sempre fixado.                        |
| **RC-D39** | **Liga legada sem dono não vende.** Sai do `sellableOnly` (some do picker) e o `createSampleMovement` recusa `SALE` sem dono. Regulariza-se atribuindo dono no lote. **Revoga a opção (D) do `Liga-Plano` (`:1202`)**, que descartara bloquear a venda como "fricção sem justificativa".                |

#### Por que a prévia muda no mesmo commit

Desde a RC-D27/D28 o documento da conferência é o que o "Confirmar" emite. Se só a emissão derivasse
o vendedor do lote, o usuário aprovaria um PDF com um vendedor e emitiria outro. `previewSaleContract`
usa a mesma regra — e o teste gêmeo (`sale-contract.integration.test.js`, "a vista **com** vendedor
explícito IGNORA o payload") existe para isso.

#### O gargalo escondido: o banco do vendedor

`_requireSellerBankAccount` exige que a conta pertença ao vendedor. Com o vendedor derivado, um
"Editar" cujo lote trocou de dono teria a conta gravada de **outro** cliente — e estouraria 422
`CLIENT_BANK_ACCOUNT_NOT_FOUND` numa edição que só queria mudar a observação. Por isso o
`getSaleContract` passou a devolver **`sampleOwner`** (o dono ATUAL do lote, na consulta que já
buscava o `isBlend`), e a tela, ao ver divergência, **zera filial e banco** — exatamente o que o
`handleSelectSeller` já fazia quando o vendedor mudava à mão. Mesmo tratamento no 409 do lote: se o
dono mudou durante o preenchimento, o campo travado acompanha e o aviso diz isso.

#### O que sobrevive como legado

`blendOwnerPinned`, o rótulo "Carteira da corretora" nos cards/detalhe, o nudge "Atribuir dono
primeiro" do painel de perda e o `deriveBlendOwner` (que segue servindo o `blend-backfill`) **ficam**
— agora servindo só a ligas antigas. O JSON Schema de `registration-confirmed` mantém
`declared.owner` nullable: torná-lo obrigatório quebraria o replay do histórico.

⚠️ **Efeito conhecido, benigno:** um re-run do `backfill-liga-harvest-owner.js` pode atribuir dono por
unanimidade a uma liga legada não-fixada (`blend-backfill.js:149`) e assim destravá-la para venda. É
regularização, não regressão.

## Apêndice A — Ledger de decisões (condensado)

> Resolução final de cada decisão; as **superadas** apontam para o que as substituiu. O histórico completo (Contexto→Opções→Proposta + sessões) está no Git.

### A.1 Contrato / Financeiro / Espelho (D1–D146)

- **D1** — Contrato híbrido: dados estruturados + 2 blocos de texto livre (Observações/Descrição) + assinaturas; sem cláusulas jurídicas fixas.
- **D2** — Serve de confirmação ao comprador e ao vendedor, com valor de contrato formal entre as partes.
- **D3** — Granularidade por venda: cada venda gera 1 Fechamento (à vista 1:1 com o `movementId`; Futuro nasce avulso).
- **D4** — Núcleo financeiro é capturado e exigido já na venda (etapa 1); demais campos, obrigatoriedade caso a caso.
- **D5** — Emissor com dados fixos (nome/CNPJ/logo/corretora), não escolhidos por venda.
- **D6** — PDF via `pdf-lib`, clonando o pipeline do laudo; sem dependência nova.
- **D7** — Construção e implementação campo a campo; este doc é o backlog vivo.
- **D8** — O v1 replica por inteiro o "Contrato de Compra e Venda de Café" legado.
- **D9** — (superada por D41/D69 — criação hoje em 1 modal único, não no modal de venda).
- **D10** — Qualidade/classificação do café NÃO entra no contrato (fica só no laudo).
- **D11** — Persistência em tabela dedicada `SaleContract` (resolvida pela D51).
- **D12** — Comprador (comprador da venda) e Vendedor (dono do lote) pré-preenchidos, com snapshot. ⚠️ O "editáveis" vale só para o comprador e para o contrato FUTURO: com lote, o vendedor é travado (RC-D37, §5.11).
- **D13** — (superada por D34).
- **D14** — (superada por D96/D97 — enum final `EMITIDO·FATURADO·PAGO·WASH_OUT`).
- **D15** — Número do contrato automático `NNNN/AA` contínuo, não editável (cancelar pode deixar gap).
- **D16** — "Número de Compra" = campo livre, sem vínculo a outra entidade.
- **D17** — Quantidade = sacas inteiras da venda (`quantitySacks`); Peso (Kg) é decimal separado.
- **D18** — Valor total automático = (preço/saca ± ágio-deságio por saca) × sacas, calculado e salvo (mecânica do ágio corrigida pela D54).
- **D19** — (superada por D44 — entrada só em %).
- **D20** — 3 listas cadastráveis (Forma {Faturado,Livre} · Modalidade {Retirar,Posto,Disponível} · Embalagem {Sacaria,Bags,A granel}); Condição de Pagamento = texto livre.
- **D21** — Só vendas novas geram contrato; antigas ficam sem contrato (sem backfill).
- **D22** — (superada por D41/D46 — PDF sai ao "Emitir", não ao salvar a venda).
- **D23** — (superada por D110 — gestão ADMIN + COMMERCIAL-dono).
- **D24** — Dados bancários: `ClientBankAccount` por cliente; "Banco do Vendedor" = uma conta do vendedor. (A entidade `Bank` que esta decisão criou foi removida pela D141 — banco virou texto livre na conta.)
- **D25** — Snapshots de partes/banco/armazém congelam ao `FATURADO` (editável até `EMITIDO`); ágio/deságio é a única mutação financeira permitida depois.
- **D26** — Armazém = `Client` com `isWarehouse` (sem entidade nova); lookup amplo + auto-promoção (D49).
- **D27** — `ClientAttachment` (N por cliente, PDF+imagens, só arquivamento, independente do contrato).
- **D28** — Conta bancária = banco (texto livre pela D141) + agência + conta c/ dígito + titular + CNPJ/CPF do titular + chave PIX (titular pode diferir).
- **D29** — Emissor fixo em config (`COMPANY_INFO` + CNPJ); sem tela editável.
- **D30** — 2 blocos de texto livre opcionais e sem limite (Observações + Descrição); sem boilerplate jurídico.
- **D31** — (superada por D35).
- **D32** — Entrega do PDF por baixar/compartilhar (`shareOrDownloadFile`), sem persistir bytes; regenerável.
- **D33** — (superada por D56).
- **D34** — Corretores: cadastro `Broker` (`userId` opcional p/ métrica) + `SaleContractBroker`, N por contrato.
- **D35** — Assinaturas: corretor/empresa = imagem fixa do dono (auto); comprador/vendedor = linhas em branco.
- **D36** — Coluna `Client.birthDate` (só PF, opcional, só cadastro; não entra no contrato).
- **D37** — (superada por D42).
- **D38** — Lote vincula só o `Client` (sem filial); a filial do PF (vendedor e comprador) é escolhida na etapa 2 e congelada.
- **D39** — (superada por D141 — o código COMPE saiu do sistema junto com a entidade `Bank`).
- **D40** — Corretor não-usuário guarda CPF + telefone/e-mail (opcionais p/ corretor-usuário).
- **D41** — Página "Contratos" lista e cria os contratos (o "2 etapas/EM_ABERTO parcial" foi superado por D69/D97 — criação atômica, nasce EMITIDO).
- **D42** — Tipos = enum fixo `Mercado à vista / Futuro` (CPR removido); ambos geram o Fechamento.
- **D43** — Campos por etapa: etapa 1 (Venda) = comprador/data/sacas/preço/corretagens %/corretores; etapa 2 (Geração) = lote/vendedor/filiais/banco/armazéns/nº-compra/pagamento/textos/datas (o **vendedor** saiu dos campos editáveis do modo à vista — RC-D37, §5.11).
- **D44** — Corretagem do vendedor e do comprador, separadas, entrada só em %; N corretores.
- **D45** — `WASH_OUT` = status de quebra (com `washoutReason`/`washoutAt`, D58).
- **D46** — (superada por D96/D97 — criação atômica nasce `EMITIDO`, sem `CONFERIR`).
- **D47** — (superada por D96).
- ~~**D48**~~ — ⚠️ **REVOGADA pela RC-D37 (§5.11)** em 2026-07-28. A direção se inverteu: o contrato passou a **ler** o dono do lote em vez de escrever nele, e `_syncSampleOwner` foi apagado. Trocar o vendedor se faz no cadastro do lote. Original: editar o vendedor no contrato (até `EMITIDO`) sincroniza o `Sample.ownerClientId`.
- **D49** — Campos de armazém buscam todos os clientes; selecionar não-armazém liga `isWarehouse`; opcionais, snapshot.
- **D50** — (superada por D61 — entrada única pela página via FAB; à vista não nasce mais no lote).
- **D51** — Persistência uniforme no `SaleContract`: Futuro 100% na tabela (`sampleId`/`movementId` nulos); à vista vincula o movimento 1:1.
- **D52** — Editar a etapa 1 no contrato sincroniza a venda/lote (mecanismo = `SALE_UPDATED`, D66).
- **D53** — Snapshots = `Json?` por entidade + FK; as 3 listas = tabelas de lookup (guarda texto snapshot + FK).
- **D54** — Ágio/deságio em R$ POR SACA: preço efetivo/saca = preço ± valor; total = preço_ajustado × sacas.
- **D55** — Corretagem guarda os 2 % (vend/comp) e o R$ calculado (snapshot congelado).
- **D56** — Auditoria de emissão em tabela própria `SaleContractExport` (cobre à vista e Futuro).
- **D57** — `contractSeq` (Int global, nunca reseta) + `contractNumber` "NNNN/AA".
- **D58** — `WASH_OUT` guarda `washoutReason` + `washoutAt`.
- **D59** — CRUD de `Broker`/`ClientBankAccount`/`ClientAttachment` = qualquer autenticado (PROSPECTOR fora). (`Bank` constava na lista; removida pela D141.)
- **D60** — Bancos/Corretores numa página "Cadastros" com abas; contas/anexos no detalhe do Cliente. (Ajustada pela D141: a aba Bancos saiu — Cadastros ficou Clientes | Corretores.)
- **D61** — Venda à vista exclusivamente pela página "Contratos" (FAB → lote → venda → etapa 2); detalhe da amostra vira histórico só-leitura; venda = ADMIN.
- **D62** — (superada por D69).
- **D63** — O PDF do contrato não exibe o status do fluxo.
- **D64** — (superada por D126 — preview do PDF + Exportar/Baixar embutidos no modal de Detalhes; `SaleContractDocumentModal` aposentado).
- **D65** — (superada por D96/D121/D137 — matriz de ações do card redefinida; "Quebrar"→"Washout" mantido na D93).
- **D66** — O "Editar" libera também a fase 1; `emitSaleContract` aceita `saleFields` e sincroniza a venda via `SALE_UPDATED` (resolve P20).
- **D67** — Futuro criado em 1 modal único (Vendedor/Comprador manuais, sacas livres, sem lote), 100% no `SaleContract`.
- **D68** — Futuro sem lote: "Washout" marca `WASH_OUT`+motivo sem devolver sacas (o "Cancelar/Excluir" saiu com D97/D104).
- **D69** — Criação à vista em 1 modal só (modo `spotCreate`: sacas ≤ disponível, liga 100%, vendedor = dono do lote) — fim do wizard. Desde a **RC-D37** (§5.11) o "vendedor = dono do lote" deixou de ser default e virou **invariante**.
- **D70** — Espelho de Corretagem = 3º documento, derivado de 1 `SaleContract` (lê o contrato; não é tipo/tabela/status novos).
- **D71** — Espelho on-demand, sem tabela/numeração/status próprios (a auditoria da geração veio depois, D124).
- **D72** — Na geração escolhe-se a parte (Comprador/Vendedor) = CLIENTE do topo + lado da comissão; só os lados com corretagem >0.
- **D73** — Elegíveis ao Espelho = status congelados (`EMITIDO/FATURADO/PAGO/WASH_OUT`) com ≥1 corretagem >0 no lado (renomeados por D96, WASH_OUT por D105).
- **D74** — Rodapé bancário = conta fixa da SAFRAS (SICREDI ag. 0361, c/c 83515-3, CNPJ 23.490.860/0001-56) no `issuer-config`.
- **D75** — Modal de conferência do Espelho só-leitura → gera o PDF (hoje `EspelhoConferenciaModal`, D134).
- **D76** — Entrada do Espelho via modo de seleção (padrão "liga"): tocar 1 contrato elegível abre direto.
- **D77** — Página "Financeiro" = relatório derivado (sem schema), corretagem a receber por fechamento; acesso ADMIN + COMMERCIAL.
- **D78** — Valor a receber por fechamento = `sellerBrokerageValue + buyerBrokerageValue` (as 2 pontas).
- **D79** — (superada por D136 — rateio ÷N removido).
- **D80** — Elegíveis ao Financeiro = congelados `EMITIDO/FATURADO/PAGO/WASH_OUT`, inclusive sem corretagem (D92/D105).
- **D81** — Só visão calculada: a página não marca "corretagem paga ao corretor" (controle de pagamento ao corretor = futuro).
- **D82** — (superada por D135).
- **D83** — Financeiro = lista de cards por fechamento, total geral no topo + busca, sem filtro de período.
- **D84** — Card recolhido (ADMIN) = nº · valor total · corretagem total · nomes dos corretores (sem cota, D136).
- **D85** — Card expandido = só o detalhe da corretagem (repartição vendedor % + R$ e comprador % + R$).
- **D86** — (superada por D135/D136).
- **D87** — (superada por D121 — botões Ágio/Deságio migraram do card pro modal de Detalhes).
- **D88** — Ágio/deságio substitui o vigente (incide sempre sobre o `unitPrice` cru, não acumula); recalcula total + as 2 corretagens.
- **D89** — Ágio só aplicável no contrato editável (`EMITIDO`); PDF do contrato inalterado; reflete no Financeiro e no Espelho.
- **D90** — Cada aplicação de ágio grava 1 linha em `SaleContractAgioLog` (valor, anterior, total antes→depois, ator, quando).
- **D91** — Gestão das 3 listas = só "+ Adicionar" inline no dropdown (`createContractLookup`); renomear/inativar adiado.
- **D92** — Financeiro inclui contratos sem corretagem (total 0) — único lugar onde o total do contrato aparece (resolve P24).
- **D93** — Terminologia "Washout" padronizada em toda a UI (selo/filtro/botão/diálogo) — resolve P25.
- **D94** — Criar valor das 3 listas exige ADMIN; o `listContractLookups` segue a qualquer autenticado (resolve P26).
- **D95** — Renomear/inativar/reordenar das listas = adiado (YAGNI); só "+ Adicionar" por ora.
- **D96** — Máquina de status simplificada: remove `CONFERIR`, `CONFIRMADO`→`EMITIDO`; "Emitir" vai direto a `EMITIDO` (editável); some o "Confirmar".
- **D97** — Remove `EM_ABERTO`: o contrato nasce `EMITIDO` numa criação atômica (venda + contrato na mesma tx); enum final `EMITIDO·FATURADO·PAGO·WASH_OUT`.
- **D98** — (descartada — envio do contrato por e-mail, Fase H; nunca teve código).
- **D99–D103** — (descartadas — sub-decisões da Fase H de e-mail, com D98).
- **D104** — "Excluir" removido: Washout é a única quebra (contrato nunca é apagado; número fica registrado).
- **D105** — Washout ainda paga corretagem: `WASH_OUT` segue no Financeiro e elegível ao Espelho. _(revisada pela D145: passa a valer **só para o FUTURO** — o físico cancelado não paga corretagem.)_
- **D106** — Pagamento só após faturamento: ciclo linear `EMITIDO → FATURADO → PAGO` (sem pular; o Desfazer saiu na D122).
- **D107** — Aprovação (etiqueta) = marco pós-emissão auditado no contrato, ortogonal ao status; reusa `customPrintJob`.
- **D108** — Detalhes do contrato = MODAL grande (não página); card mantém o acordeão + botão "Detalhes" (implementado na Fase J).
- **D109** — Refino do Espelho: exige corretagem no lado (409 `ESPELHO_NO_BROKERAGE`) + re-busca do contrato fresco no modal.
- **D110** — (superada por D140 — escopo aberto: ADMIN + COMMERCIAL veem/gerenciam TODOS os contratos).
- **D111** — Refinamentos visuais do PDF do contrato (logo, linha de identificação, cards centralizados, Banco 3×2, CAIXA ALTA exceto PIX, fonte adaptativa; 1 página).
- **D112** — Todo envio de aprovação é auditado 1:N; desfecho fica fora do sistema; 5 campos + lotes pré-preenchidos e editáveis; permitido em EMITIDO/FATURADO/PAGO, a todos exceto PROSPECTOR.
- **D113** — Entrada dupla: botão no card + `/samples` com seletor reduzido (todos os contratos, sem valores) e botão "Manual" (etiqueta 100% manual, agora auditada).
- **D114** — Auditoria em tabela única `ApprovalLabelLog` com `saleContractId` opcional (nulo = avulsa; sem coluna booleana; payload = linhas impressas + ref do job).
- **D115** — Prefill dos 5 campos direto do contrato, editáveis e cortados no limite físico (Armazém = SEMPRE o do vendedor); montado no backend.
- **D116** — Lotes ← `declaredOriginLot` quebrado por traço/espaço/vírgula/ponto-e-vírgula (barra não), pedaço >16 corta, >16 pedaços = 16 primeiros; vazio se sem fonte.
- **D117** — Seletor lista só elegíveis (mais recente primeiro + busca) + "Manual"; formulário com "Voltar"; desktop central / mobile bottom sheet; botão do card = "Aprovação".
- **D118** — Selo de status no seletor; 1 cópia por envio; validação "≥1 campo"; sem resultado do print job no histórico (a linha virou sem nº na D119).
- **D119** — Fase I em fases (auditoria write-only 1º; timeline depois); histórico só no Detalhes; linha = "há X tempo" + quem + "Aprovação enviada" (data exata de apoio).
- **D115/D116 SUPERADOS (etiqueta espelha a origem, 2026-07-19/20):** os **lotes** da etiqueta viraram **read-only** — espelham `Sample.declaredOriginLot` (que na criação/edição virou **chips**, componente `OriginLotChips`; storage 100→2000). O operador não edita mais os lotes ao imprimir (**fonte única**; corrigir = editar o **lote** (chips) ou a **liga** e reimprimir; futuro sem amostra = sem lotes). `splitOriginLotForLabel` passou de `[-\s,;]+` para **`[\s,;]+`** (o traço **NÃO** separa mais — `PA-01` sobrevive; a barra também não) + cap de exibição **8 + "+"** (o armazenamento guarda todos). Layout **em 2 colunas** no `print-agent/label.js` (`buildCustomLabelLayout`, auto-ajuste TSPL). Os 5 campos de valor (compra/fechamento/produtor/armazém/sacas) **seguem editáveis** no modal. Origem da **liga** virou **derivada da somatória** dos componentes + editável/pinável — ver `Liga-Plano` (log 2026-07-20). Commits `0c969c1`..`035cbff` (NÃO pushados; migration `20260719120000`).
- **D120** — Modal de Detalhes: molde do modal de emissão, seções read-only 2-col, header nº+selo+tipo, Histórico em largura total; COMMERCIAL vê tudo nos dele (D86 vale só no Financeiro).
- **D121** — Card ENXUTO (avançar status + Aprovação + Detalhes); Editar/Ágio/Deságio/Washout/Visualizar migram pro modal (revisa D87).
- **D122** — "Desfazer" removido do sistema (backend + UI); ciclo só pra frente, engano só se corrige por Washout.
- **D123** — Marcos Faturar/Pagar/Washout gravam ator+quando em `SaleContractStatusLog` (marcos antigos só com data).
- **D124** — Geração do Espelho auditada em `SaleContractEspelhoLog` (contrato+side+ator+quando); resolve D71 (download do PDF segue sem rastro).
- **D125** — Timeline v1 agrega criação/edições + ágio + aprovações + marcos + espelho, ordem desc, "há X tempo + quem + o quê" (endpoint agregador novo).
- **D126** — O PDF do contrato entra embutido no modal de Detalhes (coluna esquerda desktop / 1ª seção mobile, Exportar/Baixar na seção); "Visualizar" sai do rodapé.
- **D127** — A auditoria do Espelho registra só a EXPORTAÇÃO (Exportar/Baixar); a prévia (`?preview=1`) não loga; label "Espelho exportado". **Endurecida 2026-07-16 (revisão do Espelho, decisões do Flavio):** grava **só na entrega concluída** (cancelar o share não audita; toast de sucesso) e o **endpoint de log valida a elegibilidade** (`assertEspelhoEligible`, extraído pro `sale-contract-support.js` e reusado pelo PDF _e_ pelo log — antes o log gravava export impossível). Segue best-effort (a prévia entrega o PDF sem log — aceito). Também nesta revisão: **dedup** do preço efetivo numa fonte única (`computeEffectiveUnitPrice` → `effectiveUnitPrice` na view; PDF e Conferência leem dali, fim da fórmula copiada); **botão "Gerar espelho" no Detalhes** (além do leque "+"); **fix do beco stale** (a Conferência bloqueia "Gerar espelho" quando o contrato fresco perdeu a elegibilidade, em vez de mandar pra um 409 garantido); teste unit do `assertEspelhoEligible` (os 3 gates + assimetria D145). **Sem migration.** Núcleo confirmado correto: a comissão do PDF é o valor armazenado (idêntico ao Financeiro), sem recomputação.
- **D128** — (superada por D135 — Financeiro voltou a ADMIN + COMMERCIAL).
- **D129** — (superada por D136 — rateio removido).
- **D130** — PDF do Espelho sem ágio: a coluna Ágio/Deságio sai com as duas células vazias.
- **D131** — Coluna "Data" do Espelho = data de GERAÇÃO (fuso America/Sao_Paulo); "Pagamento" mantém `paymentDate`.
- **D132** — Coluna "Comprador/Vendedor" removida do Espelho (ficam 9 colunas).
- **D133** — Coluna "Preço" do Espelho = preço EFETIVO/saca (cru ± ágio); Ágio/Deságio e Valor ficam informativas.
- **D134** — Fase de CONFERÊNCIA no Espelho (`EspelhoConferenciaModal`) entre seleção e prévia; toggle Vendedor|Comprador aqui + "Ver detalhes" vai-e-volta com o Detalhes.
- **D135** — (superada por D140 — Financeiro aberto: COMMERCIAL vê TODOS os fechamentos).
- **D136** — Rateio ÷N removido: card mostra corretagem total + só nomes dos corretores; o total do cabeçalho = "Corretagem total" (rótulo unificado pela D140).
- **D137** — Botão "Pago" (`FATURADO`→`PAGO`) migrou do card do contrato pro card do Financeiro (acesso igual; "Faturar" segue no contrato).
- **D138** — Pagamento do contrato vira evento do card de Eventos do dashboard (agendado no `paymentDate` / realizado no `paidAt`), escopado como o Financeiro (detalhes E21–E27 no `Dashboard-Visao-Geral.md`).
- **D139** — `ClientAttachment.unitId` (anulável) vincula o anexo a uma filial `ClientUnit`; vínculo definitivo via `PATCH`, não move o arquivo.
- **D140** — Escopo aberto do COMMERCIAL (own-only revogado; supera D110 e D135): ADMIN e COMMERCIAL veem e GERENCIAM TODOS os contratos, o Financeiro e o feed de pagamento — a posse por `Broker.userId` deixou de restringir (o backend removeu os 3 helpers de posse + o escopo inline das listas). Relaxa também o "nos dele" da D120, o "só nos dele" da AP9, o escopo da D138 e o "Ver contrato escopado" da AP27/AP30/EMB26 (passam a abrir a ADMIN+COMMERCIAL em qualquer contrato). Rótulo do Financeiro unificado em "Corretagem total". Motivo: simplificar o desenvolvimento; a corretagem não é dado por-corretor no schema (vive no `SaleContract`, 2 pontas — sem coluna de valor em `SaleContractBroker`), então abrir não expõe "cota alheia". Lookup inline segue ADMIN-only (D94).
- **D141** — Banco vira **texto livre** na conta bancária (supera D24 em parte e D39; ajusta D28/D59/D60): `ClientBankAccount.bankName` (texto obrigatório, máx. 120, entrada em MAIÚSCULAS como o Titular) substitui a FK `bankId`; a entidade `Bank` (lookup nome + COMPE) sai inteira do sistema — tabela, API `/banks`, aba "Bancos" de `/cadastros` (que fica Clientes | Corretores), `BankFormModal` e `BankSelectField`. Motivo: cadastrar uma instituição só para vincular a conta era fricção sem ganho — o nome do banco é dado de exibição (contrato/PDF), sem agrupamento nem relatório por banco. Compat: snapshots de contratos já emitidos preservam `bankName`/`compeCode` congelados (PDF e modal de Detalhes já renderizam o código condicionalmente); snapshots novos saem sem `bankId`/`compeCode`. Migration `20260714130000_bank_free_text` faz backfill do nome antes de dropar FK e tabela (prod nunca rodou as migrations de bancos — zero dado real; só o demo local tinha contas).
- **D142** — Cronograma coerente: a criação/edição valida `paymentDate >= invoiceDate` (`422 VALIDATION_ERROR` no campo `paymentDate`, em `normalizeEtapa2Input` — cobre à vista, Futuro e Editar; front espelha com erro dentro do campo). Motivo: dava para salvar pagamento planejado anterior ao faturamento planejado, cronograma incoerente que os feeds do dashboard exibiam sem crítica. Contratos já emitidos não são revalidados (a regra só age na escrita).
- **D143** — Conviver com o cross-aggregate **não-atômico** do Editar (emit): `_syncSampleOwner`/`_syncMovementFromContract` commitam antes da transação do contrato; se a `version` bumpar no meio, o 409 deixa amostra/venda à frente do contrato. Decisão: NÃO reescrever para o caminho atômico (`appendEventBatch`+`beforeCommit`, molde da criação à vista) — a janela é minúscula (a `version` é checada imediatamente antes dos syncs) e a divergência é **autocorrigível**: os dois syncs são idempotentes e convergem no retry do Editar pós-409. Hardening aplicado: a resolução de corretores (único 422 tardio) passou para antes dos syncs — depois deles, só o próprio conflito de versão pode falhar. O fix completo fica registrado como opção futura se o app ganhar concorrência real.
- **D144** — Datas planejadas **"À definir"** no FUTURO (condiciona D142; revisa parcialmente EMB22): em contratos `type='FUTURO'`, `invoiceDate` e `paymentDate` podem — **cada uma, independentemente** — vir `null` **explícito** no payload (escolha ativa "À definir" no form; `undefined` segue 422). À vista (MERCADO_A_VISTA) segue exigindo as duas — inclusive no Editar de um à vista (a permissão deriva de `contract.type`, não do payload). Backend: `normalizeEtapa2Input(input, { allowOpenDates })`; o emit passou a carregar o contrato ANTES de normalizar para conhecer o `type` (efeito: 404/409 agora precedem o 422 de payload). D142 só compara quando AMBAS presentes; dia-útil (DSB-D7) só vale para data presente. O Editar (EMITIDO) define a data depois — e também pode **voltar** uma data definida para "à definir" (regrava a etapa 2 inteira). **Embarque**: a worklist passa a **incluir** os sem `invoiceDate` (reverte o "sem data não entra na fila" da EMB22): estado sempre `a_embarcar` (nunca atrasado), no **fim do G0** (nulls-last), entre si por `contractSeq` (= ordem de emissão, pedido do Flavio); o contador de atrasados não os conta; o filtro "a embarcar" os inclui. Financeiro (`a_vencer`, nulls-last) e Aprovações (nulls-last) já toleravam null — mudança só de exibição. **Calendário/feeds do dashboard seguem SEM evento** até a data ser definida (range exclui null; não há onde plotar "à definir"). Faturar/pagar/embarcar direto é permitido (as transições usam só a data real). **Exibição**: texto "À definir" (cards, Detalhes, worklists; "À DEFINIR" no PDF do contrato; "À definir" no Espelho) em vez de "—". O filtro por período da aba Contratos segue **excluindo** quem não tem a data. `approvalReminderLeadDays` permanece como está (sem consumidor — só age quando o faturamento existir). Schema: colunas já anuláveis desde `20260626130000` — **zero migration**.
- **D145** — Washout paga corretagem **só no FUTURO** (revisa a D105): a corretagem de um `WASH_OUT` só é cobrável quando o contrato é `type='FUTURO'` (contrato a termo negociado que quebrou). O contrato **à vista** (`MERCADO_A_VISTA`) cancelado por washout **não gera cobrança**: some do **Financeiro** por completo — fora da lista, de todos os filtros (inclusive "Cancelado") e do cabeçalho "Corretagem total" — e tem o **Espelho de Corretagem bloqueado** (`409 ESPELHO_WASHOUT_SPOT`). O **FUTURO** em washout permanece inalterado (aparece no Financeiro como "cancelado", conta no total, Espelho normal). Backend: `listBrokerReceivables` passa a filtrar os grupos de washout e o agregado `totalCommission` por `{ status: 'WASH_OUT', type: 'FUTURO' }` (constante `WASHOUT_BILLABLE`); o gate do Espelho (`exportEspelhoPdf`) usa o predicado puro `isSpotWashout(contract)`. Como o físico washout é excluído **no `where`**, ele nunca chega à `buildReceivableView` → **zero mudança** no card/tipos TS/painel do Financeiro (toda linha exibida é não-washout ou FUTURO washout, como hoje). O front espelha o gate do Espelho esmaecendo o card ("À vista cancelado"). O "N vencidos" já era só `EMITIDO/FATURADO` — washout nunca contou lá. Motivo: a corretagem remunera a negociação; num contrato à vista que caiu não há negócio a remunerar (regra do Flavio). Regra de leitura/gate — **zero migration**, vale retroativamente para qualquer contrato.
- **D146** — Auditoria e fechamento da cascata **contrato-à-vista → lote/venda** (completa a família D48/D52/D66; alvo "Opção A" travado com o Flavio: propagar de volta só o que já é editável no contrato e veio do lote/cliente — **não** tornar o cadastro do cliente editável pelo contrato). Mapa verificado (o que editar no "Editar"/`emitSaleContract` de um contrato à vista propaga de volta): **vendedor** → `Sample.ownerClientId` + `declared.owner` (`_syncSampleOwner`, D48); **comprador** → `SampleMovement.buyerClientId` (`_syncMovementFromContract`, P20); **sacas** → movimento + **recálculo do saldo do lote**; **data do contrato** → `movementDate`. Todos já corretos. **Banco do vendedor, filial do vendedor e armazéns** são **seleção** (escolhe-se qual registro do cliente usar) → snapshot-only **por design**, sem contraparte viva a atualizar; **preço/corretagem/corretores** só existem no contrato (o `SampleMovement` não guarda dinheiro). **Bug corrigido:** `_syncSampleOwner` chamava `updateRegistration` **sem** `confirmHarvestPropagation: true` — se o lote do contrato à vista for **origem de liga**, editar (ou criar) o contrato lançava `409 BLEND_HARVEST_PROPAGATION_REQUIRED` e o fluxo quebrava; agora passa a flag (molde da conferência de ficha na câmera em `sample-command-service.js`), propagando o dono às ligas ancestrais no mesmo batch atômico. **Observações registradas (NÃO alteradas nesta decisão):** (a) o nome PJ no **snapshot do contrato** usa `clientDisplayName` (razão social, `legalName ?? tradeName`) enquanto o `declared.owner` do lote usa `buildClientDisplayName` (nome fantasia, `tradeName ?? legalName`) — divergência provavelmente proposital (documento legal × lista operacional); mexer arriscaria o nome no PDF; (b) a **filial do comprador** (`buyerUnitId`) é ofertada/snapshotada no contrato mas **não é propagada à venda**: o comando `updateSampleMovement` **suporta** o campo (`sample-command-service.js:919`), mas o `_syncMovementFromContract` **não o inclui** no patch (passa só `buyerClientId`/`quantitySacks`/`movementDate`) — o wiring segue adiado (passe futuro; correção da obs original por D147); (c) o sync segue **não-atômico** (D143, dívida aceita). Zero migration.

- **D147** — **Confirma o futuro como contrato de papel + endurece o invariante à-vista/futuro + blinda o D145** (revisão da lógica de contratos × Financeiro, antes de Aprovação/Embarque; auditoria por 3 exploradores + docs D1–D146). A auditoria confirmou o fluxo **coerente** — a matemática do dinheiro é **idêntica** nas 2 modalidades (`computeContractMoneyWithAgio`, `_resolveEmitData` compartilhados) e o D145 é consistente nas 3 telas (Financeiro `where` + gate do Espelho + esmaecido do front, todos por `WASH_OUT && MERCADO_A_VISTA`). Quatro frentes decididas com o Flavio (AskUserQuestion): **(a) Futuro = papel (confirmação, não mudança):** o `FUTURO` nasce sem lote (`sampleId`/`movementId` nulos, D51/D3) e **nunca ganha um** — não há caminho que vincule café físico a um futuro; o "embarque" é só o marco `requiresShipment`+`shippedAt`+fotos (EMB21/EMB27), **sem baixar estoque**. O físico é rastreado à parte pelos lotes/amostras. Fecha o gap doc×código. **(b) Invariante `type ⟺ vínculo de lote` endurecido:** havia **dois discriminadores** de "é futuro" — o `washoutSaleContract` ramificava pelo vínculo (`!movementId || !sampleId`), o Financeiro/Espelho por `type='FUTURO'` — coerentes só porque a criação os mantém em sincronia. Unifica o washout no **predicado único** `isFutureContract(contract)` (`type==='FUTURO'`; novos helpers `isFutureContract`/`isSpotContract` em `sale-contract-support.js`, ao lado de `isSpotWashout`) + **CHECK constraint** `chk_sale_contract_type_lote` (`(FUTURO ⟺ sample_id/movement_id NULL) OR (MERCADO_A_VISTA ⟺ ambos NOT NULL)`) via migration manual — drift **intencional** (o projeto já escreve constraints à mão; 0 linhas em prod/local → segura). **(c) D145 blindado (não-destrutivo):** o físico-washout **não zera** as corretagens (`sellerBrokerageValue`/`buyerBrokerageValue` seguem snapshot) e o invariante "não cobrável" morava só no `where` do `listBrokerReceivables`; o `RECEIVABLE_VIEW_SELECT` passa a carregar `type` (exposto em `buildReceivableView`) e as colunas ganham comentário canônico apontando `WASHOUT_BILLABLE`/`isSpotWashout` como o filtro único — qualquer consumidor futuro re-deriva billabilidade. **Rejeitado** zerar as corretagens no washout (invasivo, mexe no `cancelSampleMovement`/event-store, destrói o snapshot). **(d) Drifts corrigidos:** comentários de acesso mentindo "COMMERCIAL só os dele / escopa por `Broker.userId`" (removido no D140 + unificação 2026-07-15 → `NON_PROSPECTOR_ROLES`, sem escopo) em `backend-api.js`/`app/api/v1/financeiro/route.ts`/`app/contratos/page.tsx`; comentário morto do schema (`invoicedAt`/`paidAt` "limpas ao desfazer" — Desfazer saiu no D122); lista `ELIGIBLE_STATUSES` do Espelho hardcoded → reusa `SALE_CONTRACT_STATUSES`. **Sem mudança de comportamento** ao usuário (Financeiro/Espelho/washout idênticos). Sem impostos/líquido (não existe no modelo; não pedido). Migration só a CHECK; resto é código/texto.

### A.2 Casca do hub (CC1–CC15)

> ⚠️ **A §5 (RC, 2026-07-27) derruba quase toda esta seção.** A casca de hub + sub-abas deixa de existir: caem **CC3** (`/financeiro` redirect), **CC4** (`?tab=` em `/contratos`), **CC6** (acesso por aba — já dissolvida pelo acesso unificado), **CC7** (portas únicas de Aprovação e Embarque), **CC8/CC9** (ordem e default das abas), **CC10** (item de nav único) e o que restava da **CC15**. Sobrevivem **CC1** (a rota do contrato continua `/contratos`), **CC13** (autoridade documental) e **CC14** (o faseamento cumpriu seu papel). **A CC11 caiu em 2026-07-28**: a entrada mobile deixou de ser o menu do avatar — "Contratos" virou a **3ª aba da tabbar** (pedido direto do Flavio, não pelo ciclo SN), e a linha saiu do `HeaderAvatarMenu` para não haver porta dupla. Lê-se abaixo como histórico do porquê, não como regra vigente.

- **CC1** — Rota do hub = manter `/contratos` (zero quebra de deep link); `/financeiro` vira redirect.
- **CC2** — Rótulo do item de nav: "Contratos" em F1; na F2 passa a ser por papel (ADMIN/COMMERCIAL "Contratos", operacionais "Embarques") — ver CC15.
- **CC3** — `/financeiro` redireciona para `/contratos?tab=financeiro`.
- **CC4** — Aba ativa na URL via query `?tab=` (`contratos|financeiro|aprovacoes|embarque`), default `contratos`, coexistindo com `?details=`.
- **CC5** — Reusar a mecânica de abas do `/cadastros`; as páginas de Contratos e Financeiro viram componentes de painel.
- **CC6** — Acesso por aba: hub visível a todos os não-PROSPECTOR; Contratos/Financeiro só ADMIN+COMMERCIAL, Aprovações/Embarque a todos os não-PROSPECTOR (operacionais veem só essas duas).
- **CC7** — Portas redundantes: Aprovações resolvido (a sub-aba é a única porta de geração, AP29); Embarque resolvido pela EMB26 (dashboard = navegação pura, sub-aba = casa).
- **CC8** — Ordem das abas: Contratos · Financeiro · Aprovações · Embarque.
- **CC9** — Aba default = Contratos (a primeira aba visível ao papel).
- **CC10** — Um único item de nav pro hub: remove o `FINANCEIRO_NAV_ITEM` e corrige o bug do avatar (`isAdmin`→`CONTRATOS_ROLES`); rótulo por papel.
- **CC11** — Entrada no mobile = menu do avatar (um item); tabbar intacta.
- **CC12** — (histórico) Abas vazias em F1 = placeholder "em breve"; a F2 preencheu Aprovações e Embarque.
- **CC13** — Autoridade documental: a casca (página/abas/URL/acesso/nav) e a lógica interna das abas hoje vivem na `Contratos-Visao-Geral.md`; Auditoria e README apontam pra ela.
- **CC14** — Fases: F1 = casca + Contratos/Financeiro migrados + redirect + nav única, sem backend; F2+ = conteúdo das abas + acesso por papel + rótulo por papel + portas redundantes.
- **CC15** — Forma de expor Aprovações/Embarque aos operacionais = opção 1' (uma página `/contratos`, uma casca, abas filtradas por papel e rótulo do item de nav por papel: ADMIN/COMMERCIAL "Contratos"/4 abas, operacionais "Embarques"/2 abas); vigora na F2.

### A.3 Aprovações — "o portão" (AP1–AP30)

- **AP1** — `requiresApproval` (booleano) no `SaleContract` + estado DERIVADO, sem enum próprio; refinado pela AP14.
- **AP2** — Marcação nasce no formulário de criação do contrato e é editável no Editar (um só lugar cobre à vista e Futuro).
- **AP3** — Escolha obrigatória, sem default: segmentado Sim/Não, nada pré-selecionado.
- **AP4** — Contrato à vista também é criado em /contratos, então a marcação obrigatória vive na criação do contrato (`createSpotSaleContract`).
- **AP5** — Contratos anteriores ao flag recebem `requiresApproval = false` pela migration (DEFAULT false); sem backlog de marcação.
- **AP6** — (revertida por DSB-D9; `approvalReminderLeadDays` permanece no schema, sem consumidor).
- **AP7** — (revertida por AP29 / DSB-D9).
- **AP8** — (revertida por AP17).
- **AP9** — Quem decide o sinal = criadores do contrato: ADMIN + COMMERCIAL (inerente ao form; COMMERCIAL só nos dele).
- **AP10** — Quem gera / vê a aprovação = todos os não-PROSPECTOR, sem escopo por posse.
- **AP11** — Geração de etiqueta removida do card de /contratos (botão "Aprovação" sai; a timeline de auditoria fica).
- **AP12** — Não há aprovação sem contrato: `sendApprovalLabel` exige `saleContractId` (422); fim da etiqueta avulsa.
- **AP13** — Desfecho aprovado/recusado fica FORA do sistema; rastreabilidade pelo proxy do nº de envios.
- **AP14** — Estado derivado com 3 valores (não se aplica / a enviar / enviada), ciente do status: "pendente" só em `EMITIDO`; "feita" renomeada para "enviada".
- **AP15** — Identidade laranja `#f97316` e rótulo "a enviar" seguem na worklist/card; o dot no calendário do dashboard saiu com DSB-D9.
- **AP16** — Envios de aprovação num card dedicado "Aprovações enviadas" (nº do contrato + comprador, inerte); desde DSB-D14 (2026-07-14) o card mora no **topo da sub-aba Aprovações** de `/embarques` (saiu do dashboard); ver `Contratos-Visao-Geral.md` §7 e `Dashboard-Visao-Geral.md` §7.2.
- **AP17** — Gerar etiqueta exige contrato marcado "Sim" (409 `APPROVAL_CONTRACT_NOT_MARKED`); reverte AP8.
- **AP18** — Faturar exige ≥1 etiqueta enviada (422 `CONTRACT_APPROVAL_REQUIRED` em `invoiceSaleContract`); pagar herda.
- **AP19** — Washout isento do portão (contrato marcado sem envio pode ir a `WASH_OUT`).
- **AP20** — Desmarcar (Sim→Não) só em `EMITIDO` e sem envio; após o 1º envio trava em "Sim" (409 `APPROVAL_FLAG_LOCKED`). _(endurecida pela **AP32**: Sim→Não vira **impossível sempre** — latch de mão única; o "Editar" deixa de tocar o sinal.)_
- **AP21** — Portão no faturar (pagar herda); portas listam só marcados; elegibilidade de geração = só `EMITIDO` (`APPROVAL_ELIGIBLE_STATUSES = [EMITIDO]`); etiqueta gerada = proxy da amostra enviada.
- **AP22** — (revertida por DSB-D9).
- **AP23** — Toggle rápido Sim/Não no Detalhes do contrato (`setSaleContractApprovalFlag`, ADMIN/COMMERCIAL, travas da AP20, lead default 30). _(reformada pela **AP32**: o par Sim/Não vira o botão **"Solicitar aprovação"** de mão única — Não→Sim com confirmação; sem mais desmarcar.)_
- **AP24** — A worklist mostra o nº de envios: "enviada" (1×) / "enviada · N×" (>1); sem rotular "provável recusa".
- **AP25** — Sub-aba lista todos os contratos marcados, com filtro por status, abrindo na fila "a enviar".
- **AP26** — Cada linha: status (dot + rótulo, ·N× na enviada), nº do contrato, comprador, data e sacas — só campos não-sensíveis.
- **AP27** — Ações por linha: [Gerar] só em marcado + `EMITIDO`; "Ver contrato" só ADMIN/COMMERCIAL; o botão "Solicitar aprovação" (AP32, ex-toggle AP23) mora no Detalhes.
- **AP28** — Filtro por status (A enviar · Enviadas · Canceladas · Todas, default A enviar), busca por nº/comprador, ordem por faturamento planejado.
- **AP29** — Geração concentrada só na sub-aba: dashboard vira navegação pura (reverte AP7) e /samples perde o leque de aprovação; exceção = recuperação INLINE reativa no portão do faturar (AP18).
- **AP30** — Tab segue CC6/CC15 (todos os não-PROSPECTOR; rótulo de nav por papel; operacional ganha 2 abas Embarque+Aprovações); lista não-escopada (AP10); "Ver contrato" escopado (D110).
- **AP-P1** — Dispensada (AP15): "provável recusa" não vira superfície in-app (rotulação externa/BI); AP24 expõe só o nº de envios neutro.
- **AP-P2** — Estado "atrasado" adiado como feature futura (fácil no embarque via `invoiceDate` — o Modelo X/EMB22 não tem campo `shipmentDate`; delicado na aprovação por falta de data-limite exata); por ora só "pendente".
- **AP-P3 (PENDENTE, 2026-07-16)** — **Unificar os dois lot-splitters** (revisão específica futura, pedido do Flavio; achado 🟢 da AP-higiene). Dois helpers quebram uma string de lotes com **separadores diferentes**: `normalizeCustomLabelLines` (`backend-api.js`, `split(/[,\n]+/)` — vírgula/newline) e `splitOriginLotForLabel` (`sale-contract-support.js`, `split(/[\s,;]+/)` — espaço/vírgula/; — o **traço saiu em 2026-07-19** pra preservar códigos como `PA-01`). **Bem menos urgente** agora: a colisão que rachava código pelo hífen sumiu e, com a etiqueta read-only (Lote de origem sempre juntado por ", "), o `[,\n]+` do outro helper faz round-trip limpo. **Latente** (alimentam superfícies distintas — o custom-lines do modal vs a quebra do Lote de origem do prefill — sem colisão real). **Decidir:** unificar num separador canônico OU documentar por que diferem de propósito. (A "válvula de escape" — desmarcar antes do 1º envio — NÃO é pendente: foi **descartada** na AP32 a favor da mão única pura.)
- **AP31 (2026-07-15)** — **Aviso de "aprovação a enviar" (re-liga o `approvalReminderLeadDays`).** O lead-time, retido **sem consumidor** desde a remoção do lembrete de calendário (DSB-D9), volta a ter uso: alimenta a janela de um **aviso** no novo **card de Avisos** do dashboard (**DSB-D19**, `Dashboard-Plano-de-Trabalho.md`). **Regra (binária, não fan-out):** o aviso existe enquanto `requires_approval=true AND status='EMITIDO' AND NOT EXISTS(approval_label_log) AND (invoice_date IS NULL OR invoice_date <= hoje_BRT + COALESCE(approval_reminder_lead_days,0) dias)` — reusa o predicado da worklist **G0** + o índice `idx_sale_contract_requires_approval_status_invoice` (ambos já existem → **sem migration**). **Some** quando a etiqueta é gerada (≥1 no `approval_label_log`) — e naturalmente já sai se o contrato deixa EMITIDO (faturado/washout). **"À definir" (D144): SEMPRE avisa** (sem prazo) — um contrato marcado + sem etiqueta + sem data é, se qualquer coisa, **mais** urgente; coerente com a worklist G0 (que já lista os sem data, `NULLS LAST`). O feed antigo os **escondia** (`invoiceDate: { not: null }`); aqui o predicado inclui `invoice_date IS NULL`. **Escopo aberto**, todos os não-PROSPECTOR (= worklist, AP10). Colapsa o _fan-out_ impreciso que motivou o DSB-D9 (o mesmo contrato borrado por N dias do calendário) num **flag binário** (pendente → some). O texto de urgência ("vence esta semana/este mês/em N dias", "sem data" p/ À definir) e a apresentação vivem na DSB-D19.
- **AP32 (2026-07-16)** — **Aprovação vira latch de mão única + botão "Solicitar aprovação" (reforma AP20/AP23; fecha o furo do "Editar").** `requiresApproval` passa a ser **irreversível** uma vez "Sim": Não→Sim é permitido, Sim→Não **nunca** — nem antes do 1º envio (endurece a AP20, que só travava após o envio). **Motivo:** o "Editar" (`emitSaleContract` → `_resolveEmitData`) regravava o sinal do payload **sem** a trava do toggle, e como o portão do faturar é `if (requiresApproval)` (AP18), dava pra desmarcar em `EMITIDO` e **zerar o portão** (achado 🔴; sem teste). Em vez de duplicar a trava, o modelo colapsa: (a) o **`emitSaleContract` deixa de tocar** `requiresApproval` (preserva o do banco — as 3 rotas compartilham `_resolveEmitData`, mas só o emit strippa; criar-à-vista/futuro seguem gravando, **Shape B**); (b) o marcar-depois deixa de ser via Editar e vira um **botão "Solicitar aprovação"** no Detalhes (só quando "Não" + `EMITIDO` + gerencia), com **confirmação** (é definitivo); (c) o `setSaleContractApprovalFlag` vira **latch-only** — rejeita `false` incondicional (409 `APPROVAL_FLAG_LOCKED`), idempotente em já-"Sim" (**não re-seta o lead**), Não→Sim grava `true` + `approvalReminderLeadDays=30`. **Criação mantém a escolha Sim/Não** (Shape B; "Sim" já nasce travado). O **lead** segue editável pela etapa 2 quando "Sim" (não é portão, só a janela do card de Avisos, AP31); o latch nunca mais o apaga — **colateral 🟢:** o reset do toggle a cada uso (que virou efeito real após a AP31) deixa de existir. No **Editar** a aprovação vira **read-only**. Congelamento por status da AP20 (só `EMITIDO`, `APPROVAL_FLAG_NOT_EDITABLE`) mantido. **Sem migration** (regra/gate; contratos já-"Sim" seguem "Sim"). A "válvula de escape" (permitir desmarcar antes do 1º envio) foi **descartada** a favor da mão única pura (pedido do Flavio).
- **AP33 (2026-07-16)** — **Worklist de Aprovações alinha o "cancelado" ao Financeiro (`type='FUTURO'`).** O bucket G2 (`WASH_OUT`) do `listApprovalContracts` filtrava só por `status` (sem `type`), então um **à vista** cancelado por washout **aparecia** na worklist como "cancelado" — mas o Financeiro o **esconde** (D145: à vista washout não paga corretagem, sai por `WASHOUT_BILLABLE={status:'WASH_OUT',type:'FUTURO'}`). As duas abas discordavam do que é "cancelado" (achado 🟡). **Fix:** a G2 passa a filtrar `AND type='FUTURO'` (espelha `isSpotWashout`/`WASHOUT_BILLABLE`), fechando o princípio do D147 ("o washout ramifica por type, alinhado ao Financeiro/Espelho") — que não havia alcançado a worklist. À vista washout segue visível só em `/contratos` (status Wash-out). **Sem migration.**
- **AP-higiene (2026-07-16, pós-AP29):** removidos comentários stale (porta /samples / "avulsa" em `ApprovalLabelModal`, `normalizeCustomLabelLines`, `buildApprovalPrefill`), o **picker dormente** `/approval-labels/contracts` (rota+handler `listApprovalContractOptions`+tipo `ApprovalContractOption`+mapper, sem caller — o sub-route `.../prefill` fica) e o **branch "Voltar" morto** do `ApprovalLabelModal` (2 callers passavam `null`). Os **dois lot-splitters** com separadores diferentes (`,\n` vs `-\s,;`) ficam para revisão específica futura (**AP-P3**, fora desta leva).

### A.4 Embarque (EMB1–EMB34; EMB30/EMB31 = FASE 2, IMPLEMENTADA 2026-07-16)

- **EMB1** — Embarque é evento NOVO e distinto do faturamento (café carregado no caminhão; mesmo dia por padrão, datas podem divergir).
- **EMB2** — Gate pela MODALIDADE (não pelo tipo), via flag `requiresShipment` da `ContractModality` (EMB21): semeada `true` em Retirar/Posto, `false` em Disponível. _(A flag tem default `false` no schema — uma modalidade criada à mão nasce **sem** embarque até P28 dar editor da flag; não é "qualquer outra = com embarque".)_
- **EMB3** — (revisada pela EMB21 — o sinal Sim/Não migrou do contrato pra flag na modalidade).
- **EMB4** — (derrubada pela EMB22 / Modelo X — sem campo de data de embarque própria).
- **EMB5** — (derrubada pela EMB22 / Modelo X — sem data própria pra editar; move-se o faturamento).
- **EMB6** — (superada — o "Embarque finalizado" foi desenhado no Bloco 3 e implementado; ver EMB27).
- **EMB7** — Visibilidade do evento = todos os não-PROSPECTOR, sem escopo por posse (endpoint auth-only).
- **EMB8** — Janela: aparece só no dia previsto (sem fan-out de lembrete), persiste após FATURADO, com reflexo vermelho pós-prazo (EMB24) — ancorada na `invoiceDate`.
- **EMB9** — Status que mostram o evento: EMITIDO + FATURADO (some em PAGO e WASH_OUT).
- **EMB10** — Dot azul `#2563eb` (typeKey `contract_shipment`) para o agendado. _(apresentação revisada pela DSB-D10 — o calendário passou a colorir o chip por `data-state` (previsto/atrasado/realizado), não por typeKey; a cor do previsto segue azul.)_
- **EMB11** — (revisada pela EMB26 — dashboard virou navegação pura; rótulo `embarque · nº · comprador` segue como texto do evento).
- **EMB12** — (revisada pela EMB26 — sem acordeão/expandido no dashboard; ação e detalhe migram pra sub-aba).
- **EMB13** — (revisada pela EMB27 — fotos deixaram de ser obrigatórias e viraram opcionais 0–10).
- **EMB14** — (revisada pela EMB27 — mín. 1 → mín. 0; teto 10, JPEG/PNG/WebP, 12 MiB mantidos).
- **EMB15** — (revisada pela EMB27 — `shippedAt` deixou de ser "hoje fixo" e virou seletor: default hoje, máx hoje).
- **EMB16** — Confirmar embarque = todos os não-PROSPECTOR, sem escopo por posse.
- **EMB17** — Realizado no calendário no dia do `shippedAt` (typeKey `contract_shipment_done`), permanece no histórico. _(cor revisada pela DSB-D10 — o realizado passou a ser **verde** por `data-state`, não o azul-escuro `#1e40af` original.)_
- **EMB18** — Fotos + data real vistas no Detalhes do contrato, seção "Embarque" read-only (ver ≠ confirmar).
- **EMB19** — Confirmação é TERMINAL: sem undo e sem troca de fotos.
- **EMB20** — A casa do embarque é a sub-aba (worklist `a embarcar`/`atrasado`/`embarcado` + ação de confirmar); dashboard = companheiro; o atraso entra agora.
- **EMB21** — Sinal "terá embarque" = flag na `ContractModality`, herdada por snapshot no contrato (`requiresShipment`); some o Sim/Não do modal; defaults Retirar/Posto = sim, Disponível = não.
- **EMB22** — "Modelo X": não há data de embarque própria — o dia previsto É a `invoiceDate`; atrasado = passou a `invoiceDate` sem embarcar; sobram no contrato só `requiresShipment` + `shippedAt`. _(parcialmente revisada pela D144 — FUTURO sem `invoiceDate` agora ENTRA na fila como "à definir": fim do G0 em ordem de emissão, nunca atrasado; o resto do Modelo X permanece.)_
- **EMB23** — Estados derivados (sem enum): a embarcar / atrasado (`hoje > invoiceDate`) / embarcado (`shippedAt`) / cancelado (WASH_OUT); atraso acende no dia seguinte, em EMITIDO+FATURADO.
- **EMB24** — Atraso: fila durável na sub-aba (contador "N atrasados") + reflexo vermelho `#dc2626` no calendário.
- **EMB25** — Linha da fila: chip · nº · comprador · data (prevista=`invoiceDate` / embarcado=`shippedAt`) · sacas · armazém do vendedor; só dado não-sensível; ordem cronológica crescente; filtros + busca.
- **EMB26** — Papéis na sub-aba: [Confirmar embarque] = todos os não-PROSPECTOR, "Ver contrato" = só ADM/COMMERCIAL; dashboard vira navegação pura (toca → sub-aba). _(D110 dissolvida na unificação 2026-07-15 — hoje "Ver contrato" abre a **todo não-PROSPECTOR** (`CONTRATOS_ROLES = NON_PROSPECTOR_ROLES`); ver §16 e VG §2.)_
- **EMB27** — Confirmação: fotos OPCIONAIS 0–10 (JPEG/PNG/WebP, 12 MiB) + `shippedAt` por seletor (default hoje, máx hoje, recusa fim de semana → `422 WEEKEND_DATE`); modal terminal com aviso de irreversibilidade.
- **EMB28** — Portão híbrido no PAGO: não paga contrato que exige embarque e ainda não embarcou; modal só com [Confirmar embarque] → confirmado, segue direto pro pagamento.
- **EMB29** — Local do embarque = armazém do vendedor (`sellerWarehouseSnapshot`), sempre.
- **EMB30 (FASE 2, IMPLEMENTADA 2026-07-16)** — **Transporte "Pela empresa | Por terceiros"** na confirmação (obrigatório, sem default). Enum `ShipmentCarrier {COMPANY, THIRD_PARTY}` no `SaleContract`; "Pela empresa" → **responsável obrigatório** (`shipmentResponsibleUserId` FK + `shipmentResponsibleName` snapshot, molde `brokerNameSnapshot`); "Por terceiros" → nada extra. Gravado na MESMA `updateMany` do `confirmShipment` (sem bumpar version, EMB22); presença exigida no serviço (**422 `SHIPMENT_RESPONSIBLE_INVALID`** iff `COMPANY`). `shipmentCarrier` **nullable** (null = não embarcado, molde `shippedAt`) — **não** `NOT NULL DEFAULT` (legado/não-embarcado não ganham carrier fabricado); **sem CHECK** (o 422 do serviço é a trava). Normalizador `normalizeShipmentCarrier`. **UI:** toggle `.ctr-approval-choice` no modal + `UserSelect`/`lookupUsersForReference` (ativos não-PROSPECTOR) **sem pré-seleção** (escolha explícita, decisão do Flavio); transporte/responsável exibidos só no Detalhes. Migration `20260716120000`.
- **EMB31 (FASE 2, IMPLEMENTADA 2026-07-16)** — **Fotos do embarque expiram em 15 dias.** Retenção = filtro `created_at >= cutoff` em **AS DUAS** leituras (`listShipmentPhotos` **E** `getShipmentPhotoDescriptor` — senão a foto some da galeria mas a **URL direta ainda serve os bytes**; retenção só na lista = cosmética) + **purga oportunista** com throttle de 1h. ⚠️ O throttle é **código NOVO**: o precedente `expireStalePrintJobs` **não tem** throttle (roda a cada chamada, sem I/O de arquivo) e no Cloud Run o estado é **per-instância best-effort** (perde no cold start; baixa-carga deixa >15d no disco até uma request re-armar — delete idempotente, benigno). Ordem da purga: **linha→arquivo** (não arquivo→linha) — alinha ao invariante do repo "órfão de arquivo é tolerado, órfão de linha não". `purgeExpiredShipmentPhotos` armada por `listShipmentPhotos` (fire-and-forget; `force` só nos testes). Aviso "fotos ficam 15 dias" no modal; no Detalhes, galeria vazia + >15d do embarque → **"não estão mais disponíveis (retenção de 15 dias)"** (decisão do Flavio) em vez de "sem fotos". Índice `(sale_contract_id, created_at)` já existia.
- **EMB32 (2026-07-16)** — **`requiresShipment` vira snapshot congelado no Editar (gêmeo do AP32).** O `emitSaleContract` re-derivava `requiresShipment` da modalidade a cada Editar; se alguém baixasse a flag "embarca?" da `ContractModality`, um Editar de campo qualquer **re-snapshotava** e o contrato **perdia o embarque em silêncio** (sumia da worklist, parava de travar o pagamento — achado 🟡, gêmeo do furo AP20). **Fix:** o Editar só re-deriva se a **modalidade do contrato mudar ali** E o embarque ainda não foi confirmado (`if (data.modalityId === contract.modalityId || contract.shippedAt) delete data.requiresShipment`). Fecha junto a **corrida confirm+edit**: quando o Editar baixa `requiresShipment`, a trava por version não enxerga um confirm concorrente (`confirmShipment` não bumpa version), então o `where` do update exige `shippedAt:null` nesse caso → um confirm que escapou força um 409 retryável. **Sem migration.**
- **EMB33 (2026-07-16)** — **Portão EMB28: arestas aparadas.** Mantém o fluxo reativo (clica Pagar → 422 `CONTRACT_SHIPMENT_REQUIRED` → modal de embarque), mas: (a) toast **"Embarque confirmado"** no hand-off (o embarque é irreversível e antes seguia em silêncio pro pagamento — só "Pagamento registrado"); (b) o diálogo de pagamento **sai de cena** enquanto o modal do portão está aberto (`!needsShipment && !needsApproval`) — elimina o **backdrop duplo** (vale também pro portão de aprovação AP18). **Só frontend.**
- **EMB34 (2026-07-16)** — **Guards do modal de confirmação + data em BRT.** (a) `shippedAt` usa **hoje-BRT** (`todayInputValueBRT`; era hora do device → off-by-one perto da meia-noite, divergindo do guard do backend); (b) o seletor **nasce no último dia útil ≤ hoje** (`lastBusinessDayIso`) — abrir num fim de semana não vira beco (o fds **segue bloqueado**, EMB27, por decisão do Flavio); (c) foto **> 12 MiB recusada no cliente** e seleção **> 10 avisa** (não trunca em silêncio). Helpers novos em `lib/business-days.ts` (reusados pelo `SaleContractLifecycleDialog`). **Só frontend.**
