# Aprovações — Plano de Trabalho (reformulação)

> **Status: EM DECISÃO (iniciado 2026-07-08).** Reformulação da feature de
> Aprovação: sair de _"etiqueta impressa auditada, ad-hoc, sem estado"_ (Fase I,
> **D107–D126** em `Contratos-Plano-de-Trabalho.md`) para um **fluxo com papéis**:
> quem CRIA o contrato **sinaliza** se precisa de aprovação → vira **pendência**
> para quem APROVA → **executa** (gera a etiqueta) → alimenta o **card de Eventos**
> do dashboard (F2 de `Dashboard-Visao-Geral.md`). **Bloco 1 (o
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
>
> **🔴 REFORMULAÇÃO DESENHADA — 5 FASES (design, 2026-07-09) — "o portão":** desenhar a
> **sub-aba de Aprovação** (F2 da Central de Contratos) expôs que o sinal mole (AP8) gera
> inconsistências. Decisão do Flavio: **apertar** — geração exige o sinal (**AP17**,
> reverte AP8) e **faturar exige a aprovação enviada** (**AP18**, portão novo no ciclo,
> cruza pro Contratos). Fluxo redesenhado ponta a ponta em **5 fases (AP17–AP24 +
> AP-P2)** + a sub-aba (AP25–AP30). **✅ IMPLEMENTADO PONTA A PONTA 2026-07-10 (F1–F5;
> commits `4402f9b`→`7e30675`, NÃO pushados; gates verdes + unit + 469 integ):** portão
> do gerar (AP17/AP21) + do faturar (AP18) + a sub-aba worklist (AP25–30; acesso
> operacional AP30) + a geração concentrada (AP29) + o toggle no Detalhes (AP23).
> **Desvio consciente da AP29 (decisão do Flavio, 2026-07-10):** o portão do faturar
> mantém uma **geração INLINE reativa** (intercepta o 422 → modal da etiqueta →
> refatura, estilo Embarque EMB28) — a AP29 vale pra geração **PROATIVA** (só a
> sub-aba); o gate é recuperação, não porta browseável. 📱 validar no device. Ver
> seção "Reformulação — o portão" + Histórico.

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
    da F1 — ver Dashboard-Visao-Geral.md, F2/EVD-P1): aparece de
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

## Reformulação — "o portão" (2026-07-09, DESIGN — não implementado)

> **Gatilho:** ao iniciar o desenho da **sub-aba de Aprovação** (F2 da Central de
> Contratos), a análise do fluxo em **5 fases** (marcação → lembrete → geração →
> registro → encerramento) expôs que o **sinal proativo** (AP8) produz
> inconsistências que a página exporia: marcado **"Não"** com etiqueta enviada e
> marcado **"Sim"** nunca enviado → "marcados" ≠ "aprovação real" (gargalos
> 1.1/1.2); e o **buraco G1** — marcado **faturado sem envio**, sem estado. Decisão
> do Flavio: **deixar as ações menos livres e forçar o caminho certo**,
> transformando a aprovação num **portão duro do ciclo do contrato**. **⚠️ DESIGN —
> ainda NÃO implementado; diverge do código atual, que segue na AP8.** Revê **AP8** e
> o terminal da **AP6**.

Contexto de negócio (respostas do Flavio, 2026-07-09):

1. "Precisa de aprovação" é decisão **caso a caso** (não é propriedade fixa do
   comprador ou do tipo de café).
2. A aprovação é **sempre antes do faturamento** — não existe faturar antes de aprovar.
3. Medo real = usuários **esquecerem** de registrar o envio. A etiqueta obrigatória
   força o registro; mas gente esquece.
4. Gerar em contrato não-marcado acontece (aprovação de última hora) — foi o motivo da
   AP8; o Flavio aceita apertar isso em nome da correção.

**AP17 — Gerar aprovação exige o sinal (contrato marcado "Sim"). [reverte AP8]**
Só se gera etiqueta de contrato com `requiresApproval = true`. Precisou de última hora
num contrato "Não"? **Edita-se o contrato para "Sim" primeiro**, aí gera. Fecha a
divergência 1.1/1.2 — deixa de existir "Não" com envio. Consequência: as portas de
geração (seletor do /samples, atalho do dashboard) passam a **listar só marcados**.

