# Card de Eventos do Dashboard — Plano de Trabalho

> **Status:** decisões E1–E19 travadas (2026-07-07); **F0 implementada**
> (commit `9a66cd8`), aguardando validação no device. Fonte canônica da
> feature — o resumo vive na decisão **DSH-D6** de
> `Revisao-Geral-Plano-de-Trabalho.md`.
> **Escopo da 1ª rodada:** só o card (layout, design e funcionamento
> geral). As features que GERAM eventos são atualizações grandes e virão
> depois, cada uma com rodada própria de decisões.

## Contexto e objetivo

A coluna direita da linha 2 do dashboard desktop ficou vazia após as remoções
de "Últimas atividades" (2026-07-06) e "Vendas e perdas" (2026-07-07,
DSH-D3). O Flavio decidiu que ela será ocupada por **um único card de
Eventos em formato de calendário**: os dias aparecem em quadrados e, ao
clicar num dia, o card apresenta as atividades marcadas para ele.

Os eventos em si dependem de lógica e funcionalidades novas no sistema —
**ideias citadas como contexto** (nada travado): programações de embarque,
entregas de café futuro, envio marcado de aprovações. Cada uma será uma
feature própria, com modelo de dados e fluxo de criação definidos na sua
rodada.

## Decisões travadas (E1–E11, 2026-07-07)

- **E1 — Card único, altura total da coluna.** A coluna direita inteira é um
  só card, cobrindo a mesma altura dos dois cards da esquerda juntos (donut
  "Lotes disponíveis" + "Últimos envios").
- **E2 — Visão de duas semanas.** A grade mostra a semana atual + a próxima,
  com os dias em quadrados grandes (não é o mês inteiro).
- **E3 — Navegação livre com passo de 2 semanas.** Setas ◀ ▶ viram a
  "página" (2 semanas por clique), sem limite pra passado ou futuro; botão
  **"Hoje"** volta pro par semana atual + próxima.
- **E4 — Expansão em painel fixo.** Clicar num dia o **seleciona** e um
  painel fixo dentro do card (abaixo da grade) lista as atividades daquele
  dia. A grade não se reorganiza (formato escolhido em preview, no lugar do
  quadrado que cresce inline).
- **E5 — Indicador por dots coloridos.** Dia com eventos mostra pontinhos
  coloridos (1 cor por tipo de evento) no quadrado; quando não couber,
  `+N`.
- **E6 — Só visualização.** O card não cria eventos nesta fase; eventos
  nascem nos fluxos das features futuras. Criação manual pelo card fica em
  aberto (EVD-P4).
- **E7 — O card nasce antes das features.** A implementação do card (grade +
  navegação + painel + estados) acontece com estado vazio ("Nenhum evento"),
  fechando o layout do dashboard; as features vão populando depois.
- **E8 — Papéis: todos veem tudo.** Os 5 papéis não-PROSPECTOR veem o card e
  os mesmos eventos (consistente com DSH-D2). Restrição por papel, se algum
  tipo de evento pedir, será decidida na feature correspondente.
- **E9 — Desktop-only por ora.** Como o "Últimos envios", o calendário nasce
  no desktop; versão mobile fica como pendência (EVD-P3).
- **E10 — Estado inicial: hoje selecionado.** O quadrado de HOJE vem
  destacado e já selecionado; o painel abre mostrando os eventos de hoje
  ("Nenhum evento hoje" quando vazio).
- **E11 — Catálogo de tipos em aberto.** Nenhum tipo de evento (nome ou cor)
  está travado — nem os exemplos do contexto. O catálogo será construído
  feature a feature (EVD-P1).

## Decisões da rodada da F0 (E12–E19, 2026-07-07)

- **E12 — Semana começa no DOMINGO** (D S T Q Q S S), calendário
  tradicional. A matemática de quinzena é própria (domingo-based, BRT,
  `lib/dashboard-calendar.ts`) — **não unificar** com o
  `computeClientWeekReference` do relatório semanal, que é segunda-based
  por regra daquele domínio.
- **E13 — Quadrado do dia: número + dots** (até 3 + `+N`); todo o detalhe
  fica no painel.
- **E14 — Painel do dia é o protagonista (~60%)**; grade compacta (~40%).
- **E15 — Rótulo do período em intervalo**: "7 – 20 de julho"; cruzando mês
  "28 de jul – 10 de ago"; ano acrescentado quando o período sai do ano
  corrente.
- **E16 — Sábados e domingos APAGADOS** (esmaecidos no cabeçalho e nos
  quadrados).
