# Revisão Geral do App — Plano de Trabalho

> **Escopo:** revisão completa do app, **página por página e por tipo de
> usuário** — funcionamento, papéis, código morto, gargalos, design/layout,
> testes e documentação.
> **Objetivo:** confiança de que tudo funciona corretamente; app limpo (sem
> código morto), papéis bem divididos, documentação viva e design consistente.
> **Execução:** ciclo completo por página (análise → decisões → implementação →
> validação no device) seguindo o **Roteiro Padrão (R1–R8)** deste documento.
> Análise e perguntas sempre em **plan mode**; implementação só após aprovação.
> Push e deploy são do usuário.

## Como usar este documento (qualquer sessão)

1. Ler o **Status geral** e identificar a página em andamento (ou a próxima ⬜).
2. Executar o **Roteiro Padrão (R1–R8)** naquela página, na ordem.
3. Registrar tudo na **seção da página** (achados, decisões, resumo) e
   atualizar o Status geral.
4. Só marcar ✅ depois que o Flavio validar no device.
5. Decisões/pendências que valem pro app inteiro vão em **Decisões globais /
   Pendências globais**; cada sessão de trabalho ganha uma entrada `Sn` no
   **Histórico de sessões**.

> ⚠️ Referências `arquivo:linha` neste documento são **âncoras por símbolo** —
> os números deslocam conforme os arquivos mudam. **Sempre `grep` pelo símbolo
> antes de editar.**

## Convenções de numeração

- **Dn** — decisão travada com o usuário (globais neste doc; as específicas de
  página ficam na seção da página, com prefixo: `DSH-D1`).
- **Pn** — pendência (idem: globais sem prefixo, de página com prefixo).
- **Sn** — sessão de trabalho (registro cronológico, no fim do doc).
- **Achados por página:** `<CÓDIGO>-<TEMA><n>`, onde TEMA é:
  - **B** bug · **G** gargalo · **M** código morto · **I** inconsistência ·
    **A** acessibilidade · **L** layout/design · **T** lacuna de teste ·
    **DOC** documentação desatualizada/faltante.
  - Ex.: `DSH-B1` (bug no dashboard), `LOT-M3` (código morto na lista de lotes).
- Achados refutados ficam registrados como **❌ falso-positivo — não
  reinvestigar** (evita retrabalho em sessões futuras).

## Status geral

Legenda: ⬜ pendente · 🔎 em análise · 🛠 em implementação · 📱 aguardando
validação no device · ✅ concluída.

| #   | Código | Página             | Rota                                                                          | Status | Sessões | Resumo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------ | ------------------ | ----------------------------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | LOG    | Login              | `/login` (+ `/forgot-password`)                                               | ✅     | S3      | 16 achados corrigidos (incl. 3 bugs de persistência no auth), endurecimento do reset, 3 suítes de teste novas, teia de docs sincronizada; validada no device 2026-07-07                                                                                                                                                                                                                                                                                                                                                                                             |
| 2   | DSH    | Dashboard          | `/dashboard` (twins mobile/desktop + dashboard do PROSPECTOR)                 | 📱     | S4–S7   | 19 achados + decisões D2–D6: dashboard único; "Vendas e perdas" e pulso removidos; cards novos "Últimos envios" (endpoint recent-sends) e "Eventos" (calendário F0, coluna direita inteira — INCOMPLETO, ver P6); validar tudo no device                                                                                                                                                                                                                                                                                                                            |
| 3   | LOT    | Lotes (lista)      | `/samples`                                                                    | 📱     | S8      | Deferidos resolvidos (CSS legado −594 linhas, testes do reducer+filtros) + decisões D1–D4 (uniforme, PROSPECTOR fora do service, copy "lote", vazio único) + erro de carregamento visível, portais, a11y; 10 commits                                                                                                                                                                                                                                                                                                                                                |
| 4   | LNW    | Novo lote          | modal do leque "+" (rota `/samples/new` removida — LNW-D1)                    | 📱     | S9      | Rota wrapper removida + decisões D1–D4 (copy "lote", receivedChannel fora do front, editou = manual) + hardening da API do número fixo, CSS nsv2 órfão −299, press/reduced-motion/contraste/44px, drop-up da safra, 17 testes; 8 commits                                                                                                                                                                                                                                                                                                                            |
| 5   | LDT    | Detalhe do lote    | `/samples/[sampleId]`                                                         | 📱     | S11     | Uniforme pros 5 papéis (D1) + decisões D2–D4 (copy "lote"/"Deletar", revalidação, endurecer foto); **endurece endpoint de foto (auth)** + revalidação silenciosa + código morto −254 + CSS sdv-\* órfão −1435 + acentos/plural + press/reduced-motion/contraste/44px/a11y; 8 commits                                                                                                                                                                                                                                                                                |
| 6   | CAM    | Câmera / Scanner   | CameraSheet global (rota `/camera` REMOVIDA na S13)                           | 📱     | S12–S15 | S12 = conferência (20 achados: foto errada via token stale, ESC conflitante, back furando o sheet, cap 200 no lookup, magic bytes, ~930 linhas CSS órfão). S13 = CAM-P3: câmera virou BOTTOM SHEET global parcial aberto por ícone no header de todas as páginas; tabbar com 4 itens; desktop sem classificar por foto; rota 404. S14 = Ciclo da Extração Rodada 1 (EXT1–EXT13), validada no device 2026-07-20. S15 = Ciclo da Classificação Rodada 2 (FIN1–FIN16): tipo+classificadores viraram UMA etapa do sheet, foto sai da revisão, reclassificação reimprime |
| 7   | CLI    | Clientes (lista)   | `/clients`                                                                    | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8   | CDT    | Detalhe do cliente | `/clients/[clientId]`                                                         | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 9   | CTR    | Contratos          | `/contratos`                                                                  | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | FIN    | Financeiro         | `/financeiro`                                                                 | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11  | CAD    | Cadastros          | `/cadastros`                                                                  | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12  | REL    | Relatórios         | `/informe` (+ redirect `/resumo`)                                             | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 13  | USR    | Usuários           | `/users`                                                                      | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 14  | PRF    | Perfil             | `/profile` (+ redirect `/settings`)                                           | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 15  | AUX    | Auxiliares         | `/laudo/[token]` (público), `/offline`, `/maintenance`, redirects `/` e afins | ⬜     | —       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

A ordem segue o **fluxo operacional** de uso do app (D2). A revisão de cada
página cobre também a **cadeia de backend** que ela consome (D6) e os **6
papéis** de uma vez (D5): ADMIN, CLASSIFIER, REGISTRATION, COMMERCIAL,
PROSPECTOR, CADASTRO (fonte: `lib/roles.ts` + `docs/Auditoria-Navegacao-por-Papel.md`).

## Roteiro Padrão por página (R1–R8)

O passo a passo canônico. Toda página passa pelas 8 etapas, na ordem. R1–R6 são
análise (**plan mode**, com perguntas ao usuário); R7–R8 são execução e
fechamento.

### R1 — Levantamento (plan mode)

Montar o **mapa da página** e registrá-lo na seção dela:

- Componentes usados (de `components/`) e hooks/estados relevantes.
- Cadeia de dados completa: função em `lib/api-client.ts` → rota
  `app/api/v1/...` → registro em `src/api/v1/backend-api.js` → service/query em
  `src/...` → tabelas.
- Papéis com acesso e onde estão os gates (3 camadas: `middleware.ts` →
  `useRequireAuth({ allowedRoles })` na página → gates de backend).
- **Docs e skills relacionados** (lista explícita — vira o insumo do R6).
- Blocos de CSS da página no `app/globals.css` (classes/prefixos e volume).

### R2 — Comportamento por papel (plan mode)

- Montar a **matriz papel × (vê / faz / bloqueado)** da página, citando
  `lib/roles.ts` e `docs/Auditoria-Navegacao-por-Papel.md`.
- **Perguntar ao usuário** o comportamento esperado para cada papel (o que
  deveria aparecer, o que não deveria, ações permitidas). Perguntas e respostas
  viram decisões `<CÓDIGO>-Dn` na seção da página.
- Divergência entre comportamento atual e decidido vira achado (`B` ou `I`).

### R3 — Fluxos

Exercitar cada ação da página ponta a ponta (por leitura de código e, quando
preciso, rodando o app):

- Happy path, estados de **carregando / vazio / erro**, cancelamento,
  concorrência (duplo clique, refetch), deep links e query params.
- Comportamento offline/PWA quando aplicável (service worker, fila offline).
- Consistência do backend da cadeia (validações, códigos de erro, autorização
  por papel no backend — não só na UI).

### R4 — Código morto & inconsistências

- **knip** focado nos arquivos da página + verificação manual de todo achado
  (falso-positivos existem — ex.: código chamado por string).
- Grep manual: componentes/exports órfãos, rotas API sem consumidor, props
  mortas, estados nunca lidos.
- **CSS da página classe a classe** (`grep` por cada classe antes de remover) —
  **NUNCA deletar por faixa de linhas**: há classes vivas interleavadas
  (precedente: prospector × dashboard).
- Duplicações e desvios do padrão do projeto (nomenclatura, estrutura).

### R5 — Design & layout

