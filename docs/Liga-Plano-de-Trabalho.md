# Liga — Plano de Trabalho

**Status**: Em construção (iniciado em 2026-05-15, zero decisões herdadas).
**Escopo**: documento único de organização, análise, decisões e execução da feature de **ligas** — criação de novos lotes de amostra derivados de outras amostras existentes.

**Como ler este doc**: a seção **Decisões** é o que está fechado; **Pendências** é o que ainda não foi decidido; **Log de sessões** é o histórico de avanços por data.

---

## Contexto

Hoje o sistema modela cada amostra como um lote físico indivisível (`Sample` com `internalLotNumber` único). Cada amostra tem ciclo de vida próprio: registro → classificação → comercialização (venda/perda). A realidade operacional da corretora, porém, também inclui a prática de **ligar** dois ou mais lotes — combinar fisicamente o café de várias amostras pra gerar um novo lote comercializável, que vai pra venda como uma unidade própria.

Hoje o sistema não tem como representar isso. Operadores que precisam combinar lotes ficam sem registro confiável: a rastreabilidade fica em papel, planilha ou na memória. Quando o lote ligado é vendido, perde-se a ligação com as amostras-fonte.

**Objetivo desta feature:**

1. Permitir criar uma "liga" — um novo lote derivado de N amostras existentes — preservando rastreabilidade completa (quem veio de quem, quanto contribuiu, quando foi feito, quem fez).
2. Manter integridade do sistema existente: event store append-only, zero impacto em amostras já criadas, migration estritamente aditiva.
3. Definir como o lote resultante se comporta operacionalmente: como é classificado, como é vendido, como aparece em listas e dashboards.

Este doc é construído colaborativamente em formato pergunta → resposta → registro. Decisões são tomadas em blocos temáticos. Implementação só começa depois que as **Regras fechadas** estiverem completas.

---

## Estado atual do domínio Sample (resumo)

Síntese pra ancorar as decisões. Detalhes em `prisma/schema.prisma`, `src/samples/sample-command-service.js`, `src/events/event-contract-db-service.js`.

**Modelo `Sample`** (prisma/schema.prisma:180-229):

- ID determinístico via hash `actor:clientDraftId` (idempotência natural).
- `internalLotNumber` (String, UNIQUE) — gerado sequencial via `getNextInternalLotNumber()` com retry em colisão.
- `status: SampleStatus` (`REGISTRATION_CONFIRMED` → `CLASSIFIED` → `INVALIDATED`).
- `commercialStatus: CommercialStatus` (`OPEN` → `PARTIALLY_SOLD` → `SOLD` / `LOST`) — derivado de `declaredSacks - soldSacks - lostSacks`.
- `declaredSacks: Int?` — input do registro. **Inteiros apenas, sem suporte a fração hoje.**
- `soldSacks`, `lostSacks: Int` — cumulativos via eventos `SALE_*` e `LOSS_*`.
- `latestClassificationData: Json?` — snapshot da última classificação (ficha unificada Q.cls.2.7).
- Owner: `ownerClientId` (Cliente) + `ownerUnitId` (filial, opcional).

**Event store append-only** (prisma/schema.prisma:231-263):

- `SampleEvent` (eventId UUID, sequenceNumber por sample, payload JSON, OCC via `version`).
- Trigger no banco bloqueia INSERT em sample `INVALIDATED` e UPDATE/DELETE de eventos.
- Idempotência: par `(idempotencyScope, idempotencyKey)`.

**Eventos mutantes existentes hoje**:
`REGISTRATION_CONFIRMED`, `REGISTRATION_UPDATED`, `CLASSIFICATION_COMPLETED`, `CLASSIFICATION_UPDATED`, `SALE_CREATED`, `SALE_UPDATED`, `SALE_CANCELLED`, `LOSS_RECORDED`, `LOSS_UPDATED`, `LOSS_CANCELLED`, `COMMERCIAL_STATUS_UPDATED`, `SAMPLE_INVALIDATED`.

**Movimentações** (`SampleMovement`, prisma/schema.prisma:467-497):

- Tipos: `SALE` (com `buyerClientId` obrigatório) e `LOSS` (com `reasonText` obrigatório).
- Cada movimento gera evento próprio e atualiza `soldSacks` / `lostSacks` do sample.

**Limites operacionais relevantes:**

- Invalidar sample só permitido se `soldSacks == 0 AND lostSacks == 0`.
- Foto de classificação (`CLASSIFICATION_PHOTO`) é exigida via trigger pra completar classificação.

---

## Bloco 0 — Premissas fundacionais

Decisões "antes do fluxo" — valem em qualquer interface. Cada decisão aqui molda o que vem depois.

### Q0.1 — Liga é uma `Sample` ou entidade separada?

**Análise**: A liga gera um novo lote físico que precisa de classificação, lot number, status comercial, ciclo de venda — tudo idêntico a uma amostra normal. Duas formas de modelar:

- **(A) Liga é uma `Sample`** com campos extras opcionais (ex: array de `originSampleIds`, flag `isBlend`). Reusa todo o lifecycle, eventos, queries, UI de detalhe existentes. Diferença é só "esse Sample veio de outros". Tabela auxiliar guarda composição (`SampleBlendComponent` com `sampleId, originSampleId, contributedSacks`).
- **(B) Liga é entidade separada** (modelo `Blend`/`League` próprio, com `BlendEvent` etc). Cria toda uma máquina nova em paralelo: lifecycle, eventos, queries, UI. Não polui o modelo `Sample`.

**Tradeoff**: (A) maximiza reuso (curva baixa de implementação, dashboards e listagens funcionam de graça), mas mistura conceitos no modelo. (B) é mais "limpa" semanticamente, mas duplica praticamente toda a infraestrutura existente.

### Q0.2 — Lote de origem é consumido inteiro ou mantém saldo?

**Análise**: Quando o operador combina, por exemplo, 50 sacas da amostra A com 30 sacas da amostra B, o que acontece com A e B?

- **(A) Saldo preservado**: A continua existindo com saldo `declaredSacks - contributedToBlends`. Pode ser vendida normalmente nas sacas que sobraram. Liga é "consumo parcial" via novo evento (ex: `BLEND_CONTRIBUTED` em A e B, decrementando saldo disponível). Requer adicionar conceito de `availableSacks = declared - sold - lost - blended` em todas as queries comerciais.
- **(B) Origem consumida**: A e B viram inacessíveis após entrar em liga (status próprio tipo `BLENDED`, ou flag `consumedByBlend`). Não pode vender o que sobrou — operador precisa colocar tudo ou nada na liga.

**Tradeoff**: (A) é flexível operacionalmente (vida real raramente combina sacas exatas), mas requer evolução do conceito de saldo. (B) é mais simples mas força operação "all-or-nothing" que pode não bater com a prática.

### Q0.3 — A liga é reversível?

**Análise**: Após criar uma liga, pode ser desfeita?

- **(A) Reversível por evento de auditoria**: novo evento (ex: `BLEND_REVERTED`) invalida a liga e restaura o saldo das origens. Liga vira `INVALIDATED`, origens recuperam contribuição. Mas só permitido se a liga não tem venda/perda registrada (mesma regra de invalidar sample hoje).
- **(B) Apenas invalidável**: a liga pode ser marcada `INVALIDATED` (some das listagens, vira read-only), mas as origens **não recuperam** as sacas — perda contábil. Operador resolve manualmente fora do sistema.
- **(C) Imutável**: depois de criada, fica pra sempre. Erros são corrigidos via novas operações (criar outra liga, vender, etc).

**Tradeoff**: (A) é o mais correto operacionalmente mas mais complexo (lógica de restituição, edge cases de cascata). (B) é meio-termo (audit limpa, sem complicação). (C) é o mais simples mas o menos perdoador com erros.

### Q0.4 — Unidade de sacas: inteiras ou fração?

**Análise**: Hoje `declaredSacks` é `Int`. Operação real pode combinar "meia saca" ou medir em kg?

- **(A) Manter inteiros**: mais simples. Operador arredonda em qualquer fração na cabeça. Funciona com o tipo `Int` existente em todos os lugares.
- **(B) Migrar pra `Decimal` global**: muda tipo de `declaredSacks`, `soldSacks`, `lostSacks` em todo o schema. Suporta fração natural. Mas obriga migration potencialmente custosa e ajuste de muita query/UI.
- **(C) Inteiros pra sample, `Decimal` só pra contribuição de liga**: campo novo `contributedSacks: Decimal` na tabela de composição. Sample mantém Int. Saldo derivado (se Q0.2=A) é Decimal.

**Tradeoff**: (A) é o caminho mais barato e provavelmente atende o caso de uso (operadores tendem a combinar em sacas inteiras na prática). (B) é "future-proof" mas pesado. (C) é compromisso técnico mas adiciona inconsistência de tipo entre tabelas.

### Q0.5 — Liga pode ser insumo de outra liga? (cascata recursiva)

**Análise**: Liga AB existe; depois operador cria liga CD usando uma parte da AB junto com lote E. Permitido?

- **(A) Sim, cascata permitida**: liga é tratada como qualquer sample na seleção de origens. Rastreabilidade precisa de query recursiva (CTE no Postgres) pra mostrar a árvore completa "esta liga veio dessas, que vieram dessas".
- **(B) Não, só amostras puras como insumo**: liga não pode entrar em outra liga. Sistema bloqueia seleção de uma sample com `isBlend=true` como origem. Rastreabilidade fica em 1 nível.

**Tradeoff**: (A) é mais flexível e bate com a realidade (corretoras fazem misturas sobre misturas), mas a árvore de origens cresce e queries de rastreabilidade ficam mais caras. (B) limita o sistema mas mantém tudo plano e simples de consultar.

### Q0.6 — `internalLotNumber` da liga: mesma sequência ou faixa reservada?

**Análise**: Hoje o lot number é numérico puro sequencial (vi `initialSequence: 5657` em memória recente). Liga gera um novo lot number — qual padrão?

- **(A) Mesma sequência, sem distinção visual**: liga recebe o próximo número (ex: 5658, 5659...) misturado com amostras normais. Operador identifica que é liga via flag/badge na UI.
- **(B) Prefixo dedicado (ex: "L-")**: liga vira `L-5658`. Distinção imediata no número, mas quebra a homogeneidade do formato atual (só números).
- **(C) Faixa numérica reservada**: ligas começam em outro range (ex: 90000+). Mantém formato numérico puro, com identificação tácita pelo intervalo.

**Tradeoff**: (A) é o mais simples e bate com o que existe hoje (a UI marca o que é liga). (B) é o mais explícito mas requer ajuste em validação de QR/scanner. (C) é um meio-termo que pode ficar confuso se a faixa esgotar.

---

## Decisões

### Bloco 0 — Premissas fundacionais

**Q0.1 — Liga é uma `Sample`** (entidade não-separada).

- A liga reusa o modelo `Sample` existente (lifecycle, eventos, queries, UI de detalhe, dashboards e listagens funcionam de graça).
- Composição (origens + contribuições) vive em tabela auxiliar nova: `SampleBlendComponent` com colunas `sampleId` (a liga), `originSampleId` (a origem) e `contributedSacks` (quanto cada origem aportou).
- Flag `isBlend: boolean` no `Sample` (ou derivável de `count(blendComponents) > 0`) — a decidir no Bloco 8 (migration).
- **Implicação**: descartada a alternativa de criar entidade `Blend`/`League` separada com infra paralela.

**Q0.2 — REVISADA em 2026-05-15. Criação da liga NÃO afeta saldo das origens.**

> **Nota**: a versão anterior dizia "origem mantém saldo via `blendedSacks` decrementado na criação". **Essa versão foi descartada** após o usuário esclarecer que a liga é uma **intenção/proposta**, não materialização física. Texto correto abaixo.

- Criar uma liga **não consome** as origens. Cada origem mantém seu saldo integralmente (`availableSacks = declaredSacks - soldSacks - lostSacks`, fórmula idêntica ao Sample normal de hoje).
- A mesma amostra pode contribuir pra **N ligas diferentes** sem restrição. Liga é "demonstração" — múltiplas propostas simultâneas são permitidas.
- O registro do "comprometimento" das origens vive **apenas** na tabela `SampleBlendComponent` (composição). Sem campo `blendedSacks` no Sample.
- Origens só são afetadas comercialmente **no momento da venda ou perda da liga** (ver Bloco F7).
- **Implicação**: sem migration em campos existentes de Sample. Único modelo novo é `SampleBlendComponent`. `availableSacks` continua sendo `declared - sold - lost` sem mudança.

**Q0.3 — REVISADA em 2026-05-18 (T0.A). A liga é reversível via evento (`BLEND_REVERTED`).**

> **Nota**: a versão anterior dizia "restaura saldo das origens (decrementa `blendedSacks` das origens)". Esse texto era resíduo da Q0.2 pré-revisão — incoerente com a Q0.2 revisada (que eliminou `blendedSacks`). Texto correto abaixo.

- A liga pode ser desfeita: novo evento mutante `BLEND_REVERTED` transiciona a liga para `INVALIDATED`.
- **Origens permanecem intactas** — não há nada para restaurar, porque a criação da liga nunca alterou origens (Q0.2 revisada: origens só são afetadas na venda/perda da liga, via cascata de F7.4).
- Restrição idêntica à invalidação de sample hoje: só permitido se `soldSacks == 0 AND lostSacks == 0` na própria liga. Pós-venda/perda, a reversão é bloqueada (cascata reversa fica fora de escopo MVP — ver F8.4: INVALIDATED é terminal).
- Composição em `SampleBlendComponent` é preservada como histórico, mesmo após reversão (F8.3).
- **Implicação**: dois eventos no `SampleEventType` (`BLEND_CREATED` na criação e `BLEND_REVERTED` na reversão); reversão emite `BLEND_REVERTED` (carrega motivo) + `SAMPLE_INVALIDATED` (status). Regras de OCC e idempotência aplicáveis.

**Q0.4 — Unidade de sacas continua Int em todo lugar.**

- `declaredSacks`, `soldSacks`, `lostSacks` no Sample e `contributedSacks` na tabela de composição (`SampleBlendComponent`) todos permanecem `Int`. Não há `blendedSacks` (Q0.2 revisada).
- Operador arredonda na prática (decisão alinhada ao uso real — combinações em sacas inteiras).
- **Implicação**: nenhuma migration de tipo. Tipos do schema atual aceitam tudo que a feature precisa.

**Q0.5 — Cascata recursiva permitida: liga pode ser insumo de outra liga.**

- Como liga é um `Sample` (Q0.1), naturalmente pode aparecer na seleção de origens de outra liga, sem código extra de bloqueio.
- Rastreabilidade da árvore completa de origens via CTE recursiva no Postgres (consulta-padrão a definir no Bloco 8/API).
- **Implicação**: índice apropriado em `SampleBlendComponent(sampleId)` e `SampleBlendComponent(originSampleId)` pra navegar ambas as direções; estratégia de limite de profundidade ou ciclo de validação pra evitar loops infinitos (na prática loops são impossíveis se cada liga é nova, mas defensar via constraint).

**Q0.6 — `internalLotNumber` da liga: mesma sequência sem distinção no número.**

- Liga recebe o próximo número da mesma sequência das amostras normais (ex: 5658, 5659...).
- Distinção visual fica na UI (flag `isBlend` aciona badge/ícone/cor).
- **Implicação**: nenhuma mudança em scanner QR, validação de formato, geração de etiqueta. Reusa `getNextInternalLotNumber()` existente.

### Bloco F1 — Entrada e seleção (UX top-level)

**F1.0 — Ponto de entrada: FAB radial na página `/samples`.**

- O FAB "+" existente na página de Amostras (`.cv2-fab`) deixa de navegar direto pra "Nova amostra". Ao clicar, ele se **expande** em 2 opções dispostas ao redor (efeito "speed dial" / menu radial):
  - **Unidade** — abre o fluxo atual de Nova Amostra (BottomSheet "Nova amostra").
  - **Liga** — entra em **modo seleção** na própria página `/samples` (ver F1.1 + F1.C pra transição e refetch).
- Distância visual: as 2 opções aparecem em arco ao redor do "+" (a definir ângulos/posição exatos no momento da implementação).
- **Animação** (F1.C resolvida): tap no "+" dispara animação slide+fade dos 2 satélites em arco, ~150-200ms. Tap em um satélite faz ele pulsar rápido + FAB anima fechando + ação dispara. Tap fora dos satélites (backdrop) fecha o FAB sem disparar ação.
- **Implicação**: o FAB hoje é `<SampleQuickCreateFab onClick={() => setNewSampleModalOpen(true)}>`. Vai precisar virar um componente novo com estado interno aberto/fechado e renderizar 2 botões satélite quando aberto. Outras páginas (ex: `/clients`) continuam com FAB simples (criação de cliente único — comportamento de hoje).

**F1.1 — REVISADA em 2026-05-18 (F1.D). Modo seleção múltipla na lista de amostras: especificação visual completa.**

> **Nota**: a versão anterior previa "footer flutuante" e "footer expansível com lista" (F1.A). Ambos foram **revogados** após especificação detalhada do usuário (ver F1.D na seção Tensões revisadas). A revisão das amostras selecionadas migrou pro bottom-sheet unificado (ver F1.D).

- Após o usuário escolher "Liga", a página `/samples` entra em **modo seleção** imediatamente (transição instantânea — F1.C).
- **Cards de amostra ganham bolinha de seleção** à esquerda (verticalmente centralizada na altura do card; conteúdo do card empurra pra direita pra acomodar). Estados visuais:
  - **Vazia** (não-selecionada): borda fina cinza, fundo transparente.
  - **Selecionada**: preenchida verde da marca + check `✓` branco dentro.
  - **Inelegível** (`eligibility.eligible === false` — F1.B): bolinha cinza opaca + card inteiro acinzentado + tooltip mapeado de `reason` (F1.4).
- **Tap em card elegível** alterna seleção (bolinha vazia ↔ selecionada). Tap em card inelegível não faz nada além do tooltip.
- **Header durante o modo seleção** (substitui o header normal):
  - **Esquerda**: ícone `X` — tap sai do modo (limpa seleção + volta `/samples` neutra).
  - **Centro**: título **"Selecionar amostras"** (substitui "Amostras").
  - **Direita** (lugar do botão de filtro): contador **"N selecionadas"** clicável — tap abre o **popover de revisão** ancorado abaixo do contador (lista compacta com `lote · sacas` + X individual por linha + scroll após 3 cards). Substitui a abertura do bottom-sheet completo, decidido em 2026-05-19 (ver Log de sessões). O bottom-sheet completo continua sendo aberto **apenas pela seta `→`** (finalização).
- **Input de busca por texto continua ativo** no header secundário (lot/cliente). Apenas o botão de filtro avançado some.
- **Navbar/tabbar inferior some** durante o modo (foco máximo na tarefa).
- **FAB vira seta `→`** (Continuar) no mesmo lugar do "+":
  - Disabled quando < 2 amostras selecionadas (F1.7): opacidade 40% + cursor block + tooltip "Selecione pelo menos 2 amostras" no tap.
  - Habilitada quando ≥ 2 → tap abre o **bottom-sheet unificado de confirmação** (F1.D).
- **Refetch otimista** (F1.C): a lista atual permanece visível enquanto `listSamples?eligibleForBlend=true` roda em background. Quando o refetch chega, cards atualizam (`eligibility`, `committedSacks`). Se uma amostra **já selecionada** virar inelegível após o refetch: seleção é desfeita + toast "Amostra X removida da seleção — motivo Y".
- **Se refetch falhar** (offline / 500): sair do modo seleção + toast "Não foi possível carregar amostras pra liga". Volta `/samples` ao estado neutro. Sem retry automático no MVP.
- **Selecionados ficam preservados** entre buscas/filtros (F1.1 original mantido).
- **Implicação**: novo estado em `/samples/page.tsx` (`selectionMode: 'idle' | 'blend'`); cards reagem ao modo; header re-render com a barra de modo seleção; tabbar e gestos default (abrir detalhe) ficam desabilitados temporariamente. Componente novo: `<SelectionModeHeader />` (X + título + contador) e ajustes em `<SampleCard />` pra renderizar a bolinha.

**F1.2 — Sem restrição de role: todos podem criar liga.**

- Não há permissão diferenciada. Qualquer usuário autenticado consegue iniciar fluxo de criação de liga. Mesma regra do "Nova amostra" hoje.
- **Implicação**: backend não rejeita por role, só por status da sessão.

**F1.3 — REVISADA em 2026-05-18 (F1.D), 2026-05-19. Dois caminhos distintos: contador = revisão; seta = criação direta.**

- **Tap no contador "N selecionadas"** → abre o **popover de revisão** (B1.5) ancorado abaixo do botão: lista compacta com `lote · sacas` + X por linha + scroll após 3 cards. Click fora fecha; remoção da última amostra fecha o popover mas mantém o modo seleção.
- **Tap na seta `→`** do FAB → abre **bottom-sheet de confirmação** (B2.1) com inputs de contribuição embutidos.
  - Cada amostra vira uma linha com `[lot · cliente · X disp.] [input contrib: total]` + botão `×` pra remover. Soma rodando "Total da liga: N sc". Botão **"Criar liga"** no rodapé (disabled se < 2 ou inputs inválidos).
  - Tap "Criar liga" → chama `createBlend` direto. Sucesso → fecha sheet + abre `<SampleCreatedSuccessModal entity="blend">`. Não há modal F3 intermediário (removido em 2026-05-19 — características da liga são derivadas das origens, ver Log de sessões).
  - Tap "Voltar" → fecha + permanece no modo seleção.
- Reusa o padrão `BottomSheet` cabeçalho verde pra coerência visual.

**F1.4 — Elegibilidade: amostras REGISTRATION_CONFIRMED ou CLASSIFIED com saldo disponível.**

> **Relaxada em 2026-05-19**: antes era "só CLASSIFIED com saldo". Agora amostras ainda em REGISTRATION_CONFIRMED também podem ser ligadas — a liga nasce em branco (F4.b) e segue o fluxo normal de classificação. Cascata de venda/perda emite SALE_CREATED/LOSS_RECORDED em origens REGISTERED diretamente (sem precisar passar por CLASSIFIED — sem trigger Prisma bloqueando). Reason `NOT_CLASSIFIED` removida do enum.

- Aparece como selecionável na lista durante o modo seleção apenas quem atende: `status != INVALIDATED AND availableSacks > 0`. Como o enum `SampleStatus` só tem 3 valores (`REGISTRATION_CONFIRMED | CLASSIFIED | INVALIDATED`), a regra prática é "qualquer status ativo com saldo".
- Como `availableSacks = declaredSacks - soldSacks - lostSacks` (fórmula idêntica ao Sample normal — Q0.2 revisada), amostras totalmente vendidas ou perdidas naturalmente saem da seleção. Amostras já comprometidas em outras ligas **continuam elegíveis** — overcommit é permitido por design (Q0.2 + T0.B resolvida).
- **Contrato backend ↔ frontend** (F1.B resolvida): a resposta de cada amostra inclui o campo estruturado `eligibility: { eligible: boolean, reason: 'INVALIDATED' | 'NO_BALANCE' | null }`. `reason` é `null` quando `eligible = true`. Single source of truth da regra fica no backend; frontend mapeia `reason` → texto pt-BR local (sem acoplamento de mensagens no payload).
- **Implicação backend**: filtro `eligibleForBlend: true` em `listSamples` (ou variante de endpoint) retorna **todos os samples** (elegíveis e não) com o campo `eligibility`. Não filtra inelegíveis fora — frontend precisa renderizá-los acinzentados (decisão F1.4). Resposta também inclui, por amostra: `availableSacks` (físico) e `committedSacks` (soma de `contributedSacks` em ligas ativas pré-comercialização — ver T0.B). Frontend deriva `realFreeSacks = availableSacks - committedSacks` para UX (F2.4).
- **Implicação frontend**: amostras com `eligibility.eligible === false` renderizadas acinzentadas (e checkbox desabilitado) com tooltip texto mapeado de `reason`:
  - `INVALIDATED` → "Amostra inválida"
  - `NO_BALANCE` → "Sem saldo disponível"

