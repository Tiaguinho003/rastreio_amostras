'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { SampleLookupResultModal } from '../../components/SampleLookupResultModal';
import { ApiError, resolveSampleByQr } from '../../lib/api-client';
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

export default function CameraPage() {
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
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhotoState | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const scannerBlocked = resultModalOpen || Boolean(capturedPhoto) || manualSearchOpen || photoSaving;
  const canCapturePhoto = cameraStatus === 'scanning' && !scannerBlocked;
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
    setManualError(null);
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

        setCameraError(`${readErrorMessage(error, 'Falha ao localizar a amostra.')} Use a busca manual se precisar.`);
        setStatusMessage('Nao foi possivel confirmar este QR. Tente outro codigo ou use a busca manual.');
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

  if (loading || !session) {
    return null;
  }

  async function handleManualSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuery = manualQuery.trim();
    if (!normalizedQuery) {
      setManualError('Informe o numero da amostra.');
      return;
    }

    setManualSubmitting(true);
    setManualError(null);
    setCameraError(null);
    stopScanner();

    try {
      const currentSession = sessionRef.current;
      if (!currentSession) {
        setManualError('Sua sessao expirou. Entre novamente para continuar.');
        return;
      }

      const resolved = await resolveSampleByQr(currentSession, normalizedQuery);
      if (!mountedRef.current) {
        return;
      }

      handleResolvedSample(resolved);
      setManualQuery('');
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setManualError(readErrorMessage(error, 'Falha ao localizar a amostra.'));
    } finally {
      setManualSubmitting(false);
    }
  }

  function handleToggleManualSearch() {
    setManualSearchOpen((current) => {
      const next = !current;
      if (next) {
        stopScanner();
        setStatusMessage('Digite manualmente o codigo ou conteudo do QR da amostra.');
      } else {
        setManualError(null);
        setStatusMessage(DEFAULT_STATUS_MESSAGE);
      }

      return next;
    });
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

  async function handleUseCapturedPhoto() {
    if (!capturedPhoto) {
      return;
    }

    setPhotoSaving(true);
    setCameraError(null);

    try {
      await savePendingArrivalPhoto(capturedPhoto.file);
      router.push('/samples/new?source=camera');
    } catch (error) {
      setPhotoSaving(false);
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
        <header className="camera-hub-header">
          <div className="camera-hub-header-copy">
            <p className="camera-hub-kicker">Fluxo rapido mobile</p>
            <h2 className="camera-hub-title">Camera inteligente</h2>
            <p className="camera-hub-subtitle">Leitura automatica de QR com atalho direto para um novo registro por foto.</p>
          </div>

          <div className="camera-hub-header-actions">
            <Link href="/samples/new" className="new-sample-link-button secondary">
              Novo manual
            </Link>
            <Link href="/samples" className="new-sample-link-button secondary">
              Registros
            </Link>
          </div>
        </header>

        <section className="panel camera-hub-panel">
          <div className={`camera-hub-stage${capturedPhoto ? ' is-review' : ''}`}>
            {capturedPhoto ? (
              <img src={capturedPhoto.previewUrl} alt="Pre-visualizacao da foto capturada" className="camera-hub-preview" />
            ) : (
              <video ref={videoRef} className="camera-hub-video" autoPlay muted playsInline />
            )}
            <div ref={overlayRef} className="camera-hub-overlay" aria-hidden="true" />

            <div className="camera-hub-headline">
              <span className={`camera-hub-status-badge is-${cameraStatus}`}>{cameraStateLabel}</span>
              <p className="camera-hub-status-text" aria-live="polite">
                {statusMessage}
              </p>
            </div>

            {capturedPhoto ? (
              <div className="camera-hub-review-actions">
                <button type="button" onClick={handleUseCapturedPhoto} disabled={photoSaving}>
                  {photoSaving ? 'Preparando...' : 'Usar foto'}
                </button>
                <button type="button" className="secondary" onClick={handleDiscardCapturedPhoto} disabled={photoSaving}>
                  Tentar novamente
                </button>
              </div>
            ) : (
              <div className="camera-hub-capture-strip">
                <button
                  type="button"
                  className="camera-hub-capture-button"
                  onClick={handleCapturePhoto}
                  disabled={!canCapturePhoto || manualSubmitting}
                  aria-label="Capturar foto da amostra"
                >
                  <span className="camera-hub-capture-button-core" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="camera-hub-support">
            <div>
              <strong>Atalhos manuais</strong>
              <p className="camera-hub-support-text">Se a leitura falhar, digite o codigo ou siga para um novo registro sem sair do fluxo.</p>
            </div>

            <div className="camera-hub-support-actions">
              <button type="button" className="secondary" onClick={handleToggleManualSearch} disabled={photoSaving}>
                {manualSearchOpen ? 'Fechar digitacao' : 'Digitar codigo'}
              </button>
              <Link href="/samples/new" className="new-sample-link-button secondary">
                Novo registro
              </Link>
            </div>
          </div>

          {cameraError ? (
            <p className="camera-hub-error" role="alert">
              {cameraError}
            </p>
          ) : null}

          {manualSearchOpen ? (
            <section className="camera-hub-manual-card">
              <form className="sample-search camera-hub-manual-search" onSubmit={handleManualSearchSubmit} role="search">
                <label className="sample-search-field">
                  <span className="sample-search-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m16.2 16.2 4.1 4.1" />
                    </svg>
                  </span>
                  <input
                    value={manualQuery}
                    onChange={(event) => setManualQuery(event.target.value)}
                    placeholder="Digite o numero da amostra ou o conteudo do QR"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={manualSubmitting}
                  />
                </label>
                <button type="submit" className="sample-search-submit" disabled={manualSubmitting}>
                  {manualSubmitting ? 'Buscando...' : 'Buscar'}
                </button>
                {manualError ? (
                  <p className="sample-search-error" role="alert">
                    {manualError}
                  </p>
                ) : null}
              </form>
            </section>
          ) : null}
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
