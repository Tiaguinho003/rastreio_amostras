# Embarque — Plano de Trabalho

> **Status: IMPLEMENTADO PONTA A PONTA — F1–F6 (EMB1–EMB29), 2026-07-10.** Seis commits
> em `main` (NÃO pushados; 📱 validar no device): `67ed909` (F1 sinal/schema) · `4554531`
> (F2 confirmação + fotos) · `b42aa22` (F3 worklist + acesso CC F2) · `91e219b` (F4 evento
> dashboard) · `6fdcd5b` (F5 portão do pagamento) · `119985b` (F6 seção no Detalhes). Gates
> verdes (406 unit, 92 integração, lint, format, typecheck; **build pendente** — o next dev
> está ativo). Decisões de escopo do Flavio: **acesso "abrir agora, só Embarque"** (hub a
> todos os não-PROSPECTOR; operacionais veem só a aba Embarque; Aprovações oculta) +
> **fotos construídas agora**. Desvios do plano registrados no Histórico. O bloco de DESIGN
> abaixo permanece como a especificação canônica.
>
> **Status anterior: REFORMULADO — sub-aba de Embarque + "Modelo X" (DESIGN, 2026-07-10).**
> Novo tipo de evento para o card de Eventos do dashboard **e** a 4ª sub-aba do hub
> `/contratos`: o **embarque** = o café **carregado no caminhão**. Acontece **no mesmo
> dia do faturamento** por padrão, mas é um evento **distinto** (faturamento = emissão
> da NF, externo ao app; embarque = a carga física). O design original (**EMB1–EMB19**,
> 2026-07-09) foi **reconciliado** com duas coisas que vieram depois: a **sub-aba real**
> no hub e a decisão de **incluir o atraso**. A reformulação (**EMB20–EMB29**, 2026-07-10,
> mesma sessão da reforma da Aprovação) move a **casa** do embarque pra sub-aba (worklist
> `a embarcar` / `atrasado` / `embarcado`), rebaixa o dashboard a **companheiro**
> (navegação pura) e **colapsa a data de embarque na data de faturamento** ("Modelo X" —
> sem campo próprio). Desenhado **ponta a ponta**; resta a **implementação** (fases em
> plan mode). Só decisão/registro — **sem código**.

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
`Dashboard-Visao-Geral.md`). Primeiras decisões:

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

## Reformulação — a sub-aba de Embarque + o "Modelo X" (2026-07-10, DESIGN)

> **Gatilho.** O design EMB1–EMB19 (2026-07-09) fechou **antes** de duas coisas: (a) a
> **sub-aba de Embarque** no hub `/contratos` virou superfície real a desenhar, e (b) o
> Flavio decidiu **incluir o atraso** (adiado na Aprovação por falta de data, mas fácil no
> embarque porque a data existe). Esta reformulação — mesma sessão da reforma da Aprovação
> (`Aprovacoes-Plano-de-Trabalho.md`) — reconcilia o embarque com as duas: a **sub-aba
> vira a casa** (worklist), o **dashboard vira companheiro** e a data de embarque **colapsa
> na data de faturamento** (o "Modelo X"). Espelha a arquitetura da sub-aba de Aprovação
> (AP25–AP30). Só decisão/registro — **sem código**.

### Moldura

- **EMB20 — A casa do embarque é a sub-aba; o dashboard é companheiro; o atraso entra
  agora.** Como na Aprovação (AP29), a **sub-aba de Embarque** (`/contratos?tab=embarque`)
  é a **worklist** dos contratos com embarque — estados `a embarcar` / `atrasado` /
  `embarcado` e a **ação de confirmar** ali. O **dashboard** (card de Eventos) é só
  **aviso/atalho**. E o **atraso** — adiado na Aprovação por falta de data — **entra**,
  porque a data de embarque existe (é a de faturamento, EMB22).

### Fase 1 — Marcação (o sinal "terá embarque")

- **EMB21 — O sinal migra do contrato pra MODALIDADE (revisa EMB3; resolve EMB-P4).** Em
  vez de um Sim/Não por contrato, cada **`ContractModality`** ganha uma flag "embarca?". O
  contrato **herda** da modalidade na emissão e **congela** o valor (snapshot na coluna
  `requiresShipment`) — editar a flag de uma modalidade depois **não** altera contratos
  antigos, só os novos. **Some o Sim/Não** do modal de emissão. Defaults semeados:
  **Retirar = sim · Posto = sim · Disponível = não**. Resolve o **EMB-P4** (o gate deixa de
  ser hardcode `≠ Disponível` e vira dado da modalidade — robusto pra modalidades novas).

### Fase 2 — Planejamento (o "Modelo X": sem data própria)

