# Conferencia das Fases 1 a 4

Status: Ativo  
Escopo: checklist executavel e criterios de aceite para validar as fases 1 a 4 de clientes, proprietario estruturado, movimentacoes comerciais e status automatico  
Ultima revisao: 2026-03-19  
Documentos relacionados: `docs/Clientes-e-Movimentacoes-Especificacao.md`, `docs/API-e-Contratos.md`, `docs/Arquitetura-Tecnica.md`, `docs/Deploy-e-Cloud-Build.md`

## Objetivo

Este documento define a conferencia oficial das fases 1 a 4.

A conferencia so deve ser considerada aprovada quando:

1. o banco estiver sem drift em relacao ao Prisma;
2. os contratos JSON estiverem validos;
3. o backend estiver verde em testes unitarios, de contrato e de integracao;
4. os fluxos principais de clientes, proprietario estruturado, venda, perda e `LOST` manual estiverem consistentes;
5. o build estiver passando sem regressao nas partes compartilhadas do frontend.

## Ordem obrigatoria

Executar nesta ordem:

1. `npm run prisma:generate`
2. `npm run prisma:migrate:deploy`
3. `npm run typecheck`
4. `npm run validate:schemas`
5. `npm run test:contracts`
6. `npm run test:unit`
7. `npm run test:integration:db`
8. `npm run build`

Se qualquer etapa falhar, a conferencia deve parar imediatamente.

## Sanidade de banco

Confirmar a existencia de:

1. tabelas:
   `client`, `client_registration`, `client_audit_event`, `sample_movement`
2. colunas em `sample`:
   `owner_client_id`, `owner_registration_id`, `sold_sacks`, `lost_sacks`
3. enum `CommercialStatus` com:
   `OPEN`, `PARTIALLY_SOLD`, `SOLD`, `LOST`
4. enum `SampleEventType` com:
   `SALE_CREATED`, `SALE_UPDATED`, `SALE_CANCELLED`, `LOSS_RECORDED`, `LOSS_UPDATED`, `LOSS_CANCELLED`
5. migrations:
   `20260319110000_add_clients_and_sample_movements`
   `20260319111000_add_client_search_trigram_indexes`
   `20260319153000_add_sample_movement_events_and_indexes`

Confirmar tambem:

1. unicidade de documento de cliente;
2. unicidade de inscricao;
3. FK de `sample.owner_*`;
4. FK de `sample_movement.buyer_*`;
5. append-only de `client_audit_event`.

## Conferencia por fase

### Fase 1

Validar:

1. schema do banco compativel com `prisma/schema.prisma`;
2. indices de cliente por `status/code`;
3. indices trigram de cliente por nome;
4. indices de `sample_movement` por `created_at`;
5. ausencia de drift no Prisma client.

### Fase 2

Validar APIs:

1. `GET/POST /api/v1/clients`
2. `GET /api/v1/clients/lookup`
3. `GET/PATCH /api/v1/clients/:clientId`
4. `POST /api/v1/clients/:clientId/inactivate`
5. `POST /api/v1/clients/:clientId/reactivate`
6. `GET /api/v1/clients/:clientId/audit`
7. `POST /api/v1/clients/:clientId/registrations`
8. `PATCH /api/v1/clients/:clientId/registrations/:registrationId`
9. `POST /api/v1/clients/:clientId/registrations/:registrationId/inactivate`
10. `POST /api/v1/clients/:clientId/registrations/:registrationId/reactivate`

Casos minimos:

1. criar cliente PF;
2. criar cliente PJ;
3. buscar por nome, documento e codigo;
4. lookup de vendedor e comprador;
5. editar cliente no mesmo registro;
6. editar inscricao no mesmo registro;
7. inativar e reativar cliente;
8. inativar e reativar inscricao;
9. auditoria por cliente incluindo eventos de inscricao.

### Fase 3

Validar:

1. criar amostra sem `ownerClientId` continua funcionando;
2. criar amostra com `ownerClientId` sincroniza `declared.owner` com o cliente;
3. vincular proprietario estruturado a amostra legada via `registration/update`;
4. trocar proprietario limpa inscricao anterior quando aplicavel;
5. bloquear proprietario inativo;
6. bloquear cliente sem `isSeller`;
7. bloquear inscricao de outro cliente;
8. sincronizar `sample.declared_owner` quando o nome do cliente mudar;
9. nao aumentar `sample.version` nesse sync de espelho.

### Fase 4

Validar APIs:

1. `GET /api/v1/samples/:sampleId/movements`
2. `POST /api/v1/samples/:sampleId/movements`
3. `PATCH /api/v1/samples/:sampleId/movements/:movementId`
4. `POST /api/v1/samples/:sampleId/movements/:movementId/cancel`
5. `POST /api/v1/samples/:sampleId/commercial-status` apenas para `LOST`

Casos minimos:

1. criar `SALE` parcial e verificar `PARTIALLY_SOLD`;
2. editar `SALE` e recalcular saldo;
3. criar `LOSS` sem venda e manter `OPEN`;
4. criar `LOSS` apos venda e manter `PARTIALLY_SOLD`;
5. cancelar `LOSS` e recalcular;
6. acionar `LOST` manual sem venda e criar perda do saldo inteiro, resultando em `LOST`;
7. acionar `LOST` manual com venda parcial e criar perda do restante, mantendo `PARTIALLY_SOLD`;
8. bloquear `OPEN`, `PARTIALLY_SOLD` e `SOLD` em `/commercial-status`;
9. bloquear venda acima do saldo;
10. bloquear movimentacao em amostra nao `CLASSIFIED`;
11. bloquear movimentacao em amostra `INVALIDATED`;
12. bloquear comprador inativo;
13. bloquear cliente sem `isBuyer`;
14. bloquear inscricao inativa ou de outro cliente;
15. bloquear reducao de `declaredSacks` abaixo de `soldSacks + lostSacks`.

## Regressao obrigatoria

Continuam obrigatorios:

1. criacao de amostra;
2. foto de chegada;
3. foto de classificacao;
4. QR print e reprint;
5. classificacao parcial e completa;
6. exportacao de PDF;
7. listagem e filtros de amostras;
8. dashboard;
9. invalidacao de amostra;
10. autenticacao e sessao.

Frontend compartilhado minimo:

1. `CommercialStatusBadge` renderiza `PARTIALLY_SOLD`;
2. `build` passa;
3. paginas existentes nao quebram por tipo compartilhado alterado.

## Evidencia minima

Registrar:

1. saida de `npm run prisma:generate`
2. saida de `npm run prisma:migrate:deploy`
3. saida de `npm run typecheck`
4. saida de `npm run validate:schemas`
5. saida de `npm run test:contracts`
6. saida de `npm run test:unit`
7. saida de `npm run test:integration:db`
8. saida de `npm run build`
9. lista de migrations aplicadas
10. notas ou capturas dos fluxos:
    cliente
    proprietario estruturado
    venda/perda
    `LOST` manual

## Criterio final de aceite

A conferencia so esta aprovada se:

1. nao houver drift entre banco e Prisma;
2. todos os comandos obrigatorios passarem;
3. o build estiver verde;
4. os fluxos manuais minimos estiverem aprovados;
5. nao houver inconsistencias entre `declaredSacks`, `soldSacks`, `lostSacks`, saldo e `commercialStatus`.
