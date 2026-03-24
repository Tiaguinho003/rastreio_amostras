'use client';

import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, resolveSampleByQr } from '../lib/api-client';
import { useFocusTrap } from '../lib/use-focus-trap';
import type { ResolveSampleByQrResponse, SessionData } from '../lib/types';
import { SampleLookupResultModal } from './SampleLookupResultModal';

interface MobileHeaderSearchProps {
  session: SessionData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileHeaderSearch({ session, open, onOpenChange }: MobileHeaderSearchProps) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const focusTrapRef = useFocusTrap(open);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResolveSampleByQrResponse | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  const normalizedQuery = query.trim();
  const canSubmit = normalizedQuery.length > 0 && !submitting;

  function closeSearch(options?: { returnFocus?: boolean }) {
    if (submitting) {
      return;
    }

    onOpenChange(false);
    setError(null);
    setQuery('');

    if (options?.returnFocus ?? true) {
      window.setTimeout(() => {
        triggerRef.current?.focus();
      }, 0);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 80);

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      closeSearch({ returnFocus: true });
    };

    document.addEventListener('keydown', onDocumentKeyDown);

    return () => {
      window.clearTimeout(focusTimeout);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [open, submitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!normalizedQuery || submitting) {
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const resolved = await resolveSampleByQr(session, normalizedQuery);
      setResult(resolved);
      onOpenChange(false);
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

  function handleSearchAgain() {
    setResultModalOpen(false);
    setError(null);
    onOpenChange(true);
  }

  function handleCloseResultModal() {
    setResultModalOpen(false);
  }

  function handleOpenMoreDetails() {
    if (!result) {
      return;
    }

    setResultModalOpen(false);
    router.push(result.redirectPath);
  }

  return (
    <>
      <div className="topbar-mobile-search">
        <button
          ref={triggerRef}
          type="button"
          className={`topbar-mobile-search-trigger${open ? ' is-active' : ''}`}
          aria-label={open ? 'Fechar busca por lote' : 'Abrir busca por lote'}
          aria-expanded={open}
          aria-controls={titleId}
          disabled={submitting}
          onClick={() => {
            if (open) {
              closeSearch({ returnFocus: true });
              return;
            }

            onOpenChange(true);
          }}
        >
          {submitting ? (
            <span className="topbar-mobile-search-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.2 16.2 4.1 4.1" />
            </svg>
          )}
        </button>
      </div>

      {open ? (
        <div className="app-modal-backdrop" onClick={() => closeSearch()}>
          <section
            ref={focusTrapRef}
            className="app-modal app-modal-search"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h2 id={titleId} className="app-modal-title">
                  Buscar amostra
                </h2>
                <p id={descriptionId} className="app-modal-description">
                  Digite o numero do lote para localizar a amostra.
                </p>
              </div>

              <button
                type="button"
                className="app-modal-close"
                onClick={() => closeSearch({ returnFocus: true })}
                aria-label="Fechar modal"
                disabled={submitting}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <form className="app-modal-content app-modal-search-form" onSubmit={handleSubmit}>
              <label htmlFor={inputId} className="app-modal-field">
                <span className="app-modal-label">Numero do lote</span>
                <input
                  id={inputId}
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    if (error) {
                      setError(null);
                    }
                  }}
                  placeholder="Ex: AM-2026-000123"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={submitting}
                  aria-label="Numero do lote"
                  className="app-modal-input"
                />
              </label>

              <div className="app-modal-feedback" aria-live="polite">
                {error ? (
                  <p className="error app-modal-feedback-text" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="app-modal-actions">
                <button type="submit" className="app-modal-submit" disabled={!canSubmit}>
                  {submitting ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {result && resultModalOpen ? (
        <SampleLookupResultModal
          sample={result.sample}
          title="Amostra localizada"
          primaryActionLabel="Buscar novamente"
          onPrimaryAction={handleSearchAgain}
          onDetails={handleOpenMoreDetails}
          onClose={handleCloseResultModal}
        />
      ) : null}
    </>
  );
}
