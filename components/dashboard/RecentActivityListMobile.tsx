'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatRelativeTime, getEventConfig } from '../../lib/dashboard-activity';
import type { DashboardRecentActivityItem } from '../../lib/types';
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
        <h3 className="recent-activity-mobile-title">Ultimas atividades</h3>
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
                  style={{ '--activity-color': cfg.color } as React.CSSProperties}
                >
                  <span className="recent-activity-mobile-lot">
                    {lotLabel}
                    {item.isBlend ? <BlendBadge size="sm" /> : null}
                  </span>

                  <span
                    className="recent-activity-mobile-badge"
                    style={{ color: cfg.color, background: cfg.bg }}
                  >
                    {cfg.label}
                  </span>

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
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
