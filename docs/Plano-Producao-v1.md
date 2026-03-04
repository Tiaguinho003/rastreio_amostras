# Plano de Organizacao e Producao v1

Status: Proposto  
Data base do diagnostico: 2026-03-04  
Projeto: Rastreio Interno de Amostras

Backlog executavel relacionado: `docs/Backlog-Execucao-Producao-v1.md`

## 1. Objetivo

Organizar o sistema para deploy em servidor fisico on-premise com operacao estavel, seguranca minima para producao, backup/restore e procedimento de rollout/rollback.

## 2. Estado atual confirmado (2026-03-04)

1. Aplicacao Next.js fullstack com App Router, API em `app/api/v1` e dominio em `src/*`.
2. Persistencia PostgreSQL + Prisma com migrations versionadas em `prisma/migrations`.
3. Regras criticas de auditoria e append-only no banco (triggers e constraints nas migrations).
4. Upload local em disco via `UPLOADS_DIR` (MVP).
5. Pipeline CI de contratos/build/testes em `.github/workflows/contracts.yml`.
6. Variaveis de ambiente atuais: `DATABASE_URL`, `AUTH_SECRET`, `LOCAL_AUTH_USERS_JSON`, `UPLOADS_DIR`.
7. `npm run typecheck`, `npm run build`, `npm test` e `npm run test:integration:db` executaram com sucesso no ambiente local.

## 3. Gaps para producao identificados

### P0 (bloqueia producao)

1. Auth aceita fallback por header (`x-user-id`/`x-user-role`) se nao houver Bearer valido.
2. Existe usuario/senha padrao no codigo e no `.env.example`.
3. `docker-compose.yml` atual sobe somente banco; nao existe empacotamento oficial do app para producao.
4. Nao existe endpoint HTTP de healthcheck publicado para orquestracao/monitoramento.
5. Nao existe runbook de deploy/rollback operacional no repositorio.
6. Nao existe rotina versionada de backup/restore (somente diretriz documental).

### P1 (recomendado antes de go-live)

1. `.env` nao esta listado no `.gitignore`.
2. Diretorio raiz contem artefatos locais (imagens soltas, arquivos `:Zone.Identifier`, `.next` gerado localmente).
3. Estrategia de logs/rotacao e alertas ainda nao esta formalizada.
4. Auth MVP ainda sem hash de senha/rotacao de credenciais/revogacao de token.

## 4. Definicao de pronto para producao (DoD)

1. Deploy repetivel por procedimento documentado (homolog e producao).
2. Aplicacao sobe com healthcheck HTTP e smoke test de API.
3. Migrations aplicadas apenas com `prisma migrate deploy`.
4. Sem credenciais padrao em runtime.
5. Auth em producao sem fallback inseguro por headers.
6. Backup automatico de banco e uploads com restore testado.
7. Logs centralizados no host com rotacao e retencao definidas.

## 5. Plano de execucao por fases

### Fase 0 - Higiene de repositorio e baseline

Objetivo: limpar estrutura para reduzir risco operacional.

1. Ajustar `.gitignore` para incluir `.env`, `*.tsbuildinfo` e arquivos locais nao versionaveis.
2. Mover arquivos de apoio da raiz para pasta dedicada (`docs/assets` ou similar) quando forem necessarios.
3. Remover arquivos `:Zone.Identifier` e demais artefatos do Windows.
4. Confirmar local oficial do repositorio Git (na pasta atual nao foi detectado `.git`).

Saida esperada:
1. Repositorio limpo e previsivel para build/deploy.

### Fase 1 - Hardening minimo de seguranca (P0)

Objetivo: eliminar riscos de autenticacao e credencial padrao.

1. Tornar Bearer obrigatorio em producao (desabilitar fallback `x-user-id`/`x-user-role`).
2. Remover usuarios padrao do codigo para ambiente de producao.
3. Definir politica de credenciais locais (hash de senha + troca inicial obrigatoria).
4. Revisar `.env.example` com placeholders seguros e sem segredos reais.
5. Validar startup fail-fast para `AUTH_SECRET` fraco ou ausente.