**F1.5 — Pode misturar amostras de clientes diferentes (livre).**

- Sem restrição de `ownerClientId` na seleção. Corretora frequentemente combina lotes de produtores diferentes pra venda em bloco.
- **Implicação**: o `ownerClientId` do lote resultante precisa ser decidido no Bloco F3 (provavelmente nulo/corretora, ou cliente do operador, ou herdado do primeiro selecionado — a decidir).

**F1.6 — Pode misturar amostras de safras diferentes (livre).**

- Sem restrição de `declaredHarvest`. Operação real eventualmente combina safras (ex: fim de uma safra com sobra da anterior).
- **Implicação**: o `declaredHarvest` do lote resultante precisa ser decidido no Bloco F3 (provavelmente livre/manual, ou herdado da safra "dominante" pela quantidade, ou múltiplas safras como texto).

**F1.7 — Mínimo 2 amostras, sem máximo.**

- Frontend desabilita o botão "Continuar" se a seleção tem menos de 2 itens.
- Backend rejeita criação com `components < 2` (validação de domínio).
- Sem teto superior — a opção de cascata (Q0.5) já implica que ligas podem crescer.
- **Implicação**: a UI precisa de mensagem clara quando só 1 selecionado ("Selecione mais 1 amostra pra continuar").

### Bloco F2 — Contribuição por lote

**F2.1 — REVISADA em 2026-05-18 (F1.D). UX: input numérico no bottom-sheet de confirmação, pre-preenchido com total da amostra.**

- Cada amostra selecionada vira uma linha no bottom-sheet unificado de confirmação: `[Lote 5658 · Cliente X · 80 disp.] [input: 80 sc] [×]`.
- O input é **pré-preenchido com `availableSacks`** (total físico da amostra) — F2.2 revisado em F1.D. Operador edita pra parcial só quando quer ligar menos que o total.
- Saldo disponível físico (`availableSacks`) mostrado claramente como label "X disp." ao lado. Quando há comprometimento em outras ligas ativas (`committedSacks > 0`), warning F2.4 sobe na linha.
- Sem slider, sem botões +/-, sem badge/cor especial pra "parcial" — visual fica limpo, número diferente do total é o sinal de ajuste consciente. Sem botão "restaurar pro total" — operador apaga e re-digita se quiser voltar.
- **Implicação**: cada linha do bottom-sheet vincula uma `originSampleId` ao `contributedSacks: Int`. Validação inline:
  - Input rejeita não-números e valores ≤ 0.
  - Input rejeita valores acima de `availableSacks` (hard cap físico).
  - Input **não pode ficar vazio** (operador apagou o default) — "Continuar" disabled enquanto algum input estiver vazio ou inválido.
  - Overcommit (acima de `realFreeSacks` mas dentro de `availableSacks`) é **permitido** e apenas sinalizado pelo warning F2.4 (Q0.2 + T0.B).
- Quando origem é liga (`isBlend = true`): input fixo e disabled, mostrado como "Liga inteira: {declaredSacks} sc" (F7.7). Tooltip explicativo (F7.C): _"Para usar parte de uma liga, reverta-a primeiro e crie uma menor"_.

**F2.2 — REVOGADA em 2026-05-18 (F1.D).**

> **Substituída**: F2.2 originalmente exigia "default vazio" para forçar reflexão consciente. Após especificação detalhada do usuário (F1.D), o operador relata que **quase 100% das vezes a liga é feita com o total das sacas de cada amostra** — ligas parciais são exceção, não regra. Default vazio virava fricção inútil. Decisão atual: **default = `availableSacks`** (total físico da amostra). A reflexão consciente, quando necessária, é o **ato de editar** o input pra parcial — não o ato inicial de digitar. Ver F2.1 atualizado.

**F2.3 — `declaredSacks` da liga: soma automática das contribuições.**

- O campo `declaredSacks` do `Sample` resultante (a liga) é = `Σ contributedSacks`.
- UI mostra a soma rodando ao lado/abaixo do formulário (ex: "Total da liga: 130 sc") atualizada em tempo real.
- Sem campo manual editável pra `declaredSacks` da liga. Garante invariante: o que entrou é o que existe.
- **Implicação**: backend valida `liga.declaredSacks == Σ component.contributedSacks` na criação. Se diverge, rejeita.

**F2.4 — Warning de comprometimento prévio (T0.B).**

- Quando a amostra-origem já é referenciada em outras **ligas ativas** (definição em T0.B: `blend.status != INVALIDATED AND blend.soldSacks == 0 AND blend.lostSacks == 0`), a linha do formulário exibe um aviso textual abaixo do input: "Comprometida em N ligas ativas — saldo livre real: X sc" (com link discreto "ver ligas" expandindo lista local).
- **Sempre exibido** se `committedSacks > 0`, mesmo sem overcommit no momento. Transparência máxima é a regra (decisão T0.B).
- Cor/ícone discreto (amarelo/atenção) sobe quando `contribuição planejada > realFreeSacks` — sinaliza overcommit ativo na hora da digitação.
- **Sem bloqueio** do input. Operador pode prosseguir com overcommit (Q0.2 permite); apenas é informado.
- **Implicação backend**: `listSamples` (modo `eligibleForBlend`) retorna `committedSacks` por amostra. `GET /samples/:id` também retorna `committedSacks` + `activeBlends: [{sampleId, lotNumber, contributedSacks}]` pra alimentar a seção do detalhe (ver Wave B3).
- **Implicação frontend**: componente novo (ex: `<CommittedWarning />`) renderiza o aviso inline. Backend computa `committedSacks` via query (sem campo persistido — evita risco de drift).

### Bloco F3 — Características da liga

> **Revisão radical em 2026-05-19**: o **modal F3 foi removido**. A liga é definida primariamente pela sua **composição** (origens + contribuições, em `SampleBlendComponent`). Características próprias (dono, safra, local, observações) viram nada coletado no momento da criação — owner fica null por padrão (carteira da corretora), safra é derivada automaticamente das origens no backend (distinct ordenado, join ', '), location e notes ficam null. Edição posterior permite refinar via detalhe da liga. Ver Log de sessões 2026-05-19. As entradas F3.1, F3.2, F3.B, F3.6, F3.7 abaixo descrevem **o estado anterior** — mantidas como histórico de decisão e contexto pra futuras edições no detalhe da liga.

**F3.1 — Dono da liga: operador escolhe livremente, podendo deixar nulo.**

- Campo `ownerClientId` no formulário com autocomplete (mesmo `ClientLookupField` do "Nova amostra"), mas **opcional** — operador pode deixar vazio quando a liga é "carteira da corretora" até ser vendida.
- Reflete realidade operacional: lote ligado fica em estoque interno enquanto não tem comprador definido.
- **Implicação**: backend já aceita `ownerClientId: null` no Sample (campo é `String?` no Prisma). Sem mudança de schema. UI mostra o ClientLookupField marcado "Opcional" e label "Dono (se houver)".
- **F3.A (vendedor implícito)** — REGISTRADO em 2026-05-18: o modelo `SampleMovement` não tem campo de vendedor. O vendedor de qualquer venda é sempre **implícito**: `sample.ownerClientId` da Sample associada ao movimento (resolvido via JOIN no banco ou via include no Prisma). Para liga sem dono (`liga.ownerClientId = null`), o SALE_CREATED na liga aparece como "venda sem vendedor identificado" — a venda da liga é implicitamente "carteira da corretora". A cascata em origens (F7.4 + T0.D) **mantém integridade**: cada origem tem seu próprio `ownerClientId` (real, produtor) e a venda em cascata é registrada corretamente como "produtor X → comprador C". Nenhuma mudança no modelo é necessária no MVP. Docstring Prisma em `Sample.ownerClientId` registra: "Também serve como vendedor implícito em SampleMovement — relatórios financeiros derivam vendedor desta coluna via JOIN".
- **UI da venda quando liga sem dono** (F3.A): modal de venda detecta `liga.isBlend && liga.ownerClientId === null` e exibe bloco destacado com 2 botões: **"Atribuir dono primeiro"** (abre seleção de cliente, faz PATCH no Sample, reabre modal de venda com owner preenchido) + **"Vender mesmo assim"** (prossegue como venda normal sem owner). Operador escolhe — sistema **não bloqueia** (F3.1 mantém dono opcional). Estimula boa prática sem fricção.

**F3.2 — REVOGADA em 2026-05-19. Safra deriva automaticamente das origens.**

> Decisão substituída: no momento da criação, backend agrega `distinct(originHarvests).sort().join(', ')` e grava em `declared.harvest`. Quando todas as origens têm a mesma safra (ex: todas 24/25), fica `'24/25'`. Quando mistas (ex: 24/25 + 25/26), fica `'24/25, 25/26'`. Quando nenhuma origem tem safra (raro), fica `null` — schema do payload `REGISTRATION_CONFIRMED` atualizado pra aceitar `harvest: null` apenas em registros de liga (sample normal continua obrigando string non-empty via form). Operador pode editar a safra depois via detalhe da liga (wave futura). **F3.B (hint embaixo do input)** também revogada — sem input, sem hint.

**F3.2 (HISTÓRICO — operador sempre digita manualmente, sem pré-preenchimento)**

- Campo `declaredHarvest` vazio por default. Operador informa explicitamente (formato livre, ex: `25/26`, `MISTA`, `2024-2025`).
- Sem auto-derivação da "safra dominante" — mesmo se todas as origens têm a mesma safra, operador re-digita conscientemente.
- **Implicação**: validação mantém o mesmo do Sample normal (string obrigatória, não-vazia). UI mostra o input com placeholder mas sem valor inicial.
- **F3.B (hint informativo)** — REGISTRADO em 2026-05-18 / REVOGADA em 2026-05-19: o modal "Nova liga" mostraria, embaixo do input `declaredHarvest`, um texto pequeno em cinza listando as safras distintas das origens. Sem modal, sem hint.

**F3.4 — `classificationType` nulo até a classificação oficial.**

- Liga nasce em `status = REGISTRATION_CONFIRMED` com `classificationType = null` — mesmo path de um Sample normal.
- Só vira `BICA`/`PREPARADO`/`BAIXO`/`ESCOLHA` quando o operador finaliza a classificação oficial da liga (fluxo padrão de classificação via ficha + foto + extração IA).
- Sem antecipação na criação — café ainda não foi analisado quando a liga é formada.
- **Implicação**: nenhuma mudança no modelo. Liga reusa exatamente o lifecycle de classificação do Sample normal.

**F3.3 — `declaredOwner` (string) também nulo quando `ownerClientId` é nulo.**

- Sem texto fallback ("Corretora" descartado). Schema já permite (`declaredOwner: String?`).
- Listagens mostram "—" ou "Sem dono" pra liga sem cliente atribuído.
- **Implicação**: `declaredOwner` segue regra atual: derivado de `selectedOwnerClient?.displayName ?? null`. Se cliente é null, owner também. **Docstring Prisma** (T0.C) deve registrar: "Em registros com `isBlend = true` e sem cliente, é intencionalmente null".

**F3.5 — `declaredOriginLot` oculto do formulário, fica nulo no banco.**

- Em liga, "origem" é a composição (`SampleBlendComponent`) — não faz sentido um campo de texto livre. Visualmente, a origem aparece em outro lugar (lista de componentes na tela de detalhe).
- **Implicação**: campo não aparece no form da liga. Backend grava `declaredOriginLot: null` na criação. Telas de detalhe (que hoje mostram `declaredOriginLot`) precisam ser ajustadas pra renderizar a composição em vez do campo (em ligas). **Docstring Prisma** (T0.C) deve registrar: "Em registros com `isBlend = true`, é intencionalmente null — origem real fica em `SampleBlendComponent`".

**F3.6 + F3.7 — REVOGADAS em 2026-05-19. Local e Observações não coletados na criação.**

> Sem modal F3, esses campos ficam `null` na criação da liga. Edição posterior via detalhe da liga (wave futura) permite preencher. Backend não muda — `declaredLocation` e `notes` já são nullable no schema.

**F3.8 — `receivedChannel` = `'internal'` (T0.C revisado).**

- `receivedChannel`: **não aparece na UI**. Backend usa `'internal'` em liga (novo valor adicionado ao enum em T0.C — substitui o `'in_person'` silencioso anterior). Semanticamente correto: liga é gerada internamente, não recebida.
- **Implicação técnica (T0.C)**: o enum `RECEIVED_CHANNELS` (`src/samples/sample-command-service.js:16`) e o JSON schema `docs/schemas/events/v1/payloads/registration-confirmed.payload.schema.json` ganham `'internal'` como valor válido. `receivedChannel` é **payload de evento** (não coluna SQL), portanto a mudança é trivial: 2 linhas + 1 entrada no enum. Sem migration de banco.

**Bloco F3 fechado em 2026-05-15.** ✅

### Bloco F4 — Preview e classificação prevista

**F4 — Sem passo de preview. Criação vai direto do formulário.**

- Após preencher o formulário do novo lote (Bloco F3), o botão "Criar liga" submete imediatamente. Sem tela intermediária de "Confirme os dados".
- Coerente com a decisão tomada na refatoração de "Nova Amostra" (sessão anterior): removemos o step `review` por ser redundante.
- **Implicação**: o backend valida tudo (composição mínima 2, contribuições > 0, sacas ≤ saldo, safra obrigatória, etc.) na chamada de criação e devolve erro se algo falhar.

**F4.b — Sem cálculo de classificação prevista em lugar nenhum.**

- Liga nasce **em branco** (`latestClassificationData = null`). A classificação oficial é a única referência.
- Sem campo `predictedClassificationData`. Sem média ponderada. Sem cálculo on-the-fly.
- **Implicação prática**: máxima simplicidade. Liga reusa exatamente o fluxo de classificação do Sample normal (foto → IA → ficha validada → `latestClassificationData` preenchido). Composição (`SampleBlendComponent`) fica visível na tela de detalhe pra rastreabilidade — mas não influencia a classificação automaticamente.
- **Tradeoff aceito**: o operador não vê "qual é a expectativa" antes de fisicamente classificar a liga. Pode descobrir surpresas. Trade-off é favor da simplicidade.

**Bloco F4 fechado em 2026-05-15.** ✅

### Bloco F5 — Confirmação e tela de sucesso

**F5.1 — Reusa o `SampleCreatedSuccessModal` existente.**

- Mesmo modal central da "Nova Amostra": header verde, check animado, número do lote em destaque, 2 botões.
- Label do header: "Liga criada" (pra Sample normal continua "Amostra criada"). Botões: "Ir para liga" + "Criar outra liga".
- **Implicação**: o componente `SampleCreatedSuccessModal.tsx` ganha 1 prop opcional `entity?: 'sample' | 'blend'` (default `'sample'`) que troca os textos. Mesmo CSS, mesmo behavior.

**F5.2 — Sem auto-impressão de etiqueta após criação.**

- A criação (`REGISTRATION_CONFIRMED`) **não** dispara `requestQrPrint` — comportamento idêntico ao Sample normal hoje.
- A auto-impressão existente no projeto acontece **apenas pós-classificação** (`CLASSIFICATION_COMPLETED`, `sample-command-service.js:1898`) — esse auto-print é Q.auto e continua valendo quando a liga for classificada oficialmente.
- **Implicação**: ao criar a liga, **nenhum** PrintJob é gerado. Quando o operador for classificar a liga (passo posterior), aí sim a etiqueta sai automaticamente. Antes disso, etiqueta é manual via botão no detalhe (se quiser).

**F5.3 — Botão "Criar outra liga" volta pra tela inicial (FAB radial fechado).**

- Modal central fecha. `/samples` volta ao estado normal (sem modo seleção, FAB no estado fechado).
- Operador clica no FAB de novo se quer iniciar outra liga.
- **Implicação**: comportamento idêntico ao "Criar outra" da Nova Amostra hoje (volta sem estado inicial) — só que a Nova Amostra reabre o BottomSheet limpo, enquanto a liga volta pra tela `/samples` "neutra" (porque o fluxo de liga começa na lista, não num modal).

**Bloco F5 fechado em 2026-05-15.** ✅

---

**Resumo do formulário do novo lote (consolidado em 2026-05-18):**

| Campo                                                                       | Onde aparece                                                  | Obrigatório? | Default                                                                | Notas                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contribuições por origem (`contributedSacks` em `SampleBlendComponent`)** | **Bottom-sheet de confirmação** (F1.D) — uma linha por origem | Sim (todas)  | **`availableSacks` (total da amostra)** (F2.1 revisado, F2.2 revogado) | Editável; rejeita 0/não-número/> `availableSacks`/vazio. Liga como origem → fixo em `declaredSacks` (F7.7) + tooltip (F7.C). Warning F2.4 sobre overcommit. |
| Sacas da liga (`declaredSacks`)                                             | Bottom-sheet (read-only "Total da liga: N sc")                | —            | Soma das contribuições (F2.3)                                          | Backend valida `Σ contributedSacks == declaredSacks`.                                                                                                       |
| Dono (`ownerClientId` + `declaredOwner`)                                    | Modal F3 — autocomplete `ClientLookupField`                   | Não (F3.1)   | Vazio                                                                  | Liga sem dono = "carteira da corretora". UI da venda usa "Atribuir dono primeiro" / "Vender mesmo assim" (F3.A).                                            |
| Safra (`declaredHarvest`)                                                   | Modal F3 — input texto                                        | Sim (F3.2)   | Vazio                                                                  | **Hint embaixo do input** (F3.B): "Origens contêm safras: 24/25, 25/26" — agregado no frontend a partir de `components`.                                    |
| Local (`declaredLocation`)                                                  | Modal F3 — input texto (max 30)                               | Não (F3.6)   | Vazio                                                                  | Idêntico ao Sample normal.                                                                                                                                  |
| Observações (`notes`)                                                       | Modal F3 — textarea (max 500)                                 | Não (F3.7)   | Vazio                                                                  | Sem auto-população.                                                                                                                                         |
| Lote de origem (`declaredOriginLot`)                                        | Não aparece (F3.5)                                            | —            | `null`                                                                 | Docstring Prisma: intencionalmente null em `isBlend = true` (T0.C). Origem real fica em `SampleBlendComponent`.                                             |
| Tipo de classificação (`classificationType`)                                | Não aparece (F3.4)                                            | —            | `null`                                                                 | Vira após classificação oficial (fluxo idêntico ao Sample normal — F6.1).                                                                                   |
| Recebido por (`receivedChannel`)                                            | Não aparece (F3.8 + T0.C)                                     | —            | **`'internal'`** (novo valor no enum)                                  | Substituiu `'in_person'` silencioso. Liga é gerada internamente, não recebida.                                                                              |

**Fluxo de telas resumido**:

1. `/samples` → tap "+" → "Liga" (F1.0, F1.C).
2. Modo seleção: cards com bolinhas, header `[X] "Selecionar amostras" [N selecionadas]`, FAB-seta (F1.1, F1.D).
3. Tap seta (ou contador) → **bottom-sheet unificado** com contribuições embutidas + `×` por linha + "Total da liga" (F1.D / F2.1).
4. Tap "Continuar" → fecha sheet → abre **modal F3** central (dono, safra com hint, local, obs) (F1.3 / Wave B2).
5. Tap "Criar liga" → backend cria → modal de sucesso `SampleCreatedSuccessModal entity='blend'` (F5.1, F5.2, F5.3).

---

## Pendências

### Bloco 0 — Premissas fundacionais

- [x] **Q0.1** — Liga é uma `Sample` (com composição em tabela auxiliar `SampleBlendComponent`).
- [x] **Q0.2** ⚠️ **REVISADA** — Criação não afeta origem. Saldo decrementa só na venda/perda da liga (cascata via `SampleBlendComponent`). Sem `blendedSacks`.
- [x] **Q0.3** — Reversível via evento `BLEND_REVERTED` (mesma regra de invalidação: sem venda/perda na liga).
- [x] **Q0.4** — Sacas continuam `Int` em todo lugar (sem fração).
- [x] **Q0.5** — Cascata permitida (liga pode entrar em outra liga); rastreabilidade via CTE recursiva.
- [x] **Q0.6** — Mesma sequência de `internalLotNumber`; UI marca com badge/ícone.

**Bloco 0 fechado em 2026-05-15.** ✅

### Bloco F1 — Entrada e seleção

- [x] **F1.0** — Ponto de entrada: FAB radial na `/samples` com 2 opções (Unidade / Liga). Animação slide+fade em arco (F1.C).
- [x] **F1.1** ⚠️ **REVISADO em 2026-05-18 (F1.D)** — Modo seleção: cards com bolinhas (vazia/verde+✓/cinza opaca), header `[X] "Selecionar amostras" [N selecionadas]`, sem navbar, FAB vira seta `→` (disabled se < 2).
- [x] **F1.2** — Sem restrição de role: todos podem criar liga.
- [x] **F1.3** ⚠️ **REVISADO em 2026-05-18 (F1.D)** — Próximo passo: bottom-sheet unificado com contribuições embutidas + modal F3 (dono/safra/local/obs).
- [x] **F1.4** ⚠️ **REVISADO em 2026-05-18 (T0.A + T0.B + F1.B)** + **RELAXADO em 2026-05-19** — Elegíveis: `status != INVALIDATED AND availableSacks > 0`. REGISTRATION_CONFIRMED também é aceito (antes era CLASSIFIED only). Backend retorna `eligibility: { eligible, reason }` estruturado (`reason` ∈ `'INVALIDATED' | 'NO_BALANCE' | null`) + `committedSacks` por amostra.
- [x] **F1.5** — Sim, pode misturar clientes diferentes.
- [x] **F1.6** — Sim, pode misturar safras diferentes.
- [x] **F1.7** — Mínimo 2 amostras, sem máximo (botão Continuar bloqueado se < 2).
- [x] **F1.A** ❌ **REVOGADO em 2026-05-18 (F1.D)** — Footer expansível substituído pelo bottom-sheet unificado.
- [x] **F1.B** — Backend retorna motivo estruturado de inelegibilidade.
- [x] **F1.C** — FAB radial: transição instantânea + refetch otimista + animação slide+fade.
- [x] **F1.D** ✨ **NOVO em 2026-05-18** — Especificação completa do modo seleção + bottom-sheet unificado de confirmação com inputs de contribuição embutidos.

**Bloco F1 fechado em 2026-05-15** (com F1.A revogada, F1.B/F1.C/F1.D adicionadas, F1.1/F1.3/F1.4 revisadas em 2026-05-18). ✅

### Bloco F2 — Contribuição por lote

- [x] **F2.1** ⚠️ **REVISADO em 2026-05-18 (F1.D)** — Input no bottom-sheet de confirmação, pré-preenchido com `availableSacks`. Edita pra parcial só quando quer menor que total.
- [x] **F2.2** ❌ **REVOGADO em 2026-05-18 (F1.D)** — Default vazio substituído por default = total. Operador relatou que 100% das ligas são "total"; ligas parciais são exceção.
- [x] **F2.3** — `declaredSacks` da liga = soma automática (sem campo manual).
- [x] **F2.4** — Warning de comprometimento prévio (T0.B): sempre mostra `committedSacks` e `realFreeSacks` quando `committedSacks > 0`; sinaliza overcommit ativo, mas não bloqueia.

**Bloco F2 fechado em 2026-05-15** (com F2.4 adicionado, F2.1 revisado e F2.2 revogado em 2026-05-18). ✅

### Bloco F3 — Formulário do novo lote (em aberto)

- [x] **F3.1** ⚠️ **EXPANDIDO em 2026-05-18 (F3.A)** — `ownerClientId` opcional. UI da venda quando liga sem dono: "Atribuir dono primeiro" / "Vender mesmo assim". Vendedor implícito via `sample.ownerClientId`.
- [x] **F3.2** ⚠️ **EXPANDIDO em 2026-05-18 (F3.B)** — `declaredHarvest` manual sempre + hint inline no modal F3 listando safras das origens.
- [x] **F3.3** — `declaredOwner` nulo se `ownerClientId` nulo (sem fallback texto). Docstring Prisma (T0.C).
- [x] **F3.4** — `classificationType` nulo até classificação oficial.
- [x] **F3.5** — `declaredOriginLot` oculto do form, nulo no banco (composição em `SampleBlendComponent`). Docstring Prisma (T0.C).
- [x] **F3.6** — `declaredLocation` opcional no form (igual Sample).
- [x] **F3.7** — `notes` opcional no form (igual Sample). Sem auto-população.
- [x] **F3.8** ⚠️ **REVISADO em 2026-05-18 (T0.C)** — `receivedChannel` = `'internal'` em liga (novo valor adicionado ao enum). Não aparece na UI.

