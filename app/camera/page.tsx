'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { BottomSheet } from '../../components/BottomSheet';
import { type LookupKind, SampleLookupResultModal } from '../../components/SampleLookupResultModal';
import { ClassificationClassifierModal } from '../../components/samples/ClassificationClassifierModal';
import { ClassificationDataMismatchModal } from '../../components/samples/ClassificationDataMismatchModal';
import { ClassificationDetectFailedModal } from '../../components/samples/ClassificationDetectFailedModal';
import { ClassificationStatusInvalidModal } from '../../components/samples/ClassificationStatusInvalidModal';
import { ClassificationExtractionErrorModal } from '../../components/samples/ClassificationExtractionErrorModal';
import { ClassificationLotMismatchModal } from '../../components/samples/ClassificationLotMismatchModal';
import { ClassificationManualConfirmModal } from '../../components/samples/ClassificationManualConfirmModal';
import { ClassificationNotFoundModal } from '../../components/samples/ClassificationNotFoundModal';
import {
  ClassificationReclassifyModal,
  type ReclassifyReasonCode,
} from '../../components/samples/ClassificationReclassifyModal';
import { ClassificationReviewSheetBody } from '../../components/samples/ClassificationReviewSheetBody';
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
  // Amostra com status que nao permite classificacao. Validado no "Avancar"
  // do review (entre confirming e selecting-type).
  | 'status-invalid'
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
  const [selectedClassifiers, setSelectedClassifiers] = useState<ClassifierSnapshot[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
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

  // Estados de processamento pos-captura ate o review modal abrir.
  // Renderizados dentro do BottomSheet de preview (que reduz de altura
  // suavemente) em vez do stage, pra evitar a ruptura visual de
  // fechar o sheet so pra mostrar um spinner no stage.
  const isProcessingPhoto =
    flowState === 'detecting' ||
    flowState === 'detected' ||
    flowState === 'extracting' ||
    flowState === 'resolving';

  const processingMessage = (() => {
    switch (flowState) {
      case 'detecting':
        return 'Procurando ficha na foto...';
      case 'detected':
        return 'Ficha identificada!';
      case 'extracting':
        return 'Extraindo dados da classificacao...';
      case 'resolving':
        return 'Buscando amostra...';
      default:
        return null;
    }
  })();

  // Modo review do BottomSheet — sheet expande de volta a altura cheia
  // e mostra o form de 7 secoes via ClassificationReviewSheetBody.
  // Substitui o ClassificationReviewModal central pra que a transicao
  // processing → review seja continua (sem flash de close+open).
  const isReviewingPhoto = flowState === 'confirming' && (!!extractionResult || manualMode);
  const REVIEW_FORM_ID = 'classification-review-form';

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

  // Status bar bege na pagina da camera. Muda o meta theme-color enquanto
  // a pagina esta montada e restaura ao desmontar. Em Android Chrome a
  // barra do sistema vira bege; em iOS PWA standalone com black-translucent
  // o efeito e parcial (icones brancos continuam, fundo visivel por baixo
  // fica bege via .camera-hub-page::before — ver globals.css).
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = '#fdf9ec';
    return () => {
      meta.content = previous;
    };
  }, []);

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
      // Caminhos 1 (detalhe) e 3 (dashboard) ja chegam com amostra escolhida
      // via ?sampleId=X. Ignorar QRs evita que uma etiqueta proxima na bancada
      // interrompa o fluxo de captura abrindo modal de outra amostra.
      if (hasContext) return;

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
    [handleResolvedSample, hasContext, scheduleScannerRestart, stopScanner]
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
    setSelectedClassifiers([]);
    setAvailableUsers([]);
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
        limit: 300,
      });
      if (!mountedRef.current) return;
      setAvailableUsers(response.items);
      // O usuario atual e pre-selecionado (auto), mas pode ser removido.
      setSelectedClassifiers((prev) =>
        prev.length > 0
          ? prev
          : [
              {
                id: session.user.id,
                fullName: session.user.fullName ?? session.user.username,
                username: session.user.username,
              },
            ]
      );
    } catch (error) {
      if (!mountedRef.current) return;
      setUserPickerError(
        readErrorMessage(error, 'Nao foi possivel carregar a lista de classificadores.')
      );
    } finally {
      if (mountedRef.current) setLoadingUsers(false);
    }
  }

  function toggleClassifier(user: UserLookupItem) {
    setSelectedClassifiers((prev) => {
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

    // Detecao precoce de divergencia de lote (Caminhos 1 e 3, hasContext).
    // Compara o lote extraido com o contextSampleLot antes de abrir o
    // ReviewModal — operador economiza os ~30s de revisao manual se a
    // ficha fotografada foi a errada. Caminho 2 (sem contexto) continua
    // resolvendo lote no fim do fluxo via resolveSampleByLot.
    if (hasContext && lote && contextSampleLot) {
      const extracted = normalizeLot(lote);
      const expected = normalizeLot(contextSampleLot);
      if (extracted !== expected) {
        setFlowState('lot-mismatch');
        return;
      }
    }

    setFlowState('confirming');
  }

  // Acao "Continuar" no modal de divergencia de lote: operador aceita a
  // amostra pre-selecionada (contextSampleLot prevalece — pode ser caso
  // de letra ruim na ficha, foto borrada num digito etc). O lote da ficha
  // extraido pela IA e sobrescrito pelo lote esperado, garantindo
  // consistencia no payload de save.
  function handleLotMismatchContinue() {
    if (contextSampleLot) {
      setEditableLot(contextSampleLot);
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
      const classifiers = selectedClassifiers.map((entry) => ({ userId: entry.id }));

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

  // Avancar do review (apos a validacao numerica da propria sheet): identifica
  // a amostra e valida o status ANTES do modal de tipo. Flow B: usa o status do
  // contexto. Flow A: resolve o lote agora (resolve + not-found + status cedo),
  // em vez de so no Confirmar.
  async function handleReviewAdvance() {
    if (!session) return;

    if (hasContext && contextSampleId) {
      if (
        !contextSampleStatus ||
        (contextSampleStatus !== 'REGISTRATION_CONFIRMED' && contextSampleStatus !== 'CLASSIFIED')
      ) {
        setFlowState('status-invalid');
        return;
      }
      setFlowState('selecting-type');
      return;
    }

    // Flow A: resolve o lote agora pra validar status/existencia cedo.
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
        setFlowState('status-invalid');
        return;
      }
      setFlowState('selecting-type');
    } catch (error) {
      if (!mountedRef.current) return;
      setFlowError(readErrorMessage(error, 'Falha ao buscar amostra.'));
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
      // Status ja validado no Avancar (handleReviewAdvance) — aqui so o
      // lot-mismatch (lote editavel no modo manual) + reconciliacao + save.
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
      // Flow A: amostra ja resolvida + status validado no Avancar
      // (handleReviewAdvance). Aqui so reconciliamos divergencias e salvamos.
      if (!resolvedSample) {
        setFlowError('Amostra nao resolvida. Volte e tente novamente.');
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
          declaredSacks: resolvedSample.declared?.sacks ?? null,
          declaredHarvest: resolvedSample.declared?.harvest ?? null,
        }
      );
      if (divergences.length > 0) {
        setMismatchDivergences(divergences);
        setMismatchChoices({});
        setMismatchTargetSampleId(resolvedSample.id);
        setMismatchOverwriteAfter(resolvedSample.status === 'CLASSIFIED');
        setFlowState('data-mismatch');
        return;
      }

      if (resolvedSample.status === 'CLASSIFIED') {
        setFlowState('overwrite-confirm');
        return;
      }

      await saveClassification(resolvedSample.id);
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
              className={`camera-hub-overlay${
                flowState === 'preview' || flowState === 'success' ? ' is-hidden' : ''
              }${hasContext ? ' is-no-scan' : ''}`}
              aria-hidden="true"
            />

            {/* O preview da foto capturada migrou pro BottomSheet `camera-preview-sheet`
                renderizado no final do componente. Mantemos o stage vazio (vídeo continua
                hidden quando flowState='preview') pra que o sheet cubra tudo sem distração. */}

            {/* Card de erro unificado: aparece quando getUserMedia falha
                (permission-denied ou unsupported). Substitui as mensagens
                em ingles vindas do DOMException por uma mensagem fixa em
                pt-BR + atalho "Usar galeria" (acao que sempre funciona,
                independente da permissao de camera). */}
            {(cameraStatus === 'permission-denied' || cameraStatus === 'unsupported') &&
            flowState === 'idle' ? (
              <div className="camera-hub-error-overlay" role="alert">
                <div className="camera-hub-error-card">
                  <h2 className="camera-hub-error-card-title">Acesso a camera indisponivel</h2>
                  <div className="camera-hub-error-card-actions">
                    <button
                      type="button"
                      className="camera-hub-error-card-action-primary"
                      onClick={() => galleryInputRef.current?.click()}
                    >
                      Usar galeria
                    </button>
                    <button
                      type="button"
                      className="camera-hub-error-card-action-secondary"
                      onClick={handleRetryCamera}
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              </div>
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

              {/* Bloco inline antigo: cobre erros NAO relacionados a inicializacao
                  da camera (ex: "A foto excede o limite de 12 MB" vindo da galeria).
                  Quando cameraStatus e denied/unsupported, o card centralizado
                  acima ja cobre — exclui aqui pra nao duplicar. */}
              {showStatusText &&
              cameraError &&
              flowState === 'idle' &&
              cameraStatus !== 'permission-denied' &&
              cameraStatus !== 'unsupported' ? (
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
              {/* Scanning indicator:
                  - Caminhos 1/3 (hasContext) + lote carregado: mostra "Classificando lote X".
                  - Caminhos 1/3 sem lote ainda: "Carregando amostra..." aparece em bloco separado.
                  - Caminho 2 (sem contexto): silencioso — QR scanner continua ativo internamente. */}
              {flowState === 'idle' &&
              cameraStatus === 'scanning' &&
              hasContext &&
              contextSampleLot ? (
                <div className="camera-hub-scan-indicator">
                  <span className="camera-hub-scan-label">
                    Classificando lote {contextSampleLot}
                  </span>
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

              {/* Preview actions removidas — agora vivem no footer do BottomSheet
                  `camera-preview-sheet` no final do componente. */}

              {/* Q.cls.2.8: tipo selecionado APOS extracao — modal renderizado
                  no nivel raiz (fora do .camera-hub) junto com os outros
                  modais. Veja <ClassificationTypeModal /> abaixo. */}

              {/* Q.cls.2.9: Classifier modal renderizado ao lado dos outros
                  modais raiz, fora do .camera-hub. Veja
                  <ClassificationClassifierModal /> abaixo. */}

              {/* Os estados detecting/detected/extracting/resolving foram migrados
                  pro BottomSheet `camera-preview-sheet` com classe is-processing
                  (reduz altura suavemente). Apenas detect-failed continua aqui
                  no stage por enquanto — proxima sessao pode migrar tambem. */}

              {/* detect-failed virou modal central (ClassificationDetectFailedModal),
                  renderizado junto com os outros modais raiz abaixo. */}
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
        onContinue={handleLotMismatchContinue}
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
      {/* O ClassificationReviewModal central foi substituido pelo
          ClassificationReviewSheetBody renderizado dentro do BottomSheet
          camera-preview-sheet (modo is-review). Mantem a sequencia visual
          processing → review continua, sem flash de close+open. O
          componente legado permanece em components/samples/ por enquanto
          (sem callers) — pendente de limpeza em proxima sessao. */}

      {/* Q.cls.2.8: Modal de selecao de tipo (entre revisao e classifiers).
          Click num tipo seta classificationType e avanca pro classifier
          modal. Voltar (seta no header) volta pro modal de revisao. */}
      <ClassificationTypeModal
        open={flowState === 'selecting-type' && (!!extractionResult || manualMode)}
        selectedType={classificationType}
        onBack={() => setFlowState('confirming')}
        onSelect={(type) => {
          setClassificationType(type);
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

      {/* Ficha nao detectada: modal de decisao (Tentar novamente / Continuar). */}
      <ClassificationDetectFailedModal
        open={flowState === 'detect-failed'}
        onRetake={resetClassificationFlow}
        onContinue={() => void handleContinueWithoutCrop()}
      />

      {/* Status invalido: validado no Avancar (entre review e tipo). */}
      <ClassificationStatusInvalidModal
        open={flowState === 'status-invalid'}
        onCancel={() => {
          if (hasContext) router.back();
          else resetClassificationFlow();
        }}
        onViewDetails={() => {
          const id = contextSampleId ?? resolvedSample?.id;
          if (id) router.push(`/samples/${id}`);
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
        currentUserId={session.user.id}
        selectedClassifiers={selectedClassifiers}
        availableUsers={availableUsers}
        loadingUsers={loadingUsers}
        userPickerError={userPickerError}
        onToggleUser={toggleClassifier}
        onRemoveClassifier={(id) =>
          setSelectedClassifiers((prev) => prev.filter((c) => c.id !== id))
        }
        onRetryLoad={() => {
          setAvailableUsers([]);
          void loadAvailableUsersOnce();
        }}
        onBack={() => setFlowState('selecting-type')}
        onContinue={handleClassifierContinue}
        saving={flowState === 'submitting'}
      />

      {/* Bottom sheet unico que cobre preview → processing → review.
          Estados: preview (foto + Tirar outra/Enviar), is-processing
          (spinner reduzido), is-review (form expandido com 22 campos).
          Transicoes naturais via transition de max-height ja configurada.
          Sem X, sem drag, sem tap-backdrop — controle pelos botoes do
          footer dinamico. */}
      <BottomSheet
        open={
          (flowState === 'preview' || isProcessingPhoto || isReviewingPhoto) &&
          Boolean(capturedPhotoUrl)
        }
        onClose={resetClassificationFlow}
        onDismissAttempt={() => Promise.resolve(false)}
        dragToDismiss={false}
        className={`camera-preview-sheet${isProcessingPhoto ? ' is-processing' : ''}${
          isReviewingPhoto ? ' is-review' : ''
        }`}
        title={
          isProcessingPhoto
            ? 'Processando'
            : isReviewingPhoto
              ? 'Revisar classificação'
              : 'Conferir foto'
        }
        ariaLabel={
          isProcessingPhoto
            ? 'Processando foto'
            : isReviewingPhoto
              ? 'Revisar dados extraídos'
              : 'Conferir foto capturada'
        }
        footer={
          isProcessingPhoto ? null : isReviewingPhoto ? (
            <div className="camera-preview-sheet-actions">
              <button
                type="button"
                className="camera-preview-sheet-action-secondary"
                onClick={resetClassificationFlow}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={REVIEW_FORM_ID}
                className="camera-preview-sheet-action-primary"
              >
                Avançar
              </button>
            </div>
          ) : (
            <div className="camera-preview-sheet-actions">
              <button
                type="button"
                className="camera-preview-sheet-action-secondary"
                onClick={resetClassificationFlow}
              >
                Tirar outra
              </button>
              <button
                type="button"
                className="camera-preview-sheet-action-primary"
                onClick={() => void handleSendPhoto()}
              >
                Enviar
              </button>
            </div>
          )
        }
      >
        {isProcessingPhoto ? (
          <div
            className="camera-preview-sheet-processing"
            role="status"
            aria-live="polite"
            key={flowState}
          >
            {flowState === 'detected' ? (
              <div className="camera-preview-sheet-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="camera-preview-sheet-spinner" aria-hidden="true" />
            )}
            <span className="camera-preview-sheet-processing-label">{processingMessage}</span>
          </div>
        ) : isReviewingPhoto ? (
          <ClassificationReviewSheetBody
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
            formId={REVIEW_FORM_ID}
            onAdvance={() => void handleReviewAdvance()}
          />
        ) : capturedPhotoUrl ? (
          <div className="camera-preview-sheet-body">
            {/* next/image nao se aplica: blob URL local com dimensoes dinamicas */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={capturedPhotoUrl}
              alt="Foto capturada para classificacao"
              className="camera-preview-sheet-img"
            />
          </div>
        ) : null}
      </BottomSheet>
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
