# Assistente IA — Plano de Trabalho

> **Status**: DECISÕES TRAVADAS (2026-07-14) — ideia registrada, análise de viabilidade feita e **decisões AST1–AST10 fechadas** (Apêndice A); pendência P1 (nome do assistente). **Sem implementação** — próximo passo: plan mode da F1.
> **Última atualização**: 2026-07-14
> **Prefixo de decisões**: AST (AST1, AST2, ...)
> **Documento centralizado da feature**: conceito, análise, decisões, especificação e fases vivem AQUI.

---

## 1. Conceito e motivação

**Elevator pitch**: um assistente de perguntas e respostas embutido no app, para os usuários. Ele tem acesso aos dados do sistema (lotes, clientes, contratos, agenda), busca as informações que a pergunta pede e responde em pt-BR, apresentando os dados de forma boa e interativa (cards, tabelas, links para as páginas), respeitando exatamente o que o papel do usuário pode ver.

**Problema que resolve**: hoje qualquer pergunta sobre o estado do negócio ("quantos lotes do fulano ainda estão abertos?", "qual contrato vence essa semana?", "quanto esse cliente já comprou?") exige navegar página a página, aplicar filtros e cruzar telas de cabeça. O assistente vira um ponto único de consulta em linguagem natural — especialmente valioso no celular, onde navegar/filtrar é mais lento.

**O que o assistente explicitamente NÃO é (proposta de v1)**:

- NÃO executa ações — não cria, edita, vende, fatura nem deleta nada. Somente leitura.
- NÃO é text-to-SQL — o modelo nunca escreve SQL nem toca o banco diretamente (ver §4.1).
- NÃO substitui as páginas — ele responde e aponta para a página certa (deep link), não reimplementa telas.
- NÃO é um chatbot de conhecimento geral — o escopo é o dado do sistema; fora disso, ele diz que não é o lugar.

## 2. Princípios

| #   | Princípio                                                                                                                                                                | Consequência prática                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **O assistente é o usuário.** Toda consulta roda com a sessão e o papel do usuário logado; o enforcement de permissão acontece **no código das tools**, nunca no prompt. | Tools chamam os serviços de domínio existentes passando o `actor` de `resolveActorContext`; um 403 do serviço é um 403 do assistente.                          |
| P2  | **Somente leitura na v1.** Nenhuma tool de escrita.                                                                                                                      | Blast radius de prompt injection e alucinação fica limitado a "resposta errada", nunca a "dado alterado".                                                      |
| P3  | **Nunca SQL livre.** O modelo escolhe entre tools tipadas e pré-definidas, com schema validado.                                                                          | Superfície de ataque mínima; consultas sempre passam pelos índices/paginação/filtros já existentes.                                                            |
| P4  | **Dados ao vivo, sem cópia.** Nada de índice paralelo, embeddings ou snapshot dos dados de negócio.                                                                      | Resposta sempre reflete o estado atual; zero pipeline de sincronização para manter.                                                                            |
| P5  | **pt-BR e linguagem do domínio.** O assistente fala como o app (lote, liga, safra, bica, embarque…) e a UI segue o design system.                                        | System prompt com glossário do domínio; componentes de resposta usam os padrões visuais existentes.                                                            |
| P6  | **Custo com teto e telemetria desde o dia 1.** O assistente nasce com limites (tools/turno, tokens, perguntas/dia) e métricas por conversa.                              | Mesmo padrão da extração de classificação (`extraction-telemetry`): tokens, modelo, outcome, latência por turno. Sem teto, um loop de tools vira custo aberto. |

## 3. Estado atual do app (fatos que sustentam a análise)

Mapeamento feito em 2026-07-14 sobre o código atual:

