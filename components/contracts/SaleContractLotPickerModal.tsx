'use client';

// Fechamento (criacao a vista pela pagina Contratos): modal de SELECAO DE LOTE.
// A venda a vista que parte da pagina precisa estar atrelada a um lote, entao
// este picker lista os lotes VENDAVEIS com busca por numero/produtor (debounce)
// e scroll infinito por cursor — mesmo backend do /samples.
//
// RC-D30: "vendavel" e `sellableOnly`, nao `displayStatus=OPEN`. O displayStatus
// filtra pelo ROTULO `commercialStatus` e deixava passar dois lotes que a venda
// depois recusa — o sem quantidade declarada (que nasce 'OPEN' de proposito) e a
// liga de cascata inviavel. Ambos so falhavam no submit, com o formulario inteiro
// preenchido.
//
// Ao escolher, HIDRATA o detalhe (getSampleDetail) pra obter o snapshot fresco
// (version/availableSacks/dono/safra atuais) e devolve via onPicked.

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getSampleDetail, listSamples } from '../../lib/api-client';
import { ownerDisplayValue, sampleStatusDisplay } from '../../lib/sample-display';
import type { SampleSnapshot, SessionData } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { BlendBadge } from '../samples/BlendBadge';
import { HarvestDisplay } from '../samples/HarvestDisplay';

type SaleContractLotPickerModalProps = {
  session: SessionData;
  open: boolean;
  onClose: () => void;
  onPicked: (sample: SampleSnapshot) => void;
  /** Pausa o arraste do sheet enquanto o form de criação está aberto por cima. */
  dragDisabled?: boolean;
};

const PAGE_LIMIT = 30;

function ownerLabel(sample: SampleSnapshot): string {
  // ownerDisplayValue e a fonte unica (trata "Carteira da corretora" da liga de
  // dono fixado); o fallback pelo cliente vinculado cobre o lote cujo
  // declaredOwner esta vazio mas tem dono no cadastro.
  const fromDisplay = ownerDisplayValue(sample).trim();
  if (fromDisplay && fromDisplay !== '—') return fromDisplay;
  const fromClient =
    sample.ownerClient?.displayName ??
    sample.ownerClient?.fullName ??
    sample.ownerClient?.tradeName ??
    null;
  return (fromClient ?? '').trim() || 'Sem produtor';
}

function lotLabel(sample: SampleSnapshot): string {
  const lot = (sample.internalLotNumber ?? '').trim();
  return lot || 'Sem número';
}

// Saldo do lote. Com `sellableOnly` (RC-D30) o backend so manda lote com
// quantidade declarada, entao o null nao chega aqui — mas a funcao nao mente se
// chegar. O antigo fallback pra `declared.sacks` era inalcancavel: availableSacks
// e null exatamente quando declaredSacks e null.
function availableSacks(sample: SampleSnapshot): number | null {
  return typeof sample.availableSacks === 'number' ? sample.availableSacks : null;
}

// "80 de 300" quando parte do lote ja saiu — e o que distingue um lote do outro
// nesta lista, ja que aqui todos sao vendaveis e o chip de status diria sempre a
// mesma coisa.
function movedSacks(sample: SampleSnapshot): number {
  return (sample.soldSacks ?? 0) + (sample.lostSacks ?? 0);
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
      { search: appliedSearch || undefined, sellableOnly: true, limit: PAGE_LIMIT },
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
        sellableOnly: true,
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
      onPicked(detail.sample);
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
      title={null}
      ariaLabel="Selecionar lote"
      dragDisabled={dragDisabled}
      closeVariant="edge-back"
      className="fv-panel-sheet side-sheet ctr-lotpick-sheet"
    >
      <p className="fv-panel-lead">A venda à vista parte de um lote.</p>

      <div className="lotpick-search">
        <input
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
            {items.map((sample) => {
              const status = sampleStatusDisplay(sample);
              const available = availableSacks(sample);
              const moved = movedSacks(sample);
              return (
                <button
                  key={sample.id}
                  type="button"
                  className={`spv2-card ${status.modifier} lotpick-card`}
                  onClick={() => void handlePick(sample)}
                >
                  <span className="spv2-card-content">
                    <span className="spv2-card-top">
                      <span className="spv2-card-code">{lotLabel(sample)}</span>
                      {sample.isBlend ? <BlendBadge size="sm" /> : null}
                      {/* Chip canonico (sampleStatusDisplay), nao rotulo fixo: o
                          "Em aberto" era literal no JSX e nao dependia do lote. */}
                      <span className={`fv-chip is-sm ${status.chip}`}>{status.label}</span>
                    </span>
                    <span className="spv2-card-bottom">
                      <span className="spv2-card-owner">{ownerLabel(sample)}</span>
                      <span className="spv2-card-dot" aria-hidden="true">
                        ·
                      </span>
                      <span className="spv2-card-detail">
                        {available === null ? '—' : available} sacas
                        {moved > 0 && available !== null ? (
                          <span className="lotpick-card-of">de {available + moved}</span>
                        ) : null}
                      </span>
                      {sample.declared.harvest ? (
                        <>
                          <span className="spv2-card-dot" aria-hidden="true">
                            ·
                          </span>
                          <span className="spv2-card-detail">
                            <HarvestDisplay
                              harvest={sample.declared.harvest}
                              showMixSafras={false}
                            />
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
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
    </BottomSheet>
  );
}
