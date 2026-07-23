'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { BottomSheet } from '../BottomSheet';
import { SuccessCheckOverlay, SUCCESS_CHECK_MS } from '../SuccessCheckOverlay';
import { ApiError, createWeeklyReport } from '../../lib/api-client';
import { useRegisterDirtyState } from '../../lib/dirty-state/DirtyStateProvider';
import { useOnlineStatus } from '../../lib/offline/use-online-status';
import { useToast } from '../../lib/toast/ToastProvider';
import type { SessionData } from '../../lib/types';
import { computeClientWeekReference, formatWeekLabel } from '../../lib/weekly-report';

// Painel lateral (side-sheet) do RELATORIO SEMANAL do comercial — opcao
// "Semanal" do FAB "leque" de /relatorios (InformeCreateFab).
// RD16 §2.10 R4: migrou do modal central `.is-informe` + kit `.inf-*` para o
// molde institucional `.fv-panel-sheet .side-sheet` + kit `.fv-form-*` (submit
// no footer, check terminal, descarte `.is-scrim-none`). O corpo (antigo
// WeeklyReportForm) foi absorvido aqui (o sheet e dono do submitting/success).
// A semana de referencia exibida e display-only; o SERVIDOR recomputa a semana
// no envio e a UNIQUE garante 1 por semana — 409 abre um aviso sobre o painel
// (.fv-panel-scrim). SEM fila offline.

const FORM_ID = 'weekly-report-form';

type FieldName = 'summary';
type FieldErrors = Partial<Record<FieldName, string>>;

interface WeeklyReportFormSheetProps {
  open: boolean;
  session: SessionData;
  onClose: () => void;
  /** Envio bem-sucedido — o sheet ja fechou quando isto dispara. */
  onSubmitted?: () => void;
}

