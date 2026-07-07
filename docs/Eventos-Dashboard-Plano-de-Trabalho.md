# Card de Eventos do Dashboard — Plano de Trabalho

> **Status:** decisões do card travadas (E1–E11, 2026-07-07); **implementação
> NÃO iniciada**. Fonte canônica da feature — o resumo vive na decisão
> **DSH-D6** de `Revisao-Geral-Plano-de-Trabalho.md`.
> **Escopo desta 1ª rodada:** só o card (layout, design e funcionamento
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

## Propostas de design (NÃO travadas — defaults da implementação, sujeitos à validação visual)

- Shell no padrão dos cards da linha 2: branco, radius 20, borda
  `rgba(112,130,103,0.22)`, sombra `var(--dd-card-shadow)`, header com
  título "Eventos" + tile de ícone verde (mesmo molde do "Últimos envios").
- Cabeçalho de dias da semana em pt-BR (D S T Q Q S S) acima da grade;
  rótulo do período visível (ex.: "7–20 de julho").
- Quadrados de dia são `<button>` reais: press-effect canônico (scale, sem
  mudança de cor — skill button-press-effect), `aria-pressed`/seleção
  anunciada, `aria-current="date"` em hoje, navegáveis por teclado.
- Dia fora do "par" em navegação e dias passados: tom apagado; hoje com anel
  verde da marca.
- Painel do dia com scroll interno se a lista passar da altura; itens de
  evento seguirão o molde de minicard do dashboard (a definir com o
  catálogo).
- Skeleton + `prefers-reduced-motion` cobertos como nos demais cards do
  dashboard.

## Fases

| Fase   | Tema                                                                                                                                                 | Status |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **F0** | Card shell no dashboard desktop: grade 2 semanas + navegação + painel do dia + estados (vazio/skeleton), SEM backend de eventos (lista sempre vazia) | ⬜     |
| F1+    | Features de evento (a definir; cada tipo = rodada própria de decisões + backend + fluxo de criação + entrada no catálogo E11/EVD-P1)                 | ⬜     |

## Pendências

- **EVD-P1** — Catálogo de tipos de evento + cores dos dots (nomes e paleta;
  100% em aberto por decisão E11).
- **EVD-P2** — Modelo de dados / fonte dos eventos (tabela própria? projeção
  de outras features? endpoint do dashboard).
- **EVD-P3** — Versão mobile do calendário (E9: desktop-only por ora).
- **EVD-P4** — Criação manual de evento pelo card (E6: fora desta fase).

## Histórico

- **2026-07-07** — Doc criado. Decisões E1–E11 travadas com o Flavio em 3
  rodadas de perguntas (12 respostas) durante o ciclo DSH da Revisão Geral
  (sessão S6 do doc da revisão). Nenhuma implementação iniciada.
