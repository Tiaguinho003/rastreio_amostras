'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { type LookupKind, SampleLookupResultModal } from '../../components/SampleLookupResultModal';
import { ClassificationClassifierModal } from '../../components/samples/ClassificationClassifierModal';
import { ClassificationDataMismatchModal } from '../../components/samples/ClassificationDataMismatchModal';
import { ClassificationExtractionErrorModal } from '../../components/samples/ClassificationExtractionErrorModal';
import { ClassificationLotMismatchModal } from '../../components/samples/ClassificationLotMismatchModal';
import { ClassificationManualConfirmModal } from '../../components/samples/ClassificationManualConfirmModal';
import { ClassificationNotFoundModal } from '../../components/samples/ClassificationNotFoundModal';
import {
  ClassificationReclassifyModal,
  type ReclassifyReasonCode,
} from '../../components/samples/ClassificationReclassifyModal';
import { ClassificationReviewModal } from '../../components/samples/ClassificationReviewModal';
import { ClassificationSuccessModal } from '../../components/samples/ClassificationSuccessModal';
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
import { playShutterSound } from '../../lib/camera/camera-shutter-sound';
import { compressImage, isHighQualityEnabled, pickQualityFromEnv } from '../../lib/compress-image';
import {
  type ClassificationFormState,
  EMPTY_CLASSIFICATION_FORM,
  mapExtractionToForm,
  validateClassificationForm,
  buildClassificationDataPayload,
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
  // Bloco F1 (Frente C): kind do modal de scan — variantes 'lookup' /
  // 'invalidated' / 'classified' baseadas no status da amostra resolvida.
  const [resultModalKind, setResultModalKind] = useState<LookupKind>('lookup');

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
  const [contextSampleLoading, setContextSampleLoading] = useState(false);
  const [contextSampleError, setContextSampleError] = useState<string | null>(null);
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

  // F3.10: origem do "Continuar manual" — define se preserva extracao
  // parcial (illegible) ou zera (technical/default). Resetado em
  // startManualMode e no resetClassificationFlow.
  const [manualConfirmSource, setManualConfirmSource] = useState<'technical' | 'illegible' | null>(
    null
  );

  // Resolve result (Flow A)
  const [resolvedSample, setResolvedSample] = useState<ResolveSampleByLotResponse['sample'] | null>(
    null
  );

  // Data mismatch (sacas/safra divergem do cadastro). Q.cls.2 sub-caminho 4:
  // operador deve escolher campo a campo — sem default. choices e Partial
  // pra que o tipo permita "ainda nao escolhido"; botao Aplicar so habilita
  // quando todas as divergencias tem escolha.
  const [mismatchDivergences, setMismatchDivergences] = useState<IdentificationDivergence[]>([]);
  const [mismatchChoices, setMismatchChoices] = useState<
    Partial<Record<IdentificationField, MismatchChoice>>
  >({});
  const [mismatchTargetSampleId, setMismatchTargetSampleId] = useState<string | null>(null);
  const [mismatchOverwriteAfter, setMismatchOverwriteAfter] = useState<boolean>(false);

  // Reclassificacao (Q.cls.2 sub-caminho 5): reason code obrigatorio +
  // reason text obrigatorio so quando code = OTHER. Sem persistencia
  // backend ainda — Q.cls.2.7 inclui no payload de updateClassification.
  const [reclassifyReasonCode, setReclassifyReasonCode] = useState<ReclassifyReasonCode | null>(
    null
  );
  const [reclassifyReasonText, setReclassifyReasonText] = useState('');
  const [reclassifyShowErrors, setReclassifyShowErrors] = useState(false);

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

  // Load context sample (Flow B). Antes o catch era silencioso e
  // contextSampleStatus ficava null em qualquer falha (404/401/rede),
  // permitindo que a captura prosseguisse e o erro so aparecesse no
  // backend, apos a chamada da IA. Agora o erro e propagado pra
  // contextSampleError + bloqueia a captura ate carregar (ou retry).
  const loadContextSample = useCallback(async () => {
    if (!contextSampleId || !session) return;
    setContextSampleLoading(true);
    setContextSampleError(null);
    try {
      const detail = await getSampleDetail(session, contextSampleId);
      if (detail?.sample) {
        setContextSampleLot(detail.sample.internalLotNumber ?? null);
        setContextSampleStatus(detail.sample.status);
        setContextSampleSacks(detail.sample.declared?.sacks ?? null);
        setContextSampleHarvest(detail.sample.declared?.harvest ?? null);
      } else {
        setContextSampleError('Verifique sua conexao e tente novamente.');
      }
    } catch (error) {
      setContextSampleError(readErrorMessage(error, 'Verifique sua conexao e tente novamente.'));
    } finally {
      setContextSampleLoading(false);
    }
  }, [contextSampleId, session]);

  useEffect(() => {
    if (!contextSampleId || !session) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadContextSample();
    })();
    return () => {
      cancelled = true;
    };
  }, [contextSampleId, session, loadContextSample]);

  // Soft-navigation cleanup: quando contextSampleId vira null (ex: usuario
  // navega de /camera?sampleId=X pra /camera sem recarregar a pagina), o
  // useEffect de hidratacao faz early return e nao limpa states. Aqui zeramos
  // explicitamente pra evitar state residual em transicoes entre caminhos.
  useEffect(() => {
    if (contextSampleId) return;
    setContextSampleLot(null);
    setContextSampleStatus(null);
    setContextSampleSacks(null);
    setContextSampleHarvest(null);
    setContextSampleError(null);
    setContextSampleLoading(false);
  }, [contextSampleId]);

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
    navigator.vibrate?.(80);
    const status = resolved.sample.status;
    let kind: LookupKind;
    let statusMsg: string;
    if (status === 'INVALIDATED') {
      kind = 'invalidated';
      statusMsg = 'Amostra invalidada. Escaneie outra etiqueta.';
    } else if (status === 'CLASSIFIED') {
      kind = 'classified';
      statusMsg = 'Amostra ja classificada. Escolha uma acao.';
    } else {
      kind = 'lookup';
      statusMsg = 'Amostra localizada. Confira a etiqueta antes de continuar.';
    }
    setResult(resolved);
    setResultModalKind(kind);
    setResultModalOpen(true);
    setCameraError(null);
    setStatusMessage(statusMsg);
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
    setManualConfirmSource(null);
    setResolvedSample(null);
    setMismatchDivergences([]);
    setMismatchChoices({});
    setMismatchTargetSampleId(null);
    setMismatchOverwriteAfter(false);
    setReclassifyReasonCode(null);
    setReclassifyReasonText('');
    setReclassifyShowErrors(false);
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
    // F3.10: em 'illegible' preserva a extracao parcial (peneiras, fundos,
    // etc que vieram OK); em 'technical' (ou origem indefinida) reseta.
    if (manualConfirmSource !== 'illegible') {
      setExtractionResult(null);
      setClassificationForm(EMPTY_CLASSIFICATION_FORM);
    }
    setManualConfirmSource(null);
    setFlowError(null);
    setFlowState('confirming');
  }

  async function captureFromVideoStream() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    playShutterSound();
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
    const extracted = mapExtractionToForm(result.extractedFields);
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
      });

      // Classifiers = [actor, ...co-classificadores selecionados]. Backend
      // valida existencia/ativo dos usuarios e normaliza snapshots.
      const classifiers = [
        { userId: session.user.id },
        ...coClassifiers.map((entry) => ({ userId: entry.id })),
      ];

      // Q.cls.2.7: reasonCode/reasonText vem do ClassificationReclassifyModal
      // quando sample esta CLASSIFIED (sub-caminho 5). Em new classification
      // ficam null; o backend ignora.
      await confirmClassificationFromCamera(session, {
        sampleId,
        classificationData: classificationData as { [key: string]: JsonValue },
        photoToken,
        classificationType,
        classifiers,
        applySampleUpdates,
        reasonCode: reclassifyReasonCode,
        reasonText: reclassifyReasonText.trim() || null,
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

    const validationError = validateClassificationForm(classificationForm);
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
      // Defesa em profundidade: a UI ja desabilita captura quando
      // contextSampleStatus e null, mas em race conditions (ex: foto
      // tirada antes do load terminar) chegamos aqui sem status. Recusar
      // antes da chamada da IA evita gastar 15-30 s + custo OpenAI pra
      // depois levar 409 do backend.
      if (!contextSampleStatus) {
        setFlowError(
          'Nao foi possivel carregar a amostra. Tente novamente ou volte para o dashboard.'
        );
        return;
      }

      // Flow B: validate status and lot match
      if (
        contextSampleStatus !== 'REGISTRATION_CONFIRMED' &&
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
        // Q.cls.2 sub-caminho 4: sem default — operador deve escolher.
        setMismatchChoices({});
        setMismatchTargetSampleId(contextSampleId);
        // Se sample ja esta CLASSIFIED (sub-caminho 5), ao "Aplicar" do
        // data-mismatch o flow vai pra overwrite-confirm em vez de
        // salvar direto.
        setMismatchOverwriteAfter(contextSampleStatus === 'CLASSIFIED');
        setFlowState('data-mismatch');
        return;
      }

      // Q.cls.2 sub-caminho 5: sample CLASSIFIED no Flow B → reclassificacao.
      // Aciona o ClassificationReclassifyModal pra coletar reasonCode/text
      // antes de salvar.
      if (contextSampleStatus === 'CLASSIFIED') {
        setMismatchTargetSampleId(contextSampleId);
        setFlowState('overwrite-confirm');
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
          // Q.cls.2 sub-caminho 4: sem default.
          setMismatchChoices({});
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

  // Q.cls.2 sub-caminho 5: confirma reclassificacao (sample CLASSIFIED).
  // Valida reason code obrigatorio + reason text obrigatorio se code=OTHER.
  // Funciona em ambos os flows: Flow A (resolvedSample) e Flow B
  // (mismatchTargetSampleId === contextSampleId).
  async function handleConfirmOverwrite() {
    const targetSampleId = resolvedSample?.id ?? mismatchTargetSampleId;
    if (!targetSampleId) return;
    const codeMissing = reclassifyReasonCode === null;
    const textMissing =
      reclassifyReasonCode === 'OTHER' && reclassifyReasonText.trim().length === 0;
    if (codeMissing || textMissing) {
      setReclassifyShowErrors(true);
      return;
    }
    const updates = buildApplySampleUpdatesFromMismatch();
    await saveClassification(targetSampleId, updates);
  }

  // --- QR result handlers ---

  function handleCloseResultModal() {
    setResultModalOpen(false);
    setResultModalKind('lookup');
    setStatusMessage(DEFAULT_STATUS_MESSAGE);
  }

  function handleOpenSampleDetails() {
    if (!result) return;
    setResultModalOpen(false);
    setResultModalKind('lookup');
    router.push(`/samples/${result.sample.id}`);
  }

  // Bloco F1 (Frente C): handler de "Reclassificar" no modal de aviso de
  // amostra ja classificada — vai direto pra /camera?sampleId=X (mesma rota
  // do Caminho 1), onde o ClassificationReclassifyModal abre via useEffect.
  function handleReclassifyFromScan() {
    if (!result) return;
    setResultModalOpen(false);
    setResultModalKind('lookup');
    router.push(`/camera?sampleId=${result.sample.id}`);
  }

  // Bloco F2 (Frente C): handler de "Tentar novamente" quando a camera
  // esta em permission-denied ou unsupported. Re-dispara ensureScannerStarted
  // (idempotente — recria scanner se necessario e atualiza cameraStatus).
  function handleRetryCamera() {
    void ensureScannerStarted();
  }

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
                <div className="camera-hub-error-with-retry">
                  <p className="camera-hub-status-text camera-hub-status-text-error" role="alert">
                    {cameraError}
                  </p>
                  <button
                    type="button"
                    className="camera-hub-btn camera-hub-btn-secondary"
                    onClick={handleRetryCamera}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : null}

              {/* Flow B: feedback de carregamento do contexto da amostra. */}
              {hasContext && contextSampleLoading && !contextSampleError && flowState === 'idle' ? (
                <p className="camera-hub-status-text" role="status">
                  Carregando amostra...
                </p>
              ) : null}

              {hasContext && contextSampleError && flowState === 'idle' ? (
                <div className="camera-hub-error-with-retry">
                  <p className="camera-hub-status-text camera-hub-status-text-error" role="alert">
                    Nao foi possivel carregar a amostra. {contextSampleError}
                  </p>
                  <button
                    type="button"
                    className="camera-hub-btn camera-hub-btn-secondary"
                    onClick={() => void loadContextSample()}
                  >
                    Tentar novamente
                  </button>
                  <button
                    type="button"
                    className="camera-hub-btn camera-hub-btn-secondary"
                    onClick={() => router.back()}
                  >
                    Voltar
                  </button>
                </div>
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

              {/* Capture button — captures directly from video stream.
                  No Flow B (com contextSampleId), o botao fica desabilitado
                  enquanto o getSampleDetail nao terminar ou enquanto houver
                  erro de carregamento — evita captura sem contexto valido. */}
              {flowState === 'idle' && cameraStatus === 'scanning' ? (
                <div className="camera-hub-capture-area">
                  <button
                    type="button"
                    className="camera-hub-capture-btn"
                    onClick={captureFromVideoStream}
                    disabled={
                      hasContext &&
                      (contextSampleLoading || !!contextSampleError || !contextSampleStatus)
                    }
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

              {/* Q.cls.2.9: Classifier modal renderizado ao lado dos outros
                  modais raiz, fora do .camera-hub. Veja
                  <ClassificationClassifierModal /> abaixo. */}

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
            </div>
          </div>
        </section>
      </section>

      {/* QR result modal — kind decide variante (lookup/invalidated/classified) */}
      {result && resultModalOpen ? (
        <SampleLookupResultModal
          sample={result.sample}
          kind={resultModalKind}
          title="Amostra localizada"
          onDetails={handleOpenSampleDetails}
          detailsLabel="Ver detalhes"
          onSecondaryAction={handleCloseResultModal}
          secondaryActionLabel="Escanear novamente"
          onClose={handleCloseResultModal}
          onReclassify={handleReclassifyFromScan}
          onShowDetails={handleOpenSampleDetails}
        />
      ) : null}

      {/* Modal central de sucesso pos-classificacao (Bloco F1, frente B). */}
      <ClassificationSuccessModal
        open={flowState === 'success' && Boolean(confirmedSampleId)}
        lotNumber={resolvedSample?.internalLotNumber ?? contextSampleLot ?? confirmedSampleId ?? ''}
        isReclassification={contextSampleStatus === 'CLASSIFIED'}
        onViewDetails={() => {
          if (confirmedSampleId) router.push(`/samples/${confirmedSampleId}`);
        }}
        onClose={() => {
          resetClassificationFlow();
          router.push('/camera');
        }}
      />

      {/* Q.cls.2 sub-caminho 2: lote diverge. Mostra valores comparados +
          miniatura da foto. */}
      <ClassificationLotMismatchModal
        open={flowState === 'lot-mismatch'}
        extractedLot={editableLot || extractionResult?.identification.lote || null}
        expectedLot={contextSampleLot}
        photoUrl={capturedPhotoUrl}
        onCancel={() => router.back()}
        onRetake={resetClassificationFlow}
      />

      {/* Q.cls.2 sub-caminho 4: divergencia sacas/safra. Operador escolhe
          campo a campo; sem default; Aplicar so habilita quando todas
          as escolhas foram feitas. */}
      <ClassificationDataMismatchModal
        open={flowState === 'data-mismatch'}
        divergences={mismatchDivergences}
        choices={mismatchChoices}
        onChoose={(field, choice) => setMismatchChoices((prev) => ({ ...prev, [field]: choice }))}
        onCancel={resetClassificationFlow}
        onApply={() => void handleApplyMismatchResolution()}
        saving={false}
      />

      {/* Q.cls.2 sub-caminho 5: reclassificacao. Reason code obrigatorio +
          reason text obrigatorio se code=OTHER. */}
      <ClassificationReclassifyModal
        open={flowState === 'overwrite-confirm' && (!!resolvedSample || !!contextSampleId)}
        sampleLot={resolvedSample?.internalLotNumber ?? contextSampleLot ?? null}
        reasonCode={reclassifyReasonCode}
        reasonText={reclassifyReasonText}
        showErrors={reclassifyShowErrors}
        onReasonCodeChange={(code) => {
          setReclassifyReasonCode(code);
          setReclassifyShowErrors(false);
        }}
        onReasonTextChange={(text) => {
          setReclassifyReasonText(text);
          if (text.trim().length > 0) setReclassifyShowErrors(false);
        }}
        onCancel={() => setFlowState('confirming')}
        onConfirm={() => void handleConfirmOverwrite()}
        saving={false}
      />

      {/* Amostra nao encontrada (Flow A legacy fallback). */}
      <ClassificationNotFoundModal
        open={flowState === 'not-found'}
        lot={editableLot}
        onSair={() => router.push('/dashboard')}
        onCadastrarNova={() => router.push('/samples/new')}
      />

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
          F3.10 expandida: tambem oferece "Continuar manual" preservando
          a extracao parcial (peneiras/fundos/etc que vieram OK). */}
      <ClassificationExtractionErrorModal
        open={flowState === 'extraction-error-illegible'}
        kind="illegible"
        onCancel={() => {
          if (hasContext) router.back();
          else resetClassificationFlow();
        }}
        onRetake={resetClassificationFlow}
        onContinueManual={() => {
          setManualConfirmSource('illegible');
          setFlowState('manual-confirm');
        }}
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
        onContinueManual={() => {
          setManualConfirmSource('technical');
          setFlowState('manual-confirm');
        }}
      />

      {/* Q.cls.2 sub-caminho 3b → 2o modal: confirma o modo manual antes
          de abrir o ReviewModal sem extracao da IA.
          F3.10: voltar leva ao modal de origem correto (illegible ou technical). */}
      <ClassificationManualConfirmModal
        open={flowState === 'manual-confirm'}
        onBack={() =>
          setFlowState(
            manualConfirmSource === 'illegible'
              ? 'extraction-error-illegible'
              : 'extraction-error-technical'
          )
        }
        onConfirm={startManualMode}
      />

      {/* Q.cls.2.9: Modal de classificadores. Substitui o JSX inline antigo
          (cam-classifier-card). Continuar dispara o save direto — a
          extracao+revisao+tipo ja aconteceram. Voltar volta pro modal
          de tipo. */}
      <ClassificationClassifierModal
        open={flowState === 'selecting-classifier' && (!!extractionResult || manualMode)}
        currentUser={{
          fullName: session.user.fullName ?? null,
          username: session.user.username,
        }}
        coClassifiers={coClassifiers}
        availableUsers={availableUsers}
        loadingUsers={loadingUsers}
        userPickerError={userPickerError}
        search={userPickerSearch}
        onSearchChange={setUserPickerSearch}
        onToggleUser={toggleCoClassifier}
        onRemoveCoClassifier={(id) => setCoClassifiers((prev) => prev.filter((c) => c.id !== id))}
        onRetryLoad={() => {
          setAvailableUsers([]);
          void loadAvailableUsersOnce();
        }}
        onBack={() => setFlowState('selecting-type')}
        onContinue={handleClassifierContinue}
        saving={flowState === 'submitting'}
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
