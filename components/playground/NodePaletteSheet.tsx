'use client';

import { useEffect, useState } from 'react';

import { BottomSheet } from '../BottomSheet';
import type { PgNodeType } from '../../lib/playground/types';
import type { SampleSnapshot } from '../../lib/types';
import { LotSearchField } from './LotSearchField';
import { NODE_ICONS } from './nodes/icons';

export const NODE_LABELS: Record<PgNodeType, string> = {
  lote: 'Lote',
  mistura: 'Mistura',
  resultado: 'Resultado',
};

const PALETTE: Array<{ type: PgNodeType; hint: string }> = [
  { type: 'lote', hint: 'Fonte: um lote real' },
  { type: 'mistura', hint: 'Combina 2+ entradas' },
  { type: 'resultado', hint: 'Estimativa da liga' },
];

// Painel de nodes (PG58), agora com DOIS passos (PG60).
//
// Era a paleta docada à esquerda do canvas (PG26); virou o painel lateral
// direito do kit, aberto pelo "+" do canto ou pelo "+" central do canvas vazio.
// O backdrop é o bloqueante padrão — escolher encerra o gesto, então não há
// nada atrás que precise seguir clicável (o contraexemplo é a ficha, ao lado).
//
// PG60: o **Lote** deixou de sair daqui vazio para ser configurado no canvas.
// Escolher "Lote" desliza para o passo 2 (busca + lista) e é a ESCOLHA DO LOTE
// que cria o node — já com o lote e com o saldo inteiro nas sacas. Mistura e
// Resultado não têm o que perguntar: saem no ato, do passo 1.
//
// Sobre `containers` §1-A, que diz que "um passo que responde UMA pergunta é um
// campo": a regra é sobre um ATO com momentos (preencher → conferir → emitir),
// onde a seleção virava sheet só para alimentar o formulário seguinte. Aqui não
// há formulário nem rodapé para alimentar — o painel INTEIRO é um menu, e o
// passo 2 é o drill-down dele. Transformar a lista em "campo" exigiria um
// destino onde o campo morasse, e esse destino não existe: o efeito da escolha
// é o node aparecer no canvas e o painel fechar.
export function NodePaletteSheet({
  open,
  onClose,
  onPickType,
  onPickLot,
}: {
  open: boolean;
  onClose: () => void;
  /** Mistura e Resultado: criados direto do passo 1. */
  onPickType: (type: PgNodeType) => void;
  /** Lote: criado a partir do passo 2, já configurado. */
  onPickLot: (sample: SampleSnapshot) => void;
}) {
  const [onLotStep, setOnLotStep] = useState(false);

  // Reseta na ABERTURA, nunca no fechamento: o `BottomSheet` congela o conteúdo
  // durante os 460ms da saída, e mexer no passo ali trocaria o que está
  // deslizando para fora.
  useEffect(() => {
    if (open) setOnLotStep(false);
  }, [open]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      // §1-A: no passo 2, a seta ←, o ESC e o back do Android VOLTAM um passo em
      // vez de sair. Devolver `false` com efeito colateral é o padrão do kit.
      onDismissAttempt={() => {
        if (onLotStep) {
          setOnLotStep(false);
          return false;
        }
        return true;
      }}
      title={null}
      ariaLabel="Adicionar node"
      closeVariant="edge-back"
      className="fv-panel-sheet side-sheet pg-nodes-sheet"
    >
      <div className={`pg-nodes-step${onLotStep ? ' is-past' : ''}`} aria-hidden={onLotStep}>
        {/* O `.fv-panel-sheet` não usa o slot de `title` do BottomSheet, então o
            título mora no corpo — e, sendo do corpo, desliza com o passo. */}
        <h3 className="pg-panel-title">Adicionar node</h3>
        <div className="fv-choice-group pg-nodes-picker" role="group" aria-label="Tipos de node">
          {PALETTE.map((item) => {
            const drills = item.type === 'lote';
            return (
              <button
                key={item.type}
                type="button"
                className={`fv-choice pg-accent-${item.type}${drills ? ' has-chevron' : ''}`}
                onClick={() => (drills ? setOnLotStep(true) : onPickType(item.type))}
              >
                {/* PG62: o MESMO glifo que o node vai ter no canvas. O cartão
                    deixa de ser uma linha de texto e vira o retrato do que o
                    toque produz. */}
                <span className="pg-nodes-icon" aria-hidden="true">
                  {NODE_ICONS[item.type]}
                </span>
                <span className="fv-choice-label">{NODE_LABELS[item.type]}</span>
                <span className="fv-choice-hint">{item.hint}</span>
                {/* Só o Lote leva a outro lugar; o chevron é o que avisa antes
                    do toque qual dos três não resolve na hora. */}
                {drills ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`pg-nodes-step${onLotStep ? '' : ' is-next'}`} aria-hidden={!onLotStep}>
        <h3 className="pg-panel-title">Escolher o lote</h3>
        <LotSearchField active={onLotStep} onPick={onPickLot} />
      </div>
    </BottomSheet>
  );
}
