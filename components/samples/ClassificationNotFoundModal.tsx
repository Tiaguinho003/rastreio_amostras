'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2: lote nao encontrado (Flow A — sem context). O lote e resolvido no
// "Avancar" do review; se nao acha, este modal. Sem cadastro daqui de
// proposito: o registro e sequencial, entao cadastrar fora da sequencia pela
// classificacao nao faz sentido. Duas saidas iguais: Voltar (volta pro review
// pra corrigir o lote) e Cancelar (sai do fluxo). Sem X; Escape = Cancelar.

type Props = {
  open: boolean;
  lot: string;
  onBack: () => void;
  onCancel: () => void;
};

export function ClassificationNotFoundModal({ open, lot, onBack, onCancel }: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action not-found-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="not-found-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="not-found-title" className="app-modal-title">
              {lot ? `Lote ${lot} não encontrado` : 'Lote não encontrado'}
            </h3>
          </div>
        </header>

        <div className="app-modal-content not-found-content">
          <p className="not-found-hint">
            Verifique se o lote foi digitado corretamente. Se a amostra ainda não foi registrada,
            cadastre antes de classificar.
          </p>

          <div className="app-modal-actions not-found-actions">
            <button type="button" className="app-modal-submit" onClick={onBack}>
              Voltar
            </button>
            <button type="button" className="app-modal-secondary" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
