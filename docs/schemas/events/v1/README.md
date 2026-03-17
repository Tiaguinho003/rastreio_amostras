# Event Schemas v1

Status: Suporte tecnico  
Escopo: schemas JSON Schema usados na validacao do contrato de eventos  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/API-e-Contratos.md`

## Estrutura

1. `base/`
   enums e envelope comum.
2. `payloads/`
   schema de payload por `eventType`.
3. `events/`
   schema completo por evento.
4. `event.schema.json`
   agregador principal (`oneOf`) para validacao de todos os eventos v1.

## Regras aplicadas

1. JSON Schema Draft 2020-12.
2. Eventos em `UPPER_SNAKE_CASE`.
3. `actorType=USER` exige `actorUserId`.
4. `actorType=SYSTEM` exige `actorUserId=null`.
5. Eventos de transicao exigem `fromStatus` e `toStatus`.
6. Operacoes criticas exigem `idempotencyScope` e `idempotencyKey`.

## Uso

1. validar contra `event.schema.json` no momento da persistencia;
2. rejeitar payload invalido com `422`;
3. manter atomicidade entre materializacao e insert do evento.