1. **A camada de "tools" praticamente já existe.** Toda a lógica de negócio + autorização vive em `src/api/v1/backend-api.js` (~1 método por rota) delegando a serviços de domínio (`SampleQueryService`, `sale-contract-service`, etc.). Toda rota autenticada resolve o ator via `resolveActorContext` (`src/api/v1/backend-api.js:83`) e os gates de papel ficam nos serviços (`assertRoleAllowed`, `src/auth/roles.js:16`). O assistente pode reusar essa superfície inteira.
2. **OpenAI já está integrado, server-side.** SDK `openai@6.34` instalado; `OPENAI_API_KEY` no Secret Manager (mapeada em `scripts/gcp/_lib.sh`); padrão de chamada com timeout/retry/telemetria em `src/samples/classification-extraction-service.js`. Hoje é só a extração de fichas (visão, structured output) — **não há chat, tools, streaming nem RAG em lugar nenhum**.
3. **Autorização por papel (own-only revogado).** ADMIN e COMMERCIAL veem todos os contratos/Financeiro (D140); CLASSIFIER/REGISTRATION/CADASTRO não acessam contratos/financeiro; PROSPECTOR é restrito por allowlist central (`src/auth/prospector-access.js`, fail-closed). Endpoints de cliente/amostra exigem apenas autenticação (gate de front é só UX) — o assistente herda exatamente esse modelo.
4. **Infra (Cloud Run `southamerica-east1`)**: `--timeout 300`, `--concurrency 10`, `--min-instances 0` (cold start), 1 vCPU / 1Gi. CSP de produção tem `connect-src 'self'` → o chat obrigatoriamente é proxy same-origin (rota do próprio app), nunca chamada do browser direto ao provedor. Deploy usa `--set-env-vars` substituindo o conjunto inteiro — qualquer env var nova do assistente precisa entrar em `runtime_env_vars_csv`/secret mappings (`scripts/gcp/_lib.sh`).
5. **Frontend**: Next.js 15 App Router, React 19, fetch puro via `lib/api-client.ts` (sem SWR/React Query), CSS global único com design system próprio. **Não existe componente de chat/SSE** — seria superfície nova.
6. **Custo atual**: TCO ~R$ 231/mês; a linha OpenAI (extração) é R$ 83/mês (43% da nuvem) com gpt-4o a US$ 2,50/US$ 10 por MTok — os modelos de entrada atuais custam menos que isso (ver §6).

## 4. Análise de arquitetura

### 4.1 Opções consideradas

| Opção                                         | Como funciona                                                                         | Prós                                                                        | Contras                                                                                                                                                                            | Veredito                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **A. Text-to-SQL**                            | O modelo gera SQL e executa no banco (read-only)                                      | Cobre qualquer pergunta sem escrever tools                                  | Superfície de ataque enorme (injection, exfiltração cross-role); o banco não tem RLS — a autorização vive no código de serviço, que seria bypassado; schema de 33 models no prompt | ❌ Descartada                                   |
| **B. RAG / embeddings**                       | Indexar os dados em vetores e recuperar por similaridade                              | Bom para texto não-estruturado                                              | Os dados aqui são estruturados e mudam o tempo todo; RAG responde com snapshot desatualizado e não sabe agregar ("quantos", "soma")                                                | ❌ Não se aplica ao dado de negócio (†)         |
| **C. Tool-calling sobre a camada de serviço** | O modelo escolhe tools read-only tipadas que chamam os serviços existentes com o ator | Herda autorização, índices, paginação e regras de negócio; dado sempre vivo | Cobertura limitada às tools escritas; perguntas muito abertas exigem várias rodadas                                                                                                | ✅ **Recomendada** — é o padrão de mercado 2026 |

(†) RAG pode voltar num futuro distante para responder sobre _documentação/ajuda do app_ ("como faço para emitir etiqueta?"), que é texto estático — fora do escopo desta análise.

### 4.2 Fluxo proposto (alto nível)

```
UI (chat) ──POST /api/v1/assistant/chat (same-origin, SSE)──▶ route handler
  └▶ executeBackend('assistantChat') ──▶ resolveActorContext (sessão/role)
       └▶ loop de tool-calling (server-side):
            LLM ⇄ tools read-only ──▶ serviços de domínio existentes (com actor)
       └▶ stream de resposta (texto + blocos estruturados) ──▶ UI renderiza
```

- O loop inteiro roda no servidor (compatível com CSP `connect-src 'self'`); o browser só fala com o app.
- Streaming via SSE na própria rota (App Router suporta `ReadableStream`); um turno cabe folgado nos 300s de timeout do Cloud Run.
- Caps no loop: máx. N rodadas de tools por turno (ex.: 5), máx. tokens por resposta, timeout por tool.

