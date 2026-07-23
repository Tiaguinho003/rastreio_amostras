'use client';

// Painel "Imprimir etiqueta" — extraido do SampleDetailView pra que a LISTA
// possa abri-lo SEM passar pelo drawer do lote. Antes o ⋯ da tabela mandava
// `?lote=<id>&acao=imprimir`: abria o detalhe inteiro e so entao o painel, o
// que era caro (um fetch de detalhe) e confuso (dois conteineres pra uma
// acao de um clique).
//
// Autocontido: recebe o SNAPSHOT do lote que o host ja tem em maos (a lista
// tem na linha, o detalhe tem no `detail.sample`), entao nao busca nada. O
// unico efeito colateral e o `requestQrPrint`; o refetch fica com o host,
// via `onPrinted`.

import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

import { ApiError, requestQrPrint } from '../../lib/api-client';
import { buildReadableValue, ownerDisplayValue } from '../../lib/sample-display';
import type { SessionData } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { SuccessCheckOverlay } from '../SuccessCheckOverlay';
import { HarvestDisplay } from './HarvestDisplay';

// Fila do print agent local (mesma constante que o detalhe usava).
const PRINTER_ID = 'printer-main';

export type SampleLabelPrintTarget = {
  id: string;
  internalLotNumber: string | null;
  isBlend?: boolean;
  blendOwnerPinned?: boolean;
  ownerClientId?: string | null;
  declared: {
    owner: string | null;
    sacks: number | null;
    harvest: string | null;
    originLot: string | null;
  };
};

export function SampleLabelPrintSheet({
  session,
  open,
  sample,
  stacked,
  onClose,
  onPrinted,
}: {
  session: SessionData;
  open: boolean;
  sample: SampleLabelPrintTarget | null;
  /** true quando abre de DENTRO de outro painel (⋯ do hero do drawer). */
  stacked?: boolean;
  onClose: () => void;
  onPrinted?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const successTimerRef = useRef<number | null>(null);

  // Estado zerado a cada abertura — o painel e reusado pra lotes diferentes.
  useEffect(() => {
    if (open) return;
    setSubmitting(false);
    setError(null);
    setSuccess(false);
  }, [open]);

  // Erro some sozinho depois de 5s (mesma regra dos demais paineis do lote).
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(
    () => () => {
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    },
    []
  );

  async function handleSubmit() {
    if (!sample || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestQrPrint(session, sample.id, { printerId: PRINTER_ID });
      onPrinted?.();
      setSuccess(true);
      successTimerRef.current = window.setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 900);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Falha ao enviar para a impressora. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  const qrValue = sample ? (sample.internalLotNumber ?? sample.id) : '';

  return (
    <BottomSheet
      open={open && Boolean(sample)}
      onClose={onClose}
      onDismissAttempt={() => !submitting && !success}
      ariaLabel="Imprimir etiqueta"
      stacked={stacked}
      closeVariant="edge-back"
      dragDisabled={submitting || success}
      className="fv-panel-sheet side-sheet is-fit-content sample-print-sheet"
      footer={
        success ? null : (
          <button
            type="button"
            className="app-modal-submit"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Enviando...' : 'Imprimir'}
          </button>
        )
      }
    >
      {sample ? (
        <>
          <p className="fv-panel-lead">Confira os dados antes de enviar para a impressora.</p>

          <article className="label-print-card new-sample-label-print-card">
            <div className="label-qr">
              <QRCodeCanvas value={qrValue} size={120} />
            </div>
            <div className="label-meta">
              <p>
                <strong>Lote interno:</strong> {sample.internalLotNumber ?? sample.id}
              </p>
              <p>
                <strong>Proprietario:</strong> {ownerDisplayValue(sample)}
              </p>
              <p>
                <strong>Sacas:</strong> {buildReadableValue(sample.declared.sacks)}
              </p>
              <p>
                <strong>Safra:</strong>{' '}
                <HarvestDisplay harvest={sample.declared.harvest} fallback="" />
              </p>
              <p>
                <strong>Lote origem:</strong> {buildReadableValue(sample.declared.originLot)}
              </p>
            </div>
          </article>

          {error ? <p className="sdv-modal-error">{error}</p> : null}

          <SuccessCheckOverlay show={success} />
        </>
      ) : null}
    </BottomSheet>
  );
}
