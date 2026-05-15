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

**Q0.3 — A liga é reversível via evento (`BLEND_REVERTED`).**
- A liga pode ser desfeita: novo evento mutante `BLEND_REVERTED` invalida a liga (`status: INVALIDATED`) e restaura saldo das origens (decrementa `blendedSacks` das origens).
- Restrição idêntica à invalidação de sample hoje: só permitido se a liga **não tem** venda/perda registrada (`soldSacks == 0 AND lostSacks == 0` na própria liga).
- **Implicação**: novos eventos no `SampleEventType` (provavelmente `BLEND_CREATED`, `BLEND_REVERTED`); regras de OCC e idempotência aplicáveis.

**Q0.4 — Unidade de sacas continua Int em todo lugar.**
- `declaredSacks`, `soldSacks`, `lostSacks`, `blendedSacks` e `contributedSacks` (na tabela de composição) todos permanecem `Int`.
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
  - **Liga** — entra em **modo seleção** na própria página `/samples`.
- Distância visual: as 2 opções aparecem em arco ao redor do "+" (a definir ângulos/posição exatos no momento da implementação).
- **Implicação**: o FAB hoje é `<SampleQuickCreateFab onClick={() => setNewSampleModalOpen(true)}>`. Vai precisar virar um componente novo com estado interno aberto/fechado e renderizar 2 botões satélite quando aberto. Outras páginas (ex: `/clients`) continuam com FAB simples (criação de cliente único — comportamento de hoje).

**F1.1 — Modo seleção múltipla na lista de amostras.**
- Após o usuário escolher "Liga", a página `/samples` entra em **modo seleção**: cada card de amostra ganha um checkbox (ou estado visual selecionado), o clique no card muda comportamento padrão (em vez de abrir detalhe, marca/desmarca a amostra na seleção).
- A busca existente no header continua funcionando (pesquisa por lote, dono, etc.) — selecionados ficam preservados entre buscas/filtros.
- Indicador permanente de quantos itens estão selecionados (ex: barra/footer flutuante com "N selecionadas · Continuar").
- Como sair do modo seleção: botão "Cancelar" no topo da lista (que desfaz a seleção e volta a página ao estado normal) + botão "Continuar" (que segue pro próximo passo com o que está selecionado).
- **Implicação**: novo estado em `/samples/page.tsx` (`selectionMode: 'idle' | 'blend'`); cards reagem ao modo; tabbar e gestos default (abrir detalhe) ficam desabilitados temporariamente.

**F1.2 — Sem restrição de role: todos podem criar liga.**
- Não há permissão diferenciada. Qualquer usuário autenticado consegue iniciar fluxo de criação de liga. Mesma regra do "Nova amostra" hoje.
- **Implicação**: backend não rejeita por role, só por status da sessão.

**F1.3 — Próximo passo do fluxo: formulário do novo lote.**
- Depois de "Continuar", abre um modal/sheet com formulário do novo lote (campos a decidir nas próximas rodadas).
- Provavelmente reusa o padrão `BottomSheet` cabeçalho verde (mesmo do "Nova amostra") pra coerência visual.

**F1.4 — Elegibilidade: só amostras CLASSIFIED com saldo disponível.**
- Aparece como selecionável na lista durante o modo seleção apenas quem atende: `status = CLASSIFIED AND availableSacks > 0 AND status != INVALIDATED`.
- Como `availableSacks = declaredSacks - soldSacks - lostSacks - blendedSacks`, amostras totalmente vendidas/perdidas/ligadas naturalmente saem da seleção.
- **Implicação**: backend ganha filtro `eligibleForBlend: true` em `listSamples` (ou variante de endpoint). Frontend mostra amostras inelegíveis acinzentadas (e desabilita o checkbox) pra dar contexto ao operador, com tooltip explicando o motivo (ex: "Aguardando classificação", "Sem saldo disponível", "Inválida").

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

**F2.1 — UX: input numérico simples com saldo disponível ao lado.**
- Cada amostra selecionada vira uma linha no formulário: `[Lote 5658 · Cliente X · 80 disp.] [input: __ sc]`.
- Saldo disponível (`availableSacks`) mostrado claramente como referência. Operador digita quantas sacas dali entram na liga.
- Sem slider, sem botões +/-, sem atalho "usar tudo" — input puro mantém a UI limpa e a entrada precisa.
- **Implicação**: cada linha do form vincula uma `originSampleId` ao `contributedSacks: Int`. Validação inline: input rejeita não-números, valores ≤ 0, e valores acima de `availableSacks` da origem.

