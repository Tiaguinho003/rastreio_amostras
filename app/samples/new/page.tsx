'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { flushSync } from 'react-dom';

import { AppShell } from '../../../components/AppShell';
import { ClientLookupField } from '../../../components/clients/ClientLookupField';
import { ClientQuickCreateModal } from '../../../components/clients/ClientQuickCreateModal';
import { ClientRegistrationSelect } from '../../../components/clients/ClientRegistrationSelect';
import {
  ApiError,
  createSampleAndPreparePrint,
  getClient,
  recordQrPrintFailed,
  recordQrPrinted,
  requestQrReprint
} from '../../../lib/api-client';
import { createSampleDraftSchema, qrFailSchema } from '../../../lib/form-schemas';
import { clearPendingArrivalPhoto, readPendingArrivalPhoto } from '../../../lib/mobile-camera-photo-store';
import type {
  ClientRegistrationSummary,
  ClientSummary,
  CreateSampleAndPreparePrintResponse,
  PrintAction
} from '../../../lib/types';
import { useRequireAuth } from '../../../lib/use-auth';

function buildDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const HARVEST_PRESET_OPTIONS = ['24/25', '25/26'] as const;
const REQUIRED_FIELD_MESSAGE = 'Obrigatório';
const TECHNICAL_PRINT_ERROR = 'Falha tecnica ao disparar a impressao automatica.';

type RequiredFieldName = 'owner' | 'sacks' | 'harvest' | 'originLot';
type RequiredFieldErrors = Record<RequiredFieldName, string | null>;
type LabelModalStep = 'review' | 'awaiting_print_result' | 'failure_reason' | 'failure_actions' | 'completed';
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

interface ActivePrintAttempt {
  printAction: PrintAction;
  attemptNumber: number;
  printerId: string | null;
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

function readPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function readPrintContextFromCreateResult(result: CreateSampleAndPreparePrintResponse): ActivePrintAttempt | null {
  if (result.print && result.print.status === 'PENDING') {
    return {
      printAction: result.print.printAction,
      attemptNumber: result.print.attemptNumber,
      printerId: result.print.printerId ?? null
    };
  }

  if (!result.event) {
    return null;
  }

  if (result.event.eventType !== 'QR_PRINT_REQUESTED' && result.event.eventType !== 'QR_REPRINT_REQUESTED') {
    return null;
  }

  const payload = result.event.payload ?? {};
  const attemptNumber = readPositiveInteger(payload.attemptNumber);
  if (!attemptNumber) {
    return null;
  }

  const rawAction = typeof payload.printAction === 'string' ? payload.printAction.toUpperCase() : null;
  if (rawAction !== 'PRINT' && rawAction !== 'REPRINT') {
    return null;
  }

  return {
    printAction: rawAction,
    attemptNumber,
    printerId: typeof payload.printerId === 'string' ? payload.printerId : null
  };
}

function buildModalTitle(step: LabelModalStep) {
  if (step === 'review') {
    return 'Confirme os dados da amostra';
  }

  if (step === 'awaiting_print_result') {
    return 'Impressao em andamento';
  }

  if (step === 'failure_reason') {
    return 'Registrar falha de impressao';
  }

  if (step === 'failure_actions') {
    return 'Falha registrada';
  }

  return 'Impressao confirmada';
}

function extractCauseMessage(cause: unknown) {
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }

  return TECHNICAL_PRINT_ERROR;
}

