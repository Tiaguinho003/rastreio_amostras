# Fechamento — Plano de Trabalho

**Status**: **EM CONSTRUÇÃO** — iniciado em 2026-06-24. **Decisões D1–D27** travadas ao longo das sessões 1–9. O alvo é **recriar no app o "Contrato de Compra e Venda de Café"** do sistema legado (print na Sessão 2). **Importante:** o Fechamento puxa **extensões no cadastro de Cliente** — o **bancário** (`Bank`+`ClientBankAccount`, pré-requisito do contrato) e os **anexos do cliente** (`ClientAttachment`, independente) exigem tabelas novas; **armazém já existe** (`isWarehouse`). **Nenhum código de feature ainda.** Próximo passo: planejar a **Fase 0 (bancário)** e desenhar a tabela `SaleContract` (Fase B).
**Escopo**: documento único de organização, análise, decisões e execução da feature de **Fechamento** — a geração, **após uma venda**, de um **Contrato de Compra e Venda de Café** profissional em **PDF, para impressão** — **e das extensões de cadastro que ele exige** (ver "Impacto no sistema").

**Como ler este doc**: a seção **Decisões fechadas** é o que está acordado; **Impacto no sistema** lista as extensões de cadastro (pré-requisitos); **Contrato legado — inventário de campos** é o alvo do v1; **Pendências** é o que ainda não foi decidido; **Roadmap** é o desenho corrente em fases; **Log de sessões** é o histórico por data.

**Princípio**: construído colaborativamente em formato pergunta → resposta → registro, e implementado **um campo por vez**. A implementação de cada bloco só começa depois que as decisões dele estiverem fechadas. Este doc **referencia** o código em vez de duplicar dados que mudam.

---

## Contexto

A empresa precisa que, **logo após registrar uma venda**, o sistema produza um documento chamado
**"Fechamento"** — na prática, o **Contrato de Compra e Venda de Café** que ela já emite hoje em um
sistema legado (ver o inventário de campos abaixo). É um documento importante e deve ser profissional
e correto: serve como **confirmação para o comprador e para o vendedor** e tem **valor de contrato
formal**, com **corretagem dos dois lados** (modelo de corretora).

Hoje **não existe** nada parecido no app, e a venda **não captura dado financeiro nem contratual**, e o
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
  **`isBuyer/isSeller/isWarehouse`** (`:548-550`) — booleanos independentes (**multi-escolha**: o
  cadastro permite marcar comprador/vendedor/armazém juntos — `ClientQuickCreateModal.tsx:565-577`).
  **Sem nenhum dado bancário** (confirmado por grep).
- Já há um **lookup por tipo** — `ClientLookupKind = 'owner' | 'buyer' | 'warehouse' | 'any'`
  (`lib/types.ts:33`) — e filtro por papel (`ClientsFilterButton`): listar/selecionar
  cliente-armazém é **nativo**.
- **Sub-tabelas do cliente** como precedente: `ClientUnit` (1 cliente → N fazendas, `:577`),
  `ClientCommercialUser`, `ClientAuditEvent`. Uma conta bancária por cliente segue esse padrão.
- **Vendedor** = `Sample.ownerClientId`; **comprador** = `buyerClient` da venda (snapshot via
  `buildBuyerSnapshot`). **Corretor** = `User` papel `COMMERCIAL`.

### Geração de PDF e emissor

- Só **`pdf-lib`** está instalado (sem HTML→PDF). Usado em **um único lugar**: o laudo
  (`src/reports/sample-pdf-report-service.js`) — `renderSamplePdf` + `SamplePdfReportService`. É o
  **molde** do Fechamento (D6).
- **Emissor**: `COMPANY_INFO` em `sample-pdf-report-service.js:27-31` (nome, cidade/UF, telefone,
  endereço) — **falta CNPJ**. Logo já entra como bitmap no cabeçalho (reutilizável).
- **Entrega**: download/compartilhar via `lib/share-blob.ts` + `lib/api-client.ts:1113` + rota
  `app/api/v1/samples/[sampleId]/export/pdf/route.ts`. Infra de link público com token/QR
  (`app/laudo/[token]/route.ts` + `SampleReportShare`) disponível.

---

## Decisões fechadas

