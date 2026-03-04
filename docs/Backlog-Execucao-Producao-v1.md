# Backlog de Execucao Producao v1

Status: Ativo  
Data base: 2026-03-04  
Origem: `Plano-Producao-v1.md` + `Checklist-Servidor-OnPrem.md`  
Projeto: Rastreio Interno de Amostras

## 1. Objetivo do backlog

Converter o plano de producao em tarefas tecnicas pequenas, verificaveis e com ordem de execucao para homolog e producao on-premise.

## 2. Regras de execucao

1. Nenhum item P1 inicia antes dos P0 bloqueantes estarem concluidos.
2. Toda tarefa precisa de evidencia objetiva (arquivo alterado, comando executado, log ou output).
3. Toda mudanca de runtime deve passar por homolog antes de producao.
4. Toda tarefa que mexe em seguranca precisa de revisao tecnica antes de merge.
5. Toda tarefa concluida deve atualizar este backlog com data e responsavel.

## 3. Status padrao por item

1. `TODO`: nao iniciado.
2. `IN_PROGRESS`: em execucao.
3. `BLOCKED`: aguardando dependencia tecnica ou informacao externa.
4. `DONE`: concluido com evidencia.

## 4. Ordem macro de entrega

1. Bloco A: Higiene de repositorio.
2. Bloco B: Hardening de seguranca.
3. Bloco C: Runtime e empacotamento.
4. Bloco D: Backup e restore.
5. Bloco E: Observabilidade e operacao.
6. Bloco F: Homologacao e go-live.

## 5. Backlog detalhado

### BKA-001 - Confirmar raiz oficial do repositorio Git

- Status: `DONE` (2026-03-04: repositorio local inicializado nesta pasta, branch `main`)
- Prioridade: P0
- Esforco: S
- Dependencias: nenhuma
- Arquivos alvo: N/A
- Comandos:
1. `git rev-parse --show-toplevel`
2. `git status --short`
- Criterio de aceite:
1. Raiz Git confirmada e registrada.
2. Fluxo de branch/release definido para este projeto.
- Evidencia esperada:
1. Caminho do repositorio oficial documentado em comentario de execucao.

### BKA-002 - Higienizar `.gitignore` para producao

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: S
- Dependencias: BKA-001
- Arquivos alvo:
1. `.gitignore`
- Implementacao:
1. Incluir `.env`.
2. Incluir `*.tsbuildinfo`.
3. Incluir padrao para `*:Zone.Identifier`.
4. Revisar cobertura para artefatos locais.
- Comandos:
1. `rg -n \"^\\.env$|tsbuildinfo|Zone\\.Identifier\" .gitignore`
2. `npm run typecheck`
- Criterio de aceite:
1. Segredos locais e artefatos efemeros nao entram em versionamento.
- Evidencia esperada:
1. Diff do `.gitignore`.

### BKA-003 - Organizar arquivos soltos da raiz

- Status: `DONE` (2026-03-04)
- Prioridade: P1
- Esforco: S
- Dependencias: BKA-001
- Arquivos alvo:
1. `docs/assets/*` (novo local)
- Implementacao:
1. Mover imagens e anexos de apoio da raiz para pasta dedicada.
2. Manter apenas codigo/config na raiz.
- Comandos:
1. `find . -maxdepth 1 -type f | sort`
- Criterio de aceite:
1. Raiz sem arquivos operacionais fora do padrao de codigo.
- Evidencia esperada:
1. Estrutura final de diretorios atualizada.

### BKB-001 - Definir modo de autenticacao por ambiente

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: M
- Dependencias: BKA-002
- Arquivos alvo:
1. `src/api/v1/backend-api.js`
2. `.env.example`
3. `docs/Frontend-Runbook-v1.md`
- Implementacao:
1. Introduzir flag de ambiente para permitir ou bloquear identidade por headers.
2. Padrao em producao: headers desabilitados, somente Bearer.
3. Manter fallback apenas em contexto controlado (dev/teste).
- Comandos:
1. `npm test`
2. `npm run test:integration:db`
- Criterio de aceite:
1. Em producao, requisicao sem Bearer retorna `401`.
2. Em dev/teste, comportamento atual pode ser mantido por flag explicita.
- Evidencia esperada:
1. Teste cobrindo os dois modos.

### BKB-002 - Eliminar usuarios/senhas padrao de runtime

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: M
- Dependencias: BKB-001
- Arquivos alvo:
1. `src/auth/create-local-auth-service.js`
2. `.env.example`
3. `docs/Frontend-Runbook-v1.md`
- Implementacao:
1. Remover fallback automatico de usuarios padrao para producao.
2. Exigir `LOCAL_AUTH_USERS_JSON` valido em ambientes nao-dev.
3. Trocar exemplos por placeholders seguros.
- Comandos:
1. `npm run test:unit`
2. `npm run test:integration:db`
- Criterio de aceite:
1. Nao existe senha padrao valida em runtime produtivo.
2. Startup falha de forma explicita se config de usuarios estiver ausente/invalida.
- Evidencia esperada:
1. Teste de startup com erro esperado sem usuarios configurados.

