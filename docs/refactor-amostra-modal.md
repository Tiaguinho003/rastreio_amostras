# Refactor: Nova Amostra como Modal

Status: Fases 1, 2 e 3 CONCLUIDAS (2026-05-11). Fase 4 pronta pra execucao; Fase 5 aguarda Fases 1-4
Escopo: refatoracao da pagina `/samples/new` para modal acionado por FAB + reorganizacao da tabbar mobile + Perfil como item de tabbar + fusao /settings em /profile + sino de notificacoes placeholder
Inicio do planejamento: 2026-05-11
Foco da v1: mobile (desktop herda paralelamente apenas onde 5.11 e 5.15 exigem)
Documentos relacionados: `docs/Produto-e-Fluxos.md`, `docs/Arquitetura-Tecnica.md`

---

## 1. Objetivo

Eliminar `/samples/new` como pagina dedicada e transformar o registro de amostras em um fluxo modal acionado por FAB (botao flutuante "+"), espelhando o padrao ja usado em Clientes. A vaga liberada na tabbar mobile passa a ser ocupada por Perfil (rota dedicada `/profile`), que absorve `/settings` e usa avatar do usuario (iniciais) como icone. Header mobile ganha sino de notificacoes placeholder. Desktop sincroniza removendo `/samples/new` do nav, mas em vez de FAB usa botao "+ Nova amostra" no topo da lista.

Motivacoes:

- Registro de amostras e a acao mais recorrente do app — modal acelera o fluxo sem trocar de contexto de pagina
- Consistencia com o padrao ja consolidado em Clientes (FAB + modal de quick-create)
- Perfil ganha primeira-classe na navegacao, removendo o "esconderijo" atras do avatar do header
- Tabbar fica com 5 itens mais coerentes semanticamente
- `/settings` se funde em `/profile` (conceitualmente sao a mesma coisa: conta do usuario)
- Espaco no header mobile vira oportunidade pra sino de notificacoes (placeholder agora, feature futura)

Nao-objetivos desta refatoracao:

- Mudar regras de negocio do registro de amostra (campos, validacoes, eventos)
- Refatorar o fluxo de classificacao (`/classification`)
- Refatorar `/samples` (lista) alem da adicao do FAB e do botao desktop
- Refatorar a camera (`/camera`) — continua sendo rota dedicada com destaque na tabbar
- Implementar feature de notificacoes (sino fica como placeholder visual)
- Implementar upload de foto de usuario (avatar continua sendo iniciais)

---

## 2. Estado atual (referencia para revisao)

### 2.1 Tabbar mobile

- Definicao do componente: `components/MobileTabbar.tsx:1-73` (renderizada via React Portal direto em `document.body`)
- Itens configurados em `components/AppShell.tsx:47-78`:
  1. `/dashboard` — "Inicio"
  2. `/samples/new` — "Novo" (alvo de remocao)
  3. `/camera` — "Camera" (unico item com `emphasis: 'primary'` — destaque visual central)
  4. `/samples` — "Amostras"
  5. `/clients` — "Clientes"

### 2.2 Perfil e Settings

- Componente bottom sheet: `components/ProfileBottomSheet.tsx` (acionado por evento custom `'open-profile-sheet'`)
- 8 dispatches do evento espalhados:
  - `components/AppShell.tsx:514-515` (avatar do header em mobile)
  - `components/dashboard/DashboardMobile.tsx:65`
  - `app/samples/new/page.tsx:596`
  - `app/clients/[clientId]/page.tsx:1029`
  - `app/users/page.tsx:595`
  - `app/samples/page.tsx:1016`
  - `app/clients/page.tsx:882`
  - `app/samples/[sampleId]/page.tsx:1850`
- Listener no `AppShell.tsx:286-295`
- Rota `/settings` JA EXISTE: `app/settings/page.tsx` (639 linhas), faz update de perfil (fullName, username, phone), troca de email com codigo, troca de senha, logout
- Linkada no dropdown desktop: `AppShell.tsx:556`
- Reconhecida em `isMainNavItemActive`: `AppShell.tsx:101-103`

### 2.3 FAB de Clientes (referencia de implementacao)

- JSX inline: `app/clients/page.tsx:910-920`
- CSS: `app/globals.css:5788-5818`, classe `.cv2-fab`
- Posicao: `fixed`, `bottom: calc(env(safe-area-inset-bottom) + 4.6rem)`, `right: clamp(14px, 4vw, 20px)`
- Estilo: gradiente verde, sombra, escala 0.92 ao toque
- z-index: 50
- Acao: abre `ClientQuickCreateModal`

### 2.4 Fluxo atual de Nova Amostra

- Arquivo: `app/samples/new/page.tsx` (964 linhas)
- Campos do form (ordem): Cliente, Owner units, Sacas, Safra, Lote origem, Local, Observacoes
- Sticky footer: "Limpar" + "Criar amostra"
- Pos-criacao: `NewSampleLabelModal` (linhas 807-934) com 2 steps:
  - `review` (titulo "Confirme os dados da amostra"): card nao-editavel com os dados preenchidos + 2 botoes circulares — [Editar (fecha modal, volta pro form)] e [Confirmar (submete)]
  - `created` (titulo "Amostra criada"): painel grande com a label "Lote" + numero do lote em destaque + texto "Anote este numero na saca antes de seguir." + botao [Ir para amostra]
- **Sem QR code, sem print automatico no fluxo de criacao** — removido na Fase P3 (comentarios em `app/samples/new/page.tsx:73-76` e `864-866`: "step `completed` (com QR + polling de impressao) virou `created` (apenas mostra o lote em destaque pra anotar na saca)")
- Persistencia de draft: `sessionStorage` com key `'new-sample-draft-id'` (UUID por sessao, limpo apos sucesso)
- Compressao automatica de fotos via Canvas API
- Print de etiqueta **NAO** integrado no fluxo de criacao — existe apenas como acao MANUAL nos detalhes da amostra (ver 2.4b)

### 2.4b Fluxo de etiqueta (acao manual, fora do escopo desta refatoracao)

Registrado pra evitar confusao:

- Pagina: `app/samples/[sampleId]/page.tsx`, secao "Etiqueta" (linhas 1983-2038)
- Visivel para qualquer status diferente de `INVALIDATED`
- Botao "Imprimir etiqueta" / "Imprimir novamente" abre `LabelModal` proprio dos detalhes (review + completed) — modal e logica separados do modal de criacao
- `requestQrPrint` (`lib/api-client.ts:1144`) tem apenas 1 caller no frontend: `app/samples/[sampleId]/page.tsx:1238` (handler manual)
- Status do PrintJob (PENDING/SUCCESS/FAILED/EXPIRED) exibido + polling enquanto PENDING (linhas 686-700)
- **Independente de classificacao** — etiqueta pode ser impressa desde `REGISTRATION_CONFIRMED`. Bloqueada apenas em `INVALIDATED` (gating em `canQuickPrint` linhas 767-770 + `canRequestReprintStatus` linha 232-234)
- Laudo (`canQuickReport` linha 771-773) e diferente: requer `CLASSIFIED` + `classificationAttachment`. Tambem fora do escopo desta refatoracao.

### 2.5 Padrao de modais

- CSS canonico: `app/globals.css:1015-1260`
- Variante padrao `.app-modal`: `min(430px, calc(100vw - 1.5rem))`, max-height `min(84dvh, 40rem)`
- Variante `.app-modal.is-themed`: 650px, header verde
- Bottom sheet: apenas em `ProfileBottomSheet` (componente proprio, CSS em `app/globals.css:18591+`)

### 2.6 Schema do usuario

- `SessionUser` em `lib/types.ts:52-62`: id, username, email, fullName, displayName, role, status, initialPasswordDecision, pendingEmailChange
- **NAO HA campo de foto/avatar** (avatar sera iniciais, conforme 5.14)

---

## 3. Principios norteadores

1. **Consistencia com Clientes** — o padrao do FAB de cliente e a referencia visual e comportamental
2. **Mobile-first** — desktop herda apos validacao mobile (exceto pontos onde 5.11/5.15 forcam sincronia)
3. **Zero perda de dados acidental** — fechar modal nunca descarta trabalho silenciosamente
4. **Sem regressao de funcionalidade** — todos os campos, validacoes, eventos e integracoes continuam funcionando
5. **Tabbar nao "infla"** — permanece com 5 itens, Camera continua central com destaque
6. **Modal nao prende o usuario** — sempre ha caminho claro de saida
7. **Reuso antes de criar** — usar componentes/CSS existentes sempre que possivel
8. **Placeholder explicito > funcionalidade fingida** — sino de notificacao nao-clicavel ate ter feature real

---

## 4. Metodologia de analise de decisoes

Toda decisao listada neste documento (e qualquer decisao nova que apareca durante a refatoracao) deve passar pelo protocolo abaixo. Objetivo: garantir consistencia, evitar retrabalho, nao perder caminhos importantes e enxergar todos os impactos antes de fechar.

### 4.1 Protocolo de analise por decisao

Para cada decisao, antes de marcar `[DECIDIDO]`:

1. **Verificar o estado atual do codigo** — nao confiar em memoria nem em afirmacoes deste documento sem checar `file_path:line_number`.
2. **Conferir coerencia com decisoes anteriores** — toda decisao nova deve ser comparada com as ja fechadas.
3. **Listar gargalos e riscos** — onde a decisao cria atrito.
4. **Identificar melhorias adjacentes** — registrar oportunidades sem virar bola de neve.
5. **Mapear caminhos alternativos** — ao menos 2-3 opcoes mesmo quando uma parece obvia.
6. **Antecipar perguntas derivadas** — perguntas viram decisoes novas ou entram na secao 10.
7. **Pensar a UX completa do ponto afetado** — entrada, preenchimento, edge cases, saida, retomada, erro, sucesso, acessibilidade, gestos, teclado virtual, botao voltar, rotacao.

### 4.2 Quando aplicar

- Antes de marcar uma decisao como `[DECIDIDO]`
- Quando uma resposta do usuario aparenta abrir ramificacoes nao previstas
- Antes de iniciar uma Fase de execucao
- Apos qualquer mudanca relevante no codigo que possa invalidar decisoes ja tomadas
- Quando duas decisoes parecem afetar o mesmo arquivo/componente

### 4.3 Formato do registro apos decidir

Quando uma decisao for tomada, adicionar uma subsecao **"Decidido"** logo abaixo da decisao com: Escolha, Justificativa, Gargalos aceitos, Perguntas novas, Decisoes anteriores revisitadas, Impacto na ordem de execucao. E atualizar a tabela de tracking (secao 9).

---

## 5. Decisoes

### 5.1 Reorganizacao da tabbar `[DECIDIDO]`

Como organizar a tabbar com Camera mantendo posicao central destacada, removendo "Novo" e adicionando "Perfil"?

| Opcao | Layout                                                | Tradeoff                                                                |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| **A** | `Inicio \| Amostras \| Camera* \| Clientes \| Perfil` | Convencao mobile consagrada. Agrupa entidades ao redor da acao central. |
| B     | `Inicio \| Perfil \| Camera* \| Amostras \| Clientes` | Substituicao 1:1 do "Novo" — quebra convencao.                          |
| C     | `Inicio \| Clientes \| Camera* \| Amostras \| Perfil` | Espelha A invertendo Clientes/Amostras.                                 |

#### Decidido

- **Escolha:** A
- **Justificativa:** Convencao mobile consagrada (Perfil na extrema direita: Instagram, X, Twitter) + simetria semantica (Entidades — Amostras e Clientes — ao redor da acao central Camera). Combina com 5.10 (avatar do usuario na extrema direita reforca convencao).
- **Gargalos aceitos:** "Amostras" muda da posicao 4 para a posicao 2; usuarios podem clicar errado por memoria muscular ate aprenderem.
- **Perguntas novas:** estado ativo do "Perfil" tab quando em `/profile` (resolvido — Nota 6.2: ring verde).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 implementa essa ordem em `MOBILE_NAV_ITEMS`.

---

### 5.2 Perfil: rota propria ou continua bottom sheet? `[DECIDIDO]`

| Opcao | Comportamento                                 | Tradeoff                                                       |
| ----- | --------------------------------------------- | -------------------------------------------------------------- |
| **A** | Vira rota dedicada. Bottom sheet removido.    | Consistente com tabbar (item ativo natural via `usePathname`). |
| B     | Continua sheet, tabbar dispara evento custom. | Gambiarra pra estado ativo.                                    |
| C     | Ambos coexistem.                              | Duplicidade confusa.                                           |

#### Decidido

- **Escolha:** A
- **Justificativa:** Rota dedicada permite item ativo natural via `usePathname`; abre espaco pra perfil crescer; remove gambiarra do evento custom; alinha com convencao de PWA/SPA.
- **Gargalos aceitos:** Anima cao swipe-down do sheet e descontinuada (perda de charm visual). 8 dispatches de `'open-profile-sheet'` precisam ser limpos.
- **Perguntas novas:** absorve ou nao `/settings`? (resolvido em 5.8). Que acontece com avatar do header? (resolvido em 5.9). Conteudo da pagina? (resolvido em 5.12).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 inclui criacao/renomeacao da rota, migracao do conteudo e remocao do sheet.

---

### 5.3 Onde mora o FAB de "+ amostra" (mobile)? `[DECIDIDO]`

> Reinterpretada apos 5.17: agora trata apenas do FAB **mobile**. Desktop usa botao no topo da lista (5.15).

