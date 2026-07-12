'use client';

import { useEffect, useState } from 'react';

import { BlendBadge } from '../samples/BlendBadge';
import { formatRelativeTime } from '../../lib/relative-time';
import type { DashboardRecentSendItem } from '../../lib/types';

type RecentSendsVariant = 'samples' | 'approvals';

interface RecentSendsCardProps {
  // DSB-D5/DSB-D8: o mesmo card serve "Amostras enviadas" (variant="samples":
  // colunas Lote · Destinatário · Tipo · Tempo) e "Aprovações enviadas"
  // (variant="approvals": Contrato · Comprador · Tempo, sem tipo — já no título).
  title: string;
  emptyLabel: string;
  items: DashboardRecentSendItem[] | null;
  variant: RecentSendsVariant;
}

// Atualiza os rotulos relativos ("ha N min") sem refetch.
const RELATIVE_TIME_REFRESH_MS = 60_000;

// DSB-D8: tipo do envio de amostra em UMA palavra na coluna "Tipo". "Descrição"
// (laudo) é uma divergência consciente do termo "Laudo" usado no resto do app —
// decisão do usuário, escopada só a este card. Aprovação não usa (sem coluna Tipo).
const TYPE_LABEL: Partial<Record<DashboardRecentSendItem['kind'], string>> = {
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
    <div className="dd-send-row dd-send-head" role={semantic ? 'row' : undefined}>
      {columns.map((col) => (
        <span key={col} className="dd-send-col" role={semantic ? 'columnheader' : undefined}>
          {col}
        </span>
      ))}
    </div>
  );
}

// Card de envios (dashboard desktop). DSB-D8: virou uma TABELA horizontal compacta —
// cabecalho de colunas (sticky) + uma linha por envio, desacoplada do visual
// .spv2-card. Cards INERTES (sem clique). Envio cancelado: linha esmaecida + numero
// riscado. Destinatario/comprador longos truncam com reticencias (+ title no hover).
// A lista rola por dentro (o shell do dashboard nao rola).
export function RecentSendsCard({ title, emptyLabel, items, variant }: RecentSendsCardProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const isApprovals = variant === 'approvals';
  const columns = COLUMNS[variant];

  return (
    <section className="dd-sends-card" aria-label={title}>
      <header className="dd-sends-header">
        <h3 className="dd-sends-title">{title}</h3>
        <span className="dd-sends-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        </span>
      </header>
      {items === null ? (
        <div className={`dd-sends-list is-${variant} is-skeleton`} aria-hidden="true">
          <SendsHead columns={columns} semantic={false} />
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="dashboard-skeleton-line" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={`dd-sends-list is-${variant}`}>
          <SendsHead columns={columns} semantic={false} />
          <p className="dd-sends-empty">{emptyLabel}</p>
        </div>
      ) : (
        <div className={`dd-sends-list is-${variant}`} role="table" aria-label={title}>
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
                className={`dd-send-row${item.cancelled ? ' is-cancelled' : ''}`}
                role="row"
              >
                <span className="dd-send-cell dd-send-code" role="cell">
                  <span className="dd-send-code-text">{code}</span>
                  {item.isBlend ? <BlendBadge size="sm" /> : null}
                </span>
                <span className="dd-send-cell dd-send-party" role="cell" title={party}>
                  {party}
                </span>
                {isApprovals ? null : (
                  <span className="dd-send-cell dd-send-type" role="cell">
                    {TYPE_LABEL[item.kind] ?? '—'}
                  </span>
                )}
                <span
                  className="dd-send-cell dd-send-time"
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
