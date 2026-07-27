# Documentacao Canonica

Status: Ativo  
Escopo: indice oficial, ordem de leitura e fronteira de autoridade da documentacao  
Ultima revisao: 2026-07-12  
Documentos relacionados: `README.md`, `docs/Documentation-Inventory.md`

## Leitura recomendada

1. `README.md`
2. `docs/Produto-e-Fluxos.md`
3. `docs/Arquitetura-Tecnica.md`
4. `docs/Operacao-e-Runtime.md`
5. `docs/API-e-Contratos.md`

## Documentos canonicos

1. `docs/Produto-e-Fluxos.md`
   Funcao: descreve o que o sistema faz hoje, quem usa, estados da amostra, regras operacionais e decisoes de escopo.
2. `docs/Arquitetura-Tecnica.md`
   Funcao: consolida stack, componentes, modelo de dados, autenticacao, storage, laudos e testes.
3. `docs/Operacao-e-Runtime.md`
   Funcao: define ambientes oficiais, envs, Compose, scripts canonicos, health, smoke, backup e operacao.
4. `docs/API-e-Contratos.md`
   Funcao: referencia oficial de rotas, contratos internos, eventos, idempotencia e validacao.
5. `docs/Documentation-Inventory.md`
   Funcao: registra o destino dos documentos antigos e as decisoes de consolidacao feitas nesta revisao.
6. `docs/Deploy-e-Cloud-Build.md`
   Funcao: guia operacional de deploy canary para producao (Cloud Build + Cloud Run + fluxo de promocao de trafego).
7. `docs/SECURITY-audit.md`
   Funcao: audit de seguranca — cobre 9 categorias, status por item (OK/GAP/RISCO), debitos documentados. Atualizado ao final do Passe 7B+7C.
8. `docs/SECURITY.md`
   Funcao: politica de seguranca, principios, autenticacao, autorizacao e runbook de resposta a incidente.
9. `docs/SECURITY-threat-model.md`
   Funcao: threat model completo das 9 categorias com ameacas, mitigacoes, status e risco residual.

## Documentos de suporte

1. `docs/schemas/events/v1/README.md`
   Uso: navegar pelos schemas JSON do contrato de eventos.
2. `scripts/gcp/README.md`
   Uso: localizar os wrappers operacionais de deploy para producao.
3. `docs/Conferencia-Fases-1a4.md`
   Uso: checklist oficial de conferencia das fases 1 a 4 com banco, contratos, backend e regressao.
4. `docs/Clientes-e-Movimentacoes-Especificacao.md`
   Uso: especificacao funcional/tecnica de clientes, proprietarios, movimentacoes comerciais e auditoria. Status: Ativo (implementado).
5. `docs/archive/Reorganizacao-2026Q2-Decisions.md`
   Uso: historico de decisoes da reorganizacao Q2 2026 (14 ADRs). Referencia para entender escolhas arquiteturais.
6. `docs/Notificacoes.md`
   Uso: catalogo e processo de registro das notificacoes Web Push — convencoes do canal, template de ficha e ciclo Ideia -> Construida -> Validada. Status: catalogo ZERADO em 2026-07-09 (nenhuma notificacao e enviada hoje); o canal segue de pe, aguardando o novo conjunto ser registrado aqui.
7. `docs/Contratos-Visao-Geral.md` + `docs/Contratos-Plano-de-Trabalho.md`
   Uso: documentacao canonica da pagina de Contratos (par mae + plano). `Contratos-Visao-Geral.md` = documento-mae do funcionamento atual (a casca /contratos + sub-abas + acesso por papel; o contrato/PDF + Espelho de Corretagem + agio; as abas Financeiro/Aprovacoes/Embarque; a maquina de estado com os portoes; o modelo de dados e as rotas de API). `Contratos-Plano-de-Trabalho.md` = backlog, pendencias e ledger condensado das decisoes (D/CC/AP/EMB). Consolidacao 4->2 (2026-07-13): absorveu e removeu `Central-de-Contratos-`, `Aprovacoes-` e `Embarque-Plano-de-Trabalho.md` (historico no Git). Status: Visao Geral Ativo; Plano em andamento.