| Opcao | Lugar(es) do FAB mobile          | Tradeoff                                                                                 |
| ----- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| **A** | So `/samples` mobile             | Espelha 1:1 o padrao de Clientes. Consistente com 5.17 (dashboard sem ponto de entrada). |
| B     | `/samples` + `/dashboard` mobile | Descartada — 5.17 decidiu que dashboard nao tem ponto de entrada.                        |
| C     | So `/dashboard` mobile           | Descartada por mesmo motivo.                                                             |

#### Decidido

- **Escolha:** A
- **Justificativa:** Consequencia direta de 5.17=b (dashboard sem ponto de entrada). Espelha 1:1 o FAB de Clientes (`.cv2-fab` em `app/globals.css:5788-5818`). Mesmo paradigma "registro mora onde a entidade mora" que 5.15 (desktop usa botao na lista de Amostras).
- **Gargalos aceitos:** Usuario no dashboard precisa ir pra `/samples` primeiro (2 cliques pra registrar) — ja aceito em 5.17. Sem ponto de entrada nas outras paginas (clients, camera, perfil) — intencional.
- **Perguntas novas:** posicionamento exato (provavelmente identico ao de Clientes: `bottom: calc(env(safe-area-inset-bottom) + 4.6rem)`, `right: clamp(14px, 4vw, 20px)`); comportamento ao scrollar (esconder ou nao); animacao de entrada — todos registrados como itens da Fase 3.
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 3 implementa `<SampleQuickCreateFab />` reusavel em `/samples` mobile.

---

### 5.4 Formato do modal de Nova Amostra `[DECIDIDO]`

Form tem ~7 campos, sticky footer, abre modal aninhado (cliente quick-create) e modal pos-criacao (label).

| Opcao | Mobile                                         | Desktop                                     | Tradeoff                                                         |
| ----- | ---------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| **A** | Bottom sheet full-height (98dvh, slide-up)     | `.app-modal.is-themed` (650px centralizado) | Padrao mobile moderno. Mais espaco. Melhor com teclado virtual.  |
| B     | `.app-modal.is-themed` (650px, scroll interno) | Idem                                        | Reusa CSS existente. Form pode ficar apertado em mobile pequeno. |
| C     | Full-screen modal page-like (100vh)            | `.app-modal.is-themed`                      | Sensacao de pagina.                                              |

#### Decidido

- **Escolha:** A
- **Justificativa:** Padrao mobile moderno (iOS/Android nativo) — usuarios reconhecem o gesto de slide-up e drag-to-dismiss. Mais espaco util (98dvh vs 84dvh do modal padrao). Lida melhor com teclado virtual — sheet se ajusta ao espaco disponivel sem competir. Drag-handle no topo comunica visualmente que e dismissable. Em desktop, `.app-modal.is-themed` reusa CSS ja consagrado (`ClientQuickCreateModal` usa esse padrao — coerencia visual com o resto do app).
- **Gargalos aceitos:** Bottom sheet precisa ser implementado do zero — `ProfileBottomSheet` (unico bottom sheet hoje) sera deletado na Fase 1, entao a Fase 2 cria um componente `<BottomSheet />` reusavel (Nota 6.5). Compatibilidade com PWA standalone iOS Safari exige replicar fixes ja documentados no `AppShell` sobre `'is-keyboard-open'` (visualViewport, scroll reset 300ms). z-index entre tabbar (`--z-fixed: 300`), backdrop (`--z-modal-backdrop: 400`), modal aninhado (se 5.6=A) e sheet precisa de orquestracao explicita.
- **Perguntas novas:**
  - Drag-to-dismiss: sempre habilitado, so quando form vazio, ou nunca? — depende de 5.5 (auto-save + confirmacao)
  - Backdrop tap fecha: sim, mas com confirmacao se isDirty (depende de 5.5)
  - Header do sheet: tem botao X tambem ou so drag handle? (registrado na Nota 6.5 — ambos)
  - Stack de modais (cliente quick-create sobre nova amostra, se 5.6=A): z-index dinamico (registrado pra Fase 4)
  - Botao voltar Android: intercepta pra fechar o sheet em vez de navegar (registrado pra Fase 2)
  - 98dvh deixa 2dvh de backdrop visivel pra indicar que e dismissable — aceitavel
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 2 inclui criacao do componente `<BottomSheet />` reusavel (Nota 6.5) + componente `<NewSampleModal />` que escolhe renderizacao por breakpoint (mobile = bottom sheet, desktop = `.app-modal.is-themed`).

---

### 5.5 Persistencia do draft e fechamento do modal `[DECIDIDO]`

| Opcao | Comportamento                        | Tradeoff                            |
| ----- | ------------------------------------ | ----------------------------------- |
| A     | Confirmar antes de fechar se isDirty | Simples, sem auto-save.             |
| B     | Auto-save silencioso + retomar       | Robusto, mas usuario pode esquecer. |
| **C** | Auto-save + confirmacao              | Cobre todos os casos.               |
| D     | Fechar sem confirmacao               | Frustra usuario.                    |

#### Decidido

- **Escolha:** C (auto-save silencioso em sessionStorage + confirmacao ao fechar se isDirty)
- **Justificativa:** Padrao de apps maduros (Gmail, Notion). Cobre todos os casos de falha: (1) crash/reload do browser — restaurado do storage; (2) fechamento acidental (tap backdrop/swipe/X/ESC/back) — bloqueado por confirmacao; (3) fechamento deliberado — usuario confirma e descarta. Combina perfeitamente com 5.7=A (wizard 3 steps): ao "Editar" no step `review`, volta pro form com state intacto sem precisar de logica adicional.
- **Gargalos aceitos:** Codigo de auto-save adiciona complexidade (debounce, hidratacao, serializacao de objetos como ClientSummary). Em PWA standalone, sessionStorage pode comportar-se de modo levemente diferente entre tabs — aceitavel pois fluxo de PWA tipicamente e single-tab.
- **Perguntas novas:**
  - Storage scope: sessionStorage (limpa ao fechar app/aba) ou localStorage (persiste entre sessoes)? — sessionStorage (registrado na Nota 6.7)
  - Multiplos drafts simultaneos? — nao, apenas 1 por sessao (clientDraftId ja garante)
  - Auto-save em onChange ou onBlur? — onChange com debounce 500ms (Nota 6.7)
  - Restaurar referencias a entidades (ClientSummary, OwnerUnit) — apenas IDs e dados serializaveis; refazer lookup ao restaurar se necessario (Nota 6.7)
  - Comportamento ao reabrir o FAB com draft pendente — prompt "Retomar amostra pendente?" com [Descartar] [Retomar] (Nota 6.7)
- **Decisoes anteriores revisitadas:** nenhuma. Reforca a viabilidade de 5.7=A (wizard preserva state).
- **Impacto na ordem de execucao:** Fase 4 implementa auto-save + confirmacao. Pode aproveitar pra criar um hook `useDraft<T>(key, initialState)` reusavel (Nota 6.7).

---

### 5.6 Quick-create de cliente dentro do modal de amostra `[DECIDIDO]`

| Opcao            | Comportamento                                                 | Tradeoff                                   |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------ |
| A                | Modal aninhado definitivo                                     | Funciona, mas pesado visualmente.          |
| B (alvo final)   | Inline expansivel                                             | Sem stacking, mais limpo.                  |
| **B-pragmatica** | Comecar com modal aninhado (A), migrar para inline (B) depois | Mais rapido agora, refator depois.         |
| C                | Wizard step (substitui conteudo)                              | Adiciona complexidade ao wizard principal. |

#### Decidido

- **Escolha:** B-pragmatica (modal aninhado inicialmente como acao da Fase 4; migracao pra inline expansivel como debito tecnico documentado)
- **Justificativa:** Reusa o `ClientQuickCreateModal` ja existente sem refatoracao. Acelera entrega da refatoracao principal (Fases 1-3 + 4 com cliente aninhado). Refator pra inline pode ser feito depois sem bloqueio. Mantem porta aberta pro alvo final (inline) sem comprometer o cronograma agora.
- **Gargalos aceitos:** 3 camadas visuais (backdrop sheet + sheet de amostra + backdrop modal cliente + modal cliente) — pesado em mobile, especialmente em devices low-end. Aceitavel temporariamente. Backdrop blur duplo pode degradar performance em devices antigos.
- **Perguntas novas:**
  - z-index orchestration: sheet usa `--z-modal`; modal aninhado precisa de tier acima (registrado pra Fase 2/4)
  - Focus trap precisa ser "handed-over" do sheet pro modal aninhado e voltar (Nota 6.8)
  - Animacao do modal aninhado: scale-in (`.app-modal` padrao) sobre o sheet — OK
  - Backdrop tap do modal aninhado fecha so o modal (nao o sheet) — comportamento natural
  - Tap no drag-handle do sheet enquanto modal aninhado aberto: ignorar drag (modal bloqueia interacao com sheet abaixo)
  - **Quando migrar pra inline (alvo B)?** Debito tecnico registrado — fica como item futuro, sem prazo bloqueante
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 4 implementa cliente quick-create como modal aninhado. Adicionada nova entrada em "Perguntas em aberto" (secao 10) sobre o prazo da migracao pra inline.

---

### 5.7 Integracao do fluxo review + created com o modal/sheet de Nova Amostra `[PENDENTE]`

> Reformulada (v1.7): a decisao original falava de "label/print modal" mas o fluxo de criacao **nao tem mais QR/print** desde a Fase P3. A decisao real e como acomodar os 2 steps existentes (`review` + `created`) dentro do novo modal/sheet do form (5.4=A).

**Fluxo atual** (no codigo, `app/samples/new/page.tsx:807-934`):

- `review`: card nao-editavel com dados + [Editar] + [Confirmar]
- `created`: painel grande com numero do lote em destaque + "Anote este numero na saca antes de seguir." + [Ir para amostra]
- Sem QR, sem print — print de etiqueta e acao manual separada nos detalhes (ver 2.4b)

Hoje sao 2 superficies (form e pagina + modal de review/created). Com 5.4=A o form tambem vira sheet/modal, entao precisamos decidir:

| Opcao               | Comportamento                                                                                                                                                                               | Tradeoff                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **A (recomendada)** | **Wizard de 3 steps na mesma superficie** (bottom sheet mobile ou `.app-modal.is-themed` desktop): `form` -> `review` -> `created`. Cada transicao troca apenas o conteudo (com animacao).  | Sem stacking. 1 superficie visual unica. Coerente com 5.4=A. Padrao mobile wizard (Stripe Checkout, Apple Pay sheets).                 |
| B                   | Sheet/modal do form fecha apos tap "Criar amostra"; **modal/sheet separado** abre com review+created por cima da lista.                                                                     | Mantem o `NewSampleLabelModal` atual sem fundir com o sheet. Flash visual entre form -> review. Duas superficies pro usuario entender. |
| C                   | Sheet do form continua aberto; modal de review/created abre **por cima** (stack: backdrop + sheet form + backdrop + modal review).                                                          | Pesado: 2 backdrops, 2 modais empilhados.                                                                                              |
| D                   | Sem step `review` separado — apos tap "Criar amostra", submete direto e vai pro step `created`. A revisao acontece visualmente no proprio form preenchido (campos com valores ja visiveis). | Elimina 1 step (mais rapido). Risco: usuario envia sem conferir. Hoje o `review` serve como "checkout final" intencional.              |

Recomendacao: A. Coerencia total com 5.4=A (1 superficie). Wizard em bottom sheet e convencional. Mantem o `review` como protecao contra envio acidental. O `created` continua focado no lote pra anotar na saca.

#### Decidido

- **Escolha:** A (wizard de 3 steps na mesma superficie: form -> review -> created)
- **Justificativa:** Coerencia total com 5.4=A (1 superficie visual unica). Mantem os 2 steps existentes (`review` e `created`) que ja foram pensados na Fase P3 — preserva a UX de "checkout final" antes de submeter e a anotacao do lote apos criar. Sem stacking de modais. Combina perfeitamente com 5.5=C (auto-save preserva state ao navegar entre steps) e 5.6=B-pragmatica (cliente quick-create abre como modal aninhado quando step="form", nao interfere com o wizard).
- **Gargalos aceitos:** Implementacao de state machine para gerenciar transicoes (`'form' | 'review' | 'created'`) — mais complexo que LabelModal atual mas mais coerente arquiteturalmente. Header e footer dinamicos por step. Comportamento do backdrop tap, drag-to-dismiss e back Android precisa ser diferente por step (Nota 6.6).
- **Perguntas novas:**
  - Animacao de transicao entre steps: fade simples 200ms ease-out (decidido em 5.22; revisado de slide horizontal para fade durante o detalhamento da Fase 2 — slide fica como evolucao futura)
  - Header dinamico: titulo muda por step ("Nova amostra" -> "Confirme os dados" -> "Amostra criada") — Nota 6.6
  - Footer dinamico: [Criar amostra] -> [Editar | Confirmar] -> [Ir para amostra] — Nota 6.6
  - Backdrop tap por step: form (descartar com confirmacao via 5.5) / review (volta pro form sem perder dados) / created (fecha e vai pra amostra) — Nota 6.6
  - Drag-to-dismiss por step: form (com confirmacao 5.5) / review (volta pro form) / created (desabilitado ou fecha pra amostra) — Nota 6.6
  - Back Android por step: identico ao backdrop tap — Nota 6.6
  - Botao [Editar] do step review: volta pro form preservando state (5.5=C garante)
- **Decisoes anteriores revisitadas:** 5.4=A confirmada — wizard cabe perfeitamente no bottom sheet 98dvh / `.app-modal.is-themed`. 5.5=C confirmada — auto-save habilita "Editar" preservando dados.
- **Impacto na ordem de execucao:** Fase 2 cria o `<NewSampleModal />` ja com state machine de 3 steps (form/review/created). Fase 4 refina animacoes e comportamentos por step (Nota 6.6).