- **E17 — Dias passados iguais aos demais** (sem distinção visual —
  substitui a proposta antiga de esmaecer o passado; a navegação livre E3
  já dá acesso ao histórico).
- **E18 — Deslize horizontal** (~200ms na direção da seta) na troca de
  quinzena; `prefers-reduced-motion` vira troca seca.
- **E19 — Copy do vazio na F0**: "Nenhum evento para este dia." + nota
  menor "As programações (embarques, entregas, aprovações...) chegam nas
  próximas atualizações." — a nota é temporária da F0 e sai quando as
  features de evento chegarem.
- **E20 (revisa a altura da E1, validação no device 2026-07-07)** — o card
  ocupa a coluna direita **INTEIRA do dashboard**: do topo (altura da linha
  de pendências) até a base, e não só a altura da pilha da linha 2. As
  pendências passaram a viver dentro da coluna esquerda (`.dd-left-col`),
  com a largura dos StatCards preservada; o espaço extra do card vai todo
  pro painel do dia (E14). Commit `49f4fb7`.

## Propostas de design (NÃO travadas — defaults da implementação, sujeitos à validação visual)

- Shell no padrão dos cards da linha 2: branco, radius 20, borda
  `rgba(112,130,103,0.22)`, sombra `var(--dd-card-shadow)`. Header: título
  "Eventos" + rótulo do período embaixo (E15); à direita o grupo de
  navegação ◀ `Hoje` ▶ (no lugar do tile de ícone dos outros cards).
- Quadrados de dia são `<button>` reais: press-effect canônico (scale, sem
  mudança de cor — skill button-press-effect), `aria-pressed` na seleção,
  `aria-current="date"` em hoje, roving tabindex com setas (±1 dia
  horizontal, ±7 vertical).
- Hoje: anel verde da marca (`inset box-shadow var(--brand-green)`);
  selecionado: preenchimento `#e8f1ec`; virada de mês: "1 ago" no quadrado.
- Painel do dia com scroll interno; itens de evento seguirão o molde de
  minicard do dashboard (a definir com o catálogo EVD-P1).
- Sem skeleton na F0 (nada carrega); estados de loading nascem com o fetch
  da F1. Deslize E18 coberto no bloco `prefers-reduced-motion` do
  dashboard.

## Fases

| Fase   | Tema                                                                                                                                  | Status                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **F0** | Card shell no dashboard desktop: grade 2 semanas + navegação + painel do dia + vazio E19, SEM backend de eventos (lista sempre vazia) | 📱 implementada (`9a66cd8`); validar no device |
| F1+    | Features de evento (a definir; cada tipo = rodada própria de decisões + backend + fluxo de criação + entrada no catálogo E11/EVD-P1)  | ⬜                                             |

## Pendências

- **EVD-P1** — Catálogo de tipos de evento + cores dos dots (nomes e paleta;
  100% em aberto por decisão E11).
- **EVD-P2** — Modelo de dados / fonte dos eventos (tabela própria? projeção
  de outras features? endpoint do dashboard).
- **EVD-P3** — Versão mobile do calendário (E9: desktop-only por ora).
- **EVD-P4** — Criação manual de evento pelo card (E6: fora desta fase).
- **EVD-T1** — Helpers de `lib/dashboard-calendar.ts` (quinzena, dayKey,
  rótulos) sem unit test: o `node --test` do projeto não roda TS. Cobrir
  quando houver infra de teste front (ou na F1, se a matemática migrar pro
  backend do endpoint).

## Histórico

- **2026-07-07** — Doc criado. Decisões E1–E11 travadas com o Flavio em 3
  rodadas de perguntas (12 respostas) durante o ciclo DSH da Revisão Geral
  (sessão S6 do doc da revisão). Nenhuma implementação iniciada.
- **2026-07-07 (cont.)** — Decisões E12–E19 travadas (2 rodadas, 8
  respostas) e **F0 implementada** (commit `9a66cd8`): helpers
  `lib/dashboard-calendar.ts`, componente
  `components/dashboard/EventsCalendarCard.tsx`, CSS `dd-events-*` e wiring
  no `DashboardDesktop` (coluna direita da linha 2). 100% front — sem
  endpoint; o seam da F1 é a prop `events`
  (`Record<'YYYY-MM-DD', DashboardCalendarEventStub[]>`, tipo local do
  componente). Gates verdes; aguardando validação no device.
- **2026-07-07 (validação)** — Flavio pediu o card mais alto → **E20**: a
  coluna direita inteira, incluindo a altura das pendências (`49f4fb7`).
