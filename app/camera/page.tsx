'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { SampleLookupResultModal } from '../../components/SampleLookupResultModal';
import {
  ApiError,
  type JsonValue,
  detectClassificationForm,
  extractAndPrepareClassification,
  extractFromDetectedForm,
  confirmClassificationFromCamera,
  resolveSampleByLot,
  resolveSampleByQr,
  getSampleDetail,
} from '../../lib/api-client';
import { compressImage } from '../../lib/compress-image';
import {
  type ClassificationFormState,
  EMPTY_CLASSIFICATION_FORM,
  CLASSIFICATION_TYPE_LABEL,
  mapExtractionToForm,
  validateClassificationForm,
  buildClassificationDataPayload,
  getTypeConfig,
} from '../../lib/classification-form';
import type {
  ClassificationType,
  ExtractAndPrepareResponse,
  ResolveSampleByLotResponse,
  ResolveSampleByQrResponse,
} from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { useFocusTrap } from '../../lib/use-focus-trap';

type QrScannerClass = typeof import('qr-scanner').default;
type QrScannerInstance = InstanceType<QrScannerClass>;

type ClassificationFlowState =
  | 'idle'
  | 'preview'
  | 'selecting-type'
  | 'detecting'
  | 'detected'
  | 'detect-failed'
  | 'extracting'
  | 'error'
  | 'confirming'
  | 'resolving'
  | 'overwrite-confirm'
  | 'not-found'
  | 'lot-mismatch'
  | 'submitting'
  | 'success';

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

// --- Classification Confirmation Modal ---