---

### 5.8 O que fazer com `/settings` existente? `[DECIDIDO]`

`/settings` ja existe (`app/settings/page.tsx`, 639 linhas) com perfil, email, senha, logout.

| Opcao | Comportamento                                              | Tradeoff                                     |
| ----- | ---------------------------------------------------------- | -------------------------------------------- |
| **a** | `/profile` absorve `/settings` (uma rota so)               | Mais limpo, sem duplicidade.                 |
| b     | `/profile` substitui `/settings` (rename + atualiza links) | Similar, mas o destino conceitual e o mesmo. |
| c     | Mantem ambos separados                                     | Confuso (perfil vs settings se sobrepoem).   |
| d     | So renomeia label "Meu perfil", mantem rota `/settings`    | Inconsistente com nomenclatura.              |

#### Decidido

- **Escolha:** a
- **Justificativa:** Conteudo de `/settings` (perfil, email, senha, logout) e essencialmente "Conta do usuario" — natural viver em `/profile`. Uma rota so reduz superficie de manutencao e elimina ambiguidade pra usuarios.
- **Gargalos aceitos:** Bookmarks/links externos pra `/settings` quebrariam (resolvido pela 5.13 — redirect 302). Conteudo precisa ser reorganizado em uma estrutura coerente (resolvido pela 5.12 — secoes stackadas).
- **Perguntas novas:** layout interno da pagina (5.12). Destino tecnico de `/settings` (5.13).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 absorve conteudo de `/settings` em `/profile`. Fase 5 (Limpeza) garante redirect ativo e remove arquivo antigo se aplicavel.

---

### 5.9 Avatar do header apos perfil virar item da tabbar `[DECIDIDO]`

| Opcao | Comportamento                                                  | Tradeoff                                                |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------- |
| **a** | Some em mobile (sem redundancia com tabbar); mantem em desktop | Mobile limpo; desktop tem ponto de entrada alternativo. |
| b     | Atalho pra `/profile` em ambos                                 | Redundancia em mobile.                                  |
| c     | Continua com Sair + atalhos                                    | Complicado.                                             |
| d     | Some totalmente                                                | Desktop perde ponto de entrada.                         |

#### Decidido

- **Escolha:** a
- **Justificativa:** Em mobile, Perfil ja esta na tabbar — duplicar no header e redundante. Em desktop, nao ha tabbar, entao o avatar dropdown continua sendo a forma de chegar em `/profile` e em "Sair". 8 dispatches do evento custom em mobile somem naturalmente.
- **Gargalos aceitos:** Em desktop, dropdown ainda mostra "Meu perfil" e "Sair" (precisa atualizar destino do link de `/settings` pra `/profile`). 8 botoes/handlers do header mobile em diversas paginas precisam ser limpos.
- **Perguntas novas:** o que vai ocupar o espaco vago do header mobile? (resolvido em 5.16 — sino de notificacoes).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 inclui remover avatar trigger do header mobile + listener `'open-profile-sheet'` no AppShell + 8 dispatches espalhados.

---

### 5.10 Icone do item "Perfil" na tabbar `[DECIDIDO]`

| Opcao | Comportamento                          | Tradeoff                                      |
| ----- | -------------------------------------- | --------------------------------------------- |
| a     | SVG generico (silhueta)                | Simples, sem personalizacao.                  |
| **b** | Avatar do usuario (foto/iniciais)      | Convencao mobile (Instagram, X). Personaliza. |
| c     | Misto (foto se tem, fallback silhueta) | Adapta.                                       |

#### Decidido

- **Escolha:** b
- **Justificativa:** Coerente com convencao mobile (apps tipo Instagram, X colocam foto do usuario no item de perfil da tabbar). Personalizacao visual reforca propriedade. Combina com 5.1=A (item na extrema direita — onde o avatar normalmente vive).
- **Gargalos aceitos:** Visual da tabbar menos uniforme (4 SVGs + 1 avatar circle). Sem foto cadastrada hoje, vai precisar usar iniciais (resolvido em 5.14).
- **Perguntas novas:** tipo de avatar (5.14). Estado ativo visual (Nota 6.2).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 cria componente `<UserAvatar />` reusavel e ja usa na tabbar.

---

### 5.11 Desktop nav tambem perde `/samples/new`? `[DECIDIDO]`

| Opcao | Comportamento                                  | Tradeoff                   |
| ----- | ---------------------------------------------- | -------------------------- |
| **a** | Sincroniza agora — remove de DESKTOP_NAV_ITEMS | Mobile/desktop convergem.  |
| b     | Posterga                                       | Inconsistencia temporaria. |
| c     | Desktop nunca perde                            | Inconsistencia permanente. |

#### Decidido

- **Escolha:** a
- **Justificativa:** Decisao 5.4 (recomendacao A) faz o registro virar modal em mobile E desktop. Manter `/samples/new` no nav desktop seria inconsistente com a refatoracao. Convergir mental model entre mobile e desktop reduz custo de ensino.
- **Gargalos aceitos:** Desktop perde botao facil no nav superior (compensado por 5.15 — botao no topo da lista).
- **Perguntas novas:** ponto de entrada do registro em desktop (5.15). Dashboard desktop tem ponto de entrada? (5.17).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 remove de `DESKTOP_NAV_ITEMS` e da regra `/samples/new` em `isMainNavItemActive`.

---

### 5.12 Layout interno da pagina `/profile` `[DECIDIDO]`

Como organizar conteudo de `/settings` (perfil, email, senha) + bloco do antigo sheet (avatar, nome, role, logout) numa pagina so?

| Opcao | Comportamento                                             | Tradeoff                      |
| ----- | --------------------------------------------------------- | ----------------------------- |
| **a** | Secoes stackadas (Identidade -> Email -> Senha -> Logout) | Mobile-first, scroll natural. |
| b     | Tabs (Perfil \| Seguranca \| Conta)                       | Mais denso, exige UI extra.   |
| c     | Acordeao                                                  | Esconde conteudo.             |
| d     | Sub-rotas (`/profile/email`, etc.)                        | Mais cliques.                 |

#### Decidido

- **Escolha:** a
- **Justificativa:** Mobile-first; scroll vertical e natural; nao exige decisao extra de UI; conteudo de `/settings` ja pode ser reorganizado em stack sem retrabalho conceitual. Em desktop, stack ainda funciona (pode ganhar layout de 2 colunas no futuro se necessario, sem mudar decisao).
- **Gargalos aceitos:** Pagina fica longa em mobile — mitigado por header com avatar+nome no topo (visual de identidade) e logout claramente posicionado.
- **Perguntas novas:** ordem das secoes e localizacao do logout (registrado pra implementacao na Fase 1 — proposta inicial: Identidade -> Email -> Senha -> [botao Sair fixo no fim]).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 reorganiza conteudo de `/settings` no novo layout de `/profile`.

---

### 5.13 Destino de `/settings` apos a fusao `[DECIDIDO]`

| Opcao | Comportamento                                                    | Tradeoff                     |
| ----- | ---------------------------------------------------------------- | ---------------------------- |
| **a** | Redirect 302 `/settings` -> `/profile` + atualiza links internos | Compat com bookmarks; clean. |
| b     | Deleta rota sem redirect                                         | Quebra bookmarks.            |
| c     | Redirect permanente forever                                      | Cache eterno do browser/CDN. |

#### Decidido

- **Escolha:** a
- **Justificativa:** Redirect 302 (temporario) mantem compat com bookmarks/links externos sem cachear permanentemente (caso decidamos reverter no futuro). Atualizar todos os links internos pra apontarem direto pra `/profile` garante que navegacao normal nao toca o redirect.
- **Gargalos aceitos:** Configuracao adicional em `next.config.js` (ou route handler). Listar todos os usos internos de `/settings` e refatorar.
- **Perguntas novas:** nenhuma.
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 implementa redirect + atualiza referencias (`AppShell.tsx:556` dropdown desktop; `isMainNavItemActive`; quaisquer outras).

---

### 5.14 Tipo de avatar do usuario `[DECIDIDO]`

Como nao ha campo de foto no schema do `SessionUser`:

| Opcao | Comportamento                                       | Tradeoff                                                |
| ----- | --------------------------------------------------- | ------------------------------------------------------- |
| **a** | Iniciais coloridas em circle (hash deterministico)  | Simples, client-side, sem mudar schema.                 |
| b     | Silhueta SVG em circle                              | Sem personalizacao.                                     |
| c     | Iniciais + permitir upload de foto                  | Escopo grande (schema, endpoint, storage, magic bytes). |
| d     | Iniciais hoje, preparar campo `avatarUrl` no schema | Mistura escopo.                                         |

#### Decidido

- **Escolha:** a
- **Justificativa:** Sem campo de foto hoje, iniciais permitem personalizacao visual sem mudar backend. Implementacao 100% client-side. Hash deterministico garante que cada usuario tem cor consistente (sempre a mesma). Escopo de upload de foto fica explicitamente fora desta refatoracao.
- **Gargalos aceitos:** Sem foto real (visual menos "humano"). Quem quiser upload no futuro vai precisar de migracao + endpoint + storage.
- **Perguntas novas:** algoritmo de hash, paleta de cores, numero de letras das iniciais — todos resolvidos na Nota 6.1.
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 cria componente `<UserAvatar />` (Nota 6.1).

---

### 5.15 Ponto de entrada do registro em desktop `[DECIDIDO]`

| Opcao | Comportamento                                      | Tradeoff                               |
| ----- | -------------------------------------------------- | -------------------------------------- |
| a     | FAB tambem em desktop                              | Quebra padrao desktop.                 |
| **b** | Botao "+ Nova amostra" no topo da lista `/samples` | Convencao desktop (data-table action). |
| c     | Botao no header desktop                            | Compete visualmente com nav.           |

#### Decidido

- **Escolha:** b
- **Justificativa:** Em desktop, FAB e padrao mobile-only (gera estranheza). Botao "+ Nova amostra" no topo da lista e convencao consagrada de data-table em apps web. Mobile e desktop chegam ao mesmo modal, mas com pontos de entrada apropriados ao paradigma.
- **Gargalos aceitos:** Mobile e desktop divergem visualmente nesse ponto (FAB vs botao). Aceitavel — sao paradigmas diferentes.
- **Perguntas novas:** dashboard desktop tambem tem botao? (resolvido em 5.17 — nao). Estilo do botao? (proposta: classe `.app-button-primary` existente ou similar; refinado na Fase 3).
- **Decisoes anteriores revisitadas:** 5.3 — reinterpretada como "FAB MOBILE only" (o que tornou 5.3 recomendacao automatica A, ja que 5.17 tambem decidiu que dashboard mobile nao tem FAB).
- **Impacto na ordem de execucao:** Fase 3 inclui adicionar botao no topo da `/samples` desktop, ligado ao mesmo modal da Fase 2.

---

### 5.16 Layout do header mobile apos avatar sumir `[DECIDIDO]`

Header mobile hoje tem: spacer + logo + search compact + avatar trigger. Com avatar removido (5.9=a):

| Opcao        | Comportamento                             | Tradeoff                                  |
| ------------ | ----------------------------------------- | ----------------------------------------- |
| a            | Sem nada no canto direito                 | Minimalista.                              |
| b            | Mover search pro canto direito            | Reorganiza.                               |
| **c custom** | Sino de notificacoes (placeholder visual) | Aproveita espaco; prepara feature futura. |

#### Decidido

- **Escolha:** c (custom — sino de notificacoes como placeholder)
- **Justificativa:** Aproveita espaco vago do avatar removido sem deixar o header parecendo amputado. Prepara infra visual pra feature futura de notificacoes sem precisar de redesign quando ela for implementada. Decisao explicita do usuario para essa direcao.
- **Gargalos aceitos:** Risco de UX "quebrada" se sino for clicavel e nao tiver ação — mitigado tornando o sino nao-clicavel ate haver feature real (Nota 6.3).
- **Perguntas novas:** comportamento no clique enquanto nao tem feature (Nota 6.3). Visual e posicao exata (Nota 6.4).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Fase 1 inclui componente `<NotificationBell />` placeholder no header mobile.

---

### 5.17 Dashboard tem ponto de entrada de nova amostra? `[DECIDIDO]`

| Opcao | Comportamento                                           | Tradeoff                                                   |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------- |
| a     | Sim, botao em desktop e FAB em mobile no dashboard      | Acesso em 1 clique a partir da home.                       |
| **b** | Nao, nem mobile nem desktop. So a partir de `/samples`. | 2 cliques a partir do dashboard, mas dashboard fica limpo. |
| c     | Card de atalho rapido no dashboard                      | Mais decorativo.                                           |

#### Decidido

- **Escolha:** b
- **Justificativa:** Dashboard vira hub de visao geral/consulta, nao de acao. Registro fica concentrado em `/samples`. 2 cliques a partir do dashboard (ir em "Amostras" tab/nav -> tocar FAB ou botao) e aceitavel; usuarios que registram frequentemente vao naturalmente para `/samples` como ponto de partida.
- **Gargalos aceitos:** Registro recorrente a partir do dashboard exige 2 cliques (vs 1 hoje no item "Novo" da tabbar). Trade aceito conscientemente.
- **Perguntas novas:** nenhuma.
- **Decisoes anteriores revisitadas:** 5.3 — recomendacao revisada para A (FAB so em `/samples` mobile, sem `/dashboard`).
- **Impacto na ordem de execucao:** Fase 3 — FAB so em `/samples` mobile; sem ponto de entrada em `/dashboard` (mobile e desktop).

