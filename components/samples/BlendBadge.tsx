'use client';

// Liga B3.1: badge "Liga" renderizado ao lado do numero do lote em qualquer
// listagem/detalhe onde aparece uma amostra. Pill lilas com icone de merge
// (origens convergindo em uma) + texto "Liga".
//
// Tom lilas escolhido por nao competir com:
// - verde (status sucesso / brand)
// - vermelho (erro / perigo)
// - ambar (warning / aging)
//
// Visual sem hover/click — badge e apenas indicador, nao acionavel. Pra
// detalhe da liga, o componente pai (link/card) faz a navegacao.

import type { CSSProperties } from 'react';

type BadgeSize = 'sm' | 'md';

interface BlendBadgeProps {
  size?: BadgeSize;
  className?: string;
  style?: CSSProperties;
}

export function BlendBadge({ size = 'sm', className, style }: BlendBadgeProps) {
  const composed = ['blend-badge', `blend-badge--${size}`, className].filter(Boolean).join(' ');
  return (
    <span className={composed} role="img" aria-label="Liga" style={style}>
      <svg className="blend-badge__icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M6 4v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V4" />
        <path d="M12 14v6" />
      </svg>
      <span className="blend-badge__text">Liga</span>
    </span>
  );
}
