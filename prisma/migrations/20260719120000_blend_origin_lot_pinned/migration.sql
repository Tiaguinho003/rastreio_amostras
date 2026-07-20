-- Liga (lote de origem editavel/pinavel): flag que marca o LOTE DE ORIGEM da liga
-- como editado manualmente (estatuto "dono", espelha blend_owner_pinned). Quando
-- true, a propagacao reativa (deriveBlendOriginLot) NAO re-deriva a origem da liga
-- — ela fica no valor manual. Samples normais e ligas existentes herdam false
-- (derivam da somatoria das origens dos componentes). Backward-compatible.
ALTER TABLE "sample" ADD COLUMN IF NOT EXISTS "blend_origin_lot_pinned" BOOLEAN NOT NULL DEFAULT false;

-- SEM backfill do pin (default false = derivado, correto para as ligas atuais).
-- A origem derivada (declared_origin_lot) das ligas EXISTENTES fica para um
-- backfill de dados em prod (a derivacao roda no createBlend e na propagacao
-- reativa daqui pra frente); ate la a etiqueta da liga antiga sai sem lote.