- **EMB22 — Não há data de embarque própria; o "dia previsto" É a data de faturamento
  (revisa EMB4; derruba EMB5 e EMB-P3; dispensa a regra de acompanhamento).** A pedido do
  Flavio, **não existe campo de data de embarque** (nem na criação, nem depois). O dia
  previsto do embarque = **`invoiceDate`** (a data de faturamento planejada, já obrigatória
  na Etapa 2). Consequências: **EMB4** (campo auto-preenchido) **cai**; **EMB5 + EMB-P3**
  (editar a data em FATURADO por endpoint dedicado) **caem** — pra mover o dia previsto,
  move-se o **faturamento** (já editável em EMITIDO); e como não há dois campos, a regra de
  sincronia que se cogitou fica **dispensada**. O **atrasado = passou da `invoiceDate` e não
  embarcou** — atraso **de verdade** (era pra ter saído no dia). Justificativa: o embarque
  fora do dia do faturamento é **exceção/imprevisto**, não plano (decisão do Flavio) — então
  tratá-lo como atraso está certo, e a data real (divergente) é capturada na confirmação
  (`shippedAt`, EMB27). Sobram no contrato só **`requiresShipment`** (EMB21) e **`shippedAt`**
  (EMB27). _(Contrato marcado ainda sem `invoiceDate` não tem "dia previsto" — não aparece na
  fila/calendário até ter, como o lembrete de aprovação já faz. Sem furo.)_

### Fase 3 — Acompanhamento (a fila + o atraso)

- **EMB23 — Estados derivados + gatilho do atraso.** Sem enum novo (como na Aprovação):
  `a embarcar` (marcado · EMITIDO/FATURADO · sem `shippedAt` · hoje ≤ `invoiceDate`),
  **`atrasado`** (idem, `hoje > invoiceDate`), `embarcado` (`shippedAt` preenchido),
  `cancelado` (WASH_OUT); Disponível/`requiresShipment=false` **não entra**. O atraso **só
  acende a partir do dia seguinte** à `invoiceDate` (o próprio dia ainda é "a embarcar") e
  vale em **EMITIDO + FATURADO** (passou o dia e não saiu = atrasado, seja "não faturou" ou
  "faturou e não carregou").
- **EMB24 — Apresentação do atraso: fila na sub-aba + reflexo no calendário; cor vermelho
  `#dc2626`.** O atraso é um **estado que dura dias** — a **fila durável** (inclusive os que
  já saíram da janela de 2 semanas) vive **só na sub-aba** (com contador tipo "N atrasados").
  No **calendário** (companheiro), o embarque aparece **azul** no dia previsto e, se o dia
  passar sem confirmar, o dot **vira vermelho `#dc2626`** enquanto estiver na janela visível.
  Cor nova, quebra a família azul de propósito (é alarme; amarelo/laranja já são
  pagamento/aprovação, verde é pago).
- **EMB25 — A linha da fila + ordem + filtros.** Cada item mostra **chip de status · nº ·
  comprador · data (prevista = `invoiceDate` / embarcado = `shippedAt`) · sacas · armazém do
  vendedor** (EMB29). Só **dado não-sensível** (nada de preço/valor/corretagem — a aba é
  visível a todos os não-PROSPECTOR, mesma regra da Aprovação AP10). **Ordem cronológica
  crescente** (data mais antiga primeiro — joga os atrasados pro topo sem agrupar). Filtros:
  **Todos · A embarcar · Atrasado · Embarcado · Cancelado**; busca por **nº ou comprador**
  (molde AP28).
- **EMB26 — Papéis na página + o dashboard vira navegação pura (revisa EMB11/EMB12; mantém
  EMB16).** Na sub-aba: **[Confirmar embarque]** (itens `a embarcar`/`atrasado`) = **todos
  os não-PROSPECTOR** (mantém EMB16); **"Ver contrato"** (→ `/contratos?details=`) = só
  **ADM/COMMERCIAL** (escopo D110). O **dashboard** perde acordeão, modal, "ver contrato" e
  confirmar: o evento de embarque é **navegação pura** — mostra o dot + rótulo
  (`embarque · nº · comprador`) e, ao tocar, **leva pra sub-aba de Embarque**. Igual pra
  **todos** (todo não-PROSPECTOR vê o mesmo evento e o mesmo comportamento); as
  funcionalidades por papel vivem **só na página**.

### Fase 4 — Confirmação (o "embarque finalizado")

