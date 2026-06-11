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

1. A amostra pode nascer por `receive` simples ou pelo fluxo completo de criacao da tela `Nova amostra`.
2. O registro confirmado exige os campos manuais:
   `owner`, `sacks`, `harvest`, `originLot`.
3. A foto de chegada e opcional.
4. Ao confirmar o registro, o sistema gera automaticamente um lote interno numerico (sequencial global, ex: 5641, 5642).
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
2. O fluxo principal e via `Camera inteligente`, com sequencia de modais:
   foto da ficha → extracao IA (1 prompt unico, type-agnostic) → modal de revisao
   da ficha unificada → modal de tipo de cafe (`BICA`, `PREPARADO`, `BAIXO`,
   `ESCOLHA`) → modal de classificadores → save direto (Q.auto dispara print).
3. A foto da classificacao e obrigatoria para concluir, seja pelo fluxo de camera ou pelo fluxo manual legado.
4. A data de classificacao e registrada automaticamente na timezone `America/Sao_Paulo`.
5. O tipo de cafe define quais campos aparecem no formulario; os principais grupos hoje expostos sao:
   `padrao`, `catacao`, `aspecto`, `bebida`, `classificador`, `loteOrigem`, `aspectoCor`, `certif`;
   `broca`, `pva`, `imp`, `defeito`, `umidade`, `observacoes`;
   granulometria por peneiras `18`, `17`, `16`, `MK`, `15`, `14`, `13`, `10` e `Fundo`.
6. Reclassificar uma amostra ja `CLASSIFIED` e feito a partir do modal de detalhe — aciona o mesmo fluxo de camera e emite `CLASSIFICATION_UPDATED` com motivo automatico.

#### Extracao por IA

1. O sistema usa GPT-4o para extrair os campos manuscritos da ficha de classificacao a partir da foto, com prompts especializados por tipo de cafe.
2. O pipeline tem tres etapas: `detect-form` tenta auto-detectar e recortar a ficha; `extract-and-prepare` envia a foto (ou o recorte) para o modelo e retorna os campos extraidos; `confirm` persiste a classificacao apos revisao manual do usuario.
3. Os campos extraidos sao pre-preenchidos no formulario, **mas o usuario sempre revisa e confirma antes de salvar**. A extracao nunca e aceita automaticamente.
4. Cada tentativa gera `CLASSIFICATION_EXTRACTION_COMPLETED` (sucesso) ou `CLASSIFICATION_EXTRACTION_FAILED` (erro), anexados ao historico da amostra.
5. Em caso de falha da deteccao ou da extracao, o usuario pode prosseguir manualmente com o formulario vazio.
6. O servico depende da variavel `OPENAI_API_KEY` — ausente, o modulo de extracao responde `503` e o fluxo de camera ainda funciona com preenchimento manual.

#### Conferencia da classificacao

1. Entre a escolha do tipo e a foto, o modal pergunta obrigatoriamente se a classificacao foi conferida por outros classificadores.
2. Se sim, o usuario seleciona um ou mais usuarios ativos do sistema via picker com busca client-side.
3. O backend valida a lista em `normalizeConferredBy`: rejeita auto-conferral (ator nao pode estar na lista), rejeita usuarios inativos ou inexistentes, faz dedup silencioso, limita a 50 entradas.
4. O conjunto final e persistido como `conferredBy` no payload de `CLASSIFICATION_COMPLETED` (snapshot com `{id, fullName, username}`), editavel pos-classificacao via `CLASSIFICATION_UPDATED`.
5. A conferencia aparece no card resumo da classificacao, no modal full-view e no laudo PDF exportado (em linha unica, com os nomes dos classificadores separados por barra).

### 4. Laudo e consulta

1. O laudo PDF so pode ser gerado quando a amostra esta `CLASSIFIED`.
2. A interface gera um **unico laudo** ("Laudo Tecnico"), que omite proprietario e
   lote de origem (internamente usa o tipo `COMPRADOR_PARCIAL`). O tipo `COMPLETO`
   (com proprietario) permanece no backend apenas por compatibilidade com eventos
   `REPORT_EXPORTED` historicos — nao ha acesso a ele pela UI.
3. Em amostra com mais de uma safra (liga de safras diferentes), ao gerar o laudo
   o operador escolhe qual safra sai nele (`reportedHarvest`, registrado no evento):
   o laudo nunca imprime a safra concatenada, pra nao revelar que e uma liga.
4. O detalhe da amostra expoe historico, anexos, QR, dados principais, classificacao e status comercial.

## Regras de ajuste e auditoria

1. O historico de amostras e append-only por evento.
2. Edicao de registro nunca sobrescreve silenciosamente: gera `REGISTRATION_UPDATED`.
3. Edicao de classificacao nunca sobrescreve silenciosamente: gera `CLASSIFICATION_UPDATED`.
4. Toda edicao exige `reasonCode` e `reasonText`.
5. `reasonText` de edicao e limitado a 10 palavras no backend atual.
6. O detalhe da amostra permite reverter a ultima edicao reversivel com novo motivo auditado.
7. A invalidacao encerra a amostra em status terminal e nao existe reabertura implementada.

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
2. Dashboard dedicado: cards "Visitas hoje" e "Clientes novos hoje" (janela do dia no fuso de Brasilia, base `capturedAt ?? createdAt`), lista dos proprios informes (cards expansiveis compartilhados com `/resumo`) e botao central "+" que abre o formulario de visita num bottom sheet. A fila offline e o contador de pendentes sao os mesmos do `/informe`.
3. Visibilidade: a lista do dashboard mostra os informes de todos os prospectores (comparacao da equipe; busca por nome do cliente e contador de registros acompanham). Os cards "Visitas/Hoje" e "Clientes novos/Hoje" contam apenas o que o proprio usuario enviou, e a lixeira de exclusao aparece so nos informes dele.
4. Lembrete diario de push (seg–sex 11h) abre `/dashboard?informe=novo` com o formulario ja aberto.
5. API: allowlist central — fora de sessao/conta, push, lookup de clientes e informes, qualquer endpoint autenticado responde `403 ROLE_FORBIDDEN` (fonte canonica: `src/auth/prospector-access.js`).
6. O formulario continua disponivel na pagina `/informe` para os demais papeis; o feed `/resumo` segue com `ADMIN`, `COMMERCIAL` e `CADASTRO`.

## Fora do escopo atual

1. Fila externa para impressao ou processamento assincromo.
2. Suite E2E versionada no repositorio.
3. RBAC tecnico detalhado por modulo de amostras (excecao ja implementada: gate por allowlist do `PROSPECTOR`).
