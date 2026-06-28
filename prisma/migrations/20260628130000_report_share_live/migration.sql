-- Etiqueta de Envio -- laudo gerado AO VIVO (rota publica /laudo/[token]).
--
-- O PDF do laudo deixa de ser congelado em disco no momento do envio: a rota
-- publica passa a gera-lo a cada acesso, a partir do estado ATUAL da amostra
-- (classificar depois do envio reflete no mesmo QR). Com isso, as 4 colunas de
-- arquivo do share deixam de ser preenchidas nos shares novos.
--
-- ADITIVA / reversivel: apenas afrouxa NOT NULL (DROP NOT NULL e instantaneo,
-- sem rewrite/lock pesado). Linhas antigas (snapshot congelado) mantem seus
-- valores — a rota ao vivo ignora storage_path. Naturalmente idempotente
-- (DROP NOT NULL em coluna ja nullable e no-op). Migration MANUAL (padrao do
-- projeto; ver skill prisma).

ALTER TABLE "sample_report_share" ALTER COLUMN "storage_path" DROP NOT NULL;
ALTER TABLE "sample_report_share" ALTER COLUMN "file_name" DROP NOT NULL;
ALTER TABLE "sample_report_share" ALTER COLUMN "checksum_sha256" DROP NOT NULL;
ALTER TABLE "sample_report_share" ALTER COLUMN "size_bytes" DROP NOT NULL;
