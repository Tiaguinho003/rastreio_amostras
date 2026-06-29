'use client';

// Fechamento (criacao a vista pela pagina Contratos): modal de SELECAO DE LOTE.
// A venda a vista que parte da pagina precisa estar atrelada a um lote, entao
// este picker lista os lotes VENDAVEIS (displayStatus=OPEN: status != INVALIDATED
// e commercialStatus em OPEN/PARTIALLY_SOLD => tem saldo) com busca por numero/
// produtor (debounce) e scroll infinito por cursor — mesmo backend do /samples.
//
// Ao escolher, HIDRATA o detalhe (getSampleDetail) pra obter o snapshot fresco
// (version/availableSacks atuais) + activeBlends, e devolve ambos via onPicked —
// e o que o SampleMovementModal precisa pra abrir a venda identica a do lote
// (inclusive ligas, com o aviso de origem em ligas ativas).

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, getSampleDetail, listSamples } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ActiveBlendDetail, SampleSnapshot, SessionData } from '../../lib/types';

type SaleContractLotPickerModalProps = {
  session: SessionData;
  onClose: () => void;
  onPicked: (sample: SampleSnapshot, activeBlends: ActiveBlendDetail[]) => void;
};

const PAGE_LIMIT = 30;

function ownerLabel(sample: SampleSnapshot): string {
  const fromClient =
    sample.ownerClient?.displayName ??
    sample.ownerClient?.fullName ??
    sample.ownerClient?.tradeName ??
    null;
  const value = (fromClient ?? sample.declared.owner ?? '').trim();
  return value || 'Sem produtor';
}

function lotLabel(sample: SampleSnapshot): string {
  const lot = (sample.internalLotNumber ?? '').trim();
  return lot ? `Lote ${lot}` : 'Lote sem número';
}

function availableLabel(sample: SampleSnapshot): number {
  if (typeof sample.availableSacks === 'number') return sample.availableSacks;
  return typeof sample.declared.sacks === 'number' ? sample.declared.sacks : 0;
}

export function SaleContractLotPickerModal({
  session,
  onClose,
  onPicked,
}: SaleContractLotPickerModalProps) {
  const focusTrapRef = useFocusTrap(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [items, setItems] = useState<SampleSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ lotInt: number | null; id: string } | null>(null);
  const [hydratingId, setHydratingId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Esc fecha (a menos que esteja hidratando um lote escolhido).
  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !hydratingId) onClose();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [onClose, hydratingId]);

  // Debounce da busca -> appliedSearch (recarrega a lista do zero).
  useEffect(() => {
    const handle = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Carga inicial / por busca.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listSamples(
      session,
      { search: appliedSearch || undefined, displayStatus: 'OPEN', limit: PAGE_LIMIT },
      { signal: controller.signal }
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res.items);
        setCursor(res.page.nextCursor ?? null);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar os lotes.');
        setItems([]);
        setCursor(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session, appliedSearch]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listSamples(session, {
        search: appliedSearch || undefined,
        displayStatus: 'OPEN',
        limit: PAGE_LIMIT,
        cursorLotInt: cursor.lotInt != null ? String(cursor.lotInt) : undefined,
        cursorId: cursor.id,
      });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.page.nextCursor ?? null);
    } catch {
      setCursor(null);
    } finally {
      setLoadingMore(false);
    }
  }, [session, appliedSearch, cursor, loadingMore]);

  // Scroll infinito: observa o sentinel no rodape da lista.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root: node.closest('.lotpick-list'), rootMargin: '120px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loading, loadMore]);

  async function handlePick(sample: SampleSnapshot) {
    if (hydratingId) return;
    setHydratingId(sample.id);
    setError(null);
    try {
      const detail = await getSampleDetail(session, sample.id);
      onPicked(detail.sample, detail.activeBlends ?? []);
    } catch (cause) {
      setHydratingId(null);
      setError(cause instanceof ApiError ? cause.message : 'Falha ao abrir o lote.');
    }
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action lotpick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lotpick-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="lotpick-modal-title" className="app-modal-title">
              Selecionar lote
            </h3>
            <p className="app-modal-description">A venda à vista parte de um lote.</p>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={hydratingId !== null}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="lotpick-search">
          <input
            className="app-modal-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nº do lote ou produtor..."
            autoComplete="off"
            spellCheck={false}
            disabled={hydratingId !== null}
          />
        </div>

        {error ? <p className="sdv-modal-error lotpick-error">{error}</p> : null}

        <div className="lotpick-list">
          {loading ? (
            <p className="lotpick-status">Carregando lotes...</p>
          ) : items.length === 0 ? (
            <p className="lotpick-status">
              {appliedSearch ? 'Nenhum lote encontrado.' : 'Nenhum lote disponível para venda.'}
            </p>
          ) : (
            <>
              {items.map((sample) => {
                const isHydrating = hydratingId === sample.id;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    className={`lotpick-row${isHydrating ? ' is-loading' : ''}`}
                    onClick={() => void handlePick(sample)}
                    disabled={hydratingId !== null}
                  >
                    <span className="lotpick-row-main">
                      <span className="lotpick-row-lot">
                        {lotLabel(sample)}
                        {sample.isBlend ? <span className="lotpick-row-liga">Liga</span> : null}
                      </span>
                      <span className="lotpick-row-owner">{ownerLabel(sample)}</span>
                    </span>
                    <span className="lotpick-row-meta">
                      <span className="lotpick-row-sacks">{availableLabel(sample)} sc disp.</span>
                      {sample.declared.harvest ? (
                        <span className="lotpick-row-harvest">{sample.declared.harvest}</span>
                      ) : null}
                    </span>
                    {isHydrating ? <span className="lotpick-row-hint">Abrindo...</span> : null}
                  </button>
                );
              })}
              {cursor ? (
                <div ref={sentinelRef} className="lotpick-sentinel">
                  {loadingMore ? 'Carregando mais...' : ''}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
