import type { ReactNode } from 'react';

import type { PgNodeType } from '../../../lib/playground/types';

// Os glifos dos três nodes, num lugar só (PG62). Nasceram dentro de cada node na
// PG61; o painel de nodes passou a mostrá-los também, e duas cópias do mesmo
// desenho é a espécie de coisa que dessincroniza sem ninguém ver — o cartão do
// painel tem que ser o retrato do que vai aparecer no canvas.
//
// Sem `width`/`height` aqui: quem consome dá o tamanho pelo CSS (30px no node,
// 24px na linha do painel).

/**
 * Grão de café — a MESMA silhueta do ícone da aba "Lotes" (AppShell
 * `renderNavIcon('samples')`): elipse inclinada 28° + fenda central em S.
 *
 * Era um saco de café (PG61). O node de Lote representa exatamente o objeto que
 * a página de Lotes lista, e dois desenhos para a mesma coisa fazem o usuário
 * aprender duas vezes. Mesmo precedente do leque "+" de /samples
 * (`SampleCreateRadialFab`), que já copia este glifo.
 */
const LoteIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <ellipse cx="12" cy="12" rx="6.2" ry="8.7" transform="rotate(28 12 12)" />
    <path d="M15.9 4.9c-2.9 2.1-1.1 5-2.9 7.1-1.8 2.1-4.3 2.6-4.9 7" />
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
