# Playground — Plano de Trabalho

> **Status**: PROTÓTIPO IMPLEMENTADO (2026-07-13) — decisões PG1–PG38 fechadas; casca + canvas + mocks + motor stub em código (ver nota no §10); **fluxo inverso REMOVIDO do sistema (PG38, 2026-07-14)** — re-entra num futuro distante; pendentes deliberados: Q-F11, DEP-1; 🖥️ validação visual pendente
> **Última atualização**: 2026-07-14
> **Prefixo de decisões**: PG (PG1, PG2, ...)
> **Documento centralizado da feature**: conceito, decisões, especificação e fases vivem AQUI.

---

## 1. Conceito e motivação

**Elevator pitch**: o Playground é uma sub-aba da página de Lotes onde o usuário monta, num canvas visual de nodes (estilo n8n), simulações de liga: conecta lotes reais, executa o fluxo e vê as características estimadas do resultado. Nada do que acontece no Playground grava qualquer coisa no sistema. (O caminho inverso — descrever o resultado desejado e receber combinações possíveis — fazia parte do conceito original, mas foi **removido do sistema pela PG38**; fica no estacionamento §3.3 para um futuro distante.)

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
- Motor de estimativa das características resultantes (§4.6).
- Seleção de lotes reais com busca/filtro dentro do canvas (picker no node de lote).

### 3.2 Fora do escopo (explícito)

- Criar liga/amostra/evento a partir do Playground (qualquer escrita).
- Editar dados de lotes reais.
- Persistir workflows no servidor (ver Q-P1 sobre persistência local).
- Compartilhar/exportar workflows entre usuários.
- Precificação/valores financeiros na simulação (não citado; se surgir, vira decisão).

### 3.3 Estacionamento (ideias futuras, sem compromisso)

- **Fluxo inverso** (especificação-alvo → combinações de lotes): **removido do sistema pela PG38 (2026-07-14)** — implementação fica para um futuro distante. A especificação desenhada (PG19–PG22, Q-T2/busca por semelhança) segue preservada no §4.4 como referência.
- Botão "levar para liga real": pré-preencher o fluxo real de criação de liga com a composição simulada (quebraria P1 se mal feito; exige decisão explícita).
- Salvar/nomear cenários de simulação.
- Comparação lado a lado de dois cenários.
- Simulação de custo/preço da liga.

## 4. Especificação funcional

> Convenção: itens marcados **[PROPOSTA]** ainda não foram confirmados pelo usuário e constam na seção 9 (questões abertas). O que já está travado referencia a decisão PGn.

### 4.1 Canvas

- Superfície infinita com pan e zoom; nodes arrastáveis; conexões (edges) criadas arrastando de uma porta de saída para uma porta de entrada, e removíveis (PG2).
- **Adicionar nodes (PG26)**: paleta lateral colapsável com os nodes do catálogo (arrasta pro canvas ou clica) **e** arrastar de uma porta de saída para o vazio abre o menu de nodes compatíveis no ponto, já conectando (`onConnectEnd` do React Flow) — o gesto-assinatura do n8n.
- **Botão de execução (PG28 + PG36)**: pill flutuante na **base central do canvas**, rótulo **"▶ Executar"** — molde do "Test workflow" do n8n. Roda o workflow e materializa os resultados nos nodes de saída (PG2).
- **Controles (PG31)**: botões de zoom +/− e "enquadrar tudo" (Controls do React Flow) num canto; **sem MiniMap** na v1. Pan/zoom por mouse/trackpad sempre ativos.
- **Estado vazio (PG33)**: dica central discreta ("Arraste um Lote da paleta para começar") com a paleta já aberta; some ao primeiro node adicionado.
- Estados visuais mínimos: node incompleto (falta configurar), node pronto, node com erro de validação (ex.: sacas acima do saldo), resultado calculado.
- **Validação de conexões (PG32)**: conexão inválida (ex.: Resultado→Lote; lote duplicado na mesma Mistura — PG16) é **recusada no ato de soltar**, com feedback visual imediato (edge que se desfaz + mensagem curta). Erros de configuração (ex.: sacas > saldo) aparecem como estado de erro no próprio node — que é onde o saldo disponível é revelado quando o input do node mínimo (PG29) estoura o teto.

### 4.2 Catálogo de nodes (PG15, reduzido pela PG38 — 3 nodes)

