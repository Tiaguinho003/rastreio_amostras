# Fechamento — Plano de Trabalho

**Status**: **EM CONSTRUÇÃO** — iniciado em 2026-06-24. **Decisões D1–D36** travadas ao longo das sessões 1–13. O alvo é **recriar no app o "Contrato de Compra e Venda de Café"** do sistema legado (print na Sessão 2). O Fechamento puxa **extensões no cadastro de Cliente**: **bancário** (`Bank`+`ClientBankAccount`, pré-requisito) e **anexos** (`ClientAttachment`, independente) exigem tabelas novas; **armazém já existe** (`isWarehouse`). **Nenhum código de feature ainda.** **Todas as pendências catalogadas resolvidas** (resta só P2, decidido campo a campo na implementação) + a entrada do **CNPJ**. Próximo passo: desenhar as tabelas (`Bank`/`ClientBankAccount`/`ClientAttachment`/`SaleContract`) — rascunho para revisão.
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
  + contadores denormalizados no lote (`soldSacks`/`lostSacks`/`commercialStatus`).
- **Fluxo**: botão "Venda" em `components/samples/SampleMovementsPanel.tsx` → modal
  `components/samples/SampleMovementModal.tsx` → `POST app/api/v1/samples/[sampleId]/movements/route.ts`
  → `createSampleMovement` em `src/samples/sample-command-service.js:2689-2804` → projetor em
  `src/samples/sample-query-service.js`.
- **Captura hoje apenas**: comprador (Cliente vinculado, obrigatório), sacas (qtd inteira), data
  (`movementDate`), observações (1 campo `notes`). Validação por normalizers manuais (sem zod).
- O **event store é append-only** (triggers impedem UPDATE/DELETE — skill `prisma`). Campos novos
  exigem migration nova + bump de `schemaVersion` no payload, nunca editar o existente.

### Cadastro de Cliente hoje

- `Client` (`prisma/schema.prisma:520`) tem nome/razão, CPF/CNPJ, IE, endereço, contato e as flags
  **`isBuyer/isSeller/isWarehouse`** (`:548-550`, multi-escolha — `ClientQuickCreateModal.tsx:565-577`).
  **Sem nenhum dado bancário** (confirmado por grep).
- Já há um **lookup por tipo** (`ClientLookupKind = 'owner' | 'buyer' | 'warehouse' | 'any'`,
  `lib/types.ts:33`) e filtro por papel: selecionar cliente-armazém é nativo.
- **Sub-tabelas do cliente** como precedente: `ClientUnit` (`:577`), `ClientCommercialUser`,
  `ClientAuditEvent`. Conta bancária e anexos por cliente seguem esse padrão.
- **Vendedor** = `Sample.ownerClientId`; **comprador** = `buyerClient` da venda (snapshot via
  `buildBuyerSnapshot`). **Corretor** = `User` papel `COMMERCIAL`.

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