Saida esperada:
1. API nao aceita autenticacao insegura no ambiente produtivo.
2. Nao existe senha padrao ativa em producao.

### Fase 2 - Empacotamento e runtime de producao (P0)

Objetivo: tornar deploy reproduzivel no servidor fisico.

1. Criar `Dockerfile` da aplicacao Next.js em modo producao.
2. Criar `docker-compose.prod.yml` com servicos `app` e `db` (ou apenas `app` se DB externo).
3. Publicar endpoint HTTP de healthcheck (`/api/health`).
4. Definir volumes persistentes:
5. Banco (`/var/lib/postgresql/data` ou volume nomeado).
6. Uploads (`UPLOADS_DIR` em path persistente no host).
7. Definir politica de restart e healthchecks no compose.

Saida esperada:
1. `docker compose -f docker-compose.prod.yml up -d` sobe stack completa.
2. Healthcheck retorna `200` apos boot.

### Fase 3 - Backup, restore e dados (P0)

Objetivo: garantir recuperacao operacional.

1. Criar scripts versionados de backup:
2. Dump PostgreSQL diario.
3. Compactacao de uploads diarios.
4. Criar script de restore validado em homolog.
5. Automatizar execucao (cron/systemd timer) e retencao:
6. 14 backups diarios.
7. 8 backups semanais.
8. 12 backups mensais.
9. Definir local de armazenamento secundario (outro disco/NAS/servidor de backup).

Saida esperada:
1. Procedimento de restore com tempo medido e documentado.

### Fase 4 - Observabilidade e operacao (P1)

Objetivo: facilitar suporte e incidentes.

1. Definir formato de log (JSON ou texto estruturado).
2. Implementar rotacao de logs no host.
3. Definir alertas minimos:
4. app indisponivel.
5. db indisponivel.
6. erro HTTP 5xx acima de limiar.
7. Documentar runbook de resposta a incidente.

Saida esperada:
1. Operacao consegue detectar e reagir a falhas sem acesso ao codigo.

### Fase 5 - Homologacao final e go-live

Objetivo: reduzir risco de entrada em producao.

1. Executar checklist de servidor on-premise completo.
2. Rodar validacao pre-deploy:
3. `npm ci`
4. `npm run prisma:generate`
5. `npm run prisma:migrate:deploy`
6. `npm run build`
7. `npm test`
8. Executar smoke test funcional dos fluxos criticos:
9. login.
10. criar amostra.
11. upload de foto.
12. confirmar registro.
13. fluxo de impressao QR.
14. iniciar/finalizar classificacao.
15. exportar PDF.
16. Definir janela de mudanca e plano de rollback.

Saida esperada:
1. Aceite tecnico para entrada em producao.

## 6. Sequencia recomendada de execucao

1. Semana 1: Fase 0 + Fase 1.
2. Semana 2: Fase 2.
3. Semana 3: Fase 3 + Fase 4.
4. Semana 4: Fase 5 e go-live controlado.

## 7. Dependencias externas (ainda pendentes)

1. Informacoes completas do servidor fisico (hardware, SO, rede, seguranca, backup).
2. Definicao se PostgreSQL ficara no mesmo host da aplicacao ou em host dedicado.
3. Definicao de dominio/TLS e politica de acesso interno/externo.

## 8. Riscos principais e mitigacao

1. Risco: deploy sem hardening de auth.
2. Mitigacao: bloquear go-live sem conclusao da Fase 1.
3. Risco: perda de dados por falha de disco.
4. Mitigacao: backup automatico + restore testado (Fase 3).
5. Risco: indisponibilidade sem diagnostico rapido.
6. Mitigacao: healthcheck, logs e alertas minimos (Fase 2 e 4).
