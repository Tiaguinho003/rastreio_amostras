'use client';

// Fluxo de ENVIO da amostra, extraido do detalhe (app/samples/[sampleId]/page.tsx)
// para ser reutilizado tambem pela LISTA (card de /samples). Autocontido: encapsula
// o seletor (Descricao/laudo + Fisico), os modais de export e de envio fisico
// (criar/editar) e o cancelamento.
//
// 2 entradas, controladas por props (uma por vez):
// - CREATE  (lista): `chooserOpen` → abre o seletor; precisa de status/
//   internalLotNumber/canDescricao.
// - CANCEL  (timeline do detalhe): `cancelEventId` → abre a confirmacao de cancelamento.
// `onClose` encerra a sessao (o host limpa o gatilho); `onChanged` pede refetch.
// A EDICAO de um envio existente NAO passa por aqui: virou dropdown inline no
// card da timeline (SampleMovementsPanel), por ser pequena demais pra um painel.
//
// F3 do redesign FV: os dois FORMS (gerar laudo, envio fisico) viraram PAINEIS
// LATERAIS no molde da rodada 5 (side-sheet stacked + seta ← + submit no footer
// sticky). O seletor de metodo continua central (picker, RD11) e a confirmacao
// de cancelamento tambem — esta com `.fv-panel-scrim`, centrada na faixa do
// painel. O que sobrou de central vai via createPortal(document.body) porque a
// lista tem ancestral com transform (PageTransition), e position:fixed precisa
// escapar pra o body.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { BottomSheet } from '../BottomSheet';
import { SuccessCheckOverlay } from '../SuccessCheckOverlay';

import {
  ApiError,
  cancelPhysicalSampleSend,
  exportSamplePdf,
  recordPhysicalSampleSent,
} from '../../lib/api-client';
import { getTodayDateInput } from '../../lib/classification-form';
import { shareOrDownloadFile } from '../../lib/share-blob';
import { useToast } from '../../lib/toast/ToastProvider';
import type { ClientSummary, SampleStatus, SessionData } from '../../lib/types';
import { ClientLookupField } from '../clients/ClientLookupField';
import { SendMethodChooserModal } from './SendMethodChooserModal';

// Mesmo conjunto do backend (src/samples/sample-command-service.js): so amostras
// confirmadas ou classificadas podem ter envio fisico registrado.
const PHYSICAL_SEND_ALLOWED_STATUSES = new Set<SampleStatus>([
  'REGISTRATION_CONFIRMED',
  'CLASSIFIED',
]);

// Rotulo curto do cliente nos chips (10 chars + reticencias); nome completo no title.
function truncateChipLabel(name: string, max = 10): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

export type SampleSendFlowProps = {
  session: SessionData;
  sampleId: string;
  /** Encerra a sessao do fluxo — o host limpa o gatilho (chooserOpen/cancelEventId). */
  onClose: () => void;
  /** Pede refetch ao host apos qualquer mudanca (envio/laudo/cancelamento). */
  onChanged?: () => void;

  // CREATE (lista) — abre o seletor:
  chooserOpen?: boolean;
  status?: SampleStatus;
  internalLotNumber?: string | null;
  canDescricao?: boolean;

  // CANCEL (timeline do detalhe):
  cancelEventId?: string | null;
};

