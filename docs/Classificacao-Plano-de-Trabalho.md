# Classificação — Plano de Trabalho

**Status**: Em construção (iniciado em 2026-05-25, revisão completa do fluxo).
**Escopo**: documento único de organização, análise, decisões e execução da **revisão do fluxo de classificação de amostra de café** — desde o tap "Classificar" no detalhe da amostra até o salvamento do evento `CLASSIFICATION_COMPLETED`. Foco em experiência mobile (PWA), eficiência operacional e identificação de gargalos.

**Como ler este doc**: a seção **Decisões** é o que está fechado; **Pendências** é o que ainda não foi decidido; **Log de sessões** é o histórico de avanços por data.

---

## Padrão de implementação

Toda fase deste doc segue o mesmo rito quando vai pra código. Quando um bloco fecha (todas as caixas `[x]` em Pendências, incluindo sub-pontos), inicia-se uma rodada de implementação com as 6 etapas abaixo. **Nenhum código é escrito sem completar etapas 1–3.**

### Etapa 1 — Identificação da fase

- Confirmar que o bloco está 100% fechado (zero `[ ]` na Pendência daquele bloco).
- Re-ler a seção `## Decisões → ### Bloco Fn` pra ter as regras no fresco antes de mexer em qualquer linha.
- Separar decisões em **3 categorias**:
  1. **Status quo** (não exigem código — ex: "manter como está").
  2. **Mudança concreta** (exigem edição de código, CSS, ou criação de componente).
  3. **Provisória** (`⚠️ PROVISÓRIA`) — não implementar; aguarda revisão posterior.
- Mapear cada mudança concreta em uma **frente de implementação** (ex: "novo botão no card", "novo modal de sucesso").

### Etapa 2 — Análise profunda via agentes

Antes de planejar, **descobrir gargalos e impactos** que não estão óbvios no doc. Pra cada frente de implementação, lançar 1 agente `Explore` (em paralelo quando independentes) com perguntas dirigidas:

- O que existe hoje no código que vai ser afetado? (arquivos, componentes, CSS, testes, contratos de API)
- Quais dependências cruzadas? (componentes que reusam o que vai mudar; outros consumidores do mesmo estilo/handler)
- Que regressões são possíveis? (estados de UI, rotas, eventos, idempotência, OCC, traduções)
- Que pré-condições já existem? (validações, triggers, hooks)
- Onde o backend ou o domínio impõe restrições que o frontend precisa respeitar?

Resultados consolidados num **sub-bloco no doc** com cabeçalho `### Análise pré-implementação Fn` (entre Decisões e Pendências, ou na própria seção do bloco). Incluir `arquivo:linha` e snippets relevantes pra rastreabilidade.

**Objetivo**: nenhum código nesta etapa. Só mapeamento.

### Etapa 3 — Plano de implementação em plan mode

- Apresentar plano completo via `ExitPlanMode`. Plano inclui:
  - **Lista ordenada de mudanças** (commits atômicos temáticos quando possível).
  - **Arquivos/componentes** a criar, alterar, deletar (com caminhos absolutos).
  - **Migrations** (se houver) — sempre aditivas, jamais editar migrations existentes.
  - **Testes** a adicionar/atualizar (unitários, integração, contrato).
  - **Quality gates** que vão rodar antes de cada commit (lint + format:check + typecheck + build + testes relevantes).
  - **Pontos de validação manual** (rodar `npm run dev`, testar fluxos golden path + edge cases no browser, em viewport mobile).
  - **Riscos identificados** e mitigação.
  - **Estimativa** de número de commits e ordem de execução.
- **Aprovação explícita do usuário antes de qualquer escrita de código** (Bash com `git`/`Edit`/`Write` proibidos antes da aprovação).

### Etapa 4 — Execução

- Implementação **seguindo o plano aprovado**, sem desvios não-discutidos.
- Sub-decisões durante implementação:
  - **Triviais** (nomes internos, organização de helpers): decidir sozinho e seguir.
  - **Materiais** (mudança de comportamento, novo trade-off, contrato de API): parar, perguntar, e **registrar a sub-decisão no doc** no mesmo commit ou no commit seguinte (regra `feedback_document_plan_changes_during_implementation`).
- Quality gates rodam **antes de cada commit**: `npm run lint && npm run format:check && npm run typecheck && npm run build` + testes da camada relevante.
- Commits atômicos com `tipo(escopo): descricao` (regra do projeto). Sem `--amend` em main, sem `--no-verify`.
- **Push é só do usuário** (regra `feedback_push_is_user_only`). Claude faz commits; usuário roda `git push`.

### Etapa 5 — Validação

- Rodar `npm run dev` e usar a feature no browser real (Chrome DevTools + viewport mobile ≤ 430px).
- Testar **golden path** + **edge cases** + **regressões em features adjacentes**.
- Se a feature for visível em produção:
  - Conferir **CI verde** antes do build (`gh run list` — regra `feedback_ci_green_before_deploy`).
  - **Build** com SHA do commit como tag (regra `feedback_no_deploy_without_commit`).
  - **Deploy canary**: `scripts/gcp/deploy-cloud.sh cloud-production --canary`.
  - **Sempre rodar `execute-job.sh migrate`** entre canary e promote (mesmo sem migration nova — regra `feedback_always_run_migrate_job`).
  - **Acumular múltiplos commits no canary**; promover pra prod só com sinal explícito do usuário ("manda pra prod") (regra `feedback_canary_accumulation`).
- Rodar skill `skill-maintenance` antes de fechar a sessão (atualizar skills se algo documentado nelas mudou — regra `feedback_always_run_skill_maintenance`).

### Etapa 6 — Registro no doc

- Adicionar entrada em `## Log de sessões` com data + descrição da fase implementada + lista de commits (SHA curtos).
- Atualizar tabelas/seções que descrevem estado atual se algo estrutural mudou (ex: "Estado atual do fluxo" pode ganhar uma linha nova).
- Decisões que descobertas em campo virarem provisórias ficam marcadas `⚠️ PROVISÓRIA` em Decisões e Pendências.
- Tensões com decisões antigas (que precisem ser revistas por causa do que foi implementado) entram em `## Tensões revisadas` com formato `T0.X`, `T1.X`, etc.

### Princípios transversais durante implementação

- **Mobile-first sempre**: toda mudança visual ou de fluxo é testada primeiro em viewport mobile (≤ 430px).
- **Plan mode antes de tudo**: nada é implementado sem plano aprovado em plan mode.
- **Dados reais antes de chutar**: pra problemas iOS/PWA, sempre pedir JSON do `ViewportDebugOverlay` em vez de chutar fix (regra `feedback_dados_reais_antes_de_chutar`).
- **Frontend ↔ backend caps**: ao mexer em `LIMIT` do frontend, sempre conferir `LIMIT_MAX` correspondente no backend (regra `feedback_check_backend_caps_when_changing_frontend_limits`).
- **Pt-BR em todas as mensagens de UI** (regra `feedback_messages_portuguese`).
- **Nada de botão verde** ao clicar — sempre `scale`/`opacity` (regra `feedback_no_green_buttons`).
- **Erros de validação dentro do input**, vermelho suave, limpa ao digitar (regra `feedback_error_inside_field`).

---

## Contexto

Classificação é a operação mais sensível do sistema. O operador, geralmente em campo ou bancada com o celular, fotografa a ficha física manuscrita (99×95 mm), espera a IA extrair os campos, revisa, corrige divergências, escolhe o tipo, seleciona co-classificadores e salva. Cada classificação envolve **3 chamadas de rede** (detect-form + extract + complete), **5 a 9 modais** dependendo do caminho, e **22 campos editáveis** num único modal de revisão. É também o ponto onde a inteligência artificial entra no produto — e onde as falhas dela são mais visíveis pro operador.

Esta revisão tem foco em:

1. **Eficiência operacional** — reduzir tempo total, número de toques, fricção em cada decisão.
2. **Experiência mobile** — classificação acontece sempre no celular; layout, gestos, loading states e tolerância a erros precisam ser nativos de mobile.
3. **Gargalos** — identificar onde o operador trava, repete, refaz, ou desiste; e onde o sistema pode antecipar ou automatizar.
4. **Coerência transversal** — uniformizar tratamento de erro, divergência, retry e auto-aplicação de updates.

Este doc é construído colaborativamente em formato pergunta → resposta → registro. Decisões são tomadas em blocos temáticos. Implementação só começa depois que as **Regras fechadas** estiverem completas para um bloco.

---

## Estado atual do fluxo (resumo)

Síntese pra ancorar as decisões. Detalhes em `app/camera/page.tsx`, `components/samples/Classification*.tsx`, `src/samples/sample-command-service.js`, `src/samples/classification-extraction-service.js`.

**Pontos de entrada (3 caminhos)** — reorganizados em **2026-05-28** (Sessão 2). O antigo "Caminho 2 — QR scan" saiu da tabela porque o QR só é impresso após `CLASSIFICATION_COMPLETED`, então scan nunca leva a uma 1ª classificação — vira apenas navegação até o Caminho 1 (ver seção "QR scan como navegação" no Bloco F1). O caminho "foto direta sem QR" (Flow A no código) foi promovido a Caminho 2 explícito.

1. **Caminho 1 — Detalhe da amostra (existente, com contexto)**. FAB "Classificar" em `app/samples/[sampleId]/page.tsx:3975`. Tap → `router.push('/camera?sampleId=${sampleId}')` (Flow B). Aparece quando `status ∈ { REGISTRATION_CONFIRMED, CLASSIFIED }`. Vai direto pra câmera no fluxo de classificação com `sampleId` na URL.

2. **Caminho 2 — Foto direta (existente, Flow A, sem contexto)**. Tap "Câmera" na tabbar (`components/AppShell.tsx:60`) → `/camera` sem `sampleId`. Operador **ignora o QR scanner** e fotografa diretamente a ficha física. `extract-and-prepare` (IA) lê o campo "Lote" da ficha (`app/camera/page.tsx:737` — `handleExtractionResult` quando `hasContext === false`) → `editableLot` é pré-preenchido com o lote extraído → `ClassificationReviewModal` abre. Ao confirmar o review, `resolveSampleByLot` (`page.tsx:915`) busca a amostra no backend. Se achou: segue fluxo normal (divergências/salvar). Se não achou: `ClassificationNotFoundModal` ("Cadastrar nova" / "Sair"). **Validação tardia** — a amostra só é validada depois da chamada da IA (15–30 s + custo OpenAI gastos antes de saber se o lote existe).

3. **Caminho 3 — Modal "Aguardando classificação" do dashboard (botão "Classificar" no card)**. Modal `components/dashboard/OperationModal.tsx`, disparado pelo card "Classificações aguardando" em `components/dashboard/DashboardMobile.tsx:86-94`. Cada card é um `<a href="/samples/[id]">` com botão dedicado "Classificar" (`onItemAction` → `router.push('/camera?sampleId=X')` em Flow B). Botão substitui o chevron à direita. Tap na "área comum" do card mantém o comportamento atual (vai pra detalhe).

**Fases sequenciais (happy path)**:

| #   | Fase              | Onde                                                                   | Decisão do operador                       |
| --- | ----------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Captura           | `app/camera/page.tsx` (vídeo + galeria, câmera traseira)               | Foto da câmera ou galeria                 |
| 2   | Preview           | mesma tela (`flowState = 'preview'`)                                   | "Próximo" ou refazer                      |
| 3   | Detecção de forma | `POST /api/v1/classification/detect-form` (sem UI explícita)           | —                                         |
| 4   | Extração IA       | `POST /api/v1/classification/extract-and-prepare` + spinner            | aguardar (15–30 s)                        |
| 5   | Revisão           | `ClassificationReviewModal` (22 campos + foto zoomável)                | Corrigir/confirmar campos                 |
| 6   | Reconciliação     | `ClassificationDataMismatchModal` (se sacas/safra divergem)            | Ficha vs Cadastro, campo a campo          |
| 7   | Reclassificar     | `ClassificationReclassifyModal` (se `status = CLASSIFIED`)             | Reason code obrigatório + texto se OTHER  |
| 8   | Tipo              | `ClassificationTypeModal`                                              | BICA / PREPARADO / BAIXO / ESCOLHA        |
| 9   | Classificadores   | `ClassificationClassifierModal`                                        | Usuário fixo + co-classificadores (min 1) |
| 10  | Salvar            | `POST .../classification/complete` → `confirmClassificationFromCamera` | "Confirmar e salvar"                      |

**Bifurcações de exceção**:

- **Lote ilegível** (IA rodou mas não leu lote) → `ClassificationExtractionErrorModal (kind='illegible')` → única saída útil é "Tirar outra".
- **Erro técnico** (timeout/IA offline) → `ClassificationExtractionErrorModal (kind='technical')` → "Tirar outra" / **"Continuar manual"** / "Cancelar". Manual abre `ClassificationManualConfirmModal` (2º modal de confirmação) → Review com lote/sacas/safra editáveis.
- **Lote ≠ esperado** (extraiu mas não bate com `internalLotNumber` do sample) → `ClassificationLotMismatchModal` → "Tirar outra".
- **Não encontrou amostra** (específico do **Caminho 2 — Foto direta**, sem `sampleId` na URL) → `ClassificationNotFoundModal` → "Cadastrar nova" / "Sair".

**Backend**:

- Eventos: `CLASSIFICATION_COMPLETED`, `CLASSIFICATION_UPDATED`, `CLASSIFICATION_EXTRACTION_COMPLETED`, `CLASSIFICATION_EXTRACTION_FAILED` (enum `SampleEventType` em `prisma/schema.prisma`).
- **Foto é obrigatória** via constraint pra completar classificação (`sample-command-service.js:2150-2151`, HttpError 409 se ausente).
- Idempotência: `idempotencyScope: 'CLASSIFICATION_COMPLETE'` + key UUID.
- **Auto-print** de etiqueta dispara após `CLASSIFICATION_COMPLETED` (best-effort, não bloqueia o salvamento) — `sample-command-service.js:1898`.
- IA: OpenAI GPT-4o (Vision), prompt estruturado com schema JSON, retorna ficha unificada (`identificacao` + `classificacao`).

**Mobile-first**:

- Câmera traseira forçada via `facingMode: { exact: 'environment' }`. Fallback: galeria via `<input type="file" capture>`.
- QR scanner (lib `qr-scanner`) roda em paralelo à captura manual.
- Compressão da foto via canvas + `toBlob` (qualidade via env var).
- Modais com focus trap, `aria-modal`, ESC fecha.
- Sem suporte offline (todas as chamadas exigem rede ativa).

**Componentes de UI envolvidos** (em `components/samples/`):

`ClassificationReviewModal.tsx`, `ClassificationTypeModal.tsx`, `ClassificationClassifierModal.tsx`, `ClassificationExtractionErrorModal.tsx`, `ClassificationManualConfirmModal.tsx`, `ClassificationDataMismatchModal.tsx`, `ClassificationReclassifyModal.tsx`, `ClassificationLotMismatchModal.tsx`, `ClassificationNotFoundModal.tsx`.

---

## Bloco 0 — Premissas fundacionais

Decisões "antes do fluxo" — valem em qualquer interface. Cada decisão aqui molda o que vem depois.

### Q0.1 — Foto da ficha física é sempre obrigatória, ou existe modo "classificação sem foto"?

**Análise**: Hoje a foto é obrigatória — o backend rejeita (`HttpError 409`) qualquer tentativa de completar classificação sem `CLASSIFICATION_PHOTO` anexada. Isso garante prova visual da ficha e rastreabilidade. Mas existem cenários operacionais em que pode não haver ficha física disponível: classificação ad-hoc em campo, classificação remota a partir de relato de outro classificador, retrabalho onde a ficha original se perdeu.

- **(A) Foto sempre obrigatória** (status quo). Toda classificação tem ficha fotografada. Sem exceção. Garante 100% de rastreabilidade visual.
- **(B) Foto opcional em modo "avulso"** — operador pode iniciar fluxo "classificação manual sem foto" desde o início. Reusa Review (sem foto, sem IA) → Type → Classifier → Salvar. Evento ganha flag `withoutPhoto: true` ou similar pra auditoria.
- **(C) Foto opcional só em casos excepcionais com justificativa** — operador precisa escolher um motivo (ex: "ficha perdida", "classificação remota") + texto. Sistema continua exigindo foto por padrão mas abre escape com auditoria.

**Tradeoff**: (A) mantém integridade máxima dos dados mas força o operador a sempre ter ficha. (B) é flexível mas abre porta pra "modo sem evidência" virar padrão silencioso. (C) é meio-termo: aceita exceção mas exige justificativa rastreável.

### Q0.2 — Modo manual: fallback de erro ou first-class desde o início?

**Análise**: Hoje o "modo manual" só aparece quando a IA dá **erro técnico** (timeout, OpenAI offline). Operador é obrigado a tentar a IA primeiro. Se já souber que a foto está ruim (luz, foco, ficha rasurada, letra ilegível), perde 15–30 s esperando uma extração que sabe que vai falhar.

- **(A) Manter como fallback** (status quo). Operador sempre tenta IA primeiro; manual é só rota de escape pós-erro.
- **(B) Manual first-class no preview** — depois de tirar a foto e ver o preview, operador tem 2 botões: "Enviar pra IA" (default) e "Preencher manualmente". A foto continua sendo enviada/salva, mas a extração é pulada.
- **(C) Manual disponível desde o início do fluxo** — opção de escolher "Classificar manualmente" antes mesmo de abrir a câmera (skip câmera + IA). Combinado com Q0.1=B/C, vira um caminho completo de manual sem foto.

**Tradeoff**: (A) garante que a IA sempre tem chance (e melhora com dados reais), mas custa tempo em fichas notoriamente ruins. (B) dá agência ao operador sem matar a IA. (C) é mais flexível mas pode banalizar o manual e perder dados de treinamento.

### Q0.3 — Reclassificação: foto nova obrigatória ou pode reusar a anterior?

**Análise**: Reclassificação acontece quando `sample.status = CLASSIFIED` e o operador quer corrigir algo. Hoje (a confirmar no código), `updateClassification` provavelmente também exige foto. Mas o operador pode estar só corrigindo um typo no campo "Padrão" — não precisa refazer foto da ficha.

- **(A) Sempre exigir foto nova** (assumido como status quo). Garante que a reclassificação reflete o estado físico atual do café e da ficha.
- **(B) Permitir reusar a foto da classificação original** — operador escolhe: "Tirar foto nova" ou "Usar foto anterior". Útil pra correção de dados sem mudança física do café/ficha.
- **(C) Default por reason code** — reasons como `TYPO`/`DATA_FIX` reusam foto automaticamente; `MISSING_INFO`/`OTHER` forçam foto nova. Decisão deriva do motivo, não escolha extra.

**Tradeoff**: (A) é o mais seguro mas força retrabalho desnecessário em correções simples. (B) é flexível mas joga responsabilidade no operador. (C) automatiza a decisão pelo motivo declarado.

### Q0.4 — Quem é autoridade quando ficha física diverge do cadastro (sacas/safra)?

**Análise**: O `ClassificationDataMismatchModal` aparece quando os campos `sacas`/`safra` extraídos da ficha não batem com o que está no `Sample` registrado. Hoje o operador escolhe campo a campo (radio "Ficha" vs "Cadastro", sem default — obriga reflexão). Mas isso adiciona um modal a mais no fluxo e exige decisão consciente toda vez.

- **(A) Operador escolhe sempre, sem default** (status quo). Máxima transparência. Custo: tempo + clique a mais em cada divergência.
- **(B) Ficha física é autoridade por padrão** (radio pré-selecionado em "Ficha"). Argumento: a ficha é a "fonte primária" porque foi preenchida no momento da pesagem real. Operador pode trocar.
- **(C) Cadastro é autoridade por padrão** (radio pré-selecionado em "Cadastro"). Argumento: o cadastro já foi validado anteriormente; ficha pode ter erro de transcrição. Operador pode trocar.
- **(D) Ignorar divergência silenciosamente** — usa sempre o cadastro (ou sempre a ficha), sem perguntar. Modal desaparece. Mais rápido, mas perde controle.

**Tradeoff**: (A) garante decisão consciente mas custa cliques. (B) e (C) aceleram o fluxo escolhendo um lado padrão. (D) é o mais rápido mas elimina a oportunidade de pegar erros.

### Q0.5 — Ficha física unificada (Q.cls.2.7) é fundação ou pode mudar?

**Análise**: A ficha física foi unificada em 2026-05-14 — era 3 tipos (PREPARADO/LOW_CAFF/BICA), virou uma única em HTML imprimível (`print-templates/classification-form/index.html`). O enum `ClassificationType` continua no banco (BICA/PREPARADO/BAIXO/ESCOLHA), mas o operador escolhe o tipo **depois** da extração, sem relação com layout da ficha. Toda a UX de revisão (22 campos no `ClassificationReviewModal`) é casada com esse layout único.

- **(A) Ficha unificada é fundação imutável** (assumido como status quo). Esta revisão NÃO toca no layout da ficha física nem no enum. UX se ajusta ao que existe.
- **(B) Ficha pode evoluir nesta revisão** — se identificarmos campos que nunca são preenchidos, ordem que confunde, ou nomes ambíguos, podemos mexer no HTML imprimível e no extractor. Adiciona escopo grande.
- **(C) Ficha congelada por agora, lista de "ideias pra próxima rev" como anexo** — anota gargalos detectados na ficha mas não age nesta revisão; bloco D ao final do doc.

**Tradeoff**: (A) limita o escopo e foca em UX digital, mas pode ignorar problemas reais na origem dos dados. (B) é mais ambicioso mas duplica o tamanho da feature (ficha + extractor + treinamento da IA). (C) preserva foco com memória.

---

## Bloco F1 — Entrada e caminhos para classificação

**Visão geral**: existem **3 caminhos** distintos pelos quais o operador pode iniciar a classificação de uma amostra. Cada caminho tem seu próprio gatilho, contexto e custo de toques. Vamos discutir caminho por caminho e fechar coerência transversal ao final.

