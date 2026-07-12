# Dashboard — Plano de Trabalho

Status: Em andamento (check-up geral do dashboard — desktop primeiro, depois mobile)
Escopo: backlog, decisões e execução das mudanças no dashboard. Acompanha o documento-mãe `Dashboard-Visao-Geral.md`, que registra o funcionamento atual.
Última revisão: 2026-07-12
Documentos relacionados: `Dashboard-Visao-Geral.md` (estado atual), `Revisao-Geral-Plano-de-Trabalho.md` (roteiro de revisão do app inteiro)

> **Objetivo do ciclo (Flavio, 2026-07-12):** check-up geral do sistema, página por página e por dispositivo, começando pelo **dashboard desktop** → depois **dashboard mobile**. Meta: simplificar, deixar o app menos confuso de mexer e viabilizá-lo para mais corretoras (multi-cliente). Mudanças de layout/funcionalidade/disposição estão em cima da mesa.

---

## 1. Protocolo de trabalho

1. **Docs-first.** O `Dashboard-Visao-Geral.md` registra o funcionamento atual (verdade viva). Nenhuma mudança começa sem a linha de base registrada.
2. **Uma mudança por vez, com decisão registrada.** Cada mudança vira uma decisão numerada (`DSB-Dn`) aqui neste doc, discutida e confirmada antes de implementar.
3. **Ao concluir e validar uma implementação:** atualizar o `Dashboard-Visao-Geral.md` no mesmo ciclo (o estado atual muda) e marcar o item aqui como ✅.
4. **Ordem por dispositivo:** desktop primeiro; só depois de o desktop estar correto, o mobile.
5. **Validação no device** é obrigatória para o que não dá para testar localmente (visual/responsivo/iOS PWA). Itens só viram ✅ com validação do Flavio.
6. **Gates verdes** antes de qualquer commit (lint, format:check, typecheck, build, testes).

Prefixo de decisão deste ciclo: **`DSB`** (Dashboard check-up). Achados: **`DSB-Bn`** (bug), **`DSB-Gn`** (gargalo), **`DSB-Ln`** (design/layout), **`DSB-An`** (acessibilidade).

---

## 2. Linha de base

O funcionamento atual está inteiramente descrito em **`Dashboard-Visao-Geral.md`**. Resumo do que existe hoje:

- Dashboard padrão (5 papéis não-PROSPECTOR): desktop = 2 StatCards + donut + Últimos envios + card de Eventos; mobile = hero + 2 op-cards + donut.
- Dashboard do PROSPECTOR: dedicado (visitas/informes).
- 6 rotas de API; card de Eventos com 3 feeds (pagamento/aprovação/embarque).

**Tudo isso está implementado mas ainda aguarda validação no device** — ver §4.

---

## 3. Backlog herdado (absorvido dos docs antigos)

Itens que estavam abertos no `Eventos-Dashboard-Plano-de-Trabalho.md` (removido) e na seção DSH da Revisão Geral. Reavaliar cada um dentro deste check-up.

### Layout / design
- **DSB-H1 (era DSH-P6 / EVD-P5)** — **Refino de layout do card de Eventos ADIADO.** Proporção grade × painel, altura dos quadrados e demais ajustes visuais ficaram para depois ("layout faremos depois"). → **Entra direto no escopo do check-up desktop.**
- **DSB-H2 (era DSH-P5)** — Greys fora da paleta nos cards `dd-*` (`#72766f`, `#1a2e1f`, verde-up `#1f8540`). Dívida de token; trocar = mudança visual.
- **DSB-H3** — O grid desktop foi redesenhado após a remoção de "Vendas e perdas"/pulso; confirmar se a disposição atual (2 StatCards com colunas vazias na linha) é a definitiva ou se sobra espaço a aproveitar.

### Gargalos / performance
- **DSB-H4 (era DSH-P3)** — `getDashboardPending` devolve **até 500 itens** a cada refresh (a lista só é usada no `OperationModal`). Avaliar lazy-load se pesar.
- **DSB-H5 (era DSH-P4)** — `client.count(completeness)` tende a seq scan (sem índice dedicado). Revisar se o dashboard pesar.

### Cobertura mobile
- **DSB-H6 (era EVD-P3)** — **Card de Eventos não existe no mobile** (desktop-only). Definir se/como o calendário aparece no mobile. → **Entra no ciclo do dashboard mobile.**
- **DSB-H7** — Card "Últimos envios" também é desktop-only. Mesma pergunta para o mobile.

### Testes
- **DSB-H8 (era EVD-T1)** — Helpers de `lib/dashboard-calendar.ts` (quinzena, dayKey, rótulos) sem unit test (o `node --test` do projeto não roda TS). Cobrir quando houver infra de teste front, ou migrar a matemática para o backend.

### Features futuras (ideias, nada travado)
- **DSB-H9 (era E11 / EVD-P1)** — Catálogo de tipos de evento está aberto: hoje só pagamento, aprovação e embarque. Novos tipos entram feature a feature.
- **DSB-H10 (era EVD-P4)** — Criação manual de evento pelo card (fora de escopo até aqui).

---

## 4. Validação no device pendente

O redesenho e os feeds foram implementados mas nunca foram confirmados no aparelho real. Antes (ou durante) as mudanças deste check-up, validar:

- **Desktop:** 2 StatCards no tamanho atual; pilha donut + "Últimos envios" do mesmo tamanho preenchendo a altura, lista rolando por dentro; minicards (lote/pill/destinatário/tempo); envio cancelado esmaecido; card de Eventos (grade domingo-first, hoje com anel/selecionado, navegação ◀ Hoje ▶ com deslize, painel do dia, setas do teclado); os 3 feeds de eventos (pagamento/aprovação/embarque) com os deep links para `/contratos`.
- **Viewport baixa** (~768px de altura): o card de Eventos estoura?
- **Mobile:** hero + op-cards + donut a 320px; dashboard do PROSPECTOR intacto; banner de erro (modo avião).
- **Contraste** (DSH-A3): textos secundários pequenos ficaram um tom mais escuros — conferir.

---

## 5. Decisões do ciclo

- **DSB-D1 (2026-07-12)** — Consolidação da documentação do dashboard em **dois arquivos**: `Dashboard-Visao-Geral.md` (mãe / estado atual) e este `Dashboard-Plano-de-Trabalho.md` (futuro). O `Eventos-Dashboard-Plano-de-Trabalho.md` foi **absorvido e removido**; a seção DSH da `Revisao-Geral-Plano-de-Trabalho.md` passou a apontar para estes dois docs. Histórico preservado no Git.

_(Próximas decisões do check-up entram aqui a partir de DSB-D2.)_

---

## 6. Fases

_A definir com o Flavio ao iniciar as mudanças. Ordem-base: **desktop → mobile**, uma frente por vez, cada uma com sua decisão registrada e a Visão Geral atualizada ao concluir._

---

## 7. Histórico

- **2026-07-12** — Início do check-up geral (Flavio). Documentação do dashboard consolidada nos dois arquivos (DSB-D1). Visão Geral reconstruída a partir do código real; backlog herdado absorvido dos docs antigos. Nenhuma implementação de mudança iniciada — aguardando as primeiras especificações do Flavio.
