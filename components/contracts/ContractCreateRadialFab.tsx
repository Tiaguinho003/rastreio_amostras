'use client';

// FAB radial da página /contratos. Usa o MESMO leque (speed-dial) da página
// /samples (.cv2-fab + .fab-fan-*): 3 opções circulares emergem do FAB em arco
// — Mercado à vista ACIMA (posição is-lote), Espelho de Corretagem na DIAGONAL
// (posição is-liga) e Futuro À ESQUERDA (posição is-aprovacao). O Espelho NÃO
// cria contrato: entra no modo de SELEÇÃO (Fase E, D76). Ao abrir, o FAB
// encolhe/fica circular, a página escurece
// (scrim) e a tabbar escurece (body.is-fab-fan-*). Usa o "+" (rotaciona 45° →
// "×"), igual ao de Amostras — sem o crossfade lápis do /informe.
//
// State machine (mounted/open + duplo-RAF + pulse) espelha
// components/samples/SampleCreateRadialFab — MANTER EM SINCRONIA.
//
// CSS em globals.css: .fab-fan-backdrop, .fab-fan, .fab-fan-option (.is-lote /
// .is-aprovacao), .fab-fan-option-circle/-label/-icon, body is-fab-fan-*. As
// vars --fab-*/--fan-* do arco vivem em `.clients-page-v2.ctr-page`.

import { useEffect, useRef, useState } from 'react';

type MenuAction = 'spot' | 'future' | 'espelho';

interface ContractCreateRadialFabProps {
  onCreateSpot: () => void;
  onCreateFuture: () => void;
  onCreateEspelho: () => void;
  disabled?: boolean;
}

// Duração do fechamento — bate com a transition de transform do
// `.fab-fan-option` (sem `.is-open`) no globals.css.
const CLOSE_ANIMATION_MS = 360;

export function ContractCreateRadialFab({
  onCreateSpot,
  onCreateFuture,
  onCreateEspelho,
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
      } else if (action === 'future') {
        onCreateFuture();
      } else {
        onCreateEspelho();
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
        <div className="fab-fan" role="menu" aria-label="Tipo de contrato" aria-hidden={!open}>
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

          {/* Espelho de Corretagem — diagonal (posicao is-liga do arco). NAO cria
              contrato: dispara o modo de selecao (Fase E). */}
          <button
            type="button"
            className={`fab-fan-option is-liga${open ? ' is-open' : ''}${
              pulsingOption === 'espelho' ? ' is-pulsing' : ''
            }`}
            aria-label="Espelho de Corretagem"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => handleOptionTap('espelho')}
          >
            <span className="fab-fan-option-label">Espelho</span>
            <span className="fab-fan-option-circle">
              <svg
                className="fab-fan-option-icon"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                {/* Documento/demonstrativo de comissao. */}
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <path d="M9 8h6M9 12h6M9 16h3" />
              </svg>
            </span>
          </button>

          {/* Futuro — à esquerda do FAB (posicao is-aprovacao do arco) */}
          <button
            type="button"
            className={`fab-fan-option is-aprovacao${open ? ' is-open' : ''}${
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