> **Reorganização — 2026-05-28 (Sessão 2)**: a tabela abaixo foi refeita. O antigo "Caminho 2 — QR scan" saiu da lista de caminhos de classificação. **Motivo**: o QR só é impresso após `CLASSIFICATION_COMPLETED`, então uma amostra "aguardando classificação" nunca tem QR — scan nunca leva a uma 1ª classificação. QR vira **navegação pura** até o detalhe (Caminho 1). A "foto direta sem QR" (Flow A no código) foi promovida a Caminho 2 explícito. As decisões antigas F1.2/F1.3 e F1.9.A Caso B permanecem registradas (não estão sendo apagadas), mas movem para a seção "QR scan como navegação" e geram a tensão **T1.A**.

| Caminho | Origem                                          | Status          | Resultado hoje                                                                                                                          |
| ------- | ----------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **1**   | FAB "Classificar" no detalhe da amostra         | ✅ Existente    | Vai direto pra `/camera?sampleId=X` (Flow B)                                                                                            |
| **2**   | Tabbar "Câmera" → foto direta da ficha (Flow A) | ✅ Existente    | IA extrai lote da ficha → `resolveSampleByLot` resolve a amostra ao confirmar review; `ClassificationNotFoundModal` se lote não existir |
| **3**   | Modal "Aguardando classificação" do dashboard   | ✅ Implementado | Botão "Classificar" no card → `/camera?sampleId=X` (Flow B); área comum do card continua indo pro detalhe                               |

> **QR scan** (tabbar "Câmera" → escanear etiqueta interna) continua existindo mas **não é caminho de classificação**: leva apenas ao detalhe via `SampleLookupResultModal`. Detalhes na seção "QR scan como navegação" mais abaixo.

---

### Caminho 1 — Detalhe da amostra (existente)

**Estado atual**: FAB "Classificar" em `app/samples/[sampleId]/page.tsx:3975`. Aparece quando `status ∈ { REGISTRATION_CONFIRMED, CLASSIFIED }` (label vira "Reclassificar" no segundo caso). Tap → `router.push('/camera?sampleId=${sampleId}')` sem confirmação intermediária. É o caminho mais "óbvio" e o mais usado.

#### F1.1 — O acesso atual (FAB único no detalhe) atende, ou tem alguma fricção a resolver?

**Análise**: hoje o FAB é o único gatilho disponível dentro do detalhe da amostra. Tap direto, sem confirmação. Funciona, é simples. Possíveis fricções: (a) FAB pode estar visualmente competindo com outros botões da página de detalhe; (b) operador que abriu detalhe "por engano" pode tapar sem querer; (c) nenhuma "tela de preparação" antes da câmera (ex: dica de iluminação na primeira vez).

- **(A) Manter como está** (status quo). FAB direto → câmera. Confiar que o operador sabe o que está fazendo.
- **(B) Manter FAB mas adicionar tela curta de preparação** na primeira vez (dica de iluminação + "Pronto pra fotografar?" com botão "Abrir câmera"). Depois some.
- **(C) Repensar a posição** — em vez de FAB, virar botão fixo na barra de ação inferior do detalhe, mais previsível e menos sujeito a tap acidental.

**Tradeoff**: (A) é zero esforço, status quo testado. (B) ajuda novos operadores mas adiciona um modal extra que vira ruído depois. (C) muda padrão visual da página de detalhe (impacto maior).

---

### Caminho 2 — Foto direta (existente, Flow A, sem contexto)

**Estado atual**: tap na navbar "Câmera" → `/camera` (sem `sampleId`). Câmera abre com QR scanner ativo, **mas o operador pode ignorá-lo e fotografar a ficha física diretamente**. Após captura → `detect-form` + `extract-and-prepare` (IA) rodam normal. A IA lê o campo "Lote" da ficha (`identification.lote`) e `handleExtractionResult` (`app/camera/page.tsx:737`) detecta `hasContext === false` → preenche `editableLot` com o lote extraído → abre `ClassificationReviewModal` (`flowState='confirming'`). Quando o operador confirma o review, `handleConfirm` (`page.tsx:904`) chama `resolveSampleByLot(session, lot)` (`page.tsx:915`):

- **Achou amostra com lote `REGISTRATION_CONFIRMED`/`CLASSIFIED`** → segue para divergências (se houver) ou salva direto.
- **Não achou** → `flowState='not-found'` → `ClassificationNotFoundModal` com **"Cadastrar nova" / "Sair"**.
- **Status incompatível** (ex: `INVALIDATED`) → `flowError` + volta pro `confirming`.

**Características próprias** do Caminho 2:

- **Validação tardia**: a amostra só é resolvida **depois** da chamada da IA. Operador gasta 15–30 s + custo OpenAI antes de saber se o lote existe.
- **Lote ilegível no Flow A**: se a IA não conseguir ler o lote, `editableLot` fica vazio e o review abre com lote em branco — operador digita manualmente. Esse comportamento **diverge** do Flow B (Caminho 1/3), onde lote ilegível dispara `extraction-error-illegible` (modal de erro).
- **Sem `Sample` pré-resolvido** na captura: campos do review não têm comparação com `declared.sacks`/`declared.harvest` no momento da extração; comparação só acontece após `resolveSampleByLot` retornar.
- **Toques mínimos**: 2 (tabbar → fotografar). Mas o trade-off é descobrir os erros tarde.

#### F1.10 — O Caminho 2 (Foto direta) deve continuar existindo?

**Análise**: o caminho está vivo no código (não foi removido em revisões anteriores) e é o mais rápido em toques (2). Mas tem o maior custo de erro (gasta chamada da IA antes de validar). Em operações onde a maior parte das amostras vem do dashboard ou do detalhe, esse caminho pode estar virando um "vestígio". Por outro lado, pode ser o caminho preferido de operadores experientes que classificam várias amostras em sequência sem voltar pro app.

- **(A)** Manter como está (status quo). Operador escolhe implicitamente entre QR scan e foto direta dentro da câmera.
- **(B)** Manter mas sinalizar visualmente — adicionar texto/dica na câmera diferenciando "Aponte pra etiqueta" (QR scan) de "Ou aponte direto pra ficha" (Foto direta), pra reduzir ambiguidade.
- **(C)** Aposentar Caminho 2 — toda classificação via tabbar exige QR scan primeiro; foto direta da ficha só nos Caminhos 1/3 onde já há contexto.

**Tradeoff**: (A) preserva flexibilidade mas mantém a ambiguidade da câmera (operador não sabe qual modo está usando). (B) torna a coexistência explícita sem mudar fluxo. (C) elimina ambiguidade e o custo de "IA antes da validação", mas remove caminho rápido pra operador experiente.

#### F1.11 — Quando a IA falha em ler o lote no Caminho 2 (Foto direta), qual o comportamento?

**Análise**: hoje o Flow A trata lote ilegível como "lote vazio no review pra operador digitar" (`page.tsx:749-754`). É silencioso e diferente do Flow B (que dispara `extraction-error-illegible`). Faz sentido o Caminho 2 ser tolerante (porque não tem contexto pra comparar) — mas o operador não recebe sinal de que a IA não conseguiu ler.

- **(A)** Status quo — review abre com lote vazio, operador digita.
- **(B)** Igualar ao Flow B — disparar `extraction-error-illegible` também no Caminho 2; operador pode escolher "Tirar outra" / "Continuar manual" / "Cancelar".
- **(C)** Mostrar aviso inline no review ("IA não leu o lote — preencha manualmente") antes de operador digitar. Híbrido: não bloqueia, mas sinaliza.

**Tradeoff**: (A) é silencioso e rápido pra quem já espera digitar. (B) padroniza comportamento entre flows mas adiciona modal. (C) mantém fluxo único + dá feedback claro.

#### F1.12 — Tratamento de status incompatível no Caminho 2 — Foto direta (ex: lote existe mas amostra `INVALIDATED`)

**Análise**: hoje, se `resolveSampleByLot` retorna um sample com status fora de `{ REGISTRATION_CONFIRMED, CLASSIFIED }`, `flowError` é setado pra "Amostra nao pode ser classificada (status invalido)" e o operador volta pro review (`page.tsx:929-933`). É uma mensagem genérica num campo de erro, sem distinguir os casos.

- **(A)** Status quo — erro genérico no review.
- **(B)** Modal dedicado por status — `INVALIDATED`: "Amostra invalidada, não pode ser classificada" + Fechar. Outros estados: mensagem específica.
- **(C)** Não bloquear — permitir classificação mesmo em status incompatível, registrando flag de auditoria (decisão de produto, não defensiva).

**Tradeoff**: (A) é mínimo esforço mas mensagem é fraca. (B) dá feedback claro e alinhado com F1.9.A. (C) é flexível mas relaxa o gate de integridade.

---

### QR scan como navegação (out-of-scope para classificação)

> **Nota — Sessão 2 (2026-05-28)**: esta seção era o **antigo Caminho 2** ("Câmera direto via tabbar com QR scan"). Foi removida da lista de caminhos de classificação porque o QR só é impresso após `CLASSIFICATION_COMPLETED` — uma amostra aguardando 1ª classificação **não tem QR**, então scan não pode ser o gatilho de uma 1ª classificação. QR scan vira **navegação até o detalhe** (Caminho 1). As decisões antigas F1.2, F1.3 e F1.9.A Caso B permanecem registradas abaixo como **histórico**, mas geram a tensão **T1.A** (atalho "Reclassificar" no modal pós-QR conflita com o novo princípio "QR → detalhe, não → classificação"). T1.A será resolvida em sessão futura.

**Estado atual**: tap na navbar "Câmera" → rota `/camera` (sem `sampleId`). Câmera abre com QR scanner ativo. Quando o operador aponta pra etiqueta interna (que contém o número do lote no QR), o scanner decodifica → `resolveSampleByQr` → retorna o `Sample` → abre `SampleLookupResultModal` com 2 botões: **"Ver detalhes"** (`→ /samples/[id]`) e **"Escanear novamente"**. Pra chegar na classificação, operador precisa hoje tapar "Ver detalhes" → "Classificar" no detalhe → câmera reabre (agora com `sampleId` na URL). **Total: 4 toques desde a navbar pra começar a fotografar a ficha.**

#### F1.2 — O modal de confirmação pós-QR deve ganhar um botão "Classificar agora" (ou substituir o comportamento)?

**Análise**: o modal hoje serve como gate de segurança ("é essa amostra mesmo?") antes de qualquer ação. Pra quem quer só ver detalhes, é OK. Pra quem quer classificar (que é o objetivo principal do Caminho 2), o detour pelo detalhe é puro desperdício de toques + reabre a câmera de novo.

- **(A) Manter como está** (status quo). Operador segue 4 toques pra classificar via QR.
- **(B) Adicionar 3º botão "Classificar agora"** no modal, mantendo "Ver detalhes" e "Escanear novamente". Operador escolhe a intenção. Vira o caminho de 2 toques (navbar → tap "Classificar agora" após scan).
- **(C) Substituir comportamento**: QR scan vai direto pra fluxo de classificação (sem modal). Modal só aparece em casos especiais (ex: amostra `INVALIDATED` ou outro estado bloqueante). Caminho fica em 1 toque pós-scan.
- **(D) (B) + tornar "Classificar agora" o botão primário** do modal (verde, em destaque), assumindo que é a intenção mais comum vinda da câmera.

**Tradeoff**: (A) preserva segurança mas mantém atrito. (B) dá agência ao operador sem mudar o padrão de confirmação. (C) é o mais rápido mas remove o gate (risco em casos de QR errado/duplicado). (D) é (B) com viés explícito pra classificação.

#### F1.3 — A entrada pela tabbar "Câmera" deve ter algum filtro/contexto extra?

**Análise**: hoje a tabbar é genérica — abre câmera "limpa", QR scanner ativo. O operador pode escanear qualquer etiqueta. Não há nenhuma sinalização de "amostras esperando classificação" antes de scanear (que é o que o Caminho 3 vai oferecer).

- **(A) Manter como está** (status quo). Câmera abre limpa, scanner pronto.
- **(B) Quando vier da tabbar, mostrar um banner curto** acima do scanner ("X amostras aguardando classificação · ver lista") que abre o mesmo modal do Caminho 3. Cria sinergia entre os 3 caminhos.
- **(C) Não fazer nada agora — esperar Caminho 3 estar implementado** e revisitar depois.

**Tradeoff**: (A) mantém a câmera focada na ação imediata. (B) cria atalho cruzado mas adiciona elemento visual à câmera. (C) é prudente e evita decisão acoplada.

---

### Caminho 3 — Modal "Aguardando classificação" do dashboard (NOVO)

**Estado atual**: modal `components/dashboard/OperationModal.tsx`, disparado pelo card "Classificações aguardando" em `components/dashboard/DashboardMobile.tsx:88-94`. Itens carregados via `GET /api/v1/dashboard/pending` (campo `classificationPending.items[]`). Cada item renderizado como `<Link href="/samples/[id]">` simples (`OperationModal.tsx:67-85`) mostrando lote, dono e data de criação. Tap leva sempre ao detalhe da amostra.

**A adicionar**: botão dedicado "Classificar" em cada card, que vai direto pra `/camera?sampleId=X` (Flow B, mesma rota do Caminho 1), pulando o detalhe. Tap na "área comum" do card mantém o comportamento atual (vai pra detalhe).

#### F1.4 — Posição do botão "Classificar" dentro do card

**Análise**: o card hoje tem `body` (lote + dono + data) à esquerda e um pequeno `app-modal-card-indicator` à direita (provavelmente uma seta/chevron de navegação). Adicionar um botão dedicado afeta o layout. Opções:

- **(A) Botão à direita, substituindo o chevron** (ex: ícone de câmera + label opcional). Ocupa a área que hoje sinaliza "navegação". Compacto.
- **(B) Botão como linha inferior do card** (full width abaixo dos dados). Mais óbvio mas o card cresce em altura.
- **(C) Botão à direita, abaixo do chevron** (mesma coluna). Mantém indicador de navegação + adiciona ação.
- **(D) Ícone discreto de câmera à direita, sem label** (igual notificação). Operador identifica visualmente; menos texto.

**Tradeoff**: (A) mais limpo mas remove o sinal de "card clicável" (visualmente pode parecer só um botão). (B) ocupa mais espaço vertical, pode reduzir o nº de cards visíveis. (C) duplica indicadores mas é mais redundante visualmente. (D) é o mais discreto mas exige aprendizado.

#### F1.5 — Visual do botão (label, cor, tamanho)

**Análise**: o botão precisa ser distinguível tanto da "área comum" do card (que vai pra detalhe) quanto de outras ações da UI. Tem que respeitar o design system atual (sem botão verde ao clicar, conforme `feedback_no_green_buttons`).

- **(A) Ícone de câmera + label "Classificar"** (mais claro pra primeira vez).
- **(B) Só ícone de câmera** (mais limpo, depende de aprendizado).
- **(C) Pill/chip pequeno verde da marca com "Classificar"** (destaca a ação principal).
- **(D) Botão neutro (cinza com texto)** (não compete com outras CTAs verdes do app).

**Tradeoff**: (A) mais didático mas ocupa mais espaço. (B) é elegante mas pode confundir nas primeiras vezes. (C) destaca como ação primária. (D) mais conservador.

#### F1.6 — Comportamento do tap

**Análise**: precisamos definir 2 áreas clicáveis distintas dentro de um único card.

- **(A) Tap no botão → `/camera?sampleId=X` direto** (Flow B, igual Caminho 1). Tap na área comum → `/samples/[id]` (status quo). Sem confirmação em nenhum dos dois.
- **(B) Tap no botão → confirmação ("Classificar amostra X?") → câmera**. Tap na área comum → detalhe. Adiciona um gate de segurança ao caminho mais rápido.
- **(C) Tap no botão → direto pra câmera; long-press → menu com mais opções** (ver detalhe / classificar / imprimir etiqueta). Mais avançado, padrão "power user".

**Tradeoff**: (A) é o mais simples e bate com a expectativa "botão = ação direta". (B) reduz risco de tap acidental mas adiciona modal extra. (C) é poderoso mas oculto (descobribilidade ruim em mobile).

#### F1.7 — O modal de pendências deve ganhar acesso a partir de outros lugares além do dashboard?

**Análise**: hoje o único disparador é o card "Classificações aguardando" no dashboard (mobile e desktop). Se ele virar o "centro nervoso" de classificação (Caminho 3), faz sentido estar acessível de mais lugares?

- **(A) Manter só no dashboard** (status quo). Operador sabe onde encontrar.
- **(B) Adicionar também na página `/samples`** (botão "Aguardando classificação · N" no header da lista).
- **(C) Adicionar como item de navegação** (ex: na navbar ou num menu hambúrguer).
- **(D) Acoplar com Caminho 2** (banner na câmera, conforme F1.3-B).

**Tradeoff**: (A) é o mais simples mas pode esconder a feature. (B) é discoverable na lista de amostras. (C) eleva a importância mas polui a navegação. (D) cria sinergia com câmera mas depende de F1.3.

---

### Transversais entre os 3 caminhos

#### F1.8 — Pós-sucesso (`CLASSIFICATION_COMPLETED`): voltar pra onde?

**Análise**: hoje, ao salvar, sempre volta pra `/samples/[id]` (detalhe). Com 3 caminhos de entrada, faz sentido considerar pra onde voltar pra cada origem.

- **(A) Sempre voltar pro detalhe** (status quo). Independente de qual caminho usou pra chegar.
- **(B) Voltar pra origem** — Caminho 1 → detalhe; Caminho 2 → câmera (pra escanear próximo); Caminho 3 → modal de pendências (lista atualizada, sem a que acabou de ser classificada).
- **(C) Sempre exibir tela de sucesso com 3 opções** ("Ver amostra", "Classificar próxima", "Sair") independente da origem. Operador decide na hora.

**Tradeoff**: (A) é simples mas não respeita o contexto de quem veio do Caminho 3 (que quer voltar pra continuar a fila). (B) é o mais ergonômico mas exige rastrear a origem na URL/state. (C) é flexível mas adiciona mais um passo após o submit.

#### F1.9 — Sample em status incompatível: como cada caminho se comporta?

**Análise**: amostras `INVALIDATED` não podem ser classificadas. Hoje:

- Caminho 1: FAB nem aparece se status não for elegível (gate visual no detalhe).
- Caminho 2: QR scan resolve mesmo amostras invalidadas → modal mostra → "Ver detalhes" → operador vê que está invalidada e fica frustrado.
- Caminho 3: a query `dashboard/pending` provavelmente já filtra pra `REGISTRATION_CONFIRMED` (a confirmar).

- **(A) Cada caminho lida por si** (status quo + adicionar gate no Caminho 3 quando implementar).
- **(B) Mostrar erro/aviso explícito** — Caminho 2 detecta status incompatível e mostra "Amostra X já está classificada/invalidada" no próprio modal de resolução; Caminho 3 nem mostra a amostra no card.
- **(C) Esconder amostras incompatíveis em todos os caminhos** — Caminho 2 trata QR de invalidada como "não encontrado"; Caminho 3 nem lista.

**Tradeoff**: (A) é mínimo esforço mas mantém fricção no Caminho 2. (B) dá feedback claro sem esconder. (C) é o mais limpo mas pode confundir ("escaneei mas não acha?").

---

## Bloco F2 — Captura da foto

**Objetivo**: revisar a experiência de **capturar a foto da ficha** — do momento em que o operador chega na câmera até ter uma foto pronta no preview, antes de mandar pra IA. Foco em mobile (operador em bancada, possivelmente com mão suja de café), eficiência e tolerância a erros.

**O que está em escopo**: inicialização da câmera, captura manual, fallback de galeria, QR scanner em paralelo, preview e refazer foto, feedback (visual + tátil), estados de erro (permissão / hardware), indicações visuais de "alinhe a ficha".

**O que NÃO está em escopo** (vai pra blocos seguintes):

- Detecção do formulário (`detect-form`) e extração via IA → **Bloco F3**.
- Revisão dos 22 campos extraídos → **Bloco F4**.
- Reconciliação de divergências → **Bloco F5**.

### Estado atual (resumo)

Tudo orquestrado em `app/camera/page.tsx`. Lib QR via `qr-scanner@^1.4.2`. Compressão via `lib/compress-image.ts`.

**Inicialização** (`ensureScannerStarted`, linhas 395-473):

- `QrScanner.hasCamera()` valida existência.
- **Câmera traseira forçada** via `getUserMedia({ video: { facingMode: { exact: 'environment' } } })` — se `OverconstrainedError`, vira `cameraStatus='unsupported'` e exige galeria.
- Erros de permissão (regex `/permission|notallowed|denied|secure context/i`) viram `cameraStatus='permission-denied'`.
- Estados: `'idle' | 'starting' | 'scanning' | 'permission-denied' | 'unsupported'`.

**QR scanner em paralelo** (linhas 441-455):

- `maxScansPerSecond: 12`.
- `highlightScanRegion: true` + `highlightCodeOutline: true` — overlay visual do QR ativa o tempo todo.
- Dedupe de QR repetido em janela de 1.8 s (`REPEATED_SCAN_WINDOW_MS`).
- Pausa quando `resultModalOpen || flowState !== 'idle'`.

**Captura manual** (`captureFromVideoStream`, linhas 555-583):

- Tap dispara: `setCaptureFlashKey(+1)` (flash overlay 180 ms) + `navigator.vibrate(40)` (haptic 40 ms).
- Canvas drawing do frame atual (`drawImage` do `<video>`, sem `ImageCapture API`).
- `canvas.toBlob()` → wrapped em `File` (`classificacao-${ts}.jpg`).
- Botão de captura: 68×68 px, circular branco, classe `.camera-hub-capture-btn` (linhas 16386-16408 do CSS).
- Visível só se `flowState === 'idle' && cameraStatus === 'scanning'`.

