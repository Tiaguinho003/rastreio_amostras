'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, createBank, listBanks } from '../../lib/api-client';
import type { Bank, SessionData } from '../../lib/types';

// Seletor de banco (Fechamento Fase 0): dropdown com busca em listBanks +
// "Cadastrar banco" na hora (createBank). Single-select; value = bankId.
type Props = {
  session: SessionData;
  value: string | null;
  onChange: (bankId: string | null) => void;
  disabled?: boolean;
  errorMessage?: string | null;
};

export function BankSelectField({ session, value, onChange, disabled, errorMessage }: Props) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCompe, setNewCompe] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBanks(session, { status: 'ACTIVE' })
      .then((res) => {
        if (!cancelled) setBanks(res.items);
      })
      .catch(() => {
        /* silencioso: dropdown vazio + opção de cadastrar */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selected = useMemo(() => banks.find((b) => b.id === value) ?? null, [banks, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return banks;
    const qd = q.replace(/\D/g, '');
    return banks.filter(
      (b) => b.name.toLowerCase().includes(q) || (qd.length > 0 && b.compeCode.includes(qd))
    );
  }, [banks, search]);

  async function handleCreate() {
    const name = newName.trim();
    const compe = newCompe.replace(/\D/g, '');
    if (!name || compe.length === 0) {
      setCreateError('Informe nome e código (1–3 dígitos).');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createBank(session, { name, compeCode: compe });
      setBanks((prev) => [...prev, res.bank].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(res.bank.id);
      setAdding(false);
      setNewName('');
      setNewCompe('');
      setOpen(false);
    } catch (cause) {
      setCreateError(cause instanceof ApiError ? cause.message : 'Falha ao cadastrar banco.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="bsf-root" ref={rootRef}>
      <button
        type="button"
        className={`app-modal-input bsf-trigger${errorMessage ? ' has-error' : ''}`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? '' : 'bsf-placeholder'}>
          {selected ? `${selected.name} (${selected.compeCode})` : 'Selecione o banco'}
        </span>
        <span className="bsf-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {errorMessage ? (
        <span className="sdv-edit-error" role="alert">
          {errorMessage}
        </span>
      ) : null}

      {open ? (
        <div className="bsf-dropdown">
          <input
            className="app-modal-input bsf-search"
            placeholder="Buscar banco ou código"
            value={search}
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="bsf-options">
            {loading ? <div className="bsf-empty">Carregando…</div> : null}
            {!loading && filtered.length === 0 ? (
              <div className="bsf-empty">Nenhum banco encontrado</div>
            ) : null}
            {filtered.map((bank) => (
              <button
                key={bank.id}
                type="button"
                className={`bsf-option${bank.id === value ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(bank.id);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="bsf-option-name">{bank.name}</span>
                <span className="bsf-option-code">{bank.compeCode}</span>
              </button>
            ))}
          </div>

          {adding ? (
            <div className="bsf-add">
              <input
                className="app-modal-input"
                placeholder="Nome do banco"
                value={newName}
                disabled={creating}
                onChange={(event) => setNewName(event.target.value.toUpperCase())}
              />
              <input
                className="app-modal-input bsf-add-code"
                placeholder="COMPE"
                inputMode="numeric"
                maxLength={3}
                value={newCompe}
                disabled={creating}
                onChange={(event) => setNewCompe(event.target.value.replace(/\D/g, ''))}
              />
              <button
                type="button"
                className="app-modal-submit bsf-add-save"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? '...' : 'Salvar'}
              </button>
              {createError ? (
                <span className="sdv-edit-error bsf-add-error" role="alert">
                  {createError}
                </span>
              ) : null}
            </div>
          ) : (
            <button type="button" className="bsf-add-toggle" onClick={() => setAdding(true)}>
              + Cadastrar banco
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
