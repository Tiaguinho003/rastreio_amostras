# Base Operacional Canonica - Fase 1

Status: Ativo  
Escopo: fundacao estrutural da reorganizacao operacional

## 1. Ambientes reais formalizados

Nesta fase, o projeto passa a formalizar apenas estes ambientes reais:

1. `development`
2. `internal-production`

`homolog` e artefatos de publicacao publica continuam preservados apenas como legado/compatibilidade/documentacao historica. Eles nao sao o caminho canonico aberto nesta fase.

## 2. Estrutura canonica criada

Pastas novas:

1. `compose/`
2. `env/examples/`
3. `scripts/runtime/`

Arquivos canonicos principais:

1. `compose/development.yml`
2. `compose/internal-production.yml`
3. `env/examples/development.env.example`
4. `env/examples/internal-production.env.example`
5. `env/examples/internal-production.ops.env.example`
6. `scripts/runtime/compose.sh`
7. `scripts/runtime/migrate.sh`
8. `scripts/runtime/seed.sh`
9. `scripts/runtime/smoke.sh`
10. `scripts/runtime/preflight.sh`

## 3. Arquivos locais esperados

Arquivos locais nao versionados previstos pelo novo caminho:

1. `.env.development`
2. `.env.internal-production`
3. `.env.internal-production.ops`

Runtime descartavel de desenvolvimento:

1. `./.runtime/development/uploads`
2. `./.runtime/development/email-outbox`

## 4. Compatibilidade preservada nesta fase

Artefatos mantidos:

1. `docker-compose.yml`
2. `docker-compose.prod.yml`
3. `.env.example`
4. `.env.prod.example`
5. `.env.homolog.example`
6. `scripts/ops/*`

Esses artefatos continuam no repositorio para evitar quebra do fluxo atual. O novo caminho canonico existe em paralelo.

## 5. Limites intencionais da Fase 1

Esta fase nao altera:

1. politica de cookie/sessao
2. comportamento de autenticacao
3. logica de banco e migrations
4. destino final de `homolog`
5. artefatos de publicacao publica

Tambem nao remove legado. Apenas reclassifica e prepara a migracao.

## 6. O que fica para a Fase 2

1. consolidar o fluxo de Compose e reduzir duplicacao transitória
2. alinhar profundamente envs, scripts de operacao e runtime
3. revisar comportamento sensivel de sessao/cookie para LAN
4. redefinir o papel final de `homolog` e dos artefatos publicos
5. atualizar runbooks antigos para o modelo canonico completo
