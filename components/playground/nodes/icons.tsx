import type { ReactNode } from 'react';

import type { PgNodeType } from '../../../lib/playground/types';

// Os glifos dos três nodes, num lugar só (PG62). Nasceram dentro de cada node na
// PG61; o painel de nodes passou a mostrá-los também, e duas cópias do mesmo
// desenho é a espécie de coisa que dessincroniza sem ninguém ver — o cartão do
// painel tem que ser o retrato do que vai aparecer no canvas.
//
// Sem `width`/`height` aqui: quem consome dá o tamanho pelo CSS (30px no node,
// 24px no cartão do painel).

/** Um saco de café: base larga, boca amarrada. */
const LoteIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 3h6l-1.5 3.5h-3z" />
    <path d="M13.5 6.5c3 1 5.5 4.2 5.5 8.2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4.3c0-4 2.5-7.2 5.5-8.2" />
  </svg>
);

/** Duas linhas que entram pela esquerda e saem como uma só. */
const MisturaIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M3 7h5a5 5 0 0 1 5 5h8" />
    <path d="M3 17h5a5 5 0 0 0 5-5" />
  </svg>
);

/** Uma ficha: a folha com as linhas do laudo estimado. */
const ResultadoIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </svg>
);

export const NODE_ICONS: Record<PgNodeType, ReactNode> = {
  lote: LoteIcon,
  mistura: MisturaIcon,
  resultado: ResultadoIcon,
};
