'use client';

import { useEffect, useState } from 'react';

import { BlendBadge } from '../samples/BlendBadge';
import { formatRelativeTime } from '../../lib/relative-time';
import type { DashboardRecentSendItem } from '../../lib/types';

interface RecentSendsCardProps {
  items: DashboardRecentSendItem[] | null;
}

// Atualiza os rotulos relativos ("ha N min") sem refetch — mesmo padrao do
// antigo RecentActivityList.
const RELATIVE_TIME_REFRESH_MS = 60_000;

const KIND_LABEL: Record<DashboardRecentSendItem['kind'], string> = {
  PHYSICAL_SAMPLE: 'Amostra física',
  REPORT: 'Laudo',
};

function formatExactDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Card "Últimos envios" (dashboard desktop, DSH-D5): feed dos últimos 40
// envios — amostra física + laudo exportado. Minicards INERTES (decisão do
// usuário) no visual .spv2-card do modal de Lotes pendentes; cancelados
// aparecem esmaecidos com a tag "Cancelado"; destinatário é o ATUAL
// (pós-edição). A lista rola por dentro (o shell do dashboard não rola).
export function RecentSendsCard({ items }: RecentSendsCardProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="dd-sends-card" aria-label="Últimos envios">
      <header className="dd-sends-header">
        <h3 className="dd-sends-title">Últimos envios</h3>
        <span className="dd-sends-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        </span>
      </header>
      {items === null ? (
        <div className="dd-sends-list is-skeleton" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="dashboard-skeleton-line" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="dd-sends-empty">Nenhum envio registrado.</p>
      ) : (
        <div className="dd-sends-list">
          {items.map((item) => {
            const lotLabel = item.internalLotNumber ?? item.sampleId.slice(0, 8);
            return (
              <div key={item.id} className="spv2-card-wrap is-card-pending">
                <div className={`spv2-card is-static${item.cancelled ? ' is-cancelled' : ''}`}>
                  <span className="spv2-card-bar" />
                  <div className="spv2-card-content">
                    <div className="spv2-card-top">
                      <span className="spv2-card-code">{lotLabel}</span>
                      {item.isBlend ? <BlendBadge size="sm" /> : null}
                      {item.cancelled ? (
                        <span className="dd-send-cancelled-tag">Cancelado</span>
                      ) : null}
                      <span
                        className={`dd-send-kind ${item.kind === 'REPORT' ? 'is-report' : 'is-physical'}`}
                      >
                        {KIND_LABEL[item.kind]}
                      </span>
                    </div>
                    <div className="spv2-card-bottom">
                      <span className="spv2-card-owner">{item.recipient ?? '—'}</span>
                      <span className="spv2-card-sep" />
                      <span className="spv2-card-detail" title={formatExactDate(item.at)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                        {formatRelativeTime(item.at, now)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