**Bloco F3 fechado em 2026-05-15** (com F3.8 revisado, F3.1 e F3.2 expandidos em 2026-05-18). ✅

### Bloco F4 — Preview e classificação prevista

- [x] **F4** — Sem passo de preview; criação direta.
- [x] **F4.b** — Sem cálculo de classificação prevista (nem persistida nem on-the-fly).

**Bloco F4 fechado em 2026-05-15.** ✅

### Bloco F5 — Confirmação e tela de sucesso

- [x] **F5.1** — Reusa `SampleCreatedSuccessModal` com prop `entity='blend'` (troca textos).
- [x] **F5.2** — Sem auto-impressão na criação. Auto-print só pós-classificação (Q.auto existente).
- [x] **F5.3** — "Criar outra liga" fecha modal e volta `/samples` neutra (FAB fechado).

**Bloco F5 fechado em 2026-05-15.** ✅

### Bloco F6 — Pós-criação (classificação oficial)

- [x] **F6.1** — Classificação da liga 100% idêntica ao Sample normal (mesmo fluxo, mesmo código).
- [x] **F6.2** — Composição mostrada só no detalhe da liga, não durante o fluxo de classificação.

**Bloco F6 fechado em 2026-05-15.** ✅

### Bloco F7 — Comercial (venda, perda, status de origem)

**F7.1 — Venda da liga em bloco único (não parcial).**

- Vender liga = vender 100% das sacas. Sem `quantitySacks` editável: vai automaticamente `declaredSacks` da liga.
- Coerente com Q0.2 revisada: liga é "proposta", a venda materializa a proposta inteira ou nada.
- **Implicação**: na UI de venda de Sample, se `isBlend = true`, esconder o campo de quantidade e forçar = `availableSacks` da liga (que deve ser igual a `declaredSacks` se ainda não vendida).

**F7.2 (REVISADO) — Invalidar amostra com contribuição em liga pendente: bloqueado.**

- Backend rejeita invalidação se a amostra está como `originSampleId` em qualquer `SampleBlendComponent` cuja liga está ativa (não vendida, não perdida, não invalidated).
- **Formato do erro** (F7.D resolvida): HTTP `409` + corpo estruturado:
  ```json
  {
    "error": "SampleHasActiveBlends",
    "code": "SAMPLE_HAS_ACTIVE_BLENDS",
    "message": "Esta amostra contribui pra N ligas ativas.",
    "activeBlends": [
      { "sampleId": "<uuid>", "lotNumber": "5678", "status": "CLASSIFIED", "contributedSacks": 50 }
    ]
  }
  ```
- **UX no frontend** (F7.D): tap em "Invalidar amostra" → backend rejeita → frontend renderiza **modal de erro** (`.app-modal.is-themed`):
  - Cabeçalho: "Não foi possível invalidar"
  - Body: "Esta amostra contribui pra N ligas ativas. Reverta-as antes de invalidar:"
  - Lista de cada liga em `activeBlends` (linha = lot + status + contribuição + botão **"Ver liga"** que navega pro detalhe).
  - Rodapé: botão **"Entendi"** (fecha modal).
  - **Sem botão "Reverter aqui"** — reverter é ação destrutiva e opera-se no contexto da liga (com confirmação + motivo opcional — F8.2).
- Evita "ligas zumbis" (origens invalidadas, liga não pode mais ser realizada).
- **Implicação**: validação na rotina de `invalidateSample` (sample-command-service) — adicionar query em `SampleBlendComponent`. Service constrói o array `activeBlends` no payload do erro. Frontend já tem acesso à seção "Comprometida em N ligas ativas" no detalhe da amostra (T0.B), então a info nunca surpreende — o modal de erro só reforça quando o operador tenta invalidar mesmo assim.

**F7.3 — Perda da liga: tudo-ou-nada (igual venda).**

- LOSS na liga também usa 100% — mesma lógica que F7.1. Liga é unidade.
- **Implicação**: UI de LOSS quando `isBlend = true` esconde quantidade, força total.

**F7.4 — Origens são afetadas na venda/perda da liga (proporcional à contribuição).**

- Vender liga dispara cascata: cada `SampleBlendComponent` da liga gera um `SALE_CREATED` na origem correspondente, com `quantitySacks = contributedSacks`.
- Perda análoga: cada componente gera `LOSS_RECORDED` na origem com `quantitySacks = contributedSacks`.
- Audit: eventos das origens carregam `causationId` apontando pro evento de venda/perda da liga.
- **Buyer em cascata (F7.A resolvida)**: o mesmo `buyerClientId` e `buyerClientSnapshot` (= snapshot do comprador no momento da venda) são replicados em **todos** os SALE_CREATED descendentes da árvore — origens diretas, intermediárias e folhas. Trace de cascata reconstituído via `causationId` do envelope (aponta pro evento pai imediato; navegação recursiva alcança a liga raiz). Vendedor implícito de cada SALE_CREATED descendente é `sample.ownerClientId` da Sample associada (F3.A). Filtros simples por `buyerClientId` funcionam diretamente (sem JOIN recursivo).
- **Sem campo extra** pra "liga raiz" no payload — `cascadeSource`/`rootBlendId` foi rejeitado em F7.A: redundante com `causationId` + lookup, mais 1 campo no contrato sem ganho real.
- **Implicação**: nova rotina backend "cascadeSaleToOrigins(blendId, buyerClient, date)" que processa eventos em transação atômica (T0.D garantiu recursão completa).

**F7.5 — REVISADA em 2026-05-18 (T0.D). Cascata é RECURSIVA, profundidade ilimitada.**

> **Nota**: a versão anterior limitava cascata a 1 nível, justificada por "evitar frações com Int (Q0.4)". Essa justificativa não se sustenta — **F7.7 (100% obrigatório) já garante cascata 1:1 sem frações em qualquer profundidade**. Manter cascata a 1 nível criava bug físico real: origens netas continuavam com saldo aparente após terem sido consumidas virtualmente via liga-de-liga (ver T0.D na seção Tensões). Texto correto abaixo.

- Cascata de venda/perda **desce recursivamente** até alcançar samples folha (não-liga, `isBlend = false`).
- A profundidade é ilimitada na prática (Q0.5 permite cascata de ligas-em-ligas em qualquer ramificação).
- Como F7.7 obriga `contributedSacks = origin.declaredSacks` quando origem é liga, cada nível de cascata é 1:1 — sem frações, sem `PARTIALLY_SOLD` por cascata, em qualquer profundidade.
- Cada evento de cascata carrega `causationId` apontando para o evento pai (F7.4), permitindo construir o trace completo "vendida via cascata da Liga A (vendida via cascata da Liga B)" no detalhe (Wave B3 / Wave B4).
- **Implicação backend**: rotina `cascadeSaleToOrigins` / `cascadeLossToOrigins` agora itera recursivamente (DFS ou CTE recursiva). Transação única abrange todos os eventos da árvore (atomicidade). CTE recursiva no Postgres (Q0.5 já previu o índice em `SampleBlendComponent` em ambas as direções).
- **Implicação UI**: detalhe de cada sample na árvore exibe o trace de cascata reconstruído a partir de `causationId` (ver F7.4 e Wave B3).

**F7.6 — REVISADA em 2026-05-18 (T0.D) e 2026-05-21 (Wave B4 Fase 1). Validação de saldo: hard block RECURSIVO e QUANTITATIVO.**

> **Revisão 2026-05-21 (Wave B4 Fase 1)**: a regra deixou de ser **binária** (`soldSacks == 0 AND lostSacks == 0` — qualquer movimento anterior bloqueava) e passou a ser **quantitativa**: um descendente só bloqueia quando `availableSacks (declared − sold − lost) < contributedSacks`. Venda/perda parcial anterior que ainda deixe saldo suficiente NÃO bloqueia mais. Decorre do modelo de viabilidade quantitativa travado com o usuário (ver Log de sessões 2026-05-21).

- No clique "Vender liga", backend valida saldo de **toda a árvore de descendentes**, não só os componentes diretos.
- Pra cada sample descendente (direto e indireto, encontrado via CTE recursiva `loadBlendTree`): exige `availableSacks >= contributedSacks` no momento da venda.
- Se qualquer descendente falhar, retorna `409 BLEND_HAS_BLOCKED_DESCENDANTS` com `blockedDescendants: [{ sampleId, lotNumber, contributedSacks, availableSacks }]` — UI exibe todos de uma vez.
- Garante zero overselling cascateado — mesmo quando um sample neto foi mexido entre a criação da liga raiz e a venda dela.
- **Implementação**: o hard block vive em `_createBlendCascadeMovement` (`sample-command-service.js`).

**F7.7 — Contribuição de uma liga em outra liga é sempre 100% (não permite parcial).**

> **Revalidada em 2026-05-18 (F7.C)**: confirmada após reavaliação contra a prática operacional. Frações violariam Q0.4 (Int fundacional) — em qualquer profundidade de cascata, contribuição parcial liga-em-liga geraria divisões fracionárias dos componentes (ex: 75sc de Liga A com componentes 50/70/80 → 18.75/26.25/30sc, frações). Como dividir uma liga já fisicamente misturada é raro na prática real, o workaround (reverter + recriar menor) é aceitável.

- Resolve o conflito entre Q0.5 (cascata permitida) e F7.1 (venda bloco único).
- Se uma Liga A é selecionada como origem de Liga B, o campo `contributedSacks` é forçado a `Liga A.declaredSacks` (não editável). Liga inteira ou nada.
- Garante: cascata na venda sempre 1:1 (Liga A vendida 100% quando Liga B é vendida) → sem frações, sem `PARTIALLY_SOLD` por cascata, em qualquer profundidade.
- Tradeoff aceito: pra usar só parte de uma liga, operador reverte a liga e cria uma menor.
- **UI** (F7.C): no bottom-sheet de confirmação (F1.D), quando uma origem tem `isBlend = true`, o input fica desabilitado e fixo em `declaredSacks` da liga, mostrado como "Liga inteira: {N} sc". **Tooltip explicativo** (tap longo / hover): _"Para usar parte de uma liga, reverta-a primeiro e crie uma menor"_ — operador entende a restrição e o caminho.
- **Implicação**: validação no backend (`contributedSacks == origin.declaredSacks` quando `origin.isBlend = true`). UI adapta a apresentação com tooltip.

**Bloco F7 fechado em 2026-05-15** (com F7.2 / F7.4 / F7.5 / F7.6 / F7.7 revisados em 2026-05-18 via T0.D + F7.A + F7.C + F7.D). ✅

### Bloco F8 — Reversão da liga

**F8.1 — Qualquer usuário logado pode reverter** (mesma regra de F1.2 — quem cria, reverte).

- Sem permissão diferenciada. Reversibilidade simétrica.

**F8.2 — UI: modal de confirmação com motivo opcional.**

- Modal similar ao "Descartar amostra em andamento" (padrão já existente).
- Campo de motivo TEXTO LIVRE OPCIONAL (alinhado com decisão anterior de tornar motivo da edição de filial opcional).
- Botão de reverter destacado (vermelho), botão de cancelar secundário.
- **Implicação**: payload do evento `BLEND_REVERTED` carrega `reasonText: string | null`. Não há `reasonCode` (decisão DATA_FIX/TYPO/MISSING_INFO/OTHER fica restrita aos casos de reclassificação).

**F8.3 — Composição preservada como histórico após reversão.**

- Registros em `SampleBlendComponent` **não** são apagados. Liga vira `INVALIDATED` (mesmo status terminal do Sample normal invalidado), mas a composição (origens + contribuições) fica visível no detalhe pra audit.
- Coerente com event-store append-only: nada se apaga, tudo se versiona.
- **Implicação**: queries de detalhe da liga continuam mostrando origens mesmo quando `status = INVALIDATED`. UI adapta a apresentação (ex: composição em fundo cinza "Esta liga foi revertida").

**F8.4 — Reversão é definitiva: INVALIDATED é terminal.**

- Não há "desfazer reversão" / "re-ativar liga". Igual a invalidação de Sample hoje.
- Pra recriar a mesma combinação, operador inicia novo fluxo de criação (nova liga, novo lot number).
- **Implicação**: sem evento `BLEND_REINSTATED` no enum. Reusa lifecycle terminal existente.

**Bloco F8 fechado em 2026-05-15.** ✅

### Bloco Dashboard — Como liga aparece nas telas

**D.1 — Mesma lista de `/samples`, distintas só por badge.**

- Ligas misturadas com amostras unitárias na mesma listagem. Sem aba separada nem rota dedicada.
- Filtro de busca existente serve igualmente pra ambos.
- **Implicação**: zero rota nova. Lista atual continua funcionando — apenas o componente de card precisa renderizar o badge condicionalmente.

**D.2 — Badge pequeno "Liga" + ícone no card.**

- Badge inline (ex: pill verde-escuro com texto "LIGA" + ícone de "merge/junção") ao lado do lot number.
- Mesma posição em listagens, cards do dashboard, e header do detalhe.
- Discreto mas reconhecível à primeira vista.
- **Implicação**: componente novo `<BlendBadge />` em `components/samples/`, renderizado quando `sample.isBlend === true`. CSS pode reusar tokens do design-system.

**D.3 — Não separar contagem de ligas no dashboard.**

- O card existente "Classificação pendente" continua contando TODAS as samples em `REGISTRATION_CONFIRMED` — Sample normal e liga juntos. Ligas pendentes entram naturalmente.
- Sem card novo. Sem breakdown.
- **Implicação**: zero mudança no `useDashboardData` ou no endpoint `/api/v1/dashboard/pending`. Ligas aparecem na lista de "operacional" igual a samples normais.

**Bloco Dashboard fechado em 2026-05-15.** ✅

### Blocos seguintes (status final em 2026-05-18)

- [x] **Fluxo F4** — Preview/classificação prevista: SEM PREVIEW, sem classificação prevista (F4 + F4.b).
- [x] **Fluxo F5** — Confirmação e criação: bottom-sheet de confirmação + modal F3 + criação backend + tela de sucesso (F5.1-3 + F1.D).
- [x] **Fluxo F6** — Pós-criação: classificação 100% idêntica ao Sample normal (F6.1-2).
- [x] **Fluxo F7** — Comercial: venda/perda 100% (F7.1, F7.3), cascata recursiva (F7.4 + T0.D), hard block recursivo (F7.6 + T0.D), liga em liga = 100% (F7.7 + F7.C), buyer cascateado (F7.A), erro estruturado de invalidação (F7.D), invalidar origem em liga ativa bloqueado (F7.2).
- [x] **Fluxo F8** — Reversão (F8.1-4) + Q0.3 revisado (T0.A).
- [x] **Dashboard e listagens** — Mesma lista + badge (D.1-3).
- [x] **Plano de implementação (Waves A/B/C)** — Atualizado com todas as decisões (ver seção "Plano de implementação (fases)").

---

## Modelo de dados (proposto)

_(preencher após Bloco 0 + decisões de domínio fechadas)_

---

## API e contratos

_(preencher após modelo de dados estar fechado)_

---

## Telas e fluxos

_(preencher após decisões de fluxo + permissões)_

---

## Plano de implementação (fases)

Cada fase é um commit/PR pequeno e isolado, executado **com aprovação explícita** antes de começar e antes de mergear. Wave A = backend, Wave B = frontend, Wave C = release.

### Wave A — Backend

**Fase A1 — Schema + eventos novos** (migration aditiva + extensão de enum sem migration)

> **Implementada em 2026-05-18** (commit a vir). Migration: `prisma/migrations/20260518154156_liga_a1_blend_component_and_isblend/`. Criada **manualmente** (não via `prisma migrate dev`) por causa de drift preexistente no `schema.prisma` do branch (mudanças de estilo em índices `_trgm`, defaults de generated columns e PK rename do `client_unit` herdadas de commits L5/Q-XX que nunca foram migradas). O drift é **estilo, não funcional** — banco está OK em produção, comportamento idêntico. Tratamento separado fica como dívida técnica fora do escopo da Liga.

- Migration Prisma:
  - Nova tabela `SampleBlendComponent` (`id`, `sampleId` FK → Sample (a liga), `originSampleId` FK → Sample (a origem), `contributedSacks: Int`, `createdAt`).
  - Índices: `(sampleId)` e `(originSampleId)` pra rastreabilidade nas 2 direções.
  - Constraint: `uq_blend_component (sampleId, originSampleId)` — uma origem só aparece 1 vez por liga.
  - Flag `isBlend: Boolean default false` no `Sample` (mais barato que `count(components) > 0` em listagens).
  - Índice `idx_sample_is_blend` na coluna `is_blend` pra filtros eficientes (D.2).
  - **Docstrings Prisma** (T0.C) em `declaredOwner` e `declaredOriginLot` registrando que são intencionalmente null em registros com `isBlend = true`.
  - **Docstring Prisma** (F3.A) em `ownerClientId` do Sample registrando: "Também serve como vendedor implícito em SampleMovement — relatórios financeiros derivam vendedor desta coluna via JOIN. Pra liga sem dono, venda aparece como 'sem vendedor identificado' (carteira da corretora)".
- Enum `SampleEventType` ganha: `BLEND_CREATED`, `BLEND_REVERTED`.
- Enum `IdempotencyScope` ganha: `BLEND_CREATE` (idempotência de `createBlend`) e `BLEND_REVERT` (idempotência de `revertBlend`) — consumidos na Wave A2.
- **Extensão do enum `RECEIVED_CHANNELS`** (T0.C): adicionar `'internal'` em `src/samples/sample-command-service.js:16` e em `docs/schemas/events/v1/payloads/registration-confirmed.payload.schema.json`. Mudança não-quebra (eventos antigos com valores existentes continuam válidos).
- **Documentação no JSON schema do `SALE_CREATED`/`LOSS_RECORDED`** (F7.A): adicionar campo `"description"` no topo dos schemas `sale-created.payload.schema.json` e `loss-recorded.payload.schema.json` esclarecendo: "Em cascata de venda/perda de liga (F7.4 + T0.D), `buyerClientId` e `buyerClientSnapshot` (ou `lossReasonText` para perda) são replicados em todos os eventos descendentes da árvore. Trace de cascata via `causationId` no envelope. Vendedor implícito é `sample.ownerClientId` (F3.A)."
- JSON schemas dos payloads desses eventos em `docs/schemas/events/v1/payloads/`.
- Testes: schema valida, migration roda em DB limpo, eventos passam pelo `event-contract-service`. Test novo: `receivedChannel='internal'` aceito no `REGISTRATION_CONFIRMED`.
- **Sem impacto** em código de produção existente.

**Fase A2 — Services + validações + cascata**

- `sample-command-service.createBlend({ components, blendData, actor })`:
  - Valida componentes (mínimo 2, sem duplicatas, todos `CLASSIFIED`, todos com saldo, F7.7 quando origem é liga).
  - Cria Sample (a liga) com `isBlend = true`, `declaredSacks = Σ contributedSacks`, `classificationType = null`, `declaredOriginLot = null`, `declaredOwner = (ownerClient?.displayName ?? null)`, demais campos do formulário (F3).
  - Cria registros em `SampleBlendComponent`.
  - Emite `REGISTRATION_CONFIRMED` com `receivedChannel: 'internal'` (T0.C — substitui `'in_person'` silencioso anterior) + `BLEND_CREATED` (na liga, payload com lista de componentes). Idempotência via `idempotencyKey`.
- `sample-command-service.revertBlend({ blendId, reasonText, actor })`:
  - Valida: liga em `REGISTRATION_CONFIRMED` ou `CLASSIFIED`, `soldSacks = 0`, `lostSacks = 0`.
  - Emite `BLEND_REVERTED` (mutante, vira `INVALIDATED`) + `SAMPLE_INVALIDATED` (status). Composição **não** é apagada.
- `sample-command-service.recordSale` / `.recordLoss` ajustadas:
  - Antes de gravar, se `sample.isBlend = true` (F7.4 cascata): valida **recursivamente** toda a árvore de descendentes via CTE (F7.6 revisado em T0.D). Pra cada descendente (direto e indireto), valida `soldSacks == 0 AND lostSacks == 0`. Coleta lista completa de bloqueios pra retornar tudo numa única resposta `409`.
  - Emite eventos em cascata **recursivos** (F7.5 revisado em T0.D): `SALE_CREATED` (ou `LOSS_RECORDED`) na liga raiz + em cada descendente (em DFS ou via CTE), com `quantitySacks = contributedSacks` no nível corrente e `causationId` apontando pro evento "pai" imediato (forma o trace).
  - Cascata desce até alcançar samples folha (`isBlend = false`). F7.7 (100%) garante que tudo permanece 1:1, sem frações.
  - Transação única abraçando todos os eventos da árvore (atomicidade) — se qualquer um falhar, nada é gravado.
- `sample-command-service.invalidateSample` ajustada:
  - Bloqueia se a amostra é `originSampleId` em qualquer `SampleBlendComponent` com `sample (a liga).status != INVALIDATED` (F7.2 revisado).
  - Retorna erro HTTP `409` estruturado (F7.D): `{ error: 'SampleHasActiveBlends', code: 'SAMPLE_HAS_ACTIVE_BLENDS', message, activeBlends: [{ sampleId, lotNumber, status, contributedSacks }] }`. Query do `activeBlends` reusa a mesma de `committedSacks` (T0.B).
- Tests: contract + integration cobrindo cascata, validações, edge cases.

**Fase A3 — API endpoints**

- `POST /api/v1/samples/blends` — body: `{ components: [{originSampleId, contributedSacks}], data: {ownerClientId?, harvest, location?, notes?} }` → 201 `{ sampleId, lotNumber }`.
- `POST /api/v1/samples/:id/revert-blend` (ou `DELETE /api/v1/samples/blends/:id` semanticamente) → 200.
- `GET /api/v1/samples` (existente) ganha query param `eligibleForBlend=true` (lista samples no contexto de seleção pra liga — **inclui inelegíveis** com flag, frontend renderiza acinzentado). Resposta enriquecida por amostra com:
  - `committedSacks` (T0.B / F2.4): soma de `contributedSacks` em `SampleBlendComponent` cujas ligas estão ativas pré-comercialização. Calculado on-the-fly via subquery/CTE (sem coluna persistida — evita drift).
  - `eligibility: { eligible: boolean, reason: 'INVALIDATED' | 'NO_BALANCE' | null }` (F1.B): single source of truth da regra de elegibilidade pra liga. `reason` é `null` quando `eligible = true`. Sem texto de UI no payload (frontend mapeia). _F1.4 relaxada em 2026-05-19: `NOT_CLASSIFIED` removida; REGISTRATION_CONFIRMED agora é elegível._
- `GET /api/v1/samples/:id` retorna:
  - `components: [...]` quando `isBlend = true` (composição da liga atual).
  - `committedSacks` (sempre que > 0) e `activeBlends: [{sampleId, lotNumber, contributedSacks}]` (lista das ligas ativas que usam essa amostra como origem — alimenta a seção "Comprometida em N ligas" no detalhe, ver Wave B3 / T0.B).
- Tests: contract — incluir cases de `committedSacks > 0`, `activeBlends` populado vs vazio, e overcommit (committed > available, dentro de availableSacks por Q0.2).

### Wave B — Frontend

**Fase B1 — FAB radial + modo seleção em `/samples` (especificação completa F1.D)**

