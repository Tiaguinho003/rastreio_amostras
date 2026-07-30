# Contratos — Plano de Trabalho

Status: Em andamento (backlog + decisões + pendências da página `/contratos`)
Escopo: o backlog, as pendências e o **ledger de decisões** da feature de Contratos (hub `/contratos`: contrato/PDF, Espelho de Corretagem, Financeiro, Aprovações, Embarque). O **estado atual** do que existe vive em `Contratos-Visao-Geral.md`; aqui ficam as decisões (o porquê), as pendências abertas e o histórico condensado.
Última revisão: 2026-07-29 (**§12 — RC-D96..D102 IMPLEMENTADAS**: a etiqueta de aprovação deixa de ser write-only — só **Nº compra** e **Lotes de origem** são editáveis, e os dois **gravam de volta** (contrato e cadastro do lote) antes de imprimir; o lote **trava** quando é liga ou componente de liga, e o campo edita o **texto cru**, nunca os chips recortados; lote vazio some do papel. Antes, no mesmo dia: **§11 — RC-D92..D95**, o `/financeiro` entra no kit FV — desktop vira **tabela**, os quatro estados viram a **KPI row clicável que é o filtro** (o `totalCommission` sai por ser a soma deles) e o acordeão do card morre. Fecha a **2ª rodada da RC-F6**. Antes, no mesmo dia: **§10 — RC-D87..D91**, o washout **pergunta** se haverá cobrança de corretagem e a resposta — não mais o tipo — decide o Financeiro (revoga a D145); o lote deixa de desfazer venda e de trocar de dono com contrato. **§9 — RC-D84..D86**: finalizar significa que o contrato inteiro aconteceu, e só existe a partir da data de faturamento. **§8 — RC-D74..D79**: status e fase são dois conceitos; embarque e faturamento são o MESMO DIA. **§7 — RC-D69..D73**: a seleção de lote vira **campo** e a criação à vista cai para dois passos. Anterior: 2026-07-28, **§6 — RC-D62..D68**: o contrato deixa de ser máquina de status e vira **agenda**)
Documentos relacionados: `Contratos-Visao-Geral.md` (documento-mãe / estado atual), `Dashboard-Visao-Geral.md`, `API-e-Contratos.md`, `Auditoria-Navegacao-por-Papel.md`

> **Divisão de papéis:** a `Contratos-Visao-Geral.md` é a **verdade viva** (o que existe hoje). Este plano guarda **decisões (por quê), pendências (o que falta) e o backlog**. O histórico completo de sessões (S1–S91 etc.) e a prosa superada foram para o **Git** (docs antigos removidos em 2026-07-13); o ledger no apêndice condensa cada decisão à resolução final.

---

## 1. Estado geral

Contrato à vista + futuro, a criação repensada (RC-F5) e a moldura institucional da lista (1ª rodada da RC-F6) estão **implementados ponta a ponta** — gates verdes (lint/format/typecheck/unit/integração/build) — em `main`, **não pushados**, **aguardando validação no device**.

> ⚠️ **A §6 (2026-07-28) mudou a natureza do contrato.** Ele **não é mais máquina de status**: são **três situações** (`EMITIDO` · `FINALIZADO` · `WASH_OUT`) e uma **agenda derivada** das datas do documento. **Faturar, Pagar e Embarcar não existem mais**; o embarque inteiro (EMB1–EMB34) foi apagado, a aprovação não trava nada (AP18 revogado) e o `/financeiro` virou leitura. Tudo o que o ledger abaixo diz sobre `FATURADO`, `PAGO`, embarque e portões é **histórico**.

> **Split 2026-07-13 + ACESSO UNIFICADO 2026-07-15:** o hub `/contratos` virou **2 páginas** — `/contratos` (Contratos + Financeiro, gestão) e `/embarques` (Embarque + Aprovações, operação). Desde 2026-07-15 **ambas abertas a todo não-PROSPECTOR** (`CONTRATOS_ROLES`/`FINANCEIRO_ROLES` = `NON_PROSPECTOR_ROLES`; a gestão era ADMIN+COMMERCIAL). O ledger histórico abaixo (D110/D135/D140, CC6, AP9/AP27, EMB26) descreve os gates **da época** — a fonte do estado atual é `Contratos-Visao-Geral.md` §2.

> ⚠️ **A §5 (RC, 2026-07-27) reorganizou esta casca.** Já estão no código: `/financeiro` é página própria ADMIN, `/contratos` é página única sem sub-abas, `/embarques` é redirect (§5.9); a criação virou painel (§5.10–§5.16, hoje de **dois** passos pela §7); a lista entrou no kit FV (§5.12). O que **ainda não** está: a RC-F2 e a RC-F3 — **as duas re-escopadas pela §6**, porque não há mais 5 fases para desenhar.

## 2. Pendências abertas

- ~~**P27 — Layout e design das páginas de Contrato**~~ (Fase G): **FECHADA em 2026-07-29**. A parte de _disposição das páginas_ virou o ledger RC-D1..D12 (§5); a de _layout e design_ era a **RC-F6**, concluída em duas rodadas — `/contratos` (§5.12) e `/financeiro` (§11). Falta só a validação no device.
- **P28 — Gestão das 3 listas cadastráveis** (Modalidade / Forma de pagamento / Embalagem): renomear / inativar / reordenar (`sortOrder`) — adiada (D95; hoje só existe "+ Adicionar").
- ~~**AP-P2 — Estado "atrasado" na Aprovação**~~ — **FECHADA pela RC-D64 (§6)**: atraso passa a existir **só no `paymentDate`**. A aprovação não atrasa: o aviso aparece na janela do lead e se recolhe sozinho.
- **Validação no device:** todo o fluxo (à vista/futuro, criação em **2 passos** com o lote como campo, lista FV, finalizar/reabrir) precisa do ✅ no aparelho.

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

| #             | Decisão                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D1**     | `/contratos` perde as sub-abas e vira **página única**; **`/financeiro` vira página própria** (hoje é redirect). Derruba a casca inteira do hub: **CC3** (redirect), **CC10** (item de nav único — o `FINANCEIRO_NAV_ITEM` volta), **CC4** (o `?tab=` de `/contratos`), **CC8/CC9** (ordem e default das abas) e o resto da **CC15**. **CC1** permanece: `/contratos` segue sendo a rota do contrato. |
| **RC-D2**     | **`/embarques` morre** — a rota vira redirect → `/contratos`, no padrão que o repo já usa em `/financeiro`, `/samples/[id]` e `/clients/[id]`.                                                                                                                                                                                                                                                        |
| **RC-D3**     | Acesso: **Contratos = os 5 não-PROSPECTOR** (inalterado); **Financeiro = ADMIN**. Seria a **primeira** rota ADMIN-only do domínio — hoje nenhuma é.                                                                                                                                                                                                                                                   |
| **RC-D4**     | **Dinheiro continua visível a todos dentro do contrato.** O gate é de **rota, não de campo**: o backend segue devolvendo os valores; o ADMIN-only protege só a carteira.                                                                                                                                                                                                                              |
| **RC-D5**     | **`FINANCEIRO_ROLES` se parte em dois**: carteira (ADMIN) × feeds de calendário (não-PROSPECTOR). Sem isso, 4 dos 5 papéis perderiam o pagamento no calendário do dashboard.                                                                                                                                                                                                                          |
| ~~**RC-D6**~~ | ⚠️ **REVOGADA pela RC-D67 (§6)** — "Pagar" não migrou: **morreu**. O que fecha o ciclo do dinheiro hoje é o **Finalizar**, no contrato, aberto a todo não-PROSPECTOR — o efeito pretendido, por outro caminho. Original: "Pagar" migra do card do Financeiro para a fase Pagamento do contrato, revogando a D137.                                                                                     |
| **RC-D7**     | Ordem visual das fases = **operacional**: Emissão → Aprovação → **Embarque** → Faturamento → Pagamento. Contraria a ordem dos portões (embarque trava o PAGO), que segue valendo no backend — o café sobe no caminhão antes de faturar, e a tela conta o que acontece.                                                                                                                                |
| **RC-D8**     | A fase é **derivada**, nunca persistida — sem coluna, sem migration, sem trigger. Coerente com a D77 ("o Financeiro é view derivada, sem schema próprio").                                                                                                                                                                                                                                            |
| **RC-D9**     | **A lista de contratos absorve as duas worklists**: filtro por fase calculado no servidor, com keyset e contadores estáveis.                                                                                                                                                                                                                                                                          |
| RC-D10        | Decorrência de RC-D1: a **geração da etiqueta de aprovação** passa a morar no contrato — **revoga AP29/CC7** ("a sub-aba é a única porta"). A recuperação inline no portão do faturar (AP18) permanece.                                                                                                                                                                                               |
| RC-D11        | Decorrência de RC-D1: a **confirmação de embarque** passa a morar no contrato — **revoga EMB20/EMB26/CC7** ("a casa do embarque é a sub-aba"). O portão do pagar (EMB28/EMB33) permanece.                                                                                                                                                                                                             |
| RC-D12        | **A criação do contrato entra no escopo** (Etapa 2 + LotPicker) — **reabre a RD11**, que a deixara de fora aguardando specs do Flavio.                                                                                                                                                                                                                                                                |

### 5.3 Em aberto — travam a fase que depende delas

- **RC-A1 — a superfície do contrato.** Painel lateral de 620px (hoje; realinhamento validado em 2026-07-20, RD9/F3), página própria `/contratos/[id]`, ou híbrido. **Trava a RC-F2.** ⚠️ **A §6 aliviou a escolha**: o detalhe não concentra mais 5 fases com ação — é documento + agenda + histórico. O argumento a favor da página própria enfraqueceu.
- ~~**RC-A2 — o card "Aprovações enviadas"**~~ — **FECHADA em 2026-07-27 pela RC-D26**: morre, e leva o `RecentSendsCard` junto (era o último consumidor vivo dele). Ver §5.9.
- ~~**RC-A3 — o embarque não deixa rastro no histórico**~~ — **MORREU COM O EMBARQUE** (RC-D65, §6). Não há mais confirmação a registrar.

### 5.4 O modelo de fases

> ⚠️ **Ledger histórico — REVOGADO pela RC-D62 (§6).** As linhas de Embarque, Faturamento e Pagamento descrevem capacidades que **não existem mais**; `FATURADO` e `PAGO` saíram do enum. Ficou de pé só a ideia de derivar em vez de persistir (RC-D8), que virou a **agenda** da RC-D68.

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

> ⚠️ **Ledger histórico.** As linhas **Confirmar embarque**, **Pago** e **Faturado** foram **revogadas pela RC-D62/RC-D65 (§6)** — as três capacidades deixaram de existir. As demais valem.

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

**RC-F2 — as fases entram no contrato.** ⚠️ **RE-ESCOPADA pela §6.** A premissa caiu: **não há mais 5 fases para desenhar**, e as duas ações que ela ia acomodar acabaram (`ShipmentConfirmationModal` apagado, `ApprovalLabelModal` sem portão que o chame de volta). O que sobrou: o detalhe do contrato = **documento + agenda + o que de fato aconteceu**, e a `deriveContractAgenda` já nasceu como função pura com teste unitário (§6.3). Segue dependendo da **RC-A1** — que ficou mais leve.

**RC-F3 — a lista vira worklist.** ⚠️ **RE-ESCOPADA pela §6.** A worklist não é mais "contratos na fase X", é **"contratos com algo por vir"** — a agenda da RC-D68. 🟡 **O encanamento está de pé** (RC-D45, §5.12: busca, filtros e paginação por cursor no servidor). **Falta** decidir se a agenda vira ordenação/filtro **no SQL** — hoje ela é derivada em JS depois do `findMany`, o que basta para a página corrente mas não para ordenar a lista inteira por urgência nem para os contadores da faixa de KPI. Ficou muito menor: a expressão caiu de 7 campos para 5, e sumiram o anti-join de embarque e o keyset particionado por grupo.

**RC-F4 — `/embarques` morre.** ✅ **IMPLEMENTADA em 2026-07-27, ANTECIPADA** — o roteiro a punha depois da RC-F2, e o Flavio escolheu juntá-la à F1 (RC-D21). Viável porque as duas ações que só a worklist oferecia mudaram de casa no mesmo passo (RC-D25). Ver §5.9. Dependia da RC-A2, fechada pela RC-D26.
Escopo original: Rota vira redirect; `EmbarquePanel`, `AprovacoesPanel`, `EmbarqueCard`, `AprovacaoCard` apagados; deep-links re-apontados (`AvisosCard.tsx:23`, `EventsCalendarCard.tsx:58`, `HeaderAvatarMenu.tsx:168`, `AppShell.tsx:99-126`); `contractsHubTabs`/`contractTabRoute` removidos de `lib/roles.ts`; CSS morto varrido. ⚠️ **No mesmo passo, `Dashboard-Visao-Geral.md`** — a Visão Geral de contratos (§11) obriga a atualizá-la a cada mudança de rota, nome de aba ou valor de `?tab=`, e a RC muda os três.

**RC-F5 — a criação repensada** (RC-D12). 🟡 **1ª rodada IMPLEMENTADA em 2026-07-28** (RC-D27..D36, §5.10): seleção do lote, auto-preenchimento, erro no campo e a conferência pelo documento. 🟡 **2ª rodada no mesmo dia** (RC-D49..D52, §5.13): o **picker de lote** ganhou card FV em 4 colunas com cabeçalho fixo, e o status saiu dele. 🟡 **3ª rodada no mesmo dia** (RC-D53..D56, §5.14): a conferência deixou de ser modal central e virou o **2º passo do painel**, com deslize do miolo, ← e ESC voltando um passo e "Ampliar" para ler de perto. 🟡 **4ª rodada no mesmo dia** (RC-D57, §5.15): a **seleção de lote** virou o **1º passo** — o fluxo à vista inteiro (lote → formulário → documento) num painel só, e voltar ao lote deixou de descartar o formulário. 🟡 **5ª rodada no mesmo dia** (RC-D18 + RC-D58..D61, §5.16): o **corpo do formulário** — ordem espelhando o documento, cartão de identidade no lugar dos três jeitos de mostrar o não-editável, seções sem moldura e o painel a 700px. 🟡 **6ª rodada em 2026-07-29** (RC-D69..D72, §7): o lote **deixou de ser passo e virou campo** — a criação à vista caiu para **dois passos** e o cartão de identidade morreu. **A fase está fechada**; falta só a conferência no aparelho.

**RC-F6 — o ciclo FV.** 🟡 **1ª rodada IMPLEMENTADA em 2026-07-28, ANTECIPADA** (RC-D42..D48, §5.12): moldura institucional, tabela no desktop, filtros em painel lateral, estados da lista, Espelho fora das ações da página. **Falta** o conteúdo do **card mobile** e a passada em `/financeiro`, que segue no kit legado.

### 5.7 Gargalos e riscos (achados do levantamento)

- ~~**A fase corrente é expressão de 7 campos**~~ — **a §6 derrubou dois** (`requiresShipment`, `shippedAt`). A **agenda** é expressão de 5 (`status`, `requiresApproval`, `count(ApprovalLabelLog)`, `invoiceDate`, `paymentDate`) e já roda em JS (`deriveContractAgenda`). Levá-la ao SQL para ordenar/filtrar segue exigindo `CASE` + anti-join — mas sem o anti-join de embarque.
- ~~**Hoje a lista de contratos não pagina** — carrega até 500 e filtra no navegador. É o gargalo que a RC-F3 resolve; sem ela, os contadores de fase mentiriam ao passar do teto.~~ ✅ **Resolvido pela RC-D45** (§5.12): busca, filtros e paginação por cursor no servidor, `total` do filtro inteiro. Os contadores **por fase** seguem dependendo da RC-F3.
- **`SALE_CONTRACT_VIEW_SELECT` é allow-list do Prisma** — campo novo que não entre nela volta `undefined`, e isso só aparece no teste de integração.
- ~~**`confirmShipment` não incrementa `version` de propósito**~~ — a invariante frágil **morreu junto com a função** (RC-D65). O `sale-contract-shipment-service.js` não existe mais.
- **As rotas de aprovação são auth-only**, sem gate de papel algum; os handlers de etiqueta têm exceção deliberada de posse com selects mínimos (`backend-api.js`) — **nunca reusar a view completa** ali (vazaria financeiro + PII).
- **CSS**: `.ctr-*` e `.cc-tabs` são exclusivos do escopo; `.emb-*` ficou **morto** com a §6 (a galeria de fotos do Detalhes era o último consumidor) — varrer; `.fin-*` é o kit de worklist e sobrevive no Financeiro.
- **A suíte de integração trunca o banco local** — `db:seed` depois, sempre.
- **Nenhum JSON Schema cobre contratos** — reorganizar não quebra nada validado em CI.

### 5.8 Fluxo 1 — criação do contrato à vista (RC-D13..D20)

> ⚠️ **Ledger histórico.** As decisões de desenho desta seção (RC-D13..D16) foram **revogadas ou superadas** pela análise do fluxo de 2026-07-28 — ver **§5.10**, que é o estado atual. Os achados e a tabela do documento (RC-D18) seguem valendo.

> **Método (combinado 2026-07-27):** as decisões saem da **análise do fluxo, na ordem das ações do usuário** — um fluxo por vez, com layout e superfícies decididos junto. Este é o **primeiro**: do "+" até a emissão. Os status e ações seguintes (aprovação, embarque, faturamento, pagamento) vêm em sequência, depois.

