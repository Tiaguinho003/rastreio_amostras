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
        className="app-modal is-themed manual-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="manual-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
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
            <h3 id="manual-confirm-title" className="app-modal-title">
              Preencher manualmente
            </h3>
            <p className="app-modal-description">A IA não conseguiu extrair os dados desta foto.</p>
          </div>
        </header>

        <div className="app-modal-content manual-confirm-content">
          <div className="manual-confirm-body">
            <svg
              className="manual-confirm-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="manual-confirm-text">
              <p>
                Você seguirá preenchendo a ficha à mão, lendo direto da foto. A foto continua salva
                como evidência da classificação.
              </p>
              <p className="manual-confirm-warning">
                <strong>Analise bem as informações antes de salvar</strong> — sem extração
                automática, eventuais erros não são detectados pela validação cruzada.
              </p>
            </div>
          </div>

          <div className="app-modal-actions">
            <button type="button" className="app-modal-submit" onClick={onConfirm}>
              Confirmar e continuar
            </button>
            <button type="button" className="app-modal-secondary" onClick={onBack}>
              Voltar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
