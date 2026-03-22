'use client';

import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';

import { ApiError, lookupClients } from '../../lib/api-client';
import type { ClientLookupKind, ClientSummary, SessionData } from '../../lib/types';

type ClientLookupFieldProps = {
  session: SessionData;
  label: string;
  kind: ClientLookupKind;
  selectedClient: ClientSummary | null;
  onSelectClient: (client: ClientSummary | null) => void;
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
  invalidText?: string;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  onRequestCreate?: (search: string) => void;
  createLabel?: string;
};

function getClientDocument(client: ClientSummary) {
  if (client.document) {
    return client.document;
  }

  return client.personType === 'PF' ? client.cpf : client.cnpj;
}

export function ClientLookupField({
  session,
  label,
  kind,
  selectedClient,
  onSelectClient,
  inputRef,
  invalid = false,
  invalidText = 'Obrigatorio',
  disabled = false,
  placeholder = 'Busque por nome, documento ou codigo',
  emptyMessage = 'Nenhum cliente encontrado.',
  onRequestCreate,
  createLabel = 'Cadastrar cliente'
}: ClientLookupFieldProps) {
  const inputId = useId();
  const [search, setSearch] = useState(selectedClient?.displayName ?? '');
  const [items, setItems] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastSelectedIdRef = useRef<string | null>(selectedClient?.id ?? null);

  const normalizedSearch = useMemo(() => search.trim(), [search]);

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

    if (normalizedSearch.length < 2) {
      setItems([]);
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
        kind
      })
        .then((response) => {
          if (!active) {
            return;
          }

          setItems(response.items);
        })
        .catch((cause) => {
          if (!active) {
            return;
          }

          setItems([]);
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

  function handleSelect(client: ClientSummary) {
    lastSelectedIdRef.current = client.id;
    setSearch(client.displayName ?? '');
    setOpen(false);
    setError(null);
    onSelectClient(client);
  }

  return (
    <div className={`client-lookup-field${invalid ? ' is-invalid' : ''}`} ref={wrapRef}>
      <label htmlFor={inputId}>{label}</label>
      <div className="client-lookup-shell">
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
        {selectedClient ? (
          <button
            type="button"
            className="secondary client-lookup-clear"
            disabled={disabled}
            onClick={() => {
              lastSelectedIdRef.current = null;
              setSearch('');
              setItems([]);
              setOpen(false);
              setError(null);
              onSelectClient(null);
            }}
          >
            Limpar
          </button>
        ) : null}
      </div>

      {selectedClient ? (
        <p className="client-lookup-selection">
          Cliente selecionado: <strong>{selectedClient.displayName ?? 'Sem nome'}</strong> · Codigo {selectedClient.code}
        </p>
      ) : null}

      {error ? <p className="error client-lookup-feedback">{error}</p> : null}

      {open && (loading || error || normalizedSearch.length >= 2) ? (
        <div className="client-lookup-dropdown">
          {loading ? <p className="client-lookup-empty">Buscando clientes...</p> : null}
          {!loading && normalizedSearch.length >= 2 && items.length === 0 && !error ? (
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

          {!loading && items.length > 0 ? (
            <ul className="client-lookup-list" role="listbox" aria-label={label}>
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className="client-lookup-option" onClick={() => handleSelect(item)}>
                    <span className="client-lookup-option-title">{item.displayName ?? 'Sem nome'}</span>
                    <span className="client-lookup-option-meta">
                      Codigo {item.code} · {item.personType}
                      {getClientDocument(item) ? ` · ${getClientDocument(item)}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
