'use client';

// Liga: modal de selecao da safra que sai no laudo. Aparece quando o operador
// gera o laudo de uma amostra com mais de uma safra (liga de safras diferentes):
// o laudo nao pode imprimir a safra concatenada (vazaria que e uma liga), entao
// o operador escolhe UMA. E um override de apresentacao — nao muda o
// declaredHarvest da liga.
//
// Fluxo: modal de destinatario -> (safra multipla) este modal -> gera. "Voltar"
// volta ao destinatario; "x" cancela; "Confirmar" so habilita com uma escolha.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';

interface ReportHarvestSelectModalProps {
  open: boolean;
  /** Safras distintas da amostra (opcoes selecionaveis). */
  harvests: string[];
  /** true enquanto o laudo e gerado apos a escolha. */
  submitting: boolean;
  onConfirm: (selected: string) => void;
  onBack: () => void;
  onClose: () => void;
}

export function ReportHarvestSelectModal({
  open,
  harvests,
  submitting,
  onConfirm,
  onBack,
  onClose,
}: ReportHarvestSelectModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [selected, setSelected] = useState<string | null>(null);

  // Comeca sem selecao a cada abertura (Confirmar so habilita apos escolher).
  useEffect(() => {
    if (open) {
      setSelected(null);
    }
  }, [open]);

  // ESC fecha (exceto durante o submit).
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, submitting, onClose]);

  if (!open) {
    return null;
  }

  function handleBackdrop() {
    if (!submitting) {
      onClose();
    }
  }

  function handleConfirm() {
    if (selected && !submitting) {
      onConfirm(selected);
    }
  }

  return createPortal(
    <div className="app-modal-backdrop" onClick={handleBackdrop}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action report-harvest-select-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rhs-title"
        aria-describedby="rhs-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="rhs-title" className="app-modal-title">
              Safra do laudo
            </h3>
            <p id="rhs-desc" className="app-modal-description">
              Esta amostra tem mais de uma safra. Escolha qual sai no laudo.
            </p>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content">
          <div className="rhs-options" role="radiogroup" aria-label="Safras disponiveis">
            {harvests.map((harvest) => {
              const isSelected = selected === harvest;
              return (
                <button
                  key={harvest}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`rhs-option${isSelected ? ' is-selected' : ''}`}
                  onClick={() => setSelected(harvest)}
                  disabled={submitting}
                >
                  <span className="rhs-option-mark" aria-hidden="true" />
                  <span className="rhs-option-label">{harvest}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="app-modal-actions report-harvest-select-actions">
          <button
            type="button"
            className="app-modal-secondary"
            onClick={onBack}
            disabled={submitting}
          >
            Voltar
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={handleConfirm}
            disabled={!selected || submitting}
          >
            {submitting ? 'Gerando...' : 'Confirmar'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
