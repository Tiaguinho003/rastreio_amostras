-- Embarque FASE 2 (EMB30): transporte "Pela empresa | Por terceiros" + responsavel.
--
-- Aditiva idempotente (skill prisma; nunca `migrate dev`). Enum novo + 3 colunas
-- nullable no sale_contract (null = nao embarcado, molde shipped_at) + FK RESTRICT do
-- responsavel p/ app_user (so no SQL, padrao das sub-refs de contrato). Sem CHECK: a
-- trava e o 422 SHIPMENT_RESPONSIBLE_INVALID do servico (o carrier IS NULL do legado
-- tornaria o CHECK mais fragil que util; so 1 caminho de codigo ramifica, != D147).

DO $$ BEGIN
  CREATE TYPE "ShipmentCarrier" AS ENUM ('COMPANY', 'THIRD_PARTY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "sale_contract"
  ADD COLUMN IF NOT EXISTS "shipment_carrier" "ShipmentCarrier",
  ADD COLUMN IF NOT EXISTS "shipment_responsible_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "shipment_responsible_name" TEXT;

DO $$ BEGIN
  ALTER TABLE "sale_contract"
    ADD CONSTRAINT "sale_contract_shipment_responsible_user_id_fkey"
    FOREIGN KEY ("shipment_responsible_user_id") REFERENCES "app_user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
