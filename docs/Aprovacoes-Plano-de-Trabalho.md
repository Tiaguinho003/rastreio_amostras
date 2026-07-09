# Aprovações — Plano de Trabalho (reformulação)

> **Status: EM DECISÃO (iniciado 2026-07-08).** Reformulação da feature de
> Aprovação: sair de _"etiqueta impressa auditada, ad-hoc, sem estado"_ (Fase I,
> **D107–D126** em `Contratos-Plano-de-Trabalho.md`) para um **fluxo com papéis**:
> quem CRIA o contrato **sinaliza** se precisa de aprovação → vira **pendência**
> para quem APROVA → **executa** (gera a etiqueta) → alimenta o **card de Eventos**
> do dashboard (F2 de `Eventos-Dashboard-Plano-de-Trabalho.md`). **Bloco 1 (o
> sinal) travado (AP1–AP5)**; Blocos 2+ em aberto. Só decisão/registro — **sem
> código**. **Revisa a D118/D119** (que deixaram a aprovação sem estado, de
> propósito).
>
> **⏸️ PAUSA (2026-07-08):** o Bloco 2 (apresentação) foi aberto e **pausado** — o
> Flavio quis **repensar o funcionamento geral** antes de continuar (a conversa por
> micro-decisões ficou confusa antes do desenho ponta-a-ponta estar claro).
>
> **▶️ RETOMADA (2026-07-09):** o Flavio voltou **co-desenhando o fluxo ponta a
> ponta na ordem dele** (não na ordem dos blocos). Fechou: o **controle** do sinal
> (segmentado **Sim / Não**), o **lembrete** de aprovação (**AP6** — lead time em
> dias, default 30, vira evento no card), o **atalho "Gerar aprovação"** no evento
> do dashboard (**AP7**) e a **liberdade da porta /samples** (mantém todos os
> contratos — **AP8**). Em seguida **fechou o Bloco 2** (papéis): quem **decide** =
> criadores do contrato (**ADMIN + COMMERCIAL**, **AP9**); quem **gera / vê o
> evento** = **todos os papéis não-PROSPECTOR** (**AP10**), o que destrava a
> visibilidade de AP6/AP7. E **removeu a geração da página /contratos** (**AP11**) —
> a etiqueta passa a sair só do dashboard + /samples, deixando o card mais enxuto e
> alinhando a superfície ao público "de todos" da AP10. Depois **removeu o "Manual"**
> (**AP12** — não há aprovação sem contrato) e **fechou o desfecho + o modelo de
> estado** (**AP13** desfecho fora, rastreabilidade pelo **proxy do nº de envios**;
> **AP14** pendente só em `EMITIDO`, "feita" → "enviada"). E **fechou o visual**
> (**AP15**): dot **laranja `#f97316`**, rótulo **"a enviar"**, e a leitura "provável
> recusa" é **externa** (métricas/BI) — o app só registra os envios (AP-P1 dispensada).
> **✅ REFORMA COMPLETA (AP1–AP15, implementada em 3 fases 2026-07-09, cada uma em plan
> mode com análise):** **Fase 1** (o sinal no contrato) + **Fase 2** (lembrete no card +
> geração pelo dashboard) + **Fase 3** (removeu a porta /contratos — AP11 — e o "Manual",
> exigindo `saleContractId` — AP12). Gates verdes nas três; **validar no device** (ver
> Histórico). Portas finais de geração = **/samples + dashboard**, ambas ligadas a contrato.
> **Adição pós-reforma (AP16, 2026-07-09):** os **envios de aprovação** passam a aparecer
> no card **"Últimos envios"** do dashboard (nº do contrato + comprador, pill laranja,
> inerte) — ver seção AP16 + Histórico.

## Contexto e objetivo

Hoje "aprovação" é apenas a **impressão de uma etiqueta física auditada** — não é
decisão nem estado. O Flavio quer evoluí-la para um **processo com dono**: a
empresa decide **quais contratos precisam de aprovação**, quem cria o contrato
**sinaliza** isso, e a pendência é **apresentada a quem executa** a aprovação
(gera a etiqueta), com cada papel fazendo a sua parte. O objetivo final é que a
aprovação **vire um tipo de evento** no card de Eventos do dashboard (a "F2" dos
Eventos — hoje só citada, sem código).

A ordem combinada das decisões:

1. **Bloco 1 — o sinal + o lembrete:** como/quando se marca "precisa de aprovação"
   e o lead time do lembrete. ✅ travado (**AP1–AP6**)
2. **Bloco 2 — a apresentação (papéis):** quem decide × quem gera/vê.
   ✅ travado (**AP9–AP10**)
