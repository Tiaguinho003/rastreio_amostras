'use client';

// Fluxo de ENVIO da amostra, extraido do detalhe (app/samples/[sampleId]/page.tsx)
// para ser reutilizado tambem pela LISTA (card de /samples). Autocontido: encapsula
// o seletor (Descricao/laudo + Fisico), os modais de export e de envio fisico
// (criar/editar), os seletores de safra (multi-safra) e o cancelamento.
//
// 3 entradas, controladas por props (uma por vez):
// - CREATE  (lista): `chooserOpen` → abre o seletor; precisa de status/harvest/
//   internalLotNumber/canDescricao.
// - EDIT    (timeline do detalhe): `editItem` → abre o modal fisico em modo edicao.
// - CANCEL  (timeline do detalhe): `cancelEventId` → abre a confirmacao de cancelamento.
// `onClose` encerra a sessao (o host limpa o gatilho); `onChanged` pede refetch.
// Todos os modais via createPortal(document.body) — a lista tem ancestral com
// transform (PageTransition), entao position:fixed precisa escapar pra o body.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  cancelPhysicalSampleSend,
  exportSamplePdf,
  getClient,
  recordPhysicalSampleSent,
  updatePhysicalSampleSend,
} from '../../lib/api-client';
import { getTodayDateInput } from '../../lib/classification-form';
import { shareOrDownloadFile } from '../../lib/share-blob';
import { useToast } from '../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientSummary, SampleStatus, SendHistoryItem, SessionData } from '../../lib/types';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ReportHarvestSelectModal } from './ReportHarvestSelectModal';
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

type PhysicalSendItem = Extract<SendHistoryItem, { kind: 'PHYSICAL' }>;