---

### Decisoes granulares de implementacao da Fase 2

Bloco de decisoes que detalham COMO a Fase 2 sera implementada — todas tomadas durante a analise pre-implementacao (v1.11). Numeracao continua a partir de 5.18 pra manter sequencia unica.

#### 5.18 Localizacao dos arquivos `[DECIDIDO]`

- **Escolha:** flat em `components/`
- **Arquivos:** `components/BottomSheet.tsx` + `components/NewSampleModal.tsx`
- **Justificativa:** padrao atual do projeto (`UserAvatar.tsx`, `NotificationBell.tsx` tambem sao flat). Subpastas `components/samples/` existem mas hoje so abrigam codigo MUITO especifico de pagina (ex: card de venda). `<NewSampleModal />` e um componente de feature compartilhada (sera invocado pelo FAB em `/samples` mobile e pelo botao em `/samples` desktop), entao flat faz sentido.
- **Gargalos aceitos:** se `components/` crescer muito, futura reorganizacao por domain pode mover esses arquivos. Aceitavel.
- **Impacto:** Bloco 1 da Fase 2 cria os 2 arquivos em `components/`.

#### 5.19 API do `<BottomSheet />` (controlled vs uncontrolled) `[DECIDIDO]`

- **Escolha:** controlled puro com `open` + `onClose`
- **Props finais:** `{ open, onClose, onDismissAttempt?, title?, footer?, children, dragToDismiss? }` (ver Nota 6.5)
- **Justificativa:** padrao React idiomatico, declarativo, testavel. Sem imperative handle (ref.close()) — mantem fluxo unidirecional. Permite o consumidor (`<NewSampleModal />`) controlar quando mostrar a confirmacao de "Descartar?" via `onDismissAttempt` async.
- **Gargalos aceitos:** consumidor precisa manter state de `open`. Aceitavel — todos os modais do projeto seguem esse padrao.
- **Impacto:** Bloco 1 da Fase 2 cria o componente com essa API.

#### 5.20 API do `<NewSampleModal />` `[DECIDIDO]`

- **Escolha:** controlled com `{ open, onClose, onSuccessNavigate? }`
- **Justificativa:** coerente com 5.19 (mesmo padrao de controlled). `onSuccessNavigate` opcional permite o page wrapper (5.23) controlar pra onde ir apos criar — default e `router.push(\`/samples/\${sampleId}\`)`.
- **Gargalos aceitos:** dependencia de `useRequireAuth` interno (pra session) cria acoplamento com `lib/use-auth`, mas e o mesmo padrao do resto da app.
- **Impacto:** Bloco 2 da Fase 2.

#### 5.21 State machine — implementacao `[DECIDIDO]`

- **Escolha:** `useReducer` com action types tipados
- **Tipos:** `WizardState`, `WizardAction` (ver Nota 6.5/6.6 pra detalhamento de actions)
- **Justificativa:** testavel via unit (mesmo sem testes UI no projeto, o reducer pode ser testado isoladamente em principio). Transicoes validas declaradas explicitamente reduzem bugs de race condition durante async submit. Reducer + action types e padrao React idiomatico.
- **Gargalos aceitos:** mais codigo que `useState` solto, mas justifica pela complexidade da state machine (3 steps x 3 status x dirty flag).
- **Impacto:** Bloco 2 da Fase 2.

#### 5.22 Animacao entre steps `[DECIDIDO]`

- **Escolha:** fade simples 200ms ease-out na propriedade `opacity`
- **Justificativa:** menor complexidade (CSS transition pura), performance melhor em devices low-end, suficiente pra dar feedback de transicao sem distrair. Slide horizontal (alvo aspiracional) pode entrar em refinamento futuro se UX pedir.
- **Gargalos aceitos:** visual menos "wizard-y" que slide. Aceitavel pra v1 da Fase 2.
- **Impacto:** Nota 6.6 atualizada (de slide 350ms para fade 200ms).
- **Decisoes anteriores revisitadas:** Nota 6.6 — animacao revisada.

#### 5.23 Repurpose de `/samples/new` como wrapper do modal `[DECIDIDO]`

- **Escolha:** `/samples/new` vira pagina wrapper que renderiza `<NewSampleModal open={true} onClose={() => router.push('/samples')} />` dentro de `<AppShell />`
- **Justificativa:** aproveita rota existente (sera deletada na Fase 5) sem precisar de codigo de teste descartavel. Permite usuario testar o fluxo completo do modal antes do FAB existir (Fase 3). Quando fecha o modal, navega pra `/samples`.
- **Gargalos aceitos:** o conteudo antigo da pagina (form + LabelModal) sera substituido pelo wrapper minimo. Codigo antigo deletado.
- **Perguntas novas:** estrutura visual do wrapper — AppShell visivel ou apenas modal? (resolvido em 5.28, abaixo)
- **Impacto:** Bloco 3 da Fase 2 substitui conteudo de `app/samples/new/page.tsx` (de 964 linhas pra ~15 linhas).

#### 5.24 Auto-save do draft — Fase 2 ou Fase 4? `[DECIDIDO]`

- **Escolha:** auto-save fica na Fase 4 (conforme plano original); Fase 2 mantem `clientDraftId` em sessionStorage (igual hoje) mas NAO serializa form state
- **Justificativa:** separar concerns — Fase 2 foca em estrutura visual + state machine. Fase 4 adiciona auto-save + retomar prompt. Modal fechado e reaberto na Fase 2 = form reseta. Aceitavel pra MVP da fase.
- **Gargalos aceitos:** fechar/reabrir modal na Fase 2 perde state digitado. Aceitavel ate Fase 4 estar pronta.
- **Impacto:** Bloco 2 da Fase 2 NAO implementa hook `useDraft<T>` (Nota 6.7).

#### 5.25 Drag-to-dismiss — implementar na Fase 2 `[DECIDIDO]`

- **Escolha:** implementar na Fase 2 (junto com criacao do `<BottomSheet />`)
- **Justificativa:** drag e gesto central do "bottom sheet" — sem ele, o componente vira modal generico. Threshold 60px (mesmo do antigo ProfileBottomSheet). Resistencia elastica leve apos exceder. Smooth return se < threshold.
- **Gargalos aceitos:** + tempo de implementacao no Bloco 1. Compensa porque e componente reusavel.
- **Impacto:** Nota 6.5 valida; Bloco 1 da Fase 2 inclui touch handlers + state de drag.

#### 5.26 Modal de confirmacao "Descartar?" — modal aninhado `[DECIDIDO]`

- **Escolha:** modal aninhado sobre o sheet (usando `.app-modal` padrao com classe `.is-themed` se necessario)
- **Justificativa:** coerente com 5.6=B-pragmatica (cliente quick-create tambem e modal aninhado). Visual conhecido pra usuario (mesma curve de animacao). Z-index `--z-modal-stacked` (Nota 6.19).
- **Gargalos aceitos:** 2 camadas de backdrop (sheet + modal) durante a confirmacao — pesado em devices low-end. Aceitavel porque e flash rapido (1-2 segundos).
- **Impacto:** Bloco 2 cria componente inline ou reusavel (a decidir durante implementacao se aparecer 2o uso); Nota 6.23 detalha animacao reusando `.app-modal-backdrop-in` + `.app-modal-card-in`.

#### 5.27 `isDirty` detection — flag no reducer `[DECIDIDO]`

- **Escolha:** flag `dirty: boolean` no estado do reducer, set `true` no primeiro `onChange` de qualquer campo
- **Justificativa:** padrao Gmail/Notion. Simples, performatico, sem custo de comparacao a cada render. Falso positivo (usuario digita e apaga) e seguro pro lado da preservacao — pede confirmacao mesmo sem necessidade real, melhor que ignorar quando precisaria.
- **Gargalos aceitos:** modal pede "Descartar?" mesmo quando form ficou identico ao inicial (digitou + apagou). UX pequeno trade — preferimos seguro.
- **Impacto:** Bloco 2 da Fase 2.

#### 5.28 Estrutura do wrapper `/samples/new` `[DECIDIDO]`

Pergunta derivada de 5.23: como o page wrapper renderiza visualmente? O usuario ve algo "por baixo" do modal?

- **(a)** Wrapper renderiza `<AppShell>` envolvendo o `<NewSampleModal>` — usuario ve tabbar mobile / topbar global por tras do backdrop do modal.
- (b) Wrapper renderiza apenas o modal sem AppShell — fundo branco/transparente por baixo.
- (c) Wrapper redireciona server-side pra `/samples` — nao funciona na Fase 2.

#### Decidido

- **Escolha:** a
- **Justificativa:** coerente com como `/samples/new` aparece hoje (com AppShell). Backdrop do modal cobre o conteudo do shell. Usuario nao perde contexto visual durante a operacao. Quando modal fecha, navega pra `/samples` via `router.push`.
- **Gargalos aceitos:** tabbar/topbar visiveis (com blur do backdrop) atras do modal. Em mobile durante drag-to-dismiss, parte do shell sera revelada — aceitavel (e UX esperado de bottom sheet).
- **Perguntas novas:** nenhuma bloqueante. Logica de session/auth segue o padrao atual (`useRequireAuth` interno do wrapper).
- **Decisoes anteriores revisitadas:** nenhuma.
- **Impacto na ordem de execucao:** Bloco 3 da Fase 2 cria wrapper de ~15 linhas substituindo as 964 linhas atuais de `app/samples/new/page.tsx`. Estrutura final: `<AppShell><NewSampleModal open={true} onClose={() => router.push('/samples')} /></AppShell>` com `useRequireAuth` pra session/loading.

---

### Decisoes granulares de implementacao da Fase 3

Bloco de decisoes de detalhe pra implementacao da Fase 3 (FAB mobile + botao desktop em `/samples`). Continuacao da numeracao 5.X.

#### 5.29 Comportamento apos criar amostra via FAB/botao em `/samples` `[DECIDIDO]`

- (a) Mantem default do NewSampleModal: navega pra `/samples/[id]`
- **(b)** Customiza: fica em `/samples` com lista atualizada (refetch)
- (c) Dois botoes no step `created`: [Ver amostra] + [Concluir]

##### Decidido

- **Escolha:** b
- **Justificativa:** A pagina `/samples` e o entrypoint pra registro recorrente. Apos criar uma amostra, e provavel o usuario querer registrar outra (lote de amostras) ou ver a nova na lista sem precisar voltar. O step `created` ja mostra o lote em destaque dentro do modal — usuario pega a info do lote ali mesmo. Tap "Ir para amostra" agora fecha modal e fica em `/samples` com lista atualizada.
- **Gargalos aceitos:** Discrepancia com o wrapper `/samples/new`: la o default (navega) e mantido (porque o wrapper nao tem contexto pra refetch — ele desmonta com a navegacao). Em `/samples`, o `onSuccessNavigate` e customizado pelo consumidor (a page). Tradeoff aceitavel pois `/samples/new` sera deletado na Fase 5.
- **Impacto:** Bloco 2 da Fase 3 — `/samples` passa `onSuccessNavigate` custom ao NewSampleModal que fecha modal + dispara refetch (5.31).

#### 5.30 Localizacao do botao "+ Nova amostra" em desktop `[DECIDIDO]`

- **(a)** Ao lado da searchbar, canto direito do bloco
- (b) Acima da searchbar, alinhado a direita do titulo
- (c) Substitui o avatar do canto direito do header

##### Decidido

- **Escolha:** a
- **Justificativa:** Espelha o padrao ja usado em `/clients` (FAB inline no `.hero-search-wrap` em desktop via CSS responsivo). Mantem densidade visual, acoes relacionadas agrupadas (busca + criar) e reusa CSS existente (`.cv2-fab` ja tem variante desktop em `globals.css:20947-20957`).
- **Gargalos aceitos:** Botao visualmente identico ao FAB de Clientes (mesmo gradiente, mesmo icone +). No contexto da pagina `/samples` o usuario entende que e "+ Nova amostra" pelo titulo da pagina e tooltip/aria-label. Aceitavel.
- **Impacto:** Bloco 2 da Fase 3 — adicionar JSX do FAB em `.hero-search-wrap` apos `.hero-search-filter-btn` em `app/samples/page.tsx`. CSS responsivo do `.cv2-fab` cuida de mobile (fixed bottom-right) vs desktop (inline 64x64).

#### 5.31 Atualizacao da lista apos criar amostra `[DECIDIDO]`

- **(a)** Refetch automatico ao fechar o modal com sucesso
- (b) Optimistic update (adiciona local sem refetch)
- (c) Nao refazer

##### Decidido

- **Escolha:** a
- **Justificativa:** Garante dados frescos (refletindo eventuais mudancas concorrentes do backend) sem complexidade de optimistic update + sync de shape. Pode mostrar loading sutil durante refetch (ja existe padrao em `runLoadMore` em `app/samples/page.tsx:616-662`).
- **Gargalos aceitos:** Custo de 1 round-trip extra. Aceitavel — `listSamples` e leve e o usuario espera ver a amostra criada na lista.
- **Impacto:** Bloco 2 da Fase 3 — `onSuccessNavigate` custom dispara `dispatchSamples({ type: 'fetch-initial' })` ou equivalente.

#### 5.32 Hide-on-scroll do FAB mobile `[DECIDIDO]`

- **(a)** Sempre visivel (MVP)
- (b) Esconder ao scrollar pra baixo, mostrar ao scrollar pra cima
- (c) Esconder ao chegar no fim da lista

##### Decidido