| #   | Decisão                                    | Detalhe                                                                                                                                                            |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Natureza **híbrida**                       | Contrato de Fechamento: dados estruturados + **3 blocos de texto livre** + **assinaturas**. Sem cláusulas jurídicas fixas (ver D30).                               |
| D2  | Destinatários                              | Confirmação ao **comprador** e ao **vendedor**, com valor de **contrato formal** entre as partes.                                                                  |
| D3  | Granularidade **por venda**                | Cada venda (movimento `SALE`) gera um Fechamento, chaveado pelo `movementId`.                                                                                       |
| D4  | Financeiro **na venda (obrigatório)**      | Os dados passam a ser capturados no modal de Venda; o núcleo financeiro é exigido. Demais campos: obrigatoriedade caso a caso.                                      |
| D5  | Emissor com **dados fixos**                | Cabeçalho com nome/CNPJ/logo da empresa/corretora, fixos (não escolhidos por venda).                                                                               |
| D6  | PDF via **`pdf-lib`**                       | Clonando o pipeline do laudo (`sample-pdf-report-service.js`); **sem dependência nova**.                                                                           |
| D7  | Construção **campo a campo**               | Os campos são detalhados e implementados um a um; este doc é o backlog vivo.                                                                                        |
| D8  | **Replicar o contrato legado por inteiro** | O v1 espelha o "Contrato de Compra e Venda de Café".                                                                                                               |
| D9  | **Campos no modal de Venda**               | O `SampleMovementModal.tsx` vira o formulário do contrato (mantém D4). UI com seções/abas dado o volume.                                                            |
| D10 | **Qualidade do café NÃO entra**            | Documento puramente comercial; classificação fica só no laudo.                                                                                                     |
| D11 | **Persistência: tabela `SaleContract`**    | Tabela dedicada 1:1 com o movimento `SALE` (FK `movementId`), colunas tipadas, escrita pelo projetor.                                                              |
| D12 | **Comprador/Vendedor automáticos**         | Comprador = comprador da venda; Vendedor = dono do lote (`ownerClient`). Pré-preenchidos, **editáveis**, com snapshot.                                              |
| D13 | **Corretor = usuário `COMMERCIAL`**        | Um usuário (papel `COMMERCIAL`) é o corretor responsável, figura e assina. Snapshot do nome. **Revisado pela D34**: N corretores por contrato, vínculo a `User` opcional.                                                    |
| D14 | **Status do Contrato (manual)**            | Enum editável: `EM_ABERTO → CONFIRMADO → FATURADO → PAGO` (default `EM_ABERTO`). Cancelamento via cancelar a venda.                                                 |
| D15 | **Número do Contrato automático**          | Sequencial **contínuo** + `/AA` do ano (ex.: `3295/26`), **não editável**. Gerador novo (padrão do `internalLotNumber`).                                            |
| D16 | **"Número de Compra" = campo livre**       | Texto/número manual; **sem vínculo** a outra entidade.                                                                                                             |
| D17 | **Quantidade = sacas da venda (inteira)**  | Reusa o `quantitySacks`; sem campo novo. **Peso (Kg)** é campo decimal **separado**.                                                                                |
| D18 | **Valor total automático**                 | `preço/saca × sacas`, ajustado por ágio/deságio (ágio soma, deságio subtrai). _Base exata a confirmar na Fase B._                                                   |
| D19 | **Corretagem calculada**                   | Vendedor e comprador, cada um em **% ou R$**; quando %, calcula o R$ sobre o total. Guarda tipo + valor + R$.                                                       |
| D20 | **Listas (B8)**                            | **Forma de Pagamento {Faturado, Livre}** · **Modalidade {Retirar, Posto, Disponível}** · **Embalagem {Sacas, Bags, A granel}** (valores no B8; fixas ou cadastráveis a confirmar). **Condição de Pagamento = texto livre** (não é lista). _(Banco → entidade própria, D24.)_ |
| D21 | **Só vendas novas**                        | Fechamento/`SaleContract` só para vendas a partir da feature; antigas ficam **sem contrato** (sem backfill).                                                        |
| D22 | **Geração automática ao salvar**           | Confirmar a venda já gera/abre o PDF do Fechamento. Re-geração depende de P10.                                                                                      |
| D23 | **Permissão ampla**                        | Pode gerar o Fechamento **quem tem acesso à venda**.                                                                                                               |
| D24 | **Dados bancários do cliente**             | `Bank` (lookup leve cadastrável: `id` Int, nome, status ativo/inativo) + `ClientBankAccount` por cliente, no padrão `ClientUnit`. "Banco do Vendedor" = uma conta do vendedor. |
| D25 | **Snapshot de dados de cliente**           | No fechamento, comprador, vendedor, corretor, **conta bancária** e **armazéns** são **congelados**; mudanças no cadastro não alteram contratos já emitidos.        |
| D26 | **Armazém = `Client` com `isWarehouse`**   | Modelo **já existe** (flags multi-escolha + lookup `kind='warehouse'`). "Armazém do Comprador/Vendedor" = cliente-armazém (livre) → snapshot. **Sem entidade nova.** |
| D27 | **Anexos do cliente**                      | `ClientAttachment` (1 cliente → N arquivos, lista livre + descrição), reusa `local-upload-service` + `UPLOADS_DIR`. **PDF + imagens** → +`application/pdf` no allowlist + atualizar CLAUDE.md#5/SECURITY. **Só arquivamento; independente do contrato.** |
| D28 | **Campos da conta bancária**               | `ClientBankAccount` = banco (FK `Bank`) + **agência** + **conta (com dígito)** + **titular** + **chave PIX**. _(Sem tipo corrente/poupança.)_                       |
| D29 | **Emissor fixo em config**                 | Promover `COMPANY_INFO` a módulo compartilhado + **CNPJ** (a fornecer). Sem tela editável (muda com deploy).                                                        |
| D30 | **3 blocos de texto livre, sem cláusulas fixas** | Contrato tem **Observações**, **Descrição** e **Observações (Pág. 2)** — texto livre; **não há** boilerplate jurídico fixo.                                  |
| D31 | **Linhas de assinatura do corretor**       | ~~Campo `corretorSignatureLines` (0–4).~~ **Substituído pela D35**: assinatura do corretor = imagem fixa do dono da empresa (sempre 1, automática).                                              |
| D32 | **Entrega: baixar/compartilhar**           | PDF gerado e oferecido via `shareOrDownloadFile` (download/Web Share); **sem persistir bytes**. Regenerável da `SaleContract` (D11/D25) quando preciso.            |
| D33 | **Auditoria: `FECHAMENTO_EXPORTED`**       | Novo tipo de evento no event store da amostra (`SampleEventType` + payload schema) registra cada geração do Fechamento. _(Append-only: migration + bump.)_         |
| D34 | **Corretores: N por contrato**             | Cadastro **`Broker`** (id, nome, `userId` FK **anulável** [métrica], status ativo/inativo) para TODOS os corretores. Contrato → `SaleContractBroker` (brokerId + nome snapshot), N por contrato. Métrica por `brokerId` (todos os corretores); métrica de usuário via `Broker.userId`. Não-usuário = `Broker` com `userId` nulo — **reutilizável + com métrica**. _(Revisa D13. Rateio da corretagem: adiado.)_ |
| D35 | **Assinaturas (layout fixo)**              | Corretor/empresa = **imagem da assinatura do dono** (asset fixo do emissor — D29), impressa automaticamente. Comprador e vendedor = **linhas em branco** (assinadas à mão). _(Substitui o `corretorSignatureLines` da D31.)_ |
| D36 | **Data de nascimento (PF)**                | Coluna `Client.birthDate` (data), preenchível **só quando `personType = PF`**, **opcional**. **Só cadastro** — não entra no Fechamento. Sem tabela nova.            |
| D37 | **Campo `Tipo` (da operação)**             | Campo **obrigatório**, **sem default** (força escolha), lista **cadastrável** pelo admin (inicia com **Futuro · Mercado à vista · Wash-out**). Distinto da Modalidade (B8). |

