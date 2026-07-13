# Playground — Plano de Trabalho

> **Status**: EM ESPECIFICAÇÃO (nenhuma linha de código escrita)
> **Última atualização**: 2026-07-13
> **Prefixo de decisões**: PG (PG1, PG2, ...)
> **Documento centralizado da feature**: conceito, decisões, especificação e fases vivem AQUI.

---

## 1. Conceito e motivação

**Elevator pitch**: o Playground é uma sub-aba da página de Lotes onde o usuário monta, num canvas visual de nodes (estilo n8n), simulações de liga: conecta lotes reais, executa o fluxo e vê as características estimadas do resultado — ou faz o caminho inverso, descreve o resultado desejado e o sistema apresenta as combinações possíveis. Nada do que acontece no Playground grava qualquer coisa no sistema.

**Problema que resolve**: hoje a liga real é um compromisso — criar uma liga consome saldo dos lotes de origem e gera um novo lote que só depois é classificado. Não existe nenhum lugar para _experimentar_ combinações antes de decidir. O Playground é esse laboratório: testar cenários de mistura com os dados reais disponíveis, sem custo e sem risco.

**O que o Playground explicitamente NÃO é**:

- NÃO é um atalho para criar liga, amostra ou evento — não há nenhuma ação de escrita no domínio.
- NÃO é a tela de criação de liga existente (leque "+" de /samples) nem a substitui.
- NÃO é um relatório/dashboard — é uma ferramenta interativa de exploração.
- NÃO promete o resultado real da classificação: a liga real é classificada do zero por classificador humano; o Playground entrega uma **estimativa** (ver §2, princípio P2).

## 2. Princípios

| #   | Princípio                                                                                                                                                                                                             | Consequência prática                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Zero escrita no domínio.** O Playground nunca cria Sample, SampleEvent, movimento ou qualquer registro de negócio.                                                                                                  | Backend só com endpoints read-only (ou reuso dos existentes). Nenhum botão "salvar como liga" na v1 (ver estacionamento §3.3).                 |
| P2  | **Resultado é estimativa, não promessa.** No sistema real a liga nasce sem classificação e é classificada do zero; o motor do Playground é uma projeção matemática nova.                                              | A UI comunica sempre "estimado/simulado". Nenhuma tela do Playground pode ser confundida com laudo.                                            |
| P3  | **Fluidez em primeiro lugar.** Referência de experiência: n8n — arrastar, conectar, desconectar, executar, reorganizar sem fricção.                                                                                   | Interações do canvas (pan, zoom, drag, connect) devem ser nativas e responsivas; escolha técnica da lib é decisão de primeira grandeza (Q-T1). |
| P4  | **Dados reais, somente leitura.** As simulações usam os lotes reais e seus saldos/classificações vigentes.                                                                                                            | Fonte de dados = mesmas projeções que alimentam /samples; respeita saldo disponível (`availableSacks`).                                        |
| P5  | **Página visualmente livre.** O Playground pode divergir da linguagem visual das demais páginas ("totalmente diferente de qualquer outra página"), mantendo apenas o mínimo de coerência (header/navegação da casca). | O canvas não precisa seguir o design-system de cards/listas; tokens de cor/tipografia base ainda valem como ponto de partida.                  |

## 3. Escopo

### 3.1 Dentro do escopo (v1 — sujeito às fases do §10)

- Sub-aba "Playground" na página de Lotes (/samples).
- Canvas de workflow com nodes: adicionar, mover, conectar, desconectar, remover, executar.
- **Fluxo direto**: nodes de lotes reais → node de mistura → node de resultado com características estimadas.
- **Fluxo inverso**: node de especificação-alvo (características desejadas) → execução → sistema apresenta combinações possíveis de lotes reais que atendem à especificação.
- Motor de estimativa das características resultantes (§4.6).
- Seleção de lotes reais com busca/filtro dentro do canvas (picker no node de lote).

### 3.2 Fora do escopo (explícito)

- Criar liga/amostra/evento a partir do Playground (qualquer escrita).
- Editar dados de lotes reais.
- Persistir workflows no servidor (ver Q-P1 sobre persistência local).
- Compartilhar/exportar workflows entre usuários.
- Precificação/valores financeiros na simulação (não citado; se surgir, vira decisão).

