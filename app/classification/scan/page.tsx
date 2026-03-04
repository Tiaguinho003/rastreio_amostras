'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { AppShell } from '../../../components/AppShell';
import { ApiError, resolveSampleByQr } from '../../../lib/api-client';
import { useRequireAuth } from '../../../lib/use-auth';

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const maybe = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return typeof maybe === 'function' ? maybe : null;
}

export default function ClassificationScanPage() {
  const { session, loading, logout } = useRequireAuth();
  const router = useRouter();

  const [qrInput, setQrInput] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionLockedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    detectionLockedRef.current = false;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') {
      return;
    }

    const hasCameraApi = typeof navigator.mediaDevices?.getUserMedia === 'function';
    setCameraSupported(Boolean(getBarcodeDetectorConstructor()) && hasCameraApi);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const resolveAndRedirect = useCallback(
    async (rawContent: string, source: 'manual' | 'camera') => {
      if (!session) {
        return;
      }

      const content = rawContent.trim();
      if (!content) {
        setError('Leia ou informe o conteudo do QR Code.');
        if (source === 'camera') {
          detectionLockedRef.current = false;
        }
        return;
      }

      setResolving(true);
      setError(null);
      setMessage(null);

      try {
        const result = await resolveSampleByQr(session, content);
        setMessage('QR localizado. Redirecionando para classificacao...');
        if (source === 'camera') {
          stopCamera();
        }
        router.push(result.redirectPath);
      } catch (cause) {
        if (cause instanceof ApiError) {
          setError(cause.message);
        } else {
          setError('Falha ao resolver o QR da amostra.');
        }

        if (source === 'camera') {
          detectionLockedRef.current = false;
        }
      } finally {
        setResolving(false);
      }
    },
    [router, session, stopCamera]
  );

  const startCamera = useCallback(async () => {
    if (!cameraSupported || resolving) {
      return;
    }

    const DetectorCtor = getBarcodeDetectorConstructor();
    if (!DetectorCtor || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setCameraError('Leitura por camera nao suportada neste navegador.');
      return;
    }

    setCameraError(null);
    setError(null);
    setMessage(null);

    stopCamera();

    try {
      detectorRef.current = new DetectorCtor({ formats: ['qr_code'] });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }
        }
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        throw new Error('Video element is not available');
      }

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      setCameraActive(true);

      const runDetection = async () => {
        const currentVideo = videoRef.current;
        const currentStream = streamRef.current;
        const detector = detectorRef.current;

        if (!currentVideo || !currentStream || !detector) {
          return;
        }

        if (!detectionLockedRef.current && !resolving && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const detected = await detector.detect(currentVideo);
            const firstValid = detected.find((item) => typeof item.rawValue === 'string' && item.rawValue.trim().length > 0);

            if (firstValid?.rawValue) {
              detectionLockedRef.current = true;
              setQrInput(firstValid.rawValue);
              await resolveAndRedirect(firstValid.rawValue, 'camera');
            }
          } catch {
            // Ignora erro de leitura de frame e continua.
          }
        }

        if (streamRef.current) {
          rafRef.current = window.requestAnimationFrame(() => {
            void runDetection();
          });
        }
      };

      rafRef.current = window.requestAnimationFrame(() => {
        void runDetection();
      });
    } catch {
      stopCamera();
      setCameraError('Nao foi possivel iniciar a camera para leitura do QR.');
    }
  }, [cameraSupported, resolving, resolveAndRedirect, stopCamera]);

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void resolveAndRedirect(qrInput, 'manual');
  }

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout}>
      <div className="row" style={{ marginBottom: '1rem', justifyContent: 'space-between' }}>
        <Link href="/dashboard">
          <button className="secondary" type="button">
            Voltar ao dashboard
          </button>
        </Link>
      </div>

      <section className="panel stack" style={{ width: 'min(920px, 100%)' }}>
        <h2 style={{ margin: 0 }}>Leitura de QR para classificacao</h2>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Leia o QR Code da amostra para abrir diretamente a tela de classificacao correspondente.
        </p>

        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="success">{message}</p> : null}

        <section className="grid grid-2">
          <article className="panel stack">
            <h3 style={{ margin: 0 }}>Scanner por camera</h3>

            {cameraSupported ? (
              <>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  Posicione o QR no centro da camera. O redirecionamento e automatico.
                </p>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid var(--line)',
                    background: '#000',
                    minHeight: 240
                  }}
                />
                <div className="row">
                  <button type="button" onClick={() => void startCamera()} disabled={cameraActive || resolving}>
                    {cameraActive ? 'Camera ativa' : 'Iniciar camera'}
                  </button>
                  <button className="secondary" type="button" onClick={stopCamera} disabled={!cameraActive}>
                    Parar camera
                  </button>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Este navegador nao suporta leitura de QR por camera. Use o campo manual abaixo com leitor tipo pistola
                ou copia do conteudo do QR.
              </p>
            )}

            {cameraError ? <p className="error">{cameraError}</p> : null}
          </article>

          <article className="panel stack">
            <h3 style={{ margin: 0 }}>Leitura manual / leitor USB</h3>
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Cole ou escaneie o texto do QR no campo abaixo e pressione Enter.
            </p>

            <form className="stack" onSubmit={handleManualSubmit}>
              <label>
                Conteudo do QR
                <input
                  value={qrInput}
                  onChange={(event) => setQrInput(event.target.value)}
                  placeholder="Ex.: AM-2026-000123 ou UUID da amostra"
                />
              </label>

              <div className="row">
                <button type="submit" disabled={resolving}>
                  {resolving ? 'Localizando amostra...' : 'Abrir classificacao'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setQrInput('')}
                  disabled={resolving || qrInput.length === 0}
                >
                  Limpar
                </button>
              </div>
            </form>
          </article>
        </section>
      </section>
    </AppShell>
  );
}
