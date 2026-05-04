'use client';

import { useEffect, useRef, useState } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';
import type { UserLookupItem } from '../../lib/types';

type Props = {
  users: UserLookupItem[];
  selectedUserId: string;
  onChange: (userId: string) => void;
};

function getUserInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function ClientUserFilterButton({ users, selectedUserId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const trapRef = useFocusTrap(open);

  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) : null;
  const initials = selectedUser ? getUserInitials(selectedUser.fullName) : null;

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

  function handleButtonClick() {
    if (selectedUserId) {
      onChange('');
      return;
    }
    setOpen((v) => !v);
  }

  function handleSelect(userId: string) {
    onChange(userId);
    setOpen(false);
    buttonRef.current?.focus();
  }

  const isActive = Boolean(selectedUserId);

  return (
    <div ref={wrapRef} className="cv2-filter-user-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`cv2-filter-user-btn${isActive ? ' is-active' : ''}`}
        onClick={handleButtonClick}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          selectedUser
            ? `Filtro de responsavel ativo: ${selectedUser.fullName}. Clique para limpar.`
            : 'Abrir filtro por responsavel comercial'
        }
        title={
          selectedUser
            ? `Responsavel: ${selectedUser.fullName} (clique para limpar)`
            : 'Filtrar por responsavel comercial'
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        {isActive && initials ? (
          <span className="cv2-filter-user-btn-badge" aria-hidden="true">
            {initials}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          ref={trapRef}
          className="cv2-filter-user-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Selecionar responsavel comercial"
        >
          <header className="cv2-filter-user-modal-header">
            <h3 className="cv2-filter-user-modal-title">Responsavel comercial</h3>
            <button
              type="button"
              className="cv2-filter-user-modal-close"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div className="cv2-filter-user-modal-body">
            {users.length === 0 ? (
              <p className="cv2-filter-user-modal-empty">Nenhum usuario disponivel.</p>
            ) : (
              <ul className="cv2-filter-user-modal-list">
                {users.map((user) => {
                  const isSelected = user.id === selectedUserId;
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        className={`cv2-filter-user-modal-item${isSelected ? ' is-selected' : ''}`}
                        onClick={() => handleSelect(user.id)}
                      >
                        <span className="cv2-filter-user-modal-item-avatar" aria-hidden="true">
                          {getUserInitials(user.fullName)}
                        </span>
                        <span className="cv2-filter-user-modal-item-name">{user.fullName}</span>
                        {isSelected ? (
                          <svg
                            className="cv2-filter-user-modal-item-check"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path d="m5 12 5 5L20 7" />
                          </svg>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