export type SampleSendFlowProps = {
  session: SessionData;
  sampleId: string;
  /** Encerra a sessao do fluxo — o host limpa o gatilho (chooserOpen/editItem/cancelEventId). */
  onClose: () => void;
  /** Pede refetch ao host apos qualquer mudanca (envio/laudo/cancelamento). */
  onChanged?: () => void;

  // CREATE (lista) — abre o seletor:
  chooserOpen?: boolean;
  status?: SampleStatus;
  harvest?: string | null;
  internalLotNumber?: string | null;
  canDescricao?: boolean;

  // EDIT (timeline do detalhe):
  editItem?: PhysicalSendItem | null;

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
  harvest,
  internalLotNumber,
  canDescricao,
  editItem,
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
  const [harvestChoiceOpen, setHarvestChoiceOpen] = useState(false);
  const [harvestOptions, setHarvestOptions] = useState<string[]>([]);

  // Envio fisico (criar/editar)
  const [physicalSendModalOpen, setPhysicalSendModalOpen] = useState(false);
  const [physicalSendClients, setPhysicalSendClients] = useState<ClientSummary[]>([]);
  const [physicalSendDate, setPhysicalSendDate] = useState('');
  const [physicalSending, setPhysicalSending] = useState(false);
  const [editingSendEventId, setEditingSendEventId] = useState<string | null>(null);
  const [physicalSendError, setPhysicalSendError] = useState<string | null>(null);
  const [physicalSendSuccess, setPhysicalSendSuccess] = useState(false);
  const [physicalSendHarvestOpen, setPhysicalSendHarvestOpen] = useState(false);
  const [physicalSendHarvestOptions, setPhysicalSendHarvestOptions] = useState<string[]>([]);

  // Cancelamento
  const [cancellingSend, setCancellingSend] = useState(false);
  const [cancelSendError, setCancelSendError] = useState<string | null>(null);

  const exportConfirmTrapRef = useFocusTrap(exportConfirmationOpen);
  const physicalSendTrapRef = useFocusTrap(physicalSendModalOpen);

  const canFisico = status ? PHYSICAL_SEND_ALLOWED_STATUSES.has(status) : false;

  // ENTRADA create: abre o seletor quando o host sinaliza.
  useEffect(() => {
    if (chooserOpen) setChooserVisible(true);
  }, [chooserOpen]);

  // ENTRADA edit: prefill (destinatario + data) e abre o modal fisico em edicao.
  useEffect(() => {
    if (!editItem) return;
    let cancelled = false;
    setEditingSendEventId(editItem.sendEventId);
    setPhysicalSendDate(editItem.sentDate);
    setPhysicalSendError(null);
    setPhysicalSendModalOpen(true);
    void (async () => {
      if (editItem.recipientClientId) {
        try {
          const response = await getClient(session, editItem.recipientClientId);
          if (!cancelled) setPhysicalSendClients([response.client]);
        } catch {
          if (!cancelled) setPhysicalSendClients([]);
        }
      } else {
        setPhysicalSendClients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editItem, session]);

  function resetInternal() {
    setChooserVisible(false);
    setExportConfirmationOpen(false);
    setExportPending(false);
    setExportPdfSuccess(false);
    setExportRecipientClients([]);
    setHarvestChoiceOpen(false);
    setHarvestOptions([]);
    setPhysicalSendModalOpen(false);
    setPhysicalSendClients([]);
    setPhysicalSendError(null);
    setEditingSendEventId(null);
    setPhysicalSendHarvestOpen(false);
    setPhysicalSendHarvestOptions([]);
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

  async function handleExportPdf(
    recipientClients: ClientSummary[],
    reportedHarvest?: string | null
  ) {
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
        reportedHarvest: reportedHarvest ?? null,
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
    const options = (harvest ?? '')
      .split(/\s*,\s*/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (options.length > 1) {
      setExportConfirmationOpen(false);
      setHarvestOptions(options);
      setHarvestChoiceOpen(true);
      return;
    }
    await handleExportPdf(exportRecipientClients);
  }

  async function handlePhysicalSend(reportedHarvest: string | null = null) {
    setPhysicalSending(true);
    setPhysicalSendError(null);
    const isEditing = Boolean(editingSendEventId);
    try {
      if (isEditing && editingSendEventId) {
        await updatePhysicalSampleSend(session, sampleId, editingSendEventId, {
          recipientClientId: physicalSendClients[0]?.id ?? null,
          sentDate: physicalSendDate,
        });
      } else {
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
              reportedHarvest,
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
      }
      onChanged?.();
      setPhysicalSendSuccess(true);
      window.setTimeout(() => {
        setPhysicalSendSuccess(false);
        dismiss();
      }, 900);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setPhysicalSendError(cause.message);
      } else {
        setPhysicalSendError(
          isEditing
            ? 'Falha ao atualizar envio. Tente novamente.'
            : 'Falha ao registrar envio. Tente novamente.'
        );
      }
    } finally {
      setPhysicalSending(false);
    }
  }

  // Multi-safra (nao-edicao): escolhe UMA safra pro laudo antes de disparar os POSTs.
  async function handleConfirmPhysicalSend() {
    if (physicalSending) return;
    if (!editingSendEventId) {
      const options = (harvest ?? '')
        .split(/\s*,\s*/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (options.length > 1) {
        setPhysicalSendModalOpen(false);
        setPhysicalSendHarvestOptions(options);
        setPhysicalSendHarvestOpen(true);
        return;
      }
    }
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
                setEditingSendEventId(null);
                setPhysicalSendClients([]);
                setPhysicalSendDate(getTodayDateInput());
                setPhysicalSendError(null);
                setPhysicalSendModalOpen(true);
              }}
            />,
            document.body
          )
        : null}

      {exportConfirmationOpen
        ? createPortal(
            <div
              className="app-modal-backdrop"
              onClick={() => {
                if (!exportingPdf) dismiss();
              }}
            >
              <section
                ref={exportConfirmTrapRef}
                className="app-modal is-themed is-action sample-detail-compact-modal sample-detail-lookup-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-confirm-title"
                onClick={(event) => event.stopPropagation()}
              >
                {exportPdfSuccess ? (
                  <div className="client-create-success-overlay" aria-live="polite">
                    <svg
                      className="client-create-success-check"
                      viewBox="0 0 52 52"
                      aria-hidden="true"
                    >
                      <circle
                        cx="26"
                        cy="26"
                        r="24"
                        fill="none"
                        stroke="#2f8a3e"
                        strokeWidth="2.5"
                      />
                      <path
                        fill="none"
                        stroke="#2f8a3e"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 27l7 7 15-15"
                      />
                    </svg>
                  </div>
                ) : null}
                <header className="app-modal-header is-centered-title">
                  <div className="sdv-send-head-left">
                    <button
                      type="button"
                      className="type-modal-back"
                      onClick={() => {
                        setExportConfirmationOpen(false);
                        setChooserVisible(true);
                      }}
                      disabled={exportingPdf}
                      aria-label="Voltar"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M15 18l-6-6 6-6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <div className="app-modal-title-wrap">
                      <h3 id="export-confirm-title" className="app-modal-title">
                        Gerar laudo
                      </h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={() => {
                      if (!exportingPdf) dismiss();
                    }}
                    disabled={exportingPdf}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>

                <form
                  className="app-modal-content"
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
                              setExportRecipientClients((prev) =>
                                prev.filter((c) => c.id !== client.id)
                              )
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
                          exportRecipientClients.length > 0
                            ? ''
                            : 'Busque por nome, documento ou código'
                        }
                      />
                    </div>
                  </div>

                  <div className="app-modal-actions">
                    <button
                      type="button"
                      className="app-modal-secondary"
                      onClick={() => {
                        if (!exportingPdf) dismiss();
                      }}
                      disabled={exportingPdf}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="app-modal-submit" disabled={exportingPdf}>
                      {exportingPdf ? 'Gerando...' : 'Gerar laudo'}
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        : null}

      <ReportHarvestSelectModal
        open={harvestChoiceOpen}
        harvests={harvestOptions}
        submitting={exportingPdf}
        onConfirm={(selected) => {
          if (exportPending) {
            void handleExportPdf(exportRecipientClients, selected);
          }
        }}
        onBack={() => {
          setHarvestChoiceOpen(false);
          setExportConfirmationOpen(true);
        }}
        onClose={() => {
          if (!exportingPdf) dismiss();
        }}
      />

      <ReportHarvestSelectModal
        open={physicalSendHarvestOpen}
        harvests={physicalSendHarvestOptions}
        submitting={physicalSending}
        onConfirm={(selected) => {
          setPhysicalSendHarvestOpen(false);
          void handlePhysicalSend(selected);
        }}
        onBack={() => {
          setPhysicalSendHarvestOpen(false);
          setPhysicalSendModalOpen(true);
        }}
        onClose={() => {
          if (!physicalSending) dismiss();
        }}
      />

      {physicalSendModalOpen
        ? createPortal(
            <div
              className="app-modal-backdrop"
              onClick={() => {
                if (!physicalSending) dismiss();
              }}
            >
              <section
                ref={physicalSendTrapRef}
                className="app-modal is-themed is-action sample-detail-compact-modal sample-detail-lookup-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="physical-send-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                {physicalSendSuccess ? (
                  <div className="client-create-success-overlay" aria-live="polite">
                    <svg
                      className="client-create-success-check"
                      viewBox="0 0 52 52"
                      aria-hidden="true"
                    >
                      <circle
                        cx="26"
                        cy="26"
                        r="24"
                        fill="none"
                        stroke="#2f8a3e"
                        strokeWidth="2.5"
                      />
                      <path
                        fill="none"
                        stroke="#2f8a3e"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 27l7 7 15-15"
                      />
                    </svg>
                  </div>
                ) : null}
                <header
                  className={`app-modal-header${editingSendEventId ? '' : ' is-centered-title'}`}
                >
                  <div className="sdv-send-head-left">
                    {!editingSendEventId ? (
                      <button
                        type="button"
                        className="type-modal-back"
                        onClick={() => {
                          setPhysicalSendModalOpen(false);
                          setPhysicalSendError(null);
                          setChooserVisible(true);
                        }}
                        disabled={physicalSending}
                        aria-label="Voltar"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M15 18l-6-6 6-6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                    <div className="app-modal-title-wrap">
                      <h3 id="physical-send-modal-title" className="app-modal-title">
                        {editingSendEventId ? 'Editar envio' : 'Enviar amostra'}
                      </h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={() => {
                      if (!physicalSending) dismiss();
                    }}
                    disabled={physicalSending}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>

                <form
                  className="app-modal-content"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (physicalSending) return;
                    void handleConfirmPhysicalSend();
                  }}
                >
                  {editingSendEventId ? (
                    <div className="app-modal-field">
                      <ClientLookupField
                        session={session}
                        label="Destinatário"
                        kind="any"
                        maxResults={10}
                        selectedClient={physicalSendClients[0] ?? null}
                        onSelectClient={(client) => setPhysicalSendClients(client ? [client] : [])}
                        disabled={physicalSending}
                        placeholder="Busque por nome, documento ou código"
                        compact
                      />
                    </div>
                  ) : (
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
                                setPhysicalSendClients((prev) =>
                                  prev.filter((c) => c.id !== client.id)
                                )
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
                            physicalSendClients.length > 0
                              ? ''
                              : 'Busque por nome, documento ou código'
                          }
                        />
                      </div>
                    </div>
                  )}
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

                  {physicalSendError ? (
                    <p className="sdv-modal-error">{physicalSendError}</p>
                  ) : null}

                  <div className="app-modal-actions">
                    <button
                      type="button"
                      className="app-modal-secondary"
                      onClick={() => {
                        if (!physicalSending) dismiss();
                      }}
                      disabled={physicalSending}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="app-modal-submit" disabled={physicalSending}>
                      {physicalSending
                        ? editingSendEventId
                          ? 'Salvando...'
                          : 'Enviando...'
                        : editingSendEventId
                          ? 'Salvar'
                          : 'Enviar'}
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        : null}

      {cancelEventId
        ? createPortal(
            <div className="app-modal-backdrop">
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
