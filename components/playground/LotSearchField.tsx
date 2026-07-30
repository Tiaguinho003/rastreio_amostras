'use client';

import { useEffect, useRef, useState } from 'react';

import { ApiError } from '../../lib/api-client';
import type { SampleSnapshot } from '../../lib/types';
import { usePlaygroundLots } from './lots-context';

/** Mesmo passo do ClientLookupField — o ritmo de busca do app é um só. */
const DEBOUNCE_MS = 180;

// Busca de lotes (PG30, mudada de casa na PG60): era a busca EMBUTIDA no node
// recém-criado; virou o 2º passo do painel de nodes. O node não nasce mais
// vazio para ser configurado depois — nasce escolhido.
//
// A busca é a mesma (`listSamples` com `statusGroup=CLASSIFIED` e saldo > 0,
// campo vazio já lista a 1ª página, lotes no canvas filtrados na exibição pela
// PG46). O que o passo trouxe foi a `active`, e ela existe por dois motivos: não
// gastar uma busca de lotes em quem abriu o painel para pôr uma Mistura, e não
// roubar o foco do passo que está na tela. Ficar MONTADO no passo 1 é de
// propósito: voltar e avançar de novo devolve o termo e a lista onde estavam.
export function LotSearchField({
  active,
  onPick,
}: {
  active: boolean;
  onPick: (sample: SampleSnapshot) => void;
}) {
  const { source, usedSampleIds } = usePlaygroundLots();
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<SampleSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!active) return;
    // O `autoFocus` do JSX dispararia na MONTAGEM, com o passo 1 na tela.
    inputRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      source
        .search(term, { signal: controller.signal })
        .then((found) => {
          if (alive) setItems(found);
        })
        .catch((cause) => {
          // Aborto é troca de termo, não falha — o efeito seguinte já assumiu.
          if (!alive || controller.signal.aborted) return;
          setItems([]);
          setError(cause instanceof ApiError ? cause.message : 'Falha ao buscar lotes');
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [active, term, source]);

  // PG46: filtro na EXIBIÇÃO, não na query — o backend não sabe o que já está
  // no canvas, e o conjunto muda a cada node criado ou removido.
  const results = items.filter((sample) => !usedSampleIds.has(sample.id));

  return (
    <div className="pg-lot-search">
      <input
        ref={inputRef}
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
                <strong>
                  {sample.internalLotNumber}
                  {sample.isBlend ? <span className="pg-node-badge">liga</span> : null}
                </strong>
                {/* O mesmo trio que o node mostra no hover — aqui há espaço, e é
                    o que decide qual lote entra. */}
                <span>
                  {sample.declared.owner ?? 'Sem dono'} · safra {sample.declared.harvest ?? '—'} ·{' '}
                  {sample.availableSacks ?? 0} sc
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