### 3.3 Estacionamento (ideias futuras, sem compromisso)

- Botão "levar para liga real": pré-preencher o fluxo real de criação de liga com a composição simulada (quebraria P1 se mal feito; exige decisão explícita).
- Salvar/nomear cenários de simulação.
- Comparação lado a lado de dois cenários.
- Simulação de custo/preço da liga.

## 4. Especificação funcional

> Convenção: itens marcados **[PROPOSTA]** ainda não foram confirmados pelo usuário e constam na seção 9 (questões abertas). O que já está travado referencia a decisão PGn.

### 4.1 Canvas

- Superfície infinita com pan e zoom; nodes arrastáveis; conexões (edges) criadas arrastando de uma porta de saída para uma porta de entrada, e removíveis (PG2).
- Paleta/menu para adicionar nodes ao canvas.
- Botão **Executar** que roda o workflow montado e materializa os resultados nos nodes de saída (PG2).
- Estados visuais mínimos: node incompleto (falta configurar), node pronto, node com erro de validação (ex.: sacas acima do saldo), resultado calculado.
- **[PROPOSTA]** Validações ao vivo nas conexões (ex.: não conectar resultado→lote) no estilo n8n.

### 4.2 Catálogo de nodes **[PROPOSTA — estrutura inicial para discussão]**

| Node                   | Papel                                                        | Entradas | Saídas | Configuração                                                                                                         |
| ---------------------- | ------------------------------------------------------------ | -------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| **Lote**               | Fonte: um lote real                                          | —        | 1      | Picker de lote real (busca por número/dono/safra); quantidade de sacas a contribuir (máximo = `availableSacks`, PG8) |
| **Mistura**            | Combina 2+ entradas                                          | N        | 1      | — (a proporção vem das sacas configuradas nos nodes de entrada)                                                      |
| **Resultado**          | Exibe características estimadas da liga simulada             | 1        | —      | —                                                                                                                    |
| **Especificação-alvo** | Descreve o resultado desejado (fluxo inverso)                | —        | 1      | Formulário de características-alvo (tipo, peneiras, bebida, quantidade de sacas etc.)                                |
| **Combinações**        | Saída do fluxo inverso: lista de combinações reais possíveis | 1        | —      | Limites da busca (nº máx. de lotes por combinação etc.)                                                              |

- Mistura aceita liga simulada como entrada de outra mistura? (cascata dentro do canvas — Q-F4).

### 4.3 Fluxo direto (lotes → resultado)

1. Usuário adiciona nodes **Lote**, escolhe os lotes reais e as sacas contribuídas de cada um.
2. Conecta os lotes num node **Mistura** e este num node **Resultado**.
3. **Executar**: o motor (§4.6) calcula e o node Resultado exibe as características estimadas + composição (proporções) + total de sacas.
4. Regras herdadas do domínio real:
   - Sacas contribuídas ≤ saldo disponível do lote: **limite rígido** — o campo trava em `availableSacks` (PG8).
   - Safra do resultado = união das safras distintas (regra real de `deriveBlendHarvest`).
   - Proprietário = unanimidade ou "misto" (regra real de `deriveBlendOwner`).

### 4.4 Fluxo inverso (especificação → combinações)

1. Usuário adiciona node **Especificação-alvo** e preenche as características desejadas (subconjunto dos campos do §4.6 + quantidade de sacas desejada).
2. Conecta num node **Combinações** e executa.
3. O sistema busca, entre os lotes reais com saldo, combinações cuja estimativa de mistura atenda à especificação dentro de uma tolerância, e apresenta as melhores (composição + proporções + aderência ao alvo).
4. Pontos em aberto que definem o algoritmo: quais campos são filtráveis como alvo, tolerância, nº máximo de lotes por combinação, critério de ordenação, limite computacional (Q-F5 a Q-F8).

### 4.5 Execução

- Execução é sob demanda (botão), estilo n8n (PG2). **[PROPOSTA]** re-execução automática leve quando um node muda depois de já executado, com indicador de "resultado desatualizado" (Q-F3).
- O fluxo direto é computável instantaneamente; o inverso é uma busca combinatória e pode precisar de endpoint dedicado (Q-T2).