- Conferir **mobile (320–430px)** e **desktop (≥901px)** contra as skills:
  `design-system`, `responsive`, `modals`, `feedback-messages`,
  `button-press-effect`.
- Acessibilidade básica: aria/labels, foco visível, navegação por teclado,
  contraste.
- Desvios viram achados `L`/`A`; decisões novas de design viram `Dn` **e
  atualizam a skill correspondente** (acelera as próximas páginas).

### R6 — Documentação (a teia)

- Conferir cada doc da lista do R1: **atualizar** o desatualizado, **propor
  obsolescência** (mover para `docs/archive/` — só com aprovação), **criar** o
  que falta.
- Manter `docs/README.md` indexado (regra 6 do índice: todo `.md` novo em
  `docs/` entra no índice no mesmo commit ou no seguinte).
- Atualizar as **skills** afetadas pelas decisões da página.
- Achados de documentação = `<CÓDIGO>-DOCn`.

### R7 — Implementação

- Sair do plan mode só com o pacote de mudanças aprovado.
- Commits **atômicos temáticos** (`tipo(escopo): descrição`), com `git add`
  seletivo.
- **Lacunas de teste críticas** (regra de negócio, fluxo de dados, gate de
  papel) ganham teste **no próprio ciclo** (D7); menores ficam catalogadas como
  `T`.
- Gates completos antes de encerrar: `lint`, `format:check`, `typecheck`,
  `build`, `test:unit` e `test:integration:db` quando tocar backend.

### R8 — Registro & validação

- Atualizar a **seção da página** (mapa, matriz, achados com status, decisões,
  resumo do que foi feito, commits, pendências deixadas) e o **Status geral**.
- Registrar a sessão (`Sn`).
- Rodar o checklist da skill `skill-maintenance` se código mudou.
- Entregar para o **usuário validar no device** → status 📱. A página só ganha
  ✅ com a validação dele.

## Regras operacionais

1. Análise e perguntas em **plan mode**; implementação só após aprovação do
   usuário. Nada é "decidido" sem confirmação explícita dele.
2. Ciclo **completo por página** (D1): não abrir a próxima página com a atual
   em 🛠/📱 — exceção: bug grave achado fora da página em revisão pode ser
   corrigido na hora, com registro na seção da página dona do bug.
3. Achado **refutado** é registrado como ❌ falso-positivo para não ser
   reinvestigado.
4. `globals.css`: só remoção **classe a classe** durante as páginas (D4); a
   decisão de dividir o arquivo fica para a FF2.
5. Nunca editar migrations existentes; o event store (`SampleEvent`) é
   append-only; uploads validam magic bytes.
6. Push e deploy são **sempre do usuário**; commits podem acumular em `main`.
7. Toda mudança que altere algo documentado numa skill atualiza a skill no
   mesmo commit ou no seguinte (regra do CLAUDE.md).

## Fases globais

| Fase    | Tema                                                                                                                | Status            |
| ------- | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **F0**  | Fundação: este documento + índice no README + instalar **knip** (devDependency) + varredura-baseline repo-wide      | ✅ concluída (S2) |
| F1–F15  | Páginas na ordem do Status geral (cada uma = R1–R8)                                                                 | ⬜                |
| **FF1** | Varredura final repo-wide: knip completo, `scripts/`, assets, dependências não usadas, docs órfãos                  | ⬜                |
| **FF2** | Organização de pastas/arquivos: análise + proposta (inclui a decisão do split do `globals.css`, hoje ~35,4k linhas) | ⬜                |
| **FF3** | Consolidação da documentação: README, skills e a teia completa revisada                                             | ⬜                |

**F0 — baseline (executada na S2):** knip instalado (config em `knip.json`;
rodar com `npx knip`). Removidos após verificação manual: 4 componentes órfãos
(`ClientCompleteChecklist`, `ClientUnitSelect`, `StatusBadge`,
`UserAvatarStack`), o barrel morto `src/reports/index.js` e a devDependency
`typescript-eslint` (sem nenhuma referência). Falsos-positivos documentados em
`ignoreDependencies` do `knip.json`: `c8` (coverage manual, skill `tests`) e
`eslint-config-next` (usado via string `compat.extends('next/core-web-vitals')`
no `eslint.config.mjs`). O restante do relatório (exports/tipos sem uso) virou
a pendência P2. A varredura fina por página acontece no R4 de cada uma.

## Registro por página

Cada página ganha o conteúdo abaixo quando entra em análise (copiar o
template). Até lá, fica só o stub.

**Template:**

```
### <Página> (<CÓDIGO>) — <status>

**Mapa (R1):** componentes · cadeia de dados · gates · docs/skills relacionados · CSS
**Matriz por papel (R2):** tabela papel × vê/faz/bloqueado + decisões <CÓDIGO>-Dn
**Achados:** lista numerada <CÓDIGO>-<TEMA><n> com status (✅ corrigido / ⏳ aberto / ❌ falso-positivo)
**Resumo do que foi feito:** commits + o que mudou
**Pendências:** <CÓDIGO>-Pn deixadas para depois
```

### Login (LOG) — ✅ concluída (S3, 2026-07-06; validada no device 2026-07-07)

**Mapa (R1):** `app/login/page.tsx` (+ `/forgot-password` = redirect →
`/login?modal=forgot-password`) · `components/ForgotPasswordModal.tsx` (3
passos: request → verify-code → reset; focus-trap) · `lib/api-client.ts`
(login/logout/getCurrentSession + 3 funções do reset) → rotas
`app/api/v1/auth/*` → `src/api/v1/backend-api.js` →
`DatabaseAuthService`/`UserService` · cookie `rastreio_session` = o próprio JWT
HS256, TTL 30d, httpOnly/SameSite=Lax/secure auto · rate limit 10/60s por IP
(login + 3 rotas do reset) · lockout 8 tentativas/5min · código de reset 6
dígitos sha256, TTL 15min, 5 tentativas · PWA: a casca abre offline, o POST de
login não (SW ignora `/api`) · CSS `login-*`/`login-modal-*` ~900 linhas, sem
classes órfãs.

**Matriz por papel (R2):** página neutra por papel — os 6 papéis veem o mesmo
formulário e caem em `/dashboard`; o papel só vale nos gates seguintes
(middleware P1 do PROSPECTOR, guards de página, allowlist de API). Modo
manutenção: login liberado; não-ADMIN cai em `/maintenance` depois. O fluxo de
senha inicial (manter/trocar) vive no AppShell pós-login → entra no ciclo DSH.

**Decisões:**

- **LOG-D1** — erro de credenciais **limpa o campo senha** (a mensagem aparece
  no placeholder; padrão erro-no-campo preservado).
- **LOG-D2** — `?reason=session-expired|session-ended` vira **aviso
  informativo** acima do formulário; param removido da URL após lido.
- **LOG-D3** — cadeia da rota órfã `POST /auth/session/expired` **removida por
  inteiro** (o registro server-side `markSessionExpiredIfNeeded` fica).
- **LOG-D4** — **rate limit HTTP** por IP nas 3 rotas de forgot-password +
  **resposta unificada anti-enumeração** no verify/reset.

**Achados (todos ✅ corrigidos):**

- **LOG-B1** — mensagem de erro invisível com campos preenchidos (vivia só no
  placeholder) → senha esvaziada no erro (`5c50b90`).
- **LOG-B2** — `?reason=` produzido por 3 call sites e ignorado pela página →
  aviso implementado (`5c50b90`).
- **LOG-B3** — revogação + audit de sessão expirada eram **revertidos** pelo
  rollback do throw dentro da transação (`8a0aa56`).
- **LOG-B4** — **lockout de login nunca armava**: incremento de
  `failedLoginAttempts` + audit `LOGIN_FAILED` revertidos pelo mesmo padrão de
  rollback (`8a0aa56`). Descoberto pelos testes novos.
- **LOG-B5** — limite de 5 tentativas do código de reset idem (`8a0aa56`).
- **LOG-I1** — anti-enumeração assimétrica (verify/reset revelavam o e-mail) →
  422 `INVALID_CODE` unificado (`4709560`).
- **LOG-M1** — rota `POST /auth/session/expired` órfã → cadeia removida
  (`e7b26e7`).
- **LOG-M2** — `normalizeUserStatus` órfão → removido (`e7b26e7`).
- **LOG-M3** — PNGs órfãos (`login-coffee-beans`, `dashboard-coffee-cup`) +
  entradas stale no middleware → removidos; over-exports de auth viram
  privados (`e7b26e7`).
- **LOG-A1** — erro sem `aria-live`/`aria-invalid` → região polite +
  `aria-invalid` (`5c50b90`).
- **LOG-A2** — `prefers-reduced-motion` não cobria o login (grãos em loop
  infinito etc.) → bloco novo (`5dcc10d`).
- **LOG-L1** — `.login-modal-close` mudava **cor** no `:active` + hover sem
  gate → corrigido (`5dcc10d`).
- **LOG-L2** — hovers desktop fora de `(hover: hover)` → gated,
  `:focus-visible` preservado (`5dcc10d`).
- **LOG-T1/T2** — zero testes no reset e no `DatabaseAuthService` → 2 suítes
  de integração + 1 unit de wiring (`1e7f39a`).
