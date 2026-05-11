'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { useFocusTrap } from '../lib/use-focus-trap';

const SWIPE_THRESHOLD = 60;
const ANIMATION_MS = 350;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Async/sync callback chamado quando o usuario tenta fechar via gesto
   * (backdrop tap, drag-to-dismiss, botao X, ESC, back Android).
   * Retorna `true` pra permitir o fechamento, `false` pra cancelar.
   * Default: sempre permite.
   */
  onDismissAttempt?: () => boolean | Promise<boolean>;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Habilita drag-to-dismiss (mobile). Default: true. */
  dragToDismiss?: boolean;
  /** Pausa drag-to-dismiss temporariamente (ex: enquanto modal aninhado aberto). */
  dragDisabled?: boolean;
  /** Aria-label do dialog (lido por screen readers). */
  ariaLabel?: string;
}

export function BottomSheet({
  open,
  onClose,
  onDismissAttempt,
  title,
  footer,
  children,
  dragToDismiss = true,
  dragDisabled = false,
  ariaLabel,
}: BottomSheetProps) {
  const focusTrapRef = useFocusTrap(open);
  const dragState = useRef({ startY: 0, currentY: 0, dragging: false });
  const historyInjectedRef = useRef(false);

  const [visible, setVisible] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const requestDismiss = useCallback(async () => {
    const canClose = onDismissAttempt ? await onDismissAttempt() : true;
    if (canClose) {
      onClose();
    }
  }, [onDismissAttempt, onClose]);

  // Ref estabilizada: o callback do consumidor muda a cada render (porque e
  // funcao inline no consumidor), mas os useEffects de ESC e popstate
  // precisam de identidade estavel pra nao re-rodar a cada render —
  // re-roda dispararia cleanup do history.pushState, que chama history.back(),
  // que dispara popstate, que dispara requestDismiss. Loop.
  const requestDismissRef = useRef(requestDismiss);
  useEffect(() => {
    requestDismissRef.current = requestDismiss;
  }, [requestDismiss]);

  // Lifecycle: monta + anima entrada quando `open` vira true. Anima saida
  // quando `open` vira false (mantem montado durante a animacao).
  useEffect(() => {
    if (open) {
      setVisible(true);
      setDragOffset(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimatingIn(true));
      });
      return;
    }
    if (visible) {
      setAnimatingIn(false);
      const timer = window.setTimeout(() => setVisible(false), ANIMATION_MS);
      return () => window.clearTimeout(timer);
    }
  }, [open, visible]);

  // ESC dispara dismiss (com confirmacao do consumidor via onDismissAttempt).
  // body overflow:hidden enquanto sheet aberto pra evitar dual-scroll.
  // NAO depende de requestDismiss (usa ref estabilizada) pra evitar re-runs.
  useEffect(() => {
    if (!visible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void requestDismissRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [visible]);

  // Back Android: injeta history state ao abrir; popstate dispara dismiss.
  // Cleanup limpa state injetado se sheet fecha externamente (sem popstate).
  // CRITICO: nao depende de requestDismiss — usa ref estabilizada. Se
  // dependesse, o cleanup rodaria a cada render do consumidor (callback
  // muda toda vez), disparando history.back() que dispara popstate que
  // dispara requestDismiss(). Loop.
  useEffect(() => {
    if (!open || historyInjectedRef.current) return;

    window.history.pushState({ bottomSheet: true }, '');
    historyInjectedRef.current = true;

    const onPopState = (event: PopStateEvent) => {
      if (event.state?.bottomSheet) {
        // Caso raro: usuario navegou pra frente e voltou. Re-injeta.
        return;
      }
      void requestDismissRef.current();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (historyInjectedRef.current) {
        historyInjectedRef.current = false;
        // Se ainda estamos na entry que injetamos, volta uma pra limpar.
        if (window.history.state?.bottomSheet) {
          window.history.back();
        }
      }
    };
  }, [open]);

  function handleTouchStart(event: React.TouchEvent) {
    if (!dragToDismiss || dragDisabled) return;
    // Se o toque comecou dentro do body com scroll > 0, cede pro scroll nativo
    const target = event.target as HTMLElement | null;
    const body = target?.closest('.bottom-sheet-body') as HTMLElement | null;
    if (body && body.scrollTop > 0) return;

    dragState.current.startY = event.touches[0].clientY;
    dragState.current.currentY = event.touches[0].clientY;
    dragState.current.dragging = true;
  }

  function handleTouchMove(event: React.TouchEvent) {
    if (!dragState.current.dragging) return;
    dragState.current.currentY = event.touches[0].clientY;
    const delta = dragState.current.currentY - dragState.current.startY;
    setDragOffset(Math.max(0, delta));
  }

  function handleTouchEnd() {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    const delta = dragState.current.currentY - dragState.current.startY;
    if (delta > SWIPE_THRESHOLD) {
      // Reset offset e dispara dismiss; se consumidor cancelar, volta visualmente
      setDragOffset(0);
      void requestDismiss();
    } else {
      setDragOffset(0);
    }
  }

  if (!visible) return null;

  const isOpen = animatingIn && open;
  // translate3d mantem GPU layer permanente, previne scroll lock em iOS
  // Safari standalone PWA (mesmo padrao do antigo ProfileBottomSheet).
  const sheetTransform = dragOffset > 0 ? `translate3d(0, ${dragOffset}px, 0)` : undefined;

  return (
    <div
      className={`bottom-sheet-backdrop${isOpen ? ' is-open' : ''}`}
      onClick={() => void requestDismiss()}
    >
      <section
        ref={focusTrapRef}
        className={`bottom-sheet${isOpen ? ' is-open' : ''}${dragOffset > 0 ? ' is-dragging' : ''}`}
        style={dragOffset > 0 ? { transform: sheetTransform } : undefined}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {dragToDismiss ? (
          <div className="bottom-sheet-drag-handle" aria-hidden="true">
            <span className="bottom-sheet-drag-handle-bar" />
          </div>
        ) : null}

        <header className="bottom-sheet-header">
          <h3 className="bottom-sheet-title" aria-live="polite">
            {title}
          </h3>
          <button
            type="button"
            className="bottom-sheet-close"
            onClick={() => void requestDismiss()}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="bottom-sheet-body">{children}</div>

        {footer ? <div className="bottom-sheet-footer">{footer}</div> : null}
      </section>
    </div>
  );
}
