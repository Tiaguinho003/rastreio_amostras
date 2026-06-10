-- Papel CADASTRO (2026-06-10): novo valor no enum UserRole.
--
-- "Cadastro" espelha o REGISTRATION (operacao geral: amostras, clientes,
-- informe) — sem telas administrativas e sem elegibilidade como responsavel
-- comercial (isCommercialRole continua so COMMERCIAL+PROSPECTOR). A
-- especializacao fica concentrada em src/auth/roles.js, mesmo padrao do
-- PROSPECTOR (migration 20260609120000_add_prospector_role).

ALTER TYPE "UserRole" ADD VALUE 'CADASTRO';