**Fallback de galeria** (linhas 1074-1080):

- `<input type="file" accept="image/*">` oculto, disparado por botão **sempre visível** (top-right, classe `.camera-hub-gallery-btn`).
- Limite **12 MB** (`MAX_SIZE`, linha 588) — acima rejeita com mensagem em pt-BR.
- Sem validação de formato no frontend (`accept="image/*"` aceita JPEG/PNG/WebP/HEIC). Backend valida magic bytes.

**Compressão** (`lib/compress-image.ts`):

- HQ default: `quality: 0.95`, `maxDimension: 3072` (com adaptação por device memory: 2 GB → 2048, ≤ 4 GB+≤ 4 cores → 2560, else → 3072).
- Legacy (opt-out via env `NEXT_PUBLIC_PHOTO_HIGH_QUALITY=false`): `quality: 0.88`, `maxDimension: 1920`.
- Pipeline: `createImageBitmap` → `OffscreenCanvas` com smoothing high → `convertToBlob` com qualidade dinâmica.
- Retorna o arquivo original se a compressão não reduzir o tamanho.
- Tamanho típico mobile: 800 KB–2 MB (HQ) ou 300–800 KB (legacy).

**Preview** (linhas 1035-1142):

- Estado `flowState='preview'` + `capturedPhotoUrl: string` (blob URL, cleanup em effect).
- Renderiza `<img className="camera-hub-preview-img">` com `object-fit: cover`, fill no stage.
- 2 botões fixos na bottom area: **"Tirar outra"** (chama `resetClassificationFlow`) e **"Enviar"** (chama `handleSendPhoto`).
- **Sem zoom/pinch, sem recorte, sem rotação manual.**

**Overlay visual** (CSS linhas 16118-16127):

- `.camera-hub-overlay::before` cria janela retangular branca (inset 14% top, 12% horizontal, 24% bottom, border-radius 24 px).
- É o **mesmo overlay do QR scanner** — não tem indicação dedicada de "alinhe a ficha aqui".

**Tratamento de erro**:

- Permissão negada → texto em `role="alert"` + galeria como única opção. Sem botão pra reabrir permissão.
- Câmera sem traseira → mesmo tratamento (mensagem + galeria).
- Foto vazia (canvas sem stream válido) → return silencioso, sem aviso.
- Arquivo > 12 MB → mensagem fixa "A foto excede o limite de 12 MB.".

**Mobile / PWA**:

- `height: -webkit-fill-available` no `html` pra iOS standalone.
- Lock de scroll quando `resultModalOpen || flowState !== 'idle'`.
- Sem `screen.orientation` lock.

**Pontos de fricção visíveis no código** (identificados pelo Explore):

1. Botão de captura **68 px** pode ser pequeno em mão suja de café (~ 18 % da largura em 375 px).
2. Feedback tátil de **40 ms** quase impercebível em devices fracos.
3. **Flash de 180 ms** é único sinal visual de "deu certo a foto".
4. Refazer foto exige 2 taps (tap "Tirar outra" → reset → câmera reinicia).
5. Galeria **sempre visível** ao lado da câmera ativa — pode confundir operador novo (qual é o caminho padrão?).
6. **Mesmo overlay** serve QR scanning e captura da ficha — sem indicação dedicada de "alinhe a ficha aqui".
7. Mensagens de erro genéricas ("Camera bloqueada") não distinguem causas nem dão passo-a-passo de recuperação.

### Perguntas

#### F2.1 — Câmera traseira forçada permanece ou abre opção de frontal?

**Análise**: hoje força com `exact: 'environment'`. Se não houver traseira (desktop, alguns tablets), fallback é "use a galeria". Operador nunca vê opção de trocar pra frontal. Pra classificar café, sempre faz sentido câmera traseira — mas em devices desktop sem webcam traseira (caso raro), a única alternativa hoje é galeria.

- **(A)** Manter `exact: 'environment'` (status quo). Câmera frontal nunca é usada pra capturar ficha.
- **(B)** Tentar `exact: 'environment'` e cair pra `'environment'` (preferred, sem exact) se falhar — pega cenários onde o device tem câmera mas o `exact` não funciona.
- **(C)** Permitir trocar pra frontal via botão visível na UI (raro mas dá agência).

**Tradeoff**: (A) é o mais simples e cobre 99% dos casos reais. (B) ganha alguns devices sem custo de UX. (C) adiciona controle mas raramente útil.

#### F2.2 — Galeria sempre visível ou só como fallback?

**Análise**: hoje botão da galeria sempre aparece no top-right, ao lado da câmera ativa. Em campo, pode confundir operador novo (qual é o caminho padrão?). Por outro lado, é útil pra reenviar uma foto já tirada (ex: classificou de outro app).

- **(A)** Manter sempre visível (status quo).
- **(B)** Esconder quando câmera está ativa (`cameraStatus === 'scanning'`); mostrar só em `unsupported`/`permission-denied`.
- **(C)** Manter visível mas reduzir prominência (ícone menor, opacity menor) até a câmera falhar.
- **(D)** Mover pra um menu "..." (gesto de descobrir) — esconde quase totalmente.

**Tradeoff**: (A) máxima descoberta. (B) máximo foco no caminho principal mas perde reusabilidade. (C) compromisso visual. (D) muito escondido.

#### F2.3 — QR scanner em paralelo durante captura da ficha: manter como está?

**Análise**: hoje QR scanner roda continuamente (12 scans/s) com highlight visual ativo. Operador que veio do **Caminho 2** quer scanear; operador que veio do **Caminho 1 ou 3** quer só fotografar a ficha (não tem QR pra escanear nesse momento, já tem `sampleId` no contexto). Os 2 modos coexistem na mesma tela sem distinção visual.

- **(A)** Manter como está — scanner sempre ativo, mesma UI pra todos os caminhos. Simples.
- **(B)** Desligar QR scanner quando `hasContext === true` (veio com `?sampleId=`) — operador só fotografa, sem distração do highlight.
- **(C)** 2 modos visuais distintos: "Scan QR" vs "Fotografar ficha", toggle ou auto-detectar pelo `hasContext`.

**Tradeoff**: (A) zero esforço, mas mantém o mesmo overlay genérico pra 2 atividades diferentes. (B) elimina ruído pra Caminhos 1/3 sem mexer no Caminho 2. (C) UX mais explícita mas adiciona complexidade.

#### F2.4 — Botão de captura: tamanho e posicionamento

**Análise**: hoje 68×68 px circular. Em mobile 375 px wide = ~18% da tela. Em mão suja ou com luva, pode ser apertado. Alternativas:

- **(A)** Manter 68 px (status quo).
- **(B)** Aumentar pra 88 px (típico Android shutter button) — ~23% em 375 px.
- **(C)** 88 px + opção de tap em qualquer área do video como atalho (toque generoso).
- **(D)** Botão grande (88 px) + suportar tecla de volume (`keydown` Volume Up) como shutter — comum em apps de câmera (mas exige permissão extra em alguns navegadores).

**Tradeoff**: (A) zero esforço. (B)/(C) ganham hit-area sem complexidade. (D) é mais avançado mas pode falhar em PWA standalone iOS.

#### F2.5 — Feedback de captura: tátil + visual

**Análise**: hoje `navigator.vibrate(40)` + flash overlay 180 ms. Em devices fracos a vibração nem é sentida; o flash passa rápido. Operador nem sempre sabe se a foto "pegou".

- **(A)** Manter (status quo).
- **(B)** Vibração mais longa (80–120 ms) + flash mais visível (250 ms, mais opaco).
- **(C)** Som de shutter (configurável, default off) + vibração maior + flash atual.
- **(D)** Feedback consolidado: vibração + flash + thumbnail miniatura aparecendo (estilo iOS Camera) por 1 s no canto antes de ir pro preview.

**Tradeoff**: (A) zero esforço. (B)/(C) reforçam sinal mas podem incomodar quem prefere discrição. (D) é o mais rico mas exige mais código.

#### F2.6 — Refazer foto a partir do preview: 2 taps ou 1?

**Análise**: hoje preview → tap "Tirar outra" → `resetClassificationFlow` → câmera reinicia. São 2 taps (1 pra escolher refazer, 1 pra confirmar). Alternativas:

- **(A)** Manter 2 taps (status quo) — botão explícito.
- **(B)** 1 tap: "Tirar outra" vira ícone X discreto no canto superior do preview; "Enviar" continua botão principal.
- **(C)** Swipe down no preview = descartar (estilo iOS), `Enviar` botão único embaixo.
- **(D)** Long-press no preview = descartar, single tap = enviar (compacto mas opaco em descobribilidade).

**Tradeoff**: (A) explicitness, alta descoberta. (B) UX mais limpa, ainda óbvia. (C) gesture nativo mas exige aprendizado. (D) muito escondido.

#### F2.7 — Preview: zoom/pinch pra verificar legibilidade da ficha?

**Análise**: hoje preview é só `<img object-fit: cover>`, sem zoom. Operador não consegue verificar de perto se a ficha está focada ou se algum campo ficou ilegível antes de mandar pra IA. Se a foto está ruim, descobre só depois (modal "lote ilegível").

- **(A)** Sem zoom (status quo). Operador confia visualmente; IA decide.
- **(B)** Pinch-to-zoom no preview (reusar `PhotoZoomViewer` do projeto?).
- **(C)** Botão dedicado "Ver em tela cheia" → abre overlay com pinch-to-zoom.
- **(D)** Auto-zoom em região da ficha (heurística) — complexo.

**Tradeoff**: (A) zero esforço, IA filtra. (B) reusa componente existente, pequeno custo. (C) explícito mas adiciona mais um botão. (D) técnicamente caro.

#### F2.8 — Indicação visual de "alinhe a ficha aqui"

**Análise**: hoje o mesmo overlay (`.camera-hub-overlay::before`, retângulo branco inset) serve QR scan e fotografia da ficha. Operador que vem do Caminho 1/3 não sabe onde alinhar a ficha — vê só "use o quadrado pra QR" implicitamente.

- **(A)** Manter o mesmo overlay (status quo).
- **(B)** Overlay com proporção da ficha física (99×95 mm ≈ 1:1) e label "Alinhe a ficha aqui" — mostrado quando `hasContext === true` (Caminho 1/3); mantém o QR overlay pra Caminho 2.
- **(C)** Auto-trocar overlay quando o QR scanner detecta "nenhum QR por X segundos" — heurístico, frágil.

**Tradeoff**: (A) simples. (B) UX mais clara, custo baixo (CSS + texto). (C) inteligente mas fragilidade alta.

#### F2.9 — Tela de permissão negada / câmera unsupported: melhorar UX?

**Análise**: hoje mensagem fixa em `role="alert"` ("Camera bloqueada. Use a galeria… ou habilite na config do navegador.") + galeria como única opção. Sem botão pra retentar permissão, sem instruções específicas por navegador.

- **(A)** Manter como está.
- **(B)** Botão "Tentar novamente" que re-dispara `getUserMedia` (útil quando operador permitiu na barra do navegador).
- **(C)** (B) + bloco expansível "Como liberar a câmera" com instruções específicas por navegador (iOS Safari, Chrome Android, etc).
- **(D)** Substituir mensagem genérica por modal dedicado `CameraAccessModal` com ilustração + passos + retry.

**Tradeoff**: (A) zero esforço, mas operador trava se não souber recuperar permissão. (B) ganho real com 5 linhas de código. (C) cobertura completa, mais código + manutenção das instruções. (D) padrão de erros profissional mas escopo alto.

---

**Q0.1 — Foto da ficha física é sempre obrigatória.**

- Toda classificação (primeira ou reclassificação) exige `CLASSIFICATION_PHOTO` anexada. Backend continua rejeitando com `HttpError 409` se ausente.
- Não há modo "classificação sem foto" — nem como fluxo alternativo nem como escape com justificativa.
- **Implicação**: nenhuma mudança no schema, no `sample-command-service.js:2150-2151`, nem na trigger de banco. UX desta revisão não precisa prever nenhum botão "pular foto" em lugar nenhum.

**Q0.2 — Modo manual continua sendo fallback de erro técnico, não first-class.**

- O modo manual só é acessado via `ClassificationExtractionErrorModal (kind='technical')` — operador é obrigado a tentar a IA primeiro.
- Sem botão "Preencher manualmente" no preview ou no início do fluxo. Sem opção de skip da IA.
- **Implicação**: mantém pressão pra IA receber dados reais (melhora de treinamento) e evita banalizar manual. Custo aceito: 15–30 s perdidos quando o operador já sabe que a ficha vai falhar (ex: letra terrível). Caso esse custo se mostre alto na prática, reabrir Q0.2 numa revisão futura.

**Q0.3 — Reclassificação sempre exige foto nova.**

- Mesmo pra correção de typo, o operador refaz a foto da ficha. `updateClassification` mantém o mesmo contrato de exigência de foto que `completeClassification`.
- Sem reuso da foto da classificação original. Sem decisão automática por reason code.
- **Implicação**: nenhuma mudança no backend. UX da reclassificação reusa o mesmo fluxo de câmera + IA da classificação inicial.

**Q0.4 — Mantém status quo (operador escolhe campo a campo, sem default) — com revisão pendente.** ⚠️

- A reconciliação de divergências (`ClassificationDataMismatchModal`) continua **sem default**: operador é obrigado a escolher "Ficha" ou "Cadastro" pra cada campo divergente.
- **Decisão provisória**: não é a forma definitiva — revisaremos quando chegarmos no **Bloco F5 (Reconciliação de divergências)** com dados concretos sobre frequência das divergências e custo de tempo do operador.
- **Implicação**: nenhuma mudança imediata. Quando o Bloco F5 abrir, reabrir essa decisão e fechar definitivamente (pode virar T0.A se mudar).

**Q0.5 — Ficha física unificada se mantém no layout atual nesta revisão — com revisões pontuais quando relevante.** ⚠️

- A ficha em `print-templates/classification-form/index.html` (layout L1..L8 unificado em 2026-05-14) **não muda nesta revisão de fluxo**. UX digital se ajusta ao que existe.
- **Revisões pontuais permitidas**: conforme avançar nos blocos F3 (extração) e F4 (revisão), se identificarmos campos problemáticos (nunca preenchidos, ordem que confunde, ambiguidade), podemos abrir **mini-revisões focadas no layout + extração** no momento certo, sem expandir o escopo geral.
- **Implicação**: a UX digital trata os 22 campos atuais como fixos pra fins de design dos modais. Qualquer mudança de layout vira sub-decisão dentro de F3/F4 com seu próprio registro.

**Bloco 0 fechado em 2026-05-25** (com Q0.4 e Q0.5 marcadas pra revisão futura nos blocos F5 e F3/F4 respectivamente). ✅

### Bloco F1 — Entrada e caminhos para classificação

**F1.1 — Caminho 1 (FAB no detalhe): mantido como está, provisoriamente.** ⚠️

- FAB "Classificar" no detalhe permanece sem mudança. Sem tela de preparação, sem reposicionamento.
- **Provisória**: a página de detalhe da amostra será refatorada em revisão futura (layout/design). Quando isso acontecer, F1.1 será reaberta para realinhamento com o novo padrão visual.
- **Implicação**: zero mudança imediata em `app/samples/[sampleId]/page.tsx:3975`.

**F1.2 — Caminho 2: comportamento do modal pós-QR mantido como está.**

- `SampleLookupResultModal` continua com os 2 botões atuais: "Ver detalhes" e "Escanear novamente".
- Sem botão "Classificar agora" adicional. Operador que escaneou e quer classificar continua atravessando "Ver detalhes" → "Classificar" no detalhe (4 toques desde a navbar).
- **Implicação prática**: o Caminho 2 deixa de ser, na prática, um "caminho dedicado pra classificação" — ele é um caminho de **navegação por scan** que pode (por escolha do operador) terminar em classificação via Caminho 1. **F1.2.A** abaixo aprofunda esse escopo.

**F1.3 — Caminho 2: sem banner de pendências na câmera.**

- Tabbar "Câmera" abre câmera limpa (status quo). Sem banner "X aguardando classificação" sobre o scanner.
- **Implicação**: sem mudança em `app/camera/page.tsx`.

**F1.4 — Caminho 3: botão "Classificar" à direita do card, substituindo o chevron.**

- No card de cada item dentro de `OperationModal.tsx`, o botão "Classificar" ocupa a área hoje ocupada pelo `app-modal-card-indicator` (chevron). Layout compacto.
- **Implicação**: `OperationModal.tsx:67-85` precisa ser alterado — `<Link>` externo vira `<div>` clicável (área comum) + botão dedicado à direita. O chevron some.

**F1.5 — Caminho 3: botão sólido laranja com label "Classificar" (cor exata + tamanho + estados pendentes em F1.5.A/B/C).**

- Botão com **label texto** ("Classificar") e **fundo laranja sólido**, sem ícone.
- **Atenção**: hoje não existe botão sólido laranja como CTA no design system. Existem só usos pontuais de laranja:
  - `#e67e22` em badges PF (`.cv2-card-type.is-pf`, fundo `#fff7ed`) — laranja texto sobre fundo claro.
  - `#f59e0b` / `--brand-warning` em avisos de cliente incompleto (badge pill, rgba 12%, texto `#b45309`) — laranja "atenção".
- Esse novo padrão (botão sólido laranja CTA) terá impacto além deste botão — pode virar referência pra outras ações secundárias do app.
- **Implicação**: F1.5.A (tom de laranja), F1.5.B (tamanho/padding) e F1.5.C (estados hover/active/disabled) precisam ser fechados antes da implementação.

**F1.6 — Caminho 3: comportamento de tap simples (sem confirmação).**

- Tap no botão "Classificar" → `router.push('/camera?sampleId=X')` (Flow B, igual Caminho 1).
- Tap na área comum do card → `/samples/[id]` (status quo).
- Sem long-press, sem menu, sem modal de confirmação.
- **Implicação**: 2 áreas clicáveis no card, com `event.stopPropagation()` no botão pra não disparar o tap da área comum.

**F1.7 — Modal de pendências fica acessível só do dashboard.**

- Nenhum atalho adicional em `/samples`, navbar, ou outros lugares. Status quo + novo botão dentro do modal.
- **Implicação**: sem mudança fora de `components/dashboard/`.

**F1.8 — Tela de sucesso pós-classificação: modal com "Ver detalhes" + X (estrutura definida; comportamento do X por origem pendente em F1.8.A).**

- Após `CLASSIFICATION_COMPLETED`, o sistema mostra um **modal de sucesso** (header com check + título + animação de confirmação) com:
  - **Botão "Ver detalhes"** no canto inferior direito do modal → vai pra `/samples/[id]`.
  - **Botão "X"** no canto superior direito do header → fecha o modal e (provisoriamente) volta pra `/camera`.
- **Pendente em F1.8.A**: o X **deve sempre voltar pra câmera**, ou **deve voltar pra origem do caminho** (Caminho 1 → detalhe, Caminho 2 → câmera, Caminho 3 → modal de pendências)?
- **Pendente em F1.8.B**: hoje há auto-impressão da etiqueta após `CLASSIFICATION_COMPLETED` (`sample-command-service.js:1898`). O modal de sucesso menciona/dá feedback disso? (Ex: "Etiqueta enviada pra impressão" ou ícone)
- **Implicação**: novo modal a criar (provavelmente `ClassificationSuccessModal.tsx`). Substitui o redirecionamento direto atual (`router.push('/samples/[sampleId]')` pós-submit).

**F1.9 — Aviso explícito quando o caminho bate em status incompatível.**

- **Caminho 1**: FAB já não aparece se status incompatível (status quo, sem mudança).
- **Caminho 3**: query `dashboard/pending` já filtra (status quo presumido — a confirmar quando abrir o bloco de implementação).
- **Caminho 2 (única onde a mudança importa)**: quando o QR resolve uma amostra `INVALIDATED` ou `CLASSIFIED`, em vez do `SampleLookupResultModal` padrão, mostrar **modal de aviso específico** com mensagem clara e ações apropriadas.
- **Pendente em F1.9.A**: mensagem e ações exatas pra cada caso (INVALIDATED, CLASSIFIED).

**F1.2.A — Caminho 2 é "navegação por scan", não caminho de classificação.**

- O Caminho 2 (tabbar → câmera → QR → modal) deixa de ser classificado como "caminho de classificação" para fins deste doc. Ele é caminho de **navegação por scan** — leva ao detalhe, e dali o operador pode iniciar classificação via Caminho 1.
- O foco do bloco F1 e dos blocos seguintes passa a ser **Caminho 1** + **Caminho 3** como os 2 caminhos efetivos de classificação.
- **Implicação**: nenhuma mudança de código; é uma reclassificação semântica. Caminho 2 segue mencionado em "Estado atual do fluxo" como contexto, mas não recebe trabalho neste doc.

**F1.5.A — Fundo do botão "Classificar": `#f59e0b` (`--brand-warning`) sólido.**

- Reusa o tom já existente no design system pra warnings suaves (badge de cliente incompleto), agora aplicado como CTA sólido.
- **Implicação**: `--brand-warning` ganha um segundo uso semântico ("CTA de ação rápida"). Documentar na skill `design-system` quando a implementação fechar.

**F1.5.B — Tamanho e layout do botão dentro do card.**

- **Largura**: aproximadamente **1/4 da largura total do card** (ex: card ~340px → botão ~85px).
- **Alinhamento vertical**: centralizado dentro do card (não estica de topo a fundo).
- **Margem direita**: o botão **não encosta na borda direita do card** — manter padding/margem (valor exato em F1.5.D).
- **Texto do proprietário**: hoje sem limite — agora precisa de `text-overflow: ellipsis` + `white-space: nowrap` + `overflow: hidden` no `.app-modal-card-line` para caber no espaço reduzido. Nome longo vira "Cliente Muito Lon…" (ou similar).
- **Implicação**: edição em `OperationModal.tsx:67-85` e CSS associado (`app/globals.css` perto de `.app-modal-card-body` e `.app-modal-card-line`).

