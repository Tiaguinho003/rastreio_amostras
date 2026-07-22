'use client';

// Fluxo de ENVIO da amostra, extraido do detalhe (app/samples/[sampleId]/page.tsx)
// para ser reutilizado tambem pela LISTA (card de /samples). Autocontido:
// encapsula o painel de envio (tipo + destinatarios) e o cancelamento.
//
// 2 entradas, controladas por props (uma por vez):
// - CREATE  (lista/hero): `chooserOpen` → abre o painel; precisa de status/
//   internalLotNumber/canDescricao.
// - CANCEL  (timeline do detalhe): `cancelEventId` → abre a confirmacao de cancelamento.
// `onClose` encerra a sessao (o host limpa o gatilho); `onChanged` pede refetch.
// A EDICAO de um envio existente NAO passa por aqui: virou dropdown inline no
// card da timeline (SampleMovementsPanel), por ser pequena demais pra um painel.
//
// UMA ETAPA (rodada pos-F3): antes o fluxo era modal central ("Descricao" ou
// "Fisico") → painel lateral pedindo o destinatario. Dois conteineres e duas
// decisoes pra uma acao que o operador ja tem inteira na cabeca quando clica
// em "Enviar". Agora o tipo e um campo do proprio painel, e destinatarios
// valem pros dois tipos — trocar de tipo nao perde o que ja foi escolhido.
// A confirmacao de cancelamento continua central, com `.fv-panel-scrim`,
// via createPortal(document.body): a lista tem ancestral com transform
// (PageTransition) e position:fixed precisa escapar pra o body.

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

// Mesmo conjunto do backend (src/samples/sample-command-service.js): so amostras
// confirmadas ou classificadas podem ter envio fisico registrado.
const PHYSICAL_SEND_ALLOWED_STATUSES = new Set<SampleStatus>([
  'REGISTRATION_CONFIRMED',
  'CLASSIFIED',
]);

