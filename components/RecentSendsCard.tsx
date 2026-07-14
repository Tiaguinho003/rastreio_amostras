'use client';

import { useEffect, useState } from 'react';

import { BlendBadge } from './samples/BlendBadge';
import { LoadError } from './LoadError';
import { formatRelativeTime } from '../lib/relative-time';
import type { RecentSendItem } from '../lib/types';

type RecentSendsVariant = 'samples' | 'approvals';

interface RecentSendsCardProps {
  // DSB-D5/DSB-D8: o mesmo card serve "Amostras enviadas" (variant="samples":
  // colunas Lote · Destinatário · Tipo · Tempo) e "Aprovações enviadas"
  // (variant="approvals": Contrato · Comprador · Tempo, sem tipo — já no título).
  // DSB-D14: o card saiu do dashboard — "samples" mora na página de Lotes e
  // "approvals" na aba Aprovações de /embarques. DESKTOP-ONLY (a classe base
  // .sends-card esconde abaixo de 901px; o fetch é gated pelo hook).
  title: string;
  emptyLabel: string;
  items: RecentSendItem[] | null;
  variant: RecentSendsVariant;
  // Erro de carregamento do feed (só aparece quando ainda não há dado — 1º load
  // falhou). `onRetry` re-dispara o fetch.
  error?: string | null;
  onRetry?: () => void;
}

// Atualiza os rotulos relativos ("ha N min") sem refetch.
const RELATIVE_TIME_REFRESH_MS = 60_000;

// DSB-D8: tipo do envio de amostra em UMA palavra na coluna "Tipo". "Descrição"
// (laudo) é uma divergência consciente do termo "Laudo" usado no resto do app —
// decisão do usuário, escopada só a este card. Aprovação não usa (sem coluna Tipo).
const TYPE_LABEL: Partial<Record<RecentSendItem['kind'], string>> = {
  PHYSICAL_SAMPLE: 'Físico',
  REPORT: 'Descrição',
};

// Cabecalhos de coluna por variante (a ordem casa com as celulas do render).
const COLUMNS: Record<RecentSendsVariant, string[]> = {
  samples: ['Lote', 'Destinatário', 'Tipo', 'Tempo'],
  approvals: ['Contrato', 'Comprador', 'Tempo'],
};

function formatExactDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Linha de cabecalho. `semantic` liga os roles de tabela (só no estado com dados —
// role=columnheader exige ancestral role=table; no skeleton/vazio fica só visual).
function SendsHead({ columns, semantic }: { columns: string[]; semantic: boolean }) {
  return (
    <div className="sends-row sends-head" role={semantic ? 'row' : undefined}>
      {columns.map((col) => (
        <span key={col} className="sends-col" role={semantic ? 'columnheader' : undefined}>
          {col}
        </span>
      ))}
    </div>
  );
}

// Card de envios (desktop-only). DSB-D8: TABELA horizontal compacta — cabecalho de
// colunas (sticky) + uma linha por envio. Cards INERTES (sem clique). Envio
// cancelado: linha esmaecida + numero riscado. Destinatario/comprador longos truncam
// com reticencias (+ title no hover). A lista rola por dentro.
export function RecentSendsCard({
  title,
  emptyLabel,
  items,
  variant,
  error,
  onRetry,
}: RecentSendsCardProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const isApprovals = variant === 'approvals';
  const columns = COLUMNS[variant];

  return (
    <section className="sends-card" aria-label={title}>
      <header className="sends-header">
        <h3 className="sends-title">{title}</h3>
        <span className="sends-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        </span>
      </header>
      {error && items === null ? (
        // 1º load falhou: erro + retry no lugar do skeleton eterno (antes: silêncio).
        <LoadError message={error} onRetry={onRetry} compact />
      ) : items === null ? (
        <div className={`sends-list is-${variant} is-skeleton`} aria-hidden="true">
          <SendsHead columns={columns} semantic={false} />
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="dashboard-skeleton-line" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={`sends-list is-${variant}`}>
          <SendsHead columns={columns} semantic={false} />
          <p className="sends-empty">{emptyLabel}</p>
        </div>
      ) : (
        <div className={`sends-list is-${variant}`} role="table" aria-label={title}>
          <SendsHead columns={columns} semantic />
          {items.map((item) => {
            // Aprovacao (AP16): nº do contrato + comprador; amostra: lote + destinatario.
            const code = isApprovals
              ? (item.contractNumber ?? '—')
              : (item.internalLotNumber ?? item.sampleId?.slice(0, 8) ?? '—');
            const party = isApprovals ? (item.buyer ?? '—') : (item.recipient ?? '—');
            return (
              <div
                key={item.id}
                className={`sends-row${item.cancelled ? ' is-cancelled' : ''}`}
                role="row"
              >
                <span className="sends-cell sends-code" role="cell">
                  <span className="sends-code-text">{code}</span>
                  {item.isBlend ? <BlendBadge size="sm" /> : null}
                </span>
                <span className="sends-cell sends-party" role="cell" title={party}>
                  {party}
                </span>
                {isApprovals ? null : (
                  <span className="sends-cell sends-type" role="cell">
                    {TYPE_LABEL[item.kind] ?? '—'}
                  </span>
                )}
                <span
                  className="sends-cell sends-time"
                  role="cell"
                  title={formatExactDate(item.at)}
                >
                  {formatRelativeTime(item.at, now)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