### BKB-003 - Hardening de senha local (hash + comparacao segura)

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: L
- Dependencias: BKB-002
- Arquivos alvo:
1. `src/auth/local-auth-service.js`
2. `src/auth/create-local-auth-service.js`
3. `tests/local-auth.test.js`
4. `docs/Frontend-Runbook-v1.md`
- Implementacao:
1. Trocar senha em texto puro por hash (bcrypt/argon2/pbkdf2).
2. Garantir compatibilidade com usuarios existentes via estrategia de migracao.
3. Manter `timingSafeEqual` apenas onde fizer sentido com hash pronto.
- Comandos:
1. `npm run test:unit`
2. `npm run typecheck`
- Criterio de aceite:
1. Login compara hash e nao senha pura.
2. Nenhum usuario de exemplo publicado com senha real reutilizavel.
- Evidencia esperada:
1. Testes unitarios cobrindo senha correta/incorreta/hash invalido.

### BKB-004 - Validar segredo de auth para todos os ambientes sensiveis

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: S
- Dependencias: BKB-001
- Arquivos alvo:
1. `src/api/v1/create-backend-api.js`
2. `.env.example`
3. `docs/Frontend-Runbook-v1.md`
- Implementacao:
1. Falhar startup em `NODE_ENV=production` se `AUTH_SECRET` ausente/fraco.
2. Documentar requisito minimo de segredo.
- Comandos:
1. `NODE_ENV=production npm run build`
2. Teste de inicializacao com/sem `AUTH_SECRET`.
- Criterio de aceite:
1. Nao existe inicializacao produtiva com segredo fraco.
- Evidencia esperada:
1. Mensagem de erro clara em startup invalido.

### BKC-001 - Criar `.dockerignore` para build limpo

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: S
- Dependencias: BKA-002
- Arquivos alvo:
1. `.dockerignore` (novo)
- Implementacao:
1. Excluir `node_modules`, `.next`, `data/uploads`, logs, docs pesados e artefatos locais.
- Comandos:
1. `docker build -f Dockerfile .`
- Criterio de aceite:
1. Contexto de build enxuto e sem segredos locais.
- Evidencia esperada:
1. Tamanho de contexto reportado no build.

### BKC-002 - Criar Dockerfile de producao (multi-stage)

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: M
- Dependencias: BKC-001
- Arquivos alvo:
1. `Dockerfile` (novo)
- Implementacao:
1. Stage de dependencia/build/runtime.
2. Runtime com usuario nao-root.
3. Copia apenas do necessario para execucao.
- Comandos:
1. `docker build -t rastreio-app:prod .`
2. `docker run --rm rastreio-app:prod node -v`
- Criterio de aceite:
1. Imagem sobe com `npm run start` e acessa app.
- Evidencia esperada:
1. Build concluido e container iniciando sem erro.

### BKC-003 - Criar compose de producao (`app` + `db`)

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: M
- Dependencias: BKC-002
- Arquivos alvo:
1. `docker-compose.prod.yml` (novo)
2. `.env.example`
- Implementacao:
1. Servico `app` com healthcheck.
2. Servico `db` com volume persistente e politica de restart.
3. Volumes para uploads e dados do banco.
- Comandos:
1. `docker compose -f docker-compose.prod.yml config`
2. `docker compose -f docker-compose.prod.yml up -d`
- Criterio de aceite:
1. Stack sobe de forma repetivel em host limpo.
- Evidencia esperada:
1. `docker compose ps` com servicos `healthy`.

### BKC-004 - Publicar endpoint HTTP de healthcheck

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: S
- Dependencias: BKC-003
- Arquivos alvo:
1. `app/api/health/route.ts` (novo)
2. `app/api/v1/_lib/adapter.ts` (se necessario)
- Implementacao:
1. Expor rota publica de saude para monitoramento.
2. Retornar `200` com timestamp e status.
- Comandos:
1. `curl -i http://localhost:3000/api/health`
- Criterio de aceite:
1. Endpoint responde `200` apos startup.
- Evidencia esperada:
1. Output de `curl` no smoke test.

