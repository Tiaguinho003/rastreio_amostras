# Security Audit — rastreio-interno-amostras

Status: Ativo
Escopo: threat model e gap analysis das 9 categorias de seguranca
Ultima revisao: 2026-04-10
Executor: Claude Code (Passe 7A) + remediacao 7B+7C
Documentos relacionados: docs/README.md

## Resumo

Auditoria de seguranca realizada em 2026-04-10. Postura geral: razoavel
para sistema interno em estagio inicial. Fundacoes solidas em hashing
(bcrypt 10 rounds), JWT com secret via env var, cookie flags completos,
brute-force protection com lockout, audit trail robusto (13 event types).

Resultado: 12 OK, 9 GAP (7 corrigidos no 7B+7C), 5 RISCO (4 corrigidos
no 7B+7C), 1 OUT_OF_SCOPE (LGPD, debito documentado).

## Categorias

### 1. Autenticacao

- Hashing: OK (bcrypt 10 rounds)
- JWT: OK (HS256, AUTH_SECRET via env, min 16 chars, TTL 7d)
- Cookie: OK (HttpOnly, Secure auto, SameSite=lax)
- Bootstrap admin: CORRIGIDO 7B+7C (enforcement de troca de senha — backend retorna 403 PASSWORD_CHANGE_REQUIRED enquanto PENDING, 5 endpoints exemptados)
- Brute-force (por user): OK (lockout 8 tentativas, 5 min)
- Brute-force (por IP): CORRIGIDO 7B+7C (rate limiting 10 req/min por IP, 429 com retryAfter)
- Password reset: OK (6 digitos, SHA256, TTL 15 min, 5 tentativas)

### 2. Autorizacao

- Roles: OK (4 roles: ADMIN, CLASSIFIER, REGISTRATION, COMMERCIAL)
- Enforcement admin: OK (assertAdminActor em todas as 10 operacoes de user)
- Amostras: GAP ACEITO (any authenticated, single-tenant by design)
- IDOR: GAP ACEITO (single-tenant, sem multi-tenancy)
- Self-service: OK (actorUserId === targetUserId)

### 3. Input validation

- Body nos endpoints: GAP (debito Passe 8, normalizers cobrem no service layer)
- SQL injection: OK (Prisma parameterized + tagged templates em todos $queryRaw)
- Upload: CORRIGIDO 7B+7C (magic bytes com file-type, restringe a JPEG/PNG/WebP)
- Query params: OK (normalizers + readPositiveInteger + readPageQuery)

### 4. XSS

- dangerouslySetInnerHTML: OK (zero ocorrencias)
- Email templates: OK (escapeHtml em todos os campos user-provided)
- PDF reports: OK (pdf-lib drawText literal)
- PageTransition innerHTML: NOTA (conteudo React pre-escapado, risco minimo)

### 5. Headers HTTP

- Presentes: Referrer-Policy, X-Content-Type-Options, X-Frame-Options
- CORRIGIDO 7B+7C: HSTS (max-age=31536000), Permissions-Policy (camera=self, mic/geo bloqueados), CSP basico (default-src self, production-only), poweredByHeader: false

### 6. Secrets management

- Source code: OK (zero hardcoded em src/)
- Arquivos locais: RISCO LOCAL (.env/.mcp.json no disco, fora do git — git ls-files confirma vazio, git log confirma nunca comitados)
- Cloud Build: OK (Secret Manager via gcloud secrets)
- Rotacao: GAP (sem politica formal)

### 7. Dependency monitoring

- npm audit: OK (0 vulns)
- Dependabot: CORRIGIDO 7B+7C (.github/dependabot.yml, semanal, npm + actions)
- Lock file: OK (v3, Node >=22)

### 8. Logging

- Leak de segredos: OK (nenhum console.\* imprime tokens/passwords)
- Stack trace em respostas: OK (sanitizado em http-utils.js, two-tier)
- Structured logging: GAP (debito Passe 8, console.\* apenas)
- Audit trail: OK (13 event types de UserAuditEvent, append-only)

### 9. LGPD

- Classificacao: OUT_OF_SCOPE (debito documentado)
- PII identificado: User (name, email, phone), Client (name, cpf/cnpj, phone, address), SampleEvent payloads, SampleMovement snapshots
- Tensao: event store append-only com trigger anti-mutacao vs direito de exclusao. Trigger fn_prevent_sample_event_mutation impede UPDATE/DELETE em sample_event.
- Estimativa: M (tombstone event + redacao PII + excecao trigger)
- Volume atual: 11 eventos em prod. Risco real baixissimo.
- Recomendacao: implementar antes de escalar clientes ou ao receber primeira solicitacao de titular.

## Debitos aceitos e futuros

| Item                              | Motivo                              | Quando resolver                             |
| --------------------------------- | ----------------------------------- | ------------------------------------------- |
| Role granularity para amostras    | Single-tenant, any authenticated    | Se multi-tenancy for necessario             |
| IDOR prevention                   | Single-tenant                       | Se multi-tenancy for necessario             |
| Input validation nos 73 endpoints | Normalizers cobrem no service layer | Passe 8 ou quando adicionar endpoints novos |
| Structured logging                | Volume minimo                       | Passe 8 ou quando escalar                   |
| CSP avancado (nonces)             | CSP basico cobre o essencial        | Passe 8                                     |
| LGPD / right-to-erasure           | 11 eventos prod, risco baixissimo   | Antes de escalar clientes                   |
| Rotacao de secrets                | Sem politica formal                 | Documentar em revisao futura                |
