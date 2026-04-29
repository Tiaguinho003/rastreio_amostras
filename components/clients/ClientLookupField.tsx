'use client';

import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';

import { ApiError, lookupClients } from '../../lib/api-client';
import { formatClientDocument } from '../../lib/client-field-formatters';
import type {
  ClientBranchSummary,
  ClientLookupKind,
  ClientSummary,
  SessionData,
} from '../../lib/types';

type ClientLookupFieldProps = {
  session: SessionData;
  label: string;
  kind: ClientLookupKind;
  selectedClient: ClientSummary | null;
  onSelectClient: (client: ClientSummary | null) => void;
  /** F6.1 G1: callback opcional para modo hierarquico (cliente+filial em uma linha). */
  onSelectBranch?: (client: ClientSummary, branch: ClientBranchSummary | null) => void;
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
  branch: ClientBranchSummary | null;
  // sub: branch e filial nao primary; primary nao
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
    if (client.personType === 'PF' || !client.branches || client.branches.length === 0) {
      rows.push({
        key: client.id,
        client,
        branch: null,
        isHierarchicalChild: false,
      });
      continue;
    }
    // PJ com branches — ordenadas com primary primeiro (backend ja ordena por isPrimary desc, code asc)
    for (const branch of client.branches) {
      rows.push({
        key: `${client.id}:${branch.id}`,
        client,
        branch,
        isHierarchicalChild: !branch.isPrimary,
      });
    }
  }
  return rows;
}

function buildBranchLabel(branch: ClientBranchSummary): string {
  const tag = branch.isPrimary ? 'Matriz' : `Filial ${branch.code}`;
  const place = branch.city && branch.state ? ` · ${branch.city}/${branch.state}` : '';
  return `${tag}${place}`;
}

export function ClientLookupField({
  session,
  label,
  kind,
  selectedClient,
  onSelectClient,
  onSelectBranch,
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
  const [matchedBranchId, setMatchedBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastSelectedIdRef = useRef<string | null>(selectedClient?.id ?? null);

  const normalizedSearch = useMemo(() => search.trim(), [search]);
  const isHierarchical = typeof onSelectBranch === 'function';

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
      setMatchedBranchId(null);
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
          setMatchedBranchId(response.matchedBranchId ?? null);
        })
        .catch((cause) => {
          if (!active) {
            return;
          }

          setItems([]);
          setMatchedBranchId(null);
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

  function handleSelectClient(client: ClientSummary, branch: ClientBranchSummary | null) {
    lastSelectedIdRef.current = client.id;
    setSearch(client.displayName ?? '');
    setOpen(false);
    setError(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onSelectClient(client);
    if (isHierarchical && onSelectBranch) {
      onSelectBranch(client, branch);
    }
  }

  // Em modo hierarquico, expandimos cada client em N linhas (uma por branch).
  const rows: LookupRow[] = useMemo(
    () =>
      isHierarchical
        ? buildHierarchicalRows(items)
        : items.map((client) => ({
            key: client.id,
            client,
            branch: null,
            isHierarchicalChild: false,
          })),
    [isHierarchical, items]
  );

  const hasTransient = useMemo(
    () =>
      isHierarchical &&
      items.some(
        (client) => client.personType === 'PJ' && (!client.branches || client.branches.length === 0)
      ),
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
              // Modo hierarquico: pai recebe branch=null junto via onSelectBranch?
              // Mantem a responsabilidade de limpar branch para o consumidor
              // (samples/new ja faz isso em setSelectedOwnerClient).
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
              setMatchedBranchId(null);
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
                const transient =
                  isHierarchical && row.client.personType === 'PJ' && row.branch === null;
                const isMatched = matchedBranchId !== null && row.branch?.id === matchedBranchId;
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      className={`client-lookup-option${row.isHierarchicalChild ? ' is-child' : ''}${transient ? ' is-disabled' : ''}${isMatched ? ' is-matched' : ''}`}
                      onClick={() => {
                        if (transient) return;
                        handleSelectClient(row.client, row.branch);
                      }}
                      disabled={transient}
                      title={transient ? 'Configure a matriz desta empresa primeiro' : undefined}
                    >
                      <span className="client-lookup-option-title">
                        {row.client.displayName ?? 'Sem nome'}
                        {row.branch ? (
                          <span className="client-lookup-option-branch">
                            {' · '}
                            {buildBranchLabel(row.branch)}
                          </span>
                        ) : null}
                        {isMatched ? (
                          <span className="client-lookup-option-matched"> · CNPJ exato</span>
                        ) : null}
                      </span>
                      <span className="client-lookup-option-meta">
                        Codigo {row.client.code} · {row.client.personType}
                        {row.branch?.cnpj
                          ? ` · ${formatClientDocument(row.branch.cnpj, 'PJ')}`
                          : getClientDocument(row.client)
                            ? ` · ${getClientDocument(row.client)}`
                            : ''}
                        {transient ? ' · sem matriz configurada' : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {hasTransient && !loading ? (
            <p className="client-lookup-empty" style={{ fontSize: '0.85em' }}>
              Empresas sem matriz aparecem desabilitadas — abra o cadastro do cliente para
              configurar a matriz primeiro.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
