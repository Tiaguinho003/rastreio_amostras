# Contratos — Plano de Trabalho

Status: Em andamento (backlog + decisões + pendências da página `/contratos`)
Escopo: o backlog, as pendências e o **ledger de decisões** da feature de Contratos (hub `/contratos`: contrato/PDF, Espelho de Corretagem, Financeiro, Aprovações, Embarque). O **estado atual** do que existe vive em `Contratos-Visao-Geral.md`; aqui ficam as decisões (o porquê), as pendências abertas e o histórico condensado.
Última revisão: 2026-07-14 (D146 — auditoria da cascata contrato-à-vista → lote/venda; fix do 409 de liga no owner-sync)
Documentos relacionados: `Contratos-Visao-Geral.md` (documento-mãe / estado atual), `Dashboard-Visao-Geral.md`, `API-e-Contratos.md`, `Auditoria-Navegacao-por-Papel.md`

> **Divisão de papéis:** a `Contratos-Visao-Geral.md` é a **verdade viva** (o que existe hoje). Este plano guarda **decisões (por quê), pendências (o que falta) e o backlog**. O histórico completo de sessões (S1–S91 etc.) e a prosa superada foram para o **Git** (docs antigos removidos em 2026-07-13); o ledger no apêndice condensa cada decisão à resolução final.

---

## 1. Estado geral

Contrato à vista + futuro, o hub com 4 sub-abas (Central F1/F2), a reforma de Aprovações ("o portão", AP1–AP30) e o Embarque (EMB1–EMB29 + refinamentos de coesão EMB32–EMB34) estão **implementados ponta a ponta** — gates verdes (lint/format/typecheck/unit/integração) — em `main`, **não pushados**, **aguardando validação no device**. A **FASE 2 do Embarque (EMB30/EMB31)** está **decidida mas não implementada** (plan mode + migration próprios).

> **Split 2026-07-13 + ACESSO UNIFICADO 2026-07-15:** o hub `/contratos` virou **2 páginas** — `/contratos` (Contratos + Financeiro, gestão) e `/embarques` (Embarque + Aprovações, operação). Desde 2026-07-15 **ambas abertas a todo não-PROSPECTOR** (`CONTRATOS_ROLES`/`FINANCEIRO_ROLES` = `NON_PROSPECTOR_ROLES`; a gestão era ADMIN+COMMERCIAL). O ledger histórico abaixo (D110/D135/D140, CC6, AP9/AP27, EMB26) descreve os gates **da época** — a fonte do estado atual é `Contratos-Visao-Geral.md` §2. A **P27** (design das páginas) segue aberta.

## 2. Pendências abertas

