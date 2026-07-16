'use client';

import Link from 'next/link';

import { LoadError } from '../LoadError';
import { formatAvisoDue } from '../../lib/aviso-due';
import type { DashboardAviso } from '../../lib/types';

// AP31/DSB-D19: card de "Avisos" do dashboard (desktop-only, coluna à direita do
// calendário). GERAL/extensível — 1º (e por ora único) tipo = "aprovação a enviar".
// BINÁRIO: o aviso some quando a etiqueta é gerada (o feed já filtra por
// NOT EXISTS(approval_label_log)), sem o fan-out impreciso do lembrete antigo (DSB-D9).
// Linhas CLICÁVEIS → worklist de Aprovações (a ação mora na casa, igual aos chips do
// calendário). 4 estados (erro/skeleton/vazio/dados), molde do RecentSendsCard.
interface AvisosCardProps {
  items: DashboardAviso[] | null;
  error?: string | null;
  onRetry?: () => void;
}

// href da worklist de Aprovações (gerar a etiqueta), destacando o contrato.
function avisoHref(item: DashboardAviso): string {
  return `/embarques?tab=aprovacoes&highlight=${item.contractId}`;
}

export function AvisosCard({ items, error, onRetry }: AvisosCardProps) {
  return (
    <section className="avisos-card" aria-label="Avisos">
      <header className="avisos-header">
        <h3 className="avisos-title">Avisos</h3>
        <span className="avisos-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </span>
      </header>
      {error && items === null ? (
        // 1º load falhou: erro + retry no lugar do skeleton eterno.
        <LoadError message={error} onRetry={onRetry} compact />
      ) : items === null ? (
        <div className="avisos-list is-skeleton" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="dashboard-skeleton-line" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="avisos-empty">Nenhum aviso pendente</p>
      ) : (
        <ul className="avisos-list">
          {items.map((item) => {
            const overdue = item.dueInDays !== null && item.dueInDays < 0;
            return (
              <li key={item.id}>
                <Link className="avisos-row" href={avisoHref(item)}>
                  <span className="avisos-row-main">
                    <span className="avisos-contract">{item.contractNumber}</span>
                    <span className="avisos-buyer" title={item.buyerName ?? undefined}>
                      {item.buyerName ?? '—'}
                    </span>
                  </span>
                  <span className={`avisos-due${overdue ? ' is-overdue' : ''}`}>
                    {formatAvisoDue(item.dueInDays)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