| Node          | Papel                                            | Entradas | Saídas | Configuração                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------ | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lote**      | Fonte: um lote real                              | —        | 1      | **Busca embutida no node** (PG30): campo inline com dropdown paginado (listagem real, `statusGroup=CLASSIFIED` — PG9). Configurado, o node fica **mínimo** (PG29): número do lote + input de sacas (máximo = `availableSacks` físico, PG8+PG10); dono/saldo/safra no hover |
| **Mistura**   | Combina 2+ entradas                              | N        | 1      | — (a proporção vem das sacas configuradas nos nodes de entrada)                                                                                                                                                                                                            |
| **Resultado** | Exibe características estimadas da liga simulada | 1        | —      | Resumo no node + **drawer lateral direito** com a ficha estimada completa (PG18+PG27); canvas segue visível e interativo ao lado                                                                                                                                           |

> Os nodes **Especificação-alvo** e **Combinações** (fluxo inverso) foram **removidos do sistema pela PG38 (2026-07-14)** — código deletado; a especificação deles segue no §4.4 como referência futura.

- **Cascata (PG13)**: a saída de uma Mistura pode entrar como componente de outra Mistura, sempre com o resultado **inteiro** (todas as sacas) — espelha a regra real F7.7 (liga usada como origem contribui 100%).
- **Lote repetido (PG16)**: o mesmo lote real não pode aparecer 2× na **mesma** Mistura — validação ao conectar (espelha o `createBlend`, que rejeita origem duplicada). Em Misturas diferentes do mesmo canvas o lote pode repetir livremente (como as N ligas ativas do domínio real).
- **Mínimo de componentes**: Mistura exige ≥ 2 entradas para executar (regra real do `createBlend`); com menos, o node fica em estado "incompleto".

### 4.3 Fluxo direto (lotes → resultado)

1. Usuário adiciona nodes **Lote**, escolhe os lotes reais e as sacas contribuídas de cada um.
2. Conecta os lotes num node **Mistura** e este num node **Resultado**.
3. **Executar**: o motor (§4.6) calcula e o node Resultado exibe as características estimadas + composição (proporções) + total de sacas.
4. Regras herdadas do domínio real:
   - Sacas contribuídas ≤ saldo disponível do lote: **limite rígido** — o campo trava em `availableSacks` **físico**, sem aviso de comprometimento em outras ligas (PG8 + PG10).
   - Safra do resultado = união das safras distintas (regra real de `deriveBlendHarvest`).
   - Proprietário = unanimidade; divergência ou ausência → **sem dono** (regra real de `deriveBlendOwner` retorna `null` — não existe rótulo "misto").

### 4.4 Fluxo inverso (especificação → combinações) **[REMOVIDO DO SISTEMA — PG38, 2026-07-14]**

> A funcionalidade foi retirada do código (nodes, validações, CSS) por decisão do usuário: será implementada **muito no futuro**. O texto abaixo fica preservado como referência de design para quando o tema voltar (junto de Q-T2/busca por semelhança no §7.2).

1. Usuário adiciona node **Especificação-alvo** e preenche as características desejadas. Campos da v1 (PG19): **peneiras** (alvo por chave, ex. p16), **catação e defeitos** (valores numéricos) e **sacas mínimas** (piso de quantidade). Safra ficou fora da v1.
2. Alvo expresso como **valor pontual + tolerância** por campo (PG20), ex. "p16 = 38% ±10%"; sacas mínimas são piso (≥). O sistema calcula um **score de aderência** por combinação (o quão perto a estimativa chegou do alvo dentro das tolerâncias).
3. Conecta num node **Combinações** e executa. O node aceita configurar o **nº máximo de lotes por combinação: default 3, teto 4** (PG21).
4. O sistema busca, entre os lotes elegíveis (PG9) cujos campos exigidos pelo alvo são interpretáveis (PG11), combinações que atendem dentro das tolerâncias, e apresenta cada sugestão com composição + proporções + aderência por campo.
5. Ordenação (PG22): **menos lotes primeiro** (operação mais simples), desempate por **melhor aderência** ao alvo.
6. Limite computacional do servidor: Q-T2.

### 4.5 Execução

- Execução: a **primeira** é sob demanda (botão Executar, ritual n8n — PG2); depois da primeira execução, qualquer edição em node já executado **recalcula automaticamente** com transição visual sutil (PG14). O cálculo do fluxo direto é instantâneo no cliente, então não há custo perceptível.

### 4.6 Motor de estimativa

Fato do domínio: hoje **nada** no sistema calcula características de liga a partir dos componentes — só safra (união) e proprietário (unanimidade) são derivados (`src/samples/blend-harvest.js`). O motor abaixo é novo e exclusivo do Playground.

Peso = proporção de sacas de cada componente. Escopo dos campos decidido em PG11/PG12 (a coluna "fonte" registra a **forma real de armazenamento**, verificada no schema do evento e no projetor em 2026-07-13):