### 4.3 Superfície inicial de tools (proposta)

Wrappers finos sobre métodos que já existem no `backendApi`/serviços — sempre recebendo o `actor`:

| Tool (nome ilustrativo) | Serviço/método por trás                          | Responde perguntas como                              |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `buscar_lotes`          | `listSamples` (filtros/keyset existentes)        | "lotes abertos do cliente X", "lotes da safra 25/26" |
| `detalhe_lote`          | `getSample` (+ eventos)                          | "o que aconteceu com o lote 1234?"                   |
| `buscar_clientes`       | `listClients` / `lookup`                         | "qual o telefone do comprador Y?"                    |
| `resumo_cliente`        | `commercial-summary` / `purchases`               | "quanto o cliente Y já comprou?"                     |
| `listar_contratos`      | `sale-contracts` (gate ADMIN/COMMERCIAL herdado) | "contratos EMITIDOS aguardando aprovação"            |
| `eventos_agenda`        | feeds do dashboard (`payment/shipment/invoice`)  | "o que vence essa semana?"                           |

A lista final de domínios da v1 foi travada pela AST2: **os quatro domínios entram** (contratos/financeiro com o gate ADMIN/COMMERCIAL herdado). O detalhamento tool a tool fica para o plan mode da F1.

### 4.4 Apresentação interativa

Duas camadas na resposta:

1. **Texto** do modelo (markdown restrito), em pt-BR.
2. **Blocos estruturados**: quando uma tool retorna lista/entidade, o backend anexa ao stream um bloco tipado (`{type: 'lots', items: [...]}`) que a UI renderiza como componente nativo do design system (card de lote, linha de contrato, mini-agenda), com **deep link** para a página real. O modelo referencia os blocos, mas quem desenha é o app — isso elimina alucinação visual e mantém a identidade do design system.

Referência de mercado: "generative UI" do Vercel AI SDK (`useChat` + partes de mensagem tipadas). A adoção da lib foi travada pela AST5.

### 4.5 Encaixe na infra

- **SSE same-origin**: ok com a CSP atual; nenhum domínio novo no `connect-src`.
- **Timeout**: um turno de chat (5–30s típicos) cabe nos 300s; sem mudança.
- **Concurrency 10**: streams seguram o slot enquanto duram; com o volume de equipe interna é irrelevante, mas fica anotado como limite conhecido.
- **Cold start (`min-instances 0`)**: a primeira pergunta do dia pode levar +2–4s; aceitável para v1.
- **Deploy**: novas envs (ex.: `ASSISTANT_MODEL`, caps) entram em `runtime_env_vars_csv`; chave nova (se houver segundo provedor) entra como secret mapping — ver §3.4.
- **Memória 1Gi**: o proxy de stream é leve; sem risco novo.

## 5. Segurança (análise)

| Vetor                      | Análise                                                                                                                               | Mitigação proposta                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acesso além do papel       | Tools chamam serviços com o `actor` real; gates `assertRoleAllowed` e allowlist do PROSPECTOR continuam valendo dentro do assistente. | P1 — enforcement no código; testes de contrato por papel para as tools.                                                                                               |
| Prompt injection via dados | Nomes/observações de clientes e payloads de eventos podem conter texto malicioso que o modelo lê como instrução.                      | P2 (somente leitura limita o dano); resultados de tool entram delimitados como dados; instrução explícita no system prompt; nunca executar ação por conteúdo de dado. |
| SQL/consulta arbitrária    | Descartado por arquitetura (opção C).                                                                                                 | P3 — só tools tipadas.                                                                                                                                                |
| Custo/DoS                  | Loop de tools sem teto ou usuário spammando viram custo aberto.                                                                       | Caps por turno (rodadas/tokens) + rate limit por usuário/dia + telemetria com alarme.                                                                                 |
| Vazamento entre usuários   | Não há cache de resposta compartilhado; cada turno roda com a sessão do usuário.                                                      | Prompt caching só do prefixo estático (system + tools), nunca de dados de usuário.                                                                                    |
| LGPD / retenção            | Perguntas e respostas podem conter dados pessoais de clientes.                                                                        | AST6 — v1 não persiste conversas (histórico efêmero no navegador); se um dia persistir (F3), definir retenção/expurgo.                                                |
| PROSPECTOR                 | A allowlist central hoje não incluiria o assistente; abrir exigiria decidir o que ele pode perguntar.                                 | AST3 — v1 sem PROSPECTOR.                                                                                                                                             |

