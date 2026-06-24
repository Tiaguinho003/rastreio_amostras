# Fechamento — Plano de Trabalho

**Status**: **EM CONSTRUÇÃO (planejamento)** — iniciado em 2026-06-24. Análise do estado atual concluída e **decisões D1–D13** travadas em 4 rodadas de perguntas. O alvo está definido: **recriar no app o "Contrato de Compra e Venda de Café"** do sistema legado (print recebido na Sessão 2). A **fundação de schema (`SaleContract`) e o modelo de partes já estão decididos.** **Nenhum código de feature ainda.** Próximo passo: implementar **um campo por vez**, a partir do inventário abaixo.
**Escopo**: documento único de organização, análise, decisões e execução da feature de **Fechamento** — a geração, **após uma venda**, de um **Contrato de Compra e Venda de Café** profissional em **PDF, para impressão**, que consolida os dados do negócio e serve de confirmação para comprador e vendedor.

**Como ler este doc**: a seção **Decisões fechadas** é o que está acordado; **Contrato legado — inventário de campos** é o alvo do v1; **Pendências** é o que ainda não foi decidido; **Roadmap** é o desenho corrente em fases (muda conforme as decisões); **Log de sessões** é o histórico de avanços por data.

**Princípio**: construído colaborativamente em formato pergunta → resposta → registro, e implementado **um campo por vez**. A implementação de cada bloco só começa depois que as decisões dele estiverem fechadas. Este doc **referencia** o código em vez de duplicar dados que mudam.

---

## Contexto

A empresa precisa que, **logo após registrar uma venda**, o sistema produza um documento chamado
**"Fechamento"** — na prática, o **Contrato de Compra e Venda de Café** que ela já emite hoje em um
sistema legado (ver o inventário de campos abaixo). É um documento importante e deve ser profissional
e correto: serve como **confirmação para o comprador e para o vendedor** e tem **valor de contrato
formal**, com **corretagem dos dois lados** (modelo de corretora).

Hoje **não existe** nada parecido no app, e — ponto crítico — a venda **não captura nenhum dado
financeiro nem contratual** (preço, valor, pagamento, partes além do comprador, etc.). Como o
Fechamento replica o contrato legado, a feature necessariamente **estende a ação de venda** além de
gerar o PDF.

A construção é deliberadamente **incremental e campo a campo**: primeiro esta documentação de
acompanhamento, depois o código por fases, ajustando cada campo conforme avançamos. A especificação
funcional de vendas/movimentações que ancora este trabalho está em
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
- **Nenhum dado financeiro/contratual existe** — nem coluna em `sample_movement`, nem no payload do
  evento, nem no formulário.
- Um lote pode ter **várias vendas parciais**; cada uma é um `SampleMovement` próprio → o Fechamento
  **por venda** (D3) encaixa 1:1 com o movimento.
- O **event store é append-only** (triggers impedem UPDATE/DELETE — skill `prisma`). Campos novos
  exigem migration nova + bump de `schemaVersion` no payload, nunca editar o existente.

### Partes já disponíveis (comprador e vendedor)

- **Comprador**: a venda já grava um **snapshot congelado** do Cliente via `buildBuyerSnapshot`
  (`sample-command-service.js`) em `SampleMovement.buyerClientSnapshot` (nome/razão, CPF/CNPJ, IE,
  endereço, cidade/UF, telefone, e-mail). **Reutilizável** no PDF.
- **Vendedor/produtor**: dono do lote — `Sample.ownerClientId` (resolve o `Client`) e/ou
  `Sample.declaredOwner`. Mapeado como Vendedor automático (D12).
- **Corretor / armazéns / banco**: há `User` com papel `COMMERCIAL` (corretor — D13), `Client.isWarehouse`,
  `Client.isSeller`, `Client.isBuyer` e `ClientUnit` (fazendas/filiais de PF) — material para
  armazéns e bancos, mas **nada disso é capturado na venda hoje**.

### Geração de PDF e emissor

- Só **`pdf-lib`** está instalado (sem HTML→PDF). Usado em **um único lugar**: o laudo
  (`src/reports/sample-pdf-report-service.js`) — `renderSamplePdf` (A4, cabeçalho verde + logo +
  rodapé) e a classe `SamplePdfReportService`. É o **molde** do Fechamento (D6).
