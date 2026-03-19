'use client';

import { FormEvent, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, resolveSampleByQr } from '../lib/api-client';
import type { ResolveSampleByQrResponse, SessionData } from '../lib/types';
import { SampleLookupResultModal } from './SampleLookupResultModal';

interface MobileHeaderSearchProps {
  session: SessionData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileHeaderSearch({ session, open, onOpenChange }: MobileHeaderSearchProps) {
  const router = useRouter();
  const panelId = useId();
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResolveSampleByQrResponse | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);

  const normalizedQuery = query.trim();
  const canSubmit = open && normalizedQuery.length > 0 && !submitting;

  function measureAvailableWidth() {
    if (!triggerRef.current) {
      return;
    }

    const logoElement = document.querySelector('.topbar-logo-slot');
    if (!(logoElement instanceof HTMLElement)) {
      setPanelWidth(null);
      return;
    }

    const logoRect = logoElement.getBoundingClientRect();
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const nextWidth = Math.max(0, Math.floor(triggerRect.left - logoRect.right - 12));
    setPanelWidth(nextWidth);
  }

  function closeSearch(options?: { returnFocus?: boolean }) {
    if (submitting) {
      return;
    }

    onOpenChange(false);
    if (options?.returnFocus) {
      window.setTimeout(() => {
        triggerRef.current?.focus();
      }, 0);
    }
  }

  useEffect(() => {
    if (!open) {
      setQuery('');
      setError(null);
      setPanelWidth(null);
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    const onWindowResize = () => {
      measureAvailableWidth();
    };

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!containerRef.current?.contains(target)) {
        closeSearch();
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      closeSearch({ returnFocus: true });
    };

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);

    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [open, submitting]);

  function handleTriggerClick() {
    if (canSubmit) {
      return;
    }

    if (!open) {
      measureAvailableWidth();
      setError(null);
      onOpenChange(true);
      return;
    }

    setError(null);
    inputRef.current?.focus();
  }

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
    measureAvailableWidth();
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
      <div
        ref={containerRef}
        className={`topbar-mobile-search${open ? ' is-open' : ''}`}
        style={panelWidth !== null ? ({ '--topbar-mobile-search-panel-width': `${panelWidth}px` } as CSSProperties) : undefined}
      >
        <form className="topbar-mobile-search-shell" onSubmit={handleSubmit} role="search" aria-label="Buscar amostra por lote interno">
          <div id={panelId} className="topbar-mobile-search-panel" aria-hidden={!open}>
            <label htmlFor={inputId} className="topbar-mobile-search-field">
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
                placeholder="Numero do lote"
                autoComplete="off"
                spellCheck={false}
                disabled={submitting || !open}
                tabIndex={open ? 0 : -1}
                aria-label="Numero do lote"
              />
            </label>

            {error ? (
              <p className="topbar-mobile-search-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <button
            ref={triggerRef}
            type={canSubmit ? 'submit' : 'button'}
            className={`topbar-mobile-search-trigger${open ? ' is-active' : ''}`}
            aria-label={canSubmit ? 'Buscar lote' : 'Abrir busca por lote'}
            aria-expanded={open}
            aria-controls={panelId}
            disabled={submitting}
            onClick={handleTriggerClick}
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
        </form>
      </div>

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
