# Event Contract v1 - Sample Domain

Status: Aprovado para implementacao inicial  
Data: 2026-02-27  
Projeto: Rastreio Interno de Amostras

## 1. Envelope Padrao (todos os eventos)

Campos obrigatorios:
- `eventId` (UUID v4)
- `eventType` (enum UPPER_SNAKE_CASE)
- `sampleId` (UUID)
- `occurredAt` (UTC)
- `actorType` (`USER` | `SYSTEM`)
- `source` (`web` | `api` | `worker`)
- `schemaVersion` (int, iniciando em `1`)
- `payload` (JSONB)
- `requestId` (string)

Campos obrigatorios condicionais:
- `actorUserId` (UUID, obrigatorio quando `actorType=USER`, `null` quando `actorType=SYSTEM`)
- `fromStatus` e `toStatus` (obrigatorios apenas em eventos que mudam status)

Campos opcionais:
- `correlationId` (string nullable)
- `causationId` (UUID nullable)
- `idempotencyScope` (enum/string)
- `idempotencyKey` (string)
- `metadata.ip` (string nullable)
- `metadata.userAgent` (string nullable)
- `metadata.module` (`registration` | `classification` | `print` | `ocr`)

## 2. Convencoes

- Nomes de evento em `UPPER_SNAKE_CASE`.
- Eventos representam fatos ocorridos (passado), nao comandos.
- Banco/eventos em ingles tecnico.
- Interface pode traduzir nomenclatura.

## 3. Lista de Event Types (MVP)

- `SAMPLE_RECEIVED`
- `REGISTRATION_STARTED`
- `PHOTO_ADDED`
- `OCR_EXTRACTED`
- `OCR_FAILED`
- `OCR_CONFIRMED`
- `REGISTRATION_CONFIRMED`
- `QR_PRINT_REQUESTED`
- `QR_PRINT_FAILED`
- `QR_PRINTED`
- `QR_REPRINT_REQUESTED`
- `CLASSIFICATION_STARTED`
- `CLASSIFICATION_SAVED_PARTIAL`
- `CLASSIFICATION_COMPLETED`
- `REGISTRATION_UPDATED`
- `CLASSIFICATION_UPDATED`
- `COMMERCIAL_STATUS_UPDATED`
- `SAMPLE_INVALIDATED`

## 4. Eventos que Mudam Status

Estes eventos exigem `fromStatus` e `toStatus`:
- `SAMPLE_RECEIVED`
- `REGISTRATION_STARTED`
- `REGISTRATION_CONFIRMED`
- `QR_PRINT_REQUESTED` (vai para `QR_PENDING_PRINT`)
- `QR_PRINTED`
- `CLASSIFICATION_STARTED`
- `CLASSIFICATION_COMPLETED`
- `SAMPLE_INVALIDATED`

Eventos sem mudanca de status (`fromStatus/toStatus = null`):
- `PHOTO_ADDED`
- `OCR_EXTRACTED`
- `OCR_FAILED`
- `OCR_CONFIRMED`
- `REGISTRATION_UPDATED`
- `CLASSIFICATION_SAVED_PARTIAL`
- `CLASSIFICATION_UPDATED`
- `QR_PRINT_FAILED`
- `QR_REPRINT_REQUESTED`
- `COMMERCIAL_STATUS_UPDATED`

## 5. Payloads Minimos Obrigatorios

### 5.1 SAMPLE_RECEIVED
```json
{
  "receivedChannel": "in_person|courier|driver|other",
  "notes": "string|null"
}
```

### 5.2 REGISTRATION_CONFIRMED
```json
{
  "sampleLotNumber": "AM-2026-000381",
  "declared": {
    "owner": "string",
    "sacks": 10,
    "harvest": "24/25",
    "originLot": "string"
  },
  "labelPhotos": ["attachmentId1", "attachmentId2"],
  "ocr": {
    "provider": "LOCAL|EXTERNAL",
    "overallConfidence": 0.82,
    "fieldConfidence": {
      "owner": 0.9,
      "sacks": 0.7,
      "harvest": 0.8,
      "originLot": 0.6
    },
    "rawTextRef": "ocrExtractionId|null"
  }
}
```

Observacao: `labelPhotos` e opcional no fluxo atual e, quando presente, pode ser vazio.

### 5.3 REGISTRATION_UPDATED / CLASSIFICATION_UPDATED
```json
{
  "before": {},
  "after": {},
  "reasonText": "string",
  "reasonCode": "DATA_FIX|TYPO|MISSING_INFO|OTHER"
}
```

### 5.4 QR_PRINT_REQUESTED
```json
{
  "printAction": "PRINT",
  "attemptNumber": 1,
  "printerId": "string|null"
}
```

### 5.5 QR_PRINT_FAILED
```json
{
  "printAction": "PRINT|REPRINT",
  "attemptNumber": 1,
  "printerId": "string|null",
  "error": "string"
}
```