3. **Bloco 3 — execução e localização das ações + papéis:** onde a geração vive, o
   que acontece com as portas atuais, posse. ✅ travado (**AP8** /samples mantém
   todos · **AP10** todos geram · **AP11** remove a porta /contratos · **AP12** remove
   o "Manual" — sem aprovação sem contrato)
4. **Bloco 4 — evento no dashboard:** aprovação como evento no card de Eventos, com
   atalho de geração. 🟡 parcial (**AP6** lembrete + **AP7** atalho; falta a
   visibilidade = Bloco 2)

## Estado atual (Fase I — o que existe hoje)

Fonte canônica das decisões atuais: **`Contratos-Plano-de-Trabalho.md`**, seção
"Aprovação do contrato (etiqueta)" (D107, D112–D126). Em resumo:

- Uma "aprovação" = abrir o `ApprovalLabelModal`, editar 5 campos (Nº compra, Nº
  fechamento, Produtor, Armazém, Sacas) + lotes, e "Imprimir": grava numa mesma
  transação um `custom_print_job` (o **print agent local** imprime as 3 faixas na
  impressora, 1 cópia, sem QR) **e** uma linha em `approval_label_log` (ator +
  contrato-opcional + payload + ref do job). **N envios por contrato.**
- **Duas portas:** o leque "+" de **/samples** (seletor de contratos **ou
  "Manual"** avulsa, `saleContractId` nulo) e o botão **"Aprovação"** no card de
  **/contratos** (direto, pré-preenchido).
- **Quem pode:** todos os papéis **menos PROSPECTOR** (gate central por
  allowlist; sem posse por contrato). Quem **cria** contrato é subconjunto menor:
  **ADMIN + COMMERCIAL**.
- **O desfecho real** (comprador aprovou/recusou) vive **FORA do sistema** (D118).

**Lacuna que motiva a reforma:** não há como marcar **quais contratos precisam**
de aprovação, nem estado de "pendente/feita" — o `approval_label_log` é
write-only.

## Decisões travadas — Bloco 1: o sinal (2026-07-08)

- **AP1 — Modelo de estado: flag + estado DERIVADO (revisa D118).** Adiciona
  **só um booleano** `requiresApproval` no `SaleContract`. **Não há enum de
  status próprio** — o estado se deriva do que já existe:
  - **Pendente** = `requiresApproval = true` **e** sem nenhuma linha em
    `approval_label_log` do contrato;
  - **Feita** = `requiresApproval = true` **e** ≥1 etiqueta já enviada;
  - `requiresApproval = false` → aprovação não se aplica ao contrato.

  Reusa o log write-only atual (D112/D114). O **desfecho do comprador**
  (aprovou/recusou) **continua fora do sistema** (mantém a D118 nesse ponto — o
  que a reforma revisa é o "sem estado", não o "sem desfecho"). _(**Refinado pela
  AP14** (2026-07-09): "pendente" exige **`EMITIDO`** e **"feita" → "enviada"**; o
  desfecho fora vira o **proxy do nº de envios** — AP13.)_

- **AP2 — Onde o criador marca: no formulário de criação do contrato +
  editável no Editar.** A escolha nasce junto do contrato e pode ser corrigida
  depois pelo "Editar". Um único lugar serve os dois tipos (ver AP4).
- **AP3 — Default: obrigatório escolher.** Sem valor padrão — o formulário
  **não conclui** sem o criador decidir sim/não. _(Controle decidido 2026-07-09:
  **segmentado Sim / Não**, nada pré-selecionado — descarta um checkbox, que já
  nasceria "não"; molde do `inf-pill`, press-effect só de escala.)_
- **AP4 — À vista: idem AP2.** O contrato à vista **também é criado em
  /contratos** (o usuário escolhe um lote e segue o preenchimento do contrato),
  não numa tela de venda separada. Logo a marcação obrigatória vive **na criação
  do contrato**, cobrindo à vista (via lote) e Futuro pelo mesmo caminho.
  _(A confirmar no código, na implementação: o ponto exato de criação do à
  vista.)_
- **AP5 — Contratos já existentes: todos = "não precisa".** A migration atribui
  `requiresApproval = false` a todos os contratos anteriores ao flag (predatam a
  feature); se algum precisar, marca-se pelo Editar. Sem backlog de marcação.
