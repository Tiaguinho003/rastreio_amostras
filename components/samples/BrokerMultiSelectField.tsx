'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, listBrokers } from '../../lib/api-client';
import type { Broker, SessionData } from '../../lib/types';

type BrokerMultiSelectFieldProps = {
  session: SessionData;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

// Fechamento (Fase B.2): seletor de N corretores (>=1) pra venda a vista. Busca
// + chips a partir do cadastro de corretores ativos (listBrokers). "Cadastrar
// na hora" fica pro Passo 2/B.3 — aqui so seleciona os ja cadastrados.
export function BrokerMultiSelectField({
  session,
  selectedIds,
  onChange,
  disabled = false,
}: BrokerMultiSelectFieldProps) {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listBrokers(session, { status: 'ACTIVE' }, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setBrokers(res.items);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar corretores');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [session]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedBrokers = useMemo(
    () =>
      selectedIds
        .map((id) => brokers.find((broker) => broker.id === id))
        .filter((broker): broker is Broker => Boolean(broker)),
    [brokers, selectedIds]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return brokers.filter(
      (broker) =>
        !selectedIds.includes(broker.id) &&
        (query === '' || broker.name.toLowerCase().includes(query))
    );
  }, [brokers, search, selectedIds]);

  function addBroker(id: string) {
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id]);
    }
    setSearch('');
  }

  function removeBroker(id: string) {
    onChange(selectedIds.filter((current) => current !== id));
  }

  return (
    <div className="bms-field" ref={containerRef}>
      {selectedBrokers.length > 0 ? (
        <div className="bms-chips">
          {selectedBrokers.map((broker) => (
            <span key={broker.id} className="bms-chip">
              {broker.name}
              <button
                type="button"
                className="bms-chip-remove"
                disabled={disabled}
                aria-label={`Remover ${broker.name}`}
                onClick={() => removeBroker(broker.id)}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className="app-modal-input"
        value={search}
        disabled={disabled}
        placeholder={selectedBrokers.length ? 'Adicionar outro corretor' : 'Buscar corretor'}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open ? (
        <div className="bms-dropdown">
          {loading ? <p className="bms-empty">Carregando corretores...</p> : null}
          {error ? <p className="bms-empty">{error}</p> : null}
          {!loading && !error && filtered.length === 0 ? (
            <p className="bms-empty">
              {brokers.length === 0 ? 'Nenhum corretor cadastrado.' : 'Nenhum corretor encontrado.'}
            </p>
          ) : null}
          {!loading && !error && filtered.length > 0 ? (
            <ul className="bms-list" role="listbox" aria-label="Corretores">
              {filtered.map((broker) => (
                <li key={broker.id}>
                  <button type="button" className="bms-option" onClick={() => addBroker(broker.id)}>
                    {broker.name}
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