- **FAB radial** (F1.0 + F1.C):
  - Substituir `<SampleQuickCreateFab>` por componente novo `<SampleCreateRadialFab>` que abre 2 opções (Unidade / Liga).
  - State interno `expanded: boolean`. Quando `expanded`, renderiza backdrop transparente (clique fora fecha) + 2 satélites em arco com slide+fade (~150-200ms via CSS transition ou framer-motion). Tap em satélite: scale-up pulse rápido + setExpanded(false) + dispara ação.
  - Opção "Unidade" mantém comportamento atual (abre `NewSampleModal`).
  - Opção "Liga" → entra em modo seleção em `/samples/page.tsx`.

- **Modo seleção** (F1.1 reescrita + F1.D):
  - State `selectionMode: 'idle' | 'blend'` em `/samples/page.tsx`.
  - **Cards** (`<SampleCard>` ajustado): renderiza bolinha à esquerda quando `selectionMode === 'blend'`. 3 estados visuais (vazia / preenchida verde + ✓ / cinza opaca + card acinzentado). Conteúdo do card empurra pra direita. Tap card → toggle se elegível, sem ação se inelegível (tooltip aparece).
  - **Header de modo seleção** (`<SelectionModeHeader />`, componente novo): renderiza no lugar do header normal quando em modo seleção:
    - Esquerda: ícone `X` → tap dispara `setSelectionMode('idle')` + limpa seleção + remove animação.
    - Centro: título "Selecionar amostras".
    - Direita: contador "N selecionadas" — clicável, abre o `<BlendConfirmationSheet>`.
  - **Input de busca por texto** permanece no header secundário (não-modificado). Botão de filtro avançado some no modo seleção.
  - **Tabbar inferior** condicionado (`display: none` ou `aria-hidden`) durante `selectionMode === 'blend'`.
  - **FAB-seta** (`<SampleCreateRadialFab>` ganha modo `blendArrow` que renderiza seta `→` em vez do "+"):
    - Disabled quando `selectedCount < 2`: opacidade 40%, cursor `not-allowed`, tap dispara tooltip "Selecione pelo menos 2 amostras" (2s).
    - Habilitada quando `≥ 2` → tap abre `<BlendConfirmationSheet>` (mesmo componente que o tap no contador abre).
  - **Refetch otimista** (F1.C): `listSamples?eligibleForBlend=true` em background. Cards atualizam quando chega. Selecionada que vira inelegível: deselecionar + toast.
  - Refetch falha: voltar `selectionMode → 'idle'` + toast "Não foi possível carregar amostras pra liga".
  - **Itens inelegíveis** (`eligibility.eligible === false` — F1.B): bolinha cinza opaca + card acinzentado + tooltip mapeado de `eligibility.reason`. Mapeamento `reason → texto` em constante (`src/lib/samples/eligibility-labels.ts`).

- **Bottom-sheet unificado de confirmação** (`<BlendConfirmationSheet>`, componente novo — F1.D):
  - Aberto via tap no contador OU tap na seta. Mesmo conteúdo, mesmo componente.
  - Cabeçalho verde com título "Amostras da liga" (a ajustar).
  - Lista de selecionadas (uma linha por amostra):
    - Identificação: lot + cliente + label "X disp." (saldo físico).
    - Input numérico de contribuição, pré-preenchido com `availableSacks` (F2.1 atualizado + F2.2 revogado). Validações inline (rejeita 0, > available, não-número, vazio).
    - Warning F2.4 inline quando `committedSacks > 0`.
    - Origem isBlend=true: input disabled, fixo em `declaredSacks` (F7.7). Label "Liga inteira: N sc" + tooltip explicativo (F7.C): _"Para usar parte de uma liga, reverta-a primeiro e crie uma menor"_.
    - Botão `×` pra remover (linha colapsa slide-up + fade ~150ms).
  - "Total da liga: N sc" rodando.
  - Rodapé: "Voltar" (fecha sheet, mantém modo seleção) + "Continuar" (abre modal F3 — Wave B2). "Continuar" disabled se `selectedCount < 2` ou algum input inválido.
  - Edge: operador remove última amostra → sheet fecha + `setSelectionMode('idle')` + volta `/samples` neutra.

**Fase B2 — Modal F3 (form do novo lote) + sucesso** (revisado em F1.D)

> Atualizado em 2026-05-18 (F1.D): as contribuições (F2) saíram daqui — agora vivem no `<BlendConfirmationSheet>` da Fase B1 (bottom-sheet de confirmação). A Fase B2 cuida apenas do **modal F3** (form do novo lote, sem contribuições).

- Componente novo `<BlendCreateModal>` (modal central seguindo `.app-modal.is-themed` da skill `modals`):
  - Cabeçalho verde "Nova liga".
  - Body branco com campos:
    - Dono (`<ClientLookupField>` opcional — F3.1).
    - Safra (input texto obrigatório, sem auto-preencher — F3.2). **Hint inline** (F3.B): texto pequeno em cinza embaixo do input listando safras distintas das origens (ex: _"Origens contêm safras: 24/25, 25/26"_). Lista derivada de `components.map(c => c.origin.declaredHarvest).distinct()`. Aparece apenas se houver pelo menos 1 origem com safra distinta da que o operador está digitando (ou sempre, mesmo se ele não digitou nada ainda — UX-decisão na implementação).
    - Local (input texto opcional, max 30 chars — F3.6).
    - Observações (textarea opcional, max 500 chars — F3.7).
    - "Total da liga: N sc" (read-only, vindo do passo anterior — F2.3).
  - Rodapé: "Voltar" (fecha modal, reabre o `<BlendConfirmationSheet>` com estado preservado) + "Criar liga" (submit).
- Submit ("Criar liga") → chama `createBlend({ components, blendData, actor })` (Wave A2) → recebe `sampleId` + `lotNumber` → fecha modal → abre `<SampleCreatedSuccessModal>` com `entity='blend'`.
- Reusa `<SampleCreatedSuccessModal>` com prop nova `entity?: 'sample' | 'blend'` (default `'sample'`): troca textos ("Liga criada", "Ir para liga", "Criar outra liga").
- "Criar outra liga" → fecha modal, limpa state local, retorna `/samples` em estado neutro (FAB fechado, sem modo seleção).

**Fase B3 — Detalhe da liga, reversão, modal erro F7.D, trace de cascata**

Sub-fases numeradas, na ordem de execução recomendada:

**B3.1 — `<BlendBadge>` nas listagens** ✅ _(implementada 2026-05-19)_

- Componente `<BlendBadge />` em `components/samples/`: pill lilás com ícone de merge + texto "Liga".
- Renderizado em: `/samples` (SampleCard), dashboard (RecentActivityList), detalhe da amostra, `/clients/[id]` (lista de amostras do cliente).

**B3.2 — Seção "Composição da liga" no detalhe** ✅ _(implementada 2026-05-19)_

- Detalhe da liga (`isBlend = true`): seção "Composição" listando cada origem com lote + dono + safra + contribuição em sc, link pro detalhe individual.
- Preservada visível mesmo após reversão (F8.3 — backend mantém `components`).

**B3.3 — Seção "Comprometida em N ligas ativas" no detalhe** ✅ _(implementada 2026-05-19)_

- Detalhe de amostra normal: seção "Comprometida em N ligas ativas" quando `activeBlends.length > 0`.
- Lista cada liga em `activeBlends` (lote + status + contribuição em sc) com link pro detalhe da liga.
- Backend filtra INVALIDATED (Wave A2.5) — liga revertida desaparece automaticamente desta seção.
- Componente reusável `<RelatedSampleRow>` compartilhado com B3.2.

**B3.4 — Botão "Reverter liga" + modal de confirmação** ✅ _(implementada 2026-05-21)_

- Botão "Reverter liga" no detalhe (visível se `isBlend && status !== INVALIDATED && soldSacks === 0 && lostSacks === 0`).
- **Refinamento (2026-05-21, confirmado com o usuário)**: numa liga, "Reverter liga" **substitui** o botão "Invalidar" genérico — caminho terminal único, sempre via `revertBlend` (emite `BLEND_REVERTED` pra auditoria). Amostra normal segue com "Invalidar". Liga já vendida/perdida não mostra nenhum botão (reversão bloqueada por F8.4).
- Modal de confirmação: padrão `.app-confirm-modal`, campo `reasonText` opcional (F8.2), botão "Reverter" vermelho.
- Chama `revertBlend` (endpoint A3.2 pronto).

**B3.5 — Modal de bloqueio de invalidação por liga ativa (`SAMPLE_HAS_ACTIVE_BLENDS`)** ✅ _(implementada 2026-05-21)_

- Quando o operador tenta invalidar uma amostra que é origem de liga(s) ativa(s), aparece o `<SampleInvalidateBlockedModal>` (`.app-modal.is-themed`): cabeçalho "Não foi possível invalidar", lista de cada liga via `<RelatedSampleRow>` (linha inteira clicável → detalhe da liga), rodapé "Entendi". Sem "Reverter aqui" — reverter opera-se no contexto da liga (B3.4).
- **Gatilho proativo + rede de segurança** (revisão de 2026-05-21, confirmada com o usuário — ver Log de sessões): o doc original (F7.D) previa só o fluxo reativo (pós-409). Agora, ao tocar "Invalidar", se o detalhe já mostra `activeBlends` não-vazio (dado da B3.3), o modal abre na hora, sem abrir o formulário de motivo. O 409 continua tratado nos `catch` como rede de segurança (corrida: liga criada entre o carregamento e o clique).

**B3.6 — Trace de cascata via `causationId`** _(✅ concluído em 2026-05-21 — realizado na linha do movimento cascateado; não há UI de histórico de eventos. Ver Log de sessões)_

- Quando detalhe mostra eventos `SALE_CREATED`/`LOSS_RECORDED` com `causationId` preenchido (cascata), renderiza inline "vendida via cascata da Liga {lotNumberPai}" com link clicável.
- Quando o pai também é cascateado, expandir trace completo encadeando os `causationId`.
- API `GET /samples/:id` já retorna eventos com `causationId`. Backend pode resolver `causedByLotNumber` no payload (lookup) ou frontend faz batch de lookups conforme necessidade.

**B3.7 — Enrichment de `activeBlends` com owner + harvest da liga** _(✅ concluído em 2026-05-21 — ver Log de sessões)_

- Hoje (limitação MVP B3.3): cada item em `activeBlends[]` retorna apenas `{ sampleId, lotNumber, status, contributedSacks }`. Frontend renderiza `'—'` em owner e harvest.
- **Trabalho previsto**: backend (`findActiveBlendsContainingOrigin` em `src/samples/sample-query-service.js:2140`) passa a incluir `declaredOwner: string | null` e `declaredHarvest: string | null` (snapshot da liga). Frontend (`ActiveBlendDetail` em `lib/types.ts` + `RelatedSampleRow` no detalhe) usa os novos campos no lugar dos fallbacks.
- **Quando fazer**: quando a falta de contexto ("liga LG-1024 · — · — · 20 sc") atrapalhar a navegação do operador. Pra ligas que tipicamente são sem dono ("carteira da corretora"), owner viria sempre vazio mesmo com enrichment; **harvest** é o ganho real desta sub-fase.
- Custo estimado: ~30 min (backend select novo + tipo TS + UI pega valor em vez de hardcoded null).

**B3.8 — Aviso ao vender/perder uma amostra que é origem de liga(s)** _(✅ concluído em 2026-05-21 — Wave B4 Fase 8)_

- Diferente da invalidação (B3.5, bloqueio rígido): vender/perder uma origem **não é bloqueado** — é ação legítima (o overcommit se resolvendo; uma proposta de liga "vence", ou a amostra é vendida avulsa — Q0.2 + T0.B).
- Mas vender/perder a origem diretamente _envenena_ as ligas que a contêm: a venda/perda da liga em cascata será barrada depois pelo hard block F7.6 (`BLEND_HAS_BLOCKED_DESCENDANTS`). A integridade nunca quebra — a liga só deixa de ser vendável **como liga**.
- UX: **aviso informativo** (não-bloqueio) no `SampleMovementModal` quando a amostra tem `activeBlends.length > 0` — algo como "Esta amostra compõe N liga(s); vendê-la / registrar perda vai impedir que essas ligas sejam vendidas como liga." Botões "Confirmar mesmo assim" + "Ver ligas" (opcional). Mesmo espírito do F3.A ("Atribuir dono primeiro" / "Vender mesmo assim") — empurrãozinho, não muro.
- Dados já disponíveis (`activeBlends` em `GET /samples/:id`) — só frontend. Prioridade menor que B4: é conforto de UX, não correção (o hard block F7.6 já protege a integridade).

**Wave B4 — Venda/perda de liga (ciclo comercial completo)**

> Reescopada em 2026-05-21: o que era "Fase B4 — UI ajustada" virou uma **wave de 8 fases** (backend + frontend), após a análise de venda/perda com o usuário. Modelo travado: liga = proposta sem reserva; viabilidade **quantitativa**; liga inviável é **sinalizada** (flag derivado), nunca auto-inativada; cancelar/editar venda de liga = cascata reversa/update.

Backend (Fases 1-4) — ✅ **concluído em 2026-05-21** (ver Log de sessões):

- **Fase 1** — F7.6 binária → quantitativa.
- **Fase 2** — endpoint `GET /samples/:id/blend-feasibility` (`getBlendFeasibility`) — árvore recursiva + saldos + origens bloqueantes.
- **Fase 3** — `_cancelBlendCascadeMovement` — cancelar venda/perda de liga = cascata reversa (`SALE_CANCELLED`/`LOSS_CANCELLED` na raiz + descendentes).
- **Fase 4** — `_updateBlendCascadeMovement` (re-cascata de comprador/data/obs) + guard `BLEND_CASCADED_MOVEMENT` (movimento cascateado só via a raiz).

Frontend (Fases 5-8) — ✅ **concluído em 2026-05-21** (ver Log de sessões):

- **Fase 5** — modal `SampleMovementModal` pra liga: esconde `quantitySacks`, "vende 100% = N sc", pré-validação via Fase 2, bloco "sem dono" (F3.A — "Atribuir dono primeiro" via `updateRegistration` / "Continuar mesmo assim") em venda **e** perda.
- **Fase 6** — UI de cancelar/editar movimento de liga; movimentos cascateados read-only no painel da origem (flag `cascaded` por movimento em `getSampleDetail`).
- **Fase 7** — flag de viabilidade no detalhe da liga (via Fase 2).
- **Fase 8** — B3.8: aviso (não-bloqueante) ao vender/perder uma amostra-origem.

### Wave C — Release

**Fase C1 — Tests + smoke + deploy canary → prod** _(✅ concluído em 2026-05-21)_

- Garantir todos os testes verdes (unit, contract, integration).
- Smoke test manual completo:
  - Criar liga simples (2 origens) → criar, classificar, vender → verificar cascata e saldo das origens.
  - Tentar invalidar origem em liga ativa → deve bloquear.
  - Reverter liga sem venda → deve permitir, composição preservada.
  - Cascata: criar liga A, usar liga A como origem de liga B (F7.7 = 100%) → vender B → A deve ficar `SOLD`.
  - Hard block: criar 2 ligas com mesma origem (overcommit), vender uma → ok; vender a segunda → bloqueio com mensagem clara.
- Deploy canary → migrate → smoke → promote (mesmo fluxo já usado nos deploys anteriores).
- Atualizar skills (responsive/design-system/modals) se algum padrão novo for introduzido — passar pela skill-maintenance.

### Dependências entre fases

```
A1 → A2 → A3 → B1 → B2 → B3 → B4 → C1
        \
         └── pode rodar em paralelo a A3 se houver mais de uma pessoa
```

A1 precisa estar mergeado antes de A2 (services dependem do schema). B1 pode começar antes de A3 estar pronto se usar mock; mas a integração final exige A3. C1 só depois de tudo.

### Critério de "pronto" por fase

- Quality gates verdes: `lint`, `format:check`, `typecheck`, `build`, `test:contracts`, `test:integration:db`.
- Skills relevantes revisadas (sem afirmação obsoleta).
- Commit temático único (não múltiplos commits incoerentes).
- Não pushado — usuário pusha quando aprovar localmente.

---

## Riscos e trade-offs

_(populado conforme decisões mostrarem trade-offs relevantes)_

---

## Tensões revisadas

Revisão completa do plano após Bloco 0/F1-F8 fechados. Cada tensão (T-) levanta uma fragilidade em decisão anterior; resolução registrada aqui com referência cruzada às decisões impactadas. Iniciada em 2026-05-18.

### T0.A — Q0.3 inconsistente com Q0.2 revisada ✅ (2026-05-18)

**Problema identificado**: Q0.3 dizia "restaura saldo das origens (decrementa `blendedSacks`)" — texto residual da versão pré-revisão da Q0.2. Como a Q0.2 revisada eliminou `blendedSacks` e estabeleceu que origens só são afetadas na venda/perda da liga, não há nada para restaurar no momento da reversão (que, por F8.4 + restrição de Q0.3, só ocorre pré-venda/perda — origens estão intactas).

**Decisão**: alternativa **(A) — reescrita mínima, preservando `BLEND_REVERTED` como evento dedicado**.

- `BLEND_REVERTED` apenas transiciona a liga → `INVALIDATED`.
- Origens permanecem intactas — sem restauração (Q0.2 revisada).
- Restrição mantida: `soldSacks == 0 AND lostSacks == 0` na liga; pós-venda/perda, reversão é bloqueada (F8.4 — INVALIDATED é terminal).
- Composição em `SampleBlendComponent` preservada como histórico (F8.3).

**Trechos atualizados no doc**: Q0.3 (texto principal), Q0.4 (lista de campos sem `blendedSacks`), F1.4 (fórmula `availableSacks` sem `blendedSacks`).

**Alternativas rejeitadas**:

- **(B)** Reversão pós-venda via cascata reversa — contraditório com F8.4 (INVALIDATED é terminal) e fora de escopo MVP.
- **(C)** Eliminar `BLEND_REVERTED`, usar só `SAMPLE_INVALIDATED` com metadata — perde semântica explícita de audit log; custo de 1 evento extra no enum é trivial.

### T0.B — Overcommit silencioso ✅ (2026-05-18)

**Problema identificado**: como Q0.2 (revisada) permite que a mesma amostra contribua em N ligas simultâneas sem decrementar saldo, o operador pode criar overcommit (`Σ contributedSacks em ligas ativas > availableSacks`). F7.6 (hard block na venda) impede overselling de fato, mas é **reativo** — descoberta acontece só na hora de vender, possivelmente meses depois da criação, em frente ao cliente. Risco operacional alto.

**Decisão**: alternativa **(D) — Híbrido (feedback proativo em 2 lugares)**. Mantém Q0.2 intacta (overcommit ainda permitido por design), mas torna o estado visível em 2 pontos:

1. **F2 (criação)**: warning inline sempre que `committedSacks > 0` na origem selecionada — "Comprometida em N ligas — saldo livre real: X sc". Não bloqueia.
2. **Detalhe da amostra**: seção "Comprometida em N ligas ativas" listando as ligas que consomem esta amostra como origem.

**Definições operacionais fechadas**:

- **`committedSacks`** = soma de `contributedSacks` em `SampleBlendComponent` cuja **liga é ativa pré-comercialização** (`blend.status != INVALIDATED AND blend.soldSacks == 0 AND blend.lostSacks == 0`). Liga vendida sai do cômputo (a cascata de F7.4 já decrementou `soldSacks` da origem, eliminando dupla contagem).
- **`realFreeSacks`** = `availableSacks - committedSacks` (campo derivado, calculado no frontend a partir dos campos retornados pelo backend).
- **Threshold do warning**: aparece **sempre** que `committedSacks > 0` (transparência máxima), independente de haver overcommit no momento. Cor/ícone de atenção sobe quando `contribuição planejada > realFreeSacks`.
- **Backend computa on-the-fly** (subquery/CTE), sem coluna persistida no Sample — evita risco de drift e de manter trigger ou denormalização sincronizada.

**Trechos atualizados no doc**:

- **F1.4** — `listSamples` em modo `eligibleForBlend` retorna `committedSacks` por amostra; frontend deriva `realFreeSacks`.
- **F2.1** — texto reforça hard cap em `availableSacks` (físico) e remete pra F2.4.
- **F2.4 (novo)** — define warning, threshold, sem bloqueio, comportamento visual.
- **Pendências F2** — F2.4 listado.
- **Wave A3** — `listSamples` enriquecido com `committedSacks`; `GET /samples/:id` retorna `committedSacks` + `activeBlends`.
- **Wave B2** — `<BlendCreateBottomSheet>` renderiza warning inline.
- **Wave B3** — detalhe da amostra (não-liga) ganha seção "Comprometida em N ligas ativas".

**Alternativas rejeitadas**:

- **(A)** Aceitar como design, sem feedback proativo — surpresa tardia é cara em fricção operacional. Falha o teste "operador sabe na hora certa".
- **(B)** Só warning na F2 — perde auditabilidade quando você abre uma amostra individualmente.
- **(C)** Dashboard com card "Em overcommit" sozinho — não ajuda no momento crítico da criação. Pode ser fase 2 complementar, não substituto.

### T0.C — Campos do Sample sem sentido em liga ✅ (2026-05-18) — subsume F3.C

**Problema identificado**: liga, sendo `Sample` (Q0.1), herda campos que perdem sentido semântico:

- `declaredOriginLot`: faz sentido em sample normal (texto livre "lote de origem"); em liga, origem é composição (`SampleBlendComponent`).
- `declaredOwner`: pode ficar null em liga (F3.3 já decide).
- `receivedChannel`: F3.8 propunha `'in_person'` silencioso por suposta dificuldade de migration. Liga **não é recebida fisicamente** — é gerada internamente. `'in_person'` polui audit log.

**Descoberta crítica na investigação do código**:

- `declaredOriginLot` e `declaredOwner` são colunas SQL nullable — null em liga é semanticamente correto e zero ambiguidade. **Não há dívida real**, só falta documentação.
- `receivedChannel` **não é coluna no banco**: é payload de evento (`REGISTRATION_CONFIRMED`) + validação no service. Adicionar `'internal'` é mudar **2 linhas + 1 entrada no JSON schema**. **Sem migration de banco**.

**Decisão**: alternativa **(B) — adicionar `'internal'` no enum `RECEIVED_CHANNELS`**.

- Liga emite `REGISTRATION_CONFIRMED` com `receivedChannel: 'internal'`.
- Eventos antigos (com `'in_person'`/`'courier'`/`'driver'`/`'other'`) continuam válidos — extensão é puramente aditiva no enum.
- Docstrings Prisma em `declaredOwner` e `declaredOriginLot` documentam que são intencionalmente null em registros `isBlend = true`.

**Trechos atualizados no doc**:

- **F3.3** — adicionada nota sobre docstring Prisma.
- **F3.5** — adicionada nota sobre docstring Prisma.
- **F3.8** — `'in_person' silencioso` → `'internal'` (REVISADO).
- **Pendências F3** — F3.8 marcado como revisado.
- **Wave A1** — adicionado item "Extensão de `RECEIVED_CHANNELS`" e docstrings Prisma.
- **Wave A2** — `createBlend` emite `receivedChannel: 'internal'`.

**Subsume F3.C** (tensão originalmente listada separadamente): F3.C era exatamente a mesma pergunta ("adicionar `'internal'` no enum?"); resposta é sim, e a decisão fica registrada aqui em T0.C.

**Alternativas rejeitadas**:

- **(A)** Aceitar tudo como F3 decidiu — semanticamente errado (`in_person` em liga). Custo de evitar é trivial; não vale aceitar a dívida.
- **(C)** Refatoração estrutural (`SamplePhysicalReceipt` tabela auxiliar) — custo alto, refator em várias páginas, fora de escopo MVP. Pode ser fase 2 futura.

### T0.D — F7.5 quebrava rastreabilidade física (cascata 1 nível) ✅ (2026-05-18)

**Problema identificado**: F7.5 (cascata limitada a 1 nível de profundidade) gerava bug físico real em hierarquias de liga-em-liga. Cenário: `X1+X2+X3 → Liga A; A+Y → Liga B; vende B`. Com F7.5 a 1 nível: cascata atinge apenas componentes diretos de B (A e Y). X1/X2/X3 não recebem evento. Resultado: X1/X2/X3 continuam aparecendo como `availableSacks > 0` no sistema mesmo tendo sido consumidas fisicamente via Liga B vendida. Operador poderia criar nova liga reusando X1, ou vender X1 diretamente — overselling cascateado sem detecção.