type SendMethod = 'descricao' | 'fisico';

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

  // CREATE (lista) — abre o painel:
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

  const [sendPanelOpen, setSendPanelOpen] = useState(false);
  const [method, setMethod] = useState<SendMethod>('descricao');
  const [recipients, setRecipients] = useState<ClientSummary[]>([]);
  const [sentDate, setSentDate] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Cancelamento
  const [cancellingSend, setCancellingSend] = useState(false);
  const [cancelSendError, setCancelSendError] = useState<string | null>(null);

  const canFisico = status ? PHYSICAL_SEND_ALLOWED_STATUSES.has(status) : false;
  const descricaoAllowed = Boolean(canDescricao);

  // ENTRADA create: abre o painel ja com o tipo pre-escolhido. "Descricao" e o
  // primeiro da lista e o caminho mais comum num lote classificado; se ele nao
  // estiver liberado, cai no fisico (o ⋯ so oferece "Enviar amostra" quando ao
  // menos um dos dois vale).
  useEffect(() => {
    if (!chooserOpen) return;
    setMethod(descricaoAllowed ? 'descricao' : 'fisico');
    setRecipients([]);
    setSentDate(getTodayDateInput());
    setSendError(null);
    setSendSuccess(false);
    setSendPanelOpen(true);
    // O gatilho e o `chooserOpen`; os gates entram como valor inicial, nao como
    // dependencia (mudar de status com o painel aberto nao reabre nada).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chooserOpen]);

  // Encerra a sessao do fluxo (fecha tudo + avisa o host).
  function dismiss() {
    setSendPanelOpen(false);
    setSending(false);
    setSendError(null);
    setRecipients([]);
    onClose();
  }

  function selectMethod(next: SendMethod) {
    if (sending || sendSuccess) return;
    setMethod(next);
    // O erro pertence a tentativa anterior — trocar de tipo e comecar de novo.
    setSendError(null);
  }

  async function handleExportPdf() {
    if (status !== 'CLASSIFIED') {
      setSendError('A exportação de laudo só é permitida para amostras classificadas.');
      return;
    }
    const destination =
      recipients
        .map((c) => c.displayName ?? '')
        .filter(Boolean)
        .join(', ') || null;
    const exported = await exportSamplePdf(session, sampleId, {
      destination,
      recipientClientId: recipients[0]?.id ?? null,
    });
    const lot = internalLotNumber?.trim();
    const result = await shareOrDownloadFile(exported.blob, exported.fileName, {
      mimeType: 'application/pdf',
      shareTitle: lot ? `Laudo Técnico (${lot})` : 'Laudo Técnico',
    });
    onChanged?.();
    // Compartilhamento abortado pelo usuario: o PDF ja foi gerado, entao o
    // painel fecha sem o check de sucesso.
    if (result === 'cancelled') {
      dismiss();
      return;
    }
    setSendSuccess(true);
    window.setTimeout(() => {
      setSendSuccess(false);
      dismiss();
    }, 900);
  }

  async function handlePhysicalSend() {
    // Multi-destinatario: N destinatarios -> N registros. Falha parcial mantem
    // nos chips so os que faltaram (retry nao duplica os que ja foram).
    const targets: (ClientSummary | null)[] = recipients.length > 0 ? recipients : [null];
    const failed: ClientSummary[] = [];
    let firstError: unknown = null;
    for (const client of targets) {
      try {
        await recordPhysicalSampleSent(session, sampleId, {
          recipientClientId: client?.id ?? null,
          sentDate,
        });
      } catch (cause) {
        if (client) failed.push(client);
        if (!firstError) firstError = cause;
      }
    }
    if (failed.length > 0 || firstError) {
      onChanged?.();
      setRecipients(failed);
      const names = failed.map((c) => c.displayName ?? 'sem nome').join(', ');
      const base = firstError instanceof ApiError ? firstError.message : 'Tente novamente.';
      setSendError(
        names ? `Falha ao enviar para: ${names}. ${base}` : `Falha ao registrar envio. ${base}`
      );
      return;
    }
    onChanged?.();
    setSendSuccess(true);
    window.setTimeout(() => {
      setSendSuccess(false);
      dismiss();
    }, 900);
  }

  async function handleSubmitSend() {
    if (sending) return;
    setSending(true);
    setSendError(null);
    try {
      if (method === 'descricao') {
        await handleExportPdf();
      } else {
        await handlePhysicalSend();
      }
    } catch (cause) {
      setSendError(
        cause instanceof ApiError
          ? cause.message
          : method === 'descricao'
            ? 'Falha ao gerar o laudo. Tente novamente.'
            : 'Falha ao registrar envio. Tente novamente.'
      );
    } finally {
      setSending(false);
    }
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

  const methodOptions: {
    value: SendMethod;
    label: string;
    hint: string;
    disabledHint: string;
    allowed: boolean;
  }[] = [
    {
      value: 'descricao',
      label: 'Descrição',
      hint: 'Gera o laudo em PDF para compartilhar.',
      disabledHint: 'Exige o lote classificado com foto.',
      allowed: descricaoAllowed,
    },
    {
      value: 'fisico',
      label: 'Físico',
      hint: 'Registra a saída da amostra na timeline.',
      disabledHint: 'Exige o cadastro confirmado.',
      allowed: canFisico,
    },
  ];

  const submitLabel =
    method === 'descricao'
      ? sending
        ? 'Gerando...'
        : 'Gerar laudo'
      : sending
        ? 'Enviando...'
        : 'Enviar';

  return (
    <>
      <BottomSheet
        open={sendPanelOpen}
        onClose={dismiss}
        onDismissAttempt={() => !sending && !sendSuccess}
        ariaLabel="Enviar amostra"
        stacked
        closeVariant="edge-back"
        dragDisabled={sending || sendSuccess}
        className="fv-panel-sheet side-sheet sample-send-sheet"
        footer={
          sendSuccess ? null : (
            <button
              type="submit"
              form="sample-send-form"
              className="app-modal-submit"
              disabled={sending}
            >
              {submitLabel}
            </button>
          )
        }
      >
        <>
          <p className="fv-panel-lead">Escolha como a amostra sai e para quem.</p>

          <form
            id="sample-send-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitSend();
            }}
          >
            <div className="app-modal-field">
              <span className="app-modal-label">Tipo de envio</span>
              <div className="fv-choice-group" role="radiogroup" aria-label="Tipo de envio">
                {methodOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={method === option.value}
                    className={`fv-choice${method === option.value ? ' is-selected' : ''}`}
                    disabled={!option.allowed || sending}
                    onClick={() => selectMethod(option.value)}
                  >
                    <span className="fv-choice-label">{option.label}</span>
                    <span className="fv-choice-hint">
                      {option.allowed ? option.hint : option.disabledHint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="app-modal-field">
              <span className="app-modal-label">Destinatários</span>
              <div className="samples-filter-multi samples-filter-multi--lookup send-recipient-multi">
                {recipients.map((client) => (
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
                      disabled={sending}
                      onClick={() =>
                        setRecipients((prev) => prev.filter((c) => c.id !== client.id))
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
                    setRecipients((prev) =>
                      prev.some((c) => c.id === client.id) ? prev : [...prev, client]
                    );
                  }}
                  disabled={sending}
                  placeholder={recipients.length > 0 ? '' : 'Busque por nome, documento ou código'}
                />
              </div>
            </div>

            {/* A data so existe no envio fisico — o laudo nao registra saida. */}
            {method === 'fisico' ? (
              <label className="app-modal-field">
                <span className="app-modal-label">Data de envio</span>
                <input
                  type="date"
                  className="app-modal-input"
                  value={sentDate}
                  onChange={(event) => setSentDate(event.target.value)}
                  disabled={sending}
                />
              </label>
            ) : null}

            {sendError ? <p className="sdv-modal-error">{sendError}</p> : null}
          </form>

          <SuccessCheckOverlay show={sendSuccess} />
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
