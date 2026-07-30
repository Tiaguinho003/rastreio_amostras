'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, createBroker, listBrokers, lookupUsersForReference } from '../../lib/api-client';
import type { Broker, BrokerInput, SessionData, UserLookupItem } from '../../lib/types';
import { BrokerFormModal } from '../cadastros/BrokerFormModal';

type BrokerMultiSelectFieldProps = {
  session: SessionData;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

// Fechamento (Fase B.2): seletor de N corretores (>=1) pra venda a vista. Busca
// + chips a partir do cadastro de corretores ativos (listBrokers). Permite
// "Cadastrar corretor" na hora pelo dropdown (mesmo padrao do campo Comprador):
// abre o BrokerFormModal canonico, cria e ja seleciona o novo corretor.
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

  // Cadastro inline de corretor (reusa o BrokerFormModal da pagina Cadastros).
  const [createOpen, setCreateOpen] = useState(false);
  const [createSeed, setCreateSeed] = useState('');
  const [users, setUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingBroker, setSavingBroker] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const usersLoadedRef = useRef(false);

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

  // Carrega usuarios (UserSelect do BrokerFormModal) so quando o cadastro abre.
  useEffect(() => {
    if (!createOpen || usersLoadedRef.current) {
      return;
    }
    setLoadingUsers(true);
    lookupUsersForReference(session, { limit: 200 })
      .then((res) => {
        setUsers(res.items);
        usersLoadedRef.current = true;
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [createOpen, session]);

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

  function openCreate() {
    setCreateSeed(search.trim());
    setCreateError(null);
    setCreateOpen(true);
    setOpen(false);
  }

  async function submitNewBroker(data: BrokerInput & { status?: 'ACTIVE' | 'INACTIVE' }) {
    setSavingBroker(true);
    setCreateError(null);
    try {
      const res = await createBroker(session, data);
      const created = res.broker;
      // Adiciona o novo corretor a lista local pra o chip renderizar o nome, e
      // ja o seleciona na venda. NÃO fecha aqui — o BrokerFormModal mostra o
      // check terminal e fecha via onClose.
      setBrokers((prev) => [...prev, created]);
      if (!selectedIds.includes(created.id)) {
        onChange([...selectedIds, created.id]);
      }
      setSearch('');
    } catch (cause) {
      setCreateError(cause instanceof ApiError ? cause.message : 'Falha ao salvar corretor.');
      throw cause; // sinaliza a falha pro modal (pula o check).
    } finally {
      setSavingBroker(false);
    }
  }

  return (
    <div className="bms-field" ref={containerRef}>
      {/* Control box (altura ESTATICA): chips selecionados + input numa UNICA
          linha; se houver muitos, enfileiram e o box rola na horizontal — nunca
          quebra linha nem muda de altura. */}
      <div className="bms-control">
        {selectedBrokers.map((broker) => (
          <span key={broker.id} className="bms-chip">
            <span className="bms-chip-label" title={broker.name}>
              {broker.name}
            </span>
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
        <input
          className="bms-input"
          value={search}
          disabled={disabled}
          placeholder={selectedBrokers.length ? 'Adicionar outro' : 'Buscar corretor'}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open ? (
        <div className="bms-dropdown">
          {loading ? <p className="bms-empty">Carregando…</p> : null}
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
          {!loading && !error && !disabled ? (
            <button type="button" className="bms-option" onClick={openCreate}>
              + Cadastrar corretor
            </button>
          ) : null}
        </div>
      ) : null}

      <BrokerFormModal
        open={createOpen}
        broker={null}
        initialName={createSeed}
        users={users}
        loadingUsers={loadingUsers}
        saving={savingBroker}
        errorMessage={createError}
        onClose={() => {
          if (!savingBroker) setCreateOpen(false);
        }}
        onSubmit={submitNewBroker}
      />
    </div>
  );
}
