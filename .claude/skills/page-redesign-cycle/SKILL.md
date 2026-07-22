---
name: page-redesign-cycle
description: Use this skill when starting, planning, or continuing the FV institutional redesign of a page — the page-by-page cycle. Defines the process (reference + questionnaire → locked decisions → plan mode → phases → review between phases → device → consolidation), how to split page-specific from kit, what must not be touched, the page order, and when skills/docs get updated.
---

# Ciclo de redesenho — uma página por vez

O redesenho institucional FV não é um reskin geral: é um **ciclo por página**. Cada página passa
por um redesenho **completo** — estrutura, header, cards, listas, filtros, tipografia — e os
contêineres dela realinham na mesma passada.

**A página é tocada uma vez só.** Superfície fora da vez da sua página não muda, nem quando a
conversão seria barata. Isso é decisão travada, não preferência: conversão antecipada gera retrabalho
quando o mockup da página chegar.

O que construir: `design-system` (visual), `data-tables` (lista), `containers` (superfícies),
`forms` (campos), `css-architecture` (onde a regra vai).

---

## §1 O processo

1. **Referência + questionário.** O Flavio manda referências visuais; o questionário comparativo
   sai do estado atual da página. As respostas viram **decisões travadas ANTES de codar**.
2. **Plan mode.** Decisões + inventário das superfícies da página × contêiner-alvo
   (`containers` §8).
3. **Implementação direta no código** — sem mockup HTML intermediário. Commits atômicos, gates
   verdes em cada um.
4. **Conferência do Flavio ao fim de cada fase**, no dev local, antes de seguir.
5. **Rodadas de ajuste** até a página ficar perfeita. Quantas forem necessárias.
6. **Validação no device** (🖥️📱).
7. **Consolidação** das skills e docs.

**O passo 4 não é opcional e não se acumula.** Fechar duas fases e conferir as duas juntas é mais
caro: o ajuste da primeira reabre trabalho da segunda.

---

## §2 Fases por peso da página

| Peso   | Fases                                              |
| ------ | -------------------------------------------------- |
| Leve   | E1 (chrome/página desktop) → E2 (detalhe + mobile) |
| Pesada | F1 Lista → F2 Detalhe → F3 Painéis → F4 Mobile     |

Página pesada = lista grande + detalhe grande + muitas superfícies modais. O corte entre F2 e F3 é
deliberado: primeiro o detalhe **fica de pé** (hero, abas, cards), depois as superfícies que saem
dele viram painéis. Misturar os dois faz a conferência do detalhe acontecer com metade dos fluxos
quebrados.

**O mobile é sempre a última fase.** Desktop e mobile são árvores diferentes (`data-tables` §9);
tentar manter as duas em paralelo durante as rodadas de ajuste dobra o custo de cada mudança.

---

## §3 Separar página-específico de padrão

A cada peça nova, a pergunta: **outra página vai precisar disso?**

- **Sim, e já tem duas usando** → genérico `.fv-*`, e o outro consumidor migra.
- **Sim, mas só esta usa hoje** → escopo de página + comentário dizendo que é candidato a genérico.
- **Não** → classe própria do componente.

O critério de promoção está em `css-architecture` §2: promove-se na **segunda** página que precisa,
não na primeira.

Peça que nasceu genérica no ciclo de `/samples`: `.fv-choice*` (escolha entre poucas opções). Peça
que ficou escopada: `.sample-loss-sheet` (só ajusta margens de avisos daquele painel).

---

## §4 Não tocar

Fora do ciclo, em qualquer página:

- **`CameraSheet` + os modais de classificação** — são globais, montados no `AppShell`, disparados
  também fora da página que você está redesenhando.
- **`ClientQuickCreateModal`** — múltiplos call-sites em áreas diferentes; já está no contêiner
  certo.
- **`DetailOverlay`** — o componente em si. Usar, não editar; ele serve três páginas.
- **Criação de contrato** (LotPicker + Etapa 2) — fora do ciclo, aguarda specs.

Se um desses **precisa** mudar para a página funcionar, isso é uma decisão a travar com o Flavio no
plan mode, não uma edição de passagem.

---

## §5 Ordem das páginas

`/cadastros` (piloto) → `/samples` → `/relatorios` → `/users` + `/profile` → `/contratos` +
`/embarques` → globais (senha, menu, login). Câmera fica fora.

Ajustável a cada passo, mas **o piloto é referência**: `/cadastros` foi onde o kit nasceu e é o
exemplar a consultar quando a dúvida for "como isso ficou lá?".

### Antes de começar uma página

Levante o inventário: quantas superfícies ela tem, qual o contêiner-alvo de cada uma
(`containers` §8), quais componentes são compartilhados com outras páginas
(`css-architecture` §7), e o tamanho dos arquivos. Uma página de 3 mil linhas com 20 superfícies
não cabe em duas fases.

---

## §6 Consolidação

**Skill segue consolidação; ledger segue decisão.** Durante a experimentação, nada de editar skill —
o padrão ainda está mudando e a skill viraria histórico de tentativas.

| Momento                      | O que atualizar                                       |
| ---------------------------- | ----------------------------------------------------- |
| Decisão travada com o Flavio | ledger de RD no doc de plano, **na hora**             |
| Fim de fase                  | doc de plano (o que foi implementado) + memória       |
| Fim da página (validada)     | skills que a página mudou + `containers` §8 (🔜 → ✅) |
| Mudança de plano no meio     | confirmar, testar, e registrar no doc                 |

**Exceção:** um fato que a skill afirma e que a implementação invalidou corrige **na hora**, mesmo
em experimentação. Skill errada é pior que skill desatualizada.

`skill-maintenance` roda ao fim de cada fase.

---

## §7 Checklist de conferência de fase

Antes de chamar o Flavio para conferir:

- [ ] Gates verdes: `typecheck`, `lint`, `format:check`, `test:unit`, `test:contracts`
- [ ] Os fluxos que a fase tocou abrem e fecham sem console error
- [ ] Nada fora do escopo da fase mudou de aparência
- [ ] Superfícies das fases anteriores continuam funcionando (regressão é o que mais aparece)
- [ ] O que ficou **conscientemente** para a fase seguinte está anotado
- [ ] `npm run build` só no pré-push, e **nunca** com `next dev` de pé
