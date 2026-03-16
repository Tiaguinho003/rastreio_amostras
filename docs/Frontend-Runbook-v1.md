# Frontend Runbook v1 (Fase 1 + Fase 2)

Status: Historico de desenvolvimento local. Para deploy/homolog/producao, siga primeiro `docs/README.md` e os runbooks operacionais.

## 1. Pre-requisitos

- PostgreSQL acessivel no `DATABASE_URL`
- Migrations aplicadas (`npm run prisma:migrate:deploy`)
- Variaveis em `.env`:
  - `DATABASE_URL`
  - `AUTH_SECRET`
  - `BOOTSTRAP_ADMIN_*`
  - `EMAIL_TRANSPORT`
  - `SMTP_*` (quando `smtp`)
  - `UPLOADS_DIR`

Recomendado para ambiente local:
- `docker compose up -d db` (usa `docker-compose.yml` do projeto)

## 2. Comandos

```bash
npm install
npm run db:up
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

Acesse `http://localhost:3000/login`.

## 3. Bootstrap inicial do primeiro administrador

Variaveis minimas:

```bash
BOOTSTRAP_ADMIN_FULL_NAME="Administrador"
BOOTSTRAP_ADMIN_USERNAME="admin"
BOOTSTRAP_ADMIN_EMAIL="admin@example.local"
BOOTSTRAP_ADMIN_PASSWORD="change-me-now"
```

Observacoes:

1. O frontend usa cookie de sessao `HttpOnly`, nao token salvo em `localStorage`.
2. O bootstrap e usado apenas quando o banco ainda nao possui usuarios.
3. `LOCAL_AUTH_USERS_JSON` ficou restrito a compatibilidade de seed/testes legados.

## 4. Fluxo de teste recomendado

1. Login
2. Ir em `Nova amostra`
3. Preencher `owner`, `sacks`, `harvest`, `originLot` e clicar `Criar amostra`
4. Conferir etiqueta e imprimir QR
5. Registrar falha (opcional)
6. Marcar como impresso
7. Iniciar classificacao
8. Salvar parcial (opcional)
9. Concluir classificacao

## 5. Rotas adicionais de operacao (v1 completo)

- Reimpressao QR:
  - `POST /api/v1/samples/:sampleId/qr/reprint/request`
- Correcao de registro:
  - `POST /api/v1/samples/:sampleId/registration/update`
- Correcao de classificacao:
  - `POST /api/v1/samples/:sampleId/classification/update`
- Invalida amostra (somente `ADMIN`):
  - `POST /api/v1/samples/:sampleId/invalidate`
- Timeline paginada:
  - `GET /api/v1/samples/:sampleId/events?limit=&afterSequence=`

## 6. Regras validas no sistema

- Sem foto nao confirma registro
- `expectedVersion` protege concorrencia (`409`)
- Tudo grava em evento append-only
- `INVALIDATED` permanece terminal
- OCR automatico por extracao da foto permanece fora de escopo nesta versao