| Característica                               | Fonte no lote (forma real)                                                     | Regra de combinação                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Peneiras (p18…p10, mk)                       | `latestClassificationData.peneiras` (`number` 0–100)                           | Média ponderada por sacas, campo a campo (PG11)                                                      |
| Fundos                                       | `latestClassificationData.fundos` (2× `{peneira: string, percentual: number}`) | **Adiado** (Q-F11): análise abrangente depois; o preenchimento do rótulo na classificação pode mudar |
| Catação                                      | `latestClassificationData.catacao` (string numérica pt-BR, ex. `"0,5"`)        | Parse simples + média ponderada (PG11); não interpretável → composição por componente                |
| Defeitos (imp, pva, broca, gpi, ap, defeito) | `latestClassificationData.defeitos` (**texto livre**, ex. `"8-9"`, `"<1"`)     | Parse simples + média ponderada (PG11); não interpretável → composição por componente                |
| Aspecto e Padrão                             | `latestClassificationData.aspecto` / `.padrao` (texto canonizado)              | **Adiado** (PG12): entram quando a classificação adotar valores fechados para os dois                |
| Bebida, Tipo, Certificado                    | —                                                                              | **Fora do motor** (PG12): não aparecem no Resultado                                                  |
| Safra                                        | `declaredHarvest`                                                              | União distinta concatenada (regra real `deriveBlendHarvest`)                                         |
| Proprietário                                 | `ownerClientId`                                                                | Unanimidade; divergência/ausência → sem dono (regra real `deriveBlendOwner`)                         |
| Sacas totais                                 | soma das contribuições                                                         | Soma (regra real)                                                                                    |

- **Parse simples (PG11)**: valor interpretável = número puro com vírgula ou ponto decimal, opcionalmente sufixado com `%` (`"0,5"`, `"2"`, `"2%"`). O motor **não** interpreta intervalos (`"8-9"`), frações (`"1/2"`) nem desigualdades (`"<1"`).
- **Nulls (PG17)**: campo `null` num componente = "não medido" — a média considera só os componentes que **têm** o campo, com pesos renormalizados entre eles, e o campo é marcado como **estimativa parcial** no Resultado.
- **Composição PG11 + PG17** (regra final por campo): componentes com `null` são excluídos do cálculo (renormalizando); entre os que têm valor, se **todos** são interpretáveis → média ponderada (com marca de parcial se houve exclusão); se **qualquer** valor não-null é texto não interpretável → o campo vira composição por componente.
- O resultado sempre carrega o selo "estimativa" (P2).

## 5. UX e design

- **Onde vive**: /samples ganha estrutura de sub-abas; molde técnico = padrão `.cad-tabs` de `app/contratos/page.tsx` (`?tab=` como fonte de verdade, `role="tablist"`). A lista atual de Lotes vira a aba default; o Playground é a segunda aba (PG1). Nomes visíveis (PG23): **"Lotes"** + **"Simulador"** — o nome interno da feature continua Playground em docs/código.
- **Identidade**: página deliberadamente diferente do resto do sistema (P5). Referência de fluidez: n8n.
- **Tema do canvas (PG25)**: fundo **claro com grid de pontos** sutis (Background dots do React Flow), nodes brancos com acentos da marca — integra com a casca clara do app e comunica "ferramenta de workflow".
- **Identidade dos nodes (PG34)**: **cor de acento por tipo** (borda esquerda + ícone): Lote = verde da marca, Mistura = âmbar, Resultado = azul. O fluxo se lê de longe pelo colorido. (Roxo e azul-escuro, dos nodes do fluxo inverso, saíram com a PG38.)
- **Drawer direito (PG27)**: a ficha estimada completa do Resultado abre num drawer lateral direito que desliza sobre o canvas — o canvas continua visível e interativo (editar sacas → ver a ficha recalcular ao vivo, PG14).
- **Desktop vs mobile**: v1 é **desktop-only** (PG7). No mobile a aba existe, mas exibe um estado vazio elegante (PG35): ícone leve + "O Simulador foi feito para telas grandes — acesse pelo computador." + botão **"Ver lotes"** que volta à aba Lotes.
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
- **Fluxo inverso [SUSPENSO — PG38]**: busca server-side, endpoint read-only dedicado (ex.: `POST /api/v1/samples/playground/combinations` recebendo a especificação-alvo e devolvendo combinações). Direção do usuário (2026-07-13): **busca por semelhança** — pré-ranquear candidatos pela proximidade ao alvo campo a campo e compor combinações a partir dos mais próximos, em vez de enumeração combinatória cega. O desenho do algoritmo (pré-rank, composição, poda, caps, top-N) fica como referência para quando o tema voltar (Q-T2 suspensa; a antiga F4 saiu do plano).
- **Lib de canvas**: **React Flow (@xyflow/react)** — decidido (PG5). Nada de canvas/drag-drop existia no projeto (front é CSS puro + React 19); React Flow entra como dependência nova, MIT, mesma família de UX do n8n, carregada lazy só ao abrir a aba.
- **Persistência do rascunho (PG24)**: `localStorage` por usuário, **1 rascunho único** na v1 (nodes, conexões, configurações — galeria de cenários segue no estacionamento §3.3); dados dos lotes são re-buscados ao restaurar (saldo/classificação podem ter mudado). Nada no servidor.
- **Código**: aba nova como componente próprio (ex.: `components/playground/`), lazy-loaded para não pesar a lista de Lotes (a lib de canvas só carrega ao abrir a aba).