- **Escolha:** a
- **Justificativa:** Mesmo comportamento do FAB de Clientes (sempre visivel). Sem scroll listener adicional, sem logica de direcao. Pode evoluir pra (b) em fase futura se UX feedback pedir.
- **Gargalos aceitos:** FAB ocupa espaco visual permanente no canto inferior direito; pode cobrir ultimo item da lista. Mitigacao: padding bottom no container da lista respeitando `env(safe-area-inset-bottom) + altura do FAB`. Provavelmente ja existe (FAB de Clientes ja funciona assim).
- **Impacto:** Bloco 1 da Fase 3 — componente FAB sem listener de scroll.

---

## 6. Notas tecnicas (detalhes de implementacao registrados)

Detalhes que sao implementacao (nao decisao formal) mas precisam ficar registrados pra nao se perderem.

### 6.1 Componente `<UserAvatar size="sm|md|lg" />`

- **Iniciais:** primeira letra do primeiro nome + primeira letra do ultimo nome do `fullName` (ex: "Flavio Henrique Oliveira" -> "FO"). Fallback pra `username` se `fullName` vazio.
- **Cor de fundo:** hash deterministico — soma dos char codes do `fullName` (ou `username`) mod paleta de 6 cores neutras (tons sobrios, sem competir com o verde da marca).
- **Texto:** branco ou cor escura conforme contraste da cor de fundo.
- **Tamanhos:** sm (~28px para tabbar), md (~40px), lg (~64-96px para pagina de perfil).
- **Reusavel:** tabbar, pagina `/profile`, qualquer lugar futuro.

### 6.2 Estado ativo da tabbar com avatar

- Ring/border verde de ~2px ao redor do avatar quando `/profile` esta ativo.
- Mantem distincao visual sem brigar com o conteudo do avatar (iniciais/cor).
- Outros itens da tabbar usam o estilo atual (cor verde no SVG).

### 6.3 Sino de notificacoes placeholder

- Componente `<NotificationBell />` sem feature funcional ate haver backend de notificacoes.
- **Nao clicavel** (`cursor: default`, sem `onClick`) — evita UX quebrada do tipo "clico e nada acontece".
- Sem badge contador (sem `unreadCount` propriedade) por enquanto.
- Quando feature for implementada, adicionar `onClick` + badge + drawer/modal de notificacoes.

### 6.4 Layout do header mobile pos-mudancas

- Logo a esquerda (como hoje), search compacta no centro/direita, sino na extrema direita.
- Refinamento de spacing/proporcoes durante a Fase 1 (implementacao).
- Em desktop, header continua como hoje (avatar dropdown direita, search, nav).

### 6.5 Componente `<BottomSheet />` reusavel (Fase 2)

Substitui o padrao do `ProfileBottomSheet` (que sera deletado na Fase 1) com uma versao generica reusavel.

- **API proposta:** `{ open, onClose, children, dragToDismiss?: boolean, onDismissAttempt?: () => boolean, title?: ReactNode, footer?: ReactNode }`
- **Estrutura:**
  - Backdrop: reusa CSS `.app-modal-backdrop` (consistencia visual com modais)
  - Sheet: slide-up de 100% pra ~98dvh
  - Drag-handle: visivel no topo, gesture pra dismissar quando `dragToDismiss=true`
  - Header sticky com titulo + botao X (alem do drag-handle, dois caminhos pra fechar)
  - Body scrollable (overflow-y: auto)
  - Footer sticky (sticky bottom, sempre visivel)
- **Animacao:** 350ms cubic-bezier (mesma curve da `.app-modal` pra coerencia)
- **z-index:** usa `--z-modal` quando aberto; `--z-modal-backdrop` no overlay
- **Fixes herdados:** replicar tratamento de `is-keyboard-open` do `AppShell` (visualViewport, scroll reset 300ms pos focusout) pra evitar tabbar deslocada apos keyboard close em PWA standalone iOS
- **Acessibilidade:** `role="dialog"`, `aria-modal="true"`, focus trap, ESC fecha (se `dragToDismiss=true` ou `onDismissAttempt` permitir)
- **Interceptacao de back Android:** intercepta `popstate`/`history.back` pra fechar o sheet em vez de navegar (registrar history state ao abrir)

### 6.6 Comportamento do wizard de Nova Amostra por step (Fase 2/4)

State machine: `'form' | 'review' | 'created'`.

**Principio:** gestos universais (drag/backdrop/back) sempre **fecham**; navegacao entre steps e exclusiva de botoes explicitos.

| Aspecto                  | Step `form`                                | Step `review`                                                                                             | Step `created`                                                                                                                    |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Titulo do header         | "Nova amostra"                             | "Confirme os dados"                                                                                       | "Amostra criada"                                                                                                                  |
| Conteudo do body         | Form completo (7 campos)                   | Card nao-editavel com dados preenchidos                                                                   | Painel "Lote XXXX" em destaque + texto pra anotar na saca                                                                         |
| Footer (acoes)           | [Criar amostra] (sticky)                   | [Editar (circular sec)] [Confirmar (circular primary)]                                                    | [Ir para amostra]                                                                                                                 |
| Backdrop tap             | Fecha (com confirmacao se isDirty — 5.5=C) | **Fecha** (com confirmacao 5.5=C). **NAO volta pro form** — gesto universal de fechar deve sempre fechar. | **Fecha sheet, permanece na rota atual**. **NAO navega pra /samples/[id]** — gesto universal de fechar nao deve forcar navegacao. |
| Drag-to-dismiss (mobile) | Fecha (com confirmacao se isDirty — 5.5=C) | **Fecha** (com confirmacao 5.5=C). NAO volta pro form.                                                    | **Fecha sheet, permanece na rota atual**. NAO navega.                                                                             |
| Back Android (mobile)    | Identico ao backdrop tap                   | Identico ao backdrop tap                                                                                  | Identico ao backdrop tap                                                                                                          |
| Botao X do header        | Fecha (com confirmacao 5.5=C)              | Fecha (com confirmacao 5.5=C)                                                                             | Fecha, permanece na rota atual                                                                                                    |

**Voltar pro `form` a partir do `review`:** EXCLUSIVAMENTE pelo botao [Editar]. Auto-save (5.5=C) garante que o state do form e preservado integralmente — usuario volta com TODOS os dados como deixou (decisao explicita do usuario v1.9: "ao editar deve voltar para o modal de preenchimento com as informacoes ja preenchidas salvas").

**Navegar pra `/samples/[id]` a partir do `created`:** EXCLUSIVAMENTE pelo botao [Ir para amostra]. Lista de amostras ja foi atualizada pelo refresh apos criacao.

**Animacao entre steps:** fade simples 200ms ease-out na propriedade `opacity` (decisao 5.22). Sem slide horizontal — implementacao mais simples e performance melhor em devices low-end. Slide pode entrar como evolucao futura se UX pedir.

### 6.7 Auto-save do draft de Nova Amostra (Fase 4)

- **Storage:** `sessionStorage` (limpa ao fechar app/aba — apropriado pra "rascunho em andamento" e nao "rascunho persistente")
- **Key:** estende `'new-sample-draft-id'` ja existente; adiciona key paralela `'new-sample-draft-state'` com form state serializado
- **Trigger:** onChange dos inputs com debounce 500ms
- **Serializacao:** apenas valores primitivos + IDs (`ownerClientId`, `ownerUnitId`, etc.). Ao restaurar, refaz lookup se necessario pra reidratar `ClientSummary` / `OwnerUnit` (pode falhar se entidade foi inativada — tratar com fallback).
- **Multiplos drafts:** nao — apenas 1 por sessao
- **Limpar:** apos sucesso (igual hoje), ao usuario confirmar "Descartar" no prompt
- **Retomar:** ao abrir o FAB, se ha draft em storage, abre o modal/sheet com modal de confirmacao por cima — "Retomar amostra pendente?" [Descartar] [Retomar]. [Retomar] hidrata o state, [Descartar] limpa o storage e abre form vazio.
- **Hook reusavel:** considerar `useDraft<T>(key, initialState, options?)` pra padronizar (futuro — pode ser usado no quick-create de cliente tambem)

### 6.8 Modal aninhado de cliente sobre bottom sheet (Fase 4)

- z-index: sheet usa `--z-modal` (~500); modal aninhado precisa de tier acima — propor `--z-modal-stacked` (~600) ou usar inline style com `z-index: 600`
- Backdrop blur duplo: aceitavel mas pesado em devices low-end; observar performance durante testes
- Focus trap: ao abrir o modal aninhado, transfere focus pra ele. Ao fechar, devolve pro sheet original (mantem ref do elemento que disparou).
- Backdrop tap do modal aninhado: fecha apenas o modal aninhado (sheet abaixo permanece). Backdrop tap do sheet abaixo: nao disparavel (modal aninhado bloqueia).
- Drag-to-dismiss do sheet quando modal aninhado aberto: ignorado (modal aninhado tem focus)
- Animacao do modal aninhado: scale-in 350ms (igual `.app-modal` padrao)
- **Debito tecnico:** migrar pra inline expansivel (5.6 alvo B) sem prazo bloqueante — registrar como issue futura

### 6.9 Validacao client-side antes da transicao form -> review (Fase 2)

- Ao tap "Criar amostra" no step `form`, rodar validacao client-side dos campos obrigatorios (cliente, owner units PF, sacas, safra) ANTES de transicionar de step.
- Se invalido: **fica no step `form`** com mensagens de erro inline (igual hoje em `getMissingRequiredFieldErrors` em `app/samples/new/page.tsx:102-111` + `EMPTY_REQUIRED_FIELD_ERRORS`).
- Se valido: transiciona pro step `review`.
- Backend valida tambem (`createSampleDraftSchema`) — erro de backend e tratado separadamente (ver Nota 6.10).

### 6.10 Erro de submit (review -> created falhou) (Fase 2/4)

- No step `review`, tap [Confirmar] dispara `createSample`. Se backend rejeita (ex: cliente inativado entre auto-save e submit, conflito, validacao server-side):
  - Erro aparece **inline no step `review`** (NAO volta pro form automaticamente). Estilo: `<p className="error new-sample-label-modal-feedback">` (ja existe em `app/samples/new/page.tsx:885`).
  - Usuario pode tap [Editar] pra voltar pro form e corrigir (auto-save preserva os dados; pode editar e tentar de novo).
  - Spinner no botao [Confirmar] durante o submit (igual hoje, `new-sample-modal-circle-spinner`).
- Erro de rede (offline/timeout): mesmo padrao + sugerir "Verifique sua conexao".

### 6.11 Acessibilidade do bottom sheet / wizard (Fase 2)

- **Foco inicial ao abrir o sheet:** primeiro input editavel (campo Cliente, primeiro do form). NAO foco no drag-handle ou X.
- **ARIA:**
  - `role="dialog"`, `aria-modal="true"` na superficie do sheet
  - `aria-labelledby` apontando pro titulo do step atual
  - `aria-live="polite"` no titulo do step pra screen reader anunciar mudancas
  - Botoes circulares com `aria-label` descritivo ("Editar dados da amostra", "Confirmar e criar amostra")
- **Focus trap:** tab nao escapa do sheet (ja temos `useFocusTrap` em `lib/use-focus-trap.ts` — reusar).
- **ESC fecha:** com confirmacao se isDirty (5.5=C). Identico ao backdrop tap.
- **Transicoes entre steps:** anuncio via `aria-live`. Foco ajusta pro botao primario do novo step (ex: ao chegar em `review`, foco em [Confirmar]).

### 6.12 Bottom sheet + teclado virtual mobile (Fase 2)

- O sheet ocupa 98dvh; com teclado aberto, espaco util cai pra ~50dvh em devices comuns.
- **Herdar fixes do AppShell:** o handling de `'is-keyboard-open'` em `components/AppShell.tsx:297-395` (visualViewport + scroll reset 300ms) deve afetar o sheet tambem — adicionar listener ou reusar o existente.
- **Scroll-into-view ao focar input:** ao focar um input que fica abaixo do teclado virtual, scrollar o body do sheet pra trazer o input pra cima do teclado. `inputmode` e `enterkeyhint` consistentes nos inputs.
- **Sticky footer com teclado aberto:** footer fica acima do teclado (nao por baixo). Necessario testar — pode precisar de `position: sticky` no body do sheet em vez de `position: fixed`.
- **iOS Safari standalone:** replicar o `is-keyboard-open` body class + GPU layer (translate3d) do `ProfileBottomSheet` atual.

### 6.13 Fallback de dvh em iOS Safari < 15.4 (Fase 2)

- `98dvh` nao funciona em iOS 14/15. Fallback: `@supports not (height: 100dvh)` com `calc(100vh - 2vh - env(safe-area-inset-top))`.
- Testar em iOS 15.3 ou simulador.

### 6.14 Cache-control do redirect /settings -> /profile (Fase 1)

- Redirect 302 pode ser cacheado por proxies/CDN agressivamente. Adicionar `Cache-Control: no-store` (ou `no-cache, private`) na resposta.
- Em Next.js: configurar via `next.config.js` `headers()` ou retornar `Response` com header explicito no route handler.

### 6.15 Performance — backdrop blur duplo (Fase 4)

- 5.6=B-pragmatica gera 3 camadas (sheet backdrop + sheet + modal aninhado backdrop + modal aninhado). 2 backdrops blur = pesado em devices low-end Android (Snapdragon 6xx, MediaTek baixo).
- **Mitigacoes possiveis durante implementacao:**
  - Reduzir blur do backdrop aninhado (ou remover blur, manter so opacity)
  - Usar `backdrop-filter: none` em devices low-end via media query (improvavel mas considerar)
  - Testar com Chrome DevTools throttling (4x CPU slowdown) antes de codar otimizacoes

