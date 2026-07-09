# Embarque — Plano de Trabalho

> **Status: DESIGN COMPLETO — pronto para implementação (2026-07-09).** Novo tipo de evento para o card
> de Eventos do dashboard (F3+ de `Eventos-Dashboard-Plano-de-Trabalho.md`): o
> **embarque** = o café **carregado no caminhão**. Acontece **no mesmo dia do
> faturamento** por padrão, mas é um evento **distinto** (faturamento = emissão
> da NF, externo ao app; embarque = a carga física). Espelha a mecânica da
> **Aprovação** (um **sinal booleano** no contrato + uma **data**), mas com
> **ciclo próprio** (pendente → finalizado), independente do ciclo de pagamento.
> **Ordem combinada:** primeiro **a lógica** (campos, gate, auto-preenchimento,
> edição) — este bloco; **depois a apresentação** no calendário (Bloco 2).
> **Design completo (EMB1–EMB19):** Bloco 1 (lógica), Bloco 2 (apresentação) e
> Bloco 3 (Embarque finalizado) fechados. Resta a **implementação** (fases em plan
> mode; EMB-P3 endpoints, EMB-P4 gate). Só decisão/registro — **sem código**.

## Contexto e objetivo

O café vendido num contrato precisa, em muitos casos, ser **embarcado** (carregado
no caminhão) para sair. O Flavio quer transformar esse embarque num **evento
rastreável**, apresentado no card de Eventos do dashboard — a exemplo dos
pagamentos (F1) e do lembrete de aprovação (F2).

O ponto de partida (fala do Flavio, 2026-07-09):

- O **embarque acontece no mesmo dia do faturamento** — mas **não é o mesmo
  evento**. Faturamento = emissão da nota fiscal (fora do escopo do app);
  embarque = o carregamento físico. Podem, na prática, **divergir de data**.
- **Não ocorre na modalidade "Disponível".**
- "Igual à Aprovação": um **booleano** no contrato registra se **terá embarque
  ou não**, conforme a **modalidade** escolhida (se Disponível, não se aplica).
- Marcando **"Sim"**, a **data do embarque auto-preenche com a do faturamento**,
  editável na hora **e** depois de gerado o documento.
- Vai aparecer em Eventos — mas **a lógica primeiro**, a apresentação depois.

A ordem das decisões:

1. **Bloco 1 — a lógica (o sinal + a data + a edição):** como/quando se marca
   "terá embarque", o gate por modalidade, o auto-preenchimento e a janela de
   edição. ✅ registrado (**EMB1–EMB6**)
2. **Bloco 2 — a apresentação (o evento no card):** tipo/dot/cor/rótulo, janela,
   agendado × realizado, visibilidade por papel. ✅ **fechado — EMB7–EMB12 + EMB17**
3. **Bloco 3 — Embarque finalizado (a confirmação):** fotos obrigatórias, data
   real, quem/onde, realizado no calendário, ver fotos, terminal. ✅ **fechado —
   EMB13–EMB19**

## Estado atual (o que o código já oferece)

Base da análise (Explore, 2026-07-09) — o que o `SaleContract` já tem e onde o
embarque se encaixa:

- **Dois eixos, não confundir:**
  - **`type`** (`enum SaleContractType { MERCADO_A_VISTA, FUTURO }`,
    `schema.prisma:805`, sem `@map`) — o eixo à vista × futuro, escolhido no
    **leque "+"** de criação (`ContractCreateRadialFab`).
  - **`modality`** (`modalityId`/`modalityText` `@map`, `schema.prisma:848-849`;
    lookup `ContractModality` → `@@map("contract_modality")`) — valores semeados
    **`Retirar` (1) · `Posto` (2) · `Disponível` (3)**
    (`migration 20260626130000`). Escolhido no **select "Modalidade"** do modal de
    emissão (`SaleContractEtapa2Modal.tsx:1024-1030`), resolvido no
    `_resolveEmitData` (lookup `'contractModality'`). **"Disponível" é um valor da
    _modalidade_ — não é o tipo "à vista".**
- **`invoiceDate DateTime? @map("invoice_date") @db.Date`** (`schema.prisma:852`)
  — a data de faturamento **planejada**, **obrigatória** na Etapa 2
  (`requireDate`, `sale-contract-support.js:836`). Companheira **real**:
  `invoicedAt` (`schema.prisma:857`), preenchida ao marcar **FATURADO**. Como é
  capturada no **mesmo modal** onde o sinal do embarque vai viver, está
  **disponível para o auto-preenchimento**.
