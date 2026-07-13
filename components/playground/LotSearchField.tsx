'use client';

import { useMemo, useState } from 'react';

import { searchMockLots } from '../../lib/playground/mock-lots';
import type { SampleSnapshot } from '../../lib/types';

// Busca embutida do node Lote (PG30): input inline + lista filtrando os lotes
// MOCKADOS (protótipo). A busca real (F2) troca só a fonte — mesma assinatura.
export function LotSearchField({ onPick }: { onPick: (sample: SampleSnapshot) => void }) {
  const [term, setTerm] = useState('');
  const results = useMemo(() => searchMockLots(term), [term]);

  return (
    <div className="pg-lot-search nodrag nopan">
      <input
        autoFocus
        value={term}
        placeholder="Buscar lote ou dono"
        aria-label="Buscar lote ou dono"
        onChange={(event) => setTerm(event.target.value)}
      />
      <ul className="pg-lot-search-list" role="listbox" aria-label="Lotes encontrados">
        {results.length === 0 ? (
          <li className="pg-lot-search-empty">Nenhum lote encontrado</li>
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