### 6.16 Identificacao visual do usuario no header mobile (informativo)

- Apos 5.9=a + 5.16, header mobile = logo + search + sino. Sem nome/avatar visivel.
- Em PWA standalone (1 usuario por instalacao), aceitavel.
- Em ambientes compartilhados (improvavel mas possivel), usuario precisa ir ao tab Perfil pra confirmar login.
- Aceitavel — registrado pra possivel revisao futura se virar problema.

### 6.17 Estrategia de testes pra refatoracao (Fases 1-5)

Tests que vao quebrar ou precisar de atualizacao:

- `/samples/new` page tests — vao precisar mover pra component `<NewSampleModal />` tests
- `ProfileBottomSheet` tests (se existirem) — vao ser deletados junto com o componente
- `/settings` tests — atualizar pra `/profile`
- Tabbar tests — atualizar items (5.1=A)
- E2E tests que abrem `/samples/new` direto — vao precisar refazer fluxo abrindo via FAB

Ordem sugerida: atualizar/criar tests **junto com cada Fase** (nao postergar pra Fase 5). Detalhar durante execucao.

### 6.18 Mapeamento exaustivo de referencias a `/settings` (resultado do grep, Fase 1)

Encontrados (sem testes/docs):

| Arquivo                             | Linhas  | O que faz                                                  | Acao na Fase 1                                                                                               |
| ----------------------------------- | ------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `components/ProfileBottomSheet.tsx` | 167     | Link `<Link href="/settings">` "Meu perfil"                | Componente sera deletado (Fase 1) — sem acao                                                                 |
| `components/AppShell.tsx`           | 25      | `NavIcon` type inclui `'settings'`                         | Remover do tipo (NavIcon nao precisa mais — item Perfil usa `<UserAvatar />`)                                |
| `components/AppShell.tsx`           | 101-102 | `isMainNavItemActive` reconhece `/settings`                | Substituir por regra de `/profile`                                                                           |
| `components/AppShell.tsx`           | 162-169 | Render do icone `'settings'` (SVG silhueta)                | Remover se NavIcon nao tiver mais `'settings'` (Fase 1)                                                      |
| `components/AppShell.tsx`           | 189     | `resolveMobileRouteMeta` retorna null para `/settings`     | Substituir por regra de `/profile` (manter retornando null — pagina `/profile` renderiza seu proprio header) |
| `components/AppShell.tsx`           | 216     | `const isSettingsPage = pathname === '/settings'`          | Renomear pra `isProfilePage`                                                                                 |
| `components/AppShell.tsx`           | 555     | `<Link href="/settings">` no dropdown desktop "Meu perfil" | Atualizar pra `/profile`                                                                                     |

**Decisoes pequenas derivadas (resolvidas sem virar decisao formal):**

- **Icone `'settings'` em NavIcon:** remove. Item Perfil usa `<UserAvatar />` diretamente (5.10=b).
- **Mobile route meta pra `/profile`:** retorna null (igual `/settings` hoje). Pagina `/profile` renderiza seu proprio header com avatar grande + nome + role (consistente com 5.12=a).

### 6.19 Stacking de modais aninhados sobre o BottomSheet (Fase 2/4)

Dois modais aninhados sao previstos: o de "Descartar?" (5.26, Fase 2) e o de cliente quick-create (5.6, Fase 4). Sao **mutuamente exclusivos** no fluxo:

- Cliente quick-create abre apenas durante `step=form` antes de submeter
- "Descartar?" abre apenas ao tentar fechar o sheet com `isDirty=true`

Logo, **nao precisam coexistir**. Ambos usam o mesmo tier de z-index `--z-modal-stacked` (~600). Se no futuro a UX exigir overlap (caso de borda raro), avaliar refatoracao pra inline expansivel (alvo de 5.6 = B).

### 6.20 Comportamento do botao X do BottomSheet (Fase 2)

Botao X no header do sheet aciona o mesmo `onDismissAttempt` que backdrop tap, drag-to-dismiss, ESC e back Android. Comportamento uniforme:

- Se `isDirty=true` -> abre modal "Descartar?" (5.26)
- Se `isDirty=false` -> fecha sheet direto

Sem branching por origem do evento. Logica concentrada em `onDismissAttempt`.

### 6.21 `clientDraftId` em mount do modal (Fase 2)

`<NewSampleModal />` ao montar (open false -> true) reusa a logica atual de `loadOrCreateDraftId()` em `sessionStorage` (key `'new-sample-draft-id'`). Comportamento identico ao atual `/samples/new` page:

- Se ha draftId no storage -> usa
- Senao -> gera novo UUID e persiste

Garante idempotencia do `createSample` em caso de retry mid-submit. Auto-save de form state (Fase 4) virara key paralela `'new-sample-draft-state'`.

### 6.22 Hotfix do sino — Bloco 0 da Fase 2

Bug detectado pos-Fase 1: `<NotificationBell />` adicionado em `.topbar-tools` nunca aparece em mobile porque CSS legacy (`globals.css:14567-14569`) esconde `.topbar-tools` em rotas `topbar--dashboard-only` (todas as rotas layered).

Em mobile, o "header" que o usuario ve sao os **headers de cada pagina** (`.dashboard-hero-avatar`, `.nsv2-avatar`), nao o topbar global.

**Fix em 4 sub-etapas (Bloco 0 da Fase 2):**

1. Remover `<NotificationBell />` de `.topbar-tools` em `components/AppShell.tsx` (linha adicionada no Passo 4 da Fase 1)
2. Adicionar `<NotificationBell className="header-notification-bell" />` em cada um dos 7 headers de pagina (mesmos arquivos do Passo 5 da Fase 1)
3. CSS — esconder o `<Link>` avatar em mobile e mostrar o sino no lugar:
   ```css
   @media (max-width: 900px) {
     .nsv2-avatar,
     .dashboard-hero-avatar {
       display: none;
     }
     .header-notification-bell {
       display: inline-flex;
     }
   }
   @media (min-width: 901px) {
     .header-notification-bell {
       display: none;
     }
   }
   ```
4. Remover CSS orfao `.topbar-notification-bell` (nao usado mais)

Trade aceito: em desktop ha 2 avatares visiveis (topbar global + header da pagina). Redundancia ja existia antes da Fase 1 (eram SVG silhuetas). Mantida pra evitar churn extra. Pode ser limpa em refatoracao futura.

### 6.23 Animacao do modal de confirmacao "Descartar?" (Fase 2)

Reusa keyframes existentes em `app/globals.css`:

- `app-modal-backdrop-in` (0.3s — fade do backdrop)
- `app-modal-card-in` (0.35s — scale subtil)

Mesma curve e timing do resto dos modais do projeto. Sem inventar transicoes proprias. Conforme `design-system` §8.

### 6.24 Acoes do modal "Descartar?" (Fase 2)

| Botao                | Acao                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| [Descartar]          | Limpa state do reducer; fecha sheet inteiro; (Fase 4) limpa `'new-sample-draft-state'` do storage. |
| [Continuar editando] | Fecha apenas o modal "Descartar?"; sheet permanece aberto no step atual.                           |

Layout do modal: titulo "Descartar amostra em andamento?" + texto explicativo + 2 botoes em `.app-modal-actions`. Botao destrutivo [Descartar] estilo `.app-modal-submit.is-danger`; [Continuar editando] estilo `.app-modal-secondary`.

### 6.25 `onSuccessNavigate` default (Fase 2)

Prop opcional do `<NewSampleModal />`. Default:

```ts
const handleSuccessNavigate =
  onSuccessNavigate ?? ((sampleId: string) => router.push(`/samples/${sampleId}`));
```

Permite o consumidor (page wrapper de `/samples/new`, ou no futuro o FAB / botao desktop) sobrescrever pra controlar destino apos criar. Mantido o comportamento atual (vai pra detail da amostra).

---

## 7. Fluxo do usuario alvo (alto nivel, mobile)

```
[Dashboard ou Lista de Amostras]
        |
        v
[Lista de Amostras] (Inicio nao tem entrada de registro - decisao 5.17)
        |
        v
[Tap no FAB "+" no canto inferior direito de /samples]
        |
        v
[Bottom sheet slide-up — "Nova Amostra"]
        |
        v
[Preenchimento dos campos]
   |             |
   |             +--> [Se cliente nao existe: form inline expandido]
   |                       |
   |                       +--> [Cliente criado, volta pro form de amostra]
   v
[Tap "Criar amostra" (sticky footer)]
        |
        v
[Sheet/modal troca pro step "review" — "Confirme os dados da amostra"]
   Card nao-editavel: Proprietario, Sacas, Safra, Lote origem, Local
   Botoes circulares: [Editar (volta pro form)] [Confirmar (submete)]
        |
        v
[Loading inline + criacao no backend]
        |
        v
[Sheet/modal troca pro step "created" — "Amostra criada"]
   Painel: "Lote XXXX" em destaque
   Texto: "Anote este numero na saca antes de seguir."
   Botao: [Ir para amostra]
        |
        v
[Tap "Ir para amostra" -> sheet/modal fecha -> navega pra /samples/[id]]
```

Pontos a detalhar conforme decisoes 5.3 a 5.7 forem fechadas:

- Comportamento do botao "voltar" do navegador / gesto Android com modal aberto
- Acessibilidade: foco inicial, trap de teclado, ARIA
- Comportamento quando ha draft pendente ao abrir o FAB (oferecer retomar?)

---

## 8. Ordem de execucao proposta

Decisoes 5.1, 5.2, 5.8-5.17 fechadas — Fase 1 totalmente pronta para execucao.
Decisao 5.4 define a arquitetura do modal (Fase 2).
Decisoes 5.3, 5.5, 5.6, 5.7 sao refinamentos.

### Fase 1 — Estrutural: Tabbar, Perfil, Header, Avatar `[CONCLUIDA — 2026-05-11]`

Pre-requisito: decisoes 5.1, 5.2, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.16 (todas fechadas).

Implementada na branch `feat/fase1-tabbar-perfil-header-avatar` em 7 commits sequenciais. Quality gates (lint, typecheck, format:check, build) verdes.

**Componentes novos:**

- [x] Criar componente `<UserAvatar size="sm|md|lg" />` (Nota 6.1) — `components/UserAvatar.tsx`
- [x] Criar componente `<NotificationBell />` placeholder nao-clicavel (Nota 6.3) — `components/NotificationBell.tsx`

**Rota `/profile`:**

- [x] Criar rota `/profile` (Next.js page) absorvendo conteudo de `app/settings/page.tsx` — `app/profile/page.tsx`
- [x] Reorganizar conteudo em secoes stackadas (5.12=a): header (avatar lg + nome + role) -> Identidade -> Email -> Senha -> [botao Sair em card proprio]
- [x] Implementar redirect 302 `/settings` -> `/profile` (Server Component + `redirects()` em next.config.mjs)

**`components/AppShell.tsx` — refatoracao baseada no mapeamento exaustivo (Nota 6.18):**

- [x] Atualizar `MOBILE_NAV_ITEMS`: nova ordem 5.1=A (`Inicio | Amostras | Camera* | Clientes | Perfil`); item Perfil usa `icon: 'avatar'`, `<UserAvatar />` renderizado em `renderNavIcon`
- [x] Atualizar `DESKTOP_NAV_ITEMS`: remover `/samples/new` (5.11=a)
- [x] Remover `'new-sample'` e `'settings'` do tipo `NavIcon`; adicionar `'avatar'`
- [x] Atualizar `isMainNavItemActive`: remover regras `/samples/new` e `/settings`; adicionar `/profile`
- [x] Atualizar `renderNavIcon`: remover blocos `'new-sample'` e `'settings'`; adicionar bloco `'avatar'` que renderiza `<UserAvatar />`
- [x] Atualizar `resolveMobileRouteMeta`: substituir regra `/settings` por `/profile`
- [x] Renomear const `isSettingsPage` -> `isProfilePage`; atualizar `isLayeredRoute`
- [x] Atualizar Link `href="/settings"` no dropdown desktop -> `/profile`
- [x] Simplificar `topbar-profile-trigger`: usa `<UserAvatar size="sm" />` em vez de SVG silhueta; `onClick` simplificado pra so toggle do menu (sem branching `window.innerWidth`)
- [x] Adicionar `<NotificationBell />` placeholder no header mobile (CSS-only switch via `@media (max-width: 900px)`)
- [x] Remover state `profileSheetOpen` e referencias
- [x] Remover listener `'open-profile-sheet'`
- [x] Remover `<ProfileBottomSheet>` do JSX
- [x] Remover import de `ProfileBottomSheet`

**Outras paginas — substituir 7 dispatches por `<Link href="/profile">`:**

- [x] `components/dashboard/DashboardMobile.tsx:65` (com adicao do import de Link)
- [x] `app/samples/new/page.tsx:596`
- [x] `app/clients/[clientId]/page.tsx:1029`
- [x] `app/users/page.tsx:595`
- [x] `app/samples/page.tsx:1016`
- [x] `app/clients/page.tsx:882`
- [x] `app/samples/[sampleId]/page.tsx:1850`

**Deletar componente e CSS:**

- [x] Deletar `components/ProfileBottomSheet.tsx`
- [x] Deletar CSS `.profile-sheet*` em `app/globals.css` (linhas 18582-18787, ~205 linhas)

**Validacao tecnica (quality gates):**