- **Ciclo de status:** `EMITIDO → FATURADO → PAGO` + `WASH_OUT`
  (`enum SaleContractStatus`, `schema.prisma:103-108`). Transições no serviço:
  `invoiceSaleContract` (`:902-950`, grava `invoicedAt`), `paySaleContract`
  (`:956-1000`, grava `paidAt`), `washoutSaleContract` (`:1017-1090`). Cada uma =
  `updateMany` enxuto + `SaleContractStatusLog` + bump de `version`.
- **Precedente `requiresApproval`** (Boolean, `schema.prisma:863`) +
  `approvalReminderLeadDays` — a fiação a espelhar: `normalizeEtapa2Input`
  (`support:814-853`) → `_resolveEmitData.data` (`service:1382-1383`, cobre
  `createSpot`/`createFuture`/`emit`) → `toSaleContractView` (`support:368-369`)
  **+ `SALE_CONTRACT_VIEW_SELECT`** (`support:313-314`, a allow-list de colunas do
  Prisma — 4º ponto de pick) → seção no `SaleContractEtapa2Modal` (`:1112-1160`) →
  `lib/types.ts` (3 interfaces).
- **Edição pós-emissão:** o **"Editar"** (modal de Detalhes → `emitSaleContract`,
  `service:668-805`) é **EMITIDO-only** — trava com **409
  `SALE_CONTRACT_NOT_EMITTABLE`** (`:684-688`) assim que o contrato sai de
  `EMITIDO`. **Relevante para o EMB5** (a data do embarque precisa ser editável
  depois de FATURADO).
- **Nenhum campo de embarque/shipment/loading existe hoje** no schema, tipos ou
  serviço — superfície nova, sem duplicação. _(O subsistema `shipping-print/*` é a
  fila da etiqueta impressa; nada a ver com o contrato.)_

## Decisões travadas — Bloco 1: a lógica (2026-07-09)

- **EMB1 — Embarque é um evento NOVO, distinto do faturamento (mesmo dia por
  padrão).** Café carregado no caminhão. O faturamento (NF) é externo ao app; o
  embarque é a carga física. Caem no **mesmo dia por padrão** (EMB4), mas são
  **independentes** e podem divergir de data (EMB5). Vira um **tipo de evento** no
  card de Eventos — a apresentação fica pro **Bloco 2** (lógica primeiro).

- **EMB2 — Gate pela MODALIDADE (não pelo tipo): só há embarque quando
  `modality ≠ Disponível`.** "Disponível" é um valor da **lookup de modalidade**
  (`Retirar`/`Posto`/`Disponível`) escolhida no select "Modalidade" da Etapa 2 —
  **não** confundir com o tipo à vista/futuro. Quando a modalidade é
  **`Disponível`**, o contrato **não tem embarque** (a seção do sinal nem
  aparece). Qualquer outra modalidade (`Retirar`, `Posto`, futuras) → **tem
  embarque**. Vale para **qualquer tipo** (à vista ou futuro): o gate é **só a
  modalidade**. _(Consequência a observar — EMB-P4: hoje o gate seria pelo valor
  "Disponível" do lookup configurável; se as modalidades proliferarem, avaliar uma
  flag na própria `ContractModality` em vez de hardcode.)_

- **EMB3 — Booleano `requiresShipment` (Sim/Não), obrigatório quando aplica.** No
  modal de emissão, espelhando a seção "Aprovação" (segmentado **Sim / Não**, nada
  pré-selecionado, molde `inf-pill`, press-effect só de escala). **Aparece só
  quando `modality ≠ Disponível`** (EMB2) e aí é **escolha obrigatória** — o
  formulário não conclui sem decidir (como o `requiresApproval`). Quando
  **Disponível**, fica **`false` automático** e a seção some. **Nomes
  confirmados** (EMB-P5).

- **EMB4 — Data `shipmentDate` (`@db.Date`), auto-preenchida com o faturamento.**
  Quando **"Sim"**, a data do embarque **auto-preenche com a `invoiceDate`** (a
  data de faturamento planejada, já capturada no mesmo modal), e fica **editável
  ali**. **Obrigatória** quando `requiresShipment = true`. É um **campo próprio**
  (não reaproveita `invoiceDate`) **justamente para poder divergir** do
  faturamento (EMB5) — o "mesmo dia" é o **default de planejamento**, não uma
  amarra.