A justificativa original de F7.5 ("evitar frações com Int — Q0.4") não se sustenta com F7.7 (liga em liga = 100% obrigatório), que garante cascata 1:1 em qualquer profundidade. F7.5 era restritiva sem ganho real.

**Decisão**: alternativa **(B) — F7.5 vira recursiva (profundidade ilimitada)** + F7.6 hard block também recursivo + UI mostra trace completo via `causationId`.

- **F7.5 revisada**: cascata desce recursivamente até samples folha (`isBlend = false`). Cada nível emite `SALE_CREATED` / `LOSS_RECORDED` com `causationId` apontando pro evento "pai" imediato.
- **F7.6 revisada**: hard block valida toda a árvore de descendentes (CTE recursiva). Pra cada descendente, exige `soldSacks == 0 AND lostSacks == 0` no momento da venda. Coleta lista completa de bloqueios e devolve num único `409`.
- **UI**: detalhe de cada sample exibe trace reconstruído de `causationId` — "vendida via cascata da Liga A (vendida via cascata da Liga B)" — clicável até a liga raiz.

**Trechos atualizados no doc**:

- **F7.5** — REVISADA (texto completo, com nota explicando a versão anterior).
- **F7.6** — REVISADA (texto completo, valida árvore via CTE).
- **Wave A2** — `recordSale`/`recordLoss` agora descem recursivamente em transação atômica única; `validateBlendSaleEligibility` retorna lista completa de bloqueios.
- **Wave B3** — detalhe renderiza trace via `causationId` (resolvido no backend pra incluir `causedByLotNumber`).

**Alternativas rejeitadas**:

- **(A)** Manter F7.5 a 1 nível — bug físico real, falha o teste "operador não pode vender o que não tem mais".
- **(C)** Pré-expansão de componentes na criação (B armazena X1/X2/X3/Y atômicos) — perde audit/intenção operacional, não resolve liga A fantasma com saldo aparente.

### F1.A — Footer expansível pra revisar selecionados ⚠️ **REVOGADA em 2026-05-18 por F1.D**

> A solução de footer expansível (decidida nesta sessão) foi substituída pela especificação detalhada do usuário em F1.D: revisão das selecionadas migra pro bottom-sheet unificado de confirmação (que JÁ TEM os inputs de contribuição). Decisão original mantida abaixo pra histórico, mas trechos do doc foram reescritos.

**Problema identificado**: F1.1 promete que "selecionados ficam preservados entre buscas/filtros", mas não definiu como o operador **revisa** a lista quando o filtro atual esconde os selecionados.

**Decisão original (revogada)**: footer expansível como bottom-sheet com lista + × + Continuar dentro da expansão.

**Substituída por F1.D**: sem footer no modo seleção. Contador no header (clicável) e FAB-seta abrem o MESMO bottom-sheet unificado de confirmação com inputs de contribuição embutidos.

### F1.B — Backend retorna `eligibility` estruturado ✅ (2026-05-18)

**Problema identificado**: F1.4 promete tooltip explicando o motivo de inelegibilidade, mas não definia como frontend descobre a causa. Risco de regra duplicada (backend filtra/marca elegíveis com uma lógica, frontend derive o motivo com outra) — divergência ao evoluir critérios.

**Decisão**: alternativa **(B) Backend retorna campo `eligibility` estruturado**, sem texto de UI.

- Resposta de `listSamples` (modo `eligibleForBlend`) enriquecida por amostra: `eligibility: { eligible: boolean, reason: 'INVALIDATED' | 'NO_BALANCE' | null }`. _(Originalmente o enum tinha `'NOT_CLASSIFIED'` também; reason removida em 2026-05-19 quando F1.4 foi relaxada — ver Log de sessões.)_
- Backend é dono da regra de elegibilidade. `reason` segue enum estável.
- Frontend mapeia `reason → texto pt-BR` em constante local (sem i18n no payload por enquanto — over-engineering antes de virar requisito real).

**Mapeamento de tooltips (frontend)** (`NOT_CLASSIFIED` removido em 2026-05-19 com o relaxamento de F1.4):

- `INVALIDATED` → "Amostra inválida"
- `NO_BALANCE` → "Sem saldo disponível"

**Trechos atualizados no doc**:

- **F1.4** — adicionado contrato do campo `eligibility` + mapeamento de tooltips.
- **Wave A3** — `GET /samples?eligibleForBlend=true` retorna `eligibility` por amostra. **Inclui inelegíveis** (frontend renderiza acinzentado — não filtra fora).
- **Wave B1** — texto "itens inelegíveis (!CLASSIFIED...)" trocado por uso de `eligibility.eligible === false`. Mapeamento de tooltips mencionado.

**Alternativas rejeitadas**:

- **(A)** Frontend deriva da resposta atual — regra duplicada, risco de divergência ao evoluir critérios.
- **(C)** Backend retorna mensagem pronta em pt-BR no payload — acopla UI a backend; i18n é problema fase 2 (não vale gastar agora).

### F1.C — FAB radial: microcomportamento + refetch otimista ✅ (2026-05-18)

**Problema identificado**: F1.0 e F1.1 deixaram em aberto: (1) o que aparece imediatamente ao tocar "Liga" no FAB, (2) como o refetch com `eligibleForBlend=true` é tratado (loading vs otimista), (3) o que fazer se o refetch falhar, (4) detalhes da animação radial.

**Decisões (3 partes)**:

1. **Transição "Liga" — alternativa (A) instantânea + refetch otimista em background**.
   - FAB fecha + modo seleção entra imediatamente (sem skeleton, sem loading state visível).
   - Lista atual permanece visível; refetch atualiza cards conforme chega.
   - Seleção pré-refetch validada localmente; se a resposta final marcar como inelegível, seleção é desfeita com toast.

2. **Erro do refetch — alternativa (α) sair + toast**.
   - "Não foi possível carregar amostras pra liga" + volta pra `/samples` neutra.
   - Sem retry automático no MVP — operador re-tenta via FAB. Robustez simples.

3. **Animação — alternativa (I) slide+fade dos satélites em arco**.
   - Tap "+" → 2 satélites deslizam em arco (~150-200ms).
   - Tap em satélite → pulse rápido + FAB anima fechando + ação dispara.
   - Tap fora (backdrop transparente) → fecha sem ação.

**Trechos atualizados no doc**:

- **F1.0** — adicionada nota de animação (slide+fade em arco, comportamento de tap fora).
- **F1.1** — adicionado comportamento de transição instantânea + refetch otimista + tratamento de erro.
- **Wave B1** — descreve estado `expanded` do FAB, animação CSS, e tratamento de erro de refetch.

**Alternativas rejeitadas**:

- **(B) Loading explícito sobre a lista** — adiciona latência percebida em conexão boa.
- **(C) Spinner no FAB** — FAB-spinner é incomum, gera flicker em conexão boa.
- **(β) Ficar em modo seleção com warning ao falhar** — operador pode selecionar inelegíveis em silêncio.
- **(γ) Retry automático 3x** — pode demorar 5-10s pro usuário; pra MVP fica fora.
- **(II) Satélites scale-up sem arco** — menos elegante; speed dial em arco é o padrão familiar.
- **(III) Bottom-sheet "Criar..."** — opção válida mas perde o "speed dial feel" do FAB que faz a feature parecer rápida e moderna.

### F1.D — Modo seleção: especificação visual completa + bottom-sheet unificado com contribuições ✅ (2026-05-18)

**Origem**: especificação detalhada fornecida pelo usuário cobrindo (1) o visual da página `/samples` em modo seleção, (2) o fluxo de confirmação após "Continuar", e (3) a determinação das sacas por amostra **dentro** do bottom-sheet de confirmação (informação nova crítica: quase 100% das ligas usam o total da amostra, ligas parciais são exceção).

**Conjunto de decisões consolidadas**:

#### 1. Visual da página `/samples` em modo seleção

- **Cards** ganham bolinha de seleção à esquerda (verticalmente centralizada). Estados:
  - **Vazia** — borda fina cinza, fundo transparente (não-selecionada).
  - **Selecionada** — preenchida verde da marca + `✓` branco dentro.
  - **Inelegível** (`eligibility.eligible === false`) — bolinha cinza opaca + card todo acinzentado + tooltip do motivo (F1.B).
- **Header** durante o modo:
  - Esquerda: ícone `X` (sair do modo, limpa seleção, volta `/samples` neutra).
  - Centro: título **"Selecionar amostras"** (substitui "Amostras").
  - Direita (lugar do botão de filtro): **contador "N selecionadas"** clicável.
- **Input de busca por texto** continua ativo. Apenas o botão de filtro avançado some.
- **Navbar/tabbar inferior** some.
- **FAB** vira **seta `→`** no mesmo lugar do "+":
  - Disabled quando < 2 selecionadas (opacidade 40% + cursor block + tooltip "Selecione pelo menos 2 amostras").
  - Habilitada quando ≥ 2 → abre o bottom-sheet unificado.

#### 2. Bottom-sheet unificado de confirmação (com contribuições embutidas)

- **Mesmo bottom-sheet** abre por dois caminhos: tap no contador no header (revisão a qualquer momento) ou tap na seta (continuar pra próxima etapa). Conteúdo idêntico.
- Cabeçalho verde "Confirmar amostras" (ou "Amostras da liga").
- **Lista de amostras selecionadas**, uma por linha:
  - Identificação: lot + cliente + label "X disp." (saldo físico).
  - **Input de contribuição** pré-preenchido com `availableSacks` (total físico) — **F2.2 revogada, F2.1 atualizada**.
  - Operador edita pra parcial só quando quer ligar menos que o total (quase 100% das vezes deixa o default).
  - Sem indicador visual especial pra parcial — número diferente é o sinal.
  - Sem botão "restaurar pro total" — operador apaga e re-digita se quiser voltar.
  - Validações inline: rejeita não-número, 0, > `availableSacks`. Não pode ficar vazio (operador apagou sem re-digitar).
  - Warning F2.4 (comprometimento prévio) aparece inline se aplicável.
  - Origem que é liga (`isBlend = true`): input fixo e disabled = `declaredSacks` (F7.7), label "Liga inteira: N sc".
  - Botão `×` pra remover individualmente (linha colapsa com slide-up + fade ~150ms).
- **"Total da liga: N sc"** rodando (soma automática F2.3) próximo ao rodapé.
- **Rodapé**: botões "Voltar" (fecha sheet, mantém modo seleção) + "Continuar" (vai pro modal F3).
- **"Continuar" disabled** quando < 2 amostras ou qualquer input inválido/vazio.
- **Edge case**: operador remove a última amostra (=0 selecionadas) → sheet fecha + sai do modo seleção + volta `/samples` neutra.

#### 3. Próximo passo após "Continuar" no bottom-sheet

- Bottom-sheet fecha + abre **modal central F3** ("Nova liga": dono, safra, local, obs).
- Modal segue padrão `.app-modal.is-themed` (skill `modals`).
- Tap "Criar liga" no modal F3 → backend cria → tela de sucesso (F5.1 com `entity='blend'`).

**Trechos atualizados no doc**:

- **F1.0** — sem mudança (FAB radial mantido como entrada).
- **F1.1** — REVISADA: especificação visual completa do modo seleção (bolinhas, header, navbar, FAB-seta, tooltips).
- **F1.3** — REVISADA: próximo passo agora é "bottom-sheet unificado com contribuições + modal F3", não 2 modais sequenciais.
- **F1.A** — REVOGADA (footer expansível substituído pelo bottom-sheet unificado).
- **F2.1** — REVISADA: input no bottom-sheet com pré-preenchimento.
- **F2.2** — REVOGADA: default vazio substituído por default = total.
- **Pendências F2** — F2.1 e F2.2 marcados com status atualizado.
- **Wave B1** — atualizada com a especificação completa (a fazer abaixo).
- **Wave B2** — atualizada (formulário F3 vira modal separado do bottom-sheet).

**Alternativas rejeitadas (sub-decisões)**:

- Default `realFreeSacks` em vez de `availableSacks` — confunde operador ("o total era 100, por que veio 70?"); o warning F2.4 já cobre overcommit consciente.
- Bottom-sheet de revisão separado do de confirmação — duplica componente sem ganho semântico (mesma lista, mesmos inputs).
- Visualização especial pra "parcial" (badge / cor azul / ícone de lápis) — número diferente é suficiente; refator visual desnecessário.
- Botão "restaurar pro total" — fricção mínima de apagar e re-digitar; affordance extra polui linha.
- Modal central pra confirmação (em vez de bottom-sheet) — bottom-sheet é mais natural pra UX mobile e mantém continuidade com a página.
- Tela inteira pra confirmação — pesado visualmente; bottom-sheet basta.

**Implicações pra Wave A (backend)**: nenhuma mudança em contratos — toda a especificação é UI. `listSamples?eligibleForBlend=true` já retorna o necessário (decidido em F1.B + T0.B).

### F3.A — Vendedor implícito + UI quando liga sem dono ✅ (2026-05-18)

**Problema identificado**: F3.1 permite `liga.ownerClientId = null` ("carteira da corretora"). Quando essa liga é vendida, como o sistema rastreia o "vendedor"? Investigação do código mostrou:

- `SampleMovement` tem **apenas** `buyerClientId`/`buyerUnitId` — nenhum campo de vendedor (`prisma/schema.prisma:467`).
- `SALE_CREATED` payload (`docs/schemas/events/v1/payloads/sale-created.payload.schema.json`) também só carrega buyer.
- Service (`sample-command-service.js:2130`) só valida `buyerClientId` pra SALE; nenhuma referência a vendedor.

Conclusão: o vendedor de qualquer venda é sempre **implícito** — derivado de `sample.ownerClientId` da Sample associada (resolvido via JOIN). Funciona perfeitamente pra Sample normal. Pra liga sem dono, fica "venda sem vendedor identificado".

**Decisão (modelo)**: alternativa **(A) Status quo — manter modelo intacto + documentar a semântica**.

- Nenhuma mudança em `SampleMovement` ou no payload `SALE_CREATED`.
- A cascata em origens (F7.4 + T0.D) já preserva rastreabilidade: cada origem tem seu produtor real → relatórios financeiros funcionam corretamente.
- Liga sem dono = SALE_CREATED na liga aparece como "venda sem vendedor identificado" — implícito = corretora.
- **Docstring Prisma** em `Sample.ownerClientId` (registrada em Wave A1): "Também serve como vendedor implícito em SampleMovement — relatórios financeiros derivam vendedor desta coluna via JOIN. Pra liga sem dono, venda aparece como 'sem vendedor identificado' (carteira da corretora)".

**Decisão (UI)**: alternativa **(III) Sugestão com botão "Atribuir dono primeiro"** + "Vender mesmo assim".

- Modal de venda detecta `liga.isBlend && liga.ownerClientId === null` e mostra bloco destacado:
  - Texto: "Esta liga não tem dono atribuído — será vendida em nome da corretora."
  - 2 botões: "Atribuir dono primeiro" (PATCH no Sample) e "Vender mesmo assim" (prossegue).
- Estimula boa prática (atribuir produtor antes), sem bloquear (F3.1 mantém opcional).
- Não muda contrato de API — atribuição é via endpoint de edição já existente ou novo `PATCH /samples/:id`.

**Trechos atualizados no doc**:

- **F3.1** — texto expandido com explicação do vendedor implícito + UI de venda.
- **Wave A1** — adicionado docstring Prisma em `Sample.ownerClientId`.
- **Wave B4** — descrição completa da UI de venda de liga sem dono (2 botões na seção destacada).

**Alternativas rejeitadas**:

- **(B) sellerSnapshot no payload** — adiciona campo no contrato; risco de divergência se cliente mudar de nome; resolve algo que JOIN já resolve.
- **(C) sellerClientId na tabela** — migration aditiva + índice + redundância com `sample.ownerClientId`; benefício marginal pro custo.
- **(D) Bloquear venda de liga sem dono** — conflita com F3.1 ("carteira da corretora" é caso operacional real); fricção sem justificativa.
- **(I) Soft warning sem botão de ação** — informa mas não estimula a boa prática.
- **(II) Sem aviso** — operador pode esquecer e descobrir só nos relatórios.

### F3.B — Hint informativo de safras no formulário (sem auto-derivar) ✅ (2026-05-18)

**Problema identificado**: F3.2 (safra manual, sem pré-preenchimento) preserva reflexão consciente, mas tem risco real: operador digita "MISTA" frequentemente em ligas multi-safra, e a info "quais safras" se perde do campo `declaredHarvest` (vira filtros fracos em relatórios). A info detalhada vive em `SampleBlendComponent` + `Sample.declaredHarvest` de cada origem — mas requer JOIN pra reconstruir, e operador na hora de digitar pode nem lembrar quais são.

**Decisão**: alternativa **(D) Hint informativo embaixo do input + sem auto-preencher**.

- Modal "Nova liga" exibe texto pequeno em cinza sob o input `declaredHarvest`: _"Origens contêm safras: 24/25, 25/26"_.
- Lista derivada no frontend: `components.map(c => c.origin.declaredHarvest).distinct()`. Sem campo novo na API (`components` já é retornado em `GET /samples/:id` e disponível no contexto do form da Wave B2).
- F3.2 preservada — campo continua vazio por default, operador digita conscientemente com o contexto na frente.
- Tela de detalhe da liga (Wave B3) mostra seção **Composição** com cada origem + safra individual (alternativa **(I)**) — resumo agregado fica como polish opcional pra fase 2.
- `notes` continua vazio por default (sem auto-população — F3.7 mantém).

**Trechos atualizados no doc**:

- **F3.2** — adicionada nota sobre o hint UI.
- **Wave B2** — descrição do hint inline embaixo do input de safra no `<BlendCreateModal>`.
- **Wave B3** — seção "Composição" do detalhe da liga lista origens com safra individual.

**Alternativas rejeitadas**:

- **(A) Status quo sem hint** — operador digita "MISTA" sem contexto, perde oportunidade de informar bem.
- **(B) Auto-preencher `declaredHarvest`** — vai contra F3.2 (reflexão consciente).
- **(C) Auto-popular `notes`** — polui campo de observação, duplica dados de `SampleBlendComponent`, risco de desatualizar.
- **(E) Campo `originHarvests` agregado na API** — redundante; `components` já carrega `declaredHarvest` de cada origem, frontend agrega trivialmente.
- **(II) Resumo agregado no header da Composição** — polish, fica pra fase 2 se ligas grandes (10+) virarem comuns.

### F7.A — `buyerClientId` na cascata: status quo + documentação ✅ (2026-05-18)

**Problema identificado**: F7.4 + T0.D estabelecem cascata recursiva, mas o **comportamento semântico** do `buyerClientId` nos eventos descendentes não tinha sido formalizado. Operador/relatórios futuros podem se confundir: "produtor X aparece como tendo vendido pra C, mas X nunca conheceu C — foi a corretora que negociou". Vale confirmar a abordagem e documentar.

**Decisão**: alternativa **(A) Status quo + documentação no JSON schema**.

- **Mesmo `buyerClientId` e `buyerClientSnapshot`** replicados em todos os eventos descendentes (origens diretas, intermediárias, folhas). Sem variação por nível.
- **`causationId`** (já existente no envelope — `prisma/schema.prisma:244` + `event-envelope.schema.json:49`) encadeia cada evento da árvore com seu pai imediato. UI no detalhe da origem reconstrói trace "vendida via cascata da Liga A (via Liga B)" navegando recursivamente.
- **Vendedor implícito** de cada SALE_CREATED é `sample.ownerClientId` da Sample associada (F3.A); cada origem mantém seu produtor real.
- **Filtros simples** por `buyerClientId` funcionam diretamente em qualquer nível da árvore (sem JOIN recursivo).
- **Documentação no JSON schema** dos payloads `SALE_CREATED` e `LOSS_RECORDED` (Wave A1) registrando a semântica da cascata pra contexto futuro.

**Trechos atualizados no doc**:

- **F7.4** — texto expandido descrevendo o comportamento do buyer em cascata + ausência de `cascadeSource`/`rootBlendId`.
- **Wave A1** — adicionado item de documentação nos JSON schemas de `SALE_CREATED` e `LOSS_RECORDED`.

**Alternativas rejeitadas**:

- **(B) `cascadeSource`/`rootBlendId` no payload** — redundante com `causationId` + lookup; só evita 1 navegação recursiva que não é gargalo.
- **(C) Buyer diferente entre liga raiz e cascata (descendentes com `buyerClientId = null` + ref)** — quebra filtros simples por buyer; obriga JOIN recursivo em relatórios; complexidade alta sem ganho real (o trace já existe via causationId).
- **`rootBlendId`/`cascadeSource`** — mesmo raciocínio que (B).

### F7.C — F7.7 (liga em liga = 100%) revalidada + tooltip UX ✅ (2026-05-18)

**Problema identificado**: F7.7 impõe restrição forte (liga inteira ou nada quando origem é liga). Tensão era confirmar se a prática operacional aceita essa restrição ou se a fricção justificaria afrouxar (permitir parcial).

**Análise**:

- Permitir parcial liga-em-liga viola Q0.4 (Int) — cascata gera frações em proporções não exatas (ex: 75sc de Liga 200sc → 18.75/26.25/30 nos componentes).
- "Dividir liga já fisicamente misturada" é raro na prática real: liga = pacote físico misturado; subdividir é operação difícil/incomum.
- Workaround (reverter + recriar menor) é aceitável pra os casos raros que aparecerem.

**Decisão**: alternativa **(A) Manter F7.7 = 100% obrigatório** + adicionar **(I) tooltip explicativo** no input desabilitado da liga.

- Status quo da regra mantida.
- Tooltip no bottom-sheet (F1.D / Wave B1) e onde o input fixo aparece: _"Para usar parte de uma liga, reverta-a primeiro e crie uma menor"_.
- Operador entende a restrição e o caminho disponível.

**Trechos atualizados no doc**:

- **F7.7** — adicionada nota de revalidação + descrição do tooltip.
- **F1.D** (Bloco F1) — descrição do input desabilitado de origem-liga inclui o tooltip.
- **Wave B1** — `<BlendConfirmationSheet>` renderiza tooltip no input fixo.

**Alternativas rejeitadas**:

- **(B) Parcial + arredondamento na cascata** — discordância em relatórios; complexidade na cascata; risco de bugs sutis em audit.
- **(C) Parcial só quando divide em Int exato** — fricção alta, UX confusa ("75 não dá; tente 80").
- **(D) Migrar Q0.4 pra Decimal global** — fora de escopo (refator gigante).
- **(II) Sem tooltip** — operador descobre por tentativa; pior UX.

### F7.D — Formato do erro de invalidação bloqueada ✅ (2026-05-18)

**Problema identificado**: F7.2 (revisado) decidiu bloquear invalidação de amostra em liga ativa com mensagem "Esta amostra contribui pra ligas X, Y. Reverta-as antes de invalidar." — texto vago. Faltava: (1) formato exato do erro no backend pra UI consumir, (2) UX no frontend pra operador agir rapidamente.

**Decisões**:

**Backend — alternativa (A) erro estruturado com `activeBlends`**:

- HTTP `409` + corpo (shape real, confirmado na implementação B3.5 — backend usa `HttpError(409, message, { code, activeBlends })`, serializado por `toHttpErrorResponse`):
  ```json
  {
    "error": {
      "message": "Esta amostra contribui pra N liga(s) ativa(s). Reverta-as antes de invalidar.",
      "details": {
        "code": "SAMPLE_HAS_ACTIVE_BLENDS",
        "activeBlends": [
          {
            "sampleId": "<uuid>",
            "lotNumber": "5678",
            "status": "CLASSIFIED",
            "contributedSacks": 50
          }
        ]
      }
    }
  }
  ```
- No frontend, `ApiError.details` recebe `{ code, activeBlends }` — `activeBlends` é irmão de `code` (achatado), não aninhado sob outro `details`.
- `code` permite detecção robusta no frontend (sem parsear `message`).
- `activeBlends` alimenta a lista clicável.

