'use client';

import { useEffect, useRef, useState } from 'react';

type CameraFacingMode = 'environment' | 'user';
type CameraPermissionState = PermissionState | 'unsupported' | 'unknown';

type MediaDeviceSummary = {
  deviceId: string;
  label: string;
};

function formatError(error: unknown) {
  if (error instanceof DOMException) {
    return `${error.name}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Falha ao acessar a camera.';
}

export default function CameraTestPanel() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permissionState, setPermissionState] = useState<CameraPermissionState>('unknown');
  const [devices, setDevices] = useState<MediaDeviceSummary[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [requestedFacingMode, setRequestedFacingMode] = useState<CameraFacingMode>('environment');
  const [statusMessage, setStatusMessage] = useState('Pronto para iniciar o teste.');
  const [errorMessage, setErrorMessage] = useState('');
  const [streamSummary, setStreamSummary] = useState('');
  const [capturedFrame, setCapturedFrame] = useState('');
  const [busy, setBusy] = useState(false);
  const secureContext = typeof window !== 'undefined' ? window.isSecureContext : false;
  const supportsCamera = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  function stopCamera() {
    const activeStream = streamRef.current;
    if (activeStream) {
      for (const track of activeStream.getTracks()) {
        track.stop();
      }
    }

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setStreamSummary('');
    setStatusMessage('Camera parada.');
  }

  async function refreshPermissionState() {
    if (!navigator.permissions?.query) {
      setPermissionState('unsupported');
      return;
    }

    try {
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setPermissionState(permission.state);
    } catch {
      setPermissionState('unsupported');
    }
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }

    const availableDevices = await navigator.mediaDevices.enumerateDevices();
    const cameras = availableDevices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`
      }));

    setDevices(cameras);
    if (cameras.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(cameras[0].deviceId);
    }
  }

  async function startCamera(facingMode: CameraFacingMode, deviceId?: string) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Este navegador nao expoe navigator.mediaDevices.getUserMedia.');
      return;
    }

    setBusy(true);
    setErrorMessage('');
    setCapturedFrame('');
    setRequestedFacingMode(facingMode);

    try {
      stopCamera();

      const videoConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        : {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const [track] = stream.getVideoTracks();
      const settings = track?.getSettings();
      const label = track?.label || 'Camera ativa';
      const summaryParts = [label];
      if (settings?.width && settings?.height) {
        summaryParts.push(`${settings.width}x${settings.height}`);
      }
      if (settings?.facingMode) {
        summaryParts.push(`facingMode=${settings.facingMode}`);
      }

      setStreamSummary(summaryParts.join(' | '));
      setStatusMessage('Camera ativa e pronta para captura.');
      await refreshPermissionState();
      await refreshDevices();
    } catch (error) {
      setErrorMessage(formatError(error));
      setStatusMessage('Falha ao iniciar a camera.');
    } finally {
      setBusy(false);
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMessage('A camera ainda nao entregou imagem suficiente para captura.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      setErrorMessage('Falha ao preparar a captura da imagem.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedFrame(canvas.toDataURL('image/jpeg', 0.92));
    setStatusMessage('Quadro capturado com sucesso.');
    setErrorMessage('');
  }

  useEffect(() => {
    void refreshPermissionState();
    void refreshDevices();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) {
      return () => {
        stopCamera();
      };
    }

    const handleDeviceChange = () => {
      void refreshDevices();
    };

    mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopCamera();
    };
  }, []);

  return (
    <section className="panel stack mobile-camera-panel">
      <div className="mobile-camera-heading">
        <div>
          <h1 style={{ margin: 0 }}>Teste local de camera</h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)' }}>
            Use esta pagina no celular para validar HTTPS, permissao da camera, stream e captura de imagem.
          </p>
        </div>
        <span className={`status-badge ${secureContext ? 'status-badge-success' : 'status-badge-danger'}`}>
          {secureContext ? 'HTTPS ativo' : 'Contexto inseguro'}
        </span>
      </div>

      <div className="mobile-camera-grid">
        <div className="stack">
          <div className="mobile-camera-card">
            <div className="mobile-camera-video-shell">
              <video ref={videoRef} className="mobile-camera-video" autoPlay muted playsInline />
            </div>
            <p className="mobile-camera-note">
              {streamSummary || 'Nenhuma camera ativa. Abra a camera traseira para simular leitura de QR no telefone.'}
            </p>
          </div>

          <div className="row">
            <button type="button" onClick={() => void startCamera('environment')} disabled={busy || !supportsCamera}>
              Abrir traseira
            </button>
            <button type="button" className="secondary" onClick={() => void startCamera('user')} disabled={busy || !supportsCamera}>
              Abrir frontal
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void startCamera(requestedFacingMode, selectedDeviceId || undefined)}
              disabled={busy || !supportsCamera || !selectedDeviceId}
            >
              Abrir selecionada
            </button>
            <button type="button" className="secondary" onClick={captureFrame} disabled={busy || !streamRef.current}>
              Capturar quadro
            </button>
            <button type="button" className="secondary" onClick={stopCamera} disabled={busy || !streamRef.current}>
              Parar camera
            </button>
          </div>

          <label>
            Camera detectada
            <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} disabled={devices.length === 0}>
              {devices.length === 0 ? (
                <option value="">Nenhuma camera listada ainda</option>
              ) : (
                devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="stack">
          <div className="mobile-camera-card stack">
            <div className="mobile-camera-status-row">
              <strong>Status</strong>
              <span className={`status-badge ${errorMessage ? 'status-badge-danger' : 'status-badge-neutral'}`}>{errorMessage ? 'Erro' : 'OK'}</span>
            </div>
            <p className="mobile-camera-status-text">{statusMessage}</p>
            {errorMessage ? <p className="mobile-camera-error">{errorMessage}</p> : null}
            <div className="mobile-camera-meta">
              <span>Secure context: {secureContext ? 'sim' : 'nao'}</span>
              <span>Permissao: {permissionState}</span>
              <span>API camera: {supportsCamera ? 'disponivel' : 'indisponivel'}</span>
              <span>Modo solicitado: {requestedFacingMode}</span>
            </div>
          </div>

          <div className="mobile-camera-card stack">
            <strong>Captura</strong>
            {capturedFrame ? (
              <img src={capturedFrame} alt="Quadro capturado da camera" className="mobile-camera-capture" />
            ) : (
              <p className="mobile-camera-note">Depois de abrir a camera, capture um quadro para validar leitura de imagem e permissao do navegador.</p>
            )}
          </div>

          <div className="mobile-camera-card stack">
            <strong>Checklist rapido</strong>
            <ul className="mobile-camera-checklist">
              <li>Abra a pagina usando `https://IP_DO_PC:3000/dev/camera`.</li>
              <li>Confirme que o badge mostra `HTTPS ativo`.</li>
              <li>Permita a camera no navegador do celular.</li>
              <li>Teste a camera traseira primeiro.</li>
              <li>Capture um quadro para validar o stream.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
