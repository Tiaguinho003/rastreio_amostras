'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, downloadEspelhoPdf, logEspelhoExport } from '../../lib/api-client';
import { espelhoSideLabel, type EspelhoSide } from '../../lib/espelho';
import { downloadFile, shareOrDownloadFile } from '../../lib/share-blob';
import { useToast } from '../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SaleContract, SessionData } from '../../lib/types';

type EspelhoCorretagemModalProps = {
  session: SessionData;
  contract: SaleContract;
  // Lado escolhido na fase de CONFERÊNCIA (EspelhoConferenciaModal, D134) — o
  // toggle vive lá; a prévia só herda.
  side: EspelhoSide;
  onClose: () => void;
  // RC-D103: modo GUARDADO. Com `logId` o modal re-renderiza um espelho que já foi
  // entregue (do snapshot congelado) em vez de gerar do contrato — e então não há o
  // que auditar de novo, nem versão a conferir.
  logId?: string;
  expiresAt?: string | null;
  stale?: boolean;
};

function dateBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('pt-BR');
}

// Espelho de Corretagem (Fase E): PRÉVIA do PDF com Exportar/Baixar. É a 2ª etapa do
// fluxo (D134): os campos já foram conferidos no EspelhoConferenciaModal, que define
// o lado. A prévia NÃO conta como auditoria — o registro vem do clique em Exportar/
// Baixar (D127). Elegíveis: EMITIDO/FINALIZADO/WASH_OUT (RC-D62 aposentou FATURADO/
// PAGO) — a página só abre este fluxo p/ elegíveis.
//
// RC-D103/D104: a entrega CONGELA o documento (o servidor grava o snapshot do que foi
// impresso), e o espelho guardado é imutável — corrigir é consertar o contrato e gerar
// de novo. Com `logId` este mesmo modal abre um guardado, e aí Baixar/Exportar não
// registram nada: é o mesmo documento.
export function EspelhoCorretagemModal({
  session,
  contract,
  side,
  onClose,
  logId,
  expiresAt,
  stale,
}: EspelhoCorretagemModalProps) {
  const focusTrapRef = useFocusTrap(true);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<{ blob: Blob; fileName: string } | null>(null);
  const stored = typeof logId === 'string' && logId.length > 0;

  // Busca o PDF: do snapshot guardado (logId) ou do contrato fresco (side).
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
        const { blob, fileName } = await downloadEspelhoPdf(
          session,
          contract.id,
          side,
          stored ? { logId } : { preview: true }
        );
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
  }, [session, contract.id, side, logId, stored]);

  // D127: audita ("Espelho exportado" no timeline) SÓ na ENTREGA concluída — não na
  // intenção.
  //
  // 🔴 RC-D107: deixou de ser fire-and-forget com toast incondicional. Isto AGORA
  // grava o documento (RC-D103), então um erro aqui significa que a entrega não ficou
  // registrada — e o operador precisa saber, porque o papel já saiu. O toast antigo
  // dizia "Espelho exportado" mesmo quando o servidor recusava com 409.
  async function logDelivered() {
    if (stored) return; // releitura do mesmo documento não registra de novo
    try {
      await logEspelhoExport(session, contract.id, side, contract.version);
      toast.success({ title: 'Espelho exportado' });
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : 'Não foi possível registrar o espelho.';
      // A entrega ACONTECEU — o arquivo saiu. O que falhou foi guardar.
      setError(`O espelho foi entregue, mas não foi possível registrá-lo. ${message}`);
    }
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
      if (result !== 'cancelled') await logDelivered();
    } catch {
      setError('Não foi possível compartilhar o espelho.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!fileRef.current || busy) return;
    setBusy(true);
    try {
      downloadFile(fileRef.current.blob, fileRef.current.fileName);
      await logDelivered();
    } finally {
      setBusy(false);
    }
  }

  const ready = pdfUrl !== null;
  const expiresLabel = dateBR(expiresAt);

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
              Contrato {contract.contractNumber} · {espelhoSideLabel(side)}
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
              {stale ? (
                <p className="ctr-doc-warning">
                  O contrato mudou depois deste espelho. Os valores aqui são os que foram entregues;
                  para um documento atualizado, gere um espelho novo.
                </p>
              ) : null}
              <p className="ctr-doc-hint">
                {stored
                  ? expiresLabel
                    ? `Espelho guardado. Disponível até ${expiresLabel}. Se a prévia não aparecer no seu aparelho, use Exportar ou Baixar.`
                    : 'Espelho guardado. Se a prévia não aparecer no seu aparelho, use Exportar ou Baixar.'
                  : 'Se a prévia não aparecer no seu aparelho, use Exportar ou Baixar.'}
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
          <button
            type="button"
            className="ctr-btn"
            onClick={() => void handleDownload()}
            disabled={!ready || busy}
          >
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