## 8. Ledger de decisões

| #    | Decisão                                                                                                                                                                                                                                                                                                                                        | Motivo                                                                                                                 | Data       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| PG1  | O Playground é uma **sub-aba da página de Lotes** (/samples), não uma rota própria de topo.                                                                                                                                                                                                                                                    | Ideia original do usuário: laboratório junto dos lotes.                                                                | 2026-07-13 |
| PG2  | Formato de **canvas de workflow com nodes** (referência de fluidez: n8n): adicionar/conectar/desconectar nodes e executar o workflow.                                                                                                                                                                                                          | Experiência intuitiva e exploratória, diferente das demais páginas.                                                    | 2026-07-13 |
| PG3  | **Nenhuma escrita no domínio**: sem criação de amostras, ligas, eventos ou movimentos. Puramente simulação sobre dados reais.                                                                                                                                                                                                                  | Definição do usuário: página de testes, sem risco.                                                                     | 2026-07-13 |
| PG4  | **Dois fluxos**: direto (lotes existentes → características estimadas do resultado) e inverso (características desejadas → sistema apresenta as combinações possíveis).                                                                                                                                                                        | Definição do usuário.                                                                                                  | 2026-07-13 |
| PG5  | Canvas construído com **React Flow (@xyflow/react)**, carregado lazy só na aba Playground.                                                                                                                                                                                                                                                     | Fluidez estilo n8n pronta (pan/zoom/edges/drag); construir caseiro custaria caro para o mesmo resultado. Resolve Q-T1. | 2026-07-13 |
| PG6  | Acesso: **mesmos papéis que veem /samples** — quem vê a lista de Lotes vê o Playground.                                                                                                                                                                                                                                                        | Não expõe dado novo (características + saldo já aparecem na lista). Resolve Q-A1.                                      | 2026-07-13 |
| PG7  | Mobile v1: **desktop-only com aviso** — a aba existe no mobile mas mostra estado vazio elegante ("feito para telas grandes"); canvas só no desktop.                                                                                                                                                                                            | Canvas de nodes com dedo em tela pequena é frustrante; adaptação touch fica para fase futura. Resolve Q-U2.            | 2026-07-13 |
| PG8  | Saldo é **limite rígido** na simulação: o campo de sacas do node Lote trava em `availableSacks` — não se simula com sacas que não existem.                                                                                                                                                                                                     | Toda simulação deve ser executável na prática. Resolve Q-F2.                                                           | 2026-07-13 |
| PG9  | Elegibilidade no Playground: **só lotes classificados** (status `CLASSIFIED`, não invalidado, `availableSacks > 0`). Diverge conscientemente da liga real, que aceita `REGISTRATION_CONFIRMED`.                                                                                                                                                | Sem classificação não há característica para estimar. Resolve Q-F10.                                                   | 2026-07-13 |
| PG10 | Teto do node Lote = `availableSacks` **físico, sem aviso de comprometimento** (`committedSacks` fica fora da v1).                                                                                                                                                                                                                              | Simplicidade; comprometimento em ligas ativas é conceito da tela de liga real. Refina PG8.                             | 2026-07-13 |
| PG11 | Motor numérico por **parse simples**: média ponderada quando todos os componentes têm valor numérico interpretável (vírgula/ponto decimal, sufixo `%`); qualquer texto não interpretável no grupo → campo vira composição por componente. Vale para catação e defeitos (texto livre no banco); peneiras e `fundos.percentual` já são `number`. | Não inventar semântica sobre texto livre (P2).                                                                         | 2026-07-13 |
| PG12 | **Bebida, Tipo e Certificado ficam fora do motor/Resultado.** Aspecto e Padrão: **adiados** — só entram quando a classificação adotar valores fechados (lista esperada) para esses dois campos, em vez de texto livre.                                                                                                                         | Decisão do usuário: categóricos só entram quando estruturados na origem. Resolve parcialmente Q-F9; gera DEP-1 (§9).   | 2026-07-13 |
| PG13 | **Cascata permitida**: saída de Mistura entra em outra Mistura sempre com o resultado **inteiro** (todas as sacas).                                                                                                                                                                                                                            | Espelha a regra real F7.7 (liga como origem contribui 100%); cascata simulada continua executável. Resolve Q-F4.       | 2026-07-13 |
| PG14 | Execução: **manual na primeira** (botão Executar), **automática nas edições seguintes** (recálculo instantâneo com transição sutil).                                                                                                                                                                                                           | Fluidez máxima sem perder o ritual n8n da primeira execução. Resolve Q-F3.                                             | 2026-07-13 |
| PG15 | Catálogo da v1 confirmado: **Lote, Mistura, Resultado, Especificação-alvo, Combinações** (5 nodes, papéis únicos).                                                                                                                                                                                                                             | Estrutura componível no espírito n8n. Resolve Q-F1.                                                                    | 2026-07-13 |
| PG16 | O mesmo lote real **não pode aparecer 2× na mesma Mistura** (validação ao conectar); em Misturas diferentes do mesmo canvas pode repetir livremente.                                                                                                                                                                                           | Espelha o `createBlend` (rejeita origem duplicada) e as N ligas ativas do domínio real.                                | 2026-07-13 |
| PG17 | Nulls no motor: campo `null` = "não medido" — média **só entre os componentes que têm o campo**, com pesos renormalizados; campo marcado como **estimativa parcial** no Resultado.                                                                                                                                                             | Fichas parcialmente preenchidas ainda geram estimativa útil; a parcialidade é comunicada. Resolve Q-F12.               | 2026-07-13 |
| PG18 | Node Resultado exibe **resumo** (sacas totais, safra, dono, composição resumida, 2–3 destaques) + **painel lateral** com a ficha estimada completa ao clicar.                                                                                                                                                                                  | Canvas legível em qualquer zoom; padrão n8n de output.                                                                 | 2026-07-13 |
| PG19 | Especificação-alvo v1 aceita: **peneiras** (por chave), **catação e defeitos**, **sacas mínimas**. Safra fora da v1.                                                                                                                                                                                                                           | Cobre como o comprador especifica; safra era só filtro. Resolve Q-F5.                                                  | 2026-07-13 |
| PG20 | Alvo expresso como **valor pontual + tolerância** por campo, com **score de aderência** por combinação. Sacas mínimas são piso (≥).                                                                                                                                                                                                            | Mais expressivo que limites secos; o score comunica o quão perto chegou. Resolve Q-F6.                                 | 2026-07-13 |
| PG21 | Nº máximo de lotes por combinação: **configurável no node Combinações, default 3, teto 4**.                                                                                                                                                                                                                                                    | Custo combinatório cresce rápido; 3–4 é o range realista de liga. Resolve Q-F7.                                        | 2026-07-13 |
| PG22 | Ordenação das sugestões: **menos lotes primeiro**, desempate por **melhor aderência** ao alvo.                                                                                                                                                                                                                                                 | Simplicidade operacional pesa mais; aderência decide entre iguais. Resolve Q-F8.                                       | 2026-07-13 |
| PG23 | Sub-abas de /samples: **"Lotes"** (lista atual, default) + **"Simulador"** (o Playground). Nome interno da feature continua Playground em docs/código.                                                                                                                                                                                         | "Simulador" é autoexplicativo para o usuário final. Resolve Q-U1.                                                      | 2026-07-13 |
| PG24 | Persistência do canvas: **localStorage** por usuário, 1 rascunho único na v1; dados dos lotes re-buscados ao restaurar. Nada no servidor.                                                                                                                                                                                                      | Sobrevive a refresh e ao retorno no dia seguinte, sem custo de backend. Resolve Q-P1.                                  | 2026-07-13 |
| PG25 | Tema do canvas: **claro com grid de pontos** sutis; nodes brancos com acentos da marca.                                                                                                                                                                                                                                                        | Integra com a casca clara do app sem perder o DNA de ferramenta de workflow.                                           | 2026-07-13 |
| PG26 | Adicionar nodes: **paleta lateral colapsável + arrastar de uma porta para o vazio** abre o menu de nodes compatíveis no ponto, já conectando.                                                                                                                                                                                                  | O gesto-assinatura do n8n; fluidez é P3.                                                                               | 2026-07-13 |
| PG27 | Ficha estimada completa do Resultado em **drawer lateral direito** sobre o canvas (que segue visível e interativo).                                                                                                                                                                                                                            | Editar → ver recalcular ao vivo (PG14); padrão das ferramentas de workflow. Detalha PG18.                              | 2026-07-13 |
| PG28 | Botão de execução: **pill flutuante na base central do canvas**.                                                                                                                                                                                                                                                                               | Molde do "Test workflow" do n8n; sempre visível sem competir com o header.                                             | 2026-07-13 |
| PG29 | Node Lote configurado é **mínimo**: número do lote + input de sacas; dono/saldo/safra no **hover**. Saldo é revelado no erro quando o input estoura o teto.                                                                                                                                                                                    | Nodes compactos, canvas denso e legível.                                                                               | 2026-07-13 |
| PG30 | Picker de lote: **busca embutida no node** (campo inline + dropdown paginado da listagem real, `statusGroup=CLASSIFIED`).                                                                                                                                                                                                                      | O usuário nunca sai do canvas.                                                                                         | 2026-07-13 |
| PG31 | Controles do canvas: **zoom +/− e "enquadrar tudo", sem MiniMap** na v1.                                                                                                                                                                                                                                                                       | Simulações reais têm poucos nodes; minimap só paga com dezenas.                                                        | 2026-07-13 |
| PG32 | Conexão inválida é **recusada no ato** com feedback visual (edge que se desfaz + mensagem curta); erros de configuração viram estado de erro no node.                                                                                                                                                                                          | Ninguém monta fluxo quebrado sem saber; estilo n8n.                                                                    | 2026-07-13 |
| PG33 | Estado vazio: **dica central discreta** ("Arraste um Lote da paleta para começar") com paleta aberta; some ao primeiro node.                                                                                                                                                                                                                   | Ensina o gesto sem poluir.                                                                                             | 2026-07-13 |
| PG34 | Nodes com **cor de acento por tipo** (borda esquerda + ícone): Lote verde, Mistura âmbar, Resultado azul, Especificação-alvo roxo, Combinações azul-escuro.                                                                                                                                                                                    | O fluxo se lê de longe pelo colorido, como no n8n.                                                                     | 2026-07-13 |
| PG35 | Aviso mobile: estado vazio elegante com ícone + "O Simulador foi feito para telas grandes — acesse pelo computador." + **CTA "Ver lotes"** de volta à aba Lotes.                                                                                                                                                                               | Informa e devolve o usuário a algo útil. Detalha PG7.                                                                  | 2026-07-13 |
| PG36 | Rótulo do botão de execução: **"▶ Executar"**.                                                                                                                                                                                                                                                                                                 | Vocabulário n8n/workflow, coerente com "executar o fluxo" (decisão do usuário sobre a alternativa "Simular").          | 2026-07-13 |
| PG37 | **Undo/redo (Ctrl+Z) entra na v1 na fase F3**; fica fora do protótipo.                                                                                                                                                                                                                                                                         | Canvas fluido estilo n8n pede Ctrl+Z; React Flow não traz nativo (exige histórico de estado próprio).                  | 2026-07-13 |
| PG38 | **Fluxo inverso REMOVIDO do sistema**: nodes Especificação-alvo e Combinações deletados do código (componentes, tipos, grafo, paleta, CSS). Reduz o catálogo PG15 a 3 nodes; PG19–PG22 e Q-T2 ficam **suspensas** como referência futura (§4.4/§7.2); a fase F4 sai do plano.                                                                  | Decisão do usuário (2026-07-14): será implementada muito no futuro — foco agora é o motor do fluxo direto.             | 2026-07-14 |

