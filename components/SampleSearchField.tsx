'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { SampleLookupResultModal } from './SampleLookupResultModal';
import { ApiError, resolveSampleByQr } from '../lib/api-client';
import type { ResolveSampleByQrResponse, SessionData } from '../lib/types';

function translateApiError(error: ApiError): string {
  const msg = error.message.toLowerCase();
  if (error.status === 404 || msg.includes('not found') || msg.includes('no sample')) {
    return 'Amostra nao encontrada.';
  }
  if (error.status === 400 || msg.includes('invalid') || msg.includes('bad request')) {
    return 'Codigo invalido.';
  }
  if (error.status === 401 || error.status === 403) {
    return 'Sem permissao para esta acao.';
  }
  if (/^[a-zA-Z\s.,!?]+$/.test(error.message)) {
    return 'Falha ao localizar a amostra.';
  }
  return error.message;
}

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
  submitLabel = 'Buscar',
}: SampleSearchFieldProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResolveSampleByQrResponse | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }

    if (!error) {
      return;
    }

    errorTimerRef.current = setTimeout(() => {
      setError(null);
    }, 8000);

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('a, button, [role="button"], input, select, textarea')) {
        setError(null);
      }
    }

    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [error]);

  useEffect(() => {
    if (!resultModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    // snapshot da ref no momento do effect: evita acessar .current no cleanup
    const inputEl = inputRef.current;

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
        inputEl?.focus();
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
      setQuery('');
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
      setQuery('');
      if (cause instanceof ApiError) {
        setError(translateApiError(cause));
      } else {
        setError('Falha ao localizar a amostra.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const classes = ['sample-search', compact ? 'sample-search-compact' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <form
        className={classes}
        onSubmit={handleSubmit}
        role="search"
        aria-label="Buscar amostra por numero"
      >
        <label className={`sample-search-field ${error ? 'has-error' : ''}`}>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={error ?? placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-label="Numero da amostra"
            disabled={submitting}
          />
          <button
            type="submit"
            className="sample-search-icon-button"
            disabled={submitting}
            aria-label="Buscar"
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.2 16.2 4.1 4.1" />
            </svg>
          </button>
        </label>
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
