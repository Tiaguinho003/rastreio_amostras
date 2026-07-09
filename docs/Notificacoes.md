# Notificações

Status: Ativo — modelo em desenho, catálogo vazio
Escopo: como as notificações funcionam (modelo, superfícies) + catálogo e processo de registro
Última revisão: 2026-07-09
Documentos relacionados: `docs/README.md`, `docs/Operacao-e-Runtime.md`, `docs/Deploy-e-Cloud-Build.md`

> Este é o documento canônico de notificações. Toda notificação — existente ou
> ideia futura — deve ter uma ficha aqui. Mantê-lo sincronizado com o código é
> obrigatório (mesma regra das skills): mudou conteúdo, público, trigger ou
> deep link de uma notificação? Atualize a ficha no mesmo commit ou no commit
> seguinte.

> **Estado atual (2026-07-09).** O catálogo foi zerado: as 7 notificações que
> existiam (4 agendadas + 3 por evento) saíram do código, junto com o job
> `push-digest` e seus agendamentos, para que o conjunto seja redesenhado do
> zero. **Nenhuma notificação é enviada hoje.** Do que existe em código, sobra
> só o **canal de push**: inscrição do aparelho, toggle no Perfil, service
> worker, rotas `/api/v1/push/*` e os métodos de envio do
> `PushNotificationService`. As fichas antigas ficam no histórico do git
> (commits `7a8545a` e `aa28962`).
>
> O modelo descrito na §2 (registro persistido + sino) é **desenho, não
> código**. Nada dele existe ainda.

---

## 1. Propósito e escopo

Centralizar, num único lugar, **quais notificações existem, para quem
aparecem, em que situação são enviadas e o que dizem**. Serve para dois fins:

1. **Registrar ideias** de novas notificações antes de existirem em código.
2. **Documentar as notificações já construídas e validadas**, com dados
   exatos (conteúdo, público, trigger, deep link, entrega).

**Escopo:** a **notificação** como unidade de produto, e as duas superfícies
em que ela aparece — o **push** (notificação nativa do SO, via VAPID) e o
**sino** (histórico consultável dentro do app). O canal de **e-mail**
(`src/email/`) e os avisos in-app efêmeros (toasts/banners — ver skill
`feedback-messages`) **não** fazem parte deste documento.

---

## 2. Como as notificações funcionam

Esta seção descreve o **modelo**: o que uma notificação é, como nasce, onde
ela aparece e como isso se traduz em banco e endpoint. É desenho fechado,
ainda **sem uma linha de código**. As decisões estão marcadas `N1`–`N9` para
poderem ser citadas em commits e discussões.

### 2.1 Uma notificação é um registro, não um push

O erro do modelo antigo era tratar a notificação **como** o push: se o push
não fosse entregue — usuário sem inscrição, aparelho offline, iOS sem o app
instalado — a notificação simplesmente não existia para aquela pessoa. E
mesmo entregue, ela sumia da central do sistema operacional e não havia
como reencontrá-la.

**`N1` — a notificação passa a ser um registro no banco, com destinatários
próprios.** No momento do disparo, o sistema resolve **quem** deve recebê-la
e grava um vínculo por destinatário. O push deixa de ser a notificação e
vira **um canal de entrega** dela; o sino lê o registro.

Consequências que valem a pena enunciar:

- Quem nunca ativou o push **vê tudo no sino**, do mesmo jeito.
- Quem estava offline, ou trocou de celular, **não perde nada**.
- A audiência é **congelada no disparo**. Um usuário que muda de papel depois
  continua vendo o que recebeu enquanto era CLASSIFIER, e não passa a ver
  retroativamente o que foi mandado para COMMERCIAL.

Na prática isso inverte a dependência: os gatilhos deixam de chamar o
`PushNotificationService` direto e passam a chamar um **serviço de
notificações**, que persiste e só então delega o envio ao push.

### 2.2 O disparo e o fan-out

Toda notificação nasce de um **gatilho**, que é de um de dois tipos — a mesma
divisão que organiza o catálogo (§6 e §7):

| Tipo           | Quando dispara                                                       |
| -------------- | -------------------------------------------------------------------- |
| **Por evento** | Em reação a uma ação no app (uma venda registrada, um informe salvo) |
| **Agendada**   | Por um agendador, fora de qualquer ação do usuário (um lembrete)     |

Disparada, ela segue sempre a mesma sequência:

1. **Resolve a audiência** — os papéis alvo, menos exclusões (tipicamente o
   autor da ação, que não precisa ser avisado do que ele mesmo fez). Só
   usuários `ACTIVE` entram.