- **AP6 — Lembrete de aprovação (lead time) na criação (2026-07-09).** Junto do
  sinal (AP1), **quando "Sim"**, aparece um campo **"Lembrar X dias antes do
  faturamento"** (some quando "Não"). Guardado como **número de dias** (não uma
  data — se o `invoiceDate` mudar, o lembrete se **reposiciona sozinho**), com
  **default 30** (a 1ª ideia dos "30 dias fixos" vira o **padrão editável**, não a
  regra), ajustável na criação e no **Editar** (AP2). **Âncora = `invoiceDate`
  planejado** (campo já obrigatório na etapa 2 → o gatilho sempre existe).
  - **Vira evento no card de Eventos** (é um **tipo novo**, distinto dos pagamentos
    da F1 — ver Eventos-Dashboard-Plano-de-Trabalho.md, F2/EVD-P1): aparece de
    **`invoiceDate − X` em diante, TODOS os dias** enquanto o contrato seguir
    `EMITIDO` **e** `requiresApproval` **e** **sem aprovação gerada**. **Dot = laranja
    `#f97316`** (2026-07-09; distinto do amarelo `#eab308` do pagamento agendado, E5;
    `typeKey` `contract_approval_due` proposto).
  - **Terminal (DECIDIDO 2026-07-09):** **se faturar sem ter gerado, o aviso SOME**
    (opção "a" — chegou no faturamento, não adianta mais lembrar). Também encerra ao
    **gerar** a aprovação (estado "feita", AP1) ou em `WASH_OUT`. Em resumo: o
    lembrete vive **só enquanto `EMITIDO` + marcado + não gerado**. **Sem estado
    "atrasado".**
  - **Visibilidade por papel = todos os não-PROSPECTOR (AP10)** — o lembrete é um
    task operacional, visível a todos (contrasta com os pagamentos, escopados — E22).

## Decisões travadas — Geração + atalho no dashboard (Blocos 3/4, 2026-07-09)

Onde a aprovação é **gerada** e como o card de Eventos vira um **atalho** pra isso.
Só registro — a **visibilidade/permissão** (quem vê o evento, quem pode gerar) ainda
depende do Bloco 2 (pausado).

- **AP7 — Atalho "Gerar aprovação" no evento do dashboard (Bloco 4; molde E26 dos
  pagamentos).** O evento de aprovação no card de Eventos ganha, no **expandido
  (acordeão)** — mesmo padrão do "Pago" dos pagamentos (E25/E26 do doc de Eventos) —
  um botão **"Gerar aprovação"** que abre o fluxo da etiqueta **sem sair pro
  /samples (Lotes)**. Reusa o **`ApprovalLabelModal` com o prefill vindo do
  contrato** (5 campos + lotes quebrados, D115/D116). É um **novo ponto de entrada**,
  somando às portas atuais (botão no card do /contratos + leque "+" do /samples).
  **Quem vê o evento e pode clicar = todos os não-PROSPECTOR (AP10).**
- **AP8 — A porta /samples (Lotes) mantém TODOS os contratos — NÃO filtra por
  `requiresApproval`.** O seletor de contratos do leque "+" do /samples continua
  listando **todos os contratos elegíveis** (`EMITIDO`/`FATURADO`/`PAGO`; `WASH_OUT`
  fora) — **confirma o comportamento da Fase I (D113/Q4)**, não restringe aos marcados.
  _(O botão "Manual" que existia nesse seletor foi **removido** pela AP12 — não há mais
  etiqueta sem contrato.)_ **Motivo:** o criador pode **não** ter sinalizado que
  precisaria de aprovação e, **de última hora**, ela se tornar necessária — o gerador
  precisa de **liberdade pra gerar de qualquer contrato**.
  - **Consequência (registro):** o `requiresApproval` é um **sinal PROATIVO** — ele
    dirige o **lembrete/evento no dashboard**, **não é um gate de geração**. Gerar a
    etiqueta **independe do flag**: o **dashboard** é a superfície dos contratos
    marcados (lembrete + atalho AP7); o **/samples** é a **saída pra qualquer
    contrato**. Gerar por um contrato `requiresApproval = false` apenas grava a linha
    de auditoria (`approval_label_log`) — sem semântica de "pendência resolvida".
- **AP11 — Remover a geração de etiqueta da página /contratos (revisa D107/D109/D117).**
  O botão **"Aprovação"** do card do contrato (`SaleContractCard`, hoje em
  `EMITIDO`/`FATURADO`/`PAGO`) **sai**. A geração passa a viver **só nas superfícies
  operacionais**: **dashboard** (atalho AP7, contratos no lembrete) + **/samples
  (Lotes)** (seletor de todos + "Manual", AP8). Assim os **dois fluxos** do D117
  (/contratos + /samples) viram **/samples + dashboard**.
  - **Racional:** (1) **menos botões** no card (coerente com o "card enxuto" da D121);
    (2) **alinha a superfície ao público da tarefa** — a AP10 tornou a geração uma
    **tarefa operacional de todos os não-PROSPECTOR**, e /contratos é página **só
    ADMIN+COMMERCIAL**; tirar de lá move a ação pras superfícies que todos alcançam.
  - **Custo (aceito):** ADMIN/COMMERCIAL que quiser gerar **fora do lembrete** (contrato
    não-marcado, ou marcado antes da janela AP6) passa pelo /samples — coberto (lista
    todos, AP8).
  - **Escopo:** remoção **só no front** (o botão + a fiação `onAprovacao`); os endpoints
    (`sendApprovalLabel`/prefill) **ficam** (Lotes + dashboard usam). A **timeline
    "Aprovação enviada"** do modal de Detalhes (auditoria D108/D119) **não é afetada**
    — é exibição, não geração.
  - **Alternativa registrada (NÃO escolhida):** mover o "Aprovação" pro **modal de
    Detalhes** (onde Editar/Ágio/Washout já vivem, D121) — tiraria o botão do card sem
    perder o acesso em /contratos. Descartada em favor da remoção total (mais coerente
    com AP10); **reabrir se a fricção incomodar**.