**F2.2 — Default: vazio, operador preenche cada um.**
- Nenhum pré-preenchimento (nem 0, nem `availableSacks`).
- Botão "Continuar/Confirmar" do próximo passo fica desabilitado até **todas** as contribuições terem valor positivo válido.
- **Implicação**: força reflexão consciente, evita "click feliz" combinando volumes que o operador não queria.

**F2.3 — `declaredSacks` da liga: soma automática das contribuições.**
- O campo `declaredSacks` do `Sample` resultante (a liga) é = `Σ contributedSacks`.
- UI mostra a soma rodando ao lado/abaixo do formulário (ex: "Total da liga: 130 sc") atualizada em tempo real.
- Sem campo manual editável pra `declaredSacks` da liga. Garante invariante: o que entrou é o que existe.
- **Implicação**: backend valida `liga.declaredSacks == Σ component.contributedSacks` na criação. Se diverge, rejeita.

### Bloco F3 — Formulário do novo lote (campos próprios da liga)

**F3.1 — Dono da liga: operador escolhe livremente, podendo deixar nulo.**
- Campo `ownerClientId` no formulário com autocomplete (mesmo `ClientLookupField` do "Nova amostra"), mas **opcional** — operador pode deixar vazio quando a liga é "carteira da corretora" até ser vendida.
- Reflete realidade operacional: lote ligado fica em estoque interno enquanto não tem comprador definido.
- **Implicação**: backend já aceita `ownerClientId: null` no Sample (campo é `String?` no Prisma). Sem mudança de schema. UI mostra o ClientLookupField marcado "Opcional" e label "Dono (se houver)".

**F3.2 — Safra: operador sempre digita manualmente, sem pré-preenchimento.**
- Campo `declaredHarvest` vazio por default. Operador informa explicitamente (formato livre, ex: `25/26`, `MISTA`, `2024-2025`).
- Sem auto-derivação da "safra dominante" — mesmo se todas as origens têm a mesma safra, operador re-digita conscientemente.
- **Implicação**: validação mantém o mesmo do Sample normal (string obrigatória, não-vazia). UI mostra o input com placeholder mas sem valor inicial.

**F3.4 — `classificationType` nulo até a classificação oficial.**
- Liga nasce em `status = REGISTRATION_CONFIRMED` com `classificationType = null` — mesmo path de um Sample normal.
- Só vira `BICA`/`PREPARADO`/`BAIXO`/`ESCOLHA` quando o operador finaliza a classificação oficial da liga (fluxo padrão de classificação via ficha + foto + extração IA).
- Sem antecipação na criação — café ainda não foi analisado quando a liga é formada.
- **Implicação**: nenhuma mudança no modelo. Liga reusa exatamente o lifecycle de classificação do Sample normal.

**F3.3 — `declaredOwner` (string) também nulo quando `ownerClientId` é nulo.**
- Sem texto fallback ("Corretora" descartado). Schema já permite (`declaredOwner: String?`).
- Listagens mostram "—" ou "Sem dono" pra liga sem cliente atribuído.
- **Implicação**: `declaredOwner` segue regra atual: derivado de `selectedOwnerClient?.displayName ?? null`. Se cliente é null, owner também.

**F3.5 — `declaredOriginLot` oculto do formulário, fica nulo no banco.**
- Em liga, "origem" é a composição (`SampleBlendComponent`) — não faz sentido um campo de texto livre. Visualmente, a origem aparece em outro lugar (lista de componentes na tela de detalhe).
- **Implicação**: campo não aparece no form da liga. Backend grava `declaredOriginLot: null` na criação. Telas de detalhe (que hoje mostram `declaredOriginLot`) precisam ser ajustadas pra renderizar a composição em vez do campo (em ligas).

**F3.6 + F3.7 + F3.8 — Local e Observações opcionais (igual Sample). `receivedChannel` = `in_person` silencioso.**
- `declaredLocation`: campo opcional no formulário, idêntico ao Sample (operador preenche se quiser indicar onde a liga vai ficar fisicamente).
- `notes`: campo opcional, idêntico ao Sample.
- `receivedChannel`: **não aparece na UI**. Backend usa `'in_person'` por default pra satisfazer schema (Sample exige valor). Liga não "chega" — é gerada internamente, mas pra evitar migration no enum optamos por valor neutro.
- **Implicação**: sem mudança no enum. UI da liga só mostra Local e Obs como opcionais. Caso futuramente queiramos diferenciar formalmente, basta adicionar `'internal'` no enum (migration aditiva, baixo custo).

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

**Resumo do formulário do novo lote (consolidado):**

