'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useId, useRef, useState } from 'react';

import { CommercialStatusBadge } from './CommercialStatusBadge';
import { StatusBadge } from './StatusBadge';
import { ApiError, resolveSampleByQr } from '../lib/api-client';
import type { ResolveSampleByQrResponse, SessionData } from '../lib/types';

interface SampleSearchFieldProps {
  session: SessionData;
  className?: string;
  compact?: boolean;
  placeholder?: string;
  submitLabel?: string;
}

export function SampleSearchField({
  session,
  className,
  compact = false,
  placeholder = 'Buscar amostra',
  submitLabel = 'Buscar'
}: SampleSearchFieldProps) {
  const router = useRouter();
  const modalTitleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSample, setResultSample] = useState<ResolveSampleByQrResponse['sample'] | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  useEffect(() => {
    if (!resultModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setResultModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    };
  }, [resultModalOpen]);

  function closeResultModal() {
    setResultModalOpen(false);
  }

  function handleSearchAgain() {
    setResultModalOpen(false);
    setError(null);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }

  function handleOpenMoreDetails() {
    if (!resultSample) {
      return;
    }

    setResultModalOpen(false);
    router.push(`/samples/${resultSample.id}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setError('Informe o numero da amostra.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const resolved = await resolveSampleByQr(session, normalizedQuery);
      setResultSample(resolved.sample);
      setResultModalOpen(true);
      setQuery('');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha ao localizar a amostra.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const classes = [
    'sample-search',
    compact ? 'sample-search-compact' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <form className={classes} onSubmit={handleSubmit} role="search" aria-label="Buscar amostra por numero">
        <label className="sample-search-field">
          <span className="sample-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.2 16.2 4.1 4.1" />
            </svg>
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-label="Numero da amostra"
            disabled={submitting}
          />
        </label>

        <button type="submit" className="sample-search-submit" disabled={submitting}>
          {submitting ? 'Buscando...' : submitLabel}
        </button>

        {error ? (
          <p className="sample-search-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {resultSample && resultModalOpen ? (
        <div className="new-sample-label-modal-backdrop" onClick={closeResultModal}>
          <section
            className="new-sample-label-modal sample-search-result-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="new-sample-label-modal-header">
              <h3 id={modalTitleId} className="new-sample-label-modal-title">
                Amostra localizada
              </h3>

              <button
                ref={closeButtonRef}
                type="button"
                className="new-sample-label-modal-close"
                onClick={closeResultModal}
                aria-label="Fechar modal"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="new-sample-label-modal-content">
              <article className="label-print-card sample-search-label-card">
                <div className="sample-search-label-status">
                  <div className="status-badge-group">
                    <StatusBadge status={resultSample.status} />
                    <CommercialStatusBadge status={resultSample.commercialStatus} />
                  </div>
                </div>
                <div className="label-qr">
                  <QRCodeCanvas value={resultSample.internalLotNumber ?? resultSample.id} size={120} />
                </div>
                <div className="label-meta">
                  <p>
                    <strong>Lote interno:</strong> {resultSample.internalLotNumber ?? 'Nao definido'}
                  </p>
                  <p>
                    <strong>Proprietario:</strong> {resultSample.declared.owner ?? 'Nao informado'}
                  </p>
                  <p>
                    <strong>Sacas:</strong> {resultSample.declared.sacks ?? 'Nao informado'}
                  </p>
                  <p>
                    <strong>Safra:</strong> {resultSample.declared.harvest ?? 'Nao informado'}
                  </p>
                  <p>
                    <strong>Lote origem:</strong> {resultSample.declared.originLot ?? 'Nao informado'}
                  </p>
                </div>
              </article>
            </div>

            <div className="row new-sample-print-actions new-sample-label-modal-actions">
              <button type="button" className="new-sample-label-action-new" onClick={handleSearchAgain}>
                Buscar novamente
              </button>
              <button
                type="button"
                className="new-sample-link-button new-sample-label-action-details"
                onClick={handleOpenMoreDetails}
              >
                Mais informacoes
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
