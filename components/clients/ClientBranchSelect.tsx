'use client';

import type { ClientBranchSummary } from '../../lib/types';

type ClientBranchSelectProps = {
  label: string;
  branches: ClientBranchSummary[];
  value: string | null;
  onChange: (branchId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  activeOnly?: boolean;
  compact?: boolean;
};

function formatBranchLabel(branch: ClientBranchSummary): string {
  const tag = branch.isPrimary ? 'Matriz' : `Filial ${branch.code}`;
  const place = branch.city && branch.state ? ` · ${branch.city}/${branch.state}` : '';
  const name = branch.name ? ` — ${branch.name}` : branch.legalName ? ` — ${branch.legalName}` : '';
  return `${tag}${name}${place}`;
}

export function ClientBranchSelect({
  label,
  branches,
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecionar filial',
  activeOnly = true,
  compact = false,
}: ClientBranchSelectProps) {
  const items = activeOnly ? branches.filter((item) => item.status === 'ACTIVE') : branches;

  return (
    <label className={`client-branch-select${compact ? ' is-compact' : ''}`}>
      <span className={compact ? 'login-visually-hidden' : undefined}>{label}</span>
      <select
        value={value ?? ''}
        disabled={disabled || items.length === 0}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{items.length === 0 ? 'Nenhuma filial disponivel' : placeholder}</option>
        {items.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {formatBranchLabel(branch)}
          </option>
        ))}
      </select>
    </label>
  );
}
