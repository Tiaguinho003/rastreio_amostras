'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BottomSheet } from '../BottomSheet';
import { ClassificationMetaStepBody, type MetaOpenField } from './ClassificationMetaStepBody';
import { type LookupKind, SampleLookupResultModal } from '../SampleLookupResultModal';
import { ClassificationDataMismatchModal } from '../samples/ClassificationDataMismatchModal';
import { ClassificationDiscardConfirmModal } from '../samples/ClassificationDiscardConfirmModal';
import { ClassificationDetectFailedModal } from '../samples/ClassificationDetectFailedModal';
import { ClassificationStatusInvalidModal } from '../samples/ClassificationStatusInvalidModal';
import { ClassificationExtractionErrorModal } from '../samples/ClassificationExtractionErrorModal';
import { ClassificationLotMismatchModal } from '../samples/ClassificationLotMismatchModal';
import { ClassificationManualConfirmModal } from '../samples/ClassificationManualConfirmModal';
import { ClassificationNotFoundModal } from '../samples/ClassificationNotFoundModal';
import {
  ClassificationReclassifyModal,
  type ReclassifyReasonCode,
} from '../samples/ClassificationReclassifyModal';
import { ClassificationReviewSheetBody } from '../samples/ClassificationReviewSheetBody';
import { ClassificationSuccessModal } from '../samples/ClassificationSuccessModal';
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
  getMetaStepBlocker,
  hasAnyExtractedValue,
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
  SessionData,
  UserLookupItem,
} from '../../lib/types';

type QrScannerClass = typeof import('qr-scanner').default;
type QrScannerInstance = InstanceType<QrScannerClass>;

// CAM-P3: o fluxo inteiro da camera (scanner QR + captura + classificacao)
// vive neste BOTTOM SHEET global (mobile-only), montado no AppShell via
// CameraSheetProvider e aberto pelo icone de camera do header de qualquer
// pagina (HeaderAvatarMenu) ou pelos botoes Classificar/Reclassificar do
// detalhe do lote (Flow B, com `sampleId`). Substitui a antiga pagina
// /camera — extraido de app/camera/page.tsx no ciclo CAM.
export interface CameraSheetProps {
  session: SessionData;
  /** Sheet visivel/ativo (estado do provider). */
  open: boolean;
  /** Flow B: amostra pre-selecionada (null = Flow A, scanner livre). */
  sampleId: string | null;
  /** Fecha o sheet por completo (provider.close). */
  onClose: () => void;
  /** Limpa o contexto Flow B mantendo o sheet aberto (sucesso → scanner). */
  onExitContext: () => void;
}

type ClassificationFlowState =
  | 'idle'
  | 'preview'
  // Rodada 2 (D2): etapa unica de tipo + classificadores, corpo do proprio
  // sheet. Substituiu os estados 'selecting-type'/'selecting-classifier', que
  // eram dois modais centrais empilhados sobre o sheet recolhido.
  | 'classification-meta'
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
  // do review (entre confirming e classification-meta).
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

// --- Camera Sheet (fluxo completo) ---

