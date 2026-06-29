# Fechamento — Plano de Trabalho

**Status**: **EM CONSTRUÇÃO** — iniciado em 2026-06-24. **Mercado à vista + Futuro ✅ funcionais ponta a ponta** (Fases 0/A/B/C/D). **Decisões D1–D69** travadas ao longo das sessões 1–60. **Gestão de Contratos = ADMIN-only** (desde 2026-06-28). O alvo é **recriar no app o "Contrato de Compra e Venda de Café"** do sistema legado (print na Sessão 2). O Fechamento puxa **extensões no cadastro de Cliente**: **bancário** (`Bank`+`ClientBankAccount`, pré-requisito) e **anexos** (`ClientAttachment`, independente) exigem tabelas novas; **armazém já existe** (`isWarehouse`). **Fase 0 (cadastro) COMPLETA.** **Todas as pendências catalogadas resolvidas** (resta só P2, decidido campo a campo na implementação) + a entrada do **CNPJ**. Sessão 26 definiu a **arquitetura de Contratos**: página **"Contratos"** (lista + cria), **3 tipos** (Mercado à vista / Futuro / CPR; só à vista e Futuro geram o Fechamento, CPR não) e **fluxo em 2 etapas** (venda parcial no lote → completar na página) — **D41–D45** (revisam D4/D9/D11/D14/D19/D22; substituem D37). Sessão 27 detalhou o **fluxo de emissão** (card → "Gerar documento" → modal → "Emitir" → status `CONFERIR`) — **D46** (+ `CONFERIR` na D14). Estruturas de dados do cadastro já definidas (D38–D40). Sessão 28 fechou o **pós-`CONFERIR`** — **D47**. Sessões 29–35 **concluíram a conferência campo a campo do fluxo de Mercado à vista** (Etapa 1 ✅ + Etapa 2 ✅; S35: filiais c/ cadastro rápido, Embalagem=Sacaria, textos = Observações + Descrição). Pendentes de propósito: editar etapa 1 (P20), botões ágio/deságio (P21), exibição do total (P22). Sessão 36 readicionou **Mês/Ano**. Sessão 37: **CPR removido**; entradas pela página via lápis (**D50**). Sessão 38: **Futuro conferido** (idêntico ao à vista, exceto vendedor manual / sacas livres / sem lote). **Conferência campo a campo de AMBOS os tipos concluída.** Sessão 39: **rascunho das tabelas** desenhado (Grupos A/B/C + enums, **D51–D58**; P16 resolvida; D33 revisada) — ver seção "Rascunho das tabelas". **Sessão 40**: **implementação da Fase 0 iniciada** — schema + migration aditiva (`Bank`, `Broker`, `ClientBankAccount`, `ClientAttachment`, `Client.birthDate`, enum `LookupStatus`) + **backend `Bank`+`Broker`** commitados; acesso liberado a qualquer usuário logado (**D59**), telas em página "Cadastros" com abas (**D60**). **Sessão 41**: backend `ClientBankAccount` (`c695a69`) + `ClientAttachment` + upload de PDF (`49ce3cf`) — **backend da Fase 0 COMPLETO** (smoke real verde). **Sessões 42–43**: frontend da Fase 0 entregue — contas/anexos no detalhe do cliente + página **"Cadastros"** (Bancos/Corretores). **Fase 0 (cadastro) COMPLETA** (backend + frontend). **Sessões 44–48**: **Fase B (contrato Mercado à vista) + Fase C (PDF) IMPLEMENTADAS** — B.1 (schema + 3 listas), B.2 Passo 1 (a venda à vista cria o contrato `EM_ABERTO`), B.2 Passo 2 (etapa 2 + máquina de status `emit`/`confirm` + `WASH_OUT`), B.3 (página "Contratos") e Fase C (PDF on-demand, `pdf-lib`). **Mercado à vista FUNCIONAL ponta a ponta** (venda → contrato → etapa 2 → emitir → confirmar → baixar PDF). **Tudo em `main`, NÃO pushado.** **Sessões 49–52 (refinos pós-implementação)**: **S49** `FATURADO`/`PAGO` vivos (ações `Faturar`/`Pagar`/`Desfazer` no card, com **pular** + **data real** `invoicedAt`/`paidAt`; migration `20260628120000_fechamento_faturado_pago`); **S50** **quebra manual `WASH_OUT`** (botão "Quebrar" de CONFERIR/CONFIRMADO/FATURADO/PAGO, **cancela a venda** + motivo obrigatório, definitiva — **resolve P17**; washout passou a cobrir FATURADO/PAGO); **S51** **conteúdo do PDF** ("Tipo" removido; partes/armazéns = Nome/CNPJ/IE/Endereço/Bairro/Cidade-UF/Número/CEP, consolidado da fazenda em PF, **sem "Filial"**; **campo sempre presente** mesmo vazio); **S52** **layout do PDF em 1 PÁGINA** (título no corpo, linha de identificação horizontal, partes/armazéns em **cards 2-col**, blocos de baixo compactados; título/número saíram do header verde; **script `scripts/preview-contract.mjs`** + guard de página única). **Sessão 53 (2026-06-28)**: **revisão campo a campo + refino da Etapa 1 (registro da venda)** — comprador (filtro confirmado, **força cadastro correto** + **cadastro inline**, **lookup sem limite**), **máscara de moeda** no Preço/Ágio + parser BR (`lib/currency.ts`), **corretagens começam vazias**, **cadastro inline de corretor**, e **layout 50/50** (Data sob o comprador; Sacas+Preço; corretagens). **Etapa 1 (registro da venda) CONFERIDA ✅.** **Sessão 54 (2026-06-28)**: **1ª parte da Etapa 2** (modal "Gerar documento", até `CONFERIR`) — **layout 50/50**, **cadastro inline** de vendedor/armazéns e **erros por campo** (frontend, `SaleContractEtapa2Modal`) + faxina de CSS órfão. **Etapa 2 (1ª parte) implementada ✅.** **Onde paramos / Falta**: validar no device; **CNPJ real** do emissor (env `CONTRACT_ISSUER_CNPJ`) · **assinatura do dono** como imagem (D35) · **header verde** (redesign) · **fidelidade ao print legado** · **ágio/deságio+total impressos** (P21/P22) · **editar etapa 1** (P20) · contrato **Futuro** (D50 — sem backend) · **gestão/CRUD das 3 listas** · ajustes da parte 1 da Fase 0 (contas/anexos). **Sessão 55**: venda à vista **consolidada na página "Contratos"** (fluxo de criação pela página: FAB → seleção de lote → venda → encadeia a Etapa 2) e **removida do detalhe do lote** (que virou histórico só-leitura), com **"Cancelar"** novo no contrato `EM_ABERTO` — **D61**. **Sessão 56**: criação à vista virou **wizard de 2 passos** (commit adiado; "Voltar"; preview do nº) — **D62**. **Sessão 57**: **fase pós-emissão** — **PDF sem status** (D63), modal **"Visualizar"** (Exportar/Baixar, D64), **ações do card** por status + "Quebrar"→"Washout" (D65), **"Editar" edita a fase 1** sincronizando a venda via `SALE_UPDATED` (**resolve P20**, D66). **Sessão 58**: **contrato Futuro** implementado — **1 modal único** sem lote (`createFutureSaleContract` + `emitSaleContract`; **D67**) + **washout/cancelar sem-lote** e "Quebrar"→"Washout" (**D68**). **Sessão 59**: a criação **à vista também virou 1 modal só** (fim do wizard de 2 passos; modo `spotCreate` do Etapa2Modal, com sacas≤disp./liga 100%/dono da liga; **supersede D62**) — **D69**. **Sessão 60**: **PDF redesenhado** no padrão do contrato legado SAFRAS (cabeçalho branco + logo colorido + emissor à direita; faixa-título cinza; 5 caixas pagamento/logística; Quantidades&Valores com corretagem %; Banco; Observação/Descrição com rótulo vertical; assinaturas Comprador|Corretor; **partes mantidas em 2-col**; **sem cláusula**; emissor real). Ver "Status da implementação" + logs das Sessões 44–60.
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

