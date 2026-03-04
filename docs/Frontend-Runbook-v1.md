# Frontend Runbook v1 (Fase 1 + Fase 2)

## 1. Pre-requisitos

- PostgreSQL acessivel no `DATABASE_URL`
- Migrations aplicadas (`npm run prisma:migrate:deploy`)
- Variaveis em `.env`:
  - `DATABASE_URL`
  - `AUTH_SECRET`
  - `AUTH_HEADER_FALLBACK_ENABLED`
  - `LOCAL_AUTH_ALLOW_PLAINTEXT_PASSWORDS`
  - `LOCAL_AUTH_USERS_JSON`
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

## 3. Usuarios locais MVP

Formato recomendado de usuario local:

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "username": "admin",
    "passwordHash": "$2b$10$...",
    "role": "ADMIN",
    "displayName": "Administrador"
  }
]
```

Gerar hash bcrypt (exemplo):

```bash
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('trocar-esta-senha', 10));"
```

Regras:
1. Em producao, use `LOCAL_AUTH_ALLOW_PLAINTEXT_PASSWORDS=false`.
2. Em producao, use `AUTH_HEADER_FALLBACK_ENABLED=false`.
3. Em producao, nao usar senha em texto puro no JSON de usuarios.

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