- **Emissor**: constante `COMPANY_INFO` em `src/reports/sample-pdf-report-service.js:27-31` (nome
  "Safras & Negócios", cidade/UF, telefone, endereço) — **falta CNPJ**. Logo já entra como bitmap no
  cabeçalho (reutilizável).
- **Entrega**: download/compartilhar via `lib/share-blob.ts` + `lib/api-client.ts:1113` + rota
  `app/api/v1/samples/[sampleId]/export/pdf/route.ts`. Infra de **link público com token/QR**
  (`app/laudo/[token]/route.ts` + `SampleReportShare`) disponível se necessário.
- Auditoria de export hoje usa o evento `REPORT_EXPORTED`.

---

## Decisões fechadas

| #   | Decisão                                    | Detalhe                                                                                                                                                            |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Natureza **híbrida**                       | Contrato de Fechamento: dados estruturados + cláusulas/observações fixas + **assinaturas**. Sem prosa jurídica extensa.                                            |
| D2  | Destinatários                              | Confirmação ao **comprador** e ao **vendedor**, com valor de **contrato formal** entre as partes.                                                                  |
| D3  | Granularidade **por venda**                | Cada venda (movimento `SALE`) gera um Fechamento, chaveado pelo `movementId`.                                                                                       |
| D4  | Financeiro **na venda (obrigatório)**      | Os dados passam a ser capturados no modal de Venda; o núcleo financeiro é exigido. Obrigatoriedade dos demais campos definida caso a caso.                          |
| D5  | Emissor com **dados fixos**                | Cabeçalho com nome/CNPJ/logo da empresa/corretora, fixos (não escolhidos por venda).                                                                               |
| D6  | PDF via **`pdf-lib`**                       | Clonando o pipeline do laudo (`sample-pdf-report-service.js`); **sem dependência nova**. Reaproveita cabeçalho/logo/rodapé e a infra de entrega.                    |
| D7  | Construção **campo a campo**               | Os campos são detalhados e implementados um a um; este doc é o backlog vivo.                                                                                        |
| D8  | **Replicar o contrato legado por inteiro** | O v1 espelha o "Contrato de Compra e Venda de Café": ágio/deságio, corretagem dos 2 lados (%/R$), armazéns, banco do vendedor, modalidade, sacaria, datas, status. |
| D9  | **Campos no modal de Venda**               | O `SampleMovementModal.tsx` vira o formulário do contrato (mantém D4). UI precisará de seções/abas dado o volume (~25 campos).                                      |
| D10 | **Qualidade do café NÃO entra**            | Documento puramente comercial; classificação (peneiras/defeitos/bebida) fica só no laudo. Não há bloco de qualidade no PDF do Fechamento.                           |
| D11 | **Persistência: tabela `SaleContract`**    | Tabela dedicada 1:1 com o movimento `SALE` (FK `movementId`), colunas tipadas, escrita pelo projetor. Mantém `sample_movement` enxuto e abriga nº/status do contrato. |
| D12 | **Comprador/Vendedor automáticos**         | Comprador = comprador da venda; Vendedor = dono do lote (`ownerClient`). Pré-preenchidos e **editáveis**; com snapshot congelado no fechamento (como o do comprador). |
| D13 | **Corretor = usuário `COMMERCIAL`**        | Um usuário (papel `COMMERCIAL`) é o corretor responsável, figura no contrato e assina. Snapshot do nome no fechamento. Corretor **único** (não múltiplos).          |

---

## Contrato legado — inventário de campos (alvo do v1)

Fonte: print do "Contrato de Compra e Venda de Café" (Sessão 2). É o **backlog campo a campo**.
Marcadores: ✅ existe no app · ⚠️ novo (não há hoje) · ❓ esclarecer.

### Cabeçalho / identificação
- ⚠️ **Número do Contrato** — sequencial `NNNN/AA` (ex.: `3295/26`). Precisa de gerador (P7).
- ⚠️ **Status do Contrato** — dropdown; sugere um lifecycle (P13).
- ✅ **Data do Contrato** — ≈ `movementDate`.
- ❓ **Número de Compra** — referência da perna de "compra"? A esclarecer (P7).
- ⚠️ **Mês / Ano** — deriváveis da data do contrato.
- ✅ **Número do Lote** — `internalLotNumber`.

