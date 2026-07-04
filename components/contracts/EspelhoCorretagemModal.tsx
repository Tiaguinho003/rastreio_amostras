'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, downloadEspelhoPdf, getSaleContract } from '../../lib/api-client';
import { downloadFile, shareOrDownloadFile } from '../../lib/share-blob';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SaleContract, SaleContractDetail, SessionData } from '../../lib/types';

type EspelhoSide = 'seller' | 'buyer';

type EspelhoCorretagemModalProps = {
  session: SessionData;
  contract: SaleContract;
  onClose: () => void;
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function snapshotName(snap: Record<string, unknown> | null): string {
  if (!snap) return '—';
  const value = (snap.displayName ?? snap.legalName ?? snap.fullName) as string | undefined;
  return value && value.trim() ? value : '—';
}

function money(value: number | null): string {
  return value != null ? BRL.format(value) : '—';
}

// Espelho de Corretagem (Fase E): modal de CONFERÊNCIA só-leitura (D75). Toggle
// Vendedor | Comprador (D72) define o CLIENTE + o lado da comissão; mostra um
// resumo + a prévia do PDF (on-demand, regenerado por lado, D71) com Exportar /
// Baixar. Espelha o SaleContractDocumentModal. O contrato deve estar congelado
// (EMITIDO/FATURADO/PAGO) — a página só abre este modal p/ elegíveis.
export function EspelhoCorretagemModal({
  session,
  contract,
  onClose,
}: EspelhoCorretagemModalProps) {
  const focusTrapRef = useFocusTrap(true);
  // Re-busca o contrato FRESCO ao abrir: o resumo (Cliente/Comissão) usava o
  // objeto da lista (cache), que pode estar defasado (ex.: ágio aplicado por
  // outro ADMIN após a lista carregar) — divergindo do PDF, gerado no servidor.
  // Com a re-busca o resumo casa com o PDF; fallback = o prop `contract` (S74).
  const [detail, setDetail] = useState<SaleContractDetail | null>(null);
  const view: SaleContract = detail ?? contract;
  // O espelho é direcionado a quem paga corretagem: os lados disponíveis são os
  // que têm corretagem PREENCHIDA (> 0). Só vendedor → só "Vendedor"; só
  // comprador → só "Comprador"; ambos → os dois. Fallback (nenhum preenchido):
  // oferece os dois, p/ não travar o modal.
  const hasSeller = (view.sellerBrokeragePct ?? 0) > 0;
  const hasBuyer = (view.buyerBrokeragePct ?? 0) > 0;
  const availableSides: EspelhoSide[] =
    hasSeller && hasBuyer
      ? ['seller', 'buyer']
      : hasSeller
        ? ['seller']
        : hasBuyer
          ? ['buyer']
          : ['seller', 'buyer'];
  const [side, setSide] = useState<EspelhoSide>(() => availableSides[0] ?? 'seller');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<{ blob: Blob; fileName: string } | null>(null);

  const clientName = snapshotName(side === 'seller' ? view.sellerSnapshot : view.buyerSnapshot);
  const commission = side === 'seller' ? view.sellerBrokerageValue : view.buyerBrokerageValue;

  // Re-busca o contrato fresco ao abrir (mantém o resumo alinhado ao PDF, S74).
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const { contract: fresh } = await getSaleContract(session, contract.id);
        if (!aborted) setDetail(fresh);
      } catch {
        /* mantém o resumo do prop como fallback */
      }
    })();
    return () => {
      aborted = true;
    };
  }, [session, contract.id]);

  // Busca o PDF do lado atual; re-busca ao trocar de lado (regeneração on-demand).
  useEffect(() => {
    let aborted = false;
    let objectUrl: string | null = null;
    (async () => {
      setLoading(true);
      setError(null);
      setPdfUrl(null);
      fileRef.current = null;
      try {
        const { blob, fileName } = await downloadEspelhoPdf(session, contract.id, side);
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

  async function handleExport() {
    if (!fileRef.current || busy) return;
    setBusy(true);
    try {
      await shareOrDownloadFile(fileRef.current.blob, fileRef.current.fileName, {
        mimeType: 'application/pdf',
        shareTitle: `Espelho de Corretagem ${contract.contractNumber}`,
      });
    } catch {
      setError('Não foi possível compartilhar o espelho.');
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
        aria-labelledby="ctr-espelho-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-espelho-title" className="app-modal-title">
              Espelho de Corretagem
            </h3>
            <p className="app-modal-subtitle">Contrato {contract.contractNumber}</p>
          </div>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        <div className="app-modal-content ctr-doc-content">
          <div className="ctr-espelho-side" role="group" aria-label="Parte do espelho">
            {availableSides.map((s) => (
              <button
                key={s}
                type="button"
                className={`ctr-espelho-side-btn${side === s ? ' is-active' : ''}`}
                aria-pressed={side === s}
                onClick={() => setSide(s)}
              >
                {s === 'seller' ? 'Vendedor' : 'Comprador'}
              </button>
            ))}
          </div>

          <div className="ctr-espelho-summary">
            <span className="ctr-espelho-summary-row">
              <span className="ctr-espelho-summary-label">Cliente</span>
              <span className="ctr-espelho-summary-value">{clientName}</span>
            </span>
            <span className="ctr-espelho-summary-row">
              <span className="ctr-espelho-summary-label">Comissão</span>
              <span className="ctr-espelho-summary-value">{money(commission)}</span>
            </span>
          </div>

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
