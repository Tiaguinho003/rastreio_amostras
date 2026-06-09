-- PROSPECTOR (2026-06-09): novo tipo de usuario que, por enquanto, espelha
-- integralmente os acessos do COMMERCIAL. Adicao pura ao enum UserRole.
--
-- ALTER TYPE ... ADD VALUE e aditivo e nao-destrutivo: nao recria o tipo, nao
-- toca dados nem triggers. Requer PostgreSQL 12+ (Cloud SQL atende). O valor e
-- apenas adicionado aqui; nenhum uso na mesma transacao. O Prisma migrate isola
-- cada migration na sua propria transacao, entao o ADD VALUE roda sozinho.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PROSPECTOR';
