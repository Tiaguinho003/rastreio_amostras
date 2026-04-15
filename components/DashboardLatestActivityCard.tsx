'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef } from 'react';

import type {
  DashboardLatestActivityItem,
  DashboardLatestActivityType,
} from '../lib/types';

interface Props {
  items: DashboardLatestActivityItem[] | null;
}

const FLIP_DURATION_MS = 320;
const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function DashboardLatestActivityCard({ items }: Props) {
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const prevRectsRef = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    if (!items || items.length === 0) {
      prevRectsRef.current = new Map();
      return;
    }

    const newRects = new Map<string, DOMRect>();
    const currentIds = new Set(items.map((item) => item.sampleId));

    itemRefs.current.forEach((el, id) => {
      if (!el || !currentIds.has(id)) return;
      newRects.set(id, el.getBoundingClientRect());
    });

    newRects.forEach((rect, id) => {
      const prev = prevRectsRef.current.get(id);
      if (!prev) return;
      const dy = prev.top - rect.top;
      if (dy === 0) return;

      const el = itemRefs.current.get(id);
      if (!el) return;

      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      // Force reflow to commit the jump-back.
      void el.offsetHeight;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
        el.style.transform = '';
      });
    });

    prevRectsRef.current = newRects;
  }, [items]);

  if (items === null) {
    return <div className="dashboard-activity-card dashboard-activity-loading" aria-hidden="true" />;
  }

  if (items.length === 0) {
    return (
      <div className="dashboard-activity-card">
        <div className="dashboard-activity-empty">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <p>Nenhuma atividade ainda</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-activity-card">
      <div className="dashboard-activity-scroll">
        <div className="dashboard-activity-list">
          {items.map((item) => (
            <Link
              key={item.sampleId}
              ref={(el) => {
                if (el) {
                  itemRefs.current.set(item.sampleId, el);
                } else {
                  itemRefs.current.delete(item.sampleId);
                }
              }}
              href={`/samples/${item.sampleId}`}
              className={buildItemClassName(item)}
            >
              <span className="dashboard-activity-icon" aria-hidden="true">
                {renderIcon(item.activity.type)}
              </span>
              <div className="dashboard-activity-body">
                <div className="dashboard-activity-head">
                  <span className="dashboard-activity-lot">
                    {item.internalLotNumber ?? item.sampleId.slice(0, 8)}
                  </span>
                  <span className="dashboard-activity-time">
                    {formatRelativeTime(item.activity.at)}
                  </span>
                </div>
                <span className="dashboard-activity-producer">
                  {item.producer ?? 'Produtor nao informado'}
                </span>
                <span className="dashboard-activity-description">{buildDescription(item)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildItemClassName(item: DashboardLatestActivityItem): string {
  const classes = ['dashboard-activity-item', getCategoryClass(item.activity.type)];
  if (item.isInvalidated) {
    classes.push('is-invalidated');
  }
  return classes.join(' ');
}

function getCategoryClass(type: DashboardLatestActivityType): string {
  switch (type) {
    case 'REGISTRATION_CONFIRMED':
      return 'is-category-registration';
    case 'SALE_CREATED':
    case 'SALE_CANCELLED':
      return 'is-category-sale';
    case 'LOSS_RECORDED':
    case 'LOSS_CANCELLED':
      return 'is-category-loss';
    case 'SAMPLE_INVALIDATED':
      return 'is-category-invalidation';
  }
}

function buildDescription(item: DashboardLatestActivityItem): string {
  const { type, context } = item.activity;
  const sacks = context.sacks;
  const clientName = context.clientName;
  const reason = context.reason;

  switch (type) {
    case 'REGISTRATION_CONFIRMED':
      return 'Nova amostra recebida';
    case 'SALE_CREATED': {
      const parts = ['Vendida'];
      if (clientName) {
        parts.push(`para ${clientName}`);
      }
      if (typeof sacks === 'number') {
        parts.push(`— ${sacks} sc`);
      }
      return parts.join(' ');
    }
    case 'SALE_CANCELLED':
      return 'Venda cancelada';
    case 'LOSS_RECORDED': {
      const parts = ['Perda'];
      if (typeof sacks === 'number') {
        parts.push(`— ${sacks} sc`);
      }
      if (reason) {
        parts.push(`— ${reason}`);
      }
      return parts.join(' ');
    }
    case 'LOSS_CANCELLED':
      return 'Perda cancelada';
    case 'SAMPLE_INVALIDATED':
      return reason ? `Invalidada — ${reason}` : 'Amostra invalidada';
  }
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Math.max(0, now - then);
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `ha ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `ha ${diffH} h`;

  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hour}:${minute}`;
}

function renderIcon(type: DashboardLatestActivityType) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (type) {
    case 'REGISTRATION_CONFIRMED':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'SALE_CREATED':
    case 'SALE_CANCELLED':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      );
    case 'LOSS_RECORDED':
    case 'LOSS_CANCELLED':
      return (
        <svg {...common}>
          <path d="M12 3 2 21h20L12 3Z" />
          <path d="M12 10v5M12 18h.01" />
        </svg>
      );
    case 'SAMPLE_INVALIDATED':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 8 8 8M16 8l-8 8" />
        </svg>
      );
  }
}