**AP18 — Faturar exige a aprovação enviada. [portão novo no ciclo; revê terminal da AP6]**
Um contrato marcado "Sim" **não passa de `EMITIDO` para `FATURADO`** sem **≥1 etiqueta
gerada** (`approval_label_log`). Como aprovar é sempre pré-faturamento (contexto 2), o
portão fica na transição `EMITIDO → FATURADO`. Fecha o **buraco G1** — "faturado sem
envio" vira **impossível**. **É o verdadeiro remédio do medo de esquecerem (contexto
3):** esquecer não vira dado ruim silencioso — vira **contrato travado no faturar**,
visível em "a enviar" e recuperável. ⚠️ **Encosta em `invoiceSaleContract`** (a máquina
de estados que Contratos e Financeiro usam pra faturar) → **mudança cross-feature**, não
só da aprovação.

**AP19 — Washout isento do portão. [E1]**
Um contrato marcado, ainda `EMITIDO` e sem envio, **pode ser cancelado (`WASH_OUT`)**
normalmente — washout é a morte do negócio, independe de aprovação. Sai da fila
"a enviar" e vira "cancelado".

**AP20 — Desmarcar (Sim→Não) restrito. [E2]**
Desmarcar só é permitido em **`EMITIDO` e sem nenhum envio** (conserta marcação errada).
**Após o 1º envio, o sinal trava em "Sim"** (já foi aprovado; não dá pra fingir que não
precisava). Desmarcar-antes-de-enviar segue sendo saída consciente do criador
(ADMIN+COMMERCIAL) — aceita; não se apertou além disso (ex.: exigir papel ou razão) por
ora.

**AP21 — Mecânica do portão. [E3/E4/E5]**

- **E3** O portão é **no faturar**; **pagar herda** (não fatura sem enviar ⇒ não paga
  sem enviar). Sem dupla checagem.
- **E4** Portas de geração **listam só marcados** (decorre da AP17); **a elegibilidade
  de geração aperta para só `EMITIDO`** (reenvio pós-faturado perde propósito — o proxy
  de recusa da AP13 é reenvio **antes** de faturar). _Revê `APPROVAL_ELIGIBLE_STATUSES =
[EMITIDO, FATURADO, PAGO]` → só `EMITIDO`._
- **E5** O sistema não vê a amostra física — o **proxy de "amostra enviada" é "etiqueta
  gerada"** (a linha no `approval_label_log`). Coerente com o contexto 3.

**Matriz de caminhos sob o portão** (as linhas de gargalo deixam de existir):

| marca | status        | tem envio? | possível? | situação                                  |
| ----- | ------------- | ---------- | --------- | ----------------------------------------- |
| Sim   | EMITIDO       | não        | ✅        | **a enviar** (trava o faturar)            |
| Sim   | EMITIDO       | sim        | ✅        | **enviada** (liberou faturar)             |
| Sim   | FATURADO/PAGO | não        | ❌ AP18   | ~~faturou sem enviar~~ — G1 morto         |
| Sim   | FATURADO/PAGO | sim        | ✅        | enviada + faturada                        |
| Sim   | WASH_OUT      | —          | ✅        | cancelado (AP19)                          |
| Não   | qualquer      | não        | ✅        | não se aplica                             |
| Não   | qualquer      | sim        | ❌ AP17   | ~~enviou sem marcar~~ — divergência morta |

**Impacto documental (a formalizar quando implementar):**