- **EMB27 — Fotos OPCIONAIS + data por SELETOR (revisa EMB13/EMB14/EMB15; mantém EMB19).** A
  confirmação **não exige fotos** — quem confirma pode não ter estado no armazém (só
  registra que embarcou); aceita **0 a 10** fotos (JPEG/PNG/WebP, 12 MiB) — **revisa o EMB13
  (fotos obrigatórias) e o EMB14 (mín. 1 → mín. 0)**; some a "regra nova de mínimo". A **data
  real `shippedAt`** passa a ser um **seletor** (default **hoje**, editável, **no máximo
  hoje**) — **revisa o EMB15 (hoje fixo)** —, porque no modelo de fila se confirma **depois
  do fato** (o motorista reporta), então a carga pode ter sido ontem; assim o "realizado"
  (EMB17) cai no **dia real**. O **modal de confirmação**: resumo (nº · comprador · armazém
  do vendedor · sacas · prevista) + seletor de data + upload opcional + **aviso de
  irreversibilidade**; **terminal, sem undo** (mantém EMB19 — o aviso é a trava, já que agora
  dá pra confirmar sem evidência). **Duas portas** pro mesmo modal: a fila (EMB26) e o portão
  do pagamento (EMB28).

### Fase 5 — Encerramento (o portão)

- **EMB28 — Portão híbrido no PAGO: não paga sem embarcar, mas resolve na hora.** Ao tentar
  marcar **PAGO** um contrato que **exige embarque e ainda não embarcou** (`requiresShipment`
  && sem `shippedAt`; já FATURADO, pré-requisito do PAGO), abre um **modal de aviso sem botão
  de pagar** — a única ação é **[Confirmar embarque]** (→ modal da EMB27). Confirmado o
  embarque, o fluxo **segue direto pro pagamento**. É a **dureza da 1** (não paga sem
  embarcar) com o **atalho da 2** (resolve na hora, apontando pra ação certa). Fecha o buraco
  **"pago sem registro de embarque"** (que a opção "nada" deixaria, pois o atraso some no
  PAGO — EMB9). _Tradeoff registrado: crava que **não há pagamento antes do embarque**; se um
  dia houver adiantamento legítimo, revisitar._
- **EMB29 — Local do embarque = armazém do vendedor (`sellerWarehouseSnapshot`), sempre.**
  Posto ou Retirar, o café é carregado no **armazém do vendedor** — então é ele o "local do
  embarque", exibido nas infos do embarque (linha da fila EMB25 + seção "Embarque" do
  Detalhes EMB18). Campo dedicado já existe no contrato (`sellerWarehouseSnapshot` +
  `sellerWarehouseClientId`), separado do do comprador.

### Mantidas × revisadas

- **Mantidas do design original:** EMB1 (embarque ≠ faturamento), EMB2 (gate por
  modalidade — agora via flag, EMB21), EMB7 (visibilidade = todos não-PROSPECTOR), EMB16
  (confirma = todos não-PROSPECTOR), EMB17 (realizado azul-escuro `#1e40af` no `shippedAt`),
  EMB18 (fotos + data no Detalhes), EMB19 (terminal, sem undo).
- **Revisadas/derrubadas:** EMB3 → EMB21 (sinal na modalidade); EMB4 → EMB22 (sem campo; dia
  previsto = `invoiceDate`); EMB5 + EMB-P3 → **caem** (EMB22); EMB8/EMB9 (janela/status) →
  seguem, ancoradas na `invoiceDate` (não numa `shipmentDate`), e o "só no dia" do EMB8 ganha
  o reflexo vermelho pós-prazo na janela (EMB24); EMB11/EMB12 → EMB26 (dashboard vira
  navegação pura); EMB13/EMB14 → EMB27 (fotos opcionais); EMB15 → EMB27 (seletor de data);
  EMB-P4 → **resolvida** (EMB21).

## Propostas (não travadas — a confirmar / detalhar na implementação)

> ⚠️ **Parcialmente superada pela Reformulação (2026-07-10).** Não há `shipmentDate` nem
> endpoint dedicado (Modelo X, EMB22): o schema do embarque = **`requiresShipment`** (flag
> na `ContractModality` + snapshot no contrato, EMB21) + **`shippedAt`** (EMB27). O sinal
> **não** vive mais no `SaleContractEtapa2Modal` (migrou pra modalidade). O restante abaixo
> — modelo novo de fotos, `LocalUploadService.saveContractPhoto`, leitura por rota-proxy, os
> 2 `typeKey` do calendário — **segue válido**, com a ressalva de que as fotos são **0–10**
> (opcionais), não 1–10.

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
  **F3+** do `Dashboard-Visao-Geral.md`.
- **EMB-P3 — ✅ RESOLVIDA / DERRUBADA (2026-07-10, EMB22).** O Modelo X removeu a data de
  embarque própria → **não há edição pós-faturamento** a fazer: o "dia previsto" é a
  `invoiceDate` (movida pelo próprio "Editar" em EMITIDO). Sem endpoint dedicado.