### 4.6 Motor de estimativa **[PROPOSTA — modelo matemático a validar com o usuário]**

Fato do domínio: hoje **nada** no sistema calcula características de liga a partir dos componentes — só safra (união) e proprietário (unanimidade) são derivados (`src/samples/blend-harvest.js`). O motor abaixo é novo e exclusivo do Playground.

Proposta inicial, com peso = proporção de sacas de cada componente:

| Característica                                                | Fonte no lote                       | Regra de combinação proposta                                                      |
| ------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| Peneiras (p18…p10, mk)                                        | `latestClassificationData.peneiras` | Média ponderada por sacas, campo a campo                                          |
| Densidade                                                     | `latestDensity`                     | Média ponderada                                                                   |
| Defeitos (catação, PVA, broca, GPI, aproveitamento, impureza) | `latestClassificationData.defeitos` | Média ponderada dos numéricos; texto livre não combina                            |
| Tipo (BICA/PREPARADO/…)                                       | `classificationType`                | Dominante por peso; empate/mistura → exibir composição ("70% BICA / 30% CONILON") |
| Bebida                                                        | `latestClassificationData.bebida`   | Sem média possível: exibir composição por peso; **pior bebida domina?** (Q-F9)    |
| Cor/aspecto                                                   | `latestClassificationData.aspecto`  | Idem bebida (categórico)                                                          |
| Safra                                                         | `declaredHarvest`                   | União distinta concatenada (regra real)                                           |
| Proprietário                                                  | `ownerClientId`                     | Unanimidade ou "misto" (regra real)                                               |
| Sacas totais                                                  | soma das contribuições              | Soma (regra real)                                                                 |

- Lote de entrada **sem classificação**: bloqueia? entra com lacunas ("características parciais")? (Q-F10)
- O resultado sempre carrega o selo "estimativa" (P2).

## 5. UX e design

- **Onde vive**: /samples ganha estrutura de sub-abas; molde técnico = padrão `.cad-tabs` de `app/contratos/page.tsx` (`?tab=` como fonte de verdade, `role="tablist"`). A lista atual de Lotes vira a aba default; "Playground" é a segunda aba (PG1). Nomes das abas: Q-U1.
- **Identidade**: página deliberadamente diferente do resto do sistema (P5). Canvas com estética própria; referência de fluidez: n8n.
- **Desktop vs mobile**: v1 é **desktop-only** (PG7). No mobile a aba existe, mas exibe um estado vazio elegante ("o Playground foi feito para telas grandes"); nenhuma tentativa de canvas touch na v1.
- Feedbacks (toasts/erros) seguem a skill `feedback-messages`; botões seguem `button-press-effect` mesmo dentro do canvas.

## 6. Acesso e papéis

- **Mesmos papéis que veem /samples** (PG6): quem acessa a lista de Lotes acessa o Playground. Nenhum gate novo de papel; o Playground não expõe nada que a lista não exponha (características + saldo).

## 7. Arquitetura técnica

### 7.1 Fatos do domínio (código real, verificado em 2026-07-13)

- Liga real = `Sample` com `isBlend=true`; composição em `SampleBlendComponent` (`sampleId`, `originSampleId`, `contributedSacks Int` — sacas inteiras; proporção é implícita). `prisma/schema.prisma:293,329-349`.
- Criação real: `SampleCommandService.createBlend()` (`src/samples/sample-command-service.js:1751-1990`) — consome saldo, valida `contributedSacks ≤ availableSacks`, deriva safra (união, `blend-harvest.js:26-39`) e dono (unanimidade, `blend-harvest.js:52-63`), emite eventos. **O Playground não toca em nada disso.**
- Saldo: `availableSacks = max(0, declaredSacks − soldSacks − lostSacks)` (`sample-query-service.js:736-739`).
- Classificação: **fonte única** = JSON `latestClassificationData` + `classificationType` no `Sample` (os espelhos técnicos `latest_type/screen/defects_count/density/color_aspect/notes` foram DROPADOS em 2026-07-13 na auditoria CL — ver `docs/Classificacao-Visao-Geral.md`); estrutura canônica em `lib/classification-form.ts` (peneiras p18…p10+mk, fundos, defeitos, bebida, aspecto, padrão, catação, certif). Enum `ClassificationType` = BICA/PREPARADO/BAIXO/ESCOLHA/CONILON.
- Liga real **não** deriva classificação dos componentes — nasce `REGISTRATION_CONFIRMED` e é classificada do zero.