**F1.5.C — Estados visuais do botão: scale + opacity sutil no active, sem mudança de cor.**

- Alinhado com `feedback_no_green_buttons` (sem flash de cor no estado pressed) — vale também pra laranja.
- **Active (mobile tap / desktop click)**: `transform: scale(0.96)` + `opacity: 0.92` (padrão do app — valores exatos confirmar com componentes existentes na implementação).
- **Hover (desktop)**: leve aumento de saturação ou nenhum efeito (a definir na implementação; mobile-first não depende disso).
- **Disabled**: cinza neutro (opacidade ~40%). Não há caso previsto de disabled neste botão, mas mantém padrão pra coerência.

**F1.8.A — X do modal de sucesso sempre volta pra `/camera`.**

- Independente do caminho de origem (1, 2 ou 3), tap no X joga em `/camera`.
- **Trade-off aceito**: pode parecer estranho pra quem veio do Caminho 3 (modal de pendências) — esperaria voltar pra lista. Aceitamos a inconsistência em troca de simplicidade (sem rastrear origem no state/URL).
- **Implicação**: handler do X é `router.push('/camera')`. Reabrir F1.8.A se essa fricção aparecer em uso real.

**F1.8.B — Sem feedback de auto-impressão da etiqueta no modal de sucesso (por enquanto).** ⚠️

- O modal não menciona o `requestQrPrint` em background. Operador descobre quando a etiqueta sai da impressora (status quo).
- **Provisória**: reabrir se o operador relatar surpresa ("imprimi sem querer?" ou "esperava que imprimisse mas não saiu") em uso real.

**F1.9.A Caso A — Amostra `INVALIDATED` escaneada: modal de aviso com 1 ação.**

- **Mensagem**: _"Esta amostra está invalidada e não pode ser classificada."_
- **Ação única**: **"Fechar"** (fecha o modal, volta pro scanner ativo).
- Sem "Ver detalhes" — operador não tem ação útil possível com amostra invalidada no contexto da câmera.
- **Implicação**: novo modal/variante do `SampleLookupResultModal` (decidir entre extensão ou novo componente na implementação).

**F1.9.A Caso B — Amostra já `CLASSIFIED` escaneada: modal de aviso com 3 ações.**

- **Mensagem**: _"Esta amostra já foi classificada. Quer reclassificar?"_
- **Ações**:
  1. **"Reclassificar"** (primário) → `router.push('/camera?sampleId=X')` direto pra fluxo de reclassificação, pulando o detalhe.
  2. **"Ver detalhes"** → `/samples/[id]`.
  3. **"Fechar"** → volta pro scanner.
- **Implicação semântica**: o "Reclassificar" desse modal vira um **terceiro disparador da rota `/camera?sampleId=X`** (origens: FAB do detalhe, botão do Caminho 3, e agora modal de aviso pós-scan). O fluxo de reclassificação em si é o mesmo (`ClassificationReclassifyModal` aparece no meio).

**F1.5.D — Border-radius do botão: 8px (retangular suave). Margem direita do card: 12px.**

- `border-radius: 8px` combina com o estilo padrão dos cards do app (não vira pill).
- Margem direita: 12px (padrão de cards). Botão fica deslocado da borda direita do card, alinhado ao espaçamento interno geral.
- **Implicação**: regra CSS no botão `.app-modal-card-classify-cta` (nome provisório, definir na implementação) — `border-radius: 8px; margin-right: 12px;` (ou usar variáveis CSS equivalentes do app, se existirem).

**F1.5.E — Nome truncado: só ellipsis, sem feedback extra.**

- Quando o nome do proprietário exceder o espaço disponível, aplica `text-overflow: ellipsis` e fim. Sem tooltip, sem long-press, sem expansão inline.
- Operador que quiser ver o nome completo entra no detalhe via tap na área comum do card.
- **Implicação**: nenhum handler extra; só CSS no `.app-modal-card-line` (proprietário).

**Bloco F1 fechado em 2026-05-25** — 16 decisões cravadas (sub-pontos incluídos). ✅

### Bloco F2 — Captura da foto

**F2.1 — Câmera traseira forçada (status quo mantido).**

- Mantém `getUserMedia({ video: { facingMode: { exact: 'environment' } } })`.
- Sem fallback pra frontal, sem botão pra trocar. Câmera frontal nunca é usada na captura da ficha.
- **Implicação**: zero mudança em `app/camera/page.tsx:423-426`. Se traseira indisponível (desktop sem webcam traseira), operador continua sendo direcionado pra galeria.

**F2.2 — Galeria sempre visível.**

- Botão de galeria continua no top-right durante todo o fluxo `flowState='idle'`, mesmo com câmera funcionando.
- **Implicação**: zero mudança em `app/camera/page.tsx:1074-1080`. Operador escolhe entre câmera (caminho principal) e galeria (alternativa) a qualquer momento.

**F2.3 — QR scanner sempre ativo enquanto o operador está na página da câmera.**

- `qr-scanner` em paralelo (12 scans/s) com highlight visual sempre ligado em `flowState='idle' && cameraStatus='scanning'`.
- Scanner pausa automaticamente quando algum modal abre ou quando `flowState !== 'idle'` (já é o comportamento atual).
- Sem distinção visual entre "modo scan QR" e "modo fotografar ficha".
- **Implicação**: zero mudança no comportamento do scanner.

**F2.4 — Botão de captura: 68 px (status quo mantido).**

- Sem mudança de tamanho, posicionamento ou hit-area.
- Sem suporte a tecla de volume.
- **Implicação**: zero mudança em `.camera-hub-capture-btn` (CSS linhas 16386-16408).

**F2.5 — Feedback de captura: parcialmente definido, com sub-pontos abertos.**

Decisões cravadas:

- **Detecção de QR válido** → **vibração do celular** (sem som). Vibração dispara quando um QR é decodificado e validado (não em toda tentativa de leitura).
- **Captura manual da foto** → **som característico de shutter** (rápido, simples, não chamativo). Vibração da captura — definir em sub-pontos.

**F2.5.A — Captura: vibração 40 ms (mantida) + som somados.**

- Continua `navigator.vibrate(40)` no `captureFromVideoStream` + adicionar som.
- Vibração serve como **fallback tátil** quando o device está em modo silencioso (iOS Safari respeita silent mode; sem workaround prático).
- **Implicação**: zero mudança na linha de vibração; adicionar invocação do áudio em paralelo.

**F2.5.B — Som: Web Audio API sintetizado (REVISADA em 2026-05-25).**

> **Revisão**: a decisão original era asset `.mp3` curto em `public/sounds/`. Após análise pré-implementação descobriu-se que o projeto já tem padrão consolidado de sons curtos via Web Audio API em `lib/scanner/scanner-sound.ts` (ex: `playScanSuccessBeep()` — oscilador senoidal 1320 Hz, 130 ms). O `ScannerBridge` global do bipador físico de hardware reusa esse padrão. Decisão revisada pra manter consistência com o projeto + zero assets.

- Criar `lib/camera/camera-shutter-sound.ts` no mesmo padrão de `lib/scanner/scanner-sound.ts`:
  - `playShutterSound()` — som de "clack" sintetizado (provavelmente 2 osciladores curtos sequenciais com envelope rápido, ~120–150 ms total).
  - Reusa `AudioContext` singleton lazy (mesmo pattern).
  - Try-catch silent em falhas (não-crítico).
- Tocado no início de `captureFromVideoStream` em `app/camera/page.tsx:555` — **antes** do flash e vibração (som = primeira reação ao tap).
- **Modo silencioso**: Web Audio API respeita controle de volume do device (iOS silent switch, Android volume).
- **Primeira interação iOS**: tap no botão de captura é a interação válida; áudio dispara dentro da mesma call stack.
- **Implicação**: zero asset novo; sem dependência adicional; ~50 linhas de código sintetizado seguindo o pattern existente.

**F2.5.C — Vibração no QR: só quando confirma uma amostra resolvida.**

- Dispara **1 vez** depois de `resolveSampleByQr` retornar sample válido — sinal de "achei e validei".
- Não vibra por detecção bruta do scanner (evita ruído quando o operador mantém o QR enquadrado).
- Intensidade: **80 ms** (perceptível sem ser desagradável).
- Dedupe de 1.8 s já filtra repetições do mesmo QR no fluxo, então não há risco de vibração consecutiva.
- **Implicação**: adicionar `navigator.vibrate(80)` no `handleResolvedSample` em `app/camera/page.tsx:330` (após o setResult, antes de abrir o modal).

**F2.6 — Refazer foto a partir do preview: 2 taps mantidos (status quo).**

- "Tirar outra" + "Enviar" como botões dedicados no preview.
- Sem ícone X, sem swipe, sem long-press.
- **Implicação**: zero mudança em `app/camera/page.tsx:1125-1142`.

**F2.7 — Sem zoom/pinch no preview.**

- Operador confia visualmente; se a foto está ruim, a IA / etapas posteriores capturam (lote ilegível, erro técnico).
- **Implicação**: zero mudança no preview atual.

**F2.8 — Retângulo do overlay continua sempre visível (status quo).**

- Re-confirmado em código que o retângulo (`.camera-hub-overlay::before`, CSS linhas 16118-16127) é **puramente decorativo** (`pointer-events: none`) e **não interfere na foto** (`captureFromVideoStream` em `app/camera/page.tsx:555-583` desenha o `video` inteiro no canvas via `drawImage(video, 0, 0)` com `canvas.width = video.videoWidth`).
- O retângulo é o guia visual da leitura de QR. Operador aprende que serve só pra QR e ignora quando vai fotografar a ficha.
- Sem mudança de comportamento por caminho (Caminhos 1/3 também veem o retângulo).
- **Implicação**: zero mudança em CSS ou JSX.

**F2.9 — Tela de permissão negada / câmera unsupported: adicionar botão "Tentar novamente" (sem loading state).**

- Mantém mensagem atual + galeria como opção.
- **Adicionar** botão **"Tentar novamente"** logo abaixo da mensagem de erro (`app/camera/page.tsx:1061-1065`).
- Botão usa classes existentes `.camera-hub-btn .camera-hub-btn-secondary`.
- Handler `handleRetryCamera()` re-dispara `ensureScannerStarted()` direto, **sem loading state intermediário** — operador tem agência pra tentar quanto quiser; risco de spam é baixo.
- Mostrado nos dois estados: `'permission-denied'` (caso comum) e `'unsupported'` (caso raro de webcam externa conectada depois).
- **Implicação**: adicionar handler + envolver `<p role="alert">` numa nova `<div className="camera-hub-error-with-retry">` com o botão. Pequena regra CSS pra layout vertical (gap + center).

**Bloco F2 fechado em 2026-05-25** — 11 decisões cravadas. ✅

---

### Análise pré-implementação F1 (2026-05-25)

Realizada via 3 agentes Explore em paralelo (Etapa 2 do `## Padrão de implementação`), um por frente concreta.

#### Frente A — Botão "Classificar" no card do `OperationModal`

**Estrutura CSS atual** (`app/globals.css`):

- `.app-modal-card` (linhas 1510-1523): `display: grid; grid-template-columns: 1fr auto; gap: 0.7rem; border-left: 4.5px solid var(--status-color); border-radius: 14px; padding: 0.68rem 0.82rem;` Já é grid 2 colunas → acomoda botão naturalmente.
- `.app-modal-card-indicator` (linhas 1525-1532): **não é um chevron** — é uma **bolinha de status (0.5rem) com pulse animado** (`animation: status-pulse 2s ease-in-out infinite` quando `.is-status-classification-pending`). O "substituir o chevron" da decisão F1.4 vai na verdade substituir o **indicador animado**.
- Responsivo mobile (linhas 15205-15226): padding 0.58rem 0.72rem, indicator 0.42rem.

**Outros usos das classes** (busca global):

- `OperationModal.tsx` (único `.app-modal-card` clicável).
- `SampleLookupResultModal.tsx` reusa só `.app-modal-card-line` e `.app-modal-card-meta` como typography — não afetado por mudança de layout.

**Cor laranja `#f59e0b`**: já consolidada (gradiente `#f59e0b → #d97706` em `.spv2-toggle-btn.is-active`, border em `.cv2-filter-incomplete-chip.is-active`). Padrão reusável.

**Classe utilitária `.app-button`**: existe com `:active { transform: scale(0.96); }`. Reusável como base.

**Padrão "2 áreas clicáveis num card"**: **novo no projeto**. Exige decisão de semântica HTML (ver decisões derivadas D1).

**Testes**: nenhum teste para `OperationModal` ou `.app-modal-card*` no `tests/`. Sem regressão.

**Truncamento de texto**: padrão `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` usado em 20+ regras CSS. Só replicar em `.app-modal-card-line`.

#### Frente B — Modal de sucesso pós-classificação

**Já existe uma tela de sucesso** — não é só um `router.push` direto:

- `.camera-hub-success` em `app/camera/page.tsx:1207-1234`: view inline com check SVG animado, "Classificacao salva!", botões **"Sair"** e **"Ver detalhes"**.
- **Auto-redirect de 2 s** em `app/camera/page.tsx:979-987` — `useEffect` que faz `router.push('/samples/[id]')` após 2 s de `flowState === 'success'`. **⚠️ Precisa ser removido** quando o modal entrar (senão modal fecha sozinho).
- Estados-chave: `flowState='success'` + `confirmedSampleId` (linhas 788-789).

**Padrão de modal central de sucesso já existe** — `components/samples/SampleCreatedSuccessModal.tsx`:

- Usa `.app-modal.is-themed` (header verde).
- Check SVG animado, label + número em destaque, hint.
- Prop `entity?: 'sample' | 'blend'` troca textos.
- Actions: "Ver amostra" + "Criar outra".
- Botão X no header com `.app-modal-close` (2.2rem quadrado, rgba(255,255,255,0.16)).
- Acessibilidade: `role="dialog"`, `aria-modal="true"`, `useFocusTrap`.

**Skill `modals`** confirma `.app-modal.is-themed` como canônico. Padrão sucesso documentado (overlay com check verde).

**Auto-impressão (`requestQrPrint`)**: disparada em `sample-command-service.js:2205-2227` após `CLASSIFICATION_COMPLETED` commitado. Fire-and-forget. **Reclassificação não dispara** (só `completeClassification` faz; `updateClassification` não). Coerente com F1.8.B (sem feedback no modal).

**Reclassificação vs primeira classificação**: ambas passam por `saveClassification` que seta `flowState='success'`. Modal vai cobrir os 2 casos.

**Edge case pós-X**: se câmera veio com `?sampleId` (Caminhos 1 ou 3), `router.push('/camera')` sem sampleId vai resetar contexto. Já existe `resetClassificationFlow()` que limpa tudo. **Importante**: o push tem que ser pra `/camera` puro (sem preservar query string).

**Testes**: backend tem cobertura (`tests/sample-backend-sprint1.integration.test.js` linhas 363+ e 1245+ — auto-print, idempotency). **Zero testes UI** para a tela de sucesso atual.

#### Frente C — Avisos de status no Caminho 2

**Backend NÃO filtra por status** — `src/samples/sample-query-service.js:1119-1169` (`resolveSampleByQrToken`): `where: { OR: [{ id }, { internalLotNumber }] }` sem filtro de status. **Qualquer status já chega no frontend.** Gargalo crítico eliminado.

**`ResolveSampleByQrResponse.sample.status`** já existe em `lib/types.ts:694-709`, tipo `SampleStatus = 'REGISTRATION_CONFIRMED' | 'CLASSIFIED' | 'INVALIDATED'`.

**`SampleLookupResultModal`** atual (`components/SampleLookupResultModal.tsx`):

- Header **branco** (sem `is-themed`), não verde brand. Estrutura `.app-modal-lookup-result`.
- Props: `sample, title, primaryActionLabel, onPrimaryAction, onDetails, onClose, detailsLabel?`.
- 2 botões na ordem `[primary=Escanear novamente] [submit=Ver detalhes]`.
- `useFocusTrap`, `role="dialog"`, `aria-modal="true"`.
- Renderiza `<StatusBadge status={sample.status} />` na linha 68 (mas hoje não condiciona comportamento por status).

**Padrão de variantes do app**: `kind` prop + COPY dict + JSX condicional — exemplo claro em `ClassificationExtractionErrorModal.tsx:20-48` (kind `'illegible' | 'technical'` + `COPY[kind]`). Padrão consagrado no projeto.

**`StatusBadge`** (`components/StatusBadge.tsx`) — cópia pt-BR canônica:

- `INVALIDATED`: "Invalidada"
- `CLASSIFIED`: "Classificada"
- `REGISTRATION_CONFIRMED`: "Aguardando classificacao"

**Roteamento de reclassificação**: `/camera?sampleId=X` já funciona (`app/camera/page.tsx:118-120` lê `searchParams.get('sampleId')`, linhas 859-865 detecta `contextSampleStatus === 'CLASSIFIED'` e abre `ClassificationReclassifyModal`). Sem mudança de rota necessária.

**Tratamento de erro no scan** (offline/500): `app/camera/page.tsx:358-375` — `setCameraError` + `scheduleScannerRestart` (900 ms). **Não muda** nesta feature.

**Testes**: nenhum teste local para `SampleLookupResultModal` nem `resolveSampleByQr`.

---

### Gargalos identificados e decisões derivadas

A análise abriu 5 mini-decisões pra fechar **antes do plan mode**. São pequenas mas importam pra o resultado final.

**D1 — Semântica HTML do card com 2 áreas clicáveis** (decorrente da Frente A):

- **(A)** `<div role="button">` simples envolvendo a área comum + `<button>` para "Classificar". Menos semântico.
- **(B)** `<a href="/samples/[id]">` na área comum + `<button>` para classificar. **Recomendada** — separa "navegar para" de "ação imediata" de forma semanticamente correta.
- **(C)** `<article>` wrapper + `<a>` + `<button>` (mais acessível pra lista).

**D2 — Indicador de status (bolinha com pulse) será removido** (decorrente da Frente A): o `.app-modal-card-indicator` pulsante hoje sinaliza "tem pendência". Vai sumir pra dar lugar ao botão. O **botão laranja "Classificar"** por si só já chama atenção, mas confirmar:

- **(A)** Aceitar: botão laranja substitui o sinal visual (sem pulse).
- **(B)** Preservar: manter um pequeno indicador colorido na borda esquerda (já existe `border-left: 4.5px solid var(--status-color)`) e/ou reposicionar o pulse pra outro lugar.

**D3 — Modal de sucesso pós-classificação: estender `SampleCreatedSuccessModal` ou criar novo?**

- **(A)** Estender o existente com prop `entity: 'sample' | 'blend' | 'classification'`. Mais DRY mas mistura conceitos.
- **(B)** Criar **`ClassificationSuccessModal.tsx`** novo, copiando o padrão (header `is-themed`, check animado, X, "Ver detalhes"). **Recomendada** — mais explícito; padrão é replicável em poucas linhas.

**D4 — Modal de aviso QR (Caminho 2): estender `SampleLookupResultModal` com `kind` ou criar novos?**

- **(A)** Estender com `kind: 'lookup' | 'invalidated' | 'classified'` + COPY dict + actions condicionais. Segue o padrão do `ClassificationExtractionErrorModal`. **Recomendada** — coerente com convenção do projeto.
- **(B)** Criar 2 modais novos: `SampleInvalidatedAlertModal` e `SampleAlreadyClassifiedAlertModal`. Mais explícito mas duplica código.

**D5 — Visual do modal de sucesso da classificação: usar `is-themed` (header verde) igual ao `SampleCreatedSuccessModal`?** O `SampleLookupResultModal` usa header branco. O `SampleCreatedSuccessModal` usa header verde brand. Pra coerência com "modal de sucesso após salvar", o verde faz sentido — mas confirmar.

- **(A)** Header verde brand (`is-themed`), igual `SampleCreatedSuccessModal`. **Recomendada** — sinal visual de sucesso forte.
- **(B)** Header branco neutro, mais sóbrio.

#### Decisões derivadas fechadas em 2026-05-25

- **D1 — (B)** Card terá `<a href="/samples/[id]">` na área comum + `<button>` para classificar. Semântica clara: navegação vs ação imediata.
- **D2 — (A)** Bolinha de status pulsante removida no contexto do modal de classificação pendente. O botão laranja "Classificar" passa a ser o sinal visual primário.
- **D3 — (B)** Criar `components/samples/ClassificationSuccessModal.tsx` novo, baseado no padrão do `SampleCreatedSuccessModal`. Sem extensão da prop `entity` do existente.
- **D4 — (A)** Estender `SampleLookupResultModal` com `kind: 'lookup' | 'invalidated' | 'classified'` + COPY dict + JSX condicional. Coerente com `ClassificationExtractionErrorModal`.
- **D5 — (A)** `ClassificationSuccessModal` usa `.app-modal.is-themed` (header verde brand), idêntico ao `SampleCreatedSuccessModal`.

**Análise pré-implementação F1 concluída em 2026-05-25** — pronto para Etapa 3 (plan mode). ✅

### Bloco F3 — Detecção + extração IA

**F3.1 — `formDetectionService` (auto-crop) mantido (status quo).**

- O serviço de detecção e auto-crop continua ativo em `src/samples/form-detection-service.js`. Sem instrumentação adicional nesta rodada.
- **Implicação**: zero mudança em `detect-form`. F3.11 vai eventualmente trazer logs que permitem reavaliar.

**F3.3 — Modelo IA mantido: `gpt-4o` sem pin de versão (status quo).**

- Continua `model: 'gpt-4o'` em `src/samples/classification-extraction-service.js:452`.
- Sem fixar versão, sem trocar pra Claude, sem multi-provider.
- **Implicação**: zero mudança no modelo. Mudanças no prompt (F3.4 + F3.5) e schema (F3.6) podem cobrir o problema sem precisar trocar de modelo.

**F3.8 — Sem destaque visual de campos vazios vindos da IA (status quo).**