- **EMB5 — Data editável na vida editável do contrato: `EMITIDO` + `FATURADO`;
  `PAGO` e `WASH_OUT` travam.** Como o contrato **pode ser faturado antes de
  embarcar**, a `shipmentDate` **continua editável depois de `FATURADO`** — logo
  **não** cabe no "Editar" atual (EMITIDO-only, 409 `SALE_CONTRACT_NOT_EMITTABLE`),
  precisa de um **caminho dedicado** (EMB-P3, molde `invoiceSaleContract`). O teto é
  o **`PAGO`: estado final do contrato — depois de pago não se edita mais nada**
  (Flavio, 2026-07-09); **`WASH_OUT` cancela** o embarque. Janela de edição =
  **`EMITIDO` + `FATURADO`**. O ciclo do embarque (pendente → finalizado, EMB6)
  corre nesse **eixo próprio**, mas **dentro** da vida editável do contrato.
  _(Quando existir o "Embarque finalizado" — EMB6 — ele trava a data antes disso,
  mesmo em `FATURADO`.)_

- **EMB6 — Por ora só a data planejada; "Embarque finalizado" é decisão FUTURA
  (confirmada).** Nesta fase o embarque é **uma data só** (planejada), **sem** ação
  de marcar como realizado. O Flavio **confirmou que haverá uma ação "Embarque
  finalizado"** depois: ela gravará a **data real** (campo tipo `shippedAt`, a
  definir), **travará** a edição da `shipmentDate` (fecha a janela do EMB5) e
  habilitará o estado **"realizado"** no calendário (agendado × realizado, à
  moda dos pagamentos). Fica no **Bloco 3** (EMB-P1). O par planejado→real espelha
  `invoiceDate→invoicedAt` / `paymentDate→paidAt`, mas num **eixo próprio**.

## Decisões travadas — Bloco 2: a apresentação no card (2026-07-09)

Início do Bloco 2 (o embarque como evento no card de Eventos — será o **F3+** do
`Eventos-Dashboard-Plano-de-Trabalho.md`). Primeiras decisões:

- **EMB7 — Visibilidade: todos os não-PROSPECTOR (como a aprovação, AP10).** O
  embarque é **tarefa operacional** — todos os papéis não-PROSPECTOR veem o evento,
  **sem escopo por posse** (contrasta com os pagamentos, escopados por papel — E22).
  Implicação de implementação: o endpoint é **auth-only, sem gate de papel** (molde
  do `getDashboardApprovalEvents`, não o dos pagamentos com `FINANCEIRO_ROLES`).
- **EMB8 — Janela: só no dia da `shipmentDate` (a princípio).** O evento aparece
  **apenas no dia** do embarque — **não** há fan-out de lembrete (≠ aprovação, que
  pinta de `invoiceDate − lead` em diante, todos os dias). É um evento **pontual**
  (1→1, molde dos pagamentos, não 1→N). _("A princípio" — um lead-time/lembrete de
  embarque é melhoria futura, se pedirem.)_
  - **Distinção-chave vs. aprovação:** o lembrete de aprovação **sumia ao faturar**
    (a aprovação precede o faturamento). O embarque é o **oposto** — ocorre **no ou
    depois** do faturamento (EMB5) —, então o evento **persiste após `FATURADO`**.
    Quais status exatamente mostram o evento = **EMB9** (abaixo).
- **EMB9 — Status que mostram o evento: `EMITIDO` + `FATURADO` (some no `PAGO` e
  `WASH_OUT`).** No dia da `shipmentDate`, o evento aparece **só** enquanto o
  contrato está **`EMITIDO` ou `FATURADO`**. **Some no `PAGO`** (estado final —
  negócio fechado, embarque tido como feito) e no **`WASH_OUT`** (cancelado). Casa
  com a janela de edição da data (EMB5). _(Quando o "Embarque finalizado" existir —
  EMB-P1 — ele vira o corte preciso do "feito", inclusive dentro de `FATURADO`.)_
- **EMB10 — Dot azul `#2563eb` (leitura de transporte/logística).** Cor **nova**,
  distinta das já usadas (amarelo `#eab308` pagamento agendado · verde `#15803d`
  pago · laranja `#f97316` aprovação — regra E5, 1 cor por tipo). `typeKey`
  **`contract_shipment`** (proposto). **Um só sub-tipo por ora**; o "realizado"
  (agendado × realizado, com cor/`typeKey` próprios) nasce com o EMB-P1.
