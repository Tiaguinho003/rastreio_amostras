'use client';

// RC-D69 (2026-07-29): o lote deixou de ser um PASSO e virou um CAMPO.
//
// Antes disto a venda a vista comecava numa tela inteira (o
// `ContractLotPickerStep`, apagado nesta rodada) dedicada a uma unica resposta:
// qual lote. Um passo que responde UMA pergunta e um campo, nao um passo — e
// como campo ele entra na Identificacao, junto do numero e da data, disparando
// na hora o preenchimento do que o lote determina (vendedor, filial, conta,
// sacas, liga).
//
// RC-D30: "vendavel" e `sellableOnly`, nao `displayStatus=OPEN`. O displayStatus
// filtra pelo ROTULO `commercialStatus` e deixa passar dois lotes que a venda
// depois recusa — o sem quantidade declarada (que nasce 'OPEN' de proposito) e a
// liga de cascata inviavel. Ambos so falhavam no submit, com o formulario
// inteiro preenchido.
//
// Quem HIDRATA o lote escolhido e o pai (`getSampleDetail` + zeramento do que
// era do lote anterior): daqui sai so o snapshot da lista.

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { ApiError, listSamples } from '../../lib/api-client';
import { ownerDisplayValue } from '../../lib/sample-display';
import type { SampleSnapshot, SessionData } from '../../lib/types';
import { BlendBadge } from '../samples/BlendBadge';
import { HarvestDisplay } from '../samples/HarvestDisplay';

type ContractLotFieldProps = {
  session: SessionData;
  /** O lote ja escolhido. `null` = campo vazio. */
  selected: { id: string; lotNumber: string | null } | null;
  onSelect: (sample: SampleSnapshot) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Hidratacao em curso no pai: o campo para de aceitar toque enquanto isso. */
  busy?: boolean;
  invalid?: boolean;
};

// RC-D69: o dropdown mostra os primeiros N e pede refino, em vez do scroll
// infinito que a lista de tela cheia tinha. Um campo de formulario nao e lugar
// de navegar um catalogo — e de responder uma pergunta que o operador ja sabe.
const RESULT_LIMIT = 8;

function lotLabel(lotNumber: string | null): string {
  const lot = (lotNumber ?? '').trim();
  return lot || 'Sem número';
}