Referências: OWASP AI Agent Security Cheat Sheet; guias Google Cloud (acesso de agentes a Cloud SQL/MCP); padrão action-selector (tools pré-definidas) da literatura de 2025/26 — links no §10.

## 6. Custos (estimativa)

Preços de tabela em jul/2026 (por 1M tokens, input/output — **conferir na página oficial do provedor antes de implementar a AST1**):

| Modelo                      | Input | Output | Observação                                  |
| --------------------------- | ----- | ------ | ------------------------------------------- |
| OpenAI GPT-5.4 Nano         | $0,20 | $1,25  | mais barato, menos capaz                    |
| OpenAI GPT-5.4 Mini         | $0,75 | $4,50  | candidato natural (provedor já contratado)  |
| Anthropic Haiku 4.5         | $1,00 | $5,00  | tier de entrada Claude                      |
| Anthropic Sonnet 5          | $2–3  | $10–15 | intro $2/$10 até 2026-08-31; forte em tools |
| OpenAI GPT-5.4              | $2,50 | $15,00 | mesmo preço do gpt-4o atual da extração     |
| _(referência)_ gpt-4o atual | $2,50 | $10,00 | usado hoje na extração (R$ 83/mês)          |

**Anatomia de uma pergunta** (estimativa): prefixo estável (system + definição de tools) ~3,5k tokens; 2 rodadas de tools; resultados ~1,5k; saída ~0,5k → **~11k input + ~0,5k output por pergunta**, sendo ~7k do prefixo cacheável (cache read ≈ 0,1× o preço de input).

**Custo por pergunta** (com caching, câmbio ~R$ 5,10):

| Modelo       | por pergunta | 300 perguntas/mês | 1.000 perguntas/mês |
| ------------ | ------------ | ----------------- | ------------------- |
| GPT-5.4 Mini | ~R$ 0,03     | ~R$ 9             | ~R$ 30              |
| Haiku 4.5    | ~R$ 0,04     | ~R$ 12            | ~R$ 40              |
| Sonnet 5     | ~R$ 0,08     | ~R$ 24            | ~R$ 80              |

**Conclusão**: com modelo de entrada + prompt caching + caps, o assistente custa **~R$ 10–50/mês** no uso esperado da equipe — na escala do TCO atual (~R$ 231/mês) e menor que a linha de extração (R$ 83/mês). O custo NÃO é um bloqueador; o teto (caps) é o que garante isso.

## 7. Pontos de decisão

**Todos os pontos (Q1–Q10) foram decididos com o Flavio em 2026-07-14** e viraram AST1–AST10 no Apêndice A. O contexto completo (opções consideradas e recomendações) vive no histórico do Git desta seção.

### Pendências

- **P1 — Nome do assistente**: decidido que terá nome/persona próprio (AST9), mas o nome em si ainda não foi escolhido. Escolher antes da UI da F1.

## 8. Riscos

| Risco                                           | Impacto                                    | Mitigação                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alucinação (números/fatos inventados)           | Resposta errada orienta decisão de negócio | Respostas sempre ancoradas em resultado de tool; blocos estruturados vêm do backend, não do modelo; instrução "se a tool não retornou, diga que não achou" |
| Cobertura frustrante ("não sei responder isso") | Usuário abandona a feature                 | v1 com escopo claro e comunicado na UI; telemetria de perguntas sem resposta orienta novas tools                                                           |
| Custo foge do previsto                          | Linha nova no TCO                          | Caps + telemetria + alarme; modelo trocável por env var                                                                                                    |
| Dependência de lib (Vercel AI SDK)              | Lock-in de protocolo no front              | Camada fina; o backend fala SSE padrão — trocável                                                                                                          |
| Latência (cold start + rodadas de tools)        | Percepção de lentidão                      | Streaming (primeiro token cedo), indicador de progresso ("consultando lotes…")                                                                             |

