'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { AppShell } from '../../../components/AppShell';
import { ClientLookupField } from '../../../components/clients/ClientLookupField';
import { ClientQuickCreateModal } from '../../../components/clients/ClientQuickCreateModal';
import { ClientRegistrationSelect } from '../../../components/clients/ClientRegistrationSelect';
import {
  ApiError,
  createSampleAndPreparePrint,
  getClient
} from '../../../lib/api-client';
import { createSampleDraftSchema } from '../../../lib/form-schemas';
import { compressImage } from '../../../lib/compress-image';
import { clearPendingArrivalPhoto, readPendingArrivalPhoto } from '../../../lib/mobile-camera-photo-store';
import type {
  ClientRegistrationSummary,
  ClientSummary,
  CreateSampleAndPreparePrintResponse
} from '../../../lib/types';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';

const DRAFT_ID_STORAGE_KEY = 'new-sample-draft-id';

function buildDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadOrCreateDraftId(): string {
  try {
    const stored = sessionStorage.getItem(DRAFT_ID_STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch {}

  const id = buildDraftId();
  persistDraftId(id);
  return id;
}

function renewDraftId(): string {
  const id = buildDraftId();
  persistDraftId(id);
  return id;
}

function persistDraftId(id: string) {
  try { sessionStorage.setItem(DRAFT_ID_STORAGE_KEY, id); } catch {}
}

function clearPersistedDraftId() {
  try { sessionStorage.removeItem(DRAFT_ID_STORAGE_KEY); } catch {}
}

function buildHarvestPresets(): readonly string[] {
  const year = new Date().getFullYear() % 100;
  return [`${year - 1}/${year}`, `${year}/${year + 1}`];
}

const HARVEST_PRESET_OPTIONS = buildHarvestPresets();
const REQUIRED_FIELD_MESSAGE = 'Obrigatório';

type RequiredFieldName = 'owner' | 'sacks' | 'harvest' | 'originLot';
type RequiredFieldErrors = Record<RequiredFieldName, string | null>;
type LabelModalStep = 'review' | 'completed';
type NewSampleStep = 'photo' | 'details';

interface PendingDraftPayload {
  clientDraftId: string;
  owner: string;
  ownerClientId: string | null;
  ownerRegistrationId: string | null;
  sacks: number;
  harvest: string;
  originLot: string;
  receivedChannel: 'in_person' | 'courier' | 'driver' | 'other';
  notes: string | null;
  printerId: string | null;
  arrivalPhoto: File | null;
}

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

function buildModalTitle(step: LabelModalStep) {
  if (step === 'review') {
    return 'Confirme os dados da amostra';
  }

  return 'Amostra criada';
}

function NewSamplePageContent() {
  const { session, loading, logout } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [clientDraftId, setClientDraftId] = useState(loadOrCreateDraftId);
  const [owner, setOwner] = useState('');
  const [selectedOwnerClient, setSelectedOwnerClient] = useState<ClientSummary | null>(null);
  const [ownerRegistrations, setOwnerRegistrations] = useState<ClientRegistrationSummary[]>([]);
  const [selectedOwnerRegistrationId, setSelectedOwnerRegistrationId] = useState<string | null>(null);
  const [ownerRegistrationLoading, setOwnerRegistrationLoading] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateSeed, setQuickCreateSeed] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [notes, setNotes] = useState('');
  const [arrivalPhoto, setArrivalPhoto] = useState<File | null>(null);
  const [arrivalPhotoLoading, setArrivalPhotoLoading] = useState(false);
  const [arrivalPhotoReady, setArrivalPhotoReady] = useState(false);
  const [currentStep, setCurrentStep] = useState<NewSampleStep>('photo');
  const [harvestOptionsOpen, setHarvestOptionsOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requiredFieldErrors, setRequiredFieldErrors] = useState<RequiredFieldErrors>(EMPTY_REQUIRED_FIELD_ERRORS);

  const [pendingDraft, setPendingDraft] = useState<PendingDraftPayload | null>(null);
  const [created, setCreated] = useState<CreateSampleAndPreparePrintResponse | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const labelTrapRef = useFocusTrap(labelModalOpen);
  const [labelModalStep, setLabelModalStep] = useState<LabelModalStep>('review');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  const arrivalPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const ownerInputRef = useRef<HTMLInputElement | null>(null);
  const sacksInputRef = useRef<HTMLInputElement | null>(null);
  const harvestInputRef = useRef<HTMLInputElement | null>(null);
  const harvestFieldRef = useRef<HTMLDivElement | null>(null);
  const originLotInputRef = useRef<HTMLInputElement | null>(null);
  const stageBodyRef = useRef<HTMLDivElement | null>(null);
  const confirmPhotoEffectTimeoutRef = useRef<number | null>(null);
  const invalidFocusTimeoutRef = useRef<number | null>(null);
  const labelModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalPrimaryActionRef = useRef<HTMLButtonElement | null>(null);
  const lastCreateButtonRef = useRef<HTMLButtonElement | null>(null);
  const pageMountedRef = useRef(true);
  const cameraHydrationRequestRef = useRef(0);

  const [showPhotoConfirmEffect, setShowPhotoConfirmEffect] = useState(false);
  const [photoConfirmEffectKey, setPhotoConfirmEffectKey] = useState(0);
  const [arrivalPhotoSource, setArrivalPhotoSource] = useState<'camera' | 'manual' | null>(null);
  const [activeCameraHandoffId, setActiveCameraHandoffId] = useState<string | null>(null);

  const printableSample = useMemo(() => created?.sample ?? null, [created]);
  const canCloseModal = labelModalStep === 'review' || labelModalStep === 'completed';
  const cameraSourceParam = searchParams.get('source');
  const cameraHandoffParam = searchParams.get('handoff');

  function clearCameraHandoffRouteState() {
    if (cameraSourceParam === 'camera' || cameraHandoffParam) {
      router.replace('/samples/new');
    }
  }

  const arrivalPhotoPreviewUrl = useMemo(() => {
    if (!arrivalPhoto) {
      return null;
    }

    return URL.createObjectURL(arrivalPhoto);
  }, [arrivalPhoto]);

  useEffect(() => {
    pageMountedRef.current = true;
    return () => {
      pageMountedRef.current = false;
    };
  }, []);



  useEffect(() => {
    if (!arrivalPhotoPreviewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(arrivalPhotoPreviewUrl);
    };
  }, [arrivalPhotoPreviewUrl]);

  useEffect(() => {
    if (!session || !selectedOwnerClient) {
      setOwnerRegistrations([]);
      setSelectedOwnerRegistrationId(null);
      setOwnerRegistrationLoading(false);
      setOwner(selectedOwnerClient?.displayName ?? '');
      return;
    }

    let active = true;
    setOwnerRegistrationLoading(true);
    setError(null);
    setOwner(selectedOwnerClient.displayName ?? '');

    getClient(session, selectedOwnerClient.id)
      .then((response) => {
        if (!active) {
          return;
        }

        const activeRegistrations = response.registrations.filter((registration) => registration.status === 'ACTIVE');
        setOwnerRegistrations(activeRegistrations);
        setSelectedOwnerRegistrationId((current) =>
          activeRegistrations.some((registration) => registration.id === current) ? current : null
        );
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        setOwnerRegistrations([]);
        setSelectedOwnerRegistrationId(null);
        setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar inscricoes do proprietario');
      })
      .finally(() => {
        if (active) {
          setOwnerRegistrationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedOwnerClient, session]);

  useEffect(() => {
    return () => {
      if (confirmPhotoEffectTimeoutRef.current !== null) {
        window.clearTimeout(confirmPhotoEffectTimeoutRef.current);
      }

      if (invalidFocusTimeoutRef.current !== null) {
        window.clearTimeout(invalidFocusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    stageBodyRef.current?.scrollTo({ top: 0 });
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 'details') {
      setHarvestOptionsOpen(false);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!harvestOptionsOpen) {
      return;
    }

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!harvestFieldRef.current?.contains(target)) {
        setHarvestOptionsOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
    };
  }, [harvestOptionsOpen]);

  useEffect(() => {
    if (!labelModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (!canCloseModal) {
        return;
      }

      event.preventDefault();
      setLabelModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      if (canCloseModal) {
        labelModalCloseButtonRef.current?.focus();
        return;
      }

      modalPrimaryActionRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastCreateButtonRef.current?.focus();
      }, 0);
    };
  }, [canCloseModal, labelModalOpen]);

  useEffect(() => {
    if (cameraSourceParam !== 'camera' || !cameraHandoffParam || activeCameraHandoffId === cameraHandoffParam) {
      return;
    }

    const requestId = cameraHydrationRequestRef.current + 1;
    cameraHydrationRequestRef.current = requestId;
    setArrivalPhotoLoading(true);

    void readPendingArrivalPhoto(cameraHandoffParam)
      .then(async (photo) => {
        if (!pageMountedRef.current || cameraHydrationRequestRef.current !== requestId) {
          return;
        }

        if (!photo) {
          setArrivalPhotoLoading(false);
          setError('A foto capturada nao estava mais disponivel. Continue com o registro manualmente.');
          clearCameraHandoffRouteState();
          return;
        }

        const compressed = await compressImage(photo.file);
        if (!pageMountedRef.current || cameraHydrationRequestRef.current !== requestId) {
          return;
        }

        setArrivalPhoto(compressed);
        setArrivalPhotoReady(photo.confirmed);
        setArrivalPhotoLoading(false);
        setCurrentStep('photo');
        setArrivalPhotoSource('camera');
        setActiveCameraHandoffId(photo.handoffId);
        if (photo.confirmed) {
          playConfirmPhotoEffect();
        } else {
          clearConfirmPhotoEffect();
        }
        setError(null);
      })
      .catch(() => {
        if (!pageMountedRef.current || cameraHydrationRequestRef.current !== requestId) {
          return;
        }

        setArrivalPhotoLoading(false);
        setError('Falha ao recuperar a foto capturada. Continue com o registro manualmente.');
        clearCameraHandoffRouteState();
      });
  }, [activeCameraHandoffId, cameraHandoffParam, cameraSourceParam]);

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
    setError(null);
    playConfirmPhotoEffect();
  }

  function playConfirmPhotoEffect() {
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

  function clearArrivalPhoto() {
    if (activeCameraHandoffId) {
      void clearPendingArrivalPhoto(activeCameraHandoffId);
    }

    clearCameraHandoffRouteState();
    setArrivalPhoto(null);
    setArrivalPhotoReady(false);
    setArrivalPhotoLoading(false);
    setArrivalPhotoSource(null);
    setActiveCameraHandoffId(null);
    cameraHydrationRequestRef.current += 1;
    clearConfirmPhotoEffect();
    setError(null);
    if (arrivalPhotoInputRef.current) {
      arrivalPhotoInputRef.current.value = '';
    }
  }

  function focusRequiredField(field: RequiredFieldName) {
    if (invalidFocusTimeoutRef.current !== null) {
      window.clearTimeout(invalidFocusTimeoutRef.current);
    }

    setCurrentStep('details');
    invalidFocusTimeoutRef.current = window.setTimeout(() => {
      const target =
        field === 'owner'
          ? ownerInputRef.current
          : field === 'sacks'
            ? sacksInputRef.current
            : field === 'harvest'
              ? harvestInputRef.current
              : originLotInputRef.current;

      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
      invalidFocusTimeoutRef.current = null;
    }, 60);
  }

  function focusFirstInvalidField(fieldErrors: RequiredFieldErrors) {
    const firstInvalidField = (['owner', 'sacks', 'harvest', 'originLot'] as const).find((field) => Boolean(fieldErrors[field]));
    if (!firstInvalidField) {
      return;
    }

    focusRequiredField(firstInvalidField);
  }

  function handleContinueFromPhoto() {
    setError(null);
    setMessage(null);

    if (arrivalPhoto && !arrivalPhotoReady) {
      setError('Confirme a foto no botao de verificacao ou remova a imagem antes de continuar.');
      return;
    }

    setCurrentStep('details');
  }

  function handlePhotoSecondaryAction() {
    setError(null);
    setMessage(null);

    if (arrivalPhoto) {
      clearArrivalPhoto();
      return;
    }

    setCurrentStep('details');
  }

  function resetDraft() {
    if (activeCameraHandoffId) {
      void clearPendingArrivalPhoto(activeCameraHandoffId);
    }
    clearCameraHandoffRouteState();
    setClientDraftId(renewDraftId());
    setOwner('');
    setSelectedOwnerClient(null);
    setOwnerRegistrations([]);
    setSelectedOwnerRegistrationId(null);
    setOwnerRegistrationLoading(false);
    setQuickCreateOpen(false);
    setQuickCreateSeed('');
    setSacks('');
    setHarvest('');
    setOriginLot('');
    setNotes('');
    setArrivalPhoto(null);
    setArrivalPhotoReady(false);
    setArrivalPhotoLoading(false);
    setCurrentStep('photo');
    setHarvestOptionsOpen(false);
    setArrivalPhotoSource(null);
    setActiveCameraHandoffId(null);
    cameraHydrationRequestRef.current += 1;
    clearConfirmPhotoEffect();
    setPendingDraft(null);
    setLabelModalOpen(false);
    setLabelModalStep('review');
    setCreated(null);
    setError(null);
    setMessage(null);
    setModalError(null);
    setModalMessage(null);
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

  function closeLabelModal() {
    if (!canCloseModal) {
      return;
    }

    setLabelModalOpen(false);
  }

  function openReviewModal(trigger?: HTMLButtonElement) {
    if (!session) {
      return;
    }

    if (trigger) {
      lastCreateButtonRef.current = trigger;
    }

    setError(null);
    setMessage(null);
    setModalError(null);
    setModalMessage(null);

    if (!selectedOwnerClient) {
      setRequiredFieldErrors((current) => ({
        ...current,
        owner: REQUIRED_FIELD_MESSAGE
      }));
      focusRequiredField('owner');
      return;
    }

    const missingRequiredFieldErrors = getMissingRequiredFieldErrors({
      owner,
      sacks,
      harvest,
      originLot
    });

    if (hasRequiredFieldErrors(missingRequiredFieldErrors)) {
      setRequiredFieldErrors(missingRequiredFieldErrors);
      focusFirstInvalidField(missingRequiredFieldErrors);
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
        focusFirstInvalidField(schemaFieldErrors);
      } else {
        setError(parsed.error.issues[0]?.message ?? 'Dados invalidos para criar amostra');
      }
      return;
    }

    setRequiredFieldErrors(EMPTY_REQUIRED_FIELD_ERRORS);

    if (arrivalPhoto && !arrivalPhotoReady) {
      setCurrentStep('photo');
      setError('Confirme a foto no botao de verificacao ou reinicie a selecao antes de criar a amostra.');
      return;
    }

    setPendingDraft({
      clientDraftId,
      owner: parsed.data.owner,
      ownerClientId: selectedOwnerClient?.id ?? null,
      ownerRegistrationId: selectedOwnerRegistrationId ?? null,
      sacks: parsed.data.sacks,
      harvest: parsed.data.harvest,
      originLot: parsed.data.originLot,
      receivedChannel: parsed.data.receivedChannel,
      notes: parsed.data.notes ?? null,
      printerId: null,
      arrivalPhoto: arrivalPhotoReady ? arrivalPhoto : null
    });

    setLabelModalStep('review');
    setLabelModalOpen(true);
  }

  async function handleConfirmDraft() {
    if (!session || !pendingDraft) {
      return;
    }

    setSubmitting(true);
    setModalError(null);
    setModalMessage(null);

    try {
      const result = await createSampleAndPreparePrint(session, {
        clientDraftId: pendingDraft.clientDraftId,
        owner: pendingDraft.owner,
        ownerClientId: pendingDraft.ownerClientId,
        ownerRegistrationId: pendingDraft.ownerRegistrationId,
        sacks: pendingDraft.sacks,
        harvest: pendingDraft.harvest,
        originLot: pendingDraft.originLot,
        receivedChannel: pendingDraft.receivedChannel,
        notes: pendingDraft.notes,
        printerId: pendingDraft.printerId,
        arrivalPhoto: pendingDraft.arrivalPhoto
      });

      clearPersistedDraftId();

      if (activeCameraHandoffId) {
        await clearPendingArrivalPhoto(activeCameraHandoffId);
        setActiveCameraHandoffId(null);
      }
      clearCameraHandoffRouteState();

      setCreated(result);
      setLabelModalStep('completed');
      setModalMessage('Amostra criada! Etiqueta enviada para a fila de impressao.');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setModalError(cause.message);
      } else {
        setModalError(cause instanceof Error ? cause.message : 'Falha ao criar amostra');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function previewValue(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return 'Nao informado';
    }

    return String(value);
  }

  const previewOwner = pendingDraft?.owner ?? printableSample?.declared.owner ?? null;
  const previewSacks = pendingDraft?.sacks ?? printableSample?.declared.sacks ?? null;
  const previewHarvest = pendingDraft?.harvest ?? printableSample?.declared.harvest ?? null;
  const previewOriginLot = pendingDraft?.originLot ?? printableSample?.declared.originLot ?? null;
  const previewInternalLot = printableSample?.internalLotNumber ?? null;
  const photoSecondaryActionLabel = arrivalPhoto ? 'Remover foto' : 'Pular foto';
  const detailsPhotoStatusLabel = arrivalPhotoReady ? 'Foto confirmada' : arrivalPhoto ? 'Foto pendente' : 'Sem foto';

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="new-sample-page">
        <header className="new-sample-header">
          <h2 className="new-sample-title">Nova amostra</h2>
        </header>

        {(error || message) ? (
          <div className="new-sample-feedback-stack">
            {error ? <p className="error">{error}</p> : null}
            {message ? <p className="success">{message}</p> : null}
          </div>
        ) : null}

        <section className="new-sample-stage-shell">
          <div
            ref={stageBodyRef}
            className={`new-sample-stage-body is-${currentStep}-step${currentStep === 'details' ? ' is-static-step' : ''}`}
          >
            {currentStep === 'photo' ? (
              <article className="new-sample-step-card new-sample-stage-card new-sample-card-photo">
                <div className="new-sample-step-head new-sample-step-head-spread">
                  <div className="new-sample-step-copy">
                    <div className="new-sample-step-progress-inline" aria-label="Etapa 1 de 2">
                      <span className="new-sample-step-count">1/2</span>
                      <div className="new-sample-step-track" aria-hidden="true">
                        <span className="new-sample-step-track-segment is-complete" />
                        <span className="new-sample-step-track-segment" />
                      </div>
                    </div>
                    <h3 className="new-sample-step-title">Foto da chegada</h3>
                  </div>
                  <span
                    className={`new-sample-photo-status${arrivalPhotoReady ? ' is-ready' : arrivalPhoto ? ' is-pending' : ' is-empty'}`}
                  >
                    {arrivalPhotoReady ? 'Foto pronta' : arrivalPhoto ? 'Confirmacao pendente' : 'Opcional'}
                  </span>
                </div>

                <div className="new-sample-step-body-content new-sample-step-body-content-photo">
                  <label htmlFor="new-sample-arrival-photo-input" className="new-sample-photo-stage">
                    <input
                      id="new-sample-arrival-photo-input"
                      className="new-sample-file-input"
                      ref={arrivalPhotoInputRef}
                      accept="image/*"
                      capture="environment"
                      type="file"
                      onChange={(event) => {
                        const rawFile = event.target.files?.[0] ?? null;
                        if (activeCameraHandoffId) {
                          void clearPendingArrivalPhoto(activeCameraHandoffId);
                        }
                        clearCameraHandoffRouteState();
                        setActiveCameraHandoffId(null);
                        cameraHydrationRequestRef.current += 1;
                        clearConfirmPhotoEffect();
                        setError(null);

                        if (!rawFile) {
                          setArrivalPhoto(null);
                          setArrivalPhotoReady(false);
                          setArrivalPhotoSource(null);
                          return;
                        }

                        setArrivalPhotoSource('manual');
                        setArrivalPhotoReady(false);
                        setArrivalPhotoLoading(true);
                        void compressImage(rawFile).then((compressed) => {
                          setArrivalPhoto(compressed);
                          setArrivalPhotoLoading(false);
                        });
                      }}
                    />
                    {arrivalPhotoPreviewUrl ? (
                      <img
                        src={arrivalPhotoPreviewUrl}
                        alt="Pre-visualizacao da foto de chegada"
                        className="new-sample-photo-preview"
                      />
                    ) : arrivalPhotoLoading ? (
                      <span className="new-sample-photo-placeholder">
                        <span className="new-sample-photo-loading-spinner" aria-hidden="true" />
                        <span className="new-sample-photo-placeholder-title">Preparando foto...</span>
                      </span>
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

                  {arrivalPhoto && !arrivalPhotoReady ? (
                    <div className="new-sample-photo-toolbar">
                      <button
                        type="button"
                        className="new-sample-photo-confirm-button"
                        onClick={triggerConfirmPhotoEffect}
                        disabled={submitting}
                      >
                        Confirmar foto
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="row new-sample-step-actions">
                  <button type="button" className="secondary" disabled={submitting} onClick={handlePhotoSecondaryAction}>
                    {photoSecondaryActionLabel}
                  </button>
                  <button type="button" disabled={submitting} onClick={handleContinueFromPhoto}>
                    Continuar
                  </button>
                </div>
              </article>
            ) : (
              <article className="new-sample-step-card new-sample-stage-card new-sample-card-details">
                <div className="new-sample-step-head new-sample-step-head-spread">
                  <div className="new-sample-step-copy">
                    <div className="new-sample-step-progress-inline" aria-label="Etapa 2 de 2">
                      <span className="new-sample-step-count">2/2</span>
                      <div className="new-sample-step-track" aria-hidden="true">
                        <span className="new-sample-step-track-segment is-complete" />
                        <span className="new-sample-step-track-segment is-complete" />
                      </div>
                    </div>
                    <h3 className="new-sample-step-title">Dados da amostra</h3>
                  </div>
                  <button type="button" className="new-sample-inline-reset" disabled={submitting} onClick={resetDraft}>
                    Limpar
                  </button>
                </div>

                <div className="new-sample-details-overview" aria-label="Resumo da etapa">
                  <span className="new-sample-details-pill is-accent">Etapa final</span>
                  <span
                    className={`new-sample-details-pill${arrivalPhotoReady ? ' is-ready' : arrivalPhoto ? ' is-pending' : ' is-empty'}`}
                  >
                    {detailsPhotoStatusLabel}
                  </span>
                </div>

                <div className="new-sample-step-body-content new-sample-step-body-content-details">
                  <div className="grid grid-2 new-sample-required-grid new-sample-details-grid">
                    <div className="new-sample-required-field">
                      <ClientLookupField
                        session={session}
                        label="Proprietario"
                        kind="owner"
                        inputRef={ownerInputRef}
                        invalid={Boolean(requiredFieldErrors.owner)}
                        invalidText={requiredFieldErrors.owner ?? 'Obrigatorio'}
                        selectedClient={selectedOwnerClient}
                        onSelectClient={(client) => {
                          setSelectedOwnerClient(client);
                          setOwner(client?.displayName ?? '');
                          setSelectedOwnerRegistrationId(null);
                          clearRequiredFieldError('owner');
                          setError(null);
                        }}
                        onRequestCreate={(searchTerm) => {
                          setQuickCreateSeed(searchTerm);
                          setQuickCreateOpen(true);
                        }}
                        createLabel="Cadastrar proprietario"
                      />
                    </div>

                    <div className="new-sample-required-field">
                      <ClientRegistrationSelect
                        label="Inscricao do proprietario (opcional)"
                        registrations={ownerRegistrations}
                        value={selectedOwnerRegistrationId}
                        disabled={!selectedOwnerClient || ownerRegistrationLoading || submitting}
                        onChange={setSelectedOwnerRegistrationId}
                      />
                      {ownerRegistrationLoading ? (
                        <span className="new-sample-field-required" style={{ color: 'var(--muted)' }}>
                          Carregando inscricoes...
                        </span>
                      ) : null}
                    </div>

                    <div className="new-sample-compact-fields">
                      <label className="new-sample-required-field">
                        Sacas
                        <input
                          ref={sacksInputRef}
                          value={sacks}
                          className={requiredFieldErrors.sacks ? 'new-sample-input-error' : undefined}
                          aria-invalid={Boolean(requiredFieldErrors.sacks)}
                          onChange={(event) => {
                            setSacks(event.target.value);
                            clearRequiredFieldError('sacks');
                          }}
                          inputMode="numeric"
                          placeholder={requiredFieldErrors.sacks ? requiredFieldErrors.sacks : 'Ex: 40'}
                        />
                      </label>

                      <div
                        ref={harvestFieldRef}
                        className={`new-sample-harvest-field${requiredFieldErrors.harvest ? ' has-error' : ''}`}
                      >
                        <label htmlFor="new-sample-harvest-input">Safra</label>
                        <input
                          id="new-sample-harvest-input"
                          ref={harvestInputRef}
                          className={requiredFieldErrors.harvest ? 'new-sample-input-error' : undefined}
                          aria-invalid={Boolean(requiredFieldErrors.harvest)}
                          value={harvest}
                          onFocus={() => setHarvestOptionsOpen(true)}
                          onChange={(event) => {
                            setHarvest(event.target.value);
                            clearRequiredFieldError('harvest');
                          }}
                          placeholder={requiredFieldErrors.harvest ? requiredFieldErrors.harvest : `Ex: ${HARVEST_PRESET_OPTIONS[1] ?? '25/26'}`}
                        />
                        {harvestOptionsOpen ? (
                          <div className="new-sample-harvest-options">
                            {HARVEST_PRESET_OPTIONS.map((option) => (
                              <button
                                key={option}
                                type="button"
                                className={`new-sample-harvest-option${harvest.trim() === option ? ' is-active' : ''}`}
                                onClick={() => {
                                  setHarvest(option);
                                  clearRequiredFieldError('harvest');
                                  setHarvestOptionsOpen(false);
                                }}
                                disabled={submitting}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <label className="new-sample-required-field">
                      Lote de origem
                      <input
                        ref={originLotInputRef}
                        value={originLot}
                        className={requiredFieldErrors.originLot ? 'new-sample-input-error' : undefined}
                        aria-invalid={Boolean(requiredFieldErrors.originLot)}
                        onChange={(event) => {
                          setOriginLot(event.target.value);
                          clearRequiredFieldError('originLot');
                        }}
                        placeholder={requiredFieldErrors.originLot ? requiredFieldErrors.originLot : 'Codigo do lote'}
                      />
                    </label>

                    <label className="new-sample-required-field new-sample-required-field-full new-sample-notes-field">
                      Observacoes
                      <textarea
                        className="new-sample-notes-textarea"
                        rows={1}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Opcional"
                      />
                    </label>
                  </div>
                </div>

                <div className="row new-sample-step-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={submitting}
                    onClick={() => {
                      setError(null);
                      setMessage(null);
                      setCurrentStep('photo');
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={submitting || (Boolean(arrivalPhoto) && !arrivalPhotoReady)}
                    onClick={(event) => openReviewModal(event.currentTarget)}
                  >
                    Criar amostra
                  </button>
                </div>

              </article>
            )}
          </div>
        </section>
      </section>

      {labelModalOpen ? (
        <div
          className="new-sample-label-modal-backdrop"
          onClick={() => {
            if (canCloseModal) {
              closeLabelModal();
            }
          }}
        >
          <section
            ref={labelTrapRef}
            className="new-sample-label-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-sample-label-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="new-sample-label-modal-header">
              <h3 id="new-sample-label-modal-title" className="new-sample-label-modal-title">
                {buildModalTitle(labelModalStep)}
              </h3>

              {canCloseModal ? (
                <button
                  ref={labelModalCloseButtonRef}
                  type="button"
                  className="new-sample-label-modal-close"
                  onClick={closeLabelModal}
                  aria-label="Fechar modal"
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
            </header>

            <div className="new-sample-label-modal-content">
              <article id="sample-label-print" className="label-print-card new-sample-label-print-card">
                {labelModalStep === 'review' ? (
                  <div className="label-qr new-sample-label-qr-placeholder" aria-hidden="true">
                    <span>Aguardando confirmacao</span>
                  </div>
                ) : (
                  <div className="label-qr">
                    <QRCodeSVG value={created?.qr.value ?? printableSample?.id ?? 'sample'} size={120} />
                  </div>
                )}
                <div className="label-meta">
                  <p>
                    <strong>Lote interno:</strong> {previewInternalLot ?? 'Sera gerado ao confirmar'}
                  </p>
                  <p>
                    <strong>Proprietario:</strong> {previewValue(previewOwner)}
                  </p>
                  <p>
                    <strong>Sacas:</strong> {previewValue(previewSacks)}
                  </p>
                  <p>
                    <strong>Safra:</strong> {previewValue(previewHarvest)}
                  </p>
                  <p>
                    <strong>Lote origem:</strong> {previewValue(previewOriginLot)}
                  </p>
                </div>
              </article>
            </div>

            {modalError ? <p className="error new-sample-label-modal-feedback">{modalError}</p> : null}
            {modalMessage ? <p className="success new-sample-label-modal-feedback">{modalMessage}</p> : null}

            <div className="row new-sample-print-actions new-sample-label-modal-actions">
              {labelModalStep === 'review' ? (
                <>
                  <button
                    ref={modalPrimaryActionRef}
                    type="button"
                    className="new-sample-label-action-confirm"
                    disabled={submitting}
                    onClick={() => void handleConfirmDraft()}
                  >
                    {submitting ? 'Criando...' : 'Confirmar'}
                  </button>
                  <button type="button" className="new-sample-label-action-edit" disabled={submitting} onClick={closeLabelModal}>
                    Editar
                  </button>
                </>
              ) : null}

              {labelModalStep === 'completed' ? (
                <>
                  <button ref={modalPrimaryActionRef} type="button" className="new-sample-label-action-new" onClick={resetDraft}>
                    Nova amostra
                  </button>
                  {printableSample ? (
                    <Link href={`/samples/${printableSample.id}`} className="new-sample-link-button new-sample-label-action-details">
                      Ver detalhes
                    </Link>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <ClientQuickCreateModal
        session={session}
        open={quickCreateOpen}
        title="Cadastro rapido de proprietario"
        description="Crie o cliente do proprietario sem sair do fluxo da nova amostra."
        initialSearch={quickCreateSeed}
        initialPersonType="PJ"
        initialIsSeller
        initialIsBuyer={false}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(client) => {
          setQuickCreateOpen(false);
          setSelectedOwnerClient(client);
          setOwner(client.displayName ?? '');
          setSelectedOwnerRegistrationId(null);
          clearRequiredFieldError('owner');
          setMessage('Cliente criado e selecionado para a amostra.');
        }}
      />
    </AppShell>
  );
}

export default function NewSamplePage() {
  return (
    <Suspense fallback={null}>
      <NewSamplePageContent />
    </Suspense>
  );
}
