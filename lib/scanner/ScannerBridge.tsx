'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { ApiError, getCurrentSession, resolveSampleByQr } from '../api-client';
import { useDirtyState } from '../dirty-state/DirtyStateProvider';
import { useToast } from '../toast/ToastProvider';
import { playScanErrorBeep, playScanSuccessBeep } from './scanner-sound';
import { useGlobalScanner, type ScannerEvent } from './useGlobalScanner';

// Pages where the scanner must stay dormant — we don't want to intercept
// keyboard input on public/auth screens because there's no session and the
// user is likely typing credentials.
const SCANNER_DISABLED_PATHS = ['/login', '/forgot-password', '/reset-password'];

function isPathDisabled(pathname: string | null) {
  if (!pathname) {
    return true;
  }
  return SCANNER_DISABLED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function extractSampleIdFromPath(pathname: string | null) {
  if (!pathname) {
    return null;
  }
  const match = pathname.match(/^\/samples\/([^/?#]+)/);
  if (!match) {
    return null;
  }
  const id = match[1];
  if (id === 'new') {
    return null;
  }
  return id;
}

interface ScannerBridgeProps {
  children: ReactNode;
}

export function ScannerBridge({ children }: ScannerBridgeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const dirtyState = useDirtyState();
  const [isCapturing, setIsCapturing] = useState(false);
  const resolvingRef = useRef(false);

  const disabled = isPathDisabled(pathname);

  const handleScan = useCallback(
    async (event: ScannerEvent) => {
      if (resolvingRef.current) {
        return;
      }
      const rawValue = event.value.trim();
      if (!rawValue) {
        return;
      }
      resolvingRef.current = true;
      try {
        const session = await getCurrentSession().catch(() => null);
        if (!session) {
          playScanErrorBeep();
          toast.error({
            title: 'Sessao expirada',
            description: 'Faca login novamente para usar o bipador.',
          });
          return;
        }

        const resolved = await resolveSampleByQr(session, rawValue);
        const targetId = resolved.sample.id;
        const currentSampleId = extractSampleIdFromPath(pathname);
        const lotLabel = resolved.sample.internalLotNumber ?? targetId.slice(0, 8);

        if (currentSampleId && currentSampleId === targetId) {
          playScanSuccessBeep();
          toast.info({
            title: 'Amostra ja aberta',
            description: `Lote ${lotLabel} ja esta na tela.`,
          });
          return;
        }

        if (dirtyState.hasDirty()) {
          const confirmed = await dirtyState.confirmNavigation({
            title: `Abrir amostra ${lotLabel}?`,
            description:
              'Voce tem alteracoes nao salvas nesta tela. Abrir a amostra lida pelo bipador vai descartar essas alteracoes.',
            confirmLabel: `Abrir ${lotLabel}`,
          });
          if (!confirmed) {
            return;
          }
        }

        playScanSuccessBeep();
        toast.success({
          title: `Amostra ${lotLabel} encontrada`,
          description: 'Abrindo detalhes...',
          durationMs: 2600,
        });
        const redirectPath = resolved.redirectPath || `/samples/${targetId}?source=scanner`;
        const finalPath = redirectPath.includes('source=')
          ? redirectPath
          : `${redirectPath}${redirectPath.includes('?') ? '&' : '?'}source=scanner`;
        router.push(finalPath);
      } catch (err) {
        playScanErrorBeep();
        if (err instanceof ApiError) {
          if (err.status === 401) {
            toast.error({
              title: 'Sessao expirada',
              description: 'Faca login novamente para usar o bipador.',
            });
            return;
          }
          if (err.status === 404) {
            toast.error({
              title: 'QR nao reconhecido',
              description: `Nenhuma amostra encontrada para "${rawValue.slice(0, 32)}".`,
            });
            return;
          }
          toast.error({
            title: 'Falha ao abrir amostra',
            description: err.message,
          });
          return;
        }
        toast.error({
          title: 'Falha ao abrir amostra',
          description: 'Verifique a conexao e tente novamente.',
        });
      } finally {
        resolvingRef.current = false;
      }
    },
    [dirtyState, pathname, router, toast]
  );

  const handleCaptureStart = useCallback(() => {
    setIsCapturing(true);
  }, []);

  const handleCaptureEnd = useCallback(() => {
    setIsCapturing(false);
  }, []);

  useGlobalScanner({
    onScan: handleScan,
    onCaptureStart: handleCaptureStart,
    onCaptureEnd: handleCaptureEnd,
    enabled: !disabled,
  });

  return (
    <>
      {children}
      {isCapturing ? <ScannerCapturePulse /> : null}
    </>
  );
}

function ScannerCapturePulse() {
  return (
    <div className="app-scanner-pulse" role="status" aria-live="polite">
      <span className="app-scanner-pulse-dot" aria-hidden="true" />
      <span>Lendo QR...</span>
    </div>
  );
}
