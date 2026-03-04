'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

import { AppShell } from '../../../components/AppShell';
import { createSampleAndPreparePrint, ApiError } from '../../../lib/api-client';
import { createSampleDraftSchema } from '../../../lib/form-schemas';
import type { CreateSampleAndPreparePrintResponse } from '../../../lib/types';
import { useRequireAuth } from '../../../lib/use-auth';

function buildDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const HARVEST_PRESET_OPTIONS = ['24/25', '25/26'] as const;
const REQUIRED_FIELD_MESSAGE = 'Obrigatório';

type RequiredFieldName = 'owner' | 'sacks' | 'harvest' | 'originLot';
type RequiredFieldErrors = Record<RequiredFieldName, string | null>;

const EMPTY_REQUIRED_FIELD_ERRORS: RequiredFieldErrors = {
  owner: null,
  sacks: null,
  harvest: null,
  originLot: null
};

function hasRequiredFieldErrors(fieldErrors: RequiredFieldErrors) {
  return Object.values(fieldErrors).some((value) => Boolean(value));
}

function getMissingRequiredFieldErrors(values: Record<RequiredFieldName, string>): RequiredFieldErrors {
  return {
    owner: values.owner.trim() ? null : REQUIRED_FIELD_MESSAGE,
    sacks: values.sacks.trim() ? null : REQUIRED_FIELD_MESSAGE,
    harvest: values.harvest.trim() ? null : REQUIRED_FIELD_MESSAGE,
    originLot: values.originLot.trim() ? null : REQUIRED_FIELD_MESSAGE
  };
}

function getSchemaFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>): RequiredFieldErrors {
  const next = { ...EMPTY_REQUIRED_FIELD_ERRORS };

  for (const issue of issues) {
    const path = issue.path[0];
    if (path !== 'owner' && path !== 'sacks' && path !== 'harvest' && path !== 'originLot') {
      continue;
    }

    next[path] = issue.message;
  }

  return next;
}