#### O fluxo em 2026-07-27, quando esta análise foi feita

> ⚠️ **Retrato de partida, não o estado atual.** As superfícies descritas aqui foram refeitas pelas §5.10, §5.14, §5.15 e §7 — hoje o fluxo à vista inteiro é **um painel de dois passos**, com o lote como campo.

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
| **RC-D18**     | ✅ **IMPLEMENTADA em 2026-07-28** (§5.16), tabela abaixo aplicada campo a campo. **A ordem dos campos espelha a ordem do documento** — o olho vai do campo ao trecho sem procurar.                                                                                                                                                                                                                                              |
| **RC-D19**     | ✅ **CUMPRIDA** (§5.10) — ⚠️ **e depois revista pela RC-D69 (§7)**: o lote deixou de ser um passo antes e virou o **primeiro campo** do formulário. O motivo original (ele determina vendedor e teto de sacas) continua valendo, e é por isso que ele é o primeiro pendente apontado.                                                                                                                                           |
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

| #              | Decisão                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RC-D21**     | Escopo da 1ª fase = **RC-F1 + RC-F4 juntas**, antecipando a F4. Consequência aceita e resolvida pela RC-D25.                                                                                                                   |
| ~~**RC-D22**~~ | ⚠️ **REVOGADA pela RC-D67 (§6)** — Faturar e Pagar sumiram do card; no lugar deles o menu ⋯ tem **Finalizar/Reabrir**. Original: "Pagar" vai para o card da lista, ao lado de Faturado, e continua no Financeiro para o ADMIN. |
| **RC-D23**     | **Todo chip do calendário aponta para o contrato** (`/contratos?details=<id>&highlight=<id>`), para os 5 papéis. `contractsHubTabs`, `contractTabRoute` e `ContractsHubTab` removidos.                                         |
| **RC-D24**     | A página Financeiro nasce com o **painel intacto**, só trocando de casca. O chrome FV vem na RC-F6, junto com `/contratos`.                                                                                                    |
| **RC-D25**     | **"Gerar etiqueta" e "Confirmar embarque" vão para as seções Aprovação e Embarque do detalhe** — que eram read-only. Executa RC-D10/RC-D11 (revoga AP29, EMB20, EMB26). É a **semente da RC-F2**.                              |
| **RC-D26**     | O card **"Aprovações enviadas" morre**, e leva o `RecentSendsCard` junto. **Fecha a RC-A2.**                                                                                                                                   |

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
- ~~O modal usa **backdrop cheio**, não `.fv-panel-scrim` — exceção deliberada à regra de
  "confirmação sobre painel" (skill `containers` §2), porque o documento precisa da tela inteira e é
  ele o objeto da decisão.~~ ⚠️ **REVOGADO pela RC-D53** (§5.14): não há mais modal nem backdrop —
  a conferência virou o **2º passo do painel**, e a exceção saiu da skill. A pergunta certa não era
  qual backdrop usar; era se aquilo era mesmo um diálogo.

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
que esta rodada entrega é o que torna essa próxima rodada segura de fazer. → **Cumpridas na §5.16**
(5ª rodada), no mesmo dia.

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

#### Segunda rodada (RC-D40/D41), mesmo dia

A conferência da 1ª rodada levantou duas pontas soltas — as duas decididas pelo Flavio:

| #          | Decisão                                                                                                                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D40** | **Mandar `sellerClientId` num contrato COM lote é 422** (`SELLER_DERIVED_FROM_SAMPLE`), nos mesmos 3 caminhos. Aceitar-e-descartar mentia sobre o que o campo faz: quem chamasse a API acreditaria ter trocado o vendedor. O FUTURO (sem lote) segue exigindo o campo.              |
| **RC-D41** | **Trocar o dono de um lote já vendido avisa, e deixa passar.** No "Editar cadastro" do detalhe, quando o dono muda num lote com venda registrada, um hint diz que o contrato passa a sair no nome do novo dono na próxima edição — e que o documento já emitido não muda. Sem gate. |

Na RC-D41 pesou que bloquear obrigaria a dar washout num contrato para corrigir um dono digitado
errado. O aviso é reativo (só quando o dono realmente mudou) e sai de dado que o detalhe já tem
(`soldSacks` + `ownerClientId`) — nenhuma consulta nova.

#### Por que a prévia muda no mesmo commit