function NewSamplePageContent() {
  const { session, loading, logout } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [clientDraftId, setClientDraftId] = useState(() => buildDraftId());
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
  const [arrivalPhotoReady, setArrivalPhotoReady] = useState(false);
  const [currentStep, setCurrentStep] = useState<NewSampleStep>('photo');
  const [harvestOptionsOpen, setHarvestOptionsOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requiredFieldErrors, setRequiredFieldErrors] = useState<RequiredFieldErrors>(EMPTY_REQUIRED_FIELD_ERRORS);

  const [pendingDraft, setPendingDraft] = useState<PendingDraftPayload | null>(null);
  const [created, setCreated] = useState<CreateSampleAndPreparePrintResponse | null>(null);
  const [activePrintAttempt, setActivePrintAttempt] = useState<ActivePrintAttempt | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelModalStep, setLabelModalStep] = useState<LabelModalStep>('review');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [printFailureReason, setPrintFailureReason] = useState('');
  const [lastFailureReason, setLastFailureReason] = useState<string | null>(null);

  const arrivalPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const ownerInputRef = useRef<HTMLInputElement | null>(null);
  const sacksInputRef = useRef<HTMLInputElement | null>(null);
  const harvestInputRef = useRef<HTMLInputElement | null>(null);
  const harvestFieldRef = useRef<HTMLDivElement | null>(null);
  const originLotInputRef = useRef<HTMLInputElement | null>(null);
  const stageBodyRef = useRef<HTMLDivElement | null>(null);
  const confirmPhotoEffectTimeoutRef = useRef<number | null>(null);
  const printConfirmEffectTimeoutRef = useRef<number | null>(null);
  const invalidFocusTimeoutRef = useRef<number | null>(null);
  const labelModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalPrimaryActionRef = useRef<HTMLButtonElement | null>(null);
  const lastCreateButtonRef = useRef<HTMLButtonElement | null>(null);
  const pageMountedRef = useRef(true);
  const cameraHydrationRequestRef = useRef(0);

  const [showPhotoConfirmEffect, setShowPhotoConfirmEffect] = useState(false);
  const [photoConfirmEffectKey, setPhotoConfirmEffectKey] = useState(0);
  const [showPrintConfirmEffect, setShowPrintConfirmEffect] = useState(false);
  const [printConfirmEffectKey, setPrintConfirmEffectKey] = useState(0);
  const [arrivalPhotoSource, setArrivalPhotoSource] = useState<'camera' | 'manual' | null>(null);
  const [activeCameraHandoffId, setActiveCameraHandoffId] = useState<string | null>(null);

  const printableSample = useMemo(() => created?.sample ?? null, [created]);
  const canCloseModal = labelModalStep === 'review';
  const cameraSourceParam = searchParams.get('source');
  const cameraHandoffParam = searchParams.get('handoff');

  function clearCameraHandoffRouteState() {
    if (cameraSourceParam === 'camera' || cameraHandoffParam) {
      console.info('NEW_SAMPLE_ROUTE_CLEAR', {
        source: cameraSourceParam,
        handoff: cameraHandoffParam
      });
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
    console.info('NEW_SAMPLE_ROUTE_STATE', {
      source: cameraSourceParam,
      handoff: cameraHandoffParam,
      activeCameraHandoffId,
      hydrationRequest: cameraHydrationRequestRef.current
    });
  }, [activeCameraHandoffId, cameraHandoffParam, cameraSourceParam]);

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
        if (!activeRegistrations.some((registration) => registration.id === selectedOwnerRegistrationId)) {
          setSelectedOwnerRegistrationId(null);
        }
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
    console.info('NEW_SAMPLE_APPLY', {
      arrivalPhoto: Boolean(arrivalPhoto),
      arrivalPhotoReady,
      arrivalPhotoSource,
      activeCameraHandoffId,
      previewUrl: Boolean(arrivalPhotoPreviewUrl)
    });
  }, [activeCameraHandoffId, arrivalPhoto, arrivalPhotoPreviewUrl, arrivalPhotoReady, arrivalPhotoSource]);

  useEffect(() => {
    return () => {
      if (confirmPhotoEffectTimeoutRef.current !== null) {
        window.clearTimeout(confirmPhotoEffectTimeoutRef.current);
      }

      if (printConfirmEffectTimeoutRef.current !== null) {
        window.clearTimeout(printConfirmEffectTimeoutRef.current);
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
    console.info('NEW_SAMPLE_READ_START', { handoffId: cameraHandoffParam });

    void readPendingArrivalPhoto(cameraHandoffParam)
      .then((photo) => {
        if (!pageMountedRef.current || cameraHydrationRequestRef.current !== requestId) {
          console.warn('NEW_SAMPLE_READ_ABORTED', { handoffId: cameraHandoffParam, requestId });
          return;
        }

        if (!photo) {
          console.warn('NEW_SAMPLE_READ_RESULT', { handoffId: cameraHandoffParam, found: false });
          setError('A foto capturada nao estava mais disponivel. Continue com o registro manualmente.');
          clearCameraHandoffRouteState();
          return;
        }

        console.info('NEW_SAMPLE_READ_RESULT', {
          handoffId: photo.handoffId,
          found: true,
          confirmed: photo.confirmed,
          fileName: photo.file.name,
          fileSize: photo.file.size
        });
        setArrivalPhoto(photo.file);
        setArrivalPhotoReady(photo.confirmed);
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
          console.warn('NEW_SAMPLE_READ_ABORTED', { handoffId: cameraHandoffParam, phase: 'catch', requestId });
          return;
        }

        console.error('NEW_SAMPLE_READ_ERROR', { handoffId: cameraHandoffParam });
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

  function clearPrintConfirmEffect() {
    if (printConfirmEffectTimeoutRef.current !== null) {
      window.clearTimeout(printConfirmEffectTimeoutRef.current);
      printConfirmEffectTimeoutRef.current = null;
    }
    setShowPrintConfirmEffect(false);
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

  function triggerPrintConfirmEffect() {
    setPrintConfirmEffectKey((current) => current + 1);
    setShowPrintConfirmEffect(true);

    if (printConfirmEffectTimeoutRef.current !== null) {
      window.clearTimeout(printConfirmEffectTimeoutRef.current);
    }

    printConfirmEffectTimeoutRef.current = window.setTimeout(() => {
      setShowPrintConfirmEffect(false);
      printConfirmEffectTimeoutRef.current = null;
    }, 980);
  }

  function clearArrivalPhoto() {
    if (activeCameraHandoffId) {
      void clearPendingArrivalPhoto(activeCameraHandoffId);
    }

    console.info('NEW_SAMPLE_REMOVE_PHOTO', { activeCameraHandoffId, arrivalPhotoSource });
    clearCameraHandoffRouteState();
    setArrivalPhoto(null);
    setArrivalPhotoReady(false);
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
    console.info('NEW_SAMPLE_RESET', { activeCameraHandoffId });
    clearCameraHandoffRouteState();
    setClientDraftId(buildDraftId());
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
    setCurrentStep('photo');
    setHarvestOptionsOpen(false);
    setArrivalPhotoSource(null);
    setActiveCameraHandoffId(null);
    cameraHydrationRequestRef.current += 1;
    clearConfirmPhotoEffect();
    clearPrintConfirmEffect();
    setPendingDraft(null);
    setLabelModalOpen(false);
    setLabelModalStep('review');
    setCreated(null);
    setActivePrintAttempt(null);
    setPrintFailureReason('');
    setLastFailureReason(null);
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

  async function triggerBrowserPrint() {
    if (typeof window.print !== 'function') {
      throw new Error('Navegador sem suporte a impressao.');
    }

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    document.body.classList.add('print-label-mode');
    try {
      window.print();
    } catch (cause) {
      document.body.classList.remove('print-label-mode');
      throw cause;
    }
  }

  async function registerPrintFailure(
    sampleId: string,
    attempt: ActivePrintAttempt,
    reasonText: string,
    moveToFailureActions = true
  ) {
    if (!session) {
      throw new Error('Sessao invalida para registrar falha de impressao.');
    }

    await recordQrPrintFailed(session, sampleId, {
      printAction: attempt.printAction,
      attemptNumber: attempt.attemptNumber,
      printerId: attempt.printerId,
      error: reasonText
    });

    if (moveToFailureActions) {
      setLabelModalStep('failure_actions');
      setModalMessage('Falha registrada. Voce pode sair ou tentar novamente.');
      setModalError(null);
    }
  }

  async function handleAutomaticPrint(sampleId: string, attempt: ActivePrintAttempt) {
    try {
      await triggerBrowserPrint();
    } catch (cause) {
      const technicalMessage = `${TECHNICAL_PRINT_ERROR} ${extractCauseMessage(cause)}`;
      await registerPrintFailure(sampleId, attempt, technicalMessage);
    }
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

    setPrintFailureReason('');
    setLastFailureReason(null);
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

      if (activeCameraHandoffId) {
        await clearPendingArrivalPhoto(activeCameraHandoffId);
        setActiveCameraHandoffId(null);
      }
      console.info('NEW_SAMPLE_CREATE_SUCCESS', {
        activeCameraHandoffId,
        hadArrivalPhoto: Boolean(pendingDraft.arrivalPhoto)
      });
      clearCameraHandoffRouteState();

      const attempt = readPrintContextFromCreateResult(result);
      if (!attempt) {
        throw new Error('Nao foi possivel identificar a tentativa ativa de impressao.');
      }

      flushSync(() => {
        setCreated(result);
        setActivePrintAttempt(attempt);
        setLabelModalStep('awaiting_print_result');
        setModalMessage(`Impressao enviada (tentativa ${attempt.attemptNumber}). Confirme o resultado abaixo.`);
      });

      await handleAutomaticPrint(result.sample.id, attempt);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setModalError(cause.message);
      } else {
        setModalError(extractCauseMessage(cause));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmPrint() {
    if (!session || !created || !activePrintAttempt) {
      return;
    }

    setSubmitting(true);
    setModalError(null);
    setModalMessage(null);

    try {
      await recordQrPrinted(session, created.sample.id, {
        expectedVersion: created.sample.version,
        printAction: activePrintAttempt.printAction,
        attemptNumber: activePrintAttempt.attemptNumber,
        printerId: activePrintAttempt.printerId
      });

      const shouldMutateSample = created.sample.status === 'QR_PENDING_PRINT';
      setCreated((current) => {
        if (!current) {
          return current;
        }

        if (!shouldMutateSample) {
          return current;
        }

        return {
          ...current,
          sample: {
            ...current.sample,
            status: 'QR_PRINTED',
            version: current.sample.version + 1
          }
        };
      });

      triggerPrintConfirmEffect();
      setLabelModalStep('completed');
      setModalMessage('Impressao confirmada.');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setModalError(cause.message);
      } else {
        setModalError('Falha ao confirmar impressao');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenFailureReason() {
    setModalError(null);
    setModalMessage(null);
    setPrintFailureReason('');
    setLabelModalStep('failure_reason');
  }

  async function handleRegisterFailure() {
    if (!created || !activePrintAttempt) {
      return;
    }

    const parsed = qrFailSchema.safeParse({ error: printFailureReason });
    if (!parsed.success) {
      setModalError(parsed.error.issues[0]?.message ?? 'Descreva a falha de impressao');
      return;
    }

    setSubmitting(true);
    setModalError(null);
    setModalMessage(null);

    try {
      await registerPrintFailure(created.sample.id, activePrintAttempt, parsed.data.error);
      setLastFailureReason(parsed.data.error);
      setPrintFailureReason('');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setModalError(cause.message);
      } else {
        setModalError('Falha ao registrar erro de impressao');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryPrint() {
    if (!session || !created || !activePrintAttempt) {
      return;
    }

    setSubmitting(true);
    setModalError(null);
    setModalMessage(null);

    try {
      const retry = await requestQrReprint(session, created.sample.id, {
        printerId: activePrintAttempt.printerId,
        reasonText: lastFailureReason
      });

      const payload = retry.event.payload ?? {};
      const attemptNumber = readPositiveInteger(payload.attemptNumber);
      if (!attemptNumber) {
        throw new Error('Tentativa de reimpressao invalida.');
      }

      const nextAttempt: ActivePrintAttempt = {
        printAction: 'REPRINT',
        attemptNumber,
        printerId: typeof payload.printerId === 'string' ? payload.printerId : activePrintAttempt.printerId
      };

      setActivePrintAttempt(nextAttempt);
      setLabelModalStep('awaiting_print_result');
      setModalMessage(`Reimpressao enviada (tentativa ${nextAttempt.attemptNumber}). Confirme o resultado abaixo.`);

      await handleAutomaticPrint(created.sample.id, nextAttempt);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setModalError(cause.message);
      } else {
        setModalError(extractCauseMessage(cause));
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
                        if (activeCameraHandoffId) {
                          void clearPendingArrivalPhoto(activeCameraHandoffId);
                        }
                        console.info('NEW_SAMPLE_MANUAL_REPLACE', {
                          previousHandoffId: activeCameraHandoffId,
                          hasFile: Boolean(event.target.files?.[0])
                        });
                        clearCameraHandoffRouteState();
                        setArrivalPhoto(event.target.files?.[0] ?? null);
                        setArrivalPhotoReady(false);
                        setArrivalPhotoSource(event.target.files?.[0] ? 'manual' : null);
                        setActiveCameraHandoffId(null);
                        cameraHydrationRequestRef.current += 1;
                        clearConfirmPhotoEffect();
                        setError(null);
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
                          placeholder={requiredFieldErrors.harvest ? requiredFieldErrors.harvest : 'Ex: 25/26'}
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

            {labelModalStep === 'failure_reason' ? (
              <div className="new-sample-label-modal-content">
                <article className="panel stack new-sample-failure-panel">
                  <p style={{ margin: 0, color: 'var(--muted)' }}>
                    Informe o motivo da falha para registrar a tentativa de impressao.
                  </p>
                  <label>
                    Motivo da falha
                    <textarea
                      rows={3}
                      value={printFailureReason}
                      onChange={(event) => setPrintFailureReason(event.target.value)}
                      placeholder="Ex: etiqueta saiu ilegivel"
                      disabled={submitting}
                    />
                  </label>
                </article>
              </div>
            ) : (
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

                  {showPrintConfirmEffect ? (
                    <span key={printConfirmEffectKey} className="new-sample-print-confirm-fx" aria-hidden="true">
                      <span className="new-sample-print-confirm-glow" />
                      <span className="new-sample-print-confirm-ring" />
                      <span className="new-sample-print-confirm-badge">
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                          <path d="m5 12.5 4.3 4.2L19 7" />
                        </svg>
                      </span>
                      <span className="new-sample-print-spark new-sample-print-spark-a" />
                      <span className="new-sample-print-spark new-sample-print-spark-b" />
                      <span className="new-sample-print-spark new-sample-print-spark-c" />
                      <span className="new-sample-print-spark new-sample-print-spark-d" />
                      <span className="new-sample-print-spark new-sample-print-spark-e" />
                    </span>
                  ) : null}
                </article>
              </div>
            )}

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
                    {submitting ? 'Confirmando...' : 'Confirmar'}
                  </button>
                  <button type="button" className="new-sample-label-action-edit" disabled={submitting} onClick={closeLabelModal}>
                    Editar
                  </button>
                </>
              ) : null}

              {labelModalStep === 'awaiting_print_result' ? (
                <>
                  <button
                    ref={modalPrimaryActionRef}
                    type="button"
                    className="new-sample-label-action-confirm"
                    disabled={submitting}
                    onClick={() => void handleConfirmPrint()}
                  >
                    {submitting ? 'Confirmando...' : 'Confirmar impressao'}
                  </button>
                  <button
                    type="button"
                    className="new-sample-label-action-failure"
                    disabled={submitting}
                    onClick={handleOpenFailureReason}
                  >
                    Falha na impressao
                  </button>
                </>
              ) : null}

              {labelModalStep === 'failure_reason' ? (
                <>
                  <button
                    ref={modalPrimaryActionRef}
                    type="button"
                    className="new-sample-label-action-failure"
                    disabled={submitting}
                    onClick={() => void handleRegisterFailure()}
                  >
                    {submitting ? 'Registrando...' : 'Registrar falha'}
                  </button>
                  <button
                    type="button"
                    className="new-sample-label-action-edit"
                    disabled={submitting}
                    onClick={() => setLabelModalStep('awaiting_print_result')}
                  >
                    Voltar
                  </button>
                </>
              ) : null}

              {labelModalStep === 'failure_actions' ? (
                <>
                  <button
                    ref={modalPrimaryActionRef}
                    type="button"
                    className="new-sample-label-action-confirm"
                    disabled={submitting}
                    onClick={() => void handleRetryPrint()}
                  >
                    {submitting ? 'Enviando...' : 'Tentar novamente'}
                  </button>
                  <button
                    type="button"
                    className="new-sample-label-action-edit"
                    disabled={submitting}
                    onClick={() => router.push('/dashboard')}
                  >
                    Sair
                  </button>
                </>
              ) : null}

              {labelModalStep === 'completed' ? (
                <>
                  <button ref={modalPrimaryActionRef} type="button" className="new-sample-label-action-new" onClick={resetDraft}>
                    Nova amostra
                  </button>
                  <button type="button" className="new-sample-label-action-edit" onClick={() => router.push('/dashboard')}>
                    Fechar
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
