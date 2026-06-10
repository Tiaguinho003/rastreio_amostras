-- Informe de visita offline (2026-06-10): coluna captured_at.
--
-- Envios preenchidos sem internet ficam numa fila local (IndexedDB) e sao
-- sincronizados quando a conexao volta. Nesses casos o aparelho informa a
-- hora real do preenchimento (captured_at, validada no service: nao pode
-- ser futura). created_at segue carimbado pelo servidor como "recebido em".
-- Envio online direto: captured_at fica NULL e created_at vale como a hora
-- da visita (comportamento atual).

ALTER TABLE "visit_report" ADD COLUMN "captured_at" TIMESTAMPTZ(6);