Desde a RC-D27/D28 o documento da conferência é o que o "Confirmar" emite. Se só a emissão derivasse
o vendedor do lote, o usuário aprovaria um PDF com um vendedor e emitiria outro. `previewSaleContract`
usa a mesma regra — e o teste gêmeo (`sale-contract.integration.test.js`, "a vista **com** vendedor
explícito recusa com 422") existe para isso.

#### O gargalo escondido: o banco do vendedor

`_requireSellerBankAccount` exige que a conta pertença ao vendedor. Com o vendedor derivado, um
"Editar" cujo lote trocou de dono teria a conta gravada de **outro** cliente — e estouraria 422
`CLIENT_BANK_ACCOUNT_NOT_FOUND` numa edição que só queria mudar a observação. Por isso o
`getSaleContract` passou a devolver **`sampleOwner`** (o dono ATUAL do lote, na consulta que já
buscava o `isBlend`), e a tela, ao ver divergência, **zera filial e banco** — exatamente o que o
`handleSelectSeller` já fazia quando o vendedor mudava à mão. Mesmo tratamento no 409 do lote: se o
dono mudou durante o preenchimento, o campo travado acompanha e o aviso diz isso.

🔴 **Zerar em silêncio era metade da solução.** Os dois campos apareciam vazios sem explicação e o
usuário só descobria no submit, como "campo obrigatório" — um erro que ele não causou. Fechado com um
**banner** no topo do formulário (`.ctr-form-notice`, tom neutro: nada falhou), que **some quando a
conta é reescolhida** em vez de por tempo — é estado persistente, não aviso efêmero
(skill `feedback-messages` §1).

#### O que sobrevive como legado

`blendOwnerPinned`, o rótulo "Carteira da corretora" nos cards/detalhe, o nudge "Atribuir dono
primeiro" do painel de perda e o `deriveBlendOwner` (que segue servindo o `blend-backfill`) **ficam**
— agora servindo só a ligas antigas. O JSON Schema de `registration-confirmed` mantém
`declared.owner` nullable: torná-lo obrigatório quebraria o replay do histórico.

⚠️ **Efeito conhecido, benigno:** um re-run do `backfill-liga-harvest-owner.js` pode atribuir dono por
unanimidade a uma liga legada não-fixada (`blend-backfill.js:149`) e assim destravá-la para venda. É
regularização, não regressão.

#### Bomba-relógio nos testes (achado colateral)

Consertando o teste D138 que quebrou sozinho (`paymentDate` fixo em 2026-07-20 afirmando "previsto"),
apareceu que a suíte tinha **três tratamentos diferentes para o mesmo perigo**: um `bizDay(offset)`
ancorado em hoje (closure local no teste de embarque, com o comentário certo), uma asserta
**afrouxada para aceitar os dois estados** no feed de faturamento — que assim deixou de provar qual
estado é — e o meu `2100` absoluto. Consolidado em `tests/helpers/relative-dates.js`
(`bizDay`/`calendarDay`/`dayKey`), com a asserta do faturamento **reapertada** para
`contract_invoice` + `previsto`. Registrado na skill `tests`.

### 5.12 RC-F6 — `/contratos` entra no ciclo FV (RC-D42..D48), 2026-07-28

> **Antecipada.** O roteiro (§5.6) punha a F6 por último, depois da F2 e da F3. O Flavio pediu o
> layout antes de seguir com o fluxo de emissão. Escopo: a **página** — a moldura, a lista e as ações.
> O conteúdo do **card mobile** ficou de fora por decisão dele, para uma rodada seguinte.

#### As decisões

- **RC-D42** — **O Espelho de Corretagem deixa de ser ação da página.** Ele nasce só dentro do
  Detalhes do contrato. As portas de criação da página passam a ser **duas**: à vista e futuro.
  **Revoga a D76** (entrada por modo de seleção). Nenhuma capacidade se perde: os dois caminhos já
  convergiam em `setEspelhoTarget` → Conferência (é lá que se escolhe o lado) → Prévia. O que sai é
  um **modo de seleção inteiro** — com ele morrem `espelhoMode`, o `body.is-selection-mode` da
  página, o ramo de seleção do card (e 4 props), e o `SelectionModeHeader`, que ficou órfão e foi
  **apagado**. No Detalhes o botão segue **sumindo** quando não cabe (decisão do Flavio: não repor a
  explicação do motivo, que só existia no modo de seleção).
- **RC-D43** — **No desktop a lista vira `fv-table`**; o card sobrevive só no mobile. **5 colunas +
  ⋯**: Contrato (nº + tipo) · Partes (vendedor → comprador) · Sacas · Datas (faturamento +
  pagamento) · Status (`.fv-chip`). **Sem coluna de Total e sem preço/saca** — o dinheiro fica no
  Detalhes. O menu ⋯ carrega o avanço de status que o card mostra (RC-D22: um por vez) + "Ver
  detalhes"; Editar/Ágio/Washout seguem no painel, que é onde há contexto.
- **RC-D44** — **Criar no desktop são DOIS botões** no `.fv-page-head` ("+ Futuro" secundário,
  "+ À vista" primário), não um botão com menu: criar contrato tem duas portas de verdade, e
  escondê-las atrás de um clique não paga. No mobile segue o FAB, agora com leque de **2** opções
  (`.fab-fan.is-fan-2` — a variante já existia, herdada de `/samples`).
- **RC-D45** — **Busca, filtros e paginação vão para o SERVIDOR** (keyset por `contractSeq`).
  Antecipa o encanamento da RC-F3 — sem as fases, que continuam sendo o pedaço grande dela. Motivo:
  redesenhar a toolbar por cima do filtro em memória significaria refazer a mesma região quando a F3
  chegasse. **Sem faixa de KPI nesta rodada** (decisão do Flavio): os números certos para ela são os
  contadores por fase, que nascem na F3.
- **RC-D46** — Escopo próprio **`.fv-ctr-page`** para o kit institucional. A classe `.ctr-page`
  **fica**: carrega as vars do arco do FAB e o ajuste de altura do shell via `:has()`, e é
  compartilhada com `/financeiro`, que **não** entra nesta rodada (decisão do Flavio) e segue no kit
  legado. As duas páginas ficam com caras diferentes até a próxima passada.
- **RC-D47** — Os filtros saem do modal central `.samples-filter-modal` para o painel lateral
  `.side-sheet.fv-filter-sheet`. `/contratos` era o **último consumidor vivo** daquele modal, então o
  CSS dele morreu junto (47 regras removidas, 4 regras agrupadas aparadas). Status e Tipo passam ao
  `ChipMultiSelectField` do kit, e o `ContractFilters` passa a guardar **código**, não rótulo PT —
  esses valores agora viram querystring.
- **RC-D48** — Os três estados da lista passam a existir de verdade: **skeleton** no 1º carregamento
  (linhas de tabela no desktop, cards no mobile), **`.spv2-error-banner`** quando falha (antes era um
  `catch {}` vazio que caía no vazio, sem dizer nada) e vazio com ícone + subtexto. A recarga
  **pós-mutação não pisca skeleton** — antes a lista inteira voltava para "Carregando..." depois de
  cada faturar/pagar/washout/ágio.

#### Achados do caminho

- **A busca do servidor e a do navegador procuravam em campos DIFERENTES.** O servidor casava nº do
  contrato + nº da compra; o navegador casava nº + nome do vendedor + nome do comprador. Unificado na
  união dos quatro; os nomes moram em JSON, então vão por `ILIKE` no `->>'displayName'` (molde do
  `_searchBuyerContractIds` do Financeiro, com o mesmo escape de `\ % _`).
- **O teto de 200 era silencioso.** A página chamava `listSaleContracts` com query **vazia**: acima do
  teto os contratos sumiam sem aviso e a contagem exibida era a do array baixado. Agora o `total` vem
  de um `count` do filtro inteiro.
- **`?details=<id>` fora da página baixada morria calado.** Era `contracts.find(...)`; não achando, o
  efeito de limpeza tratava como órfão e **apagava o parâmetro da URL**. Agora busca por id no
  servidor antes de julgar órfão.
- ⚠️ **Regra agrupada não se apaga inteira.** A primeira varredura de CSS morto removeu a regra toda
  quando o seletor citava uma classe morta — e levou junto `.sample-detail-reclassify-actions` e
  `.samples-filter-sheet`, que estavam vivos na mesma lista de seletores. O correto é aparar
  **seletor a seletor** (`rule.selectors`), removendo a regra só quando **nenhum** sobrevive.
- **`canManage` está fixo em `true`** (`ContratosPanel.tsx`), então o desvio de COMMERCIAL do S74 é
  código morto hoje. Não mexido: é decisão de regra, não de layout.

#### O que NÃO entrou

Conteúdo do card mobile · `/financeiro` · faixa de KPI · ordenação (não existe peça de sort no kit) ·
as fases da RC-F3.

### 5.13 RC-F5, 2ª rodada — o picker de lote (RC-D49..D52), 2026-07-28

> ⚠️ **O picker foi APAGADO pela RC-D69 (§7)**: o lote virou campo, e as quatro colunas viraram
> título + linha de meta na opção do dropdown. As decisões abaixo são históricas.

De volta ao fluxo de emissão. A RC-D29 tinha levado o **modal de seleção de lote** para painel
lateral, mas só a moldura mudou: por dentro cada lote ainda era um **`.spv2-card` emprestado da
`/samples`** — gradiente creme, radius 16, sombra tripla — com os dados corridos numa linha separada
por pontos. Comparar dois lotes obrigava a reler cada linha inteira, porque um card não alinhava com
o outro.

| #      | Decisão                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| RC-D49 | O card sai do `.spv2-card` e vira **superfície FV** (`.lotpick-card`): branco chapado, hairline, radius 10, sombra mínima                    |
| RC-D50 | Os dados viram **4 colunas alinhadas** — Lote · Produtor · Sacas · Safra — com **cabeçalho fixo** (sticky) no topo da lista, como um `thead` |
| RC-D51 | **O status sai do card.** Nesta lista todo lote é vendável (`sellableOnly`, RC-D30), então o chip dizia sempre a mesma coisa                 |
| RC-D52 | **A largura fica em 620px** e o **celular mantém a linha corrida** de hoje, menos o status. O painel não cresce                              |

**As colunas mostram o mesmo dado de antes, organizado** — decisão do Flavio contra a minha
recomendação de acrescentar padrão e bebida (que vêm de graça no blob de `latestClassification`). A
largura que sobra vai para o nome do produtor, que hoje truncava cedo.

#### Achados do caminho

- **A "faixa colorida de status" não existia neste modal.** O `.spv2-card-bar` é um elemento que o
  picker nunca renderizou; as classes `is-card-*` só definiam variáveis CSS que nada consumia aqui.
  Tirar o status foi tirar o chip — e, junto, uma classe que já era inerte.
- 🔴 **`text-overflow: ellipsis` não funciona em contêiner flex.** A primeira versão dava
  `display: flex` a todas as células e truncamento às de texto — as duas coisas se anulam. Só a
  célula que precisa de itens lado a lado (Lote = número + badge) é flex.
- 🔴 **`flex-basis: 0` no nome do produtor, não `auto`.** Com `flex-wrap: wrap`, quem decide a quebra
  é o tamanho de **conteúdo** do item: um produtor comprido empurraria sacas e safra para uma
  terceira linha **antes** de encolher. Com base 0 ele sempre cabe, cresce para ocupar a sobra e
  trunca — que é o comportamento do `.spv2-card-owner` de hoje.
- **Um markup só, sem `useIsDesktop()`.** Quem troca o desenho é a media query de 901px. O hook é
  `false` na primeira pintura, e aqui o custo seria o card montar no desenho errado e saltar depois
  da hidratação.
- **O cabeçalho mora DENTRO da rolagem** (sticky), não acima dela: assim herda o padding lateral da
  `.lotpick-list` e alinha com os cards sem recalcular recuo. O recuo à direita repõe a coluna do
  chevron, que no card é irmão da grade.

#### O que NÃO entrou

Classificação (padrão/bebida/catação) · armazém · largura maior · skeleton e vazio-com-ícone dos
estados da lista · lupa no campo de busca · **o formulário da Etapa 2**, junto com a RC-D18
(entregues na §5.16). A largura maior também veio depois: **RC-D61**, na mesma §5.16.

### 5.14 RC-F5, 3ª rodada — o documento vira passo do painel (RC-D53..D56), 2026-07-28

A RC-D27 tinha acertado o **fluxo** (o [Emitir] não emite: monta, pede a prévia e mostra o
documento; quem emite é o [Confirmar]) e errado a **superfície**. A conferência era um modal central
portalado, com backdrop cheio, subindo por cima do painel do formulário — que continuava montado
atrás, apagado. Duas superfícies para o que o usuário vive como um ato só: preencher e conferir são
dois momentos da mesma coisa.

| #      | Decisão                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| RC-D53 | O documento deixa de ser modal central e vira o **2º passo do mesmo painel**. Mesma largura (620px), mesmo cabeçalho, mesmo rodapé               |
| RC-D54 | Na virada, **só o miolo desliza** — os campos saem pela esquerda e o documento entra; cabeçalho e rodapé ficam parados e o rótulo do botão troca |
| RC-D55 | **Seta ← e ESC voltam UM passo.** No primeiro passo continuam saindo do fluxo, com "Descartar?" se houver campo preenchido                       |
| RC-D56 | Em 620px a folha A4 fica pequena para a letra do contrato, então o passo ganha **"Ampliar"** — tela cheia sob demanda, não a apresentação padrão |

**A RC-D53 revoga a exceção da RC-D27** registrada em `containers` §2 ("confirmação sobre painel usa
`.fv-panel-scrim`, exceto a conferência do contrato, que precisa da tela inteira"). Não há mais
backdrop nenhum ali. No lugar da exceção, a skill ganhou a **§1-A — painel de vários passos**, que é
o padrão reusável que saiu daqui.

`ContractDocumentConfirmModal.tsx` (229 linhas) foi **deletado** e virou
`components/contracts/ContractDocumentStep.tsx`, partido em dois: o hook
**`useContractDocumentPages(blob)`** (a rasterização, intacta) e o componente apresentacional. O
hook é chamado pelo **pai**, não pelo passo, porque quem decide o `disabled` do [Confirmar] é o
rodapé — e o rodapé é o do painel. O guard da RC-D27 não mudou: **confirmar só libera depois que o
documento apareceu** (ou foi baixado, quando a rasterização falha).

#### Achados do caminho

- 🔴 **`overflow-x: hidden` com `overflow-y: visible` não existe** — declarar um força o outro a
  `auto`. Para o corpo do painel recortar o passo que sai pela esquerda, ele tem que **parar de
  rolar** e a rolagem descer para cada passo. Efeito colateral **bom**: cada passo guarda a própria
  posição de scroll, então [Voltar] devolve o formulário exatamente onde estava.
- 🔴 **`visibility: hidden` com `transition-delay` igual à duração.** Sem `visibility` o passo que
  saiu continua no tab order; com `visibility` sem delay ele some **antes** de animar.
- **O sinal do passo é um estado que já existia.** `confirmDoc != null` **é** o passo — não entrou
  máquina de estado nova. Coreografia preservada: o `pendingEmitRef` (a emissão adiada até o
  Confirmar), o efeito que zera `confirmDoc` quando o pai fecha, e o `scrollIntoView` do erro de
  campo, que procura `.ctr-etapa2-content .is-field-error` e não depende de quem rola.
- **Voltar um passo é `onDismissAttempt` devolvendo `false` com efeito colateral** — o mesmo padrão
  que o "Descartar?" já usava. O guard `if (confirmDoc || pendingExit) return false`, que existia
  para o ESC não fechar o painel **por baixo** do modal, virou o primeiro ramo do `canExit`.
- **O "Ampliar" tem stage própria, não o `PhotoZoomViewer`.** Aquele é de **uma** imagem com pinça e
  pan; aqui são N páginas em rolagem vertical, e o que resolve a legibilidade é a **largura**, não o
  zoom. O ESC dela é em **fase de captura**, senão fecharia a ampliação **e** voltaria um passo do
  painel.
- 🔴 **`.ctr-doc-modal`, `.ctr-doc-content`, `.ctr-doc-frame`, `.ctr-doc-hint` e `.ctr-doc-actions`
  não morreram** — o `EspelhoCorretagemModal` usa todas. Só as quatro regras exclusivas do
  `.ctr-confirm-doc` saíram, aparadas **seletor a seletor** dentro das regras agrupadas.

#### O que NÃO entrou

**Picker → formulário como passos do mesmo painel** — o Flavio pediu e é a rodada seguinte
(entregue na §5.15, no mesmo dia). Também fora: a largura do painel (~~fica 620px, por decisão dele —
quem resolve a leitura de perto é o "Ampliar"~~ → **revista na RC-D61**, §5.16: foi a 700px quando o
formulário passou a ter linhas de 3 colunas; o "Ampliar" continua sendo quem resolve a leitura de
perto) e o layout/ordem dos campos do formulário, que é a RC-D18.

### 5.15 RC-F5, 4ª rodada — o lote vira o 1º passo do painel (RC-D57), 2026-07-28

> ⚠️ **O passo foi extinto pela RC-D69 (§7)**: o lote virou um **campo** da Identificação e a criação
> à vista caiu para dois passos. O que segue valendo desta rodada é a lição do meio — **o que o lote
> determina tem que morrer na troca** —, que a §7 herdou e estendeu para a **limpeza** do campo.

A rodada anterior deixou o pedido pela metade: o documento virou passo, mas a **seleção de lote**
continuava sendo um `BottomSheet` **irmão** do formulário. Escolher um lote fechava um painel e
abria outro — um descendo enquanto o outro subia —, e o "Voltar" do formulário **destruía** o que
tinha sido preenchido para reabrir a lista. Três superfícies para um ato só.

| #      | Decisão                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| RC-D57 | A seleção de lote vira o **1º passo** do painel do contrato. À vista = lote → formulário → documento; Futuro e Editar abrem no formulário |

Consequências que valem registrar, porque mudam comportamento:

- **Voltar ao lote NÃO descarta mais o formulário.** O passo continua montado ao lado, com o que foi
  digitado e a rolagem onde estava — é a propriedade do padrão (`containers` §1-A), e trocar de lote
  não é desistir do contrato. Com isso o "Descartar?" some dessa transição e passa a valer **só para
  sair do painel**; o `pendingExit`, que era `'close' | 'back'`, virou booleano.
- 🔴 **Mas o que o LOTE determina tem que morrer na troca.** Vendedor, filial, conta bancária,
  viabilidade da liga e o aviso de dono divergente são zerados no começo da hidratação. O vendedor é
  o dono do lote (RC-D37): uma filial ou conta do dono **anterior** sobreviveria calada e viraria um
  422 de banco no submit. Antes isso não podia acontecer porque o formulário era destruído.
- **O painel deixou de ser `stacked`.** Ele era (600/610) porque o sheet do picker ficava embaixo;
  sem sheet embaixo, voltou ao tier normal — e os sub-modais (`ClientQuickCreateModal`,
  `ClientUnitModal`), que são `stacked`, deixaram de empatar com ele no mesmo tier e passaram a
  ganhar por z-index em vez de por ordem no DOM.
- **Uma entrada de history em vez de duas.** Sheet `stacked` não injeta entry; o de baixo injetava.
  O back do Android com o formulário aberto consumia a entry do **picker**. Hoje é um sheet só: o
  back volta um passo, como a seta ← e o ESC.
- **O passo do lote não tem rodapé.** Ali não há decisão a confirmar — escolher é tocar num lote —,
  e um rodapé com um botão só seria chrome que não faz nada.

#### Achados do caminho

- **O picker foi para dentro do painel, não o contrário.** A alternativa era um "dono do fluxo"
  acima dos dois, mas ele exigiria partir o `SaleContractEtapa2Modal` (1900 linhas, ~40 estados) em
  hook + corpo + rodapé só para o pai poder montar o `BottomSheet`. O painel já era dono do sheet,
  do rodapé e do `canExit` — acrescentar um passo à frente é incremental.
- **Quem hidrata o lote é o painel, não o passo.** `getSampleDetail` + o próximo número abrem o
  passo seguinte; a decisão de avançar não pode morar em quem só lista.
- 🔴 **O passo do lote é a exceção a "cada passo rola sozinho".** Aqui quem rola é a
  `.lotpick-list`, para a busca ficar parada no topo e o scroll infinito continuar com a lista como
  root. Então `.ctr-step-lot` é coluna flex e **não** rola: fossem os dois, apareceria uma barra de
  rolagem do passo, por fora da lista, sem nada para rolar.
- **A hidratação agora aparece.** O guard de toque duplo era um `early-return` invisível; virou
  `aria-busy` na lista, que recua enquanto o lote abre.
- `.ctr-lotpick-sheet` morreu. As duas regras dela — a coluna flex do corpo e as custom properties
  da grade de 4 colunas — mudaram de dono para `.ctr-step-lot`.

#### O que NÃO entrou

A ordem e o layout dos campos do formulário (RC-D18 + kit `.fv-form-*`), que seguem sendo a rodada
seguinte.

### 5.16 RC-F5, 5ª rodada — o formulário por dentro (RC-D18, RC-D58..D61), 2026-07-28

Por fora o painel já era o que devia ser. Por dentro, o formulário era a última peça de `/contratos`
que não tinha passado pelo ciclo FV: **26 campos** em markup `.app-modal-*` legado, com quatro
problemas que se somavam.

**A ordem não tinha lógica.** O primeiro bloco chamava-se "Venda" e misturava quatro assuntos: data
do contrato (identificação), sacas e preço (valores), corretagem em % (valores) e **corretores** —
que nem sai no documento. "Valores", lá embaixo, guardava o **número de compra** (identificação) e o
**peso** (quantidade). O vendedor vinha antes do comprador; o documento imprime ao contrário.

**A aprovação decidia no meio do caminho.** "Este contrato precisa de aprovação?" é escolha de mão
única (AP32: no Editar vira só-leitura) e morava entre a embalagem e o número de compra.

**Havia três jeitos diferentes de mostrar o que não se edita.** Uma faixa cinza com os fatos do lote,
dois pseudo-campos (Número do contrato / Tipo) com rótulo e caixa de input desabilitada, e o Vendedor
travado como valor + instrução. Os dois do meio convidavam ao clique e não faziam nada.

**Excesso de moldura e de texto.** Seis caixas com hairline dentro de um painel que já é superfície,
seis títulos em caixa alta, oito rótulos terminando em "(opcional)", e frases como "Lembrar quantos
dias antes do faturamento?".

| #      | Decisão                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RC-D58 | **A ordem espelha o documento** (a tabela da RC-D18): Identificação · Comprador · Vendedor · Pagamento e logística · Quantidades e valores · Banco · Textos, e um 8º bloco **Controle interno** com o que não é impresso |
| RC-D59 | O que **não se edita** vira **um cartão de identidade** no topo. Morrem os dois pseudo-campos e a faixa do lote separada — ⚠️ **o cartão foi extinto pela RC-D70 (§7)**; o que sobreviveu é a rejeição ao pseudo-campo   |
| RC-D60 | As seções perdem a moldura e viram **micro-cabeçalho `.fv-form-heading`** — o padrão do kit                                                                                                                              |
| RC-D61 | O painel vai a **700px** no desktop. Vale para os passos todos: a folha A4 do documento sobe de ~0,78 para ~0,84 da escala _(à época o lote ainda era um passo e também ganhava respiro — RC-D69)_                       |

O cartão de identidade tem duas linhas: número + tipo, e — **só na criação à vista** — lote ·
produtor · safra · saldo. No Futuro não há lote; no Editar o `SaleContractDetail` carrega `sampleId`
mas não o número do lote nem a safra, e buscá-los seria requisição nova (fora do escopo, registrado).
_(A RC-D70 apagou o cartão e a RC-D72 pagou essa dívida: `getSaleContract` passou a devolver
`sampleLotNumber`.)_

**Menos texto, sem perder informação:** somem os oito "(opcional)" e entra o asterisco
`.fv-form-required` nos obrigatórios. "Este contrato precisa de aprovação?" → "Precisa de aprovação?";
"Lembrar quantos dias antes do faturamento?" → "Lembrete (dias antes do faturamento)"; "Preço por
saca (R$)" → "Preço/saca (R$)". O sufixo "(300 disp.)" do campo Sacas saiu — o cartão já diz o saldo;
"(liga: 100%)" ficou, porque explica um campo travado. _(Com o cartão morto, o saldo não voltou:
ele **já é** o valor inicial do campo, pela RC-D31 — ver RC-D71.)_

#### Achados do caminho

- 🔴 **O kit desenha `input` por DESCENDÊNCIA.** `.fv-form-field input` (0,1,1) alcança **qualquer**
  input aninhado, não só o filho direto. Isso é o que faz a busca de cliente ganhar a geometria certa
  de graça — e é o que **quebrou** o `.bms-input`, o campo de digitar dentro da caixa de corretores:
  `.bms-input` era (0,1,0) e perdia, então o input interno ganhava borda, fundo e 2.62rem de altura
  **dentro** da caixa que já é o controle. Consertado onde o componente mora
  (`.bms-control .bms-input`, 0,2,0), não no escopo da página: o problema segue qualquer form que
  hospede a caixa.
- **O bloco `.ctr-form-sheet .app-modal-*` morreu, como o próprio comentário previa.** Ele existia só
  para dar o desenho do kit a um corpo que ainda era legado. Efeito colateral desejado: as datas
  trocam o ícone de calendário próprio pelo **indicador nativo**, que é o que todo painel FV usa.
- **`.ctr-section-title` NÃO morreu**, ao contrário do que a análise supunha: quem usa são os 12
  títulos da `SaleContractDetailsModal`. Só o `.ctr-block` (a moldura) foi embora.
- **`.ctr-etapa2-cols` / `-col` / `.ctr-pair` eram legado inerte.** Restos do sheet central de 2
  colunas (S74), viraram `display: contents` quando o formulário virou painel (RC-D29) e desde então
  não faziam nada em largura nenhuma.
- 🔴 **O submit continua sendo do botão, não de um `<form onSubmit>`.** O molde de `forms` §1 pede
  `<form id>` + `form={id}` no rodapé, e aqui seria regressão: são **cinco tipos de campo composto
  com input de busca interno** (`ClientLookupField` ×4, `InlineSelectField` ×5,
  `BrokerMultiSelectField`) onde Enter significa "escolher este", não "emitir o contrato".
- **A largura precisa citar `.side-sheet`.** `.bottom-sheet.side-sheet` (620px, 0,2,0) mora **depois**
  no `globals.css`; com a mesma especificidade venceria por ordem. Mesma pegadinha do
  `.informativo-sheet`.
- **`.fv-form-row-3col` entrou no kit** (Sacas | Preço/saca | Peso) com `auto-fit`: dá três colunas a
  700px e degrada sozinho no celular, sem media query. Já o par de textos (Observações | Descrição)
  precisou de colapso escopado — o `-2col` do kit **não** colapsa de propósito, e dois textareas a
  ~160px não se leem.
- **`.ctr-etapa2-content` ficou sem regra CSS nenhuma.** A classe sobrevive só como **âncora do
  `scrollIntoView`** do erro de campo — é o que distingue este formulário de qualquer outro
  `.fv-form-body` aberto na página.

#### O que NÃO entrou

Lógica, validações e payload — nada mudou; a rodada é de apresentação. Também ficaram de fora buscar
os fatos do lote no modo Editar (requisição nova) e a prévia de números ao vivo (era a RC-D14/D16,
revogadas: quem confere hoje é o passo do documento).

## 6. De máquina de status a agenda (RC-D62..D68) — 2026-07-28

> **Reformulação de fundo, pedida pelo Flavio depois de olhar a rotina dos funcionários da Safras.**
> Muda a natureza do contrato no app — e, com ela, o escopo da RC-F2 e da RC-F3, que ainda não
> tinham sido construídas. **Implementada no mesmo dia.**

### 6.1 O problema

O contrato pedia que alguém **registrasse fatos que o sistema não consegue observar**: "foi
faturado", "foi pago", "embarcou (+ fotos)". O Flavio concluiu que essas marcas não iam acontecer
com disciplina — e que **um registro que às vezes não é feito é pior que nenhum**, porque o sistema
passa a afirmar algo falso ("nunca foi faturado") e a decidir em cima disso: chips de atrasado,
portões que travam, worklists que mentem.

O código já expunha a linha divisória. Havia dois tipos de registro no domínio:

| Registro              | Como era gravado                                     | Natureza       |
| --------------------- | ---------------------------------------------------- | -------------- |
| Contrato emitido      | você gera o PDF porque precisa do PDF                | **subproduto** |
| Aprovação enviada     | você imprime a etiqueta → `ApprovalLabelLog`         | **subproduto** |
| Espelho gerado        | você gera o espelho porque precisa mandar            | **subproduto** |
| Ágio/deságio          | muda dinheiro no documento                           | **subproduto** |
| Washout               | cascata de cancelar a venda no lote; as sacas voltam | **subproduto** |
| **Faturado**          | um botão cujo único efeito era dizer "faturado"      | escrituração   |
| **Pago**              | idem                                                 | escrituração   |
| **Embarcado + fotos** | idem, mais subir fotos                               | escrituração   |

**O card de Avisos (AP31/DSB-D19) já era o modelo**: nasce de dado que o contrato já carrega
(`requiresApproval` + `invoiceDate` + lead) e **some sozinho** quando a etiqueta aparece. Ninguém
marca nada. É a forma que o contrato inteiro passou a ter.

Chegou na hora certa: a **RC-F2** (fases dentro do contrato) e a **RC-F3** (lista vira worklist) são
exatamente o que a ideia questiona, e **nenhuma das duas tinha sido construída**. Nada deste domínio
está em produção — a migration `20260702120000` registra por escrito que a feature nunca foi
deployada, e prod parou em 25/06 enquanto todas as migrations de status são de 07/xx.

### 6.2 Decisões (ledger RC, continuação)

| #          | Decisão                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D62** | O contrato tem **três situações**: `EMITIDO` (em andamento) · `FINALIZADO` · `WASH_OUT` (cancelado). **Faturar, Pagar e Embarcar deixam de existir** — somem `FATURADO` e `PAGO`              |
| **RC-D63** | **"Finalizar" é UM toque, sem formulário de data, e é REVERSÍVEL** ("Reabrir"). Rompe a **D122** de propósito: ali o marco era registro auditado; aqui é sinalizador de conveniência          |
| **RC-D64** | **Atraso só existe no `paymentDate`** — é a única data que uma ação (finalizar) resolve. `invoiceDate` vira lembrete puro: passou o dia, o aviso se recolhe                                   |
| **RC-D65** | **O embarque morre inteiro**: confirmação, fotos, transporte/responsável, `requiresShipment`, o portão EMB28 e os eventos de embarque do calendário. Revoga **EMB1–EMB34**                    |
| **RC-D66** | **A aprovação não trava nada.** Fica o aviso que se resolve sozinho ao gerar a etiqueta. Revoga o portão **AP18** (o latch AP32 e a worklist AP25–AP28 permanecem)                            |
| **RC-D67** | **O `/financeiro` vira leitura.** A corretagem sai da fila quando o contrato é finalizado. Revoga **RC-D6**, **RC-D22**, **D137** e **FN7** (o "Pago" que morava lá); 'pago' → **'recebida'** |
| **RC-D68** | **O finalizado FICA na lista**, com marca discreta. A coluna "Situação" mostra, para quem está em andamento, **o próximo compromisso** em vez de um rótulo de fase                            |

#### Por que "Finalizado" funciona onde "Pago" não funcionava

Finalizar **também** é escrituração — ninguém precisa dela para fazer o próprio trabalho, então às
vezes vai ser esquecida. O que muda é o **custo do esquecimento**. Esquecer o "Faturado" fazia o
sistema afirmar uma mentira e travar um portão. Esquecer o "Finalizado" só deixa uma linha a mais na
lista: o dado não apodrece, só envelhece. E a marca é reversível justamente porque não é fato
auditado — um toque errado não pode ser definitivo.

#### O desenho da coluna "Situação" (RC-D68)

```
Nº          Partes                Sacas   Situação
──────────────────────────────────────────────────────────────
0042/2026   Sta.Rita → Cafeeira    300    Aprovação a enviar
0041/2026   Boa Vista → Import     150    Fatura em 12/08
0039/2026   Sto.Ant → Cafeeira     200    Pagamento venceu 02/08
0037/2026   Palmeiras → Export     120    —
0035/2026   Serra Azul → Cafeeira  180    Finalizado
0031/2026   Fazenda Boa → Import   250    Cancelado
```

O rótulo de situação só aparece nos **estados terminais**. Para o contrato em andamento a coluna
mostra o que vem a seguir, derivado das datas que o documento já imprime — nenhuma manutenção. A
precedência: `cancelado` → `finalizado` → `aprovacao` → `pagamento_vencido` → `faturamento` →
`pagamento` → `nenhum`.

> ⚠️ O Flavio escolheu **"fica, só marcado"** contra a recomendação de tirar o finalizado da lista
> padrão. Consequência aceita: a lista cresce indefinidamente e finalizar não dá retorno visual
> imediato. O filtro por situação (já existente) cobre quem quiser ver só os em andamento.

### 6.3 O que foi feito

**Schema** (`20260728120000_contract_status_finalizado`, destrutiva). Enum recriado (Postgres não
dropa valor — 3ª vez neste domínio), com mapeamento defensivo `FATURADO → EMITIDO` e
`PAGO → FINALIZADO`. Saem as colunas `invoiced_at`, `paid_at`, `shipped_at`, `requires_shipment`,
`shipment_carrier`, `shipment_responsible_user_id`, `shipment_responsible_name` e
`contract_modality.requires_shipment`; sai a tabela `sale_contract_shipment_photo` e o tipo
`ShipmentCarrier`. `invoice_date`/`payment_date` **ficam**: são campos do DOCUMENTO, e viraram a
agenda.

**Sem coluna nova.** "Quem finalizou e quando" vem do `SaleContractStatusLog`, que já grava
`toStatus` + ator + data. Reabrir grava uma linha de volta para `EMITIDO` — vira histórico, não
apagamento. E é por isso que coluna não serviria: na segunda passada ela estaria mentindo sobre a
primeira.

**Domínio.** Nascem `finalizeSaleContract()` / `reopenSaleContract()` (motor comum
`_flipContractStatus`); morrem `invoiceSaleContract()`, `paySaleContract()`,
`listShipmentContracts()`, `getDashboardShipmentEvents()` e o arquivo inteiro
`sale-contract-shipment-service.js`. Nasce **`deriveContractAgenda`** em `sale-contract-support.js`,
consumida pela lista (`_withAgenda`, batch de etiquetas por página) **e** pelo detalhe
(`_agendaFor`, count por contrato) — para os dois nunca divergirem.

> **Desvio do plano, deliberado:** `deriveContractAgenda` devolve `{ kind, dayKey }`, **não**
> `{ kind, dayKey, label }`. A frase em pt-BR precisa da data formatada, e formatar data é do front
> (`contractAgendaLabel`, em `SaleContractCard.tsx`). Os eventos do calendário mantêm o `label` do
> backend porque o consumidor deles é um card genérico por `typeKey`.

**Calendário.** Sobram `contract_invoice` (sempre previsto — RC-D64) e
`contract_payment_due`/`contract_payment_overdue`. Somem `contract_invoice_done`,
`contract_invoice_overdue`, `contract_payment_paid` e os três de embarque. Os feeds carregam **só
contrato EMITIDO**: finalizado e cancelado não têm o que lembrar.

**Front.** `SaleContractCard` troca a barra/selo de status pela **agenda** (paleta `AGENDA_COLOR`:
âmbar pede ação, azul só lembra, vermelho venceu, verde/cinza acabou); `ContratosPanel` troca a
coluna Status por **Situação** e o menu ⋯ ganha Finalizar/Reabrir; `SaleContractDetailsModal` perde
a seção Embarque inteira e ganha os dois botões no rodapé, além de um 2º selo com o compromisso;
`SaleContractLifecycleDialog` vira **só washout**; `ShipmentConfirmationModal` apagado;
`ContractsFilterButton` passa a três situações. `/financeiro` fica sem botão nenhum.

**Confirmação:** Finalizar e Reabrir **não pedem** — são reversíveis, e confirmar um toque
reversível é ruído. O washout continua pedindo motivo, porque continua definitivo.

### 6.4 Efeito no roteiro

- **RC-F2** (fases dentro do contrato) — **re-escopada**: não há mais 5 fases para desenhar. O
  detalhe é documento + agenda + o que de fato aconteceu. A **RC-A1** volta à mesa com muito menos
  a acomodar.
- **RC-F3** (lista vira worklist) — **re-escopada**: a worklist não é mais "contratos na fase X", é
  "contratos com algo por vir". O encanamento servidor-side da RC-D45 serve; falta decidir se a
  agenda vira ordenação/filtro no SQL.
- **RC-A3** (o embarque não deixa rastro no histórico) — **morreu com o embarque**.
- **§5.4 (o modelo de fases) e §5.5 (destino de cada capacidade)** viraram ledger histórico: as
  linhas de Embarque, Faturamento e Pagamento descrevem coisa que não existe mais.

### 6.5 Achados do caminho

- 🔴 **A migration é destrutiva e prod nunca viu esta feature** — mas isso é afirmação de doc.
  **Antes de aplicar em produção**, conferir no banco que `sale_contract` não tem linha com
  `status IN ('FATURADO','PAGO')` nem `shipped_at` não-nulo. Apagar coluna merece a checagem.
- **O Espelho não foi tocado.** `assertEspelhoEligible` lê `SALE_CONTRACT_STATUSES`, que continua
  existindo — agora com 3 valores. O bloqueio do washout no Espelho segue de pé, agora pela resposta e não pelo tipo (RC-D91, §10).
- **`ContractModality.requiresShipment` tinha exatamente um leitor** (o snapshot do emit, EMB21) e
  nenhuma UI nem seed. Morreu com o resto sem deixar buraco.
- **`confirmShipment` não bumpava `version` de propósito** (invariante frágil registrada na §5.7) —
  a invariante morreu junto com a função que a exigia.
- **Renomear o filtro do Financeiro exigiu tocar os dois lados**: `RECEIVABLE_FILTERS` no servidor e
  `FinanceiroFilter` no front. Um só teria dado 422 silencioso no filtro "Recebida".
- **`.next/types` guarda stub de rota apagada.** Depois de deletar rotas, `typecheck` acusa módulo
  inexistente até `rm -rf .next/types` — não é erro de código.

## 7. O lote vira campo (RC-D69..D73) — 2026-07-29

> **Fonte:** o Flavio olhou o fluxo que o operador de fato faz e pediu para reduzir a quantidade de
> fases do preenchimento à vista, unificando a seleção de lote com o formulário: _"quero que a
> seleção do lote se torne um campo de preenchimento... é claro que o preenchimento do campo do lote
> é obrigatório"_.

### 7.1 O problema

A criação à vista tinha **três passos** — escolher o lote → preencher → conferir o documento. O
primeiro era uma tela inteira (`ContractLotPickerStep`, 261 linhas + 26 regras de CSS) dedicada a
uma única resposta.

O critério que a rodada estabeleceu, e que vale além deste painel:

> **Um passo que responde UMA pergunta é um campo, não um passo.**

Um passo se justifica quando ele apresenta contexto que o anterior não tinha, ou quando a resposta
muda o que vem depois de forma que não caberia na mesma tela. Escolher o lote não faz nem uma coisa
nem outra: o operador já sabe qual lote quer antes de abrir o painel, e o efeito da escolha —
preencher vendedor, filial, conta, sacas e liga — acontece **no formulário que estava do outro
lado**.

### 7.2 Decisões (ledger RC, continuação)

| #      | Decisão                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RC-D69 | A seleção de lote deixa de ser passo e vira **campo com dropdown de busca, obrigatório**. À vista cai para **dois passos**: formulário → documento                               |
| RC-D70 | **O cartão de identidade (RC-D59) morre.** Nº do contrato e Tipo viram **campos travados** — `.ctr-locked-value` (valor com rótulo), não input desabilitado                      |
| RC-D71 | **Safra e saldo não viram campo.** O produtor já é o **Vendedor** travado (RC-D37) e o saldo já é o **valor inicial** do campo Sacas (RC-D31)                                    |
| RC-D72 | **No Editar o lote aparece travado**, com o número. `getSaleContract` passa a devolver `sampleLotNumber` — a dívida que a RC-D59 tinha registrado e não pagara                   |
| RC-D73 | O **Vendedor travado ganha a caixa do kit** (`.ctr-locked-field`) e **perde a instrução**. Quem escolhe entre as duas apresentações do campo travado é a **vizinhança da linha** |

### 7.3 A Identificação

A ordem segue a **RC-D58** sem exceção: o PDF imprime `Nº Contrato · Nº Compra · Nº Lote · Mês ·
Ano`, e Mês/Ano saem da data do contrato.

```
Nº do contrato [travado]   Tipo [travado]
Nº de compra               Lote *
Data do contrato *
```

⚠️ **O Tipo não é impresso em lugar nenhum do PDF.** Pela regra da RC-D58 ele cairia na 8ª seção,
"Controle interno" — mas ali moram corretores e aprovação, decisões operacionais, e "À vista" no fim
do formulário seria uma sobra. Fica ao lado do número, que é a outra metade de "que contrato é este".
**Escolha do Claude, registrada para poder ser vetada.**

**Por que o cartão morreu e não voltou em outra forma.** O que a RC-D59 combatia eram os
**pseudo-campos** — rótulo + caixa de input desabilitada, que convidam ao clique e não fazem nada.
Campo travado no molde da RC-D37 (valor com o peso do texto do formulário + instrução, sem caixa) não
é pseudo-campo: não parece clicável porque não tem controle. Os dois fatos que o cartão ainda
carregava tinham dono melhor — o produtor **é** o Vendedor, e o saldo **é** o valor com que o campo
Sacas nasce.

### 7.4 O que foi feito

- **`ContractLotField.tsx`** (novo), molde do `ClientLookupField`: busca com debounce de 300 ms →
  `listSamples({ sellableOnly: true, limit: 8 })`, dropdown com nº + `BlendBadge` no título e
  produtor · sacas · safra na meta, limpar (×). `ContractLotPickerStep.tsx` apagado.
- **Dois passos.** Somem `onLotStep`, `backToLot()` e o wrapper `.ctr-step-lot`; `canStepBack` virou
  `onDocumentStep`. O rodapé volta a ter dois estados só ("Cancelar"/"Voltar").
- **Validação**: `FormFieldKey` ganhou `'lot'`, e o lote é o **primeiro** pendente apontado — dele
  saem vendedor, filial, conta e o teto de sacas, então apontar qualquer um deles antes mandaria
  preencher o que o lote resolveria sozinho.
- **CSS**: morreram as 26 regras `.lotpick-*` (com a media query das 4 colunas), o `.ctr-step-lot`
  com as custom properties `--lotpick-*` e as 7 regras `.ctr-ident*`. Nasceu `.ctr-lotfield-*`, que
  traz **só** o dropdown e a opção — a geometria do input vem do kit por descendência.
- **Backend**: `internalLotNumber` no `select` que `getSaleContract` já fazia; `sampleLotNumber` no
  `SaleContractDetail`. Teste de integração cobrindo à vista (o número) e Futuro (`null`).

### 7.5 O campo travado ganha uma segunda forma (RC-D73)

Pedido do Flavio depois de ver a tela: _"deixe o valor do vendedor como um campo normal como os
outros, porém não clicável e sem o aviso sobre a edição do vendedor"_.

O Vendedor divide a linha com a **filial do vendedor**, que é um `<select>` de verdade. Valor solto
ao lado de uma caixa lê como **campo faltando** — o olho procura o controle que sumiu — e não como
campo resolvido. Na linha do Nº do contrato + Tipo o problema não existe: ali tudo é travado, não há
com o que comparar, e a caixa viraria moldura vazia.

Então a decisão não é "valor solto **ou** caixa", é **a vizinhança da linha escolhe**:

| A linha é...                              | Apresentação                       | Classe              |
| ----------------------------------------- | ---------------------------------- | ------------------- |
| toda travada (Nº do contrato + Tipo)      | valor solto, sem caixa             | `.ctr-locked-value` |
| mista — divide com um controle de verdade | a caixa do kit, superfície recuada | `.ctr-locked-field` |

`.ctr-locked-field` copia a geometria de `.fv-form-field input` (um `<p>` não é alcançado por aquele
seletor, então ela não vem por herança) e troca **só o fundo** para `--fv-canvas`; sem `:focus`, com
`cursor: default` e `aria-disabled`. Isso não recria o **pseudo-campo** que a RC-D59 matou: aquilo
era `<input disabled>`, que o navegador desbota e que continua parecendo um controle esperando texto.

⚠️ **O Lote no Editar está na mesma situação** — divide a linha com o Nº de compra, que é editável —
e **ficou como valor solto**, porque o pedido nomeou só o Vendedor. Decisão dele.

### 7.6 Achados do caminho

- 🔴 **Limpar o campo precisava de tratamento que trocar de lote não precisava.** O efeito de
  hidratação é chaveado pelo **id** do lote e zerava vendedor/filial/conta **dentro** do `if (spot)`.
  Com o lote indo a `null`, o efeito caía no `if (!contractId) return` e não zerava nada: vendedor e
  conta do lote anterior sobreviveriam a um campo vazio, e o formulário afirmaria um vendedor que não
  seria gravado. O zeramento subiu para antes do `if`.
- **O número do contrato não era propriedade do lote.** Ele vinha junto do pick, então trocar de lote
  refazia `getNextContractNumber` por nada. Virou estado próprio, buscado uma vez na abertura — o
  mesmo que o Futuro já fazia.
- **A data do contrato deixou de ser reescrita na troca de lote.** Ela nunca veio do lote; com o
  picker isso passava porque trocar era um ato deliberado de "voltar". Como campo, digitar no Lote
  silenciosamente reescrevia a data escolhida. Agora só semeia quando está vazia.
- **Custo aceito: o dropdown mostra 8 e pede refino**, em vez do scroll infinito sobre todos os
  vendáveis. Quem sabe o número acha mais rápido; quem navegava para decidir perde a lista larga. A
  linha "Mostrando os primeiros 8" existe para o corte não ler como "só existem 8".
- **O `sellableOnly` (RC-D30) foi junto sem discussão** — é o filtro que impede lote sem quantidade
  declarada e liga de cascata inviável de chegarem ao submit.

## 8. Status e fases — o modelo fechado (RC-D74..D79) — 2026-07-29

> **Fonte:** conversa de decisão com o Flavio. Ele trouxe as cinco fases (emissão, aprovação,
> embarque, faturamento, pagamento) e os três status, pediu para reintroduzir o **embarque** de forma
> simples — só a data, sem foto nem ações — e perguntou se tudo deveria ser status ou se status e
> fases eram coisas distintas.

### 8.1 A pergunta e a resposta

**Status e fase são dois conceitos, e não disputam o mesmo espaço.**

|            | Pergunta que responde            | Como vive                   | Muda quando                                   |
| ---------- | -------------------------------- | --------------------------- | --------------------------------------------- |
| **Status** | "este contrato ainda está vivo?" | **persistido**, 3 valores   | alguém **age** (emitir · finalizar · washout) |
| **Fase**   | "o que vem a seguir?"            | **derivada**, nunca gravada | o **calendário** anda                         |

Tratar tudo como status quebraria em dois pontos: alguém teria que **marcar** "faturado" e
"embarcado" — o que a §6 derrubou —, e o contrato ganharia uma **ordem obrigatória** (não dá para
pagar antes de faturar) que a operação real não respeita.

### 8.2 A regra que torna o modelo decidível

> **Uma fase tem ação quando o ato dela produz um registro que o sistema já observa por outro
> motivo. Não produzindo, ela é só uma data.**

A regra **prevê** as observações do Flavio (só Aprovação e Pagamento têm ação) e explica por que 3
status bastam para 5 fases: as fases com ação já se resolvem no status ou num registro existente.

| Fase        | Ato                 | Registro que deixa      | Resultado                       |
| ----------- | ------------------- | ----------------------- | ------------------------------- |
| Emissão     | emitir              | o próprio contrato      | **ação** → `EMITIDO`            |
| Aprovação   | imprimir a etiqueta | `ApprovalLabelLog`      | **ação** (o aviso some sozinho) |
| Embarque    | —                   | nenhum                  | **data**                        |
| Faturamento | —                   | nenhum                  | **data**                        |
| Pagamento   | Finalizar           | `SaleContractStatusLog` | **ação** → `FINALIZADO`         |

### 8.3 Decisões (ledger RC, continuação)

| #          | Decisão                                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D74** | **Status e fase são dois conceitos.** Status = persistido, 3 valores, muda por ato. Fase = derivada, nunca gravada, muda com o calendário                                                                       |
| **RC-D75** | **A regra da §8.2**: fase tem ação quando o ato deixa registro que o sistema já observa; não deixando, é só uma data                                                                                            |
| **RC-D76** | 🔴 **Embarque e faturamento são o MESMO DIA** — regra do negócio, sem exceção (a nota acompanha a carga). O embarque volta como **segunda leitura do `invoiceDate`**: sem coluna, sem migration, sem campo novo |
| **RC-D77** | No quadro de fases, embarque e faturamento ganham **✓ quando a data passa**                                                                                                                                     |
| **RC-D78** | **Nenhum rótulo muda**: formulário, PDF, lista, calendário e card de Avisos seguem dizendo "faturamento". O embarque existe em **um lugar só** — o quadro de fases (que a RC-D80 move para a lista)             |
| **RC-D79** | **"Finalizar" significa "o pagamento entrou"** — confirma o que já vale (`/financeiro` move para "Recebida" ao finalizar)                                                                                       |

> ⚠️ **A RC-D77 foi escolhida contra a minha recomendação.** Eu propus "só a data, sem marca", porque
> embarque e faturamento **não deixam rastro** — passou o dia 12/08 e o sistema não sabe se o café
> saiu. O ✓ ali afirma o que não foi observado: com o caminhão quebrado, o quadro diz que embarcou.
> O Flavio viu esse caso no preview e escolheu assim. **Consequência aceita:** o ✓ tem dois
> significados na mesma coluna — "aconteceu (há registro)" nas três fases com rastro, "a data passou"
> nas duas sem.

### 8.4 O que isto muda no código

**Quase nada — e é o sinal de que o modelo já estava construído.** A §6 tinha chegado ao mesmo lugar
por outro caminho: a agenda derivada **é** a fase.

- **Aprovação** — nada. A âncora do lembrete é o `invoiceDate`, que **é** a data do embarque; a
  observação de que ela estaria ancorada na data errada caiu quando a RC-D76 apareceu. Sem data
  ("À definir") segue **avisando sempre**, e a aprovação segue **fora do calendário**, só no card de
  Avisos.
- **Embarque / Faturamento** — nada além da linha nova no quadro de fases.
- **Pagamento** — nada. Segue sendo o único atraso do app (RC-D64).
- **Dashboard** — nada. Card de Avisos e calendário ficam como estão.
- **Falta construir:** o **quadro de fases**, que a §8.5 move do detalhe para a **lista**.

### 8.5 O quadro de fases é uma linha na lista (RC-D80..D83) — 2026-07-29

> **Fonte:** o Flavio descreveu a concepção dele e pediu conferência: _"o quadro de fases é a
> representação de qual fase foi concluída e qual é a próxima, e minha ideia é que cada card de
> contrato tenha uma linha que representa as fases, essa linha é preenchida conforme as datas e
> ações (aprovação e finalização)"_.

**A concepção está certa no essencial** — a fase é derivada das datas mais os dois registros de ação,
e a linha mostra onde o contrato está. O que ela não prevê é a consequência do modelo da §6:

> 🔴 **Não é uma barra de progresso — são cinco luzes.** Cada fase acende pelo **seu próprio
> critério**, independente das outras. Não é defeito do desenho: é o modelo em que **nada trava
> nada**.

Quatro estados legítimos hoje, todos alcançáveis sem erro do operador:

```
Normal (hoje 13/08 · fat. 12/08 · pag. 25/08)     ●━━●━━●━━●━━○
Finalizado sem enviar a aprovação (RC-D66)        ●━━○━━●━━●━━●   ← buraco no meio
Pagou adiantado (finalizou em 05/08)              ●━━●━━○━━○━━●   ← cheio na ponta
Contrato sem aprovação (requiresApproval=false)   ●━━━━━●━━●━━○   ← 4 pontos
Reaberto (RC-D63)                                 ●━━●━━●━━●━━○   ← o último voltou
Washout                                           ●━━●━━╳          ← não é fase, é o fim
```

| #          | Decisão                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D80** | O quadro de fases **não é peça do detalhe** — é uma **linha de progressão no item da lista**. Preenche por **data** (embarque, faturamento) e por **registro** (emissão, aprovação, pagamento)      |
| **RC-D81** | **Cinco pontos sempre**, mesmo com embarque e faturamento no mesmo dia (RC-D76). Consequência aceita: dois pontos que **nunca** aparecem em estados diferentes                                      |
| **RC-D82** | **Desktop apenas.** O card do celular não recebe a linha — segue com o chip de situação e o acordeão                                                                                                |
| **RC-D83** | A linha **convive** com a Situação (RC-D68), não a substitui: a linha diz **onde está**, a Situação diz **quando é o próximo compromisso** — com a data e o vermelho do atraso, que a linha não tem |

> ⚠️ A RC-D81 foi escolhida contra a minha recomendação (fundir os dois num marco só na linha, e
> manter as cinco fases separadas onde há espaço). O Flavio quer as fases tratadas como distintas em
> todo lugar. **Consequência aceita:** dois dos cinco pontos são, na prática, um.

**Em aberto — o desenho específico, adiado pelo Flavio** ("por enquanto assim, o design mais
específico faremos depois"):

- **Tabela × card no desktop.** Ele pediu a linha "no card", mas o desktop **deixou de ser card
  ontem** (`654d971`, RC-D43 — virou `.fv-table` de 5 colunas) e ele ainda não viu isso rodando.
  Decide depois de conferir. Se ficar tabela, a linha entra na coluna Situação; se voltar a card,
  a RC-D43 é desfeita e cabe o dinheiro que ela cortou (total, preço/saca).

### 8.6 Implementação da linha de fases — 2026-07-29

Construída **na tabela que está no código** (o adiamento acima é sobre o desenho, não sobre existir).
Nenhuma migration, nenhuma rota nova, **nenhuma query a mais**: a linha come exatamente os mesmos
ingredientes da agenda, então nasce do mesmo `_withAgenda` que já faz o batch do `approvalLabelLog`.

| Onde                       | O quê                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `sale-contract-support.js` | `deriveContractPhases(input, todayKey)` + `CONTRACT_PHASE_KEYS`, irmãs da agenda       |
| `sale-contract-service.js` | `_withAgenda` devolve `phases` ao lado de `agenda`, do **mesmo** `agendaInputOf(row)`  |
| `lib/types.ts`             | `ContractPhaseKey` · `ContractPhaseState` · `ContractPhases`; `phases?` no contrato    |
| `ContractPhaseLine.tsx`    | a peça: 5 pontos num trilho, `role="img"` + `aria-label` com a leitura por extenso     |
| `ContratosPanel.tsx`       | a célula da Situação empilha **linha + chip**; colgroup ganha `.fv-col-situacao`       |
| `app/globals.css`          | `.ctr-phaseline`/`.ctr-phase-*` dentro do `@media (min-width: 901px)` — RC-D82 por CSS |

Três escolhas do desenho, todas vetáveis:

1. 🔴 **Os trilhos entre os pontos são sempre neutros; só os pontos mudam de estado.** Trilho
   preenchido leria como barra de progresso — e a §6 garante que nada trava nada. Cinco luzes num
   trilho contam a verdade; uma barra mentiria.
2. **A aprovação que não se aplica vira um traço**, não um ponto vazio (vazio leria como pendência),
   e o slot fica de pé — 5 pontos em toda linha é o que mantém as colunas alinhadas entre contratos.
3. **Washout esmaece a linha inteira e fecha com ✕ no pagamento** — é o que nunca vai chegar. Os
   pontos anteriores seguem derivados: o que aconteceu antes do cancelamento aconteceu.

Duas regras que os testes fixam, porque são as que um "conserto" futuro quebraria primeiro:

- **O faturamento acende no dia SEGUINTE, nunca no próprio dia.** No dia 12/08 a agenda ainda diz
  "Fatura em 12/08"; um ponto cheio contradiria a frase ao lado, na mesma célula.
- **O pagamento acende por ação, nunca por data** (RC-D79). Pagamento vencido continua apagado — o
  vermelho do atraso é do chip (RC-D83), e a linha não tem vermelho nenhum.

**Ainda em aberto:** o passo para trás (Reabrir) não tem desenho próprio — o ponto do pagamento
simplesmente apaga, porque o status voltou a `EMITIDO`. Se isso precisar ser visível como "voltou",
é decisão nova.

## 9. O que "Finalizar" significa e quando ele existe (RC-D84..D86) — 2026-07-29

> **Fonte:** o Flavio, seguindo para outras partes do fluxo: _"para a finalização do contrato as
> fases do contrato devem ser todas dadas como completas, e a ação de finalizar deve ficar disponível
> apenas a partir da data de faturamento"_.

As duas frases fecham a mesma ideia por lados opostos: **finalizar passa a significar que o contrato
inteiro aconteceu** — e a trava de data é o que torna esse significado verdadeiro, porque impede
declarar cumprido um contrato que nem foi faturado.

### 9.1 Efeito, não condição

A primeira frase se lia de dois jeitos, e eles geram código oposto:

| Leitura                  | O que seria                                              |
| ------------------------ | -------------------------------------------------------- |
| **Efeito** (a escolhida) | finalizar **pinta** as fases; nada é exigido antes       |
| Condição                 | finalizar **exige** as fases completas — 🪦 volta o AP18 |

O Flavio escolheu **efeito**. Isso preserva a RC-D66: o portão da aprovação continua morto, e
finalizar segue sendo um toque.

> ⚠️ **Consequência aceita:** um contrato finalizado **sem a etiqueta de aprovação ter saído** passa
> a mostrar a aprovação cheia. E como o card de Avisos filtra `status = 'EMITIDO'`, o aviso some no
> mesmo instante — o fato deixa de existir no app inteiro. Ele viu esse caso no preview e escolheu
> assim.

**O `na` sobrevive ao FINALIZADO** (escolha minha, vetável): uma fase que **não existe** neste
contrato — a aprovação de quem não marcou — não tem como estar completa. "Todas as fases completas"
vale para as que se aplicam.

### 9.2 Decisões (ledger RC, continuação)

| #          | Decisão                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D84** | **Finalizar dá todas as fases por completas** — é **efeito**, não condição. O portão segue morto (RC-D66). O `na` da aprovação não marcada permanece                       |
| **RC-D85** | **"Finalizar" só a partir da data de faturamento**, o próprio dia incluído. Antes dela não houve nota, logo não há pagamento a declarar                                    |
| **RC-D86** | **Sem data de faturamento ("À definir", D144) não finaliza.** A saída é editar o contrato e pôr a data — que é a ação certa de qualquer forma. ⚠️ **Revoga parte do D144** |

> ⚠️ **A RC-D86 revoga o D144 na parte que dizia que "à definir" finalizava direto.** O resto do
> D144 fica: data planejada nula continua sendo estado legítimo, e continua exibida como "À definir".
> A **RC-D63** também fica inteira — finalizar não **pede** data nenhuma ao operador; ele só exige
> que a planejada exista e já tenha chegado.

### 9.3 O que foi feito

**A trava é de verdade, não é botão escondido.** `finalizeSaleContract` ganha um `guard` no
`_flipContractStatus`, que roda **depois do status e antes da version** — um contrato já finalizado
tem que dizer "não é finalizável", não "falta a data". Dois códigos distintos:
`SALE_CONTRACT_INVOICE_DATE_MISSING` e `SALE_CONTRACT_BEFORE_INVOICE_DATE`.

**Os três lugares onde "Finalizar" aparece escrevem o motivo** — menu ⋯ da tabela, card do mobile e
rodapé do Detalhes. Botão apagado sem explicação é beco, e no toque não há tooltip para socorrer:

```
⋯  Finalizar
   Defina a data de faturamento primeiro.      ← o item vira duas linhas
```

Duas armadilhas que o caminho revelou:

- 🔴 **O 409 da trava colide com o 409 da concorrência.** Os dois `runTerminal` mapeavam _qualquer_
  409 para "este contrato foi modificado, recarregue a página" — frase errada para a data. Nasceu o
  `terminalErrorMessage`, que desempata pelo **código** antes de cair no status.
- **O corte da trava e o corte da linha são diferentes de propósito.** Dia 12 já finaliza, mas o
  ponto do faturamento só acende no 13. Não é inconsistência: quem finalizou no dia 12 tem a linha
  inteira cheia pela RC-D84, então o vão nunca aparece.

**A duplicação é consciente:** `finalizeBlockReason` (servidor) e `finalizeBlockedReason` (front)
implementam a mesma regra. A do servidor é a trava; a do front só evita o clique. O
`todayInputValueBRT` fixa `America/Sao_Paulo` justamente para as duas não discordarem quando o
aparelho está em outro fuso.

## 10. O washout volta pro contrato e o lote vira leitura (RC-D87..D91) — 2026-07-29

> **Fonte:** o Flavio, ao entrar no Financeiro: _"pra que o registro de recebimento seja mais
> assertivo acredito que adicionar uma fase de confirmação/seleção no fluxo de washout seja viável,
> essa fase é para a determinação de se terá pagamento de comissão ou não, pois então dependendo da
> resposta o contrato é retirado ou mantido na página do financeiro"_. E, depois da auditoria:
> _"não quero que seja possível dar washout pelo lote, apenas pelo contrato"_.

### 10.1 O problema

O Financeiro decidia se cobrava corretagem de um cancelado por uma **regra automática de tipo**
(D145): à vista em washout nunca cobrava e sumia da página; Futuro sempre cobrava e ficava. A regra
acertava a maioria dos casos e **não tinha saída para o resto** — um à vista cancelado por culpa do
comprador não tinha como ser cobrado, e um Futuro cancelado por acordo não tinha como ser isentado.
Quem sabe a resposta é a pessoa, no momento em que cancela.

Só que a escolha não cabia onde o washout nascia: **ele tinha três entradas e só uma tinha diálogo.**
As outras duas vinham de `/samples`, onde o operador está mexendo no lote e não teria como responder
sobre corretagem — e uma delas quebrava **vários contratos em laço**.

### 10.2 A auditoria de `/samples` (8 vetores)

Pedida por ele antes de decidir. O que o lote conseguia fazer com um contrato:

| #      | Vetor                                                                               | Situação                                                                           |
| ------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **#1** | "Cancelar movimentações" quebra o contrato sem perguntar nada                       | 🔴 fechado pela RC-D87                                                             |
| **#2** | O mesmo pela rota HTTP, sem passar por botão nenhum                                 | 🔴 fechado (409 `MOVEMENT_HAS_CONTRACT`)                                           |
| **#3** | "Cancelar e deletar" cancela tudo, quebra os contratos e **só então** falha com 409 | 🔴 operação destrutiva pela metade; morreu junto                                   |
| **#4** | Trocar o dono do lote muda quem assina o contrato na próxima edição                 | 🔴 fechado pela RC-D88 (era só um aviso na UI)                                     |
| **#5** | Deletar o lote libera o número, que o PDF imprime ao vivo                           | ✅ já fechado (409 `SAMPLE_HAS_CONTRACT`) — é o molde que as outras seguiram       |
| **#6** | Editar o número do lote de um lote com contrato                                     | ✅ impossível: o número só é escrito na confirmação do registro e nulado no delete |
| **#7** | Editar um movimento não sincroniza o contrato                                       | ⚠️ latente, **sem chamador na UI** — fica registrado, fora de escopo               |
| **#8** | Reduzir as sacas abaixo do vendido                                                  | ✅ já fechado (409 com o mínimo permitido)                                         |

### 10.3 Decisões (ledger RC, continuação)

| #          | Decisão                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D87** | **O lote não desfaz VENDA** — o washout do contrato é a única porta dela. A **perda** segue cancelável pelo lote: ela não tem contrato      |
| **RC-D88** | **Lote com contrato tem o dono congelado** — ele vaza para um contrato já emitido. O número não precisa de trava: não é editável (vetor #6) |
| **RC-D89** | O washout **pergunta se haverá cobrança de corretagem**. Escolha **crua e obrigatória** — nada pré-marcado, botão travado até responder     |
| **RC-D90** | **A resposta é definitiva**, como o motivo do washout. Não se edita depois                                                                  |
| **RC-D91** | O **Espelho segue a resposta**, não o tipo: negar o documento a quem respondeu "cobrar" deixaria a cobrança sem papel                       |

> ⚠️ **A RC-D89 revoga a D145 inteira.** A regra de tipo vira regra de resposta. O que ela decidia
> continua valendo para o que já aconteceu: a migration faz o **backfill pela própria D145**
> (`washout_billable = (type = 'FUTURO')`), então nenhum washout existente muda de lado no Financeiro
> nem no Espelho. Trocar a regra não mexe retroativamente em dinheiro já apurado.

> ⚠️ **A RC-D87 revoga a D104 na parte alcançável pelo lote.** "Cancelar a venda quebra o contrato"
> continua sendo o **motor** do washout à vista — o que acabou foi poder acionar esse motor de fora.

### 10.4 O que foi feito

**A coluna e o predicado.** `washout_billable BOOLEAN` (nulo = não está em washout; sem `NOT NULL`,
que mentiria sobre os vivos). O `isSpotWashout` deu lugar ao **`isWashoutNotBillable`**, e ele testa
`washoutBillable !== true`, não `=== false`: washout **sem resposta gravada não cobra**. Fail-closed —
o sistema não inventa cobrança onde ninguém respondeu. `lib/espelho.ts` espelha a mesma expressão,
com o comentário dizendo que os dois têm que concordar.

**A pergunta.** `.fv-choice-group` de duas opções no diálogo do washout, nada pré-marcado, submit
travado até responder. A dica de cada cartão diz a **consequência** ("Continua no Financeiro e emite
espelho." / "Sai do Financeiro, sem espelho."), não repete o rótulo — é o que a pessoa precisa para
escolher. Um padrão aqui seria o sistema decidindo dinheiro no lugar de quem cancela.

**A resposta atravessa os dois ramos.** No Futuro ela entra direto no `updateMany` que já grava
motivo e data. No à vista o washout acontece dentro do `cancelSampleMovement` → e ela viaja como
**opção de serviço**, 🔴 **não no payload do evento**: o event store é append-only com schema
validado, e a resposta é dado do contrato, não do movimento. Tem teste que abre o `SALE_CANCELLED`
e verifica que a chave **não** está lá.

**O guard mudou de camada.** O plano punha o 409 `MOVEMENT_HAS_CONTRACT` na entrada HTTP; ele ficou
no `cancelSampleMovement`, que é onde o `invalidateSample` já guarda o `SAMPLE_HAS_CONTRACT`. Motivo:
guard na rota vale para a porta que a gente lembrou; guard no serviço vale para todo chamador. O que
autoriza o cancelamento é **a presença da resposta** — quem chega sem ela é outro chamador, e a rota
HTTP não lê esse campo de propósito. Comportamento externo idêntico ao do plano.

**O painel "Deletar lote" separou perda de venda** (RC-D87 revisada na mesma sessão — ver §10.5).
Com **venda** ativa ele só explica: sem rodapé e sem pedir motivo, porque não há ação a tomar e pedir
o motivo de uma ação indisponível é pedir por pedir. O texto diz onde é a saída — _"Venda se desfaz
pelo Washout do contrato, em Contratos — não pelo lote."_ Com **perda**, as duas ações continuam:
"Cancelar perdas" e "Deletar" (que cancela as perdas e invalida). O laço que sobrou percorre
`activeLossMovements`, nunca a lista inteira.

**O dono virou campo travado** (`forms` §3: valor + instrução, não input desabilitado — ele não
reabre depois, e "desabilitado" leria como "por enquanto não"). O detalhe do lote passou a trazer o
contrato ligado (`saleContract`), porque `soldSacks > 0` **não serve de proxy**: venda por caminho
baixo (import/teste) não emite contrato, e a UI travaria um campo que o servidor deixa passar.

### 10.5 Achados do caminho

- 🔴 **A ação removida só cancelava perdas, na prática — e por isso voltou.** O item "Deletar lote"
  do ⋯ já exigia `soldSacks === 0`, então o painel **nunca abria** num lote com venda ativa: o laço
  que quebrava contratos era alcançável pela **rota**, não pelo botão. Removê-la inteira não
  protegia contrato nenhum e custava caro — **perda registrada por engano virava permanente**, e um
  lote com perda ativa deixava de ser deletável, sem saída. O Flavio mandou devolver **só para
  perdas**, e é o que está no código: `handleCancelLossesOnly`/`handleCancelLossesAndInvalidate`
  percorrem `activeLossMovements`. **A lição é sobre o alcance da decisão, não sobre a decisão**: a
  RC-D87 era sobre movimentação **comercial com contrato**, e "movimentação" varria junto uma coisa
  que nunca teve contrato.
- **Três testes afirmavam o que a RC-D87 revoga.** Todos usavam o cancelamento pelo lote como
  caminho normal de washout. Viraram testes do 409 — e um deles agora prova as duas metades: o lote
  recusa, o contrato aceita.
- **Um teste da RC-D37 morreu de sucesso.** Ele afirmava que trocar o dono do lote mudava o vendedor
  na re-emissão. Era verdade, e era exatamente o problema. Virou o teste do congelamento.
- **O campo travado precisou sair de dois lugares, não de um.** Tirar o controle da tela não basta:
  a validação `!selectedOwnerClient` travava a edição dos **outros** campos num lote legado (dono só
  em texto), e o `ownerClientId` continuava indo no payload — que o servidor agora recusa. Campo
  travado sai do payload (`forms` §3).

## 11. O Financeiro no kit FV (RC-D92..D95) — 2026-07-29

> **Fonte:** o Flavio, logo depois de fechar o washout: _"vamos trabalhar nos ajustes de design e
> layout da pagina do financeiro pois hoje ele esta seguindo o padrão antigo de design"_. Fecha a
> **2ª rodada da RC-F6** — a 1ª migrou `/contratos`, esta migra a página vizinha.

### 11.1 O problema

`/financeiro` era a última página do domínio ainda no padrão antigo, e a diferença ficou gritante
quando `/contratos` migrou: as duas vivem lado a lado na navegação. Ela empilhava **quatro faixas**
acima da lista — vencidos, busca legada (`.hero-search-wrap`), cinco chips de filtro e um contador —
e mostrava cards com **acordeão** que escondiam uma linha de informação.

Duas coisas erradas por trás da forma:

- **O total do topo somava estados que não se somam.** A faixa "Corretagem total" juntava o que ainda
  vem com o que já foi recebido num número só. Ele mandou apagá-la antes desta rodada (commit
  `78eda51`); a pergunta que sobrou foi **o que põe no lugar**.
- **O acordeão cobrava um clique por linha para revelar uma linha.** O que ele escondia era o split
  vendedor · comprador da corretagem: um dado curto, que cabe à vista.

### 11.2 Decisões (ledger RC, continuação)

| #          | Decisão                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D92** | O desktop é **tabela** (6 colunas). O **acordeão morre** nos dois breakpoints — o split da corretagem vira sublinha, sempre visível             |
| **RC-D93** | Os **4 estados viram a KPI row, clicável**: cada cartão traz o valor em R$ e a contagem, e **é o filtro**. Os chips e a faixa de vencidos somem |
| **RC-D94** | No mobile são os **4 cartões, em 2×2** — exceção deliberada ao KPI-2 do kit                                                                     |
| **RC-D95** | **Sem coluna ⋯.** A página é leitura pura (RC-D67): a única saída é abrir o contrato, e quem faz isso é a **linha inteira** (e o card inteiro)  |

> **Por que os 4 cartões no mobile.** A regra do kit corta a KPI row para dois no mobile porque lá
> ela é **leitura de gestão** e empurra a lista para baixo sem responder nada. Aqui o cartão é a
> **única porta** do estado — cortar dois tornaria "Recebida" e "Cancelado" inalcançáveis. O critério
> que ficou: **cartão que só informa pode ser cortado; cartão que é a única porta, não.**

> **Por que o `totalCommission` saiu da resposta em vez de virar um 5º cartão.** Os quatro `where`
> são uma **partição exata** do conjunto que ele somava (`EMITIDO ∪ FINALIZADO ∪ washout que cobra`),
> então ele é a soma dos quatro. Um número derivável dos que já estão na tela é uma segunda fonte da
> verdade esperando para divergir.

### 11.3 O que foi feito

**Os quatro números vêm do servidor, e vêm da mesma expressão do filtro.** Os `where` dos quatro
estados viraram uma constante só (`STATE_WHERE`), lida pelos `groups` da paginação **e** pelos quatro
`aggregate`. Cartão e filtro não podem discordar sobre o que é "vencido" — com duas expressões
paralelas, discordariam no primeiro ajuste. Os agregados seguem sob `filterWhere` (a **busca**) e
**independem do filtro ativo e do cursor**: era a propriedade que o cabeçalho antigo já tinha, e é
exatamente a que o KPI-filtro precisa — clicar num cartão filtra a lista e não mexe nos outros três.

**A contagem da toolbar deixou de mentir.** Era `items.length` (só as páginas já carregadas); passou
a sair dos KPIs — a soma dos quatro no "Todos", o do estado ativo quando há filtro.

**A chrome é a de `/contratos`**, montada uma vez e posicionada por breakpoint: `.fv-page-head`
(desktop-only, sem ações — aqui não se cria nada), `.fv-kpi-row` e `.fv-toolbar`. No mobile as duas
faixas rolam **dentro** do `.spv2-list-scroll`. A página ganhou o escopo `.fv-fin-page`, no molde do
`.fv-ctr-page`.

**O chip de estado virou o `.fv-chip` do kit.** Eram quatro mapas de hex inline copiados dos dots do
calendário. A coerência evento↔página se mantém pela **família** da cor (âmbar/vermelho/verde/cinza),
agora nos tokens FV — o hex era a implementação, não o acordo.

**Dois tons novos no kit** (`.fv-kpi-icon.is-red` e `.is-gray`) e o anel de "filtro ligado" virou
variável (`--fv-kpi-active`, padrão âmbar): com quatro cartões de tons diferentes, marcar o "Vencido"
de âmbar leria como outro estado. `/samples`, que tem um cartão só, não escreve nada e não muda.

### 11.4 Achados do caminho

- **O 2×2 do mobile não custou uma linha de CSS.** O gate mobile do kit é
  `grid-template-columns: repeat(2, …)` e casa por seletor com esta página
  (`.clients-page-v2 .spv2-list-scroll .fv-kpi-row`); quatro cartões simplesmente quebram em duas
  linhas. O que a skill chama de "KPI-2" era **quantos cartões a página passa**, não uma trava do
  CSS — e a condição para o gate acender era largar a `.hero-search-wrap`, senão seriam duas chromes
  empilhadas.
- **Um teste fixava a corretagem em `30` e o contrato dele era Futuro (150).** A asserção certa não é
  um número escrito à mão: é `res.kpis[estado].value === item.commissionTotal` — o KPI vale o que o
  item da lista diz que vale. Número mágico em teste esconde justamente a variação que interessa.
- **O `.fin-card` virou `<a>`.** Com o acordeão fora sobrava um único botão ("Ver contrato") dentro de
  um card que já parecia clicável; o card absorveu a geometria do `.fin-card-head` e a ação. Sem
  interativo aninhado, que era o motivo de o botão existir separado.
- 🔴 **A `.hero-search-wrap` morreu com esta página, e não foi apagada.** `/financeiro` era o
  **último** consumidor da busca legada; hoje **nenhum JSX a monta**, mas as ~60 regras
  `.hero-search-*` continuam no `globals.css` (base em `:4698+`, overrides `.clients-page-v2` em
  `:6605`/`:21125`/`:27070`/`:28930` e um `:has()` em `:34319`). Ficaram de fora **de propósito**:
  parte delas são seletores compostos com `.cv2-fab`, que segue vivo, e varrê-las junto misturaria
  uma limpeza de 8 pontos do arquivo com a mudança que precisa ser conferida na tela. É uma
  varredura própria — está registrado nas skills `data-tables` §1 e `design-system`.

## 12. A etiqueta de aprovação deixa de ser write-only (RC-D96..D102) — 2026-07-29

> **Fonte:** o Flavio, depois de perguntar como a etiqueta funcionava hoje: _"Vamos deixar apenas
> alguns campos editaveis... apeanas o campo de Lotes de origem pode ser editavel, e gostaria que ele
> editasse as informações nos detalhes do lote em cascata, verifique se há alguma situação ou algum
> perigo... Alem do campo de lotes de origem ser editavel, acredito que deixar o campo de Numero de
> compra tambem editavel com cascata de edição para o contrato seja uma boa ideia."_

### 12.1 O problema

A etiqueta era **write-only**: cinco campos editáveis pré-preenchidos do contrato, o lote de origem
read-only, e o "Imprimir" gravava só o job de impressão + a linha de auditoria. Nada do que se
editava ali voltava ao sistema. O efeito prático é o papel divergir do cadastro sem ninguém saber —
e o campo que mais divergia era justamente o **Nº compra**, que chega _depois_ do contrato e é na
etiqueta que aparece.

E, no papel, lote vazio imprimia o rótulo "LOTES" órfão sobre uma área em branco: o `pushLabel` era
incondicional e só a grade dependia de haver lotes.

### 12.2 A verificação de risco que ele pediu

Ele não pediu a cascata: pediu que se **verificasse** se ela é perigosa. As duas respostas foram
opostas.

**Nº compra → contrato: seguro**, com uma armadilha. O único caminho de escrita que existia era o
`emitSaleContract` ("Editar"), que **re-resolve a etapa 2 inteira** — re-snapshota partes, banco e
armazéns com os valores _atuais_ dos cadastros, emite `SALE_UPDATED` no lote e grava um
`SaleContractExport`, que a timeline mostra como **"EDIÇÃO"**. Trocar um número no papel não pode
re-congelar o contrato. Mas o molde certo já existia: o `setSaleContractApprovalFlag`, um
`updateMany` estreito com `expectedVersion`.

**Lote de origem → cadastro do lote: perigoso**, por cinco motivos, e o pior deles não precisava de
ninguém editar nada:

1. 🔴 **O round-trip já era destrutivo.** Os chips do modal vinham do `splitOriginLotForLabel`, que
   corta cada código em 16 chars e, acima de 8, devolve **7 + `"+"`** — e o `+` é sentinela de
   desenho, não lote. Salvar de volta o que estava na tela gravaria `"L1, …, L7, +"` no cadastro.
2. 🔴 **Liga: o auto-pin.** Editar a origem de uma liga seta `blendOriginLotPinned` e ela **para de
   re-derivar para sempre** — efeito permanente saindo de uma tela de impressão.
3. 🔴 **Componente de liga: a propagação.** Editar propaga para todas as ligas ancestrais, e o
   `updateRegistration` só aceita com `confirmHarvestPropagation` (409 `BLEND_HARVEST_PROPAGATION_REQUIRED`).
4. O lote **não aceita UPDATE, aceita EVENTO** — exige a `version` do lote e um motivo de correção.
5. Um lote pode ter **N contratos** (`sample_id` é índice, não unique).

Escolha dele, entre travar-nos-casos-perigosos, construir-o-fluxo-de-confirmação e não-cascatear:
**travar**. O que a trava elimina são o 2 e o 3; o 1 se resolve invertendo o que o campo edita.

### 12.3 Decisões (ledger RC, continuação)

| #           | Decisão                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D96**  | Lote vazio → o papel não imprime **nem o rótulo**: o campo LOTES some inteiro                                                                                        |
| **RC-D97**  | O modal mostra **todos** os campos, inclusive o Lote de origem vazio (sai o "Sem lote de origem.")                                                                   |
| **RC-D98**  | Só **Nº compra** e **Lotes de origem** são editáveis; os outros quatro viram leitura, com uma nota única dizendo que vêm do contrato                                 |
| **RC-D102** | O travado **mantém a caixa do formulário** — não vira texto solto. Num form que mistura editáveis e travados, alternar as duas formas lê pior que qualquer uma delas |
| **RC-D99**  | O Nº compra **cascateia para o contrato** por escrita estreita: sem re-snapshot da etapa 2 e sem linha "EDIÇÃO" na timeline                                          |
| **RC-D100** | O Lote de origem **cascateia para o cadastro do lote**, e **trava com o motivo escrito** quando é liga, componente de liga, contrato Futuro ou status fora da janela |
| **RC-D101** | O botão **"Limpar" sai**: com quatro campos travados ele só zeraria os dois que cascateiam — viraria um botão de apagar dado do cadastro                             |

### 12.4 O que foi implementado

- **Papel** (`print-agent/label.js`): o `pushLabel('LOTES')` entrou no `if (lots.length > 0)`.
- **Prefill**: `buildApprovalPrefill` devolve `contractVersion` e o bloco
  `originLot { editable, lockReason, sampleId, sampleVersion }`. O handler seleciona `isBlend`,
  `status` e `version` do lote e faz **um** `sampleBlendComponent.findFirst` (índice
  `idx_blend_component_origin`). Travado, o **alvo vem nulo** — um bug de UI não consegue montar uma
  chamada de escrita a partir de um campo que não pode escrever.
- **Endpoint**: `setSaleContractPurchaseNumber` (rota `/sale-contracts/:id/purchase-number`),
  idempotente, congelado fora de `EMITIDO`, normalizando pelo `optionalText` do emit.
- **Modal**: os quatro travados **mantêm a caixa** do formulário (`.alm-locked-input` — RC-D102), num
  `<p aria-disabled>` com a geometria do `.nsv2-field-input` e sem o que promete edição (fundo
  recuado, sem sombra, sem `:focus`); o campo de lotes passa a ser o **`OriginLotChips`** — o mesmo
  editor do detalhe do lote — sobre o texto cru; o submit grava **antes** de imprimir; o "Limpar" saiu
  (lápides no CSS para `.alm-lots-readonly`, `.alm-lot-chip`, `.alm-lots-empty` e `.nsv2-clear-btn`,
  que perdeu o último consumidor).
- **Envio**: `normalizeCustomLabelLines` recorta a linha LOTE pelo `splitOriginLotForLabel`.

### 12.5 GOTCHAs desta rodada

- 🔴 **O campo edita o DADO, nunca a representação recortada dele.** O estado do lote é
  `originLotText` (cru e inteiro); `prefill.lots` virou só o que vai ao papel. Essa inversão é o que
  torna a cascata segura — sem ela, um simples "Imprimir" num lote de 9+ códigos apagaria 5 deles.
- 🔴 **O recorte migrou do prefill para o envio, e passou a ser a MESMA função nos dois.** Antes, o
  `normalizeCustomLabelLines` tinha um split próprio (`[,\n]+`) que discordava do
  `splitOriginLotForLabel` e do `deriveBlendOriginLot` (`[\s,;]+`). Com o modal mandando texto livre,
  duas regras de quebra convivendo seria o bug esperando a primeira colagem com espaço.
- **A liga TEM lote de origem.** O comentário do handler afirmava o contrário (`declaredOriginLot`
  nulo) desde antes da derivação reativa; hoje ela vem preenchida pela somatória das origens. Foi
  corrigido — e é justamente na liga que o `"+"` aparece mais, o que fazia dela o pior lugar
  possível para estrear uma cascata.
- **Gravar ANTES de imprimir, e dizer quando só a gravação passou.** Se a escrita falha, o papel não
  sai com um dado que não entrou no sistema. Se a impressão falha depois, o dado ficou — e o lote é
  event-sourced, não se desfaz: a mensagem diz "as alterações foram salvas, mas…", senão o operador
  reimprime achando que nada mudou.
- **O "Limpar" morreu por consequência, não por decisão de layout.** Ele fazia sentido quando os
  cinco campos eram rascunho de papel; com quatro travados e dois cascateando, o mesmo botão passaria
  a apagar o Nº compra do contrato e a origem do lote num clique.
- 🔴 **RC-D102: a unidade de comparação do campo travado é o FORM, não a linha.** A primeira passada
  seguiu a regra da RC-D73 (`forms` §3) ao pé da letra — valor solto em linha toda travada, caixa em
  linha mista — e produziu um form que **alterna** as duas formas de linha em linha. Ele pediu caixa em
  todos: _"os campos que não são editáveis devem ter um design de campo normal, porém sem editar, e
  não texto"_. O critério refinado: **um form todo travado dispensa a caixa; um form que mistura não
  pode misturar as formas.**
- **Caixa travada em form fora do kit precisa do override do tier desktop.** O `.nsv2-field-input`
  cresce no desktop (padding 1rem, borda 2px, radius 14px) e um travado preso no clamp mobile
  desalinha a linha. Isso valeu também para o `.olc-wrap` dos chips, que **já estava** desalinhado no
  desktop desde a passada anterior — o override existente é escopado ao `.new-sample-sheet`, que não
  alcança este modal.
- 🔴 **`disabled` com dois significados precisa de dois desenhos.** O `.olc-wrap.is-disabled` desbota
  por `opacity: .75`, o que serve para "aguarde o save" (detalhe do lote) e atrapalha para "travado
  permanentemente" — ali os chips são exatamente o que se confere antes de imprimir. Na etiqueta a
  regra é escopada (`.alm-lots-group .olc-wrap.is-disabled`): recuado, `opacity: 1`.

## 13. O espelho passa a ficar guardado (RC-D103..D111) — 2026-07-29

> **Fonte:** o Flavio: _"agora iremos trabalhar com o espelho... eu quero que você analise se a
> geração do espelho é salvo e é apresentado para possíveis visualizações após ele ser emitido. Ou se
> ele apenas é um documento gerado no momento e que não será utilizado no futuro. Pois, a minha ideia
> é que, após o espelho ter sido gerado, ele seja salvo nos detalhes do contrato. De forma que, se
> necessário, o usuário poderá ver e editar o espelho após a emissão. Porém, eu quero que ele tenha um
> tempo de permanência... sendo excluído após 15 dias da finalização do contrato."_ E, no meio da
> análise: _"Aproveite e analise a logica de criação do espelho, quais informações são relacionadas ao
> contrato, veja se ha alguma possivel inconsistencia ou chence de erros, para que melhoremos a logica
> de acordo com as corretagens e o lado das corretagens (comprador, vendedor)"_.

### 13.1 A resposta à pergunta dele, e o problema que ela revelou

Não era salvo. O `backend-api.js` dizia literalmente _"Sem persistencia (D71)"_: os bytes viviam em
RAM (milissegundos no servidor; no navegador, só enquanto o modal ficava aberto — o objectURL era
revogado no unmount). O `SaleContractEspelhoLog` tinha **5 colunas** e guardava só o **fato** do
export: contrato, lado, quem, quando. A linha da timeline ("Espelho exportado — Vendedor") era um
`<li>` inerte.

O problema real não é a falta de conveniência — é que a coluna "Data" do papel era `new Date()` e
**todos** os valores eram lidos ao vivo da linha do contrato. Então **regerar depois de um "Editar"
ou de um ágio produzia um documento diferente do que foi entregue ao cliente**, sem nada que dissesse
qual foi o original. Num documento de **cobrança**, isso é o defeito, não a ausência de recurso.

E "editar o espelho" não existia como operação: o espelho **não tem campo nenhum próprio** — o único
input humano do fluxo é o toggle de lado, na Conferência. Editar teve que ser **definido** antes de
poder ser implementado (RC-D104).

### 13.2 As nove decisões

| #           | Decisão                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RC-D103** | O renderizador lê **sempre de um snapshot**. A entrega congela esse snapshot na linha de auditoria. Fresco e guardado = **um caminho só**                               |
| **RC-D104** | O espelho guardado é **imutável**. "Editar" = consertar o contrato e **gerar de novo**; o anterior fica no histórico, **substituído** (derivado, nunca persistido)      |
| **RC-D105** | Retenção **15 dias após o FIM** do contrato (finalizado ou washout). Enquanto EMITIDO não há relógio; **reabrir PARA** a contagem. Expira o **snapshot**, nunca a linha |
| **RC-D106** | A **prateleira** dos disponíveis é uma seção nova no Detalhes; a **timeline segue sendo o histórico** (guarda a linha mesmo depois de o documento expirar)              |
| **RC-D107** | A entrega passa a ser **confirmada**: o log é aguardado, com `expectedVersion`, e a falha é reportada                                                                   |
| **RC-D108** | `round2` vira **half-up de verdade** — o `Number.EPSILON` era inócuo na faixa de valores do negócio e o meio-centavo caía para baixo                                    |
| **RC-D109** | O papel imprime o **% na coluna da comissão** ("Comissão (2,00%)") e **Sacas sem casas decimais**                                                                       |
| **RC-D110** | **4º gate:** sem parte cadastrada no lado pedido não há espelho (`ESPELHO_NO_PARTY`). E a Conferência **avisa** quando o dono do lote mudou desde a emissão             |
| **RC-D111** | Front e back respondem a **mesma** pergunta por lado; copy revogada; comentário canônico do schema; **um** rótulo de lado só                                            |

### 13.3 As escolhas que ele fez, e o que cada uma fechou

**"Reemitir por versão" (RC-D104).** Editar um documento entregue seria reescrever o que o cliente já
tem na mão. O guardado é imutável e a correção é o caminho que já existia: conserta o contrato, gera
de novo. O anterior não desaparece — fica na estante marcado **"substituído"**, e a marca é
**derivada da ordem**, jamais gravada (mesma escolha da coluna "Situação", RC-D62).

**"Os números", não os bytes (RC-D103).** O que fica guardado é um **JSON** com o que o papel imprime,
e o PDF é re-renderizado dele. Isso evitou o ciclo de vida de arquivo inteiro: nada de política de
upload (ela só valida imagem), nada de órfãos no bucket, nada de migrar arquivo em deploy. E há um
**túmulo** no repo apontando na mesma direção: congelar PDF em disco foi tentado para o laudo público
e **revertido**. De lambuja, a estante pode listar o valor da comissão de cada documento sem abrir
nenhum arquivo.

**"15 dias após o fim" (RC-D105).** O enunciado dele tinha duas datas (20 e 15); a escolha fechou em
15, contados do **fim**. E o fim é **derivado, nunca persistido**: não existe `finalizedAt` e isso é
**de propósito** — finalizar é reversível (RC-D63), e reabrir grava a volta em vez de apagar a ida.
Logo: `FINALIZADO` → a linha mais recente do `SaleContractStatusLog`; `WASH_OUT` → `washoutAt` (a
única data de terminal que é coluna), com fallback no log para as linhas legadas; `EMITIDO` → **nada**.
Reabrir um contrato **para** o relógio, e o documento volta a estar disponível.

Uma escolha de segurança dentro dela: contrato `FINALIZADO` **sem** linha no status log **falha
aberto** (o documento fica). Guardar demais é melhor que apagar o que não se consegue datar.

**"Só o percentual" (RC-D109).** Ele preferiu a intervenção mínima no papel: o % entra no cabeçalho da
coluna da comissão, e nada mais. Isso **deixa em aberto** a ambiguidade da base de cálculo (§13.6).

### 13.4 O que a auditoria da corretagem achou (o segundo pedido)

Cinco frentes de análise. O achado que importa é **um erro de dinheiro**:

🔴 **RC-D108 — o `round2` derrubava o meio-centavo.** A função somava `Number.EPSILON` antes do
`Math.round` para "empurrar" o meio para cima. Mas `Number.EPSILON` é **2,22e-16 absoluto**, e o ulp
de um valor na casa de 1e4 é ~1e-12 — a soma **não muda nada**. Rodando o próprio módulo: R$ 700,01/sc
× 1000 sc × 2,25% gravava **15.750,22** onde a conta dá **15.750,23**. Um centavo a menos, no banco e
no papel. A correção reaproxima o produto ao decimal exato antes de arredondar
(`Math.round(Number((value * 100).toPrecision(15))) / 100`): o valor exato é sempre múltiplo de
0,0001, então 15 dígitos significativos desambiguam com folga.

**Por que passou:** **todos** os fixtures do projeto eram redondos (100 × 10 × 2%). Os testes novos
são adversariais de propósito.

E um efeito colateral que o próprio fix resolveu: o front calcula `(total × pct) / 100` e o backend
`total × (pct / 100)` — ordens diferentes, que **divergiam** em alguns valores. Uma varredura de
2.057.184 combinações confirmou que, **depois** do fix do arredondamento, as duas ordens **convergem**.
A divergência morreu junto com o bug do half-up; não foi preciso unificar as fórmulas.

🔴 **RC-D110 — cobrança sem destinatário.** Com corretagem > 0 e o snapshot da parte vazio, o papel
saía com o **TOTAL real** e `CLIENTE: —`, entregue e auditado como documento válido. Acontece em
contrato cujo lado não tem cliente cadastrado. Agora é o 4º gate, e é do **lado pedido** — o outro
lado estar cadastrado não salva. Snapshot que **existe** mas não tem nome usável conta como ausente
(`buildPartySnapshot` devolve o objeto com os campos vazios), que era exatamente o caso que a cópia do
`snapshotName` do PDF não tratava — havia **três** implementações divergentes e só as do front
tratavam string em branco.

🔴 **RC-D111 — front e back perguntavam coisas diferentes.** A Conferência habilitava "Gerar espelho"
pela pergunta _"este contrato produz **algum** espelho?"_, enquanto o servidor decide pela pergunta
_"o lado **pedido** sai?"_. Um contrato elegível pelo comprador liberava o botão com o vendedor
escolhido — e o clique respondia 409. Agora são duas funções, cada uma com a sua pergunta, e existe um
**teste de paridade** que varre status × billabilidade × corretagem × parte nos dois lados.

### 13.5 As armadilhas que custaram

- 🔴 **Retenção só na lista é cosmética.** É a lição do **EMB31** (§A.4), e ela vale literalmente: o
  filtro tem que estar em **TODAS** as leituras — na timeline **e** na rota que serve os bytes. Sem o
  segundo, a URL direta com o `logId` continuaria entregando o documento expirado. Expirado na rota
  responde **410 `ESPELHO_EXPIRED`**, a mesma forma do `REPORT_EXPIRED` do laudo público.
- **Não há cron neste projeto, e não vai haver.** A infra foi apagada de propósito (`aa28962`) e a doc
  diz que recriar "não se paga". A limpeza é o padrão que o repo já usa em cinco lugares: **expiração
  lazy na leitura + purga oportunista** fire-and-forget, com throttle de 1h em variável de módulo
  (per-instância; perde no cold start do Cloud Run, e isso é aceitável porque **a leitura já filtra** —
  a purga só evita o acúmulo indefinido). Um `$executeRaw` só, que **anula a coluna** e nunca apaga a
  linha.
- 🔴 **O snapshot-como-fonte não foi só arquitetura: foi o que tornou o papel testável.** `pdf-lib`
  **não extrai texto**, então os 4 testes de PDF que existiam só conferiam `%PDF-`, tamanho e checksum
  — **nenhuma asserção sobre os números impressos**. Com o renderizador lendo sempre de um snapshot,
  asseverar o snapshot passou a asseverar o papel. Um dos testes de PDF, aliás, estava passando por
  acidente: continuava mandando um `contract` inteiro onde agora se espera um snapshot, e o `%PDF-`
  não notava.
- **Índice parcial cria drift permanente.** A primeira versão da migration criava
  `... WHERE snapshot IS NOT NULL`. Índice parcial **não é expressável no `schema.prisma`**, então ele
  apareceria em todo `migrate diff` para sempre. A tabela é de volume baixo; seq scan serve.
- **O CHECK do `side` pode falhar em produção, e deve.** A coluna nunca teve constraint. Antes de
  aplicar: `SELECT DISTINCT side FROM sale_contract_espelho_log;`. Se houver valor fora do par, a
  migration falha — e falhar é o comportamento certo.
- **"Mais novo" tem que usar o mesmo critério da ordenação que a tela mostra.** O `superseded` era
  decidido pela ordem de chegada da query; dois espelhos do mesmo lado no mesmo milissegundo deixariam
  o "corrente" a cargo da ordem que o Postgres devolvesse — e a estante marcaria como substituído
  justamente o que ela lista no topo. Agora o critério é o do sort final (data, empate pelo id).
- **Prop que ninguém passa é código morto que o linter não pega.** O modal guardado nasceu com um
  `onSaved` para o pai recarregar a estante. Só que o Detalhes **sempre fecha** antes da prévia de uma
  entrega nova abrir — a entrega fresca nunca coexiste com a estante. O prop saiu.

### 13.6 O que NÃO entrou (registrado)

- 🔴 **A base de cálculo fora do papel.** Com "só o percentual", `1.500,00 = 150,00 × 10` continua não
  impresso, e a leitura `Preço + Valor` continua **contando o ágio duas vezes** para quem lê o papel
  (ele não diz que "Preço" já inclui o ágio, nem que "Valor" é por saca). Uma linha no rodapé resolve.
- 🔴 **`updateSampleMovement` sem guard de contrato** (`sample-command-service.js`): trocar as sacas de
  uma venda com contrato ligado deixa o contrato com sacas e dinheiro velhos. É porta de API/script —
  **nenhuma tela chama**. Compare com o guard do CANCELAR (`MOVEMENT_HAS_CONTRACT`, RC-D87).
- 🔴 **"Editar" sem o par de ágio apaga o ágio em silêncio** e reescreve as duas corretagens sem linha
  no `sale_contract_agio_log`. Pela UI não acontece (o modal reenvia), mas nada no backend preserva e
  nenhum teste cobre.
- ⚠️ **Financeiro × Espelho divergem de propósito:** o Financeiro **soma as duas pontas** num número e
  **inclui** contrato com 0% de corretagem; o Espelho é por parte e **recusa** 0%. Sem tela de
  reconciliação.
- ⚠️ **O `SaleContractAgioLog` não registra a corretagem** antes/depois — a mudança de comissão que foi
  para o papel não fica auditada.
- ⚠️ **`SaleContractBroker` não aparece no espelho:** é o único documento do fluxo que não nomeia quem
  corretou (coerente com D34/D136, mas é assimetria consciente).
- **Editar campos do espelho** — a RC-D104 fechou: o documento é imutável e se corrige pelo contrato.
- **Guardar o arquivo PDF** — ele escolheu guardar os números; os bytes seguem regenerados.

## Apêndice A — Ledger de decisões (condensado)

> Resolução final de cada decisão; as **superadas** apontam para o que as substituiu. O histórico completo (Contexto→Opções→Proposta + sessões) está no Git.

> ⚠️ **A §6 (RC-D62..D68) revogou um bloco inteiro deste apêndice.** Ficaram históricas: **D106**, **D122**, **D137** (o ciclo `EMITIDO→FATURADO→PAGO` e o botão "Pago"), **AP18** (o portão do faturar), **AP29** na parte da recuperação inline, e a **A.4 inteira — EMB1 a EMB34**. Também a **RC-D6** e a **RC-D22** (§5.2/§5.9). Elas ficam registradas porque explicam **por que** o modelo mudou; nada disso existe no código.

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
- **D76** — (**revogada pela RC-D42**, §5.12) Entrada do Espelho via modo de seleção (padrão "liga"): tocar 1 contrato elegível abre direto. Hoje o Espelho nasce **só no Detalhes** do contrato.
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
- **D104** — "Excluir" removido: Washout é a única quebra (contrato nunca é apagado; número fica registrado). ⚠️ **Parcialmente revogada pela RC-D87 (§10):** cancelar a venda pelo LOTE deixou de quebrar o contrato — continua sendo o motor do washout à vista, mas só acionável pelo próprio washout (409 `MOVEMENT_HAS_CONTRACT` para quem chega sem a resposta de corretagem).
- **D105** — Washout ainda paga corretagem: `WASH_OUT` segue no Financeiro e elegível ao Espelho. _(revisada pela D145: passa a valer **só para o FUTURO** — o físico cancelado não paga corretagem.)_
- ~~**D106**~~ ⚠️ **REVOGADA pela RC-D62 (§6)** — não há mais ciclo: `EMITIDO` → `FINALIZADO` (reversível). Original: pagamento só após faturamento, ciclo linear `EMITIDO → FATURADO → PAGO` (sem pular; o Desfazer saiu na D122).
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
- ~~**D122**~~ ⚠️ **ROMPIDA DE PROPÓSITO pela RC-D63 (§6)** — "Reabrir" desfaz o "Finalizar". A D122 valia para marcos **auditados** (faturar/pagar); finalizar é sinalizador de conveniência, e um toque errado não pode ser definitivo. O **Washout continua sem desfazer**. Original: "Desfazer" removido do sistema (backend + UI); ciclo só pra frente, engano só se corrige por Washout.
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
- ~~**D137**~~ ⚠️ **REVOGADA pela RC-D67 (§6)** — o botão morreu nas duas casas; `/financeiro` é leitura pura. Original: botão "Pago" (`FATURADO`→`PAGO`) migrou do card do contrato pro card do Financeiro (acesso igual; "Faturar" segue no contrato).
- **D138** — Pagamento do contrato vira evento do card de Eventos do dashboard (agendado no `paymentDate` / realizado no `paidAt`), escopado como o Financeiro (detalhes E21–E27 no `Dashboard-Visao-Geral.md`).
- **D139** — `ClientAttachment.unitId` (anulável) vincula o anexo a uma filial `ClientUnit`; vínculo definitivo via `PATCH`, não move o arquivo.
- **D140** — Escopo aberto do COMMERCIAL (own-only revogado; supera D110 e D135): ADMIN e COMMERCIAL veem e GERENCIAM TODOS os contratos, o Financeiro e o feed de pagamento — a posse por `Broker.userId` deixou de restringir (o backend removeu os 3 helpers de posse + o escopo inline das listas). Relaxa também o "nos dele" da D120, o "só nos dele" da AP9, o escopo da D138 e o "Ver contrato escopado" da AP27/AP30/EMB26 (passam a abrir a ADMIN+COMMERCIAL em qualquer contrato). Rótulo do Financeiro unificado em "Corretagem total". Motivo: simplificar o desenvolvimento; a corretagem não é dado por-corretor no schema (vive no `SaleContract`, 2 pontas — sem coluna de valor em `SaleContractBroker`), então abrir não expõe "cota alheia". Lookup inline segue ADMIN-only (D94).
- **D141** — Banco vira **texto livre** na conta bancária (supera D24 em parte e D39; ajusta D28/D59/D60): `ClientBankAccount.bankName` (texto obrigatório, máx. 120, entrada em MAIÚSCULAS como o Titular) substitui a FK `bankId`; a entidade `Bank` (lookup nome + COMPE) sai inteira do sistema — tabela, API `/banks`, aba "Bancos" de `/cadastros` (que fica Clientes | Corretores), `BankFormModal` e `BankSelectField`. Motivo: cadastrar uma instituição só para vincular a conta era fricção sem ganho — o nome do banco é dado de exibição (contrato/PDF), sem agrupamento nem relatório por banco. Compat: snapshots de contratos já emitidos preservam `bankName`/`compeCode` congelados (PDF e modal de Detalhes já renderizam o código condicionalmente); snapshots novos saem sem `bankId`/`compeCode`. Migration `20260714130000_bank_free_text` faz backfill do nome antes de dropar FK e tabela (prod nunca rodou as migrations de bancos — zero dado real; só o demo local tinha contas).
- **D142** — Cronograma coerente: a criação/edição valida `paymentDate >= invoiceDate` (`422 VALIDATION_ERROR` no campo `paymentDate`, em `normalizeEtapa2Input` — cobre à vista, Futuro e Editar; front espelha com erro dentro do campo). Motivo: dava para salvar pagamento planejado anterior ao faturamento planejado, cronograma incoerente que os feeds do dashboard exibiam sem crítica. Contratos já emitidos não são revalidados (a regra só age na escrita).
- **D143** — Conviver com o cross-aggregate **não-atômico** do Editar (emit): `_syncSampleOwner`/`_syncMovementFromContract` commitam antes da transação do contrato; se a `version` bumpar no meio, o 409 deixa amostra/venda à frente do contrato. Decisão: NÃO reescrever para o caminho atômico (`appendEventBatch`+`beforeCommit`, molde da criação à vista) — a janela é minúscula (a `version` é checada imediatamente antes dos syncs) e a divergência é **autocorrigível**: os dois syncs são idempotentes e convergem no retry do Editar pós-409. Hardening aplicado: a resolução de corretores (único 422 tardio) passou para antes dos syncs — depois deles, só o próprio conflito de versão pode falhar. O fix completo fica registrado como opção futura se o app ganhar concorrência real.
- **D144** — Datas planejadas **"À definir"** no FUTURO (condiciona D142; revisa parcialmente EMB22): em contratos `type='FUTURO'`, `invoiceDate` e `paymentDate` podem — **cada uma, independentemente** — vir `null` **explícito** no payload (escolha ativa "À definir" no form; `undefined` segue 422). À vista (MERCADO_A_VISTA) segue exigindo as duas — inclusive no Editar de um à vista (a permissão deriva de `contract.type`, não do payload). Backend: `normalizeEtapa2Input(input, { allowOpenDates })`; o emit passou a carregar o contrato ANTES de normalizar para conhecer o `type` (efeito: 404/409 agora precedem o 422 de payload). D142 só compara quando AMBAS presentes; dia-útil (DSB-D7) só vale para data presente. O Editar (EMITIDO) define a data depois — e também pode **voltar** uma data definida para "à definir" (regrava a etapa 2 inteira). **Embarque**: a worklist passa a **incluir** os sem `invoiceDate` (reverte o "sem data não entra na fila" da EMB22): estado sempre `a_embarcar` (nunca atrasado), no **fim do G0** (nulls-last), entre si por `contractSeq` (= ordem de emissão, pedido do Flavio); o contador de atrasados não os conta; o filtro "a embarcar" os inclui. Financeiro (`a_vencer`, nulls-last) e Aprovações (nulls-last) já toleravam null — mudança só de exibição. **Calendário/feeds do dashboard seguem SEM evento** até a data ser definida (range exclui null; não há onde plotar "à definir"). Faturar/pagar/embarcar direto é permitido (as transições usam só a data real). ⚠️ **REVOGADA nesta parte pela RC-D86 (§9):** faturar/pagar/embarcar já não existem (§6), e o que sobrou — **finalizar** — passou a **exigir** `invoiceDate` preenchida e já chegada; "à definir" não finaliza mais. O resto do D144 fica de pé. **Exibição**: texto "À definir" (cards, Detalhes, worklists; "À DEFINIR" no PDF do contrato; "À definir" no Espelho) em vez de "—". O filtro por período da aba Contratos segue **excluindo** quem não tem a data. `approvalReminderLeadDays` permanece como está (sem consumidor — só age quando o faturamento existir). Schema: colunas já anuláveis desde `20260626130000` — **zero migration**.
- **D145** — 🪦 **REVOGADA pela RC-D89 (§10, 2026-07-29):** a corretagem do cancelado deixou de ser derivada do TIPO e virou **resposta** dada no washout (`washout_billable`). O backfill da migration preserva o efeito dela em tudo que já existia. Texto original: _"Washout paga corretagem só no FUTURO"_ (revisava a D105): a corretagem de um `WASH_OUT` só é cobrável quando o contrato é `type='FUTURO'` (contrato a termo negociado que quebrou). O contrato **à vista** (`MERCADO_A_VISTA`) cancelado por washout **não gera cobrança**: some do **Financeiro** por completo — fora da lista, de todos os filtros (inclusive "Cancelado") e do cabeçalho "Corretagem total" — e tem o **Espelho de Corretagem bloqueado** (`409 ESPELHO_WASHOUT_SPOT`). O **FUTURO** em washout permanece inalterado (aparece no Financeiro como "cancelado", conta no total, Espelho normal). Backend: `listBrokerReceivables` passa a filtrar os grupos de washout e o agregado `totalCommission` por `{ status: 'WASH_OUT', type: 'FUTURO' }` (constante `WASHOUT_BILLABLE`); o gate do Espelho (`exportEspelhoPdf`) usa o predicado puro `isSpotWashout(contract)`. Como o físico washout é excluído **no `where`**, ele nunca chega à `buildReceivableView` → **zero mudança** no card/tipos TS/painel do Financeiro (toda linha exibida é não-washout ou FUTURO washout, como hoje). O front espelha o gate do Espelho esmaecendo o card ("À vista cancelado"). O "N vencidos" já era só `EMITIDO/FATURADO` — washout nunca contou lá. Motivo: a corretagem remunera a negociação; num contrato à vista que caiu não há negócio a remunerar (regra do Flavio). Regra de leitura/gate — **zero migration**, vale retroativamente para qualquer contrato.
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
- ~~**AP18**~~ ⚠️ **REVOGADA pela RC-D66 (§6)** — a aprovação não trava nada; virou aviso que se resolve sozinho ao sair a etiqueta. O latch **AP32** e a worklist **AP25–AP28** permanecem. Original: faturar exige ≥1 etiqueta enviada (422 `CONTRACT_APPROVAL_REQUIRED` em `invoiceSaleContract`); pagar herda.
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
- ~~**AP-P3 (PENDENTE, 2026-07-16)** — Unificar os dois lot-splitters~~ — ✅ **RESOLVIDA em 2026-07-29 pela RC-D100 (§12)**, e não por escolha de higiene: virou obrigatória. Os dois helpers quebravam a string de lotes com separadores **diferentes** — `normalizeCustomLabelLines` (`[,\n]+`) e `splitOriginLotForLabel` (`[\s,;]+`, o canônico, compartilhado com `deriveBlendOriginLot` e o `OriginLotChips`). A nota de 2026-07-16 dizia que era "latente" porque a etiqueta era read-only e o Lote de origem chegava sempre juntado por `", "`; **assim que o campo virou editável, o texto passou a chegar livre** e duas regras de quebra convivendo viraram o bug esperando a primeira colagem com espaço. O `normalizeCustomLabelLines` passou a **chamar** o `splitOriginLotForLabel` — a regra (separador + 16 chars + 7 + `"+"`) vive num lugar só. (A "válvula de escape" — desmarcar antes do 1º envio — nunca foi pendente: foi **descartada** na AP32 a favor da mão única pura.)
- **AP31 (2026-07-15)** — **Aviso de "aprovação a enviar" (re-liga o `approvalReminderLeadDays`).** O lead-time, retido **sem consumidor** desde a remoção do lembrete de calendário (DSB-D9), volta a ter uso: alimenta a janela de um **aviso** no novo **card de Avisos** do dashboard (**DSB-D19**, `Dashboard-Plano-de-Trabalho.md`). **Regra (binária, não fan-out):** o aviso existe enquanto `requires_approval=true AND status='EMITIDO' AND NOT EXISTS(approval_label_log) AND (invoice_date IS NULL OR invoice_date <= hoje_BRT + COALESCE(approval_reminder_lead_days,0) dias)` — reusa o predicado da worklist **G0** + o índice `idx_sale_contract_requires_approval_status_invoice` (ambos já existem → **sem migration**). **Some** quando a etiqueta é gerada (≥1 no `approval_label_log`) — e naturalmente já sai se o contrato deixa EMITIDO (faturado/washout). **"À definir" (D144): SEMPRE avisa** (sem prazo) — um contrato marcado + sem etiqueta + sem data é, se qualquer coisa, **mais** urgente; coerente com a worklist G0 (que já lista os sem data, `NULLS LAST`). O feed antigo os **escondia** (`invoiceDate: { not: null }`); aqui o predicado inclui `invoice_date IS NULL`. **Escopo aberto**, todos os não-PROSPECTOR (= worklist, AP10). Colapsa o _fan-out_ impreciso que motivou o DSB-D9 (o mesmo contrato borrado por N dias do calendário) num **flag binário** (pendente → some). O texto de urgência ("vence esta semana/este mês/em N dias", "sem data" p/ À definir) e a apresentação vivem na DSB-D19.
- **AP32 (2026-07-16)** — **Aprovação vira latch de mão única + botão "Solicitar aprovação" (reforma AP20/AP23; fecha o furo do "Editar").** `requiresApproval` passa a ser **irreversível** uma vez "Sim": Não→Sim é permitido, Sim→Não **nunca** — nem antes do 1º envio (endurece a AP20, que só travava após o envio). **Motivo:** o "Editar" (`emitSaleContract` → `_resolveEmitData`) regravava o sinal do payload **sem** a trava do toggle, e como o portão do faturar é `if (requiresApproval)` (AP18), dava pra desmarcar em `EMITIDO` e **zerar o portão** (achado 🔴; sem teste). Em vez de duplicar a trava, o modelo colapsa: (a) o **`emitSaleContract` deixa de tocar** `requiresApproval` (preserva o do banco — as 3 rotas compartilham `_resolveEmitData`, mas só o emit strippa; criar-à-vista/futuro seguem gravando, **Shape B**); (b) o marcar-depois deixa de ser via Editar e vira um **botão "Solicitar aprovação"** no Detalhes (só quando "Não" + `EMITIDO` + gerencia), com **confirmação** (é definitivo); (c) o `setSaleContractApprovalFlag` vira **latch-only** — rejeita `false` incondicional (409 `APPROVAL_FLAG_LOCKED`), idempotente em já-"Sim" (**não re-seta o lead**), Não→Sim grava `true` + `approvalReminderLeadDays=30`. **Criação mantém a escolha Sim/Não** (Shape B; "Sim" já nasce travado). O **lead** segue editável pela etapa 2 quando "Sim" (não é portão, só a janela do card de Avisos, AP31); o latch nunca mais o apaga — **colateral 🟢:** o reset do toggle a cada uso (que virou efeito real após a AP31) deixa de existir. No **Editar** a aprovação vira **read-only**. Congelamento por status da AP20 (só `EMITIDO`, `APPROVAL_FLAG_NOT_EDITABLE`) mantido. **Sem migration** (regra/gate; contratos já-"Sim" seguem "Sim"). A "válvula de escape" (permitir desmarcar antes do 1º envio) foi **descartada** a favor da mão única pura (pedido do Flavio).
- **AP33 (2026-07-16)** — **Worklist de Aprovações alinha o "cancelado" ao Financeiro (`type='FUTURO'`).** O bucket G2 (`WASH_OUT`) do `listApprovalContracts` filtrava só por `status` (sem `type`), então um **à vista** cancelado por washout **aparecia** na worklist como "cancelado" — mas o Financeiro o **esconde** (D145: à vista washout não paga corretagem, sai por `WASHOUT_BILLABLE={status:'WASH_OUT',type:'FUTURO'}`). As duas abas discordavam do que é "cancelado" (achado 🟡). **Fix:** a G2 passa a filtrar `AND type='FUTURO'` (espelha `isSpotWashout`/`WASHOUT_BILLABLE`), fechando o princípio do D147 ("o washout ramifica por type, alinhado ao Financeiro/Espelho") — que não havia alcançado a worklist. À vista washout segue visível só em `/contratos` (status Wash-out). **Sem migration.** ⚠️ **O PREDICADO mudou na RC-D89 (§10):** o G2 passou a filtrar `washout_billable IS TRUE`, junto com o Financeiro. O **princípio** do AP33 é o que valia e segue valendo: "cancelado" tem que significar a mesma coisa nas duas abas.
- **AP-higiene (2026-07-16, pós-AP29):** removidos comentários stale (porta /samples / "avulsa" em `ApprovalLabelModal`, `normalizeCustomLabelLines`, `buildApprovalPrefill`), o **picker dormente** `/approval-labels/contracts` (rota+handler `listApprovalContractOptions`+tipo `ApprovalContractOption`+mapper, sem caller — o sub-route `.../prefill` fica) e o **branch "Voltar" morto** do `ApprovalLabelModal` (2 callers passavam `null`). Os **dois lot-splitters** com separadores diferentes (`,\n` vs `-\s,;`) ficam para revisão específica futura (**AP-P3**, fora desta leva).

### A.4 Embarque (EMB1–EMB34) — ⚠️ REVOGADA INTEIRA pela RC-D65 (§6)

> **O embarque não existe mais no app.** Apagados: confirmação, fotos (`SaleContractShipmentPhoto`), transporte/responsável (EMB30/EMB31), `requiresShipment`, `shippedAt`, o portão EMB28, as 5 rotas, o `sale-contract-shipment-service.js`, a worklist e os 3 eventos de calendário. Migration `20260728120000`. O ledger abaixo fica pelo **porquê** — registrar embarque era escrituração pura (§6.1), e a Safras não ia fazer.

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