- **P27 — Layout e design das páginas de Contrato** (Fase G, em andamento): `/contratos` e os modais (Etapa 2, Detalhes, Espelho, ágio) — consistência com o design-system, responsividade e hierarquia. _(É o próximo grande tema de design da página, análogo à reforma do dashboard.)_
- **P28 — Gestão das 3 listas cadastráveis** (Modalidade / Forma de pagamento / Embalagem): renomear / inativar / reordenar (`sortOrder`) — adiada (D95; hoje só existe "+ Adicionar").
- **AP-P2 — Estado "atrasado" na Aprovação**: adiado como feature futura (sem data-limite exata; fácil no Embarque via `invoiceDate`, delicado na Aprovação). Por ora só "pendente".
- **FASE 2 do Embarque (EMB30/EMB31)** — DECIDIDA, não implementada: transporte "Pela empresa | Por terceiros" + responsável obrigatório (EMB30) e retenção de fotos por 15 dias (EMB31). **Plan mode + migration próprios**; as 4 afinações da auditoria (2 leituras de foto, purga linha→arquivo, carrier nullable+serviço, throttle novo/best-effort) estão em A.4.
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
- **D12** — Comprador (comprador da venda) e Vendedor (dono do lote) pré-preenchidos, editáveis, com snapshot.
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
- **D43** — Campos por etapa: etapa 1 (Venda) = comprador/data/sacas/preço/corretagens %/corretores; etapa 2 (Geração) = lote/vendedor/filiais/banco/armazéns/nº-compra/pagamento/textos/datas.
- **D44** — Corretagem do vendedor e do comprador, separadas, entrada só em %; N corretores.
- **D45** — `WASH_OUT` = status de quebra (com `washoutReason`/`washoutAt`, D58).
- **D46** — (superada por D96/D97 — criação atômica nasce `EMITIDO`, sem `CONFERIR`).
- **D47** — (superada por D96).
- **D48** — Editar o vendedor no contrato (até `EMITIDO`) sincroniza o `Sample.ownerClientId`.
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
- **D69** — Criação à vista em 1 modal só (modo `spotCreate`: sacas ≤ disponível, liga 100%, vendedor = dono do lote) — fim do wizard.
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
- **D120** — Modal de Detalhes: molde do modal de emissão, seções read-only 2-col, header nº+selo+tipo, Histórico em largura total; COMMERCIAL vê tudo nos dele (D86 vale só no Financeiro).
- **D121** — Card ENXUTO (avançar status + Aprovação + Detalhes); Editar/Ágio/Deságio/Washout/Visualizar migram pro modal (revisa D87).
- **D122** — "Desfazer" removido do sistema (backend + UI); ciclo só pra frente, engano só se corrige por Washout.
- **D123** — Marcos Faturar/Pagar/Washout gravam ator+quando em `SaleContractStatusLog` (marcos antigos só com data).
- **D124** — Geração do Espelho auditada em `SaleContractEspelhoLog` (contrato+side+ator+quando); resolve D71 (download do PDF segue sem rastro).
- **D125** — Timeline v1 agrega criação/edições + ágio + aprovações + marcos + espelho, ordem desc, "há X tempo + quem + o quê" (endpoint agregador novo).
- **D126** — O PDF do contrato entra embutido no modal de Detalhes (coluna esquerda desktop / 1ª seção mobile, Exportar/Baixar na seção); "Visualizar" sai do rodapé.
- **D127** — A auditoria do Espelho registra só a EXPORTAÇÃO (Exportar/Baixar); a prévia (`?preview=1`) não loga; label "Espelho exportado".
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
- **AP-P3 (PENDENTE, 2026-07-16)** — **Unificar os dois lot-splitters** (revisão específica futura, pedido do Flavio; achado 🟢 da AP-higiene). Dois helpers quebram uma string de lotes com **separadores diferentes**: `normalizeCustomLabelLines` (`backend-api.js`, `split(/[,\n]+/)` — vírgula/newline) e `splitOriginLotForLabel` (`sale-contract-support.js`, `split(/[-\s,;]+/)` — traço/espaço/vírgula/;). Um valor como `12-34 56;78` vira 4 lotes num caminho e 1 no outro. **Latente** hoje (alimentam superfícies distintas — o custom-lines do modal vs a quebra do Lote de origem do prefill — sem colisão real). **Decidir:** unificar num separador canônico OU documentar por que diferem de propósito. (A "válvula de escape" — desmarcar antes do 1º envio — NÃO é pendente: foi **descartada** na AP32 a favor da mão única pura.)
- **AP31 (2026-07-15)** — **Aviso de "aprovação a enviar" (re-liga o `approvalReminderLeadDays`).** O lead-time, retido **sem consumidor** desde a remoção do lembrete de calendário (DSB-D9), volta a ter uso: alimenta a janela de um **aviso** no novo **card de Avisos** do dashboard (**DSB-D19**, `Dashboard-Plano-de-Trabalho.md`). **Regra (binária, não fan-out):** o aviso existe enquanto `requires_approval=true AND status='EMITIDO' AND NOT EXISTS(approval_label_log) AND (invoice_date IS NULL OR invoice_date <= hoje_BRT + COALESCE(approval_reminder_lead_days,0) dias)` — reusa o predicado da worklist **G0** + o índice `idx_sale_contract_requires_approval_status_invoice` (ambos já existem → **sem migration**). **Some** quando a etiqueta é gerada (≥1 no `approval_label_log`) — e naturalmente já sai se o contrato deixa EMITIDO (faturado/washout). **"À definir" (D144): SEMPRE avisa** (sem prazo) — um contrato marcado + sem etiqueta + sem data é, se qualquer coisa, **mais** urgente; coerente com a worklist G0 (que já lista os sem data, `NULLS LAST`). O feed antigo os **escondia** (`invoiceDate: { not: null }`); aqui o predicado inclui `invoice_date IS NULL`. **Escopo aberto**, todos os não-PROSPECTOR (= worklist, AP10). Colapsa o _fan-out_ impreciso que motivou o DSB-D9 (o mesmo contrato borrado por N dias do calendário) num **flag binário** (pendente → some). O texto de urgência ("vence esta semana/este mês/em N dias", "sem data" p/ À definir) e a apresentação vivem na DSB-D19.
- **AP32 (2026-07-16)** — **Aprovação vira latch de mão única + botão "Solicitar aprovação" (reforma AP20/AP23; fecha o furo do "Editar").** `requiresApproval` passa a ser **irreversível** uma vez "Sim": Não→Sim é permitido, Sim→Não **nunca** — nem antes do 1º envio (endurece a AP20, que só travava após o envio). **Motivo:** o "Editar" (`emitSaleContract` → `_resolveEmitData`) regravava o sinal do payload **sem** a trava do toggle, e como o portão do faturar é `if (requiresApproval)` (AP18), dava pra desmarcar em `EMITIDO` e **zerar o portão** (achado 🔴; sem teste). Em vez de duplicar a trava, o modelo colapsa: (a) o **`emitSaleContract` deixa de tocar** `requiresApproval` (preserva o do banco — as 3 rotas compartilham `_resolveEmitData`, mas só o emit strippa; criar-à-vista/futuro seguem gravando, **Shape B**); (b) o marcar-depois deixa de ser via Editar e vira um **botão "Solicitar aprovação"** no Detalhes (só quando "Não" + `EMITIDO` + gerencia), com **confirmação** (é definitivo); (c) o `setSaleContractApprovalFlag` vira **latch-only** — rejeita `false` incondicional (409 `APPROVAL_FLAG_LOCKED`), idempotente em já-"Sim" (**não re-seta o lead**), Não→Sim grava `true` + `approvalReminderLeadDays=30`. **Criação mantém a escolha Sim/Não** (Shape B; "Sim" já nasce travado). O **lead** segue editável pela etapa 2 quando "Sim" (não é portão, só a janela do card de Avisos, AP31); o latch nunca mais o apaga — **colateral 🟢:** o reset do toggle a cada uso (que virou efeito real após a AP31) deixa de existir. No **Editar** a aprovação vira **read-only**. Congelamento por status da AP20 (só `EMITIDO`, `APPROVAL_FLAG_NOT_EDITABLE`) mantido. **Sem migration** (regra/gate; contratos já-"Sim" seguem "Sim"). A "válvula de escape" (permitir desmarcar antes do 1º envio) foi **descartada** a favor da mão única pura (pedido do Flavio).
- **AP33 (2026-07-16)** — **Worklist de Aprovações alinha o "cancelado" ao Financeiro (`type='FUTURO'`).** O bucket G2 (`WASH_OUT`) do `listApprovalContracts` filtrava só por `status` (sem `type`), então um **à vista** cancelado por washout **aparecia** na worklist como "cancelado" — mas o Financeiro o **esconde** (D145: à vista washout não paga corretagem, sai por `WASHOUT_BILLABLE={status:'WASH_OUT',type:'FUTURO'}`). As duas abas discordavam do que é "cancelado" (achado 🟡). **Fix:** a G2 passa a filtrar `AND type='FUTURO'` (espelha `isSpotWashout`/`WASHOUT_BILLABLE`), fechando o princípio do D147 ("o washout ramifica por type, alinhado ao Financeiro/Espelho") — que não havia alcançado a worklist. À vista washout segue visível só em `/contratos` (status Wash-out). **Sem migration.**
- **AP-higiene (2026-07-16, pós-AP29):** removidos comentários stale (porta /samples / "avulsa" em `ApprovalLabelModal`, `normalizeCustomLabelLines`, `buildApprovalPrefill`), o **picker dormente** `/approval-labels/contracts` (rota+handler `listApprovalContractOptions`+tipo `ApprovalContractOption`+mapper, sem caller — o sub-route `.../prefill` fica) e o **branch "Voltar" morto** do `ApprovalLabelModal` (2 callers passavam `null`). Os **dois lot-splitters** com separadores diferentes (`,\n` vs `-\s,;`) ficam para revisão específica futura (**AP-P3**, fora desta leva).

