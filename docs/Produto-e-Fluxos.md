# Produto e Fluxos

Status: Ativo  
Escopo: comportamento funcional oficial do sistema, estados da amostra e regras operacionais  
Ultima revisao: 2026-05-08 (pos-Q.final + Q.types + Q.draft)  
Documentos relacionados: `docs/Arquitetura-Tecnica.md`, `docs/API-e-Contratos.md`, `docs/Clientes-e-Movimentacoes-Especificacao.md`

## Objetivo do sistema

O sistema organiza o rastreio interno de amostras ao longo de um fluxo operacional unico:

1. recebimento;
2. registro;
3. geracao e impressao de QR;
4. classificacao;
5. laudo;
6. consulta, auditoria e ajustes.

O foco atual e operacao interna, sem exposicao publica e sem dependencia de servicos externos para o fluxo principal.

## Modulos funcionais

1. `Dashboard`
   Resume filas pendentes, total recebido no dia e ultimos registros.
2. `Camera inteligente`
   Le QR, resolve amostra existente e pode iniciar novo registro a partir de foto.
3. `Amostras`
   Lista, busca, filtros, detalhe, historico, edicoes, impressao e laudo.
4. `Usuarios`
   Gestao administrativa de contas, bloqueios, reativacao, senha e auditoria.
5. `Configuracoes`
   Perfil proprio, troca de email, senha e decisao sobre senha inicial.

## Papeis e permissoes reais

Os papeis suportados hoje sao:

1. `ADMIN`
2. `CLASSIFIER`
3. `REGISTRATION`
4. `COMMERCIAL`
5. `PROSPECTOR` (equipe de campo de prospeccao — app restrito, ver "Experiencia do PROSPECTOR")
6. `CADASTRO` (operacao geral, espelha `REGISTRATION` sem admin/comercial)

Regra consolidada nesta revisao:

1. `ADMIN` e obrigatorio para gestao de usuarios e auditoria administrativa.
2. No dominio de amostras, o backend atual aceita qualquer usuario autenticado para as operacoes de fluxo.
3. Isso significa que os papeis nao impõem, hoje, um RBAC tecnico forte por etapa de amostra.
4. Qualquer necessidade futura de segregacao mais rigida por modulo deve ser tratada como evolucao de permissao, nao como comportamento ja existente.
5. Excecao ja implementada: o `PROSPECTOR` tem restricao tecnica real — allowlist central de API (`src/auth/prospector-access.js`) + navegacao restrita.

## Ciclo de vida da amostra

### Status operacionais

Pos-Fase Q (Q.print + Q.auto + Q.final), o lifecycle do Sample foi reduzido a **3 valores**:

1. `REGISTRATION_CONFIRMED`
   A amostra foi registrada (createSample emite 1 evento unico). Os dados minimos
   estao confirmados, o lote interno foi gerado e a amostra esta pronta pra
   classificacao. Status inicial e tambem o status enquanto a impressao da
   etiqueta acontece (impressao virou acao pura, sem mover o sample).
2. `CLASSIFIED`
   A classificacao foi concluida. Pode receber reclassificacoes (audit) e
   movimentacoes comerciais.
3. `INVALIDATED`
   Estado terminal. Nao permite novas operacoes de fluxo.

Os 5 statuses legacy (`PHYSICAL_RECEIVED`, `REGISTRATION_IN_PROGRESS`,
`QR_PENDING_PRINT`, `QR_PRINTED`, `CLASSIFICATION_IN_PROGRESS`) foram
**dropados** do enum Postgres na migration `20260508163528_qfinal_drop_legacy_enums`.

### Dimensao comercial

O status comercial e separado do status operacional e usa:

1. `OPEN`
2. `PARTIALLY_SOLD`
3. `SOLD`
4. `LOST`

Regra oficial:

