# Fechamento — Plano de Trabalho

**Status**: **EM CONSTRUÇÃO (planejamento)** — iniciado em 2026-06-24. Análise do estado atual concluída e **decisões D1–D7** travadas em 2 rodadas de perguntas. **Nenhum código de feature ainda.** Próximo passo: detalhar as pendências (partes, campos do documento, pagamento) e então iniciar a Fase A/B.
**Escopo**: documento único de organização, análise, decisões e execução da feature de **Fechamento** — a geração, **após uma venda**, de um documento profissional (nota/contrato em **PDF, para impressão**) que consolida os dados do negócio e serve de confirmação para comprador e vendedor.

**Como ler este doc**: a seção **Decisões fechadas** é o que está acordado; **Pendências** é o que ainda não foi decidido; **Roadmap** é o desenho corrente em fases (muda conforme as decisões); **Log de sessões** é o histórico de avanços por data.

**Princípio**: construído colaborativamente em formato pergunta → resposta → registro. A implementação de cada fase só começa depois que as decisões daquele bloco estiverem fechadas. Este doc **referencia** o código em vez de duplicar dados que mudam.

---

## Contexto

A empresa precisa que, **logo após registrar uma venda**, o sistema produza um documento chamado
**"Fechamento"** — uma nota/contrato que consolida as informações do negócio e é **impressa (gerada
em PDF)**. É um documento importante e deve ser profissional e correto: serve como **confirmação
para o comprador e para o vendedor** e tem **valor de contrato formal** (decisões da 1ª rodada).

Hoje **não existe** nada parecido no sistema, e — ponto crítico — a venda **não captura nenhum dado
financeiro** (preço, valor, moeda, pagamento). Como o Fechamento precisa desses valores, a feature
necessariamente **estende a ação de venda** além de gerar o PDF.

A construção é deliberadamente **incremental**: primeiro este documento de acompanhamento, depois o
código por fases, ajustando os campos exatos do Fechamento conforme avançamos. A especificação
funcional de vendas/movimentações comerciais que ancora este trabalho está em
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
- **Captura hoje apenas**: comprador (Cliente vinculado, obrigatório), sacas (qtd), data
  (`movementDate`), observações (opcional). Validação por normalizers manuais (sem zod).
- **Nenhum dado financeiro existe em lugar nenhum** — nem coluna em `sample_movement`, nem no
  payload do evento, nem no formulário. Preço/saca, valor total, moeda e pagamento estão ausentes.
- Um lote pode ter **várias vendas parciais** (compradores/datas diferentes); cada uma é um
  `SampleMovement` próprio. Por isso o Fechamento **por venda** (D3) encaixa 1:1 com o movimento.
- O **event store é append-only** (triggers impedem UPDATE/DELETE — skill `prisma`). Adicionar
  campos à venda exige migration nova + bump de `schemaVersion` no payload, nunca editar o existente.

### Partes já disponíveis (comprador e vendedor)

- **Comprador**: no momento da venda já se grava um **snapshot congelado** completo do Cliente via
  `buildBuyerSnapshot` (`sample-command-service.js`) em `SampleMovement.buyerClientSnapshot` — nome/razão,
  CPF/CNPJ, IE (`registrationNumber`), endereço, cidade/UF, telefone, e-mail. **Reutilizável** no PDF
  sem busca extra, e imune a edições posteriores do cadastro.
- **Vendedor/produtor**: é o dono do lote — `Sample.ownerClientId` (resolve o `Client`) e/ou o texto
  `Sample.declaredOwner`. **Quem exatamente figura como "vendedor" depende do modelo de partes
  (P1).**

### Qualidade do café

- Disponível em `Sample.latestClassificationData` (peneiras, fundos, defeitos — imp/pva/broca/gpi/ap,
  bebida, padrão, aspecto, catação, certificação, observações) + campos técnicos cacheados
  (`latestType`, `latestScreen`, `latestDefectsCount`, `latestDensity`). É a **mesma fonte** que o
  laudo usa (`src/reports/export-fields.js`).

### Geração de PDF e emissor

- Só **`pdf-lib`** está instalado (sem HTML→PDF). É usado em **um único lugar**: o laudo
  (`src/reports/sample-pdf-report-service.js`) — `renderSamplePdf` (layout A4, cabeçalho verde + logo
  + rodapé) e a classe `SamplePdfReportService`. É o **molde** do Fechamento (D6).
- **Emissor**: constante `COMPANY_INFO` em `src/reports/sample-pdf-report-service.js:27-31` — nome
  ("Safras & Negócios", hoje hardcoded na string do rodapé), cidade/UF, telefone, endereço.
  **Falta CNPJ.** O **logo** já entra como bitmap no cabeçalho do laudo (reutilizável).
- **Entrega**: download/compartilhar via `lib/share-blob.ts` + `lib/api-client.ts:1113` + rota
  `app/api/v1/samples/[sampleId]/export/pdf/route.ts` (stream `application/pdf`). Há também a infra de
  **link público com token/QR** (`app/laudo/[token]/route.ts` + tabela `SampleReportShare`,
  congelamento em `UPLOADS_DIR`, expiração/revogação) — disponível se o Fechamento precisar.
- Auditoria de export hoje usa o evento `REPORT_EXPORTED`.

---

## Decisões fechadas

