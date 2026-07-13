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
7. `docs/Contratos-Plano-de-Trabalho.md`
   Uso: organizacao, analise, decisoes e execucao da feature de Contratos (pagina "Contratos" + o "Fechamento" = contrato de compra e venda de cafe gerado em PDF apos a venda, alem do Espelho de Corretagem e da pagina Financeiro). Status: Em construcao.
8. `docs/Revisao-Pagina-Lotes-Plano-de-Trabalho.md`
   Uso: plano faseado da revisao da pagina de Lotes (lista /samples) — catalogo dos 29 achados (bugs, gargalos, dados, a11y, codigo morto), decisoes, status por fase e protocolo de verificacao. Status: fases 1-6 concluidas e EM PROD; deferidos (CSS legado M1 + testes de regressao #7) resolvidos no ciclo LOT da Revisao Geral (2026-07-07); falta validacao no device.
9. `docs/Auditoria-Navegacao-por-Papel.md`
   Uso: mapeamento read-only de quais paginas cada papel de usuario acessa e onde estao na navegacao (sidebar desktop, tabbar mobile, menu do avatar). Status: Ativo (referencia mantida para uso futuro). COMMERCIAL/CLASSIFIER/REGISTRATION/CADASTRO/ADMIN detalhados; PROSPECTOR resumido (app distinto, mapeamento detalhado adiado).
10. `docs/Revisao-Geral-Plano-de-Trabalho.md`
    Uso: documento-mae da revisao geral do app, pagina por pagina e por papel — roteiro padrao (R1-R8) que orienta toda sessao de revisao, status por pagina, convencoes de achados/decisoes/pendencias e fases globais (varredura de codigo morto + organizacao de pastas). Status: Em andamento (F0).
11. `docs/Dashboard-Visao-Geral.md` + `docs/Dashboard-Plano-de-Trabalho.md`
    Uso: documentacao canonica do dashboard (par mae + plano). `Dashboard-Visao-Geral.md` = documento-mae do funcionamento atual (fluxo, layout desktop/mobile, disponibilidade por papel, cards, rotas de API, projecoes e regras). `Dashboard-Plano-de-Trabalho.md` = backlog, decisoes e execucao do check-up do dashboard. Substituem o antigo `Eventos-Dashboard-Plano-de-Trabalho.md` (absorvido e removido em 2026-07-12, decisao DSB-D1; historico no Git). Status: Visao Geral Ativo; Plano em andamento.
12. `docs/Aprovacoes-Plano-de-Trabalho.md`
    Uso: reformulacao da feature de Aprovacao (etiqueta impressa auditada -> fluxo com papeis: quem cria o contrato sinaliza se precisa de aprovacao -> pendencia pro aprovador -> executa -> evento no dashboard F2). Estado atual da aprovacao = D107-D126 em Contratos-Plano-de-Trabalho.md. Status: Em decisao — Bloco 1 (o sinal) travado (AP1-AP5); Bloco 2 (apresentacao) pausado (Flavio repensando o funcionamento).
13. `docs/Embarque-Plano-de-Trabalho.md`
    Uso: novo tipo de evento para o card de Eventos do dashboard — o embarque (cafe carregado no caminhao), mesmo dia do faturamento mas distinto, gated pela modalidade (nao ocorre em "Disponivel"). Espelha a Aprovacao (booleano requiresShipment + shipmentDate), com ciclo proprio (pendente -> finalizado) independente do pagamento. Status: Em decisao — Bloco 1 (a logica) registrado (EMB1-EMB6); Bloco 2 (apresentacao no calendario) a fazer.
14. `docs/Central-de-Contratos-Plano-de-Trabalho.md`
    Uso: unificacao das 4 superficies ligadas ao contrato de venda (Contratos, Financeiro, Aprovacoes, Embarque) numa unica pagina com sub-abas. Autoridade da "casca" (pagina, abas, esquema de URL, matriz de acesso por papel aba a aba, navegacao). F1 = fundir Contratos + Financeiro (ja sao paginas) e criar Aprovacoes + Embarque como abas vazias. Prefixo de decisao CC. Status: F1 IMPLEMENTADA (C1-C4, 2026-07-09; hub /contratos com sub-abas + redirect /financeiro + nav unificada) — validar no device; F2+ (conteudo de Aprovacoes/Embarque) em aberto.
15. `docs/Custo-Operacional-Analise.md`
    Uso: **documento MESTRE de custo** (detalhado) — nuvem (GCP + OpenAI, ~R$ 193/mes) + materiais de impressao (impressora/etiqueta/ribbon, ~R$ 38/mes) = **TCO ~R$ 231/mes**; config real da producao (gcloud read-only), modelo de crescimento, projecao de 3 anos, recomendacoes e registro de atualizacoes. Padrao: atualizar ESTE md primeiro a cada evolucao, depois regenerar o **PDF enxuto para o cliente** (`docs/assets/Custo-Operacional-Analise.pdf`, 1 pagina) via `scripts/cost-report/build-cost-report.mjs`. Status: atualizado 2026-07-12.
16. `docs/Classificacao-Plano-de-Trabalho.md`
    Uso: pipeline da extracao de classificacao via IA (gpt-4o, few-shot, canonizacao dos valores, telemetria, retry). Status: Em andamento.
17. `docs/Liga-Plano-de-Trabalho.md`
    Uso: feature de Liga (blend de amostras) — composicao, cascata recursiva de movimentos, safra/proprietario reativos, viabilidade quantitativa da venda. Status: Em andamento.
18. `docs/Etiqueta-de-Envio-Plano-de-Trabalho.md`
    Uso: etiqueta de envio com QR que abre o laudo publico (Firebase Hosting), com revogacao ao cancelar. Status: Em andamento.

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
