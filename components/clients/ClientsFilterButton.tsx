'use client';

// Filtro consolidado da pagina de clientes: um unico botao (mesmo visual do
// botao de filtros de /samples) que abre um dropdown ancorado, com animacao
// diagonal a partir do canto superior direito. O conteudo segue o layout dos
// campos do modal de filtros de /samples (reaproveita as classes
// .samples-filter-*). Modelo rascunho + Aplicar/Limpar (igual /samples):
// o pai detem os filtros aplicados; este componente mantem o rascunho local.

import { type FormEvent, useEffect, useRef, useState } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';
import type { UserLookupItem } from '../../lib/types';

export type ClientFilters = {
  /** id do responsavel comercial; '' = qualquer */
  commercialUserId: string;
  status: '' | 'ACTIVE' | 'INACTIVE';
  personType: '' | 'PF' | 'PJ';
  /** papel operacional; mapeado pra isBuyer/isSeller/isWarehouse no fetch */
  role: '' | 'buyer' | 'seller' | 'warehouse';
  completeness: '' | 'complete' | 'incomplete';
};

export const EMPTY_CLIENT_FILTERS: ClientFilters = {
  commercialUserId: '',
  status: '',
  personType: '',
  role: '',
  completeness: '',
};

export function countActiveClientFilters(filters: ClientFilters): number {
  let count = 0;
  if (filters.commercialUserId) count += 1;
  if (filters.status) count += 1;
  if (filters.personType) count += 1;
  if (filters.role) count += 1;
  if (filters.completeness) count += 1;
  return count;
}

type Props = {
  users: UserLookupItem[];
  applied: ClientFilters;
  onApply: (filters: ClientFilters) => void;
  onClear: () => void;
  /** total de cadastros incompletos (hint na opcao "Incompleto"). */
  incompleteTotal?: number;
};

export function ClientsFilterButton({ users, applied, onApply, onClear, incompleteTotal }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ClientFilters>(applied);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const trapRef = useFocusTrap(open);

  const activeCount = countActiveClientFilters(applied);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onClickOutside(event: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    // Semeia o rascunho com o estado aplicado a cada abertura.
    setDraft(applied);
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply(draft);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleClear() {
    // Espelha /samples: limpar zera rascunho E aplicado na hora (refaz a
    // busca), mantendo o dropdown aberto.
    setDraft(EMPTY_CLIENT_FILTERS);
    onClear();
  }

  const hasDraft = countActiveClientFilters(draft) > 0;

  return (
    <div ref={wrapRef} className="cv2-filters-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`hero-search-filter-btn${activeCount > 0 ? ' has-filters' : ''}`}
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Filtros"
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
        {activeCount > 0 ? <span className="hero-search-filter-badge">{activeCount}</span> : null}
      </button>

      {open ? (
        <section
          ref={trapRef}
          className="cv2-filters-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros de clientes"
        >
          <header className="cv2-filters-panel-header">
            <h3 className="cv2-filters-panel-title">Filtros</h3>
            <button
              type="button"
              className="cv2-filters-panel-close"
              onClick={() => setOpen(false)}
              aria-label="Fechar filtros"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <form className="cv2-filters-panel-form" onSubmit={handleSubmit}>
            <div className="cv2-filters-panel-body">
              <div className="samples-filter-fields">
                <div className="samples-filter-field">
                  <span className="samples-filter-field-label">Responsável comercial</span>
                  <select
                    className="samples-filter-field-input"
                    value={draft.commercialUserId}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, commercialUserId: event.target.value }))
                    }
                  >
                    <option value="">Qualquer responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="samples-filter-row">
                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Status</span>
                    <select
                      className="samples-filter-field-input"
                      value={draft.status}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          status: event.target.value as ClientFilters['status'],
                        }))
                      }
                    >
                      <option value="">Qualquer</option>
                      <option value="ACTIVE">Ativo</option>
                      <option value="INACTIVE">Inativo</option>
                    </select>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Tipo</span>
                    <select
                      className="samples-filter-field-input"
                      value={draft.personType}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          personType: event.target.value as ClientFilters['personType'],
                        }))
                      }
                    >
                      <option value="">Qualquer</option>
                      <option value="PF">Pessoa física</option>
                      <option value="PJ">Pessoa jurídica</option>
                    </select>
                  </div>
                </div>

                <div className="samples-filter-row">
                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Papel</span>
                    <select
                      className="samples-filter-field-input"
                      value={draft.role}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          role: event.target.value as ClientFilters['role'],
                        }))
                      }
                    >
                      <option value="">Qualquer</option>
                      <option value="buyer">Comprador</option>
                      <option value="seller">Vendedor</option>
                      <option value="warehouse">Armazém</option>
                    </select>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Completude</span>
                    <select
                      className="samples-filter-field-input"
                      value={draft.completeness}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          completeness: event.target.value as ClientFilters['completeness'],
                        }))
                      }
                    >
                      <option value="">Qualquer</option>
                      <option value="complete">Completo</option>
                      <option value="incomplete">
                        {incompleteTotal && incompleteTotal > 0
                          ? `Incompleto (${incompleteTotal})`
                          : 'Incompleto'}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="cv2-filters-panel-actions">
              <button type="submit" className="app-modal-submit">
                Aplicar
              </button>
              <button
                type="button"
                className="app-modal-secondary"
                onClick={handleClear}
                disabled={!hasDraft && activeCount === 0}
              >
                Limpar
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
