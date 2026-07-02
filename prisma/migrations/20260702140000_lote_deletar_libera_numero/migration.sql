-- Feature "Deletar lote" (antes "Invalidar"): ao deletar um lote (soft-delete,
-- status -> INVALIDATED) o número interno é LIBERADO para reuso, sendo nulado na
-- projeção. Isso exige relaxar a guarda de imutabilidade de `internal_lot_number`
-- para PERMITIR a nulificação nesse caso específico (e SÓ nesse caso).
--
-- Continua proibido: transicionar para fora de INVALIDATED (terminal) e alterar o
-- número para QUALQUER outro valor não-nulo. A liberação via NULL aproveita a
-- semântica do UNIQUE `uq_sample_internal_lot` (NULLs são distintos no Postgres),
-- então o número volta a ficar disponível sem tocar no gerador nem no índice.
--
-- Só a FUNÇÃO muda; a trigger `trg_sample_guard_update` a referencia por nome
-- (CREATE OR REPLACE não precisa recriar a trigger). Idempotente.

CREATE OR REPLACE FUNCTION "fn_guard_sample_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'INVALIDATED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'sample status INVALIDATED is terminal and cannot transition';
  END IF;

  -- internal_lot_number é imutável, EXCETO a liberação no delete: quando o lote é
  -- deletado (status -> INVALIDATED) o número pode ser NULADO, liberando-o para
  -- reuso. Qualquer outra alteração (inclusive trocar por outro valor não-nulo)
  -- continua proibida.
  IF OLD.internal_lot_number IS NOT NULL
     AND NEW.internal_lot_number IS DISTINCT FROM OLD.internal_lot_number
     AND NOT (NEW.status = 'INVALIDATED' AND NEW.internal_lot_number IS NULL) THEN
    RAISE EXCEPTION 'internal_lot_number is immutable once defined';
  END IF;

  RETURN NEW;
END;
$$;