| #   | Decisão                                    | Detalhe                                                                                                                                                            |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Natureza **híbrida**                       | Contrato de Fechamento: dados estruturados + cláusulas/observações fixas + **assinaturas**. Sem prosa jurídica extensa.                                            |
| D2  | Destinatários                              | Confirmação ao **comprador** e ao **vendedor**, com valor de **contrato formal** entre as partes.                                                                  |
| D3  | Granularidade **por venda**                | Cada venda (movimento `SALE`) gera um Fechamento, chaveado pelo `movementId`.                                                                                       |
| D4  | Financeiro **na venda (obrigatório)**      | Os dados passam a ser capturados no modal de Venda; o núcleo financeiro é exigido. Obrigatoriedade dos demais campos definida caso a caso.                          |
| D5  | Emissor com **dados fixos**                | Cabeçalho com nome/CNPJ/logo da empresa/corretora, fixos (não escolhidos por venda).                                                                               |
| D6  | PDF via **`pdf-lib`**                       | Clonando o pipeline do laudo (`sample-pdf-report-service.js`); **sem dependência nova**.                                                                           |
| D7  | Construção **campo a campo**               | Os campos são detalhados e implementados um a um; este doc é o backlog vivo.                                                                                        |
| D8  | **Replicar o contrato legado por inteiro** | O v1 espelha o "Contrato de Compra e Venda de Café".                                                                                                               |
| D9  | **Campos no modal de Venda**               | O `SampleMovementModal.tsx` vira o formulário do contrato (mantém D4). UI com seções/abas dado o volume.                                                            |
| D10 | **Qualidade do café NÃO entra**            | Documento puramente comercial; classificação fica só no laudo.                                                                                                     |
| D11 | **Persistência: tabela `SaleContract`**    | Tabela dedicada 1:1 com o movimento `SALE` (FK `movementId`), colunas tipadas, escrita pelo projetor.                                                              |
| D12 | **Comprador/Vendedor automáticos**         | Comprador = comprador da venda; Vendedor = dono do lote (`ownerClient`). Pré-preenchidos, **editáveis**, com snapshot.                                              |
| D13 | **Corretor = usuário `COMMERCIAL`**        | Um usuário (papel `COMMERCIAL`) é o corretor responsável, figura e assina. Snapshot do nome. Corretor **único**.                                                    |
| D14 | **Status do Contrato (manual)**            | Enum editável: `EM_ABERTO → CONFIRMADO → FATURADO → PAGO` (default `EM_ABERTO`). Cancelamento via cancelar a venda.                                                 |
| D15 | **Número do Contrato automático**          | Sequencial **contínuo** + `/AA` do ano (ex.: `3295/26`), **não editável**. Gerador novo (padrão do `internalLotNumber`).                                            |
| D16 | **"Número de Compra" = campo livre**       | Texto/número manual; **sem vínculo** a outra entidade.                                                                                                             |
| D17 | **Quantidade = sacas da venda (inteira)**  | Reusa o `quantitySacks`; sem campo novo. **Peso (Kg)** é campo decimal **separado**.                                                                                |
| D18 | **Valor total automático**                 | `preço/saca × sacas`, ajustado por ágio/deságio (ágio soma, deságio subtrai). _Base exata a confirmar na Fase B._                                                   |
| D19 | **Corretagem calculada**                   | Vendedor e comprador, cada um em **% ou R$**; quando %, calcula o R$ sobre o total. Guarda tipo + valor + R$.                                                       |
| D20 | **Listas mistas**                          | Campos **Modalidade, Sacaria, Condição/Forma de Pagamento**: alguns **fixos no código**, outros **cadastráveis pelo admin**. _(Banco saiu daqui → entidade própria, D24.)_ |
| D21 | **Só vendas novas**                        | Fechamento/`SaleContract` só para vendas a partir da feature; antigas ficam **sem contrato** (sem backfill).                                                        |
| D22 | **Geração automática ao salvar**           | Confirmar a venda já gera/abre o PDF do Fechamento. Re-geração depende de P10.                                                                                      |
| D23 | **Permissão ampla**                        | Pode gerar o Fechamento **quem tem acesso à venda**.                                                                                                               |
| D24 | **Dados bancários do cliente**             | `Bank` (lookup leve cadastrável: `id` Int, nome, status ativo/inativo) + `ClientBankAccount` por cliente (FK `Bank` + dados da conta), no padrão `ClientUnit`. "Banco do Vendedor" = uma conta do vendedor. |
| D25 | **Snapshot de dados de cliente**           | No fechamento, comprador, vendedor, corretor, **conta bancária** e **armazéns** são **congelados**; mudanças no cadastro não alteram contratos já emitidos.        |
| D26 | **Armazém = `Client` com `isWarehouse`**   | Modelo **já existe** (flags multi-escolha no cadastro + lookup `kind='warehouse'`). "Armazém do Comprador/Vendedor" = selecionar um cliente-armazém (livre) → snapshot. **Sem entidade nova.** Pré-vínculo cliente↔armazém seria extra futuro, não necessário. |
| D27 | **Anexos do cliente**                      | `ClientAttachment` (1 cliente → N arquivos, **lista livre + descrição** opcional), reusa `local-upload-service` + `UPLOADS_DIR`. Aceita **PDF + imagens** (JPEG/PNG/WebP, magic bytes fortes) → adicionar `application/pdf` ao allowlist + atualizar CLAUDE.md (regra 5) e docs/SECURITY. **Só arquivamento no cadastro** (não entra no Fechamento); **independente do contrato**. |