### 5.6 QR_PRINTED
```json
{
  "printAction": "PRINT|REPRINT",
  "attemptNumber": 1,
  "printerId": "string|null"
}
```

### 5.7 QR_REPRINT_REQUESTED
```json
{
  "printAction": "REPRINT",
  "attemptNumber": 1,
  "printerId": "string|null",
  "reasonText": "string|null"
}
```

### 5.8 SAMPLE_INVALIDATED
```json
{
  "reasonCode": "DUPLICATE|WRONG_SAMPLE|DAMAGED|CANCELLED|OTHER",
  "reasonText": "string"
}
```

### 5.9 CLASSIFICATION_SAVED_PARTIAL
```json
{
  "snapshotPartial": {},
  "completionPercent": 45
}
```

### 5.10 COMMERCIAL_STATUS_UPDATED
```json
{
  "fromCommercialStatus": "OPEN|SOLD|LOST",
  "toCommercialStatus": "OPEN|SOLD|LOST",
  "reasonText": "string"
}
```

## 6. Versionamento de Schema

- `schemaVersion` e por evento.
- Mudancas compativeis (ex.: novo campo opcional) mantem versao.
- Mudancas breaking incrementam `schemaVersion` do mesmo `eventType`.
- Novo `eventType` so quando o significado de dominio mudar.
- Leitura de eventos antigos deve suportar upgrade em leitura (mapper).

## 7. Idempotencia

Regra geral:
- Operacoes criticas devem carregar `idempotencyScope` + `idempotencyKey`.
- Repeticao retorna sucesso idempotente com referencia ao evento ja existente.

Scopes criticos do MVP:
- `REGISTRATION_CONFIRM`
- `QR_PRINT`
- `QR_REPRINT`
- `CLASSIFICATION_COMPLETE`
- `COMMERCIAL_STATUS_UPDATE`
- `INVALIDATE`

Restricao recomendada:
- Unico por `(sampleId, idempotencyScope, idempotencyKey)`.

## 8. Ordenacao e Concorrencia

- Ordem oficial por `sequenceNumber` incremental por `sampleId`.
- `occurredAt` e informativo, nao e a ordem oficial.
- Toda operacao que altera `Sample` exige `expectedVersion`.
- Divergencia de versao retorna `409 Conflict`.
- `Sample.version` incrementa em toda mudanca persistida no snapshot de `Sample`.

## 9. Regras de QR Retry

- Retentativa manual ilimitada no MVP.
- `QR_PRINT_FAILED` nao muda status (permanece `QR_PENDING_PRINT`).
- `QR_PRINT_REQUESTED` representa primeira emissao de etiqueta.
- `QR_REPRINT_REQUESTED` representa reimpressao por perda/dano (nao muda status).
- `QR_PRINTED` com `printAction=PRINT` sempre aplica `QR_PENDING_PRINT -> QR_PRINTED`.
- `QR_PRINTED` com `printAction=REPRINT`:
- quando `fromStatus/toStatus` vierem preenchidos, aplica `QR_PENDING_PRINT -> QR_PRINTED`;
- quando vierem `null`, registra apenas auditoria.
- Unicidade de tentativas:
- `(sampleId, printAction, attemptNumber)` unico.
- Repeticao da mesma tentativa retorna resultado existente.

## 10. Persistencia e Indices

- Tabela de eventos: `SampleEvent` (JSONB).
- Mudanca em `Sample` + insert em `SampleEvent` na mesma transacao (atomica).
- `Sample` guarda estado atual/snapshot.
- `SampleEvent` guarda historico completo append-only.

Indices MVP:
- unico: `(sampleId, sequenceNumber)`
- indice: `(sampleId, occurredAt)`
- indice: `(eventType, occurredAt)`
- unico: `(sampleId, idempotencyScope, idempotencyKey)` quando ambos nao nulos
- `Sample`: indice `(sampleId, status)`

## 11. Validacao e Seguranca

- Payload invalido rejeita com `422`.
- Proibido no payload: senha, token, credenciais, cookie/sessao, segredos de infra.
- `reason` obrigatorio em:
- `REGISTRATION_UPDATED`
- `CLASSIFICATION_UPDATED`
- `SAMPLE_INVALIDATED`
- (recomendado) `QR_REPRINT_REQUESTED`

## 12. Observabilidade

- Metadata recomendada por evento: `requestId`, `ip`, `userAgent`, `module`.
- Falha de gravacao de evento deve ser logada em nivel `ERROR` com `requestId`.
- Se estado gravar e evento falhar: rollback total.

## 13. Criterios de Aceite (CI)

Obrigatorio no CI:
- validacao de schema por evento
- teste de idempotencia
- sequenceNumber incremental por sample
- concorrencia com `expectedVersion` (`409`)
- atomicidade (`Sample` + `SampleEvent`)

Artefatos exigidos:
- este documento (`Event-Contract-v1.md`)
- JSON Schema por `eventType` + `schemaVersion`
