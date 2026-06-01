'use client';

import { useEffect } from 'react';

import type { ClassificationType } from '../../lib/types';
import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2.8: Modal de selecao do tipo da classificacao. Aparece DEPOIS
// do modal de revisao (tipo virou metadata pos-extracao na Q.cls.2). Click
// num tipo seleciona e avanca pro modal de classificadores automaticamente
// (sem botao Avancar separado). Botao Voltar = seta no canto esquerdo do
// header verde — sem X (cancelar fica concentrado no modal de revisao).
//
// Q.types: 4 tipos habilitados (BICA, PREPARADO, BAIXO, ESCOLHA). Antes,
// "BAIXO" mapeava pro enum legado LOW_CAFF e ESCOLHA ficava disabled.

type Choice = {
  value: ClassificationType;
  label: string;
};

const CHOICES: Choice[] = [
  { value: 'BICA', label: 'BICA' },
  { value: 'PREPARADO', label: 'PREPARADO' },
  { value: 'BAIXO', label: 'BAIXO' },
  { value: 'ESCOLHA', label: 'ESCOLHA' },
  { value: 'CONILON', label: 'CONILON' },
];

type ClassificationTypeModalProps = {
  open: boolean;
  // Tipo atualmente selecionado (vem do parent). Usado pra destacar o
  // botao do tipo escolhido quando o operador volta do modal de
  // classificadores e reabre este.
  selectedType?: ClassificationType | null;
  onBack: () => void;
  onSelect: (type: ClassificationType) => void;
};

export function ClassificationTypeModal({
  open,
  selectedType,
  onBack,
  onSelect,
}: ClassificationTypeModalProps) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onBack]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop" onClick={onBack}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed type-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="type-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header type-modal-header">
          <button type="button" className="type-modal-back" onClick={onBack} aria-label="Voltar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 18l-6-6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="app-modal-title-wrap">
            <h3 id="type-modal-title" className="app-modal-title">
              Tipo de classificação
            </h3>
            <p className="app-modal-description">Selecione como esta amostra foi classificada.</p>
          </div>
        </header>

        <div className="app-modal-content type-modal-content">
          <div className="type-modal-grid">
            {CHOICES.map((choice) => {
              const isSelected = selectedType === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  className={`type-modal-choice${isSelected ? ' is-selected' : ''}`}
                  onClick={() => onSelect(choice.value)}
                >
                  <span className="type-modal-choice-label">{choice.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
