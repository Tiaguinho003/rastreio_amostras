# Notificações (Web Push)

Status: Ativo — catálogo vazio
Escopo: catálogo e processo de registro das notificações Web Push do sistema
Última revisão: 2026-07-09
Documentos relacionados: `docs/README.md`, `docs/Operacao-e-Runtime.md`, `docs/Deploy-e-Cloud-Build.md`

> Este é o documento canônico de notificações. Toda notificação Web Push —
> existente ou ideia futura — deve ter uma ficha aqui. Mantê-lo sincronizado
> com o código é obrigatório (mesma regra das skills): mudou conteúdo,
> público, trigger ou deep link de uma notificação? Atualize a ficha no mesmo
> commit ou no commit seguinte.

> **Catálogo zerado em 2026-07-09.** As 7 notificações que existiam (4
> agendadas + 3 por evento) foram removidas do código, junto com o job
> `push-digest` e seus agendamentos, para que o conjunto seja redesenhado do
> zero. O **canal continua de pé** — inscrição do aparelho, toggle no Perfil,
> service worker, rotas `/api/v1/push/*` e os métodos de envio do
> `PushNotificationService`. Hoje **nenhuma notificação é enviada**. As fichas
> antigas ficam no histórico do git (commits `7a8545a` e `aa28962`).

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
- **`excludeUserId`** opcional remove o autor da ação do público — útil nas
  notificações por evento, em que quem fez não precisa ser avisado.
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
  notificações que devem empilhar usam `tag` única por item (sufixada com o id
  da entidade), e lembretes repetíveis usam `tag` fixa.
- **Entrega (`opts`):** `ttl` (segundos) e `urgency`. Default do serviço:
  **TTL 24h**, **urgency `high`** (`PUSH_DEFAULT_TTL_SECONDS`). Notificações
  agendadas convêm sobrescrever para TTL curto + `urgency normal` (lembrete de
  ontem não deve chegar hoje). **Sem header `Topic`** — a Apple respondeu 400
  a ele (2026-06-11); o anti-acúmulo visível já é garantido pela `tag`.

### 3.4 Infra (referências de código)

| Peça                             | Onde                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Serviço de envio                 | `src/push/push-notification-service.js`                                                                       |
| Factory + VAPID (env)            | `src/push/create-push-service.js` (`PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` / `PUSH_VAPID_SUBJECT`) |
| Service worker (recebe + clique) | `public/sw.js` (handlers `push`, `notificationclick`, `pushsubscriptionchange`)                               |
| Modelo de inscrição              | `model PushSubscription` em `prisma/schema.prisma` (1 row por aparelho; `endpoint` único)                     |
| Endpoints                        | `POST`/`DELETE` `/api/v1/push/subscriptions`, `GET` `/api/v1/push/config`                                     |
| Frontend (permissão + toggle)    | `lib/push/use-push-notifications.ts`, `app/profile/page.tsx`                                                  |

Sem `PUSH_VAPID_*` configurado, o push fica **desabilitado** (rotas 501,
gatilhos no-op) — nada quebra.

**Não existe mais infraestrutura de agendamento.** O job Cloud Run
`push-digest` e os Cloud Scheduler jobs foram removidos junto com o catálogo
antigo. A primeira notificação agendada que for registrada aqui vai precisar
recriá-la (o histórico do git tem o formato anterior: um job parametrizado por
`--kind`, disparado por um scheduler por notificação, fuso `America/Sao_Paulo`).

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

Disparadas por um agendador, fora de qualquer ação do usuário. Nenhuma
existe hoje — não há job de cron no projeto (ver §3.4).

_(vazio)_

---

## 6. Catálogo — Notificações por evento

Disparadas em reação a uma ação no app, fire-and-forget, dentro do request.
Nenhuma existe hoje.

_(vazio)_

---

## 7. Backlog de ideias

Novas notificações entram aqui como `Status: Ideia`, usando o template da §4.
Ao serem implementadas, movem-se para §5 ou §6.

_(vazio)_