## 9. Questões abertas

Cada item resolvido vira decisão PGn no §8.

### Funcionais

- ~~Q-F1~~ — resolvida → **PG15** (os 5 nodes confirmados: Lote, Mistura, Resultado, Especificação-alvo, Combinações). **Catálogo reduzido a 3 pela PG38** (os 2 do fluxo inverso saíram).
- ~~Q-F2~~ — resolvida → **PG8** (saldo é limite rígido).
- ~~Q-F3~~ — resolvida → **PG14** (manual na primeira execução; automática nas edições seguintes).
- ~~Q-F4~~ — resolvida → **PG13** (cascata permitida; resultado entra inteiro, espelhando F7.7).
- ~~Q-F5~~ — resolvida → **PG19** (peneiras + catação/defeitos + sacas mínimas; safra fora). **Suspensa pela PG38** (fluxo inverso removido).
- ~~Q-F6~~ — resolvida → **PG20** (alvo pontual + tolerância, score de aderência). **Suspensa pela PG38.**
- ~~Q-F7~~ — resolvida → **PG21** (configurável, default 3, teto 4). **Suspensa pela PG38.**
- ~~Q-F8~~ — resolvida → **PG22** (menos lotes primeiro, desempate por aderência). **Suspensa pela PG38.**
- ~~Q-F9~~ — resolvida → **PG12** (bebida/tipo/certificado fora do motor; aspecto/padrão adiados). Gera a dependência externa DEP-1 (abaixo).
- ~~Q-F10~~ — resolvida → **PG9** (lote sem classificação é inelegível — picker só oferece `CLASSIFIED`).
- **Q-F11** — Motor: como combinar **fundos** (2 slots `{peneira: string, percentual: number}` por lote)? **Decisão adiada em 2026-07-13** a pedido do usuário: exige análise abrangente de situações reais, e o próprio **preenchimento do rótulo do fundo na classificação pode mudar** (candidata a virar dependência externa como a DEP-1). Até lá, fundos ficam **fora do motor** — exibidos como composição por componente.
- ~~Q-F12~~ — resolvida → **PG17** (combinar entre quem tem, pesos renormalizados, marca de estimativa parcial).