- O `ClassificationReviewModal` continua sem indicar quais campos vieram null da IA vs vazios.
- **Implicação**: zero mudança no JSX/CSS do Review.

**F3.10 — Modo manual expandido: novo caminho em `illegible` + preservação contextual.** ⚠️ EXPANDIDA em 2026-05-25.

> **Tensão revelada na análise pré-implementação**: a decisão original ("preservar campos preenchidos pela IA em erro parcial") **não tinha caso real** com o comportamento atual — `startManualMode()` só era acionado após `extraction-error-technical`, onde `classificationForm` é sempre vazio (catch antes de parse). Caminho **(B)** escolhido: expandir o escopo pra também oferecer "Continuar manual" no `extraction-error-illegible` (onde existe extração parcial real). Aí F3.10 ganha sentido.

**Mudanças concretas**:

1. **`ClassificationExtractionErrorModal (kind='illegible')`** ganha botão **"Continuar manual"** (além de "Tirar outra" e "Cancelar"). Visual coerente com `kind='technical'`.
2. **`ClassificationManualConfirmModal`** (2º modal explicativo) é reusado tal qual em ambos os casos — coerência total.
3. **`startManualMode`** ganha lógica condicional:
   - Origem `extraction-error-illegible` → **preserva** `classificationForm` atual (campos extraídos pela IA permanecem; nulls ficam vazios no form que é o estado natural). Lote fica vazio (não foi extraído); sacas/safra vêm do contexto.
   - Origem `extraction-error-technical` → **reseta** `classificationForm = EMPTY_CLASSIFICATION_FORM` (status quo — nada foi extraído).
   - Implementação: parâmetro `source` ou leitura do `flowState` antes do reset.

**Implicação**: além de ajuste em `startManualMode`, mudança em `ClassificationExtractionErrorModal.tsx` (adicionar botão condicional) + mudança no handler em `app/camera/page.tsx` que abre o modal de aviso illegible (adicionar `onContinueManual` no kind='illegible' equivalente ao technical).

**F3.11 — Telemetria básica de extração no backend.**

- Logar em `classification-extraction-service.js`: timestamp, modelo usado, tempo total (`processingTimeMs`), tokens de input/output (extraído de `response.usage`), sucesso/falha, código de erro se falha, lote da amostra (se disponível no input).
- Formato: log estruturado (JSON line) — confirmar padrão de logging do projeto na implementação.
- **Não inclui** breakdown por-campo (quais campos vieram null) — deixar pra onda seguinte se mostrar útil.
- **Implicação**: ~20–30 linhas em `classification-extraction-service.js` + possível ajuste em `extractAndPrepareClassification` no `sample-command-service.js` pra passar contexto da amostra.

**F3.2 — Cleanup oportunístico de órfãos em `_temp/`.**

- Toda vez que `detect-form` é chamado, antes de salvar o novo arquivo, varre `_temp/` e apaga arquivos com mtime > 24 h.
- Sem job/cron externo, sem scheduler — implementação em ~10 linhas no handler de `detect-form` (`sample-command-service.js:3572-3611`).
- Best-effort: erro de cleanup não bloqueia o fluxo principal (logado e ignorado).
- **Implicação**: ~10 linhas adicionadas no início de `detectClassificationForm`. Sem infra extra.

**F3.4 — Few-shot visual: 1 imagem-exemplo + JSON correspondente.**

- Adicionar à mensagem do usuário (antes da foto real) uma imagem de ficha bem preenchida + JSON esperado como exemplo único.
- Cobre o padrão principal de extração; suficiente pra ancorar a IA sem inflar muito tokens/latência.
- **Custo estimado**: +1k–5k tokens de input + ~1–2 s de latência por chamada.
- **Implicação**: imagem de exemplo precisa ser fornecida (F3.12 vai cobrir). Asset provavelmente em `src/samples/fixtures/extraction-example.jpg` (ou similar — a definir na implementação). JSON correspondente inline no código.

**F3.5 — Reforço de prompt: só fundos (cirúrgico).**

- Adicionar ao USER*PROMPT (`src/samples/classification-extraction-service.js` seção da L5) instrução lógica explícita: *"Em cada célula FD, o número manuscrito imediatamente à ESQUERDA do '=' é a `peneira`; o número manuscrito imediatamente à DIREITA do '=' é o `percentual`. Se um deles está ausente, retorne null para os dois campos do fundo."\_
- Não tocar nas seções de peneiras (L3/L4) — instrução existente é considerada suficiente pra elas.
- **Implicação**: ~5 linhas adicionadas ao USER_PROMPT. Baixo risco de regressão.

**F3.6 — Schema mantido como está (status quo).**

- Sem adicionar `pattern` em peneiras/percentuais (suporte limitado da OpenAI strict).
- Sem adicionar `minItems`/`maxItems` em `fundos` — `normalizeFundos` posterior em JS já garante array de 2 elementos.
- **Implicação**: zero mudança no schema.

**F3.7 — Retry simples em erros transitórios: 1 tentativa com backoff 1.5 s.**

- Em caso de erro `429` (rate limit) ou `5xx` (servidor) da OpenAI, fazer **1 retry** após 1.5 s.
- **Timeout (25 s) NÃO retenta** — já gastou tempo, refazer iria estourar paciência do operador.
- **PARSE_ERROR** (resposta sem JSON ou faltando chaves) também não retenta — provavelmente vai retornar erro igual.
- **Implicação**: ajuste em `extractClassificationFromPhoto` (`classification-extraction-service.js:450+`) — envolver a chamada `client.chat.completions.create` num pequeno wrapper com retry condicional. ~15 linhas.

**F3.9 — Validação mantida ("≥1 campo preenchido") (status quo).**

- Sem aviso por seção, sem validação dura, sem destaque visual.
- A premissa: F3.4 (few-shot) + F3.5 (reforço de prompt) devem melhorar peneiras/fundos a ponto de a maioria das classificações vir preenchida pela IA. Se for o caso, validação dura adicional vira fricção desnecessária.
- **Reabrir se**: após F3 implementado e em uso real, ainda houver muitas classificações salvas com peneiras/fundos vazios sem operador perceber.

**Bloco F3 fechado em 2026-05-25** — 12 decisões cravadas; F3.12 (fixture image) bloqueia parcialmente a implementação de F3.4 mas não impede começar o resto. ✅

#### Estratégia de implementação — 2 ondas

A implementação do Bloco F3 é dividida em **2 ondas independentes** pra avançar em paralelo sem ficar bloqueado pela imagem-exemplo (F3.12) que o usuário ainda vai fornecer.

**Onda 1 (independente da imagem)** — 5 frentes:

| Frente | Decisão | Resumo                                                                                    |
| ------ | ------- | ----------------------------------------------------------------------------------------- |
| F3.2   | C       | Cleanup oportunístico de órfãos > 24 h no `_temp/`, disparado no início de `detect-form`. |
| F3.5   | B       | Adicionar instrução lógica explícita no USER_PROMPT só na seção dos fundos.               |
| F3.7   | B       | 1 retry automático em 429/5xx com backoff 1.5 s. Timeout/PARSE_ERROR não retentam.        |
| F3.10  | —       | Modo manual preserva campos preenchidos pela IA em erro parcial.                          |
| F3.11  | B       | Telemetria básica no backend: tempo, modelo, tokens, sucesso/falha.                       |

**Onda 2 (depende da imagem do F3.12)** — 1 frente:

| Frente | Decisão | Resumo                                                                     |
| ------ | ------- | -------------------------------------------------------------------------- |
| F3.4   | B       | Few-shot visual com 1 imagem-exemplo + JSON correspondente no USER_PROMPT. |

**Ordem das ondas**: Onda 1 começa imediatamente; Onda 2 entra quando o usuário fornecer a imagem do F3.12. Sem dependência entre elas — Onda 2 pode rodar antes, depois ou durante a Onda 1 sem problema.

---

## Bloco F2.Q — Fidelidade visual da foto capturada — ENCERRADO sem mudanças ✅

**Status**: encerrado em 2026-05-25 sem alterações no pipeline.

**Conclusão**: avaliação manual de captura atual da `/camera` mostrou que cor, tom, contraste e textura do café estão adequados para classificação. Pipeline atual mantido como está:

- `facingMode: { exact: 'environment' }` em `app/camera/page.tsx:423-426` (sem constraints adicionais de câmera).
- Canvas drawing com `imageSmoothingEnabled: true` + `imageSmoothingQuality: 'high'` em `captureFromVideoStream` (`app/camera/page.tsx:555-583`).
- JPEG `quality: 0.95` (HQ) / `0.88` (legacy) + `maxDimension: 3072` / `1920` em `lib/compress-image.ts`.

**Reabrir se**: feedback de operadores em campo indicar que alguma característica visual está sendo perdida ou distorcida (cor falsa, defeito não visível, tom desviado).

---

## Bloco F3 — Detecção + extração IA

**Objetivo**: melhorar a precisão e confiabilidade da extração de dados manuscritos da ficha de classificação pela IA, com foco especial em **peneiras (L3 + L4) e fundos (L5)** — campos identificados pelo usuário como tendo extração ruim hoje. Reduzir fricção pós-extração, dar feedback claro sobre campos vazios, e ganhar observabilidade pra medir o que realmente funciona.

**Escopo**: 3 etapas do pipeline:

1. **`detect-form`** — pré-processamento que detecta a forma da ficha e recorta (com fallback "continuar assim").
2. **`extract-and-prepare`** — chamada IA (OpenAI gpt-4o) que extrai todos os campos.
3. **Frontend pós-extração** — mapeamento da resposta → form, exibição no `ClassificationReviewModal`, tratamento de erros (illegible vs technical).

**Fora do escopo**: Bloco F4 (revisão dos campos já preenchidos — UX do form em si), F5 (reconciliação de divergências sacas/safra/lote).

### Estado atual (síntese das 3 análises Explore)

#### Etapa 1 — `detect-form` (`app/api/v1/classification/detect-form/route.ts`)

- Não é só validação: tem `formDetectionService` (`src/samples/form-detection-service.js:16-137`) que faz processamento real (resize 800 px → grayscale → blur σ=15 → threshold ≥180 → contornos → recorte com padding 5%).
- Timeout de **5 s**; se falha, retorna `{ detected: false }` mas mantém arquivo original — fluxo segue via "Continuar assim".
- Salva 2 arquivos em `data/uploads/_temp/`: original (`temp-${token}.jpg`) e cropped (`temp-${token}-cropped.jpg`).
- **Cleanup só na confirmação** da classificação; órfãos (foto tirada e fluxo abandonado) acumulam indefinidamente.
- **Sem logs/telemetria** — não dá pra medir taxa de detecção bem-sucedida.
- Sem testes dedicados.

#### Etapa 2 — `extract-and-prepare` (`src/samples/classification-extraction-service.js`)

- Modelo: **`gpt-4o`** (linha 452, sem pin de versão — segue defaults da OpenAI), `temperature: 0`, `max_tokens: 1500`, `detail: 'high'` na imagem, `response_format: { type: 'json_schema', strict: true }`.
- Timeout: **25 s** via `AbortController`. **Sem retry** em 429/500/timeout.
- Imagem como base64 data URI (não URL).
- Prompts (texto puro, sem few-shot visual):
  - **SYSTEM_PROMPT** (linhas 10-30): contexto da ficha SAFRAS, regras de extração (manuscrito only, null se vazio, virgula brasileira).
  - **USER_PROMPT** (linhas 36-122): descrição célula a célula do layout L1–L8.
  - Sobre peneiras (L3/L4): ordem explícita "P18, P17, P16, MK, P15" + alerta sobre MK na 4ª posição.
  - Sobre fundos (L5): descreve as 3 partes da célula FD (peneira | "=" impresso | percentual) **mas sem instrução lógica clara** tipo "número à esquerda do '=' é peneira, à direita é percentual".
- Schema JSON strict:
  - Peneiras: 10 chaves obrigatórias (`p18..p10`, `mk`), todas `string | null`, sem regex.
  - Fundos: array de objetos `{ peneira, percentual }`, mas **sem `minItems`/`maxItems`** no schema da OpenAI (força [2 itens] depois na normalização JS).
- Defesas pós-resposta:
  - `KNOWN_LABELS` (97 rótulos) — zera valor se IA retornar um rótulo (ex: "P18" em vez de número).
  - `toNumericOrNull` valida regex `^\d+([,.]\d+)?$`.
  - `normalizeFundos` força array de tamanho 2.
- **Sem logs** — `processingTimeMs` calculado mas só retornado no payload; tokens consumidos não rastreados.
- 9 testes em `tests/classification-extraction-service.test.js` cobrindo mocks JSON, normalização, casos de erro — **zero testes com imagem real**.

#### Etapa 3 — Frontend (`app/camera/page.tsx` + `lib/classification-form.ts` + `ClassificationReviewModal.tsx`)

- Estados de fluxo: `'detecting' → 'detected' → 'extracting' → 'confirming' (Review)` no happy path; `'extraction-error-illegible'` (lote = null + hasContext) ou `'extraction-error-technical'` (catch).
- Sem timeout client-side; sem cancelamento; sem deduplicação de cliques rápidos.
- `mapExtractionToForm` (`lib/classification-form.ts:303-314`): mapeia campos extraídos achatados (`p18..p10, mk, fundo1_peneira, fundo1_percentual, fundo2_peneira, fundo2_percentual`) → keys do `ClassificationFormState`. **Null da IA → campo ausente do spread → vazio no form** (sem destaque visual).
- `ClassificationReviewModal` renderiza peneiras em grid 5×2 e fundos em layout `peneira = %`. **Nenhuma indicação visual** de quais vieram da IA vs vazios.
- Validação genérica de submit: **"pelo menos 1 dos 22 campos preenchido"** — permite salvar com peneiras/fundos totalmente vazios sem aviso.
- Modo manual (após erro técnico): reseta `classificationForm` pra `EMPTY_CLASSIFICATION_FORM` — operador preenche tudo do zero, sem indicação de quais campos a IA deveria ter preenchido.
- `compareIdentification` (divergências) só compara lote/sacas/safra — **nunca compara peneiras/fundos**.
- Modal de erro `'illegible'`: "Tirar outra" / "Cancelar"; `'technical'`: + "Continuar manual" → 2º confirm → form vazio.

### Pontos de fricção identificados (hipóteses pra peneiras/fundos ruins)

1. **Prompt menciona layout de fundos mas sem instrução lógica explícita** — "ESQUERDA do '=' = peneira, DIREITA = percentual" não está dito; a IA infere geometria.
2. **Zero few-shot visual** — sem imagem-exemplo de ficha preenchida + JSON esperado pra calibrar.
3. **Modelo genérico** (`gpt-4o`) sem fine-tuning ou contexto específico de fichas de café.
4. **Schema permissivo** — peneiras como `string | null` sem regex; fundos sem `minItems` no schema.
5. **Sem retry em erro transitório** (429/500/timeout) — operador re-tenta manualmente.
6. **Sem feedback visual de campos vazios** no Review — operador pode não notar que 8 peneiras vieram null e salvar incompleto.
7. **Modo manual perde toda info da IA** — operador preenche tudo do zero, sem indicação dos campos que a IA "tentou".
8. **Zero observabilidade** — não dá pra medir taxa de sucesso real, identificar quais campos falham mais.

### Perguntas

#### Grupo A — Pipeline de detecção (`detect-form`)

##### F3.1 — `formDetectionService` (auto-crop) continua ativo, vira opcional ou some?

**Análise**: hoje o detect roda sempre antes da extração. Quando ele consegue recortar bem, manda só o recorte pra IA (foto menor, mais foco). Quando falha, manda a foto inteira via "Continuar assim". A questão é: o recorte automático ajuda ou atrapalha a extração da IA? Se o crop é impreciso (corta parte da ficha, deixa a IA com info incompleta), pode estar **piorando** a extração das peneiras/fundos. Sem logs, não dá pra saber a taxa de acerto.

- **(A)** Manter como está (status quo).
- **(B)** Manter mas adicionar **logs de telemetria** (taxa de detecção bem-sucedida, taxa de falha, tempo médio). Decisão de manter/eliminar fica pra depois com dados.
- **(C)** Eliminar o auto-crop e sempre mandar foto inteira pra IA — confia que `gpt-4o` com `detail: 'high'` foca sozinho na ficha (que ocupa 15–30% da cena conforme prompt).
- **(D)** Manter o auto-crop **mas mandar AMBAS as imagens** (original + cropped) pra IA, deixar ela decidir qual usar. Custo: +1 imagem por chamada (latência + tokens).

##### F3.2 — Cleanup de arquivos órfãos no `_temp/`

**Análise**: hoje arquivos só são deletados se o fluxo chega na confirmação da classificação. Quem tira foto e abandona deixa o arquivo lá pra sempre. Em produção isso vai virar TB de disco com o tempo.

- **(A)** Ignorar (status quo).
- **(B)** Job/cron que apaga arquivos `_temp/temp-*` mais antigos que X horas (ex: 24 h).
- **(C)** TTL no nome do arquivo + cleanup oportunístico (toda vez que detect-form roda, varre e apaga > 24 h).

#### Grupo B — Extração IA (`extract-and-prepare`)

##### F3.3 — Modelo IA: manter `gpt-4o` sem pin, fixar versão, trocar?

**Análise**: hoje `model: 'gpt-4o'` sem pin de versão. A OpenAI faz rollout silencioso de updates do `gpt-4o`. Hoje a extração funciona OK pra alguns campos e mal pra peneiras/fundos. Mudanças do modelo podem melhorar ou piorar isso sem aviso.

- **(A)** Manter `gpt-4o` sem pin (status quo).
- **(B)** Fixar versão (ex: `gpt-4o-2024-11-20`) pra ter comportamento previsível enquanto investigamos o problema. Atualizar manualmente quando OpenAI lançar nova versão e a gente validar.
- **(C)** Trocar pra **Claude Sonnet 4.5 ou Opus 4.7** via Anthropic API (modelos novos com visão forte; podem extrair manuscrito melhor; teste empírico necessário).
- **(D)** Multi-provider: rodar paralelo em 2 modelos (OpenAI + Anthropic) e cruzar resultados — alta latência e custo dobrado, ganho de confiabilidade.

##### F3.4 — Adicionar **few-shot visual** ao prompt?

**Análise**: hoje o prompt é texto puro. A IA nunca viu um exemplo de ficha preenchida + JSON esperado. Para tarefas visuais complexas (interpretar grid manuscrito), few-shot frequentemente melhora bastante.

- **(A)** Sem few-shot (status quo).
- **(B)** Adicionar 1 imagem-exemplo de ficha bem preenchida + JSON correspondente como mensagem prévia.
- **(C)** Adicionar 2 imagens-exemplo (1 ficha simples + 1 ficha complexa com peneiras/fundos densas) + JSONs.
- **(D)** Adicionar exemplo "negativo" também — ficha com letra ruim + JSON com vários `null` mostrando que "vazio quando ilegível" é OK.

**Custo**: aumenta tokens de input (~1k–5k tokens por imagem em detail high), aumenta latência ~1–2 s, aumenta custo da chamada.

##### F3.5 — Reforçar prompt nas peneiras e fundos com instrução lógica explícita?

**Análise**: o prompt descreve "peneira | '=' | percentual" como geometria, mas não fala "leia o número à ESQUERDA do '=' como `peneira` e o número à DIREITA como `percentual`". Pra IA isso pode ser ambíguo.

- **(A)** Manter prompt atual (status quo).
- **(B)** Adicionar instrução lógica explícita no USER_PROMPT (sem mudar estrutura). Ex: "Em cada célula FD, o número manuscrito imediatamente à esquerda do '=' é a `peneira`; o número manuscrito imediatamente à direita do '=' é o `percentual`. Se um deles está ausente, retorne null para os dois."
- **(C)** (B) + reescrever a seção de peneiras com mais ênfase ("Cada uma das 10 células de peneira contém **apenas um número**. Se a célula está vazia ou rasurada, retorne null. Não copie de outra célula.").
- **(D)** Refazer o prompt inteiro com estrutura nova (passo a passo guiado: "1. Encontre a ficha; 2. Identifique a linha 3; 3. Para cada uma das 5 células…"). Maior risco — pode quebrar o que já funciona.

##### F3.6 — Apertar JSON schema (regex/validação)?

**Análise**: hoje peneiras aceitam qualquer string ou null; fundos aceitam qualquer array. A normalização posterior em JS pega muita coisa, mas se a IA já produzir saída no formato certo o resultado é melhor.

- **(A)** Manter schema atual (status quo).
- **(B)** Adicionar `pattern: '^\\d+([,.]\\d+)?$'` em peneiras/percentuais (mas JSON schema strict da OpenAI **não suporta** `pattern` em `string` ainda — confirmar; se não suporta, fica só na normalização).
- **(C)** Adicionar `minItems: 2, maxItems: 2` em `fundos` (essa **é** suportada — força a IA a sempre devolver 2 itens, eliminando a normalização pós).

##### F3.7 — Adicionar retry automático em erros transitórios?

**Análise**: hoje qualquer erro (timeout 25 s, 429 rate limit, 500 server error) cai direto pro frontend como `extraction-error-technical`. Operador re-tenta manualmente — mas era pra ser transparente em casos transitórios.

- **(A)** Sem retry (status quo).
- **(B)** Retry simples: 1 retry em 429 ou 5xx com backoff de 1.5 s. Timeout (25 s atingido) **não** retenta (já gastou tempo).
- **(C)** Retry exponencial: 2 retries (500 ms + 1500 ms) em qualquer erro transitório.
- **(D)** Retry no frontend (não no backend) — operador vê "Tentando de novo..." 2 s e a chamada refaz.

#### Grupo C — Frontend UX pós-extração

##### F3.8 — `ReviewModal` deve destacar campos que vieram **vazios** da IA?

**Análise**: hoje peneiras/fundos vazios ficam idênticos a campos que o operador escolheu deixar em branco. Sem destaque, operador pode não perceber e salvar incompleto.

