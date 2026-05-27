'use client';

// Liga B1.3 (Liga F1.0 + F1.C): FAB radial que substitui o "+" simples
// na pagina /samples. Dois modos:
//
// - 'idle': mostra "+". Tap abre um drawer glass que parece sair de
//   DENTRO do FAB — o drawer fica em z=49 (FAB em z=50) e sobrepoe o
//   topo do FAB pelo proprio border-radius, fazendo o corpo retangular
//   do drawer preencher os corner-cutouts do FAB. Visualmente os dois
//   formam uma unica pill continua: bottom corners do FAB + body reto
//   + top corners do drawer. Animacao via clip-path: inset(100% -> 0)
//   revela o drawer de baixo pra cima, parecendo emergir do FAB.
//   Simultaneamente o "+" do FAB gira 45° virando "×". Fechamento
//   reverte ambos (clip volta a 100% + icone gira de volta).
//
// - 'blendArrow' (Liga F1.1 + F1.D): substitui "+" por seta direita ->.
//   Disabled (opacity 40% + cursor not-allowed) quando selectedCount < 2.
//   Tap habilitado dispara onContinue. Cabeado em B1.4 (modo selecao).
//
// CSS em app/globals.css: .fab-menu-card (glass + clip-path reveal),
// .fab-menu-option (icone grande + label), .fab-radial-backdrop
// (capta tap-fora), .cv2-fab.is-expanded (rotacao do icone). Reusa
// tokens existentes (--brand-green, .cv2-fab).

import { useEffect, useRef, useState } from 'react';

type MenuAction = 'unit' | 'blend';

type SampleCreateRadialFabProps =
  | {
      mode: 'idle';
      onCreateUnit: () => void;
      onStartBlendSelection: () => void;
      disabled?: boolean;
    }
  | {
      mode: 'blendArrow';
      selectedCount: number;
      onContinue: () => void;
    };

const TOOLTIP_BLEND_DISABLED = 'Selecione pelo menos 2 amostras';
// Duracao do fechamento — precisa bater com a transition do clip-path
// no `.fab-menu-card` (sem `.is-open`). Veja globals.css.
const CLOSE_ANIMATION_MS = 320;

export function SampleCreateRadialFab(props: SampleCreateRadialFabProps) {
  // State machine de duas variaveis:
  // - mounted: drawer existe no DOM (true durante abertura, aberto e fechamento).
  // - open: classe `.is-open` aplicada — dispara a transition pra revelar o drawer
  //         e a rotacao 45° do icone do FAB simultaneamente.
  // Pattern duplo-RAF em openMenu garante que o paint inicial (mounted=true,
  // open=false → drawer com clip-path: inset(100% 0 0 0)) aconteca ANTES de
  // setOpen(true), pra que a transition CSS dispare corretamente.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pulsingOption, setPulsingOption] = useState<MenuAction | null>(null);
  // Guard contra taps rapidos em sequencia: depois que uma acao e
  // disparada, ignora outros taps ate o pulse terminar + cleanup.
  const actionFiredRef = useRef(false);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);

  function openMenu() {
    // Se vier de um fechamento em andamento, cancela o unmount pendente
    // e reabre — a transition do clip-path interpola suavemente do estado
    // atual (mid-close) pro aberto.
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
    if (props.mode !== 'idle' || !open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [open, props.mode]);

  // Cleanup de timers/RAFs no unmount.
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openRafRef.current) cancelAnimationFrame(openRafRef.current);
    };
  }, []);

  if (props.mode === 'blendArrow') {
    const isDisabled = props.selectedCount < 2;
    return (
      <button
        type="button"
        className={`cv2-fab is-blend-arrow${isDisabled ? ' is-disabled' : ''}`}
        aria-label={
          isDisabled ? TOOLTIP_BLEND_DISABLED : `Continuar com ${props.selectedCount} amostras`
        }
        title={isDisabled ? TOOLTIP_BLEND_DISABLED : undefined}
        onClick={() => {
          if (!isDisabled) props.onContinue();
        }}
        disabled={isDisabled}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>
    );
  }

  // Mode 'idle'
  const handleMainTap = () => {
    if (props.disabled) return;
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
      if (action === 'unit') {
        // NewSampleModal abre e seu backdrop cobre o drawer enquanto
        // ele fecha em paralelo — sem jank visual.
        props.onCreateUnit();
        actionFiredRef.current = false;
      } else {
        // Mode troca pra 'blendArrow' e o early return do component
        // desmontaria o drawer instantaneamente. Espera o close
        // animation completar antes pra que o user veja a transicao.
        setTimeout(() => {
          props.onStartBlendSelection();
          actionFiredRef.current = false;
        }, CLOSE_ANIMATION_MS);
      }
    }, 130);
  };

  const handleBackdropTap = () => {
    if (actionFiredRef.current) return;
    closeMenu();
  };

  // Classe is-expanded no FAB acompanha o `open` — quando o user pede
  // pra fechar (open=false), a rotacao reverte simultaneamente com o
  // clip-path do drawer. mounted&&open == drawer aberto.
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
          aria-label="Opções de criação"
          aria-hidden={!open}
        >
          <button
            type="button"
            className={`fab-menu-option${pulsingOption === 'unit' ? ' is-pulsing' : ''}`}
            aria-label="Nova amostra"
            role="menuitem"
            onClick={() => handleOptionTap('unit')}
          >
            <svg
              className="fab-menu-option-icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              {/* Grao de cafe: oval levemente rotacionado (-18°) + crease
                  S-shape ao longo do eixo longo. */}
              <g transform="rotate(-18 12 12)">
                <path d="M12 3c-3.9 0-6 4-6 9s2.1 9 6 9 6-4 6-9-2.1-9-6-9z" />
                <path d="M14.5 5.5c-3 4-3 9 0 13" />
              </g>
            </svg>
            <span className="fab-menu-option-label">Amostra</span>
          </button>

          <div className="fab-menu-option-separator" aria-hidden="true" />

          <button
            type="button"
            className={`fab-menu-option${pulsingOption === 'blend' ? ' is-pulsing' : ''}`}
            aria-label="Nova liga"
            role="menuitem"
            onClick={() => handleOptionTap('blend')}
          >
            <svg
              className="fab-menu-option-icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              <path d="M6 4v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V4" />
              <path d="M10 14v6" />
              <path d="M14 14v6" />
            </svg>
            <span className="fab-menu-option-label">Liga</span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`cv2-fab${fabIsExpanded ? ' is-expanded' : ''}`}
        aria-label={open ? 'Fechar opções de criação' : 'Criar nova amostra'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={handleMainTap}
        disabled={props.disabled}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
    </>
  );
}
