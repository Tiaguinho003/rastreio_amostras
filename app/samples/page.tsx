'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError, listSamples } from '../../lib/api-client';
import type { SampleSnapshot } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

const SAMPLE_LIST_LIMIT = 200;

function renderSampleValue(value: string | number | null) {
  if (value === null || value === '') {
    return 'Nao informado';
  }

  return String(value);
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

export default function SamplesPage() {
  const { session, loading, logout } = useRequireAuth();
  const [items, setItems] = useState<SampleSnapshot[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    setLoadingList(true);
    setError(null);

    listSamples(session, { limit: SAMPLE_LIST_LIMIT, offset: 0 })
      .then((response) => {
        if (!active) {
          return;
        }

        setItems(response.items);
        setTotal(response.page.total);
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof ApiError) {
          setError(cause.message);
        } else {
          setError('Falha ao carregar amostras');
        }
      })
      .finally(() => {
        if (active) {
          setLoadingList(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Amostras</h2>
          <p style={{ margin: 0, color: 'var(--muted)' }}>Total: {total}</p>
        </div>

        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Lista inicial de amostras cadastradas. Esta pagina sera expandida nas proximas fases.
        </p>

        {error ? <p className="error">{error}</p> : null}

        {loadingList ? (
          <p style={{ margin: 0 }}>Carregando amostras...</p>
        ) : items.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhuma amostra cadastrada.</p>
        ) : (
          <div className="stack">
            {items.map((sample) => (
              <Link key={sample.id} href={`/samples/${sample.id}`} className="panel stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{sample.internalLotNumber ?? sample.id}</strong>
                  <StatusBadge status={sample.status} />
                </div>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  Proprietario: {renderSampleValue(sample.declared.owner)} | Sacas:{' '}
                  {renderSampleValue(sample.declared.sacks)} | Safra: {renderSampleValue(sample.declared.harvest)}
                </p>
                <p style={{ margin: 0, color: 'var(--muted)' }}>Atualizada em {formatTimestamp(sample.updatedAt)}</p>
              </Link>
            ))}
          </div>
        )}

        <div className="row">
          <Link href="/samples/new" className="dashboard-view-all-link">
            Nova amostra
          </Link>
          <Link href="/dashboard" className="dashboard-view-all-link">
            Voltar ao dashboard
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
