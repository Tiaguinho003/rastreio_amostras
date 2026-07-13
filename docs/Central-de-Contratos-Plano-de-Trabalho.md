# Central de Contratos — Plano de Trabalho

Status: **F1 implementada** (C1–C4, 2026-07-09) + **F2 COMPLETA 2026-07-10**
(junto com o Embarque). F1: hub `/contratos` com 4 sub-abas; Contratos e Financeiro
migrados; Aprovações/Embarque placeholder; `/financeiro` redireciona; nav unificada.
**F2 (CC15 opção 1', commit `b42aa22`, NÃO pushado):** o hub abriu a **todos os
não-PROSPECTOR** (guard → `NON_PROSPECTOR_ROLES`); abas **filtradas por papel**
(`contractsHubTabs` em `lib/roles.ts` — ADMIN/COMMERCIAL 4 abas; operacionais **2 abas de
operação: Embarque + Aprovações**, AP30); **rótulo do item de nav por papel**
("Contratos"/"Embarques" via `contractsHubNavLabel`, em `AppShell` + `HeaderAvatarMenu`); a
aba Embarque ganhou conteúdo (worklist — ver `Embarque-Plano-de-Trabalho.md`). **A aba
Aprovações também ganhou conteúdo 2026-07-10** (worklist da reforma "o portão" — ver
`Aprovacoes-Plano-de-Trabalho.md`), aberta a todos os não-PROSPECTOR (operacionais
incluídos, AP30); **CC7 resolvido** (geração só na sub-aba, AP29). Decisões CC1–CC15.
Gates verdes; **validar no device**.
Escopo: unificar as 4 superfícies ligadas ao contrato de venda (**Contratos**,
**Financeiro**, **Aprovações**, **Embarque**) numa **única página com sub-abas**.
Nesta primeira fase: fundir Contratos + Financeiro (que já são páginas) e criar
Aprovações + Embarque como **sub-abas vazias** (sem conteúdo ainda).
Início: 2026-07-09
Prefixo de decisão: **CC** (Central de Contratos).
Documentos relacionados (que esta unificação toca):
`Contratos-Plano-de-Trabalho.md`, `Aprovacoes-Plano-de-Trabalho.md`,
`Embarque-Plano-de-Trabalho.md`, `Dashboard-Visao-Geral.md`,
`Auditoria-Navegacao-por-Papel.md`, `README.md`.

---

## 1. Motivação e visão

As 4 features são **camadas sobre a mesma entidade** (`SaleContract`): o contrato
em si, a corretagem/dinheiro dele (Financeiro), a aprovação dele (etiqueta) e o
embarque dele. Hoje estão espalhadas em superfícies diferentes (duas páginas, um
modal, um card do dashboard). A visão é reuni-las numa **página guarda-chuva com
sub-abas**, para que informação com o mesmo padrão e a mesma relação fique
organizada num lugar só.

Nesta fase montamos a **casca** (a página com as 4 abas) e migramos as duas que já
existem (Contratos e Financeiro). Aprovações e Embarque entram como **abas vazias**
(placeholder "em breve") — a lógica de conteúdo delas é fase futura, com decisão
própria nos respectivos docs.

## 2. Estado atual (linha de base factual)

> Levantamento de código (`app/`, `lib/roles.ts`, `components/AppShell.tsx`,
> `components/HeaderAvatarMenu.tsx`, `src/sale-contracts/sale-contract-service.js`)
> e dos 4 docs, feito em 2026-07-09.

### 2.1 Superfícies hoje

| Feature        | Superfície atual                                                                                                                                                                                         | Arquivo                                     | Implementação                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| **Contratos**  | **Página `/contratos`** + modais (emissão, Detalhes c/ PDF) + FAB radial                                                                                                                                 | `app/contratos/page.tsx` (842 L)            | ✅ ponta a ponta (Fases 0/A/B/C/D/E/F/I/J); não pushado            |
| **Financeiro** | **Página `/financeiro`** (role-adaptive) + dialog "Pago"                                                                                                                                                 | `app/financeiro/page.tsx` (396 L)           | ✅ (Fase F + D135/D136/D137); sem migration; não pushado           |
| **Aprovações** | **Modal** `ApprovalLabelModal` pela porta do leque "+" de `/samples` (o atalho/feed no **card de Eventos saiu** — DSB-D9/AP29, 2026-07-12; a sub-aba Aprovações virou a casa). Sinal no modal de emissão | `components/ApprovalLabelModal.tsx` (508 L) | ✅ reforma AP1–AP16 (2026-07-09); parte não commitada; não pushado |
| **Embarque**   | **(planejado)** card/evento do dashboard + sinal no modal de emissão + fotos no modal de Detalhes                                                                                                        | —                                           | 🟡 **design completo EMB1–EMB19, ZERO código**                     |

Observação-chave: **só Contratos e Financeiro são páginas.** Aprovações e Embarque
foram desenhados de propósito como modal + evento de dashboard + seções dentro dos
modais do contrato.

### 2.2 Acesso por papel hoje (fonte: `lib/roles.ts` + backend)

Papéis (`enum UserRole`): ADMIN, CLASSIFIER, REGISTRATION, COMMERCIAL, PROSPECTOR,
CADASTRO.

| Superfície           | Constante                                        | Papéis                                                                                          | Escopo                                                                               |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/contratos`         | `CONTRATOS_ROLES` (`SALE_CONTRACT_ACCESS_ROLES`) | ADMIN + COMMERCIAL                                                                              | ADMIN vê tudo; COMMERCIAL só os contratos em que é corretor (`Broker.userId`) — D110 |
| `/financeiro`        | `FINANCEIRO_ROLES`                               | ADMIN + COMMERCIAL                                                                              | idem, escopado por `Broker.userId` — D135/D136                                       |
| Aprovações (modal)   | (auth-only)                                      | **decide** = ADMIN+COMMERCIAL (AP9); **gera/vê** = **todos não-PROSPECTOR** (AP10)              | sem posse na geração                                                                 |
| Embarque (planejado) | (auth-only)                                      | **marca** = criadores ADMIN+COMMERCIAL; **vê/confirma** = **todos não-PROSPECTOR** (EMB7/EMB16) | sem posse                                                                            |

**A tensão central:** Contratos/Financeiro são gestão restrita (ADMIN+COMMERCIAL,
com posse); Aprovações/Embarque foram desenhados **abertos a todos os
não-PROSPECTOR sem posse** — justamente porque CLASSIFIER/REGISTRATION/CADASTRO
**não acessam `/contratos`** mas precisam gerar aprovação / confirmar embarque no
seu fluxo operacional. Ver Bloco 2.

### 2.3 Navegação hoje

Config central: `components/AppShell.tsx`. Breakpoint 900px.

> **DSB-D6 (2026-07-12):** no **desktop** a navegação dos papéis não-PROSPECTOR
> saiu da sidebar e virou uma **top bar horizontal** (só nomes). Onde este bloco
> diz "sidebar desktop", leia **"top bar desktop"**. Fonte canônica atualizada:
> `docs/Auditoria-Navegacao-por-Papel.md`.

- **Top bar desktop** (era sidebar): dois itens separados — `CONTRATOS_NAV_ITEM` (gate
  `CONTRATOS_ROLES`, `:435`) e `FINANCEIRO_NAV_ITEM` (gate `FINANCEIRO_ROLES`,
  `:429`).
- **Tabbar mobile** (`MOBILE_NAV_ITEMS`): **não** inclui Contratos nem Financeiro.
- **Menu do avatar mobile** (`HeaderAvatarMenu.tsx`): Contratos (`:126`) e
  Financeiro (`:142`).

### 2.4 Achados que a unificação já resolve ou precisa tratar

1. **Bug de consistência na nav do Contratos**: sidebar desktop usa `CONTRATOS_ROLES`
   (ADMIN+COMMERCIAL), mas o menu do avatar mobile (`HeaderAvatarMenu.tsx:126`) usa
   `isAdmin` → **um COMMERCIAL vê Contratos no desktop mas não no mobile**. A nav
   unificada corrige isso de brinde.
2. **Docs desatualizados**: a `Auditoria-Navegacao-por-Papel.md` ainda diz
   `/contratos` = ADMIN-only (era verdade até 2026-06-28; D110 reabriu ao
   COMMERCIAL) e **não lista `/financeiro`** como rota. Precisa de atualização (Bloco 6).
3. **Deep links existentes** para `/contratos?details=<id>` (dashboard, "Ver
   contrato") precisam continuar funcionando (Bloco 1).
4. **Backend não muda em F1**: Contratos e Financeiro já compartilham
   `src/sale-contracts/sale-contract-service.js` e reusam `SaleContractLifecycleDialog`.
   A fusão é de **front-end** (casca + abas).

## 3. Princípios da unificação

- **P1 — Gate por aba, não pela página.** A página abre para quem enxerga **≥1
  aba**; abas que o papel não pode ver **somem** da barra de abas.
- **P2 — Uma entidade, quatro vistas.** Todas as abas operam sobre `SaleContract`;
  nada de duplicar backend em F1.
- **P3 — Não quebrar o que existe.** Deep links, notificações e atalhos que hoje
  apontam para `/contratos`/`/financeiro` continuam válidos (redirect + `?tab=`).
- **P4 — Abas vazias não expandem acesso.** Enquanto Aprovações/Embarque forem
  placeholders, o acesso da página **não muda** (segue ADMIN+COMMERCIAL). A
  abertura a papéis operacionais entra junto com o **conteúdo** dessas abas (F2+).
- **P5 — Cada feature-doc segue dono da sua lógica.** Este doc é a autoridade da
  **casca** (página, abas, URL, acesso, navegação). A lógica interna de cada aba
  continua nos docs de Contratos/Aprovações/Embarque/Eventos.

---

## 4. Decisões

> Cada decisão traz **Contexto → Opções → Proposta (recomendação) → DECISÃO**.
> Status 🟡 = proposta aguardando sua confirmação. ✅ = decidida. Nada aqui está
> gravado como decidido até você rular.

### Bloco 0 — Nome, rota e redirect

**CC1 — Rota do hub.**

- Contexto: `/contratos` já é alvo de deep links (`?details=`), atalhos do dashboard
  e (futuras) notificações. `/financeiro` é rota separada.
- Opções: (a) manter `/contratos` como rota do hub; (b) criar rota nova
  (`/comercial`, `/central`…).
- **Proposta:** **(a) manter `/contratos`** como a rota do hub — menor risco, zero
  quebra de deep link. `/financeiro` vira **redirect** para o hub (ver CC3).
- DECISÃO: ✅ **(a) manter `/contratos`** (2026-07-09).

**CC2 — Rótulo do item de navegação.**

- Contexto: hoje o item chama "Contratos". Com 4 abas, o rótulo passa a nomear um
  hub. Sutileza: **se no futuro papéis operacionais entrarem vendo só
  Aprovações/Embarque** (Bloco 2), o rótulo "Contratos" pode confundir (eles não
  veem contrato nenhum).
- Opções: (a) manter **"Contratos"**; (b) rótulo guarda-chuva neutro
  ("Comercial", "Negócios", "Fechamentos"); (c) rótulo por papel.
- **Proposta:** **(a) manter "Contratos" em F1** (só ADMIN+COMMERCIAL entram, e eles
  veem contratos — é honesto e simples). **Revisitar o rótulo em F2**, quando/se a
  página abrir a papéis operacionais (troca de label é barata). Registrar como
  questão futura, não bloquear F1.
- DECISÃO: ✅ **(a) manter "Contratos"** agora (2026-07-09). **Desfecho do futuro
  (CC15):** na F2 o rótulo passa a ser **por papel** — ADMIN/COMMERCIAL "Contratos",
  operacionais "Embarques"; em F1 segue só "Contratos" (só eles entram).

**CC3 — Destino da rota `/financeiro`.**

- Contexto: `/financeiro` deixa de ser página e vira aba. Precedente no app:
  `/resumo` → `/informe`, `/settings` → `/profile` (redirect silencioso).
- Opções: (a) `/financeiro` **redireciona** para `/contratos?tab=financeiro`;
  (b) remover a rota (404).
- **Proposta:** **(a) redirect** para `/contratos?tab=financeiro` — preserva
  qualquer link/atalho existente e segue o padrão do app.
- DECISÃO: ✅ **(a) redirect** `/financeiro` → `/contratos?tab=financeiro` (2026-07-09).

### Bloco 1 — Esquema de URL e mecânica das abas

**CC4 — Como a aba ativa aparece na URL.**

- Contexto: o hub `/cadastros` usa `useState` puro (aba não vai pra URL). Mas
  `/contratos` já usa query (`?details=<id>`) para deep-link de contrato, e
  `/financeiro` precisa de um alvo de redirect (CC3).
- Opções: (a) `useState` puro (sem URL) — mais simples, mas sem deep-link de aba e
  sem alvo pro redirect; (b) **query param `?tab=`** (`contratos|financeiro|
aprovacoes|embarque`), coexistindo com `?details=`; (c) segmentos de rota
  (`/contratos/financeiro`) — exige rotas aninhadas, mais trabalho.
- **Proposta:** **(b) `?tab=`**, default `contratos` quando ausente. `?details=<id>`
  implica `tab=contratos`. Dá alvo limpo pro redirect do Financeiro e deep-link de
  aba pra atalhos futuros; é um delta pequeno sobre o padrão do `/cadastros`.
- DECISÃO: ✅ **(b) `?tab=`** — default `contratos`; coexiste com `?details=` (2026-07-09).

**CC5 — Componente/estrutura das abas.**

- Contexto: existe padrão reutilizável em `app/cadastros/page.tsx`
  (`role="tablist"`, classes `.cad-tabs`/`.cad-tab`, painéis condicionais). Não há
  lib de `<Tabs>` genérica.
- Opções: (a) reusar o padrão do `/cadastros` (copiar a mecânica); (b) extrair um
  componente `<TabsHub>` genérico e usar nos dois.
- **Proposta:** **(a) reusar o padrão** do `/cadastros` em F1 (consistência visual +
  velocidade); avaliar extrair um componente comum só se a duplicação incomodar
  depois. As páginas atuais viram o **conteúdo** de cada painel (o `page.tsx` de
  Contratos e o de Financeiro são refatorados em componentes de aba).
- DECISÃO: ✅ **(a) reusar o padrão do `/cadastros`**; Contratos e Financeiro viram
  componentes de painel (2026-07-09).

### Bloco 2 — Acesso por papel, aba a aba (o coração)

**CC6 — Regra de visibilidade da página e das abas.**

- Contexto: princípio P1 (gate por aba). A questão é a **matriz alvo** e o que
  vale **em F1** (abas vazias).
- **Proposta — matriz ALVO** (quando Aprovações/Embarque tiverem conteúdo):

  | Aba            | ADMIN   | COMMERCIAL | CLASSIFIER | REGISTRATION | CADASTRO | PROSPECTOR |
  | -------------- | ------- | ---------- | ---------- | ------------ | -------- | ---------- |
  | **Contratos**  | ✅ tudo | ✅ os dele | ❌         | ❌           | ❌       | ❌         |
  | **Financeiro** | ✅ tudo | ✅ os dele | ❌         | ❌           | ❌       | ❌         |
  | **Aprovações** | ✅      | ✅         | ✅         | ✅           | ✅       | ❌         |
  | **Embarque**   | ✅      | ✅         | ✅         | ✅           | ✅       | ❌         |

  → No alvo, o hub fica visível a **todos os não-PROSPECTOR**; papéis operacionais
  (CLASSIFIER/REGISTRATION/CADASTRO) veem **só** Aprovações + Embarque.

- **Proposta — F1 (abas vazias):** por P4, o acesso **não muda agora**. O hub abre
  só para **ADMIN + COMMERCIAL**; as 4 abas aparecem para eles (Contratos +
  Financeiro funcionais; Aprovações + Embarque "em breve"). Papéis operacionais
  **ainda não veem o hub** — nada muda pra eles nesta fase. A abertura entra junto
  com o conteúdo (F2+).
- DECISÃO: ✅ (2026-07-09) **Camada 1 (F1):** acesso inalterado — hub só
  ADMIN+COMMERCIAL; Aprovações/Embarque entram vazias. **Camada 2 (alvo, F2+):**
  direção **A** — Aprovações e Embarque visíveis a **todos os não-PROSPECTOR**
  (facilitar que todos vejam as infos de aprovação e embarque). A **forma** de
  expor essas abas aos papéis operacionais está no **CC15**.

**CC15 — Forma de expor Aprovações/Embarque aos papéis operacionais.**

- Contexto: por CC6-A, todos os não-PROSPECTOR veem Aprovações+Embarque. Como
  CLASSIFIER/REGISTRATION/CADASTRO **não** veem Contratos/Financeiro, a questão é o
  formato da porta deles — sem confundir (uma página "Contratos" que não mostra
  contrato nenhum).
- Opções:
  - **1 (ingênua):** uma página `/contratos`, rótulo "Contratos" para todos, abas
    filtradas por papel. ❌ Rejeitada — o operador abre "Contratos" e não vê contrato.
  - **1' (uma página, rótulo por papel):** uma rota `/contratos`, **uma** casca;
    abas filtradas por papel; **o rótulo do item de nav muda por papel** —
    ADMIN/COMMERCIAL veem "Contratos" (4 abas), operacionais veem "Embarques"
    (2 abas: Aprovações+Embarque). Preserva a visão de "uma página só"; os
    componentes de aba são escritos uma vez.
  - **2 (duas páginas):** `/contratos` (gestão, 4 abas) + nova rota `/embarques`
    (operacional, 2 abas). As abas Aprovações/Embarque = **mesmos componentes**
    montados nas duas páginas. Cada papel vê **uma** porta só. Cascas finas separadas.
- **Proposta:** **1'** — entrega a unificação (uma página só), atende "todos veem
  aprovação/embarque" e mata a confusão de rótulo com um label por papel (barato).
  **2** passa a ser preferível se, no futuro, os operacionais ganharem abas
  **exclusivas** (um hub operacional que cresce) — aí um "Embarques" próprio evita
  inchar "Contratos".
- Rótulo do público operacional (a fechar em F2): "Embarques" (curto, mas
  subestima Aprovações) × "Aprovações e Embarques" × "Operações".
- Gargalos (ambas): (i) o painel operacional **nunca** pode disparar os endpoints
  de Contratos/Financeiro (403 para operador) — em 1' exige carregar a aba sob
  demanda; em 2 é estrutural (a página operacional nem monta essas abas). (ii) em 1'
  a barra de abas varia por papel (matriz de teste maior); em 2 é estável por rota.
- DECISÃO: ✅ **1'** — uma página `/contratos`, uma casca, abas filtradas por papel
  e **rótulo do item de nav por papel** (ADMIN/COMMERCIAL: "Contratos";
  operacionais: "Embarques"). Só entra em vigor na **F2** (quando as abas ganham
  conteúdo e o acesso abre a papéis operacionais); em **F1 nada muda** — a página
  segue só ADMIN+COMMERCIAL com o item "Contratos" (2026-07-09).

**CC7 — (Futura, registrar) Portas redundantes quando Aprovações/Embarque virarem aba.**

- Contexto: Aprovações/Embarque já têm portas próprias (dashboard "Gerar
  aprovação", leque "+" de `/samples`, confirmação de embarque no dashboard). Se
  virarem também aba, há **duas portas** — como já houve com contrato (AP11 removeu
  a porta de geração do `/contratos`).
- **Proposta:** **não decidir agora**; é fase futura. Registrar como questão a
  resolver no ciclo de conteúdo de cada aba (docs de Aprovações/Embarque): a aba é
  porta **adicional** ou **substitui** as portas de dashboard/`/samples`?
- DECISÃO: 🟡 **Aprovações RESOLVIDO** (2026-07-09; `Aprovacoes-Plano-de-Trabalho.md`,
  AP29): a **sub-aba é a única porta de geração** — o dashboard vira **caminho** (perde o
  "Gerar aprovação", reverte AP7) e o **`/samples` sai**. Portas finais de geração da
  aprovação = **só a sub-aba**. **Embarque:** segue em aberto (resolve no ciclo de conteúdo
  do Embarque).

### Bloco 3 — Ordem e aba default

**CC8 — Ordem das abas.**

- Opções: (a) por acoplamento/acesso: **Contratos · Financeiro · Aprovações ·
  Embarque** (as duas de gestão primeiro, as duas operacionais depois; também "o
  que já existe" primeiro); (b) cronológica do ciclo do contrato (Contratos ·
  Aprovações · Embarque · Financeiro).
- **Proposta:** **(a) Contratos · Financeiro · Aprovações · Embarque.**
- DECISÃO: ✅ **Contratos · Financeiro · Aprovações · Embarque** (2026-07-09).

**CC9 — Aba default.**

- **Proposta:** default = **Contratos** (primeira aba visível ao papel). No alvo,
  papéis que não veem Contratos caem na primeira aba que podem ver
  (ex.: Aprovações). Em F1, sempre Contratos (só ADMIN+COMMERCIAL entram).
- DECISÃO: ✅ **default = Contratos** (primeira aba visível ao papel) (2026-07-09).

### Bloco 4 — Navegação unificada

**CC10 — Item de nav único.**

- Contexto: hoje são dois itens (Contratos + Financeiro) na sidebar e no avatar
  menu. Financeiro vira aba.
- **Proposta:** **um único item** que leva ao hub, com **rótulo por papel** (CC15):
  em **F1** = "Contratos", gate ADMIN+COMMERCIAL. Remove o `FINANCEIRO_NAV_ITEM`.
  Corrige o bug do avatar (2.4): usar `CONTRATOS_ROLES` no `HeaderAvatarMenu` em vez
  de `isAdmin`, para o COMMERCIAL ver no mobile também. No alvo (**F2+**), o gate
  alarga para não-PROSPECTOR e o rótulo vira "Embarques" para os operacionais.
- DECISÃO: ✅ **um item único**; F1 = "Contratos" (ADMIN+COMMERCIAL), remove o item
  "Financeiro", corrige o bug do avatar; F2 = rótulo por papel (CC15) (2026-07-09).

**CC11 — Entrada no mobile.**

- Contexto: hoje Contratos/Financeiro só aparecem no **menu do avatar** no mobile
  (tabbar não tem slot).
- **Proposta:** manter no **menu do avatar** (um item "Contratos") em F1 — sem mexer
  na tabbar. Reavaliar se a página ganhar público operacional (F2+).
- DECISÃO: ✅ **manter no menu do avatar**; tabbar intacta em F1 (2026-07-09).

### Bloco 5 — Abas vazias nesta fase

**CC12 — O que Aprovações e Embarque renderizam em F1.**

- **Proposta:** placeholder padronizado ("Em breve" / "Em construção"), no molde de
  estado vazio do design-system, sem nenhuma lógica, endpoint ou campo novo. Só a
  aba existir na barra e o painel exibir o placeholder.
- DECISÃO: ✅ **placeholder "em breve"** (estado vazio do design-system), zero
  lógica/endpoint/campo (2026-07-09).

### Bloco 6 — Migração / alinhamento de docs

**CC13 — Autoridade documental pós-unificação.**

- **Proposta:**
  - **Este doc** = autoridade da **casca** (página, abas, URL, matriz de acesso,
    navegação).
  - `Contratos-Plano-de-Trabalho.md` = segue dono da lógica de Contratos **e**
    Financeiro (é seção lá). Atualizar a seção "Navegação/roteamento": Contratos e
    Financeiro agora são **abas** do hub, não rotas standalone; `/financeiro`
    redireciona.
  - `Aprovacoes-Plano-de-Trabalho.md` / `Embarque-Plano-de-Trabalho.md` = seguem
    donos da lógica; anotar que ganharão uma **aba** no hub (conteúdo TBD, F2+); o
    aviso do doc de Embarque sobre "revalidar após a mudança nas páginas" aponta
    para cá.
  - `Dashboard-Visao-Geral.md` = card de Eventos segue como está;
    anotar a relação hub × card (a decidir em CC7).
  - `Auditoria-Navegacao-por-Papel.md` = **atualizar** (rota `/contratos` = hub;
    `/financeiro` redireciona; corrigir o ADMIN-only stale; refletir o item de nav
    único).
  - `README.md` = adicionar este doc ao índice **(feito nesta sessão)**.
- DECISÃO: ✅ conforme proposto — este doc = casca; na F1 atualizar Contratos (seção
  nav), Auditoria e README; anotar Aprovações/Embarque/Eventos (2026-07-09).

### Bloco 7 — Fases de implementação

**CC14 — Recorte de fases.**

- **Proposta:**
  - **F1 (esta sessão, após decisões):** casca `/contratos` com 4 abas (`?tab=`);
    Contratos e Financeiro migrados para abas; `/financeiro` → redirect; Aprovações
    - Embarque = placeholder; item de nav único (remove Financeiro, corrige bug do
      avatar); acesso inalterado (ADMIN+COMMERCIAL); atualização dos docs de casca
      (este + Contratos nav + Auditoria + README). **Sem mudança de backend.**
  - **F2+ (futuras, cada uma com seu ciclo):** conteúdo da aba Aprovações; conteúdo
    da aba Embarque; abertura de acesso por papel (matriz alvo, CC6); resolução das
    portas redundantes (CC7); revisão do rótulo (CC2).
- DECISÃO: ✅ recorte **F1 / F2+** conforme proposto (2026-07-09).

---

## 5. Riscos e questões em aberto (futuras)

- **R1 — Superfície nova para features de dashboard.** Dar página a
  Aprovações/Embarque muda a premissa de design delas (hoje são atalho/modal).
  O **conteúdo** dessas abas precisa ser desenhado do zero (o que a aba mostra:
  fila de lembretes? histórico de envios? ponto de geração?). Fora do escopo de F1.
- **R2 — Redundância de portas** (CC7): aba × dashboard × `/samples`.
- **R3 — Rótulo vs público** (CC2): "Contratos" pode não servir a papéis
  operacionais.
- **R4 — Card de Eventos do dashboard** segue sendo o agregador atual dos 4 tipos;
  decidir se o hub o complementa ou compete (ligado a CC7/R2).

### 5.1 Gargalos de implementação da F1 (registro; a tratar quando for implementar)

- **G1 — Extrair a página de Contratos (842 L) sem regressão.** Hoje cada página tem
  seu próprio `<AppShell>`, guard `useRequireAuth`, `<Suspense>` e tratamento de
  `?details=`. Fundir = **um** `<AppShell>`, **um** guard (união = ADMIN+COMMERCIAL),
  **um** `<Suspense>`; o conteúdo de cada `page.tsx` vira um componente de painel. O
  painel de Contratos carrega o grosso (FAB radial, modais de emissão e Detalhes,
  deep-link `?details=`). É o maior esforço da F1.
- **G2 — `?tab=` + `?details=` coexistindo.** `?tab=` dirige o painel ativo;
  `?details=<id>` implica `tab=contratos` e abre o modal de Detalhes. Garantir que os
  deep links atuais (dashboard "Ver contrato", notificações) continuem abrindo certo.
- **G3 — Redirect do `/financeiro`.** `/financeiro` → `/contratos?tab=financeiro`,
  preservando query se houver; conferir o cache do service worker/PWA da rota antiga.
- **G4 — Carregamento por aba (lazy).** Cada painel só busca seus dados quando a aba
  está ativa — evita disparar endpoints à toa e já deixa pronta a regra da F2 (papel
  operacional nunca dispara Contratos/Financeiro, que dão 403).
- **G5 — Navegação.** Remover `FINANCEIRO_NAV_ITEM`; no `HeaderAvatarMenu` trocar
  `isAdmin` por `CONTRATOS_ROLES` (corrige o bug de 2.4); deixar um item de nav só.
- **G6 — Escopo de commit + gates.** Working tree com outro agente em paralelo →
  commitar **só** os arquivos desta feature (`git add` seletivo, nunca `-A`). Rodar
  lint/format/typecheck/build + testes; validar no device (nada é ✅ sem validação).

## 6. Pendências

- ✅ Decisões da F1 tomadas e registradas (CC1–CC15; CC7 adiada de propósito).
- ✅ **F1 implementada** (2026-07-09, commits `f420e01`/`d07526a`/`2829dd6` + docs):
  C1 casca do hub + `ContratosPanel` + placeholders; C2 `FinanceiroPanel` + redirect
  do `/financeiro`; C3 nav unificada (remove o item Financeiro, corrige o gate do
  avatar `isAdmin`→`CONTRATOS_ROLES`); C4 alinhamento dos docs. **Sem backend.**
  Gates typecheck/eslint/prettier/build verdes.
- ⬜ **Validar no device** (nada é ✅ sem validação) — em especial a barra de abas
  sobre o hero verde no mobile e o hero verde herdado pela aba Financeiro.
- ⬜ **F2+** (futuro): conteúdo das abas Aprovações e Embarque + abertura de acesso a
  papéis operacionais (CC6/CC15) + rótulo por papel (CC2/CC15) + portas redundantes
  (CC7).

## 7. Manutenção

Documento de trabalho da unificação. Referencia o código
(`app/contratos`, `app/financeiro`, `app/cadastros`, `lib/roles.ts`,
`components/AppShell.tsx`) e os docs das 4 features em vez de duplicar a lógica
interna delas. Listado no índice `docs/README.md`.
