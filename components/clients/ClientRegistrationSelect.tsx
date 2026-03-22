'use client';

import type { ClientRegistrationSummary } from '../../lib/types';

type ClientRegistrationSelectProps = {
  label: string;
  registrations: ClientRegistrationSummary[];
  value: string | null;
  onChange: (registrationId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  activeOnly?: boolean;
  compact?: boolean;
};

export function ClientRegistrationSelect({
  label,
  registrations,
  value,
  onChange,
  disabled = false,
  placeholder = 'Sem inscricao vinculada',
  activeOnly = true,
  compact = false
}: ClientRegistrationSelectProps) {
  const items = activeOnly ? registrations.filter((item) => item.status === 'ACTIVE') : registrations;

  return (
    <label className={`client-registration-select${compact ? ' is-compact' : ''}`}>
      <span className={compact ? 'login-visually-hidden' : undefined}>{label}</span>
      <select
        value={value ?? ''}
        disabled={disabled || items.length === 0}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{items.length === 0 ? 'Nenhuma inscricao disponivel' : placeholder}</option>
        {items.map((registration) => (
          <option key={registration.id} value={registration.id}>
            {registration.registrationNumber} · {registration.registrationType} · {registration.city}/{registration.state}
          </option>
        ))}
      </select>
    </label>
  );
}
