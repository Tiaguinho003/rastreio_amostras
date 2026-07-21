'use client';

import { useEffect, useState } from 'react';

import { BottomSheet } from '../BottomSheet';
import type { ClientAttachmentSummary, ClientUnitSummary } from '../../lib/types';

// Preview de anexo do cliente (Fechamento Fase 0 — D27): imagem inline,
// PDF embutido em <iframe>; baixar + excluir (com confirmação inline no
// footer).
// Rodada 5 FV: painel LATERAL (side-sheet stacked) — a seta ← da borda
// fecha; Excluir/Baixar moram no footer sticky do sheet.
//
// Vínculo com a filial: o select só aparece enquanto o anexo não tem filial.
// Escolher grava na hora (sem confirmação) e o vínculo é definitivo — depois
// disso o campo vira texto. `units` deve trazer só as filiais ATIVAS; vazio
// (PJ, ou PF sem filial ativa) esconde o campo por completo.
type Props = {
  open: boolean;
  attachment: ClientAttachmentSummary | null;
  downloadUrl: string | null;
  units: ClientUnitSummary[];
  deleting: boolean;
  linking: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onDelete: () => void;
  onLink: (unitId: string) => void;
};

export function ClientAttachmentPreviewModal({
  open,
  attachment,
  downloadUrl,
  units,
  deleting,
  linking,
  errorMessage,
  onClose,
  onDelete,
  onLink,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  const ready = Boolean(attachment && downloadUrl);
  const isImage = (attachment?.mimeType ?? '').startsWith('image/');
  const isPdf = attachment?.mimeType === 'application/pdf';
  const linkedUnit = attachment?.unit;

  const footerActions = ready ? (
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
            href={downloadUrl ?? undefined}
            download={attachment?.fileName ?? 'anexo'}
          >
            Baixar
          </a>
        </>
      )}
    </div>
  ) : null;

  return (
    <BottomSheet
      open={open && ready}
      onClose={onClose}
      onDismissAttempt={() => !deleting}
      title={attachment?.fileName ?? 'Anexo'}
      ariaLabel="Preview do anexo"
      stacked
      closeVariant="edge-back"
      dragDisabled={deleting}
      className="client-panel-sheet client-attachment-sheet side-sheet"
      footer={footerActions}
    >
      {ready && attachment && downloadUrl ? (
        <>
          {errorMessage ? <p className="cudm-error">{errorMessage}</p> : null}

          <div className="cap-body">
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
            {linkedUnit ? (
              <div className="app-modal-field cap-unit-field">
                <span className="app-modal-label">Filial</span>
                <span
                  className={`cap-unit-locked${
                    linkedUnit.status === 'INACTIVE' ? ' is-inactive' : ''
                  }`}
                >
                  {linkedUnit.name ?? 'Sem nome'}
                </span>
              </div>
            ) : units.length > 0 ? (
              <label className="app-modal-field cap-unit-field">
                <span className="app-modal-label">Filial</span>
                <select
                  className="app-modal-input"
                  value=""
                  disabled={linking}
                  onChange={(event) => {
                    if (event.target.value) onLink(event.target.value);
                  }}
                >
                  <option value="">{linking ? 'Vinculando...' : 'Selecione a filial'}</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name ?? `Filial ${unit.code}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {attachment.description ? (
              <p className="cap-description">{attachment.description}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </BottomSheet>
  );
}