- Revê **AP8** (portas listam marcados, não "todos") e o **terminal da AP6** ("some ao
  faturar sem enviar" fica impossível — o lembrete só sai por **envio** ou **washout**).
- Revê `APPROVAL_ELIGIBLE_STATUSES` (→ só `EMITIDO`).
- Novo portão em `invoiceSaleContract` → **cruza para `Contratos-Plano-de-Trabalho.md`**
  (lógica de faturamento); anotar lá ao formalizar.
- **Divergência código × decisão:** AP1–AP16 estão **implementados**; **AP17–AP21 são
  design, não implementados** — o código atual segue livre (AP8). Sinalizar na
  implementação.

### Fase 2 — o lembrete, sob o portão (2026-07-09)

**AP22 — O lembrete segue só "a enviar" (pendente); sem estado "atrasado" por ora.**
Com o portão, o lembrete deixa de ser rede de segurança (a AP18 é) e vira conveniência.
Fica como a AP6/AP15 já definiram — dot laranja **"a enviar"**, de `invoiceDate − lead`
em diante, **todos os dias**, até enviar. **Não** ganha escalonamento de atraso agora. O
**terminal simplifica** (consequência da AP18): o lembrete só sai por **envio** ou
**washout** — "some ao faturar sem enviar" ficou impossível.

**AP-P2 — "Atrasado" como feature futura (aprovação + embarque).** O Flavio quer o
estado de atraso, mas ele depende de "que data conta como limite":

- **Embarque:** **fácil** — tem data exata (`shipmentDate`); depois dela, é atraso. Será
  adicionado **quando trabalharmos o embarque**.
- **Aprovação:** **delicado** — não há data-limite exata (a âncora `invoiceDate` é
  planejada/movível, e a regra é só "antes de faturar"). Precisa de **mais contexto do
  negócio** pra definir o que é "atrasado". **Adiado** — por ora, só "pendente".

**Carregado pra frente (Q2.2, dose do lembrete):** manter o dot **diário** (AP6) ou
enxugar é questão que se resolve junto do **CC7** (relação aba de Aprovação × lembrete do
dashboard × /samples), na Fase 3/4.

### Fase 3 — a geração, sob o portão (2026-07-09)

Sob o portão, a geração já herda: portas listam **só marcados** (AP17) e elegibilidade
**só `EMITIDO`** (AP21/E4). Restava a fricção do "editar pra Sim antes de gerar" (o que
motivou a AP8) e a tensão de papéis dela.

**3.1 — Resolvido: o portão se sustenta sem afrouxar pro operador.** Quem decide uma
aprovação de última hora é **~100% ADM/COMMERCIAL** (fato do negócio, Flavio) — e eles
**podem marcar** (AP9). O operador (CLASSIFIER/REGISTRATION/CADASTRO) só gera de
já-marcados, o que está **certo** (executa, não decide). Não se relaxa a AP17 pra
operador.

**AP23 — "Botão rápido" de Sim/Não no contrato (substitui a ideia descartada de "marcar e
gerar").** Em vez de gerar-que-marca-implícito, um **toggle rápido** do `requiresApproval`
no contrato — sem abrir o "Editar" inteiro. Regras:

- **Quem:** só **ADM/COMMERCIAL** (AP9; COMMERCIAL nos dele).
- **Travas (AP20):** `Não → Sim` livre em `EMITIDO`; `Sim → Não` só em `EMITIDO` **e sem
  envio**; após o 1º envio **trava em Sim**; depois de `EMITIDO` (faturado+), encerrado —
  sem toggle.
- **Lead:** o toggle grava o lead **padrão (30)**; lead custom continua no "Editar".
- **Geração permanece uniforme:** o seletor lista **só marcados, igual pra todos** — sem
  picker por papel, sem marcação implícita. Aprovar de última hora = **toggle → Sim →
  gera** (dois passos explícitos, alinhado ao "forçar o certo").
- _Descartada a "marcar e gerar" (gerar auto-marcava, com seletor role-conditional): mais
  complexa e com efeito colateral escondido. O botão rápido entrega a mesma conveniência
  (sem viagem ao form) de forma explícita._
- **Onde mora (UI, a finalizar no passo de layout):** inclinação = dentro do **Detalhes**
  (card enxuto, AP11/D121), não no card.

**3.3 — Elegibilidade `EMITIDO`-only:** já coberta pela **AP21/E4** (confirmada no
"Concordo" do portão). Reenvio (proxy de recusa, AP13) e reimpressão legítima acontecem
ainda em `EMITIDO`, antes de faturar.

**Adiado de propósito — 3.2 / CC7 (aba × dashboard × /samples):** se a aba de Aprovação é
porta **a mais** ou **substitui** as outras depende do que ela vai **mostrar**. Fica pro
passo de desenho da página, depois das 5 fases.

### Fase 4 — o registro, sob o portão (2026-07-09)

Cada envio grava uma linha no `approval_label_log` (append-only, já existe); o status
deriva pra **enviada** e libera o faturamento (AP18). As superfícies de leitura já
existentes ficam: **timeline "Aprovação enviada"** no Detalhes (envio a envio) + card
**"Últimos envios"** (AP16).

**AP24 — A página mostra o nº de envios (revisita parcial da AP-P1).** O nº de envios é o
proxy de recusa provável (AP13 — reenviar antes de faturar ≈ recusa no meio). A AP-P1
dispensou a superfície in-app disso; mas a **página** é o lar natural do dado. Decisão:

- **Mostra o fato (neutro):** **"enviada"** quando foi 1 envio; **"enviada · N×"** quando
  foi mais de um (destaca só o caso interessante = possível recusa, sem poluir o comum).
- **Não rotula a interpretação:** o app **não** escreve "provável recusa" — essa leitura
  segue **externa** (BI), honrando o espírito da AP-P1. A página mostra o número; quem
  interpreta é quem monta a métrica.
- **Fonte:** derivado do `approval_label_log` (count por contrato); a timeline do Detalhes
  segue listando envio a envio (o dado bruto).

### Fase 5 — o encerramento, sob o portão (2026-07-09)

Confirmação: o portão fechou a matriz de estados **sem buracos**. Todo contrato marcado
cai em um de três estados visíveis; "faturado sem enviar" (AP18) e "enviou sem marcar"
(AP17) são impossíveis.

| estado do contrato                 | aprovação     | rótulo na página         |
| ---------------------------------- | ------------- | ------------------------ |
| EMITIDO · marcado · sem envio      | pendente      | **a enviar**             |
| marcado · ≥1 envio                 | concluída     | **enviada** (· N× se >1) |
| WASH_OUT · marcado (com/sem envio) | cancelada     | **cancelado**            |
| não marcado                        | não se aplica | (fora da página)         |

- **"Enviada" é terminal no sistema;** o desfecho real fica fora (AP13), com o nº de
  envios (AP24) como pista.
- **Washout vence:** contrato cancelado aparece "cancelado" tendo enviado ou não (o
  histórico de envio, se houve, fica na timeline do Detalhes).
- **Em aberto (pertence ao desenho da página, não ao fluxo):** o **alcance da lista** — só
  os ativos ("a enviar") ou o livro-razão inteiro (a enviar + enviada + cancelado). Vai
  junto de colunas/filtros/layout.

**✅ Reformulação "o portão" desenhada ponta a ponta (5 fases, AP17–AP24 + AP-P2).**
Próximo passo: **desenho da página** (a sub-aba de Aprovação) — com o fluxo já consertado —
e depois o plano de implementação. **Nada implementado; diverge do código (AP8).**

## A sub-aba de Aprovação (a página) — desenho (2026-07-09)

> Desenho do **conteúdo** da aba (a "casca"/acesso fica no `Central-de-Contratos`,
> CC6/CC15). Assenta sobre o modelo já reformado (o portão, AP17–AP24). Prefixo **AP**, a
> partir da AP25. **DESIGN — não implementado.**

**AP25 — Alcance da lista: híbrido (P-1).** A página lista **todos os contratos marcados**,
em todos os estados (**a enviar · enviada · cancelado**), com **filtro por status** e
**abrindo na fila de "a enviar"** (o acionável em cima). Honra o "todos os selecionados +
status" da ideia original e prioriza o que precisa de ação. Molde do Financeiro (lista +
estado + filtro).

**AP26 — O que cada linha mostra (P-2).** Status (**dot + rótulo**, com a contagem `·N×` na
enviada — AP24), **nº do contrato**, **comprador**, uma **data** (a enviar → faturamento
planejado, marcado com `~`; enviada → data do último envio) e **sacas**. Só **campos
não-sensíveis** — sem valor/financeiro (respeita o select mínimo da AP10, que mantém a aba
segura pros papéis operacionais).

**AP27 — Ações por linha (P-3).**

- **[Gerar]** — só em contrato **marcado + `EMITIDO`** (a enviar; ou enviada ainda em
  `EMITIDO` = reenvio). Faturado/pago/cancelado **sem botão** (elegibilidade EMITIDO-only,
  AP21).
- **Ver contrato** (abre o Detalhes) — **só ADM/COMMERCIAL** (o contrato carrega
  financeiro; operador não acessa). Pro operador a linha é **inerte** (só a info de
  aprovação + Gerar).
- O **botão rápido** de Sim/Não (AP23) mora no **Detalhes do contrato**, não na aba — a aba
  é sobre **gerar/acompanhar**, não sobre marcar.

**AP28 — Filtro / busca / ordem (P-4).** Filtro por status (**A enviar · Enviadas ·
Canceladas · Todas**, default **A enviar**), busca por **nº ou comprador**, ordem default
na fila = **faturamento planejado** (o mais próximo em cima). Paginação molde Financeiro.

**AP29 — Geração mora só na sub-aba (P-5; resolve o CC7 do Central).** Com a aba pronta, a
geração da etiqueta passa a viver **só nela**. As outras superfícies perdem a geração:

- **Dashboard: vira caminho, não gera.** O lembrete "a enviar" no card de Eventos **fica**
  (AP6, o empurrão temporal), mas **perde o botão "Gerar aprovação"** (**reverte AP7**) —
  clicar no evento **leva à sub-aba** (idealmente destacando o contrato), onde se gera. O
  card **"Últimos envios"** (AP16, feed inerte) **fica** — não é porta de geração.
- **/samples (Lotes): sai.** O seletor "+" de aprovação **some** da página de Lotes — com a
  aba, não faz mais sentido ali.
- **Portas finais de geração:** de "/samples + dashboard" (AP11/AP12) para **só a sub-aba**.
- **Divergência de código:** reverte a **AP7** (implementada na Fase 2, commit `06e7785`) e
  remove a porta /samples — a implementação da página tira os dois. **Design; não
  implementado.**

**AP30 — Acesso do tab: segue o Central; lista não-escopada (P-6).** O tab de Aprovação
segue **CC6-A** (visível a todos os não-PROSPECTOR) e **CC15** (rótulo de nav por papel —
ADM/COMMERCIAL "Contratos"/4 abas; operadores "Embarques"/2 abas). **Posse:** a lista é
**não-escopada** — **todos veem todos** os marcados (AP10; igual ao lembrete do dashboard),
com só nº/comprador/status (campos não-sensíveis, AP26). O **"Ver contrato"** segue
escopado (ADM/COMMERCIAL + só os dele — D110/AP27). _Descartado escopar a lista por
COMMERCIAL (quebraria o "todos geram" da AP10 e deixaria o operador vendo mais que o
comercial)._

**✅ Página desenhada (P-1–P-6 = AP25–AP30).** Falta só o **P-7 (layout/visual)** — passo de
UI, na implementação. **DESIGN; não implementado.**

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
- **2026-07-09 (reformulação "o portão" — a página aperta a lógica; DESIGN)** — ao iniciar
  o desenho da **sub-aba de Aprovação** (F2 da Central de Contratos), a análise do fluxo em
  **5 fases** (marcação → lembrete → geração → registro → encerramento) expôs que o **sinal
  proativo** (AP8) produz divergência (marcado-"Não"-com-envio / marcado-"Sim"-nunca-enviado)
  e o **buraco G1** (faturado sem envio, sem estado). Respostas do Flavio: aprovação é **caso
  a caso** e **sempre pré-faturamento**; medo real = esquecerem de registrar. Decisão:
  transformar a aprovação num **portão duro** — **AP17** (gerar exige contrato marcado "Sim";
  reverte AP8), **AP18** (faturar exige ≥1 envio; portão novo em `invoiceSaleContract`,
  cross-feature; revê terminal da AP6), **AP19** (washout isento), **AP20** (desmarcar só em
  `EMITIDO` sem envio, trava em "Sim" após envio), **AP21** (portão no faturar/pago herda;
  portas listam só marcados; elegibilidade → só `EMITIDO`; etiqueta = proxy da amostra). Fecha
  os gargalos 1.1/1.2 + G1 **estruturalmente**. **DESIGN — não implementado** (diverge do
  código, ainda na AP8). Próximo: **Fase 2** (o lembrete, que simplifica com o portão). Só
  registro — sem código.
- **2026-07-09 (Fase 2 do redesenho — o lembrete)** — sob o portão, o lembrete vira
  conveniência (a AP18 é a rede de segurança); segue **"a enviar"** diário (AP6/AP15),
  terminal simplificado (só envio/washout). **AP22** confirma "só pendente, sem atraso
  agora"; **AP-P2** adia o estado **"atrasado"** como feature futura — fácil no embarque
  (data exata `shipmentDate`), delicado na aprovação (sem data-limite exata; precisa de
  mais contexto do negócio). Q2.2 (dose) carregada pro CC7. Só registro — sem código.
- **2026-07-09 (Fase 3 do redesenho — a geração)** — sob o portão, portas listam só
  marcados (AP17) + elegibilidade só `EMITIDO` (AP21/E4). **3.1 resolvido:** decisão de
  aprovação de última hora é ~100% ADM/COMMERCIAL (que podem marcar) → o portão se
  sustenta sem afrouxar pro operador. **AP23** troca a ideia descartada de "marcar e
  gerar" por um **botão rápido** de Sim/Não no contrato (ADM/COMMERCIAL, travas da AP20,
  lead default; geração segue uniforme = só marcados pra todos, toggle→Sim→gera). CC7
  (aba como porta) adiado pro desenho da página. Só registro — sem código.