**Frontend — alternativa (I) modal de erro detalhado**:

- Modal `.app-modal.is-themed` aparece quando operador tenta invalidar e o backend rejeita.
- Cabeçalho: "Não foi possível invalidar"
- Body: "Esta amostra contribui pra N ligas ativas. Reverta-as antes de invalidar:"
- Lista de cada liga em `activeBlends`:
  - Linha: lot + status + contribuição em sc.
  - Botão "Ver liga" → navega pro detalhe da liga (operador reverte de lá, com confirmação + motivo opcional — F8.2).
- Rodapé: botão "Entendi" (fecha modal).
- **Sem "Reverter aqui"** — reverter é ação destrutiva, opera-se no contexto da liga.

**Trechos atualizados no doc**:

- **F7.2** — formato do erro + UX completa.
- **Wave A2** — `invalidateSample` retorna o erro estruturado.
- **Wave B3** — descreve o modal de erro com a lista clicável.

**Alternativas rejeitadas**:

- **(B) Erro simples só com texto** — frontend precisaria parsear texto pra lista clicável; frágil.
- **(II) Toast resumido** — sem detalhes, operador investiga manualmente; pior UX.
- **(III) Aviso inline permanente no detalhe substituindo botão "Invalidar"** — desnecessário porque a seção "Comprometida em N ligas ativas" (T0.B) já cobre a info; ocupa espaço fixo sem benefício adicional.
- **Botão "Reverter" inline no modal de erro** — reverter sem ver contexto da liga é perigoso; manter na rota natural (ver liga → confirmar).

---

## Log de sessões

### 2026-05-15 — Sessão 1

- Doc antigo `docs/Liga-de-Lotes-Especificacao.md` (DRAFT de 19/abr/26, 141 linhas) **deletado**. Todas as decisões anteriores descartadas explicitamente — começamos do zero.
- Esqueleto deste plano criado.
- **Bloco 0 aberto**: 6 perguntas fundacionais formuladas (Q0.1 a Q0.6), cada uma com análise + opções + tradeoff.
- Estado atual do domínio `Sample` mapeado (resumo na seção dedicada): schema, eventos, lifecycle, comercial, idempotência, OCC.
- **Bloco 0 fechado integralmente** nesta sessão: Q0.1 (liga é Sample), Q0.2 (origem mantém saldo via `blendedSacks`), Q0.3 (reversível via `BLEND_REVERTED`), Q0.4 (sacas Int), Q0.5 (cascata recursiva permitida), Q0.6 (mesma sequência de lot number, UI marca).
- Premissas fundacionais consolidadas: **liga = Sample com tabela auxiliar de composição + novos eventos `BLEND_*` + saldo derivado de `available = declared - sold - lost - blended` + recursão por design**.
- **Bloco F1 fechado integralmente** nesta sessão: F1.0-F1.3 (top-level: FAB radial, modo seleção, todos podem criar, próximo passo é formulário), F1.4 (só CLASSIFIED com saldo), F1.5 (clientes diferentes ok), F1.6 (safras diferentes ok), F1.7 (mínimo 2, sem máximo).
- Implicações registradas: backend ganha filtro `eligibleForBlend`, frontend marca inelegíveis com tooltip; dono e safra do lote resultante ficam pra Bloco F3.
- **Bloco F2 fechado integralmente** nesta sessão: F2.1 (input numérico simples + saldo ao lado), F2.2 (default vazio, força reflexão), F2.3 (`declaredSacks` da liga = soma automática).
- **Bloco F3 fechado integralmente** nesta sessão: F3.1 (dono opcional, autocomplete), F3.2 (safra manual sem pré-preencher), F3.3 (`declaredOwner` segue cliente, null se sem cliente), F3.4 (`classificationType` nulo), F3.5 (`declaredOriginLot` oculto/nulo), F3.6/F3.7 (Local + Obs opcionais), F3.8 (`receivedChannel` = `in_person` silencioso).
- Formulário do novo lote consolidado em tabela visível/oculto/obrigatório no doc.
- **Bloco F4 fechado integralmente** nesta sessão: F4 (sem preview, criação direta após formulário), F4.b (sem cálculo de classificação prevista — liga nasce em branco, reusa fluxo de classificação do Sample normal).
- Decisão simplifica bastante o modelo: liga não precisa de `predictedClassificationData`, só `SampleBlendComponent` pra rastreabilidade.
- **Bloco F5 fechado integralmente** nesta sessão: F5.1 (reusa `SampleCreatedSuccessModal` com prop `entity='blend'`), F5.2 (sem auto-impressão na criação — usuário corrigiu, registrei memória `feedback_no_auto_print_after_creation`; auto-print existente é só pós-classificação), F5.3 ("Criar outra liga" volta `/samples` neutra, FAB fechado).
- **Bloco F6 fechado integralmente** nesta sessão: F6.1 (classificação 100% igual ao Sample normal, zero código novo nesse path), F6.2 (composição só visível em `/samples/[id]`, não durante a classificação).
- **Bloco F7 fechado integralmente** nesta sessão, com **revisão importante de Q0.2**:
  - Q0.2 originalmente decidiu "origem decrementa `blendedSacks` na criação"; usuário esclareceu que a liga é **intenção/proposta**, não materialização — origens só são afetadas na **venda/perda da liga**. Q0.2 revisada no doc; `blendedSacks` removido; `SampleBlendComponent` é o único registro de composição.
  - F7.1 (bloco único), F7.3 (perda tudo-ou-nada) e F7.4 (cascata) decididas. F7.5 limita cascata a 1 nível pra evitar frações com Int (Q0.4). F7.6 hard block valida saldo na venda. F7.7 força contribuição de liga em liga ser 100% pra resolver conflito com F7.1.
  - F7.2 revisado: bloqueia invalidação se origem em liga ativa (evita zumbis).
- **Bloco F8 fechado integralmente** nesta sessão: F8.1 (qualquer user reverte), F8.2 (modal com motivo opcional, sem reasonCode), F8.3 (composição preservada como histórico), F8.4 (reversão é definitiva, INVALIDATED é terminal).
- **Bloco Dashboard fechado integralmente**: D.1 (mesma lista), D.2 (badge + ícone), D.3 (sem card separado).
- **Domínio inteiro consolidado**: 40 decisões em 10 blocos, fechadas. Falta só montar o **plano de fases de implementação**.

### 2026-05-18 — Sessão 2 (revisão antes de codar)

Sessão dedicada a revisitar as 40 decisões e identificar fragilidades antes de iniciar Wave A1. Levantadas **14 tensões** (T0.A–T0.D, F1.A–F1.C, F2.A, F3.A–F3.C, F7.A, F7.C, F7.D) — cada uma é uma pergunta de revisão sobre decisão fechada na sessão 1.

Processamento individual em andamento; resolução registrada na nova seção **Tensões revisadas**.

- **T0.A resolvida ✅** — Q0.3 reescrita: `BLEND_REVERTED` transiciona liga → INVALIDATED sem alterar origens (Q0.2 revisada já garantia que origens estavam intactas). Trechos colaterais corrigidos: Q0.4 (lista de campos), F1.4 (fórmula `availableSacks`).
- **T0.B resolvida ✅** — Overcommit silencioso tratado via alternativa (D, híbrido): warning na F2 + seção no detalhe da amostra. Backend computa `committedSacks` on-the-fly (sem coluna persistida). Adicionada nova decisão **F2.4** (warning sempre que `committedSacks > 0`, sem bloqueio — Q0.2 segue intacta). Waves A3/B2/B3 atualizadas.
- **T0.C resolvida ✅ (subsume F3.C)** — Adicionar `'internal'` no enum `RECEIVED_CHANNELS` (mudança de 2 linhas + JSON schema, sem migration de banco). `declaredOriginLot` e `declaredOwner` continuam null em liga, agora documentados em docstrings Prisma. F3.8 revisado para `'internal'`. Wave A1/A2 atualizadas. Investigação revelou que `receivedChannel` não é coluna SQL (só payload de evento), o que tornou a decisão trivial.
- **T0.D resolvida ✅** — F7.5 e F7.6 **REVISADAS**: cascata vira recursiva (profundidade ilimitada, 1:1 garantido por F7.7). Hard block também recursivo. Detalhe do sample renderiza trace completo via `causationId`. Investigação revelou bug físico real: origens netas (X1/X2/X3) com saldo fantasma após liga raiz (B) ser vendida — sistema permitiria overselling cascateado se mantivesse F7.5 a 1 nível. Justificativa original de F7.5 (evitar frações com Int) já não se sustentava com F7.7. CTE recursiva no path de cascata e validação. Wave A2 e B3 atualizadas.
- **F1.A resolvida ✅** — Footer expansível como bottom-sheet pra revisar/remover selecionados no modo seleção. Tap no contador "N selecionadas" expande mostrando lista (lot + cliente + saldo livre real + `×`). Operador revisa sem precisar desfazer filtros de busca. F1.1 e Wave B1 atualizados. Componente novo: `<BlendSelectionFooter />`.
- **F1.B resolvida ✅** — Backend retorna `eligibility: { eligible, reason }` por amostra em `listSamples?eligibleForBlend=true`. Enum de `reason`: `INVALIDATED | NOT_CLASSIFIED | NO_BALANCE | null`. Frontend mapeia texto local pra tooltip. Sem i18n no payload (over-engineering antes de virar requisito). F1.4, Wave A3 e Wave B1 atualizados.
- **F1.C resolvida ✅** — FAB radial: transição instantânea + refetch otimista (lista permanece, cards atualizam quando refetch chega). Erro de refetch → sair do modo seleção + toast. Animação: slide+fade em arco (~150-200ms), tap fora fecha. F1.0, F1.1 e Wave B1 atualizados.

### 2026-05-18 — Sessão 2 (continuação, rodada 2)

Usuário trouxe especificação detalhada da etapa 2 do fluxo (modo seleção + transição pra confirmação) + informação nova crítica sobre a determinação de sacas no modal de confirmação. Conjunto consolidado como **F1.D** (uma só decisão grande cobrindo visual da página, bottom-sheet unificado e contribuições embutidas).

- **F1.D resolvida ✅** — Modo seleção: especificação visual completa + bottom-sheet unificado com contribuições embutidas.
  - **Visual** (`/samples` em modo seleção): cards ganham bolinha vazia/preenchida/inel à esquerda; header vira `[X] Selecionar amostras [N selecionadas]`; navbar inferior some; FAB vira seta `→` (disabled com opacity 40% se < 2).
  - **Bottom-sheet unificado**: mesmo componente abre por tap no contador ou tap na seta. Lista de amostras + inputs de contribuição pré-preenchidos com `availableSacks` (total) + botão `×` por linha + soma rodando + "Voltar / Continuar".
  - **Próximo passo**: tap "Continuar" → fecha sheet → abre **modal central F3** (dono, safra, local, obs) → submit → tela de sucesso.
  - **Revogações em cadeia**: F1.A (footer expansível) — revogada, substituída pelo sheet unificado; F2.2 (default vazio) — revogada, default agora é total da amostra; F2.A (atalho "usar tudo") — subsumida (default já é total).
  - **Revisões**: F1.1 (visual completo do modo seleção); F1.3 (próximo passo agora é bottom-sheet + modal F3); F2.1 (input pré-preenchido com total); Wave B1 (especificação completa do modo + sheet); Wave B2 (cuida apenas do modal F3, sem contribuições).
  - **Sem mudança em backend**: toda a especificação é UI; contratos definidos em F1.B + T0.B já cobrem o necessário.

- **F3.A resolvida ✅** — Vendedor implícito (via JOIN com `sample.ownerClientId`) — status quo do modelo mantido, sem mudança em `SampleMovement` ou payload de evento. UI da venda de liga sem dono: bloco destacado com "Atribuir dono primeiro" (PATCH no Sample) + "Vender mesmo assim". Estimula boa prática sem bloquear. Docstring Prisma em `Sample.ownerClientId` registra a semântica do vendedor implícito. F3.1 expandido, Wave A1 + B4 atualizados.
- **F3.B resolvida ✅** — Hint informativo embaixo do input de safra no modal "Nova liga": _"Origens contêm safras: 24/25, 25/26"_, agregado no frontend a partir de `components`. F3.2 preservada (sem auto-preencher). Tela de detalhe da liga mostra lista de origens com safra individual (sem resumo agregado no MVP — polish pra fase 2). F3.2 expandido, Wave B2 + B3 atualizadas. Zero campo novo na API.
- **F7.A resolvida ✅** — `buyerClientId` e `buyerClientSnapshot` replicados em todos os eventos da cascata (raiz + descendentes). Filtros simples por buyer funcionam diretamente. Trace via `causationId` (já existente no envelope) pra UI/audit. Vendedor implícito mantém-se via `sample.ownerClientId` (F3.A). Sem campo extra de `cascadeSource`/`rootBlendId`. Documentação adicionada nos JSON schemas de SALE_CREATED e LOSS_RECORDED (Wave A1). F7.4 expandido.
- **F7.C resolvida ✅** — F7.7 confirmada (liga em liga = 100% obrigatório). Frações violariam Q0.4 (Int fundacional) e dividir liga já misturada é raro na prática. Tooltip explicativo no input desabilitado: _"Para usar parte de uma liga, reverta-a primeiro e crie uma menor"_. F7.7 expandido, F1.D + Wave B1 atualizadas.
- **F7.D resolvida ✅** — Formato do erro `409 SAMPLE_HAS_ACTIVE_BLENDS` com `activeBlends: [{sampleId, lotNumber, status, contributedSacks}]`. UI: modal de erro detalhado com lista clicável (botão "Ver liga" navega ao detalhe da liga onde a reversão acontece de fato). Sem "Reverter aqui" no modal de erro (perigoso). F7.2, Wave A2 + B3 atualizadas.

### 2026-05-18 — Encerramento da sessão de revisão

**Resultado da sessão**: revisão completa e consolidada do plano de trabalho da feature Liga, com **14 tensões resolvidas** e **2 subsumidas** (F2.A subsumida em F1.D; F3.C subsumida em T0.C).

**Decisões originais revogadas**:

- **F1.A** (footer expansível pra revisar selecionados) — substituída por bottom-sheet unificado em F1.D.
- **F2.2** (default vazio em contribuições) — substituída por default = `availableSacks` da origem em F1.D, refletindo que ~100% das ligas usam o total da amostra.

**Decisões originais revisadas**:

- **Q0.3** (T0.A) — texto antigo dizia "BLEND_REVERTED restaura saldo das origens"; reescrita pra esclarecer que origens nunca foram alteradas (Q0.2 revisada).
- **Q0.4** (T0.A colateral) — referência a `blendedSacks` removida da lista.
- **F1.4** (T0.A + T0.B + F1.B) — adicionado `committedSacks`, `eligibility` estruturado e referência a overcommit permitido.
- **F1.1** (F1.D) — visual completo do modo seleção (bolinhas, header, FAB-seta).
- **F1.3** (F1.D) — próximo passo agora é bottom-sheet com contribuições, não modal F2 separado.
- **F2.1** (F1.D) — input pré-preenchido com total.
- **F3.1** (F3.A) — UI da venda quando liga sem dono ("Atribuir dono primeiro" / "Vender mesmo assim").
- **F3.2** (F3.B) — hint informativo de safras das origens no modal F3.
- **F3.8** (T0.C) — `'in_person'` silencioso → `'internal'`.
- **F7.2** (F7.D) — formato estruturado do erro + UX detalhada do modal.
- **F7.4** (F7.A) — replicação de buyer em cascata + documentação.
- **F7.5** (T0.D) — cascata limitada a 1 nível → recursiva, profundidade ilimitada.
- **F7.6** (T0.D) — hard block 1 nível → recursivo (CTE) na árvore inteira.
- **F7.7** (F7.C) — revalidada como obrigatória + tooltip no input desabilitado.

**Novas decisões adicionadas**:

- **F2.4** (em T0.B) — warning de comprometimento prévio sempre visível.

**Tabela-resumo do formulário consolidada**: atualizada na seção "Decisões" / "Bloco F5" pra refletir o estado final dos campos (com contribuições no bottom-sheet, modal F3 só com dono/safra/local/obs).

**Estado atual do domínio**: 14+ tensões resolvidas, decisões coerentes entre si, plano de implementação (Waves A/B/C) atualizado em todas as referências cruzadas. **Pronto pra iniciar Wave A1 (migration aditiva)**.

**Próximos passos sugeridos**:

1. Quality gate inicial — rodar `npm run lint && npm run format:check && npm run typecheck && npm run validate:schemas && npm run build` no estado atual pra garantir baseline limpo.
2. Iniciar **Wave A1** — migration Prisma de `SampleBlendComponent` + flag `isBlend` + docstrings + extensão de enum `RECEIVED_CHANNELS` + novos eventos `BLEND_CREATED`/`BLEND_REVERTED` + JSON schemas dos payloads.
3. Em paralelo (opcional, em outro PR): atualização dos JSON schemas existentes (`sale-created`, `loss-recorded`, `registration-confirmed`) pra incluir notas de F7.A + `'internal'` em `receivedChannel`.

### 2026-05-18 — Wave A1 (implementação backend schema + eventos) ✅

Wave A1 implementada em **3 commits temáticos** após baseline limpo:

- **`168d694` `feat(prisma): liga A1 - SampleBlendComponent + isBlend + docstrings`** — Migration aditiva (`prisma/migrations/20260518154156_liga_a1_blend_component_and_isblend/`) com a tabela `sample_blend_component` + coluna `sample.is_blend` + índice + 2 valores em `SampleEventType` + 2 valores em `IdempotencyScope` + docstrings em `declaredOwner`/`declaredOriginLot`/`ownerClientId`. Migration criada **manualmente** (não via `prisma migrate dev`) por causa de drift preexistente no `schema.prisma` do branch (estilo de índices `_trgm`, partial UNIQUEs, generated columns defaults — herança de L5/Q-XX; sem impacto funcional, banco está correto em prod). Drift fica como dívida técnica separada (memória `project_schema_drift_2026_05_18`).
- **`82162c2` `feat(events): liga A1 - eventos BLEND_* + channel internal`** — JSON schemas novos pros payloads e envelopes de `BLEND_CREATED` e `BLEND_REVERTED` (audit-only — `fromStatus: null`, `toStatus: null`). `shared-defs.schema.json` atualizado com novos `eventType` e `idempotencyScope`. `event.schema.json` (oneOf aggregate) ganhou refs. `registration-confirmed.payload.schema.json` ganhou `'internal'` no enum `receivedChannel` (T0.C). `RECEIVED_CHANNELS` em `sample-command-service.js:16` também atualizado.
- **`6764e06` `docs(schemas): document cascade behavior in sale/loss payloads`** — Campo `description` adicionado nos schemas `sale-created.payload.schema.json` e `loss-recorded.payload.schema.json` documentando comportamento de cascata (F7.A — buyer replicado em todos os níveis + trace via `causationId`).

**Quality gates**:

- ✅ `lint`, `format:check`, `typecheck`, `validate:schemas` (51 schemas), `build` (Next.js)
- ✅ `test:contracts` (20/20), `test:unit` (177/177), `test:integration:db` (145/145)

**Skill `prisma` atualizada** mencionando `SampleBlendComponent`, flag `isBlend`, `BLEND_*` events e `'internal'` no `RECEIVED_CHANNELS` (referenciando este doc).

**Descobertas durante a implementação** (registradas conforme `feedback_document_plan_changes_during_implementation`):

- Drift preexistente no schema.prisma (não-funcional) — tratado criando migration manualmente; documentado em memória dedicada.
- BLEND_CREATED e BLEND_REVERTED ficaram como **audit-only** no JSON schema (`fromStatus: null`, `toStatus: null`). A criação de liga muta o status via `REGISTRATION_CONFIRMED` (não via BLEND_CREATED); a reversão muta via `SAMPLE_INVALIDATED` (não via BLEND_REVERTED). Decisão consistente com Q.print que já trata audit-only.

**Próximos passos**: Wave A2 (services + validações + cascata) — `createBlend`, `revertBlend`, `recordSale`/`recordLoss` ajustadas pra cascata recursiva, `invalidateSample` com bloqueio + erro estruturado `SAMPLE_HAS_ACTIVE_BLENDS`, validações de domínio (mínimo 2 origens, F7.7 quando origem é liga, hard block recursivo F7.6).

### 2026-05-18 — Wave A2 (implementação backend services + cascata) ✅

Wave A2 implementada em **6 commits temáticos** após Wave A1, mantendo isolamento por escopo e quality gates verdes em cada um:

- **`3f37bbc` `feat(events): liga A2.0 - appendEventBatch + eventId opcional`** — Foundation: refactor extraindo `_processEventInTx` em `event-contract-db-service.js`; novo método `appendEventBatch(drafts, options, beforeCommit?)` que abraça N eventos numa única `prisma.$transaction`. `buildEventEnvelope` aceita `eventId` e `causationId` opcionais. `PrismaEventStoreTx.createBlendComponents` pra bulk insert dentro da mesma tx. 4 testes integration novos cobrindo paridade, version-step, rollback e beforeCommit hook.

- **`5c85310` `feat(samples): liga A2.1 - CTE recursiva para arvore de ligas`** — `loadBlendTree(rootSampleId)` em `SampleQueryService` usando primeira CTE recursiva do projeto (limite `depth < 10` defensivo). `findActiveBlendsContainingOrigin(originSampleId)` lista ligas ativas que contêm uma amostra. 6 testes integration novos cobrindo árvore simples (1 sample), liga simples (depth 1) e liga em liga (depth 2).

- **`9a0daf7` `feat(samples): liga A2.2 - createBlend service`** — `createBlend({ components, blendData, actor })` em `SampleCommandService`. Validações: ≥2 componentes, sem duplicatas, todos CLASSIFIED, saldo suficiente, F7.7 (liga em liga = 100%). Owner binding manual (F3.1 permite null). Emite `REGISTRATION_CONFIRMED + BLEND_CREATED` via `appendEventBatch`. `beforeCommit` insere `SampleBlendComponent` rows + marca `isBlend=true`. Idempotency via `buildDeterministicUuid(\`blend:\${actor}:\${clientDraftId}\`)`. Schema do REGISTRATION_CONFIRMED atualizado: `declared.owner`agora aceita string|null (necessário pra liga sem dono — F3.1). Novo helper`loadSampleSummary`em`SampleQueryService`. Novo método `markAsBlend`em`PrismaEventStoreTx`. 8 testes integration cobrindo happy path, sem dono, < 2 componentes, duplicatas, origem não-classificada, saldo insuficiente, F7.7 parcial/100%, idempotência.

- **`6fdb152` `feat(samples): liga A2.3 - revertBlend service`** — `revertBlend({ blendId, reasonText?, expectedVersion, actor })`. Valida `isBlend=true`, status pré-comercializado, `soldSacks=0`, `lostSacks=0` (F8.4). Emite `BLEND_REVERTED + SAMPLE_INVALIDATED` via `appendEventBatch`. Composição preservada (F8.3). 4 testes integration cobrindo happy path, não-blend, já INVALIDATED, com vendas. Texto padrão pra `SAMPLE_INVALIDATED.reasonText` quando `BLEND_REVERTED` não tem motivo (schema do payload exige minLength=1 — motivo real fica em `BLEND_REVERTED`).

- **`5b63716` `feat(samples): liga A2.4 - cascata recursiva em createSampleMovement`** — A maior mudança: `createSampleMovement` ganha branch `isBlend`. Helper `_createBlendCascadeMovement` carrega árvore via `loadBlendTree`, aplica hard block F7.6 (descendentes com sold/lost > 0 → 409 `BLEND_HAS_BLOCKED_DESCENDANTS`), constrói N drafts em pré-order com causation chain encadeada (eventId mapeado por sampleId), idempotency derivada (`buildDeterministicUuid(rootKey::cascade::descendantId)`), e emite tudo via `appendEventBatch`. Caminho non-blend intocado. **Bugfix colateral**: `mapSample` expõe `isBlend` no shape mapeado (estava invisível antes, fazia o branch nunca executar). 4 testes cascata: liga simples 2 origens, liga-em-liga 3 níveis (B→A→{x1,x2}), F7.6 hard block, LOSS com `lossReasonText` replicado.

