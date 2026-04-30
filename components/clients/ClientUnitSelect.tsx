'use client';

import type { ClientUnitSummary } from '../../lib/types';

type ClientUnitSelectProps = {
  label: string;
  units: ClientUnitSummary[];
  value: string | null;
  onChange: (unitId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  activeOnly?: boolean;
  compact?: boolean;
};

function formatUnitLabel(unit: ClientUnitSummary): string {
  const tag = `Fazenda ${unit.code}`;
  const place = unit.city && unit.state ? ` · ${unit.city}/${unit.state}` : '';
  const name = unit.name ? ` — ${unit.name}` : unit.legalName ? ` — ${unit.legalName}` : '';
  return `${tag}${name}${place}`;
}

export function ClientUnitSelect({
  label,
  units,
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecionar fazenda',
  activeOnly = true,
  compact = false,
}: ClientUnitSelectProps) {
  const items = activeOnly ? units.filter((item) => item.status === 'ACTIVE') : units;

  return (
    <label className={`client-unit-select${compact ? ' is-compact' : ''}`}>
      <span className={compact ? 'login-visually-hidden' : undefined}>{label}</span>
      <select
        value={value ?? ''}
        disabled={disabled || items.length === 0}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{items.length === 0 ? 'Nenhuma fazenda disponivel' : placeholder}</option>
        {items.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {formatUnitLabel(unit)}
          </option>
        ))}
      </select>
    </label>
  );
}