> **Representação monetária (padrão de implementação)**: R$ como `Decimal(12,2)`, percentuais
> `Decimal(5,2)`, peso (Kg) `Decimal(10,2)`. Confirmar na Fase B.

---

## Impacto no sistema — extensões do cadastro de Cliente (pré-requisitos)

O Fechamento **puxa dados de cliente** para o contrato (congelados via snapshot — D25). **Esta seção
vai crescer** conforme novas extensões aparecerem.

1. **Dados bancários (D24) — exige modelagem nova.** Tabela `Bank` (cadastrável pelo admin) +
   `ClientBankAccount` por cliente (padrão `ClientUnit`). UI nova no cadastro de Cliente para gerenciar
   contas. No contrato, "Banco do Vendedor" = escolher uma conta do vendedor → snapshot. Campos da
   conta em **P14**. **É a única extensão que precisa de tabelas novas.**
2. **Armazéns (D26) — já resolvido, sem extensão nova.** Um armazém já é um `Client` com `isWarehouse`
   (multi-escolha no cadastro + lookup `kind='warehouse'`). No contrato, "Armazém do
   Comprador/Vendedor" = selecionar um cliente-armazém (livre) → snapshot. **Nada novo a modelar.**
3. **Anexos/documentos do cliente (D27) — independente do contrato.** `ClientAttachment` (lista livre
   + descrição), **PDF + imagens**, reusando a infra de upload (+ `application/pdf` no allowlist;
   atualizar a regra de segurança). **Só arquivamento** — não vai pro PDF do Fechamento; pode ser
   construído à parte.
4. **Futuras.** Outras informações de cliente devem surgir ao longo da construção; entram aqui.

---

## Contrato legado — inventário de campos (alvo do v1)

Fonte: print do "Contrato de Compra e Venda de Café" (Sessão 2). É o **backlog campo a campo**.
Marcadores: ✅ existe no app · ⚠️ novo (não há hoje) · ❓ esclarecer.

### Cabeçalho / identificação
- ⚠️ **Número do Contrato** — automático sequencial contínuo + `/AA`, não editável (D15).
- ⚠️ **Status do Contrato** — enum manual `EM_ABERTO/CONFIRMADO/FATURADO/PAGO` (D14).
- ✅ **Data do Contrato** — ≈ `movementDate`. · ⚠️ **Número de Compra** — campo livre (D16). · ⚠️ **Mês/Ano** — derivados.
- ✅ **Número do Lote** — `internalLotNumber`.

### Partes
- ✅ **Comprador** — comprador da venda (snapshot), automático (D12).
- ✅ **Vendedor** — dono do lote (`ownerClient`), automático e editável; snapshot (D12).
- ⚠️ **Corretor** — usuário `COMMERCIAL`; figura e assina (D13).
- ⚠️ **Banco do Vendedor** — conta bancária do vendedor (`ClientBankAccount` via `Bank`), snapshot (D24).

### Armazéns
- ✅ **Armazém do Comprador** · ✅ **Armazém do Vendedor** — cliente-armazém (`isWarehouse`) via lookup, snapshot (D26).