- **`b4dada5` `feat(samples): liga A2.5 - invalidateSample bloqueia origem em liga ativa`** — Guarda em `invalidateSample`: antes do appendEvent, chama `findActiveBlendsContainingOrigin`. Se não-vazio: `HttpError(409, msg, { code: 'SAMPLE_HAS_ACTIVE_BLENDS', activeBlends: [...] })` conforme F7.D. Caminho normal intocado. 2 testes integration: bloqueia origem em liga ativa, permite após reversão. Helper de teste `createClassifiedSample` reescrito pra criar via `REGISTRATION_CONFIRMED` real + UPDATE (triggers do event store exigem 1o evento).

**Quality gates totais**:

- ✅ lint, format:check, typecheck, validate:schemas (51), build (Next.js)
- ✅ test:contracts (20/20)
- ✅ test:unit (177/177)
- ✅ test:integration:db (173/173, antes 145; **+28 testes** novos da Wave A2)

**Skill `prisma` atualizada** mencionando `SampleBlendComponent` queries (loadBlendTree primeira CTE recursiva, findActiveBlendsContainingOrigin), `appendEventBatch` (transação multi-evento), e que `BLEND_*` events são audit-only (não checam `expectedVersion`).

**Descobertas durante a implementação** (registradas conforme `feedback_document_plan_changes_during_implementation`):

- **Schema do `REGISTRATION_CONFIRMED` precisou aceitar `declared.owner: string | null`** — antes exigia string non-empty, conflitando com F3.3 (liga sem dono). Atualizado mantendo `minLength: 1` quando string (compat com Sample normal).
- **`mapSample` não expunha `isBlend`** — bug silencioso que fazia o branch de cascata nunca executar. Corrigido em A2.4.
- **`SAMPLE_INVALIDATED.reasonText`** exige minLength=1 no payload, mas `BLEND_REVERTED.reasonText` é opcional. `revertBlend` usa texto padrão "Liga revertida (sem motivo informado)" quando operador não informa — o motivo real, quando fornecido, fica em `BLEND_REVERTED`.
- **`BLEND_CREATED` e `BLEND_REVERTED`** confirmados como **audit-only** (`fromStatus: null`, `toStatus: null`). REGISTRATION*CONFIRMED muta status na criação; SAMPLE_INVALIDATED muta na reversão. Os BLEND*\* só carregam contexto pra audit.
- **Cascata respeita F7.7** rigorosamente: liga-em-liga = 100% obrigatório garantido na validação da criação; cascata replica em qualquer profundidade sem frações.

**Próximos passos**: Wave A3 (API endpoints REST) — `POST /samples/blends` (createBlend), `POST /samples/:id/revert-blend` (revertBlend), enriquecer `GET /samples?eligibleForBlend=true` com `committedSacks`/`eligibility`/`activeBlends`, ajustar `POST /samples/:id/movements` pra cascata (sem mudança de contrato — usa o mesmo endpoint).

### 2026-05-19 — Wave A3 (REST API endpoints) ✅

Wave A3 implementada em **4 commits temáticos** + atualização final do log. Wrappers HTTP sobre os services da Wave A2; padrão idêntico aos endpoints existentes (createSample, invalidateSample) — zero invenção arquitetural.

- **`ee8e26f` `feat(api): liga A3.1+A3.2 - REST endpoints POST blends + revert-blend`** —
  - **POST /api/v1/samples/blends** (`app/api/v1/samples/blends/route.ts`) chamando `commandService.createBlend`. Body: `{ clientDraftId, components: [{originSampleId, contributedSacks}], ownerClientId?, ownerUnitId?, harvest, location?, notes?, sampleId?, sampleLotNumber?, idempotencyKey? }`. Retorno: 201 com `{ sample, events, draft }` ou 200 idempotent.
  - **POST /api/v1/samples/:sampleId/revert-blend** (`app/api/v1/samples/[sampleId]/revert-blend/route.ts`) chamando `commandService.revertBlend`. Body: `{ expectedVersion, reasonText?, idempotencyKey? }`. Retorno: 200 com `{ sample, events }`.
  - Backend handlers em `src/api/v1/backend-api.js` seguem template idêntico ao `createSample` (linha 191) e `invalidateSample` (linha 391). Erros estruturados (`HttpError` com `details`) serializados pelo `toHttpErrorResponse` global — F7.D `SAMPLE_HAS_ACTIVE_BLENDS` e cascata `BLEND_HAS_BLOCKED_DESCENDANTS` chegam ao cliente sem código novo de error handling.
  - 5 testes integration (happy path + 422 < 2 components + 404 origem inexistente + reverter happy path + 422 não-blend).

- **`8c3c0bf` `feat(api): liga A3.3 - GET /samples?eligibleForBlend=true enriquecido`** — `listSamples` (queryService + backend-api) aceita filtro opcional `eligibleForBlend`. Quando `true`, cada item é enriquecido com `eligibility: { eligible, reason }` (F1.B) e `committedSacks` (T0.B). Helper interno `computeBlendEligibility` (regra do backend, single source of truth — F1.B). Query agregada `_loadCommittedSacksMap(sampleIds)` calcula committed em 1 roundtrip pra toda a página (sem N+1). 3 testes integration (sem filtro, com filtro distinguindo CLASSIFIED vs REGISTRATION_CONFIRMED, committedSacks correto).

- **`53b7985` `feat(api): liga A3.4 - GET /samples/:id enriquecido (components + activeBlends)`** — `getSampleDetail` retorna 2 campos novos: `components` (composição da liga, com snapshot da origem — vazia em sample normal) e `activeBlends` (ligas ativas onde este sample é origem — sempre incluído). Helper `_listBlendComponents` com `include` da `originSample` (sem JOIN no frontend). Reusa `findActiveBlendsContainingOrigin` (Wave A2.1). 2 testes integration (detalhe de liga com components, detalhe de sample normal que é origem em liga ativa).

**Quality gates totais Wave A3**:

- ✅ lint, format:check, typecheck, validate:schemas (51), build (Next.js)
- ✅ test:contracts (20/20)
- ✅ test:unit (177/177)
- ✅ **test:integration:db (183/183, antes 173; +10 testes Wave A3)**

**Endpoints HTTP disponíveis após A3**:

```
POST   /api/v1/samples/blends                  -> createBlend
POST   /api/v1/samples/:sampleId/revert-blend  -> revertBlend
POST   /api/v1/samples/:sampleId/movements     -> createSampleMovement (com cascata se isBlend)
POST   /api/v1/samples/:sampleId/invalidate    -> invalidateSample (com SAMPLE_HAS_ACTIVE_BLENDS)
GET    /api/v1/samples?eligibleForBlend=true   -> listSamples enriquecido
GET    /api/v1/samples/:sampleId               -> getSampleDetail com components + activeBlends
```

**Descobertas durante a implementação**:

- `mapSample` já expunha `isBlend` (corrigido na Wave A2.4) — testes A3 validam diretamente no body.
- Erros estruturados (`HttpError` com `details: { code, ... }`) **funcionam automaticamente** pela infra existente (`http-utils.toHttpErrorResponse`) — não foi necessário código novo no caminho da API pra propagar `SAMPLE_HAS_ACTIVE_BLENDS` e `BLEND_HAS_BLOCKED_DESCENDANTS`.
- Helper `computeBlendEligibility` ficou no escopo de `sample-query-service.js` (não como método de classe) porque é função pura sem dependência de `this.prisma`. Mantém modularidade.

**Próximos passos**: Wave B (Frontend PWA) — implementar a UI da feature Liga conforme decisões F1.D + F2.4 + F3 + F8 + Dashboard. Em sub-fases B1 (FAB radial + modo seleção em `/samples`), B2 (bottom-sheet de confirmação + modal F3), B3 (badge + detalhe da liga + reversão), B4 (venda/perda da liga com bloco "Atribuir dono primeiro"). Dependências de backend (A1-A3) todas resolvidas.

### 2026-05-19 — Wave B1 (FAB radial + modo seleção em `/samples`) ✅

Wave B1 implementada em **4 commits temáticos** seguindo o plano arquitetural. Sub-fases pequenas e reversíveis; sem regressão visual em modo idle (verificado por commit isolado de refator antes de adicionar lógica nova).

- **`afd2e3e` `feat(types): liga B1.1 - SampleEligibility + param eligibleForBlend + helper labels`** — Fundação compartilhada (F1.B). `SampleEligibility` em `lib/types.ts` (campos opcionais em `SampleSnapshot`). `listSamples` aceita `eligibleForBlend`. `lib/samples/eligibility-labels.ts` com `mapEligibilityReasonToLabel` (3 reasons + null). 4 unit tests em `tests/eligibility-labels.test.js` (Node test runner com `--experimental-strip-types` pra rodar `.ts`).

- **`000b9ce` `refactor(samples): liga B1.2 - extrair SampleCard pra componente reusavel`** — Refator puro extraindo JSX inline (`/samples/page.tsx:1122-1162`) pra `components/samples/SampleCard.tsx`. Zero mudança visual. `deriveCardStatus` movido pra dentro do componente (uso único). Base limpa pra B1.4 estender com bolinha.

- **`5282505` `feat(samples): liga B1.3 - SampleCreateRadialFab com 2 satelites (Unidade/Liga)`** — Componente novo com 2 modos: `idle` (FAB "+" expandindo em 2 satélites com slide+fade ~180ms + pulse ~150ms ao tap) e `blendArrow` (FAB seta `→` com estado disabled quando `selectedCount < 2`). CSS puro reusando `.cv2-fab` base + easing spring `cubic-bezier(0.34, 1.56, 0.64, 1)`. Acessibilidade (`aria-expanded`, `role="menuitem"`, Escape fecha). Race protection via `actionFiredRef` pra taps rápidos em sequência. `SampleQuickCreateFab.tsx` removido (zero consumers).

- **`<próximo>` `feat(samples): liga B1.4 - modo selecao para liga com refetch otimista`** — Modo seleção completo:
  - State em `/samples/page.tsx`: `selectionMode: 'idle' | 'blend'` + `selectedIds: Set<string>` (persiste entre filtros — contador SEMPRE de `selectedIds.size`).
  - **Effect de refetch otimista** (Liga F1.C): quando entra em `'blend'`, dispara `listSamples({ ...filtros, eligibleForBlend: true })` com `AbortController`. Lista atual permanece visível durante refetch; quando chega, `dispatchSamples({ type: 'success-initial', items })` substitui in-place. Reconciliação: pra cada `selectedId`, se item retornou com `eligibility.eligible === false`, remove do Set + `toast.info("Amostra removida da seleção")` com motivo mapeado em pt-BR. Erro de refetch → `setSelectionMode('idle')` + `toast.error`.
  - **Effect de body class** `is-selection-mode` — esconde tabbar + header normal + botão filtro via CSS.
  - **`<SelectionModeHeader>`** novo (`components/samples/SelectionModeHeader.tsx`): `[X]` (sair) + título "Selecionar amostras" + contador clicável `[N selecionadas]`.
  - **`<SampleCard>` estendido** com prop `selectionMode`. Em `'blend'` + elegível: vira `<button>` com bolinha à esquerda (3 estados: vazia/verde+✓/cinza opaca) + classe `.is-blend-selected` (fundo verde claro). Em `'blend'` + inelegível: `.is-ineligible-blend` (acinzentado), tap dispara `onShowIneligibleReason` (toast info com motivo).
  - **FAB alternado**: modo `idle` (normal) ↔ modo `blendArrow` (seta direita, disabled se `<2`).
  - Tap no contador ou na seta → `toast.info("Tela de confirmação em desenvolvimento (B2)")` — placeholder até B2.
  - CSS em `app/globals.css` (block dedicado ao final do arquivo): bolinha, header de seleção, body class rules, variantes do card.

**Quality gates totais Wave B1**:

- ✅ lint, format:check, typecheck, validate:schemas (51), build (Next.js)
- ✅ test:contracts (20/20), test:unit (181/181, antes 177; +4 do eligibility-labels), test:integration:db (183/183 — não afetado por B1)
- 🟡 Smoke test manual visual: a fazer (não há UI integration tests no CI). Tap "+" expande satélites, tap "Liga" entra modo, tap em card elegível toggla seleção, tap em inelegível mostra reason, X sai, refetch otimista funciona.

**Descobertas durante a implementação**:

- **`displayStatus` é literal union (`'' | 'OPEN' | ...`), não array** — tentei usar `.join(',')` por reflexo (corrigido pra passar `value || undefined` direto). Padrão é consistente com o effect principal de fetch (linha ~690).
- **`SampleSnapshot.isBlend` adicionado** como opcional — o backend já expõe (Wave A2.4 corrigiu `mapSample`), mas precisava do type pra `<SampleCard>` em B3 acessar (preparado).
- **`--experimental-strip-types` no `test:unit`** — necessário porque o helper `eligibility-labels.ts` está em TypeScript (consistente com `lib/`). Node 22.6+ suporta a flag; CI já roda Node 22. Sem deps adicionais (ts-node/tsx).
- **`is-tabbar-hidden` no AppShell** existe mas é calculado por pathname interno do componente. Usar body class `is-selection-mode` é mais limpo pra esse caso (sem refator do AppShell).

**Próximos passos**: Wave B2 — `<BlendConfirmationSheet>` (bottom-sheet unificado com inputs de contribuição pré-preenchidos com `availableSacks` — F1.D/F2.1) + `<BlendCreateModal>` (modal F3 central com dono opcional + safra com hint das origens + local + obs) + reuso de `SampleCreatedSuccessModal` com prop `entity='blend'`. Tap no contador ou seta em /samples deixa de ser placeholder e abre o `<BlendConfirmationSheet>`.

### 2026-05-19 — F1.4 relaxada: amostras REGISTRATION_CONFIRMED tambem ligaveis ✅

Mudanca de regra solicitada pelo product owner: amostras registradas (status REGISTRATION_CONFIRMED) podem entrar em liga sem precisar estar classificadas. Antes a regra era "so CLASSIFIED com saldo" (F1.4 original).

**Analise de impacto**:

- O enum `SampleStatus` no Prisma tem apenas 3 valores (`REGISTRATION_CONFIRMED | CLASSIFIED | INVALIDATED`). Com a mudanca, a regra de elegibilidade simplifica drasticamente: basta bloquear INVALIDATED + saldo zerado. Reason `NOT_CLASSIFIED` deixa de existir.
- Cascata de venda/perda (Wave A2.4) ja iterava sem validar status individual das origens — emite SALE_CREATED/LOSS_RECORDED em qualquer status (exceto INVALIDATED). Quando origem REGISTERED e cascateada, `sample.status` permanece REGISTRATION_CONFIRMED; apenas `commercialStatus` evolui (PARTIALLY_SOLD/SOLD/LOST). Schema do payload nao exige `fromStatus = CLASSIFIED`, sem trigger Prisma bloqueando.
- F4.b (liga nasce em branco e segue classificacao normal) **nao muda** — origem ja-classificada ou nao, a liga comeca em `classificationType: null` e usa o fluxo normal.
- F7.7 (liga em liga = 100%) **nao muda** — continua valido independente de status da origem.

**Implementacao** (3 arquivos backend + 2 arquivos frontend + 2 arquivos de teste + este doc):

- `src/samples/sample-query-service.js:971` — `computeBlendEligibility` simplificada: remove check de `status !== 'CLASSIFIED'`, mantem `INVALIDATED` + `NO_BALANCE`.
- `src/samples/sample-command-service.js:1612` — `createBlend` valida `origin.status !== 'INVALIDATED'` (antes era `!== 'CLASSIFIED'`).
- `lib/types.ts:389` — `SampleEligibilityReason` reduzido de 4 para 3 variants (removido `'NOT_CLASSIFIED'`).
- `lib/samples/eligibility-labels.ts` — removido mapping `NOT_CLASSIFIED → 'Aguardando classificação'`.
- `tests/sample-blend.integration.test.js:239` — teste invertido (de "rejects REGISTRATION_CONFIRMED" para "accepts REGISTRATION_CONFIRMED"). Novo teste pra INVALIDATED rejeitado.
- `tests/sample-blend-cascade.integration.test.js` — novo helper `createRegisteredSample` + novo teste "SALE cascades to REGISTRATION_CONFIRMED origin".
- `tests/sample-blend-api.integration.test.js:316` — espera `eligibility.eligible: true` pra REGISTERED.
- `tests/eligibility-labels.test.js` — removido teste do label NOT_CLASSIFIED.

**Quality gates**:

- ✅ lint, format:check, typecheck, validate:schemas (51), build
- ✅ test:contracts (20/20)
- ✅ test:unit (com `eligibility-labels.test.js` reduzido)
- ✅ test:integration:db (185/185, antes 183 — +2 testes novos: aceita REGISTERED + rejeita INVALIDATED, +1 cascata com REGISTERED, -2 modificados in-place)

### 2026-05-19 — Wave B1.5: popover de revisao das selecionadas ✅

Decisao do product owner: simplificar fluxo da liga separando **revisao rapida** (contador) de **finalizacao** (seta `→`). Antes ambos abriam o mesmo bottom-sheet com inputs de contribuicao — gesto duplicado e confuso. Decisao revisada:

- **Contador "N selecionadas"** vira um popover leve ancorado abaixo do botao: lista compacta com `lote · sacas` + X individual + scroll apos 3 cards visiveis. So pra ver/remover seleções.
- **Seta `→` do FAB** continua sendo o caminho exclusivo da finalizacao (Wave B2 futura — bottom-sheet com inputs de contribuicao).

**Implementacao (4 arquivos + doc)**:

- `components/samples/SelectedSamplesDropdown.tsx` (novo): popover ancorado com backdrop transparente click-outside, lista scrollable, animacao slide-out + fade ~150ms ao remover individual. Reusa `--ease-spring` e padrao de backdrop do `SampleCreateRadialFab` (`fab-radial-backdrop`).
- `app/samples/page.tsx`: state `selectionDropdownOpen`, handler `handleRemoveFromSelection` (fecha popover se Set vazio mas **mantem** modo selecao), `openFinalizeBlendPlaceholder` separado pra FAB-seta. Wrapper `.spv2-selection-counter-wrap` (position relative) ao redor do contador, chevron-down rotativo via `aria-expanded`.
- `app/globals.css`: novos blocos `.spv2-selection-counter-wrap`, `.spv2-selection-counter__chevron` (rotaciona -180° com `[aria-expanded="true"]`), `.selected-samples-dropdown-backdrop` (z=`var(--z-popover)`), `.selected-samples-dropdown` (animacao spring scale+translateY+fade), `.selected-samples-dropdown__card` (animacao `selected-samples-card-out` ao receber `.is-removing`), `.selected-samples-dropdown__remove`.
- `docs/Liga-Plano-de-Trabalho.md`: F1.1 e F1.3 revisadas registrando a separacao contador/seta.

**Decisoes UX confirmadas com o usuario**:

- Conteudo do card: `lote · sacas disponiveis` (sem cliente, foco no saldo pra liga).
- Substitui o bottom-sheet B2 no caminho do contador (B2 reservado pro caminho da seta).
- Ultima amostra removida: fecha popover + **mantem modo selecao**.
- Click fora fecha (backdrop transparente).

**Edge / limitacao MVP**: o popover lista samples filtrando `samplesState.items` por `selectedIds`. Se o usuario aplicar filtros que escondem itens da view, esses itens nao aparecem no popover (mas continuam contados no `selectedIds.size`). Aceito pra MVP; cobertura 100% exigiria um `Map<id, snapshot>` cacheado no momento da selecao — futura iteracao se virar problema.

**Quality gates**:

- ✅ lint, format:check, typecheck, build
- 🟡 Smoke manual visual: usuario confere.

### 2026-05-19 — Modal F3 removido: criação direta do sheet ✅

Decisão do product owner após análise: a liga é primariamente uma **composição** (origens + contribuições em `SampleBlendComponent`). Características próprias (dono, safra, local, observações) viram fricção desnecessária no momento da criação — vêm em etapas posteriores (classificação oficial, edição, venda). Modal F3 (`<BlendCreateModal>`, recém-criado em B2.2) **removido** e substituído por chamada direta `createBlend` a partir do botão "Criar liga" no `<BlendConfirmationSheet>`.

**Decisões UX consolidadas:**

- **Dono**: `ownerClientId: null` por padrão (carteira da corretora — F3.A). Edição posterior via detalhe.
- **Safra**: backend deriva automaticamente — `distinct(originHarvests).sort().join(', ')`. Origens com mesma safra → `'24/25'`. Origens mistas → `'24/25, 25/26'`. Nenhuma origem com safra → `null` (raro). Operador pode editar depois.
- **Local**: `null` na criação. Edição posterior.
- **Observações**: `null` na criação. Edição posterior.

**Implementação (6 arquivos + doc)**:

- `src/samples/sample-command-service.js:createBlend` — loop de validação de origens passou a coletar `originHarvests: Set<string>`. Após o loop, deriva `harvest` (join distinct ordenado). `input.harvest` ainda aceito como override (preserva compat com testes integration existentes que passam `harvest: 'MISTA'` manual).
- `src/samples/sample-query-service.js:loadSampleSummary` — agora retorna `declaredHarvest` (campo extra no select e no return). Necessário pra derivação acima.
- `docs/schemas/events/v1/payloads/registration-confirmed.payload.schema.json` — `declared.harvest` agora aceita `["string", "null"]` (era `"string"`). Sample normal continua exigindo non-empty via Zod do form (`createSampleDraftSchema`); liga é o único caso onde fica null.
- `lib/api-client.ts:createBlend` — type simplificado: agora aceita só `clientDraftId`, `components`, `ownerClientId?`, `ownerUnitId?`, `idempotencyKey?`. `harvest`/`location`/`notes` removidos da API client (não enviados pelo frontend).
- `lib/form-schemas.ts` — `createBlendDraftSchema` (Zod) **removido**.
- `components/samples/BlendCreateModal.tsx` — **arquivo deletado**.
- `components/samples/BlendConfirmationSheet.tsx` — botão "Continuar" virou **"Criar liga"**. Prop nova `submitting?: boolean` (controlado pelo parent). Quando submitting, bloqueia backdrop/ESC e desabilita botões.
- `app/samples/page.tsx` — state `createModalOpen`, `pendingContributions` removidos. State novo `creatingBlend: boolean`, `blendDraftIdRef`. `handleProceedToCreate` virou async: gera `clientDraftId`, chama `createBlend(session, { components, ownerClientId: null, ownerUnitId: null })`, em sucesso dispara success modal + refetch da lista, em erro toast.error (skill `feedback-messages`). Helper `buildBlendDraftId()` em escopo de módulo.
- `app/globals.css` — bloco `.blend-create-*` e `.blend-harvest-hint` removidos.

**Quality gates totais**:

- ✅ lint, format:check, typecheck, build
- ✅ test:contracts (20/20), test:unit (180/180), test:integration:db (185/185)
- 🟡 Smoke manual visual: usuário confere.

**Trade-off conhecido**: operador perde a chance de marcar dono/safra/local/notes na criação. Se quiser registrar essas características, precisa esperar a Wave de **edição no detalhe da liga** (parte da Wave B3). Aceito porque ~100% das ligas começam sem dono ("carteira da corretora") e safra é derivada automaticamente do conteúdo real (origens). Local e notes são raros na criação.

### 2026-05-19 — Wave B3.1: BlendBadge nas listagens ✅

Primeira sub-fase da Wave B3 entregue. Pill lilás (`linear-gradient #7c3aed → #6d28d9`) com ícone de merge + texto "Liga", renderizada ao lado do número do lote em 4 superfícies:

