# State Machine v1 - Sample Lifecycle

Status: Aprovado para implementacao inicial  
Data: 2026-02-27  
Projeto: Rastreio Interno de Amostras

## 1. Status Oficiais (MVP)

- `PHYSICAL_RECEIVED`
- `REGISTRATION_IN_PROGRESS`
- `REGISTRATION_CONFIRMED`
- `QR_PENDING_PRINT`
- `QR_PRINTED`
- `CLASSIFICATION_IN_PROGRESS`
- `CLASSIFIED`
- `INVALIDATED`

## 1.1 Status Comercial (dimensao separada)

- `OPEN` (em aberto)
- `SOLD` (vendida)
- `LOST` (perdida)

Regras:
- `commercialStatus` nao substitui `SampleStatus`; e uma dimensao paralela.
- no snapshot, `commercialStatus` inicia em `OPEN`.
- alteracao comercial permitida somente quando `SampleStatus = CLASSIFIED`.
- transicoes comerciais permitidas: `OPEN -> SOLD`, `OPEN -> LOST`, `SOLD -> OPEN`, `LOST -> OPEN`.
- quando `SampleStatus = INVALIDATED`, o status comercial fica somente para historico (sem novas alteracoes).

## 2. Semantica de Cada Status

- `PHYSICAL_RECEIVED`: amostra chegou fisicamente e ainda nao iniciou registro digital.
- `REGISTRATION_IN_PROGRESS`: registro em andamento (foto/OCR/conferencia manual).
- `REGISTRATION_CONFIRMED`: registro definitivo confirmado, com ID interno gerado.
- `QR_PENDING_PRINT`: QR solicitado, porem nao impresso com sucesso ainda.
- `QR_PRINTED`: QR impresso com sucesso.
- `CLASSIFICATION_IN_PROGRESS`: classificacao tecnica iniciada e ainda nao finalizada.
- `CLASSIFIED`: classificacao finalizada.
- `INVALIDATED`: amostra invalidada (terminal, sem retorno).

## 3. Estados de Encerramento

- `CLASSIFIED`: encerramento operacional normal (pode ser invalidado por `Admin` em caso excepcional).
- `INVALIDATED`: encerramento terminal e irreversivel no MVP.

Regras:
- Nao existe reabertura de status no MVP.
- Uma vez `INVALIDATED`, nao pode transitar para nenhum outro status.

## 4. Fluxo Feliz

`PHYSICAL_RECEIVED -> REGISTRATION_IN_PROGRESS -> REGISTRATION_CONFIRMED -> QR_PENDING_PRINT -> QR_PRINTED -> CLASSIFICATION_IN_PROGRESS -> CLASSIFIED`

## 5. Transicoes Permitidas

| From | To | Quem | Condicoes | Evento principal |
|---|---|---|---|---|
| `PHYSICAL_RECEIVED` | `REGISTRATION_IN_PROGRESS` | `Classificador`/`Admin` | amostra recebida | `REGISTRATION_STARTED` |
| `REGISTRATION_IN_PROGRESS` | `REGISTRATION_CONFIRMED` | `Classificador`/`Admin` | foto de chegada opcional + `owner,sacks,harvest,originLot` + confirmacao manual | `REGISTRATION_CONFIRMED` |
| `REGISTRATION_CONFIRMED` | `QR_PENDING_PRINT` | `Classificador`/`Admin` | registro confirmado e ID interno existente | `QR_PRINT_REQUESTED` |
| `QR_PENDING_PRINT` | `QR_PRINTED` | `Classificador`/`Admin` | impressao concluida com sucesso | `QR_PRINTED` |
| `QR_PRINTED` | `CLASSIFICATION_IN_PROGRESS` | `Classificador`/`Admin` | inicio manual da classificacao | `CLASSIFICATION_STARTED` |
| `CLASSIFICATION_IN_PROGRESS` | `CLASSIFIED` | `Classificador`/`Admin` | foto de classificacao obrigatoria + confirmacao manual | `CLASSIFICATION_COMPLETED` |
| `PHYSICAL_RECEIVED` | `INVALIDATED` | `Admin` | motivo obrigatorio | `SAMPLE_INVALIDATED` |
| `REGISTRATION_IN_PROGRESS` | `INVALIDATED` | `Admin` | motivo obrigatorio | `SAMPLE_INVALIDATED` |
| `REGISTRATION_CONFIRMED` | `INVALIDATED` | `Admin` | motivo obrigatorio | `SAMPLE_INVALIDATED` |
| `QR_PENDING_PRINT` | `INVALIDATED` | `Admin` | motivo obrigatorio | `SAMPLE_INVALIDATED` |
| `QR_PRINTED` | `INVALIDATED` | `Admin` | motivo obrigatorio | `SAMPLE_INVALIDATED` |
| `CLASSIFICATION_IN_PROGRESS` | `INVALIDATED` | `Admin` | motivo obrigatorio | `SAMPLE_INVALIDATED` |
| `CLASSIFIED` | `INVALIDATED` | `Admin` | motivo obrigatorio | `SAMPLE_INVALIDATED` |

