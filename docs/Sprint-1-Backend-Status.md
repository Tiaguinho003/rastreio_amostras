# Sprint 1 Backend - Status de Implementacao

Data: 2026-02-27
Escopo: preparar backend para inicio de front de teste

Atualizacao: 2026-02-28
- Rotas Next.js em `app/api/v1` expostas para o contrato v1 completo.

## 1. Entregas concluidas

- Contrato de eventos v1 validado por schema (Ajv) e testes.
- Materializacao em PostgreSQL via Prisma com:
- `sample` (snapshot atual)
- `sample_event` (timeline append-only)
- `sample_attachment` (fotos)
- `print_job` (fila/resultado de impressao)
- Servico de comandos do dominio (`SampleCommandService`) cobrindo fase 1 e fase 2.
- Servico de leitura (`SampleQueryService`) para listas, detalhe e dashboard.
- Upload local de fotos (`LocalUploadService`) com persistencia em disco.
- Auth local MVP (`LocalAuthService`) com token Bearer HMAC.
- Adaptador de API v1 framework-agnostico (`createBackendApiV1`).

## 2. Garantias tecnicas ativas

- Idempotencia por `(sampleId, idempotencyScope, idempotencyKey)`.
- Unicidade por tentativa de impressao `(sampleId, printAction, attemptNumber)`.
- Concorrencia otimista por `expectedVersion`.
- Atomicidade transacional (`Sample` + `SampleEvent` + `PrintJob`/`Attachment`).
- `sample_event` append-only (trigger bloqueia update/delete).
- `INVALIDATED` terminal com bloqueio de novos eventos.

## 3. Testes

- Unit:
- `tests/event-contract.test.js`
- `tests/local-auth.test.js`
- Integracao DB:
- `tests/event-contract-db.integration.test.js`
- `tests/sample-backend-sprint1.integration.test.js`

## 4. Pronto para front de teste?

Sim. O backend ja fornece camada de comandos + leitura + auth + upload com regras de negocio aplicadas.

## 5. Pendencias fora do Sprint 1

- OCR worker real e processamento de imagem (no momento apenas contrato/eventos).
- Telemetria centralizada (Sentry/ELK) e dashboards de operacao.
- Hardening de auth para producao (hash de senha, revogacao de token, refresh token).
