'use client';

import { useEffect, useId, useMemo, useRef, useState, type Ref } from 'react';

import { ApiError, lookupWarehouses } from '../../lib/api-client';
import type { SessionData, WarehouseSummary } from '../../lib/types';

type WarehouseLookupFieldProps = {
  session: SessionData;
  label: string;
  selectedWarehouse: WarehouseSummary | null;
  onSelectWarehouse: (warehouse: WarehouseSummary | null) => void;
  onTextChange?: (text: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
  invalidText?: string;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
};

export function WarehouseLookupField({
  session,
  label,
  selectedWarehouse,
  onSelectWarehouse,
  onTextChange,
  inputRef,
  invalid = false,
  invalidText = 'Obrigatorio',
  disabled = false,
  placeholder = 'Busque ou digite o armazem',
  compact = false
}: WarehouseLookupFieldProps) {
  const inputId = useId();
  const [search, setSearch] = useState(selectedWarehouse?.name ?? '');
  const [items, setItems] = useState<WarehouseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastSelectedIdRef = useRef<string | null>(selectedWarehouse?.id ?? null);

  const normalizedSearch = useMemo(() => search.trim(), [search]);

  useEffect(() => {
    const nextSelectedId = selectedWarehouse?.id ?? null;
    if (lastSelectedIdRef.current === nextSelectedId) {
      return;
    }

    lastSelectedIdRef.current = nextSelectedId;
    setSearch(selectedWarehouse?.name ?? '');
  }, [selectedWarehouse]);

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

      lookupWarehouses(session, {
        search: normalizedSearch
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
          setError(cause instanceof ApiError ? cause.message : 'Falha ao buscar armazens');
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
  }, [disabled, normalizedSearch, open, session]);

  function handleSelect(warehouse: WarehouseSummary) {
    lastSelectedIdRef.current = warehouse.id;
    setSearch(warehouse.name);
    setOpen(false);
    setError(null);
    onSelectWarehouse(warehouse);
    onTextChange?.(warehouse.name);
  }

  function handleInputChange(nextValue: string) {
    setSearch(nextValue);
    setOpen(true);
    setError(null);
    onTextChange?.(nextValue);

    if (selectedWarehouse) {
      lastSelectedIdRef.current = null;
      onSelectWarehouse(null);
    }
  }

  return (
    <div className={`client-lookup-field${invalid ? ' is-invalid' : ''}${compact ? ' is-compact' : ''}`} ref={wrapRef}>
      <label htmlFor={inputId} className={compact ? 'login-visually-hidden' : undefined}>
        {label}
      </label>
      <div className={`client-lookup-shell${compact ? ' is-compact' : ''}${selectedWarehouse ? ' has-selection' : ''}`}>
        <input
          id={inputId}
          ref={inputRef}
          value={search}
          disabled={disabled}
          placeholder={invalid && !search ? invalidText : placeholder}
          autoComplete="off"
          aria-invalid={invalid}
          onFocus={() => setOpen(true)}
          onChange={(event) => handleInputChange(event.target.value)}
        />
        {selectedWarehouse && !compact ? (
          <button
            type="button"
            className="client-lookup-inline-clear"
            disabled={disabled}
            aria-label="Remover armazem"
            onClick={() => {
              lastSelectedIdRef.current = null;
              setSearch('');
              setItems([]);
              setOpen(false);
              setError(null);
              onSelectWarehouse(null);
              onTextChange?.('');
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
          {loading ? <p className="client-lookup-empty">Buscando armazens...</p> : null}
          {!loading && normalizedSearch.length >= 2 && items.length === 0 && !error ? (
            <div className="client-lookup-empty">
              <p style={{ margin: 0 }}>Nenhum armazem encontrado. O nome sera criado automaticamente.</p>
            </div>
          ) : null}

          {!loading && items.length > 0 ? (
            <ul className="client-lookup-list" role="listbox" aria-label={label}>
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className="client-lookup-option" onClick={() => handleSelect(item)}>
                    <span className="client-lookup-option-title">{item.name}</span>
                    <span className="client-lookup-option-meta">
                      {item.address ? item.address : 'Sem endereco'}
                      {item.phone ? ` · ${item.phone}` : ''}
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