export function SampleSendFlow({
  session,
  sampleId,
  onClose,
  onChanged,
  chooserOpen,
  status,
  internalLotNumber,
  canDescricao,
  cancelEventId,
}: SampleSendFlowProps) {
  const toast = useToast();

  const [chooserVisible, setChooserVisible] = useState(Boolean(chooserOpen));

  // Laudo ("Descricao")
  const [exportConfirmationOpen, setExportConfirmationOpen] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [exportPdfSuccess, setExportPdfSuccess] = useState(false);
  const [exportRecipientClients, setExportRecipientClients] = useState<ClientSummary[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Envio fisico (criar)
  const [physicalSendModalOpen, setPhysicalSendModalOpen] = useState(false);
  const [physicalSendClients, setPhysicalSendClients] = useState<ClientSummary[]>([]);
  const [physicalSendDate, setPhysicalSendDate] = useState('');
  const [physicalSending, setPhysicalSending] = useState(false);
  const [physicalSendError, setPhysicalSendError] = useState<string | null>(null);
  const [physicalSendSuccess, setPhysicalSendSuccess] = useState(false);

  // Cancelamento
  const [cancellingSend, setCancellingSend] = useState(false);
  const [cancelSendError, setCancelSendError] = useState<string | null>(null);

  const canFisico = status ? PHYSICAL_SEND_ALLOWED_STATUSES.has(status) : false;

  // ENTRADA create: abre o seletor quando o host sinaliza.
  useEffect(() => {
    if (chooserOpen) setChooserVisible(true);
  }, [chooserOpen]);

  function resetInternal() {
    setChooserVisible(false);
    setExportConfirmationOpen(false);
    setExportPending(false);
    setExportPdfSuccess(false);
    setExportRecipientClients([]);
    setPhysicalSendModalOpen(false);
    setPhysicalSendClients([]);
    setPhysicalSendError(null);
  }

  // Encerra a sessao do fluxo (fecha tudo + avisa o host).
  function dismiss() {
    resetInternal();
    onClose();
  }

  function handleOpenExportConfirmation() {
    if (status !== 'CLASSIFIED') {
      toast.error({ title: 'A exportação de laudo só é permitida para amostras classificadas.' });
      return;
    }
    setExportPdfSuccess(false);
    setExportPending(true);
    setExportRecipientClients([]);
    setExportConfirmationOpen(true);
  }

  async function handleExportPdf(recipientClients: ClientSummary[]) {
    if (status !== 'CLASSIFIED') {
      toast.error({ title: 'A exportação de laudo só é permitida para amostras classificadas.' });
      return;
    }
    setExportingPdf(true);
    try {
      const destination =
        recipientClients
          .map((c) => c.displayName ?? '')
          .filter(Boolean)
          .join(', ') || null;
      const exported = await exportSamplePdf(session, sampleId, {
        destination,
        recipientClientId: recipientClients[0]?.id ?? null,
      });
      const lot = internalLotNumber?.trim();
      const result = await shareOrDownloadFile(exported.blob, exported.fileName, {
        mimeType: 'application/pdf',
        shareTitle: lot ? `Laudo Técnico (${lot})` : 'Laudo Técnico',
      });
      onChanged?.();
      if (result === 'cancelled') {
        dismiss();
      } else {
        setExportPdfSuccess(true);
        window.setTimeout(() => {
          setExportPdfSuccess(false);
          dismiss();
        }, 900);
      }
    } catch (cause) {
      toast.error({
        title: cause instanceof ApiError ? cause.message : 'Falha ao exportar laudo PDF',
      });
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleConfirmExportFromModal() {
    if (!exportPending) return;
    await handleExportPdf(exportRecipientClients);
  }

  async function handlePhysicalSend() {
    setPhysicalSending(true);
    setPhysicalSendError(null);
    try {
      // Multi-destinatario: N destinatarios -> N registros. Falha parcial mantem
      // nos chips so os que faltaram (retry nao duplica os que ja foram).
      const recipients: (ClientSummary | null)[] =
        physicalSendClients.length > 0 ? physicalSendClients : [null];
      const failed: ClientSummary[] = [];
      let firstError: unknown = null;
      for (const client of recipients) {
        try {
          await recordPhysicalSampleSent(session, sampleId, {
            recipientClientId: client?.id ?? null,
            sentDate: physicalSendDate,
          });
        } catch (cause) {
          if (client) failed.push(client);
          if (!firstError) firstError = cause;
        }
      }
      if (failed.length > 0 || firstError) {
        onChanged?.();
        setPhysicalSendClients(failed);
        const names = failed.map((c) => c.displayName ?? 'sem nome').join(', ');
        const base = firstError instanceof ApiError ? firstError.message : 'Tente novamente.';
        setPhysicalSendError(
          names ? `Falha ao enviar para: ${names}. ${base}` : `Falha ao registrar envio. ${base}`
        );
        return;
      }
      onChanged?.();
      setPhysicalSendSuccess(true);
      window.setTimeout(() => {
        setPhysicalSendSuccess(false);
        dismiss();
      }, 900);
    } catch (cause) {
      setPhysicalSendError(
        cause instanceof ApiError ? cause.message : 'Falha ao registrar envio. Tente novamente.'
      );
    } finally {
      setPhysicalSending(false);
    }
  }

  async function handleConfirmPhysicalSend() {
    if (physicalSending) return;
    await handlePhysicalSend();
  }

  async function handleConfirmCancelSend() {
    if (!cancelEventId) return;
    setCancellingSend(true);
    setCancelSendError(null);
    try {
      await cancelPhysicalSampleSend(session, sampleId, cancelEventId);
      onChanged?.();
      toast.success({ title: 'Envio cancelado com sucesso.' });
      setCancellingSend(false);
      onClose();
    } catch (cause) {
      setCancelSendError(
        cause instanceof ApiError ? cause.message : 'Falha ao cancelar envio. Tente novamente.'
      );
      setCancellingSend(false);
    }
  }

  return (
    <>
      {chooserVisible
        ? createPortal(
            <SendMethodChooserModal
              open
              canDescricao={Boolean(canDescricao)}
              canFisico={canFisico}
              onClose={dismiss}
              onChooseDescricao={() => {
                setChooserVisible(false);
                handleOpenExportConfirmation();
              }}
              onChooseFisico={() => {
                setChooserVisible(false);
                setPhysicalSendClients([]);
                setPhysicalSendDate(getTodayDateInput());
                setPhysicalSendError(null);
                setPhysicalSendModalOpen(true);
              }}
            />,
            document.body
          )
        : null}

      <BottomSheet
        open={exportConfirmationOpen}
        // A seta ← volta pro seletor de metodo (era o botao "Voltar" proprio);
        // o fluxo tem duas etapas e desistir do laudo nao e desistir do envio.
        onClose={() => {
          setExportConfirmationOpen(false);
          setChooserVisible(true);
        }}
        onDismissAttempt={() => !exportingPdf && !exportPdfSuccess}
        title="Gerar laudo"
        ariaLabel="Gerar laudo"
        stacked
        closeVariant="edge-back"
        dragDisabled={exportingPdf || exportPdfSuccess}
        className="fv-panel-sheet side-sheet sample-send-sheet"
        footer={
          exportPdfSuccess ? null : (
            <button
              type="submit"
              form="sample-export-form"
              className="app-modal-submit"
              disabled={exportingPdf}
            >
              {exportingPdf ? 'Gerando...' : 'Gerar laudo'}
            </button>
          )
        }
      >
        <>
          <form
            id="sample-export-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (exportingPdf) return;
              void handleConfirmExportFromModal();
            }}
          >
            <div className="app-modal-field">
              <span className="app-modal-label">Selecione os destinatários</span>
              <div className="samples-filter-multi samples-filter-multi--lookup export-recipient-multi">
                {exportRecipientClients.map((client) => (
                  <span key={client.id} className="samples-filter-token">
                    <span
                      className="samples-filter-token-label"
                      title={client.displayName ?? 'Sem nome'}
                    >
                      {truncateChipLabel(client.displayName ?? 'Sem nome')}
                    </span>
                    <button
                      type="button"
                      className="samples-filter-token-remove"
                      aria-label={`Remover destinatário: ${client.displayName ?? ''}`}
                      disabled={exportingPdf}
                      onClick={() =>
                        setExportRecipientClients((prev) => prev.filter((c) => c.id !== client.id))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                <ClientLookupField
                  session={session}
                  label="Destinatários"
                  kind="any"
                  compact
                  clearOnSelect
                  maxResults={10}
                  selectedClient={null}
                  onSelectClient={(client) => {
                    if (!client) return;
                    setExportRecipientClients((prev) =>
                      prev.some((c) => c.id === client.id) ? prev : [...prev, client]
                    );
                  }}
                  disabled={exportingPdf}
                  placeholder={
                    exportRecipientClients.length > 0 ? '' : 'Busque por nome, documento ou código'
                  }
                />
              </div>
            </div>
          </form>

          <SuccessCheckOverlay show={exportPdfSuccess} />
        </>
      </BottomSheet>

      <BottomSheet
        open={physicalSendModalOpen}
        // A seta ← volta pro seletor de metodo (o fluxo tem duas etapas).
        onClose={() => {
          setPhysicalSendModalOpen(false);
          setPhysicalSendError(null);
          setChooserVisible(true);
        }}
        onDismissAttempt={() => !physicalSending && !physicalSendSuccess}
        title="Enviar amostra"
        ariaLabel="Enviar amostra"
        stacked
        closeVariant="edge-back"
        dragDisabled={physicalSending || physicalSendSuccess}
        className="fv-panel-sheet side-sheet sample-send-sheet"
        footer={
          physicalSendSuccess ? null : (
            <button
              type="submit"
              form="sample-physical-send-form"
              className="app-modal-submit"
              disabled={physicalSending}
            >
              {physicalSending ? 'Enviando...' : 'Enviar'}
            </button>
          )
        }
      >
        <>
          <form
            id="sample-physical-send-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (physicalSending) return;
              void handleConfirmPhysicalSend();
            }}
          >
            <div className="app-modal-field">
              <span className="app-modal-label">Destinatários</span>
              <div className="samples-filter-multi samples-filter-multi--lookup send-recipient-multi">
                {physicalSendClients.map((client) => (
                  <span key={client.id} className="samples-filter-token">
                    <span
                      className="samples-filter-token-label"
                      title={client.displayName ?? 'Sem nome'}
                    >
                      {truncateChipLabel(client.displayName ?? 'Sem nome')}
                    </span>
                    <button
                      type="button"
                      className="samples-filter-token-remove"
                      aria-label={`Remover destinatário: ${client.displayName ?? ''}`}
                      disabled={physicalSending}
                      onClick={() =>
                        setPhysicalSendClients((prev) => prev.filter((c) => c.id !== client.id))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                <ClientLookupField
                  session={session}
                  label="Destinatários"
                  kind="any"
                  compact
                  clearOnSelect
                  maxResults={10}
                  selectedClient={null}
                  onSelectClient={(client) => {
                    if (!client) return;
                    setPhysicalSendClients((prev) =>
                      prev.some((c) => c.id === client.id) ? prev : [...prev, client]
                    );
                  }}
                  disabled={physicalSending}
                  placeholder={
                    physicalSendClients.length > 0 ? '' : 'Busque por nome, documento ou código'
                  }
                />
              </div>
            </div>
            <label className="app-modal-field">
              <span className="app-modal-label">Data de envio</span>
              <input
                type="date"
                className="app-modal-input"
                value={physicalSendDate}
                onChange={(event) => setPhysicalSendDate(event.target.value)}
                disabled={physicalSending}
              />
            </label>

            {physicalSendError ? <p className="sdv-modal-error">{physicalSendError}</p> : null}
          </form>

          <SuccessCheckOverlay show={physicalSendSuccess} />
        </>
      </BottomSheet>

      {cancelEventId
        ? createPortal(
            <div className="app-modal-backdrop fv-panel-scrim">
              <section
                className="app-modal is-themed is-action sample-detail-compact-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cancel-send-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="cancel-send-modal-title" className="app-modal-title">
                      Cancelar envio
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={() => {
                      if (!cancellingSend) {
                        setCancelSendError(null);
                        onClose();
                      }
                    }}
                    disabled={cancellingSend}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>
                <div className="app-modal-content">
                  <p className="sdv-confirm-text">
                    Tem certeza que deseja cancelar este envio? Essa acao nao pode ser desfeita.
                  </p>
                  {cancelSendError ? (
                    <div className="sdv-modal-error" role="alert">
                      {cancelSendError}
                    </div>
                  ) : null}
                  <div className="app-modal-actions">
                    <button
                      type="button"
                      className="app-modal-secondary"
                      onClick={() => {
                        if (!cancellingSend) {
                          setCancelSendError(null);
                          onClose();
                        }
                      }}
                      disabled={cancellingSend}
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      className="app-modal-submit is-danger"
                      onClick={handleConfirmCancelSend}
                      disabled={cancellingSend}
                    >
                      {cancellingSend ? 'Cancelando...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