- **EMB11 — Rótulo do item recolhido = `embarque · nº · comprador`.** No painel do
  dia, o item usa o descritor **"embarque"** + nº do contrato + comprador — a
  palavra distingue rápido quando o dia acumula pagamento/aprovação/embarque
  (contrasta com os pagamentos, que vão sem palavra). Vendedor e status completos
  ficam no expandido (EMB12).
- **EMB12 — Evento expansível (acordeão), molde dos pagamentos/aprovação.** Clicar
  no item **expande** e revela **nº · comprador · vendedor · status** + o botão
  **"Ver contrato"** (→ `/contratos?details=<id>`, como o E27 dos pagamentos). O
  stub do evento carrega `contractId` + esses campos (promover no `lib/types.ts` na
  implementação). **Ações futuras** no expandido: **"Embarque finalizado"**
  (EMB-P1) e, se fizer sentido, a **edição da `shipmentDate`** (EMB5/EMB-P3) — por
  ora, só **"Ver contrato"**.

## Decisões travadas — Bloco 3: Embarque finalizado (2026-07-09)

Abre o **EMB-P1** — a ação de **confirmar** que o embarque aconteceu (o "realizado"
que faltava no Bloco 2). Ela grava a **data real**, **trava** a edição da
`shipmentDate` (EMB5) e habilita o **agendado × realizado** no calendário.

**Base técnica do upload (Explore, 2026-07-09):** o app guarda anexos em **disco
local** (`UPLOADS_DIR`; **sem GCS/URL assinada**), via **POST multipart síncrono**
(valida + grava o arquivo + cria a linha no DB no mesmo request), com **validação
de magic bytes** pelo pacote `file-type` (`src/uploads/local-upload-service.js`).
Dois moldes existentes: `SampleAttachment` (**1 por tipo**, unique — não serve) e
**`ClientAttachment` (N arquivos por entidade** — lista/upload/delete + galeria;
JPEG/PNG/WebP + PDF). **O molde do embarque é o `ClientAttachment`.** Hoje o
`SaleContract` **não tem nenhuma foto** (só `SaleContractExport`, metadado do PDF).
**Não há checagem de mínimo em lugar nenhum** → o "≥1 obrigatória" é regra **nova**.
Tamanho máx. atual = **12 MiB** por arquivo; leitura via **rota-proxy autenticada**
(não URL pública).

- **EMB13 — Confirmar o embarque EXIGE fotos (≥1, evidência do carregamento).** A
  ação "Embarque finalizado" **só conclui com pelo menos uma foto** anexada
  (característica trazida pelo Flavio, 2026-07-09). Molde do **`ClientAttachment`**
  (**N fotos por contrato**, com galeria), **novo modelo** (ex.
  `SaleContractShipmentPhoto` / `SaleContractAttachment` com `kind`), storage local
  `contracts/<id>/shipment/…`, reusando o `LocalUploadService` (+ um
  `saveContractPhoto`) e a validação de magic bytes. **O mínimo 1 é regra nova**
  (server-side; não há precedente de min-count). _(Formato e nº máximo = a
  confirmar — resolvido em **EMB14**.)_
- **EMB14 — Fotos: mín. 1, máx. 10, JPEG/PNG/WebP.** A confirmação aceita de **1 a
  10 fotos** (mín. 1 = EMB13; teto 10). Formato **JPEG/PNG/WebP** (fotos de câmera,
  **sem PDF** — ≠ `ClientAttachment`). Tamanho máx. por arquivo = o padrão atual
  (**12 MiB**, `upload-policy.js`); magic bytes via `file-type`.
- **EMB15 — Data real `shippedAt` = hoje (data da confirmação), NÃO editável.** Ao
  confirmar, grava `shippedAt` = **o dia da confirmação** (BRT), **sem campo de
  data** no fluxo (≠ o "Faturar"/"Pago", que abrem dialog de data). É o par **real**
  do `shipmentDate` planejado (espelha `invoiceDate → invoicedAt`), `@db.Date`. O
  **"realizado"** no calendário usa essa data.
