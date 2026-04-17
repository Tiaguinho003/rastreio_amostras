# Threat Model — rastreio-interno-amostras

Status: Ativo
Escopo: analise estruturada de ameacas e mitigacoes derivada do security audit (Passe 7A)
Ultima revisao: 2026-04-10
Documentos relacionados: `docs/SECURITY.md`, `docs/SECURITY-audit.md`

## Superficie de ataque

1. **Frontend (browser)** → Next.js App Router → Route Handlers (`app/api/`) → Service Layer (`src/`) → Prisma → PostgreSQL (Cloud SQL)
2. **Upload path:** browser → route handler → `LocalUploadService` (magic bytes validation → filesystem/Cloud Storage mount)
3. **Auth path:** login → bcrypt verify → JWT sign → cookie HTTP-only → middleware verify → session hydration
4. **Email path:** service layer → nodemailer (SMTP em prod, outbox local em dev)
5. **External API:** service layer → OpenAI API (classification extraction, server-side only)

## Atores

1. **Usuarios autenticados** — 4 roles (ADMIN, CLASSIFIER, REGISTRATION, COMMERCIAL). Todos operam amostras (single-tenant).
2. **Administradores** — ADMIN role. Gestao exclusiva de usuarios, sessoes, auditoria.
3. **Atacantes externos** — sem autenticacao. Acesso ao endpoint de login e password reset.

## Ameacas por categoria

### 1. Autenticacao

| Ameaca                            | Mitigacao                                                                 | Status                | Risco residual                                               |
| --------------------------------- | ------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| Brute-force no login              | Lockout por user (8 tentativas, 5 min) + rate limit por IP (10 req/min)   | Mitigado              | Atacante com pool de IPs pode contornar rate limit in-memory |
| Roubo de token JWT                | HttpOnly cookie impede acesso via JS; SameSite=Lax bloqueia CSRF via POST | Mitigado              | Token valido por 7 dias; sessao pode ser revogada            |
| Senha fraca                       | Bcrypt 10 rounds; sem politica de complexidade                            | Parcialmente mitigado | Sem requisito minimo de complexidade alem do min 8 chars     |
| Password reset brute-force        | Codigo 6 digitos, SHA256 hash, TTL 15 min, 5 tentativas                   | Mitigado              | 1 em 200k por janela de lockout                              |
| Primeiro login sem troca de senha | 403 PASSWORD_CHANGE_REQUIRED bloqueia endpoints; frontend mostra modal    | Mitigado              | -                                                            |

### 2. Autorizacao

| Ameaca                                       | Mitigacao                                                        | Status        | Risco residual                        |
| -------------------------------------------- | ---------------------------------------------------------------- | ------------- | ------------------------------------- |
| Acesso nao-admin a gestao de usuarios        | assertAdminActor em todas as 10 operacoes                        | Mitigado      | -                                     |
| IDOR (acessar amostra/cliente de outro user) | Nao implementado (single-tenant by design)                       | Debito aceito | Risco se multi-tenancy for necessario |
| Escalacao de privilegio via role             | Roles validadas no service layer; JWT nao permite self-elevation | Mitigado      | -                                     |

### 3. Input validation

| Ameaca                      | Mitigacao                                                                              | Status                | Risco residual                        |
| --------------------------- | -------------------------------------------------------------------------------------- | --------------------- | ------------------------------------- |
| SQL injection               | Prisma ORM + tagged template literals em todos $queryRaw                               | Mitigado              | -                                     |
| Upload de binario malicioso | Magic bytes via file-type (JPEG/PNG/WebP); size limit 12 MiB                           | Mitigado              | Nao ha antivirus scan                 |
| Body request invalido       | Normalizers no service layer (client-support.js, user-support.js); event validator Ajv | Parcialmente mitigado | Sem schema validation no nivel da API |
| Query param injection       | normalizeOptionalText (200 chars), readPositiveInteger, readPageQuery; Prisma ORM      | Mitigado              | -                                     |

### 4. XSS

| Ameaca                         | Mitigacao                                            | Status       | Risco residual |
| ------------------------------ | ---------------------------------------------------- | ------------ | -------------- |
| XSS via user input renderizado | React auto-escape; zero dangerouslySetInnerHTML      | Mitigado     | -              |
| XSS via email template         | escapeHtml() em todos os campos user-provided        | Mitigado     | -              |
| XSS via PDF                    | pdf-lib drawText literal (nao interpreta HTML/JS)    | Mitigado     | -              |
| innerHTML em PageTransition    | Captura DOM ja renderizado pelo React (pre-escapado) | Nota tecnica | Risco minimo   |

### 5. Headers HTTP