### BKC-005 - Formalizar variaveis de ambiente de producao

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: S
- Dependencias: BKC-003
- Arquivos alvo:
1. `.env.example`
2. `docs/Frontend-Runbook-v1.md`
3. `docs/Plano-Producao-v1.md`
- Implementacao:
1. Separar variaveis obrigatorias vs opcionais.
2. Incluir defaults seguros e exemplos sem segredos.
- Comandos:
1. Validacao manual de checklist de env.
- Criterio de aceite:
1. Operacao consegue subir ambiente somente com docs e templates.
- Evidencia esperada:
1. Lista de env obrigatorias validada em homolog.

### BKD-001 - Script de backup diario do PostgreSQL

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: M
- Dependencias: BKC-003
- Arquivos alvo:
1. `scripts/ops/backup-db.sh` (novo)
2. `docs/Runbook-Backup-Restore-v1.md` (novo)
- Implementacao:
1. Gerar dump com timestamp.
2. Compactar arquivo e registrar checksum.
- Comandos:
1. `bash scripts/ops/backup-db.sh`
- Criterio de aceite:
1. Backup gerado com sucesso e checksum gravado.
- Evidencia esperada:
1. Arquivo `.sql.gz` + arquivo de checksum.

### BKD-002 - Script de backup diario de uploads

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: S
- Dependencias: BKC-003
- Arquivos alvo:
1. `scripts/ops/backup-uploads.sh` (novo)
2. `docs/Runbook-Backup-Restore-v1.md` (novo)
- Implementacao:
1. Compactar `UPLOADS_DIR` com timestamp.
2. Gerar checksum do pacote.
- Comandos:
1. `bash scripts/ops/backup-uploads.sh`
- Criterio de aceite:
1. Backup de uploads executa sem interromper app.
- Evidencia esperada:
1. Arquivo `.tar.gz` + checksum.

### BKD-003 - Script de restore validado em homolog

- Status: `IN_PROGRESS` (automacao de drill + preflight + pacote de desbloqueio adicionados em 2026-03-04; falta executar validacao real em homolog)
- Prioridade: P0
- Esforco: M
- Dependencias: BKD-001, BKD-002
- Arquivos alvo:
1. `scripts/ops/restore-db.sh` (novo)
2. `scripts/ops/restore-uploads.sh` (novo)
3. `scripts/ops/bkd003-restore-drill.sh` (novo)
4. `ops/compose/docker-compose.homolog.override.example.yml` (novo)
5. `docs/evidence/BKD-003-restore-homolog-template.md` (novo)
6. `scripts/ops/homolog-preflight.sh` (novo)
7. `scripts/ops/collect-server-facts.sh` (novo)
8. `.env.homolog.example` (novo)
9. `docs/Pacote-Desbloqueio-Homolog-v1.md` (novo)
10. `docs/Runbook-Backup-Restore-v1.md` (novo)
- Implementacao:
1. Restaurar dump de banco em ambiente de homolog.
2. Restaurar uploads para path limpo.
3. Medir tempo real de restore.
- Comandos:
1. `bash scripts/ops/restore-db.sh <arquivo>`
2. `bash scripts/ops/restore-uploads.sh <arquivo>`
- Criterio de aceite:
1. Sistema sobe com dados restaurados e smoke test passa.
- Evidencia esperada:
1. Tempo de restore documentado (RTO observado).

### BKD-004 - Automatizar backup e retencao

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: M
- Dependencias: BKD-001, BKD-002
- Arquivos alvo:
1. `ops/systemd/rastreio-backup.service` (novo)
2. `ops/systemd/rastreio-backup.timer` (novo)
3. `scripts/ops/prune-backups.sh` (novo)
4. `docs/Runbook-Backup-Restore-v1.md` (novo)
- Implementacao:
1. Agendar backup diario automatico.
2. Implementar retencao 14 diarios, 8 semanais, 12 mensais.
- Comandos:
1. `systemctl list-timers | rg rastreio-backup`
2. `bash scripts/ops/prune-backups.sh --dry-run`
- Criterio de aceite:
1. Retencao aplicada sem apagar backup fora da politica.
- Evidencia esperada:
1. Log da rotina automatica e do prune.

### BKE-001 - Padronizar logs de API com `requestId`

- Status: `DONE` (2026-03-04)
- Prioridade: P1
- Esforco: M
- Dependencias: BKB-001
- Arquivos alvo:
1. `src/api/http-utils.js`
2. `src/api/v1/backend-api.js`
3. `docs/Runbook-Operacao-v1.md` (novo)
- Implementacao:
1. Garantir `requestId` em logs de erro.
2. Padrao consistente para troubleshooting.
- Comandos:
1. Executar rota com erro proposital e validar log.
- Criterio de aceite:
1. Todo erro de API tem `requestId` correlacionavel.
- Evidencia esperada:
1. Exemplo de log com `requestId`.

### BKE-002 - Definir rotacao de logs no host

