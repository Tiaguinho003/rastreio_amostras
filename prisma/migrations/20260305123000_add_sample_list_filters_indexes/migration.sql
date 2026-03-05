CREATE INDEX "idx_sample_updated_id" ON "sample"("updated_at", "id");
CREATE INDEX "idx_sample_declared_owner" ON "sample"("declared_owner");
CREATE INDEX "idx_sample_declared_harvest" ON "sample"("declared_harvest");
CREATE INDEX "idx_sample_created_at" ON "sample"("created_at");
