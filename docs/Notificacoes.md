# Notificações (Web Push)

Status: Ativo
Escopo: catálogo e processo de registro das notificações Web Push do sistema
Última revisão: 2026-06-19
Documentos relacionados: `docs/README.md`, `docs/Operacao-e-Runtime.md`, `docs/Deploy-e-Cloud-Build.md`

> Este é o documento canônico de notificações. Toda notificação Web Push —
> existente ou ideia futura — deve ter uma ficha aqui. Mantê-lo sincronizado
> com o código é obrigatório (mesma regra das skills): mudou conteúdo,
> público, trigger ou deep link de uma notificação? Atualize a ficha no mesmo
> commit ou no commit seguinte.

---

## 1. Propósito e escopo

Centralizar, num único lugar, **quais notificações existem, para quem
aparecem, em que situação são enviadas e o que dizem**. Serve para dois fins:

1. **Registrar ideias** de novas notificações antes de existirem em código.
2. **Documentar as notificações já construídas e validadas**, com dados
   exatos (conteúdo, público, trigger, deep link, entrega).

**Escopo:** apenas o canal **Web Push** (notificações nativas de SO entregues
via protocolo VAPID). O canal de **e-mail** (`src/email/`) e os avisos in-app
(toasts/banners — ver skill `feedback-messages`) **não** fazem parte deste
documento.

---

## 2. Processo de registro (Ideia → Construída → Validada)

Cada notificação passa por três estágios. O campo `Status` da ficha reflete o
estágio atual.

| Status         | Significado                                                                           | O que fazer                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ideia**      | Proposta, ainda não existe em código                                                  | Criar a ficha em **§7 Backlog de ideias**, preenchendo o máximo possível (público, situação, conteúdo proposto, deep link). `Origem` fica `—`.           |
| **Construída** | Implementada no código, ainda não validada com push real                              | Preencher `Origem` (`arquivo:linha`), `Tag`, `Entrega`, `Dedup`. Mover a ficha do Backlog para o catálogo certo (**§5 Agendadas** ou **§6 Por evento**). |
| **Validada**   | Testada em produção — o push real chega no aparelho e o clique abre o deep link certo | Atualizar `Status` e preencher `Histórico` (data + revisão de deploy).                                                                                   |

Regressões (mudou conteúdo/público/trigger) **não** rebaixam o status, mas
exigem atualizar a ficha e, se o comportamento mudou de forma sensível,
revalidar.

---

## 3. Convenções do canal Web Push

Detalhes que valem para **todas** as notificações — a ficha individual só
registra o que é específico dela.

### 3.1 Como uma notificação é enviada

Tudo passa pelo serviço central `src/push/push-notification-service.js`
(`PushNotificationService`), que expõe três formas de envio:

| Método                                               | Uso                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sendToRoles(roles, message, opts)`                  | Envia para todos os aparelhos de usuários **ACTIVE** dos papéis dados.                                        |
| `sendToUsers(userIds, message, opts)`                | Envia para usuários específicos (ativos), quando a elegibilidade é calculada fora do serviço.                 |
| `sendPersonalizedToRoles(roles, buildMessage, opts)` | Como `sendToRoles`, mas `buildMessage(user)` monta o conteúdo por usuário (ex: saudação com o primeiro nome). |

Regras transversais:

- **Só usuários `ACTIVE` recebem.** Inativos nunca são alvo.
- **`excludeUserId`** opcional remove o autor da ação do público (usado nas
  notificações por evento — quem fez não é notificado).
- Envio é **fire-and-forget**: nunca quebra o request. Falha individual é
  agregada (`{ sent, failed, pruned }`), não lançada.
- **Poda automática:** inscrição que responde `404/410` (expirada) é apagada.
  `401/403` (problema de VAPID/config) é logado e **não** poda.

### 3.2 Públicos (roles) disponíveis

Papéis que podem ser alvo de uma notificação: `ADMIN`, `CLASSIFIER`,
`CADASTRO`, `COMMERCIAL`, `PROSPECTOR`. Fonte de verdade dos papéis:
`enum UserRole` em `prisma/schema.prisma`.

### 3.3 Conteúdo, entrega, tags e truncamento

Payload entregue ao aparelho: `{ title, body, url, tag }`.

- **Truncamento:** título máx. **80** caracteres, corpo máx. **160**
  (excedente vira `…`). Constantes `TITLE_MAX` / `BODY_MAX` no serviço.
- **Defaults:** `url` ausente → `/dashboard`; `tag` ausente → `rastreio`.
- **`tag`** controla o agrupamento/dedup **visual** no aparelho: uma nova
  notificação com a mesma `tag` **substitui** a anterior na central. Por isso
  notificações que devem empilhar usam `tag` única por item (ex:
  `visit-promising-<id>`), e lembretes repetíveis usam `tag` fixa.
- **Entrega (`opts`):** `ttl` (segundos) e `urgency`. Default do serviço:
  **TTL 24h**, **urgency `high`** (`PUSH_DEFAULT_TTL_SECONDS`). As agendadas
  sobrescrevem para TTL curto + `urgency normal` (lembrete de ontem não chega
  hoje). **Sem header `Topic`** — a Apple respondeu 400 a ele (2026-06-11); o
  anti-acúmulo visível já é garantido pela `tag`.

### 3.4 Infra (referências de código)

| Peça                             | Onde                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serviço de envio                 | `src/push/push-notification-service.js`                                                                                                                                                         |
| Factory + VAPID (env)            | `src/push/create-push-service.js` (`PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` / `PUSH_VAPID_SUBJECT`)                                                                                   |
| Service worker (recebe + clique) | `public/sw.js` (handlers `push`, `notificationclick`, `pushsubscriptionchange`)                                                                                                                 |
| Modelo de inscrição              | `model PushSubscription` em `prisma/schema.prisma` (1 row por aparelho; `endpoint` único)                                                                                                       |
| Endpoints                        | `POST`/`DELETE` `/api/v1/push/subscriptions`, `GET` `/api/v1/push/config`                                                                                                                       |
| Frontend (permissão + toggle)    | `lib/push/use-push-notifications.ts`, `app/profile/page.tsx`                                                                                                                                    |
| Agendamento (cron)               | Cloud Scheduler → job Cloud Run `push-digest` (`--kind`), setup em `scripts/gcp/setup-push-digest-scheduler.sh`; executor em `scripts/jobs/send-daily-push-digest.js`; fuso `America/Sao_Paulo` |

Sem `PUSH_VAPID_*` configurado, o push fica **desabilitado** (rotas 501,
gatilhos no-op) — nada quebra.

---

## 4. Template da ficha

Copie ao registrar uma nova notificação:

```
### <slug>
- Nome:          <legível>
- Status:        Ideia | Construída | Validada
- Canal:         Web Push
- Disparo:       Agendada (cron) | Por evento
- Quando:        <cron + fuso, ou evento + condições>
- Público-alvo:  <roles>  (exclui: <quem, se houver>)
- Título:        "<string exata, com {placeholders}>"
- Corpo:         "<string exata>"
- Deep link:     <url>
- Tag:           <tag de agrupamento/dedup>
- Entrega:       TTL <x> · urgency <y>
- Dedup:         <regra de idempotência / quando NÃO envia>
- Origem:        `arquivo:linha`   (referência ao código, não cópia)
- Notas:         <decisões de produto>
- Histórico:     criada <data> · validada em prod <data / rev>
```

---

## 5. Catálogo — Notificações agendadas (cron)

As quatro rodam no mesmo job Cloud Run `push-digest`, parametrizado por
`--kind`, agendado pelo Cloud Scheduler (fuso `America/Sao_Paulo`). Setup dos
crons em `scripts/gcp/setup-push-digest-scheduler.sh`.

### classification-digest

```
- Nome:          Classificação pendente
- Status:        Validada
- Canal:         Web Push
- Disparo:       Agendada (cron) — 0 8 * * * · America/Sao_Paulo
- Quando:        Todo dia 08:00, SOMENTE se classificationPending.total > 0
- Público-alvo:  ADMIN, CLASSIFIER
- Título:        "Amostras aguardando classificação"
- Corpo:         "{N} amostra pendente de classificação." (N=1)
                 "{N} amostras pendentes de classificação." (N>1)