### 7.2 Direções propostas **[PROPOSTA]**

- **Fonte de dados**: endpoint read-only para o picker de lotes e características (reusar a query/projeção da lista de /samples, incluindo `latestClassificationData` + `availableSacks`); nenhuma escrita.
- **Fluxo direto**: cálculo 100% client-side (dados já carregados nos nodes) — sem backend novo.
- **Fluxo inverso**: busca combinatória server-side, endpoint read-only dedicado (ex.: `POST /api/v1/samples/playground/combinations` recebendo a especificação-alvo e devolvendo combinações) — Q-T2 define os limites.
- **Lib de canvas**: **React Flow (@xyflow/react)** — decidido (PG5). Nada de canvas/drag-drop existia no projeto (front é CSS puro + React 19); React Flow entra como dependência nova, MIT, mesma família de UX do n8n, carregada lazy só ao abrir a aba.
- **Persistência do rascunho**: nada no servidor; avaliar `localStorage`/`sessionStorage` para o canvas sobreviver a refresh (Q-P1).
- **Código**: aba nova como componente próprio (ex.: `components/playground/`), lazy-loaded para não pesar a lista de Lotes (a lib de canvas só carrega ao abrir a aba).

## 8. Ledger de decisões

| #   | Decisão                                                                                                                                                                 | Motivo                                                                                                                 | Data       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| PG1 | O Playground é uma **sub-aba da página de Lotes** (/samples), não uma rota própria de topo.                                                                             | Ideia original do usuário: laboratório junto dos lotes.                                                                | 2026-07-13 |
| PG2 | Formato de **canvas de workflow com nodes** (referência de fluidez: n8n): adicionar/conectar/desconectar nodes e executar o workflow.                                   | Experiência intuitiva e exploratória, diferente das demais páginas.                                                    | 2026-07-13 |
| PG3 | **Nenhuma escrita no domínio**: sem criação de amostras, ligas, eventos ou movimentos. Puramente simulação sobre dados reais.                                           | Definição do usuário: página de testes, sem risco.                                                                     | 2026-07-13 |
| PG4 | **Dois fluxos**: direto (lotes existentes → características estimadas do resultado) e inverso (características desejadas → sistema apresenta as combinações possíveis). | Definição do usuário.                                                                                                  | 2026-07-13 |
| PG5 | Canvas construído com **React Flow (@xyflow/react)**, carregado lazy só na aba Playground.                                                                              | Fluidez estilo n8n pronta (pan/zoom/edges/drag); construir caseiro custaria caro para o mesmo resultado. Resolve Q-T1. | 2026-07-13 |
| PG6 | Acesso: **mesmos papéis que veem /samples** — quem vê a lista de Lotes vê o Playground.                                                                                 | Não expõe dado novo (características + saldo já aparecem na lista). Resolve Q-A1.                                      | 2026-07-13 |
| PG7 | Mobile v1: **desktop-only com aviso** — a aba existe no mobile mas mostra estado vazio elegante ("feito para telas grandes"); canvas só no desktop.                     | Canvas de nodes com dedo em tela pequena é frustrante; adaptação touch fica para fase futura. Resolve Q-U2.            | 2026-07-13 |
| PG8 | Saldo é **limite rígido** na simulação: o campo de sacas do node Lote trava em `availableSacks` — não se simula com sacas que não existem.                              | Toda simulação deve ser executável na prática. Resolve Q-F2.                                                           | 2026-07-13 |

## 9. Questões abertas

Cada item resolvido vira decisão PGn no §8.

### Funcionais