function lotOwnerLabel(sample: SampleSnapshot): string {
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

// Saldo do lote. Com `sellableOnly` (RC-D30) o backend so manda lote com
// quantidade declarada, entao o null nao chega aqui — mas a funcao nao mente se
// chegar.
function availableSacks(sample: SampleSnapshot): number | null {
  return typeof sample.availableSacks === 'number' ? sample.availableSacks : null;
}

// "80 de 300" quando parte do lote ja saiu — e o que distingue um lote do outro
// nesta lista, ja que aqui todos sao vendaveis e o chip de status diria sempre a
// mesma coisa.
function movedSacks(sample: SampleSnapshot): number {
  return (sample.soldSacks ?? 0) + (sample.lostSacks ?? 0);
}

export function ContractLotField({
  session,
  selected,
  onSelect,
  onClear,
  disabled = false,
  busy = false,
  invalid = false,
}: ContractLotFieldProps) {
  const inputId = useId();
  const [search, setSearch] = useState(selected ? lotLabel(selected.lotNumber) : '');
  const [items, setItems] = useState<SampleSnapshot[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastSelectedIdRef = useRef<string | null>(selected?.id ?? null);

  const normalizedSearch = useMemo(() => search.trim(), [search]);

  // Selecao trocada por fora (o pai limpou, ou re-hidratou depois do 409 do
  // lote): o texto do campo acompanha.
  useEffect(() => {
    const nextSelectedId = selected?.id ?? null;
    if (lastSelectedIdRef.current === nextSelectedId) return;
    lastSelectedIdRef.current = nextSelectedId;
    setSearch(selected ? lotLabel(selected.lotNumber) : '');
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!wrapRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Busca com debounce. Ao contrario do `ClientLookupField` (cujo backend exige
  // 2 caracteres), aqui a busca VAZIA e valida e devolve a primeira pagina —
  // entao so abrir o campo ja mostra lote pra escolher, sem obrigar a digitar.
  useEffect(() => {
    if (!open || disabled) return;

    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      listSamples(
        session,
        {
          search: normalizedSearch || undefined,
          sellableOnly: true,
          limit: RESULT_LIMIT,
        },
        { signal: controller.signal }
      )
        .then((response) => {
          if (!active) return;
          setItems(response.items);
          setHasMore(response.page.nextCursor != null);
        })
        .catch((cause) => {
          if (!active || controller.signal.aborted) return;
          setItems([]);
          setHasMore(false);
          setError(cause instanceof ApiError ? cause.message : 'Falha ao buscar os lotes.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [disabled, normalizedSearch, open, session]);

  function handleSelect(sample: SampleSnapshot) {
    lastSelectedIdRef.current = sample.id;
    setSearch(lotLabel(sample.internalLotNumber));
    setOpen(false);
    setError(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onSelect(sample);
  }

  function handleClear() {
    lastSelectedIdRef.current = null;
    setSearch('');
    setItems([]);
    setHasMore(false);
    setOpen(false);
    setError(null);
    onClear();
  }

  return (
    <div className="ctr-lotfield" ref={wrapRef}>
      <label htmlFor={inputId} className="login-visually-hidden">
        Lote
      </label>
      <div className={`ctr-lotfield-shell${selected ? ' has-selection' : ''}`}>
        <input
          id={inputId}
          value={search}
          disabled={disabled || busy}
          placeholder={busy ? 'Abrindo o lote...' : 'Buscar por nº do lote ou produtor'}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
            setError(null);
            // Digitar por cima de uma escolha DESFAZ a escolha: o campo nao pode
            // mostrar um texto e valer outro lote. O pai zera o que era do lote.
            if (selected) {
              lastSelectedIdRef.current = null;
              onClear();
            }
          }}
        />
        {selected ? (
          <button
            type="button"
            className="ctr-lotfield-clear"
            disabled={disabled || busy}
            aria-label="Remover o lote"
            onClick={handleClear}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="ctr-lotfield-dropdown">
          {loading ? <p className="ctr-lotfield-empty">Buscando lotes...</p> : null}
          {!loading && error ? <p className="ctr-lotfield-empty">{error}</p> : null}
          {!loading && !error && items.length === 0 ? (
            <p className="ctr-lotfield-empty">
              {normalizedSearch ? 'Nenhum lote encontrado.' : 'Nenhum lote disponível para venda.'}
            </p>
          ) : null}

          {!loading && !error && items.length > 0 ? (
            <>
              <ul className="ctr-lotfield-list" role="listbox" aria-label="Lotes disponíveis">
                {items.map((sample) => {
                  const available = availableSacks(sample);
                  const moved = movedSacks(sample);
                  return (
                    <li key={sample.id}>
                      <button
                        type="button"
                        className="ctr-lotfield-option"
                        onClick={() => handleSelect(sample)}
                      >
                        <span className="ctr-lotfield-option-title">
                          <span className="ctr-lotfield-option-lot">
                            {lotLabel(sample.internalLotNumber)}
                          </span>
                          {sample.isBlend ? <BlendBadge size="sm" /> : null}
                        </span>
                        {/* Os MESMOS quatro fatos que as quatro colunas da lista
                            de tela cheia mostravam: nada se perde no momento de
                            escolher, so muda de arranjo. */}
                        <span className="ctr-lotfield-option-meta">
                          {lotOwnerLabel(sample)}
                          {' · '}
                          {available === null ? '—' : available} sacas
                          {moved > 0 && available !== null ? ` de ${available + moved}` : ''}
                          {sample.declared.harvest ? (
                            <>
                              {' · '}
                              <HarvestDisplay
                                harvest={sample.declared.harvest}
                                showMixSafras={false}
                              />
                            </>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {/* Sem scroll infinito: a lista e capada e diz que capou. Um
                  "primeiros 8" silencioso leria como "so existem 8". */}
              {hasMore ? (
                <p className="ctr-lotfield-more">
                  Mostrando os primeiros {RESULT_LIMIT}. Refine a busca para ver outros.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
