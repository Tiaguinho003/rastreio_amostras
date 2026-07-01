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

import { ApiError, getSampleDetail, listSamples } from '../../lib/api-client';
import type { ActiveBlendDetail, SampleSnapshot, SessionData } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { BlendBadge } from '../samples/BlendBadge';

type SaleContractLotPickerModalProps = {
  session: SessionData;
  open: boolean;
  onClose: () => void;
  onPicked: (sample: SampleSnapshot, activeBlends: ActiveBlendDetail[]) => void;
  /** Pausa o arraste do sheet enquanto o form de criação está aberto por cima. */
  dragDisabled?: boolean;
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
  return lot || 'Sem número';
}

function availableLabel(sample: SampleSnapshot): number {
  if (typeof sample.availableSacks === 'number') return sample.availableSacks;
  return typeof sample.declared.sacks === 'number' ? sample.declared.sacks : 0;
}

export function SaleContractLotPickerModal({
  session,
  open,
  onClose,
  onPicked,
  dragDisabled = false,
}: SaleContractLotPickerModalProps) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [items, setItems] = useState<SampleSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ lotInt: number | null; id: string } | null>(null);
  const [hydratingId, setHydratingId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={() => hydratingId === null}
      title="Selecionar lote"
      ariaLabel="Selecionar lote"
      dragDisabled={dragDisabled}
      className="ctr-form-sheet ctr-lotpick-sheet is-fit-content"
    >
      <p className="lotpick-hint">A venda à vista parte de um lote.</p>

      <div className="lotpick-search">
        <input
          className="app-modal-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nº do lote ou produtor..."
          autoComplete="off"
          spellCheck={false}
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
            {items.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className="spv2-card is-card-open lotpick-card"
                onClick={() => void handlePick(sample)}
              >
                <span className="spv2-card-bar" aria-hidden="true" />
                <span className="spv2-card-content">
                  <span className="spv2-card-top">
                    <span className="spv2-card-code">{lotLabel(sample)}</span>
                    {sample.isBlend ? <BlendBadge size="sm" /> : null}
                    <span className="spv2-card-badge">Em aberto</span>
                  </span>
                  <span className="spv2-card-bottom">
                    <span className="spv2-card-owner">{ownerLabel(sample)}</span>
                    <span className="spv2-card-sep" aria-hidden="true" />
                    <span className="spv2-card-detail">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="2" y="7" width="20" height="14" rx="2" />
                        <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
                      </svg>
                      {availableLabel(sample)} sacas
                    </span>
                    {sample.declared.harvest ? (
                      <>
                        <span className="spv2-card-sep" aria-hidden="true" />
                        <span className="spv2-card-detail">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <path d="M16 2v4M8 2v4M3 10h18" />
                          </svg>
                          {sample.declared.harvest}
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>
                <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            ))}
            {cursor ? (
              <div ref={sentinelRef} className="lotpick-sentinel">
                {loadingMore ? 'Carregando mais...' : ''}
              </div>
            ) : null}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
