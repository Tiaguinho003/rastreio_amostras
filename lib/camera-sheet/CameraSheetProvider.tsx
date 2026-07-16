'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { CameraSheet } from '../../components/camera/CameraSheet';
import type { SessionData } from '../types';

// CAM-P3: estado global do bottom sheet da camera (mobile-only). Montado no
// AppShell; o icone de camera do header (HeaderAvatarMenu) e os botoes
// Classificar/Reclassificar do detalhe do lote abrem via useCameraSheet().
// Desktop nao tem camera (CAM-D2): alem dos gatilhos ocultos por CSS, o
// open() e no-op em >=901px (breakpoint canonico) e para PROSPECTOR.

type OpenOptions = {
  /** Flow B: amostra pre-selecionada (detalhe do lote). */
  sampleId?: string;
};

type CameraSheetContextValue = {
  open: (options?: OpenOptions) => void;
  close: () => void;
  isOpen: boolean;
};

const CameraSheetContext = createContext<CameraSheetContextValue | null>(null);

export function useCameraSheet(): CameraSheetContextValue {
  const context = useContext(CameraSheetContext);
  if (!context) {
    throw new Error('useCameraSheet deve ser usado dentro de <CameraSheetProvider>');
  }
  return context;
}

interface CameraSheetProviderProps {
  session: SessionData;
  children: ReactNode;
}

export function CameraSheetProvider({ session, children }: CameraSheetProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sampleId, setSampleId] = useState<string | null>(null);

  const role = session.user.role;

  const open = useCallback(
    (options?: OpenOptions) => {
      // CAM-D2: sem camera no desktop; PROSPECTOR nao classifica.
      if (typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches) {
        return;
      }
      if (role === 'PROSPECTOR') return;
      setSampleId(options?.sampleId ?? null);
      setIsOpen(true);
    },
    [role]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setSampleId(null);
  }, []);

  // Sucesso no Flow B volta pro scanner limpo sem fechar o sheet
  // (equivalente ao antigo router.push('/camera') da pagina).
  const exitContext = useCallback(() => {
    setSampleId(null);
  }, []);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <CameraSheetContext.Provider value={value}>
      {children}
      {role !== 'PROSPECTOR' ? (
        <CameraSheet
          session={session}
          open={isOpen}
          sampleId={sampleId}
          onClose={close}
          onExitContext={exitContext}
        />
      ) : null}
    </CameraSheetContext.Provider>
  );
}
