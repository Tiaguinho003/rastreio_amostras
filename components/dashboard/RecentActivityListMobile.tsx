'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatRelativeTime, getEventConfig } from '../../lib/dashboard-activity';
import type { DashboardRecentActivityItem, DashboardRecentActivityType } from '../../lib/types';
import { BlendBadge } from '../samples/BlendBadge';

const RELATIVE_TIME_REFRESH_MS = 60_000;
// Container tem altura fixa pra mostrar 6 items VISIVEIS sem scroll;
// dentro do card cabem ate 15 items (os 9 extras acessiveis via scroll
// interno). Backend continua retornando ate 20 (desktop usa todos).
const MAX_ITEMS = 15;
const VISIBLE_ITEMS_NO_SCROLL = 6;
const SKELETON_PLACEHOLDERS = VISIBLE_ITEMS_NO_SCROLL;

function formatLot(lot: string | null, fallback: string): string {
  return lot ?? fallback.slice(0, 8);
}

// Icone por tipo de atividade. Stroke-based SVG (24x24); cor herdada
// via currentColor — o `.recent-activity-mobile-icon` define o color
// final a partir de --activity-color setado inline no link.
function ActivityIcon({ type }: { type: DashboardRecentActivityType }) {
  switch (type) {
    case 'REGISTRATION_CONFIRMED':
      return (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <rect x="6" y="4" width="12" height="16" rx="2" />
          <line x1="9" y1="9" x2="15" y2="9" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      );
    case 'SALE_CREATED':
      return (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M3 12V4h8l10 10-8 8L3 12z" />
          <circle cx="7.5" cy="8" r="1.3" />
        </svg>
      );
    case 'LOSS_RECORDED':
      return (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 3 2 20h20L12 3z" />
          <line x1="12" y1="10" x2="12" y2="14.5" />
          <line x1="12" y1="17.2" x2="12" y2="17.5" />
        </svg>
      );
    case 'PHYSICAL_SAMPLE_SENT':
      return (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4 20-7z" />
        </svg>
      );
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    }
  }
}

interface RecentActivityListMobileProps {
  items: DashboardRecentActivityItem[] | null;
}

export function RecentActivityListMobile({ items }: RecentActivityListMobileProps) {
  // `now` re-renderizado a cada 60s pra timestamps relativos
  // ("ha N min") incrementarem sem precisar refetch dos dados.
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="recent-activity-mobile">
      <header className="recent-activity-mobile-header">
        <h3 className="recent-activity-mobile-title">Últimas atividades</h3>
      </header>

      {items === null ? (
        <ul className="recent-activity-mobile-list" aria-busy="true">
          {Array.from({ length: SKELETON_PLACEHOLDERS }).map((_, i) => (
            <li
              key={i}
              className="recent-activity-mobile-item recent-activity-mobile-item-skeleton"
              aria-hidden="true"
            />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="recent-activity-mobile-empty">
          <p>Nenhuma atividade recente.</p>
        </div>
      ) : (
        <ul className="recent-activity-mobile-list">
          {items.slice(0, MAX_ITEMS).map((item) => {
            const cfg = getEventConfig(item.activity.type);
            const lotLabel = formatLot(item.internalLotNumber, item.sampleId);
            return (
              <li key={item.sampleId} className="recent-activity-mobile-item">
                <Link
                  href={`/samples/${item.sampleId}`}
                  className="recent-activity-mobile-link"
                  aria-label={`${cfg.label} — lote ${lotLabel} — ${formatRelativeTime(item.activity.at, now)}`}
                  style={
                    {
                      '--activity-color': cfg.color,
                      '--activity-bg': cfg.bg,
                    } as React.CSSProperties
                  }
                >
                  <span className="recent-activity-mobile-icon" aria-hidden="true">
                    <ActivityIcon type={item.activity.type} />
                  </span>

                  <span className="recent-activity-mobile-content">
                    <span className="recent-activity-mobile-lot">
                      <span className="recent-activity-mobile-lot-number">{lotLabel}</span>
                      {item.isBlend ? <BlendBadge size="sm" /> : null}
                    </span>
                    <span className="recent-activity-mobile-type">{cfg.label}</span>
                  </span>

                  <span className="recent-activity-mobile-meta">
                    <span className="recent-activity-mobile-time">
                      {formatRelativeTime(item.activity.at, now)}
                    </span>
                    <svg
                      className="recent-activity-mobile-arrow"
                      viewBox="0 0 24 24"
                      focusable="false"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
