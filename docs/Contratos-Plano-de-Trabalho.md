# Contratos — Plano de Trabalho

Status: Em andamento (backlog + decisões + pendências da página `/contratos`)
Escopo: o backlog, as pendências e o **ledger de decisões** da feature de Contratos (hub `/contratos`: contrato/PDF, Espelho de Corretagem, Financeiro, Aprovações, Embarque). O **estado atual** do que existe vive em `Contratos-Visao-Geral.md`; aqui ficam as decisões (o porquê), as pendências abertas e o histórico condensado.
Última revisão: 2026-07-13 (consolidação 4→2 — absorveu Central/Aprovações/Embarque)
Documentos relacionados: `Contratos-Visao-Geral.md` (documento-mãe / estado atual), `Dashboard-Visao-Geral.md`, `API-e-Contratos.md`, `Auditoria-Navegacao-por-Papel.md`

> **Divisão de papéis:** a `Contratos-Visao-Geral.md` é a **verdade viva** (o que existe hoje). Este plano guarda **decisões (por quê), pendências (o que falta) e o backlog**. O histórico completo de sessões (S1–S91 etc.) e a prosa superada foram para o **Git** (docs antigos removidos em 2026-07-13); o ledger no apêndice condensa cada decisão à resolução final.

---

## 1. Estado geral

Contrato à vista + futuro, o hub com 4 sub-abas (Central F1/F2), a reforma de Aprovações ("o portão", AP1–AP30) e o Embarque (EMB1–EMB29) estão **implementados ponta a ponta** — gates verdes (lint/format/typecheck/unit/integração) — em `main`, **não pushados**, **aguardando validação no device**.

> **Split 2026-07-13:** o hub `/contratos` virou **2 páginas** — `/contratos` (Contratos + Financeiro, gestão, ADMIN+COMMERCIAL) e `/embarques` (Embarque + Aprovações, operação, todos os não-PROSPECTOR). Casca atual em `Contratos-Visao-Geral.md` §2; a **P27** (design das páginas) segue aberta.

## 2. Pendências abertas

- **P27 — Layout e design das páginas de Contrato** (Fase G, em andamento): `/contratos` e os modais (Etapa 2, Detalhes, Espelho, ágio) — consistência com o design-system, responsividade e hierarquia. _(É o próximo grande tema de design da página, análogo à reforma do dashboard.)_
- **P28 — Gestão das 3 listas cadastráveis** (Modalidade / Forma de pagamento / Embalagem): renomear / inativar / reordenar (`sortOrder`) — adiada (D95; hoje só existe "+ Adicionar").
- **AP-P2 — Estado "atrasado" na Aprovação**: adiado como feature futura (sem data-limite exata; fácil no Embarque via `invoiceDate`, delicado na Aprovação). Por ora só "pendente".
- **Validação no device:** todo o fluxo acima (à vista/futuro, hub, portão de aprovação, embarque) precisa do ✅ no aparelho.
- **Build:** `next dev` ativo → o build fica para a validação no device.

## 3. Dívidas / fora do escopo desta consolidação

- **`Arquitetura-Tecnica.md`** não documenta o domínio `SaleContract` na seção "Modelo de dados" — dívida pré-existente (o modelo atual está em `Contratos-Visao-Geral.md` §9).

## 4. Consolidação da documentação (2026-07-13)

**4 docs → 2**, espelhando o dashboard (DSB-D1). A `Contratos-Visao-Geral.md` (mãe) absorveu o estado atual; este plano guarda o backlog + o ledger. Removidos (histórico no Git):

- `Central-de-Contratos-Plano-de-Trabalho.md` (casca → mãe §2; ledger **CC** abaixo)
- `Aprovacoes-Plano-de-Trabalho.md` (→ mãe §7; ledger **AP** abaixo)
- `Embarque-Plano-de-Trabalho.md` (→ mãe §8; ledger **EMB** abaixo)

Orla ajustada no mesmo passo: `README.md` (par mãe+plano no índice), `Auditoria-Navegacao-por-Papel.md` (ponteiro), skill `prisma` e os comentários em `app/contratos/page.tsx` / `app/financeiro/page.tsx`.

---

## Apêndice A — Ledger de decisões (condensado)

