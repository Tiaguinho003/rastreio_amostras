'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, downloadEspelhoPdf, logEspelhoExport } from '../../lib/api-client';
import { downloadFile, shareOrDownloadFile } from '../../lib/share-blob';
import { useToast } from '../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SaleContract, SessionData } from '../../lib/types';

import type { EspelhoSide } from './EspelhoConferenciaModal';

type EspelhoCorretagemModalProps = {
  session: SessionData;
  contract: SaleContract;
  // Lado escolhido na fase de CONFERÊNCIA (EspelhoConferenciaModal, D134) — o
  // toggle vive lá; a prévia só herda.
  side: EspelhoSide;
  onClose: () => void;
};

// Espelho de Corretagem (Fase E): PRÉVIA do PDF (on-demand, D71) com Exportar/
// Baixar. É a 2ª etapa do fluxo (D134): os campos já foram conferidos no
// EspelhoConferenciaModal, que define o lado. A prévia NÃO conta como auditoria
// — o log de exportação é gravado no clique em Exportar/Baixar (D127). O
// contrato deve estar congelado (EMITIDO/FATURADO/PAGO/WASH_OUT, D105) — a
// página só abre este fluxo p/ elegíveis.
export function EspelhoCorretagemModal({
  session,
  contract,
  side,
  onClose,
}: EspelhoCorretagemModalProps) {
  const focusTrapRef = useFocusTrap(true);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<{ blob: Blob; fileName: string } | null>(null);

  // Busca o PDF do lado escolhido (regeneração on-demand).
  useEffect(() => {
    let aborted = false;
    let objectUrl: string | null = null;
    (async () => {
      setLoading(true);
      setError(null);
      setPdfUrl(null);
      fileRef.current = null;
      try {
        // preview: a prévia não conta como auditoria (D127).
        const { blob, fileName } = await downloadEspelhoPdf(session, contract.id, side, {
          preview: true,
        });
        if (aborted) return;
        fileRef.current = { blob, fileName };
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (cause) {
        if (!aborted) {
          setError(cause instanceof ApiError ? cause.message : 'Não foi possível gerar o espelho.');
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session, contract.id, side]);

  // D127: audita ("Espelho exportado" no timeline) SÓ na ENTREGA concluída — não na
  // intenção. Fire-and-forget (log falho não invalida a entrega) + toast de sucesso.
  function logDelivered() {
    void logEspelhoExport(session, contract.id, side).catch(() => {});
    toast.success({ title: 'Espelho exportado' });
  }

  async function handleExport() {
    if (!fileRef.current || busy) return;
    setBusy(true);
    try {
      const result = await shareOrDownloadFile(fileRef.current.blob, fileRef.current.fileName, {
        mimeType: 'application/pdf',
        shareTitle: `Espelho de Corretagem ${contract.contractNumber}`,
      });
      // Share cancelado (AbortError → 'cancelled') NÃO audita: nada saiu do aparelho.
      if (result !== 'cancelled') logDelivered();
    } catch {
      setError('Não foi possível compartilhar o espelho.');
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!fileRef.current) return;
    downloadFile(fileRef.current.blob, fileRef.current.fileName);
    logDelivered();
  }

  const ready = pdfUrl !== null;

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action ctr-doc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ctr-espelho-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-espelho-title" className="app-modal-title">
              Espelho de Corretagem
            </h3>
            <p className="app-modal-subtitle">
              Contrato {contract.contractNumber} · {side === 'seller' ? 'Vendedor' : 'Comprador'}
            </p>
          </div>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        <div className="app-modal-content ctr-doc-content">
          {loading ? (
            <p className="ctr-modal-loading">Gerando o espelho...</p>
          ) : ready ? (
            <>
              <iframe
                className="ctr-doc-frame"
                src={pdfUrl ?? undefined}
                title={`Espelho de Corretagem do contrato ${contract.contractNumber}`}
              />
              <p className="ctr-doc-hint">
                Se a prévia não aparecer no seu aparelho, use Exportar ou Baixar.
              </p>
            </>
          ) : !error ? (
            <p className="ctr-modal-loading">Espelho indisponível.</p>
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
