'use client';

import Link from 'next/link';
import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../lib/use-focus-trap';
import type { DashboardSalesAvailabilityResponse } from '../lib/types';

type AgingKey = 'over30' | 'from15to30' | 'under15';

const AGING_BANDS: Array<{ key: AgingKey; label: string; description: string }> = [
  { key: 'over30', label: '+30 dias', description: 'Lotes parados há mais de 30 dias' },
  { key: 'from15to30', label: '+15 dias', description: 'Lotes entre 15 e 30 dias' },
  { key: 'under15', label: '-15 dias', description: 'Lotes com menos de 15 dias' },
];

interface SalesAgingModalProps {
  data: DashboardSalesAvailabilityResponse;
  onClose: () => void;
}

export function SalesAgingModal({ data, onClose }: SalesAgingModalProps) {
  const titleId = useId();
  const focusTrapRef = useFocusTrap(true);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed sales-aging-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id={titleId} className="app-modal-title">
              Distribuição por tempo
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            aria-label="Fechar modal"
            autoFocus
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content">
          <div className="sales-aging-modal-list">
            {AGING_BANDS.map(({ key, label, description }) => (
              <Link
                key={key}
                href={`/samples?aging=${key}`}
                className={`sales-aging-card sales-aging-card--${key}`}
                onClick={onClose}
                aria-label={`${data.bands[key]} lotes ${label}`}
              >
                <div className="sales-aging-card-text">
                  <span className="sales-aging-label">{label}</span>
                  <span className="sales-aging-card-description">{description}</span>
                </div>
                <div className="sales-aging-card-meta">
                  <span className="sales-aging-count-wrap">
                    <strong className="sales-aging-count">{data.bands[key]}</strong>
                    <span className="sales-aging-unit">lotes</span>
                  </span>
                  <svg
                    className="sales-aging-arrow"
                    viewBox="0 0 24 24"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