- **`components/samples/BlendBadge.tsx`** (novo) — componente reusável, props `size?: 'sm' | 'md'` + `className?` + `style?`. `role="img"` + `aria-label="Liga"`. Sem hover (não-clicável).
- **`components/samples/SampleCard.tsx`** — badge `sm` ao lado de `internalLotNumber` em ambos os modos (idle Link e blend button).
- **`components/dashboard/RecentActivityList.tsx`** — badge `sm` no lote das atividades recentes.
- **`app/samples/[sampleId]/page.tsx`** — badge `md` no header do detalhe (mais visível na página de foco).
- **`app/clients/[clientId]/page.tsx`** — badge `sm` na lista `commercialSamples` do cliente.

**Mudanças backend (mínimas)**:

- `src/samples/sample-query-service.js:getDashboardRecentActivity` — raw query adiciona `s.is_blend`, mapper retorna `isBlend: Boolean(row.isBlend)`.
- `src/clients/client-service.js:listClientSamples` — `select` ganha `isBlend: true`, return inclui `isBlend: Boolean(it.isBlend)`.
- `lib/types.ts` — `isBlend: boolean` adicionado em `DashboardRecentActivityItem` e `ClientSampleListItem`.

**CSS**:

- Bloco `.blend-badge` (+ variantes `sm`/`md` + `.blend-badge__icon`/`__text`).
- `.spv2-card-top`, `.dd-activity-lot`, `.sdv-commercial-list-lot` viraram `inline-flex; align-items: center; gap: 6px` pra acomodar o badge inline com o texto do lote (text-overflow: ellipsis removido onde redundante).

**Tom de cor escolhido**: lilás pra **não competir** com verde (sucesso/brand), vermelho (perigo) e âmbar (warning) já usados no sistema.

**Quality gates**:

- ✅ lint, format:check, typecheck, build
- ✅ test:contracts (20/20), test:unit (180/180), test:integration:db (185/185)
- 🟡 Smoke manual visual: usuário confere.

### 2026-05-19 — Wave B3.2 + B3.3: detalhe da liga (Composição + Comprometida em N ligas) ✅

Duas seções novas no detalhe da amostra (`/samples/[sampleId]`) expondo os relacionamentos da Liga:

- **"Composição da liga"** (B3.2) — quando `sample.isBlend === true`, lista cada origem da liga com lote (+ `<BlendBadge>` se origem é liga aninhada), dono, safra e contribuição em sc. Link clicável pro detalhe individual da origem. Permanece visível em liga revertida (F8.3 — backend preserva `components`).
- **"Comprometida em N ligas ativas"** (B3.3) — quando `sample.isBlend === false` e `activeBlends.length > 0`, lista cada liga ativa que usa a amostra como origem. Backend filtra INVALIDATED (Wave A2.5), então liga revertida desaparece dessa seção automaticamente. Owner/harvest da liga não vêm no payload — fallback `'—'` aceito como limitação MVP.

**Decisões UX confirmadas**:

- **Posição**: logo após "Informações" (antes de "Histórico de envios" / "Classificação").
- **Conteúdo**: Lote + dono + safra + contribuição.
- **Componente reusável**: `<RelatedSampleRow>` compartilhado pelas duas seções.

**Arquivos**:

- `components/samples/RelatedSampleRow.tsx` (novo) — link clicável reusando `.sdv-commercial-list-row`, com `<BlendBadge>` condicional, owner/harvest com fallback `'—'`, status bar colorida via `deriveStatusClass()` (INVALIDATED → cinza; outros → azul). Animação escalonada via `animationDelay`.
- `lib/types.ts:505` — interfaces novas `BlendComponentDetail` e `ActiveBlendDetail`. Adicionados `components?` e `activeBlends?` em `SampleDetailResponse`. Backend já enviava esses campos (Wave A3.4); só o tipo TS estava faltando.
- `app/samples/[sampleId]/page.tsx` — depois do bloco "Informações" (`.sdv-info-compact`), renderização condicional das 2 seções usando `.sdv-card` + `.sdv-card-title` + `.sdv-related-list`.
- `app/globals.css` — classe nova `.sdv-related-list` (lista vertical sem altura fixa, ao contrário do `.sdv-commercial-list` do `/clients/[id]` que tem scroll interno).

**Edge cases tratados**:

- `originSample === null` (origem inacessível) → renderiza `<li className="sdv-empty-text">Origem removida ou inacessível</li>`.
- Origem ainda é uma liga (`originSample.isBlend === true`) → `<BlendBadge>` aparece ao lado do lote; link continua pro detalhe da origem-liga; operador navega recursivamente.
- Liga revertida → "Composição" visível (F8.3); "Comprometida em N" sumiria do lado da origem (já filtrado pelo backend).
- `owner / harvest` null → fallback `'—'`.

**Quality gates**:

- ✅ lint, format:check, typecheck, build
- 🟡 Smoke manual visual: usuário confere.

**Próximas sub-fases B3**: B3.4 (botão "Reverter liga" + modal `.app-confirm-modal`), B3.5 (modal de erro F7.D `SAMPLE_HAS_ACTIVE_BLENDS`), B3.6 opcional (trace de cascata via `causationId`).

### 2026-05-19 — Deploy canary → prod ✅

Liga foi pra produção com o ciclo de criação + visualização completo (sub-fases F1.4 relax, B1.5, B2, B3.1–B3.3). Smoke manual no canary OK, promote pra 100% LATEST executado.

**Imagem deployada**: `d300db2`
**Revisão Cloud Run ativa**: `rastreio-prod-app-00263-kop`
**3 commits aplicados nesta sessão**:

1. `fix(samples,bottom-sheet): 2 bugs encontrados em revisao do fluxo de criar amostra` — BottomSheet history race + location passthrough.
2. `feat(blend): ciclo completo de criacao + visualizacao (waves F1.4 relax + B1.5 + B2 + B3.1-3 + cv2-fab fix)` — 24 arquivos.
3. `docs(liga,skills): plano Liga atualizado + nova skill feedback-messages`.

**Migrate job executado** (mesmo sem migration nova — regra `feedback_always_run_migrate_job` do projeto).

**Em produção agora**:

- FAB radial card glass (Unidade / Liga)
- Modo seleção (cards com bolinha + header simplificado + contador na list-meta)
- Popover de revisão das selecionadas (B1.5) com pill verde no lote
- Sheet de confirmação com inputs de contribuição (B2) — "Criar liga" chama API direto
- Liga sem modal F3 (safra derivada automaticamente das origens — distinct ordenado, join `', '`)
- F1.4 relaxada (REGISTRATION_CONFIRMED elegível pra liga)
- BlendBadge lilás em /samples, dashboard, detalhe, /clients/[id]
- Seção "Composição da liga" no detalhe quando isBlend
- Seção "Comprometida em N ligas ativas" no detalhe da origem

**Riscos conhecidos em produção (sem B3.4/B3.5/B4 ainda)**:

- Liga errada criada → fica permanente até remoção manual via DB (sem reverter via UI).
- Tentar invalidar origem de liga ativa → toast com mensagem técnica `SAMPLE_HAS_ACTIVE_BLENDS` (modal amigável F7.D não foi feito).
- Tentar vender/perder liga via `SampleMovementModal` → comportamento imprevisível (Wave B4 não foi feita).

Operador comunicado dos riscos; uso inicial limitado a teste de criação + visualização.

**Próximas sub-fases priorizadas (próxima conversa)**:

1. **B3.4** — botão "Reverter liga" + modal de confirmação (escape hatch crítico).
2. **B3.5** — modal de erro F7.D estruturado (UX de invalidação bloqueada).
3. **B4** — venda/perda da liga + bloco "Atribuir dono primeiro" (F3.A).
4. **B3.7** — enrichment de `activeBlends[]` com owner/harvest (post-MVP, polish).
5. **B3.6** — trace de cascata via `causationId` (opcional).
6. **C1** — testes + smoke + canary→prod da Wave B3.4/B3.5/B4 (próximo ciclo de deploy).

### 2026-05-21 — Wave B3.4: botão + modal de reverter liga ✅

Botão "Reverter liga" no detalhe da liga + modal de confirmação. Fecha o escape hatch que faltava — liga criada por engano agora se resolve pela UI, sem remoção manual no banco. Backend (`revertBlend` service + endpoint A3.2) já estava pronto desde as Waves A2.3/A3 — B3.4 é 100% frontend.

**Decisão de UX confirmada com o usuário**: numa liga, "Reverter liga" **substitui** o botão "Invalidar" genérico (não coexistem). Reverter uma liga é semanticamente distinto de invalidar — emite `BLEND_REVERTED` pra auditoria, enquanto o "Invalidar" genérico só emitiria `SAMPLE_INVALIDATED`. Dois caminhos de invalidação na mesma tela confundiriam o operador. Amostra normal continua com "Invalidar". Liga já vendida/perdida não mostra botão algum (reversão bloqueada por F8.4 — INVALIDATED é terminal).

**Implementação (3 arquivos + CSS + doc)**:

- `lib/api-client.ts` — nova função `revertBlend(session, sampleId, { expectedVersion, reasonText?, idempotencyKey? })`. Espelha `invalidateSample`: `reasonText` só entra no body quando não-vazio (F8.2 — motivo opcional).
- `components/samples/BlendRevertModal.tsx` (novo) — modal de confirmação no padrão `.app-confirm-modal` (mesmo do "Descartar amostra em andamento"). Warning âmbar "Esta ação não pode ser desfeita" (F8.4) + textarea de motivo opcional (F8.2; `maxLength` 500 = limite do payload `BLEND_REVERTED`) + "Reverter liga" vermelho / "Cancelar" (autofoco no Cancelar — ação segura). Focus trap, ESC, portal. A descrição reforça que as origens não são afetadas (Q0.2 / F8.3).
- `app/samples/[sampleId]/page.tsx` — botão "Reverter liga" (ícone undo) no `sdv-identity-actions`, gated por `canRevertBlend`; `canInvalidateNormal` substitui a condição antiga do "Invalidar" (exclui ligas). Handler `handleRevertBlend` espelha `handleInvalidateSample` — sucesso fecha o modal, `setGeneralNotice` + `syncDetailState` recarrega o detalhe já como INVALIDATED (composição segue visível — F8.3).
- `app/globals.css` — uma regra: `.blend-revert-modal__reason { resize: none }`.

**Quality gates**:

- ✅ lint, format:check, typecheck, build
- ✅ test:contracts (20/20), test:unit (180/180)
- `test:integration:db` não rodado — B3.4 é 100% frontend, sem mudança em `src/` ou schema (mesmo critério das sub-fases B3.2/B3.3).
- 🟡 Smoke manual visual: usuário confere (detalhe de liga → "Reverter liga" → modal → confirmar → liga vira INVALIDATED, composição preservada; amostra normal segue com "Invalidar").

**Próximas sub-fases**: B3.5 (modal de erro F7.D `SAMPLE_HAS_ACTIVE_BLENDS`), B4 (venda/perda da liga + "Atribuir dono primeiro"), depois C1 (deploy do lote B3.4/B3.5/B4).

### 2026-05-21 — Wave B3.5: modal de bloqueio de invalidação por liga ativa ✅

Quando o operador tenta invalidar uma amostra que é origem de liga(s) ativa(s), agora aparece um modal claro (`<SampleInvalidateBlockedModal>`) explicando o bloqueio e listando as ligas, cada uma clicável → detalhe da liga (onde se reverte, via B3.4). Antes, o erro caía num aviso inline com a mensagem técnica do backend. É o espelho do B3.4: B3.4 reverte a liga; B3.5 explica por que mexer numa origem é bloqueado. Backend pronto desde a Wave A2.5 — B3.5 é 100% frontend.

**Decisão de UX confirmada com o usuário — gatilho proativo + rede de segurança**: o doc F7.D previa só o fluxo reativo (mostrar o modal após o 409). Como o detalhe já carrega `activeBlends` (B3.3), o frontend sabe do bloqueio antes do clique. Decidido: ao tocar "Invalidar", se `activeBlends` não-vazio, o modal abre na hora — sem abrir o formulário de motivo (o operador não preenche um motivo que seria rejeitado). O 409 `SAMPLE_HAS_ACTIVE_BLENDS` continua tratado nos `catch` de `handleInvalidateSample` e `handleCancelMovementsAndInvalidate` como rede de segurança (corrida: liga criada entre o carregamento da página e o clique).

**Correção de doc**: a F7.D descrevia o corpo do erro como `{ error, code, message, activeBlends }` achatado. O shape real, confirmado no código, é `{ error: { message, details: { code, activeBlends } } }` → no frontend, `ApiError.details = { code, activeBlends }`. O JSON de exemplo da seção F7.D foi corrigido.

**Implementação (2 arquivos + doc, sem CSS novo)**:

- `components/samples/SampleInvalidateBlockedModal.tsx` (novo) — modal `.app-modal.is-themed`, `role="alertdialog"`, portal, focus trap, ESC/backdrop fecham. Props `{ open, activeBlends, onClose }`. Header "Não foi possível invalidar" + descrição pluralizada; corpo com `<ul className="sdv-related-list">` de `<RelatedSampleRow>` (mesmo bloco da seção B3.3, pra consistência); rodapé botão único "Entendi". Informativo — sem ação destrutiva.
- `app/samples/[sampleId]/page.tsx` — helper de módulo `extractActiveBlendsBlock` (type guard do 409, com comentário forte sobre o shape achatado de `ApiError.details`); state `blockedBlends` + `invalidateBlockedOpen`; gatilho proativo no `onClick` do botão "Invalidar" (`canInvalidateNormal`); rede de segurança reativa nos 2 `catch`; render do modal.
- Reuso total: `RelatedSampleRow`, tipo `ActiveBlendDetail`, `ApiError.details`, classe `.sdv-related-list`. Zero CSS novo, zero mudança de backend/infra.

**Quality gates**:

- ✅ lint, format:check, typecheck, build
- ✅ test:contracts (20/20), test:unit (180/180)
- `test:integration:db` não rodado — B3.5 é 100% frontend, sem mudança em `src/` ou schema (mesmo critério de B3.2/B3.3/B3.4).
- 🟡 Smoke manual visual: usuário confere (amostra-origem de liga ativa → "Invalidar" → modal abre direto; clicar numa liga navega; ESC/backdrop/"Entendi" fecham; amostra sem ligas → formulário de motivo normal).

**Edge case conhecido**: amostra com movimentações ativas E ligas ativas — o gatilho proativo resolve (checa `activeBlends` antes, nem abre o formulário). No caminho reativo raro (corrida), `handleCancelMovementsAndInvalidate` cancela as movimentações antes do 409; comportamento pré-existente do backend, não introduzido aqui.

**Próximas sub-fases**: B4 (venda/perda da liga + "Atribuir dono primeiro" F3.A); **B3.8** (novo — aviso ao vender/perder uma amostra-origem, registrado na lista de sub-fases da Wave B3); depois C1 (deploy do lote B3.4/B3.5).

### 2026-05-21 — Wave B4: backend completo (Fases 1-4) ✅

Após a análise de venda/perda de liga com o usuário (várias rodadas), o "B4 — UI ajustada" foi reescopado como **wave de 8 fases**. Modelo de domínio travado:

- **Liga = proposta, sem reserva.** `availableSacks = declared − sold − lost`; participar de liga(s) não consome saldo; overcommit é livre (Q0.2 + T0.B confirmados com o usuário).
- **Viabilidade quantitativa.** Uma liga é viável ⟺ cada origem da árvore recursiva tem `available ≥ a contribuição dela`.
- **Liga inviável é sinalizada (flag derivado), nunca auto-inativada.** O operador reverte deliberadamente (B3.4) — flag derivado se recalcula sozinho (se a venda da origem for cancelada, some).
- **Cancelar venda/perda de liga = cascata reversa; editar = cascata de update.** Um movimento cascateado (numa origem) não é cancelável/editável isolado — só via a raiz. Isso **destrava a nota de T0.A** ("cascata reversa fora de escopo MVP"): cancelar/editar uma venda é operação distinta de `BLEND_REVERTED` (mexe em `commercialStatus`, não em `status`); F8.4 fica intocada.

As 4 fases de backend, cada uma com quality gates verdes:

- **Fase 1 — F7.6 quantitativa.** O hard block recursivo da cascata (`_createBlendCascadeMovement`) deixou de ser binário (`soldSacks>0 || lostSacks>0`) e passou a quantitativo (`available < contributedSacks`). `BLEND_HAS_BLOCKED_DESCENDANTS` passou a carregar `contributedSacks`/`availableSacks` por origem. F7.6 revisada no doc.
- **Fase 2 — endpoint de viabilidade.** `getBlendFeasibility(sampleId)` (query service) embrulha `loadBlendTree` e marca, por descendente, se `available ≥ contribuição`; retorna `{ feasible, nodes, blockingOrigins }`. Rota `GET /api/v1/samples/:sampleId/blend-feasibility` + handler + `lib/api-client.ts` + tipos. Fonte única da pré-validação do modal (Fase 5) e do flag (Fase 7).
- **Fase 3 — cascata reversa de cancelamento.** `loadBlendCascadeMovements` resolve a cascata percorrendo `sample_event.causation_id` (CTE recursiva). `_cancelBlendCascadeMovement` emite `SALE_CANCELLED`/`LOSS_CANCELLED` na raiz + cada descendente via `appendEventBatch` (atômico). Projeção por nó subtrai só a quantidade daquele movimento — venda independente posterior numa origem é preservada. `cancelSampleMovement` ramifica em `isBlend`.
- **Fase 4 — cascata de update + guard.** `_updateBlendCascadeMovement` re-cascateia comprador/data/obs pra toda a árvore (campos uniformes; quantidade e tipo rejeitados — 422). `loadMovementCreationEvent` + `_assertMovementNotCascaded` — o guard `BLEND_CASCADED_MOVEMENT` impede cancelar/editar um movimento cascateado isoladamente. `updateSampleMovement` ramifica em `isBlend`.

**Quality gates (todas as fases)**: ✅ lint, format:check, typecheck, build, test:contracts (20/20), test:unit (180/180), **test:integration:db (195/195 — +10 testes novos da wave**: F7.6 quantitativa, viabilidade, cascata reversa, cascata de update, guard).

**Sem migration** — a wave não altera o schema (F7.6 é lógica, o endpoint é query, as cascatas são eventos novos).

**Próximas fases (frontend)**: 5 (modal de venda/perda da liga), 6 (UI cancelar/editar movimento de liga), 7 (flag de viabilidade), 8 (B3.8 aviso de venda de origem).

### 2026-05-21 — Wave B4: frontend completo (Fases 5-8) ✅

As 4 fases de frontend da Wave B4, fechando o ciclo comercial da liga. Cada uma um commit atômico com quality gates verdes.

- **Fase 5 — modal de vender/perder a liga.** `SampleMovementModal` + `SampleMovementsPanel` ganharam o ramo `isBlend`: venda/perda de liga é 100% (sem campo de quantidade — mostra o total), pré-validação de viabilidade via `getBlendFeasibility` (desabilita o submit + lista as origens bloqueantes se inviável), bloco "sem dono" (F3.A — "Atribuir dono primeiro" via sub-modal `updateRegistration` / "Continuar mesmo assim"). Rede de segurança: 409 `BLEND_HAS_BLOCKED_DESCENDANTS` → mensagem pt-BR.
- **Fase 6 — cancelar/editar movimento de liga.** Pequena adição de backend primeiro: `getSampleDetail` decora cada movimento com `cascaded: boolean` (novo helper `loadCascadedMovementIds` — confere o `causationId` do evento criador). No frontend: movimentos cascateados ficam read-only no painel da origem (sem botões, com a dica "gerencie pela liga"); o modal de cancelar explica a cascata; o modal de editar ganhou o ramo liga (sem quantidade, sem pré-validação — editar comprador/data não muda viabilidade).
- **Fase 7 — flag de viabilidade.** Card "Liga inviável" no detalhe da liga, derivado de `getBlendFeasibility`, listando as origens sem saldo (lote clicável + "precisa N sc, tem M sc"). Só pra liga ainda vendável; best-effort (em erro, some). A liga não muda de status.
- **Fase 8 (B3.8) — aviso ao vender/perder uma origem.** `activeBlends` threadado page → painel → modal. Quando a amostra-origem participa de liga(s) ativa(s), o `SampleMovementModal` mostra um aviso azul **não-bloqueante** ("Ver ligas" expande / "Continuar mesmo assim" dispensa). O submit nunca é barrado.

**Quality gates**: ✅ lint, format:check, typecheck, build em todos os commits; o commit do backend da Fase 6 também passou test:contracts (20/20), test:unit (180/180), test:integration:db (198/198 — +3 testes do flag `cascaded`).

**Commits**: `feat(samples): liga B4 fase 5 — modal de vender/perder liga` · `liga B4 fase 6 backend — flag cascaded por movimento` · `liga B4 fases 6+8 — cancelar/editar movimento de liga + aviso origem` · `liga B4 fase 7 — flag de viabilidade no detalhe da liga`.

**Próximo**: C1 — smoke manual do ciclo (criar liga → vender → cancelar → editar; vender liga inviável; vender origem comprometida) + deploy canary → prod (o lote inclui B3.4/B3.5 + toda a Wave B4).

### 2026-05-21 — Deploy canary → produção (Wave B4 + B3.4/B3.5) ✅

Fase C1. O lote acumulado — B3.4 (reverter liga), B3.5 (bloqueio de invalidação) e toda a Wave B4 (ciclo comercial da liga, 8 fases) — foi pra produção.

- **CI verde** — run "Contract Tests" na `main` (commit `8e2d269`): lint, format, typecheck, build, contracts, unit, integração PostgreSQL.
- **Build** — `build-image.sh cloud-production` → imagem `rastreio-interno-amostras:8e2d269`.
- **Canary** — revisão `rastreio-prod-app-00265-yaw` deployada sem tráfego.
- **Migrate job** — `execute-job.sh migrate` rodado entre canary e promote (sem migration nova nesta wave, mas o passo é obrigatório).
- **Smoke** — health `/api/health/ready` ok (banco ok) + headers de segurança no canary; smoke manual do fluxo da liga validado.
- **Promote** — `update-traffic --to-latest`: `rastreio-prod-app-00265-yaw` servindo 100%. Health + headers reconferidos em produção.

Sem migration — a wave não altera schema. Wave C concluída; o plano da Liga está implementado e em produção (restavam só B3.6 e B3.7, opcionais/post-MVP — feitas em seguida na mesma data).

### 2026-05-21 — B3.6 + B3.7: sub-fases opcionais finais ✅

As duas últimas sub-fases do plano da Liga, ambas marcadas como opcionais/post-MVP. Com elas, **todo o plano da Liga está implementado**.

- **B3.6 — Trace de cascata.** Reinterpretada na investigação: o doc falava em renderizar o trace "nos eventos", mas não existe UI de histórico de eventos no detalhe — venda/perda cascateada só aparece como linha de movimento no painel comercial. O trace foi pra lá: a dica da Fase 6 ("Movimento da liga — gerencie pela liga", genérica) virou **"Via cascata da liga {lote}"**, com o lote como link pra liga-pai. Backend: o flag `cascaded: boolean` (Fase 6) deu lugar a `cascadedFrom: { sampleId, lotNumber } | null` — novo helper `loadCascadedMovementOrigins` faz o JOIN do evento cascateado → evento-pai → sample-pai. Resolve o **pai imediato**; liga-em-liga fica navegável pelo link.
- **B3.7 — Enrichment de `activeBlends`.** `findActiveBlendsContainingOrigin` passou a selecionar `declared_owner`/`declared_harvest` da liga; `ActiveBlendDetail` ganhou os 2 campos. A seção "Comprometida em N ligas ativas" e o `SampleInvalidateBlockedModal` deixaram de mostrar `—` e passaram a exibir dono/safra reais. Sem migration.

**Quality gates** (cada sub-fase um commit): ✅ lint, format:check, typecheck, build, test:contracts (20/20), test:unit (180/180), test:integration:db (198/198).

**Commits**: `feat(samples): liga B3.6 — trace de cascata no movimento de origem` · `feat(samples): liga B3.7 — dono e safra da liga em activeBlends`.

**Plano da Liga concluído** — todas as fases (Waves A, B, C + sub-fases B3.x) implementadas. B3.6/B3.7 pendentes de deploy num próximo lote canary.