- **LOG-DOC1–6** — TTL "7d"→30d (SECURITY-audit), 4→6 roles
  (threat-model + SECURITY), `verify-code` documentado, `session/expired`
  removido do doc, `/forgot-password`=redirect→modal, skill responsive
  (`.login-card-submit`→`.login-submit-btn`) (`d0fc4da`).
- ❌ **Falso-positivos** (não reinvestigar): exports de auth apontados pelo
  knip estavam vivos (uso interno; viraram privados); CSS do login sem classes
  órfãs; `PasswordReset*Response` são usados no api-client.

**Resumo:** 7 commits — `5c50b90` (UX/a11y), `5dcc10d` (CSS interação/motion),
`e7b26e7` (código morto), `4709560` (endurecimento reset), `8a0aa56` (bugs de
persistência), `1e7f39a` (testes), `d0fc4da` (docs). Gates verdes (unit 357 /
integração 392 / build / typecheck / lint / format).

**Pendências:**

- **LOG-P1** — testes de UI da página/modal (gate "já logado", `?modal`, OTP
  paste/backspace).
- **LOG-P2** — testes do middleware (M1 manutenção, P1 PROSPECTOR).
- **LOG-P3** — teste e2e do rate limit do login na rota HTTP.
- **LOG-P4** — CSRF: sem token; mitigação atual = SameSite=Lax + httpOnly +
  same-origin (aceito; revisar se surgirem POSTs cross-site).
- **LOG-P5** — over-exports de `lib/types.ts` aceitos (dicionário de tipos).

**Validação no device (Flavio):** ✅ validada em 2026-07-07 — login com senha
errada (mensagem no campo senha, que esvazia) · expirar/encerrar sessão →
aviso no login · fluxo completo do esqueci-a-senha · visual mobile + desktop.

### Dashboard (DSH) — consolidado em docs próprios (2026-07-12)

> O ciclo DSH desta revisão foi **consolidado em dois documentos canônicos**:
> **`docs/Dashboard-Visao-Geral.md`** (funcionamento atual — fluxo, layout
> desktop/mobile, disponibilidade por papel, rotas de API e regras) e
> **`docs/Dashboard-Plano-de-Trabalho.md`** (backlog e próximas mudanças do
> check-up do dashboard). As decisões DSH-D1–D6, achados e pendências deste
> ciclo foram absorvidos por esses docs; o histórico completo permanece no Git
> (bloco enxugado em 2026-07-12, decisão DSB-D1). Para tudo do dashboard,
> consulte os dois documentos acima.

### Lotes — lista (LOT) — 📱 aguardando validação no device (S8, 2026-07-07)

> Contexto prévio: a lista já passou por revisão faseada própria em
> `docs/Revisao-Pagina-Lotes-Plano-de-Trabalho.md` (29 achados, fases 1–6
> implementadas e EM PROD). Este ciclo **não repetiu** aquilo: resolveu os
> deferidos (CSS legado, testes) e cobriu papéis + design/a11y + docs.

**Mapa (R1):** `app/samples/page.tsx` (~2.5k linhas; um render responsivo —
desktop muda scroll container/filtros via `isDesktop`+CSS) · componentes:
`SampleCard`, `SampleCreateRadialFab` (leque + com Lote/Liga/Aprovação),
`SelectionModeHeader`/`SelectedSamplesDropdown` (modo Liga),
`ClassificationFilterField`, `ClientLookupField`, modais
(NewSample/Movement/SendFlow/BlendConfirmation/ApprovalLabel) · dados:
`listSamples` (cursor keyset `internalLotNumberInt DESC NULLS LAST, id ASC`,
LIMIT 30, D1 sem COUNT no load-more) + `listClassificationValues`; deep link
`?displayStatus=OPEN|SOLD|LOST`; snapshot em sessionStorage (TTL 30min) ·
gates: `useRequireAuth({allowedRoles: NON_PROSPECTOR_ROLES})` + middleware +
backend (`resolveActorContext` + `USER_ACTION_ROLES` nos commands) · CSS
vivo: `spv2-*` (227), `samples-filter-*` (138), `samples-page-v2` (116),
`hero-search*` (93), `fab-fan*` (41, compartilhado).

**Matriz por papel (R2):** os 5 papéis não-PROSPECTOR veem a mesma lista e
fazem as mesmas ações; PROSPECTOR bloqueado nas 3 camadas.

**Decisões:**

- **LOT-D1** — página uniforme confirmada: os 5 papéis fazem TODAS as ações
  (criar lote/liga/aprovação, enviar, perda). UI e backend simétricos.
- **LOT-D2** — endurecimento: **PROSPECTOR removido de `USER_ACTION_ROLES`**
  (segunda barreira no service, além da allowlist central; neutro hoje).
- **LOT-D3** — vocabulário da página padronizado pra **"lote"** (exceção por
  página registrada na skill feedback-messages; o restante do app segue
  "amostra" até os seus ciclos).
- **LOT-D4** — estado vazio segue com **mensagem única** (não distinguir
  "sem dados" × "busca sem resultado").

**Achados:**

- **LOT-M1** ✅ — bloco legado `.samples-page-*` (deferido da revisão
  faseada): 84 blocos 100% órfãos removidos por parser de seletor, famílias
  vizinhas intactas por contagem; −594 linhas (`6080815`). `.records-*`
  aparentam 0 usos → nota pro ciclo CLI.
- **LOT-B1** ✅ [ALTA] — falha de carregamento era silenciosa (error nunca
  renderizava; vazio enganoso "Nenhuma amostra encontrada") → banner
  `.spv2-error-banner` no vazio-com-erro e no fim da lista no load-more
  (`3b45102`).
- **LOT-L4** ✅ — "Carregando..." → 3 skeleton cards no load inicial
  (`3b45102`).
- **LOT-L3** ✅ (parcial) — vazio px→clamp + tons AA; distinção de vazios
  descartada por decisão D4 (`3b45102`).
- **LOT-L1** ✅ — hovers de background/box-shadow fora de `(hover:hover)` +
  background na transition (selection-counter, selection-header\_\_exit,
  card-action.is-detail) → gated (`4b3100b`).
- **LOT-L2** ✅ — modal de filtros e `SendMethodChooserModal` sem portal
  (pendência legacy da skill modals) → `createPortal` + guarda SSR
  (`87d0dd1`). Instância do /clients fica pro ciclo CLI.
- **LOT-A1** ✅ — `prefers-reduced-motion` não cobria as animações da página
  → bloco novo (entrances + expand/chevron; beneficia /clients, que reusa os
  keyframes) (`4b3100b`).
- **LOT-A2** ✅ — contraste sub-AA (`#aaa`≈2.3:1 no card-detail; `#bbb`/
  `#ccc` no vazio) → `#72766f`/`#6e6e6e`/`#767676` (`3b45102`/`4b3100b`) —
  **validar no device**.
- **LOT-A3** ✅ — busca sem nome acessível + acentos faltando → `aria-label`
  - "proprietário"/"Filtros avançados" (`4b3100b`).
- **LOT-R1** ✅ — header de seleção com botão sair 36px → alvo de toque 44px
  (`4b3100b`) — **validar no device**.
- **LOT-I1** ✅ — `USER_ACTION_ROLES` incluía PROSPECTOR (gate efetivo era
  só a allowlist — ponto único) → removido (D2) + suíte unit
  `sample-command-roles` (403 no service p/ create/blend/invalidate;
  operacionais passam) (`a505812`).
- **LOT-T1** ✅ — reducer extraído pra `lib/samples/samples-list-reducer.ts`
  - 6 testes unit (reset/success-initial/success-more/fetch-more/error/ação
    desconhecida); `allowImportingTsExtensions` no tsconfig pro
    strip-types (`2917953`).
- **LOT-T2/T3** ✅ — filtros de classificação (com canonização de entrada
  suja), `listClassificationValues` (422 em campo inválido), `isBlend` e
  `eligibleForBlend`/`committedSacks` cobertos em integração (`0fa7d38`).
- **LOT-L5** ⏳ — paleta de status do card em hex fora da paleta + 2 azuis
  próximos ("Em aberto" `#60a5fa` × "Enviar" `#2980b9`) → LOT-P1 (dívida de
  token; trocar = mudança visual).
