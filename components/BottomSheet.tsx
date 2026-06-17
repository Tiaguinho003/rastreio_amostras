'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../lib/use-focus-trap';

// useLayoutEffect no client, useEffect no server — evita o warning de SSR num
// componente 'use client' que ainda e renderizado no servidor pelo App Router.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const SWIPE_THRESHOLD = 60;
// Duracao da animacao de entrada/saida do sheet. DEVE casar (>=) com a
// `transition` do `.bottom-sheet` no globals.css — senao o slide de saida e
// cortado antes do unmount. Subiu de 350 -> 460 pra uma abertura de baixo pra
// cima mais lenta/natural (global, todos os sheets).
export const ANIMATION_MS = 460;

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

// Stack de sheets visiveis (topmost = ultimo). Serve a dois propositos quando um
// sheet abre SOBRE outro (modo `stacked`):
//  - ref-count do scroll-lock do body: trava no 0->1 e restaura no 1->0, pra
//    fechar o sheet de cima NAO destravar o scroll do de baixo;
//  - gating de ESC/back ao TOPMOST: so o sheet do topo responde, pra ESC/back
//    nao fecharem o sheet de baixo junto.
// Sheet sozinho (os 11 sheets existentes): a stack chega no maximo a 1 ->
// comportamento identico ao anterior.
const sheetStack: string[] = [];
let savedBodyOverflow = '';
// Ref-count da classe is-bottom-sheet-open (atrelada a isOpen/intencao).
let openIntentCount = 0;

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
  /**
   * Sheet empilhado SOBRE outro overlay (sheet/modal). Eleva o z-index pro tier
   * `--z-modal-stacked` (backdrop+sheet) e DELEGA a history ao overlay-pai (nao
   * injeta entry propria). O scroll-lock e o gating ESC/back ao topmost sao
   * automaticos (ver `sheetStack`). Default: false.
   */
  stacked?: boolean;
  /** Aria-label do dialog (lido por screen readers). */
  ariaLabel?: string;
  /** Classe modificadora opcional aplicada ao .bottom-sheet pra permitir
      override de estilo via seletor `.bottom-sheet.minha-classe`. */
  className?: string;
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
  className,
  stacked = false,
}: BottomSheetProps) {
  const focusTrapRef = useFocusTrap(open);
  // Token estavel por instancia pra identificar este sheet na `sheetStack`.
  const sheetToken = useId();
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

  // Congela o conteudo visual (children/title/footer/ariaLabel/className)
  // durante a animacao de saida. Quando `open` vira false o sheet continua
  // montado por ANIMATION_MS pro slide-down; sem isto, o consumidor recomputa
  // os props pro novo estado (ex: outro flowState) e o sheet trocaria conteudo
  // e altura no meio do close — "cresceria + trocaria o body" enquanto desce,
  // parecendo que vai reabrir. Renderizamos o ultimo estado aberto ate o
  // unmount. Snapshot gravado em layout-effect (commit-time, nunca no render)
  // pra ser puro em concurrent/StrictMode e cravar antes do paint do frame que
  // fecha. Ao reabrir (open=true) voltamos a usar os props ao vivo na hora.
  const liveContent = { children, title, footer, ariaLabel, className };
  const contentRef = useRef(liveContent);
  useIsomorphicLayoutEffect(() => {
    if (open) {
      contentRef.current = { children, title, footer, ariaLabel, className };
    }
  });
  const content = open ? liveContent : contentRef.current;

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

    // Ref-count do scroll-lock via sheetStack: trava no 0->1, restaura no 1->0.
    // Empilhar um sheet sobre outro nao re-trava nem destrava cedo demais.
    if (sheetStack.length === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    sheetStack.push(sheetToken);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // So o sheet do TOPO responde ao ESC (nao fecha o de baixo junto).
      if (sheetStack[sheetStack.length - 1] !== sheetToken) return;
      event.preventDefault();
      void requestDismissRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = sheetStack.lastIndexOf(sheetToken);
      if (index !== -1) sheetStack.splice(index, 1);
      if (sheetStack.length === 0) {
        document.body.style.overflow = savedBodyOverflow;
      }
    };
  }, [visible, sheetToken]);

  // Body class `is-bottom-sheet-open` (esconde tabbar mobile). Atrelada a
  // `isOpen` (intencao do user), NAO a `visible` (presenca no DOM).
  // Assim quando o user fecha, a classe sai imediatamente e a tabbar
  // comeca a reaparecer EM PARALELO com o slide-down do sheet — em vez
  // de "popar" apenas no fim da animacao (que parecia bug de carregamento).
  useEffect(() => {
    if (!isOpen) return;

    // Ref-count: a classe entra no 0->1 e sai no 1->0, pra fechar um sheet
    // empilhado nao reexibir a tabbar enquanto o de baixo segue aberto.
    if (openIntentCount === 0) {
      document.body.classList.add('is-bottom-sheet-open');
    }
    openIntentCount += 1;
    // Defesa contra is-keyboard-open ficando presa: se user abriu o sheet
    // com teclado ainda aberto (focusout pode nao disparar em todos os fluxos
    // iOS standalone), a classe ficaria ativa apos o sheet fechar, deixando
    // a tabbar escondida indefinidamente. Como o focus-trap do sheet move o
    // foco pra dentro dele, o teclado fecha — limpamos a classe pra
    // garantir estado consistente.
    document.body.classList.remove('is-keyboard-open');

    return () => {
      openIntentCount -= 1;
      if (openIntentCount <= 0) {
        openIntentCount = 0;
        document.body.classList.remove('is-bottom-sheet-open');
      }
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
    // Sheet empilhado (modo stacked) delega a history ao overlay-pai — nao
    // injeta entry propria (evita back-button confuso com 2 entries iguais).
    if (stacked) return;
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
      // So o sheet do TOPO responde ao back (nao fecha o de baixo enquanto um
      // sheet empilhado esta aberto por cima).
      if (sheetStack[sheetStack.length - 1] !== sheetToken) return;
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
  }, [open, stacked, sheetToken]);

  function handleTouchStart(event: React.TouchEvent) {
    if (!dragToDismiss || dragDisabled) return;
    // touchstart so eh anexado ao drag handle + header — touches em
    // body/footer nao chegam aqui, entao scrolls internos (dropdowns,
    // listas) funcionam sem interferencia do drag-to-dismiss.
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

  if (!visible || typeof document === 'undefined') return null;

  // translate3d mantem GPU layer permanente, previne scroll lock em iOS
  // Safari standalone PWA (mesmo padrao do antigo ProfileBottomSheet).
  const sheetTransform = dragOffset > 0 ? `translate3d(0, ${dragOffset}px, 0)` : undefined;

  // Portal pro document.body: o sheet e position: fixed e precisa escapar do
  // contexto de empilhamento de onde o componente esta montado. Sem isso, um
  // BottomSheet renderizado dentro do header de uma pagina (ex: HeaderAvatarMenu)
  // fica preso ATRAS do conteudo da pagina. Mesmo motivo do portal no MobileTabbar.
  return createPortal(
    <div
      className={`bottom-sheet-backdrop${isOpen ? ' is-open' : ''}${stacked ? ' is-stacked' : ''}`}
      onClick={() => void requestDismiss()}
    >
      <section
        ref={focusTrapRef}
        className={`bottom-sheet${content.className ? ` ${content.className}` : ''}${isOpen ? ' is-open' : ''}${isOpen && dragOffset > 0 ? ' is-dragging' : ''}${stacked ? ' is-stacked' : ''}`}
        style={{
          ...(isOpen && dragOffset > 0 ? { transform: sheetTransform } : null),
          // Conteudo congelado durante o close fica inerte: evita clique
          // fantasma num botao do footer antigo (ex: "Avancar"/"Criar liga")
          // nos 350ms do slide-down.
          ...(isOpen ? null : { pointerEvents: 'none' as const }),
        }}
        onClick={(event) => event.stopPropagation()}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label={content.ariaLabel}
      >
        {dragToDismiss ? (
          <div
            className="bottom-sheet-drag-handle"
            aria-hidden="true"
            onTouchStart={handleTouchStart}
          >
            <span className="bottom-sheet-drag-handle-bar" />
          </div>
        ) : null}

        <header className="bottom-sheet-header" onTouchStart={handleTouchStart}>
          <h3 className="bottom-sheet-title" aria-live="polite">
            {content.title}
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

        <div className="bottom-sheet-body">{content.children}</div>

        {content.footer ? <div className="bottom-sheet-footer">{content.footer}</div> : null}
      </section>
    </div>,
    document.body
  );
}