- [x] `npm run lint` verde (1 warning pre-existente em eslint.config.mjs nao relacionada)
- [x] `npm run format:check` verde
- [x] `npm run typecheck` verde
- [x] `npm run build` verde — rotas `/profile` (static, 4.48 kB) e `/settings` (dynamic, 320 B, redirect) registradas; `/samples/new` ainda presente (sera removida na Fase 5)
- [x] `grep "open-profile-sheet"` retorna zero ocorrencias em `app/` e `components/`
- [x] `grep "ProfileBottomSheet\|profile-sheet"` retorna zero em codigo (so em docs)

**Validacao funcional manual:** pendente — sera feita em ambiente local antes do PR/deploy (nao bloqueia o commit da Fase 1).

**Resumo da implementacao:** 3 arquivos novos (UserAvatar.tsx, NotificationBell.tsx, profile/page.tsx), 11 modificados (AppShell.tsx, settings/page.tsx, next.config.mjs, globals.css, 7 paginas com dispatch substituido por Link), 1 deletado (ProfileBottomSheet.tsx).

### Fase 2 — Componente: Modal de Nova Amostra `[CONCLUIDA — 2026-05-11]`

Pre-requisito: decisoes 5.4, 5.5-5.7, 5.18-5.28 fechadas (todas).

Implementada na branch `feat/fase2-modal-nova-amostra` em 7 commits sequenciais. Quality gates verdes (lint, format:check, typecheck, build, test:contracts 20/20, test:unit 177/177).

**Bloco 0 — Hotfix do sino (Nota 6.22):** commit `af8b6c0`

- [x] Remover `<NotificationBell />` de `.topbar-tools` em `components/AppShell.tsx`
- [x] Adicionar `<NotificationBell className="header-notification-bell" />` em cada um dos 6 headers de pagina (DashboardMobile, samples, samples/[sampleId], clients, clients/[clientId], users) — samples/new excluido porque sera reescrito no Bloco 3
- [x] Adicionar CSS em `globals.css`: media query 900px que esconde `.nsv2-avatar`/`.dashboard-hero-avatar` em mobile e mostra `.header-notification-bell`; inverso em desktop
- [x] Remover CSS orfao `.topbar-notification-bell`

**Bloco 1 — `<BottomSheet />` reusavel (Notas 6.5, 6.12, 6.13, 6.20, 6.25; decisoes 5.19, 5.25):** commit `5e957ea`

- [x] Criar `components/BottomSheet.tsx` com API controlled `{ open, onClose, onDismissAttempt?, title?, footer?, children, dragToDismiss?, dragDisabled?, ariaLabel? }`
- [x] Implementar slide-up animation 350ms cubic-bezier
- [x] Implementar drag-to-dismiss touch handlers (threshold 60px, smooth return se < threshold)
- [x] Header sticky com titulo + botao X; body scrollable; footer sticky
- [x] z-index `--z-modal` (overlay backdrop em `--z-modal-backdrop`)
- [x] Lifecycle visible/animatingIn com transition transform (sem `body.is-keyboard-open` duplicado — herdado globalmente do AppShell)
- [x] Fallback de dvh em iOS Safari < 15.4 (`@supports not (height: 100dvh)`)
- [x] Interceptacao de back Android (`history.pushState` ao abrir; `popstate` listener fecha; cleanup `history.back()` se externamente fechado)
- [x] Acessibilidade: `role="dialog"`, `aria-modal="true"`, focus trap via `useFocusTrap`, ESC dispara `onDismissAttempt`
- [x] Definir variavel CSS `--z-modal-stacked: 600` em `globals.css` (Nota 6.19); empurrar `--z-toast: 700` e `--z-tooltip: 800` pra preservar ordenacao

**Bloco 2 — `<NewSampleModal />` com wizard de 3 steps:** commits `2cef85d` (2.a skeleton + reducer), `c74a70d` (2.b form), `ce8aefd` (2.c review + Descartar), `29614c3` (2.d created + fade)

- [x] Criar `components/NewSampleModal.tsx` com API controlled `{ open, onClose, session, onSuccessNavigate? }` (`session` obrigatoria pra evitar `useRequireAuth` duplicado)
- [x] Implementar state machine via `useReducer`: `WizardState { step, status, error, createdSampleId, createdLotNumber, dirty, pendingDraft, fieldErrors }`, 10 action types (`MARK_DIRTY`, `SET_FIELD_ERRORS`, `CLEAR_FIELD_ERROR`, `GO_TO_REVIEW`, `BACK_TO_FORM`, `SUBMIT_START`, `SUBMIT_SUCCESS`, `SUBMIT_ERROR`, `CLEAR_ERROR`, `RESET`)
- [x] Reducer rejeita transicoes invalidas (ex: `BACK_TO_FORM`, `GO_TO_REVIEW`, `SUBMIT_START` retornam state inalterado se `status='submitting'`)
- [x] Migrar JSX do form de `app/samples/new/page.tsx` (campos: Cliente, Owner units, Sacas, Safra, Lote origem, Local, Observacoes) preservando validacoes
- [x] Validacao client-side ANTES de transicionar form -> review (`getMissingRequiredFieldErrors` + `createSampleDraftSchema.safeParse`)
- [x] Step `review`: card nao-editavel `.label-print-card.is-review-card` + botoes circulares `[Editar (BACK_TO_FORM)] [Confirmar (handleConfirmDraft -> createSample)]`
- [x] Step `created`: painel `.new-sample-created-panel` com lote em destaque + texto "Anote este numero..." + botao [Ir para amostra (navigateToSample)]
- [x] Header dinamico via `TITLE_BY_STEP`; footer dinamico via stepFooter
- [x] Animacao entre steps: fade 200ms ease-out via CSS keyframe `new-sample-step-fade-in` (key={state.step} re-monta container)
- [x] Mobile: usa `<BottomSheet />` com altura 98dvh + drag-handle visivel (so no step `form`)
- [x] Desktop: CSS responsivo do `<BottomSheet />` (>900px) transforma em modal centralizado 650px
- [x] `clientDraftId` carregado de `sessionStorage` via `loadOrCreateDraftId` com `useRef` flag (so primeiro mount com open=true)
- [x] Flag `dirty` setada true no primeiro onChange via `markDirty()` em cada handler de campo
- [x] Modal "Descartar?" aninhado: padrao replicado de `DirtyStateProvider.ConfirmModal`; classes `.is-stacked` (z-index 600); acoes `[Continuar editando]` (cancela) e `[Descartar (.is-danger)]` (limpa + fecha sheet)
- [x] Erro de submit aparece inline no step `review` (`new-sample-label-modal-feedback` quando `status='error'`)
- [x] Aria-live no titulo do BottomSheet pra anuncio de step transitions
- [x] Offline banner "Sem conexao" + disable submit (preservado)
- [x] Harvest presets dropdown com outside-click closer (preservado)
- [x] `dragDisabled={quickCreateOpen}` pausa drag enquanto ClientQuickCreateModal aberto

**Bloco 3 — Repurpose `/samples/new` como wrapper (decisao 5.23 + 5.28):** commit `2cf0f5c`

- [x] Substituir conteudo de `app/samples/new/page.tsx` (964 linhas) por wrapper de ~30 linhas: `<AppShell session={session}><NewSampleModal open={true} session={session} onClose={() => router.push('/samples')} /></AppShell>` envolvido em `<Suspense fallback={null}>`
- [x] Garantir que apos criar a amostra, `navigateToSample` (default `router.push(\`/samples/\${id}\`)`) e chamada e modal desmonta como side-effect da mudanca de rota

**Bloco 4 — Quality gates e validacao manual:** commit final

- [x] `npm run lint` verde
- [x] `npm run format:check` verde
- [x] `npm run typecheck` verde
- [x] `npm run build` verde — rotas `/samples/new` (9.26 kB, dynamic com wrapper), `/profile` (4.48 kB), `/settings` (320 B redirect) registradas corretamente
- [x] `npm run test:contracts` verde (20/20)
- [x] `npm run test:unit` verde (177/177)
- [ ] Dev manual mobile: drag-to-dismiss funciona; backdrop tap; back Android; sino visivel — **pendente validacao do usuario**
- [ ] Dev manual desktop: modal centralizado; sem sino (oculto via CSS) — **pendente validacao do usuario**

### Fase 3 — FAB e botao desktop `[CONCLUIDA — 2026-05-11]`

Pre-requisito: decisoes 5.3, 5.15, 5.17, 5.29-5.32 fechadas, Fase 2 completa.

Implementada na branch `feat/fase3-fab-botao-desktop` em 1 commit (`c5f326e`). Quality gates verdes (lint, format:check, typecheck, build, test:contracts 20/20, test:unit 177/177).

- [x] Criar `<SampleQuickCreateFab />` em `components/SampleQuickCreateFab.tsx` reusando CSS `.cv2-fab` (mesmo padrao do FAB de Clientes — mobile fixed bottom-right; desktop inline 64x64 no `.hero-search-wrap`)
- [x] Adicionar FAB em `/samples` mobile (sem dashboard, por 5.17) — renderizado dentro do `.hero-search-wrap` apos `.hero-search-filter-btn`
- [x] Botao "+ Nova amostra" desktop usa o mesmo componente `<SampleQuickCreateFab />` (decisao 5.30 = a — ao lado da searchbar; CSS `.cv2-fab` ja tem variante desktop)
- [x] Cabear FAB pro modal da Fase 2 via useState `newSampleModalOpen` em `app/samples/page.tsx`
- [x] Customizar `onSuccessNavigate` (decisao 5.29 = b): em vez do default `router.push(/samples/[id])`, fecha modal + incrementa `newSampleRefetchKey` (state local) que dispara refetch via dep array do useEffect existente
- [x] Validacao: posicionamento herdado de `.cv2-fab` ja consagrado em /clients (safe-area, conflito tabbar resolvidos no CSS existente em `globals.css:5789-5818` mobile + `20947-20957` desktop)

**Decisao 5.32 (sempre visivel)** confirmada — sem listener de scroll adicional.

### Fase 4 — Refinamentos de UX

Pre-requisito: decisoes 5.5, 5.6, 5.7 fechadas, Fase 2 completa.

- [ ] Persistencia/auto-save do draft (5.5)
- [ ] Confirmacao ao fechar com isDirty (5.5)
- [ ] Cliente quick-create inline ou aninhado (5.6)
- [ ] Transicao pos-criacao no mesmo modal (5.7)
- [ ] Testes manuais do fluxo completo

### Fase 5 — Limpeza

Pre-requisito: Fases 1-4 validadas em producao canary.

- [ ] Remover arquivo `app/samples/new/page.tsx`
- [ ] Verificar redirect `/settings` -> `/profile` funcional (5.13)
- [ ] Decidir destino do arquivo `app/settings/page.tsx` (deletar se 100% absorvido em `/profile`, ou manter como redirect handler)
- [ ] Limpar imports/referencias orfas
- [ ] Limpar tipo `'new-sample'` em `NavIcon` se nao usado em outro lugar
- [ ] Atualizar este documento com `Status: Concluido`
- [ ] Atualizar `docs/Produto-e-Fluxos.md` com o novo fluxo

---

## 9. Tracking

Status global: **Em planejamento — Fase 1 pronta pra execucao**

| Item                                    | Status                  | Notas                                                                               |
| --------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| Decisao 5.1 — Tabbar layout             | DECIDIDO (A)            | Inicio \| Amostras \| Camera\* \| Clientes \| Perfil                                |
| Decisao 5.2 — Perfil rota vs sheet      | DECIDIDO (A)            | Rota dedicada                                                                       |
| Decisao 5.3 — FAB mobile                | DECIDIDO (A)            | So `/samples` mobile                                                                |
| Decisao 5.4 — Formato do modal          | DECIDIDO (A)            | Bottom sheet mobile + `.app-modal.is-themed` desktop                                |
| Decisao 5.5 — Persistencia do draft     | DECIDIDO (C)            | Auto-save sessionStorage + confirmacao isDirty                                      |
| Decisao 5.6 — Quick-create cliente      | DECIDIDO (B-pragmatica) | Modal aninhado inicial, inline como debito tecnico futuro                           |
| Decisao 5.7 — Integracao review+created | DECIDIDO (A)            | Wizard 3 steps (form/review/created) na mesma superficie                            |
| Decisao 5.8 — Settings absorvido        | DECIDIDO (a)            | /profile substitui /settings                                                        |
| Decisao 5.9 — Avatar do header          | DECIDIDO (a)            | Some mobile, mantem desktop                                                         |
| Decisao 5.10 — Icone do Perfil          | DECIDIDO (b)            | Avatar do usuario                                                                   |
| Decisao 5.11 — Desktop perde new        | DECIDIDO (a)            | Sincroniza com mobile                                                               |
| Decisao 5.12 — Layout /profile          | DECIDIDO (a)            | Secoes stackadas                                                                    |
| Decisao 5.13 — Destino /settings        | DECIDIDO (a)            | Redirect 302 + atualizar links                                                      |
| Decisao 5.14 — Tipo avatar              | DECIDIDO (a)            | Iniciais coloridas                                                                  |
| Decisao 5.15 — Entrada desktop          | DECIDIDO (b)            | Botao topo da lista                                                                 |
| Decisao 5.16 — Header mobile            | DECIDIDO (c custom)     | Sino placeholder                                                                    |
| Decisao 5.17 — Dashboard entrada        | DECIDIDO (b)            | Sem ponto de entrada                                                                |
| Fase 1 — Tabbar, Perfil, Header, Avatar | CONCLUIDA (2026-05-11)  | 7 commits em feat/fase1-tabbar-perfil-header-avatar; build verde                    |
| Fase 2 — Modal componente               | CONCLUIDA (2026-05-11)  | 7 commits em feat/fase2-modal-nova-amostra; build verde; tests verdes               |
| Fase 3 — FAB e botao desktop            | CONCLUIDA (2026-05-11)  | 1 commit em feat/fase3-fab-botao-desktop; SampleQuickCreateFab + refetch automatico |
| Fase 4 — Refinamentos                   | PRONTA P/ EXECUCAO      | Todas as decisoes necessarias fechadas; depende da Fase 2 estar completa            |
| Fase 5 — Limpeza                        | PENDENTE                | Aguarda Fases 1-4                                                                   |