2. **Persiste** — grava a notificação e um vínculo por destinatário. A partir
   daqui ela existe e o sino a mostra.
3. **Entrega pelo push** — dispara o Web Push para os aparelhos inscritos
   daqueles destinatários. É **fire-and-forget**: falha de entrega nunca
   quebra o request nem apaga o registro.

O passo 2 é o que garante o sino. Se o passo 3 falhar inteiro, a notificação
continua existindo — só não fez barulho.

**`N5` — o texto é único, igual para todos os destinatários.** Um disparo
produz **um** registro e N vínculos. Não existe notificação com conteúdo
variável por pessoa: a saudação com o primeiro nome (o antigo "Bom dia,
Maria!") sai do repertório. Era charme, não função, e custava um registro por
destinatário.

**`N9` — o sino acumula, não colapsa.** Cada disparo vira uma entrada, mesmo
para lembretes repetitivos de `tag` fixa. No aparelho a `tag` faz a nova
notificação substituir a anterior (§4.3); **no sino não há substituição**. Um
lembrete semanal deixa quatro linhas por mês, e o teto de 30 dias (`N4`)
limita o acúmulo naturalmente.

### 2.3 Superfície 1 — o push (o aviso)

A notificação nativa do sistema operacional. É **efêmera por natureza**:
chama atenção no momento, e depois some. Serve para trazer a pessoa de volta
ao app; não serve como registro.

Regras e limites do canal estão na §4. O push só chega a quem **ativou** as
notificações no Perfil, naquele aparelho, naquela origem.

### 2.4 Superfície 2 — o sino (o registro)

Um **ícone de sino, presente em todas as páginas**, que abre um painel com as
notificações daquele usuário, da mais recente para a mais antiga. É a resposta
ao problema real: o push some, e sem ele o usuário não tem como saber o que
perdeu.

**`N2` — o sino entra ao lado do avatar, no header de cada página.**

> Correção de rota. A primeira versão desta decisão dizia que a topbar do
> `AppShell` renderiza em algumas rotas mobile e some em outras, e que ela
> passaria a renderizar em todas. **A premissa era falsa.** No mobile a topbar
> é invisível em **toda** rota: ela sempre recebe `topbar--hidden`
> (`display:none`) ou `topbar--dashboard-only`, que a deixa transparente, sem
> eventos de ponteiro e com o conteúdo escondido (`app/globals.css`). Ela só
> existe visualmente no desktop. Torná-la visível empilharia dois headers em
> 11 páginas, com dois avatares na tela.

O que existe em todas as páginas — as 12 rotas autenticadas, incluindo detalhe
de lote, detalhe de cliente e o dashboard do PROSPECTOR, que não têm tabbar —
é o `components/HeaderAvatarMenu.tsx`, à direita do header de cada uma. **O
sino entra imediatamente antes dele.** Não por acaso: o próprio componente
declara, em `HeaderAvatarMenu.tsx:11` e em `app/globals.css`, que "substitui o
antigo sino". O lugar já estava marcado.

No desktop, o sino entra em `.topbar-tools`, antes de `.topbar-profile` —
onde há espaço sobrando. Nenhum `padding-top` ou `safe-area` precisa ser
revisado.

**`N3` — o sino não tem estado de lido/não lido.** Sem badge, sem contador,
sem marcação por item. O painel é um **histórico cronológico**, e o usuário
olha quando quiser. É a versão mais simples que resolve o problema declarado
(reencontrar o que o push mostrou e sumiu). Contador de não lidas é uma adição
possível no futuro, e não é barata: exige coluna de estado por destinatário,
endpoint de marcação e uma regra de quando zerar.

**`N7` — o PROSPECTOR vê o sino**, como todo mundo. O que ele lê é decidido
pela **audiência de cada notificação**, não por um gate de página: hoje, com o
catálogo vazio, o painel dele é vazio — e isso é correto, não um bug. Na
prática, o endpoint do sino entra na allowlist de `src/auth/prospector-access.js`.

Cada item do painel leva o mesmo **deep link** do push — clicar abre a tela
onde a coisa aconteceu.

### 2.5 Retenção e limpeza

**`N4` — uma notificação vive 30 dias no sino.** Depois disso é apagada. O
painel carrega as mais recentes, paginado.

Notificação velha não serve para nada: ninguém precisa saber, em setembro, de
uma venda registrada em junho — para isso existem as telas de dados. Trinta
dias mantêm a tabela pequena e o histórico útil.

**`N6` — a limpeza é oportunista, no disparo.** Ao gravar uma notificação
nova, o serviço apaga de passagem o que passou de 30 dias. Não há cron no
projeto (§4.4) e recriar a infraestrutura só para isso não se paga.

Isso não é gambiarra: é o padrão que o projeto já usa em três lugares. O TTL
do `idempotency_record` é verificado na leitura, sem coletor. O `print_job`
expira na leitura. A inscrição de push morta é podada durante o envio. A
limpeza é **fire-and-forget** — falhar não pode quebrar o disparo.

### 2.6 O schema

Segue as convenções do projeto: `id` UUID gerado na aplicação com
`randomUUID()` (sem `@default`), `@@map` snake*case, índices `idx*\*`,
timestamps `@db.Timestamptz(6)`, e **sem `updatedAt`\*\* — as duas tabelas são
append-only.

**`N8` — o tipo da notificação é um slug de texto, não um enum do Prisma.**
Registrar uma notificação nova passa a exigir só código, não uma migration. O
banco não valida o valor; quem valida é uma constante no código, espelhando os
slugs das fichas deste documento.

```prisma
model Notification {
  id        String   @id @db.Uuid
  type      String   @db.VarChar(60)    // slug da ficha (ex: "venda-confirmada")
  title     String   @db.VarChar(80)    // TITLE_MAX do push
  body      String   @db.VarChar(160)   // BODY_MAX do push
  url       String   @db.VarChar(300)   // deep link
  tag       String   @db.VarChar(120)   // agrupamento no APARELHO, não no sino
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  recipients NotificationRecipient[]

  @@index([createdAt], map: "idx_notification_created")
  @@map("notification")
}

model NotificationRecipient {
  notificationId String   @map("notification_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  createdAt      DateTime @map("created_at") @db.Timestamptz(6)

  notification Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@id([notificationId, userId])
  @@index([userId, createdAt, notificationId], map: "idx_notification_recipient_user_created")
  @@map("notification_recipient")
}
```

Três escolhas que merecem justificativa:

- **`createdAt` é copiado no vínculo**, não é um `now()` próprio. É o mesmo
  instante da notificação-mãe, gravado no mesmo insert. Existe para que o
  índice `(user_id, created_at, notification_id)` sirva sozinho ao cursor do
  feed, sem join na ordenação. Fan-out na escrita, leitura barata.
- **`onDelete: Cascade` no vínculo com `Notification`** — a limpeza dos 30
  dias apaga a notificação e os vínculos vão junto. É a única exceção à regra
  do projeto (`Restrict` em tudo), e vale só para o pai `notification`. O
  vínculo com `app_user` segue `Restrict`, como manda a skill `prisma`.
- **PK composta `(notificationId, userId)`**, sem coluna `id` própria — molde
  de `ClientCommercialUser`. Sem estado de lida (`N3`), o vínculo não tem
  nada além da chave.

Migration manual, aditiva e idempotente, com cabeçalho comentado. Molde:
`prisma/migrations/20260610200000_add_push_subscription/`.

### 2.7 O endpoint do sino

Feed cronológico com "carregar mais" → **cursor keyset**, não offset. O molde é
`listClients` (`src/clients/client-service.js`), não o `listInformeFeed`, que
usa offset por combinar três tabelas.

```
GET /api/v1/notifications?limit=&cursorCreatedAt=&cursorId=

→ { items: [{ id, type, title, body, url, createdAt }],
    page:  { limit, nextCursor: { createdAt, id } | null } }
```

- **Ordenação:** `createdAt DESC, notificationId DESC`. O cursor keyset é
  `(createdAt < c.createdAt) OR (createdAt = c.createdAt AND notificationId < c.id)`.
- **Escopo:** sempre o ator autenticado. Não existe ler o sino de outro.
- **Limite:** default **20**, máximo **50** (constantes no support do domínio,
  molde de `USER_LIST_LIMIT` / `CLIENT_LIST_LIMIT`).
- **Sem `total`.** Contar o feed inteiro não serve para nada sem badge (`N3`).
- **Gate:** `listNotifications` entra na allowlist do PROSPECTOR (`N7`). Não há
  gate por papel no service — a audiência já é o gate.

Sem JSON Schema: `docs/schemas/` guarda só os schemas do event store, e a
notificação não é um evento de amostra. O contrato vive em `lib/types.ts` e a
validação de query, em código (`readLimitQuery`), como no resto do projeto.

### 2.8 O que ainda não está decidido

As pendências `N-P1`–`N-P6` da versão anterior deste documento estão todas
resolvidas:

| Pendência | Resolvida por                                                  |
| --------- | -------------------------------------------------------------- |
| `N-P1`    | §2.6 (schema) e `N8` (slug em vez de enum)                     |
| `N-P2`    | `N5` — texto único, sem personalização                         |
| `N-P3`    | §2.7 (endpoint, cursor keyset, limites)                        |
| `N-P4`    | `N6` — limpeza oportunista no disparo                          |
| `N-P5`    | `N2` revisado — o sino não mexe no shell, nem em `padding-top` |
| `N-P6`    | `N7` — o PROSPECTOR vê o sino                                  |

Ficam abertas, e são de desenho visual, não de arquitetura:

| ID     | Pendência                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `N-P7` | **A cara do painel.** Bottom sheet no mobile (molde do `HeaderAvatarMenu`) e dropdown no desktop (molde do `.topbar-profile-menu`)? Ver skills `modals` e `design-system`. |
| `N-P8` | **Estado vazio.** O que o painel diz quando não há nenhuma notificação — situação do dia 1 e, para o PROSPECTOR, provavelmente permanente. Ver skill `feedback-messages`.  |
| `N-P9` | **Ícone e afordância do sino.** Desenho do ícone (stroke, como os demais), e o que acontece ao tocar quando o painel já está aberto.                                       |

## 3. Processo de registro (Ideia → Construída → Validada)

Cada notificação passa por três estágios. O campo `Status` da ficha reflete o
estágio atual.

| Status         | Significado                                                                           | O que fazer                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ideia**      | Proposta, ainda não existe em código                                                  | Criar a ficha em **§8 Backlog de ideias**, preenchendo o máximo possível (público, situação, conteúdo proposto, deep link). `Origem` fica `—`.           |
| **Construída** | Implementada no código, ainda não validada com push real                              | Preencher `Origem` (`arquivo:linha`), `Tag`, `Entrega`, `Dedup`. Mover a ficha do Backlog para o catálogo certo (**§6 Agendadas** ou **§7 Por evento**). |
| **Validada**   | Testada em produção — o push real chega no aparelho e o clique abre o deep link certo | Atualizar `Status` e preencher `Histórico` (data + revisão de deploy).                                                                                   |

Regressões (mudou conteúdo/público/trigger) **não** rebaixam o status, mas
exigem atualizar a ficha e, se o comportamento mudou de forma sensível,
revalidar.

---

## 4. Convenções do canal Web Push

Detalhes do **push** que valem para todas as notificações — a ficha individual
só registra o que é específico dela. O sino (§2.4) não tem convenções próprias
enquanto não existir.

### 4.1 Como um push é enviado

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

### 4.2 Públicos (roles) disponíveis

Papéis que podem ser alvo de uma notificação: `ADMIN`, `CLASSIFIER`,
`CADASTRO`, `COMMERCIAL`, `PROSPECTOR`. Fonte de verdade dos papéis:
`enum UserRole` em `prisma/schema.prisma`.

### 4.3 Conteúdo, entrega, tags e truncamento

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

### 4.4 Infra (referências de código)

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

## 5. Template da ficha

Copie ao registrar uma nova notificação:

```
### <slug>
- Nome:          <legível>
- Status:        Ideia | Construída | Validada
- Superfícies:   Push + Sino | Só sino
- Disparo:       Agendada (cron) | Por evento
- Quando:        <cron + fuso, ou evento + condições>
- Público-alvo:  <roles>  (exclui: <quem, se houver>)
- Título:        "<string exata, com {placeholders}>"
- Corpo:         "<string exata>"
- Deep link:     <url>
- Tag:           <tag de agrupamento/dedup no aparelho>
- Entrega:       TTL <x> · urgency <y>
- Dedup:         <regra de idempotência / quando NÃO envia>
- Origem:        `arquivo:linha`   (referência ao código, não cópia)
- Notas:         <decisões de produto>
- Histórico:     criada <data> · validada em prod <data / rev>
```

---

## 6. Catálogo — Notificações agendadas (cron)

Disparadas por um agendador, fora de qualquer ação do usuário. Nenhuma
existe hoje — não há job de cron no projeto (ver §4.4).

_(vazio)_

---

## 7. Catálogo — Notificações por evento

Disparadas em reação a uma ação no app, dentro do request. Nenhuma existe hoje.

_(vazio)_

---

## 8. Backlog de ideias

Novas notificações entram aqui como `Status: Ideia`, usando o template da §5.
Ao serem implementadas, movem-se para §6 ou §7.

_(vazio)_
