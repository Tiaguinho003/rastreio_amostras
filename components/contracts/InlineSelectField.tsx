'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  /** Quando presente, mostra "+ {createLabel}" como opção DENTRO do dropdown. */
  onRequestCreate?: () => void;
  createLabel?: string;
};

// Select single com dropdown custom e a opção "Cadastrar" DENTRO do dropdown —
// mesmo design dos campos de lookup/corretor da Etapa 2. Reusa as classes
// `.bms-*` do BrokerMultiSelectField (sem CSS novo). Digitar filtra as opções.
export function InlineSelectField({
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  placeholder = 'Selecione',
  emptyMessage = 'Nenhuma opção disponível.',
  onRequestCreate,
  createLabel,
}: InlineSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = useMemo(
    () => options.find((option) => option.id === value)?.label ?? '',
    [options, value]
  );

  // Sincroniza o texto do input com o rótulo do selecionado quando o value muda
  // por fora (ou quando as options carregam e o rótulo resolve).
  useEffect(() => {
    setSearch(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch(selectedLabel);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, selectedLabel]);

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
    setSearch(options.find((option) => option.id === id)?.label ?? '');
  }

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
          {!loading && filtered.length === 0 ? <p className="bms-empty">{emptyMessage}</p> : null}
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
          {onRequestCreate && createLabel ? (
            <button
              type="button"
              className="bms-option"
              onClick={() => {
                setOpen(false);
                setSearch(selectedLabel);
                onRequestCreate();
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
