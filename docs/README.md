# Documentacao Canonica

Status: Ativo  
Escopo: indice oficial, ordem de leitura e fronteira de autoridade da documentacao  
Ultima revisao: 2026-03-16  
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
6. `docs/Homologacao-Google-Cloud.md`
   Funcao: runbook oficial de homologacao no Google Cloud com Cloud Run, Cloud SQL, Cloud Storage e Cloud Run Jobs.

## Documentos de suporte

1. `docs/Checklist-Homologacao-Cloud-Run.md`
   Uso: checklist operacional de pre-push, deploy e aceite funcional para `cloud-homolog` no Cloud Run.
2. `docs/Teste-Mobile-Camera-Local.md`
   Uso: validar camera mobile em desenvolvimento local com HTTPS.
3. `docs/schemas/events/v1/README.md`
   Uso: navegar pelos schemas JSON do contrato de eventos.
4. `scripts/gcp/README.md`
   Uso: localizar os wrappers operacionais da homologacao Google Cloud.
5. `docs/Conferencia-Fases-1a4.md`
   Uso: checklist oficial de conferencia das fases 1 a 4 com banco, contratos, backend e regressao.

## Regras de manutencao

1. Documento canonico e a unica fonte de verdade para seu tema.
2. Documento de suporte pode detalhar um procedimento, mas nao pode redefinir regra de negocio, arquitetura ou runtime.
3. Backlog, fase, handoff e runbook transitario nao substituem documentacao canonica.
4. Historico textual so permanece quando agrega rastreabilidade real; o restante fica confiado ao Git.
5. Arquivos em `compose/`, `env/examples/` e `scripts/runtime/` usam `README.md` locais apenas como ponteiro para o fluxo canonico.
