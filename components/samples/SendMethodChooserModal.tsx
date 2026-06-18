'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Chooser do botao "Enviar" (pagina de detalhe da amostra): unifica os antigos
// botoes "Laudo" e "Enviar" num so. Abre PRIMEIRO e roteia:
//   - "Descricao" -> fluxo de laudo (export PDF) — exige CLASSIFIED + foto.
//   - "Fisico"    -> fluxo de envio fisico (REGISTRATION_CONFIRMED|CLASSIFIED).
// Espelha o visual do ClassificationTypeModal (.is-action + .type-modal-grid /
// .type-modal-choice), reaproveitando .is-disabled + .type-modal-choice-hint.
// Sem seta de voltar (e o primeiro modal): o X (ou tap-fora) fecha. As setas de
// voltar ficam nos modais de destino (export/fisico), que reabrem este.

type SendMethodChooserModalProps = {
  open: boolean;
  // "Descricao" (laudo) so com amostra CLASSIFIED + foto de classificacao.
  canDescricao: boolean;
  // "Fisico" segue o gate do envio fisico (REGISTRATION_CONFIRMED|CLASSIFIED).
  canFisico: boolean;
  onClose: () => void;
  onChooseDescricao: () => void;
  onChooseFisico: () => void;
};

export function SendMethodChooserModal({
  open,
  canDescricao,
  canFisico,
  onClose,
  onChooseDescricao,
  onChooseFisico,
}: SendMethodChooserModalProps) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action type-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-method-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="send-method-title" className="app-modal-title">
              Enviar
            </h3>
          </div>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content type-modal-content">
          <div className="type-modal-grid is-duo">
            <button
              type="button"
              className={`type-modal-choice${canDescricao ? '' : ' is-disabled'}`}
              onClick={() => canDescricao && onChooseDescricao()}
              disabled={!canDescricao}
            >
              <span className="type-modal-choice-label">Descrição</span>
              <span className="type-modal-choice-hint">
                {canDescricao ? 'Laudo (PDF)' : 'Disponível após classificar'}
              </span>
            </button>
            <button
              type="button"
              className={`type-modal-choice${canFisico ? '' : ' is-disabled'}`}
              onClick={() => canFisico && onChooseFisico()}
              disabled={!canFisico}
            >
              <span className="type-modal-choice-label">Físico</span>
              <span className="type-modal-choice-hint">Envio da amostra</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
