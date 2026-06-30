'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '../../lib/api-client';

export type InlineSelectOption = {
  id: string;
  label: string;
};

type InlineSelectFieldProps = {
  options: InlineSelectOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  /** Quando presente (e sem onCreate), mostra "+ {createLabel}" que dispara este callback (modal). */
  onRequestCreate?: () => void;
  /**
   * Criação INLINE (D91): quando presente, "+ {createLabel}" abre um campinho no
   * dropdown (input + ✓/✕) que cria o valor na hora e devolve a opção (já com id)
   * pra selecionar. Tem precedência sobre onRequestCreate. Erros viram mensagem
   * inline (409 = "já existe").
   */
  onCreate?: (name: string) => Promise<InlineSelectOption>;
  createLabel?: string;
};

// Select single com dropdown custom e a opção de criar DENTRO do dropdown — mesmo
// design dos campos de lookup/corretor da Etapa 2. Reusa as classes `.bms-*` do
// BrokerMultiSelectField. Digitar filtra as opções. `onCreate` dá o "+ Adicionar"
// inline (D91); `onRequestCreate` (fallback) dispara um modal externo.
export function InlineSelectField({
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  placeholder = 'Selecione',
  emptyMessage = 'Nenhuma opção disponível.',
  onRequestCreate,
  onCreate,
  createLabel,
}: InlineSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  const selectedLabel = useMemo(
    () => options.find((option) => option.id === value)?.label ?? '',
    [options, value]
  );

  // Sincroniza o texto do input com o rótulo do selecionado quando o value muda
  // por fora (ou quando as options carregam e o rótulo resolve).
  useEffect(() => {
    setSearch(selectedLabel);
  }, [selectedLabel]);

  function resetCreate() {
    setCreating(false);
    setDraft('');
    setCreateError(null);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch(selectedLabel);
        resetCreate();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, selectedLabel]);

  // Foca o campinho ao entrar em modo criação.
  useEffect(() => {
    if (creating) {
      createInputRef.current?.focus();
    }
  }, [creating]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    // Texto == rótulo do selecionado → não filtra (mostra todas pra trocar).
    if (query === '' || query === selectedLabel.trim().toLowerCase()) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [options, search, selectedLabel]);

  function select(id: string) {
    onChange(id);
    setOpen(false);
    resetCreate();
    setSearch(options.find((option) => option.id === id)?.label ?? '');
  }

  function startCreate() {
    // Pré-preenche com o que o usuário já digitou (se não for só o rótulo atual).
    const typed = search.trim();
    setDraft(typed && typed.toLowerCase() !== selectedLabel.trim().toLowerCase() ? typed : '');
    setCreateError(null);
    setCreating(true);
  }

  async function confirmCreate() {
    const name = draft.trim();
    if (name === '' || !onCreate) {
      return;
    }
    setSavingCreate(true);
    setCreateError(null);
    try {
      const option = await onCreate(name);
      onChange(option.id);
      setSearch(option.label);
      setOpen(false);
      resetCreate();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setCreateError('Esse nome já existe.');
      } else {
        setCreateError('Não foi possível adicionar. Tente de novo.');
      }
    } finally {
      setSavingCreate(false);
    }
  }

  const showCreateTrigger = Boolean((onCreate || onRequestCreate) && createLabel && !creating);

  return (
    <div className="bms-field" ref={containerRef}>
      <input
        className="app-modal-input"
        value={search}
        disabled={disabled}
        placeholder={loading ? 'Carregando...' : placeholder}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && !disabled ? (
        <div className="bms-dropdown">
          {loading ? <p className="bms-empty">Carregando...</p> : null}
          {!loading && filtered.length === 0 && !creating ? (
            <p className="bms-empty">{emptyMessage}</p>
          ) : null}
          {!loading && filtered.length > 0 ? (
            <ul className="bms-list" role="listbox">
              {filtered.map((option) => (
                <li key={option.id}>
                  <button type="button" className="bms-option" onClick={() => select(option.id)}>
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {creating ? (
            <div className="bms-create">
              <div className="bms-create-row">
                <input
                  ref={createInputRef}
                  className="app-modal-input bms-create-input"
                  value={draft}
                  disabled={savingCreate}
                  placeholder="Novo valor"
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setCreateError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void confirmCreate();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      resetCreate();
                    }
                  }}
                />
                <button
                  type="button"
                  className="bms-create-btn bms-create-ok"
                  onClick={() => void confirmCreate()}
                  disabled={savingCreate || draft.trim() === ''}
                  aria-label="Confirmar"
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="bms-create-btn bms-create-cancel"
                  onClick={resetCreate}
                  disabled={savingCreate}
                  aria-label="Cancelar"
                >
                  ✕
                </button>
              </div>
              {createError ? <p className="bms-create-error">{createError}</p> : null}
            </div>
          ) : null}
          {showCreateTrigger ? (
            <button
              type="button"
              className="bms-option bms-create-trigger"
              onClick={() => {
                if (onCreate) {
                  startCreate();
                } else {
                  setOpen(false);
                  setSearch(selectedLabel);
                  onRequestCreate?.();
                }
              }}
            >
              + {createLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
