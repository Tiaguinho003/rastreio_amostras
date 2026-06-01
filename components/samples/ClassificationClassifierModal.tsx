'use client';

import { useEffect } from 'react';

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
  search: string;
  onSearchChange: (search: string) => void;
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
  search,
  onSearchChange,
  onToggleUser,
  onRemoveCoClassifier,
  onRetryLoad,
  onBack,
  onContinue,
  saving = false,
}: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!saving) onBack();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onBack, saving]);

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const filteredUsers = q
    ? availableUsers.filter(
        (u) => u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
      )
    : availableUsers;

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
          <div className="classifier-chips">
            <span className="classifier-chip is-pinned" aria-label="Você (classificador principal)">
              {currentUser.fullName ?? currentUser.username}
              <span className="classifier-chip-tag">você</span>
            </span>
            {coClassifiers.map((entry) => (
              <span key={entry.id} className="classifier-chip">
                {entry.fullName}
                <button
                  type="button"
                  className="classifier-chip-x"
                  onClick={() => onRemoveCoClassifier(entry.id)}
                  disabled={saving}
                  aria-label={`Remover ${entry.fullName}`}
                >
                  &times;
                </button>
              </span>
            ))}
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
              <input
                type="text"
                className="classifier-search"
                placeholder="Buscar por nome ou usuário"
                value={search}
                disabled={saving}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <div className="classifier-list" role="listbox" aria-multiselectable>
                {filteredUsers.length === 0 ? (
                  <div className="classifier-empty">Nenhum usuário encontrado.</div>
                ) : (
                  filteredUsers.map((user) => {
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

          <div className="app-modal-actions">
            <button
              type="button"
              className="app-modal-submit"
              onClick={onContinue}
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Confirmar e salvar'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
