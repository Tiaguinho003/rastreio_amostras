'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientAttachmentSummary } from '../../lib/types';

// Preview de anexo do cliente (Fechamento Fase 0 — D27): imagem inline,
// PDF embutido em <iframe>; baixar + excluir (com confirmação).
type Props = {
  open: boolean;
  attachment: ClientAttachmentSummary | null;
  downloadUrl: string | null;
  deleting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onDelete: () => void;
};

export function ClientAttachmentPreviewModal({
  open,
  attachment,
  downloadUrl,
  deleting,
  errorMessage,
  onClose,
  onDelete,
}: Props) {
  const focusTrapRef = useFocusTrap(open);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  if (!open || !attachment || !downloadUrl) return null;

  const isImage = (attachment.mimeType ?? '').startsWith('image/');
  const isPdf = attachment.mimeType === 'application/pdf';

  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action cap-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cap-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="cap-title" className="app-modal-title cap-title">
              {attachment.fileName ?? 'Anexo'}
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={deleting}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {errorMessage ? <p className="cudm-error">{errorMessage}</p> : null}

        <div className="app-modal-content cap-body">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="cap-preview-img"
              src={downloadUrl}
              alt={attachment.fileName ?? 'Anexo'}
            />
          ) : isPdf ? (
            <iframe
              className="cap-preview-pdf"
              src={downloadUrl}
              title={attachment.fileName ?? 'PDF'}
            />
          ) : (
            <div className="cap-preview-fallback">
              <p>Pré-visualização indisponível para este tipo de arquivo.</p>
            </div>
          )}
          {attachment.description ? (
            <p className="cap-description">{attachment.description}</p>
          ) : null}
        </div>

        <div className="app-modal-actions cap-actions">
          {confirming ? (
            <>
              <span className="cap-confirm-text">Excluir este anexo?</span>
              <button
                type="button"
                className="app-modal-secondary"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="cudm-status-btn is-danger"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="cap-delete-btn"
                onClick={() => setConfirming(true)}
                disabled={deleting}
              >
                Excluir
              </button>
              <a
                className="app-modal-submit cap-download"
                href={downloadUrl}
                download={attachment.fileName ?? 'anexo'}
              >
                Baixar
              </a>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