| Campo | Visível no form? | Obrigatório? | Default |
|---|---|---|---|
| Dono (`ownerClientId` + `declaredOwner`) | Sim (autocomplete) | Não | Vazio |
| Safra (`declaredHarvest`) | Sim (input texto) | Sim | Vazio |
| Local (`declaredLocation`) | Sim (input texto) | Não | Vazio |
| Observações (`notes`) | Sim (textarea) | Não | Vazio |
| Sacas (`declaredSacks`) | Mostrado (read-only "Total: N sc") | — | Soma das contribuições |
| Lote de origem (`declaredOriginLot`) | Não | — | `null` |
| Tipo de classificação (`classificationType`) | Não | — | `null` (vira após classif. oficial) |
| Recebido por (`receivedChannel`) | Não | — | `'in_person'` silencioso |

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
- [x] **F1.0** — Ponto de entrada: FAB radial na `/samples` com 2 opções (Unidade / Liga).
- [x] **F1.1** — Modo seleção múltipla na lista, com busca preservando seleção e footer "N selecionadas · Continuar".
- [x] **F1.2** — Sem restrição de role: todos podem criar liga.
- [x] **F1.3** — Próximo passo abre formulário do novo lote (campos a decidir).
- [x] **F1.4** — Elegíveis: só `CLASSIFIED` com `availableSacks > 0` e não-`INVALIDATED`. Inelegíveis aparecem acinzentadas com tooltip explicando.
- [x] **F1.5** — Sim, pode misturar clientes diferentes.
- [x] **F1.6** — Sim, pode misturar safras diferentes.
- [x] **F1.7** — Mínimo 2 amostras, sem máximo (botão Continuar bloqueado se < 2).

**Bloco F1 fechado em 2026-05-15.** ✅

### Bloco F2 — Contribuição por lote
- [x] **F2.1** — UX: input numérico simples + saldo disponível ao lado da linha.
- [x] **F2.2** — Default vazio (operador preenche cada). Botão Continuar bloqueado até todos válidos.
- [x] **F2.3** — `declaredSacks` da liga = soma automática (sem campo manual).

**Bloco F2 fechado em 2026-05-15.** ✅

### Bloco F3 — Formulário do novo lote (em aberto)
- [x] **F3.1** — `ownerClientId` opcional (operador escolhe livre, pode nulo).
- [x] **F3.2** — `declaredHarvest` manual sempre, sem pré-preenchimento.
- [x] **F3.3** — `declaredOwner` nulo se `ownerClientId` nulo (sem fallback texto).
- [x] **F3.4** — `classificationType` nulo até classificação oficial.
- [x] **F3.5** — `declaredOriginLot` oculto do form, nulo no banco (composição em `SampleBlendComponent`).
- [x] **F3.6** — `declaredLocation` opcional no form (igual Sample).
- [x] **F3.7** — `notes` opcional no form (igual Sample).
- [x] **F3.8** — `receivedChannel` = `'in_person'` silencioso (não aparece na UI).

**Bloco F3 fechado em 2026-05-15.** ✅

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
- Mensagem de erro: "Esta amostra contribui pra ligas X, Y. Reverta-as antes de invalidar."
- Evita "ligas zumbis" (origens invalidadas, liga não pode mais ser realizada).
- **Implicação**: validação na rotina de `invalidateSample` (sample-command-service) — adicionar query em SampleBlendComponent.

**F7.3 — Perda da liga: tudo-ou-nada (igual venda).**
- LOSS na liga também usa 100% — mesma lógica que F7.1. Liga é unidade.
- **Implicação**: UI de LOSS quando `isBlend = true` esconde quantidade, força total.

**F7.4 — Origens são afetadas na venda/perda da liga (proporcional à contribuição).**
- Vender liga dispara cascata: cada `SampleBlendComponent` da liga gera um `SALE_CREATED` na origem correspondente, com `quantitySacks = contributedSacks`.
- Perda análoga: cada componente gera `LOSS_RECORDED` na origem com `quantitySacks = contributedSacks`.
- Audit: eventos das origens carregam `causationId` apontando pro evento de venda/perda da liga.
- **Implicação**: nova rotina backend "cascadeSaleToOrigins(blendId, buyerClient, date)" que processa eventos em transação atômica.

**F7.5 — Cascata só atinge origens DIRETAS (1 nível de profundidade).**
- Vender liga decrementa as origens listadas em `SampleBlendComponent` da liga. Se uma dessas origens é por sua vez uma liga, a cascata atinge ela (decrementa seu `soldSacks`), mas **não desce mais**.
- Mecanismo combinado com F7.7 (próxima decisão) garante que cascata permanece 1:1 sem frações.
- **Implicação**: query de cascata é "joinar com SampleBlendComponent onde sampleId = liga atual". Sem recursão CTE no path de venda (CTE permanece pra rastreabilidade visual).