- **AP12 — Remover o "Manual": não existe aprovação sem contrato (revisa D113/D114).**
  O botão **"Manual"** do seletor (`ApprovalContractPickerModal`, canto superior
  direito) **sai**. Toda etiqueta passa a **exigir um contrato** — gera-se escolhendo
  um contrato no seletor (que já lista **todos**, AP8) ou pelo atalho do dashboard
  (AP7). **Acaba a etiqueta avulsa** (`sale_contract_id = NULL`).
  - **Motivo:** no fluxo do negócio a aprovação **nunca precede o contrato** (que nasce
    `EMITIDO` num passo só — D97); o "Manual" só produzia **registros órfãos e
    invisíveis** (D114 — avulsas não aparecem em tela nenhuma), furando o modelo
    "aprovação = ligada a contrato". Sem ele, **toda** etiqueta fica rastreável e
    alimenta a timeline do Detalhes.
  - **Escopo:** **front** (tira o botão "Manual" + o caminho do modal em
    branco/`onManual`); **backend** passa a **exigir `saleContractId`** no
    `sendApprovalLabel` (rejeita null → 422) pra fechar o caminho de fato. A coluna
    `sale_contract_id` **segue nullable** no schema — os avulsos **históricos** da Fase
    I permanecem —, mas o app **não gera mais nulos**.

## Decisões travadas — Papéis: quem decide × quem gera (Bloco 2 RESOLVIDO, 2026-07-09)

Fecha o Bloco 2 (a peça que estava pausada). Separa **quem sinaliza** de **quem
executa** — e abre a execução.

- **AP9 — Quem DECIDE se terá aprovação (marca o sinal AP1 + o lembrete AP6) = os
  criadores do contrato: ADMIN + COMMERCIAL.** É **inerente**, não há gate novo a
  construir: o campo vive no formulário de **criação/edição** do contrato, que só
  esses papéis acessam (`SALE_CONTRACT_ACCESS_ROLES = [ADMIN, COMMERCIAL]`; COMMERCIAL
  só nos dele — D110). **Quem cria, decide.**
- **AP10 — Quem GERA a aprovação e quem VÊ o evento = TODOS os papéis
  não-PROSPECTOR, sem escopo por posse.** A geração está exposta no **card de Eventos**
  (AP7) e no **seletor do /samples** (AP8), **ambos abertos a todos** — mantém o gate
  da Fase I ("qualquer autenticado não-PROSPECTOR"; o app restrito do PROSPECTOR não
  alcança o card [E8] nem a lista de Lotes, então "todos" = não-PROSPECTOR).
  - **Resolve a trava do Bloco 2:** o CLASSIFIER (e REGISTRATION/CADASTRO) **não
    acessa /contratos**, mas **acessa o dashboard e o /samples** — que é onde a
    geração agora vive. Por isso não precisou restringir os aprovadores.
  - **Contrasta com os pagamentos (E22, escopados por papel):** o lembrete de
    aprovação é uma **tarefa operacional** — **todos veem todos** os lembretes e
    **qualquer um** (não-PROSPECTOR) pode gerar. Não é dado financeiro.
  - _(Se a intenção fosse **incluir** o PROSPECTOR, reabrir — mas o app dele é
    restrito por design.)_

## Decisões travadas — Desfecho e modelo de estado (AP13–AP14, 2026-07-09)

Fecha os dois "Abertos" que sobravam (desfecho aprovado/recusado + "pendente" no
washout) — e eles eram, no fundo, a **mesma** discussão.

