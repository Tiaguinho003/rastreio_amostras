'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, createWeeklyReport } from '../../lib/api-client';
import { useRegisterDirtyState } from '../../lib/dirty-state/DirtyStateProvider';
import { useOnlineStatus } from '../../lib/offline/use-online-status';
import { useToast } from '../../lib/toast/ToastProvider';
import type { SessionData } from '../../lib/types';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { computeClientWeekReference, formatWeekLabel } from '../../lib/weekly-report';

// Formulario de RELATORIO SEMANAL do comercial — renderizado no
// BottomSheet da pagina /informe (WeeklyReportFormSheet). A semana de
// referencia exibida e display-only (espelho client-side); o SERVIDOR
// recomputa a semana no envio e a UNIQUE garante 1 por semana — violacao
// chega como 409 e abre o modal central de aviso (regra bloqueante ->
// modal, conforme skill feedback-messages). SEM fila offline.

type FieldName = 'summary';
type FieldErrors = Partial<Record<FieldName, string>>;

interface WeeklyReportFormProps {
  session: SessionData;
  onDirtyChange?: (dirty: boolean) => void;
  /** Chamado apos envio bem-sucedido (o sheet fecha e a pagina refaz o feed). */
  onSubmitted?: () => void;
}

export function WeeklyReportForm({ session, onDirtyChange, onSubmitted }: WeeklyReportFormProps) {
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [summary, setSummary] = useState('');
  const [difficulties, setDifficulties] = useState('');
  const [nextWeekPlan, setNextWeekPlan] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // 409 do servidor: ja existe relatorio desta semana.
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const duplicateTrapRef = useFocusTrap(duplicateOpen);

  const formRef = useRef<HTMLFormElement | null>(null);

  // Semana de referencia exibida (recomputada no mount do sheet; o
  // servidor e a fonte de verdade no envio).
  const weekLabel = useMemo(() => {
    const { weekStart, weekEndDate } = computeClientWeekReference();
    return formatWeekLabel(weekStart, weekEndDate);
  }, []);

  const isDirty = summary !== '' || difficulties !== '' || nextWeekPlan !== '';

  useRegisterDirtyState('informe-weekly-report-form', isDirty, 'Relatório semanal não enviado');

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
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

      toast.success({ title: 'Relatório enviado' });
      onSubmitted?.();
    } catch (cause) {
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="inf-form" onSubmit={handleSubmit} noValidate ref={formRef}>
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
                Não é possível enviar formulários agora. Conecte-se à internet e tente novamente.
              </p>
            </div>
          </div>
        ) : null}

        {/* Semana de referencia — automatica, somente leitura. */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              1
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Semana de referência</h3>
              <p className="inf-card-sub">Definida automaticamente</p>
            </div>
          </header>

          <p className="informe-week-label">{weekLabel}</p>
        </section>

        {/* Resumo da semana */}
        <section className="inf-card" data-invalid={fieldErrors.summary ? 'true' : undefined}>
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              2
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">
                Resumo da semana<span className="nsv2-required-star"> *</span>
              </h3>
              <p className="inf-card-sub">O que foi feito nesta semana?</p>
            </div>
          </header>

          <textarea
            className={`inf-textarea${fieldErrors.summary ? ' has-error' : ''}`}
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
        </section>

        {/* Dificuldades */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              3
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Dificuldades</h3>
              <p className="inf-card-sub">Bloqueios ou problemas da semana (opcional)</p>
            </div>
          </header>

          <textarea
            className="inf-textarea"
            rows={3}
            value={difficulties}
            placeholder="Ex.: cliente adiou reunião, estrada interditada"
            maxLength={2000}
            onChange={(event) => setDifficulties(event.target.value)}
          />
        </section>

        {/* Plano da próxima semana */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              4
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Plano da próxima semana</h3>
              <p className="inf-card-sub">O que está planejado? (opcional)</p>
            </div>
          </header>

          <textarea
            className="inf-textarea"
            rows={3}
            value={nextWeekPlan}
            placeholder="Ex.: fechar proposta com 2 clientes, visitar região norte"
            maxLength={2000}
            onChange={(event) => setNextWeekPlan(event.target.value)}
          />
        </section>

        <button type="submit" className="inf-submit" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      {/* Aviso bloqueante do 409 — portal pro body (skill modals), empilha
          sobre o sheet (.is-stacked); o formulario permanece aberto atras. */}
      {duplicateOpen
        ? createPortal(
            <div className="app-modal-backdrop is-stacked" onClick={() => setDuplicateOpen(false)}>
              <section
                ref={duplicateTrapRef}
                className="app-modal is-themed app-confirm-modal is-stacked"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="weekly-duplicate-title"
                aria-describedby="weekly-duplicate-description"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="weekly-duplicate-title" className="app-modal-title">
                      Relatório já enviado
                    </h3>
                  </div>
                </header>

                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
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
