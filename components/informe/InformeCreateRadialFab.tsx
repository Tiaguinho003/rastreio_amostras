'use client';

// FAB radial da pagina /informe do COMERCIAL — copy-adapt do
// SampleCreateRadialFab (apenas o modo idle; comentario cruzado: manter a
// state machine em sincronia com components/samples/SampleCreateRadialFab).
// Diferencas: icone LAPIS no estado fechado (variante .is-informe-fab faz
// crossfade lapis <-> x em vez da rotacao 45 do "+") e as duas opcoes do
// drawer sao "Visitas" e "Relatorio".
//
// CSS reutilizado de globals.css: .fab-menu-card (glass + clip-path
// reveal), .fab-menu-option, .fab-radial-backdrop, .cv2-fab.

import { useEffect, useRef, useState } from 'react';

type MenuAction = 'visit' | 'weekly';

interface InformeCreateRadialFabProps {
  onCreateVisit: () => void;
  onCreateWeeklyReport: () => void;
  disabled?: boolean;
}

// Duracao do fechamento — precisa bater com a transition do clip-path
// no `.fab-menu-card` (sem `.is-open`). Veja globals.css.
const CLOSE_ANIMATION_MS = 320;

export function InformeCreateRadialFab({
  onCreateVisit,
  onCreateWeeklyReport,
  disabled,
}: InformeCreateRadialFabProps) {
  // State machine de duas variaveis (mounted no DOM / open com .is-open),
  // com duplo-RAF na abertura — ver SampleCreateRadialFab.
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
      // O sheet do formulario abre e seu backdrop cobre o drawer enquanto
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

  const fabIsExpanded = mounted && open;

  return (
    <>
      {mounted && open && (
        <div className="fab-radial-backdrop" onPointerDown={handleBackdropTap} aria-hidden="true" />
      )}

      {mounted && (
        <div
          className={`fab-menu-card${open ? ' is-open' : ''}`}
          role="menu"
          aria-label="Opções de formulário"
          aria-hidden={!open}
        >
          <button
            type="button"
            className={`fab-menu-option${pulsingOption === 'visit' ? ' is-pulsing' : ''}`}
            aria-label="Nova visita"
            role="menuitem"
            onClick={() => handleOptionTap('visit')}
          >
            <svg
              className="fab-menu-option-icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              {/* Prancheta com check — visita registrada. */}
              <rect x="5.5" y="4" width="13" height="17" rx="2.2" />
              <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
              <path d="m9 13.5 2.3 2.3 4.4-5" />
            </svg>
            <span className="fab-menu-option-label">Visitas</span>
          </button>

          <div className="fab-menu-option-separator" aria-hidden="true" />

          <button
            type="button"
            className={`fab-menu-option${pulsingOption === 'weekly' ? ' is-pulsing' : ''}`}
            aria-label="Relatório semanal"
            role="menuitem"
            onClick={() => handleOptionTap('weekly')}
          >
            <svg
              className="fab-menu-option-icon"
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
            <span className="fab-menu-option-label">Relatório</span>
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
        {/* Dois icones empilhados (crossfade lapis <-> x no CSS, no lugar
            da rotacao 45 herdada do "+"). */}
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
