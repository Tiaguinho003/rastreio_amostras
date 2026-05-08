'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { SampleLookupResultModal } from '../../components/SampleLookupResultModal';
import { ClassificationExtractionErrorModal } from '../../components/samples/ClassificationExtractionErrorModal';
import { ClassificationManualConfirmModal } from '../../components/samples/ClassificationManualConfirmModal';
import { ClassificationReviewModal } from '../../components/samples/ClassificationReviewModal';
import { ClassificationTypeModal } from '../../components/samples/ClassificationTypeModal';
import {
  ApiError,
  type JsonValue,
  detectClassificationForm,
  extractAndPrepareClassification,
  extractFromDetectedForm,
  confirmClassificationFromCamera,
  lookupUsersForReference,
  resolveSampleByLot,
  resolveSampleByQr,
  getSampleDetail,
} from '../../lib/api-client';
import { compressImage, isHighQualityEnabled, pickQualityFromEnv } from '../../lib/compress-image';
import {
  type ClassificationFormState,
  EMPTY_CLASSIFICATION_FORM,
  mapExtractionToForm,
  validateClassificationForm,
  buildClassificationDataPayload,
  getTypeConfig,
} from '../../lib/classification-form';
import {
  compareIdentification,
  type IdentificationDivergence,
  type IdentificationField,
} from '../../lib/sample-identification';
import type {
  ClassificationType,
  ClassifierSnapshot,
  ExtractAndPrepareResponse,
  ResolveSampleByLotResponse,
  ResolveSampleByQrResponse,
  UserLookupItem,
} from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { useFocusTrap } from '../../lib/use-focus-trap';

type QrScannerClass = typeof import('qr-scanner').default;
type QrScannerInstance = InstanceType<QrScannerClass>;

type ClassificationFlowState =
  | 'idle'
  | 'preview'
  | 'selecting-type'
  | 'selecting-classifier'
  | 'detecting'
  | 'detected'
  | 'detect-failed'
  | 'extracting'
  // Q.cls.2 sub-caminhos 3a/3b: avisos de erro da IA. Substituem o
  // estado 'error' generico antigo. 'illegible' = lote=null apos
  // extracao OK; 'technical' = catch (timeout, OpenAI offline, network).
  | 'extraction-error-illegible'
  | 'extraction-error-technical'
  // Q.cls.2 sub-caminho 3b → 2o modal: confirma "preencher manualmente"
  // antes de abrir o ReviewModal em modo manual.
  | 'manual-confirm'
  | 'confirming'
  | 'resolving'
  | 'overwrite-confirm'
  | 'not-found'
  | 'lot-mismatch'
  | 'data-mismatch'
  | 'submitting'
  | 'success';

type MismatchChoice = 'extracted' | 'stored';

const DEFAULT_STATUS_MESSAGE = 'Aponte para um QR code ou tire uma foto da ficha.';
const REPEATED_SCAN_WINDOW_MS = 1800;

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function isPermissionLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return /permission|notallowed|denied|secure context/i.test(error.message);
}

function normalizeLot(lot: string | null | undefined): string {
  return (lot ?? '').trim().toUpperCase();
}

// --- Main Camera Page ---