1. o status comercial so pode ser alterado quando a amostra esta `CLASSIFIED`;
2. `PARTIALLY_SOLD` e calculado pelo backend quando ha vendas parciais registradas mas ainda resta saldo; `SOLD` significa saldo zerado; `LOST` cobre a perda do saldo restante;
3. movimentos de venda e perda vivem em `SampleMovement` e sao a fonte de verdade do status comercial — ver `docs/Clientes-e-Movimentacoes-Especificacao.md`;
4. `INVALIDATED` bloqueia qualquer nova mudanca comercial.

## Fluxo oficial

### 1. Recebimento e registro

1. O lote nasce pelo modal `Novo lote` (leque "+" de `/samples`) via `POST /samples/create`. A rota dedicada `/samples/new` foi removida (LNW-D1, 2026-07-07); o `receive` simples segue existindo na API.
2. O registro confirmado exige `owner` (via `ownerClientId` de cliente vendedor ativo), `sacks` e `harvest`; `originLot`, `location` e `notes` sao opcionais.
3. NAO ha foto de chegada no fluxo — foto entra so na classificacao.
4. O lote interno numerico e gerado automaticamente (sequencial global, ex: 5641), mas o numero e EDITAVEL no modal: qualquer edicao no campo fixa o numero como manual (LNW-D4); vazio volta pro automatico. A data de chegada tambem pode ser informada (vira o `createdAt` do lote).
5. O fluxo de registro e inteiramente manual.

### 2. Impressao de QR

Pos Q.print: impressao virou **acao pura**. Nao muda mais o status do Sample.

1. `requestQrPrint` cria um `PrintJob` (status `PENDING`) e emite `QR_PRINT_REQUESTED`
   (audit-only, `fromStatus: null`/`toStatus: null`). 1 PrintJob PENDING por amostra
   no maximo (request duplicada com PENDING valido retorna 409).
2. `recordQrPrinted` atualiza o `PrintJob` pra `SUCCESS` (audit-only).
3. `recordQrPrintFailed` atualiza pra `FAILED` (audit-only).
4. Lazy timeout de 60s em `expireStalePrintJobs`: PrintJob PENDING por mais de 1
   minuto vira `EXPIRED` antes de criar nova request OU antes de `getSampleDetail`
   retornar — sem worker/cron.
5. Reimpressao manual (override) e permitida em qualquer status `!== INVALIDATED`.
   Nao ha mais distincao entre PRINT e REPRINT — toda tentativa usa `attemptNumber`
   sequencial.
6. Pos Q.auto: `completeClassification` dispara `requestQrPrint` automaticamente
   ao final da classificacao (best-effort; falha de print nao bloqueia
   classificacao). Idempotency derivada (`${event.idempotencyKey}:auto-print`)
   protege contra duplo-clique.
7. PrintJob status: `PENDING` / `SUCCESS` / `FAILED` / `EXPIRED`.

### 3. Classificacao

1. A classificacao parte de `REGISTRATION_CONFIRMED` (Q.cls.1 cortou
   `CLASSIFICATION_IN_PROGRESS` e o evento `CLASSIFICATION_STARTED`).
2. O fluxo principal e via `Camera inteligente`, tudo dentro de um unico bottom
   sheet: foto da ficha → extracao IA (1 prompt unico, type-agnostic) → ficha de
   revisao unificada (`ClassificationReviewSheetBody`, so campos) → etapa
   **Tipo e classificadores** (dropdown de tipo — `BICA`, `PREPARADO`, `BAIXO`,
   `ESCOLHA`, `CONILON` — + campo de chips dos classificadores) → save
   (Q.auto dispara print). Desde 2026-07-20 tipo e classificadores sao UMA
   etapa do sheet; antes eram dois modais centrais separados.