> Resolução final de cada decisão; as **superadas** apontam para o que as substituiu. O histórico completo (Contexto→Opções→Proposta + sessões) está no Git.

### A.1 Contrato / Financeiro / Espelho (D1–D139)

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
- **D24** — Dados bancários: entidade `Bank` (lookup) + `ClientBankAccount` por cliente; "Banco do Vendedor" = uma conta do vendedor (refinada pela D39).
- **D25** — Snapshots de partes/banco/armazém congelam ao `FATURADO` (editável até `EMITIDO`); ágio/deságio é a única mutação financeira permitida depois.
- **D26** — Armazém = `Client` com `isWarehouse` (sem entidade nova); lookup amplo + auto-promoção (D49).
- **D27** — `ClientAttachment` (N por cliente, PDF+imagens, só arquivamento, independente do contrato).
- **D28** — Conta bancária = banco + agência + conta c/ dígito + titular + CNPJ/CPF do titular + chave PIX (titular pode diferir).
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
- **D39** — `Bank` ganha código COMPE (3 díg.) além de nome + status.
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
- **D59** — CRUD de `Bank`/`Broker`/`ClientBankAccount`/`ClientAttachment` = qualquer autenticado (PROSPECTOR fora).
- **D60** — Bancos/Corretores numa página "Cadastros" com abas; contas/anexos no detalhe do Cliente.
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
- **D105** — Washout ainda paga corretagem: `WASH_OUT` segue no Financeiro e elegível ao Espelho.
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
- **AP20** — Desmarcar (Sim→Não) só em `EMITIDO` e sem envio; após o 1º envio trava em "Sim" (409 `APPROVAL_FLAG_LOCKED`).
- **AP21** — Portão no faturar (pagar herda); portas listam só marcados; elegibilidade de geração = só `EMITIDO` (`APPROVAL_ELIGIBLE_STATUSES = [EMITIDO]`); etiqueta gerada = proxy da amostra enviada.
- **AP22** — (revertida por DSB-D9).
- **AP23** — Toggle rápido Sim/Não no Detalhes do contrato (`setSaleContractApprovalFlag`, ADMIN/COMMERCIAL, travas da AP20, lead default 30).
- **AP24** — A worklist mostra o nº de envios: "enviada" (1×) / "enviada · N×" (>1); sem rotular "provável recusa".
- **AP25** — Sub-aba lista todos os contratos marcados, com filtro por status, abrindo na fila "a enviar".
- **AP26** — Cada linha: status (dot + rótulo, ·N× na enviada), nº do contrato, comprador, data e sacas — só campos não-sensíveis.
- **AP27** — Ações por linha: [Gerar] só em marcado + `EMITIDO`; "Ver contrato" só ADMIN/COMMERCIAL; o toggle AP23 mora no Detalhes.
- **AP28** — Filtro por status (A enviar · Enviadas · Canceladas · Todas, default A enviar), busca por nº/comprador, ordem por faturamento planejado.
- **AP29** — Geração concentrada só na sub-aba: dashboard vira navegação pura (reverte AP7) e /samples perde o leque de aprovação; exceção = recuperação INLINE reativa no portão do faturar (AP18).
- **AP30** — Tab segue CC6/CC15 (todos os não-PROSPECTOR; rótulo de nav por papel; operacional ganha 2 abas Embarque+Aprovações); lista não-escopada (AP10); "Ver contrato" escopado (D110).
- **AP-P1** — Dispensada (AP15): "provável recusa" não vira superfície in-app (rotulação externa/BI); AP24 expõe só o nº de envios neutro.
- **AP-P2** — Estado "atrasado" adiado como feature futura (fácil no embarque via `shipmentDate`; delicado na aprovação por falta de data-limite exata); por ora só "pendente".

### A.4 Embarque (EMB1–EMB29)