function ClassificationConfirmModal({
  mode,
  lotNumber,
  onLotNumberChange,
  form,
  onFormChange,
  onConfirm,
  onCancel,
  submitting,
  classificationType,
}: {
  mode: 'no-context' | 'with-context';
  lotNumber: string;
  onLotNumberChange?: (value: string) => void;
  form: ClassificationFormState;
  onFormChange: (key: keyof ClassificationFormState, value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
  classificationType: ClassificationType | null;
}) {
  const trapRef = useFocusTrap(true);
  const config = getTypeConfig(classificationType);

  const textFields: Array<{ key: keyof ClassificationFormState; label: string }> = [
    { key: 'padrao', label: 'Padrao' },
    { key: 'catacao', label: 'Catacao' },
    { key: 'aspecto', label: 'Aspecto' },
    { key: 'bebida', label: 'Bebida' },
    { key: 'safra', label: 'Safra' },
  ];

  const sieveFields = config?.sieveFields ?? [
    { key: 'peneiraP18' as const, label: 'P.18' },
    { key: 'peneiraP17' as const, label: 'P.17' },
    { key: 'peneiraP16' as const, label: 'P.16' },
    { key: 'peneiraMk' as const, label: 'MK' },
    { key: 'peneiraP15' as const, label: 'P.15' },
    { key: 'peneiraP14' as const, label: 'P.14' },
    { key: 'peneiraP13' as const, label: 'P.13' },
    { key: 'peneiraP10' as const, label: 'P.10' },
  ];

  const defectFields = config?.defectFields ?? [
    { key: 'broca' as const, label: 'Broca' },
    { key: 'pva' as const, label: 'PVA' },
    { key: 'imp' as const, label: 'Impureza' },
    { key: 'defeito' as const, label: 'Defeito' },
    { key: 'ap' as const, label: 'AP' },
    { key: 'gpi' as const, label: 'GPI' },
  ];

  const hasFundo2 = config?.hasFundo2 ?? true;
  const typeLabel = classificationType ?? 'Classificacao';

  const renderField = (
    f: { key: keyof ClassificationFormState; label: string },
    inputMode: 'text' | 'decimal' = 'text'
  ) => {
    const filled = !!form[f.key];
    return (
      <label key={f.key} className={`cam-cf-field${filled ? ' is-filled' : ''}`}>
        <span className="cam-cf-field-label">{f.label}</span>
        <input
          type="text"
          inputMode={inputMode}
          className="cam-cf-input"
          value={form[f.key]}
          onChange={(e) => onFormChange(f.key, e.target.value)}
          disabled={submitting}
          placeholder="\u2014"
        />
      </label>
    );
  };

  return (
    <div className="app-modal-backdrop" onClick={onCancel}>
      <section
        ref={trapRef}
        className="app-modal cam-cf-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar classificacao"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cam-cf-header">
          <h3 className="cam-cf-title">{typeLabel}</h3>
          <button
            type="button"
            className="app-modal-close cam-cf-close"
            onClick={onCancel}
            aria-label="Fechar"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="cam-cf-lot-bar">
          <svg
            className="cam-cf-lot-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          {mode === 'no-context' ? (
            <input
              type="text"
              className="cam-cf-lot-input"
              value={lotNumber}
              onChange={(e) => onLotNumberChange?.(e.target.value)}
              disabled={submitting}
              placeholder="Numero do lote"
            />
          ) : (
            <span className="cam-cf-lot-value">{lotNumber || '\u2014'}</span>
          )}
        </div>

        <div className="cam-cf-lot-bar cam-cf-certif-bar">
          <svg
            className="cam-cf-lot-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="9" r="6" />
            <path d="M8.5 14.2L7.5 21l4.5-2.5L16.5 21l-1-6.8" />
          </svg>
          <input
            type="text"
            className="cam-cf-lot-input"
            value={form.certif}
            onChange={(e) => onFormChange('certif', e.target.value)}
            disabled={submitting}
            placeholder="Certif. (ex: UTZ, RA, BIO)"
          />
        </div>

        <div className="cam-cf-body">
          <div className="cam-cf-section is-general">
            <div className="cam-cf-section-title">
              <span className="cam-cf-dot" />
              Geral
            </div>
            <div className="cam-cf-grid cam-cf-grid-2">{textFields.map((f) => renderField(f))}</div>
          </div>

          {sieveFields.length > 0 && (
            <div className="cam-cf-section is-sieves">
              <div className="cam-cf-section-title">
                <span className="cam-cf-dot" />
                Peneiras <span className="cam-cf-section-unit">%</span>
              </div>
              <div className="cam-cf-grid cam-cf-grid-4">
                {sieveFields.map((f) => renderField(f, 'decimal'))}
              </div>
            </div>
          )}

          <div className="cam-cf-section is-funds">
            <div className="cam-cf-section-title">
              <span className="cam-cf-dot" />
              Fundos
            </div>
            <div className="cam-cf-grid cam-cf-grid-4">
              {renderField({ key: 'fundo1Peneira', label: 'FD1 Pen.' })}
              {renderField({ key: 'fundo1Percent', label: 'FD1 %' }, 'decimal')}
              {hasFundo2 && renderField({ key: 'fundo2Peneira', label: 'FD2 Pen.' })}
              {hasFundo2 && renderField({ key: 'fundo2Percent', label: 'FD2 %' }, 'decimal')}
            </div>
          </div>

          {defectFields.length > 0 && (
            <div className="cam-cf-section is-defects">
              <div className="cam-cf-section-title">
                <span className="cam-cf-dot" />
                Defeitos e analises
              </div>
              <div className="cam-cf-grid cam-cf-grid-4">
                {defectFields.map((f) => renderField(f, 'decimal'))}
              </div>
            </div>
          )}

          <div className="cam-cf-section is-notes">
            <div className="cam-cf-section-title">
              <span className="cam-cf-dot" />
              Observacoes
            </div>
            <textarea
              className="cam-cf-input cam-cf-textarea"
              value={form.observacoes}
              onChange={(e) => onFormChange('observacoes', e.target.value)}
              disabled={submitting}
              placeholder="Pau, AP, umidade, ou qualquer observacao..."
              rows={3}
            />
          </div>
        </div>

        <div className="cam-cf-actions">
          <button
            type="button"
            className="cam-cf-btn-cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="cam-cf-btn-confirm"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  );
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
  const [detectedPhotoToken, setDetectedPhotoToken] = useState<string | null>(null);

  // Classification type selection
  const [classificationType, setClassificationType] = useState<ClassificationType | null>(null);

  // Lot editing (Flow A)
  const [editableLot, setEditableLot] = useState('');

  // Resolve result (Flow A)
  const [resolvedSample, setResolvedSample] = useState<ResolveSampleByLotResponse['sample'] | null>(
    null
  );

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
        flowState === 'error' ||
        flowState === 'not-found' ||
        flowState === 'lot-mismatch'
      ) {
        resetClassificationFlow();
      } else if (flowState === 'confirming' || flowState === 'overwrite-confirm') {
        resetClassificationFlow();
      }
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
        setStatusMessage('Nenhuma camera disponivel neste dispositivo.');
        return;
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
          ? 'Permita o uso da camera para leitura automatica de QR.'
          : 'Nao foi possivel usar a camera neste navegador.'
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
    setFlowError(null);
    setConfirmedSampleId(null);
    setEditableLot('');
    setResolvedSample(null);
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  }

  function captureFromVideoStream() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `classificacao-${Date.now()}.jpg`, { type: 'image/jpeg' });
        handlePhotoSelected(file);
      },
      'image/jpeg',
      0.92
    );
  }

  function handlePhotoSelected(file: File | null) {
    if (!file) return;

    const MAX_SIZE = 8 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setCameraError('A foto excede o limite de 8 MB.');
      return;
    }

    stopScanner();
    setCameraError(null);
    setCapturedPhoto(file);
    setCapturedPhotoUrl(URL.createObjectURL(file));
    setFlowState('preview');
  }

  async function handleSendPhoto() {
    if (!session || !capturedPhoto) return;

    setFlowState('detecting');
    setFlowError(null);

    try {
      const compressed = await compressImage(capturedPhoto);

      // Step 1: Detect form (fast, < 1s)
      const detection = await detectClassificationForm(session, compressed);
      if (!mountedRef.current) return;

      if (!detection.detected) {
        setDetectedPhotoToken(detection.photoToken);
        setFlowState('detect-failed');
        return;
      }

      // Step 2: Brief visual confirmation
      setFlowState('detected');
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (!mountedRef.current) return;

      // Step 3: Extract from cropped form
      setFlowState('extracting');
      const result = await extractFromDetectedForm(
        session,
        detection.photoToken,
        classificationType
      );
      if (!mountedRef.current) return;

      setExtractionResult(result);
      const extracted = mapExtractionToForm(result.extractedFields, classificationType);
      setClassificationForm((prev) => ({ ...prev, ...extracted }));
      setEditableLot(result.identification.lote ?? '');
      setFlowState('confirming');
    } catch (error) {
      if (!mountedRef.current) return;
      setFlowError(readErrorMessage(error, 'Falha na extracao. Tente novamente.'));
      setFlowState('error');
    }
  }

  async function handleContinueWithoutCrop() {
    if (!session || !capturedPhoto) return;

    setFlowState('extracting');
    setFlowError(null);

    try {
      const compressed = await compressImage(capturedPhoto);
      const result = detectedPhotoToken
        ? await extractFromDetectedForm(session, detectedPhotoToken, classificationType)
        : await extractAndPrepareClassification(session, compressed);
      if (!mountedRef.current) return;

      setExtractionResult(result);
      const extracted = mapExtractionToForm(result.extractedFields, classificationType);
      setClassificationForm((prev) => ({ ...prev, ...extracted }));
      setEditableLot(result.identification.lote ?? '');
      setFlowState('confirming');
    } catch (error) {
      if (!mountedRef.current) return;
      setFlowError(readErrorMessage(error, 'Falha na extracao. Tente novamente.'));
      setFlowState('error');
    }
  }

  function updateFormField(key: keyof ClassificationFormState, value: string) {
    setClassificationForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveClassification(sampleId: string) {
    if (!session || !extractionResult) return;

    setFlowState('submitting');
    setFlowError(null);

    try {
      const classificationData = buildClassificationDataPayload(classificationForm, {
        includeAutomaticDate: true,
        classificationType,
      });

      await confirmClassificationFromCamera(session, {
        sampleId,
        classificationData: classificationData as { [key: string]: JsonValue },
        photoToken: extractionResult.photoToken,
        classificationType,
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
    if (!session || !extractionResult) return;

    const validationError = validateClassificationForm(classificationForm, classificationType);
    if (validationError) {
      setFlowError(validationError);
      return;
    }

    if (hasContext && contextSampleId) {
      // Flow B: validate status and lot match
      if (
        contextSampleStatus &&
        contextSampleStatus !== 'QR_PRINTED' &&
        contextSampleStatus !== 'CLASSIFICATION_IN_PROGRESS' &&
        contextSampleStatus !== 'CLASSIFIED'
      ) {
        setFlowError('Amostra ainda nao foi impressa. Imprima a etiqueta antes de classificar.');
        return;
      }

      const extractedLot = normalizeLot(extractionResult.identification.lote);
      const sampleLot = normalizeLot(contextSampleLot);

      if (extractedLot && sampleLot && extractedLot !== sampleLot) {
        setFlowState('lot-mismatch');
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
          resolved.sample.status !== 'QR_PRINTED' &&
          resolved.sample.status !== 'CLASSIFICATION_IN_PROGRESS' &&
          resolved.sample.status !== 'CLASSIFIED'
        ) {
          setFlowError('Amostra ainda nao foi impressa. Imprima a etiqueta antes de classificar.');
          setFlowState('confirming');
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

  async function handleConfirmOverwrite() {
    if (!resolvedSample) return;
    await saveClassification(resolvedSample.id);
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

            {/* Gallery button — positioned relative to stage, not headline */}
            {flowState === 'idle' && cameraStatus === 'scanning' ? (
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
                    onClick={() => setFlowState('selecting-type')}
                  >
                    Enviar
                  </button>
                </div>
              ) : null}

              {/* Type selection */}
              {flowState === 'selecting-type' ? (
                <div
                  className="app-modal-backdrop cam-type-backdrop"
                  onClick={() => setFlowState('preview')}
                >
                  <section
                    className="app-modal cam-type-card"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Selecionar tipo de cafe"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <h3 className="cam-type-title">Qual o tipo do cafe?</h3>
                    <div className="cam-type-options">
                      {(['PREPARADO', 'LOW_CAFF', 'BICA'] as ClassificationType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          className="cam-type-btn"
                          onClick={() => {
                            setClassificationType(type);
                            void handleSendPhoto();
                          }}
                        >
                          {CLASSIFICATION_TYPE_LABEL[type]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="cam-type-cancel"
                      onClick={() => setFlowState('preview')}
                    >
                      Cancelar
                    </button>
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

      {/* Error overlay */}
      {flowState === 'error' && flowError ? (
        <div className="app-modal-backdrop" onClick={resetClassificationFlow}>
          <div className="app-modal cam-error-card" onClick={(e) => e.stopPropagation()}>
            <p className="cam-error-text">{flowError}</p>
            <button type="button" className="cam-error-btn" onClick={resetClassificationFlow}>
              Voltar
            </button>
          </div>
        </div>
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

      {/* Confirmation modal */}
      {(flowState === 'confirming' || flowState === 'submitting') && extractionResult ? (
        <>
          {flowError ? (
            <div className="cam-confirm-error" role="alert">
              {flowError}
            </div>
          ) : null}
          <ClassificationConfirmModal
            mode={hasContext ? 'with-context' : 'no-context'}
            lotNumber={hasContext ? (contextSampleLot ?? '') : editableLot}
            onLotNumberChange={hasContext ? undefined : setEditableLot}
            form={classificationForm}
            onFormChange={updateFormField}
            onConfirm={() => void handleConfirmClassification()}
            onCancel={resetClassificationFlow}
            submitting={flowState === 'submitting'}
            classificationType={classificationType}
          />
        </>
      ) : null}
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
