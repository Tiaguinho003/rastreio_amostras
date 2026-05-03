'use client';

import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';

import { ApiError, lookupClients } from '../../lib/api-client';
import { formatClientDocument } from '../../lib/client-field-formatters';
import type {
  ClientUnitSummary,
  ClientLookupKind,
  ClientSummary,
  SessionData,
} from '../../lib/types';
import { ClientCompleteBadge } from './ClientCompleteBadge';

type ClientLookupFieldProps = {
  session: SessionData;
  label: string;
  kind: ClientLookupKind;
  selectedClient: ClientSummary | null;
  onSelectClient: (client: ClientSummary | null) => void;
  /** L5: callback opcional para modo hierarquico — apenas PF tem fazendas. */
  onSelectUnit?: (client: ClientSummary, unit: ClientUnitSummary | null) => void;
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
  invalidText?: string;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  onRequestCreate?: (search: string) => void;
  createLabel?: string;
  compact?: boolean;
  required?: boolean;
};

type LookupRow = {
  key: string;
  client: ClientSummary;
  unit: ClientUnitSummary | null;
  isHierarchicalChild: boolean;
};

function getClientDocument(client: ClientSummary) {
  return formatClientDocument(
    client.document ?? (client.personType === 'PF' ? client.cpf : client.cnpj),
    client.personType
  );
}

function buildHierarchicalRows(items: ClientSummary[]): LookupRow[] {
  const rows: LookupRow[] = [];
  for (const client of items) {
    // L5: PJ guarda dados direto no Client (nao tem units). Linha simples.
    if (client.personType === 'PJ') {
      rows.push({ key: client.id, client, unit: null, isHierarchicalChild: false });
      continue;
    }

    // PF: 0 ou N fazendas. Sem fazendas -> linha simples (sem nesting).
    const units = client.units ?? [];
    if (units.length === 0) {
      rows.push({ key: client.id, client, unit: null, isHierarchicalChild: false });
      continue;
    }

    // PF com fazendas: 1 linha-pai (cliente) + N linhas-filhas (cada fazenda).
    rows.push({ key: client.id, client, unit: null, isHierarchicalChild: false });
    for (const unit of units) {
      rows.push({
        key: `${client.id}:${unit.id}`,
        client,
        unit,
        isHierarchicalChild: true,
      });
    }
  }
  return rows;
}

function buildUnitLabel(unit: ClientUnitSummary): string {
  const tag = `Fazenda ${unit.code}`;
  const place = unit.city && unit.state ? ` · ${unit.city}/${unit.state}` : '';
  const name = unit.name ? ` — ${unit.name}` : '';
  return `${tag}${name}${place}`;
}