### UX

- ~~Q-U1~~ — resolvida → **PG23** ("Lotes" + "Simulador").
- ~~Q-U2~~ — resolvida → **PG7** (desktop-only com aviso no mobile).

### Acesso

- ~~Q-A1~~ — resolvida → **PG6** (mesmos papéis de /samples).

### Dependências externas

- **DEP-1** (de PG12) — mudança na **classificação**: transformar `aspecto` e `padrao` em campos de **valores fechados** (lista esperada) em vez de texto livre. Pré-requisito para esses dois campos entrarem no motor do Playground. Registrada também no backlog de `docs/Classificacao-Plano-de-Trabalho.md`.

### Técnicas

- ~~Q-T1~~ — resolvida → **PG5** (React Flow).
- **Q-T2 (reformulada em 2026-07-13; SUSPENSA pela PG38 em 2026-07-14)** — Fluxo inverso server-side: direção do usuário = **busca por semelhança** (rápida e eficiente) em vez de enumeração combinatória com caps. O desenho do algoritmo (pré-rank por proximidade ao alvo, composição das combinações, poda, caps, top-N) fica como referência para quando o fluxo inverso voltar ao plano.
- ~~Q-P1~~ — resolvida → **PG24** (localStorage, 1 rascunho único).

## 10. Fases de implementação **[CONGELADAS em 2026-07-13]**