3. A foto da classificacao e obrigatoria para concluir, seja pelo fluxo de camera ou pelo modo manual (mesma ficha, sem extracao).
4. A data de classificacao e SEMPRE carimbada pelo servidor no fuso de negocio (`buildBusinessDateStamp`); o cliente nao envia data.
5. O tipo de cafe NAO define campos — e metadata pos-extracao; todos os campos valem pra qualquer tipo (ficha unificada Q.cls.2.7). O contrato campo a campo (6 flat fields + peneiras p18..p10+MK + 2 fundos + 6 defeitos + observacoes) esta em `docs/Classificacao-Visao-Geral.md` §3.
6. Reclassificar uma amostra ja `CLASSIFIED` pela camera exige motivo (`reasonCode`) e e **substituicao total consciente**: a ficha parte vazia e campos nao preenchidos apagam os anteriores (aviso explicito no portao). A reclassificacao tambem **reimprime a etiqueta** (2026-07-20) — ela carrega o aspecto da classificacao. A edicao pelo modal de detalhe, ao contrario, pre-preenche e emite `CLASSIFICATION_UPDATED` com diff before/after.

#### Extracao por IA

1. O sistema usa GPT-4o (pinado `gpt-4o-2024-11-20`) para extrair os campos manuscritos da ficha a partir da foto, com 1 prompt unico type-agnostic + few-shot visual (detalhes em `docs/Classificacao-Visao-Geral.md` §8).
2. O pipeline tem tres etapas: `detect-form` tenta auto-detectar e recortar a ficha; `extract-and-prepare` envia a foto (ou o recorte) para o modelo e retorna os campos extraidos; `confirm` persiste a classificacao apos revisao manual do usuario.
3. Os campos extraidos sao pre-preenchidos no formulario, **mas o usuario sempre revisa e confirma antes de salvar**. A extracao nunca e aceita automaticamente.
4. A extracao que chega ao confirm gera `CLASSIFICATION_EXTRACTION_COMPLETED` (sucesso) ou `CLASSIFICATION_EXTRACTION_FAILED` (falha tecnica seguida de preenchimento manual), anexados ao historico da amostra **no confirm** via sidecar (CAM-P1, 2026-07-19). Tentativa abandonada antes do confirm nao vira evento — o temporario (e o sidecar) expiram em 24h.
5. Em caso de falha da deteccao ou da extracao, o usuario pode re-tentar com a mesma foto ("Tentar novamente") ou prosseguir manualmente com o formulario vazio.
6. O servico depende da variavel `OPENAI_API_KEY` — ausente, o extract responde 200 com `extractionAvailable: false` e o fluxo de camera roteia direto pro preenchimento manual.

#### Conferencia da classificacao

1. Na mesma etapa do tipo (depois da foto e da revisao), o operador confere quem
   classificou: o usuario atual ja entra selecionado e pode ser removido.
2. Co-classificadores sao adicionados pelo campo de chips, que lista os usuarios
   ativos do sistema (sem busca; PROSPECTOR nao aparece).
3. O backend valida a lista em `normalizeClassifiers`: rejeita usuarios inativos, inexistentes ou PROSPECTOR, faz dedup silencioso, exige minimo 1, limita a 50 entradas.
4. O conjunto final e persistido como `classifiers` no payload de `CLASSIFICATION_COMPLETED` (snapshot com `{id, fullName, username}`; o legado `conferredBy` saiu do schema no Q.cls.2.7), editavel pos-classificacao via `CLASSIFICATION_UPDATED`.
5. A conferencia aparece no card resumo da classificacao e no modal full-view (com os nomes dos classificadores). No laudo PDF **nao** aparece — quem classificou e dado interno, nao enviado ao comprador.

### 4. Laudo e consulta

1. O laudo PDF so pode ser gerado quando a amostra esta `CLASSIFIED`.
2. Existe um **unico laudo** ("Laudo Tecnico"), sem tipos. Ele omite proprietario,
   lote de origem, classificadores e a data da classificacao (dados internos que nao
   vao ao comprador). Eventos `REPORT_EXPORTED` historicos podem ter um `exportType`
   antigo (`COMPLETO`/`COMPRADOR_PARCIAL`), mantido so por compatibilidade — o campo
   nao e mais gravado.