- **LOT-DOC1–3** ✅ — README (status da revisão faseada), doc da revisão
  faseada (fase 3 EM PROD, M1/#7 resolvidos, decisão #4 superada anotada),
  Auditoria-Navegação (classificar roda em /camera) + skills modals/
  feedback-messages (`3685452`).
- ❌ **Falso-positivos herdados** (não reinvestigar): os 7 refutados + I1
  (PARTIALLY_SOLD = "Em aberto") da revisão faseada; API-e-Contratos do
  listSamples já estava atualizado; knip limpo pra página.

**Resumo:** 10 commits — `6080815` (CSS órfão), `3b45102`+`ace071c` (erro
visível/skeleton/copy/clamp), `4b3100b` (interação/a11y), `87d0dd1`
(portais), `a505812`+`4c655e8` (endurecimento de papel), `2917953`
(reducer+testes), `0fa7d38` (testes de filtros), `3685452` (docs/skills).
Gates verdes (lint / format / typecheck / schemas / build / unit 367 /
contracts 20 / integração 406 + re-seed).

**Pendências:**

- **LOT-P1** — paleta de status do card (hex fora da paleta, 2 azuis) —
  dívida de token.
- **LOT-P2** — satélites `.clients-page-v2 .spv2-footer/chip` +
  `.records-client-*`/`.records-mode-switch` (0 usos aparentes) + instância
  do modal de filtros do /clients sem portal → **ciclo CLI**.
- **LOT-P3** — fetch unificado do modo Liga sem teste automatizado (sem
  harness de componente; validado no device — herdado da revisão faseada).

**Validação no device (Flavio):** inclui os itens PENDENTES da revisão
faseada (fases 1/2/4/5: cenários do modo Liga, digitar na busca sem
re-render dos cards, scroll longo iOS PWA + restauração ao voltar do
detalhe, skeleton/teclado/leitor) + os novos: banner de erro (modo avião),
skeleton no load inicial, copy "lote" (vazios, contador "N lotes",
seleção), contraste um tom mais escuro (sacas/safra do card e vazio),
botão sair do modo Liga maior, modais de filtros/envio portalados, tap no
contador de seleção sem hover grudado.

**Achados PÓS-ciclo (S10, 2026-07-07 — relatados pelo Flavio em uso real):**

- **LOT-B2** ✅ [ALTA] — lista congelada em dados velhos: o snapshot de
  sessão restaurava e PULAVA o fetch de mount sem revalidação; voltar do
  detalhe ignorava o TTL pra sempre; sem listener de retorno do
  background — lote criado por outro usuário só aparecia num cold start.
  → snapshot virou só a primeira pintura (stale-while-revalidate): refetch
  SILENCIOSO no mount restaurado + `lib/use-list-revalidation.ts` (padrão
  do dashboard: visibilitychange/focus com throttle 30s + polling 60s
  visível), com guards de load em andamento e polling pausado no modo
  Liga (`a811f85`); mesmo fix no ClientsBrowser + logout limpa os 3
  snapshots de lista (`ee8d5ef`).
- **LOT-B3** ✅ [ALTA] — liga criada só com os selecionados VISÍVEIS na
  busca atual (seleção guardava só ids; sheet/dropdown/payload filtravam a
  lista visível; o contador mostrava o total) → seleção guarda o snapshot
  do lote (`lib/samples/blend-selection.ts`, Map + `reconcileSelection`) e
  todos os consumidores derivam dela; 5 testes unit (`5876b08`).

### Novo lote (LNW) — 📱 aguardando validação no device (S9, 2026-07-07)

> Escopo real: o fluxo de criação vive no **modal** `NewSampleModal`
> (BottomSheet do leque "+" de `/samples`) + `SampleCreatedSuccessModal` +
> `ClientQuickCreateModal` (stacked) + cadeia `createSample`. A rota
> `/samples/new` era só um wrapper sem entrypoint — removida neste ciclo.

**Mapa (R1):** `components/NewSampleModal.tsx` (form owner/sacks/safra/
número editável/data de chegada/origem/local/notas) · stacked:
`ClientQuickCreateModal` via `ClientLookupField` · sucesso:
`SampleCreatedSuccessModal` (central portalado, decisão 5.29: sem X) ·
backend: `POST /samples/create` (evento único `REGISTRATION_CONFIRMED`,
idempotência por `clientDraftId`→`sampleId` determinístico) +
`GET /samples/next-lot-number` · mecânica de modais CONFORME (sheet de
ação, stacked tier, confirms nas duas pontas da pegadinha §3, validação
inline canônica, fix do input date iOS).

**Decisões:**

- **LNW-D1** — rota `/samples/new` **removida** (criação só pelo leque).
- **LNW-D2** — vocabulário do fluxo padronizado pra **"lote"** ("Novo
  lote", "Criar lote", "Descartar lote?", "Lote criado", "Número do lote",
  "Criar outro") — estende LOT-D3.
- **LNW-D3** — conceito `receivedChannel` **removido do front** (schema +
  payload); backend mantém default `in_person` e o enum completo.
- **LNW-D4** — número manual: **qualquer edição no campo = manual**
  (`lotEditedRef`); digitar o número igual à sugestão agora FIXA o número
  (corrige a regeneração surpresa); vazio segue automático.

**Achados:**

- **LNW-M1** ✅ (D1) — wrapper `app/samples/new/page.tsx` + `isNewSample`
  do AppShell + exclusão no route-history + seletores stale do
  ViewportDebugOverlay removidos; dirty key renomeada pra `'novo-lote'`
  (`9602547`+`e4ed351`).
- **LNW-M2** ✅ — 19 classes `nsv2-*` órfãs (resíduo da página full-screen)
  removidas por parser de seletor com split de vírgulas preservando as
  vivas (−299 linhas); keyframes órfãs `nsv2-header-in`/`nsv2-form-card-in`
  saíram no commit 5 (`35e8ebe`).
- **LNW-M3** ✅ — re-export morto `CreateSampleResponse` removido (knip
  true-positive) (`35e8ebe`).
- **LNW-I1** ✅ — API parou de repassar `ownerUnitId` (o binding descarta
  desde a era "lote sem fazenda") (`35e8ebe`).
- **LNW-B1** ✅ [ALTA] — API aceitava `sampleLotNumber` cru SEM a flag,
  pulando `normalizeManualLotNumber` (colisão viraria 500) → só repassa
  com `lotNumberManual === true`; caminho direto do service preservado
  pra testes/imports (`74903ea`).
- **LNW-B2** ✅ (D4) — `lotNumberManual` por comparação de valor → por
  edição (`lotEditedRef` + campo não-vazio) (`74903ea`).
- **LNW-L1** ✅ (D2/D3) — copy "lote" nas ~10 strings + acentos sistêmicos
  no fluxo (NewSampleModal, ClientQuickCreateModal, ClientLookupField,
  success modal) + `receivedChannel` fora do form-schema/api-client
  (`2b6745d`).
- **LNW-L2** ✅ — press-effects: chips de safra, `nsv2-clear-btn`,
  `lookup-create-cta`, `client-lookup-option` (tap-highlight transparent,
  :active transform-only, hover gated) (`3a25e7f`).
- **LNW-A1** ✅ — bloco `prefers-reduced-motion` do fluxo: cascade dos
  campos, banner offline, check do sucesso (aparece completo via
  `stroke-dashoffset: 0`), pop do confirm e o **slide do `.bottom-sheet`
  (global — todos os sheets do app)** (`3a25e7f`).
- **LNW-A2** ✅ — contraste `.nsv2-field-label` `#aaa` (~2.3:1) → `#6f6f6f`
  (5.0:1) — **validar no device** (`3a25e7f`).
- **LNW-A3** ✅ — chips de safra com alvo de toque ≥44px no mobile
  (`3a25e7f`).
- **LNW-L3** ✅ — dropdown de safra clipava no fim do body rolável → mede o
  espaço no focus e abre PRA CIMA (`.is-drop-up`) quando não cabe
  (`3a25e7f`).
- **LNW-T1** ✅ — suíte nova `sample-create-validation.integration.test.js`
  (17 testes): limites 422, binding do dono (ausente/NOT_FOUND/INACTIVE/
  NOT_SELLER), idempotência (retry → 200 idempotent; INVALIDATED → 409),
  número manual (0/não-dígito/>7 → 422 no campo; colisão 409) e o
  hardening B1 na camada da API (`f2c571d`).
- **LNW-DOC1–4** ✅ — API-e-Contratos (POST create reescrito +
  next-lot-number), Produto-e-Fluxos §1 (sem foto de chegada, número
  editável, rota removida), Liga-Plano (notas: leque 3 opções, success
  headerless), Auditoria (rota fora das tabelas, no commit 1) + skills
  feedback-messages/modals/design-system (`ab9a822`).
- ❌ **Não-achado** (não reinvestigar): success modal sem X é a decisão
  5.29 documentada.

**Resumo:** 8 commits — `9602547`+`e4ed351` (rota), `35e8ebe` (código
morto), `74903ea` (manual/hardening), `2b6745d` (copy), `3a25e7f`
(interação/a11y), `f2c571d` (testes), `ab9a822` (docs). Gates verdes
(lint / format / typecheck / schemas / build / unit 367 / contracts 20 /
integração + re-seed).

**Pendências:**

- **LNW-P1** — banner offline `position: fixed` pode sobrepor o rodapé do
  sheet (só offline; conviveu até aqui).
- **LNW-P2** — tokens verdes fora da paleta no fluxo (`#5a8a54`, `#1d762c`,
  `#2E7D32`, `#1B5E20`) — dívida de token (irmã da LOT-P1).
- **LNW-P3** — dropdown de safra sem semântica combobox/listbox (é lista de
  botões; funcional, mas leitor de tela não anuncia como autocomplete).

**Validação no device (Flavio):** criar lote pelo leque (automático,
manual, e manual = sugestão — agora FIXA o número), copy nova ("Novo
lote"/"Criar lote"/"Descartar lote?"/"Lote criado"), acentos, quick-create
de proprietário no meio do fluxo, chips de safra (toque 44px + dropdown
perto do fim do form abrindo pra cima), rótulos um tom mais escuros,
reduced-motion (sheets sem slide, check completo), sucesso → detalhe /
"Criar outro".

### Detalhe do lote (LDT) — 📱 aguardando validação no device (S11, 2026-07-08)

**Mapa (R1):** `app/samples/[sampleId]/page.tsx` (componente único, era 4022
linhas) · satélites: `SampleMovementsPanel` (painel comercial **só leitura**),
`SampleSendFlow`, `BlendRevertModal`/`BlendHarvestPropagationModal`/
`SampleInvalidateBlockedModal`, `ClientLookupField`/`ClientQuickCreateModal`
(stacked), `PhotoZoomViewer`, `BlendBadge`/`RelatedSampleRow` · dados:
`getSampleDetail` (sample + attachments + events[preview] + movements +
components + activeBlends; timeline de envios por `listSampleEvents` separado)

- `getBlendFeasibility` · ações: editar registro/data, classificar/reclassificar/
  editar classificação (via `/camera` + cld-modal), imprimir QR, **Deletar**
  lote, cancelar movimentações, reverter liga, editar/cancelar envio · gates:
  `useRequireAuth({allowedRoles: NON_PROSPECTOR_ROLES})` + middleware +
  `resolveActorContext`/allowlist no backend · CSS `sdv-*`.

**Matriz por papel (R2):** os 5 papéis não-PROSPECTOR veem e fazem exatamente
o mesmo no detalhe; PROSPECTOR barrado nas 3 camadas (guard, middleware, API
403 via allowlist — inclusive `getSampleDetail` e a foto).

**Decisões:**

- **LDT-D1** — detalhe **uniforme** pros 5 papéis (confirmado; já era o estado,
  nenhum trabalho de papel).
- **LDT-D2** — vocabulário padronizado pra **"lote"** + conclui **"Deletar"**
  (era "Invalidar") + acentos (estende LOT-D3/LNW-D2).
- **LDT-D3** — **revalidação silenciosa** do detalhe (foreground + polling 60s).
- **LDT-D4** — **endurecer** o endpoint de foto (auth + Prisma compartilhado).

**Achados:**

- **LDT-B2** ✅ [ALTA] (D4) — `GET /photos/[attachmentId]` servia o binário SEM
  auth (só validava UUID) e abria um `PrismaClient` por request → método novo
  `getSampleAttachmentDescriptor` (resolveActorContext: 401/403 PROSPECTOR) +
  Prisma compartilhado; a rota mantém o guard de traversal (`382e69c`).
- **LDT-B3** ✅ (D3) — o detalhe não revalidava ao voltar do background →
  `useListRevalidation` (foreground throttle 30s + polling 60s), guards de
  modal aberto / status terminal (`0da6b5b`).
- **LDT-B1** ✅ — bug de plural "movimentacaooes" (concatenava
  "movimentacao"+"oes") → ternário pt-BR correto (`490fda8`).
- **LDT-M1** ✅ — fluxo de classificação legado órfão removido: modal
  "confirmar motivo da edição" **inatingível** + handler + fluxo de foto inline
  morto + ~10 símbolos de estado; −254 linhas (`af1e822`).
- **LDT-M2** ✅ — 71 classes `sdv-*` órfãs (layout pré-redesign: action-bar/QR/
  send/print/checklist/foto antigos) removidas por parser que ignora
  comentários/strings e trata a regra como morta se QUALQUER classe sdv exigida
  em profundidade-0 for órfã; invariante verificada (nenhuma classe VIVA perdeu
  regra-chave; `sdv-com-action-loss` reusada no /users preservada); −1435
  linhas (`0f88ff9`).
- **LDT-L1** ✅ (D2) — copy "lote" + "Deletar"/"Deletado" + acentos sistêmicos
  (page.tsx + SampleMovementsPanel), incluindo aria-labels e alts (`490fda8`).
- **LDT-L2** ✅ — `:hover` dos botões de ação (identity/edit/invalidate-btn)
  fora de `(hover:hover)`, 2 com background/color no hover → gated (`e05a34e`).
- **LDT-A1** ✅ — bloco `prefers-reduced-motion` do detalhe (entradas dos cards
  - o **pulse INFINITO** do imprimir-em-destaque + pop do X) (`e05a34e`).
- **LDT-A2** ✅ — contraste sub-AA → tons AA (#bbb/#b8b8b8→#6e6e6e; #aaa/#999→
  #6f6f6f) — **validar no device** (`e05a34e`).
- **LDT-A3** ✅ — alvo de toque: `.sdv-edit-btn` min-height 44px (era ~24-30px)
  e piso do `.sdv-identity-btn` 40→44px (`e05a34e`).
- **LDT-A4** ✅ — número do lote vira `<h1>` (heading real); focus trap nos 2
  modais que faltavam (edição de data, reclassificar); timeline com
  `role="list"`/`listitem` (`e05a34e`).
- **LDT-T1** ✅ — suíte de integração do endpoint de foto endurecido (401/403/
  200/404 + não-vazamento entre lotes) (`382e69c`).
- **LDT-DOC1–3** ✅ — Produto-e-Fluxos (detalhe "lote"/só leitura/"Deletar"),
  API-e-Contratos (foto exige sessão), Auditoria (LDT-D1) + skills
  feedback-messages/modals (`f551983`).
- ❌ **Não-achado** (não reinvestigar): o detalhe não mostra log de auditoria
  de edições — exibir é **feature nova**, fora da revisão.

**Resumo:** 8 commits — `382e69c` (endurece foto+teste), `0da6b5b`
(revalidação), `af1e822` (código morto −254), `0f88ff9` (CSS órfão −1435),
`490fda8` (copy/acentos/plural), `e05a34e` (press/reduced-motion/contraste/
toque/a11y), `f551983` (docs+skills), + registro. Gates verdes (lint / format /
typecheck / build / schemas / unit 372 / contracts 20 / integração + re-seed).

**Pendências:**

- **LDT-P1** — os ~8 modais do detalhe renderizam inline (sem `createPortal`);
  divergem do canônico mas sem bug ativo → passe dedicado.
- **LDT-P2** — arquivo grande (helpers/IIFEs candidatos a extração:
  `projectSendHistoryItems`, card de Classificação, cld-modal) → FF2.
- **LDT-P3** — GOTCHA do `nth-child`: as regras legadas
  `.sdv-general>.sdv-card:nth-child(2)/(n+3)` (feitas pro detalhe do CLIENTE)
  vazam pro detalhe do lote; ele se defende com overrides `.sdv-page--sample`.
  Corrigir na raiz toca o detalhe do cliente → **ciclo CDT**.

**Validação no device (Flavio):** abrir o detalhe (mobile+desktop); a foto da
classificação ainda carrega (endurecimento não quebra o `<img>`); copy "lote"/
"Deletar"/acentos; botões de ação com alvo maior e sem hover grudado;
reduced-motion (sem pulse infinito no imprimir); staleness (deixar o app no
detalhe → outro usuário classifica/vende/envia → voltar ao app atualiza;
parado atualiza em ≤60s); os 2 modais (data, reclassificar) com foco preso.

### Câmera / Scanner (CAM) — 📱 aguardando validação da Rodada 2 (S12–S15)

> Ciclo executado em 2026-07-16 (S12): conferência R1–R8 do fluxo AINDA como
> página, conforme a ordem acordada — a conversão em modal global (CAM-D1–D4)
> é fase posterior (CAM-P3). Escopo: fluxo e container; os 26 campos da ficha
> (`ClassificationReviewSheetBody`) pertencem ao ciclo da extração.

**Decisões pré-ciclo:**

- **CAM-D1 (EMENDADA na S13) — Câmera vira BOTTOM SHEET global
  (mobile-only).** A página `/camera` deixa de existir; o fluxo inteiro
  (scanner QR + captura + classificação) vive num **sheet PARCIAL** (molde
  `NewSampleModal`, sobe de baixo SEM ocupar a tela toda). Gatilhos:
  **ícone de câmera no HEADER de todas as páginas** (cluster
  `[câmera][avatar]` do `HeaderAvatarMenu` — correção do Flavio: é no
  header, NÃO na tabbar) e os botões Classificar/Reclassificar do detalhe
  do lote (`open({ sampleId })` — o contexto por prop substitui o
  `?sampleId=` da URL). **Decisão da S13: o slot central da câmera SAI da
  tabbar** (fica com 4 itens) — o header é o único gatilho global.
- **CAM-D2 — Desktop perde a classificação POR FOTO.** Sem modal de câmera no
  desktop (breakpoint canônico `(min-width: 901px)`): os botões
  "Classificar"/"Reclassificar" do detalhe somem no desktop. O **"Editar"
  permanece** (caminho 3 da `Classificacao-Visao-Geral.md` §1 — edição de
  campos sem câmera): corrigir uma classificação existente não obriga pegar o
  celular. Gate só de UI — backend continua por papel (device não é fronteira
  de segurança).
- **CAM-D3 — Rota `/camera` removida de vez (404).** Sem redirect; URLs
  antigas caem no not-found. O modal abre só pelos gatilhos da UI.
- **CAM-D4 — Voltar do Android fecha o modal.** O gesto/botão de voltar do
  sistema fecha o modal em vez de navegar (exige history entry ao abrir — a
  rota dava isso de graça, o modal precisa tratar).

- **CAM-D5 — Confirmar descarte do review (S12).** Cancelar/ESC/voltar com o
  review preenchido abrem "Descartar classificação?" antes de zerar; no
  preview (só a foto) o descarte segue imediato; estados de processamento
  seguem bloqueados.
- **CAM-D6 — Eventos de extração: emitir no início do ciclo da extração
  (S12).** O fluxo da câmera hoje NÃO grava `CLASSIFICATION_EXTRACTION_*` no
  event store (ver CAM-I2). Análise feita com o Flavio: o payload já registra
  os campos brutos da IA, o `COMPLETED` registra o final editado — o par
  bruto→corrigido + foto é a base de auditoria e treinamento da IA. Custo
  moderado (design em CAM-P1), valor composto; implementar como primeira
  tarefa do ciclo da extração pra não inchar o ciclo CAM.

**Ordem de execução acordada (2026-07-16):** conferência do fluxo ainda como
página (bugs corrigidos antes de mover código) → extração página→componente
sem mudança de comportamento (prop `sampleId?` + callbacks no lugar de
`useSearchParams`/`router.back()`) → montagem global do modal + troca dos
gatilhos + remoção da rota → gate desktop. A conferência CAM cobre **fluxo e
container, não os campos da ficha** — `ClassificationReviewSheetBody` e a
semântica dos 26 campos pertencem ao ciclo da extração (posterior).

**Mapa (R1):** `app/camera/page.tsx` (~1700 linhas, máquina de ~20 estados
`ClassificationFlowState`, Flow A sem contexto / Flow B `?sampleId=`) ·
12 modais `Classification*` + `SampleLookupResultModal` + `BottomSheet`
`camera-preview-sheet` (preview→processing→review via
`ClassificationReviewSheetBody`) · cadeia backend: `detect-form` /
`extract-and-prepare` (photoToken = arquivo `_temp/temp-{token}.jpg`, órfãos
limpos em 24h best-effort, consumido no confirm) / `classification/confirm`
(gates server-side: status 409, classifiers min 1, magic bytes) /
`resolve-by-qr` / `resolve-by-lot` / `users/lookup` · acoplamentos de shell:
`is-camera-route` (só `overflow:hidden`), topbar oculta, tabbar visível no
idle, theme-color bege `#fdf9ec` + `::before` de safe-area · docs:
`Classificacao-Visao-Geral.md` (mãe) + `Classificacao-Plano-de-Trabalho.md` ·
skills: modals (tabela da extração), design-system (tabbar), responsive.

**Matriz por papel (R2):** página exige `NON_PROSPECTOR_ROLES`
(`useRequireAuth`); backend espelha com `USER_ACTION_ROLES` (ADMIN,
CLASSIFIER, REGISTRATION, COMMERCIAL, CADASTRO) + allowlist default-deny do
PROSPECTOR (403 antes do service). Sem drift front↔back; os 5 papéis
operacionais têm o fluxo COMPLETO (acesso unificado 2026-07-15). PROSPECTOR:
único método da cadeia que alcança é `users/lookup` (allowlist).

**Achados:**

- **CAM-B1** ✅ — photoToken obsoleto anexava a FOTO ERRADA: `reset` não
  limpava `detectedPhotoToken` (temps vivem ~24h) → detect falhando na foto 2
  - "Continuar manual" salvava com a foto 1. Limpo no reset e na troca de foto.
- **CAM-B2** ✅ — ESC duplicado/conflitante: handler global da página + ESC
  interno dos modais (em `lot-mismatch`, um ESC disparava reset E
  `router.back()` juntos; em `confirming` furava o sheet não-dispensável).
  Handler global removido; `SampleLookupResultModal` ganhou ESC interno (e o
  `SampleSearchField` deixou de duplicar o keydown).
- **CAM-B3** ✅ — copy de sucesso errada na reclassificação do Flow A
  (`isReclassification` só olhava `contextSampleStatus`).
- **CAM-B4** ✅ — cap silencioso no lookup de usuários: limit chega string
  via query, `Number.isFinite("300")` = false → default 200. Coerção no
  `user-service` + 5 testes (`tests/user-lookup-limit.test.js`).
- **CAM-G1** ✅ — compressão (canvas 3072px) rodava à toa no
  continuar-sem-crop quando já havia token.
- **CAM-G2** ✅ — falha de validação no Continuar do classificador era
  invisível (estado não exibe `flowError`); agora volta pro review.
- **CAM-G3** ✅ — status do Flow B carregado no mount e nunca revalidado
  (corrida com outro operador pulava o portão de reclassificação
  client-side); Avançar refaz `getSampleDetail` e valida fresco.
- **CAM-G6** ✅ — voltar do Android furava o sheet bloqueado (popstate
  consumia a entry ANTES do dismiss; bloqueado = entry perdida → 2ª volta
  saía da página). Fix no `BottomSheet` (compartilhado): re-injeta a entry no
  popstate; cleanup ganha once-listener pro contador `pendingInternalBacks`
  não ficar envenenado (fechou por botão = próximo sheet engolia a 1ª volta).
- **CAM-I1** ✅ — magic bytes não validados no detect/extract (regra 5 do
  CLAUDE.md; buffer arbitrário ia pro sharp + OpenAI). Helper
  `assertImageMagicBytes` no `upload-policy` (dedup dos checks inline) +
  gates na entrada + testes (`tests/classification-photo-magic-bytes.test.js`).
- **CAM-I2** ✅ — eventos `CLASSIFICATION_EXTRACTION_*` não eram emitidos
  pelo fluxo da câmera. Resolvido na CAM-P1 (Ciclo da Extração — Rodada 1,
  2026-07-19): sidecar no extract + emissão no confirm. Ledger EXT no
  `Classificacao-Plano-de-Trabalho.md`.
- **CAM-I3** ✅ — 11 modais `Classification*` sem `createPortal` (skill
  modals §Portal é OBRIGATÓRIO); portalizados no molde do
  `SampleLookupResultModal`.
- **CAM-I4** ✅ — `SampleLookupResultModal` fora do padrão do fluxo: ganhou
  `.is-action` + ESC interno (era o único precursor manual do fluxo).
- **CAM-UX1** ✅ — descarte do review sem confirmação (CAM-D5): novo
  `ClassificationDiscardConfirmModal` (`.app-confirm-modal` + portal +
  `.is-stacked` sobre o sheet) + `onDismissAttempt` por estado.
- **CAM-UX2** ✅ — modal de sucesso caía no UUID da amostra como "lote";
  card do lote agora some sem lote conhecido.
- **CAM-M1** ✅ — import `useFocusTrap` sem uso na página.
- **CAM-M2** ✅ — comentários afirmavam que o `ClassificationReviewModal`
  legado "permanece pendente de limpeza" — o arquivo já tinha sido DELETADO;
  referências textuais ajustadas (page, SheetBody, detalhe do lote).
- **CAM-M3/M4** ✅ — ~117 blocos de CSS órfão (~930 linhas): famílias
  `.cam-cf-*`, `.cam-classifier-*`, `.cam-mismatch-*`, `.cam-type-*`,
  `.cam-already-*`, `.cam-error-card`, `.cam-confirm-*` + badge/pulse/
  success-icon/btn-primary do `camera-hub`. Keyframes `cam-*` VIVOS
  preservados (`cam-spin`, `cam-error-*`, `cam-fade-in`, `cam-slide-up`,
  `cam-preview-*` — usados por regras vivas).
- **CAM-M5** ✅ — `resolveMobileRouteMeta('/camera')` ("Leitor QR") era
  computado e nunca renderizado (`!isCameraRoute` no render); ramo removido.
- **CAM-DOC1** ✅ — skill design-system dizia "só o ADMIN renderiza" a
  tabbar; corrigido (todos os não-PROSPECTOR, com 5º slot por papel).
- **CAM-DOC2** ✅ — VG §2 agora registra que a câmera não emite eventos de
  extração (até CAM-P1).

**Resumo do que foi feito:** 12 commits (`5f721e2`..) — 4 bugs, 4
gargalos/robustez, 3 alinhamentos de padrão (portal/is-action/ESC), CAM-D5
implementada, ~930 linhas de CSS órfão, 3 suítes/adições de teste (limit,
magic bytes, prospector denied-list) e docs/skills sincronizadas.

**Execução da CAM-P3 (S13, 2026-07-16)** — conversão feita em 6 commits:
`CameraSheetProvider` (`lib/camera-sheet/`, `useCameraSheet()`, no-op em
≥901px e pra PROSPECTOR) + `CameraSheet` (`components/camera/`, extração
integral da página: UM BottomSheet trocando corpo/título/footer por estado —
scanner `is-scanner` com viewfinder `.camera-sheet-stage` ~52dvh → preview →
processing → review; scanner destruído/recriado quando o `<video>` remonta;
navegações do sheet com o GOTCHA do history; cancelar Flow B = fechar o
sheet, sem navegação) + ícone no header via `HeaderAvatarMenu` (12 páginas
com 1 componente; compensação de centralização 3.6→6.7rem) + gatilhos do
detalhe trocados + CAM-D2 aplicada (desktop sem Classificar/Reclassificar;
Editar fica) + rota `/camera` DELETADA (404, CAM-D3) + limpezas (CSS da
página, `is-camera-route`, conceito `emphasis`/`is-primary` da tabbar
removido ~90 linhas). O voltar do Android fecha o sheet de graça (mecanismo
do BottomSheet + fix G6 da S12 — CAM-D4 satisfeita).

**Pendências:**

- ~~**CAM-P1**~~ **FEITA no Ciclo da Extração — Rodada 1 (2026-07-19,
  `f18524c`)**: sidecar no extract + emissão no confirm com cross-validation
  e `photoAttachmentId`, exatamente no design acima; sidecar consumido junto
  dos temps. Ledger EXT1–EXT13 no `Classificacao-Plano-de-Trabalho.md`.
- **CAM-P2** — Scanner QR decodifica à toa no Flow B (12fps de CPU/bateria
  com `hasContext`; `handleDecodedQr` ignora tudo) + getUserMedia DUPLO na
  inicialização (teste explícito de câmera traseira abre/fecha um stream
  antes do QrScanner abrir o dele — latência). Resolver na fase de conversão
  (CAM-P3), que reestrutura o ciclo de vida do scanner de qualquer forma.
- ~~**CAM-P3** — Conversão em modal global~~ **FEITA na S13** (ver bloco de
  execução acima). O hack do theme-color bege MORREU com a página (o sheet
  parcial usa o backdrop padrão — não muda a status bar).
- **CAM-P4** — Máquina de estados do fluxo é inline no componente e não tem
  teste (projeto sem infra de teste de componente — `node --test`, sem RTL).
  Na conversão (extração página→componente), avaliar extrair um reducer
  testável.

**Validação no device (Flavio):** ícone 📷 no header de TODAS as páginas
mobile (dashboard, listas, DETALHES — onde não há tabbar —, relatórios,
contratos, embarques, cadastros, usuários, perfil); tabbar com 4 itens sem
buraco; ícone abre o sheet PARCIAL subindo de baixo em qualquer página;
fluxo completo dentro do sheet (scan QR → modal de resultado; captura;
galeria; revisão; tipo; classificadores; sucesso volta pro scanner); Flow B
pelo detalhe (Classificar e Reclassificar abrem o sheet SEM sair da página;
cancelar volta pro detalhe); no review, "Cancelar"/voltar abrem "Descartar
classificação?" e desistir mantém tudo (voltar seguinte pergunta de novo);
desktop: SEM ícone no header, SEM Classificar/Reclassificar no detalhe
(Editar fica); `/camera` → 404; título das listas continua centrado com o
cluster novo; reclassificação Flow A com copy correta; QR: ESC/X fecham uma
vez só.

> **✅ Validado no device pelo Flavio em 2026-07-20** — checklist acima e o
> fluxo da Rodada 1 da extração (retry no erro técnico, manual após queda de
> rede no detect, close-up detectada, evento de extração no histórico após
> confirmar) conferidos e funcionando.
>
> **📱 Pendente: Rodada 2 (2026-07-20, ledger FIN no `Classificacao-Plano`).**
> Validar: a etapa "Tipo e classificadores" sobe no mesmo sheet (sem piscar
> modal); os chips deslizam na horizontal sem o campo crescer; as listas não
> são recortadas pelo rodapé; voltar do Android fecha a lista aberta, depois
> pergunta antes de descartar (e não sai mais da página); a tela **não fica
> vazia durante o save**; a revisão não mostra mais a foto; e o sucesso após
> reclassificar diz "Etiqueta impressa" **e a etiqueta sai de fato**.

### Clientes — lista (CLI) — ⬜ não iniciada

### Detalhe do cliente (CDT) — ⬜ não iniciada

### Contratos (CTR) — ⬜ não iniciada

> Contexto prévio: feature recém-construída com plano próprio
> (`docs/Contratos-Plano-de-Trabalho.md`, decisões D1–D134+). A revisão usa
> aquele doc como fonte do comportamento esperado.

### Financeiro (FIN) — ⬜ não iniciada

### Cadastros (CAD) — ⬜ não iniciada

### Relatórios (REL) — ⬜ não iniciada

### Usuários (USR) — ⬜ não iniciada

### Perfil (PRF) — ⬜ não iniciada

### Auxiliares (AUX) — ⬜ não iniciada

> Inclui a rota pública `/laudo/[token]` (sem login — atenção redobrada a
> segurança/expiração de token), `/offline`, `/maintenance` e os redirects.

## Decisões globais (travadas)

- **D1** — Ciclo completo por página: análise → decisões → implementação →
  validação no device → ✅; só então a próxima página.
- **D2** — Ordem de revisão = fluxo operacional (tabela do Status geral).
- **D3** — Código morto: **knip** (devDependency) como apoio + verificação
  manual de todo achado; grep continua para CSS.
- **D4** — `globals.css`: limpeza classe a classe durante as páginas; decisão
  de split do arquivo só na FF2, com o CSS já limpo.
- **D5** — Cada página é revisada **uma vez cobrindo os 6 papéis** (matriz por
  papel + perguntas por papel), não uma passada por papel.
- **D6** — A revisão da página **inclui a cadeia de backend** que ela consome
  (rotas, services, queries, gates).
- **D7** — Lacunas de teste **críticas** ganham teste no próprio ciclo da
  página; menores ficam catalogadas (`T`).
- **D8** — Fases globais: baseline de código morto na F0 (já no começo);
  varredura completa e organização de pastas no fim (FF1/FF2).

## Pendências globais

- **P1** — ✅ resolvida (S2): knip instalado e varredura-baseline executada.
- **P2** — O baseline do knip apontou **80 exports e 38 tipos exportados sem
  uso** (lista viva: `npx knip` — o relatório muda conforme o código). Não
  removidos no baseline de propósito: cada um será tratado no **R4 da página/
  domínio dono**, com verificação manual (há candidatos a falso-positivo, ex.:
  código chamado por string e exports "de API" mantidos por intenção, como os
  checksums de CPF/CNPJ em `src/clients/client-support.js`, mantidos por
  decisão do usuário).
- **P3** (S9) — `.app-confirm-modal .app-modal-actions > button` (confirm
  compartilhado app-wide) tem `background` na transition e hover sem gate
  `(hover: hover)` — corrigir muda TODOS os confirms de uma vez; tratar num
  passe dedicado, não no ciclo de uma página.
- **P4** (S9) — token global de placeholder `rgba(0, 0, 0, 0.18)` é sub-AA
  em todo formulário do app; trocar mexe no app inteiro → passe dedicado
  com validação visual do Flavio.

## Histórico de sessões

- **S1 (2026-07-06)** — Criação deste documento. Estrutura definida com o
  usuário em 2 rodadas de perguntas (decisões D1–D8). Contexto da mesma data:
  remoção completa do card "Últimas atividades" do dashboard (pré-revisão).
- **S2 (2026-07-06)** — F0 concluída: knip instalado + `knip.json` + baseline.
  Removidos 5 arquivos órfãos e a devDependency `typescript-eslint`; P2 criada
  com o restante do relatório (80 exports + 38 tipos). Gates verdes (typecheck,
  lint, format, unit 354, build).
- **S3 (2026-07-06)** — F1/LOG executada ponta a ponta (R1–R8): 2 agentes de
  levantamento + 4 decisões LOG-D1–D4 + 16 achados corrigidos em 7 commits.
  Destaque: os testes de integração novos revelaram 3 bugs de persistência
  (lockout de login, limite do código de reset e revogação de sessão expirada
  eram revertidos pelo rollback do throw dentro de transações Prisma) —
  corrigidos com o padrão "commit primeiro, throw depois". Página em 📱
  aguardando validação do Flavio no device.
- **S4 (2026-07-07)** — LOG validada no device pelo Flavio → ✅ (`520545f`).
  F2/DSH executada ponta a ponta (R1–R8): 4 agentes (frontend, backend+gates,
  docs/skills/knip, auditoria design/a11y R5), 3 perguntas R2 respondidas
  (DSH-D1 + pendências P1/P2), 19 achados — 15 corrigidos em 7 commits e 4
  catalogados (P3/P4/P5/T2). Destaques: remoção do card "Últimas atividades"
  confirmada limpa no código (resíduos só em docs); ~460 linhas de CSS órfão
  removidas classe a classe; suíte nova cobre a metade não-testada do
  `getDashboardPending`. Na sequência, Flavio travou **DSH-D2** (dashboard
  único pros papéis não-PROSPECTOR — resolve a ex-P1) e **DSH-D3** (remoção
  completa do card "Vendas e perdas": componente + rota + service +
  api-client + types + CSS `dd-trend-*` + teste; T2/T3 morreram). Página em
  📱 aguardando validação no device.
- **S5 (2026-07-07)** — Redesenho do desktop (DSH-D4/D5, plan mode com 7
  perguntas respondidas): saem os StatCards de pulso ("Lotes registrados
  hoje" + "Envios concluídos hoje" e todo o pulso diário do backend) e
  entra o card **"Últimos envios"** — endpoint novo
  `GET /dashboard/recent-sends` (40 envios, física+laudo, cancelado
  esmaecido, destinatário atual), pilha 1fr/1fr com o donut na coluna
  esquerda. Levantamento revelou que "envio de laudo" não tem evento
  próprio (a Etiqueta de Envio grava `PHYSICAL_SAMPLE_SENT`; o
  `REPORT_EXPORTED` é o export/envio do PDF) — decisão: listar os dois.
  Suíte nova de 7 testes (surfou o trigger que bloqueia eventos em amostra
  INVALIDATED). Gates verdes (unit 357 / integração 401). Segue 📱.
- **S6 (2026-07-07)** — Sessão de DECISÕES (sem código): card de **Eventos**
  da coluna direita desenhado com o Flavio em 3 rodadas de perguntas (12
  respostas) → decisão **DSH-D6** + doc canônico novo (à época
  `Eventos-Dashboard-Plano-de-Trabalho.md`, consolidado em 2026-07-12 nos
  atuais `docs/Dashboard-Visao-Geral.md` + `docs/Dashboard-Plano-de-Trabalho.md`;
  E1–E11, propostas de design, fases F0/F1+, pendências EVD-P1–P4). Destaques: calendário de 2
  semanas com painel fixo (formato escolhido em preview), card nascerá
  vazio antes das features de evento, catálogo de tipos 100% em aberto.
  DSH-P2 atualizada (conteúdo definido; falta implementar).
- **S7 (2026-07-07)** — **F0 do card de Eventos implementada** (`9a66cd8`):
  2 rodadas de perguntas fecharam E12–E19 (domingo-first, número+dots,
  painel ~60%, rótulo em intervalo, fds apagados, passado igual, deslize
  horizontal, copy do vazio com nota de futuro) e o card entrou na coluna
  direita da linha 2 — 100% front (helpers `lib/dashboard-calendar.ts` +
  `EventsCalendarCard` + CSS `dd-events-*`; sem endpoint, seam da F1 na
  prop `events`). DSH-P2 resolvida; lacuna EVD-T1 catalogada no doc da
  feature. Gates verdes (typecheck / lint / format / build / unit 357 /
  contracts 20). Dashboard segue 📱 com o roteiro de validação ampliado.
  Na validação o Flavio pediu o card em altura total → **E20** (`49f4fb7`:
  coluna direita inteira, pendências dentro da `.dd-left-col`). Em seguida
  decidiu **pausar o card aqui** (registrado como DSH-P6 + EVD-P5: refino
  de layout adiado; eventos só na F1+) pra seguir pra próxima página.
- **S8 (2026-07-07)** — F3/LOT executada ponta a ponta (R1–R8): 3 agentes de
  levantamento + auditoria R5; 4 decisões LOT-D1–D4 (uniforme pros 5 papéis,
  **PROSPECTOR removido de USER_ACTION_ROLES**, copy "lote", vazio único);
  deferidos da revisão faseada RESOLVIDOS — CSS legado `.samples-page-*`
  (84 blocos, −594 linhas, por parser de seletor) e lacuna de testes #7
  (reducer extraído + 6 unit; filtros de classificação/isBlend/
  eligibleForBlend + listClassificationValues em integração). Achado ALTO
  novo corrigido: falha de carregamento era silenciosa (vazio enganoso) →
  banner. Portais nos modais de filtros/envio, reduced-motion da página,
  contraste AA, alvo de toque 44px, aria da busca. 10 commits; gates verdes
  (unit 367 / integração 406). Página em 📱 — o roteiro de validação inclui
  os itens herdados das fases 1/2/4/5 da revisão faseada.
- **S9 (2026-07-07)** — F4/LNW executada ponta a ponta (R1–R8): 3 agentes de
  levantamento; 4 decisões LNW-D1–D4 (**rota `/samples/new` removida**,
  copy "lote" estendida ao fluxo, `receivedChannel` fora do front,
  **editou = manual** no número do lote — digitar a própria sugestão agora
  FIXA o número). Achado ALTO corrigido: a API aceitava `sampleLotNumber`
  cru sem a flag manual, pulando a validação (colisão viraria 500) →
  hardening + teste na camada da API. Limpeza nsv2 (−299 linhas por parser
  com split de vírgulas), press-effects, bloco reduced-motion (incl. slide
  do `.bottom-sheet` GLOBAL), contraste dos rótulos, 44px nos chips de
  safra, drop-up do dropdown de safra no fim do form. Suíte nova de 17
  testes de integração do `createSample` (validações, binding do dono,
  idempotência, número manual). Pendências globais P3 (press do confirm
  compartilhado) e P4 (token de placeholder) catalogadas. 8 commits; gates
  verdes (unit 367 / contracts 20 / integração + re-seed). Página em 📱.
- **S10 (2026-07-07)** — Fix duplo em /samples relatado pelo Flavio em uso
  real (achados LOT-B2/B3, pós-ciclo): (1) lista congelada em dados velhos
  — o snapshot de sessão pulava o fetch de mount sem revalidação e não
  havia refetch no retorno do background → snapshot virou só a primeira
  pintura, com refetch silencioso no mount restaurado + hook novo
  `use-list-revalidation` (foreground throttle 30s + polling 60s; decisões
  do Flavio: silenciosa, 60s, /clients junto) + logout limpando snapshots;
  (2) liga criada só com os selecionados visíveis na busca atual → seleção
  guarda o snapshot do lote (Map + `reconcileSelection` em
  `blend-selection.ts`, 5 testes unit). 4 commits (`5876b08`, `a811f85`,
  `ee8d5ef`, docs). 📱 validar: staleness com 2 usuários, liga com busca
  no meio da seleção.
- **S11 (2026-07-08)** — F5/LDT executada ponta a ponta (R1–R8): 3 agentes de
  levantamento + verificação própria dos achados de maior impacto; 4 decisões
  LDT-D1–D4 (uniforme pros 5 papéis, copy "lote"/"Deletar", revalidação
  silenciosa, endurecer a foto). Achado ALTO de segurança: o endpoint de foto
  servia o binário sem autenticação (só validava UUID) e abria um Prisma por
  request → método `getSampleAttachmentDescriptor` (auth central + Prisma
  compartilhado) + suíte de integração. Revalidação do detalhe reusando o hook
  da S10 (foreground + 60s). Limpeza grande: código morto do fluxo de
  classificação legado (−254, incluindo um modal inatingível) e CSS `sdv-*`
  órfão (71 classes, −1435 linhas) removido por parser robusto (ignora
  comentários/strings; invariante de classe-chave garantindo que nenhuma viva
  perdeu regra). Copy/acentos (bug de plural "movimentacaooes"), press-effects
  gated, `prefers-reduced-motion` (mata o pulse infinito), contraste AA, alvo
  de toque 44px e a11y (h1, focus trap em 2 modais, timeline como lista).
  Pendências: LDT-P1 (modais inline sem portal), P2 (extração → FF2), P3
  (nth-child legado → ciclo CDT). 8 commits; gates verdes (unit 372 /
  contracts 20 / integração + re-seed). Página em 📱.
- **S12 (2026-07-16)** — F6/CAM executada ponta a ponta (R1–R8), precedida
  das decisões de arquitetura CAM-D1–D4 (câmera vira modal global
  mobile-only; conversão = CAM-P3, fase própria). 3 agentes de levantamento
  (CSS/AppShell, cadeia backend, modais/sheet) + leitura integral da página.
  20 achados, 18 corrigidos em 12 commits: destaque pro **CAM-B1** (token de
  foto stale anexava a FOTO ERRADA à classificação — temps vivem 24h no
  server), **CAM-G6** (o back do Android furava o sheet bloqueado E o
  contador interno do `BottomSheet` ficava envenenado ao fechar por botão,
  engolindo a 1ª volta do próximo sheet — fix no componente compartilhado),
  **CAM-B4** (`Number.isFinite("300")` capava o lookup de classificadores em
  200 silenciosamente) e **CAM-I1** (detect/extract aceitavam buffer
  arbitrário → sharp + OpenAI sem validar magic bytes). CAM-D5 travada e
  implementada (confirmação de descarte do review, padrão `.app-confirm-modal`
  - `.is-stacked`); CAM-D6 travada (eventos de extração → início do ciclo da
    extração, design pronto em CAM-P1 — o par bruto→corrigido + foto vira base
    de auditoria/treinamento da IA). ~930 linhas de CSS órfão do fluxo antigo
    removidas. Skills modals/design-system + VG §2 sincronizadas. Página em 📱.
- **S13 (2026-07-16)** — CAM-P3 executada na sequência, após o Flavio
  corrigir a leitura do gatilho: o que ele quer é **ícone de câmera no
  HEADER de todas as páginas** abrindo um **sheet PARCIAL** (molde Novo
  lote), não a página. CAM-D1 emendada + decisão nova (câmera SAI da
  tabbar → 4 itens). Levantamento revelou que o topbar do AppShell é
  invisível no mobile em TODAS as rotas — o header real é por página, e o
  `HeaderAvatarMenu` (12 montagens) é o único componente comum: o ícone
  entrou nele como cluster `[câmera][avatar]` (1 componente = todas as
  páginas; desktop herda o display:none). Fluxo inteiro extraído de
  `app/camera/page.tsx` pro `CameraSheet` global (provider em
  `lib/camera-sheet/`), UM BottomSheet com corpo por estado (scanner
  `is-scanner` novo → preview → processing → review), scanner recriado
  quando o vídeo remonta, GOTCHA do history nas navegações, cancelar
  Flow B = fechar o sheet. CAM-D2 aplicada no detalhe (desktop sem
  Classificar/Reclassificar), rota DELETADA (404), theme-color bege morreu
  com a página, conceito `is-primary` da tabbar removido (~90 linhas).
  6 commits; gates verdes. Página segue em 📱 (checklist novo na seção).
