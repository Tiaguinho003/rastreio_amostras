CREATE INDEX "idx_sample_status_updated_id" ON "sample"("status", "updated_at" ASC, "id" ASC);
CREATE INDEX "idx_sample_status_created_id" ON "sample"("status", "created_at" DESC, "id" DESC);
