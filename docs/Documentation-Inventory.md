# Inventario e Consolidacao da Documentacao

Status: Ativo  
Escopo: matriz de destino dos documentos revisados e decisoes de consolidacao  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/README.md`, `docs/Produto-e-Fluxos.md`, `docs/Operacao-e-Runtime.md`

## Matriz de destino

| Arquivo ou grupo | Classificacao final | Destino | Motivo |
| --- | --- | --- | --- |
| `README.md` | canonico | mantido e criado na raiz | faltava porta de entrada oficial do projeto |
| `docs/README.md` | canonico | reescrito | agora funciona como indice oficial e nao apenas lista historica |
| `docs/Produto-e-Fluxos.md` | canonico | criado | concentra objetivo, papeis, estados e regras do produto |
| `docs/Arquitetura-Tecnica.md` | canonico | criado | concentra stack, componentes, dados e limites tecnicos |
| `docs/Operacao-e-Runtime.md` | canonico | criado | concentra modelo operacional, ambientes, envs, scripts e operacao |
| `docs/API-e-Contratos.md` | canonico | criado | concentra rotas, eventos, contratos e validacao |
| `docs/Documentation-Inventory.md` | canonico | criado | registra a consolidacao desta revisao |
| `docs/schemas/events/v1/*` | suporte tecnico | mantido | continua sendo artefato executavel do contrato de eventos |
| `compose/README.md` | suporte tecnico | mantido e reduzido | agora apenas aponta para o fluxo canonico |
| `env/examples/README.md` | suporte tecnico | mantido e reduzido | agora apenas aponta para o fluxo canonico |
| `scripts/runtime/README.md` | suporte tecnico | mantido e reduzido | agora apenas aponta para o fluxo canonico |
| `docs/API-v1-Frontend-Contract.md` | consolidar | absorvido em `docs/API-e-Contratos.md` e removido | contrato de API permanecia valido, mas fragmentado |
| `docs/Arquitetura-MVP-v1.md` | consolidar | absorvido em `docs/Arquitetura-Tecnica.md` e removido | arquitetura evoluiu e precisava de linguagem atual |
| `docs/Event-Contract-v1.md` | consolidar | absorvido em `docs/API-e-Contratos.md` e removido | regras de eventos agora vivem ao lado das rotas e schemas |
| `docs/State-Machine-v1.md` | consolidar | absorvido em `docs/Produto-e-Fluxos.md` e removido | ciclo de vida da amostra virou parte do documento funcional oficial |
| `docs/Contract-Validation-Guide.md` | consolidar | absorvido em `docs/API-e-Contratos.md` e removido | guia tecnico duplicava informacao do contrato e dos testes |
| `docs/Modelo-Operacional-e-Instalacoes.md` | consolidar | absorvido em `docs/Operacao-e-Runtime.md` e removido | modelo conceitual continua valido, mas agora dentro do fluxo oficial |
| `docs/Runtime-Canonical-Guide.md` | consolidar | absorvido em `docs/Operacao-e-Runtime.md` e removido | runtime canonico precisava de consolidacao unica |
| `docs/Handoff-Implantacao-Internal-Production.md` | consolidar | absorvido em `docs/Operacao-e-Runtime.md` e removido | handoff virou parte do fluxo oficial de instalacao |
| `docs/Runtime-Base-Phase-1.md` | obsoleto | removido | documento de fase nao deve competir com documentacao viva |
| `docs/Frontend-Runbook-v1.md` | obsoleto | removido | historico de desenvolvimento local superado pela estrutura atual |
| `docs/Sprint-1-Backend-Status.md` | obsoleto | removido | status de sprint nao deve permanecer como documentacao funcional |
| `docs/Plano-Producao-v1.md` | obsoleto | removido | plano transitorio substituido por documentacao canonica e checklist |
| `docs/Backlog-Execucao-Producao-v1.md` | obsoleto | removido | backlog operacional nao deve disputar autoridade com runbook canonico |
| `docs/Guia-Implantacao-e-Atualizacao-Producao-v1.md` | duplicado | removido | conteudo foi condensado no runtime canonico |
| `docs/Runbook-Deploy-OnPrem-v1.md` | duplicado | removido | conteudo foi condensado no runtime canonico |
| `docs/Runbook-Operacao-v1.md` | duplicado | removido | health, logs e operacao foram condensados no runtime canonico |
| `docs/Runbook-Backup-Restore-v1.md` | duplicado | removido | backup ficou no runtime canonico; restore continua manual e explicitado la |
| `docs/Pacote-Desbloqueio-Homolog-v1.md` | obsoleto | removido | `homolog` deixou de ser caminho oficial |
| `docs/evidence/README.md` | obsoleto | removido | evidencia operacional foi descontinuada como estrutura dedicada |
| `docs/evidence/BKD-003-restore-homolog-template.md` | obsoleto | removido | template dependia de fluxo legado de homolog |
| `docs/assets/Safras-logo-branco.png` | suporte tecnico | mantido | asset visual |
| `docs/assets/Safras-logo-ori.png` | suporte tecnico | mantido | asset visual |
| `docs/assets/Documento — Rastreio Interno de Amostras.pdf` | historico util | mantido | arquivo de apoio sem autoridade textual sobre os docs canonicos |

## Pontos de entrada revisados

| Ponto de entrada | Acao | Resultado |
| --- | --- | --- |
| `package.json` | atualizado | metadata agora descreve o sistema como aplicacao fullstack e nao apenas validacao de contratos |
| `app/` | revisado | fluxo funcional consolidado em dashboard, camera, amostras, usuarios e configuracoes |
| `prisma/schema.prisma` | revisado | regras de dados, eventos, sessoes e auditoria refletidas na documentacao canonica |
| `compose/` | revisado | `development` confirmado como unico ambiente local oficial; `cloud-homolog` e `cloud-production` operam por Cloud Run sem Compose |
| `env/examples/` | revisado | exemplos canonicos confirmados por ambiente |
| `scripts/runtime/` | revisado | wrappers oficiais confirmados para compose, migrate, seed, preflight e smoke |

## Decisoes consolidadas nesta revisao

1. O sistema deixou de ser descrito como repositorio de contratos. A descricao oficial agora e a de uma aplicacao fullstack operacional.
2. Os ambientes oficiais sao `development` (local), `cloud-homolog` (Cloud Run de homologacao) e `cloud-production` (Cloud Run de producao). `internal-production` e qualquer aparato on-premise foram descontinuados.
3. O registro da amostra e manual. Nao ha foto no fluxo de registro.
4. A conclusao da classificacao exige foto de classificacao. Sem essa foto a amostra nao pode sair de `CLASSIFICATION_IN_PROGRESS`.
5. O status comercial e uma dimensao separada e so pode mudar quando a amostra esta `CLASSIFIED`.
6. A unica permissao rigidamente segregada por papel no estado atual e a administracao de usuarios, restrita a `ADMIN`.
7. As operacoes do dominio de amostras aceitam qualquer usuario autenticado no backend atual. Os papeis `CLASSIFIER`, `REGISTRATION` e `COMMERCIAL` funcionam hoje mais como marcacao organizacional do que como barreira tecnica por modulo.
8. Os testes existentes no repositorio sao unitarios, de contrato e de integracao. Nao existe suite E2E implementada hoje.