### Partes
- ✅ **Comprador** — comprador da venda (`buyerClient` + snapshot), automático (D12).
- ✅ **Vendedor** — dono do lote (`ownerClient`), automático e editável; snapshot no fechamento (D12).
- ⚠️ **Corretor** — usuário `COMMERCIAL` responsável; figura e assina (D13).
- ⚠️ **Banco do Vendedor** — dropdown (lista de bancos — P3).

### Armazéns
- ⚠️ **Armazém do Comprador** · ⚠️ **Armazém do Vendedor** — reaproveitar `Client.isWarehouse` + `ClientUnit`.

### Quantidade & valores
- ⚠️ **Quantidade** — decimal no legado vs. **sacas inteiras** no app (P4).
- ⚠️ **Preço por Saca** (R$) · ⚠️ **Peso (Kg)**.
- ⚠️ **Ágio / Deságio** — tipo (dropdown) + **Vlr** alternando **% / R$**.
- ⚠️ **Corretagem do Vendedor** (% / R$) · ⚠️ **Corretagem do Comprador** (% / R$).
- _Valor total_ — provavelmente calculado (fórmula a definir — P4).

### Pagamento & logística
- ⚠️ **Condição de Pagamento** · ⚠️ **Modalidade** · ⚠️ **Sacaria** · ⚠️ **Forma de Pagamento** (dropdowns — P3).
- ⚠️ **Data Faturamento** · ⚠️ **Data Pagamento**.

### Assinaturas & observações
- ❓ **Assinatura do Corretor** — opção `Em Branco / 1 / 2 / 3 / 4` (significado a esclarecer — P8).
- ⚠️ **3 blocos de texto**: Observações · Descrição · Observações (Pág. 2) — hoje só existe `notes` (P7).

---

## Pendências (a detalhar antes de implementar cada campo/bloco)

| #   | Pendência                  | O que falta decidir                                                                                                                            |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | ✅ Resolvida → D12/D13      | Comprador/Vendedor automáticos do lote/venda (editáveis); Corretor = usuário `COMMERCIAL`. Resta a representação da **assinatura** no PDF (P8). |
| P2  | Comportamento por campo    | Para cada item do inventário: origem (auto/manual), obrigatoriedade, validação, valores possíveis.                                             |
| P3  | Domínios de listas         | Modalidade, Sacaria, Condição/Forma de Pagamento, Banco do Vendedor — listas fixas vs. cadastráveis.                                            |
| P4  | Modelo de dinheiro         | Precisão (sugestão `Decimal(12,2)`); Quantidade decimal vs. sacas inteiras; total calculado; fórmulas de ágio/deságio e corretagem (% e R$).    |
| P5  | Vendas já existentes       | Sem dados de contrato: só-novas vs. permitir editar/backfill (lembrar append-only).                                                            |
| P6  | Home dos dados do emissor  | Promover `COMPANY_INFO` a módulo compartilhado vs. tabela de settings editável; onde o CNPJ passa a viver.                                      |
| P7  | Numeração & observações    | Gerador do Número de Contrato `NNNN/AA` (+ Mês/Ano); o que é "Número de Compra"; os 3 blocos de texto + eventuais cláusulas fixas.              |
| P8  | Assinaturas                | Quem assina e o significado de "Assinatura do Corretor (Em Branco/1/2/3/4)"; como os blocos aparecem no PDF.                                     |
| P9  | Gatilho + permissão        | Gerar sob demanda (botão) vs. ao salvar a venda; quais papéis podem gerar.                                                                      |
| P10 | Entrega                    | Só download/compartilhar, ou também link público/QR + arquivamento dos bytes (como o laudo via `SampleReportShare`).                            |
| P11 | Evento de auditoria        | Novo `FECHAMENTO_EXPORTED` vs. reutilizar `REPORT_EXPORTED`.                                                                                    |
| P12 | ✅ Resolvida → D11          | Tabela dedicada `SaleContract` 1:1 com o movimento `SALE`, colunas tipadas, escrita pelo projetor.                                              |
| P13 | Status do Contrato         | Enum/lifecycle e transições válidas (alimenta o campo "Status do Contrato").                                                                    |

---

## Roadmap proposto (fases — cada uma com plano e aprovação próprios)

