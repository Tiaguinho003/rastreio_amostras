'use client';

// Liga B3.1: badge "Liga" renderizado ao lado do numero do lote em qualquer
// listagem/detalhe onde aparece uma amostra. Pill lilas com o texto "Liga".
//
// RD16 M2 (rodada 4): o icone de merge saiu. Em 10px ele nao se lia como
// "origens convergindo" — virava um borrao ao lado de uma palavra de cinco
// letras que ja diz tudo. Vale nos SETE consumidores: o badge e a mesma peca
// em todos, e so o rotulo carrega significado.
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
      <span className="blend-badge__text">Liga</span>
    </span>
  );
}
