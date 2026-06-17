'use client';

// Campo multi-select genérico (id-based) no estilo dos filtros multi de /samples
// (ClassificationFilterField): campo FECHADO com altura FIXA mostra os
// selecionados como chips numa ÚNICA linha; o que não couber colapsa num "+N"
// (medido via mirror invisível + ResizeObserver). Clicar abre um dropdown com
// checklist (+ busca opcional). Usado no modal de novo cliente (Responsável,
// Papel). NÃO é o UserMultiSelect (esse, input-de-busca, segue em /clients/[id]).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type ChipOption = { id: string; label: string; sublabel?: string };

type Props = {
  label?: string;
  placeholder?: string;
  options: ChipOption[];
  /** IDs selecionados. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Mostra busca no topo do dropdown (quando há opções suficientes). */
  searchable?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Mensagem de erro inline (vermelha suave). */
  errorMessage?: string;
};

// Só vale a pena a busca quando há um número razoável de opções.
const SEARCH_THRESHOLD = 6;

export function ChipMultiSelectField({
  label,
  placeholder = 'Selecione',
  options,
  selected,
  onChange,
  searchable = false,
  loading = false,
  disabled = false,
  errorMessage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chipsRowRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  // Quantos chips cabem em UMA linha; o restante vira "+N". Começa otimista.
  const [visibleCount, setVisibleCount] = useState(selected.length);
  // Abre o dropdown PRA CIMA quando há pouco espaço abaixo (ex.: o campo Papel é
  // o último do modal — pra baixo seria cortado pelo rodapé do sheet).
  const [dropUp, setDropUp] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  const optionsById = useMemo(() => {
    const map = new Map<string, ChipOption>();
    for (const option of options) map.set(option.id, option);
    return map;
  }, [options]);

  const selectedOptions = useMemo(
    () => selected.map((id) => optionsById.get(id) ?? { id, label: '—' }),
    [selected, optionsById]
  );

  // Fecha ao clicar fora / Esc.
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

  // Mede quantos chips cabem em UMA linha (mesmo algoritmo do
  // ClassificationFilterField): larguras vêm do mirror invisível, comparadas
  // contra a largura útil da fila visível; reserva espaço pro "+N".
  useLayoutEffect(() => {
    const row = chipsRowRef.current;
    const measure = measureRef.current;
    if (!row || !measure || selected.length === 0) return;

    function recompute() {
      if (!row || !measure) return;
      const available = row.clientWidth;
      const chipEls = Array.from(measure.querySelectorAll<HTMLElement>('[data-chip]'));
      const moreEl = measure.querySelector<HTMLElement>('[data-more]');
      const rowStyles = window.getComputedStyle(row);
      const gap = Number.parseFloat(rowStyles.columnGap || rowStyles.gap || '0') || 0;
      const moreWidth = moreEl ? moreEl.offsetWidth : 0;

      let totalWidth = 0;
      for (let i = 0; i < chipEls.length; i += 1) {
        totalWidth += (i > 0 ? gap : 0) + chipEls[i].offsetWidth;
      }
      if (totalWidth <= available) {
        setVisibleCount(selected.length);
        return;
      }

      let used = 0;
      let count = 0;
      for (let i = 0; i < chipEls.length; i += 1) {
        const next = used + (i > 0 ? gap : 0) + chipEls[i].offsetWidth;
        if (next + gap + moreWidth <= available) {
          used = next;
          count += 1;
        } else {
          break;
        }
      }
      setVisibleCount(Math.max(count, 1));
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(row);
    return () => observer.disconnect();
  }, [selected]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedSearch))
    : options;
  const showSearch = searchable && options.length > SEARCH_THRESHOLD;
  const hiddenCount = selected.length - visibleCount;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  function toggleOpen() {
    if (disabled) return;
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom;
        setDropUp(spaceBelow < 240 && rect.top > spaceBelow);
      }
    }
    setOpen((value) => !value);
  }

  return (
    <div className={`chip-select-field${errorMessage ? ' is-field-error' : ''}`} ref={wrapRef}>
      {label ? <span className="chip-select-label">{label}</span> : null}
      <div className={`chip-select-wrap${open && dropUp ? ' is-drop-up' : ''}`}>
        <div
          ref={triggerRef}
          className={`chip-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={
            label && selected.length > 0 ? `${label}: ${selected.length} selecionado(s)` : label
          }
          onClick={toggleOpen}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleOpen();
            }
          }}
        >
          {selected.length === 0 ? (
            <span className="chip-select-placeholder">{placeholder}</span>
          ) : (
            <div className="chip-select-chips" ref={chipsRowRef}>
              {selectedOptions.slice(0, visibleCount).map((option) => (
                <span key={option.id} className="chip-select-token" data-chip>
                  <span className="chip-select-token-label">{option.label}</span>
                </span>
              ))}
              {hiddenCount > 0 ? <span className="chip-select-more">+{hiddenCount}</span> : null}
            </div>
          )}

          <svg className="chip-select-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>

        {/* Mirror invisível: só pra medir a largura natural de cada chip + "+N". */}
        {selected.length > 0 ? (
          <div className="chip-select-measure" ref={measureRef} aria-hidden="true">
            {selectedOptions.map((option) => (
              <span key={option.id} className="chip-select-token" data-chip>
                <span className="chip-select-token-label">{option.label}</span>
              </span>
            ))}
            <span className="chip-select-more" data-more>
              +{selected.length}
            </span>
          </div>
        ) : null}

        {open && !disabled ? (
          <div className="chip-select-dropdown" role="listbox" aria-multiselectable="true">
            {showSearch ? (
              <input
                className="chip-select-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Buscar${label ? ` ${label.toLowerCase()}` : ''}`}
                autoComplete="off"
                autoFocus
              />
            ) : null}
            {loading ? (
              <p className="chip-select-empty">Carregando…</p>
            ) : filtered.length === 0 ? (
              <p className="chip-select-empty">
                {options.length === 0 ? 'Nenhuma opção' : 'Nenhum resultado'}
              </p>
            ) : (
              <ul className="chip-select-list">
                {filtered.map((option) => {
                  const isSelected = selected.includes(option.id);
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`chip-select-option${isSelected ? ' is-selected' : ''}`}
                        // iOS PWA: mousedown+preventDefault mantém o foco (evita
                        // colapso do teclado/reflow); onClick é fallback p/ teclado.
                        onMouseDown={(event) => {
                          event.preventDefault();
                          toggle(option.id);
                        }}
                        // onClick SÓ pra ativação por TECLADO (Enter/Espaço →
                        // event.detail === 0). O pointer já foi tratado no
                        // onMouseDown — sem este guard o toggle disparava 2x
                        // (mousedown + click) e se anulava (seleção "não funcionava").
                        onClick={(event) => {
                          if (event.detail === 0) toggle(option.id);
                        }}
                      >
                        <span className="chip-select-check" aria-hidden="true">
                          {isSelected ? (
                            <svg viewBox="0 0 24 24">
                              <path d="m5 12 5 5L20 7" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="chip-select-option-label">{option.label}</span>
                        {option.sublabel ? (
                          <span className="chip-select-option-sub">{option.sublabel}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
      {errorMessage ? (
        <span className="app-modal-error" role="alert">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
