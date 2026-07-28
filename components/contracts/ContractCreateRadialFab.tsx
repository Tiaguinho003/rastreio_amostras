'use client';

// FAB radial da página /contratos — a porta de criação do MOBILE (no desktop ele
// some: criar mora nos botões do `.fv-page-head`, RC-F6). Usa o MESMO leque
// (speed-dial) da /samples (.cv2-fab + .fab-fan-*): DUAS opções circulares
// emergem do FAB — Mercado à vista ACIMA (is-lote) e Futuro À ESQUERDA (is-liga
// sob `.is-fan-2`, que joga o par nos dois eixos). Ao abrir, o FAB encolhe/fica
// circular, a página escurece (scrim) e a tabbar escurece (body.is-fab-fan-*).
// Usa o "+" (rotaciona 45° → "×"), igual ao de Amostras.
//
// RC-F6: a 3ª opção (Espelho de Corretagem) SAIU. Ela era a única que não criava
// nada — ligava um modo de seleção (D76, revogada). O espelho nasce agora só
// dentro do Detalhes do contrato.
//
// State machine (mounted/open + duplo-RAF + pulse) espelha
// components/samples/SampleCreateRadialFab — MANTER EM SINCRONIA.
//
// CSS em globals.css: .fab-fan-backdrop, .fab-fan(.is-fan-2), .fab-fan-option
// (.is-lote / .is-liga), .fab-fan-option-circle/-label/-icon, body is-fab-fan-*.
// As vars --fab-*/--fan-* do arco vivem em `.clients-page-v2.ctr-page`.

import { useEffect, useRef, useState } from 'react';

type MenuAction = 'spot' | 'future';

interface ContractCreateRadialFabProps {
  onCreateSpot: () => void;
  onCreateFuture: () => void;
  disabled?: boolean;
}

// Duração do fechamento — bate com a transition de transform do
// `.fab-fan-option` (sem `.is-open`) no globals.css.
const CLOSE_ANIMATION_MS = 360;

export function ContractCreateRadialFab({
  onCreateSpot,
  onCreateFuture,
  disabled,
}: ContractCreateRadialFabProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pulsingOption, setPulsingOption] = useState<MenuAction | null>(null);
  const actionFiredRef = useRef(false);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);

  function openMenu() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setMounted(true);
    if (openRafRef.current) cancelAnimationFrame(openRafRef.current);
    openRafRef.current = requestAnimationFrame(() => {
      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = null;
        setOpen(true);
      });
    });
  }

  function closeMenu() {
    if (openRafRef.current) {
      cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }
    setOpen(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setMounted(false);
      closeTimerRef.current = null;
    }, CLOSE_ANIMATION_MS);
  }

  useEffect(() => {
    if (!open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    document.body.classList.add('is-fab-fan-mounted');
    return () => document.body.classList.remove('is-fab-fan-mounted');
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('is-fab-fan-open');
    return () => document.body.classList.remove('is-fab-fan-open');
  }, [open]);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openRafRef.current) cancelAnimationFrame(openRafRef.current);
    };
  }, []);

  const handleMainTap = () => {
    if (disabled) return;
    if (open) closeMenu();
    else openMenu();
  };

  const handleOptionTap = (action: MenuAction) => {
    if (actionFiredRef.current) return; // race protection
    actionFiredRef.current = true;
    setPulsingOption(action);
    pulseTimeoutRef.current = setTimeout(() => {
      setPulsingOption(null);
      closeMenu();
      if (action === 'spot') {
        onCreateSpot();
      } else {
        onCreateFuture();
      }
      actionFiredRef.current = false;
    }, 130);
  };

  const handleBackdropTap = () => {
    if (actionFiredRef.current) return;
    closeMenu();
  };

  const fabIsExpanded = mounted && open;

  return (
    <>
      {mounted && (
        <div
          className={`fab-fan-backdrop${open ? ' is-open' : ''}`}
          onPointerDown={handleBackdropTap}
          aria-hidden="true"
        />
      )}

      {mounted && (
        /* `is-fan-2`: o arco base foi desenhado para TRES opcoes (90°/45°/0°).
           Com o Espelho fora sao duas — o par vai para os dois eixos (uma ACIMA,
           outra A ESQUERDA), cada uma alinhada a um lado do FAB, em vez de ficar
           amontoada num quadrante com um buraco. Mesmo tratamento da /samples. */
        <div
          className="fab-fan is-fan-2"
          role="menu"
          aria-label="Tipo de contrato"
          aria-hidden={!open}
        >
          {/* Mercado à vista — acima do FAB (posicao is-lote do arco) */}
          <button
            type="button"
            className={`fab-fan-option is-lote${open ? ' is-open' : ''}${
              pulsingOption === 'spot' ? ' is-pulsing' : ''
            }`}
            aria-label="Novo contrato — Mercado à vista"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => handleOptionTap('spot')}
          >
            <span className="fab-fan-option-label">À vista</span>
            <span className="fab-fan-option-circle">
              <svg
                className="fab-fan-option-icon"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                {/* Cédula — pagamento à vista. */}
                <rect x="3" y="7" width="18" height="10" rx="2" />
                <circle cx="12" cy="12" r="2.4" />
              </svg>
            </span>
          </button>

          {/* Futuro — à esquerda do FAB (is-liga sob `.is-fan-2` = eixo horizontal) */}
          <button
            type="button"
            className={`fab-fan-option is-liga${open ? ' is-open' : ''}${
              pulsingOption === 'future' ? ' is-pulsing' : ''
            }`}
            aria-label="Novo contrato — Futuro"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => handleOptionTap('future')}
          >
            <span className="fab-fan-option-label">Futuro</span>
            <span className="fab-fan-option-circle">
              <svg
                className="fab-fan-option-icon"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                {/* Relógio — contrato futuro. */}
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
            </span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`cv2-fab${fabIsExpanded ? ' is-expanded' : ''}`}
        aria-label={open ? 'Fechar opções de contrato' : 'Novo contrato'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={handleMainTap}
        disabled={disabled}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    </>
  );
}