- Deep link:     /dashboard
- Tag:           daily-classification
- Entrega:       TTL 12h · urgency normal
- Dedup:         tag fixa substitui no aparelho; não envia quando total = 0
- Origem:        scripts/jobs/send-daily-push-digest.js:77
- Notas:         —
- Histórico:     em produção desde 2026-06-11 (datas a confirmar)
```

### registrations-digest

```
- Nome:          Revise os cadastros
- Status:        Validada
- Canal:         Web Push
- Disparo:       Agendada (cron) — 0 8 * * 1-5 · America/Sao_Paulo
- Quando:        Seg–sex 08:00, SOMENTE se clientsIncomplete.total > 0
- Público-alvo:  ADMIN, CADASTRO
- Título:        "Revise os Cadastros!"
- Corpo:         "Temos {N} pendentes"
- Deep link:     /clients?incomplete=true
- Tag:           daily-clients
- Entrega:       TTL 12h · urgency normal
- Dedup:         tag fixa substitui no aparelho; não envia quando total = 0
- Origem:        scripts/jobs/send-daily-push-digest.js:98
- Notas:         —
- Histórico:     em produção desde 2026-06-11 (datas a confirmar)
```

### prospect-reminder

```
- Nome:          Bom dia, prospector
- Status:        Validada
- Canal:         Web Push
- Disparo:       Agendada (cron) — 0 11 * * 2-4 · America/Sao_Paulo
- Quando:        Ter, qua e qui às 11:00. SEM condição — dispara para todos os
                 PROSPECTOR ativos.
- Público-alvo:  PROSPECTOR
- Título:        "Bom dia {primeiro nome}!"   (primeira palavra do fullName;
                 fallback username; fallback "time")
- Corpo:         "Vamos prospectar! Lembre-se dos formulários de visita."
- Deep link:     /dashboard?informe=novo   (abre o sheet do formulário de
                 visita já aberto; o /informe não serve o PROSPECTOR)
- Tag:           prospect-reminder
- Entrega:       TTL 6h · urgency normal
- Dedup:         personalizada por usuário (sendPersonalizedToRoles); tag fixa
- Origem:        scripts/jobs/send-daily-push-digest.js:111
- Notas:         única agendada sem condição de pendência
- Histórico:     em produção desde 2026-06-11 (datas a confirmar)
```

### weekly-report-reminder

```
- Nome:          Lembrete do relatório semanal
- Status:        Validada
- Canal:         Web Push
- Disparo:       Agendada (cron) — 0 8-20 * * * · America/Sao_Paulo
                 (de hora em hora, 08–20h, todos os dias)
- Quando:        COMMERCIAL ativo SEM o relatório da semana corrente e SEM
                 lembrete já emitido nesta semana, quando vale R1 OU R2:
                   R1 — último relatório (qualquer semana) tem mais de
                        6 dias e 12 horas (exige ≥ 1 relatório anterior);
                   R2 — é sexta-feira ≥ 17:00 BRT (cobre quem nunca enviou).
- Público-alvo:  COMMERCIAL
- Título:        "Lembre-se do seu relatório."
- Corpo:         ""   (vazio, por decisão de produto — SW renderiza só o título)
- Deep link:     /informe
- Tag:           weekly-report-reminder
- Entrega:       TTL 6h · urgency normal
- Dedup:         tabela weekly_report_reminder, UNIQUE (userId, weekStart),
                 marcada ANTES do envio (race-safe) → no máx. 1 por usuário por
                 semana; execuções horárias extras são no-op
