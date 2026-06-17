'use client';

// Filtro multi-selecao de um campo de classificacao (Padrao/Aspecto/Catacao/
// Certificado/Safra) no modal de /samples. As opcoes sao os valores distintos
// canonicos existentes (carregados sob demanda).
//
// Card FECHADO: os valores selecionados ficam enfileirados numa UNICA linha
// horizontal (sem quebrar); o que nao couber na largura colapsa num "+N"
// (medido via ResizeObserver + um mirror invisivel) e uma bolinha verde a
// direita mostra o total selecionado. Clicar abre o dropdown com a checklist.
// A busca so aparece quando `searchable` (hoje so a Catacao) e ha opcoes
// suficientes; os demais campos tem checklist seca.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  /** Mostra a busca no dropdown (so Catacao). Demais campos: checklist seca. */
  searchable?: boolean;
  onChange: (next: string[]) => void;
};

const SEARCH_THRESHOLD = 8;

export function ClassificationFilterField({
  label,
  placeholder,
  options,
  selected,
  loading = false,
  searchable = false,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chipsRowRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  // Quantos chips cabem na linha; o restante vira "+N". Comeca otimista
  // (todos) e o efeito de medicao ajusta antes da pintura.
  const [visibleCount, setVisibleCount] = useState(selected.length);

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

  // Mede quantos chips cabem em UMA linha. As larguras saem do mirror invisivel
  // (renderiza todos os chips no tamanho natural), comparadas contra a largura
  // util da fila visivel. Recalcula quando muda a selecao ou a largura do campo.
  useLayoutEffect(() => {
    const row = chipsRowRef.current;
    const measure = measureRef.current;
    if (!row || !measure || selected.length === 0) {
      return;
    }

    function recompute() {
      if (!row || !measure) return;
      const available = row.clientWidth;
      const chipEls = Array.from(measure.querySelectorAll<HTMLElement>('[data-chip]'));
      const moreEl = measure.querySelector<HTMLElement>('[data-more]');
      const rowStyles = window.getComputedStyle(row);
      const gap = Number.parseFloat(rowStyles.columnGap || rowStyles.gap || '0') || 0;
      const moreWidth = moreEl ? moreEl.offsetWidth : 0;

      // Cabe tudo? Sem "+N".
      let totalWidth = 0;
      for (let i = 0; i < chipEls.length; i += 1) {
        totalWidth += (i > 0 ? gap : 0) + chipEls[i].offsetWidth;
      }
      if (totalWidth <= available) {
        setVisibleCount(selected.length);
        return;
      }

      // Ha overflow: encaixa o maximo reservando espaco pro "+N".
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
      // Sempre mostra ao menos 1 chip (clipado pelo overflow se for o caso).
      setVisibleCount(Math.max(count, 1));
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(row);
    return () => observer.disconnect();
  }, [selected]);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? options.filter((option) => option.toLowerCase().includes(normalizedSearch))
    : options;
  const showSearch = searchable && options.length > SEARCH_THRESHOLD;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const hiddenCount = selected.length - visibleCount;

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
          aria-label={selected.length > 0 ? `${label}: ${selected.length} selecionado(s)` : label}
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
            <div className="samples-filter-multi-chips" ref={chipsRowRef}>
              {selected.slice(0, visibleCount).map((value) => (
                <span key={value} className="samples-filter-token" data-chip>
                  <span className="samples-filter-token-label">{value}</span>
                </span>
              ))}
              {hiddenCount > 0 ? (
                <span className="samples-filter-multi-more">+{hiddenCount}</span>
              ) : null}
            </div>
          )}

          {selected.length > 0 ? (
            <span className="samples-filter-retract-count" aria-hidden="true">
              {selected.length}
            </span>
          ) : null}

          <svg className="samples-filter-multi-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>

        {/* Mirror invisivel: so pra medir a largura natural de cada chip e do
            "+N". Fora do fluxo visivel (CSS), nunca aparece nem e lido por AT. */}
        {selected.length > 0 ? (
          <div className="samples-filter-multi-measure" ref={measureRef} aria-hidden="true">
            {selected.map((value) => (
              <span key={value} className="samples-filter-token" data-chip>
                <span className="samples-filter-token-label">{value}</span>
              </span>
            ))}
            <span className="samples-filter-multi-more" data-more>
              +{selected.length}
            </span>
          </div>
        ) : null}

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
