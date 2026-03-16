# Guia Canonico de Runtime

Status: Ativo  
Escopo: caminho operacional canonico apos a Fase 2

## 1. Ambientes reais

Os ambientes reais deste projeto sao:

1. `development`
2. `internal-production`

`homolog` e publicacao publica permanecem como legado/opcional e nao sao o caminho principal.

Leitura complementar obrigatoria:

1. `docs/Modelo-Operacional-e-Instalacoes.md`

Esse documento define a distincao entre:

1. sistema
2. perfil operacional
3. instalacao concreta do host

## 2. Arquivos locais canonicos

### development

1. `.env.development`
2. `compose/development.yml`

### internal-production

1. `.env.internal-production`
2. `.env.internal-production.ops`
3. `compose/internal-production.yml`

## 3. Fluxo canonico de development

1. copiar `env/examples/development.env.example` para `.env.development`
2. subir banco: `scripts/runtime/compose.sh development up -d db`
3. aplicar migrations: `scripts/runtime/migrate.sh development`
4. seed quando necessario: `scripts/runtime/seed.sh development`
5. iniciar app no host com `npm run dev`
6. preflight e smoke: `scripts/runtime/preflight.sh development` e `scripts/runtime/smoke.sh development`
7. backup quando necessario: `scripts/runtime/backup.sh development`

Observacoes:

1. `development` continua descartavel.
2. Runtime local esperado fica em `./.runtime/development/*`.
3. `.env` ainda pode ser usado como fallback legado, mas o caminho canonico agora e `.env.development`.

## 4. Fluxo canonico de internal-production

1. copiar `env/examples/internal-production.env.example` para `.env.internal-production`
2. copiar `env/examples/internal-production.ops.env.example` para `.env.internal-production.ops`
3. rodar preflight: `scripts/runtime/preflight.sh internal-production`
4. subir stack: `scripts/runtime/compose.sh internal-production up -d --build`
5. aplicar migrations: `scripts/runtime/migrate.sh internal-production`
6. seed quando necessario: `scripts/runtime/seed.sh internal-production`
7. validar: `scripts/runtime/smoke.sh internal-production`
8. backup quando necessario: `scripts/runtime/backup.sh internal-production`

Handoff para outro operador/servidor:

1. `docs/Handoff-Implantacao-Internal-Production.md`

Observacoes:

1. `internal-production` usa nome de projeto Compose proprio.
2. A aplicacao usa `APP_PORT=3001` por padrao no modelo canonico para coexistir com o `development` no mesmo host.
3. O PostgreSQL canonico de `internal-production` fica exposto apenas em `127.0.0.1:${INTERNAL_PRODUCTION_DB_PORT}` para permitir scripts host-side sem expor o banco para a LAN.
4. Uploads, outbox e backups devem ficar fora do repositorio.
5. O backup canonico de `internal-production` deve funcionar mesmo quando o host nao tiver `pg_dump`, usando o servico `db` do Compose.

## 5. Politica canonica de sessao/cookie

Variavel:

1. `SESSION_COOKIE_SECURE`

Valores suportados:

1. `false`: desabilita cookie `Secure` mesmo em `NODE_ENV=production`; este e o valor recomendado para o piloto LAN em HTTP interno.
2. `auto`: usa `Secure` apenas quando o request realmente chega como HTTPS.
3. `true`: forca cookie `Secure`.

Regras:

1. `development` pode usar `false`.
2. `internal-production` em LAN/HTTP pode usar `false`.
3. quando houver HTTPS interno ou proxy confiavel, migrar para `auto` ou `true`.

## 6. O que continua legado

1. `docker-compose.yml`
2. `docker-compose.prod.yml`
3. `.env.example`
4. `.env.prod.example`
5. `.env.homolog.example`
6. `scripts/ops/homolog-preflight.sh`
7. `ops/compose/docker-compose.homolog.override.example.yml`
8. `ops/nginx/rastreio.public.conf.example`

Esses artefatos continuam no repositorio, mas nao representam mais o caminho principal.

## 7. Host piloto atual vs servidor real

O host piloto atual pode ter adaptacoes que nao pertencem ao modelo geral.

Exemplos comuns:

1. path persistente especifico do host piloto
2. ajustes de rede do host piloto
3. detalhes de firewall/proxy locais
4. qualquer referencia a WSL2, Windows ou tunelamento de porta

Regra:

1. essas adaptacoes podem existir para viabilizar o piloto
2. mas nao devem ser promovidas como definicao oficial do `internal-production`
3. ao levar o sistema para o servidor real, o que deve ser replicado e o **perfil operacional**, nao a gambiarra do host piloto

## 8. O que ainda pode ir para a Fase 3

1. reduzir a duplicacao transitória entre canonicos e legados
2. consolidar runbooks antigos
3. redefinir o destino final de `homolog`
