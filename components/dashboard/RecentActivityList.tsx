'use client';

import Link from 'next/link';

import type { DashboardRecentActivityItem, DashboardRecentActivityType } from '../../lib/types';

const EVENT_CONFIG: Record<
  DashboardRecentActivityType,
  { label: string; color: string; bg: string }
> = {
  REGISTRATION_CONFIRMED: {
    label: 'Registrada',
    color: '#5a8a5f',
    bg: 'rgba(90, 138, 95, 0.12)',
  },
  SALE_CREATED: {
    label: 'Vendida',
    color: '#3a6ea3',
    bg: 'rgba(58, 110, 163, 0.12)',
  },
  LOSS_RECORDED: {
    label: 'Perda',
    color: '#9a3434',
    bg: 'rgba(154, 52, 52, 0.12)',
  },
};

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `ha ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `ha ${d} ${d === 1 ? 'dia' : 'dias'}`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    return `ha ${w} sem`;
  }
  const mo = Math.floor(d / 30);
  return `ha ${mo} ${mo === 1 ? 'mes' : 'meses'}`;
}

function formatSacks(sacks: number | null): string {
  if (sacks === null || sacks === undefined) return '—';
  return `${sacks} ${sacks === 1 ? 'saca' : 'sacas'}`;
}

function formatProducer(producer: string | null): string {
  if (!producer || producer.trim() === '') return 'Nao informado';
  return producer;
}

function formatLot(lot: string | null, fallback: string): string {
  return lot ?? fallback.slice(0, 8);
}

interface RecentActivityListProps {
  items: DashboardRecentActivityItem[] | null;
}

export function RecentActivityList({ items }: RecentActivityListProps) {
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
              <span className="dd-card-label-placeholder" style={{ width: '50%', height: 14 }} />
              <span className="dd-card-label-placeholder" style={{ width: 60, height: 14 }} />
              <span className="dd-card-label-placeholder" style={{ width: 90, height: 14 }} />
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
        <span className="dd-activity-count">{items.length}</span>
      </div>
      <div className="dd-activity-list">
        {items.map((item) => {
          const cfg = EVENT_CONFIG[item.activity.type];
          return (
            <Link
              key={item.sampleId}
              href={`/samples/${item.sampleId}`}
              className="dd-activity-card"
            >
              <span className="dd-activity-lot">
                {formatLot(item.internalLotNumber, item.sampleId)}
              </span>
              <span className="dd-activity-producer">{formatProducer(item.producer)}</span>
              <span className="dd-activity-sacks">{formatSacks(item.sacks)}</span>
              <span className="dd-activity-event" style={{ color: cfg.color, background: cfg.bg }}>
                {cfg.label}
              </span>
              <span className="dd-activity-time">{formatRelativeTime(item.activity.at)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