- **AP13 — O desfecho (aprovado/recusado) fica FORA do sistema; rastreabilidade por
  PROXY do nº de envios (confirma D118/AP1).** Descartado registrar manualmente
  "aprovado/recusado". **Motivo:** o desfecho real **sempre desemboca num status de
  negócio** (o contrato segue pra ágio/deságio/washout/faturado de qualquer jeito), e
  um campo manual "sim/não" seria **rastreabilidade não-confiável** — ninguém garante
  o preenchimento, então o dado **mentiria**. O sistema registra **só se a aprovação
  foi gerada/enviada ou não** — o que o `approval_label_log` já faz (N envios por
  contrato, cada um auditado).
  - **Proxy de recusa provável:** **enviar a aprovação mais de uma vez antes de
    faturar ≈ provavelmente recusada** (reenvio = correção após recusa). É
    **probabilístico, NÃO certeza** — vários envios não garantem recusa (pode ser
    correção de dado, reimpressão, etc.). A empresa lê o **nº de envios** como uma
    noção **mais verídica** do que um campo manual daria.
  - **Pendência nova (AP-P1):** ONDE/COMO apresentar esse sinal (nº de envios /
    "enviada N×" / leitura "provável recusa"). A timeline do Detalhes **já lista cada
    envio** (dado bruto visível); falta decidir se **destaca** a leitura e em que
    superfície.
