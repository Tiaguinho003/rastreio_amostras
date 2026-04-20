# Liga de Lotes - Especificacao (DRAFT)

Status: Em elaboracao (discussao aberta)
Escopo: especificacao funcional e tecnica da funcionalidade "Liga" - processo de combinar dois ou mais lotes de cafe para gerar um novo lote
Ultima revisao: 2026-04-19
Documentos relacionados: `docs/Produto-e-Fluxos.md`, `docs/Arquitetura-Tecnica.md`, `docs/Clientes-e-Movimentacoes-Especificacao.md`

> **Aviso**: documento em construcao. Nenhuma decisao aqui e final ate a secao "Regras fechadas" ser aprovada. Nao iniciar implementacao ate alinhamento completo.

## Contexto

Hoje o sistema modela cada amostra (`Sample`) como um lote fisico indivisivel, identificado por `internalLotNumber`, com classificacao propria, status comercial proprio e controle de sacas (declaredSacks, soldSacks, lostSacks). A realidade operacional da corretora inclui tambem a criacao de "ligas" - combinacao de dois ou mais lotes em um novo lote comercializavel, com caracteristicas proprias. Este documento formaliza como essa operacao sera representada no sistema.

## Objetivo

1. Permitir criar uma nova amostra a partir da combinacao de N amostras de origem, preservando rastreabilidade completa.
2. Manter a integridade do event store e das amostras existentes (append-only, zero impacto nos dados de producao).
3. Definir regras de elegibilidade, inventario, classificacao, comercial e permissoes para a operacao de liga.

## Conceitos (a definir)

1. `Liga` (working name) - operacao que consome sacas de N lotes de origem e gera um novo lote (nova `Sample`).
2. `Lote de origem` - cada amostra que contribui com sacas para a liga.
3. `Lote resultante` - a nova amostra gerada pela liga.
4. `Composicao` - mapeamento (lote de origem, sacas contribuidas) que descreve a liga.

## Perguntas em aberto (a responder antes de fechar a spec)

### Bloco 1 - Natureza fisica e ciclo de vida [FECHADO 2026-04-19]

- [x] Uma liga pode combinar **quantos** lotes? **Sem limite** (N lotes de origem).
- [x] A contribuicao de cada lote e em sacas inteiras ou fracionada? **Ambas** - permitir sacas inteiras e fracionadas (kg ou fracao de saca).
- [x] O lote de origem continua existindo apos a liga? **Sim**, continua existindo com saldo reduzido (nao e consumido integralmente por default).
- [x] A liga pode ser desfeita/revertida? **Sim** (condicoes a detalhar no Bloco 3/5 - restricoes relacionadas a status comercial e movimentacoes ja registradas no lote resultante).
- [x] Uma liga pode ser insumo de outra liga (cascata recursiva)? **Sim** - precisamos preservar arvore completa de origens para rastreabilidade.

**Implicacoes derivadas (a validar nos proximos blocos):**

1. Como a contribuicao e fracionada, o modelo precisa armazenar `contributed_quantity` em unidade compativel com fracoes (ex: `Decimal` em kg, ou `Decimal` sacas com escala). Precisamos decidir a **unidade canonica** de inventario (kg? saca com decimais?).
2. Como o lote de origem sobrevive, `Sample.declaredSacks` dele nao muda - precisamos de um conceito de **saldo disponivel** (`availableSacks` ou view computada = declaredSacks - soldSacks - lostSacks - blendedSacks).
3. Como a liga e reversivel, precisamos de **evento de reversao** no event store e definir estado da liga revertida (invalidada? volta para origens?).
4. Como ha cascata, queries de rastreabilidade precisam ser **recursivas** (CTE recursiva no Postgres) - considerar indice/performance desde ja.

### Bloco 2 - Classificacao [PARCIAL 2026-04-19]

- [x] Apenas lotes ja **classificados** podem ser ligados, ou qualquer status serve? **Apenas lotes classificados** (status `CLASSIFIED`).
- [x] O lote resultante **herda** classificacao ou precisa de nova? **Ambas** - sistema calcula classificacao **prevista** (media ponderada dos lotes de origem) via script, e posteriormente a liga e classificada fisicamente com ficha propria (foto + analise) para validar/ajustar a previsao.
- [ ] Se precisa de classificacao nova: a ficha do lote resultante e gerada do zero ou pre-preenchida a partir das origens? **A decidir** (ver sub-perguntas abaixo).
- [x] O `classificationType` dos lotes de origem precisa ser o mesmo? **Nao** - pode misturar PREPARADO + BICA + LOW_CAFF numa mesma liga.

**Decisoes derivadas / implicacoes:**

1. **Classificacao prevista (calculada):**
   - Gerada automaticamente no momento da criacao da liga, a partir dos lotes de origem, ponderada por `contributed_quantity`.
   - Persistida no lote resultante em campo separado (ex: `predicted_classification_data: Json`) - **nao sobrescreve** a classificacao oficial.
   - Serve como referencia visual e pode ser comparada depois com a classificacao real para identificar divergencias.
