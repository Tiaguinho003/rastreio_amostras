'use client';

import { useEffect } from 'react';

import type {
  IdentificationDivergence,
  IdentificationField,
} from '../../lib/sample-identification';
import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2 sub-caminho 4: divergencia de sacas/safra (nao-bloqueante).
// Operador e OBRIGADO a escolher, pra cada divergencia, qual valor
// usar (ficha vs cadastro). Sem default pre-selecionado — botao
// "Aplicar e salvar" so habilita quando todas as divergencias tem
// escolha. Sem 2o modal de certeza (a obrigatoriedade da escolha
// campo a campo ja garante coerencia).

export type DataMismatchChoice = 'extracted' | 'stored';

type Props = {
  open: boolean;
  divergences: IdentificationDivergence[];
  choices: Partial<Record<IdentificationField, DataMismatchChoice>>;
  onChoose: (field: IdentificationField, choice: DataMismatchChoice) => void;
  onCancel: () => void;
  onApply: () => void;
  saving?: boolean;
};

const FIELD_LABELS: Record<IdentificationField, string> = {
  lot: 'Lote',
  sacks: 'Sacas',
  harvest: 'Safra',
};

function asText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function ClassificationDataMismatchModal({
  open,
  divergences,
  choices,
  onChoose,
  onCancel,
  onApply,
  saving = false,
}: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!saving) onCancel();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel, saving]);

  if (!open) return null;

  const allChosen = divergences.every((d) => choices[d.field] !== undefined);

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-wide data-mismatch-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="data-mismatch-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="data-mismatch-title" className="app-modal-title">
              Confira sacas e safra
            </h3>
            <p className="app-modal-description">
              Algumas informações divergem do cadastro. Escolha qual valor usar para cada uma.
            </p>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content data-mismatch-content">
          <div className="data-mismatch-list">
            {divergences.map((divergence) => {
              const label = FIELD_LABELS[divergence.field];
              const choice = choices[divergence.field];
              const groupName = `mismatch-${divergence.field}`;
              return (
                <div key={divergence.field} className="data-mismatch-row">
                  <div className="data-mismatch-row-label">{label}</div>
                  <div className="data-mismatch-options">
                    <label
                      className={`data-mismatch-option${choice === 'extracted' ? ' is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name={groupName}
                        checked={choice === 'extracted'}
                        disabled={saving}
                        onChange={() => onChoose(divergence.field, 'extracted')}
                      />
                      <span className="data-mismatch-option-side">
                        <span className="data-mismatch-option-tag">Ficha</span>
                        <span className="data-mismatch-option-value">
                          {asText(divergence.extracted)}
                        </span>
                      </span>
                    </label>
                    <label
                      className={`data-mismatch-option${choice === 'stored' ? ' is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name={groupName}
                        checked={choice === 'stored'}
                        disabled={saving}
                        onChange={() => onChoose(divergence.field, 'stored')}
                      />
                      <span className="data-mismatch-option-side">
                        <span className="data-mismatch-option-tag">Cadastro</span>
                        <span className="data-mismatch-option-value">
                          {asText(divergence.stored)}
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          {!allChosen ? (
            <p className="data-mismatch-hint">Selecione um valor em cada linha para continuar.</p>
          ) : null}

          <div className="app-modal-actions">
            <button
              type="button"
              className="app-modal-submit"
              onClick={onApply}
              disabled={saving || !allChosen}
            >
              {saving ? 'Salvando...' : 'Aplicar e salvar'}
            </button>
            <button
              type="button"
              className="app-modal-secondary"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