- Origem:        src/visits/commercial-forms-service.js:604
                 (envio em :673; job em scripts/jobs/send-daily-push-digest.js:129)
- Notas:         a janela 08–20h cobre a sexta 17:00 e evita lembrete de
                 madrugada
- Histórico:     em produção (datas a confirmar)
```

---

## 6. Catálogo — Notificações por evento

Disparadas em reação a uma ação no app, fire-and-forget, fora de cron. Todas
usam a entrega **default** do serviço (TTL 24h · urgency high) e **excluem o
autor** da ação do público.

### visit-promising

```
- Nome:          Visita promissora
- Status:        Validada
- Canal:         Web Push
- Disparo:       Por evento — criação de informe de visita (createVisitReport)
- Quando:        farmSize ∈ {MEDIUM, LARGE} E interestLevel = HIGH
                 (as duas condições juntas)
- Público-alvo:  ADMIN, CADASTRO   (exclui: autor do informe)
- Título:        "Nova visita promissora enviada"
- Corpo:         "{nome do visitante} visitou um cliente promissor. Confira!"
                 (fullName; fallback username; fallback "Alguém")
- Deep link:     /informe   (página "Relatórios" unificada; /resumo redireciona)
- Tag:           visit-promising-{id do informe}   (única — empilha, não substitui)
- Entrega:       TTL 24h · urgency high (default)
- Dedup:         hook curto-circuitado antes do service por Idempotency-Key
- Origem:        src/visits/visit-report-service.js:244
- Notas:         —
- Histórico:     em produção (datas a confirmar)
```

### visit-new-client

```
- Nome:          Novo cliente encontrado
- Status:        Validada
- Canal:         Web Push
- Disparo:       Por evento — criação de informe de visita (createVisitReport)
- Quando:        clientKind = 'NEW' (independente das demais respostas)
- Público-alvo:  ADMIN, CADASTRO   (exclui: autor do informe)
- Título:        "Novo cliente encontrado!"
- Corpo:         "Clique para ver os dados e cadastrá-lo"
- Deep link:     /informe   (página "Relatórios" unificada; /resumo redireciona)
- Tag:           visit-new-client-{id do informe}   (única — empilha)
- Entrega:       TTL 24h · urgency high (default)
- Dedup:         hook curto-circuitado antes do service por Idempotency-Key
- Origem:        src/visits/visit-report-service.js:260
- Notas:         pode disparar junto com visit-promising (informe da mesma visita)
- Histórico:     em produção (datas a confirmar)
```

### movement-sale-loss

```
- Nome:          Venda confirmada / Café perdido
- Status:        Validada
- Canal:         Web Push
- Disparo:       Por evento — venda ou perda registrada num lote
                 (SALE_CREATED / LOSS_RECORDED no event store)
- Quando:        ao registrar o movimento (replay idempotente NÃO re-notifica)
- Público-alvo:  ADMIN, COMMERCIAL   (exclui: quem registrou o movimento)
- Título:        venda → "Venda confirmada!"
                 perda → "Café perdido!"
- Corpo:         venda → "Lote {N} vendido"
                 perda → "Lote {N} indisponível"
                 ({N} = internalLotNumber; fallback "sem lote")
- Deep link:     /samples/{id da amostra}
- Tag:           movement-{movementId}   (única por movimento)
- Entrega:       TTL 24h · urgency high (default)
- Dedup:         guard result.idempotent — replay do appendEvent não re-notifica
- Origem:        src/samples/sample-command-service.js:2811 (envio em :2821)
- Notas:         uma ficha, dois conteúdos (venda/perda) — mesmo trigger e público
- Histórico:     em produção (datas a confirmar)
```

---

## 7. Backlog de ideias

Novas notificações entram aqui como `Status: Ideia`, usando o template da §4.
Ao serem implementadas, movem-se para §5 ou §6.

_(vazio)_