## 6. Transicoes Proibidas (Explicitas)

- `PHYSICAL_RECEIVED -> CLASSIFIED`
- `REGISTRATION_IN_PROGRESS -> CLASSIFIED`
- `REGISTRATION_CONFIRMED -> CLASSIFIED`
- `CLASSIFIED -> CLASSIFICATION_IN_PROGRESS`

Regra geral:
- Qualquer transicao fora da matriz permitida deve ser rejeitada na API.

## 7. Regras de Registro e OCR

- Foto de chegada e opcional no registro.
- Sem foto de classificacao, nao pode concluir (`CLASSIFICATION_IN_PROGRESS -> CLASSIFIED`).
- OCR pode falhar ou ser ignorado; operacao nao pode travar por OCR.
- Se OCR falhar, status permanece em `REGISTRATION_IN_PROGRESS`.
- Confirmacao manual do classificador/admin e obrigatoria para registro definitivo.

## 8. Regras de QR e Impressao

- Classificacao e bloqueada enquanto status for `QR_PENDING_PRINT`.
- Se impressao falhar, manter `QR_PENDING_PRINT`.
- Retentativa manual de impressao: ilimitada no MVP.
- Cada tentativa gera evento `QR_PRINT_REQUESTED` com:
- `attemptNumber`
- `printerId` (opcional)
- `result` (`success`/`fail`)
- `error` (quando falhar)
- Reimpressao por perda/dano de etiqueta pode gerar `QR_REPRINT_REQUESTED`.
- `QR_PRINTED` com `printAction=REPRINT`:
  - se amostra estiver `QR_PENDING_PRINT`, transiciona para `QR_PRINTED`;
  - nos demais status permitidos, registra auditoria sem alterar status.
- QR codifica somente `internalId`; alteracoes em `owner/sacks/harvest/originLot` nao exigem reimpressao.

## 9. Regras de Edicao e Auditoria

- Nao sobrescrever dados: toda edicao gera novo evento append-only.
- Eventos de edicao no MVP:
- `REGISTRATION_UPDATED`
- `CLASSIFICATION_UPDATED`
- Edicao apos `REGISTRATION_CONFIRMED` e permitida, sem alterar status, com `reason` obrigatorio.
- Correcao de classificacao mantem status `CLASSIFIED` no MVP (sem reabertura de status).
- `INVALIDATED` exige `reason` obrigatorio.

## 10. Campos Minimos Para Finalizar Classificacao

No estado atual:
- Nenhum parametro tecnico da classificacao e obrigatorio.
- O preenchimento pode ser parcial e evoluir por versao.

Regra:
- A transicao para `CLASSIFIED` permanece manual e auditada por evento.

## 11. Metadados Obrigatorios em Mudanca de Status

Todo evento de mudanca de status deve incluir:
- `userId`
- `timestamp`
- `fromStatus`
- `toStatus`
- `reason` (quando aplicavel por regra)

## 12. Consistencia e Concorrencia

- ID interno da amostra e gerado na transicao `REGISTRATION_IN_PROGRESS -> REGISTRATION_CONFIRMED`.
- ID interno e unico e imutavel.
- Regra "sem foto nao classifica" deve ser validada em API e banco.
- Controle de concorrencia: bloqueio otimista por campo de versao (`version`).

## 13. Operacao e Monitoramento

Status pendentes para dashboard:
- `PHYSICAL_RECEIVED`
- `REGISTRATION_IN_PROGRESS`
- `QR_PENDING_PRINT`
- `CLASSIFICATION_IN_PROGRESS`

KPIs iniciais:
- Tempo chegada -> registro confirmado
- Tempo registro confirmado -> classificacao
- Taxa de falha de OCR
- Taxa de correcoes
- Amostras paradas por status

SLAs sugeridos:
- Registro confirmado em ate 15 minutos apos chegada
- Classificacao iniciada em ate 24h apos `QR_PRINTED`

## 14. Nomenclatura

- Banco/eventos: ingles tecnico.
- Interface: portugues (se necessario), mapeando os mesmos status internos.