- **(A)** Sem destaque (status quo).
- **(B)** Destaque visual sutil (borda amarela ou ícone "⚠" no campo) **só nos campos que a IA tentou e retornou null**.
- **(C)** Painel agregado no topo do form: "⚠ A IA não conseguiu extrair: P14, P10, fundo 1 — verifique a ficha". Operador vê o resumo sem precisar varrer 22 campos.
- **(D)** (B) + (C) combinados.

##### F3.9 — Validação mais rigorosa antes de salvar?

**Análise**: hoje só "pelo menos 1 campo preenchido". Permite salvar uma classificação com **só "padrão" preenchido e nada mais** — provavelmente errado em 99% dos casos.

- **(A)** Manter validação genérica (status quo).
- **(B)** Validação por seção: se peneiras tem `<3` preenchidas, mostrar aviso ("Você só preencheu 2 peneiras. Confirma?") com botão "Confirmar mesmo assim" / "Voltar".
- **(C)** Validação obrigatória de subconjunto mínimo (ex: pelo menos `padrão` + `bebida` + `pelo menos 3 peneiras` + `pelo menos 1 fundo`). Bloqueia salvar sem essas.
- **(D)** Sem validação dura, mas destacar visualmente seções "incompletas" no Review (vermelho discreto), sem bloquear.

##### F3.10 — Modo manual: preservar info da IA que falhou parcialmente?

**Análise**: hoje quando a IA dá erro técnico e operador escolhe modo manual, o form é zerado. Mas se a IA chegou a extrair algo (ex: peneiras vieram OK, só os fundos falharam), perdemos esses dados.

- **(A)** Zerar tudo no modo manual (status quo).
- **(B)** Se há `extractionResult` parcial, preservar os campos que vieram preenchidos; só zerar campos null. Operador vê o que a IA achou + preenche o resto.
- **(C)** Diferenciar "erro técnico antes da extração" (zera tudo, modo manual real) de "extração veio com nulls" (entra no Review com nulls, não no modo manual).

#### Grupo D — Observabilidade

##### F3.11 — Adicionar telemetria de extração?

**Análise**: hoje zero logs. Sem isso, é impossível medir se uma mudança melhorou ou piorou a taxa de sucesso.

- **(A)** Sem telemetria (status quo).
- **(B)** Logs básicos no backend: tempo, sucesso/falha (e código de erro), tokens consumidos, modelo usado. Salva em log estruturado (já existe padrão? a confirmar).
- **(C)** (B) + por-campo: quais campos vieram null vs preenchidos em cada extração. Permite identificar "fundo 1 vem null em 80% dos casos".
- **(D)** (C) + reporting ao operador opcional ("Achou estranho? Avise-nos") com link pra reportar — coleta amostras pra fine-tuning futuro.

#### Grupo E — Testes

##### F3.12 — Investir em testes com imagens reais?

**Análise**: hoje os 9 testes só usam mocks JSON. Não testam a IA de verdade. Pra confiar que uma mudança no prompt/schema realmente melhora, precisamos de fixtures reais.

- **(A)** Status quo (sem fixtures de imagem).
- **(B)** Adicionar 3–5 fotos reais de fichas em `tests/fixtures/classification/` + snapshots de extração esperada. Roda só localmente (não em CI — custo da OpenAI).
- **(C)** (B) + script `npm run test:extraction` que roda essas fixtures, mostra diff esperado vs obtido, requer aprovação manual.

---

### Bloco 0 — Premissas fundacionais

- [x] **Q0.1** — Foto sempre obrigatória (status quo).
- [x] **Q0.2** — Modo manual continua sendo fallback de erro técnico.
- [x] **Q0.3** — Reclassificação sempre exige foto nova.
- [x] **Q0.4** ⚠️ **PROVISÓRIA** — Status quo (sem default); reabrir no Bloco F5.
- [x] **Q0.5** ⚠️ **PROVISÓRIA** — Layout da ficha mantido nesta revisão; revisões pontuais permitidas em F3/F4.

**Bloco 0 fechado em 2026-05-25** (com Q0.4 e Q0.5 marcadas pra revisão futura). ✅

### Bloco F1 — Entrada e caminhos para classificação

**3 caminhos** (reorganizados em 2026-05-28, Sessão 2): Caminho 1 (detalhe, existente) · Caminho 2 (foto direta, Flow A, existente) · Caminho 3 (modal de pendências, implementado).

> **Antigo Caminho 2** (QR scan) saiu da lista de caminhos de classificação. Decisões F1.2/F1.3 preservadas como histórico na seção "QR scan como navegação". Gera tensão T1.A com F1.9.A Caso B.

Caminho 1:

- [x] **F1.1** ⚠️ **PROVISÓRIA** — Status quo; revisar na refatoração futura da página de detalhe.

Caminho 2:

- [x] **F1.2** — Mantém comportamento atual do modal pós-QR.
- [x] **F1.2.A** — Caminho 2 é "navegação por scan", não caminho de classificação.
- [x] **F1.3** — Sem banner na câmera.

Caminho 3:

- [x] **F1.4** — Botão à direita, substituindo o chevron.
- [x] **F1.5** — Botão sólido laranja com label "Classificar" (sem ícone).
- [x] **F1.5.A** — `#f59e0b` (`--brand-warning`) sólido.
- [x] **F1.5.B** — ~1/4 da largura do card, centralizado vertical, margem da borda direita; nome do proprietário com `ellipsis`.
- [x] **F1.5.C** — Active = scale 0.96 + opacity sutil; sem mudança de cor.
- [x] **F1.5.D** — Border-radius 8px; margem direita 12px.
- [x] **F1.5.E** — Só ellipsis, sem feedback extra.
- [x] **F1.6** — Tap direto sem confirmação; área comum continua indo pro detalhe.
- [x] **F1.7** — Modal só no dashboard.

Transversais:

- [x] **F1.8** — Modal de sucesso com "Ver detalhes" + X (estrutura definida).
- [x] **F1.8.A** — X sempre vai pra `/camera`, independente do caminho de origem.
- [x] **F1.8.B** ⚠️ **PROVISÓRIA** — Sem feedback de impressão; revisitar se aparecer fricção real.
- [x] **F1.9** — Aviso explícito quando status é incompatível (Caminho 2).
- [x] **F1.9.A Caso A** — `INVALIDATED`: msg + só "Fechar".
- [x] **F1.9.A Caso B** — `CLASSIFIED`: msg + "Reclassificar" / "Ver detalhes" / "Fechar".

**Bloco F1 fechado em 2026-05-25** — 16 cravadas, 0 pendentes na 1ª rodada. ✅

**Reaberto em 2026-05-28 (Sessão 2)** com 3 perguntas novas referentes ao Caminho 2 — Foto direta:

- [ ] **F1.10** — Caminho 2 (Foto direta) deve continuar existindo? (manter / sinalizar visualmente / aposentar)
- [ ] **F1.11** — IA falha em ler o lote no Caminho 2: review com lote vazio (status quo) / `extraction-error-illegible` / aviso inline?
- [ ] **F1.12** — Status incompatível no Caminho 2: erro genérico no review / modal dedicado / não bloquear?

**Tensão aberta** vinda desta reorganização:

- **T1.A** — Atalho "Reclassificar" no modal pós-QR (F1.9.A Caso B) vs novo princípio "QR → detalhe, não → classificação". A decidir.

### Bloco F2 — Captura da foto

- [x] **F2.1** — Câmera traseira forçada (status quo).
- [x] **F2.2** — Galeria sempre visível (status quo).
- [x] **F2.3** — QR scanner sempre ativo na página da câmera (status quo).
- [x] **F2.4** — Botão 68 px mantido (status quo).
- [x] **F2.5** — QR válido vibra; captura toca som de shutter.
- [x] **F2.5.A** — Vibração 40 ms mantida + som somados na captura.
- [x] **F2.5.B** — Asset `.mp3` curto (~150 ms, ~3 KB) em `public/sounds/`.
- [x] **F2.5.C** — Vibração 80 ms só quando `resolveSampleByQr` retorna sample válido.
- [x] **F2.6** — Preview com "Tirar outra" + "Enviar" (status quo).
- [x] **F2.7** — Sem zoom no preview (status quo).
- [x] **F2.8** — Retângulo do overlay sempre visível (status quo, confirmado que não interfere na foto).
- [x] **F2.9** — Adicionar botão "Tentar novamente" na tela de permissão negada / unsupported.

### Bloco F2.Q — Fidelidade visual da foto capturada

- [x] **Encerrado** em 2026-05-25 sem mudanças — captura atual avaliada como adequada.

### Bloco F3 — Detecção + extração IA

12 perguntas abertas em 5 grupos.

Grupo A — Detecção:

- [x] **F3.1** — `formDetectionService` mantido (status quo).
- [x] **F3.2** ✅ **IMPLEMENTADO** — Cleanup oportunístico no início de `detect-form` (`a414cfd`).

Grupo B — Extração IA:

- [x] **F3.3** — `gpt-4o` sem pin mantido (status quo).
- [x] **F3.4** ✅ **IMPLEMENTADO** — Few-shot visual com 1 imagem-exemplo + JSON (`0afcd66`).
- [x] **F3.5** ✅ **IMPLEMENTADO** — Reforço de prompt cirúrgico nos fundos (`1e080fd`).
- [x] **F3.6** — Schema mantido (status quo).
- [x] **F3.7** ✅ **IMPLEMENTADO** — 1 retry em 429/5xx com backoff 1.5 s (`77eeccd`).

Grupo C — Frontend UX:

- [x] **F3.8** — Sem destaque (status quo).
- [x] **F3.9** — Validação "≥1 campo" mantida (status quo).
- [x] **F3.10** ✅ **IMPLEMENTADO (expandida)** — Modal "Continuar manual" em illegible + preservação parcial (`92976fd`).

Grupo D — Observabilidade:

- [x] **F3.11** ✅ **IMPLEMENTADO** — Telemetria básica via stderr JSON line (`30001cc`).

Grupo E — Testes:

- [x] **F3.12** ✅ **FORNECIDO** — Imagem-exemplo do usuário em `src/samples/fixtures/extraction-example.jpg` + JSON cravado em `extraction-example.json` (`b90d8a9`).

### Bloco F4 — Revisão dos campos

_(Ainda não iniciado.)_

### Bloco F5 — Reconciliação de divergências

_(Ainda não iniciado.)_

### Bloco F6 — Reclassificação

_(Ainda não iniciado.)_

### Bloco F7 — Tipo da classificação

_(Ainda não iniciado.)_

### Bloco F8 — Classificadores

_(Ainda não iniciado.)_

### Bloco F9 — Confirmação e sucesso

_(Ainda não iniciado.)_

### Bloco F10 — Erros, offline e retry

_(Ainda não iniciado.)_

---

## Tensões revisadas

### T1.A — Atalho "Reclassificar" no modal pós-QR vs princípio "QR → navegação, não classificação"

- **Decisão antiga (2026-05-25, F1.9.A Caso B)**: o `SampleLookupResultModal` com `kind='classified'` (amostra já classificada detectada via QR scan) tem 3 ações: **"Reclassificar"** (atalho direto pra `/camera?sampleId=X`) / "Ver detalhes" / "Fechar". A ação "Reclassificar" é o terceiro disparador da rota de classificação com `sampleId`, paralelo ao FAB do Caminho 1.
- **Novo princípio (Sessão 2, 2026-05-28)**: QR scan **não** é caminho de classificação — vira apenas navegação até o detalhe (Caminho 1). Operador escaneia, vê modal, vai pro detalhe, e só lá decide reclassificar via FAB.
- **Conflito**: o atalho "Reclassificar" no modal pós-QR fura o novo princípio. Pra ser coerente, o botão deveria sair do modal — operador atravessaria "Ver detalhes" → FAB "Reclassificar" no detalhe (1 toque a mais, mas alinhado com o princípio).
- **Status**: aberta, a decidir em sessão futura. Não bloqueia o avanço do Bloco F1 nem dos blocos seguintes.

---

## Log de sessões

### 2026-05-28 — Sessão 2 (spinner integrado no bottom sheet + limpeza) ✅

Sequência do preview em bottom sheet — agora o pipeline pós-captura.

- **`ad9029d` — `refactor(camera): remove classes orfas do preview antigo`**
  - Removidas `.camera-hub-preview-img`, `.camera-hub-preview-actions`, `.camera-hub-preview-btn-retake`, `.camera-hub-preview-btn-send` do `globals.css`. Nenhuma referência restante no JSX após `6a6acd9`. 44 linhas a menos.

- **`6023656` — `feat(camera): spinner integrado no bottom sheet com reducao suave`**
  - **Antes**: ao tap "Enviar" o sheet fechava e os 4 estados de processamento (`detecting`, `detected`, `extracting`, `resolving`) renderizavam blocos inline no `.camera-hub-stage` — ruptura visual sheet-fecha-stage-aparece.
  - **Agora**: o BottomSheet **continua aberto** durante todo o pipeline. Ao tap "Enviar" recebe a classe `is-processing` que aciona uma `transition: max-height 0.45s cubic-bezier(0.22, 1, 0.36, 1)` reduzindo de `~98 dvh` pra `clamp(190px, 32dvh, 260px)`. Sensação de "modal descendo até virar uma barrinha com o status". Footer some, conteúdo vira spinner + mensagem.
  - **Mensagens em pt-BR sem acentos** (mantidas idênticas às do stage antigo):
    - `detecting` → "Procurando ficha na foto..." + spinner verde
    - `detected` → "Ficha identificada!" + check verde (intermediário rápido)
    - `extracting` → "Extraindo dados da classificacao..." + spinner
    - `resolving` → "Buscando amostra..." + spinner
  - **Title** muda dinâmico: "Conferir foto" → "Processando".
  - **Transição entre mensagens**: `key={flowState}` no container interno faz o React remontar a cada estado, disparando o `cam-preview-processing-in` (fade-in com translateY de 4px). Operador percebe a evolução visual.
  - **Acessibilidade**: `role="status"` + `aria-live="polite"` no container interno — screen readers anunciam cada mudança de mensagem.
  - **Padrões reusados**: `@keyframes cam-spin` (já existente em `globals.css:17901` aprox), tokens `--brand-green-soft`.
  - **Comportamento de erro**: quando o pipeline falha (`extraction-error-illegible` ou `extraction-error-technical`), o `flowState` sai da lista de `open=true` → sheet fecha naturalmente via slide-down → `ClassificationExtractionErrorModal` (modal central existente) abre. Sem mudança no modal de erro nesse passe — o usuário vai pensar na sequência depois.

**Quality gates**: lint ✅ · format:check ✅ · typecheck ✅ · build ✅.

**Pendência mantida**: estado `detect-failed` (2 botões "Fotografar novamente" / "Continuar assim") continua inline no stage. Não é spinning, é estado de soft-erro aguardando decisão. Migrar pro sheet quando fizer sentido na sequência. As classes `.camera-hub-extracting*` permanecem no CSS pelo mesmo motivo.

### 2026-05-28 — Sessão 2 (preview da foto em bottom sheet) ✅

Sequência da unificação do erro — agora a confirmação da foto capturada antes da IA.

- **`6a6acd9` — `feat(camera): preview da foto capturada em bottom sheet`**
  - **Antes**: foto renderizada inline no `.camera-hub-stage` com `object-fit: cover` (`globals.css:17828`) — proporção do stage cortava as laterais da ficha (que é quase quadrada). Operador via apenas parte e a IA recebia a foto inteira: regressão silenciosa quando uma área cortada estava borrada.
  - **Agora**: `BottomSheet` com classe modificadora `.camera-preview-sheet`, cobrindo ~98 dvh, foto com `object-fit: contain` (inteira sem corte). Fundo escuro (`#15211c`) pra destacar a foto. Footer sticky com 2 botões: "Tirar outra" (secundário outline) + "Enviar" (primário verde gradient).
  - **Controle exclusivo pelos 2 botões**: `onDismissAttempt={() => Promise.resolve(false)}` bloqueia tap-backdrop, ESC e back Android. `dragToDismiss={false}` bloqueia gesto. X e drag handle escondidos via CSS. Cumpre o pedido explícito de "só botões".
  - **Navbar escondida automaticamente** via `body.is-bottom-sheet-open` (`globals.css:15814`), comportamento padrão do BottomSheet.
  - **Foto sempre vertical** (decisão do usuário) + sheet vertical → `contain` aproveita quase toda a área disponível, sem desperdício.
  - **Extensão segura do BottomSheet**: nova prop opcional `className?: string` concatenada na className do sheet. Permite override por seletor descendente sem mexer no JSX interno. Sem impacto em outros usos do componente.
- **Padrões reusados**: `BottomSheet`, `resetClassificationFlow`, `handleSendPhoto`, tokens `--brand-green/-soft`.
- **Quality gates**: lint ✅ · format:check ✅ · typecheck ✅ · build ✅.

**Pendência de limpeza (próxima sessão)**: estilos órfãos `.camera-hub-preview-img`, `.camera-hub-preview-actions`, `.camera-hub-preview-btn-retake`, `.camera-hub-preview-btn-send` em `globals.css:17823-17847` aprox. Mantidos por enquanto pra evitar regressão; remover quando ficar claro que nenhum outro lugar referencia.

### 2026-05-28 — Sessão 2 (unificação do erro de câmera + atalho pra galeria) ✅

Sequência do refino visual — agora as mensagens de erro de inicialização da câmera.

- **`28d3d63` — `feat(camera): unifica erro de camera em card centralizado com atalho pra galeria`**
  - **Antes**: o `cameraError` era populado via `readErrorMessage(error, ...)` que prioriza `error.message` do `DOMException` — texto em **inglês** vindo do browser, variável conforme o tipo (`NotAllowedError`, `NotReadableError`, `OverconstrainedError`, `SecurityError`, `NotFoundError`). Renderizado num canto do header com botão "Tentar novamente".
  - **Agora**: card centralizado no `.camera-hub-stage` com fundo bege (`#fdf9ec`), backdrop blur sutil, single title fixo **"Acesso a camera indisponivel"** + 2 botões: **"Usar galeria"** (primário, gradiente verde brand) e **"Tentar novamente"** (secundário, outline).
  - **Trigger**: `(cameraStatus === 'permission-denied' || cameraStatus === 'unsupported') && flowState === 'idle'`. Exclusivo da falha de inicialização do `getUserMedia`.
  - **"Usar galeria" como primário** (decisão validada via AskUserQuestion): galeria sempre funciona, é o caminho mais confiável pra destravar o operador. "Tentar novamente" fica como fallback se for falha transitória (câmera ocupada por outro app).
  - **Reuso**: `galleryInputRef.current?.click()` dispara o mesmo input file oculto que o botão da galeria do canto. Sem duplicação de lógica.
  - **Bloco inline antigo** preservado pra casos não-câmera (ex: "A foto excede o limite de 12 MB"), com condição extra `cameraStatus !== 'permission-denied' && cameraStatus !== 'unsupported'` pra evitar duplicação visual com o card central.
  - **Botão da galeria do canto continua visível** quando o card aparece (decisão validada via AskUserQuestion): redundância intencional, dá opção sem conflito.
  - **Acessibilidade**: overlay com `role="alert"` — anúncio imediato em screen readers.
  - **Animações**: fade-in do overlay (~220 ms) + slide-up do card (~280 ms cubic-bezier). Sem exageros, alinhado com o pedido.

**Quality gates**: lint ✅ · format:check ✅ · typecheck ✅ · build ✅.

**Tipos de erro cobertos (todos viraram a mesma mensagem unificada)**:

| Tipo                          | Cobertura                                   |
| ----------------------------- | ------------------------------------------- |
| `NotAllowedError`             | Permissão de câmera negada pelo operador.   |
| `NotReadableError`            | Câmera ocupada por outro app/contexto.      |
| `OverconstrainedError`        | Sem câmera traseira (cai em `unsupported`). |
| `NotFoundError`               | Nenhuma câmera no device.                   |
| `SecurityError`               | Origin não-HTTPS (raro em prod).            |
| Qualquer outro `DOMException` | Cai no fallback genérico → mesma mensagem.  |

### 2026-05-28 — Sessão 2 (refino do layout da `/camera`) ✅

Sequência da auditoria do Caminho 3 e da adaptação de UI por contexto — agora as proporções e cores da página. Dois commits atômicos:

- **`f2ce298` — `feat(camera): aumenta stage, ajusta tamanho e posicao dos botoes`**
  - **Stage maior** (~30-35 px): override local de `--mobile-tabbar-clearance` (8.9 rem → 7.4 rem) só em `.camera-hub-page`, mantendo a tabbar global intacta. Gap final do cálculo de altura: 0.6 rem → 0.2 rem.
  - **Voltar maior**: `clamp(36px,10vw,40px)` → `clamp(42px,12vw,48px)`. Border-radius proporcional.
  - **Captura mais baixo**: `padding-bottom` do `.camera-hub-bottom-area` na metade — `clamp(18px,5vw,28px)` → `clamp(9px,2.5vw,14px)`.
  - **Galeria reposicionada**: tirada de top-right, alinhada verticalmente ao captura, centralizada horizontalmente no ponto 75% via `right: 25%` + `transform: translateX(50%)`. Tamanho aumentado: `clamp(48px,13vw,56px)`.
- **`7f0e339` — `feat(camera): status bar bege na pagina da camera`**
  - **Theme-color dinâmico**: `useEffect` no `CameraPageContent` muda meta `theme-color` pra `#fdf9ec` ao montar `/camera` e restaura ao desmontar. Em Android Chrome a barra fica bege automaticamente.
  - **iOS standalone**: como `apple-mobile-web-app-status-bar-style: black-translucent` faz a barra ficar translúcida sobre o app, adicionado `.camera-hub-page::before` fixo cobrindo `env(safe-area-inset-top)` com `#fdf9ec`. A área visível por baixo da status bar fica bege.
  - **Limitação iOS conhecida e aceita pelo usuário**: ícones brancos do sistema sobre bege claro têm contraste reduzido. Decisão validada via AskUserQuestion antes da implementação. Mudar `statusBarStyle` exigiria sair do PWA standalone — fora de escopo.