## 9. Fases propostas (alto nível — detalhamento fica para o plan mode da implementação)

- **F0 — Decisões**: ✅ CONCLUÍDA (2026-07-14) — AST1–AST10 no Apêndice A; resta a pendência P1 (nome).
- **F1 — Fundação**: rota `assistant/chat` com SSE (Vercel AI SDK) + loop de tools com caps (AST7) + tools de leitura dos 4 domínios (AST2) + telemetria + chat em texto. Critério de pronto: responder com precisão as ~10 perguntas mais comuns do dia a dia.
- **F2 — Experiência da v1**: blocos estruturados com deep links (AST8), botão global + página dedicada (AST4), feedback 👍/👎 (AST10), sugestões de pergunta. F1+F2 juntas formam a v1 que vai ao ar.
- **F3 — Futuro (fora da v1)**: histórico persistente, PROSPECTOR, RAG de documentação/ajuda, tools de escrita (se um dia fizer sentido, com confirmação humana).

## 10. Fontes da pesquisa (2026-07-14)

- OWASP — [AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- Google Cloud — [Securing agent interactions with MCP/Cloud SQL](https://docs.cloud.google.com/sql/docs/mysql/secure-agent-interactions-mcp)
- AWS — [Multi-tenant LLM analytics with row-level security](https://aws.amazon.com/blogs/machine-learning/multi-tenant-llm-analytics-with-row-level-security-how-we-built-a-secure-agent-on-aws/)
- arXiv — [Design Patterns for Securing LLM Agents against Prompt Injections](https://arxiv.org/pdf/2506.08837)
- Arcade — [How to Build SQL Tools for AI Agents](https://www.arcade.dev/blog/sql-tools-ai-agents-security/)
- Cerbos — [Permission Management for AI Agents](https://www.cerbos.dev/blog/permission-management-for-ai-agents)
- Vercel — [AI SDK: Next.js App Router getting started](https://ai-sdk.dev/docs/getting-started/nextjs-app-router) · [Generative UI template](https://vercel.com/templates/next.js/rsc-genui)
- OpenAI — [Pricing oficial](https://developers.openai.com/api/docs/pricing) (valores do §6 vieram de agregadores; conferir aqui antes do Q1)
- Anthropic — preços via referência oficial da API Claude (skill `claude-api`, cache 2026-06)
- Google Cloud Run — timeout de request/streaming (default 300s, configurável)

---

## Apêndice A — Ledger de decisões

Decisões travadas com o Flavio em 2026-07-14:

- **AST1** — Fornecedor/modelo da v1: OpenAI **GPT-5.4 Mini** (provedor já contratado; modelo trocável por env var; conferir preço/ID na página oficial antes de implementar).
- **AST2** — Escopo de dados da v1: **os quatro domínios** — lotes/amostras, clientes, agenda/eventos e contratos/financeiro (este último visível só a ADMIN/COMMERCIAL, gate herdado).
- **AST3** — Papéis na v1: **todos exceto PROSPECTOR**; cada papel vê só o que seus gates permitem.
- **AST4** — Superfície de UI: **botão global E página dedicada** — as duas coexistem sobre o mesmo chat (painel lateral desktop / bottom sheet mobile + rota própria).
- **AST5** — Streaming: **SSE com Vercel AI SDK** (`useChat`), proxy same-origin no route handler.
- **AST6** — Histórico de conversas: **efêmero** (memória do navegador; nada persistido no banco na v1).
- **AST7** — Caps default: **5 rodadas de tools/turno, ~1,5k tokens de saída, 50 perguntas/usuário/dia** — ajustáveis por env var.
- **AST8** — Apresentação: **texto + blocos estruturados** (cards/tabelas do design system com deep links) já na v1.
- **AST9** — O assistente **terá nome/persona próprio**; o nome em si é a pendência P1 (§7).
- **AST10** — Telemetria técnica **+ feedback 👍/👎 por resposta já na v1**.