- **EMB16 — Quem confirma = todos os não-PROSPECTOR; porta = só o dashboard (por
  ora).** Confirmação é **tarefa operacional**, aberta a **todos os não-PROSPECTOR**
  (mesmo público do evento, EMB7 — sem escopo por posse). **Única porta (por
  enquanto):** o botão **"Embarque finalizado"** no **evento expandido do dashboard**
  (slot reservado pela EMB12). O **Detalhes do contrato (/contratos)** fica como
  **porta futura** (registrada, fora agora).
  - **Nota (alcance):** o evento aparece só no dia da `shipmentDate` (EMB8). Se o
    embarque atrasar, mantém-se o alcance **atualizando a `shipmentDate`** (EMB5, o
    evento acompanha) e confirma-se no novo dia; se a fricção incomodar, abre-se a
    porta do Detalhes.
- **EMB17 — Realizado no calendário: dot azul-escuro `#1e40af` no dia do
  `shippedAt`.** Ao confirmar, o evento **agendado** (dot azul `#2563eb` no
  `shipmentDate`, EMB10) **vira realizado** — dot **azul-escuro `#1e40af`** no dia do
  `shippedAt` (`typeKey` **`contract_shipment_done`**; mesma família azul, tom
  "concluído") e **permanece no histórico** do calendário (não some). Molde do
  agendado → realizado dos pagamentos (`paymentDate` → `paidAt`). Fecha o 2º sub-tipo
  do EMB-P2.
- **EMB18 — Fotos vistas no Detalhes do contrato (/contratos), seção "Embarque".** O
  lugar durável das fotos é o **modal de Detalhes** do contrato: uma seção
  **"Embarque"** com a **data real** (`shippedAt`) + a **galeria de fotos** (molde da
  galeria de anexos do cliente — thumbnails + preview; leitura via rota-proxy
  autenticada). **Ver ≠ confirmar:** a **confirmação** segue **só no dashboard**
  (EMB16); o Detalhes é **leitura** (o evento do dashboard some, então as fotos
  precisam de casa fixa).
- **EMB19 — Confirmação é TERMINAL (sem desfazer, sem trocar fotos).** Uma vez
  confirmado, **não há undo** nem substituição das fotos (coerente com o contrato,
  que não tem undo — D122); `shippedAt` e fotos ficam gravados definitivamente. **E
  trava a edição da `shipmentDate`** — fecha a janela do EMB5: a data só é editável
  enquanto **`EMITIDO`/`FATURADO` E embarque não finalizado**.

## Propostas (não travadas — a confirmar / detalhar na implementação)

- **Nomes dos campos:** `requiresShipment` + `shipmentDate` — **confirmados**
  (EMB-P5, 2026-07-09); padrão inglês do schema (como `requiresApproval` /
  `invoiceDate`).
- **Campo da data real:** `shippedAt DateTime? @db.Date` (**EMB15**; **não-nulo =
  embarque finalizado** — estado derivado, sem enum novo). Gravado = hoje na
  confirmação.
- **Fotos + confirmação (Bloco 3):** **novo modelo** `SaleContractShipmentPhoto` (N
  por contrato, molde `ClientAttachment`: `storagePath`, `mimeType`, `sizeBytes`,
  `checksumSha256`, `uploadedByUserId`, `createdAt`) + método
  `LocalUploadService.saveContractPhoto` (storage `contracts/<id>/shipment/…`, magic
  bytes JPEG/PNG/WebP). **Endpoint de confirmação** = **POST multipart** (ex.
  `sale-contracts/{id}/shipment-confirmation`) que valida **1–10** fotos + grava
  `shippedAt` = hoje + aplica a **regra nova de mín. 1**, tudo numa transação;
  **auth-only** (todos os não-PROSPECTOR — EMB16). Leitura das fotos = **rota-proxy
  autenticada** (= fotos de amostra/anexos). Calendário: 2 `typeKey`
  (`contract_shipment` azul agendado / `contract_shipment_done` azul-escuro
  realizado).
- **Mapa de implementação (mirror do `requiresApproval`):** schema (2 colunas) +
  migration aditiva idempotente → `normalizeEtapa2Input` (valida; `shipmentDate`
  obrigatória e default = `invoiceDate` quando "Sim") → `_resolveEmitData.data`
  (grava, cobre os 3 caminhos) → `toSaleContractView` **+
  `SALE_CONTRACT_VIEW_SELECT`** (lê — **não esquecer a allow-list**) → seção no
  `SaleContractEtapa2Modal` (condicional à modalidade) → `lib/types.ts` (3
  interfaces). A **edição pós-faturamento** (EMB5) = **endpoint dedicado** à parte
  (molde `invoiceSaleContract`: `updateMany` só da `shipmentDate` + `version` +
  possivelmente um `SaleContractStatusLog`/marco), **não** o `emitSaleContract`
  EMITIDO-only. _(Tudo isto se materializa nas fases de implementação, cada uma em
  plan mode — não agora.)_

