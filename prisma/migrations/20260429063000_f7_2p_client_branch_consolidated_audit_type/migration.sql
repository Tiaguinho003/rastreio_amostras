-- F7.2': novo audit event type emitido pelo wizard de consolidacao
-- (scripts/migrations/f7-pj-consolidate-wizard.mjs).
--
-- A estrategia inicial F7.2 (fissao em N Clients distintos) foi substituida
-- por consolidacao destrutiva: PJs com >1 branch ATIVA tem suas secundarias
-- DELETADAS, com samples/movements re-aimados para a primary e audit events
-- das secundarias removidos via escape valve `app.allow_audit_mutation`.
-- Este novo evento e emitido na primary preservando o registro do que foi
-- consolidado (lista de branches deletadas, contagens, CNPJs).
--
-- O enum value CLIENT_SPLIT permanece reservado (Postgres nao remove enum
-- values); novo codigo nao deve emiti-lo.

ALTER TYPE "ClientAuditEventType" ADD VALUE IF NOT EXISTS 'CLIENT_BRANCH_CONSOLIDATED';