### A.4 Embarque (EMB1–EMB34; EMB30/EMB31 = FASE 2 decidida, não implementada)

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
- **EMB30 (FASE 2 — DECIDIDA, não implementada, 2026-07-16)** — **Transporte "Pela empresa | Por terceiros"** na confirmação (obrigatório, sem default). Enum `ShipmentCarrier {COMPANY, THIRD_PARTY}` no `SaleContract`; "Pela empresa" → **responsável obrigatório** (`shipmentResponsibleUserId` FK + `shipmentResponsibleName` snapshot, molde `brokerNameSnapshot`); "Por terceiros" → nada extra. Gravado na MESMA `updateMany` do `confirmShipment` (sem bumpar version, EMB22); presença exigida no serviço (**422 `SHIPMENT_RESPONSIBLE_INVALID`** iff `COMPANY`). `shipmentCarrier` **nullable** (null = não embarcado, molde `shippedAt`) — **não** `NOT NULL DEFAULT` (legado/não-embarcado não ganham carrier fabricado). CHECK de banco **opcional** (o 422 é a trava; se houver, precisa do disjunto `carrier IS NULL`). **Migration nova.**
- **EMB31 (FASE 2 — DECIDIDA, não implementada, 2026-07-16)** — **Fotos do embarque expiram em 15 dias.** Retenção = filtro `created_at >= cutoff` em **AS DUAS** leituras (`listShipmentPhotos` **E** `getShipmentPhotoDescriptor` — senão a foto some da galeria mas a **URL direta ainda serve os bytes**; retenção só na lista = cosmética) + **purga oportunista** com throttle de 1h. ⚠️ O throttle é **código NOVO**: o precedente `expireStalePrintJobs` **não tem** throttle (roda a cada chamada, sem I/O de arquivo) e no Cloud Run o estado é **per-instância best-effort** (perde no cold start; baixa-carga deixa >15d no disco até uma request re-armar — delete idempotente, benigno). Ordem da purga: **linha→arquivo** (não arquivo→linha) — alinha ao invariante do repo "órfão de arquivo é tolerado, órfão de linha não" (o `confirmShipment` já tolera órfão de arquivo). Aviso "fotos ficam 15 dias" no modal + Detalhes. Índice `(sale_contract_id, created_at)` já existe.
- **EMB32 (2026-07-16)** — **`requiresShipment` vira snapshot congelado no Editar (gêmeo do AP32).** O `emitSaleContract` re-derivava `requiresShipment` da modalidade a cada Editar; se alguém baixasse a flag "embarca?" da `ContractModality`, um Editar de campo qualquer **re-snapshotava** e o contrato **perdia o embarque em silêncio** (sumia da worklist, parava de travar o pagamento — achado 🟡, gêmeo do furo AP20). **Fix:** o Editar só re-deriva se a **modalidade do contrato mudar ali** E o embarque ainda não foi confirmado (`if (data.modalityId === contract.modalityId || contract.shippedAt) delete data.requiresShipment`). Fecha junto a **corrida confirm+edit**: quando o Editar baixa `requiresShipment`, a trava por version não enxerga um confirm concorrente (`confirmShipment` não bumpa version), então o `where` do update exige `shippedAt:null` nesse caso → um confirm que escapou força um 409 retryável. **Sem migration.**
- **EMB33 (2026-07-16)** — **Portão EMB28: arestas aparadas.** Mantém o fluxo reativo (clica Pagar → 422 `CONTRACT_SHIPMENT_REQUIRED` → modal de embarque), mas: (a) toast **"Embarque confirmado"** no hand-off (o embarque é irreversível e antes seguia em silêncio pro pagamento — só "Pagamento registrado"); (b) o diálogo de pagamento **sai de cena** enquanto o modal do portão está aberto (`!needsShipment && !needsApproval`) — elimina o **backdrop duplo** (vale também pro portão de aprovação AP18). **Só frontend.**
- **EMB34 (2026-07-16)** — **Guards do modal de confirmação + data em BRT.** (a) `shippedAt` usa **hoje-BRT** (`todayInputValueBRT`; era hora do device → off-by-one perto da meia-noite, divergindo do guard do backend); (b) o seletor **nasce no último dia útil ≤ hoje** (`lastBusinessDayIso`) — abrir num fim de semana não vira beco (o fds **segue bloqueado**, EMB27, por decisão do Flavio); (c) foto **> 12 MiB recusada no cliente** e seleção **> 10 avisa** (não trunca em silêncio). Helpers novos em `lib/business-days.ts` (reusados pelo `SaleContractLifecycleDialog`). **Só frontend.**