## Pendências / próximos blocos

- **EMB-P1 — ✅ RESOLVIDA (Embarque finalizado desenhado — Bloco 3).** Fotos 1–10
  (EMB13/EMB14) · `shippedAt` = hoje fixo (EMB15) · todos não-PROSPECTOR, só no
  dashboard (EMB16) · realizado azul-escuro `#1e40af` (EMB17) · fotos no Detalhes
  (EMB18) · terminal + trava da `shipmentDate` (EMB19). Ver Bloco 3.
- **EMB-P2 — ✅ RESOLVIDA (apresentação no card completa).** EMB7 visibilidade ·
  EMB8 janela · EMB9 status · EMB10 dot azul (agendado) · EMB11 rótulo · EMB12
  expandido + "Ver contrato" · **EMB17 realizado (azul-escuro `#1e40af`)**. Será o
  **F3+** do `Eventos-Dashboard-Plano-de-Trabalho.md`.
- **EMB-P3 — Mecanismo da edição pós-faturamento (EMB5).** Endpoint dedicado
  (molde `invoiceSaleContract`/`paySaleContract`) vs outra abordagem — decidir na
  fase de implementação (plan mode). Precisa **permitir `EMITIDO` + `FATURADO`** e
  **barrar `PAGO`** (terminal — EMB-P6) e `WASH_OUT` (e, quando existir, o
  "finalizado").
- **EMB-P4 — Gate por valor "Disponível" (EMB2).** Hardcode do valor do lookup vs
  flag na tabela `ContractModality`. Simplicidade agora (hardcode) × robustez se as
  modalidades crescerem. Decidir na implementação.
- **EMB-P5 — ✅ RESOLVIDA (2026-07-09).** Nomes confirmados:
  `requiresShipment` + `shipmentDate`.
- **EMB-P6 — ✅ RESOLVIDA (2026-07-09).** `PAGO` **trava** a edição — é o estado
  **final** do contrato (depois de pago não se edita nada). Janela = `EMITIDO` +
  `FATURADO` (ver EMB5).

## Histórico

- **2026-07-09** — Doc criado. Fase de decisão iniciada com o Flavio (análise do
  modelo de contratos via Explore + perguntas). **Bloco 1 (a lógica) registrado —
  EMB1–EMB6.** Desambiguação-chave: o gate é a **modalidade** ("Disponível" = sem
  embarque), **não** o tipo à vista/futuro. Refinamento da resposta (a): como o
  contrato **pode ser faturado antes de embarcar**, a data do embarque é editável
  **também depois de `FATURADO`** (ciclo próprio pendente → finalizado, EMB5) —
  logo **não** cabe no "Editar" EMITIDO-only. Resposta (b): confirmado que
  a ação **"Embarque finalizado"** virá depois (EMB6/EMB-P1); por ora, só a data
  planejada. Resposta (c): o booleano é **obrigatório quando aplica** (EMB3). A
  **apresentação** no calendário fica pro Bloco 2. Só decisão/registro — **sem
  código**.
- **2026-07-09 (cont.) — EMB-P5/P6 resolvidas; Bloco 1 fechado.** Nomes
  **confirmados** (`requiresShipment` + `shipmentDate`). E o **`PAGO` trava a
  edição**: é o estado **final** do contrato (depois de pago não se edita nada),
  então a janela de edição da `shipmentDate` fica em **`EMITIDO` + `FATURADO`**
  (refina o "inclui `PAGO`" que o EMB5 assumira); `WASH_OUT` cancela. **Bloco 1 (a
  lógica) fechado ponta a ponta (EMB1–EMB6).** Só decisão/registro — sem código.
- **2026-07-09 (Bloco 2 iniciado — EMB7/EMB8).** Apresentação no card: **EMB7**
  visibilidade = **todos os não-PROSPECTOR** (tarefa operacional, como a aprovação
  AP10; endpoint auth-only, sem gate de papel) e **EMB8** janela = **só no dia** da
  `shipmentDate` ("a princípio"; evento pontual 1→1, sem fan-out de lembrete).
  Distinção registrada: o evento **persiste após faturar** (≠ aprovação, que sumia
  ao faturar — o embarque ocorre no/depois do faturamento). Só decisão/registro —
  sem código.
