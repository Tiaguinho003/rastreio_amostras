'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { SampleLookupResultModal } from './SampleLookupResultModal';
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResolveSampleByQrResponse | null>(null);
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
    if (!result) {
      return;
    }

    setResultModalOpen(false);
    router.push(result.redirectPath);
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
      setResult(resolved);
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
          <button type="submit" className="sample-search-icon-button" disabled={submitting} aria-label="Buscar">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.2 16.2 4.1 4.1" />
            </svg>
          </button>
        </label>

        {error ? (
          <p className="sample-search-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {result && resultModalOpen ? (
        <SampleLookupResultModal
          sample={result.sample}
          title="Amostra localizada"
          primaryActionLabel="Buscar novamente"
          onPrimaryAction={handleSearchAgain}
          onDetails={handleOpenMoreDetails}
          onClose={closeResultModal}
        />
      ) : null}
    </>
  );
}
