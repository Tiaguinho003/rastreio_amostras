'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Chooser do botao "Enviar" (pagina de detalhe da amostra): unifica os antigos
// botoes "Laudo" e "Enviar" num so. Abre PRIMEIRO e roteia:
//   - "Descricao" -> fluxo de laudo (export PDF) — exige CLASSIFIED + foto.
//   - "Fisico"    -> fluxo de envio fisico (REGISTRATION_CONFIRMED|CLASSIFIED).
// Usa as classes .type-modal-* (.is-action + .type-modal-grid.is-duo /
// .type-modal-choice), reaproveitando .is-disabled. So o rotulo, sem dica.
// (O ClassificationTypeModal, dono original dessas classes, foi removido na
// rodada 2 — o tipo virou um campo da etapa dentro do sheet da camera.)
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
  // Guarda de SSR pro createPortal (LOT-L2; regra da skill modals: modal
  // central sempre portalado pra escapar do transform do PageTransition).
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

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

  if (!open || !portalReady) return null;

  // `is-stacked`: o seletor pode abrir a partir do ⋯ do HERO do drawer do lote
  // (F3), e sem o tier de cima ele ficaria no MESMO z-index do drawer — a
  // ordem de portal decidiria quem aparece. Aberto da lista, nao muda nada.
  return createPortal(
    <div className="app-modal-backdrop is-stacked" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action is-stacked type-modal"
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
            </button>
            <button
              type="button"
              className={`type-modal-choice${canFisico ? '' : ' is-disabled'}`}
              onClick={() => canFisico && onChooseFisico()}
              disabled={!canFisico}
            >
              <span className="type-modal-choice-label">Físico</span>
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