> **Representação monetária (padrão de implementação)**: R$ como `Decimal(12,2)`, percentuais
> `Decimal(5,2)`, peso (Kg) `Decimal(10,2)`. Confirmar na Fase B.

---

## Impacto no sistema — extensões do cadastro de Cliente

O Fechamento **puxa dados de cliente** para o contrato (congelados via snapshot — D25). **Esta seção
vai crescer** conforme novas extensões aparecerem.

1. **Dados bancários (D24/D28) — exige modelagem nova.** Tabela `Bank` (cadastrável pelo admin) +
   `ClientBankAccount` por cliente (banco + agência + conta c/ dígito + titular + chave PIX). UI nova no
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
- ⚠️ **Status do Contrato** — enum manual `EM_ABERTO/CONFIRMADO/FATURADO/PAGO` (D14).
- ✅ **Data do Contrato** — ≈ `movementDate`. · ⚠️ **Número de Compra** — campo livre (D16). · ⚠️ **Mês/Ano** — derivados.
- ✅ **Número do Lote** — `internalLotNumber`.

### Partes
- ✅ **Comprador** — comprador da venda (snapshot), automático (D12).
- ✅ **Vendedor** — dono do lote (`ownerClient`), automático e editável; snapshot (D12).
- ⚠️ **Corretor(es)** — N por contrato via `SaleContractBroker` → cadastro `Broker` (nome + `userId` opcional p/ métrica + status); figuram no contrato (D13/D34).
- ⚠️ **Banco do Vendedor** — conta do vendedor (`ClientBankAccount`: banco+agência+conta+titular+PIX), snapshot (D24/D28).

### Armazéns
- ✅ **Armazém do Comprador** · ✅ **Armazém do Vendedor** — cliente-armazém (`isWarehouse`) via lookup, snapshot (D26).

### Quantidade & valores (modelo financeiro — D17/D18/D19)
- ✅ **Quantidade** — sacas inteiras da venda (`quantitySacks`), reusada (D17).
- ⚠️ **Peso (Kg)** — campo decimal separado (D17) · ⚠️ **Preço por Saca** (R$).
- _Valor total_ — calculado: `preço × sacas` ± ágio/deságio (D18).
- ⚠️ **Ágio / Deságio** (tipo + valor %/R$, D18) · ⚠️ **Corretagem do Vendedor / do Comprador** (%/R$, D19).

### Pagamento & logística
- **Condição de Pagamento** (texto livre) · **Forma de Pagamento** {Faturado/Livre} · **Modalidade** {Retirar/Posto/Disponível} · **Embalagem** (ex-Sacaria) {Sacas/Bags/A granel} — impressos (D20/B8).
- ⚠️ **Data Faturamento** · ⚠️ **Data Pagamento**.