> Duas pendências deliberadas não bloqueiam o congelamento: **Q-F11** (fundos ficam fora do motor — composição por componente — até a análise própria, que pode mudar a classificação) e ~~Q-T2~~ (suspensa pela PG38 junto com a F4). A **DEP-1** (aspecto/padrão com valores fechados) só condiciona a entrada desses 2 campos no motor, não as fases.
>
> **PG38 (2026-07-14)**: o **fluxo inverso foi removido do sistema** (nodes Alvo/Combinações deletados do código) — a **F4 sai do plano** e volta só num futuro distante, via estacionamento (§3.3).

> **PROTÓTIPO IMPLEMENTADO em 2026-07-13** (commits `ff1588b`→`ec83cf0`, 5 commits C1–C5): casca de abas + canvas completo (paleta, 5 nodes, conexões validadas, drawer, "▶ Executar") com **dados mockados no contrato real** (`lib/playground/mock-lots.ts`, shape `SampleSnapshot`) e **motor stub atrás da interface** `PlaygroundEngine` (`lib/playground/engine.ts`) — composição/sacas/safra/dono reais triviais; peneiras média ponderada simples; catação/defeitos sempre composição (sem parse PG11/renormalização PG17 completa). Equivale à F1 + adiantamentos de F2/F3 com stubs; a F2 real troca `stubEngine` + a fonte de dados (busca real) sem refazer UI. **Fora do protótipo** (deliberado): localStorage (PG24), undo/redo (PG37), execução do inverso (casca com placeholder — a casca inteira foi removida depois pela PG38, deixando o catálogo com 3 nodes). 🖥️ validação visual pendente.

| Fase   | Entrega                                                                                                                                                                                  | Critério de pronto                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F1     | **Casca**: /samples vira página com sub-abas (lista atual = default), aba Playground com canvas vazio funcional (pan/zoom, adicionar/mover/conectar/remover nodes sem lógica de negócio) | Gates verdes; lista de Lotes intacta (zero regressão); canvas fluido no desktop     |
| F2     | **Fluxo direto**: nodes Lote (picker real) + Mistura + Resultado; motor de estimativa; executar                                                                                          | Estimativa correta em testes unitários do motor; validação manual de cenários reais |
| F3     | **Refinamento da execução**: estados visuais, validações de conexão, avisos de saldo, undo/redo (PG37)                                                                                   | Checklist de UX do §4.1 completo                                                    |
| ~~F4~~ | ~~**Fluxo inverso**~~ **REMOVIDA (PG38)** — era: análise do algoritmo de busca por semelhança (Q-T2) + Especificação-alvo + Combinações + endpoint read-only                             | —                                                                                   |
| F5     | **Polimento**: mobile (conforme Q-U2), acessibilidade, performance com muitos nodes, ajustes de identidade visual                                                                        | Validação no device pelo usuário (📱)                                               |