- **EMB-P4 — ✅ RESOLVIDA (2026-07-10, EMB21).** Vira **flag na `ContractModality`** (não
  hardcode `≠ Disponível`): cada modalidade carrega "embarca?", o contrato herda por
  snapshot. Robusto pra modalidades novas.
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
- **2026-07-10 (Reformulação — sub-aba + Modelo X; EMB20–EMB29).** Mesma sessão da reforma
  da Aprovação. O design EMB1–EMB19 foi reconciliado com a **sub-aba real** do hub
  `/contratos` e com a **inclusão do atraso**. **Moldura (EMB20):** sub-aba = casa (worklist
  `a embarcar`/`atrasado`/`embarcado`), dashboard = companheiro, atraso entra. **Fase 1
  (EMB21):** o sinal migra do contrato pra **flag na modalidade** (snapshot; Retirar/Posto =
  sim, Disponível = não) — revisa EMB3, resolve EMB-P4. **Fase 2 / Modelo X (EMB22):** **sem
  data de embarque própria** — o dia previsto **é** a `invoiceDate`; caem EMB4, EMB5 e
  EMB-P3; atrasado = passou o faturamento sem embarcar (exceção, não plano). **Fase 3
  (EMB23–EMB26):** estados derivados + atraso do dia seguinte em EMITIDO+FATURADO; fila
  durável na sub-aba + reflexo vermelho `#dc2626` no calendário; linha (chip · nº ·
  comprador · data · sacas · armazém do vendedor, não-sensível), ordem cronológica
  crescente, filtros; confirmar = todos não-PROSPECTOR, "ver contrato" = ADM/COMMERCIAL,
  **dashboard = navegação pura** (revisa EMB11/EMB12). **Fase 4 (EMB27):** **fotos
  opcionais** 0–10 (revisa EMB13/EMB14) + **seletor** de `shippedAt` (default hoje, máx hoje;
  revisa EMB15); modal terminal com aviso (mantém EMB19). **Fase 5 (EMB28/EMB29):** **portão
  híbrido** no PAGO (bloqueia pagar sem embarcar; modal só com [Confirmar embarque] → segue
  pro pagamento) + local = **armazém do vendedor** (`sellerWarehouseSnapshot`). **Desenhado
  ponta a ponta (EMB1–EMB29).** Só decisão/registro — **sem código**.
- **2026-07-10 (IMPLEMENTAÇÃO ponta a ponta — F1–F6).** A feature saiu do papel em 6 commits
  temáticos (main, não pushados). **F1 (`67ed909`):** flag `requires_shipment` na
  `ContractModality` (semeada Retirar/Posto=true, Disponível=false) → snapshot no emit em
  `SaleContract.requiresShipment` + `shippedAt @db.Date`; 2 índices; migration
  `20260710120000`. **F2 (`4554531`):** modelo `SaleContractShipmentPhoto` (migration
  `20260710130000`) + `saveContractShipmentPhoto` + `SaleContractShipmentService` (confirm/
  list/descriptor/context, auth-only) + 4 rotas (multipart + lista + proxy autenticado +
  contexto). **F3 (`b42aa22`):** `listShipmentContracts` (keyset particionado, molde do
  Financeiro) + `EmbarquePanel`/`EmbarqueCard` + `ShipmentConfirmationModal` + **acesso CC
  F2** (hub a todos os não-PROSPECTOR, abas por papel, nav "Contratos"/"Embarques"). **F4
  (`91e219b`):** `getDashboardShipmentEvents` + branch nav-pura no `EventsCalendarCard` + 3º
  feed no `DashboardDesktop`; dots azul/azul-escuro/vermelho. **F5 (`6fdcd5b`):** guard
  `CONTRACT_SHIPMENT_REQUIRED` no `paySaleContract` + fiação no `SaleContractLifecycleDialog`.
  **F6 (`119985b`):** seção "Embarque" read-only + galeria no `SaleContractDetailsModal`.
  - **Desvios do plano (confirmados/testados/registrados):** (a) `_requireLookup` ganhou um
    param `extraSelect` — **não** dá pra pôr `requiresShipment` no `select` compartilhado
    (quebraria os lookups de paymentForm/packaging, que não têm a coluna). (b) **`confirmShipment`
    NÃO bumpa `version`**: `shippedAt` é eixo próprio (EMB22) e a trava de corrida é o
    `shippedAt:null` no `where` — manter a version estável faz o **retry do portão** (EMB28)
    pagar com a MESMA `expectedVersion`, sem 409 espúrio. (c) evento **desktop-only** (o
    `DashboardMobile` não renderiza o card; no mobile chega-se ao Embarque pela nav → sub-aba).
    (d) a flag da modalidade é **seed-only** (não há UI de admin; muda por migration). (e)
    confirmação **sem `expectedVersion`** (idempotência pelo `shippedAt:null`). Gates verdes
    (406 unit / 92 integração); **build pendente** (`next dev` ativo). 📱 validar no device.
