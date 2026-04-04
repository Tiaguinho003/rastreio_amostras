'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { SampleLookupResultModal } from '../../components/SampleLookupResultModal';
import { ApiError, resolveSampleByQr } from '../../lib/api-client';
import type { ResolveSampleByQrResponse } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

type QrScannerClass = typeof import('qr-scanner').default;
type QrScannerInstance = InstanceType<QrScannerClass>;

const DEFAULT_STATUS_MESSAGE = 'Aponte para um QR code para localizar a amostra.';
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

function CameraPageContent() {
  const { session, loading, logout, setSession } = useRequireAuth();
  const router = useRouter();

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

  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'scanning' | 'permission-denied' | 'unsupported'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(DEFAULT_STATUS_MESSAGE);
  const [result, setResult] = useState<ResolveSampleByQrResponse | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  const scannerBlocked = resultModalOpen;
  const showStatusText = Boolean(cameraError) || cameraStatus !== 'scanning';
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
            onDecodeError: () => {}
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
          ? 'Permita o uso da camera para leitura automatica de QR.'
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

  function handleCloseResultModal() {
    setResultModalOpen(false);
    setStatusMessage(DEFAULT_STATUS_MESSAGE);
  }

  function handleOpenSampleDetails() {
    if (!result) {
      return;
    }

    setResultModalOpen(false);

    const id = result.sample.id;
    const status = result.sample.status;

    if (status === 'REGISTRATION_CONFIRMED' || status === 'QR_PENDING_PRINT') {
      router.push(`/samples/${id}?highlight=print`);
    } else if (status === 'QR_PRINTED' || status === 'CLASSIFICATION_IN_PROGRESS') {
      router.push(`/samples/${id}?focus=classification`);
    } else {
      router.push(`/samples/${id}`);
    }
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="camera-hub-page">
        <section className="camera-hub-panel">
          <div className="camera-hub-stage">
            <video ref={videoRef} className="camera-hub-video" autoPlay muted playsInline />
            <div ref={overlayRef} className="camera-hub-overlay" aria-hidden="true" />

            <div className="camera-hub-headline">
              <button type="button" className="camera-hub-back-btn" onClick={() => router.back()} aria-label="Voltar">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              {showStatusText && cameraError ? (
                <p className="camera-hub-status-text camera-hub-status-text-error" role="alert">
                  {cameraError}
                </p>
              ) : null}
            </div>

            <div className="camera-hub-scan-indicator">
              {cameraStatus === 'scanning' ? (
                <>
                  <span className="camera-hub-scan-pulse" aria-hidden="true" />
                  <span className="camera-hub-scan-label">Escaneando...</span>
                </>
              ) : cameraStatus === 'starting' ? (
                <span className="camera-hub-scan-label">Abrindo camera...</span>
              ) : null}
            </div>
          </div>
        </section>
      </section>

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
    </AppShell>
  );
}

export default function CameraPage() {
  return <CameraPageContent />;
}
