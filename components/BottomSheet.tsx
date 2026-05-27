'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { useFocusTrap } from '../lib/use-focus-trap';

const SWIPE_THRESHOLD = 60;
export const ANIMATION_MS = 350;

// Contador module-level pra distinguir popstate causado pelo nosso proprio
// cleanup (history.back()) vs back externo do usuario (gesto/botao do
// sistema Android). Cada cleanup que chama history.back() incrementa; o
// listener popstate, ao receber um evento sem `event.state.bottomSheet`,
// decrementa e ignora em vez de chamar requestDismiss(). Resolve corrida
// em React Strict Mode dev, onde mount #1 → cleanup #1 (back agendado) →
// mount #2 (push novo) → popstate captura o back do cleanup #1 no listener
// do mount #2, que sem o counter chamaria requestDismiss() e fecharia o
// sheet recem-aberto antes do user ver. Em prod (strict mode off) o
// counter fica em 0 e o comportamento e identico ao anterior.
let pendingInternalBacks = 0;

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

  // Derivado da intencao do user: true quando deve estar visualmente aberto.
  // Flipa pra false IMEDIATAMENTE no fechamento (antes do unmount), permitindo
  // que classes/estilos dependentes (body class pra tabbar, is-open class do
  // sheet) reflitam o close em paralelo com a transition CSS.
  const isOpen = animatingIn && open;

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
  // body overflow:hidden enquanto sheet montado pra evitar dual-scroll.
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

  // Body class `is-bottom-sheet-open` (esconde tabbar mobile). Atrelada a
  // `isOpen` (intencao do user), NAO a `visible` (presenca no DOM).
  // Assim quando o user fecha, a classe sai imediatamente e a tabbar
  // comeca a reaparecer EM PARALELO com o slide-down do sheet — em vez
  // de "popar" apenas no fim da animacao (que parecia bug de carregamento).
  useEffect(() => {
    if (!isOpen) return;

    document.body.classList.add('is-bottom-sheet-open');
    // Defesa contra is-keyboard-open ficando presa: se user abriu o sheet
    // com teclado ainda aberto (focusout pode nao disparar em todos os fluxos
    // iOS standalone), a classe ficaria ativa apos o sheet fechar, deixando
    // a tabbar escondida indefinidamente. Como o focus-trap do sheet move o
    // foco pra dentro dele, o teclado fecha — limpamos a classe pra
    // garantir estado consistente.
    document.body.classList.remove('is-keyboard-open');

    return () => {
      document.body.classList.remove('is-bottom-sheet-open');
    };
    // isOpen e derivado de `open` + `animatingIn`; quando open vira false,
    // isOpen flipa pra false imediatamente (animatingIn ja era true).
  }, [isOpen]);

  // Back Android: injeta history state ao abrir; popstate dispara dismiss.
  // Cleanup limpa state injetado se sheet fecha externamente (sem popstate).
  // CRITICO: nao depende de requestDismiss — usa ref estabilizada. Se
  // dependesse, o cleanup rodaria a cada render do consumidor (callback
  // muda toda vez), disparando history.back() que dispara popstate que
  // dispara requestDismiss(). Loop.
  //
  // Strict Mode dev: o useEffect roda mount → cleanup → mount. O cleanup
  // do primeiro mount chama history.back() que enfileira um popstate; o
  // listener registrado no segundo mount captura esse pop e — sem o
  // counter `pendingInternalBacks` — chamaria requestDismiss() fechando o
  // sheet recem-aberto. O counter sinaliza ao listener que aquele pop foi
  // gerado pelo nosso proprio cleanup (back interno) e deve ser ignorado.
  useEffect(() => {
    if (!open || historyInjectedRef.current) return;

    window.history.pushState({ bottomSheet: true }, '');
    historyInjectedRef.current = true;

    const onPopState = (event: PopStateEvent) => {
      if (event.state?.bottomSheet) {
        // Caso raro: usuario navegou pra frente e voltou. Re-injeta.
        return;
      }
      if (pendingInternalBacks > 0) {
        pendingInternalBacks--;
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
          pendingInternalBacks++;
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
      // Past threshold — dispara dismiss SEM resetar dragOffset. O JSX
      // condiciona `is-dragging` e o inline transform em `isOpen`, entao
      // quando o pai flipar open=false a class some, a transition CSS
      // (transform 0.35s) liga, e o sheet anima do dragOffset atual
      // (inline) ate translate3d(0, 100%, 0) (CSS rule) — movimento
      // continuo, sem snap-de-volta pra zero.
      void requestDismiss();
    } else {
      // Abaixo do threshold: snap de volta pra posicao aberta com
      // transition (is-dragging removido, isOpen ainda true).
      setDragOffset(0);
    }
  }

  if (!visible) return null;

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
        className={`bottom-sheet${isOpen ? ' is-open' : ''}${isOpen && dragOffset > 0 ? ' is-dragging' : ''}`}
        style={isOpen && dragOffset > 0 ? { transform: sheetTransform } : undefined}
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
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="bottom-sheet-body">{children}</div>

        {footer ? <div className="bottom-sheet-footer">{footer}</div> : null}
      </section>
    </div>
  );
}
