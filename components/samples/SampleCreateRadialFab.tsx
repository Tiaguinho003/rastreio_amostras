'use client';

// Liga B1.3 (Liga F1.0 + F1.C): FAB radial que substitui o "+" simples
// na pagina /samples. Dois modos:
//
// - 'idle': mostra "+". Tap expande backdrop transparente + 2 satelites
//   (Unidade / Liga) em arco com slide+fade. Tap em satelite faz pulse
//   rapido + close + dispara acao. Tap fora do FAB/satelites (backdrop)
//   fecha sem acao.
//
// - 'blendArrow' (Liga F1.1 + F1.D): substitui "+" por seta direita ->.
//   Disabled (opacity 40% + cursor not-allowed) quando selectedCount < 2.
//   Tap habilitado dispara onContinue. Sera cabeado em B1.4 (modo selecao).
//
// CSS em app/globals.css reutiliza tokens existentes (--brand-green,
// .cv2-fab base, easing cubic-bezier(0.34, 1.56, 0.64, 1)).

import { useEffect, useRef, useState } from 'react';

type SatelliteAction = 'unit' | 'blend';

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

export function SampleCreateRadialFab(props: SampleCreateRadialFabProps) {
  const [expanded, setExpanded] = useState(false);
  const [pulsingSatellite, setPulsingSatellite] = useState<SatelliteAction | null>(null);
  // Guard contra taps rápidos em sequência: depois que uma ação é
  // disparada, ignora outros taps até o pulse terminar + cleanup.
  const actionFiredRef = useRef(false);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Escape fecha o expandido.
  useEffect(() => {
    if (props.mode !== 'idle' || !expanded) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false);
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [expanded, props.mode]);

  // Cleanup do timeout do pulse no unmount.
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
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
    setExpanded((prev) => !prev);
  };

  const handleSatelliteTap = (action: SatelliteAction) => {
    if (actionFiredRef.current) return; // race protection
    actionFiredRef.current = true;
    setPulsingSatellite(action);
    pulseTimeoutRef.current = setTimeout(() => {
      setPulsingSatellite(null);
      setExpanded(false);
      // Dispara a ação só DEPOIS do pulse pra UX feel mais suave.
      if (action === 'unit') props.onCreateUnit();
      else props.onStartBlendSelection();
      // Reset guard pra próxima abertura.
      actionFiredRef.current = false;
    }, 150);
  };

  const handleBackdropTap = () => {
    if (actionFiredRef.current) return;
    setExpanded(false);
  };

  return (
    <>
      {expanded && (
        <div className="fab-radial-backdrop" onPointerDown={handleBackdropTap} aria-hidden="true" />
      )}

      {expanded && (
        <>
          <button
            type="button"
            className={`fab-radial-satellite is-pos-unit${pulsingSatellite === 'unit' ? ' is-pulsing' : ''}`}
            aria-label="Nova amostra unidade"
            role="menuitem"
            onClick={() => handleSatelliteTap('unit')}
          >
            <span className="fab-radial-satellite-label">Unidade</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="6" width="16" height="14" rx="2" />
              <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
          </button>

          <button
            type="button"
            className={`fab-radial-satellite is-pos-blend${pulsingSatellite === 'blend' ? ' is-pulsing' : ''}`}
            aria-label="Nova liga"
            role="menuitem"
            onClick={() => handleSatelliteTap('blend')}
          >
            <span className="fab-radial-satellite-label">Liga</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 4v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V4" />
              <path d="M10 14v6" />
              <path d="M14 14v6" />
            </svg>
          </button>
        </>
      )}

      <button
        type="button"
        className="cv2-fab"
        aria-label={expanded ? 'Fechar opções de criação' : 'Criar nova amostra'}
        aria-expanded={expanded}
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
