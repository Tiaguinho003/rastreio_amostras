'use client';

// FAB radial da pagina /informe do COMERCIAL. Usa o mesmo LEQUE (speed-dial)
// da pagina /samples (.fab-fan-*): 2 opcoes circulares emergem do FAB em arco
// — Visitas ACIMA (posicao is-lote) e Relatorio A ESQUERDA (posicao
// is-aprovacao). Ao abrir, o FAB encolhe e fica circular, a pagina escurece
// (scrim no tier de modal) e a tabbar escurece (body.is-fab-fan-*). Diferenca
// visual vs Lotes: o FAB MANTEM o icone LAPIS — a variante .is-informe-fab faz
// crossfade lapis <-> x (em vez da rotacao 45 do "+").
//
// State machine (mounted/open + duplo-RAF + pulse) espelha
// components/samples/SampleCreateRadialFab — MANTER EM SINCRONIA.
//
// CSS em globals.css: .fab-fan-backdrop, .fab-fan, .fab-fan-option
// (.is-lote / .is-aprovacao), .fab-fan-option-circle/-label/-icon, body
// is-fab-fan-mounted/-open, e o crossfade .cv2-fab.is-informe-fab. As vars
// --fab-*/--fan-* do arco vivem em `.samples-page-v2.informe-commercial-page`.

import { useEffect, useRef, useState } from 'react';

type MenuAction = 'visit' | 'weekly';

interface InformeCreateRadialFabProps {
  onCreateVisit: () => void;
  onCreateWeeklyReport: () => void;
  disabled?: boolean;
}

// Duracao do fechamento — bate com a transition de transform do
// `.fab-fan-option` (sem `.is-open`) no globals.css, pra o unmount esperar a
// animacao de "recolher pra dentro do FAB" terminar.
const CLOSE_ANIMATION_MS = 360;

export function InformeCreateRadialFab({
  onCreateVisit,
  onCreateWeeklyReport,
  disabled,
}: InformeCreateRadialFabProps) {
  // mounted: leque existe no DOM (abertura, aberto e fechamento).
  // open: classe `.is-open` — dispara as transitions (opcoes emergem do FAB,
  // scrim faz fade-in, FAB encolhe). Duplo-RAF garante o paint colapsado antes
  // do setOpen(true). Ver SampleCreateRadialFab.
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

  // Escape fecha o expandido.
  useEffect(() => {
    if (!open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [open]);

  // Escurece a tabbar (portalada no body, fora da isolation do shell, entao o
  // scrim nao a cobre por z-index) enquanto o leque esta montado/aberto — mesmo
  // mecanismo do SampleCreateRadialFab. mounted => pointer-events:none (taps na
  // tabbar caem no scrim e fecham); open => brightness (sai junto com o scrim).
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

  // Cleanup de timers/RAFs no unmount.
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
      // O sheet do formulario abre e seu backdrop cobre o leque enquanto
      // ele fecha em paralelo — sem jank visual.
      if (action === 'visit') {
        onCreateVisit();
      } else {
        onCreateWeeklyReport();
      }
      actionFiredRef.current = false;
    }, 130);
  };

  const handleBackdropTap = () => {
    if (actionFiredRef.current) return;
    closeMenu();
  };

  // is-expanded acompanha `open` — ao fechar, o FAB cresce de volta e lapis↔×
  // junto com o leque.
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
        <div className="fab-fan" role="menu" aria-label="Opções de formulário" aria-hidden={!open}>
          {/* Visitas — acima do FAB (posicao is-lote do arco) */}
          <button
            type="button"
            className={`fab-fan-option is-lote${open ? ' is-open' : ''}${
              pulsingOption === 'visit' ? ' is-pulsing' : ''
            }`}
            aria-label="Nova visita"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => handleOptionTap('visit')}
          >
            <span className="fab-fan-option-label">Visitas</span>
            <span className="fab-fan-option-circle">
              <svg
                className="fab-fan-option-icon"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                {/* Prancheta com check — visita registrada. */}
                <rect x="5.5" y="4" width="13" height="17" rx="2.2" />
                <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
                <path d="m9 13.5 2.3 2.3 4.4-5" />
              </svg>
            </span>
          </button>

          {/* Relatório — à esquerda do FAB (posicao is-aprovacao do arco) */}
          <button
            type="button"
            className={`fab-fan-option is-aprovacao${open ? ' is-open' : ''}${
              pulsingOption === 'weekly' ? ' is-pulsing' : ''
            }`}
            aria-label="Relatório semanal"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => handleOptionTap('weekly')}
          >
            <span className="fab-fan-option-label">Relatório</span>
            <span className="fab-fan-option-circle">
              <svg
                className="fab-fan-option-icon"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                {/* Calendario — relatorio da semana. */}
                <rect x="4" y="5" width="16" height="16" rx="2.2" />
                <path d="M8 3v4" />
                <path d="M16 3v4" />
                <path d="M4 10.5h16" />
              </svg>
            </span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`cv2-fab is-informe-fab${fabIsExpanded ? ' is-expanded' : ''}`}
        aria-label={open ? 'Fechar opções de formulário' : 'Novo formulário'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={handleMainTap}
        disabled={disabled}
      >
        {/* Dois icones empilhados (crossfade lapis <-> x no CSS, no lugar da
            rotacao 45 herdada do "+"). */}
        <svg
          className="informe-fab-icon-pencil"
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
        <svg
          className="informe-fab-icon-close"
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      </button>
    </>
  );
}
