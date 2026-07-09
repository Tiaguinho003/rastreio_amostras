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

Esta seção descreve o **modelo**: o que uma notificação é, como nasce e onde
ela aparece. É desenho aprovado, ainda sem implementação. As decisões estão
marcadas `N1`–`N4` para poderem ser citadas em commits e discussões.

### 2.1 Uma notificação é um registro, não um push

O erro do modelo antigo era tratar a notificação **como** o push: se o push
não fosse entregue — usuário sem inscrição, aparelho offline, iOS sem o app
instalado — a notificação simplesmente não existia para aquela pessoa. E
mesmo entregue, ela sumia da central do sistema operacional e não havia
como reencontrá-la.

**`N1` — a notificação passa a ser um registro no banco, com destinatários
próprios.** No momento do disparo, o sistema resolve **quem** deve recebê-la
e grava um registro por destinatário. O push deixa de ser a notificação e
vira **um canal de entrega** dela; o sino lê o registro.

Consequências que valem a pena enunciar:

- Quem nunca ativou o push **vê tudo no sino**, do mesmo jeito.
- Quem estava offline, ou trocou de celular, **não perde nada**.
- A audiência é **congelada no disparo**. Um usuário que muda de papel depois
  continua vendo o que recebeu enquanto era CLASSIFIER, e não passa a ver
  retroativamente o que foi mandado para COMMERCIAL.

Isso exige estrutura nova no banco — provavelmente duas tabelas: a
notificação (conteúdo, tipo, deep link, quando) e o vínculo com cada
destinatário. O desenho fino do schema é pendência (§2.6).

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

**`N2` — no mobile, o sino vive na topbar, que passa a renderizar em todas as
rotas.** Hoje a topbar mobile é condicional: ela aparece em algumas rotas
(dashboard, lotes, clientes, usuários, perfil, informe) e some em outras
(contratos, financeiro, cadastros). Para o sino cumprir o "todas as páginas",
a topbar passa a renderizar sempre, enxuta — sino + avatar. No desktop a
topbar já é permanente, então o sino entra direto. Isso implica revisar o
`padding-top` das telas que hoje assumem topbar ausente (§2.6).

**`N3` — o sino não tem estado de lido/não lido.** Sem badge, sem contador,
sem marcação por item. O painel é um **histórico cronológico**, e o usuário
olha quando quiser. É a versão mais simples que resolve o problema declarado
(reencontrar o que o push mostrou e sumiu). Contador de não lidas é uma
adição possível no futuro, e não é barata: exige coluna de estado por
destinatário, endpoint de marcação e uma regra de quando zerar.

Cada item do painel leva o mesmo **deep link** do push — clicar abre a tela
onde a coisa aconteceu.

### 2.5 Retenção

**`N4` — uma notificação vive 30 dias no sino.** Depois disso é apagada por
uma rotina de limpeza. O painel carrega as mais recentes, paginado.

Notificação velha não serve para nada: ninguém precisa saber, em setembro, de
uma venda registrada em junho — para isso existem as telas de dados. Trinta
dias mantêm a tabela pequena e o histórico útil.

**Tensão a resolver:** a infraestrutura de cron do projeto foi removida junto
com o catálogo antigo. Não há hoje onde pendurar essa limpeza (§2.6).

### 2.6 O que ainda não está decidido

Pendências abertas, a resolver antes ou durante a implementação. Nenhuma
bloqueia o registro das notificações no catálogo.

| ID     | Pendência                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `N-P1` | **Schema.** Duas tabelas (notificação + destinatário) e seus índices. O vínculo por destinatário existe para a audiência, não para estado de lida (`N3`).                                                                                     |
| `N-P2` | **Notificações personalizadas.** Conteúdo que varia por usuário (uma saudação com o primeiro nome, por exemplo) não cabe num único registro compartilhado. Ou vira um registro por destinatário, ou o conteúdo mora no vínculo. Decidir qual. |
| `N-P3` | **Endpoints do sino.** Listagem paginada escopada ao usuário. Definir contrato, limite de página e ordenação.                                                                                                                                 |
| `N-P4` | **A limpeza dos 30 dias.** Sem cron no projeto, ou se recria um job agendado, ou a limpeza roda de forma oportunista (na escrita, na leitura). Recriar cron por causa disso é caro; decidir com calma.                                        |
| `N-P5` | **Topbar em todas as rotas (mobile).** Mexe no `AppShell` e no `padding-top` de várias telas. Precisa de varredura visual — é mudança de shell, não de página.                                                                                |
| `N-P6` | **PROSPECTOR.** Ele tem app restrito, sem tabbar. Confirmar se ele vê o sino e o que entra nele.                                                                                                                                              |

---

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
