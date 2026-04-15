# Produto e Fluxos

Status: Ativo  
Escopo: comportamento funcional oficial do sistema, estados da amostra e regras operacionais  
Ultima revisao: 2026-04-15  
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

Regra consolidada nesta revisao:

1. `ADMIN` e obrigatorio para gestao de usuarios e auditoria administrativa.
2. No dominio de amostras, o backend atual aceita qualquer usuario autenticado para as operacoes de fluxo.
3. Isso significa que os papeis nao impõem, hoje, um RBAC tecnico forte por etapa de amostra.
4. Qualquer necessidade futura de segregacao mais rigida por modulo deve ser tratada como evolucao de permissao, nao como comportamento ja existente.

## Ciclo de vida da amostra

### Status operacionais

1. `PHYSICAL_RECEIVED`
   A amostra foi recebida, mas o registro ainda nao comecou.
2. `REGISTRATION_IN_PROGRESS`
   O registro esta em andamento.
3. `REGISTRATION_CONFIRMED`
   Os dados minimos foram confirmados e o lote interno foi gerado.
4. `QR_PENDING_PRINT`
   A impressao inicial do QR foi solicitada e aguarda conclusao.
5. `QR_PRINTED`
   A etiqueta principal foi impressa e a classificacao pode iniciar.
6. `CLASSIFICATION_IN_PROGRESS`
   A classificacao esta em execucao, com suporte a rascunho parcial.
7. `CLASSIFIED`
   A classificacao foi concluida.
8. `INVALIDATED`
   Estado terminal. Nao permite novas operacoes de fluxo.

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
4. Ao confirmar o registro, o sistema gera automaticamente um lote interno no padrao `A-NNNN` (sequencial global, ex: A-5444, A-5445).
5. O fluxo de registro e inteiramente manual.

### 2. Impressao de QR

1. A primeira impressao muda a amostra para `QR_PENDING_PRINT`.
2. O sucesso da primeira impressao muda a amostra para `QR_PRINTED`.
3. Falhas de impressao ficam registradas por evento e job, sem apagar historico.
4. Reimpressao e permitida quando a amostra esta em:
   `QR_PENDING_PRINT`, `QR_PRINTED`, `CLASSIFICATION_IN_PROGRESS` ou `CLASSIFIED`.

### 3. Classificacao

1. A classificacao so pode ser iniciada a partir de `QR_PRINTED`.
2. O fluxo principal hoje e via `Camera inteligente`, com quatro fases conduzidas pelo mesmo modal:
   escolha do tipo de cafe (`BICA`, `PREPARADO`, `LOW_CAFF`);
   conferencia por outros classificadores (ver subsecao abaixo);
   foto da ficha fisica de classificacao com auto-crop e extracao por IA (ver subsecao abaixo);
   revisao dos campos extraidos e confirmacao.
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
5. A conferencia aparece no card resumo da classificacao, no modal full-view e no laudo PDF exportado (com truncamento a partir de 8 nomes).

### 4. Laudo e consulta

1. O laudo PDF so pode ser gerado quando a amostra esta `CLASSIFIED`.
2. O fluxo atual oferece dois tipos de exportacao:
   `COMPLETO` e `COMPRADOR_PARCIAL`.
3. O detalhe da amostra expoe historico, anexos, QR, dados principais, classificacao e status comercial.

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

## Fora do escopo atual

1. Fila externa para impressao ou processamento assincromo.
2. Suite E2E versionada no repositorio.
3. RBAC tecnico detalhado por modulo de amostras.