export function CameraSheet({ session, open, sampleId, onClose, onExitContext }: CameraSheetProps) {
  const router = useRouter();

  // Context mode: sampleId por PROP (Flow B) — substitui o ?sampleId= da URL.
  const contextSampleId = sampleId;
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
  // FIN3: se o backend disparou a impressao automatica da etiqueta nesta
  // classificacao (best-effort) — o modal de sucesso so afirma quando sim.
  const [printRequested, setPrintRequested] = useState(false);
  // Etapa "Tipo e classificadores" (D2): qual campo esta com a lista aberta e
  // se o tipo (obrigatorio) ja foi cobrado. O `openField` vive aqui porque o
  // dismiss do sheet (ESC / voltar do Android) precisa fechar a lista em vez
  // de perguntar sobre descartar a classificacao.
  const [metaOpenField, setMetaOpenField] = useState<MetaOpenField>(null);
  const [metaShowTypeError, setMetaShowTypeError] = useState(false);

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

  // CAM-D5: modal "Descartar classificação?" sobre o sheet de review. O
  // resolver pendente vive num ref pra que o onDismissAttempt do sheet e o
  // Cancelar do footer compartilhem a MESMA pergunta (o ESC do sheet e o
  // ESC do modal chegam no mesmo keydown — a reutilização evita reabrir).
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const discardPendingRef = useRef<{
    promise: Promise<boolean>;
    resolve: (discard: boolean) => void;
  } | null>(null);

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
  // e mostra o form de 7 secoes via ClassificationReviewSheetBody, mantendo
  // a transicao processing → review continua (sem flash de close+open).
  const isReviewingPhoto = flowState === 'confirming' && (!!extractionResult || manualMode);
  const REVIEW_FORM_ID = 'classification-review-form';

  // Etapa de tipo + classificadores (D2) e o SAVE — os dois moram no mesmo
  // sheet. O 'submitting' entra aqui porque antes ele nao tinha superficie
  // nenhuma: o modal de classificadores desmontava e o sheet ficava fechado,
  // deixando o operador olhando a pagina de tras por segundos (FIN1).
  const isMetaStep = flowState === 'classification-meta' && (!!extractionResult || manualMode);
  const isSubmitting = flowState === 'submitting';
  // Sem classificador o backend rejeitaria com 422 DEPOIS de subir a foto —
  // barramos antes. O tipo tambem e obrigatorio, mas com erro dentro do campo
  // (o botao continua clicavel pra que o operador VEJA o motivo).
  const metaBlocker = getMetaStepBlocker(classificationType, selectedClassifiers.length);

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
    if (!open || !contextSampleId || !session) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadContextSample();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contextSampleId, session, loadContextSample]);

  // Cleanup do contexto: quando o sampleId da prop vira null (sucesso limpa
  // via onExitContext, ou proxima abertura em Flow A), zeramos os states pra
  // evitar residuo entre aberturas/caminhos.
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

  // CAM-B2: o handler global de ESC da pagina foi removido — cada superficie
  // e dona do proprio dismiss: os modais Classification* e o
  // SampleLookupResultModal tem ESC interno, e o camera-preview-sheet decide
  // por estado via onDismissAttempt (preview livre, processamento bloqueado,
  // review com confirmacao de descarte — CAM-D5). O scroll-lock do body ja e
  // garantido pelo effect de mount da pagina.

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
    if (!open || !session) return;
    if (scannerBlocked) {
      stopScanner();
      return;
    }
    void ensureScannerStarted();
    return () => {
      stopScanner();
    };
  }, [ensureScannerStarted, open, scannerBlocked, session, stopScanner]);

  useEffect(() => {
    return () => {
      destroyScanner();
    };
  }, [destroyScanner]);

  // CAM-P3: o elemento <video> vive DENTRO do body do BottomSheet — ele
  // desmonta quando o sheet fecha ou troca de corpo (preview/review). O
  // QrScanner fica amarrado a UMA identidade de elemento, entao destruimos
  // no unmount do video e recriamos sob demanda (ensureScannerStarted recria
  // quando scannerRef e null; o callback ref dispara o restart no remount —
  // o effect acima roda ANTES do BottomSheet montar os filhos).
  const setVideoElement = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (el) {
        void restartScannerRef.current();
      } else {
        destroyScanner();
      }
    },
    [destroyScanner]
  );

  // Fechou o sheet por completo (provider) → zera o fluxo e o modal de QR
  // pra proxima abertura comecar limpa. O scanner ja para pelo unmount do
  // video + effect acima.
  useEffect(() => {
    if (open) return;
    resetClassificationFlow();
    setResult(null);
    setResultModalOpen(false);
    setResultModalKind('lookup');
    setStatusMessage(DEFAULT_STATUS_MESSAGE);
    setCameraError(null);
    // resetClassificationFlow e funcao local nao memoizada; reagir so a `open`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // --- Classification flow functions ---

  function resetClassificationFlow() {
    setFlowState('idle');
    setCapturedPhoto(null);
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
      setCapturedPhotoUrl(null);
    }
    setExtractionResult(null);
    // CAM-B1: o token pertence a UMA foto — sem limpar aqui, um fluxo novo
    // que falhe no detect (antes de setar o token novo) cairia no modo manual
    // com o token da foto ANTERIOR (temps vivem ~24h no server) e a
    // classificacao seria salva com a foto errada anexada.
    setDetectedPhotoToken(null);
    setClassificationForm(EMPTY_CLASSIFICATION_FORM);
    setClassificationType(null);
    setSelectedClassifiers([]);
    setAvailableUsers([]);
    setUserPickerError(null);
    setFlowError(null);
    setConfirmedSampleId(null);
    setPrintRequested(false);
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

  // CAM-D5: abre (ou reusa) a pergunta de descarte do review. Resolve true
  // quando o operador confirma "Descartar"; false em "Continuar"/ESC/backdrop.
  function askDiscardReview(): Promise<boolean> {
    if (discardPendingRef.current) return discardPendingRef.current.promise;
    let resolve!: (discard: boolean) => void;
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });
    discardPendingRef.current = { promise, resolve };
    setDiscardConfirmOpen(true);
    return promise;
  }

  function settleDiscard(discard: boolean) {
    setDiscardConfirmOpen(false);
    const pending = discardPendingRef.current;
    discardPendingRef.current = null;
    pending?.resolve(discard);
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
    // FIN7: mesmo prefetch do caminho com IA — no modo manual a etapa de
    // classificadores tambem vem logo depois da revisao.
    void loadAvailableUsersOnce();
    setFlowState('confirming');
  }

  async function captureFromVideoStream() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

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
    // CAM-B1: foto nova invalida o token da anterior (ver resetClassificationFlow).
    setDetectedPhotoToken(null);
    setCapturedPhoto(file);
    setCapturedPhotoUrl(URL.createObjectURL(file));
    setFlowState('preview');
  }

  // FIN7 (rodada 2): o "voce" e semeado a partir da SESSAO, nao da resposta do
  // lookup. Antes a auto-selecao morava dentro do fetch — uma falha de rede
  // deixava o operador sem nenhum classificador e travava o save por um dado
  // que o cliente ja tinha em maos.
  function seedSelfAsClassifier() {
    if (!session) return;
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
  }

  // Entrada na etapa de tipo + classificadores (D2). A lista de usuarios ja
  // vem pre-carregada desde o review (prefetch), entao o campo abre pronto.
  function enterMetaStep() {
    setFlowError(null);
    setMetaOpenField(null);
    setMetaShowTypeError(false);
    seedSelfAsClassifier();
    void loadAvailableUsersOnce();
    setFlowState('classification-meta');
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
      // CAM-G1: com token a foto ja esta no server — comprimir de novo
      // (canvas de ate 3072px) era CPU mobile gasta num resultado ignorado.
      const result = detectedPhotoToken
        ? await extractFromDetectedForm(session, detectedPhotoToken)
        : await extractAndPrepareClassification(session, await compressImage(capturedPhoto));
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
    // FIN7: prefetch da lista de classificadores durante a revisao (o operador
    // passa ~30s nela) — a etapa seguinte abre com o campo ja pronto em vez de
    // esperar a rede no primeiro toque.
    void loadAvailableUsersOnce();

    const lote = result.identification.lote ?? '';
    const sacas = result.identification.sacas ?? '';
    const safra = result.identification.safra ?? '';
    setEditableLot(lote);
    setEditableSacks(sacas);
    setEditableHarvest(safra);

    // EXT (rodada 1): servidor sem OPENAI_API_KEY responde 200 vazio com
    // extractionAvailable=false. Antes isso caia no "ilegivel" (motivo
    // errado) — agora vai direto pra confirmacao do modo manual.
    if (result.extractionAvailable === false) {
      setFlowError('Leitura automatica desativada neste servidor.');
      setManualConfirmSource('technical');
      setFlowState('manual-confirm');
      return;
    }

    if (hasContext && !lote) {
      setFlowState('extraction-error-illegible');
      return;
    }

    // EXT (rodada 1): Flow A com NADA extraido (nem identificacao, nem
    // campos) abria o review 100% vazio sem explicacao. Cai no mesmo aviso
    // de ilegivel do Flow B — o operador escolhe tirar outra ou ir de manual.
    if (!hasContext && !lote && !sacas && !safra && !hasAnyExtractedValue(result.extractedFields)) {
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
    // FIN8: o mismatch de lote e alcancavel por dois caminhos — a deteccao
    // precoce (logo apos a extracao, volta pro review) e o Confirmar em modo
    // manual (volta pra etapa de tipo/classificadores, de onde o operador
    // veio). O tipo ja escolhido distingue os dois.
    setFlowState(classificationType ? 'classification-meta' : 'confirming');
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
    let photoToken = manualMode ? detectedPhotoToken : (extractionResult?.photoToken ?? null);

    // EXT (rodada 1): se o DETECT falhou por rede, o modo manual chegava aqui
    // sem token nenhum e morria em "Foto invalida" DEPOIS do operador
    // preencher a ficha inteira. A foto ainda esta em memoria — sobe agora
    // pra obter o token (o save exige a foto anexada como evidencia).
    if (!photoToken && manualMode && capturedPhoto) {
      setFlowState('submitting');
      setFlowError(null);
      try {
        const compressed = await compressImage(capturedPhoto);
        const detection = await detectClassificationForm(session, compressed);
        if (!mountedRef.current) return;
        photoToken = detection.photoToken;
        setDetectedPhotoToken(detection.photoToken);
      } catch {
        if (!mountedRef.current) return;
      }
    }

    if (!photoToken) {
      setFlowError('Foto invalida ou expirada. Tire outra foto.');
      setFlowState('classification-meta');
      return;
    }

    setFlowState('submitting');
    setFlowError(null);

    try {
      const classificationData = buildClassificationDataPayload(classificationForm);

      // Classifiers = [actor, ...co-classificadores selecionados]. Backend
      // valida existencia/ativo dos usuarios e normaliza snapshots.
      const classifiers = selectedClassifiers.map((entry) => ({ userId: entry.id }));

      // Q.cls.2.7: reasonCode/reasonText vem do ClassificationReclassifyModal
      // quando sample esta CLASSIFIED (sub-caminho 5). Em new classification
      // ficam null; o backend ignora.
      const saved = await confirmClassificationFromCamera(session, {
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
      // FIN3: o sucesso so afirma impressao quando o backend disparou de fato.
      setPrintRequested(saved.autoPrintRequested === true);
      setFlowState('success');
    } catch (error) {
      if (!mountedRef.current) return;
      // FIN5: o erro volta pra PROPRIA etapa (que agora tem banner de erro),
      // em vez de jogar o operador no topo da ficha de 26 campos com o tipo e
      // os classificadores fora de vista.
      setFlowError(readErrorMessage(error, 'Falha ao salvar classificacao.'));
      setFlowState('classification-meta');
    }
  }

  // Avancar do review (apos a validacao numerica da propria sheet): identifica
  // a amostra e valida o status ANTES do modal de tipo. Flow B: usa o status do
  // contexto. Flow A: resolve o lote agora (resolve + not-found + status cedo),
  // em vez de so no Confirmar.
  async function handleReviewAdvance() {
    if (!session) return;

    if (hasContext && contextSampleId) {
      // CAM-G3: o status carregado no mount pode estar obsoleto (outro
      // operador pode classificar a mesma amostra durante o fluxo, pulando
      // o portao de reclassificacao client-side). Revalida agora e atualiza
      // os dados de contexto — a reconciliacao de sacas/safra no confirmar
      // tambem passa a comparar com valores frescos. O backend segue
      // protegendo o status com 409 no save.
      setFlowState('resolving');
      setFlowError(null);
      let freshStatus: string | null = null;
      try {
        const detail = await getSampleDetail(session, contextSampleId);
        if (!mountedRef.current) return;
        if (!detail?.sample) {
          throw new Error('Amostra indisponivel. Tente novamente.');
        }
        freshStatus = detail.sample.status;
        setContextSampleLot(detail.sample.internalLotNumber ?? null);
        setContextSampleStatus(detail.sample.status);
        setContextSampleSacks(detail.sample.declared?.sacks ?? null);
        setContextSampleHarvest(detail.sample.declared?.harvest ?? null);
      } catch (error) {
        if (!mountedRef.current) return;
        setFlowError(readErrorMessage(error, 'Falha ao buscar amostra.'));
        setFlowState('confirming');
        return;
      }
      if (freshStatus !== 'REGISTRATION_CONFIRMED' && freshStatus !== 'CLASSIFIED') {
        setFlowState('status-invalid');
        return;
      }
      enterMetaStep();
      return;
    }

    // Flow A: resolve o lote agora pra validar status/existencia cedo.
    // Lote obrigatorio ja e validado inline na sheet (review) ANTES do
    // onAdvance — aqui so um guard defensivo, sem banner (pra nao duplicar
    // o erro inline; ver skill feedback-messages §8).
    const lot = editableLot.trim();
    if (!lot) return;
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
      enterMetaStep();
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
      // CAM-G2: sem voltar pro review, o erro ficava invisivel (o modal de
      // classificadores nao exibe flowError) e o Continuar virava botao morto.
      setFlowError(validationError);
      setFlowState('confirming');
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

  // Abrir o DETALHE do lote a partir do sheet. Desde a F2 do redesign o
  // detalhe e um overlay sobre a lista (?lote=) — daqui saem 3 casos, lendo
  // window.location NO CLIQUE (o sheet e global; useSearchParams nao
  // re-renderizaria com a URL de quem esta atras):
  // - ja em /samples com ESTE lote aberto: no-op (so fecha o sheet; o
  //   watcher pos-camera do detalhe rebusca os dados);
  // - ja em /samples com OUTRO lote aberto: replace (mantem UMA entry);
  // - qualquer outra rota: push.
  // GOTCHA do BottomSheet mantido (design-system §sheet): o cleanup do close
  // desfaz a entry de history via history.back(), que corre contra o
  // router.push assincrono e DESFAZ a navegacao. Limpamos o marcador antes,
  // fechamos o sheet (provider) e so entao navegamos.
  function navigateToSample(id: string) {
    if (typeof window !== 'undefined' && window.history.state?.bottomSheet) {
      window.history.replaceState({ ...window.history.state, bottomSheet: false }, '');
    }
    onClose();
    const { pathname, search } = window.location;
    if (pathname === '/samples') {
      const params = new URLSearchParams(search);
      const currentLote = params.get('lote');
      if (currentLote === id) {
        return;
      }
      // Residuais de deep-link do lote anterior nao valem pro proximo
      // (mesma limpeza do openLote da lista).
      params.delete('focus');
      params.delete('highlight');
      params.delete('source');
      params.set('lote', id);
      const url = `/samples?${params.toString()}`;
      if (currentLote) {
        router.replace(url);
      } else {
        router.push(url);
      }
      return;
    }
    router.push(`/samples?lote=${id}`);
  }

  function handleOpenSampleDetails() {
    if (!result) return;
    setResultModalOpen(false);
    setResultModalKind('lookup');
    navigateToSample(result.sample.id);
  }

  // Bloco F2 (Frente C): handler de "Tentar novamente" quando a camera
  // esta em permission-denied ou unsupported. Re-dispara ensureScannerStarted
  // (idempotente — recria scanner se necessario e atualiza cameraStatus).
  function handleRetryCamera() {
    void ensureScannerStarted();
  }

  // --- Render ---

  // CAM-P3: sheet visivel no scanner (idle) e nos estados de foto; recolhe
  // pros modais centrais (como o camera-preview-sheet ja fazia) e pro modal
  // de resultado do QR. Dismiss do sheet: idle fecha por completo (provider);
  // preview/review (via onDismissAttempt) descartam e VOLTAM pro scanner.
  const isScanner = flowState === 'idle';
  const sheetOpen =
    open &&
    !resultModalOpen &&
    (isScanner ||
      ((flowState === 'preview' ||
        isProcessingPhoto ||
        isReviewingPhoto ||
        isMetaStep ||
        isSubmitting) &&
        Boolean(capturedPhotoUrl)));

  function handleSheetDismissed() {
    if (flowState === 'idle') {
      onClose();
      return;
    }
    // preview/review/etapa: descarte ja confirmado pelo onDismissAttempt —
    // volta pro scanner sem fechar o sheet (flowState vira 'idle').
    resetClassificationFlow();
  }

  // Dismiss por estado (CAM-D5 + rodada 2). Sem um branch aqui o estado cai no
  // `false` default e, como este sheet nao tem X nem drag, o operador fica
  // preso: backdrop/ESC/voltar param de responder.
  function handleSheetDismissAttempt(): boolean | Promise<boolean> {
    // Lista aberta na etapa: o ESC/voltar fecha SO a lista. O dropdown e o
    // sheet escutam ESC no mesmo document — sem isto, um ESC fecharia a lista
    // e abriria "Descartar classificacao?" de uma vez.
    if (isMetaStep && metaOpenField !== null) {
      setMetaOpenField(null);
      return false;
    }
    if (isScanner || flowState === 'preview') return true;
    // Chamadas em voo (detect/extract/resolve) e o save nao podem ser
    // interrompidos: abandonar o 'submitting' deixaria a promise em voo
    // abrindo o sucesso sobre um fluxo ja resetado.
    if (isProcessingPhoto || isSubmitting) return false;
    if (isReviewingPhoto || isMetaStep) return askDiscardReview();
    return false;
  }

  const viewfinder = (
    <>
      <div className="camera-sheet-stage">
        <video ref={setVideoElement} className="camera-hub-video" autoPlay muted playsInline />
        <div
          ref={overlayRef}
          className={`camera-hub-overlay${hasContext ? ' is-no-scan' : ''}`}
          aria-hidden="true"
        />

        {/* Card de erro unificado: getUserMedia falhou (permission-denied ou
            unsupported). Mensagem fixa em pt-BR + atalho "Usar galeria"
            (acao que sempre funciona, independente da permissao). */}
        {cameraStatus === 'permission-denied' || cameraStatus === 'unsupported' ? (
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

        {/* Gallery button — sempre visivel no scanner (Fase Q.cls.2): galeria
            livre com camera OK, e o unico caminho quando a camera falha. */}
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

        <div className="camera-hub-bottom-area">
          {/* "Classificando lote X" (Flow B com lote carregado). Flow A e
              silencioso — o QR scanner segue ativo internamente. */}
          {cameraStatus === 'scanning' && hasContext && contextSampleLot ? (
            <div className="camera-hub-scan-indicator">
              <span className="camera-hub-scan-label">Classificando lote {contextSampleLot}</span>
            </div>
          ) : null}

          {/* Captura direto do stream. No Flow B fica desabilitado ate o
              contexto carregar (evita captura sem contexto valido). */}
          {cameraStatus === 'scanning' ? (
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
        </div>
      </div>

      {/* input da galeria fora do stage (invisivel; sobrevive aos overlays) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handlePhotoSelected(e.target.files?.[0] ?? null)}
      />

      {/* Linhas de status/erro ABAIXO do viewfinder (eram do headline da
          pagina antiga). Erros de inicializacao ja tem o card no stage. */}
      <div className="camera-sheet-status-area">
        {showStatusText &&
        cameraError &&
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

        {hasContext && contextSampleLoading && !contextSampleError ? (
          <p className="camera-hub-status-text" role="status">
            Carregando amostra...
          </p>
        ) : null}

        {hasContext && contextSampleError ? (
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
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      {/* QR result modal — kind decide variante (lookup/invalidated/classified) */}
      {result && resultModalOpen ? (
        <SampleLookupResultModal
          sample={result.sample}
          kind={resultModalKind}
          title="Amostra localizada"
          onDetails={handleOpenSampleDetails}
          detailsLabel="Ver detalhes"
          onClose={handleCloseResultModal}
        />
      ) : null}

      {/* Modal central de sucesso pos-classificacao (Bloco F1, frente B). */}
      <ClassificationSuccessModal
        open={flowState === 'success' && Boolean(confirmedSampleId)}
        lotNumber={resolvedSample?.internalLotNumber ?? contextSampleLot ?? ''}
        isReclassification={
          // CAM-B3: no Flow A (sem contexto) a reclassificacao chega via
          // resolvedSample — so contextSampleStatus mostrava copy errada.
          contextSampleStatus === 'CLASSIFIED' || resolvedSample?.status === 'CLASSIFIED'
        }
        printRequested={printRequested}
        onViewDetails={() => {
          if (confirmedSampleId) navigateToSample(confirmedSampleId);
        }}
        onClose={() => {
          // Sucesso fechado → volta pro scanner limpo (Flow A), com o sheet
          // aberto — equivalente ao antigo router.push('/camera').
          resetClassificationFlow();
          onExitContext();
        }}
      />

      {/* Q.cls.2 sub-caminho 2: lote diverge. Mostra valores comparados +
          miniatura da foto. */}
      <ClassificationLotMismatchModal
        open={flowState === 'lot-mismatch'}
        extractedLot={editableLot || extractionResult?.identification.lote || null}
        expectedLot={contextSampleLot}
        photoUrl={capturedPhotoUrl}
        onCancel={onClose}
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
        // FIN4: cancelar aqui jogava a ficha inteira fora SEM perguntar,
        // contra a CAM-D5 — e a essa altura o operador ja preencheu revisao,
        // tipo e classificadores.
        onCancel={() => {
          void askDiscardReview().then((discard) => {
            if (discard) resetClassificationFlow();
            else setFlowState('classification-meta');
          });
        }}
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
        // FIN8: "Voltar" retorna a etapa ANTERIOR (tipo/classificadores), nao
        // ao topo da ficha — o operador acabou de sair de la.
        onBack={() => setFlowState('classification-meta')}
        onCancel={() => {
          if (hasContext) onClose();
          else resetClassificationFlow();
        }}
        onConfirm={() => void handleConfirmOverwrite()}
        saving={false}
      />

      {/* Amostra nao encontrada (Flow A legacy fallback). */}
      <ClassificationNotFoundModal
        open={flowState === 'not-found'}
        lot={editableLot}
        onBack={() => setFlowState('confirming')}
        onCancel={resetClassificationFlow}
      />

      {/* Q.cls.2.3: a revisao da ficha unificada vive no
          ClassificationReviewSheetBody, dentro do BottomSheet
          camera-preview-sheet (modo is-review) — sequencia visual
          processing → review continua, sem flash de close+open. Avancar
          dispara o modal de tipo (Q.cls.2.8); save final apos o
          classifier-modal. Em modo manual (3b), lote/sacas/safra ficam
          editaveis pre-preenchidos com valores do sample em context. */}

      {/* Q.cls.2 sub-caminho 3a: lote ilegivel apos extracao OK.
          F3.10 expandida: tambem oferece "Continuar manual" preservando
          a extracao parcial (peneiras/fundos/etc que vieram OK). */}
      <ClassificationExtractionErrorModal
        open={flowState === 'extraction-error-illegible'}
        kind="illegible"
        onCancel={() => {
          if (hasContext) onClose();
          else resetClassificationFlow();
        }}
        onRetake={resetClassificationFlow}
        onContinueManual={() => {
          setManualConfirmSource('illegible');
          setFlowState('manual-confirm');
        }}
      />

      {/* Q.cls.2 sub-caminho 3b: erro tecnico (timeout, OpenAI offline).
          4 opcoes: tentar de novo com a MESMA foto (EXT rodada 1 — com token
          nao recomprime nem re-detecta), tirar outra, continuar manual,
          cancelar. */}
      <ClassificationExtractionErrorModal
        open={flowState === 'extraction-error-technical'}
        kind="technical"
        technicalDetail={flowError}
        onCancel={() => {
          if (hasContext) onClose();
          else resetClassificationFlow();
        }}
        onRetake={resetClassificationFlow}
        onRetry={() => {
          if (detectedPhotoToken) void handleContinueWithoutCrop();
          else void handleSendPhoto();
        }}
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
          if (hasContext) onClose();
          else resetClassificationFlow();
        }}
        onViewDetails={() => {
          const id = contextSampleId ?? resolvedSample?.id;
          if (id) navigateToSample(id);
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

      {/* CAM-D5: confirmação de descarte do review — empilha SOBRE o sheet
          (portal + is-stacked). Acionado por Cancelar/ESC/voltar do Android. */}
      <ClassificationDiscardConfirmModal
        open={discardConfirmOpen}
        onKeep={() => settleDiscard(false)}
        onDiscard={() => settleDiscard(true)}
      />

      {/* Bottom sheet UNICO do fluxo (CAM-P3): scanner → preview →
          processing → review → tipo/classificadores → save no mesmo sheet,
          trocando corpo/titulo/footer por estado (molde NewSampleModal). Sem
          X, sem drag; dismiss por estado via onDismissAttempt (CAM-D5).
          ⚠️ Toda cadeia abaixo termina no ramo do PREVIEW da foto — um estado
          novo esquecido em qualquer uma cai silenciosamente em "Conferir foto"
          (cujo "Enviar" redispara detect+extract num fluxo ja consumido). */}
      <BottomSheet
        open={sheetOpen}
        onClose={handleSheetDismissed}
        onDismissAttempt={handleSheetDismissAttempt}
        dragToDismiss={false}
        className={`camera-preview-sheet${isScanner ? ' is-scanner' : ''}${
          isProcessingPhoto ? ' is-processing' : ''
        }${isReviewingPhoto ? ' is-review' : ''}${isMetaStep || isSubmitting ? ' is-meta' : ''}`}
        title={
          isScanner
            ? 'Câmera'
            : isProcessingPhoto
              ? 'Processando'
              : isReviewingPhoto
                ? 'Revisar classificação'
                : isMetaStep || isSubmitting
                  ? 'Tipo e classificadores'
                  : 'Conferir foto'
        }
        ariaLabel={
          isScanner
            ? 'Câmera e leitor de QR'
            : isProcessingPhoto
              ? 'Processando foto'
              : isReviewingPhoto
                ? 'Revisar dados extraídos'
                : isMetaStep || isSubmitting
                  ? 'Tipo do grão e classificadores'
                  : 'Conferir foto capturada'
        }
        footer={
          isScanner || isProcessingPhoto ? null : isMetaStep || isSubmitting ? (
            <div className="camera-preview-sheet-actions">
              <button
                type="button"
                className="camera-preview-sheet-action-secondary"
                disabled={isSubmitting}
                onClick={() => {
                  setMetaOpenField(null);
                  setFlowError(null);
                  setFlowState('confirming');
                }}
              >
                Voltar
              </button>
              <button
                type="button"
                className="camera-preview-sheet-action-primary"
                disabled={isSubmitting || metaBlocker === 'classifiers'}
                onClick={() => {
                  setMetaOpenField(null);
                  if (metaBlocker === 'type') {
                    setMetaShowTypeError(true);
                    return;
                  }
                  if (metaBlocker) return;
                  void handleConfirmClassification();
                }}
              >
                {isSubmitting ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          ) : isReviewingPhoto ? (
            <div className="camera-preview-sheet-actions">
              <button
                type="button"
                className="camera-preview-sheet-action-secondary"
                onClick={() => {
                  // CAM-D5: mesmo portão do ESC/voltar — o review preenchido
                  // não é descartado sem confirmação.
                  void askDiscardReview().then((discard) => {
                    if (discard) resetClassificationFlow();
                  });
                }}
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
        {isScanner ? (
          viewfinder
        ) : isProcessingPhoto ? (
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
        ) : isMetaStep || isSubmitting ? (
          <div className="new-sample-step-content">
            <ClassificationMetaStepBody
              selectedType={classificationType}
              onSelectType={(type) => {
                setClassificationType(type);
                setMetaShowTypeError(false);
              }}
              currentUserId={session.user.id}
              availableUsers={availableUsers}
              selectedClassifiers={selectedClassifiers}
              onToggleUser={toggleClassifier}
              onRemoveClassifier={(id) =>
                setSelectedClassifiers((prev) => prev.filter((c) => c.id !== id))
              }
              loadingUsers={loadingUsers}
              userPickerError={userPickerError}
              onRetryLoad={() => {
                setAvailableUsers([]);
                setUserPickerError(null);
                void loadAvailableUsersOnce();
              }}
              errorMessage={flowError}
              showTypeError={metaShowTypeError}
              saving={isSubmitting}
              openField={metaOpenField}
              onOpenFieldChange={setMetaOpenField}
            />
          </div>
        ) : isReviewingPhoto ? (
          <ClassificationReviewSheetBody
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
    </>
  );
}