**Cor escolhida**: `#fdf9ec` (token do design-system, extremo claro do gradiente do sheet bege `#fdf9ec → #f4f0e7`).

**Quality gates** (ambos commits): lint ✅ · format:check ✅ · typecheck ✅ · build ✅.

**Responsividade testada mentalmente em 320 / 390 / 430 px** — `clamp()` cobre as 3 larguras sem quebrar proporções. Galeria centralizada matematicamente, captura ainda visível em qualquer largura, voltar tocável (≥ 42 px em todas).

### 2026-05-28 — Sessão 2 (UI dos Caminhos 1/3 com contexto + cleanup preventivo) ✅

Sequência da auditoria do Caminho 3. Dois temas, dois commits atômicos:

- **`d005d8c` — `fix(camera): reseta context states em soft-navigation`**
  - `useEffect` novo que zera `contextSampleLot/Status/Sacks/Harvest/Loading/Error` quando `contextSampleId` vira `null`.
  - **Por quê**: investigação descobriu que soft-nav `/camera?sampleId=X` → `/camera` (sem param) deixa estados pendurados — hoje as guardas `hasContext && contextSampleId` em `handleConfirm` protegem, mas o cleanup explícito fecha qualquer fresta de regressão futura.
- **`5b46d37` — `feat(camera): adapta UI quando amostra ja vem selecionada`**
  - **B (ignorar QR decodes)**: guard `if (hasContext) return;` no início de `handleDecodedQr` (`page.tsx:386-392` aprox). Caminhos 1 e 3 não interrompem o fluxo de captura ao ler etiqueta de outra amostra próxima.
  - **C (moldura de scan oculta)**: classe `is-no-scan` aplicada ao `.camera-hub-overlay` quando `hasContext`. CSS: `.camera-hub-overlay.is-no-scan::before { display: none }` em `app/globals.css` após a regra base. Scanner continua decodificando internamente — só os elementos visuais somem.
  - **D (label dinâmico)**:
    - Caminhos 1/3 com lote carregado: "Classificando lote {contextSampleLot}".
    - Caminhos 1/3 com lote ainda carregando: silencioso (o bloco "Carregando amostra..." do fix anterior já cobre).
    - Caminho 2 (sem contexto): silencioso (sem mais "Escaneando QR..."). QR continua decodificando e abrindo modal normalmente.
    - `cameraStatus === 'starting'`: mantém "Abrindo camera..." inalterado.
  - Pulse (`.camera-hub-scan-pulse`) sai junto — não faz sentido sem o contexto de "scan ativo".

**Quality gates**: lint ✅ · format:check ✅ · typecheck ✅ · build ✅ (`/camera` continua em 13.5 kB).

**Tensão registrada**: no Caminho 2 a remoção do label "Escaneando QR..." deixa o operador sem dica visual de que QR scan funciona. Aceitável (a moldura continua lá, scanner continua decodificando), mas vale considerar um label "Aponte pro QR ou ficha" se virar confusão. Item de roadmap, não bloqueante.

### 2026-05-28 — Sessão 2 (auditoria + fix do Caminho 3 — Dashboard) ✅

Auditoria profunda da primeira fase do Caminho 3 (seleção do lote no modal "Aguardando classificação" → handover de sampleId pra câmera). Resultado: 5 dos 7 pontos OK, 1 bug real, 1 race condition mitigada pelo mesmo fix.

- **Bug**: `app/camera/page.tsx:242-258` — o `useEffect` que hidrata `contextSampleStatus` via `getSampleDetail` tinha `.catch(() => {})` silencioso. Em falha (404 sample inexistente, 401 sessão expirada, rede instável), `contextSampleStatus` ficava `null`, e a guarda em `handleConfirm` (`:853-855`) só rejeitava status conhecido — `null` passava. Operador gastava 15-30 s na chamada da IA antes do backend rejeitar com 409.
- **Fix** (commit `3fe61a5` — `fix(camera): valida contexto da amostra antes de iniciar captura`):
  - Novo state `contextSampleLoading` + `contextSampleError`.
  - `loadContextSample` extraído em `useCallback` (reusável pelo botão "Tentar novamente").
  - UI inline na overlay da câmera: "Carregando amostra…" durante load; em erro, mensagem + "Tentar novamente" + "Voltar".
  - Botão de captura **disabled** quando `hasContext && (loading || error || !status)`.
  - Defesa em profundidade no `handleConfirm`: rejeita explicitamente se `hasContext && !contextSampleStatus` **antes** da chamada da IA.
- **Padrões reusados**: `readErrorMessage` (`:92-98`), botão `.camera-hub-btn-secondary` do bloco `cameraError` (`:1084-1092`).
- **Mensagens em pt-BR** sem acentos (alinhado com o resto do `camera/page.tsx`): "Carregando amostra…", "Nao foi possivel carregar a amostra. {causa}", "Tentar novamente", "Voltar".
- **Quality gates**: lint ✅ · format:check ✅ · typecheck ✅ · build ✅.
- **Status da auditoria do Caminho 3**: ponto 4 ("Recepção na câmera") agora coberto. Pontos 1/2/3/6/7 já OK no original. Ponto 5 (race condition de hidratação) mitigado pelo `disabled` do botão + defesa em profundidade no submit.

### 2026-05-28 — Sessão 2 (reorganização dos caminhos de classificação) ⏳

- **Mudança principal**: os "3 caminhos de classificação" foram refeitos. Antes: Detalhe / QR scan / Dashboard. Agora: **Detalhe / Foto direta / Dashboard**. QR scan saiu da lista de caminhos de classificação.
- **Motivo**: o QR só é impresso após `CLASSIFICATION_COMPLETED` (auto-print best-effort em `sample-command-service.js:1898`). Amostras aguardando 1ª classificação **não têm QR** — então scan nunca pode ser o gatilho de uma 1ª classificação. QR vira navegação até o detalhe (Caminho 1).
- **Foto direta (Flow A no código)** promovida a Caminho 2 explícito. Antes era tratada como "fallback legado" no doc; agora é um caminho de primeira classe, com perguntas dedicadas (F1.10, F1.11, F1.12).
- **Decisões antigas preservadas como histórico**: F1.2, F1.3 (sobre QR scan + banner na câmera) e F1.9.A Caso B (atalho "Reclassificar" no modal pós-QR) ficam registradas na seção renomeada "QR scan como navegação (out-of-scope para classificação)". Não foram apagadas.
- **Tensão aberta T1.A**: o atalho "Reclassificar" no modal pós-QR (F1.9.A Caso B) conflita com o novo princípio "QR → detalhe, não → classificação". A decidir em sessão futura — não bloqueia avanço dos blocos seguintes.
- **Novas perguntas no Bloco F1** (a discutir):
  - **F1.10** — Caminho 2 (Foto direta) deve continuar existindo? (manter / sinalizar visualmente / aposentar)
  - **F1.11** — IA falha em ler o lote no Caminho 2: review com lote vazio / `extraction-error-illegible` / aviso inline?
  - **F1.12** — Status incompatível no Caminho 2: erro genérico / modal dedicado / não bloquear?
- **Arquivos atualizados no doc**: "Estado atual do fluxo (resumo)", tabela do Bloco F1, "Bifurcações de exceção", "Tensões revisadas".

### 2026-05-25 — Sessão 1 (kickoff e mapeamento)

- Criado `docs/Classificacao-Plano-de-Trabalho.md` com estrutura inicial.
- Mapeado o fluxo atual de classificação (10 fases + 4 bifurcações de exceção + 9 modais) — base concreta em `app/camera/page.tsx`, `components/samples/Classification*.tsx`, `src/samples/sample-command-service.js`, `src/samples/classification-extraction-service.js`.
- Estado atual sintetizado na seção "Estado atual do fluxo".
- Bloco 0 aberto com 5 perguntas iniciais (Q0.1 a Q0.5), todas em aberto. Mais perguntas podem nascer durante a discussão.
- Próximos blocos (F1..F10) listados como pendentes; serão abertos sequencialmente após Bloco 0 fechar.

### 2026-05-25 — Sessão 1 (Bloco 0 fechado) ✅

- **Q0.1** decidida: foto sempre obrigatória, sem exceção (status quo).
- **Q0.2** decidida: modo manual continua sendo fallback de erro técnico (status quo).
- **Q0.3** decidida: reclassificação sempre exige foto nova (status quo).
- **Q0.4** decidida provisoriamente ⚠️: mantém status quo (operador escolhe campo a campo, sem default). Reabrir no **Bloco F5 (Reconciliação de divergências)** com dados sobre frequência de divergências e custo de tempo.
- **Q0.5** decidida provisoriamente ⚠️: layout da ficha unificada se mantém nesta revisão. Mini-revisões focadas em layout + extração permitidas dentro de **F3 (extração)** e **F4 (revisão)** quando relevante.
- Bloco 0 fechado. Pronto pra abrir Bloco F1 — Entrada e gatilho.

### 2026-05-25 — Sessão 1 (correção do mapeamento + abertura do Bloco F1)

- **Correção do mapeamento**: a versão anterior da seção "Estado atual do fluxo" afirmava "ponto de entrada único" (FAB no detalhe). O usuário sinalizou que existem outros caminhos. Re-investigação confirmou:
  - **Caminho 1** (FAB no detalhe da amostra) — existente.
  - **Caminho 2** (tabbar "Câmera" → `/camera` sem `sampleId` → QR scanner detecta etiqueta → `resolveSampleByQr` → `SampleLookupResultModal` com "Ver detalhes" / "Escanear novamente") — existente, mas hoje exige 4 toques pra chegar na classificação.
  - **Caminho 3** (modal "Aguardando classificação" do dashboard, `components/dashboard/OperationModal.tsx`) — existente como navegação pra detalhe; **botão "Classificar" dedicado em cada card é o novo a adicionar**.
- "Estado atual do fluxo" atualizado pra refletir os 3 caminhos com `arquivo:linha`.
- **Bloco F1 aberto** com 9 perguntas (F1.1..F1.9) organizadas por caminho (1, 2, 3) + transversais. Estrutura nova no doc: cada caminho ganha sub-seção própria pra discussão isolada antes de fechar coerência transversal.
- Próximo passo: discussão das perguntas do Bloco F1 com o usuário.

### 2026-05-25 — Sessão 1 (Bloco F1 fechamento parcial) ⏳

- **Decisões cravadas**: F1.1 (provisória, status quo), F1.2 (modal pós-QR mantém), F1.3 (sem banner), F1.4 (botão à direita), F1.5 (laranja com label), F1.6 (tap direto), F1.7 (só dashboard), F1.8 (modal de sucesso com "Ver detalhes" + X), F1.9 (aviso por status).
- **Sub-pontos abertos pra próxima rodada** (5 itens):
  - **F1.2.A** — Escopo do Caminho 2 (caminho de classificação vs navegação por scan).
  - **F1.5.A** — Tom de laranja (existente vs novo — ver `#e67e22` em badges PF, `#f59e0b` em warnings).
  - **F1.5.B** — Tamanho/padding do botão.
  - **F1.5.C** — Estados visuais (hover/active/disabled), coerência com `feedback_no_green_buttons`.
  - **F1.8.A** — Destino do X no modal de sucesso (câmera sempre vs origem do caminho).
  - **F1.8.B** — Feedback da auto-impressão da etiqueta no modal de sucesso.
  - **F1.9.A** — Mensagens e ações pra `INVALIDATED` e `CLASSIFIED` no Caminho 2.

### 2026-05-25 — Sessão 1 (Bloco F1 — sub-pontos fechados, restam 2) ⏳

- **F1.2.A** fechado: Caminho 2 = "navegação por scan". Foco do bloco passa a ser Caminho 1 + Caminho 3.
- **F1.5.A** fechado: fundo `#f59e0b` (`--brand-warning`) sólido. Tom de warning vira segundo uso como CTA de ação rápida.
- **F1.5.B** fechado: botão ~1/4 da largura do card, centralizado vertical, margem da borda direita; nome do proprietário com `ellipsis` (text-overflow + nowrap + overflow:hidden).
- **F1.5.C** fechado: `transform: scale(0.96)` + `opacity: 0.92` no active; sem mudança de cor (alinhado a `feedback_no_green_buttons`); disabled cinza neutro 40%.
- **F1.8.A** fechado: X sempre joga em `/camera`, independente da origem. Trade-off aceito (estranho pros Caminhos 1/3, simples na implementação).
- **F1.8.B** fechado provisoriamente ⚠️: sem feedback de impressão por enquanto; reabrir se houver fricção real.
- **F1.9.A Caso A** (`INVALIDATED`) fechado: mensagem _"Esta amostra está invalidada e não pode ser classificada."_ + única ação **"Fechar"**.
- **F1.9.A Caso B** (`CLASSIFIED`) fechado: mensagem _"Esta amostra já foi classificada. Quer reclassificar?"_ + ações **"Reclassificar"** (direto a `/camera?sampleId=X`) / **"Ver detalhes"** (a `/samples/[id]`) / **"Fechar"** (volta scanner). O "Reclassificar" daqui vira terceiro disparador da rota de classificação com `sampleId`.
- **Novos sub-pontos abertos** (2 itens decorrentes de F1.5.B):
  - **F1.5.D** — Border-radius do botão (pill 999px vs retangular ~8px) + valor exato da margem direita.
  - **F1.5.E** — Comportamento ao tap em nome truncado (tooltip/dica? tap no nome expande inline? sem extra).

### 2026-05-25 — Sessão 1 (Bloco F1 100% fechado) ✅

- **F1.5.D** fechado: `border-radius: 8px` (retangular suave, padrão do app) + margem direita do card 12px.
- **F1.5.E** fechado: só `text-overflow: ellipsis`, sem tooltip, sem long-press, sem expansão. Nome completo só no detalhe da amostra.
- **Bloco F1 fechado em 100%**. 16 decisões registradas. Próximo: abrir Bloco F2 — Captura da foto (câmera, galeria, preview, compressão).

### 2026-05-25 — Sessão 1 (Bloco F1 — análise pré-implementação) ✅

- 3 agentes Explore lançados em paralelo (1 por frente concreta de implementação).
- Achados consolidados na seção `### Análise pré-implementação F1`.
- Gargalo crítico eliminado: backend `resolveSampleByQrToken` **não filtra por status** (`src/samples/sample-query-service.js:1119-1169`) — implementação fica 100% no frontend.
- 5 decisões derivadas (D1..D5) abertas, discutidas e fechadas pelas recomendações do agente Plan: D1=B (`<a> + <button>` irmãos), D2=A (bolinha some), D3=B (novo `ClassificationSuccessModal`), D4=A (estender `SampleLookupResultModal` com `kind`), D5=A (header verde `is-themed`).

### 2026-05-25 — Sessão 1 (Bloco F1 implementado) ✅

3 commits seguindo plano em `~/.claude/plans/hidden-conjuring-axolotl.md`, ordem **B → A → C**:

- **`0d83eae`** — `feat(camera): substitui tela inline de sucesso por modal central` (Frente B).
  - Criado `components/samples/ClassificationSuccessModal.tsx` (header verde `is-themed`, X, "Ver detalhes", check animado).
  - Removido `useEffect` de auto-redirect de 2 s + view inline `.camera-hub-success`.
  - CSS órfão `.camera-hub-success*` removido; preservado `.camera-hub-success-icon` e `.is-sm` (usado em "Ficha identificada").
- **`88db87d`** — `feat(dashboard): adiciona botao Classificar no card de pendencias` (Frente A).
  - `OperationModal.tsx`: prop opcional `onItemAction` + JSX com `<a>` (área comum) + `<button>` (laranja `#f59e0b`, ~1/4 do card).
  - `DashboardMobile.tsx` + `DashboardDesktop.tsx`: passam handler `(sampleId) => router.push('/camera?sampleId=X')`.
  - CSS novo `.app-modal-card-link` + `.app-modal-card-classify-cta` + truncamento scoped no `.app-modal-card`.
- **`6861c4f`** — `feat(camera): avisos de status no scan do QR (invalidated / classified)` (Frente C).
  - `SampleLookupResultModal.tsx`: prop `kind` (`'lookup' | 'invalidated' | 'classified'`) + COPY dict + exhaustive check + actions condicionais.
  - `app/camera/page.tsx`: `handleResolvedSample` decide `kind` pelo `resolved.sample.status`; `handleReclassifyFromScan` vai pra `/camera?sampleId=X`.

Quality gates (lint + format:check + typecheck + build) verdes em todos os 3 commits.

**Pendente**:

- Validação manual em viewport mobile (`npm run dev` em 390×844 e 320 px) — happy paths das 3 frentes + edge cases.
- Decisão de deploy (canary + promote) — fora do escopo do plano.
- Skill maintenance (verificar `design-system`, `modals`, `feedback-messages`).

### 2026-05-25 — Sessão 1 (Bloco F2 aberto) ⏳

- Mapeamento profundo do fluxo de captura via agente Explore (foco exclusivo em "abrir câmera → ter foto pronta no preview"; sem entrar em detect/extract/review).
- Estado atual sintético compilado em `## Bloco F2 — Captura da foto` com referência a `arquivo:linha` em `app/camera/page.tsx`, `lib/compress-image.ts`, `app/globals.css`.
- 7 pontos de fricção operacional identificados pelo agente (botão pequeno, feedback fraco, refazer em 2 taps, galeria sempre visível, overlay genérico pra QR e foto, mensagens de erro genéricas).
- 9 perguntas iniciais abertas (F2.1..F2.9) com tradeoffs A/B/C/D. Próximo: discussão com usuário pra fechar decisões.

### 2026-05-25 — Sessão 1 (Bloco F2 — rodada 1 de respostas) ⏳

- **Cravadas**: F2.1 (traseira forçada), F2.2 (galeria sempre visível), F2.3 (scanner sempre ativo na página), F2.4 (68 px), F2.6 (2 botões no preview), F2.7 (sem zoom), F2.9 (botão "Tentar novamente" na permissão negada).
- **F2.5 parcial**: QR válido vibra (sem som); captura toca som de shutter (rápido, simples, não chamativo). Sub-pontos abertos:
  - **F2.5.A** — vibração da captura (manter os 40 ms atuais junto com o som? aumentar? remover?).
  - **F2.5.B** — fonte do som (asset MP3/WAV vs Web Audio sintetizado), duração e respeito a modo silencioso.
  - **F2.5.C** — vibração no QR (intensidade em ms + se aplica o dedupe de 1.8 s ou vibra em toda detecção válida).
- **F2.8** em re-explicação por pedido do usuário.

### 2026-05-25 — Sessão 1 (Bloco F2 — sub-pontos F2.5 fechados) ⏳

- **F2.5.A** fechado: vibração de 40 ms mantida na captura + som somados (vibração serve de fallback tátil em modo silencioso).
- **F2.5.B** fechado: asset `.mp3` curto (~150 ms, ~3 KB) em `public/sounds/`, tocado via `<audio>` HTML. Respeita modo silencioso nativo do device.
- **F2.5.C** fechado: vibração de 80 ms no QR só quando `resolveSampleByQr` retorna sample válido (1 vez por scan resolvido, sem ruído).
- F2.8 segue pendente — aguardando resposta após re-explicação.

### 2026-05-25 — Sessão 1 (Bloco F2 100% fechado) ✅

- Discussão F2.8: usuário questionou se o retângulo (overlay) interfere na foto. Re-verificação em código confirmou que o overlay é puramente decorativo (`pointer-events: none`) e a captura sempre desenha o frame inteiro do `<video>` no canvas. Decisão: **manter status quo** — retângulo continua sempre visível, operador entende que é guia visual do QR scanner e ignora pra fotografar.
- **Bloco F2 fechado em 100%**. 11 decisões. Próximo passo: Etapa 2 (análise pré-implementação via agentes) seguindo o padrão registrado no `## Padrão de implementação`.

### 2026-05-25 — Sessão 1 (Bloco F2 — análise pré-implementação) ✅

- 2 agentes Explore lançados em paralelo (1 por frente concreta — som e botão retry; vibração é 1 linha).
- Achados consolidados:
  - Projeto já tem padrão Web Audio API sintetizado em `lib/scanner/scanner-sound.ts` (`playScanSuccessBeep` 1320 Hz, 130 ms) usado pelo `ScannerBridge` global de **bipador físico** (não conflita com QR scanner da câmera).
  - `ensureScannerStarted()` em `app/camera/page.tsx:395-473` é idempotente — pode ser re-chamada sem efeitos colaterais.
  - Classes CSS `.camera-hub-btn` + variantes já existem (linhas 18388-18421 do `app/globals.css`).
- **F2.5.B revisada**: decisão original era asset `.mp3`; usuário aceitou **Web Audio sintetizado** após descoberta do padrão do projeto. Coerência > "naturalidade" do som.
- **F2.9 detalhada**: sem loading state intermediário (`ensureScannerStarted` já gerencia `cameraStatus` automaticamente).

### 2026-05-25 — Sessão 1 (Bloco F2 implementado) ✅

3 commits seguindo plano em `~/.claude/plans/hidden-conjuring-axolotl.md`:

- **`ca766ed`** — `feat(camera): som de shutter sintetizado na captura de foto` (Frente A — F2.5.A + F2.5.B).
  - Criado `lib/camera/camera-shutter-sound.ts` (~70 linhas, padrão idêntico ao `scanner-sound.ts`).
  - Dois osciladores square sequenciais (1800 Hz → 900 Hz, ~140 ms total) simulando "ka-chak".
  - Disparado no início de `captureFromVideoStream`, antes do flash e vibração.
- **`69b36a0`** — `feat(camera): vibracao quando QR scan resolve amostra valida` (Frente B — F2.5.C).
  - 1 linha: `navigator.vibrate?.(80)` no início de `handleResolvedSample`.
  - Dedupe de 1.8 s já existente impede vibração consecutiva pro mesmo QR.
