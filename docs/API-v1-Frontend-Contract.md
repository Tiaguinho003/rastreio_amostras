# API v1 - Frontend Contract (Sprint 1 Backend)

Status: Implementado no backend base e exposto nas rotas Next.js (`app/api/v1`)
Data: 2026-02-27

## 0. Observacao de escopo atual

- OCR por extracao automatica de informacoes da foto **nao faz parte deste ciclo**.
- O endpoint de foto (`/photos`) permanece para upload/anexo da imagem e auditoria de registro.

## 1. Autenticacao

### POST `/api/v1/auth/login`
Body:
```json
{
  "username": "classificador",
  "password": "classificador123"
}
```

Response 200:
```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresAt": "2026-02-27T23:00:00.000Z",
  "user": {
    "id": "00000000-0000-0000-0000-000000000002",
    "username": "classificador",
    "role": "CLASSIFIER",
    "displayName": "Classificador"
  }
}
```

Headers para endpoints protegidos:
- `Authorization: Bearer <token>`
- fallback dev (sem token): `x-user-id` + `x-user-role`

## 2. Escrita (Comandos)

### POST `/api/v1/samples/receive`
- cria `SAMPLE_RECEIVED`

### POST `/api/v1/samples/create`
- cria fluxo inicial completo de forma idempotente por `clientDraftId`
- body: `clientDraftId`, `owner`, `sacks`, `harvest`, `originLot`, `receivedChannel?`, `notes?`, `printerId?`
- aceita `multipart/form-data` com `arrivalPhoto` (opcional)
- eventos aplicados (quando necessario): `SAMPLE_RECEIVED` -> `REGISTRATION_STARTED` -> `REGISTRATION_CONFIRMED` -> `QR_PRINT_REQUESTED`
- resposta inclui `sample`, `draft`, `qr` e deixa a amostra pronta para impressao (`QR_PENDING_PRINT`)

### POST `/api/v1/samples/:sampleId/registration/start`
- body: `expectedVersion`, `notes`
- cria `REGISTRATION_STARTED`

### POST `/api/v1/samples/:sampleId/photos`
- body: `fileBase64` (ou `fileBuffer`) / `multipart/form-data`
- campos: `kind` (`ARRIVAL_PHOTO` | `CLASSIFICATION_PHOTO`), `mimeType`, `originalFileName`, `replaceExisting?`
- salva arquivo local e cria `PHOTO_ADDED`
- `ARRIVAL_PHOTO`: opcional no registro (`REGISTRATION_IN_PROGRESS`)
- `CLASSIFICATION_PHOTO`: obrigatoria para concluir classificacao (`CLASSIFICATION_IN_PROGRESS -> CLASSIFIED`)

### POST `/api/v1/samples/:sampleId/registration/confirm`
- body: `expectedVersion`, `declared`, `ocr`, `labelPhotoIds?`, `idempotencyKey?`
- cria `REGISTRATION_CONFIRMED`
- `sampleLotNumber` e gerado automaticamente no backend (`AM-YYYY-NNNNNN`)
- `labelPhotoIds` pode ser omitido ou vazio

### POST `/api/v1/samples/:sampleId/qr/print/request`
- body: `expectedVersion`, `attemptNumber`, `printerId?`, `idempotencyKey?`
- cria `QR_PRINT_REQUESTED`

### POST `/api/v1/samples/:sampleId/qr/reprint/request`
- body: `attemptNumber?`, `printerId?`, `reasonText?`, `idempotencyKey?`
- cria `QR_REPRINT_REQUESTED`
- sem motivo obrigatorio para reimpressao
- quando `attemptNumber` for omitido, backend gera a proxima tentativa de `REPRINT`

### POST `/api/v1/samples/:sampleId/qr/print/failed`
- body: `printAction`, `attemptNumber`, `printerId?`, `error`
- cria `QR_PRINT_FAILED`
- aceita `printAction=PRINT` (fluxo inicial) e `printAction=REPRINT` (reimpressao)

### POST `/api/v1/samples/:sampleId/qr/printed`
- body: `expectedVersion?`, `printAction`, `attemptNumber`, `printerId?`
- cria `QR_PRINTED`
- `PRINT`: aplica transicao `QR_PENDING_PRINT -> QR_PRINTED`
- `PRINT`: `expectedVersion` obrigatorio
- `REPRINT`: auditoria sem transicao de status

### POST `/api/v1/samples/:sampleId/classification/start`
- body: `expectedVersion`, `classificationId?`, `notes?`
- cria `CLASSIFICATION_STARTED`