function CameraPageContent() {
  const { session, loading, logout, setSession } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Context mode: if sampleId is in URL, we're in "with-context" mode (Flow B)
  const contextSampleId = searchParams.get('sampleId');
  const hasContext = Boolean(contextSampleId);

  // QR Scanner refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const scannerClassRef = useRef<QrScannerClass | null>(null);
  const scannerRef = useRef<QrScannerInstance | null>(null);
  const sessionRef = useRef(session);
  const restartScannerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const restartTimeoutRef = useRef<number | null>(null);
  const handledScanRef = useRef<{ value: string; at: number } | null>(null);
  const resolvingScanRef = useRef(false);
  const mountedRef = useRef(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // QR Scanner state
  const [cameraStatus, setCameraStatus] = useState<
    'idle' | 'starting' | 'scanning' | 'permission-denied' | 'unsupported'
  >('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(DEFAULT_STATUS_MESSAGE);
  const [captureFlashKey, setCaptureFlashKey] = useState(0);

  // QR result modal
  const [result, setResult] = useState<ResolveSampleByQrResponse | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  // Classification flow state
  const [flowState, setFlowState] = useState<ClassificationFlowState>('idle');
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<ExtractAndPrepareResponse | null>(null);
  const [classificationForm, setClassificationForm] =
    useState<ClassificationFormState>(EMPTY_CLASSIFICATION_FORM);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [confirmedSampleId, setConfirmedSampleId] = useState<string | null>(null);

  // Context sample (Flow B)
  const [contextSampleLot, setContextSampleLot] = useState<string | null>(null);
  const [contextSampleStatus, setContextSampleStatus] = useState<string | null>(null);
  const [contextSampleSacks, setContextSampleSacks] = useState<number | null>(null);
  const [contextSampleHarvest, setContextSampleHarvest] = useState<string | null>(null);
  const [detectedPhotoToken, setDetectedPhotoToken] = useState<string | null>(null);

  // Classification type selection
  const [classificationType, setClassificationType] = useState<ClassificationType | null>(null);

  // Classifier phase (etapa do modal apos selecao de tipo): multi-select de
  // co-classificadores. O user atual e auto-incluido (chip fixo, sempre
  // presente no array final enviado ao backend).
  const [coClassifiers, setCoClassifiers] = useState<ClassifierSnapshot[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userPickerSearch, setUserPickerSearch] = useState('');
  const [userPickerError, setUserPickerError] = useState<string | null>(null);

  // Lote editavel (Flow A sempre; Flow B so em modo manual). Sacas/safra
  // editaveis apenas em modo manual (sub-caminho 3b apos confirmacao).
  const [editableLot, setEditableLot] = useState('');
  const [editableSacks, setEditableSacks] = useState('');
  const [editableHarvest, setEditableHarvest] = useState('');
  // Q.cls.2 sub-caminho 3b: modo manual e ativado quando a extracao
  // falha tecnicamente e o operador confirma "Preencher manualmente".
  // Faz lote/sacas/safra editaveis no ReviewModal e permite reativar
  // cross-validation se ele editar pra valor diferente do sample.
  const [manualMode, setManualMode] = useState(false);

  // Resolve result (Flow A)
  const [resolvedSample, setResolvedSample] = useState<ResolveSampleByLotResponse['sample'] | null>(
    null
  );

  // Data mismatch (sacas/safra divergem do cadastro)
  const [mismatchDivergences, setMismatchDivergences] = useState<IdentificationDivergence[]>([]);
  const [mismatchChoices, setMismatchChoices] = useState<
    Record<IdentificationField, MismatchChoice>
  >({} as Record<IdentificationField, MismatchChoice>);
  const [mismatchTargetSampleId, setMismatchTargetSampleId] = useState<string | null>(null);
  const [mismatchOverwriteAfter, setMismatchOverwriteAfter] = useState<boolean>(false);

  const scannerBlocked = resultModalOpen || flowState !== 'idle';
  const showStatusText = Boolean(cameraError) || cameraStatus !== 'scanning';

  // --- Lifecycle ---

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Load context sample lot (Flow B)
  useEffect(() => {
    if (!contextSampleId || !session) return;
    let cancelled = false;
    getSampleDetail(session, contextSampleId)
      .then((detail) => {
        if (!cancelled && detail?.sample) {
          setContextSampleLot(detail.sample.internalLotNumber ?? null);
          setContextSampleStatus(detail.sample.status);
          setContextSampleSacks(detail.sample.declared?.sacks ?? null);
          setContextSampleHarvest(detail.sample.declared?.harvest ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contextSampleId, session]);

  // Cleanup captured photo URL
  useEffect(() => {
    return () => {
      if (capturedPhotoUrl) {
        URL.revokeObjectURL(capturedPhotoUrl);
      }
    };
  }, [capturedPhotoUrl]);

  // Escape key for modals
  useEffect(() => {
    if (!resultModalOpen && flowState === 'idle') return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (resultModalOpen) {
        setResultModalOpen(false);
      } else if (
        flowState === 'preview' ||
        flowState === 'not-found' ||
        flowState === 'lot-mismatch' ||
        flowState === 'data-mismatch'
      ) {
        resetClassificationFlow();
      } else if (flowState === 'confirming' || flowState === 'overwrite-confirm') {
        resetClassificationFlow();
      }
      // 'extraction-error-illegible' / 'extraction-error-technical' /
      // 'manual-confirm' tem tratamento de ESC dentro dos proprios modais.
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
    // resetClassificationFlow e funcao local nao memoizada; effect reage so a flow/modal state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultModalOpen, flowState]);

  // --- Scanner functions ---

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const stopScanner = useCallback(() => {
    clearRestartTimeout();
    if (scannerRef.current) {
      scannerRef.current.stop();
      setCameraStatus((current) =>
        current === 'unsupported' || current === 'permission-denied' ? current : 'idle'
      );
    }
  }, [clearRestartTimeout]);

  const destroyScanner = useCallback(() => {
    clearRestartTimeout();
    if (scannerRef.current) {
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
  }, [clearRestartTimeout]);

  const scheduleScannerRestart = useCallback(
    (delayMs = 900) => {
      clearRestartTimeout();
      restartTimeoutRef.current = window.setTimeout(() => {
        restartTimeoutRef.current = null;
        if (!mountedRef.current || scannerBlocked) return;
        void restartScannerRef.current();
      }, delayMs);
    },
    [clearRestartTimeout, scannerBlocked]
  );

  const handleResolvedSample = useCallback((resolved: ResolveSampleByQrResponse) => {
    setResult(resolved);
    setResultModalOpen(true);
    setCameraError(null);
    setStatusMessage('Amostra localizada. Confira a etiqueta antes de continuar.');
  }, []);

  const handleDecodedQr = useCallback(
    async (rawValue: string) => {
      const normalizedValue = rawValue.trim();
      if (!normalizedValue || resolvingScanRef.current) return;

      const previousScan = handledScanRef.current;
      const now = Date.now();
      if (
        previousScan &&
        previousScan.value === normalizedValue &&
        now - previousScan.at < REPEATED_SCAN_WINDOW_MS
      )
        return;

      handledScanRef.current = { value: normalizedValue, at: now };
      resolvingScanRef.current = true;

      stopScanner();
      setCameraError(null);
      setStatusMessage('QR lido. Validando a amostra...');

      try {
        const currentSession = sessionRef.current;
        if (!currentSession) return;

        const resolved = await resolveSampleByQr(currentSession, normalizedValue);
        if (!mountedRef.current) return;
        handleResolvedSample(resolved);
      } catch (error) {
        if (!mountedRef.current) return;
        setCameraError(readErrorMessage(error, 'Falha ao localizar a amostra.'));
        setStatusMessage('Nao foi possivel confirmar este QR. Tente novamente.');
        scheduleScannerRestart();
      } finally {
        resolvingScanRef.current = false;
      }
    },
    [handleResolvedSample, scheduleScannerRestart, stopScanner]
  );

  const ensureScannerStarted = useCallback(async () => {
    if (!mountedRef.current || scannerBlocked || !videoRef.current || !sessionRef.current) return;

    clearRestartTimeout();
    setCameraError(null);
    setCameraStatus('starting');
    setStatusMessage(DEFAULT_STATUS_MESSAGE);

    try {
      if (!scannerClassRef.current) {
        const qrScannerModule = await import('qr-scanner');
        scannerClassRef.current = qrScannerModule.default;
      }

      const QrScanner = scannerClassRef.current;
      if (!(await QrScanner.hasCamera())) {
        setCameraStatus('unsupported');
        setStatusMessage(
          'Nenhuma camera disponivel neste dispositivo. Use a galeria pra selecionar uma foto.'
        );
        return;
      }

      // Fase Q.cls.2: força câmera traseira. Sem traseira (devices sem
      // câmera traseira ou desktops com webcam frontal) → cai no fallback
      // de galeria. Teste explícito porque QrScanner.hasCamera() acima
      // só verifica se há *alguma* câmera, sem distinguir traseira/frontal.
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' } },
        });
        testStream.getTracks().forEach((track) => track.stop());
      } catch (testError) {
        if (testError instanceof DOMException && testError.name === 'OverconstrainedError') {
          if (!mountedRef.current) return;
          setCameraStatus('unsupported');
          setCameraError('Camera traseira nao disponivel neste dispositivo.');
          setStatusMessage('Use a galeria pra selecionar uma foto.');
          return;
        }
        // Outras falhas (NotAllowedError, NotReadableError etc.) propagam
        // pro catch externo, que classifica como permission-denied/unsupported.
        throw testError;
      }

      if (!scannerRef.current) {
        scannerRef.current = new QrScanner(
          videoRef.current,
          (decoded) => {
            void handleDecodedQr(decoded.data);
          },
          {
            preferredCamera: 'environment',
            maxScansPerSecond: 12,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            overlay: overlayRef.current ?? undefined,
            returnDetailedScanResult: true,
            onDecodeError: () => {},
          }
        );
      }

      await scannerRef.current.start();
      if (!mountedRef.current) return;
      setCameraStatus('scanning');
      setStatusMessage(DEFAULT_STATUS_MESSAGE);
    } catch (error) {
      if (!mountedRef.current) return;
      const denied = isPermissionLikeError(error);
      setCameraStatus(denied ? 'permission-denied' : 'unsupported');
      setCameraError(readErrorMessage(error, 'Falha ao abrir a camera.'));
      setStatusMessage(
        denied
          ? 'Camera bloqueada. Use a galeria pra selecionar uma foto, ou habilite a camera nas configuracoes do navegador.'
          : 'Camera nao disponivel. Use a galeria pra selecionar uma foto.'
      );
    }
  }, [clearRestartTimeout, handleDecodedQr, scannerBlocked]);

  useEffect(() => {
    restartScannerRef.current = ensureScannerStarted;
  }, [ensureScannerStarted]);

  useEffect(() => {
    if (loading || !session) return;
    if (scannerBlocked) {
      stopScanner();
      return;
    }
    void ensureScannerStarted();
    return () => {
      stopScanner();
    };
  }, [ensureScannerStarted, loading, scannerBlocked, session, stopScanner]);

  useEffect(() => {
    return () => {
      destroyScanner();
    };
  }, [destroyScanner]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // --- Classification flow functions ---

  function resetClassificationFlow() {
    setFlowState('idle');
    setCapturedPhoto(null);
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
      setCapturedPhotoUrl(null);
    }
    setExtractionResult(null);
    setClassificationForm(EMPTY_CLASSIFICATION_FORM);
    setClassificationType(null);
    setCoClassifiers([]);
    setAvailableUsers([]);
    setUserPickerSearch('');
    setUserPickerError(null);
    setFlowError(null);
    setConfirmedSampleId(null);
    setEditableLot('');
    setEditableSacks('');
    setEditableHarvest('');
    setManualMode(false);
    setResolvedSample(null);
    setMismatchDivergences([]);
    setMismatchChoices({} as Record<IdentificationField, MismatchChoice>);
    setMismatchTargetSampleId(null);
    setMismatchOverwriteAfter(false);
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  }

  // Q.cls.2 sub-caminho 3b: confirma o modo manual depois do
  // ManualConfirmModal. Pre-preenche editableLot/Sacks/Harvest com os
  // valores do sample em context (Flow B); reseta o ExtractionResult
  // existente (que poderia ser parcial) e abre o ReviewModal.
  function startManualMode() {
    setManualMode(true);
    setEditableLot(contextSampleLot ?? '');
    setEditableSacks(contextSampleSacks?.toString() ?? '');
    setEditableHarvest(contextSampleHarvest ?? '');
    setExtractionResult(null);
    setClassificationForm(EMPTY_CLASSIFICATION_FORM);
    setFlowError(null);
    setFlowState('confirming');
  }

  async function captureFromVideoStream() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    setCaptureFlashKey((key) => key + 1);
    navigator.vibrate?.(40);

    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0);

    const quality = pickQualityFromEnv({ highQualityEnabled: isHighQualityEnabled() });
    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });

    if (blob) {
      const file = new File([blob], `classificacao-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      handlePhotoSelected(file);
    }
  }

  function handlePhotoSelected(file: File | null) {
    if (!file) return;

    const MAX_SIZE = 12 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setCameraError('A foto excede o limite de 12 MB.');
      return;
    }

    stopScanner();
    setCameraError(null);
    setCapturedPhoto(file);
    setCapturedPhotoUrl(URL.createObjectURL(file));
    setFlowState('preview');
  }

  async function loadAvailableUsersOnce() {
    if (!session) return;
    if (availableUsers.length > 0) return;
    setLoadingUsers(true);
    setUserPickerError(null);
    try {
      const response = await lookupUsersForReference(session, {
        excludeUserId: session.user.id,
        limit: 300,
      });
      if (!mountedRef.current) return;
      setAvailableUsers(response.items);
    } catch (error) {
      if (!mountedRef.current) return;
      setUserPickerError(
        readErrorMessage(error, 'Nao foi possivel carregar a lista de classificadores.')
      );
    } finally {
      if (mountedRef.current) setLoadingUsers(false);
    }
  }

  function toggleCoClassifier(user: UserLookupItem) {
    setCoClassifiers((prev) => {
      const exists = prev.find((entry) => entry.id === user.id);
      if (exists) {
        return prev.filter((entry) => entry.id !== user.id);
      }
      return [...prev, { id: user.id, fullName: user.fullName, username: user.username }];
    });
  }

  // Q.cls.2.8: tipo selecionado DEPOIS da extracao. Continuar do modal de
  // classificadores dispara o save direto (a IA ja rodou, o tipo e o
  // classifier ja estao escolhidos). User atual sempre implicito;
  // co-classificadores opcionais.
  function handleClassifierContinue() {
    if (!classificationType) return;
    void handleConfirmClassification();
  }

  // Q.cls.2.8: handleSendPhoto roda assim que o operador clica "Enviar"
  // no preview da foto. NAO recebe mais tipo — IA e type-agnostic
  // (commit 864f619). Fluxo: preview → detecting → detected → extracting →
  // confirming (modal de revisao).
  async function handleSendPhoto() {
    if (!session || !capturedPhoto) return;

    setFlowState('detecting');
    setFlowError(null);

    try {
      const compressed = await compressImage(capturedPhoto);

      // Step 1: Detect form (fast, < 1s)
      const detection = await detectClassificationForm(session, compressed);
      if (!mountedRef.current) return;

      // Q.cls.2: guarda o token sempre que a foto e enviada com sucesso
      // (mesmo se detected=true). Necessario pra modo manual posterior:
      // se a extracao tecnica falhar (3b), o operador pode "Continuar
      // manual" e o save usa esse token pra anexar a foto na classificacao.
      setDetectedPhotoToken(detection.photoToken);

      if (!detection.detected) {
        setFlowState('detect-failed');
        return;
      }

      // Step 2: Brief visual confirmation
      setFlowState('detected');
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (!mountedRef.current) return;

      // Step 3: Extract from cropped form
      setFlowState('extracting');
      const result = await extractFromDetectedForm(session, detection.photoToken);
      if (!mountedRef.current) return;

      handleExtractionResult(result);
    } catch (error) {
      if (!mountedRef.current) return;
      // Q.cls.2 sub-caminho 3b: erro tecnico (timeout, OpenAI offline, network).
      setFlowError(readErrorMessage(error, 'Erro ao processar a foto.'));
      setFlowState('extraction-error-technical');
    }
  }

  // Q.cls.2.8: continuar sem crop tambem nao recebe mais tipo (IA
  // type-agnostic). Disparado quando detect-failed: operador opta por
  // "Continuar assim" e a foto inteira vai pra extracao.
  async function handleContinueWithoutCrop() {
    if (!session || !capturedPhoto) return;

    setFlowState('extracting');
    setFlowError(null);

    try {
      const compressed = await compressImage(capturedPhoto);
      const result = detectedPhotoToken
        ? await extractFromDetectedForm(session, detectedPhotoToken)
        : await extractAndPrepareClassification(session, compressed);
      if (!mountedRef.current) return;

      // Garantia: token sempre conhecido apos um extract bem-sucedido
      // (necessario pra modo manual se o operador escolher esse caminho
      // depois — ainda que aqui ele nao precise normalmente).
      setDetectedPhotoToken(result.photoToken);
      handleExtractionResult(result);
    } catch (error) {
      if (!mountedRef.current) return;
      setFlowError(readErrorMessage(error, 'Erro ao processar a foto.'));
      setFlowState('extraction-error-technical');
    }
  }

  // Q.cls.2 sub-caminho 3a: a IA rodou OK mas nao identificou o lote.
  // No Flow B (com sampleId), avisa e oferece tirar nova foto. No Flow
  // A (sem sampleId), continua pro modal de revisao com o lote vazio
  // pra ser preenchido manualmente — comportamento legado.
  function handleExtractionResult(result: ExtractAndPrepareResponse) {
    setExtractionResult(result);
    const extracted = mapExtractionToForm(result.extractedFields, null);
    setClassificationForm((prev) => ({ ...prev, ...extracted }));

    const lote = result.identification.lote ?? '';
    const sacas = result.identification.sacas ?? '';
    const safra = result.identification.safra ?? '';
    setEditableLot(lote);
    setEditableSacks(sacas);
    setEditableHarvest(safra);

    if (hasContext && !lote) {
      setFlowState('extraction-error-illegible');
      return;
    }
    setFlowState('confirming');
  }

  function updateFormField(key: keyof ClassificationFormState, value: string) {
    setClassificationForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildApplySampleUpdatesFromMismatch(): {
    declaredSacks?: number;
    declaredHarvest?: string;
  } | null {
    const updates: { declaredSacks?: number; declaredHarvest?: string } = {};
    for (const divergence of mismatchDivergences) {
      const choice = mismatchChoices[divergence.field];
      if (choice !== 'extracted') continue;
      if (divergence.field === 'sacks' && typeof divergence.extracted === 'number') {
        updates.declaredSacks = divergence.extracted;
      } else if (divergence.field === 'harvest' && typeof divergence.extracted === 'string') {
        updates.declaredHarvest = divergence.extracted;
      }
    }
    return Object.keys(updates).length > 0 ? updates : null;
  }

  async function saveClassification(
    sampleId: string,
    applySampleUpdates: { declaredSacks?: number; declaredHarvest?: string } | null = null
  ) {
    if (!session) return;
    // Em modo manual o extractionResult e null — usa o detectedPhotoToken
    // (foto ja foi enviada e tem token, mesmo que a extracao tenha
    // falhado tecnicamente depois).
    const photoToken = manualMode ? detectedPhotoToken : (extractionResult?.photoToken ?? null);
    if (!photoToken) {
      setFlowError('Foto invalida ou expirada. Tire outra foto.');
      setFlowState('confirming');
      return;
    }

    setFlowState('submitting');
    setFlowError(null);

    try {
      const classificationData = buildClassificationDataPayload(classificationForm, {
        includeAutomaticDate: true,
        classificationType,
      });

      // Classifiers = [actor, ...co-classificadores selecionados]. Backend
      // valida existencia/ativo dos usuarios e normaliza snapshots.
      const classifiers = [
        { userId: session.user.id },
        ...coClassifiers.map((entry) => ({ userId: entry.id })),
      ];

      await confirmClassificationFromCamera(session, {
        sampleId,
        classificationData: classificationData as { [key: string]: JsonValue },
        photoToken,
        classificationType,
        classifiers,
        applySampleUpdates,
      });

      if (!mountedRef.current) return;
      setConfirmedSampleId(sampleId);
      setFlowState('success');
    } catch (error) {
      if (!mountedRef.current) return;
      setFlowError(readErrorMessage(error, 'Falha ao salvar classificacao.'));
      setFlowState('confirming');
    }
  }

  async function handleConfirmClassification() {
    if (!session) return;
    // Em modo manual o extractionResult e null (a IA falhou), mas o
    // operador ja preencheu lote/sacas/safra editaveis. Aceita ambos.
    if (!manualMode && !extractionResult) return;

    const validationError = validateClassificationForm(classificationForm, classificationType);
    if (validationError) {
      setFlowError(validationError);
      return;
    }

    // Source da identificacao: editable* sempre (reflete extracao da IA
    // OU o que o operador digitou no modo manual). Cross-validation
    // reativa naturalmente — sub-caminho 2 (lot-mismatch) e 4 (data-
    // mismatch) caem nos mesmos branches abaixo.
    const sacasSource = editableSacks.trim() || null;
    const harvestSource = editableHarvest.trim() || null;

    if (hasContext && contextSampleId) {
      // Flow B: validate status and lot match
      if (
        contextSampleStatus &&
        contextSampleStatus !== 'REGISTRATION_CONFIRMED' &&
        contextSampleStatus !== 'QR_PRINTED' &&
        contextSampleStatus !== 'CLASSIFIED'
      ) {
        setFlowError('Amostra nao pode ser classificada (status invalido).');
        return;
      }

      const enteredLot = normalizeLot(editableLot);
      const sampleLot = normalizeLot(contextSampleLot);

      if (enteredLot && sampleLot && enteredLot !== sampleLot) {
        setFlowState('lot-mismatch');
        return;
      }

      const divergences = compareIdentification(
        {
          lote: null,
          sacas: sacasSource,
          safra: harvestSource,
        },
        {
          declaredSacks: contextSampleSacks,
          declaredHarvest: contextSampleHarvest,
        }
      );
      if (divergences.length > 0) {
        setMismatchDivergences(divergences);
        setMismatchChoices(
          divergences.reduce(
            (acc, d) => {
              acc[d.field] = 'stored';
              return acc;
            },
            {} as Record<IdentificationField, MismatchChoice>
          )
        );
        setMismatchTargetSampleId(contextSampleId);
        setMismatchOverwriteAfter(false);
        setFlowState('data-mismatch');
        return;
      }

      await saveClassification(contextSampleId);
    } else {
      // Flow A: resolve sample by lot
      const lot = editableLot.trim();
      if (!lot) {
        setFlowError('Numero do lote e obrigatorio.');
        return;
      }

      setFlowState('resolving');
      setFlowError(null);

      try {
        const resolved = await resolveSampleByLot(session, lot);

        if (!mountedRef.current) return;

        if (!resolved.found || !resolved.sample) {
          setFlowState('not-found');
          return;
        }

        setResolvedSample(resolved.sample);

        if (
          resolved.sample.status !== 'REGISTRATION_CONFIRMED' &&
          resolved.sample.status !== 'QR_PRINTED' &&
          resolved.sample.status !== 'CLASSIFIED'
        ) {
          setFlowError('Amostra nao pode ser classificada (status invalido).');
          setFlowState('confirming');
          return;
        }

        const divergences = compareIdentification(
          {
            lote: null,
            sacas: sacasSource,
            safra: harvestSource,
          },
          {
            declaredSacks: resolved.sample.declared?.sacks ?? null,
            declaredHarvest: resolved.sample.declared?.harvest ?? null,
          }
        );
        if (divergences.length > 0) {
          setMismatchDivergences(divergences);
          setMismatchChoices(
            divergences.reduce(
              (acc, d) => {
                acc[d.field] = 'stored';
                return acc;
              },
              {} as Record<IdentificationField, MismatchChoice>
            )
          );
          setMismatchTargetSampleId(resolved.sample.id);
          setMismatchOverwriteAfter(resolved.sample.status === 'CLASSIFIED');
          setFlowState('data-mismatch');
          return;
        }

        if (resolved.sample.status === 'CLASSIFIED') {
          setFlowState('overwrite-confirm');
          return;
        }

        await saveClassification(resolved.sample.id);
      } catch (error) {
        if (!mountedRef.current) return;
        setFlowError(readErrorMessage(error, 'Falha ao buscar amostra.'));
        setFlowState('confirming');
      }
    }
  }

  async function handleApplyMismatchResolution() {
    if (!mismatchTargetSampleId) return;
    if (mismatchOverwriteAfter) {
      setFlowState('overwrite-confirm');
      return;
    }
    const updates = buildApplySampleUpdatesFromMismatch();
    await saveClassification(mismatchTargetSampleId, updates);
  }

  async function handleConfirmOverwrite() {
    if (!resolvedSample) return;
    const updates = buildApplySampleUpdatesFromMismatch();
    await saveClassification(resolvedSample.id, updates);
  }

  // --- QR result handlers ---

  function handleCloseResultModal() {
    setResultModalOpen(false);
    setStatusMessage(DEFAULT_STATUS_MESSAGE);
  }

  function handleOpenSampleDetails() {
    if (!result) return;
    setResultModalOpen(false);
    router.push(`/samples/${result.sample.id}`);
  }

  // --- Auto-redirect on success ---

  useEffect(() => {
    if (flowState !== 'success' || !confirmedSampleId) return;
    const timer = window.setTimeout(() => {
      if (mountedRef.current) {
        router.push(`/samples/${confirmedSampleId}`);
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [flowState, confirmedSampleId, router]);

  if (loading || !session) {
    return null;
  }

  // --- Render ---

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      {captureFlashKey > 0 ? (
        <div key={captureFlashKey} className="camera-capture-flash" aria-hidden="true" />
      ) : null}
      <section className="camera-hub-page">
        <section className="camera-hub-panel">
          <div className="camera-hub-stage">
            {/* Camera feed — always mounted to preserve scanner reference, hidden visually when not needed */}
            <video
              ref={videoRef}
              className={`camera-hub-video${flowState === 'preview' || flowState === 'success' ? ' is-hidden' : ''}`}
              autoPlay
              muted
              playsInline
            />
            <div
              ref={overlayRef}
              className={`camera-hub-overlay${flowState === 'preview' || flowState === 'success' ? ' is-hidden' : ''}`}
              aria-hidden="true"
            />

            {/* Photo preview */}
            {flowState === 'preview' && capturedPhotoUrl ? (
              // next/image nao se aplica: src e blob URL local com dimensoes dinamicas
              // eslint-disable-next-line @next/next/no-img-element
              <img src={capturedPhotoUrl} className="camera-hub-preview-img" alt="Foto capturada" />
            ) : null}

            {/* Top header */}
            <div className="camera-hub-headline">
              <button
                type="button"
                className="camera-hub-back-btn"
                onClick={() => {
                  if (flowState !== 'idle') {
                    resetClassificationFlow();
                  } else {
                    router.back();
                  }
                }}
                aria-label="Voltar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              {showStatusText && cameraError && flowState === 'idle' ? (
                <p className="camera-hub-status-text camera-hub-status-text-error" role="alert">
                  {cameraError}
                </p>
              ) : null}
            </div>

            {/* Gallery button — sempre visivel quando idle (Fase Q.cls.2):
                operador pode usar galeria livremente quando camera OK, e ela
                e o unico caminho quando camera falha (negacao, hardware
                indisponivel, sem traseira). */}
            {flowState === 'idle' ? (
              <>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handlePhotoSelected(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="camera-hub-gallery-btn"
                  onClick={() => galleryInputRef.current?.click()}
                  aria-label="Selecionar da galeria"
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                </button>
              </>
            ) : null}

            {/* Bottom area */}
            <div className="camera-hub-bottom-area">
              {/* Scanning indicator */}
              {flowState === 'idle' && cameraStatus === 'scanning' ? (
                <div className="camera-hub-scan-indicator">
                  <span className="camera-hub-scan-pulse" aria-hidden="true" />
                  <span className="camera-hub-scan-label">Escaneando QR...</span>
                </div>
              ) : flowState === 'idle' && cameraStatus === 'starting' ? (
                <div className="camera-hub-scan-indicator">
                  <span className="camera-hub-scan-label">Abrindo camera...</span>
                </div>
              ) : null}

              {/* Capture button — captures directly from video stream */}
              {flowState === 'idle' && cameraStatus === 'scanning' ? (
                <div className="camera-hub-capture-area">
                  <button
                    type="button"
                    className="camera-hub-capture-btn"
                    onClick={captureFromVideoStream}
                    aria-label="Tirar foto para classificacao"
                  >
                    <span className="camera-hub-capture-btn-inner" />
                  </button>
                </div>
              ) : null}

              {/* Preview actions */}
              {flowState === 'preview' ? (
                <div className="camera-hub-preview-actions">
                  <button
                    type="button"
                    className="camera-hub-preview-btn-retake"
                    onClick={resetClassificationFlow}
                  >
                    Tirar outra
                  </button>
                  <button
                    type="button"
                    className="camera-hub-preview-btn-send"
                    onClick={() => void handleSendPhoto()}
                  >
                    Enviar
                  </button>
                </div>
              ) : null}

              {/* Q.cls.2.8: tipo selecionado APOS extracao — modal renderizado
                  no nivel raiz (fora do .camera-hub) junto com os outros
                  modais. Veja <ClassificationTypeModal /> abaixo. */}

              {/* Classifier phase */}
              {flowState === 'selecting-classifier' ? (
                <div
                  className="app-modal-backdrop cam-type-backdrop"
                  onClick={() => setFlowState('selecting-type')}
                >
                  <section
                    className="app-modal cam-type-card cam-classifier-card"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Quem classificou esta amostra?"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <h3 className="cam-type-title">Quem classificou esta amostra?</h3>
                    <p className="cam-classifier-hint">
                      Voce ja esta incluido. Adicione co-classificadores se aplicavel.
                    </p>

                    <div className="cam-classifier-picker">
                      {/* Chip fixo do user atual (nao removivel) */}
                      <div className="cam-classifier-chips">
                        <span
                          className="cam-classifier-chip is-pinned"
                          aria-label="Voce (classificador principal)"
                        >
                          {session.user.fullName ?? session.user.username}
                          <span className="cam-classifier-chip-tag">voce</span>
                        </span>
                        {coClassifiers.map((entry) => (
                          <span key={entry.id} className="cam-classifier-chip">
                            {entry.fullName}
                            <button
                              type="button"
                              className="cam-classifier-chip-x"
                              onClick={() =>
                                setCoClassifiers((prev) => prev.filter((c) => c.id !== entry.id))
                              }
                              aria-label={`Remover ${entry.fullName}`}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>

                      {loadingUsers ? (
                        <div className="cam-classifier-loading">Carregando...</div>
                      ) : userPickerError ? (
                        <div className="cam-classifier-error">
                          {userPickerError}
                          <button
                            type="button"
                            className="cam-classifier-retry"
                            onClick={() => {
                              setAvailableUsers([]);
                              void loadAvailableUsersOnce();
                            }}
                          >
                            Tentar novamente
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            className="cam-classifier-search"
                            placeholder="Buscar co-classificador por nome ou usuario"
                            value={userPickerSearch}
                            onChange={(event) => setUserPickerSearch(event.target.value)}
                          />
                          <div className="cam-classifier-list" role="listbox" aria-multiselectable>
                            {(() => {
                              const q = userPickerSearch.trim().toLowerCase();
                              const filtered = q
                                ? availableUsers.filter(
                                    (u) =>
                                      u.fullName.toLowerCase().includes(q) ||
                                      u.username.toLowerCase().includes(q)
                                  )
                                : availableUsers;
                              if (filtered.length === 0) {
                                return (
                                  <div className="cam-classifier-empty">
                                    Nenhum usuario encontrado.
                                  </div>
                                );
                              }
                              return filtered.map((user) => {
                                const selected = coClassifiers.some((c) => c.id === user.id);
                                return (
                                  <button
                                    key={user.id}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    className={`cam-classifier-row${selected ? ' is-selected' : ''}`}
                                    onClick={() => toggleCoClassifier(user)}
                                  >
                                    <span className="cam-classifier-row-check">
                                      {selected ? (
                                        <svg viewBox="0 0 24 24" aria-hidden="true">
                                          <path d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : null}
                                    </span>
                                    <span className="cam-classifier-row-body">
                                      <span className="cam-classifier-row-name">
                                        {user.fullName}
                                      </span>
                                      <span className="cam-classifier-row-user">
                                        @{user.username}
                                      </span>
                                    </span>
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="cam-classifier-actions">
                      <button
                        type="button"
                        className="cam-classifier-back"
                        onClick={() => setFlowState('selecting-type')}
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        className="cam-classifier-continue"
                        onClick={handleClassifierContinue}
                      >
                        Continuar
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}

              {/* Detecting form */}
              {flowState === 'detecting' ? (
                <div className="camera-hub-extracting">
                  <div className="camera-hub-extracting-spinner" />
                  <span className="camera-hub-extracting-label">Procurando ficha na foto...</span>
                </div>
              ) : null}

              {/* Form detected */}
              {flowState === 'detected' ? (
                <div className="camera-hub-extracting">
                  <div className="camera-hub-success-icon is-sm">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="camera-hub-extracting-label">Ficha identificada!</span>
                </div>
              ) : null}

              {/* Detection failed */}
              {flowState === 'detect-failed' ? (
                <div className="camera-hub-extracting">
                  <span className="camera-hub-extracting-label">
                    Nao foi possivel encontrar a ficha automaticamente.
                  </span>
                  <span className="camera-hub-extracting-label is-secondary">
                    Tente fotografar com a ficha mais visivel, ou continue para extrair da foto
                    completa.
                  </span>
                  <div className="camera-hub-extracting-actions">
                    <button
                      type="button"
                      className="camera-hub-btn camera-hub-btn-secondary"
                      onClick={() => {
                        setFlowState('idle');
                        setCapturedPhoto(null);
                        setCapturedPhotoUrl(null);
                        setDetectedPhotoToken(null);
                      }}
                    >
                      Fotografar novamente
                    </button>
                    <button
                      type="button"
                      className="camera-hub-btn camera-hub-btn-primary"
                      onClick={() => void handleContinueWithoutCrop()}
                    >
                      Continuar assim
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Extracting */}
              {flowState === 'extracting' ? (
                <div className="camera-hub-extracting">
                  <div className="camera-hub-extracting-spinner" />
                  <span className="camera-hub-extracting-label">
                    Extraindo dados da classificacao...
                  </span>
                </div>
              ) : null}

              {/* Resolving lot */}
              {flowState === 'resolving' ? (
                <div className="camera-hub-extracting">
                  <div className="camera-hub-extracting-spinner" />
                  <span className="camera-hub-extracting-label">Buscando amostra...</span>
                </div>
              ) : null}

              {/* Success */}
              {flowState === 'success' ? (
                <div className="camera-hub-success">
                  <div className="camera-hub-success-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="camera-hub-success-text">Classificacao salva!</p>
                  <div className="camera-hub-success-actions">
                    <button
                      type="button"
                      className="camera-hub-success-btn-exit"
                      onClick={() => router.push('/dashboard')}
                    >
                      Sair
                    </button>
                    <button
                      type="button"
                      className="camera-hub-success-btn-details"
                      onClick={() => {
                        if (confirmedSampleId) router.push(`/samples/${confirmedSampleId}`);
                      }}
                    >
                      Ver detalhes
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </section>

      {/* QR result modal */}
      {result && resultModalOpen ? (
        <SampleLookupResultModal
          sample={result.sample}
          title="Amostra localizada"
          primaryActionLabel="Ver detalhes"
          onPrimaryAction={handleOpenSampleDetails}
          onDetails={handleCloseResultModal}
          onClose={handleCloseResultModal}
          detailsLabel="Escanear novamente"
        />
      ) : null}

      {/* Lot mismatch dialog (Flow B) */}
      {flowState === 'lot-mismatch' ? (
        <div className="app-modal-backdrop" onClick={() => {}}>
          <div className="app-modal cam-error-card" onClick={(e) => e.stopPropagation()}>
            <p className="cam-error-text">
              O lote da classificacao nao confere com a respectiva amostra.
            </p>
            <div className="cam-already-actions">
              <button type="button" className="cam-already-btn-no" onClick={() => router.back()}>
                Cancelar
              </button>
              <button
                type="button"
                className="cam-already-btn-yes"
                onClick={resetClassificationFlow}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Data mismatch resolution modal (sacas/safra) */}
      {flowState === 'data-mismatch' ? (
        <div className="app-modal-backdrop" onClick={() => {}}>
          <div className="app-modal cam-mismatch-card" onClick={(e) => e.stopPropagation()}>
            <p className="cam-mismatch-text">
              Algumas informacoes da ficha divergem do cadastro da amostra. Escolha qual valor
              manter em cada linha antes de salvar.
            </p>
            <div className="cam-mismatch-list">
              {mismatchDivergences.map((divergence) => {
                const label = divergence.field === 'sacks' ? 'Sacas' : 'Safra';
                const choice = mismatchChoices[divergence.field];
                const extractedText =
                  divergence.extracted !== null && divergence.extracted !== undefined
                    ? String(divergence.extracted)
                    : '\u2014';
                const storedText =
                  divergence.stored !== null && divergence.stored !== undefined
                    ? String(divergence.stored)
                    : '\u2014';
                return (
                  <div key={divergence.field} className="cam-mismatch-row">
                    <div className="cam-mismatch-row-label">{label}</div>
                    <div className="cam-mismatch-options">
                      <label
                        className={`cam-mismatch-option${choice === 'extracted' ? ' is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`mismatch-${divergence.field}`}
                          checked={choice === 'extracted'}
                          onChange={() =>
                            setMismatchChoices((prev) => ({
                              ...prev,
                              [divergence.field]: 'extracted',
                            }))
                          }
                        />
                        <span className="cam-mismatch-option-label">Ficha (extraido)</span>
                        <span className="cam-mismatch-option-value">{extractedText}</span>
                      </label>
                      <label
                        className={`cam-mismatch-option${choice === 'stored' ? ' is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`mismatch-${divergence.field}`}
                          checked={choice === 'stored'}
                          onChange={() =>
                            setMismatchChoices((prev) => ({
                              ...prev,
                              [divergence.field]: 'stored',
                            }))
                          }
                        />
                        <span className="cam-mismatch-option-label">Cadastro</span>
                        <span className="cam-mismatch-option-value">{storedText}</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="cam-already-actions">
              <button
                type="button"
                className="cam-already-btn-no"
                onClick={resetClassificationFlow}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="cam-already-btn-yes"
                onClick={() => void handleApplyMismatchResolution()}
              >
                Aplicar e salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Overwrite confirm dialog (Flow A) */}
      {flowState === 'overwrite-confirm' && resolvedSample ? (
        <div className="app-modal-backdrop" onClick={() => setFlowState('confirming')}>
          <div className="app-modal cam-already-card" onClick={(e) => e.stopPropagation()}>
            <p className="cam-already-text">
              A amostra <strong>{resolvedSample.internalLotNumber}</strong> ja possui classificacao.
              Deseja sobrescrever?
            </p>
            <div className="cam-already-actions">
              <button
                type="button"
                className="cam-already-btn-no"
                onClick={() => setFlowState('confirming')}
              >
                Nao
              </button>
              <button
                type="button"
                className="cam-already-btn-yes"
                onClick={() => void handleConfirmOverwrite()}
              >
                Sim, sobrescrever
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Not found dialog (Flow A) */}
      {flowState === 'not-found' ? (
        <div className="app-modal-backdrop" onClick={() => {}}>
          <div className="app-modal cam-error-card" onClick={(e) => e.stopPropagation()}>
            <p className="cam-error-text">
              Nenhuma amostra encontrada com o lote <strong>{editableLot}</strong>.
            </p>
            <div className="cam-already-actions">
              <button
                type="button"
                className="cam-already-btn-no"
                onClick={() => router.push('/dashboard')}
              >
                Sair
              </button>
              <button
                type="button"
                className="cam-already-btn-yes"
                onClick={() => router.push('/samples/new')}
              >
                Cadastrar nova amostra
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Q.cls.2.3: Modal de revisao da ficha unificada. Avancar dispara
          o modal de tipo (Q.cls.2.8) — save final acontece apos
          classifier-modal. Em modo manual (3b), lote/sacas/safra ficam
          editaveis pre-preenchidos com valores do sample em context. */}
      <ClassificationReviewModal
        open={flowState === 'confirming' && (!!extractionResult || manualMode)}
        photoUrl={capturedPhotoUrl}
        lotEditable={!hasContext || manualMode}
        sacksEditable={manualMode}
        harvestEditable={manualMode}
        lotValue={editableLot}
        sacksValue={editableSacks}
        harvestValue={editableHarvest}
        onLotChange={setEditableLot}
        onSacksChange={setEditableSacks}
        onHarvestChange={setEditableHarvest}
        form={classificationForm}
        onFormChange={updateFormField}
        errorMessage={flowError}
        saving={false}
        onCancel={resetClassificationFlow}
        onAdvance={() => setFlowState('selecting-type')}
      />

      {/* Q.cls.2.8: Modal de selecao de tipo (entre revisao e classifiers).
          Click num tipo seta classificationType e avanca pro classifier
          modal. Voltar (seta no header) volta pro modal de revisao. */}
      <ClassificationTypeModal
        open={flowState === 'selecting-type' && (!!extractionResult || manualMode)}
        selectedType={classificationType}
        onBack={() => setFlowState('confirming')}
        onSelect={(type) => {
          setClassificationType(type);
          setUserPickerSearch('');
          setUserPickerError(null);
          void loadAvailableUsersOnce();
          setFlowState('selecting-classifier');
        }}
      />

      {/* Q.cls.2 sub-caminho 3a: lote ilegivel apos extracao OK.
          Operador tira nova foto ou cancela (volta detail page). */}
      <ClassificationExtractionErrorModal
        open={flowState === 'extraction-error-illegible'}
        kind="illegible"
        onCancel={() => {
          if (hasContext) router.back();
          else resetClassificationFlow();
        }}
        onRetake={resetClassificationFlow}
      />

      {/* Q.cls.2 sub-caminho 3b: erro tecnico (timeout, OpenAI offline).
          3 opcoes: tirar outra, continuar manual, cancelar. */}
      <ClassificationExtractionErrorModal
        open={flowState === 'extraction-error-technical'}
        kind="technical"
        technicalDetail={flowError}
        onCancel={() => {
          if (hasContext) router.back();
          else resetClassificationFlow();
        }}
        onRetake={resetClassificationFlow}
        onContinueManual={() => setFlowState('manual-confirm')}
      />

      {/* Q.cls.2 sub-caminho 3b → 2o modal: confirma o modo manual antes
          de abrir o ReviewModal sem extracao da IA. */}
      <ClassificationManualConfirmModal
        open={flowState === 'manual-confirm'}
        onBack={() => setFlowState('extraction-error-technical')}
        onConfirm={startManualMode}
      />
    </AppShell>
  );
}

export default function CameraPage() {
  return (
    <Suspense>
      <CameraPageContent />
    </Suspense>
  );
}
