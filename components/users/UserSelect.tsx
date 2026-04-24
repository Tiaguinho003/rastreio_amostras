'use client';

import type { UserLookupItem } from '../../lib/types';

type UserSelectProps = {
  label: string;
  users: UserLookupItem[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  loading?: boolean;
};

export function UserSelect({
  label,
  users,
  value,
  onChange,
  disabled = false,
  placeholder = 'Sem vinculo',
  loading = false,
}: UserSelectProps) {
  const hasSelectedUnknown = Boolean(value) && !users.some((user) => user.id === value);

  return (
    <label className="app-modal-field">
      <span className="app-modal-label">{label}</span>
      <select
        className="app-modal-input"
        value={value ?? ''}
        disabled={disabled || loading}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{loading ? 'Carregando usuarios...' : placeholder}</option>
        {hasSelectedUnknown && value ? <option value={value}>Usuario indisponivel</option> : null}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.fullName}
          </option>
        ))}
      </select>
    </label>
  );
}
