'use client';

import { useEffect, useState } from 'react';

import { getDashboardPending } from '../../lib/api-client';
import type { SessionData } from '../../lib/types';

// Card SO-VISUALIZACAO "Classificacao pendente" no topo da lista de Lotes
// (migrado do dashboard, DSB-D2). Conta as amostras em REGISTRATION_CONFIRMED.
// Inerte por ora — a acao de classificar a partir da fila (o antigo
// OperationModal do dashboard) sera reconstruida na revisao da pagina de Lotes.
// Fonte da contagem: GET /dashboard/pending, mantido como esta por enquanto
// (ver docs/Dashboard-Plano-de-Trabalho.md — DSB-D2/DSB-H4).
export function ClassificationPendingCard({ session }: { session: SessionData }) {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getDashboardPending(session)
      .then((response) => {
        if (active) setTotal(response.classificationPending.total);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session]);

  return (
    <div
      className="spv2-pending-stat"
      aria-label={`Classificação pendente${total !== null ? `: ${total}` : ''}`}
    >
      <span className="spv2-pending-stat-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <ellipse cx="12" cy="12" rx="6.2" ry="9" />
          <path d="M12 4.6 Q 13 8.5 12 12 Q 11 15.5 12 19.4" />
        </svg>
      </span>
      <span className="spv2-pending-stat-body">
        <span className="spv2-pending-stat-title">Classificação pendente</span>
        <strong className="spv2-pending-stat-value">{total ?? '—'}</strong>
      </span>
    </div>
  );
}