---

## 10. Perguntas e notas em aberto

Espaco para anotacoes que apareceram durante o planejamento e ainda nao foram resolvidas (alimentado pelo protocolo da secao 4):

- (a definir) Camera tem alguma integracao com nova amostra hoje? (lookup de QR ja criado? ou tambem registro?)
- (a definir) Comportamento do botao "voltar" do navegador / gesto Android com modal aberto
- (a definir) Acessibilidade: foco inicial, trap de teclado, ARIA labels no modal de nova amostra
- (a definir) Desktop refatoracao completa: quando? Em paralelo com mobile ou apos mobile validado em producao?
- (a definir) Telemetria: trackear abertura/abandono/conclusao do modal pra medir impacto na taxa de conclusao
- (a definir) Estilo exato do botao "+ Nova amostra" desktop (5.15) — `.app-button-primary`, posicao (canto direito perto da searchbar?), tamanho
- (a definir) Atalho de teclado no desktop pra "+ Nova amostra" (ex: tecla N)?

---

## 11. Riscos arquiteturais e recomendacoes (revisao v1.9)

Riscos identificados na revisao critica pre-implementacao. Nao bloqueiam o codigo mas exigem cuidado durante execucao.

### 11.1 Risco: Fase 1 e Fase 2 nao devem ser paralelizadas

- Ambas tocam `components/AppShell.tsx` (Fase 1 muda tabbar/avatar/header; Fase 2 cria `<NewSampleModal />` que pode precisar interagir com o layout do shell).
- Branches paralelos vao gerar merge conflicts em `AppShell.tsx`.
- **Recomendacao:** Fase 1 -> Fase 2 sequencial. Fase 3 e Fase 4 podem ate ser paralelas entre si **apos Fase 2** completar.

### 11.2 Risco: Tabbar com avatar (5.10=b) quebra simetria visual

- 4 SVGs (Inicio, Amostras, Camera, Clientes) + 1 circle colorido com iniciais (Perfil) na mesma linha. Pode parecer inconsistente na primeira iteracao.
- **Mitigacao:**
  - Ring/border verde no estado ativo (Nota 6.2) ajuda a uniformizar visualmente
  - Tamanho do avatar (~28px) consistente com bounding box dos SVGs
  - Testar em design review antes de aprovar Fase 1

### 11.3 Risco: State machine complexa pro NewSampleModal

- Combinacao 5.4 + 5.5 + 5.6 + 5.7 cria componente com muitos estados: `step (form/review/created)` x `clienteModalAberto` x `auto-saving` x `isDirty` x `submitting` x `error`.
- Implementar com `useState` solto pode gerar bugs de transicao (ex: clicar [Confirmar] enquanto submitting; abrir cliente quick-create no step review).
- **Recomendacao:** modelar com **state machine explicita**:
  - Reducer estruturado com `{ step, status: 'idle' | 'submitting' | 'error', clientQuickCreateOpen, dirty }` + action types
  - Transicoes validas explicitamente declaradas
  - Considerar XState se a complexidade justificar (mas reducer manual provavelmente basta)
- Adiciona tempo de implementacao na Fase 2 mas reduz bugs.

---

## 12. Historico de revisoes

| Data       | Mudanca                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Autor           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 2026-05-11 | Criacao do documento (v1) — objetivo, estado atual, 7 decisoes pendentes, ordem de execucao, tracking                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Flavio + Claude |
| 2026-05-11 | v1.1 — Adicionada secao 4 "Metodologia de analise de decisoes" como protocolo obrigatorio. Renumeracao consequente das secoes 5-10 e referencias internas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Flavio + Claude |
| 2026-05-11 | v1.2 — Decisoes 5.1 (A) e 5.2 (A) decididas com aplicacao do protocolo. Descobertas no codigo: rota /settings ja existe (639 linhas, conteudo de perfil+email+senha+logout). 4 decisoes derivadas adicionadas (5.8 a 5.11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Flavio + Claude |
| 2026-05-11 | v1.3 — Decisoes 5.8 (a), 5.9 (a), 5.10 (b), 5.11 (a) decididas. 5 decisoes derivadas adicionadas (5.12 a 5.16). Descoberta: SessionUser nao tem campo de foto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Flavio + Claude |
| 2026-05-11 | v1.4 — Decisoes 5.12 (a), 5.13 (a), 5.14 (a), 5.15 (b), 5.16 (c custom). 1 decisao derivada adicionada (5.17). 4 notas tecnicas registradas (secao 6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Flavio + Claude |
| 2026-05-11 | v1.5 — Decisao 5.17 (b). 5.3 reinterpretada como FAB mobile only com recomendacao automatica A em funcao de 5.17. Fase 1 totalmente desbloqueada para execucao.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Flavio + Claude |
| 2026-05-11 | v1.6 — Decisoes 5.3 (A) e 5.4 (A) fechadas. Nota tecnica 6.5 adicionada (componente `<BottomSheet />` reusavel com API, fixes herdados de PWA standalone iOS, interceptacao de back Android). Fase 2 detalhada com 11 sub-tarefas e marcada PRONTA P/ EXECUCAO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Flavio + Claude |
| 2026-05-11 | v1.7 — Correcao de pontos desatualizados sobre o fluxo de criacao: QR e print foram REMOVIDOS do fluxo de criacao na Fase P3 (apenas o lote em destaque permanece no step `created`). Secao 2.4 expandida com detalhamento dos steps `review` e `created`. Nova secao 2.4b sobre print de etiqueta como acao manual nos detalhes (independente de classificacao). Secao 7 (fluxo do usuario) corrigida. Decisao 5.7 reformulada — agora trata de integracao do wizard `form -> review -> created` com o modal/sheet, sem qualquer relacao com print.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Flavio + Claude |
| 2026-05-11 | v1.8 — Decisoes 5.5 (C: auto-save + confirmacao), 5.6 (B-pragmatica: modal aninhado inicial + debito tecnico) e 5.7 (A: wizard 3 steps na mesma superficie) fechadas. 3 notas tecnicas adicionadas (6.6, 6.7, 6.8). Fase 4 marcada PRONTA P/ EXECUCAO. **Todas as 17 decisoes da secao 5 estao fechadas — planejamento concluido, pronto pra execucao das fases.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Flavio + Claude |
| 2026-05-11 | v1.9 — Revisao critica pre-implementacao (THINK HARDER). Aplicados 2 ajustes criticos no comportamento do wizard (Nota 6.6): gestos universais (drag/backdrop/back) sempre fecham; navegacao entre steps e exclusiva de botoes (Editar volta pro form com state preservado via 5.5=C; Ir para amostra navega pra /samples/[id]). Adicionadas 10 novas notas tecnicas (6.9-6.18) cobrindo validacao client-side, erro de submit, acessibilidade, keyboard virtual, fallback dvh iOS, cache-control redirect, performance backdrop, identificacao usuario, estrategia de testes, mapeamento exaustivo /settings. Criada secao 11 com 3 riscos arquiteturais (Fases 1+2 sequenciais, tabbar com avatar, state machine explicita). Fase 1 expandida com sub-tarefas detalhadas (29 checkboxes) baseadas no grep exaustivo. Renumeracao: secao Historico passou de 11 -> 12.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Flavio + Claude |
| 2026-05-11 | v1.10 — Fase 1 IMPLEMENTADA. 7 commits em branch `feat/fase1-tabbar-perfil-header-avatar`: (1) componentes UserAvatar + NotificationBell + CSS; (2) rota /profile absorvendo /settings + card de logout; (3) redirect 307 /settings -> /profile (Server Component + next.config.mjs); (4) refactor AppShell.tsx (14 edits — tabbar, NavIcon, isMainNavItemActive, renderNavIcon, dropdown desktop, NotificationBell, remocao de state/listener/JSX do bottom sheet); (5) 7 dispatches de 'open-profile-sheet' substituidos por `<Link href="/profile">`; (6) delete ProfileBottomSheet.tsx (~200 linhas) + bloco CSS .profile-sheet\* (~205 linhas); (7) atualizacao do doc com checkboxes marcados, tracking atualizado, novo historico. Quality gates verdes (lint, format:check, typecheck, build). `/profile` registrado como static (4.48 kB), `/settings` como dynamic (320 B, redirect). Decisoes implementacao: tabbar usa novo NavIcon `'avatar'` que delega pra `<UserAvatar />` quando user esta disponivel; header mobile esconde dropdown e mostra sino via CSS-only `@media (max-width: 900px)`. Total: 3 arquivos novos, 11 modificados, 1 deletado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Flavio + Claude |
| 2026-05-11 | v1.11 — Pre-implementacao da Fase 2: 10 decisoes granulares fechadas (5.18-5.27) + 1 pendente (5.28). 7 notas tecnicas novas (6.19-6.25). Revisao da Nota 6.6 (animacao entre steps mudou de slide horizontal 350ms para fade simples 200ms — 5.22). Detectado bug pos-Fase 1: `<NotificationBell />` invisivel em mobile porque CSS legacy esconde `.topbar-tools` em rotas layered; documentado fix completo na Nota 6.22 e adicionado como Bloco 0 da Fase 2. Fase 2 expandida com 4 blocos detalhados (Bloco 0 hotfix sino, Bloco 1 BottomSheet, Bloco 2 NewSampleModal com wizard, Bloco 3 wrapper /samples/new).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Flavio + Claude |
| 2026-05-11 | v1.12 — Decisao 5.28 (estrutura do wrapper `/samples/new`) fechada: opcao (a) — `<AppShell>` envolvendo `<NewSampleModal />`, coerente com layout atual. Fase 2 totalmente desbloqueada (todas as 5.18-5.28 decididas), pronta pra implementacao.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Flavio + Claude |
| 2026-05-11 | v1.13 — Fase 2 IMPLEMENTADA. 7 commits em branch `feat/fase2-modal-nova-amostra`: (Bloco 0) hotfix do sino — `<NotificationBell />` movido de `.topbar-tools` (sempre oculto em mobile pelo CSS legacy) para os 6 headers de pagina com CSS-only swap em `@media (max-width: 900px)`; (Bloco 1) `components/BottomSheet.tsx` reusavel com API controlled, drag-to-dismiss 60px, focus trap, back Android via `history.pushState`+`popstate`, ESC, fallback iOS `@supports not (height: 100dvh)`, desktop responsivo (>900px = modal centralizado 650px); (Bloco 2.a) skeleton de `components/NewSampleModal.tsx` com tipos `WizardState`/`WizardAction` e `useReducer` rejeitando transicoes invalidas durante `submitting`; (Bloco 2.b) migracao do form completo (7 campos, useEffects, helpers `loadOrCreateDraftId`/`renewDraftId`/`buildHarvestPresets`, validacao Zod, offline banner, harvest dropdown, `useRegisterDirtyState`); (Bloco 2.c) review step com card nao-editavel + 2 botoes circulares, `handleConfirmDraft` async via `createSample`, modal "Descartar?" inline replicando padrao de `DirtyStateProvider.ConfirmModal` com `.is-stacked` (z-index `--z-modal-stacked: 600`); (Bloco 2.d) created step com painel de lote em destaque e `aria-live="polite"`, animacao fade 200ms entre steps via CSS keyframe + `key={state.step}`; (Bloco 3) substituicao de `app/samples/new/page.tsx` (964 linhas) por wrapper de 30 linhas com Suspense + AppShell + NewSampleModal aberto. Quality gates verdes: lint, format:check, typecheck, build (`/samples/new` 9.26 kB), test:contracts (20/20), test:unit (177/177). Validacao manual mobile/desktop pendente do usuario. Total: 2 arquivos novos (BottomSheet, NewSampleModal), 9 modificados, 0 deletados (samples/new mantido como wrapper ate Fase 5). | Flavio + Claude |
| 2026-05-11 | v1.14 — Fase 3 IMPLEMENTADA. 4 decisoes granulares novas fechadas (5.29 customizar onSuccessNavigate pra ficar em /samples; 5.30 botao "+ Nova amostra" ao lado da searchbar desktop; 5.31 refetch automatico ao criar; 5.32 FAB sempre visivel sem hide-on-scroll). Commit `c5f326e` em branch `feat/fase3-fab-botao-desktop`: novo componente `components/SampleQuickCreateFab.tsx` (~30 linhas, reusa CSS `.cv2-fab` ja consagrado em /clients — mobile fixed bottom-right, desktop inline 64x64), JSX adicionado no `.hero-search-wrap` de `/samples` apos o `.hero-search-filter-btn`, `<NewSampleModal />` integrado com `onSuccessNavigate` custom que fecha modal + incrementa `newSampleRefetchKey` (state local adicionado ao dep array do useEffect de fetch — dispara refetch automatico mostrando a nova amostra no topo da lista). Quality gates verdes (lint, format:check, typecheck, build, test:contracts 20/20, test:unit 177/177). `/samples/new` agora 442 B (wrapper minimo) e `/samples` 6.30 kB (com FAB + modal embarcado).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Flavio + Claude |