export default function NewSamplePage() {
  const { session, loading, logout } = useRequireAuth();

  const [clientDraftId, setClientDraftId] = useState(() => buildDraftId());
  const [owner, setOwner] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [notes, setNotes] = useState('');
  const [arrivalPhoto, setArrivalPhoto] = useState<File | null>(null);
  const [arrivalPhotoReady, setArrivalPhotoReady] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiredFieldErrors, setRequiredFieldErrors] = useState<RequiredFieldErrors>(EMPTY_REQUIRED_FIELD_ERRORS);
  const [created, setCreated] = useState<CreateSampleAndPreparePrintResponse | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const arrivalPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const confirmPhotoEffectTimeoutRef = useRef<number | null>(null);
  const labelModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastCreateButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showPhotoConfirmEffect, setShowPhotoConfirmEffect] = useState(false);
  const [photoConfirmEffectKey, setPhotoConfirmEffectKey] = useState(0);

  const printableSample = useMemo(() => created?.sample ?? null, [created]);
  const arrivalPhotoPreviewUrl = useMemo(() => {
    if (!arrivalPhoto) {
      return null;
    }

    return URL.createObjectURL(arrivalPhoto);
  }, [arrivalPhoto]);

  useEffect(() => {
    if (!arrivalPhotoPreviewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(arrivalPhotoPreviewUrl);
    };
  }, [arrivalPhotoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (confirmPhotoEffectTimeoutRef.current !== null) {
        window.clearTimeout(confirmPhotoEffectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('print-label-mode');
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('print-label-mode');
    };
  }, []);

  useEffect(() => {
    if (!labelModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setLabelModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      labelModalCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastCreateButtonRef.current?.focus();
      }, 0);
    };
  }, [labelModalOpen]);

  if (loading || !session) {
    return null;
  }

  function clearConfirmPhotoEffect() {
    if (confirmPhotoEffectTimeoutRef.current !== null) {
      window.clearTimeout(confirmPhotoEffectTimeoutRef.current);
      confirmPhotoEffectTimeoutRef.current = null;
    }
    setShowPhotoConfirmEffect(false);
  }

  function triggerConfirmPhotoEffect() {
    setArrivalPhotoReady(true);
    setPhotoConfirmEffectKey((current) => current + 1);
    setShowPhotoConfirmEffect(true);

    if (confirmPhotoEffectTimeoutRef.current !== null) {
      window.clearTimeout(confirmPhotoEffectTimeoutRef.current);
    }

    confirmPhotoEffectTimeoutRef.current = window.setTimeout(() => {
      setShowPhotoConfirmEffect(false);
      confirmPhotoEffectTimeoutRef.current = null;
    }, 980);
  }

  function resetDraft() {
    setClientDraftId(buildDraftId());
    setOwner('');
    setSacks('');
    setHarvest('');
    setOriginLot('');
    setNotes('');
    setArrivalPhoto(null);
    setArrivalPhotoReady(false);
    clearConfirmPhotoEffect();
    setLabelModalOpen(false);
    setCreated(null);
    setError(null);
    setRequiredFieldErrors(EMPTY_REQUIRED_FIELD_ERRORS);
    setSubmitting(false);
    if (arrivalPhotoInputRef.current) {
      arrivalPhotoInputRef.current.value = '';
    }
  }

  function clearRequiredFieldError(field: RequiredFieldName) {
    setRequiredFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: null
      };
    });
  }

  function handlePrintLabel() {
    document.body.classList.add('print-label-mode');
    window.print();
  }

  function closeLabelModal() {
    setLabelModalOpen(false);
  }

  async function handleCreateSample(trigger?: HTMLButtonElement) {
    if (!session) {
      return;
    }

    if (trigger) {
      lastCreateButtonRef.current = trigger;
    }

    setError(null);
    setSubmitting(true);

    const missingRequiredFieldErrors = getMissingRequiredFieldErrors({
      owner,
      sacks,
      harvest,
      originLot
    });

    if (hasRequiredFieldErrors(missingRequiredFieldErrors)) {
      setRequiredFieldErrors(missingRequiredFieldErrors);
      setSubmitting(false);
      return;
    }

    const parsed = createSampleDraftSchema.safeParse({
      owner,
      sacks,
      harvest,
      originLot,
      notes: notes.trim() ? notes : null
    });

    if (!parsed.success) {
      const schemaFieldErrors = getSchemaFieldErrors(parsed.error.issues);
      if (hasRequiredFieldErrors(schemaFieldErrors)) {
        setRequiredFieldErrors(schemaFieldErrors);
      } else {
        setError(parsed.error.issues[0]?.message ?? 'Dados invalidos para criar amostra');
      }
      setSubmitting(false);
      return;
    }

    setRequiredFieldErrors(EMPTY_REQUIRED_FIELD_ERRORS);

    if (arrivalPhoto && !arrivalPhotoReady) {
      setError('Confirme a foto no botao de verificacao ou reinicie a selecao antes de criar a amostra.');
      setSubmitting(false);
      return;
    }

    try {
      const result = await createSampleAndPreparePrint(session, {
        clientDraftId,
        owner: parsed.data.owner,
        sacks: parsed.data.sacks,
        harvest: parsed.data.harvest,
        originLot: parsed.data.originLot,
        receivedChannel: parsed.data.receivedChannel,
        notes: parsed.data.notes ?? null,
        printerId: null,
        arrivalPhoto: arrivalPhotoReady ? arrivalPhoto : null
      });

      setCreated(result);
      setLabelModalOpen(true);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha inesperada ao criar amostra');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="new-sample-page">
        <header className="new-sample-header">
          <p className="new-sample-kicker">Cadastro inicial</p>
          <h2 className="new-sample-title">Nova amostra</h2>
        </header>

        <section className="new-sample-layout">
          <article className="new-sample-step-card new-sample-card-photo">
            <div className="new-sample-step-head">
              <span className="new-sample-step-index" aria-hidden="true">
                1
              </span>
              <div className="new-sample-step-copy">
                <h3 className="new-sample-step-title">Foto da chegada (opcional)</h3>
              </div>
            </div>

            <label htmlFor="new-sample-arrival-photo-input" className="new-sample-photo-stage">
              <input
                id="new-sample-arrival-photo-input"
                className="new-sample-file-input"
                ref={arrivalPhotoInputRef}
                accept="image/*"
                capture="environment"
                type="file"
                onChange={(event) => {
                  setArrivalPhoto(event.target.files?.[0] ?? null);
                  setArrivalPhotoReady(false);
                  clearConfirmPhotoEffect();
                }}
              />
              {arrivalPhotoPreviewUrl ? (
                <img
                  src={arrivalPhotoPreviewUrl}
                  alt="Pre-visualizacao da foto de chegada"
                  className="new-sample-photo-preview"
                />
              ) : (
                <span className="new-sample-photo-placeholder">
                  <span className="new-sample-photo-placeholder-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M4 8.5h3l1.1-2h5.8l1.1 2h3A1.8 1.8 0 0 1 20 10.3v7.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 17.7v-7.4A1.8 1.8 0 0 1 5.8 8.5Z" />
                      <circle cx="12" cy="13.3" r="3.1" />
                    </svg>
                  </span>
                  <span className="new-sample-photo-placeholder-title">Espaco reservado para foto</span>
                  <span className="new-sample-photo-placeholder-text">Toque para capturar ou anexar imagem</span>
                </span>
              )}

              {showPhotoConfirmEffect ? (
                <span key={photoConfirmEffectKey} className="new-sample-photo-confirm-fx" aria-hidden="true">
                  <span className="new-sample-photo-confirm-glow" />
                  <span className="new-sample-photo-confirm-ring" />
                  <span className="new-sample-photo-confirm-badge">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="m5 12.5 4.3 4.2L19 7" />
                    </svg>
                  </span>
                  <span className="new-sample-photo-spark new-sample-photo-spark-a" />
                  <span className="new-sample-photo-spark new-sample-photo-spark-b" />
                  <span className="new-sample-photo-spark new-sample-photo-spark-c" />
                  <span className="new-sample-photo-spark new-sample-photo-spark-d" />
                  <span className="new-sample-photo-spark new-sample-photo-spark-e" />
                </span>
              ) : null}
            </label>

            <div className="row new-sample-photo-actions">
              <button
                type="button"
                className={`new-sample-photo-action-button${arrivalPhotoReady ? ' is-ready' : ''}`}
                onClick={triggerConfirmPhotoEffect}
                disabled={!arrivalPhoto || arrivalPhotoReady || submitting}
                aria-label="Usar foto selecionada"
                title="Usar foto"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="m5 12.5 4.3 4.2L19 7" />
                </svg>
              </button>
              <button
                type="button"
                className="new-sample-photo-action-button secondary"
                onClick={() => {
                  setArrivalPhoto(null);
                  setArrivalPhotoReady(false);
                  clearConfirmPhotoEffect();
                  if (arrivalPhotoInputRef.current) {
                    arrivalPhotoInputRef.current.value = '';
                  }
                }}
                disabled={!arrivalPhoto || submitting}
                aria-label="Descartar foto e selecionar novamente"
                title="Tentar novamente"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M7 7h5v5" />
                  <path d="M7 12a6 6 0 1 0 2.2-4.6L12 12" />
                </svg>
              </button>
            </div>
          </article>

          <article className="new-sample-step-card new-sample-card-required">
            <div className="new-sample-step-head">
              <span className="new-sample-step-index" aria-hidden="true">
                2
              </span>
              <div className="new-sample-step-copy">
                <h3 className="new-sample-step-title">Dados obrigatorios</h3>
              </div>
            </div>

            <div className="grid grid-2 new-sample-required-grid">
              <label className="new-sample-required-field">
                Proprietario
                <input
                  value={owner}
                  className={requiredFieldErrors.owner ? 'new-sample-input-error' : undefined}
                  aria-invalid={Boolean(requiredFieldErrors.owner)}
                  onChange={(event) => {
                    setOwner(event.target.value);
                    clearRequiredFieldError('owner');
                  }}
                  placeholder="Ex: Coopercitrus"
                  autoComplete="organization"
                />
                {requiredFieldErrors.owner ? (
                  <span className="new-sample-field-required">{requiredFieldErrors.owner}</span>
                ) : null}
              </label>

              <label className="new-sample-required-field">
                Sacas
                <input
                  value={sacks}
                  className={requiredFieldErrors.sacks ? 'new-sample-input-error' : undefined}
                  aria-invalid={Boolean(requiredFieldErrors.sacks)}
                  onChange={(event) => {
                    setSacks(event.target.value);
                    clearRequiredFieldError('sacks');
                  }}
                  inputMode="numeric"
                  placeholder="Ex: 40"
                />
                {requiredFieldErrors.sacks ? (
                  <span className="new-sample-field-required">{requiredFieldErrors.sacks}</span>
                ) : null}
              </label>

              <div className={`new-sample-harvest-field${requiredFieldErrors.harvest ? ' has-error' : ''}`}>
                <label htmlFor="new-sample-harvest-input">Safra</label>
                <input
                  id="new-sample-harvest-input"
                  className={requiredFieldErrors.harvest ? 'new-sample-input-error' : undefined}
                  aria-invalid={Boolean(requiredFieldErrors.harvest)}
                  value={harvest}
                  onChange={(event) => {
                    setHarvest(event.target.value);
                    clearRequiredFieldError('harvest');
                  }}
                  placeholder="Ex: 25/26"
                />
                <div className="new-sample-harvest-options">
                  {HARVEST_PRESET_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`new-sample-harvest-option${harvest.trim() === option ? ' is-active' : ''}`}
                      onClick={() => {
                        setHarvest(option);
                        clearRequiredFieldError('harvest');
                      }}
                      disabled={submitting}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {requiredFieldErrors.harvest ? (
                  <span className="new-sample-field-required">{requiredFieldErrors.harvest}</span>
                ) : null}
              </div>

              <label className="new-sample-required-field">
                Lote de origem
                <input
                  value={originLot}
                  className={requiredFieldErrors.originLot ? 'new-sample-input-error' : undefined}
                  aria-invalid={Boolean(requiredFieldErrors.originLot)}
                  onChange={(event) => {
                    setOriginLot(event.target.value);
                    clearRequiredFieldError('originLot');
                  }}
                  placeholder="Codigo do lote"
                />
                {requiredFieldErrors.originLot ? (
                  <span className="new-sample-field-required">{requiredFieldErrors.originLot}</span>
                ) : null}
              </label>
            </div>
          </article>

          <article className="new-sample-step-card new-sample-card-notes">
            <div className="new-sample-step-head">
              <span className="new-sample-step-index" aria-hidden="true">
                3
              </span>
              <div className="new-sample-step-copy">
                <h3 className="new-sample-step-title">Observacoes (opcional)</h3>
              </div>
            </div>

            <label>
              Observacoes do recebimento
              <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="" />
            </label>
          </article>
        </section>

        {error ? <p className="error">{error}</p> : null}

        <div className="row new-sample-actions">
          <button
            type="button"
            disabled={submitting || (Boolean(arrivalPhoto) && !arrivalPhotoReady)}
            onClick={(event) => void handleCreateSample(event.currentTarget)}
          >
            {submitting ? 'Criando amostra...' : 'Criar amostra'}
          </button>
          <button type="button" className="secondary" disabled={submitting} onClick={resetDraft}>
            Limpar formulario
          </button>
        </div>
      </section>

      {printableSample && labelModalOpen ? (
        <div className="new-sample-label-modal-backdrop" onClick={closeLabelModal}>
          <section
            className="new-sample-label-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-sample-label-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="new-sample-label-modal-header">
              <h3 id="new-sample-label-modal-title" className="new-sample-label-modal-title">
                Etiqueta pronta para impressao
              </h3>

              <button
                ref={labelModalCloseButtonRef}
                type="button"
                className="new-sample-label-modal-close"
                onClick={closeLabelModal}
                aria-label="Fechar modal"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="new-sample-label-modal-content">
              <article id="sample-label-print" className="label-print-card">
                <div className="label-qr">
                  <QRCodeCanvas value={created?.qr.value ?? printableSample.id} size={120} />
                </div>
                <div className="label-meta">
                  <p>
                    <strong>Lote interno:</strong> {printableSample.internalLotNumber ?? 'Nao definido'}
                  </p>
                  <p>
                    <strong>Proprietario:</strong> {printableSample.declared.owner ?? 'Nao informado'}
                  </p>
                  <p>
                    <strong>Sacas:</strong> {printableSample.declared.sacks ?? 'Nao informado'}
                  </p>
                  <p>
                    <strong>Safra:</strong> {printableSample.declared.harvest ?? 'Nao informado'}
                  </p>
                  <p>
                    <strong>Lote origem:</strong> {printableSample.declared.originLot ?? 'Nao informado'}
                  </p>
                </div>
              </article>
            </div>

            <div className="row new-sample-print-actions new-sample-label-modal-actions">
              <button type="button" className="new-sample-label-action-print" onClick={handlePrintLabel}>
                Imprimir
              </button>
              <Link
                href={`/samples/${printableSample.id}`}
                className="new-sample-link-button new-sample-label-action-details"
                onClick={closeLabelModal}
              >
                Detalhes
              </Link>
              <button type="button" className="new-sample-label-action-new" onClick={resetDraft}>
                Nova
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