### Assinaturas & observações
- ⚠️ **Assinaturas** — corretor/empresa = **imagem fixa do dono** (auto, D35); comprador e vendedor = **linhas em branco** (à mão).
- ⚠️ **3 blocos de texto livre**: Observações · Descrição · Observações (Pág. 2) — sem cláusulas fixas (D30).

---

## Blocos do Fechamento (estrutura para revisão campo a campo — P2)

Organização dos campos do contrato em **blocos**, para conferir **campo a campo** (origem
automática vs. manual, obrigatório/opcional, validação) e checar se **falta algum campo**. Resolve a
**P2** e guia o **formulário** (modal de Venda, D9) e o **layout do PDF** (Fase C). O comportamento de
cada campo é anotado conforme revisamos.

### B1 — Identificação do contrato ✅
- **Número do Contrato** — auto, sequencial `NNNN/AA`, gerado ao salvar, não editável (D15)
- **Status do Contrato** — manual, default `EM_ABERTO`; `EM_ABERTO/CONFIRMADO/FATURADO/PAGO` (D14) ✅ mantidos
- **Tipo (da operação)** — **obrigatório**, **sem default** (força escolha), lista **cadastrável** (inicia com `Futuro / Mercado à vista / Wash-out`) (D37)
- **Data do Contrato** — default = data da venda (`movementDate`), **editável**
- **Número de Compra** — manual, livre, **opcional** (D16)
- **Número do Lote** — `internalLotNumber` da amostra (auto, não editável)
- ~~Mês/Ano~~ — **removidos**: deriváveis da data (formatar no PDF; derivar em filtros/relatórios)

### B2 — Comprador ✅ campos _(funcionalidades específicas depois)_
- **Comprador** — Cliente da venda (D12), snapshot congelado.
- **Campos exibidos no contrato**: Nome/Razão social · CPF/CNPJ · Inscrição Estadual · Endereço · Cidade/UF.
- **Telefone e e-mail NÃO entram** no contrato (existem no snapshot, mas não são impressos).
- _Comportamento específico (editável? etc.) — a definir depois._

### B3 — Armazém do comprador ✅ campos
- **Armazém do comprador** — cliente-armazém via lookup `kind='warehouse'` (D26), snapshot.
- **Campos exibidos = os mesmos do comprador**: Nome/Razão social · CPF/CNPJ · Inscrição Estadual · Endereço · Cidade/UF (sem telefone/e-mail).
- _Comportamento específico (obrigatório? editável?) — depois._

### B4 — Vendedor ✅ campos
- **Vendedor** — `ownerClient` do lote (D12), snapshot.
- **Campos exibidos = os mesmos do comprador**: Nome/Razão social · CPF/CNPJ · Inscrição Estadual · Endereço · Cidade/UF (sem telefone/e-mail).
- _Comportamento específico (editável conforme D12, etc.) — depois._

### B5 — Armazém do vendedor ✅ campos
- **Armazém do vendedor** — cliente-armazém via lookup `kind='warehouse'` (D26), snapshot.
- **Campos exibidos = os mesmos do comprador**: Nome/Razão social · CPF/CNPJ · Inscrição Estadual · Endereço · Cidade/UF (sem telefone/e-mail).
- _Comportamento específico — depois._

### B6 — Corretagem ✅ campos
- **Corretor(es)** — N via `Broker` / `SaleContractBroker` (D34, métrica). **NÃO impressos no contrato** (ficam só como registro/métrica).
- **Corretagem do vendedor** — **entra no contrato exibindo apenas a % (porcentagem)**; o valor em R$ (D19) fica interno.
- **Corretagem do comprador** — idem (só %).
- _Nota: como o contrato mostra só a %, reavaliar no B7 se a entrada da corretagem é só % (vs. "% ou R$" da D19)._

### B7 — Negócio: quantidade & valores ✅ campos
- **Quantidade (sacas)** — da venda (`quantitySacks`, D17) — **impresso**
- **Peso (Kg)** — manual, decimal (D17) — **impresso**
- **Preço por saca** — manual, R$ — **impresso**
- **Ágio / Deságio** — tipo + valor; ajusta o total (D18) — **NÃO impresso** (interno)
- **Valor total** — calculado `preço × sacas` ± ágio/deságio (D18) — **NÃO impresso** (interno)
- _Pendente (de B6): se o contrato mostra a corretagem só em %, reavaliar se a entrada da corretagem é só %._

