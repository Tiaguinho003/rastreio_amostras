'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatRelativeTime, getActivityFocus, getEventConfig } from '../../lib/dashboard-activity';
import type { DashboardRecentActivityItem } from '../../lib/types';
import { BlendBadge } from '../samples/BlendBadge';

const RELATIVE_TIME_REFRESH_MS = 60_000;

function formatSacks(sacks: number | null): string {
  if (sacks === null || sacks === undefined) return '—';
  return `${sacks} ${sacks === 1 ? 'saca' : 'sacas'}`;
}

function formatProducer(producer: string | null): string {
  if (!producer || producer.trim() === '') return 'Nao informado';
  return producer;
}

function formatRecipient(recipient: string | null): string {
  if (!recipient || recipient.trim() === '') return '—';
  return recipient;
}

function formatLot(lot: string | null, fallback: string): string {
  return lot ?? fallback.slice(0, 8);
}

interface RecentActivityListProps {
  items: DashboardRecentActivityItem[] | null;
}

export function RecentActivityList({ items }: RecentActivityListProps) {
  // `now` re-renderizado a cada 60s pra timestamps relativos
  // ("ha N min") incrementarem sem precisar refetch dos dados.
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  if (items === null) {
    return (
      <div className="dd-activity-container">
        <div className="dd-activity-header">
          <h3 className="dd-activity-title">Ultimas atividades</h3>
        </div>
        <div className="dd-activity-list" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="dd-activity-card dd-activity-skeleton" aria-hidden="true">
              <span className="dd-card-label-placeholder" style={{ width: 70, height: 14 }} />
              <span className="dd-card-label-placeholder" style={{ width: '60%', height: 14 }} />
              <span className="dd-card-label-placeholder" style={{ width: 90, height: 14 }} />
              <span className="dd-card-label-placeholder" style={{ width: 60, height: 14 }} />
              <span className="dd-card-label-placeholder" style={{ width: '55%', height: 14 }} />
              <span className="dd-card-label-placeholder" style={{ width: 55, height: 14 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="dd-activity-container">
        <div className="dd-activity-header">
          <h3 className="dd-activity-title">Ultimas atividades</h3>
        </div>
        <div className="dd-activity-empty">
          <p>Nenhuma atividade recente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dd-activity-container">
      <div className="dd-activity-header">
        <h3 className="dd-activity-title">Ultimas atividades</h3>
      </div>
      <div className="dd-activity-list">
        {items.map((item) => {
          const cfg = getEventConfig(item.activity.type);
          return (
            <Link
              key={item.id}
              href={`/samples/${item.sampleId}?focus=${getActivityFocus(item.activity.type)}`}
              className="dd-activity-card"
            >
              <span className="dd-activity-lot">
                {formatLot(item.internalLotNumber, item.sampleId)}
                {item.isBlend ? <BlendBadge size="sm" /> : null}
              </span>
              <span className="dd-activity-producer">{formatProducer(item.producer)}</span>
              <span className="dd-activity-event" style={{ color: cfg.color, background: cfg.bg }}>
                {cfg.label}
              </span>
              <span className="dd-activity-sacks">{formatSacks(item.sacks)}</span>
              <span className="dd-activity-recipient">{formatRecipient(item.recipient)}</span>
              <span className="dd-activity-time">{formatRelativeTime(item.activity.at, now)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
