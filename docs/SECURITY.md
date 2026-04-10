# Politica de Seguranca

Status: Ativo
Escopo: politica de seguranca, principios, autenticacao, autorizacao e runbook de resposta a incidente
Ultima revisao: 2026-04-10
Documentos relacionados: `docs/SECURITY-audit.md`, `docs/SECURITY-threat-model.md`, `SECURITY.md`

## Postura geral

Sistema interno B2B em estagio inicial (11 eventos em prod), operado pela Measy. Fundacoes solidas em auth (bcrypt 10 rounds, JWT com secret via env var, cookie HttpOnly + Secure + SameSite), brute-force protection com lockout por user e rate limit por IP, audit trail robusto (13 event types de UserAuditEvent), headers HTTP completos (HSTS, CSP, Permissions-Policy) e upload validado por magic bytes. Hardening aplicado no Passe 7 (2026-04-10).

## Principios de seguranca

1. Append-only event store com trigger anti-mutacao (`fn_prevent_sample_event_mutation`)
2. Bcrypt 10 rounds para senhas (`bcryptjs`)
3. JWT HS256 com secret via `AUTH_SECRET` (min 16 chars), TTL 7 dias
4. Cookie de sessao HttpOnly + Secure(auto) + SameSite=Lax + Path=/
5. Brute-force protection: lockout por user (8 tentativas, 5 min) + rate limit por IP (10 req/min, 429)
6. CSP restritiva em production (`default-src 'self'`, `script-src 'self' 'unsafe-inline'`)
7. Headers de seguranca: HSTS, Permissions-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, poweredByHeader off
8. Upload validado por magic bytes via `file-type` (JPEG, PNG, WebP apenas)
9. Dependabot semanal para monitoramento de dependencias npm e GitHub Actions
10. Password enforcement: 403 PASSWORD_CHANGE_REQUIRED para primeiro login de admin

## Autenticacao e sessao