- Cada fase = commits atômicos + gates completos (lint, format, typecheck, build, unit; integração quando tocar backend).
- Nada é ✅ sem validação no device (convenção do projeto).

## 11. Validação e testes

- **Motor de estimativa** (fluxo direto): testes unitários puros — combinações de peneiras/catação/defeitos, pesos, lotes sem classificação, campos ausentes. É a peça mais testável da feature.
- ~~**Busca de combinações** (fluxo inverso)~~ — suspenso pela PG38 (era: testes unitários do algoritmo + teste de integração read-only do endpoint).
- **Canvas/UX**: sem testes automatizados de browser (convenção do projeto: visual é validado pelo usuário no device); gates padrão cobrem o resto.
- **Garantia de P1 (zero escrita)**: revisão de código + ausência de qualquer chamada de comando; nenhum teste de integração deve detectar evento novo originado do Playground.

## 12. Changelog do documento

| Data       | Mudança                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-13 | Criação do documento: conceito, princípios, escopo, especificação inicial, PG1–PG4, questões abertas Q-F1…Q-P1, fases em rascunho.                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-13 | PG5–PG8 decididas (React Flow; acesso = papéis de /samples; mobile desktop-only com aviso; saldo é limite rígido). Q-T1/Q-A1/Q-U2/Q-F2 fechadas; seções 4–7 atualizadas.                                                                                                                                                                                                                                                                                                                        |
| 2026-07-13 | PG9–PG12 decididas (só classificados; teto físico sem aviso; parse simples; bebida/tipo/certificado fora + aspecto/padrão adiados → DEP-1). Q-F9/Q-F10 fechadas; Q-F11/Q-F12 abertas; §4.6 reescrito com a forma real dos dados (linha "Densidade" removida — espelho `latestDensity` foi dropado na auditoria CL de 2026-07-13; correção de `deriveBlendOwner`: divergência → sem dono, não "misto").                                                                                          |
| 2026-07-13 | PG13–PG24 decididas em 4 rodadas (cascata inteira; execução manual→auto; 5 nodes; lote 2× bloqueado na mesma mistura; nulls renormalizados; Resultado resumo+painel; alvo peneiras+catação/defeitos+sacas; pontual+tolerância com score; máx configurável 3/4; ordenação menos lotes→aderência; abas "Lotes"+"Simulador"; localStorage). Q-F11 adiada (fundos fora do motor; preenchimento do rótulo pode mudar); Q-T2 reformulada (busca por semelhança, desenho na F4). **Fases congeladas.** |
| 2026-07-13 | PG25–PG36: layout e UX da página em 3 rodadas (canvas claro com grid de pontos; paleta + arrasto da porta; drawer direito pra ficha; "▶ Executar" flutuante na base central; node Lote mínimo com hover; busca embutida no node; zoom/fit sem minimap; bloqueio de conexão no ato com feedback; dica central no vazio; cor de acento por tipo de node; aviso mobile com CTA "Ver lotes"). §4.1/§4.2/§5 atualizados; catálogo de nodes deixa de ser [PROPOSTA].                                  |
| 2026-07-13 | **PROTÓTIPO IMPLEMENTADO** (C1–C5, `ff1588b`→`ec83cf0`): abas em /samples, canvas React Flow 12.11.2 lazy (primeiro next/dynamic do projeto; chunk fora do first-load), 5 nodes + paleta + menu de compatíveis + validações com toast, execução manual→auto com motor stub e drawer da ficha. PG37 registrada (undo/redo → F3). Módulos puros em `lib/playground/` com 18 testes. Escopo do protótipo anotado no §10.                                                                           |
| 2026-07-14 | **PG38 — fluxo inverso removido do sistema**: nodes Especificação-alvo e Combinações deletados (componentes, tipos, grafo, paleta, testes, CSS); catálogo reduzido a 3 nodes; F4 sai do plano; PG19–PG22 e Q-T2 suspensas como referência (§4.4 preservado); item no estacionamento §3.3. Decisão do usuário: implementação fica para um futuro distante — foco no motor do fluxo direto.                                                                                                       |