> Implementação **campo a campo** (D7). As fases A–D são a infraestrutura; cada campo do inventário
> é incorporado incrementalmente, do schema ao PDF.

- **Fase A — Emissor + corretor.** Promover `COMPANY_INFO` (`sample-pdf-report-service.js:27-31`) a
  módulo compartilhado e estendê-lo com **CNPJ** (e o que o cabeçalho exigir). Reaproveitar o logo.
  Corretor = usuário `COMMERCIAL` (D13).
- **Fase B — Contrato no modal de Venda (campo a campo).** Criar a tabela `SaleContract` (D11) via
  **migration nova**; numeração `NNNN/AA` (P7) e status (P13); partes com snapshot de vendedor e
  corretor (D12/D13); financeiros (P4); pagamento/logística (P3); observações. Bump de `schemaVersion`
  + atualizar `docs/schemas/events/v1/payloads/sale-created.payload.schema.json` +
  `npm run validate:schemas` + testes de contrato. Normalizers/validação em `createSampleMovement` +
  projetor escreve a `SaleContract`. UI com seções/abas + validação inline no `SampleMovementModal.tsx`
  (skills `feedback-messages`/`design-system`/`responsive`).
- **Fase C — PDF do Fechamento.** `renderFechamentoPdf` + serviço espelhando `SamplePdfReportService`,
  reusando cabeçalho/logo/rodapé, **espelhando o layout do contrato legado** (cabeçalho → partes →
  armazéns → valores → pagamento → observações → assinaturas). **Sem bloco de qualidade** (D10).
- **Fase D — Ação/UX + entrega.** Botão "Gerar Fechamento" por venda no painel de movimentações, via
  `shareOrDownloadFile`. Link público/QR + arquivamento opcionais (P10); evento de auditoria (P11).

---

## Log de sessões

### 2026-06-24 — Sessão 1 (análise + frame)

- **Análise do estado atual** via 4 agentes em paralelo: fluxo de venda, modelo de dados, infra de
  PDF/impressão e convenção de docs. Achado central: **a venda não captura nada financeiro** e o
  comprador já vem com **snapshot congelado**.
- **2 rodadas de perguntas** → decisões **D1–D6** (e o princípio campo-a-campo, hoje D7). Partes/campos
  exatos ficaram deferidos → pendências P1–P11.
- **Caminho do PDF** decidido: clonar o pipeline `pdf-lib` do laudo (sem dependência nova). Emissor
  reaproveita `COMPANY_INFO` (falta só o CNPJ).
- **Criada esta doc** e registrada em `docs/README.md` (#7). Nenhum código de feature tocado. Commit
  `34c4af4` (não pushado).

### 2026-06-24 — Sessão 2 (contrato legado + escopo)

- Flavio enviou o **print do contrato legado** ("Contrato de Compra e Venda de Café"). Mapeei todos os
  campos contra o app (ver inventário).
- **3ª rodada de perguntas** → novas decisões **D8** (replicar tudo), **D9** (campos no modal de
  Venda), **D10** (qualidade **fora** do Fechamento). Partes (P1) seguiam deferidas.
- Doc atualizada com o **inventário de campos** (backlog) e o **roadmap revisado** (qualidade removida;
  Fase B = contrato completo no modal de Venda). Novas pendências de design: **P12** (persistência dos
  campos) e **P13** (status do contrato). Commit `a3d596b` (não pushado).

### 2026-06-24 — Sessão 3 (decisões arquiteturais P12 + P1)

- **4ª rodada de perguntas** → fundação resolvida: **D11** (persistência em tabela dedicada
  `SaleContract`, 1:1 com o movimento `SALE`), **D12** (Comprador/Vendedor automáticos do lote/venda,
  editáveis) e **D13** (Corretor = usuário `COMMERCIAL`, único, que assina). P1 e P12 fechadas.
- **Implicações p/ a Fase B**: além do `buyerClientSnapshot`, congelar no fechamento também o snapshot
  do **vendedor** (`ownerClient`) e do **corretor** (usuário); a `SaleContract` é escrita pelo projetor
  no `SALE_CREATED`.
- **Próximo**: desenhar a `SaleContract` (colunas a partir do inventário) resolvendo, em paralelo, **P13**
  (status) e **P7** (nº de contrato `NNNN/AA`) — o esqueleto da Fase B.
