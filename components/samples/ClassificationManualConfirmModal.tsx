'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2 sub-caminho 3b → 2o modal: confirmacao do modo manual.
// Aparece quando o operador, no aviso de erro tecnico (3b), escolhe
// "Continuar manual". Alerta que o operador seguira sem extracao
// automatica e que erros nao serao detectados pela validacao da IA.
//
// "Confirmar e continuar" abre o ReviewModal em modo manual (lote/sacas/
// safra editaveis pre-preenchidos com os valores do sample).

type Props = {
  open: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

export function ClassificationManualConfirmModal({ open, onBack, onConfirm }: Props) {
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
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action manual-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="manual-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="manual-confirm-title" className="app-modal-title">
              Preencher manualmente
            </h3>
            <p className="app-modal-description">A IA falhou na extração.</p>
          </div>
        </header>

        <div className="app-modal-content manual-confirm-content">
          <div className="manual-confirm-body">
            <div className="manual-confirm-icon-wrap" aria-hidden="true">
              <svg
                className="manual-confirm-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="manual-confirm-text">
              <p>Você vai preencher a ficha lendo direto da foto. Ela fica salva como evidência.</p>
              <p className="manual-confirm-warning">
                <strong>Confira cada campo com atenção</strong> — sem extração automática, não há
                validação cruzada pra detectar erros.
              </p>
            </div>
          </div>

          <div className="app-modal-actions manual-confirm-actions">
            <button type="button" className="app-modal-secondary" onClick={onBack}>
              Voltar
            </button>
            <button type="button" className="app-modal-submit" onClick={onConfirm}>
              Confirmar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