3. Em amostra com mais de uma safra (liga de safras diferentes), o laudo revela que
   e um **Mix**: imprime "Mix" no campo Safra + a **composicao por safra** com a %
   de cada uma (por sacas, ate os lotes-folha que a compoem). NAO revela as
   origens/produtores. A safra da liga e **derivada** dos lotes (nao editavel).
   **Laudos ja enviados** que gravaram uma safra unica (`reportedHarvest` no share/
   `REPORT_EXPORTED`) seguem **congelados** nessa safra; so os novos mostram o Mix.
   (Antes: o operador escolhia UMA safra pra nao revelar que era liga — revertido em
   2026-07-15, so quanto a safra.)
4. O detalhe do lote expoe historico, anexos, QR, dados principais, classificacao e status comercial. A UI usa o vocabulario "lote" (LDT-D2, 2026-07-08). **Nao e mais uma pagina**: `/samples/[sampleId]` redireciona para `/samples?lote=<id>` e o conteudo e o drawer `SampleDetailView`, com hero + 3 abas (Visao geral · Classificacao · Movimentacoes). O painel comercial segue **so leitura**, mas as operacoes mudaram de lugar: a **venda** migrou para `/contratos` (nasce do contrato a vista); **perda** e **envio fisico** sao disparados tanto pelo ⋯ da linha da lista quanto pelo ⋯ do hero do detalhe, e abrem paineis laterais (`SampleLossSheet` / `SampleSendFlow`).

## Regras de ajuste e auditoria

1. O historico de amostras e append-only por evento.
2. Edicao de registro nunca sobrescreve silenciosamente: gera `REGISTRATION_UPDATED`.
3. Edicao de classificacao nunca sobrescreve silenciosamente: gera `CLASSIFICATION_UPDATED`.
4. Toda edicao exige `reasonCode` e `reasonText`.
5. `reasonText` de edicao e limitado a 10 palavras no backend atual.
6. O detalhe do lote permite reverter a ultima edicao reversivel com novo motivo auditado.
7. A acao terminal do lote e rotulada **"Deletar"** na UI (endpoint segue `/invalidate`): encerra o lote em status terminal (`INVALIDATED`), sem reabertura; bloqueada por 409 se houver contrato vinculado (`SAMPLE_HAS_CONTRACT`) — nesse caso o desfazer e o Washout do contrato em `/contratos`.
8. Numa **liga**, a **safra** (deriva das origens; apresentada como "Mix" quando ha mais de uma) e as **sacas** (soma das contribuicoes das origens, composicao imutavel apos criar) sao **read-only** na edicao — editar direto e rejeitado com 422 (`BLEND_HARVEST_READ_ONLY` / `BLEND_SACKS_READ_ONLY`). O **lote de origem** da liga (2026-07-19) **deriva** da somatoria dos lotes de origem dos componentes (nao e mais nulo) e propaga como a safra, mas passou a ser **editavel**: editar a mao FIXA a origem (`blendOriginLotPinned`, estatuto do "dono" — a propagacao para de re-derivar aquela liga; nao toca os componentes). O **dono** da liga tambem e editavel (recurso "dono fixado") e o **local** e autoral.

## Fluxos de usuario e acesso

1. Login usa usuario e senha.
2. A sessao do navegador e mantida por cookie HTTP-only.
3. Ha fluxo de recuperacao de senha por codigo enviado por email.
4. O proprio usuario pode:
   editar nome e telefone;
   solicitar troca de email;
   confirmar novo email por codigo;
   alterar senha;
   registrar se manteve ou trocou a senha inicial.
5. O administrador pode:
   criar usuario;
   editar dados e papel;
   redefinir senha;
   inativar, reativar e desbloquear conta;
   consultar trilha de auditoria de usuarios.

## Experiencia do PROSPECTOR

O `PROSPECTOR` (equipe de campo de prospeccao) usa um app restrito dentro da mesma PWA:

