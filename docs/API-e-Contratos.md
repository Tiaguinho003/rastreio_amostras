# API e Contratos

Status: Ativo  
Escopo: referencia oficial das rotas internas, contratos de eventos e regras de validacao  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Produto-e-Fluxos.md`, `docs/schemas/events/v1/README.md`

## Escopo da API

A API `v1` e interna ao sistema e atende o frontend web do proprio projeto. As rotas HTTP vivem em `app/api/v1`, mas a logica principal fica no backend framework-agnostic em `src/api/v1/backend-api.js`.

## Autenticacao

1. `POST /api/v1/auth/login`
   Valida credenciais, cria sessao em banco e devolve cookie HTTP-only para o navegador.
2. `POST /api/v1/auth/logout`
   Revoga a sessao atual e limpa o cookie.
3. `GET /api/v1/auth/session`
   Retorna sessao atual e dados do usuario autenticado.
4. `POST /api/v1/auth/forgot-password/request`
   Solicita codigo de recuperacao por email.
5. `POST /api/v1/auth/forgot-password/reset`
   Redefine senha com codigo valido.
6. `POST /api/v1/auth/session/expired`
   Registra expiracao de sessao quando necessario.

Regra consolidada:

1. a API aceita Bearer token assinado;
2. o frontend web usa esse token dentro de cookie HTTP-only;
3. sessoes sao persistidas em `UserSession` e podem ser revogadas.

## Rotas de amostras

### Escrita

1. `POST /api/v1/samples/receive`
   Cria evento de recebimento simples.
2. `POST /api/v1/samples/create`
   Fluxo completo de criacao, confirmacao de registro e preparacao da primeira impressao.
3. `POST /api/v1/samples/:sampleId/registration/start`
4. `POST /api/v1/samples/:sampleId/photos`
5. `POST /api/v1/samples/:sampleId/registration/confirm`
6. `POST /api/v1/samples/:sampleId/registration/update`
7. `POST /api/v1/samples/:sampleId/qr/print/request`
8. `POST /api/v1/samples/:sampleId/qr/reprint/request`
9. `POST /api/v1/samples/:sampleId/qr/print/failed`
10. `POST /api/v1/samples/:sampleId/qr/printed`
11. `POST /api/v1/samples/:sampleId/classification/start`
12. `POST /api/v1/samples/:sampleId/classification/partial`
13. `POST /api/v1/samples/:sampleId/classification/complete`
14. `POST /api/v1/samples/:sampleId/classification/update`
15. `POST /api/v1/samples/:sampleId/edits/revert`
16. `POST /api/v1/samples/:sampleId/commercial-status`
17. `POST /api/v1/samples/:sampleId/export/pdf`
18. `POST /api/v1/samples/:sampleId/invalidate`

### Leitura

1. `GET /api/v1/samples`
   Lista paginada com busca por texto, filtros de status, status comercial, safra, proprietario e periodo.
2. `GET /api/v1/samples/:sampleId`
   Retorna snapshot, anexos e preview inicial do historico.
3. `GET /api/v1/samples/:sampleId/events`
   Retorna timeline de eventos.
4. `GET /api/v1/samples/resolve`
   Resolve QR bruto para UUID ou lote interno.
5. `GET /api/v1/dashboard/pending`
   Resume filas operacionais do dashboard.

## Rotas de usuarios

### Administracao

1. `GET /api/v1/users`
2. `POST /api/v1/users`
3. `GET /api/v1/users/:userId`
4. `PATCH /api/v1/users/:userId`
5. `POST /api/v1/users/:userId/inactivate`
6. `POST /api/v1/users/:userId/reactivate`
7. `POST /api/v1/users/:userId/unlock`
8. `POST /api/v1/users/:userId/password/reset`
9. `GET /api/v1/users/audit`

### Conta propria

1. `GET /api/v1/users/me`
2. `PATCH /api/v1/users/me/profile`
3. `POST /api/v1/users/me/password`
4. `POST /api/v1/users/me/email/request-change`
5. `POST /api/v1/users/me/email/confirm-change`
6. `POST /api/v1/users/me/email/resend`
7. `POST /api/v1/users/me/initial-password-decision`

## Health e prontidao

1. `GET /api/health`
2. `GET /api/health/live`
3. `GET /api/health/ready`

## Regras contratuais importantes

1. Operacoes que mudam estado usam `expectedVersion` para concorrencia otimista.
2. Operacoes criticas usam idempotencia por escopo e chave.
3. Atualizacoes de registro e classificacao exigem motivo.
4. `resolve` aceita QR bruto, URL, UUID e lote interno embutido em texto.
5. A API retorna erros de negocio com `4xx` e mensagens explicitas do backend.
6. Uploads de imagem sao limitados por `MAX_UPLOAD_SIZE_BYTES`, com padrao de `8 MiB` por arquivo.

## Contrato de eventos

O dominio de amostras gera eventos como:

1. `SAMPLE_RECEIVED`
2. `REGISTRATION_STARTED`
3. `PHOTO_ADDED`
4. `REGISTRATION_CONFIRMED`
5. `QR_PRINT_REQUESTED`
6. `QR_PRINT_FAILED`
7. `QR_PRINTED`
8. `QR_REPRINT_REQUESTED`
9. `CLASSIFICATION_STARTED`
10. `CLASSIFICATION_SAVED_PARTIAL`
11. `CLASSIFICATION_COMPLETED`
12. `REGISTRATION_UPDATED`
13. `CLASSIFICATION_UPDATED`
14. `COMMERCIAL_STATUS_UPDATED`
15. `REPORT_EXPORTED`
16. `SAMPLE_INVALIDATED`

Regras oficiais:

1. o envelope do evento e validado por JSON Schema;
2. `actorType=USER` exige `actorUserId`;
3. eventos de transicao precisam de `fromStatus` e `toStatus`;
4. `SampleEvent` e append-only;
5. `Sample` materializa o estado atual, mas nao substitui a trilha de eventos.

## Schemas e validacao

Diretorio de schemas:

1. `docs/schemas/events/v1/base/`
2. `docs/schemas/events/v1/payloads/`
3. `docs/schemas/events/v1/events/`
4. `docs/schemas/events/v1/event.schema.json`

Comandos relevantes:

```bash
npm run validate:schemas
npm run test:contracts
npm run test:unit
npm run test:backend:integration
npm run test:integration:db
```

## Decisoes documentadas nesta consolidacao

1. `v1` e um contrato interno da aplicacao, nao uma API publica estabilizada para terceiros.
2. OCR automatico permanece fora do escopo implementado, mesmo que o contrato preveja estrutura de payload.
3. O contrato de eventos segue ativo e executavel porque os schemas em `docs/schemas/events/v1/` continuam fazendo parte da validacao do repositorio.
