'use client';

// Liga B1.3 (Liga F1.0 + F1.C): FAB radial que substitui o "+" simples
// na pagina /samples. Dois modos:
//
// - 'idle': mostra "+". Tap expande um card glass (vidro embacado) que
//   emerge de dentro do FAB com transform-origin bottom + spring easing.
//   O card tem largura do FAB e duas opcoes empilhadas (Unidade / Liga),
//   cada uma com icone + label. Tap em opcao faz pulse rapido + close +
//   dispara acao. Tap fora do FAB/card (backdrop) fecha sem acao.
//
// - 'blendArrow' (Liga F1.1 + F1.D): substitui "+" por seta direita ->.
//   Disabled (opacity 40% + cursor not-allowed) quando selectedCount < 2.
//   Tap habilitado dispara onContinue. Cabeado em B1.4 (modo selecao).
//
// CSS em app/globals.css: .fab-menu-card (glass + spring emerge),
// .fab-menu-option (icone grande + label), .fab-radial-backdrop
// (capta tap-fora). Reusa tokens existentes (--brand-green, .cv2-fab).

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

export function SampleCreateRadialFab(props: SampleCreateRadialFabProps) {
  const [expanded, setExpanded] = useState(false);
  const [pulsingOption, setPulsingOption] = useState<MenuAction | null>(null);
  // Guard contra taps rapidos em sequencia: depois que uma acao e
  // disparada, ignora outros taps ate o pulse terminar + cleanup.
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

  const handleOptionTap = (action: MenuAction) => {
    if (actionFiredRef.current) return; // race protection
    actionFiredRef.current = true;
    setPulsingOption(action);
    pulseTimeoutRef.current = setTimeout(() => {
      setPulsingOption(null);
      setExpanded(false);
      // Dispara a acao so DEPOIS do pulse pra UX feel mais suave.
      if (action === 'unit') props.onCreateUnit();
      else props.onStartBlendSelection();
      // Reset guard pra proxima abertura.
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
        <div className="fab-menu-card" role="menu" aria-label="Opções de criação">
          <button
            type="button"
            className={`fab-menu-option${pulsingOption === 'unit' ? ' is-pulsing' : ''}`}
            aria-label="Nova amostra unidade"
            role="menuitem"
            onClick={() => handleOptionTap('unit')}
          >
            <svg
              className="fab-menu-option-icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              <rect x="4" y="6" width="16" height="14" rx="2" />
              <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
            <span className="fab-menu-option-label">Unidade</span>
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
