'use client';

import type { ClientSummary } from '../../lib/types';
import { isClientComplete, labelForMissing } from '../../lib/clients/client-completeness';

type ClientCompleteBadgeProps = {
  client: ClientSummary | null | undefined;
  /**
   * 'inline' (default) — span pequeno com emoji + tooltip de contagem
   * 'icon-only' — so o emoji, sem texto (uso em lookup field)
   */
  variant?: 'inline' | 'icon-only';
};

// Q-11: badge passivo. Aparece somente quando o cliente esta incompleto.
// Click nao faz nada — apenas comunica. Aviso detalhado fica no checklist
// da detail page.
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
        🟠
      </span>
    );
  }

  return (
    <span className="sdv-completeness-badge" title={tooltip} aria-label={tooltip}>
      <span className="sdv-completeness-badge__icon" aria-hidden="true">
        🟠
      </span>
      <span className="sdv-completeness-badge__text">
        Incompleto · {missingCount} campo{missingCount === 1 ? '' : 's'}
      </span>
    </span>
  );
}
