-- F7.2: novo audit event type emitido pelo wizard de fissao
-- (scripts/migrations/f7-pj-split-wizard.mjs).
--
-- Quando um PJ legado tem mais de uma branch ATIVA por consequencia da fusao
-- F5.1, o wizard separa cada branch secundaria em um Client distinto. O
-- evento CLIENT_SPLIT preserva o vinculo origem -> destino para auditoria.
--
-- ALTER TYPE ADD VALUE precisa rodar fora de uma transaction com outras
-- DDLs sobre o mesmo enum; o Prisma migrate ja isola cada migration em sua
-- propria transacao, entao isto e seguro.

ALTER TYPE "ClientAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_SPLIT';