| #   | Decisão                       | Detalhe                                                                                                                                                            |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Natureza **híbrida**          | Nota/contrato de **Fechamento**: dados estruturados + algumas **cláusulas/observações fixas** + **assinaturas**. Sem prosa jurídica extensa.                        |
| D2  | Destinatários                 | Confirmação ao **comprador** e ao **vendedor**, com valor de **contrato formal** entre as partes.                                                                  |
| D3  | Granularidade **por venda**   | Cada venda (movimento `SALE`) gera um Fechamento, chaveado pelo `movementId`.                                                                                       |
| D4  | Financeiro **na venda (obrigatório)** | Preço/valor/pagamento passam a ser **capturados e exigidos** no modal de Venda; toda venda nova nasce com esses dados.                                       |
| D5  | Emissor com **dados fixos**   | Cabeçalho com nome/CNPJ/logo da empresa/corretora, configurados de forma fixa (não escolhidos por venda).                                                          |
| D6  | PDF via **`pdf-lib`**         | Clonando o pipeline do laudo (`sample-pdf-report-service.js`); **sem dependência nova**. Reaproveita cabeçalho/logo/rodapé e a infra de entrega.                    |
| D7  | Campos/partes **deferidos**   | O modelo de partes (corretora vs. empresa-vendedora) e o conteúdo campo a campo serão detalhados na montagem da doc — viram as pendências abaixo.                   |

---

## Pendências (a detalhar antes de implementar cada fase)

| #   | Pendência                  | O que falta decidir                                                                                                                            |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Partes/modelo              | Corretora (3 partes; vendedor = produtor/dono do lote) vs. empresa-vendedora vs. depende da venda. Define quem é "vendedor" no documento.       |
| P2  | Campos exatos              | Conteúdo de cada bloco: cabeçalho, vendedor, comprador, café/qualidade, quantidade, valores, pagamento, observações/cláusulas, assinaturas.     |
| P3  | Estrutura do pagamento     | À vista/prazo/parcelas, vencimentos; estruturado vs. texto livre; impostos/funrural/frete/descontos.                                            |
| P4  | Representação do dinheiro  | Preço/saca e/ou valor total; total automático (preço×sacas) vs. digitado; moeda; precisão (sugestão: `Decimal(12,2)`, consistente com o schema).|
| P5  | Vendas já existentes       | Sem dados financeiros: só-novas vs. permitir editar/backfill (lembrar do append-only ao desenhar a edição).                                     |
| P6  | Home dos dados do emissor  | Promover `COMPANY_INFO` a módulo compartilhado vs. tabela de settings editável por ADMIN. Onde o CNPJ e demais campos passam a viver.           |
| P7  | Cláusulas + numeração      | Texto das cláusulas/observações fixas (híbrido) e se existe **número de Fechamento sequencial**.                                               |
| P8  | Assinaturas                | Quais partes assinam e como os blocos de assinatura aparecem no PDF.                                                                            |
| P9  | Gatilho + permissão        | Botão sob demanda vs. geração automática ao salvar a venda; quais papéis podem gerar.                                                           |
| P10 | Entrega                    | Só download/compartilhar, ou também link público/QR + arquivamento dos bytes (como o laudo via `SampleReportShare`).                            |
| P11 | Evento de auditoria        | Novo `FECHAMENTO_EXPORTED` vs. reutilizar `REPORT_EXPORTED`.                                                                                    |

---

## Roadmap proposto (fases — cada uma com plano e aprovação próprios)

> O conteúdo do documento (Fase E) é iterativo e atravessa as demais fases; as fases A–D são a
> infraestrutura. A ordem prática é A + B (pré-requisitos) → C → D, com E refinando ao longo.

- **Fase A — Emissor.** Promover `COMPANY_INFO` (`sample-pdf-report-service.js:27-31`) para um módulo
  compartilhado e estendê-lo com **CNPJ** (e o que o cabeçalho do Fechamento exigir). Reaproveitar o
  logo do laudo. Modelo editável in-app só se decidido em P6.
- **Fase B — Dados financeiros na venda (obrigatórios).** Novas colunas em `sample_movement` (P4) via
  **migration nova**; bump de `schemaVersion` + atualizar
  `docs/schemas/events/v1/payloads/sale-created.payload.schema.json` + `npm run validate:schemas` +
  testes de contrato. Normalizers/validação em `createSampleMovement`. Campos + validação inline no
  `SampleMovementModal.tsx` (skills `feedback-messages`/`design-system`/`responsive`).
- **Fase C — Geração do PDF.** `renderFechamentoPdf` + serviço espelhando `SamplePdfReportService`,
  reusando cabeçalho/logo/rodapé. Blocos: emissor → partes (vendedor/comprador) → café/qualidade →
  quantidade/valores/pagamento → cláusulas/observações fixas → assinaturas.
- **Fase D — Ação/UX + entrega.** Botão "Gerar Fechamento" por venda no painel de movimentações, via
  `shareOrDownloadFile`. Link público/QR + arquivamento opcionais (P10); evento de auditoria (P11).
- **Fase E — Conteúdo do documento (iterativo).** O "ajustar os campos depois": modelo de partes,
  campos de cada bloco, cláusulas, assinaturas, layout. Onde mora o grosso da iteração.

---

## Log de sessões

### 2026-06-24 — Sessão 1 (análise + frame)

- **Análise do estado atual** via 4 agentes em paralelo: fluxo de venda, modelo de dados, infra de
  PDF/impressão e convenção de docs. Achado central: **a venda não captura nada financeiro** e o
  comprador já vem com **snapshot congelado** — bom ponto de partida.
- **2 rodadas de perguntas** → decisões **D1–D7** travadas. Partes/campos exatos ficaram **deferidos**
  por escolha do Flavio ("ajustar os campos do documento depois") → viram as pendências **P1–P11**.
- **Caminho do PDF** decidido: clonar o pipeline `pdf-lib` do laudo (sem dependência nova). Emissor
  reaproveita `COMPANY_INFO` (falta só o CNPJ).
- **Criada esta doc** e registrada em `docs/README.md`. Nenhum código de feature tocado.
- **Próximo**: detalhar P1 (partes) e P2/P4 (campos + dinheiro) para destravar as Fases A/B.