| Ameaca                 | Mitigacao                                                | Status                | Risco residual                                  |
| ---------------------- | -------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| Clickjacking           | X-Frame-Options: SAMEORIGIN + CSP frame-ancestors 'none' | Mitigado              | -                                               |
| MIME type confusion    | X-Content-Type-Options: nosniff                          | Mitigado              | -                                               |
| Downgrade HTTPS        | HSTS max-age=31536000; includeSubDomains                 | Mitigado              | Sem preload (dominio .run.app do Google)        |
| Fingerprinting Next.js | poweredByHeader: false                                   | Mitigado              | -                                               |
| Script injection       | CSP script-src 'self' 'unsafe-inline'                    | Parcialmente mitigado | unsafe-inline necessario para Next.js hydration |

### 6. Secrets management

| Ameaca                     | Mitigacao                                                                  | Status        | Risco residual                |
| -------------------------- | -------------------------------------------------------------------------- | ------------- | ----------------------------- |
| Secret hardcoded em codigo | Zero secrets em src/; todos via env vars                                   | Mitigado      | -                             |
| Secret em repo git         | .gitignore cobre .env\*, .mcp.json; git ls-files confirma nenhum rastreado | Mitigado      | -                             |
| Secret em disco local      | .env e .mcp.json existem no disco do dev                                   | Risco local   | Mitigado se maquina protegida |
| Rotacao de secrets         | Sem politica formal                                                        | Debito aceito | Risco baixo para volume atual |

### 7. Dependency monitoring

| Ameaca                         | Mitigacao                             | Status                | Risco residual                                  |
| ------------------------------ | ------------------------------------- | --------------------- | ----------------------------------------------- |
| Vulnerabilidade em dependencia | npm audit 0 vulns; Dependabot semanal | Mitigado              | Janela de ate 7 dias entre disclosure e PR      |
| Supply chain attack            | lockfileVersion 3; npm ci em CI       | Parcialmente mitigado | Sem verificacao de integridade alem do lockfile |

### 8. Logging

| Ameaca                             | Mitigacao                                              | Status        | Risco residual                                  |
| ---------------------------------- | ------------------------------------------------------ | ------------- | ----------------------------------------------- |
| Leak de secrets em logs            | Nenhum console.\* imprime tokens/passwords/connections | Mitigado      | -                                               |
| Stack trace exposto ao client      | http-utils.js sanitiza resposta (two-tier)             | Mitigado      | Stack trace vai pro log do servidor (aceitavel) |
| Ausencia de audit trail para admin | 13 event types em UserAuditEvent, append-only          | Mitigado      | -                                               |
| Sem structured logging             | Console.\* apenas                                      | Debito aceito | Aceitavel para volume atual                     |

### 9. LGPD

| Ameaca                           | Mitigacao                                  | Status             | Risco residual                            |
| -------------------------------- | ------------------------------------------ | ------------------ | ----------------------------------------- |
| Solicitacao de exclusao de dados | Nao implementado (append-only event store) | Debito documentado | Risco legal se titular solicitar exclusao |
| PII em payloads de evento        | Identificado e mapeado em schema.prisma    | Identificado       | Sem mecanismo de redacao                  |
| Volume de PII                    | 11 eventos prod, poucos users              | Baixo risco        | Escala futura aumenta exposicao           |

## Matriz de risco resumo

| Categoria        | Ameaca principal            | Probabilidade | Impacto | Status                              |
| ---------------- | --------------------------- | ------------- | ------- | ----------------------------------- |
| Autenticacao     | Brute-force com pool de IPs | Baixa         | Medio   | Mitigado (rate limit por instancia) |
| Autorizacao      | IDOR cross-user             | Baixa         | Alto    | Debito aceito (single-tenant)       |
| Input validation | Upload de binario malicioso | Baixa         | Medio   | Mitigado (magic bytes)              |
| XSS              | Script injection            | Muito baixa   | Alto    | Mitigado (React + CSP)              |
| Headers          | Downgrade HTTPS             | Muito baixa   | Medio   | Mitigado (HSTS)                     |
| Secrets          | Exposicao via disco local   | Baixa         | Alto    | Risco local aceito                  |
| Dependencies     | Vuln em dep transitive      | Media         | Medio   | Mitigado (Dependabot)               |
| Logging          | Ausencia de structured logs | Baixa         | Baixo   | Debito aceito                       |
| LGPD             | Solicitacao de exclusao     | Baixa         | Alto    | Debito documentado                  |

## Referencias

- [`docs/SECURITY.md`](SECURITY.md) — politica de seguranca e runbook
- [`docs/SECURITY-audit.md`](SECURITY-audit.md) — audit snapshot com status OK/GAP/RISCO
