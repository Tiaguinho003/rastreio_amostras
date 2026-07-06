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

| #   | Código | Página             | Rota                                                                          | Status | Sessões | Resumo |
| --- | ------ | ------------------ | ----------------------------------------------------------------------------- | ------ | ------- | ------ |
| 1   | LOG    | Login              | `/login` (+ `/forgot-password`)                                               | ⬜     | —       | —      |
| 2   | DSH    | Dashboard          | `/dashboard` (twins mobile/desktop + dashboard do PROSPECTOR)                 | ⬜     | —       | —      |
| 3   | LOT    | Lotes (lista)      | `/samples`                                                                    | ⬜     | —       | —      |
| 4   | LNW    | Novo lote          | `/samples/new`                                                                | ⬜     | —       | —      |
| 5   | LDT    | Detalhe do lote    | `/samples/[sampleId]`                                                         | ⬜     | —       | —      |
| 6   | CAM    | Câmera / Scanner   | `/camera`                                                                     | ⬜     | —       | —      |
| 7   | CLI    | Clientes (lista)   | `/clients`                                                                    | ⬜     | —       | —      |
| 8   | CDT    | Detalhe do cliente | `/clients/[clientId]`                                                         | ⬜     | —       | —      |
| 9   | CTR    | Contratos          | `/contratos`                                                                  | ⬜     | —       | —      |
| 10  | FIN    | Financeiro         | `/financeiro`                                                                 | ⬜     | —       | —      |
| 11  | CAD    | Cadastros          | `/cadastros`                                                                  | ⬜     | —       | —      |
| 12  | REL    | Relatórios         | `/informe` (+ redirect `/resumo`)                                             | ⬜     | —       | —      |
| 13  | USR    | Usuários           | `/users`                                                                      | ⬜     | —       | —      |
| 14  | PRF    | Perfil             | `/profile` (+ redirect `/settings`)                                           | ⬜     | —       | —      |
| 15  | AUX    | Auxiliares         | `/laudo/[token]` (público), `/offline`, `/maintenance`, redirects `/` e afins | ⬜     | —       | —      |

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

### Login (LOG) — ⬜ não iniciada

### Dashboard (DSH) — ⬜ não iniciada

> Contexto prévio: o card "Últimas atividades" foi removido por completo em
> 2026-07-06 (commits `61a72e2`/`2b43faf`/`56a1290`); o grid desktop está
> provisório (50/50) até definirmos a informação que entra no lugar.

### Lotes — lista (LOT) — ⬜ não iniciada

> Contexto prévio: a lista já passou por revisão faseada própria em
> `docs/Revisao-Pagina-Lotes-Plano-de-Trabalho.md` (29 achados, fases 1–6
> implementadas). O ciclo aqui **não repete** o que foi coberto lá: começa
> conferindo o que ficou deferido (CSS legado `.samples-page-*`, testes de
> regressão) e foca papéis + docs + design.

### Novo lote (LNW) — ⬜ não iniciada

### Detalhe do lote (LDT) — ⬜ não iniciada

### Câmera / Scanner (CAM) — ⬜ não iniciada

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

## Histórico de sessões

- **S1 (2026-07-06)** — Criação deste documento. Estrutura definida com o
  usuário em 2 rodadas de perguntas (decisões D1–D8). Contexto da mesma data:
  remoção completa do card "Últimas atividades" do dashboard (pré-revisão).
- **S2 (2026-07-06)** — F0 concluída: knip instalado + `knip.json` + baseline.
  Removidos 5 arquivos órfãos e a devDependency `typescript-eslint`; P2 criada
  com o restante do relatório (80 exports + 38 tipos). Gates verdes (typecheck,
  lint, format, unit 354, build).