- Status: `DONE` (2026-03-04)
- Prioridade: P1
- Esforco: S
- Dependencias: BKE-001
- Arquivos alvo:
1. `ops/logrotate/rastreio` (novo)
2. `docs/Runbook-Operacao-v1.md` (novo)
- Implementacao:
1. Definir politica de tamanho/frequencia/retencao.
- Comandos:
1. `logrotate -d ops/logrotate/rastreio`
- Criterio de aceite:
1. Rotacao acontece sem perda de log atual.
- Evidencia esperada:
1. Simulacao de logrotate com sucesso.

### BKE-003 - Definir alertas minimos de disponibilidade

- Status: `IN_PROGRESS` (runbook definido em 2026-03-04; falta integrar com monitoramento do ambiente real)
- Prioridade: P1
- Esforco: S
- Dependencias: BKC-004
- Arquivos alvo:
1. `docs/Runbook-Operacao-v1.md` (novo)
- Implementacao:
1. Alertar queda de app (`/api/health`).
2. Alertar indisponibilidade de DB.
3. Alertar picos de 5xx.
- Comandos:
1. Validacao no monitor escolhido.
- Criterio de aceite:
1. Alertas disparam para todos os cenarios minimos definidos.
- Evidencia esperada:
1. Prints/logs de disparo de alerta.

### BKF-001 - Criar script de smoke test de homolog/producao

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: M
- Dependencias: BKC-004, BKD-003
- Arquivos alvo:
1. `scripts/ops/smoke-test.sh` (novo)
2. `docs/Runbook-Deploy-OnPrem-v1.md` (novo)
- Implementacao:
1. Testar healthcheck.
2. Testar login.
3. Testar ao menos uma leitura de amostra autenticada.
- Comandos:
1. `bash scripts/ops/smoke-test.sh`
- Criterio de aceite:
1. Script retorna `exit 0` quando ambiente esta saudavel.
- Evidencia esperada:
1. Log do smoke test anexado ao deploy.

### BKF-002 - Escrever runbook de deploy e rollback

- Status: `DONE` (2026-03-04)
- Prioridade: P0
- Esforco: M
- Dependencias: BKC-003, BKF-001
- Arquivos alvo:
1. `docs/Runbook-Deploy-OnPrem-v1.md` (novo)
- Implementacao:
1. Incluir pre-check, deploy, verificacao, rollback e pos-check.
2. Incluir estrategia de rollback de app e de schema.
- Comandos:
1. Execucao de dry-run em homolog.
- Criterio de aceite:
1. Time consegue executar sem depender de conhecimento tacito.
- Evidencia esperada:
1. Registro de um dry-run completo em homolog.

### BKF-003 - Homologacao final com checklist de servidor

- Status: `TODO`
- Prioridade: P0
- Esforco: S
- Dependencias: BKF-002, `Checklist-Servidor-OnPrem.md` preenchido
- Arquivos alvo:
1. `docs/Checklist-Servidor-OnPrem.md`
- Implementacao:
1. Revisar todos os itens obrigatorios.
2. Bloquear go-live se houver pendencias P0.
- Comandos:
1. Revisao manual assinada por Infra + Aplicacao.
- Criterio de aceite:
1. Checklist sem pendencias bloqueantes.
- Evidencia esperada:
1. Checklist com aprovacao de homolog.

### BKF-004 - Gate de go-live e aprovacao final

- Status: `TODO`
- Prioridade: P0
- Esforco: S
- Dependencias: BKF-003
- Arquivos alvo:
1. `docs/Plano-Producao-v1.md`
2. `docs/Checklist-Servidor-OnPrem.md`
- Implementacao:
1. Registrar data/hora de janela.
2. Confirmar RTO/RPO aprovados.
3. Confirmar plano de comunicacao de incidente.
- Comandos:
1. Reuniao de aprovacao final.
- Criterio de aceite:
1. Go-live somente com aceite formal.
- Evidencia esperada:
1. Registro de aprovacao final.

## 6. Dependencias externas que podem bloquear backlog

1. Informacoes do servidor fisico ainda nao levantadas.
2. Definicao de dominio e certificado TLS.
3. Definicao de politica corporativa de backup externo.
4. Definicao de monitoramento/alerta padrao da empresa.

## 7. Mapa rapido de entregas por semana

1. Semana 1: BKA-001 a BKB-004.
2. Semana 2: BKC-001 a BKC-005.
3. Semana 3: BKD-001 a BKD-004.
4. Semana 4: BKE-001 a BKF-004.

## 8. Regra de qualidade para fechamento de item

1. Codigo atualizado.
2. Testes executados.
3. Documentacao atualizada.
4. Evidencia registrada.
5. Revisao tecnica concluida.