### POST `/api/v1/samples/:sampleId/classification/partial`
- body: `expectedVersion`, `snapshotPartial`, `completionPercent?`
- cria `CLASSIFICATION_SAVED_PARTIAL`

### POST `/api/v1/samples/:sampleId/classification/complete`
- body: `expectedVersion`, `classificationData?`, `technical?`, `consumptionGrams?`, `classificationVersion?`, `classifierUserId?`, `classifierName?`, `idempotencyKey?`
- cria `CLASSIFICATION_COMPLETED`
- requer foto de classificacao salva previamente

### POST `/api/v1/samples/:sampleId/registration/update`
- body: `expectedVersion`, `after`, `reasonCode`, `reasonText` (`before` opcional no request)
- cria `REGISTRATION_UPDATED`
- `reasonText` obrigatorio com ate 10 palavras
- backend gera `before/after` com diff real (apenas campos alterados)

### POST `/api/v1/samples/:sampleId/classification/update`
- body: `expectedVersion`, `after`, `reasonCode`, `reasonText` (`before` opcional no request)
- cria `CLASSIFICATION_UPDATED`
- `reasonText` obrigatorio com ate 10 palavras
- backend gera `before/after` com diff real (apenas campos alterados)

### POST `/api/v1/samples/:sampleId/edits/revert`
- body: `expectedVersion`, `targetEventId`, `reasonCode`, `reasonText`
- reverte evento `REGISTRATION_UPDATED` ou `CLASSIFICATION_UPDATED` informado em `targetEventId`
- gera novo evento de update auditado (append-only)

### POST `/api/v1/samples/:sampleId/export/pdf`
- body: `exportType` (`COMPLETO` | `COMPRADOR_PARCIAL`), `destination?` (texto opcional do destinatario)
- permitido apenas quando `sample.status = CLASSIFIED`
- foto usada no PDF: sempre `CLASSIFICATION_PHOTO` (obrigatoria)
- `COMPLETO`: considera todos os campos permitidos no laudo
- `COMPRADOR_PARCIAL`: considera todos os campos permitidos, exceto `owner` (Proprietario)
- `destination` e opcional (recomendado) e e registrado na auditoria quando informado
- em todos os tipos, o laudo omite `sample.id` e qualquer variante de `Lote de origem`
- campos sem valor preenchido sao omitidos do laudo
- `selectedFields` no retorno/evento representa apenas os campos efetivamente exportados
- retorna arquivo PDF (`application/pdf`) com `Content-Disposition: attachment; filename=\"amostra(<lote-interno>).pdf\"`
- cria evento de auditoria `REPORT_EXPORTED`

### POST `/api/v1/samples/:sampleId/invalidate`
- body: `expectedVersion`, `reasonCode`, `reasonText`, `idempotencyKey?`
- role: `ADMIN`
- cria `SAMPLE_INVALIDATED`

## 3. Leitura

### GET `/api/v1/samples?status=&limit=&offset=`
- lista snapshot atual de amostras

### GET `/api/v1/samples/:sampleId`
- retorna:
- `sample` (snapshot atual)
- `attachments`
- `events` (timeline)

### GET `/api/v1/samples/resolve?qr=...`
- resolve conteudo lido de QR (ex.: `internalLotNumber`, `sampleId` UUID, URL com identificador)
- resposta inclui:
- `sample` (`id`, `internalLotNumber`, `status`)
- `redirectPath` para abrir classificacao (`/samples/:id?focus=classification&source=qr`)

### GET `/api/v1/samples/:sampleId/events?limit=&afterSequence=`
- timeline paginada por `sequenceNumber`

### GET `/api/v1/dashboard/pending`
- total pendente
- contagem por status pendente
- lista de pendencias mais antigas
- bloco `latestRegistrations` com:
- `total`
- `items` (ultimas amostras ja criadas/registradas para o container "Ultimos registros")
- bloco `classificationPending` com:
- `counts.QR_PRINTED` (aguardando inicio da classificacao)
- `total`
- `items` (lista dedicada para card de classificacoes pendentes no dashboard)
- bloco `classificationInProgress` com:
- `counts.CLASSIFICATION_IN_PROGRESS` (classificacao em andamento)
- `total`
- `items` (lista dedicada para card de classificacoes em andamento no dashboard)

## 4. Regras operacionais importantes

- Operacoes que mudam `Sample` exigem `expectedVersion`; conflito retorna `409`.
- Fluxo continua append-only: sem sobrescrever historico.
- Erro de OCR nao bloqueia registro.
- `INVALIDATED` e terminal.
- Upload de foto grava em disco local (`UPLOADS_DIR`).
- O fluxo de criacao por `/samples/create` evita gerar amostras antes da confirmacao do formulario.
