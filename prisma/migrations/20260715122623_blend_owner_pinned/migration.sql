-- Liga (dono fixado): flag que marca o dono da liga como FIXADO manualmente.
-- Quando true, a propagacao reativa (deriveBlendOwner) NAO recalcula o dono da
-- liga — so a safra deriva das origens. true + owner_client_id null = "carteira
-- da corretora" (escolha explicita). Samples normais herdam false.
ALTER TABLE "sample" ADD COLUMN IF NOT EXISTS "blend_owner_pinned" BOOLEAN NOT NULL DEFAULT false;

-- Backfill (decisao do Flavio): fixa as ligas EXISTENTES que ja tem um dono
-- unanime hoje (protege o passado); as ligas sem dono seguem no modo derivado/
-- reativo ate um dono ser atribuido (que fixa). Idempotente.
UPDATE "sample" SET "blend_owner_pinned" = true WHERE "is_blend" = true AND "owner_client_id" IS NOT NULL;
