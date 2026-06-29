'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, downloadSaleContractPdf } from '../../lib/api-client';
import { downloadFile, shareOrDownloadFile } from '../../lib/share-blob';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SessionData } from '../../lib/types';

type SaleContractDocumentModalProps = {
  session: SessionData;
  contractId: string;
  contractNumber: string;
  onClose: () => void;
};

// Fechamento: modal "Visualizar" — mostra o documento (PDF) gerado on-demand num
// iframe e oferece Exportar (compartilhar) / Baixar (salvar) / Fechar. O PDF nao
// e armazenado (D32): busca via downloadSaleContractPdf e renderiza de um blob.
export function SaleContractDocumentModal({
  session,
  contractId,
  contractNumber,
  onClose,
}: SaleContractDocumentModalProps) {
  const focusTrapRef = useFocusTrap(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<{ blob: Blob; fileName: string } | null>(null);

  useEffect(() => {
    let aborted = false;
    let objectUrl: string | null = null;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { blob, fileName } = await downloadSaleContractPdf(session, contractId);
        if (aborted) return;
        fileRef.current = { blob, fileName };
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (cause) {
        if (!aborted) {
          setError(
            cause instanceof ApiError ? cause.message : 'Não foi possível gerar o documento.'
          );
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session, contractId]);

  async function handleExport() {
    if (!fileRef.current || busy) return;
    setBusy(true);
    try {
      await shareOrDownloadFile(fileRef.current.blob, fileRef.current.fileName, {
        mimeType: 'application/pdf',
        shareTitle: `Contrato ${contractNumber}`,
      });
    } catch {
      setError('Não foi possível compartilhar o documento.');
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!fileRef.current) return;
    downloadFile(fileRef.current.blob, fileRef.current.fileName);
  }

  const ready = pdfUrl !== null;

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action ctr-doc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ctr-doc-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-doc-title" className="app-modal-title">
              Contrato {contractNumber}
            </h3>
          </div>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        <div className="app-modal-content ctr-doc-content">
          {loading ? (
            <p className="ctr-modal-loading">Gerando o documento...</p>
          ) : ready ? (
            <>
              <iframe
                className="ctr-doc-frame"
                src={pdfUrl ?? undefined}
                title={`Documento do contrato ${contractNumber}`}
              />
              <p className="ctr-doc-hint">
                Se a prévia não aparecer no seu aparelho, use Exportar ou Baixar.
              </p>
            </>
          ) : !error ? (
            <p className="ctr-modal-loading">Documento indisponível.</p>
          ) : null}
        </div>

        <div className="app-modal-actions ctr-doc-actions">
          <button type="button" className="app-modal-secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="ctr-btn" onClick={handleDownload} disabled={!ready}>
            Baixar
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={() => void handleExport()}
            disabled={!ready || busy}
          >
            {busy ? 'Exportando...' : 'Exportar'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
