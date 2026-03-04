# Event Schemas v1

Este diretório implementa o contrato de eventos definido em `docs/Event-Contract-v1.md`.

## Estrutura

- `base/`
- `shared-defs.schema.json`: enums e tipos compartilhados
- `event-envelope.schema.json`: campos comuns obrigatórios de todo evento
- `payloads/`: schema de payload por `eventType`
- `events/`: schema completo por `eventType` (envelope + restrições por tipo)
- `event.schema.json`: agregador principal (`oneOf`) de todos os eventos v1

## Regras aplicadas

- JSON Schema Draft 2020-12
- Eventos em UPPER_SNAKE_CASE
- `actorType=USER` exige `actorUserId` UUID
- `actorType=SYSTEM` exige `actorUserId=null`
- Eventos de transição exigem `fromStatus` e `toStatus`
- Eventos sem transição exigem `fromStatus=null` e `toStatus=null`
- Operações críticas exigem `idempotencyScope` + `idempotencyKey`

## Uso recomendado

1. Validar contra `event.schema.json` no momento de persistência.
2. Rejeitar payload inválido com `422`.
3. Garantir atomicidade: update de `Sample` + insert de `SampleEvent` na mesma transação.
