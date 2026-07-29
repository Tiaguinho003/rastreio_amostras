'use client';

import type { ContractPhaseKey, ContractPhaseState, ContractPhases } from '../../lib/types';

// RC-D80..D83: a linha das cinco fases, na coluna "Situação" da tabela do desktop.
//
// 🔴 O desenho carrega uma afirmação do modelo: os TRILHOS entre os pontos são
// sempre neutros — só os PONTOS mudam de estado. É de propósito. Trilho preenchido
// leria como barra de progresso ("cheguei até aqui"), e neste contrato nada trava
// nada (§6): dá pra finalizar sem aprovação (RC-D66) e pagar antes do faturamento.
// Cinco luzes num trilho contam a verdade; uma barra mentiria.

const PHASE_LABEL: Record<ContractPhaseKey, string> = {
  emissao: 'Emissão',
  aprovacao: 'Aprovação',
  embarque: 'Embarque',
  faturamento: 'Faturamento',
  pagamento: 'Pagamento',
};

const STATE_LABEL: Record<ContractPhaseState, string> = {
  feito: 'concluída',
  pendente: 'pendente',
  na: 'não se aplica',
};

export function ContractPhaseLine({ phases }: { phases?: ContractPhases }) {
  // Sem `phases` a linha não aparece. Desenhar tudo pendente seria inventar um
  // estado — e o payload legado (testes de contrato) não carrega o campo.
  if (!phases) return null;

  const summary = phases.points
    .map((point) => `${PHASE_LABEL[point.key]} ${STATE_LABEL[point.state]}`)
    .join(', ');

  return (
    <span
      className={`ctr-phaseline${phases.cancelado ? ' is-cancelado' : ''}`}
      role="img"
      aria-label={phases.cancelado ? `Cancelado. ${summary}` : summary}
    >
      {phases.points.map((point, index) => {
        // Washout fecha a linha no último ponto: o pagamento é o que nunca vai
        // chegar. Os pontos anteriores seguem como derivados — o que aconteceu
        // antes do cancelamento aconteceu.
        const isEnd = phases.cancelado && index === phases.points.length - 1;
        return (
          <span key={point.key} className={`ctr-phase-pt is-${point.state}`}>
            <span
              className={`ctr-phase-dot${isEnd ? ' is-x' : ''}`}
              title={`${PHASE_LABEL[point.key]} — ${
                isEnd ? 'cancelado' : STATE_LABEL[point.state]
              }`}
            />
          </span>
        );
      })}
    </span>
  );
}
