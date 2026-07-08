# Contratos — Plano de Trabalho

> _Renomeado de "Fechamento — Plano de Trabalho" (S67). **"Contratos"** = a feature/página guarda-chuva (criar, listar, emitir, gerir); **"Fechamento"** segue sendo o termo de domínio do **PDF gerado** do contrato._

**Status**: **EM CONSTRUÇÃO** — iniciado em 2026-06-24. **Mercado à vista + Futuro ✅ funcionais ponta a ponta** (Fases 0/A/B/C/D). **Decisões D1–D69** travadas ao longo das sessões 1–60. **Gestão de Contratos = ADMIN-only** (desde 2026-06-28). O alvo é **recriar no app o "Contrato de Compra e Venda de Café"** do sistema legado (print na Sessão 2). O Fechamento puxa **extensões no cadastro de Cliente**: **bancário** (`Bank`+`ClientBankAccount`, pré-requisito) e **anexos** (`ClientAttachment`, independente) exigem tabelas novas; **armazém já existe** (`isWarehouse`). **Fase 0 (cadastro) COMPLETA.** **Todas as pendências catalogadas resolvidas** (resta só P2, decidido campo a campo na implementação) + a entrada do **CNPJ**. Sessão 26 definiu a **arquitetura de Contratos**: página **"Contratos"** (lista + cria), **3 tipos** (Mercado à vista / Futuro / CPR; só à vista e Futuro geram o Fechamento, CPR não) e **fluxo em 2 etapas** (venda parcial no lote → completar na página) — **D41–D45** (revisam D4/D9/D11/D14/D19/D22; substituem D37). Sessão 27 detalhou o **fluxo de emissão** (card → "Gerar documento" → modal → "Emitir" → status `CONFERIR`) — **D46** (+ `CONFERIR` na D14). Estruturas de dados do cadastro já definidas (D38–D40). Sessão 28 fechou o **pós-`CONFERIR`** — **D47**. Sessões 29–35 **concluíram a conferência campo a campo do fluxo de Mercado à vista** (Etapa 1 ✅ + Etapa 2 ✅; S35: filiais c/ cadastro rápido, Embalagem=Sacaria, textos = Observações + Descrição). Pendentes de propósito: editar etapa 1 (P20), botões ágio/deságio (P21), exibição do total (P22). Sessão 36 readicionou **Mês/Ano**. Sessão 37: **CPR removido**; entradas pela página via lápis (**D50**). Sessão 38: **Futuro conferido** (idêntico ao à vista, exceto vendedor manual / sacas livres / sem lote). **Conferência campo a campo de AMBOS os tipos concluída.** Sessão 39: **rascunho das tabelas** desenhado (Grupos A/B/C + enums, **D51–D58**; P16 resolvida; D33 revisada) — ver seção "Rascunho das tabelas". **Sessão 40**: **implementação da Fase 0 iniciada** — schema + migration aditiva (`Bank`, `Broker`, `ClientBankAccount`, `ClientAttachment`, `Client.birthDate`, enum `LookupStatus`) + **backend `Bank`+`Broker`** commitados; acesso liberado a qualquer usuário logado (**D59**), telas em página "Cadastros" com abas (**D60**). **Sessão 41**: backend `ClientBankAccount` (`c695a69`) + `ClientAttachment` + upload de PDF (`49ce3cf`) — **backend da Fase 0 COMPLETO** (smoke real verde). **Sessões 42–43**: frontend da Fase 0 entregue — contas/anexos no detalhe do cliente + página **"Cadastros"** (Bancos/Corretores). **Fase 0 (cadastro) COMPLETA** (backend + frontend). **Sessões 44–48**: **Fase B (contrato Mercado à vista) + Fase C (PDF) IMPLEMENTADAS** — B.1 (schema + 3 listas), B.2 Passo 1 (a venda à vista cria o contrato `EM_ABERTO`), B.2 Passo 2 (etapa 2 + máquina de status `emit`/`confirm` + `WASH_OUT`), B.3 (página "Contratos") e Fase C (PDF on-demand, `pdf-lib`). **Mercado à vista FUNCIONAL ponta a ponta** (venda → contrato → etapa 2 → emitir → confirmar → baixar PDF). **Tudo em `main`, NÃO pushado.** **Sessões 49–52 (refinos pós-implementação)**: **S49** `FATURADO`/`PAGO` vivos (ações `Faturar`/`Pagar`/`Desfazer` no card, com **pular** + **data real** `invoicedAt`/`paidAt`; migration `20260628120000_fechamento_faturado_pago`); **S50** **quebra manual `WASH_OUT`** (botão "Quebrar" de CONFERIR/CONFIRMADO/FATURADO/PAGO, **cancela a venda** + motivo obrigatório, definitiva — **resolve P17**; washout passou a cobrir FATURADO/PAGO); **S51** **conteúdo do PDF** ("Tipo" removido; partes/armazéns = Nome/CNPJ/IE/Endereço/Bairro/Cidade-UF/Número/CEP, consolidado da fazenda em PF, **sem "Filial"**; **campo sempre presente** mesmo vazio); **S52** **layout do PDF em 1 PÁGINA** (título no corpo, linha de identificação horizontal, partes/armazéns em **cards 2-col**, blocos de baixo compactados; título/número saíram do header verde; **script `scripts/preview-contract.mjs`** + guard de página única). **Sessão 53 (2026-06-28)**: **revisão campo a campo + refino da Etapa 1 (registro da venda)** — comprador (filtro confirmado, **força cadastro correto** + **cadastro inline**, **lookup sem limite**), **máscara de moeda** no Preço/Ágio + parser BR (`lib/currency.ts`), **corretagens começam vazias**, **cadastro inline de corretor**, e **layout 50/50** (Data sob o comprador; Sacas+Preço; corretagens). **Etapa 1 (registro da venda) CONFERIDA ✅.** **Sessão 54 (2026-06-28)**: **1ª parte da Etapa 2** (modal "Gerar documento", até `CONFERIR`) — **layout 50/50**, **cadastro inline** de vendedor/armazéns e **erros por campo** (frontend, `SaleContractEtapa2Modal`) + faxina de CSS órfão. **Etapa 2 (1ª parte) implementada ✅.** **Onde paramos / Falta**: validar no device; **CNPJ real** do emissor (env `CONTRACT_ISSUER_CNPJ`) · **assinatura do dono** como imagem (D35) · **header verde** (redesign) · **fidelidade ao print legado** · **ágio/deságio+total impressos** (P21/P22) · **editar etapa 1** (P20) · contrato **Futuro** (D50 — sem backend) · **gestão/CRUD das 3 listas** · ajustes da parte 1 da Fase 0 (contas/anexos). **Sessão 55**: venda à vista **consolidada na página "Contratos"** (fluxo de criação pela página: FAB → seleção de lote → venda → encadeia a Etapa 2) e **removida do detalhe do lote** (que virou histórico só-leitura), com **"Cancelar"** novo no contrato `EM_ABERTO` — **D61**. **Sessão 56**: criação à vista virou **wizard de 2 passos** (commit adiado; "Voltar"; preview do nº) — **D62**. **Sessão 57**: **fase pós-emissão** — **PDF sem status** (D63), modal **"Visualizar"** (Exportar/Baixar, D64), **ações do card** por status + "Quebrar"→"Washout" (D65), **"Editar" edita a fase 1** sincronizando a venda via `SALE_UPDATED` (**resolve P20**, D66). **Sessão 58**: **contrato Futuro** implementado — **1 modal único** sem lote (`createFutureSaleContract` + `emitSaleContract`; **D67**) + **washout/cancelar sem-lote** e "Quebrar"→"Washout" (**D68**). **Sessão 59**: a criação **à vista também virou 1 modal só** (fim do wizard de 2 passos; modo `spotCreate` do Etapa2Modal, com sacas≤disp./liga 100%/dono da liga; **supersede D62**) — **D69**. **Sessão 60**: **PDF redesenhado** no padrão do contrato legado SAFRAS (cabeçalho branco + logo colorido + emissor à direita; faixa-título cinza; 5 caixas pagamento/logística; Quantidades&Valores com corretagem %; Banco; Observação/Descrição com rótulo vertical; assinaturas Comprador|Corretor; **partes mantidas em 2-col**; **sem cláusula**; emissor real). Ver "Status da implementação" + logs das Sessões 44–60. **Sessão 61 (Espelho de Corretagem — desenho)**: 3º documento dos Contratos, o **Espelho de Corretagem** — um **demonstrativo de comissão** gerado **a partir de UM fechamento já existente** (`SaleContract`). **Não é um `SaleContractType`** (não tem partes/sacas próprios; **lê** o contrato): **on-demand, sem tabela/numeração/status próprios**. Entra como 3ª opção do FAB que coloca a página em **modo de seleção** (padrão "liga") → tocar 1 contrato elegível abre o **modal só-leitura** → **PDF**. **D70–D76** (parte — comprador/vendedor — escolhida na geração = CLIENTE + lado da comissão; elegíveis **CONFIRMADO/FATURADO/PAGO**, ambos os tipos; conta bancária da SAFRAS no rodapé; reuso do `SaleContractPdfService`). Ver a seção **"Espelho de Corretagem"** + **Fase E** no roadmap. **IMPLEMENTADO na mesma sessão** (Fase E): backend (`d04e1d1`) + frontend (`67a8c50`), **sem migration**, gates verdes (unit 340 / integração 54 / build), PDF conferido vs. o legado no preview — **validar no device**. **Sessão 62 (Página Financeiro — desenho)**: nova página **"Financeiro"** (acesso **ADMIN + COMMERCIAL**) que lista a **corretagem a receber por fechamento** e a cota de cada corretor — **relatório derivado**, **sem schema novo**. Valor a receber = corretagem dos **2 lados**; **rateio igual** entre corretores (resolve a parte adiada da D34); **só visão calculada** (sem controle de pagamento); elegíveis **CONFIRMADO+**; **ADMIN** vê tudo + quebra por corretor, **COMMERCIAL** só os dele e só a própria cota. **D77–D83**; ver seção **"Página Financeiro"** + **Fase F** no roadmap. _(Só desenho; implementação adiada.)_ **Sessão 63 (Financeiro — refino concreto + multiagente)**: a página é de **cards por fechamento** — recolhido (nº · valor total · corretagem total · corretores+cotas) e **expandido = só detalhe da corretagem** (repartição vend/comp %+R$). **D84–D86** (revisa D82/D83): o **COMMERCIAL** agora **vê valor total + corretagem total**, só não vê os **outros corretores** (recolhido = nº · valor total · só a cota dele). 3 agentes confirmaram: corretores via consulta batch + cota calculada em JS (sem coluna), COMMERCIAL via `Broker.userId`, gate próprio ADMIN+COMMERCIAL, página role-adaptive (molde `/informe`) — **sem migration**. **Sessão 64**: **Fase F IMPLEMENTADA** — backend `listBrokerReceivables` (gate `FINANCEIRO_ROLES`; 2 queries; cota = corretagem ÷ nº; COMMERCIAL via `Broker.userId`) + rota `/api/v1/financeiro` + página `/financeiro` **role-adaptive** (cards `fin-*` recolhido/expandido + total geral + busca) + nav (sidebar + avatar menu). Commits `611b8e9` (backend, +3 unit/+4 integração) + `33226c1` (frontend); **gates verdes** (unit 343 / integração 58 / build). **Sem migration. Validar no device.** **Sessão 65 (2026-06-30)**: **ágio/deságio pós-`CONFIRMADO` via botões no card** (**D87–D90**) — `applyAgioSaleContract` (substitui o vigente sobre o preço cru, recalcula total + corretagem, audita em `SaleContractAgioLog`) + diálogo com **prévia ao vivo**; mantém o campo no modal de criação; PDF inalterado, total no Financeiro. **Resolve P21/P22.** Migration manual `20260630120000`. **Validar no device.** **Sessão 66 (2026-06-30)**: **gestão das 3 listas = "+ Adicionar" inline** (**D91**, opção a) — `createContractLookup` (qualquer autenticado, D59) + modo de criação inline no `InlineSelectField` (digitar + ✓/✕ no dropdown), reusado pelas 3 listas do modal; **só adicionar** (renomear/inativar adiado). **Sem migration. Validar no device.** **Sessão 67 (2026-06-30)**: doc **renomeado "Fechamento" → "Contratos"**; catalogadas as **pendências abertas P23–P28** (congelamento×ágio, total sem corretagem, terminologia Quebrado/Washout, gate das listas, **layout/design das páginas**, renomear/inativar listas) + nova **Fase G (revisão de fluxos + design)**. **Sessão 68 (2026-07-01)**: **1ª frente da Fase G** — fechadas **P23–P26/P28** (**D92–D95** + reconciliação da P23 na D25): Financeiro passa a incluir contratos **sem corretagem** (total visível), **"Washout"** em toda a UI, criar valor das 3 listas exige **ADMIN**, renomear/inativar **adiado**; resta só **P27** (design das páginas). Gates verdes; **sem migration**. **Sessão 69 (2026-07-01)**: **máquina de status simplificada** (**D96**) — `CONFERIR` removido e `CONFIRMADO`→**`EMITIDO`** (editável); o `Emitir` leva direto a `EMITIDO`, sem o passo "Confirmar" (que era só um flip). Migration `20260701130000` recria o enum; `confirmSaleContract` + rota `/confirm` + `SaleContractConfirmDialog` removidos. Gates verdes; **unit 345 / integração 364**; commit `80a213f` (não pushado). **Sessão 70 (2026-07-02)**: **`EM_ABERTO` removido** (**D97**) — o contrato **nasce `EMITIDO`** numa **criação atômica** (venda no lote + contrato completo na mesma tx, via `createSpotSaleContract`; Futuro via `createFutureSaleContract`; `emitSaleContract` vira só "Editar"). Enum final **`EMITIDO · FATURADO · PAGO · WASH_OUT`** (migration `20260702120000`). Card `EMITIDO` ganha **"Excluir"** (apaga + desfaz a venda, só antes de faturar); cancelar a venda pelo movimento passa a **WASHOUT**. Gates verdes; **unit 345 / integração 363**; 3 contratos-demo no banco (`seed-demo-contracts.mjs`). **Sessão 72 (2026-07-02)**: card do contrato — **Emitido = amarelo**; **"Excluir" removido** (**D104**, era redundante com o Washout — simplifica); **Washout ainda paga corretagem** (**D105** — `WASH_OUT` aparece no Financeiro + elegível ao Espelho); **pagamento só depois do faturamento** (**D106** — some o "Pago" do Emitido; ciclo linear `EMITIDO → FATURADO → PAGO`). Gates verdes; **unit + integração verdes**. **Sessão 73 (2026-07-03, só análise)**: analisada a **Etiqueta de Aprovação** (hoje avulsa, `customPrintJob` sem ator/vínculo/auditoria) e a direção pra virar um **marco pós-emissão auditado no contrato** (**D107**, **Fase I**) — ação no card + tabela `SaleContractApproval` + reusa `customPrintJob`; os lotes da etiqueta são **externos/manuais**; a etiqueta avulsa atual **fica**. **Sem código** (abertas Q1–Q5). **Sessão 74 (2026-07-03)**: **Fase G/design (P27)** — (1) modal de **emissão** no desktop **maior + centralizado na área de conteúdo** (à direita da sidebar) + campos em **2 colunas de seções** (sem scroll), **só desktop** e **mobile intocado** (`display: contents`) — **implementado** (`SaleContractEtapa2Modal` + `globals.css`), gates verdes; (2) **detalhes do contrato = MODAL** (**D108**, substitui a ideia de "página de detalhes"): o **card mantém o acordeão** com as **ações principais por status** + botão **"Detalhes"** → **modal grande** com o resto das infos (read-only) + futuro **timeline de auditoria** (D107). Ações principais: `EMITIDO`=Ágio/Deságio/Washout/Faturar/Detalhes · `FATURADO`=Pagar/Washout/Detalhes · `PAGO`=Washout/Detalhes · `WASH_OUT`=Detalhes; **aberto** = Editar/Visualizar/Desfazer (proposta: no modal). Só o modal de emissão tem código — o de detalhes é só registro. **Continuação S74 (2026-07-04)**: **audit do Espelho** (3 agentes) → **D109** (fix #1 exige corretagem no lado / `409 ESPELHO_NO_BROKERAGE` + fix #2 re-busca do resumo; abertos: contraparte, % não impressa, ágio "0,00", auditoria D71, saída do modo-seleção, guardas de download; prosa defasada corrigida). **D110 — COMMERCIAL gerencia os próprios contratos** (revoga _"Gestão de Contratos = ADMIN-only"_): acesso/gestão passa a **ADMIN + COMMERCIAL**, restrito aos contratos onde é corretor (`Broker.userId` + posse via `SaleContractBroker`); **Fase 1 IMPLEMENTADA** (COMMERCIAL lê + gera Espelho/PDF; `/contratos` role-adaptive; gates verdes, integração 59/59); **Fase 2 (mutações + criação) IMPLEMENTADA** (COMMERCIAL gerencia os contratos dele — criação exige o próprio corretor; integração 60/60). **D111** — refinamentos de layout do **PDF do contrato** (logo alinhado ao emissor, linha de identificação justificada, cabeçalhos dos cards centralizados, Banco 3×2 sem "Titular" + Chave PIX em 2 linhas, valores em CAIXA ALTA exceto a Chave PIX, Observação/Descrição com fonte adaptativa; página única). **Sessão 75 (2026-07-04, só registro)**: **Aprovação — fluxo + auditoria fechados** (**D112–D114**, resolvem **Q1–Q5** da D107) — todo **ENVIO** auditado **1:N** (desfecho aprovado/recusado **fora do sistema**; **sem selo**, só histórico no Detalhes/D108); campos **pré-preenchidos editáveis** (lotes ← `originLot` da amostra; quebra de formato fica pro campo a campo); **entrada dupla** = botão no acordeão do card (`EMITIDO`/`FATURADO`/`PAGO`) + `/samples` com **seletor de contratos reduzido** (todos os não-PROSPECTOR; nº+comprador+data+sacas+busca, sem valores; endpoint próprio) e botão **"Manual"** (a etiqueta 100% manual sobrevive só aí, **agora auditada**); auditoria = **tabela ÚNICA** com `saleContractId` **opcional** (nulo = avulsa; **sem coluna booleana**; payload = linhas impressas + ref `customPrintJob`; nome proposto **`ApprovalLabelLog`**). **Sem código** — próximo: **análise campo a campo**. **Sessão 76 (2026-07-04, só registro)**: **Aprovação — campo a campo FECHADO** (**D115–D116**) — 5 campos **diretos do contrato**, editáveis e cortados no limite físico (Nº compra ← `purchaseNumber` corta 26; Nº fechamento ← `contractNumber`; Produtor ← `sellerSnapshot.displayName` corta 52; **Armazém = SEMPRE o do vendedor** ← `sellerWarehouseSnapshot`, vazio se ausente; Sacas ← `quantitySacks`); **Lotes** ← `Sample.declaredOriginLot` quebrado por **traço/espaço/vírgula/ponto-e-vírgula** (**barra NÃO** — pode ser composição; pedaço >16 corta em 16; >16 pedaços = 16 primeiros; **texto original de referência** no modal; Futuro/liga/vazio = campos vazios; vírgula = o próprio separador do print agent → inimprimível dentro de lote); **prefill montado no BACKEND** (endpoint não-PROSPECTOR; quebra = função pura única pras 2 portas). **Sem código** — próximo: **fluxo de UI das duas portas** (`/samples` e `/contratos`). **Sessão 77 (2026-07-04, só registro)**: **Aprovação — fluxo de UI fechado** (**D117**) — seletor lista **só elegíveis** (`EMITIDO`/`FATURADO`/`PAGO`; WASH_OUT nem aparece), **todos os contratos, mais recente primeiro, com busca** + "Manual" no topo direito; formulário aberto pelo seletor tem **"Voltar"**; modais **centrais no desktop + bottom sheet no mobile** (padrão `NewSampleModal`; nota: o modal de criação de contrato é central também no mobile — débito B.3/skill modals, candidato à Fase G); botão do card = **"Aprovação"**; sucesso = padrão atual (check + auto-close). Próximo: **perguntas finais de funcionamento**. **Sessão 78 (2026-07-04, só registro)**: **Aprovação — funcionamento fechado** (**D118**) — linha do histórico = **"há X tempo" + quem enviou + nº do contrato + "Aprovação enviada"** (resumida, sem drill-down do payload na UI); **sem resultado do print job** no histórico (audita-se o envio; falha → reimprime, auditado); **selo de status no item do seletor**; **1 cópia por envio**; validação mantida ("≥1 campo preenchido"). **Aberto**: escopo do histórico na Fase I (timeline junto do modal de Detalhes/D108 ou auditoria write-only primeiro) + se há visão geral de aprovações fora do contrato. **Sessão 79 (2026-07-04, só registro)**: **D119** (revisa D118) — Fase I **em fases** (auditoria **write-only desde o 1º dia**; modal de Detalhes/timeline **depois**); histórico **só no Detalhes** (sem visão geral) → linha **sem nº do contrato** (formato final: **"há X tempo" + quem enviou + "Aprovação enviada"**, data exata de apoio). Próximo: **análise multiagente + plano de execução da Fase I**. **Sessão 80 (2026-07-04)**: **Fase I.a/I.b IMPLEMENTADAS** — análise multiagente (3 Explore + 1 Plan) → plano aprovado → 3 commits: `6eebc20` (schema + migration `approval_label_log`) · `3f22b62` (backend: support puro + 3 handlers `approval-labels`, envio auditado job+log na MESMA tx, 409/422/404) · `ff2a50f` (frontend: `ApprovalContractPickerModal` + 2 portas + footer 3 botões + referência do lote de origem; **aposentados** `requestCustomPrint`/rota `request`/`enqueueCustomPrintJob`). Defaults adotados: **Limpar zera tudo · Voltar descarta · tabela `ApprovalLabelLog` confirmada**. **Verificado no app real** (Playwright: 2 portas; lotes `1234·5678·91011·12/3·999` com barra preservada; vinculada + avulsa NULL; WASH_OUT some do seletor + 409 sem gravar; id malformado → 404; rota antiga → 404). **Gates verdes** (unit 353 / integração 377 / build). **Correção**: a nota da D117 sobre o modal de criação estava errada — ele usa `BottomSheet` (sheet mobile / central desktop). **Resta: timeline no Detalhes (D108) + validar no device.** **Sessão 81 (2026-07-04, só registro)**: **modal de Detalhes — desenho FECHADO** (**D120–D125**, 2 rodadas de perguntas): **D120** conteúdo/layout (molde do modal de emissão, seções read-only 2-col, header nº+selo+tipo, **Histórico em largura total no fim**, tudo do `getSaleContract` sem backend novo; **COMMERCIAL vê tudo**, D86 fica só no Financeiro) · **D121 card ENXUTO** (card = avançar status + Aprovação + Detalhes; **Editar/Visualizar/Ágio/Deságio/Washout migram pro modal** — revisa D87) · **D122 Desfazer REMOVIDO** do sistema (ciclo só pra frente; molde D96/D104) · **D123 marcos auditados** (tabela nova `SaleContractStatusLog`: Faturar/Pagar/Washout gravam quem+quando; antigos só com data) · **D124 Espelho auditado** (`SaleContractEspelhoLog`, resolve a **D71**; download de PDF segue sem rastro) · **D125 timeline v1** (criação/edições + ágio + aprovações + marcos + espelho; linha "há X tempo + quem + o quê" com data exata de apoio; endpoint agregador novo). **Sem código** — implementação = **Fase J** (sessão futura, plano próprio). **Sessão 82 (2026-07-04, só registro)**: **D126** (revisa D120/D121) — o **CONTRATO (PDF) entra EMBUTIDO no modal de Detalhes** (preview on-demand: coluna esquerda no desktop / primeira seção no mobile; **Exportar/Baixar junto do preview**, em todos os status; **"Visualizar" sai do rodapé**; tamanho = frame grande do modal de criação, reforçado pelo Flavio; proposta a confirmar na Fase J: **aposentar o `SaleContractDocumentModal`**, que ficaria órfão). **Sessão 83 (2026-07-04)**: **FASE J IMPLEMENTADA** — 4 commits: `ec620ec` (migrations `sale_contract_status_log` + `sale_contract_espelho_log`) · `aafc145` (backend: **D123** Faturar/Pagar/Washout gravam o marco com ator na MESMA tx — inclusive o washout à vista via `washoutSaleContractByMovement` com o ator repassado pelos cancels; **D124** `logEspelhoGenerated` no `exportEspelhoPdf`; **D125** `buildContractTimeline` puro + `getSaleContractTimeline` com gate/posse + rota `/timeline`; +3 unit/+6 integração) · `50cfd59` (**D122** Desfazer removido ponta a ponta) · `7002f22` (**D120/D126/D121** `SaleContractDetailsModal` com PDF embutido + Exportar/Baixar na seção + seções read-only + Histórico "há X tempo + quem + o quê" com data exata + rodapé por status com swap; **card ENXUTO** = Faturado|Pago + Aprovação + Detalhes; **`SaleContractDocumentModal` APOSENTADO** — default adotado, Flavio ausente na pergunta; acentos do `formatRelativeTime` corrigidos). **Verificado no app real** (desktop central 848px + mobile sheet; timeline com "Faturado" auditado e "Aprovação enviada"). Gates verdes (unit 354 / integração 383 / build). **Validar no device.**
**Escopo**: documento único de organização, análise, decisões e execução da feature de **Fechamento** — a geração, **após uma venda**, de um **Contrato de Compra e Venda de Café** profissional em **PDF, para impressão** — **e das extensões de cadastro que ele exige** (ver "Impacto no sistema").

**Como ler este doc**: a seção **Decisões fechadas** é o que está acordado; **Impacto no sistema** lista as extensões de cadastro; **Contrato legado — inventário de campos** é o alvo do v1; **Pendências** é o que ainda não foi decidido; **Roadmap** é o desenho corrente em fases; **Log de sessões** é o histórico por data.

**Princípio**: construído colaborativamente em formato pergunta → resposta → registro, e implementado **um campo por vez**. A implementação de cada bloco só começa depois que as decisões dele estiverem fechadas. Este doc **referencia** o código em vez de duplicar dados que mudam.

---

## Contexto

A empresa precisa que, **logo após registrar uma venda**, o sistema produza um documento chamado
**"Fechamento"** — na prática, o **Contrato de Compra e Venda de Café** que ela já emite hoje em um
sistema legado (ver o inventário de campos abaixo). É um documento importante e deve ser profissional
e correto: serve como **confirmação para o comprador e para o vendedor** e tem **valor de contrato
formal**, com **corretagem dos dois lados** (modelo de corretora).

Hoje **não existe** nada parecido no app, a venda **não captura dado financeiro nem contratual**, e o
**cadastro de Cliente não tem dados bancários**. Como o Fechamento replica o contrato legado, a feature
**estende a ação de venda, gera o PDF e amplia o cadastro de Cliente** (ver "Impacto no sistema").

A construção é deliberadamente **incremental e campo a campo**. A especificação funcional de
vendas/movimentações que ancora este trabalho está em
`docs/Clientes-e-Movimentacoes-Especificacao.md` (e o produto em `docs/Produto-e-Fluxos.md`).

---

## Estado atual do domínio (resumo para ancorar decisões)

Síntese verificada no código em 2026-06-24. Detalhes nas referências.

### A ação de venda hoje

- **Venda = evento `SALE_CREATED`** (não "SAMPLE_SOLD") — enum em `prisma/schema.prisma:44-69`.
  É projetado em uma linha `SampleMovement` (`prisma/schema.prisma:656-686`, tabela `sample_movement`)
  - contadores denormalizados no lote (`soldSacks`/`lostSacks`/`commercialStatus`).
- **Fluxo (D61/D62)**: a venda à vista nasce **só pela página "Contratos"**, num **wizard de 2 passos**
  (FAB "+" → "Mercado à vista" → **seleção de lote** → **passo 1** `SampleMovementModal` só coleta →
  **passo 2** `SaleContractEtapa2Modal` cria a venda + contrato e emite no fim). Só no fim chama `POST
app/api/v1/samples/[sampleId]/movements/route.ts` → `createSampleMovement` em
  `src/samples/sample-command-service.js` (cria o `SaleContract` na mesma tx) **e** `POST
.../sale-contracts/[id]/emit`. O detalhe da amostra (`SampleMovementsPanel`) é **só-leitura** — sem
  botões de venda/perda. Gestão dos contratos = **ADMIN** (`SALE_CONTRACT_MANAGE_ROLES`, `/contratos`).
- **Captura hoje apenas**: comprador (Cliente vinculado, obrigatório), sacas (qtd inteira), data
  (`movementDate`), observações (1 campo `notes`). Validação por normalizers manuais (sem zod).
- O **event store é append-only** (triggers impedem UPDATE/DELETE — skill `prisma`). Campos novos
  exigem migration nova + bump de `schemaVersion` no payload, nunca editar o existente.

### Cadastro de Cliente hoje

- `Client` (`prisma/schema.prisma:520`) tem nome/razão, CPF/CNPJ, IE, endereço, contato e as flags
  **`isBuyer/isSeller/isWarehouse`** (`:548-550`, multi-escolha — `ClientQuickCreateModal.tsx:565-577`).
  **Sem nenhum dado bancário** (confirmado por grep).
- **Assimetria PF×PJ (chave dos snapshots do contrato)**: em **PJ**, razão/CNPJ/IE/endereço/contato ficam
  no próprio `Client`; em **PF** esses campos ficam **NULL no `Client`** e moram na `ClientUnit` (fazendas)
  — PF nasce com ≥1 unit (placeholder "Fazenda 1"); ver `:528-534`. Logo o endereço/IE de B2–B5 de um
  cliente **PF vêm da `ClientUnit`**, não do `Client`.
- Já há um **lookup por tipo** (`ClientLookupKind = 'owner' | 'buyer' | 'warehouse' | 'any'`,
  `lib/types.ts:33`) e filtro por papel: selecionar cliente-armazém é nativo.
- **Sub-tabelas do cliente** como precedente: `ClientUnit` (`:577`), `ClientCommercialUser`,
  `ClientAuditEvent`. Conta bancária e anexos por cliente seguem esse padrão.
- **Vendedor** = `Sample.ownerClientId` — o lote **não guarda filial** (`ownerUnitId` nulificado em prod,
  D38). **Comprador** = `buyerClient` **+ `buyerUnitId`** da venda, com **snapshot duplo**
  (`buyerClientSnapshot` + `buyerUnitSnapshot`) via `buildBuyerSnapshot` (`sample-command-service.js:316`)
  — molde do D25. **Corretor** = `User` papel `COMMERCIAL`.

### Upload / anexos hoje

- Há infra de anexo, mas **escopada em amostra e só-imagem**: `SampleAttachment` (`:364`) +
  `src/uploads/local-upload-service.js` valida **magic bytes** e aceita só `image/jpeg|png|webp`
  (`:10,54`). Storage em `UPLOADS_DIR`. **Sem `ClientAttachment`.**

### Geração de PDF e emissor

- Só **`pdf-lib`** está instalado (sem HTML→PDF). Usado no laudo
  (`src/reports/sample-pdf-report-service.js`) — `renderSamplePdf` + `SamplePdfReportService`. **Molde**
  do Fechamento (D6). Emissor = `COMPANY_INFO` em `:27-31` (nome, cidade/UF, telefone, endereço) —
  **falta CNPJ**. Logo já entra como bitmap no cabeçalho.
- **Entrega**: download/compartilhar via `lib/share-blob.ts` + `lib/api-client.ts:1113` + rota
  `app/api/v1/samples/[sampleId]/export/pdf/route.ts`. Infra de link público/QR
  (`app/laudo/[token]/route.ts` + `SampleReportShare`) disponível.

---

## Decisões fechadas

| #    | Decisão                                                                                         | Detalhe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1   | Natureza **híbrida**                                                                            | Contrato de Fechamento: dados estruturados + **2 blocos de texto livre** + **assinaturas**. Sem cláusulas jurídicas fixas (ver D30).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D2   | Destinatários                                                                                   | Confirmação ao **comprador** e ao **vendedor**, com valor de **contrato formal** entre as partes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D3   | Granularidade **por venda**                                                                     | Cada venda (movimento `SALE`) gera um Fechamento, chaveado pelo `movementId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D4   | Financeiro **na venda (obrigatório)**                                                           | Os dados passam a ser capturados no modal de Venda; o núcleo financeiro é exigido. Demais campos: obrigatoriedade caso a caso. **Revisado pela D43** (núcleo financeiro = etapa 1 da venda).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D5   | Emissor com **dados fixos**                                                                     | Cabeçalho com nome/CNPJ/logo da empresa/corretora, fixos (não escolhidos por venda).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D6   | PDF via **`pdf-lib`**                                                                           | Clonando o pipeline do laudo (`sample-pdf-report-service.js`); **sem dependência nova**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D7   | Construção **campo a campo**                                                                    | Os campos são detalhados e implementados um a um; este doc é o backlog vivo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D8   | **Replicar o contrato legado por inteiro**                                                      | O v1 espelha o "Contrato de Compra e Venda de Café".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D9   | **Campos no modal de Venda**                                                                    | O `SampleMovementModal.tsx` vira o formulário do contrato (mantém D4). UI com seções/abas dado o volume. **Revisado pela D41** (2 etapas: etapa 1 no modal da venda, etapa 2 na página de Contratos).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D10  | **Qualidade do café NÃO entra**                                                                 | Documento puramente comercial; classificação fica só no laudo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D11  | **Persistência: tabela `SaleContract`**                                                         | Tabela dedicada 1:1 com o movimento `SALE` (FK `movementId`), colunas tipadas, escrita pelo projetor. **Por ora só Mercado à vista** (sempre com lote/movimento). **Futuro** (sem lote, D42) precisará persistir **sem movimento** — modelagem a definir no rascunho (P16). **Resolvido pela D51** (Futuro 100% no `SaleContract`; `movementId` 1:1 no à vista).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D12  | **Comprador/Vendedor automáticos**                                                              | Comprador = comprador da venda; Vendedor = dono do lote (`ownerClient`). Pré-preenchidos, **editáveis**, com snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D13  | **Corretor = usuário `COMMERCIAL`**                                                             | Um usuário (papel `COMMERCIAL`) é o corretor responsável, figura e assina. Snapshot do nome. **Revisado pela D34**: N corretores por contrato, vínculo a `User` opcional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D14  | **Status do Contrato (manual)**                                                                 | Enum editável: `EM_ABERTO → CONFERIR → CONFIRMADO → FATURADO → PAGO` (default `EM_ABERTO`). Cancelamento via cancelar a venda. **Revisado pela D41/D45/D46**: `EM_ABERTO` = venda parcial; ao **Emitir** (etapa 2) → `CONFERIR` (documento gerado p/ conferência); demais status mantidos; +`WASH_OUT` (quebra). **Implementado (S49)**: `Faturar` (`CONFIRMADO→FATURADO`) e `Pagar` (`CONFIRMADO`/`FATURADO→PAGO`, **pode pular**) gravam a **data real** (`invoicedAt`/`paidAt`); `Desfazer` volta um passo (limpa a data). Ações no card via diálogo. _(**Revisado pela D96**: sai `CONFERIR`; `CONFIRMADO`→`EMITIDO`; fluxo `EM_ABERTO → EMITIDO → FATURADO → PAGO`.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D15  | **Número do Contrato automático**                                                               | Sequencial **contínuo** + `/AA` do ano (ex.: `3295/26`), **não editável**. Gerador novo (padrão do `internalLotNumber`). **Atribuído na etapa 1** (ao registrar a venda, junto do `EM_ABERTO`); cancelar a venda pode deixar **gap** (D46).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D16  | **"Número de Compra" = campo livre**                                                            | Texto/número manual; **sem vínculo** a outra entidade.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D17  | **Quantidade = sacas da venda (inteira)**                                                       | Reusa o `quantitySacks`; sem campo novo. **Peso (Kg)** é campo decimal **separado**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D18  | **Valor total automático**                                                                      | `preço/saca × sacas`, ajustado por ágio/deságio (ágio soma, deságio subtrai). _Base exata a confirmar na Fase B._ **Revisado (Sessão 32)**: ágio/deságio **não é campo do formulário** — vira **botões no card** (a detalhar — P21); o total é **calculado e salvo**, não exibido (local a decidir — P22). _(Ágio/deságio em R$ por saca: ver D54.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D19  | **Corretagem calculada**                                                                        | Vendedor e comprador, cada um em **% ou R$**; quando %, calcula o R$ sobre o total. Guarda tipo + valor + R$. **Revisado pela D44**: entrada **só em %**, vendedor e comprador **separados** (sem R$ na entrada).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D20  | **Listas (B8)**                                                                                 | **Forma de Pagamento {Faturado, Livre}** · **Modalidade {Retirar, Posto, Disponível}** · **Embalagem {Sacaria, Bags, A granel}** (valores no B8; **cadastráveis pelo admin**, iniciam com esses valores). **Condição de Pagamento = texto livre** (não é lista). _(Banco → entidade própria, D24.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D21  | **Só vendas novas**                                                                             | Fechamento/`SaleContract` só para vendas a partir da feature; antigas ficam **sem contrato** (sem backfill).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D22  | **Geração automática ao salvar**                                                                | Confirmar a venda já gera/abre o PDF do Fechamento. Re-geração depende de P10. **Revisado pela D41/D46**: o PDF sai ao **Emitir** na página de Contratos (não ao salvar a venda) → status `CONFERIR`; **geração única/regenerável** (sem documento de teste separado, D32).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D23  | **Permissão ampla**                                                                             | Pode gerar o Fechamento **quem tem acesso à venda**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D24  | **Dados bancários do cliente**                                                                  | `Bank` (lookup leve cadastrável: `id` Int, nome, status ativo/inativo) + `ClientBankAccount` por cliente, no padrão `ClientUnit`. "Banco do Vendedor" = uma conta do vendedor. **Revisado pela D39** (código do banco).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D25  | **Snapshot de dados de cliente**                                                                | No fechamento, comprador, vendedor, corretor, **conta bancária** e **armazéns** são **congelados**; mudanças no cadastro não alteram contratos já emitidos. **Congela ao `CONFIRMADO`** (D47): até lá os dados do contrato são editáveis (Editar) e o snapshot reflete a última edição. **Exceção (P23/D87)**: o **ágio/deságio** é a **única** mutação permitida após o `CONFIRMADO` — altera **apenas os valores financeiros** (total + corretagem em R$), **nunca** os snapshots de partes/banco/armazém nem as `%`; por isso o **PDF do contrato não muda** e Espelho/Financeiro (on-demand) sempre refletem o valor vigente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D26  | **Armazém = `Client` com `isWarehouse`**                                                        | Modelo **já existe** (flags multi-escolha + lookup `kind='warehouse'`). "Armazém do Comprador/Vendedor" = cliente-armazém (livre) → snapshot. **Sem entidade nova.** **Revisado pela D49**: lookup amplo (todos os clientes) + auto-promoção a armazém.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D27  | **Anexos do cliente**                                                                           | `ClientAttachment` (1 cliente → N arquivos, lista livre + descrição), reusa `local-upload-service` + `UPLOADS_DIR`. **PDF + imagens** → +`application/pdf` no allowlist + atualizar CLAUDE.md#5/SECURITY. **Só arquivamento; independente do contrato.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D28  | **Campos da conta bancária**                                                                    | `ClientBankAccount` = banco (FK `Bank`) + **agência** + **conta (com dígito)** + **titular (nome)** + **CNPJ/CPF do titular** + **chave PIX**. Titular pode diferir do cliente. _(Sem tipo corrente/poupança.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D29  | **Emissor fixo em config**                                                                      | Promover `COMPANY_INFO` a módulo compartilhado + **CNPJ** (a fornecer). Sem tela editável (muda com deploy).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D30  | **2 blocos de texto livre, sem cláusulas fixas**                                                | Contrato tem **2 blocos de texto livre** (opcionais, sem limite): **Observações** e **Descrição**; **não há** boilerplate jurídico fixo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D31  | **Linhas de assinatura do corretor**                                                            | ~~Campo `corretorSignatureLines` (0–4).~~ **Substituído pela D35**: assinatura do corretor = imagem fixa do dono da empresa (sempre 1, automática).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D32  | **Entrega: baixar/compartilhar**                                                                | PDF gerado e oferecido via `shareOrDownloadFile` (download/Web Share); **sem persistir bytes**. Regenerável da `SaleContract` (D11/D25) quando preciso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D33  | **Auditoria: `FECHAMENTO_EXPORTED`**                                                            | Novo tipo de evento no event store da amostra (`SampleEventType` + payload schema) registra cada geração do Fechamento. _(Append-only: migration + bump.)_ **Revisado pela D56**: auditoria vai em **tabela própria** (`SaleContractExport`), não no event store da amostra (cobre o Futuro, que não tem `Sample`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D34  | **Corretores: N por contrato**                                                                  | Cadastro **`Broker`** (id, nome, `userId` FK **anulável** [métrica], status ativo/inativo) para TODOS os corretores. Contrato → `SaleContractBroker` (brokerId + nome snapshot), N por contrato. Métrica por `brokerId` (todos os corretores); métrica de usuário via `Broker.userId`. Não-usuário = `Broker` com `userId` nulo — **reutilizável + com métrica**. _(Revisa D13. Rateio da corretagem: adiado.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D35  | **Assinaturas (layout fixo)**                                                                   | Corretor/empresa = **imagem da assinatura do dono** (asset fixo do emissor — D29), impressa automaticamente. Comprador e vendedor = **linhas em branco** (assinadas à mão). _(Substitui o `corretorSignatureLines` da D31.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D36  | **Data de nascimento (PF)**                                                                     | Coluna `Client.birthDate` (data), preenchível **só quando `personType = PF`**, **opcional**. **Só cadastro** — não entra no Fechamento. Sem tabela nova.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D37  | **Campo `Tipo` (da operação)**                                                                  | Campo **obrigatório**, **sem default** (força escolha), lista **cadastrável** pelo admin (inicia com **Futuro · Mercado à vista · Wash-out**). Distinto da Modalidade (B8). **Substituída pela D42**: vira o **tipo de contrato** fixo (à vista/Futuro); **Wash-out** passa a status (D45).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D38  | **Lote liga só ao `Client`; filial na venda**                                                   | Ao registrar, o lote vincula só o `Client` (sem filial — `Sample.ownerUnitId` nulificado). A **filial** do cliente **PF** (cujo endereço/IE moram na `ClientUnit`) — **do vendedor e do comprador** — é **escolhida na etapa 2** (modal de geração, não na venda) e congelada no snapshot (D25).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D39  | **Código do banco no `Bank`**                                                                   | Entidade `Bank` ganha **código COMPE** (3 dígitos; ex.: 001 BB, 341 Itaú, 237 Bradesco) além de nome + status. Padroniza o cadastro e permite autocompletar de lista oficial. Complementa a D24.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D40  | **Dados do corretor não-usuário**                                                               | Corretor **não-usuário** (`Broker`, `userId` nulo) guarda **CPF** + **telefone/e-mail** além de nome + status (identifica unicamente + contato/base de pagamento). Para corretor-usuário esses campos são opcionais (pode herdar do `User`). Complementa a D34.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D41  | **Página "Contratos" + fluxo em 2 etapas**                                                      | Nova página **"Contratos"** lista e cria contratos. Mercado à vista: a **venda** (página do lote) cria um `SaleContract` **`EM_ABERTO` parcial**; o usuário **completa na página de Contratos** e só então o **PDF é gerado**. Separa quem registra a venda de quem fecha o contrato. _(Revisa D9 e D22.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D42  | **Tipos de contrato (enum fixo) + nomes**                                                       | **Mercado à vista / Futuro** (CPR removido na S37), enum **fixo**. **Ambos geram o Fechamento (PDF).** **À vista** = sempre vinculado a um **lote**; **Futuro** = sempre **sem lote** (café ainda não existe), criado direto na página. **"Contratos"** = página/guarda-chuva; **"Fechamento"** = o documento gerado. _(Substitui D37; entradas/UI na D50.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D43  | **Campos por etapa (venda × contrato)**                                                         | **Etapa 1 (venda, no lote):** comprador · data · sacas · preço/saca · corretagens (%) + corretores. **Etapa 2 (página Contratos):** nº do lote · vendedor · **filiais do vendedor e do comprador se PF** (D38) · banco do vendedor · armazéns (comprador/vendedor) · nº de compra · pagamento/logística · textos livres · datas faturamento/pagamento. _(Revisa D4.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D44  | **Corretagem: 2 lados, só %, N corretores**                                                     | Corretagem do **vendedor e do comprador**, **separadas**, capturadas **só em %** (não mais "% ou R$"). **N corretores** por contrato (D34). _(Revisa D19; resolve a pendência do B6/B7.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D45  | **`WASH_OUT` = status (quebra)**                                                                | Novo status **`WASH_OUT`** (quebra de contrato) somado ao enum da D14. _(Acionamento, terminalidade e relação com "cancelar a venda" — a definir.)_ _(Revisa D14.)_ **Refinado pela D58**: guarda `washoutReason` + `washoutAt`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D46  | **Emissão na página de Contratos**                                                              | Cada contrato é um **card**: **"Gerar documento"** abre o modal da etapa 2 (D43); **"Emitir"** gera o **PDF** e leva o status a **`CONFERIR`** (D14). **Geração única/regenerável** (D32) — conferência é só etapa de status. Número `NNNN/AA` nasce na **etapa 1** (venda); cancelar pode deixar **gap** (D15). _(Refina D41/D22. **Revisado pela D96**: `Emitir` leva **direto a `EMITIDO`**; sem `CONFERIR`.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D47  | **Pós-`CONFERIR`: Revisar/Confirmar**                                                           | No card em `CONFERIR`: **"Revisar"** abre o modal → **"Confirmar"** leva a `CONFIRMADO` **sem novo PDF**; **"Editar"** abre os campos das **etapas 1 e 2** → **"Emitir"** regenera o PDF e mantém `CONFERIR`. Fica em `CONFERIR` até confirmar; ao `CONFIRMADO` os dados **congelam** (D25). _(Resolve P19; refina D46. **OBSOLETA pela D96**: sem `CONFERIR`/passo "Confirmar" — `Emitir` já vai a `EMITIDO`, que segue **editável** via "Editar".)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D48  | **Editar o vendedor sincroniza o lote**                                                         | Editar o vendedor no contrato (enquanto editável, até `CONFIRMADO`) **atualiza o `Sample.ownerClientId`** (sincronização contrato→amostra), em qualquer edição — inclusive após gerar o documento de conferência (→ regenerar, D47). Vale para o **vendedor** (dono do lote, mutável); o **comprador** é da venda (append-only) → P20.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D49  | **Armazém: lookup amplo + auto-promoção**                                                       | Os campos de **armazém (comprador e vendedor)** buscam em **todos os clientes** (não só `isWarehouse`); selecionar um cliente que não é armazém **liga `isWarehouse=true`** no cadastro dele (mantém os outros tipos), análogo à D48. Ambos **opcionais**; snapshot. _(Revisa D26.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D50  | **Entradas pela página de Contratos (lápis)**                                                   | Na página, **lápis → escolher o tipo** (padrão da pág. Relatórios). **Mercado à vista** também pode nascer aqui: modal de **seleção de lote (obrigatória — não dá pra pular)** → **fases 1+2 em 2 modais seguidos** (registra a venda no lote, como o fluxo via lote, D43). **Futuro**: só pela página, **sempre sem lote**, fases 1+2 em 2 modais. _(Refina D41/D42/D43; o "Mercado à vista **também** nasce no lote" foi **superado por D61** — entrada única pela página.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D51  | **Persistência uniforme do `SaleContract`**                                                     | Tabela com colunas próprias de todo o negócio. **Futuro = 100% no `SaleContract`** (`sampleId`/`movementId` nulos + `type`); **à vista** vincula o movimento (`movementId` 1:1). Resolve **P16**; refina D11/D42.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D52  | **Edição reflete na venda/lote**                                                                | Editar a etapa 1 no contrato **sincroniza o `SampleMovement`/lote** (à vista) — contrato e venda coerentes; Futuro só no contrato. _(Mecanismo p/ movimento append-only = Fase B, P20.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D53  | **Snapshots JSON + listas em lookup**                                                           | Snapshots (comprador/vendedor/armazéns/banco) = `Json?` por entidade + FK (padrão `buyerClientSnapshot`). Listas Forma/Modalidade/Embalagem = **3 tabelas de lookup**; contrato guarda **texto snapshot** + FK (revisa D20/D25).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D54  | **Ágio/deságio por saca**                                                                       | `AgioDesagioType` (ágio/deságio) + valor **em R$ POR SACA**: preço efetivo/saca = preço ± valor; `total = preço_ajustado × sacas`. **Corrige a D18** (não é ajuste no total).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D55  | **Corretagem: % + R$ salvo**                                                                    | Guarda os 2 % (vendedor/comprador) **e** o R$ calculado (snapshot congelado). Refina D44/D19.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D56  | **Auditoria em tabela própria**                                                                 | `SaleContractExport` (contrato + tipo + quem/quando) registra cada emissão — uniforme p/ à vista e Futuro. **Substitui** o `FECHAMENTO_EXPORTED` do event store da amostra (revisa D33).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D57  | **Número contínuo + espelho int**                                                               | `contractSeq` (Int global, nunca reseta — espelho p/ gerar/ordenar) + `contractNumber` ("NNNN/AA"). Detalha D15.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D58  | **`WASH_OUT` com motivo/data**                                                                  | O status `WASH_OUT` guarda `washoutReason` + `washoutAt`. Refina D45.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D59  | **Acesso ao cadastro (S40)**                                                                    | Criar/editar/listar `Bank`, `Broker`, `ClientBankAccount`, `ClientAttachment` = **qualquer usuário autenticado** (PROSPECTOR excluído pelo gate central). Não restrito a ADMIN/CADASTRO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D60  | **Telas de cadastro (S40)**                                                                     | `Bancos` e `Corretores` numa **página "Cadastros" com abas**; contas bancárias e anexos vivem no **detalhe do Cliente**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D61  | **Venda só pela página Contratos (S55)**                                                        | A venda à vista é feita **exclusivamente** pela página "Contratos" (FAB → seleção de lote → venda → encadeia a Etapa 2). **Removidos do detalhe da amostra** os botões Venda/Perda e o cancelar de movimento — o detalhe vira **histórico só-leitura** (mini-cards Vendido/Perdido/Disponível ficam). A **perda** segue no código (modal LOSS + backend), **sem ponto de criação por ora** (realocar depois). Desfazer venda: **"Quebrar"** (CONFERIR+) ou **"Cancelar"** (EM*ABERTO, novo) na página Contratos. Venda = ação **ADMIN**. *(Supera a "2ª entrada pelo lote" de D41/D43/D50.)\_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D62  | **Criação à vista = wizard de 2 passos (commit adiado)**                                        | A criação à vista pela página vira um **wizard**: **passo 1** ("Registrar venda") **só COLETA** os dados; **passo 2** ("Gerar rascunho") cria a venda + contrato e **emite no fim** (`createSampleMovement` → `emitSaleContract`, sequencial); **"Voltar"** reabre o passo 1 preservando os dados. O número do contrato aparece como **preview** no passo 1 (`getNextContractNumber`, indicativo) e é alocado de verdade só na criação. _(Refina D46/D50/D61. **SUPERSEDIDA pela D69**: o à vista voltou a 1 modal só — o "passo 1"/"Voltar" saiu.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D63  | **PDF não exibe o status do fluxo**                                                             | O documento (contrato) **não mostra** o status (`EM_ABERTO`/`CONFERIR`/…) — é um contrato, não um rastreador de etapa. Removido do cabeçalho, para **todos** os status. _(Revisa o "logo + emissor + status" de S51/S52.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D64  | **"Visualizar" = prévia do PDF + Exportar/Baixar**                                              | Botão **"Visualizar"** (de `CONFERIR` em diante) abre um **modal com o PDF** (iframe, gerado on-demand) com **Exportar** (compartilhar, `shareOrDownloadFile`) · **Baixar** (salvar, download direto) · **Fechar**. **Substitui** os botões "Ver" (form read-only) e "Baixar PDF". _(Refina D32.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D65  | **Ações do card por status + "Washout"**                                                        | `EM_ABERTO` = **Emitir** · Cancelar; `CONFERIR` = **Visualizar · Editar · Confirmar**; `CONFIRMADO` = **Faturado · Pago · Visualizar · Washout**; `FATURADO` = Pago · Visualizar · Desfazer · Washout; `PAGO` = Visualizar · Desfazer · Washout; `WASH_OUT` = Visualizar. **"Quebrar" renomeado p/ "Washout"** (mesmo backend, D45/D58); "Faturar"/"Pagar" → **"Faturado"/"Pago"**. _(Refina D46/D47; "Desfazer" de FATURADO/PAGO mantido. **Revisado pela D96**: sem `CONFERIR`; `EMITIDO` (ex-`CONFIRMADO`) = **Editar · Visualizar · Faturado · Pago · Ágio · Deságio · Washout**.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D66  | **"Editar" edita a fase 1 (resolve P20)**                                                       | O **"Editar"** libera os campos da **fase 1** (data · sacas · preço/saca · corretagens % · corretores) além da fase 2, num bloco "Venda" no modal. No backend o `emitSaleContract` aceita um bloco opcional **`saleFields`** e **sincroniza a venda do lote**: comprador (já), **sacas** e **data** via `SALE_UPDATED` (append-only, ajusta o saldo do lote); preço/corretagens/corretores são do contrato (não há no movimento). **Sacas travadas em liga** (F7.1). **Resolve P20** (mecanismo = `SALE_UPDATED`, não evento novo). _(Implementa D47/D52.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D67  | **Futuro = criação em 1 modal único**                                                           | O contrato **Futuro** (sem lote) é criado num **único modal** (reusa o `SaleContractEtapa2Modal` com o bloco "Venda" visível + Vendedor/Comprador **manuais**), **não** num wizard de 2 passos. Submete tudo de uma vez → `createFutureSaleContract` (fase 1 + comprador, cria `EM_ABERTO`) → `emitSaleContract` (fase 2) → `CONFERIR`. **Sacas livres** (sem saldo/sem trava de liga), **sem nº de lote**; persiste 100% no `SaleContract` (`sampleId`/`movementId` nulos, D51). _(Refina D50/D62 para o Futuro.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D68  | **Washout/Cancelar do Futuro sem lote**                                                         | O Futuro não tem venda/lote: **Washout** (CONFERIR+) marca `WASH_OUT` + motivo direto (**não** cancela venda nem devolve sacas); **Cancelar** (EM*ABERTO órfão de falha) **apaga** o contrato. Texto dos diálogos adaptado (sem "devolve as sacas"). Aproveitou p/ renomear **"Quebrar" → "Washout"** no diálogo (título/botão/motivo/toast). *(Refina D45/D58/D65; o à vista segue cancelando a venda.)\_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D69  | **À vista também em 1 modal (fim do wizard)**                                                   | A criação à vista vira **1 modal só** (como o Futuro, D67), **substituindo o wizard de 2 passos da D62**. O picker de lote abre o `SaleContractEtapa2Modal` no modo `spotCreate`: bloco "Venda" com **sacas ≤ disponível** (liga = 100% travado) + **vendedor pré-preenchido do dono** do lote + comprador manual; submit cria a venda (`createSampleMovement`; **liga sem dono** → o vendedor escolhido vira o dono via `updateRegistration` antes) → `emit` → `CONFERIR`. Mantém a **checagem de viabilidade** da liga; **descarta** o aviso não-bloqueante "participa de liga". **Supersede D62** (sem "Voltar"/passo 1 separado). _(Frontend-only; backend `createSampleMovement`+`emit` inalterado.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D70  | **Espelho de Corretagem = documento derivado**                                                  | 3º documento dos Contratos: **demonstrativo de comissão** gerado a partir de **1** `SaleContract`. **Não** cria `SaleContractType` novo nem tabela/numeração/status próprios — **lê** o contrato. Entra como **3ª opção** do seletor (FAB) da página Contratos, mas **roteia para seleção** (não criação). _(Distingue do à vista/Futuro, que são contratos.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D71  | **On-demand, sem persistência**                                                                 | Seleciona o contrato → gera o **PDF** a partir dos **dados congelados** do contrato. **Sem migration/tabela**; **sem auditoria própria** por ora (pode entrar depois). _(Espelha a entrega on-demand do PDF do contrato, D32/D64.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D72  | **Parte escolhida na geração (CLIENTE + lado)**                                                 | Ao gerar, escolhe-se **Comprador** ou **Vendedor** daquele contrato. **CLIENTE** (topo) = a parte escolhida; **"Valor Comissão"** = a corretagem **desse lado** (`sellerBrokerageValue`/`buyerBrokerageValue`, já gravados, D55). Permite um espelho por lado quando os dois pagam corretagem. **Refino (S61):** o modal só oferece os lados com **corretagem preenchida** (`>0`) — só vendedor → só "Vendedor"; só comprador → só "Comprador"; ambos → os dois (nenhum → _fallback_ aos dois). _(Bate com o exemplo legado: CLIENTE = a Cooperativa vendedora.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D73  | **Contratos elegíveis: CONFIRMADO/FATURADO/PAGO**                                               | Só contratos **congelados** entram no espelho (ambos os tipos, à vista + Futuro). **Exclui** `EM_ABERTO`/`CONFERIR` (ainda mutáveis) e `WASH_OUT` (quebrado). No modo de seleção, os inelegíveis ficam esmaecidos com motivo. **Refino (S61):** além do status, exige **≥1 corretagem preenchida** (`sellerBrokeragePct`/`buyerBrokeragePct` `>0`) — sem corretagem não há comissão a espelhar → inelegível (motivo "Sem corretagem").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D74  | **Conta bancária do emissor no rodapé**                                                         | "DADOS BANCÁRIOS PARA PAGAMENTO" = conta **fixa da SAFRAS** (onde o cliente paga a corretagem): **SICREDI · Agência 0361 · Conta Corrente 83515-3 · CNPJ 23.490.860/0001-56**. Vai no `issuer-config.js` (junto de nome/endereço/CNPJ), com **override por env opcional** (padrão do `CONTRACT_ISSUER_CNPJ`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D75  | **Modal de conferência só-leitura**                                                             | O modal mostra os campos espelhados do contrato **sem edição** (cópia fiel do contrato congelado) → confere → **gera** o PDF (Exportar/Baixar, reusa `shareOrDownloadFile`). Espelho = espelho.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D76  | **Entrada via modo de seleção (padrão "liga")**                                                 | A 3ª opção do FAB coloca `/contratos` em **modo de seleção** (header substituto + chrome oculto, espelhando a liga em `/samples`); **tocar 1 contrato elegível abre o modal direto** (sem contador/seta, pois é **seleção única**) → gerar. _(Refina D50/D65 só para o espelho — não muda os fluxos de contrato.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D77  | **Página "Financeiro" = relatório derivado**                                                    | Nova página, acesso **ADMIN + COMMERCIAL** (mais ampla que `/contratos`, ADMIN-only). Apresenta a **corretagem a receber por fechamento**. **Sem schema novo, sem persistência** — lê `SaleContract` + `SaleContractBroker` + `Broker`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D78  | **Valor a receber = corretagem total (2 lados)**                                                | Por fechamento, valor a receber = `sellerBrokerageValue + buyerBrokerageValue` (as duas pontas). É o que o(s) corretor(es) recebem por aquele contrato.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D79  | **Rateio entre corretores = divisão IGUAL**                                                     | Cota de cada corretor = valor a receber **÷ nº de corretores** do contrato. **Resolve a parte adiada da D34** (rateio). **Não** cria cota por corretor — `SaleContractBroker` inalterado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D80  | **Elegíveis: CONFIRMADO/FATURADO/PAGO**                                                         | Só contratos congelados (corretagem já calculada); exclui `EM_ABERTO`/`CONFERIR`/`WASH_OUT` (mesma régua do Espelho, D73). Contratos **sem corretagem** (total 0) não entram.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D81  | **Só visão calculada (sem controle de pagamento)**                                              | A página **calcula e lista**; **não** marca "pago ao corretor", sem estado/tabela nova. _Consequência:_ total **cumulativo** (um `PAGO` segue como "a receber"). Pagamento ao corretor = **futuro**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D82  | **Escopo por papel**                                                                            | **ADMIN** vê **todos** os elegíveis, com a **quebra por corretor** (nome + cota). **COMMERCIAL** vê **só os fechamentos em que é corretor** (`Broker.userId` = usuário) e **só a própria cota** (não vê o total, os outros corretores nem o valor do negócio). Sem `Broker` vinculado → página vazia. **Revisada pela D86 (S63):** o COMMERCIAL **passa a ver** o valor total + a corretagem total (recolhido/expandido); só os **demais corretores** ficam ocultos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D83  | **Estrutura: lista por fechamento, sem período**                                                | Só a **lista de fechamentos** (ADMIN detalha por corretor; COMMERCIAL só a cota). **Sem agregado por corretor** e **sem filtro de período** (todos os recebíveis). **Total geral** no topo + **busca**. **Refinada pela D84–D86 (S63):** a "lista" é de **cards** (recolhido + expandido).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D84  | **Card recolhido (ADMIN)**                                                                      | Por fechamento: **nº** (`contractNumber`) · **valor total** do negócio (`totalValue`) · **corretagem total a receber** (`sellerBrokerageValue + buyerBrokerageValue`) · **lista de corretores com a cota de cada um** (cota = corretagem total ÷ nº de corretores, D79).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D85  | **Card expandido = só detalhe da corretagem**                                                   | Ao clicar: **repartição do vendedor** (% + R$) e **do comprador** (% + R$). **Sem** dados do negócio (partes/sacas/datas/preço) — foco financeiro.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D86  | **Card do COMMERCIAL (revisa D82)**                                                             | Recolhido = **nº · valor total · só a cota dele** (não vê os outros corretores nem as cotas deles). Expandido = **repartição vend/comp** (% + R$ = corretagem total). O COMMERCIAL **passa a ver** o valor total + a corretagem total do contrato; permanece oculto = os **demais corretores**. Escopo = só os fechamentos em que é corretor (`Broker.userId`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D87  | **Ágio/deságio pós-`CONFIRMADO` (botões no card)**                                              | Além do campo no modal de criação (aplicável até `CONFERIR`, via "Editar"), o card de um contrato **`CONFIRMADO`** ganha **botões "Ágio"/"Deságio"** que aplicam o ajuste e **recalculam o contrato** (ação dedicada `applyAgioSaleContract`). Facilita o ajuste de pesagem/entrega, que costuma ser conhecido **após** a confirmação. _(Revisada na S81/D121: os botões **saem do card** e passam a viver no **modal de Detalhes** — a função `applyAgioSaleContract` é a mesma, muda a porta.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D88  | **Aplicação = substituir o vigente**                                                            | O valor informado **substitui** o ágio/deságio atual (sempre incide sobre o `unitPrice` **cru**); reaplicar **não acumula**. 1 ágio por contrato (reusa as colunas `agioDesagioType`/`agioDesagioValue`). Recalcula `totalValue` + as duas corretagens (`computeContractMoneyWithAgio`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D89  | **Só `CONFIRMADO`; PDF inalterado**                                                             | A ação só aparece em **`CONFIRMADO`** (ao Faturar/Pagar congela). O **PDF do contrato não muda** (segue sem ágio/total); o ajuste reflete no **Financeiro** e no **Espelho** (leem ao vivo). O **status não muda**; gate ADMIN; concorrência otimista por `version`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D90  | **Auditoria `SaleContractAgioLog`**                                                             | Cada aplicação grava **1 linha**: valor aplicado, ágio anterior (`previous*`), total **antes→depois**, `appliedByUserId`/`appliedAt`. Tabela nova (migration `20260630120000`), molde `SaleContractExport`, FK só no SQL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D91  | **Gestão das 3 listas = adicionar inline (opção a)**                                            | Forma/Modalidade/Embalagem ganham **"+ Adicionar"** no próprio dropdown do modal (digitar + ✓/✕ → cria e seleciona o valor, `createContractLookup`); **só adicionar** (renomear/inativar adiado). Endpoint **ADMIN-only** (revisado pela **D94**; era "qualquer autenticado"/D59); disponível em **Criar e Editar**. Reusa o `InlineSelectField`. **Sem migration.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D92  | **Financeiro inclui contratos sem corretagem**                                                  | Removido o filtro `corretagem > 0` do `listBrokerReceivables`: **todos** os fechamentos congelados (`CONFIRMADO/FATURADO/PAGO`) aparecem, inclusive os **sem corretagem** (cota 0) — é o **único lugar onde o total do contrato é exibido** (o PDF não imprime total, D89). **Resolve P24.** Sem migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D93  | **Terminologia: "Washout" em toda a UI**                                                        | Padroniza o status `WASH_OUT` como **"Washout"** em selo, filtro, botão, diálogo e texto do card (antes o selo/filtro diziam "Quebrado"; a ação/diálogo já diziam "Washout"). **Resolve P25.** Só frontend.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D94  | **Criar valor das 3 listas exige ADMIN**                                                        | `createContractLookup` passa a exigir **ADMIN** (`SALE_CONTRACT_MANAGE_ROLES`), alinhado ao gate da gestão de contratos (revisa a abertura "qualquer autenticado" da D91/D59). **Resolve P26.** O `listContractLookups` (read-only) segue disponível a qualquer autenticado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D95  | **Renomear/inativar das listas: adiado**                                                        | Mantém só **"+ Adicionar"** (D91). Editar nome / inativar / reordenar (`sortOrder`) ficam **fora do escopo** por ora (YAGNI); reabrir se surgir necessidade concreta. **Resolve P28** (decisão = adiar).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D96  | **Máquina de status simplificada (remove `CONFERIR`; `CONFIRMADO`→`EMITIDO`)**                  | O passo `CONFERIR` sai: o **"Emitir"** já monta snapshots/total/auditoria/sync do dono, e o **"Confirmar"** era só um flip sem efeito. Novo fluxo **`EM_ABERTO → EMITIDO → FATURADO → PAGO`** (+ `WASH_OUT`). `emitSaleContract` vai **direto a `EMITIDO`** e **aceita re-emitir um `EMITIDO`** (o "Editar" do card — **`EMITIDO` continua editável após emitir**, escolha do usuário Q2). **`confirmSaleContract` + rota `/confirm` + `SaleContractConfirmDialog` removidos.** Enum **renomeado no banco** (Q1; migration `20260701130000` recria o tipo `SaleContractStatus`; tabela `sale_contract`). Ações do card `EMITIDO` = **Editar · Visualizar · Faturado · Pago · Ágio · Deságio · Washout**. A **janela editável** vai **até `EMITIDO` inclusive** (congela ao `FATURADO`) — refina D25/D48. _(Revisa D14/D46/D47/D65/D25/D48; elimina o passo "Confirmar".)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D97  | **Remove o status `EM_ABERTO`; contrato nasce `EMITIDO`**                                       | O rascunho `EM_ABERTO` sai: a criação registra a venda no lote **E** grava o contrato completo numa **única operação atômica** (a etapa 2 já vem no mesmo modal), então o contrato **nasce `EMITIDO`** — nunca passa por um estado intermediário. Enum final **`EMITIDO · FATURADO · PAGO · WASH_OUT`** (migration `20260702120000` recria o tipo `SaleContractStatus`). À vista via **`createSpotSaleContract`** (registra a venda + grava o contrato na MESMA tx do `SALE_CREATED`, sincronizando o dono do lote ao vendedor **antes** da venda); Futuro via **`createFutureSaleContract`** (CRUD direto). `emitSaleContract` vira **só "Editar"** (re-emitir um `EMITIDO`); `createSampleMovement` SALE passa a **exigir** o `saleContractEmitData` (etapa 2 resolvida). **A venda no lote fora da página Contratos já não existe** (`/samples` só registra Perda) — toda venda nasce gerando o contrato. **Escape hatch (Q1)**: como o "Cancelar" do `EM_ABERTO` some, o card `EMITIDO` ganha **"Excluir"** — apaga o contrato + desfaz a venda (restaura as sacas), só enquanto **não faturado** (reusa `cancelSaleContract`); cancelar a venda pelo próprio movimento passa a fazer **WASHOUT** (não apaga — mode `DELETE`                                                                                                                                         | `WASHOUT` explícito no `washoutOrDeleteSaleContractByMovement`). Botão de criação continua **"Emitir"** (Q2). _(Revisa D41/D43/D46/D47/D96; elimina o estado "Em aberto".)_ |
| D98  | **Envio do contrato por e-mail (Fase H · D98–D103) — DESCARTADO (2026-07-08)**                  | Ideia desenhada na S71 (anexar o PDF do contrato e enviar ao cliente; reusava a infra de e-mail `AppEmailService`/SMTP + `renderContractPdf` Buffer; tabela `SaleContractEmailLog`; rota `POST /sale-contracts/[id]/send-email` ADMIN) e **descartada a pedido do Flavio (2026-07-08)** — **nunca teve código**. Removidos a seção de desenho, a Fase H do roadmap e as referências cruzadas; a **infra base de e-mail** (reset de senha, fluxos de usuário) permanece intacta.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D104 | **"Excluir" removido — Washout é a única quebra**                                               | Reverte a parte "Excluir" do D97/Q1 (a pedido do usuário, pra simplificar). Um contrato criado por engano é desfeito **via Washout** (marca `WASH_OUT` + motivo, desfaz a venda, devolve as sacas). **Melhor pra auditoria e numeração**: o contrato **nunca é apagado** e o número **fica registrado** (sem buraco na sequência). Removidos: `cancelSaleContract` (service + handler + rota `/cancel` + api-client), o `mode` DELETE/WASHOUT (`washoutOrDeleteSaleContractByMovement` → `washoutSaleContractByMovement`, só washout), o botão "Excluir" do card e a ação `cancel` do `SaleContractLifecycleDialog`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D105 | **Washout ainda paga corretagem**                                                               | O corretor **fez a negociação**, então recebe a comissão **mesmo com washout**. Um contrato em `WASH_OUT` **continua no Financeiro** (`listBrokerReceivables` passa a incluir `WASH_OUT`; selo vermelho "Washout" no `FinanceiroCard`) **e elegível ao Espelho de Corretagem** (`ELIGIBLE_STATUSES`/`ESPELHO_ELIGIBLE` incluem `WASH_OUT`). _(Revisa D92 — elegibilidade do Financeiro; D71 — do Espelho.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D106 | **Pagamento só após faturamento**                                                               | Na comercialização o pagamento vem sempre **depois** do faturamento. `paySaleContract` passa a aceitar **só `FATURADO`** (removido o `EMITIDO`); o card **perde o "Pago" no Emitido** (de Emitido só dá pra "Faturado"). O ciclo vira **linear** `EMITIDO → FATURADO → PAGO` — o "pular faturamento" some (revisa S49). `resolveRevertTarget` simplifica: `PAGO → FATURADO` sempre (sem o desvio por `invoicedAt`). _(S81/D122: o **Desfazer foi REMOVIDO** — `resolveRevertTarget` e o ciclo reverso deixam de existir.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D107 | **Aprovação (etiqueta) → marco auditado no contrato (S73 — só registro; implementação adiada)** | A "Etiqueta de Aprovação" (hoje avulsa no leque "+" do /samples, `customPrintJob` livre, **sem ator nem vínculo**) passa a ser, no futuro, uma **ação do card do contrato pós-emissão**. Decidido: aprovação **sempre após emitir**, **escopo do contrato**, **marco físico auditado no contrato** (não muda o status — é ortogonal a `EMITIDO/FATURADO/PAGO`); os **lotes da etiqueta são EXTERNOS** (não o lote interno) → seguem **digitados à mão**; os outros 5 campos (compra/fechamento/produtor/armazém/sacas) vêm do contrato. Auditoria = **tabela-satélite** nova (ex.: `SaleContractApproval`: contrato + quem + quando + payload/lotes + ref do print job), no molde de `SaleContractExport`/`SaleContractAgioLog`; **reusa o pipeline `customPrintJob`** pra imprimir. **A etiqueta avulsa atual é MANTIDA por ora**; a implementação robusta fica pra depois (**Fase I**; Q1–Q5 **resolvidas na S75 → D112–D114** — ver seção "Aprovação do contrato").                                                                                                                                                                                                                                                                                                                                                                                                   |
| D108 | **Detalhes do contrato = MODAL (não página); card mantém o acordeão + botão "Detalhes"**        | A ideia de uma "página de detalhes do contrato" (no molde do detalhe do lote) é **substituída por um MODAL** (S74). O **card mantém a versão estendida** (acordeão) com os **botões das ações principais por status** + um novo botão **"Detalhes"** que abre um **modal grande** (padrão do modal de emissão — largo, centralizado na área de conteúdo, altura conforme o conteúdo) com o **resto das informações** do contrato (read-only: partes completas c/ CNPJ/IE/endereço, banco, armazéns, forma/modalidade/embalagem, datas, quantidades/preço/total/ágio, corretores/corretagem, nº compra/peso, observação/descrição). É onde no futuro vive o **timeline de auditoria** da D107 (emissões de PDF, ágio, aprovações). **Ações principais no card por status**: `EMITIDO` = Ágio · Deságio · Washout · Faturar · Detalhes; `FATURADO` = Pagar · Washout · Detalhes; `PAGO` = Washout · Detalhes; `WASH_OUT` = Detalhes. **Aberto**: onde ficam **Editar / Visualizar (PDF) / Desfazer** — proposta = movê-los pro modal, **a confirmar**. _(Parte da P27 / Fase G; substitui a menção à "página de detalhes".)_ _(Resolvido na S81: a **D121** define o card ENXUTO — as "ações principais" listadas acima foram substituídas (Ágio/Deságio/Washout também migram pro modal) — e a **D122 REMOVE o Desfazer**; desenho completo do modal nas **D120–D125**.)_ |
| D109 | **Espelho — refinamentos do audit (S74)**                                                       | Audit multiagente do fluxo do Espelho — núcleo **sólido** (ágio lido ao vivo, WASH_OUT elegível ponta a ponta D105, `side` validado e CLIENTE do topo sempre casando). Ajustes decididos: **(1) exige corretagem** — o espelho é documento de corretagem, então o backend rejeita (`409 ESPELHO_NO_BROKERAGE`) o lado **sem** comissão, batendo com o front (que já esmaece "Sem corretagem") e defendendo a chamada direta ao endpoint; **corrige** a nota antiga de que "0-comissão é válido". **(2) re-busca no modal** — o `EspelhoCorretagemModal` re-busca o contrato **fresco** (`getSaleContract`) ao abrir, pro resumo (Cliente/Comissão) casar com o PDF (sem valor **stale** se outro ADMIN aplicou ágio). **Abertos (registrados, NÃO corrigidos)**: coluna "Comprador/Vendedor" repete o CLIENTE, não a contraparte (pergunta da D72); a **% de corretagem não é impressa** (não dá pra reconciliar o valor); ágio ausente imprime "Valor: 0,00" (devia ficar vazio); **sem auditoria** de geração do espelho (D71 — candidato a `SaleContractEspelhoExport` com side/ator/quando — **resolvida na S81/D124**, nome proposto `SaleContractEspelhoLog`); fechar o modal **mantém o modo-seleção** (saída em 2 passos); "Baixar" sem guarda de duplo-clique + troca de lado sem AbortSignal + sem toast de sucesso.                                           |
| D110 | **COMMERCIAL gerencia os próprios contratos (revoga "ADMIN-only")**                             | **Revoga** _"Gestão de Contratos = ADMIN-only"_ (2026-06-28): acesso/gestão dos contratos passa a **ADMIN + COMMERCIAL**, com o COMMERCIAL restrito aos contratos **em que é corretor** (`SaleContractBroker` → `Broker.userId`, mesmo modelo do Financeiro). Novo gate `SALE_CONTRACT_ACCESS_ROLES` + helpers `_resolveOwnBrokerId`/`_assertActorMayAccessContract` (403 se não for corretor; roda **antes** do `findUnique` → não vaza existência ao COMMERCIAL; ADMIN pula a checagem). **Fase 1 IMPLEMENTADA (S74)**: COMMERCIAL **lê** os contratos dele + gera **Espelho/PDF** (`listSaleContracts` filtra; `getSaleContract`/espelho/pdf autorizam por posse) + `/contratos` **role-adaptive** (COMMERCIAL vê só-leitura + Espelho; ações de gestão escondidas; FAB vira gatilho direto do espelho; nav "Contratos" liberado). **Fase 2 (a fazer)**: mutações (criar/editar/faturar/pagar/reverter/washout/ágio) liberadas ao COMMERCIAL nos contratos dele — a **criação** exige o próprio corretor entre os corretores. _(Origem: refino do Espelho, fix #3.)_                                                                                                                                                                                                                                                                                                  |
| D111 | **PDF do contrato — refinamentos de layout (S74)**                                              | Ajustes visuais no PDF do contrato (`sale-contract-pdf-service.js`), mantendo **página única** e a geração **on-demand** (D32): **logo** ampliado à altura do bloco do emissor; **linha de identificação** justificada de borda a borda, com o **Nº Compra colado ao Nº Contrato** e o miolo reservado ao valor da compra (que pode ser grande); **cabeçalhos dos cards** de partes/armazéns **centralizados sobre faixa cinza** (mesmo formato das caixas Forma/Modalidade); **Banco do vendedor** **sem "Titular"**, em **grid 3×2** proporcional (Banco+CNPJ · Agência+Conta · Chave PIX), com a **Chave PIX longa quebrando em 2 linhas** (ocupa a célula vazia abaixo, sem truncar); **valores em CAIXA ALTA** — **exceto a Chave PIX**, que **preserva o caso original** (chaves são copiadas/transcritas); **Observação/Descrição** com **fonte adaptativa** (8 pt padrão; encolhe só o necessário pra caber sem truncar, em vez de cortar). _(Parte da P27 / Fase G — só refino visual, sem mudança de dados/fluxo; `scripts/preview-contract.mjs` para conferir.)_                                                                                                                                                                                                                                                                                              |
| D112 | **Aprovação — fluxo fechado (S75; resolve Q1–Q5 da D107)**                                      | Todo **ENVIO** de aprovação é **auditado**, **1:N** (pode reenviar; cada envio = 1 registro); o **desfecho** (cliente aprovou/recusou) fica **FORA do sistema** — não é auditado e **sem selo** no card (aparece **só no histórico** = timeline do modal de Detalhes, D108). Os **5 campos vindos do contrato** abrem **pré-preenchidos e EDITÁVEIS**; os **lotes** são pré-preenchidos do **`originLot`** ("Lote de origem") da amostra quando existir (revisa o "digitados à mão" da D107; **formatos divergem** — `originLot` = texto livre único ≤100 chars vs. etiqueta = até 16 campos discretos de 16 chars — a quebra fica pra análise **campo a campo** (fechada na S76 → D116); sem `originLot` — Futuro sem amostra, liga = `null`, campo vazio — os lotes começam vazios). **Quem pode**: **todos exceto PROSPECTOR** (= gate atual do modal avulso). **Status que permitem enviar**: `EMITIDO`/`FATURADO`/`PAGO` (**WASH_OUT fora** — negócio quebrado não manda amostra de aprovação). **Ação no card** = **mais um botão no acordeão** nos status permitidos (soma às ações da D108).                                                                                                                                                                                                                                                                     |
| D113 | **Aprovação — entrada dupla: card do contrato + `/samples` com seletor reduzido e "Manual"**    | Duas portas, mesmo destino (modal da etiqueta → imprime + audita): **(a) `/contratos`** — botão no acordeão do card (contrato já escolhido); **(b) `/samples`** (leque "+" → "Aprovação") — abre um **modal de seleção de contratos** mostrando **TODOS os contratos a TODOS os papéis não-PROSPECTOR**, com **informações reduzidas** (nº do contrato + comprador + data + sacas + **busca**; **sem valores financeiros**) → tocar um contrato abre o modal pré-preenchido. Exige **endpoint próprio de listagem reduzida** (gate não-PROSPECTOR; view enxuta montada no **backend**, não a view completa filtrada no front). _Consequência consciente_: por essa porta o **COMMERCIAL etiqueta contratos de outros** (constrói a etiqueta sem ver os detalhes — exceção deliberada à posse da D110). No **canto superior direito** do seletor, o botão **"Manual"** pula pro modal **em branco** — a **etiqueta 100% manual sobrevive só por aí** (absorve o modal avulso atual do `/samples`) e passa a ser **auditada também** (D114).                                                                                                                                                                                                                                                                                                                               |
| D114 | **Aprovação — auditoria = tabela ÚNICA com vínculo OPCIONAL (sem coluna booleana)**             | **Uma tabela** pra todos os envios, vinculados e avulsos (sugestão do Flavio confirmada na análise; alternativas descartadas: 2 tabelas = estrutura duplicada + 2 consultas pra visão unificada; event store = não serve, avulsa/Futuro não têm amostra). **Ajuste sobre a sugestão**: **sem** a coluna "é avulso" — `saleContractId` **NULO já significa avulsa** (booleana separada duplicaria o dado derivável e abriria o estado inconsistente `avulsa=não` sem contrato). Colunas: `saleContractId?` (nulo = avulsa) + `actorUserId` + `createdAt` + **`payload` = as linhas exatamente como IMPRESSAS** (valores finais pós-edição — audita-se o que saiu na impressora; os valores originais já estão no contrato) + **`customPrintJobId`** (o DONE/FAILED fica no job — audita-se o **envio**). **Nome proposto**: **`ApprovalLabelLog`** (`approval_label_log`) no lugar de `SaleContractApproval` (com linhas sem contrato, deixou de ser satélite puro do contrato) — **a confirmar na implementação**. **Avulsas não aparecem em tela nenhuma por ora** (registro consultável); as vinculadas alimentam o timeline do Detalhes (D108).                                                                                                                                                                                                                       |
| D115 | **Aprovação — mapeamento campo a campo da etiqueta (S76)**                                      | Os 5 campos de valor único puxam **DIRETO do contrato**, todos **editáveis** (D112) e cortados no limite físico do campo quando maiores: **Nº compra** ← `purchaseNumber` (opcional → vazio; corta em 26 — >26 é irreal na prática, sem aviso); **Nº fechamento** ← `contractNumber` ("NNNN/AA", 7 chars sem espaços — folga no limite 36); **Produtor** ← `sellerSnapshot.displayName` (sempre existe pós-D97; PF = nome completo / PJ = razão social; corta em 52); **Armazém** ← **SEMPRE** `sellerWarehouseSnapshot.displayName` (**o do VENDEDOR**, nunca o do comprador; opcional → vazio se ausente; corta em 52); **Sacas** ← `quantitySacks` (inteiro, direto). **Prefill montado no BACKEND**: endpoint próprio (gate não-PROSPECTOR) devolve os 5 campos + os lotes já quebrados (D116) — 1 consulta ao contrato + (à vista) 1 busca da amostra; **mesma regra pras 2 portas** (card do contrato e seletor do `/samples`).                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D116 | **Aprovação — regra de quebra do "Lote de origem" nos campos de lote**                          | **Lotes** ← `Sample.declaredOriginLot` (via `sampleId` do contrato; entrada `originLot`, texto livre ≤100 chars) quebrado automaticamente em campos discretos: **separadores = traço, espaço, vírgula e ponto-e-vírgula** (sequências colapsam; pedaços vazios descartados); **barra (`/`) NÃO separa** — pode ser composição do lote. Pedaço **>16 chars → corta em 16** (editável); **>16 pedaços → preenche os 16 primeiros** (`MAX_LOTS`, teto físico da etiqueta espelhado no backend). O **texto original** aparece no modal (só leitura) como **referência** pra conferir/corrigir a quebra. Sem fonte — **Futuro** (sem amostra), **liga** (`declaredOriginLot` nulo por design) ou campo não preenchido — os lotes começam **vazios**. _Vírgula como separador também resolve o limite físico do pipeline: o `splitLots` do print agent (`print-agent/label.js`) divide a linha LOTE por vírgula (e o campo do modal já bloqueia digitá-la) — vírgula dentro de lote nunca seria imprimível; a 1ª rodada ("só traço e espaço") foi revisada pelo Flavio ao ver esse limite._                                                                                                                                                                                                                                                                                    |
| D117 | **Aprovação — fluxo de UI das duas portas (S77)**                                               | **Seletor de contratos** (porta `/samples`): lista **SÓ os elegíveis** (`EMITIDO`/`FATURADO`/`PAGO` — WASH*OUT **nem aparece**, nem desabilitado), **todos os contratos** na sequência do **mais recente primeiro**, com **campo de busca**; botão **"Manual"** no canto superior direito (D113). **Navegação**: o formulário aberto pelo seletor tem botão **"Voltar"** → retorna ao seletor (contrato errado não obriga a recomeçar). **Responsividade dos modais** (seletor + formulário da etiqueta): **desktop = modais CENTRAIS** (padrão do modal de emissão); **mobile = bottom sheet** saindo de baixo (padrão `NewSampleModal`). \_Nota: o Flavio citou "como o modal de criação de contrato" — CORRIGIDA na S80: esse modal usa `BottomSheet` (sheet no mobile, central no desktop via CSS ≥901px), a referência estava CERTA e o requisito saiu de graça reusando o BottomSheet (a versão anterior desta nota dizia "central também no mobile", errado).* **Botão no card** (porta `/contratos`): rótulo **"Aprovação"** ("Aprovar" descartado — soaria como mudança de status, e a D112 fixa que não é), nos status permitidos, abrindo **direto** o formulário pré-preenchido (sem seletor). **Sucesso** = padrão atual mantido (check animado + auto-close, "deve sair na impressora").                                                                   |
| D118 | **Aprovação — histórico e detalhes finais de funcionamento (S78)**                              | **Linha do histórico** (timeline do modal de Detalhes, D108): **"há X tempo"** (tempo relativo) + **quem enviou** + **nº do contrato** + o aviso **"Aprovação enviada"** — a linha resumida **basta**, sem drill-down do payload na UI (as linhas impressas ficam guardadas na auditoria, D114). **Resultado da impressão NÃO é exposto** no histórico — audita-se o **envio**; falha de impressora se resolve reimprimindo (cada reenvio é auditado; o check de sucesso segue significando "enfileirado"). **Item do seletor** ganha o **selo de status** (Emitido/Faturado/Pago), junto de nº + comprador + data + sacas (segue sem valores financeiros). **Cópias = 1 por envio** (padrão atual; mais vias = reenviar). **Validação mantida**: "**ao menos um campo preenchido**" pra imprimir — nenhum campo individualmente obrigatório (com o prefill, quase sempre satisfeita).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D119 | **Aprovação — Fase I em fases (auditoria primeiro) + histórico só no Detalhes, sem nº (S79)**   | **(1) Fase I dividida em fases**: a implementação inicial **grava a auditoria completa desde o 1º dia** (write-only — todo envio fica registrado no banco, ainda sem tela de leitura); o **modal de Detalhes (D108) com o timeline** é construído **depois**, em fase posterior. **(2) Histórico SÓ no modal de Detalhes** do contrato — **não haverá visão geral** de aprovações fora do contrato; com isso a linha do histórico **perde o nº do contrato** (**revisa D118**): formato final = **"há X tempo" + quem enviou + "Aprovação enviada"**. **(3)** Tempo relativo com a **data/hora exata como apoio** (texto menor ou ao tocar na linha) — confirmado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D120 | **Modal de Detalhes — conteúdo, layout e visibilidade (S81)**                                   | Molde do **modal de emissão** (`BottomSheet` `.ctr-contract-sheet`: largo ~1180px **centralizado na área de conteúdo** no desktop ≥901px; **bottom sheet de coluna única no mobile**). **Header** = nº do contrato + selo de status + tipo. Corpo **read-only** em **2 colunas de seções** no desktop: Identificação (nº compra, peso, data do contrato, datas planejadas E reais `invoicedAt`/`paidAt`) · **Vendedor e Comprador completos** (CNPJ/CPF, IE, endereço, filial) · **Banco do vendedor** (banco/COMPE, agência, conta, titular, PIX) · **Armazéns** (comprador + vendedor) · Pagamento/logística (condição, forma, modalidade, embalagem) · **Valores + corretagem** (sacas, preço/saca, ágio/deságio, total, corretagens % e R$, **corretores**) · Observação/Descrição. **Histórico (timeline, D125) fecha o modal em largura total**; botões de ação no rodapé (D121). Botão **"Detalhes"** presente em TODOS os status. **Sem backend novo pro read-only** (`getSaleContract` já devolve tudo + brokers). **COMMERCIAL vê TUDO** nos contratos dele — inclusive os outros corretores e as corretagens dos 2 lados (coerente com a D110; a restrição da D86 segue valendo SÓ no Financeiro). _(Layout revisado na S82/D126: o **PDF do contrato entra EMBUTIDO** — documento na coluna esquerda, seções empilhadas na direita.)_                        |
| D121 | **Card ENXUTO — divisão dos botões card×modal (revisa D87; fecha o aberto da D108)**            | **CARD**: `EMITIDO` = Faturado · Aprovação · Detalhes; `FATURADO` = Pago · Aprovação · Detalhes; `PAGO` = Aprovação · Detalhes; `WASH_OUT` = Detalhes. **MODAL**: `EMITIDO` = Editar · Visualizar · Ágio · Deságio · Washout; `FATURADO`/`PAGO` = Visualizar · Washout; `WASH_OUT` = Visualizar. Os botões de **Ágio/Deságio saem do card** (revisa a D87 — a função é a mesma, muda a porta); Washout/Editar/Visualizar também migram. O card fica só com o **dia a dia**: avançar status + Aprovação + Detalhes. _(Revisada na S82/D126: o **"Visualizar" sai também do rodapé do modal** — o documento fica embutido no Detalhes, com Exportar/Baixar na própria seção do preview.)_ _(S89/D137: o **"Pago" do `FATURADO` migrou pro Financeiro** — o card `FATURADO` fica Aprovação·Detalhes; o "Faturar" do `EMITIDO` permanece.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D122 | **"Desfazer" REMOVIDO do sistema (revisa D106/S49)**                                            | Some o botão (card e modal) e o backend (`revertSaleContractStatus` + rota `/revert` + a ação no `SaleContractLifecycleDialog` + `resolveRevertTarget`), no molde das remoções do Confirmar (D96) e do Excluir (D104). Ciclo definitivo **só pra frente**: `EMITIDO → FATURADO → PAGO` (+ Washout a qualquer momento). Engano em Faturar/Pagar **não tem mais correção pelo app** (só o Washout, que é definitivo). _(Decisão do Flavio na S81: "não temos mais o botão de desfazer".)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D123 | **Auditoria de MARCOS DE STATUS — Faturar/Pagar/Washout gravam quem + quando (S81)**            | Tabela-satélite ÚNICA nova (nome proposto **`SaleContractStatusLog`** / `sale_contract_status_log`, molde `SaleContractAgioLog`: `saleContractId` + ação/`toStatus` + `actorUserId` + `createdAt`; no washout também o **motivo**; FKs só no SQL; migration nova — nomes a confirmar na implementação), gravada em **Faturar, Pagar e Washout** (o Flavio pediu o washout; os 3 na mesma tabela têm custo idêntico e completam o timeline). Vale pros **dois tipos** (cobre o buraco do washout de Futuro, que não tinha ator). **Marcos antigos** (pré-tabela) aparecem no timeline **só com a data** (`invoicedAt`/`paidAt`/`washoutAt`), sem autor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D124 | **Espelho de Corretagem AUDITADO (resolve a D71 / pendência da D109)**                          | A geração do Espelho passa a gravar auditoria própria (nome proposto **`SaleContractEspelhoLog`**: contrato + `side` comprador/vendedor + ator + quando), gravada no `exportEspelhoPdf`, com linha no timeline ("Espelho gerado — Vendedor"). **Download do PDF do contrato segue SEM rastro** (adiado de propósito).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D125 | **Timeline — composição da v1 (S81)**                                                           | Fontes agregadas em **ordem decrescente**: **criação e edições** (`SaleContractExport`) · **ágio/deságio** (`SaleContractAgioLog`, com o valor aplicado) · **aprovações** (`ApprovalLabelLog`, formato D118/D119: "há X tempo" + quem + "Aprovação enviada") · **marcos de status** (D123; antigos só com data) · **espelho** (D124). Toda linha = **"há X tempo" + quem + o quê**, com **data/hora exata como apoio** (D119); **sem drill-down** de payload. Reusa o helper `formatRelativeTime` (`lib/dashboard-activity.ts` — ajustar "ha"→"há" ou criar variante; _renomeado pra `lib/relative-time.ts` em 2026-07-07, revisão DSH_). Precisa de **endpoint agregador novo** (join dos logs + nomes via `app_user` — as satélites não têm `@relation`). Aprovações **avulsas ficam de fora** por natureza (filtro por `saleContractId`). Downloads de PDF: fora da v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D126 | **Detalhes — o CONTRATO (PDF) embutido no modal (S82; revisa D120/D121)**                       | O documento do contrato entra **DENTRO do modal de Detalhes** como **pré-visualização embutida** (o mesmo preview on-demand do modal "Visualizar"/D64, via rota `/pdf`, D63 — sem armazenar). **Layout revisado**: desktop = **PDF na coluna ESQUERDA** (rolável) e as seções read-only empilhadas na **DIREITA**; o Histórico segue em **largura total** no fim; o tamanho é o **frame grande do modal de criação** (~1180px / 88dvh — reforçado pelo Flavio: "o modal terá de ser grande, assim como o modal de criação de contrato"). Mobile = o documento é a **primeira seção** do sheet (preview em altura contida, rolável), seguido das seções e do Histórico. **"Visualizar" SAI do rodapé** (ficou redundante com o PDF à vista): as ações do documento (**Exportar/Baixar**) acompanham a **própria seção do preview**, em todos os status; o rodapé fica só com a gestão (`EMITIDO` = Editar · Ágio · Deságio · Washout; `FATURADO`/`PAGO` = Washout; `WASH_OUT` = sem ações no rodapé). **Proposta decorrente (a confirmar na Fase J)**: **aposentar o `SaleContractDocumentModal`** ("Visualizar") — absorvido pelo Detalhes; depois da D121 nada mais o abriria.                                                                                                                                                                                          |

> **Representação monetária (padrão de implementação)**: R$ como `Decimal(12,2)`, percentuais
> `Decimal(5,2)`, peso (Kg) `Decimal(10,2)`. Confirmar na Fase B.

---

## Impacto no sistema — extensões do cadastro de Cliente

O Fechamento **puxa dados de cliente** para o contrato (congelados via snapshot — D25). **Esta seção
vai crescer** conforme novas extensões aparecerem.

1. **Dados bancários (D24/D28) — exige modelagem nova.** Tabela `Bank` (cadastrável pelo admin: nome + **código COMPE** + status, D39) +
   `ClientBankAccount` por cliente (banco + agência + conta c/ dígito + titular + CNPJ/CPF + chave PIX). UI nova no
   cadastro de Cliente. No contrato, "Banco do Vendedor" = escolher uma conta do vendedor → snapshot.
   **Única extensão que é pré-requisito do contrato.**
2. **Armazéns (D26) — já resolvido, sem extensão nova.** Armazém é um `Client` com `isWarehouse`. No
   contrato, "Armazém do Comprador/Vendedor" = selecionar um cliente-armazém (livre) → snapshot.
3. **Anexos/documentos do cliente (D27) — independente do contrato.** `ClientAttachment` (lista livre +
   descrição), **PDF + imagens**, reusando a infra de upload (+ `application/pdf` no allowlist; atualizar
   a regra de segurança). **Só arquivamento** — não vai pro PDF do Fechamento; construível à parte.
4. **Data de nascimento (D36) — só cadastro.** Coluna `Client.birthDate`, **só para PF**, opcional; não
   entra no contrato. Mudança simples (sem tabela nova).
5. **Futuras.** Outras informações de cliente devem surgir ao longo da construção; entram aqui.

---

## Contrato legado — inventário de campos (alvo do v1)

Fonte: print do "Contrato de Compra e Venda de Café" (Sessão 2). Marcadores: ✅ existe · ⚠️ novo · ❓ esclarecer.

### Cabeçalho / identificação

- ⚠️ **Número do Contrato** — automático sequencial contínuo + `/AA`, não editável (D15).
- ⚠️ **Status do Contrato** — enum manual `EM_ABERTO/CONFERIR/CONFIRMADO/FATURADO/PAGO/WASH_OUT` (D14/D45).
- ⚠️ **Tipo de contrato** — `Mercado à vista / Futuro` (CPR removido), enum fixo; define o fluxo (D42). Ambos geram o Fechamento.
- ✅ **Data do Contrato** — ≈ `movementDate`. · ⚠️ **Número de Compra** — campo livre (D16). · ⚠️ **Mês/Ano** — derivados da Data do Contrato, impressos (Mês por extenso, Ano 4 díg).
- ✅ **Número do Lote** — `internalLotNumber`.

### Partes

- ✅ **Comprador** — comprador da venda (snapshot), automático (D12).
- ✅ **Vendedor** — dono do lote (`ownerClient`), automático e editável; snapshot (D12).
- ⚠️ **Corretor(es)** — N por contrato via `SaleContractBroker` → cadastro `Broker` (nome + `userId` opcional p/ métrica + status); figuram no contrato (D13/D34).
- ⚠️ **Banco do Vendedor** — conta do vendedor (`ClientBankAccount`: banco+agência+conta+titular+CNPJ/CPF+PIX), snapshot (D24/D28).

### Armazéns

- ✅ **Armazém do Comprador** · ✅ **Armazém do Vendedor** — cliente-armazém (`isWarehouse`) via lookup, snapshot (D26).

### Quantidade & valores (modelo financeiro — D17/D18/D19)

- ✅ **Quantidade** — sacas inteiras da venda (`quantitySacks`), reusada (D17).
- ⚠️ **Peso (Kg)** — campo decimal separado (D17) · ⚠️ **Preço por Saca** (R$).
- _Valor total_ — calculado: `preço × sacas` ± ágio/deságio (D18).
- ⚠️ **Ágio / Deságio** (tipo + valor %/R$, D18) · ⚠️ **Corretagem do Vendedor / do Comprador** (só %, separados, D19/D44).

### Pagamento & logística

- **Condição de Pagamento** (texto livre) · **Forma de Pagamento** {Faturado/Livre} · **Modalidade** {Retirar/Posto/Disponível} · **Embalagem** {Sacaria/Bags/A granel} — impressos (D20/B8).
- ⚠️ **Data Faturamento** · ⚠️ **Data Pagamento**.

### Assinaturas & observações

- ⚠️ **Assinaturas** — corretor/empresa = **imagem fixa do dono** (auto, D35); comprador e vendedor = **linhas em branco** (à mão).
- ⚠️ **2 blocos de texto livre** (opcionais): **Observações** e **Descrição** — sem cláusulas fixas (D30).

---

## Blocos do Fechamento (estrutura para revisão campo a campo — P2)

Organização dos campos do contrato em **blocos**, para conferir **campo a campo** (origem
automática vs. manual, obrigatório/opcional, validação) e checar se **falta algum campo**. Resolve a
**P2** e guia o **formulário** (modal de Venda, D9) e o **layout do PDF** (Fase C). O comportamento de
cada campo é anotado conforme revisamos.

### B1 — Identificação do contrato ✅

- **Número do Contrato** — auto, sequencial `NNNN/AA`, gerado ao salvar, não editável (D15)
- **Status do Contrato** — manual, default `EM_ABERTO`; `EM_ABERTO/CONFERIR/CONFIRMADO/FATURADO/PAGO` + **`WASH_OUT`** (quebra, D45); `EM_ABERTO` = incompleto → **Emitir** → `CONFERIR` → **Confirmar** → `CONFIRMADO` (D14/D46/D47)
- **Tipo de contrato** — `Mercado à vista / Futuro` (CPR removido, S37), **enum fixo** (não cadastrável); escolhido ao criar e define o fluxo. **Ambos geram o Fechamento** (D42, substitui D37). **NÃO é impresso no documento (S51)** — fica só na gestão/listagem.
- **Data do Contrato** — default = data da venda (`movementDate`), **editável**
- **Número de Compra** — manual, livre, **opcional** (D16)
- **Número do Lote** — `internalLotNumber` da amostra (auto, não editável)
- **Mês / Ano** — **derivados automaticamente** da Data do Contrato, **impressos** no documento: **Mês por extenso** (maio, junho…) e **Ano com 4 dígitos** (2026…). Não preenchidos (reativa o que a S16 havia removido)

### B2 — Comprador ✅ campos _(funcionalidades específicas depois)_

- **Comprador** — Cliente da venda (D12), snapshot congelado.
- **Campos exibidos no contrato (S51)**, nesta ordem: **Nome · CNPJ · IE · Endereço · Bairro · Cidade/UF · Número · CEP**. **Sem rótulo "Filial".**
- **Consolidação PJ×PF (S51)**: cada campo vem do `Client`; se vazio (caso **PF**), cai na **fazenda** (`ClientUnit`) escolhida. Em PF, **CNPJ + IE são os da fazenda** (não exibe o CPF da pessoa).
- **"Número" (S51)**: não há campo próprio no cadastro — o número fica dentro de "Endereço"; a linha "Número" aparece **sempre presente, porém vazia (—)** até criarmos o campo.
- **Campo sempre presente (S51)**: todos os campos aparecem **mesmo vazios** (— quando sem dado) — vale para o **documento inteiro**.
- **Telefone e e-mail NÃO entram** no contrato (existem no snapshot, mas não são impressos).
- _Comportamento específico (editável? etc.) — a definir depois._

### B3 — Armazém do comprador ✅ campos

- **Armazém do comprador** — lookup **amplo** (todos os clientes); selecionar não-armazém **liga `isWarehouse`** (D26/D49), snapshot. **Opcional.**
- **Campos exibidos = os mesmos do comprador (S51, ver B2)**: Nome · CNPJ · IE · Endereço · Bairro · Cidade/UF · Número(—) · CEP (sem telefone/e-mail). _(Armazém PF: endereço viria da fazenda, mas o snapshot do armazém é só do Client — limitação anotada, armazéns costumam ser PJ.)_
- _Comportamento específico (obrigatório? editável?) — depois._

### B4 — Vendedor ✅ campos

- **Vendedor** — `ownerClient` do lote (D12), snapshot.
- **Campos exibidos = os mesmos do comprador (S51, ver B2)**: Nome · CNPJ · IE · Endereço · Bairro · Cidade/UF · Número(—) · CEP (sem telefone/e-mail). _(Armazém PF: endereço viria da fazenda, mas o snapshot do armazém é só do Client — limitação anotada, armazéns costumam ser PJ.)_
- _Comportamento específico (editável conforme D12, etc.) — depois._

### B5 — Armazém do vendedor ✅ campos

- **Armazém do vendedor** — lookup **amplo** (todos os clientes); selecionar não-armazém **liga `isWarehouse`** (D26/D49), snapshot. **Opcional.**
- **Campos exibidos = os mesmos do comprador (S51, ver B2)**: Nome · CNPJ · IE · Endereço · Bairro · Cidade/UF · Número(—) · CEP (sem telefone/e-mail). _(Armazém PF: endereço viria da fazenda, mas o snapshot do armazém é só do Client — limitação anotada, armazéns costumam ser PJ.)_
- _Comportamento específico — depois._

### B6 — Corretagem ✅ campos

- **Corretor(es)** — N via `Broker` / `SaleContractBroker` (D34, métrica). **NÃO impressos no contrato** (ficam só como registro/métrica).
- **Corretagem do vendedor** — **entrada só em %**; impressa só a % (D44).
- **Corretagem do comprador** — **entrada só em %**, **separada** da do vendedor; impressa só a % (D44).
- _Capturadas na **etapa 1** (venda), junto com os corretores (D43). Entrada **só %**: resolvido (D44)._

### B7 — Negócio: quantidade & valores ✅ campos

- **Quantidade (sacas)** — da venda (`quantitySacks`, D17) — **impresso**
- **Peso (Kg)** — manual, **opcional**, `Decimal(10,2)` (D17) — **impresso**
- **Preço por saca** — manual, R$ — **impresso**
- **Ágio / Deságio** — **não no formulário**; aplicado por **botões no card** (a detalhar — P21). Ajusta o total (D18)
- **Valor total** — calculado `preço × sacas` ± ágio/deságio; **calculado e salvo, não exibido** (local a decidir — P22) (D18)
- ✅ **Resolvido (D44)**: a entrada da corretagem é **só em %** (vendedor e comprador separados).

### B8 — Pagamento & logística ✅

- **Condição de Pagamento** — **campo livre (texto)**, **impresso**. _(não é lista — sai da D20)_
- **Forma de Pagamento** — lista **{Faturado, Livre}**, **impresso**.
- **Modalidade** — lista **{Retirar, Posto, Disponível}**, **impresso**.
- **Embalagem** — lista **{Sacaria, Bags, A granel}**, **impresso**.
- **Data de Faturamento** · **Data de Pagamento** — datas escolhidas pelo usuário (sem default "hoje"), **impressas**.
- **Banco do Vendedor** — puxa do cadastro do cliente: **Banco, Agência, Conta, CNPJ/CPF, Chave PIX**, **impresso**.
- ✅ **Resolvido**: listas (Forma/Modalidade/Embalagem) **cadastráveis** pelo admin (iniciam com os valores acima); conta bancária guarda **nome + CNPJ/CPF do titular** (D28 revisada; titular pode diferir do cliente). No contrato saem: Banco/Agência/Conta/CNPJ-CPF/Chave PIX.

### B9 — Observações ✅ campos

- **2 blocos de texto livre**, **opcionais**, **sem limite**, impressos (D30): **Observações** e **Descrição**. _(Sessão 35: voltou a 2 blocos nomeados.)_

### B10 — Assinaturas ✅

- **Corretor/empresa** — imagem fixa do dono, impressa automaticamente (D35)
- **Comprador** — linha em branco (à mão)
- **Vendedor** — linha em branco (à mão)

> **Revisão geral (quais campos) dos 10 blocos: CONCLUÍDA (2026-06-24).** Todos os blocos ✅. Falta a
> **análise precisa campo a campo** (comportamento/validação detalhada de cada campo) — parte da P2, **CONCLUÍDA** (Sessões 29–38, à vista + Futuro; ver seção abaixo).

---

## Comportamento campo a campo (P2 — por fase do fluxo)

Detalhamento de **origem · obrigatoriedade · validação** de cada campo, **na ordem do fluxo** (Sessão 29+). É o que vai guiar o schema.

### Etapa 1 — Venda (bloco "Venda" do modal único)

> **Conferida ✅ (S53).** Os campos da venda (comprador · data · sacas · preço/saca · corretagens % · corretores) foram revisados campo a campo.
>
> **D69 (S59): 1 modal só.** Esta fase é hoje o **bloco "Venda"** do `SaleContractEtapa2Modal` (modo `spotCreate`) — **não há mais wizard/passo 1 separado** (D62 superseada). O picker de lote abre o modal; **vendedor** vem pré-preenchido do dono do lote; **sacas ≤ disponível** (liga = 100% travado); o submit cria a venda (`createSampleMovement`) + emite. _(As notas da S53 abaixo continuam valendo p/ os campos; só o invólucro mudou de `SampleMovementModal`/wizard para o bloco do Etapa2.)_

| Campo                       | Origem                     | Obrig. | Comportamento / validação                                                                                                                                                                                |
| --------------------------- | -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Comprador**               | manual (lookup Cliente)    | sim    | busca **só clientes `isBuyer` ativos**; **cadastrar comprador na hora** pelo dropdown (cria já como comprador); lookup **sem limite** de resultados (≥ 2 chars); snapshot; a filial vai p/ etapa 2 (D38) |
| **Data**                    | manual; default hoje       | sim    | editável — aceita datas **passadas e futuras**                                                                                                                                                           |
| **Sacas**                   | manual                     | sim    | inteiro; **≤ saldo** (`declared − sold − lost`); **liga = 100%** (forçado); botão "Todas"                                                                                                                |
| **Preço/saca**              | manual                     | sim    | R$ `Decimal(12,2)`; **> 0**; **máscara de moeda** (entrada à prova de formato BR)                                                                                                                        |
| **Corretagem do vendedor**  | manual; **começa vazia**   | sim    | `%` `Decimal(5,2)`; faixa **0–100**; **vazio = 0%** (opcional); parser BR robusto                                                                                                                        |
| **Corretagem do comprador** | manual; **começa vazia**   | sim    | idem; **separada** da do vendedor                                                                                                                                                                        |
| **Corretores**              | manual (cadastro `Broker`) | sim    | **≥ 1**; N permitido (D34); **cadastrar corretor na hora** pelo seletor (reusa `BrokerFormModal`)                                                                                                        |

**Refinos da Sessão 53** (implementados, commits em `main`):

- **Comprador** — filtro confirmado (`isBuyer` + ativo, em `client-service.lookupClients`); **decisão: forçar o cadastro correto** (descartado "buscar todos + auto-promover"). Ganhou **cadastro inline** (`ClientQuickCreateModal` com `initialIsBuyer`), **lookup sem limite** (era 8) e piso de **2 caracteres** na busca (`ClientLookupField`).
- **Preço/saca** (e **Ágio**/**Peso** da Etapa 2) — helper único **`lib/currency.ts`**: **máscara de moeda** (Preço/Ágio) + **parser BR robusto** (Peso/corretagem). Corrige o **misparse silencioso** do parser antigo `Number(x.replace(',', '.'))` (`1.250` → 1,25), que contaminava total e corretagens.
- **Corretagens** — passam a **começar vazias** (antes pré-preenchidas com `0`); **vazio = 0%**.
- **Corretores** — **cadastro inline** reusando o `BrokerFormModal` canônico (ganhou prop `initialName`).
- **Layout do modal** — **Data** abaixo do Comprador; **Sacas + Preço** e **Corretagem vend. + comp.** em linhas **50/50** (grid inline, sem CSS novo).

**Relação entre os campos** (em `computeContractMoney`/`...WithAgio`, salva já na venda): `Total = Preço/saca × Sacas`; `Corretagem do lado = Total × (% do lado)` — as duas corretagens incidem sobre o **mesmo total bruto**. Total **salvo, não exibido** (P22); corretagem só em **%** no PDF (P21).

### Etapa 2 — Geração (modal "Gerar rascunho" / "Editar contrato")

| Campo                     | Origem                       | Obrig.   | Comportamento / validação                                                                                                                              |
| ------------------------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Número do lote**        | auto (`internalLotNumber`)   | —        | **só leitura** (conferência)                                                                                                                           |
| **Vendedor**              | auto (`ownerClient`)         | sim      | **editável**; ao editar, **sincroniza o `Sample.ownerClientId`** (D48), mesmo após gerar (→ regenerar, D47)                                            |
| **Filial do vendedor**    | manual                       | só se PF | obrigatória p/ vendedor PF; **+cadastrar na hora** se faltar; não aparece p/ PJ                                                                        |
| **Filial do comprador**   | manual                       | só se PF | obrigatória p/ comprador PF; **+cadastrar na hora** se faltar; não aparece p/ PJ                                                                       |
| **Banco do vendedor**     | manual (`ClientBankAccount`) | sim      | seleciona 1 conta do vendedor (banco/agência/conta/titular/CPF-CNPJ/PIX, D28); **+adicionar** no dropdown (modal rápido) se faltar; **não fica vazio** |
| **Armazém do comprador**  | manual (lookup amplo)        | não      | busca **todos os clientes**; selecionar não-armazém **liga `isWarehouse`** (D49); snapshot                                                             |
| **Armazém do vendedor**   | manual (lookup amplo)        | não      | idem armazém do comprador (D49)                                                                                                                        |
| **Número de compra**      | manual                       | não      | texto livre (referência de compra **externa**, D16)                                                                                                    |
| **Peso (Kg)**             | manual                       | não      | `Decimal(10,2)`; impresso (D17)                                                                                                                        |
| **Condição de Pagamento** | manual                       | não      | texto livre; impresso (D20)                                                                                                                            |
| **Forma de Pagamento**    | lista cadastrável            | sim      | {Faturado, Livre}; **sem default** (força escolha); impresso (D20)                                                                                     |
| **Modalidade**            | lista cadastrável            | sim      | {Retirar, Posto, Disponível}; **sem default**; impresso (D20)                                                                                          |
| **Embalagem**             | lista cadastrável            | sim      | {Sacaria, Bags, A granel}; **sem default**; impresso (D20)                                                                                             |
| **Data de Faturamento**   | manual (data)                | sim      | sem default "hoje"; impresso (B8)                                                                                                                      |
| **Data de Pagamento**     | manual (data)                | sim      | sem default "hoje"; impresso (B8)                                                                                                                      |
| **Observações**           | manual                       | não      | texto livre, **sem limite**; impresso (D30)                                                                                                            |
| **Descrição**             | manual                       | não      | texto livre, **sem limite**; impresso (D30)                                                                                                            |

> **Ágio/deságio e total (etapa 2):** ágio/deságio = **campo no modal** de criação **+ botões "Ágio"/"Deságio" no card** em `CONFIRMADO` (D87, S65); **valor total** = calculado e **salvo**, exibido na página **Financeiro** (P22 resolvida).

_**Etapa 2 conferida ✅** (campo a campo). Pendentes de propósito: ágio/deságio (P21) e exibição do total (P22)._

**1ª parte implementada — Sessão 54** (modal "Gerar documento" → Emitir → `CONFERIR`; só esta parte, ações pós-CONFERIR depois):

- **Layout 50/50** (grid inline, molde da Etapa 1): filiais (vend.+comp.), armazéns (comp.+vend.), forma+modalidade, datas (fatur.+pagto.), nº-compra+peso e **ágio (tipo | valor)**. Filiais agrupadas, com o **Comprador** (read-only) abaixo.
- **Cadastro inline** de **Vendedor** (`initialIsSeller`) e **Armazéns** (`initialIsWarehouse`) via `ClientQuickCreateModal` — espelha o comprador da Etapa 1. (Filial e Banco já tinham.)
- **Erros por campo** no "Emitir" (mensagem específica do 1º pendente); o botão deixou de travar por campo faltante (só `saving`/`loading`).
- **Nota:** o **ágio/deságio** está implementado como **campo no modal** (par tipo|valor), não como "botões no card" — a ideia de botões no card (P21) **não** foi adotada; o **total** segue salvo e não exibido (P22).
- **Fora desta entrega:** coerência de datas, ágio>0 no cliente, `maxLength` (o servidor já corta), e qualquer mudança de backend.

> **Pós-emissão completo (D63–D66, fase pós-emissão).** O modal deixou de ter modo "view" (a leitura virou o **"Visualizar"** — modal do PDF, D64). O **"Editar"** agora libera também a **fase 1** (bloco "Venda": data/sacas/preço/corretagens/corretores) — `saleFields` no `emitSaleContract` sincroniza a venda do lote via `SALE_UPDATED` (sacas+data ajustam o saldo; sacas travadas em **liga**, F7.1) — **resolve P20** (D66). Título do modal: **"Gerar rascunho"** (wizard) ou **"Editar contrato NNNN/AA"** (card). Ações do card e renomeação "Quebrar"→"Washout" na D65. PDF sem status na D63.

### Futuro — pela página de Contratos (sem lote)

> **✅ IMPLEMENTADO (S58)** — em **1 modal único** (D67, não wizard), persistindo **100% no `SaleContract`** (`sampleId`/`movementId` nulos + `type=FUTURO`, D51). Backend: `createFutureSaleContract` (cria `EM_ABERTO` direto, nº na sequência global sob advisory lock) → `emitSaleContract` (já cobria Futuro, guarda em `sampleId`). Frontend: `SaleContractEtapa2Modal` modo `futureCreate` (bloco "Venda" vazio + Vendedor/Comprador manuais) pelo FAB "Futuro". **Washout/Cancelar sem-lote** (D68). Não há `SampleMovement` → não sincroniza lote nem usa `SALE_UPDATED`. Gates verdes; +6 testes (53/53). **Validar no device.**

Mesmos campos da **Etapa 1 + Etapa 2** do Mercado à vista, **exceto**:

- **Vendedor** — escolhido **manualmente** (lookup de cliente); não vem de lote (D48 não se aplica).
- **Sacas** — **livres** (sem validação de saldo; sem trava de liga).
- **Número do lote** — **não aparece**.

Demais campos, status e PDF **idênticos** ao Mercado à vista; na prática muda só que **Data de Faturamento/Pagamento** costumam ser **futuras**. _(Futuro conferido ✅ — S38.)_

---

## Espelho de Corretagem (3º documento — derivado dos fechamentos)

> **Sessão 61 (2026-06-29).** Desenho **+ implementação** (Fase E ✅): backend `d04e1d1` + frontend `67a8c50`. Decisões **D70–D76**. **Validar no device.**

O **Espelho de Corretagem** é um **demonstrativo de comissão** que a corretora (SAFRAS) emite **a
partir de um fechamento já existente**. Diferente do à vista e do Futuro, **não é um contrato** (não
tem partes/sacas próprios) — ele **lê** um `SaleContract` e imprime os dados de comissão. Fonte: print
legado em `espelho corretagem.pdf` (Sessão 61).

### O que é × o que NÃO é

- **É**: um PDF on-demand, gerado a partir de **1** contrato congelado (**EMITIDO/FATURADO/PAGO/WASH_OUT**
  — D96/D105) **com corretagem no lado** (D109), endereçado a **uma** das partes (comprador **ou**
  vendedor), mostrando a comissão **daquele lado** (D70–D73).
- **NÃO é**: um `SaleContractType` novo, uma tabela nova, um registro com número/status/assinaturas
  próprios. Sem migration. _(Evita corromper a tabela/queries do contrato.)_

### Mapeamento campo → origem (tudo já existe no `SaleContract`)

`side ∈ {seller, buyer}` = a parte escolhida na geração (D72).

| Campo no Espelho   | Origem                                                               |
| ------------------ | -------------------------------------------------------------------- |
| **CLIENTE** (topo) | `side === seller ? sellerSnapshot.name : buyerSnapshot.name`         |
| N.º Contrato       | `contractNumber`                                                     |
| Data               | **data de GERAÇÃO do espelho** (hoje, fuso America/Sao_Paulo — D131) |
| Pagamento          | `paymentDate`                                                        |
| Preço              | **EFETIVO** = `unitPrice` ± `agioDesagioValue`/saca (D133)           |
| Sacas              | `quantitySacks`                                                      |
| Ágio/Deságio       | `agioDesagioType` (rótulo; vazio se nulo)                            |
| Valor              | `agioDesagioValue` (R$/saca; **vazio** se nulo — D130)               |
| **Valor Comissão** | `side === seller ? sellerBrokerageValue : buyerBrokerageValue`       |
| Número Compra      | `purchaseNumber` (opcional)                                          |
| **TOTAL: R$**      | = a própria Valor Comissão (1 linha)                                 |
| Rodapé bancário    | conta fixa do emissor no `issuer-config` (D74)                       |

_(A coluna "Comprador / Vendedor" — que imprimia o mesmo nome do CLIENTE — **saiu na D132**; ficam
9 colunas.)_

Os valores de corretagem em R$ já são calculados no `emit` (`computeContractMoneyWithAgio`,
`src/sale-contracts/sale-contract-support.js`) e **congelam ao emitir** — por isso os contratos
congelados (**EMITIDO/FATURADO/PAGO/WASH_OUT**) são elegíveis (D73 renomeada pela D96; WASH_OUT via D105).

### Layout do PDF (espelha o legado)

1. **Cabeçalho** = idêntico ao contrato: logo + emissor à direita (nome/endereço/bairro/CNPJ/telefone).
2. **Faixa cinza** "ESPELHO DE CORRETAGEM" (reusa `grayLabel`).
3. **CLIENTE:** `<nome da parte escolhida>`.
4. **Tabela** (1 linha de cabeçalho + 1 de dados, 10 colunas finas, fonte ~8pt): N.º Contrato · Data ·
   Pagamento · Preço · Sacas · Ágio/Deságio · Valor · Valor Comissão · Número Compra · Comprador/Vendedor.
5. **TOTAL: R$ X** (alinhado à direita, abaixo da tabela).
6. **DADOS BANCÁRIOS PARA PAGAMENTO** (centralizado): nome do emissor · Banco · Agência · Conta
   Corrente · CNPJ.

### Fluxo (padrão "liga")

1. O FAB da página `/contratos` ganha a 3ª opção **"Espelho de corretagem"** (ao lado de À vista/Futuro).
2. Tocar → `/contratos` entra em **modo de seleção** (header substituto + chrome oculto, como a liga em
   `/samples`); contratos **inelegíveis** (status não congelado **ou sem corretagem** — D73) ficam esmaecidos com o motivo.
3. **Tocar 1 contrato elegível** abre a fase de **CONFERÊNCIA** (`EspelhoConferenciaModal`, D134):
   campos que sairão impressos (contrato **fresco** re-buscado; Data = hoje e Preço efetivo espelhando o
   PDF) + toggle **Vendedor | Comprador** (só os lados com **corretagem preenchida**, D72; default = o 1º
   disponível) + ações **Cancelar · Ver detalhes · Gerar espelho**.
4. **"Ver detalhes"** = vai-e-volta com o `SaleContractDetailsModal`: ao fechar o Detalhes a conferência
   REABRE (dados re-buscados); se de dentro do Detalhes o usuário entrar em Editar/Ágio/Washout, o fluxo
   do espelho encerra (swap padrão da página).
5. **"Gerar espelho"** abre a **prévia** (`EspelhoCorretagemModal`, D75) — só o PDF (herda o lado; sem
   toggle) + **Exportar/Baixar** (que gravam a auditoria — D127; a prévia não conta).

### Notas / pendências menores

- **Auditoria** (D124/D127): `SaleContractEspelhoLog` grava a **exportação** (Exportar/Baixar ou URL
  direta sem `?preview=1`) — lado + ator + quando; alimenta o timeline do Detalhes.
- O gate de elegibilidade (front + 409 `ESPELHO_NO_BROKERAGE` no back) exige corretagem `> 0` no lado
  pedido — não existe mais espelho com TOTAL 0.

---

## Página Financeiro (corretagem a receber por fechamento)

> **Desenho (Sessões 62–63) + IMPLEMENTAÇÃO na Sessão 64 (2026-06-29).** **Fase F ✅** (`611b8e9` backend +
> `33226c1` frontend). Decisões **D77–D86**. **Relatório derivado, sem schema novo.** Validar no device.
> **S84 (D128): ADMIN-only** (COMMERCIAL saiu; `myShare` removido). **S86: paginação server-side por
> cursor (scroll infinito) + busca/total no backend + data de pagamento no card.**
> **S87 (D135): REABERTO ao COMMERCIAL** — escopado aos contratos dele (own-only, como `/contratos`);
> co-corretores **VISÍVEIS** (revisa D86); "Seu total a receber" = a **cota dele**.
> **S88 (D136): rateio ÷N REMOVIDO** (revisa D78/D79/D129) — corretores = atribuição (só nomes, sem valor
> por corretor); o total do COMMERCIAL vira **"Corretagem dos meus fechamentos"**.
> **S89 (D137): registro do "Pago" MIGROU pra cá** (revisa D121) — o botão **"Pago"** (`FATURADO`→`PAGO`)
> saiu do card do contrato e virou ação do card do Financeiro; a página deixa de ser só-leitura.

Nova página **"Financeiro"** (acesso **ADMIN + COMMERCIAL**) que apresenta a **corretagem a receber por
fechamento** e, dentro de cada um, os **corretores** envolvidos (atribuição — o sistema **não** divide o
valor entre eles, D136). É um **relatório calculado** a partir de dados que já existem (`SaleContract` +
`SaleContractBroker` + `Broker`) — **sem persistência nova, sem migration**. **S89/D137:** além da leitura,
o card de um fechamento **`FATURADO`** ganha o botão **"Pago"** (registra o pagamento do contrato,
`FATURADO`→`PAGO`, reusando o `SaleContractLifecycleDialog`); o **"Faturar"** segue no card de
`/contratos`. Nota de coerência: **PAGO = contrato/negócio pago** (o comprador pagou), distinto de
**"corretagem paga ao corretor"** (D81, futuro).

### Cálculo

- **Corretagem por fechamento** = `sellerBrokerageValue + buyerBrokerageValue` (corretagem das duas
  pontas, D78) — é o valor exibido no card.
- **Sem rateio entre corretores (D136, revisa D79/D129):** o sistema **não** divide o valor entre os
  corretores — a divisão igual (÷N) era uma **ficção de leitura** que arriscava os registros. Os
  corretores são **atribuição/métrica** (D34): o card lista os **nomes**, sem valor por corretor; a
  divisão real (quando há) é **externa**. `SaleContractBroker` segue **sem coluna de cota**.

### Escopo por papel (D82)

- **ADMIN** — vê **todos** os fechamentos elegíveis, com a **corretagem total** de cada um + os **nomes**
  dos corretores (sem cota, D136). Total geral = soma das corretagens.
- **COMMERCIAL** — vê **só os fechamentos em que é corretor** (resolve `Broker.userId` = o usuário logado;
  lista os contratos em que esse broker está no `SaleContractBroker`; o escopo entra no `filterWhere` do
  **SQL**, casando com a paginação por cursor e a busca — a busca por nome de corretor **não vaza** contratos
  alheios). **S87/D135 (revisa D82/D86):** vê o **valor total** + a **corretagem total** + **todos os
  corretores** do contrato (co-corretores **VISÍVEIS** — coerente com `/contratos → Detalhes`, D120;
  **revoga o "ocultar demais" da D86**). **S88/D136:** o topo do COMMERCIAL vira **"Corretagem dos meus
  fechamentos"** = **soma da corretagem total (2 lados) dos contratos dele** (mesmo `_sum` do ADMIN,
  escopado) — pipeline, **não** "o que ele embolsa" (o rateio ÷N saiu). Sem `Broker` vinculado → página
  vazia (`items: []`, total 0). **ADMIN** e **COMMERCIAL** veem o **mesmo card**; muda só o **escopo da
  lista** e o **rótulo do total do topo**.

### Elegíveis (D80) e natureza (D81)

- **Elegíveis**: status ∈ **{EMITIDO, FATURADO, PAGO, WASH_OUT}** (congelados; corretagem já calculada —
  WASH*OUT incluído pela D105). Contratos **sem corretagem** (total 0) **também entram** (D92 — é o único
  lugar onde o total do contrato aparece). *(Mesma régua de status do Espelho; D73 renomeada pela D96.)\_
- **Natureza**: **só visão calculada** — a página lista os recebíveis; **não** marca "pago ao corretor"
  (sem estado/tabela). O total é **cumulativo** (um contrato `PAGO` segue aparecendo como "a receber"). O
  controle de pagamento ao corretor (separar a receber × recebido) = **futuro**.

### Cards (D83–D86)

A página é uma **lista de cards, um por fechamento** (estado `expandedIds` + `toggleExpand`, molde do
`/contratos`; esqueleto visual = `ctr-card` clonado sob prefixo **`fin-*`**, com a animação de expansão
`grid-rows 0fr→1fr`). **Total** no topo (soma do escopo) + **busca** (nº do contrato ou nome de corretor).
**Sem filtro de período** (todos os recebíveis correntes) — pode evoluir.

- **Recolhido — ADMIN (D84, revisa D136):** nº do fechamento · **valor total** do negócio (`totalValue`) ·
  **corretagem total** (`sellerBrokerageValue + buyerBrokerageValue`) · **nomes dos corretores** (sem cota).
- **Expandido (D85):** **só o detalhe da corretagem** — repartição do **vendedor** (% + R$) e do
  **comprador** (% + R$). Sem dados do negócio (partes/sacas/datas/preço).
- **Recolhido — COMMERCIAL (S87/D135 + S88/D136, revisa D86):** **igual ao card do ADMIN**, para os
  contratos dele — nº · **valor total** · **corretagem total** · **nomes dos corretores** (sem cota).
  **Expandido:** repartição vend/comp (% + R$). A diferença é só o topo: **"Corretagem dos meus
  fechamentos"** = a corretagem total dos contratos dele (não o total da empresa).
- **Ação "Pago" (S89/D137):** no card de um fechamento **`FATURADO`** aparece (sempre visível) o botão
  **"Pago"** → registra o pagamento (`paySaleContract`; gate ADMIN + COMMERCIAL-dono; marco
  `SaleContractStatusLog`/D123) via `SaleContractLifecycleDialog`; sucesso faz **patch otimista** do
  status→`PAGO` (sem refetch). O item da projeção passa a trazer `version` (concorrência otimista).

### Pendências (a refinar / Fase F)

- Ordenação default (ex.: data desc) e formato do total geral.
- Empty-state do COMMERCIAL sem `Broker` vinculado — **resolvido** (retorna vazio; UI = "Nenhuma corretagem
  a receber").
- **Divisão da corretagem entre corretores** = **externa** ao sistema (D136 — sem rateio ÷N). Se um dia
  precisar registrar o valor por corretor: coluna nova em `SaleContractBroker` + input por corretor no modal.
- **Controle de pagamento ao corretor** — futuro (era a opção 2 descartada por ora).

---

## Rascunho das tabelas (para revisão)

> Desenho campo a campo (Sessão 39), a partir de D1–D58. **Rascunho** — vira `schema.prisma` + migration só na implementação (Fase 0/B), após revisão. Espelha os padrões do schema: uuid `@id @db.Uuid`, snake_case `@map`/`@@map`, `@db.Timestamptz(6)`, `Decimal(p,s)`, snapshots `Json?`, `onDelete: Restrict`, `version Int`, status enums, número com espelho Int (molde `getNextInternalLotNumber`).

### Grupo A — extensões de cadastro de Cliente (Fase 0)

- **`Bank`** (lookup, D24/D39) — `id` Int auto · `name` · `compeCode` VarChar(3) `@unique` (COMPE) · `status` `LookupStatus` · timestamps.
- **`ClientBankAccount`** (D28; molde `ClientUnit`) — `id` uuid · `clientId`→Client · `bankId`→Bank · `agency` · `accountNumber` (c/ dígito) · `holderName` · `holderTaxId` (CPF/CNPJ) · `pixKey?` · `status` · timestamps. `@@index([clientId, status])`. Sem corrente/poupança.
- **`ClientAttachment`** (D27; molde `SampleAttachment`; **independente do contrato**) — `id` uuid · `clientId`→Client · `storagePath` · `mimeType?` · `sizeBytes?` · `checksumSha256?` · `description?` · `uploadedByUserId?`→User · `createdAt`. `@@index([clientId, createdAt])`. Exige +`application/pdf` no allowlist + CLAUDE.md#5/SECURITY.
- **`Broker`** (D34/D40) — `id` uuid · `name` · `userId?`→User (anulável, métrica) · `cpf?` · `phone?` · `email?` · `status` · timestamps. `@@index([userId])`.
- **`Client.birthDate`** (D36) — coluna `birthDate Date?` (só PF, opcional, só cadastro).

### Grupo B — listas cadastráveis (D20/D53)

Três tabelas idênticas (molde lookup), iniciam com os valores: **`ContractPaymentForm`** {Faturado, Livre} · **`ContractModality`** {Retirar, Posto, Disponível} · **`ContractPackaging`** {Sacaria, Bags, A granel}. Cada: `id` Int auto · `name` · `sortOrder` Int · `status` `LookupStatus` · timestamps. No contrato: FK opcional + **texto snapshot** (congela o nome).

### Grupo C — o contrato

**Enums novos**: `SaleContractType` {MERCADO_A_VISTA, FUTURO} · `SaleContractStatus` {EM_ABERTO, CONFERIR, CONFIRMADO, FATURADO, PAGO, WASH_OUT} · `AgioDesagioType` {AGIO, DESAGIO} · `LookupStatus` {ACTIVE, INACTIVE}.

**`SaleContract`** (central):

| Grupo                           | Colunas                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identificação                   | `id` uuid · `type` SaleContractType · `contractSeq` Int `@unique` (NNNN global) · `contractNumber` String `@unique` ("NNNN/AA") · `status` (default EM_ABERTO) · `washoutReason?` · `washoutAt?` · `contractDate` Date · `purchaseNumber?`                                                                                   |
| Vínculos (à vista; nulo Futuro) | `sampleId?`→Sample · `movementId?`→SampleMovement `@unique` (1:1)                                                                                                                                                                                                                                                            |
| Partes (FK + Json snapshot)     | `sellerClientId?` · `sellerUnitId?` · `sellerSnapshot Json?` · `buyerClientId?` · `buyerUnitId?` · `buyerSnapshot Json?` · `buyerWarehouseClientId?` · `buyerWarehouseSnapshot Json?` · `sellerWarehouseClientId?` · `sellerWarehouseSnapshot Json?` · `sellerBankAccountId?`→ClientBankAccount · `sellerBankSnapshot Json?` |
| Negócio/financeiro              | `quantitySacks` Int · `unitPrice` Decimal(12,2) · `agioDesagioType?` · `agioDesagioValue?` Decimal(12,2) (R$ **por saca**) · `totalValue` Decimal(14,2) = `(unitPrice ± agio) × sacas` · `weightKg?` Decimal(10,2) · `sellerBrokeragePct/Value` Decimal(5,2)/(12,2) · `buyerBrokeragePct/Value` Decimal(5,2)/(12,2)          |
| Pagamento/logística             | `paymentCondition?` (texto) · `paymentFormId?`+`paymentFormText?` · `modalityId?`+`modalityText?` · `packagingId?`+`packagingText?` · `invoiceDate?` Date · `paymentDate?` Date                                                                                                                                              |
| Textos/meta                     | `observations?` · `description?` · `version` Int · timestamps                                                                                                                                                                                                                                                                |

Índices: `@@index([type, status, createdAt, id])` · `[sellerClientId, status]` · `[buyerClientId, status]` · `[contractSeq]`. **Mês/Ano** = derivados de `contractDate` (não viram coluna). **Emissor** (nome/CNPJ/logo/assinatura) = config `COMPANY_INFO` (não tabela).

- **`SaleContractBroker`** (D34) — `id` uuid · `saleContractId`→SaleContract · `brokerId`→Broker · `brokerNameSnapshot`. `@@unique([saleContractId, brokerId])`. (Rateio da corretagem por broker = adiado.)
- **`SaleContractExport`** (auditoria, D56) — `id` uuid · `saleContractId`→SaleContract · `contractType` SaleContractType · `generatedByUserId?`→User · `generatedAt`. `@@index([saleContractId, generatedAt])`. Uma linha por "Emitir"/regenerar.

---

## Pendências (restantes)

| #   | Pendência                      | O que falta decidir                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2  | Comportamento por campo        | **✅ Conferido** — origem/obrigatoriedade/validação revisados **campo a campo por fase do fluxo**: Etapa 1 ✅ + Etapa 2 ✅ (S29–S35) + Futuro ✅ (S38), à vista E Futuro. Revisão fina contínua na **Fase G**.                                                                                             |
| P16 | Modelagem do Futuro (sem lote) | **✅ Resolvida pela D51** — Futuro = 100% no `SaleContract` (`sampleId`/`movementId` nulos + `type`); à vista vincula o movimento (1:1).                                                                                                                                                                   |
| P17 | Acionamento do `WASH_OUT`      | **✅ Resolvida (S50)**: botão **"Quebrar"** na página de Contratos, de **CONFERIR/CONFIRMADO/FATURADO/PAGO** (não EM_ABERTO), **motivo obrigatório**, **definitiva**. A quebra **cancela a venda** (devolve as sacas ao lote) — delega ao `cancelSampleMovement`; o washout passou a cobrir FATURADO/PAGO. |
| P21 | Botões de ágio/deságio no card | **✅ Implementada (D87, S65)** — ágio/deságio é **campo no modal** na criação (até `CONFERIR`) **e** ganhou **botões "Ágio"/"Deságio" no card** do contrato **`CONFIRMADO`** (`applyAgioSaleContract`: substitui o vigente, recalcula total+corretagem, audita).                                           |
| P20 | Editar etapa 1 no contrato     | **✅ Resolvida (D66)** — o "Editar" libera a fase 1; `emitSaleContract` aceita `saleFields` e sincroniza a venda via **`SALE_UPDATED`** (append-only: sacas+data ajustam o saldo do lote; sacas travadas em liga, F7.1). Mecanismo = evento de update existente, **sem evento novo**.                      |
| P22 | Onde exibir o valor total      | **✅ Resolvida** — o total é **calculado e salvo** e aparece na página **Financeiro** após a confirmação. O PDF do contrato segue sem o total (D89).                                                                                                                                                       |

**Resolvidas**: P1→D12/D13 · P3→D20 · P4→D17/18/19 · P5→D21 · P6→D29 · P7→D30 · P8→D31 · P9→D22/D23 · P12→D11 · P13→D14 · P14→D28 · P15→D26 · banco→D24 · P10→D32 · P11→D33 · P19→D47 · P16→D51 · P17→S50 (quebra manual) · **P20→D66** (editar fase 1 via `SALE_UPDATED`) · **P21→D87** (botões de ágio no card, S65) · **P22→Financeiro** (total na página Financeiro). **S68 fechou 5 das 6 abertas**: **P23→D25** (exceção do ágio ao congelamento) · **P24→D92** (Financeiro inclui contratos sem corretagem) · **P25→D93** ("Washout" em toda a UI) · **P26→D94** (criar valor das listas = ADMIN) · **P28→D95** (renomear/inativar adiado). **Aberta**: **P27** (layout/design das páginas — Fase G). _(P2 e P18 conferidos ✅.)_

**Pendências abertas catalogadas na S67** (inconsistências do levantamento + novos pedidos):

| #   | Pendência                            | O que decidir / fazer                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P23 | Congelamento × ágio pós-confirmação  | D25 "congela ao `CONFIRMADO`" × **D87** (ágio muda total/corretagem depois). Reconciliar: ágio é a **única** mutação permitida pós-`CONFIRMADO` — registrar a exceção na D25/D47 (e como isso interage com `SaleContractExport`/Espelho já gerados).                                                                                                                                                                                                                  |
| P24 | Total de contrato **sem corretagem** | P22 só exibe o total no **Financeiro**, que exige **corretagem > 0**. Um contrato `CONFIRMADO` **sem corretagem** (0%) **não aparece** no Financeiro **nem** no PDF → onde mostrar o total dele?                                                                                                                                                                                                                                                                      |
| P25 | Terminologia "Quebrado" × "Washout"  | Selo de status do card = **"Quebrado"**; botões e diálogo = **"Washout"** (e o status interno = `WASH_OUT`). Padronizar **um** termo na UI.                                                                                                                                                                                                                                                                                                                           |
| P26 | Acesso da criação das 3 listas       | "+ Adicionar" das listas = **qualquer autenticado** (D59), mas a gestão de Contratos é **ADMIN-only**. Confirmar/alinhar o gate (hoje só o modal ADMIN expõe; endpoint aberto a qualquer autenticado).                                                                                                                                                                                                                                                                |
| P27 | **Layout e design das páginas**      | Revisão visual das páginas do Contrato — `/contratos` (cards, FAB, filtros), `/financeiro`, e os modais (Etapa 2, Visualizar, Espelho, ágio) — consistência com o **design-system**, **responsividade** e hierarquia. **Em andamento (S74)**: modal de **emissão** maior/centralizado na área de conteúdo no desktop (2 colunas de seções); **detalhes do contrato = modal** (D108, não página) + card com ações principais + "Detalhes". _(Abordada na **Fase G**.)_ |
| P28 | Renomear/inativar das 3 listas       | Hoje só **adicionar** (S66/D91). Falta **editar nome** / **inativar** valor e (opcional) **reordenação manual** (`sortOrder`); + decidir guard "não inativar a última ativa".                                                                                                                                                                                                                                                                                         |

**Entrada pendente**: o **CNPJ** (e demais dados) da empresa emissora — Flavio fornece para a Fase A (D29).

---

## Aprovação do contrato (etiqueta) — análise + direção (Fase I — S73, só registro)

**Sessão 73 (2026-07-03). Só análise/registro — implementação adiada (Fase I). A etiqueta avulsa atual é
mantida. Decisão guarda-chuva: D107.**

**Estado atual (o que existe hoje):** a "Etiqueta de Aprovação" é o modal "Aprovação" do leque "+" do
`/samples` (`components/ApprovalLabelModal.tsx`). É uma **impressora de etiqueta 100% manual**: todos os campos
são digitados (Nº compra, Nº fechamento, Produtor, Armazém, Sacas, e até 16 Lotes). No envio →
`requestCustomPrint` → `enqueueCustomPrintJob` grava um `custom_print_job` (`PENDING`, `payload={lines}`) → o
print agent puxa da fila, imprime (sem QR, 1 cópia) e marca `DONE`/`FAILED`.

**A lacuna de auditoria (o motivo de conectar ao contrato):** a tabela `custom_print_job` guarda só
`status`/`payload`/`printerId`/`error`/timestamps — **sem `actorUserId`** (não se sabe quem aprovou) e **sem
`sampleId`/`contractId`** (Lote e Nº fechamento são só string no JSON). E é **fora do event store**
(append-only) + mutável. Contraste: a **etiqueta QR da amostra** (`PrintJob`) é ligada ao `sampleId` e
**auditada** via eventos (`QR_PRINT_REQUESTED`/`QR_PRINTED`, com ator) — é o padrão certo que a Aprovação não
segue.

**Direção decidida (Flavio, S73):**

- Aprovação **sempre após a emissão**, **escopo do contrato**, **marco físico auditado no contrato**.
- **Não é um status** — é ortogonal a `EMITIDO/FATURADO/PAGO/WASH_OUT` (o contrato pode estar Faturado E
  aprovado).
- Os **lotes da etiqueta são EXTERNOS** (não o lote interno do sistema) → **digitados à mão**; os outros 5
  campos vêm do contrato (compra=`purchaseNumber`, fechamento=`contractNumber`, produtor=vendedor?, armazém=?,
  sacas=`quantitySacks` — o mapeamento fino de produtor/armazém fica pra confirmar). _(S75: os lotes passam a
  ser **pré-preenchidos do `originLot`** da amostra quando existir, **editáveis** — ver "Fluxo fechado".)_
- Vira uma **ação do card do contrato** (pós-emissão): pré-preenche a etiqueta do contrato + lotes manuais →
  imprime (**reusa `customPrintJob`**) → **grava um registro de auditoria ligado ao contrato**.
- Auditoria = **tabela-satélite nova** (ex.: `SaleContractApproval`: `saleContractId` + `approvedByUserId` +
  `approvedAt` + payload/lotes externos + ref do print job), no molde de
  `SaleContractExport`/`SaleContractAgioLog`. Alimenta o **timeline de auditoria** do **modal de Detalhes
  do contrato** (D108 — antes cogitado como uma "página de detalhes").
- **A etiqueta avulsa atual (`/samples`) é MANTIDA por ora.** _(S75: absorvida como o caminho **"Manual"** do
  seletor de contratos — agora **auditada**; D113/D114.)_

**Fluxo fechado (S75, 2026-07-04 — Q1–Q5 respondidas → D112–D114):**

- **Q1 — 1:N**: a aprovação pode ser enviada **várias vezes**; **todo ENVIO é auditado** (1 registro por
  envio). O **desfecho** (cliente aprovou/recusou) fica **FORA do sistema** — não é auditado.
- **Q2 — sem selo**: o card **não mostra "Aprovado"** — os envios aparecem **só no histórico** (timeline do
  modal de Detalhes, D108).
- **Q3 — editáveis**: os 5 campos vindos do contrato abrem **pré-preenchidos e EDITÁVEIS**; os **lotes** são
  pré-preenchidos do **`originLot`** ("Lote de origem") da amostra quando existir. **Atenção aos formatos**:
  `originLot` = texto livre único (≤100 chars) vs. etiqueta = até **16 campos discretos** de 16 chars (sem
  vírgula) — a quebra fica pra **análise campo a campo** (fechada na S76 → D116). Sem `originLot` (Futuro sem amostra; liga =
  intencionalmente `null`; campo não preenchido no registro) os lotes começam **vazios**.
- **Q4 — entrada dupla**: a entrada do `/samples` **fica** (nem todos acessam `/contratos`), mas passa a abrir
  um **modal de seleção de contratos**: **todos os contratos**, visíveis a **todos os papéis não-PROSPECTOR**,
  com **informações reduzidas** (nº do contrato + comprador + data + sacas + **busca**; **sem valores
  financeiros**) — exige **endpoint próprio** de listagem reduzida (view enxuta no backend). No **canto
  superior direito** do seletor, o botão **"Manual"** pula pro modal **em branco**: a etiqueta **100% manual
  sobrevive só por aí** (absorve o modal avulso atual) e passa a ser **auditada também** (D114).
- **Q5 — quem**: **todos exceto PROSPECTOR** (= gate atual do avulso). **Status que permitem enviar**:
  `EMITIDO`/`FATURADO`/`PAGO` (**WASH_OUT fora**). A ação entra como **mais um botão no acordeão do card**
  nos status permitidos (soma às ações da D108).

**Os dois fluxos:**

- **`/contratos`** (ADMIN + COMMERCIAL nos dele, D110): botão no acordeão → modal da etiqueta
  **pré-preenchido** (editável) → Imprimir → grava a auditoria **vinculada** + `customPrintJob`.
- **`/samples`** (todos exceto PROSPECTOR): leque "+" → "Aprovação" → **seletor de contratos** (reduzido +
  busca) **ou "Manual"** → mesmo modal (pré-preenchido ou em branco) → Imprimir → auditoria (**vinculada** ou
  **avulsa**). _Consequência consciente: por aqui o COMMERCIAL etiqueta contratos de outros — constrói a
  etiqueta sem ver os detalhes (exceção deliberada à posse da D110)._

**Auditoria (D114)** — **tabela ÚNICA** com vínculo **OPCIONAL**: `saleContractId` **nulo = avulsa** (**sem**
coluna booleana "é avulso" — derivável do vínculo nulo, evita estado inconsistente); sempre `actorUserId` +
`createdAt` + **`payload` = as linhas exatamente como IMPRESSAS** (valores finais pós-edição; os valores
originais já estão no contrato) + **`customPrintJobId`** (o DONE/FAILED fica no job — audita-se o **envio**).
**Nome proposto**: **`ApprovalLabelLog`** (`approval_label_log`) no lugar de `SaleContractApproval` (com
linhas sem contrato, deixou de ser satélite puro) — **a confirmar na implementação**. **Avulsas não aparecem
em tela nenhuma por ora** (registro consultável); as vinculadas alimentam o timeline do Detalhes.

**Campo a campo (S76, 2026-07-04 — mapeamento fechado → D115–D116):**

| Campo da etiqueta | Fonte no contrato                                                | Regra                                                                          |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Nº compra         | `purchaseNumber`                                                 | Direto; opcional → vazio; corta em 26 (limite físico; >26 é irreal na prática) |
| Nº fechamento     | `contractNumber`                                                 | Direto — "NNNN/AA" (7 chars, sem espaços) cabe folgado no limite 36            |
| Produtor          | `sellerSnapshot.displayName`                                     | Sempre existe (D97); PF = nome completo / PJ = razão social; corta em 52       |
| Armazém           | `sellerWarehouseSnapshot.displayName`                            | **SEMPRE o do VENDEDOR** (nunca o do comprador); opcional → vazio; corta em 52 |
| Sacas             | `quantitySacks`                                                  | Direto (inteiro sempre presente)                                               |
| Lotes             | `Sample.declaredOriginLot` (via `sampleId`; entrada `originLot`) | Quebra automática (abaixo); sem fonte (Futuro/liga/não preenchido) = vazios    |

- **Quebra do lote de origem (D116)**: **separadores = traço, espaço, vírgula e ponto-e-vírgula**
  (sequências colapsam; pedaços vazios descartados); **barra (`/`) NÃO separa** — pode ser composição do
  lote. Pedaço **>16 chars → corta em 16** (editável); **>16 pedaços → preenche os 16 primeiros**
  (`MAX_LOTS`, teto físico espelhado no backend). O **texto original** do lote de origem aparece no modal
  (só leitura) como **referência** pra conferir/corrigir a quebra. _Nota: vírgula como separador também
  resolve o limite físico do pipeline — o `splitLots` do print agent (`print-agent/label.js`) divide a
  linha LOTE por vírgula (e o campo do modal já bloqueia digitá-la), então vírgula dentro de lote nunca
  seria imprimível._
- **Prefill montado no BACKEND (D115)**: endpoint próprio (gate não-PROSPECTOR) devolve os 5 campos + os
  lotes já quebrados — 1 consulta ao contrato + (à vista) 1 busca da amostra; a regra de quebra é **função
  pura** em support (unit-testável), única pras **duas portas** (card do contrato e seletor do `/samples`).
  Todos os campos **editáveis** (D112).

**Fluxo de UI (S77, 2026-07-04 → D117):**

- **Seletor de contratos** (porta `/samples`): lista **só os elegíveis** (`EMITIDO`/`FATURADO`/`PAGO` —
  WASH_OUT nem aparece), **todos os contratos** do mais recente pro mais antigo, com **campo de busca**;
  botão **"Manual"** no canto superior direito (D113).
- **Navegação**: o formulário aberto pelo seletor tem **"Voltar"** → retorna ao seletor.
- **Modais** (seletor + formulário): **desktop = centrais** (padrão do modal de emissão); **mobile =
  bottom sheet** saindo de baixo (padrão `NewSampleModal`). _(Correção S80: o modal de criação de contrato
  usa `BottomSheet` — sheet no mobile e central no desktop via CSS ≥901px; a nota anterior, "central também
  no mobile", estava errada — não há débito, e o requisito da D117 saiu de graça reusando o BottomSheet.)_
- **Card do contrato**: botão **"Aprovação"** (rótulo fechado; "Aprovar" soaria como status) nos status
  permitidos → abre direto o formulário pré-preenchido. **Sucesso** = padrão atual (check + auto-close).

**Funcionamento — últimos detalhes (S78, 2026-07-04 → D118):**

- **Linha do histórico** (timeline do modal de Detalhes, D108): **"há X tempo"** (tempo relativo) + **quem
  enviou** + **nº do contrato** + o aviso **"Aprovação enviada"**. A linha resumida **basta** — sem
  drill-down do payload na UI (as linhas impressas ficam guardadas na auditoria, D114). _(Revisado na
  S79/D119: a linha fica **sem o nº do contrato** — o histórico vive só no Detalhes, onde o nº já é o do
  próprio contrato.)_
- **Resultado da impressão NÃO exposto** no histórico — registra-se o **envio**; falha de impressora se
  resolve reimprimindo (cada reenvio é auditado). O check de sucesso segue significando "enfileirado".
- **Item do seletor** ganha o **selo de status** (Emitido/Faturado/Pago), junto de nº + comprador + data +
  sacas (segue sem valores financeiros).
- **Cópias**: **1 por envio** (padrão atual); mais vias = reenviar.
- **Validação**: mantida a regra única "**ao menos um campo preenchido**" (nenhum campo obrigatório).

**Escopo e fechamento (S79, 2026-07-04 → D119):**

- **Fase I em fases**: a implementação inicial grava a **auditoria completa desde o 1º dia** (write-only,
  sem tela de leitura ainda); o **modal de Detalhes (D108) com o timeline** é construído em fase posterior.
- **Histórico SÓ no Detalhes** do contrato — sem visão geral fora dele; a linha fica **sem o nº do
  contrato** (revisa D118): formato final = **"há X tempo" + quem enviou + "Aprovação enviada"**, com a
  **data/hora exata como apoio** (texto menor/toque).

**Implementação (S80, 2026-07-04 — Fase I.a/I.b ENTREGUES):** análise multiagente (3 Explore + 1 Plan,
plano `~/.claude/plans/squishy-pondering-koala.md` aprovado) → 3 commits: `6eebc20` (schema + migration
`20260704120000_approval_label_log`, molde `SaleContractAgioLog`, FKs só no SQL) · `3f22b62` (backend:
funções puras `splitOriginLotForLabel`/`buildApprovalPrefill`/`toApprovalContractOption` +
`APPROVAL_ELIGIBLE_STATUSES` no support; 3 handlers `listApprovalContractOptions`/`getApprovalLabelPrefill`/
`sendApprovalLabel` com gate central não-PROSPECTOR, SEM posse/D113, job + log na MESMA `$transaction`,
409 `APPROVAL_CONTRACT_NOT_ELIGIBLE` + 422 `APPROVAL_LABEL_EMPTY` + guard de UUID→404; rotas
`/api/v1/approval-labels[/contracts[/:id/prefill]]`; +8 unit / +10 integração) · `ff2a50f` (frontend:
`ApprovalContractPickerModal` novo — clone do LotPicker sem cursor, busca client-side por nº/comprador,
selo de status, "Manual" no topo direito — + `ApprovalLabelModal` com `prefill`/`saleContractId`/`onBack`

- referência `.alm-origin-ref` + footer de 3 botões; máquina de estados no `/samples`; botão "Aprovação"
  no card EMITIDO/FATURADO/PAGO fora do `canManage`; **aposentados** `requestCustomPrint` + rota
  `POST /custom-print/request` + `enqueueCustomPrintJob` — `/pending` e `/result` do print agent intactos).
  **Parâmetros adotados** (o Flavio não respondeu a tempo; defaults recomendados, fáceis de trocar):
  **"Limpar" zera tudo** nas 2 portas · **"Voltar" descarta edições** · **tabela `ApprovalLabelLog`**
  (`approval_label_log`) confirmada. **Verificado ponta a ponta no app real** (skill verify + Playwright):
  2 portas, prefill campo a campo (lotes `1234·5678·91011·12/3·999` — barra preservada), vinculada com
  ator/job/payload casando, avulsa `sale_contract_id NULL`, WASH_OUT some do seletor + 409 no prefill/envio
  sem gravar nada, id malformado → 404 limpo, rota antiga → 404. **Gates verdes** (unit 353 / integração
  377 / build). **Resta da Fase I: timeline no modal de Detalhes (D108, fase futura) + validar no device.**

## Modal de Detalhes do contrato (S81/S82 → D120–D126; **Fase J IMPLEMENTADA na S83**)

**Sessão 81 (2026-07-04). Desenho FECHADO — só registro; implementação em sessão futura (Fase J).**
Substitui/refina o desenho preliminar da D108 com base no inventário de auditoria (1 agente Explore) e
nas respostas do Flavio (2 rodadas). **S82 (mesmo dia): o CONTRATO (PDF) entra embutido no modal (D126)**
— layout e rodapé revisados abaixo.

**Layout (D120, revisado pela D126 — o documento embutido)** — molde do modal de emissão (`BottomSheet`
`.ctr-contract-sheet`; desktop ≥901px = frame grande ~1180px centralizado na área de conteúdo; mobile =
sheet de coluna única):

```
┌─ 0001/26  [Emitido]  À vista ──────────────────────┐
│ Contrato (PDF)         │ Identificação             │
│ ┌────────────────────┐ │ Vendedor (completo)       │
│ │ pré-visualização   │ │ Comprador (completo)      │
│ │ do documento       │ │ Banco do vendedor         │
│ │ (rolável)          │ │ Armazéns                  │
│ │                    │ │ Pagamento/logística       │
│ │ [Exportar] [Baixar]│ │ Valores + corretagem      │
│ └────────────────────┘ │ Observação/Descrição      │
├────────────────────────────────────────────────────┤
│ Histórico (timeline, largura total)                │
│  • há 2h · Flavio · Aprovação enviada              │
│  • há 3d · Italo · Ágio aplicado (+R$ 5)           │
├────────────────────────────────────────────────────┤
│         [Editar] [Ágio] [Deságio] [Washout]        │
└────────────────────────────────────────────────────┘
```

- **Documento embutido (D126)**: o PDF do contrato (on-demand via rota `/pdf`, D63 — sem armazenar; o
  mesmo preview do modal "Visualizar"/D64) ocupa a **coluna esquerda** no desktop; no **mobile** é a
  **primeira seção** do sheet (preview em altura contida, rolável). As ações do documento
  (**Exportar/Baixar**) ficam na **própria seção do preview**, em todos os status. _(Proposta decorrente,
  a confirmar na Fase J: **aposentar o `SaleContractDocumentModal`** — depois da D121 nada mais o abre.)_
- **Read-only sem backend novo**: tudo vem do `getSaleContract` (view completa + brokers). Seções (coluna
  direita no desktop): Identificação (nº compra, peso, data do contrato, datas planejadas e **reais**
  `invoicedAt`/`paidAt`) · partes **completas** (CNPJ/CPF, IE, endereço, filial) · banco do vendedor
  (agência/conta/PIX) · armazéns · pagamento/logística · valores + corretagem (**com corretores**) ·
  Observação/Descrição.
- **COMMERCIAL vê TUDO** nos contratos dele (inclusive os outros corretores) — a restrição da D86 vale
  SÓ no Financeiro.

**Botões (D121 card ENXUTO revisa D87 · D122 Desfazer REMOVIDO · D126 "Visualizar" sai do rodapé):**

| Status     | CARD (acordeão)                 | MODAL (rodapé)                          |
| ---------- | ------------------------------- | --------------------------------------- |
| `EMITIDO`  | Faturado · Aprovação · Detalhes | Editar · Ágio · Deságio · Washout       |
| `FATURADO` | Pago · Aprovação · Detalhes     | Washout                                 |
| `PAGO`     | Aprovação · Detalhes            | Washout                                 |
| `WASH_OUT` | Detalhes                        | — (o documento já traz Exportar/Baixar) |

- O **Desfazer deixa de existir** (D122): botão + `revertSaleContractStatus` + rota `/revert` + ação do
  diálogo somem (molde D96/D104). Ciclo só pra frente; engano em Faturar/Pagar → só Washout.

**Timeline (D123–D125):**

- **Fontes**: criação/edições (`SaleContractExport`) · ágio/deságio (`SaleContractAgioLog`) · aprovações
  (`ApprovalLabelLog`, linha D118/D119) · **marcos de status** (tabela NOVA `SaleContractStatusLog` —
  Faturar/Pagar/Washout com ator+quando; antigos só com data) · **espelho** (tabela NOVA
  `SaleContractEspelhoLog` — side+ator+quando, resolve a D71).
- **Linha** = "há X tempo" + quem + o quê, **data/hora exata de apoio**; sem drill-down; ordem desc;
  helper `formatRelativeTime` reusado (corrigir "ha"→"há"). Endpoint agregador novo (join dos logs +
  nomes via `app_user`). Avulsas fora (filtro por contrato). **Fora da v1**: download de PDF (sem rastro,
  deliberado).

## Roadmap proposto (fases — cada uma com plano e aprovação próprios)

> Implementação **campo a campo** (D7). A Fase 0 (cadastro) é pré-requisito do que o contrato referencia.

> **Status da implementação (Sessões 40–57)** — commits em `main`, **não pushados**.
> **⚠️ Correção de gate:** a **gestão de Contratos** (`/contratos` + `SALE_CONTRACT_MANAGE_ROLES` no serviço) passou a ser **ADMIN-only em 2026-06-28** — as menções "ADMIN+CADASTRO" nos logs abaixo refletem o estado **da época**. A página **`/cadastros`** (Bancos/Corretores, D60) segue **ADMIN+CADASTRO**; o backend dos cadastros segue **qualquer autenticado** (D59).
>
> - ✅ **Schema + migration** `20260626120000_fechamento_cadastro` (`6178106`): `Bank`, `Broker`, `ClientBankAccount`, `ClientAttachment`, `Client.birthDate`, enum `LookupStatus`. **Aditiva e manual** (o `schema.prisma` não modela os índices trigram/colunas `GENERATED` do banco → `migrate dev` geraria DROPs espúrios; convenção = migration manual + `migrate deploy`, documentada na skill `prisma`). Aplicada local, **dados intactos**.
> - ✅ **Backend `Bank` + `Broker`** (`51c92b6`; acesso ajustado em `2627aff`): service + support + rotas REST (`/api/v1/banks`, `/api/v1/brokers`) + 25 testes unitários DB-free. Acesso = qualquer usuário logado (D59).
> - ✅ **Backend `ClientBankAccount`** (`c695a69`): `ClientBankAccountService` (list/create/update escopados por cliente; valida cliente 404 + banco 422; `holderTaxId` CPF/CNPJ sem checksum; inativação via status). Rotas `/clients/[id]/bank-accounts`.
> - ✅ **Backend `ClientAttachment` + upload de PDF** (`49ce3cf`): `saveClientAttachment` no upload service (allowlist +`application/pdf`, validação por **magic bytes**); rotas upload(multipart)/list/download(inline, guard UUID+path)/delete; a view não expõe `storagePath`/checksum. CLAUDE.md #5 + SECURITY + skill conventions atualizados.
> - ✅ **Smoke real contra o banco** (cria→lê→limpa): bancos, contas (com banco incluído) e anexos OK — confirma os `select`/relações que os testes com prisma fake não cobrem.
> - ✅ **Frontend — contas/anexos no detalhe do cliente** (`f0383fe` api-client + tipos; `045e963` UI): coluna lateral (PF e PJ) com **Contas bancárias** (BankSelectField busca + cadastra banco na hora; modal criar + modal detalhe ver/editar/inativar, inativas ocultas) e **Anexos** (grade de miniatura/selo PDF; upload PDF+imagem; preview `<img>`/`<iframe>` + baixar + excluir). typecheck/lint/format verdes; build adiado (next dev ativo).
> - ✅ **Frontend — página "Cadastros"** (`870a0ef` api-client/tipos; `8c081ac` página+nav): rota `/cadastros` com abas **Bancos** e **Corretores** (D60), restrita a ADMIN+CADASTRO (nav na sidebar + avatar menu). CRUD leve: busca + lista + criar/editar + inativar via status. Corretor com `UserSelect` (vínculo opcional, D34).
> - ✅ **Fase 0 (cadastro) COMPLETA** — backend + frontend (contas/anexos no cliente + página Cadastros). _(Ajustes da parte 1 — contas/anexos — pendentes, a definir com o Flavio.)_ build adiado (next dev ativo).
> - ✅ **Fase B (contrato) — B.1 schema** (`73247a3`): migration `20260626130000_fechamento_contrato` — `SaleContract` (CRUD, não event-sourced), `SaleContractBroker`, `SaleContractExport`, 3 listas (Forma/Modalidade/Embalagem **seedadas**) + enums. Numeração `NNNN` começa em **1** (`0001/AA`). Smoke verde; dados intactos.
> - ✅ **Fase B — B.2 Passo 1 (a venda à vista cria o contrato)**: domínio `src/sale-contracts/` (support **puro** — normalizadores/financeiro/número/snapshots/view — + `SaleContractService` listar/detalhar, acesso **ADMIN+CADASTRO**); a venda à vista (`createSampleMovement`, normal **e liga**) passa a exigir **preço/saca + corretagens % (vend/comp) + ≥1 corretor** e cria o `SaleContract` `EM_ABERTO` na **mesma tx** do `SALE_CREATED` (sem novo event type), número `NNNN/AA` gerado sob `pg_advisory_xact_lock` (`AA` = ano de criação); **cancelar a venda remove** o contrato ainda `EM_ABERTO` (decisão híbrida). Métodos tx novos em `PrismaEventStoreTx`. Rotas GET `/api/v1/sale-contracts[/:id]`. **Front (lado da venda):** campos no `SampleMovementModal` + `BrokerMultiSelectField` + toast com o nº do contrato. Testes: unit (`sale-contract-support`) + integração (`sale-contract.integration`) + tests de venda existentes ajustados (fixtures de corretor). **Todos os gates verdes**.
> - ✅ **Fase B — B.2 Passo 2 (etapa 2 + máquina de status, backend)**: `SaleContractService` ganhou **`emitSaleContract`** (salva os campos da etapa 2 — vendedor/filiais/banco/armazéns/listas/datas/textos/peso/ágio —, monta os **snapshots**, recalcula o total **com ágio/deságio**, leva `EM_ABERTO`/`CONFERIR`→`CONFERIR` e grava **`SaleContractExport`**; **D48**: editar o vendedor sincroniza o `Sample.ownerClientId` via `updateRegistration`), **`confirmSaleContract`** (`CONFERIR`→`CONFIRMADO`, congela) e **`listContractLookups`** (as 3 listas). Tudo **CRUD direto** (sem trigger), **concorrência otimista por `version`**, gate **ADMIN+CADASTRO**. Cancelar a venda agora usa **`washoutOrDeleteSaleContractByMovement`** — `EM_ABERTO`→remove, `CONFERIR`/`CONFIRMADO`→**`WASH_OUT`**+motivo/data (híbrido). Rotas POST `/api/v1/sale-contracts/[id]/emit` e `/confirm` + GET `/api/v1/contract-lookups`. **PDF adiado p/ Fase C** ("Emitir" já registra a auditoria). **Todos os gates verdes** (incl. integration:db 305 + build).
> - ✅ **Fase B — B.3 (página "Contratos", frontend)**: rota `/contratos` (gate **ADMIN+CADASTRO**, nav na sidebar + avatar menu) — lista de **cards** com pílula de status + filtros (busca + status) + ações por status (`EM_ABERTO`→**Gerar documento**; `CONFERIR`→**Revisar**/**Editar**/**Confirmar**; `CONFIRMADO`/`WASH_OUT`→**Ver**). **Modal da etapa 2** (`SaleContractEtapa2Modal`, emit/view): vendedor (lookup `owner`, editável → D48), filiais PF (select + **"+cadastrar"** `ClientUnitModal`), **banco do vendedor** (`ClientBankAccountSelectField` novo: lista contas + **"+adicionar"** `ClientBankAccountModal`), armazéns (lookup amplo `any` + **liga `isWarehouse`/D49** via `updateClient`), nº-compra/peso/condição, **ágio/deságio** (campo opc.), Forma/Modalidade/Embalagem (selects das listas), datas, textos → `emitSaleContract`. Confirmar via diálogo (`confirmSaleContract`). Concorrência otimista (409→recarregar). Componentes em `components/contracts/`; CSS `ctr-*` isolado. _(Modal de AÇÃO central `.app-modal.is-themed.is-action` espelhando o `SampleMovementModal` — a skill `modals` prefere BottomSheet p/ ações; refatorar junto depois.)_ Gates verdes (typecheck/lint/format/build; backend intacto).
> - ✅ **Fase C — PDF do contrato**: `SaleContractPdfService.renderContractPdf` (`pdf-lib`, A4, estilo do app — cabeçalho verde + blocos B1–B10 + assinaturas; multi-página) a partir do `SaleContract`+snapshots; `issuer-config.js` (emissor fixo + **CNPJ via `CONTRACT_ISSUER_CNPJ`**, placeholder; assinatura do dono = linha em branco por ora). **On-demand, sem armazenar** (D32): handler `exportSaleContractPdf` (gate via `getSaleContract` ADMIN+CADASTRO; só status ≠ `EM_ABERTO`, senão 409) + rota GET `/api/v1/sale-contracts/[id]/pdf` (binário) + client `downloadSaleContractPdf` + botão **"Baixar PDF"** no card (`shareOrDownloadFile`). **Não impressos**: ágio/deságio + valor total (P21/P22), corretores, telefone/e-mail. Testes: unit (render→`%PDF` + formatadores) + integração (render de contrato emitido real). **Todos os gates verdes** (unit 317/integration:db 306/build). _(Fase C base; refinos pós-implementação nas S49–52 abaixo.)_
> - ✅ **S49 — `FATURADO`/`PAGO` (máquina pós-`CONFIRMADO`)** (`3709540`/`13c3cc5`/`7259882`/`4811771`): `Faturar` (`CONFIRMADO`→`FATURADO`), `Pagar` (`CONFIRMADO`/`FATURADO`→`PAGO`, **pode pular**) e `Desfazer` (volta 1 passo) — serviço + card + diálogo; **data real** `invoiced_at`/`paid_at` (migration `20260628120000_fechamento_faturado_pago`); destino do desfazer via helper puro `resolveRevertTarget`. Gate ADMIN+CADASTRO, CRUD + `version`.
> - ✅ **S50 — quebra manual `WASH_OUT` (resolve P17)** (`2078a50`/`83c6496`/`4811771` + `3709540`): botão **"Quebrar"** (de `CONFERIR`/`CONFIRMADO`/`FATURADO`/`PAGO`) → `washoutSaleContract` **delega ao `cancelSampleMovement`** (cancela a venda, restaura sacas, marca `WASH_OUT` + **motivo obrigatório**; definitiva). `washoutOrDeleteSaleContractByMovement` estendido p/ cobrir `FATURADO`/`PAGO`. Rota POST `/sale-contracts/[id]/washout`.
> - ✅ **S51 — conteúdo do PDF** (`2f69709`/`fda3503`): "Tipo" removido; **partes/armazéns** = Nome · CNPJ · IE · Endereço · Bairro · Cidade/UF · Número · CEP, **consolidado Client+fazenda** (PF puxa da `unit`), **sem "Filial"**; **campo sempre presente** (— quando vazio) no documento inteiro; `buildWarehouseSnapshot` ganhou IE; helper `formatCep`.
> - ✅ **S52 — layout do PDF em 1 PÁGINA** (`bdbba6a`/`cee6e2f`/`0bb668b`): título no corpo (centralizado) + **linha de identificação horizontal** (Nº contrato/compra/lote · Mês-Ano) + **Comprador|Armazém** e **Vendedor|Armazém** em **cards 2-col com borda**; corretagem/valores em faixas, pagamento 2-col, observações truncadas; título+número saíram do header verde (fica logo+emissor+status); **`scripts/preview-contract.mjs`** + guard `getPageCount()===1`. **Falta** (refinos): **CNPJ real** (env) · **assinatura do dono** imagem (D35) · **header verde** (redesign) · fidelidade ao print legado · ágio/total impressos (P21/P22) · P20 · **Futuro** (D50) · gestão das 3 listas. **Validar no device.**
> - ✅ **S53–S55 — Etapa 1/2 conferidas + venda consolidada na página (D61)** (ver log): refino do registro da venda (`lib/currency`, cadastro inline, 50/50) e da 1ª parte da Etapa 2; venda só pela página Contratos, detalhe da amostra só-leitura.
> - ✅ **S56 — wizard à vista de 2 passos (commit adiado, D62)** (`e7ae047`/`f9dbab6`): passo 1 só coleta (Tipo·Lote·**preview do nº**, sem Observações) → passo 2 "Gerar rascunho" cria a venda + contrato e emite no fim; **"Voltar"** preserva os dados; backend `getNextContractNumber` (`GET /sale-contracts/next-number`). 42 testes (contrato).
> - ✅ **S57 — fase pós-emissão (D63–D66; resolve P20)** (`1b15851` PDF · `5b41408` backend · `8a563d0` testes · `a4f52a8` prettier · `fabc24c` frontend): **PDF sem status** (D63); modal **"Visualizar"** (`SaleContractDocumentModal`: iframe do PDF + **Exportar**/compartilhar · **Baixar**/salvar · Fechar, D64); **ações do card** por status numa linha (`CONFERIR`=Visualizar·Editar·Confirmar; `CONFIRMADO`=Faturado·Pago·Visualizar·Washout; "Quebrar"→**"Washout"**, D65); **"Editar" edita a fase 1** — `emitSaleContract` aceita `saleFields` e sincroniza a venda via `SALE_UPDATED` (sacas+data ajustam o saldo; sacas travadas em liga F7.1; +5 testes → **47/47**), **resolve P20** (D66); **modo "view"/read-only do Etapa2 removido** (a leitura virou o Visualizar). Gates verdes. ⚠️ **Loose end:** o diálogo de confirmação do "Washout" ainda se intitula **"Quebrar contrato"** (`SaleContractLifecycleDialog`) — alinhar o texto ao botão.
> - **Desvios do rascunho** (decididos na implementação): `id` **uuid** em todas (consistência com o schema, não Int); `Broker.cpf`/`Broker.userId` **UNIQUE**; `ClientAttachment.fileName` adicionado (nome original p/ download); **sem auditoria nem `version`** no Grupo A (rascunho enxuto).

- **Fase 0 — Extensões do cadastro de Cliente.** _(COMPLETA — ver "Status da implementação" acima.)_ **Bancário** (D24/D28): tabela `Bank` (`id` **uuid**, nome,
  status) + `ClientBankAccount` por cliente (banco + agência + conta c/ dígito + titular + CNPJ/CPF + chave PIX),
  no padrão `ClientUnit`; UI nova no cadastro. **Anexos** (D27): `ClientAttachment` (independente do
  contrato; +`application/pdf` no allowlist + atualizar segurança). **Data de nascimento** (D36): coluna `Client.birthDate` (PF, opcional). Armazém não entra (D26). **O
  bancário precede a Fase B.**
- **Fase A — Emissor + corretor.** Promover `COMPANY_INFO` a módulo compartilhado + **CNPJ** (D29).
  Reaproveitar o logo + **imagem da assinatura do dono** (D35). Cadastro **`Broker`** ✅ (já feito na Fase 0 — corretores; `userId` opcional p/ métrica; não-usuário guarda CPF + telefone/e-mail, D40) (D34).
- **Fase B — Mercado à vista em 2 etapas (campo a campo).** Criar a tabela `SaleContract` (D11) via
  **migration nova**; numeração `NNNN/AA` (D15) e status (D14); partes/banco/armazém com **snapshots**
  (D12/D24/D25/D26) + corretores via `Broker` + `SaleContractBroker` (D34); financeiros (D17/18/19);
  corretagem só % (D44); pagamento/logística com listas mistas (D20); 2 blocos de texto livre (D30). Bump de `schemaVersion` + atualizar
  `sale-created.payload.schema.json` + `validate:schemas` + testes de contrato. Projetor escreve a
  `SaleContract`. **Etapa 1** = modal de venda (`SampleMovementModal.tsx`) cria o `EM_ABERTO` parcial (D43);
  **etapa 2** = nova **página "Contratos"** (D41): card → **"Gerar documento"** → modal → **"Emitir"**
  gera o PDF (D22/D46) → `CONFERIR`; depois **Revisar** → **Confirmar** (`CONFIRMADO`, congela) ou
  **Editar** (regenera) (D47). **Só vendas novas (D21).**
- **Fase C — PDF do Fechamento.** `renderFechamentoPdf` espelhando o layout do contrato legado
  (cabeçalho → partes → armazéns → valores → pagamento → 2 blocos de texto → assinaturas: imagem do dono
  - linhas em branco do comprador/vendedor, D35).
    **Sem qualidade** (D10).
- **Fase D — Geração + entrega.** _(✅ implementada p/ à vista — ver Status acima.)_ Geração ao **Emitir** na
  página de Contratos (D22 rev./D46); pode gerar **quem acessa** (gate **ADMIN**, D23 ajustada); entrega via
  `shareOrDownloadFile`/download **sem persistir** (D32, no modal "Visualizar" D64); auditoria na tabela
  **`SaleContractExport`** (D56 — **substitui** o `FECHAMENTO_EXPORTED` do rascunho/D33).

- **Fase E — Espelho de Corretagem ✅ (implementada — S61: `d04e1d1` backend + `67a8c50` frontend).** Documento **derivado, on-demand** (D70–D76), com
  **reuso pesado**: **PDF** novo `renderEspelhoPdf(contract, { side, issuer })` em
  `src/sale-contracts/sale-contract-pdf-service.js` (reusa o bloco do cabeçalho do emissor,
  `getContractIssuer()`, primitivas `grayLabel`/`boxRow`/`inlineBox` e os formatadores BRL/data/documento;
  guard de 1 página); **`issuer-config.js`** ganha `bankName`/`bankAgency`/`bankAccount` (+ env opcional,
  D74); **backend** `exportEspelhoPdf(contractId, side, actor)` em `backend-api.js` (carrega via
  `getSaleContract`, valida `status ∈ {CONFIRMADO, FATURADO, PAGO}` → senão 409, e `side ∈ {seller, buyer}`);
  **rota** `GET /api/v1/sale-contracts/[contractId]/espelho/pdf?side=seller|buyer` (binário, molde do
  `[contractId]/pdf`); **frontend** — **modo de seleção** em `app/contratos/page.tsx` + `SelectionModeHeader`
  - 3ª opção no `ContractCreateRadialFab` + modo seleção no `SaleContractCard` (mirror do `SampleCard`/liga)
  - novo `EspelhoCorretagemModal` (toggle Vendedor|Comprador, só-leitura, Exportar/Baixar) +
    `downloadEspelhoPdf` no api-client. **Acesso ADMIN** (herda `/contratos`). **Sem migration.** Testes: unit
    (render → `%PDF` + comissão do lado certo + TOTAL) + integração (render de contrato `CONFIRMADO` real, um
    por lado).

- **Fase F — Página Financeiro ✅ (implementada — S64: `611b8e9` backend + `33226c1` frontend).** Relatório **derivado, sem migration** (D77–D86). Desenho
  concreto validado por **multiagente** na S63.
  - **Backend** (`SaleContractService`, novo método `listBrokerReceivables`): gate próprio
    **`FINANCEIRO_ROLES = [ADMIN, COMMERCIAL]`** (`SALE_CONTRACT_MANAGE_ROLES` é ADMIN-only — não reusar).
    **2 queries** (não há `@relation` contrato↔broker): (1) contratos elegíveis — `status ∈
{CONFIRMADO,FATURADO,PAGO}` + `OR: [{ sellerBrokerageValue: { gt: 0 } }, { buyerBrokerageValue: { gt: 0 } }]`
    (`select` = `SALE_CONTRACT_VIEW_SELECT`); (2) **batch** dos corretores —
    `saleContractBroker.findMany({ where: { saleContractId: { in: ids } }, select: { saleContractId, brokerId, brokerNameSnapshot } })`,
    agrupados em JS. `cota = (sellerBrokerageValue + buyerBrokerageValue) ÷ brokers.length` (calculada; sem
    coluna). **ADMIN** → projeção completa (corretagem total + corretores + cotas). **COMMERCIAL** → resolve
    `prisma.broker.findUnique({ where: { userId: actor.actorUserId } })` (query nova), filtra aos contratos
    em que esse `brokerId` está, e projeta **valor total + corretagem total + só a cota dele** (D86, **sem**
    os outros corretores). Idiom "ADMIN tudo / COMMERCIAL só o seu" espelha `commercial-forms-service.js`
    (switch por papel + `actor.actorUserId`). Helpers puros no `-support.js`. **Rota** `GET /api/v1/financeiro`
    (4 camadas, molde `sale-contracts`).
  - **Frontend**: `app/financeiro/page.tsx` **role-adaptive** (molde `app/informe/page.tsx`:
    `useRequireAuth({ allowedRoles: ['ADMIN','COMMERCIAL'] })` → branch por `session.user.role`) +
    `components/financeiro/` (card `fin-*` recolhido/expandido clonando `ctr-card`; ADMIN com corretores +
    cotas, COMMERCIAL só a cota) + `listFinanceiro` no api-client + **nav** (`FINANCEIRO_NAV_ITEM` no
    `AppShell` gated `['ADMIN','COMMERCIAL']` + `renderNavIcon('financeiro')` + `isMainNavItemActive`; linha
    no `HeaderAvatarMenu` p/ mobile — a tabbar não tem slot) + CSS `fin-*`. **Total geral** + **busca**.
  - **Testes**: unit (soma/cota ÷ N/projeção por papel) + integração (ADMIN vê todos; COMMERCIAL só os seus
    e só a cota; sem `Broker`→vazio; outros papéis→403). **Sem schema novo.**

- **Fase G — Revisão de fluxos + design das páginas.** _(Nova — S67; **1ª frente ✅ na S68**.)_ Varredura
  **sistemática dos fluxos ponta a ponta** — à vista, Futuro, emitir→confirmar→faturar→pagar,
  washout/cancelar, Espelho, Financeiro, ágio pós-confirmação e "+ Adicionar" das listas — procurando
  **inconsistências, dead-ends e validações frágeis**; + **revisão visual** das páginas (`/contratos`,
  `/financeiro`, modais Etapa 2 / Visualizar / Espelho / ágio) contra o **design-system** e a
  **responsividade** (**P27**). Reconcilia as pendências abertas da S67 (**P23–P28**) e fecha o **"validar no
  device"** acumulado das Fases B–F. Sem schema novo previsto; cada sub-revisão com plano/aprovação próprios.
  - **✅ S68 — reconciliação das pendências (P23–P26, P28)**: **D92–D95** + exceção do ágio na D25 (ver log
    da Sessão 68). **Resta P27** (design das páginas) + a varredura de fluxos ponta a ponta + o "validar no
    device".
- **Fase I — Aprovação do contrato (etiqueta + auditoria).** _(S73 análise; S75 **fluxo fechado** — só
  registro, sem código.)_ Tornar a "Etiqueta de Aprovação" um **marco pós-emissão auditado** (**D107** +
  **D112–D114**): botão no **acordeão do card** (`EMITIDO`/`FATURADO`/`PAGO`) **e** leque "+" do `/samples` →
  **seletor de contratos reduzido** (todos os papéis não-PROSPECTOR; nº+comprador+data+sacas+busca, sem
  valores; endpoint próprio) com botão **"Manual"** → modal **pré-preenchido editável** (lotes ← `originLot`)
  ou em branco → imprime (**reusa `customPrintJob`**) + grava a auditoria em **tabela única** com vínculo
  **opcional** (nulo = avulsa; **sem coluna booleana**; payload = linhas impressas; nome proposto
  **`ApprovalLabelLog`**). **Não é status** (ortogonal); **sem selo** — só histórico (timeline do Detalhes,
  D108). **Campo a campo fechado (S76 → D115–D116)**: 5 campos diretos (**Armazém = sempre o do
  vendedor**) + lotes ← `declaredOriginLot` quebrado por **traço/espaço/vírgula/ponto-e-vírgula** (barra
  não; pedaço >16 corta em 16; >16 pedaços = 16 primeiros; texto original de referência no modal),
  **prefill montado no backend**. **Fluxo de UI fechado (S77 → D117)**: seletor só-elegíveis, mais recente
  primeiro, com busca + "Manual"; formulário com "Voltar"; **desktop = modais centrais / mobile = bottom
  sheet**; botão do card = **"Aprovação"**. **Funcionamento fechado (S78 → D118)**: linha do histórico =
  "há X tempo" + quem + nº + "Aprovação enviada" (sem payload na UI, sem resultado do print job); selo de
  status no seletor; 1 cópia por envio; validação "≥1 campo". **Escopo fechado (S79 → D119)**: auditoria
  **write-only desde o 1º dia**; o timeline vem depois, com o modal de Detalhes (D108); histórico **só no
  Detalhes**, linha **sem nº do contrato** ("há X tempo" + quem + "Aprovação enviada", data exata de
  apoio). **Fase I.a/I.b IMPLEMENTADAS (S80)** — migration `approval_label_log` + backend (3 endpoints
  `approval-labels`, envio auditado em tx única) + frontend (seletor + 2 portas), caminho não-auditado
  aposentado; **verificado no app real** (2 portas, vinculada + avulsa NULL, 409/404). **Resta: timeline
  no modal de Detalhes (→ Fase J) + validar no device.**
- **Fase J — Modal de Detalhes + timeline + auditorias de marcos/Espelho.** _(Nova — S81; desenho fechado
  em **D120–D125**, só registro.)_ Absorve a "fase futura" do timeline da Fase I e a parte do modal da
  D108/P27: **2 migrations** previstas (`sale_contract_status_log` D123 + `sale_contract_espelho_log`
  D124) + gravação nos handlers (Faturar/Pagar/Washout + `exportEspelhoPdf`) + **remoção do Desfazer**
  (D122: serviço/rota/diálogo/testes) + endpoint agregador do timeline + `SaleContractDetailsModal`
  (molde do modal de emissão, com o **PDF do contrato EMBUTIDO** — D126, coluna esquerda no desktop /
  primeira seção no mobile, Exportar/Baixar junto do preview) + **rewire dos botões do card** (D121, card
  enxuto; "Visualizar" sai do rodapé — D126) + **(proposta, a confirmar) aposentar o
  `SaleContractDocumentModal`** (absorvido pelo Detalhes). **IMPLEMENTADA (S83)** — 4 commits
  (`ec620ec` migrations · `aafc145` backend logs+timeline · `50cfd59` remoção do Desfazer · `7002f22`
  `SaleContractDetailsModal` + card enxuto + aposentadoria do Visualizar); **verificada no app real**
  (desktop central + mobile sheet; timeline com marco auditado e aprovação). **Resta: validar no
  device + "Visualizar" no MOBILE** _(nota pós-S83 do Flavio: o Visualizar SERÁ disponível no mobile;
  layout/funcionalidades do mobile serão discutidos em sessão futura — revisita a aposentadoria do
  `SaleContractDocumentModal` no contexto mobile)._

> **Fases 0/A/B/C/D ✅ implementadas — Mercado à vista E Futuro** (ver "Status da implementação" acima). O **contrato Futuro** (sem lote, D42/D51/D67/D68) foi implementado na S58. **Falta** (ambos os tipos): CNPJ real + assinatura do dono (imagem) + fidelidade ao print legado · gestão das 3 listas (**adicionar ✅ S66**; renomear/inativar adiado) · validar no device.

---

## Log de sessões

### 2026-06-24 — Sessão 1 (análise + frame)

- Análise via 4 agentes; **2 rodadas** → **D1–D6** (+ campo-a-campo, hoje D7). Doc criada + índice
  `docs/README.md` (#7). Commit `34c4af4`.

### 2026-06-24 — Sessão 2 (contrato legado + escopo)

- Print do contrato legado. **3ª rodada** → **D8/D9/D10**. Inventário + roadmap; P12/P13. Commit `a3d596b`.

### 2026-06-24 — Sessão 3 (arquitetura P12 + P1)

- **4ª rodada** → **D11** (`SaleContract`), **D12** (partes auto), **D13** (corretor = usuário). Commit `cf5e4a3`.

### 2026-06-24 — Sessão 4 (status + numeração)

- **5ª rodada** → **D14/D15/D16**. Commit `ca667c5`.

### 2026-06-24 — Sessão 5 (modelo financeiro)

- **6ª rodada** → **D17/D18/D19**. Commit `e415d5c`.

### 2026-06-24 — Sessão 6 (bloco operacional)

- **7ª rodada** → **D20/D21/D22/D23**. Commit `58472c2`.

### 2026-06-24 — Sessão 7 (extensões de cadastro — bancário)

- O Fechamento exige **extensões no cadastro de Cliente**. **8ª rodada** → **D24** (modelo bancário) e
  **D25** (snapshot). Nova seção "Impacto no sistema"; D20 revisada; Fase 0. Commit `bd22fbf`.

### 2026-06-24 — Sessão 8 (armazéns já existem)

- Verifiquei `isWarehouse` + lookup `kind='warehouse'`. **D26**: armazém sem entidade nova. P15 fechada.
  Commit `6103f4d`.

### 2026-06-24 — Sessão 9 (anexos do cliente)

- **D27**: `ClientAttachment` (PDF+imagens; Office descartado por ser ZIP genérico). Só arquivamento,
  independente do contrato. Implica +`application/pdf` no allowlist + atualizar segurança. Commit `51168fb`.

### 2026-06-24 — Sessão 10 (conta, emissor, textos, assinatura)

- **9ª rodada** → **D28** (campos da `ClientBankAccount`: agência + conta c/ dígito + titular + PIX),
  **D29** (emissor fixo em config + CNPJ a fornecer), **D30** (3 blocos de texto livre, sem cláusulas
  fixas — refina a D1) e **D31** (`corretorSignatureLines` 0–4). **P6/P7/P8/P14 fechadas.**
- Restam só **P10** (entrega) e **P11** (auditoria), de Fase D, + a **entrada do CNPJ**.
- **Próximo**: desenhar as tabelas (`Bank`/`ClientBankAccount`/`ClientAttachment`/`SaleContract`) como
  **rascunho para revisão** (o usuário lembrou que ainda há muito a decidir — não é o desenho final).

### 2026-06-24 — Sessão 11 (entrega + auditoria)

- **10ª rodada** → **D32** (PDF baixado/compartilhado, **sem persistir** — regenerável da `SaleContract`)
  e **D33** (novo evento **`FECHAMENTO_EXPORTED`**). **P10/P11 fechadas.**
- **Todas as pendências catalogadas resolvidas**; resta só **P2** (campo a campo) + a entrada do **CNPJ**.
- **Próximo**: desenhar as tabelas (`Bank`/`ClientBankAccount`/`ClientAttachment`/`SaleContract`) como
  **rascunho para revisão** — ainda não é o desenho final.

### 2026-06-24 — Sessão 12 (corretores N + assinatura)

- **D34** (revisa D13): corretores = **N por contrato** via `SaleContractBroker` (`userId` anulável p/
  **métrica por usuário** + `nome` snapshot); corretor não-usuário = só nome. Escolhido o modelo de
  **tabela de ligação** (vs JSON) justamente para a métrica.
- **D35** (substitui `corretorSignatureLines` da D31): assinatura do corretor/empresa = **imagem fixa do
  dono** (asset do emissor, D29), impressa automaticamente; comprador e vendedor = **linhas em branco**
  (à mão).
- **Próximo**: desenhar as tabelas (`Bank`/`ClientBankAccount`/`ClientAttachment`/`SaleContract` +
  `SaleContractBroker`) como rascunho para revisão.

### 2026-06-24 — Sessão 13 (cadastro de corretores)

- Flavio quer métrica **também** para corretores não-usuários. O modelo anterior (D34) guardava o
  não-usuário só como **nome solto** → não reutilizável nem metric-friendly (mesmo problema que o banco
  evitou). **Refinada a D34**: cadastro **`Broker`** (id, nome, `userId` anulável, status) para TODOS os
  corretores; `SaleContractBroker` aponta para `brokerId`. Métrica por corretor; usuário via
  `Broker.userId`. Espelha o `Bank`.
- **Próximo**: desenhar as tabelas (`Bank`/`Broker`/`ClientBankAccount`/`ClientAttachment`/`SaleContract`/`SaleContractBroker`)
  como rascunho para revisão.

### 2026-06-24 — Sessão 14 (data de nascimento PF)

- **D36**: aproveitar as mudanças no cadastro para adicionar `Client.birthDate` (data) **só para PF**,
  **opcional**, **só cadastro** (não entra no Fechamento — o contrato legado não traz). Coluna simples,
  sem tabela nova. Entra na Fase 0 junto com as demais mudanças do cadastro.
- **Próximo**: desenhar o rascunho das tabelas + o ajuste de campos do `Client`.

### 2026-06-24 — Sessão 15 (blocos para revisão campo a campo)

- A pedido do Flavio, dividi os campos do contrato em **10 blocos** (Identificação, Comprador, Armazém
  do comprador, Vendedor, Armazém do vendedor, Corretagem, Quantidade & valores, Pagamento & logística,
  Observações, Assinaturas) — seção **"Blocos do Fechamento"**. Estrutura a **P2** e guiará o formulário
  (D9) e o PDF (Fase C). (Os PDFs `formularios-campos.pdf`/`laudo-preview.pdf` são de outro agente.)
- **Próximo**: revisar **bloco a bloco, campo a campo** — comportamento de cada campo + campos faltantes.

### 2026-06-24 — Sessão 16 (revisão B1 — parcial)

- **B1 (parcial)**: confirmados Data do Contrato = data da venda, editável; Número de Compra opcional;
  **Mês/Ano removidos** (deriváveis da data). **Status: opções ainda em revisão.**
- ⚠️ **Correção registrada**: cheguei a concluir que "Modalidade = tipo de operação" e a ligar "à
  vista/futuro" à Modalidade — **o Flavio NÃO disse isso** (só citou termos vistos em outro sistema:
  Futuro, mercado à vista, replicado). **Revertido**: Modalidade volta a "lista mista (D20)", a definir
  no B8; esses termos não estão decididos. _Lição: não concluir/registrar sem confirmação._
- **Próximo**: continuar a revisão do **Status** do B1, sem suposições.

### 2026-06-24 — Sessão 17 (B1: status mantido + campo Tipo)

- **Status** do B1: **mantidos os 4** (sem mudança).
- **Novo campo `Tipo`** (da operação): opções **Futuro / Mercado à vista / Wash-out** (D37) — campo
  **distinto** da Modalidade. Comportamento confirmado: **obrigatório, sem default, lista cadastrável** (inicia com os 3).
- **B1 fechado** ✅. **Próximo**: revisar **B2 — Comprador**.

### 2026-06-24 — Sessão 18 (B2 — Comprador: campos)

- **B2 campos** ✅: exibidos no contrato — Nome/Razão social, CPF/CNPJ, Inscrição Estadual, Endereço,
  Cidade/UF. **Telefone e e-mail removidos** (não entram no contrato). Funcionalidades específicas
  (editável etc.) **adiadas**.
- **Próximo**: **B3 — Armazém do comprador**.

### 2026-06-24 — Sessão 19 (B3/B4/B5 — mesmos campos do comprador)

- Flavio: **Armazém do comprador (B3), Vendedor (B4) e Armazém do vendedor (B5) usam os mesmos campos do
  comprador** — Nome/Razão social, CPF/CNPJ, IE, Endereço, Cidade/UF (sem telefone/e-mail). Só muda a
  origem (B3/B5 = cliente-armazém via lookup D26; B4 = `ownerClient` D12). Comportamentos específicos depois.
- **Próximo**: **B6 — Corretagem**.

### 2026-06-24 — Sessão 20 (B6 — Corretagem)

- **B6 campos** ✅: corretores **NÃO impressos** no contrato (só registro/métrica via D34); **corretagens
  do vendedor e do comprador entram, exibindo apenas a %** (o R$ da D19 fica interno).
- Pendente reavaliar no B7: se o contrato mostra só %, talvez a entrada da corretagem seja só % (vs. "% ou R$" da D19).
- **Próximo**: **B7 — Quantidade & valores**.

### 2026-06-24 — Sessão 21 (B7 — Quantidade & valores)

- **B7 campos** ✅: **impressos** Quantidade (sacas), Peso (Kg), Preço por saca. **NÃO impressos** Ágio/Deságio
  e Valor total (ficam internos/calculados, D18).
- **Próximo**: **B8 — Pagamento & logística** (definir a lista da Modalidade, Banco do vendedor, etc.).

### 2026-06-24 — Sessão 22 (B8 — Pagamento & logística)

- **B8 campos** ✅ (todos impressos): **Condição de Pagamento = texto livre**; **Forma de Pagamento
  {Faturado, Livre}**; **Modalidade {Retirar, Posto, Disponível}**; **Embalagem** (renomeia "Sacaria")
  **{Sacas, Bags, A granel}**; **Datas de Faturamento e Pagamento** escolhidas pelo usuário; **Banco do
  vendedor** puxa **Banco/Agência/Conta/CNPJ-CPF/Chave PIX** do cadastro.
- Pendente: (a) Forma/Modalidade/Embalagem fixas ou cadastráveis? (b) reconciliar banco **CNPJ/CPF** (B8)
  vs. **titular** (D28).
- **Próximo**: resolver os 2 detalhes e ir pro **B9 — Observações**.

### 2026-06-24 — Sessão 23 (B8 — detalhes finais)

- **B8 fechado** ✅: listas Forma/Modalidade/Embalagem **cadastráveis** pelo admin (iniciam com os valores
  dados); conta bancária (`ClientBankAccount`) guarda **nome + CNPJ/CPF do titular** (revisa D28; titular
  pode diferir do cliente). No contrato: Banco/Agência/Conta/CNPJ-CPF/Chave PIX.
- **Próximo**: **B9 — Observações** e **B10 — Assinaturas**.

### 2026-06-24 — Sessão 24 (revisão geral dos blocos concluída)

- **B9 ✅** (3 blocos de texto livre, impressos) e **B10 ✅** (assinatura do dono em imagem + linhas em
  branco do comprador/vendedor, D35).
- **Revisão geral "quais campos" dos 10 blocos: CONCLUÍDA.** Flavio sinalizou que a **análise precisa
  campo a campo** (comportamento/validação detalhada) vem **depois** (parte restante da P2).
- **Próximo**: a combinar — rascunho das tabelas (`Bank`/`Broker`/`ClientBankAccount`/`ClientAttachment`/
  `SaleContract`/`SaleContractBroker`), ou a análise detalhada campo a campo, ou outra frente.

### 2026-06-25 — Sessão 25 (dados do cadastro: validação das extensões)

- **D38**: ao registrar, o **lote liga só ao `Client`** (sem fazenda); a **filial do cliente PF é
  escolhida na venda/Fechamento** (como o comprador já faz via `buyerUnitId`) e congela no snapshot (D25).
  Resolve "de qual fazenda PF puxar". Registrada a **assimetria PF×PJ** em "Cadastro de Cliente hoje".
- **Extensões de cadastro a adicionar — todas já anotadas**: data de nascimento PF (**D36**), anexos do
  cliente (**D27**), dados bancários (**D24/D28**).
- **Campos do bancário confirmados pelo Flavio** (batem 100% com o pedido): Nome do banco · Agência ·
  Conta · Titular · CPF/CNPJ do titular · Chave PIX (`ClientBankAccount` D28; nome do banco via `Bank` D24).
- **Resolvido** (Flavio): **`Bank`** ganha **código COMPE** (3 díg.) além de nome + status → **D39**; o
  **`Broker` não-usuário** ganha **CPF + telefone/e-mail** além de nome + status → **D40**.
- **Estruturas do cadastro fechadas**: `Bank` (nome+código+status), `ClientBankAccount` (D28),
  `ClientAttachment` (D27), `Client.birthDate` (D36) e `Broker` (nome+CPF+contato+`userId`+status).
- **Próximo**: rascunho das tabelas (`Bank`/`Broker`/`ClientBankAccount`/`ClientAttachment` +
  `SaleContract`/`SaleContractBroker`), ou a análise campo a campo (P2).

### 2026-06-25 — Sessão 26 (arquitetura de Contratos: página + tipos + 2 etapas)

- Nova **página "Contratos"** (lista + cria) → **D41**. **3 tipos** (Mercado à vista / Futuro / CPR), enum
  **fixo**; **só à vista e Futuro geram o Fechamento (PDF), CPR não** → **D42** (substitui D37: o antigo
  campo "Tipo" cadastrável sai; "Contratos" = guarda-chuva, "Fechamento" = o documento gerado).
- **Fluxo em 2 etapas** (D41/**D43**): a **venda** (página do lote, **só Mercado à vista**) captura
  comprador/data/sacas/preço-saca/corretagens %/corretores e cria a `SaleContract` **`EM_ABERTO` parcial**;
  outra pessoa **completa na página de Contratos** (conferência + vendedor/filial PF + banco + armazéns + nº
  compra + pagamento/logística + textos + datas) e só então o **PDF é gerado** → `CONFIRMADO`.
- **Corretagem** (**D44**, resolve B6/B7): vendedor e comprador **separados**, entrada **só em %**, **N** corretores.
- **`WASH_OUT`** vira **status** (quebra de contrato) no enum da D14 → **D45** (acionamento a definir, P17).
- Revisões em cascata: **D4** (financeiro = etapa 1), **D9** (2 etapas), **D11** (por ora só à vista), **D14**
  (`EM_ABERTO`=incompleto + `WASH_OUT`), **D19** (só %), **D22** (PDF ao completar). Permissão **D23** mantida (todos).
- Novas pendências: **P16** (Futuro/CPR), **P17** (acionamento `WASH_OUT`), **P18** (etapa de Peso/ágio).
- **Próximo**: detalhar Futuro/CPR + rascunho das tabelas, ou análise campo a campo (P2). **Doc desta sessão
  (D41–D45) NÃO commitado ainda.**

### 2026-06-25 — Sessão 27 (fluxo de emissão: card → Emitir → CONFERIR)

- Detalhado o **fluxo de emissão** (Mercado à vista) → **D46**: a venda no lote gera o **número** (`NNNN/AA`,
  etapa 1) e cria a `SaleContract` `EM_ABERTO`; na página de Contratos, cada contrato é um **card** →
  **"Gerar documento"** abre o modal da etapa 2 → **"Emitir"** gera o **PDF** e move o status p/ **`CONFERIR`**.
- **`CONFERIR`** = status novo entre `EM_ABERTO` e `CONFIRMADO`; os demais status da D14 se mantêm (D14 revisada).
- **Geração única/regenerável** (D32): o PDF do "Emitir" já é o documento — a conferência é etapa de status,
  **não** há "documento de teste" separado (corrige a 1ª descrição).
- **Número** nasce na **etapa 1**; cancelar a venda pode deixar **gap** na sequência (D15, ok pelo Flavio).
- Rótulos: **"Gerar documento"** (card) e **"Emitir"** (modal). Revisões D14/D15/D22; nova pendência **P19**
  (fluxo pós-`CONFERIR`, que o Flavio ainda decide).
- **Próximo**: o que vem **depois do `CONFERIR`** (P19) + Futuro/CPR / rascunho das tabelas. **Doc (D38–D46) NÃO commitado.**

### 2026-06-25 — Sessão 28 (pós-`CONFERIR`: Revisar / Confirmar / Editar)

- Fechado o fluxo **pós-`CONFERIR`** (resolve **P19**) → **D47**: no card em `CONFERIR`, **"Revisar"** abre o
  modal → **"Confirmar"** leva a `CONFIRMADO` **sem novo PDF**; **"Editar"** abre os campos das **etapas 1 e
  2** → **"Emitir"** regenera o PDF e mantém `CONFERIR`. Fica em `CONFERIR` até confirmar.
- **Congelamento (refina D25)**: dados editáveis até `CONFIRMADO`; ao **Confirmar**, congelam (imutável).
- Rótulos confirmados (resposta 1a): card = **"Gerar documento"**, modal = **"Emitir"**.
- **Nova pendência P20**: o "Editar" altera campos da **etapa 1** (venda) → conciliar com o `SampleMovement`
  (event store **append-only**): reprojetar/evento de correção vs `SaleContract` com cópia editável.
- **Próximo**: Futuro/CPR (na página de Contratos) + rascunho das tabelas, ou P20/análise campo a campo. **Doc (D38–D47) NÃO commitado.**

### 2026-06-25 — Sessão 29 (conferência campo a campo — Etapa 1)

- Início da **conferência campo a campo na ordem do fluxo** (parte da P2). Nova seção "Comportamento campo a
  campo (por fase do fluxo)".
- **Etapa 1 (venda) conferida**: Comprador (manual, obrig.; **filial vai p/ etapa 2**) · Data (default hoje,
  editável p/ passado/futuro) · Sacas (≤ saldo; liga = 100%) · Preço/saca (obrig., R$ `Decimal(12,2)`, > 0) ·
  Corretagens vendedor/comprador (obrig., **default 0**, `%` 0–100, separadas) · Corretores (**≥ 1**, N).
- **Filial do comprador → etapa 2** (refina D38/D43): a venda escolhe só o Cliente; as filiais (PF) do
  vendedor e do comprador entram na etapa 2.
- **Próximo**: conferência da **Etapa 2** (campo a campo), depois Futuro/CPR / rascunho das tabelas. **Doc (D38–D47) NÃO commitado.**

### 2026-06-25 — Sessão 30 (conferência Etapa 2 — partes/filiais)

- **Etapa 2, grupo partes** conferido: **Número do lote** (auto, só leitura) · **Vendedor** (auto do lote,
  **editável**) · **Filial do vendedor** e **do comprador** (manuais, **obrigatórias só p/ PF**, somem p/ PJ).
- **D48**: editar o **vendedor** no contrato **sincroniza o `Sample.ownerClientId`** (contrato→amostra), em
  qualquer edição — inclusive após gerar (→ regenerar, D47). (Comprador = venda append-only → P20.)
- **Próximo**: grupo 2b (banco/armazéns), depois 2c/2d/2e da Etapa 2. **Doc (D38–D48) NÃO commitado.**

### 2026-06-25 — Sessão 31 (conferência Etapa 2 — banco & armazéns)

- **Banco do vendedor** (obrigatório): seleciona 1 conta do vendedor (`ClientBankAccount`, D28); se faltar a
  conta, **+adicionar no dropdown** (modal rápido); **não fica vazio**.
- **Armazéns (comprador e vendedor)** — **D49**: lookup **amplo** (todos os clientes, não só `isWarehouse`);
  selecionar um não-armazém **liga `isWarehouse=true`** no cadastro (mantém os outros tipos), análogo à D48.
  Ambos **opcionais**. (Revisa D26; atualiza B3/B5.)
- **Próximo**: grupo 2c (nº compra · Peso (Kg) · ágio/deságio = P18), depois 2d/2e. **Doc (D38–D49) NÃO commitado.**

### 2026-06-25 — Sessão 32 (conferência Etapa 2 — nº compra, peso, ágio/deságio, total)

- **Número de compra** — manual, **opcional**, texto livre (referência de compra **externa**, D16).
- **Peso (Kg)** — manual, **opcional**, `Decimal(10,2)`, impresso (D17).
- **Ágio/deságio** — **sai do formulário**: vira **botões no card** (refina D18; detalhe → **P21**). **Resolve a
  P18** (peso → etapa 2; ágio → P21).
- **Valor total** — **calculado e salvo**, **não exibido** no modal/PDF; onde apresentar a decidir → **P22**.
- **Próximo**: grupo 2d (pagamento/logística), depois 2e (textos). **Doc (D38–D49) NÃO commitado.**

### 2026-06-26 — Sessão 33 (conferência Etapa 2 — pagamento & logística)

- **Condição de Pagamento** — manual, **opcional**, texto livre (D20).
- **Forma de Pagamento** {Faturado, Livre} · **Modalidade** {Retirar, Posto, Disponível} · **Embalagem**
  {Sacas, Bags, A granel} — listas cadastráveis, **obrigatórias**, **começam sem seleção** (força escolha) (D20).
- **Data de Faturamento** · **Data de Pagamento** — **obrigatórias**, sem default "hoje" (B8).
- **Próximo**: grupo 2e (textos livres) — fecha a Etapa 2. **Doc (D38–D49) NÃO commitado.**

### 2026-06-26 — Sessão 34 (conferência Etapa 2 — textos livres; Etapa 2 fechada)

- **Textos livres** (D30/B9): **3 blocos**, **opcionais**, **texto livre sem limite**. **1 rotulado
  "Observações"** + **2 genéricos** (sai o "Descrição" nomeado); rótulo dos genéricos no PDF = Fase C.
- **Etapa 2 conferida** ✅ — com isso a **conferência campo a campo do fluxo de Mercado à vista está
  completa** (Etapas 1 e 2).
- Restam parados de propósito: **P20** (editar etapa 1 vs append-only), **P21** (botões ágio/deságio),
  **P22** (onde exibir o total).
- **Próximo**: Futuro/CPR (página de Contratos) + rascunho das tabelas, ou resolver P20–P22. **Doc (D38–D49) NÃO commitado.**

### 2026-06-26 — Sessão 35 (ajustes na Etapa 2: filiais, embalagem, textos)

- **Filiais (vendedor e comprador)**: além de selecionar, **cadastrar a filial na hora** se não existir (como o banco).
- **Embalagem**: valor **"Sacas" → "Sacaria"** → {Sacaria, Bags, A granel} (D20/B8).
- **Textos livres**: voltam a **2 blocos nomeados** — **Observações** + **Descrição** (revê a Sessão 34, que tinha
  1 Obs + 2 genéricos). Opcionais, sem limite (D1/D30).
- **Próximo**: Futuro/CPR + rascunho das tabelas, ou P20–P22. **Doc (D38–D49) NÃO commitado.**

### 2026-06-26 — Sessão 36 (Mês/Ano derivados no documento)

- **Mês** e **Ano** voltam ao contrato como campos **derivados automaticamente** da Data do Contrato
  (não preenchidos): **Mês por extenso** (maio, junho…) e **Ano com 4 dígitos** (2026…). Impressos no documento.
- Reativa o que a **S16** havia removido — agora confirmados como **saída derivada** (B1/inventário).
- **Próximo**: Futuro/CPR + rascunho das tabelas, ou P20–P22. **Doc (D38–D49) NÃO commitado.**

### 2026-06-26 — Sessão 37 (Futuro + CPR removido + entradas pela página)

- **CPR removido** → só **Mercado à vista** e **Futuro** (D42, D37, B1, inventário, P16 atualizados).
- **Mercado à vista**: 2 entradas — via lote (atual) **e** via página de Contratos (lápis → à vista →
  **seleção de lote obrigatória** → fases 1+2 em **2 modais seguidos**, registra a venda no lote). **Não dá pra pular o lote** (D50).
- **Futuro**: criado **só pela página**, **sempre sem lote** (café ainda não existe); fases 1+2 em 2 modais → **D50**.
- **Seletor de tipo via lápis** (padrão da pág. Relatórios).
- **Modelagem do Futuro sem lote** = **P16** (Flavio: não definir `movementId` opcional agora — fica para o rascunho).
- **Próximo**: conferir os **campos do Futuro** (vendedor manual?, sacas livres?, etc.) + rascunho das tabelas. **Doc (D38–D50) NÃO commitado.**

### 2026-06-26 — Sessão 38 (campos do Futuro)

- **Futuro** conferido: **idêntico** ao Mercado à vista (campos, status, PDF), **exceto** — **vendedor manual**
  (lookup, sem lote), **sacas livres** (sem saldo), **sem número de lote**. Na prática muda só que as
  **datas de faturamento/pagamento** costumam ser futuras. Registrado na seção de comportamento campo a campo.
- Com isso, a **conferência campo a campo dos dois tipos (Mercado à vista + Futuro) está completa**.
- **Próximo**: rascunho das tabelas (schema Prisma) ou resolver P16/P20/P21/P22. **Doc (D38–D50) commitado em `f9f1f4e`, não pushado.**

### 2026-06-26 — Sessão 39 (rascunho das tabelas)

- Em **plan mode**, 3 rodadas de perguntas → **D51–D58** + nova seção **"Rascunho das tabelas (para revisão)"**
  (Grupos A cadastro / B listas / C contrato + enums). Plano em `~/.claude/plans/witty-sparking-cloud.md`.
- **Decisões**: persistência uniforme do `SaleContract` (Futuro 100% no contrato; à vista `movementId` 1:1) →
  **resolve P16**; edição reflete na venda/lote (D52); snapshots JSON (D53); 3 lookups (D53); ágio/deságio R$
  **por saca** — corrige D18 (D54); corretagem %+R$ (D55); auditoria em tabela própria `SaleContractExport` —
  **revisa D33** (D56); número contínuo+espelho int (D57); `WASH_OUT` +motivo/data (D58).
- Pendências reescopadas: **P20** (mecanismo de editar venda append-only), **P17** (acionamento), **P21**, **P22**.
- **Próximo**: Flavio revisa o rascunho → implementar (Fase 0: cadastro). **Doc desta sessão (D51–D58 + rascunho) commitado em `824180d`.**

### 2026-06-26 — Sessão 40 (implementação Fase 0: schema + backend Bank/Broker)

- **Implementação da Fase 0 iniciada.** 2 agentes de exploração mapearam os padrões do projeto (schema,
  service+support, `backend-api`, rotas, upload) antes de escrever qualquer código.
- **Schema + migration** (`6178106`): `Bank`, `Broker`, `ClientBankAccount`, `ClientAttachment`,
  `Client.birthDate`, enum `LookupStatus`. Migration **manual aditiva** `20260626120000_fechamento_cadastro`,
  aplicada local via `migrate deploy` — **dados existentes intactos** (verificado).
- **DESCOBERTA: drift `schema.prisma`↔banco** — o banco tem índices trigram GIN + colunas `GENERATED` que o
  Prisma não modela, então `prisma migrate dev` geraria DROPs espúrios (dropando esses objetos que a produção
  usa). Convenção correta = **migration manual aditiva + `migrate deploy`**. Documentado na skill `prisma`.
- **Backend `Bank` + `Broker`** (`51c92b6`): service + support + rotas REST (`/api/v1/banks`,
  `/api/v1/brokers`) + 25 testes unitários DB-free (normalização, auth, uniques, 404). Gates verdes
  (typecheck/lint/format/272 unit).
- **Decisões S40**: acesso ao cadastro = **qualquer usuário logado** (**D59**; o ajuste `2627aff` removeu o gate
  ADMIN+CADASTRO inicial); telas em **página "Cadastros" com abas** (**D60**).
- **Próximo**: backend `ClientBankAccount` + `ClientAttachment` (+ upload PDF) + frontend (página "Cadastros" +
  contas/anexos no detalhe do cliente + nav). **Nada pushado.**

### 2026-06-26 — Sessão 41 (backend ClientBankAccount + ClientAttachment)

- **`ClientBankAccount`** (`c695a69`): `ClientBankAccountService` (src/clients) — list/create/update escopados
  por cliente; valida cliente (404) e banco (422); `holderTaxId` CPF/CNPJ sem checksum; **sem hard delete**
  (inativação via status, coerente com `ClientUnit`). Rotas `/clients/[id]/bank-accounts`. 12 testes DB-free.
- **`ClientAttachment` + upload de PDF** (`49ce3cf`): `saveClientAttachment` no upload service (allowlist +`application/pdf`, validação por **magic bytes** `%PDF` — nunca pelo Content-Type declarado);
  `ClientAttachmentService` (list/add/delete; view **não** expõe `storagePath`/checksum; delete remove
  row+arquivo). Rotas upload(multipart)/list/download(inline, guard UUID + path-traversal, client
  compartilhado)/delete. **Segurança**: CLAUDE.md #5 + SECURITY + skill conventions atualizados (PDF só p/
  anexo de cliente; foto de amostra segue imagens-only). 9 + 3 testes.
- **Smoke real** contra o banco (cria→lê→limpa, sem TRUNCATE): bancos, contas (com banco incluído) e anexos
  OK — valida os `select`/relações que o prisma fake não cobre.
- **Backend da Fase 0 COMPLETO.** Próximo: **frontend** (página "Cadastros" com abas D60 + contas/anexos no
  detalhe do cliente + nav + `api-client`). **Nada pushado.**

### 2026-06-26 — Sessão 42 (frontend parte 1: contas/anexos no detalhe do cliente)

- Plan mode + Q&A — decisões: seletor de banco **busca + cadastro inline**; anexos com **miniatura/preview**;
  contas **iguais às Filiais**. Plano em `~/.claude/plans/witty-sparking-cloud.md`.
- **api-client + tipos** (`f0383fe`): `listBanks`/`createBank`; list/create/update de conta; list/upload/delete
  de anexo + `clientAttachmentDownloadUrl`; tipos espelhando a view do backend.
- **UI** (`045e963`): 4 componentes em `components/clients/` (`BankSelectField`, `ClientBankAccountModal`,
  `ClientBankAccountDetailModal`, `ClientAttachmentPreviewModal`) + integração no detalhe do cliente (coluna
  lateral, **PF e PJ**; `fetchData` busca contas/anexos em paralelo, tolerante a falha). CSS isolado no fim de
  `globals.css`. Reusa o padrão das Filiais (cards mini, `app-modal`, `cudm-*`).
- Gates: typecheck/lint/format verdes. **Build adiado (next dev ativo).** Nada pushado.
- **Próximo**: validar no device + página "Cadastros" (Bancos/Corretores, D60).

### 2026-06-26 — Sessão 43 (frontend parte 2: página Cadastros)

- Plan mode + Q&A — acesso = **ADMIN+CADASTRO**; corretor com **UserSelect** (vínculo opcional). Plano em
  `~/.claude/plans/witty-sparking-cloud.md`.
- **api-client + tipos** (`870a0ef`): tipos `Broker`/`BrokerInput`/responses + `updateBank`, `listBrokers`,
  `createBroker`, `updateBroker`.
- **Página + nav** (`8c081ac`): rota `/cadastros` (guard ADMIN+CADASTRO) com abas **Bancos**/**Corretores** —
  busca + lista de cards + criar/editar + inativar via status; `BankFormModal` + `BrokerFormModal` (UserSelect
  p/ vínculo do corretor). Nav: item "Cadastros" na sidebar (`AppShell`) + linha no avatar menu
  (`HeaderAvatarMenu`), gated ADMIN+CADASTRO. CSS isolado (`cad-tabs`/`cad-row`).
- **Fase 0 (cadastro) COMPLETA** (backend + frontend). Ajustes da parte 1 (contas/anexos) pendentes, a definir.
  Gates verdes; **build adiado (next dev ativo)**. Nada pushado.

### 2026-06-26 — Sessão 44 (Fase B parte 1: schema do contrato)

- Plan mode + multiagentes (fluxo de venda/eventos; seed/gerador/schemas) + Q&A — **NNNN começa em 1**;
  **venda à vista cria o contrato** (D43 confirmado). Plano em `~/.claude/plans/witty-sparking-cloud.md`.
- **Schema + migration** (`73247a3`, `20260626130000_fechamento_contrato`, MANUAL aditiva): enums
  SaleContractType/Status/AgioDesagioType; `SaleContract` (**CRUD, não event-sourced**; `contractSeq` Int
  @unique + `contractNumber` NNNN/AA; vínculos `sampleId?`/`movementId?` 1:1; partes/banco/armazéns = colunas
  escalares + snapshot JSON, **FKs só no SQL da migration**; financeiro/pagamento/textos); `SaleContractBroker`
  - `SaleContractExport`; 3 listas (Forma/Modalidade/Embalagem) **seedadas na migration** (INSERT idempotente).
    Smoke verde (2/3/3, tabelas vazias, dados intactos). Gates verdes; skill prisma atualizada.
- **Quebra da Fase B**: **B.1 schema ✅** · B.2 backend (`ContractService`: gerador NNNN/AA; criar na venda à
  vista via `appendEventBatch`+`beforeCommit` SEM novo event type; etapa 2; status) · B.3 frontend (campos na
  venda + página "Contratos"). PDF = Fase C; entrega = Fase D.
- **Próximo: B.2 (backend do contrato).** BUILD adiado (next dev ativo). Nada pushado.

### 2026-06-26 — Sessão 45 (Fase B.2 Passo 1: a venda à vista cria o contrato)

- Plan mode + multiagentes (fluxo de venda, `appendEventBatch`/`beforeCommit`, gerador, padrões de
  service/rotas) + Q&A — **4 decisões**: fatiar B.2 em 2 passos; `AA` = **ano de criação**; cancelar a venda =
  **híbrido** (remove `EM_ABERTO`; `WASH_OUT` p/ emitidos no Passo 2); gestão de Contratos = **ADMIN+CADASTRO**.
  Plano em `~/.claude/plans/witty-sparking-cloud.md`.
- **Fatia vertical "venda à vista → contrato"** (NOT NULL em `unit_price`/`total_value` força os campos já no
  modal de venda, senão vendas quebram):
  - Domínio novo `src/sale-contracts/` (`sale-contract-support.js` puro + `sale-contract-service.js`
    listar/detalhar, gate ADMIN+CADASTRO).
  - `PrismaEventStoreTx`: `allocateNextContractSeq` (`pg_advisory_xact_lock` transacional + `MAX+1`;
    **`$executeRaw` no lock** — `pg_advisory_xact_lock` retorna `void`), `createSaleContract`,
    `createSaleContractBrokers`, `loadBrokersByIds`, `deleteOpenSaleContractByMovement`.
  - `createSampleMovement` (normal **e** `_createBlendCascadeMovement`): SALE exige preço/saca + corretagens %
    - ≥1 corretor; cria o contrato no `beforeCommit` (liga = 1 contrato no movimento **raiz**). Cancelamento
      (normal + cascata) remove o contrato `EM_ABERTO`. `SALE_CREATED` **inalterado** (termos só no `sale_contract`).
  - Rotas GET `/api/v1/sale-contracts[/:id]` + handlers (`listSaleContracts`/`getSaleContract`) + wiring; o
    handler `createSampleMovement` passou a repassar os campos novos.
  - Front: `BrokerMultiSelectField` + campos no `SampleMovementModal` (validação inline pt-BR) + toast com o nº
    do contrato no `SampleMovementsPanel`; `api-client`/`types` estendidos (`listSaleContracts`/`getSaleContract`,
    `CommandResponse.saleContract`).
- **Testes**: unit `sale-contract-support` + integração `sale-contract.integration` (venda→contrato, 0001/0002,
  liga, cancelar, gate 403); vendas dos testes existentes ajustadas via `tests/helpers/sale-contract-fixtures.js`.
  **Gates 100% verdes** (typecheck/lint/format/schemas/contracts/unit 307/integration:db 295/build).
- **Falta**: B.2 Passo 2 (etapa 2 + status + `WASH_OUT`) · B.3 (página "Contratos") · PDF (Fase C). Nada pushado.

### 2026-06-26 — Sessão 46 (Fase B.2 Passo 2: etapa 2 + máquina de status, backend)

- Plan mode + multiagentes (fluxo etapa 2 + status pela doc; backend atual do contrato; dependências de
  "+cadastrar na hora"/D48) + Q&A → **4 decisões**: **só backend** (página = B.3); **status completo agora,
  PDF na Fase C**; **Editar = etapa 2 + sync do vendedor (D48)**, etapa 1 adiada (P20); **cancelar venda de
  emitido → WASH_OUT**. Plano em `~/.claude/plans/witty-sparking-cloud.md` (reescrito p/ Passo 2). **Sem
  migration** (colunas da etapa 2 + `WASH_OUT` + `SaleContractExport` já existiam da B.1).
- **Descoberta que simplificou**: `SaleContract` é **CRUD puro (sem trigger de UPDATE)** → status/edição são
  `prisma.saleContract.update` diretos no service; o fluxo reduz a **`emit` + `confirm`** ("Gerar documento"/
  "Revisar"/"Editar" são modos da UI/B.3).
- **`sale-contract-support.js`**: `normalizeEtapa2Input` (obrigatórios banco/forma/modalidade/embalagem/datas;
  condicionais filiais PF; opcionais nº-compra/peso/condição/textos/ágio), `computeContractMoneyWithAgio`
  (ágio/deságio R$/saca — `computeContractMoney` passou a delegar), `buildPartySnapshot`/`buildUnitSnapshot`/
  `buildBankSnapshot`/`buildWarehouseSnapshot`, `clientDisplayName`.
- **`SaleContractService`**: `emitSaleContract` (gate ADMIN+CADASTRO; guard status `EM_ABERTO`/`CONFERIR`;
  `expectedVersion` + `updateMany(id+version)` 409; resolve/valida cliente/filial[PF]/banco-do-vendedor/listas
  ACTIVE; monta snapshots; recalcula total/corretagens; **D48** via `commandService.updateRegistration` quando
  o vendedor difere; grava `SaleContractExport`), `confirmSaleContract` (`CONFERIR`→`CONFIRMADO`),
  `listContractLookups`. Injeta `commandService`+`queryService` (instanciado **depois** do commandService).
- **WASH_OUT**: `PrismaEventStoreTx.deleteOpenSaleContractByMovement` → **`washoutOrDeleteSaleContractByMovement`**
  (`EM_ABERTO`→apaga / `CONFERIR`/`CONFIRMADO`→`WASH_OUT`+motivo/data); os 2 pontos de cancelamento passam o
  `reasonText`.
- **Rotas/wiring**: handlers `emitSaleContract`/`confirmSaleContract`/`listContractLookups` + rotas POST
  `/sale-contracts/[id]/emit|confirm` + GET `/contract-lookups`. `api-client`/`types` estendidos.
- **Testes**: unit (etapa2 + ágio) + integração (emit→CONFERIR c/ snapshots+export; re-emit; confirm; guards
  409; concorrência stale 409; D48 muda `ownerClientId`; WASH_OUT CONFERIR/CONFIRMADO; lookups 2/3/3 + gate 403).
  **Todos os gates verdes** (typecheck/lint/format/schemas/contracts/unit **311**/integration:db **305**/build).
- **Falta**: B.3 (página "Contratos") · PDF (Fase C) · P20 (editar etapa 1) · P21 (botões ágio/deságio) · P22
  (exibir total) · gestão das 3 listas. Nada pushado.

### 2026-06-26 — Sessão 47 (Fase B.3: página "Contratos", frontend)

- Plan mode + multiagentes (scaffolding via `/cadastros`; componentes reutilizáveis do modal; superfície
  api-client) + Q&A → 3 decisões: **incluir "+cadastrar na hora"** (filial/conta/armazém); **ágio/deságio =
  campo no modal**; **B.3 completa** (lista + etapa 2 + Confirmar + Editar + Revisar). Plano reescrito p/ B.3.
- **Nav**: `CONTRATOS_NAV_ITEM` em `AppShell` (NavIcon `contratos` + SVG + `desktopNavItems` gated ADMIN+CADASTRO)
  - linha no `HeaderAvatarMenu`.
- **Página** `app/contratos/page.tsx` (espelha `/cadastros`): guard ADMIN+CADASTRO; busca + filtros de status
  (chips `ctr-filter`); `listSaleContracts`; lista de cards; abre modal etapa 2 (emit/view) + diálogo de
  Confirmar; refetch após ações. **SEM FAB** (contrato nasce na venda).
- **`components/contracts/`**: `SaleContractCard` (nº + pílula `status-badge` + partes do snapshot + total BRL +
  ações por status), `SaleContractEtapa2Modal` (o grosso — pré-fill via `getSaleContract`+`listContractLookups`+
  `getClient`; vendedor `ClientLookupField kind=owner`; filiais PF select+`ClientUnitModal`; banco via
  `ClientBankAccountSelectField` [novo]; armazéns `kind=any` + **D49** `updateClient isWarehouse`; ágio/deságio;
  3 selects; datas; textos; submit `emitSaleContract`; modo `view` read-only), `ClientBankAccountSelectField`
  (lista contas do vendedor + `ClientBankAccountModal` inline), `SaleContractConfirmDialog` (`confirmSaleContract`).
- **Concorrência otimista**: envia `expectedVersion`; 409 → toast "recarregue". Mensagens pt-BR; `useToast` no
  sucesso. CSS `ctr-*` isolado no fim de `globals.css`.
- ⚠️ **Deviation conhecida**: o modal da etapa 2 é central `.app-modal.is-themed.is-action` (espelha o
  `SampleMovementModal`); a skill `modals` prefere **BottomSheet** p/ ações — refatorar os dois juntos depois.
- **Gates**: typecheck/lint/format/build verdes; `/contratos` compila; backend INTACTO (B.3 não tocou
  `src/`/`prisma/`/`tests/` → suites de backend inalteradas: schemas/contracts/unit verdes; integration:db não
  rodado por não haver mudança de backend). **Commits em `main` NÃO pushados** (ver memória).
- **Falta**: PDF (Fase C) · Futuro (D50) · P20/P21/P22 · gestão das 3 listas. **Validar no device.**

### 2026-06-26 — Sessão 48 (Fase C: PDF do contrato)

- Plan mode + multiagentes (stack PDF do laudo; spec do documento por bloco; dados/emissor/wiring) + Q&A → 3
  decisões: **documento limpo no estilo do app** (fidelidade ao print legado depois — o print não está no repo);
  **baixar/ver on-demand** (D32, sem armazenar); **emissor com placeholders** (CNPJ via env; assinatura do dono
  = linha em branco por ora). Plano reescrito p/ Fase C.
- **Stack**: `pdf-lib` (mesmo do laudo `SamplePdfReportService`). **`src/sale-contracts/sale-contract-pdf-service.js`**
  (`SaleContractPdfService.renderContractPdf(contract,{lotNumber,issuer})` → `{buffer,checksumSha256}`): A4,
  cabeçalho verde (logo + emissor + título + nº + status), blocos B1 identificação (+ Mês/Ano por extenso
  derivado, D36) · B2/B3 comprador+armazém · B4/B5 vendedor+armazém · B6 corretagem (só %) · B7 sacas/peso/
  preço (ágio/total NÃO impressos, P21/P22) · B8 pagamento/logística + banco do vendedor · B9 observações/
  descrição · B10 assinaturas (3 linhas). Multi-página (`ensureSpace`). Formatadores BRL/data/mês-extenso/
  documento. **`issuer-config.js`** (`getContractIssuer`).
- **Servir on-demand** (D32): handler `exportSaleContractPdf` em backend-api (gate via `getSaleContract`
  ADMIN+CADASTRO; **409 se `EM_ABERTO`**; busca `internalLotNumber`; render → buffer). Rota GET
  `app/api/v1/sale-contracts/[contractId]/pdf` serve **binário** (molde `samples/[id]/export/pdf`; cookie de
  sessão). `SaleContractPdfService` instanciado/injetado em create-backend-api.
- **Front**: `downloadSaleContractPdf` (fetch credentials same-origin → `{blob,fileName}`) + botão **"Baixar PDF"**
  no `SaleContractCard` (status ≠ EM_ABERTO) → `shareOrDownloadFile` (Web Share/download) + toast de erro.
- **Testes**: unit `sale-contract-pdf.test.js` (render→`%PDF` + opcionais nulos + formatadores) + integração
  (render de contrato emitido real → `%PDF`). **Gates verdes** (typecheck/lint/format/schemas/contracts/unit
  **317**/integration:db **306**/build; rota PDF compila). **4 commits em `main` NÃO pushados** (ver memória).
- ⚠️ Pendências pós-Fase C: **CNPJ real** do emissor (env `CONTRACT_ISSUER_CNPJ`); **assinatura do dono** como
  imagem (D35); **fidelidade** ao print legado (Flavio reenviar/comparar). **Validar no device.**

### 2026-06-28 — Sessão 49 (status FATURADO/PAGO: faturar/pagar/desfazer)

- **Passo 1 da máquina de status pós-`CONFIRMADO`** (D14 finalmente viva). Decisões do Flavio nesta
  sessão: ordem **pode pular** (`CONFIRMADO → PAGO` direto, além de `→ FATURADO`); **reversível**
  (desfazer 1 passo); **registra a data real** do marco (não só muda o status); UX = **diálogo**.
- **Máquina**: `Faturar` (`CONFIRMADO→FATURADO`, grava `invoicedAt`) · `Pagar`
  (`CONFIRMADO`/`FATURADO→PAGO`, grava `paidAt`; pular mantém `invoicedAt` nulo) · `Desfazer`
  (`FATURADO→CONFIRMADO` limpa `invoicedAt`; `PAGO→FATURADO|CONFIRMADO` conforme houve faturamento,
  limpa `paidAt`). O destino do desfazer-pagamento sai da **presença de `invoicedAt`** (sem coluna de
  histórico) — helper puro `resolveRevertTarget` (unit-testado).
- **Schema/migration**: `invoiced_at`/`paid_at` (`@db.Date`, nullable) em `sale_contract`; migration
  manual aditiva `20260628120000_fechamento_faturado_pago` (aplicada via `migrate deploy`).
- **Backend** (CRUD direto + concorrência otimista por `version`, gate ADMIN+CADASTRO, molde do
  `confirmSaleContract`): `invoiceSaleContract`/`paySaleContract`/`revertSaleContractStatus` no
  `SaleContractService`; handlers no `backend-api.js`; rotas POST `/sale-contracts/[id]/invoice|pay|revert-status`.
  Suporte: `resolveRevertTarget` + `normalizeActionDate` (reusa `requireDate`).
- **Frontend**: `lib/types` (`invoicedAt`/`paidAt`) + `api-client` (3 fns) + `SaleContractCard`
  (botões por status: CONFIRMADO→Faturar/Pagar; FATURADO→Pagar/Desfazer faturamento; PAGO→Desfazer
  pagamento) + novo `SaleContractLifecycleDialog` (data default hoje p/ faturar/pagar; confirmação p/
  desfazer) + página `/contratos` (filtros Faturado/Pago + wiring + toasts).
- **Testes**: integração cobre as 6 transições + pular + guardas (CONFERIR→409, CONFIRMADO desfazer→409),
  version stale→409, data inválida→422, papel não-gestor→403; unit do `resolveRevertTarget`. Gates verdes.
- **Fora de escopo (Passo 2 / P17)**: cancelar a venda quando `FATURADO`/`PAGO` segue **no-op**
  (`washoutOrDeleteSaleContractByMovement` só age em `EM_ABERTO`/`CONFERIR`/`CONFIRMADO`); o PDF **não**
  imprime `invoicedAt`/`paidAt`. Commits em `main`, **não pushados**.

### 2026-06-28 — Sessão 50 (quebra manual do contrato — P17)

- **Passo 2: acionamento manual do `WASH_OUT`** (resolve **P17**). Decisões do Flavio: quebra a partir
  de **CONFERIR/CONFIRMADO/FATURADO/PAGO** (não EM_ABERTO); **cancela a venda** (devolve as sacas ao
  lote); **motivo obrigatório**; **definitiva** (o conflito "cancela a venda + reversível" foi resolvido:
  `SALE_CANCELLED` é append-only → não dá pra desfazer; retomar = nova venda/contrato).
- **Arquitetura**: a quebra **delega ao `cancelSampleMovement`** (já grava `SALE_CANCELLED`, restaura
  `soldSacks`, trata liga/cascata e dispara o washout). **Sem migration** (reusa `washoutReason`/`washoutAt`).
- **Mudança-chave (resolve a ponta solta do Passo 1)**: `washoutOrDeleteSaleContractByMovement` agora
  marca **FATURADO/PAGO → WASH_OUT** (antes no-op) — vale para a quebra manual **e** para cancelar a
  venda pelo lote. `invoicedAt`/`paidAt` são preservados no contrato quebrado.
- **Backend**: `washoutSaleContract` no `SaleContractService` (gate ADMIN+CADASTRO; guards
  status/movementId/version; resolve o sample e chama `cancelSampleMovement`); `normalizeWashoutReason`
  (obrigatório, ≤500) no support; handler no `backend-api.js`; rota POST `/sale-contracts/[id]/washout`.
- **Frontend**: `washoutSaleContract` no api-client; botão **"Quebrar"** (danger) no card (4 status);
  ação `washout` no `SaleContractLifecycleDialog` (textarea de motivo + aviso "cancela a venda… ação
  definitiva"); wiring na página + toast; `.ctr-btn-danger`/`.ctr-modal-danger` no globals.css.
- **Testes**: integração +10 (quebra de CONFERIR/CONFIRMADO/FATURADO/PAGO; sacas restauradas + venda
  CANCELLED; guardas EM_ABERTO→409, já-WASH_OUT→409, motivo vazio→422, stale→409, COMMERCIAL→403;
  cancelar venda de PAGO pelo lote→WASH_OUT) = **36/36** no arquivo de contrato; unit
  `normalizeWashoutReason` (unit **321**). Gates verdes.
- **Fora de escopo**: contrato **Futuro** (sem movimento) — a quebra por cascata não se aplica (guard
  exige `movementId`); quando o Futuro tiver backend (D50) precisará de um WASH_OUT direto próprio.
  Commits em `main`, **não pushados**.

### 2026-06-28 — Sessão 51 (conteúdo do PDF: partes/armazéns + campos sempre presentes)

- Início do refino do **conteúdo do PDF** do Mercado à vista (haverá mais). Decisões do Flávio:
  - **Identificação**: **"Tipo" removido** do documento (fica só na gestão).
  - **Comprador/Vendedor/Armazéns**: **sem rótulo "Filial"**; campos nesta ordem — **Nome · CNPJ · IE ·
    Endereço · Bairro · Cidade/UF · Número · CEP**.
  - **PF**: dados fiscais/endereço **consolidados da fazenda** (`ClientUnit`) — em PF, **CNPJ + IE da
    fazenda** (sem CPF); PJ vem do `Client`. (Fallback `Client.X ?? unit.X`.)
  - **"Número"**: **não** criar campo no cadastro agora — o número fica no `addressLine`; a linha
    "Número" aparece sempre, porém **vazia (—)**.
  - **Cidade/UF**: manter o UF.
  - **Campo sempre presente**: **documento inteiro** — nenhum campo é ocultado por estar vazio (— quando
    sem dado); `field()`/`paragraph()` passaram a renderizar sempre.
- **Implementação**: `sale-contract-pdf-service.js` — `field()`/`paragraph()` sempre presentes; B1 sem
  "Tipo"; `party()` reescrita (consolida Client+fazenda, 8 campos, sem "Filial") usada p/ partes **e**
  armazéns; banco do vendedor sempre presente; helper `formatCep`; removidos `TYPE_LABELS`/`snapshotAddress`
  órfãos. `sale-contract-support.js` — `buildWarehouseSnapshot` ganhou `registrationNumber` (IE).
- **Sem migration/cadastro** (decisão do "Número"). Snapshots de partes já tinham todos os campos; o de
  armazém só ganha IE ao re-emitir (congelado). **Limitação**: armazém **PF** ficaria sem endereço (snapshot
  do armazém é só do Client) — armazéns costumam ser PJ; deferido.
- **Testes**: unit do `formatCep` + render de parte **PF** (fallback da fazenda) → `%PDF`; unit **323**.
  _(Conteúdo textual do PDF não é asserção viável — pdf-lib não extrai texto; validação visual com o Flávio.)_
  Gates verdes. Commits em `main`, **não pushados**. **Próximo**: próximas alterações de conteúdo do PDF
  (o Flávio trará) — ágio/total impressos (P21/P22), fidelidade ao print, etc.

### 2026-06-28 — Sessão 52 (layout do PDF em 1 página + script de preview)

- **Reformulação do corpo do PDF** + requisito duro de **PÁGINA ÚNICA**. Decisões do Flávio:
  - **Título "Contrato de Compra e Venda de Café" no corpo** (centralizado), não mais no header verde.
  - **Linha de identificação horizontal** (4 campos lado a lado): **Nº do contrato · Nº de compra · Nº do
    lote · Mês/Ano** (sem "Data do contrato").
  - **Comprador | Armazém do comprador** e **Vendedor | Armazém do vendedor** em **cards com borda**, cada
    um ocupando **metade** da largura.
  - **Título e número saíram do header verde** (header fica logo+emissor; **status** segue no topo-direito
    por ora — redesign do header depois).
  - **1 página garantida**: blocos de baixo compactados (Corretagem/Valores em faixas, Pagamento em 2
    colunas) + Observações/Descrição **truncadas**.
- **Implementação** (`sale-contract-pdf-service.js`, reescrita do layout): helpers `drawCard` (borda +
  título + linhas, altura determinística), `statRow` (N células horizontais), `twoColFields`,
  `truncatedParagraph`, `partyRows` (consolida Client+fazenda). **Sem paginação** (`y` só decresce);
  `fitText` mantém cada campo em 1 linha → altura determinística.
- **Preview**: `scripts/preview-contract.mjs` (molde do `preview-laudo.mjs`) gera `contrato-preview.pdf`
  com exemplo rico (comprador PJ + vendedor PF c/ fazenda + 1 armazém + campos vazios). `.gitignore`
  ganhou `/contrato-preview*.pdf`. Uso: `node scripts/preview-contract.mjs`.
- **Guard automático**: teste `getPageCount() === 1` com contrato cheio + observações longas (trunca).
  Validado visualmente (gs→PNG): layout limpo, 1 página. Unit **324**; gates verdes. Commits em `main`,
  **não pushados**. **Próximo**: header verde (redesign) + próximas levas de layout/fidelidade do Flávio.

### 2026-06-28 — Sessão 53 (revisão + refino da Etapa 1: registro da venda)

Revisão **campo a campo** da fase de **registro da venda no lote** (Etapa 1, `SampleMovementModal`) e implementação dos refinos. **Frontend apenas** + 1 helper puro (`lib/currency.ts`); **zero backend** (o backend já normaliza números e `normalizeBrokeragePct` já faz vazio→0). Detalhes na seção "Comportamento campo a campo → Etapa 1".

- **Comprador** — filtro confirmado: busca **só `isBuyer` ativos** (`client-service.lookupClients`). Decisão do Flávio: **forçar o cadastro correto** (chegou a ser pedido "buscar todos + auto-promover" e foi **revertido**). Implementado: **cadastro inline** ("Cadastrar comprador" no dropdown → `ClientQuickCreateModal` com `initialIsBuyer`), **lookup sem limite** (removido o cap de 8 em `client-support.js`/`client-service.js`) e **piso de 2 caracteres** na busca (`ClientLookupField`).
- **Valores em R$** — novo **`lib/currency.ts`**: `maskCurrencyInput` / `parseCurrencyInput` / `formatCurrencyValue` (máscara de moeda) + `parseDecimalBr` (texto livre). Corrige o **misparse silencioso** do parser antigo (`1.250` → 1,25). Aplicado ao **Preço** (venda) e ao **Ágio**/**Peso** (Etapa 2, `SaleContractEtapa2Modal`). Testes em `tests/currency.test.js`.
- **Corretagens** — **começam vazias** (antes `0`); **vazio = 0%** (mantém opcional).
- **Corretores** — **cadastro inline** ("+ Cadastrar corretor" no seletor) reusando o **`BrokerFormModal`** canônico (ganhou prop `initialName`); cria via `createBroker` e já seleciona como chip.
- **Layout** do modal de venda: **Data** sob o Comprador; **Sacas + Preço** lado a lado (grid 50/50); **Corretagem vend. + comp.** lado a lado. Sem CSS novo (grid inline; não toca o `globals.css` compartilhado).

**Gates** verdes (typecheck/lint/format/**unit 337**/build). **8 commits temáticos em `main`, não pushados**, **isolados** dos arquivos do outro agente (report-share/nav): lookup sem limite · lookup ≥ 2 chars · cadastrar comprador na hora · helpers de moeda BR · máscara de preço + corretagem vazia · máscara/parse no ágio/peso · cadastrar corretor na hora · layout 50/50. **Etapa 1 (registro da venda) CONFERIDA ✅.** **Próximo**: validar no device; conferência campo a campo da **Etapa 2** (modal de Contrato).

### 2026-06-28 — Sessão 54 (Etapa 2 — 1ª parte: layout 50/50, cadastro inline, erros por campo)

Conferência campo a campo + melhorias da **1ª parte da Etapa 2** (modal `SaleContractEtapa2Modal`, "Gerar documento" → preencher → **Emitir** → `CONFERIR`), usando a Etapa 1 como referência. Análise via 3 agentes Explore (inputs/validação · lookups/cadastro inline · layout/design). **Frontend apenas, 1 arquivo**; **zero backend** (outro agente no domínio) e **zero `globals.css`** (pares via grid inline). Detalhes na seção "Comportamento campo a campo → Etapa 2".

- **Layout 50/50** (grid inline `minmax(0,1fr)`, molde da Etapa 1): filiais (vend.+comp.), armazéns (comp.+vend.), forma+modalidade, datas (fatur.+pagto.), nº-compra+peso e **ágio (tipo | valor)**. Filiais agrupadas com o **Comprador** (read-only) abaixo.
- **Cadastro inline** de **Vendedor** (`initialIsSeller`) e **Armazéns** (`initialIsWarehouse`) via `ClientQuickCreateModal` (`onCreated` → `handleSelectSeller`/`handleSelectWarehouse`).
- **Erros por campo** no "Emitir": mensagem específica do 1º pendente (vendedor → filiais PF → banco → forma → modalidade → embalagem → datas → valor do ágio); o botão deixou de travar por campo faltante (só `saving`/`loading`).
- **Faxina** de CSS órfão no `globals.css`: `.ctr-agio-row` (virou grid inline) + `.sdv-mov-qty-inline`/`.sdv-mov-all-btn` (do botão "Todas" retirado na S53).
- **Fora desta entrega** (de propósito): coerência de datas, ágio>0 no cliente, `maxLength` (servidor já corta), backend, e as **ações pós-CONFERIR** (Confirmar/Editar/Faturar/Pagar/Quebrar).

**Gates** verdes (typecheck/lint/format/build). Commits temáticos em `main`, **não pushados**, **isolados** do outro agente (1 do modal `f4485c1` + 1 da faxina de CSS + doc). **Etapa 2 (1ª parte, até CONFERIR) implementada ✅.** **Próximo**: validar no device; ações pós-CONFERIR.

### 2026-06-29 — Sessão 55 (consolidação da venda na página Contratos — D61)

Duas entregas que consolidam **a venda à vista como exclusiva da página "Contratos"**.

**(1) Fluxo de criação à vista pela página** (frontend puro, reusa o backend da venda). O FAB "+" da
`/contratos` ("Mercado à vista") abre **`SaleContractLotPickerModal`** (novo): lista os lotes
**vendáveis** (`listSamples({ displayStatus:'OPEN' })`) com busca + scroll por cursor; ao escolher,
**hidrata** `getSampleDetail` (snapshot fresco + `activeBlends`) e abre o **`SampleMovementModal`
reusado** (travado em venda só por `initialMovementType='SALE'`, com `onAssignOwner` de liga espelhando o
painel). No sucesso da venda (cria o `EM_ABERTO` na mesma tx e devolve `result.saleContract`), **encadeia
a Etapa 2** ("Gerar documento") reusando o estado existente. Decisões: **encadear a Etapa 2** + picker
**inclui ligas**. Commits `d3773ce`/`3df2297` (FAB) + `b80fec9`/`2edc67c` (fluxo + CSS `.lotpick-*`).

**(2) Remoção da venda/perda do detalhe do lote + "Cancelar" no EM_ABERTO** → **D61**. Com a venda já
disponível pela página, o botão do detalhe virou 2ª entrada redundante. Decisões do usuário: detalhe vira
**histórico só-leitura** (some o cancelar de movimento também); venda **ADMIN-only** (sem mudar acesso);
**perda parqueada** (sem ponto de criação por ora). Antes, para não deixar um `EM_ABERTO` sem como
descartar, foi criado o **"Cancelar"** no card EM_ABERTO em `/contratos`: backend
`SaleContractService.cancelSaleContract` (espelha `washoutSaleContract`, mas só EM_ABERTO; delega a
`cancelSampleMovement`, que **deleta** o contrato e devolve as sacas) + rota
`POST /sale-contracts/[id]/cancel` + ação `'cancel'` no `SaleContractLifecycleDialog` + botão no card.
Depois, faxina do `SampleMovementsPanel` (removidos botões Venda/Perda, `SampleMovementModal` de criar,
modal de cancelar, e os órfãos: estados/imports/`COMMERCIAL_ALLOWED_STATUSES`/props
`session`/`sampleId`/`activeBlends`/`onRefresh` + CSS órfão `.sdv-modal-notice`). Mini-cards
Vendido/Perdido/Disponível e a timeline (envios/laudos com ações) ficam. O fluxo de **invalidação** da
página (que cancela movimentos ativos) fica intacto. Commits `3b0c461` (backend+teste, +3 testes, 41/41
no arquivo de contrato) + `6acfc5b` (frontend do Cancelar) + `f5a117b` (remoção do detalhe).

**Gates** verdes (typecheck/lint/format/build; `test:integration:db` re-seeda o login). Tudo em `main`,
**não pushado**, isolado do outro agente. **Falta** (inalterado): validar no device; **onde a perda será
realocada**; contrato **Futuro** (D50, sem backend); P20/P21/P22; CNPJ/assinatura/print legado.

### 2026-06-29 — Sessão 56 (wizard à vista de 2 passos, commit adiado — D62)

A criação à vista pela página virou um **wizard** (plan mode + 2 Explore + 3 perguntas). **ANTES**: o passo 1
("Registrar venda") **commitava** (`createSampleMovement`) e encadeava o passo 2. **AGORA (D62)**: o passo 1
**só coleta**; o passo 2 ("Gerar rascunho") faz **create→emit sequencial** no fim (`createSampleMovement` →
`emitSaleContract`, `expectedVersion:0` pois o contrato nasce v0 e nada toca entre as 2 chamadas, com guarda
de falha parcial via `createdId`); **"Voltar"** reabre o passo 1 com os dados preservados. Backend novo
`getNextContractNumber` (gate ADMIN; `SELECT MAX(contract_seq)+1` read-only + `formatContractNumber`; `GET
/sale-contracts/next-number`) = **preview** indicativo do nº no passo 1. Ajustes: `SampleMovementModal` ganhou
`initialSale` (re-seed ao voltar) + `infoFields` (Tipo·Lote·Documento), sem Observações; `SaleContractEtapa2Modal`
ganhou **modo criação aditivo** (`createContext`, sem `contractId`); título emit = **"Gerar rascunho"**, botões
50/50 fixos, "Cancelar"→"Voltar" no wizard. **Card (contrato existente) intacto.** Commits `e7ae047`(backend) +
`f9dbab6`(wizard). Gates verdes (unit 337; contrato 42/42).

### 2026-06-29 — Sessão 57 (fase pós-emissão — PDF sem status, Visualizar, ações do card, Editar fase 1; resolve P20)

Plan mode + 4 perguntas. **Decisões do Flavio → D63–D66**: (1) **PDF sem status** do fluxo (remove o selo
"A conferir"/etc., todos os status — D63); (2) **Visualizar**: Exportar=**compartilhar** / Baixar=**salvar** o
PDF (D64); (3) **Editar edita TUDO da fase 1 incl. sacas** (ajusta o saldo do lote), **sacas só-leitura em
liga** (F7.1) — D66; (4) **"Quebrar" → "Washout"** (mesmo backend `washoutSaleContract`), "Desfazer" mantido —
D65.

- **PDF** (`sale-contract-pdf-service`): removido o `drawText` do status + const `STATUS_LABELS` órfã.
- **Backend** (descobertas: a máquina de status já existia inteira; `SampleMovement` guarda **só** buyer/sacks/date —
  preço/corretagem/corretores são do **contrato**; `SALE_UPDATED` aceita sacas+data; nenhum teste assere o status no
  PDF): `emitSaleContract` ganhou bloco opcional **`saleFields`** (sacas/preço/corretagens/data/corretores; ausente
  no wizard create→emit) → recomputa o money, sincroniza o movimento (`_syncMovementBuyer`**→`_syncMovementFromContract`**:
  `after` só com o que mudou; sacas em liga → 422 por F7.1), grava colunas + troca `SaleContractBroker` numa
  `$transaction`; `getSaleContract` expõe **`sampleIsBlend`**. **+5 testes → 47/47**.
- **Frontend**: **`SaleContractDocumentModal`** novo (iframe do PDF on-demand + Exportar/Baixar/Fechar; `downloadFile`
  novo em `lib/share-blob`); **`SaleContractCard`** ações por status numa linha (D65; `onQuebrar`→`onWashout`,
  Faturar→Faturado, Pagar→Pago, Ver/Baixar PDF→Visualizar); **`SaleContractEtapa2Modal`** ganhou bloco "Venda" (fase
  1. editável só no card-edit (sacas trava em liga via `sampleIsBlend`) e **removeu o modo `view`/readOnly** (código
     morto — a leitura agora é o Visualizar; título card = "Editar contrato NNNN/AA").

Commits: `1b15851`(PDF) `5b41408`(backend) `8a563d0`(testes) `a4f52a8`(prettier) `fabc24c`(frontend). Gates verdes
(typecheck/lint/format/build; unit 337; contrato 47/47; re-seed login). **Resolve P20**; **P21 encerrada** (ágio =
campo no modal). **Loose end**: o diálogo do "Washout" ainda se intitula **"Quebrar contrato"** (`SaleContractLifecycleDialog`)
— alinhar ao botão. **Falta**: contrato **Futuro** (próximo); gestão das 3 listas; P22; CNPJ/assinatura/print legado.

> **Reconciliação do doc (2026-06-29):** este documento foi cruzado com o código e atualizado — wizard (D62),
> fase pós-emissão (D63–D66), **P20 resolvida**/P21 encerrada, **gate ADMIN-only** desde 2026-06-28, PDF sem
> status, e o stale `FECHAMENTO_EXPORTED`→`SaleContractExport` (D56). Mercado à vista ✅ ponta a ponta; próximo = **Futuro**.

### 2026-06-29 — Sessão 58 (contrato Futuro — sem lote, 1 modal)

Plan mode + 2 perguntas. **Decisões do Flavio → D67/D68**: criação **em 1 modal único** (não wizard — reusa o
`SaleContractEtapa2Modal` que já tinha todos os campos do Futuro, incl. o bloco "Venda" da S57); **washout/
cancelar sem tocar em lote**. **Descoberta-chave**: `emit`/`confirm`/`invoice`/`pay`/`revert` **já cobriam o
Futuro** (guardam em `sampleId`/`movementId`); só `washout`/`cancel` recusavam (422 proposital "Futuro sem
backend") e o `createSampleMovement` não servia (é sample-bound).

- **Backend** (`sale-contract-service.js` + `-support.js`): **`createFutureSaleContract`** cria o `SaleContract`
  `type=FUTURO`/`EM_ABERTO` direto (sem `Sample`/movimento; `normalizeFutureSaleContractInput` reusa os
  normalizadores; nº NNNN/AA na **mesma sequência global** sob `pg_advisory_xact_lock(831202606)`; buyer +
  snapshot + corretores + money numa tx); **washout Futuro** = `WASH_OUT` + motivo/data direto; **cancel
  Futuro** = apaga o contrato (corretores antes). + rota `POST /sale-contracts`, handler, `api-client` e tipo
  `CreateFutureSaleContractInput`.
- **Frontend**: `SaleContractEtapa2Modal` ganhou o 3º modo **`futureCreate`** (carrega só as listas; bloco
  "Venda" vazio, **sacas livres**; Vendedor/Comprador manuais; submit `createFutureSaleContract` →
  `emitSaleContract` sem `saleFields`; cleanup de órfão via cancel; título "Novo contrato — Futuro"). O FAB
  **"Futuro"** abre o modal (tirou o stub "em breve"). `SaleContractLifecycleDialog` ganhou **`hasLot`**: no
  Futuro o texto de washout/cancelar **não** menciona "devolve as sacas ao lote"; e **"Quebrar" → "Washout"**
  (título/botão/motivo/toast) — fecha o loose end da S57.

**Gates verdes** (typecheck/lint/format/build; unit 337; contrato **53/53** [+6 Futuro]; re-seed login). **3
commits `main` NÃO pushados**: `4a82aa2`(backend) `a06bf80`(testes) `c97539b`(frontend). **Validar no device**:
FAB → Futuro → 1 modal (Vendedor manual + Comprador + Venda + doc) → "Emitir" cria+emite → card "Futuro" em
`CONFERIR` → Visualizar/Faturado/Pago/Washout (sem menção a lote). **À vista intacto.** **Falta** (ambos):
P22 (exibir total) · CNPJ/assinatura/print legado · gestão das 3 listas.

### 2026-06-29 — Sessão 59 (à vista também em 1 modal — fim do wizard, D69)

Plan mode + 1 pergunta. O usuário pediu pra **unificar o à vista** num modal só, como o Futuro (S58).
Decisão (liga): **Essencial + viabilidade** — sacas 100% travado + atribuir o dono (= vendedor) + manter a
checagem de viabilidade (`getBlendFeasibility`); **descarta** o aviso "participa de liga". **Frontend-only**
(o backend `createSampleMovement`+`emit` já existia/testado). **Descoberta-chave**: o `SampleMovementModal`
continua (a **Perda**/`/samples` o usa; verifiquei que a Perda não passa `initialSale`/`infoFields` nem lê
`buyerClient`).

- **`SaleContractEtapa2Modal`**: novo modo **`spotCreate`** (substitui o `createContext` do wizard). Load:
  lookups + pré-preenche o vendedor do dono (`getClient`) + semeia o blend (sacas 100% p/ liga) + busca a
  viabilidade da liga. Bloco "Venda" passa a aparecer em **todos** os modos (sacas: spot ≤ disp. / liga 100%
  travado / Futuro livre). Submit (4ª via): valida + (liga inviável → bloqueia) + se **liga sem dono** atribui
  o dono = vendedor (`updateRegistration` + `getSampleDetail`) → `createSampleMovement` → `emit` (sem
  `saleFields`). Cleanup de órfão via `cancelSaleContract` (à vista restaura sacas). Título "Novo contrato —
  À vista" + linha "Lote N · Documento". Removidos `createContext`/`onBack`/`isCreate`.
- **`app/contratos/page.tsx`**: o picker → **1 modal** (estado `spotCreate`); removidos o `spotWizard` de 2
  passos, os memos `spotCreateContext`/`spotInitialSale`, o `SampleMovementModal` (passo 1), o Etapa2
  `createContext` (passo 2) e imports órfãos (`SampleMovementModal`/`...SubmitInput`/`updateRegistration`/
  `getSampleDetail`/`SampleSnapshot`/`ActiveBlendDetail`).
- **`SampleMovementModal`**: removidas as props só-do-wizard `initialSale`/`infoFields` (+ ramos do reset/
  render) + o campo `buyerClient` do `SubmitInput`/retorno + o import órfão `formatCurrencyValue`; CSS órfã
  `.smm-info-*` removida do `globals.css`. **Toda a lógica de liga fica** (a Perda usa).

**Gates verdes** (typecheck/lint/format/build; unit 337; sem mudança de backend → integração 53/53 inalterada).
**1 commit `main` NÃO pushado**: `0d82115`. **Validar no device**: FAB "À vista" → picker → 1 modal (Vendedor
pré-preenchido + Comprador + Venda c/ sacas≤disp. + doc) → "Emitir" cria a venda no lote + emite → card "À
vista" `CONFERIR`. **Liga**: sacas 100%; liga sem dono → o vendedor vira o dono; liga inviável → bloqueia. **Perda
(`/samples`) e Futuro intactos.** **Falta** (ambos): P22 · CNPJ/assinatura/print legado · gestão das 3 listas.

### 2026-06-29 — Sessão 60 (PDF redesenhado no padrão do contrato legado SAFRAS)

O usuário mandou um **exemplo** do contrato legado (PDF/scan) e pediu p/ o nosso PDF imitá-lo, **mantendo as
caixas de Comprador/Vendedor/Armazéns por enquanto** e **sem a cláusula** de mediação/arbitragem. Renderizei o
exemplo via `gs` (poppler ausente) p/ analisar. Mudanças em `sale-contract-pdf-service.js` (**só os campos fora
das partes**):

- **Cabeçalho BRANCO** (sem faixa verde): logo `logo-safras-color.png` (era branco) à esquerda + **emissor
  alinhado à direita** (nome legal + rua/nº + cidade-UF + Bairro + CNPJ + Telefone).
- **Faixa-título cinza** "CONTRATO DE COMPRA E VENDA DE CAFÉ" + **linha de ID inline** (Nº Contrato/Compra/Lote ·
  **Mês** · **Ano** separados, derivados da data).
- **5 caixas** Forma · Modalidade · Embalagem · Faturamento · Pagamento (rótulo cinza + valor centralizado).
- **QUANTIDADES E VALORES** numa caixa: Qtd · Vlr. Saca · **Peso (BR 2 casas, novo `formatKg`)** · **C. Vend. %**
  · **C. Comp. %** — a corretagem passou a ser **impressa** (em %); ágio/total seguem **não** impressos (P22).
- **BANCO DO VENDEDOR** em seção própria; **OBSERVAÇÃO/DESCRIÇÃO** em caixas com **rótulo vertical** (girado 90°,
  `degrees`); **local + data por extenso** e assinaturas **Comprador | Corretor** empurradas pro rodapé. **SEM
  cláusula.** Helpers novos: `grayLabel`/`idRow`/`boxRow`/`inlineBox`/`verticalLabelBox`/`formatMonth/Year/Extenso`;
  removidos `miniSection`/`statRow`/`twoColFields`/`truncatedParagraph`.
- **`issuer-config`**: dados reais (nome legal "Safras Negócios e Intermediações Eireli - ME", endereço/bairro
  separados, **CNPJ real `23.490.860/0001-56` como default do env**, `city` p/ a linha de data).

Continua em **1 página** (teste verde). Iterei via preview (`scripts/preview-contract.mjs` → `gs` → PNG):
1ª rodada os rótulos verticais vazavam a caixa → corrigi a altura/centralização; empurrei as assinaturas pro
rodapé. **2ª rodada (feedback do preview)**: **3 assinaturas na mesma linha** (Comprador·Vendedor·Corretor —
faltava o vendedor); **rótulos das 5 caixas centralizados**; **mais folga** (gaps entre seções + altura das
caixas ↑ → conteúdo preenche melhor a página, menos vazio); **TODOS os nomes de campo em negrito-preto** (os
das partes eram cinza MUTED → BLACK). **Gates verdes** (format/lint/build; unit 337 incl. pdf + **1-página**).
**3 commits `main` NÃO pushados**: `35fe687`(pdf+issuer) `5c5ae40`(doc) `d87a72a`(ajustes). **Resolve** "header
verde (redesign)" e "fidelidade ao print legado" da S54. **Campos = dados reais** (emissor config; partes/banco/
valores dos snapshots; "Número" é campo de formulário — o nº vai no Endereço, como o legado "S/N"). **Falta**:
assinatura do dono como **imagem** (D35, hoje linha em branco); **partes** ainda em 2-col (o usuário pediu p/
manter "por enquanto" — revisitar depois); P22.

### 2026-06-29 — Sessão 61 (Espelho de Corretagem — desenho + implementação)

O Flavio pediu o **3º documento** dos Contratos (além de à vista e Futuro): o **Espelho de Corretagem**,
um **demonstrativo de comissão** gerado **a partir de um fechamento já existente**. Mandou o print legado
(`espelho corretagem.pdf`); renderizei via `gs` (poppler ausente) p/ analisar. **Conferência da matemática
do exemplo**: Preço 1.020,00 × 1.500 sacas = R$ 1.530.000,00; Comissão 7.650,00 = **0,5%** = **um lado** só
(bate com nosso modelo de corretagem de 2 lados separados, D44/D55). **Plan mode + 2 rodadas de perguntas**
→ **D70–D76**:

- **D70/D71** — Espelho = **documento derivado** (lê **1** `SaleContract`), **não** é `SaleContractType`
  nem tem tabela/numeração/status próprios; **on-demand, sem migration**, sem auditoria por ora.
- **D72** — a **parte** (Comprador **ou** Vendedor) é **escolhida na geração**: define o **CLIENTE** (topo)
  e o **lado** da comissão (`sellerBrokerageValue`/`buyerBrokerageValue`, já gravados).
- **D73** — elegíveis: **CONFIRMADO/FATURADO/PAGO** (congelados), **ambos os tipos**; exclui
  EM_ABERTO/CONFERIR/WASH_OUT.
- **D74** — rodapé "DADOS BANCÁRIOS PARA PAGAMENTO" = conta **fixa da SAFRAS** (SICREDI · Ag 0361 · CC
  83515-3 · CNPJ 23.490.860/0001-56) no `issuer-config` (env opcional).
- **D75** — modal de conferência **só-leitura**; **D76** — entrada via **modo de seleção** (padrão "liga")
  - **tap-to-open** (seleção única).

**Descoberta-chave (Explore)**: **todos** os campos do espelho já existem no `SaleContract` — só falta a
**conta bancária do emissor** (rodapé), análogo ao CNPJ. **Sem schema novo.** Reuso pesado do
`SaleContractPdfService` (cabeçalho do emissor + primitivas + formatadores) e do padrão de seleção da liga
(`app/samples/page.tsx`). Doc atualizado: intro/Sessão 61, D70–D76, nova seção "Espelho de Corretagem",
Fase E no roadmap. Plano em `~/.claude/plans/glittery-popping-wren.md`.

**Implementação (mesma sessão — Fase E).** **Backend** (`d04e1d1`): `getContractIssuer` ganhou a conta da
SAFRAS (SICREDI · Ag 0361 · CC 83515-3, env opcional); **`SaleContractPdfService.renderEspelhoPdf(contract,
{ side, issuer })`** (reusa o cabeçalho do emissor + helpers de módulo; faixa-título + CLIENTE + tabela de
1 linha de 10 colunas + TOTAL + rodapé bancário; 1 página); handler **`exportEspelhoPdf`** (gate ADMIN via
`getSaleContract`; valida `status ∈ {CONFIRMADO,FATURADO,PAGO}` → 409 e `side ∈ {seller,buyer}` → 422) +
rota GET **`/api/v1/sale-contracts/[id]/espelho/pdf?side=seller|buyer`**; **sem migration**; +3 testes unit
+1 integração. **Frontend** (`67a8c50`): 3ª opção **"Espelho"** no `ContractCreateRadialFab` (posição
`is-liga`) → **modo de seleção** (banner + `SaleContractCard` vira botão de seleção, inelegíveis esmaecidos)
→ **`EspelhoCorretagemModal`** (toggle Vendedor|Comprador → CLIENTE + lado da comissão; resumo + prévia do
PDF on-demand; Exportar/Baixar) + `downloadEspelhoPdf` no api-client. **Gates verdes** (format/lint/
typecheck/build; unit **340**; integração **54**). **PDF conferido no preview** (`gs`→PNG) vs. o legado —
fiel; ajustei "Nº Compra" + largura da coluna do nome. **Validar no device.** **Falta (opcional):**
auditoria do espelho (adiada, D71); confirmar se "Comprador/Vendedor" deve ser a **contraparte** (hoje = a
própria parte, como no exemplo).

**Refino (S61, frontend `EspelhoCorretagemModal`):** o toggle de lado passou a oferecer **só os lados com
corretagem preenchida** (`sellerBrokeragePct`/`buyerBrokeragePct` `> 0`) — só vendedor → só "Vendedor"; só
comprador → só "Comprador"; ambos → os dois; nenhum → _fallback_ aos dois (não trava o modal). Default = o
1º lado disponível. **Frontend-only** (backend segue permissivo p/ qualquer `side` válido); refina D72.
Gates verdes (lint/typecheck/build).

**Refino de elegibilidade (S61, pedido do Flavio "opção b"):** o card no **modo de seleção** passou a
exigir status congelado **E** ≥1 corretagem preenchida (`sellerBrokeragePct`/`buyerBrokeragePct` `>0`) —
contrato **sem corretagem** fica **inelegível** (esmaecido). O motivo no card ficou **preciso** (`espelhoReason`):
"Só confirmados" (status) ou "Sem corretagem". Refina D73. Frontend-only; gates verdes (lint/typecheck/build).

### 2026-06-29 — Sessão 62 (Página Financeiro — desenho)

O Flavio pediu uma **nova página "Financeiro"** (acesso **ADMIN + COMMERCIAL**) para apresentar a
**corretagem a receber por fechamento** e **quanto cada corretor recebe**. **Plan mode + 2 rodadas de
perguntas → D77–D83**:

- **D78** — valor a receber por fechamento = **corretagem total dos 2 lados** (`sellerBrokerageValue +
buyerBrokerageValue`).
- **D79** — **rateio IGUAL** entre os corretores do contrato (÷ nº) — **resolve a parte adiada da D34**;
  `SaleContractBroker` **não** ganha coluna de cota.
- **D80** — elegíveis **CONFIRMADO/FATURADO/PAGO** + corretagem > 0 (mesma régua do Espelho, D73).
- **D81** — **só visão calculada** (sem marcar "pago ao corretor", sem estado/tabela; total **cumulativo**);
  controle de pagamento ao corretor = futuro.
- **D82** — **ADMIN** vê tudo + quebra por corretor; **COMMERCIAL** vê só os fechamentos em que é corretor
  (`Broker.userId`) e **só a própria cota** (não vê total/outros/negócio).
- **D83** — **lista por fechamento**, sem agregado por corretor, **sem período**, com total geral + busca.

**Confirmado no código (schema + grep):** `SaleContractBroker` **não** tem coluna de cota (o rateio era
adiado, D34) e **não há** nenhuma noção de payout/quitação de comissão — então a página é um **relatório
derivado puro, sem migration**. `Broker.userId` (UNIQUE) é o vínculo corretor↔usuário usado no escopo do
COMMERCIAL. **SÓ DESENHO** nesta sessão (doc + decisões); implementação = **Fase F** (sessão futura, "aos
poucos, quando tudo claro"). Doc atualizado: intro/Sessão 62, D77–D83, nova seção "Página Financeiro", Fase
F no roadmap. Plano em `~/.claude/plans/glittery-popping-wren.md`. **Nada de código.**

### 2026-06-29 — Sessão 63 (Página Financeiro — refino concreto + multiagente)

O Flavio detalhou a página: **cards por fechamento** — recolhido (nº · valor total · corretagem total ·
corretores + cotas) e **clicar expande** com "mais informações". **Plan mode + 3 agentes Explore** (dados /
UX do card / página-nav role-adaptive) + 3 perguntas → **D84–D86** (revisa D82/D83):

- **D84** — card recolhido (ADMIN) = nº · `totalValue` · corretagem total (`sellerBrokerageValue +
buyerBrokerageValue`) · corretores com a cota de cada um (÷ nº, D79).
- **D85** — card expandido = **só detalhe da corretagem** (repartição vendedor %+R$ / comprador %+R$); sem
  dados do negócio.
- **D86** (revisa D82) — card do COMMERCIAL: recolhido = nº · valor total · **só a cota dele** (sem os
  outros corretores); **expandido = repartição vend/comp** (= corretagem total). O COMMERCIAL **passa a ver**
  valor total + corretagem total; só os **demais corretores** ficam ocultos.

**Achados dos agentes (ancoram a Fase F):** `listSaleContracts` é ADMIN-only e **não traz corretores**
(`getSaleContract` traz, em consulta separada); `SaleContract` **sem `@relation`** com `SaleContractBroker` →
**2 queries** (contratos + batch de brokers por `saleContractId in [...]`), cota **calculada em JS** (sem
coluna); "corretagem > 0" = `OR` nos 2 valores; o COMMERCIAL resolve-se por
`prisma.broker.findUnique({ where: { userId } })` (query nova, `@@unique([userId])`); **gate próprio**
`FINANCEIRO_ROLES` (não reusar o ADMIN-only); idiom ADMIN-tudo/COMMERCIAL-só-o-seu em
`commercial-forms-service.js` (`actor.actorUserId`); página **role-adaptive** molde `app/informe/page.tsx`;
nav `FINANCEIRO_NAV_ITEM` no `AppShell` + linha no `HeaderAvatarMenu` (tabbar sem slot); card = clonar
`ctr-card` sob `fin-*`. **Confirmado: relatório derivado, sem migration.** **SÓ DESENHO** (refino do doc);
implementação = **Fase F**. Doc atualizado: intro/Sessão 63, D84–D86 (+ revisão D82/D83), seção "Página
Financeiro" detalhada (cards) + Fase F enriquecida. Plano em `~/.claude/plans/glittery-popping-wren.md`.
**Nada de código.**

### 2026-06-29 — Sessão 64 (Página Financeiro — IMPLEMENTAÇÃO da Fase F)

Implementada a página **"Financeiro"** ponta a ponta (ADMIN + COMMERCIAL), **relatório derivado, sem
migration**. **Backend** (`611b8e9`): `buildReceivableView` (puro: `commissionTotal = round2(seller +
buyer)`, `cota = round2(total ÷ nº)`, projeção por papel) + `SaleContractService.listBrokerReceivables`
(gate próprio **`FINANCEIRO_ROLES`**; **2 queries** — contratos elegíveis `CONFIRMADO/FATURADO/PAGO` +
`OR` corretagem>0, e o batch de `SaleContractBroker`; **COMMERCIAL** resolve `prisma.broker.findUnique({
where: { userId } })` → filtra aos seus + projeta só `myShare`; sem broker → `[]`) + handler
`listBrokerReceivables` + rota `GET /api/v1/financeiro` + `listFinanceiro`/tipos. **Frontend** (`33226c1`):
`app/financeiro/page.tsx` **role-adaptive** (molde `/informe`; `FINANCEIRO_ROLES` em `lib/roles`) com **total
geral** + busca + lista de `FinanceiroCard` (recolhido = nº · valor total · corretagem/cota · corretores no
ADMIN; **expandido** = repartição vend/comp %+R$, D85); **nav** `FINANCEIRO_NAV_ITEM` no `AppShell` (sidebar,
gated `FINANCEIRO_ROLES`) + linha no `HeaderAvatarMenu` (mobile); CSS `fin-*` clonando o `ctr-card`.
**Testes**: +3 unit (`buildReceivableView`) + **4 integração** (ADMIN vê todos+cotas; COMMERCIAL só os seus +
`myShare`; sem `Broker` → vazio; REGISTRATION → 403). **Gates verdes** (format/lint/typecheck/build; unit
**343**; integração **58**; reseed do login). **2 commits `main` NÃO pushados**: `611b8e9` (backend) ·
`33226c1` (frontend). **VALIDAR NO DEVICE** (ADMIN vê tudo + corretores/cotas, expandir → repartição;
COMMERCIAL com `Broker` vinculado vê só os seus e só a cota; sem `Broker` → vazio). **Falta (futuro):**
controle de pagamento ao corretor · agregado por corretor/período · partes no card.

### 2026-06-30 — Sessão 65 (Ágio/deságio pós-confirmação: botões no card)

**Implementado** o ajuste de **ágio/deságio num contrato `CONFIRMADO`** via **botões no card** (**D87–D90**),
mantendo o campo no modal de criação (aplicável até `CONFERIR`, pelo "Editar"). Decisões com o Flavio:
**substituir o vigente** (não acumula, sempre sobre o `unitPrice` cru — D88); **só `CONFIRMADO`** (ao
Faturar/Pagar congela — D89); **PDF inalterado** (o total já aparece no **Financeiro**, P22); **registrar
histórico** (D90).

- **Schema** (`2f4cf9e`): tabela nova **`SaleContractAgioLog`** (migration **manual** `20260630120000`, molde
  `SaleContractExport`, FK só no SQL) — valor aplicado · ágio anterior (`previous*`) · total **antes→depois**
  · `appliedByUserId`/`appliedAt`. As colunas `agioDesagioType`/`agioDesagioValue` do `SaleContract` são
  reusadas (1 ágio vigente).
- **Backend** (`2701bff`): `SaleContractService.applyAgioSaleContract` (gate **ADMIN** = `SALE_CONTRACT_MANAGE_ROLES`;
  `normalizeRequiredAgio` novo no support; guard `status === 'CONFIRMADO'` senão **409 `SALE_CONTRACT_NOT_ADJUSTABLE`**;
  recalcula `totalValue` + as duas corretagens com **`computeContractMoneyWithAgio`** sobre o preço cru;
  `updateMany` guardado por `version` + `tx.saleContractAgioLog.create`, numa **transação**; status **não muda**).
  Rota `POST /api/v1/sale-contracts/[id]/apply-agio` + handler + `applyAgioSaleContract` no api-client.
- **Frontend** (`cc9bc2d`): botões **"Ágio"/"Deságio"** no bloco `CONFIRMADO` do `SaleContractCard` (+ exibe o
  **ágio vigente** como stat) → novo **`SaleContractAgioDialog`** (molde do `SaleContractLifecycleDialog`:
  campo **Valor (R$/saca)** mascarado via `lib/currency` + **prévia ao vivo** do preço efetivo/total/corretagem,
  espelhando o backend) → `applyAgioSaleContract`; fiação em `/contratos` (estado `agioTarget` + toast). CSS
  `ctr-agio-*`.
- **Financeiro e Espelho** refletem **ao vivo** (lêem `totalValue`/`*BrokerageValue`/`agioDesagio*` do contrato);
  **PDF do contrato inalterado** (sem ágio/total, por D89).

**Gates verdes** (format/lint/typecheck/build; **unit 344** / **integração 356**; +5 testes: recálculo+log,
**substitui não acumula** + Financeiro reflete, **409 fora de `CONFIRMADO`**, version/422/403). **3 commits
`main` NÃO pushados**: `2f4cf9e` (schema) · `2701bff` (backend) · `cc9bc2d` (frontend). **Resolve P21**
(botões no card) e **P22** (total no Financeiro). **Validar no device** (contrato `CONFIRMADO` → Ágio/Deságio
→ prévia → aplicar → card mostra o vigente; Financeiro/Espelho refletem; linha em `sale_contract_agio_log`).

### 2026-06-30 — Sessão 66 (Gestão das 3 listas: "+ Adicionar" inline)

**Implementada** a parte **"adicionar"** da gestão das 3 listas (Forma/Modalidade/Embalagem) — **opção a
(D91)**: em vez de uma página de gestão, o valor novo é criado **inline, no próprio dropdown** do modal de
contrato. Reuso do `InlineSelectField` (que já tinha o slot "+ {createLabel}").

- **Backend** (`5103853`): `SaleContractService.createContractLookup({ list, name }, actor)` — gate **qualquer
  autenticado** (D59, como `Bank`/`Broker`); valida `list` ∈ {paymentForm,modality,packaging} + `name`
  (trim/não-vazio/≤120) via `normalizeContractLookupInput` (support); **append** (`sortOrder = max+1`); `status`
  ACTIVE; nome UNIQUE → **409 `CONTRACT_LOOKUP_NAME_EXISTS`** (molde `_mapUniqueError` do `bank-service`).
  **POST** em `/api/v1/contract-lookups` (o GET já existia) + handler + `createContractLookup` no api-client +
  tipos. **Sem migration** (tabelas já existem).
- **Frontend** (`a82fa09`): `InlineSelectField` ganhou a prop **`onCreate`** — o "+ Adicionar" abre um campinho
  no dropdown (input + **✓**/**✕**); **✓** cria → seleciona o novo valor → fecha; **✕**/Esc cancela; **409 →
  "Esse nome já existe."** inline; pré-preenche com o texto já digitado. `onRequestCreate` (modal) intacto p/ os
  campos pesados. Os **3 `<select>` nativos** do `SaleContractEtapa2Modal` viraram `InlineSelectField` com
  `onCreate` → `createContractLookup` (injeta o item no estado `lookups` + seleciona); disponível em **Criar e
  Editar**. CSS `.bms-create-*`.

**Decisões com o Flavio**: substituir uma página de gestão pelo **adicionar inline** (mais leve, opção a); **✓/✕**;
rótulo **"+ Adicionar"**; endpoint **qualquer autenticado**; **só adicionar** (renomear/inativar adiado). **Gates
verdes** (format/lint/typecheck/build; **unit 345** / **integração 359**; +4 testes: cria/aparece/append,
duplicado 409, lista inválida/nome vazio 422, COMMERCIAL cria). **2 commits `main` NÃO pushados**: `5103853`
(backend) · `a82fa09` (frontend). **Validar no device** (modal → Forma/Modalidade/Embalagem → "+ Adicionar" →
digitar → ✓ → fica selecionado e persiste; nome repetido → "já existe"; testar no Editar).

### 2026-06-30 — Sessão 67 (Renomeação do doc + pendências abertas + Fase G)

Sessão **de documentação** (sem código de feature). A pedido do Flavio, a partir de um levantamento de
decisões faltantes/inconsistências:

- **Documento renomeado** `Fechamento-Plano-de-Trabalho.md` → **`Contratos-Plano-de-Trabalho.md`** (título +
  referências em `docs/README.md` e na skill `prisma`). **"Contratos"** = a feature/página guarda-chuva;
  **"Fechamento"** segue como o termo de domínio do **PDF gerado**.
- **Pendências abertas catalogadas** (novas, na seção "Pendências (restantes)"): **P23** congelamento (D25) ×
  ágio pós-confirmação (D87); **P24** total de contrato **sem corretagem** não é exibido (Financeiro exige
  corretagem > 0, PDF não imprime total); **P25** terminologia **"Quebrado" × "Washout"**; **P26** gate da
  criação das 3 listas (qualquer autenticado D59 × contratos ADMIN-only); **P27** **layout e design das
  páginas**; **P28** **renomear/inativar** das 3 listas (hoje só adicionar). **P2** marcado **✅** (Etapa 1+2 +
  Futuro já conferidos).
- **Nova Fase G — Revisão de fluxos + design das páginas** (roadmap): varredura sistemática dos fluxos ponta a
  ponta + revisão visual contra o design-system; reconcilia P23–P28 e o "validar no device" acumulado.

_(Já estavam no doc, não duplicados: CNPJ/assinatura/print legado — "Falta"; contraparte e auditoria do
Espelho — "Notas/pendências menores"; futuros do Financeiro — "Pendências a refinar".)_ **Sem commits de
código; só o doc + README + skill.**

### 2026-07-01 — Sessão 68 (fecha P23–P28: decisões + implementação)

1ª frente da **Fase G** (revisão dos fluxos de criação): fechadas **5 das 6** pendências abertas da S67
(**P23–P26, P28**); resta só **P27** (design das páginas). Cada decisão foi confirmada pelo Flavio antes de
implementar; cada uma virou uma decisão (**D92–D95**) + a reconciliação da **P23** na D25.

- **P23 → D25 (reconciliação, sem código)**: o **ágio/deságio** é a **única** mutação permitida após o
  `CONFIRMADO`. Verificado no código (`applyAgioSaleContract`): altera só `totalValue` + as duas
  `brokerageValue` (R$) e audita em `SaleContractAgioLog`; **não** toca snapshots de partes/banco/armazém
  nem as `%`. Como o PDF imprime a corretagem em % (e não imprime total/ágio), o **PDF é idêntico**
  antes/depois; Espelho e Financeiro (on-demand) refletem ao vivo. Exceção registrada na D25.
- **P24 → D92** (`listBrokerReceivables`): removido o filtro `corretagem > 0`; **todos** os fechamentos
  congelados aparecem no Financeiro, inclusive os **sem corretagem** (cota 0, já protegida por
  `brokerRows.length || 1`) — é o único lugar onde o total do contrato fica visível. +1 teste de integração.
- **P25 → D93** (frontend): **"Washout"** em toda a UI — `STATUS_META.WASH_OUT.label`, filtro da
  `/contratos` e o texto do card (`Washout: {motivo}`) trocados de "Quebrado"/"Quebra"; comentário do CSS
  alinhado. (Botões e diálogo já diziam "Washout".)
- **P26 → D94** (`createContractLookup`): passa a exigir **ADMIN** (`SALE_CONTRACT_MANAGE_ROLES`), fechando
  o endpoint que a D91/D59 deixara aberto a qualquer autenticado (só o modal ADMIN o usava).
  `listContractLookups` (read-only) segue aberto. Teste do gate invertido (COMMERCIAL → 403).
- **P28 → D95** (adiar): mantém só "+ Adicionar"; renomear/inativar/reordenar ficam fora do escopo (YAGNI).
- **P27 (aberta)**: layout/design das páginas — segue na **Fase G** (revisão visual), com o app rodando.
- **Testes**: além dos 2 novos (P24 inclui / P26 403), 2 testes de lookup **pré-existentes** (append +
  duplicata) eram **não-idempotentes** — nome fixo, sem cleanup, e as tabelas de lookup não são truncadas
  entre runs (guardam os valores seedados) → falhavam na 2ª execução. Tornados idempotentes (nome único +
  `delete` no fim) + limpeza das 3 órfãs residuais no DB. **Não era regressão** (ambos usam `adminActor`,
  que passa o gate novo).
- **Gates**: lint/format/typecheck verdes; **unit 345**; **integração 359/360** (o único fail é o teste
  **flaky** `physical-send-report-share` #144 — envio físico/QR, não relacionado; passa **13/13** isolado);
  **build** ✓. **Sem migration.** _(Nada commitado — aguarda validação/decisão do Flavio.)_

### 2026-07-01 — Sessão 69 (máquina de status simplificada: remove CONFERIR, CONFIRMADO→EMITIDO)

Simplificação da máquina de status do contrato (**D96**), a pedido do Flavio. O `CONFERIR` era redundante:
o **"Emitir"** já faz todo o trabalho (snapshots, total com ágio, auditoria `SaleContractExport`, sync do
`Sample.ownerClientId`); o **"Confirmar"** era só um flip de status sem efeito colateral.

- **Novo fluxo**: `EM_ABERTO → EMITIDO → FATURADO → PAGO` (+ `WASH_OUT`). `CONFIRMADO` **renomeado para
  `EMITIDO`** (Q1 = renomear no banco, não só rótulo); `CONFERIR` **removido**.
- **`EMITIDO` é editável** (Q2): `emitSaleContract` aceita re-emitir um `EMITIDO` (o "Editar" do card reabre
  etapas 1+2, regera e mantém `EMITIDO`). A janela editável vai **até `EMITIDO`**; congela ao `FATURADO`
  (refina D25/D48).
- **Removidos**: `confirmSaleContract`, a rota `POST /sale-contracts/[id]/confirm`, o
  `SaleContractConfirmDialog` e o `onConfirmar` do card.
- **Migration manual `20260701130000_contract_status_emitido`**: recria o enum `SaleContractStatus`
  (Postgres não dropa valor de enum), migrando `CONFERIR`/`CONFIRMADO` → `EMITIDO`. Tabela `sale_contract`
  (`@@map`).
- **Ações do card**: `EM_ABERTO` = Emitir · Cancelar; **`EMITIDO` = Editar · Visualizar · Faturado · Pago ·
  Ágio · Deságio · Washout**; `FATURADO` = Pago · Visualizar · Desfazer · Washout; `PAGO` = Visualizar ·
  Desfazer · Washout; `WASH_OUT` = Visualizar.
- **Rename** `CONFIRMADO`→`EMITIDO` em service/support/event-store/backend-api/`lib/types`/`api-client`/
  filtro/financeiro/página; **testes reescritos** (fluxo emit→`EMITIDO`, guards ajustados, sem "confirmar").
- **Gates**: typecheck/lint/format/build/validate:schemas verdes; **unit 345/345**; **integração 364/364**.
  Commit **`80a213f`** (não pushado). _(No caminho: `migrate reset` do `rastreio_test` — a 1ª versão da
  migration usava `"SaleContract"` no lugar da tabela real `sale_contract`; registrado na memória.)_

### 2026-07-02 — Sessão 70 (remove EM_ABERTO: contrato nasce EMITIDO numa criação atômica)

Continuação da simplificação da máquina de status (**D97**), a pedido do Flavio. O `EM_ABERTO` era um
**rascunho transitório**: a criação fazia DUAS chamadas (grava a linha parcial `EM_ABERTO` → `emitSaleContract`
completa → `EMITIDO`) e no happy-path ninguém descansava nele. Como a **venda no lote fora da página Contratos
já não existe** (`/samples` só registra Perda; o detalhe da amostra não cria contrato), **toda** venda nasce
gerando o contrato — então o `EM_ABERTO` só sobrava como janela de falha e rascunho recuperável, ambos
dispensáveis.

- **Contrato nasce `EMITIDO`** numa **única operação atômica** (a etapa 2 já vem no mesmo modal). Enum final
  **`EMITIDO · FATURADO · PAGO · WASH_OUT`**; migration `20260702120000_contract_remove_em_aberto` recria o
  tipo (`USING EM_ABERTO → EMITIDO`, defensivo; não há linhas `EM_ABERTO` em prod).
- **À vista**: `SaleContractService.createSpotSaleContract` orquestra — resolve a etapa 2 fora da tx
  (`_resolveEmitData`, reusado pelos 3 caminhos), sincroniza o dono do lote ao vendedor **antes** da venda
  (D48, quando diferem) e delega ao `createSampleMovement` (SALE), que grava o `SALE_CREATED` + o contrato
  **`EMITIDO`** completo + a auditoria na MESMA tx (`createSaleContractInTx` mescla `contractDraft` + `emitData`).
  `createSampleMovement` SALE passa a **exigir** `saleContractEmitData`.
- **Futuro**: `createFutureSaleContract` passa a coletar fase 1 **+ etapa 2** e grava `EMITIDO` + auditoria de
  uma vez. O `POST /sale-contracts` discrimina pelo `type` do corpo.
- **`emitSaleContract` vira só "Editar"** (re-emitir um `EMITIDO`; guard `EMITIDO` only). O modal de criação faz
  **1 chamada só** (some `createdId`/`cleanupPartialThen` — não há órfão).
- **Escape hatch "Excluir" (Q1)**: card `EMITIDO` ganha **"Excluir"** (enquanto não faturado) — `cancelSaleContract`
  passa a exigir `EMITIDO` e apaga o contrato + dependentes (export/agioLog/brokers) + desfaz a venda. O
  `washoutOrDeleteSaleContractByMovement` recebe **`mode` explícito** (`DELETE`|`WASHOUT`, default WASHOUT):
  cancelar a venda pelo movimento **faz WASHOUT** (não apaga). Botão de criação continua **"Emitir"** (Q2).
- **Ações do card**: **`EMITIDO` = Editar · Faturado · Pago · Visualizar · Ágio · Deságio · Excluir · Washout**;
  `FATURADO`/`PAGO`/`WASH_OUT` inalterados; **sai o estado `EM_ABERTO`** (e o filtro "Em aberto"). PDF perde o
  gate 409 `EM_ABERTO` (todo contrato nasce emitido).
- **Correção de teste**: `resetDatabase` não limpava as tabelas do contrato (sem FK `sale_contract→sample`) —
  passou a truncá-las (senão contratos residuais vazam entre testes).
- **Gates**: typecheck/lint/format/build/validate:schemas verdes; **unit 345/345**; **integração 363/363**
  (testes reescritos p/ born-EMITIDO por subagente + revisados). **3 contratos-demo criados direto no banco**
  (`seed-demo-contracts.mjs`: `0001/26`+`0002/26` à vista + `0003/26` futuro; `sampleId`/`movementId` null) —
  **apagados se rodar `test:integration:db`**, re-seedar com o script. **Não commitado.**

### 2026-07-02 — Sessão 71 (Envio do contrato por e-mail — desenho) · DESCARTADO (2026-07-08)

Desenho (D98–D103, **Fase H**) do envio do PDF do contrato por e-mail ao cliente — **descartado a pedido do Flavio em 2026-07-08, sem nunca ter virado código**. Os detalhes do desenho, a Fase H do roadmap e as referências cruzadas foram removidos do doc. A **infra base de e-mail** (`AppEmailService`/`src/email`, usada por reset de senha e fluxos de usuário) **não é afetada**.

### 2026-07-02 — Sessão 72 (cor do Emitido, remoção do "Excluir", Washout paga corretagem)

Início do trabalho nos cards de contrato (o redesenho de layout/botões vem em seguida).

- **Emitido = amarelo** (a pedido do Flavio; os outros status inalterados): barra `#eab308` (amarelo vivo),
  selo com fundo `#fef9c3` + texto `#a16207` (amarelo escuro, legível). Foi preciso **separar a cor da barra
  da cor do texto do selo** (antes era a mesma) — amarelo vivo sumia como texto no fundo claro. Aplicado no
  card de `/contratos` **e** no de `/financeiro` (novo `STATUS_TEXT_COLOR` nos dois). _(Só cor, sem D.)_
- **"Excluir" removido (D104)** — o Flavio apontou que complicava o sistema e era redundante com o Washout.
  Reverte a parte "Excluir" do D97/Q1. Removidos `cancelSaleContract` (service/handler/rota `/cancel`/api-client),
  o `mode` DELETE (`washoutOrDeleteSaleContractByMovement` → `washoutSaleContractByMovement`, só washout), o
  botão do card + a ação `cancel` do lifecycle dialog. Um erro passa a ser desfeito **via Washout** (nunca
  apaga; o número fica registrado — melhor auditoria/numeração).
- **Washout ainda paga corretagem (D105)** — regra de negócio do Flavio: o corretor fez a negociação, então
  recebe **mesmo com washout**. `WASH_OUT` passa a **aparecer no Financeiro** (`listBrokerReceivables` inclui
  `WASH_OUT`; selo vermelho no card) **e a ser elegível ao Espelho**. Revisa D92/D71.
- **Pagamento só após faturamento (D106)** — regra do Flavio: na comercialização o pagamento vem sempre
  depois de faturar. `paySaleContract` aceita **só `FATURADO`** (era `EMITIDO`/`FATURADO`); o card perde o
  "Pago" no Emitido (ciclo **linear** `EMITIDO → FATURADO → PAGO`). Some o "pular faturamento" (revisa S49);
  `resolveRevertTarget` fica determinístico (`PAGO → FATURADO`).
- **Testes**: −4 de "Excluir"; +1 ("Financeiro: WASH_OUT ainda aparece"); ajustados os de pagar/desfazer p/ o
  ciclo linear (pagar de EMITIDO → 409; removido o "desfazer PAGO que pulou"; washout de PAGO fatura antes).
  Gates verdes; **unit + integração verdes**.

### 2026-07-03 — Sessão 73 (Aprovação do contrato — análise, só registro)

Análise da ação "criar Etiqueta de Aprovação" e da direção pra conectá-la ao contrato (**D107**, **Fase I**). A
pedido do Flavio, **só análise/registro — sem código**; a etiqueta avulsa atual do `/samples` fica.

- **Achado**: a etiqueta hoje é um `custom_print_job` **livre e sem auditoria** (sem ator, sem vínculo com
  amostra/contrato, fora do event store) — ao contrário da etiqueta QR da amostra, que é auditada via eventos.
- **Direção (respostas do Flavio)**: aprovação **sempre pós-emissão**, **do contrato**, **marco físico auditado
  no contrato** (não é status); **lotes da etiqueta = EXTERNOS**, digitados à mão; os outros 5 campos vêm do
  contrato. Vira ação do card → grava `SaleContractApproval` (molde `Export`/`AgioLog`) + reusa o
  `customPrintJob` pra imprimir.
- **Abertas Q1–Q5** (1:1×1:N; selo no card×só histórico; campos travados×editáveis; destino do modal avulso;
  quem aprova). Ver a seção **"Aprovação do contrato"**. _(Implementação = Fase I, sessão futura.)_

### 2026-07-03 — Sessão 74 (modal de emissão no desktop + detalhes do contrato = modal)

Várias frentes da **Fase G** (P27 — design/layout) + refino do Espelho:

- **PDF do contrato — refinamentos de layout (D111)**: logo alinhado ao bloco do emissor; linha de
  identificação **justificada de borda a borda** (Nº Compra colado ao Nº Contrato, miolo reservado ao valor da
  compra); cabeçalhos dos cards de partes/armazéns **centralizados sobre cinza**; **Banco do vendedor sem
  "Titular"** em **grid 3×2** (Banco+CNPJ · Agência+Conta · Chave PIX — a **Chave PIX longa quebra em 2 linhas**,
  sem truncar); **valores em CAIXA ALTA EXCETO a Chave PIX** (preserva o caso — chaves são copiadas);
  **Observação/Descrição com fonte adaptativa** (8 pt padrão, encolhe pra caber). **Página única** mantida;
  on-demand (D32). Conferido no `scripts/preview-contract.mjs`.
- **Modal de emissão (desktop) — IMPLEMENTADO**: layout **maior e centralizado na área de conteúdo** (à
  direita da sidebar, `left: calc(50% + var(--app-sidebar-w)/2)`; ~80% da largura útil, teto 1180px;
  `max-height: 88dvh`) + campos em **2 colunas de seções** (Venda/Vendedor/Comprador · Pagamento/Valores/Textos)
  com pares por seção, pra caber **sem scroll** (scroll só como fallback em telas baixas). **Só desktop**
  (`@media ≥901px`), escopado a `.ctr-contract-sheet`; **mobile intocado** (wrappers `.ctr-etapa2-cols/-col`
  e `.ctr-pair` são `display: contents` abaixo de 901px → layout idêntico ao atual). Gates verdes
  (typecheck/lint/format/compile). Arquivos: `SaleContractEtapa2Modal.tsx` + `app/globals.css`. _(Na árvore de
  trabalho, não commitado.)_
- **Detalhes do contrato = MODAL (D108) — só registro**: a ideia de "página de detalhes do contrato" é
  **substituída por um modal grande** (padrão do de emissão). O **card mantém o acordeão** com as **ações
  principais por status** + novo botão **"Detalhes"** → modal com o **resto das informações** (read-only) e, no
  futuro, o **timeline de auditoria** (D107). **Ações principais**: `EMITIDO` = Ágio·Deságio·Washout·Faturar·
  Detalhes; `FATURADO` = Pagar·Washout·Detalhes; `PAGO` = Washout·Detalhes; `WASH_OUT` = Detalhes. **Aberto**:
  Editar / Visualizar (PDF) / Desfazer — proposta = movê-los pro modal, **a confirmar**. **Sem código do modal
  de detalhes ainda.**
- **Audit do Espelho + fixes (2026-07-04)**: audit **multiagente** (3 agentes — backend/frontend/consistência)
  do fluxo do Espelho; núcleo **sólido** (ágio ao vivo, WASH_OUT elegível, `side` correto). **Fixes
  implementados** (**D109**): (#1) **exige corretagem** — backend rejeita `409 ESPELHO_NO_BROKERAGE` no lado sem
  comissão (`backend-api.js`), batendo com o front; (#2) **re-busca** o contrato fresco no
  `EspelhoCorretagemModal` (resumo casa com o PDF). **Abertos** (registrados na D109): contraparte, % não
  impressa, ágio "0,00", auditoria D71 do espelho, saída do modo-seleção, guardas de download. **Prosa defasada
  do doc corrigida** (seções Espelho/Financeiro diziam "CONFIRMADO"/excluíam WASH_OUT → EMITIDO + WASH_OUT).
  Gates verdes (unit 344/345, integração 59/59).
- **COMMERCIAL gerencia os próprios contratos (D110) — Fase 1 (2026-07-04)**: o fix #3 ("COMMERCIAL gera
  espelho") cresceu, por decisão do Flavio, em **abrir a /contratos ao COMMERCIAL** (filtrada aos contratos
  dele via `Broker.userId`) **e gerenciá-los** — **revoga "Gestão de Contratos = ADMIN-only"**. **Fase 1
  IMPLEMENTADA**: gate `SALE_CONTRACT_ACCESS_ROLES` + helpers de posse
  (`_resolveOwnBrokerId`/`_assertActorMayAccessContract`, 403 antes do `findUnique`); `listSaleContracts`
  filtra, `getSaleContract`/espelho/pdf autorizam por posse; `/contratos` **role-adaptive** (COMMERCIAL:
  só-leitura + Espelho; ações de gestão escondidas; FAB vira gatilho direto do espelho; nav liberado). Gates
  verdes; **integração 59/59** (teste "COMMERCIAL 403" atualizado + 2 casos de posse). **Fase 2 (a fazer)**:
  mutações (criar/editar/faturar/pagar/reverter/washout/ágio) — criação exige o próprio corretor. Tudo na
  árvore de trabalho, não commitado.

### 2026-07-04 — Sessão 75 (Aprovação do contrato — fluxo + auditoria, só registro)

Fecha as **Q1–Q5** da S73 e o desenho da auditoria (**D112–D114**, Fase I). **Sem código.**

- **Q1–Q5 (respostas do Flavio)**: **1:N** — todo **ENVIO** auditado; o desfecho (cliente aprovou/recusou)
  fica **fora do sistema**; **sem selo** no card (só histórico no timeline do Detalhes, D108); **5 campos
  editáveis** pré-preenchidos do contrato + **lotes pré-preenchidos do `originLot`** da amostra (formatos
  divergem — texto livre ≤100 chars vs. até 16 campos discretos de 16; a quebra fica pro campo a campo; sem
  `originLot` = vazios); a entrada do `/samples` **fica** e passa a abrir um **seletor de contratos reduzido**
  (todos os contratos a todos os não-PROSPECTOR: nº + comprador + data + sacas + busca, **sem valores**) com
  botão **"Manual"** no canto superior direito (a etiqueta 100% manual sobrevive **só por aí**, absorvendo o
  modal avulso atual — **agora auditada**); **quem** = todos exceto PROSPECTOR (= gate atual); **status** =
  `EMITIDO`/`FATURADO`/`PAGO` (WASH_OUT fora); ação = **mais um botão no acordeão** nos status permitidos.
- **Auditoria (análise da sugestão do Flavio — tabela única confirmada, com um ajuste)**: **uma tabela** pra
  vinculadas e avulsas (2 tabelas = duplicação; event store não serve — avulsa/Futuro sem amostra). A coluna
  booleana "é avulso" foi **descartada**: `saleContractId` **nulo** já diz (derivável; a booleana duplicaria o
  dado e abriria estado inconsistente). Linha = `saleContractId?` + `actorUserId` + `createdAt` + `payload`
  (**linhas como impressas**, pós-edição) + `customPrintJobId` (DONE/FAILED fica no job — audita-se o envio).
  **Nome proposto `ApprovalLabelLog`** (a confirmar na implementação). Avulsas **sem tela por ora**.
- **Implicação de backend**: **endpoint próprio de listagem reduzida** de contratos (gate não-PROSPECTOR; view
  enxuta montada no backend). _Consequência consciente_: o COMMERCIAL etiqueta contratos de outros por esse
  caminho (sem ver os detalhes — exceção deliberada à posse da D110).
- **Próximo passo**: **análise campo a campo** — quebra do `originLot` nos campos discretos; **qual dos 2
  armazéns** do contrato preenche o campo único; nome do **produtor** no snapshot (PF com filial?);
  `purchaseNumber` opcional; casos sem lote de origem (Futuro/liga).

### 2026-07-04 — Sessão 76 (Aprovação — análise campo a campo, só registro)

Fecha o **mapeamento campo a campo** da etiqueta de aprovação (**D115–D116**). **Sem código.**

- **5 campos diretos do contrato** (todos editáveis/D112, cortados no limite físico do campo): Nº compra ←
  `purchaseNumber` (opcional → vazio; corta em 26 — >26 é irreal na prática, decisão do Flavio); Nº
  fechamento ← `contractNumber` ("NNNN/AA" cabe folgado); Produtor ← `sellerSnapshot.displayName` (sempre
  existe pós-D97; PF = nome / PJ = razão social; corta 52); **Armazém ← SEMPRE o do vendedor**
  (`sellerWarehouseSnapshot.displayName`; opcional → vazio; corta 52); Sacas ← `quantitySacks`.
- **Lotes (o único com transformação)** ← `Sample.declaredOriginLot` via `sampleId` (entrada `originLot`,
  ≤100 chars). **Separadores = traço, espaço, vírgula e ponto-e-vírgula**; **barra NÃO** (pode ser
  composição do lote). Pedaço **>16 → corta em 16**; **>16 pedaços → 16 primeiros** (`MAX_LOTS`); **texto
  original exibido no modal** (só leitura) como referência da quebra. Sem fonte (Futuro sem amostra / liga
  nula por design / campo vazio) = lotes vazios. **Descoberta que mudou a regra**: o `splitLots` do print
  agent divide a linha LOTE **por vírgula** (`print-agent/label.js`) e o campo do modal já bloqueia
  digitá-la → vírgula dentro de lote é fisicamente inimprimível; a 1ª rodada ("só traço e espaço") foi
  então revisada pelo Flavio pra incluir vírgula e ponto-e-vírgula como separadores.
- **Prefill no backend (D115)**: endpoint com gate não-PROSPECTOR devolve os 5 campos + lotes já quebrados
  (1 consulta ao contrato + amostra se à vista); a quebra é **função pura** em support (unit-testável),
  única pras 2 portas (card e seletor do `/samples`).
- **Próximo**: detalhar o **fluxo de UI das duas portas** — página de amostras e página de contratos.

### 2026-07-04 — Sessão 77 (Aprovação — fluxo de UI das duas portas, só registro)

Fecha o **fluxo de UI** da Aprovação (**D117**). **Sem código.**

- **Seletor** (porta `/samples`): **só elegíveis** (`EMITIDO`/`FATURADO`/`PAGO`; WASH_OUT nem aparece, nem
  desabilitado), **todos os contratos** do mais recente pro mais antigo, **campo de busca**; "Manual" no
  canto superior direito.
- **Navegação**: o formulário aberto pelo seletor ganha **"Voltar"** (contrato errado não obriga a
  recomeçar o caminho).
- **Modais**: **desktop = centrais**; **mobile = bottom sheet** (pedido do Flavio citando a criação de
  amostra e a de contrato — conferido no código: o `NewSampleModal` é BottomSheet, mas o modal de criação
  de contrato é **central também no mobile** (`.app-modal`, animação de scale); o débito "BottomSheet pra
  ações" já está anotado na B.3/skill `modals` → candidato à Fase G).
- **Card do contrato**: botão **"Aprovação"** ("Aprovar" descartado — soaria como mudança de status).
  **Sucesso** = padrão atual (check + auto-close).
- **Próximo**: perguntas finais de **funcionamento** (histórico no Detalhes, resultado da impressão, selo
  de status no seletor, nº de cópias, validação do formulário) → plano de implementação da Fase I.

### 2026-07-04 — Sessão 78 (Aprovação — funcionamento, só registro)

Fecha os **últimos detalhes de funcionamento** da Aprovação (**D118**). **Sem código.**

- **Linha do histórico** (timeline do Detalhes, D108): **"há X tempo"** (relativo) + **quem enviou** +
  **nº do contrato** + aviso **"Aprovação enviada"** — resumida, **sem drill-down** do payload na UI (as
  linhas impressas ficam na auditoria, D114).
- **Sem resultado da impressão** no histórico (DONE/FAILED fica no `custom_print_job`; falha de impressora
  → reimprime, e cada reenvio é auditado).
- **Seletor**: item ganha **selo de status** (Emitido/Faturado/Pago) junto de nº + comprador + data +
  sacas.
- **Cópias = 1 por envio** (mais vias = reenviar); **validação mantida** ("ao menos um campo preenchido").
- **Aberto**: escopo do histórico na Fase I — o modal de Detalhes (D108) ainda não existe: construir o
  timeline junto na Fase I, ou gravar a auditoria primeiro (write-only) e o timeline vir com o Detalhes?
  E o **nº do contrato na linha** sugere uma possível **visão geral de aprovações fora do contrato** — a
  confirmar com o Flavio.

### 2026-07-04 — Sessão 79 (Aprovação — escopo em fases + histórico, só registro)

Fecha as **3 últimas perguntas de funcionamento** (**D119**, revisa D118). **Sem código.**

- **Fase I em fases**: a implementação inicial grava a **auditoria completa desde o 1º dia** (write-only,
  sem tela de leitura); o **modal de Detalhes (D108) com o timeline** é construído em fase posterior.
- **Histórico SÓ no Detalhes** do contrato (sem visão geral fora dele) → a linha fica **sem o nº do
  contrato**: formato final = **"há X tempo" + quem enviou + "Aprovação enviada"**.
- **Data/hora exata como apoio** do tempo relativo (texto menor/toque) — confirmada.
- **Próximo**: análise multiagente da funcionalidade inteira (gargalos/inconsistências) → perguntas finais
  → **plano de execução da Fase I**.

### 2026-07-04 — Sessão 80 (Aprovação — Fase I.a/I.b IMPLEMENTADAS)

Análise multiagente → plano aprovado → implementação completa da etiqueta auditada nas 2 portas.

- **Análise (3 Explore + 1 Plan)**: achados-chave — `BottomSheet` já é "sheet no mobile + central no
  desktop" (≥901px) → o requisito da D117 saiu de graça (**e a nota da D117 foi corrigida**: o modal de
  criação usa BottomSheet; a versão anterior, "central também no mobile", estava errada); o
  `SaleContractLotPickerModal` serviu de molde pro seletor; `requestCustomPrint` tinha 1 único caller →
  aposentadoria limpa; a view atual de contratos vaza financeiro+PII → selects mínimos novos; o gate
  não-PROSPECTOR é automático (fora da allowlist do prospector). Plano em
  `~/.claude/plans/squishy-pondering-koala.md`.
- **Parâmetros adotados** (Flavio ausente na hora; defaults recomendados): "Limpar" **zera tudo** nas duas
  portas; "Voltar" **descarta edições** (reabrir re-preenche); **tabela `ApprovalLabelLog`** confirmada.
- **Commit `6eebc20`** — schema + migration `20260704120000_approval_label_log` (molde
  `SaleContractAgioLog`; `sale_contract_id` NULLABLE = avulsa; FKs inline no SQL; índice
  contract+created; sem trigger).
- **Commit `3f22b62`** — backend: funções puras no `sale-contract-support.js`
  (`splitOriginLotForLabel` = regex `/[-\s,;]+/` + corte 16 + teto 16; `buildApprovalPrefill` = cortes
  26/52 + sacas string; `toApprovalContractOption` = allowlist; `APPROVAL_ELIGIBLE_STATUSES` sem
  WASH_OUT — **não** copiou a lista do Espelho); 3 handlers no `backend-api.js` (seletor cap 500 desc,
  prefill com fetch mínimo + `declaredOriginLot`, envio captura o ator + `$transaction` job+log com o
  MESMO payload, 409 `APPROVAL_CONTRACT_NOT_ELIGIBLE`, 422 `APPROVAL_LABEL_EMPTY`, UUID malformado→404);
  3 rotas `approval-labels/*`; **+8 unit** (quebra/prefill/allowlist) e **+10 integração** (tx atômica,
  avulsa NULL, 409/404/422 sem gravar, CLASSIFIER passa, PROSPECTOR 403, lista sem financeiro).
- **Commit `ff2a50f`** — frontend: `ApprovalContractPickerModal` (clone do LotPicker sem scroll infinito;
  1 carga; busca client-side nº/comprador; selo de status reusando `STATUS_META/TINT/TEXT_COLOR`
  exportados do card; "Manual" no topo direito); `ApprovalLabelModal` com `prefill`/`saleContractId`/
  `onBack`, seed por effect no open, referência `.alm-origin-ref`, footer `.alm-footer-3` (Voltar +
  Limpar + Imprimir), submit → `sendApprovalLabel`; `/samples` = máquina picker→form com swap sem
  sobreposição; `/contratos` = botão "Aprovação" (3 status, fora do `canManage`) → form direto;
  **aposentados** `requestCustomPrint` + rota `custom-print/request` + `enqueueCustomPrintJob`
  (`/pending` + `/result` do print agent intactos).
- **Verificação no app real** (skill verify + Playwright, dev server + login Flavio): porta `/contratos`
  desktop = modal central 650px pré-preenchido (lotes `1234·5678·91011·12/3·999` — **barra preservada**,
  referência visível) → envio → `approval_label_log` com contrato+ator+job PENDING e payloads idênticos;
  porta `/samples` mobile 390px = seletor bottom-sheet (3 elegíveis, selo amarelo, busca "Aurora"
  filtra) → form com Voltar (grade 3 colunas ok) → Voltar volta ao seletor → Manual em branco →
  imprimir vazio = erro inline → avulsa gravada com `sale_contract_id NULL`; probes: WASH_OUT some do
  seletor + 409 no prefill/envio **sem gravar nada**, UUID aleatório/malformado → 404, rota antiga → 404.
  Print agent não estava rodando (jobs ficam PENDING — comportamento esperado; impressão física não
  exercitada).
- **Gates verdes**: lint/format/typecheck/build/schemas; **unit 353** / **integração 377**. Skill
  `prisma` atualizada (`ApprovalLabelLog` + enfileiramento auditado + enum de status corrigido pra
  pós-D96/D97). **Resta da Fase I**: timeline no modal de Detalhes (D108, fase futura) + **validar no
  device**.

### 2026-07-04 — Sessão 81 (Modal de Detalhes — desenho fechado, só registro)

Fecha o desenho do **modal de Detalhes do contrato** (**D120–D125**; resolve o aberto da D108 e a D71).
Análise: 1 agente Explore inventariou as fontes de auditoria e os moldes de modal. **Sem código** —
implementação = **Fase J** (sessão futura, plano próprio).

- **Inventário que fundamentou as perguntas**: com ator já existem criação/edições (`SaleContractExport`),
  ágio (`SaleContractAgioLog`) e aprovações (`ApprovalLabelLog`); **sem ator** estavam Faturar/Pagar/
  Desfazer e o washout de Futuro (só datas — e o Desfazer **apagava** a data); **sem rastro nenhum**,
  download de PDF e geração de Espelho. O card pós-S80 estava com **7 botões** no EMITIDO. O read-only do
  modal não precisa de backend novo (`getSaleContract` devolve partes completas, banco, armazéns,
  corretores, textos). Molde: modal de emissão; helper `formatRelativeTime` já existe (dashboard).
- **Rodada 1 (respostas do Flavio)**: **card enxuto** (D121, com prévia aprovada); marcos → **"não temos
  mais o botão de desfazer" + auditar o washout**; **COMMERCIAL vê tudo** no modal (D86 fica só no
  Financeiro); **auditar o Espelho já** (resolve D71; downloads de PDF adiados).
- **Rodada 2 (confirmações)**: **Desfazer removido DE VEZ** (D122 — backend + botão, molde D96/D104;
  engano em Faturar/Pagar → só Washout); **auditar os 3 marcos** na mesma tabela (D123 — custo idêntico ao
  de auditar só o washout, timeline completo); **layout = seções + Histórico no fim** (D120, prévia ASCII
  aprovada; alternativa de abas descartada).
- **Registro**: D120–D125 na tabela + notas de revisão na D87 (ágio sai do card), D106 (Desfazer removido),
  D108 (aberto resolvido) e D109 (D71 → D124) + seção nova **"Modal de Detalhes do contrato"** (layout,
  tabela de botões, timeline) + **Fase J** no roadmap.

### 2026-07-04 — Sessão 82 (Detalhes — contrato embutido no modal, só registro)

Refinamento pedido pelo Flavio logo após a S81: **o contrato (PDF) também entra no modal de Detalhes**,
que por isso usa o **frame grande** do modal de criação (**D126**, revisa D120/D121). **Sem código.**

- **Documento embutido**: o mesmo preview on-demand do "Visualizar" (rota `/pdf`, D63/D64) passa a viver
  **dentro** do Detalhes — **coluna esquerda** no desktop (seções read-only empilham na direita),
  **primeira seção** no mobile (altura contida, rolável). Histórico segue em largura total no fim.
- **Rodapé revisado**: **"Visualizar" sai** (redundante com o PDF à vista); **Exportar/Baixar**
  acompanham a própria seção do documento em todos os status. Rodapé final: `EMITIDO` = Editar · Ágio ·
  Deságio · Washout; `FATURADO`/`PAGO` = Washout; `WASH_OUT` = sem ações.
- **Proposta decorrente (a confirmar na Fase J)**: aposentar o `SaleContractDocumentModal` — depois da
  D121 + D126, nada mais o abre.
- **Registro**: D126 na tabela + notas nas D120/D121 + seção "Modal de Detalhes" atualizada (ASCII novo
  com o PDF + tabela de botões) + Fase J ampliada no roadmap.

### 2026-07-04 — Sessão 83 (FASE J IMPLEMENTADA — modal de Detalhes + timeline + auditorias)

Implementação completa das D120–D126 em 4 commits. A única pendência de decisão ("aposentar o
Visualizar?") ficou sem resposta em 60s → **default recomendado adotado: aposentado** (fácil de reverter
pelo git se o Flavio discordar).

- **`ec620ec` — migrations**: `20260704140000_sale_contract_status_log` (D123: contrato + `toStatus` +
  motivo + ator + quando) e `20260704141000_sale_contract_espelho_log` (D124: contrato + `side` + ator +
  quando), molde `SaleContractAgioLog` (FKs só no SQL, aditivas, idempotentes).
- **`aafc145` — backend**: **D123** — Faturar/Pagar gravam o marco na MESMA `$transaction` da transição
  (`_statusLogData`), o washout de Futuro idem (com motivo) e o washout à vista grava dentro da tx do
  event store (`washoutSaleContractByMovement` ganhou `actorUserId`, repassado pelos 2 cancels do
  `sample-command-service`); **D124** — `logEspelhoGenerated` chamado pelo `exportEspelhoPdf` após o
  render; **D125** — `buildContractTimeline` (support puro: criação/edições via Export, ágio, aprovações,
  marcos com **fallback legado só-com-data**, espelhos; ordem desc; nomes via join manual de `app_user`) +
  `getSaleContractTimeline` (gate/posse do getSaleContract) + rota GET `/sale-contracts/[id]/timeline`.
  Testes: **+3 unit** (ordenação/criação×edição, legados sem duplicar, mapeamentos) e **+6 integração**
  (marcos com ator nos 2 caminhos de washout, espelho, timeline com legado, posse 403); o `beforeEach`
  passou a seedar também o usuário COMMERCIAL (FK `actor_user_id`).
- **`50cfd59` — D122**: Desfazer removido ponta a ponta (−213 linhas): `revertSaleContractStatus` +
  rota `/revert-status` + `resolveRevertTarget` + ação `revert`/prop `currentStatus` do
  `SaleContractLifecycleDialog` + botões do card + client + 5 testes.
- **`7002f22` — D120/D126/D121**: **`SaleContractDetailsModal`** novo — frame do modal de emissão
  (`.ctr-contract-sheet` central ≥901px / sheet mobile), **PDF embutido** (blob/iframe do antigo
  Visualizar; coluna esquerda no desktop, primeira seção no mobile; **Exportar/Baixar na seção**), seções
  read-only (identificação com datas reais, partes completas, banco, armazéns, pagamento/logística,
  valores com **corretores**, textos), **Histórico** em largura total (linha "há X tempo" + quem + o quê,
  data exata de apoio; legados sem autor), rodapé por status com **swap** pros fluxos (Editar/Ágio/
  Deságio/Washout fecham o Detalhes e abrem o modal correspondente); **card ENXUTO** (Faturado|Pago
  `canManage` + Aprovação + Detalhes); `SaleContractDocumentModal` **aposentado**;
  `formatRelativeTime` com acentos ("há"/"mês" — na época o card "Últimas atividades" do dashboard
  herdava a correção; o card foi removido em 2026-07-06 e o helper virou `lib/relative-time.ts`).
- **Verificação no app real** (Playwright): desktop = modal central 848px, grid PDF|seções, rodapés por
  status (EMITIDO 4 ações · FATURADO só Washout), Faturar → linha **"há 1 min · Flavio Henrique
  Fagundes de Oliveira · Faturado"** com data exata, swap Washout ok; Aprovação pelo card → linha
  **"agora · Flavio · Aprovação enviada"**; mobile 390px = sheet no rodapé, coluna única com o
  **documento primeiro**. Gates verdes (unit 354 / integração 383 / build/lint/typecheck/format).
  **Validar no device.**
- **Nota pós-S83 (Flavio)**: o **"Visualizar" SERÁ disponível no MOBILE** — a aposentadoria do
  `SaleContractDocumentModal` (default adotado na S83) será revisitada no contexto mobile; **layout e
  funcionalidades do mobile serão discutidos em sessão futura** (pendência aberta da Fase J).

### 2026-07-06 — Sessão 84 (Espelho + Financeiro — correções pós-análise, D127–D130)

Análise do fluxo do Espelho (pedida pelo Flavio antes de mexer no Financeiro) encontrou inconsistências
e gargalos; decisões colhidas via perguntas e implementadas em 3 commits + doc.

- **D127** (revisa a semântica da D124) — a auditoria do Espelho registra **só a EXPORTAÇÃO**
  (Exportar/Baixar), não a prévia: antes cada render logava ("Espelho gerado" a cada abertura/troca de
  lado do modal → ruído no timeline). **`78e838f`**: GET `.../espelho/pdf` aceita `?preview=1` (prévia do
  modal, sem log; sem o param — acesso direto à URL — loga, agora **best-effort**: log falho não invalida
  um PDF já renderizado) + novo POST `.../espelho/log` (`logEspelhoExport`: side no body, posse via
  getSaleContract) disparado fire-and-forget no clique de Exportar/Baixar; label do timeline vira
  **"Espelho exportado"**. Bônus: o `side` do toggle é reconciliado com o contrato FRESCO re-buscado ao
  abrir (lado que perdeu a corretagem não fica selecionado → evita 409 `ESPELHO_NO_BROKERAGE`).
- **D128** (revisa D77/D82/D83/D86) — **Financeiro vira ADMIN-only**: o COMMERCIAL perde a página (e a
  projeção `myShare` sai do backend/página/card). **`c42ed1f`**: `FINANCEIRO_ROLES=[ADMIN]` nos 2 lados;
  ⚠️ o gate de nav de **Contratos** reusava `FINANCEIRO_ROLES` → nova constante **`CONTRATOS_ROLES`**
  (ADMIN+COMMERCIAL) preserva a sidebar do COMMERCIAL. Aproveita o gargalo mapeado na análise:
  `listBrokerReceivables` troca o `SALE_CONTRACT_VIEW_SELECT` completo (5 snapshots JSON por linha que o
  Financeiro não usa) pelo **`RECEIVABLE_VIEW_SELECT`** enxuto; paginação fica pra revisão da página.
- **D129** (refina a D79) — rateio: o **resto de centavos vai pro 1º corretor** (ordem `createdAt asc`):
  100,00÷3 → 33,34/33,33/33,33 — a soma das cotas SEMPRE bate com o `commissionTotal` exibido (antes
  divergia: 3×33,33=99,99). Mesmo commit `c42ed1f`; unit do resto + integração COMMERCIAL→403.
- **D130** — PDF do Espelho sem ágio: a coluna Ágio/Deságio sai com as **DUAS células vazias**
  (antes "Valor" imprimia "0,00" com rótulo vazio — o `?? 0` anulava o null→vazio do helper `dec`).
  **`61e0a09`**; conferido no render real (gs→PNG).
- Achados da análise **deixados de fora de propósito**: cache por lado da prévia no modal (micro),
  paginação do Financeiro (junto da revisão da página), fallback dos-dois-lados do modal quando nenhum
  lado tem corretagem (inalcançável hoje — a página só abre p/ elegíveis; atenção se o Espelho ganhar
  outro ponto de entrada, ex. pelo Detalhes).
- Gates verdes (unit 354 / integração 379 / build / lint / typecheck / format / schemas / contracts).
  **Validar no device** (Flavio fará as conferências).

### 2026-07-06 — Sessão 85 (Espelho — conferência campo a campo + fase de CONFERÊNCIA no fluxo, D131–D134)

Pedido do Flavio: uma **fase a mais** antes da geração do Espelho — modal que apresenta os campos
puxados do contrato pra confirmar, com botão pros Detalhes (editar se preciso). Antes, conferência
campo a campo do que o PDF puxa (3 correções). 6 decisões via perguntas; 2 commits + doc.
**Próxima etapa combinada: layout/design do documento do Espelho** (sessão futura).

- **D131** — coluna **"Data" = data de GERAÇÃO do espelho** (imprimia `contractDate`; fuso
  `America/Sao_Paulo`, precedente do `sample-command-service`); **"Pagamento" mantém `paymentDate`**.
- **D132** — coluna **"Comprador / Vendedor" REMOVIDA** (imprimia o mesmo nome do CLIENTE do topo;
  fecha o aberto da S61/D109 — ficam **9 colunas**).
- **D133** — coluna **"Preço" = preço EFETIVO**/saca (cru ± ágio/deságio — a base real da comissão;
  mesma conta do `computeContractMoneyWithAgio`); Ágio/Deságio + Valor ficam informativas.
  **`c06f9a7`** (as 3); conferido no render real (gs→PNG) com e sem ágio (1.620→1.640 com ágio 20/sc).
- **D134** — **fase de CONFERÊNCIA** no fluxo (**`5fe8b89`**): novo **`EspelhoConferenciaModal`**
  entre a seleção do card e a prévia — campos que sairão impressos (contrato **fresco** re-buscado;
  Data/Preço espelhando o PDF), **toggle Vendedor|Comprador MIGROU pra cá** (a prévia herda via prop
  `side`, sem toggle nem resumo), ações **Cancelar · Ver detalhes · Gerar espelho**. **"Ver detalhes"
  = vai-e-volta** com o `SaleContractDetailsModal` (`espelhoReturnRef` na página: fechar o Detalhes
  reabre a conferência; os swaps Editar/Ágio/Washout limpam o retorno — fluxo encerra). Auditoria
  D127 inalterada (prévia `preview=1`; Exportar/Baixar logam). CSS: grade `ctr-espelho-fields`
  reusando `ctr-espelho-summary-*`.
- Seção "Espelho de Corretagem" atualizada (mapeamento campo→origem + fluxo + notas: auditoria
  resolvida D124/D127, coluna da parte removida, TOTAL 0 impossível pós-D109).
- Gates verdes (unit 354 / integração 379 / build / lint / typecheck / format). **Validar no device.**

### 2026-07-06 — Sessão 86 (Página Financeiro — data de pagamento + paginação server-side)

Revisão da página Financeiro (análise → 4 perguntas → implementação). O Flavio pediu a **data de
pagamento** nos dados do fechamento; a análise reforçou o gargalo (carregava **todos** os contratos
congelados de uma vez). Decisões: data de pagamento no card **recolhido junto aos valores**; **paginar
agora** com **scroll infinito**; **Total a receber dinâmico** (segue a busca); **sem** filtro por status.

- **Consequência técnica:** com scroll infinito, somar o total e buscar por corretor no cliente cobriria
  só as páginas carregadas → **busca + total foram para o backend**. `listBrokerReceivables` ganhou
  `search`/`limit`/`cursor` (cursor de campo único = `contractSeq`, único e monotônico; `orderBy desc`,
  `take limit+1`), busca server-side por **nº do contrato OU nome do corretor** (pré-batch dos
  `SaleContractBroker` por `brokerNameSnapshot`) e **total agregado** (`aggregate _sum` de seller+buyer
  brokerage sobre o filtro, **ignora o cursor** → reflete o conjunto inteiro que casa com a busca).
  Resposta: `{ items, nextCursor, totalCommission }`.
- **Data de pagamento:** `RECEIVABLE_VIEW_SELECT` + `buildReceivableView` ganharam `paymentDate` (e
  `contractSeq` p/ o cursor); card mostra 3ª figura "Pagamento" no recolhido (`.fin-card-figures` já é
  flex-wrap).
- **Frontend:** `/financeiro` reescrita com reducer + `IntersectionObserver` (sentinel `.fin-load-more`)
  - busca **debounced** server-side (molde `/users`); "Total a receber" = `totalCommission` da resposta;
    estado de **erro** distinto de vazio. `listFinanceiro` (api-client) aceita `search/limit/cursor`.
- **Testes:** unit (`paymentDate` na projeção) + **+4 integração** (paymentDate + totalCommission na
  resposta; total respeita a busca; paginação por cursor sem sobreposição; busca por nº e por corretor).
- Verificado com dados reais (3 contratos-demo): total 34.120, cada item com `paymentDate`, paginação
  `limit=2`→`nextCursor`→página 2 sem sobreposição (total agregado preservado), busca por corretor.
- Gates verdes (unit 354 / integração 383 / build / lint / typecheck / format). **Validar no device.**
  Nota: o comentário da rota `financeiro/route.ts` (ainda dizia "ADMIN + COMMERCIAL") foi corrigido.

### 2026-07-08 — Sessão 87 (Financeiro reaberto ao COMMERCIAL — D135, revisa D128/D86)

O Flavio pediu **dar acesso à página Financeiro ao COMMERCIAL** (revertendo a D128, que a deixara
ADMIN-only). Análise multiagente (3 agentes: estado atual + o que a D128 removeu + modelo de posse/
sensibilidade) + plan mode com 3 perguntas. Decisões dele → **D135**: escopo **own-only** (só os
contratos dele, via `Broker.userId`); **co-corretores VISÍVEIS** (revisa a D86 — coerente com o que ele
já vê em `/contratos → Detalhes`, D120); **"Seu total a receber"** = a **cota dele** (÷N).

- **Achado da análise:** `listBrokerReceivables` **não tinha nenhum escopo** por corretor → um flip
  ingênuo do gate exporia o livro de corretagem da empresa inteira. Como os co-corretores ficam
  visíveis, **não** foi preciso reintroduzir a projeção `myShare` que a D128 removeu — o **card e o
  `buildReceivableView` ficaram inalterados**. Mudam só o **escopo da lista** e o **total do topo**.
- **Backend** (`sale-contract-service.js`): `FINANCEIRO_ROLES = [ADMIN, COMMERCIAL]`; em
  `listBrokerReceivables`, para o COMMERCIAL resolve `ownBrokerId` (reusa `_resolveOwnBrokerId`, D110) e
  **ANDa `id in ownContractIds` no `filterWhere`** (SQL) — a paginação por cursor, a busca e o total
  passam todos a respeitar o escopo (a busca por nome de corretor **não vaza** contratos alheios). Sem
  `Broker` vinculado → `{ items: [], nextCursor: null, totalCommission: 0 }`. O total do COMMERCIAL usa o
  novo helper **`_sumOwnBrokerReceivable`** (soma a cota dele sobre a carteira, reusando
  `buildReceivableView` p/ bater com a cota do card, rateio D79/D129 — o `_sum` do SQL só dá a corretagem
  cheia). ADMIN inalterado (segue no `_sum`).
- **Frontend**: `lib/roles.ts` `FINANCEIRO_ROLES = ['ADMIN','COMMERCIAL']` (restaura nav do
  `AppShell`/`HeaderAvatarMenu` + guard de rota automaticamente); `app/financeiro/page.tsx` só troca o
  rótulo do total → **"Seu total a receber"** para não-ADMIN. Card inalterado. PROSPECTOR segue fora
  (role exata + allowlist). Comentário defasado do handler `backend-api.js` corrigido.
- **Testes**: removido o "COMMERCIAL → 403" (D128); +4 integração (own-only + co-corretores; sem-broker →
  vazio/total 0; total = cota ÷N ≠ corretagem cheia; busca por corretor não vaza) — helpers
  `setupContractWithBrokers`/`createCommercialBrokerUser`.
- Gates verdes: **typecheck / lint / format / build / validate:schemas (51) / test:contracts (20) /
  unit 372 / integração 431** (sale-contract 69, com os 4 D135). **Validar no device.** Commit próprio
  (outro agente em paralelo). _(Plano em `~/.claude/plans/memoized-wiggling-quasar.md`.)_

### 2026-07-08 — Sessão 88 (Corretagem: rateio ÷N removido — D136, revisa D78/D79/D129/D135)

O Flavio apontou que dividir a corretagem igualmente entre os corretores (÷N) — sobretudo com corretagem
só de um lado — é uma **ficção que arrisca os registros**; pediu pra \*\*registrar só o valor da corretagem

- os corretores**, sem o sistema dividir. Análise multiagente (modelo de dados + consumidores do split) +
  plan mode (3 perguntas). Decisões → **D136**: card = corretagem total + **nomes** dos corretores (sem
  valor por corretor); total do COMMERCIAL vira **"Corretagem dos meus fechamentos"** (corretagem total dos
  2 lados dos contratos dele); corretagem **por lado** (vendedor/comprador %) **mantida\*\*.

* **Achado (2 agentes):** o ÷N era projeção de leitura num único lugar (`buildReceivableView`), consumida
  **só pelo Financeiro**; **nunca persistido** (sem migração). Espelho (per-lado/cliente), PDF do contrato
  (só %), timeline e persistência **não** usavam o split. Sem controle de pagamento a corretor (D81).
* **Backend**: `buildReceivableView` — removido o rateio (`baseShare`/`firstShare`); `brokers` vira
  `{brokerId, name}` (sem `share`); sem `brokerCount`. `listBrokerReceivables` — o total do topo
  **colapsou**: ADMIN e COMMERCIAL usam o mesmo `aggregate _sum` sobre o `filterWhere` (já escopado pela
  D135); **helper `_sumOwnBrokerReceivable` da D135 deletado**. Escopo own-only da lista intacto.
* **Frontend**: `FinanceiroCard` mostra só os nomes; `page.tsx` rótulo do COMMERCIAL → "Corretagem dos
  meus fechamentos". Types: `FinanceiroBroker` (sem `share`); `FinanceiroReceivable` sem `brokerCount`.
* **Testes**: unit de `buildReceivableView` reescritos (sem cota; removido o caso do resto D129); testes
  do Financeiro atualizados (o teste D135 "total = cota ÷N" **inverteu** — o total do COMMERCIAL agora = a
  corretagem cheia dos contratos dele).
* Gates verdes: **typecheck / lint / format / build / validate:schemas (51) / test:contracts (20) /
  unit 371 / integração 431**. **Validar no device.** Commit próprio (outro agente em paralelo). _(Plano em
  `~/.claude/plans/memoized-wiggling-quasar.md`.)_

### 2026-07-08 — Sessão 89 (Registro do "Pago" migrado pro Financeiro — D137, revisa D121)

O Flavio pediu pra **mover o botão "Pago"** (registrar contrato pago) do card do contrato em `/contratos`
para a **página do Financeiro** — enxuga os botões do card e o "Pago" fica na página de dinheiro. Análise
2 agentes + plan mode (3 perguntas). Decisões → **D137**: **move só o "Pago"** (o "Faturar" segue no card
do contrato); **acesso igual a hoje** (ADMIN + COMMERCIAL-dono; `paySaleContract` intacto); botão **sempre
visível** no card do Financeiro, só nos itens `FATURADO`.

- **Coerência:** `PAGO` = contrato/negócio pago (o comprador pagou), distinto de "corretagem paga ao
  corretor" (D81, futuro); a página Financeiro deixa de ser só-leitura.
- **Backend:** `paySaleContract` inalterado (gate `SALE_CONTRACT_ACCESS_ROLES` + posse).
  `RECEIVABLE_VIEW_SELECT` + `buildReceivableView` + `FinanceiroReceivable` ganham **`version`** (o pagar
  exige `expectedVersion`).
- **Frontend:** `FinanceiroCard` ganha linha `fin-card-actions` (sempre visível) com o botão "Pago" só em
  `FATURADO` (props `canManage`/`onPagar`); `app/financeiro/page.tsx` reusa o
  **`SaleContractLifecycleDialog`** (ação `pay`), `onDone` faz **patch otimista** do status→`PAGO` (novo
  `patch-status` no reducer; pagar não muda corretagem/total → sem refetch, evita reset da paginação) +
  toast. `SaleContractCard` perde o botão "Pago" + a prop `onPagar`; `/contratos` remove o wiring de `pay`
  (mantém invoice + washout no dialog). Bônus: removido o CSS órfão `.fin-broker-share` (do D136).
- **Testes:** `version` na projeção (unit + integração). Gates verdes: **typecheck / lint / format / build
  / validate:schemas / test:contracts / unit 371 / integração 431**. **Validar no device.** Commit próprio.
  _(Plano em `~/.claude/plans/memoized-wiggling-quasar.md`.)_

### 2026-07-08 — Sessão 90 (Pagamento do contrato → card de Eventos do dashboard — D138, só decisão)

A pedido do Flavio, o **fluxo de pagamento do contrato** passa a **alimentar o card de Eventos** (calendário
do dashboard desktop). **Só decisão/registro — sem código** (implementação = fase F1 do card, sessão
futura). Análise 2 agentes (o card + a plumbing do dashboard) + plan mode (3 perguntas).

- **D138 — pagamento do contrato como evento do dashboard.** Cada contrato vira **1 evento** no dia da sua
  data de pagamento, em **2 sub-tipos**: **agendado** (não pago, `EMITIDO`/`FATURADO`, no `paymentDate`) e
  **realizado** (`PAGO`, no `paidAt`); `WASH_OUT` fora (ao pagar, o agendado vira realizado). **Escopado
  como o Financeiro** (ADMIN todos / COMMERCIAL só os dele via `Broker.userId` / CLASSIFIER-REGISTRATION-
  CADASTRO nenhum). **Sem deep link na v1.** Fonte = endpoint do dashboard **com actor** (molde
  `recent-sends`) consultando `SaleContract` por `paymentDate`/`paidAt` na janela; datas `@db.Date` casam
  com o `toDayKey` sem conversão de fuso; índice novo em `payment_date` na implementação. **Decisões
  detalhadas (E21–E24) no doc canônico do card:** `docs/Eventos-Dashboard-Plano-de-Trabalho.md` (revisa a
  E8 do card — este tipo de evento é escopado por papel).