export function ClientLookupField({
  session,
  label,
  kind,
  selectedClient,
  onSelectClient,
  onSelectUnit,
  inputRef,
  invalid = false,
  invalidText = 'Obrigatorio',
  disabled = false,
  placeholder = 'Busque por nome, documento ou codigo',
  emptyMessage = 'Nenhum cliente encontrado.',
  onRequestCreate,
  createLabel = 'Cadastrar cliente',
  compact = false,
  required = false,
}: ClientLookupFieldProps) {
  const inputId = useId();
  const [search, setSearch] = useState(selectedClient?.displayName ?? '');
  const [items, setItems] = useState<ClientSummary[]>([]);
  const [matchedUnitId, setMatchedUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastSelectedIdRef = useRef<string | null>(selectedClient?.id ?? null);

  const normalizedSearch = useMemo(() => search.trim(), [search]);
  const isHierarchical = typeof onSelectUnit === 'function';

  useEffect(() => {
    const nextSelectedId = selectedClient?.id ?? null;
    if (lastSelectedIdRef.current === nextSelectedId) {
      return;
    }

    lastSelectedIdRef.current = nextSelectedId;
    setSearch(selectedClient?.displayName ?? '');
  }, [selectedClient]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!wrapRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || disabled) {
      return;
    }

    if (normalizedSearch.length < 1) {
      setItems([]);
      setMatchedUnitId(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(null);

      lookupClients(session, {
        search: normalizedSearch,
        kind,
      })
        .then((response) => {
          if (!active) {
            return;
          }

          setItems(response.items);
          setMatchedUnitId(response.matchedUnitId ?? null);
        })
        .catch((cause) => {
          if (!active) {
            return;
          }

          setItems([]);
          setMatchedUnitId(null);
          setError(cause instanceof ApiError ? cause.message : 'Falha ao buscar clientes');
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [disabled, kind, normalizedSearch, open, session]);

  function handleSelectClient(client: ClientSummary, unit: ClientUnitSummary | null) {
    lastSelectedIdRef.current = client.id;
    setSearch(client.displayName ?? '');
    setOpen(false);
    setError(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onSelectClient(client);
    if (isHierarchical && onSelectUnit) {
      onSelectUnit(client, unit);
    }
  }

  const rows: LookupRow[] = useMemo(
    () =>
      isHierarchical
        ? buildHierarchicalRows(items)
        : items.map((client) => ({
            key: client.id,
            client,
            unit: null,
            isHierarchicalChild: false,
          })),
    [isHierarchical, items]
  );

  return (
    <div
      className={`client-lookup-field${invalid ? ' is-invalid' : ''}${compact ? ' is-compact' : ''}`}
      ref={wrapRef}
    >
      <label htmlFor={inputId} className={compact ? 'login-visually-hidden' : undefined}>
        {label}
        {required ? <span className="nsv2-required-star"> *</span> : null}
      </label>
      <div
        className={`client-lookup-shell${compact ? ' is-compact' : ''}${selectedClient ? ' has-selection' : ''}`}
      >
        <input
          id={inputId}
          ref={inputRef}
          value={search}
          disabled={disabled}
          placeholder={invalid && !search ? invalidText : placeholder}
          autoComplete="off"
          aria-invalid={invalid}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSearch(nextValue);
            setOpen(true);
            setError(null);

            if (selectedClient) {
              lastSelectedIdRef.current = null;
              onSelectClient(null);
            }
          }}
        />
        {selectedClient && !compact ? (
          <button
            type="button"
            className="client-lookup-inline-clear"
            disabled={disabled}
            aria-label="Remover proprietario"
            onClick={() => {
              lastSelectedIdRef.current = null;
              setSearch('');
              setItems([]);
              setMatchedUnitId(null);
              setOpen(false);
              setError(null);
              onSelectClient(null);
            }}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      {error && !compact ? <p className="error client-lookup-feedback">{error}</p> : null}

      {open && (loading || error || normalizedSearch.length >= 2) ? (
        <div className={`client-lookup-dropdown${compact ? ' is-compact' : ''}`}>
          {loading ? <p className="client-lookup-empty">Buscando clientes...</p> : null}
          {!loading && normalizedSearch.length >= 2 && rows.length === 0 && !error ? (
            <div className="client-lookup-empty">
              <p style={{ margin: 0 }}>{emptyMessage}</p>
              {onRequestCreate ? (
                <button
                  type="button"
                  className="secondary client-lookup-create"
                  onClick={() => {
                    setOpen(false);
                    onRequestCreate(normalizedSearch);
                  }}
                >
                  {createLabel}
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && rows.length > 0 ? (
            <ul className="client-lookup-list" role="listbox" aria-label={label}>
              {rows.map((row) => {
                const isMatched = matchedUnitId !== null && row.unit?.id === matchedUnitId;
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      className={`client-lookup-option${row.isHierarchicalChild ? ' is-child' : ''}${isMatched ? ' is-matched' : ''}`}
                      onClick={() => handleSelectClient(row.client, row.unit)}
                    >
                      <span className="client-lookup-option-title">
                        {row.client.displayName ?? 'Sem nome'}
                        {row.unit ? (
                          <span className="client-lookup-option-branch">
                            {' · '}
                            {buildUnitLabel(row.unit)}
                          </span>
                        ) : null}
                        {isMatched ? (
                          <span className="client-lookup-option-matched"> · CNPJ exato</span>
                        ) : null}
                        {!row.isHierarchicalChild ? (
                          <ClientCompleteBadge client={row.client} variant="icon-only" />
                        ) : null}
                      </span>
                      <span className="client-lookup-option-meta">
                        Codigo {row.client.code} · {row.client.personType}
                        {row.unit?.cnpj
                          ? ` · ${formatClientDocument(row.unit.cnpj, 'PJ')}`
                          : getClientDocument(row.client)
                            ? ` · ${getClientDocument(row.client)}`
                            : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