### Quantidade & valores (modelo financeiro — D17/D18/D19)
- ✅ **Quantidade** — sacas inteiras da venda (`quantitySacks`), reusada (D17).
- ⚠️ **Peso (Kg)** — campo decimal separado (D17) · ⚠️ **Preço por Saca** (R$).
- _Valor total_ — calculado: `preço × sacas` ± ágio/deságio (D18).
- ⚠️ **Ágio / Deságio** (tipo + valor %/R$, D18) · ⚠️ **Corretagem do Vendedor / do Comprador** (%/R$, D19).

### Pagamento & logística
- ⚠️ **Condição de Pagamento** · ⚠️ **Modalidade** · ⚠️ **Sacaria** · ⚠️ **Forma de Pagamento** (listas mistas — D20).
- ⚠️ **Data Faturamento** · ⚠️ **Data Pagamento**.

### Assinaturas & observações
- ❓ **Assinatura do Corretor** — `Em Branco / 1 / 2 / 3 / 4` (a esclarecer — P8).
- ⚠️ **3 blocos de texto**: Observações · Descrição · Observações (Pág. 2) — hoje só `notes` (P7).

---

## Pendências (restantes)

| #   | Pendência                  | O que falta decidir                                                                                                                            |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P2  | Comportamento por campo    | Para cada item do inventário: origem (auto/manual), obrigatoriedade, validação. Resolvido **campo a campo** na Fase B.                          |
| P6  | Home dos dados do emissor  | Promover `COMPANY_INFO` a módulo compartilhado vs. tabela de settings editável; onde o CNPJ passa a viver. (Fase A)                             |
| P7  | Observações & cláusulas    | Os 3 blocos de texto + eventuais cláusulas fixas. (Fase B/C)                                                                                    |
| P8  | Assinaturas                | Quem assina e o significado de "Assinatura do Corretor (Em Branco/1/2/3/4)"; como aparecem no PDF. (Fase C)                                     |
| P10 | Entrega                    | Auto-gerado (D22) só baixado/compartilhado, ou também persistido/link público + arquivamento? (Fase D)                                          |
| P11 | Evento de auditoria        | Novo `FECHAMENTO_EXPORTED` vs. reutilizar `REPORT_EXPORTED`. (Fase D)                                                                           |
| P14 | Campos da `ClientBankAccount` | Quais dados da conta: agência, conta + dígito, tipo, titular, PIX? — campo a campo. (Fase 0)                                                 |

**Resolvidas**: P1→D12/D13 · P3→D20 · P4→D17/18/19 · P5→D21 · P9→D22/D23 · P12→D11 · P13→D14 · banco→D24 · P15(armazéns)→D26.

---

## Roadmap proposto (fases — cada uma com plano e aprovação próprios)

> Implementação **campo a campo** (D7). A Fase 0 (cadastro) é pré-requisito do que o contrato referencia.

- **Fase 0 — Extensões do cadastro de Cliente (pré-requisitos).** **Só o bancário** (D24): tabela `Bank`
  (`id` Int, nome, status; cadastrável) + `ClientBankAccount` por cliente (FK `Bank` + dados da conta —
  P14), no padrão `ClientUnit`; UI nova no cadastro de Cliente. **Armazém não entra** (D26: já existe).
  **Anexos do cliente (D27)** entram como extensão de cadastro, mas são **independentes do contrato** (não bloqueiam a Fase B). Futuras idem. O **bancário precede a Fase B** no que o contrato consome.
- **Fase A — Emissor + corretor.** Promover `COMPANY_INFO` a módulo compartilhado + **CNPJ** (P6).
  Reaproveitar o logo. Corretor = usuário `COMMERCIAL` (D13).
- **Fase B — Contrato no modal de Venda (campo a campo).** Criar a tabela `SaleContract` (D11) via
  **migration nova**; numeração `NNNN/AA` (D15) e status (D14); partes/banco/armazém com **snapshots**
  (D12/D13/D24/D25/D26); financeiros (D17/18/19); pagamento/logística com listas mistas (D20);
  observações (P7). Bump de `schemaVersion` + atualizar `sale-created.payload.schema.json` +
  `validate:schemas` + testes de contrato. Projetor escreve a `SaleContract`. UI com seções/abas no
  `SampleMovementModal.tsx`. **Só vendas novas (D21).**
- **Fase C — PDF do Fechamento.** `renderFechamentoPdf` espelhando o layout do contrato legado
  (cabeçalho → partes → armazéns → valores → pagamento → observações → assinaturas P8). **Sem qualidade** (D10).