### B8 — Pagamento & logística ✅ campos _(2 detalhes pendentes)_
- **Condição de Pagamento** — **campo livre (texto)**, **impresso**. _(não é lista — sai da D20)_
- **Forma de Pagamento** — lista **{Faturado, Livre}**, **impresso**.
- **Modalidade** — lista **{Retirar, Posto, Disponível}**, **impresso**.
- **Embalagem** _(renomeia "Sacaria")_ — lista **{Sacas, Bags, A granel}**, **impresso**.
- **Data de Faturamento** · **Data de Pagamento** — datas escolhidas pelo usuário (sem default "hoje"), **impressas**.
- **Banco do Vendedor** — puxa do cadastro do cliente: **Banco, Agência, Conta, CNPJ/CPF, Chave PIX**, **impresso**.
- _Pendente: (a) Forma/Modalidade/Embalagem são fixas ou cadastráveis? (b) banco lista **CNPJ/CPF** (B8) vs. **titular** (D28) — reconciliar `ClientBankAccount`._

### B9 — Observações
- **Observações** · **Descrição** · **Observações (Pág. 2)** — texto livre, sem cláusulas fixas (D30)

### B10 — Assinaturas
- **Corretor/empresa** — imagem fixa do dono, impressa automaticamente (D35)
- **Comprador** — linha em branco (à mão)
- **Vendedor** — linha em branco (à mão)

> Próximo: revisar **bloco a bloco, campo a campo**, anotando o comportamento e os campos faltantes.

---

## Pendências (restantes)

| #   | Pendência                  | O que falta decidir                                                                                                                            |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P2  | Comportamento por campo    | Origem (auto/manual), obrigatoriedade, validação de cada campo. Estruturado em **"Blocos do Fechamento"**; em revisão **campo a campo**.         |

**Resolvidas**: P1→D12/D13 · P3→D20 · P4→D17/18/19 · P5→D21 · P6→D29 · P7→D30 · P8→D31 · P9→D22/D23 · P12→D11 · P13→D14 · P14→D28 · P15→D26 · banco→D24 · P10→D32 · P11→D33. **Só P2 segue aberta** (campo a campo, Fase B).

**Entrada pendente**: o **CNPJ** (e demais dados) da empresa emissora — Flavio fornece para a Fase A (D29).

---

## Roadmap proposto (fases — cada uma com plano e aprovação próprios)

> Implementação **campo a campo** (D7). A Fase 0 (cadastro) é pré-requisito do que o contrato referencia.

- **Fase 0 — Extensões do cadastro de Cliente.** **Bancário** (D24/D28): tabela `Bank` (`id` Int, nome,
  status) + `ClientBankAccount` por cliente (banco + agência + conta c/ dígito + titular + chave PIX),
  no padrão `ClientUnit`; UI nova no cadastro. **Anexos** (D27): `ClientAttachment` (independente do
  contrato; +`application/pdf` no allowlist + atualizar segurança). **Data de nascimento** (D36): coluna `Client.birthDate` (PF, opcional). Armazém não entra (D26). **O
  bancário precede a Fase B.**
- **Fase A — Emissor + corretor.** Promover `COMPANY_INFO` a módulo compartilhado + **CNPJ** (D29).
  Reaproveitar o logo + **imagem da assinatura do dono** (D35). Cadastro **`Broker`** (corretores; `userId` opcional p/ métrica) (D34).
- **Fase B — Contrato no modal de Venda (campo a campo).** Criar a tabela `SaleContract` (D11) via
  **migration nova**; numeração `NNNN/AA` (D15) e status (D14); partes/banco/armazém com **snapshots**
  (D12/D24/D25/D26) + corretores via `Broker` + `SaleContractBroker` (D34); financeiros (D17/18/19);
  pagamento/logística com listas mistas (D20); 3 blocos de texto livre (D30). Bump de `schemaVersion` + atualizar
  `sale-created.payload.schema.json` + `validate:schemas` + testes de contrato. Projetor escreve a
  `SaleContract`. UI com seções/abas no `SampleMovementModal.tsx`. **Só vendas novas (D21).**
- **Fase C — PDF do Fechamento.** `renderFechamentoPdf` espelhando o layout do contrato legado
  (cabeçalho → partes → armazéns → valores → pagamento → 3 blocos de texto → assinaturas: imagem do dono
  + linhas em branco do comprador/vendedor, D35).
  **Sem qualidade** (D10).
- **Fase D — Geração + entrega.** Geração **automática ao salvar** (D22); pode gerar quem acessa a venda
  (D23); entrega via `shareOrDownloadFile` **sem persistir** (D32); novo evento **`FECHAMENTO_EXPORTED`** registra a geração (D33).

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
