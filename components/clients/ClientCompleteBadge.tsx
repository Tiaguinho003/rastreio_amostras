'use client';

import type { ClientSummary } from '../../lib/types';
import { isClientComplete, labelForMissing } from '../../lib/clients/client-completeness';
import { IncompleteIcon } from './IncompleteIcon';

type ClientCompleteBadgeProps = {
  client: ClientSummary | null | undefined;
  /**
   * 'inline' (default) — span pequeno com icone + tooltip de contagem
   * 'icon-only' — so o icone, sem texto (uso em lookup field)
   */
  variant?: 'inline' | 'icon-only';
};

// Q-11: badge passivo. Aparece somente quando o cliente esta incompleto.
// Click nao faz nada — apenas comunica. Aviso detalhado fica no checklist
// da detail page.
// 14.4.B: usa IncompleteIcon (SVG triangulo amber) em vez de emoji 🟠.
// Padroniza com cards/chips de filtro e evita variacao cross-device.
export function ClientCompleteBadge({ client, variant = 'inline' }: ClientCompleteBadgeProps) {
  const result = isClientComplete(client);
  if (result.complete) {
    return null;
  }

  const missingCount = result.missing.length;
  const tooltipLines = result.missing.slice(0, 6).map(labelForMissing);
  const tooltip =
    missingCount <= 6
      ? `Cadastro incompleto · faltam ${missingCount} campo${missingCount === 1 ? '' : 's'}: ${tooltipLines.join(', ')}`
      : `Cadastro incompleto · faltam ${missingCount} campos`;

  if (variant === 'icon-only') {
    return (
      <span
        className="sdv-completeness-badge sdv-completeness-badge--icon-only"
        role="img"
        aria-label={tooltip}
        title={tooltip}
      >
        <IncompleteIcon className="sdv-completeness-badge__svg" />
      </span>
    );
  }

  return (
    <span className="sdv-completeness-badge" title={tooltip} aria-label={tooltip}>
      <span className="sdv-completeness-badge__icon" aria-hidden="true">
        <IncompleteIcon className="sdv-completeness-badge__svg" />
      </span>
      <span className="sdv-completeness-badge__text">
        Incompleto · {missingCount} campo{missingCount === 1 ? '' : 's'}
      </span>
    </span>
  );
}
