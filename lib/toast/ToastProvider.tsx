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

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  durationMs: number;
}

export interface ToastInput {
  title: string;
  description?: string;
  durationMs?: number;
}

interface ToastContextValue {
  show: (kind: ToastKind, input: ToastInput) => string;
  success: (input: ToastInput) => string;
  error: (input: ToastInput) => string;
  info: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4000;
const MAX_VISIBLE = 3;

function createToastId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const scheduleAutoDismiss = useCallback((id: string, durationMs: number) => {
    const existing = timersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, durationMs);
    timersRef.current.set(id, timer);
  }, []);

  const show = useCallback(
    (kind: ToastKind, input: ToastInput) => {
      const id = createToastId();
      const durationMs = input.durationMs ?? DEFAULT_DURATION_MS;
      const toast: ToastItem = {
        id,
        kind,
        title: input.title,
        description: input.description,
        durationMs,
      };
      setToasts((current) => {
        const next = [...current, toast];
        if (next.length > MAX_VISIBLE) {
          const removed = next.slice(0, next.length - MAX_VISIBLE);
          for (const old of removed) {
            const timer = timersRef.current.get(old.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(old.id);
            }
          }
          return next.slice(-MAX_VISIBLE);
        }
        return next;
      });
      scheduleAutoDismiss(id, durationMs);
      return id;
    },
    [scheduleAutoDismiss]
  );

  const success = useCallback((input: ToastInput) => show('success', input), [show]);
  const error = useCallback((input: ToastInput) => show('error', input), [show]);
  const info = useCallback((input: ToastInput) => show('info', input), [show]);

  const clear = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ show, success, error, info, dismiss, clear }),
    [show, success, error, info, dismiss, clear]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }
  return (
    <div className="app-toast-viewport" role="region" aria-live="polite" aria-label="Notificacoes">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const role = toast.kind === 'error' ? 'alert' : 'status';
  return (
    <div
      className={`app-toast app-toast--${toast.kind}`}
      role={role}
      style={{ animationDuration: `${Math.max(200, toast.durationMs)}ms` }}
    >
      <div className="app-toast-icon" aria-hidden="true">
        <ToastIcon kind={toast.kind} />
      </div>
      <div className="app-toast-body">
        <p className="app-toast-title">{toast.title}</p>
        {toast.description ? <p className="app-toast-description">{toast.description}</p> : null}
      </div>
      <button
        type="button"
        className="app-toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Fechar notificacao"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === 'success') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (kind === 'error') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6" />
        <path d="M12 16.5v.01" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5v.01" />
    </svg>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de um <ToastProvider>');
  }
  return ctx;
}