**F7.6 — Validação de saldo na venda da liga: hard block.**
- No clique "Vender liga", backend valida: para cada componente, `origin.availableSacks >= contributedSacks`. Se qualquer origem falhar, retorna erro `409` apontando qual origem está sem saldo ("Origem #5658 tem 30 sc disponíveis, precisa de 50").
- Garante integridade total — impossível overselling.
- **Implicação**: rotina de validação pré-evento em backend. UI mostra o erro inline.

**F7.7 — Contribuição de uma liga em outra liga é sempre 100% (não permite parcial).**
- Resolve o conflito entre Q0.5 (cascata permitida) e F7.1 (venda bloco único).
- Se uma Liga A é selecionada como origem de Liga B, o campo `contributedSacks` é forçado a `Liga A.declaredSacks` (não editável). Liga inteira ou nada.
- Garante: cascata na venda sempre 1:1 (Liga A vendida 100% quando Liga B é vendida) → sem frações, sem `PARTIALLY_SOLD` por cascata.
- Tradeoff aceito: pra usar só parte de uma liga, operador reverte a liga e cria uma menor. UI da F2 (input de contribuição) detecta `isBlend = true` na origem e desabilita o input mostrando "Total: {declaredSacks} sc (liga inteira)".
- **Implicação**: validação no backend (`contributedSacks == origin.declaredSacks` quando `origin.isBlend = true`). UI adapta a apresentação.

**Bloco F7 fechado em 2026-05-15.** ✅

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

### Blocos seguintes (a destrancar após F6 e demais)
- [ ] Fluxo F4 — Preview/classificação prevista (média ponderada das origens)
- [ ] Fluxo F5 — Confirmação e criação (etiqueta, eventos, idempotência)
- [ ] Fluxo F6 — Pós-criação (classificação oficial da liga via fluxo normal)
- [ ] Fluxo F7 — Comercial (venda da liga, perdas)
- [ ] Fluxo F8 — Reversão / invalidação
- [ ] Dashboard e listagens (cards, ícone de liga, filtros)
- [ ] Plano de implementação (fases)

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

**Fase A1 — Schema + eventos novos** (migration aditiva)
- Migration Prisma:
  - Nova tabela `SampleBlendComponent` (`id`, `sampleId` FK → Sample (a liga), `originSampleId` FK → Sample (a origem), `contributedSacks: Int`, `createdAt`).
  - Índices: `(sampleId)` e `(originSampleId)` pra rastreabilidade nas 2 direções.
  - Constraint: `uq_blend_component (sampleId, originSampleId)` — uma origem só aparece 1 vez por liga.
  - Flag `isBlend: Boolean default false` no `Sample` (mais barato que `count(components) > 0` em listagens).
- Enum `SampleEventType` ganha: `BLEND_CREATED`, `BLEND_REVERTED`.
- JSON schemas dos payloads desses eventos em `docs/schemas/events/v1/payloads/`.
- Testes: schema valida, migration roda em DB limpo, eventos passam pelo `event-contract-service`.
- **Sem impacto** em código de produção existente.

**Fase A2 — Services + validações + cascata**
- `sample-command-service.createBlend({ components, blendData, actor })`:
  - Valida componentes (mínimo 2, sem duplicatas, todos `CLASSIFIED`, todos com saldo, F7.7 quando origem é liga).
  - Cria Sample (a liga) com `isBlend = true`, `declaredSacks = Σ contributedSacks`, `classificationType = null`, demais campos do formulário (F3).
  - Cria registros em `SampleBlendComponent`.
  - Emite `REGISTRATION_CONFIRMED` (na liga, idempotência via `idempotencyKey`) + `BLEND_CREATED` (na liga, payload com lista de componentes).
- `sample-command-service.revertBlend({ blendId, reasonText, actor })`:
  - Valida: liga em `REGISTRATION_CONFIRMED` ou `CLASSIFIED`, `soldSacks = 0`, `lostSacks = 0`.
  - Emite `BLEND_REVERTED` (mutante, vira `INVALIDATED`) + `SAMPLE_INVALIDATED` (status). Composição **não** é apagada.