1. O backend usa `DatabaseAuthService` que valida credenciais no banco via `UserService.verifyCredentials`.
2. Login bem-sucedido cria `UserSession` e emite token Bearer assinado por `AUTH_SECRET` (`src/auth/token-service.js`).
3. No frontend web, o token e encapsulado em cookie HTTP-only (`app/api/v1/_lib/session-cookie.ts`).
4. Sessoes podem ser revogadas por: logout, mudanca de papel, inativacao, reset de senha e expiracao.
5. Lockout: 8 tentativas falhadas de login bloqueiam o user por 5 min (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MS` em `src/users/user-support.js`).
6. Rate limit por IP: 10 requests/min por IP no endpoint de login (`src/auth/rate-limiter.js`). Retorna 429 com `retryAfter`.
7. Password reset: codigo de 6 digitos, hash SHA256, TTL 15 min, max 5 tentativas com lockout 5 min.
8. Primeiro login: se `initialPasswordDecision === 'PENDING'`, backend retorna 403 com code `PASSWORD_CHANGE_REQUIRED`. Frontend mostra modal de troca forcada. Endpoints exemptados: getSession, logout, getCurrentUser, changeCurrentUserPassword, recordInitialPasswordDecision.

## Autorizacao

1. 4 roles: ADMIN, CLASSIFIER, REGISTRATION, COMMERCIAL (`src/auth/roles.js`).
2. User management: restrito a ADMIN via `assertAdminActor` em todas as 10 operacoes (`src/users/user-service.js`).
3. Amostras: qualquer usuario autenticado pode operar (single-tenant by design). Roles funcionam como marcacao organizacional, nao barreira tecnica por modulo.
4. Self-service: operacoes de perfil/senha verificam `actorUserId === targetUserId`.

## Headers HTTP

Configurados em `next.config.mjs`:

1. `Referrer-Policy: strict-origin-when-cross-origin`
2. `X-Content-Type-Options: nosniff`
3. `X-Frame-Options: SAMEORIGIN`
4. `Strict-Transport-Security: max-age=31536000; includeSubDomains`
5. `Permissions-Policy: camera=(self), microphone=(), geolocation=(), interest-cohort=()`
6. `Content-Security-Policy` (production-only): `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
7. `poweredByHeader: false` (suprime `X-Powered-By: Next.js`)

## Rate limiting

1. Implementado como middleware in-memory (`src/auth/rate-limiter.js`).
2. Sliding window de 60s, max 10 requests por IP.
3. Retorna 429 com `retryAfter` em segundos.
4. Cleanup automatico de entries expiradas a cada 5 min.
5. Limitacao conhecida: in-memory por instancia Cloud Run. Com 1 instancia (escala atual), funciona. Para escalar, migrar para Cloud Armor ou Redis.

## Monitoramento de dependencias

1. Dependabot configurado em `.github/dependabot.yml`.
2. Frequencia: semanal (segunda-feira).
3. Escopo: npm + GitHub Actions.
4. PRs com label `dependencies` e prefixo `chore(deps):` / `ci(deps):`.

## Gestao de secrets

1. Producao e homologacao: secrets injetados via Google Cloud Secret Manager no Cloud Build (`cloudbuild.homolog.yaml`).
2. Desenvolvimento local: env vars em `.env.development` (gitignored, nunca commitadas).
3. Zero secrets hardcoded em `src/`, `app/`, `lib/`, `components/`, `scripts/`.
4. Rotacao: sem politica formal. Debito aceito para volume atual.

## LGPD e protecao de dados

1. PII identificado: User (name, email, phone), Client (name, cpf/cnpj, phone, address), SampleEvent payloads (owner data), SampleMovement snapshots (buyer PII).
2. Tensao: event store append-only com trigger `fn_prevent_sample_event_mutation` impede UPDATE/DELETE em `sample_event`. Direito de exclusao (LGPD Art. 18) requer mecanismo de tombstone/redacao nao implementado.
3. Status: debito documentado. Volume atual (11 eventos prod) torna risco real baixissimo.
4. Recomendacao: implementar antes de escalar clientes ou ao receber primeira solicitacao de titular.
5. Estimativa de implementacao: M (tombstone event type + funcao de redacao PII + excecao no trigger + migration).

## Debitos de seguranca aceitos

| Item                              | Motivo                              | Quando resolver                          |
| --------------------------------- | ----------------------------------- | ---------------------------------------- |
| Role granularity para amostras    | Single-tenant, any authenticated    | Se multi-tenancy for necessario          |
| IDOR prevention                   | Single-tenant                       | Se multi-tenancy for necessario          |
| Input validation nos 73 endpoints | Normalizers cobrem no service layer | Quando adicionar endpoints novos         |
| Structured logging                | Volume minimo                       | Quando escalar                           |
| CSP avancado (nonces)             | CSP basico cobre o essencial        | Quando necessario                        |
| LGPD / right-to-erasure           | 11 eventos prod, risco baixissimo   | Antes de escalar clientes                |
| Rotacao de secrets                | Sem politica formal                 | Documentar em revisao futura             |
| Rate limit distribuido            | Single-instance Cloud Run           | Quando escalar para multiplas instancias |

## Runbook de resposta a incidente

### 1. Identificacao

- Quem reportou (user, monitoramento, terceiro)?
- Severidade estimada (critica, alta, media, baixa)?
- Qual vetor de ataque (auth, data leak, injection, infra)?

### 2. Contencao

- Se auth comprometida: revogar todas as sessoes:
  ```sql
  UPDATE "UserSession"
  SET "revokedAt" = NOW(), "revokedReason" = 'security-incident'
  WHERE "revokedAt" IS NULL;
  ```
- Se AUTH_SECRET comprometida: rotacionar via Secret Manager e redeployar.
- Se API key exposta: rotacionar imediatamente no provedor (OpenAI, etc.).

### 3. Investigacao

- Audit trail: consultar `UserAuditEvent` (login, criacao, alteracao de role).
- Event timeline: consultar `SampleEvent` para acoes sobre amostras.
- Logs Cloud Run: `gcloud run services logs read rastreio-hml-app --region=southamerica-east1`.

### 4. Correcao

- Hotfix no branch `main`.
- Push aciona deploy automatico em hml.
- Validar no hml: smoke test + verificacao manual.
- Deploy manual em prod via `scripts/gcp/build-image.sh` + `scripts/gcp/deploy-cloud.sh`.

### 5. Comunicacao

- Notificar stakeholders (Flavio como owner, clientes afetados se houver).
- Documentar em ADR se houver mudanca de arquitetura.

### 6. Post-mortem

- Atualizar `docs/SECURITY-audit.md` com novos achados.
- Adicionar testes para o vetor explorado.
- Considerar novos headers, rate limits ou validacoes.

## Contatos

- Responsavel: Flavio Oliveira (flaviohfoliveira@gmail.com)