8. `docs/Revisao-Pagina-Lotes-Plano-de-Trabalho.md`
   Uso: plano faseado da revisao da pagina de Lotes (lista /samples) — catalogo dos 29 achados (bugs, gargalos, dados, a11y, codigo morto), decisoes, status por fase e protocolo de verificacao. Status: fases 1-6 concluidas e EM PROD; deferidos (CSS legado M1 + testes de regressao #7) resolvidos no ciclo LOT da Revisao Geral (2026-07-07). **PARCIALMENTE SUPERADO pelo redesenho FV de /samples (RD15)**: no desktop nao existe mais card, e o detalhe virou drawer da propria lista — as validacoes que faltam so valem no mobile (aviso no topo do proprio doc).
9. `docs/Auditoria-Navegacao-por-Papel.md`
   Uso: mapeamento read-only de quais paginas cada papel de usuario acessa e onde estao na navegacao (sidebar desktop, tabbar mobile, menu do avatar). Status: Ativo, **com errata estrutural no topo** (2026-07-22): as regras de acesso seguem corretas, mas o corpo descreve uma navegacao anterior — `/camera` nao existe mais, a tabbar tem 4 itens e a sidenav ganhou Embarques + sub-itens (RD13). COMMERCIAL/CLASSIFIER/REGISTRATION/CADASTRO/ADMIN detalhados; PROSPECTOR resumido.
10. `docs/Revisao-Geral-Plano-de-Trabalho.md`
    Uso: documento-mae da revisao geral do app, pagina por pagina e por papel — roteiro padrao (R1-R8) que orienta toda sessao de revisao, status por pagina, convencoes de achados/decisoes/pendencias e fases globais (varredura de codigo morto + organizacao de pastas). Status: Em andamento (F0).
11. `docs/Dashboard-Visao-Geral.md` + `docs/Dashboard-Plano-de-Trabalho.md`
    Uso: documentacao canonica do dashboard (par mae + plano). `Dashboard-Visao-Geral.md` = documento-mae do funcionamento atual (fluxo, layout desktop/mobile, disponibilidade por papel, cards, rotas de API, projecoes e regras). `Dashboard-Plano-de-Trabalho.md` = backlog, decisoes e execucao do check-up do dashboard. Substituem o antigo `Eventos-Dashboard-Plano-de-Trabalho.md` (absorvido e removido em 2026-07-12, decisao DSB-D1; historico no Git). Status: Visao Geral Ativo; Plano em andamento.
12. `docs/Custo-Operacional-Analise.md`
    Uso: **documento MESTRE de custo** (detalhado) — nuvem (GCP + OpenAI, ~R$ 193/mes) + materiais de impressao (impressora/etiqueta/ribbon, ~R$ 38/mes) = **TCO ~R$ 231/mes**; config real da producao (gcloud read-only), modelo de crescimento, projecao de 3 anos, recomendacoes e registro de atualizacoes. Padrao: atualizar ESTE md primeiro a cada evolucao, depois regenerar o **PDF enxuto para o cliente** (`docs/assets/Custo-Operacional-Analise.pdf`, 1 pagina) via `scripts/cost-report/build-cost-report.mjs`. Status: atualizado 2026-07-12.
13. `docs/Classificacao-Visao-Geral.md` + `docs/Classificacao-Plano-de-Trabalho.md`
    Uso: documentacao canonica da classificacao (par mae + plano, desde 2026-07-13). `Classificacao-Visao-Geral.md` = documento-mae do funcionamento atual (fluxo camera/IA/edicao, contrato campo a campo do latestClassificationData, canonizacao, matriz campo x superficie, convencoes de exibicao, rotas de API, extracao IA, drifts documentados). `Classificacao-Plano-de-Trabalho.md` = backlog, decisoes historicas (Q.cls) e ledger da auditoria CL1-CL41 (2026-07-13, espelhos tecnicos dropados). Status: Visao Geral Ativo; Plano em andamento.
14. `docs/Liga-Plano-de-Trabalho.md`
    Uso: feature de Liga (blend de amostras) — composicao, cascata recursiva de movimentos, safra/proprietario reativos, viabilidade quantitativa da venda. Status: Em andamento.
15. `docs/Etiqueta-de-Envio-Plano-de-Trabalho.md`
    Uso: etiqueta de envio com QR que abre o laudo publico (Firebase Hosting), com revogacao ao cancelar. Status: Em andamento.
16. `docs/Design-Language.md`
    Uso: **canonico dos design tokens** (cor/tipografia/espaco/raio/sombra/motion/z-index/breakpoints) — espelho legivel do `:root` de `app/globals.css`. Fonte-de-verdade dos tokens; a skill `design-system` e o guia APLICADO. Ponto de partida da reforma de design. Status: Ativo.
17. `docs/Assistente-IA-Plano-de-Trabalho.md`
    Uso: documento centralizado da feature Assistente IA — assistente de perguntas e respostas para os usuarios, com acesso aos dados do app via tools somente leitura sobre a camada de servico existente. Conceito, principios, analise de arquitetura/seguranca/custos, ledger de decisoes e fases. Prefixo de decisoes: AST. Status: decisoes AST1-AST10 travadas (2026-07-14); pendencia P1 (nome); sem implementacao — proximo passo e o plan mode da F1.
18. `docs/Informativos-Plano-de-Trabalho.md`
    Uso: documento centralizado da familia de features Informativos — pecas de imagem que o usuario gera preenchendo campos num modal e baixa pronta para publicar nas redes sociais (nada e salvo: sem banco, sem storage, sem historico). Conceito, principios, especificacao visual completa dos dois tipos (Mercado no §5, Meteorologico no §5-B: 1080x1920, story 9:16, zona segura, paleta, tipografia, medidas bloco a bloco), a avaliacao que descartou a API de meteorologia (§4.3), ledger de decisoes e fases. Prefixo de decisoes: INF. Status: IMPLEMENTADO em 2026-07-16 (INF1-INF57); **reformulado no redesenho FV da /relatorios (2026-07-23/27, Redesign §2.10 R10/R12/R16)** — o fluxo de 3 fases (mercado -> meteorologico -> revisao) foi SUPERADO por um **painel lateral de duas colunas com previa AO VIVO** (blocos "form | previa", meteo como secao opcional; a fase de revisao deixou de existir e a validacao migrou pro clique de baixar); aberto pelo botao "Informativo" da faixa (desktop) ou pela 1a opcao do leque do FAB (mobile). A previsao do tempo entra como print colado pelo usuario; sem migration e sem rota de API. Pendente: so a validacao visual (🖥️ as duas pecas, 📱 story de teste, unico jeito de confirmar a zona segura). Aberta: Q-C3 (saca em alta resolucao).
19. `docs/Playground-Plano-de-Trabalho.md`
    Uso: documento centralizado da feature Playground — sub-aba "Simulador" de /samples com canvas de nodes (estilo n8n) para simular ligas sem gravar nada (fluxo direto lotes→resultado estimado; o fluxo inverso foi removido do sistema pela PG38). Conceito, principios, ledger PG1-PG38, pendencias deliberadas e fases. Status: Prototipo implementado em 2026-07-13 (mocks + motor stub atras da interface PlaygroundEngine); motor real do fluxo direto e a proxima fase (F2).
20. `docs/Redesign-Plano-de-Trabalho.md`
    Uso: documento centralizado do ciclo de redesign — duas frentes: (a) detalhes-como-modais (detalhes de lote/cliente/contrato deixam de ser paginas e viram overlays sobre as listas, enderecaveis por query param; sheet de tela cheia no mobile, painel lateral no desktop) e (b) frente visual institucional, aplicada **pagina a pagina** (contêiner dos modais + design juntos), a partir de `Design-Language.md`. Ledger **RD1-RD16**, fases F0-F4 + FV + ciclo mobile, inventario tecnico, riscos e plano de sync de skills. Prefixo de decisoes: RD. Status: **F1 e F3 validadas, F2 implementada**; FV com `/cadastros` como exemplo (desktop conferido; **mobile RD16 C1-C8 + rodada de ajustes finos validados no device e consolidados** — CSS morto e skills sincronizados, 2026-07-23), `/samples` em conferencia (F1-F3 + ajustes + **mobile M1-M3 implementado**) **`/relatorios` (3a pagina) fechada no §2.10** — desktop R1-R11 + mobile R12 + 4 rodadas de ajuste R13-R16, consolidada em 2026-07-27 (📱 device pendente) — e **`/users` (4a pagina) fechada no §2.11** (U1-U8: tabela FV no desktop, UM painel lateral pros tres modos ver/editar/criar, `window.prompt` da senha morto, card mobile na leitura da tabela, CSS morto e docs varridos; 🖥️📱 device pendente). **E o doc mais atual sobre como /samples, /cadastros, /relatorios e /users funcionam hoje.**

21. `docs/Lotes-Visao-Geral.md`
    Uso: documento-mae (hub) do dominio Lote (o modelo `Sample`) — o que e, ciclo de vida e estados (SampleStatus/CommercialStatus), event store (SampleEvent append-only), projecao, superficies (/samples lista + detalhe drawer), sub-dominios (Classificacao/Liga/Simulador), API, testes e dividas abertas. E um HUB: aponta para os docs que detalham cada parte (Produto-e-Fluxos, Arquitetura-Tecnica, API-e-Contratos, Classificacao-Visao-Geral, Liga, Redesign §2.7/2.8) em vez de duplica-los. Status: Ativo (criado no M4 do redesenho FV de /samples, 2026-07-23).

22. `docs/Relatorios-Visao-Geral.md`
    Uso: documento-mae (hub) da pagina **Relatorios** (`/relatorios`) — as duas coisas que viram registro (**Visita** unificada = `VisitReport`, **Semanal** = `WeeklyReport`) e a que nao vira (**Informativo**, gerador de imagem); quem ve e quem cria (INFORME_ROLES / WEEKLY_REPORT_AUTHOR_ROLES / cancelar-soft so do autor), modelo de dados (incl. o orfao `CommercialVisit`), mapa de rotas de API, superficies/componentes, testes e dividas abertas (filtro por autor adiado, params do feed sem consumidor de UI). E um HUB: aponta para API-e-Contratos, Auditoria-Navegacao-por-Papel, Informativos-Plano-de-Trabalho e Redesign §2.10 em vez de duplica-los. Status: Ativo (criado na consolidacao pos-device do redesenho FV de /relatorios, 2026-07-27).

23. `docs/hardware/bipador-goldensky-j32w.md`
    Uso: guia de configuracao do leitor de QR/codigo de barras Goldensky J32W (USB sem fio, 2D) para a leitura global do sistema — modo HID Keyboard com prefixo STX + sufixo CR, e como o listener de `lib/scanner/` consome isso. Status: Ativo (referencia de hardware).

24. `docs/Shell-e-Navegacao-Plano-de-Trabalho.md`
    Uso: plano de trabalho para remover a "pagina de carregamento verde" (boot splash + page loader), tornar o navbar/shell PERSISTENTE (nunca desmonta) e definir a transicao entre paginas sem loader full-screen + a politica de cache/estado por pagina. Estrutura em duas metades: A (contexto estavel — estado atual das 5 camadas de loading, a maquina do splash, o fato do AppShell por-pagina, grafo de delecao, arquitetura-alvo de app shell persistente) e B (decisoes evolutivas — ledger SN, mapa de paginas atual->alvo, politica de estado, faseamento F1-F4). Prefixo de decisoes: SN. Status: Rascunho / em decisao (estrutura aprovada 2026-07-24; Metade A preenchida, Metade B esqueleto; decisoes SN-D1..D6 EM ABERTO). Pre-requisito: doc completo + disposicao das paginas decidida (§5.1) antes de implementar.

## Relatorios da reorganizacao

1. `docs/Passe-6A-Relatorio-Testes-Cobertura.md`
   Baseline de cobertura, inventario de testes, gaps criticos identificados (2026-04-10). Read-only, gerado pelo Passe 6A.

Relatorios de passes futuros serao adicionados nesta secao.

## Regras de manutencao

1. Documento canonico e a unica fonte de verdade para seu tema.
2. Documento de suporte pode detalhar um procedimento, mas nao pode redefinir regra de negocio, arquitetura ou runtime.
3. Backlog, fase, handoff e runbook transitario nao substituem documentacao canonica.
4. Historico textual so permanece quando agrega rastreabilidade real; o restante fica confiado ao Git.
5. Arquivos em `compose/`, `env/examples/` e `scripts/runtime/` usam `README.md` locais apenas como ponteiro para o fluxo canonico.
6. Todo arquivo `.md` adicionado a `docs/` deve ser listado neste indice no mesmo commit ou no commit seguinte. Arquivos nao listados sao considerados orfaos.