- **`098187e`** — `feat(camera): botao "Tentar novamente" para erro de camera` (Frente C — F2.9).
  - Handler `handleRetryCamera` que chama `ensureScannerStarted()`.
  - JSX: `<p role="alert">` envolvido em `<div className="camera-hub-error-with-retry">` com botão `.camera-hub-btn .camera-hub-btn-secondary`.
  - Nova regra CSS (~6 linhas) pra layout vertical centralizado.

Quality gates (lint + format:check + typecheck + build) verdes em todos os 3 commits.

**Pendente**:

- Validação manual em mobile real (`npm run dev` em viewport 390×844): testar som de shutter, vibração no QR scan, botão "Tentar novamente" após negar permissão.
- Decisão de deploy (canary + promote) — fora do escopo do plano.
- Skill maintenance (verificar se `feedback-messages` precisa update com novo padrão de feedback auditivo).

### 2026-05-25 — Sessão 1 (Bloco F2.Q aberto) ⏳

- Usuário levantou ponto crítico: **fidelidade visual da foto capturada** — a foto deve representar fielmente o aspecto real do café (cor, tom, contraste, textura), sem processamento que distorça a classificação.
- Criado novo bloco `## Bloco F2.Q — Fidelidade visual da foto capturada` posicionado entre F2 (captura) e F3 (extração IA).
- Bloco é **experimental**: depende de testes empíricos (ground truth com câmera de referência vs captura via PWA). Decisões não fecham via tradeoff A/B/C; emergem dos testes.
- 6 pontos abertos (F2.Q.1..6) cobrindo setup do teste: ground truth, devices, métrica, storage das fotos, ordem de variáveis, critério de "pronto".
- Estado atual do pipeline mapeado (constraints da câmera, canvas drawing, compressão).
- Variáveis identificadas: compressão JPEG, redimensionamento, imageSmoothing, MediaTrackConstraints, resolução do stream, formato (JPEG/PNG/WebP), processing do device, ImageCapture API.
- 5 hipóteses iniciais a validar (quality 1.0, smoothing off, sem maxDimension, constraints manuais, PNG lossless como teto).
- Próximo passo: discutir os 6 pontos abertos antes de começar testes.

### 2026-05-25 — Sessão 1 (Bloco F2.Q encerrado sem mudanças) ✅

- Usuário fez teste manual da captura atual da `/camera` e avaliou que a qualidade está adequada — cor, tom, contraste e textura suficientes para classificação.
- **Decisão**: encerrar o Bloco F2.Q sem alterações no pipeline. Detalhamento extenso (variáveis, metodologia, hipóteses) removido do doc; mantida apenas a confirmação resumida + condição de reabertura (feedback de operadores em campo apontando perda visual).
- 6 pontos abertos (F2.Q.1..6) descartados — não há testes pendentes.
- `## Pendências → Bloco F2.Q` simplificado para item único marcado como encerrado.

### 2026-05-25 — Sessão 1 (Bloco F3 aberto) ⏳

- Usuário sinalizou problema concreto: **peneiras (L3 + L4) e fundos (L5) não estão sendo extraídos bem pela IA**. Insight usado como foco principal da investigação.
- 3 agentes Explore lançados em paralelo (F3-A detect-form, F3-B IA + peneiras/fundos, F3-C frontend extracting + erros).
- Achados consolidados na seção "Estado atual" do `## Bloco F3`.
- Hipóteses identificadas para extração ruim de peneiras/fundos:
  1. Prompt descreve fundos como "peneira | '=' | percentual" mas **sem instrução lógica explícita** ("esquerda do '=' = peneira, direita = percentual").
  2. **Zero few-shot visual** (sem imagem-exemplo + JSON esperado).
  3. Modelo genérico `gpt-4o` sem fine-tuning ou pin de versão.
  4. Schema permissivo (peneiras sem regex; fundos sem `minItems` no schema da OpenAI).
  5. Sem feedback visual no Review pra campos vazios — operador pode salvar incompleto sem perceber.
- Outras lacunas: zero retry em erros transitórios, zero logs/telemetria, zero testes com imagem real, cleanup de `_temp/` ausente.
- 12 perguntas abertas em 5 grupos (A Detecção · B Extração IA · C UX · D Observabilidade · E Testes). Próximo: discussão pra fechar decisões.

### 2026-05-25 — Sessão 1 (Bloco F3 — rodada 1 de respostas) ⏳

- **Cravadas**: F3.1 (auto-crop mantido), F3.3 (gpt-4o sem pin mantido), F3.8 (sem destaque visual de campos vazios), F3.10 (modo manual preserva extração parcial), F3.11 (telemetria básica no backend — escolha minha, B).
- **Aprovadas em principio mas aguardam escolha de variação**: F3.4 (few-shot, B/C/D?), F3.5 (reforço de prompt, B/C/D?).
- **Aguardando resposta**: F3.2 (estratégia de cleanup), F3.6 (schema), F3.7 (retry), F3.9 (validação).
- **F3.12**: usuário vai fornecer imagem de exemplo pra usar como fixture; aguardar.

### 2026-05-25 — Sessão 1 (Bloco F3 — rodada 2 fechou decisões pendentes) ✅

- **F3.2** = C: cleanup oportunístico (varre `_temp/` no início de cada `detect-form`, apaga órfãos > 24 h).
- **F3.4** = B: 1 imagem-exemplo + JSON correspondente no few-shot.
- **F3.5** = B: reforço cirúrgico só nos fundos ("número à esquerda do '=' = peneira; direita = percentual").
- **F3.6** = A: schema mantido como está. `normalizeFundos` em JS já garante array 2.
- **F3.7** = B: 1 retry em 429/5xx com backoff 1.5 s; timeout (25 s) e PARSE_ERROR não retentam.
- **F3.9** = A: validação "≥1 campo" mantida. Reabrir se F3.4 + F3.5 não resolverem em uso real.
- **Bloco F3 fechado em 100%** com exceção de F3.12 (asset image) que bloqueia parcialmente a implementação de F3.4.

### 2026-05-25 — Sessão 1 (Bloco F3 — análise pré-implementação Onda 1 + F3.10 expandida) ⏳

- 2 agentes Explore lançados em paralelo (F3-D padrões de infra backend; F3-E detalhes nos arquivos exatos).
- Achados de infra:
  - Sem logger estruturado no projeto (`no-console: error` em `src/`). Telemetria via `process.stderr.write(JSON.stringify(...) + '\n')` ou helper local com disable inline.
  - Sem helper genérico de retry. F3.7 vai escrever helper local em `classification-extraction-service.js`.
  - Padrão `fs.promises.rm(path, { force: true }).catch(() => {})` consagrado. F3.2 reusa.
  - Resposta OpenAI tem `usage.{prompt_tokens, completion_tokens, total_tokens}` + `model` + `id` — hoje não acessados.
  - `extractClassificationFromPhoto` não recebe `actorContext`; F3.11 estende assinatura pra logar `sampleId`.
- Achados de detalhes:
  - F3.5 — texto exato dos fundos identificado em linhas 72-80 do USER_PROMPT (template literal).
  - F3.7 — `AbortController` deve ser recriado em cada tentativa de retry (não reusar signal aborted). OpenAI SDK v6 expõe `err.status` em erros HTTP.
  - F3.2 — inserir cleanup após `mkdir` linha 3588 de `detectClassificationForm`. Sem mutex; cleanup silencioso.
  - F3.11 — `processingTimeMs` calculado linha 498; capturar `response.usage` após `.create()`.
  - F3.10 — **tensão revelada**: `startManualMode` só é acionado após `extraction-error-technical` (form sempre vazio). Decisão original sem caso real.
- **F3.10 expandida** (caminho B): adicionar botão "Continuar manual" no `kind='illegible'` (onde extração parcial existe) + `startManualMode` ganha lógica condicional (preserva em illegible, reseta em technical).
- 3 sub-decisões fechadas com defaults coerentes (F3.10.A/B/C): botão sempre em illegible, reusar 2º modal explicativo, `startManualMode` recebe origem.
- Pronto para plan mode da Onda 1.

### 2026-05-25 — Sessão 1 (Bloco F3 Onda 1 implementada) ✅

5 commits seguindo plano em `~/.claude/plans/hidden-conjuring-axolotl.md`, ordem **F3.5 → F3.2 → F3.11 → F3.7 → F3.10**:

- **`1e080fd`** — `feat(extraction): reforca prompt nos fundos com instrucao logica` (F3.5).
  - 1 frase nova no USER_PROMPT seção L5: "REGRA LOGICA OBRIGATORIA: número à esquerda do '=' é peneira, à direita é percentual; se faltar um, retorne null para ambos."
- **`a414cfd`** — `feat(extraction): cleanup oportunistico de orfaos em _temp/` (F3.2).
  - Novo método `_cleanupOrphanTempFiles` em `sample-command-service.js`. Chamado após `mkdir` no início de `detectClassificationForm`. Apaga `temp-*` com mtime > 24 h. Best-effort, silencioso.
- **`30001cc`** — `feat(extraction): telemetria basica via stderr JSON line` (F3.11).
  - Novo `src/samples/extraction-telemetry.js` (~17 linhas) com `emitExtractionEvent`. Usa `process.stderr.write` pra contornar regra `no-console`.
  - `classification-extraction-service.js` emite `outcome: success` (com model/requestId/tokens/processingTimeMs/sampleId) e `outcome: failure` (com errorCode/errorMessage).
  - `sample-command-service.js` propaga context com `sampleId` nas 2 chamadas.
- **`77eeccd`** — `feat(extraction): 1 retry automatico em 429/5xx com backoff 1.5s` (F3.7).
  - Nova função privada `_callOpenAIWithRetry` encapsula `client.chat.completions.create`. Loop de 2 tentativas máximo; retry só em `err.status === 429` ou `5xx`. AbortController recriado por tentativa. TIMEOUT/PARSE_ERROR não retentam.
- **`92976fd`** — `feat(camera): expande "Continuar manual" para erro illegible preservando parcial` (F3.10 expandida).
  - `ClassificationExtractionErrorModal`: condição do botão "Continuar manual" agora é só `onContinueManual` (independente de kind).
  - `app/camera/page.tsx`: novo state `manualConfirmSource`; handler `onContinueManual` em ambos os modais (illegible/technical); `startManualMode` condicional (preserva form em illegible, reseta em technical); `ManualConfirmModal.onBack` volta pro estado correto baseado em source; `resetClassificationFlow` zera o source.

Quality gates (lint + format:check + typecheck + build + test:unit 180 passing) verdes em todos os 5 commits.

**Pendente**:

- Validação manual: tirar fotos, verificar logs de telemetria, simular cenário illegible pra confirmar preservação de parcial.
- **Onda 2** (F3.4 few-shot) aguardando imagem-exemplo do usuário (F3.12).
- Deploy: discutir separadamente.

### 2026-05-25 — Sessão 1 (Bloco F3 Onda 2 implementada) ✅

Imagem-exemplo fornecida pelo usuário (lote 5689, safra 26/27, P17=38, MK=8, FD1=13/3, IMP=0,1, BROCA=1, padrão L4 P3, aspecto GC, observação "otelita"). JSON cravado com confirmação.

3 commits seguindo plano em `~/.claude/plans/hidden-conjuring-axolotl.md`:

- **`b90d8a9`** — `chore(extraction): adiciona fixture de ficha-exemplo para few-shot`
  - `src/samples/fixtures/extraction-example.jpg` (967×1599 px, 247 KB).
  - `src/samples/fixtures/extraction-example.json`.
  - Dockerfile estende stage runner com `COPY` explícito da pasta fixtures (stage runner não copia `src/` direto).
- **`0afcd66`** — `feat(extraction): few-shot visual no prompt com 1 imagem-exemplo + JSON`
  - Singleton `FEW_SHOT_EXAMPLE` carregado no module init (zero overhead por extração).
  - `extractClassificationFromPhoto` monta 4 mensagens quando fixture carrega (`system` + `user-exemplo` + `assistant-exemplo` + `user-real`); fallback transparente sem few-shot caso fixture não carregue (com evento `fixture_load_failed` em stderr).
  - Telemetria F3.11 ganha flag `fewShot: bool` em success/failure pra cruzar logs e medir impacto.
  - Teste de envio de prompt atualizado pra aceitar 4 ou 2 mensagens conforme presença da fixture.
- **`<sha3>`** — `docs(classificacao): registra Onda 2 do Bloco F3 implementada`

Quality gates (lint + format:check + typecheck + build + 180 testes unit) verdes em todos.

**Bloco F3 fechado em 100%** — Ondas 1 e 2 implementadas (12 frentes total).

**Próximo**: validação manual em uso real (capturar telemetria com `fewShot: true` + comparar qualidade de extração antes/depois pra peneiras e fundos especificamente). Bloco F4 (revisão dos campos) pode ser aberto quando o usuário sinalizar.

### 2026-05-25 — Sessão 1 (F3.13 + reforço peneiras pós-deploy) ✅

**Diagnóstico via telemetria F3.11 logo após o deploy 9774d75**: peneiras/fundos continuam vindo majoritariamente null. `completionTokens ~177-180` confirma que o modelo está retornando JSON com a maioria dos valores null deliberadamente (não é limite — cap em 1500, usou 12%). Hipótese: viés do prompt (9+ menções negativas a "null", zero instruções positivas) + viés da fixture (~65% null em média, replicando padrão). Usuário esclareceu que classificações reais têm 3-4 peneiras + 1 fundo — fixture **é** realista; problema é prompt.

Usuário também levantou **F3.13** (sub-decisão nova do Bloco F3): campos texto livre (`padrao`, `aspecto`, `certif`, `bebida`) vêm com variações de grafia ("L4 P3" / "L4 - P3" / "L-4 P-3" / "L4P3"); quando o filtro de busca em `/samples` entrar, queries vão perder linhas que escreveram diferente. Precisa normalizar canonicamente na extração (forward-only).

3 frentes implementadas + doc:

- **`5f37f7a`** — `feat(extraction): reforca prompt para extrair sempre que houver escrita visivel`
  - Nova regra 10 no SYSTEM_PROMPT (instrução positiva e ativa): "se houver QUALQUER coisa manuscrita visível, EXTRAIA; null SOMENTE para celulas verdadeiramente vazias".
  - Reforço análogo nas seções L3 e L4 do USER_PROMPT (peneiras): "para CADA célula, verifique individualmente" + "em fichas reais é comum que 2 a 6 peneiras estejam preenchidas — NÃO presuma vazias".
  - Não toca em fundos (F3.5 já tem REGRA LOGICA OBRIGATORIA).
- **`0b09e4e`** — `feat(extraction): normalizacao canonica de padrao, aspecto, certif, bebida, safra`
  - Novo `src/samples/classification-canonicalization.js` com 5 canonicalizers (padrão, aspecto, bebida, certif, safra).
  - Safra duplica lógica de `lib/sample-identification.ts:normalizeHarvest` em JS (backend não importa `.ts` de `lib/` pra não quebrar test:unit com `--experimental-strip-types`).
  - Integrado em `normalizeIdentificacao` + `normalizeClassificacao` do extraction service (após `rejectIfLabel` + `toStringOrNull`).
  - 5 testes unit novos em `tests/classification-canonicalization.test.js`.
  - Formato canônico: `padrao` "L4 P3" (1 espaço, sem hífen); aspecto/bebida/certif uppercase + sem pontos/espaços internos extras; safra "AA/BB".
  - Forward-only — amostras existentes mantêm grafia original; migration retroativa fica pra quando o filtro for habilitado.
- **`6e42a2c`** — `feat(extraction): telemetria nullRateByCategory por extracao`
  - Novo `computeNullRateByCategory` produz `{peneiras: "X/10", fundos: "X/2", defeitos: "X/6", identificacao: "X/3", textos: "X/5"}` a partir do JSON CRU (antes da normalização).
  - Integrado no `emitExtractionEvent` de success. Permite cruzar `fewShot:true` com taxa real de preenchimento e medir impacto do reforço de prompt.
- **`<sha4>`** — `docs(classificacao): registra F3.13 + reforco peneiras implementados`

Quality gates (lint + format:check + typecheck + build + **185 testes unit**) verdes em todos.

**Pendente — validação em prod após deploy**:

- Após deploy, abrir Cloud Logging e medir `nullRateByCategory.peneiras` médio. Se subir de quase 0/10 pra 3-5/10, reforço funcionou.
- Se peneiras ainda < 30% preenchidas: considerar trocar fixture pra ficha com 5-7 peneiras (mesmo "sem ser realista", força quebrar viés), ou trocar modelo (Claude Sonnet 4.5).

### 2026-05-25 — Sessão 1 (mitigação do template binding) ✅

**Diagnóstico via telemetria F3.11 + nullRateByCategory** após o deploy `5fddf1f`: peneiras continuaram **2/10** e fundos **1/2** em 3 extrações consecutivas (exatamente como na fixture). `completionTokens` permaneceu **177-180**. Reforço de prompt da rodada anterior (regra 10 SYSTEM_PROMPT + L3/L4 USER_PROMPT) **não mudou nada** — confirmação categórica de **template binding** do few-shot (modelo replica estrutura/sparsity da fixture, não extrai da foto real).

**Causa raiz mapeada por 2 agentes (F3-I técnico + F3-J alternativas)** — 5 fatores estruturais conspirando:

1. `assistant` message com JSON + `strict: true` + `temperature: 0` = "Template Binding" (modelo trata JSON da fixture como resposta canônica a replicar).
2. `required: [todas peneiras]` + `null` permitido = caminho de menor resistência é null.
3. 1 único exemplo (sem contraexemplos) = modelo memoriza distribuição como "padrão correto".
4. `detail: 'high'` na fixture amplifica peso visual.
5. `temperature: 0` = determinismo total.

Reforço textual no prompt **não consegue vencer** essa cadeia determinística.

Mudança cirúrgica em 1 commit:

- **`7523266`** — `feat(extraction): quebra template binding do few-shot (texto + temperature + detail low)`
  - Eliminada a `assistant` message do histórico de few-shot. Exemplo agora vive como **texto descritivo** dentro de uma `user` message separada (junto com a imagem-exemplo). Texto inclui avisos explícitos contra cópia ("NAO copie estes valores nem a quantidade de campos preenchidos. SEMPRE extraia o que voce VE na foto real").
  - `temperature: 0 → 0.2` (reintroduz variação mínima, quebra determinismo).
  - Fixture `detail: 'high' → 'low'` (reduz peso visual do exemplo; foto real continua high). Bônus: economiza ~1000 tokens/chamada (~$0.003).
  - Teste de envio de prompt atualizado: 3 mensagens com fixture (sem `assistant`) em vez de 4.

**Estimativa F3-I**: ~75-85% redução do viés.

**Pós-deploy**: validar via Cloud Logging — `completionTokens` deve sair do cluster 177-180; `nullRateByCategory.peneiras` deve subir de 2/10 pra 4-7/10; `nullRateByCategory.fundos` de 1/2 pra 1-2/2.

**Se não resolver**: escalar pra (a) trocar modelo para Claude Sonnet 4.5, ou (b) pipeline em 2 etapas (crop+contrast nas linhas de peneiras via `sharp` + chain-of-thought).

### 2026-05-25 — Sessão 1 (página de detalhe unificada) ✅

Mudança paralela ao Bloco F3, requisitada pelo usuário no fim da sessão pra incluir no mesmo deploy. Unificação das 2 sub-páginas (Geral + Comercial) em `app/samples/[sampleId]/page.tsx` numa única visão sem tabs. Ordem dos blocos:

1. Etiqueta de impressão · 2. Informações gerais · 3. Liga inviável (se aplicável) · 4. Composição da liga (se isBlend) · 5. Comprometida em ligas ativas (se aplicável) · 6. Histórico de envios · 7. Classificação · 8. Disponibilidade comercial · 9. Movimentações · 10. Aviso de invalidada.

- **`1f3b23c`** — `feat(samples): unifica detalhe da amostra (remove tabs Geral/Comercial)`
  - Tipo `SampleDetailSection`, state `detailSection`, barra `.sdv-tabs`, condicional ternário, CSS órfão de tabs (incluindo desktop hover + sliding underline T4) — todos removidos.
  - `<SampleMovementsPanel>` agora renderizado sempre (não-lazy de fetch já existente).
  - Diff: -535 / +392 linhas.

Refinos de posicionamento adiados pra próxima conversa.

### 2026-05-25 — Sessão 1 (deploys do dia) ✅

4 deploys completos via pipeline padrão (CI verde → build → canary → migrate → promote):

| Revisão Cloud Run | Commit                            | O que entrou em prod                                                                                                                   |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `00270-hok`       | `0d83eae` + `88db87d` + `6861c4f` | Bloco F1 Onda completa (modal sucesso, botão Classificar, avisos QR)                                                                   |
| `00270-hok`       | `9774d75` (+ Onda 1 F3)           | Bloco F2 (som shutter, vibração QR, retry câmera) + Bloco F3 Onda 1 (prompt fundos, cleanup, telemetria, retry, manual mode expandido) |
| `00272-zed`       | `5fddf1f`                         | Bloco F3 Onda 2 (few-shot original) + F3.13 (canonicalização) + reforço peneiras                                                       |
| `00274-qey`       | `1f3b23c`                         | Mitigação do template binding (few-shot via texto + temperature 0.2 + detail low) + unificação da página de detalhe                    |

**Estado em prod**: todas as decisões dos Blocos F1 + F2 + F3 (incluindo F3.13) implementadas. Página de detalhe unificada. Telemetria `nullRateByCategory` ativa pra medir impacto do template binding fix.

**Próxima sessão**: validar via Cloud Logging se o template binding fix funcionou (esperado: `completionTokens` spread 200-300; `nullRateByCategory.peneiras` subir pra 4-7/10). Se não resolver, escalar pra Claude Sonnet 4.5 ou pipeline em 2 etapas.
