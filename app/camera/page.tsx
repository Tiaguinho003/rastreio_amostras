'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { SampleLookupResultModal } from '../../components/SampleLookupResultModal';
import { ApiError, resolveSampleByQr } from '../../lib/api-client';
import { compressImage } from '../../lib/compress-image';
import { savePendingArrivalPhoto } from '../../lib/mobile-camera-photo-store';
import type { ResolveSampleByQrResponse } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

type QrScannerClass = typeof import('qr-scanner').default;
type QrScannerInstance = InstanceType<QrScannerClass>;

type CapturedPhotoState = {
  file: File;
  previewUrl: string;
};

const DEFAULT_STATUS_MESSAGE = 'Aponte para um QR code ou capture a amostra para iniciar um novo registro.';
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

function buildCameraPhotoHandoffId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `camera-photo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function CameraPageContent() {
  const { session, loading, logout, setSession } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isArrivalPhotoIntent = searchParams.get('intent') === 'arrival-photo';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const scannerClassRef = useRef<QrScannerClass | null>(null);
  const scannerRef = useRef<QrScannerInstance | null>(null);
  const sessionRef = useRef(session);
  const restartScannerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const restartTimeoutRef = useRef<number | null>(null);
  const handledScanRef = useRef<{ value: string; at: number } | null>(null);
  const resolvingScanRef = useRef(false);
  const mountedRef = useRef(false);

  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'scanning' | 'permission-denied' | 'unsupported'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(DEFAULT_STATUS_MESSAGE);
  const [result, setResult] = useState<ResolveSampleByQrResponse | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhotoState | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);

  const scannerBlocked = resultModalOpen || Boolean(capturedPhoto) || photoSaving;
  const canCapturePhoto = cameraStatus === 'scanning' && !scannerBlocked;
  const reviewMode = Boolean(capturedPhoto);
  const manualDisabled = photoSaving || reviewMode;
  const showStatusText = Boolean(cameraError) || cameraStatus !== 'scanning' || reviewMode;
  const cameraStateLabel = useMemo(() => {
    if (cameraStatus === 'starting') {
      return 'Abrindo camera';
    }

    if (cameraStatus === 'scanning') {
      return 'Leitura automatica ativa';
    }

    if (cameraStatus === 'permission-denied') {
      return 'Permissao necessaria';
    }

    if (cameraStatus === 'unsupported') {
      return 'Camera indisponivel';
    }

    return 'Camera em espera';
  }, [cameraStatus]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    return () => {
      if (capturedPhoto?.previewUrl) {
        URL.revokeObjectURL(capturedPhoto.previewUrl);
      }
    };
  }, [capturedPhoto]);

  useEffect(() => {
    if (!resultModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setResultModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [resultModalOpen]);

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
        if (!mountedRef.current || scannerBlocked) {
          return;
        }

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
      if (!normalizedValue || resolvingScanRef.current) {
        return;
      }

      const previousScan = handledScanRef.current;
      const now = Date.now();
      if (previousScan && previousScan.value === normalizedValue && now - previousScan.at < REPEATED_SCAN_WINDOW_MS) {
        return;
      }

      handledScanRef.current = {
        value: normalizedValue,
        at: now
      };
      resolvingScanRef.current = true;

      stopScanner();
      setCameraError(null);
      setStatusMessage('QR lido. Validando a amostra...');

      try {
        const currentSession = sessionRef.current;
        if (!currentSession) {
          return;
        }

        const resolved = await resolveSampleByQr(currentSession, normalizedValue);
        if (!mountedRef.current) {
          return;
        }

        handleResolvedSample(resolved);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        setCameraError(`${readErrorMessage(error, 'Falha ao localizar a amostra.')} Use o botao Manual se precisar.`);
        setStatusMessage('Nao foi possivel confirmar este QR. Tente novamente ou siga pelo botao Manual.');
        scheduleScannerRestart();
      } finally {
        resolvingScanRef.current = false;
      }
    },
    [handleResolvedSample, scheduleScannerRestart, stopScanner]
  );

  const ensureScannerStarted = useCallback(async () => {
    if (!mountedRef.current || scannerBlocked || !videoRef.current || !sessionRef.current) {
      return;
    }

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
            onDecodeError: () => {
              // Scanner roda continuamente; erros de quadro nao precisam subir para a UI.
            }
          }
        );
      }

      await scannerRef.current.start();
      if (!mountedRef.current) {
        return;
      }

      setCameraStatus('scanning');
      setStatusMessage(DEFAULT_STATUS_MESSAGE);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      const denied = isPermissionLikeError(error);
      setCameraStatus(denied ? 'permission-denied' : 'unsupported');
      setCameraError(readErrorMessage(error, 'Falha ao abrir a camera.'));
      setStatusMessage(
        denied
          ? 'Permita o uso da camera para leitura automatica de QR e captura de foto.'
          : 'Nao foi possivel usar a camera neste navegador.'
      );
    }
  }, [clearRestartTimeout, handleDecodedQr, scannerBlocked]);

  useEffect(() => {
    restartScannerRef.current = ensureScannerStarted;
  }, [ensureScannerStarted]);

  useEffect(() => {
    if (loading || !session) {
      return;
    }

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

  if (loading || !session) {
    return null;
  }

  async function handleCapturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('A camera ainda nao entregou imagem suficiente para captura.');
      return;
    }

    stopScanner();

    const canvas = document.createElement('canvas');
    const largestSide = Math.max(video.videoWidth, video.videoHeight);
    const scale = largestSide > 1600 ? 1600 / largestSide : 1;

    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Falha ao preparar a captura da foto.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });

    if (!blob) {
      setCameraError('Falha ao gerar a foto capturada.');
      return;
    }

    const file = new File([blob], `arrival-photo-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });

    setCapturedPhoto((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return {
        file,
        previewUrl: URL.createObjectURL(file)
      };
    });
    setStatusMessage('Foto capturada. Confirme se deseja usa-la no novo registro.');
    setCameraError(null);
  }

  function handleDiscardCapturedPhoto() {
    setCapturedPhoto((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return null;
    });
    setStatusMessage(DEFAULT_STATUS_MESSAGE);
    setCameraError(null);
  }

  async function handleGalleryImport(event: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = event.target.files?.[0] ?? null;
    if (!rawFile) {
      return;
    }

    stopScanner();
    setCameraError(null);

    try {
      const compressed = await compressImage(rawFile);
      setCapturedPhoto((current) => {
        if (current?.previewUrl) {
          URL.revokeObjectURL(current.previewUrl);
        }

        return {
          file: compressed,
          previewUrl: URL.createObjectURL(compressed)
        };
      });
      setStatusMessage('Foto importada. Confirme se deseja usa-la no novo registro.');
    } catch {
      setCameraError('Falha ao processar a imagem selecionada. Tente novamente.');
    }

    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  }

  async function handleUseCapturedPhoto() {
    if (!capturedPhoto) {
      console.warn('CAMERA_SAVE', { stage: 'skip-no-photo' });
      return;
    }

    setPhotoSaving(true);
    setCameraError(null);

    try {
      const compressed = await compressImage(capturedPhoto.file);
      const handoffId = buildCameraPhotoHandoffId();
      console.info('CAMERA_SAVE', {
        stage: 'before-save',
        handoffId,
        fileName: compressed.name,
        fileSize: compressed.size
      });
      await savePendingArrivalPhoto(compressed, { confirmed: true, handoffId });
      console.info('CAMERA_SAVE', { stage: 'after-save', handoffId });

      const returnUrl = `/samples/new?source=camera&handoff=${encodeURIComponent(handoffId)}`;
      console.info('CAMERA_NAVIGATE', { to: returnUrl });

      if (isArrivalPhotoIntent) {
        router.replace(returnUrl);
      } else {
        router.push(returnUrl);
      }
    } catch (error) {
      setPhotoSaving(false);
      console.error('CAMERA_SAVE', { stage: 'error', message: readErrorMessage(error, 'Falha ao preparar a foto capturada.') });
      setCameraError(`${readErrorMessage(error, 'Falha ao preparar a foto capturada.')} Tente novamente.`);
    }
  }

  function handleCloseResultModal() {
    setResultModalOpen(false);
    setStatusMessage(DEFAULT_STATUS_MESSAGE);
  }

  function handleOpenSampleDetails() {
    if (!result) {
      return;
    }

    setResultModalOpen(false);
    router.push(result.redirectPath);
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="camera-hub-page">
        <section className="camera-hub-panel">
          <div className={`camera-hub-stage${capturedPhoto ? ' is-review' : ''}`}>
            <video ref={videoRef} className="camera-hub-video" autoPlay muted playsInline />
            {capturedPhoto ? (
              <img src={capturedPhoto.previewUrl} alt="Pre-visualizacao da foto capturada" className="camera-hub-preview" />
            ) : null}
            <div ref={overlayRef} className="camera-hub-overlay" aria-hidden="true" />

            <div className="camera-hub-headline">
              <span className={`camera-hub-status-badge is-${cameraStatus}`}>{cameraStateLabel}</span>
              {showStatusText
                ? cameraError
                  ? (
                    <p className="camera-hub-status-text camera-hub-status-text-error" role="alert">
                      {cameraError}
                    </p>
                    )
                  : (
                    <p className="camera-hub-status-text" aria-live="polite">
                      {statusMessage}
                    </p>
                    )
                : null}
            </div>

            <div className="camera-hub-top-actions">
              {isArrivalPhotoIntent ? (
                <>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    className="camera-hub-gallery-input"
                    onChange={handleGalleryImport}
                    tabIndex={-1}
                  />
                  <button
                    type="button"
                    className={`camera-hub-manual-action${manualDisabled ? ' is-disabled' : ''}`}
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={manualDisabled}
                  >
                    Galeria
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`camera-hub-manual-action${manualDisabled ? ' is-disabled' : ''}`}
                  onClick={() => router.push('/samples/new')}
                  disabled={manualDisabled}
                >
                  Manual
                </button>
              )}
            </div>

            <div className="camera-hub-capture-strip">
              <button
                type="button"
                className={`camera-hub-side-action is-discard${reviewMode ? ' is-ready' : ''}`}
                onClick={handleDiscardCapturedPhoto}
                disabled={!reviewMode || photoSaving}
                aria-label="Descartar foto capturada"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M6 6l12 12" />
                  <path d="M18 6 6 18" />
                </svg>
              </button>

              <div className="camera-hub-capture-button-wrap">
                <button
                  type="button"
                  className="camera-hub-capture-button"
                  onClick={handleCapturePhoto}
                  disabled={!canCapturePhoto}
                  aria-label="Capturar foto da amostra"
                >
                  <span className="camera-hub-capture-button-core" aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                className={`camera-hub-side-action is-confirm${reviewMode ? ' is-ready' : ''}`}
                onClick={handleUseCapturedPhoto}
                disabled={!reviewMode || photoSaving}
                aria-label="Confirmar foto capturada"
              >
                {photoSaving ? (
                  <span className="camera-hub-side-action-spinner" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="m5 12.5 4.3 4.2L19 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </section>
      </section>

      {result && resultModalOpen ? (
        <SampleLookupResultModal
          sample={result.sample}
          title="Amostra localizada"
          primaryActionLabel="Voltar a escanear"
          onPrimaryAction={handleCloseResultModal}
          onDetails={handleOpenSampleDetails}
          onClose={handleCloseResultModal}
        />
      ) : null}
    </AppShell>
  );
}

export default function CameraPage() {
  return (
    <Suspense fallback={null}>
      <CameraPageContent />
    </Suspense>
  );
}
