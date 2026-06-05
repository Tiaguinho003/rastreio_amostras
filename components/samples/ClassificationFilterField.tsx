'use client';

// Filtro multi-selecao de um campo de classificacao (Padrao/Aspecto/Catacao/
// Certificado) no modal de /samples. As opcoes sao os valores distintos
// canonicos existentes (carregados sob demanda). Os selecionados ficam como
// chips DENTRO do campo; um clique abre o dropdown com a checklist (busca
// aparece quando ha muitas opcoes).

import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Rotulo do campo (ex.: "Padrão", "Aspecto"). */
  label: string;
  /** Texto exibido quando nada esta selecionado (ex.: "Qualquer padrão"). */
  placeholder: string;
  /** Valores distintos canonicos (vindos do backend, ja ordenados). */
  options: string[];
  /** Valores selecionados (draft). */
  selected: string[];
  /** Carregando as opcoes. */
  loading?: boolean;
  onChange: (next: string[]) => void;
};

const SEARCH_THRESHOLD = 8;

export function ClassificationFilterField({
  label,
  placeholder,
  options,
  selected,
  loading = false,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? options.filter((option) => option.toLowerCase().includes(normalizedSearch))
    : options;
  const showSearch = options.length > SEARCH_THRESHOLD;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  function remove(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  return (
    <div className="samples-filter-field" ref={wrapRef}>
      <span className="samples-filter-field-label">{label}</span>
      <div className="samples-filter-multi-wrap">
        <div
          className={`samples-filter-multi samples-filter-multi--select${open ? ' is-open' : ''}`}
          role="button"
          tabIndex={0}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen((value) => !value);
            }
          }}
        >
          {selected.length === 0 ? (
            <span className="samples-filter-multi-placeholder">{placeholder}</span>
          ) : (
            selected.map((value) => (
              <span key={value} className="samples-filter-token">
                <span className="samples-filter-token-label">{value}</span>
                <button
                  type="button"
                  className="samples-filter-token-remove"
                  aria-label={`Remover ${label}: ${value}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(value);
                  }}
                >
                  ×
                </button>
              </span>
            ))
          )}
          <svg className="samples-filter-multi-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>

        {open ? (
          <div className="samples-filter-multi-dropdown" role="listbox" aria-multiselectable="true">
            {showSearch ? (
              <input
                className="samples-filter-multi-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Buscar ${label.toLowerCase()}`}
                autoComplete="off"
                autoFocus
              />
            ) : null}
            {loading ? (
              <p className="samples-filter-multi-empty">Carregando…</p>
            ) : filtered.length === 0 ? (
              <p className="samples-filter-multi-empty">
                {options.length === 0
                  ? `Nenhum ${label.toLowerCase()} registrado`
                  : 'Nenhum resultado'}
              </p>
            ) : (
              <ul className="samples-filter-multi-list">
                {filtered.map((value) => {
                  const isSelected = selected.includes(value);
                  return (
                    <li key={value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`samples-filter-multi-option${isSelected ? ' is-selected' : ''}`}
                        onClick={() => toggle(value)}
                      >
                        <span className="samples-filter-multi-check" aria-hidden="true">
                          {isSelected ? (
                            <svg viewBox="0 0 24 24">
                              <path d="m5 12 5 5L20 7" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="samples-filter-multi-option-label">{value}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