1. Paginas: apenas o dashboard dedicado e o perfil (tabbar com Inicio + Perfil). As demais rotas redirecionam para `/dashboard` — middleware (UX online) + guard de pagina via `useRequireAuth` (cobre tambem paginas servidas do cache do service worker).
2. Dashboard dedicado: cards "Visitas hoje" e "Clientes novos hoje" (janela do dia no fuso de Brasilia; **excluem canceladas**), lista das PROPRIAS visitas (cards expansiveis compartilhados com o viewer Relatorios) e botao central "+" que abre o formulario de VISITA — desde o redesenho FV (Redesign §2.10 R3/R-D4) o **mesmo painel lateral** da pagina Relatorios, sem bifurcacao. **Online-only** desde a UNIFICACAO (2026-07-15) — a fila offline e o contador de pendentes foram removidos.
3. Visibilidade: a lista do dashboard mostra **apenas as visitas do proprio prospector** (`listVisitReports` forca `where.userId`; busca por nome do cliente e contador de registros acompanham). Os cards de hoje contam so o proprio; a lixeira **"Cancelar"** (soft) aparece so nas visitas dele.
4. API: allowlist central (`src/auth/prospector-access.js`) — fora de sessao/conta, push, criar/listar/cancelar a PROPRIA visita e — desde a unificacao — **buscar e cadastrar cliente** (`lookupClients`/`createClient`/`lookupUsersForReference`, para vincular o cliente no form), qualquer outro endpoint autenticado responde `403 ROLE_FORBIDDEN`.
5. O formulario de VISITA e **UNIFICADO** (o mesmo componente do prospector e do comercial; sheet do dashboard do prospector, botao/leque da pagina Relatorios). A rota migrou de `/informe` para **`/relatorios`** ("Relatorios"; `/informe` e `/resumo` redirecionam). Todo nao-PROSPECTOR e **viewer** (feed scope=all: Visita + Semanal de TODOS), **cria** e **CANCELA (soft)** o proprio. O **Semanal** so ADMIN + COMMERCIAL criam. O PROSPECTOR nao acessa a pagina (ve as proprias visitas no dashboard). _(Historico: o antigo `/resumo` + a divisao viewer/proprios + a curadoria de vinculo sairam na unificacao 2026-07-15.)_
6. **A visita nasce SEMPRE vinculada a um cliente do cadastro** (todos os autores, incl. prospector): "Ja cadastrado" busca no banco; "Cliente novo" cadastra na hora (`ClientQuickCreateModal`), e nome/cidade/telefone digitados viram a anotacao de campo ao lado do vinculo. Acabaram a declaracao sem `clientId` e a curadoria de vinculo pos-envio (removidas na unificacao). A visita e IMUTAVEL: erro = **cancelar (soft) e reenviar**.
7. A pagina Relatorios cria **tres** coisas, e a terceira nao e um registro: alem da Visita e do Semanal, a opcao **"Informativo"** (todo nao-PROSPECTOR, 2026-07-16) abre um painel de **duas colunas** — formulario a esquerda, **previa AO VIVO** da peca a direita (Mercado sempre; **Meteorologico** e uma secao opcional, ligada por toggle) — que gera **imagens 1080x1920 para o story do Instagram** e as entrega para download. _(As tres portas de criacao ficam em **botoes na faixa do topo** no desktop e no **leque do FAB** no mobile.)_ **Nada e salvo**: sem banco, sem storage, sem historico, e a peca nao aparece no feed. Os valores sao **digitados por quem publica** (o app nao busca cotacao nem previsao) e a previsao do tempo entra como **print colado**. Doc: `docs/Informativos-Plano-de-Trabalho.md`.

## Fora do escopo atual

1. Fila externa para impressao ou processamento assincromo.
2. Suite E2E versionada no repositorio.
3. RBAC tecnico detalhado por modulo de amostras (excecao ja implementada: gate por allowlist do `PROSPECTOR`).