2. **Classificacao oficial da liga:**
   - O lote resultante entra no mesmo fluxo de classificacao das amostras normais (status inicial apos criacao: `QR_PENDING_PRINT` ou `CLASSIFICATION_IN_PROGRESS`?).
   - Foto da ficha > extracao AI > ficha validada > `latestClassificationData` preenchido normalmente.
3. **`classificationType` do lote resultante:**
   - Como pode misturar tipos, o campo pode ficar nulo ate a classificacao oficial, ou usamos o tipo "dominante" (maior contribuicao), ou criamos um valor novo? **A decidir.**

**Sub-perguntas abertas (criticas para o bloco fechar):**

- [ ] **Campos numericos** (P.18%, umidade, defeitos, broca, PVA, impureza, densidade) sao ponderados por `contributed_quantity` e a media e persistida. OK?
- [ ] **Campos qualitativos/texto** (Padrao, Bebida, Aspecto, Cor): como agregar? Opcoes: (a) escolher o "pior" caso; (b) do lote de maior contribuicao; (c) deixar em branco na previsao e so ter valor apos classificacao oficial; (d) concatenar (ex: "Bebida Dura / Rio").
- [ ] `classificationType` do lote resultante: (a) campo nulo ate classificacao oficial; (b) tipo dominante automatico; (c) usuario escolhe no momento da criacao da liga; (d) novo valor `MIXED`?
- [ ] A classificacao prevista e **visivel** pro classificador quando ele for classificar a liga oficialmente (como sugestao) ou fica escondida ate terminar a classificacao real (para nao enviesar)?
- [ ] `latestClassificationVersion` e `classifiedAt` do lote resultante ficam nulos ate a classificacao oficial acontecer? (provavelmente sim)

### Bloco 3 - Comercial

- [ ] A liga e vendida como **unidade unica** (novo `ownerClient`) ou ainda rastreia venda proporcional aos donos originais?
- [ ] Se os lotes de origem pertencem a **clientes diferentes**, quem e o dono do lote resultante? (corretora? cliente "dominante"? cliente novo?)
- [ ] Venda/perda da liga **abate saldo** dos lotes de origem (retroativamente) ou sao contas independentes?
- [ ] Lotes com saldo **comercial_status != OPEN** (ja vendidos parcialmente) podem entrar numa liga?

### Bloco 4 - Inventario e identificacao

- [ ] O lote resultante recebe um **novo `internalLotNumber`**? Com qual padrao? (prefixo "L-", sequencia propria?)
- [ ] O lote resultante gera **nova etiqueta QR** (print de 2 etiquetas, igual registro?)
- [ ] O `declaredSacks` do lote resultante e a **soma** das contribuicoes?
- [ ] Sobra de sacas no lote de origem continua vendivel normalmente?

### Bloco 5 - Elegibilidade

- [ ] Restricao por **mesmo cliente** (so posso ligar lotes do mesmo dono)?
- [ ] Restricao por **mesma safra** (`declaredHarvest`)?
- [ ] Restricao por **localizacao** (mesmo armazem)?
- [ ] Lote `INVALIDATED` pode ser insumo? (provavelmente nao)
- [ ] Lote com `soldSacks > 0` pode ser insumo? Se sim, usa saldo disponivel?

### Bloco 6 - Permissoes e UI

- [ ] Qual role cria liga? (ADMIN, CLASSIFIER, novo role `BLENDER`?)
- [ ] Qual role apenas visualiza?
- [ ] Onde vive a UI? (nova aba no menu, dentro da listagem de amostras, modal?)
- [ ] Fluxo UX: selecionar lotes > informar sacas > preview > confirmar?

### Bloco 7 - Dashboard e relatorios

- [ ] Liga aparece no dashboard como amostra normal ou tem secao propria?
- [ ] Metricas novas: volume total ligado, numero de ligas criadas, taxa de uso de ligas?
- [ ] Relatorio de rastreabilidade (ver origens de uma liga, ver onde um lote foi usado)?

### Bloco 8 - Migration e compatibilidade

- [ ] Migration estritamente **aditiva** - nenhuma tabela/coluna existente alterada de forma destrutiva.
- [ ] Novas tabelas candidatas: `sample_blend`, `sample_blend_component`.
- [ ] Novos campos candidatos em `Sample`: `isBlend: boolean`, `blendId: uuid?` (ou manter so na tabela filha para nao poluir).
- [ ] Novos event types em `SampleEventType`: `BLEND_CREATED`, `BLEND_COMPONENT_CONSUMED`, `BLEND_REVERTED`?
- [ ] Dados de producao existentes: zero impacto (colunas novas com NULL default, sem backfill).

## Regras fechadas de negocio

_(a preencher conforme os blocos acima forem respondidos)_

## Modelo de dados proposto

_(a preencher apos Blocos 1, 4, 5 e 8)_

## Eventos e auditoria

_(a preencher apos Blocos 1 e 8)_

## API e contratos

_(a preencher apos fechamento das regras de negocio)_

## Telas e fluxos

_(a preencher apos Bloco 6)_

## Plano de implementacao

_(a preencher no final - fases, ordem de execucao, migrations, testes)_

## Riscos e trade-offs

_(a preencher conforme decisoes)_
