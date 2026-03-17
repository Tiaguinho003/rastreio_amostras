# Arquitetura Tecnica

Status: Ativo  
Escopo: stack, componentes, modelo de dados, autenticacao e limites tecnicos da aplicacao  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Produto-e-Fluxos.md`, `docs/Operacao-e-Runtime.md`

## Visao geral

O projeto e um monolito modular em Next.js, com frontend e backend no mesmo repositorio. A aplicacao usa route handlers em `app/api` para adaptar requests HTTP a uma camada de servicos em `src/`, mantendo as regras de negocio fora da camada web.

## Stack principal

1. TypeScript
2. Next.js 15 com App Router
3. React 19
4. Prisma 6
5. PostgreSQL
6. JSON Schema + Ajv para validacao de eventos
7. `pdf-lib` para laudos
8. `nodemailer` para notificacoes por SMTP ou outbox local

## Organizacao do codigo

1. `app/`
   Telas, layout e route handlers do Next.js.
2. `components/`
   Componentes compartilhados do frontend.
3. `lib/`
   Tipos, schemas de formulario, cliente HTTP e utilitarios de UI.
4. `src/api/`
   API framework-agnostic usada pelos route handlers.
5. `src/samples/`
   Servicos de comando e consulta do dominio de amostras.
6. `src/users/`
   Gestao de usuarios, auditoria, sessoes e recuperacao de acesso.
7. `src/auth/`
   emissao e validacao de token, politica de cookie e autenticacao baseada em banco.
8. `src/events/`
   persistencia append-only e validacao do event stream.
9. `src/reports/`
   geracao do laudo PDF.
10. `src/uploads/`
    persistencia de fotos em filesystem configurado por runtime, incluindo volume montado no Cloud Run.

## Modelo de dados

### Dominio de amostras

1. `Sample`
   Snapshot atual da amostra, com status operacional, status comercial e projeções da classificacao.
2. `SampleEvent`
   Timeline append-only com envelope padrao, metadados, request IDs e idempotencia.
3. `SampleAttachment`
   Fotos de chegada e classificacao.
4. `PrintJob`
   Registro de tentativas de impressao e reimpressao.

### Dominio de usuarios

1. `User`
   Conta principal com papel, status, senha hash, email e trilha de login.
2. `UserSession`
   Sessao emitida no login, com expiracao, revogacao e motivo de encerramento.
3. `PasswordResetRequest`
   Pedido de recuperacao por codigo.
4. `EmailChangeRequest`
   Pedido de troca de email com reserva de endereco.
5. `UserAuditEvent`
   Auditoria administrativa de criacao, edicao, bloqueio, inativacao, reset e login.

## Regras arquiteturais consolidadas

1. O historico de amostras e append-only.
2. O estado atual da amostra e materializado em `Sample`, mas a trilha completa vive em `SampleEvent`.
3. Concorrencia otimista usa `expectedVersion`.
4. Operacoes criticas usam escopos de idempotencia.
5. Impressao usa `PrintJob` em banco, sem fila externa.
6. Uploads usam filesystem configurado por `UPLOADS_DIR`; em nuvem, esse path pode apontar para volume montado.

## Autenticacao e sessao

1. O backend oficial usa `DatabaseAuthService`.
2. O login valida credenciais no banco, cria `UserSession` e emite token Bearer assinado por `AUTH_SECRET`.
3. No frontend web, esse token e encapsulado em cookie HTTP-only de sessao.
4. Sessoes podem ser revogadas por logout, mudanca de papel, mudanca de usuario, inativacao, reset de senha e expiracao.
5. A politica de `Secure` do cookie depende de `SESSION_COOKIE_SECURE`, com suporte a `false`, `auto` e `true`.

## Uploads, email e laudos

1. Fotos de amostra ficam em storage baseado em path configurado por `UPLOADS_DIR`.
2. Email pode usar:
   `smtp` em runtime operacional;
   `outbox` local em development ou fallback.
3. Laudos PDF sao gerados a partir do estado consolidado da amostra classificada e geram evento `REPORT_EXPORTED`.
4. O runtime aplica limite server-side de `8 MiB` por imagem por padrao.

## API interna

1. Os route handlers do Next.js ficam em `app/api`.
2. A logica HTTP comum e delegada ao backend framework-agnostic em `src/api/v1/backend-api.js`.
3. Isso reduz duplicacao e facilita teste de regras sem depender da camada de framework.

## Testes e validacao

O repositorio possui hoje:

1. validacao de schemas:
   `npm run validate:schemas`
2. teste de contratos:
   `npm run test:contracts`
3. testes unitarios:
   `npm run test:unit`
4. integracao de backend:
   `npm run test:backend:integration`
5. integracao com DB:
   `npm run test:integration:db`

Regra consolidada:

1. ha cobertura real de contrato, auth, cookies e integracao de backend;
2. nao ha suite E2E versionada no repositorio nesta data.

## Limites tecnicos atuais

1. OCR automatico ainda nao foi implementado como servico real.
2. Nao existe worker dedicado para processamento assincromo.
3. O dominio de amostras ainda nao possui segregacao forte de permissao por papel.
4. O restore de backup nao possui wrapper canonico proprio; o backup e canonico, mas o restore continua procedimento manual de operador.