- **2026-07-09 (Fase 4 do redesenho — o registro)** — cada envio grava no
  `approval_label_log` (já existe); status deriva pra **enviada** (libera faturar, AP18).
  **AP24:** a **página** passa a mostrar o **nº de envios** — "enviada" (1×) / "enviada ·
  N×" (>1) — o dado neutro (revisita parcial da AP-P1, que fica só pra "provável recusa" =
  BI externo). Timeline do Detalhes + card "Últimos envios" (AP16) inalterados. Só registro
  — sem código.
- **2026-07-09 (Fase 5 do redesenho — o encerramento; REFORMULAÇÃO FECHADA)** — confirmada
  a matriz de estados sem buracos (a enviar · enviada · cancelado · não se aplica);
  "faturado sem enviar" e "enviou sem marcar" impossíveis (AP18/AP17). "Enviada" terminal
  no sistema (desfecho fora, AP13). **5 fases da reformulação "o portão" desenhadas ponta a
  ponta (AP17–AP24 + AP-P2)** — próximo: desenho da página (a sub-aba) + plano de
  implementação. **Nada implementado; diverge do código (AP8).** Só registro — sem código.
- **2026-07-09 (desenho da página — a sub-aba de Aprovação)** — com o fluxo reformado, a
  própria página: **AP25** alcance híbrido (todos os marcados, filtro por status, abre em
  "a enviar"); **AP26** linha = status+contagem·N×/nº/comprador/data/sacas (campos
  não-sensíveis, AP10); **AP27** ações = [Gerar] só marcado+EMITIDO + "Ver contrato" só
  ADM/COMMERCIAL (botão rápido AP23 fica no Detalhes); **AP28** filtro/busca/ordem;
  **AP29 geração mora SÓ na sub-aba** (dashboard vira caminho, perde "Gerar aprovação"
  [reverte AP7]; /samples sai; portas finais = só a aba); **AP30** acesso segue CC6/CC15,
  lista não-escopada (AP10), "Ver contrato" escopado (D110). **Aprovação desenhada completa
  (fluxo + página); DESIGN, não implementado.** P-7 (layout) fica pra implementação; CC7
  resolvido no Central. Só registro — sem código.
