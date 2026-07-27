'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '../../lib/api-client';
import type { SampleSnapshot } from '../../lib/types';
import { usePlaygroundLots } from './lots-context';

/** Mesmo passo do ClientLookupField — o ritmo de busca do app é um só. */
const DEBOUNCE_MS = 180;

// Busca embutida do node Lote (PG30): input inline + lista da busca REAL
// (listSamples com statusGroup=CLASSIFIED, saldo > 0). Campo vazio já lista a
// primeira página, pra quem só quer garimpar. Lotes já usados em outro node
// não aparecem (PG46).
export function LotSearchField({ onPick }: { onPick: (sample: SampleSnapshot) => void }) {
  const { source, usedSampleIds } = usePlaygroundLots();
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<SampleSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      source
        .search(term, { signal: controller.signal })
        .then((found) => {
          if (active) setItems(found);
        })
        .catch((cause) => {
          // Aborto é troca de termo, não falha — o efeito seguinte já assumiu.
          if (!active || controller.signal.aborted) return;
          setItems([]);
          setError(cause instanceof ApiError ? cause.message : 'Falha ao buscar lotes');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [term, source]);

  // PG46: filtro na EXIBIÇÃO, não na query — o backend não sabe o que já está
  // no canvas, e o conjunto muda a cada node configurado ou removido.
  const results = items.filter((sample) => !usedSampleIds.has(sample.id));

  return (
    <div className="pg-lot-search nodrag nopan">
      <input
        autoFocus
        value={term}
        placeholder="Buscar lote ou dono"
        aria-label="Buscar lote ou dono"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setTerm(event.target.value)}
      />
      <ul className="pg-lot-search-list" role="listbox" aria-label="Lotes encontrados">
        {loading ? (
          <li className="pg-lot-search-status">Buscando…</li>
        ) : error ? (
          <li className="pg-lot-search-status is-error" role="alert">
            {error}
          </li>
        ) : results.length === 0 ? (
          <li className="pg-lot-search-status">
            {items.length > 0
              ? 'Todos os lotes encontrados já estão no fluxo'
              : 'Nenhum lote encontrado'}
          </li>
        ) : (
          results.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => onPick(sample)}
              >
                <strong>{sample.internalLotNumber}</strong>
                <span>
                  {sample.declared.owner ?? 'Sem dono'} · {sample.availableSacks ?? 0} sc
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
