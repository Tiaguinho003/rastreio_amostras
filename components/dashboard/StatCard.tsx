'use client';

import type { MouseEvent, ReactNode } from 'react';

export interface StatDelta {
  pct: number;
  // up = subiu, down = caiu, flat = igual OU variacao que arredonda pra 0%.
  tone: 'up' | 'down' | 'flat';
}

// Delta "vs ontem" dos cards de pulso (registros/envios). Retorna null quando
// ontem = 0 (evita divisao por zero — o card mostra so o numero do dia).
export function formatDelta(today: number, yesterday: number): StatDelta | null {
  if (!yesterday) {
    return null;
  }
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  // tone pelo % JA arredondado: uma queda pequena que arredonda pra 0% fica
  // NEUTRA (cinza), nunca verde — antes `up: pct >= 0` pintava 0% de verde.
  const tone: StatDelta['tone'] = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return { pct, tone };
}

interface StatCardProps {
  icon: ReactNode;
  title: string;
  value: number;
  // Quando presente, renderiza a linha de variacao "vs ontem".
  delta?: StatDelta | null;
  // Quando presente, o card vira um <button> clicavel; senao, um <div> inerte.
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaHasPopup?: 'dialog' | 'menu' | true;
}

export function StatCard({
  icon,
  title,
  value,
  delta,
  onClick,
  ariaLabel,
  ariaExpanded,
  ariaHasPopup,
}: StatCardProps) {
  const inner = (
    <>
      <span className="dd-stat-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="dd-stat-body">
        <span className="dd-stat-title">{title}</span>
        <strong className="dd-stat-value">{value}</strong>
        {delta ? (
          <span className={`dd-stat-delta is-${delta.tone}`}>
            {delta.pct > 0 ? '+' : ''}
            {delta.pct}% vs ontem
          </span>
        ) : null}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="dd-stat-card"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHasPopup}
      >
        {inner}
      </button>
    );
  }

  return <div className="dd-stat-card">{inner}</div>;
}