- **2026-07-09 (Bloco 2 cont. — EMB9/EMB10).** **EMB9** status que mostram o evento
  = **`EMITIDO` + `FATURADO`** (some no `PAGO` = terminal e `WASH_OUT` = cancelado;
  casa com a janela de edição EMB5); **EMB10** dot **azul `#2563eb`** (`typeKey`
  `contract_shipment`; cor nova, distinta do amarelo/verde/laranja — E5). Um só
  sub-tipo por ora (o "realizado" vem com o EMB-P1). Falta o **rótulo** e o
  **expandido**/ações. Só decisão/registro — sem código.
- **2026-07-09 (Bloco 2 — base fechada, EMB11/EMB12).** **EMB11** rótulo recolhido
  = **`embarque · nº · comprador`** (a palavra distingue no dia cheio); **EMB12**
  evento **expansível** (acordeão) com nº·comprador·vendedor·status + **"Ver
  contrato"** (molde pagamentos/aprovação; "Embarque finalizado" e edição da data =
  ações futuras). **Base da apresentação fechada (EMB7–EMB12).** Resta só o
  agendado × realizado (depende do EMB-P1 = a ação de finalizar) + a implementação
  (EMB-P3 endpoint/edição, EMB-P4 gate, em plan mode). Só decisão/registro — sem
  código.
- **2026-07-09 (Bloco 3 aberto — Embarque finalizado, EMB13).** Flavio abriu o
  design do "Embarque finalizado" (EMB-P1) com uma característica firme: **confirmar
  o embarque EXIGE fotos** (≥1, evidência do carregamento). Explore mapeou o upload
  (disco local, magic bytes via `file-type`, molde **`ClientAttachment`**
  multi-arquivo; `SaleContract` sem foto hoje; **sem min-count → regra nova**).
  **EMB13** registrado (fotos obrigatórias, novo modelo, molde `ClientAttachment`).
  A desenhar no Bloco 3: data real, quem/onde confirma, o realizado no calendário,
  trava da edição, onde ver as fotos. Só decisão/registro — sem código.
- **2026-07-09 (Bloco 3 cont. — EMB14/EMB15/EMB16).** **EMB14** fotos **1–10**,
  JPEG/PNG/WebP (sem PDF), 12 MiB/arquivo; **EMB15** `shippedAt` = **hoje** (dia da
  confirmação), **sem editar** (par real do `shipmentDate`, `@db.Date`); **EMB16**
  confirma = **todos os não-PROSPECTOR**, porta = **só o evento do dashboard** por
  ora (Detalhes do contrato = porta futura registrada). Falta: o realizado no
  calendário (2ª cor/`typeKey`), onde ver as fotos, e terminal/undo. Só
  decisão/registro — sem código.
- **2026-07-09 (Bloco 3 fechado — EMB17/EMB18/EMB19; DESIGN COMPLETO).** **EMB17**
  realizado no calendário = dot **azul-escuro `#1e40af`** no `shippedAt`
  (`contract_shipment_done`; agendado → realizado como os pagamentos, fica no
  histórico); **EMB18** fotos vistas no **Detalhes do contrato** (seção "Embarque":
  data real + galeria, molde dos anexos do cliente; ver ≠ confirmar); **EMB19**
  confirmação **terminal** (sem undo/troca — D122) e **trava a `shipmentDate`**
  (fecha o EMB5). **Feature desenhada ponta a ponta (EMB1–EMB19);** próximo =
  implementação (fases em plan mode). Só decisão/registro — sem código.
- **2026-07-09 (design registrado; NÃO implementar agora).** Flavio decidiu **não
  implementar ainda** — vai fazer uma **mudança grande nas páginas que impacta os
  Eventos** (em outra conversa) e quis o design **todo registrado** antes. ⚠️ A
  **apresentação (Bloco 2: EMB7–EMB12/EMB17)** é acoplada ao card de Eventos →
  **pode precisar re-validação** depois dessa mudança; a **lógica (Bloco 1)** e o
  **finalizado (Bloco 3)** independem das páginas. Retomar direto na implementação
  (F1–F3, plan mode). Doc + memória sincronizados; working tree **sem commit**.
