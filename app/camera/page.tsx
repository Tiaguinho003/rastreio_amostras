'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { SampleLookupResultModal } from '../../components/SampleLookupResultModal';
import {
  ApiError,
  type JsonValue,
  extractAndPrepareClassification,
  confirmClassificationFromCamera,
  resolveSampleByLot,
  resolveSampleByQr,
  getSampleDetail
} from '../../lib/api-client';
import { compressImage } from '../../lib/compress-image';
import {
  type ClassificationFormState,
  EMPTY_CLASSIFICATION_FORM,
  mapExtractionToForm,
  validateClassificationForm,
  buildClassificationDataPayload
} from '../../lib/classification-form';
import type { ExtractAndPrepareResponse, ResolveSampleByLotResponse, ResolveSampleByQrResponse } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { useFocusTrap } from '../../lib/use-focus-trap';

type QrScannerClass = typeof import('qr-scanner').default;
type QrScannerInstance = InstanceType<QrScannerClass>;

type ClassificationFlowState =
  | 'idle'
  | 'preview'
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
  submitting
}: {
  mode: 'no-context' | 'with-context';
  lotNumber: string;
  onLotNumberChange?: (value: string) => void;
  form: ClassificationFormState;
  onFormChange: (key: keyof ClassificationFormState, value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const trapRef = useFocusTrap(true);

  const textFields: Array<{ key: keyof ClassificationFormState; label: string }> = [
    { key: 'padrao', label: 'Padrao' },
    { key: 'catacao', label: 'Catacao' },
    { key: 'aspecto', label: 'Aspecto' },
    { key: 'bebida', label: 'Bebida' }
  ];

  const defectFields: Array<{ key: keyof ClassificationFormState; label: string }> = [
    { key: 'defeito', label: 'Defeitos' },
    { key: 'broca', label: 'Broca' },
    { key: 'pva', label: 'PVA' },
    { key: 'imp', label: 'Impureza' },
    { key: 'pau', label: 'Pau' },
    { key: 'ap', label: 'AP' },
    { key: 'gpi', label: 'GPI' },
    { key: 'umidade', label: 'Umidade %' }
  ];

  const sieveFields: Array<{ key: keyof ClassificationFormState; label: string }> = [
    { key: 'peneiraP18', label: 'P.18 %' },
    { key: 'peneiraP17', label: 'P.17 %' },
    { key: 'peneiraP16', label: 'P.16 %' },
    { key: 'peneiraMk', label: 'MK %' },
    { key: 'peneiraP15', label: 'P.15 %' },
    { key: 'peneiraP14', label: 'P.14 %' },
    { key: 'peneiraP13', label: 'P.13 %' },
    { key: 'peneiraP10', label: 'P.10 %' }
  ];

  const fundoFields: Array<{ key: keyof ClassificationFormState; label: string }> = [
    { key: 'fundo1Peneira', label: 'FD1 Pen.' },
    { key: 'fundo1Percent', label: 'FD1 %' },
    { key: 'fundo2Peneira', label: 'FD2 Pen.' },
    { key: 'fundo2Percent', label: 'FD2 %' }
  ];

  return (
    <div className="app-modal-backdrop" onClick={onCancel}>
      <section
        ref={trapRef}
        className="app-modal cam-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar classificacao"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cam-confirm-header">
          <h3 className="cam-confirm-title">Confirmar classificacao</h3>
          <button type="button" className="app-modal-close" onClick={onCancel} aria-label="Cancelar">
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="cam-confirm-sample-info">
          {mode === 'no-context' ? (
            <label className="cam-confirm-lot-field">
              <span className="cam-confirm-field-label"><strong>Lote</strong></span>
              <input
                type="text"
                className="cam-confirm-input cam-confirm-lot-input"
                value={lotNumber}
                onChange={(e) => onLotNumberChange?.(e.target.value)}
                disabled={submitting}
                placeholder="Numero do lote"
              />
            </label>
          ) : (
            <span><strong>Lote:</strong> {lotNumber || '\u2014'}</span>
          )}
        </div>

        <div className="cam-confirm-body">
          <fieldset className="cam-confirm-section">
            <legend>Geral</legend>
            <div className="cam-confirm-grid cam-confirm-grid-2">
              {textFields.map(f => (
                <label key={f.key} className="cam-confirm-field">
                  <span className="cam-confirm-field-label">{f.label}</span>
                  <input
                    type="text"
                    className="cam-confirm-input"
                    value={form[f.key]}
                    onChange={(e) => onFormChange(f.key, e.target.value)}
                    disabled={submitting}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="cam-confirm-section">
            <legend>Peneiras %</legend>
            <div className="cam-confirm-grid cam-confirm-grid-4">
              {sieveFields.map(f => (
                <label key={f.key} className="cam-confirm-field">
                  <span className="cam-confirm-field-label">{f.label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="cam-confirm-input"
                    value={form[f.key]}
                    onChange={(e) => onFormChange(f.key, e.target.value)}
                    disabled={submitting}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="cam-confirm-section">
            <legend>Fundos</legend>
            <div className="cam-confirm-grid cam-confirm-grid-4">
              {fundoFields.map(f => (
                <label key={f.key} className="cam-confirm-field">
                  <span className="cam-confirm-field-label">{f.label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="cam-confirm-input"
                    value={form[f.key]}
                    onChange={(e) => onFormChange(f.key, e.target.value)}
                    disabled={submitting}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="cam-confirm-section">
            <legend>Defeitos e analises</legend>
            <div className="cam-confirm-grid cam-confirm-grid-4">
              {defectFields.map(f => (
                <label key={f.key} className="cam-confirm-field">
                  <span className="cam-confirm-field-label">{f.label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="cam-confirm-input"
                    value={form[f.key]}
                    onChange={(e) => onFormChange(f.key, e.target.value)}
                    disabled={submitting}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="cam-confirm-actions">
          <button type="button" className="cam-confirm-btn-cancel" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className="cam-confirm-btn-confirm" onClick={onConfirm} disabled={submitting}>
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
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // QR Scanner state
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'scanning' | 'permission-denied' | 'unsupported'>('idle');
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
  const [classificationForm, setClassificationForm] = useState<ClassificationFormState>(EMPTY_CLASSIFICATION_FORM);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [confirmedSampleId, setConfirmedSampleId] = useState<string | null>(null);

  // Context sample (Flow B)
  const [contextSampleLot, setContextSampleLot] = useState<string | null>(null);

  // Lot editing (Flow A)
  const [editableLot, setEditableLot] = useState('');

  // Resolve result (Flow A)
  const [resolvedSample, setResolvedSample] = useState<ResolveSampleByLotResponse['sample'] | null>(null);

  const scannerBlocked = resultModalOpen || flowState !== 'idle';
  const showStatusText = Boolean(cameraError) || cameraStatus !== 'scanning';

  // --- Lifecycle ---

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Load context sample lot (Flow B)
  useEffect(() => {
    if (!contextSampleId || !session) return;
    let cancelled = false;
    getSampleDetail(session, contextSampleId).then((detail) => {
      if (!cancelled && detail?.sample) {
        setContextSampleLot(detail.sample.internalLotNumber ?? null);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
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
      } else if (flowState === 'preview' || flowState === 'error' || flowState === 'not-found' || flowState === 'lot-mismatch') {
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
      setCameraStatus((current) => (current === 'unsupported' || current === 'permission-denied' ? current : 'idle'));
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
      if (previousScan && previousScan.value === normalizedValue && now - previousScan.at < REPEATED_SCAN_WINDOW_MS) return;

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
        const module = await import('qr-scanner');
        scannerClassRef.current = module.default;
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
          (decoded) => { void handleDecodedQr(decoded.data); },
          {
            preferredCamera: 'environment',
            maxScansPerSecond: 12,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            overlay: overlayRef.current ?? undefined,
            returnDetailedScanResult: true,
            onDecodeError: () => {}
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

  useEffect(() => { restartScannerRef.current = ensureScannerStarted; }, [ensureScannerStarted]);

  useEffect(() => {
    if (loading || !session) return;
    if (scannerBlocked) { stopScanner(); return; }
    void ensureScannerStarted();
    return () => { stopScanner(); };
  }, [ensureScannerStarted, loading, scannerBlocked, session, stopScanner]);

  useEffect(() => { return () => { destroyScanner(); }; }, [destroyScanner]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
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
    setFlowError(null);
    setConfirmedSampleId(null);
    setEditableLot('');
    setResolvedSample(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
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

    setFlowState('extracting');
    setFlowError(null);

    try {
      const compressed = await compressImage(capturedPhoto);
      const result = await extractAndPrepareClassification(session, compressed);

      if (!mountedRef.current) return;

      setExtractionResult(result);
      const extracted = mapExtractionToForm(result.extractedFields);
      setClassificationForm(prev => ({ ...prev, ...extracted }));
      setEditableLot(result.identification.lote ?? '');
      setFlowState('confirming');
    } catch (error) {
      if (!mountedRef.current) return;
      setFlowError(readErrorMessage(error, 'Falha na extracao. Tente novamente.'));
      setFlowState('error');
    }
  }

  function updateFormField(key: keyof ClassificationFormState, value: string) {
    setClassificationForm(prev => ({ ...prev, [key]: value }));
  }

  async function saveClassification(sampleId: string) {
    if (!session || !extractionResult) return;

    setFlowState('submitting');
    setFlowError(null);

    try {
      const classificationData = buildClassificationDataPayload(classificationForm, { includeAutomaticDate: true });

      await confirmClassificationFromCamera(session, {
        sampleId,
        classificationData: classificationData as { [key: string]: JsonValue },
        photoToken: extractionResult.photoToken
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

    const validationError = validateClassificationForm(classificationForm);
    if (validationError) {
      setFlowError(validationError);
      return;
    }

    if (hasContext && contextSampleId) {
      // Flow B: validate lot match
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
            {/* Camera feed — hidden during preview/success */}
            {flowState !== 'preview' && flowState !== 'success' ? (
              <>
                <video ref={videoRef} className="camera-hub-video" autoPlay muted playsInline />
                <div ref={overlayRef} className="camera-hub-overlay" aria-hidden="true" />
              </>
            ) : null}

            {/* Photo preview */}
            {flowState === 'preview' && capturedPhotoUrl ? (
              <img src={capturedPhotoUrl} className="camera-hub-preview-img" alt="Foto capturada" />
            ) : null}

            {/* Top header */}
            <div className="camera-hub-headline">
              <button type="button" className="camera-hub-back-btn" onClick={() => {
                if (flowState !== 'idle') {
                  resetClassificationFlow();
                } else {
                  router.back();
                }
              }} aria-label="Voltar">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              </button>

              {/* Gallery button */}
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

              {showStatusText && cameraError && flowState === 'idle' ? (
                <p className="camera-hub-status-text camera-hub-status-text-error" role="alert">
                  {cameraError}
                </p>
              ) : null}
            </div>

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

              {/* Capture button */}
              {flowState === 'idle' && cameraStatus === 'scanning' ? (
                <div className="camera-hub-capture-area">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => handlePhotoSelected(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className="camera-hub-capture-btn"
                    onClick={() => photoInputRef.current?.click()}
                    aria-label="Tirar foto para classificacao"
                  >
                    <span className="camera-hub-capture-btn-inner" />
                  </button>
                </div>
              ) : null}

              {/* Preview actions */}
              {flowState === 'preview' ? (
                <div className="camera-hub-preview-actions">
                  <button type="button" className="camera-hub-preview-btn-retake" onClick={resetClassificationFlow}>
                    Tirar outra
                  </button>
                  <button type="button" className="camera-hub-preview-btn-send" onClick={() => void handleSendPhoto()}>
                    Enviar
                  </button>
                </div>
              ) : null}

              {/* Extracting */}
              {flowState === 'extracting' ? (
                <div className="camera-hub-extracting">
                  <div className="camera-hub-extracting-spinner" />
                  <span className="camera-hub-extracting-label">Extraindo dados da ficha...</span>
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
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="camera-hub-success-text">Classificacao salva!</p>
                  <div className="camera-hub-success-actions">
                    <button type="button" className="camera-hub-success-btn-exit" onClick={() => router.push('/dashboard')}>
                      Sair
                    </button>
                    <button type="button" className="camera-hub-success-btn-details" onClick={() => {
                      if (confirmedSampleId) router.push(`/samples/${confirmedSampleId}`);
                    }}>
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
          <div className="cam-error-card" onClick={(e) => e.stopPropagation()}>
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
          <div className="cam-error-card" onClick={(e) => e.stopPropagation()}>
            <p className="cam-error-text">
              O lote da classificacao nao confere com a respectiva amostra.
            </p>
            <div className="cam-already-actions">
              <button type="button" className="cam-already-btn-no" onClick={() => router.back()}>
                Cancelar
              </button>
              <button type="button" className="cam-already-btn-yes" onClick={resetClassificationFlow}>
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Overwrite confirm dialog (Flow A) */}
      {flowState === 'overwrite-confirm' && resolvedSample ? (
        <div className="app-modal-backdrop" onClick={() => setFlowState('confirming')}>
          <div className="cam-already-card" onClick={(e) => e.stopPropagation()}>
            <p className="cam-already-text">
              A amostra <strong>{resolvedSample.internalLotNumber}</strong> ja possui classificacao. Deseja sobrescrever?
            </p>
            <div className="cam-already-actions">
              <button type="button" className="cam-already-btn-no" onClick={() => setFlowState('confirming')}>
                Nao
              </button>
              <button type="button" className="cam-already-btn-yes" onClick={() => void handleConfirmOverwrite()}>
                Sim, sobrescrever
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Not found dialog (Flow A) */}
      {flowState === 'not-found' ? (
        <div className="app-modal-backdrop" onClick={() => {}}>
          <div className="cam-error-card" onClick={(e) => e.stopPropagation()}>
            <p className="cam-error-text">
              Nenhuma amostra encontrada com o lote <strong>{editableLot}</strong>.
            </p>
            <div className="cam-already-actions">
              <button type="button" className="cam-already-btn-no" onClick={() => router.push('/dashboard')}>
                Sair
              </button>
              <button type="button" className="cam-already-btn-yes" onClick={() => router.push('/samples/new')}>
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
            <div className="cam-confirm-error" role="alert">{flowError}</div>
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
          />
        </>
      ) : null}
    </AppShell>
  );
}

export default function CameraPage() {
  return <CameraPageContent />;
}