- **EMB1** — Embarque é evento NOVO e distinto do faturamento (café carregado no caminhão; mesmo dia por padrão, datas podem divergir).
- **EMB2** — Gate pela MODALIDADE (não pelo tipo): `Disponível` = sem embarque, qualquer outra = com embarque (via flag da modalidade, EMB21).
- **EMB3** — (revisada pela EMB21 — o sinal Sim/Não migrou do contrato pra flag na modalidade).
- **EMB4** — (derrubada pela EMB22 / Modelo X — sem campo de data de embarque própria).
- **EMB5** — (derrubada pela EMB22 / Modelo X — sem data própria pra editar; move-se o faturamento).
- **EMB6** — (superada — o "Embarque finalizado" foi desenhado no Bloco 3 e implementado; ver EMB27).
- **EMB7** — Visibilidade do evento = todos os não-PROSPECTOR, sem escopo por posse (endpoint auth-only).
- **EMB8** — Janela: aparece só no dia previsto (sem fan-out de lembrete), persiste após FATURADO, com reflexo vermelho pós-prazo (EMB24) — ancorada na `invoiceDate`.
- **EMB9** — Status que mostram o evento: EMITIDO + FATURADO (some em PAGO e WASH_OUT).
- **EMB10** — Dot azul `#2563eb` (typeKey `contract_shipment`) para o agendado.
- **EMB11** — (revisada pela EMB26 — dashboard virou navegação pura; rótulo `embarque · nº · comprador` segue como texto do evento).
- **EMB12** — (revisada pela EMB26 — sem acordeão/expandido no dashboard; ação e detalhe migram pra sub-aba).
- **EMB13** — (revisada pela EMB27 — fotos deixaram de ser obrigatórias e viraram opcionais 0–10).
- **EMB14** — (revisada pela EMB27 — mín. 1 → mín. 0; teto 10, JPEG/PNG/WebP, 12 MiB mantidos).
- **EMB15** — (revisada pela EMB27 — `shippedAt` deixou de ser "hoje fixo" e virou seletor: default hoje, máx hoje).
- **EMB16** — Confirmar embarque = todos os não-PROSPECTOR, sem escopo por posse.
- **EMB17** — Realizado no calendário: dot azul-escuro `#1e40af` no dia do `shippedAt` (typeKey `contract_shipment_done`), permanece no histórico.
- **EMB18** — Fotos + data real vistas no Detalhes do contrato, seção "Embarque" read-only (ver ≠ confirmar).
- **EMB19** — Confirmação é TERMINAL: sem undo e sem troca de fotos.
- **EMB20** — A casa do embarque é a sub-aba (worklist `a embarcar`/`atrasado`/`embarcado` + ação de confirmar); dashboard = companheiro; o atraso entra agora.
- **EMB21** — Sinal "terá embarque" = flag na `ContractModality`, herdada por snapshot no contrato (`requiresShipment`); some o Sim/Não do modal; defaults Retirar/Posto = sim, Disponível = não.
- **EMB22** — "Modelo X": não há data de embarque própria — o dia previsto É a `invoiceDate`; atrasado = passou a `invoiceDate` sem embarcar; sobram no contrato só `requiresShipment` + `shippedAt`.
- **EMB23** — Estados derivados (sem enum): a embarcar / atrasado (`hoje > invoiceDate`) / embarcado (`shippedAt`) / cancelado (WASH_OUT); atraso acende no dia seguinte, em EMITIDO+FATURADO.
- **EMB24** — Atraso: fila durável na sub-aba (contador "N atrasados") + reflexo vermelho `#dc2626` no calendário.
- **EMB25** — Linha da fila: chip · nº · comprador · data (prevista=`invoiceDate` / embarcado=`shippedAt`) · sacas · armazém do vendedor; só dado não-sensível; ordem cronológica crescente; filtros + busca.
- **EMB26** — Papéis na sub-aba: [Confirmar embarque] = todos os não-PROSPECTOR, "Ver contrato" = só ADM/COMMERCIAL; dashboard vira navegação pura (toca → sub-aba).
- **EMB27** — Confirmação: fotos OPCIONAIS 0–10 (JPEG/PNG/WebP, 12 MiB) + `shippedAt` por seletor (default hoje, máx hoje, recusa fim de semana → `422 WEEKEND_DATE`); modal terminal com aviso de irreversibilidade.
- **EMB28** — Portão híbrido no PAGO: não paga contrato que exige embarque e ainda não embarcou; modal só com [Confirmar embarque] → confirmado, segue direto pro pagamento.
- **EMB29** — Local do embarque = armazém do vendedor (`sellerWarehouseSnapshot`), sempre.