- `sample-command-service.recordSale` / `.recordLoss` ajustadas:
  - Antes de gravar, se `sample.isBlend = true` (F7.4 cascata): para cada `SampleBlendComponent` da liga, valida `origin.availableSacks >= contributedSacks` (F7.6 hard block).
  - Emite eventos em cascata: `SALE_CREATED` (ou `LOSS_RECORDED`) na liga + em cada origem com `quantitySacks = contributedSacks` e `causationId` apontando pro evento da liga.
  - Cascata **só 1 nível** (F7.5) — não desce recursivamente.
- `sample-command-service.invalidateSample` ajustada:
  - Bloqueia se a amostra é `originSampleId` em qualquer `SampleBlendComponent` com `sample (a liga).status != INVALIDATED` (F7.2 revisado).
- Tests: contract + integration cobrindo cascata, validações, edge cases.

**Fase A3 — API endpoints**
- `POST /api/v1/samples/blends` — body: `{ components: [{originSampleId, contributedSacks}], data: {ownerClientId?, harvest, location?, notes?} }` → 201 `{ sampleId, lotNumber }`.
- `POST /api/v1/samples/:id/revert-blend` (ou `DELETE /api/v1/samples/blends/:id` semanticamente) → 200.
- `GET /api/v1/samples` (existente) ganha query param `eligibleForBlend=true` (filtra CLASSIFIED com saldo).
- `GET /api/v1/samples/:id` retorna `components: [...]` quando `isBlend = true`.
- Tests: contract.

### Wave B — Frontend

**Fase B1 — FAB radial + modo seleção em `/samples`**
- Substituir `<SampleQuickCreateFab>` por componente novo `<SampleCreateRadialFab>` que abre 2 opções (Unidade / Liga).
- Opção "Unidade" mantém comportamento atual (abre `NewSampleModal`).
- Opção "Liga" entra em modo seleção em `/samples/page.tsx`: state `selectionMode: 'idle' | 'blend'`, cards com checkbox, footer flutuante "N selecionadas · Continuar / Cancelar".
- Itens inelegíveis (`!CLASSIFIED` ou `availableSacks === 0`) renderizam acinzentados com tooltip explicando.
- Bloqueio "Continuar" se < 2.
- API `listSamples` chamada com `eligibleForBlend=true` durante o modo seleção pra simplificar UX.

**Fase B2 — Formulário de criação + sucesso**
- Componente novo `<BlendCreateBottomSheet>` (estrutura similar ao `NewSampleModal`, padrão Q.cls/visual existente):
  - Cabeçalho verde "Nova liga".
  - Lista de origens selecionadas com input de `contributedSacks` por linha + saldo disponível mostrado (F2.1, F2.2 default vazio).
  - F7.7: input desabilitado e fixo = `declaredSacks` quando origem é liga (mostra "Liga inteira: {N} sc").
  - Form do novo lote: dono (autocomplete opcional), safra (obrigatório), local (opcional), obs (opcional), total read-only.
  - Botão "Criar liga" → chama `createBlend` → recebe novo Sample.
- Reusa `<SampleCreatedSuccessModal>` com prop nova `entity?: 'sample' | 'blend'` (default `'sample'`): troca textos ("Liga criada", "Ir para liga", "Criar outra liga").
- "Criar outra liga" → fecha modal, retorna `/samples` em estado neutro (FAB fechado, sem modo seleção).

**Fase B3 — Badge + detalhe da liga + reversão**
- Componente `<BlendBadge />` em `components/samples/`: badge "Liga" + ícone (SVG de merge/junção). Estilo discreto.
- Listagens (`/samples`, dashboard, etc): renderiza `<BlendBadge>` quando `sample.isBlend`.
- Tela de detalhe (`/samples/[id]`): seção nova "Composição" quando `isBlend`, listando origens (lot number + cliente + contribuição). Preservada visualmente mesmo se `status === INVALIDATED` (F8.3).
- Botão "Reverter liga" no detalhe (visível se `isBlend && status !== INVALIDATED && soldSacks === 0 && lostSacks === 0`).
- Modal de confirmação de reversão: padrão `.app-confirm-modal`, campo `reasonText` opcional (F8.2), botão "Reverter" vermelho.

**Fase B4 — Venda/perda da liga (UI ajustada)**
- Modal `SampleMovementModal` (venda/perda existente) ajustado: quando `sample.isBlend = true`, esconde campo `quantitySacks` e mostra "Vai vender 100% = {availableSacks} sc".
- Pré-validação visual: antes de habilitar "Confirmar", busca saldo das origens (via `getSample` com `components`); origens com saldo insuficiente exibem warning inline com nome + faltante.
- Backend faz hard block, mas UI antecipa o problema.

### Wave C — Release

**Fase C1 — Tests + smoke + deploy canary → prod**
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