- **2026-07-10 (REFORMA "O PORTÃO" IMPLEMENTADA — AP17–AP30, 5 fases)** — a 2ª metade da
  reforma (que seguia DESIGN sobre o código da AP8) foi implementada ponta a ponta, em plan
  mode com análise (2 Explore + design próprio). Commits `4402f9b`→`7e30675`, NÃO pushados;
  gates verdes; unit + **469 integração** verdes. **1 decisão de UX do Flavio nesta sessão:**
  no portão do faturar (AP18), recuperação **INLINE** (estilo Embarque) em vez de
  bloqueio-e-vai-pra-sub-aba — **refina a AP29** (geração proativa só na sub-aba; o gate
  mantém uma geração reativa de recuperação).
  - **F1 (`4402f9b`) — aperta a geração (AP17/AP21):** `APPROVAL_ELIGIBLE_STATUSES` de
    `[EMITIDO,FATURADO,PAGO]` → **só `[EMITIDO]`** (AP21); `getApprovalLabelPrefill` +
    `sendApprovalLabel` ganham guard **409 `APPROVAL_CONTRACT_NOT_MARKED`** (exige
    `requiresApproval`, AP17 — antes da elegibilidade). Reverte a AP8.
  - **F2 (`3f333c4`) — portão do faturar (AP18):** `invoiceSaleContract` ganha o gate
    **422 `CONTRACT_APPROVAL_REQUIRED`** (marcado + count no `approval_label_log` = 0);
    count fora da tx (append-only). **Pagar herda** (E3 — não toca `paySaleContract`). Front:
    `SaleContractLifecycleDialog` intercepta o 422 e abre o `ApprovalLabelModal` (novo prop
    `onSent`); ao enviar, refatura no `onClose` (a version não muda no envio → mesma
    `expectedVersion`). Molde do portão de embarque, já no arquivo.
  - **F3 (`86f6fe7`) — a sub-aba worklist (AP25–28, AP30, AP24):** `listApprovalContracts`
    (auth-only). Estado depende de **agregado** (contagem no log), então **`$queryRaw`**
    particionado (≠ Embarque, que é typed): G0 a_enviar (anti-join `NOT EXISTS`) por
    `invoiceDate` ASC; G1 enviada (JOIN + `count` = `·N×` AP24, `max(created_at)`) DESC; G2
    cancelado (WASH_OUT). Cursor `{g,key,seq}` (key do G1 leva HORA). `AprovacoesPanel` +
    `AprovacaoCard` (molde Embarque; reusa `.emb-card`). Acesso AP30: operacional ganha 2
    abas (Embarque + Aprovações); `HubTabPlaceholder` (removido) → `AprovacoesPanel`.
  - **F4 (`dae70ed`) — geração concentrada (AP29):** dashboard reverte AP7 (evento vira
    **navegação pura** → `?tab=aprovacoes&highlight=`, sem "Gerar aprovação"; os 3 tipos de
    evento unificados num só branch nav-pura, acordeão morto removido). /samples: sai a opção
    "Aprovação" do leque + o `ApprovalContractPickerModal` (removido) + CSS. **Pendência:** o
    backend `listApprovalContractOptions` (+ `toApprovalContractOption` + tipo + rota + testes)
    ficou **DORMENTE** (sem consumidor após a AP29) — candidato a remoção futura.
  - **F5 (`7e30675`) — toggle rápido no Detalhes (AP23 + travas AP20):**
    `setSaleContractApprovalFlag` (ADMIN/COMMERCIAL). Travas: só EMITIDO (409
    `APPROVAL_FLAG_NOT_EDITABLE`); Sim→Não só sem envio (409 `APPROVAL_FLAG_LOCKED`). Lead
    padrão 30 ao ligar / null ao desligar. Segmentado Sim/Não na seção "Aprovação" do Detalhes
    (molde `ctr-approval-btn`; "Não" desabilitado quando a timeline já tem APROVACAO).
  - **Impacto documental formalizado:** AP8 revista (portas listam marcados — na verdade a
    porta proativa virou a sub-aba); terminal da AP6 simplificado; `APPROVAL_ELIGIBLE_STATUSES`
    → `[EMITIDO]`; portão novo em `invoiceSaleContract` (cross-feature — a formalizar no
    `Contratos-Plano-de-Trabalho.md`; documentado aqui + na skill `prisma`). 📱 **validar no device** (portão inline, sub-aba,
    operacional com 2 abas, toggle, dot laranja nav-pura).
