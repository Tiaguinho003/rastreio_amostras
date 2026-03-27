# Produto e Fluxos

Status: Ativo  
Escopo: comportamento funcional oficial do sistema, estados da amostra e regras operacionais  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Arquitetura-Tecnica.md`, `docs/API-e-Contratos.md`

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
2. `SOLD`
3. `LOST`

Regra oficial:

1. o status comercial so pode ser alterado quando a amostra esta `CLASSIFIED`;
2. as transicoes validas sao `OPEN -> SOLD`, `OPEN -> LOST`, `SOLD -> OPEN` e `LOST -> OPEN`;
3. `INVALIDATED` bloqueia qualquer nova mudanca comercial.

## Fluxo oficial

### 1. Recebimento e registro

1. A amostra pode nascer por `receive` simples ou pelo fluxo completo de criacao da tela `Nova amostra`.
2. O registro confirmado exige os campos manuais:
   `owner`, `sacks`, `harvest`, `originLot`.
3. A foto de chegada e opcional.
4. Ao confirmar o registro, o sistema gera automaticamente um lote interno no padrao `A-NNNN` (sequencial global, ex: A-5444, A-5445).
5. O OCR permanece apenas como interface prevista no contrato. O fluxo implementado e manual.

### 2. Impressao de QR

1. A primeira impressao muda a amostra para `QR_PENDING_PRINT`.
2. O sucesso da primeira impressao muda a amostra para `QR_PRINTED`.
3. Falhas de impressao ficam registradas por evento e job, sem apagar historico.
4. Reimpressao e permitida quando a amostra esta em:
   `QR_PENDING_PRINT`, `QR_PRINTED`, `CLASSIFICATION_IN_PROGRESS` ou `CLASSIFIED`.

### 3. Classificacao

1. A classificacao so pode ser iniciada a partir de `QR_PRINTED`.
2. Durante `CLASSIFICATION_IN_PROGRESS`, a tela permite:
   carregar foto da classificacao;
   preencher os campos principais;
   salvar rascunho parcial;
   concluir a classificacao.
3. A foto da classificacao e obrigatoria para concluir.
4. A data de classificacao e registrada automaticamente na timezone `America/Sao_Paulo`.
5. Os principais grupos de campos hoje expostos na interface sao:
   `padrao`, `catacao`, `aspecto`, `bebida`, `classificador`, `loteOrigem`, `aspectoCor`;
   `broca`, `pva`, `imp`, `defeito`, `umidade`, `observacoes`;
   granulometria por peneiras `18`, `17`, `16`, `MK`, `15`, `14`, `13`, `10` e `Fundo`.

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

1. OCR automatico com worker real ou servico externo.
2. Fila externa para impressao ou processamento assincromo.
3. Ambiente `homolog` como trilha oficial de runtime.
4. Suite E2E versionada no repositorio.
5. RBAC tecnico detalhado por modulo de amostras.