export function WeeklyReportFormSheet({
  open,
  session,
  onClose,
  onSubmitted,
}: WeeklyReportFormSheetProps) {
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [summary, setSummary] = useState('');
  const [difficulties, setDifficulties] = useState('');
  const [nextWeekPlan, setNextWeekPlan] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  // 409 do servidor: ja existe relatorio desta semana.
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);

  // Semana de referencia exibida (recomputada no mount do sheet; o servidor e a
  // fonte de verdade no envio).
  const weekLabel = useMemo(() => {
    const { weekStart, weekEndDate } = computeClientWeekReference();
    return formatWeekLabel(weekStart, weekEndDate);
  }, []);

  const isDirty = summary !== '' || difficulties !== '' || nextWeekPlan !== '';

  useRegisterDirtyState(
    'informe-weekly-report-form',
    isDirty && !success,
    'Relatório semanal não enviado'
  );

  // Fecha modais aninhados quando o pai sinaliza fechamento (evita "flash"
  // pendurado durante o unmount atrasado do sheet).
  useEffect(() => {
    if (!open) {
      setConfirmDiscardOpen(false);
      setDuplicateOpen(false);
    }
  }, [open]);

  const handleDismissAttempt = useCallback(() => {
    if (submitting || success) {
      return false;
    }
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return false;
    }
    return true;
  }, [submitting, success, isDirty]);

  function handleDiscard() {
    setConfirmDiscardOpen(false);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || success) {
      return;
    }

    const errors: FieldErrors = {};
    if (!summary.trim()) {
      errors.summary = 'Obrigatório';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      window.setTimeout(() => {
        formRef.current
          ?.querySelector('[data-invalid="true"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
      return;
    }

    // Sem fila offline: sem internet, nao envia.
    if (!navigator.onLine) {
      toast.error({
        title: 'Sem conexão',
        description: 'Conecte-se à internet para enviar o relatório.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await createWeeklyReport(session, {
        summary: summary.trim(),
        difficulties: difficulties.trim() || null,
        nextWeekPlan: nextWeekPlan.trim() || null,
      });

      // Check terminal no lugar do toast (skill forms §7).
      setSubmitting(false);
      setSuccess(true);
      window.setTimeout(() => {
        onClose();
        onSubmitted?.();
      }, SUCCESS_CHECK_MS);
    } catch (cause) {
      setSubmitting(false);
      if (cause instanceof ApiError && cause.status === 409) {
        setDuplicateOpen(true);
        return;
      }
      if (cause instanceof ApiError && cause.status === 0) {
        toast.error({
          title: 'Sem conexão',
          description: 'Conecte-se à internet para enviar o relatório.',
        });
        return;
      }

      toast.error({
        title: 'Não foi possível enviar o relatório',
        description:
          cause instanceof ApiError ? cause.message : 'Verifique sua conexão e tente novamente.',
      });
    }
  }

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        onDismissAttempt={handleDismissAttempt}
        title={null}
        ariaLabel="Relatório semanal do comercial"
        closeVariant="edge-back"
        dragToDismiss
        dragDisabled={confirmDiscardOpen || duplicateOpen || success}
        className="fv-panel-sheet side-sheet weekly-report-sheet"
        footer={
          success ? null : (
            <button type="submit" form={FORM_ID} className="app-modal-submit" disabled={submitting}>
              {submitting ? 'Enviando...' : 'Enviar relatório'}
            </button>
          )
        }
      >
        <>
          <p className="fv-panel-lead">Registre o resumo da sua semana de trabalho.</p>

          <form
            id={FORM_ID}
            className="fv-form-body"
            onSubmit={handleSubmit}
            noValidate
            ref={formRef}
          >
            {!isOnline ? (
              <div className="inf-offline-banner" role="status">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2 9c5.5-5.3 14.5-5.3 20 0" />
                  <path d="M5.5 12.5c3.6-3.4 9.4-3.4 13 0" />
                  <path d="M9 16c1.7-1.6 4.3-1.6 6 0" />
                  <path d="M12 19.4h.01" />
                  <path d="M4 4l16 16" />
                </svg>
                <div className="inf-offline-banner-text">
                  <p className="inf-offline-banner-title">Sem conexão</p>
                  <p className="inf-offline-banner-sub">
                    Não é possível enviar formulários agora. Conecte-se à internet e tente
                    novamente.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Semana de referencia — automatica, somente leitura. */}
            <span className="fv-form-heading">Semana de referência</span>
            <p className="informe-week-label">{weekLabel}</p>

            {/* Resumo da semana (obrigatorio) */}
            <label
              className={`fv-form-field${fieldErrors.summary ? ' is-field-error' : ''}`}
              data-invalid={fieldErrors.summary ? 'true' : undefined}
            >
              <span className="fv-form-label">
                Resumo da semana<span className="fv-form-required"> *</span>
              </span>
              <textarea
                className={fieldErrors.summary ? 'fv-form-input-error' : undefined}
                rows={4}
                value={summary}
                placeholder={fieldErrors.summary ?? 'Descreva as atividades da semana'}
                aria-invalid={Boolean(fieldErrors.summary)}
                maxLength={2000}
                onChange={(event) => {
                  setSummary(event.target.value);
                  if (fieldErrors.summary) {
                    setFieldErrors({});
                  }
                }}
              />
            </label>

            {/* Dificuldades (opcional) */}
            <label className="fv-form-field">
              <span className="fv-form-label">Dificuldades</span>
              <textarea
                rows={3}
                value={difficulties}
                placeholder="Ex.: cliente adiou reunião, estrada interditada"
                maxLength={2000}
                onChange={(event) => setDifficulties(event.target.value)}
              />
            </label>

            {/* Plano da próxima semana (opcional) */}
            <label className="fv-form-field">
              <span className="fv-form-label">Plano da próxima semana</span>
              <textarea
                rows={3}
                value={nextWeekPlan}
                placeholder="Ex.: fechar proposta com 2 clientes, visitar região norte"
                maxLength={2000}
                onChange={(event) => setNextWeekPlan(event.target.value)}
              />
            </label>
          </form>

          {/* Check terminal — filho DIRETO do conteudo do sheet. */}
          <SuccessCheckOverlay show={success} />
        </>
      </BottomSheet>

      {/* Descartar rascunho: confirm central `.is-scrim-none` + `.is-compact`
          (fundo nao escurece), molde do NewSampleModal (skill forms §8). */}
      {confirmDiscardOpen
        ? createPortal(
            <div
              className="app-modal-backdrop is-scrim-none"
              onClick={() => setConfirmDiscardOpen(false)}
            >
              <section
                className="app-modal is-themed app-confirm-modal is-compact"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="discard-weekly-report-title"
                aria-describedby="discard-weekly-report-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <h3 id="discard-weekly-report-title" className="app-confirm-modal-title">
                    Descartar relatório?
                  </h3>
                  <p id="discard-weekly-report-description" className="app-confirm-modal-message">
                    Os dados preenchidos serão perdidos. Esta ação não pode ser desfeita.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setConfirmDiscardOpen(false)}
                    autoFocus
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={handleDiscard}
                  >
                    Descartar
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {/* Aviso bloqueante do 409 — aviso SOBRE o painel (`.fv-panel-scrim`): no
          desktop cobre so a faixa direita do painel; o formulario permanece
          atras (skill containers §1). */}
      {duplicateOpen
        ? createPortal(
            <div
              className="app-modal-backdrop fv-panel-scrim"
              onClick={() => setDuplicateOpen(false)}
            >
              <section
                className="app-modal is-themed app-confirm-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="weekly-duplicate-title"
                aria-describedby="weekly-duplicate-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <h3 id="weekly-duplicate-title" className="app-confirm-modal-title">
                    Relatório já enviado
                  </h3>
                  <p id="weekly-duplicate-description" className="app-confirm-modal-message">
                    Você já enviou o relatório desta semana. Para substituí-lo, exclua o envio atual
                    na lista e envie novamente.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-submit"
                    onClick={() => setDuplicateOpen(false)}
                    autoFocus
                  >
                    Entendi
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
