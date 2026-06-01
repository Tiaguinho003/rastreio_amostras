-- Q.types (2026-06-01): add CONILON ao enum ClassificationType.
--
-- Adicao pura (sem rename/backfill, ao contrario da 20260508183713 que
-- renomeou LOW_CAFF -> BAIXO). ALTER TYPE ... ADD VALUE e aditivo e
-- nao-destrutivo: nao recria o tipo, nao toca dados nem triggers.
-- Requer PostgreSQL 12+ (Cloud SQL atende). O valor e apenas adicionado
-- aqui; nenhum uso na mesma transacao.

ALTER TYPE "ClassificationType" ADD VALUE 'CONILON';