- **AP14 — Fecha o modelo de estado derivado (a #2) + renomeia "feita" → "enviada".**
  Com o desfecho fora (AP13), o estado da aprovação tem **3 valores**, e a definição
  passa a ser **ciente do status** (tapa o buraco do washout que a AP1 deixou):
  - **Não se aplica** = `requiresApproval = false`.
  - **Pendente ("a enviar")** = `requiresApproval` + **`EMITIDO`** + sem etiqueta → é o
    que dirige o lembrete (AP6). O guard `EMITIDO` **tira washout, faturado E pago** do
    "pendente" (resolve a #2 — coerente com o AP6, que já vive só em EMITIDO).
  - **Enviada** (era **"feita"** na AP1 — **renomeada**, porque "enviada" é o que de
    fato sabemos; e casa com a copy **"Aprovação enviada"** que a timeline do Detalhes
    já usa) = `requiresApproval` + ≥1 etiqueta. Terminal **dentro do sistema**; o
    desfecho real fica fora (AP13). O **nº de envios** aqui é o proxy do AP13.
- **AP15 — Fecha os últimos itens (rótulo + AP-P1).**
  - **Rótulo do item = "a enviar".** No painel do dia, o evento de aprovação usa o
    descritor **"a enviar"** (dot laranja). Os dados do contrato (nº, comprador,
    vendedor) vêm no **expandido** (AP7/E25). _(Se vários lembretes caírem no mesmo dia,
    a distinção fica no expandido — se quiser o nº no recolhido depois, é tweak.)_
  - **AP-P1 DISPENSADA.** **Não** haverá destaque in-app de "provável recusa" — essa
    **rotulação é feita FORA do app** (apresentação de métricas/BI). A
    responsabilidade do app é **só registrar todos os envios de aprovação**, o que o
    `approval_label_log` **já faz** (1 linha por envio, N por contrato — D112/D114; o
    AP12 garante que todo envio é ligado a contrato). O **nº de envios** fica como dado
    bruto pra quem monta as métricas externas. **Nada novo a construir no app.**

## AP16 — Envios de aprovação no card "Últimos envios" (pós-reforma, 2026-07-09)

Decisão **nova**, fora do escopo AP1–AP15 (a reforma tratou o lembrete/geração; a AP-P1
do "nº de envios" foi dispensada como BI externo — a superfície in-app do **envio feito**
não existia). O Flavio pediu que o card **"Últimos envios"** do dashboard (hoje envios de
lote — física + laudo, DSH-D5) **também comporte os envios de aprovação**.

- **Cada linha do `approval_label_log` ligada a contrato = 1 item** no feed (avulsas
  históricas com `sale_contract_id` nulo ficam de fora). Um 3º `kind` = `APPROVAL`.
- **Exibição:** texto principal = **nº do contrato**; linha de baixo = **comprador**
  (espelha o slot do destinatário dos envios de lote). **Sem "quem enviou".** Pill
  **"Aprovação"** laranja (`#f97316`, identidade da aprovação). **Inerte** (sem clique,
  como os demais minicards — DSH-D5).
- **Arquitetura:** fonte SEPARADA no contract-domain (`getRecentApprovalSends`, join manual
  nº+comprador; a query de amostra do samples service NÃO muda) — o handler
  `getDashboardRecentSends` **mescla** as duas (top-40 de cada → ordena por data → 40).
  Índice novo `[created_at]` no `approval_label_log`. Visibilidade = todos os
  não-PROSPECTOR (mesma do recent-sends). Ver DSH-D5 (adendo) + endpoint #8 do
  `docs/API-e-Contratos.md`.

## Pendências / próximos blocos

- **Bloco 2 — Papéis: ✅ RESOLVIDO (AP9–AP10).** Quem decide = ADMIN+COMMERCIAL
  (criadores); quem gera/vê = todos os não-PROSPECTOR. _(A resposta preliminar antiga
  — aprovadores ADMIN+COMMERCIAL+CLASSIFIER, com lista de "pendentes" — foi
  **superada**: não há papel restrito de aprovador; a geração é aberta a todos, no
  dashboard e no /samples.)_
- **Bloco 3 — Execução e localização das ações: ✅ RESOLVIDO.**
  - ✅ **AP8** — a porta /samples mantém **todos os contratos** (+ "Manual"); o flag
    não é gate de geração. ✅ **AP10** — geração aberta a todos os não-PROSPECTOR
    (sem posse). ✅ **AP11** — geração **sai do /contratos**; portas finais = \*\*/samples
    - dashboard**. ✅ **AP12** — **"Manual" removido\*\*: não há aprovação sem contrato
      (acaba a avulsa `sale_contract_id = NULL`).
- **Bloco 4 — Evento no dashboard (🟡 quase fechado):**
  - ✅ **AP6** (lembrete = evento; janela + terminal "some ao faturar") + **AP7**
    (atalho "Gerar aprovação" no expandido) + **AP10** (todos veem).
  - ✅ **Cor do dot = laranja `#f97316`** (2026-07-09; EVD-P1, distinta do amarelo do
    pagamento — E5). `typeKey` `contract_approval_due` proposto. ✅ **Rótulo = "a
    enviar"** (AP15). _(Nota: diferente dos pagamentos (agendado/realizado), o lembrete
    é **um só sub-tipo** — "a enviar" — e some ao gerar/faturar.)_
- **Abertos: ✅ RESOLVIDOS (AP13–AP14).** O **desfecho** (aprovado/recusado) fica
  **fora** (AP13, confirma D118) — rastreabilidade pelo **proxy do nº de envios**; e o
  **"pendente" no washout** fecha via **AP14** (pendente só em `EMITIDO`).
- **AP-P1 — ✅ DISPENSADA (AP15).** Não há superfície in-app pra "provável recusa": a
  rotulação é **externa** (métricas/BI). O app só registra todos os envios
  (`approval_label_log`, já existe). Sem trabalho novo.

## Histórico

- **2026-07-08** — Doc criado. Mapa completo do código (estado atual da
  aprovação) + **Bloco 1 (o sinal) travado (AP1–AP5)** com o Flavio (análise +
  perguntas estruturadas). Revisa D118/D119 (a aprovação deixa de ser
  sem-estado). Sem código ainda.
- **2026-07-08 (pausa)** — Bloco 2 (apresentação) aberto: resposta preliminar de
  que os aprovadores seriam **ADMIN+COMMERCIAL+CLASSIFIER** + a constatação da
  trava (CLASSIFIER não acessa /contratos). O Flavio achou que estava ficando
  confuso e **pausou pra repensar o funcionamento geral** antes de travar
  superfície/escopo. Bloco 1 intacto; nada disso do Bloco 2 é decisão fechada.
- **2026-07-09 (retomada — co-desenho ponta a ponta)** — Flavio voltou e desenhou o
  fluxo na ordem dele. Aterrissamos o sinal (AP1) **no código real** (schema
  `SaleContract`, `createFuture`/`createSpot`/`emit` via `normalizeEtapa2Input` +
  `_resolveEmitData`, modal `SaleContractEtapa2Modal`) — **sem implementar**, só
  mapa. Decisões novas: **controle do sinal = segmentado Sim/Não** (nota na AP3);
  **AP6** (lembrete lead-time em dias, default 30, âncora `invoiceDate`, vira evento
  no card todos os dias até gerar; **terminal: some ao faturar**); **AP7** (atalho
  "Gerar aprovação" no evento do dashboard, molde E26); **AP8** (porta /samples
  mantém **todos** os contratos — flag não é gate de geração). Só registro — sem
  código.
- **2026-07-09 (Bloco 2 fechado)** — papéis definidos: **AP9** quem decide = criadores
  do contrato (ADMIN+COMMERCIAL; `SALE_CONTRACT_ACCESS_ROLES`, inerente ao form);
  **AP10** quem gera/vê = **todos os não-PROSPECTOR**, sem posse (geração no dashboard
  [AP7] + /samples [AP8], superfícies abertas a todos → resolve a trava do CLASSIFIER
  sem /contratos). Supera a resposta preliminar (aprovador restrito + lista de
  pendentes). Bloco 2 sai de pausado. Só registro — sem código.
- **2026-07-09 (enxugar portas)** — constatado que o /contratos **já gera** etiqueta
  hoje (botão "Aprovação" no card, Fase I, `SaleContractCard`). Flavio decidiu
  **removê-lo** (**AP11**, revisa D107/D109/D117): com a geração no dashboard (AP7) +
  /samples (AP8), a porta /contratos virou redundante; tirá-la enxuga o card e alinha
  a superfície ao público "de todos" da AP10 (/contratos é só ADMIN+COMMERCIAL).
  Alternativa "mover pro Detalhes" registrada e descartada. Remoção **só front**;
  endpoints e timeline de auditoria intactos. Só registro — sem código.
- **2026-07-09 (fim da avulsa)** — explicado o que é o "Manual" (etiqueta em branco,
  sem contrato, auditada com `sale_contract_id NULL` e invisível em tela — D114).
  Flavio decidiu **removê-lo** (**AP12**, revisa D113/D114): no negócio a aprovação
  **nunca precede o contrato** (nasce EMITIDO, D97), então a avulsa só gerava órfãos
  invisíveis. Passa a **exigir contrato** (front tira o botão + `onManual`; backend
  exige `saleContractId` → 422). Coluna segue nullable pros históricos. **Bloco 3
  totalmente fechado.** Só registro — sem código.
- **2026-07-09 (desfecho + estado)** — Flavio ligou a #2 (pendente no washout) à #3
  (desfecho) e resolveu as duas juntas. Como o contrato **sempre** termina num status
  de negócio, um registro manual "aprovado/recusado" seria rastreabilidade não
  confiável → **desfecho fica FORA** (**AP13**, confirma D118); registra-se só
  gerada/enviada, e o **nº de envios** vira **proxy de recusa provável** (>1 envio
  antes de faturar ≈ provavelmente recusada — probabilístico, não certo). Isso fecha o
  modelo de estado (**AP14**): pendente só em `EMITIDO`, e **"feita" → "enviada"** (mais
  verídico; casa com a copy da timeline). Nova pendência AP-P1 (superfície do proxy).
  Só registro — sem código.
- **2026-07-09 (fecha o visual — AP15)** — dot do lembrete = **laranja `#f97316`**
  (evita colisão com o amarelo `#eab308` do pagamento agendado — E5). Rótulo do item =
  **"a enviar"** (detalhes do contrato no expandido, AP7). **AP-P1 dispensada:** a
  leitura "provável recusa" é **externa** (métricas/BI) — o app só registra **todos os
  envios** (`approval_label_log` já faz; AP12 garante contrato). **Reforma desenhada
  ponta a ponta (AP1–AP15); nada implementado — próximo passo é o plano de
  implementação.** Só registro — sem código.
- **2026-07-09 (FASE 1 IMPLEMENTADA — "o sinal")** — 1ª das 3 fases da reforma, em plan
  mode com análise (3 Explore + design). Entregou os campos do contrato ponta a ponta:
  **schema** `requiresApproval` (`Boolean @default(false)`) + `approvalReminderLeadDays`
  (`Int?`) + migration manual `20260709120000_sale_contract_requires_approval` (aditiva,
  `DEFAULT false` backfilla os existentes — AP5). **Backend:** helpers
  `normalizeRequiredBoolean` + `normalizeApprovalReminderLeadDays` (1–365, default 30,
  `null` quando "Não") em `sale-contract-support.js`; capturado/gravado/lido nos pontos
  de pick — `normalizeEtapa2Input` (valida) + `_resolveEmitData.data` (grava, cobre os 3
  caminhos) + `toSaleContractView` (lê) **+ `SALE_CONTRACT_VIEW_SELECT`** (a allow-list de
  colunas do Prisma — **4º ponto que a análise estática não pegou; o teste de integração
  pegou** — sem ele o campo volta `undefined`). **Front:** seção **"Aprovação"** no
  `SaleContractEtapa2Modal` (segmentado Sim/Não `ctr-approval-btn`, molde `inf-pill`; campo
  de dias só quando "Sim"), validação obrigatória, hidratação no Editar, campo nos 2
  payloads. **AP4 CONFIRMADO** no código: o à vista nasce em `createSpotSaleContract`
  (mesmo `normalizeEtapa2Input`). **Gates:** typecheck/lint/format/build verdes; unit
  (novos testes do normalizer) + integração (round-trip Sim/Não/Editar) verdes. Plano
  `~/.claude/plans/scalable-riding-wirth.md`. **NÃO commitado/pushado — validar no
  device.** Próximo: **Fase 2** (lembrete no card + geração pelo dashboard).
- **2026-07-09 (FASE 2 IMPLEMENTADA — lembrete no card + geração pelo dashboard)** — 2ª das
  3 fases, plan mode com análise (3 Explore + síntese). Realiza AP6/AP7/AP10/AP14/AP15.
  **Backend:** endpoint SEPARADO do de pagamentos (visibilidade diferente) —
  `SaleContractService.getDashboardApprovalEvents({from,to}, actor)` (só `assertAuthenticatedActor`,
  **sem gate de papel** — AP10; pendente = `requiresApproval` + `EMITIDO` + anti-join `groupBy`
  "sem etiqueta" no `approval_label_log`, cuidado com o NULL das avulsas); helpers puros
  `buildApprovalReminderEvent` (id **namespaced** `reminder:` — evita colisão de key com o
  pagamento do mesmo contrato/dia) + `bucketApprovalReminders` (**fan-out 1→N**: o dot aparece
  em cada dia de `[max(hoje, invoiceDate−lead), to]` — **só de hoje pra frente**, decisão
  2026-07-09); rota `GET /api/v1/dashboard/approval-events`; migration `20260709130000` (índice
  `[requiresApproval, status, invoiceDate]`). **Front:** dot laranja `#f97316`
  (`contract_approval_due`) no CSS; `EventsCalendarCard` ganhou `onGerarAprovacao` + botão
  **"Gerar aprovação"** no acordeão; `DashboardDesktop` busca o feed (mesma janela, **sem
  `canPay`**), **merge client-side** com pagamentos, abre o `ApprovalLabelModal` pré-preenchido
  (molde do `openApproval` do /contratos) e re-busca ao fechar (o lembrete some quando gera).
  Rótulo "a enviar · nº · comprador". **Gates:** typecheck/lint/format/build + unit
  (`buildApprovalReminderEvent`/`bucketApprovalReminders`) + integração (pendente/anti-join/
  visibilidade por papel) verdes. **NÃO commitado/pushado — validar no device.** Próximo:
  **Fase 3** (remover porta /contratos — AP11 — + "Manual"/exigir `saleContractId` — AP12).
- **2026-07-09 (FASE 3 IMPLEMENTADA — enxugar as portas; REFORMA COMPLETA)** — 3ª e última
  fase, plan mode com análise (2 Explore). Subtrativa. **AP11:** removida a geração de
  etiqueta do /contratos — o botão "Aprovação" do `SaleContractCard` sai + todo o fluxo
  órfão em `app/contratos/page.tsx` (imports `ApprovalLabelModal`/`getApprovalLabelPrefill`/
  `ApiError`/`ApprovalLabelPrefill`, estados `approvalForm`/`approvalLoadingId`, o handler
  `openApproval`, a prop e o JSX do modal). **A timeline "Aprovação enviada" do Detalhes
  FICA** (exibição de auditoria, não geração). **AP12:** removido o "Manual" — botão +
  `onManual` no `ApprovalContractPickerModal` + o CSS `.apick-manual-btn` + o handler
  `onManual` do `app/samples/page.tsx` (a **única fonte de `saleContractId: null`**); o
  backend (`sendApprovalLabel`) passa a **exigir contrato** — 422 `APPROVAL_CONTRACT_REQUIRED`
  (guard DEPOIS do de linhas-vazias, pra preservar `APPROVAL_LABEL_EMPTY`; o bloco de
  validação UUID/existe/elegível vira incondicional). Coluna `sale_contract_id` **fica
  nullable** (avulsas históricas). Testes: a avulsa (201/null) virou **422**; adicionado um
  teste de papel não-COMMERCIAL enviando COM contrato (preserva a cobertura do gate). **Gates:**
  typecheck/lint/format/build + unit + integração verdes. **NÃO commitado/pushado — validar
  no device.** **Reforma AP1–AP15 completa;** portas finais = **/samples + dashboard**.
- **2026-07-09 (AP16 — envios de aprovação no "Últimos envios"; pós-reforma)** — feature
  nova (não parte da reforma), plan mode com análise (3 Explore). O card "Últimos envios"
  do dashboard (envios de lote — física+laudo) passa a comportar os **envios de aprovação**.
  **Backend:** `SaleContractService.getRecentApprovalSends()` (query `approval_label_log`
  ligado a contrato, ordena `createdAt desc`, join manual nº+comprador) + helper puro
  `buildRecentApprovalSendItem` (id namespaced `approval:`, `kind:'APPROVAL'`, campos de
  amostra nulos); o handler `getDashboardRecentSends` **mescla** as duas fontes (top-40 de
  cada → ordena por `at` → 40; a query de amostra do samples service não muda); migration
  `20260709140000` (índice `[created_at]`). **Front:** `DashboardRecentSendItem` ganhou o
  `kind` APPROVAL + `contractNumber`/`buyer` (`sampleId` nullable); `RecentSendsCard` mostra
  nº+comprador com pill laranja `is-approval`, inerte. **Decisões:** nº do contrato + comprador
  (sem "quem enviou"), inerte (sem deep link). Gates verdes + unit + integração. **NÃO
  commitado/pushado — validar no device.** Ver seção AP16 + DSH-D5 (adendo) + `API-e-Contratos.md`.
