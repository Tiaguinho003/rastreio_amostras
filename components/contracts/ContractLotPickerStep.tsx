'use client';

// Fechamento (criacao a vista pela pagina Contratos): a SELECAO DE LOTE.
// A venda a vista que parte da pagina precisa estar atrelada a um lote, entao
// este passo lista os lotes VENDAVEIS com busca por numero/produtor (debounce)
// e scroll infinito por cursor — mesmo backend do /samples.
//
// RC-D30: "vendavel" e `sellableOnly`, nao `displayStatus=OPEN`. O displayStatus
// filtra pelo ROTULO `commercialStatus` e deixava passar dois lotes que a venda
// depois recusa — o sem quantidade declarada (que nasce 'OPEN' de proposito) e a
// liga de cascata inviavel. Ambos so falhavam no submit, com o formulario inteiro
// preenchido.
//
// RC-D49/D50 (2026-07-28): o card saiu do `.spv2-card` legado (gradiente creme,
// radius 16, sombra tripla) e virou superficie FV. Os dados — os MESMOS de antes
// — deixaram de correr numa linha separada por pontos e viraram QUATRO COLUNAS
// alinhadas, com cabecalho fixo no topo: comparar dois lotes deixou de exigir
// reler cada linha inteira. Celular mantem a linha corrida (RC-D52), pelo mesmo
// markup — quem troca o desenho e a media query, nao um branch em JS.
//
// RC-D57 (2026-07-28): isto DEIXOU DE SER UM SHEET. Era um `BottomSheet` irmao
// do formulario — um descia enquanto o outro subia, e o "Voltar" destruia o
// formulario pra reabrir este. Virou o PRIMEIRO PASSO do painel do contrato
// (`containers` §1-A), ao lado do formulario e do documento. Por isso nao ha
// mais `open`/`onClose` aqui: quem gere a superficie, o rodape e a saida e o
// `SaleContractEtapa2Modal`.
//
// Quem HIDRATA o lote escolhido tambem e o pai (getSampleDetail + o proximo
// numero de contrato): o resultado abre o passo seguinte, entao a decisao de
// avancar nao pode morar aqui.

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, listSamples } from '../../lib/api-client';
import { ownerDisplayValue } from '../../lib/sample-display';
import type { SampleSnapshot, SessionData } from '../../lib/types';
import { BlendBadge } from '../samples/BlendBadge';
import { HarvestDisplay } from '../samples/HarvestDisplay';

type ContractLotPickerStepProps = {
  session: SessionData;
  /** O pai hidrata o lote e avanca o passo. */
  onPick: (sample: SampleSnapshot) => void;
  /** Hidratacao em curso: a lista para de aceitar toque enquanto isso. */
  busy: boolean;
  /** Falha do PAI ao abrir o lote — some no lugar do erro da lista. */
  pickError: string | null;
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

export function ContractLotPickerStep({
  session,
  onPick,
  busy,
  pickError,
}: ContractLotPickerStepProps) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [items, setItems] = useState<SampleSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ lotInt: number | null; id: string } | null>(null);
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

  const shownError = pickError ?? error;

  return (
    <>
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

      {shownError ? <p className="sdv-modal-error lotpick-error">{shownError}</p> : null}

      {/* `aria-busy` enquanto o pai hidrata o lote: antes o segundo toque era
          engolido por um early-return invisivel — agora a lista mostra que
          esta ocupada. */}
      <div className="lotpick-list" aria-busy={busy}>
        {loading ? (
          <p className="lotpick-status">Carregando lotes...</p>
        ) : items.length === 0 ? (
          <p className="lotpick-status">
            {appliedSearch ? 'Nenhum lote encontrado.' : 'Nenhum lote disponível para venda.'}
          </p>
        ) : (
          <>
            {/* RC-D50: cabecalho das colunas, como o thead de uma tabela. Mora
                DENTRO da rolagem (sticky) de proposito — assim herda o padding
                lateral da lista e alinha com os cards sem recalcular recuo. So
                aparece quando ha cards, e so no desktop (no celular o card volta
                a ser uma linha corrida, sem coluna que rotular). aria-hidden
                porque o rotulo nao tem como se associar a celula: quem le por
                audio recebe o texto do proprio botao, ja com as unidades. */}
            <div className="lotpick-head" aria-hidden="true">
              <span>Lote</span>
              <span>Produtor</span>
              <span>Sacas</span>
              <span>Safra</span>
            </div>
            {items.map((sample) => {
              const available = availableSacks(sample);
              const moved = movedSacks(sample);
              return (
                <button
                  key={sample.id}
                  type="button"
                  className="lotpick-card"
                  onClick={() => onPick(sample)}
                >
                  {/* RC-D51: o chip de status saiu. Nesta lista TODO lote e
                      vendavel (sellableOnly), entao ele dizia sempre a mesma
                      coisa — e a classe `is-card-*` que vinha junto ja era
                      inerte aqui (o .spv2-card-bar nunca foi renderizado). */}
                  <span className="lotpick-card-grid">
                    <span className="lotpick-c lotpick-c-lot">
                      <span className="lotpick-lot-num">{lotLabel(sample)}</span>
                      {sample.isBlend ? <BlendBadge size="sm" /> : null}
                    </span>
                    <span className="lotpick-c lotpick-c-owner">{ownerLabel(sample)}</span>
                    <span className="lotpick-c lotpick-c-sacks">
                      <span>{available === null ? '—' : available} sacas</span>
                      {moved > 0 && available !== null ? (
                        <span className="lotpick-card-of">de {available + moved}</span>
                      ) : null}
                    </span>
                    <span className="lotpick-c lotpick-c-harvest">
                      {sample.declared.harvest ? (
                        <HarvestDisplay harvest={sample.declared.harvest} showMixSafras={false} />
                      ) : (
                        '—'
                      )}
                    </span>
                  </span>
                  <svg className="lotpick-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
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
    </>
  );
}
