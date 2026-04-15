'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface DirtyEntry {
  key: string;
  reason: string;
}

interface PendingConfirmation {
  title: string;
  description: string;
  reason: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (confirmed: boolean) => void;
}

interface DirtyStateContextValue {
  register: (key: string, reason: string) => void;
  unregister: (key: string) => void;
  hasDirty: () => boolean;
  confirmNavigation: (options: {
    title?: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }) => Promise<boolean>;
}

const DirtyStateContext = createContext<DirtyStateContextValue | null>(null);

export function DirtyStateProvider({ children }: { children: ReactNode }) {
  const dirtyRef = useRef<Map<string, DirtyEntry>>(new Map());
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const register = useCallback((key: string, reason: string) => {
    dirtyRef.current.set(key, { key, reason });
  }, []);

  const unregister = useCallback((key: string) => {
    dirtyRef.current.delete(key);
  }, []);

  const hasDirty = useCallback(() => dirtyRef.current.size > 0, []);

  const confirmNavigation = useCallback(
    ({
      title = 'Descartar alteracoes?',
      description,
      confirmLabel = 'Descartar e continuar',
      cancelLabel = 'Cancelar',
    }: {
      title?: string;
      description?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }) => {
      if (dirtyRef.current.size === 0) {
        return Promise.resolve(true);
      }
      const entries = Array.from(dirtyRef.current.values());
      const reason =
        entries.length === 1
          ? entries[0].reason
          : `${entries.length} telas com alteracoes nao salvas`;
      const finalDescription =
        description ??
        'Voce tem alteracoes que ainda nao foram salvas. Continuar vai descartar essas alteracoes.';
      return new Promise<boolean>((resolve) => {
        setPending({
          title,
          description: finalDescription,
          reason,
          confirmLabel,
          cancelLabel,
          resolve,
        });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    setPending((current) => {
      current?.resolve(true);
      return null;
    });
  }, []);

  const handleCancel = useCallback(() => {
    setPending((current) => {
      current?.resolve(false);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pending, handleCancel]);

  const value = useMemo<DirtyStateContextValue>(
    () => ({ register, unregister, hasDirty, confirmNavigation }),
    [register, unregister, hasDirty, confirmNavigation]
  );

  return (
    <DirtyStateContext.Provider value={value}>
      {children}
      {pending ? (
        <ConfirmModal
          title={pending.title}
          description={pending.description}
          reason={pending.reason}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : null}
    </DirtyStateContext.Provider>
  );
}

function ConfirmModal({
  title,
  description,
  reason,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  reason: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="app-modal-backdrop" onClick={onCancel}>
      <section
        className="app-modal app-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dirty-confirm-title"
        aria-describedby="dirty-confirm-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="dirty-confirm-title" className="app-modal-title">
              {title}
            </h3>
            <p id="dirty-confirm-description" className="app-modal-description">
              {description}
            </p>
          </div>
        </header>
        <div className="app-confirm-modal-warning">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4" />
            <path d="M12 17v.01" />
            <path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          </svg>
          <span>{reason}</span>
        </div>
        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className="app-modal-submit" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function useDirtyState(): DirtyStateContextValue {
  const ctx = useContext(DirtyStateContext);
  if (!ctx) {
    throw new Error('useDirtyState deve ser usado dentro de um <DirtyStateProvider>');
  }
  return ctx;
}

/**
 * Registra esta tela como "suja" enquanto isDirty for true.
 * Desregistra automaticamente no unmount.
 */
export function useRegisterDirtyState(key: string, isDirty: boolean, reason: string) {
  const ctx = useContext(DirtyStateContext);
  useEffect(() => {
    if (!ctx) {
      return;
    }
    if (isDirty) {
      ctx.register(key, reason);
      return () => {
        ctx.unregister(key);
      };
    }
    ctx.unregister(key);
    return undefined;
  }, [ctx, key, isDirty, reason]);
}
