'use client';

import type { MouseEvent, ReactNode } from 'react';

// DSH-D4 (2026-07-07): a variante com delta "vs ontem" (formatDelta/StatDelta)
// saiu junto com os StatCards de pulso — sobrou o card simples de contagem.

interface StatCardProps {
  icon: ReactNode;
  title: string;
  value: number;
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
