'use client';

// Liga B1.5: popover de revisao das amostras selecionadas no modo
// selecao de /samples. Ancorado ao botao contador "N selecionadas"
// (.spv2-selection-counter). Lista compacta com lote + saldo disponivel
// + botao X pra remover individualmente. Scroll interno apos 3 cards.
//
// Substitui o tap no contador que abria o <BlendConfirmationSheet>
// completo (F1.D original). Esse caminho fica EXCLUSIVAMENTE pra seta
// "->" do FAB na finalizacao da liga (Wave B2 futura).
//
// Decisoes UX:
// - Click fora fecha (backdrop transparente fixed full-screen).
// - Remover individual: animacao slide-out + fade ~150ms antes de remover
//   do Set selectedIds no parent.
// - Edge "ultima removida": parent decide (fecha dropdown + mantem modo).
//
// Reusa --ease-spring (globals.css) e padrao de backdrop transparente
// do SampleCreateRadialFab (.fab-radial-backdrop).

import { useEffect, useRef, useState } from 'react';

export interface SelectedSampleSummary {
  id: string;
  lot: string;
  availableSacks: number | null;
}

interface SelectedSamplesDropdownProps {
  samples: SelectedSampleSummary[];
  onRemove: (id: string) => void;
  onClose: () => void;
}

const REMOVE_ANIMATION_MS = 150;

export function SelectedSamplesDropdown({
  samples,
  onRemove,
  onClose,
}: SelectedSamplesDropdownProps) {
  // Ids cuja animacao de saida esta rodando — durante esse tempo o card
  // continua no DOM com classe .is-removing pra a animacao completar.
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  // Pra cancelar timers no unmount (ex: se backdrop fecha antes da
  // animacao terminar).
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Escape fecha o dropdown.
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [onClose]);

  // Cleanup dos timers de animacao no unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  function handleRemoveClick(id: string) {
    if (removingIds.has(id)) return;
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      onRemove(id);
      setRemovingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, REMOVE_ANIMATION_MS);
    timersRef.current.set(id, timer);
  }

  return (
    <>
      <div
        className="selected-samples-dropdown-backdrop"
        onPointerDown={onClose}
        aria-hidden="true"
      />
      <div
        className="selected-samples-dropdown"
        role="menu"
        aria-label="Amostras selecionadas pra liga"
      >
        <div className="selected-samples-dropdown__scroll">
          {samples.map((sample) => {
            const isRemoving = removingIds.has(sample.id);
            return (
              <div
                key={sample.id}
                className={`selected-samples-dropdown__card${isRemoving ? ' is-removing' : ''}`}
                role="menuitem"
              >
                <span className="selected-samples-dropdown__card-text">
                  <span className="selected-samples-dropdown__card-lot">{sample.lot}</span>
                  <span className="selected-samples-dropdown__card-meta">
                    {sample.availableSacks ?? '—'} sc
                  </span>
                </span>
                <button
                  type="button"
                  className="selected-samples-dropdown__remove"
                  aria-label={`Remover amostra ${sample.lot} da seleção`}
                  onClick={() => handleRemoveClick(sample.id)}
                  disabled={isRemoving}
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M6 6 18 18" />
                    <path d="M18 6 6 18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
