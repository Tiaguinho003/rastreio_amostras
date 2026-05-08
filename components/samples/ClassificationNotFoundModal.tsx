'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Q.cls.2: amostra nao encontrada (Flow A — sem context). Pelo plano
// "Caminho A unico" pos-Q.cls.2 esse fluxo nao deveria mais ser
// alcancavel (acesso direto a /camera sem sampleId nao existe), mas
// o componente fica como fallback de seguranca pra cenarios legados.

type Props = {
  open: boolean;
  lot: string;
  onSair: () => void;
  onCadastrarNova: () => void;
};

export function ClassificationNotFoundModal({ open, lot, onSair, onCadastrarNova }: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSair();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onSair]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed not-found-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="not-found-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="not-found-title" className="app-modal-title">
              Amostra não encontrada
            </h3>
            <p className="app-modal-description">
              {lot
                ? `Nenhuma amostra cadastrada com o lote ${lot}.`
                : 'Nenhuma amostra cadastrada com este lote.'}
            </p>
          </div>
          <button type="button" className="app-modal-close" onClick={onSair} aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content not-found-content">
          <p className="not-found-hint">
            Verifique se o lote foi digitado corretamente. Se a amostra ainda não foi registrada,
            cadastre antes de classificar.
          </p>

          <div className="app-modal-actions">
            <button type="button" className="app-modal-submit" onClick={onCadastrarNova}>
              Cadastrar nova amostra
            </button>
            <button type="button" className="app-modal-secondary" onClick={onSair}>
              Sair
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
