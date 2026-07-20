# Redesign — Plano de Trabalho

> **Status**: F0 concluída (decisões travadas em 2026-07-20); **sem código ainda** — F1 gated (ver §5)
> **Última atualização**: 2026-07-20
> **Prefixo de decisões**: RD
> **Par futuro**: quando o padrão consolidar, o funcionamento real será absorvido pelos docs canônicos e pelas skills (`modals`, `design-system`, `responsive`). A frente visual parte de `docs/Design-Language.md` (canônico dos tokens).

Documento centralizado do ciclo de redesign do app, com duas frentes:

1. **Navegação — detalhes-como-modais**: os detalhes de **lote**, **cliente** e **contrato** deixam de ser páginas e viram **overlays sobre as listas**. Não existe mais "página de detalhe"; existe lista + overlay endereçável por URL.
2. **Linguagem visual**: reforma geral de design e layout do sistema ("o app ficará bem diferente"). Depende de mockups do Flavio; estiliza o app **uma vez só, já na estrutura definitiva** (ver RD6).

---

## 1. Ledger de decisões (RD)

Todas travadas em **2026-07-20** (conversa de kickoff, com levantamento de código no §4).

- **RD1 — Detalhe é overlay, não página.** Vale para lote, cliente e contrato. Fora do escopo: o **laudo público** (`public-laudo/`, alvo do QR externo) continua página independente; `/users`, `/profile` e demais páginas não-entidade não mudam.
- **RD2 — Endereçamento por query param sobre a lista.** `/samples?lote=<id>` e `/clients?cliente=<id>` (nomes dos params a fechar no plan mode da F1). As rotas antigas `/samples/[sampleId]` e `/clients/[clientId]` **viram redirects** preservando query (`?focus=`, `?source=`) — QR físico, scanner e links salvos continuam funcionando sem tocar no backend. Back fecha o overlay; refresh reabre lista+overlay; link é compartilhável. **Intercepting/parallel routes do App Router foram avaliadas e descartadas**: complexidade real e conflito com o modelo manual de histórico já adotado (árbitro de popstate do `BottomSheet`).
- **RD3 — Mobile: sheet de tela cheia.** Slide de baixo, header com fechar, back fecha via árbitro, `100lvh` + safe areas (regras da casa de iOS PWA). Conteúdo visualmente próximo da página atual; o ganho é a navegação (lista viva atrás, filtros/scroll preservados, voltar instantâneo).
- **RD4 — Desktop: painel lateral (peek).** Desliza da direita; a **lista continua visível e clicável** — clicar noutro card troca o item aberto no painel sem fechar/reabrir. Escolhido sobre o dialog central. O contêiner abstrai a apresentação, então reverter é barato se o mockup da frente visual pedir outra coisa.
- **RD5 — Contêiner único** (nome de trabalho: `DetailOverlay`). Decide a apresentação pelo dispositivo (RD3/RD4) e centraliza: integração com histórico (árbitro), focus trap (`lib/use-focus-trap`), scroll lock e **empilhamento** (modais internos e câmera abrem SOBRE o overlay de detalhe). Conteúdo idêntico nos dois mundos.
- **RD6 — Estrutura antes da pele.** F1–F3 **transplantam** o conteúdo atual para o overlay **sem redesenho visual** (nada de pixel-pushing em tela que vai mudar de cara). A frente visual (FV) vem depois, com mockups, estilizando no lugar definitivo.
- **RD7 — Piloto: cliente.** Menor (2.414 linhas), beneficia `/clients` e `/cadastros` de uma vez (`ClientsBrowser` compartilhado) e já tem semente: o modal-resumo `cdm-modal` do `ClientsBrowser` ("Gerenciar cliente" → página, gate ADMIN+CADASTRO). O overlay absorve resumo E gestão; o gate de papel vira **modo interno** (resumo para todos; gestão para ADMIN+CADASTRO). Detalhes do modo no plan mode da F1.
- **RD8 — Lote: quebrar antes de mover.** `app/samples/[sampleId]/page.tsx` (3.904 linhas) é decomposto em seções por **refactor mecânico sem mudança visual** (commits próprios), e só então transplantado. Sem isso a F2 vira big-bang.
- **RD9 — Contrato: realinhamento, não conversão.** O detalhe já é modal (`SaleContractDetailsModal` dentro do `ContratosPanel`, deep-link `?details`). Na F3 ele adota o padrão do contêiner (peek no desktop / sheet no mobile). Conecta com a pendência **P27** (design das páginas de Contrato).
- **RD10 — Kickoff gated.** F0 (este doc) feita já; **código só depois de validar no device as frentes pendentes que tocam as mesmas telas** (ver §5). Evita misturar regressões novas com validações em aberto.

## 2. Fases

