'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { UserLookupItem, UserRole } from '../../lib/types';

type UserPickItem = { id: string; fullName: string };

type Props = {
  /** Label exibido acima do componente. Ex.: "Responsáveis comerciais". */
  label: string;
  /** IDs atualmente selecionados. */
  value: string[];
  /** Callback chamado com a nova lista de IDs. */
  onChange: (next: string[]) => void;
  /** Lista completa carregada do lookup (com role já priorizado). */
  users: UserLookupItem[];
  /** Texto exibido quando nada está selecionado. */
  placeholder?: string;
  /** Loading do lookup. */
  loading?: boolean;
  /** Mensagem de erro inline (vermelha suave). */
  errorMessage?: string;
  /** Bloqueia interação (modo readonly). */
  disabled?: boolean;
  /** Quando focar no input limpa erro inline (controlado pelo parent via key). */
  onClearError?: () => void;
};

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Admin',
  COMMERCIAL: 'Comercial',
  CLASSIFIER: 'Classificador',
  REGISTRATION: 'Registro',
};

function roleClass(role?: UserRole): string {
  if (!role) return '';
  return `is-role-${role.toLowerCase()}`;
}

export function UserMultiSelect({
  label,
  value,
  onChange,
  users,
  placeholder = 'Selecione 1+ responsáveis',
  loading = false,
  errorMessage,
  disabled = false,
  onClearError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Mapa id -> user para resolver chips a partir de IDs
  const usersById = useMemo(() => {
    const map = new Map<string, UserLookupItem>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const selectedUsers: UserPickItem[] = useMemo(
    () =>
      value.map((id) => {
        const found = usersById.get(id);
        return found
          ? { id: found.id, fullName: found.fullName }
          : { id, fullName: 'Usuário indisponível' };
      }),
    [value, usersById]
  );

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    const selectedSet = new Set(value);
    return users
      .filter((u) => !selectedSet.has(u.id))
      .filter((u) => {
        if (!term) return true;
        return u.fullName.toLowerCase().includes(term) || u.username.toLowerCase().includes(term);
      });
  }, [users, search, value]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function handleAdd(id: string) {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setSearch('');
    inputRef.current?.focus();
    onClearError?.();
  }

  function handleRemove(id: string) {
    onChange(value.filter((v) => v !== id));
    onClearError?.();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && search === '' && value.length > 0) {
      // Remove o último chip ao pressionar backspace com input vazio
      handleRemove(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' && !open) {
      setOpen(true);
    }
  }

  return (
    <label className="app-modal-field user-multi-select-field">
      <span className="app-modal-label">{label}</span>
      <div
        ref={containerRef}
        className={`user-multi-select ${open ? 'is-open' : ''} ${
          errorMessage ? 'is-field-error' : ''
        } ${disabled ? 'is-disabled' : ''}`}
      >
        <div className="user-multi-select__chips" onClick={() => inputRef.current?.focus()}>
          {selectedUsers.map((u) => {
            const role = usersById.get(u.id)?.role;
            return (
              <span key={u.id} className="user-multi-select__chip">
                <span className="user-multi-select__chip-label">{u.fullName}</span>
                {role ? (
                  <span className={`user-multi-select__chip-role ${roleClass(role)}`}>
                    {ROLE_LABEL[role]}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="user-multi-select__chip-remove"
                  aria-label={`Remover ${u.fullName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(u.id);
                  }}
                  disabled={disabled}
                >
                  ×
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            type="text"
            className="user-multi-select__input"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
              onClearError?.();
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedUsers.length === 0 ? placeholder : ''}
            disabled={disabled || loading}
          />
        </div>

        {open && !disabled ? (
          <div className="user-multi-select__dropdown" role="listbox">
            {loading ? (
              <div className="user-multi-select__empty">Carregando usuários...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="user-multi-select__empty">
                {search.trim()
                  ? 'Nenhum usuário encontrado'
                  : 'Todos os usuários já estão selecionados'}
              </div>
            ) : (
              filteredOptions.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  className="user-multi-select__option"
                  onClick={() => handleAdd(user.id)}
                  role="option"
                  aria-selected="false"
                >
                  <span className="user-multi-select__option-name">{user.fullName}</span>
                  {user.role ? (
                    <span className={`user-multi-select__option-role ${roleClass(user.role)}`}>
                      {ROLE_LABEL[user.role]}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
      {errorMessage ? (
        <span className="app-modal-error" role="alert">
          {errorMessage}
        </span>
      ) : null}
    </label>
  );
}
