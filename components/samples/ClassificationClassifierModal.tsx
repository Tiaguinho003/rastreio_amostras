'use client';

import { useEffect, useRef, useState } from 'react';

import type { ClassifierSnapshot, UserLookupItem } from '../../lib/types';
import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2.9: Modal de selecao de classificadores. Substitui o JSX inline
// antigo (cam-classifier-card) e segue a skill modals (.app-modal.is-themed).
// Header verde com seta de Voltar (igual ao TypeModal). Multi-select de
// co-classificadores; o user atual e sempre incluido implicitamente.
//
// Click em "Continuar" salva a classificacao (handleConfirmClassification
// no parent). User principal aparece como chip fixo (nao-removivel).

type Props = {
  open: boolean;
  currentUser: { fullName: string | null; username: string };
  coClassifiers: ClassifierSnapshot[];
  availableUsers: UserLookupItem[];
  loadingUsers: boolean;
  userPickerError: string | null;
  onToggleUser: (user: UserLookupItem) => void;
  onRemoveCoClassifier: (id: string) => void;
  onRetryLoad: () => void;
  onBack: () => void;
  onContinue: () => void;
  saving?: boolean;
};

export function ClassificationClassifierModal({
  open,
  currentUser,
  coClassifiers,
  availableUsers,
  loadingUsers,
  userPickerError,
  onToggleUser,
  onRemoveCoClassifier,
  onRetryLoad,
  onBack,
  onContinue,
  saving = false,
}: Props) {
  const focusTrapRef = useFocusTrap(open);
  const selectedRef = useRef<HTMLDivElement | null>(null);
  const removeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [selectedOpen, setSelectedOpen] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());

  // Escape: fecha o popover de selecionados primeiro; senao volta (onBack).
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (selectedOpen) {
        setSelectedOpen(false);
      } else if (!saving) {
        onBack();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onBack, saving, selectedOpen]);

  // Reseta o popover quando o modal fecha (o componente persiste montado).
  useEffect(() => {
    if (!open) setSelectedOpen(false);
  }, [open]);

  // Fecha o popover ao clicar fora. Sem backdrop fixo de propósito: dentro do
  // modal (--z-modal) um backdrop em --z-popover cairia na armadilha de
  // stacking-context e prenderia o popover embaixo dele.
  useEffect(() => {
    if (!selectedOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (selectedRef.current && !selectedRef.current.contains(event.target as Node)) {
        setSelectedOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [selectedOpen]);

  // Limpa timers da animacao de remocao no unmount.
  useEffect(() => {
    const timers = removeTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  function handleRemoveCo(id: string) {
    if (removingIds.has(id)) return;
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const timer = setTimeout(() => {
      removeTimersRef.current.delete(id);
      onRemoveCoClassifier(id);
      setRemovingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 150);
    removeTimersRef.current.set(id, timer);
  }

  if (!open) return null;

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed classifier-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="classifier-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header type-modal-header">
          <button
            type="button"
            className="type-modal-back"
            onClick={onBack}
            disabled={saving}
            aria-label="Voltar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 18l-6-6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="app-modal-title-wrap">
            <h3 id="classifier-modal-title" className="app-modal-title">
              Classificador
            </h3>
          </div>
        </header>

        <div className="app-modal-content classifier-content">
          <div className="classifier-selected" ref={selectedRef}>
            <button
              type="button"
              className="classifier-counter"
              aria-expanded={selectedOpen}
              aria-haspopup="menu"
              onClick={() => setSelectedOpen((o) => !o)}
            >
              <span className="classifier-counter__num">{1 + coClassifiers.length}</span>
              <span className="classifier-counter__label">
                {coClassifiers.length === 0 ? 'selecionado' : 'selecionados'}
              </span>
              <svg className="classifier-counter__chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {selectedOpen ? (
              <div
                className="classifier-selected-pop"
                role="menu"
                aria-label="Classificadores selecionados"
              >
                <div className="classifier-selected-pop__scroll">
                  <div className="classifier-selected-pop__row" role="menuitem">
                    <span className="classifier-selected-pop__name">
                      {currentUser.fullName ?? currentUser.username}
                    </span>
                    <span className="classifier-selected-pop__tag">você</span>
                  </div>
                  {coClassifiers.map((entry) => (
                    <div
                      key={entry.id}
                      className={`classifier-selected-pop__row${
                        removingIds.has(entry.id) ? ' is-removing' : ''
                      }`}
                      role="menuitem"
                    >
                      <span className="classifier-selected-pop__name">{entry.fullName}</span>
                      <button
                        type="button"
                        className="classifier-selected-pop__remove"
                        onClick={() => handleRemoveCo(entry.id)}
                        disabled={saving || removingIds.has(entry.id)}
                        aria-label={`Remover ${entry.fullName}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 6 18 18" />
                          <path d="M18 6 6 18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {loadingUsers ? (
            <div className="classifier-loading">Carregando classificadores...</div>
          ) : userPickerError ? (
            <div className="classifier-error">
              <span>{userPickerError}</span>
              <button
                type="button"
                className="classifier-retry"
                onClick={onRetryLoad}
                disabled={saving}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              <div className="classifier-list" role="listbox" aria-multiselectable>
                {availableUsers.length === 0 ? (
                  <div className="classifier-empty">Nenhum usuário encontrado.</div>
                ) : (
                  availableUsers.map((user) => {
                    const selected = coClassifiers.some((c) => c.id === user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`classifier-row${selected ? ' is-selected' : ''}`}
                        onClick={() => onToggleUser(user)}
                        disabled={saving}
                      >
                        <span className="classifier-row-check">
                          {selected ? (
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M5 13l4 4L19 7"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : null}
                        </span>
                        <span className="classifier-row-body">
                          <span className="classifier-row-name">{user.fullName}</span>
                          <span className="classifier-row-user">@{user.username}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          <div className="app-modal-actions classifier-actions">
            <span className="classifier-auto-hint">
              <svg className="classifier-auto-hint__icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="11" x2="12" y2="16" />
                <line x1="12" y1="8" x2="12" y2="8" />
              </svg>
              <span className="classifier-auto-hint__text">
                O usuário atual é selecionado automaticamente
              </span>
            </span>
            <button
              type="button"
              className="app-modal-submit classifier-confirm"
              onClick={onContinue}
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