| Fase | Escopo | Estado |
| --- | --- | --- |
| **F0** | Decisões RD1–RD10 + este doc + registro do ciclo | ✅ 2026-07-20 |
| **F1** | Contêiner `DetailOverlay` (apresentação por dispositivo, histórico, foco, empilhamento) + piloto **cliente** (absorve `cdm-modal` + página de gestão) + redirects de `/clients/[clientId]` | ☐ gated (§5) |
| **F2** | **Lote** — F2a: quebra do page.tsx em seções (refactor mecânico); F2b: transplante para o overlay; F2c: cadeias (câmera, impressão, classificação, envio, liga) sobre o overlay + redirects | ☐ |
| **F3** | **Contrato** — realinhar `SaleContractDetailsModal` ao padrão (+ P27) | ☐ |
| **F4** | Limpeza: rotas antigas só-redirect (ou remoção), morte do snapshot de sessionStorage do `SampleCard`, sync final de skills/docs | ☐ |
| **FV** | Frente visual: mockups → tokens (`Design-Language.md`) → reskin geral | ☐ aguarda mockups; pode iniciar após F1 validada |

Cada fase abre em **plan mode** e só fecha com **validação no device** (🖥️ + 📱), como nos demais ciclos.

## 3. O que NÃO muda

- **Backend**: nenhuma rota de API muda. RD2 é só front + redirects de rota.
- **Modelo de dados dos detalhes**: ambos já são client components buscando via `lib/api-client.ts`; o overlay usa as mesmas chamadas.
- **Laudo público** (QR externo) e fluxo do print agent.

## 4. Inventário técnico (levantamento de 2026-07-20)

- **Tamanhos**: detalhe do lote `app/samples/[sampleId]/page.tsx` = 3.904 linhas (câmera, impressão, classificação, envio físico, liga, movimentos, invalidação embutidos); detalhe do cliente `app/clients/[clientId]/page.tsx` = 2.414 linhas (filiais, contas bancárias, anexos, cascata); hub `/contratos` = casca de 128 linhas sobre `ContratosPanel` (799).
- **Infra existente reaproveitável**: `components/BottomSheet.tsx` (padrão canônico de ação + árbitro de popstate), `lib/use-focus-trap`, `lib/navigation/route-history.ts`, query param como fonte de verdade já praticado (`?tab=`/`?details` no /contratos; `?focus=classification&source=qr` vindo do QR; `?source=scanner`).
- **Sementes**: `cdm-modal` (resumo do cliente no `ClientsBrowser`); `SaleContractDetailsModal` (contrato já-modal).
- **Pontos de entrada do detalhe do lote** (9 mapeados; reconferir no plan mode da F2): `SampleCard` (com snapshot de sessionStorage a remover na F4), `CameraSheet` ×3 (`navigateFromSheet`), `NewSampleModal`, `SampleInvalidateBlockedModal`, `SampleMovementsPanel` (origem de cascata), `ScannerBridge`, e o **backend** `src/api/v1/backend-api.js` (redirect do QR com `?focus=classification&source=qr`). Dois são **externos por URL** (QR e scanner) — por isso RD2 exige detalhe endereçável.
- **Entrada do detalhe do cliente**: só o link "Gerenciar cliente" do `cdm-modal` (as duas superfícies passam pelo `ClientsBrowser`).

## 5. Pré-requisitos para destravar código (RD10)

- **F1 (cliente)**: validar as frentes pendentes que tocam `/clients`/`/cadastros` — ciclo de alinhamento de cadastros (🖥️) e acesso unificado por papel (🖥️📱).
- **F2 (lote)**: validar as frentes que vivem dentro do detalhe do lote — Rodada 2 da câmera/classificação (📱), liga/safra reativa (🖥️📱), auditoria de classificação (📱).

## 6. Riscos mapeados (endereçar nos plan modes)

1. **Empilhamento de overlays**: os ~28 modais internos + câmera passam a abrir sobre o overlay de detalhe (z-index, scroll lock e foco em camadas).
2. **Popstate em cadeia**: detalhe → câmera → preview; o árbitro precisa fechar a camada certa a cada back (histórico recente mostra a sensibilidade: b2c4c49, b2e75b2).
3. **Teclado iOS dentro de sheet de tela cheia** (inputs de edição no fim do conteúdo).
4. **Perf/memória**: lista + detalhe montados simultaneamente no mobile.
5. **Gate de papel do cliente** virando modo interno — não pode vazar gestão para quem não pode (hoje o alívio é só de UI; backend sem gate).

## 7. Skills e docs — quando atualizar o quê

Regra do ciclo: **skill segue consolidação; ledger segue decisão.** Durante experimentação, nada de editar skill.

- **Fechou F1 (validada no device)**: `modals` ganha a terceira categoria na árvore de decisão (hoje: ação = BottomSheet; aviso = central; novo: **detalhe = DetailOverlay**); `responsive` documenta o switch de apresentação por dispositivo; `design-system` §8 ganha a variante sheet-de-tela-cheia.
- **Fechou F4**: varredura geral (`skill-maintenance`) + este doc aponta para os canônicos.
- **FV consolidada**: reescrita maior de `design-system` (+ revisão de `feedback-messages` e `button-press-effect`), com `Design-Language.md` como fonte dos tokens.
- `skill-maintenance` roda ao fim de **cada** fase, como sempre.
