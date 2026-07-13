'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';

// Evento do dashboard → `?highlight=<contractId>` na página dona (SPLIT 2026-07-13:
// pagamento/faturamento → /contratos, embarque → /embarques): quando o contrato tocado
// está na página JÁ carregada da worklist (Financeiro / Contratos / Embarque), rola até
// ele e o "pisca" por ~2s. Uma vez por id (não re-dispara em refetch/scroll). Best-effort:
// se o contrato não está na página (paginação keyset), não faz nada — o chip leva à aba
// de qualquer forma, e os itens com evento (vencido/atrasado) ficam no topo da fila.
export function useContractHighlight(
  items: ReadonlyArray<{ id: string }>,
  scrollRef: RefObject<HTMLElement | null>
): string | null {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const flashedRef = useRef<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId || flashedRef.current === highlightId) return;
    if (!items.some((item) => item.id === highlightId)) return;
    flashedRef.current = highlightId;
    setFlashId(highlightId);
    const el = scrollRef.current?.querySelector(`[data-contract-id="${highlightId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => setFlashId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [items, highlightId, scrollRef]);

  return flashId;
}