- **Fase D — Geração + entrega.** Geração **automática ao salvar** (D22); pode gerar quem acessa a venda
  (D23); entrega via `shareOrDownloadFile`. Persistência/link/arquivamento + auditoria conforme P10/P11.

---

## Log de sessões

### 2026-06-24 — Sessão 1 (análise + frame)

- **Análise do estado atual** via 4 agentes: fluxo de venda, modelo de dados, infra de PDF e convenção
  de docs. Achado central: a venda não captura nada financeiro; comprador já tem **snapshot congelado**.
- **2 rodadas** → decisões **D1–D6** (+ princípio campo-a-campo, hoje D7). Criada a doc + índice
  `docs/README.md` (#7). Commit `34c4af4` (não pushado).

### 2026-06-24 — Sessão 2 (contrato legado + escopo)

- Print do **contrato legado** mapeado. **3ª rodada** → **D8** (replicar tudo), **D9** (campos no modal
  de Venda), **D10** (qualidade fora). Inventário de campos + roadmap; pendências P12/P13. Commit `a3d596b`.

### 2026-06-24 — Sessão 3 (arquitetura P12 + P1)

- **4ª rodada** → **D11** (`SaleContract` 1:1), **D12** (comprador/vendedor automáticos), **D13**
  (corretor = usuário `COMMERCIAL`). P1/P12 fechadas. Commit `cf5e4a3`.

### 2026-06-24 — Sessão 4 (status + numeração)

- **5ª rodada** → **D14** (status manual), **D15** (nº contrato automático `NNNN/AA`), **D16** (nº de
  compra livre). P13 fechada. Commit `ca667c5`.

### 2026-06-24 — Sessão 5 (modelo financeiro)

- **6ª rodada** → **D17** (quantidade = sacas; peso separado), **D18** (total automático ± ágio/deságio),
  **D19** (corretagem calculada). P4 fechada. Commit `e415d5c`.

### 2026-06-24 — Sessão 6 (bloco operacional)

- **7ª rodada** → **D20** (listas mistas), **D21** (só vendas novas), **D22** (geração automática ao
  salvar), **D23** (permissão ampla). P3/P5/P9 fechadas. Commit `58472c2`.

### 2026-06-24 — Sessão 7 (extensões de cadastro — bancário)

- Flavio sinalizou que o Fechamento exige **mudanças maiores**: o cadastro de Cliente ganha dados
  bancários (e mais virá). **8ª rodada** → **D24** (modelo bancário: `Bank` + `ClientBankAccount`) e
  **D25** (snapshot de dados de cliente). Nova seção "Impacto no sistema"; revisada a D20 (Banco saiu
  das listas); criadas P14/P15; adicionada a Fase 0. Commit `bd22fbf`.

### 2026-06-24 — Sessão 8 (armazéns já existem)

- Flavio apontou que o tipo de cliente (comprador/vendedor/**armazém**) já é multi-escolha. Verifiquei:
  flags `isBuyer/isSeller/isWarehouse` (`schema:548-550`) + lookup `kind='warehouse'` (`lib/types.ts:33`)
  já cobrem armazém. **D26**: "Armazém do Comprador/Vendedor" = cliente-armazém via lookup + snapshot,
  **sem entidade nova**. **P15 fechada**; a Fase 0 fica **só com o bancário**.
- **Próximo**: planejar a **Fase 0** (bancário: `Bank` + `ClientBankAccount` + campos P14) e/ou desenhar
  a `SaleContract` (Fase B).

### 2026-06-24 — Sessão 9 (anexos do cliente)

- Flavio quer **anexar arquivos ao cliente** (guardar os documentos). Verifiquei: há infra de upload
  (`SampleAttachment` + `local-upload-service`), mas **escopada em amostra e só-imagem**. **D27**:
  `ClientAttachment` (lista livre + descrição), reusando a infra; aceita **PDF + imagens** (após alerta
  de que Office só valida como ZIP genérico + risco de macro, Flavio optou por PDF+imagens); **só
  arquivamento** no cadastro (não entra no contrato), **independente da Fase B**.
- Implica adicionar `application/pdf` ao allowlist de upload + atualizar a **regra de segurança**
  (CLAUDE.md #5 + docs/SECURITY).
- **Próximo**: fechar **P14** (campos da `ClientBankAccount`) e desenhar `Bank` + `ClientBankAccount` +
  `ClientAttachment` + `SaleContract`.