- **Q-F1** — Catálogo de nodes (§4.2): os 5 nodes propostos bastam para a v1? Nomes bons em pt-BR?
- ~~Q-F2~~ — resolvida → **PG8** (saldo é limite rígido).
- **Q-F3** — Execução: só manual (botão) ou com re-execução automática ao editar depois da primeira execução?
- **Q-F4** — Mistura em cascata dentro do canvas (resultado de uma mistura entra em outra)? O domínio real permite liga de liga, então a simulação tende a permitir também.
- **Q-F5** — Fluxo inverso: quais campos a especificação-alvo aceita na v1 (tipo? bebida? faixa de peneira? % catação máx.? sacas mínimas?)?
- **Q-F6** — Fluxo inverso: tolerância de aderência (exato vs "próximo o suficiente") e como comunicar o quão perto cada combinação chegou.
- **Q-F7** — Fluxo inverso: nº máximo de lotes por combinação sugerida (2? 3? configurável no node?).
- **Q-F8** — Fluxo inverso: ordenação das sugestões (melhor aderência? menor nº de lotes? maior aproveitamento de saldo?).
- **Q-F9** — Motor: campos categóricos (bebida, cor/aspecto) — exibir composição por peso, ou adotar regra "pior domina"?
- **Q-F10** — Motor: lote sem classificação entra na simulação (com resultado parcial) ou é inelegível?

### UX

- **Q-U1** — Nomes das sub-abas de /samples (ex.: "Lotes" + "Playground"? "Lista" + "Playground"?).
- ~~Q-U2~~ — resolvida → **PG7** (desktop-only com aviso no mobile).

### Acesso

- ~~Q-A1~~ — resolvida → **PG6** (mesmos papéis de /samples).

### Técnicas

- ~~Q-T1~~ — resolvida → **PG5** (React Flow).
- **Q-T2** — Fluxo inverso server-side: limites computacionais (nº de lotes candidatos considerados, timeout, paginação de sugestões).
- **Q-P1** — Persistência local do canvas (localStorage) para sobreviver a refresh: sim/não na v1?

## 10. Fases de implementação **[RASCUNHO — congela após fechar as questões do §9]**

| Fase | Entrega                                                                                                                                                                                  | Critério de pronto                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F1   | **Casca**: /samples vira página com sub-abas (lista atual = default), aba Playground com canvas vazio funcional (pan/zoom, adicionar/mover/conectar/remover nodes sem lógica de negócio) | Gates verdes; lista de Lotes intacta (zero regressão); canvas fluido no desktop     |
| F2   | **Fluxo direto**: nodes Lote (picker real) + Mistura + Resultado; motor de estimativa; executar                                                                                          | Estimativa correta em testes unitários do motor; validação manual de cenários reais |
| F3   | **Refinamento da execução**: estados visuais, validações de conexão, avisos de saldo, resultado desatualizado                                                                            | Checklist de UX do §4.1 completo                                                    |
| F4   | **Fluxo inverso**: node Especificação-alvo + Combinações + endpoint read-only de busca                                                                                                   | Combinações coerentes em dataset real; limites de custo computacional respeitados   |
| F5   | **Polimento**: mobile (conforme Q-U2), acessibilidade, performance com muitos nodes, ajustes de identidade visual                                                                        | Validação no device pelo usuário (📱)                                               |

- Cada fase = commits atômicos + gates completos (lint, format, typecheck, build, unit; integração quando tocar backend).
- Nada é ✅ sem validação no device (convenção do projeto).

## 11. Validação e testes

- **Motor de estimativa** (fluxo direto): testes unitários puros — combinações de peneiras/densidade/defeitos, pesos, lotes sem classificação, categóricos. É a peça mais testável da feature.
- **Busca de combinações** (fluxo inverso): testes unitários do algoritmo + teste de integração read-only do endpoint (sem escrita, não afeta o event store).
- **Canvas/UX**: sem testes automatizados de browser (convenção do projeto: visual é validado pelo usuário no device); gates padrão cobrem o resto.
- **Garantia de P1 (zero escrita)**: revisão de código + ausência de qualquer chamada de comando; nenhum teste de integração deve detectar evento novo originado do Playground.

## 12. Changelog do documento

| Data       | Mudança                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-13 | Criação do documento: conceito, princípios, escopo, especificação inicial, PG1–PG4, questões abertas Q-F1…Q-P1, fases em rascunho.                                       |
| 2026-07-13 | PG5–PG8 decididas (React Flow; acesso = papéis de /samples; mobile desktop-only com aviso; saldo é limite rígido). Q-T1/Q-A1/Q-U2/Q-F2 fechadas; seções 4–7 atualizadas. |