| #   | Decisão                                                  | Detalhe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Natureza **híbrida**                                     | Contrato de Fechamento: dados estruturados + **2 blocos de texto livre** + **assinaturas**. Sem cláusulas jurídicas fixas (ver D30).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D2  | Destinatários                                            | Confirmação ao **comprador** e ao **vendedor**, com valor de **contrato formal** entre as partes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D3  | Granularidade **por venda**                              | Cada venda (movimento `SALE`) gera um Fechamento, chaveado pelo `movementId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D4  | Financeiro **na venda (obrigatório)**                    | Os dados passam a ser capturados no modal de Venda; o núcleo financeiro é exigido. Demais campos: obrigatoriedade caso a caso. **Revisado pela D43** (núcleo financeiro = etapa 1 da venda).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D5  | Emissor com **dados fixos**                              | Cabeçalho com nome/CNPJ/logo da empresa/corretora, fixos (não escolhidos por venda).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D6  | PDF via **`pdf-lib`**                                    | Clonando o pipeline do laudo (`sample-pdf-report-service.js`); **sem dependência nova**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D7  | Construção **campo a campo**                             | Os campos são detalhados e implementados um a um; este doc é o backlog vivo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D8  | **Replicar o contrato legado por inteiro**               | O v1 espelha o "Contrato de Compra e Venda de Café".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D9  | **Campos no modal de Venda**                             | O `SampleMovementModal.tsx` vira o formulário do contrato (mantém D4). UI com seções/abas dado o volume. **Revisado pela D41** (2 etapas: etapa 1 no modal da venda, etapa 2 na página de Contratos).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D10 | **Qualidade do café NÃO entra**                          | Documento puramente comercial; classificação fica só no laudo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D11 | **Persistência: tabela `SaleContract`**                  | Tabela dedicada 1:1 com o movimento `SALE` (FK `movementId`), colunas tipadas, escrita pelo projetor. **Por ora só Mercado à vista** (sempre com lote/movimento). **Futuro** (sem lote, D42) precisará persistir **sem movimento** — modelagem a definir no rascunho (P16). **Resolvido pela D51** (Futuro 100% no `SaleContract`; `movementId` 1:1 no à vista).                                                                                                                                                                                                                                                                                                                                           |
| D12 | **Comprador/Vendedor automáticos**                       | Comprador = comprador da venda; Vendedor = dono do lote (`ownerClient`). Pré-preenchidos, **editáveis**, com snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D13 | **Corretor = usuário `COMMERCIAL`**                      | Um usuário (papel `COMMERCIAL`) é o corretor responsável, figura e assina. Snapshot do nome. **Revisado pela D34**: N corretores por contrato, vínculo a `User` opcional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D14 | **Status do Contrato (manual)**                          | Enum editável: `EM_ABERTO → CONFERIR → CONFIRMADO → FATURADO → PAGO` (default `EM_ABERTO`). Cancelamento via cancelar a venda. **Revisado pela D41/D45/D46**: `EM_ABERTO` = venda parcial; ao **Emitir** (etapa 2) → `CONFERIR` (documento gerado p/ conferência); demais status mantidos; +`WASH_OUT` (quebra). **Implementado (S49)**: `Faturar` (`CONFIRMADO→FATURADO`) e `Pagar` (`CONFIRMADO`/`FATURADO→PAGO`, **pode pular**) gravam a **data real** (`invoicedAt`/`paidAt`); `Desfazer` volta um passo (limpa a data). Ações no card via diálogo.                                                                                                                                                   |
| D15 | **Número do Contrato automático**                        | Sequencial **contínuo** + `/AA` do ano (ex.: `3295/26`), **não editável**. Gerador novo (padrão do `internalLotNumber`). **Atribuído na etapa 1** (ao registrar a venda, junto do `EM_ABERTO`); cancelar a venda pode deixar **gap** (D46).                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D16 | **"Número de Compra" = campo livre**                     | Texto/número manual; **sem vínculo** a outra entidade.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D17 | **Quantidade = sacas da venda (inteira)**                | Reusa o `quantitySacks`; sem campo novo. **Peso (Kg)** é campo decimal **separado**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D18 | **Valor total automático**                               | `preço/saca × sacas`, ajustado por ágio/deságio (ágio soma, deságio subtrai). _Base exata a confirmar na Fase B._ **Revisado (Sessão 32)**: ágio/deságio **não é campo do formulário** — vira **botões no card** (a detalhar — P21); o total é **calculado e salvo**, não exibido (local a decidir — P22). _(Ágio/deságio em R$ por saca: ver D54.)_                                                                                                                                                                                                                                                                                                                                                       |
| D19 | **Corretagem calculada**                                 | Vendedor e comprador, cada um em **% ou R$**; quando %, calcula o R$ sobre o total. Guarda tipo + valor + R$. **Revisado pela D44**: entrada **só em %**, vendedor e comprador **separados** (sem R$ na entrada).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D20 | **Listas (B8)**                                          | **Forma de Pagamento {Faturado, Livre}** · **Modalidade {Retirar, Posto, Disponível}** · **Embalagem {Sacaria, Bags, A granel}** (valores no B8; **cadastráveis pelo admin**, iniciam com esses valores). **Condição de Pagamento = texto livre** (não é lista). _(Banco → entidade própria, D24.)_                                                                                                                                                                                                                                                                                                                                                                                                        |
| D21 | **Só vendas novas**                                      | Fechamento/`SaleContract` só para vendas a partir da feature; antigas ficam **sem contrato** (sem backfill).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D22 | **Geração automática ao salvar**                         | Confirmar a venda já gera/abre o PDF do Fechamento. Re-geração depende de P10. **Revisado pela D41/D46**: o PDF sai ao **Emitir** na página de Contratos (não ao salvar a venda) → status `CONFERIR`; **geração única/regenerável** (sem documento de teste separado, D32).                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D23 | **Permissão ampla**                                      | Pode gerar o Fechamento **quem tem acesso à venda**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D24 | **Dados bancários do cliente**                           | `Bank` (lookup leve cadastrável: `id` Int, nome, status ativo/inativo) + `ClientBankAccount` por cliente, no padrão `ClientUnit`. "Banco do Vendedor" = uma conta do vendedor. **Revisado pela D39** (código do banco).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D25 | **Snapshot de dados de cliente**                         | No fechamento, comprador, vendedor, corretor, **conta bancária** e **armazéns** são **congelados**; mudanças no cadastro não alteram contratos já emitidos. **Congela ao `CONFIRMADO`** (D47): até lá os dados do contrato são editáveis (Editar) e o snapshot reflete a última edição.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D26 | **Armazém = `Client` com `isWarehouse`**                 | Modelo **já existe** (flags multi-escolha + lookup `kind='warehouse'`). "Armazém do Comprador/Vendedor" = cliente-armazém (livre) → snapshot. **Sem entidade nova.** **Revisado pela D49**: lookup amplo (todos os clientes) + auto-promoção a armazém.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D27 | **Anexos do cliente**                                    | `ClientAttachment` (1 cliente → N arquivos, lista livre + descrição), reusa `local-upload-service` + `UPLOADS_DIR`. **PDF + imagens** → +`application/pdf` no allowlist + atualizar CLAUDE.md#5/SECURITY. **Só arquivamento; independente do contrato.**                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D28 | **Campos da conta bancária**                             | `ClientBankAccount` = banco (FK `Bank`) + **agência** + **conta (com dígito)** + **titular (nome)** + **CNPJ/CPF do titular** + **chave PIX**. Titular pode diferir do cliente. _(Sem tipo corrente/poupança.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D29 | **Emissor fixo em config**                               | Promover `COMPANY_INFO` a módulo compartilhado + **CNPJ** (a fornecer). Sem tela editável (muda com deploy).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D30 | **2 blocos de texto livre, sem cláusulas fixas**         | Contrato tem **2 blocos de texto livre** (opcionais, sem limite): **Observações** e **Descrição**; **não há** boilerplate jurídico fixo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D31 | **Linhas de assinatura do corretor**                     | ~~Campo `corretorSignatureLines` (0–4).~~ **Substituído pela D35**: assinatura do corretor = imagem fixa do dono da empresa (sempre 1, automática).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D32 | **Entrega: baixar/compartilhar**                         | PDF gerado e oferecido via `shareOrDownloadFile` (download/Web Share); **sem persistir bytes**. Regenerável da `SaleContract` (D11/D25) quando preciso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D33 | **Auditoria: `FECHAMENTO_EXPORTED`**                     | Novo tipo de evento no event store da amostra (`SampleEventType` + payload schema) registra cada geração do Fechamento. _(Append-only: migration + bump.)_ **Revisado pela D56**: auditoria vai em **tabela própria** (`SaleContractExport`), não no event store da amostra (cobre o Futuro, que não tem `Sample`).                                                                                                                                                                                                                                                                                                                                                                                        |
| D34 | **Corretores: N por contrato**                           | Cadastro **`Broker`** (id, nome, `userId` FK **anulável** [métrica], status ativo/inativo) para TODOS os corretores. Contrato → `SaleContractBroker` (brokerId + nome snapshot), N por contrato. Métrica por `brokerId` (todos os corretores); métrica de usuário via `Broker.userId`. Não-usuário = `Broker` com `userId` nulo — **reutilizável + com métrica**. _(Revisa D13. Rateio da corretagem: adiado.)_                                                                                                                                                                                                                                                                                            |
| D35 | **Assinaturas (layout fixo)**                            | Corretor/empresa = **imagem da assinatura do dono** (asset fixo do emissor — D29), impressa automaticamente. Comprador e vendedor = **linhas em branco** (assinadas à mão). _(Substitui o `corretorSignatureLines` da D31.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D36 | **Data de nascimento (PF)**                              | Coluna `Client.birthDate` (data), preenchível **só quando `personType = PF`**, **opcional**. **Só cadastro** — não entra no Fechamento. Sem tabela nova.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D37 | **Campo `Tipo` (da operação)**                           | Campo **obrigatório**, **sem default** (força escolha), lista **cadastrável** pelo admin (inicia com **Futuro · Mercado à vista · Wash-out**). Distinto da Modalidade (B8). **Substituída pela D42**: vira o **tipo de contrato** fixo (à vista/Futuro); **Wash-out** passa a status (D45).                                                                                                                                                                                                                                                                                                                                                                                                                |
| D38 | **Lote liga só ao `Client`; filial na venda**            | Ao registrar, o lote vincula só o `Client` (sem filial — `Sample.ownerUnitId` nulificado). A **filial** do cliente **PF** (cujo endereço/IE moram na `ClientUnit`) — **do vendedor e do comprador** — é **escolhida na etapa 2** (modal de geração, não na venda) e congelada no snapshot (D25).                                                                                                                                                                                                                                                                                                                                                                                                           |
| D39 | **Código do banco no `Bank`**                            | Entidade `Bank` ganha **código COMPE** (3 dígitos; ex.: 001 BB, 341 Itaú, 237 Bradesco) além de nome + status. Padroniza o cadastro e permite autocompletar de lista oficial. Complementa a D24.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D40 | **Dados do corretor não-usuário**                        | Corretor **não-usuário** (`Broker`, `userId` nulo) guarda **CPF** + **telefone/e-mail** além de nome + status (identifica unicamente + contato/base de pagamento). Para corretor-usuário esses campos são opcionais (pode herdar do `User`). Complementa a D34.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D41 | **Página "Contratos" + fluxo em 2 etapas**               | Nova página **"Contratos"** lista e cria contratos. Mercado à vista: a **venda** (página do lote) cria um `SaleContract` **`EM_ABERTO` parcial**; o usuário **completa na página de Contratos** e só então o **PDF é gerado**. Separa quem registra a venda de quem fecha o contrato. _(Revisa D9 e D22.)_                                                                                                                                                                                                                                                                                                                                                                                                 |
| D42 | **Tipos de contrato (enum fixo) + nomes**                | **Mercado à vista / Futuro** (CPR removido na S37), enum **fixo**. **Ambos geram o Fechamento (PDF).** **À vista** = sempre vinculado a um **lote**; **Futuro** = sempre **sem lote** (café ainda não existe), criado direto na página. **"Contratos"** = página/guarda-chuva; **"Fechamento"** = o documento gerado. _(Substitui D37; entradas/UI na D50.)_                                                                                                                                                                                                                                                                                                                                               |
| D43 | **Campos por etapa (venda × contrato)**                  | **Etapa 1 (venda, no lote):** comprador · data · sacas · preço/saca · corretagens (%) + corretores. **Etapa 2 (página Contratos):** nº do lote · vendedor · **filiais do vendedor e do comprador se PF** (D38) · banco do vendedor · armazéns (comprador/vendedor) · nº de compra · pagamento/logística · textos livres · datas faturamento/pagamento. _(Revisa D4.)_                                                                                                                                                                                                                                                                                                                                      |
| D44 | **Corretagem: 2 lados, só %, N corretores**              | Corretagem do **vendedor e do comprador**, **separadas**, capturadas **só em %** (não mais "% ou R$"). **N corretores** por contrato (D34). _(Revisa D19; resolve a pendência do B6/B7.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D45 | **`WASH_OUT` = status (quebra)**                         | Novo status **`WASH_OUT`** (quebra de contrato) somado ao enum da D14. _(Acionamento, terminalidade e relação com "cancelar a venda" — a definir.)_ _(Revisa D14.)_ **Refinado pela D58**: guarda `washoutReason` + `washoutAt`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D46 | **Emissão na página de Contratos**                       | Cada contrato é um **card**: **"Gerar documento"** abre o modal da etapa 2 (D43); **"Emitir"** gera o **PDF** e leva o status a **`CONFERIR`** (D14). **Geração única/regenerável** (D32) — conferência é só etapa de status. Número `NNNN/AA` nasce na **etapa 1** (venda); cancelar pode deixar **gap** (D15). _(Refina D41/D22.)_                                                                                                                                                                                                                                                                                                                                                                       |
| D47 | **Pós-`CONFERIR`: Revisar/Confirmar**                    | No card em `CONFERIR`: **"Revisar"** abre o modal → **"Confirmar"** leva a `CONFIRMADO` **sem novo PDF**; **"Editar"** abre os campos das **etapas 1 e 2** → **"Emitir"** regenera o PDF e mantém `CONFERIR`. Fica em `CONFERIR` até confirmar; ao `CONFIRMADO` os dados **congelam** (D25). _(Resolve P19; refina D46.)_                                                                                                                                                                                                                                                                                                                                                                                  |
| D48 | **Editar o vendedor sincroniza o lote**                  | Editar o vendedor no contrato (enquanto editável, até `CONFIRMADO`) **atualiza o `Sample.ownerClientId`** (sincronização contrato→amostra), em qualquer edição — inclusive após gerar o documento de conferência (→ regenerar, D47). Vale para o **vendedor** (dono do lote, mutável); o **comprador** é da venda (append-only) → P20.                                                                                                                                                                                                                                                                                                                                                                     |
| D49 | **Armazém: lookup amplo + auto-promoção**                | Os campos de **armazém (comprador e vendedor)** buscam em **todos os clientes** (não só `isWarehouse`); selecionar um cliente que não é armazém **liga `isWarehouse=true`** no cadastro dele (mantém os outros tipos), análogo à D48. Ambos **opcionais**; snapshot. _(Revisa D26.)_                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D50 | **Entradas pela página de Contratos (lápis)**            | Na página, **lápis → escolher o tipo** (padrão da pág. Relatórios). **Mercado à vista** também pode nascer aqui: modal de **seleção de lote (obrigatória — não dá pra pular)** → **fases 1+2 em 2 modais seguidos** (registra a venda no lote, como o fluxo via lote, D43). **Futuro**: só pela página, **sempre sem lote**, fases 1+2 em 2 modais. _(Refina D41/D42/D43; o "Mercado à vista **também** nasce no lote" foi **superado por D61** — entrada única pela página.)_                                                                                                                                                                                                                             |
| D51 | **Persistência uniforme do `SaleContract`**              | Tabela com colunas próprias de todo o negócio. **Futuro = 100% no `SaleContract`** (`sampleId`/`movementId` nulos + `type`); **à vista** vincula o movimento (`movementId` 1:1). Resolve **P16**; refina D11/D42.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D52 | **Edição reflete na venda/lote**                         | Editar a etapa 1 no contrato **sincroniza o `SampleMovement`/lote** (à vista) — contrato e venda coerentes; Futuro só no contrato. _(Mecanismo p/ movimento append-only = Fase B, P20.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D53 | **Snapshots JSON + listas em lookup**                    | Snapshots (comprador/vendedor/armazéns/banco) = `Json?` por entidade + FK (padrão `buyerClientSnapshot`). Listas Forma/Modalidade/Embalagem = **3 tabelas de lookup**; contrato guarda **texto snapshot** + FK (revisa D20/D25).                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D54 | **Ágio/deságio por saca**                                | `AgioDesagioType` (ágio/deságio) + valor **em R$ POR SACA**: preço efetivo/saca = preço ± valor; `total = preço_ajustado × sacas`. **Corrige a D18** (não é ajuste no total).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D55 | **Corretagem: % + R$ salvo**                             | Guarda os 2 % (vendedor/comprador) **e** o R$ calculado (snapshot congelado). Refina D44/D19.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D56 | **Auditoria em tabela própria**                          | `SaleContractExport` (contrato + tipo + quem/quando) registra cada emissão — uniforme p/ à vista e Futuro. **Substitui** o `FECHAMENTO_EXPORTED` do event store da amostra (revisa D33).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D57 | **Número contínuo + espelho int**                        | `contractSeq` (Int global, nunca reseta — espelho p/ gerar/ordenar) + `contractNumber` ("NNNN/AA"). Detalha D15.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D58 | **`WASH_OUT` com motivo/data**                           | O status `WASH_OUT` guarda `washoutReason` + `washoutAt`. Refina D45.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D59 | **Acesso ao cadastro (S40)**                             | Criar/editar/listar `Bank`, `Broker`, `ClientBankAccount`, `ClientAttachment` = **qualquer usuário autenticado** (PROSPECTOR excluído pelo gate central). Não restrito a ADMIN/CADASTRO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D60 | **Telas de cadastro (S40)**                              | `Bancos` e `Corretores` numa **página "Cadastros" com abas**; contas bancárias e anexos vivem no **detalhe do Cliente**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D61 | **Venda só pela página Contratos (S55)**                 | A venda à vista é feita **exclusivamente** pela página "Contratos" (FAB → seleção de lote → venda → encadeia a Etapa 2). **Removidos do detalhe da amostra** os botões Venda/Perda e o cancelar de movimento — o detalhe vira **histórico só-leitura** (mini-cards Vendido/Perdido/Disponível ficam). A **perda** segue no código (modal LOSS + backend), **sem ponto de criação por ora** (realocar depois). Desfazer venda: **"Quebrar"** (CONFERIR+) ou **"Cancelar"** (EM*ABERTO, novo) na página Contratos. Venda = ação **ADMIN**. *(Supera a "2ª entrada pelo lote" de D41/D43/D50.)\_                                                                                                              |
| D62 | **Criação à vista = wizard de 2 passos (commit adiado)** | A criação à vista pela página vira um **wizard**: **passo 1** ("Registrar venda") **só COLETA** os dados; **passo 2** ("Gerar rascunho") cria a venda + contrato e **emite no fim** (`createSampleMovement` → `emitSaleContract`, sequencial); **"Voltar"** reabre o passo 1 preservando os dados. O número do contrato aparece como **preview** no passo 1 (`getNextContractNumber`, indicativo) e é alocado de verdade só na criação. _(Refina D46/D50/D61. **SUPERSEDIDA pela D69**: o à vista voltou a 1 modal só — o "passo 1"/"Voltar" saiu.)_                                                                                                                                                       |
| D63 | **PDF não exibe o status do fluxo**                      | O documento (contrato) **não mostra** o status (`EM_ABERTO`/`CONFERIR`/…) — é um contrato, não um rastreador de etapa. Removido do cabeçalho, para **todos** os status. _(Revisa o "logo + emissor + status" de S51/S52.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D64 | **"Visualizar" = prévia do PDF + Exportar/Baixar**       | Botão **"Visualizar"** (de `CONFERIR` em diante) abre um **modal com o PDF** (iframe, gerado on-demand) com **Exportar** (compartilhar, `shareOrDownloadFile`) · **Baixar** (salvar, download direto) · **Fechar**. **Substitui** os botões "Ver" (form read-only) e "Baixar PDF". _(Refina D32.)_                                                                                                                                                                                                                                                                                                                                                                                                         |
| D65 | **Ações do card por status + "Washout"**                 | `EM_ABERTO` = **Emitir** · Cancelar; `CONFERIR` = **Visualizar · Editar · Confirmar**; `CONFIRMADO` = **Faturado · Pago · Visualizar · Washout**; `FATURADO` = Pago · Visualizar · Desfazer · Washout; `PAGO` = Visualizar · Desfazer · Washout; `WASH_OUT` = Visualizar. **"Quebrar" renomeado p/ "Washout"** (mesmo backend, D45/D58); "Faturar"/"Pagar" → **"Faturado"/"Pago"**. _(Refina D46/D47; "Desfazer" de FATURADO/PAGO mantido.)_                                                                                                                                                                                                                                                               |
| D66 | **"Editar" edita a fase 1 (resolve P20)**                | O **"Editar"** libera os campos da **fase 1** (data · sacas · preço/saca · corretagens % · corretores) além da fase 2, num bloco "Venda" no modal. No backend o `emitSaleContract` aceita um bloco opcional **`saleFields`** e **sincroniza a venda do lote**: comprador (já), **sacas** e **data** via `SALE_UPDATED` (append-only, ajusta o saldo do lote); preço/corretagens/corretores são do contrato (não há no movimento). **Sacas travadas em liga** (F7.1). **Resolve P20** (mecanismo = `SALE_UPDATED`, não evento novo). _(Implementa D47/D52.)_                                                                                                                                                |
| D67 | **Futuro = criação em 1 modal único**                    | O contrato **Futuro** (sem lote) é criado num **único modal** (reusa o `SaleContractEtapa2Modal` com o bloco "Venda" visível + Vendedor/Comprador **manuais**), **não** num wizard de 2 passos. Submete tudo de uma vez → `createFutureSaleContract` (fase 1 + comprador, cria `EM_ABERTO`) → `emitSaleContract` (fase 2) → `CONFERIR`. **Sacas livres** (sem saldo/sem trava de liga), **sem nº de lote**; persiste 100% no `SaleContract` (`sampleId`/`movementId` nulos, D51). _(Refina D50/D62 para o Futuro.)_                                                                                                                                                                                        |
| D68 | **Washout/Cancelar do Futuro sem lote**                  | O Futuro não tem venda/lote: **Washout** (CONFERIR+) marca `WASH_OUT` + motivo direto (**não** cancela venda nem devolve sacas); **Cancelar** (EM*ABERTO órfão de falha) **apaga** o contrato. Texto dos diálogos adaptado (sem "devolve as sacas"). Aproveitou p/ renomear **"Quebrar" → "Washout"** no diálogo (título/botão/motivo/toast). *(Refina D45/D58/D65; o à vista segue cancelando a venda.)\_                                                                                                                                                                                                                                                                                                 |
| D69 | **À vista também em 1 modal (fim do wizard)**            | A criação à vista vira **1 modal só** (como o Futuro, D67), **substituindo o wizard de 2 passos da D62**. O picker de lote abre o `SaleContractEtapa2Modal` no modo `spotCreate`: bloco "Venda" com **sacas ≤ disponível** (liga = 100% travado) + **vendedor pré-preenchido do dono** do lote + comprador manual; submit cria a venda (`createSampleMovement`; **liga sem dono** → o vendedor escolhido vira o dono via `updateRegistration` antes) → `emit` → `CONFERIR`. Mantém a **checagem de viabilidade** da liga; **descarta** o aviso não-bloqueante "participa de liga". **Supersede D62** (sem "Voltar"/passo 1 separado). _(Frontend-only; backend `createSampleMovement`+`emit` inalterado.)_ |

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

> **Não entram no modal:** **ágio/deságio** = **botões no card** (D18, a detalhar — P21); **valor total** = calculado e **salvo**, não exibido (local a decidir — P22).

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
| P2  | Comportamento por campo        | Origem (auto/manual), obrigatoriedade, validação de cada campo. Em revisão **campo a campo por fase do fluxo** (Etapa 1 ✅; Etapa 2 a fazer) — ver seção própria.                                                                                                                                          |
| P16 | Modelagem do Futuro (sem lote) | **✅ Resolvida pela D51** — Futuro = 100% no `SaleContract` (`sampleId`/`movementId` nulos + `type`); à vista vincula o movimento (1:1).                                                                                                                                                                   |
| P17 | Acionamento do `WASH_OUT`      | **✅ Resolvida (S50)**: botão **"Quebrar"** na página de Contratos, de **CONFERIR/CONFIRMADO/FATURADO/PAGO** (não EM_ABERTO), **motivo obrigatório**, **definitiva**. A quebra **cancela a venda** (devolve as sacas ao lote) — delega ao `cancelSampleMovement`; o washout passou a cobrir FATURADO/PAGO. |
| P21 | Botões de ágio/deságio no card | **✅ Encerrada (não adotada)** — ágio/deságio ficou como **campo no modal** (par tipo\|valor), não como botões no card. Decidido na implementação da Etapa 2 (S54).                                                                                                                                        |
| P20 | Editar etapa 1 no contrato     | **✅ Resolvida (D66)** — o "Editar" libera a fase 1; `emitSaleContract` aceita `saleFields` e sincroniza a venda via **`SALE_UPDATED`** (append-only: sacas+data ajustam o saldo do lote; sacas travadas em liga, F7.1). Mecanismo = evento de update existente, **sem evento novo**.                      |
| P22 | Onde exibir o valor total      | O total é **calculado e salvo** (não no modal/PDF); **onde** será apresentado — a decidir (D18). Único realmente em aberto.                                                                                                                                                                                |

**Resolvidas**: P1→D12/D13 · P3→D20 · P4→D17/18/19 · P5→D21 · P6→D29 · P7→D30 · P8→D31 · P9→D22/D23 · P12→D11 · P13→D14 · P14→D28 · P15→D26 · banco→D24 · P10→D32 · P11→D33 · P19→D47 · P16→D51 · P17→S50 (quebra manual) · **P20→D66** (editar fase 1 via `SALE_UPDATED`) · **P21→não adotada** (ágio = campo no modal). **Abertas**: **P2** (campo a campo — Etapa 1+2 do à vista ✅; resta o **Futuro**) · **P22** (onde exibir o total). _(P18 resolvida: peso → etapa 2; ágio = campo no modal.)_

**Entrada pendente**: o **CNPJ** (e demais dados) da empresa emissora — Flavio fornece para a Fase A (D29).

---

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

> **Fases 0/A/B/C/D ✅ implementadas — Mercado à vista E Futuro** (ver "Status da implementação" acima). O **contrato Futuro** (sem lote, D42/D51/D67/D68) foi implementado na S58. **Falta** (ambos os tipos): **P22** (onde exibir o total) · CNPJ real + assinatura do dono (imagem) + fidelidade ao print legado · gestão das 3 listas · validar no device.

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
rodapé. **Gates verdes** (format/lint/build; unit 337 incl. pdf + 1-página). **1 commit `main` NÃO pushado**:
`35fe687`. **Resolve** os itens "header verde (redesign)" e "fidelidade ao print legado" da S54. **Falta**:
assinatura do dono como **imagem** (D35, hoje linha em branco); **partes** ainda em 2-col (o usuário pediu p/
manter "por enquanto" — revisitar depois); P22.
